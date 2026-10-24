/**
 * The `epub-asset://` scheme: a book's pictures, styles, fonts and chapters for
 * the chapter frame (spec §3 "Resources", §12.2). Electron-free apart from the
 * scheme declaration (the main module registers the handler).
 *
 * An address is `epub-asset://<token>/<entry path>`. The token is random and
 * names one view; it is the only way to reach that view's book, and it stops
 * working when the view closes. Served:
 * - only entries of that book's zip (`..` stops at the zip root; nothing on
 *   disk, nothing remote is ever reached);
 * - obfuscated fonts revealed (for drawing only; saving never uses these bytes);
 * - with a content type from a fixed table, `nosniff`, and a CSP that blocks
 *   scripts and every outside connection, should an entry ever be loaded as a
 *   document.
 * Refused: script entries, any method but GET/HEAD, unknown tokens, missing
 * entries.
 */
import type { CustomScheme } from 'electron'
import { normalizeZipPath, type EpubBook } from '@genoffice/epub-engine'
import { EPUB_ASSET_SCHEME } from '../shared/ipc'

/** Secure and standard: a secure renderer page may load pictures and fonts from it. */
export const EPUB_ASSET_SCHEME_PRIVILEGE: CustomScheme = {
  scheme: EPUB_ASSET_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
}

/**
 * The policy every response carries. A document served from here (an SVG or
 * a chapter opened directly) runs no script and reaches nothing outside the
 * book; `sandbox` gives it an opaque origin besides.
 */
export const EPUB_ASSET_CSP = [
  "default-src 'none'",
  `img-src ${EPUB_ASSET_SCHEME}: data:`,
  `style-src ${EPUB_ASSET_SCHEME}: 'unsafe-inline'`,
  `font-src ${EPUB_ASSET_SCHEME}: data:`,
  `media-src ${EPUB_ASSET_SCHEME}:`,
  "script-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  `base-uri ${EPUB_ASSET_SCHEME}:`,
  'sandbox',
].join('; ')

/** Content types by extension. Anything else is served as opaque bytes. */
const MIME_BY_EXT: Readonly<Record<string, string>> = {
  xhtml: 'application/xhtml+xml',
  xht: 'application/xhtml+xml',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  otf: 'font/otf',
  ttf: 'font/ttf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  xml: 'application/xml',
  opf: 'application/oebps-package+xml',
  ncx: 'application/x-dtbncx+xml',
  smil: 'application/smil+xml',
  txt: 'text/plain',
}

const SCRIPT_EXTS = new Set(['js', 'mjs', 'cjs'])
const SCRIPT_MEDIA_TYPE = /(?:java|ecma)script/i

const extOf = (path: string): string => {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/** The content type an entry is served with; null for a script, which is never served. */
export function assetContentType(path: string, manifestMediaType?: string | null): string | null {
  const ext = extOf(path)
  if (SCRIPT_EXTS.has(ext)) return null
  if (manifestMediaType && SCRIPT_MEDIA_TYPE.test(manifestMediaType)) return null
  const byExt = MIME_BY_EXT[ext]
  if (byExt) return byExt
  // the manifest names a type the table knows under another extension: trust only those
  if (manifestMediaType && Object.values(MIME_BY_EXT).includes(manifestMediaType)) {
    return manifestMediaType
  }
  return 'application/octet-stream'
}

/** The headers of a served entry. */
export function assetHeaders(contentType: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Content-Security-Policy': EPUB_ASSET_CSP,
    'X-Content-Type-Options': 'nosniff',
    // fonts are fetched with CORS from the chapter frame; the token keeps other books out
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  }
}

export type AssetTarget =
  { ok: true; token: string; path: string } | { ok: false; status: 400 | 404 }

/** The view token and the zip entry path an address names. */
export function parseAssetUrl(url: string): AssetTarget {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, status: 400 }
  }
  if (parsed.protocol !== `${EPUB_ASSET_SCHEME}:`) return { ok: false, status: 400 }
  const token = parsed.hostname.toLowerCase()
  if (!/^[0-9a-f]{16,64}$/.test(token)) return { ok: false, status: 404 }
  let decoded: string
  try {
    decoded = parsed.pathname
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/')
  } catch {
    return { ok: false, status: 400 }
  }
  // `..` stops at the zip root; a backslash is never a separator inside a zip
  const path = normalizeZipPath(decoded)
  if (path === '') return { ok: false, status: 404 }
  return { ok: true, token, path }
}

/** what the scheme needs of the open books */
export type AssetBookLookup = (token: string) => EpubBook | null

const refuse = (status: number): Response =>
  new Response(null, { status, headers: { 'Content-Security-Policy': EPUB_ASSET_CSP } })

/** Answers one request of the scheme. */
export async function serveEpubAsset(
  request: Pick<Request, 'url' | 'method'>,
  lookup: AssetBookLookup,
): Promise<Response> {
  const method = request.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') return refuse(405)
  const target = parseAssetUrl(request.url)
  if (!target.ok) return refuse(target.status)
  const book = lookup(target.token)
  if (!book || !book.has(target.path)) return refuse(404)
  const manifest = book.manifest.find((m) => m.path === target.path)
  const contentType = assetContentType(target.path, manifest?.mediaType)
  if (!contentType) return refuse(403)
  let bytes: Uint8Array | null
  try {
    bytes = await book.readForRendering(target.path)
  } catch {
    return refuse(404)
  }
  if (!bytes) return refuse(404)
  const headers = assetHeaders(contentType)
  if (method === 'HEAD') return new Response(null, { status: 200, headers })
  return new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200, headers })
}
