/**
 * The free connections: key providers whose free tier is enough to try the app
 * without a Claude or Codex subscription. Browser-safe: what the screens show
 * and write. Getting a key (the OpenRouter browser sign-in, the Gemini key
 * check) runs in the main process (`./free-connect`).
 *
 * A free connection is an ordinary key provider. What makes it "free" is only
 * the model it runs on: OpenRouter's `:free` variants, and a Gemini model the
 * free tier serves. Nothing here selects a provider on its own; connecting is
 * a press of a button, and that press is the user's choice of the provider.
 */
import { AI_PROVIDERS, listedModelsOf } from './providers'
import type { AiProviderId, AiSettings } from './types'

/** Key providers offered as a free connection, in the order the screens list them */
export const FREE_AI_PROVIDERS = ['openrouter', 'gemini'] as const
export type FreeAiProviderId = (typeof FREE_AI_PROVIDERS)[number]

export function isFreeAiProvider(id: unknown): id is FreeAiProviderId {
  return (FREE_AI_PROVIDERS as readonly unknown[]).includes(id)
}

/**
 * OpenRouter's free models that ran the Word editor's tool loop end to end
 * (2026-10-14; the last two 2026-10-15), best first. The connection takes the
 * first one OpenRouter still lists with tool support; free variants come and go
 * without notice.
 */
export const OPENROUTER_FREE_MODELS: readonly string[] = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3.5-lightning:free',
  'dots-studio/dots-3-note-preview:free',
]

/**
 * The Gemini model a free connection starts on. The free tier refused the
 * Flash models with 503 "high demand" on most attempts while this one
 * answered every time (2026-10-14); the model picker still offers the others.
 */
export const GEMINI_FREE_MODEL = 'gemini-3.5-flash-lite'

/** Where a key for each free connection is made; opened in the system browser */
export const FREE_AI_KEY_PAGES: Record<FreeAiProviderId, string> = {
  openrouter: 'https://openrouter.ai/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
}

/** OpenRouter bills nothing for a model id with this suffix */
export function isOpenRouterFreeModel(model: string | undefined): boolean {
  return typeof model === 'string' && model.trim().endsWith(':free')
}

/**
 * Whether the free card shows the provider as connected. OpenRouter counts only
 * on a free model: a key filled in under Advanced for paid models is not the
 * free connection. Gemini has no free marker in its model ids, so a key is
 * enough.
 */
export function freeAiConnected(
  settings: Pick<AiSettings, 'providers'>,
  provider: FreeAiProviderId,
): boolean {
  const config = settings.providers?.[provider]
  if (!config?.apiKey?.trim() || !config.model?.trim()) return false
  return provider === 'openrouter' ? isOpenRouterFreeModel(config.model) : true
}

/**
 * The models a picker lists for a key provider: the fixed catalog, then what
 * the vendor listed for the key and the catalog lacks (newest first, decision
 * 0087), with the stored one kept in the list.
 */
export function keyProviderModels(
  provider: AiProviderId,
  stored: string,
  listed?: readonly string[],
): string[] {
  const model = stored.trim()
  // an OpenRouter free connection lists the free models only: picking a paid
  // one there would fail on an account without credit, or charge one with it
  const free = provider === 'openrouter' && isOpenRouterFreeModel(model)
  const catalog = free
    ? OPENROUTER_FREE_MODELS
    : (AI_PROVIDERS.find((meta) => meta.id === provider)?.models ?? [])
  const known = new Set(catalog)
  const added = free ? [] : (listedModelsOf(listed) ?? []).filter((id) => !known.has(id))
  const models = [...catalog, ...added]
  if (!model || models.includes(model)) return models
  return [model, ...models]
}

/** Settings once a free connection is made: its key and model stored, and it is the AI in use */
export function withFreeAiConnection(
  settings: AiSettings,
  provider: FreeAiProviderId,
  connection: { apiKey: string; model: string },
): AiSettings {
  return {
    ...settings,
    provider,
    providers: {
      ...settings.providers,
      [provider]: {
        ...settings.providers[provider],
        apiKey: connection.apiKey,
        model: connection.model,
      },
    },
  }
}

/**
 * Settings once a free connection is removed: the key is gone, the model is the
 * provider's default again, and a selection of it falls back to `auto`.
 */
export function withoutFreeAiConnection(
  settings: AiSettings,
  provider: FreeAiProviderId,
): AiSettings {
  const meta = AI_PROVIDERS.find((m) => m.id === provider)
  return {
    ...settings,
    provider: settings.provider === provider ? 'auto' : settings.provider,
    providers: {
      ...settings.providers,
      [provider]: {
        ...settings.providers[provider],
        apiKey: '',
        model: meta?.defaultModel ?? '',
      },
    },
  }
}

