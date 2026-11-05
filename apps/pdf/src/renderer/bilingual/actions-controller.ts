/**
 * What the side-by-side translation view does when a person presses
 * something (reading-assist spec 4.5): the page translation button, a
 * paragraph's "translate again", and editing a translated paragraph. One
 * controller per editor tab; the column pieces read its snapshot.
 *
 * Rules kept here:
 * - nothing is sent unless a press asked for it; showing or scrolling the
 *   view never calls `press*`;
 * - a press goes through the shared send gate (the host component wires
 *   `useAiSendGate`): a status check holds it, the first-connection notice
 *   holds it until acknowledged, "not connected" answers with the connect
 *   prompt and drops it;
 * - the provider is `documentJobRoute`'s answer, decided per press and
 *   kept for the job; nothing here picks or switches a provider;
 * - the page translation is the one document job that skips the pre-start
 *   confirmation on a subscription. On a paid route (key provider, accepted
 *   metered login) the first press in the tab asks once ("〈provider〉 will
 *   charge · Translate / Cancel"); after "Translate" the tab does not ask
 *   again until the provider changes. A stored translation made by another
 *   AI is not mentioned: translations may mix;
 * - the page job runs on the job engine as 'translate-page': its own job
 *   record, never `translate.<lang>.json`, never the resume offer, the
 *   provider record only when there is none; one document job at a time;
 * - "translate again" is one call of its own (./retranslate), not a job,
 *   and waits while a document job runs here or in another process; a
 *   person's edit is dropped only after the person confirmed it;
 * - an edit is stored as plain text marked as edited;
 * - a write lands on the hash its press started on; when a save changed the
 *   file meanwhile, the results are carried to the new hash afterwards, like
 *   the page job's;
 * - model answers are document data and are only stored as text;
 * - every press works in the mode the view shows (translation-reading spec
 *   5.3): the plain translation, or the easy explanation, whose page job,
 *   one-paragraph call and edits read and write the easy results only. The
 *   paid-route answer is the tab's, whatever the mode.
 */
import type { AiProviderId, AiRunErrorKind } from '@genoffice/ai-provider/browser'
import type { Lang } from '@genoffice/i18n'
import { aiProviderDisplayName } from '@genoffice/ui'
import {
  startTranslationJob,
  type TranslationJobItem,
} from '../../../../../packages/pdf-structure/src/jobs'
import type { TranslationMode } from '../../../../../packages/pdf-structure/src/store/job-keys'
import type { TranslationBlockKey } from '../../../../../packages/pdf-structure/src/store/keys'
import {
  translationJobParts,
  translationSourceLanguage,
  type TranslationSend,
} from '../../../../../packages/pdf-structure/src/translate'
import { runsText } from '../../../../../packages/pdf-structure/src/tree/inline'
import type { TextUnit } from '../../../../../packages/pdf-structure/src/tree/derive'
import type { PdfStoreApi } from '../../shared/ipc'
import type { TFunc } from '../i18n/locale'
import { attemptSubscription } from '../ai/useSubscriptionConnection'
import { createIpcJobStore } from '../doc-jobs/ipc-store'
import type { DocumentJobSession, DocumentJobView } from '../doc-jobs/job-session'
import { jobStopConnectionText } from '../doc-jobs/job-text'
import { ModelCallError, createModelCall } from '../doc-jobs/model-call'
import { jobRouteRefusal, type DocumentJobRoute } from '../doc-jobs/route'
import { untranslatedReasonText } from '../translate/translate-model'
import { runsHaveMarks, type BilingualUnit } from './model'
import { retranslateBlock } from './retranslate'
import type { BilingualData } from './useBilingualData'

type ReadyRoute = Extract<DocumentJobRoute, { state: 'ready' }>

/** a press that sends, as the send gate holds it */
export type BilingualActionRequest =
  | { kind: 'page'; docHash: string; lang: string; mode: TranslationMode; page: number }
  | {
      kind: 'retranslate'
      docHash: string
      lang: string
      mode: TranslationMode
      unit: BilingualUnit
    }

/** the send gate and the route, as the mounted view wires them */
export interface BilingualActionsHost {
  /** the route a press would use now */
  route(): DocumentJobRoute
  /** the shared send gate: true = send now; false = held or answered by the connect prompt */
  admit(request: BilingualActionRequest): boolean
}

