/**
 * The document translation window (spec §8): the choices, then the
 * pre-start confirmation.
 *
 * - Choices: the target language (one of the 21 UI languages; the default is
 *   the UI language, or English when the document is in it), the pages, the
 *   output formats (translated PDF, Markdown, EPUB; several at once) and the
 *   bilingual option (Markdown and EPUB: each translation after its paragraph;
 *   PDF: each translated page beside its source page), or "store only" (no file: the
 *   translation stays in the result store). The translated PDF cannot be
 *   chosen, with the reason shown, for an encrypted document or a target the
 *   PDF writer cannot lay out (ar, he, hi). A choice with nothing to
 *   translate is refused; a scanned document is pointed to AI page reading.
 * - Confirmation: the calls the job makes, the blocks already translated, the
 *   AI it sends to, a paid route's charge, and a warning when the stored
 *   translation was made with another provider or model. "Translate again
 *   from the start" asks once more before it replaces the stored
 *   translation; when a person edited blocks of that language, it asks
 *   whether to delete them too or keep them. A stored translation can be
 *   exported as it is (no call).
 *   It refuses to start, saying why, when the AI is not connected.
 *
 * The document is analyzed here (a structure job, no AI) with the stored AI
 * readings merged, so the job translates what the outputs will contain.
 * Nothing is sent from here: Start hands the confirmed choice and route to
 * the caller, after the shared send gate let it through.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { AiProviderId, AiSettings } from '@genoffice/ai-provider/browser'
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
  estimateTranslationJob,
  type DocumentJobEstimate,
} from '../../../../../packages/pdf-structure/src/jobs'
import {
  TRANSLATION_LANGUAGES,
  defaultTargetLanguageForTree,
  isTranslationLanguage,
  translationJobParts,
  translationUnits,
} from '../../../../../packages/pdf-structure/src/translate'
import type { DocumentTree } from '../../../../../packages/pdf-structure/src/tree/types'
import type { PdfStoreApi, PdfStructureApi, PdfStructureProgress } from '../../shared/ipc'
import type { TFunc } from '../i18n/locale'
import { useModalDialog } from '../modal-dialog'
import { parsePageRange } from '../convert/page-range'
import { useSubscriptionConnection } from '../ai/useSubscriptionConnection'
import { createIpcJobStore } from '../doc-jobs/ipc-store'
import { documentJobRoute, routeLabel, sameRoute, type DocumentJobRoute } from '../doc-jobs/route'
import {
  TRANSLATION_FORMATS,
  languageName,
  pdfFormatBlock,
  treeHasScannedPages,
  writableFormats,
  type TranslationFormat,
} from './translate-model'

export type ReadyRoute = Extract<DocumentJobRoute, { state: 'ready' }>

export interface TranslateDialogApi {
  tree: PdfStructureApi['tree']
  cancel: PdfStructureApi['cancel']
  onProgress: PdfStructureApi['onProgress']
  store: Pick<PdfStoreApi, 'aiReadPages' | 'translation' | 'write'>
}

/** start the translation job, start over, or only write the files from the store */
export type TranslateMode = 'translate' | 'restart' | 'export'

export interface TranslateStartRequest {
  docHash: string
  /** the document tree with the stored AI readings merged (every page) */
  tree: DocumentTree
  lang: string
  /** 1-based pages; null = every page */
  pages: number[] | null
  /** the files to write; empty = store only */
  formats: TranslationFormat[]
  bilingual: boolean
  mode: TranslateMode
  /** with 'restart': the blocks a person edited stay (only the others are sent again) */
  keepEdited?: boolean
  /** the confirmed AI (absent for 'export') */
  route?: ReadyRoute
  /** the provider and model as the confirmation showed them (for the progress strip) */
  aiLabel?: string
}

/** what the caller answers to Start */
export type TranslateStartAnswer =
  | { ok: true }
  /** a save dialog was cancelled: nothing started, the window stays */
  | { ok: false; cancelled: true }
  | { ok: false; busy: { done: number; total: number } }
  | { ok: false; error: string }

