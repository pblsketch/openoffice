// Live model list for the API-key providers: the ids the vendor serves to the
// stored key right now, so a model released after this build shows in the
// pickers without an app update (decision 0087). One request per page to the
// vendor's own list endpoint with the key the chat would send there; listing
// is not a model call and costs nothing.
//
// The protocol picks the endpoint: Anthropic `GET /v1/models`, Gemini
// `GET /v1beta/models`, every OpenAI-compatible vendor and gateway
// `GET {base}/models`. A vendor without one (404), a refused key, a timeout or
// an odd body all read as "no list", and the pickers keep the fixed catalog.
//
// Main-process only: it sends the key. The renderer reads the result from the
// settings file (`providers.<id>.models`), which only the main process writes.
import { withUserAgent } from './fetch'
import { endpointUrl, readCappedResponseText } from './protocols/shared'
import { currentModelId, opencodeSessionHeaders } from './providers'
import { AI_PROVIDER_ADAPTERS } from './registry'
import type { AiProviderConfig, AiProviderId } from './types'
import { createStreamWatchdog } from './watchdog'

/** a list endpoint this slow is not worth waiting on; the pickers have the catalog meanwhile */
const REQUEST_TIMEOUT_MS = 10_000

/** a vendor's list is a few hundred KB; OpenRouter's, with descriptions, about 1 MB */
const MAX_BODY_BYTES = 8 * 1024 * 1024

/** pages followed per listing; Anthropic and Gemini fit in one at the page sizes asked */
const MAX_PAGES = 5

/** ids kept per provider, the same bound the settings guard puts on a local server's list */
export const MAX_KEY_PROVIDER_MODELS = 2000

/** the longest id kept; the settings guard bounds a model id the same way */
const MAX_MODEL_ID_LENGTH = 256

/**
 * Ids that are not chat models: embeddings, speech, image and video
 * generation, live and realtime audio sessions, moderation, reranking and the
 * like. Vendors put them in the same list as the chat models; picking one
 * would only fail.
 */
const NOT_CHAT =
  /(embed|(^|[-_/])tts|whisper|transcri|speech|audio|realtime|(^|[-_/])live([-_]|$)|dall-e|gpt-image|imagen|(^|[-_/])image([-_]|$)|-image-|veo|sora|video|moderation|rerank|robotics|(^|[-_/])aqa($|-)|nano-banana|lyria|computer-use|deep-research|(^|[-_/])ocr([-_]|$)|babbage|davinci)/i

/**
 * Ids a provider lists but this app cannot drive. OpenAI serves the GPT-6
 * family, the Codex and the -pro models on the Responses API only (Chat
 * Completions has no full tool use for them, see the catalog note); the
 * OpenCode gateways route GPT, Grok and Muse Spark the same way.
 */
const UNSUPPORTED: Partial<Record<AiProviderId, RegExp>> = {
  openai: /^(gpt-6|o\d+-pro|.*-pro($|-\d)|.*codex)/i,
  'opencode-zen': /^(gpt-|grok|muse)/i,
  'opencode-go': /^(gpt-|grok|muse)/i,
}

/** Kinds some lists put in a `type` field; anything else there (`model`, `text`, `chat`) is kept */
const NON_CHAT_TYPES = new Set([
  'embedding',
  'embeddings',
  'image',
  'images',
  'audio',
  'tts',
  'stt',
  'video',
  'rerank',
  'moderation',
])

/**
 * A copy of another listed id: a dated snapshot (`-2026-03-05`, `-20260305`,
 * `-260628`, `-0613`) or OpenRouter's batch-priced `:batch` variant
 */
const COPY_SUFFIX = /^(.+?)(?:-(?:\d{4}-\d{2}-\d{2}|\d{8}|\d{6}|\d{4})|:batch)$/

interface Listed {
  id: string
  /** seconds since the epoch, when the list says */
  created?: number | undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** What an OpenAI-style entry says about itself, beyond its id */
function servesChat(entry: Record<string, unknown>): boolean {
  const params = entry.supported_parameters
  if (Array.isArray(params) && !params.includes('tools')) return false
  const architecture = entry.architecture
  if (isRecord(architecture)) {
    const output = architecture.output_modalities
    if (Array.isArray(output) && !output.includes('text')) return false
  }
  const capabilities = entry.capabilities
  if (isRecord(capabilities)) {
    if (capabilities.completion_chat === false) return false
    if (capabilities.function_calling === false) return false
  }
  return !(typeof entry.type === 'string' && NON_CHAT_TYPES.has(entry.type.toLowerCase()))
}

function createdOf(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    // seconds; a millisecond stamp is brought down to the same scale
    return value > 1e12 ? Math.floor(value / 1000) : value
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined
  }
  return undefined
}

async function getJson(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const watchdog = createStreamWatchdog(undefined, REQUEST_TIMEOUT_MS)
  return watchdog.guard(async () => {
    const response = await fetchImpl(
      url,
      withUserAgent({
        headers: { Accept: 'application/json', ...headers },
        signal: watchdog.signal,
      }),
    )
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return JSON.parse(await readCappedResponseText(response, { maxBytes: MAX_BODY_BYTES }))
  })
}

