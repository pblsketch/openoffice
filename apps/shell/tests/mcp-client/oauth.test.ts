import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MCP_SIGN_IN_TIMEOUT_MS,
  parseStoredOAuth,
  storeOAuthAccess,
} from '../../src/main/mcp-client/oauth'
import {
  RemoteMcpError,
  createRemoteMcpConnection,
  type RemoteMcpConnection,
} from '../../src/main/mcp-client/remote'
import type { McpSecretCodec } from '../../src/main/mcp-client/secrets'
import {
  createMcpServersStore,
  MCP_SERVERS_FILE_NAME,
  newMcpServerConfig,
  type McpOAuthConfig,
} from '../../src/main/mcp-client/store'
import { startFakeAuth, startFakeMcp, type FakeAuth, type FakeMcp } from './fake-remote-server'

const cleanups: (() => Promise<unknown> | void)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c()
})

const pages = {
  done: { lang: 'en', title: 'Signed in', body: 'You can close this tab.' },
  failed: { lang: 'en', title: 'Not signed in', body: 'Go back to the app.' },
}

function memoryOAuth(initial: McpOAuthConfig | null = null) {
  let config = initial
  const writes: string[] = []
  return {
    writes,
    current: () => config,
    access: {
      read: () => (config ? { ...config } : null),
      writeTokens: async (tokens: string) => {
        writes.push(tokens)
        config = {
          clientId: config?.clientId ?? '',
          clientSecret: config?.clientSecret ?? '',
          tokens,
        }
      },
    },
  }
}

interface Setup {
  mcp: FakeMcp
  auth: FakeAuth
  accepted: Set<string>
  oauth: ReturnType<typeof memoryOAuth>
  clock: { now: number }
  c: RemoteMcpConnection
}

