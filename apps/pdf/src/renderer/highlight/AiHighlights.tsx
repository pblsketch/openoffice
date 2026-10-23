/**
 * AI highlights in the PDF editor (reading-assist spec 4.6), app side: the
 * start window, the job, its progress strip and the report after it.
 *
 * Rules kept here (the same as the other document jobs):
 * - nothing is sent before the person pressed Start on the confirmation;
 *   opening the window, the preview and the panel send nothing;
 * - a document that cannot be edited cannot start (the window says why);
 * - one document job per document: in this tab (the session, shared with AI
 *   page reading and translation), in this renderer (the engine's lock) and
 *   against a job another process is running;
 * - the job sends to the provider the person confirmed and never switches;
 *   the model calls carry no tools and their answers are only data;
 * - the job belongs to the tab: unmounting stops it as 'interrupted';
 * - the resume offer only opens the window with the run's choices.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ReactElement } from 'react'
import type { Lang } from '@genoffice/i18n'
import {
  highlightJobParts,
  startHighlightJob,
  type HighlightJobItem,
  type HighlightSend,
} from '../../../../../packages/pdf-structure/src/highlight'
import type { JobStatus } from '../../../../../packages/pdf-structure/src/store/store'
import type { HighlightRun } from '../../../../../packages/pdf-structure/src/store/reading'
import type { TextUnit } from '../../../../../packages/pdf-structure/src/tree/derive'
import type { PdfStoreApi, PdfStructureApi } from '../../shared/ipc'
import type { TFunc } from '../i18n/locale'
import { attemptSubscription } from '../ai/useSubscriptionConnection'
import { createModelCall } from '../doc-jobs/model-call'
import { jobRouteRefusal } from '../doc-jobs/route'
import type { DocumentJobSession, DocumentJobView } from '../doc-jobs/job-session'
import { carryJobPages } from '../doc-jobs/job-pages'
import { jobStopConnectionText } from '../doc-jobs/job-text'
import { JobProgressStrip } from '../doc-jobs/JobProgressStrip'
import {
  HighlightDialog,
  type HighlightDialogInitial,
  type HighlightStartAnswer,
  type HighlightStartRequest,
} from './HighlightDialog'
import type { HighlightSuggestions } from './highlight-controller'
import { createIpcHighlightStore } from './ipc-highlight-store'
import { draftFromRun } from './presets'

export interface AiHighlightsApi {
  tree: PdfStructureApi['tree']
  cancel: PdfStructureApi['cancel']
  onProgress: PdfStructureApi['onProgress']
  store: Pick<
    PdfStoreApi,
    | 'docHash'
    | 'aiReadPages'
    | 'unfinishedJobs'
    | 'migrate'
    | 'highlightBlocks'
    | 'highlightRuns'
    | 'write'
  >
}

export interface AiHighlightsProps {
  /** the open file; null while none is open */
  filePath: string | null
  password: string | undefined
  /** pages of the file on disk */
  pageCount: number
  lang: Lang
  t: TFunc
  /** the document cannot be edited (encrypted): the window cannot start */
  readOnly: boolean
  /** the editor has unsaved changes */
  dirty: boolean
  /** the structure and store channels; null where the shell has none (standalone) */
  api: AiHighlightsApi | null
  session: DocumentJobSession
  suggestions: HighlightSuggestions
  /** a run ended with suggestions stored (the editor turns the preview on) */
  onRunEnded?: () => void
  onNotice: (text: string) => void
}

export type HighlightOpenAnswer =
  { opened: true } | { running: { done: number; total: number } } | { unavailable: true }

export interface AiHighlightsHandle {
  /** open the start window (ribbon); never sends anything */
  requestOpen(): HighlightOpenAnswer
  /** the resume offer's Continue: the window with the run's labels, preset and pages */
  resume(job: JobStatus): void
}

interface DialogState {
  key: number
  initial: HighlightDialogInitial | null
}

/** what this tab's run of a job view brought in */
interface RunCounts {
  runId: string
  received: number
  dropped: number
  suggestions: number
}

