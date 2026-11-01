// Discovery and inspection of a user-hosted local AI server — the probe behind
// the settings screen's local AI card. Two wire shapes are understood: Ollama's
// own API (`/api/tags`, `/api/show`, `/api/ps`) and the generic
// OpenAI-compatible `/v1/models` route that LM Studio, vLLM, llama.cpp and
// friends answer.
//
// Nothing here throws. The address has just been typed by the user, so "nothing
// is listening" is an ordinary answer, not an incident. A result carries a code
// and, for an HTTP failure, the status: the server's body is never passed along,
// and nothing is logged.
//
// Not `aiFetch`: that retries through the rescue fetch and warns about a network
// failure, which is right for a chat turn and wrong for a probe of a server that
// is very often simply not running. The user agent it would have added is still
// set by `withUserAgent`, since gateways reject a bare `node`.
import { aiEffortOf, aiEffortsOf, type AiEffort } from './effort'
import { withUserAgent } from './fetch'
import { ResponseBodyTooLargeError, endpointUrl, readCappedResponseText } from './protocols/shared'
import { AiTimeoutError, createStreamWatchdog } from './watchdog'

export type AiLocalServerKind = 'ollama' | 'openai-compatible'

/**
 * Why a probe produced nothing:
 * `unreachable` nothing answered at the address, `timeout` something is
 * listening but did not answer in time, `http` a route refused the request
 * (`status` says how), `shape` a route answered with something that is not this
 * API (an HTML page, malformed JSON, an oversized body).
 */
export type AiLocalDiscoveryErrorCode = 'unreachable' | 'timeout' | 'http' | 'shape'

/** One model a local server advertises, as far as discovery could tell */
export interface AiLocalModelSummary {
  /** the id the server takes in a request; a colon (`qwen3:8b`) is part of it */
  id: string
  /** disk size in bytes, when Ollama reported it */
  sizeBytes?: number | undefined
  /** parameter count label (`8.2B`), when Ollama reported it */
  parameterSize?: string | undefined
  /** quantization label (`Q4_K_M`), when Ollama reported it */
  quantization?: string | undefined
}

export type AiLocalDiscoveryResult =
  | { ok: true; server: AiLocalServerKind; models: AiLocalModelSummary[] }
  | { ok: false; errorCode: AiLocalDiscoveryErrorCode; status?: number | undefined }

/** What one model's server-side profile says, when it says anything at all */
export interface AiLocalInspection {
  /** the full window the model was built with (`model_info.*.context_length`) */
  contextLength?: number | undefined
  /** the window the loaded instance is running with (`/api/ps`) */
  runningContextLength?: number | undefined
  /** absent when the server listed no capabilities at all */
  tools?: boolean | undefined
  /** absent when the server listed no capabilities at all */
  vision?: boolean | undefined
  /**
   * the effort levels the model takes (`thinking.values`); empty when the
   * server's capability list says the model does not think, absent when it says nothing
   */
  efforts?: AiEffort[] | undefined
  defaultEffort?: AiEffort | undefined
}

export type AiLocalInspectionResult =
  | { ok: true; profile: AiLocalInspection }
  | { ok: false; errorCode: AiLocalDiscoveryErrorCode; status?: number | undefined }

export interface AiLocalDiscoveryRequest {
  /** the address the user saved; an OpenAI-compatible base normally ends in `/v1` */
  baseUrl: string
  /** sent as `Authorization: Bearer …` only when non-empty */
  apiKey?: string | undefined
}

/** What a caller in the main process (never the IPC payload) may add to a request. */
export interface AiLocalRequestOptions {
  /** aborting it ends the request in flight and sends no further one */
  signal?: AbortSignal | undefined
}

export interface AiLocalInspectionRequest extends AiLocalDiscoveryRequest {
  /** the id the server listed */
  model: string
  /** the kind discovered earlier; probed once when absent */
  server?: AiLocalServerKind | undefined
}

/** a server this slow is not usable for chat either, and the settings field must stay responsive */
const REQUEST_TIMEOUT_MS = 5000

/** ids past this are dropped; the picker is a settings control, not a catalog browser */
const MAX_MODELS = 2000

