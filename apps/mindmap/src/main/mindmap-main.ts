/**
 * The main-process side of the mind map editor.
 *
 * The map itself lives in the renderer: the engine opens the bytes there,
 * reconciles every edit and produces the bytes to save. This side reads and
 * writes the file, keeps what each view may touch, and opens web links.
 *
 * Two things are decided here and not left to the renderer:
 *
 * - A file that did not open as `ok` is never written. A path is a save target
 *   only after this side has opened the file's bytes with the engine itself
 *   and seen `ok`. A view made for a path starts without a save target
 *   (`unopenedByWc`); until its file has opened here, and for good once it
 *   failed to, every way to save from it is refused: the save call, the menu,
 *   the close prompt and a save to a given path. What the renderer says or
 *   leaves out changes nothing. Bytes a save brings are opened the same way
 *   before they replace a file.
 * - A link is opened only after `safeExternalUrl`, and only from here. The
 *   view cannot open a window or navigate away.
 *
 * Crash-recovery copies (`recovery-main.ts`): the renderer hands over the
 * bytes a save would write, about every 30 seconds while the map has unsaved
 * changes; they are kept in the app data folder, never next to the file. A
 * file with a copy left over asks before its content is loaded, and a
 * restored map keeps the file as its save target. The editor registers its
 * `RecoveryEditorContract` when this module loads.
 *
 * The shell bundles this module and drives it through the exports below; a
 * standalone window (`startMindmapStandalone`) uses the same code.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
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
  registerRecoveryEditor,
  registerRendererScheme,
  shouldDeferAutoSave,
  showSaveDialogWithMemory,
} from '@genoffice/electron-utils'
import type {
  RecoveryIdentity,
  RecoveryOpenFileRequest,
  RecoveryOpenUntitledRequest,
  SaveDiskState,
} from '@genoffice/electron-utils'
import { getUiLang, normalizeLang, setUiLang } from '@genoffice/i18n'
import { openXmind } from '@genoffice/xmind-engine'
import { registerMindmapAiIpc } from './ai-attachments'
import { atomicWriteFile } from './atomic-write'
import { registerMindmapExportIpc } from './export-main'
import { registerMindmapHandoffIpc } from './handoff-main'
import { queueMindmapSeedFor, registerMindmapSeedIpc } from './seed-main'
import { tm } from './i18n-main'
import {
  resolveViewOpen,
  setViewOpenDecision,
  takeUntitledCopy,
  viewCrashed,
  viewDropped,
  viewFileRenamed,
  viewGone,
  viewRecoveryIdentity,
  viewRestoredUntitled,
  viewSaveAsDefault,
  viewSaved,
  writeViewCopy,
} from './recovery-main'
import { APP_CHANNELS, MINDMAP_CHANNELS } from '../shared/ipc'
import { openableLink } from '../shared/links'
import type {
  ExportFormat,
  MindmapMenuCommand,
  OpenFileResult,
  RecoveryCopyResult,
  SaveMindmapResult,
  SaveMode,
} from '../shared/ipc'

export { setMindmapProvisionalTitleHook } from './ai-attachments'
/** How long a tab that stays open after "Don't Save" takes no copy. */
export { DONT_SAVE_HOLD_MS as MINDMAP_DONT_SAVE_HOLD_MS } from './recovery-main'

/** The one extension a map is saved with. */
const MAP_EXTENSION = '.xmind'

interface RuntimePaths {
  preloadPath: string
  /** the renderer's dev server, when one runs */
  rendererUrl?: string
  rendererFile?: string
}

let runtime: RuntimePaths = { preloadPath: '' }

export function configureMindmapRuntime(paths: RuntimePaths): void {
  runtime = paths
}

/** Open path per view, queued at tab creation; the renderer consumes it after mount.
 * Kept until the view is destroyed so a reload consumes it again. */
