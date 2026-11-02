import { createHash, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  CreateMessageResultSchema,
  ElicitResultSchema,
  ListRootsResultSchema,
  ListToolsRequestSchema,
  type Implementation,
  type ClientCapabilities,
} from '@modelcontextprotocol/sdk/types.js'

/**
 * Fake MCP and OAuth servers on 127.0.0.1 for the remote client tests. The
 * MCP side uses the SDK's own server transports; the OAuth side is a small
 * hand-written authorization server that checks PKCE and records what it saw.
 */

export interface RecordedRequest {
  method: string
  path: string
  headers: Record<string, string | string[] | undefined>
}

/** One tool the fake server lists when `FakeMcpOptions.tools` is given */
export interface FakeTool {
  name: string
  description: string
  inputSchema?: { type: 'object'; properties?: Record<string, unknown> }
  annotations?: { readOnlyHint?: boolean }
}

export interface FakeMcpOptions {
  /** 'streamable': Streamable HTTP only; 'sse': legacy SSE only (POST to the URL answers 405) */
  mode?: 'streamable' | 'sse'
  /** how many tools the server lists; pages of `pageSize` */
  toolCount?: number
  pageSize?: number
  instructions?: string
  /** every request to the MCP path answers this redirect */
  redirectTo?: string
  /** access tokens the server accepts; when set, a request without one gets 401 */
  acceptedTokens?: Set<string>
  /** the authorization server named in the protected resource metadata */
  authServer?: () => string
  /**
   * The tools to list, read again at every listing (so a test can change a
   * description or add a tool); replaces the `toolCount` numbered tools.
   * Calls answer as for any other name, with the special tools still special.
   */
  tools?: () => readonly FakeTool[]
}

export interface FakeMcp {
  url: string
  origin: string
  requests: RecordedRequest[]
  clientCapabilities: () => ClientCapabilities | undefined
  clientVersion: () => Implementation | undefined
  /** results of server-to-client requests made by the `probe` tool */
  probes: Record<string, string>
  close(): Promise<void>
}

const toolName = (i: number) => `tool_${String(i).padStart(3, '0')}`

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(text ? JSON.parse(text) : undefined)
      } catch (err) {
        reject(err as Error)
      }
    })
    req.on('error', reject)
  })
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}

