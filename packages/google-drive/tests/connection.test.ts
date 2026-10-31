import { describe, expect, it } from 'vitest'
import { DriveConnection, type TokenVault } from '../src/connection'
import { GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL, type FetchLike } from '../src/oauth'

const client = { clientId: 'id', clientSecret: 'secret' }

function memoryVault(initial: string | null = null, keeps = true) {
  let value = initial
  const vault: TokenVault = {
    load: async () => value,
    save: async (token) => {
      if (keeps) value = token
      return keeps
    },
    clear: async () => {
      value = null
    },
  }
  return { vault, stored: () => value }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('DriveConnection', () => {
  it('is unavailable in a build without a Google client', async () => {
    const connection = new DriveConnection({
      client: null,
      vault: memoryVault('rt').vault,
      fetch: async () => json({}),
    })
    expect(await connection.load()).toEqual({ state: 'unavailable' })
    expect(connection.connected()).toBe(false)
  })

  it('loads the kept token and refreshes once for concurrent calls', async () => {
    let refreshes = 0
    const fetch: FetchLike = async (url) => {
      if (url === GOOGLE_TOKEN_URL) {
        refreshes += 1
        await new Promise((r) => setTimeout(r, 5))
        return json({ access_token: `at${refreshes}`, expires_in: 3600 })
      }
      return json({ user: { displayName: 'Kim', emailAddress: 'kim@example.com' } })
    }
    const connection = new DriveConnection({ client, vault: memoryVault('rt').vault, fetch })
    await connection.load()
    const [a, b] = await Promise.all([connection.api.account(), connection.api.account()])
    expect(a.ok && b.ok).toBe(true)
    expect(refreshes).toBe(1)
    expect(connection.state()).toMatchObject({ state: 'connected', persisted: true })
  })

  it('forgets a token Google revoked and says so', async () => {
    const kept = memoryVault('rt')
    const fetch: FetchLike = async (url) =>
      url === GOOGLE_TOKEN_URL ? json({ error: 'invalid_grant' }, 400) : json({})
    const connection = new DriveConnection({ client, vault: kept.vault, fetch })
    await connection.load()
    expect(await connection.api.file('x')).toEqual({ ok: false, kind: 'not-connected' })
    expect(connection.state()).toEqual({ state: 'disconnected', expired: true })
    expect(kept.stored()).toBeNull()
  })

  it('keeps the connection through a network failure', async () => {
    const fetch: FetchLike = async (url) => (url === GOOGLE_TOKEN_URL ? json({}, 503) : json({}))
    const connection = new DriveConnection({ client, vault: memoryVault('rt').vault, fetch })
    await connection.load()
    expect(await connection.api.file('x')).toEqual({ ok: false, kind: 'not-connected' })
    expect(connection.connected()).toBe(true)
  })

  it('disconnects: clears the vault and revokes at Google', async () => {
    const kept = memoryVault('rt')
    const urls: string[] = []
    const fetch: FetchLike = async (url, init) => {
      urls.push(url)
      if (url === GOOGLE_REVOKE_URL) {
        expect(new URLSearchParams(String(init?.body)).get('token')).toBe('rt')
      }
      return json({})
    }
    const connection = new DriveConnection({ client, vault: kept.vault, fetch })
    await connection.load()
    await connection.disconnect()
    expect(connection.state()).toEqual({ state: 'disconnected' })
    expect(kept.stored()).toBeNull()
    expect(urls).toContain(GOOGLE_REVOKE_URL)
  })

  it('connects through the browser, and says when the token could not be kept', async () => {
    const fetch: FetchLike = async (url) =>
      url === GOOGLE_TOKEN_URL
        ? json({ access_token: 'at', refresh_token: 'rt-new', expires_in: 3600 })
        : json({ user: { displayName: 'Kim', emailAddress: 'kim@example.com' } })
    const connection = new DriveConnection({
      client,
      vault: memoryVault(null, false).vault,
      fetch,
    })
    const result = await connection.connect({
      pages: {
        done: { lang: 'en', title: 'ok', body: '' },
        failed: { lang: 'en', title: 'no', body: '' },
      },
      openBrowser: async (address) => {
        const url = new URL(address)
        const back = new URL(url.searchParams.get('redirect_uri')!)
        back.searchParams.set('code', 'c')
        back.searchParams.set('state', url.searchParams.get('state')!)
        setTimeout(() => void globalThis.fetch(back).catch(() => {}), 5)
        return true
      },
    })
    expect(result).toEqual({ ok: true })
    expect(connection.state()).toEqual({
      state: 'connected',
      persisted: false,
      account: { displayName: 'Kim', emailAddress: 'kim@example.com' },
    })
  })

  it('picks files through the browser and keeps the earlier grant', async () => {
    const urls: string[] = []
    let issued = 0
    const fetch: FetchLike = async (url) => {
      urls.push(url)
      if (url === GOOGLE_TOKEN_URL) {
        issued += 1
        return json({ access_token: `at${issued}`, refresh_token: `rt${issued}`, expires_in: 3600 })
      }
      return json({ user: { displayName: 'Kim', emailAddress: 'kim@example.com' } })
    }
    const kept = memoryVault()
    const connection = new DriveConnection({ client, vault: kept.vault, fetch })
    const pages = {
      done: { lang: 'en', title: 'ok', body: '' },
      failed: { lang: 'en', title: 'no', body: '' },
    }
    const openBrowser = (ids: string) => async (address: string) => {
      const url = new URL(address)
      expect(url.searchParams.get('trigger_onepick')).toBe('true')
      const back = new URL(url.searchParams.get('redirect_uri')!)
      back.searchParams.set('code', 'c')
      back.searchParams.set('state', url.searchParams.get('state')!)
      back.searchParams.set('picked_file_ids', ids)
      setTimeout(() => void globalThis.fetch(back).catch(() => {}), 5)
      return true
    }
    // picking with no connection yet connects
    expect(await connection.pick({ pages, openBrowser: openBrowser('f1') }, false)).toEqual({
      ok: true,
      picked: ['f1'],
    })
    expect(kept.stored()).toBe('rt1')
    expect(await connection.pick({ pages, openBrowser: openBrowser('f2,f3') }, true)).toEqual({
      ok: true,
      picked: ['f2', 'f3'],
    })
    expect(kept.stored()).toBe('rt2')
    // revoking the older token could end the grant that covers f1
    expect(urls).not.toContain(GOOGLE_REVOKE_URL)
    expect(connection.state()).toMatchObject({
      state: 'connected',
      account: { emailAddress: 'kim@example.com' },
    })
  })
})
