/**
 * The main-process side of the diagram editor.
 *
 * The diagram lives in draw.io inside the renderer: draw.io serializes it in
 * the file's format and the renderer hands the bytes over. This side reads and
 * writes files, keeps what each view may touch, holds the tab's session (its
 * own partition, request refusal, the `drawio-app://` files), and opens links.
 *
 * Decided here, never left to the renderer (as in the mind map editor):
 *
 * - A file that did not open is never written. A path becomes a save target
 *   only after this side opened its bytes with the diagram model and saw a
 *   diagram; bytes a save brings are opened the same way, in the target's
 *   format, before they replace a file.
 * - A save with nothing changed writes nothing (spec 3.2), whoever asks.
 * - Save goes in two steps: `saveTarget` decides where (asking only for an
 *   untitled diagram and Save As) and gives a one-time token; `save` writes
 *   the bytes the renderer made for that target's format.
 * - A link is opened only after `openableLink`, and only from here.
 *
 * Crash-recovery copies (`recovery-main.ts`, decision 0061) and AutoSave
 * (decision 0069) follow the mind map editor. The editor registers its
 * `RecoveryEditorContract` when this module loads.
 *
 * The shell bundles this module and drives it through the exports below; a
 * standalone window (`startDiagramStandalone`) uses the same code.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import {
  BrowserWindow,
  WebContentsView,
  app,
  dialog,
  ipcMain,
  nativeTheme,
  protocol,
  shell,
} from 'electron'
import type { WebContents } from 'electron'
import {
  configuredDefaultSaveDir,
  confirmOverwriteIfConflicted,
  isPathOpenElsewhere,
  recordDiskState,
  registerRecoveryEditor,
  shouldDeferAutoSave,
  showSaveDialogWithMemory,
} from '@genoffice/electron-utils'
import type {
  RecoveryEditorKind,
  RecoveryIdentity,
  RecoveryOpenFileRequest,
  RecoveryOpenUntitledRequest,
  SaveDiskState,
} from '@genoffice/electron-utils'
import { atomicWriteFile } from '@genoffice/electron-utils/atomic-write'
import {
  RENDERER_SCHEME,
  RENDERER_SCHEME_PRIVILEGE,
} from '@genoffice/electron-utils/renderer-scheme'
import { getUiLang, normalizeLang, setUiLang } from '@genoffice/i18n'
import { detectDiagramFormat, openDiagram, type DiagramFormat } from '@genoffice/drawio-model'
import { nodePageCodec } from '@genoffice/drawio-model/node'
import { APP_CHANNELS, DIAGRAM_CHANNELS } from '../shared/ipc'
import type {
  DiagramMenuCommand,
  DiagramSeed,
  DiagramTabIdentity,
  ExportFormat,
  OpenFileResult,
  RecoveryCopyResult,
  SaveDiagramResult,
  SaveIntoProjectResult,
  SaveMode,
  SaveTargetResult,
} from '../shared/ipc'
import {
  FORMAT_EXTENSIONS,
  SAVE_AS_FORMATS,
  diagramBaseName,
  filterExtension,
  formatForSavePath,
  isCompressedFile,
  safeFileNameBase,
  withFormatExtension,
} from '../shared/formats'
import { openableLink } from '../shared/links'
import { DRAWIO_SCHEME_PRIVILEGE } from './drawio-protocol'
import { diagramSession } from './diagram-session'
import { registerDiagramExportIpc } from './export-main'
import { registerDiagramAiIpc } from './ai-attachments'
import { tm } from './i18n-main'
import {
  DIAGRAM_PARTITION,
  devServerOrigins,
  isAllowedNavigation,
  windowOpenAction,
} from './network-guard'
import {
  diagramRecoveryStore,
  fileRecoveryIdentity,
  recoveryAvailable,
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

export { DRAWIO_SCHEME_PRIVILEGE } from './drawio-protocol'
export { DIAGRAM_PARTITION } from './network-guard'
export { diagramRequestLog } from './diagram-session'
export { registerDiagramAiIpc, setDiagramProvisionalTitleHook } from './ai-attachments'
export { diagramOpenRefusal, visioOpenRefusal } from './open-check'
/** How long a tab that stays open after "Don't Save" takes no copy. */
export { DONT_SAVE_HOLD_MS as DIAGRAM_DONT_SAVE_HOLD_MS } from './recovery-main'

