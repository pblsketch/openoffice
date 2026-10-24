/**
 * Translation units of a book (spec §8): every editable block of the chosen
 * chapters, in the block notation with ruby readings left out, and the book's
 * title (`dc:title`) and contents labels (`nav` and `toc.ncx`).
 *
 * A unit carries where it came from (a chapter block, or the titles and
 * contents entries that share its text), so the translated book can be
 * rebuilt from the stored results. Units are plain data: they can cross a
 * process boundary.
 *
 * Left out, as in the PDF translation: blocks and labels without a letter
 * (numbers, pictures alone). Chapters that are read-only are left out whole
 * and reported: broken chapters (not well-formed XML, or text that is not
 * valid in its encoding) and fixed-layout ones.
 */
import type { InlineRun } from '@genoffice/pdf-structure'
import type { TranslationBlockKey } from '@genoffice/pdf-structure/store'
import { openChapter, type OpenChapter } from '../blocks'
import {
  encodeBlock,
  escapeNotationText,
  notationPlainText,
  serializeNotation,
  type NotationContext,
} from '../notation'
import { navTocEntries, ncxEntries } from '../toc'
import type { EpubBook } from '../types'
import { parseHtml, parseXml, type XmlElement } from '../xml'
import { EPUB_METADATA_FINGERPRINT, epubChapterFingerprint, epubTranslationKeys } from './keys'

/** the `page` of title and contents units (chapter blocks carry their spine index) */
export const EPUB_METADATA_PAGE = -1

const NCX_MEDIA_TYPE = 'application/x-dtbncx+xml'
const HAS_LETTER = /\p{L}/u

/** where a unit's text is in the book */
export type EpubUnitSource =
  /** a block of a chapter: the spine index, the chapter's zip path and the block id of `openChapter` */
  | { kind: 'block'; spineIndex: number; path: string; blockId: string }
  /** the `index`-th `dc:title` (`metadata.titles`) */
  | { kind: 'title'; index: number }
  /** the `index`-th entry of the nav `toc` list, as `navTocEntries` lists them */
  | { kind: 'nav'; index: number }
  /** the `index`-th NCX navPoint, as `ncxEntries` lists them */
  | { kind: 'ncx'; index: number }

/**
 * One unit to translate. It fills the job engine's `TranslationSourceBlock`:
 * `runs` is one text run holding the notation text (so the store key follows
 * the formatting too), `page` the spine index (EPUB_METADATA_PAGE for title
 * and contents units).
 */
export interface EpubTranslationUnit {
  runs: InlineRun[]
  pageFingerprint: string
  page: number
  /** the unit's store key */
  key: TranslationBlockKey
  /** the notation text sent to the model */
  text: string
  /** the text without notation, for language guessing */
  plainText: string
  /** what a returned notation must match (no placeholders for title and contents) */
  context: NotationContext
  /** a chapter block: one source; title and contents: every place with this text */
  sources: EpubUnitSource[]
}

/** a chosen chapter whose blocks stay in the source language */
export interface EpubSkippedChapter {
  index: number
  path: string
  reason: 'broken' | 'fixed-layout'
}

export interface EpubTranslationUnits {
  /** title and contents units first, then the chapters' blocks in spine order */
  units: EpubTranslationUnit[]
  skipped: EpubSkippedChapter[]
}

export interface EpubTranslationUnitOptions {
  /** spine indices (`spine.items[].index`) to translate; default every chapter */
  chapters?: Iterable<number>
}

const emptyContext = (): NotationContext => ({
  placeholders: [],
  bold: [],
  italic: [],
  breaks: [],
})

const textRun = (text: string): InlineRun[] => [{ kind: 'text', text }]

/** the units of one open chapter, keyed by its path */
export function chapterTranslationUnits(
  map: OpenChapter,
  chapter: { index: number; path: string },
): EpubTranslationUnit[] {
  const pageFingerprint = epubChapterFingerprint(chapter.path)
  const draft: Omit<EpubTranslationUnit, 'key'>[] = []
  for (const block of map.blocks) {
    const { tree, context } = encodeBlock(map, block, { dropRuby: true })
    const plainText = notationPlainText(tree)
    if (!HAS_LETTER.test(plainText)) continue
    const text = serializeNotation(tree)
    draft.push({
      runs: textRun(text),
      pageFingerprint,
      page: chapter.index,
      text,
      plainText,
      context,
      sources: [
        { kind: 'block', spineIndex: chapter.index, path: chapter.path, blockId: block.id },
      ],
    })
  }
  return withKeys(draft)
}

function withKeys(draft: Omit<EpubTranslationUnit, 'key'>[]): EpubTranslationUnit[] {
  const keys = epubTranslationKeys(draft)
  return draft.map((unit, i) => ({ ...unit, key: keys[i]! }))
}

