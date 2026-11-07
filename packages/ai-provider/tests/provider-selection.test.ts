/**
 * Which provider an AI request runs on. The product promise is "your
 * subscription, no extra cost", so `auto` may only ever land on a subscription
 * that is signed in as a subscription: never on an API key and never on a
 * metered CLI login, even one the user accepted. Those run only when the user
 * selected them, and a selected provider that stopped working must surface as
 * "not connected" instead of quietly moving the conversation elsewhere.
 */
import { describe, expect, it } from 'vitest'
import {
  AI_SUBSCRIPTION_PROVIDERS,
  isKeyProviderConfigured,
  isSubscriptionProvider,
  selectAiProvider,
  subscriptionConnection,
  subscriptionStateOf,
} from '../src/provider-selection'
import { defaultAiSettings } from '../src/providers'
import type {
  AiProviderSelection,
  AiSettings,
  AiSubscriptionState,
  AiSubscriptionStatus,
  AiSubscriptionStatuses,
} from '../src/types'

function status(
  provider: AiSubscriptionStatus['provider'],
  state: AiSubscriptionState,
  extra: Partial<AiSubscriptionStatus> = {},
): AiSubscriptionStatus {
  return {
    provider,
    state,
    meteredAccepted: false,
    ...(state === 'ready' ? { loginMethod: 'subscription' as const } : {}),
    ...(state === 'metered' ? { loginMethod: 'metered' as const } : {}),
    ...extra,
  }
}

function statuses(
  claude: AiSubscriptionState,
  codex: AiSubscriptionState,
  extra: {
    claude?: Partial<AiSubscriptionStatus>
    codex?: Partial<AiSubscriptionStatus>
    /** the direct ChatGPT connection; signed out unless a test says otherwise */
    chatgpt?: AiSubscriptionState
  } = {},
): AiSubscriptionStatuses {
  return {
    'claude-code': status('claude-code', claude, extra.claude),
    chatgpt: status('chatgpt', extra.chatgpt ?? 'signed-out'),
    codex: status('codex', codex, extra.codex),
  }
}

function settingsWith(provider: AiProviderSelection, patch: Partial<AiSettings> = {}): AiSettings {
  return { ...defaultAiSettings(), provider, ...patch }
}

/** an accepted metered login: the stored acceptance plus the status that confirms it still applies */
const accepted = { meteredAccepted: true }

