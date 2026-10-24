/**
 * Book translation in the EPUB editor (spec §8), the app side: the window
 * (choices and confirmation), the job, its progress strip with "Stop", the
 * choices after a stop, the resume offer when the book opens, writing the
 * result books and the result report.
 *
 * Rules kept here (the document job rules of docs/business-rules.md):
 * - nothing is sent before the user pressed Start on the confirmation; the
 *   ribbon button, the menu command and the AI panel's tool only open the
 *   window (`requestOpen` answers at once), and the resume offer's "Continue"
 *   only opens it too;
 * - unsaved changes are saved before the start ("Save and translate"); when
 *   the save fails nothing starts. The saved book's hash is asked again at
 *   every start: when a save changed it (this one, an automatic save, Ctrl+S)
 *   the units are read again from the saved book, so the job translates, and
 *   stores under, what the result books are built from. When a save the user
 *   did not ask for here changed the calls the confirmation showed, nothing
 *   starts and the confirmation is shown again. Automatic saves wait while
 *   the window is open (`onWindowOpen`);
 * - one job per book: in this tab, in this page (the job engine's lock) and
 *   against a job another process runs (a 'running' record in the store);
 * - the job sends to the provider the user confirmed and never switches; the
 *   engine sends two requests at a time, resends once, stops after three
 *   failures in a row and at once on a used-up limit or an ended sign-in;
 * - the tab is locked for editing (here and in the main process) from the
 *   start until the job ended and its result books are written, so the books
 *   are built from the saved book the job started from. Every way a start
 *   fails after the lock unlocks it;
 * - the job belongs to the tab: closing it (or quitting) stops the job as
 *   'interrupted'. The AI panel keeps working meanwhile: the job's calls are
 *   its own streams, and Stop cancels only those.
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
import type { AiProviderId, AiRunErrorKind } from '@genoffice/ai-provider/browser'
import type {
  EpubTranslationOutputKind,
  EpubTranslationReport,
  EpubTranslationUnit,
} from '@genoffice/epub-engine'
import type { Lang } from '@genoffice/i18n'
import type { TranslationJobItem, TranslationSend } from '@genoffice/pdf-structure'
import type { JobStatus } from '@genoffice/pdf-structure/store'
import { aiRunErrorText } from '@genoffice/ui'
import type {
  EpubAiApi,
  EpubBookSummary,
  EpubFailure,
  EpubStoreApi,
  EpubTranslateApi,
} from '../../shared/ipc'
import type { BookTranslationAnswer } from '../ai/book-tools'
import { attemptSubscription } from '../ai/subscription-client'
import type { TFunc } from '../i18n/locale'
import {
  BookTranslateDialog,
  type BookResultTarget,
  type BookTranslateDialogApi,
  type BookTranslateStartAnswer,
  type BookTranslateStartRequest,
} from './BookTranslateDialog'
import { BookTranslateReport } from './BookTranslateReport'
import { EPUB_METADATA_PAGE, estimateEpubTranslationJob, startEpubTranslationJob } from './engine'
import { createBookJobStore } from './ipc-store'
import { BookJobSession, type BookJobView } from './job-session'
import { createModelCall, type ModelStreamApi } from './model-call'
import { jobRouteRefusal } from './route'
import {
  baseName,
  chapterTitles,
  combineReports,
  jobPercent,
  languageName,
  recallChapters,
  rememberChapters,
  resumableTranslation,
} from './translate-model'
import './translate.css'

/** what book translation needs of the preload */
export type BookTranslationApi = BookTranslateDialogApi &
  Pick<EpubTranslateApi, 'documentHash' | 'writeTranslated'> & {
    store: Pick<EpubStoreApi, 'translation' | 'write' | 'unfinishedJobs'>
  } & ModelStreamApi &
  Partial<Pick<EpubAiApi, 'openSourcePath'>>

export interface BookTranslationProps {
  /** the open book; null while none is open */
  book: EpubBookSummary | null
  /** the book's file; null while none is open */
  filePath: string | null
  lang: Lang
  t: TFunc
  /** the preload's calls; null where there are none */
  api: BookTranslationApi | null
  /** the book has changes that are not saved yet */
  isDirty: () => boolean
  /** save the book (what was typed included); false = not saved */
  save: () => Promise<boolean>
  /** lock (true) or unlock (false) editing in this tab, here and in the main process */
  lock: (locked: boolean) => Promise<boolean>
  /** the window opened (true) or closed (false); automatic saves wait meanwhile */
  onWindowOpen?: (open: boolean) => void
}

