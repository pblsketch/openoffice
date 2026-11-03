/**
 * Export and print of the diagram editor, on the main-process side (spec 5).
 *
 * The renderer makes the pictures with draw.io (PNG and SVG always in light
 * colors, light SVGs for PDF and print); this side asks
 * where to write, writes, and makes PDF and print sheets itself in a hidden
 * window of the diagram's session (the same request refusal applies), never
 * through draw.io's print dialog.
 *
 * File names: one page goes to the chosen name; several pages go next to it
 * as `<name>-p<page number>.<ext>`, the other editors' per-page naming. Files
 * that already exist are replaced only after the person agrees.
 */
import { existsSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { pageFilePaths } from './export-paths'
import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { configuredDefaultSaveDir, showSaveDialogWithMemory } from '@genoffice/electron-utils'
import { PRINT_READY_SCRIPT } from '@genoffice/electron-utils/print-window'
import { atomicWriteFile } from '@genoffice/electron-utils/atomic-write'
import { BRIDGE_PREFIX, DRAWIO_ORIGIN } from '../shared/bridge-protocol'
import { DIAGRAM_CHANNELS } from '../shared/ipc'
import type {
  ExportImagesRequest,
  ExportPdfRequest,
  ExportResult,
  PrintDiagramRequest,
  PrintPage,
  PrintResult,
} from '../shared/ipc'
import { safeFileNameBase } from '../shared/formats'
import { tm } from './i18n-main'
import { DIAGRAM_PARTITION, isAllowedNavigation, windowOpenAction } from './network-guard'
import {
  buildPrintHtml,
  dropPrintDocument,
  holdPrintDocument,
  isPrintCancel,
  isPrintPage,
} from './print-document'

function bytesOf(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value))
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return null
}

const asBuffer = (bytes: Uint8Array): Buffer =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

/** Whether bytes a renderer sent are a picture of that format. */
export function looksLike(format: 'png' | 'svg', bytes: Uint8Array): boolean {
  if (format === 'png') return PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart()
  return head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!DOCTYPE svg')
}

function parentOf(contents: WebContents): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(contents) ?? BrowserWindow.getFocusedWindow() ?? undefined
}

async function confirmReplace(contents: WebContents, paths: readonly string[]): Promise<boolean> {
  const existing = paths.filter((path) => existsSync(path))
  if (existing.length === 0) return true
  const options = {
    type: 'warning' as const,
    message: tm('exportReplaceMsg', { count: existing.length }),
    detail: [tm('exportReplaceDetail'), ...existing.slice(0, 5).map((path) => basename(path))].join(
      '\n',
    ),
    buttons: [tm('btnReplace'), tm('btnCancel')],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  }
  const parent = parentOf(contents)
  const { response } = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options)
  return response === 0
}

function defaultExportPath(
  filePathOf: (wcId: number) => string | undefined,
  wcId: number,
  name: string,
  ext: string,
): string {
  const file = filePathOf(wcId)
  const dir = file ? dirname(file) : configuredDefaultSaveDir(app)
  return join(dir, `${safeFileNameBase(name) || tm('untitled')}.${ext}`)
}

/** A hidden window of the diagram's session showing the print document. */
async function printWindow(pages: readonly PrintPage[], title: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      partition: DIAGRAM_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const contents = win.webContents
  contents.setWindowOpenHandler(windowOpenAction)
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation({ url, isMainFrame: true, currentUrl: contents.getURL() })) {
      event.preventDefault()
    }
  })
  const token = holdPrintDocument(buildPrintHtml(pages, title))
  try {
    await win.loadURL(`${DRAWIO_ORIGIN}${BRIDGE_PREFIX}print/${token}`)
  } catch (err) {
    // a document that did not load leaves no hidden window behind
    if (!win.isDestroyed()) win.destroy()
    throw err
  } finally {
    dropPrintDocument(token)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    contents.executeJavaScript(PRINT_READY_SCRIPT, true),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 5_000)
    }),
  ]).catch(() => {})
  clearTimeout(timer)
  return win
}

/** The PDF of the pages, one sheet per page at each page's own size. */
export async function renderPdf(pages: readonly PrintPage[], title = ''): Promise<Uint8Array> {
  const win = await printWindow(pages, title)
  try {
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })
    return new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength)
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

