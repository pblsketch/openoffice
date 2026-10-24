import React, { useEffect, useRef, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import type {
  AiProviderChoice,
  AiSubscriptionProviderId,
  AiSubscriptionStatus,
  AiSubscriptionStatuses,
} from '@genoffice/ai-provider/browser'
import {
  AI_SIGNING_IN_STALLED_MS,
  aiConnectPromptView,
  aiSubscriptionCardView,
  aiSubscriptionProviderName,
  aiSubscriptionStatusOf,
  aiSubscriptionVendorName,
  isAiSubscriptionAccountAction,
  type AiSubscriptionCardAction,
} from './ai-subscription'
import { AiConnectGuide } from './AiConnectGuide'
import type { AiConnectPath } from './connect-guide'
import { AiMark } from './AiMark'
import { aiSubscriptionText, type AiSubscriptionStringKey } from './strings-ai-subscription'
import './ai-subscription.css'

// The main process opens a terminal window of the CLI's own on Windows alone
// (the install command, the login window for a pasted code); on macOS and
// Linux the card does not offer them.
const TERMINAL_WINDOWS = !(
  typeof navigator !== 'undefined' && /mac|linux/i.test(navigator.platform)
)

/** What a card's buttons do; each receives the provider so two cards can share one set */
export interface AiSubscriptionCardActions {
  /** run the vendor's official install command in a visible terminal window */
  readonly onInstall: (provider: AiSubscriptionProviderId) => void
  /** start the CLI's own login; while a browser sign-in runs, open the CLI's window instead */
  readonly onLogin: (provider: AiSubscriptionProviderId) => void
  /** check the connection again */
  readonly onRecheck: (provider: AiSubscriptionProviderId) => void
  /** the user chose "use anyway" on a metered login */
  readonly onAcceptMetered: (provider: AiSubscriptionProviderId) => void
  /** open the vendor's install instructions (AI_SUBSCRIPTION_INSTALL_HELP_URLS) */
  readonly onOpenInstallHelp: (provider: AiSubscriptionProviderId) => void
  /**
   * run the official update of a CLI below the app's floor, in a visible
   * terminal window; a host without it gets no update button
   */
  readonly onUpdate?: ((provider: AiSubscriptionProviderId) => void) | undefined
  /** end a login the app started; a host without it gets no cancel link */
  readonly onCancelLogin?: ((provider: AiSubscriptionProviderId) => void) | undefined
}

const ACTION_LABELS: Record<AiSubscriptionCardAction, AiSubscriptionStringKey> = {
  install: 'actionInstall',
  'install-help': 'actionInstallHelp',
  login: 'actionLogin',
  'login-window': 'actionLoginWindow',
  'cancel-login': 'actionCancelLogin',
  update: 'actionUpdate',
  'accept-metered': 'actionAcceptMetered',
  recheck: 'actionRecheck',
  'switch-account': 'actionSwitchAccount',
  logout: 'actionLogout',
}

/**
 * One subscription provider's connection: its state and the one thing to do
 * about it. The provider is named in text; the mark beside it is the neutral
 * AI glyph, never a vendor logo.
 *
 * The signed-in account and the two actions on it (sign in with another
 * account, sign out) belong to the card in Settings alone. They appear only
 * when asked for, by `showAccount` and by the two handlers, and never on a
 * compact card: an AI panel does not name the account. Both actions change the
 * vendor program for the whole PC, so the caller confirms before it runs one.
 */
export function AiSubscriptionCard({
  status,
  lang,
  compact = false,
  disabled = false,
  onInstall,
  onLogin,
  onRecheck,
  onAcceptMetered,
  onOpenInstallHelp,
  onUpdate,
  onCancelLogin,
  showAccount = false,
  onSwitchAccount,
  onLogout,
}: AiSubscriptionCardActions & {
  readonly status: AiSubscriptionStatus
  readonly lang: Lang
  /** tighter layout for an AI panel */
  readonly compact?: boolean | undefined
  /** an action is already in flight: the buttons stay visible but inert */
  readonly disabled?: boolean | undefined
  /** Settings only: show the signed-in account the CLI named, next to the plan name */
  readonly showAccount?: boolean | undefined
  /** Settings only: the user asked to sign in with another account (the CLI's own login, again) */
  readonly onSwitchAccount?: ((provider: AiSubscriptionProviderId) => void) | undefined
  /** Settings only: the user asked to sign out (the CLI's own logout) */
  readonly onLogout?: ((provider: AiSubscriptionProviderId) => void) | undefined
}): React.JSX.Element {
  const stalled = useSigningInStalled(status.signingIn === 'browser')
  const view = aiSubscriptionCardView(status, {
    account: showAccount && !compact,
    accountActions: !compact && onSwitchAccount !== undefined && onLogout !== undefined,
    terminalWindows: TERMINAL_WINDOWS,
    update: onUpdate !== undefined,
    cancelLogin: onCancelLogin !== undefined,
    signingInStalled: stalled,
  })
  const provider = view.provider
  const params = {
    vendor: aiSubscriptionVendorName(provider),
    plan: view.planName ?? '',
    provider: aiSubscriptionProviderName(provider),
  }
  const handlers: Record<AiSubscriptionCardAction, (id: AiSubscriptionProviderId) => void> = {
    install: onInstall,
    'install-help': onOpenInstallHelp,
    login: onLogin,
    // pressing login again while the browser sign-in runs opens the CLI's window
    'login-window': onLogin,
    'cancel-login': (id) => onCancelLogin?.(id),
    update: (id) => onUpdate?.(id),
    'accept-metered': onAcceptMetered,
    recheck: onRecheck,
    'switch-account': (id) => onSwitchAccount?.(id),
    logout: (id) => onLogout?.(id),
  }
  return (
    <div
      className={`ai-sub-card${compact ? ' compact' : ''}`}
      data-provider={provider}
      data-state={view.state}
      data-tone={view.tone}
    >
      <div className="ai-sub-card-head">
        <span className="ai-sub-card-mark">
          <AiMark size={compact ? 14 : 16} />
        </span>
        <span className="ai-sub-card-name">{aiSubscriptionProviderName(provider)}</span>
        <span className="ai-sub-card-status" role="status">
          {aiSubscriptionText(lang, view.statusKey, params)}
        </span>
      </div>
      {view.account && (
        <p className="ai-sub-account">
          <bdi>{view.account}</bdi>
          {view.planName ? ` · ${view.planName}` : ''}
        </p>
      )}
      {/* what went wrong comes before what a button about it does */}
      {view.detailKey && (
        <p className="ai-sub-detail" data-detail={view.detailKey}>
          {aiSubscriptionText(lang, view.detailKey, { ...params, ...view.detailParams })}
        </p>
      )}
      {view.programPath && (
        <div className="ai-sub-path">
          <p className="ai-sub-path-label">{aiSubscriptionText(lang, 'cardErrNeedsUpdatePath')}</p>
          {/* a path reads left to right in every language */}
          <p className="ai-sub-path-value" dir="ltr">
            <bdi>{view.programPath}</bdi>
          </p>
          {view.pathNoteKeys?.map((key) => (
            <p key={key} className="ai-sub-path-label" data-note={key}>
              {aiSubscriptionText(lang, key, { ...params, ...view.detailParams })}
            </p>
          ))}
        </div>
      )}
      {view.noteKeys.map((key) => (
        <p key={key} className="ai-sub-note" data-note={key}>
          {aiSubscriptionText(lang, key, params)}
        </p>
      ))}
      {view.actions.length > 0 && (
        <div className="ai-sub-actions">
          {view.actions.map((action, index) =>
            // the way out of a step, not the step itself: a link, never the highlighted button
            view.links.includes(action) ? (
              <button
                key={action}
                type="button"
                className="ai-sub-link"
                data-action={action}
                onClick={() => handlers[action](provider)}
              >
                {aiSubscriptionText(lang, ACTION_LABELS[action])}
              </button>
            ) : (
              <button
                key={action}
                type="button"
                className={`ai-sub-btn${
                  index === 0 && view.tone !== 'warning' && !isAiSubscriptionAccountAction(action)
                    ? ' primary'
                    : ''
                }`}
                data-action={action}
                disabled={disabled}
                onClick={() => handlers[action](provider)}
              >
                {aiSubscriptionText(
                  lang,
                  // lifted out of the links, the way to the window says what it opens
                  action === 'login-window' ? 'actionLoginWindowOpen' : ACTION_LABELS[action],
                )}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Whether a browser sign-in has run for `AI_SIGNING_IN_STALLED_MS`, counted
 * from when this card first saw it (a card opened later counts from then).
 */
function useSigningInStalled(signingIn: boolean): boolean {
  const [stalled, setStalled] = useState(false)
  useEffect(() => {
    setStalled(false)
    if (!signingIn) return
    const timer = setTimeout(() => setStalled(true), AI_SIGNING_IN_STALLED_MS)
    return () => clearTimeout(timer)
  }, [signingIn])
  return stalled
}

/**
 * What an AI panel shows instead of an error while no provider can run: why,
 * and the connect cards to act on. Renders nothing once a provider can run.
 * Pass the result of `selectAiProvider(settings, statuses)` as `choice`.
 */
export function AiConnectPrompt({
  choice,
  statuses,
  lang,
  disabled,
  attention,
  onOpenSettings,
  onOpenConnectHelp,
  ...actions
}: AiSubscriptionCardActions & {
  readonly choice: AiProviderChoice
  readonly statuses: AiSubscriptionStatuses
  readonly lang: Lang
  readonly disabled?: boolean | undefined
  /**
   * count of the sends this prompt answered instead of a run: each new one
   * scrolls the prompt into view, so the user sees why nothing was sent
   */
  readonly attention?: number | undefined
  /** open Settings › AI; offered when the selected key provider is not filled in, or nothing is connected (the free connections are there) */
  readonly onOpenSettings?: (() => void) | undefined
  /** open the website's step-by-step connect help (see `AiConnectGuide`) */
  readonly onOpenConnectHelp?: ((path: AiConnectPath | null) => void) | undefined
}): React.JSX.Element | null {
  const view = aiConnectPromptView(choice)
  const shown = view !== null
  const promptRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!attention || !shown) return
    // not every host implements it (test DOMs do not)
    promptRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [attention, shown])
  if (!view) return null
  const params = { provider: view.providerName ?? '' }
  return (
    <div
      ref={promptRef}
      className="ai-sub-prompt"
      data-reason={choice.connected ? undefined : choice.reason}
    >
      <div className="ai-sub-prompt-head">
        <span className="ai-sub-prompt-mark">
          <AiMark size={18} />
        </span>
        <h3 className="ai-sub-prompt-title">{aiSubscriptionText(lang, view.titleKey, params)}</h3>
      </div>
      {view.bodyKey && (
        <p className="ai-sub-prompt-body">{aiSubscriptionText(lang, view.bodyKey, params)}</p>
      )}
      {view.free && (
        // nothing is connected: ask which AI the user has, then walk that one path
        <AiConnectGuide
          statuses={statuses}
          lang={lang}
          disabled={disabled}
          onChooseFree={onOpenSettings}
          onOpenConnectHelp={onOpenConnectHelp}
          {...actions}
        />
      )}
      {!view.free &&
        view.providers.map((provider) => (
          <AiSubscriptionCard
            key={provider}
            status={aiSubscriptionStatusOf(statuses, provider)}
            lang={lang}
            compact
            disabled={disabled}
            {...actions}
          />
        ))}
      {view.settings && onOpenSettings && (
        <div className="ai-sub-actions">
          <button
            type="button"
            className="ai-sub-btn primary"
            data-action="open-settings"
            onClick={onOpenSettings}
          >
            {aiSubscriptionText(lang, 'actionOpenSettings')}
          </button>
        </div>
      )}
    </div>
  )
}
