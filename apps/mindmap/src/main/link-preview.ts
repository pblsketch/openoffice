/**
 * The preview of a web link: the picture and the title a page names for
 * itself (`og:image`, `og:title` and their kin), read once when the person
 * asks for it in the link dialog (decision 0099).
 *
 * This is the only place the map reaches a web page. It is never called while
 * a map is drawn or opened: the renderer asks for it only when the person
 * ticked "fetch a preview" and pressed OK. What it brings back becomes a
 * picture inside the map file, so the map never fetches it again.
 *
 * Every request goes through the SSRF gate (`fetchWithSsrfGuard`, each
 * redirect hop checked, internal addresses refused), carries no cookies, and
 * reads at most the head of the page. The picture is downloaded by the same
 * gate the AI's pictures use (`fetchImageBytes`), and only from a web address.
 */
import { ipcMain } from 'electron'
import { fetchImageBytes } from '@genoffice/electron-utils/fetch-image-bytes'
import { fetchWithSsrfGuard } from '@genoffice/electron-utils/safe-remote-url'
import { MINDMAP_CHANNELS, type LinkPreviewResult } from '../shared/ipc'

/** How much of a page is read at most: the tags sit in its head, far before this. */
export const PAGE_READ_LIMIT = 512 * 1024
/** How long the page may take; the picture has its own retries. */
const PAGE_TIMEOUT_MS = 15_000
/** The longest title taken from a page. */
const TITLE_MAX = 200

const PAGE_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
}

/** The tags that name a page's picture, the first found wins. */
const PICTURE_KEYS = [
  'og:image:secure_url',
  'og:image',
  'og:image:url',
  'twitter:image',
  'twitter:image:src',
]
/** The tags that name a page's title, before its `<title>`. */
const TITLE_KEYS = ['og:title', 'twitter:title']

export interface PagePreview {
  /** an http(s) address, already made absolute */
  pictureUrl: string | null
  title: string | null
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** The text of an attribute or a title, with the character references a page writes in it. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code =
        ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1))
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole
    }
    return NAMED_ENTITIES[ref.toLowerCase()] ?? whole
  })
}

/** The attributes of one start tag, names in lower case. */
function attributesOf(tag: string): Map<string, string> {
  const found = new Map<string, string>()
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  for (const match of tag.matchAll(pattern)) {
    const name = match[1]!.toLowerCase()
    if (!found.has(name)) found.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''))
  }
  return found
}

