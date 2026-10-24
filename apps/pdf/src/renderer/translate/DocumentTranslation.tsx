/**
 * Document translation in the PDF editor (spec §8, §9), app side: the window
 * (choices and confirmation), the job, its progress strip, the choices after
 * a stop, writing the result files and the result report.
 *
 * Rules kept here:
 * - nothing is sent before the user pressed Start on the confirmation; the
 *   AI window's tool only opens the window (`requestOpen` returns at once);
 * - one document job per document: in this tab (the session, shared with AI
 *   page reading), in this renderer (the engine's lock) and against a job
 *   another process is running (a fresh 'running' record in the store that
 *   is not this tab's own job carried over by a save);
 * - the job sends to the provider the user confirmed and never switches;
 * - the job belongs to the tab: unmounting (closing the tab, quitting) stops
 *   it as 'interrupted', and the file writing with it;
 * - a resumed translation (the resume offer of AI page reading's screen)
 *   only opens the window; it never starts by itself.
 *
 * The save targets are picked when the user starts (before anything is
 * sent), so a long job writes its files when it finishes. A stopped job
 * offers to write what is done so far, or to continue later. "Store only"
 * picks no target: the translation stays in the result store and no file
 * is written.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useSyncExternalStore } from 'react'
import type { Lang } from '@genoffice/i18n'
import {
  startTranslationJob,
  type TranslationJobItem,
} from '../../../../../packages/pdf-structure/src/jobs'
import {
  translationJobParts,
  type TranslationSend,
} from '../../../../../packages/pdf-structure/src/translate'
import type { TextUnit } from '../../../../../packages/pdf-structure/src/tree/derive'
import type { JobStatus } from '../../../../../packages/pdf-structure/src/store/store'
import type {
  PdfConvertOutputRequest,
  PdfStoreApi,
  PdfStructureApi,
  PdfTranslatedPdfReport,
} from '../../shared/ipc'
import type { TFunc } from '../i18n/locale'
import { attemptSubscription } from '../ai/useSubscriptionConnection'
import { structureFailureText } from '../convert/messages'
import { createIpcJobStore } from '../doc-jobs/ipc-store'
import { createModelCall } from '../doc-jobs/model-call'
import { jobRouteRefusal } from '../doc-jobs/route'
import type { DocumentJobSession, DocumentJobView } from '../doc-jobs/job-session'
import { carryJobPages, recallJobPages, rememberJobPages } from '../doc-jobs/job-pages'
import { jobStopConnectionText } from '../doc-jobs/job-text'
import { JobProgressStrip } from '../doc-jobs/JobProgressStrip'
import {
  TranslateDialog,
  type TranslateStartAnswer,
  type TranslateStartRequest,
} from './TranslateDialog'
import { TranslateReport } from './TranslateReport'
import {
  combineReports,
  languageName,
  mergeTranslationReport,
  translationOutputName,
  type TranslationFormat,
  type TranslationResultReport,
} from './translate-model'

export interface DocumentTranslationApi {
  tree: PdfStructureApi['tree']
  cancel: PdfStructureApi['cancel']
  onProgress: PdfStructureApi['onProgress']
  pickTarget: PdfStructureApi['pickTarget']
  convert: PdfStructureApi['convert']
  writeBack: PdfStructureApi['writeBack']
  store: PdfStoreApi
  /** free a Markdown target from a tab showing it; false = still open */
  releaseTarget(request: PdfConvertOutputRequest): Promise<boolean>
  /** open a Markdown result in a Markdown tab */
  openResult(request: PdfConvertOutputRequest): Promise<boolean>
  /** show a result in the file manager */
  revealResult(request: PdfConvertOutputRequest): Promise<boolean>
}

