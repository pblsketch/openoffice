/**
 * Crash-recovery copies shared by the eight editors and the shell.
 *
 * A recovery copy holds the unsaved state of one document (one file path, or
 * one untitled tab) inside the app data folder: the bytes a save would have
 * written at that moment. There is one latest copy per document, never a
 * history. The user's original file is never written or touched here, and no
 * file is ever created outside `<userData>/<kind>-autosave`.
 *
 * Layout (kept compatible with the copies earlier versions left behind):
 *
 *   <userData>/<kind>-autosave/<sha1(filePath)[0..16]><ext>            file copy
 *   <userData>/<kind>-autosave/<sha1(filePath)[0..16]><ext>.meta.json  its metadata
 *   <userData>/<kind>-autosave/untitled/<id><ext>                      untitled copy
 *   <userData>/<kind>-autosave/untitled/<id><ext>.meta.json
 *
 * The hash is taken over the path string exactly as the editor holds it, as
 * the Word, Excel and PowerPoint editors always did. The extension follows
 * their rules too: Word keeps `.odt` for an ODT document and `.docx` otherwise,
 * Excel always `.xlsx`, PowerPoint always `.pptx`; the newer editors keep the
 * document's own extension (`.hwp` stays `.hwp`, `.hwpx` stays `.hwpx`).
 *
 * Metadata never holds document content: kind, original path (null when
 * untitled), untitled id, tab title, last write time, the writing run's id and
 * the copy's state. An untitled copy may also name the file it was opened
 * from when the editor cannot write back to that file (Excel's CSV and
 * converted workbooks): the launch list shows its folder and the first Save
 * As offers it. A copy without readable metadata — what earlier versions
 * wrote — reads as state "later": it is offered when its file is opened.
 *
 * The store keeps whatever bytes it is given. Callers must not pass decrypted
 * content of a document that cannot be protected (password Excel, password
 * HWP, password PDF): such a document gets no copy at all. Word and
 * PowerPoint pass their copy already re-encrypted with the document password.
 *
 * After "Don't Save" the document takes no new copy until its close is
 * cancelled (`resumeDiscardedCopies`) or it is opened again: the close prompt
 * walks the dirty tabs one at a time, and a tab already answered keeps its
 * edits (and its copy timer) while the user still answers a later one.
 *
 * Process-wide state (the shutdown latch, delete epochs, write queues, the run
 * id, the "Don't Save" block, the editor registry) sits behind `Symbol.for(...)`
 * keys: every editor bundles its own copy of this package and the shell runs
 * them all in one process, so the copy the shell marks must be the one an
 * editor reads.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, isAbsolute } from 'node:path'
import { atomicMoveFile, atomicWriteFile, tempPathBeside, writeJsonAtomic } from './atomic-write'

/** the editors that keep recovery copies, in folder order */
export const RECOVERY_EDITOR_KINDS = [
  'docs',
  'sheets',
  'slides',
  'hwp',
  'pdf',
  'markdown',
  'html',
  'mindmap',
] as const

export type RecoveryEditorKind = (typeof RECOVERY_EDITOR_KINDS)[number]

/**
 * - `undecided`: written since the user last chose anything. A copy left by an
 *   abnormal exit stays undecided until the user chooses.
 * - `later`: the user closed the launch list without choosing.
 * - `restoreChosen`: "restore" was chosen in the launch list, the tab is not
 *   loaded yet.
 * "Discard" deletes the copy, so it has no state.
 */
export type RecoveryCopyState = 'undecided' | 'later' | 'restoreChosen'

/** a document with a file on disk */
export interface RecoveryFileIdentity {
  kind: RecoveryEditorKind
  filePath: string
}

/** a document that was never saved; `ext` is the format its copy is written in */
export interface RecoveryUntitledIdentity {
  kind: RecoveryEditorKind
  untitledId: string
  /** lower-case, with the dot: '.docx', '.hwpx', '.md' */
  ext: string
}

export type RecoveryIdentity = RecoveryFileIdentity | RecoveryUntitledIdentity