describe('selectAiProvider with auto', () => {
  it('is the default selection', () => {
    expect(defaultAiSettings().provider).toBe('auto')
  })

  it('picks Claude when Claude is ready', () => {
    expect(selectAiProvider(settingsWith('auto'), statuses('ready', 'signed-out'))).toEqual({
      connected: true,
      provider: 'claude-code',
      metered: false,
    })
  })

  it('picks Claude when both subscriptions are ready', () => {
    expect(selectAiProvider(settingsWith('auto'), statuses('ready', 'ready'))).toEqual({
      connected: true,
      provider: 'claude-code',
      metered: false,
    })
  })

  it('picks Codex when only Codex is ready', () => {
    for (const claude of ['not-installed', 'signed-out', 'metered', 'error'] as const) {
      expect(selectAiProvider(settingsWith('auto'), statuses(claude, 'ready'))).toEqual({
        connected: true,
        provider: 'codex',
        metered: false,
      })
    }
  })

  // the two status checks answer at different times: "not known yet" is not "not ready"
  it('does not decide for Codex while the Claude check has not answered', () => {
    const pending = {
      connected: false,
      selection: 'auto',
      reason: 'no-subscription',
      errorKind: 'not-connected',
    }
    expect(selectAiProvider(settingsWith('auto'), statuses('checking', 'ready'))).toEqual(pending)
    expect(selectAiProvider(settingsWith('auto'), { codex: status('codex', 'ready') })).toEqual(
      pending,
    )
  })

  it('picks Codex once the Claude check answered signed out', () => {
    expect(selectAiProvider(settingsWith('auto'), statuses('signed-out', 'ready'))).toEqual({
      connected: true,
      provider: 'codex',
      metered: false,
    })
  })

  it('picks the ready Claude without waiting for the Codex check', () => {
    const claude = { connected: true, provider: 'claude-code', metered: false }
    expect(selectAiProvider(settingsWith('auto'), statuses('ready', 'checking'))).toEqual(claude)
    expect(
      selectAiProvider(settingsWith('auto'), { 'claude-code': status('claude-code', 'ready') }),
    ).toEqual(claude)
  })

  it('picks ChatGPT ahead of Codex when both are ready, and Claude ahead of both', () => {
    const chatgpt = { connected: true, provider: 'chatgpt', metered: false }
    expect(
      selectAiProvider(settingsWith('auto'), statuses('signed-out', 'ready', { chatgpt: 'ready' })),
    ).toEqual(chatgpt)
    expect(
      selectAiProvider(settingsWith('auto'), statuses('ready', 'ready', { chatgpt: 'ready' })),
    ).toEqual({ connected: true, provider: 'claude-code', metered: false })
  })

  it('does not decide for Codex while the ChatGPT check has not answered', () => {
    expect(
      selectAiProvider(
        settingsWith('auto'),
        statuses('signed-out', 'ready', { chatgpt: 'checking' }),
      ),
    ).toMatchObject({ connected: false, selection: 'auto', reason: 'no-subscription' })
  })

  it('reads a ChatGPT status that is missing (not one still checking) as signed out', () => {
    // a map from where the direct connection does not exist lists the two CLIs alone
    expect(
      selectAiProvider(settingsWith('auto'), {
        'claude-code': status('claude-code', 'signed-out'),
        codex: status('codex', 'ready'),
      }),
    ).toEqual({ connected: true, provider: 'codex', metered: false })
    expect(subscriptionStateOf({}, 'chatgpt')).toBe('signed-out')
    expect(subscriptionStateOf({}, 'claude-code')).toBe('checking')
  })

  it('skips an accepted metered Claude login and picks the ready Codex', () => {
    const settings = settingsWith('auto', { meteredAccepted: { 'claude-code': true } })
    expect(selectAiProvider(settings, statuses('metered', 'ready', { claude: accepted }))).toEqual({
      connected: true,
      provider: 'codex',
      metered: false,
    })
  })

  it('reports not connected when neither subscription is ready', () => {
    expect(selectAiProvider(settingsWith('auto'), statuses('signed-out', 'not-installed'))).toEqual(
      {
        connected: false,
        selection: 'auto',
        reason: 'no-subscription',
        errorKind: 'not-connected',
      },
    )
    expect(selectAiProvider(settingsWith('auto'), {}).connected).toBe(false)
  })

  it('never picks an accepted metered login, even when it is the only connection', () => {
    const settings = settingsWith('auto', {
      meteredAccepted: { 'claude-code': true, codex: true },
    })
    const choice = selectAiProvider(
      settings,
      statuses('metered', 'metered', { claude: accepted, codex: accepted }),
    )
    expect(choice).toMatchObject({ connected: false, selection: 'auto' })
  })

  it('never picks a configured key provider', () => {
    const settings = settingsWith('auto')
    settings.providers.openai = { apiKey: 'sk-live', model: 'gpt-5.6-terra' }
    settings.providers.custom = {
      apiKey: '',
      model: 'llama3',
      baseUrl: 'http://localhost:11434/v1',
    }
    expect(isKeyProviderConfigured(settings, 'openai')).toBe(true)
    expect(selectAiProvider(settings, statuses('signed-out', 'not-installed'))).toMatchObject({
      connected: false,
      selection: 'auto',
      reason: 'no-subscription',
    })
  })
})