export interface DocumentTranslationProps {
  /** the open file; null while none is open */
  filePath: string | null
  fileName: string
  password: string | undefined
  /** pages of the file on disk (original page numbers) */
  pageCount: number
  lang: Lang
  t: TFunc
  /** opened with a password, or owner-protected: no translated PDF */
  encrypted: boolean
  /** the structure and store channels; null where the shell has none (standalone) */
  api: DocumentTranslationApi | null
  session: DocumentJobSession
  /** the PDF's stored title and author (the EPUB's book information) */
  docInfo: { title?: string | undefined; author?: string | undefined }
  /** save pending edits so the files are written from what is on screen; false = not saved */
  prepare: () => Promise<boolean>
  onNotice: (text: string) => void
  /** open the AI page-reading window (offered for scanned documents) */
  onOpenAiRead?: () => void
}

/** what the AI window's tool hears back */
export type TranslateOpenAnswer =
  { opened: true } | { running: { done: number; total: number } } | { unavailable: true }

export interface DocumentTranslationHandle {
  /** open the window (ribbon, AI tool); never sends anything */
  requestOpen(request: { lang: string | null; pages: number[] | null }): TranslateOpenAnswer
  /** the resume offer's Continue for a translation: the window for its language */
  resume(job: JobStatus): void
}

interface DialogState {
  key: number
  lang: string | null
  pages: number[] | null
}

/** one translation the user started: what to write and where */
interface TranslationRun {
  docHash: string
  lang: string
  pages: number[] | null
  bilingual: boolean
  /** empty: store only, no file is written */
  targets: Array<{ format: TranslationFormat; path: string }>
}

interface Writing {
  jobId: string
  format: TranslationFormat
  done: number
  total: number
}

interface ReportState {
  lang: string
  report: TranslationResultReport | null
  outputs: Array<{ format: TranslationFormat; path: string }>
  failures: string[]
}

const FORMAT_NAME: Record<TranslationFormat, string> = { pdf: 'PDF', md: 'Markdown', epub: 'EPUB' }

let jobSeq = 0
const newJobId = (): string => `translate-out-${Date.now().toString(36)}-${(++jobSeq).toString(36)}`