export interface DiagramRuntime {
  preloadPath: string
  /** the renderer's dev server, when one runs */
  rendererUrl?: string
  /** the built renderer page (`<module out>/renderer/index.html`) */
  rendererFile?: string
  /**
   * The trimmed draw.io bundle. Default: `<module out>/drawio`, beside the
   * renderer folder (`apps/diagram/out/drawio` in a dev run,
   * `resources/modules/diagram/drawio` in the installer).
   */
  drawioDir?: string
  /** our bridge script. Default: `<module out>/bridge/bridge.js` */
  bridgeFile?: string
  /** a packaged app: no dev server is ever let through the diagram session */
  packaged?: boolean
  /** Project folders (spec 6): the folder an untitled diagram's save dialog opens in, or null */
  newDocumentDir?: (webContentsId: number) => Promise<string | null>
  /** Project folders (spec 6): write a new diagram into the panel's project; the path or null */
  writeNewDocument?: (
    webContentsId: number,
    fileName: string,
    bytes: Uint8Array,
  ) => Promise<string | null>
}

let runtime: DiagramRuntime = { preloadPath: '' }

export function configureDiagramRuntime(paths: DiagramRuntime): void {
  runtime = paths
}

/** The module's build folder, from the renderer page or the preload. */
function moduleOutDir(): string {
  if (runtime.rendererFile) return dirname(dirname(runtime.rendererFile))
  return dirname(dirname(runtime.preloadPath))
}

function sessionPaths() {
  const out = moduleOutDir()
  return {
    rendererDir: runtime.rendererFile ? dirname(runtime.rendererFile) : join(out, 'renderer'),
    drawioDir: runtime.drawioDir ?? join(out, 'drawio'),
    bridgeFile: runtime.bridgeFile ?? join(out, 'bridge', 'bridge.js'),
    devOrigins: devServerOrigins(
      [runtime.rendererUrl, process.env.DIAGRAM_RENDERER_URL, process.env.ELECTRON_RENDERER_URL],
      runtime.packaged ?? app.isPackaged,
    ),
  }
}

// The shared recovery store lists the editor kinds it keeps copies for; the
// shell wiring adds this one there.
const RECOVERY_KIND = 'diagram' as unknown as RecoveryEditorKind

/** Open path per view, queued at tab creation; the renderer consumes it after mount. */
const openPathByWc = new Map<number, string>()
/** File paths granted to each view: opening and saving only allow these */
const allowedByWc = new Map<number, Set<string>>()
/** Current save target per view; absent = untitled diagram, or a file not yet seen open */
const savePathByWc = new Map<number, string>()
/** Views made for a file this side has not seen open: nothing is written for them */
const unopenedByWc = new Map<number, 'pending' | 'failed'>()
/** Views made from another program's file (a `.vsdx`): the source, never written */
const importByWc = new Map<number, { path: string; title: string }>()
/** Unsaved-changes flags mirrored from the renderer */
const dirtyByWc = new Set<number>()
const closeSaveWaiters = new Map<number, (ok: boolean) => void>()
const saveWaiters = new Map<number, (ok: boolean) => void>()
const contentsByWc = new Map<number, WebContents>()
const copyNowWaiters = new Map<number, () => void>()
/** Save targets handed out by `saveTarget`, by view and token; each is used once */
const targetsByWc = new Map<number, Map<string, { path: string; format: DiagramFormat }>>()
/** The path whose bytes on disk are the diagram as opened or last written: an unchanged save there writes nothing */
const cleanPathByWc = new Map<number, string>()
/** Content queued for a new view (a converter's result, a template), taken once */
const seedsByWc = new Map<number, DiagramSeed>()
const COPY_NOW_TIMEOUT_MS = 5000

function mayWrite(wcId: number): boolean {
  return !unopenedByWc.has(wcId)
}

// ── Split-copy save guard (decision 0036), as in the mind map editor ──
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

// ── hooks the shell sets ──

let fileSavedHook: ((wc: WebContents, path: string) => void) | null = null
/** Fired after a save lands on a NEW path (first save, Save As): the shell syncs tab title, recents, projects */
export function setDiagramFileSavedHook(hook: (wc: WebContents, path: string) => void): void {
  fileSavedHook = hook
}

let recoveryTitleHook: ((wc: WebContents) => string | null | undefined) | null = null
/** The tab title of an untitled diagram, recorded with its recovery copy */
export function setDiagramRecoveryTitleHook(
  hook: ((wc: WebContents) => string | null | undefined) | null,
): void {
  recoveryTitleHook = hook
}

let helpHook: ((wc: WebContents) => void) | null = null
/** draw.io's Help was picked: the shell opens the app's own help topic for diagrams */
export function setDiagramHelpHook(hook: ((wc: WebContents) => void) | null): void {
  helpHook = hook
}

let openFailedHook: ((wc: WebContents, message: string) => boolean) | null = null
/**
 * A tab's file did not open after all (a Visio drawing draw.io could not
 * import, a file that broke after the shell's check): the shell closes the tab
 * and shows `message` as an app warning, answering true. Without the hook (the
 * editor run on its own) or false, the editor shows the reason in its tab.
 */
export function setDiagramOpenFailedHook(
  hook: ((wc: WebContents, message: string) => boolean) | null,
): void {
  openFailedHook = hook
}

