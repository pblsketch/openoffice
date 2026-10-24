/**
 * The "Document overview" section at the top of the AI window
 * (reading-assist spec 4.8): collapsible; at first only "Create overview".
 *
 * Pressing it builds the document tree (no AI) and then:
 * - a document whose structured text fits one call sends that one call
 *   through the shared send gate (`useAiSendGate`), with no tool, on the
 *   provider `documentJobRoute` picks; in front of "not connected" the
 *   connect prompt shows and nothing is sent;
 * - a longer document opens the standard start confirmation (model calls,
 *   the AI it sends to, the paid-route notice); only Start, past the same
 *   gate, starts the `summary` job on the confirmed provider. Stop ends it;
 *   it is never resumed, and a new press starts over.
 *
 * The overview is shown from the store when the document opens; only
 * "Regenerate" sends again. The answer is model output: shown as plain text
 * nodes, never markup. A term opens the viewer search for it.
 *
 * Extension slot: `sectionActions` adds buttons to each section next to Copy
 * (the notes task adds "Add to note").
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { AiSettings } from '@genoffice/ai-provider/browser'
import type { Lang } from '@genoffice/i18n'
import {
  AiBlockedNotice,
  AiConnectPrompt,
  AiFirstConnectionNotice,
  aiHeldRequestStep,
  aiHoldReason,
  AiModelPicker,
  aiProviderDisplayName,
  useAiSendGate,
  type AiHeldReason,
  type AiModelPickerBridge,
} from '@genoffice/ui'
import type { InsightsEntry } from '../../../../../../packages/pdf-structure/src/store/reading'
import type { TFunc } from '../../i18n/locale'
import type { AiBlockedRun } from '../ai-connection'
import { modelCallFailure } from '../model-call-failure'
import { attemptSubscription, useSubscriptionConnection } from '../useSubscriptionConnection'
import { createModelCall } from '../../doc-jobs/model-call'
import { documentJobRoute, jobRouteRefusal, routeLabel, sameRoute } from '../../doc-jobs/route'
import type { DocumentJobSession, DocumentJobView } from '../../doc-jobs/job-session'
import { JobProgressStrip } from '../../doc-jobs/JobProgressStrip'
import { jobStopConnectionText } from '../../doc-jobs/job-text'
import {
  InsightsAnswerError,
  type DocumentInsights,
  type InsightsAsk,
  type PreparedInsights,
} from './insights-controller'

const SETTINGS_BRIDGE: AiModelPickerBridge = {
  getSettings: () => window.pdfApi.getAiSettings(),
  setSettings: (settings) => window.pdfApi.setAiSettings(settings),
  onSettingsChanged: (handler) => window.pdfApi.onAiSettingsChanged(handler),
  openModelSettings: () => window.pdfApi.openAiModelSettings().catch(() => {}),
}

const OPEN_KEY = 'pdf-ai-overview-open'

/** one section of the overview as text (what Copy copies and the slot receives) */
export interface InsightsSectionText {
  kind: 'summary3' | 'summary' | 'terms'
  /** the section's heading in the UI language */
  heading: string
  text: string
  entry: InsightsEntry
}

export interface InsightsCardProps {
  insights: DocumentInsights
  session: DocumentJobSession
  lang: Lang
  t: TFunc
  /** open the viewer search with this text */
  onSearchTerm: (term: string) => void
  /** go to an original 1-based page */
  onGotoPage?: (page: number) => void
  onNotice: (message: string) => void
  /**
   * Extension slot: more actions for a section, shown after its Copy button
   * (the notes task adds "Add to note").
   */
  sectionActions?: (section: InsightsSectionText) => ReactNode
}

/** a one-call run waiting for, or past, the send gate */
interface SingleRun {
  prepared: PreparedInsights
  abort?: AbortController
  /** dropped (the section was reset): it never starts, and a late answer is ignored */
  cancelled?: boolean
}

type GateRequest = { kind: 'single'; run: SingleRun } | { kind: 'job'; press: number }

type Phase =
  | { kind: 'idle' }
  | { kind: 'preparing' }
  | { kind: 'waiting' }
  | { kind: 'connect' }
  | { kind: 'working' }
  | { kind: 'confirm'; prepared: PreparedInsights; message?: string }
  | { kind: 'job' }
  | { kind: 'failed'; message: string; blocked?: AiBlockedRun }

function loadOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== '0'
  } catch {
    return true
  }
}

/** the overview's sections as text */
export function insightsSections(entry: InsightsEntry, t: TFunc): InsightsSectionText[] {
  return [
    {
      kind: 'summary3',
      heading: t('airOverviewSummary3'),
      text: entry.summary3.map((line) => `- ${line}`).join('\n'),
      entry,
    },
    { kind: 'summary', heading: t('airOverviewSummary'), text: entry.summary, entry },
    {
      kind: 'terms',
      heading: t('airOverviewTerms'),
      text: entry.terms
        .map((term) => `- ${term.term} (p.${term.page}): ${term.meaning}`)
        .join('\n'),
      entry,
    },
  ]
}

export function InsightsCard(props: InsightsCardProps): ReactElement {
  const { insights, session, lang, t } = props
  const snap = useSyncExternalStore(insights.subscribe, insights.snapshot)
  const views = useSyncExternalStore(
    useCallback((listener: () => void) => session.subscribe(listener), [session]),
    () => session.list(),
  )
  const connection = useSubscriptionConnection()
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [open, setOpen] = useState(loadOpen)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const propsRef = useRef(props)
  propsRef.current = props
  const latest = useRef({ settings, statuses: connection.statuses })
  latest.current = { settings, statuses: connection.statuses }
  const heldRef = useRef<{ run: SingleRun; reason: AiHeldReason } | null>(null)
  const pressRef = useRef(0)
  const prepareAbort = useRef<AbortController | null>(null)
  /** the route the person confirmed for the summary job */
  const confirmedRef = useRef<ReturnType<typeof documentJobRoute> | null>(null)
  /** the provider and model as the confirmation showed them (for the progress strip) */
  const confirmedLabelRef = useRef<string | null>(null)
  const singleRef = useRef<SingleRun | null>(null)

  useEffect(() => {
    let alive = true
    const refresh = () => {
      void window.pdfApi
        ?.getAiSettings()
        .then((next) => {
          if (alive) setSettings(next)
        })
        .catch(() => {})
    }
    refresh()
    const off = window.pdfApi?.onAiSettingsChanged(refresh)
    return () => {
      alive = false
      off?.()
      // the panel goes away: a call or tree in flight stops (its answer is not kept)
      prepareAbort.current?.abort()
      const single = singleRef.current
      if (single) {
        single.cancelled = true
        single.abort?.abort()
      }
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, open ? '1' : '0')
    } catch {
      /* the preference is not essential */
    }
  }, [open])

  const failWith = (err: unknown) => {
    const p = propsRef.current
    if (err instanceof InsightsAnswerError) {
      setPhase({ kind: 'failed', message: p.t('airOverviewMalformed') })
      return
    }
    const { message, blocked } = modelCallFailure(err, connection.recheck)
    setPhase({
      kind: 'failed',
      message: p.t('airOverviewFailed', { reason: message }),
      ...(blocked ? { blocked } : {}),
    })
  }

  /** one tool-less call on the provider the shared rules pick now */
  const ask: InsightsAsk = async (request, signal) => {
    const current = await window.pdfApi.getAiSettings()
    const route = documentJobRoute(current, latest.current.statuses)
    if (route.state !== 'ready') throw new Error(propsRef.current.t('airOverviewNeedsConnection'))
    const call = createModelCall({
      settings: () => route.settings,
      lang: () => propsRef.current.lang,
    })
    const text = await call(request, signal)
    return { text, provider: route.provider, model: route.model }
  }

  const startSingle = (run: SingleRun) => {
    if (heldRef.current?.run === run) heldRef.current = null
    if (run.cancelled) return
    const abort = new AbortController()
    run.abort = abort
    setPhase({ kind: 'working' })
    void propsRef.current.insights
      .runSingle(run.prepared, ask, abort.signal)
      .then(() => {
        if (!run.cancelled) setPhase({ kind: 'idle' })
      })
      .catch((err: unknown) => {
        if (abort.signal.aborted || run.cancelled) return
        failWith(err)
      })
      .finally(() => {
        if (singleRef.current === run) singleRef.current = null
      })
  }

  /** Start on the confirmation, past the gate: the job runs on the route the person saw */
  const runJob = async () => {
    const p = propsRef.current
    const current = phaseRef.current
    const confirmed = confirmedRef.current
    confirmedRef.current = null
    if (current.kind !== 'confirm' || !confirmed || confirmed.state !== 'ready') return
    const { prepared } = current
    const now = documentJobRoute(latest.current.settings, latest.current.statuses)
    if (!sameRoute(confirmed, now)) {
      setPhase({ ...current, message: p.t('airOverviewRouteChanged') })
      return
    }
    const aiLabel = confirmedLabelRef.current ?? undefined
    const busy = await busyJob(prepared.docHash)
    if (busy) {
      setPhase({ ...current, message: p.t('airOverviewBusy', busy) })
      return
    }
    const call = createModelCall({
      settings: () => confirmed.settings,
      lang: () => propsRef.current.lang,
      guard: async () => {
        const statuses = await attemptSubscription((s) => s.statuses())
        const settingsNow = await window.pdfApi?.getAiSettings().catch(() => null)
        return jobRouteRefusal(confirmed, settingsNow ?? null, statuses)
      },
    })
    const outcome = p.session.start(
      p.insights.summaryJob({
        prepared,
        provider: confirmed.provider,
        model: confirmed.model,
        ...(aiLabel ? { aiLabel } : {}),
        call,
        onEnd: (view) => {
          const q = propsRef.current
          q.session.dismiss(view.docHash)
          const fail = jobFailure(view, q.lang, q.t)
          setPhase(fail ? { kind: 'failed', message: fail } : { kind: 'idle' })
        },
      }),
    )
    if (!outcome.ok) {
      setPhase({ ...current, message: p.t('airOverviewBusy', { ...outcome.running.progress }) })
      return
    }
    confirmedLabelRef.current = null
    setPhase({ kind: 'job' })
  }
  const runJobRef = useRef(runJob)
  runJobRef.current = runJob
  const startSingleRef = useRef(startSingle)
  startSingleRef.current = startSingle

  const sendGate = useAiSendGate<GateRequest>({
    settings,
    statuses: connection.statuses,
    store: SETTINGS_BRIDGE,
    start: (request) => {
      if (request.kind === 'single') startSingleRef.current(request.run)
      else void runJobRef.current()
    },
    onSettingsSaved: (next) => setSettings(next),
  })

  /** follow the gate for a held one-call run, the way PassageReading does */
  useEffect(() => {
    const held = heldRef.current
    if (!held) return
    const step = aiHeldRequestStep(held.reason, sendGate.gate)
    if (step.action === 'keep') {
      held.reason = step.reason
      return
    }
    if (step.action === 'start') return
    heldRef.current = null
    if (sendGate.gate.kind === 'connect') {
      setPhase({ kind: 'connect' })
      return
    }
    held.run.cancelled = true
    setPhase({ kind: 'idle' })
    // only a move of the gate matters; the held run is read from a ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendGate.gate.kind])

  /** a document job running on this document: in this tab, this renderer or another process */
  async function busyJob(docHash: string): Promise<{ done: number; total: number } | null> {
    const p = propsRef.current
    const here =
      p.session.running(docHash)?.progress ??
      (() => {
        const v = p.session.list().find((job) => job.state === 'running')
        return v ? { done: v.done, total: v.total } : undefined
      })()
    if (here) return here
    const records = await window.pdfApi?.store?.unfinishedJobs(docHash).catch(() => null)
    const elsewhere = records?.ok ? p.session.runningElsewhere(docHash, records.jobs) : undefined
    return elsewhere ? (elsewhere.progress ?? { done: 0, total: 0 }) : null
  }

  const dropHeld = () => {
    const held = heldRef.current
    if (!held) return
    heldRef.current = null
    held.run.cancelled = true
    sendGate.reset()
  }

  /** "Create overview" / "Regenerate": build the tree, then one call or the confirmation */
  const create = async () => {
    const p = propsRef.current
    if (!p.insights.available) {
      p.onNotice(p.t('airOverviewUnavailable'))
      return
    }
    const k = phaseRef.current.kind
    if (k === 'preparing' || k === 'waiting' || k === 'working' || k === 'job') return
    dropHeld()
    setOpen(true)
    setPhase({ kind: 'preparing' })
    prepareAbort.current?.abort()
    const abort = new AbortController()
    prepareAbort.current = abort
    const out = await p.insights.prepare(abort.signal)
    if (abort.signal.aborted) return
    prepareAbort.current = null
    if (!out.ok) {
      setPhase({
        kind: 'failed',
        message: p.t(
          out.reason === 'unavailable'
            ? 'airOverviewUnavailable'
            : out.reason === 'no-text'
              ? 'airOverviewNoText'
              : 'airOverviewAnalyzeFailed',
        ),
      })
      return
    }
    const { prepared } = out
    const busy = await busyJob(prepared.docHash)
    if (busy) {
      setPhase({ kind: 'failed', message: p.t('airOverviewBusy', busy) })
      return
    }
    if (prepared.plan.mode === 'job') {
      setPhase({ kind: 'confirm', prepared })
      return
    }
    const run: SingleRun = { prepared }
    singleRef.current = run
    setPhase({ kind: 'waiting' })
    if (sendGate.admit({ kind: 'single', run })) {
      startSingle(run)
      return
    }
    const reason = aiHoldReason(sendGate.peek())
    if (reason) heldRef.current = { run, reason }
    else setPhase({ kind: 'connect' })
  }

  const route = documentJobRoute(settings, connection.statuses)
  const confirmStart = () => {
    const current = phaseRef.current
    if (current.kind !== 'confirm' || route.state !== 'ready' || sendGate.noticeDue) return
    setPhase({ kind: 'confirm', prepared: current.prepared })
    confirmedRef.current = route
    confirmedLabelRef.current = routeLabel(route, connection.statuses)
    if (sendGate.admit({ kind: 'job', press: ++pressRef.current })) void runJob()
  }

  const cancel = () => {
    dropHeld()
    // a Start the gate still holds (status check, notice) must not run later
    if (confirmedRef.current) sendGate.reset()
    confirmedRef.current = null
    confirmedLabelRef.current = null
    setPhase({ kind: 'idle' })
  }

  const copy = (text: string) => {
    const p = propsRef.current
    void navigator.clipboard
      ?.writeText(text)
      .then(() => p.onNotice(p.t('airCopied')))
      .catch(() => {})
  }

  const jobView =
    views.find((v) => v.kind === 'summary' && v.state === 'running') ??
    (phase.kind === 'job' ? views.find((v) => v.kind === 'summary') : undefined)

  const entry = snap.entry
  const busyNow =
    phase.kind === 'preparing' ||
    phase.kind === 'waiting' ||
    phase.kind === 'working' ||
    phase.kind === 'job' ||
    !!jobView
  const showMake = !busyNow && phase.kind !== 'confirm'

  const connectChoice =
    phase.kind === 'connect'
      ? sendGate.connectChoice
      : phase.kind === 'confirm'
        ? (sendGate.connectChoice ?? (route.state === 'not-connected' ? route.choice : null))
        : null

  let body: ReactNode = null
  if (phase.kind === 'preparing') {
    body = (
      <p className="ai-overview-status" role="status" data-phase="preparing">
        {t('airOverviewPreparing')}
      </p>
    )
  } else if (phase.kind === 'waiting' || phase.kind === 'working') {
    body = (
      <p className="ai-overview-status" role="status" data-phase={phase.kind}>
        {phase.kind === 'working' ? t('airOverviewWorking') : t('airOverviewWaiting')}
      </p>
    )
  } else if (phase.kind === 'confirm') {
    const calls = phase.prepared.plan.mode === 'job' ? phase.prepared.plan.calls : 1
    body = (
      <div className="ai-overview-confirm" data-confirm>
        <p className="ai-overview-confirm-title">{t('airOverviewConfirmTitle')}</p>
        <ul className="ai-overview-confirm-list">
          <li data-calls={calls}>{t('airOverviewConfirmCalls', { calls })}</li>
          {route.state === 'checking' && (
            <li data-route="checking">{t('airOverviewConfirmChecking')}</li>
          )}
          {route.state === 'ready' && (
            <>
              <li data-route="ready" data-provider={route.provider}>
                {t('airOverviewConfirmProvider', { provider: routeLabel(route) })}
              </li>
              <li className="pdf-ai-read-ai" data-model-picker>
                <AiModelPicker
                  bridge={SETTINGS_BRIDGE}
                  lang={lang}
                  subscriptionStatuses={connection.statuses}
                  showLabel
                />
              </li>
              <li>{t('airOverviewConfirmSends')}</li>
              {route.paid && (
                <li className="ai-overview-paid" data-paid>
                  {t('airOverviewConfirmPaid', {
                    provider: aiProviderDisplayName(route.provider),
                  })}
                </li>
              )}
            </>
          )}
        </ul>
        {phase.message && (
          <p className="ai-overview-error" role="alert">
            {phase.message}
          </p>
        )}
        <div className="ai-overview-actions">
          <button type="button" className="pdf-modal-btn" onClick={cancel}>
            {t('airCancel')}
          </button>
          <button
            type="button"
            className="pdf-modal-btn primary"
            data-action="start"
            disabled={route.state !== 'ready' || sendGate.noticeDue}
            onClick={confirmStart}
          >
            {t('airOverviewStart')}
          </button>
        </div>
      </div>
    )
  } else if (phase.kind === 'failed') {
    body = phase.blocked ? (
      <AiBlockedNotice
        kind={phase.blocked.kind}
        provider={phase.blocked.provider}
        resetsAt={phase.blocked.resetsAt}
        message={phase.message}
        settings={settings ?? {}}
        // no switch to another connection from here: the overview is pressed again
        statuses={{}}
        lang={lang}
        onContinueWith={() => {}}
      />
    ) : (
      <p className="ai-overview-error" role="alert">
        {phase.message}
      </p>
    )
  }

  return (
    <section
      className="ai-overview"
      aria-label={t('airOverview')}
      data-state={entry ? (snap.stale ? 'stale' : 'ready') : 'empty'}
    >
      <div className="ai-overview-head">
        <button
          type="button"
          className="ai-overview-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`ai-tool-chip-caret${open ? ' open' : ''}`} aria-hidden>
            ›
          </span>
          <span className="ai-overview-title">{t('airOverview')}</span>
        </button>
        {showMake && (!entry || !open) && (
          <button
            type="button"
            className="ai-overview-make"
            data-action={entry ? 'regenerate' : 'create'}
            data-tip={t('airOverviewMakeTip')}
            onClick={() => void create()}
          >
            {entry ? t('airOverviewRemake') : t('airOverviewMake')}
          </button>
        )}
      </div>
      {open && (
        <div className="ai-overview-body">
          {jobView && (
            <JobProgressStrip
              view={jobView}
              t={t}
              title={t('airOverviewRunning', { done: jobView.done, total: jobView.total })}
              details={
                jobView.aiLabel ? [t('arConfirmProvider', { provider: jobView.aiLabel })] : []
              }
              onStop={() => session.stop(jobView.docHash)}
              onClose={() => session.dismiss(jobView.docHash)}
            />
          )}
          {body}
          {connectChoice && (
            <AiConnectPrompt
              choice={connectChoice}
              statuses={connection.statuses}
              lang={lang}
              disabled={connection.busy}
              attention={sendGate.connectAttention}
              onOpenSettings={() => void window.pdfApi.openAiModelSettings().catch(() => {})}
              onInstall={connection.install}
              onUpdate={connection.update}
              onCancelLogin={connection.cancelLogin}
              onLogin={connection.login}
              onRecheck={connection.recheck}
              onAcceptMetered={connection.acceptMetered}
              onOpenInstallHelp={connection.openInstallHelp}
              onOpenConnectHelp={connection.openConnectHelp}
            />
          )}
          {sendGate.noticeDue && (phase.kind === 'waiting' || phase.kind === 'confirm') && (
            <AiFirstConnectionNotice
              lang={lang}
              codexKeepsHistory
              sendsWholeDocument
              onAcknowledge={() => {
                if (heldRef.current?.reason === 'notice') heldRef.current = null
                sendGate.acknowledgeNotice()
              }}
            />
          )}
          {entry && snap.stale && (
            <div className="ai-overview-stale" role="status" data-stale>
              <span>{t('airOverviewChanged')}</span>
              {showMake && (
                <button
                  type="button"
                  className="ai-overview-link"
                  data-action="regenerate-stale"
                  onClick={() => void create()}
                >
                  {t('airOverviewRemake')}
                </button>
              )}
            </div>
          )}
          {entry && (
            <InsightsSections
              entry={entry}
              t={t}
              onCopy={copy}
              onSearchTerm={props.onSearchTerm}
              onGotoPage={props.onGotoPage}
              sectionActions={props.sectionActions}
            />
          )}
          {entry && showMake && !snap.stale && (
            <div className="ai-overview-foot">
              <button
                type="button"
                className="ai-overview-link"
                data-action="regenerate"
                data-tip={t('airOverviewMakeTip')}
                onClick={() => void create()}
              >
                {t('airOverviewRemake')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function InsightsSections({
  entry,
  t,
  onCopy,
  onSearchTerm,
  onGotoPage,
  sectionActions,
}: {
  entry: InsightsEntry
  t: TFunc
  onCopy: (text: string) => void
  onSearchTerm: (term: string) => void
  onGotoPage?: (page: number) => void
  sectionActions?: (section: InsightsSectionText) => ReactNode
}): ReactElement {
  const sections = insightsSections(entry, t)
  const tools = (section: InsightsSectionText) => (
    <span className="ai-overview-section-tools">
      <button
        type="button"
        className="ai-overview-link"
        data-action="copy"
        onClick={() => onCopy(section.text)}
      >
        {t('airCopy')}
      </button>
      {sectionActions?.(section)}
    </span>
  )
  const [s3, summary, terms] = sections as [
    InsightsSectionText,
    InsightsSectionText,
    InsightsSectionText,
  ]
  return (
    <div className="ai-overview-sections">
      <div className="ai-overview-section" data-section="summary3">
        <div className="ai-overview-section-head">
          <span>{s3.heading}</span>
          {tools(s3)}
        </div>
        <ul className="ai-overview-lines" dir="auto">
          {entry.summary3.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
      <div className="ai-overview-section" data-section="summary">
        <div className="ai-overview-section-head">
          <span>{summary.heading}</span>
          {tools(summary)}
        </div>
        <div className="ai-overview-summary" dir="auto">
          {entry.summary.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </div>
      {entry.terms.length > 0 && (
        <div className="ai-overview-section" data-section="terms">
          <div className="ai-overview-section-head">
            <span>{terms.heading}</span>
            {tools(terms)}
          </div>
          <ul className="ai-overview-terms" dir="auto">
            {entry.terms.map((term, i) => (
              <li key={i} className="ai-overview-term">
                <button
                  type="button"
                  className="ai-overview-term-name"
                  data-action="search-term"
                  data-tip={t('airOverviewTermTip', { term: term.term })}
                  onClick={() => onSearchTerm(term.term)}
                >
                  {term.term}
                </button>
                {onGotoPage ? (
                  <button
                    type="button"
                    className="ai-overview-term-page"
                    data-action="goto-page"
                    data-tip={t('airOverviewPageTip', { page: term.page })}
                    onClick={() => onGotoPage(term.page)}
                  >
                    {t('airOverviewPage', { page: term.page })}
                  </button>
                ) : (
                  <span className="ai-overview-term-page">
                    {t('airOverviewPage', { page: term.page })}
                  </span>
                )}
                <span className="ai-overview-term-meaning">{term.meaning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** why a summary job left no overview, or null when it stored one */
export function jobFailure(view: DocumentJobView, lang: Lang, t: TFunc): string | null {
  if (view.state === 'failed') return t('airOverviewFailed', { reason: view.error ?? '' })
  const summary = view.summary
  if (!summary) return t('airOverviewFailed', { reason: '' })
  if (view.state === 'stopped') {
    const reason = summary.stopReason
    if (reason === 'cancelled' || reason === 'interrupted') return t('airOverviewStopped')
    return (
      jobStopConnectionText(lang, t, summary, view.provider) ??
      t('airOverviewFailed', { reason: reason ?? '' })
    )
  }
  const merged = summary.doneUnits.some((u) => (u as { kind?: string }).kind === 'merge')
  if (merged) return null
  const malformed = summary.failedUnits.some((f) => f.reason === 'malformed-answer')
  return malformed
    ? t('airOverviewMalformed')
    : t('airOverviewFailed', {
        reason: summary.failedUnits.map((f) => f.reason).join(', '),
      })
}
