import { describe, expect, it } from 'vitest'
import {
  defaultAiSettings,
  selectAiProvider,
  type AiRunErrorKind,
  type AiSettings,
  type AiSubscriptionProviderId,
  type AiSubscriptionState,
  type AiSubscriptionStatus,
  type AiSubscriptionUsage,
} from '@genoffice/ai-provider'
import { LANGS } from '@genoffice/i18n'
import {
  AI_BLOCKED_RUN_KINDS,
  AI_SUBSCRIPTION_INSTALL_HELP_URLS,
  AI_SUBSCRIPTION_USAGE_THRESHOLD,
  aiConnectPromptView,
  aiContinueOption,
  aiProviderDisplayName,
  aiRunErrorText,
  aiSubscriptionCardView,
  aiSubscriptionProviderName,
  aiSubscriptionStatusOf,
  aiSubscriptionUsageAlerts,
  aiSubscriptionUsageLabel,
  aiSubscriptionUsageText,
  aiSubscriptionVendorName,
  aiUsagePercent,
  formatAiResetTime,
  isAiBlockedRunKind,
} from '../src/ai-subscription'

const status = (
  provider: AiSubscriptionProviderId,
  state: AiSubscriptionState,
  extra: Partial<AiSubscriptionStatus> = {},
): AiSubscriptionStatus => ({ provider, state, meteredAccepted: false, ...extra })

function acceptedMetered(provider: AiSubscriptionProviderId): {
  settings: AiSettings
  status: AiSubscriptionStatus
} {
  const settings = defaultAiSettings()
  settings.meteredAccepted = { [provider]: true }
  return { settings, status: status(provider, 'metered', { meteredAccepted: true }) }
}

