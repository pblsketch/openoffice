/**
 * The actions of the side-by-side translation view as the editor mounts them
 * (reading-assist spec 4.5): `useBilingualActions` gives the view its slots,
 * and the slots draw the pieces below from one controller
 * (./actions-controller):
 *
 * - each page's header: "translate this page" / "translate the rest (N)",
 *   the provider it sends to, the paid-route question, the running job, and
 *   why it stopped;
 * - each paragraph: "translate again" (with the question first for a
 *   person's edit) and why it failed;
 * - a translated paragraph's editor (double-click), with the hint that the
 *   marks go;
 * - the bar: "translate all pages" (the document translation window, with
 *   its usual confirmation), and under it the connect prompt or the
 *   first-connection notice when a press met them.
 *
 * The host below the bar is mounted only while the view is on: it reads the
 * settings and connection statuses and wires the shared send gate. Showing
 * the view sends nothing; only the buttons do.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { AiSettings } from '@genoffice/ai-provider/browser'
import type { Lang } from '@genoffice/i18n'
import {
  AiConnectPrompt,
  AiFirstConnectionNotice,
  aiProviderDisplayName,
  useAiSendGate,
  type AiModelPickerBridge,
} from '@genoffice/ui'
import type { TFunc } from '../i18n/locale'
import { useSubscriptionConnection } from '../ai/useSubscriptionConnection'
import type { DocumentJobSession } from '../doc-jobs/job-session'
import { documentJobRoute, type DocumentJobRoute } from '../doc-jobs/route'
import {
  BilingualActionsController,
  pageActionLabel,
  pageKey,
  type BilingualActionRequest,
  type BilingualActionsSnapshot,
  type BilingualStoreApi,
} from './actions-controller'
import {
  BilingualRuns,
  type BilingualPageContext,
  type BilingualParagraphContext,
  type BilingualSlots,
} from './BilingualColumn'
import type { BilingualData } from './useBilingualData'

const SETTINGS_BRIDGE: AiModelPickerBridge = {
  getSettings: () => window.pdfApi.getAiSettings(),
  setSettings: (settings) => window.pdfApi.setAiSettings(settings),
  onSettingsChanged: (handler) => window.pdfApi.onAiSettingsChanged(handler),
  openModelSettings: () => window.pdfApi.openAiModelSettings().catch(() => {}),
}

export interface UseBilingualActionsOptions {
  session: DocumentJobSession
  /** the store channels; null where the shell has none */
  store: BilingualStoreApi | null
  /** UI language */
  lang: Lang
  t: TFunc
  /** the open file as saved */
  filePath: string
  password: string | undefined
  /** "translate all pages": open the document translation window for the shown language */
  onTranslateAll: (lang: string | null) => void
}

export interface BilingualActions {
  slots: BilingualSlots
  controller: BilingualActionsController
}

function useSnapshot(ctl: BilingualActionsController): BilingualActionsSnapshot {
  return useSyncExternalStore(ctl.subscribe, ctl.snapshot)
}

export function useBilingualActions(o: UseBilingualActionsOptions): BilingualActions {
  const deps = {
    session: o.session,
    store: o.store,
    lang: o.lang,
    t: o.t,
    filePath: o.filePath,
    password: o.password,
  }
  const [controller] = useState(() => new BilingualActionsController(deps))
  controller.update(deps)
  useEffect(() => () => controller.dispose(), [controller])
  const latest = useRef(o)
  latest.current = o

  const slots = useMemo<BilingualSlots>(
    () => ({
      pageActions: (ctx) => <PageAction ctl={controller} ctx={ctx} t={latest.current.t} />,
      paragraphActions: (ctx) =>
        ctx.unit.state === 'pending' ? null : (
          <ParagraphActions ctl={controller} ctx={ctx} t={latest.current.t} />
        ),
      onParagraphDoubleClick: (ctx) => controller.openEditor(ctx.docHash, ctx.lang, ctx.unit),
      renderParagraphBody: (ctx) => (
        <ParagraphBody ctl={controller} ctx={ctx} t={latest.current.t} />
      ),
      barActions: (data) =>
        data.load.kind === 'ready' && data.lang !== null ? (
          <button
            type="button"
            className="bl-bar-btn"
            data-action="bl-translate-all"
            data-tip={latest.current.t('blTranslateAllTip')}
            onClick={() => latest.current.onTranslateAll(data.lang)}
          >
            {latest.current.t('blTranslateAll')}
          </button>
        ) : null,
      barPanel: (data) => (
        <BilingualActionsHost
          ctl={controller}
          data={data}
          lang={latest.current.lang}
          t={latest.current.t}
        />
      ),
    }),
    [controller],
  )
  return { slots, controller }
}

// ── the host: settings, connection, send gate ──

