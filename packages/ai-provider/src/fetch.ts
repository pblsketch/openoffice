/**
 * In Electron main processes AI requests run on Node's fetch (undici), which
 * connects directly instead of going through Chromium's network stack. Under
 * VPN/tun setups those direct connections can get reset (ECONNRESET) while
 * Chromium traffic — login, renderer fetches — works fine. Main processes
 * inject Electron's net.fetch here as a rescue path: when the primary fetch
 * fails at the network layer, the request is retried once over the Chromium
 * stack. Renderers never inject one (their fetch already is Chromium's).
 */
import { PRODUCT_NAME } from '@genoffice/i18n'
import { freeLimitOf, isFreeTierModelRefusal } from './free-ai'

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

let rescueFetch: FetchLike | null = null

export function setRescueFetch(fn: FetchLike | null): void {
  rescueFetch = fn
}

/**
 * Node's fetch announces itself as a bare `node`, which gateways that watch
 * for anonymous automation treat as abusive traffic (OpenCode Go requires
 * clients to identify themselves and flags "broad" user agents). Main
 * processes refine the default with the app version.
 */
export const AI_DEFAULT_USER_AGENT = PRODUCT_NAME

let userAgent = AI_DEFAULT_USER_AGENT

export function setAiUserAgent(ua: string): void {
  userAgent = ua || AI_DEFAULT_USER_AGENT
}

/** protocols pass plain header records; keep that shape so callers can read the request back */
export function withUserAgent(init: RequestInit): RequestInit {
  const given = init.headers
  const headers: Record<string, string> = {}
  if (given instanceof Headers) given.forEach((value, name) => (headers[name] = value))
  else if (Array.isArray(given)) for (const [name, value] of given) headers[name] = value
  else Object.assign(headers, given)
  if (!Object.keys(headers).some((name) => name.toLowerCase() === 'user-agent')) {
    headers['User-Agent'] = userAgent
  }
  return { ...init, headers }
}

/**
 * A 403 with an HTML body is an edge block page (bot management, WAF), not an API
 * answer. Those edges score the Node network stack's TLS fingerprint differently
 * from Chromium's, so the rescue fetch (Electron net.fetch) often gets through.
 */
function isBlockPage(response: Response): boolean {
  return (
    response.status === 403 && (response.headers.get('content-type') || '').includes('text/html')
  )
}

/**
 * Waits before each new attempt after a transient refusal: a busy model (503,
 * 529) or a per-minute limit (429). Free tiers answer this way often (Gemini's
 * free tier refused most requests with 503 "high demand" on 2026-10-14), and a
 * request is resent only before any of its answer was read.
 */
const DEFAULT_TRANSIENT_RETRY_DELAYS_MS: readonly number[] = [2000, 5000]
let transientRetryDelays: readonly number[] = DEFAULT_TRANSIENT_RETRY_DELAYS_MS

/** Tests shorten or turn off the waits; null restores the default */
export function setAiTransientRetryDelays(delays: readonly number[] | null): void {
  transientRetryDelays = delays ?? DEFAULT_TRANSIENT_RETRY_DELAYS_MS
}

/** a Retry-After longer than this is not waited for: the failure is reported instead */
const MAX_RETRY_AFTER_MS = 20_000

function retryAfterMs(response: Response): number | undefined {
  const raw = response.headers.get('retry-after')
  if (!raw) return undefined
  const seconds = Number(raw)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const at = Date.parse(raw)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined
}

function wait(ms: number, signal: AbortSignal | null | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false)
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve(true)
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve(false)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Whether a refusal is worth one more try: a busy answer, or a 429 that is not
 * today's free allowance being used up (that one lasts until the reset).
 */
async function isTransientRefusal(response: Response): Promise<boolean> {
  if (response.status === 503 || response.status === 529) return true
  if (response.status !== 429) return false
  try {
    const text = `HTTP 429: ${await response.clone().text()}`
    return !freeLimitOf(text) && !isFreeTierModelRefusal(text)
  } catch {
    return true
  }
}

export async function aiFetch(url: string, rawInit: RequestInit): Promise<Response> {
  const init = withUserAgent(rawInit)
  const signal = init.signal as AbortSignal | null | undefined
  let response = await fetchOnce(url, init)
  const resendable = init.body == null || typeof init.body === 'string'
  for (const delay of transientRetryDelays) {
    if (!resendable || signal?.aborted || !(await isTransientRefusal(response))) break
    const after = retryAfterMs(response)
    if (after !== undefined && after > MAX_RETRY_AFTER_MS) break
    if (!(await wait(after ?? delay, signal))) break
    // the refused answer is dropped unread; only the last one reaches the caller
    void response.body?.cancel().catch(() => {})
    response = await fetchOnce(url, init)
  }
  return response
}

async function fetchOnce(url: string, init: RequestInit): Promise<Response> {
  const signal = init.signal as AbortSignal | null | undefined
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (primaryError) {
    if (!rescueFetch || signal?.aborted) throw primaryError
    console.warn('[ai-provider] fetch failed, retrying via rescue fetch:', String(primaryError))
    try {
      return await rescueFetch(url, init)
    } catch {
      throw primaryError
    }
  }
  const resendable = init.body == null || typeof init.body === 'string'
  if (rescueFetch && resendable && !signal?.aborted && isBlockPage(response)) {
    console.warn(
      '[ai-provider] 403 block page from',
      new URL(url).host,
      '- retrying via rescue fetch',
    )
    try {
      const rescued = await rescueFetch(url, init)
      if (!isBlockPage(rescued)) return rescued
    } catch {
      // fall through to the primary response
    }
  }
  return response
}
