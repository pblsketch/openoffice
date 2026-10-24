/**
 * The main-process side of the EPUB editor. The shell imports this file by
 * relative path, so it is compiled into the shell bundle; a standalone window
 * (`startEpubStandalone`) uses the same code.
 *
 * The book lives here, one session per view (`book-session.ts`): its bytes,
 * the engine's book, every chapter's current text and the range replacements
 * that made it. The renderer reads chapters over IPC and the book's pictures,
 * styles and fonts over `epub-asset://`, sends its edits here and asks for
 * saves. Decided here and not left to the renderer:
 *
 * - A file that did not open is never written. A path is a save target only
 *   after this side opened its bytes with the engine (and so the zip gate).
 * - An edit is refused while the tab's book translation runs, and for a
 *   fixed-layout book or chapter or a broken chapter.
 * - Nothing changed: the file is not written. Changed: only the edited ranges
 *   differ (the engine's `saveEpub`), written atomically, after the save
 *   conflict check; then the stored translations move to the new bytes.
 * - A result book is written only to a path this side's dialog picked for the
 *   view, never over the book itself or a file open in a tab.
 * - The result store is reached only with document hashes this side computed
 *   for the view.
 * - A link is opened only after `safeExternalUrl`, and only from here.
 */
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { BrowserWindow, WebContentsView, app, dialog, ipcMain, protocol, shell } from 'electron'
import type { WebContents } from 'electron'
import {
  DOCX_MEDIA_SCHEME_PRIVILEGE,
  RENDERER_SCHEME,
  RENDERER_SCHEME_PRIVILEGE,
  confirmOverwriteIfConflicted,
  contextMenuLabels,
  installContextMenu,
  installNavigationGuard,
  installRendererProtocol,
  isPathOpenElsewhere,
  recordDiskState,
  shouldDeferAutoSave,
  showSaveDialogWithMemory,
} from '@genoffice/electron-utils'
import type { SaveDiskState } from '@genoffice/electron-utils'
import { getUiLang, normalizeLang, setUiLang } from '@genoffice/i18n'
import { buildTranslatedEpub, epubTranslationUnits } from '@genoffice/epub-engine'
import { ResultStore } from '@genoffice/pdf-structure/store'
import { registerEpubAiIpc } from './ai-attachments'
import { EPUB_ASSET_SCHEME_PRIVILEGE, serveEpubAsset } from './asset-protocol'
import { atomicWriteFile } from './atomic-write'
import { EpubBookSession } from './book-session'
import { tm } from './i18n-main'
import { createReadingState, readPositionOf } from './reading-state'
import type { ReadingState } from './reading-state'
import { checkResultPath, pathKey, samePath } from './result-paths'
import { saveBook } from './save-pipeline'
import type { MigrateJobRecords } from './save-pipeline'
import { createEpubStoreHandlers } from './store-handlers'
import type { EpubStoreHandlers } from './store-handlers'
import { epubAssetBase, defaultResultName } from '../shared/asset-url'
import { APP_CHANNELS, EPUB_ASSET_SCHEME, EPUB_CHANNELS } from '../shared/ipc'
import { openableLink } from '../shared/links'
import type {
  EpubMenuCommand,
  EpubOpenFileResult,
  EpubOutcome,
  EpubPickResultTarget,
  EpubResultPathCheck,
  EpubSaveResult,
  EpubTranslationUnitsResult,
  EpubViewPrefs,
  EpubWriteTranslatedResult,
  SaveMode,
} from '../shared/ipc'

export { EPUB_ASSET_SCHEME_PRIVILEGE } from './asset-protocol'
export type { MigrateJobRecords } from './save-pipeline'

/** The one extension a book is saved with. */
const BOOK_EXTENSION = '.epub'
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/

export interface EpubRuntimeConfig {
  preloadPath: string
  /** the renderer's dev server, when one runs */
  rendererUrl?: string
  rendererFile?: string
  /** the app data folder (the result store and the reading positions live there); userData when left out */
  userDataDir?: () => string
  /** the shell's job-record migration after an in-app save; job records stay put without it */
  migrateJobRecords?: MigrateJobRecords
  /** whether a tab of the app (any editor) has this file open; result books never go there */
  isPathOpenInTab?: (path: string) => boolean
}

