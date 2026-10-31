import { openAiSecrets } from './settings-secrets'
import { resolveCustomEndpoints } from './custom-endpoints'
import { defaultAiMediaSettings, resolveAiMediaSettings } from './media'
import { defaultAiSearchSettings, resolveAiSearchSettings } from './search-settings'
import type {
  AiProviderId,
  AiProviderMeta,
  AiReadUrlSettings,
  AiSettings,
  AiSubscriptionCliId,
  AiSubscriptionProviderId,
  LegacyAiSettings,
} from './types'

/**
 * OpenCode Zen / Go route and cache per conversation and answer 400
 * MissingSessionID without this header (genoffice#331). The renderer's
 * transport id is stable for a chat; a one-shot call is its own conversation.
 */
export function opencodeSessionHeaders(
  baseUrl: string | undefined,
  sessionId?: string,
): Record<string, string> {
  return baseUrl?.startsWith('https://opencode.ai/')
    ? { 'x-opencode-session': sessionId || crypto.randomUUID() }
    : {}
}

/** DeepSeek V4.1 Flash under its versioned display spelling; the adapter maps it to the vendor's wire id */
export const DEEPSEEK_V41_FLASH = 'deep-seek-v4.1-flash'

export const AI_PROVIDERS: AiProviderMeta[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    // Aliases the CLI resolves to the subscription's current models, so no
    // dated id goes stale here. Empty leaves the choice to the CLI.
    models: ['opus', 'sonnet', 'haiku'],
    defaultModel: '',
    keyPlaceholder: '',
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    // Read at runtime from the plan's model catalog (/v1/models). Empty runs
    // on the first model the catalog lists.
    models: [],
    defaultModel: '',
    keyPlaceholder: '',
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    // Populated at runtime from codex app-server model/list. Empty also lets
    // the CLI select the account's current default without a stale hardcode.
    models: [],
    defaultModel: '',
    keyPlaceholder: '',
    needsCliPath: true,
  },
  {
    id: 'anthropic',
    label: 'Claude',
    // current-generation ids per platform.claude.com models overview (2026-10-09).
    // Fable needs data retention enabled on the org, otherwise the API answers
    // model_not_available; every other id is served to any key.
    models: [
      'claude-opus-5-5',
      'claude-sonnet-5',
      'claude-fable-5-1',
      'claude-opus-5',
      'claude-fable-5',
      'claude-sonnet-4-6',
      'claude-haiku-5-5',
    ],
    defaultModel: 'claude-sonnet-5',
    keyPlaceholder: 'sk-ant-api03-...',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    // per ai.google.dev/gemini-api/docs/models (2026-10-29). 4 Argon (GA
    // 2026-10-13) is the flagship reasoning model and 3.1 Pro is still
    // preview-only; neither has a free tier, so 3.8 Flash, the stable Flash
    // Google recommends, stays the default. 3.7 Flash was deprecated on
    // 2026-10-08 (see RETIRED_MODELS). Models released after this list come
    // from the key's live list (key-models.ts).
    models: [
      'gemini-3.8-flash',
      'gemini-4-argon',
      'gemini-3.1-pro-preview',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
    ],
    defaultModel: 'gemini-3.8-flash',
    keyPlaceholder: 'AIza...',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    // GET api.deepseek.com/v1/models serves `deepseek-v4-pro` and
    // `deepseek-flash` (verified 2026-09-21); the latter is V4.1 Flash with
    // native vision. We list it under a versioned name; the adapter maps it
    // back to the unversioned wire id (see DEEPSEEK_WIRE_IDS in registry.ts).
    models: ['deepseek-v4-pro', DEEPSEEK_V41_FLASH],
    defaultModel: 'deepseek-v4-pro',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    // GPT-5.6 naming: sol is the flagship (the bare `gpt-5.6` alias resolves to
    // it, but spell it out so the picker says which tier it is), terra balances
    // cost/intelligence, luna is the high-volume tier (2026-08). The GPT-6
    // family (astra, sol, luna) is deliberately absent: Chat Completions
    // supports its function calling only with reasoning_effort none, full
    // tool use needs the Responses API, which has no protocol here (2026-09-24)
    models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'],
    defaultModel: 'gpt-5.6-terra',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'kimi',
    label: 'Kimi',
    // K3.1 Pro opens the K3.1 series: 3T-class parameters, native vision, 1M
    // context (2026-10). K3 stays listed while the vendor still sells it.
    models: ['kimi-k3.1-pro', 'kimi-k3'],
    defaultModel: 'kimi-k3.1-pro',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'glm',
    label: 'GLM',
    // bigmodel.cn text-model lineup (2026-08); 5.3 and 5.2 share a base model.
    // 5.3-Flash is the first multimodal GLM-5 and the documented successor to
    // 5-Turbo, which Z.ai delisted from its price card in late August and
    // Tencent CloudBase retires on 2026-10-30 with migration advice pointing
    // here. 5.2 is marked deprecated on third-party catalogues but is still
    // sold pay-as-you-go, so it stays listed.
    models: ['glm-5.3', 'glm-5.3-flash', 'glm-5.2'],
    defaultModel: 'glm-5.3',
    keyPlaceholder: 'xxxxxxxx.xxxxxxxx',
  },
  {
    id: 'qwen',
    label: 'Qwen',
    // Versioned DashScope ids: the bare qwen-max alias still points at a
    // Qwen2.5-era snapshot, so name the 3.x tiers explicitly (2026-08).
    // 3.8 ships as Max and Flash only — there is no 3.8-Plus tier, and
    // 3.7-Flash is still the listed high-volume option.
    models: ['qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus', 'qwen3.7-flash'],
    defaultModel: 'qwen3.8-max',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'doubao',
    label: 'Doubao',
    // Ark ids are dashed and date-pinned; it also accepts ep-... inference
    // endpoint ids in the model field
    models: ['doubao-seed-2-1-pro-260628', 'doubao-seed-2-1-turbo-260628'],
    defaultModel: 'doubao-seed-2-1-pro-260628',
    keyPlaceholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  },
  {
    id: 'mimo',
    label: 'MiMo',
    // Xiaomi's open-weight omni-modal pair (released 2026-09-22): Pro is the
    // trillion-parameter flagship, Flash the efficiency/cost tier. Both take
    // text, image, video and audio input; a -pro-ultraspeed tier also exists but
    // is the same weights behind a faster serving path, so it is not a
    // separate model to pick here.
    models: ['mimo-v2.6-pro', 'mimo-v2.6-flash'],
    defaultModel: 'mimo-v2.6-pro',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'hunyuan',
    label: 'Hunyuan',
    // Tencent's TokenHub chat models (docs 1823/132252, read 2026-09-30).
    // hy4-preview is the 1M-context flagship and has deep thinking on by
    // default; hy3 is the 256k balanced tier. Every other provider here
    // defaults to its flagship, so this does too.
    models: ['hy4-preview', 'hy3'],
    defaultModel: 'hy4-preview',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'ling',
    label: 'Ling',
    // Ids as listed by developer.ant-ling.com (Ring = reasoning line); only
    // Ling-3.0-flash-VL takes images, see modelLacksVision()
    models: [
      'Ling-3.0-flash',
      'Ling-3.0-flash-VL',
      'Ling-3.0-tiny',
      'Ling-2.6-1T',
      'Ring-2.6-1T',
      'Ling-2.6-flash',
    ],
    defaultModel: 'Ling-3.0-flash',
    keyPlaceholder: 'API Key',
  },
  {
    id: 'spark',
    label: 'Spark',
    // iFlytek MaaS: lower-case model id and ak- key prefix are the vendor's own spelling
    models: ['spark-x2.5'],
    defaultModel: 'spark-x2.5',
    keyPlaceholder: 'ak-...',
  },
  {
    id: 'longcat',
    label: 'LongCat',
    // 2.5-Preview is the multimodal tier; 2.0 stays default so a fresh config avoids a preview
    models: ['LongCat-2.5-Preview', 'LongCat-2.0'],
    defaultModel: 'LongCat-2.0',
    keyPlaceholder: 'API Key',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    // M3 is the current agentic/tool-use model; M2.5 moved to the legacy tier
    models: ['MiniMax-M3', 'MiniMax-M2.7'],
    defaultModel: 'MiniMax-M3',
    keyPlaceholder: 'eyJ...',
  },
  {
    id: 'xai',
    label: 'Grok',
    // 4.7 (2026-09-21) is 2.1T / 500K context at 4.6's price. 4.6 stays the
    // default so a fresh config does not silently move to a model released
    // this month; say the word and the default follows the flagship like every
    // other provider here.
    models: ['grok-4.7', 'grok-4.6', 'grok-4.5'],
    defaultModel: 'grok-4.6',
    keyPlaceholder: 'xai-...',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    // `-latest` aliases track the newest GA snapshot. Medium 3.5 is Mistral's
    // agentic tier; codestral is a code-completion/FIM model, not an agent driver.
    models: ['mistral-medium-latest', 'mistral-large-latest', 'mistral-small-latest'],
    defaultModel: 'mistral-medium-latest',
    keyPlaceholder: 'API Key',
  },
  {
    id: 'upstage',
    label: 'Solar',
    // GET api.upstage.ai/v1/models (2026-10-21); every id here answered a
    // tool call. Pro4 is the flagship, Mini4 the fast, cheap tier.
    models: ['solar-pro4', 'solar-pro3', 'solar-mini4'],
    defaultModel: 'solar-pro4',
    keyPlaceholder: 'up_...',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    // vendor-prefixed slugs exactly as openrouter.ai/api/v1/models lists them —
    // there is no `openai/gpt-5.6` alias there, only the per-tier ids
    models: [
      'openrouter/auto',
      'anthropic/claude-opus-5.5',
      'anthropic/claude-sonnet-5',
      'openai/gpt-6-astra',
      'openai/gpt-6-sol',
      'openai/gpt-6-luna',
      'openai/gpt-5.6-sol',
      'moonshotai/kimi-k3.1-pro',
      'moonshotai/kimi-k3',
    ],
    defaultModel: 'openrouter/auto',
    keyPlaceholder: 'sk-or-...',
  },
  {
    id: 'requesty',
    label: 'Requesty',
    // Managed policy ids exactly as GET router.requesty.ai/v1/models/managed
    // lists them (2026-09-24): short stable names Requesty routes across
    // providers, used as-is in the model field. The full vendor-prefixed
    // catalog (GET /v1/models, e.g. openai/gpt-4o-mini) works too when typed
    // in. Ids ending "@eu" route through EU providers only.
    models: [
      'claude-sonnet-5',
      'claude-opus-5-5',
      'claude-opus-4-8',
      'gpt-6-sol',
      'gpt-6-luna',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gemini-3.7-flash',
      'deepseek-v4-pro',
      'kimi-k3',
    ],
    defaultModel: 'claude-sonnet-5',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'opper',
    label: 'Opper',
    // Pool ids exactly as GET api.opper.ai/v3/models lists them (2026-09-14):
    // a bare name is an Opper pool, and Opper picks the serving provider and
    // region per request. The vendor-prefixed catalog (anthropic/claude-sonnet-4-6,
    // azure/gpt-5, …) pins one provider and works as-is when typed in.
    // Full list at opper.ai/models.
    models: [
      'claude-sonnet-4-6',
      'claude-opus-5',
      'gpt-5.5',
      'gpt-5.4-mini',
      'gemini-3.8-flash',
      'deepseek-v4-pro',
      'kimi-k3',
      'mistral-large-2512',
    ],
    defaultModel: 'claude-sonnet-4-6',
    keyPlaceholder: 'API Key',
  },
  {
    id: 'cheaperinference',
    label: 'Cheaper Inference',
    // Bare model ids as GET api.cheaperinference.com/v1/models lists them (the
    // chat rows, type "text"): no vendor prefix, one key for every lab. Other
    // ids from that list work as-is when typed in. Full list at
    // cheaperinference.com/#models.
    models: ['gpt-5.4-mini', 'gpt-5.4', 'claude-sonnet-5', 'gemini-3.1-pro'],
    defaultModel: 'gpt-5.4-mini',
    keyPlaceholder: 'ci_live_...',
  },
  {
    id: 'atlascloud',
    label: 'Atlas Cloud',
    // Lab-namespaced ids exactly as GET api.atlascloud.ai/v1/models lists them
    // (2026-10-08, public endpoint, no key needed); the rest of the 117-model
    // catalog works as-is when typed in. Chat, temperature and — for the
    // multimodal ids — data-URI image input are live-verified. The text-only
    // ids (deepseek-v4-*, glm-5.3, both MiniMax) are listed in
    // modelLacksVision(); Atlas Cloud serves MiniMax M3 text-only even though
    // MiniMax's own API takes images.
    models: [
      'deepseek-ai/deepseek-v4-pro',
      'deepseek-ai/deepseek-v4-flash',
      'moonshotai/kimi-k3',
      'moonshotai/kimi-k2.6',
      'zai-org/glm-5.3',
      'zai-org/glm-5.3-flash',
      'qwen/qwen3.8-max',
      'qwen/qwen3.5-flash',
      'minimaxai/minimax-m3',
      'minimaxai/minimax-m2.5',
    ],
    defaultModel: 'deepseek-ai/deepseek-v4-pro',
    keyPlaceholder: 'apikey-...',
  },
  {
    id: 'runcrate',
    label: 'Runcrate',
    // Lab-namespaced ids exactly as GET api.runcrate.ai/v1/models lists them
    // (2026-10-25, public endpoint, no key needed); the rest of the catalog
    // works as-is when typed in. Chat, streaming and tool calls are
    // live-verified; image support follows each id's catalog input_modalities,
    // and the text-only ids (GLM-5.3, Qwen3.8 Flash, gpt-oss 120B) are covered
    // by modelLacksVision().
    models: [
      'deepseek-ai/DeepSeek-V4.1-Flash',
      'deepseek-ai/DeepSeek-V4.1-Flash-1017',
      'zai-org/GLM-5.3',
      'zai-org/GLM-5.3-Flash',
      'moonshotai/Kimi-K2.6',
      'Qwen/Qwen3.8-Flash',
      'openai/gpt-oss-120b',
    ],
    defaultModel: 'deepseek-ai/DeepSeek-V4.1-Flash',
    keyPlaceholder: 'rc_live_...',
  },
  {
    id: 'opencode-zen',
    label: 'OpenCode Zen',
    // Pay-as-you-go gateway (opencode.ai/docs/zen); ids exactly as GET
    // /zen/v1/models lists them (2026-10-09). GPT-5.x/6, Grok and Muse Spark
    // are served only through the Responses API, which has no protocol here,
    // so they stay out until one exists.
    models: [
      'claude-sonnet-5',
      'claude-opus-5-5',
      'claude-opus-5',
      'claude-fable-5-1',
      'claude-haiku-5-5',
      'gemini-3.7-flash',
      'gemini-3.1-pro',
      'kimi-k3',
      'kimi-k2.7-code',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'glm-5.2',
      'minimax-m3',
      'qwen3.6-plus',
    ],
    defaultModel: 'claude-sonnet-5',
    keyPlaceholder: 'API Key',
  },
  {
    id: 'opencode-go',
    label: 'OpenCode Go',
    // $10/month subscription to open-weight coding models (opencode.ai/docs/go),
    // same key as Zen; ids exactly as GET /zen/go/v1/models lists them
    // (re-read 2026-09-30). GPT-5.6 Luna, Grok and Muse Spark are
    // Responses-only and left out for the same reason as above.
    models: [
      'kimi-k2.7-code',
      'kimi-k3',
      'kimi-k2.6',
      'glm-5.3',
      'glm-5.3-flash',
      'glm-5.2',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'deepseek-v4.1-flash',
      'qwen3.8-max',
      'qwen3.8-flash',
      'minimax-m3',
      'minimax-m2.7',
      'mimo-v2.5-pro',
      'mimo-v2.6-pro',
      'mimo-v2.6-flash',
      'longcat-2.0',
      'longcat-2.5-preview-free',
      'hy4-preview',
      'hy3',
    ],
    defaultModel: 'kimi-k2.7-code',
    keyPlaceholder: 'API Key',
  },
  {
    id: 'custom',
    label: 'Custom',
    models: [],
    defaultModel: '',
    keyPlaceholder: 'API Key',
    needsBaseUrl: true,
  },
]

