/**
 * AI page reading in the PDF editor (spec §7, §9), app side: the window
 * (picker and confirmation), the job, its progress strip, the resume offer,
 * carrying stored results over an in-app save or a page operation that
 * rewrote the file in place, and deleting this document's stored results.
 *
 * Rules kept here:
 * - nothing is sent before the user pressed Start on the confirmation; the
 *   AI window's tool only opens the window (`requestOpen` returns at once);
 * - one document job per document: in this tab (the session), in this
 *   renderer (the engine's lock) and against a job another process is
 *   running (a fresh 'running' record in the store that is not this tab's
 *   own job carried over by a save);
 * - the job sends to the provider the user confirmed and never switches;
 * - the job belongs to the tab: unmounting (closing the tab, quitting) stops
 *   it as 'interrupted';
 * - the resume offer never starts anything: Continue opens the confirmation
 *   (or hands a translation / AI highlight run to the screen that owns it);
 * - deleting names what else goes with the document's folder (edited
 *   translations, passage cards; reading-assist spec 5.5).
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useSyncExternalStore } from 'react'
import type { Lang } from '@genoffice/i18n'
import { createAiReadCallModel } from '../../../../../packages/pdf-structure/src/ai-read'
import {
  startAiReadJob,
  type AiReadJobUnit,
  type AiReadPageRef,
} from '../../../../../packages/pdf-structure/src/jobs'
import type { JobStatus } from '../../../../../packages/pdf-structure/src/store/store'
import type { PdfStoreApi, PdfStoreDeleteCounts, PdfStructureApi } from '../../shared/ipc'
import type { TFunc } from '../i18n/locale'
import { attemptSubscription } from '../ai/useSubscriptionConnection'
import { createIpcJobStore } from '../doc-jobs/ipc-store'
import { createModelCall } from '../doc-jobs/model-call'
import { jobRouteRefusal } from '../doc-jobs/route'
import type { DocumentJobSession, DocumentJobView } from '../doc-jobs/job-session'
import {
  carryJobPages,
  forgetJobPages,
  recallJobPages,
  rememberJobPages,
} from '../doc-jobs/job-pages'
import { jobStopConnectionText, pageList } from '../doc-jobs/job-text'
import { JobProgressStrip } from '../doc-jobs/JobProgressStrip'
import { ResumeOffer, resumableJobs } from '../doc-jobs/ResumeOffer'
import { AiReadDialog, type AiReadStartAnswer, type AiReadStartRequest } from './AiReadDialog'
import type { PageRenderer } from './render-page'

export interface AiPageReadingApi {
  tree: PdfStructureApi['tree']
  cancel: PdfStructureApi['cancel']
  onProgress: PdfStructureApi['onProgress']
  store: PdfStoreApi
}

export interface AiPageReadingProps {
  /** the open file; null while none is open */
  filePath: string | null
  /**
   * Bumped when the open file was rewritten in place under the same path (a
   * page operation): its hash changed, so it is read again and the next
   * save carries the stored results from the hash they are written under now
   */
  revision?: number
  password: string | undefined
  pageCount: number
  lang: Lang
  t: TFunc
  /** the structure and store channels; null where the shell has none (standalone) */
  api: AiPageReadingApi | null
  session: DocumentJobSession
  /** a renderer over the file as it is now (the job reads from it until it ends) */
  openPageRenderer: () => Promise<PageRenderer>
  /** stored readings changed (a job stored pages, a delete): search texts are stale */
  onStoredChange?: () => void
  /** one-line notices (deleted, could not delete) */
  onNotice: (text: string) => void
  /**
   * Continue an unfinished translation from the resume offer. Without it,
   * translation records are not offered here (the translation screen does).
   */
  onResumeTranslation?: (job: JobStatus) => void
  /**
   * Continue an unfinished AI highlight run from the resume offer: open its
   * start window with the run's labels and pages (the job carries `runId`).
   * Without it, highlight records are not offered here.
   */
  onResumeHighlight?: (job: JobStatus) => void
  /** a translation's target language as the user reads it */
  languageName?: (lang: string) => string
}

/** what the AI window's tool hears back */
export type AiReadOpenAnswer =
  { opened: true } | { running: { done: number; total: number } } | { unavailable: true }