export const AiHighlights = forwardRef<AiHighlightsHandle, AiHighlightsProps>(
  function AiHighlights(props, ref): ReactElement | null {
    const { filePath, password, pageCount, lang, t, api, session, suggestions } = props
    const [docHash, setDocHash] = useState<string | null>(null)
    const [dialog, setDialog] = useState<DialogState | null>(null)
    const [, setCountsRev] = useState(0)
    const views = useSyncExternalStore(
      useCallback((listener: () => void) => session.subscribe(listener), [session]),
      () => session.list(),
    )
    const snap = useSyncExternalStore(suggestions.subscribe, suggestions.snapshot)
    const propsRef = useRef(props)
    propsRef.current = props
    const docHashRef = useRef<string | null>(null)
    docHashRef.current = docHash
    const aliveRef = useRef(true)
    const dialogSeq = useRef(0)
    const counts = useRef(new Map<number, RunCounts>())

    useEffect(() => {
      setDocHash(null)
      if (!api || !filePath) return
      let alive = true
      void api.store
        .docHash(filePath)
        .then((out) => {
          if (alive && out.ok) setDocHash(out.docHash)
        })
        .catch(() => {})
      return () => {
        alive = false
      }
    }, [api, filePath])

    // the tab goes away: its jobs stop (the shell ends their streams and programs)
    useEffect(() => {
      aliveRef.current = true
      const stop = () => session.stopAll()
      window.addEventListener('pagehide', stop)
      return () => {
        aliveRef.current = false
        window.removeEventListener('pagehide', stop)
        stop()
      }
    }, [session])

    const open = (initial: HighlightDialogInitial | null) =>
      setDialog({ key: ++dialogSeq.current, initial })

    /** the file was saved while the job ran: its results follow the saved file */
    const carry = async (from: string): Promise<void> => {
      const p = propsRef.current
      if (!p.api || !p.filePath) return
      const now = await p.api.store.docHash(p.filePath).catch(() => null)
      if (!now?.ok || now.docHash === from) return
      const out = await p.api.store
        .migrate({
          path: p.filePath,
          oldDocHash: from,
          ...(p.password !== undefined ? { password: p.password } : {}),
        })
        .catch(() => null)
      if (!out?.ok) return
      carryJobPages(from, out.docHash)
      p.session.adopt(from, out.docHash)
      if (aliveRef.current) setDocHash(out.docHash)
    }

    const ended = async (_view: DocumentJobView, from: string): Promise<void> => {
      await carry(from)
      if (!aliveRef.current) return
      await propsRef.current.suggestions.load()
      if (aliveRef.current) propsRef.current.onRunEnded?.()
    }

    const start = async (request: HighlightStartRequest): Promise<HighlightStartAnswer> => {
      const p = propsRef.current
      if (!p.api) return { ok: false, error: p.t('hlUnavailable') }
      if (p.readOnly) return { ok: false, error: p.t('hlReadOnly') }
      const { docHash: hash, route } = request
      const tabRun = session.list().find((job) => job.state === 'running')
      const here = session.running(hash) ?? (tabRun ? { progress: tabRun } : null)
      if (here) return { ok: false, busy: { done: here.progress.done, total: here.progress.total } }
      const records = await p.api.store.unfinishedJobs(hash).catch(() => null)
      const elsewhere = records?.ok ? session.runningElsewhere(hash, records.jobs) : undefined
      if (elsewhere) return { ok: false, busy: elsewhere.progress ?? { done: 0, total: 0 } }

      // the person chose to delete the suggestions of other labels
      for (const runId of request.deleteRunIds) {
        const out = await p.api.store
          .write({ kind: 'deleteHighlightRun', docHash: hash, runId })
          .catch(() => null)
        if (!out?.ok) return { ok: false, error: p.t('hlDeleteFailed') }
      }

      const run: HighlightRun = {
        runId: request.runId,
        presetId: request.presetId,
        labels: request.labels,
        pages: request.pages ?? Array.from({ length: p.pageCount }, (_, i) => i + 1),
        provider: route.provider,
        model: route.model,
        createdAt: Date.now(),
      }
      const ask = createModelCall({
        settings: () => route.settings,
        lang: () => propsRef.current.lang,
        guard: async () => {
          const statuses = await attemptSubscription((s) => s.statuses())
          const current = await window.pdfApi?.getAiSettings().catch(() => null)
          return jobRouteRefusal(route, current ?? null, statuses)
        },
      })
      // a system prompt and one user turn of document data; no tools
      const send: HighlightSend = (req, signal) =>
        ask(
          { system: req.system, messages: [{ role: 'user', text: req.prompt }], tools: [] },
          signal,
        )
      const parts = highlightJobParts(request.tree, {
        labels: request.labels,
        send,
        ...(request.pages ? { pages: request.pages } : {}),
      })
      const tally: RunCounts = { runId: run.runId, received: 0, dropped: 0, suggestions: 0 }
      const outcome = session.start<HighlightJobItem<TextUnit>[]>({
        docHash: hash,
        kind: 'highlight',
        runId: run.runId,
        provider: route.provider,
        ...(request.aiLabel ? { aiLabel: request.aiLabel } : {}),
        launch: ({ signal, registry, onProgress }) =>
          startHighlightJob({
            docHash: hash,
            run,
            ...parts,
            store: createIpcHighlightStore(p.api!.store),
            signal,
            registry,
            onProgress,
            onStored: (c) => {
              tally.received += c.received
              tally.dropped += c.dropped
              tally.suggestions += c.suggestions
              if (aliveRef.current) setCountsRev((v) => v + 1)
            },
          }),
        pageOf: (batch) => batch[0]?.block.page ?? null,
        onEnd: (view) => void ended(view, hash),
      })
      if (!outcome.ok) return { ok: false, busy: outcome.running.progress }
      counts.current.set(outcome.view.id, tally)
      setDialog(null)
      // the old run's suggestions are gone from the preview and the panel
      if (request.deleteRunIds.length > 0) void p.suggestions.load()
      return { ok: true }
    }

    useImperativeHandle(ref, () => ({
      requestOpen() {
        const p = propsRef.current
        if (!p.api || !p.filePath) return { unavailable: true }
        const hash = docHashRef.current
        const tabRun = session.list().find((job) => job.state === 'running')
        const running =
          (hash ? session.running(hash) : null) ?? (tabRun ? { progress: tabRun } : null)
        if (running)
          return { running: { done: running.progress.done, total: running.progress.total } }
        open(null)
        return { opened: true }
      },
      resume(job) {
        const p = propsRef.current
        if (!p.api || !p.filePath) return
        void (async () => {
          const runs = job.runId ? await p.suggestions.runs() : []
          const run = runs.find((r) => r.runId === job.runId)
          if (!aliveRef.current) return
          open(run ? draftFromRun(run) : null)
        })()
      },
    }))

    const view = views.find((v) => v.state === 'running') ?? views.at(-1) ?? null
    const tally = view ? counts.current.get(view.id) : undefined
    const notFound =
      tally && snap.run?.runId === tally.runId && snap.views
        ? snap.views.filter((v) => v.state === 'pending' && !v.found).length
        : null

    return (
      <>
        {view && view.kind === 'highlight' && (
          <JobProgressStrip
            view={view}
            t={t}
            {...stripText(view, lang, t, tally, notFound)}
            onStop={() => session.stop(view.docHash)}
            onClose={() => session.dismiss(view.docHash)}
          />
        )}
        {dialog && api && filePath && (
          <HighlightDialog
            key={dialog.key}
            filePath={filePath}
            password={password}
            pageCount={pageCount}
            lang={lang}
            t={t}
            readOnly={props.readOnly}
            dirty={props.dirty}
            api={api}
            initial={dialog.initial}
            onStart={start}
            onClose={() => setDialog(null)}
          />
        )}
      </>
    )
  },
)