let runtime: EpubRuntimeConfig = { preloadPath: '' }

export function configureEpubRuntime(config: EpubRuntimeConfig): void {
  runtime = config
}

const userDataDir = (): string => runtime.userDataDir?.() ?? app.getPath('userData')

/** Open path per view, queued at tab creation; kept until the view is destroyed so a reload consumes it again. */
const openPathByWc = new Map<number, string>()
/** File paths granted to each view: opening only allows these */
const allowedByWc = new Map<number, Set<string>>()
/** Current save target per view; absent until this side has seen the file open */
const savePathByWc = new Map<number, string>()
/** Views whose file this side has not seen open: not asked for yet, or failed. Nothing is written for them. */
const unopenedByWc = new Map<number, 'pending' | 'failed'>()
/** The open book of each view */
const sessionByWc = new Map<number, EpubBookSession>()
/** Each view's asset token, and the view a token names */
const tokenByWc = new Map<number, string>()
const wcByToken = new Map<string, number>()
/** Every EPUB view, for the view settings broadcast */
const contentsByWc = new Map<number, WebContents>()
/** The renderer holds edits it has not sent yet */
const rendererDirtyByWc = new Set<number>()
/** Document hashes this side computed for each view: the only ones its store calls may name */
const knownHashesByWc = new Map<number, Set<string>>()
/** Result book paths this side's dialog picked for each view (path keys) */
const resultTargetsByWc = new Map<number, Set<string>>()
const closeSaveWaiters = new Map<number, (ok: boolean) => void>()
/** Resolvers for menu-triggered saves, resolved when the renderer's save invoke completes */
const saveWaiters = new Map<number, (ok: boolean) => void>()
/** The save running for each view; the next one waits for it */
const saveChainByWc = new Map<number, Promise<EpubSaveResult>>()

function mayWrite(wcId: number): boolean {
  return !unopenedByWc.has(wcId) && sessionByWc.has(wcId)
}

function know(wcId: number, docHash: string): void {
  const set = knownHashesByWc.get(wcId) ?? new Set<string>()
  set.add(docHash)
  knownHashesByWc.set(wcId, set)
}

let resultStore: ResultStore | null = null
const store = (): ResultStore => (resultStore ??= new ResultStore(userDataDir()))

let readingState: ReadingState | null = null
const reading = (): ReadingState =>
  (readingState ??= createReadingState({
    dir: userDataDir,
    write: (path, text) => atomicWriteFile(path, Buffer.from(text, 'utf8')),
  }))

/** Whether a tab has `path` open: this editor's own views, then whatever the shell knows. */
function isPathOpenInTab(path: string): boolean {
  for (const open of savePathByWc.values()) if (samePath(open, path)) return true
  for (const open of openPathByWc.values()) if (samePath(open, path)) return true
  try {
    return runtime.isPathOpenInTab?.(path) === true
  } catch {
    // a broken probe must not let a result overwrite an open file
    return true
  }
}

// ── Split-copy save guard (decision 0036), as in the other editors ──
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

/** Fired after a save lands on a NEW path (Save As): the shell syncs tab title, recents, projects */
let fileSavedHook: ((wc: WebContents, path: string) => void) | null = null

export function setEpubFileSavedHook(hook: (wc: WebContents, path: string) => void): void {
  fileSavedHook = hook
}

/** Unsaved edits: in the book here, or still in the renderer. */
export function epubIsDirty(webContentsId: number): boolean {
  if (!mayWrite(webContentsId)) return false
  return rendererDirtyByWc.has(webContentsId) || sessionByWc.get(webContentsId)?.isDirty() === true
}

export function epubFilePath(webContentsId: number): string | undefined {
  return savePathByWc.get(webContentsId)
}

/** Whether this tab's book translation runs (edits are refused meanwhile). */
export function epubIsTranslationLocked(webContentsId: number): boolean {
  return sessionByWc.get(webContentsId)?.locked === true
}

/** The file was renamed on disk: re-grant the new path and tell the renderer */
export function epubFileRenamed(contents: WebContents, oldPath: string, newPath: string): void {
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
  void reading()
    .movePosition(oldPath, newPath)
    .catch(() => {})
  if (!contents.isDestroyed()) contents.send(EPUB_CHANNELS.fileRenamed, newPath)
}