describe('selectAiProvider with an explicit selection', () => {
  it('honors a ready subscription even when the other one would win auto', () => {
    expect(selectAiProvider(settingsWith('codex'), statuses('ready', 'ready'))).toEqual({
      connected: true,
      provider: 'codex',
      metered: false,
    })
    expect(selectAiProvider(settingsWith('claude-code'), statuses('ready', 'ready'))).toEqual({
      connected: true,
      provider: 'claude-code',
      metered: false,
    })
  })

  it('honors an accepted metered login and flags it as costing money', () => {
    const settings = settingsWith('claude-code', { meteredAccepted: { 'claude-code': true } })
    expect(selectAiProvider(settings, statuses('metered', 'ready', { claude: accepted }))).toEqual({
      connected: true,
      provider: 'claude-code',
      metered: true,
    })
  })

  it('refuses a metered login the user has not accepted, without falling back', () => {
    expect(selectAiProvider(settingsWith('claude-code'), statuses('metered', 'ready'))).toEqual({
      connected: false,
      selection: 'claude-code',
      provider: 'claude-code',
      reason: 'metered-not-accepted',
      errorKind: 'metered-not-accepted',
    })
  })

  it('needs the stored acceptance and the status to agree before spending money', () => {
    // the stored flag outlived a login change: the status no longer confirms it
    const stale = settingsWith('codex', { meteredAccepted: { codex: true } })
    expect(selectAiProvider(stale, statuses('ready', 'metered'))).toMatchObject({
      connected: false,
      reason: 'metered-not-accepted',
    })
    // a status claiming acceptance the settings never recorded
    expect(
      selectAiProvider(settingsWith('codex'), statuses('ready', 'metered', { codex: accepted })),
    ).toMatchObject({ connected: false, reason: 'metered-not-accepted' })
  })

  it('says what an unusable subscription needs instead of falling back', () => {
    const cases = [
      ['not-installed', 'not-installed', 'not-installed'],
      ['signed-out', 'signed-out', 'signed-out'],
      ['checking', 'checking', 'not-connected'],
      ['error', 'error', 'not-connected'],
    ] as const
    for (const [state, reason, errorKind] of cases) {
      expect(selectAiProvider(settingsWith('claude-code'), statuses(state, 'ready'))).toEqual({
        connected: false,
        selection: 'claude-code',
        provider: 'claude-code',
        reason,
        errorKind,
      })
    }
  })

  it('carries the status error text so the UI can show it', () => {
    const choice = selectAiProvider(
      settingsWith('codex'),
      statuses('ready', 'error', { codex: { error: 'Program update required' } }),
    )
    expect(choice).toEqual({
      connected: false,
      selection: 'codex',
      provider: 'codex',
      reason: 'error',
      errorKind: 'not-connected',
      detail: 'Program update required',
    })
  })

  it('treats a subscription with no status yet as still being checked', () => {
    expect(selectAiProvider(settingsWith('codex'), {})).toMatchObject({
      connected: false,
      provider: 'codex',
      reason: 'checking',
    })
  })

  it('honors a configured key provider', () => {
    const settings = settingsWith('openai')
    settings.providers.openai = { apiKey: 'sk-live', model: 'gpt-5.6-terra' }
    expect(selectAiProvider(settings, statuses('ready', 'ready'))).toEqual({
      connected: true,
      provider: 'openai',
      metered: false,
    })
  })

  it('honors a custom endpoint without a key', () => {
    const settings = settingsWith('custom')
    settings.providers.custom = {
      apiKey: '',
      model: 'llama3',
      baseUrl: 'http://localhost:11434/v1',
    }
    expect(selectAiProvider(settings, {})).toMatchObject({ connected: true, provider: 'custom' })
  })

  it('does not fall back from an unconfigured key provider to a ready subscription', () => {
    expect(selectAiProvider(settingsWith('openai'), statuses('ready', 'ready'))).toEqual({
      connected: false,
      selection: 'openai',
      provider: 'openai',
      reason: 'not-configured',
      errorKind: 'not-connected',
    })
    const blank = settingsWith('openai')
    blank.providers.openai = { apiKey: '   ', model: 'gpt-5.6-terra' }
    expect(selectAiProvider(blank, statuses('ready', 'ready')).connected).toBe(false)
  })

  it('treats a removed or unknown stored id as auto', () => {
    for (const stored of ['retired-provider', 'no-such-provider', '', 42, null, undefined]) {
      const settings = settingsWith('auto')
      ;(settings as { provider: unknown }).provider = stored
      expect(selectAiProvider(settings, statuses('signed-out', 'ready'))).toEqual({
        connected: true,
        provider: 'codex',
        metered: false,
      })
      expect(selectAiProvider(settings, statuses('signed-out', 'signed-out'))).toMatchObject({
        connected: false,
        selection: 'auto',
      })
    }
  })

  it('survives settings with no provider configs at all', () => {
    const bare = { provider: 'openai' } as unknown as AiSettings
    expect(selectAiProvider(bare, {})).toMatchObject({ connected: false, reason: 'not-configured' })
  })
})

describe('subscription helpers', () => {
  it('lists the subscription providers in auto order', () => {
    expect(AI_SUBSCRIPTION_PROVIDERS).toEqual(['claude-code', 'chatgpt', 'codex'])
    expect(isSubscriptionProvider('claude-code')).toBe(true)
    expect(isSubscriptionProvider('chatgpt')).toBe(true)
    expect(isSubscriptionProvider('codex')).toBe(true)
    expect(isSubscriptionProvider('anthropic')).toBe(false)
    expect(isSubscriptionProvider('auto')).toBe(false)
  })

  it('classifies a status as a free, a paid, or no connection', () => {
    const none = settingsWith('auto')
    const paid = settingsWith('auto', { meteredAccepted: { codex: true } })
    expect(subscriptionConnection(none, status('codex', 'ready'))).toBe('subscription')
    expect(subscriptionConnection(paid, status('codex', 'metered', accepted))).toBe('metered')
    expect(subscriptionConnection(none, status('codex', 'metered', accepted))).toBeNull()
    expect(subscriptionConnection(paid, status('codex', 'metered'))).toBeNull()
    expect(subscriptionConnection(paid, status('codex', 'signed-out', accepted))).toBeNull()
    expect(subscriptionConnection(paid, undefined)).toBeNull()
  })

  it('a subscription provider is never a configured key provider', () => {
    const settings = settingsWith('auto')
    settings.providers.codex = { apiKey: 'sk-x', model: 'gpt-x', cliPath: '' }
    expect(isKeyProviderConfigured(settings, 'codex')).toBe(false)
    expect(isKeyProviderConfigured(settings, 'claude-code')).toBe(false)
    expect(isKeyProviderConfigured(settings, 'no-such-provider' as never)).toBe(false)
  })
})

