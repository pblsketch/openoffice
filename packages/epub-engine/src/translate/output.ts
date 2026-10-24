/**
 * The translated and the bilingual book (spec §8 "Result files"), built from
 * the stored book's bytes and the stored translation results. It runs where
 * the original bytes are (the editor's back end, the terminal command); the
 * original is never changed.
 *
 * The result is written the way a save is: every entry in the original
 * order, `mimetype` first and stored, untouched entries with their original
 * compressed bytes, and the changed text entries edited by range
 * replacements only (nothing is serialised from a tree):
 *
 * - a translated block: its content replaced by the translation (translated
 *   book; ruby readings are not in the translation), or a copy of the block
 *   inserted right after it with no `id` anywhere in it, marked with the
 *   target language and `EPUB_TRANSLATION_CLASS` (bilingual book). A
 *   structural text block (td, th, figcaption, dt, dd) and a list item keep
 *   their place in the table, figure or list instead (a copied li would
 *   renumber an ordered list): the bilingual book appends a line break
 *   and a marked span with the translation inside it;
 * - a translated chapter of the translated book: `lang` and `xml:lang` of its
 *   `html` set to the target, `dir="rtl"` for Arabic and Hebrew;
 * - the package document: titles, `dc:language`, a new `urn:uuid` unique
 *   identifier with the old one kept as `dc:source`, `dcterms:modified`
 *   (EPUB 3) and, for a vertical book going into a language that is not
 *   written vertically, `page-progression-direction="ltr"` on the spine (the
 *   translated chapters then get a style forcing horizontal writing);
 * - the contents labels of the nav and the NCX: the translation only;
 * - obfuscated fonts: revealed with the old key, hidden with the new one.
 *
 * Chapters not chosen, broken or fixed-layout ones, and chapters where no
 * block was translated are copied unchanged. Results may be partial (a
 * stopped job): a block without a result stays as it was and is reported.
 */
import JSZip from 'jszip'
import { openChapter, type ChapterBlock, type OpenChapter } from '../blocks'
import { encodeEntryText, type EpubTextEncoding } from '../encoding'
import { ADOBE_FONT_OBFUSCATION, fontObfuscationKey, obfuscateFont } from '../fonts'
import {
  notationPlainText,
  notationTreeToXhtml,
  parseBlockNotation,
  type NotationContext,
  type NotationNode,
} from '../notation'
import { openEpub, type EpubOpenOptions } from '../open'
import { resolveHref } from '../paths'
import { applyReplacements, validateReplacements, type RangeReplacement } from '../ranges'
import {
  formatModifiedTimestamp,
  maskUndefinedEntities,
  metadataLineInsertion,
  modifiedReplacements,
  writeEpubArchive,
} from '../save'
import type { EpubBook } from '../types'
import { checkWellFormed, parseXml, type XmlElement } from '../xml-positions'
import { epubBlockKeyString } from './keys'
import {
  ID_ATTRIBUTES,
  attributeOf,
  childElements,
  elementText,
  elementTextReplacement,
  escapeAttribute,
  insertionAfter,
  localIs,
  namespaceOf,
  prefixOf,
  readStartTag,
  removeIds,
  removeTagAttributes,
  setTagAttribute,
  startTagReplacement,
  tagAttribute,
  walkElements,
  whitespaceStart,
  writeStartTag,
  type StartTag,
} from './output-markup'
import {
  chapterTranslationUnits,
  epubTocLabels,
  metadataTranslationUnits,
  type EpubTranslationUnit,
} from './units'

/** the class token that marks a translation copy in a bilingual book */
export const EPUB_TRANSLATION_CLASS = 'ieum-translation'

export type EpubTranslationOutputKind = 'translated' | 'bilingual'

/**
 * A stored result of one unit, keyed by `epubBlockKeyString(unit.key)`. The
 * store's `StoredTranslation.blocks` entries have this shape.
 */
export interface EpubTranslationOutcome {
  status: 'translated' | 'failed'
  /** the translation in the block notation; required when translated */
  text?: string
  /** why the unit stayed in the source language */
  reason?: string
}

