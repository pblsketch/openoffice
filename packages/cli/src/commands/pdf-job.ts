/**
 * What `pdf ai-read` and `pdf translate` share (spec §9, §10): the route the
 * requests go on, the estimate a run without --yes answers with, the refusal
 * of a paid route without --allow-paid, one job per document, the job shape
 * `pdf status` reports, and the error a stopped job answers with.
 */
import { documentJobs, type JobSummary } from '../../../pdf-structure/src'
import type { JobKind, JobStatus, ResultStore } from '../../../pdf-structure/src/store'
import { cloudNextStep, headlessCall, prepareCloud } from '../cloud'
import { resolvePdfAiRoute, type PdfAiJob, type PdfAiRoute } from '../pdf-ai'
import { CliError, EXIT } from '../result'
import { PRODUCT_NAME } from '@genoffice/i18n'

export type AvailableRoute = Extract<PdfAiRoute, { available: true }>

/** The route of a document job on the automatic-call path, or the error that it has none. */
export async function pdfJobRoute(env: NodeJS.ProcessEnv, job: PdfAiJob): Promise<AvailableRoute> {
  await prepareCloud(env)
  const { settings, context } = await headlessCall(env, 'pdf')
  const route = resolvePdfAiRoute(settings, context, job)
  if (!route.available) {
    throw new CliError(
      EXIT.app,
      route.message,
      { errorCode: route.errorCode },
      {
        suggestion:
          cloudNextStep(route.errorCode) ??
          `do not retry: tell the user it has to be set up under Settings > AI in ${PRODUCT_NAME}`,
      },
    )
  }
  return route
}

/** detail.estimate: what would be sent, where, and whether it is billed per request */
export function estimateOf(
  route: AvailableRoute,
  calls: number,
  pages: number,
): { calls: number; pages: number; provider: string; route: string; metered: boolean } {
  return { calls, pages, provider: route.provider, route: route.route, metered: route.paid }
}

/** A route billed per request runs only with --allow-paid (spec §10). */
export function assertPaidAllowed(route: AvailableRoute, allowPaid: boolean): void {
  if (!route.paid || allowPaid) return
  throw new CliError(
    EXIT.app,
    `${route.provider} bills each request${route.metered ? ' (a metered login)' : ''}; nothing was sent`,
    { route: route.route, via: route.provider },
    {
      reason: 'paid_route_not_allowed',
      suggestion:
        'ask the user first; pass --allow-paid only when they accept the charge, or have them switch to a subscription',
    },
  )
}

/** How the refusal names a running job of each kind. */
function runningJobLabel(kind: JobKind, lang: string | undefined): string {
  switch (kind) {
    case 'ai-read':
      return 'an AI page reading'
    case 'translate':
      return `a translation (${lang})`
    case 'translate-page':
      return `a page translation (${lang})`
    case 'highlight':
      return 'an AI highlighting'
    case 'summary':
      return `a document summary (${lang})`
    default:
      return 'a document job'
  }
}

/**
 * One document job at a time per document, in this process and in any other
 * (spec §9). `statusCommand` is the command the refusal points at.
 */
export async function assertNoRunningJob(
  store: ResultStore,
  docHash: string,
  statusCommand = 'pdf status',
): Promise<void> {
  const here = documentJobs.running(docHash)
  const elsewhere = here ? null : (await store.listJobs(docHash)).find((j) => j.state === 'running')
  const running = here
    ? { kind: here.kind, lang: here.lang, runId: here.runId, progress: here.progress }
    : elsewhere
      ? {
          kind: elsewhere.kind,
          lang: elsewhere.lang,
          runId: elsewhere.runId,
          progress: elsewhere.progress,
        }
      : null
  if (!running) return
  const label = runningJobLabel(running.kind, running.lang)
  const progress = running.progress ? ` (${running.progress.done}/${running.progress.total})` : ''
  throw new CliError(
    EXIT.app,
    `${label} is already running on this document${progress}`,
    {
      errorCode: 'document-job-running',
      job: {
        kind: running.kind,
        ...(running.lang !== undefined ? { lang: running.lang } : {}),
        ...(running.runId !== undefined ? { runId: running.runId } : {}),
        ...(running.progress ? { progress: running.progress } : {}),
      },
    },
    { suggestion: `wait for it to end; \`ieumoffice ${statusCommand} <file>\` shows its progress` },
  )
}

/** The `job` object of `pdf status` (spec §10), with the progress the record holds. */
export function jobView(status: JobStatus): {
  state: JobStatus['state']
  last_error?: string
  resetsAt?: number
  outputs: string[]
  progress?: { done: number; total: number }
} {
  return {
    state: status.state,
    ...(status.last_error !== undefined ? { last_error: status.last_error } : {}),
    ...(status.resetsAt !== undefined ? { resetsAt: status.resetsAt } : {}),
    outputs: [...status.outputs],
    ...(status.progress ? { progress: { ...status.progress } } : {}),
  }
}

const STOP_STEP: Record<string, string> = {
  'rate-limit':
    "do not retry now: the usage limit of the user's subscription is reached; run the same command after detail.resetsAt and it continues where it stopped",
  failures:
    'several requests in a row failed: check the connection, then run the same command again to continue where it stopped',
  'store-write-failed':
    'the result store could not be written (disk full or not writable): tell the user; results that came back after the failure are lost',
  cancelled: 'run the same command again to continue where it stopped',
  interrupted: 'run the same command again to continue where it stopped',
}

/** The next step for a stopped job. */
export function stopStep(reason: string): string {
  return (
    STOP_STEP[reason] ??
    cloudNextStep(reason) ??
    'run the same command again later to continue where it stopped'
  )
}

/**
 * A job that stopped early, as the failure the automatic-call commands answer
 * with: exit 4, `app_unavailable`, the cause in detail.errorCode and, for a
 * rate limit, detail.resetsAt (spec §10).
 */
export function stoppedError(
  what: string,
  summary: Pick<JobSummary<unknown>, 'stopReason' | 'resetsAt'>,
  extra: Record<string, unknown>,
): CliError {
  const errorCode = summary.stopReason ?? 'cancelled'
  const when = summary.resetsAt === undefined ? null : new Date(summary.resetsAt).toISOString()
  return new CliError(
    EXIT.app,
    `${what} stopped (${errorCode})${when ? `; possible again at ${when}` : ''}`,
    {
      errorCode,
      ...(summary.resetsAt !== undefined ? { resetsAt: summary.resetsAt } : {}),
      ...extra,
    },
    { suggestion: stopStep(errorCode) },
  )
}

/**
 * In the foreground, Ctrl+C (and the other signals that end the process)
 * stops the job as 'interrupted' instead of killing the process mid-write,
 * so the record is written and the command still answers. A second signal
 * ends the process the usual way. Returns the function that removes the
 * listeners.
 */
export function stopOnSignals(stop: () => void): () => void {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP']
  const onSignal = () => {
    remove()
    stop()
  }
  const remove = () => {
    for (const s of signals) process.removeListener(s, onSignal)
  }
  for (const s of signals) process.once(s, onSignal)
  return remove
}
