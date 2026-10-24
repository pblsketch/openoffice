/**
 * The AI page-reading window (spec §7): the page picker, then the pre-start
 * confirmation.
 *
 * - Picker: the document is analyzed (a structure job, no AI); scanned,
 *   degraded and footnote-link-failed pages come preselected with their
 *   reason, pages already read are marked and skipped, and the user adds or
 *   removes pages. There is no page cap.
 * - Confirmation: the calls the job will make, the pages skipped, the AI it
 *   sends to and, on a paid route, "〈provider〉 will charge for this". It
 *   refuses to start, saying why, when the AI is not connected (the shared
 *   connect prompt) or cannot read images (`aiReadVisionCheck`). The
 *   connection is looked at only from this step on.
 *
 * Nothing is sent from here: Start hands the confirmed pages and route to the
 * caller, after the shared send gate (`useAiSendGate`) let it through (held
 * during a status check, behind the first-connection notice).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { AiSettings } from '@genoffice/ai-provider/browser'
import type { Lang } from '@genoffice/i18n'
import {
  AiConnectPrompt,
  AiFirstConnectionNotice,
  AiModelPicker,
  aiProviderDisplayName,
  useAiSendGate,
  type AiModelPickerBridge,
} from '@genoffice/ui'
import {
  aiReadPreselectPages,
  aiReadVisionCheck,
  type AiReadPreselectReason,
} from '../../../../../packages/pdf-structure/src/ai-read'
import {
  estimateAiReadJob,
  type AiReadPageRef,
  type DocumentJobEstimate,
} from '../../../../../packages/pdf-structure/src/jobs'
import type { PdfStoreApi, PdfStructureApi, PdfStructureProgress } from '../../shared/ipc'
import type { TFunc } from '../i18n/locale'
import { useModalDialog } from '../modal-dialog'
import { parsePageRange } from '../convert/page-range'
import { useSubscriptionConnection } from '../ai/useSubscriptionConnection'
import { createIpcJobStore } from '../doc-jobs/ipc-store'
import { documentJobRoute, routeLabel, sameRoute, type DocumentJobRoute } from '../doc-jobs/route'

export type ReadyRoute = Extract<DocumentJobRoute, { state: 'ready' }>

export interface AiReadDialogApi {
  tree: PdfStructureApi['tree']
  cancel: PdfStructureApi['cancel']
  onProgress: PdfStructureApi['onProgress']
  store: Pick<PdfStoreApi, 'aiReadPages' | 'translation' | 'write'>
}

export interface AiReadStartRequest {
  docHash: string
  /** the confirmed pages with their fingerprints, page order */
  pages: AiReadPageRef[]
  route: ReadyRoute
  /** the provider and model as the confirmation showed them (for the progress strip) */
  aiLabel?: string
}

/** what the caller answers to Start */
export type AiReadStartAnswer =
  { ok: true } | { ok: false; busy: { done: number; total: number } } | { ok: false; error: string }

export interface AiReadDialogProps {
  filePath: string
  password: string | undefined
  pageCount: number
  lang: Lang
  t: TFunc
  api: AiReadDialogApi
  /** pages asked for (the AI window, a resumed job); null = the preselection */
  initialPages: number[] | null
  /** go straight to the confirmation (a resumed job with its pages known) */
  startAtConfirm?: boolean
  onStart: (request: AiReadStartRequest) => Promise<AiReadStartAnswer>
  onClose: () => void
}

const SETTINGS_BRIDGE: AiModelPickerBridge = {
  getSettings: () => window.pdfApi.getAiSettings(),
  setSettings: (settings) => window.pdfApi.setAiSettings(settings),
  onSettingsChanged: (handler) => window.pdfApi.onAiSettingsChanged(handler),
  openModelSettings: () => window.pdfApi.openAiModelSettings().catch(() => {}),
}

let jobSeq = 0
const newJobId = (): string => `ai-read-tree-${Date.now().toString(36)}-${(++jobSeq).toString(36)}`

interface Analysis {
  docHash: string
  /** page → fingerprint */
  fingerprints: Map<number, string>
  preselect: Map<number, AiReadPreselectReason[]>
  /** fingerprints already in the store */
  read: Set<string>
}

type Load =
  | { kind: 'loading'; done: number; total: number }
  | { kind: 'failed' }
  | { kind: 'ready'; analysis: Analysis }