function BilingualActionsHost(props: {
  ctl: BilingualActionsController
  data: BilingualData
  lang: Lang
  t: TFunc
}): ReactElement | null {
  const { ctl, data, lang, t } = props
  const connection = useSubscriptionConnection()
  const [settings, setSettings] = useState<AiSettings | null>(null)
  /** a press met the connect prompt or the notice: show it until it starts or is closed */
  const [prompted, setPrompted] = useState(false)

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

  const sendGate = useAiSendGate<BilingualActionRequest>({
    settings,
    statuses: connection.statuses,
    store: SETTINGS_BRIDGE,
    start: (request) => {
      setPrompted(false)
      ctl.run(request)
    },
    onSettingsSaved: (next) => setSettings(next),
  })
  const route: DocumentJobRoute = documentJobRoute(sendGate.settings, connection.statuses)
  const routeRef = useRef(route)
  routeRef.current = route
  const gateRef = useRef(sendGate)
  gateRef.current = sendGate

  useLayoutEffect(() => {
    ctl.setData(data)
  })
  useLayoutEffect(() => {
    ctl.setRoute(route)
  })
  useLayoutEffect(() => {
    ctl.bindHost({
      route: () => routeRef.current,
      admit: (request) => {
        const ok = gateRef.current.admit(request)
        if (!ok) setPrompted(true)
        return ok
      },
    })
    return () => {
      ctl.bindHost(null)
      ctl.setData(null)
    }
  }, [ctl])

  const connectChoice = prompted ? sendGate.connectChoice : null
  const notice = prompted && sendGate.noticeDue
  if (!connectChoice && !notice) return null
  return (
    <div className="bl-gate" role="region" aria-label={t('blToggle')}>
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
      {notice && (
        <AiFirstConnectionNotice
          lang={lang}
          codexKeepsHistory
          onAcknowledge={sendGate.acknowledgeNotice}
        />
      )}
      <button
        type="button"
        className="bl-bar-btn bl-gate-close"
        aria-label={t('blClose')}
        onClick={() => {
          sendGate.reset()
          setPrompted(false)
        }}
      >
        ×
      </button>
    </div>
  )
}

// ── page header ──

function PageAction(props: {
  ctl: BilingualActionsController
  ctx: BilingualPageContext
  t: TFunc
}): ReactElement | null {
  const { ctl, ctx, t } = props
  const s = useSnapshot(ctl)
  const { docHash, lang, page } = ctx
  const note = s.pageNotes.get(pageKey(docHash, lang, page))
  const job =
    s.pageJob && s.pageJob.docHash === docHash && s.pageJob.lang === lang && s.pageJob.page === page
      ? s.pageJob
      : null
  const ask =
    s.paidAsk && s.paidAsk.docHash === docHash && s.paidAsk.lang === lang && s.paidAsk.page === page
      ? s.paidAsk
      : null
  const label = pageActionLabel({ units: ctx.counts.units, pending: ctx.pending.length }, t)
  const provider = s.route.state === 'ready' ? aiProviderDisplayName(s.route.provider) : null

  let main: ReactNode = null
  if (job) {
    main = (
      <>
        <span className="bl-page-running" role="status" data-bl-page-job={page}>
          {job.total > 0
            ? t('blPageRunning', { done: job.done, total: job.total })
            : t('blPageStarting')}
        </span>
        <button
          type="button"
          className="bl-bar-btn"
          data-action="bl-page-stop"
          onClick={ctl.stopPage}
        >
          {t('blStop')}
        </button>
      </>
    )
  } else if (ask) {
    main = (
      <span className="bl-paid-ask" role="alert" data-bl-paid-ask={page}>
        <span className="bl-paid-text">{t('blPaidAsk', { provider: ask.provider })}</span>
        <button
          type="button"
          className="bl-bar-btn bl-primary"
          data-action="bl-paid-yes"
          onClick={ctl.confirmPaid}
        >
          {t('blPaidYes')}
        </button>
        <button
          type="button"
          className="bl-bar-btn"
          data-action="bl-paid-no"
          onClick={ctl.cancelPaid}
        >
          {t('blCancel')}
        </button>
      </span>
    )
  } else if (label) {
    main = (
      <>
        <button
          type="button"
          className="bl-bar-btn bl-primary"
          data-action="bl-translate-page"
          data-bl-pending={ctx.pending.length}
          disabled={s.busy}
          data-tip={
            s.busy ? t('blWaitingTip') : provider ? t('blSendsTo', { provider }) : undefined
          }
          onClick={() => ctl.pressPage(docHash, lang, page)}
        >
          {s.busy ? t('blWaiting') : label}
        </button>
        {provider && !s.busy && (
          <span
            className="bl-provider"
            data-bl-provider={s.route.state === 'ready' ? s.route.provider : ''}
          >
            {provider}
          </span>
        )}
      </>
    )
  }
  if (!main && !note) return null
  return (
    <>
      {main}
      {note && (
        <span className="bl-page-note" role="alert" data-bl-page-note={page}>
          {note}
        </span>
      )}
    </>
  )
}

