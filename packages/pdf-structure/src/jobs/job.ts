/**
 * Starting a document job: the per-document lock, the handle the caller keeps
 * (result, cancel, progress), and the estimate shown before the user confirms.
 */
import type { JobKind, JobProgress, TranslationMode } from '../store/store'
import {
  runJobUnits,
  type JobProgressEvent,
  type JobSummary,
  type JobTuning,
  type RunJobUnitsOptions,
} from './engine'
import { documentJobs, type DocumentJobRegistry, type JobCancelReason } from './lock'

/** the AI connection a job sends to */
export interface JobModelChoice {
  /** AI provider id */
  provider: string
  /** model id; '' is the program's own default */
  model: string
}

/** the stored translation was made with another provider or model (spec §8) */
export interface ProviderChange {
  stored: { provider: string | null; model: string | null }
  next: JobModelChoice
}

/** what the pre-start confirmation shows (spec §7, §8) */
export interface DocumentJobEstimate {
  kind: JobKind
  lang?: string
  runId?: string
  /** 'easy' for an easy explanation's job; absent for every plain one */
  mode?: Extract<TranslationMode, 'easy'>
  /** model calls the job will make */
  calls: number
  /** items (pages or blocks) still to do */
  pending: number
  /** items already in the store, skipped */
  done: number
  total: number
  model: JobModelChoice
  /** set when continuing a translation on a different provider or model */
  providerChange: ProviderChange | null
}

export interface DocumentJobHandle<U> {
  readonly docHash: string
  readonly kind: JobKind
  readonly lang?: string
  readonly runId?: string
  /** 'easy' for an easy explanation's job; absent for every plain one */
  readonly mode?: Extract<TranslationMode, 'easy'>
  /** resolves when the job completes or stops; rejects only if it could not be planned */
  readonly result: Promise<JobSummary<U>>
  /** stop the job ('interrupted' when the tab, app or server ends) */
  cancel(reason?: JobCancelReason): void
  /** items done / total so far (0/0 until the job is planned) */
  progress(): JobProgress
}

/** options every job starter takes */
export interface StartDocumentJobOptions<U> extends JobTuning {
  onProgress?: (event: JobProgressEvent<U>) => void
  /** abort to stop; reason 'interrupted' is recorded as such */
  signal?: AbortSignal
  /** lock registry; default the process-wide `documentJobs` */
  registry?: DocumentJobRegistry
}

/** what a starter's planning step hands to the runner */
export type PlannedJob<U, R> = Pick<
  RunJobUnitsOptions<U, R>,
  'store' | 'units' | 'unitSize' | 'doneBefore' | 'callModel' | 'persist'
> & { total: number }

/**
 * Take the document's lock (synchronously; throws DocumentJobBusyError when a
 * job holds it), then plan and run. The lock is released when the job ends.
 */
export function startDocumentJob<U, R>(
  head: {
    docHash: string
    kind: JobKind
    lang?: string
    runId?: string
    /** 'easy': an easy explanation's job (its record and lock entry say so) */
    mode?: TranslationMode
  } & StartDocumentJobOptions<U>,
  plan: (signal: AbortSignal) => Promise<PlannedJob<U, R>>,
): DocumentJobHandle<U> {
  const { docHash, kind, lang, runId } = head
  const easy = head.mode === 'easy'
  const controller = new AbortController()
  let current: JobProgress = { done: 0, total: 0 }
  const lease = (head.registry ?? documentJobs).acquire(
    {
      docHash,
      kind,
      ...(lang !== undefined ? { lang } : {}),
      ...(runId !== undefined ? { runId } : {}),
      ...(easy ? { mode: 'easy' as const } : {}),
      progress: current,
    },
    (reason) => controller.abort(reason),
  )
  const external = head.signal
  const onExternalAbort = () => controller.abort(external!.reason)
  if (external?.aborted) onExternalAbort()
  else external?.addEventListener('abort', onExternalAbort, { once: true })

  const track = (progress: JobProgress) => {
    current = { done: progress.done, total: progress.total }
    lease.update(current)
  }

  const result = (async () => {
    try {
      const { total, ...planned } = await plan(controller.signal)
      track({ done: planned.doneBefore ?? 0, total })
      return await runJobUnits<U, R>({
        ...planned,
        docHash,
        kind,
        ...(lang !== undefined ? { lang } : {}),
        ...(runId !== undefined ? { runId } : {}),
        ...(easy ? { mode: 'easy' as const } : {}),
        concurrency: head.concurrency,
        maxConsecutiveFailures: head.maxConsecutiveFailures,
        heartbeatMs: head.heartbeatMs,
        retryDelayMs: head.retryDelayMs,
        signal: controller.signal,
        onProgress: (event) => {
          track(event)
          head.onProgress?.(event)
        },
      })
    } finally {
      external?.removeEventListener('abort', onExternalAbort)
      lease.release()
    }
  })()

  const handle: DocumentJobHandle<U> = {
    docHash,
    kind,
    result,
    cancel: (reason = 'cancelled') => controller.abort(reason),
    progress: () => ({ ...current }),
  }
  if (lang !== undefined) (handle as { lang?: string }).lang = lang
  if (runId !== undefined) (handle as { runId?: string }).runId = runId
  if (easy) (handle as { mode?: 'easy' }).mode = 'easy'
  return handle
}
