// @vitest-environment node
/**
 * `epub-asset://`: only entries of the book open in the view the token names,
 * fonts revealed, fixed content types, no scripts, and a CSP on every answer.
 */
import { describe, expect, it } from 'vitest'
import { openEpub, type EpubBook } from '@genoffice/epub-engine'
import {
  EPUB_ASSET_CSP,
  EPUB_ASSET_SCHEME_PRIVILEGE,
  assetContentType,
  parseAssetUrl,
  serveEpubAsset,
} from '../src/main/asset-protocol'
import { epubAssetBase, epubAssetUrl } from '../src/shared/asset-url'
import { FONT_BYTES, buildBook } from './helpers/book'

const TOKEN = '0123456789abcdef0123456789abcdef'

async function book(): Promise<EpubBook> {
  const opened = await openEpub(await buildBook({ extras: true }))
  if (!opened.ok) throw new Error('did not open')
  return opened.book
}

const get = (url: string, b: EpubBook | null, method = 'GET') =>
  serveEpubAsset({ url, method }, (token) => (token === TOKEN ? b : null))

const url = (path: string) => epubAssetUrl(epubAssetBase(TOKEN), path)

describe('epub-asset addresses', () => {
  it('encodes each path segment and names the view by its token', () => {
    expect(url('OEBPS/text/chapter 1.xhtml')).toBe(
      `epub-asset://${TOKEN}/OEBPS/text/chapter%201.xhtml`,
    )
    expect(parseAssetUrl(url('OEBPS/text/chapter 1.xhtml'))).toEqual({
      ok: true,
      token: TOKEN,
      path: 'OEBPS/text/chapter 1.xhtml',
    })
  })

  it('stops `..` at the zip root: nothing outside the archive is ever named', () => {
    const parsed = parseAssetUrl(`epub-asset://${TOKEN}/OEBPS/%2E%2E/%2E%2E/%2E%2E/etc/passwd`)
    expect(parsed).toEqual({ ok: true, token: TOKEN, path: 'etc/passwd' })
  })

  it('refuses other schemes and malformed tokens', () => {
    expect(parseAssetUrl('file:///C:/Windows/win.ini')).toEqual({ ok: false, status: 400 })
    expect(parseAssetUrl('epub-asset://not-a-token/OEBPS/a.css')).toEqual({
      ok: false,
      status: 404,
    })
  })

  it('is declared secure and standard so a secure page may load from it', () => {
    expect(EPUB_ASSET_SCHEME_PRIVILEGE.scheme).toBe('epub-asset')
    expect(EPUB_ASSET_SCHEME_PRIVILEGE.privileges).toMatchObject({ standard: true, secure: true })
  })
})

describe('serving entries', () => {
  it('serves an entry of the book with its content type, the CSP and nosniff', async () => {
    const res = await get(url('OEBPS/styles/book.css'), await book())
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/css')
    expect(res.headers.get('Content-Security-Policy')).toBe(EPUB_ASSET_CSP)
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await res.text()).toBe('body { margin: 0 }\n')
  })

  it('the CSP blocks scripts and every outside connection', () => {
    expect(EPUB_ASSET_CSP).toContain("default-src 'none'")
    expect(EPUB_ASSET_CSP).toContain("script-src 'none'")
    expect(EPUB_ASSET_CSP).toContain("connect-src 'none'")
    expect(EPUB_ASSET_CSP).toContain('sandbox')
    expect(EPUB_ASSET_CSP).not.toMatch(/https?:|\*/)
  })

  it('reveals an obfuscated font for drawing', async () => {
    const b = await book()
    const stored = await b.read('OEBPS/fonts/a.otf')
    expect(stored).not.toEqual(FONT_BYTES)
    const res = await get(url('OEBPS/fonts/a.otf'), b)
    expect(res.headers.get('Content-Type')).toBe('font/otf')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(FONT_BYTES)
  })

  it('refuses a script entry', async () => {
    const res = await get(url('OEBPS/code/app.js'), await book())
    expect(res.status).toBe(403)
    expect(res.headers.get('Content-Security-Policy')).toBe(EPUB_ASSET_CSP)
  })

  it('refuses entries the book does not have, and paths that escape upward', async () => {
    const b = await book()
    expect((await get(url('OEBPS/missing.png'), b)).status).toBe(404)
    expect((await get(`epub-asset://${TOKEN}/../../../Windows/win.ini`, b)).status).toBe(404)
  })

  it('refuses a token that names no open book (another view, or a closed one)', async () => {
    const b = await book()
    const other = epubAssetUrl(
      epubAssetBase('fedcba9876543210fedcba9876543210'),
      'OEBPS/styles/book.css',
    )
    expect((await get(other, b)).status).toBe(404)
    expect((await get(url('OEBPS/styles/book.css'), null)).status).toBe(404)
  })

  it('answers GET and HEAD only', async () => {
    const b = await book()
    expect((await get(url('OEBPS/styles/book.css'), b, 'POST')).status).toBe(405)
    const head = await get(url('OEBPS/images/pic.png'), b, 'HEAD')
    expect(head.status).toBe(200)
    expect(head.headers.get('Content-Type')).toBe('image/png')
  })
})

describe('content types', () => {
  it('come from a fixed table, never from a script type, opaque bytes otherwise', () => {
    expect(assetContentType('a/b.xhtml')).toBe('application/xhtml+xml')
    expect(assetContentType('a/b.SVG')).toBe('image/svg+xml')
    expect(assetContentType('a/b.woff2')).toBe('font/woff2')
    expect(assetContentType('a/b.js')).toBeNull()
    expect(assetContentType('a/b.dat', 'application/javascript')).toBeNull()
    expect(assetContentType('a/b', 'image/png')).toBe('image/png')
    expect(assetContentType('a/b', 'text/html; evil')).toBe('application/octet-stream')
  })
})