export interface TranslateDialogProps {
  filePath: string
  password: string | undefined
  pageCount: number
  /** UI language */
  lang: Lang
  t: TFunc
  /** opened with a password, or protected by an owner password: no translated PDF */
  encrypted: boolean
  api: TranslateDialogApi
  /** the target language asked for (the AI window, a resumed job); null = the default */
  initialLang: string | null
  /** pages asked for; null = every page */
  initialPages: number[] | null
  onStart: (request: TranslateStartRequest) => Promise<TranslateStartAnswer>
  /** open the AI page-reading window (scanned documents) */
  onOpenAiRead?: () => void
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
  `translate-tree-${Date.now().toString(36)}-${(++jobSeq).toString(36)}`

const FORMAT_KEY = { pdf: 'trFormatPdf', md: 'trFormatMd', epub: 'trFormatEpub' } as const

/** "1-3, 5" from page numbers */
export function pagesText(pages: readonly number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!
    let end = start
    while (sorted[i + 1] === end + 1) end = sorted[++i]!
    parts.push(end > start ? `${start}-${end}` : String(start))
  }
  return parts.join(', ')
}

interface Analysis {
  docHash: string
  tree: DocumentTree
}

type Load =
  | { kind: 'loading'; done: number; total: number }
  | { kind: 'failed' }
  | { kind: 'ready'; analysis: Analysis }