/**
 * Close guard: true means proceed with closing. Clean → true; dirty →
 * Save / Don't Save / Cancel. On Save, ask the renderer to send what it holds
 * and save, and await the result.
 */
export async function requestEpubClose(
  contents: WebContents,
  parent?: BrowserWindow | null,
): Promise<boolean> {
  if (contents.isDestroyed() || !epubIsDirty(contents.id)) return true
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
    contents.send(EPUB_CHANNELS.closeSaveRequest)
  })
}

/** Menu Save / Save As: ask the renderer to send what it holds and save; a clean plain save resolves true at once */
export function requestEpubSave(contents: WebContents, mode: SaveMode): Promise<boolean> {
  if (contents.isDestroyed() || !mayWrite(contents.id)) return Promise.resolve(false)
  if (mode === 'save' && !epubIsDirty(contents.id) && savePathByWc.has(contents.id)) {
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
    contents.send(EPUB_CHANNELS.saveRequest, mode)
  })
}

/**
 * Save the book to `filePath` with no dialog (the in-app MCP server's save).
 * Pointing the view's save target at `filePath` first keeps the save from
 * opening the dialog, so the renderer's normal save runs unattended.
 */
export function epubSaveToPath(contents: WebContents, filePath: string): Promise<void> {
  if (contents.isDestroyed()) return Promise.reject(new Error('the book is no longer open'))
  const wcId = contents.id
  if (!mayWrite(wcId)) {
    return Promise.reject(new Error('the file did not open, so there is no book to save'))
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
      reject(new Error('timed out saving the book'))
    }, 120_000)
    saveWaiters.set(wcId, (ok) => {
      clearTimeout(timer)
      if (ok) resolve()
      else {
        restore()
        reject(new Error('could not save the book'))
      }
    })
    contents.send(EPUB_CHANNELS.saveRequest, 'save')
  })
}

/**
 * The book's text for the in-app MCP server's `read`: chapters in spine
 * order, headings as `#` lines, the edits this side holds included (also the
 * unsaved ones). Nothing is written.
 */
export async function epubReadText(contents: WebContents): Promise<string> {
  if (contents.isDestroyed()) throw new Error('the book is no longer open')
  const session = sessionByWc.get(contents.id)
  if (!session) throw new Error('the file did not open, so there is no book to read')
  return session.readText()
}

/** Menu commands that need no answer: undo, redo, find and the like. */
export function sendEpubMenuCommand(contents: WebContents, command: EpubMenuCommand): void {
  if (!contents.isDestroyed()) contents.send(EPUB_CHANNELS.menuCommand, command)
}

// ── epub-asset:// ──

/**
 * Before app ready, once per process: the shell spreads this into its own
 * list; a standalone window calls `registerEpubPrivilegedSchemes`.
 */
export function registerEpubPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    RENDERER_SCHEME_PRIVILEGE,
    DOCX_MEDIA_SCHEME_PRIVILEGE,
    EPUB_ASSET_SCHEME_PRIVILEGE,
  ])
}

let assetProtocolRegistered = false

/** After app ready: serve the open books' entries. Safe to call more than once. */
export function registerEpubAssetProtocol(): void {
  if (assetProtocolRegistered) return
  assetProtocolRegistered = true
  protocol.handle(EPUB_ASSET_SCHEME, (request) =>
    serveEpubAsset(request, (token) => {
      const wcId = wcByToken.get(token)
      return wcId === undefined ? null : (sessionByWc.get(wcId)?.book ?? null)
    }),
  )
}

function assetTokenOf(wcId: number): string {
  const known = tokenByWc.get(wcId)
  if (known) return known
  const token = randomBytes(16).toString('hex')
  tokenByWc.set(wcId, token)
  wcByToken.set(token, wcId)
  return token
}

// ── save ──

function withBookExtension(path: string): string {
  return extname(path).toLowerCase() === BOOK_EXTENSION ? path : `${path}${BOOK_EXTENSION}`
}

const parentOf = (contents: WebContents) =>
  BrowserWindow.fromWebContents(contents) ?? BrowserWindow.getFocusedWindow() ?? undefined

