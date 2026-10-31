import { describe, expect, it } from 'vitest'
import {
  GEMINI_FREE_MODEL,
  OPENROUTER_FREE_MODELS,
  freeAiConnectResultOf,
  freeAiConnected,
  freeAiQuotaOf,
  freeLimitOf,
  isFreeTierModelRefusal,
  keyProviderModels,
  nextPacificMidnight,
  withFreeAiConnection,
  withoutFreeAiConnection,
} from '../src/free-ai'
import { aiStreamErrorFields } from '../src/run-error'
import { defaultAiSettings } from '../src/providers'
import { selectAiProvider } from '../src/provider-selection'

const OPENROUTER_DAILY_BODY =
  'HTTP 429: {"error":{"message":"Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day","code":429,"metadata":{"headers":{"X-RateLimit-Limit":"50","X-RateLimit-Remaining":"0","X-RateLimit-Reset":"1760486400000"},"provider_name":null}}}'

const GEMINI_DAILY_BODY =
  'Gemini HTTP 429: {"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED","details":[{"violations":[{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}'

const GEMINI_MINUTE_BODY =
  'Gemini HTTP 429: {"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"violations":[{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]}]}}'

describe('free connection settings', () => {
  it('counts OpenRouter as the free connection only on a free model', () => {
    const settings = defaultAiSettings()
    settings.providers.openrouter = { apiKey: 'sk-or-v1-x', model: 'openrouter/auto' }
    expect(freeAiConnected(settings, 'openrouter')).toBe(false)
    settings.providers.openrouter.model = OPENROUTER_FREE_MODELS[0]!
    expect(freeAiConnected(settings, 'openrouter')).toBe(true)
    settings.providers.openrouter.apiKey = ''
    expect(freeAiConnected(settings, 'openrouter')).toBe(false)
  })

  it('counts Gemini as connected once a key is stored', () => {
    const settings = defaultAiSettings()
    expect(freeAiConnected(settings, 'gemini')).toBe(false)
    settings.providers.gemini.apiKey = 'AIza-test-key'
    expect(freeAiConnected(settings, 'gemini')).toBe(true)
  })

  it('makes a connected provider the AI in use, and a removed one falls back to auto', () => {
    const connected = withFreeAiConnection(defaultAiSettings(), 'gemini', {
      apiKey: 'AIza-test-key',
      model: GEMINI_FREE_MODEL,
    })
    expect(connected.provider).toBe('gemini')
    expect(connected.providers.gemini).toMatchObject({
      apiKey: 'AIza-test-key',
      model: GEMINI_FREE_MODEL,
    })
    expect(selectAiProvider(connected, {})).toMatchObject({ connected: true, provider: 'gemini' })

    const removed = withoutFreeAiConnection(connected, 'gemini')
    expect(removed.provider).toBe('auto')
    expect(removed.providers.gemini.apiKey).toBe('')
    // removing another provider's connection leaves the selection alone
    expect(withoutFreeAiConnection(connected, 'openrouter').provider).toBe('gemini')
  })

  it('lists only free models for an OpenRouter free connection', () => {
    const free = keyProviderModels('openrouter', OPENROUTER_FREE_MODELS[1]!)
    expect(free).toEqual([...OPENROUTER_FREE_MODELS])
    expect(free.every((m) => m.endsWith(':free'))).toBe(true)
    // a free model that dropped off the tested list stays selectable
    expect(keyProviderModels('openrouter', 'acme/new-model:free')[0]).toBe('acme/new-model:free')
    // a paid OpenRouter setup keeps the paid catalog
    expect(keyProviderModels('openrouter', 'openrouter/auto')).toContain('openrouter/auto')
    expect(
      keyProviderModels('openrouter', 'openrouter/auto').some((m) => m.endsWith(':free')),
    ).toBe(false)
  })

  it("adds the vendor's live list after the catalog, keeping the stored model listed", () => {
    const models = keyProviderModels('gemini', 'gemini-3.8-flash', [
      'gemini-4.1-flash',
      'gemini-4-argon',
      'gemini-3.8-flash',
    ])
    // the catalog first, in its order; then what only the live list has
    expect(models.slice(0, 2)).toEqual(['gemini-3.8-flash', 'gemini-4-argon'])
    expect(models.at(-1)).toBe('gemini-4.1-flash')
    expect(models.filter((m) => m === 'gemini-4-argon')).toHaveLength(1)
    // a typed id neither list has stays at the top
    expect(keyProviderModels('gemini', 'gemini-5-preview', ['gemini-4.1-flash'])[0]).toBe(
      'gemini-5-preview',
    )
    // a stored list that is not a list of ids is ignored
    expect(keyProviderModels('gemini', '', 'junk' as never)).toEqual(
      keyProviderModels('gemini', ''),
    )
  })

  it('never adds paid models to an OpenRouter free connection', () => {
    expect(
      keyProviderModels('openrouter', OPENROUTER_FREE_MODELS[0]!, ['anthropic/claude-opus-6']),
    ).toEqual([...OPENROUTER_FREE_MODELS])
  })

  it('reads IPC answers defensively', () => {
    expect(freeAiConnectResultOf({ ok: true, provider: 'gemini', model: 'm' })).toEqual({
      ok: true,
      provider: 'gemini',
      model: 'm',
    })
    expect(freeAiConnectResultOf({ ok: true, provider: 'claude-code', model: 'm' })).toEqual({
      ok: false,
      reason: 'network',
    })
    expect(freeAiConnectResultOf({ ok: false, reason: 'denied' })).toEqual({
      ok: false,
      reason: 'denied',
    })
    expect(freeAiConnectResultOf(null)).toEqual({ ok: false, reason: 'network' })
    expect(freeAiQuotaOf({ used: 9, limit: 50, remaining: 41 })).toEqual({
      used: 9,
      limit: 50,
      remaining: 41,
    })
    expect(freeAiQuotaOf({ used: -1, limit: 50, remaining: 41 })).toBeNull()
    expect(freeAiQuotaOf('x')).toBeNull()
  })
})

