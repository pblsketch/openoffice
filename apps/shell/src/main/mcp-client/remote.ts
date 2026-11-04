import { PRODUCT_NAME } from '@genoffice/i18n'
import { extractWWWAuthenticateParams } from '@modelcontextprotocol/sdk/client/auth.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { FetchLike, Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  ErrorCode,
  McpError,
  ToolListChangedNotificationSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js'
import type { McpFailReason, McpTransport } from '../../shared/mcp-servers-api'
import { checkResolvedServerAddress, systemResolver, type HostResolver } from './address'
import { MCP_CALL_TIMEOUT_MS } from './limits'
import type { ListedTool, McpListing } from './listing'
import {
  accessTokenExpired,
  authFetch,
  parseStoredOAuth,
  refreshStoredOAuth,
  revokeStoredOAuth,
  serializeStoredOAuth,
  signInToServer,
  type McpFetch,
  type McpOAuthAccess,
  type McpSignInOptions,
  type McpSignInResult,
  type StoredOAuth,
} from './oauth'

/**
 * One remote MCP server as the shell's main process reaches it (user MCP
 * spec 5.2, 5.5, 5.6, 5.7, 4.8). Streamable HTTP first and legacy SSE once
 * when the server does not speak it; every request goes to the registered
 * origin only and a redirect elsewhere ends the request. The client declares
 * no capabilities, so the server's sampling, elicitation and roots requests
 * are answered "method not found".
 *
 * Plain http is checked against the addresses the name resolves to when
 * connecting and again before every request. The request itself still
 * resolves the name on its own (Electron's `net.fetch` takes no resolver, and
 * it is kept so proxy settings apply), so a name that changes its answer in
 * the moment between the check and the request is not caught. Only names
 * the person registered over plain http are exposed to this; https is not.
 *
 * Error texts carry the server name and a reason word, never an address,
 * header, token or server message.
 */

/** ending the server-side session on close is courtesy; it may not hold up closing */
const TERMINATE_TIMEOUT_MS = 5_000

/**
 * unreachable: no answer, or an answer that is not MCP; timeout: the time
 * limit passed; aborted: the person stopped it; refused-redirect: the server
 * sent the request to another origin; insecure-address: plain http to an
 * address outside this PC and the private ranges; login-required: the server
 * wants a sign-in (or a new key); server-error: the server answered the
 * request with an MCP error; http-error: the server answered, but with an
 * HTTP error status and no MCP (often a wrong address).
 */
export type RemoteMcpErrorReason =
  | 'unreachable'
  | 'http-error'
  | 'timeout'
  | 'aborted'
  | 'refused-redirect'
  | 'insecure-address'
  | 'login-required'
  | 'server-error'

export class RemoteMcpError extends Error {
  constructor(
    readonly serverName: string,
    readonly reason: RemoteMcpErrorReason,
  ) {
    super(`${serverName}: ${reason}`)
    this.name = 'RemoteMcpError'
  }
}

/**
 * What a server card shows after a failure: a fail reason, `login-required`,
 * or null when nothing is wrong with the server (the person stopped a call).
 */
export function statusFailureOf(error: unknown): McpFailReason | 'login-required' | null {
  if (!(error instanceof RemoteMcpError)) return 'unreachable'
  switch (error.reason) {
    case 'aborted':
      return null
    case 'login-required':
    case 'refused-redirect':
    case 'insecure-address':
    case 'http-error':
      return error.reason
    default:
      return 'unreachable'
  }
}

/** The registered server as the connection needs it */
export interface RemoteServerSettings {
  name: string
  url: string
  transport: McpTransport
  /** sent as given on every request; values are secrets */
  headers: Record<string, string>
}

export interface RemoteMcpConnectionOptions {
  server: RemoteServerSettings
  oauth: McpOAuthAccess
  /** `name` defaults to the product name; `version` is the app version */
  clientInfo: { name?: string; version: string }
  /** Electron `net.fetch` in the app, so the system proxy applies */
  fetch: McpFetch
  resolve?: HostResolver
  callTimeoutMs?: number
  now?: () => number
}