async function resolveSaveTarget(
  contents: WebContents,
  mode: SaveMode,
): Promise<string | 'canceled'> {
  const current = savePathByWc.get(contents.id)
  if (mode === 'save' && current) return current
  const defaultPath = current
    ? join(dirname(current), basename(current))
    : join(app.getPath('documents'), `book${BOOK_EXTENSION}`)
  const picked = await showSaveDialogWithMemory(dialog, parentOf(contents), {
    title: tm('dlgSaveTitle'),
    defaultPath,
    filters: [{ name: tm('filterEpub'), extensions: [BOOK_EXTENSION.slice(1)] }],
  })
  if (picked.canceled || !picked.filePath) return 'canceled'
  return withBookExtension(picked.filePath)
}

const writeAtomically = (path: string, bytes: Uint8Array): Promise<void> =>
  atomicWriteFile(path, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))

async function saveView(contents: WebContents, request: unknown): Promise<EpubSaveResult> {
  const wcId = contents.id
  const session = sessionByWc.get(wcId)
  if (!mayWrite(wcId) || !session) {
    return { ok: false, error: 'epub: the file did not open, nothing is written' }
  }
  const raw = (request ?? {}) as { mode?: unknown; auto?: unknown }
  const mode: SaveMode = raw.mode === 'saveAs' ? 'saveAs' : 'save'
  // Request input is untrusted: only an explicit automatic-save flag counts
  const auto = raw.auto === true
  const current = savePathByWc.get(wcId)
  if (mode === 'save' && current && (await conflictStopsSave(contents, current, auto))) {
    return { ok: false, error: 'external-modified' }
  }
  const target = await resolveSaveTarget(contents, mode)
  if (target === 'canceled') return { ok: true, canceled: true }
  const sameFile = current !== undefined && samePath(current, target)
  const outcome = await saveBook(session, target, sameFile, {
    write: writeAtomically,
    store,
    ...(runtime.migrateJobRecords ? { migrateJobRecords: runtime.migrateJobRecords } : {}),
    log: (message) => console.warn(message),
  })
  if (!outcome.ok) return { ok: false, error: outcome.error }
  know(wcId, outcome.docHash)
  rendererDirtyByWc.delete(wcId)
  if (!outcome.written) return { ok: true, path: target, written: false, docHash: outcome.docHash }
  const isNewPath = !sameFile
  savePathByWc.set(wcId, target)
  // keep the reload path in sync: a stale open path would reopen the old file
  openPathByWc.set(wcId, target)
  const allowed = allowedByWc.get(wcId) ?? new Set<string>()
  allowed.add(target)
  allowedByWc.set(wcId, allowed)
  await rememberDiskState(wcId, target)
  if (current && isNewPath) forgetDiskState(wcId, current)
  if (isNewPath) fileSavedHook?.(contents, target)
  return { ok: true, path: target, written: true, docHash: outcome.docHash }
}

// ── book translation ──

function chaptersOf(value: unknown, count: number): number[] | undefined | null {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > count) return null
  if (!value.every((i) => Number.isSafeInteger(i) && i >= 0 && i < count)) return null
  return value as number[]
}

function resultPathCheck(wcId: number, path: unknown): EpubResultPathCheck {
  const source = savePathByWc.get(wcId) ?? openPathByWc.get(wcId) ?? ''
  return checkResultPath(path, { sourcePath: source, isOpenInTab: isPathOpenInTab })
}

async function pickResultPath(contents: WebContents, request: unknown): Promise<string | null> {
  const picked = await pickResultTarget(contents, request)
  return picked?.ok ? picked.path : null
}

