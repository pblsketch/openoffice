import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeJsonAtomic } from '@genoffice/electron-utils/atomic-write'
import type { RecoveryStore } from '@genoffice/electron-utils'
import type { DocumentTabKind } from '../shared/tabs-api'
import type { SplitOrientation, SplitViewState } from '../shared/split-view-api'

/**
 * The session record (crash recovery spec 4, 5.2, 11): which document tabs
 * are open, in what order, which one is in front, the split, and whether the
 * run ended through the full quit path. The next launch reads it to tell a
 * normal exit from an abnormal one and to rebuild the tabs after the latter.
 *
 * It holds tab kinds, file paths, untitled-copy identities and tab titles
 * only, never document content, and lives in userData alone. It is not the
 * crash log and is never mixed into it.
 *
 * Only the normal app path touches it: `initSessionRecord` is the one way in,
 * and the shell calls it after it holds the single-instance lock and knows
 * the run is not a headless export. Every module-level helper here is a no-op
 * until then, so a headless export or a second instance that quits (and still
 * runs `will-quit`) can neither read nor write the record.
 */

export const SESSION_RECORD_FILE = 'session-record.json'

/** a burst of tab changes (a divider drag, a restore) lands as one write (tunable) */
export const SESSION_RECORD_WRITE_DELAY_MS = 1000

/**
 * A restore run that ends abnormally sooner than this after its start counts
 * as a crash loop: the next run preloads no tab (spec 5.3, tunable).
 */
export const CRASH_LOOP_WINDOW_MS = 2 * 60 * 1000

const DOCUMENT_KINDS: readonly DocumentTabKind[] = [
  'docs',
  'sheets',
  'slides',
  'pdf',
  'markdown',
  'html',
  'mindmap',
  'hwp',
]

/** the same shape the recovery store accepts for an untitled copy */
const UNTITLED_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const EXT_RE = /^\.[a-z0-9]{1,10}$/
const MIN_RATIO = 0.05
const MAX_RATIO = 0.95

/** the recovery-copy identity of an untitled document (no file path) */
export interface SessionUntitledCopy {
  untitledId: string
  /** lower-case, with the dot, as in RecoveryUntitledIdentity */
  ext: string
}

/** one document tab as recorded */
export interface SessionRecordTab {
  kind: DocumentTabKind
  title: string
  /** absent for an untitled document */
  filePath?: string
  /** an untitled document's recovery copy, when the editor reported one */
  untitled?: SessionUntitledCopy
  /** the tab sat in a detached window; it comes back as a main-window tab */
  detached?: true
}

/** the split of the main window, by index into `tabs` */
export interface SessionRecordSplit {
  a: number
  b: number
  orientation: SplitOrientation
  ratio: number
  focus: 'a' | 'b'
}

export interface SessionRecord {
  version: 1
  /** the run passed the whole quit path, or closed its window into the tray */
  cleanExit: boolean
  /** epoch ms when the run started */
  startedAt: number
  /** the run rebuilt tabs after an abnormal exit */
  restoreRun: boolean
  /** the run outlived CRASH_LOOP_WINDOW_MS */
  pastStartup: boolean
  /** main-window tabs in strip order, then the detached ones */
  tabs: SessionRecordTab[]
  /** index into `tabs` of the main window's front tab; absent = Home */
  active?: number
  split?: SessionRecordSplit
}

/** a main-window strip tab, as TabManager.sessionTabs reports it */
export interface SessionStripTab {
  id: string
  kind: DocumentTabKind
  title: string
  filePath?: string
}

/** the main window's strip: TabManager.sessionTabs() */
export interface SessionStripState {
  tabs: SessionStripTab[]
  /** the front tab's id ('home' or any id not in `tabs` = no document in front) */
  activeId: string | null
  split: SplitViewState | null
}

/** a document in a detached window (detachedSessionTabs) */
export interface SessionDetachedTab {
  id: string
  kind: DocumentTabKind
  title: string
  filePath?: string
}

