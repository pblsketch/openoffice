import { describe, expect, it, vi } from 'vitest'
import {
  DRIVE_SCOPE,
  GOOGLE_TOKEN_URL,
  exchangeGoogleCode,
  googleAuthUrl,
  pickedFileIds,
  refreshGoogleToken,
  signInPageHtml,
  signInWithGoogle,
  type FetchLike,
  type GoogleSignInOptions,
} from '../src/oauth'

const client = { clientId: 'client-1.apps.googleusercontent.com', clientSecret: 'secret-1' }
const pages = {
  done: { lang: 'en', title: 'Connected', body: 'Go back to the app.' },
  failed: { lang: 'en', title: 'Not connected', body: 'Try again.' },
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Drives the browser side: follows the consent URL back to the loopback server */
function browserReturning(query: (url: URL) => Record<string, string> | null) {
  const opened: string[] = []
  const openBrowser = async (address: string) => {
    opened.push(address)
    const url = new URL(address)
    const params = query(url)
    if (params) {
      const back = new URL(url.searchParams.get('redirect_uri')!)
      for (const [k, v] of Object.entries(params)) back.searchParams.set(k, v)
      // the real browser comes back a moment later
      setTimeout(() => void fetch(back).catch(() => {}), 5)
    }
    return true
  }
  return { opened, openBrowser }
}

function tokenFetch(answer: Response): { fetch: FetchLike; calls: RequestInit[] } {
  const calls: RequestInit[] = []
  return {
    calls,
    fetch: async (url, init) => {
      expect(url).toBe(GOOGLE_TOKEN_URL)
      calls.push(init ?? {})
      return answer
    },
  }
}

describe('googleAuthUrl', () => {
  it('asks for Drive with PKCE, offline access and a loopback redirect', () => {
    const url = new URL(googleAuthUrl(client.clientId, 51234, 'chal', 'st'))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('scope')).toBe(DRIVE_SCOPE)
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:51234/callback')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe('chal')
    expect(url.searchParams.get('state')).toBe('st')
    expect(url.searchParams.get('access_type')).toBe('offline')
    // the client secret never goes to the browser
    expect(url.toString()).not.toContain(client.clientSecret)
    expect(url.searchParams.has('trigger_onepick')).toBe(false)
  })

  it('asks only for the files the person picks', () => {
    expect(DRIVE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file')
  })

  it("shows Google's picker when asked, with several files only when allowed", () => {
    const one = new URL(googleAuthUrl(client.clientId, 1, 'c', 's', { multiple: false }))
    expect(one.searchParams.get('trigger_onepick')).toBe('true')
    expect(one.searchParams.has('allow_multiple')).toBe(false)
    const many = new URL(googleAuthUrl(client.clientId, 1, 'c', 's', { multiple: true }))
    expect(many.searchParams.get('allow_multiple')).toBe('true')
    expect(many.searchParams.get('scope')).toBe(DRIVE_SCOPE)
  })
})

describe('pickedFileIds', () => {
  it('keeps well-formed ids once, in order', () => {
    expect(pickedFileIds('a1,b_2, a1,c-3')).toEqual(['a1', 'b_2', 'c-3'])
  })

  it('drops anything that is not a Drive id', () => {
    expect(pickedFileIds("x/../y,ok,'q',,")).toEqual(['ok'])
    expect(pickedFileIds(null)).toEqual([])
  })

  it('hands on at most fifty', () => {
    const ids = Array.from({ length: 80 }, (_, i) => `f${i}`)
    expect(pickedFileIds(ids.join(','))).toHaveLength(50)
  })
})

describe('signInPageHtml', () => {
  it('escapes its text and carries no script', () => {
    const html = signInPageHtml({ lang: 'en', title: '<b>x</b>', body: '"y"' })
    expect(html).not.toContain('<b>')
    expect(html).not.toContain('<script')
  })
})

describe('signInWithGoogle', () => {
  const base = (over: Partial<GoogleSignInOptions>): GoogleSignInOptions => ({
    client,
    pages,
    openBrowser: async () => true,
    ...over,
  })

  it('trades the returned code and verifier for tokens', async () => {
    const browser = browserReturning((url) => ({
      code: 'the-code',
      state: url.searchParams.get('state')!,
      scope: DRIVE_SCOPE,
    }))
    const token = tokenFetch(
      json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: DRIVE_SCOPE }),
    )
    const result = await signInWithGoogle(
      base({ openBrowser: browser.openBrowser, fetch: token.fetch, now: () => 1_000 }),
    )
    expect(result).toEqual({
      ok: true,
      tokens: { refreshToken: 'rt', accessToken: 'at', expiresAt: 1_000 + 3540 * 1000 },
      picked: [],
    })
    const body = new URLSearchParams(String(token.calls[0]!.body))
    expect(body.get('code')).toBe('the-code')
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const consent = new URL(browser.opened[0]!)
    expect(body.get('redirect_uri')).toBe(consent.searchParams.get('redirect_uri'))
  })

  it('ignores a callback whose state does not match, and times out', async () => {
    const browser = browserReturning(() => ({ code: 'forged', state: 'wrong', scope: DRIVE_SCOPE }))
    const fetchSpy = vi.fn<FetchLike>()
    const result = await signInWithGoogle(
      base({ openBrowser: browser.openBrowser, fetch: fetchSpy, timeoutMs: 200 }),
    )
    expect(result).toEqual({ ok: false, reason: 'timeout' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reports a refusal on the consent page', async () => {
    const browser = browserReturning((url) => ({
      error: 'access_denied',
      state: url.searchParams.get('state')!,
    }))
    const result = await signInWithGoogle(
      base({ openBrowser: browser.openBrowser, fetch: vi.fn<FetchLike>() }),
    )
    expect(result).toEqual({ ok: false, reason: 'denied' })
  })

  it('reports a consent without Drive ticked', async () => {
    const browser = browserReturning((url) => ({
      code: 'c',
      state: url.searchParams.get('state')!,
      scope: 'openid',
    }))
    const result = await signInWithGoogle(
      base({ openBrowser: browser.openBrowser, fetch: vi.fn<FetchLike>() }),
    )
    expect(result).toEqual({ ok: false, reason: 'scope' })
  })

  it("hands on the files picked in Google's picker", async () => {
    const browser = browserReturning((url) => ({
      code: 'c',
      state: url.searchParams.get('state')!,
      scope: DRIVE_SCOPE,
      picked_file_ids: 'file-a,file-b',
    }))
    const token = tokenFetch(json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }))
    const result = await signInWithGoogle(
      base({ openBrowser: browser.openBrowser, fetch: token.fetch, pick: { multiple: true } }),
    )
    expect(result.ok && result.picked).toEqual(['file-a', 'file-b'])
    expect(new URL(browser.opened[0]!).searchParams.get('trigger_onepick')).toBe('true')
  })

  it('reads a closed picker as cancelled, not refused', async () => {
    const browser = browserReturning((url) => ({
      error: 'access_denied',
      state: url.searchParams.get('state')!,
    }))
    const result = await signInWithGoogle(
      base({
        openBrowser: browser.openBrowser,
        fetch: vi.fn<FetchLike>(),
        pick: { multiple: false },
      }),
    )
    expect(result).toEqual({ ok: false, reason: 'cancelled' })
  })

  it('stops when cancelled', async () => {
    const controller = new AbortController()
    const result = signInWithGoogle(
      base({
        openBrowser: async () => {
          setTimeout(() => controller.abort(), 5)
          return true
        },
        fetch: vi.fn<FetchLike>(),
        signal: controller.signal,
      }),
    )
    await expect(result).resolves.toEqual({ ok: false, reason: 'cancelled' })
  })

  it('fails when no browser opened', async () => {
    const result = await signInWithGoogle(
      base({ openBrowser: async () => false, fetch: vi.fn<FetchLike>() }),
    )
    expect(result).toEqual({ ok: false, reason: 'network' })
  })
})