export const DocumentTranslation = forwardRef<DocumentTranslationHandle, DocumentTranslationProps>(
  function DocumentTranslation(props, ref): ReactElement | null {
    const { filePath, password, pageCount, lang, t, api, session, encrypted } = props
    const [docHash, setDocHash] = useState<string | null>(null)
    const [dialog, setDialog] = useState<DialogState | null>(null)
    const [writing, setWriting] = useState<Writing | null>(null)
    const [report, setReport] = useState<ReportState | null>(null)
    const views = useSyncExternalStore(
      useCallback((listener: () => void) => session.subscribe(listener), [session]),
      () => session.list(),
    )
    const propsRef = useRef(props)
    propsRef.current = props
    const docHashRef = useRef<string | null>(null)
    docHashRef.current = docHash
    const writingRef = useRef<Writing | null>(null)
    writingRef.current = writing
    const aliveRef = useRef(true)
    const dialogSeq = useRef(0)
    /** the run of each job view this tab started */
    const runs = useRef(new Map<number, TranslationRun>())

    // the document hash of the open file (the one-job check before the window opens)
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
      const stop = () => {
        session.stopAll()
        const w = writingRef.current
        if (w) void propsRef.current.api?.cancel(w.jobId)
      }
      window.addEventListener('pagehide', stop)
      return () => {
        aliveRef.current = false
        window.removeEventListener('pagehide', stop)
        stop()
      }
    }, [session])

    /** the job this tab runs (its document may have been saved under a new hash since) */
    const tabJob = () => {
      const v = session.list().find((job) => job.state === 'running')
      if (v) return { progress: { done: v.done, total: v.total } }
      const w = writingRef.current
      return w ? { progress: { done: w.done, total: w.total } } : null
    }

    const open = (lang0: string | null, pages: number[] | null) =>
      setDialog({ key: ++dialogSeq.current, lang: lang0, pages })

    /** the file was saved while the job ran: its results follow the saved file (spec §6) */
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

    /** the save dialogs, one per format, before anything is sent; null = one was cancelled */
    const pickTargets = async (
      request: TranslateStartRequest,
    ): Promise<TranslationRun['targets'] | null> => {
      const p = propsRef.current
      if (!p.api || !p.filePath) return null
      const targets: TranslationRun['targets'] = []
      for (const format of request.formats) {
        const path = await p.api.pickTarget({
          kind: format,
          path: p.filePath,
          defaultName: translationOutputName(p.fileName, request.lang),
          title: p.t('trPickTitle', { format: FORMAT_NAME[format] }),
        })
        if (!path) return null
        targets.push({ format, path })
      }
      return targets
    }

    /** write the chosen files from the stored translation (finished blocks; the rest in the source) */
    const writeOutputs = async (run: TranslationRun): Promise<void> => {
      const p = propsRef.current
      if (!p.api || !p.filePath || writingRef.current) return
      if (!(await p.prepare()) || !aliveRef.current) return
      const outputs: ReportState['outputs'] = []
      const failures: string[] = []
      const reports: Array<TranslationResultReport | null> = []
      const source = p.filePath
      const common = {
        path: source,
        ...(p.password !== undefined ? { password: p.password } : {}),
        ...(run.pages ? { pages: run.pages } : {}),
      }
      for (const { format, path } of run.targets) {
        if (!aliveRef.current) return
        const jobId = newJobId()
        const now: Writing = { jobId, format, done: 0, total: 0 }
        writingRef.current = now
        setWriting(now)
        const off = p.api.onProgress((progress) => {
          if (progress.jobId !== jobId || !aliveRef.current) return
          setWriting((w) =>
            w && w.jobId === jobId ? { ...w, done: progress.done, total: progress.total } : w,
          )
        })
        const failed = (reason: string) =>
          failures.push(p.t('trWriteFailed', { format: FORMAT_NAME[format], reason }))
        try {
          if (format === 'md' && !(await p.api.releaseTarget({ source, path }))) {
            failed(p.t('cvErrTargetOpen'))
            continue
          }
          if (format === 'pdf') {
            const out = await p.api.writeBack({
              jobId,
              ...common,
              outPath: path,
              payload: { lang: run.lang, ...(run.bilingual ? { bilingual: true } : {}) },
            })
            if (!out.ok) {
              failed(structureFailureText(out, p.t))
              continue
            }
            const r = out.report as Partial<PdfTranslatedPdfReport> | null
            reports.push(mergeTranslationReport(r?.translation ?? null, r?.writer ?? null))
          } else {
            const stem = p.fileName.replace(/\.pdf$/i, '') || 'document'
            const out = await p.api.convert({
              jobId,
              ...common,
              format,
              outPath: path,
              translation: { lang: run.lang, bilingual: run.bilingual },
              ...(format === 'epub'
                ? {
                    epub: {
                      title: p.docInfo.title?.trim() || stem,
                      ...(p.docInfo.author?.trim() ? { author: p.docInfo.author.trim() } : {}),
                      cover: true,
                      // a bilingual book carries both languages; the writer guesses the source
                      ...(run.bilingual ? {} : { language: run.lang }),
                      uiLanguage: p.lang,
                      pageImageAlt: p.t('cvPageImageAlt'),
                    },
                  }
                : {}),
            })
            if (!out.ok) {
              failed(structureFailureText(out, p.t))
              continue
            }
            reports.push(mergeTranslationReport(out.translation ?? null, null))
          }
          outputs.push({ format, path })
        } catch (err) {
          failed(String(err))
        } finally {
          off()
        }
      }
      writingRef.current = null
      if (!aliveRef.current) return
      setWriting(null)
      setReport({ lang: run.lang, report: combineReports(reports), outputs, failures })
    }

    const ended = async (view: DocumentJobView, run: TranslationRun): Promise<void> => {
      await carry(run.docHash)
      if (!aliveRef.current) return
      if (view.state === 'complete' && run.targets.length > 0) await writeOutputs(run)
    }

    const start = async (request: TranslateStartRequest): Promise<TranslateStartAnswer> => {
      const p = propsRef.current
      if (!p.api) return { ok: false, error: p.t('trUnavailable') }
      const { docHash: hash, lang: target, route } = request
      const here = session.running(hash) ?? tabJob()
      if (here) return { ok: false, busy: here.progress }
      // a job another process runs on the same file (the terminal, another window)
      const records = await p.api.store.unfinishedJobs(hash).catch(() => null)
      const elsewhere = records?.ok ? session.runningElsewhere(hash, records.jobs) : undefined
      if (elsewhere) return { ok: false, busy: elsewhere.progress ?? { done: 0, total: 0 } }

      const targets = await pickTargets(request)
      if (!targets) return { ok: false, cancelled: true }
      const run: TranslationRun = {
        docHash: hash,
        lang: target,
        pages: request.pages,
        bilingual: request.bilingual,
        targets,
      }
      if (request.mode === 'export' || !route) {
        setDialog(null)
        if (targets.length > 0) void writeOutputs(run)
        return { ok: true }
      }

      rememberJobPages(
        hash,
        'translate',
        target,
        request.pages ?? Array.from({ length: p.pageCount }, (_, i) => i + 1),
      )
      const ask = createModelCall({
        settings: () => route.settings,
        lang: () => propsRef.current.lang,
        guard: async () => {
          const statuses = await attemptSubscription((s) => s.statuses())
          const current = await window.pdfApi?.getAiSettings().catch(() => null)
          return jobRouteRefusal(route, current ?? null, statuses)
        },
      })
      // the translation request is a system prompt and one user turn of document data; no tools
      const send: TranslationSend = (req, signal) =>
        ask(
          { system: req.system, messages: [{ role: 'user', text: req.prompt }], tools: [] },
          signal,
        )
      const parts = translationJobParts(request.tree, {
        lang: target,
        send,
        ...(request.pages ? { pages: request.pages } : {}),
      })
      const store = createIpcJobStore(p.api.store)
      const outcome = session.start<TranslationJobItem<TextUnit>[]>({
        docHash: hash,
        kind: 'translate',
        lang: target,
        provider: route.provider,
        ...(request.aiLabel ? { aiLabel: request.aiLabel } : {}),
        launch: ({ signal, registry, onProgress }) =>
          startTranslationJob({
            docHash: hash,
            lang: target,
            ...parts,
            model: { provider: route.provider, model: route.model },
            store,
            ...(request.mode === 'restart'
              ? { restart: true, ...(request.keepEdited ? { keepEdited: true } : {}) }
              : {}),
            signal,
            registry,
            onProgress,
          }),
        pageOf: (batch) => batch[0]?.block.page ?? null,
        onEnd: (view) => void ended(view, run),
      })
      if (!outcome.ok) return { ok: false, busy: outcome.running.progress }
      runs.current.set(outcome.view.id, run)
      setDialog(null)
      return { ok: true }
    }

    useImperativeHandle(ref, () => ({
      requestOpen({ lang: target, pages }) {
        const p = propsRef.current
        if (!p.api || !p.filePath) return { unavailable: true }
        const hash = docHashRef.current
        const running = (hash ? session.running(hash) : null) ?? tabJob()
        if (running) return { running: running.progress }
        open(target, pages)
        return { opened: true }
      },
      resume(job) {
        const target = job.lang ?? null
        const hash = docHashRef.current
        open(target, hash && target ? recallJobPages(hash, 'translate', target) : null)
      },
    }))

    // the tab's job, also after a save gave the file a new hash while it ran
    const view = views.find((v) => v.state === 'running') ?? views.at(-1) ?? null
    const run = view ? runs.current.get(view.id) : undefined
    const nameOf = (code: string) => languageName(code, lang)
    const pdfApi = api

    return (
      <>
        {view && view.kind === 'translate' && (
          <JobProgressStrip
            view={view}
            t={t}
            {...stripText(view, lang, t, nameOf)}
            {...(view.state === 'stopped' &&
            run &&
            run.targets.length > 0 &&
            view.done > 0 &&
            !writing
              ? {
                  actions: (
                    <>
                      <button
                        type="button"
                        className="pdf-modal-btn primary"
                        data-action="export-partial"
                        onClick={() => void writeOutputs(run)}
                      >
                        {t('trExportPartial')}
                      </button>
                      <button
                        type="button"
                        className="pdf-modal-btn"
                        data-action="continue-later"
                        onClick={() => session.dismiss(view.docHash)}
                      >
                        {t('trLater')}
                      </button>
                    </>
                  ),
                }
              : {})}
            onStop={() => session.stop(view.docHash)}
            onClose={() => session.dismiss(view.docHash)}
          />
        )}
        {writing && (
          <div className="pdf-job-strip" role="status" data-writing={writing.format}>
            <div className="pdf-job-strip-text">
              <span className="pdf-job-strip-title">
                {writing.total > 0
                  ? t('trWritingProgress', {
                      format: FORMAT_NAME[writing.format],
                      done: writing.done,
                      total: writing.total,
                    })
                  : t('trWriting', { format: FORMAT_NAME[writing.format] })}
              </span>
            </div>
            <button
              type="button"
              className="pdf-modal-btn"
              data-action="cancel-writing"
              onClick={() => void pdfApi?.cancel(writing.jobId)}
            >
              {t('arCancel')}
            </button>
          </div>
        )}
        {dialog && api && filePath && (
          <TranslateDialog
            key={dialog.key}
            filePath={filePath}
            password={password}
            pageCount={pageCount}
            lang={lang}
            t={t}
            encrypted={encrypted}
            api={api}
            initialLang={dialog.lang}
            initialPages={dialog.pages}
            onStart={start}
            {...(props.onOpenAiRead
              ? {
                  onOpenAiRead: () => {
                    setDialog(null)
                    propsRef.current.onOpenAiRead?.()
                  },
                }
              : {})}
            onClose={() => setDialog(null)}
          />
        )}
        {report && (
          <TranslateReport
            t={t}
            language={nameOf(report.lang)}
            report={report.report}
            outputs={report.outputs}
            failures={report.failures}
            partial={!!report.report && report.report.pending > 0}
            onOpenFolder={(path) => {
              if (filePath) void pdfApi?.revealResult({ source: filePath, path })
            }}
            onClose={() => {
              const md = report.outputs.find((o) => o.format === 'md')
              if (md && filePath) void pdfApi?.openResult({ source: filePath, path: md.path })
              setReport(null)
            }}
          />
        )}
      </>
    )
  },
)