/**
 * Why a copy is deleted. While the app is ending only `saved` and `dontSave`
 * go through (see the shutdown latch below).
 * - `saved`: the document was saved (manual, autosave, Save As, MCP save).
 * - `dontSave`: the user answered "Don't Save" in a close prompt, or an MCP /
 *   AI tool closed the document without saving.
 * - `discarded`: "Discard" in the launch list or the per-file prompt.
 * - `closedClean`: a loaded tab closed with no unsaved changes.
 */
export type RecoveryDeleteReason = 'saved' | 'dontSave' | 'discarded' | 'closedClean'

/** what the launch list decided for one copy */
export type RecoveryLaunchDecision = 'restore' | 'discard' | 'later'

/** copies whose file was untouched this long are removed at launch (tunable) */
export const RECOVERY_COPY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export interface RecoveryCopyInfo {
  identity: RecoveryIdentity
  kind: RecoveryEditorKind
  /** null for an untitled document, and for a legacy copy (never listed) */
  filePath: string | null
  untitledId: string | null
  /** tab title at the last write; the file name for a legacy file copy */
  title: string
  /** last write in ms since the epoch (the copy's mtime for a legacy copy) */
  writtenAt: number
  /** the run that wrote the copy; '' for a legacy copy */
  runId: string
  state: RecoveryCopyState
  /** true when the copy has no metadata (left by an earlier version) */
  legacy: boolean
  copyPath: string
  copyMtimeMs: number
  /** the file on disk was modified after the copy was written */
  fileChangedAfterCopy: boolean
  /** a path is known but no file is there (deleted, moved, drive removed) */
  originalMissing: boolean
  /**
   * For an untitled copy only: the file the document was opened from when the
   * editor cannot write the copy back to it (a CSV or a converted workbook).
   * Shown as the copy's folder and offered as the first Save As. Null otherwise.
   */
  originalPath: string | null
}

/**
 * What an editor does when it opens a document:
 * - `none`: no copy, open the file.
 * - `restore`: "restore" was already chosen, open the copy's content without
 *   asking; the original path stays the save target and the save base.
 * - `ask`: an undecided or later copy, the per-file prompt comes first and the
 *   document content is not loaded before it is answered.
 */
export type RecoveryOpenPlan =
  | { action: 'none' }
  | { action: 'restore'; copy: RecoveryCopyInfo }
  | { action: 'ask'; copy: RecoveryCopyInfo }

/**
 * Snapshot of a document's delete epoch, taken when serialization starts. A
 * write carrying a ticket from before a delete (a save, a "Don't Save") never
 * lands. Editors whose main process serializes for a while (slides, sheets)
 * take the ticket before they start; a copy pushed by a renderer over IPC can
 * use the default ticket taken on arrival, because IPC from one renderer is
 * handled in order and the save request arrives after it.
 */
export interface RecoveryWriteTicket {
  readonly key: string
  readonly epoch: number
}

export type RecoveryWriteResult = 'written' | 'superseded'

/** streams a copy to the temp path the store hands it (see writeCopyStreamed) */
export type RecoveryCopyWriter = (tempPath: string) => Promise<void>

export interface RecoveryWriteOptions {
  title?: string
  ticket?: RecoveryWriteTicket
  /**
   * An untitled copy's original file (see RecoveryCopyInfo.originalPath).
   * Recorded with every write that gives it; ignored for a file copy.
   */
  originalPath?: string
}

export interface RecoveryCopyFilter {
  states?: readonly RecoveryCopyState[]
  kinds?: readonly RecoveryEditorKind[]
  /** true: untitled copies only; false: file copies only */
  untitled?: boolean
}

export interface RecoveryStoreOptions {
  /** the app data folder, e.g. `app.getPath('userData')`; read on every call */
  userDataDir: string | (() => string)
}