/**
 * Fresh settings with every provider's default model and an empty key,
 * except providers listed in `defaultApiKeys` (e.g. an app-specific
 * preconfigured Anthropic key). Callers own that policy; this package
 * has no hardcoded keys.
 */
export function defaultAiSettings(
  defaultApiKeys?: Partial<Record<AiProviderId, string>>,
): AiSettings {
  const providers = {} as AiSettings['providers']
  for (const meta of AI_PROVIDERS) {
    providers[meta.id] = {
      apiKey: defaultApiKeys?.[meta.id] ?? '',
      model: meta.defaultModel,
      baseUrl: meta.needsBaseUrl ? '' : undefined,
      cliPath: meta.needsCliPath ? '' : undefined,
    }
  }
  return {
    provider: 'auto',
    providers,
    media: defaultAiMediaSettings(),
    search: defaultAiSearchSettings(),
    meteredAccepted: sanitizeMeteredAccepted(undefined),
    headlessSubscriptionEnabled: false,
    headlessSubscriptionConsentVersion: 0,
    subscriptionNoticeSeen: false,
    subscriptionNoticeVersion: 0,
    pdfSendNoticeSeen: 0,
  }
}

/** The current wording of the first-connection notice: version 2 added the PDF sentence */
export const AI_SUBSCRIPTION_NOTICE_VERSION = 2