/** A recovery copy of this file is kept (the tab opens even when the file does not, to offer it). */
export function diagramHasRecoveryCopy(filePath: string): boolean {
  if (!recoveryAvailable()) return false
  try {
    return diagramRecoveryStore().copyInfo(fileRecoveryIdentity(filePath)) !== null
  } catch {
    return false
  }
}

/** Longest reason passed on to the warning box. */
const OPEN_FAILED_MAX_CHARS = 2000

function copyAgain(contents: WebContents): () => void {
  return () => {
    if (!contents.isDestroyed()) contents.send(DIAGRAM_CHANNELS.recoveryReset)
  }
}

export function diagramIsDirty(webContentsId: number): boolean {
  return dirtyByWc.has(webContentsId)
}

export function diagramFilePath(webContentsId: number): string | undefined {
  return savePathByWc.get(webContentsId)
}

/**
 * What the shell keeps about a tab to find it again (spec 3.4, 3.5): the file
 * it came from (an imported `.vsdx` included), whether it is untitled, its
 * name. Null for a webContents that is not a diagram view.
 */
export function diagramTabIdentity(webContentsId: number): DiagramTabIdentity | null {
  if (!contentsByWc.has(webContentsId)) return null
  const saved = savePathByWc.get(webContentsId)
  if (saved) return { sourcePath: saved, untitled: false, title: diagramBaseName(saved) }
  const imported = importByWc.get(webContentsId)
  if (imported) {
    return { sourcePath: imported.path, untitled: true, title: imported.title, imported: 'vsdx' }
  }
  const opening = openPathByWc.get(webContentsId)
  if (opening) return { sourcePath: opening, untitled: false, title: diagramBaseName(opening) }
  const contents = contentsByWc.get(webContentsId)
  const title = (contents && recoveryTitleHook?.(contents)) || tm('untitled')
  return { sourcePath: null, untitled: true, title }
}

/** The file was renamed on disk: re-grant the new path and tell the renderer */
export function diagramFileRenamed(contents: WebContents, oldPath: string, newPath: string): void {
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
  if (!contents.isDestroyed()) contents.send(DIAGRAM_CHANNELS.fileRenamed, newPath)
}

/**
 * Close guard: true means proceed with closing. Clean → true; dirty →
 * Save / Don't Save / Cancel. On Save the renderer saves and the result is
 * awaited; a cancelled save dialog keeps the tab open.
 */
export async function requestDiagramClose(
  contents: WebContents,
  parent?: BrowserWindow | null,
): Promise<boolean> {
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
    contents.send(DIAGRAM_CHANNELS.closeSaveRequest)
  })
}

/** Menu Save / Save As: the renderer saves; a clean diagram with a file resolves true at once and writes nothing */
export function requestDiagramSave(contents: WebContents, mode: SaveMode): Promise<boolean> {
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
    contents.send(DIAGRAM_CHANNELS.saveRequest, mode)
  })
}

/**
 * Save the live diagram to `filePath` with no dialog (the in-app MCP
 * server's save). The format follows the name. A diagram with no change that
 * already lives at `filePath` is not written.
 */
export function diagramSaveToPath(contents: WebContents, filePath: string): Promise<void> {
  if (contents.isDestroyed()) return Promise.reject(new Error('the diagram is no longer open'))
  const wcId = contents.id
  if (!mayWrite(wcId)) {
    return Promise.reject(new Error('the file did not open, so there is no diagram to save'))
  }
  if (savePathByWc.get(wcId) === filePath && !dirtyByWc.has(wcId)) return Promise.resolve()
  const previousPath = savePathByWc.get(wcId)
  savePathByWc.set(wcId, filePath)
  const allowed = allowedByWc.get(wcId) ?? new Set<string>()
  allowed.add(filePath)
  allowedByWc.set(wcId, allowed)
  return new Promise<void>((resolve, reject) => {
    const restore = (): void => {
      if (previousPath === undefined) savePathByWc.delete(wcId)
      else savePathByWc.set(wcId, previousPath)
    }
    const timer = setTimeout(() => {
      saveWaiters.delete(wcId)
      restore()
      reject(new Error('timed out saving the diagram'))
    }, 120_000)
    saveWaiters.set(wcId, (ok) => {
      clearTimeout(timer)
      if (ok) resolve()
      else {
        restore()
        reject(new Error('could not save the diagram'))
      }
    })
    contents.send(DIAGRAM_CHANNELS.saveRequest, previousPath === filePath ? 'save' : 'retarget')
  })
}

/** A tool closes the diagram without saving: the unsaved work and its recovery copy are dropped. */
export function discardDiagramRecovery(contents: WebContents): void {
  viewDropped(contents.id, copyAgain(contents))
}

/** The recovery copy this view writes, for the shell's session record; null for a non-diagram view. */
export function diagramRecoveryIdentity(webContentsId: number): RecoveryIdentity | null {
  if (!contentsByWc.has(webContentsId)) return null
  return viewRecoveryIdentity(webContentsId, savePathByWc.get(webContentsId))
}

