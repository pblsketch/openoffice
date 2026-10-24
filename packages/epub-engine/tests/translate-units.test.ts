// pdf-structure pulls in pdf2docx sources; their bidi-js shim is not on this package's include list.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../pdf2docx/src/bidi-js.d.ts" />
import { createHash } from 'node:crypto'
import {
  blockKeyString,
  translationBlockKeys,
  type TranslationBlockKey,
} from '@genoffice/pdf-structure/store'
import { describe, expect, it } from 'vitest'
import { openChapter } from '../src/blocks'
import { checkNotation } from '../src/notation'
import {
  EPUB_METADATA_FINGERPRINT,
  EPUB_METADATA_PAGE,
  chapterTranslationUnits,
  epubBlockKeyString,
  epubChapterFingerprint,
  epubDocumentHash,
  epubTocLabels,
  epubTranslationKeys,
  epubTranslationUnits,
  metadataTranslationUnits,
  type EpubTranslationUnit,
} from '../src/translate'
import { chapter } from './chapter-helpers'
import { CHAPTER_ONE_BODY, openTranslateBook, translateBookBytes } from './translate-helpers'

const SEGMENT = /^[A-Za-z0-9_-]{1,128}$/
const sha256 = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex')

const C1 = 'OEBPS/text/c1.xhtml'
const C4 = 'OEBPS/text/c4.xhtml'

const texts = (units: readonly EpubTranslationUnit[]) => units.map((u) => u.text)

describe('epubTranslationUnits', () => {
  it('collects title and contents units, then the blocks of each chosen chapter', async () => {
    const book = await openTranslateBook()
    const { units, skipped } = await epubTranslationUnits(book)
    expect(texts(units)).toEqual([
      // title and contents: one unit per distinct text
      'A Tale &amp; More',
      'Chapter One',
      'The End',
      'II',
      'Last &amp; Least',
      // chapter 1 (ruby readings dropped; no-letter blocks left out)
      'Chapter <i>One</i>',
      'The <x1>漢</x1> sign &amp; <b>bold</b> text.',
      'Read <x1>the end</x1><x2/>',
      'Same line.',
      'Same line.',
      // chapter 4
      'The end',
      'Same line.',
    ])
    expect(skipped).toEqual([
      { index: 1, path: 'OEBPS/text/c2.xhtml', reason: 'broken' },
      { index: 2, path: 'OEBPS/text/c3.xhtml', reason: 'fixed-layout' },
    ])
  })

  it('runs hold the notation text; page is the spine index', async () => {
    const book = await openTranslateBook()
    const { units } = await epubTranslationUnits(book)
    for (const u of units) {
      expect(u.runs).toEqual([{ kind: 'text', text: u.text }])
      expect(checkNotation(u.text, u.context)).toEqual({ ok: true })
    }
    const blocks = units.filter((u) => u.page !== EPUB_METADATA_PAGE)
    expect(blocks.map((u) => u.page)).toEqual([0, 0, 0, 0, 0, 3, 3])
    expect(blocks[0]!.sources).toEqual([{ kind: 'block', spineIndex: 0, path: C1, blockId: 'b1' }])
    expect(blocks[5]!.sources).toEqual([{ kind: 'block', spineIndex: 3, path: C4, blockId: 'b1' }])
    expect(blocks[1]!.plainText).toBe('The 漢 sign & bold text.')
  })

  it('says where each title and contents unit came from', async () => {
    const book = await openTranslateBook()
    const meta = (await epubTranslationUnits(book)).units.filter(
      (u) => u.page === EPUB_METADATA_PAGE,
    )
    expect(meta.map((u) => u.sources)).toEqual([
      [{ kind: 'title', index: 0 }],
      [
        { kind: 'title', index: 1 },
        { kind: 'nav', index: 0 },
        { kind: 'ncx', index: 0 },
      ],
      [{ kind: 'nav', index: 1 }],
      [{ kind: 'nav', index: 2 }],
      [{ kind: 'ncx', index: 1 }],
    ])
    for (const u of meta) {
      expect(u.pageFingerprint).toBe(EPUB_METADATA_FINGERPRINT)
      expect(u.context).toEqual({ placeholders: [], bold: [], italic: [], breaks: [] })
    }
  })

  it('takes only the chosen chapters but always the title and contents', async () => {
    const book = await openTranslateBook()
    const { units, skipped } = await epubTranslationUnits(book, { chapters: [3, 1] })
    expect(units.filter((u) => u.page !== EPUB_METADATA_PAGE).map((u) => u.page)).toEqual([3, 3])
    expect(units.filter((u) => u.page === EPUB_METADATA_PAGE)).toHaveLength(5)
    expect(skipped).toEqual([{ index: 1, path: 'OEBPS/text/c2.xhtml', reason: 'broken' }])
  })

  it('refuses chapter numbers outside the spine', async () => {
    const book = await openTranslateBook()
    await expect(epubTranslationUnits(book, { chapters: [9] })).rejects.toThrow(RangeError)
    await expect(epubTranslationUnits(book, { chapters: [-1] })).rejects.toThrow(RangeError)
    await expect(epubTranslationUnits(book, { chapters: [0.5] })).rejects.toThrow(RangeError)
  })

  it('reads the nav and the NCX labels both', async () => {
    const book = await openTranslateBook()
    expect(await epubTocLabels(book)).toEqual({
      nav: ['Chapter One', 'The End', 'II'],
      ncx: ['Chapter One', 'Last & Least'],
    })
  })
})

