import { describe, expect, it } from 'vitest'
import { DRIVE_API, DRIVE_UPLOAD_API, DriveApi, listingQuery, queryLiteral } from '../src/drive-api'
import type { FetchLike } from '../src/oauth'

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function api(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetch: FetchLike = async (url, init = {}) => {
    calls.push({ url, init })
    return handler(url, init)
  }
  return { calls, drive: new DriveApi({ token: async () => 'tok', fetch }) }
}

describe('queryLiteral', () => {
  it('escapes quotes and backslashes so a search text cannot change the query', () => {
    expect(queryLiteral("it's")).toBe("'it\\'s'")
    expect(queryLiteral('a\\b')).toBe("'a\\\\b'")
    expect(queryLiteral("x' or trashed = true or name = '")).toBe(
      "'x\\' or trashed = true or name = \\''",
    )
  })
})

describe('listingQuery', () => {
  it('lists the files the app may open, most recently viewed first', () => {
    expect(listingQuery({ kind: 'recent' })).toEqual({
      q: "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
      orderBy: 'viewedByMeTime desc',
    })
  })

  it('searches names and contents without an ordering', () => {
    const { q, orderBy } = listingQuery({ kind: 'search', text: '회의록' })
    expect(q).toBe("(name contains '회의록' or fullText contains '회의록') and trashed = false")
    expect(orderBy).toBe('')
  })
})

describe('DriveApi', () => {
  it('sends the access token and reads a listing', async () => {
    const { calls, drive } = api(() =>
      json({
        nextPageToken: 'p2',
        files: [
          {
            id: 'f1',
            name: 'Report.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            modifiedTime: '2026-10-01T00:00:00Z',
            size: '1234',
            md5Checksum: 'abc',
            capabilities: { canEdit: true },
          },
          { name: 'no id' },
        ],
      }),
    )
    const result = await drive.list({ kind: 'recent' })
    expect(result).toEqual({
      ok: true,
      nextPageToken: 'p2',
      files: [
        {
          id: 'f1',
          name: 'Report.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          modifiedTime: '2026-10-01T00:00:00Z',
          size: 1234,
          md5Checksum: 'abc',
          canEdit: true,
        },
      ],
    })
    expect(calls[0]!.url.startsWith(`${DRIVE_API}/files?`)).toBe(true)
    expect(new Headers(calls[0]!.init.headers).get('Authorization')).toBe('Bearer tok')
  })

  it('does not call Drive without a token', async () => {
    const calls: string[] = []
    const drive = new DriveApi({
      token: async () => null,
      fetch: async (url) => {
        calls.push(url)
        return json({})
      },
    })
    expect(await drive.list({ kind: 'recent' })).toEqual({ ok: false, kind: 'not-connected' })
    expect(calls).toEqual([])
  })

  it.each([
    [401, {}, 'not-connected'],
    [404, {}, 'not-found'],
    [429, {}, 'rate-limit'],
    [403, { error: { errors: [{ reason: 'exportSizeLimitExceeded' }] } }, 'too-large'],
    [403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, 'rate-limit'],
    [403, { error: { errors: [{ reason: 'cannotDownloadFile' }] } }, 'forbidden'],
    [500, {}, 'network'],
  ])('maps HTTP %i to %s', async (status, body, kind) => {
    const { drive } = api(() => json(body, status))
    expect(await drive.file('x')).toEqual({ ok: false, kind })
  })

  it('stops a download past the limit', async () => {
    const { drive } = api(() => new Response(new Uint8Array(100)))
    expect(await drive.download('x', 50)).toEqual({ ok: false, kind: 'too-large' })
    const ok = await drive.download('x', 100)
    expect(ok.ok && ok.bytes.byteLength).toBe(100)
  })

  it('refuses a declared length past the limit without reading', async () => {
    const { drive } = api(
      () => new Response(new Uint8Array(10), { headers: { 'Content-Length': '999' } }),
    )
    expect(await drive.download('x', 50)).toEqual({ ok: false, kind: 'too-large' })
  })

  it('replaces a file through a resumable session on the upload host', async () => {
    const session = `${DRIVE_UPLOAD_API}/files?uploadType=resumable&upload_id=s1`
    const { calls, drive } = api((url, init) => {
      if (init.method === 'PATCH') return new Response(null, { headers: { Location: session } })
      return json({ id: 'f1', name: 'a.docx', mimeType: 'x', capabilities: { canEdit: true } })
    })
    const result = await drive.upload({ existingId: 'f1' }, new Uint8Array([1, 2, 3]), 'x')
    expect(result.ok).toBe(true)
    expect(calls[0]!.url.startsWith(`${DRIVE_UPLOAD_API}/files/f1?`)).toBe(true)
    expect(calls[1]!.url).toBe(session)
    expect(calls[1]!.init.method).toBe('PUT')
  })

  it('does not send the bytes to a session address off the upload host', async () => {
    const { calls, drive } = api(
      () => new Response(null, { headers: { Location: 'https://evil.example/upload' } }),
    )
    const result = await drive.upload({ name: 'n.docx', parentId: 'p' }, new Uint8Array([1]), 'x')
    expect(result).toEqual({ ok: false, kind: 'network' })
    expect(calls).toHaveLength(1)
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ name: 'n.docx', parents: ['p'] })
  })
})