/** what the record keeps of the live app, before it is turned into a record */
export interface SessionSnapshot {
  tabs: SessionRecordTab[]
  active?: number
  split?: SessionRecordSplit
}

export interface SessionSnapshotSource {
  strip: SessionStripState | null
  detached?: readonly SessionDetachedTab[]
  /**
   * The recovery-copy identity of an untitled tab (main strip or detached),
   * when its editor has one. Called only for tabs without a file path.
   */
  untitledCopyFor?: (tab: { id: string; kind: DocumentTabKind }) => SessionUntitledCopy | undefined
}

/**
 * Turn the live strip and the detached windows into a snapshot. Only the
 * fields the record keeps are copied, so nothing else a caller hands over
 * (and no document content) can reach the file.
 */
export function sessionSnapshotFrom(source: SessionSnapshotSource): SessionSnapshot {
  const tabs: SessionRecordTab[] = []
  const indexById = new Map<string, number>()
  const add = (
    tab: { id: string; kind: DocumentTabKind; title: string; filePath?: string },
    detached: boolean,
  ): void => {
    const entry = normalizeTab(
      {
        kind: tab.kind,
        title: tab.title,
        filePath: tab.filePath,
        untitled: tab.filePath ? undefined : source.untitledCopyFor?.(tab),
        detached: detached || undefined,
      },
      false,
    )
    if (!entry) return
    indexById.set(tab.id, tabs.length)
    tabs.push(entry)
  }
  for (const tab of source.strip?.tabs ?? []) add(tab, false)
  for (const tab of source.detached ?? []) add(tab, true)

  const snapshot: SessionSnapshot = { tabs }
  const strip = source.strip
  const activeId = strip?.activeId
  const active = activeId !== null && activeId !== undefined ? indexById.get(activeId) : undefined
  if (active !== undefined && !tabs[active]?.detached) snapshot.active = active
  const split = strip?.split
  if (split) {
    const a = indexById.get(split.aTabId)
    const b = indexById.get(split.bTabId)
    const candidate = normalizeSplit(
      { a, b, orientation: split.orientation, ratio: split.ratio, focus: split.focus },
      tabs,
    )
    if (candidate) snapshot.split = candidate
  }
  return snapshot
}

function isDocumentKind(value: unknown): value is DocumentTabKind {
  return typeof value === 'string' && (DOCUMENT_KINDS as readonly string[]).includes(value)
}

function normalizeUntitled(raw: unknown): SessionUntitledCopy | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const { untitledId, ext } = raw as Record<string, unknown>
  if (typeof untitledId !== 'string' || !UNTITLED_ID_RE.test(untitledId)) return undefined
  if (typeof ext !== 'string' || !EXT_RE.test(ext)) return undefined
  return { untitledId, ext }
}

/**
 * One tab entry, or null when it is unusable. `strict` (reading the file)
 * drops entries with a malformed optional field; building a snapshot keeps
 * the tab and drops only that field.
 */
function normalizeTab(raw: unknown, strict: boolean): SessionRecordTab | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (!isDocumentKind(record.kind)) return null
  if (typeof record.title !== 'string') return null
  const tab: SessionRecordTab = { kind: record.kind, title: record.title }
  if (record.filePath !== undefined) {
    if (typeof record.filePath === 'string' && record.filePath.length > 0) {
      tab.filePath = record.filePath
    } else if (strict) {
      return null
    }
  }
  if (record.untitled !== undefined && !tab.filePath) {
    const untitled = normalizeUntitled(record.untitled)
    if (untitled) tab.untitled = untitled
    else if (strict) return null
  }
  if (record.detached === true) tab.detached = true
  return tab
}

function normalizeSplit(raw: unknown, tabs: SessionRecordTab[]): SessionRecordSplit | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const { a, b, orientation, ratio, focus } = raw as Record<string, unknown>
  const validIndex = (value: unknown): value is number =>
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < tabs.length &&
    !tabs[value]?.detached
  if (!validIndex(a) || !validIndex(b) || a === b) return undefined
  if (orientation !== 'side' && orientation !== 'stack') return undefined
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return undefined
  if (focus !== 'a' && focus !== 'b') return undefined
  return { a, b, orientation, ratio: Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)), focus }
}