/** The OS is ending the session: every diagram view with unsaved changes writes a copy now. */
export async function writeDiagramCopiesNow(timeoutMs = COPY_NOW_TIMEOUT_MS): Promise<void> {
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
          contents.send(DIAGRAM_CHANNELS.recoveryCopyNow)
        } catch {
          finish()
        }
      }),
    )
  }
  await Promise.all(waits)
}

/** Open `filePath` in a view the shell made, with the recovery question already answered. */
export function openDiagramFileWithDecision(
  contents: WebContents,
  request: RecoveryOpenFileRequest,
): void {
  registerDiagramIpc()
  const wcId = contents.id
  setViewOpenDecision(wcId, request.decision)
  if (openPathByWc.get(wcId) === request.filePath) return
  openPathByWc.set(wcId, request.filePath)
  allowedByWc.set(wcId, new Set([request.filePath]))
  unopenedByWc.set(wcId, 'pending')
  savePathByWc.delete(wcId)
  cleanPathByWc.delete(wcId)
  dirtyByWc.delete(wcId)
  if (!contents.isDestroyed()) contents.reload()
}

/** Load a recovery copy into an untitled view the shell made. */
export function openDiagramUntitledCopy(
  contents: WebContents,
  request: RecoveryOpenUntitledRequest,
): void {
  registerDiagramIpc()
  const bytes = takeUntitledCopy(contents.id, request)
  if (!bytes) {
    console.warn('[diagram] the recovery copy could not be read')
    return
  }
  // a gone file's copy is in that file's format; an untitled copy is `.drawio`
  const name = 'filePath' in request.copy ? basename(request.copy.filePath) : 'copy.drawio'
  const opened = openDiagram(name, bytes, nodePageCodec)
  if (opened.ok) queueDiagramSeedFor(contents, { xml: opened.file.xml })
  else console.warn(`[diagram] the recovery copy does not open (${opened.reason})`)
}

registerRecoveryEditor({
  kind: RECOVERY_KIND,
  writeCopiesNow: () => writeDiagramCopiesNow(),
  openFileWithDecision: openDiagramFileWithDecision,
  openUntitledCopy: openDiagramUntitledCopy,
  isUnprotectable: () => false,
})

/** Content for a new, unsaved diagram view, queued in the tick the view is made; taken once. */
export function queueDiagramSeedFor(contents: WebContents, seed: DiagramSeed): void {
  if (contents.isDestroyed()) return
  const id = contents.id
  seedsByWc.set(id, seed)
  contents.once('destroyed', () => seedsByWc.delete(id))
}

/** Menu commands that need no answer: undo, redo, zoom and the like. */
export function sendDiagramMenuCommand(contents: WebContents, command: DiagramMenuCommand): void {
  if (!contents.isDestroyed()) contents.send(DIAGRAM_CHANNELS.menuCommand, command)
}

/** Shell menu export entry: the renderer asks which pages and runs the export */
export function sendDiagramExportRequest(contents: WebContents, format: ExportFormat): void {
  if (!contents.isDestroyed()) contents.send(DIAGRAM_CHANNELS.exportRequest, format)
}

/** Shell menu Print: the renderer makes the sheets and the app prints them */
export function sendDiagramPrintRequest(contents: WebContents): void {
  if (!contents.isDestroyed()) contents.send(DIAGRAM_CHANNELS.printRequest)
}

// ── save ──

function parentWindowOf(contents: WebContents): BrowserWindow | null {
  return BrowserWindow.fromWebContents(contents) ?? BrowserWindow.getFocusedWindow() ?? null
}

function bytesOf(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  return null
}

/** A diagram's format from its path (a granted path always has a diagram name). */
function formatOfPath(path: string): DiagramFormat {
  const format = detectDiagramFormat(path)
  return format && format !== 'vsdx' ? format : 'drawio'
}

function handOutTarget(wcId: number, path: string, format: DiagramFormat): SaveTargetResult {
  const token = randomBytes(16).toString('hex')
  const targets = targetsByWc.get(wcId) ?? new Map()
  targets.set(token, { path, format })
  targetsByWc.set(wcId, targets)
  return { ok: true, token, path, format }
}

