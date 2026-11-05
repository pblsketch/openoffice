/**
 * Export and print, the main-process side.
 *
 * The renderer draws the map: the picture of the current sheet as PNG bytes
 * or as one self-contained SVG document, the page for PDF and print as one
 * self-contained HTML document, and the outline as text. This side asks where
 * to put the file (unless Save As already asked: `grantSaveAsExport`), writes
 * it with the atomic writer, and turns the page into a PDF or hands it to the
 * system's print dialog in a hidden window of its own.
 *
 * That window loads nothing from anywhere. The page carries its own content
 * policy (no scripts, pictures only from `data:`), the window runs in a session
 * of its own that refuses every address that is not the page file or a
 * `data:` address, and the page itself is written by the renderer from the map
 * on screen, with the file's text as text and pictures from inside the file
 * only. So a map that points at a picture on the web asks for nothing while it
 * is exported or printed.
 *
 * PDF and print are one landscape A4 page: the renderer fits the map to it,
 * and this side asks for exactly that page size.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, app, dialog, ipcMain, session } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import {
  configuredDefaultSaveDir,
  printHtmlDocument,
  saveAsSuggestion,
  showSaveDialogWithMemory,
  type PrintDialogWindow,
} from '@genoffice/electron-utils'
import { atomicWriteFile } from './atomic-write'
import { tm } from './i18n-main'
import { MINDMAP_CHANNELS } from '../shared/ipc'
import type { ExportResult, PrintResult } from '../shared/ipc'

/** What each kind of export is saved as. The format names are the formats' own and are not translated. */
export const EXPORT_KINDS = {
  png: { extension: '.png', filter: 'PNG' },
  svg: { extension: '.svg', filter: 'SVG' },
  pdf: { extension: '.pdf', filter: 'PDF' },
  markdown: { extension: '.md', filter: 'Markdown' },
} as const

export type ExportKind = keyof typeof EXPORT_KINDS

/** The session the export and print windows run in: nothing of the app's, and nothing from outside. */
export const EXPORT_PARTITION = 'mindmap-export'

/** A page larger than this is no map page this editor wrote. */
const MAX_PAGE_CHARS = 200 * 1024 * 1024
/** An outline larger than this is no outline of a map that opened. */
const MAX_OUTLINE_CHARS = 64 * 1024 * 1024
/** A picture larger than this is no picture of one sheet this editor drew. */
const MAX_PNG_BYTES = 512 * 1024 * 1024

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** What an SVG file written here starts with. */
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n'

