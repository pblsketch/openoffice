import { describe, expect, it } from 'vitest'
import {
  normalizeAiSettings,
  type AiSettings,
  type AiSubscriptionStatus,
  type AiSubscriptionStatuses,
  type AiSubscriptionUsage,
} from '@genoffice/ai-provider/browser'
import { aiSendGate, withAiContinueProvider, withAiSubscriptionNoticeSeen } from '@genoffice/ui'
import {
  aiBlockedRunOf,
  mergeSubscriptionUsage,
  pdfSendNoticeDue,
} from '../src/renderer/ai/ai-connection'

const settingsOf = (over: Partial<AiSettings> = {}): AiSettings => ({
  ...normalizeAiSettings({}),
  ...over,
})

const status = (
  provider: AiSubscriptionStatus['provider'],
  state: AiSubscriptionStatus['state'],
  over: Partial<AiSubscriptionStatus> = {},
): AiSubscriptionStatus => ({
  provider,
  state,
  meteredAccepted: false,
  ...(state === 'ready' ? { loginMethod: 'subscription' as const } : {}),
  ...over,
})

const READY: AiSubscriptionStatuses = {
  'claude-code': status('claude-code', 'ready'),
  codex: status('codex', 'ready'),
}

/** an API-key provider with everything it needs filled in */
const withOpenAiKey = (settings: AiSettings): AiSettings => ({
  ...settings,
  providers: {
    ...settings.providers,
    openai: { ...settings.providers.openai, apiKey: 'sk-test', model: 'gpt-test' },
  },
})

// The gate itself is the one every editor shares (@genoffice/ui); these pin it on the
// settings and statuses the pdf panel hands it.
describe('aiSendGate', () => {
  it('starts from the automatic selection', () => {
    expect(settingsOf().provider).toBe('auto')
  })

  it('refuses to send while no subscription is connected', () => {
    expect(
      aiSendGate(settingsOf(), {
        'claude-code': status('claude-code', 'signed-out'),
        codex: status('codex', 'not-installed'),
      }).kind,
    ).toBe('connect')
  })

  it('holds a send while the statuses are still being checked', () => {
    expect(aiSendGate(settingsOf(), {}).kind).toBe('checking')
    expect(
      aiSendGate(settingsOf(), {
        'claude-code': status('claude-code', 'checking'),
        codex: status('codex', 'checking'),
      }).kind,
    ).toBe('checking')
    expect(aiSendGate(null, READY).kind).toBe('checking')
  })

  it('never falls back to a configured key provider under the automatic selection', () => {
    const signedOut: AiSubscriptionStatuses = {
      'claude-code': status('claude-code', 'signed-out'),
      codex: status('codex', 'signed-out'),
    }
    expect(aiSendGate(withOpenAiKey(settingsOf()), signedOut).kind).toBe('connect')
    expect(aiSendGate(withOpenAiKey(settingsOf()), {}).kind).toBe('checking')
  })

  it('holds the first subscription request for the first-connection notice', () => {
    expect(aiSendGate(settingsOf(), READY).kind).toBe('notice')
    expect(aiSendGate(settingsOf({ provider: 'codex' }), READY).kind).toBe('notice')
  })

  it('sends once the notice was acknowledged', () => {
    expect(aiSendGate(settingsOf({ subscriptionNoticeSeen: true }), READY).kind).toBe('run')
  })

  it('sends on a selected key provider without the subscription notice', () => {
    expect(aiSendGate(withOpenAiKey(settingsOf({ provider: 'openai' })), {}).kind).toBe('run')
  })

  it('refuses a selected provider that cannot run instead of switching to another', () => {
    const statuses: AiSubscriptionStatuses = {
      'claude-code': status('claude-code', 'signed-out'),
      codex: status('codex', 'ready'),
    }
    expect(aiSendGate(settingsOf({ provider: 'claude-code' }), statuses).kind).toBe('connect')
  })

  it('refuses a metered login the user has not accepted', () => {
    const statuses: AiSubscriptionStatuses = {
      'claude-code': status('claude-code', 'metered', { loginMethod: 'metered' }),
    }
    expect(aiSendGate(settingsOf({ provider: 'claude-code' }), statuses).kind).toBe('connect')
  })
})

