/**
 * Internal links in a note: CommonMark links to other files or headings
 * (`[x](other.md#part)`, `[x](#part)`) and Obsidian wiki links (`[[Note]]`,
 * `[[Note#Heading|alias]]`, `![[picture.png]]`). Pure parsing shared by the
 * renderer (decorations, clicks) and the main process (resolution).
 *
 * Wiki links stay plain text in the document: the editor only decorates
 * them, so the save path never sees a new node type and untouched blocks keep
 * their bytes.
 */

/** where a followed link points, before the main process resolves any path */
export type LinkTarget =
  | { kind: 'external'; url: string }
  | { kind: 'heading'; heading: string }
  | { kind: 'path'; path: string; heading?: string }
  | { kind: 'wiki'; target: string; heading?: string }

export interface WikiLink {
  /** file part, '' for a same-note heading link (`[[#Part]]`) */
  target: string
  /** heading (or `^block` id) after '#', without the '#' */
  heading?: string
  /** display text after '|' */
  alias?: string
}

export interface WikiLinkMatch extends WikiLink {
  /** offset of `[[` (or `![[`) in the scanned text */
  start: number
  /** offset just past `]]` */
  end: number
  /** `![[…]]` */
  embed: boolean
  /** the text between the brackets, as written */
  inner: string
}

/** reply of the main process to a followed path or wiki link */
export type OpenLinkResult =
  { ok: true } | { ok: false; reason: 'untitled' | 'blocked' | 'not-found' }

/** one `[[` completion entry */
export interface NoteSuggestion {
  /** what the menu shows: the file name without `.md` */
  name: string
  /** folder of the note relative to the vault, '' at the top */
  folder: string
  /** what goes between the brackets: the name, or the vault path when the name is taken twice */
  insert: string
}

/** upper bound for any link text crossing IPC */
export const MAX_LINK_TEXT = 4096

/** `[[…]]` with no brackets or line breaks inside; \uFFFF marks text that must not match (code) */
const WIKI_LINK_RE = /(!?)\[\[([^[\]\n\uFFFF]+?)\]\]/g

/** `[[a#b|c]]` → parts; a table cell writes the pipe as `\|` */
export function parseWikiLink(inner: string): WikiLink {
  let body = inner
  let alias: string | undefined
  const pipe = body.search(/\\?\|/)
  if (pipe >= 0) {
    const sepLength = body[pipe] === '\\' ? 2 : 1
    alias = body.slice(pipe + sepLength).trim() || undefined
    body = body.slice(0, pipe)
  }
  let heading: string | undefined
  const hash = body.indexOf('#')
  if (hash >= 0) {
    heading = body.slice(hash + 1).trim() || undefined
    body = body.slice(0, hash)
  }
  return {
    target: body.trim(),
    ...(heading ? { heading } : {}),
    ...(alias ? { alias } : {}),
  }
}

/** every wiki link in `text`, in order */
export function findWikiLinks(text: string): WikiLinkMatch[] {
  const out: WikiLinkMatch[] = []
  if (!text.includes('[[')) return out
  WIKI_LINK_RE.lastIndex = 0
  for (let m = WIKI_LINK_RE.exec(text); m; m = WIKI_LINK_RE.exec(text)) {
    const inner = m[2]!
    const parsed = parseWikiLink(inner)
    if (!parsed.target && !parsed.heading) continue
    out.push({ ...parsed, start: m.index, end: m.index + m[0].length, embed: m[1] === '!', inner })
  }
  return out
}

/** the link a wiki link follows: a same-note heading or a file in the vault */
export function wikiLinkTarget(link: WikiLink): LinkTarget | null {
  if (!link.target) return link.heading ? { kind: 'heading', heading: link.heading } : null
  return { kind: 'wiki', target: link.target, ...(link.heading ? { heading: link.heading } : {}) }
}

function decodeLoosely(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

const EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

/**
 * Classify a CommonMark link destination. Web and mail links open outside;
 * any other scheme (`file:`, `obsidian:`, `javascript:` …) is not followed,
 * so it comes back null.
 */
export function classifyHref(href: string): LinkTarget | null {
  const value = href.trim()
  if (!value || value.length > MAX_LINK_TEXT) return null
  if (value.startsWith('#')) {
    const heading = decodeLoosely(value.slice(1)).trim()
    return heading ? { kind: 'heading', heading } : null
  }
  // a Windows drive path would also match the scheme pattern — check it first
  if (!/^[a-zA-Z]:[\\/]/.test(value)) {
    const scheme = /^([a-z][a-z0-9+.-]*:)/i.exec(value)?.[1]?.toLowerCase()
    if (scheme) return EXTERNAL_SCHEMES.has(scheme) ? { kind: 'external', url: value } : null
  }
  const hash = value.indexOf('#')
  const rawPath = hash >= 0 ? value.slice(0, hash) : value
  const heading = hash >= 0 ? decodeLoosely(value.slice(hash + 1)).trim() : ''
  const path = decodeLoosely(rawPath).trim()
  if (!path) return heading ? { kind: 'heading', heading } : null
  return { kind: 'path', path, ...(heading ? { heading } : {}) }
}

/** comparison form of a heading: case and runs of white space do not matter */
export function headingKey(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** GitHub-style anchor (`## Two Words!` → `two-words`), letters of any script kept */
export function headingSlug(text: string): string {
  return headingKey(text)
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
    .replace(/ /g, '-')
}

/**
 * Index of the heading a link fragment names, or -1. The heading text itself
 * matches first (Obsidian writes `#Heading Text`), then its anchor slug
 * (`#heading-text`). A nested Obsidian path (`#Part#Sub`) names its last part.
 */
export function findHeadingIndex(headings: readonly string[], fragment: string): number {
  const last = fragment.split('#').filter(Boolean).pop() ?? ''
  if (!last || last.startsWith('^')) return -1
  const key = headingKey(last)
  const exact = headings.findIndex((h) => headingKey(h) === key)
  if (exact >= 0) return exact
  const slug = headingSlug(last)
  return slug ? headings.findIndex((h) => headingSlug(h) === slug) : -1
}

/** `|300` or `|300x200` after an embedded picture: its display size in pixels */
export function embedImageSize(alias: string | undefined): { width?: number; height?: number } {
  const m = alias ? /^(\d{1,5})(?:x(\d{1,5}))?$/.exec(alias.trim()) : null
  if (!m) return {}
  return { width: Number(m[1]), ...(m[2] ? { height: Number(m[2]) } : {}) }
}
