/**
 * The OAuth side of the ChatGPT connection (decision 0081): OpenAI's "Sign in
 * with ChatGPT" for open-source, locally run apps. The app registers itself as
 * an agent of the user's ChatGPT account and gets tokens of its own, scoped to
 * the user's ChatGPT plan. The sign-in page is OpenAI's, in the system
 * browser; the app never sees a password and has no client secret.
 *
 * Node-only: it binds a loopback socket. Every network call goes through an
 * injectable fetch, so tests never reach OpenAI.
 */
import { createHash, createPublicKey, randomBytes, verify, type JsonWebKey } from 'node:crypto'
// node:http is imported where a server starts: on Node 22 a static ESM import of
// it evaluates its WebSocket getter, which compiles undici's WebAssembly parser,
// and the command line imports this module from every command.
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { aiFetch } from '../fetch'
import { freeConnectPageHtml, type FreeConnectPage } from '../free-connect'
import { SUBSCRIPTION_LOGIN_ERROR_CODE } from '../subscription/contract'
import type { AiSubscriptionLoginFailureStep } from '../types'

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export const CHATGPT_ISSUER = 'https://auth.openai.com'
export const CHATGPT_AUTHORIZE_URL = `${CHATGPT_ISSUER}/api/accounts/authorize`
export const CHATGPT_TOKEN_URL = `${CHATGPT_ISSUER}/api/accounts/oauth/token`
export const CHATGPT_JWKS_URL = `${CHATGPT_ISSUER}/.well-known/jwks.json`
export const CHATGPT_OIDC_CONFIG_URL = `${CHATGPT_ISSUER}/.well-known/openid-configuration`
/** the API the tokens are bound to, sent as `resource` on every authorization and token call */
export const CHATGPT_RESOURCE = 'https://api.openai.com/v1'
/** the client id of a first registration; the callback brings the id OpenAI issued */
export const CHATGPT_DYNAMIC_CLIENT_ID = 'dynamic_agent_client'
/** the scope that lets requests draw on the user's ChatGPT plan */
export const CHATGPT_PLAN_SCOPE = 'chatgpt.tokens.use.direct'
export const CHATGPT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'resource.invoke',
  CHATGPT_PLAN_SCOPE,
] as const

/** how long the browser sign-in may take before the waiting server gives up */
export const CHATGPT_SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000

const REQUEST_TIMEOUT_MS = 20_000
/** an ID token is accepted this long past its expiry, for a PC clock that runs a little behind */
const CLOCK_SKEW_SECONDS = 300

/**
 * cancelled: the user pressed cancel, or a newer attempt replaced this one;
 * timeout: the browser never came back in time; denied: the user or OpenAI
 * refused, or the answer did not check out; no-plan: the sign-in worked but the
 * user did not allow use of the ChatGPT plan; network: OpenAI could not be
 * reached, or answered with something unusable.
 */
export type ChatGptSignInFailure = 'cancelled' | 'timeout' | 'denied' | 'no-plan' | 'network'

/** Which step of a sign-in failed (`AI_SUBSCRIPTION_LOGIN_FAILURE_STEPS`) */
export type ChatGptSignInStep = AiSubscriptionLoginFailureStep

/** A failed sign-in: why, the step it failed at, and the token endpoint's answer when that was it */
export interface ChatGptSignInFailed {
  ok: false
  reason: ChatGptSignInFailure
  step?: ChatGptSignInStep | undefined
  /** the token endpoint's HTTP status, on `token-refused` and `token-http` */
  httpStatus?: number | undefined
  /** the OAuth `error` code of the token endpoint or the callback, when it has an identifier's shape */
  oauthError?: string | undefined
}

export interface ChatGptTokenSet {
  accessToken: string
  refreshToken: string
  /** epoch milliseconds */
  expiresAt: number
  scopes: string[]
  /** present on a sign-in, and on a refresh when OpenAI sends a new one */
  idToken?: string | undefined
  /**
   * The answer had no `scope` field (OpenAI documents it as always there).
   * The scopes are then empty; this tells that apart from a plan not granted.
   */
  scopeMissing?: true | undefined
}