describe('the daily free limit', () => {
  const now = Date.UTC(2025, 9, 14, 12, 0, 0)

  it("recognizes OpenRouter's per-day free limit and its reset time", () => {
    expect(freeLimitOf(new Error(OPENROUTER_DAILY_BODY), now)).toEqual({ resetsAt: 1760486400000 })
    // a reset time already past is not shown
    expect(freeLimitOf(new Error(OPENROUTER_DAILY_BODY), 1760486400001)).toEqual({})
  })

  it("recognizes Gemini's per-day free-tier quota and resets it at midnight Pacific time", () => {
    const limit = freeLimitOf(new Error(GEMINI_DAILY_BODY), now)
    expect(limit?.resetsAt).toBe(nextPacificMidnight(now))
    // 12:00 UTC on 14 Oct 2025 is 05:00 PDT; the next midnight PDT is 07:00 UTC on the 15th
    expect(nextPacificMidnight(now)).toBe(Date.UTC(2025, 9, 15, 7, 0, 0))
  })

  it('leaves per-minute limits and busy answers to the overload path', () => {
    expect(freeLimitOf(new Error(GEMINI_MINUTE_BODY), now)).toBeNull()
    expect(freeLimitOf(new Error('Gemini HTTP 503: high demand'), now)).toBeNull()
    expect(aiStreamErrorFields(new Error(GEMINI_MINUTE_BODY))).toEqual({ errorCode: 'overloaded' })
  })

  it('tells a model the free tier does not serve from a used-up allowance', () => {
    // Gemini's answer to a Pro model on a free key: the same quota, with no allowance at all
    const body =
      'Gemini HTTP 429: {"error":{"code":429,"message":"You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-4-argon","status":"RESOURCE_EXHAUSTED","details":[{"violations":[{"quotaMetric":"generativelanguage.googleapis.com/generate_content_free_tier_requests","quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}'
    expect(isFreeTierModelRefusal(new Error(body))).toBe(true)
    // not "come back after midnight": waiting would not help
    expect(freeLimitOf(new Error(body), now)).toBeNull()
    expect(aiStreamErrorFields(new Error(body))).toEqual({ errorCode: 'free-tier-model' })
    // a quota of 10 used up is the daily limit, not this
    expect(isFreeTierModelRefusal(new Error(GEMINI_DAILY_BODY))).toBe(false)
    expect(
      isFreeTierModelRefusal(new Error(GEMINI_DAILY_BODY.replace('quota"', 'quota, limit: 10"'))),
    ).toBe(false)
  })

  it('reports the used-up allowance as its own error kind', () => {
    expect(aiStreamErrorFields(new Error(GEMINI_DAILY_BODY))).toMatchObject({
      errorCode: 'free-limit',
    })
    const fields = aiStreamErrorFields(new Error(OPENROUTER_DAILY_BODY))
    expect(fields.errorCode).toBe('free-limit')
  })
})
