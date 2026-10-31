import { describe, expect, it } from 'vitest'
import {
  defaultAiSettings,
  type AiSettings,
  type AiSubscriptionProviderId,
  type AiSubscriptionState,
  type AiSubscriptionStatus,
  type AiSubscriptionStatuses,
  type AiSubscriptionUsage,
} from '@genoffice/ai-provider'
import {
  aiHoldReason,
  aiSendGate,
  withAiContinueProvider,
  withAiSubscriptionNoticeSeen,
} from '@genoffice/ui'
import {
  blockedRunFor,
  blockedRunOf,
  mergeSubscriptionUsage,
  writerMayRetry,
} from '../src/renderer/ai/connection'

const status = (
  provider: AiSubscriptionProviderId,
  state: AiSubscriptionState,
  extra: Partial<AiSubscriptionStatus> = {},
): AiSubscriptionStatus => ({ provider, state, meteredAccepted: false, ...extra })

const statuses = (
  claude: AiSubscriptionState,
  codex: AiSubscriptionState,
): AiSubscriptionStatuses => ({
  'claude-code': status('claude-code', claude),
  codex: status('codex', codex),
})

const settings = (patch: Partial<AiSettings> = {}): AiSettings => ({
  ...defaultAiSettings(),
  subscriptionNoticeSeen: true,
  ...patch,
})

// The gate itself is the one every editor shares (@genoffice/ui); these pin it on the
// settings and statuses the html panel hands it.
describe('the send gate', () => {
  it('holds a request while the settings have not been read', () => {
    const gate = aiSendGate(null, statuses('ready', 'ready'))
    expect(gate.kind).toBe('checking')
    expect(aiHoldReason(gate)).toBe('checking')
  })

  it('holds a request while a status check has not reported', () => {
    expect(aiSendGate(settings(), {}).kind).toBe('checking')
    expect(aiSendGate(settings(), statuses('checking', 'checking')).kind).toBe('checking')
    expect(aiSendGate(settings(), statuses('not-installed', 'checking')).kind).toBe('checking')
    expect(aiSendGate(settings({ provider: 'codex' }), statuses('ready', 'checking')).kind).toBe(
      'checking',
    )
  })

  it('shows the connect prompt instead of sending when no subscription is connected', () => {
    const gate = aiSendGate(settings(), statuses('not-installed', 'signed-out'))
    expect(gate.kind).toBe('connect')
    expect(aiHoldReason(gate)).toBeNull()
    if (gate.kind !== 'connect') throw new Error('unreachable')
    expect(gate.choice.selection).toBe('auto')
    expect(gate.choice.provider).toBeUndefined()
  })

  it('never falls back from an explicit selection that cannot run', () => {
    const gate = aiSendGate(settings({ provider: 'claude-code' }), statuses('signed-out', 'ready'))
    expect(gate.kind).toBe('connect')
    if (gate.kind !== 'connect') throw new Error('unreachable')
    expect(gate.choice.provider).toBe('claude-code')
    expect(gate.choice.reason).toBe('signed-out')
  })

  it('does not pick a configured key provider under the automatic selection', () => {
    const base = settings()
    const withKey = settings({
      providers: { ...base.providers, openai: { apiKey: 'sk-test', model: 'gpt-test' } },
    })
    expect(aiSendGate(withKey, statuses('not-installed', 'not-installed')).kind).toBe('connect')
  })

  it('runs on Claude first, then Codex, under the automatic selection', () => {
    const both = aiSendGate(settings(), statuses('ready', 'ready'))
    expect(both).toMatchObject({ kind: 'run', choice: { provider: 'claude-code' } })
    const codexOnly = aiSendGate(settings({ meteredAccepted: { 'claude-code': true } }), {
      'claude-code': status('claude-code', 'metered', { meteredAccepted: true }),
      codex: status('codex', 'ready'),
    })
    expect(codexOnly).toMatchObject({ kind: 'run', choice: { provider: 'codex' } })
  })

  it('holds the first request on a subscription until the notice was acknowledged', () => {
    const unseen = settings({ subscriptionNoticeSeen: false })
    const gate = aiSendGate(unseen, statuses('ready', 'not-installed'))
    expect(gate.kind).toBe('notice')
    expect(aiHoldReason(gate)).toBe('notice')
    const acknowledged = aiSendGate(
      withAiSubscriptionNoticeSeen(unseen),
      statuses('ready', 'not-installed'),
    )
    expect(acknowledged.kind).toBe('run')
  })

  it('runs a selected, configured key provider without the subscription notice', () => {
    const base = settings({ subscriptionNoticeSeen: false })
    const keyed = {
      ...base,
      provider: 'openai' as const,
      providers: { ...base.providers, openai: { apiKey: 'sk-test', model: 'gpt-test' } },
    }
    expect(aiSendGate(keyed, {})).toMatchObject({
      kind: 'run',
      choice: { provider: 'openai', metered: false },
    })
  })

  it('sends a selected key provider that is not filled in to the connect prompt', () => {
    const base = settings()
    const gate = aiSendGate(
      {
        ...base,
        provider: 'openai',
        providers: { ...base.providers, openai: { apiKey: '', model: '' } },
      },
      statuses('ready', 'ready'),
    )
    expect(gate).toMatchObject({ kind: 'connect', choice: { reason: 'not-configured' } })
  })
})