const openPathByWc = new Map<number, string>()
/** File paths granted to each view: opening and saving only allow these */
const allowedByWc = new Map<number, Set<string>>()
/** Current save target per view; absent = untitled map, or a file this side has not seen open */
const savePathByWc = new Map<number, string>()
/**
 * Views made for a file that this side has not seen open as `ok`: not asked
 * for yet (`pending`) or asked for and not opened (`failed`). Nothing is ever
 * written for a view in here, to any path. A view for a new map is never in.
 */
const unopenedByWc = new Map<number, 'pending' | 'failed'>()

/** Whether anything may be written for this view. */
function mayWrite(wcId: number): boolean {
  return !unopenedByWc.has(wcId)
}
/** Unsaved-changes flags mirrored from the renderer; drives the save prompt before closing a tab/window */
const dirtyByWc = new Set<number>()
const closeSaveWaiters = new Map<number, (ok: boolean) => void>()
/** Resolvers for menu-triggered saves, resolved when the renderer's save invoke completes */
const saveWaiters = new Map<number, (ok: boolean) => void>()
/** Every live map view, for the copies the OS session end asks for */
const contentsByWc = new Map<number, WebContents>()
/** Copies asked for at the OS session end, resolved when the renderer reports it wrote one */
const copyNowWaiters = new Map<number, () => void>()
/** How long the OS session end waits for one view's copy */
const COPY_NOW_TIMEOUT_MS = 5000

// ── Split-copy save guard (decision 0036): remember the disk state of every
// read and write per view and path, so that while the same map is open in two
// panes a save can see the sibling pane's write. A manual save asks before
// overwriting it; an automatic save defers silently to the next manual one.
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

export function setMindmapFileSavedHook(hook: (wc: WebContents, path: string) => void): void {
  fileSavedHook = hook
}

/** The toolbar's "make another document from this one": the shell opens its make window for this view */
let makeFromDocumentHook: ((wc: WebContents) => void) | null = null

export function setMindmapMakeFromDocumentHook(hook: ((wc: WebContents) => void) | null): void {
  makeFromDocumentHook = hook
}

/** The tab title of an untitled map, recorded with its recovery copy: the shell knows it */
let recoveryTitleHook: ((wc: WebContents) => string | null | undefined) | null = null

export function setMindmapRecoveryTitleHook(
  hook: ((wc: WebContents) => string | null | undefined) | null,
): void {
  recoveryTitleHook = hook
}

/** The copy of this view was dropped and its tab is still open: ask the renderer for a fresh one. */
function copyAgain(contents: WebContents): () => void {
  return () => {
    if (!contents.isDestroyed()) contents.send(MINDMAP_CHANNELS.recoveryReset)
  }
}

export function mindmapIsDirty(webContentsId: number): boolean {
  return dirtyByWc.has(webContentsId)
}

export function mindmapFilePath(webContentsId: number): string | undefined {
  return savePathByWc.get(webContentsId)
}

/** The file was renamed on disk: re-grant the new path and tell the renderer */
export function mindmapFileRenamed(contents: WebContents, oldPath: string, newPath: string): void {
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
  void viewFileRenamed(wcId, oldPath, newPath)
  if (!contents.isDestroyed()) contents.send(MINDMAP_CHANNELS.fileRenamed, newPath)
}

/**
 * Close guard: true means proceed with closing. Clean → true; dirty →
 * Save / Don't Save / Cancel. On Save, ask the renderer to produce the bytes
 * and write them, and await the result; a canceled untitled-save dialog keeps
 * the tab open.
 */
export async function requestMindmapClose(
  contents: WebContents,
  parent?: BrowserWindow | null,
): Promise<boolean> {
  // no map, nothing to save: a view whose file did not open closes without a question
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
  if (response === 1) {
    // "Don't Save": the unsaved work is dropped, its recovery copy with it
    viewDropped(contents.id, copyAgain(contents))
    return true
  }
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      closeSaveWaiters.delete(contents.id)
      resolve(false)
    }, 120_000)
    closeSaveWaiters.set(contents.id, (ok) => {
      clearTimeout(timer)
      resolve(ok)
    })
    contents.send(MINDMAP_CHANNELS.closeSaveRequest)
  })
}