export interface BookTranslationHandle {
  /** open the window (ribbon, menu, AI panel); never sends anything */
  requestOpen(request: { lang: string | null; chapters: number[] | null }): BookTranslationAnswer
}

interface DialogState {
  key: number
  lang: string | null
  chapters: number[] | null
}

/** one translation the user started: what to write and where */
interface TranslationRun {
  lang: string
  chapters: number[] | undefined
  targets: BookResultTarget[]
}

interface Writing {
  kind: EpubTranslationOutputKind
  path: string
}

interface ReportState {
  lang: string
  report: EpubTranslationReport | null
  outputs: BookResultTarget[]
  failures: string[]
  partial: boolean
}

type JobItems = TranslationJobItem<EpubTranslationUnit>[]

const WRITE_ERROR_KEY = {
  stale: 'btWriteStale',
  'invalid-target': 'btWriteTarget',
  'not-granted': 'btWriteTarget',
} as const

export const BookTranslation = forwardRef<BookTranslationHandle, BookTranslationProps>(
  function BookTranslation(props, ref): ReactElement | null {
    const { book, lang, t, api } = props
    const [session] = useState(() => new BookJobSession())
    const [dialog, setDialog] = useState<DialogState | null>(null)
    const [writing, setWriting] = useState<Writing | null>(null)
    const [report, setReport] = useState<ReportState | null>(null)
    const [offer, setOffer] = useState<{ docHash: string; job: JobStatus } | null>(null)
    const view = useSyncExternalStore(
      useCallback((listener: () => void) => session.subscribe(listener), [session]),
      () => session.view(),
    )
    const propsRef = useRef(props)
    propsRef.current = props
    const writingRef = useRef<Writing | null>(null)
    const aliveRef = useRef(true)
    const dialogSeq = useRef(0)
    const runRef = useRef<TranslationRun | null>(null)
    const offeredRef = useRef(false)
    const windowOpen = dialog !== null

    // automatic saves wait while the window is open: what it shows is the saved book
    useEffect(() => {
      if (!windowOpen) return
      propsRef.current.onWindowOpen?.(true)
      return () => propsRef.current.onWindowOpen?.(false)
    }, [windowOpen])

    // the job goes with the tab: closing it, or quitting, stops the job
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

    // an unfinished translation of this book: offered once when the book opens, never started
    useEffect(() => {
      if (!api || !book || book.fixedLayout || offeredRef.current) return
      offeredRef.current = true
      let alive = true
      void (async () => {
        const hash = await attempt(() => api.documentHash())
        if (!alive || !hash?.ok) return
        const jobs = await attempt(() => api.store.unfinishedJobs(hash.docHash))
        if (!alive || !jobs?.ok) return
        const job = resumableTranslation(jobs.jobs)
        if (job && !session.isRunning()) setOffer({ docHash: hash.docHash, job })
      })()
      return () => {
        alive = false
      }
    }, [api, book, session])

    const chapterName = (index: number): string => {
      const b = propsRef.current.book
      return (
        (b ? chapterTitles(b).get(index) : undefined) ??
        propsRef.current.t('chapterLabel', { n: index + 1 })
      )
    }

    /** the tab's job (running, or writing its result books) */
    const tabJob = (): { done: number; total: number } | null => {
      const v = session.view()
      if (v && v.state === 'running') return { done: v.done, total: v.total }
      if (writingRef.current) return { done: v?.done ?? 0, total: v?.total ?? 0 }
      return null
    }

    const open = (lang0: string | null, chapters: number[] | null) => {
      setOffer(null)
      setDialog({ key: ++dialogSeq.current, lang: lang0, chapters })
    }

    const unlock = async (): Promise<void> => {
      await propsRef.current.lock(false).catch(() => false)
    }

    /** write the chosen result books from the stored translation (finished blocks; the rest in the source) */
    const writeResults = async (run: TranslationRun, partial: boolean): Promise<void> => {
      const p = propsRef.current
      if (!p.api || writingRef.current) return
      const outputs: BookResultTarget[] = []
      const failures: string[] = []
      const reports: EpubTranslationReport[] = []
      const failed = (path: string, reason: string) =>
        failures.push(p.t('btWriteFailed', { name: baseName(path), reason }))
      const hash = await attempt(() => p.api!.documentHash())
      for (const target of run.targets) {
        if (!aliveRef.current) return
        if (!hash?.ok) {
          failed(target.path, p.t('btWriteOther'))
          continue
        }
        const now: Writing = { kind: target.kind, path: target.path }
        writingRef.current = now
        setWriting(now)
        try {
          const out = await p.api.writeTranslated({
            kind: target.kind,
            lang: run.lang,
            ...(run.chapters ? { chapters: run.chapters } : {}),
            path: target.path,
            docHash: hash.docHash,
          })
          if (!out.ok) {
            failed(target.path, writeFailureText(out, p.t))
            continue
          }
          outputs.push({ kind: target.kind, path: out.path })
          reports.push(out.report)
        } catch {
          failed(target.path, p.t('btWriteOther'))
        }
      }
      writingRef.current = null
      if (!aliveRef.current) return
      setWriting(null)
      setReport({ lang: run.lang, report: combineReports(reports), outputs, failures, partial })
    }

    const ended = async (last: BookJobView, run: TranslationRun): Promise<void> => {
      try {
        if (last.state === 'complete' && run.targets.length > 0 && aliveRef.current) {
          await writeResults(run, false)
        }
      } finally {
        await unlock()
      }
    }

    /** "Export what is translated so far" after a stop: the result books, the rest in the source */
    const exportPartial = async (): Promise<void> => {
      const run = runRef.current
      if (!run || writingRef.current) return
      session.dismiss()
      const locked = await propsRef.current.lock(true).catch(() => false)
      try {
        if (locked) await writeResults(run, true)
      } finally {
        await unlock()
      }
    }

    /** Start from the confirmation; never rejects (a failure is the answer). */
    const start = async (request: BookTranslateStartRequest): Promise<BookTranslateStartAnswer> => {
      try {
        return await begin(request)
      } catch (err) {
        return { ok: false, error: propsRef.current.t('btFailed', { reason: errorText(err) }) }
      }
    }

    const begin = async (request: BookTranslateStartRequest): Promise<BookTranslateStartAnswer> => {
      const p = propsRef.current
      if (!p.api) return { ok: false, error: p.t('btUnavailable') }
      const tabBusy = tabJob()
      if (tabBusy) return { ok: false, busy: tabBusy }
      const busy = async (hash: string): Promise<BookTranslateStartAnswer | null> => {
        const here = session.running(hash)
        if (here) return { ok: false, busy: here.progress }
        // a job another process runs on the same book (the terminal, another tab)
        const records = await attempt(() => p.api!.store.unfinishedJobs(hash))
        const elsewhere = records?.ok ? session.runningElsewhere(records.jobs) : undefined
        if (elsewhere) {
          return {
            ok: false,
            busy: {
              done: elsewhere.progress?.done ?? 0,
              total: elsewhere.progress?.total ?? 0,
            },
          }
        }
        return null
      }
      const refused = await busy(request.docHash)
      if (refused) return refused

      let { docHash, units } = request
      // "Save and translate": the book is saved first; a failed save starts nothing
      const saving = p.isDirty()
      if (saving && !(await p.save())) return { ok: false, error: p.t('btSaveFailed') }
      // the saved book now: a save since the window read it (this one, an automatic
      // save, Ctrl+S) moved its stored results to a new hash, and the result books
      // are written from that one
      const now = await attempt(() => p.api!.documentHash())
      if (!now?.ok) return { ok: false, error: p.t('btLoadFailed') }
      if (now.docHash !== docHash) {
        const fresh = await p.api
          .translationUnits(request.chapters ? { chapters: request.chapters } : {})
          .catch(() => null)
        if (!fresh?.ok) return { ok: false, error: p.t('btLoadFailed') }
        docHash = fresh.docHash
        units = fresh.units
        const again = await busy(docHash)
        if (again) return again
        // a save the user did not ask for here changed what the confirmation counted
        if (!saving && request.calls !== undefined) {
          const estimate = await estimateEpubTranslationJob({
            docHash,
            lang: request.lang,
            units,
            model: { provider: request.route?.provider ?? '', model: request.route?.model ?? '' },
            store: createBookJobStore(p.api.store),
          }).catch(() => null)
          if (!estimate) return { ok: false, error: p.t('btLoadFailed') }
          if (estimate.calls !== request.calls) return { ok: false, changed: true }
        }
      }

      const run: TranslationRun = {
        lang: request.lang,
        chapters: request.chapters,
        targets: request.targets,
      }
      runRef.current = run
      setReport(null)
      setOffer(null)

      const route = request.route
      if (request.mode === 'export' || !route) {
        setDialog(null)
        const locked = await p.lock(true).catch(() => false)
        try {
          if (locked) await writeResults(run, false)
        } finally {
          await unlock()
        }
        return { ok: true }
      }

      // from here every way out but a started job unlocks the tab
      let started = false
      try {
        if (!(await p.lock(true).catch(() => false))) {
          return { ok: false, error: p.t('btUnavailable') }
        }
        rememberChapters(docHash, request.lang, request.chapters)
        const api = p.api
        const ask = createModelCall({
          api,
          settings: () => route.settings,
          lang: () => propsRef.current.lang,
          guard: async () => {
            const statuses = await attemptSubscription((s) => s.statuses())
            const current = await propsRef.current.api?.getAiSettings?.().catch(() => null)
            return jobRouteRefusal(route, current ?? null, statuses)
          },
        })
        // the translation request is a system prompt and one user turn of book text; no tools
        const send: TranslationSend = (req, signal) =>
          ask(
            { system: req.system, messages: [{ role: 'user', text: req.prompt }], tools: [] },
            signal,
          )
        const store = createBookJobStore(api.store)
        const outcome = session.start<JobItems>({
          docHash,
          lang: request.lang,
          provider: route.provider,
          launch: ({ signal, registry, onProgress }) =>
            startEpubTranslationJob({
              docHash,
              lang: request.lang,
              units,
              model: { provider: route.provider, model: route.model },
              store,
              send,
              ...(request.mode === 'restart' ? { restart: true } : {}),
              signal,
              registry,
              onProgress,
            }),
          pageOf: (batch) => batch[0]?.block.page ?? null,
          onEnd: (last) => void ended(last, run),
        })
        if (!outcome.ok) return { ok: false, busy: outcome.running.progress }
        started = true
      } catch (err) {
        return { ok: false, error: p.t('btFailed', { reason: errorText(err) }) }
      } finally {
        // a job that started unlocks when it ended and its result books are written
        if (!started) await unlock()
      }
      setDialog(null)
      return { ok: true }
    }

    useImperativeHandle(ref, () => ({
      requestOpen({ lang: target, chapters }) {
        const p = propsRef.current
        if (!p.api || !p.book || !p.filePath || p.book.fixedLayout) return { unavailable: true }
        const running = tabJob()
        if (running) return { running }
        open(target, chapters)
        return { opened: true }
      },
    }))

    const nameOf = (code: string) => languageName(code, lang)
    const run = runRef.current

    return (
      <>
        {offer && !view && (
          <div
            className="bt-strip"
            role="status"
            data-resume-lang={offer.job.lang}
            data-strip="resume"
          >
            <div className="bt-strip-text">
              <span className="bt-strip-title">
                {t('btResume', {
                  language: nameOf(offer.job.lang ?? ''),
                  percent: jobPercent(offer.job.progress),
                })}
              </span>
            </div>
            <button
              type="button"
              className="bt-btn primary"
              data-action="resume-job"
              onClick={() => {
                const target = offer.job.lang ?? null
                open(target, target ? recallChapters(offer.docHash, target) : null)
              }}
            >
              {t('btResumeContinue')}
            </button>
            <button
              type="button"
              className="bt-btn"
              data-action="dismiss-resume"
              onClick={() => setOffer(null)}
            >
              {t('btResumeLater')}
            </button>
          </div>
        )}
        {view && (
          <JobStrip
            view={view}
            t={t}
            lang={lang}
            language={nameOf(view.lang)}
            chapterName={chapterName}
            canExport={
              view.state === 'stopped' &&
              view.done > 0 &&
              !!run &&
              run.targets.length > 0 &&
              !writing
            }
            onStop={() => session.stop()}
            onExport={() => void exportPartial()}
            onLater={() => session.dismiss()}
            onClose={() => session.dismiss()}
          />
        )}
        {writing && (
          <div className="bt-strip" role="status" data-strip="writing" data-writing={writing.kind}>
            <div className="bt-strip-text">
              <span className="bt-strip-title">
                {t('btWriting', { name: baseName(writing.path) })}
              </span>
            </div>
          </div>
        )}
        {dialog && api && book && props.filePath && (
          <BookTranslateDialog
            key={dialog.key}
            book={book}
            filePath={props.filePath}
            lang={lang}
            t={t}
            api={api}
            initialLang={dialog.lang}
            initialChapters={dialog.chapters}
            dirty={props.isDirty()}
            onStart={start}
            onClose={() => setDialog(null)}
          />
        )}
        {report && (
          <BookTranslateReport
            t={t}
            language={nameOf(report.lang)}
            report={report.report}
            outputs={report.outputs}
            failures={report.failures}
            partial={report.partial}
            chapterName={chapterName}
            onOpen={(path) => void propsRef.current.api?.openSourcePath?.(path).catch(() => {})}
            onClose={() => setReport(null)}
          />
        )}
      </>
    )
  },
)

