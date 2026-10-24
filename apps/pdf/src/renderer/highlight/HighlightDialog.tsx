/**
 * The AI highlight start window (reading-assist spec 4.6): the choices, then
 * the document job's pre-start confirmation.
 *
 * - Choices: a label preset (research, contract, textbook, or custom), its
 *   1 to 5 labels with a color each (names and colors are adjustable
 *   defaults), and the pages. The text comes from the saved file; unsaved
 *   page edits are not in it, and the window says so. A document that cannot
 *   be edited (encrypted) cannot start, with the reason shown, before
 *   anything is analyzed or sent.
 * - Confirmation: the calls the job makes, the blocks already done in this
 *   run, the AI it sends to, a paid route's charge, and, when the document
 *   has suggestions of another run (other labels), whether to delete them.
 *   It refuses to start, saying why, when the AI is not connected.
 *
 * Nothing is sent from here: Start hands the confirmed choice and route to
 * the caller, after the shared send gate let it through.
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
import { applyStoredAiReadings } from '../../../../../packages/pdf-structure/src/ai-read'
import {
  estimateHighlightJob,
  highlightJobParts,
} from '../../../../../packages/pdf-structure/src/highlight'
import type { DocumentJobEstimate } from '../../../../../packages/pdf-structure/src/jobs'
import type {
  HighlightLabel,
  HighlightPresetId,
  HighlightRun,
} from '../../../../../packages/pdf-structure/src/store/reading'
import type { DocumentTree } from '../../../../../packages/pdf-structure/src/tree/types'
import type { PdfStoreApi, PdfStructureApi, PdfStructureProgress } from '../../shared/ipc'
import type { TFunc } from '../i18n/locale'
import { useModalDialog } from '../modal-dialog'
import { parsePageRange } from '../convert/page-range'
import { useSubscriptionConnection } from '../ai/useSubscriptionConnection'
import { documentJobRoute, routeLabel, sameRoute, type DocumentJobRoute } from '../doc-jobs/route'
import { pagesText } from '../translate/TranslateDialog'
import { createIpcHighlightStore } from './ipc-highlight-store'
import {
  HIGHLIGHT_PRESETS,
  LABEL_COLORS,
  MAX_LABELS,
  PRESET_NAME_KEYS,
  cssColor,
  labelProblem,
  nextLabelColor,
  presetLabels,
  runIdOf,
  runLabels,
  type DraftLabel,
} from './presets'

export type ReadyRoute = Extract<DocumentJobRoute, { state: 'ready' }>

export interface HighlightDialogApi {
  tree: PdfStructureApi['tree']
  cancel: PdfStructureApi['cancel']
  onProgress: PdfStructureApi['onProgress']
  store: Pick<PdfStoreApi, 'aiReadPages' | 'highlightBlocks' | 'highlightRuns' | 'write'>
}

export interface HighlightStartRequest {
  docHash: string
  /** the document tree with the stored AI readings merged */
  tree: DocumentTree
  presetId: HighlightPresetId
  labels: HighlightLabel[]
  runId: string
  /** 1-based pages; null = every page */
  pages: number[] | null
  /** runs of other labels the person chose to delete before starting */
  deleteRunIds: string[]
  route: ReadyRoute
  /** the provider and model as the confirmation showed them (for the progress strip) */
  aiLabel?: string
}

export type HighlightStartAnswer =
  { ok: true } | { ok: false; busy: { done: number; total: number } } | { ok: false; error: string }

/** the choices the window opens with (the resume offer brings a run's back) */
export interface HighlightDialogInitial {
  presetId: HighlightPresetId
  labels: DraftLabel[]
  pages: number[] | null
}

export interface HighlightDialogProps {
  filePath: string
  password: string | undefined
  pageCount: number
  lang: Lang
  t: TFunc
  /** the document cannot be edited (encrypted): nothing can start */
  readOnly: boolean
  /** the editor has unsaved changes (they are not in what is sent) */
  dirty: boolean
  api: HighlightDialogApi
  initial: HighlightDialogInitial | null
  onStart: (request: HighlightStartRequest) => Promise<HighlightStartAnswer>
  onClose: () => void
}

