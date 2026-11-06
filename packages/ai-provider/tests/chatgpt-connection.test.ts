/**
 * The ChatGPT sign-in, the stored session and keeping it fresh (decision
 * 0081). Nothing here reaches OpenAI: the token, key and revocation endpoints
 * are a fake fetch, and the "browser" is a request this test makes to the
 * loopback server itself.
 */
import { generateKeyPairSync, sign, type JsonWebKey } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CHATGPT_DYNAMIC_CLIENT_ID,
  CHATGPT_ISSUER,
  CHATGPT_JWKS_URL,
  CHATGPT_OIDC_CONFIG_URL,
  CHATGPT_PLAN_SCOPE,
  CHATGPT_RESOURCE,
  CHATGPT_SCOPES,
  CHATGPT_TOKEN_URL,
  chatGptAuthorizeUrl,
  refreshChatGptTokens,
  verifyChatGptIdToken,
} from '../src/chatgpt/oauth'
import {
  CHATGPT_CONNECTION_FILE,
  chatGptConnectionOf,
  createChatGptConnectionFileStore,
  createChatGptConnectionMemoryStore,
} from '../src/chatgpt/credentials'
import { createChatGptConnection } from '../src/chatgpt/connection'
import { detectChatGptConnection } from '../src/chatgpt/status'
import { AiRunError } from '../src/run-error'
import { setAiSecretCodec } from '../src/settings-secrets'

const PAGES = {
  done: { lang: 'en', title: 'Connected', body: 'Go back' },
  failed: { lang: 'en', title: 'Not connected', body: 'Try again' },
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const JWK = { ...(publicKey.export({ format: 'jwk' }) as JsonWebKey), kid: 'k1', alg: 'RS256' }

function idToken(claims: Record<string, unknown>, kid = 'k1'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), privateKey)
  return `${header}.${payload}.${signature.toString('base64url')}`
}

const NOW = 1_800_000_000_000

