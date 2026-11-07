/**
 * How a document job reads the errors of a model call (spec §9).
 *
 * Calls fail with ai-provider's AiRunError (`kind`, `resetsAt`) or with the
 * fields of an error stream chunk (`errorCode`, `errorResetsAt`). This module
 * reads either shape structurally, so the engine needs neither package.
 */
import type { JobKind, JobProgress, TranslationMode } from '../store/store'

/**
 * Kinds that end the job at once: nothing more is sent and calls in flight
 * are aborted. Mirrors packages/ui AI_BLOCKED_RUN_KINDS (the connection
 * cannot go on), plus two kinds a retry cannot fix either: 'credits' (a key
 * provider out of credit) and 'headless-limit' (no longer raised, kept so an
 * older runner cannot make the job spin on it). 'context-limit' is the person
 * declining a prompt close to the model's window: asking again for the next
 * batch would ignore that answer.
 */
export const JOB_STOP_KINDS: readonly string[] = [
  'rate-limit',
  'signed-out',
  'not-installed',
  'needs-update',
  'metered-not-accepted',
  'unsafe-tools',
  'not-connected',
  'credits',
  'headless-limit',
  'context-limit',
  'off-in-app',
]

export function isJobStopKind(kind: string | undefined): boolean {
  return kind !== undefined && JOB_STOP_KINDS.includes(kind)
}

export interface ClassifiedRunError {
  /** machine-readable cause, when the error has one */
  kind?: string
  /** epoch ms when a rate limit lifts */
  resetsAt?: number
  message: string
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined

/** the cause of a failed call: AiRunError-like `kind`, or a stream chunk's `errorCode` */
export function classifyRunError(err: unknown): ClassifiedRunError {
  if (typeof err !== 'object' || err === null) return { message: String(err) }
  const e = err as Record<string, unknown>
  const out: ClassifiedRunError = {
    message: str(e.message) ?? str(e.error) ?? String(err),
  }
  const kind = str(e.kind) ?? str(e.errorCode)
  if (kind !== undefined) out.kind = kind
  const resetsAt = num(e.resetsAt) ?? num(e.errorResetsAt)
  if (resetsAt !== undefined) out.resetsAt = resetsAt
  return out
}

/**
 * Thrown by a caller's model call when the call itself worked but the unit
 * cannot be used (a malformed answer after the caller's own re-asks). The
 * unit is recorded as failed with `reason`; the engine does not retry it and
 * it does not count toward the consecutive-failure stop.
 */
export class JobUnitFailure extends Error {
  readonly reason: string

  constructor(reason: string, message = `unit failed: ${reason}`) {
    super(message)
    this.name = 'JobUnitFailure'
    this.reason = reason
  }
}

/** what the lock knows about the job holding a document */
export interface RunningDocumentJob {
  docHash: string
  kind: JobKind
  lang?: string
  /** the run of a 'highlight' job */
  runId?: string
  /** 'easy' for an easy explanation's job; absent for every plain one */
  mode?: Extract<TranslationMode, 'easy'>
  /** items (pages or blocks) done / total, including those done before this run */
  progress: JobProgress
}

/** a second job was started on a document that already has one (spec §9) */
export class DocumentJobBusyError extends Error {
  readonly code = 'document-job-running' as const
  readonly running: RunningDocumentJob

  constructor(running: RunningDocumentJob) {
    super(
      `a ${running.kind} job is already running on this document ` +
        `(${running.progress.done}/${running.progress.total})`,
    )
    this.name = 'DocumentJobBusyError'
    this.running = running
  }
}