const SETTINGS_BRIDGE: AiModelPickerBridge = {
  getSettings: () => window.pdfApi.getAiSettings(),
  setSettings: (settings) => window.pdfApi.setAiSettings(settings),
  onSettingsChanged: (handler) => window.pdfApi.onAiSettingsChanged(handler),
  openModelSettings: () => window.pdfApi.openAiModelSettings().catch(() => {}),
}

let jobSeq = 0
const newJobId = (): string =>
  `highlight-tree-${Date.now().toString(36)}-${(++jobSeq).toString(36)}`

type Load =
  | { kind: 'idle' }
  | { kind: 'loading'; done: number; total: number }
  | { kind: 'failed' }
  | { kind: 'ready'; docHash: string; tree: DocumentTree }

const PROBLEM_KEYS = {
  empty: 'hlLabelEmpty',
  duplicate: 'hlLabelDuplicate',
  count: 'hlLabelCount',
} as const

export function HighlightDialog(props: HighlightDialogProps): ReactElement {
  const { filePath, password, pageCount, lang, t, api, readOnly } = props
  const [load, setLoad] = useState<Load>(
    readOnly ? { kind: 'idle' } : { kind: 'loading', done: 0, total: 0 },
  )
  const [step, setStep] = useState<'choose' | 'confirm'>('choose')
  const [presetId, setPresetId] = useState<HighlightPresetId>(props.initial?.presetId ?? 'research')
  const [labels, setLabels] = useState<DraftLabel[]>(
    () => props.initial?.labels.map((l) => ({ ...l })) ?? presetLabels('research', t),
  )
  const initialPages = props.initial?.pages ?? null
  const allPages =
    !initialPages ||
    initialPages.length === 0 ||
    Array.from({ length: pageCount }, (_, i) => i + 1).every((p) => initialPages.includes(p))
  const [somePages, setSomePages] = useState(!allPages)
  const [rangeText, setRangeText] = useState(allPages ? '' : pagesText(initialPages!))
  const [showErrors, setShowErrors] = useState(false)
  const propsRef = useRef(props)
  propsRef.current = props
  const dismiss = useCallback(() => propsRef.current.onClose(), [])
  const dialogRef = useModalDialog(dismiss)

  // analyze the saved file once (a structure job in its own process; no AI); never when read-only
  useEffect(() => {
    if (readOnly) return
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
        // the blocks the translation uses: AI readings merged (the same keys)
        const stored = await api.store.aiReadPages(out.docHash)
        if (!alive) return
        const readings = new Map(
          stored.ok ? stored.pages.map((p) => [p.pageFingerprint, { payload: p.payload }]) : [],
        )
        const tree = readings.size > 0 ? applyStoredAiReadings(out.tree, readings) : out.tree
        setLoad({ kind: 'ready', docHash: out.docHash, tree })
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

  const range = somePages ? parsePageRange(rangeText, pageCount) : null
  const rangeError =
    range && !range.ok
      ? range.reason === 'empty'
        ? t('cvPagesEmpty')
        : range.reason === 'syntax'
          ? t('cvPagesSyntax')
          : t('cvPagesOutOfRange', { first: 1, last: pageCount })
      : null
  const pages = range?.ok ? range.pages : null
  const ready = load.kind === 'ready' ? load : null
  const blockCount = useMemo(
    () =>
      ready
        ? highlightJobParts(ready.tree, {
            labels: [],
            send: () => Promise.reject(new Error('counting sends nothing')),
            ...(pages ? { pages } : {}),
          }).blocks.length
        : null,
    [ready, pages],
  )
  const problem = labelProblem(labels)
  const canNext =
    !readOnly && !!ready && !rangeError && problem === null && blockCount !== null && blockCount > 0

  const choosePreset = (next: HighlightPresetId) => {
    setPresetId(next)
    setLabels(presetLabels(next, t))
  }
  const setLabel = (i: number, patch: Partial<DraftLabel>) =>
    setLabels((prev) => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)))
  const next = () => {
    setShowErrors(true)
    if (canNext) setStep('confirm')
  }

  return (
    <div className="pdf-modal-mask">
      <div
        ref={dialogRef}
        className="pdf-modal pdf-modal-wide pdf-highlight-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('hlTitle')}
        data-step={step}
      >
        <div className="pdf-modal-title">
          {step === 'choose' ? t('hlTitle') : t('arConfirmTitle')}
        </div>
        {step === 'choose' || !ready ? (
          <>
            <p className="pdf-modal-hint">{t('hlIntro')}</p>
            {readOnly && (
              <p className="pdf-convert-error" role="alert" data-error="read-only">
                {t('hlReadOnly')}
              </p>
            )}
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
            {!readOnly && (
              <>
                <fieldset className="pdf-convert-pages pdf-highlight-presets">
                  <legend>{t('hlPreset')}</legend>
                  {HIGHLIGHT_PRESETS.map((id) => (
                    <label key={id} className="pdf-modal-check" data-preset={id}>
                      <input
                        type="radio"
                        name="pdf-highlight-preset"
                        data-field={`preset-${id}`}
                        checked={presetId === id}
                        onChange={() => choosePreset(id)}
                      />
                      {t(PRESET_NAME_KEYS[id])}
                    </label>
                  ))}
                </fieldset>

                <fieldset className="pdf-convert-pages pdf-highlight-labels">
                  <legend>{t('hlLabels')}</legend>
                  {labels.map((label, i) => (
                    <div key={i} className="pdf-highlight-label-row" data-label={i}>
                      <span
                        className="pdf-highlight-swatch"
                        aria-hidden="true"
                        style={{ background: cssColor(label.color) }}
                      />
                      <input
                        className="pdf-modal-input"
                        data-field={`label-${i}`}
                        aria-label={t('hlLabelName', { n: i + 1 })}
                        placeholder={t('hlLabelPlaceholder')}
                        value={label.name}
                        maxLength={40}
                        onChange={(e) => setLabel(i, { name: e.target.value })}
                      />
                      <select
                        className="pdf-modal-input"
                        data-field={`label-color-${i}`}
                        aria-label={t('hlLabelColor', { n: i + 1 })}
                        value={
                          LABEL_COLORS.find((c) => c.color.join(',') === label.color.join(','))
                            ?.id ?? ''
                        }
                        onChange={(e) => {
                          const c = LABEL_COLORS.find((x) => x.id === e.target.value)
                          if (c) setLabel(i, { color: [...c.color] })
                        }}
                      >
                        {LABEL_COLORS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {t(c.key)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="pdf-modal-btn"
                        data-action={`remove-label-${i}`}
                        disabled={labels.length <= 1}
                        aria-label={t('hlRemoveLabel', { n: i + 1 })}
                        onClick={() => setLabels((prev) => prev.filter((_, k) => k !== i))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="pdf-modal-btn"
                    data-action="add-label"
                    disabled={labels.length >= MAX_LABELS}
                    onClick={() =>
                      setLabels((prev) => [...prev, { name: '', color: nextLabelColor(prev) }])
                    }
                  >
                    {t('hlAddLabel')}
                  </button>
                  {showErrors && problem && (
                    <span className="pdf-convert-error" role="alert" data-error="labels">
                      {t(PROBLEM_KEYS[problem], { max: MAX_LABELS })}
                    </span>
                  )}
                </fieldset>

                <fieldset className="pdf-convert-pages">
                  <legend>{t('cvPages')}</legend>
                  <label className="pdf-modal-check">
                    <input
                      type="radio"
                      name="pdf-highlight-pages"
                      checked={!somePages}
                      onChange={() => setSomePages(false)}
                    />
                    {t('cvPagesAll', { count: pageCount })}
                  </label>
                  <label className="pdf-modal-check">
                    <input
                      type="radio"
                      name="pdf-highlight-pages"
                      data-field="some-pages"
                      checked={somePages}
                      onChange={() => setSomePages(true)}
                    />
                    {t('cvPagesSome')}
                  </label>
                  <input
                    className={`pdf-modal-input${showErrors && rangeError ? ' invalid' : ''}`}
                    data-field="range"
                    placeholder={t('cvPagesPlaceholder')}
                    value={rangeText}
                    disabled={!somePages}
                    onChange={(e) => setRangeText(e.target.value)}
                  />
                  {showErrors && rangeError && (
                    <span className="pdf-convert-error" role="alert" data-error="range">
                      {rangeError}
                    </span>
                  )}
                </fieldset>

                <p className="pdf-ai-read-status" data-saved-file>
                  {t('hlSavedFile')}
                  {props.dirty ? ` ${t('hlUnsavedEdits')}` : ''}
                </p>
                {ready && !rangeError && blockCount === 0 && (
                  <p className="pdf-convert-error" role="alert" data-error="no-blocks">
                    {t('hlNoBlocks')}
                  </p>
                )}
                {ready && !rangeError && blockCount !== null && blockCount > 0 && (
                  <p className="pdf-ai-read-status" data-blocks={blockCount}>
                    {t('hlBlocksCount', { count: blockCount })}
                  </p>
                )}
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
                disabled={!canNext}
                title={readOnly ? t('hlReadOnly') : undefined}
                onClick={next}
              >
                {t('arNext')}
              </button>
            </div>
          </>
        ) : (
          <HighlightConfirm
            lang={lang}
            t={t}
            docHash={ready.docHash}
            tree={ready.tree}
            presetId={presetId}
            labels={runLabels(labels)}
            runId={runIdOf(presetId, labels)}
            pages={pages}
            dirty={props.dirty}
            readOnly={readOnly}
            api={api}
            onBack={() => setStep('choose')}
            onCancel={props.onClose}
            onStart={props.onStart}
          />
        )}
      </div>
    </div>
  )
}

/** the pre-start confirmation; mounted only once the person reached it */
function HighlightConfirm({
  lang,
  t,
  docHash,
  tree,
  presetId,
  labels,
  runId,
  pages,
  dirty,
  readOnly,
  api,
  onBack,
  onCancel,
  onStart,
}: {
  lang: Lang
  t: TFunc
  docHash: string
  tree: DocumentTree
  presetId: HighlightPresetId
  labels: HighlightLabel[]
  runId: string
  pages: number[] | null
  dirty: boolean
  readOnly: boolean
  api: HighlightDialogApi
  onBack: () => void
  onCancel: () => void
  onStart: (request: HighlightStartRequest) => Promise<HighlightStartAnswer>
}): ReactElement {
  const connection = useSubscriptionConnection()
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [estimate, setEstimate] = useState<DocumentJobEstimate | null>(null)
  const [otherRuns, setOtherRuns] = useState<HighlightRun[]>([])
  const [deleteOld, setDeleteOld] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const route = documentJobRoute(settings, connection.statuses)
  const confirmedRef = useRef<{ route: ReadyRoute; deleteOld: boolean; aiLabel: string } | null>(
    null,
  )
  const latest = useRef({ settings, statuses: connection.statuses })
  latest.current = { settings, statuses: connection.statuses }
  const routeKey = route.state === 'ready' ? `${route.provider}\n${route.model}` : ''

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
    }
  }, [])

  // suggestions of other labels: the confirmation asks whether to delete them
  useEffect(() => {
    let alive = true
    void api.store
      .highlightRuns(docHash)
      .then((out) => {
        if (alive && out.ok) setOtherRuns(out.runs.filter((r) => r.runId !== runId))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [api, docHash, runId])

  // the store tells which blocks this run already did
  useEffect(() => {
    let alive = true
    const [provider = '', model = ''] = routeKey ? routeKey.split('\n') : []
    const parts = highlightJobParts(tree, {
      labels,
      send: () => Promise.reject(new Error('the estimate sends nothing')),
      ...(pages ? { pages } : {}),
    })
    estimateHighlightJob({
      docHash,
      run: {
        runId,
        presetId,
        labels,
        pages: pages ?? [],
        provider,
        model,
        createdAt: 0,
      },
      blocks: parts.blocks,
      batch: parts.batch,
      store: createIpcHighlightStore(api.store),
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per confirmation and route
  }, [routeKey])

  const send = async (confirmed: {
    route: ReadyRoute
    deleteOld: boolean
    aiLabel: string
  }): Promise<void> => {
    setStarting(true)
    try {
      const answer = await onStart({
        docHash,
        tree,
        presetId,
        labels,
        runId,
        pages,
        deleteRunIds: confirmed.deleteOld ? otherRuns.map((r) => r.runId) : [],
        route: confirmed.route,
        aiLabel: confirmed.aiLabel,
      })
      if (!answer.ok) {
        setMessage(
          'busy' in answer
            ? t('arBusy', answer.busy)
            : t('hlStartFailed', { reason: answer.error }),
        )
      }
    } finally {
      setStarting(false)
    }
  }

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
    confirmedRef.current = null
    await send(confirmed)
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

  const nothingToSend = !!estimate && estimate.calls === 0
  const canStart =
    !readOnly &&
    labelProblem(labels) === null &&
    route.state === 'ready' &&
    !!estimate &&
    !nothingToSend &&
    !starting &&
    !sendGate.noticeDue
  const startJob = () => {
    if (route.state !== 'ready' || !canStart) return
    setMessage(null)
    confirmedRef.current = {
      route,
      deleteOld,
      aiLabel: routeLabel(route, connection.statuses),
    }
    if (sendGate.admit(++pressRef.current)) void run()
  }

  const connectChoice =
    sendGate.connectChoice ?? (route.state === 'not-connected' ? route.choice : null)

  return (
    <>
      <ul className="pdf-ai-read-summary" data-confirm>
        <li data-labels>
          {t('hlConfirmLabels', { labels: labels.map((l) => l.name).join(', ') })}
        </li>
        <li data-calls={estimate?.calls ?? ''}>
          {estimate
            ? t('hlConfirmCalls', { calls: estimate.calls, blocks: estimate.pending })
            : t('arAnalyzing')}
        </li>
        {estimate && estimate.done > 0 && (
          <li data-done={estimate.done}>
            {t('hlConfirmDone', { done: estimate.done, total: estimate.total })}
          </li>
        )}
        <li data-saved-file>
          {t('hlSavedFile')}
          {dirty ? ` ${t('hlUnsavedEdits')}` : ''}
        </li>
        {!nothingToSend && route.state === 'checking' && (
          <li data-route="checking">{t('arChecking')}</li>
        )}
        {!nothingToSend && route.state === 'ready' && (
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
              />
            </li>
            <li>{t('hlConfirmSends')}</li>
            {route.paid && (
              <li className="pdf-ai-read-paid" data-paid>
                {t('arConfirmPaid', { provider: aiProviderDisplayName(route.provider) })}
              </li>
            )}
          </>
        )}
      </ul>
      {otherRuns.length > 0 && (
        <fieldset
          className="pdf-convert-pages pdf-highlight-old-runs"
          data-old-runs={otherRuns.length}
        >
          <legend>{t('hlOldRuns')}</legend>
          <label className="pdf-modal-check">
            <input
              type="radio"
              name="pdf-highlight-old"
              data-field="old-keep"
              checked={!deleteOld}
              onChange={() => setDeleteOld(false)}
            />
            {t('hlOldRunsKeep')}
          </label>
          <label className="pdf-modal-check">
            <input
              type="radio"
              name="pdf-highlight-old"
              data-field="old-delete"
              checked={deleteOld}
              onChange={() => setDeleteOld(true)}
            />
            {t('hlOldRunsDelete')}
          </label>
        </fieldset>
      )}
      {nothingToSend && (
        <p className="pdf-ai-read-status" data-nothing>
          {t('hlConfirmNothing')}
        </p>
      )}
      {!nothingToSend && connectChoice && (
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
      {!nothingToSend && sendGate.noticeDue && (
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
          onClick={startJob}
        >
          {t('hlStart')}
        </button>
      </div>
    </>
  )
}
