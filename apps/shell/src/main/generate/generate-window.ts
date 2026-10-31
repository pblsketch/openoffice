/**
 * The generate window ("make a new document from these files"): a small
 * separate BrowserWindow, a child of the shell window (or of whichever window
 * hosts the editor that opened it), so it shows above editor tabs — those are
 * views drawn over the shell's own page, which hides any overlay the shell page
 * could draw.
 *
 * One window at a time. Opening it again from another entry point starts over
 * with that entry's materials.
 *
 * Entry points:
 * - Home (Starred group, selection bar, file-row menu): the
 *   `generate:open-with-*` channels below.
 * - An editor's File menu (a later task): `openGenerateWindowForDocument`.
 *
 * The window never starts an AI run. "Make" opens a new untitled tab of the
 * chosen kind with the request queued for it (handoff.ts) and closes.
 */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { productName, type Lang } from '@genoffice/i18n'
import { safeExternalUrl } from '@genoffice/electron-utils'
import {
  GENERATE_CHANNELS,
  type AiTargetKind,
  type ConvertKind,
  type GenerateHandoff,
  type GenerateWindowState,
} from '../../shared/generate-api'
import { GENERATE_HOME_CHANNELS } from '../../shared/generate-home-channels'
import { generateText } from '../../renderer/src/i18n/strings-generate'
import { setGenerateTabIdResolver } from './handoff'
import { convertSource, markdownRedactionNotice, type ConvertedDocument } from './convert'
import { inspectMaterial, SUPPORTED_MATERIAL_EXTS } from './materials'
import { createOpenMaterials, type OpenMaterialsDeps } from './open-materials'
import { GenerateSession, type MaterialRef } from './session'
import { generateTitleBarOverlay } from './title-bar'
import type { NewDocumentOpener } from '../projects/new-documents'

export interface GenerateWindowDeps {
  /** the window the generate window sits above when the caller names none */
  parentWindow(): BrowserWindow | null
  lang(): Lang
  theme(): 'light' | 'dark' | 'system'
  /**
   * Open a new untitled tab of `handoff.target` with the request queued for
   * it (TabManager.openGenerateTargetTab). Throws when no tab could open.
   * `opener` is where the window was opened from: the new tab follows its
   * project (spec 6).
   */
  openTargetTab(handoff: GenerateHandoff, opener: NewDocumentOpener | null): void
  /**
   * 8.6: open a conversion's result as a new unsaved tab of its editor, with
   * the content queued for it and the conversion recorded
   * (TabManager.openConversionResult). Throws when no tab could open. Without
   * it, the window offers no conversion.
   */
  openConvertedTab?(doc: ConvertedDocument, opener: NewDocumentOpener | null): void
  /** every starred file in a Starred-view group */
  starredGroupPaths(group: string): string[]
  /** the shell tab id behind a webContents, for the run-started records */
  tabIdFor(webContentsId: number): string | undefined
  /** the open tabs and how to save one in place */
  openMaterials: OpenMaterialsDeps<WebContents>
}

let deps: GenerateWindowDeps | null = null
let win: BrowserWindow | null = null
let session: GenerateSession | null = null
/** where the open window was opened from (home or an editor window) */
let opener: NewDocumentOpener | null = null
let ipcRegistered = false

export function configureGenerateWindow(next: GenerateWindowDeps): void {
  deps = next
  setGenerateTabIdResolver((id) => next.tabIdFor(id))
  registerIpc()
}

function fromWindow(event: IpcMainInvokeEvent): boolean {
  return !!win && !win.isDestroyed() && event.sender === win.webContents
}

function pushState(state: GenerateWindowState): void {
  if (win && !win.isDestroyed()) win.webContents.send(GENERATE_CHANNELS.state, state)
}

function stringList(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((p): p is string => typeof p === 'string' && !!p && p.length <= 4096)
    : []
}

function registerIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle(GENERATE_CHANNELS.getState, (event) =>
    fromWindow(event) && session ? session.state() : null,
  )
  ipcMain.handle(GENERATE_CHANNELS.getTheme, (event) =>
    fromWindow(event) && deps ? deps.theme() : 'system',
  )
  ipcMain.handle(GENERATE_CHANNELS.setKind, (event, kind: unknown) => {
    if (fromWindow(event)) session?.setKind(kind)
  })
  ipcMain.handle(GENERATE_CHANNELS.setConvert, (event, kind: unknown) => {
    if (fromWindow(event)) session?.setConvert(kind)
  })
  ipcMain.handle(GENERATE_CHANNELS.addMaterials, async (event) => {
    if (!fromWindow(event) || !session || !win || !deps) return
    const lang = deps.lang()
    const result = await dialog.showOpenDialog(win, {
      title: generateText(lang, 'dialogAddTitle'),
      filters: [
        { name: generateText(lang, 'filterSupported'), extensions: [...SUPPORTED_MATERIAL_EXTS] },
      ],
      properties: ['openFile', 'multiSelections'],
    })
    if (!result.canceled) await session?.addPaths(result.filePaths)
  })
  ipcMain.handle(GENERATE_CHANNELS.removeMaterial, (event, key: unknown) => {
    if (fromWindow(event)) session?.remove(key)
  })
  ipcMain.handle(GENERATE_CHANNELS.saveMaterial, async (event, key: unknown) => {
    if (fromWindow(event)) await session?.save(key)
  })
  ipcMain.handle(GENERATE_CHANNELS.refresh, async (event) => {
    if (fromWindow(event)) await session?.refresh()
  })
  ipcMain.handle(GENERATE_CHANNELS.make, async (event, text: unknown): Promise<boolean> => {
    if (!fromWindow(event) || !session) return false
    return session.make(text)
  })
  ipcMain.handle(GENERATE_CHANNELS.cancel, (event) => {
    if (fromWindow(event)) closeGenerateWindow()
  })

  // Home's entry points. Only the shell window's own page (Home) may ask.
  const fromHome = (event: IpcMainInvokeEvent): boolean => {
    const parent = deps?.parentWindow()
    return !!parent && !parent.isDestroyed() && event.sender === parent.webContents
  }
  ipcMain.handle(GENERATE_HOME_CHANNELS.openWithPaths, (event, paths: unknown) => {
    if (!fromHome(event)) return
    openGenerateWindowWithPaths(stringList(paths))
  })
  ipcMain.handle(GENERATE_HOME_CHANNELS.openWithGroup, (event, group: unknown) => {
    if (!fromHome(event) || !deps || typeof group !== 'string' || !group) return
    openGenerateWindowWithPaths(deps.starredGroupPaths(group))
  })
}

function sessionFor(d: GenerateWindowDeps, refs: MaterialRef[], kind?: AiTargetKind) {
  const open = createOpenMaterials(d.openMaterials)
  return new GenerateSession(
    {
      lang: () => d.lang(),
      inspect: (path) => inspectMaterial(path),
      pathOfUntitled: (id) => open.pathOfUntitled(id),
      saveActionFor: (path) => open.saveActionFor(path),
      saveMaterial: (path) => open.saveMaterial(path),
      showUntitled: (id) => open.showUntitled(id),
      openTargetTab: (handoff) => d.openTargetTab(handoff, opener),
      // 8.6: conversions without AI, offered only when the shell can open their result
      ...(d.openConvertedTab
        ? {
            convert: (kind: ConvertKind, path: string) =>
              convertSource(kind, path, { untitled: generateText(d.lang(), 'untitled') }),
            openConvertedTab: (doc: ConvertedDocument) => d.openConvertedTab!(doc, opener),
            redactionNotice: (path: string) => markdownRedactionNotice(path),
          }
        : {}),
      push: pushState,
      close: () => closeGenerateWindow(),
      newId: () => randomUUID(),
      now: () => Date.now(),
    },
    { refs, ...(kind ? { kind } : {}) },
  )
}