/** a tags or models list is a few hundred KB at worst; past this the endpoint is not what it claims */
const MAX_BODY_BYTES = 2 * 1024 * 1024

interface AiLocalFailure {
  ok: false
  errorCode: AiLocalDiscoveryErrorCode
  status?: number | undefined
}

type ProbeTextResult = { ok: true; text: string } | AiLocalFailure
type ProbeModelsResult = { ok: true; models: AiLocalModelSummary[] } | AiLocalFailure

function failureOf(errorCode: AiLocalDiscoveryErrorCode, status?: number): AiLocalFailure {
  return status === undefined ? { ok: false, errorCode } : { ok: false, errorCode, status }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** JSON parsing is part of reading the wire shape; a parse error is a `shape` answer */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/**
 * The saved address with trailing slashes removed, or undefined for anything
 * that is not an `http(s)` URL. The settings field hands over whatever was
 * typed, and `endpointUrl` must not be asked to parse it.
 */
function normalizedBaseOf(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return trimmed
  } catch {
    return undefined
  }
}

/**
 * The server root Ollama's own routes live under: the saved base normally ends
 * in `/v1` (the OpenAI-compatible shape), which is not part of `/api/tags`.
 */
function ollamaRootOf(base: string): string {
  const url = new URL(base)
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = path.endsWith('/v1') ? path.slice(0, -'/v1'.length) : path
  return url.toString()
}

function requestHeadersOf(apiKey: unknown): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const key = typeof apiKey === 'string' ? apiKey.trim() : ''
  // an empty `Bearer ` is a malformed credential strict servers reject, and local
  // servers usually need no key at all
  if (key) headers.Authorization = `Bearer ${key}`
  return headers
}

/**
 * One request, capped and timed out. A timeout surfaces from the watchdog as
 * `AiTimeoutError`; everything else that goes wrong at the network layer is
 * `unreachable`. Body errors only become `shape` when the body was too large —
 * an abort while reading must still reach the watchdog so it can name a timeout.
 */
