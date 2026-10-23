/**
 * The main-process side of the drawing editor.
 *
 * The drawing itself lives in the renderer: the engine opens the bytes there
 * and produces the bytes to save. This side reads and writes the file, keeps
 * what each view may touch, looks up the pictures a note points at and opens
 * web links.
 *
 * Decided here and not left to the renderer:
 *
 * - A file that did not open as `ok` is never written. A path is a save target
 *   only after this side has opened the file's bytes with the engine itself
 *   and seen `ok`. A view made for a path starts without a save target
 *   (`unopenedByWc`); until its file has opened here, and for good once it
 *   failed to, every way to save from it is refused. Bytes a save brings are
 *   opened the same way, in the view's format, before they replace a file.
 * - A save never changes a file's format: a note stays a note, a plain
 *   `.excalidraw` file stays one, whatever the renderer sends.
 * - Pictures are read only from the note's vault folder (`embedded.ts`).
 * - A link is opened only after `safeExternalUrl`, and only from here.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { BrowserWindow, WebContentsView, app, dialog, ipcMain, shell } from 'electron'
import type { WebContents } from 'electron'
import {
  RENDERER_SCHEME,
  configuredDefaultSaveDir,
  confirmOverwriteIfConflicted,
  contextMenuLabels,
  installContextMenu,
  installNavigationGuard,
  installRendererProtocol,
  isPathOpenElsewhere,
  recordDiskState,
  registerRendererScheme,
  shouldDeferAutoSave,
  showSaveDialogWithMemory,
} from '@genoffice/electron-utils'
import type { SaveDiskState } from '@genoffice/electron-utils'
import { getUiLang, normalizeLang, setUiLang } from '@genoffice/i18n'
import { drawingFormatOfPath, isDrawingPath, openDrawing } from '@genoffice/excalidraw-engine'
import type { DrawingFormat } from '@genoffice/excalidraw-engine'
import { atomicWriteFile } from './atomic-write'
import { MAX_REFS, readEmbeddedPictures } from './embedded'
import { tm } from './i18n-main'
import { NOTE_EXTENSION, SCENE_EXTENSION, withDrawingExtension } from './save-name'
import { APP_CHANNELS, EXCALIDRAW_CHANNELS } from '../shared/ipc'
import { openableLink } from '../shared/links'
import type {
  DrawingMenuCommand,
  EmbeddedPicture,
  OpenFileResult,
  PendingOpen,
  SaveDrawingResult,
  SaveMode,
} from '../shared/ipc'

interface RuntimePaths {
  preloadPath: string
  /** the renderer's dev server, when one runs */
  rendererUrl?: string
  rendererFile?: string
}

let runtime: RuntimePaths = { preloadPath: '' }

export function configureExcalidrawRuntime(paths: RuntimePaths): void {
  runtime = paths
}

/** Open path per view, queued at tab creation; the renderer consumes it after mount.
 * Kept until the view is destroyed so a reload consumes it again. */
const openPathByWc = new Map<number, string>()
/** File paths granted to each view: opening and saving only allow these */
const allowedByWc = new Map<number, Set<string>>()
/** Current save target per view; absent = untitled drawing, or a file this side has not seen open */
const savePathByWc = new Map<number, string>()
/** The format each view's drawing is in, set when it opens and never changed by a save */
const formatByWc = new Map<number, DrawingFormat>()
/**
 * Views made for a file that this side has not seen open as `ok`: not asked
 * for yet (`pending`) or asked for and not opened (`failed`). Nothing is ever
 * written for a view in here, to any path. A view for a new drawing is never in.
 */
const unopenedByWc = new Map<number, 'pending' | 'failed'>()

function mayWrite(wcId: number): boolean {
  return !unopenedByWc.has(wcId)
}
/** Unsaved-changes flags mirrored from the renderer; drives the save prompt before closing a tab/window */
const dirtyByWc = new Set<number>()
const closeSaveWaiters = new Map<number, (ok: boolean) => void>()
/** Resolvers for menu-triggered saves, resolved when the renderer's save invoke completes */
const saveWaiters = new Map<number, (ok: boolean) => void>()

// ── Split-copy save guard (decision 0036): remember the disk state of every
// read and write per view and path, so that while the same drawing is open in
// two panes a save can see the sibling pane's write.
const docDiskStates = new Map<number, Map<string, SaveDiskState>>()

