/**
 * The document job engine (spec §9): runs work units (pages to read, block
 * batches to translate) through an injected model call. Environment-free: no
 * Electron, no file system; the store comes in through `DocumentJobStore`,
 * which the result store (`ResultStore`) satisfies.
 *
 * Rules:
 * - at most `concurrency` calls at a time (default 2)
 * - a failed call is retried once; a unit that fails again is recorded as
 *   failed, and `maxConsecutiveFailures` failed units in a row (default 3)
 *   stop the job ('failures')
 * - 'rate-limit' and the other stop kinds (errors.ts) stop the job at once:
 *   nothing more is sent, calls in flight are aborted, resetsAt is kept
 * - the caller's signal stops the job ('cancelled', or 'interrupted' when the
 *   signal's reason says so)
 * - a unit counts as done only after its result is in the store; a store
 *   write failure stops the job ('store-write-failed')
 * - the job record is written at start, every `heartbeatMs` while running,
 *   and at the end
 *
 * The engine never decides to start: the caller runs it after the user
 * confirmed (spec §9).
 */
import type {
  JobKind,
  JobLastError,
  JobProgress,
  JobRecordInput,
  TranslationMode,
} from '../store/store'
import type { ResultStore } from '../store/store'
import { classifyRunError, isJobStopKind, JobUnitFailure } from './errors'

/** calls one job sends at a time (spec §9: default 2) */
export const JOB_CONCURRENCY = 2
/** failed units in a row that stop a job (spec §9: default 3) */
export const JOB_MAX_CONSECUTIVE_FAILURES = 3
/**
 * heartbeat of the job record while running; must stay well inside the
 * store's running window (JOB_RUNNING_WINDOW_MS, 30 s) or a live job reads
 * as interrupted
 */
export const JOB_HEARTBEAT_MS = 10_000
/** pause before the one retry of a failed call */
export const JOB_RETRY_DELAY_MS = 1_500

/**
 * the result-store methods the document jobs use; ResultStore satisfies it.
 * `deleteTranslationExceptEdited` is optional: only a restart that keeps the
 * person's edits needs it, and refuses to run on a store without it.
 */
export type DocumentJobStore = Pick<
  ResultStore,
  | 'writeJob'
  | 'readAiReadPages'
  | 'writeAiReadPage'
  | 'readTranslation'
  | 'writeTranslationMeta'
  | 'writeTranslationBlocks'
  | 'deleteTranslation'
> &
  Partial<Pick<ResultStore, 'deleteTranslationExceptEdited'>>

export interface JobTuning {
  /** calls at a time; default JOB_CONCURRENCY */
  concurrency?: number
  /** failed units in a row that stop the job; default JOB_MAX_CONSECUTIVE_FAILURES */
  maxConsecutiveFailures?: number
  /** default JOB_HEARTBEAT_MS */
  heartbeatMs?: number
  /** default JOB_RETRY_DELAY_MS */
  retryDelayMs?: number
}

export interface JobProgressEvent<U> {
  /** items (pages or blocks) done, including those done before this run */
  done: number
  total: number
  /** units that failed in this run */
  failed: number
  /** the unit most recently sent that is still in flight, or null */
  current: U | null
}

export interface RunJobUnitsOptions<U, R> extends JobTuning {
  docHash: string
  kind: JobKind
  /** target language of a translate, translate-page or summary job */
  lang?: string
  /** the run of a highlight job */
  runId?: string
  /** 'easy': an easy explanation's job, recorded apart (translate and translate-page only) */
  mode?: TranslationMode
  store: Pick<DocumentJobStore, 'writeJob'>
  /** the units to send, in order (already-done units left out) */
  units: readonly U[]
  /** items in a unit (blocks in a batch); default 1 */
  unitSize?: (unit: U) => number
  /** items already done before this run (counted in progress, not sent) */
  doneBefore?: number
  /** one model call for a unit; must give up when the signal aborts */
  callModel: (unit: U, signal: AbortSignal) => Promise<R>
  /** store the unit's result; the unit counts as done once this resolves */
  persist: (unit: U, result: R) => Promise<void>
  onProgress?: (event: JobProgressEvent<U>) => void
  /** abort to stop the job; reason 'interrupted' records it as such */
  signal?: AbortSignal
}

