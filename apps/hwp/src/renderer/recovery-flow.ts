import type { HwpApi, HwpFormat, MeasuredTab, TabMeasure, TabSpot } from '../shared/ipc'

/**
 * Crash-recovery copies of the open document (main/recovery.ts stores them).
 *
 * Exporting a document is heavy: the editor serializes the whole document on the
 * thread it types on. So a copy is only taken while the document has unsaved
 * changes, something changed since the last copy, the last turn is about
 * `intervalMs` ago and the user has not touched the editor for `idleMs`; typing
 * never waits on a copy. Whether the document has unsaved changes is the editor's
 * cheap `isDirty` (never `getDocumentState()`, which hashes the whole document).
 * A failed or slow copy skips a few turns, then tries again; copies are never
 * turned off.
 */

/** The part of the embedded editor a copy needs. */
export interface RecoveryEditorPort {
  /** the editor's own unsaved-changes flag (`commands.context().isDirty`) */
  isDirty(): Promise<boolean>
  /** the open document was unlocked with a password: it gets no copy */
  isPasswordProtected(): Promise<boolean>
  exportHwp(): Promise<Uint8Array>
  exportHwpx(): Promise<Uint8Array>
  /** how the editor lays out the given tabs; null for one it cannot measure */
  measureTabs(spots: TabSpot[]): Promise<(TabMeasure | null)[]>
}

export type RecoveryCopyApi = Pick<HwpApi, 'recoveryBegin' | 'recoveryNewTabs' | 'recoveryWrite'>

export interface RecoveryTiming {
  /** about how often a copy is taken while there are changes */
  intervalMs: number
  /** how long the user must have left the editor alone */
  idleMs: number
  /** turns skipped after a failed copy */
  failureSkips: number
  /** a copy that took longer than this counts as slow */
  slowMs: number
  /** turns skipped after a slow copy */
  slowSkips: number
}

export const RECOVERY_TIMING: RecoveryTiming = {
  intervalMs: 30_000,
  idleMs: 2_000,
  // as PowerPoint's autosaveBackoff
  failureSkips: 10,
  slowMs: 1_500,
  slowSkips: 2,
}

/** How often the copier looks whether a copy is due (the look itself costs nothing). */
export const RECOVERY_TICK_MS = 1_000

export interface RecoveryCopierOptions {
  editor: RecoveryEditorPort
  api: RecoveryCopyApi
  /** the editor is busy with something that must not share it (a save) */
  isBusy?: () => boolean
  /** the document holds a restored copy not saved since: unsaved even when the editor says not */
  restoredUnsaved?: () => boolean
  now?: () => number
  timing?: Partial<RecoveryTiming>
}

export type RecoveryCopyResult =
  'written' | 'superseded' | 'refused' | 'clean' | 'protected' | 'unchanged' | 'failed'

export interface RecoveryCopier {
  /**
   * The user is at work: no copy for `idleMs`. `mayChange` (the default): it was in the
   * editor (a key, a click, a paste), so the document may have changed; false for work
   * elsewhere on the page (typing to the AI panel), which a copy would stall as much.
   */
  noteInput(mayChange?: boolean): void
  /** the document may have changed without the user's hand on it (the AI panel's edits) */
  noteChange(): void
  /** a copy is due: take one when the time has come; cheap when it has not */
  tick(): Promise<RecoveryCopyResult | 'waiting'>
  /** take a copy now if there are unsaved changes not in a copy yet (the OS is shutting down) */
  flush(): Promise<RecoveryCopyResult>
  /** the copy was removed while the document stays open: the next turn writes it again */
  reset(): void
  /** a save landed: what was unsaved is in the file now */
  saved(): void
  /** the copy in progress, if any, has ended */
  settled(): Promise<void>
}