function claims(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: CHATGPT_ISSUER,
    aud: 'oaiapp_1',
    sub: 'user-123',
    email: 'someone@example.com',
    exp: Math.floor(NOW / 1000) + 3600,
    ...extra,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface FakeOpenAi {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  calls: Array<{ url: string; body: URLSearchParams | null }>
}

function fakeOpenAi(token: (body: URLSearchParams) => Response): FakeOpenAi {
  const calls: FakeOpenAi['calls'] = []
  return {
    calls,
    fetch: async (url, init) => {
      const body = typeof init.body === 'string' ? new URLSearchParams(init.body) : null
      calls.push({ url, body })
      if (url === CHATGPT_TOKEN_URL && body) return token(body)
      if (url === CHATGPT_JWKS_URL) return json({ keys: [JWK] })
      if (url === CHATGPT_OIDC_CONFIG_URL) {
        return json({ revocation_endpoint: `${CHATGPT_ISSUER}/oauth/revoke` })
      }
      if (url === `${CHATGPT_ISSUER}/oauth/revoke`) return new Response('', { status: 200 })
      return new Response('not found', { status: 404 })
    },
  }
}

/** a browser that signs in: it follows the page address back to the loopback server */
function browserReturning(params: (authorize: URL) => Record<string, string>) {
  const opened: URL[] = []
  return {
    opened,
    open: async (url: string): Promise<boolean> => {
      const authorize = new URL(url)
      opened.push(authorize)
      const back = new URL(authorize.searchParams.get('redirect_uri')!)
      for (const [key, value] of Object.entries(params(authorize)))
        back.searchParams.set(key, value)
      // the browser comes back a moment later, like a real one
      setTimeout(() => void fetch(back).catch(() => undefined), 5)
      return true
    },
  }
}

function signedInTokens(nonce: string, scope = CHATGPT_SCOPES.join(' ')): Response {
  return json({
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    id_token: idToken(claims({ nonce })),
    token_type: 'Bearer',
    expires_in: 3600,
    scope,
  })
}

afterEach(() => setAiSecretCodec(null))

describe('the sign-in page address', () => {
  it('asks for the plan scope on the API resource, with PKCE, state and nonce', () => {
    const url = new URL(
      chatGptAuthorizeUrl({
        port: 4321,
        challenge: 'c',
        state: 's',
        nonce: 'n',
        hostId: 'urn:uuid:00000000-0000-4000-8000-000000000000',
        agentName: 'IeumOffice',
      }),
    )
    expect(`${url.origin}${url.pathname}`).toBe(`${CHATGPT_ISSUER}/api/accounts/authorize`)
    const p = url.searchParams
    expect(p.get('client_id')).toBe(CHATGPT_DYNAMIC_CLIENT_ID)
    expect(p.get('agent_name_hint')).toBe('IeumOffice')
    expect(p.get('redirect_uri')).toBe('http://127.0.0.1:4321/callback')
    expect(p.get('scope')?.split(' ')).toContain(CHATGPT_PLAN_SCOPE)
    expect(p.get('resource')).toBe(CHATGPT_RESOURCE)
    expect(p.get('code_challenge_method')).toBe('S256')
    expect(p.get('state')).toBe('s')
    expect(p.get('nonce')).toBe('n')
    expect(p.get('response_type')).toBe('code')
  })

  it('reuses an issued client id without the name hint', () => {
    const url = new URL(
      chatGptAuthorizeUrl({
        port: 1,
        challenge: 'c',
        state: 's',
        nonce: 'n',
        hostId: 'urn:uuid:00000000-0000-4000-8000-000000000000',
        clientId: 'oaiapp_1',
        agentName: 'IeumOffice',
      }),
    )
    expect(url.searchParams.get('client_id')).toBe('oaiapp_1')
    expect(url.searchParams.has('agent_name_hint')).toBe(false)
  })
})

describe('the ID token', () => {
  const now = Math.floor(NOW / 1000)
  it('is accepted when signed by a published key for this client and nonce', () => {
    expect(
      verifyChatGptIdToken(
        idToken(claims({ nonce: 'n' })),
        { clientId: 'oaiapp_1', nonce: 'n' },
        [JWK],
        now,
      ),
    ).toEqual({ subject: 'user-123', email: 'someone@example.com' })
  })

  it('is refused for another audience, issuer, nonce, an expiry, or a bad signature', () => {
    const keys = [JWK]
    const expected = { clientId: 'oaiapp_1', nonce: 'n' }
    expect(
      verifyChatGptIdToken(idToken(claims({ nonce: 'n', aud: 'other' })), expected, keys, now),
    ).toBeNull()
    expect(
      verifyChatGptIdToken(
        idToken(claims({ nonce: 'n', iss: 'https://evil.example' })),
        expected,
        keys,
        now,
      ),
    ).toBeNull()
    expect(verifyChatGptIdToken(idToken(claims({ nonce: 'x' })), expected, keys, now)).toBeNull()
    expect(
      verifyChatGptIdToken(idToken(claims({ nonce: 'n', exp: now - 3600 })), expected, keys, now),
    ).toBeNull()
    const token = idToken(claims({ nonce: 'n' }))
    const forged = `${token.slice(0, token.lastIndexOf('.'))}.${Buffer.from('nope').toString('base64url')}`
    expect(verifyChatGptIdToken(forged, expected, keys, now)).toBeNull()
    expect(
      verifyChatGptIdToken(idToken(claims({ nonce: 'n' }), 'unknown-kid'), expected, keys, now),
    ).toBeNull()
    expect(verifyChatGptIdToken('not.a.token', expected, keys, now)).toBeNull()
  })
})

describe('refreshing the tokens', () => {
  it('reads a revoked or reused refresh token as signed out, and a 5xx as passing', async () => {
    for (const error of ['invalid_grant', 'refresh_token_reused', 'refresh_token_expired']) {
      const result = await refreshChatGptTokens(
        { clientId: 'oaiapp_1', refreshToken: 'r' },
        async () => json({ error }, 400),
      )
      expect(result).toEqual({ ok: false, reason: 'signed-out' })
    }
    expect(
      await refreshChatGptTokens({ clientId: 'c', refreshToken: 'r' }, async () => json({}, 503)),
    ).toEqual({ ok: false, reason: 'failed' })
    expect(
      await refreshChatGptTokens({ clientId: 'c', refreshToken: 'r' }, async () =>
        json({ error: 'slow_down' }, 400),
      ),
    ).toEqual({ ok: false, reason: 'failed' })
  })
})

describe('the stored connection', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'chatgpt-store-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('seals the tokens, keeps no e-mail address, and reads them back', async () => {
    setAiSecretCodec({
      seal: (v) => `sealed:v1:${Buffer.from(v).toString('base64')}`,
      open: (v) => Buffer.from(v.slice(10), 'base64').toString(),
    })
    const store = createChatGptConnectionFileStore(dir)
    const first = await store.read()
    await store.write({
      hostId: first.hostId,
      clientId: 'oaiapp_1',
      subject: 'user-123',
      session: {
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        idToken: idToken(claims()),
        expiresAt: NOW,
        scopes: [CHATGPT_PLAN_SCOPE],
      },
    })
    const raw = await readFile(join(dir, CHATGPT_CONNECTION_FILE), 'utf8')
    expect(raw).not.toContain('access-1')
    expect(raw).not.toContain('refresh-1')
    expect(raw).not.toContain('someone@example.com')
    const back = await store.read()
    expect(back.hostId).toBe(first.hostId)
    expect(back.session?.accessToken).toBe('access-1')
    expect(back.session?.refreshToken).toBe('refresh-1')
  })

  it('reads tokens it cannot open, or a broken file, as no session', async () => {
    setAiSecretCodec({ seal: () => null, open: () => null })
    const path = join(dir, CHATGPT_CONNECTION_FILE)
    await writeFile(
      path,
      JSON.stringify({
        hostId: 'urn:uuid:00000000-0000-4000-8000-000000000000',
        clientId: 'oaiapp_1',
        session: { accessToken: 'sealed:v1:AAAA', refreshToken: 'sealed:v1:BBBB', expiresAt: NOW },
      }),
    )
    const record = await createChatGptConnectionFileStore(dir).read()
    expect(record.clientId).toBe('oaiapp_1')
    expect(record.session).toBeUndefined()
    expect(chatGptConnectionOf('nonsense').hostId).toMatch(/^urn:uuid:/)
  })
})