const oneLine = (text: string): string | null => {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat === '') return null
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX - 1)}…` : flat
}

/** A web address for the picture, relative ones read against the page; null for any other kind. */
function webAddress(value: string, base: string): string | null {
  try {
    const url = new URL(value.trim(), base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * What a page says about itself, read from its markup as text: nothing in it
 * runs and nothing it names is fetched here.
 */
export function parsePagePreview(html: string, pageUrl: string): PagePreview {
  const meta = new Map<string, string>()
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributesOf(match[0])
    const key = (attrs.get('property') ?? attrs.get('name') ?? '').trim().toLowerCase()
    const content = attrs.get('content')
    if (key !== '' && content !== undefined && content.trim() !== '' && !meta.has(key)) {
      meta.set(key, content)
    }
  }
  let pictureUrl: string | null = null
  for (const key of PICTURE_KEYS) {
    const value = meta.get(key)
    pictureUrl = value === undefined ? null : webAddress(value, pageUrl)
    if (pictureUrl) break
  }
  if (!pictureUrl) {
    for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
      const attrs = attributesOf(match[0])
      const rel = (attrs.get('rel') ?? '').toLowerCase().split(/\s+/)
      const href = attrs.get('href')
      if (rel.includes('image_src') && href) pictureUrl = webAddress(href, pageUrl)
      if (pictureUrl) break
    }
  }
  let title: string | null = null
  for (const key of TITLE_KEYS) {
    const value = meta.get(key)
    title = value === undefined ? null : oneLine(value)
    if (title) break
  }
  if (!title) {
    const tag = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)
    if (tag) title = oneLine(decodeEntities(tag[1]!))
  }
  return { pictureUrl, title }
}

/** The character set a page declares in its header or in its first bytes. */
export function pageCharset(contentType: string, head: Uint8Array): string {
  const fromHeader = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)
  if (fromHeader) return fromHeader[1]!.toLowerCase()
  const start = new TextDecoder('latin1').decode(head.subarray(0, 4096))
  const fromMeta = /<meta\b[^>]*charset\s*=\s*["']?([\w-]+)/i.exec(start)
  return fromMeta ? fromMeta[1]!.toLowerCase() : 'utf-8'
}

function decodePage(bytes: Uint8Array, contentType: string): string {
  try {
    return new TextDecoder(pageCharset(contentType, bytes)).decode(bytes)
  } catch {
    // a label the decoder does not know
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** The start of a body: up to the end of the page's head, or `limit` bytes. The rest is never downloaded. */
async function readHead(resp: Response, limit: number): Promise<Uint8Array> {
  if (!resp.body) return new Uint8Array(await resp.arrayBuffer()).subarray(0, limit)
  const reader = resp.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let tail = ''
  try {
    while (total < limit) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.byteLength
      // the end of the head can straddle two chunks: keep a little of the last one
      const seen = tail + new TextDecoder('latin1').decode(value)
      if (/<\/head\s*>/i.test(seen)) break
      tail = seen.slice(-16)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const out = new Uint8Array(Math.min(total, limit))
  let offset = 0
  for (const chunk of chunks) {
    const part = chunk.subarray(0, out.byteLength - offset)
    out.set(part, offset)
    offset += part.byteLength
    if (offset >= out.byteLength) break
  }
  return out
}

export interface ReadLinkPreviewOptions {
  /** for tests: stands in for the network under the SSRF gate */
  fetchImpl?: typeof fetch
  /** for tests: stands in for the picture download */
  fetchImage?: typeof fetchImageBytes
  signal?: AbortSignal
}

/** Reads the page at `url` and downloads the picture it names. */
export async function readLinkPreview(
  url: unknown,
  options: ReadLinkPreviewOptions = {},
): Promise<LinkPreviewResult> {
  const raw = typeof url === 'string' ? url.trim() : ''
  // only a web address written out in full
  const address = /^https?:\/\//i.test(raw) ? webAddress(raw, raw) : null
  if (!address) return { ok: false, reason: 'not-web' }
  const signal = options.signal ?? AbortSignal.timeout(PAGE_TIMEOUT_MS)
  let resp: Response | null
  try {
    resp = await fetchWithSsrfGuard(address, {
      headers: PAGE_HEADERS,
      signal,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    })
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
  if (!resp || !resp.ok) {
    await resp?.body?.cancel().catch(() => {})
    return { ok: false, reason: 'unreachable' }
  }
  const contentType = resp.headers.get('content-type') ?? ''
  if (!/html/i.test(contentType)) {
    await resp.body?.cancel().catch(() => {})
    return { ok: false, reason: 'not-page' }
  }
  let html: string
  try {
    html = decodePage(await readHead(resp, PAGE_READ_LIMIT), contentType)
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
  // a redirect moved the page: its own addresses are relative to where it ended
  const base = resp.url && /^https?:/i.test(resp.url) ? resp.url : address
  const preview = parsePagePreview(html, base)
  let picture: { base64: string; mime: string } | null = null
  if (preview.pictureUrl) {
    picture = await (options.fetchImage ?? fetchImageBytes)(preview.pictureUrl).catch(() => null)
  }
  return { ok: true, title: preview.title, picture }
}

/** Registers the one channel of link previews. Called once, with the editor's other channels. */
export function registerLinkPreviewIpc(): void {
  ipcMain.handle(MINDMAP_CHANNELS.readLinkPreview, (_e, url: unknown) => readLinkPreview(url))
}