async function setup(
  authOptions: Parameters<typeof startFakeAuth>[0] = {},
  initial: McpOAuthConfig | null = null,
  headers: Record<string, string> = {},
): Promise<Setup> {
  const accepted = new Set<string>()
  const auth = await startFakeAuth({ ...authOptions, onIssue: (t) => accepted.add(t) })
  cleanups.push(() => auth.close())
  const mcp = await startFakeMcp({ acceptedTokens: accepted, authServer: () => auth.origin })
  cleanups.push(() => mcp.close())
  const oauth = memoryOAuth(initial)
  const clock = { now: 1_000_000 }
  const c = createRemoteMcpConnection({
    server: { name: 'law', url: mcp.url, transport: 'auto', headers },
    oauth: oauth.access,
    clientInfo: { name: 'IeumOffice', version: '9.9.9' },
    fetch: (input, init) => fetch(input, init),
    now: () => clock.now,
  })
  cleanups.push(() => c.close())
  return { mcp, auth, accepted, oauth, clock, c }
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

describe('remote MCP sign-in', () => {
  it('signs in through the browser with PKCE and stores the tokens', async () => {
    expect(MCP_SIGN_IN_TIMEOUT_MS).toBe(10 * 60 * 1000)
    const { c, auth, oauth } = await setup({ registration: true })
    expect(await reasonOf(c.connect())).toBe('login-required')
    expect(c.needsSignIn()).toBe(true)

    const opened: string[] = []
    const browser = auth.browser()
    const result = await c.signIn({
      openExternal: async (url) => {
        opened.push(url)
        await browser(url)
      },
      pages,
    })
    expect(result).toEqual({ ok: true })
    expect(c.needsSignIn()).toBe(false)

    // the browser went to the authorization server named by discovery, with an S256 challenge
    const asked = auth.authorizations[0]
    expect(opened[0].startsWith(`${auth.origin}/authorize?`)).toBe(true)
    expect(asked.get('code_challenge_method')).toBe('S256')
    expect(asked.get('code_challenge')).toMatch(/^[\w-]{43}$/)
    expect(asked.get('state')).toMatch(/^[\w-]{16,}$/)
    expect(asked.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)
    expect(asked.get('client_id')).toBe('dyn-1')
    expect(auth.registrations[0]).toMatchObject({
      redirect_uris: [asked.get('redirect_uri')],
      token_endpoint_auth_method: 'none',
    })
    // the fake token endpoint answers only when the verifier matches the challenge
    expect(auth.exchanges).toHaveLength(1)

    // the static page: no script, nothing loaded from outside
    const page = auth.pages[0]
    expect(page.status).toBe(200)
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(page.body).toContain('Signed in')
    expect(page.body).not.toMatch(/<script/i)

    const stored = parseStoredOAuth(oauth.current()?.tokens ?? '')
    expect(stored?.tokens.access_token).toBe('at-1')
    expect(stored?.tokens.refresh_token).toBe('rt-1')

    expect((await c.listTools()).tools).toHaveLength(3)
  })

  it('answers a callback with the wrong state with nothing and keeps waiting', async () => {
    const { c, auth } = await setup({ registration: true })
    const result = await c.signIn({ openExternal: auth.browser({ tamperState: true }), pages })
    expect(result).toEqual({ ok: true })
    expect(auth.pages[0].status).toBe(404)
    expect(auth.pages[0].body).toBe('')
    expect(auth.pages[1].status).toBe(200)
  })

  it('uses the client the person entered when the server has no registration', async () => {
    const { c, auth } = await setup({}, { clientId: 'my-client', clientSecret: '', tokens: '' })
    expect(await c.signIn({ openExternal: auth.browser(), pages })).toEqual({ ok: true })
    expect(auth.registrations).toEqual([])
    expect(auth.authorizations[0].get('client_id')).toBe('my-client')
  })

  it('asks for a client when there is neither registration nor an entered client', async () => {
    const { c, auth } = await setup({})
    expect(await c.signIn({ openExternal: auth.browser(), pages })).toEqual({
      ok: false,
      reason: 'client-required',
    })
  })

  it('reports a refusal in the browser', async () => {
    const { c, auth, oauth } = await setup({ registration: true })
    expect(await c.signIn({ openExternal: auth.browser({ deny: true }), pages })).toEqual({
      ok: false,
      reason: 'denied',
    })
    expect(auth.pages[0].body).toContain('Not signed in')
    expect(oauth.writes).toEqual([])
  })

  it('gives up when the browser never comes back, or when cancelled', async () => {
    const { c } = await setup({ registration: true })
    expect(await c.signIn({ openExternal: async () => {}, pages, timeoutMs: 200 })).toEqual({
      ok: false,
      reason: 'timeout',
    })
    const stop = new AbortController()
    setTimeout(() => stop.abort(), 100)
    expect(await c.signIn({ openExternal: async () => {}, pages, signal: stop.signal })).toEqual({
      ok: false,
      reason: 'cancelled',
    })
  })

  it('does not sign in over a pasted key', async () => {
    const { c, auth } = await setup({ registration: true }, null, { Authorization: 'Bearer k' })
    expect(await c.signIn({ openExternal: auth.browser(), pages })).toEqual({
      ok: false,
      reason: 'key-in-use',
    })
    expect(auth.authorizations).toEqual([])
  })

  it('refreshes an expired access token by itself', async () => {
    const { c, auth, accepted, oauth, clock, mcp } = await setup({
      registration: true,
      expiresIn: 600,
    })
    await c.signIn({ openExternal: auth.browser(), pages })
    await c.close()
    clock.now += 3600 * 1000
    accepted.delete('at-1')
    expect((await c.listTools()).tools).toHaveLength(3)
    expect(auth.refreshes).toHaveLength(1)
    expect(auth.refreshes[0].get('refresh_token')).toBe('rt-1')
    expect(auth.refreshes[0].get('client_id')).toBe('dyn-1')
    expect(parseStoredOAuth(oauth.current()?.tokens ?? '')?.tokens.access_token).toBe('at-2')
    const last = mcp.requests.filter((r) => r.path === '/mcp').at(-1)
    expect(last?.headers['authorization']).toBe('Bearer at-2')
  })

  it('refreshes once when the server rejects a token that has not expired', async () => {
    const { c, auth, accepted } = await setup({ registration: true })
    await c.signIn({ openExternal: auth.browser(), pages })
    await c.close()
    accepted.delete('at-1')
    expect((await c.listTools()).tools).toHaveLength(3)
    expect(auth.refreshes).toHaveLength(1)
  })

  it('asks to sign in again when the refresh is refused', async () => {
    const { c, auth, accepted, oauth } = await setup({ registration: true, refuseRefresh: true })
    await c.signIn({ openExternal: auth.browser(), pages })
    await c.close()
    accepted.delete('at-1')
    expect(await reasonOf(c.listTools())).toBe('login-required')
    expect(c.needsSignIn()).toBe(true)
    expect(oauth.current()?.tokens).toBe('')
  })

  it('asks the server to revoke and forgets the tokens', async () => {
    const { c, auth, oauth } = await setup({ registration: true, revocation: true })
    await c.signIn({ openExternal: auth.browser(), pages })
    await c.revoke()
    expect(auth.revocations).toHaveLength(1)
    expect(auth.revocations[0].get('token')).toBe('rt-1')
    expect(auth.revocations[0].get('client_id')).toBe('dyn-1')
    expect(oauth.current()?.tokens).toBe('')
  })

  it('forgets the tokens even when revoking fails', async () => {
    const { c, auth, oauth } = await setup({ registration: true, revocation: true })
    await c.signIn({ openExternal: auth.browser(), pages })
    await auth.close()
    await expect(c.revoke()).resolves.toBeUndefined()
    expect(oauth.current()?.tokens).toBe('')
  })
})

describe('storeOAuthAccess', () => {
  const codec: McpSecretCodec = {
    canSeal: () => true,
    seal: (plain) => `sealed:v1:${Buffer.from(plain).toString('base64')}`,
    open: (sealed) =>
      sealed.startsWith('sealed:v1:') ? Buffer.from(sealed.slice(10), 'base64').toString() : null,
  }

  it('writes tokens into the server, adding the OAuth block when missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-oauth-store-'))
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    const store = createMcpServersStore(join(dir, MCP_SERVERS_FILE_NAME), codec)
    await store.load()
    const server = newMcpServerConfig({ name: 'law', kind: 'remote', url: 'https://x.test/mcp' })
    await store.update((f) => {
      f.servers.push(server)
    })
    const access = storeOAuthAccess(store, server.id)
    expect(access.read()).toBeNull()
    await access.writeTokens('{"v":1}')
    expect(store.server(server.id)?.oauth).toEqual({
      clientId: '',
      clientSecret: '',
      tokens: '{"v":1}',
    })
    await access.writeTokens('')
    expect(store.server(server.id)?.oauth?.tokens).toBe('')
  })
})