export interface RecoveryStore {
  /** where this document's copy lives (whether or not it exists) */
  copyPath(identity: RecoveryIdentity): string
  /** take a write ticket now (see RecoveryWriteTicket) */
  beginWrite(identity: RecoveryIdentity): RecoveryWriteTicket
  /**
   * Write (or replace) the copy atomically and mark it undecided. Writes for
   * one document are serialized. Answers 'superseded' when a delete came
   * after the ticket: nothing is left on disk then. Rejects on a disk error
   * (the caller backs off and retries later, as slides' autosaveBackoff does).
   */
  writeCopy(
    identity: RecoveryIdentity,
    bytes: Buffer,
    options?: RecoveryWriteOptions,
  ): Promise<RecoveryWriteResult>
  /**
   * writeCopy for content too large to hold in memory: `write` streams the
   * copy to the temp path it is given (a dotted `.tmp` file beside the copy,
   * which the stale-copy prune also clears), and the store moves it into place.
   * Same guarantees as writeCopy: queued with every other write of the
   * document, atomic rename, metadata marked undecided, 'superseded' (with the
   * temp file and any copy removed) when a delete came after the ticket —
   * before `write` runs it is not called at all — and a rejection, with the
   * temp file removed, when `write` or the disk fails.
   */
  writeCopyStreamed(
    identity: RecoveryIdentity,
    write: RecoveryCopyWriter,
    options?: RecoveryWriteOptions,
  ): Promise<RecoveryWriteResult>
  /**
   * Delete the copy and its metadata now. Any write already started for the
   * document is cancelled. While the app is ending, only `saved` and
   * `dontSave` are carried out; everything else answers 'refused' and leaves
   * the copy (and in-flight writes) alone. `dontSave` also blocks the
   * document's later writes ('superseded', nothing written) until the close
   * is cancelled (`resumeDiscardedCopies`) or the document is opened again
   * (`openPlan`, `markCopyLoaded`, `clearDiscarded`).
   */
  deleteCopy(identity: RecoveryIdentity, reason: RecoveryDeleteReason): 'deleted' | 'refused'
  /** the document was discarded with "Don't Save" and takes no copy for now */
  isDiscarded(identity: RecoveryIdentity): boolean
  /**
   * The document is open (again) with edits that are not the discarded ones:
   * its copies are written again. `openPlan` and `markCopyLoaded` do this too.
   */
  clearDiscarded(identity: RecoveryIdentity): void
  /** the copy's description, or null when there is none */
  copyInfo(identity: RecoveryIdentity): RecoveryCopyInfo | null
  readCopy(identity: RecoveryIdentity): Promise<Buffer | null>
  /** what opening the document does; the document is being opened, so a "Don't Save" block lifts */
  openPlan(identity: RecoveryIdentity): RecoveryOpenPlan
  /** false when there is no copy */
  setCopyState(identity: RecoveryIdentity, state: RecoveryCopyState): boolean
  /**
   * Record a launch-list choice: restore → restoreChosen, later → later,
   * discard → delete. False when nothing changed (no copy, or a discard
   * refused while the app is ending).
   */
  applyLaunchDecision(identity: RecoveryIdentity, decision: RecoveryLaunchDecision): boolean
  /**
   * The editor loaded the copy's content into a tab: the copy is undecided
   * again (and a "Don't Save" block lifts).
   */
  markCopyLoaded(identity: RecoveryIdentity): boolean
  /**
   * Copies with metadata, oldest first. Legacy file copies have no path to
   * show and are only found per file (`copyInfo`, `openPlan`).
   */
  listCopies(filter?: RecoveryCopyFilter): RecoveryCopyInfo[]
  /** any undecided or restoreChosen copy left (the normal-exit judgment) */
  hasUnresolvedCopies(): boolean
  /**
   * Remove copies (legacy ones and leftover temp files included) whose file
   * was untouched for longer than `maxAgeMs`. Answers how many were removed;
   * does nothing while the app is ending.
   */
  pruneStaleCopies(maxAgeMs?: number): number
  /**
   * Move a copy that sits in the editor's own recovery folder (Excel's old
   * unsaved-new copies) into a new untitled slot. Null, with the source left
   * alone, when it is outside that folder or the move fails.
   */
  adoptUntitledCopy(
    kind: RecoveryEditorKind,
    sourcePath: string,
    options: { title: string; ext: string; state?: RecoveryCopyState; originalPath?: string },
  ): RecoveryUntitledIdentity | null
}

