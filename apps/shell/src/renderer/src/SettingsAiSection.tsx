import { Fragment, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AiCodexNotice,
  AiFirstConnectionNotice,
  AiMeteredWarning,
  AiSubscriptionCard,
  Dropdown,
  aiConnectPromptView,
  aiSubscriptionCardView,
  aiSubscriptionProviderName,
  aiSubscriptionStatusOf,
  aiSubscriptionText,
} from '@genoffice/ui'
import type { Lang } from '@genoffice/i18n'
import { AI_SUBSCRIPTION_PROVIDERS, selectAiProvider } from '@genoffice/ai-provider/browser'
import type { AiSettings, AiSubscriptionProviderId } from '@genoffice/ai-provider/browser'
import { FreeAiCards } from './FreeAiCards'
import { LocalAiSection } from './LocalAiSection'
import type { TFunc } from './locale'
import type { SubscriptionConnection } from './subscription-client'
import {
  CODEX_MAY_KEEP_HISTORY,
  aiSelectionChoices,
  aiSelectionValue,
  changeAiSettings,
  readAiSettings,
  readUrlGithubToken,
  subscriptionProgramName,
  withAiSelection,
  withHeadlessSubscription,
  withReadUrlGithubToken,
} from './settings-ai'
import type { AiSelectionChoice, SubscriptionAccountAction } from './settings-ai'

// ── AI section of the settings dialog ─────────────────────
// What everyone sees is the subscription connection: the two connect cards and
// which AI to use. Everything that takes a key sits behind "Advanced", closed
// until asked for. The controls here save at once; the key panes keep their
// own Save button.

/** the two key areas inside Advanced; one is mounted at a time, each with its own draft */
export type AdvancedTab = 'model' | 'media'

/** Account section: where each subscription stands, and the way to the cards */
export function SubscriptionSummary({
  t,
  lang,
  connection,
  onManage,
}: {
  t: TFunc
  lang: Lang
  connection: SubscriptionConnection
  onManage: () => void
}) {
  return (
    <>
      <h3 className="set-pane-title">{t('setSecAccount')}</h3>
      <div className="set-field-desc set-ai-note">{aiSubscriptionText(lang, 'connectBody')}</div>
      {AI_SUBSCRIPTION_PROVIDERS.map((provider) => {
        const view = aiSubscriptionCardView(aiSubscriptionStatusOf(connection.statuses, provider))
        return (
          <div className="set-field" key={provider} data-provider={provider}>
            <div className="set-field-text">
              <div className="set-field-label">{aiSubscriptionProviderName(provider)}</div>
              <div className="set-field-value" data-state={view.state}>
                {aiSubscriptionText(lang, view.statusKey, { plan: view.planName ?? '' })}
              </div>
            </div>
          </div>
        )
      })}
      <div className="set-pane-footer">
        <button className="set-btn primary" onClick={onManage}>
          {t('setSubManage')}
        </button>
      </div>
    </>
  )
}

function choiceLabel(choice: AiSelectionChoice, t: TFunc, lang: Lang): string {
  const name = choice.name ?? ''
  if (choice.kind === 'auto') {
    if (!name) return aiSubscriptionText(lang, 'pickerAuto')
    // with the model it runs on, when the program listed its models
    return choice.model
      ? aiSubscriptionText(lang, 'pickerAutoUsingModel', { provider: name, model: choice.model })
      : aiSubscriptionText(lang, 'pickerAutoUsing', { provider: name })
  }
  if (choice.unavailable) return t('setAiUseUnavailable', { provider: name })
  const running = choice.model ? `${name} · ${choice.model}` : name
  if (choice.metered) return `${running} · ${aiSubscriptionText(lang, 'pickerPaid')}`
  // the Anthropic key provider is also called "Claude": the tag tells the two apart
  if (choice.kind === 'subscription') {
    return `${running} · ${aiSubscriptionText(lang, 'pickerSubscription')}`
  }
  return name
}

/**
 * The GitHub token read_url uses. It is stored in the settings file in plain
 * text, like a provider key, and is only ever shown masked. Saving writes the
 * trimmed value; clearing removes the field, so public pages still work.
 */