async function requestText(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<ProbeTextResult> {
  // the caller's signal (a cancelled connection test) ends the request with it
  const watchdog = createStreamWatchdog(signal, REQUEST_TIMEOUT_MS)
  try {
    return await watchdog.guard(async () => {
      const response = await fetch(url, withUserAgent({ ...init, signal: watchdog.signal }))
      if (!response.ok) {
        // the refusal body is never read; only the status says anything
        void response.body?.cancel().catch(() => undefined)
        return failureOf('http', response.status)
      }
      try {
        const text = await readCappedResponseText(response, { maxBytes: MAX_BODY_BYTES })
        return { ok: true, text }
      } catch (error) {
        if (error instanceof ResponseBodyTooLargeError) return failureOf('shape')
        throw error
      }
    })
  } catch (error) {
    return failureOf(error instanceof AiTimeoutError ? 'timeout' : 'unreachable')
  }
}

/** One Ollama model entry with every malformed field dropped. */
function ollamaModelOf(id: string, entry: Record<string, unknown>): AiLocalModelSummary {
  const model: AiLocalModelSummary = { id }
  if (typeof entry.size === 'number' && Number.isFinite(entry.size) && entry.size >= 0) {
    model.sizeBytes = entry.size
  }
  const details = isRecord(entry.details) ? entry.details : undefined
  const parameterSize = trimmedString(details?.parameter_size)
  if (parameterSize) model.parameterSize = parameterSize
  const quantization = trimmedString(details?.quantization_level)
  if (quantization) model.quantization = quantization
  return model
}

async function probeOllamaTags(
  base: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<ProbeModelsResult> {
  const result = await requestText(endpointUrl(ollamaRootOf(base), 'api/tags'), { headers }, signal)
  if (!result.ok) return result
  const body = parseJson(result.text)
  if (!isRecord(body) || !Array.isArray(body.models)) return failureOf('shape')
  const models: AiLocalModelSummary[] = []
  const seen = new Set<string>()
  for (const entry of body.models) {
    if (models.length >= MAX_MODELS) break
    // one unusable entry must not take the whole list down with it
    if (!isRecord(entry)) continue
    const id = trimmedString(entry.name)
    if (!id || seen.has(id)) continue
    seen.add(id)
    models.push(ollamaModelOf(id, entry))
  }
  return { ok: true, models }
}

async function probeOpenAiModels(
  base: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<ProbeModelsResult> {
  const result = await requestText(endpointUrl(base, 'models'), { headers }, signal)
  if (!result.ok) return result
  const body = parseJson(result.text)
  if (!isRecord(body) || !Array.isArray(body.data)) return failureOf('shape')
  const models: AiLocalModelSummary[] = []
  const seen = new Set<string>()
  for (const entry of body.data) {
    if (models.length >= MAX_MODELS) break
    const id = isRecord(entry) ? trimmedString(entry.id) : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    // the generic route carries ids only; capabilities are never guessed from it
    models.push({ id })
  }
  return { ok: true, models }
}

/**
 * How much a failed probe says about the address. A malformed answer from a
 * route proves something is there but is not this API; a real refusal (401,
 * 500…) is nearly as telling; a timeout means something is listening; a 404
 * only says the route does not exist (expected on the other server kind), and
 * silence says nothing at all.
 */
function informativenessOf(failure: AiLocalFailure): number {
  if (failure.errorCode === 'shape') return 4
  if (failure.errorCode === 'http') return failure.status !== 404 ? 3 : 1
  if (failure.errorCode === 'timeout') return 2
  return 0
}

function mostInformativeFailure(first: AiLocalFailure, second: AiLocalFailure): AiLocalFailure {
  // on a tie the second probe wins: `/models` is the route of the address the
  // user saved, so its answer is the one that concerns that address
  return informativenessOf(second) >= informativenessOf(first) ? second : first
}

/**
 * The models a local server advertises.
 *
 * Ollama's `/api/tags` at the server root is tried first, because it carries
 * the size, parameter and quantization labels the picker shows; the generic
 * `/models` route of the saved base is the fallback. The first well-formed
 * answer wins, so a working Ollama server is never asked twice.
 *
 * Server order is preserved, duplicate and blank ids are dropped, and the list
 * is capped. Never throws and never rejects.
 */
export async function listLocalModels(
  input: AiLocalDiscoveryRequest,
  options?: AiLocalRequestOptions,
): Promise<AiLocalDiscoveryResult> {
  try {
    const base = normalizedBaseOf(input?.baseUrl)
    if (!base) return failureOf('unreachable')
    const headers = requestHeadersOf(input?.apiKey)
    const signal = options?.signal

    const ollama = await probeOllamaTags(base, headers, signal)
    if (ollama.ok) return { ok: true, server: 'ollama', models: ollama.models }
    // a cancelled caller wants no second request
    if (signal?.aborted) return ollama

    const generic = await probeOpenAiModels(base, headers, signal)
    if (generic.ok) return { ok: true, server: 'openai-compatible', models: generic.models }

    return mostInformativeFailure(ollama, generic)
  } catch {
    // a function whose contract is "never throw" keeps that promise even if a
    // future edit grows an unexpected path
    return failureOf('unreachable')
  }
}

/**
 * The server kind, decided by one `/api/tags` probe: a well-formed answer means
 * Ollama; a 404/405 is how an OpenAI-compatible server says it has no Ollama
 * route; anything else (silence, a timeout, a refusal or an HTML page) leaves
 * the kind unknown and is returned as the failure it is, rather than guessed
 * away as the generic kind.
 */
async function resolveServerKind(
  base: string,
  headers: Record<string, string>,
): Promise<{ ok: true; server: AiLocalServerKind } | AiLocalFailure> {
  const tags = await requestText(endpointUrl(ollamaRootOf(base), 'api/tags'), { headers })
  if (!tags.ok) {
    const noOllamaRoute = tags.errorCode === 'http' && (tags.status === 404 || tags.status === 405)
    return noOllamaRoute ? { ok: true, server: 'openai-compatible' } : tags
  }
  const body = parseJson(tags.text)
  return isRecord(body) && Array.isArray(body.models)
    ? { ok: true, server: 'ollama' }
    : failureOf('shape')
}

/** The first `*.context_length` key in `model_info`, when it carries a usable number. */
function contextLengthOf(raw: unknown): number | undefined {
  if (!isRecord(raw)) return undefined
  for (const key of Object.keys(raw)) {
    if (!key.endsWith('.context_length')) continue
    const value = raw[key]
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
  }
  return undefined
}

/**
 * The context window of the loaded instance, when `/api/ps` names this model.
 * Best effort: a server too old for `/api/ps`, a refused route or a model that
 * is simply not loaded leaves the value unknown instead of failing the
 * inspection, which already has the `/api/show` answer.
 */
async function runningContextLengthOf(
  root: string,
  headers: Record<string, string>,
  model: string,
): Promise<number | undefined> {
  if (!model) return undefined
  const result = await requestText(endpointUrl(root, 'api/ps'), { headers })
  if (!result.ok) return undefined
  const body = parseJson(result.text)
  if (!isRecord(body) || !Array.isArray(body.models)) return undefined
  for (const entry of body.models) {
    if (!isRecord(entry)) continue
    // old `/api/ps` answers name the model `name`, newer ones also carry `model`
    const names = [trimmedString(entry.name), trimmedString(entry.model)]
    if (!names.includes(model)) continue
    const value = entry.context_length
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
  }
  return undefined
}

async function inspectOllamaModel(
  base: string,
  headers: Record<string, string>,
  model: string,
): Promise<AiLocalInspectionResult> {
  const root = ollamaRootOf(base)
  const show = await requestText(endpointUrl(root, 'api/show'), {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  })
  if (!show.ok) return show
  const body = parseJson(show.text)
  if (!isRecord(body)) return failureOf('shape')

  const profile: AiLocalInspection = {}
  // An explicit list is the server's complete statement: a missing entry is a
  // "no". With no list at all the server said nothing, so both stay unknown.
  if (Array.isArray(body.capabilities)) {
    profile.tools = body.capabilities.includes('tools')
    profile.vision = body.capabilities.includes('vision')
    if (!body.capabilities.includes('thinking')) profile.efforts = []
  }
  // named levels (`think: "high"`); a model that only turns thinking on or off lists none
  const thinking = isRecord(body.thinking) ? body.thinking : undefined
  const efforts = aiEffortsOf(thinking?.values)
  if (efforts) {
    profile.efforts = efforts
    const defaultEffort = aiEffortOf(thinking?.default)
    if (defaultEffort && efforts.includes(defaultEffort)) profile.defaultEffort = defaultEffort
  }
  const contextLength = contextLengthOf(body.model_info)
  if (contextLength !== undefined) profile.contextLength = contextLength

  const runningContextLength = await runningContextLengthOf(root, headers, model)
  if (runningContextLength !== undefined) profile.runningContextLength = runningContextLength

  return { ok: true, profile }
}

/**
 * What one model reports about itself.
 *
 * A generic OpenAI-compatible server has no inspection route, so the profile is
 * empty: the app treats an unknown capability as unknown rather than guessing.
 * When the kind was not discovered earlier, `/api/tags` is probed once. A 404 or
 * 405 there means the generic kind (the server legitimately has no Ollama
 * route); any other failure is reported instead of being read as "generic".
 *
 * Never throws and never rejects.
 */
export async function inspectLocalModel(
  input: AiLocalInspectionRequest,
): Promise<AiLocalInspectionResult> {
  try {
    const base = normalizedBaseOf(input?.baseUrl)
    if (!base) return failureOf('unreachable')
    const headers = requestHeadersOf(input?.apiKey)
    const model = typeof input?.model === 'string' ? input.model.trim() : ''

    const given =
      input?.server === 'ollama' || input?.server === 'openai-compatible' ? input.server : undefined
    if (given === 'openai-compatible') return { ok: true, profile: {} }
    if (given === 'ollama') return await inspectOllamaModel(base, headers, model)

    const resolved = await resolveServerKind(base, headers)
    if (!resolved.ok) return resolved
    if (resolved.server === 'openai-compatible') return { ok: true, profile: {} }
    return await inspectOllamaModel(base, headers, model)
  } catch {
    return failureOf('unreachable')
  }
}
