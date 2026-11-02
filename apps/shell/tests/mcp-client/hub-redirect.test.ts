import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { redirectSafeFetch } from '../../src/main/mcp-client/hub'
import type { McpFetch } from '../../src/main/mcp-client/oauth'
import { RemoteMcpError, createRemoteMcpConnection } from '../../src/main/mcp-client/remote'

/**
 * Electron's `net.fetch` with `redirect: 'manual'` has not been exercised in
 * the app. Whatever it hands back for a redirect (an opaque redirect, a 3xx,
 * or a response it followed anyway), a remote server must end up refused.
 */

const cleanups: (() => Promise<unknown> | unknown)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c()
})

/** a response shaped like the browser's opaque redirect (type and status cannot be constructed) */
function opaqueRedirect(): Response {
  const response = new Response(null, { status: 200 })
  Object.defineProperty(response, 'type', { value: 'opaqueredirect' })
  Object.defineProperty(response, 'status', { value: 0 })
  return response
}

/** a response as if the network layer followed a redirect to `url` */
function followed(url: string): Response {
  const response = new Response('{}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
  Object.defineProperty(response, 'redirected', { value: true })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

async function connectionReason(fetch: McpFetch, url = 'https://law.example.com/mcp') {
  const connection = createRemoteMcpConnection({
    server: { name: 'law', url, transport: 'auto', headers: { Authorization: 'Bearer k' } },
    oauth: { read: () => null, writeTokens: async () => {} },
    clientInfo: { name: 'IeumOffice', version: '9.9.9' },
    fetch: redirectSafeFetch(fetch),
  })
  cleanups.push(() => connection.close())
  try {
    await connection.connect()
  } catch (error) {
    expect(error).toBeInstanceOf(RemoteMcpError)
    return (error as RemoteMcpError).reason
  }
  throw new Error('expected a refusal')
}

describe('remote MCP redirects through the app fetch', () => {
  it('asks the network layer not to follow redirects', async () => {
    const base = vi.fn(async () => opaqueRedirect())
    await connectionReason(base)
    for (const call of base.mock.calls as unknown as [string, RequestInit][]) {
      expect(call[1].redirect).toBe('manual')
    }
  })

  it('refuses an opaque redirect', async () => {
    expect(await connectionReason(async () => opaqueRedirect())).toBe('refused-redirect')
  })

  it('refuses a redirect the network layer followed to another origin anyway', async () => {
    expect(await connectionReason(async () => followed('https://elsewhere.example/mcp'))).toBe(
      'refused-redirect',
    )
  })

  it('refuses a real 302 to another origin from a server on this PC, never reaching it', async () => {
    let reached = false
    const elsewhere: Server = createServer((_req, res) => {
      reached = true
      res.end('{}')
    })
    await new Promise<void>((resolve) => elsewhere.listen(0, '127.0.0.1', resolve))
    cleanups.push(() => new Promise((resolve) => elsewhere.close(resolve)))
    const away = `http://127.0.0.1:${(elsewhere.address() as AddressInfo).port}/mcp`
    const server: Server = createServer((_req, res) => {
      res.writeHead(302, { location: away })
      res.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    cleanups.push(() => new Promise((resolve) => server.close(resolve)))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`
    expect(await connectionReason((input, init) => fetch(input, init), url)).toBe(
      'refused-redirect',
    )
    expect(reached).toBe(false)
  })

  it('passes ordinary answers through untouched', async () => {
    const plain = new Response('ok', { status: 200 })
    const safe = redirectSafeFetch(async () => plain)
    expect(await safe('https://law.example.com/mcp')).toBe(plain)
  })
})