/** Menu Save / Save As: ask the renderer to produce the bytes and save; clean views resolve true immediately on plain save */
export function requestMindmapSave(contents: WebContents, mode: SaveMode): Promise<boolean> {
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
    contents.send(MINDMAP_CHANNELS.saveRequest, mode)
  })
}

/**
 * Save the live map to `filePath` with no dialog (the in-app MCP server's
 * "save before closing"). Pointing the view's save target at `filePath` first
 * keeps the save from opening the dialog, so the renderer's normal save runs
 * unattended.
 */
export function mindmapSaveToPath(contents: WebContents, filePath: string): Promise<void> {
  if (contents.isDestroyed()) return Promise.reject(new Error('the map is no longer open'))
  const wcId = contents.id
  if (!mayWrite(wcId)) {
    return Promise.reject(new Error('the file did not open, so there is no map to save'))
  }
  const previousPath = savePathByWc.get(wcId)
  const previousOpenPath = openPathByWc.get(wcId)
  savePathByWc.set(wcId, filePath)
  const allowed = allowedByWc.get(wcId) ?? new Set<string>()
  allowed.add(filePath)
  allowedByWc.set(wcId, allowed)
  return new Promise<void>((resolve, reject) => {
    const restore = (): void => {
      if (previousPath === undefined) savePathByWc.delete(wcId)
      else savePathByWc.set(wcId, previousPath)
      if (previousOpenPath === undefined) openPathByWc.delete(wcId)
      else openPathByWc.set(wcId, previousOpenPath)
    }
    const timer = setTimeout(() => {
      saveWaiters.delete(wcId)
      restore()
      reject(new Error('timed out saving the map'))
    }, 120_000)
    saveWaiters.set(wcId, (ok) => {
      clearTimeout(timer)
      if (ok) resolve()
      else {
        restore()
        reject(new Error('could not save the map'))
      }
    })
    contents.send(MINDMAP_CHANNELS.saveRequest, 'save')
  })
}

/**
 * A tool closes the map without saving (the in-app MCP server, the AI): the
 * unsaved work is dropped, and its recovery copy with it, as with "Don't Save".
 */
export function discardMindmapRecovery(contents: WebContents): void {
  viewDropped(contents.id, copyAgain(contents))
}

/**
 * The recovery copy this view writes (its file's, or its own untitled id's),
 * for the shell's session record and for reopening an untitled map whose
 * renderer crashed. Null for a view that is not a live map view.
 */
export function mindmapRecoveryIdentity(webContentsId: number): RecoveryIdentity | null {
  if (!contentsByWc.has(webContentsId)) return null
  return viewRecoveryIdentity(webContentsId, savePathByWc.get(webContentsId))
}

/**
 * The OS is ending the session: every map view with unsaved changes writes a
 * copy now, without any question. Resolves when each has answered or its
 * time ran out; never throws.
 */
export async function writeMindmapCopiesNow(timeoutMs = COPY_NOW_TIMEOUT_MS): Promise<void> {
  const waits: Promise<void>[] = []
  for (const [wcId, contents] of contentsByWc) {
    if (contents.isDestroyed() || !dirtyByWc.has(wcId) || !mayWrite(wcId)) continue
    waits.push(
      new Promise<void>((resolve) => {
        const finish = (): void => {
          clearTimeout(timer)
          if (copyNowWaiters.get(wcId) === finish) copyNowWaiters.delete(wcId)
          resolve()
        }
        const timer = setTimeout(finish, timeoutMs)
        copyNowWaiters.get(wcId)?.()
        copyNowWaiters.set(wcId, finish)
        try {
          contents.send(MINDMAP_CHANNELS.recoveryCopyNow)
        } catch {
          finish()
        }
      }),
    )
  }
  await Promise.all(waits)
}