export interface JobFailedUnit<U> {
  unit: U
  /** the run error kind, the caller's JobUnitFailure reason, or the error message */
  reason: string
}

export interface JobSummary<U> {
  /** complete: every unit was tried; stopped: the job ended early */
  state: 'complete' | 'stopped'
  /** why it stopped (the job record's last_error) */
  stopReason?: JobLastError
  /** epoch ms when the rate limit lifts */
  resetsAt?: number
  /** units finished and stored in this run */
  doneUnits: U[]
  /** units that failed in this run */
  failedUnits: JobFailedUnit<U>[]
  /** units whose result arrived but could not be stored (the result is lost) */
  lostUnits: U[]
  /** items done before this run */
  skippedItems: number
  progress: JobProgress
  /** a job record write failed (the record may be stale) */
  recordWriteFailed: boolean
}

type Outcome<R> =
  | { kind: 'ok'; result: R }
  | { kind: 'failed'; reason: string; counts: boolean }
  | { kind: 'aborted' }

function positiveInt(value: number | undefined, fallback: number, what: string): number {
  const v = value ?? fallback
  if (!Number.isInteger(v) || v < 1) throw new RangeError(`document job: invalid ${what} ${v}`)
  return v
}

function nonNegative(value: number | undefined, fallback: number, what: string): number {
  const v = value ?? fallback
  if (!Number.isFinite(v) || v < 0) throw new RangeError(`document job: invalid ${what} ${v}`)
  return v
}

/** settle with the call, or reject as soon as the signal aborts */
function untilSettledOrAborted<T>(start: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    new Promise<T>((r) => r(start())).then(
      (v) => {
        signal.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(e)
      },
    )
  })
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

const cancelReason = (signal: AbortSignal): JobLastError =>
  signal.reason === 'interrupted' ? 'interrupted' : 'cancelled'