/** A suggested name as a file name: no path characters, not too long, never empty. */
export function exportFileBase(name: unknown): string {
  const base = [...(typeof name === 'string' ? name : '')]
    .map((char) => (/[/\\:*?"<>|]/.test(char) || char.charCodeAt(0) < 0x20 ? '_' : char))
    .join('')
    .slice(0, 80)
    .trim()
    // a name of dots alone is no name on Windows
    .replace(/^\.+$/, '')
  return base || tm('untitledFile')
}

/** The path picked in the dialog, with the extension of the kind added when it does not end with it already. */
export function withExportExtension(path: string, kind: ExportKind): string {
  const { extension } = EXPORT_KINDS[kind]
  return extname(path).toLowerCase() === extension ? path : `${path}${extension}`
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.byteLength > PNG_SIGNATURE.length && PNG_SIGNATURE.every((b, i) => bytes[i] === b)
}

/**
 * The picture of a sheet as this editor's renderer writes it (`snapshotSvg`):
 * one SVG element from start to end, and no script anywhere. A `<` in text or
 * an attribute is escaped by the serializer, so `<script` can only be an
 * element. Pictures in it are `data:` addresses already: the copy keeps no
 * other source (`snapshot.ts`).
 */
export function isMapSvg(text: unknown): text is string {
  if (typeof text !== 'string' || text.length > MAX_PAGE_CHARS) return false
  return (
    text.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') &&
    text.endsWith('</svg>') &&
    !/<script\b/i.test(text)
  )
}

/** Bytes as they arrive over IPC: a typed array, a buffer, or nothing usable. */
function bytesOf(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return null
}

function fieldOf(request: unknown, name: string): unknown {
  return typeof request === 'object' && request !== null
    ? (request as Record<string, unknown>)[name]
    : undefined
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface ExportIpcOptions {
  /** the file the view's map is saved in, if any: the dialog starts in its folder */
  filePathOf(webContentsId: number): string | undefined
}

/** Where the user wants the export, or null when the dialog was cancelled. */
async function pickTarget(
  e: IpcMainInvokeEvent,
  kind: ExportKind,
  suggestedName: unknown,
  options: ExportIpcOptions,
): Promise<string | null> {
  const { extension, filter } = EXPORT_KINDS[kind]
  const win =
    BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined
  const picked = await showSaveDialogWithMemory(
    dialog,
    win,
    {
      defaultPath: saveAsSuggestion(
        options.filePathOf(e.sender.id),
        `${exportFileBase(suggestedName)}${extension}`,
      ),
      filters: [{ name: filter, extensions: [extension.slice(1)] }],
    },
    configuredDefaultSaveDir(app),
  )
  if (picked.canceled || !picked.filePath) return null
  return withExportExtension(picked.filePath, kind)
}

/** Paths Save As picked for an export, per view: that one path, once, for that one kind. */
const saveAsGrants = new Map<number, { kind: ExportKind; path: string }>()

/**
 * Save As › an export type: the dialog has run, so the export the renderer
 * sends next for this view may write `path` without asking again. Null drops it.
 */
export function grantSaveAsExport(
  webContentsId: number,
  grant: { kind: ExportKind; path: string } | null,
): void {
  if (grant) saveAsGrants.set(webContentsId, grant)
  else saveAsGrants.delete(webContentsId)
}

/**
 * Where the export goes: the path Save As granted, taken once and only when it
 * is exactly that path for this kind; without one, the export's own dialog.
 */
async function targetOf(
  e: IpcMainInvokeEvent,
  kind: ExportKind,
  request: unknown,
  options: ExportIpcOptions,
): Promise<string | null> {
  const given = fieldOf(request, 'path')
  if (given === undefined) return pickTarget(e, kind, fieldOf(request, 'suggestedName'), options)
  const grant = saveAsGrants.get(e.sender.id)
  if (typeof given !== 'string' || !grant || grant.kind !== kind || grant.path !== given) {
    throw new Error('mindmap: this export path was not picked in Save As')
  }
  saveAsGrants.delete(e.sender.id)
  return given
}

let blockerInstalled = false

/** The temp page files an export window is loading right now, as path keys. */
const pageFiles = new Set<string>()

function pathKey(path: string): string {
  const full = resolve(path)
  return process.platform === 'win32' ? full.toLowerCase() : full
}

/** Lets the export session load this one page file, until the returned function is called. */
export function allowPageFile(path: string): () => void {
  const key = pathKey(path)
  pageFiles.add(key)
  return () => pageFiles.delete(key)
}

/** A `data:` address, or exactly a page file being loaded; no other file, share or host. */
export function exportRequestAllowed(url: string): boolean {
  if (/^data:/i.test(url)) return true
  if (!/^file:/i.test(url)) return false
  try {
    return pageFiles.has(pathKey(fileURLToPath(url)))
  } catch {
    return false
  }
}

/**
 * The export session refuses every request that is not the page file or a
 * `data:` address. Installed once, before the first window of that session.
 */
function exportSession(): Electron.Session {
  const own = session.fromPartition(EXPORT_PARTITION)
  if (!blockerInstalled) {
    blockerInstalled = true
    own.webRequest.onBeforeRequest((details, callback) => {
      const allowed = exportRequestAllowed(details.url)
      if (!allowed) console.warn('[mindmap] export window: refused a request')
      callback({ cancel: !allowed })
    })
  }
  return own
}

/** A hidden window for the page. Scripts stay on only where the print readiness probe needs them. */
function pageWindow(javascript: boolean): BrowserWindow {
  return new BrowserWindow({
    show: false,
    width: 1123,
    height: 794,
    autoHideMenuBar: true,
    webPreferences: { sandbox: true, javascript, session: exportSession() },
  })
}

/** The page as a one-page landscape A4 PDF. The page is loaded from a temp file: long pages truncate a `data:` address. */
export async function pageToPdf(html: string): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), 'genoffice-mindmap-pdf-'))
  let win: BrowserWindow | undefined
  const htmlPath = join(workDir, 'map.html')
  const release = allowPageFile(htmlPath)
  try {
    win = pageWindow(false)
    await writeFile(htmlPath, html, 'utf8')
    await win.loadFile(htmlPath)
    return await win.webContents.printToPDF({
      landscape: true,
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
    release()
    await rm(workDir, { recursive: true, force: true })
  }
}

/**
 * The window `printHtmlDocument` prints from, with the page size said to the
 * system dialog as well: landscape A4, as the page itself asks for.
 */
function printWindow(): PrintDialogWindow {
  const win = pageWindow(true)
  let release = (): void => {}
  return {
    loadFile: (path) => {
      release()
      release = allowPageFile(path)
      return win.loadFile(path)
    },
    webContents: {
      executeJavaScript: (script, userGesture) =>
        win.webContents.executeJavaScript(script, userGesture),
      print: (options, callback) =>
        win.webContents.print(
          { ...options, landscape: true, pageSize: 'A4', margins: { marginType: 'none' } },
          callback,
        ),
    },
    show: () => win.show(),
    focus: () => win.focus(),
    isDestroyed: () => win.isDestroyed(),
    destroy: () => {
      release()
      win.destroy()
    },
  }
}

let registered = false

/** Registers the export and print channels. Called with the editor's other channels. */
export function registerMindmapExportIpc(options: ExportIpcOptions): void {
  if (registered) return
  registered = true

  ipcMain.handle(MINDMAP_CHANNELS.exportPng, async (e, request: unknown): Promise<ExportResult> => {
    const bytes = bytesOf(fieldOf(request, 'bytes'))
    if (!bytes || !isPng(bytes) || bytes.byteLength > MAX_PNG_BYTES) {
      return { ok: false, error: 'mindmap: bad picture export request' }
    }
    try {
      const target = await targetOf(e, 'png', request, options)
      if (!target) return { ok: true, canceled: true }
      await atomicWriteFile(target, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
      return { ok: true, path: target }
    } catch (err) {
      return { ok: false, error: messageOf(err) }
    }
  })

  ipcMain.handle(MINDMAP_CHANNELS.exportSvg, async (e, request: unknown): Promise<ExportResult> => {
    const svg = fieldOf(request, 'svg')
    if (!isMapSvg(svg)) return { ok: false, error: 'mindmap: bad SVG export request' }
    try {
      const target = await targetOf(e, 'svg', request, options)
      if (!target) return { ok: true, canceled: true }
      await atomicWriteFile(target, Buffer.from(`${XML_DECLARATION}${svg}`, 'utf8'))
      return { ok: true, path: target }
    } catch (err) {
      return { ok: false, error: messageOf(err) }
    }
  })

  ipcMain.handle(MINDMAP_CHANNELS.exportPdf, async (e, request: unknown): Promise<ExportResult> => {
    const html = fieldOf(request, 'html')
    if (typeof html !== 'string' || html === '' || html.length > MAX_PAGE_CHARS) {
      return { ok: false, error: 'mindmap: bad PDF export request' }
    }
    try {
      const target = await targetOf(e, 'pdf', request, options)
      if (!target) return { ok: true, canceled: true }
      await atomicWriteFile(target, await pageToPdf(html))
      return { ok: true, path: target }
    } catch (err) {
      return { ok: false, error: messageOf(err) }
    }
  })

  ipcMain.handle(
    MINDMAP_CHANNELS.exportMarkdown,
    async (e, request: unknown): Promise<ExportResult> => {
      const text = fieldOf(request, 'text')
      if (typeof text !== 'string' || text.length > MAX_OUTLINE_CHARS) {
        return { ok: false, error: 'mindmap: bad outline export request' }
      }
      try {
        const target = await targetOf(e, 'markdown', request, options)
        if (!target) return { ok: true, canceled: true }
        await atomicWriteFile(target, Buffer.from(text, 'utf8'))
        return { ok: true, path: target }
      } catch (err) {
        return { ok: false, error: messageOf(err) }
      }
    },
  )

  ipcMain.handle(MINDMAP_CHANNELS.print, async (_e, request: unknown): Promise<PrintResult> => {
    const html = fieldOf(request, 'html')
    if (typeof html !== 'string' || html === '' || html.length > MAX_PAGE_CHARS) {
      return { ok: false, error: 'mindmap: bad print request' }
    }
    return printHtmlDocument({
      html,
      window: printWindow(),
      fileName: 'map.html',
      dirPrefix: 'genoffice-mindmap-print-',
    })
  })
}