export interface AiPageReadingHandle {
  /** open the window (ribbon, AI tool); never sends anything */
  requestOpen(pages: number[] | null): AiReadOpenAnswer
  /**
   * After an in-app save: carry the stored results to the saved file's hash.
   * Answers that hash once the migration completed, or null when it did not
   * (no hash read yet, no store, a failed migration).
   */
  afterSave(): Promise<string | null>
  /**
   * After a page operation rewrote the file in place, before it is read
   * again: carry the stored results of the pages it kept to the rewritten
   * file's hash, the same migration a save runs (matched by page fingerprint).
   */
  afterPageOperation(): Promise<string | null>
  /** ask, then delete everything stored for this document */
  deleteStored(): Promise<void>
}

interface DialogState {
  key: number
  pages: number[] | null
  startAtConfirm: boolean
}

export const AiPageReading = forwardRef<AiPageReadingHandle, AiPageReadingProps>(
  function AiPageReading(props, ref): ReactElement | null {
    const { filePath, password, pageCount, lang, t, api, session, revision } = props
    const [docHash, setDocHash] = useState<string | null>(null)
    const [dialog, setDialog] = useState<DialogState | null>(null)
    const [resume, setResume] = useState<JobStatus[]>([])
    const views = useSyncExternalStore(
      useCallback((listener: () => void) => session.subscribe(listener), [session]),
      () => session.list(),
    )
    const propsRef = useRef(props)
    propsRef.current = props
    const docHashRef = useRef<string | null>(null)
    docHashRef.current = docHash
    const dialogSeq = useRef(0)
    /** documents whose resume offer was already shown in this tab */
    const offered = useRef(new Set<string>())
    /** the file the hash below was read for */
    const readFor = useRef<{ api: AiPageReadingApi | null; filePath: string | null } | null>(null)

    /** the hash in state and in the ref at once (a save may read the ref before a render) */
    const takeDocHash = (hash: string | null) => {
      docHashRef.current = hash
      setDocHash(hash)
    }

    // the document hash of the open file, then its unfinished jobs (offered once);
    // read again when a page operation rewrote the same file in place (`revision`)
    useEffect(() => {
      const before = readFor.current
      readFor.current = { api, filePath }
      if (!before || before.api !== api || before.filePath !== filePath) {
        takeDocHash(null)
        setResume([])
      }
      if (!api || !filePath) return
      let alive = true
      const seen = docHashRef.current
      void (async () => {
        const hash = await api.store.docHash(filePath).catch(() => null)
        if (!alive || !hash?.ok) return
        // a migration (save, page operation) moved the hash meanwhile: it already holds the newer one
        if (docHashRef.current !== seen) return
        takeDocHash(hash.docHash)
        if (offered.current.has(hash.docHash)) return
        offered.current.add(hash.docHash)
        const unfinished = await api.store.unfinishedJobs(hash.docHash).catch(() => null)
        if (!alive || !unfinished?.ok) return
        setResume(
          resumableJobs(unfinished.jobs, {
            translate: !!propsRef.current.onResumeTranslation,
            highlight: !!propsRef.current.onResumeHighlight,
          }),
        )
      })()
      return () => {
        alive = false
      }
    }, [api, filePath, revision])

    // the tab goes away: its jobs stop (the shell ends their streams and programs)
    useEffect(() => {
      const stop = () => session.stopAll()
      window.addEventListener('pagehide', stop)
      return () => {
        window.removeEventListener('pagehide', stop)
        stop()
      }
    }, [session])

    /** the job this tab runs (its document may have been saved under a new hash since) */
    const tabJob = () => {
      const v = session.list().find((job) => job.state === 'running')
      return v ? { progress: { done: v.done, total: v.total } } : null
    }

    const open = (pages: number[] | null, startAtConfirm = false) =>
      setDialog({ key: ++dialogSeq.current, pages, startAtConfirm })

    /** carry results from `from` to the file's current hash (spec §6) */
    const migrate = async (from: string): Promise<string | null> => {
      const p = propsRef.current
      if (!p.api || !p.filePath) return null
      const out = await p.api.store
        .migrate({
          path: p.filePath,
          oldDocHash: from,
          ...(p.password !== undefined ? { password: p.password } : {}),
        })
        .catch(() => null)
      if (!out?.ok) return null
      carryJobPages(from, out.docHash)
      p.session.adopt(from, out.docHash)
      // the carried jobs were this tab's to offer already: reading the hash again does not reoffer them
      if (offered.current.has(from)) offered.current.add(out.docHash)
      return out.docHash
    }

    const start = async (request: AiReadStartRequest): Promise<AiReadStartAnswer> => {
      const p = propsRef.current
      if (!p.api) return { ok: false, error: t('arUnavailable') }
      const { docHash: hash, pages, route } = request
      const here = session.running(hash) ?? tabJob()
      if (here) return { ok: false, busy: here.progress }
      // a job another process runs on the same file (the terminal, another window)
      const records = await p.api.store.unfinishedJobs(hash).catch(() => null)
      const elsewhere = records?.ok ? session.runningElsewhere(hash, records.jobs) : undefined
      if (elsewhere) return { ok: false, busy: elsewhere.progress ?? { done: 0, total: 0 } }

      rememberJobPages(
        hash,
        'ai-read',
        undefined,
        pages.map((r) => r.page),
      )
      let renderer: Promise<PageRenderer> | null = null
      const ask = createModelCall({
        settings: () => route.settings,
        lang: () => propsRef.current.lang,
        guard: async () => {
          const statuses = await attemptSubscription((s) => s.statuses())
          const current = await window.pdfApi?.getAiSettings().catch(() => null)
          return jobRouteRefusal(route, current ?? null, statuses)
        },
      })
      const callModel = createAiReadCallModel<AiReadPageRef>({
        renderPage: async (page, signal) =>
          (await (renderer ??= p.openPageRenderer())).render(page.page, signal),
        ask: (req, signal) => ask(req, signal),
      })
      const outcome = session.start<AiReadJobUnit<AiReadPageRef>>({
        docHash: hash,
        kind: 'ai-read',
        provider: route.provider,
        ...(request.aiLabel ? { aiLabel: request.aiLabel } : {}),
        launch: ({ signal, registry, onProgress }) =>
          startAiReadJob({
            docHash: hash,
            pages,
            model: { provider: route.provider, model: route.model },
            store: createIpcJobStore(p.api!.store),
            callModel,
            signal,
            registry,
            onProgress,
          }),
        pageOf: (unit) => unit.pages[0]?.page ?? null,
        onEnd: () => {
          void renderer?.then((r) => r.close()).catch(() => {})
          propsRef.current.onStoredChange?.()
          // the file was saved while the job ran: its results follow the saved file
          const now = docHashRef.current
          if (now && now !== hash) void migrate(hash)
        },
      })
      if (!outcome.ok) return { ok: false, busy: outcome.running.progress }
      setDialog(null)
      setResume((jobs) => jobs.filter((j) => j.kind !== 'ai-read'))
      return { ok: true }
    }

    /** carry the stored results from the hash read last to the file's hash now */
    const carryToFile = async (): Promise<string | null> => {
      const from = docHashRef.current
      if (!from) return null
      const next = await migrate(from)
      if (next) takeDocHash(next)
      return next
    }

    useImperativeHandle(ref, () => ({
      requestOpen(pages) {
        const p = propsRef.current
        if (!p.api || !p.filePath) return { unavailable: true }
        const hash = docHashRef.current
        const running = (hash ? session.running(hash) : null) ?? tabJob()
        if (running) return { running: running.progress }
        open(pages)
        return { opened: true }
      },
      afterSave: carryToFile,
      afterPageOperation: carryToFile,
      async deleteStored() {
        const p = propsRef.current
        const hash = docHashRef.current
        if (!p.api || !hash) {
          p.onNotice(p.t('arUnavailable'))
          return
        }
        if (session.running(hash) ?? tabJob()) {
          p.onNotice(p.t('arDeleteBusy'))
          return
        }
        const counts = await p.api.store.deleteCounts(hash).catch(() => null)
        if (!window.confirm(deleteConfirmText(p.t, counts?.ok ? counts : null))) return
        const out = await p.api.store.deleteDocument(hash).catch(() => null)
        if (!out?.ok) {
          p.onNotice(p.t('arDeleteFailed'))
          return
        }
        forgetJobPages(hash)
        setResume([])
        p.onStoredChange?.()
        p.onNotice(p.t('arDeleted'))
      },
    }))

    const continueJob = (job: JobStatus) => {
      setResume((jobs) => jobs.filter((j) => j !== job))
      if (job.kind === 'translate') {
        propsRef.current.onResumeTranslation?.(job)
        return
      }
      if (job.kind === 'highlight') {
        propsRef.current.onResumeHighlight?.(job)
        return
      }
      const pages = docHash ? recallJobPages(docHash, 'ai-read') : null
      open(pages, pages !== null)
    }

    // the tab's job, also after a save gave the file a new hash while it ran
    const view = views.find((v) => v.state === 'running') ?? views.at(-1) ?? null
    const languageName = props.languageName ?? ((code: string) => code)

    return (
      <>
        {view && view.kind === 'ai-read' && (
          <JobProgressStrip
            view={view}
            t={t}
            {...stripText(view, lang, t)}
            onStop={() => session.stop(view.docHash)}
            onClose={() => session.dismiss(view.docHash)}
          />
        )}
        {!view && resume.length > 0 && !dialog && (
          <ResumeOffer
            jobs={resume}
            t={t}
            languageName={languageName}
            onContinue={continueJob}
            onDismiss={(job) => setResume((jobs) => jobs.filter((j) => j !== job))}
          />
        )}
        {dialog && api && filePath && (
          <AiReadDialog
            key={dialog.key}
            filePath={filePath}
            password={password}
            pageCount={pageCount}
            lang={lang}
            t={t}
            api={api}
            initialPages={dialog.pages}
            startAtConfirm={dialog.startAtConfirm}
            onStart={start}
            onClose={() => setDialog(null)}
          />
        )}
      </>
    )
  },
)