async function rememberDiskState(wcId: number, path: string): Promise<void> {
  const state = await recordDiskState(path)
  if (!state) return
  const states = docDiskStates.get(wcId) ?? new Map<string, SaveDiskState>()
  states.set(path, state)
  docDiskStates.set(wcId, states)
}

function forgetDiskState(wcId: number, path: string): void {
  const states = docDiskStates.get(wcId)
  if (!states) return
  states.delete(path)
  if (states.size === 0) docDiskStates.delete(wcId)
}

/** True when this save must stop instead of writing: the sibling copy changed
 *  the disk since this view's last read or write, and either the automatic
 *  save defers or the user chose to keep the disk copy. */
async function conflictStopsSave(
  contents: WebContents,
  path: string,
  auto: boolean,
): Promise<boolean> {
  if (!isPathOpenElsewhere(path)) return false
  const recorded = docDiskStates.get(contents.id)?.get(path)
  if (auto) return shouldDeferAutoSave(path, recorded)
  return (
    (await confirmOverwriteIfConflicted({
      parent: BrowserWindow.fromWebContents(contents),
      path,
      recorded,
      lang: getUiLang(),
    })) === 'cancel'
  )
}

/** Fired after a save lands on a NEW path (untitled first save / Save As): the shell syncs tab title, recents, projects */
let fileSavedHook: ((wc: WebContents, path: string) => void) | null = null

export function setExcalidrawFileSavedHook(hook: (wc: WebContents, path: string) => void): void {
  fileSavedHook = hook
}

export function excalidrawIsDirty(webContentsId: number): boolean {
  return dirtyByWc.has(webContentsId)
}

export function excalidrawFilePath(webContentsId: number): string | undefined {
  return savePathByWc.get(webContentsId)
}

/** The file was renamed on disk: re-grant the new path and tell the renderer */
export function excalidrawFileRenamed(
  contents: WebContents,
  oldPath: string,
  newPath: string,
): void {
  const wcId = contents.id
  if (savePathByWc.get(wcId) === oldPath) savePathByWc.set(wcId, newPath)
  if (openPathByWc.get(wcId) === oldPath) openPathByWc.set(wcId, newPath)
  const allowed = allowedByWc.get(wcId)
  if (allowed?.has(oldPath)) allowed.add(newPath)
  const states = docDiskStates.get(wcId)
  const recorded = states?.get(oldPath)
  if (states && recorded) {
    states.delete(oldPath)
    states.set(newPath, recorded)
  }
  if (!contents.isDestroyed()) contents.send(EXCALIDRAW_CHANNELS.fileRenamed, newPath)
}

/**
 * Close guard: true means proceed with closing. Clean → true; dirty →
 * Save / Don't Save / Cancel. On Save, ask the renderer to produce the bytes
 * and write them, and await the result; a canceled untitled-save dialog keeps
 * the tab open.
 */
export async function requestExcalidrawClose(
  contents: WebContents,
  parent?: BrowserWindow | null,
): Promise<boolean> {
  // no drawing, nothing to save: a view whose file did not open closes without a question
  if (!mayWrite(contents.id)) return true
  if (!dirtyByWc.has(contents.id) || contents.isDestroyed()) return true
  const options = {
    type: 'warning' as const,
    message: tm('closeUnsavedMsg'),
    detail: tm('closeUnsavedDetail'),
    buttons: [tm('btnSave'), tm('btnDontSave'), tm('btnCancel')],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  }
  const { response } =
    parent && !parent.isDestroyed()
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options)
  if (response === 2) return false
  if (response === 1) return true
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      closeSaveWaiters.delete(contents.id)
      resolve(false)
    }, 120_000)
    closeSaveWaiters.set(contents.id, (ok) => {
      clearTimeout(timer)
      resolve(ok)
    })
    contents.send(EXCALIDRAW_CHANNELS.closeSaveRequest)
  })
}