function base64url(bytes: Buffer): string {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomToken(): string {
  return base64url(randomBytes(32))
}

/** A PKCE verifier and its S256 challenge */
export function chatGptPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken()
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function chatGptRedirectUri(port: number): string {
  return `http://127.0.0.1:${port}/callback`
}

export interface ChatGptAuthorizeParams {
  port: number
  challenge: string
  state: string
  nonce: string
  hostId: string
  /** the id OpenAI issued at an earlier sign-in of this host; absent: register anew */
  clientId?: string | undefined
  /** the app's name, shown to the user on a first registration */
  agentName: string
}

/** The sign-in page address */
export function chatGptAuthorizeUrl(params: ChatGptAuthorizeParams): string {
  const search = new URLSearchParams({
    client_id: params.clientId || CHATGPT_DYNAMIC_CLIENT_ID,
    ext_agent_host_id: params.hostId,
    response_type: 'code',
    redirect_uri: chatGptRedirectUri(params.port),
    scope: CHATGPT_SCOPES.join(' '),
    resource: CHATGPT_RESOURCE,
    state: params.state,
    nonce: params.nonce,
    code_challenge_method: 'S256',
    code_challenge: params.challenge,
  })
  // the name hint belongs to a new registration only
  if (!params.clientId) search.set('agent_name_hint', params.agentName)
  return `${CHATGPT_AUTHORIZE_URL}?${search.toString()}`
}

function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

async function listen(server: Server, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error) => reject(err)
    server.once('error', onError)
    server.listen(0, host, () => {
      server.off('error', onError)
      const address = server.address()
      resolve(typeof address === 'object' && address ? address.port : 0)
    })
  })
}

export type ChatGptCallback =
  { ok: true; code: string; clientId: string; port: number } | ChatGptSignInFailed

export interface ChatGptCallbackOptions {
  /** the address to open, once the waiting server knows its port */
  authorizeUrl: (port: number) => string
  state: string
  /** opens the sign-in page in the system browser; false when no browser took it */
  openBrowser: (url: string) => Promise<boolean>
  /** what the browser shows after the sign-in, by outcome */
  pages: { done: FreeConnectPage; failed: FreeConnectPage }
  signal?: AbortSignal | undefined
  timeoutMs?: number | undefined
}

/**
 * Wait for the browser to come back with a code. OpenAI sends it to
 * `127.0.0.1` (never `localhost`), so only that address is bound: nothing off
 * this PC can reach it. One `/callback` request with the right `state` is
 * answered; anything else gets a 404 and leaves the wait as it is.
 */
export async function waitForChatGptCallback(
  options: ChatGptCallbackOptions,
): Promise<ChatGptCallback> {
  let settle: (result: ChatGptCallback) => void = () => {}
  const outcome = new Promise<ChatGptCallback>((resolve) => (settle = resolve))
  let answered = false
  let port = 0

  const handle = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (
      req.method !== 'GET' ||
      url.pathname !== '/callback' ||
      answered ||
      url.searchParams.get('state') !== options.state
    ) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end()
      return
    }
    answered = true
    const code = url.searchParams.get('code')
    const clientId = url.searchParams.get('client_id')
    const callbackError = url.searchParams.get('error')
    const failedStep: ChatGptSignInStep | undefined = callbackError
      ? 'callback-error'
      : !code || !clientId
        ? 'callback-incomplete'
        : undefined
    const ok = failedStep === undefined
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'Cache-Control': 'no-store',
    })
    res.end(freeConnectPageHtml(ok ? options.pages.done : options.pages.failed))
    settle(
      ok
        ? { ok: true, code: code!, clientId: clientId!, port }
        : {
            ok: false,
            reason: 'denied',
            step: failedStep,
            ...(callbackError && SUBSCRIPTION_LOGIN_ERROR_CODE.test(callbackError)
              ? { oauthError: callbackError }
              : {}),
          },
    )
  }

  const { createServer } = await import('node:http')
  const server = createServer(handle)
  let listening = false
  try {
    port = await listen(server, '127.0.0.1')
    listening = true
    const timer = setTimeout(
      () => settle({ ok: false, reason: 'timeout' }),
      options.timeoutMs ?? CHATGPT_SIGN_IN_TIMEOUT_MS,
    )
    const onAbort = () => settle({ ok: false, reason: 'cancelled' })
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted) onAbort()
    else if (!(await options.openBrowser(options.authorizeUrl(port)))) {
      settle({ ok: false, reason: 'network', step: 'browser' })
    }
    const result = await outcome
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
    return result
  } catch {
    return { ok: false, reason: 'network', step: listening ? 'browser' : 'loopback' }
  } finally {
    server.close()
    server.closeAllConnections?.()
  }
}

