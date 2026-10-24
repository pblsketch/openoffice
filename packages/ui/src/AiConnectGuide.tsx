import React, { useEffect, useRef, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import {
  AI_SUBSCRIPTION_PROVIDERS,
  type AiSubscriptionProviderId,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider/browser'
import {
  aiSubscriptionStatusOf,
  aiSubscriptionVendorName,
  aiSubscriptionProviderName,
} from './ai-subscription'
import { AiSubscriptionCard, type AiSubscriptionCardActions } from './AiSubscriptionCard'
import { AiCodexNotice } from './AiSubscriptionNotices'
import {
  AI_CONNECT_STEP_KEYS,
  aiConnectGuideView,
  aiConnectInfoText,
  aiConnectStepsView,
  type AiConnectChoice,
  type AiConnectPath,
} from './connect-guide'
import { aiSubscriptionText } from './strings-ai-subscription'
import './ai-subscription.css'

/** How long "copied" stays on the copy button */
const COPIED_MS = 2500

/**
 * The connect guide: while nothing is connected it asks which AI the user
 * already has, then lays open that one path. A subscription path shows where
 * the user stands on install → sign in → connected, above the card that acts
 * on it; the free path hands over to the host (the free cards in place, or
 * Settings). Below, a way to copy what a helper needs to know.
 *
 * The choice lives in this component only: closing the view forgets it, and a
 * login under way or a working connection opens its path again by itself.
 */
export function AiConnectGuide({
  statuses,
  lang,
  disabled,
  onChooseFree,
  freeContent,
  freeConnected = false,
  codexNotice = false,
  renderAfterCard,
  onOpenConnectHelp,
  ...actions
}: AiSubscriptionCardActions & {
  readonly statuses: AiSubscriptionStatuses
  readonly lang: Lang
  readonly disabled?: boolean | undefined
  /** the free path's button: where the free connections are (Settings › AI) */
  readonly onChooseFree?: (() => void) | undefined
  /** the free path drawn in place, instead of a button to elsewhere */
  readonly freeContent?: React.ReactNode
  /** a free connection is made (a host that reads the free settings knows) */
  readonly freeConnected?: boolean | undefined
  /** the line about Codex, wherever Codex can be picked: the question and its own path */
  readonly codexNotice?: boolean | undefined
  /** anything the host shows under a provider's card (a launch that failed) */
  readonly renderAfterCard?: ((provider: AiSubscriptionProviderId) => React.ReactNode) | undefined
  /**
   * open the website's step-by-step connect help at the open path (null while
   * the question is asked); a host without it gets no link
   */
  readonly onOpenConnectHelp?: ((path: AiConnectPath | null) => void) | undefined
}): React.JSX.Element {
  const [chosen, setChosen] = useState<AiConnectChoice>(null)
  const view = aiConnectGuideView(statuses, chosen, freeConnected)
  const connected =
    freeConnected ||
    AI_SUBSCRIPTION_PROVIDERS.some(
      (provider) => aiSubscriptionStatusOf(statuses, provider).state === 'ready',
    )
  const t = (key: Parameters<typeof aiSubscriptionText>[1], params?: Record<string, string>) =>
    aiSubscriptionText(lang, key, params)

  return (
    <div className="ai-sub-guide" data-open={view.open ?? 'ask'}>
      {view.open === null ? (
        <>
          <p className="ai-sub-guide-question">{t('guideQuestion')}</p>
          <div className="ai-sub-guide-paths">
            {view.options.map((option) => (
              <button
                key={option.path}
                type="button"
                className="ai-sub-guide-path"
                data-path={option.path}
                onClick={() => setChosen(option.path)}
              >
                <span className="ai-sub-guide-path-head">
                  <span className="ai-sub-guide-path-title">{t(option.titleKey)}</span>
                  {option.badgeKey && (
                    <span className="ai-sub-guide-badge" data-badge={option.badgeKey}>
                      {t(option.badgeKey)}
                    </span>
                  )}
                </span>
                <span className="ai-sub-guide-path-body">{t(option.bodyKey)}</span>
              </button>
            ))}
          </div>
        </>
      ) : view.open === 'free' ? (
        <div className="ai-sub-guide-open" data-path="free">
          {/* free cards drawn in place say all this themselves */}
          {!freeContent && <p className="ai-sub-guide-need">{t('guidePathFreeBody')}</p>}
          {freeContent ??
            (onChooseFree && (
              <div className="ai-sub-actions">
                <button
                  type="button"
                  className="ai-sub-btn primary"
                  data-action="connect-free"
                  onClick={onChooseFree}
                >
                  {t('actionConnectFree')}
                </button>
              </div>
            ))}
        </div>
      ) : (
        <GuidePath
          provider={view.open}
          statuses={statuses}
          lang={lang}
          disabled={disabled}
          actions={actions}
          after={renderAfterCard?.(view.open)}
          needKey={view.options.find((option) => option.path === view.open)!.bodyKey}
        />
      )}
      {codexNotice && (view.open === null || view.open === 'codex') && (
        <AiCodexNotice lang={lang} />
      )}
      {view.open !== null && (
        <button
          type="button"
          className="ai-sub-link ai-sub-guide-back"
          data-action="guide-back"
          onClick={() => setChosen('ask')}
        >
          {t('guideBack')}
        </button>
      )}
      {!connected && (
        <CopyInfo
          statuses={statuses}
          lang={lang}
          onOpenHelp={onOpenConnectHelp && (() => onOpenConnectHelp(view.open))}
        />
      )}
    </div>
  )
}

function GuidePath({
  provider,
  statuses,
  lang,
  disabled,
  actions,
  after,
  needKey,
}: {
  readonly provider: AiSubscriptionProviderId
  readonly statuses: AiSubscriptionStatuses
  readonly lang: Lang
  readonly disabled?: boolean | undefined
  readonly actions: AiSubscriptionCardActions
  readonly after: React.ReactNode
  readonly needKey: Parameters<typeof aiSubscriptionText>[1]
}): React.JSX.Element {
  const status = aiSubscriptionStatusOf(statuses, provider)
  const steps = aiConnectStepsView(status)
  const params = {
    vendor: aiSubscriptionVendorName(provider),
    provider: aiSubscriptionProviderName(provider),
  }
  return (
    <div className="ai-sub-guide-open" data-path={provider}>
      <p className="ai-sub-guide-need">{aiSubscriptionText(lang, needKey, params)}</p>
      <ol className="ai-sub-guide-steps" aria-label={aiSubscriptionText(lang, 'guideStepsLabel')}>
        {steps.steps.map((step, index) => (
          <li
            key={step.id}
            className="ai-sub-guide-step"
            data-step={step.id}
            data-done={step.done || undefined}
            aria-current={steps.current === step.id && !step.done ? 'step' : undefined}
          >
            <span className="ai-sub-guide-step-mark" aria-hidden="true">
              {step.done ? '✓' : index + 1}
            </span>
            <span className="ai-sub-guide-step-name">
              {aiSubscriptionText(lang, AI_CONNECT_STEP_KEYS[step.id])}
            </span>
          </li>
        ))}
      </ol>
      <AiSubscriptionCard status={status} lang={lang} compact disabled={disabled} {...actions} />
      {after}
    </div>
  )
}

/**
 * Where to turn when connecting does not work: the website's pictures of each
 * step, then "copy details for help" (the statuses in a form a helper can
 * read, nothing personal)
 */
function CopyInfo({
  statuses,
  lang,
  onOpenHelp,
}: {
  readonly statuses: AiSubscriptionStatuses
  readonly lang: Lang
  readonly onOpenHelp?: (() => void) | undefined
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = () => {
    const text = aiConnectInfoText(statuses, {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      platform: typeof navigator !== 'undefined' ? navigator.platform : undefined,
    })
    // not every host has a clipboard (test DOMs do not); nothing is shown then
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), COPIED_MS)
      })
      .catch(() => undefined)
  }
  return (
    <div className="ai-sub-guide-info">
      {onOpenHelp && (
        <button
          type="button"
          className="ai-sub-link ai-sub-guide-help"
          data-action="connect-help"
          onClick={onOpenHelp}
        >
          {aiSubscriptionText(lang, 'actionConnectHelp')}
        </button>
      )}
      <p className="ai-sub-note">{aiSubscriptionText(lang, 'guideInfoHint')}</p>
      <button
        type="button"
        className="ai-sub-link"
        data-action="copy-info"
        aria-live="polite"
        onClick={copy}
      >
        {aiSubscriptionText(lang, copied ? 'copyInfoDone' : 'actionCopyInfo')}
      </button>
    </div>
  )
}
