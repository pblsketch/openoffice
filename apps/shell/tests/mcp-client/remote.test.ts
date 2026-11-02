import { afterEach, describe, expect, it, vi } from 'vitest'
import { MCP_CALL_TIMEOUT_MS } from '../../src/main/mcp-client/limits'
import type { McpOAuthConfig } from '../../src/main/mcp-client/store'
import {
  RemoteMcpError,
  createRemoteMcpConnection,
  statusFailureOf,
  type RemoteMcpConnection,
  type RemoteMcpConnectionOptions,
} from '../../src/main/mcp-client/remote'
import { startFakeMcp, startRecorder, type FakeMcp, type Recorder } from './fake-remote-server'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c().catch(() => {})
})

async function fake(options: Parameters<typeof startFakeMcp>[0] = {}): Promise<FakeMcp> {
  const server = await startFakeMcp(options)
  cleanups.push(() => server.close())
  return server
}

function memoryOAuth(initial: McpOAuthConfig | null = null) {
  let config = initial
  return {
    read: () => (config ? { ...config } : null),
    writeTokens: async (tokens: string) => {
      config = {
        clientId: config?.clientId ?? '',
        clientSecret: config?.clientSecret ?? '',
        tokens,
      }
    },
  }
}

function connect(
  url: string,
  extra: Partial<RemoteMcpConnectionOptions> & {
    headers?: Record<string, string>
    transport?: 'auto' | 'sse'
  } = {},
): RemoteMcpConnection {
  const { headers, transport, ...rest } = extra
  const connection = createRemoteMcpConnection({
    server: { name: 'fake', url, transport: transport ?? 'auto', headers: headers ?? {} },
    oauth: memoryOAuth(),
    clientInfo: { name: 'IeumOffice', version: '9.9.9' },
    fetch: (input, init) => fetch(input, init),
    ...rest,
  })
  cleanups.push(() => connection.close())
  return connection
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(RemoteMcpError)
    return (err as RemoteMcpError).reason
  }
  throw new Error('expected a failure')
}

