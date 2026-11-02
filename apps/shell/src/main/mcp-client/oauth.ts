import { randomBytes } from 'node:crypto'
import {
  discoverOAuthServerInfo,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  startAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js'
import { OAuthError } from '@modelcontextprotocol/sdk/server/auth/errors.js'
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationMixed,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import {
  checkResourceAllowed,
  resourceUrlFromServerUrl,
} from '@modelcontextprotocol/sdk/shared/auth-utils.js'
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js'
import { checkResolvedServerAddress, type HostResolver } from './address'
import { startLoopbackReceiver, type LoopbackPages } from './oauth-loopback'
import type { McpOAuthConfig, McpServersStore } from './store'

/**
 * The browser sign-in to a remote MCP server (user MCP spec 4.8, 4.9),
 * following the MCP authorization rules: discovery from the server's
 * protected resource metadata, then the authorization server's metadata;
 * dynamic client registration when offered, else the client the person
 * entered under "advanced"; PKCE (S256), a fresh `state`, a return to
 * 127.0.0.1 and a ten-minute limit. The app draws no sign-in form: the
 * system browser shows the server's own page.
 *
 * Requests here go to the addresses discovery names (the one exception to
 * the registered origin, 5.2). Each must be https, or plain http to this PC
 * or a private address, judged by what the name resolves to. No redirect is
 * followed outside the address asked.
 *
 * Token text never reaches a log or an error message.
 */

/** how long the browser sign-in may take before the waiting server gives up */
export const MCP_SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000

/** a token is refreshed this long before the server says it ends */
const EXPIRY_MARGIN_MS = 60 * 1000

/** each request to an authorization server */
const AUTH_REQUEST_TIMEOUT_MS = 20_000

/** The network call the shell injects: Electron's `net.fetch` in the app, a stub in tests */
export type McpFetch = (url: string, init?: RequestInit) => Promise<Response>

/**
 * Where a server's OAuth values live: the store in the app, memory in
 * tests. `writeTokens('')` forgets the sign-in.
 */
export interface McpOAuthAccess {
  read(): McpOAuthConfig | null
  writeTokens(tokens: string): Promise<void>
}

/** The store's OAuth values of one server; writing adds the OAuth block when it is missing */
export function storeOAuthAccess(store: McpServersStore, serverId: string): McpOAuthAccess {
  return {
    read: () => store.server(serverId)?.oauth ?? null,
    writeTokens: async (tokens) => {
      await store.update((file) => {
        const server = file.servers.find((s) => s.id === serverId)
        if (!server || (!server.oauth && tokens === '')) return
        server.oauth = server.oauth
          ? { ...server.oauth, tokens }
          : { clientId: '', clientSecret: '', tokens }
      })
    },
  }
}

// ---- what is kept between runs ---------------------------------------------

/**
 * The sign-in as kept in `oauth.tokens` (sealed on disk): the tokens and
 * what is needed to refresh and revoke them without discovering again.
 */
export interface StoredOAuth {
  v: 1
  tokens: OAuthTokens
  /** epoch ms after which the access token is not used; null when the server gave no lifetime */
  expiresAt: number | null
  authorizationServerUrl: string
  metadata: AuthorizationServerMetadata
  resource: string | null
  /** the client registered for this sign-in; null when the person's entered client was used */
  registeredClient: OAuthClientInformationMixed | null
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseStoredOAuth(text: string): StoredOAuth | null {
  if (!text) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (
    !isRecord(raw) ||
    raw.v !== 1 ||
    !isRecord(raw.tokens) ||
    typeof raw.tokens.access_token !== 'string' ||
    typeof raw.authorizationServerUrl !== 'string' ||
    !isRecord(raw.metadata) ||
    typeof raw.metadata.token_endpoint !== 'string'
  ) {
    return null
  }
  const client =
    isRecord(raw.registeredClient) && typeof raw.registeredClient.client_id === 'string'
  return {
    v: 1,
    tokens: raw.tokens as unknown as OAuthTokens,
    expiresAt: typeof raw.expiresAt === 'number' ? raw.expiresAt : null,
    authorizationServerUrl: raw.authorizationServerUrl,
    metadata: raw.metadata as unknown as AuthorizationServerMetadata,
    resource: typeof raw.resource === 'string' ? raw.resource : null,
    registeredClient: client ? (raw.registeredClient as OAuthClientInformationMixed) : null,
  }
}

export function serializeStoredOAuth(stored: StoredOAuth): string {
  return JSON.stringify(stored)
}

/** Whether the access token should be refreshed before it is sent */
export function accessTokenExpired(stored: StoredOAuth, now: number): boolean {
  return stored.expiresAt !== null && now >= stored.expiresAt - EXPIRY_MARGIN_MS
}

function expiresAtOf(tokens: OAuthTokens, now: number): number | null {
  return typeof tokens.expires_in === 'number' && Number.isFinite(tokens.expires_in)
    ? now + tokens.expires_in * 1000
    : null
}

function clientOf(
  stored: Pick<StoredOAuth, 'registeredClient'>,
  config: McpOAuthConfig | null,
): OAuthClientInformationMixed | null {
  if (stored.registeredClient) return stored.registeredClient
  if (!config?.clientId) return null
  return config.clientSecret
    ? { client_id: config.clientId, client_secret: config.clientSecret }
    : { client_id: config.clientId }
}

// ---- requests to authorization servers --------------------------------------

/** An authorization-server address that is neither https nor a private plain-http address */
export class AuthAddressError extends Error {
  constructor() {
    super('insecure-address')
    this.name = 'AuthAddressError'
  }
}

const toUrl = (input: string | URL | Request): URL =>
  new URL(input instanceof Request ? input.url : input instanceof URL ? input.href : input)

/**
 * The fetch for sign-in, refresh and revoke: each address is checked as a
 * server address would be (4.3), redirects are not followed, and every
 * request has a time limit.
 */
export function authFetch(base: McpFetch, resolve: HostResolver): FetchLike {
  return async (input, init) => {
    const url = toUrl(input)
    const check = await checkResolvedServerAddress(url.href, resolve)
    if (!check.ok) throw new AuthAddressError()
    const timeout = AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS)
    return base(url.href, {
      ...init,
      redirect: 'manual',
      signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    })
  }
}

// ---- signing in ------------------------------------------------------------

/**
 * cancelled: stopped, or replaced by a newer attempt; timeout: the browser
 * did not come back in ten minutes; denied: refused in the browser or by the
 * token endpoint; not-supported: the server offers no usable MCP
 * authorization; client-required: no dynamic registration and no client
 * entered under "advanced"; network: a server could not be reached;
 * insecure-address: discovery named an address plain http may not reach;
 * key-in-use: the server is set up with a pasted `Authorization` header.
 */
export type McpSignInFailure =
  | 'cancelled'
  | 'timeout'
  | 'denied'
  | 'not-supported'
  | 'client-required'
  | 'network'
  | 'insecure-address'
  | 'key-in-use'

export type McpSignInResult = { ok: true } | { ok: false; reason: McpSignInFailure }

export interface McpSignInOptions {
  /** opens an address in the system browser (Electron `shell.openExternal`) */
  openExternal: (url: string) => Promise<unknown>
  /** what the browser shows once it is back, in the person's language */
  pages: LoopbackPages
  signal?: AbortSignal | undefined
  /** tests shorten it; the app keeps MCP_SIGN_IN_TIMEOUT_MS */
  timeoutMs?: number | undefined
}

export interface SignInContext extends McpSignInOptions {
  serverUrl: string
  /** from the server's last 401, when it named one */
  resourceMetadataUrl: URL | undefined
  /** from the server's last 401, when it named one */
  scope: string | undefined
  config: McpOAuthConfig | null
  /** the product name, sent when registering a client */
  clientName: string
  fetch: FetchLike
  resolve: HostResolver
  now: () => number
}

type Signed = { ok: true; stored: StoredOAuth } | { ok: false; reason: McpSignInFailure }

const base64url = (bytes: Buffer) =>
  bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function allowed(url: string, resolve: HostResolver): Promise<boolean> {
  return (await checkResolvedServerAddress(url, resolve)).ok
}

export async function signInToServer(ctx: SignInContext): Promise<Signed> {
  const fail = (reason: McpSignInFailure): Signed => ({ ok: false, reason })
  const failureOf = (err: unknown, fallback: McpSignInFailure): Signed => {
    if (ctx.signal?.aborted) return fail('cancelled')
    if (err instanceof AuthAddressError) return fail('insecure-address')
    return fail(fallback)
  }

  // discovery: the protected resource metadata, then the authorization server's
  let info: Awaited<ReturnType<typeof discoverOAuthServerInfo>>
  try {
    info = await discoverOAuthServerInfo(ctx.serverUrl, {
      ...(ctx.resourceMetadataUrl ? { resourceMetadataUrl: ctx.resourceMetadataUrl } : {}),
      fetchFn: ctx.fetch,
    })
  } catch (err) {
    return failureOf(err, 'network')
  }
  const metadata = info.authorizationServerMetadata
  // PKCE S256 is required; a server that does not say it supports it is not used
  if (!metadata || !metadata.code_challenge_methods_supported?.includes('S256')) {
    return fail('not-supported')
  }
  if (!metadata.response_types_supported.includes('code')) return fail('not-supported')
  let resource: URL | undefined
  if (info.resourceMetadata) {
    if (
      !checkResourceAllowed({
        requestedResource: resourceUrlFromServerUrl(ctx.serverUrl),
        configuredResource: info.resourceMetadata.resource,
      })
    ) {
      return fail('not-supported')
    }
    resource = new URL(info.resourceMetadata.resource)
  }
  if (!(await allowed(metadata.authorization_endpoint, ctx.resolve))) {
    return fail('insecure-address')
  }
  const scope = ctx.scope ?? info.resourceMetadata?.scopes_supported?.join(' ') ?? undefined

  const state = base64url(randomBytes(24))
  let receiver: Awaited<ReturnType<typeof startLoopbackReceiver>>
  try {
    receiver = await startLoopbackReceiver({
      state,
      pages: ctx.pages,
      timeoutMs: ctx.timeoutMs ?? MCP_SIGN_IN_TIMEOUT_MS,
      signal: ctx.signal,
    })
  } catch {
    return fail('network')
  }
  try {
    // the client: registered for this return address, else the one the person entered
    let registeredClient: OAuthClientInformationMixed | null = null
    let client = clientOf({ registeredClient: null }, ctx.config)
    if (!client) {
      if (!metadata.registration_endpoint) return fail('client-required')
      try {
        registeredClient = await registerClient(info.authorizationServerUrl, {
          metadata,
          clientMetadata: {
            client_name: ctx.clientName,
            redirect_uris: [receiver.redirectUri],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
          },
          ...(scope ? { scope } : {}),
          fetchFn: ctx.fetch,
        })
      } catch (err) {
        return failureOf(err, 'network')
      }
      client = registeredClient
    }

    const { authorizationUrl, codeVerifier } = await startAuthorization(
      info.authorizationServerUrl,
      {
        metadata,
        clientInformation: client,
        redirectUrl: receiver.redirectUri,
        state,
        ...(scope ? { scope } : {}),
        ...(resource ? { resource } : {}),
      },
    )
    if (ctx.signal?.aborted) return fail('cancelled')
    try {
      await ctx.openExternal(authorizationUrl.href)
    } catch {
      return fail('network')
    }
    const back = await receiver.outcome
    if (!back.ok) return fail(back.reason)

    let tokens: OAuthTokens
    try {
      tokens = await exchangeAuthorization(info.authorizationServerUrl, {
        metadata,
        clientInformation: client,
        authorizationCode: back.code,
        codeVerifier,
        redirectUri: receiver.redirectUri,
        ...(resource ? { resource } : {}),
        fetchFn: ctx.fetch,
      })
    } catch (err) {
      return failureOf(err, err instanceof OAuthError ? 'denied' : 'network')
    }
    return {
      ok: true,
      stored: {
        v: 1,
        tokens,
        expiresAt: expiresAtOf(tokens, ctx.now()),
        authorizationServerUrl: info.authorizationServerUrl,
        metadata,
        resource: resource?.href ?? null,
        registeredClient,
      },
    }
  } catch (err) {
    return failureOf(err, 'network')
  } finally {
    receiver.close()
  }
}

// ---- refreshing and revoking -------------------------------------------------

/** refused: the grant is gone and only a new sign-in helps; network: try again later */
export type RefreshOutcome =
  { ok: true; stored: StoredOAuth } | { ok: false; reason: 'refused' | 'network' }

/** OAuth answers that mean the refresh token or the client is no longer honoured */
const REFUSALS = new Set(['invalid_grant', 'invalid_client', 'unauthorized_client'])

export async function refreshStoredOAuth(
  stored: StoredOAuth,
  config: McpOAuthConfig | null,
  fetchFn: FetchLike,
  now: () => number,
): Promise<RefreshOutcome> {
  const client = clientOf(stored, config)
  const refreshToken = stored.tokens.refresh_token
  if (!client || !refreshToken) return { ok: false, reason: 'refused' }
  try {
    const tokens = await refreshAuthorization(stored.authorizationServerUrl, {
      metadata: stored.metadata,
      clientInformation: client,
      refreshToken,
      ...(stored.resource ? { resource: new URL(stored.resource) } : {}),
      fetchFn,
    })
    return { ok: true, stored: { ...stored, tokens, expiresAt: expiresAtOf(tokens, now()) } }
  } catch (err) {
    return err instanceof OAuthError && REFUSALS.has(err.errorCode)
      ? { ok: false, reason: 'refused' }
      : { ok: false, reason: 'network' }
  }
}

/**
 * Ask the authorization server to forget the grant (RFC 7009), when it
 * named a revocation endpoint. Best effort: false on any failure; the
 * caller forgets the tokens either way.
 */
export async function revokeStoredOAuth(
  stored: StoredOAuth,
  config: McpOAuthConfig | null,
  fetchFn: FetchLike,
): Promise<boolean> {
  // OAuth metadata names it; the OpenID Connect form of the type does not declare it
  const endpoint = (stored.metadata as { revocation_endpoint?: unknown }).revocation_endpoint
  if (typeof endpoint !== 'string' || !endpoint) return false
  const refresh = stored.tokens.refresh_token
  const body = new URLSearchParams({
    token: refresh ?? stored.tokens.access_token,
    token_type_hint: refresh ? 'refresh_token' : 'access_token',
  })
  const client = clientOf(stored, config)
  if (client) {
    body.set('client_id', client.client_id)
    if (client.client_secret) body.set('client_secret', client.client_secret)
  }
  try {
    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    await response.body?.cancel().catch(() => {})
    return response.ok
  } catch {
    return false
  }
}