export interface BuildTranslatedEpubOptions extends EpubOpenOptions {
  kind: EpubTranslationOutputKind
  /** target language code (a BCP 47 tag such as `en`, `zh-TW`) */
  lang: string
  /** spine indices that were chosen for translation; default every chapter */
  chapters?: Iterable<number>
  results: ReadonlyMap<string, EpubTranslationOutcome>
  /** the build time for `dcterms:modified`; the current time when left out */
  now?: () => Date
  /** the new identifier's UUID (`xxxxxxxx-xxxx-…`); a random v4 UUID when left out */
  uuid?: () => string
}

/**
 * Why a block stayed in the source language: the stored reason of a failed
 * result, `not-translated` when there is no result (a stopped job),
 * `placeholder-mismatch` when the stored translation does not fit the block
 * as it is now, `empty-translation` when it has no text.
 */
export type EpubUntranslatedReason =
  'not-translated' | 'placeholder-mismatch' | 'empty-translation' | (string & {})

export interface EpubUntranslatedBlock {
  /** spine index */
  chapter: number
  path: string
  /** the block id of `openChapter` */
  blockId: string
  reason: EpubUntranslatedReason
}

export interface EpubOriginalChapter {
  /** spine index */
  chapter: number
  path: string
  reason: 'not-chosen' | 'broken' | 'fixed-layout'
}

export interface EpubTranslationReport {
  /** chapter blocks that carry their translation */
  translatedBlocks: number
  /** blocks of the chosen chapters left in the source language, in book order */
  untranslatedBlocks: EpubUntranslatedBlock[]
  /** spine items copied as they were, in spine order */
  originalChapters: EpubOriginalChapter[]
}

/**
 * - `not-opened`: the bytes do not open as a book
 * - `fixed-layout`: the whole book is fixed-layout (it is not translated)
 * - `invalid-language`: `lang` is not a language tag
 * - `unknown-chapter`: a chosen index is not a spine index
 * - `broken-package`: the package document cannot be edited (not valid in
 *   its encoding, not readable for positions, no metadata)
 * - `not-well-formed`: an edited entry came out not well-formed (a bug)
 */
export type BuildTranslatedEpubRefusal =
  | 'not-opened'
  | 'fixed-layout'
  | 'invalid-language'
  | 'unknown-chapter'
  | 'broken-package'
  | 'not-well-formed'

export type BuildTranslatedEpubResult =
  | {
      ok: true
      bytes: Uint8Array
      report: EpubTranslationReport
      /** the result book's unique identifier (`urn:uuid:…`) */
      identifier: string
    }
  | {
      ok: false
      reason: BuildTranslatedEpubRefusal
      /** English, for the log; not for the screen */
      detail: string
    }

const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RTL_LANGUAGES = new Set(['ar', 'he'])
/** targets a vertical book stays vertical in */
const VERTICAL_LANGUAGES = new Set(['ja', 'zh', 'ko'])
const DC_NS = 'http://purl.org/dc/elements/1.1/'
const OPS_NS = 'http://www.idpf.org/2007/ops'
const NCX_MEDIA_TYPE = 'application/x-dtbncx+xml'
const SKIP_IN_TITLES: ReadonlySet<string> = new Set(['rt', 'rp'])
const EMPTY_CONTEXT: NotationContext = { placeholders: [], bold: [], italic: [], breaks: [] }

const HORIZONTAL_STYLE =
  ':root, :root * { -epub-writing-mode: horizontal-tb !important; ' +
  '-webkit-writing-mode: horizontal-tb !important; writing-mode: horizontal-tb !important; }'

class Refusal extends Error {
  constructor(
    readonly reason: BuildTranslatedEpubRefusal,
    detail: string,
  ) {
    super(detail)
  }
}

const primarySubtag = (tag: string): string => tag.toLowerCase().split('-')[0]!

/** Text escaped for XML content (characters XML does not allow are left out). */
const escapeText = (text: string): string =>
  notationTreeToXhtml([{ t: 'text', v: text }], EMPTY_CONTEXT)

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim()