export function createRecoveryCopier(options: RecoveryCopierOptions): RecoveryCopier {
  const timing = { ...RECOVERY_TIMING, ...options.timing }
  const now = options.now ?? (() => Date.now())
  const { editor, api } = options
  let lastTurnAt = now()
  let lastInputAt = Number.NEGATIVE_INFINITY
  // changes since the last copy; a restored copy that is not edited is already on disk
  let changed = false
  let skip = 0
  let inFlight: Promise<RecoveryCopyResult> | null = null

  const isDirty = async (): Promise<boolean> =>
    (options.restoredUnsaved?.() ?? false) || (await editor.isDirty())

  async function copy(): Promise<RecoveryCopyResult> {
    // the turn first: a save that lands from here on wins over this copy. One that
    // has landed already is seen below, as a save still finishing or a clean document.
    const begin = await api.recoveryBegin()
    if (!begin.ok) return 'refused'
    if (options.isBusy?.()) return 'superseded'
    if (!(await isDirty())) {
      changed = false
      return 'clean'
    }
    // a build that cannot tell protection must not write as if it could
    const isProtected = await editor.isPasswordProtected().catch(() => true)
    if (isProtected) return 'protected'
    // from here on the document as it is now goes into the copy; a change while it is
    // being exported goes into the next one
    changed = false
    const started = now()
    const bytes = await exportOf(editor, begin.format)
    const tabs = await measuredTabs(editor, api, bytes, begin.format)
    const result = await api.recoveryWrite(bytes, begin.format, tabs)
    if (result === 'superseded') changed = true
    if (now() - started > timing.slowMs) skip = Math.max(skip, timing.slowSkips)
    return result
  }

  function run(): Promise<RecoveryCopyResult> {
    const attempt = copy().catch((): RecoveryCopyResult => {
      changed = true
      skip = timing.failureSkips
      return 'failed'
    })
    inFlight = attempt
    void attempt.finally(() => {
      if (inFlight === attempt) inFlight = null
    })
    return attempt
  }

  return {
    noteInput(mayChange = true) {
      lastInputAt = now()
      if (mayChange) changed = true
    },
    noteChange() {
      lastInputAt = now()
      changed = true
    },
    async tick() {
      if (inFlight) return 'waiting'
      const at = now()
      if (at - lastTurnAt < timing.intervalMs) return 'waiting'
      if (at - lastInputAt < timing.idleMs) return 'waiting'
      if (options.isBusy?.()) return 'waiting'
      lastTurnAt = at
      if (skip > 0) {
        skip -= 1
        return 'waiting'
      }
      if (!changed) return 'unchanged'
      return run()
    },
    async flush() {
      if (inFlight) await inFlight
      if (!changed) return 'unchanged'
      return run()
    },
    reset() {
      changed = true
    },
    saved() {
      changed = false
    },
    async settled() {
      if (inFlight) await inFlight
    },
  }
}

/**
 * The plugin calls that only read the document (or draw over it). The AI panel asks for
 * the selection every 0.7 s: that is no change and no work of the user's.
 */
const READING_CALLS: ReadonlySet<string> = new Set([
  'foreignChanges',
  'readText',
  'findText',
  'listTables',
  'readTable',
  'selection',
  'listFields',
  'listNotes',
  'listStyles',
  'measureTabs',
  'printPages',
  'reveal',
  'clearMarks',
  'installFileMenu',
])

/**
 * The AI panel's way into the document, telling `onChange` of every call that may
 * change it (the AI's edits come through no key or click of the user's).
 */
export function withChangeNotes<T extends object>(bridge: T, onChange: () => void): T {
  const noted: Record<string, unknown> = {}
  for (const [name, call] of Object.entries(bridge)) {
    noted[name] =
      typeof call === 'function' && !READING_CALLS.has(name)
        ? (...args: unknown[]) => {
            onChange()
            const result: unknown = (call as (...rest: unknown[]) => unknown)(...args)
            // the edit lands when the call ends: its time counts as work, not idle
            void Promise.resolve(result).then(onChange, onChange)
            return result
          }
        : call
  }
  return noted as T
}

function exportOf(editor: RecoveryEditorPort, format: HwpFormat): Promise<Uint8Array> {
  return format === 'hwpx' ? editor.exportHwpx() : editor.exportHwp()
}

/** the widths of the copy's new tabs, as a save measures them; none when they cannot be had */
async function measuredTabs(
  editor: RecoveryEditorPort,
  api: RecoveryCopyApi,
  bytes: Uint8Array,
  format: HwpFormat,
): Promise<MeasuredTab[]> {
  try {
    const spots = await api.recoveryNewTabs(bytes, format)
    if (spots.length === 0) return []
    const measures = await editor.measureTabs(spots)
    return spots.flatMap((spot, index) => {
      const measure = measures[index]
      return measure ? [{ ...spot, ...measure }] : []
    })
  } catch {
    return []
  }
}