// ── paragraph ──

function ParagraphActions(props: {
  ctl: BilingualActionsController
  ctx: BilingualParagraphContext
  t: TFunc
}): ReactElement | null {
  const { ctl, ctx, t } = props
  const s = useSnapshot(ctl)
  const { unit } = ctx
  if (s.editing?.keyString === unit.keyString && s.editing.docHash === ctx.docHash) return null
  const note = s.paraNotes.get(unit.keyString)
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  let main: ReactNode
  if (s.confirmDiscard === unit.keyString) {
    main = (
      <span className="bl-discard-ask" role="alert" data-bl-discard-ask>
        <span>{t('blDiscardEditAsk')}</span>
        <button
          type="button"
          className="bl-mini-btn bl-primary"
          data-action="bl-discard-yes"
          onDoubleClick={stop}
          onClick={() => ctl.confirmRetranslate(ctx.docHash, ctx.lang, unit)}
        >
          {t('blRetranslate')}
        </button>
        <button
          type="button"
          className="bl-mini-btn"
          data-action="bl-discard-no"
          onDoubleClick={stop}
          onClick={ctl.cancelRetranslate}
        >
          {t('blCancel')}
        </button>
      </span>
    )
  } else if (s.retranslating === unit.keyString) {
    main = (
      <span className="bl-para-running" role="status" data-bl-retranslating>
        {t('blRetranslating')}
      </span>
    )
  } else {
    main = (
      <button
        type="button"
        className="bl-mini-btn bl-retranslate"
        data-action="bl-retranslate"
        disabled={s.busy || s.retranslating !== null}
        data-tip={s.busy ? t('blWaitingTip') : t('blRetranslateTip')}
        onDoubleClick={stop}
        onClick={() => ctl.pressRetranslate(ctx.docHash, ctx.lang, unit)}
      >
        {t('blRetranslate')}
      </button>
    )
  }
  return (
    <>
      {main}
      {note && (
        <span className="bl-para-note" role="alert" data-bl-para-note>
          {note}
        </span>
      )}
    </>
  )
}

/** the paragraph's text, or its editor while open */
function ParagraphBody(props: {
  ctl: BilingualActionsController
  ctx: BilingualParagraphContext
  t: TFunc
}): ReactElement {
  const { ctl, ctx, t } = props
  const s = useSnapshot(ctl)
  const e = s.editing
  if (
    !e ||
    e.keyString !== ctx.unit.keyString ||
    e.docHash !== ctx.docHash ||
    e.lang !== ctx.lang
  ) {
    return <BilingualRuns runs={ctx.unit.runs} />
  }
  return (
    <ParagraphEditor
      key={e.keyString}
      initial={e.initial}
      dropsFormat={e.dropsFormat}
      saving={e.saving}
      error={e.error}
      t={t}
      onSave={(text) => void ctl.saveEdit(text)}
      onCancel={ctl.cancelEdit}
      onDraft={ctl.setDraft}
    />
  )
}

function ParagraphEditor(props: {
  initial: string
  dropsFormat: boolean
  saving: boolean
  error: string | null
  t: TFunc
  onSave: (text: string) => void
  onCancel: () => void
  /** the text as typed, so it survives the editor following a save to a new hash */
  onDraft: (text: string) => void
}): ReactElement {
  const { t } = props
  const [text, setText] = useState(props.initial)
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  return (
    <span className="bl-editor" data-bl-editor onDoubleClick={(e) => e.stopPropagation()}>
      {props.dropsFormat && (
        <span className="bl-editor-hint" data-bl-format-hint>
          {t('blEditDropsFormat')}
        </span>
      )}
      <textarea
        ref={ref}
        className="bl-editor-text"
        aria-label={t('blEditLabel')}
        value={text}
        disabled={props.saving}
        rows={Math.min(12, Math.max(3, text.split('\n').length + 1))}
        onChange={(e) => {
          setText(e.target.value)
          props.onDraft(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            props.onCancel()
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            props.onSave(text)
          }
          // the editor's own shortcuts stay out of the text
          e.stopPropagation()
        }}
      />
      {props.error && (
        <span className="bl-para-note" role="alert">
          {props.error}
        </span>
      )}
      <span className="bl-editor-actions">
        <button
          type="button"
          className="bl-mini-btn bl-primary"
          data-action="bl-edit-save"
          disabled={props.saving || text.trim() === ''}
          onClick={() => props.onSave(text)}
        >
          {t('blEditSave')}
        </button>
        <button
          type="button"
          className="bl-mini-btn"
          data-action="bl-edit-cancel"
          disabled={props.saving}
          onClick={props.onCancel}
        >
          {t('blCancel')}
        </button>
      </span>
    </span>
  )
}