interface TokenResponse {
  access_token?: unknown
  refresh_token?: unknown
  id_token?: unknown
  expires_in?: unknown
  scope?: unknown
  error?: unknown
}

/** The token endpoint's OAuth error code, passed on only with an identifier's shape: never free text */
function oauthErrorOf(body: unknown): string | undefined {
  const code = isRecord(body) ? body.error : undefined
  return typeof code === 'string' && SUBSCRIPTION_LOGIN_ERROR_CODE.test(code) ? code : undefined
}

function tokenSetOf(body: TokenResponse, now: number): ChatGptTokenSet | null {
  if (typeof body.access_token !== 'string' || !body.access_token) return null
  if (typeof body.refresh_token !== 'string' || !body.refresh_token) return null
  const seconds =
    typeof body.expires_in === 'number' && Number.isFinite(body.expires_in) && body.expires_in > 0
      ? body.expires_in
      : 3600
  const scopes =
    typeof body.scope === 'string' ? body.scope.split(/\s+/).filter((s) => s.length > 0) : []
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: now + seconds * 1000,
    scopes,
    ...(typeof body.scope === 'string' ? {} : { scopeMissing: true }),
    ...(typeof body.id_token === 'string' && body.id_token ? { idToken: body.id_token } : {}),
  }
}

/** Trade the code from the browser for tokens */
export async function exchangeChatGptCode(
  request: { code: string; clientId: string; verifier: string; port: number },
  fetchImpl: FetchLike = aiFetch,
  signal?: AbortSignal,
  now: () => number = Date.now,
): Promise<{ ok: true; tokens: ChatGptTokenSet } | ChatGptSignInFailed> {
  let reached = false
  try {
    const response = await fetchImpl(CHATGPT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: request.code,
        client_id: request.clientId,
        code_verifier: request.verifier,
        redirect_uri: chatGptRedirectUri(request.port),
        resource: CHATGPT_RESOURCE,
      }).toString(),
      signal: withTimeout(signal),
    })
    reached = true
    if (!response.ok) {
      const oauthError = oauthErrorOf(await response.json().catch(() => undefined))
      const refused = response.status === 400 || response.status === 401 || response.status === 403
      return {
        ok: false,
        reason: refused ? 'denied' : 'network',
        step: refused ? 'token-refused' : 'token-http',
        httpStatus: response.status,
        ...(oauthError ? { oauthError } : {}),
      }
    }
    const tokens = tokenSetOf((await response.json()) as TokenResponse, now())
    return tokens
      ? { ok: true, tokens }
      : { ok: false, reason: 'network', step: 'token-unreadable' }
  } catch {
    if (signal?.aborted) return { ok: false, reason: 'cancelled' }
    return {
      ok: false,
      reason: 'network',
      step: reached ? 'token-unreadable' : 'token-unreachable',
    }
  }
}

/** Refresh-token errors after which the stored session is of no more use */
const UNUSABLE_GRANT_ERRORS = new Set([
  'invalid_grant',
  'invalid_refresh_token',
  'token_expired',
  'refresh_token_expired',
  'refresh_token_invalidated',
  'refresh_token_reused',
])

/**
 * ok: new tokens (store them all at once, the refresh token included);
 * signed-out: the session is gone (revoked, expired, or the app was
 * disconnected in ChatGPT's settings) and the user must sign in again;
 * failed: a passing failure (network, a 5xx): keep the tokens and try later.
 */
export type ChatGptRefreshResult =
  { ok: true; tokens: ChatGptTokenSet } | { ok: false; reason: 'signed-out' | 'failed' }

