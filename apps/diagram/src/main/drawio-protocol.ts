/**
 * The `drawio-app://` scheme: draw.io's files for the diagram tab (spec 4, 6).
 *
 * - Only files under the bundle folder are served; `..`, encoded separators
 *   and anything resolving outside it are refused. draw.io never runs from
 *   `file://`.
 * - `index.html` is served with our bridge script put first in `<head>`;
 *   draw.io's files are otherwise served byte for byte.
 * - `/__ieum/bridge.js` is our bridge; `/__ieum/print/<token>` is a page the
 *   app prints or turns into a PDF (held in memory, used once).
 * - Every response carries the Content-Security-Policy below and `nosniff`.
 *   Only GET and HEAD are answered.
 *
 * Electron-free apart from the scheme declaration, so the tests read it.
 */
import type { CustomScheme } from 'electron'
import { resolve, sep } from 'node:path'
import {
  BRIDGE_PREFIX,
  BRIDGE_SCRIPT_PATH,
  DRAWIO_HOST,
  DRAWIO_SCHEME,
} from '../shared/bridge-protocol'

/**
 * Standard and secure, so draw.io gets a real origin (`drawio-app://editor`)
 * with its own storage, and may fetch its own files. The shell registers it
 * once per process with its other schemes; a standalone run registers it itself.
 */
export const DRAWIO_SCHEME_PRIVILEGE: CustomScheme = {
  scheme: DRAWIO_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
}

/**
 * The policy on draw.io's pages. Scripts only from our scheme; draw.io's
 * own requests (its resources, shapes, templates, fonts) only to our scheme,
 * `data:` and `blob:`; no frame, worker, form or connection anywhere else.
 *
 * - `'unsafe-inline'` for styles: draw.io sets inline style attributes and
 *   style elements on almost every element it draws.
 * - No `'unsafe-eval'`: draw.io's own code does not need it here (it keeps
 *   stencil evaluation off outside its development mode), and a run of the
 *   editor with Mermaid conversion, the shape search and its dialogs reported
 *   no policy violation without it.
 * - `frame-ancestors`: only the app's editor page may hold draw.io.
 */
export function drawioCsp(frameAncestors: readonly string[]): string {
  const self = `${DRAWIO_SCHEME}:`
  return [
    "default-src 'none'",
    `script-src ${self}`,
    `style-src ${self} 'unsafe-inline'`,
    `img-src ${self} data: blob:`,
    `font-src ${self} data:`,
    `connect-src ${self} data: blob:`,
    `media-src ${self} data: blob:`,
    `worker-src ${self} blob:`,
    `frame-src ${self} blob: data:`,
    `child-src ${self} blob: data:`,
    "object-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    `frame-ancestors ${frameAncestors.length > 0 ? frameAncestors.join(' ') : "'none'"}`,
  ].join('; ')
}

/** The policy on a page the app prints: pictures and styles only, no script at all. */
export const PRINT_PAGE_CSP = [
  "default-src 'none'",
  `img-src ${DRAWIO_SCHEME}: data: blob:`,
  "style-src 'unsafe-inline'",
  `font-src ${DRAWIO_SCHEME}: data:`,
  "script-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const MIME_BY_EXT: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  wasm: 'application/wasm',
  map: 'application/json; charset=utf-8',
}

export function contentTypeOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  const ext = dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

export type DrawioTarget =
  | { kind: 'file'; path: string; relative: string }
  | { kind: 'bridge' }
  | { kind: 'print'; token: string }
  | { kind: 'refused'; status: 400 | 403 | 404 }

/**
 * What an address names: a file under `root`, the bridge, a print page, or
 * nothing servable. Refuses other hosts, encoded separators and NUL, `..`
 * that leaves the folder, and the folder itself.
 */
export function resolveDrawioRequest(root: string, requestUrl: string): DrawioTarget {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return { kind: 'refused', status: 400 }
  }
  if (url.protocol !== `${DRAWIO_SCHEME}:` || url.hostname !== DRAWIO_HOST) {
    return { kind: 'refused', status: 404 }
  }
  const raw = url.pathname
  // encoded separators and NUL never name a draw.io file
  if (/%2f|%5c|%00/i.test(raw)) return { kind: 'refused', status: 400 }
  let pathname: string
  try {
    pathname = decodeURIComponent(raw)
  } catch {
    return { kind: 'refused', status: 400 }
  }
  if (pathname.length > 4096 || pathname.includes('\0') || pathname.includes('\\')) {
    return { kind: 'refused', status: 400 }
  }
  if (pathname === BRIDGE_SCRIPT_PATH) return { kind: 'bridge' }
  if (pathname.startsWith(`${BRIDGE_PREFIX}print/`)) {
    const token = pathname.slice(`${BRIDGE_PREFIX}print/`.length)
    return /^[0-9a-f]{32}$/.test(token)
      ? { kind: 'print', token }
      : { kind: 'refused', status: 404 }
  }
  if (pathname.startsWith(BRIDGE_PREFIX)) return { kind: 'refused', status: 404 }
  const relative = pathname.replace(/^\/+/, '')
  if (relative === '') return { kind: 'refused', status: 404 }
  const base = resolve(root)
  const file = resolve(base, relative)
  if (file === base || !file.startsWith(base + sep)) return { kind: 'refused', status: 403 }
  return { kind: 'file', path: file, relative: relative.split(sep).join('/') }
}

/** draw.io's start page with our bridge loaded before anything of draw.io's. */
export function injectBridge(indexHtml: string): string {
  const tag = `<script src="${BRIDGE_SCRIPT_PATH}"></script>`
  const head = /<head(\s[^>]*)?>/i.exec(indexHtml)
  if (!head) throw new Error('draw.io index.html has no <head>')
  const at = head.index + head[0].length
  return `${indexHtml.slice(0, at)}\n${tag}${indexHtml.slice(at)}`
}

export function responseHeaders(contentType: string, csp: string): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-cache',
  }
}