/** the labels title and contents units are made of */
export interface EpubMetadataLabels {
  /** every `dc:title`, in order */
  titles: readonly string[]
  /** the nav `toc` entries' titles, in `navTocEntries` order */
  nav: readonly string[]
  /** the NCX navPoints' labels, in `ncxEntries` order */
  ncx: readonly string[]
}

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim()

/**
 * One unit per distinct label text (whitespace collapsed), listing every
 * place it appears, so the same label is translated once and the same way
 * everywhere. Labels are plain text: the unit text only escapes `&`, `<`, `>`.
 */
export function metadataTranslationUnits(labels: EpubMetadataLabels): EpubTranslationUnit[] {
  const byText = new Map<string, Omit<EpubTranslationUnit, 'key'>>()
  const add = (label: string, source: EpubUnitSource): void => {
    const plainText = collapse(label)
    if (!HAS_LETTER.test(plainText)) return
    const fold = plainText.normalize('NFC')
    const known = byText.get(fold)
    if (known) {
      known.sources.push(source)
      return
    }
    const text = escapeNotationText(plainText)
    byText.set(fold, {
      runs: textRun(text),
      pageFingerprint: EPUB_METADATA_FINGERPRINT,
      page: EPUB_METADATA_PAGE,
      text,
      plainText,
      context: emptyContext(),
      sources: [source],
    })
  }
  labels.titles.forEach((title, index) => add(title, { kind: 'title', index }))
  labels.nav.forEach((title, index) => add(title, { kind: 'nav', index }))
  labels.ncx.forEach((title, index) => add(title, { kind: 'ncx', index }))
  return withKeys([...byText.values()])
}

async function readTree(book: EpubBook, path: string | null): Promise<XmlElement | null> {
  if (path === null) return null
  const decoded = await book.readText(path)
  if (!decoded) return null
  try {
    return parseXml(decoded.text)
  } catch {
    try {
      return parseHtml(decoded.text)
    } catch {
      return null
    }
  }
}

/**
 * The contents labels of both tables of contents a book may carry: the EPUB 3
 * nav `toc` and the NCX (the spine's `toc` item, else the first NCX in the
 * manifest). A missing or unreadable one gives no labels.
 */
export async function epubTocLabels(book: EpubBook): Promise<{ nav: string[]; ncx: string[] }> {
  const navItem = book.manifest.find((m) => m.properties.includes('nav') && m.path !== null)
  const ncxItem =
    (book.spine.tocId !== null
      ? book.manifest.find((m) => m.id === book.spine.tocId && m.path !== null)
      : undefined) ?? book.manifest.find((m) => m.mediaType === NCX_MEDIA_TYPE && m.path !== null)
  const navRoot = navItem ? await readTree(book, navItem.path) : null
  const ncxRoot = ncxItem ? await readTree(book, ncxItem.path) : null
  return {
    nav: navRoot ? navTocEntries(navRoot, navItem!.path!).map((e) => e.title) : [],
    ncx: ncxRoot ? ncxEntries(ncxRoot, ncxItem!.path!).map((e) => e.title) : [],
  }
}

function chosenIndices(book: EpubBook, chapters: Iterable<number> | undefined): number[] {
  const count = book.spine.items.length
  if (chapters === undefined) return book.spine.items.map((item) => item.index)
  const chosen = new Set<number>()
  for (const index of chapters) {
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new RangeError(`epub translation: no chapter ${index} (the book has ${count})`)
    }
    chosen.add(index)
  }
  return [...chosen].sort((a, b) => a - b)
}

/**
 * The translation units of a book: title and contents, then the editable
 * blocks of the chosen chapters in spine order. Chapters are read from the
 * book as it is stored (save before translating). A chapter file listed twice
 * in the spine gives its units once.
 */
export async function epubTranslationUnits(
  book: EpubBook,
  options: EpubTranslationUnitOptions = {},
): Promise<EpubTranslationUnits> {
  const indices = chosenIndices(book, options.chapters)
  const labels = await epubTocLabels(book)
  const units = metadataTranslationUnits({ titles: book.metadata.titles, ...labels })
  const skipped: EpubSkippedChapter[] = []
  const seen = new Set<string>()
  for (const index of indices) {
    const item = book.spine.items[index]!
    if (seen.has(item.path)) continue
    seen.add(item.path)
    if (item.fixedLayout) {
      skipped.push({ index, path: item.path, reason: 'fixed-layout' })
      continue
    }
    const decoded = await book.readText(item.path)
    const map = decoded?.valid ? openChapter(decoded.text) : null
    if (!map || map.broken) {
      skipped.push({ index, path: item.path, reason: 'broken' })
      continue
    }
    units.push(...chapterTranslationUnits(map, { index, path: item.path }))
  }
  return { units, skipped }
}