/** The result book's save dialog; a refused pick says why and is not granted. */
async function pickResultTarget(
  contents: WebContents,
  request: unknown,
): Promise<EpubPickResultTarget> {
  const wcId = contents.id
  const source = savePathByWc.get(wcId)
  if (!source || !sessionByWc.has(wcId)) return null
  const { kind, lang, defaultName } = (request ?? {}) as Record<string, unknown>
  if (kind !== 'translated' && kind !== 'bilingual') return null
  if (typeof lang !== 'string' || !LANGUAGE_TAG.test(lang)) return null
  const suggested =
    typeof defaultName === 'string' && defaultName.length > 0 && defaultName.length <= 255
      ? // eslint-disable-next-line no-control-regex -- stripping control chars is the point here
        withBookExtension(basename(defaultName).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_'))
      : defaultResultName(source, lang, kind)
  const picked = await showSaveDialogWithMemory(dialog, parentOf(contents), {
    title: tm(kind === 'bilingual' ? 'dlgSaveBilingualTitle' : 'dlgSaveTranslatedTitle'),
    defaultPath: join(dirname(source), suggested),
    filters: [{ name: tm('filterEpub'), extensions: [BOOK_EXTENSION.slice(1)] }],
  })
  if (picked.canceled || !picked.filePath) return null
  const target = withBookExtension(picked.filePath)
  const check = resultPathCheck(wcId, target)
  if (!check.ok) return { ok: false, path: target, reason: check.reason }
  const targets = resultTargetsByWc.get(wcId) ?? new Set<string>()
  targets.add(pathKey(target))
  resultTargetsByWc.set(wcId, targets)
  return { ok: true, path: target }
}

async function writeTranslated(
  wcId: number,
  request: unknown,
): Promise<EpubOutcome<EpubWriteTranslatedResult>> {
  const session = sessionByWc.get(wcId)
  if (!session || !mayWrite(wcId)) return { ok: false, error: 'not-open' }
  if (typeof request !== 'object' || request === null) {
    return { ok: false, error: 'invalid-request', message: 'request must be an object' }
  }
  const { kind, lang, chapters: rawChapters, path, docHash } = request as Record<string, unknown>
  if (kind !== 'translated' && kind !== 'bilingual') {
    return { ok: false, error: 'invalid-request', message: 'bad kind' }
  }
  if (typeof lang !== 'string' || !LANGUAGE_TAG.test(lang) || lang.length > 128) {
    return { ok: false, error: 'invalid-request', message: 'bad language' }
  }
  const chapters = chaptersOf(rawChapters, session.book.spine.items.length)
  if (chapters === null) return { ok: false, error: 'invalid-request', message: 'bad chapters' }
  if (typeof path !== 'string' || !resultTargetsByWc.get(wcId)?.has(pathKey(path))) {
    return { ok: false, error: 'not-granted', message: 'the path was not picked for this view' }
  }
  const check = resultPathCheck(wcId, path)
  if (!check.ok) return { ok: false, error: 'invalid-target', message: check.reason }
  if (typeof docHash !== 'string' || !knownHashesByWc.get(wcId)?.has(docHash)) {
    return { ok: false, error: 'not-granted', message: 'unknown document hash' }
  }
  if (docHash !== session.docHash) {
    return { ok: false, error: 'stale', message: 'the book was saved since' }
  }
  const bytes = session.bytes
  try {
    const stored = await store().readTranslation(docHash, lang)
    const built = await buildTranslatedEpub(bytes, {
      kind,
      lang,
      ...(chapters ? { chapters } : {}),
      results: stored?.blocks ?? new Map(),
    })
    if (!built.ok)
      return { ok: false, error: 'refused', message: `${built.reason}: ${built.detail}` }
    // checked again right before the write: a tab may have opened the file meanwhile
    const again = resultPathCheck(wcId, path)
    if (!again.ok) return { ok: false, error: 'invalid-target', message: again.reason }
    await writeAtomically(path, built.bytes)
    resultTargetsByWc.get(wcId)?.delete(pathKey(path))
    return { ok: true, path, report: built.report, identifier: built.identifier }
  } catch (err) {
    return { ok: false, error: 'failed', message: err instanceof Error ? err.message : String(err) }
  }
}

// ── IPC ──

let ipcRegistered = false
let storeHandlers: EpubStoreHandlers | null = null

function registerEpubIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true
  registerEpubAssetProtocol()

  ipcMain.handle(EPUB_CHANNELS.consumePending, (e) => openPathByWc.get(e.sender.id) ?? null)

  ipcMain.handle(EPUB_CHANNELS.openFile, async (e, path: unknown): Promise<EpubOpenFileResult> => {
    const wcId = e.sender.id
    if (typeof path !== 'string' || !allowedByWc.get(wcId)?.has(path)) {
      throw new Error('epub: path not granted to this view')
    }
    // A reload of a view whose book holds unsaved edits gets that book back, edits and all.
    const held = sessionByWc.get(wcId)
    let session: EpubBookSession
    if (held && held.isDirty() && savePathByWc.get(wcId) === path) {
      session = held
    } else {
      let bytes: Uint8Array
      try {
        // the file's own buffer, handed to the session as the one copy of the book
        const file = await readFile(path)
        bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength)
      } catch {
        refuseWrites(wcId)
        return { status: 'refused', reason: 'unreadable' }
      }
      const opened = await EpubBookSession.open(bytes)
      if (!opened.ok) {
        console.warn(`[epub] the file did not open (${opened.reason}): ${path}`)
        refuseWrites(wcId)
        return { status: 'refused', reason: opened.reason }
      }
      session = opened.session
      sessionByWc.set(wcId, session)
      await rememberDiskState(wcId, path)
    }
    // Seen open, here: only now is the path a save target.
    unopenedByWc.delete(wcId)
    savePathByWc.set(wcId, path)
    know(wcId, session.docHash)
    return {
      status: 'ok',
      book: session.summary(),
      assetBase: epubAssetBase(assetTokenOf(wcId)),
      docHash: session.docHash,
      readOnly: session.bookReadOnly(),
    }
  })

  ipcMain.handle(EPUB_CHANNELS.readChapter, async (e, spineIndex: unknown) => {
    const session = sessionByWc.get(e.sender.id)
    if (!session) return { ok: false, error: 'not-open' }
    return session.readChapter(spineIndex)
  })

  ipcMain.handle(EPUB_CHANNELS.applyEdits, async (e, request: unknown) => {
    const session = sessionByWc.get(e.sender.id)
    if (!session || !mayWrite(e.sender.id)) return { ok: false, error: 'not-open' }
    const { spineIndex, edits } = (request ?? {}) as Record<string, unknown>
    return session.applyEdits(spineIndex, edits)
  })

  ipcMain.handle(EPUB_CHANNELS.replaceRanges, async (e, request: unknown) => {
    const session = sessionByWc.get(e.sender.id)
    if (!session || !mayWrite(e.sender.id)) return { ok: false, error: 'not-open' }
    const { spineIndex, version, replacements } = (request ?? {}) as Record<string, unknown>
    return session.replaceRanges(spineIndex, version, replacements)
  })

  ipcMain.handle(EPUB_CHANNELS.setTranslationLock, (e, locked: unknown): boolean => {
    const session = sessionByWc.get(e.sender.id)
    if (!session) return false
    session.setLocked(locked === true)
    return session.locked
  })

  ipcMain.handle(EPUB_CHANNELS.save, async (e, request: unknown): Promise<EpubSaveResult> => {
    const wcId = e.sender.id
    const waiter = saveWaiters.get(wcId)
    saveWaiters.delete(wcId)
    // one save at a time per view: a second one starts from the bytes the first wrote
    const previous = saveChainByWc.get(wcId) ?? Promise.resolve()
    const run = previous.then(async (): Promise<EpubSaveResult> => {
      try {
        return await saveView(e.sender, request)
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    })
    saveChainByWc.set(wcId, run)
    const result = await run
    if (saveChainByWc.get(wcId) === run) saveChainByWc.delete(wcId)
    waiter?.(result.ok && !('canceled' in result))
    return result
  })

  ipcMain.handle(EPUB_CHANNELS.openLink, async (e, url: unknown): Promise<boolean> => {
    if (!contentsByWc.has(e.sender.id)) return false
    const target = openableLink(url)
    if (!target) return false
    try {
      await shell.openExternal(target)
      return true
    } catch (err) {
      console.warn('[epub] the link could not be opened:', err)
      return false
    }
  })

  ipcMain.on(EPUB_CHANNELS.dirtyChanged, (e, dirty: unknown) => {
    if (dirty === true && mayWrite(e.sender.id)) rendererDirtyByWc.add(e.sender.id)
    else rendererDirtyByWc.delete(e.sender.id)
  })

  ipcMain.on(EPUB_CHANNELS.closeSaveResult, (e, ok: unknown) => {
    const waiter = closeSaveWaiters.get(e.sender.id)
    closeSaveWaiters.delete(e.sender.id)
    waiter?.(ok === true)
  })

  // safety net for menu saves the renderer declined without invoking save()
  ipcMain.on(EPUB_CHANNELS.saveRequestAck, (e, ok: unknown) => {
    const waiter = saveWaiters.get(e.sender.id)
    saveWaiters.delete(e.sender.id)
    waiter?.(ok === true)
  })

  // ---- reading position and view settings ----

  ipcMain.handle(EPUB_CHANNELS.getReadingState, (e) =>
    reading().get(sessionByWc.has(e.sender.id) ? (savePathByWc.get(e.sender.id) ?? null) : null),
  )

  ipcMain.on(EPUB_CHANNELS.setReadPosition, (e, position: unknown) => {
    const path = savePathByWc.get(e.sender.id)
    const session = sessionByWc.get(e.sender.id)
    const checked = readPositionOf(position)
    if (!path || !session || !checked) return
    if (checked.spineIndex >= session.book.spine.items.length) return
    void reading()
      .setPosition(path, checked)
      .catch((err) => console.warn('[epub] the reading position was not saved:', err))
  })

  ipcMain.handle(EPUB_CHANNELS.setViewPrefs, async (e, patch: unknown): Promise<EpubViewPrefs> => {
    if (!contentsByWc.has(e.sender.id)) throw new Error('epub: not an EPUB view')
    const prefs = await reading().setViewPrefs(patch)
    for (const [wcId, contents] of contentsByWc) {
      if (wcId !== e.sender.id && !contents.isDestroyed()) {
        contents.send(EPUB_CHANNELS.viewPrefsChanged, prefs)
      }
    }
    return prefs
  })

  // ---- book translation ----

  ipcMain.handle(EPUB_CHANNELS.documentHash, (e): EpubOutcome<{ docHash: string }> => {
    const session = sessionByWc.get(e.sender.id)
    if (!session) return { ok: false, error: 'not-open' }
    know(e.sender.id, session.docHash)
    return { ok: true, docHash: session.docHash }
  })

  ipcMain.handle(
    EPUB_CHANNELS.translationUnits,
    async (e, request: unknown): Promise<EpubOutcome<EpubTranslationUnitsResult>> => {
      const session = sessionByWc.get(e.sender.id)
      if (!session) return { ok: false, error: 'not-open' }
      const raw = (request ?? {}) as Record<string, unknown>
      const chapters = chaptersOf(raw.chapters, session.book.spine.items.length)
      if (chapters === null) return { ok: false, error: 'invalid-request', message: 'bad chapters' }
      const { book, docHash } = session
      know(e.sender.id, docHash)
      try {
        const { units, skipped } = await epubTranslationUnits(book, chapters ? { chapters } : {})
        return { ok: true, docHash, units, skipped }
      } catch (err) {
        return {
          ok: false,
          error: 'failed',
          message: err instanceof Error ? err.message : String(err),
        }
      }
    },
  )

  ipcMain.handle(EPUB_CHANNELS.pickResultPath, (e, request: unknown) =>
    pickResultPath(e.sender, request),
  )

  ipcMain.handle(EPUB_CHANNELS.pickResultTarget, (e, request: unknown) =>
    pickResultTarget(e.sender, request),
  )

  ipcMain.handle(EPUB_CHANNELS.checkResultPath, (e, path: unknown) =>
    resultPathCheck(e.sender.id, path),
  )

  ipcMain.handle(EPUB_CHANNELS.writeTranslated, (e, request: unknown) =>
    writeTranslated(e.sender.id, request),
  )

  // ---- the result store ----

  const handlers = (storeHandlers ??= createEpubStoreHandlers({
    store,
    knows: (owner, docHash) => knownHashesByWc.get(owner)?.has(docHash) === true,
  }))
  ipcMain.handle(EPUB_CHANNELS.storeTranslations, (e, docHash: unknown) =>
    handlers.translations(e.sender.id, docHash),
  )
  ipcMain.handle(EPUB_CHANNELS.storeTranslation, (e, docHash: unknown, lang: unknown) =>
    handlers.translation(e.sender.id, docHash, lang),
  )
  ipcMain.handle(EPUB_CHANNELS.storeUnfinishedJobs, (e, docHash: unknown) =>
    handlers.unfinishedJobs(e.sender.id, docHash),
  )
  ipcMain.handle(EPUB_CHANNELS.storeWrite, (e, request: unknown) =>
    handlers.write(e.sender.id, request),
  )

  // the AI panel's attachments
  registerEpubAiIpc()

  // Language channel shared with other modules; removeHandler tolerates duplicate registration
  ipcMain.removeHandler(APP_CHANNELS.getLanguage)
  ipcMain.handle(APP_CHANNELS.getLanguage, () => getUiLang())
}