/**
 * Open the window (or start the open one over) with these materials. `parent`
 * is the window it should sit above; the shell window when omitted.
 */
export function openGenerateWindow(init: {
  refs: MaterialRef[]
  kind?: AiTargetKind
  parent?: BrowserWindow | null
  /** the entry point's window (home or an editor); the new tab follows its project */
  opener?: NewDocumentOpener | null
}): void {
  const d = deps
  if (!d) throw new Error('the generate window is not configured')
  opener = init.opener ?? null
  if (win && !win.isDestroyed() && session && !session.isClosed) {
    void session.reset(init.refs, init.kind)
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    return
  }

  const current = sessionFor(d, init.refs, init.kind)
  session = current
  const lang = d.lang()
  const parent = init.parent ?? d.parentWindow()
  const next = new BrowserWindow({
    width: 560,
    height: 720,
    minWidth: 460,
    minHeight: 520,
    ...(parent && !parent.isDestroyed() ? { parent } : {}),
    show: false,
    center: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    backgroundColor: generateTitleBarOverlay(nativeTheme.shouldUseDarkColors).color,
    title: `${generateText(lang, 'windowTitle')} - ${productName(lang)}`,
    // Windows paints a native frame light even under a dark app theme; draw the
    // title band ourselves and let Electron theme only its caption buttons.
    // macOS native frames follow `nativeTheme`, so they are left alone.
    ...(process.platform === 'darwin'
      ? {}
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: generateTitleBarOverlay(nativeTheme.shouldUseDarkColors),
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/generate.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win = next
  next.removeMenu()
  // follow a theme switch while the window is open (nativeTheme fires 'updated')
  const refreshTitleBar = () => {
    if (next.isDestroyed() || process.platform === 'darwin') return
    try {
      next.setTitleBarOverlay(generateTitleBarOverlay(nativeTheme.shouldUseDarkColors))
    } catch {
      // the window was torn down between the check and the call
    }
  }
  nativeTheme.on('updated', refreshTitleBar)
  next.webContents.setWindowOpenHandler(({ url }) => {
    const target = safeExternalUrl(url)
    if (target) void shell.openExternal(target)
    return { action: 'deny' }
  })
  next.once('ready-to-show', () => next.show())
  // coming back from another window is when a material may have been saved there
  next.on('focus', () => {
    if (session === current) void current.refresh()
  })
  next.on('closed', () => {
    nativeTheme.off('updated', refreshTitleBar)
    if (win === next) {
      win = null
      opener = null
    }
    if (session === current) session = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void next.loadURL(`${process.env.ELECTRON_RENDERER_URL}/generate.html`)
  } else {
    void next.loadFile(join(__dirname, '../renderer/generate.html'))
  }
  void current.refresh()
}

/** Home: these files as the starting materials */
export function openGenerateWindowWithPaths(paths: string[], parent?: BrowserWindow | null): void {
  openGenerateWindow({ refs: paths.map((path) => ({ path })), parent, opener: { kind: 'home' } })
}

/**
 * An editor's File menu, "make another document from this one" (a later
 * task): the open document as the one starting material. A document never
 * saved has no `filePath`; it is listed as "save it first" and becomes a
 * normal material once its tab has a path.
 */
export function openGenerateWindowForDocument(doc: {
  webContentsId: number
  filePath?: string
  title: string
  parent?: BrowserWindow | null
}): void {
  const ref: MaterialRef = doc.filePath
    ? { path: doc.filePath }
    : { untitled: { webContentsId: doc.webContentsId, title: doc.title } }
  openGenerateWindow({
    refs: [ref],
    parent: doc.parent,
    opener: { kind: 'window', webContentsId: doc.webContentsId },
  })
}

export function closeGenerateWindow(): void {
  const current = win
  win = null
  session = null
  opener = null
  if (current && !current.isDestroyed()) current.close()
}

/** the generate window's webContents, when it is open (tests and diagnostics) */
export function generateWindowContents(): WebContents | null {
  return win && !win.isDestroyed() ? win.webContents : null
}