function randomUuid(): string {
  const crypto = globalThis.crypto
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Plain text of a title or contents translation: marks dropped, line breaks as spaces. */
function plainLabel(text: string): string | null {
  const parsed = parseBlockNotation(text.trim(), EMPTY_CONTEXT)
  if (!parsed.ok) return null
  const flatten = (nodes: readonly NotationNode[]): string =>
    nodes
      .map((n) => (n.t === 'text' ? n.v : n.t === 'br' ? ' ' : n.t === 'x' ? '' : flatten(n.c)))
      .join('')
  const plain = collapse(flatten(parsed.tree))
  return plain === '' ? null : plain
}

type BlockOutcome = { ok: true; xhtml: string } | { ok: false; reason: EpubUntranslatedReason }

/** The stored result of a block unit, checked again against the block as it is now. */
function blockOutcome(
  unit: EpubTranslationUnit,
  results: ReadonlyMap<string, EpubTranslationOutcome>,
): BlockOutcome {
  const result = results.get(epubBlockKeyString(unit.key))
  if (!result) return { ok: false, reason: 'not-translated' }
  if (result.status !== 'translated') return { ok: false, reason: result.reason ?? 'failed' }
  if (typeof result.text !== 'string') return { ok: false, reason: 'empty-translation' }
  const parsed = parseBlockNotation(result.text.trim(), unit.context)
  if (!parsed.ok) return { ok: false, reason: 'placeholder-mismatch' }
  if (notationPlainText(parsed.tree).trim() === '') {
    return { ok: false, reason: 'empty-translation' }
  }
  return { ok: true, xhtml: notationTreeToXhtml(parsed.tree, unit.context) }
}

// ---------------------------------------------------------------------------
// Text entries being edited

interface TextEntry {
  text: string
  encoding: EpubTextEncoding
  replacements: RangeReplacement[]
  /** checked as a chapter (HTML entities need the doctype) or masked (package files) */
  chapter: boolean
}

class TextEdits {
  readonly entries = new Map<string, TextEntry>()

  constructor(private readonly book: EpubBook) {}

  /** the entry's decoded text, or null when it is missing or not valid in its encoding */
  async open(path: string, chapter = false): Promise<TextEntry | null> {
    const known = this.entries.get(path)
    if (known) {
      known.chapter ||= chapter
      return known
    }
    const decoded = await this.book.readText(path)
    if (!decoded?.valid) return null
    const entry = { text: decoded.text, encoding: decoded.encoding, replacements: [], chapter }
    this.entries.set(path, entry)
    return entry
  }

  /** the changed entries' bytes; refuses an entry that would not be well-formed */
  encoded(): Map<string, Uint8Array> {
    const out = new Map<string, Uint8Array>()
    for (const [path, entry] of this.entries) {
      if (entry.replacements.length === 0) continue
      const problem = validateReplacements(entry.replacements, entry.text.length)
      if (problem) throw new Refusal('not-well-formed', `${path}: ${problem}`)
      const text = applyReplacements(entry.text, entry.replacements)
      if (text === entry.text) continue
      const check = checkWellFormed(entry.chapter ? text : maskUndefinedEntities(text))
      if (!check.ok) throw new Refusal('not-well-formed', `${path}: ${check.error}`)
      out.set(path, encodeEntryText(text, entry.encoding))
    }
    return out
  }
}

/** Reads a package-like file for positions, with undefined named references masked. */
function parsePositions(text: string): XmlElement | null {
  const parsed = parseXml(maskUndefinedEntities(text))
  return parsed.ok ? parsed.doc.root : null
}

// ---------------------------------------------------------------------------
// Contents labels

interface Labels {
  titles: Map<number, string>
  nav: Map<number, string>
  ncx: Map<number, string>
}

/** The translated title and contents labels by their place, as plain text. */
function translatedLabels(
  units: readonly EpubTranslationUnit[],
  results: ReadonlyMap<string, EpubTranslationOutcome>,
): Labels {
  const labels: Labels = { titles: new Map(), nav: new Map(), ncx: new Map() }
  for (const unit of units) {
    const result = results.get(epubBlockKeyString(unit.key))
    if (result?.status !== 'translated' || typeof result.text !== 'string') continue
    const plain = plainLabel(result.text)
    if (plain === null) continue
    for (const source of unit.sources) {
      if (source.kind === 'title') labels.titles.set(source.index, plain)
      else if (source.kind === 'nav') labels.nav.set(source.index, plain)
      else if (source.kind === 'ncx') labels.ncx.set(source.index, plain)
    }
  }
  return labels
}

/**
 * The label element of each nav `toc` entry, in the order and with the
 * filter of `navTocEntries`; null for an entry whose title is not its text
 * (a `title` attribute or an image's `alt`), which is left as it is.
 */
function navLabelElements(root: XmlElement, navPath: string): (XmlElement | null)[] {
  const isToc = (el: XmlElement): boolean => {
    const namespaced = el.attributes.find(
      (a) => a.name.endsWith(':type') && namespaceOf(el, a.name.slice(0, -5)) === OPS_NS,
    )
    const type = namespaced?.value ?? attributeOf(el, 'epub:type')
    return (type ?? '').split(/[ \t\r\n]+/).includes('toc')
  }
  const out: (XmlElement | null)[] = []
  const list = (ol: XmlElement): void => {
    for (const li of childElements(ol)) {
      if (!localIs(li, 'li')) continue
      const label = childElements(li).find((el) => localIs(el, 'a') || localIs(el, 'span'))
      if (label) {
        const text = collapse(elementText(label, SKIP_IN_TITLES))
        let title = text
        if (title === '') title = attributeOf(label, 'title')?.trim() ?? ''
        if (title === '') {
          for (const el of walkElements(label)) {
            const alt = localIs(el, 'img') ? attributeOf(el, 'alt')?.trim() : undefined
            if (alt) {
              title = alt
              break
            }
          }
        }
        const href = localIs(label, 'a') ? attributeOf(label, 'href') : undefined
        const path = href === undefined ? null : resolveHref(navPath, href)
        if (title !== '' || path !== null) out.push(text !== '' ? label : null)
      }
      const nested = childElements(li).find((el) => localIs(el, 'ol'))
      if (nested) list(nested)
    }
  }
  for (const el of walkElements(root)) {
    if (!localIs(el, 'nav') || !isToc(el)) continue
    const ol = [...walkElements(el)].find((child) => localIs(child, 'ol'))
    if (ol) list(ol)
    return out
  }
  return out
}

/** The `text` element of each NCX navPoint, in the order and with the filter of `ncxEntries`. */
function ncxLabelElements(root: XmlElement, ncxPath: string): (XmlElement | null)[] {
  const out: (XmlElement | null)[] = []
  const points = (parent: XmlElement): void => {
    for (const point of childElements(parent)) {
      if (!localIs(point, 'navpoint')) continue
      const label = childElements(point).find((el) => localIs(el, 'navlabel'))
      const text = label ? childElements(label).find((el) => localIs(el, 'text')) : undefined
      const content = childElements(point).find((el) => localIs(el, 'content'))
      const title = text ? collapse(elementText(text, SKIP_IN_TITLES)) : ''
      const src = content ? attributeOf(content, 'src') : undefined
      const path = src === undefined ? null : resolveHref(ncxPath, src)
      if (title !== '' || path !== null) out.push(title !== '' && text ? text : null)
      points(point)
    }
  }
  const navMap = [...walkElements(root)].find((el) => localIs(el, 'navmap'))
  if (navMap) points(navMap)
  return out
}

/**
 * Replaces the labels of one table of contents. Skipped as a whole when the
 * file cannot be read for positions or its entries do not line up with the
 * ones the units were made from. Returns the replaced ranges.
 */
async function labelEdits(
  edits: TextEdits,
  path: string | null,
  expected: number,
  translations: ReadonlyMap<number, string>,
  find: (root: XmlElement, path: string) => (XmlElement | null)[],
  chapter: boolean,
): Promise<RangeReplacement[]> {
  if (path === null || translations.size === 0) return []
  const entry = await edits.open(path, chapter)
  const root = entry ? parsePositions(entry.text) : null
  if (!entry || !root) return []
  const labels = find(root, path)
  if (labels.length !== expected) return []
  const done: RangeReplacement[] = []
  for (const [index, text] of translations) {
    const label = labels[index]
    if (!label || label.selfClosing) continue
    const replacement = elementTextReplacement(entry.text, label, escapeText(text))
    entry.replacements.push(replacement)
    done.push(replacement)
  }
  return done
}

// ---------------------------------------------------------------------------
// The package document

interface PackageEditInput {
  book: EpubBook
  kind: EpubTranslationOutputKind
  lang: string
  identifier: string
  titles: ReadonlyMap<number, string>
  horizontal: boolean
  now: Date
}

function isDc(el: XmlElement, local: string): boolean {
  if (el.local.toLowerCase() !== local) return false
  if (el.name.toLowerCase().startsWith('dc:')) return true
  return namespaceOf(el, prefixOf(el.name).slice(0, -1)) === DC_NS
}

function freshId(root: XmlElement, base: string): string {
  const used = new Set<string>()
  for (const el of walkElements(root)) {
    const id = attributeOf(el, 'id')
    if (id !== undefined) used.add(id)
  }
  let id = base
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`
  return id
}

function packageEdits(entry: TextEntry, o: PackageEditInput): void {
  const { book } = o
  const source = entry.text
  const root = parsePositions(source)
  const metadata = root && childElements(root).find((el) => el.local === 'metadata')
  if (!root || !metadata) {
    throw new Refusal('broken-package', `${book.opfPath} cannot be read for editing`)
  }
  const out = entry.replacements
  const push = (r: RangeReplacement | null): void => {
    if (r) out.push(r)
  }
  const dc = (local: string): XmlElement[] =>
    [...walkElements(metadata)].filter((el) => isDc(el, local))
  const anyDc = [...walkElements(metadata)].find(
    (el) => isDc(el, 'identifier') || isDc(el, 'title') || isDc(el, 'language'),
  )
  const dcPrefix = anyDc ? prefixOf(anyDc.name) : 'dc:'
  const dcLine = (local: string, escaped: string): string =>
    `<${dcPrefix}${local}>${escaped}</${dcPrefix}${local}>`

  // Titles
  const titles = dc('title')
  if (titles.length === book.metadata.titles.length) {
    for (const [index, translation] of o.titles) {
      const el = titles[index]
      if (!el) continue
      const text =
        o.kind === 'translated' ? translation : `${book.metadata.titles[index]!} (${translation})`
      out.push(elementTextReplacement(source, el, escapeText(text)))
    }
  }

  // Languages
  const languages = dc('language')
  const lang = escapeText(o.lang)
  if (o.kind === 'translated') {
    if (languages.length === 0)
      out.push(metadataLineInsertion(source, metadata, dcLine('language', lang)))
    languages.forEach((el, i) => {
      if (i === 0) out.push(elementTextReplacement(source, el, lang))
      else out.push({ start: whitespaceStart(source, el.start), end: el.end, text: '' })
    })
  } else {
    const has = book.metadata.languages.some((l) => l.toLowerCase() === o.lang.toLowerCase())
    if (!has) {
      const last = languages.at(-1)
      out.push(
        last
          ? insertionAfter(source, last, dcLine('language', lang))
          : metadataLineInsertion(source, metadata, dcLine('language', lang)),
      )
    }
  }

  // Identifier
  const uidRef = attributeOf(root, 'unique-identifier')?.trim()
  const unique = uidRef
    ? dc('identifier').find((el) => attributeOf(el, 'id') === uidRef)
    : undefined
  const identifier = escapeText(o.identifier)
  if (unique) {
    // an `opf:scheme` other than UUID would misname the new value
    const read = readStartTag(
      source.slice(unique.start, unique.selfClosing ? unique.end : unique.startTagEnd),
    )
    const scheme = read?.tag.attributes.find(
      (a) => a.name === 'scheme' || a.name.endsWith(':scheme'),
    )
    if (read && scheme && scheme.value !== 'UUID') {
      setTagAttribute(read.tag, scheme.name, 'UUID')
      read.tag.tail = read.tag.tail.replace(/\s*\/>$/, '>')
      out.push({
        start: unique.start,
        end: unique.selfClosing ? unique.end : unique.startTagEnd,
        text:
          writeStartTag(read.tag) + (unique.selfClosing ? `${identifier}</${unique.name}>` : ''),
      })
      if (!unique.selfClosing) out.push(elementTextReplacement(source, unique, identifier))
    } else {
      out.push(elementTextReplacement(source, unique, identifier))
    }
    const old = book.metadata.uniqueIdentifier
    if (old) out.push(insertionAfter(source, unique, dcLine('source', escapeText(old))))
  } else {
    const id = freshId(root, 'uid')
    out.push(
      metadataLineInsertion(
        source,
        metadata,
        `<${dcPrefix}identifier id="${id}">${identifier}</${dcPrefix}identifier>`,
      ),
    )
    const old = book.metadata.identifiers[0]?.value
    if (old) out.push(metadataLineInsertion(source, metadata, dcLine('source', escapeText(old))))
    push(startTagReplacement(source, root, (tag) => setTagAttribute(tag, 'unique-identifier', id)))
  }

  // Spine direction
  if (o.horizontal) {
    const spine = childElements(root).find((el) => el.local === 'spine')
    if (spine && attributeOf(spine, 'page-progression-direction')?.trim() !== 'ltr') {
      push(
        startTagReplacement(source, spine, (tag) =>
          setTagAttribute(tag, 'page-progression-direction', 'ltr'),
        ),
      )
    }
  }

  // dcterms:modified (EPUB 3)
  if (book.version === '3') {
    const modified = modifiedReplacements(source, formatModifiedTimestamp(o.now))
    if (modified === null) throw new Refusal('broken-package', `${book.opfPath} has no metadata`)
    out.push(...modified)
  }
}

// ---------------------------------------------------------------------------
// Chapters

interface ChapterInput {
  kind: EpubTranslationOutputKind
  lang: string
  rtl: boolean
  horizontal: boolean
  results: ReadonlyMap<string, EpubTranslationOutcome>
}

function overlaps(block: ChapterBlock, ranges: readonly RangeReplacement[]): boolean {
  return ranges.some((r) => r.start < block.outer.end && block.outer.start < r.end)
}

/** The start tag of a bilingual copy: no id, the target language and the translation class. */
function copyStartTag(source: string, block: ChapterBlock, o: ChapterInput, rtlChapter: boolean) {
  const el = block.element
  const end = el.selfClosing ? el.end : el.startTagEnd
  const read = readStartTag(source.slice(el.start, end))!
  const tag: StartTag = read.tag
  tag.tail = tag.tail.replace(/\s*\/>$/, '>')
  removeTagAttributes(tag, ID_ATTRIBUTES)
  setTagAttribute(tag, 'lang', escapeAttribute(o.lang))
  setTagAttribute(tag, 'xml:lang', escapeAttribute(o.lang))
  const cls = tagAttribute(tag, 'class')
  setTagAttribute(
    tag,
    'class',
    cls === undefined || cls.trim() === ''
      ? EPUB_TRANSLATION_CLASS
      : `${cls.replace(/\s+$/, '')} ${EPUB_TRANSLATION_CLASS}`,
  )
  if (o.rtl) setTagAttribute(tag, 'dir', 'rtl')
  else if (tagAttribute(tag, 'dir') !== undefined || rtlChapter) setTagAttribute(tag, 'dir', 'ltr')
  return writeStartTag(tag)
}

/**
 * The translation of a structural text block (td, th, figcaption, dt, dd) or a
 * list item in a bilingual book: a line break and a marked span appended inside the block,
 * so the table, figure or list keeps its structure.
 */
function inlineTranslation(
  block: ChapterBlock,
  o: ChapterInput,
  rtlChapter: boolean,
  xhtml: string,
): string {
  const prefix = prefixOf(block.element.name)
  const lang = escapeAttribute(o.lang)
  const dir = o.rtl
    ? ' dir="rtl"'
    : attributeOf(block.element, 'dir') !== undefined || rtlChapter
      ? ' dir="ltr"'
      : ''
  return (
    `<${prefix}br/><${prefix}span class="${EPUB_TRANSLATION_CLASS}" lang="${lang}" ` +
    `xml:lang="${lang}"${dir}>${removeIds(xhtml)}</${prefix}span>`
  )
}

/** The style element that forces horizontal writing, at the end of the chapter's head. */
function horizontalStyle(source: string, root: XmlElement): RangeReplacement | null {
  const head = childElements(root).find((el) => el.local === 'head')
  const style = (prefix: string): string => `<${prefix}style>${HORIZONTAL_STYLE}</${prefix}style>`
  if (head) {
    const markup = style(prefixOf(head.name))
    return head.selfClosing
      ? { start: head.end - 2, end: head.end, text: `>${markup}</${head.name}>` }
      : { start: head.endTagStart, end: head.endTagStart, text: markup }
  }
  if (root.selfClosing) return null
  const prefix = prefixOf(root.name)
  return {
    start: root.startTagEnd,
    end: root.startTagEnd,
    text: `<${prefix}head>${style(prefix)}</${prefix}head>`,
  }
}

/** Edits one open chapter; returns how many blocks carry their translation. */
function chapterEdits(
  entry: TextEntry,
  map: OpenChapter,
  chapter: { index: number; path: string },
  reserved: readonly RangeReplacement[],
  o: ChapterInput,
  untranslated: EpubUntranslatedBlock[],
): number {
  const source = map.source
  const root = map.doc.root
  const isHtml = root.local === 'html'
  const rtlChapter = isHtml && attributeOf(root, 'dir')?.trim().toLowerCase() === 'rtl'
  let translated = 0
  let touched = false
  for (const unit of chapterTranslationUnits(map, chapter)) {
    const source0 = unit.sources[0]
    if (source0?.kind !== 'block') continue
    const block = map.blocks.find((b) => b.id === source0.blockId)!
    // a contents entry of a nav document that is also a chapter: the label edit wins
    if (overlaps(block, reserved)) {
      touched = true
      continue
    }
    const outcome = blockOutcome(unit, o.results)
    if (!outcome.ok) {
      untranslated.push({
        chapter: chapter.index,
        path: chapter.path,
        blockId: block.id,
        reason: outcome.reason,
      })
      continue
    }
    translated++
    touched = true
    if (o.kind === 'translated') {
      entry.replacements.push({
        start: block.inner.start,
        end: block.inner.end,
        text: outcome.xhtml,
      })
    } else if (!block.flowing || block.kind === 'li') {
      // td, th, figcaption, dt, dd: a sibling copy would change the table, figure or
      // list structure, so the translation goes inside, after the original content.
      // A list item likewise: a copied li would renumber an ordered list
      const el = block.element
      const inline = inlineTranslation(block, o, rtlChapter, outcome.xhtml)
      entry.replacements.push(
        el.selfClosing
          ? { start: el.end - 2, end: el.end, text: `>${inline}</${el.name}>` }
          : { start: block.inner.end, end: block.inner.end, text: inline },
      )
    } else {
      const el = block.element
      const indent = source.slice(whitespaceStart(source, el.start), el.start)
      const close = el.selfClosing ? `</${el.name}>` : source.slice(el.endTagStart, el.end)
      const copy = copyStartTag(source, block, o, rtlChapter) + removeIds(outcome.xhtml) + close
      entry.replacements.push({ start: el.end, end: el.end, text: indent + copy })
    }
  }
  if (!touched) return translated
  if (o.kind === 'translated' && isHtml) {
    const lang = escapeAttribute(o.lang)
    const replacement = startTagReplacement(source, root, (tag) => {
      setTagAttribute(tag, 'lang', lang)
      setTagAttribute(tag, 'xml:lang', lang)
      if (o.rtl) setTagAttribute(tag, 'dir', 'rtl')
      else if (rtlChapter) setTagAttribute(tag, 'dir', 'ltr')
    })
    if (replacement) entry.replacements.push(replacement)
  }
  if (o.horizontal) {
    const style = horizontalStyle(source, root)
    if (style) entry.replacements.push(style)
  }
  return translated
}

// ---------------------------------------------------------------------------
// Fonts

/** Whether opening could reveal the font: the key its algorithm needs exists. */
function hasOriginalFontKey(book: EpubBook, algorithm: string): boolean {
  const candidates = [
    ...(book.metadata.uniqueIdentifier !== null ? [book.metadata.uniqueIdentifier] : []),
    ...book.metadata.identifiers.map((i) => i.value),
  ]
  if (algorithm !== ADOBE_FONT_OBFUSCATION) return candidates.length > 0
  return candidates.some((c) => fontObfuscationKey(ADOBE_FONT_OBFUSCATION, c) !== null)
}

// ---------------------------------------------------------------------------

/**
 * Builds the translated or bilingual book from the stored book's bytes and
 * the stored results (see the module comment). `results` holds the results
 * of `epubTranslationUnits(book, { chapters })` keyed by
 * `epubBlockKeyString(unit.key)`; any subset of them works.
 */
export async function buildTranslatedEpub(
  original: Uint8Array,
  options: BuildTranslatedEpubOptions,
): Promise<BuildTranslatedEpubResult> {
  try {
    return await build(original, options)
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, reason: error.reason, detail: error.message }
    throw error
  }
}

async function build(
  original: Uint8Array,
  options: BuildTranslatedEpubOptions,
): Promise<BuildTranslatedEpubResult> {
  const { kind, lang, results } = options
  if (!LANGUAGE_TAG.test(lang)) throw new Refusal('invalid-language', `not a language tag: ${lang}`)
  const opened = await openEpub(original, options)
  if (!opened.ok) throw new Refusal('not-opened', `${opened.reason}: ${opened.detail}`)
  const book = opened.book
  if (book.fixedLayout) throw new Refusal('fixed-layout', 'the book is fixed-layout')

  const count = book.spine.items.length
  const chosen = new Set<number>()
  for (const index of options.chapters ?? book.spine.items.map((i) => i.index)) {
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new Refusal('unknown-chapter', `no chapter ${index} (the book has ${count})`)
    }
    chosen.add(index)
  }
  const uuid = (options.uuid ?? randomUuid)()
  if (!UUID.test(uuid)) throw new RangeError(`epub translation: not a UUID: ${uuid}`)
  const identifier = `urn:uuid:${uuid.toLowerCase()}`
  const now = (options.now ?? (() => new Date()))()
  const target = primarySubtag(lang)
  const rtl = RTL_LANGUAGES.has(target)
  const horizontal = book.verticalWriting && !VERTICAL_LANGUAGES.has(target)
  const edits = new TextEdits(book)

  // Which chapters are translated, and why the others are not (as epubTranslationUnits decides).
  const states = new Map<
    string,
    { index: number; map: OpenChapter } | { reason: 'broken' | 'fixed-layout' }
  >()
  for (const item of book.spine.items) {
    if (!chosen.has(item.index) || states.has(item.path)) continue
    if (item.fixedLayout) {
      states.set(item.path, { reason: 'fixed-layout' })
      continue
    }
    const entry = await edits.open(item.path, true)
    const map = entry ? openChapter(entry.text) : null
    states.set(item.path, map && !map.broken ? { index: item.index, map } : { reason: 'broken' })
  }
  const originalChapters: EpubOriginalChapter[] = []
  for (const item of book.spine.items) {
    const state = states.get(item.path)
    if (state && 'map' in state) continue
    const reason =
      chosen.has(item.index) && state && 'reason' in state ? state.reason : 'not-chosen'
    originalChapters.push({ chapter: item.index, path: item.path, reason })
  }

  // Title and contents labels.
  const tocLabels = await epubTocLabels(book)
  const labels = translatedLabels(
    metadataTranslationUnits({ titles: book.metadata.titles, ...tocLabels }),
    results,
  )
  const navItem = book.manifest.find((m) => m.properties.includes('nav') && m.path !== null)
  const ncxItem =
    (book.spine.tocId !== null
      ? book.manifest.find((m) => m.id === book.spine.tocId && m.path !== null)
      : undefined) ?? book.manifest.find((m) => m.mediaType === NCX_MEDIA_TYPE && m.path !== null)
  const reserved = new Map<string, RangeReplacement[]>()
  for (const [item, count, translations, find] of [
    [navItem, tocLabels.nav.length, labels.nav, navLabelElements],
    [ncxItem, tocLabels.ncx.length, labels.ncx, ncxLabelElements],
  ] as const) {
    const path = item?.path ?? null
    if (path === null || !book.has(path)) continue
    const state = states.get(path)
    const done = await labelEdits(edits, path, count, translations, find, !!state && 'map' in state)
    reserved.set(path, [...(reserved.get(path) ?? []), ...done])
  }

  // Chapters.
  const untranslatedBlocks: EpubUntranslatedBlock[] = []
  let translatedBlocks = 0
  const chapterInput: ChapterInput = { kind, lang, rtl, horizontal, results }
  for (const [path, state] of states) {
    if (!('map' in state)) continue
    const entry = (await edits.open(path, true))!
    translatedBlocks += chapterEdits(
      entry,
      state.map,
      { index: state.index, path },
      reserved.get(path) ?? [],
      chapterInput,
      untranslatedBlocks,
    )
  }

  // The package document.
  const opf = await edits.open(book.opfPath)
  if (!opf) throw new Refusal('broken-package', `${book.opfPath} is not valid text`)
  packageEdits(opf, { book, kind, lang, identifier, titles: labels.titles, horizontal, now })

  // Write.
  const replaced = edits.encoded()
  for (const font of book.obfuscatedFonts) {
    if (!hasOriginalFontKey(book, font.algorithm)) continue
    const revealed = await book.readForRendering(font.path)
    const hidden = revealed && obfuscateFont(revealed, font.algorithm, identifier)
    if (hidden) replaced.set(font.path, hidden)
  }
  const zip = await JSZip.loadAsync(new Uint8Array(original))
  const bytes = await writeEpubArchive(zip, replaced, now)
  return {
    ok: true,
    bytes,
    identifier,
    report: { translatedBlocks, untranslatedBlocks, originalChapters },
  }
}