/** The view's file did not open: it has no save target and gets none. */
function refuseWrites(wcId: number): void {
  unopenedByWc.set(wcId, 'failed')
  savePathByWc.delete(wcId)
  sessionByWc.delete(wcId)
  rendererDirtyByWc.delete(wcId)
}

function forgetView(wcId: number): void {
  openPathByWc.delete(wcId)
  allowedByWc.delete(wcId)
  savePathByWc.delete(wcId)
  unopenedByWc.delete(wcId)
  sessionByWc.delete(wcId)
  contentsByWc.delete(wcId)
  rendererDirtyByWc.delete(wcId)
  knownHashesByWc.delete(wcId)
  resultTargetsByWc.delete(wcId)
  docDiskStates.delete(wcId)
  const token = tokenByWc.get(wcId)
  if (token) wcByToken.delete(token)
  tokenByWc.delete(wcId)
  closeSaveWaiters.get(wcId)?.(false)
  closeSaveWaiters.delete(wcId)
  saveWaiters.get(wcId)?.(false)
  saveWaiters.delete(wcId)
  saveChainByWc.delete(wcId)
}

function grantAndTrack(wc: WebContents, openPath?: string | null): void {
  const wcId = wc.id
  contentsByWc.set(wcId, wc)
  // A book view always opens a file; until it has opened here nothing is written.
  unopenedByWc.set(wcId, 'pending')
  if (openPath && existsSync(openPath)) {
    openPathByWc.set(wcId, openPath)
    allowedByWc.set(wcId, new Set([openPath]))
  }
  // The book never opens a window or leaves its page. An outside link is opened
  // by the openLink handler, after safeExternalUrl; nothing else reaches the system.
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  wc.on('will-navigate', (event, url) => {
    if (url !== wc.getURL()) event.preventDefault()
  })
  wc.once('destroyed', () => forgetView(wcId))
}