/** Menu Save / Save As: ask the renderer to produce the bytes and save; clean views resolve true immediately on plain save */
export function requestExcalidrawSave(contents: WebContents, mode: SaveMode): Promise<boolean> {
  if (contents.isDestroyed() || !mayWrite(contents.id)) return Promise.resolve(false)
  if (mode === 'save' && !dirtyByWc.has(contents.id) && savePathByWc.has(contents.id)) {
    return Promise.resolve(true)
  }
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      saveWaiters.delete(contents.id)
      resolve(false)
    }, 120_000)
    saveWaiters.set(contents.id, (ok) => {
      clearTimeout(timer)
      resolve(ok)
    })
    contents.send(EXCALIDRAW_CHANNELS.saveRequest, mode)
  })
}

/** Menu commands that need no answer: undo, redo and zoom. */
export function sendExcalidrawMenuCommand(
  contents: WebContents,
  command: DrawingMenuCommand,
): void {
  if (!contents.isDestroyed()) contents.send(EXCALIDRAW_CHANNELS.menuCommand, command)
}

function fileNameBase(name: string | undefined): string {
  return (name ?? '')
    .replace(/[/\\:*?"<>|]/g, '_')
    .slice(0, 80)
    .trim()
}

async function resolveSaveTarget(
  e: Electron.IpcMainInvokeEvent,
  mode: SaveMode,
  format: DrawingFormat,
  defaultName?: string,
): Promise<string | 'canceled'> {
  const current = savePathByWc.get(e.sender.id)
  if (mode === 'save' && current) return current
  const win =
    BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined
  const extension = format === 'json' ? SCENE_EXTENSION : NOTE_EXTENSION
  const defaultPath = current
    ? join(dirname(current), basename(current))
    : join(
        configuredDefaultSaveDir(app),
        `${fileNameBase(defaultName) || tm('untitledFile')}${extension}`,
      )
  const filters =
    format === 'json'
      ? [{ name: tm('filterScene'), extensions: ['excalidraw'] }]
      : [{ name: tm('filterNote'), extensions: ['md'] }]
  const picked = await showSaveDialogWithMemory(dialog, win, {
    title: tm('dlgSaveTitle'),
    defaultPath,
    filters,
  })
  if (picked.canceled || !picked.filePath) return 'canceled'
  return withDrawingExtension(picked.filePath, format)
}

/** Bytes as they arrive over IPC: a typed array, a buffer, or nothing usable. */
function bytesOf(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  return null
}

/** Picture references as they arrive over IPC: only id and target strings, at most `MAX_REFS`. */
function refsOf(value: unknown): Array<{ fileId: string; target: string }> {
  const refs = (value as { refs?: unknown } | null)?.refs
  if (!Array.isArray(refs)) return []
  return refs
    .filter(
      (ref): ref is { fileId: string; target: string } =>
        typeof ref?.fileId === 'string' && typeof ref?.target === 'string',
    )
    .slice(0, MAX_REFS)
    .map(({ fileId, target }) => ({ fileId, target }))
}

let ipcRegistered = false

function registerExcalidrawIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle(EXCALIDRAW_CHANNELS.consumePending, (e): PendingOpen | null => {
    const path = openPathByWc.get(e.sender.id)
    return path ? { path, format: drawingFormatOfPath(path) } : null
  })

  ipcMain.handle(
    EXCALIDRAW_CHANNELS.openFile,
    async (e, path: unknown): Promise<OpenFileResult> => {
      const wcId = e.sender.id
      if (typeof path !== 'string' || !allowedByWc.get(wcId)?.has(path)) {
        throw new Error('excalidraw: path not granted to this view')
      }
      let bytes: Uint8Array
      try {
        bytes = new Uint8Array(await readFile(path))
      } catch {
        refuseWrites(wcId)
        return { status: 'unreadable' }
      }
      const format = drawingFormatOfPath(path)
      const opened = openDrawing(bytes, format)
      if (opened.status !== 'ok') {
        console.warn(`[excalidraw] the file did not open (${opened.status}): ${opened.detail}`)
        refuseWrites(wcId)
        return { status: opened.status }
      }
      // Seen open, here: only now is the path a save target.
      unopenedByWc.delete(wcId)
      savePathByWc.set(wcId, path)
      formatByWc.set(wcId, format)
      await rememberDiskState(wcId, path)
      return { status: 'ok', bytes, format }
    },
  )

  ipcMain.handle(
    EXCALIDRAW_CHANNELS.readEmbedded,
    async (e, request: unknown): Promise<EmbeddedPicture[]> => {
      // only a note this side has seen open has a folder to look in
      const notePath = savePathByWc.get(e.sender.id)
      if (!notePath || formatByWc.get(e.sender.id) !== 'markdown') return []
      try {
        return await readEmbeddedPictures(notePath, refsOf(request))
      } catch (err) {
        console.warn('[excalidraw] pictures could not be read:', err)
        return []
      }
    },
  )

  ipcMain.handle(
    EXCALIDRAW_CHANNELS.save,
    async (e, request: unknown): Promise<SaveDrawingResult> => {
      const wcId = e.sender.id
      const waiter = saveWaiters.get(wcId)
      saveWaiters.delete(wcId)
      const done = (result: SaveDrawingResult): SaveDrawingResult => {
        waiter?.(result.ok && !('canceled' in result))
        return result
      }
      if (!mayWrite(wcId)) {
        return done({ ok: false, error: 'excalidraw: the file did not open, nothing is written' })
      }
      const {
        bytes: rawBytes,
        mode: rawMode,
        format: rawFormat,
        defaultName,
      } = (request ?? {}) as {
        bytes?: unknown
        mode?: unknown
        format?: unknown
        defaultName?: unknown
      }
      const bytes = bytesOf(rawBytes)
      if (!bytes) return done({ ok: false, error: 'excalidraw: bad save request' })
      // A file keeps its format. A new drawing takes the one its renderer made.
      const known = formatByWc.get(wcId)
      const format: DrawingFormat | null =
        known ?? (rawFormat === 'markdown' || rawFormat === 'json' ? rawFormat : null)
      if (!format || (known && rawFormat !== known)) {
        return done({ ok: false, error: 'excalidraw: the drawing would change its format' })
      }
      // The bytes come from a renderer. They replace the user's file only when they are a drawing that opens.
      const check = openDrawing(bytes, format)
      if (check.status !== 'ok') {
        return done({
          ok: false,
          error: `excalidraw: refusing to write a file that would not open (${check.status})`,
        })
      }
      const mode: SaveMode = rawMode === 'saveAs' ? 'saveAs' : 'save'
      // Request input is untrusted: only an explicit automatic-save flag counts
      const auto = (request as { auto?: unknown } | null)?.auto === true
      if (mode === 'save') {
        const current = savePathByWc.get(wcId)
        if (current && (await conflictStopsSave(e.sender, current, auto))) {
          return done({ ok: false, error: 'external-modified' })
        }
      }
      try {
        const target = await resolveSaveTarget(
          e,
          mode,
          format,
          typeof defaultName === 'string' ? defaultName : undefined,
        )
        if (target === 'canceled') return done({ ok: true, canceled: true })
        const previousPath = savePathByWc.get(wcId)
        const isNewPath = previousPath !== target
        await atomicWriteFile(target, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
        savePathByWc.set(wcId, target)
        formatByWc.set(wcId, format)
        // keep the reload path in sync: a stale openPathByWc would make a
        // reloaded renderer load the OLD file and then save it over the new one
        openPathByWc.set(wcId, target)
        const allowed = allowedByWc.get(wcId) ?? new Set<string>()
        allowed.add(target)
        allowedByWc.set(wcId, allowed)
        dirtyByWc.delete(wcId)
        await rememberDiskState(wcId, target)
        if (previousPath && previousPath !== target) forgetDiskState(wcId, previousPath)
        if (isNewPath) fileSavedHook?.(e.sender, target)
        return done({ ok: true, path: target })
      } catch (err) {
        return done({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  ipcMain.handle(EXCALIDRAW_CHANNELS.openLink, async (_e, url: unknown): Promise<boolean> => {
    const target = openableLink(url)
    if (!target) return false
    try {
      await shell.openExternal(target)
      return true
    } catch (err) {
      console.warn('[excalidraw] the link could not be opened:', err)
      return false
    }
  })

  ipcMain.on(EXCALIDRAW_CHANNELS.dirtyChanged, (e, dirty: unknown) => {
    if (dirty === true && mayWrite(e.sender.id)) dirtyByWc.add(e.sender.id)
    else dirtyByWc.delete(e.sender.id)
  })

  ipcMain.on(EXCALIDRAW_CHANNELS.closeSaveResult, (e, ok: unknown) => {
    const waiter = closeSaveWaiters.get(e.sender.id)
    closeSaveWaiters.delete(e.sender.id)
    waiter?.(ok === true)
  })

  // safety net for menu saves the renderer declined without invoking save()
  ipcMain.on(EXCALIDRAW_CHANNELS.saveRequestAck, (e, ok: unknown) => {
    const waiter = saveWaiters.get(e.sender.id)
    saveWaiters.delete(e.sender.id)
    waiter?.(ok === true)
  })

  // Language channel shared with other modules; removeHandler tolerates duplicate registration
  ipcMain.removeHandler(APP_CHANNELS.getLanguage)
  ipcMain.handle(APP_CHANNELS.getLanguage, () => getUiLang())
}

/** The view's file did not open: it has no save target and gets none. */
function refuseWrites(wcId: number): void {
  unopenedByWc.set(wcId, 'failed')
  savePathByWc.delete(wcId)
  dirtyByWc.delete(wcId)
}

function grantAndTrack(wc: WebContents, openPath?: string | null): void {
  const wcId = wc.id
  if (openPath && existsSync(openPath)) {
    openPathByWc.set(wcId, openPath)
    allowedByWc.set(wcId, new Set([openPath]))
    // Not a save target yet: it becomes one when the open handler has seen the file open.
    unopenedByWc.set(wcId, 'pending')
  }
  // The drawing never opens a window or leaves its page. A link is opened by
  // the openLink handler, after safeExternalUrl; nothing else may reach the system.
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  wc.on('will-navigate', (event, url) => {
    if (url !== wc.getURL()) event.preventDefault()
  })
  wc.once('destroyed', () => {
    openPathByWc.delete(wcId)
    allowedByWc.delete(wcId)
    savePathByWc.delete(wcId)
    formatByWc.delete(wcId)
    unopenedByWc.delete(wcId)
    dirtyByWc.delete(wcId)
    docDiskStates.delete(wcId)
    closeSaveWaiters.get(wcId)?.(false)
    closeSaveWaiters.delete(wcId)
    saveWaiters.get(wcId)?.(false)
    saveWaiters.delete(wcId)
  })
}

/** The address the renderer is loaded from: the dev server when one runs, else the built files behind the app scheme. */
function excalidrawRendererUrl(): string {
  return runtime.rendererUrl ?? `${RENDERER_SCHEME}://excalidraw/index.html`
}

const VIEW_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
} as const

/** A drawing tab for the shell. `openPath` null or left out: a new, untitled drawing. */
export function createExcalidrawView(openPath?: string | null): WebContentsView {
  registerExcalidrawIpc()
  const view = new WebContentsView({
    webPreferences: { preload: runtime.preloadPath, ...VIEW_PREFERENCES },
  })
  grantAndTrack(view.webContents, openPath)
  void view.webContents.loadURL(excalidrawRendererUrl())
  return view
}

/** Standalone window mode: `npm run dev -w @genoffice/excalidraw`, a drawing path passed via argv */
export function startExcalidrawStandalone(): void {
  registerRendererScheme()
  installNavigationGuard(app)
  installContextMenu(app, () => contextMenuLabels(getUiLang()))
  configureExcalidrawRuntime({
    preloadPath: join(__dirname, '../preload/index.js'),
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    rendererFile: join(__dirname, '../renderer/index.html'),
  })
  // A scratch profile for scripted runs, the same variable the shell reads.
  if (process.env.GENOFFICE_USER_DATA) app.setPath('userData', process.env.GENOFFICE_USER_DATA)
  void app.whenReady().then(() => {
    // there is no shell to say which language the user picked
    setUiLang(normalizeLang(process.env.GENOFFICE_LANG ?? app.getLocale()))
    installRendererProtocol({ excalidraw: join(__dirname, '../renderer') })
    registerExcalidrawIpc()
    const win = new BrowserWindow({
      width: 1200,
      height: 850,
      webPreferences: { preload: runtime.preloadPath, ...VIEW_PREFERENCES },
    })
    const argPath = process.argv.slice(1).find((a) => isDrawingPath(a) && existsSync(a))
    grantAndTrack(win.webContents, argPath)
    void win.loadURL(excalidrawRendererUrl())
  })
  app.on('window-all-closed', () => app.quit())
}