/** The notice version an older settings file without one had acknowledged */
const LEGACY_SUBSCRIPTION_NOTICE_VERSION = 1

/**
 * A stored notice version, or the version an old boolean-only file implies.
 * The app's settings reader migrates a truly old file to version 1 before it
 * reaches this function, so a boolean-only value from a fresh default object
 * means the current wording.
 */
export function subscriptionNoticeVersionOf(version: unknown, seen: unknown): number {
  if (typeof version === 'number' && Number.isInteger(version) && version >= 0) {
    return Math.min(version, AI_SUBSCRIPTION_NOTICE_VERSION)
  }
  return seen === true ? AI_SUBSCRIPTION_NOTICE_VERSION : 0
}

/** The version an old settings file is migrated to, so its user sees the added sentence once */
export const LEGACY_NOTICE_VERSION_FOR_MIGRATION = LEGACY_SUBSCRIPTION_NOTICE_VERSION

/**
 * The settings object a file written before notice versions needs, or null
 * when it already has one (or is not a settings object). The caller writes the
 * returned object back; normalizing without this would treat the old boolean
 * as the current wording and the user would never see the added sentence.
 */
export function withMigratedSubscriptionNoticeVersion(
  raw: unknown,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  if (value.subscriptionNoticeSeen !== true) return null
  const version = value.subscriptionNoticeVersion
  if (typeof version === 'number' && Number.isInteger(version) && version >= 0) return null
  return { ...value, subscriptionNoticeVersion: LEGACY_SUBSCRIPTION_NOTICE_VERSION }
}