/**
 * Read a stored record. A missing file is `missing`; a file that is not a
 * record at all is `corrupt`. Inside a valid record, a malformed tab entry is
 * dropped (the indices pointing past it are remapped) and a malformed active
 * index or split is ignored.
 */
export function parseSessionRecord(raw: unknown): SessionRecord | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (record.version !== 1) return null
  if (typeof record.cleanExit !== 'boolean') return null
  if (typeof record.startedAt !== 'number' || !Number.isFinite(record.startedAt)) return null
  if (typeof record.restoreRun !== 'boolean') return null
  if (!Array.isArray(record.tabs)) return null

  const tabs: SessionRecordTab[] = []
  const remap = new Map<number, number>()
  record.tabs.forEach((entry, index) => {
    const tab = normalizeTab(entry, true)
    if (!tab) return
    remap.set(index, tabs.length)
    tabs.push(tab)
  })

  const parsed: SessionRecord = {
    version: 1,
    cleanExit: record.cleanExit,
    startedAt: record.startedAt,
    restoreRun: record.restoreRun,
    pastStartup: record.pastStartup === true,
    tabs,
  }
  if (typeof record.active === 'number') {
    const active = remap.get(record.active)
    if (active !== undefined && !tabs[active]?.detached) parsed.active = active
  }
  if (record.split !== null && typeof record.split === 'object' && !Array.isArray(record.split)) {
    const split = record.split as Record<string, unknown>
    const a = typeof split.a === 'number' ? remap.get(split.a) : undefined
    const b = typeof split.b === 'number' ? remap.get(split.b) : undefined
    const normalized = normalizeSplit({ ...split, a, b }, tabs)
    if (normalized) parsed.split = normalized
  }
  return parsed
}

export type SessionRecordReadResult =
  { status: 'missing' } | { status: 'corrupt' } | { status: 'ok'; record: SessionRecord }

export function sessionRecordPath(userDataDir: string): string {
  return join(userDataDir, SESSION_RECORD_FILE)
}