export async function refreshChatGptTokens(
  request: { clientId: string; refreshToken: string },
  fetchImpl: FetchLike = aiFetch,
  signal?: AbortSignal,
  now: () => number = Date.now,
): Promise<ChatGptRefreshResult> {
  try {
    const response = await fetchImpl(CHATGPT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: request.clientId,
        refresh_token: request.refreshToken,
        resource: CHATGPT_RESOURCE,
      }).toString(),
      signal: withTimeout(signal),
    })
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) {
        const body = (await response.json().catch(() => ({}))) as TokenResponse
        const code = typeof body.error === 'string' ? body.error : ''
        // an unknown 4xx is no proof the session is gone: try again later
        if (UNUSABLE_GRANT_ERRORS.has(code) || response.status === 401) {
          return { ok: false, reason: 'signed-out' }
        }
      }
      return { ok: false, reason: 'failed' }
    }
    const tokens = tokenSetOf((await response.json()) as TokenResponse, now())
    return tokens ? { ok: true, tokens } : { ok: false, reason: 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Revoke the renewable session at sign-out. OpenAI answers 200 for a token
 * that is already invalid; true means the session is surely gone.
 */
export async function revokeChatGptSession(
  request: { clientId: string; refreshToken: string },
  fetchImpl: FetchLike = aiFetch,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const config = await fetchImpl(CHATGPT_OIDC_CONFIG_URL, { signal: withTimeout(signal) })
    if (!config.ok) return false
    const endpoint = ((await config.json()) as { revocation_endpoint?: unknown })
      .revocation_endpoint
    // the address comes off the network: only OpenAI's own sign-in host gets the token
    if (typeof endpoint !== 'string' || new URL(endpoint).origin !== CHATGPT_ISSUER) return false
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: request.refreshToken,
        token_type_hint: 'refresh_token',
        client_id: request.clientId,
      }).toString(),
      signal: withTimeout(signal),
    })
    return response.ok
  } catch {
    return false
  }
}

// ── The ID token ──

export interface ChatGptIdentity {
  /** the account's stable id */
  subject: string
  /** for display only; never written anywhere */
  email?: string | undefined
}

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** The keys OpenAI signs ID tokens with */
export async function fetchChatGptSigningKeys(
  fetchImpl: FetchLike = aiFetch,
  signal?: AbortSignal,
): Promise<JsonWebKey[]> {
  const response = await fetchImpl(CHATGPT_JWKS_URL, { signal: withTimeout(signal) })
  if (!response.ok) throw new Error(`JWKS request failed with HTTP ${response.status}`)
  const body = (await response.json()) as { keys?: unknown }
  return Array.isArray(body.keys) ? (body.keys.filter(isRecord) as JsonWebKey[]) : []
}

function signatureValid(alg: string, data: string, signature: Buffer, jwk: JsonWebKey): boolean {
  const key = createPublicKey({ key: jwk, format: 'jwk' })
  if (alg === 'RS256') return verify('sha256', Buffer.from(data), key, signature)
  if (alg === 'ES256') {
    return verify('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }, signature)
  }
  return false
}

/**
 * Check an ID token the way OpenAI asks: its signature against the published
 * keys, the issuer, the audience (the issued client id), the expiry, and the
 * nonce of this attempt when there is one. Null when any check fails.
 */
export function verifyChatGptIdToken(
  idToken: string,
  expected: { clientId: string; nonce?: string | undefined },
  keys: JsonWebKey[],
  nowSeconds: number = Math.floor(Date.now() / 1000),
): ChatGptIdentity | null {
  try {
    const parts = idToken.split('.')
    if (parts.length !== 3) return null
    const [rawHeader, rawPayload, rawSignature] = parts as [string, string, string]
    const header = decodeSegment(rawHeader)
    const payload = decodeSegment(rawPayload)
    if (!isRecord(header) || !isRecord(payload)) return null
    const alg = typeof header.alg === 'string' ? header.alg : ''
    const kid = typeof header.kid === 'string' ? header.kid : undefined
    const candidates = keys.filter((key) => !kid || (key as { kid?: unknown }).kid === kid)
    const signature = Buffer.from(rawSignature, 'base64url')
    const data = `${rawHeader}.${rawPayload}`
    if (!candidates.some((key) => signatureValid(alg, data, signature, key))) return null
    if (payload.iss !== CHATGPT_ISSUER) return null
    const aud = payload.aud
    const audiences = Array.isArray(aud) ? aud : [aud]
    if (!audiences.includes(expected.clientId)) return null
    if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SECONDS < nowSeconds) {
      return null
    }
    if (expected.nonce !== undefined && payload.nonce !== expected.nonce) return null
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    return {
      subject: payload.sub,
      ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
    }
  } catch {
    return null
  }
}

/** Fresh random values for one authorization attempt */
export function chatGptAttemptValues(): { state: string; nonce: string } {
  return { state: randomToken(), nonce: randomToken() }
}