/** IPC channels of the free connections; the Word main process registers them */
export const FREE_AI_IPC_CHANNELS = {
  /** `{ provider: 'openrouter' }` starts the browser sign-in; `{ provider: 'gemini', apiKey }` checks a key */
  connect: 'ai:free-connect',
  /** stops a browser sign-in that is still waiting */
  cancel: 'ai:free-connect-cancel',
  /** `{ provider }`: forget the key; a selection of it goes back to auto */
  disconnect: 'ai:free-disconnect',
  /** `{ provider }`: today's free allowance, when the provider reports it */
  quota: 'ai:free-quota',
  /** `{ provider }`: open the page where a key is made */
  openKeyPage: 'ai:free-open-key-page',
} as const

/** Why connecting did not work, in the words the screen translates */
export type FreeAiConnectFailure = 'cancelled' | 'timeout' | 'denied' | 'invalid' | 'network'

export type FreeAiConnectResult =
  | { ok: true; provider: FreeAiProviderId; model: string }
  | { ok: false; reason: FreeAiConnectFailure }

const FAILURES: readonly FreeAiConnectFailure[] = [
  'cancelled',
  'timeout',
  'denied',
  'invalid',
  'network',
]

/** A connect answer as the renderer reads it; anything malformed is a network failure */
export function freeAiConnectResultOf(raw: unknown): FreeAiConnectResult {
  const value = (raw ?? {}) as {
    ok?: unknown
    provider?: unknown
    model?: unknown
    reason?: unknown
  }
  if (value.ok === true && isFreeAiProvider(value.provider) && typeof value.model === 'string') {
    return { ok: true, provider: value.provider, model: value.model }
  }
  const reason = FAILURES.find((f) => f === value.reason)
  return { ok: false, reason: reason ?? 'network' }
}

/** How much of today's free allowance is left, as the provider reports it */
export interface FreeAiQuota {
  used: number
  limit: number
  remaining: number
}

/** A quota answer as the renderer reads it */
export function freeAiQuotaOf(raw: unknown): FreeAiQuota | null {
  const value = (raw ?? {}) as Partial<Record<keyof FreeAiQuota, unknown>>
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0
  return ok(value.used) && ok(value.limit) && ok(value.remaining)
    ? { used: value.used, limit: value.limit, remaining: value.remaining }
    : null
}

// ── the daily free limit ───────────────────────────────────

// OpenRouter: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day"
const OPENROUTER_DAILY = /free-models-per-day/i
// Gemini: RESOURCE_EXHAUSTED naming a per-day quota of the free tier
// ("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "generate_content_free_tier_requests")
const GEMINI_DAILY = /PerDay[\w-]*FreeTier|FreeTier[\w-]*PerDay/i
// Gemini: the same free-tier quota, but with no allowance at all for this model
// ("…generate_content_free_tier_requests, limit: 0, model: gemini-4-argon")
const GEMINI_FREE_TIER = /FreeTier|free_tier/i
const GEMINI_ZERO_QUOTA = /\blimit:\s*0\b|"quotaValue":\s*"0"/i
// OpenRouter repeats its rate-limit headers in the error body's metadata
const OPENROUTER_RESET = /X-RateLimit-Reset\\?"?\s*:\s*\\?"?(\d{10,13})/i

/**
 * Midnight in Pacific time after `now`, when the Gemini API's per-day quotas
 * reset (ai.google.dev rate-limit documentation).
 */
export function nextPacificMidnight(now: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hourCycle: 'h23',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(now))
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const elapsed = ((value('hour') * 60 + value('minute')) * 60 + value('second')) * 1000
  const day = 24 * 60 * 60 * 1000
  // whole seconds: the formatted clock has no milliseconds
  return Math.floor(now / 1000) * 1000 - elapsed + day
}

function errorTexts(err: unknown): string[] {
  const texts: string[] = []
  let current: unknown = err
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === 'string') {
      texts.push(current)
      break
    }
    const e = current as { message?: unknown; cause?: unknown }
    if (typeof e.message === 'string') texts.push(e.message)
    current = e.cause
  }
  return texts
}

/**
 * A run refused because the key is on a free tier that has no allowance for
 * the chosen model at all: Gemini answers a Pro model on a free key with a
 * free-tier quota of 0. The fix is another model or billing, never waiting.
 */
export function isFreeTierModelRefusal(err: unknown): boolean {
  return errorTexts(err).some((text) => GEMINI_FREE_TIER.test(text) && GEMINI_ZERO_QUOTA.test(text))
}

/**
 * A run that failed because today's free allowance is used up, with the time
 * it resets when that can be known; null for any other failure. Read from the
 * error text, as the overload classification is: the protocols put the
 * provider's error body into the message.
 */
export function freeLimitOf(err: unknown, now: number = Date.now()): { resetsAt?: number } | null {
  // a model the free tier does not serve: waiting for the reset would not help
  if (isFreeTierModelRefusal(err)) return null
  for (const text of errorTexts(err)) {
    if (OPENROUTER_DAILY.test(text)) {
      const reset = OPENROUTER_RESET.exec(text)?.[1]
      if (!reset) return {}
      const at = Number(reset) * (reset.length === 10 ? 1000 : 1)
      return Number.isFinite(at) && at > now ? { resetsAt: at } : {}
    }
    if (GEMINI_DAILY.test(text)) return { resetsAt: nextPacificMidnight(now) }
  }
  return null
}