async function listAnthropic(
  base: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<Listed[]> {
  const out: Listed[] = []
  let after = ''
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = `limit=1000${after ? `&after_id=${encodeURIComponent(after)}` : ''}`
    const body = await getJson(
      endpointUrl(base, 'v1/models', query),
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      fetchImpl,
    )
    if (!isRecord(body) || !Array.isArray(body.data)) break
    for (const entry of body.data) {
      if (isRecord(entry) && typeof entry.id === 'string') {
        out.push({ id: entry.id, created: createdOf(entry.created_at) })
      }
    }
    if (body.has_more !== true || typeof body.last_id !== 'string') break
    after = body.last_id
  }
  return out
}

/** The release a Gemini id names (`gemini-4-argon` → 4, `gemini-3.8-flash` → 3.8); its list carries no dates */
function geminiVersion(id: string): number {
  const match = /gemini-(\d+(?:\.\d+)?)/i.exec(id)
  return match ? Number(match[1]) : 0
}

async function listGemini(
  base: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<Listed[]> {
  const out: Listed[] = []
  let token = ''
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = `pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`
    const body = await getJson(
      endpointUrl(base, 'models', query),
      { 'x-goog-api-key': apiKey },
      fetchImpl,
    )
    if (!isRecord(body) || !Array.isArray(body.models)) break
    for (const entry of body.models) {
      if (!isRecord(entry) || typeof entry.name !== 'string') continue
      const methods = entry.supportedGenerationMethods
      // a model the chat cannot call: embeddings, the Live API, image-only
      if (Array.isArray(methods) && !methods.includes('generateContent')) continue
      out.push({ id: entry.name.replace(/^models\//, '') })
    }
    if (typeof body.nextPageToken !== 'string' || !body.nextPageToken) break
    token = body.nextPageToken
  }
  // newest release first; the list itself runs oldest first
  return out
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => geminiVersion(b.entry.id) - geminiVersion(a.entry.id) || a.index - b.index)
    .map(({ entry }) => entry)
}

async function listOpenAiCompatible(
  base: string,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<Listed[]> {
  const body = await getJson(
    endpointUrl(base, 'models'),
    {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...opencodeSessionHeaders(base),
    },
    fetchImpl,
  )
  const data = isRecord(body) ? body.data : undefined
  if (!Array.isArray(data)) return []
  const out: Listed[] = []
  for (const entry of data) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !servesChat(entry)) continue
    out.push({ id: entry.id, created: createdOf(entry.created ?? entry.created_at) })
  }
  return out
}

/**
 * The listed ids the pickers may offer, newest first where the list dates
 * them: chat models only, the provider's own spelling for an id it lists
 * under its wire name, and a dated snapshot or `:batch` variant dropped when
 * the id it copies is listed too.
 */
export function keyModelIdsOf(provider: AiProviderId, listed: readonly Listed[]): string[] {
  const unsupported = UNSUPPORTED[provider]
  const kept: Listed[] = []
  const seen = new Set<string>()
  for (const entry of listed) {
    const raw = entry.id.trim()
    if (!raw || raw.length > MAX_MODEL_ID_LENGTH) continue
    if (NOT_CHAT.test(raw) || unsupported?.test(raw)) continue
    const id = currentModelId(provider, raw)
    if (seen.has(id)) continue
    seen.add(id)
    kept.push({ id, created: entry.created })
  }
  const withoutCopies = kept.filter((entry) => {
    const alias = COPY_SUFFIX.exec(entry.id)?.[1]
    return !alias || !seen.has(alias)
  })
  // a stable sort: undated entries keep the vendor's order among themselves
  return withoutCopies
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (b.entry.created ?? 0) - (a.entry.created ?? 0) || a.index - b.index)
    .map(({ entry }) => entry.id)
    .slice(0, MAX_KEY_PROVIDER_MODELS)
}

/** Key providers whose models can be listed: every one but the subscriptions and the user's own servers */
export function listsKeyProviderModels(provider: AiProviderId): boolean {
  const adapter = AI_PROVIDER_ADAPTERS[provider]
  return adapter?.capabilities.auth === 'api-key' && provider !== 'custom'
}

/**
 * The chat models a key provider serves to this key, newest first where the
 * vendor dates them; null when there is no list to be had (no key, no list
 * endpoint, refused, unreachable, slow or unreadable). Never throws.
 */
export async function listKeyProviderModels(
  provider: AiProviderId,
  config: Pick<AiProviderConfig, 'apiKey' | 'baseUrl'>,
  fetchImpl: typeof fetch = fetch,
): Promise<string[] | null> {
  const apiKey = config.apiKey.trim()
  if (!apiKey || !listsKeyProviderModels(provider)) return null
  try {
    // the endpoint a chat with this key would use, stored base URL included
    const endpoint = AI_PROVIDER_ADAPTERS[provider].resolveEndpoint({
      apiKey,
      model: '',
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    })
    const listed =
      endpoint.protocol === 'anthropic'
        ? await listAnthropic(endpoint.baseUrl, apiKey, fetchImpl)
        : endpoint.protocol === 'gemini'
          ? await listGemini(endpoint.baseUrl, apiKey, fetchImpl)
          : endpoint.protocol === 'openai-compatible'
            ? await listOpenAiCompatible(endpoint.baseUrl, apiKey, fetchImpl)
            : []
    const ids = keyModelIdsOf(provider, listed)
    return ids.length > 0 ? ids : null
  } catch {
    return null
  }
}