/** run the units; resolves when the job completes or stops (never rejects for a unit) */
export async function runJobUnits<U, R>(o: RunJobUnitsOptions<U, R>): Promise<JobSummary<U>> {
  const concurrency = positiveInt(o.concurrency, JOB_CONCURRENCY, 'concurrency')
  const maxFailures = positiveInt(
    o.maxConsecutiveFailures,
    JOB_MAX_CONSECUTIVE_FAILURES,
    'consecutive failure limit',
  )
  const heartbeatMs = positiveInt(o.heartbeatMs, JOB_HEARTBEAT_MS, 'heartbeat')
  const retryDelayMs = nonNegative(o.retryDelayMs, JOB_RETRY_DELAY_MS, 'retry delay')
  const sizeOf = o.unitSize ?? (() => 1)
  const skippedItems = nonNegative(o.doneBefore, 0, 'done count')

  const units = [...o.units]
  const total = units.reduce((sum, u) => sum + sizeOf(u), skippedItems)
  let done = skippedItems
  const doneUnits: U[] = []
  const failedUnits: JobFailedUnit<U>[] = []
  const lostUnits: U[] = []
  const inFlight: U[] = []

  // ── stopping ──
  const controller = new AbortController()
  // `as` keeps TypeScript from narrowing to null: halt() assigns it from callbacks
  let stop = null as { reason: JobLastError; resetsAt?: number } | null
  const halt = (reason: JobLastError, resetsAt?: number) => {
    if (stop) return
    stop = resetsAt === undefined ? { reason } : { reason, resetsAt }
    controller.abort(reason)
  }
  const external = o.signal
  const onExternalAbort = () => halt(cancelReason(external!))
  if (external?.aborted) halt(cancelReason(external))
  else external?.addEventListener('abort', onExternalAbort, { once: true })

  // ── the job record: writes are serialized so the final one lands last ──
  const base: Pick<JobRecordInput, 'kind' | 'lang' | 'runId' | 'mode'> = { kind: o.kind }
  if (o.lang !== undefined) base.lang = o.lang
  if (o.runId !== undefined) base.runId = o.runId
  if (o.mode === 'easy') base.mode = 'easy'
  let recordWriteFailed = false
  let records: Promise<boolean> = Promise.resolve(true)
  const writeRecord = (record: JobRecordInput): Promise<boolean> => {
    records = records.then(() =>
      o.store.writeJob(o.docHash, record).then(
        () => true,
        () => {
          recordWriteFailed = true
          return false
        },
      ),
    )
    return records
  }
  const progress = (): JobProgress => ({ done, total })
  const emit = () =>
    o.onProgress?.({
      done,
      total,
      failed: failedUnits.length,
      current: inFlight.at(-1) ?? null,
    })

  if (!stop && !(await writeRecord({ ...base, state: 'running', progress: progress() }))) {
    halt('store-write-failed')
  }

  // ── one unit: the call, its one retry, and how it ended ──
  const attempt = async (unit: U): Promise<Outcome<R>> => {
    for (let tries = 1; ; tries++) {
      if (stop) return { kind: 'aborted' }
      try {
        const result = await untilSettledOrAborted(
          () => o.callModel(unit, controller.signal),
          controller.signal,
        )
        return { kind: 'ok', result }
      } catch (err) {
        if (stop) return { kind: 'aborted' }
        if (err instanceof JobUnitFailure) {
          return { kind: 'failed', reason: err.reason, counts: false }
        }
        const cause = classifyRunError(err)
        if (isJobStopKind(cause.kind)) {
          halt(cause.kind!, cause.resetsAt)
          return { kind: 'aborted' }
        }
        if (tries >= 2) {
          return { kind: 'failed', reason: cause.kind ?? cause.message, counts: true }
        }
        await delay(retryDelayMs, controller.signal)
      }
    }
  }

  let next = 0
  let consecutiveFailures = 0
  const worker = async () => {
    while (!stop && next < units.length) {
      const unit = units[next++]!
      inFlight.push(unit)
      emit()
      const outcome = await attempt(unit)
      inFlight.splice(inFlight.indexOf(unit), 1)
      if (outcome.kind === 'aborted') continue
      if (outcome.kind === 'failed') {
        failedUnits.push({ unit, reason: outcome.reason })
        consecutiveFailures = outcome.counts ? consecutiveFailures + 1 : 0
        emit()
        if (consecutiveFailures >= maxFailures) halt('failures')
        continue
      }
      consecutiveFailures = 0
      try {
        await o.persist(unit, outcome.result)
      } catch {
        lostUnits.push(unit)
        halt('store-write-failed')
        continue
      }
      done += sizeOf(unit)
      doneUnits.push(unit)
      emit()
    }
  }

  const heartbeat = setInterval(() => {
    if (!stop) void writeRecord({ ...base, state: 'running', progress: progress() })
  }, heartbeatMs)
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, units.length) }, worker))
  } finally {
    clearInterval(heartbeat)
    external?.removeEventListener('abort', onExternalAbort)
  }

  const finished = doneUnits.length + failedUnits.length === units.length
  const stopped: { reason: JobLastError; resetsAt?: number } | null = finished ? null : stop
  const final: JobRecordInput = stopped
    ? { ...base, state: 'stopped', last_error: stopped.reason, progress: progress() }
    : { ...base, state: 'complete', progress: progress() }
  if (stopped?.resetsAt !== undefined) final.resetsAt = stopped.resetsAt
  await writeRecord(final)

  const summary: JobSummary<U> = {
    state: stopped ? 'stopped' : 'complete',
    doneUnits,
    failedUnits,
    lostUnits,
    skippedItems,
    progress: progress(),
    recordWriteFailed,
  }
  if (stopped) summary.stopReason = stopped.reason
  if (stopped?.resetsAt !== undefined) summary.resetsAt = stopped.resetsAt
  return summary
}