async function stop(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

export async function startFakeMcp(options: FakeMcpOptions = {}): Promise<FakeMcp> {
  const mode = options.mode ?? 'streamable'
  const toolCount = options.toolCount ?? 3
  const pageSize = options.pageSize ?? 1000
  const requests: RecordedRequest[] = []
  const probes: Record<string, string> = {}
  let lastServer: McpServer | null = null

  function makeServer(): McpServer {
    const server = new McpServer(
      { name: 'fake', version: '1.0.0' },
      {
        capabilities: { tools: { listChanged: true } },
        ...(options.instructions ? { instructions: options.instructions } : {}),
      },
    )
    server.setRequestHandler(ListToolsRequestSchema, (request) => {
      if (options.tools) {
        return {
          tools: options.tools().map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema ?? { type: 'object' as const, properties: {} },
            ...(t.annotations ? { annotations: t.annotations } : {}),
          })),
        }
      }
      const start = request.params?.cursor ? Number(request.params.cursor) : 0
      const end = Math.min(start + pageSize, toolCount)
      const tools = []
      for (let i = start; i < end; i++) {
        tools.push({
          name: toolName(i),
          description: `tool ${i}`,
          inputSchema: { type: 'object' as const, properties: {} },
          annotations: { readOnlyHint: i % 2 === 0 },
        })
      }
      return end < toolCount ? { tools, nextCursor: String(end) } : { tools }
    })
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const name = request.params.name
      if (name === 'slow') {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 10_000)
          extra.signal.addEventListener('abort', () => {
            clearTimeout(timer)
            resolve()
          })
        })
        return { content: [{ type: 'text', text: 'late' }] }
      }
      if (name === 'change_tools') {
        await extra.sendNotification({ method: 'notifications/tools/list_changed' })
        return { content: [{ type: 'text', text: 'changed' }] }
      }
      if (name === 'probe') {
        const attempts: [string, () => Promise<unknown>][] = [
          [
            'sampling',
            () =>
              extra.sendRequest(
                {
                  method: 'sampling/createMessage',
                  params: {
                    messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }],
                    maxTokens: 10,
                  },
                },
                CreateMessageResultSchema,
              ),
          ],
          [
            'elicitation',
            () =>
              extra.sendRequest(
                {
                  method: 'elicitation/create',
                  params: {
                    message: 'name?',
                    requestedSchema: { type: 'object', properties: {} },
                  },
                },
                ElicitResultSchema,
              ),
          ],
          ['roots', () => extra.sendRequest({ method: 'roots/list' }, ListRootsResultSchema)],
        ]
        for (const [label, run] of attempts) {
          try {
            await run()
            probes[label] = 'answered'
          } catch (err) {
            probes[label] = `refused:${(err as { code?: number }).code ?? 'unknown'}`
          }
        }
        return { content: [{ type: 'text', text: 'probed' }] }
      }
      return {
        content: [
          { type: 'text', text: `${name}:${JSON.stringify(request.params.arguments ?? {})}` },
        ],
      }
    })
    lastServer = server
    return server
  }

  const streamSessions = new Map<string, StreamableHTTPServerTransport>()
  const sseSessions = new Map<string, SSEServerTransport>()
  let base = ''

  const unauthorized = (res: ServerResponse) => {
    res.writeHead(401, {
      'WWW-Authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`,
      'Content-Type': 'application/json',
    })
    res.end(JSON.stringify({ error: 'invalid_token' }))
  }

  const http = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', base)
      requests.push({ method: req.method ?? '', path: url.pathname, headers: { ...req.headers } })
      if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
        if (!options.authServer) {
          res.writeHead(404).end()
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            resource: `${base}/mcp`,
            authorization_servers: [options.authServer()],
          }),
        )
        return
      }
      if (url.pathname.startsWith('/.well-known/')) {
        res.writeHead(404).end()
        return
      }
      if (options.redirectTo && url.pathname === '/mcp') {
        res.writeHead(307, { Location: options.redirectTo }).end()
        return
      }
      if (options.acceptedTokens) {
        const auth = req.headers.authorization ?? ''
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
        if (!options.acceptedTokens.has(token)) {
          unauthorized(res)
          return
        }
      }
      if (mode === 'sse') {
        if (url.pathname === '/mcp' && req.method === 'GET') {
          const transport = new SSEServerTransport('/messages', res)
          sseSessions.set(transport.sessionId, transport)
          await makeServer().connect(transport)
          return
        }
        if (url.pathname === '/messages' && req.method === 'POST') {
          const transport = sseSessions.get(url.searchParams.get('sessionId') ?? '')
          if (!transport) {
            res.writeHead(404).end()
            return
          }
          await transport.handlePostMessage(req, res, await readBody(req))
          return
        }
        res.writeHead(405).end()
        return
      }
      if (url.pathname !== '/mcp') {
        res.writeHead(404).end()
        return
      }
      const sessionId = req.headers['mcp-session-id']
      const existing = typeof sessionId === 'string' ? streamSessions.get(sessionId) : undefined
      if (existing) {
        await existing.handleRequest(
          req,
          res,
          req.method === 'POST' ? await readBody(req) : undefined,
        )
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(400).end()
        return
      }
      const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          streamSessions.set(id, transport)
        },
      })
      await makeServer().connect(transport)
      await transport.handleRequest(req, res, await readBody(req))
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
  const port = await listen(http)
  base = `http://127.0.0.1:${port}`
  return {
    url: `${base}/mcp`,
    origin: base,
    requests,
    probes,
    clientCapabilities: () => lastServer?.getClientCapabilities(),
    clientVersion: () => lastServer?.getClientVersion(),
    close: async () => {
      for (const t of streamSessions.values()) await t.close().catch(() => {})
      for (const t of sseSessions.values()) await t.close().catch(() => {})
      await stop(http)
    },
  }
}

// ---- a plain origin that records what reaches it ---------------------------

export interface Recorder {
  origin: string
  hits: RecordedRequest[]
  close(): Promise<void>
}

export async function startRecorder(): Promise<Recorder> {
  const hits: RecordedRequest[] = []
  const http = createServer((req, res) => {
    hits.push({ method: req.method ?? '', path: req.url ?? '', headers: { ...req.headers } })
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}')
  })
  const port = await listen(http)
  return { origin: `http://127.0.0.1:${port}`, hits, close: () => stop(http) }
}

// ---- the authorization server ---------------------------------------------

export interface FakeAuthOptions {
  /** offer dynamic client registration */
  registration?: boolean
  /** answer refresh requests with invalid_grant */
  refuseRefresh?: boolean
  /** advertise a revocation endpoint */
  revocation?: boolean
  /** lifetime of issued access tokens in seconds */
  expiresIn?: number
  /** tokens the MCP server should accept get added here */
  onIssue?: (accessToken: string) => void
}