/**
 * The version of the warning shown when the automatic-call switch is turned
 * on. Version 1 was the switch with an hourly cap, which stored no version;
 * the current one has no cap and may send whole documents. A switch turned
 * on under an older version reads as off until the user agrees again.
 */
export const HEADLESS_SUBSCRIPTION_CONSENT_VERSION = 2

/** A stored consent version, or 0 when there is none or it is not a whole number. */
export function headlessConsentVersionOf(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0
}

/** The switch as it takes effect: on only with the consent of the current version. */
export function headlessSubscriptionOn(
  settings: Pick<AiSettings, 'headlessSubscriptionEnabled' | 'headlessSubscriptionConsentVersion'>,
): boolean {
  return (
    settings.headlessSubscriptionEnabled === true &&
    headlessConsentVersionOf(settings.headlessSubscriptionConsentVersion) >=
      HEADLESS_SUBSCRIPTION_CONSENT_VERSION
  )
}

/**
 * Providers that run on the user's subscription, in the order `auto` tries
 * them. ChatGPT reached directly comes before Codex: both draw on the same
 * ChatGPT plan, and the direct one starts no program and has no shell tool.
 */
export const AI_SUBSCRIPTION_PROVIDERS: readonly AiSubscriptionProviderId[] = [
  'claude-code',
  'chatgpt',
  'codex',
]