/** a preload call's answer, or null when it failed or the preload has no such call */
async function attempt<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call()
  } catch {
    return null
  }
}

/** the reason of a failure, for the message */
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function writeFailureText(out: EpubFailure, t: TFunc): string {
  const key = WRITE_ERROR_KEY[out.error as keyof typeof WRITE_ERROR_KEY]
  return t(key ?? 'btWriteOther')
}

/** the strip of the tab's job: progress and Stop while it runs; what happened once it ended */
function JobStrip({
  view,
  t,
  lang,
  language,
  chapterName,
  canExport,
  onStop,
  onExport,
  onLater,
  onClose,
}: {
  view: BookJobView
  t: TFunc
  lang: Lang
  language: string
  chapterName: (index: number) => string
  canExport: boolean
  onStop: () => void
  onExport: () => void
  onLater: () => void
  onClose: () => void
}): ReactElement {
  const running = view.state === 'running'
  const percent = view.total > 0 ? Math.min(100, (view.done / view.total) * 100) : 0
  const { title, details } = stripText(view, lang, t, language, chapterName)
  return (
    <div
      className={`bt-strip${running ? '' : view.state === 'complete' ? ' is-done' : ' is-stopped'}`}
      role={running ? 'status' : 'alert'}
      data-strip="job"
      data-job-state={view.state}
    >
      <div className="bt-strip-text">
        <span className="bt-strip-title">{title}</span>
        {details.map((line) => (
          <span key={line} className="bt-strip-detail">
            {line}
          </span>
        ))}
        {running && (
          <div className="bt-strip-bar" aria-hidden="true">
            <div className="bt-strip-fill" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
      {running ? (
        <button
          type="button"
          className="bt-btn"
          data-action="stop-job"
          disabled={view.stopping}
          onClick={onStop}
        >
          {view.stopping ? t('btStopping') : t('btStop')}
        </button>
      ) : canExport ? (
        <>
          <button
            type="button"
            className="bt-btn primary"
            data-action="export-partial"
            onClick={onExport}
          >
            {t('btExportPartial')}
          </button>
          <button type="button" className="bt-btn" data-action="continue-later" onClick={onLater}>
            {t('btLater')}
          </button>
        </>
      ) : (
        <button type="button" className="bt-btn" data-action="close-job" onClick={onClose}>
          {t('btClose')}
        </button>
      )}
    </div>
  )
}

/** the strip's headline and lines */
function stripText(
  view: BookJobView,
  lang: Lang,
  t: TFunc,
  language: string,
  chapterName: (index: number) => string,
): { title: string; details: string[] } {
  if (view.state === 'running') {
    const page = view.currentPage
    return {
      title: t('btRunning', { language, done: view.done, total: view.total }),
      details:
        page === null
          ? []
          : [
              page === EPUB_METADATA_PAGE
                ? t('btRunningMeta')
                : t('btRunningChapter', { chapter: chapterName(page) }),
            ],
    }
  }
  if (view.state === 'failed') {
    return { title: t('btFailed', { reason: view.error ?? '' }), details: [] }
  }
  const summary = view.summary
  if (view.state === 'complete' || !summary) {
    return { title: t('btDone', { language, count: view.done }), details: [] }
  }
  const details = [t('btStoppedProgress', { done: view.done, total: view.total })]
  const lost = summary.lostUnits.reduce<number>((n, u) => n + (u as unknown[]).length, 0)
  if (lost > 0) details.push(t('btLostBlocks', { count: lost }))
  const reason = summary.stopReason
  const title =
    reason === 'cancelled' || reason === 'interrupted'
      ? t('btStoppedCancelled')
      : reason === 'failures'
        ? t('btStoppedFailures')
        : reason === 'store-write-failed'
          ? t('btStoppedStore')
          : (connectionStopText(lang, t, summary, view.provider) ??
            t('btStoppedError', { reason: reason ?? '' }))
  return { title, details }
}

/**
 * The connection-side reason a job stopped ('rate-limit' with its reset time,
 * 'signed-out', …), worded once for every editor by `aiRunErrorText`; null
 * when the reason is the job's own.
 */
function connectionStopText(
  lang: Lang,
  t: TFunc,
  summary: { stopReason?: string; resetsAt?: number },
  provider: string,
): string | null {
  const kind = summary.stopReason
  if (!kind) return null
  if (kind === 'credits') return t('aiCreditsExhausted')
  return (
    aiRunErrorText(lang, {
      kind: kind as AiRunErrorKind,
      provider: provider as AiProviderId,
      ...(summary.resetsAt !== undefined ? { resetsAt: summary.resetsAt } : {}),
    }) ?? null
  )
}
