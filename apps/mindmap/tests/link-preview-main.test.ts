// @vitest-environment node
/**
 * mindmap:read-link-preview — the one place the map reads a web page (decision
 * 0099). What it takes from the markup, that every request goes through the
 * SSRF gate, that only the head of a page is read, and that the picture is
 * downloaded only from a web address.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import {
  decodeEntities,
  PAGE_READ_LIMIT,
  pageCharset,
  parsePagePreview,
  readLinkPreview,
} from '../src/main/link-preview'

/** A public address written as a literal, so the gate needs no name lookup. */
const PAGE = 'https://93.184.216.34/post/1'

const page = (html: string, contentType = 'text/html; charset=utf-8', url = PAGE): Response => {
  const resp = new Response(html, { status: 200, headers: { 'content-type': contentType } })
  Object.defineProperty(resp, 'url', { value: url })
  return resp
}

const picture = { base64: 'iVBORw0KGgo=', mime: 'image/png' }

describe('what a page says about itself', () => {
  it('takes the picture and title tags before the plain title, first found wins', () => {
    const html = `<html><head>
      <title>Plain title</title>
      <meta name="twitter:image" content="https://cdn.example.com/tw.jpg">
      <meta property="og:image" content="https://cdn.example.com/og.jpg" />
      <meta property='og:title' content='Rock &amp; Roll &#8211; live'>
    </head></html>`
    expect(parsePagePreview(html, PAGE)).toEqual({
      pictureUrl: 'https://cdn.example.com/og.jpg',
      title: 'Rock & Roll – live',
    })
  })

  it('reads relative pictures against the page, and refuses any address that is not on the web', () => {
    expect(
      parsePagePreview('<meta property="og:image" content="/img/a.png">', PAGE).pictureUrl,
    ).toBe('https://93.184.216.34/img/a.png')
    for (const bad of ['javascript:alert(1)', 'file:///C:/x.png', 'data:image/png;base64,AA==']) {
      expect(
        parsePagePreview(`<meta property="og:image" content="${bad}">`, PAGE).pictureUrl,
      ).toBeNull()
    }
  })

  it('falls back to the image_src link and the plain title, on one line', () => {
    const html =
      '<link rel="image_src" href="//cdn.example.com/a.gif"><title>\n  Two\n  lines </title>'
    expect(parsePagePreview(html, PAGE)).toEqual({
      pictureUrl: 'https://cdn.example.com/a.gif',
      title: 'Two lines',
    })
  })

  it('gives nothing for a page without tags, and cuts a very long title', () => {
    expect(parsePagePreview('<p>hello</p>', PAGE)).toEqual({ pictureUrl: null, title: null })
    const long = parsePagePreview(`<title>${'a'.repeat(500)}</title>`, PAGE).title!
    expect(long.length).toBe(200)
    expect(long.endsWith('…')).toBe(true)
  })

  it('decodes character references and leaves unknown ones as written', () => {
    expect(decodeEntities('&lt;b&gt; &#x41;&#66; &unknown; &#0;')).toBe('<b> AB &unknown; &#0;')
  })

  it('finds the character set in the header first, then in the page', () => {
    const head = new TextEncoder().encode('<meta charset="euc-kr">')
    expect(pageCharset('text/html; charset=Shift_JIS', head)).toBe('shift_jis')
    expect(pageCharset('text/html', head)).toBe('euc-kr')
    expect(pageCharset('text/html', new Uint8Array())).toBe('utf-8')
  })
})