// ---- process-wide state ----

interface SharedRecoveryState {
  shuttingDown: boolean
  epochs: Map<string, number>
  queues: Map<string, Promise<unknown>>
  runId: string
  /** documents (by write queue key) discarded with "Don't Save", see deleteCopy */
  discarded: Set<string>
}

const SHARED = Symbol.for('genoffice.recovery-store.shared')

function shared(): SharedRecoveryState {
  const holder = globalThis as unknown as Record<symbol, SharedRecoveryState | undefined>
  let state = holder[SHARED]
  if (!state) {
    state = {
      shuttingDown: false,
      epochs: new Map(),
      queues: new Map(),
      runId: randomBytes(8).toString('hex'),
      discarded: new Set(),
    }
    holder[SHARED] = state
  }
  return state
}

/** this process's run id, recorded in every copy it writes */
export function recoveryRunId(): string {
  return shared().runId
}

/**
 * The app is ending (before-quit, SIGTERM/SIGINT, OS session end). From now
 * on the store refuses deletions except a successful save and an explicit
 * "Don't Save", so editors' close cleanups cannot remove the copy just written.
 */
export function markAppShuttingDown(): void {
  shared().shuttingDown = true
}

/** the quit was vetoed (a close was cancelled): deletions work normally again */
export function resetAppShuttingDown(): void {
  shared().shuttingDown = false
}

export function isAppShuttingDown(): boolean {
  return shared().shuttingDown
}

/**
 * A close was cancelled: every document discarded with "Don't Save" while
 * it was being answered is still open with its edits, so its copies resume.
 */
export function resumeDiscardedCopies(): void {
  shared().discarded.clear()
}

// ---- addressing ----

const META_SUFFIX = '.meta.json'
const UNTITLED_DIR = 'untitled'
const EXT_RE = /^\.[a-z0-9]{1,10}$/
const UNTITLED_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const FILE_COPY_RE = /^[0-9a-f]{16}\.[a-z0-9]{1,10}$/
const UNTITLED_COPY_RE = /^[A-Za-z0-9_-]{1,64}\.[a-z0-9]{1,10}$/
const TEMP_RE = /^\..+\.[0-9a-f]{12}\.tmp$/

const KIND_DEFAULT_EXT: Record<RecoveryEditorKind, string> = {
  docs: '.docx',
  sheets: '.xlsx',
  slides: '.pptx',
  hwp: '.hwp',
  pdf: '.pdf',
  markdown: '.md',
  html: '.html',
  mindmap: '.xmind',
}

export function recoveryFolderName(kind: RecoveryEditorKind): string {
  return `${kind}-autosave`
}

/** a fresh id for an untitled document's copy */
export function newUntitledRecoveryId(): string {
  return randomUUID()
}

export function isUntitledIdentity(
  identity: RecoveryIdentity,
): identity is RecoveryUntitledIdentity {
  return 'untitledId' in identity
}

const isKind = (value: unknown): value is RecoveryEditorKind =>
  typeof value === 'string' && (RECOVERY_EDITOR_KINDS as readonly string[]).includes(value)

const pathHash = (filePath: string) =>
  createHash('sha1').update(filePath).digest('hex').slice(0, 16)

/** the copy's extension for a file document (see the module comment) */
function fileCopyExt(kind: RecoveryEditorKind, filePath: string): string {
  if (kind === 'docs') return /\.odt$/i.test(filePath) ? '.odt' : '.docx'
  if (kind === 'sheets') return '.xlsx'
  if (kind === 'slides') return '.pptx'
  const ext = extname(filePath).toLowerCase()
  return EXT_RE.test(ext) ? ext : KIND_DEFAULT_EXT[kind]
}

function assertKind(kind: RecoveryEditorKind): void {
  if (!isKind(kind)) throw new Error(`unknown recovery editor kind: ${String(kind)}`)
}

function assertUntitled(untitledId: string, ext: string): void {
  if (!UNTITLED_ID_RE.test(untitledId)) throw new Error('invalid untitled recovery id')
  if (!EXT_RE.test(ext)) throw new Error('invalid recovery copy extension')
}