export interface FakeAuth {
  origin: string
  /** what the token endpoint saw for the code grant */
  exchanges: URLSearchParams[]
  refreshes: URLSearchParams[]
  revocations: URLSearchParams[]
  registrations: Record<string, unknown>[]
  authorizations: URLSearchParams[]
  options: FakeAuthOptions
  /**
   * Plays the browser: opens the authorization address, takes the
   * redirect back to the app's loopback address, and fetches it.
   * `tamperState` sends a wrong state first.
   */
  browser(opts?: { tamperState?: boolean; deny?: boolean }): (url: string) => Promise<void>
  /** the static page the loopback server answered */
  pages: { status: number; headers: Headers; body: string }[]
  close(): Promise<void>
}

const s256 = (verifier: string) =>
  createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

export async function startFakeAuth(options: FakeAuthOptions = {}): Promise<FakeAuth> {
  const exchanges: URLSearchParams[] = []
  const refreshes: URLSearchParams[] = []
  const revocations: URLSearchParams[] = []
  const registrations: Record<string, unknown>[] = []
  const authorizations: URLSearchParams[] = []
  const pages: FakeAuth['pages'] = []
  /** code → the authorization request it answers */
  const codes = new Map<string, URLSearchParams>()
  let issued = 0
  let base = ''

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const form = async (req: IncomingMessage) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
  }
  const issue = (res: ServerResponse) => {
    issued += 1
    const access = `at-${issued}`
    options.onIssue?.(access)
    json(res, 200, {
      access_token: access,
      refresh_token: `rt-${issued}`,
      token_type: 'Bearer',
      expires_in: options.expiresIn ?? 3600,
    })
  }

  const http = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', base)
      if (url.pathname === '/.well-known/oauth-authorization-server') {
        json(res, 200, {
          issuer: base,
          authorization_endpoint: `${base}/authorize`,
          token_endpoint: `${base}/token`,
          ...(options.registration ? { registration_endpoint: `${base}/register` } : {}),
          ...(options.revocation ? { revocation_endpoint: `${base}/revoke` } : {}),
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
        })
        return
      }
      if (url.pathname === '/register' && req.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
        registrations.push(body)
        json(res, 201, { ...body, client_id: `dyn-${registrations.length}` })
        return
      }
      if (url.pathname === '/authorize') {
        authorizations.push(url.searchParams)
        const redirect = new URL(url.searchParams.get('redirect_uri') ?? '')
        if (url.searchParams.get('deny') === '1') {
          redirect.searchParams.set('error', 'access_denied')
        } else {
          const code = `code-${authorizations.length}`
          codes.set(code, url.searchParams)
          redirect.searchParams.set('code', code)
        }
        redirect.searchParams.set('state', url.searchParams.get('state') ?? '')
        res.writeHead(302, { Location: redirect.href }).end()
        return
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        const body = await form(req)
        if (body.get('grant_type') === 'authorization_code') {
          exchanges.push(body)
          const asked = codes.get(body.get('code') ?? '')
          if (
            !asked ||
            asked.get('code_challenge_method') !== 'S256' ||
            asked.get('code_challenge') !== s256(body.get('code_verifier') ?? '') ||
            asked.get('redirect_uri') !== body.get('redirect_uri') ||
            asked.get('client_id') !== body.get('client_id')
          ) {
            json(res, 400, { error: 'invalid_grant' })
            return
          }
          codes.delete(body.get('code') ?? '')
          issue(res)
          return
        }
        if (body.get('grant_type') === 'refresh_token') {
          refreshes.push(body)
          if (options.refuseRefresh) {
            json(res, 400, { error: 'invalid_grant' })
            return
          }
          issue(res)
          return
        }
        json(res, 400, { error: 'unsupported_grant_type' })
        return
      }
      if (url.pathname === '/revoke' && req.method === 'POST') {
        revocations.push(await form(req))
        res.writeHead(200).end()
        return
      }
      res.writeHead(404).end()
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
  const port = await listen(http)
  base = `http://127.0.0.1:${port}`

  return {
    origin: base,
    exchanges,
    refreshes,
    revocations,
    registrations,
    authorizations,
    options,
    pages,
    browser:
      (opts = {}) =>
      async (address: string) => {
        const target = new URL(address)
        if (opts.deny) target.searchParams.set('deny', '1')
        const answer = await fetch(target, { redirect: 'manual' })
        const back = new URL(answer.headers.get('location') ?? '')
        if (opts.tamperState) {
          const wrong = new URL(back)
          wrong.searchParams.set('state', 'not-the-state')
          const stray = await fetch(wrong)
          pages.push({ status: stray.status, headers: stray.headers, body: await stray.text() })
        }
        const page = await fetch(back)
        pages.push({ status: page.status, headers: page.headers, body: await page.text() })
      },
    close: () => stop(http),
  }
}