describe('translation keys', () => {
  it('fingerprints a chapter by its package path, as a valid store segment', () => {
    expect(epubChapterFingerprint(C1)).toBe(sha256(C1))
    expect(epubChapterFingerprint(C1)).toMatch(SEGMENT)
    expect(EPUB_METADATA_FINGERPRINT).toMatch(SEGMENT)
    expect(EPUB_METADATA_FINGERPRINT).not.toBe(epubChapterFingerprint(C1))
    expect(epubChapterFingerprint('OEBPS/text/c1.xhtml')).not.toBe(
      epubChapterFingerprint('OEBPS/text/C1.xhtml'),
    )
  })

  it('gives every unit the key the job engine computes', async () => {
    const book = await openTranslateBook()
    const { units } = await epubTranslationUnits(book)
    const engine = translationBlockKeys(units)
    expect(units.map((u) => u.key)).toEqual(engine)
    expect(epubTranslationKeys(units)).toEqual(engine)
    for (const key of engine) {
      expect(key.pageFingerprint).toMatch(SEGMENT)
      expect(key.textHash).toMatch(SEGMENT)
      expect(epubBlockKeyString(key)).toBe(blockKeyString(key))
    }
  })

  it('counts same-text blocks per chapter, so a chapter alone keys the same', async () => {
    const book = await openTranslateBook()
    const all = (await epubTranslationUnits(book)).units
    const only = (await epubTranslationUnits(book, { chapters: [3] })).units
    const keyOf = (u: EpubTranslationUnit) => epubBlockKeyString(u.key)
    const c4 = (list: EpubTranslationUnit[]) => list.filter((u) => u.page === 3).map(keyOf)
    expect(c4(only)).toEqual(c4(all))
    const same = all.filter((u) => u.text === 'Same line.')
    expect(same.map((u) => u.key.occurrence)).toEqual([0, 1, 0])
    expect(new Set(same.map(keyOf)).size).toBe(3)
  })

  it('is stable: the same book gives the same keys', async () => {
    const a = (await epubTranslationUnits(await openTranslateBook())).units
    const b = (await epubTranslationUnits(await openTranslateBook())).units
    expect(b.map((u) => u.key)).toEqual(a.map((u) => u.key))
  })

  it('same text gives the same key; a formatting change gives a new one', () => {
    const keyOf = (body: string): TranslationBlockKey => {
      const map = openChapter(chapter(body))
      if (map.broken) throw new Error(map.error)
      return chapterTranslationUnits(map, { index: 0, path: C1 })[0]!.key
    }
    const plain = keyOf('<p>Hello world.</p>')
    expect(keyOf('<p class="x">Hello   world.</p>')).toEqual(plain)
    expect(keyOf('<p>Hello <b>world</b>.</p>')).not.toEqual(plain)
    expect(keyOf('<p>Hello <a href="a.xhtml">world</a>.</p>')).not.toEqual(plain)
    expect(keyOf('<p>Hello <span>world</span>.</p>')).toEqual(
      keyOf('<p>Hello <a href="a.xhtml">world</a>.</p>'),
    )
    // ruby readings are not sent, so they do not count
    expect(keyOf('<p><ruby>漢<rt>かん</rt></ruby></p>')).toEqual(keyOf('<p><ruby>漢</ruby></p>'))
  })

  it('keys title and contents units by their text alone', () => {
    const a = metadataTranslationUnits({ titles: ['Book'], nav: ['One', 'Two'], ncx: [] })
    const b = metadataTranslationUnits({ titles: [], nav: ['Two'], ncx: ['Book', 'One'] })
    const byText = (list: EpubTranslationUnit[]) =>
      Object.fromEntries(list.map((u) => [u.text, epubBlockKeyString(u.key)]))
    expect(byText(b)).toEqual(byText(a))
    expect(a.every((u) => u.key.occurrence === 0)).toBe(true)
  })

  it('leaves out labels without letters and folds labels that differ only in spacing', () => {
    const units = metadataTranslationUnits({
      titles: [' Book  One '],
      nav: ['12', '', 'Book One'],
      ncx: ['<Odd> & co'],
    })
    expect(units.map((u) => [u.text, u.sources])).toEqual([
      [
        'Book One',
        [
          { kind: 'title', index: 0 },
          { kind: 'nav', index: 2 },
        ],
      ],
      ['&lt;Odd&gt; &amp; co', [{ kind: 'ncx', index: 0 }]],
    ])
  })
})

describe('epubDocumentHash', () => {
  it('is the SHA-256 hex of the file bytes', async () => {
    const bytes = await translateBookBytes()
    expect(await epubDocumentHash(bytes)).toBe(sha256(bytes))
    expect(await epubDocumentHash(new Uint8Array())).toBe(sha256(new Uint8Array()))
  })
})

describe('chapterTranslationUnits', () => {
  it('matches the units the book collects for that chapter', async () => {
    const book = await openTranslateBook()
    const map = openChapter(chapter(CHAPTER_ONE_BODY))
    if (map.broken) throw new Error(map.error)
    const direct = chapterTranslationUnits(map, { index: 0, path: C1 })
    const collected = (await epubTranslationUnits(book, { chapters: [0] })).units.filter(
      (u) => u.page === 0,
    )
    expect(texts(direct)).toEqual(texts(collected))
    expect(direct.map((u) => u.key)).toEqual(collected.map((u) => u.key))
  })
})