describe('remote MCP connection', () => {
  it('connects, lists tools with the instructions, and calls a tool', async () => {
    const server = await fake({ instructions: 'Use tool_000 first.' })
    const c = connect(server.url)
    await c.connect()
    const listing = await c.listTools()
    expect(listing.instructions).toBe('Use tool_000 first.')
    expect(listing.tools.map((t) => t.name)).toEqual(['tool_000', 'tool_001', 'tool_002'])
    expect(listing.tools[0]).toMatchObject({
      description: 'tool 0',
      inputSchema: { type: 'object' },
      annotations: { readOnlyHint: true },
    })
    const result = await c.callTool('tool_001', { q: 'law' })
    expect(result.content).toEqual([{ type: 'text', text: 'tool_001:{"q":"law"}' }])
  })

  it('connects on first use when listing or calling', async () => {
    const server = await fake()
    const c = connect(server.url)
    expect((await c.listTools()).tools).toHaveLength(3)
  })

  it('follows every page of the tool list', async () => {
    const server = await fake({ toolCount: 7, pageSize: 3 })
    const c = connect(server.url)
    const listing = await c.listTools()
    expect(listing.tools.map((t) => t.name)).toEqual([
      'tool_000',
      'tool_001',
      'tool_002',
      'tool_003',
      'tool_004',
      'tool_005',
      'tool_006',
    ])
    expect(listing.instructions).toBeNull()
  })

  it('declares no capabilities and names the product and version', async () => {
    const server = await fake()
    await connect(server.url).connect()
    expect(server.clientCapabilities()).toEqual({})
    expect(server.clientVersion()).toMatchObject({ name: 'IeumOffice', version: '9.9.9' })
  })

  it('refuses sampling, elicitation and roots requests from the server', async () => {
    const server = await fake()
    const c = connect(server.url)
    await c.callTool('probe', {})
    expect(server.probes).toEqual({
      sampling: 'refused:-32601',
      elicitation: 'refused:-32601',
      roots: 'refused:-32601',
    })
  })

  it('tells listeners when the server changes its tool list', async () => {
    const server = await fake()
    const c = connect(server.url)
    const seen = vi.fn()
    const off = c.onToolsChanged(seen)
    await c.callTool('change_tools', {})
    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(1))
    off()
    await c.callTool('change_tools', {})
    await new Promise((r) => setTimeout(r, 50))
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('falls back to SSE once when Streamable HTTP is not offered', async () => {
    const server = await fake({ mode: 'sse' })
    const c = connect(server.url)
    const listing = await c.listTools()
    expect(listing.tools).toHaveLength(3)
    const first = server.requests.filter((r) => r.path === '/mcp')
    expect(first[0]).toMatchObject({ method: 'POST' })
    expect(first[1]).toMatchObject({ method: 'GET' })
    expect((await c.callTool('tool_000', {})).content).toEqual([
      { type: 'text', text: 'tool_000:{}' },
    ])
  })

  it('uses SSE from the start when the stored transport is sse', async () => {
    const server = await fake({ mode: 'sse' })
    const c = connect(server.url, { transport: 'sse' })
    await c.connect()
    expect(server.requests.some((r) => r.path === '/mcp' && r.method === 'POST')).toBe(false)
    expect((await c.listTools()).tools).toHaveLength(3)
  })

  it('refuses a redirect to another origin and never reaches it', async () => {
    const elsewhere: Recorder = await startRecorder()
    cleanups.push(() => elsewhere.close())
    const server = await fake({ redirectTo: `${elsewhere.origin}/mcp` })
    const c = connect(server.url)
    const error = await c.connect().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RemoteMcpError)
    expect((error as RemoteMcpError).reason).toBe('refused-redirect')
    expect((error as Error).message).toBe('fake: refused-redirect')
    expect(elsewhere.hits).toEqual([])
    expect(statusFailureOf(error)).toBe('refused-redirect')
  })

  it('ends a call that runs past the time limit', async () => {
    expect(MCP_CALL_TIMEOUT_MS).toBe(60_000)
    const server = await fake()
    const c = connect(server.url, { callTimeoutMs: 300 })
    await c.connect()
    expect(await reasonOf(c.callTool('slow', {}))).toBe('timeout')
  })

  it('ends a call when the person stops it', async () => {
    const server = await fake()
    const c = connect(server.url)
    await c.connect()
    const stop = new AbortController()
    setTimeout(() => stop.abort(), 100)
    expect(await reasonOf(c.callTool('slow', {}, stop.signal))).toBe('aborted')
  })

  it('names only the server and the reason when the server cannot be reached', async () => {
    const server = await fake()
    const url = server.url
    await server.close()
    const c = connect(url)
    const error = await c.connect().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RemoteMcpError)
    expect((error as Error).message).toBe('fake: unreachable')
    expect(statusFailureOf(error)).toBe('unreachable')
  })

  it('tells a server that answered with an HTTP error from one it could not reach (B4)', async () => {
    const answered = vi.fn(async () => new Response('Not Found', { status: 404 }))
    const c = connect('http://127.0.0.1:9/mcp', { fetch: answered })
    const error = await c.connect().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RemoteMcpError)
    expect((error as Error).message).toBe('fake: http-error')
    expect(statusFailureOf(error)).toBe('http-error')
    // Streamable HTTP first, then SSE: both asked before giving up
    expect(answered.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('refuses plain http to a name that resolves to a public address', async () => {
    const spy = vi.fn((input: string | URL | Request, init?: RequestInit) => fetch(input, init))
    const c = connect('http://mcp.example.test:9/mcp', {
      fetch: spy,
      resolve: async () => ['8.8.8.8'],
    })
    expect(await reasonOf(c.connect())).toBe('insecure-address')
    expect(spy).not.toHaveBeenCalled()
  })

  it('checks the resolved address again on later requests', async () => {
    const server = await fake()
    const port = new URL(server.url).port
    let answer = ['127.0.0.1']
    const viaLoopback = (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      url.hostname = '127.0.0.1'
      return fetch(url, init)
    }
    const c = connect(`http://mcp.example.test:${port}/mcp`, {
      fetch: viaLoopback,
      resolve: async () => answer,
    })
    await c.connect()
    answer = ['203.0.113.7']
    expect(await reasonOf(c.callTool('tool_000', {}))).toBe('insecure-address')
  })

  it('sends the configured headers on every request', async () => {
    const server = await fake({ acceptedTokens: new Set(['key-1']) })
    const c = connect(server.url, {
      headers: { Authorization: 'Bearer key-1', 'X-Api-Key': 'k1' },
    })
    await c.listTools()
    await c.callTool('tool_000', {})
    const toMcp = server.requests.filter((r) => r.path === '/mcp')
    expect(toMcp.length).toBeGreaterThanOrEqual(3)
    for (const r of toMcp) {
      expect(r.headers['authorization']).toBe('Bearer key-1')
      expect(r.headers['x-api-key']).toBe('k1')
    }
  })

  it('reads a rejected pasted key as a login problem', async () => {
    const server = await fake({ acceptedTokens: new Set(['key-1']) })
    const c = connect(server.url, { headers: { Authorization: 'Bearer wrong' } })
    expect(await reasonOf(c.connect())).toBe('login-required')
    expect(c.needsSignIn()).toBe(true)
  })
})