describe('aiBlockedRunOf', () => {
  it('keeps the cause of a run its connection cannot continue', () => {
    expect(
      aiBlockedRunOf({
        kind: 'rate-limit',
        provider: 'claude-code',
        resetsAt: 1_700_000_000_000,
        message: 'limit',
      }),
    ).toEqual({ kind: 'rate-limit', provider: 'claude-code', resetsAt: 1_700_000_000_000 })
    expect(aiBlockedRunOf({ kind: 'signed-out', provider: 'codex', message: 'x' })).toEqual({
      kind: 'signed-out',
      provider: 'codex',
    })
    expect(aiBlockedRunOf({ kind: 'not-connected', message: 'x' })).toEqual({
      kind: 'not-connected',
    })
  })

  it.each(['timeout', 'network', 'overloaded', 'credits'] as const)(
    'leaves a %s failure to the plain error line',
    (kind) => {
      expect(aiBlockedRunOf({ kind, message: 'x' })).toBeNull()
    },
  )

  it('leaves a failure without a machine-readable cause to the plain error line', () => {
    expect(aiBlockedRunOf({ message: 'HTTP 500' })).toBeNull()
    expect(aiBlockedRunOf(null)).toBeNull()
    expect(aiBlockedRunOf(undefined)).toBeNull()
  })

  it('drops a reset time that is not a number', () => {
    expect(
      aiBlockedRunOf({ kind: 'rate-limit', provider: 'codex', resetsAt: Number.NaN, message: 'x' }),
    ).toEqual({ kind: 'rate-limit', provider: 'codex' })
  })
})

describe('"continue with" settings', () => {
  it('stores the continued provider as the selection and keeps its model', () => {
    const base = settingsOf({ provider: 'claude-code' })
    const settings: AiSettings = {
      ...base,
      providers: { ...base.providers, codex: { ...base.providers.codex, model: 'gpt-x' } },
    }
    const next = withAiContinueProvider(settings, 'codex')
    expect(next.provider).toBe('codex')
    expect(next.providers.codex.model).toBe('gpt-x')
    // the provider the run was blocked on keeps its own configuration
    expect(next.providers['claude-code']).toEqual(settings.providers['claude-code'])
    expect(settings.provider).toBe('claude-code')
  })

  it('makes the continued provider the one a request runs on', () => {
    const next = withAiContinueProvider(settingsOf({ subscriptionNoticeSeen: true }), 'codex')
    expect(
      aiSendGate(next, {
        'claude-code': status('claude-code', 'signed-out'),
        codex: status('codex', 'ready'),
      }).kind,
    ).toBe('run')
  })
})

describe('acknowledged-notice settings', () => {
  it('the PDF sentence is due once even when the general notice was seen elsewhere', () => {
    expect(pdfSendNoticeDue(settingsOf({ subscriptionNoticeSeen: true }), true)).toBe(true)
    expect(pdfSendNoticeDue(settingsOf({ pdfSendNoticeSeen: 1 }), true)).toBe(false)
    // no subscription can run: nothing is about to be sent
    expect(pdfSendNoticeDue(settingsOf(), false)).toBe(false)
    expect(pdfSendNoticeDue(null, true)).toBe(true)
  })

  it('marks the general notice as seen without touching anything else', () => {
    const settings = settingsOf({ provider: 'codex' })
    const next = withAiSubscriptionNoticeSeen(settings)
    expect(next).toEqual({
      ...settings,
      subscriptionNoticeSeen: true,
      subscriptionNoticeVersion: 2,
    })
    expect(settings.subscriptionNoticeSeen).toBeFalsy()
  })
})

describe('mergeSubscriptionUsage', () => {
  const usage = (
    provider: AiSubscriptionUsage['provider'],
    window: AiSubscriptionUsage['window'],
    utilization: number,
  ): AiSubscriptionUsage => ({ provider, window, utilization, resetsAt: 1_700_000_000_000 })

  it('replaces a window that is reported again and keeps the ones it does not name', () => {
    const known = [usage('claude-code', 'five_hour', 0.5), usage('claude-code', 'seven_day', 0.2)]
    expect(mergeSubscriptionUsage(known, [usage('claude-code', 'five_hour', 0.9)])).toEqual([
      usage('claude-code', 'seven_day', 0.2),
      usage('claude-code', 'five_hour', 0.9),
    ])
  })

  it('keeps the providers apart', () => {
    const known = [usage('claude-code', 'five_hour', 0.5)]
    expect(mergeSubscriptionUsage(known, [usage('codex', 'five_hour', 0.85)])).toEqual([
      usage('claude-code', 'five_hour', 0.5),
      usage('codex', 'five_hour', 0.85),
    ])
  })

  it('takes the last value when one report names a window twice', () => {
    expect(
      mergeSubscriptionUsage(
        [],
        [usage('codex', 'seven_day', 0.1), usage('codex', 'seven_day', 0.3)],
      ),
    ).toEqual([usage('codex', 'seven_day', 0.3)])
  })

  it('does not change the list it is given', () => {
    const known = [usage('codex', 'five_hour', 0.5)]
    mergeSubscriptionUsage(known, [usage('codex', 'five_hour', 0.9)])
    expect(known).toEqual([usage('codex', 'five_hour', 0.5)])
  })
})