/** The subscription providers behind a vendor CLI */
export const AI_SUBSCRIPTION_CLIS: readonly AiSubscriptionCliId[] = ['claude-code', 'codex']

/** A subscription provider behind a vendor CLI (found, installed, updated and signed in through the program) */
export function isSubscriptionCli(id: unknown): id is AiSubscriptionCliId {
  return AI_SUBSCRIPTION_CLIS.includes(id as AiSubscriptionCliId)
}

/**
 * One boolean per vendor CLI; anything that is not `true` reads as not
 * accepted. The ChatGPT sign-in is to the plan alone and has no metered login
 * to accept, so it has no entry (and the stored file keeps its shape).
 */
export function sanitizeMeteredAccepted(stored: unknown): Record<AiSubscriptionCliId, boolean> {
  const raw = isRecord(stored) ? stored : {}
  return { 'claude-code': raw['claude-code'] === true, codex: raw.codex === true }
}

/**
 * The read_url slot when it carries a usable token; anything else (absent,
 * not an object, a non-string or blank token) means public pages only.
 */
export function readUrlSettingsOf(value: unknown): AiReadUrlSettings | undefined {
  if (!isRecord(value)) return undefined
  const token = str(value.githubToken)
  return token ? { githubToken: token } : undefined
}

/**
 * Model ids a vendor has stopped serving, mapped to their replacement. A
 * stored selection outlives the provider list, so without this remap an old
 * settings file keeps sending an id the API now rejects.
 */