async function printPages(pages: readonly PrintPage[], title: string): Promise<PrintResult> {
  const win = await printWindow(pages, title)
  try {
    // Windows attaches the native dialog to the printed window, which must be visible
    if (process.platform === 'win32') {
      win.show()
      win.focus()
    }
    const result = await new Promise<{ success: boolean; failureReason: string }>((resolve) => {
      win.webContents.print({ silent: false, printBackground: true }, (success, failureReason) =>
        resolve({ success, failureReason }),
      )
    })
    if (!result.success) {
      if (isPrintCancel(result.failureReason)) return { ok: true, canceled: true }
      return { ok: false, error: result.failureReason || 'the print job failed' }
    }
    return { ok: true }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

function printPagesOf(value: unknown): PrintPage[] | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isPrintPage)) return null
  return value
}

export interface DiagramExportIpcOptions {
  /** the view's file, for the folder the dialogs open in */
  filePathOf(webContentsId: number): string | undefined
}

/** Registers the export and print channels. Called once, with the editor's other channels. */
export function registerDiagramExportIpc(options: DiagramExportIpcOptions): void {
  ipcMain.handle(DIAGRAM_CHANNELS.exportImages, async (e, raw: unknown): Promise<ExportResult> => {
    const request = (raw ?? {}) as Partial<ExportImagesRequest>
    const format = request.format
    if (format !== 'png' && format !== 'svg') return { ok: false, error: 'bad export format' }
    const pages = Array.isArray(request.pages) ? request.pages : []
    const files: { number: number; bytes: Uint8Array }[] = []
    for (const page of pages) {
      const bytes = bytesOf(page?.bytes)
      if (!bytes || !Number.isSafeInteger(page.number) || page.number < 1) {
        return { ok: false, error: 'bad export page' }
      }
      if (!looksLike(format, bytes)) return { ok: false, error: `not a ${format} picture` }
      files.push({ number: page.number, bytes })
    }
    if (files.length === 0 || new Set(files.map((f) => f.number)).size !== files.length) {
      return { ok: false, error: 'bad export pages' }
    }
    const picked = await showSaveDialogWithMemory(dialog, parentOf(e.sender), {
      title: tm('dlgExportTitle'),
      defaultPath: defaultExportPath(
        options.filePathOf,
        e.sender.id,
        String(request.suggestedName ?? ''),
        format,
      ),
      filters: [{ name: tm(format === 'png' ? 'filterPng' : 'filterSvg'), extensions: [format] }],
    })
    if (picked.canceled || !picked.filePath) return { ok: true, canceled: true }
    const chosen =
      extname(picked.filePath).toLowerCase() === `.${format}`
        ? picked.filePath
        : `${picked.filePath}.${format}`
    // all pages: a file per page (a one-page diagram too); the page on screen: the chosen file
    const paths = pageFilePaths(
      chosen,
      format,
      files.map((f) => f.number),
      request.scope !== 'current',
    )
    // the dialog already asked about the one chosen name
    const unasked = paths.length !== 1 || paths[0] !== chosen
    if (unasked && !(await confirmReplace(e.sender, paths))) {
      return { ok: true, canceled: true }
    }
    try {
      for (const [index, file] of files.entries())
        await atomicWriteFile(paths[index]!, asBuffer(file.bytes))
      return { ok: true, paths }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(DIAGRAM_CHANNELS.exportPdf, async (e, raw: unknown): Promise<ExportResult> => {
    const request = (raw ?? {}) as Partial<ExportPdfRequest>
    const pages = printPagesOf(request.pages)
    if (!pages) return { ok: false, error: 'bad export pages' }
    const picked = await showSaveDialogWithMemory(dialog, parentOf(e.sender), {
      title: tm('dlgExportTitle'),
      defaultPath: defaultExportPath(
        options.filePathOf,
        e.sender.id,
        String(request.suggestedName ?? ''),
        'pdf',
      ),
      filters: [{ name: tm('filterPdf'), extensions: ['pdf'] }],
    })
    if (picked.canceled || !picked.filePath) return { ok: true, canceled: true }
    const target =
      extname(picked.filePath).toLowerCase() === '.pdf' ? picked.filePath : `${picked.filePath}.pdf`
    try {
      await atomicWriteFile(
        target,
        asBuffer(await renderPdf(pages, String(request.suggestedName ?? ''))),
      )
      return { ok: true, paths: [target] }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(DIAGRAM_CHANNELS.print, async (_e, raw: unknown): Promise<PrintResult> => {
    const request = (raw ?? {}) as Partial<PrintDiagramRequest>
    const pages = printPagesOf(request.pages)
    if (!pages) return { ok: false, error: 'bad print pages' }
    try {
      return await printPages(pages, String(request.title ?? ''))
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
