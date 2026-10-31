/**
 * The Google sign-in for an installed app, in the main process. The app opens
 * Google's consent page in the system browser, the user signs in and allows
 * Drive access there, Google sends the browser back to a one-shot server on
 * this PC's loopback address with a code, and the code (with the PKCE
 * verifier) buys a refresh token. The app never sees the Google password and
 * draws no sign-in form of its own.
 *
 * The same round trip can show Google's file picker (decision 0085): the
 * consent page then lets the person choose Drive files, and the ids of the
 * chosen files come back with the code. Those files are what the app may open.
 *
 * Node-only: it binds a socket. Every network call goes through an injectable
 * fetch so tests never reach Google.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

/**
 * The one scope the app asks for (decision 0085): only the Drive files the
 * person picked in Google's picker, or that the app made, to read and to save
 * back in place. Google's picker for installed apps allows no other scope.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

/** The most picked file ids one round trip hands on */
export const MAX_PICKED_FILES = 50

/** how long the browser sign-in may take before the waiting server gives up */
export const GOOGLE_SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000

const REQUEST_TIMEOUT_MS = 20_000

/** The OAuth client the app was built with. Both come from the build; neither is user input. */
export interface GoogleClient {
  clientId: string
  /** Google issues one to desktop clients and does not treat it as confidential */
  clientSecret: string
}

/**
 * cancelled: the user pressed cancel, or a newer attempt replaced this one;
 * timeout: the browser never came back in time; denied: the user refused, or
 * Google refused the code; scope: the user unticked Drive access on the
 * consent page; network: Google could not be reached, or answered with
 * something unusable.
 */
export type GoogleSignInFailure = 'cancelled' | 'timeout' | 'denied' | 'scope' | 'network'

export interface GoogleTokens {
  refreshToken: string
  accessToken: string
  /** epoch ms after which the access token must not be used */
  expiresAt: number
}

export type GoogleSignInResult =
  { ok: true; tokens: GoogleTokens } | { ok: false; reason: GoogleSignInFailure }

/** Google's file picker on the consent page; `multiple` lets the person choose more than one */
export interface PickRequest {
  multiple: boolean
}

/** A sign-in that showed the picker: the tokens and the ids of the chosen files */
export type GooglePickResult =
  { ok: true; tokens: GoogleTokens; picked: string[] } | { ok: false; reason: GoogleSignInFailure }

/** The page the browser shows once it is back on this PC */
export interface SignInPage {
  lang: string
  title: string
  body: string
}

export interface GoogleSignInOptions {
  client: GoogleClient
  /** opens the consent page in the system browser; false when no browser took it */
  openBrowser: (url: string) => Promise<boolean>
  /** what the browser shows after the sign-in, by outcome */
  pages: { done: SignInPage; failed: SignInPage }
  signal?: AbortSignal | undefined
  fetch?: FetchLike | undefined
  timeoutMs?: number | undefined
  /** clock for token expiry; tests pin it */
  now?: (() => number) | undefined
  /** show Google's file picker on the consent page */
  pick?: PickRequest | undefined
}

function base64url(bytes: Buffer): string {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A PKCE verifier and its S256 challenge */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

/** The loopback address Google sends the browser back to */
export function redirectUri(port: number): string {
  return `http://127.0.0.1:${port}/callback`
}

/** The consent page address */
export function googleAuthUrl(
  clientId: string,
  port: number,
  challenge: string,
  state: string,
  pick?: PickRequest,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(port),
    response_type: 'code',
    scope: DRIVE_SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    // a refresh token on every sign-in, so a second sign-in replaces the first cleanly
    access_type: 'offline',
    prompt: 'consent',
  })
  if (pick) {
    params.set('trigger_onepick', 'true')
    if (pick.multiple) params.set('allow_multiple', 'true')
  }
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/** A self-contained page: no script, no outside resource */
export function signInPageHtml(page: SignInPage): string {
  return `<!doctype html>
<html lang="${escapeHtml(page.lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)}</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0}
main{max-width:28rem;padding:2rem;text-align:center}h1{font-size:1.4rem}p{line-height:1.6}</style>
</head><body><main><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.body)}</p></main></body></html>`
}

function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
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

type CodeOutcome =
  | { ok: true; code: string; port: number; picked: string[] }
  | { ok: false; reason: GoogleSignInFailure }

/**
 * The file ids in a `picked_file_ids` answer: comma-separated, each checked
 * against Drive's id shape, duplicates dropped, at most MAX_PICKED_FILES.
 */
export function pickedFileIds(raw: string | null): string[] {
  if (!raw) return []
  const out: string[] = []
  for (const id of raw.split(',')) {
    const trimmed = id.trim()
    if (/^[\w-]{1,200}$/.test(trimmed) && !out.includes(trimmed)) out.push(trimmed)
    if (out.length >= MAX_PICKED_FILES) break
  }
  return out
}

/**
 * Wait for the browser to come back with a code. The redirect names
 * 127.0.0.1, so only that address is bound: nothing off this PC can reach the
 * server, and it answers one `/callback` request whose `state` matches.
 */