export type BilingualStoreApi = Pick<
  PdfStoreApi,
  'translation' | 'write' | 'unfinishedJobs' | 'docHash' | 'migrate' | 'aiReadPages'
>

export interface BilingualActionsDeps {
  session: DocumentJobSession
  /** null where the shell has no store channels */
  store: BilingualStoreApi | null
  /** UI language (run error texts) */
  lang: Lang
  t: TFunc
  /** the open file as saved, to carry results after a save during a job */
  filePath: string
  password: string | undefined
}

/** the paragraph editor while open */
export interface BilingualEditing {
  docHash: string
  lang: string
  /** the results the edit is stored in */
  mode: TranslationMode
  key: TranslationBlockKey
  keyString: string
  /** the text the editor opens with */
  initial: string
  /** the paragraph had marks a plain-text edit drops */
  dropsFormat: boolean
  saving: boolean
  error: string | null
}

export interface BilingualActionsSnapshot {
  route: DocumentJobRoute
  /** a document job runs in this tab (or this process) or a page job is being started */
  busy: boolean
  /** the page job this controller runs, with its progress */
  pageJob: {
    docHash: string
    lang: string
    mode: TranslationMode
    page: number
    done: number
    total: number
  } | null
  /** the paid-route question shown on a page, and the route (`paidRouteKey`) it names */
  paidAsk: {
    docHash: string
    lang: string
    mode: TranslationMode
    page: number
    provider: string
    routeKey: string
  } | null
  /** per page (`pageKey`): why the page translation did not run or stopped */
  pageNotes: ReadonlyMap<string, string>
  /** the block being translated again */
  retranslating: string | null
  /** the edited block whose "translate again" waits for the person's answer */
  confirmDiscard: string | null
  /** per block (key string): why "translate again" did not work */
  paraNotes: ReadonlyMap<string, string>
  editing: BilingualEditing | null
}

export const pageKey = (
  docHash: string,
  lang: string,
  page: number,
  mode: TranslationMode = 'translate',
): string => `${docHash}\u0000${lang}\u0000${page}${mode === 'easy' ? '\u0000easy' : ''}`

/** the tab's paid-route answer holds for one provider on one kind of route */
export function paidRouteKey(route: ReadyRoute): string {
  return `${route.provider}\u0000${route.metered ? 'metered' : 'key'}`
}

/**
 * "translate this page" when nothing on it is stored yet, else "translate the
 * rest (N)"; the easy explanation's words in that mode
 */
export function pageActionLabel(
  counts: { units: number; pending: number },
  t: TFunc,
  mode: TranslationMode = 'translate',
): string | null {
  if (counts.pending <= 0) return null
  const easy = mode === 'easy'
  if (counts.pending >= counts.units) return easy ? t('blEasyPage') : t('blTranslatePage')
  return easy
    ? t('blEasyRest', { count: counts.pending })
    : t('blTranslateRest', { count: counts.pending })
}

/** a store write's `mode`: none for the plain translation, so its request stays as it was */
const modeField = (mode: TranslationMode): { mode?: 'easy' } =>
  mode === 'easy' ? { mode: 'easy' } : {}

const CHECKING: DocumentJobRoute = { state: 'checking' }

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

export class BilingualActionsController {
  private deps: BilingualActionsDeps
  private host: BilingualActionsHost | null = null
  private data: BilingualData | null = null
  private route: DocumentJobRoute = CHECKING
  private paidAck: string | null = null
  private paidAsk: BilingualActionsSnapshot['paidAsk'] = null
  private pageJob: {
    docHash: string
    lang: string
    mode: TranslationMode
    page: number
    viewId: number
  } | null = null
  private starting = false
  private readonly pageNotes = new Map<string, string>()
  private retranslating: string | null = null
  private confirmDiscard: string | null = null
  private readonly paraNotes = new Map<string, string>()
  private editing: BilingualEditing | null = null
  /** the text in the open editor, kept so it survives the editor following a new hash */
  private draft: string | null = null
  private readonly aborts = new Set<AbortController>()
  private readonly listeners = new Set<() => void>()
  private snap: BilingualActionsSnapshot
  private readonly offSession: () => void
  private disposed = false