/** copy file name inside the kind folder (untitled ones under `untitled/`) */
function copyRelativePath(identity: RecoveryIdentity): string {
  assertKind(identity.kind)
  if (isUntitledIdentity(identity)) {
    assertUntitled(identity.untitledId, identity.ext)
    return join(UNTITLED_DIR, `${identity.untitledId}${identity.ext}`)
  }
  if (typeof identity.filePath !== 'string' || identity.filePath.length === 0)
    throw new Error('recovery identity needs a file path')
  return `${pathHash(identity.filePath)}${fileCopyExt(identity.kind, identity.filePath)}`
}

const queueKey = (copyPath: string) =>
  process.platform === 'win32' ? copyPath.toLowerCase() : copyPath

// ---- metadata ----

interface RecoveryCopyMeta {
  version: 1
  kind: RecoveryEditorKind
  filePath: string | null
  untitledId: string | null
  title: string
  writtenAt: number
  runId: string
  state: RecoveryCopyState
  /** untitled copies only, and only when known (absent in older metadata) */
  originalPath?: string
}

const STATES: readonly RecoveryCopyState[] = ['undecided', 'later', 'restoreChosen']

/** the metadata when it is readable and belongs to this identity, else null (legacy) */
function readMeta(metaPath: string, identity: RecoveryIdentity): RecoveryCopyMeta | null {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(metaPath, 'utf8'))
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const meta = raw as Partial<RecoveryCopyMeta>
  if (meta.kind !== identity.kind) return null
  if (!STATES.includes(meta.state as RecoveryCopyState)) return null
  if (typeof meta.title !== 'string' || typeof meta.runId !== 'string') return null
  if (typeof meta.writtenAt !== 'number' || !Number.isFinite(meta.writtenAt)) return null
  if (isUntitledIdentity(identity)) {
    if (meta.untitledId !== identity.untitledId || meta.filePath !== null) return null
  } else if (meta.filePath !== identity.filePath || meta.untitledId !== null) {
    return null
  }
  return {
    version: 1,
    kind: meta.kind,
    filePath: meta.filePath,
    untitledId: meta.untitledId,
    title: meta.title,
    writtenAt: meta.writtenAt,
    runId: meta.runId,
    state: meta.state as RecoveryCopyState,
    ...originalPathField(identity, meta.originalPath),
  }
}

/** the metadata field for an untitled copy's original path (nothing otherwise) */
function originalPathField(
  identity: RecoveryIdentity,
  originalPath: unknown,
): { originalPath?: string } {
  if (!isUntitledIdentity(identity)) return {}
  return typeof originalPath === 'string' && originalPath.length > 0 ? { originalPath } : {}
}

/** the identity a metadata file next to `copyName` describes, or null */
function identityFromMeta(
  kind: RecoveryEditorKind,
  metaPath: string,
  copyName: string,
  untitled: boolean,
): RecoveryIdentity | null {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(metaPath, 'utf8'))
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const meta = raw as Partial<RecoveryCopyMeta>
  const ext = extname(copyName)
  if (untitled) {
    const id = copyName.slice(0, -ext.length)
    return meta.untitledId === id ? { kind, untitledId: id, ext } : null
  }
  if (typeof meta.filePath !== 'string' || meta.filePath.length === 0) return null
  const identity = { kind, filePath: meta.filePath }
  // the name must be the one this path hashes to, or the metadata is not this copy's
  return copyRelativePath(identity) === copyName ? identity : null
}