const RETIRED_MODELS: Partial<Record<AiProviderId, Record<string, string>>> = {
  // chat/reasoner retired 2026-07-24 (thinking became a request parameter);
  // V4 Flash and V4 Flash Vision Exp retired 2026-09-10 in favour of V4.1
  // Flash, which carries vision natively. The vendor's own `deepseek-flash`
  // id is folded in as well so the stored value matches the listed one.
  deepseek: {
    'deepseek-chat': DEEPSEEK_V41_FLASH,
    'deepseek-reasoner': DEEPSEEK_V41_FLASH,
    'deepseek-v4-flash': DEEPSEEK_V41_FLASH,
    'deepseek-v4-flash-vision-exp': DEEPSEEK_V41_FLASH,
    'deepseek-flash': DEEPSEEK_V41_FLASH,
  },
  // 5-Turbo left the Z.ai price card late 2026-08; 5.3 Flash is the cheap tier now
  glm: { 'glm-5-turbo': 'glm-5.3-flash' },
  // deprecated 2026-10-08; Google routes its requests to 3.8 Flash
  gemini: { 'gemini-3.7-flash': 'gemini-3.8-flash' },
}

/**
 * The id a provider's model goes by in this app: a retired id as its
 * replacement, a vendor's wire id as the name the catalog lists it under,
 * anything else as given.
 */