/**
 * The delete question, naming the edited translations and passage cards
 * that go with the document's folder; an item with none is left out, and
 * without counts (an older shell) the plain question remains.
 */
export function deleteConfirmText(
  t: TFunc,
  counts: Pick<PdfStoreDeleteCounts, 'editedTranslationBlocks' | 'passages'> | null,
): string {
  const question = t('arDeleteConfirm')
  const edited = counts?.editedTranslationBlocks ?? 0
  const cards = counts?.passages ?? 0
  const also =
    edited > 0 && cards > 0
      ? t('arDeleteAlsoBoth', { edited, cards })
      : edited > 0
        ? t('arDeleteAlsoEdited', { count: edited })
        : cards > 0
          ? t('arDeleteAlsoCards', { count: cards })
          : null
  return also ? `${question}\n${also}` : question
}

/** the strip's headline and lines for an AI-read job */
function stripText(
  view: DocumentJobView,
  lang: Lang,
  t: TFunc,
): { title: string; details: string[] } {
  const ai = view.aiLabel ? [t('arConfirmProvider', { provider: view.aiLabel })] : []
  if (view.state === 'running') {
    return {
      title: t('arRunning', { done: view.done, total: view.total }),
      details: [
        ...ai,
        ...(view.currentPage !== null ? [t('arRunningPage', { page: view.currentPage })] : []),
      ],
    }
  }
  if (view.state === 'failed') {
    return { title: t('arStartFailed', { reason: view.error ?? '' }), details: ai }
  }
  const summary = view.summary
  const pagesOf = (units: readonly unknown[]) =>
    pageList(units.flatMap((u) => (u as AiReadJobUnit).pages.map((p) => p.page)))
  const failed = summary ? pagesOf(summary.failedUnits.map((f) => f.unit)) : ''
  const details = [...ai, ...(failed ? [t('arFailedPages', { pages: failed })] : [])]
  if (view.state === 'complete' || !summary) {
    const read = summary
      ? summary.doneUnits.reduce<number>((n, u) => n + (u as AiReadJobUnit).pages.length, 0)
      : 0
    return { title: t('arDone', { count: read }), details }
  }
  const lost = pagesOf(summary.lostUnits)
  if (lost) details.push(t('arLostPages', { pages: lost }))
  const reason = summary.stopReason
  const title =
    reason === 'cancelled' || reason === 'interrupted'
      ? t('arStoppedCancelled')
      : reason === 'failures'
        ? t('arStoppedFailures')
        : reason === 'store-write-failed'
          ? t('arStoppedStore')
          : (jobStopConnectionText(lang, t, summary, view.provider) ??
            t('arStoppedError', { reason: reason ?? '' }))
  return { title, details }
}