export interface RemoteMcpConnection {
  /** connect now ("연결 확인"); later calls connect on first use by themselves */
  connect(signal?: AbortSignal): Promise<void>
  /** every page of tools/list, and the instructions from initialize */
  listTools(signal?: AbortSignal): Promise<McpListing>
  /** the server's result as it came; shaping it for the model is the caller's */
  callTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<CallToolResult>
  /** the server said its tool list changed; returns the unsubscribe */
  onToolsChanged(listener: () => void): () => void
  /** the server asked for a sign-in that has not happened, or whose refresh was refused */
  needsSignIn(): boolean
  /** the browser sign-in; a newer attempt cancels the one before */
  signIn(options: McpSignInOptions): Promise<McpSignInResult>
  /** before the server is deleted: ask for revocation when offered, then forget the tokens */
  revoke(): Promise<void>
  close(): Promise<void>
}

/** headers the transport owns; a configured header of the same name is not sent */
const PROTOCOL_HEADERS = new Set([
  'content-type',
  'accept',
  'mcp-session-id',
  'mcp-protocol-version',
  'last-event-id',
])

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

const toUrl = (input: string | URL | Request): URL =>
  new URL(input instanceof Request ? input.url : input instanceof URL ? input.href : input)

function redirectTarget(response: Response, from: URL): URL | null {
  const location = response.headers.get('location')
  if (!location) return null
  try {
    return new URL(location, from)
  } catch {
    return null
  }
}

/** Resolve with `task`, or reject as soon as `signal` aborts */
function untilAborted<T>(task: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return task
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    task.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (err: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(err as Error)
      },
    )
  })
}