  constructor(deps: BilingualActionsDeps) {
    this.deps = deps
    this.snap = this.build()
    this.offSession = deps.session.subscribe(() => this.emit())
  }

  // ── wiring ──

  /** the editor's latest values (store, language, file) */
  update(deps: BilingualActionsDeps): void {
    this.deps = deps
  }

  /** the mounted view's gate and route; null when the view goes away */
  bindHost(host: BilingualActionsHost | null): void {
    this.host = host
    if (!host) {
      this.paidAsk = null
      this.confirmDiscard = null
      this.editing = null
      this.draft = null
      this.emit()
    }
  }

  /**
   * The view's data (tree, hash, language). A save that changed the file
   * rebuilds the tree under the new hash (the store carried the blocks
   * there): an open editor follows it with the text typed so far.
   */
  setData(data: BilingualData | null): void {
    this.data = data
    const e = this.editing
    if (
      e &&
      data?.docHash &&
      data.docHash !== e.docHash &&
      data.lang === e.lang &&
      (data.mode ?? 'translate') === e.mode
    ) {
      this.editing = { ...e, docHash: data.docHash, initial: this.draft ?? e.initial }
      this.emit()
    }
  }

  /** the route the page buttons name; changes re-render them */
  setRoute(route: DocumentJobRoute): void {
    const before = this.route
    this.route = route
    const key = (r: DocumentJobRoute) =>
      r.state === 'ready' ? `ready:${r.provider}:${r.model}:${r.paid}:${r.metered}` : r.state
    if (key(before) !== key(route)) this.emit()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot = (): BilingualActionsSnapshot => this.snap

  /** the tab goes away: one-off calls stop (page jobs belong to the session, which stops them) */
  dispose(): void {
    this.disposed = true
    this.offSession()
    for (const abort of this.aborts) abort.abort()
    this.aborts.clear()
    this.listeners.clear()
  }

  // ── page translation ──

  /** "translate this page" / "translate the rest (N)", in the mode the view shows */
  pressPage = (
    docHash: string,
    lang: string,
    page: number,
    mode: TranslationMode = 'translate',
  ): void => {
    if (this.isBusy(docHash)) return
    const request: BilingualActionRequest = { kind: 'page', docHash, lang, mode, page }
    this.pageNotes.delete(pageKey(docHash, lang, page, mode))
    if (this.askPaid(request)) return
    this.paidAsk = null
    this.emit()
    if (this.host?.admit(request)) this.run(request)
  }

  /**
   * "Translate" on the paid-route question: the tab stops asking for the
   * provider the question named. When the route changed while it was shown,
   * the answer does not cover the new provider: ask again for it.
   */
  confirmPaid = (): void => {
    const ask = this.paidAsk
    if (!ask) return
    const request: Extract<BilingualActionRequest, { kind: 'page' }> = {
      kind: 'page',
      docHash: ask.docHash,
      lang: ask.lang,
      mode: ask.mode,
      page: ask.page,
    }
    const route = this.host?.route() ?? CHECKING
    if (route.state === 'ready' && route.paid) {
      if (paidRouteKey(route) !== ask.routeKey) {
        this.paidAsk = null
        if (this.askPaid(request)) return
      } else {
        this.paidAck = ask.routeKey
      }
    }
    this.paidAsk = null
    this.emit()
    if (this.host?.admit(request)) this.run(request)
  }

  cancelPaid = (): void => {
    this.paidAsk = null
    this.emit()
  }

  /** "Stop" on the running page job */
  stopPage = (): void => {
    const job = this.pageJob
    if (job) this.deps.session.stop(job.docHash)
  }

  // ── translate again ──

  pressRetranslate = (
    docHash: string,
    lang: string,
    unit: BilingualUnit,
    mode: TranslationMode = 'translate',
  ): void => {
    if (unit.state === 'pending' || this.isBusy(docHash) || this.retranslating) return
    this.paraNotes.delete(unit.keyString)
    if (unit.edited) {
      this.confirmDiscard = unit.keyString
      this.emit()
      return
    }
    this.submitRetranslate({ kind: 'retranslate', docHash, lang, mode, unit })
  }

  /** "Discard and translate again" on an edited paragraph */
  confirmRetranslate = (
    docHash: string,
    lang: string,
    unit: BilingualUnit,
    mode: TranslationMode = 'translate',
  ): void => {
    if (this.confirmDiscard !== unit.keyString) return
    this.confirmDiscard = null
    this.submitRetranslate({ kind: 'retranslate', docHash, lang, mode, unit })
  }

  cancelRetranslate = (): void => {
    this.confirmDiscard = null
    this.emit()
  }

  // ── editing ──

  /** double-click on a translated paragraph (an easy explanation's, in that mode) */
  openEditor = (
    docHash: string,
    lang: string,
    unit: BilingualUnit,
    mode: TranslationMode = 'translate',
  ): void => {
    if (unit.state !== 'translated' || !this.deps.store) return
    const open = this.editing
    if (open?.keyString === unit.keyString && open.docHash === docHash && open.mode === mode) return
    if (this.retranslating === unit.keyString) return
    this.draft = null
    this.editing = {
      docHash,
      lang,
      mode,
      key: unit.key,
      keyString: unit.keyString,
      initial: runsText(unit.runs),
      // what an edit loses: the marks of the translation, or of the source it came from
      dropsFormat: !unit.edited && (unit.sourceHasMarks || runsHaveMarks(unit.runs)),
      saving: false,
      error: null,
    }
    this.emit()
  }

  cancelEdit = (): void => {
    if (!this.editing || this.editing.saving) return
    this.editing = null
    this.draft = null
    this.emit()
  }

  /** the open editor's text as typed (no re-render) */
  setDraft = (text: string): void => {
    if (this.editing) this.draft = text
  }

  saveEdit = async (text: string): Promise<void> => {
    const e = this.editing
    const store = this.deps.store
    if (!e || e.saving || !store || text.trim() === '') return
    this.editing = { ...e, saving: true, error: null }
    this.emit()
    const out = await store
      .write({
        kind: 'editedTranslationBlock',
        docHash: e.docHash,
        lang: e.lang,
        key: e.key,
        text,
        ...modeField(e.mode),
      })
      .catch(() => null)
    const current = this.editing
    if (current?.keyString !== e.keyString) return
    if (!out?.ok) {
      // the editor may have followed a save to the new hash meanwhile
      this.editing = { ...current, saving: false, error: this.deps.t('blEditSaveFailed') }
      this.emit()
      return
    }
    this.editing = null
    this.draft = null
    this.emit()
    // a save during the write moved the document: the edit follows it, then shows
    await this.carry(e.docHash)
    this.refresh()
  }

  // ── the gate starts what it let through ──

  /** a press the gate let through, now or after it held it */
  run = (request: BilingualActionRequest): void => {
    if (this.disposed) return
    if (request.kind === 'page') void this.runPage(request)
    else void this.runRetranslate(request)
  }

  // ── internals ──

  private isBusy(docHash: string): boolean {
    const s = this.deps.session
    return (
      this.starting || s.running(docHash) !== null || s.list().some((v) => v.state === 'running')
    )
  }

  /** a paid route the tab has not agreed to for this provider: ask on the page; true = asked */
  private askPaid(request: Extract<BilingualActionRequest, { kind: 'page' }>): boolean {
    const route = this.host?.route() ?? CHECKING
    if (route.state !== 'ready' || !route.paid || this.paidAck === paidRouteKey(route)) return false
    this.paidAsk = {
      docHash: request.docHash,
      lang: request.lang,
      mode: request.mode,
      page: request.page,
      provider: aiProviderDisplayName(route.provider),
      routeKey: paidRouteKey(route),
    }
    this.emit()
    return true
  }

  private note(
    request: { docHash: string; lang: string; page: number; mode: TranslationMode },
    text: string,
  ): void {
    this.pageNotes.set(pageKey(request.docHash, request.lang, request.page, request.mode), text)
    this.emit()
  }

  private refresh(): void {
    this.data?.refresh()
  }

  private async runPage(request: Extract<BilingualActionRequest, { kind: 'page' }>): Promise<void> {
    const { t, session } = this.deps
    const store = this.deps.store
    const data = this.data
    const host = this.host
    if (!store || !host || !data?.tree) return
    // the view moved on (another language or mode, a rebuilt tree after a save)
    if (
      data.docHash !== request.docHash ||
      data.lang !== request.lang ||
      (data.mode ?? 'translate') !== request.mode
    ) {
      return
    }
    const route = host.route()
    if (route.state !== 'ready') {
      this.note(request, t('blNeedsConnection'))
      return
    }
    // the route turned paid since the press (or changed provider): ask first
    if (this.askPaid(request)) return
    if (this.isBusy(request.docHash)) {
      this.note(request, t('blBusy'))
      return
    }
    this.starting = true
    this.emit()
    try {
      // a job another process runs on the same file (the terminal, another window)
      const records = await store.unfinishedJobs(request.docHash).catch(() => null)
      const elsewhere = records?.ok
        ? session.runningElsewhere(request.docHash, records.jobs)
        : undefined
      if (elsewhere) {
        this.note(request, t('blBusy'))
        return
      }
      const tree = data.tree
      const ask = createModelCall({
        settings: () => route.settings,
        lang: () => this.deps.lang,
        // one id for this page translation's calls: a large page is confirmed once
        runId: crypto.randomUUID(),
        guard: async () => {
          const statuses = await attemptSubscription((s) => s.statuses())
          const current = await window.pdfApi?.getAiSettings().catch(() => null)
          return jobRouteRefusal(route, current ?? null, statuses)
        },
      })
      // a system prompt and one user turn of document data; no tools
      const send: TranslationSend = (req, signal) =>
        ask(
          { system: req.system, messages: [{ role: 'user', text: req.prompt }], tools: [] },
          signal,
        )
      const easy = request.mode === 'easy'
      // with the easy mode the parts carry it: the job reads and writes the easy results
      const parts = translationJobParts(tree, {
        lang: request.lang,
        send,
        pages: [request.page],
        ...(easy ? { mode: 'easy' as const } : {}),
      })
      const jobStore = createIpcJobStore(store)
      const outcome = session.start<TranslationJobItem<TextUnit>[]>({
        docHash: request.docHash,
        kind: 'translate-page',
        lang: request.lang,
        ...(easy ? { mode: 'easy' as const } : {}),
        provider: route.provider,
        launch: ({ signal, registry, onProgress }) =>
          startTranslationJob({
            docHash: request.docHash,
            lang: request.lang,
            kind: 'translate-page',
            ...parts,
            model: { provider: route.provider, model: route.model },
            store: jobStore,
            signal,
            registry,
            onProgress: (event) => {
              onProgress(event)
              // a batch was stored: the column shows it
              if (event.done > 0) this.refresh()
            },
          }),
        pageOf: (batch) => batch[0]?.block.page ?? null,
        onEnd: (view) => void this.pageEnded(request, view),
      })
      if (!outcome.ok) {
        this.note(request, t('blBusy'))
        return
      }
      this.pageJob = { ...request, viewId: outcome.view.id }
    } finally {
      this.starting = false
      this.emit()
    }
  }

  private async pageEnded(
    request: Extract<BilingualActionRequest, { kind: 'page' }>,
    view: DocumentJobView,
  ): Promise<void> {
    if (this.pageJob?.viewId === view.id) this.pageJob = null
    // the strip of the document translation or AI page reading is not this job's place
    this.deps.session.dismiss(view.docHash)
    if (view.state === 'stopped' || view.state === 'failed') {
      this.note(request, this.stopText(view))
    }
    this.emit()
    await this.carry(request.docHash)
    this.refresh()
  }

  /** the file was saved while the job ran: its results follow the saved file */
  private async carry(from: string): Promise<void> {
    const { store, filePath, password, session } = this.deps
    if (!store || !filePath) return
    const now = await store.docHash(filePath).catch(() => null)
    if (!now?.ok || now.docHash === from) return
    const out = await store
      .migrate({
        path: filePath,
        oldDocHash: from,
        ...(password !== undefined ? { password } : {}),
      })
      .catch(() => null)
    if (out?.ok) session.adopt(from, out.docHash)
  }

  private stopText(view: DocumentJobView): string {
    const { t, lang } = this.deps
    if (view.state === 'failed') return t('blPageFailed', { reason: view.error ?? '' })
    const summary = view.summary
    const reason = summary?.stopReason
    if (!summary || reason === 'cancelled' || reason === 'interrupted') return t('blPageStopped')
    if (reason === 'failures') return t('blPageStoppedFailures')
    if (reason === 'store-write-failed') return t('arStoppedStore')
    return (
      jobStopConnectionText(lang, t, summary, view.provider) ??
      t('blPageFailed', { reason: reason ?? '' })
    )
  }

  private submitRetranslate(request: Extract<BilingualActionRequest, { kind: 'retranslate' }>) {
    this.emit()
    if (this.host?.admit(request)) this.run(request)
  }

  private async runRetranslate(
    request: Extract<BilingualActionRequest, { kind: 'retranslate' }>,
  ): Promise<void> {
    const { t } = this.deps
    const store = this.deps.store
    const host = this.host
    const { unit } = request
    if (!store || !host) return
    if (this.isBusy(request.docHash) || this.retranslating) return
    const route = host.route()
    if (route.state !== 'ready') {
      this.paraNotes.set(unit.keyString, t('blNeedsConnection'))
      this.emit()
      return
    }
    this.retranslating = unit.keyString
    this.emit()
    const abort = new AbortController()
    this.aborts.add(abort)
    try {
      // a job another process runs on the same file (the terminal, another window)
      const records = await store.unfinishedJobs(request.docHash).catch(() => null)
      if (records?.ok && this.deps.session.runningElsewhere(request.docHash, records.jobs)) {
        this.paraNotes.set(unit.keyString, t('blBusy'))
        return
      }
      if (abort.signal.aborted) return
      const ask = createModelCall({
        settings: () => route.settings,
        lang: () => this.deps.lang,
        // this block's one call is its own run
        runId: crypto.randomUUID(),
      })
      const send: TranslationSend = (req, signal) =>
        ask(
          { system: req.system, messages: [{ role: 'user', text: req.prompt }], tools: [] },
          signal,
        )
      const out = await retranslateBlock({
        docHash: request.docHash,
        lang: request.lang,
        mode: request.mode,
        unit,
        send,
        store,
        // the whole document's language, as the page and document jobs use
        sourceLang: this.data?.tree ? translationSourceLanguage(this.data.tree) : undefined,
        model: { provider: route.provider, model: route.model },
        signal: abort.signal,
      })
      if (!out.ok) {
        this.paraNotes.set(
          unit.keyString,
          t('blRetranslateFailed', { reason: untranslatedReasonText(out.reason, t) }),
        )
      }
      // a save during the call moved the document: the result follows it, then shows
      await this.carry(request.docHash)
      this.refresh()
    } catch (err) {
      if (!abort.signal.aborted) {
        this.paraNotes.set(unit.keyString, this.callErrorText(err, route.provider))
      }
    } finally {
      this.aborts.delete(abort)
      this.retranslating = null
      if (!this.disposed) this.emit()
    }
  }

  private callErrorText(err: unknown, provider: AiProviderId): string {
    const { t, lang } = this.deps
    if (err instanceof ModelCallError && err.kind) {
      const text = jobStopConnectionText(
        lang,
        t,
        {
          stopReason: err.kind as AiRunErrorKind,
          ...(err.resetsAt !== undefined ? { resetsAt: err.resetsAt } : {}),
        },
        provider,
      )
      if (text) return text
    }
    return t('blRetranslateFailed', { reason: errorMessage(err) })
  }

  private build(): BilingualActionsSnapshot {
    const job = this.pageJob
    const view = job ? this.deps.session.view(job.docHash) : null
    return {
      route: this.route,
      busy: this.isBusy(this.data?.docHash ?? ''),
      pageJob: job
        ? {
            docHash: job.docHash,
            lang: job.lang,
            mode: job.mode,
            page: job.page,
            done: view?.id === job.viewId ? view.done : 0,
            total: view?.id === job.viewId ? view.total : 0,
          }
        : null,
      paidAsk: this.paidAsk,
      pageNotes: new Map(this.pageNotes),
      retranslating: this.retranslating,
      confirmDiscard: this.confirmDiscard,
      paraNotes: new Map(this.paraNotes),
      editing: this.editing,
    }
  }

  private emit(): void {
    if (this.disposed) return
    this.snap = this.build()
    for (const listener of [...this.listeners]) listener()
  }
}