describe('reading a link', () => {
  it('reads the page, then downloads the picture it names', async () => {
    const fetchImpl = vi.fn(async () =>
      page('<meta property="og:image" content="/a.png"><meta property="og:title" content="Hi">'),
    )
    const fetchImage = vi.fn(async () => picture)
    const result = await readLinkPreview(PAGE, { fetchImpl, fetchImage })
    expect(result).toEqual({ ok: true, title: 'Hi', picture })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImage).toHaveBeenCalledWith('https://93.184.216.34/a.png')
  })

  it('reads relative addresses against where a redirect ended', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === PAGE) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://93.184.216.35/moved/' },
        })
      }
      return page('<meta property="og:image" content="b.jpg">', 'text/html', url)
    })
    const fetchImage = vi.fn(async () => picture)
    await readLinkPreview(PAGE, { fetchImpl: fetchImpl as unknown as typeof fetch, fetchImage })
    expect(fetchImage).toHaveBeenCalledWith('https://93.184.216.35/moved/b.jpg')
  })

  it('never reaches an address inside the network, nor a page a redirect sends there', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }),
    )
    const fetchImage = vi.fn()
    for (const url of [
      'http://127.0.0.1/',
      'http://192.168.0.1/',
      'http://169.254.169.254/latest',
    ]) {
      expect(await readLinkPreview(url, { fetchImpl, fetchImage })).toEqual({
        ok: false,
        reason: 'unreachable',
      })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(await readLinkPreview(PAGE, { fetchImpl, fetchImage })).toEqual({
      ok: false,
      reason: 'unreachable',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImage).not.toHaveBeenCalled()
  })

  it('reads nothing for an address that is not a web page', async () => {
    const fetchImpl = vi.fn()
    for (const url of [
      'mailto:a@b.c',
      'javascript:alert(1)',
      'file:///C:/a.html',
      'example.com',
      42,
    ]) {
      expect(await readLinkPreview(url, { fetchImpl })).toEqual({ ok: false, reason: 'not-web' })
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('takes nothing from a response that is not a page, or that failed', async () => {
    const fetchImage = vi.fn()
    const pdf = vi.fn(async () => page('%PDF-1.7', 'application/pdf'))
    expect(await readLinkPreview(PAGE, { fetchImpl: pdf, fetchImage })).toEqual({
      ok: false,
      reason: 'not-page',
    })
    const missing = vi.fn(async () => new Response('gone', { status: 404 }))
    expect(await readLinkPreview(PAGE, { fetchImpl: missing, fetchImage })).toEqual({
      ok: false,
      reason: 'unreachable',
    })
    const broken = vi.fn(async () => {
      throw new Error('ECONNRESET')
    })
    expect(await readLinkPreview(PAGE, { fetchImpl: broken, fetchImage })).toEqual({
      ok: false,
      reason: 'unreachable',
    })
    expect(fetchImage).not.toHaveBeenCalled()
  })

  it('keeps the title when the picture cannot be downloaded', async () => {
    const fetchImpl = vi.fn(async () =>
      page('<title>Only words</title><meta property="og:image" content="https://x.example/a.png">'),
    )
    const result = await readLinkPreview(PAGE, { fetchImpl, fetchImage: async () => null })
    expect(result).toEqual({ ok: true, title: 'Only words', picture: null })
  })

  it('reads a page in the character set it declares', async () => {
    // "가나" in EUC-KR
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('<meta charset="euc-kr"><title>'),
      0xb0,
      0xa1,
      0xb3,
      0xaa,
      ...new TextEncoder().encode('</title>'),
    ])
    const fetchImpl = vi.fn(async () => {
      const resp = new Response(bytes, { headers: { 'content-type': 'text/html' } })
      Object.defineProperty(resp, 'url', { value: PAGE })
      return resp
    })
    expect(await readLinkPreview(PAGE, { fetchImpl })).toEqual({
      ok: true,
      title: '가나',
      picture: null,
    })
  })

  it('stops reading at the end of the head and never downloads the whole of a large page', async () => {
    let served = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk =
          served === 0
            ? new TextEncoder().encode('<head><title>Big</title></head>')
            : new Uint8Array(64 * 1024).fill(0x61)
        served += chunk.byteLength
        controller.enqueue(chunk)
      },
    })
    const fetchImpl = vi.fn(async () => {
      const resp = new Response(body, { headers: { 'content-type': 'text/html' } })
      Object.defineProperty(resp, 'url', { value: PAGE })
      return resp
    })
    expect(await readLinkPreview(PAGE, { fetchImpl })).toEqual({
      ok: true,
      title: 'Big',
      picture: null,
    })
    expect(served).toBeLessThan(PAGE_READ_LIMIT)
  })
})