/** The address the renderer is loaded from: the dev server when one runs, else the built files behind the app scheme. */
function epubRendererUrl(): string {
  return runtime.rendererUrl ?? `${RENDERER_SCHEME}://epub/index.html`
}

const VIEW_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
} as const

/** A book tab for the shell. */
export function createEpubView(openPath: string): WebContentsView {
  registerEpubIpc()
  const view = new WebContentsView({
    webPreferences: { preload: runtime.preloadPath, ...VIEW_PREFERENCES },
  })
  grantAndTrack(view.webContents, openPath)
  void view.webContents.loadURL(epubRendererUrl())
  return view
}

/** Standalone window mode: `npm run dev -w @genoffice/epub`, a book path passed via argv */
export function startEpubStandalone(): void {
  registerEpubPrivilegedSchemes()
  installNavigationGuard(app)
  installContextMenu(app, () => contextMenuLabels(getUiLang()))
  configureEpubRuntime({
    preloadPath: join(__dirname, '../preload/index.js'),
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    rendererFile: join(__dirname, '../renderer/index.html'),
  })
  // A scratch profile for scripted runs, the same variable the shell reads.
  if (process.env.GENOFFICE_USER_DATA) app.setPath('userData', process.env.GENOFFICE_USER_DATA)
  void app.whenReady().then(() => {
    // there is no shell to say which language the user picked
    setUiLang(normalizeLang(process.env.GENOFFICE_LANG ?? app.getLocale()))
    installRendererProtocol({ epub: join(__dirname, '../renderer') })
    registerEpubIpc()
    const win = new BrowserWindow({
      width: 1200,
      height: 850,
      webPreferences: { preload: runtime.preloadPath, ...VIEW_PREFERENCES },
    })
    const argPath = process.argv.slice(1).find((a) => /\.epub$/i.test(a) && existsSync(a))
    grantAndTrack(win.webContents, argPath)
    void win.loadURL(epubRendererUrl())
  })
  app.on('window-all-closed', () => app.quit())
}
