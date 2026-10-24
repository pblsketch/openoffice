/**
 * The table of contents (spec §4 "Contents"): the EPUB 3 navigation
 * document's `toc` nav, else the EPUB 2 NCX, else one entry per spine item
 * titled by the chapter's first heading or, failing that, its file name.
 */
import type { DecodedText } from './encoding'
import { fileNameOf, resolveHref } from './paths'
import type { EpubManifestItem, EpubSpine, EpubToc, EpubTocEntry } from './types'
import {
  attr,
  attrByName,
  childElements,
  collapseWhitespace,
  parseHtml,
  parseXml,
  textContent,
  tokens,
  walk,
  type XmlElement,
} from './xml'

const OPS_NS = 'http://www.idpf.org/2007/ops'
const NCX_MEDIA_TYPE = 'application/x-dtbncx+xml'
/** Ruby annotations are left out of titles: the base text reads as the title. */
const SKIP_IN_TITLES = new Set(['rt', 'rp'])
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

export interface TocSources {
  manifest: readonly EpubManifestItem[]
  spine: EpubSpine
  /** the archive's own name for a resolved path (exact, else case-insensitive), or null */
  findEntry(path: string): string | null
  readText(path: string): Promise<DecodedText | null>
}

/** Parses as XML; markup only an HTML parser accepts is read the way a browser would. */
function parseLenient(text: string): XmlElement {
  try {
    return parseXml(text)
  } catch {
    return parseHtml(text)
  }
}

const titleOf = (el: XmlElement): string => collapseWhitespace(textContent(el, SKIP_IN_TITLES))

const localIs = (el: XmlElement, local: string): boolean => el.local.toLowerCase() === local

type RawEntry = Omit<EpubTocEntry, 'spineIndex'>

function entry(title: string, basePath: string, href: string | undefined, depth: number): RawEntry {
  const target = href === undefined ? null : resolveHref(basePath, href)
  return { title, path: target?.path ?? null, fragment: target?.fragment ?? null, depth }
}

function navLabel(li: XmlElement): XmlElement | undefined {
  return childElements(li).find((el) => localIs(el, 'a') || localIs(el, 'span'))
}

function labelTitle(label: XmlElement): string {
  const text = titleOf(label)
  if (text !== '') return text
  const titled = attr(label, 'title')?.trim()
  if (titled) return titled
  for (const el of walk(label)) {
    const alt = localIs(el, 'img') ? attr(el, 'alt')?.trim() : undefined
    if (alt) return alt
  }
  return ''
}

function navList(ol: XmlElement, navPath: string, depth: number, out: RawEntry[]): void {
  for (const li of childElements(ol)) {
    if (!localIs(li, 'li')) continue
    const label = navLabel(li)
    if (label) {
      const href = localIs(label, 'a') ? attr(label, 'href') : undefined
      const item = entry(labelTitle(label), navPath, href, depth)
      if (item.title !== '' || item.path !== null) out.push(item)
    }
    const nested = childElements(li).find((el) => localIs(el, 'ol'))
    if (nested) navList(nested, navPath, depth + 1, out)
  }
}

/** Entries of the `toc` nav in a navigation document. */
export function navTocEntries(root: XmlElement, navPath: string): RawEntry[] {
  for (const el of walk(root)) {
    if (!localIs(el, 'nav')) continue
    const type = attr(el, 'type', OPS_NS) ?? attrByName(el, 'epub:type')
    if (!tokens(type).includes('toc')) continue
    const ol = [...walk(el)].find((child) => localIs(child, 'ol'))
    const out: RawEntry[] = []
    if (ol) navList(ol, navPath, 1, out)
    return out
  }
  return []
}

function ncxPoints(parent: XmlElement, ncxPath: string, depth: number, out: RawEntry[]): void {
  for (const point of childElements(parent)) {
    if (!localIs(point, 'navpoint')) continue
    const label = childElements(point).find((el) => localIs(el, 'navlabel'))
    const textEl = label ? childElements(label).find((el) => localIs(el, 'text')) : undefined
    const content = childElements(point).find((el) => localIs(el, 'content'))
    const item = entry(
      textEl ? titleOf(textEl) : '',
      ncxPath,
      content && attr(content, 'src'),
      depth,
    )
    if (item.title !== '' || item.path !== null) out.push(item)
    ncxPoints(point, ncxPath, depth + 1, out)
  }
}

/** Entries of an NCX `navMap`. */
export function ncxEntries(root: XmlElement, ncxPath: string): RawEntry[] {
  const navMap = [...walk(root)].find((el) => localIs(el, 'navmap'))
  const out: RawEntry[] = []
  if (navMap) ncxPoints(navMap, ncxPath, 1, out)
  return out
}

async function readTree(sources: TocSources, path: string | null): Promise<XmlElement | null> {
  const name = path === null ? null : sources.findEntry(path)
  if (name === null) return null
  const decoded = await sources.readText(name)
  if (!decoded) return null
  try {
    return parseLenient(decoded.text)
  } catch {
    return null
  }
}

/** The first heading's text in a chapter, or '' when it has none. */
function firstHeading(root: XmlElement): string {
  for (const el of walk(root)) {
    if (!HEADINGS.has(el.local.toLowerCase())) continue
    const title = titleOf(el)
    if (title !== '') return title
  }
  return ''
}

export async function buildToc(sources: TocSources): Promise<EpubToc> {
  const spineIndex = new Map<string, number>()
  for (const item of sources.spine.items) {
    if (!spineIndex.has(item.path)) spineIndex.set(item.path, item.index)
  }
  const finish = (source: EpubToc['source'], raw: RawEntry[]): EpubToc => ({
    source,
    entries: raw.map((e) => {
      const path = e.path === null ? null : (sources.findEntry(e.path) ?? e.path)
      return { ...e, path, spineIndex: path === null ? null : (spineIndex.get(path) ?? null) }
    }),
  })

  const nav = sources.manifest.find((m) => m.properties.includes('nav') && m.path !== null)
  if (nav) {
    const root = await readTree(sources, nav.path)
    const entries = root ? navTocEntries(root, nav.path!) : []
    if (entries.length > 0) return finish('nav', entries)
  }

  const ncx =
    (sources.spine.tocId !== null
      ? sources.manifest.find((m) => m.id === sources.spine.tocId && m.path !== null)
      : undefined) ??
    sources.manifest.find((m) => m.mediaType === NCX_MEDIA_TYPE && m.path !== null)
  if (ncx) {
    const root = await readTree(sources, ncx.path)
    const entries = root ? ncxEntries(root, ncx.path!) : []
    if (entries.length > 0) return finish('ncx', entries)
  }

  const fromSpine: RawEntry[] = []
  for (const item of sources.spine.items) {
    const root = await readTree(sources, item.path)
    const heading = root ? firstHeading(root) : ''
    fromSpine.push({
      title: heading || fileNameOf(item.path),
      path: item.path,
      fragment: null,
      depth: 1,
    })
  }
  return finish('spine', fromSpine)
}