export function createRemoteMcpConnection(
  options: RemoteMcpConnectionOptions,
): RemoteMcpConnection {
  const { server, oauth } = options
  const resolve = options.resolve ?? systemResolver
  const now = options.now ?? Date.now
  const timeout = options.callTimeoutMs ?? MCP_CALL_TIMEOUT_MS
  const clientInfo = {
    name: options.clientInfo.name ?? PRODUCT_NAME,
    version: options.clientInfo.version,
  }
  const serverUrl = new URL(server.url)
  const origin = serverUrl.origin
  const keyConfigured = Object.keys(server.headers).some((k) => k.toLowerCase() === 'authorization')
  const signInFetch = authFetch(options.fetch, resolve)

  let client: Client | null = null
  let connecting: Promise<Client> | null = null
  /** bumped by close, so a connection finishing after it is dropped */
  let generation = 0
  let signInNeeded = false
  /** what the server's last 401 said about where to sign in */
  let challenge: { resourceMetadataUrl: URL | undefined; scope: string | undefined } = {
    resourceMetadataUrl: undefined,
    scope: undefined,
  }
  let refreshing: Promise<StoredOAuth> | null = null
  let signInAbort: AbortController | null = null
  /**
   * A failure the fetch wrapper saw while connecting. The SSE transport turns
   * errors from its event stream into its own, so the reason is kept here.
   */
  let seenFailure: RemoteMcpErrorReason | null = null
  /**
   * The server answered a request of this connection attempt with an HTTP
   * error status (not 401): it is there, but this is likely not its MCP
   * address. Not a failure by itself, since Streamable HTTP falls back to SSE
   * on a 4xx.
   */
  let answeredError = false
  const listeners = new Set<() => void>()

  const fail = (reason: RemoteMcpErrorReason) => new RemoteMcpError(server.name, reason)
  const record = (reason: RemoteMcpErrorReason) => {
    seenFailure = reason
    return fail(reason)
  }

  function classify(err: unknown, signal?: AbortSignal): RemoteMcpError {
    if (signal?.aborted) return fail('aborted')
    if (err instanceof RemoteMcpError) return err
    if (err instanceof McpError) {
      if (err.code === Number(ErrorCode.RequestTimeout)) return fail('timeout')
      if (err.code === Number(ErrorCode.ConnectionClosed)) return fail('unreachable')
      return fail('server-error')
    }
    if (err instanceof StreamableHTTPError && typeof err.code === 'number' && err.code >= 400) {
      return fail('http-error')
    }
    return fail(answeredError ? 'http-error' : 'unreachable')
  }

  // ---- tokens ----

  function refreshNow(stored: StoredOAuth): Promise<StoredOAuth> {
    refreshing ??= (async () => {
      const outcome = await refreshStoredOAuth(stored, oauth.read(), signInFetch, now)
      if (outcome.ok) {
        await oauth.writeTokens(serializeStoredOAuth(outcome.stored))
        return outcome.stored
      }
      if (outcome.reason === 'refused') {
        signInNeeded = true
        await oauth.writeTokens('')
        throw record('login-required')
      }
      throw record('unreachable')
    })().finally(() => {
      refreshing = null
    })
    return refreshing
  }

  async function currentTokens(): Promise<StoredOAuth | null> {
    if (keyConfigured) return null
    const stored = parseStoredOAuth(oauth.read()?.tokens ?? '')
    if (!stored) return null
    return accessTokenExpired(stored, now()) ? refreshNow(stored) : stored
  }

  // ---- the fetch every MCP request goes through ----

  const serverFetch: FetchLike = async (input, init) => {
    const url = toUrl(input)
    if (url.origin !== origin) throw record('refused-redirect')
    const check = await checkResolvedServerAddress(url.href, resolve)
    if (!check.ok) throw record(check.problem === 'unresolved' ? 'unreachable' : 'insecure-address')

    const send = async (bearer: string | null): Promise<Response> => {
      const headers = new Headers(init?.headers)
      for (const [name, value] of Object.entries(server.headers)) {
        if (!PROTOCOL_HEADERS.has(name.toLowerCase())) headers.set(name, value)
      }
      if (bearer) headers.set('Authorization', `Bearer ${bearer}`)
      const response = await options.fetch(url.href, { ...init, headers, redirect: 'manual' })
      if (response.status >= 400 && response.status !== 401) answeredError = true
      if (response.type === 'opaqueredirect') throw record('refused-redirect')
      if (REDIRECT_STATUSES.has(response.status)) {
        const target = redirectTarget(response, url)
        if (!target || target.origin !== origin) {
          await response.body?.cancel().catch(() => {})
          throw record('refused-redirect')
        }
      }
      return response
    }

    const stored = await currentTokens()
    let response = await send(stored?.tokens.access_token ?? null)
    if (response.status !== 401) return response
    const params = extractWWWAuthenticateParams(response)
    challenge = { resourceMetadataUrl: params.resourceMetadataUrl, scope: params.scope }
    await response.body?.cancel().catch(() => {})
    if (stored) {
      // a token the server no longer takes, before its time: one refresh, one retry
      const renewed = await refreshNow(stored)
      response = await send(renewed.tokens.access_token)
      if (response.status !== 401) return response
      await response.body?.cancel().catch(() => {})
    }
    signInNeeded = true
    throw record('login-required')
  }

  // ---- connecting ----

  async function attach(kind: 'streamable' | 'sse'): Promise<Client> {
    const transport =
      kind === 'sse'
        ? new SSEClientTransport(serverUrl, { fetch: serverFetch })
        : new StreamableHTTPClientTransport(serverUrl, { fetch: serverFetch })
    const next = new Client(clientInfo, { capabilities: {} })
    next.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      for (const listener of [...listeners]) listener()
    })
    // transport errors surface through the request that hit them
    next.onerror = () => {}
    next.onclose = () => {
      if (client === next) client = null
    }
    try {
      // the SDK types sessionId as `string | undefined`, which exact optional types reject
      await next.connect(transport as Transport, { timeout })
    } catch (err) {
      await next.close().catch(() => {})
      throw err
    }
    return next
  }

  /** a server that does not speak Streamable HTTP answers its POST with 4xx or another type */
  function fallsBack(err: unknown): boolean {
    if (err instanceof RemoteMcpError || seenFailure) return false
    if (!(err instanceof StreamableHTTPError) || err.code === undefined) return false
    return err.code === -1 || (err.code >= 400 && err.code < 500)
  }

  async function open(): Promise<Client> {
    seenFailure = null
    answeredError = false
    const check = await checkResolvedServerAddress(server.url, resolve)
    if (!check.ok) throw fail(check.problem === 'unresolved' ? 'unreachable' : 'insecure-address')
    try {
      if (server.transport === 'sse') return await attach('sse')
      try {
        return await attach('streamable')
      } catch (err) {
        if (!fallsBack(err)) throw err
        return await attach('sse')
      }
    } catch (err) {
      if (err instanceof RemoteMcpError) throw err
      throw seenFailure ? fail(seenFailure) : classify(err)
    }
  }

  async function ready(signal?: AbortSignal): Promise<Client> {
    if (client) return client
    if (!connecting) {
      const mine = generation
      connecting = open()
        .then(async (next) => {
          if (mine !== generation) {
            await next.close().catch(() => {})
            throw fail('aborted')
          }
          client = next
          signInNeeded = false
          // a 4xx before the SSE fallback worked says nothing about later failures
          answeredError = false
          return next
        })
        .finally(() => {
          connecting = null
        })
    }
    try {
      return await untilAborted(connecting, signal)
    } catch (err) {
      throw classify(err, signal)
    }
  }

  async function dropClient(): Promise<void> {
    generation += 1
    const current = client
    client = null
    if (!current) return
    const transport = current.transport
    if (transport instanceof StreamableHTTPClientTransport && transport.sessionId) {
      await Promise.race([
        transport.terminateSession().catch(() => {}),
        new Promise((r) => setTimeout(r, TERMINATE_TIMEOUT_MS).unref()),
      ])
    }
    await current.close().catch(() => {})
  }

  return {
    connect: async (signal) => {
      await ready(signal)
    },

    listTools: async (signal) => {
      const c = await ready(signal)
      const tools: ListedTool[] = []
      const seen = new Set<string>()
      let cursor: string | undefined
      try {
        do {
          const page = await c.listTools(cursor === undefined ? undefined : { cursor }, {
            timeout,
            ...(signal ? { signal } : {}),
          })
          for (const tool of page.tools) {
            const listed: ListedTool = {
              name: tool.name,
              inputSchema: tool.inputSchema as Record<string, unknown>,
            }
            if (tool.description !== undefined) listed.description = tool.description
            if (tool.annotations) listed.annotations = tool.annotations
            tools.push(listed)
          }
          cursor = page.nextCursor
          // a server that hands back a cursor it gave before would never end the list
          if (cursor !== undefined && seen.has(cursor)) break
          if (cursor !== undefined) seen.add(cursor)
        } while (cursor !== undefined)
      } catch (err) {
        throw classify(err, signal)
      }
      return { tools, instructions: c.getInstructions() ?? null }
    },

    callTool: async (name, args, signal) => {
      const c = await ready(signal)
      try {
        const result = await c.callTool({ name, arguments: args }, undefined, {
          timeout,
          ...(signal ? { signal } : {}),
        })
        return result as CallToolResult
      } catch (err) {
        throw classify(err, signal)
      }
    },

    onToolsChanged: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    needsSignIn: () => signInNeeded,

    signIn: async (signInOptions) => {
      if (keyConfigured) return { ok: false, reason: 'key-in-use' }
      signInAbort?.abort()
      const mine = new AbortController()
      signInAbort = mine
      const signal = signInOptions.signal
        ? AbortSignal.any([signInOptions.signal, mine.signal])
        : mine.signal
      try {
        const result = await signInToServer({
          ...signInOptions,
          signal,
          serverUrl: server.url,
          resourceMetadataUrl: challenge.resourceMetadataUrl,
          scope: challenge.scope,
          config: oauth.read(),
          clientName: clientInfo.name,
          fetch: signInFetch,
          resolve,
          now,
        })
        if (!result.ok) return result
        await oauth.writeTokens(serializeStoredOAuth(result.stored))
        signInNeeded = false
        // the next use connects with the new token
        await dropClient()
        return { ok: true }
      } finally {
        if (signInAbort === mine) signInAbort = null
      }
    },

    revoke: async () => {
      const held = oauth.read()
      const stored = parseStoredOAuth(held?.tokens ?? '')
      try {
        if (stored) await revokeStoredOAuth(stored, held, signInFetch)
      } catch {
        // the tokens are forgotten below either way
      }
      if (held?.tokens) await oauth.writeTokens('').catch(() => {})
      await dropClient()
    },

    close: async () => {
      signInAbort?.abort()
      await dropClient()
    },
  }
}