/** The save dialog: the file's own format first, then the others; a new diagram proposes `.drawio`. */
async function askSavePath(
  contents: WebContents,
  current: string | undefined,
  defaultName: string | undefined,
): Promise<{ path: string; format: DiagramFormat } | null> {
  const wcId = contents.id
  const currentFormat = current ? formatOfPath(current) : 'drawio'
  const imported = importByWc.get(wcId)
  const restoredPath = current ? undefined : viewSaveAsDefault(wcId)
  let defaultPath: string
  if (current) defaultPath = current
  else if (restoredPath) defaultPath = withFormatExtension(restoredPath, formatOfPath(restoredPath))
  else {
    // an imported file's diagram is offered beside that file; an untitled one in its project or the default folder
    const dir = imported
      ? dirname(imported.path)
      : ((await runtime.newDocumentDir?.(wcId)) ?? configuredDefaultSaveDir(app))
    const base = safeFileNameBase(imported?.title ?? defaultName) || tm('untitled')
    defaultPath = join(dir, `${base}${FORMAT_EXTENSIONS.drawio}`)
  }
  const order = [currentFormat, ...SAVE_AS_FORMATS.filter((format) => format !== currentFormat)]
  const filterName: Record<DiagramFormat, string> = {
    drawio: tm('filterDrawio'),
    dio: tm('filterDio'),
    'drawio.svg': tm('filterDrawioSvg'),
    'drawio.png': tm('filterDrawioPng'),
  }
  const picked = await showSaveDialogWithMemory(dialog, parentWindowOf(contents) ?? undefined, {
    title: tm('dlgSaveTitle'),
    defaultPath,
    filters: order.map((format) => ({
      name: filterName[format],
      extensions: [filterExtension(format)],
    })),
  })
  if (picked.canceled || !picked.filePath) return null
  const format = formatForSavePath(picked.filePath, currentFormat)
  return { path: withFormatExtension(picked.filePath, format), format }
}

async function adoptWrittenPath(
  contents: WebContents,
  target: string,
  previousPath: string | undefined,
): Promise<void> {
  const wcId = contents.id
  savePathByWc.set(wcId, target)
  openPathByWc.set(wcId, target)
  const allowed = allowedByWc.get(wcId) ?? new Set<string>()
  allowed.add(target)
  allowedByWc.set(wcId, allowed)
  dirtyByWc.delete(wcId)
  cleanPathByWc.set(wcId, target)
  // an imported diagram is now a diagram file of its own
  importByWc.delete(wcId)
  viewSaved(wcId)
  await rememberDiskState(wcId, target)
  if (previousPath && previousPath !== target) forgetDiskState(wcId, previousPath)
  if (previousPath !== target) fileSavedHook?.(contents, target)
}

function untitledCopyTitle(contents: WebContents, offered: unknown): string {
  const fromShell = recoveryTitleHook?.(contents)
  if (typeof fromShell === 'string' && fromShell.trim()) return fromShell.trim()
  const imported = importByWc.get(contents.id)?.title
  if (imported) return imported
  const name = typeof offered === 'string' ? offered.replace(/\s+/g, ' ').trim().slice(0, 80) : ''
  return name || tm('untitled')
}

/** The view's file did not open: it has no save target and gets none. */
function refuseWrites(wcId: number): void {
  unopenedByWc.set(wcId, 'failed')
  savePathByWc.delete(wcId)
  dirtyByWc.delete(wcId)
}

let ipcRegistered = false

function registerDiagramIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle(DIAGRAM_CHANNELS.consumePending, (e) => openPathByWc.get(e.sender.id) ?? null)

  ipcMain.handle(DIAGRAM_CHANNELS.openFile, async (e, path: unknown): Promise<OpenFileResult> => {
    const wcId = e.sender.id
    if (typeof path !== 'string' || !allowedByWc.get(wcId)?.has(path)) {
      throw new Error('diagram: path not granted to this view')
    }
    const kind = detectDiagramFormat(path)
    if (kind === null) {
      refuseWrites(wcId)
      return { status: 'unsupported' }
    }
    if (kind === 'vsdx') {
      // another program's file: read for the importer, never written; the diagram is untitled
      let bytes: Uint8Array
      try {
        bytes = new Uint8Array(await readFile(path))
      } catch {
        refuseWrites(wcId)
        return { status: 'unreadable' }
      }
      unopenedByWc.delete(wcId)
      savePathByWc.delete(wcId)
      const title = diagramBaseName(path)
      importByWc.set(wcId, { path, title })
      return { status: 'import', importer: 'vsdx', bytes, title }
    }
    const name = basename(path)
    const restored = await resolveViewOpen(wcId, path, parentWindowOf(e.sender))
    let bytes: Uint8Array | null
    try {
      bytes = new Uint8Array(await readFile(path))
    } catch {
      bytes = null
    }
    if (restored) {
      const copy = openDiagram(name, restored, nodePageCodec)
      if (copy.ok) {
        unopenedByWc.delete(wcId)
        const fileStillOpens = bytes !== null && openDiagram(name, bytes, nodePageCodec).ok
        if (fileStillOpens) {
          savePathByWc.set(wcId, path)
          await rememberDiskState(wcId, path)
        } else {
          savePathByWc.delete(wcId)
          viewRestoredUntitled(wcId, path)
        }
        return {
          status: 'ok',
          xml: copy.file.xml,
          format: copy.file.format,
          compressed: isCompressedFile(copy.file),
          restored: fileStillOpens ? 'file' : 'untitled',
        }
      }
      console.warn(`[diagram] the recovery copy does not open (${copy.reason}); the file opens`)
    }
    if (!bytes) {
      refuseWrites(wcId)
      return { status: 'unreadable' }
    }
    const opened = openDiagram(name, bytes, nodePageCodec)
    if (!opened.ok) {
      console.warn(`[diagram] the file did not open (${opened.reason}): ${opened.message}`)
      refuseWrites(wcId)
      return { status: opened.reason }
    }
    unopenedByWc.delete(wcId)
    savePathByWc.set(wcId, path)
    cleanPathByWc.set(wcId, path)
    await rememberDiskState(wcId, path)
    return {
      status: 'ok',
      xml: opened.file.xml,
      format: opened.file.format,
      compressed: isCompressedFile(opened.file),
    }
  })

  ipcMain.handle(
    DIAGRAM_CHANNELS.saveTarget,
    async (e, request: unknown): Promise<SaveTargetResult> => {
      const wcId = e.sender.id
      if (!mayWrite(wcId)) return { ok: false, error: 'diagram: the file did not open' }
      const { mode: rawMode, defaultName } = (request ?? {}) as {
        mode?: unknown
        defaultName?: unknown
      }
      const mode: SaveMode | 'retarget' =
        rawMode === 'saveAs' ? 'saveAs' : rawMode === 'retarget' ? 'retarget' : 'save'
      const current = savePathByWc.get(wcId)
      if ((mode === 'save' || mode === 'retarget') && current) {
        return handOutTarget(wcId, current, formatOfPath(current))
      }
      try {
        const picked = await askSavePath(
          e.sender,
          current,
          typeof defaultName === 'string' ? defaultName : undefined,
        )
        if (!picked) {
          saveWaiters.get(wcId)?.(false)
          saveWaiters.delete(wcId)
          return { ok: true, canceled: true }
        }
        return handOutTarget(wcId, picked.path, picked.format)
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  ipcMain.handle(DIAGRAM_CHANNELS.save, async (e, request: unknown): Promise<SaveDiagramResult> => {
    const wcId = e.sender.id
    const waiter = saveWaiters.get(wcId)
    saveWaiters.delete(wcId)
    const done = (result: SaveDiagramResult): SaveDiagramResult => {
      waiter?.(result.ok && !('canceled' in result))
      return result
    }
    if (!mayWrite(wcId)) {
      return done({ ok: false, error: 'diagram: the file did not open, nothing is written' })
    }
    const {
      token,
      bytes: rawBytes,
      auto: rawAuto,
    } = (request ?? {}) as {
      token?: unknown
      bytes?: unknown
      auto?: unknown
    }
    const targets = targetsByWc.get(wcId)
    const target = typeof token === 'string' ? targets?.get(token) : undefined
    if (!target) return done({ ok: false, error: 'diagram: unknown save target' })
    targets!.delete(token as string)
    const bytes = bytesOf(rawBytes)
    if (!bytes) return done({ ok: false, error: 'diagram: bad save request' })
    const current = savePathByWc.get(wcId)
    // nothing changed and the file on disk is the diagram: nothing is written (spec 3.2)
    if (target.path === cleanPathByWc.get(wcId) && !dirtyByWc.has(wcId)) {
      return done({ ok: true, path: target.path })
    }
    // The bytes come from a renderer: they replace a file only when they open as a diagram of the target's format.
    const check = openDiagram(basename(target.path), bytes, nodePageCodec)
    if (!check.ok) {
      return done({
        ok: false,
        error: `diagram: refusing to write a file that would not open (${check.reason})`,
      })
    }
    const auto = rawAuto === true
    if (target.path === current && (await conflictStopsSave(e.sender, current, auto))) {
      return done({ ok: false, error: 'external-modified' })
    }
    try {
      await atomicWriteFile(
        target.path,
        Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
      )
      await adoptWrittenPath(e.sender, target.path, current)
      return done({ ok: true, path: target.path })
    } catch (err) {
      return done({ ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  })

  // Project folders (spec 6): a new diagram a create flow handed over, written as `.drawio` into the panel's project.
  ipcMain.handle(
    DIAGRAM_CHANNELS.saveIntoProject,
    async (e, request: unknown): Promise<SaveIntoProjectResult> => {
      const wcId = e.sender.id
      const write = runtime.writeNewDocument
      if (!write || !mayWrite(wcId) || savePathByWc.has(wcId)) return { ok: false, skipped: true }
      const { bytes: rawBytes, defaultName } = (request ?? {}) as {
        bytes?: unknown
        defaultName?: unknown
      }
      const bytes = bytesOf(rawBytes)
      if (!bytes) return { ok: false, error: 'diagram: bad save request' }
      const base = safeFileNameBase(typeof defaultName === 'string' ? defaultName : undefined)
      const fileName = `${base || tm('untitled')}${FORMAT_EXTENSIONS.drawio}`
      if (!openDiagram(fileName, bytes, nodePageCodec).ok) {
        return { ok: false, error: 'diagram: refusing to write a diagram that would not open' }
      }
      try {
        const written = await write(wcId, fileName, bytes)
        if (!written || savePathByWc.has(wcId)) return { ok: false, skipped: true }
        await adoptWrittenPath(e.sender, written, undefined)
        return { ok: true, path: written }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  ipcMain.handle(DIAGRAM_CHANNELS.openLink, async (_e, url: unknown): Promise<boolean> => {
    const target = openableLink(url)
    if (!target) return false
    try {
      await shell.openExternal(target)
      return true
    } catch (err) {
      console.warn('[diagram] the link could not be opened:', err)
      return false
    }
  })

  ipcMain.on(DIAGRAM_CHANNELS.openHelp, (e) => helpHook?.(e.sender))

  // only a view whose file did not open, or whose import has not become a file
  // yet, may close itself this way
  ipcMain.handle(DIAGRAM_CHANNELS.openFailed, (e, message: unknown): boolean => {
    const wcId = e.sender.id
    if (typeof message !== 'string' || message.trim() === '') return false
    if (unopenedByWc.get(wcId) !== 'failed' && !importByWc.has(wcId)) return false
    refuseWrites(wcId)
    if (!openFailedHook) return false
    return openFailedHook(e.sender, message.trim().slice(0, OPEN_FAILED_MAX_CHARS))
  })

  ipcMain.on(DIAGRAM_CHANNELS.dirtyChanged, (e, dirty: unknown) => {
    if (dirty === true && mayWrite(e.sender.id)) dirtyByWc.add(e.sender.id)
    else dirtyByWc.delete(e.sender.id)
  })

  ipcMain.on(DIAGRAM_CHANNELS.closeSaveResult, (e, ok: unknown) => {
    const waiter = closeSaveWaiters.get(e.sender.id)
    closeSaveWaiters.delete(e.sender.id)
    waiter?.(ok === true)
  })

  ipcMain.on(DIAGRAM_CHANNELS.saveRequestAck, (e, ok: unknown) => {
    const waiter = saveWaiters.get(e.sender.id)
    saveWaiters.delete(e.sender.id)
    waiter?.(ok === true)
  })

  ipcMain.handle(
    DIAGRAM_CHANNELS.recoveryCopy,
    async (e, request: unknown): Promise<RecoveryCopyResult> => {
      const wcId = e.sender.id
      if (!mayWrite(wcId) || !dirtyByWc.has(wcId)) return 'skipped'
      const { bytes: raw, name } = (request ?? {}) as { bytes?: unknown; name?: unknown }
      const bytes = bytesOf(raw)
      if (!bytes) return 'skipped'
      try {
        return await writeViewCopy(wcId, savePathByWc.get(wcId), bytes, () =>
          untitledCopyTitle(e.sender, name),
        )
      } catch (err) {
        console.warn('[diagram] the recovery copy was not written:', err)
        throw err
      }
    },
  )

  ipcMain.on(DIAGRAM_CHANNELS.recoveryCopyNowDone, (e) => copyNowWaiters.get(e.sender.id)?.())

  ipcMain.handle(DIAGRAM_CHANNELS.seedTake, (e): DiagramSeed | null => {
    if (openPathByWc.has(e.sender.id)) return null
    const seed = seedsByWc.get(e.sender.id) ?? null
    seedsByWc.delete(e.sender.id)
    return seed
  })

  registerDiagramExportIpc({ filePathOf: (wcId) => savePathByWc.get(wcId) })
  // the AI panel's attachments and the provisional name of an untitled diagram
  // (a tab with a file, or made from an imported file, keeps its name)
  registerDiagramAiIpc({ hasFile: (wcId) => savePathByWc.has(wcId) || importByWc.has(wcId) })

  // Language channel shared with other modules; removeHandler tolerates duplicate registration
  ipcMain.removeHandler(APP_CHANNELS.getLanguage)
  ipcMain.handle(APP_CHANNELS.getLanguage, () => getUiLang())
}

function grantAndTrack(wc: WebContents, openPath?: string | null): void {
  const wcId = wc.id
  contentsByWc.set(wcId, wc)
  if (openPath && existsSync(openPath)) {
    openPathByWc.set(wcId, openPath)
    allowedByWc.set(wcId, new Set([openPath]))
    unopenedByWc.set(wcId, 'pending')
    if (detectDiagramFormat(openPath) === 'vsdx') {
      importByWc.set(wcId, { path: openPath, title: diagramBaseName(openPath) })
    }
  }
  // Layer 3 of "nothing leaves this PC": no new window, ever; the page stays
  // where it is, and the draw.io frame on draw.io's start page. A link is
  // opened by the openLink handler, after the person clicked it.
  wc.setWindowOpenHandler(windowOpenAction)
  wc.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation({ url, isMainFrame: true, currentUrl: wc.getURL() })) {
      event.preventDefault()
    }
  })
  wc.on('will-frame-navigate', (details) => {
    if (details.isMainFrame) return
    if (!isAllowedNavigation({ url: details.url, isMainFrame: false, currentUrl: wc.getURL() })) {
      details.preventDefault()
    }
  })
  wc.on('render-process-gone', () => viewCrashed(wcId))
  wc.once('destroyed', () => {
    viewGone(wcId, dirtyByWc.has(wcId))
    contentsByWc.delete(wcId)
    copyNowWaiters.get(wcId)?.()
    openPathByWc.delete(wcId)
    allowedByWc.delete(wcId)
    savePathByWc.delete(wcId)
    unopenedByWc.delete(wcId)
    importByWc.delete(wcId)
    dirtyByWc.delete(wcId)
    docDiskStates.delete(wcId)
    targetsByWc.delete(wcId)
    cleanPathByWc.delete(wcId)
    closeSaveWaiters.get(wcId)?.(false)
    closeSaveWaiters.delete(wcId)
    saveWaiters.get(wcId)?.(false)
    saveWaiters.delete(wcId)
  })
}

function diagramRendererUrl(): string {
  return runtime.rendererUrl ?? `${RENDERER_SCHEME}://diagram/index.html`
}

const VIEW_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  partition: DIAGRAM_PARTITION,
} as const

/** A diagram tab for the shell. `openPath` null or left out: a new, untitled diagram. Call after app ready. */
export function createDiagramView(openPath?: string | null): WebContentsView {
  registerDiagramIpc()
  diagramSession(sessionPaths())
  const view = new WebContentsView({
    webPreferences: { preload: runtime.preloadPath, ...VIEW_PREFERENCES },
  })
  grantAndTrack(view.webContents, openPath)
  void view.webContents.loadURL(diagramRendererUrl())
  return view
}

/**
 * The hidden window of a windowless job (`headless-main.ts`): the tab's
 * session, guards and granted file, the file as saved (no recovery question),
 * and the page told to run the job instead of the editor. Call after app ready.
 */
export function createDiagramHiddenWindow(openPath: string): BrowserWindow {
  registerDiagramIpc()
  diagramSession(sessionPaths())
  const win = new BrowserWindow({
    show: false,
    width: 1300,
    height: 880,
    webPreferences: {
      preload: runtime.preloadPath,
      ...VIEW_PREFERENCES,
      backgroundThrottling: false,
    },
  })
  grantAndTrack(win.webContents, openPath)
  setViewOpenDecision(win.webContents.id, 'original')
  const url = new URL(diagramRendererUrl())
  url.searchParams.set('headless', '1')
  void win.loadURL(url.toString())
  return win
}

/** Before app ready, once per process: the schemes a standalone run needs (the shell lists them itself). */
export function registerDiagramPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([RENDERER_SCHEME_PRIVILEGE, DRAWIO_SCHEME_PRIVILEGE])
}

/** Standalone window mode: `npm run dev -w @genoffice/diagram`, a diagram path passed via argv */
export function startDiagramStandalone(): void {
  registerDiagramPrivilegedSchemes()
  configureDiagramRuntime({
    preloadPath: join(__dirname, '../preload/index.js'),
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    rendererFile: join(__dirname, '../renderer/index.html'),
  })
  if (process.env.GENOFFICE_USER_DATA) app.setPath('userData', process.env.GENOFFICE_USER_DATA)
  void app.whenReady().then(() => {
    setUiLang(normalizeLang(process.env.GENOFFICE_LANG ?? app.getLocale()))
    registerDiagramIpc()
    // there is no shell to answer these: the theme comes from the environment or the system
    const theme = process.env.GENOFFICE_THEME
    ipcMain.handle(APP_CHANNELS.getTheme, () =>
      theme === 'light' || theme === 'dark' ? theme : 'system',
    )
    ipcMain.handle(APP_CHANNELS.getAutoSaveDefault, () => ({ on: false, updatedAt: 0 }))
    if (theme === 'light' || theme === 'dark') nativeTheme.themeSource = theme
    diagramSession(sessionPaths())
    const win = new BrowserWindow({
      width: 1300,
      height: 880,
      show: process.env.DIAGRAM_HIDDEN !== '1',
      webPreferences: { preload: runtime.preloadPath, ...VIEW_PREFERENCES },
    })
    const argPath = process.argv
      .slice(1)
      .find((a) => detectDiagramFormat(a) !== null && existsSync(a))
    grantAndTrack(win.webContents, argPath)
    void win.loadURL(diagramRendererUrl())
  })
  app.on('window-all-closed', () => app.quit())
}