describe('a CLI turned off in this app (decision 0114)', () => {
  const claudeOff = { subscriptionOff: { 'claude-code': true as const } }
  const claude = { connected: true, provider: 'claude-code', metered: false }
  const codex = { connected: true, provider: 'codex', metered: false }

  it('auto passes over it at once, without waiting for its check', () => {
    expect(selectAiProvider(settingsWith('auto'), statuses('checking', 'ready'))).toMatchObject({
      connected: false,
      reason: 'no-subscription',
    })
    expect(
      selectAiProvider(settingsWith('auto', claudeOff), statuses('checking', 'ready')),
    ).toEqual(codex)
    expect(
      selectAiProvider(settingsWith('auto', claudeOff), { codex: status('codex', 'ready') }),
    ).toEqual(codex)
  })

  it('auto does not run it on a status read before it was turned off', () => {
    expect(selectAiProvider(settingsWith('auto'), statuses('ready', 'ready'))).toEqual(claude)
    expect(selectAiProvider(settingsWith('auto', claudeOff), statuses('ready', 'ready'))).toEqual(
      codex,
    )
  })

  it('reads as off from the status alone, as the main process reports it', () => {
    expect(selectAiProvider(settingsWith('auto'), statuses('off', 'ready'))).toEqual(codex)
    expect(selectAiProvider(settingsWith('claude-code'), statuses('off', 'ready'))).toMatchObject({
      connected: false,
      provider: 'claude-code',
      reason: 'off-in-app',
      errorKind: 'off-in-app',
    })
  })

  it('an explicit selection of it reports off-in-app and does not move to another provider', () => {
    for (const claudeState of ['ready', 'checking', 'metered', 'signed-out'] as const) {
      expect(
        selectAiProvider(
          settingsWith('claude-code', { ...claudeOff, meteredAccepted: { 'claude-code': true } }),
          statuses(claudeState, 'ready', { claude: accepted }),
        ),
      ).toEqual({
        connected: false,
        selection: 'claude-code',
        provider: 'claude-code',
        reason: 'off-in-app',
        errorKind: 'off-in-app',
      })
    }
  })

  it('with every subscription off or out, auto lands on nothing that costs money', () => {
    const settings = settingsWith('auto', {
      subscriptionOff: { 'claude-code': true, codex: true },
      meteredAccepted: { codex: true },
    })
    settings.providers.openai = { apiKey: 'sk-test', model: 'gpt-4.1' }
    const choice = selectAiProvider(
      settings,
      statuses('ready', 'metered', { codex: accepted, chatgpt: 'signed-out' }),
    )
    expect(choice).toMatchObject({ connected: false, reason: 'no-subscription' })
  })

  it('leaves the other subscriptions and a selected key provider as they were', () => {
    const settings = settingsWith('openai', claudeOff)
    settings.providers.openai = { apiKey: 'sk-test', model: 'gpt-4.1' }
    expect(selectAiProvider(settings, statuses('ready', 'ready'))).toEqual({
      connected: true,
      provider: 'openai',
      metered: false,
    })
    expect(selectAiProvider(settingsWith('codex', claudeOff), statuses('ready', 'ready'))).toEqual(
      codex,
    )
  })

  it('has no switch for ChatGPT reached directly: its own sign-out is this app alone', () => {
    const settings = settingsWith('auto', {
      subscriptionOff: { chatgpt: true } as unknown as AiSettings['subscriptionOff'],
    })
    expect(
      selectAiProvider(settings, statuses('signed-out', 'ready', { chatgpt: 'ready' })),
    ).toEqual({ connected: true, provider: 'chatgpt', metered: false })
  })

  it('is no connection of any kind, whatever its status says', () => {
    const paid = settingsWith('auto', { ...claudeOff, meteredAccepted: { 'claude-code': true } })
    expect(subscriptionConnection(paid, status('claude-code', 'ready'))).toBeNull()
    expect(subscriptionConnection(paid, status('claude-code', 'metered', accepted))).toBeNull()
    expect(subscriptionConnection(settingsWith('auto'), status('claude-code', 'off'))).toBeNull()
    expect(subscriptionConnection(paid, status('codex', 'ready'))).toBe('subscription')
  })
})