export function TranslateDialog(props: TranslateDialogProps): ReactElement {
  const { filePath, password, pageCount, lang, t, api, encrypted } = props
  const [load, setLoad] = useState<Load>({ kind: 'loading', done: 0, total: 0 })
  const [step, setStep] = useState<'choose' | 'confirm'>('choose')
  const [target, setTarget] = useState<string | null>(
    props.initialLang && isTranslationLanguage(props.initialLang) ? props.initialLang : null,
  )
  const allPages =
    !props.initialPages ||
    props.initialPages.length === 0 ||
    (props.initialPages.length >= pageCount &&
      Array.from({ length: pageCount }, (_, i) => i + 1).every((p) =>
        props.initialPages!.includes(p),
      ))
  const [somePages, setSomePages] = useState(!allPages)
  const [rangeText, setRangeText] = useState(allPages ? '' : pagesText(props.initialPages!))
  const [chosen, setChosen] = useState<Set<TranslationFormat>>(new Set())
  /** "store only (no file)": alone, nothing is written but the store */
  const [storeOnly, setStoreOnly] = useState(false)
  const [bilingual, setBilingual] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
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
        // translations are keyed by the blocks the outputs contain: AI readings merged
        const stored = await api.store.aiReadPages(out.docHash)
        if (!alive) return
        const readings = new Map(
          stored.ok ? stored.pages.map((p) => [p.pageFingerprint, { payload: p.payload }]) : [],
        )
        const tree = readings.size > 0 ? applyStoredAiReadings(out.tree, readings) : out.tree
        const fallback = defaultTargetLanguageForTree(tree, propsRef.current.lang)
        const lang0 = target ?? fallback
        setTarget(lang0)
        setChosen(new Set([pdfFormatBlock(encrypted, lang0) === null ? 'pdf' : 'md']))
        setLoad({ kind: 'ready', analysis: { docHash: out.docHash, tree } })
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
  const lang0 = target ?? 'en'
  const block = pdfFormatBlock(encrypted, lang0)
  const formats = writableFormats(chosen, block)
  const bilingualAllowed = formats.length > 0

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
  const pageSet = useMemo(() => (pages ? new Set(pages) : null), [pages])

  const unitCount = useMemo(
    () =>
      analysis ? translationUnits(analysis.tree, pageSet ? { pages: pageSet } : {}).length : null,
    [analysis, pageSet],
  )
  const scanned = analysis ? treeHasScannedPages(analysis.tree, pageSet) : false
  const formatError = formats.length === 0 && !storeOnly ? t('trFormatRequired') : null
  const canNext = !!analysis && !rangeError && !formatError && unitCount !== null && unitCount > 0

  const changeLanguage = (next: string) => {
    setTarget(next)
    // the PDF alone was chosen and the new language cannot have it: offer Markdown instead
    if (pdfFormatBlock(encrypted, next) !== null) {
      setChosen((prev) => (prev.size === 1 && prev.has('pdf') ? new Set(['md']) : prev))
    }
  }

  const toggleFormat = (format: TranslationFormat) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(format)) next.delete(format)
      else next.add(format)
      return next
    })

  const next = () => {
    setShowErrors(true)
    if (canNext) setStep('confirm')
  }

  const pdfBlockText =
    block === 'encrypted'
      ? t('trPdfEncrypted')
      : block === 'script'
        ? t('trPdfScript', { language: languageName(lang0, lang) })
        : null

  return (
    <div className="pdf-modal-mask">
      <div
        ref={dialogRef}
        className="pdf-modal pdf-modal-wide pdf-translate-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('trTitle')}
        data-step={step}
      >
        <div className="pdf-modal-title">
          {step === 'choose' ? t('trTitle') : t('arConfirmTitle')}
        </div>
        {step === 'choose' ? (
          <>
            <p className="pdf-modal-hint">{t('trIntro')}</p>
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
                <label className="pdf-field">
                  <span>{t('trLanguage')}</span>
                  <select
                    className="pdf-modal-input"
                    data-field="language"
                    value={lang0}
                    onChange={(e) => changeLanguage(e.target.value)}
                  >
                    {TRANSLATION_LANGUAGES.map((code) => (
                      <option key={code} value={code}>
                        {languageName(code, lang)}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset className="pdf-convert-pages">
                  <legend>{t('cvPages')}</legend>
                  <label className="pdf-modal-check">
                    <input
                      type="radio"
                      name="pdf-translate-pages"
                      checked={!somePages}
                      onChange={() => setSomePages(false)}
                    />
                    {t('cvPagesAll', { count: pageCount })}
                  </label>
                  <label className="pdf-modal-check">
                    <input
                      type="radio"
                      name="pdf-translate-pages"
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

                <fieldset className="pdf-convert-pages pdf-translate-formats">
                  <legend>{t('trFormats')}</legend>
                  {TRANSLATION_FORMATS.map((format) => {
                    const disabled = format === 'pdf' && block !== null
                    return (
                      <label
                        key={format}
                        className="pdf-modal-check"
                        data-format={format}
                        data-disabled={disabled || undefined}
                      >
                        <input
                          type="checkbox"
                          data-field={`format-${format}`}
                          checked={!disabled && chosen.has(format)}
                          disabled={disabled}
                          onChange={() => toggleFormat(format)}
                        />
                        {t(FORMAT_KEY[format])}
                      </label>
                    )
                  })}
                  <label className="pdf-modal-check" data-format="store">
                    <input
                      type="checkbox"
                      data-field="format-store"
                      checked={storeOnly}
                      onChange={(e) => setStoreOnly(e.target.checked)}
                    />
                    {t('trFormatStore')}
                  </label>
                  {pdfBlockText && (
                    <span className="pdf-translate-note" data-pdf-blocked={block ?? undefined}>
                      {pdfBlockText}
                    </span>
                  )}
                  <label className="pdf-modal-check pdf-translate-bilingual">
                    <input
                      type="checkbox"
                      data-field="bilingual"
                      checked={bilingualAllowed && bilingual}
                      disabled={!bilingualAllowed}
                      onChange={(e) => setBilingual(e.target.checked)}
                    />
                    {t('trBilingual')}
                  </label>
                  {showErrors && formatError && (
                    <span className="pdf-convert-error" role="alert" data-error="format">
                      {formatError}
                    </span>
                  )}
                </fieldset>

                {unitCount === 0 && !rangeError ? (
                  <div className="pdf-translate-refusal" role="alert" data-error="no-blocks">
                    <p className="pdf-convert-error">{t('trNoBlocks')}</p>
                    {scanned && (
                      <>
                        <p className="pdf-ai-read-status">{t('trNoBlocksScanned')}</p>
                        {props.onOpenAiRead && (
                          <button
                            type="button"
                            className="pdf-modal-btn"
                            data-action="open-ai-read"
                            onClick={props.onOpenAiRead}
                          >
                            {t('arMenuRead')}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  unitCount !== null &&
                  !rangeError && (
                    <p className="pdf-ai-read-status" data-units={unitCount}>
                      {t('trBlocksCount', { count: unitCount })}
                    </p>
                  )
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
                onClick={next}
              >
                {t('arNext')}
              </button>
            </div>
          </>
        ) : (
          analysis && (
            <TranslateConfirm
              lang={lang}
              t={t}
              docHash={analysis.docHash}
              tree={analysis.tree}
              target={lang0}
              pages={pages}
              formats={formats}
              bilingual={bilingualAllowed && bilingual}
              api={api}
              onBack={() => setStep('choose')}
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
function TranslateConfirm({
  lang,
  t,
  docHash,
  tree,
  target,
  pages,
  formats,
  bilingual,
  api,
  onBack,
  onCancel,
  onStart,
}: {
  lang: Lang
  t: TFunc
  docHash: string
  tree: DocumentTree
  target: string
  pages: number[] | null
  formats: TranslationFormat[]
  bilingual: boolean
  api: TranslateDialogApi
  onBack: () => void
  onCancel: () => void
  onStart: (request: TranslateStartRequest) => Promise<TranslateStartAnswer>
}): ReactElement {
  const connection = useSubscriptionConnection()
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [estimate, setEstimate] = useState<DocumentJobEstimate | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [askRestart, setAskRestart] = useState(false)
  /** blocks of this language a person edited (the restart asks about them) */
  const [editedCount, setEditedCount] = useState(0)
  const route = documentJobRoute(settings, connection.statuses)
  /** what the user saw when pressing Start; a held start runs only if it still holds */
  const confirmedRef = useRef<{
    route: ReadyRoute
    mode: TranslateMode
    keepEdited: boolean
    aiLabel: string
  } | null>(null)
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

  // edited blocks of the language: "translate again from the start" asks whether to keep them
  useEffect(() => {
    let alive = true
    void api.store
      .translation(docHash, target)
      .then((out) => {
        if (!alive || !out.ok || !out.translation) return
        setEditedCount(out.translation.blocks.filter((b) => b.edited === true).length)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [api, docHash, target])

  // the store tells what is already translated; the route's model tells a provider change
  useEffect(() => {
    let alive = true
    const [provider = '', model = ''] = routeKey ? routeKey.split('\n') : []
    const parts = translationJobParts(tree, {
      lang: target,
      send: () => Promise.reject(new Error('the estimate sends nothing')),
      ...(pages ? { pages } : {}),
    })
    estimateTranslationJob({
      docHash,
      lang: target,
      blocks: parts.blocks,
      batch: parts.batch,
      model: { provider, model },
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per confirmation and route
  }, [routeKey])

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
    await send({
      mode: confirmed.mode,
      route: confirmed.route,
      keepEdited: confirmed.keepEdited,
      aiLabel: confirmed.aiLabel,
    })
    confirmedRef.current = null
  }
  const runRef = useRef(run)
  runRef.current = run

  const send = async (o: {
    mode: TranslateMode
    route?: ReadyRoute
    keepEdited?: boolean
    aiLabel?: string
  }): Promise<void> => {
    setStarting(true)
    try {
      const answer = await onStart({
        docHash,
        tree,
        lang: target,
        pages,
        formats,
        bilingual,
        mode: o.mode,
        ...(o.route ? { route: o.route } : {}),
        ...(o.keepEdited ? { keepEdited: true } : {}),
        ...(o.aiLabel ? { aiLabel: o.aiLabel } : {}),
      })
      if (!answer.ok && !('cancelled' in answer)) {
        setMessage(
          'busy' in answer
            ? t('arBusy', answer.busy)
            : t('trStartFailed', { reason: answer.error }),
        )
      }
    } finally {
      setStarting(false)
    }
  }

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
    route.state === 'ready' && !!estimate && !nothingToSend && !starting && !sendGate.noticeDue
  const startJob = (mode: TranslateMode, keepEdited = false) => {
    if (route.state !== 'ready' || !canStart) return
    setMessage(null)
    setAskRestart(false)
    confirmedRef.current = {
      route,
      mode,
      keepEdited,
      aiLabel: routeLabel(route, connection.statuses),
    }
    if (sendGate.admit(++pressRef.current)) void run()
  }
  /** write the files from what is stored; nothing is sent */
  const exportStored = () => {
    if (starting || !estimate || estimate.done === 0 || formats.length === 0) return
    setMessage(null)
    void send({ mode: 'export' })
  }

  const connectChoice =
    sendGate.connectChoice ?? (route.state === 'not-connected' ? route.choice : null)
  const change = route.state === 'ready' ? estimate?.providerChange : null
  const storedName = (p: { provider: string | null; model: string | null }) =>
    p.provider
      ? p.model
        ? `${aiProviderDisplayName(p.provider as AiProviderId)} · ${p.model}`
        : aiProviderDisplayName(p.provider as AiProviderId)
      : t('trProviderUnknown')

  return (
    <>
      <ul className="pdf-ai-read-summary" data-confirm>
        <li data-language={target}>
          {t('trConfirmLanguage', { language: languageName(target, lang) })}
        </li>
        <li data-calls={estimate?.calls ?? ''}>
          {estimate
            ? t('trConfirmCalls', { calls: estimate.calls, blocks: estimate.pending })
            : t('arAnalyzing')}
        </li>
        {estimate && estimate.done > 0 && (
          <li data-done={estimate.done}>
            {t('trConfirmDone', { done: estimate.done, total: estimate.total })}
          </li>
        )}
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
                onRefreshSubscriptions={connection.refresh}
              />
            </li>
            <li>{t('trConfirmSends')}</li>
            {route.paid && (
              <li className="pdf-ai-read-paid" data-paid>
                {t('arConfirmPaid', { provider: aiProviderDisplayName(route.provider) })}
              </li>
            )}
          </>
        )}
      </ul>
      {!nothingToSend && change && (
        <p className="pdf-translate-warning" role="alert" data-provider-change>
          {t('trProviderChange', {
            stored: storedName(change.stored),
            next: routeLabel(route as ReadyRoute, connection.statuses),
          })}
        </p>
      )}
      {nothingToSend && (
        <p className="pdf-ai-read-status" data-nothing>
          {t('trConfirmNothing')}
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
      {askRestart && estimate && (
        <div className="pdf-translate-restart" role="alertdialog" data-restart-confirm>
          <p>
            {t('trRestartConfirm', {
              language: languageName(target, lang),
              count: estimate.done,
            })}
          </p>
          {editedCount > 0 && (
            <p data-edited-count={editedCount}>
              {t('trRestartEditedCount', { count: editedCount })}
            </p>
          )}
          <div className="pdf-modal-actions">
            <button
              type="button"
              className="pdf-modal-btn"
              data-action="restart-no"
              onClick={() => setAskRestart(false)}
            >
              {t('arCancel')}
            </button>
            {editedCount > 0 ? (
              <>
                <button
                  type="button"
                  className="pdf-modal-btn"
                  data-action="restart-discard-edited"
                  disabled={route.state !== 'ready' || starting || sendGate.noticeDue}
                  onClick={() => startJob('restart')}
                >
                  {t('trRestartDiscardEdited', { count: editedCount })}
                </button>
                <button
                  type="button"
                  className="pdf-modal-btn primary"
                  data-action="restart-keep-edited"
                  disabled={route.state !== 'ready' || starting || sendGate.noticeDue}
                  onClick={() => startJob('restart', true)}
                >
                  {t('trRestartKeepEdited')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="pdf-modal-btn primary"
                data-action="restart-yes"
                disabled={route.state !== 'ready' || starting || sendGate.noticeDue}
                onClick={() => startJob('restart')}
              >
                {t('trRestartYes')}
              </button>
            )}
          </div>
        </div>
      )}
      {message && (
        <p className="pdf-convert-error" role="alert" data-error="start">
          {message}
        </p>
      )}
      <div className="pdf-modal-actions pdf-translate-actions">
        {estimate && estimate.done > 0 && !askRestart && (
          <button
            type="button"
            className="pdf-modal-btn"
            data-action="restart"
            disabled={starting}
            onClick={() => setAskRestart(true)}
          >
            {t('trRestart')}
          </button>
        )}
        <button type="button" className="pdf-modal-btn" data-action="back" onClick={onBack}>
          {t('arBack')}
        </button>
        <button type="button" className="pdf-modal-btn" onClick={onCancel}>
          {t('arCancel')}
        </button>
        {estimate && estimate.done > 0 && !nothingToSend && formats.length > 0 && (
          <button
            type="button"
            className="pdf-modal-btn"
            data-action="export-partial"
            disabled={starting}
            onClick={exportStored}
          >
            {t('trExportPartial')}
          </button>
        )}
        {nothingToSend ? (
          <button
            type="button"
            className="pdf-modal-btn primary"
            data-action="export"
            disabled={starting || formats.length === 0}
            onClick={exportStored}
          >
            {t('trExport')}
          </button>
        ) : (
          <button
            type="button"
            className="pdf-modal-btn primary"
            data-action="start"
            disabled={!canStart}
            onClick={() => startJob('translate')}
          >
            {t('trStart')}
          </button>
        )}
      </div>
    </>
  )
}