const statMtime = (path: string): number | null => {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

function removeQuietly(path: string): boolean {
  try {
    unlinkSync(path)
    return true
  } catch {
    return false
  }
}

// ---- the store ----

export function createRecoveryStore(options: RecoveryStoreOptions): RecoveryStore {
  const rootDir = () =>
    typeof options.userDataDir === 'function' ? options.userDataDir() : options.userDataDir
  const kindDir = (kind: RecoveryEditorKind) => join(rootDir(), recoveryFolderName(kind))
  const copyPath = (identity: RecoveryIdentity) =>
    join(kindDir(identity.kind), copyRelativePath(identity))
  const metaPathOf = (copy: string) => `${copy}${META_SUFFIX}`
  const epochOf = (key: string) => shared().epochs.get(key) ?? 0

  function beginWrite(identity: RecoveryIdentity): RecoveryWriteTicket {
    const key = queueKey(copyPath(identity))
    return { key, epoch: epochOf(key) }
  }

  /** run `task` after every earlier task for the same document */
  function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const queues = shared().queues
    const previous = queues.get(key) ?? Promise.resolve()
    const run = previous.then(task, task)
    const settled = run.then(
      () => {},
      () => {},
    )
    queues.set(key, settled)
    void settled.then(() => {
      if (queues.get(key) === settled) queues.delete(key)
    })
    return run
  }

  function removeCopyFiles(copy: string): void {
    removeQuietly(copy)
    removeQuietly(metaPathOf(copy))
  }

  /**
   * The common shape of writeCopy and writeCopyStreamed: check the ticket,
   * run `land` inside the document's queue, and undo the result when a delete
   * got in meanwhile. `land` gets the metadata to record and writes it.
   */
  function queueCopyWrite(
    identity: RecoveryIdentity,
    writeOptions: RecoveryWriteOptions,
    land: (copy: string, writeMeta: () => void, superseded: () => boolean) => Promise<boolean>,
  ): Promise<RecoveryWriteResult> {
    const copy = copyPath(identity)
    const key = queueKey(copy)
    const ticket = writeOptions.ticket ?? { key, epoch: epochOf(key) }
    if (ticket.key !== key)
      return Promise.reject(new Error('recovery write ticket belongs to another document'))
    const untitled = isUntitledIdentity(identity)
    const title =
      writeOptions.title ?? (untitled ? '' : basename((identity as RecoveryFileIdentity).filePath))
    const superseded = () => epochOf(key) !== ticket.epoch
    const writeMeta = () => {
      const meta: RecoveryCopyMeta = {
        version: 1,
        kind: identity.kind,
        filePath: untitled ? null : (identity as RecoveryFileIdentity).filePath,
        untitledId: untitled ? identity.untitledId : null,
        title,
        writtenAt: Date.now(),
        runId: recoveryRunId(),
        state: 'undecided',
        ...originalPathField(identity, writeOptions.originalPath),
      }
      writeJsonAtomic(metaPathOf(copy), meta)
    }
    return enqueue(key, async () => {
      // "Don't Save" holds until the close is cancelled or the document reopens
      if (superseded() || shared().discarded.has(key)) return 'superseded'
      mkdirSync(dirname(copy), { recursive: true })
      if (!(await land(copy, writeMeta, superseded))) return 'superseded'
      // a delete that ran while the bytes were landing (it unlinked before the
      // rename) must still win: undo this write. Later writes wait in the queue,
      // so this never removes a newer copy.
      if (superseded()) {
        removeCopyFiles(copy)
        return 'superseded'
      }
      return 'written'
    })
  }

  function writeCopy(
    identity: RecoveryIdentity,
    bytes: Buffer,
    writeOptions: RecoveryWriteOptions = {},
  ): Promise<RecoveryWriteResult> {
    return queueCopyWrite(identity, writeOptions, async (copy, writeMeta) => {
      // metadata first: a crash between the two leaves an orphan metadata file
      // (ignored), never an untitled copy without its title
      writeMeta()
      await atomicWriteFile(copy, bytes)
      return true
    })
  }

  function writeCopyStreamed(
    identity: RecoveryIdentity,
    write: RecoveryCopyWriter,
    writeOptions: RecoveryWriteOptions = {},
  ): Promise<RecoveryWriteResult> {
    return queueCopyWrite(identity, writeOptions, async (copy, writeMeta, superseded) => {
      const temp = tempPathBeside(copy)
      try {
        await write(temp)
        // a delete during the (long) serialization: the temp never becomes the copy
        if (superseded()) {
          removeQuietly(temp)
          return false
        }
        // metadata first, as in writeCopy
        writeMeta()
        await atomicMoveFile(temp, copy)
        return true
      } catch (error) {
        removeQuietly(temp)
        throw error
      }
    })
  }

  function deleteCopy(
    identity: RecoveryIdentity,
    reason: RecoveryDeleteReason,
  ): 'deleted' | 'refused' {
    if (isAppShuttingDown() && reason !== 'saved' && reason !== 'dontSave') return 'refused'
    const copy = copyPath(identity)
    const key = queueKey(copy)
    shared().epochs.set(key, epochOf(key) + 1)
    if (reason === 'dontSave') shared().discarded.add(key)
    removeCopyFiles(copy)
    return 'deleted'
  }

  const isDiscarded = (identity: RecoveryIdentity): boolean =>
    shared().discarded.has(queueKey(copyPath(identity)))

  function clearDiscarded(identity: RecoveryIdentity): void {
    shared().discarded.delete(queueKey(copyPath(identity)))
  }

  function infoFor(identity: RecoveryIdentity, copy: string): RecoveryCopyInfo | null {
    const copyMtimeMs = statMtime(copy)
    if (copyMtimeMs === null) return null
    const meta = readMeta(metaPathOf(copy), identity)
    const untitled = isUntitledIdentity(identity)
    const filePath = untitled ? null : (identity as RecoveryFileIdentity).filePath
    let fileChangedAfterCopy = false
    let originalMissing = false
    if (filePath !== null) {
      const fileMtime = statMtime(filePath)
      if (fileMtime === null) originalMissing = true
      else fileChangedAfterCopy = fileMtime > copyMtimeMs
    }
    return {
      identity,
      kind: identity.kind,
      filePath,
      untitledId: untitled ? identity.untitledId : null,
      title: meta?.title ?? (filePath !== null ? basename(filePath) : ''),
      writtenAt: meta?.writtenAt ?? copyMtimeMs,
      runId: meta?.runId ?? '',
      state: meta?.state ?? 'later',
      legacy: meta === null,
      copyPath: copy,
      copyMtimeMs,
      fileChangedAfterCopy,
      originalMissing,
      originalPath: meta?.originalPath ?? null,
    }
  }

  function copyInfo(identity: RecoveryIdentity): RecoveryCopyInfo | null {
    return infoFor(identity, copyPath(identity))
  }

  function setCopyState(identity: RecoveryIdentity, state: RecoveryCopyState): boolean {
    const copy = copyPath(identity)
    const info = infoFor(identity, copy)
    if (!info) return false
    const untitled = isUntitledIdentity(identity)
    const meta: RecoveryCopyMeta = {
      version: 1,
      kind: identity.kind,
      filePath: info.filePath,
      untitledId: untitled ? identity.untitledId : null,
      title: info.title,
      writtenAt: info.writtenAt,
      runId: info.runId,
      state,
      ...originalPathField(identity, info.originalPath),
    }
    try {
      writeJsonAtomic(metaPathOf(copy), meta)
      return true
    } catch {
      return false
    }
  }

  function scan(filter: RecoveryCopyFilter = {}): RecoveryCopyInfo[] {
    const kinds = filter.kinds ?? RECOVERY_EDITOR_KINDS
    const found: RecoveryCopyInfo[] = []
    for (const kind of kinds) {
      const places: [string, boolean][] = []
      if (filter.untitled !== true) places.push([kindDir(kind), false])
      if (filter.untitled !== false) places.push([join(kindDir(kind), UNTITLED_DIR), true])
      for (const [dir, untitled] of places) {
        let names: string[]
        try {
          names = readdirSync(dir)
        } catch {
          continue
        }
        for (const name of names) {
          if (!(untitled ? UNTITLED_COPY_RE : FILE_COPY_RE).test(name)) continue
          const copy = join(dir, name)
          const identity = identityFromMeta(kind, metaPathOf(copy), name, untitled)
          if (!identity) continue
          const info = infoFor(identity, copy)
          if (!info || info.legacy) continue
          if (filter.states && !filter.states.includes(info.state)) continue
          found.push(info)
        }
      }
    }
    return found.sort((a, b) => a.writtenAt - b.writtenAt)
  }

  function pruneStaleCopies(maxAgeMs = RECOVERY_COPY_MAX_AGE_MS): number {
    if (isAppShuttingDown()) return 0
    const cutoff = Date.now() - maxAgeMs
    let removed = 0
    for (const kind of RECOVERY_EDITOR_KINDS) {
      for (const [dir, untitled] of [
        [kindDir(kind), false],
        [join(kindDir(kind), UNTITLED_DIR), true],
      ] as const) {
        let names: string[]
        try {
          names = readdirSync(dir)
        } catch {
          continue
        }
        for (const name of names) {
          const path = join(dir, name)
          const isCopy = (untitled ? UNTITLED_COPY_RE : FILE_COPY_RE).test(name)
          const isTemp = TEMP_RE.test(name)
          const isMeta = name.endsWith(META_SUFFIX)
          if (!isCopy && !isTemp && !isMeta) continue
          const mtime = statMtime(path)
          if (mtime === null || mtime >= cutoff) continue
          if (isMeta) {
            // an orphan (its copy already gone); a live copy's metadata goes with it
            if (!existsSync(path.slice(0, -META_SUFFIX.length))) removeQuietly(path)
            continue
          }
          if (isCopy) {
            shared().epochs.set(queueKey(path), epochOf(queueKey(path)) + 1)
            removeQuietly(metaPathOf(path))
          }
          if (removeQuietly(path)) removed += 1
        }
      }
    }
    return removed
  }

  function adoptUntitledCopy(
    kind: RecoveryEditorKind,
    sourcePath: string,
    adoptOptions: { title: string; ext: string; state?: RecoveryCopyState; originalPath?: string },
  ): RecoveryUntitledIdentity | null {
    assertKind(kind)
    const folder = resolve(kindDir(kind))
    const source = resolve(sourcePath)
    const inside = relative(folder, source)
    if (!inside || inside.startsWith('..') || isAbsolute(inside)) return null
    if (!existsSync(source)) return null
    const identity: RecoveryUntitledIdentity = {
      kind,
      untitledId: newUntitledRecoveryId(),
      ext: adoptOptions.ext,
    }
    const target = copyPath(identity)
    const meta: RecoveryCopyMeta = {
      version: 1,
      kind,
      filePath: null,
      untitledId: identity.untitledId,
      title: adoptOptions.title,
      writtenAt: statMtime(source) ?? Date.now(),
      runId: '',
      state: adoptOptions.state ?? 'later',
      ...originalPathField(identity, adoptOptions.originalPath),
    }
    try {
      mkdirSync(dirname(target), { recursive: true })
      writeJsonAtomic(metaPathOf(target), meta)
      renameSync(source, target)
      return identity
    } catch {
      removeQuietly(metaPathOf(target))
      return null
    }
  }

  return {
    copyPath,
    beginWrite,
    writeCopy,
    writeCopyStreamed,
    deleteCopy,
    isDiscarded,
    clearDiscarded,
    copyInfo,
    async readCopy(identity) {
      try {
        return await readFile(copyPath(identity))
      } catch {
        return null
      }
    },
    openPlan(identity) {
      // asked only when the document is being opened: what it shows from now
      // on is not what an earlier "Don't Save" threw away
      clearDiscarded(identity)
      const copy = copyInfo(identity)
      if (!copy) return { action: 'none' }
      return copy.state === 'restoreChosen' ? { action: 'restore', copy } : { action: 'ask', copy }
    },
    setCopyState,
    applyLaunchDecision(identity, decision) {
      if (decision === 'discard') {
        if (!copyInfo(identity)) return false
        return deleteCopy(identity, 'discarded') === 'deleted'
      }
      return setCopyState(identity, decision === 'restore' ? 'restoreChosen' : 'later')
    },
    markCopyLoaded(identity) {
      clearDiscarded(identity)
      return setCopyState(identity, 'undecided')
    },
    listCopies: scan,
    hasUnresolvedCopies() {
      return scan({ states: ['undecided', 'restoreChosen'] }).length > 0
    },
    pruneStaleCopies,
    adoptUntitledCopy,
  }
}