function ReadUrlTokenField({
  t,
  token,
  onSave,
}: {
  t: TFunc
  token: string
  onSave: (token: string) => void
}) {
  const [draft, setDraft] = useState(token)
  useEffect(() => {
    setDraft(token)
  }, [token])

  const next = draft.trim()
  const dirty = next !== token
  return (
    <section className="set-read-url">
      <div className="set-pane-subhead set-read-url-head">
        <h4 className="set-pane-subtitle">{t('setReadUrlTitle')}</h4>
        <div className="set-btn-row">
          <button className="set-btn primary" disabled={!dirty} onClick={() => onSave(next)}>
            {t('setReadUrlSave')}
          </button>
          <button
            className="set-btn"
            disabled={!token && !draft}
            onClick={() => {
              setDraft('')
              onSave('')
            }}
          >
            {t('setReadUrlClear')}
          </button>
        </div>
      </div>
      <div className="set-field-desc set-ai-note">{t('setReadUrlTokenHint')}</div>
      <div className="set-field">
        <div className="set-field-text">
          <div className="set-field-stack">
            <label className="set-field-label" htmlFor="set-read-url-token">
              {t('setReadUrlToken')}
            </label>
            <div className="set-field-desc">
              {token ? t('setReadUrlTokenSaved') : t('setReadUrlNoToken')}
            </div>
          </div>
        </div>
        <input
          id="set-read-url-token"
          className="set-input"
          type="password"
          value={draft}
          placeholder="github_pat_…"
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
        />
      </div>
    </section>
  )
}