/** the strip's headline and lines for an AI highlight job */
function stripText(
  view: DocumentJobView,
  lang: Lang,
  t: TFunc,
  tally: RunCounts | undefined,
  notFound: number | null,
): { title: string; details: string[] } {
  const ai = view.aiLabel ? [t('arConfirmProvider', { provider: view.aiLabel })] : []
  if (view.state === 'running') {
    return {
      title: t('hlRunning', { done: view.done, total: view.total }),
      details: [
        ...ai,
        ...(view.currentPage !== null ? [t('trRunningPage', { page: view.currentPage })] : []),
      ],
    }
  }
  if (view.state === 'failed') {
    return { title: t('hlStartFailed', { reason: view.error ?? '' }), details: ai }
  }
  const report = tally
    ? [
        notFound === null
          ? t('hlReport', { received: tally.received, dropped: tally.dropped })
          : t('hlReportFound', {
              received: tally.received,
              dropped: tally.dropped,
              notFound,
            }),
      ]
    : []
  const summary = view.summary
  if (view.state === 'complete' || !summary) {
    const failed = summary?.failedUnits.length ?? 0
    return {
      title: t('hlDone', { count: tally?.suggestions ?? 0 }),
      details:
        failed > 0
          ? [...ai, ...report, t('hlFailedBatches', { count: failed })]
          : [...ai, ...report],
    }
  }
  const details = [...ai, t('trStoppedProgress', { done: view.done, total: view.total }), ...report]
  const reason = summary.stopReason
  const title =
    reason === 'cancelled' || reason === 'interrupted'
      ? t('hlStoppedCancelled')
      : reason === 'failures'
        ? t('hlStoppedFailures')
        : reason === 'store-write-failed'
          ? t('arStoppedStore')
          : (jobStopConnectionText(lang, t, summary, view.provider) ??
            t('hlStoppedError', { reason: reason ?? '' }))
  return { title, details }
}