export function currentModelId(provider: AiProviderId, model: string): string {
  return RETIRED_MODELS[provider]?.[model] ?? model
}

/** Ids at most this long are kept from a stored live list; the settings guard bounds a model id the same way */
const MAX_LISTED_MODEL_LENGTH = 256
/** entries kept from a stored live list (key-models.ts lists no more) */
const MAX_LISTED_MODELS = 2000

/**
 * A stored live model list as the pickers may read it: strings only, trimmed,
 * bounded, without duplicates; undefined when nothing is left. The file is
 * hand-editable, so anything else in the field is dropped rather than shown.
 */
export function listedModelsOf(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const id = entry.trim()
    if (id && id.length <= MAX_LISTED_MODEL_LENGTH) seen.add(id)
    if (seen.size >= MAX_LISTED_MODELS) break
  }
  return seen.size > 0 ? [...seen] : undefined
}

/**
 * Per-turn output cap applied when the settings carry none. The historic 8192
 * was the budget a reasoning model burns on thinking before it writes any prose,
 * and too small for a large sheet DSL or long-form generation in one turn. Models
 * whose own ceiling is lower reject this and are retried at that ceiling
 * (see output-cap.ts).
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 32768
/** bounds accepted for AiSettings.maxOutputTokens: below the first a short answer cannot even finish, above the second one turn risks the whole context window */
export const MIN_MAX_OUTPUT_TOKENS = 1024
export const MAX_MAX_OUTPUT_TOKENS = 131072

/** Out-of-range or non-finite input falls back to a bound / the default (a mistyped settings field must not kill AI features) */
export function clampMaxOutputTokens(value: unknown): number {
  const n = typeof value === 'number' ? Math.floor(value) : Number.NaN
  if (!Number.isFinite(n)) return DEFAULT_MAX_OUTPUT_TOKENS
  return Math.min(MAX_MAX_OUTPUT_TOKENS, Math.max(MIN_MAX_OUTPUT_TOKENS, n))
}

/** The effective per-turn output cap of a settings object (clamped; absent → default) */
export function maxOutputTokensOf(
  settings: Pick<AiSettings, 'maxOutputTokens'> | null | undefined,
): number {
  return settings?.maxOutputTokens === undefined
    ? DEFAULT_MAX_OUTPUT_TOKENS
    : clampMaxOutputTokens(settings.maxOutputTokens)
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function mergeProviderConfigs(
  defaults: AiSettings['providers'],
  stored: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...defaults }
  for (const [id, config] of Object.entries(stored)) {
    if (isRecord(config)) merged[id] = config
  }
  return merged
}

/** pasted keys/URLs/model ids often carry stray whitespace, which turns into a 401 with a valid key */
function trimConfigs(providers: Record<string, unknown>): AiSettings['providers'] {
  const trimmed: Record<string, unknown> = {}
  for (const [id, config] of Object.entries(providers)) {
    if (!isRecord(config)) continue
    const { models: rawModels, ...rest } = config
    const models = listedModelsOf(rawModels)
    trimmed[id] = {
      ...rest,
      apiKey: str(config.apiKey),
      model: str(config.model),
      ...(config.baseUrl !== undefined ? { baseUrl: str(config.baseUrl) } : {}),
      ...(config.cliPath !== undefined ? { cliPath: str(config.cliPath) } : {}),
      ...(models ? { models } : {}),
    }
  }
  return trimmed as AiSettings['providers']
}

