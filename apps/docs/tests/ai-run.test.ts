// The rules behind the shared ai:* handlers (docs, pdf, markdown, html): which
// provider a request runs on, what a refusal carries, and how failures, usage
// and a cut input reach the renderer. Nothing here starts a provider.
import { describe, expect, it } from 'vitest'
import {
  AiRunError,
  HEADLESS_SUBSCRIPTION_CONSENT_VERSION,
  defaultAiSettings,
  normalizeAiSettings,
  sanitizeAiSettings,
  type AiSettings,
  type AiStreamChunk,
  type AiSubscriptionState,
  type AiSubscriptionStatus,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider'
import {
  AI_INVALID_SETTINGS_ERROR,
  aiChatFailure,
  aiStreamErrorChunk,
  resolveAiRun,
  subscriptionStreamCallbacks,
  withMeteredAccepted,
  withStoredSubscriptionOff,
  withSubscriptionOff,
  type AiRunTexts,
} from '../src/main/ai-run'

const TEXTS: AiRunTexts = {
  noApiKey: (provider) => `no key for ${provider}`,
  noModel: () => 'no model',
}

function status(
  provider: 'claude-code' | 'codex',
  state: AiSubscriptionState,
  meteredAccepted = false,
): AiSubscriptionStatus {
  return { provider, state, meteredAccepted }
}

function settings(patch: Partial<AiSettings> = {}): AiSettings {
  return { ...defaultAiSettings(), ...patch }
}

function withKey(base: AiSettings, provider: 'openai' | 'anthropic'): AiSettings {
  return {
    ...base,
    providers: { ...base.providers, [provider]: { apiKey: 'sk-test', model: 'some-model' } },
  }
}

const BOTH_READY: AiSubscriptionStatuses = {
  'claude-code': status('claude-code', 'ready'),
  codex: status('codex', 'ready'),
}

describe('resolveAiRun', () => {
  it('refuses a settings payload that fails the schema check', () => {
    const target = resolveAiRun({ provider: 'nope' }, BOTH_READY, TEXTS)
    expect(target).toEqual({ ok: false, refusal: { error: AI_INVALID_SETTINGS_ERROR } })
  })

  it('auto runs on Claude when both subscriptions are ready', () => {
    const target = resolveAiRun(settings(), BOTH_READY, TEXTS)
    expect(target.ok && target.provider).toBe('claude-code')
    expect(target.ok && target.metered).toBe(false)
  })

  it('auto runs on Codex when only Codex is ready', () => {
    const target = resolveAiRun(
      settings(),
      { 'claude-code': status('claude-code', 'signed-out'), codex: status('codex', 'ready') },
      TEXTS,
    )
    expect(target.ok && target.provider).toBe('codex')
  })

  it('auto with nothing connected answers not-connected and names no provider', () => {
    const target = resolveAiRun(settings(), {}, TEXTS)
    expect(target.ok).toBe(false)
    if (target.ok) return
    expect(target.refusal.errorCode).toBe('not-connected')
    expect(target.refusal.errorProvider).toBeUndefined()
    expect(target.refusal.error).toBeTruthy()
  })

  it('auto never lands on a configured key provider', () => {
    const target = resolveAiRun(withKey(settings(), 'openai'), {}, TEXTS)
    expect(target.ok).toBe(false)
    if (!target.ok) expect(target.refusal.errorCode).toBe('not-connected')
  })

  it('auto skips an accepted metered login and takes the ready subscription', () => {
    const target = resolveAiRun(
      settings({ meteredAccepted: { 'claude-code': true } }),
      { 'claude-code': status('claude-code', 'metered', true), codex: status('codex', 'ready') },
      TEXTS,
    )
    expect(target.ok && target.provider).toBe('codex')
  })

  it('auto does not use an accepted metered login when nothing else is ready', () => {
    const target = resolveAiRun(
      settings({ meteredAccepted: { 'claude-code': true } }),
      { 'claude-code': status('claude-code', 'metered', true) },
      TEXTS,
    )
    expect(target.ok).toBe(false)
  })

  it('a request naming a selection this build does not know is refused, not rerouted', () => {
    // a renderer reads normalised settings, so it never sends such an id; a file on disk
    // that still holds one reads as auto (see "stored settings" below)
    const target = resolveAiRun(
      settings({ provider: 'retired-provider' as never }),
      BOTH_READY,
      TEXTS,
    )
    expect(target).toEqual({ ok: false, refusal: { error: AI_INVALID_SETTINGS_ERROR } })
  })

  it('a selected subscription that is signed out is reported, never replaced', () => {
    const target = resolveAiRun(
      settings({ provider: 'codex' }),
      { 'claude-code': status('claude-code', 'ready'), codex: status('codex', 'signed-out') },
      TEXTS,
    )
    expect(target.ok).toBe(false)
    if (target.ok) return
    expect(target.refusal.errorCode).toBe('signed-out')
    expect(target.refusal.errorProvider).toBe('codex')
  })

  it('a selected subscription whose program is missing answers not-installed', () => {
    const target = resolveAiRun(
      settings({ provider: 'claude-code' }),
      { 'claude-code': status('claude-code', 'not-installed') },
      TEXTS,
    )
    expect(!target.ok && target.refusal).toMatchObject({
      errorCode: 'not-installed',
      errorProvider: 'claude-code',
    })
  })

  it('a selected metered login runs only once the user accepted it', () => {
    const metered = { 'claude-code': status('claude-code', 'metered') }
    const refused = resolveAiRun(settings({ provider: 'claude-code' }), metered, TEXTS)
    expect(!refused.ok && refused.refusal).toMatchObject({
      errorCode: 'metered-not-accepted',
      errorProvider: 'claude-code',
    })

    const accepted = resolveAiRun(
      settings({ provider: 'claude-code', meteredAccepted: { 'claude-code': true } }),
      { 'claude-code': status('claude-code', 'metered', true) },
      TEXTS,
    )
    expect(accepted.ok && accepted.metered).toBe(true)
  })

  it('a stored acceptance alone does not start a metered run', () => {
    const target = resolveAiRun(
      settings({ provider: 'codex', meteredAccepted: { codex: true } }),
      { codex: status('codex', 'metered', false) },
      TEXTS,
    )
    expect(target.ok).toBe(false)
  })

  it('a selected key provider runs with its own config', () => {
    const target = resolveAiRun(withKey(settings({ provider: 'openai' }), 'openai'), {}, TEXTS)
    expect(target.ok && target.provider).toBe('openai')
    expect(target.ok && target.config).toMatchObject({ apiKey: 'sk-test', model: 'some-model' })
  })

  it('a selected key provider that is not filled in is refused with the localized text', () => {
    const base = settings({ provider: 'openai' })
    const noKey = resolveAiRun(
      { ...base, providers: { ...base.providers, openai: { apiKey: '', model: 'some-model' } } },
      BOTH_READY,
      TEXTS,
    )
    expect(noKey.ok).toBe(false)
    if (noKey.ok) return
    // a key provider is not a subscription: the cause names none
    expect(noKey.refusal).toEqual({ error: 'no key for openai', errorCode: 'not-connected' })

    const noModel = resolveAiRun(
      { ...base, providers: { ...base.providers, openai: { apiKey: 'sk-test', model: '' } } },
      BOTH_READY,
      TEXTS,
    )
    expect(!noModel.ok && noModel.refusal.error).toBe('no model')
  })

  it('hands back the normalised settings of the request', () => {
    const target = resolveAiRun({ ...settings(), retiredSwitch: false }, BOTH_READY, TEXTS)
    expect(target.ok && target.settings.provider).toBe('auto')
    expect(target.ok && 'retiredSwitch' in target.settings).toBe(false)
  })
})

describe('stream chunks', () => {
  it('forwards subscription usage and a cut input as their own chunk types', () => {
    const sent: AiStreamChunk[] = []
    const callbacks = subscriptionStreamCallbacks('r1', (chunk) => sent.push(chunk))
    const usage = [
      {
        provider: 'claude-code' as const,
        window: 'five_hour' as const,
        utilization: 0.9,
        resetsAt: 5,
      },
    ]
    callbacks.onSubscriptionUsage(usage)
    callbacks.onInputTruncated()
    expect(sent).toEqual([
      { requestId: 'r1', type: 'subscription-usage', subscriptionUsage: usage },
      { requestId: 'r1', type: 'input-truncated' },
    ])
  })

  it('carries the cause, provider and reset time of a run error', () => {
    const chunk = aiStreamErrorChunk(
      'r2',
      new AiRunError('rate-limit', 'limit reached', { provider: 'codex', resetsAt: 1234 }),
    )
    expect(chunk).toEqual({
      requestId: 'r2',
      type: 'error',
      error: 'limit reached',
      errorCode: 'rate-limit',
      errorProvider: 'codex',
      errorResetsAt: 1234,
    })
  })

  it('leaves an error without a machine-readable cause as plain text', () => {
    expect(aiStreamErrorChunk('r3', new Error('boom'))).toEqual({
      requestId: 'r3',
      type: 'error',
      error: 'boom',
    })
    expect(aiStreamErrorChunk('r4', 'text only').error).toBe('text only')
  })

  it('maps the existing error classes to their codes', () => {
    expect(aiStreamErrorChunk('r5', new Error('HTTP 529: overloaded')).errorCode).toBe('overloaded')
  })
})

describe('aiChatFailure', () => {
  it('keeps the busy text for a capacity failure and the cause for a run error', () => {
    expect(aiChatFailure(new Error('HTTP 529: overloaded'), () => 'busy')).toMatchObject({
      ok: false,
      error: 'busy',
      errorCode: 'overloaded',
    })
    expect(
      aiChatFailure(
        new AiRunError('signed-out', 'expired', { provider: 'claude-code' }),
        () => 'busy',
      ),
    ).toMatchObject({ ok: false, errorCode: 'signed-out', errorProvider: 'claude-code' })
  })
})

describe('stored settings', () => {
  it('a legacy file reads as the new defaults without the switch that was removed', () => {
    const read = normalizeAiSettings({
      provider: 'retired-provider',
      providers: defaultAiSettings().providers,
      retiredSwitch: false,
    })
    expect(read.provider).toBe('auto')
    expect('retiredSwitch' in read).toBe(false)
    expect(read.meteredAccepted).toEqual({ 'claude-code': false, codex: false })
    expect(read.subscriptionNoticeSeen).toBe(false)
  })

  it('an explicit subscription selection survives a read', () => {
    expect(normalizeAiSettings(settings({ provider: 'claude-code' })).provider).toBe('claude-code')
    expect(normalizeAiSettings(settings({ provider: 'codex' })).provider).toBe('codex')
  })

  it('the save guard keeps the fields of the subscription contract', () => {
    const saved = sanitizeAiSettings({
      ...settings(),
      provider: 'auto',
      meteredAccepted: { codex: true },
      headlessSubscriptionEnabled: true,
      headlessSubscriptionConsentVersion: HEADLESS_SUBSCRIPTION_CONSENT_VERSION,
      subscriptionNoticeSeen: true,
    })
    expect(saved).toMatchObject({
      provider: 'auto',
      meteredAccepted: { codex: true },
      headlessSubscriptionEnabled: true,
      headlessSubscriptionConsentVersion: HEADLESS_SUBSCRIPTION_CONSENT_VERSION,
      subscriptionNoticeSeen: true,
    })
  })

  it('records and withdraws "use anyway" per provider', () => {
    const accepted = withMeteredAccepted(settings({ provider: 'codex' }), 'codex', true)
    expect(accepted.provider).toBe('codex')
    expect(accepted.meteredAccepted).toEqual({ 'claude-code': false, codex: true })

    const both = withMeteredAccepted(accepted, 'claude-code', true)
    expect(both.meteredAccepted).toEqual({ codex: true, 'claude-code': true })

    const withdrawn = withMeteredAccepted(both, 'codex', false)
    expect(withdrawn.meteredAccepted).toEqual({ codex: false, 'claude-code': true })
  })

  it('recording an answer on a legacy file also drops the removed switch', () => {
    const next = withMeteredAccepted(
      {
        provider: 'retired-provider',
        providers: defaultAiSettings().providers,
        retiredSwitch: true,
      },
      'codex',
      true,
    )
    expect(next.provider).toBe('auto')
    expect('retiredSwitch' in next).toBe(false)
    expect(next.meteredAccepted?.codex).toBe(true)
  })

  it('an empty or missing file still yields a complete settings object to write', () => {
    const next = withMeteredAccepted({}, 'claude-code', true)
    expect(next.provider).toBe('auto')
    expect(next.providers.codex).toBeDefined()
    expect(next.meteredAccepted).toEqual({ 'claude-code': true, codex: false })
    // what was written reads back the same way
    expect(normalizeAiSettings(JSON.parse(JSON.stringify(next))).meteredAccepted).toEqual(
      next.meteredAccepted,
    )
  })
})

describe('a CLI turned off in this app (decision 0114)', () => {
  it('a request on it is refused with its own cause, and auto runs on the other one', () => {
    const off = settings({ provider: 'claude-code', subscriptionOff: { 'claude-code': true } })
    const target = resolveAiRun(off, BOTH_READY, TEXTS)
    expect(target).toMatchObject({
      ok: false,
      refusal: { errorCode: 'off-in-app', errorProvider: 'claude-code' },
    })
    const auto = resolveAiRun({ ...off, provider: 'auto' }, BOTH_READY, TEXTS)
    expect(auto.ok && auto.provider).toBe('codex')
  })

  it('a status the main process reports as off refuses it even when the window did not know', () => {
    const target = resolveAiRun(
      settings({ provider: 'codex' }),
      { 'claude-code': status('claude-code', 'ready'), codex: status('codex', 'off') },
      TEXTS,
    )
    expect(target).toMatchObject({ ok: false, refusal: { errorCode: 'off-in-app' } })
  })

  it('turns one off and back on in the stored file, leaving the rest as it was', () => {
    const stored = withMeteredAccepted(settings({ provider: 'codex' }), 'codex', true)
    const off = withSubscriptionOff(stored, 'claude-code', true)
    expect(off.subscriptionOff).toEqual({ 'claude-code': true })
    expect(off.provider).toBe('codex')
    expect(off.meteredAccepted?.codex).toBe(true)
    const both = withSubscriptionOff(off, 'codex', true)
    expect(both.subscriptionOff).toEqual({ 'claude-code': true, codex: true })
    const on = withSubscriptionOff(withSubscriptionOff(both, 'codex', false), 'claude-code', false)
    expect('subscriptionOff' in on).toBe(false)
    expect(normalizeAiSettings(JSON.parse(JSON.stringify(off))).subscriptionOff).toEqual({
      'claude-code': true,
    })
  })

  it('a window saving an older copy neither turns a CLI on nor off', () => {
    const stored = settings({ subscriptionOff: { codex: true } })
    const stale = sanitizeAiSettings(settings({ provider: 'openai' }))!
    expect(withStoredSubscriptionOff(stale, stored).subscriptionOff).toEqual({ codex: true })
    const planted = sanitizeAiSettings(settings({ subscriptionOff: { 'claude-code': true } }))!
    expect('subscriptionOff' in withStoredSubscriptionOff(planted, settings())).toBe(false)
  })
})