describe('provider names', () => {
  it('names the subscription providers in plain text, without the CLI product name', () => {
    expect(aiSubscriptionProviderName('claude-code')).toBe('Claude')
    expect(aiSubscriptionProviderName('codex')).toBe('Codex')
    expect(aiSubscriptionVendorName('claude-code')).toBe('Anthropic')
    expect(aiSubscriptionVendorName('codex')).toBe('OpenAI')
  })

  it('falls back to the catalog label for key providers and to "AI" for none', () => {
    expect(aiProviderDisplayName('codex')).toBe('Codex')
    expect(aiProviderDisplayName('gemini')).toBe('Gemini')
    expect(aiProviderDisplayName(undefined)).toBe('AI')
  })

  it('points the install help at each vendor’s own pages', () => {
    expect(AI_SUBSCRIPTION_INSTALL_HELP_URLS['claude-code']).toMatch(
      /^https:\/\/code\.claude\.com\//,
    )
    expect(AI_SUBSCRIPTION_INSTALL_HELP_URLS.codex).toMatch(/^https:\/\/developers\.openai\.com\//)
  })
})

describe('aiSubscriptionCardView', () => {
  it('checking: only says so', () => {
    expect(aiSubscriptionCardView(status('claude-code', 'checking'))).toEqual({
      provider: 'claude-code',
      state: 'checking',
      tone: 'neutral',
      statusKey: 'cardChecking',
      noteKeys: [],
      actions: [],
      links: [],
    })
  })

  it('not-installed: install button, what it runs, and the official instructions', () => {
    expect(aiSubscriptionCardView(status('codex', 'not-installed'))).toEqual({
      provider: 'codex',
      state: 'not-installed',
      tone: 'neutral',
      statusKey: 'cardNotInstalled',
      noteKeys: ['installNote', 'installReturnNote'],
      actions: ['install', 'install-help'],
      links: ['install-help'],
    })
  })

  it('signed-out: login button', () => {
    const view = aiSubscriptionCardView(status('claude-code', 'signed-out'))
    expect(view.statusKey).toBe('cardSignedOut')
    // what pressing it does comes first, whose page it opens after
    expect(view.noteKeys).toEqual(['loginHowNote', 'loginNote'])
    expect(view.actions).toEqual(['login'])
    expect(view.links).toEqual([])
  })

  it('ready: connected, with the plan name when the CLI gave one', () => {
    expect(aiSubscriptionCardView(status('claude-code', 'ready'))).toEqual({
      provider: 'claude-code',
      state: 'ready',
      tone: 'ok',
      statusKey: 'cardReady',
      planName: undefined,
      noteKeys: [],
      actions: [],
      links: [],
    })
    const named = aiSubscriptionCardView(status('claude-code', 'ready', { planName: ' max ' }))
    expect(named.statusKey).toBe('cardReadyPlan')
    expect(named.planName).toBe('max')
  })

  it('metered: cost warning, what accepting means, and "use anyway"', () => {
    expect(aiSubscriptionCardView(status('codex', 'metered'))).toEqual({
      provider: 'codex',
      state: 'metered',
      tone: 'warning',
      statusKey: 'cardMetered',
      noteKeys: ['meteredWarning', 'meteredMeaning'],
      actions: ['accept-metered'],
      links: [],
    })
  })

  it('metered and accepted: the warning stays, the choice is gone', () => {
    const view = aiSubscriptionCardView(status('codex', 'metered', { meteredAccepted: true }))
    expect(view.statusKey).toBe('cardMeteredAccepted')
    expect(view.noteKeys).toEqual(['meteredWarning'])
    expect(view.actions).toEqual([])
  })

  describe('the account (Settings card only)', () => {
    const signedIn = { planName: 'max', account: 'user@example.com' }

    it('is not part of the view unless the card asks for it', () => {
      const view = aiSubscriptionCardView(status('claude-code', 'ready', signedIn))
      expect(view.account).toBeUndefined()
      expect(view.statusKey).toBe('cardReadyPlan')
      expect(view.actions).toEqual([])
      expect(JSON.stringify(view)).not.toContain('user@example.com')
    })

    it('is shown next to the plan name, which then leaves the state line', () => {
      const view = aiSubscriptionCardView(status('claude-code', 'ready', signedIn), {
        account: true,
      })
      expect(view.account).toBe('user@example.com')
      expect(view.planName).toBe('max')
      expect(view.statusKey).toBe('cardReady')
      // without an account the plan stays where it was
      const noAccount = aiSubscriptionCardView(status('codex', 'ready', { planName: 'plus' }), {
        account: true,
      })
      expect(noAccount.account).toBeUndefined()
      expect(noAccount.statusKey).toBe('cardReadyPlan')
    })

    it('is shown for a metered login too, and for no state without a login', () => {
      const metered = aiSubscriptionCardView(
        status('codex', 'metered', { account: 'user@example.com' }),
        { account: true },
      )
      expect(metered.account).toBe('user@example.com')
      for (const state of ['checking', 'not-installed', 'signed-out', 'error'] as const) {
        const view = aiSubscriptionCardView(
          status('codex', state, { account: 'user@example.com' }),
          { account: true, accountActions: true },
        )
        expect(view.account, state).toBeUndefined()
        expect(view.actions, state).not.toContain('logout')
        expect(view.actions, state).not.toContain('switch-account')
      }
    })

    it('offers "sign in with another account" and "sign out" while signed in, after any other action', () => {
      const options = { accountActions: true }
      expect(aiSubscriptionCardView(status('claude-code', 'ready'), options).actions).toEqual([
        'switch-account',
        'logout',
      ])
      expect(aiSubscriptionCardView(status('codex', 'metered'), options).actions).toEqual([
        'accept-metered',
        'switch-account',
        'logout',
      ])
      expect(
        aiSubscriptionCardView(status('codex', 'metered', { meteredAccepted: true }), options)
          .actions,
      ).toEqual(['switch-account', 'logout'])
      expect(aiSubscriptionCardView(status('codex', 'signed-out'), options).actions).toEqual([
        'login',
      ])
    })
  })

  it('error: a sentence chosen by the kind of failure and a re-check button', () => {
    expect(
      aiSubscriptionCardView(
        status('claude-code', 'error', {
          error: 'needs-update: The Claude Code program is too old',
        }),
      ),
    ).toEqual({
      provider: 'claude-code',
      state: 'error',
      tone: 'error',
      statusKey: 'cardError',
      noteKeys: [],
      detailKey: 'cardErrNeedsUpdate',
      actions: ['recheck'],
      links: [],
    })
    const keyOf = (error?: string) =>
      aiSubscriptionCardView(status('codex', 'error', error === undefined ? {} : { error }))
        .detailKey
    expect(keyOf('timeout: The status check did not answer')).toBe('cardErrTimeout')
    expect(keyOf('failed: spawn C:\\Users\\me\\codex.exe ENOENT')).toBe('cardErrFailed')
    // a text without a known kind, or no text at all, is a plain failure
    expect(keyOf('Program update needed')).toBe('cardErrFailed')
    expect(keyOf('')).toBe('cardErrFailed')
    expect(keyOf()).toBe('cardErrFailed')
  })

  it('error: a Claude below the floor gets the version found, the floor and the update command', () => {
    const view = aiSubscriptionCardView(
      status('claude-code', 'error', {
        version: '2.1.237',
        error: 'needs-update: Claude Code 2.1.237 is too old; version 2.1.248 or newer is required',
      }),
    )
    expect(view.detailKey).toBe('cardErrNeedsUpdateVersion')
    expect(view.detailParams).toEqual({
      version: '2.1.237',
      minimum: '2.1.248',
      command: 'claude update',
    })
    // a Codex too old to know the subcommand has no floor to name
    const codex = aiSubscriptionCardView(
      status('codex', 'error', { version: '0.1.0', error: 'needs-update: too old' }),
    )
    expect(codex.detailKey).toBe('cardErrNeedsUpdate')
    expect(codex.detailParams).toBeUndefined()
    // ... but the file it ran is still a fact about the error, without the
    // Claude-only WSL/update-command hint
    const codexPathed = aiSubscriptionCardView(
      status('codex', 'error', {
        version: '0.1.0',
        error: 'needs-update: too old',
        programPath:
          'C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Packages\\OpenAI.Codex_x\\codex.exe',
      }),
    )
    expect(codexPathed.programPath).toBe(
      'C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Packages\\OpenAI.Codex_x\\codex.exe',
    )
    expect(codexPathed.pathNoteKeys).toBeUndefined()
  })

  it('error: a Claude below the floor names the file the check ran, with the WSL hint on Windows', () => {
    const outdated = status('claude-code', 'error', {
      version: '2.1.114',
      error: 'needs-update: Claude Code 2.1.114 is too old; version 2.1.248 or newer is required',
      programPath: 'C:\\Users\\me\\AppData\\Roaming\\npm\\claude.exe',
    })
    const windows = aiSubscriptionCardView(outdated)
    expect(windows.programPath).toBe('C:\\Users\\me\\AppData\\Roaming\\npm\\claude.exe')
    expect(windows.pathNoteKeys).toEqual(['cardErrNeedsUpdateWindows'])
    const elsewhere = aiSubscriptionCardView(outdated, { terminalWindows: false })
    expect(elsewhere.programPath).toBe(windows.programPath)
    expect(elsewhere.pathNoteKeys).toBeUndefined()
    // no path without a version below the floor to go with it
    const failed = aiSubscriptionCardView({ ...outdated, error: 'failed: spawn' })
    expect(failed.programPath).toBeUndefined()
    expect(failed.pathNoteKeys).toBeUndefined()
    // the update button keeps the file and its hint beside it
    const updatable = aiSubscriptionCardView(outdated, { update: true })
    expect(updatable.programPath).toBe(windows.programPath)
    expect(updatable.pathNoteKeys).toEqual(['cardErrNeedsUpdateWindows'])
    expect(updatable.actions).toEqual(['update', 'recheck'])
    expect(updatable.noteKeys).toEqual(['updateNote'])
  })

  it('error: the status text itself is never part of the view', () => {
    const raw = 'failed: spawn C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd ENOENT'
    const view = aiSubscriptionCardView(status('codex', 'error', { error: raw }))
    expect(JSON.stringify(view)).not.toContain('ENOENT')
    expect(JSON.stringify(view)).not.toContain('spawn')
  })

  it('a browser sign-in under way: where to sign in, and the way to the window for a code', () => {
    expect(
      aiSubscriptionCardView(status('claude-code', 'signed-out', { signingIn: 'browser' })),
    ).toEqual({
      provider: 'claude-code',
      state: 'signed-out',
      tone: 'neutral',
      statusKey: 'cardSigningIn',
      noteKeys: ['signingInBrowserNote'],
      actions: ['login-window'],
      links: ['login-window'],
    })
  })

  it('the window open for a code: what to do in it, and nothing to press', () => {
    expect(aiSubscriptionCardView(status('codex', 'signed-out', { signingIn: 'window' }))).toEqual({
      provider: 'codex',
      state: 'signed-out',
      tone: 'neutral',
      statusKey: 'cardSigningIn',
      noteKeys: ['signingInWindowNote'],
      actions: [],
      links: [],
    })
  })

  it('a browser sign-in that goes on too long lifts the window out of the links, and says why', () => {
    const view = aiSubscriptionCardView(
      status('claude-code', 'signed-out', { signingIn: 'browser' }),
      {
        signingInStalled: true,
      },
    )
    expect(view.noteKeys).toEqual(['signingInBrowserNote', 'signingInStalledNote'])
    expect(view.actions).toEqual(['login-window'])
    expect(view.links).toEqual([])
    // with no window to open there is nothing to lift, and nothing to explain
    const elsewhere = aiSubscriptionCardView(
      status('claude-code', 'signed-out', { signingIn: 'browser' }),
      { signingInStalled: true, terminalWindows: false },
    )
    expect(elsewhere.noteKeys).toEqual(['signingInBrowserNote'])
    expect(elsewhere.actions).toEqual([])
  })

  it('a sign-in under way can be called off, as a link, when the host can end it', () => {
    const browser = aiSubscriptionCardView(
      status('claude-code', 'signed-out', { signingIn: 'browser' }),
      { cancelLogin: true },
    )
    expect(browser.actions).toEqual(['login-window', 'cancel-login'])
    expect(browser.links).toEqual(['login-window', 'cancel-login'])
    const window = aiSubscriptionCardView(status('codex', 'signed-out', { signingIn: 'window' }), {
      cancelLogin: true,
    })
    expect(window.actions).toEqual(['cancel-login'])
    expect(window.links).toEqual(['cancel-login'])
    // nothing under way: nothing to call off
    expect(
      aiSubscriptionCardView(status('codex', 'signed-out'), { cancelLogin: true }).actions,
    ).toEqual(['login'])
  })

  it('a program below the floor gets an update button first, where the host can run it', () => {
    const outdated = status('codex', 'error', { version: '0.1.0', error: 'needs-update: too old' })
    const view = aiSubscriptionCardView(outdated, { update: true })
    expect(view.actions).toEqual(['update', 'recheck'])
    expect(view.noteKeys).toEqual(['updateNote'])
    expect(view.links).toEqual([])
    expect(view.detailKey).toBe('cardErrNeedsUpdate')
    // no host support, or no terminal window: the card stays as it was
    expect(aiSubscriptionCardView(outdated).actions).toEqual(['recheck'])
    expect(
      aiSubscriptionCardView(outdated, { update: true, terminalWindows: false }).actions,
    ).toEqual(['recheck'])
    // another failure is not fixed by an update
    expect(
      aiSubscriptionCardView(status('codex', 'error', { error: 'timeout: no answer' }), {
        update: true,
      }).actions,
    ).toEqual(['recheck'])
  })

  it('a sign-in with another account under way hides the account and its actions', () => {
    const view = aiSubscriptionCardView(
      status('claude-code', 'ready', { account: 'a@example.com', signingIn: 'browser' }),
      { account: true, accountActions: true },
    )
    expect(view.account).toBeUndefined()
    expect(view.statusKey).toBe('cardSigningIn')
    expect(view.actions).toEqual(['login-window'])
  })

  describe('where the app cannot open a terminal window (macOS, Linux)', () => {
    const noWindows = { terminalWindows: false }

    it('not-installed: only the official instructions, no install button or its note', () => {
      expect(aiSubscriptionCardView(status('codex', 'not-installed'), noWindows)).toEqual({
        provider: 'codex',
        state: 'not-installed',
        tone: 'neutral',
        statusKey: 'cardNotInstalled',
        noteKeys: [],
        actions: ['install-help'],
        links: ['install-help'],
      })
    })

    it('a browser sign-in under way: where to sign in, with no window to open', () => {
      const view = aiSubscriptionCardView(
        status('claude-code', 'signed-out', { signingIn: 'browser' }),
        noWindows,
      )
      expect(view.noteKeys).toEqual(['signingInBrowserNote'])
      expect(view.actions).toEqual([])
    })

    it('the other states read the same as on Windows', () => {
      for (const state of ['signed-out', 'ready', 'metered', 'error', 'checking'] as const) {
        expect(aiSubscriptionCardView(status('codex', state), noWindows)).toEqual(
          aiSubscriptionCardView(status('codex', state)),
        )
      }
    })
  })

  it('reads a provider that has not reported yet as checking', () => {
    expect(aiSubscriptionStatusOf({}, 'codex')).toEqual({
      provider: 'codex',
      state: 'checking',
      meteredAccepted: false,
    })
    const known = status('codex', 'ready')
    expect(aiSubscriptionStatusOf({ codex: known }, 'codex')).toBe(known)
  })
})

describe('aiConnectPromptView', () => {
  it('is absent while a provider can run', () => {
    const choice = selectAiProvider(defaultAiSettings(), {
      'claude-code': status('claude-code', 'signed-out'),
      codex: status('codex', 'ready'),
    })
    expect(aiConnectPromptView(choice)).toBeNull()
  })

  it('offers both subscriptions under the automatic selection', () => {
    expect(aiConnectPromptView(selectAiProvider(defaultAiSettings(), {}))).toEqual({
      titleKey: 'connectTitle',
      bodyKey: 'connectBody',
      providers: ['claude-code', 'codex'],
      settings: false,
      // with nothing connected, the free connections are the other way in
      free: true,
    })
  })

  it('offers only the selected subscription: a selection is never replaced', () => {
    const settings = { ...defaultAiSettings(), provider: 'codex' as const }
    const choice = selectAiProvider(settings, {
      'claude-code': status('claude-code', 'ready'),
      codex: status('codex', 'signed-out'),
    })
    expect(aiConnectPromptView(choice)).toEqual({
      titleKey: 'connectProviderTitle',
      providerName: 'Codex',
      providers: ['codex'],
      settings: false,
      free: false,
    })
  })

  it('sends an unfinished key provider to the settings page', () => {
    const settings = { ...defaultAiSettings(), provider: 'gemini' as const }
    expect(aiConnectPromptView(selectAiProvider(settings, {}))).toEqual({
      titleKey: 'connectProviderTitle',
      bodyKey: 'connectKeyBody',
      providerName: 'Gemini',
      providers: [],
      settings: true,
      free: false,
    })
  })
})

describe('aiContinueOption', () => {
  it('offers the other subscription when it is ready', () => {
    const statuses = {
      'claude-code': status('claude-code', 'ready'),
      codex: status('codex', 'ready'),
    }
    expect(aiContinueOption(defaultAiSettings(), statuses, 'claude-code')).toEqual({
      provider: 'codex',
      metered: false,
    })
    expect(aiContinueOption(defaultAiSettings(), statuses, 'codex')).toEqual({
      provider: 'claude-code',
      metered: false,
    })
  })

  it('never offers the provider the run was blocked on', () => {
    // a rate-limited subscription still reports `ready`
    expect(
      aiContinueOption(
        defaultAiSettings(),
        { 'claude-code': status('claude-code', 'ready') },
        'claude-code',
      ),
    ).toBeNull()
  })

  it('offers an accepted metered login with a cost note when nothing else can run', () => {
    const { settings, status: codex } = acceptedMetered('codex')
    expect(
      aiContinueOption(
        settings,
        { 'claude-code': status('claude-code', 'ready'), codex },
        'claude-code',
      ),
    ).toEqual({ provider: 'codex', metered: true })
  })

  it('prefers a ready subscription over an accepted metered login', () => {
    const { settings, status: claude } = acceptedMetered('claude-code')
    expect(
      aiContinueOption(settings, { 'claude-code': claude, codex: status('codex', 'ready') }),
    ).toEqual({ provider: 'codex', metered: false })
  })

  it('does not offer a metered login the user has not accepted', () => {
    expect(
      aiContinueOption(
        defaultAiSettings(),
        { 'claude-code': status('claude-code', 'ready'), codex: status('codex', 'metered') },
        'claude-code',
      ),
    ).toBeNull()
  })

  it('never offers a key provider', () => {
    const settings = defaultAiSettings()
    settings.providers.anthropic = { apiKey: 'k', model: 'claude-next' }
    settings.providers.openai = { apiKey: 'k', model: 'gpt-x' }
    expect(
      aiContinueOption(
        settings,
        { 'claude-code': status('claude-code', 'ready'), codex: status('codex', 'signed-out') },
        'claude-code',
      ),
    ).toBeNull()
    expect(aiContinueOption(settings, {})).toBeNull()
  })

  it('knows which run errors mean the connection cannot go on', () => {
    for (const kind of AI_BLOCKED_RUN_KINDS) expect(isAiBlockedRunKind(kind)).toBe(true)
    for (const kind of ['timeout', 'credits', 'network', 'overloaded', 'headless-limit', undefined])
      expect(isAiBlockedRunKind(kind)).toBe(false)
  })
})

describe('aiRunErrorText', () => {
  // local noon, so the reset below stays on the same calendar day in any time zone
  const now = new Date(2026, 9, 13, 12, 0).getTime()
  const resetsAt = new Date(2026, 9, 13, 17, 10).getTime()
  const time = formatAiResetTime('en', resetsAt, now)

  it('words every kind of the subscription contract in English', () => {
    expect(aiRunErrorText('en', { kind: 'not-connected' })).toBe(
      'No AI is connected. Connect a Claude or Codex subscription, or a free AI, first.',
    )
    expect(aiRunErrorText('en', { kind: 'not-installed', provider: 'codex' })).toBe(
      'The Codex program was not found on this PC.',
    )
    expect(aiRunErrorText('en', { kind: 'signed-out', provider: 'claude-code' })).toBe(
      'The Claude sign-in has expired. Sign in again to continue.',
    )
    expect(aiRunErrorText('en', { kind: 'rate-limit', provider: 'claude-code' })).toBe(
      'The Claude subscription limit has been used up.',
    )
    expect(
      aiRunErrorText('en', { kind: 'rate-limit', provider: 'claude-code', resetsAt }, now),
    ).toBe(`The Claude subscription limit has been used up. It resets at ${time}.`)
    expect(aiRunErrorText('en', { kind: 'unsafe-tools' })).toBe(
      'The Claude program started with its own tools turned on, so the run was stopped for safety.',
    )
    expect(aiRunErrorText('en', { kind: 'metered-not-accepted', provider: 'codex' })).toBe(
      'The Codex connection is a pay-as-you-go login that you have not allowed yet. Choose "Use anyway" in the connection settings to use it.',
    )
    expect(aiRunErrorText('en', { kind: 'needs-update', provider: 'codex' })).toBe(
      'The Codex program is too old for this feature. Update it and try again.',
    )
    expect(aiRunErrorText('en', { kind: 'headless-limit' })).toBe(
      'The hourly limit for automatic requests has been reached.',
    )
    expect(aiRunErrorText('en', { kind: 'headless-limit', resetsAt }, now)).toBe(
      `The hourly limit for automatic requests has been reached. Requests are possible again at ${time}.`,
    )
    expect(aiRunErrorText('en', { kind: 'free-limit' })).toBe(
      "Today's free allowance is used up. Try again tomorrow, or choose another AI in Settings.",
    )
    expect(aiRunErrorText('en', { kind: 'free-limit', resetsAt }, now)).toBe(
      `Today's free allowance is used up. You can use it again at ${time}.`,
    )
  })

  it('words them in Korean', () => {
    const koTime = formatAiResetTime('ko', resetsAt, now)
    expect(aiRunErrorText('ko', { kind: 'signed-out', provider: 'codex' })).toBe(
      'Codex 로그인이 풀렸습니다. 다시 로그인한 뒤 계속하세요.',
    )
    expect(
      aiRunErrorText('ko', { kind: 'rate-limit', provider: 'claude-code', resetsAt }, now),
    ).toBe(`Claude 구독 한도를 모두 썼습니다. ${koTime}에 초기화됩니다.`)
  })

  it('leaves the kinds each editor already words to the editor', () => {
    for (const kind of ['timeout', 'credits', 'network', 'overloaded'] as const)
      expect(aiRunErrorText('en', { kind })).toBeUndefined()
  })

  it('has a filled-in message for every new kind in every language', () => {
    const kinds: AiRunErrorKind[] = [
      'not-connected',
      'not-installed',
      'signed-out',
      'rate-limit',
      'unsafe-tools',
      'metered-not-accepted',
      'needs-update',
      'headless-limit',
    ]
    for (const lang of LANGS) {
      for (const kind of kinds) {
        for (const cause of [
          { kind, provider: 'codex' as const },
          { kind, provider: 'codex' as const, resetsAt },
          { kind },
        ]) {
          const text = aiRunErrorText(lang, cause, now)
          expect(text, `${lang}:${kind}`).toBeTruthy()
          // every placeholder was filled
          expect(text, `${lang}:${kind}`).not.toMatch(/[{}]/)
        }
      }
      // the provider and the reset time actually reach the sentence
      expect(aiRunErrorText(lang, { kind: 'signed-out', provider: 'codex' }), lang).toContain(
        'Codex',
      )
      expect(
        aiRunErrorText(lang, { kind: 'rate-limit', provider: 'claude-code', resetsAt }, now),
        lang,
      ).toContain(formatAiResetTime(lang, resetsAt, now))
    }
  })

  it('ignores a reset time that is not a number', () => {
    expect(aiRunErrorText('en', { kind: 'rate-limit', provider: 'codex', resetsAt: NaN })).toBe(
      'The Codex subscription limit has been used up.',
    )
  })
})

describe('formatAiResetTime', () => {
  const now = new Date(2026, 9, 13, 12, 0).getTime()

  it('shows the clock time for a reset later today', () => {
    const at = new Date(2026, 9, 13, 17, 10)
    expect(formatAiResetTime('en', at.getTime(), now)).toBe(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(at),
    )
  })

  it('adds the date once the reset is on another day', () => {
    const at = new Date(2026, 9, 18, 9, 0)
    const text = formatAiResetTime('en', at.getTime(), now)
    expect(text).toBe(
      new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(at),
    )
    expect(text).toContain('18')
  })
})

describe('subscription usage', () => {
  const now = new Date(2026, 9, 13, 12, 0).getTime()
  const resetsAt = new Date(2026, 9, 13, 17, 10).getTime()
  const usage = (
    provider: AiSubscriptionProviderId,
    window: AiSubscriptionUsage['window'],
    utilization: number,
  ): AiSubscriptionUsage => ({ provider, window, utilization, resetsAt })

  it('defaults the threshold to 80%', () => {
    expect(AI_SUBSCRIPTION_USAGE_THRESHOLD).toBe(0.8)
  })

  it('shows nothing below the threshold and the window from the threshold on', () => {
    expect(aiSubscriptionUsageAlerts([usage('claude-code', 'five_hour', 0.79)])).toEqual([])
    expect(aiSubscriptionUsageAlerts([usage('claude-code', 'five_hour', 0.8)])).toHaveLength(1)
    expect(aiSubscriptionUsageAlerts([])).toEqual([])
  })

  it('shows only the windows that crossed it', () => {
    const alerts = aiSubscriptionUsageAlerts([
      usage('claude-code', 'five_hour', 0.14),
      usage('claude-code', 'seven_day', 0.91),
    ])
    expect(alerts.map((a) => a.window)).toEqual(['seven_day'])
  })

  it('takes a tunable threshold', () => {
    const reported = [usage('codex', 'five_hour', 0.6)]
    expect(aiSubscriptionUsageAlerts(reported, 0.5)).toHaveLength(1)
    expect(aiSubscriptionUsageAlerts(reported, 0.95)).toEqual([])
  })

  it('keeps the latest report per window, Claude first and the short window first', () => {
    const alerts = aiSubscriptionUsageAlerts([
      usage('codex', 'seven_day', 0.9),
      usage('claude-code', 'seven_day', 0.85),
      usage('claude-code', 'five_hour', 0.82),
      usage('codex', 'seven_day', 0.97),
    ])
    expect(alerts.map((a) => [a.provider, a.window, a.utilization])).toEqual([
      ['claude-code', 'five_hour', 0.82],
      ['claude-code', 'seven_day', 0.85],
      ['codex', 'seven_day', 0.97],
    ])
  })

  it('drops a window whose latest report fell back under the threshold', () => {
    expect(
      aiSubscriptionUsageAlerts([
        usage('claude-code', 'five_hour', 0.95),
        usage('claude-code', 'five_hour', 0.02),
      ]),
    ).toEqual([])
  })

  it('formats "N% used · resets at <time>"', () => {
    const time = formatAiResetTime('en', resetsAt, now)
    expect(aiSubscriptionUsageText('en', usage('claude-code', 'five_hour', 0.834), now)).toBe(
      `83% used · resets at ${time}`,
    )
    expect(aiSubscriptionUsageText('ko', usage('claude-code', 'five_hour', 0.8), now)).toBe(
      `80% 사용 · ${formatAiResetTime('ko', resetsAt, now)}에 초기화`,
    )
    expect(aiUsagePercent(1.4)).toBe(100)
    expect(aiUsagePercent(-1)).toBe(0)
  })

  it('names the window a line is about', () => {
    expect(aiSubscriptionUsageLabel('en', usage('claude-code', 'five_hour', 0.9))).toBe(
      'Claude · 5-hour limit',
    )
    expect(aiSubscriptionUsageLabel('en', usage('codex', 'seven_day', 0.9))).toBe(
      'Codex · 7-day limit',
    )
  })
})