function migrateRetiredModels(providers: AiSettings['providers']): AiSettings['providers'] {
  const migrated = { ...providers }
  for (const [id, replacements] of Object.entries(RETIRED_MODELS)) {
    const config = migrated[id as AiProviderId]
    const replacement = config?.model ? replacements[config.model] : undefined
    if (replacement) migrated[id as AiProviderId] = { ...config, model: replacement }
  }
  return migrated
}

/**
 * Merge on-disk settings over freshly computed defaults, migrating the
 * pre-provider shape (a single OpenAI-compatible endpoint) into the
 * "custom" provider slot. `stored` is whatever the caller read from its
 * settings file (already JSON-parsed); this function does no file I/O.
 */
export function resolveAiSettings(stored: unknown, defaults: AiSettings): AiSettings {
  // sealed keys open here, so every reader of the file gets them plain (decision 0063)
  const settings = (isRecord(stored) ? openAiSecrets(stored) : {}) as Partial<AiSettings> &
    LegacyAiSettings
  const readUrl = readUrlSettingsOf(settings.readUrl ?? defaults.readUrl)
  const storedProviders = isRecord(settings.providers) ? settings.providers : undefined
  if (!storedProviders) {
    if (settings.apiKey) {
      defaults.providers.custom = {
        apiKey: str(settings.apiKey),
        model: str(settings.model),
        baseUrl: str(settings.baseUrl) || 'https://api.openai.com/v1',
      }
    }
    return resolveCustomEndpoints(readUrl ? { ...defaults, readUrl } : defaults)
  }
  return resolveCustomEndpoints({
    provider: settings.provider ?? defaults.provider,
    customEndpoints: settings.customEndpoints,
    customEndpoint: settings.customEndpoint,
    ...(readUrl ? { readUrl } : {}),
    // Trim before migrating: a pasted " deepseek-reasoner " must still hit
    // the retired-id remap instead of being sent to the API verbatim.
    providers: migrateRetiredModels(
      trimConfigs(mergeProviderConfigs(defaults.providers, storedProviders)),
    ),
    media: resolveAiMediaSettings(settings.media ?? defaults.media),
    search: resolveAiSearchSettings(settings.search ?? defaults.search),
    meteredAccepted: sanitizeMeteredAccepted(settings.meteredAccepted ?? defaults.meteredAccepted),
    headlessSubscriptionEnabled: headlessSubscriptionOn({
      headlessSubscriptionEnabled:
        settings.headlessSubscriptionEnabled ?? defaults.headlessSubscriptionEnabled,
      headlessSubscriptionConsentVersion:
        settings.headlessSubscriptionConsentVersion ?? defaults.headlessSubscriptionConsentVersion,
    }),
    headlessSubscriptionConsentVersion: headlessConsentVersionOf(
      settings.headlessSubscriptionConsentVersion ?? defaults.headlessSubscriptionConsentVersion,
    ),
    subscriptionNoticeSeen:
      (settings.subscriptionNoticeSeen ?? defaults.subscriptionNoticeSeen) === true,
    subscriptionNoticeVersion: subscriptionNoticeVersionOf(
      settings.subscriptionNoticeVersion,
      settings.subscriptionNoticeSeen ?? defaults.subscriptionNoticeSeen,
    ),
    pdfSendNoticeSeen:
      typeof settings.pdfSendNoticeSeen === 'number' &&
      Number.isInteger(settings.pdfSendNoticeSeen) &&
      settings.pdfSendNoticeSeen > 0
        ? settings.pdfSendNoticeSeen
        : 0,
    ...((settings.internetTools ?? defaults.internetTools) === false
      ? { internetTools: false }
      : {}),
    // clamped on read: a hand-edited settings file with an absurd cap must not be
    // forwarded to the endpoint verbatim
    ...(settings.maxOutputTokens !== undefined || defaults.maxOutputTokens !== undefined
      ? {
          maxOutputTokens: clampMaxOutputTokens(
            settings.maxOutputTokens ?? defaults.maxOutputTokens,
          ),
        }
      : {}),
  })
}