const REASON_KEY = {
  scanned: 'arReasonScanned',
  degraded: 'arReasonDegraded',
  'footnote-link-failed': 'arReasonFootnote',
} as const

export function AiReadDialog(props: AiReadDialogProps): ReactElement {
  const { filePath, password, pageCount, lang, t, api } = props
  const [load, setLoad] = useState<Load>({ kind: 'loading', done: 0, total: 0 })
  const [step, setStep] = useState<'pick' | 'confirm'>('pick')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [addText, setAddText] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const dismiss = useCallback(() => propsRef.current.onClose(), [])
  const dialogRef = useModalDialog(dismiss)

  // analyze the document once (a structure job in its own process; no AI)
  useEffect(() => {
    let alive = true
    const jobId = newJobId()
    const off = api.onProgress((p: PdfStructureProgress) => {
      if (alive && p.jobId === jobId) setLoad({ kind: 'loading', done: p.done, total: p.total })
    })
    void (async () => {
      try {
        const out = await api.tree({
          jobId,
          path: filePath,
          ...(password !== undefined ? { password } : {}),
        })
        if (!alive) return
        if (!out.ok) {
          setLoad({ kind: 'failed' })
          return
        }
        const stored = await api.store.aiReadPages(out.docHash)
        if (!alive) return
        const read = new Set(stored.ok ? stored.pages.map((p) => p.pageFingerprint) : [])
        const preselect = new Map(aiReadPreselectPages(out.tree).map((p) => [p.page, p.reasons]))
        const fingerprints = new Map(out.fingerprints.map((f) => [f.page, f.fingerprint]))
        const asked = propsRef.current.initialPages?.filter((p) => fingerprints.has(p)) ?? null
        setSelected(new Set(asked ?? preselect.keys()))
        setAdded(new Set((asked ?? []).filter((p) => !preselect.has(p))))
        setLoad({
          kind: 'ready',
          analysis: { docHash: out.docHash, fingerprints, preselect, read },
        })
        if (propsRef.current.startAtConfirm && asked && asked.length > 0) setStep('confirm')
      } catch {
        if (alive) setLoad({ kind: 'failed' })
      }
    })()
    return () => {
      alive = false
      off()
      void api.cancel(jobId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opened dialog
  }, [])

  const analysis = load.kind === 'ready' ? load.analysis : null
  const rows = useMemo(() => {
    if (!analysis) return []
    const pages = new Set<number>([...analysis.preselect.keys(), ...added])
    return [...pages]
      .sort((a, b) => a - b)
      .map((page) => ({
        page,
        reasons: analysis.preselect.get(page) ?? [],
        added: added.has(page),
        read: analysis.read.has(analysis.fingerprints.get(page) ?? ''),
      }))
  }, [analysis, added])

  const chosen = rows.filter((r) => selected.has(r.page) || r.read).map((r) => r.page)
  const refs: AiReadPageRef[] = analysis
    ? chosen.map((page) => ({ page, pageFingerprint: analysis.fingerprints.get(page)! }))
    : []

  const addPages = () => {
    const parsed = parsePageRange(addText, pageCount)
    if (!parsed.ok) {
      setAddError(
        parsed.reason === 'outOfRange'
          ? t('cvPagesOutOfRange', { first: 1, last: pageCount })
          : t('cvPagesSyntax'),
      )
      return
    }
    setAddError(null)
    setAddText('')
    setAdded((prev) => new Set([...prev, ...parsed.pages]))
    setSelected((prev) => new Set([...prev, ...parsed.pages]))
  }

  const toggle = (page: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(page)) next.delete(page)
      else next.add(page)
      return next
    })

  return (
    <div className="pdf-modal-mask">
      <div
        ref={dialogRef}
        className="pdf-modal pdf-modal-wide pdf-ai-read-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('arTitle')}
        data-step={step}
      >
        <div className="pdf-modal-title">
          {step === 'pick' ? t('arTitle') : t('arConfirmTitle')}
        </div>
        {step === 'pick' ? (
          <>
            <p className="pdf-modal-hint">{t('arIntro')}</p>
            {load.kind === 'loading' && (
              <p className="pdf-ai-read-status" role="status" data-loading>
                {load.total > 0 ? t('arAnalyzingProgress', load) : t('arAnalyzing')}
              </p>
            )}
            {load.kind === 'failed' && (
              <p className="pdf-convert-error" role="alert" data-error="analyze">
                {t('arAnalyzeFailed')}
              </p>
            )}
            {analysis && (
              <>
                <p className="pdf-ai-read-status">
                  {analysis.preselect.size > 0 ? t('arPreselectNote') : t('arNoPreselect')}
                </p>
                {rows.length > 0 && (
                  <ul className="pdf-ai-read-pages" data-pages>
                    {rows.map((row) => (
                      <li key={row.page} data-page={row.page} data-read={row.read || undefined}>
                        <label className="pdf-modal-check">
                          <input
                            type="checkbox"
                            checked={row.read || selected.has(row.page)}
                            disabled={row.read}
                            onChange={() => toggle(row.page)}
                          />
                          <span className="pdf-ai-read-page">
                            {t('arPageLabel', { page: row.page })}
                          </span>
                          <span className="pdf-ai-read-reason">
                            {[
                              ...row.reasons.map((r) => t(REASON_KEY[r])),
                              ...(row.added && row.reasons.length === 0
                                ? [t('arReasonAdded')]
                                : []),
                              ...(row.read ? [t('arAlreadyRead')] : []),
                            ].join(' · ')}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="pdf-field pdf-ai-read-add">
                  <span>{t('arAddLabel')}</span>
                  <input
                    className={`pdf-modal-input${addError ? ' invalid' : ''}`}
                    value={addText}
                    placeholder={t('arAddPlaceholder')}
                    aria-label={t('arAddLabel')}
                    onChange={(e) => setAddText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addPages()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="pdf-modal-btn"
                    data-action="add-pages"
                    onClick={addPages}
                  >
                    {t('arAdd')}
                  </button>
                </div>
                {addError && (
                  <p className="pdf-convert-error" role="alert" data-error="add">
                    {addError}
                  </p>
                )}
                <p className="pdf-ai-read-status" data-selected-count={chosen.length}>
                  {t('arSelectedCount', { count: chosen.length })}
                </p>
              </>
            )}
            <div className="pdf-modal-actions">
              <button type="button" className="pdf-modal-btn" onClick={props.onClose}>
                {t('arCancel')}
              </button>
              <button
                type="button"
                className="pdf-modal-btn primary"
                data-action="next"
                disabled={!analysis || chosen.length === 0}
                onClick={() => setStep('confirm')}
              >
                {t('arNext')}
              </button>
            </div>
          </>
        ) : (
          analysis && (
            <AiReadConfirm
              lang={lang}
              t={t}
              docHash={analysis.docHash}
              pages={refs}
              api={api}
              onBack={() => setStep('pick')}
              onCancel={props.onClose}
              onStart={props.onStart}
            />
          )
        )}
      </div>
    </div>
  )
}

/** the pre-start confirmation; mounted only once the user reached it */
function AiReadConfirm({
  lang,
  t,
  docHash,
  pages,
  api,
  onBack,
  onCancel,
  onStart,
}: {
  lang: Lang
  t: TFunc
  docHash: string
  pages: AiReadPageRef[]
  api: AiReadDialogApi
  onBack: () => void
  onCancel: () => void
  onStart: (request: AiReadStartRequest) => Promise<AiReadStartAnswer>
}): ReactElement {
  const connection = useSubscriptionConnection()
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [estimate, setEstimate] = useState<DocumentJobEstimate | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const route = documentJobRoute(settings, connection.statuses)
  /** what the user saw when pressing Start; a held start runs only if it still holds */
  const confirmedRef = useRef<{ route: ReadyRoute; aiLabel: string } | null>(null)
  const latest = useRef({ settings, statuses: connection.statuses })
  latest.current = { settings, statuses: connection.statuses }

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
    // the store tells which pages are already read; the model does not change the count
    estimateAiReadJob({
      docHash,
      pages,
      model: { provider: '', model: '' },
      store: createIpcJobStore(api.store),
    }).then(
      (e) => {
        if (alive) setEstimate(e)
      },
      () => {
        if (alive) setMessage(t('arAnalyzeFailed'))
      },
    )
    return () => {
      alive = false
      off?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per confirmation
  }, [])

  const vision = route.state === 'ready' ? aiReadVisionCheck(route.provider, route.model) : null
  const visionText =
    route.state !== 'ready' || !vision || vision.ok
      ? null
      : vision.reason === 'model-without-vision'
        ? t('arVisionModel', { model: route.model || aiProviderDisplayName(route.provider) })
        : vision.reason === 'provider-without-vision'
          ? t('arVisionProvider', { provider: aiProviderDisplayName(route.provider) })
          : t('arVisionUnknown')

  const run = async (): Promise<void> => {
    const confirmed = confirmedRef.current
    if (!confirmed) return
    const now = documentJobRoute(latest.current.settings, latest.current.statuses)
    if (!sameRoute(confirmed.route, now)) {
      // the connection changed while the start was held: show the new state first
      confirmedRef.current = null
      setMessage(t('arRouteChanged'))
      return
    }
    setStarting(true)
    try {
      const answer = await onStart({
        docHash,
        pages,
        route: confirmed.route,
        aiLabel: confirmed.aiLabel,
      })
      if (!answer.ok) {
        setMessage(
          'busy' in answer
            ? t('arBusy', answer.busy)
            : t('arStartFailed', { reason: answer.error }),
        )
      }
    } finally {
      setStarting(false)
      confirmedRef.current = null
    }
  }
  const runRef = useRef(run)
  runRef.current = run

  const sendGate = useAiSendGate<number>({
    settings,
    statuses: connection.statuses,
    store: SETTINGS_BRIDGE,
    start: () => void runRef.current(),
    onSettingsSaved: (next) => setSettings(next),
  })
  const pressRef = useRef(0)

  const canStart =
    route.state === 'ready' &&
    !!vision?.ok &&
    !!estimate &&
    estimate.calls > 0 &&
    !starting &&
    !sendGate.noticeDue
  const start = () => {
    if (route.state !== 'ready' || !canStart) return
    setMessage(null)
    confirmedRef.current = { route, aiLabel: routeLabel(route, connection.statuses) }
    if (sendGate.admit(++pressRef.current)) void run()
  }

  const connectChoice =
    sendGate.connectChoice ?? (route.state === 'not-connected' ? route.choice : null)

  return (
    <>
      <ul className="pdf-ai-read-summary" data-confirm>
        <li data-calls={estimate?.calls ?? ''}>
          {estimate ? t('arConfirmCalls', { calls: estimate.calls }) : t('arAnalyzing')}
        </li>
        {estimate && estimate.done > 0 && (
          <li data-skipped={estimate.done}>{t('arConfirmSkipped', { count: estimate.done })}</li>
        )}
        {route.state === 'checking' && <li data-route="checking">{t('arChecking')}</li>}
        {route.state === 'ready' && (
          <>
            <li data-route="ready" data-provider={route.provider}>
              {t('arConfirmProvider', { provider: routeLabel(route) })}
            </li>
            <li className="pdf-ai-read-ai" data-model-picker>
              <AiModelPicker
                bridge={SETTINGS_BRIDGE}
                lang={lang}
                subscriptionStatuses={connection.statuses}
                showLabel
                onRefreshSubscriptions={connection.refresh}
              />
            </li>
            <li>{t('arConfirmSends')}</li>
            {route.paid && (
              <li className="pdf-ai-read-paid" data-paid>
                {t('arConfirmPaid', { provider: aiProviderDisplayName(route.provider) })}
              </li>
            )}
          </>
        )}
      </ul>
      {estimate && estimate.calls === 0 && (
        <p className="pdf-ai-read-status" data-nothing>
          {t('arConfirmNothing')}
        </p>
      )}
      {visionText && (
        <p className="pdf-convert-error" role="alert" data-error="vision">
          {visionText}
        </p>
      )}
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
      {sendGate.noticeDue && (
        <AiFirstConnectionNotice
          lang={lang}
          codexKeepsHistory
          sendsWholeDocument
          onAcknowledge={sendGate.acknowledgeNotice}
        />
      )}
      {message && (
        <p className="pdf-convert-error" role="alert" data-error="start">
          {message}
        </p>
      )}
      <div className="pdf-modal-actions">
        <button type="button" className="pdf-modal-btn" data-action="back" onClick={onBack}>
          {t('arBack')}
        </button>
        <button type="button" className="pdf-modal-btn" onClick={onCancel}>
          {t('arCancel')}
        </button>
        <button
          type="button"
          className="pdf-modal-btn primary"
          data-action="start"
          disabled={!canStart}
          onClick={start}
        >
          {t('arStart')}
        </button>
      </div>
    </>
  )
}