/**
 * Open `filePath` in a map view the shell made, with the recovery question
 * already answered (launch list): `restore` loads the copy, the file staying
 * the save target; `original` loads the file without asking. Call it in the
 * tick the view is made with `createMindmapView(filePath)`; a view made for
 * another file (or none) is pointed at this one and loaded again.
 */
export function openMindmapFileWithDecision(
  contents: WebContents,
  request: RecoveryOpenFileRequest,
): void {
  registerMindmapIpc()
  const wcId = contents.id
  setViewOpenDecision(wcId, request.decision)
  if (openPathByWc.get(wcId) === request.filePath) return
  openPathByWc.set(wcId, request.filePath)
  allowedByWc.set(wcId, new Set([request.filePath]))
  unopenedByWc.set(wcId, 'pending')
  savePathByWc.delete(wcId)
  dirtyByWc.delete(wcId)
  if (!contents.isDestroyed()) contents.reload()
}

/**
 * Load a recovery copy into an untitled map view the shell made (call it in
 * the tick the view is made with `createMindmapView()`): the map opens unsaved,
 * its first save asks where (offering `saveAsDefaultPath` when given), and a
 * successful save deletes the copy.
 */
export function openMindmapUntitledCopy(
  contents: WebContents,
  request: RecoveryOpenUntitledRequest,
): void {
  registerMindmapIpc()
  const bytes = takeUntitledCopy(contents.id, request)
  if (bytes) queueMindmapSeedFor(contents, { bytes })
  else console.warn('[mindmap] the recovery copy could not be read')
}

registerRecoveryEditor({
  kind: 'mindmap',
  writeCopiesNow: () => writeMindmapCopiesNow(),
  openFileWithDecision: openMindmapFileWithDecision,
  openUntitledCopy: openMindmapUntitledCopy,
  // a password-protected map never opens here, so there is never a map without a safe copy
  isUnprotectable: () => false,
})

/** Menu commands that need no answer: undo, redo, zoom and the like. */
export function sendMindmapMenuCommand(contents: WebContents, command: MindmapMenuCommand): void {
  if (!contents.isDestroyed()) contents.send(MINDMAP_CHANNELS.menuCommand, command)
}

/** Shell menu export entry: the renderer draws the map and runs the export flow */
export function sendMindmapExportRequest(contents: WebContents, format: ExportFormat): void {
  if (!contents.isDestroyed()) contents.send(MINDMAP_CHANNELS.exportRequest, format)
}

/** Shell menu Print: the renderer builds what to print and opens the system dialog */
export function sendMindmapPrintRequest(contents: WebContents): void {
  if (!contents.isDestroyed()) contents.send(MINDMAP_CHANNELS.printRequest)
}