export function AiSection({
  t,
  lang,
  connection,
  openTab,
  advanced,
}: {
  t: TFunc
  lang: Lang
  connection: SubscriptionConnection
  /** open with Advanced expanded on this area (an outside entry point asked for a key block) */
  openTab?: AdvancedTab | undefined
  /** the key pane of an Advanced area */
  advanced: (tab: AdvancedTab) => ReactNode
}) {
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(openTab !== undefined)
  const [tab, setTab] = useState<AdvancedTab>(openTab ?? 'model')
  const [noticeOpen, setNoticeOpen] = useState(false)
  /** the automatic-requests switch was pressed while off: the warning is up, nothing is saved yet */
  const [headlessAsked, setHeadlessAsked] = useState(false)
  /** an account action was pressed on a card: its confirmation is up, nothing has run yet */
  const [accountAsked, setAccountAsked] = useState<{
    provider: AiSubscriptionProviderId
    action: SubscriptionAccountAction
  } | null>(null)

  useEffect(() => {
    if (!openTab) return
    setAdvancedOpen(true)
    setTab(openTab)
  }, [openTab])

  useEffect(() => {
    let alive = true
    const load = () => {
      void readAiSettings().then((next) => {
        if (alive && next) setSettings(next)
      })
    }
    load()
    // the composer chip and the key panes write the same file
    const off = window.aiOffice.onAiSettingsChanged?.(load)
    return () => {
      alive = false
      off?.()
    }
  }, [])

  const change = (apply: (current: AiSettings) => AiSettings): Promise<AiSettings | null> => {
    return changeAiSettings(apply).then((next) => {
      if (next) setSettings(next)
      return next
    })
  }

  const { statuses, busy, failed } = connection
  const acceptMetered = (provider: AiSubscriptionProviderId) => {
    // the main process stores the acceptance; re-read so "AI to use" lists it
    void connection.acceptMetered(provider).then(() =>
      readAiSettings().then((next) => {
        if (next) setSettings(next)
      }),
    )
  }

  // Both account actions are the vendor program's own, for the whole PC: a terminal using the
  // same program is signed out, or moved to the other account, with it. So each is asked first.
  const runAccountAction = () => {
    if (!accountAsked) return
    setAccountAsked(null)
    if (accountAsked.action === 'logout') connection.logout(accountAsked.provider)
    else connection.switchAccount(accountAsked.provider)
  }
  const accountActionLabel = accountAsked
    ? aiSubscriptionText(
        lang,
        accountAsked.action === 'logout' ? 'actionLogout' : 'actionSwitchAccount',
      )
    : ''

  const choices = settings ? aiSelectionChoices(settings, statuses) : []
  const running = settings ? selectAiProvider(settings, statuses) : null
  const blocked = running ? aiConnectPromptView(running) : null
  const codexSelectable = choices.some((choice) => choice.provider === 'codex')
  const headlessOn = settings?.headlessSubscriptionEnabled === true

  return (
    <>
      <h3 className="set-pane-title">{t('setSecAi')}</h3>
      <h4 className="set-pane-subtitle set-sub-title">{t('setSubTitle')}</h4>
      <div className="set-field-desc set-ai-note">{aiSubscriptionText(lang, 'connectBody')}</div>
      <div className="set-sub-cards">
        {AI_SUBSCRIPTION_PROVIDERS.map((provider) => (
          <Fragment key={provider}>
            <AiSubscriptionCard
              status={aiSubscriptionStatusOf(statuses, provider)}
              lang={lang}
              disabled={busy}
              onInstall={connection.install}
              onUpdate={connection.update}
              onCancelLogin={connection.cancelLogin}
              onLogin={connection.login}
              onRecheck={connection.recheck}
              onAcceptMetered={acceptMetered}
              onOpenInstallHelp={connection.openInstallHelp}
              showAccount
              // ChatGPT's sign-in is the app's own: another account touches nothing else on the PC
              onSwitchAccount={(id) =>
                id === 'chatgpt'
                  ? connection.switchAccount(id)
                  : setAccountAsked({ provider: id, action: 'switch' })
              }
              onLogout={(id) => setAccountAsked({ provider: id, action: 'logout' })}
              onManageUsage={
                provider === 'chatgpt' ? () => connection.openInstallHelp('chatgpt') : undefined
              }
            />
            {accountAsked?.provider === provider && (
              <div
                className="set-adv-confirm set-sub-confirm"
                role="alertdialog"
                aria-label={accountActionLabel}
                data-provider={provider}
              >
                <div className="set-field-desc set-adv-warning">
                  {t(
                    provider === 'chatgpt'
                      ? 'setSubChatGptLogoutConfirm'
                      : accountAsked.action === 'logout'
                        ? 'setSubLogoutConfirm'
                        : 'setSubSwitchConfirm',
                    { program: subscriptionProgramName(provider) },
                  )}
                </div>
                <div className="set-btn-row">
                  <button className="set-btn" onClick={() => setAccountAsked(null)}>
                    {t('cancel')}
                  </button>
                  <button className="set-btn danger" onClick={runAccountAction}>
                    {accountActionLabel}
                  </button>
                </div>
              </div>
            )}
            {failed[provider] === 'logout' ? (
              <div className="set-sub-failed" role="alert" data-provider={provider}>
                <span>{t('setSubLogoutFailed')}</span>
              </div>
            ) : (
              failed[provider] && (
                <div className="set-sub-failed" role="alert" data-provider={provider}>
                  <span>
                    {t(
                      failed[provider] === 'install' ? 'setSubInstallFailed' : 'setSubLoginFailed',
                    )}
                  </span>
                  <button
                    type="button"
                    className="set-link"
                    onClick={() => connection.openInstallHelp(provider)}
                  >
                    {aiSubscriptionText(lang, 'actionInstallHelp')}
                  </button>
                </div>
              )
            )}
          </Fragment>
        ))}
      </div>
      <h4 className="set-pane-subtitle set-sub-title free-ai-title" id="set-free-ai">
        {t('setFreeTitle')}
      </h4>
      <div className="set-field-desc set-ai-note">{t('setFreeDesc')}</div>
      <FreeAiCards t={t} />
      {settings && <LocalAiSection t={t} settings={settings} onApply={change} />}
      {settings && (
        <>
          <div className="set-field" data-ai-use="">
            <div className="set-field-text">
              <div className="set-field-stack">
                <label className="set-field-label">{t('setAiUse')}</label>
                <div className="set-field-desc">{t('setAiUseDesc')}</div>
              </div>
            </div>
            <Dropdown
              className="set-dd"
              value={aiSelectionValue(settings)}
              ariaLabel={t('setAiUse')}
              options={choices.map((choice) => ({
                value: choice.value,
                label: choiceLabel(choice, t, lang),
                disabled: choice.unavailable,
              }))}
              onPick={(value) => {
                const choice = choices.find((c) => c.value === value)
                if (choice) change((current) => withAiSelection(current, choice))
              }}
            />
          </div>
          {blocked && (
            <div
              className="set-field-desc set-ai-note"
              data-ai-blocked={running?.connected ? '' : running?.reason}
            >
              {aiSubscriptionText(lang, blocked.titleKey, { provider: blocked.providerName ?? '' })}
            </div>
          )}
          {running?.connected && running.metered && <AiMeteredWarning lang={lang} />}
          {codexSelectable && <AiCodexNotice lang={lang} />}
          <div className="set-field">
            <div className="set-field-text">
              <label className="set-field-label">{t('setAiNotice')}</label>
            </div>
            <button
              className="set-btn"
              aria-expanded={noticeOpen}
              onClick={() => setNoticeOpen((open) => !open)}
            >
              {noticeOpen ? aiSubscriptionText(lang, 'actionDismiss') : t('setAiNoticeView')}
            </button>
          </div>
          {noticeOpen && (
            <AiFirstConnectionNotice
              lang={lang}
              codexKeepsHistory={CODEX_MAY_KEEP_HISTORY}
              sendsWholeDocument
            />
          )}
        </>
      )}
      <button
        type="button"
        className="set-adv-toggle"
        aria-expanded={advancedOpen}
        onClick={() => setAdvancedOpen((open) => !open)}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M3 1.5 7 5 3 8.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {t('setAiAdvanced')}
      </button>
      <div className="set-field-desc">{t('setAiAdvancedDesc')}</div>
      {advancedOpen && (
        <>
          {settings && (
            <div className="set-field set-field-top">
              <div className="set-field-text">
                <div className="set-field-stack">
                  <div className="set-field-label">{t('setAiHeadless')}</div>
                  <div className="set-field-desc">{t('setAiHeadlessDesc')}</div>
                  {headlessOn && (
                    <div className="set-field-desc set-adv-warning">
                      {t('setAiHeadlessWarning')}
                    </div>
                  )}
                </div>
              </div>
              <button
                className="set-switch"
                role="switch"
                aria-checked={headlessOn}
                aria-label={t('setAiHeadless')}
                onClick={() => {
                  if (headlessOn) {
                    change((current) => withHeadlessSubscription(current, false))
                  } else {
                    // turning it on goes through the warning first
                    setHeadlessAsked(true)
                  }
                }}
              />
            </div>
          )}
          {headlessAsked && !headlessOn && (
            <div className="set-adv-confirm" role="alertdialog" aria-label={t('setAiHeadless')}>
              <div className="set-field-desc set-adv-warning">{t('setAiHeadlessWarning')}</div>
              <div className="set-btn-row">
                <button className="set-btn" onClick={() => setHeadlessAsked(false)}>
                  {t('cancel')}
                </button>
                <button
                  className="set-btn danger"
                  onClick={() => {
                    setHeadlessAsked(false)
                    change((current) => withHeadlessSubscription(current, true))
                  }}
                >
                  {t('setAiHeadlessConfirm')}
                </button>
              </div>
            </div>
          )}
          {settings && (
            <ReadUrlTokenField
              t={t}
              token={readUrlGithubToken(settings)}
              onSave={(token) => change((current) => withReadUrlGithubToken(current, token))}
            />
          )}
          <div className="set-adv-tabs" role="tablist" aria-label={t('setAiAdvanced')}>
            {(['model', 'media'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={`set-adv-tab${tab === id ? ' active' : ''}`}
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {t(id === 'model' ? 'setSecAiModel' : 'setSecAiMedia')}
              </button>
            ))}
          </div>
          {advanced(tab)}
        </>
      )}
    </>
  )
}