/** the strip's headline and lines for a translation job */
function stripText(
  view: DocumentJobView,
  lang: Lang,
  t: TFunc,
  nameOf: (code: string) => string,
): { title: string; details: string[] } {
  const language = nameOf(view.lang ?? '')
  const ai = view.aiLabel ? [t('arConfirmProvider', { provider: view.aiLabel })] : []
  if (view.state === 'running') {
    return {
      title: t('trRunning', { language, done: view.done, total: view.total }),
      details: [
        ...ai,
        ...(view.currentPage !== null ? [t('trRunningPage', { page: view.currentPage })] : []),
      ],
    }
  }
  if (view.state === 'failed') {
    return { title: t('trStartFailed', { reason: view.error ?? '' }), details: ai }
  }
  const summary = view.summary
  if (view.state === 'complete' || !summary) {
    return { title: t('trDone', { language, count: view.done }), details: ai }
  }
  const details = [...ai, t('trStoppedProgress', { done: view.done, total: view.total })]
  const lost = summary.lostUnits.reduce<number>((n, u) => n + (u as unknown[]).length, 0)
  if (lost > 0) details.push(t('trLostBlocks', { count: lost }))
  const reason = summary.stopReason
  const title =
    reason === 'cancelled' || reason === 'interrupted'
      ? t('trStoppedCancelled')
      : reason === 'failures'
        ? t('trStoppedFailures')
        : reason === 'store-write-failed'
          ? t('arStoppedStore')
          : (jobStopConnectionText(lang, t, summary, view.provider) ??
            t('trStoppedError', { reason: reason ?? '' }))
  return { title, details }
}