// real loopback requests: a loaded test run needs more than the default five seconds
describe('the connection', { timeout: 20_000 }, () => {
  it('signs in through the browser and the loopback server, then reports ready', async () => {
    const store = createChatGptConnectionMemoryStore()
    let nonce = ''
    const openai = fakeOpenAi((body) => {
      expect(body.get('grant_type')).toBe('authorization_code')
      expect(body.get('client_id')).toBe('oaiapp_1')
      expect(body.get('code')).toBe('code-1')
      expect(body.get('code_verifier')).toBeTruthy()
      expect(body.get('resource')).toBe(CHATGPT_RESOURCE)
      return signedInTokens(nonce)
    })
    const browser = browserReturning((authorize) => {
      nonce = authorize.searchParams.get('nonce')!
      return { code: 'code-1', state: authorize.searchParams.get('state')!, client_id: 'oaiapp_1' }
    })
    const connection = createChatGptConnection({
      store,
      agentName: 'IeumOffice',
      fetch: openai.fetch,
      now: () => NOW,
    })
    let changes = 0
    connection.onChange(() => changes++)
    expect(await connection.signIn({ openBrowser: browser.open, pages: PAGES })).toEqual({
      ok: true,
    })
    expect(browser.opened[0]?.searchParams.get('redirect_uri')).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
    )
    expect(changes).toBe(1)
    expect(await connection.state()).toEqual({ signedIn: true, account: 'someone@example.com' })
    expect(store.current()).toMatchObject({ clientId: 'oaiapp_1', subject: 'user-123' })
    expect(JSON.stringify(store.current())).not.toContain('someone@example.com')
    expect(await connection.accessToken()).toBe('access-1')
    expect(await detectChatGptConnection(connection)).toEqual({
      provider: 'chatgpt',
      state: 'ready',
      loginMethod: 'subscription',
      account: 'someone@example.com',
    })
  })

  it('ignores a request to the callback with another state, and stores nothing on a refusal', async () => {
    const store = createChatGptConnectionMemoryStore()
    const openai = fakeOpenAi(() => json({}, 500))
    const connection = createChatGptConnection({
      store,
      agentName: 'x',
      fetch: openai.fetch,
      now: () => NOW,
    })
    const browser = {
      open: async (url: string) => {
        const back = new URL(new URL(url).searchParams.get('redirect_uri')!)
        const state = new URL(url).searchParams.get('state')!
        setTimeout(async () => {
          const wrong = new URL(back)
          wrong.searchParams.set('state', 'forged')
          wrong.searchParams.set('code', 'x')
          wrong.searchParams.set('client_id', 'y')
          expect((await fetch(wrong)).status).toBe(404)
          back.searchParams.set('state', state)
          back.searchParams.set('error', 'access_denied')
          await fetch(back)
        }, 5)
        return true
      },
    }
    expect(await connection.signIn({ openBrowser: browser.open, pages: PAGES })).toEqual({
      ok: false,
      reason: 'denied',
      step: 'callback-error',
    })
    expect(store.current().session).toBeUndefined()
    expect(openai.calls.filter((call) => call.url === CHATGPT_TOKEN_URL)).toHaveLength(0)
  })

  it('refuses a sign-in that did not allow the plan', async () => {
    const store = createChatGptConnectionMemoryStore()
    let nonce = ''
    const openai = fakeOpenAi(() => signedInTokens(nonce, 'openid profile email offline_access'))
    const browser = browserReturning((authorize) => {
      nonce = authorize.searchParams.get('nonce')!
      return { code: 'c', state: authorize.searchParams.get('state')!, client_id: 'oaiapp_1' }
    })
    const connection = createChatGptConnection({
      store,
      agentName: 'x',
      fetch: openai.fetch,
      now: () => NOW,
    })
    expect(await connection.signIn({ openBrowser: browser.open, pages: PAGES })).toEqual({
      ok: false,
      reason: 'no-plan',
      step: 'plan-scope-missing',
    })
    expect(store.current().session).toBeUndefined()
  })

  /** a sign-in that comes back from the browser, then meets this token answer */
  async function signInMeeting(token: (nonce: string) => Response) {
    const store = createChatGptConnectionMemoryStore()
    let nonce = ''
    const openai = fakeOpenAi(() => token(nonce))
    const browser = browserReturning((authorize) => {
      nonce = authorize.searchParams.get('nonce')!
      return { code: 'c', state: authorize.searchParams.get('state')!, client_id: 'oaiapp_1' }
    })
    const connection = createChatGptConnection({
      store,
      agentName: 'x',
      fetch: openai.fetch,
      now: () => NOW,
    })
    const result = await connection.signIn({ openBrowser: browser.open, pages: PAGES })
    return { result, store }
  }

  // OpenAI documents `scope` as always in the token answer; one without it is no grant
  it('says the scope was missing, apart from a plan not granted, and stores nothing', async () => {
    const { result, store } = await signInMeeting((nonce) =>
      json({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        id_token: idToken(claims({ nonce })),
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    )
    expect(result).toEqual({ ok: false, reason: 'no-plan', step: 'scope-missing' })
    expect(store.current().session).toBeUndefined()
  })

  it('does not take a workspace plan in the ID token for the plan scope', async () => {
    const { result, store } = await signInMeeting((nonce) =>
      json({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        id_token: idToken(
          claims({
            nonce,
            'https://api.openai.com/auth': { chatgpt_plan_type: 'team' },
          }),
        ),
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile email offline_access resource.invoke',
      }),
    )
    expect(result).toEqual({ ok: false, reason: 'no-plan', step: 'plan-scope-missing' })
    expect(store.current().session).toBeUndefined()
  })

  it('names a refused code with its status and OAuth error code, and nothing OpenAI wrote', async () => {
    const { result } = await signInMeeting(() =>
      json({ error: 'invalid_grant', error_description: 'code abc-123 was already used' }, 400),
    )
    expect(result).toEqual({
      ok: false,
      reason: 'denied',
      step: 'token-refused',
      httpStatus: 400,
      oauthError: 'invalid_grant',
    })
    expect(JSON.stringify(result)).not.toContain('abc-123')
  })

  it('drops an OAuth error that is not an identifier, and reads a 5xx as unreachable', async () => {
    const { result } = await signInMeeting(() =>
      json({ error: 'Something went wrong <b>here</b>' }, 502),
    )
    expect(result).toEqual({ ok: false, reason: 'network', step: 'token-http', httpStatus: 502 })
  })

  it('names an ID token that does not check out', async () => {
    const { result, store } = await signInMeeting(() => signedInTokens('another-nonce'))
    expect(result).toEqual({ ok: false, reason: 'denied', step: 'id-token-invalid' })
    expect(store.current().session).toBeUndefined()
  })

  it('names a browser that never opened', async () => {
    const connection = createChatGptConnection({
      store: createChatGptConnectionMemoryStore(),
      agentName: 'x',
      fetch: fakeOpenAi(() => json({}, 500)).fetch,
    })
    expect(await connection.signIn({ openBrowser: async () => false, pages: PAGES })).toEqual({
      ok: false,
      reason: 'network',
      step: 'browser',
    })
  })

  it('ends a sign-in that is cancelled', async () => {
    const connection = createChatGptConnection({
      store: createChatGptConnectionMemoryStore(),
      agentName: 'x',
      fetch: fakeOpenAi(() => json({}, 500)).fetch,
    })
    const attempt = new AbortController()
    const pending = connection.signIn({
      openBrowser: async () => {
        setTimeout(() => attempt.abort(), 5)
        return true
      },
      pages: PAGES,
      signal: attempt.signal,
    })
    expect(await pending).toEqual({ ok: false, reason: 'cancelled' })
  })

  function signedIn(expiresAt: number) {
    return createChatGptConnectionMemoryStore({
      hostId: 'urn:uuid:00000000-0000-4000-8000-000000000000',
      clientId: 'oaiapp_1',
      subject: 'user-123',
      session: {
        accessToken: 'old',
        refreshToken: 'refresh-1',
        expiresAt,
        scopes: [CHATGPT_PLAN_SCOPE],
      },
    })
  }

  it('refreshes an old access token once for runs that ask at the same time', async () => {
    const store = signedIn(NOW + 10_000)
    let refreshes = 0
    const openai = fakeOpenAi((body) => {
      expect(body.get('grant_type')).toBe('refresh_token')
      expect(body.get('refresh_token')).toBe('refresh-1')
      refreshes++
      return json({
        access_token: 'new',
        refresh_token: 'refresh-2',
        expires_in: 3600,
        scope: CHATGPT_PLAN_SCOPE,
      })
    })
    const connection = createChatGptConnection({
      store,
      agentName: 'x',
      fetch: openai.fetch,
      now: () => NOW,
    })
    const tokens = await Promise.all([connection.accessToken(), connection.accessToken()])
    expect(tokens).toEqual(['new', 'new'])
    expect(refreshes).toBe(1)
    expect(store.current().session?.refreshToken).toBe('refresh-2')
  })

  it('drops a session OpenAI ended and says signed out', async () => {
    const store = signedIn(NOW - 1)
    const openai = fakeOpenAi(() => json({ error: 'invalid_grant' }, 400))
    const connection = createChatGptConnection({
      store,
      agentName: 'x',
      fetch: openai.fetch,
      now: () => NOW,
    })
    let changes = 0
    connection.onChange(() => changes++)
    const failure = await connection.accessToken().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(AiRunError)
    expect((failure as AiRunError).kind).toBe('signed-out')
    expect((failure as AiRunError).provider).toBe('chatgpt')
    expect(store.current().session).toBeUndefined()
    // the registration stays: signing the same account in again reuses it
    expect(store.current().clientId).toBe('oaiapp_1')
    expect(changes).toBe(1)
  })

  it('keeps using a token that has not run out when the refresh cannot reach OpenAI', async () => {
    const store = signedIn(NOW + 30_000)
    const connection = createChatGptConnection({
      store,
      agentName: 'x',
      fetch: fakeOpenAi(() => json({}, 503)).fetch,
      now: () => NOW,
    })
    expect(await connection.accessToken()).toBe('old')
    expect(store.current().session?.refreshToken).toBe('refresh-1')
  })

  it('revokes the session at sign-out and forgets the account, keeping the host', async () => {
    const store = signedIn(NOW + 3_600_000)
    const openai = fakeOpenAi(() => json({}, 500))
    const connection = createChatGptConnection({
      store,
      agentName: 'x',
      fetch: openai.fetch,
      now: () => NOW,
    })
    await connection.signOut()
    const revoke = openai.calls.find((call) => call.url === `${CHATGPT_ISSUER}/oauth/revoke`)
    expect(revoke?.body?.get('token')).toBe('refresh-1')
    expect(revoke?.body?.get('token_type_hint')).toBe('refresh_token')
    expect(store.current()).toEqual({ hostId: 'urn:uuid:00000000-0000-4000-8000-000000000000' })
    expect(await detectChatGptConnection(connection)).toEqual({
      provider: 'chatgpt',
      state: 'signed-out',
    })
  })

  it('never sends the token to a revocation address off OpenAI', async () => {
    const store = signedIn(NOW + 3_600_000)
    const calls: string[] = []
    const connection = createChatGptConnection({
      store,
      agentName: 'x',
      fetch: async (url) => {
        calls.push(url)
        return url === CHATGPT_OIDC_CONFIG_URL
          ? json({ revocation_endpoint: 'https://evil.example/revoke' })
          : json({})
      },
    })
    await connection.signOut()
    expect(calls).toEqual([CHATGPT_OIDC_CONFIG_URL])
    expect(store.current().session).toBeUndefined()
  })

  it('reads as signed out where no connection was registered', async () => {
    expect(await detectChatGptConnection(null)).toEqual({
      provider: 'chatgpt',
      state: 'signed-out',
    })
  })
})