describe('exchangeGoogleCode', () => {
  it('refuses an answer without a refresh token', async () => {
    const token = tokenFetch(json({ access_token: 'at', expires_in: 3600 }))
    const result = await exchangeGoogleCode(client, 'c', 'v', 1, token.fetch)
    expect(result).toEqual({ ok: false, reason: 'network' })
  })

  it('reads a rejected code as denied', async () => {
    const token = tokenFetch(json({ error: 'invalid_grant' }, 400))
    const result = await exchangeGoogleCode(client, 'c', 'v', 1, token.fetch)
    expect(result).toEqual({ ok: false, reason: 'denied' })
  })
})

describe('refreshGoogleToken', () => {
  it('returns a new access token', async () => {
    const token = tokenFetch(json({ access_token: 'new', expires_in: 3600 }))
    const result = await refreshGoogleToken(client, 'rt', token.fetch, undefined, () => 0)
    expect(result).toEqual({ ok: true, accessToken: 'new', expiresAt: 3540 * 1000 })
    const body = new URLSearchParams(String(token.calls[0]!.body))
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('rt')
  })

  it('reads invalid_grant as a revoked connection', async () => {
    const token = tokenFetch(json({ error: 'invalid_grant' }, 400))
    expect(await refreshGoogleToken(client, 'rt', token.fetch)).toEqual({
      ok: false,
      reason: 'revoked',
    })
  })

  it('keeps the connection on other failures', async () => {
    const token = tokenFetch(json({ error: 'server' }, 503))
    expect(await refreshGoogleToken(client, 'rt', token.fetch)).toEqual({
      ok: false,
      reason: 'network',
    })
  })
})