export function readSessionRecord(filePath: string): SessionRecordReadResult {
  let text: string
  try {
    text = readFileSync(filePath, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'ENOENT' || code === 'ENOTDIR' ? { status: 'missing' } : { status: 'corrupt' }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { status: 'corrupt' }
  }
  const record = parseSessionRecord(raw)
  return record ? { status: 'ok', record } : { status: 'corrupt' }
}

/** how the previous run ended (spec 4) */
export interface PreviousExitJudgment {
  abnormal: boolean
  /**
   * - `noRecord`: first run, or the first run of a version with this feature
   * - `clean`: the quit path completed and no undecided / restore-chosen copy is left
   * - `notClean`: the run never completed its quit (power loss, kill, crash, OS shutdown)
   * - `unresolvedCopies`: the quit completed but left undecided or restore-chosen copies
   * - `corruptRecord`: the record was unreadable; abnormal only when undecided
   *   or restore-chosen copies are left, so the launch list still offers them
   */
  reason: 'noRecord' | 'clean' | 'notClean' | 'unresolvedCopies' | 'corruptRecord'
  /**
   * The previous run was itself a restore run and died (never completed its
   * quit) within CRASH_LOOP_WINDOW_MS of its start: preload no tab and do not
   * rebuild the split this time (spec 5.3). The tab strip and the launch list
   * still come back.
   */
  crashLoop: boolean
}

/**
 * Normal exit = a record with the clean mark and no undecided / restore-chosen
 * copy ("later" copies may stay). No record at all is normal too. A record
 * that cannot be read is normal unless such copies are left, in which case
 * the launch list must still offer them.
 */
export function judgePreviousExit(
  previous: SessionRecordReadResult,
  store: Pick<RecoveryStore, 'hasUnresolvedCopies'>,
): PreviousExitJudgment {
  if (previous.status === 'missing')
    return { abnormal: false, reason: 'noRecord', crashLoop: false }
  if (previous.status === 'corrupt') {
    return store.hasUnresolvedCopies()
      ? { abnormal: true, reason: 'corruptRecord', crashLoop: false }
      : { abnormal: false, reason: 'corruptRecord', crashLoop: false }
  }
  const record = previous.record
  if (!record.cleanExit) {
    return {
      abnormal: true,
      reason: 'notClean',
      crashLoop: record.restoreRun && !record.pastStartup,
    }
  }
  if (store.hasUnresolvedCopies()) {
    return { abnormal: true, reason: 'unresolvedCopies', crashLoop: false }
  }
  return { abnormal: false, reason: 'clean', crashLoop: false }
}

/**
 * The tabs to rebuild after an abnormal exit, in the index shape of
 * TabManager.hydrateSession. Detached tabs are included (they come back into
 * the main window, after the strip's own tabs). A crash loop keeps the tabs
 * but drops the front tab and the split, so nothing preloads.
 */
export function sessionRestoreLayout(
  record: SessionRecord,
  options: { crashLoop: boolean },
): SessionSnapshot {
  const layout: SessionSnapshot = { tabs: record.tabs.map((tab) => ({ ...tab })) }
  if (options.crashLoop) return layout
  if (record.active !== undefined) layout.active = record.active
  if (record.split) layout.split = { ...record.split }
  return layout
}

export interface SessionRecorderOptions {
  /** the app data folder (`app.getPath('userData')`) */
  userDataDir: string
  /** injectable for tests */
  now?: () => number
  writeDelayMs?: number
  crashLoopWindowMs?: number
  /** injectable for tests; defaults to the atomic userData JSON writer */
  writeJson?: (filePath: string, value: unknown) => void
}

export interface SessionRecorder {
  /** the previous run's record as read at init; never re-read */
  readonly previous: SessionRecordReadResult
  /**
   * Begin this run: write a record without the clean mark, with the start
   * time and whether this run restores tabs. A restore run starts from the
   * previous record's tabs, so a crash before the first tab change still
   * finds them; any other run starts empty. Updates before this are dropped.
   */
  startRun(options: { restoreRun: boolean }): void
  /** the tabs changed (open, close, reorder, rename, path, front tab, split, detach) */
  update(snapshot: SessionSnapshot): void
  /** write a pending change now */
  flush(): void
  /**
   * The quit path completed (`will-quit`): set the clean mark and stop
   * recording. The tab list stays, since a quit that left undecided copies
   * (Excel quits without asking) still counts as abnormal and rebuilds them.
   */
  markCleanExit(): void
  /**
   * The main window finished closing while the app stays in the tray
   * (`shouldKeepQuickLookInTray`): empty the tab list and set the clean mark,
   * so a later power loss does not bring back tabs the user closed. A window
   * opened again from the tray clears the mark with its first tab change.
   */
  markClosedToTray(): void
  /**
   * The OS is ending the session (shutdown, restart, logout): write what is
   * pending and stop recording without the clean mark, so the next run treats
   * the exit as abnormal even when `will-quit` still runs.
   */
  markOsSessionEnd(): void
  /** cancel timers (tests, or an app that never started its run) */
  dispose(): void
}

function snapshotJson(record: SessionRecord): string {
  return JSON.stringify(record)
}

export function createSessionRecorder(options: SessionRecorderOptions): SessionRecorder {
  const filePath = sessionRecordPath(options.userDataDir)
  const now = options.now ?? Date.now
  const writeDelay = options.writeDelayMs ?? SESSION_RECORD_WRITE_DELAY_MS
  const loopWindow = options.crashLoopWindowMs ?? CRASH_LOOP_WINDOW_MS
  const writeJson = options.writeJson ?? writeJsonAtomic
  const previous = readSessionRecord(filePath)

  let current: SessionRecord | null = null
  let lastWritten: string | null = null
  let writeTimer: ReturnType<typeof setTimeout> | null = null
  let startupTimer: ReturnType<typeof setTimeout> | null = null
  /** set once the run ended (quit or OS session end): nothing is written after */
  let ended = false

  const clearWriteTimer = (): void => {
    if (writeTimer) clearTimeout(writeTimer)
    writeTimer = null
  }

  const writeNow = (): void => {
    clearWriteTimer()
    if (!current) return
    const json = snapshotJson(current)
    if (json === lastWritten) return
    try {
      writeJson(filePath, current)
      lastWritten = json
    } catch (error) {
      // never let a full disk or a locked file break a tab change or the quit
      console.warn('[session-record] write failed:', error)
    }
  }

  const scheduleWrite = (): void => {
    if (writeTimer) return
    writeTimer = setTimeout(() => {
      writeTimer = null
      writeNow()
    }, writeDelay)
    writeTimer.unref?.()
  }

  const finish = (): void => {
    ended = true
    if (startupTimer) clearTimeout(startupTimer)
    startupTimer = null
  }

  return {
    previous,

    startRun({ restoreRun }) {
      if (current || ended) return
      const carried =
        restoreRun && previous.status === 'ok'
          ? sessionRestoreLayout(previous.record, { crashLoop: false })
          : { tabs: [] }
      current = {
        version: 1,
        cleanExit: false,
        startedAt: now(),
        restoreRun,
        pastStartup: false,
        ...carried,
      }
      writeNow()
      startupTimer = setTimeout(() => {
        startupTimer = null
        if (!current || ended) return
        current = { ...current, pastStartup: true }
        writeNow()
      }, loopWindow)
      startupTimer.unref?.()
    },

    update(snapshot) {
      if (!current || ended) return
      // re-validate: only the recorded fields survive, indices stay consistent
      const parsed = parseSessionRecord({
        version: 1,
        cleanExit: false,
        startedAt: current.startedAt,
        restoreRun: current.restoreRun,
        pastStartup: current.pastStartup,
        tabs: snapshot.tabs,
        active: snapshot.active,
        split: snapshot.split,
      })
      if (!parsed) return
      const reopened = current.cleanExit
      current = parsed
      if (reopened) writeNow()
      else if (snapshotJson(current) !== lastWritten) scheduleWrite()
    },

    flush() {
      if (!current || ended) return
      writeNow()
    },

    markCleanExit() {
      if (!current || ended) return
      current = { ...current, cleanExit: true }
      writeNow()
      finish()
    },

    markClosedToTray() {
      if (!current || ended) return
      current = {
        version: 1,
        cleanExit: true,
        startedAt: current.startedAt,
        restoreRun: current.restoreRun,
        pastStartup: current.pastStartup,
        tabs: [],
      }
      writeNow()
    },

    markOsSessionEnd() {
      if (!current || ended) return
      writeNow()
      finish()
    },

    dispose() {
      clearWriteTimer()
      finish()
    },
  }
}

let activeRecorder: SessionRecorder | null = null

/**
 * The one way in. Call only on the normal app path: after the single-instance
 * lock is held and when the run is not `--headless-export`. Returns the same
 * recorder when called again.
 */
export function initSessionRecord(options: SessionRecorderOptions): SessionRecorder {
  activeRecorder ??= createSessionRecorder(options)
  return activeRecorder
}

/** the recorder of this run, or null when this process never initialized one */
export function sessionRecorder(): SessionRecorder | null {
  return activeRecorder
}

/** no-op unless initialized: safe from TabManager / detached-window callbacks */
export function noteSessionChanged(source: SessionSnapshotSource): void {
  activeRecorder?.update(sessionSnapshotFrom(source))
}

/** no-op unless initialized: safe from a `will-quit` a second instance also runs */
export function markSessionCleanExit(): void {
  activeRecorder?.markCleanExit()
}

/** no-op unless initialized */
export function markSessionClosedToTray(): void {
  activeRecorder?.markClosedToTray()
}

/** no-op unless initialized */
export function markSessionOsEnd(): void {
  activeRecorder?.markOsSessionEnd()
}

/** tests only: forget the process-wide recorder */
export function resetSessionRecordForTests(): void {
  activeRecorder?.dispose()
  activeRecorder = null
}