function fileNameBase(name: string | undefined): string {
  return (name ?? '')
    .replace(/[/\\:*?"<>|]/g, '_')
    .slice(0, 80)
    .trim()
}

function withMapExtension(path: string): string {
  return extname(path).toLowerCase() === MAP_EXTENSION ? path : `${path}${MAP_EXTENSION}`
}

async function resolveSaveTarget(
  e: Electron.IpcMainInvokeEvent,
  mode: SaveMode,
  defaultName?: string,
): Promise<string | 'canceled'> {
  const current = savePathByWc.get(e.sender.id)
  if (mode === 'save' && current) return current
  const win =
    BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined
  // a restored map whose file is gone is offered that file's old place
  const restoredPath = current ? undefined : viewSaveAsDefault(e.sender.id)
  const defaultPath = current
    ? join(dirname(current), basename(current))
    : (restoredPath ??
      join(
        configuredDefaultSaveDir(app),
        `${fileNameBase(defaultName) || tm('untitledFile')}${MAP_EXTENSION}`,
      ))
  const picked = await showSaveDialogWithMemory(dialog, win, {
    title: tm('dlgSaveTitle'),
    defaultPath,
    filters: [{ name: tm('filterMindmap'), extensions: [MAP_EXTENSION.slice(1)] }],
  })
  if (picked.canceled || !picked.filePath) return 'canceled'
  return withMapExtension(picked.filePath)
}

/** The window a question about this view sits over. */
function parentWindowOf(contents: WebContents): BrowserWindow | null {
  return BrowserWindow.fromWebContents(contents) ?? BrowserWindow.getFocusedWindow() ?? null
}

/** The name an untitled map's recovery copy is listed under: the tab title, else what the renderer offers. */
function untitledCopyTitle(contents: WebContents, offered: unknown): string {
  const fromShell = recoveryTitleHook?.(contents)
  if (typeof fromShell === 'string' && fromShell.trim()) return fromShell.trim()
  const name = typeof offered === 'string' ? offered.replace(/\s+/g, ' ').trim().slice(0, 80) : ''
  return name || tm('untitledFile')
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

let ipcRegistered = false

function registerMindmapIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle(MINDMAP_CHANNELS.consumePending, (e) => openPathByWc.get(e.sender.id) ?? null)

  ipcMain.handle(MINDMAP_CHANNELS.openFile, async (e, path: unknown): Promise<OpenFileResult> => {
    const wcId = e.sender.id
    if (typeof path !== 'string' || !allowedByWc.get(wcId)?.has(path)) {
      throw new Error('mindmap: path not granted to this view')
    }
    // A recovery copy left for this file is settled before any of the map is loaded.
    const restored = await resolveViewOpen(wcId, path, parentWindowOf(e.sender))
    let bytes: Uint8Array | null
    try {
      bytes = new Uint8Array(await readFile(path))
    } catch {
      bytes = null
    }
    if (restored) {
      const copy = await openXmind(restored)
      if (copy.status === 'ok') {
        // the restored map is written only by a save; the copy is the whole file
        unopenedByWc.delete(wcId)
        if (bytes && (await openXmind(bytes)).status === 'ok') {
          // the file still opens: it stays the save target
          savePathByWc.set(wcId, path)
          await rememberDiskState(wcId, path)
          return { status: 'ok', bytes: restored, restored: 'file' }
        }
        // The file is gone or no longer opens, so it is not written over: the
        // map is untitled, its first save offers the old place, and its copies
        // keep replacing the restored one.
        savePathByWc.delete(wcId)
        viewRestoredUntitled(wcId, path)
        return { status: 'ok', bytes: restored, restored: 'untitled' }
      }
      console.warn(`[mindmap] the recovery copy does not open (${copy.status}); the file opens`)
    }
    if (!bytes) {
      refuseWrites(wcId)
      return { status: 'unreadable' }
    }
    const opened = await openXmind(bytes)
    if (opened.status !== 'ok') {
      console.warn(`[mindmap] the file did not open (${opened.status}): ${opened.detail}`)
      refuseWrites(wcId)
      return { status: opened.status }
    }
    // Seen open, here: only now is the path a save target. This also covers a
    // reload of a view whose file opens again after it was replaced on disk.
    unopenedByWc.delete(wcId)
    savePathByWc.set(wcId, path)
    await rememberDiskState(wcId, path)
    return { status: 'ok', bytes }
  })

  ipcMain.handle(MINDMAP_CHANNELS.save, async (e, request: unknown): Promise<SaveMindmapResult> => {
    const wcId = e.sender.id
    const waiter = saveWaiters.get(wcId)
    saveWaiters.delete(wcId)
    const done = (result: SaveMindmapResult): SaveMindmapResult => {
      waiter?.(result.ok && !('canceled' in result))
      return result
    }
    if (!mayWrite(wcId)) {
      return done({ ok: false, error: 'mindmap: the file did not open, nothing is written' })
    }
    const {
      bytes: rawBytes,
      mode: rawMode,
      defaultName,
    } = (request ?? {}) as {
      bytes?: unknown
      mode?: unknown
      defaultName?: unknown
    }
    const bytes = bytesOf(rawBytes)
    if (!bytes) return done({ ok: false, error: 'mindmap: bad save request' })
    // The bytes come from a renderer. They replace the user's file only when they are a map that opens.
    const check = await openXmind(bytes)
    if (check.status !== 'ok') {
      return done({
        ok: false,
        error: `mindmap: refusing to write a file that would not open (${check.status})`,
      })
    }
    const mode: SaveMode = rawMode === 'saveAs' ? 'saveAs' : 'save'
    // Request input is untrusted: only an explicit automatic-save flag counts
    const auto = (request as { auto?: unknown } | null)?.auto === true
    // A copy pair saving onto the map's own path settles the conflict first
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
        typeof defaultName === 'string' ? defaultName : undefined,
      )
      if (target === 'canceled') return done({ ok: true, canceled: true })
      const previousPath = savePathByWc.get(wcId)
      const isNewPath = previousPath !== target
      await atomicWriteFile(target, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
      savePathByWc.set(wcId, target)
      // keep the reload path in sync: a stale openPathByWc would make a
      // reloaded renderer load the OLD file and then save it over the new one
      openPathByWc.set(wcId, target)
      const allowed = allowedByWc.get(wcId) ?? new Set<string>()
      allowed.add(target)
      allowedByWc.set(wcId, allowed)
      dirtyByWc.delete(wcId)
      // the map is on disk: its recovery copies have done their part
      viewSaved(wcId)
      // Refresh the record for the written bytes; the view no longer edits a moved-away path
      await rememberDiskState(wcId, target)
      if (previousPath && previousPath !== target) forgetDiskState(wcId, previousPath)
      if (isNewPath) fileSavedHook?.(e.sender, target)
      return done({ ok: true, path: target })
    } catch (err) {
      return done({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  })

  ipcMain.handle(MINDMAP_CHANNELS.openLink, async (_e, url: unknown): Promise<boolean> => {
    const target = openableLink(url)
    if (!target) return false
    try {
      await shell.openExternal(target)
      return true
    } catch (err) {
      console.warn('[mindmap] the link could not be opened:', err)
      return false
    }
  })

  ipcMain.on(MINDMAP_CHANNELS.dirtyChanged, (e, dirty: unknown) => {
    if (dirty === true && mayWrite(e.sender.id)) dirtyByWc.add(e.sender.id)
    else dirtyByWc.delete(e.sender.id)
  })

  ipcMain.on(MINDMAP_CHANNELS.closeSaveResult, (e, ok: unknown) => {
    const waiter = closeSaveWaiters.get(e.sender.id)
    closeSaveWaiters.delete(e.sender.id)
    waiter?.(ok === true)
  })

  // safety net for menu saves the renderer declined without invoking save()
  // (still loading, or a file that did not open): the save handler itself
  // resolves the normal path
  ipcMain.on(MINDMAP_CHANNELS.saveRequestAck, (e, ok: unknown) => {
    const waiter = saveWaiters.get(e.sender.id)
    saveWaiters.delete(e.sender.id)
    waiter?.(ok === true)
  })

  // the toolbar's "make another document from this one": the shell opens its make window (T18)
  ipcMain.on(MINDMAP_CHANNELS.makeFromDocument, (e) => makeFromDocumentHook?.(e.sender))

  // crash-recovery copies: bytes from the renderer, kept in the app data folder only
  ipcMain.handle(
    MINDMAP_CHANNELS.recoveryCopy,
    async (e, request: unknown): Promise<RecoveryCopyResult> => {
      const wcId = e.sender.id
      // nothing unsaved (a save came first), or a view whose file did not open
      if (!mayWrite(wcId) || !dirtyByWc.has(wcId)) return 'skipped'
      const { bytes: raw, name } = (request ?? {}) as { bytes?: unknown; name?: unknown }
      const bytes = bytesOf(raw)
      if (!bytes) return 'skipped'
      return writeViewCopy(wcId, savePathByWc.get(wcId), bytes, () =>
        untitledCopyTitle(e.sender, name),
      )
    },
  )

  ipcMain.on(MINDMAP_CHANNELS.recoveryCopyNowDone, (e) => copyNowWaiters.get(e.sender.id)?.())

  // the AI panel's attachments and the provisional name of an untitled map (T12)
  registerMindmapAiIpc({ hasFile: (wcId) => savePathByWc.has(wcId) })
  registerMindmapExportIpc({ filePathOf: (wcId) => savePathByWc.get(wcId) })
  registerMindmapHandoffIpc({ opensFile: (wcId) => openPathByWc.has(wcId) })
  registerMindmapSeedIpc({ opensFile: (wcId) => openPathByWc.has(wcId) })

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
  contentsByWc.set(wcId, wc)
  if (openPath && existsSync(openPath)) {
    openPathByWc.set(wcId, openPath)
    allowedByWc.set(wcId, new Set([openPath]))
    // Not a save target yet: it becomes one when the open handler has seen the file open.
    unopenedByWc.set(wcId, 'pending')
  }
  // The map never opens a window or leaves its page. A link is opened by the
  // openLink handler, after safeExternalUrl; nothing else may reach the system.
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  wc.on('will-navigate', (event, url) => {
    if (url !== wc.getURL()) event.preventDefault()
  })
  // a crashed view's recovery copies outlive it: the shell reopens the map from them
  wc.on('render-process-gone', () => viewCrashed(wcId))
  wc.once('destroyed', () => {
    viewGone(wcId, dirtyByWc.has(wcId))
    contentsByWc.delete(wcId)
    copyNowWaiters.get(wcId)?.()
    openPathByWc.delete(wcId)
    allowedByWc.delete(wcId)
    savePathByWc.delete(wcId)
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
function mindmapRendererUrl(): string {
  return runtime.rendererUrl ?? `${RENDERER_SCHEME}://mindmap/index.html`
}

const VIEW_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
} as const

/** A map tab for the shell. `openPath` null or left out: a new, untitled map. */
export function createMindmapView(openPath?: string | null): WebContentsView {
  registerMindmapIpc()
  const view = new WebContentsView({
    webPreferences: { preload: runtime.preloadPath, ...VIEW_PREFERENCES },
  })
  grantAndTrack(view.webContents, openPath)
  void view.webContents.loadURL(mindmapRendererUrl())
  return view
}

/** Standalone window mode: `npm run dev -w @genoffice/mindmap`, a map path passed via argv */
export function startMindmapStandalone(): void {
  registerRendererScheme()
  installNavigationGuard(app)
  installContextMenu(app, () => contextMenuLabels(getUiLang()))
  configureMindmapRuntime({
    preloadPath: join(__dirname, '../preload/index.js'),
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    rendererFile: join(__dirname, '../renderer/index.html'),
  })
  // A scratch profile for scripted runs, the same variable the shell reads.
  if (process.env.GENOFFICE_USER_DATA) app.setPath('userData', process.env.GENOFFICE_USER_DATA)
  void app.whenReady().then(() => {
    // there is no shell to say which language the user picked
    setUiLang(normalizeLang(process.env.GENOFFICE_LANG ?? app.getLocale()))
    installRendererProtocol({ mindmap: join(__dirname, '../renderer') })
    registerMindmapIpc()
    const win = new BrowserWindow({
      width: 1200,
      height: 850,
      webPreferences: { preload: runtime.preloadPath, ...VIEW_PREFERENCES },
    })
    const argPath = process.argv.slice(1).find((a) => /\.xmind$/i.test(a) && existsSync(a))
    grantAndTrack(win.webContents, argPath)
    void win.loadURL(mindmapRendererUrl())
  })
  app.on('window-all-closed', () => app.quit())
}