async function waitForCode(
  options: GoogleSignInOptions,
  challenge: string,
  state: string,
): Promise<CodeOutcome> {
  let server: Server | null = null
  let settle: (result: CodeOutcome) => void = () => {}
  const outcome = new Promise<CodeOutcome>((resolve) => (settle = resolve))
  let port = 0
  let answered = false

  const handle = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const returnedState = url.searchParams.get('state') ?? ''
    // a stray request (favicon, another program guessing) neither answers nor ends the wait
    if (
      req.method !== 'GET' ||
      url.pathname !== '/callback' ||
      answered ||
      !sameText(returnedState, state)
    ) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end()
      return
    }
    answered = true
    const code = url.searchParams.get('code')
    // the token answer is checked again; this only spares a round trip when Drive was unticked
    const scope = url.searchParams.get('scope')
    const granted = scope === null || scope.split(' ').includes(DRIVE_SCOPE)
    const ok = Boolean(code) && granted
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      'Cache-Control': 'no-store',
    })
    res.end(signInPageHtml(ok ? options.pages.done : options.pages.failed))
    if (code && granted) {
      settle({
        ok: true,
        code,
        port,
        picked: pickedFileIds(url.searchParams.get('picked_file_ids')),
      })
    } else if (code) settle({ ok: false, reason: 'scope' })
    // closing the picker comes back as a refusal; nothing was asked of Google then
    else settle({ ok: false, reason: options.pick ? 'cancelled' : 'denied' })
  }

  try {
    server = createServer(handle)
    port = await listen(server, '127.0.0.1')
    const timer = setTimeout(
      () => settle({ ok: false, reason: 'timeout' }),
      options.timeoutMs ?? GOOGLE_SIGN_IN_TIMEOUT_MS,
    )
    const onAbort = () => settle({ ok: false, reason: 'cancelled' })
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted) onAbort()
    else if (
      !(await options.openBrowser(
        googleAuthUrl(options.client.clientId, port, challenge, state, options.pick),
      ))
    ) {
      settle({ ok: false, reason: 'network' })
    }
    const result = await outcome
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
    return result
  } catch {
    return { ok: false, reason: 'network' }
  } finally {
    if (server) {
      server.close()
      server.closeAllConnections?.()
    }
  }
}

interface TokenAnswer {
  access_token?: unknown
  refresh_token?: unknown
  expires_in?: unknown
  scope?: unknown
}

function tokensFrom(
  body: TokenAnswer,
  now: number,
): { accessToken: string; expiresAt: number; refreshToken?: string } | null {
  if (typeof body.access_token !== 'string' || !body.access_token) return null
  const seconds =
    typeof body.expires_in === 'number' && Number.isFinite(body.expires_in) ? body.expires_in : 0
  // a minute's margin so a token is never used in its last moments
  const expiresAt = now + Math.max(0, seconds - 60) * 1000
  return typeof body.refresh_token === 'string' && body.refresh_token
    ? { accessToken: body.access_token, expiresAt, refreshToken: body.refresh_token }
    : { accessToken: body.access_token, expiresAt }
}

/** Trade the code from the browser for tokens */
export async function exchangeGoogleCode(
  client: GoogleClient,
  code: string,
  verifier: string,
  port: number,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
  now: () => number = Date.now,
): Promise<GoogleSignInResult> {
  try {
    const response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: redirectUri(port),
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }).toString(),
      signal: withTimeout(signal),
    })
    if (response.status === 400 || response.status === 401) return { ok: false, reason: 'denied' }
    if (!response.ok) return { ok: false, reason: 'network' }
    const body = (await response.json()) as TokenAnswer
    if (typeof body.scope === 'string' && !body.scope.split(' ').includes(DRIVE_SCOPE)) {
      return { ok: false, reason: 'scope' }
    }
    const tokens = tokensFrom(body, now())
    if (!tokens?.refreshToken) return { ok: false, reason: 'network' }
    return {
      ok: true,
      tokens: {
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
        expiresAt: tokens.expiresAt,
      },
    }
  } catch {
    return { ok: false, reason: signal?.aborted ? 'cancelled' : 'network' }
  }
}

/**
 * revoked: Google no longer honours the refresh token (the user removed the
 * app's access, changed the password, or a test-mode token aged out); the
 * connection is over. network: try again later; the token may still be good.
 */
export type RefreshResult =
  | { ok: true; accessToken: string; expiresAt: number }
  | { ok: false; reason: 'revoked' | 'network' }

/** A fresh access token from the refresh token */
export async function refreshGoogleToken(
  client: GoogleClient,
  refreshToken: string,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
  now: () => number = Date.now,
): Promise<RefreshResult> {
  try {
    const response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: client.clientId,
        client_secret: client.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      signal: withTimeout(signal),
    })
    if (response.status === 400 || response.status === 401) {
      const body = (await response.json().catch(() => ({}))) as { error?: unknown }
      // invalid_grant is the one answer that means the grant itself is gone
      return body.error === 'invalid_grant'
        ? { ok: false, reason: 'revoked' }
        : { ok: false, reason: 'network' }
    }
    if (!response.ok) return { ok: false, reason: 'network' }
    const tokens = tokensFrom((await response.json()) as TokenAnswer, now())
    return tokens
      ? { ok: true, accessToken: tokens.accessToken, expiresAt: tokens.expiresAt }
      : { ok: false, reason: 'network' }
  } catch {
    return { ok: false, reason: 'network' }
  }
}

/** Ask Google to forget the grant. Best effort: the app forgets the token either way. */
export async function revokeGoogleToken(token: string, fetchImpl: FetchLike): Promise<boolean> {
  try {
    const response = await fetchImpl(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
      signal: withTimeout(),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * The whole browser sign-in: consent in the browser (with Google's picker
 * when `pick` is given), then the code traded for tokens
 */
export async function signInWithGoogle(options: GoogleSignInOptions): Promise<GooglePickResult> {
  if (!options.fetch) return { ok: false, reason: 'network' }
  const { verifier, challenge } = pkcePair()
  const state = base64url(randomBytes(16))
  const code = await waitForCode(options, challenge, state)
  if (!code.ok) return code
  const result = await exchangeGoogleCode(
    options.client,
    code.code,
    verifier,
    code.port,
    options.fetch,
    options.signal,
    options.now,
  )
  return result.ok ? { ...result, picked: code.picked } : result
}