describe('blocked runs', () => {
  it('keeps the cause of a run whose connection cannot go on', () => {
    expect(
      blockedRunOf({
        kind: 'rate-limit',
        provider: 'claude-code',
        resetsAt: 1_700_000_000_000,
        message: 'limit used up',
      }),
    ).toEqual({
      kind: 'rate-limit',
      provider: 'claude-code',
      resetsAt: 1_700_000_000_000,
      message: 'limit used up',
    })
    for (const kind of [
      'signed-out',
      'not-installed',
      'needs-update',
      'metered-not-accepted',
      'unsafe-tools',
      'not-connected',
    ] as const) {
      expect(blockedRunOf({ kind, message: 'm' })).toEqual({ kind, message: 'm' })
    }
  })

  it('leaves transient failures and plain errors to the ordinary error line', () => {
    for (const kind of ['timeout', 'network', 'overloaded', 'credits'] as const) {
      expect(blockedRunOf({ kind, message: 'm' })).toBeNull()
    }
    expect(blockedRunOf({ message: 'provider said no' })).toBeNull()
    expect(blockedRunOf(null)).toBeNull()
  })

  it('ignores a cause that belongs to an earlier stream', () => {
    const cause = { kind: 'signed-out', provider: 'codex', message: 'signed out' } as const
    expect(blockedRunFor('signed out', cause)).toMatchObject({ kind: 'signed-out' })
    expect(blockedRunFor('tool arguments were malformed', cause)).toBeNull()
    expect(blockedRunFor('signed out', null)).toBeNull()
  })

  it('does not let a writer retry on a blocked connection', () => {
    expect(writerMayRetry({ kind: 'rate-limit', provider: 'codex', message: 'm' })).toBe(false)
    expect(writerMayRetry({ kind: 'not-connected', message: 'm' })).toBe(false)
    expect(writerMayRetry({ kind: 'network', message: 'm' })).toBe(true)
    expect(writerMayRetry({ message: '(empty stream)' })).toBe(true)
    expect(writerMayRetry(null)).toBe(true)
  })
})

describe('settings changes made from the panel', () => {
  it('stores the provider of "continue with" as the selection, on the model it had', () => {
    const base = settings({ provider: 'claude-code' })
    const before = {
      ...base,
      providers: { ...base.providers, codex: { ...base.providers.codex, model: 'gpt-codex' } },
    }
    const next = withAiContinueProvider(before, 'codex')
    expect(next.provider).toBe('codex')
    expect(next.providers.codex.model).toBe('gpt-codex')
    expect(next.providers['claude-code']).toEqual(before.providers['claude-code'])
    expect(before.provider).toBe('claude-code')
  })

  it('remembers the acknowledged notice without touching anything else', () => {
    const before = settings({ subscriptionNoticeSeen: false, provider: 'codex' })
    const next = withAiSubscriptionNoticeSeen(before)
    expect(next).toEqual({
      ...before,
      subscriptionNoticeSeen: true,
      subscriptionNoticeVersion: 2,
    })
    expect(before.subscriptionNoticeSeen).toBe(false)
  })
})

describe('mergeSubscriptionUsage', () => {
  const usage = (
    provider: AiSubscriptionProviderId,
    window: AiSubscriptionUsage['window'],
    utilization: number,
    resetsAt: number,
  ): AiSubscriptionUsage => ({ provider, window, utilization, resetsAt })

  it('keeps the latest report per provider and window', () => {
    const merged = mergeSubscriptionUsage(
      [usage('claude-code', 'five_hour', 0.5, 2000), usage('claude-code', 'seven_day', 0.9, 9000)],
      [usage('claude-code', 'five_hour', 0.85, 2500), usage('codex', 'five_hour', 0.2, 3000)],
      1000,
    )
    expect(merged).toEqual([
      usage('claude-code', 'five_hour', 0.85, 2500),
      usage('claude-code', 'seven_day', 0.9, 9000),
      usage('codex', 'five_hour', 0.2, 3000),
    ])
  })

  it('drops a window whose reset time has passed', () => {
    expect(mergeSubscriptionUsage([usage('codex', 'five_hour', 0.95, 500)], [], 1000)).toEqual([])
  })
})
