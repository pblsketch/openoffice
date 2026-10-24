/**
 * When the PDF editor writes its crash-recovery copy (spec 1).
 *
 * About every 30 s, while the document has unsaved changes that changed since
 * the last copy. Serializing a PDF is heavy, so a round waits until the user
 * has paused input for about 2 s and no save is writing; until then it looks
 * again every second. A failed write skips the next rounds (as slides'
 * autosave backoff does) and then tries again: copies are never turned off.
 */

/** tunable defaults (spec "조정값") */
export const RECOVERY_COPY_INTERVAL_MS = 30_000
export const RECOVERY_COPY_IDLE_MS = 2_000
export const RECOVERY_COPY_RETRY_MS = 1_000
export const RECOVERY_COPY_BACKOFF_TICKS = 10

export type RecoveryCopyWrite = 'written' | 'superseded' | 'skipped' | 'failed'

export interface RecoveryCopyHost {
  /** the document has unsaved changes a copy can hold */
  wanted(): boolean
  /** a save, Save As or redaction is writing right now */
  busy(): boolean
  /** write the copy of the current edits */
  write(): Promise<RecoveryCopyWrite>
}

export interface RecoveryCopyClock {
  now(): number
  setTimeout(run: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export interface RecoveryCopyOptions {
  intervalMs?: number
  idleMs?: number
  retryMs?: number
  backoffTicks?: number
  clock?: RecoveryCopyClock
}

export interface RecoveryCopyScheduler {
  start(): void
  stop(): void
  /** the user typed, clicked or dragged: a round waits for the pause */
  noteInput(): void
  /** the edits changed (also counts as input) */
  bump(): void
  /** the copy was deleted (a save): the next round writes again if still dirty */
  invalidate(): void
  /** write now regardless of the pause (the OS is ending the session) */
  flushNow(): Promise<void>
}

const browserClock: RecoveryCopyClock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => window.setTimeout(run, ms),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
}

export function createRecoveryCopyScheduler(
  host: RecoveryCopyHost,
  options: RecoveryCopyOptions = {},
): RecoveryCopyScheduler {
  const intervalMs = options.intervalMs ?? RECOVERY_COPY_INTERVAL_MS
  const idleMs = options.idleMs ?? RECOVERY_COPY_IDLE_MS
  const retryMs = options.retryMs ?? RECOVERY_COPY_RETRY_MS
  const backoffTicks = options.backoffTicks ?? RECOVERY_COPY_BACKOFF_TICKS
  const clock = options.clock ?? browserClock

  let revision = 0
  let copied: number | null = null
  let lastInputAt = Number.NEGATIVE_INFINITY
  let skipRounds = 0
  let writing: Promise<void> | null = null
  let roundTimer: unknown = null
  let retryTimer: unknown = null
  let running = false

  const clearRetry = () => {
    if (retryTimer !== null) clock.clearTimeout(retryTimer)
    retryTimer = null
  }

  function write(): Promise<void> {
    const at = revision
    const run = (async () => {
      let result: RecoveryCopyWrite
      try {
        result = await host.write()
      } catch {
        result = 'failed'
      }
      if (result === 'written') copied = at
      else if (result === 'failed') skipRounds = backoffTicks
    })()
    const tracked = run.finally(() => {
      if (writing === tracked) writing = null
    })
    writing = tracked
    return tracked
  }

  function attempt(): void {
    clearRetry()
    if (!running || writing) return
    if (!host.wanted() || revision === copied) return
    if (host.busy() || clock.now() - lastInputAt < idleMs) {
      retryTimer = clock.setTimeout(attempt, retryMs)
      return
    }
    void write()
  }

  function round(): void {
    roundTimer = clock.setTimeout(round, intervalMs)
    if (skipRounds > 0) {
      skipRounds -= 1
      return
    }
    attempt()
  }

  return {
    start() {
      if (running) return
      running = true
      roundTimer = clock.setTimeout(round, intervalMs)
    },
    stop() {
      running = false
      if (roundTimer !== null) clock.clearTimeout(roundTimer)
      roundTimer = null
      clearRetry()
    },
    noteInput() {
      lastInputAt = clock.now()
    },
    bump() {
      revision += 1
      lastInputAt = clock.now()
    },
    invalidate() {
      copied = null
    },
    async flushNow() {
      if (writing) await writing
      if (!host.wanted() || revision === copied) return
      await write()
    },
  }
}
