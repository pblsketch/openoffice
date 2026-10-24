// pdf-structure pulls in pdf2docx sources; their bidi-js shim is not on this package's include list.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../pdf2docx/src/bidi-js.d.ts" />
import { describe, expect, it } from 'vitest'
import * as engine from '../src/index'
import {
  IDPF_FONT_OBFUSCATION,
  ADOBE_FONT_OBFUSCATION,
  obfuscateFont,
  type FontObfuscationAlgorithm,
} from '../src/fonts'
import { openEpub } from '../src/open'
import {
  EPUB_TRANSLATION_CLASS,
  buildTranslatedEpub,
  epubBlockKeyString,
  epubTranslationUnits,
  type BuildTranslatedEpubOptions,
  type EpubTranslationOutcome,
  type EpubTranslationUnit,
} from '../src/translate'
import type { EpubBook } from '../src/types'
import { checkWellFormed } from '../src/xml-positions'
import { buildEpub, epub2Files, opf, xhtml } from './helpers'
import { readEntries, utf8 } from './save-helpers'
import { shout, translateBookBytes, translateBookFiles } from './translate-helpers'

const UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const NEW_ID = `urn:uuid:${UUID}`
const OLD_ID = 'urn:uuid:11111111-2222-3333-4444-555555555555'
const NOW = new Date('2026-10-24T05:06:07.890Z')
const C1 = 'OEBPS/text/c1.xhtml'
const C2 = 'OEBPS/text/c2.xhtml'
const C3 = 'OEBPS/text/c3.xhtml'
const C4 = 'OEBPS/text/c4.xhtml'
const OPF = 'OEBPS/content.opf'
const NAV = 'OEBPS/nav.xhtml'
const NCX = 'OEBPS/toc.ncx'

async function open(bytes: Uint8Array): Promise<EpubBook> {
  const opened = await openEpub(bytes)
  if (!opened.ok) throw new Error(`${opened.reason}: ${opened.detail}`)
  return opened.book
}

type Answer = (unit: EpubTranslationUnit) => EpubTranslationOutcome | undefined

/** stored results for the book's units, as the job would leave them */
async function resultsFor(
  bytes: Uint8Array,
  answer: Answer = (u) => ({ status: 'translated', text: shout(u.text) }),
  chapters?: number[],
): Promise<Map<string, EpubTranslationOutcome>> {
  const book = await open(bytes)
  const { units } = await epubTranslationUnits(book, chapters ? { chapters } : {})
  const results = new Map<string, EpubTranslationOutcome>()
  for (const unit of units) {
    const result = answer(unit)
    if (result) results.set(epubBlockKeyString(unit.key), result)
  }
  return results
}

async function build(
  bytes: Uint8Array,
  o: Partial<BuildTranslatedEpubOptions> & Pick<BuildTranslatedEpubOptions, 'kind'>,
) {
  const result = await buildTranslatedEpub(bytes, {
    lang: 'en',
    results: o.results ?? (await resultsFor(bytes)),
    now: () => NOW,
    uuid: () => UUID,
    ...o,
  })
  if (!result.ok) throw new Error(`${result.reason}: ${result.detail}`)
  return result
}

async function entryTexts(bytes: Uint8Array): Promise<Map<string, string>> {
  return new Map((await readEntries(bytes)).map((e) => [e.name, utf8(e.bytes)]))
}

async function entryBytes(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  return new Map((await readEntries(bytes)).map((e) => [e.name, e.bytes]))
}

const body = (chapter: string): string =>
  chapter.slice(chapter.indexOf('<body>') + 6, chapter.indexOf('</body>')).trim()

const htmlTag = (chapter: string): string => /<html\b[^>]*>/.exec(chapter)![0]

function ids(text: string): string[] {
  return [...text.matchAll(/\s(?:xml:)?id\s*=\s*("[^"]*"|'[^']*')/g)].map((m) => m[1]!)
}

function expectNoDuplicateIds(text: string): void {
  const all = ids(text)
  expect(new Set(all).size).toBe(all.length)
}

describe('buildTranslatedEpub: translated book', () => {
  it('replaces the translated blocks, drops ruby readings and leaves no-letter blocks', async () => {
    const original = await translateBookBytes()
    const { bytes, report } = await build(original, { kind: 'translated' })
    const texts = await entryTexts(bytes)
    expect(body(texts.get(C1)!)).toBe(
      [
        '<h1>CHAPTER <em>ONE</em></h1>',
        '<p>THE <ruby>漢</ruby> SIGN &amp; <b>BOLD</b> TEXT.</p>',
        '<p>READ <a href="c4.xhtml">THE END</a><img src="i.png" alt=""/></p>',
        '<p>SAME LINE.</p>',
        '<p>SAME LINE.</p>',
        '<p>2026</p>',
        '<p><img src="only.png" alt=""/></p>',
      ].join('\n'),
    )
    expect(body(texts.get(C4)!)).toBe('<h2>THE END</h2>\n<p>SAME LINE.</p>')
    expect(report).toEqual({
      translatedBlocks: 7,
      untranslatedBlocks: [],
      originalChapters: [
        { chapter: 1, path: C2, reason: 'broken' },
        { chapter: 2, path: C3, reason: 'fixed-layout' },
      ],
    })
  })

  it('sets the translated chapters’ document language', async () => {
    const original = await translateBookBytes()
    const { bytes } = await build(original, { kind: 'translated' })
    const texts = await entryTexts(bytes)
    expect(htmlTag(texts.get(C1)!)).toBe(
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">',
    )
    expect(htmlTag(texts.get(C4)!)).toContain(' lang="en" xml:lang="en"')
    expect(htmlTag(texts.get(C1)!)).not.toContain('dir=')
  })

  it('replaces an existing lang and xml:lang in place', async () => {
    const files = translateBookFiles()
    files[C4] = files[C4]!.replace('<html ', '<html lang="fr" xml:lang="fr" ')
    const original = await buildEpub(files)
    const { bytes } = await build(original, { kind: 'translated' })
    expect(htmlTag((await entryTexts(bytes)).get(C4)!)).toBe(
      '<html lang="en" xml:lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">',
    )
  })

  it('keeps unchosen and broken chapters and every other untouched entry byte for byte', async () => {
    const original = await translateBookBytes()
    const { bytes, report } = await build(original, {
      kind: 'translated',
      chapters: [0],
      results: await resultsFor(original, undefined, [0]),
    })
    const before = await entryBytes(original)
    const after = await entryBytes(bytes)
    expect([...after.keys()]).toEqual([...before.keys()])
    for (const name of [C2, C3, C4, 'META-INF/container.xml', 'mimetype']) {
      expect(after.get(name), name).toEqual(before.get(name))
    }
    expect(after.get(C1)).not.toEqual(before.get(C1))
    expect(report.originalChapters).toEqual([
      { chapter: 1, path: C2, reason: 'not-chosen' },
      { chapter: 2, path: C3, reason: 'not-chosen' },
      { chapter: 3, path: C4, reason: 'not-chosen' },
    ])
    expect(report.translatedBlocks).toBe(5)
  })

  it('translates the title, the contents labels and changes the language, keeping authors', async () => {
    const files = translateBookFiles({ languages: ['fr', 'de'] })
    files[OPF] = files[OPF]!.replace(
      '<dc:title>A Tale',
      '<dc:creator>Some Author</dc:creator>\n<dc:title>A Tale',
    )
    const original = await buildEpub(files)
    const { bytes } = await build(original, { kind: 'translated' })
    const texts = await entryTexts(bytes)
    const opfText = texts.get(OPF)!
    expect(opfText).toContain('<dc:title>A TALE &amp; MORE</dc:title>')
    expect(opfText).toContain('<dc:title>CHAPTER ONE</dc:title>')
    expect(opfText).toContain('<dc:creator>Some Author</dc:creator>')
    expect(opfText.match(/<dc:language>[^<]*<\/dc:language>/g)).toEqual([
      '<dc:language>en</dc:language>',
    ])
    expect(texts.get(NAV)).toContain('<a href="text/c1.xhtml">CHAPTER ONE</a>')
    expect(texts.get(NAV)).toContain('<a href="text/c4.xhtml">THE END</a>')
    expect(texts.get(NAV)).toContain('<a href="text/c2.xhtml">II</a>')
    expect(texts.get(NCX)).toContain('<navLabel><text>CHAPTER ONE</text></navLabel>')
    expect(texts.get(NCX)).toContain('<navLabel><text>LAST &amp; LEAST</text></navLabel>')
    // the NCX document title is not a contents entry
    expect(texts.get(NCX)).toContain('<docTitle><text>A Tale</text></docTitle>')

    const book = await open(bytes)
    expect(book.metadata.titles).toEqual(['A TALE & MORE', 'CHAPTER ONE'])
    expect(book.metadata.creators).toEqual(['Some Author'])
    expect(book.metadata.languages).toEqual(['en'])
    expect(book.toc.entries.map((e) => e.title)).toEqual(['CHAPTER ONE', 'THE END', 'II'])
  })

  it('makes title and contents translations plain text', async () => {
    const original = await translateBookBytes()
    const results = await resultsFor(original, (u) =>
      u.sources[0]!.kind === 'block'
        ? undefined
        : { status: 'translated', text: `<b>${shout(u.text)}</b><br/>x` },
    )
    const { bytes } = await build(original, { kind: 'translated', results })
    const texts = await entryTexts(bytes)
    expect(texts.get(OPF)).toContain('<dc:title>A TALE &amp; MORE x</dc:title>')
    expect(texts.get(NCX)).toContain('<text>LAST &amp; LEAST x</text>')
  })

  it('gives the book a new identifier and keeps the old one as dc:source', async () => {
    const original = await translateBookBytes()
    const { bytes } = await build(original, { kind: 'translated' })
    const opfText = (await entryTexts(bytes)).get(OPF)!
    expect(opfText).toContain(`<dc:identifier id="uid">${NEW_ID}</dc:identifier>`)
    expect(opfText).toContain(`<dc:source>${OLD_ID}</dc:source>`)
    expect(opfText).toContain('<meta property="dcterms:modified">2026-10-24T05:06:07Z</meta>')
    const book = await open(bytes)
    expect(book.metadata.uniqueIdentifier).toBe(NEW_ID)
  })

  it('makes a fresh urn:uuid when none is given', async () => {
    const original = await translateBookBytes()
    const result = await buildTranslatedEpub(original, {
      kind: 'translated',
      lang: 'en',
      results: new Map(),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const book = await open(result.bytes)
    expect(book.metadata.uniqueIdentifier).toMatch(
      /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(book.metadata.uniqueIdentifier).not.toBe(OLD_ID)
  })

  it('arabic and hebrew targets set dir="rtl" on translated chapters', async () => {
    const original = await translateBookBytes()
    for (const lang of ['ar', 'he']) {
      const { bytes } = await build(original, { kind: 'translated', lang })
      const texts = await entryTexts(bytes)
      expect(htmlTag(texts.get(C1)!)).toContain(` lang="${lang}" xml:lang="${lang}" dir="rtl"`)
      expect(htmlTag(texts.get(C2)!)).not.toContain('dir=')
    }
  })
})

describe('buildTranslatedEpub: bilingual book', () => {
  it('puts a marked copy after each translated block', async () => {
    const original = await translateBookBytes()
    const { bytes, report } = await build(original, { kind: 'bilingual' })
    const texts = await entryTexts(bytes)
    const mark = `lang="en" xml:lang="en" class="${EPUB_TRANSLATION_CLASS}"`
    expect(body(texts.get(C1)!)).toBe(
      [
        '<h1>Chapter <em>One</em></h1>',
        `<h1 ${mark}>CHAPTER <em>ONE</em></h1>`,
        '<p>The <ruby>漢<rt>かん</rt></ruby> sign &amp; <b>bold</b> text.</p>',
        `<p ${mark}>THE <ruby>漢</ruby> SIGN &amp; <b>BOLD</b> TEXT.</p>`,
        '<p>Read <a href="c4.xhtml">the end</a><img src="i.png" alt=""/></p>',
        `<p ${mark}>READ <a href="c4.xhtml">THE END</a><img src="i.png" alt=""/></p>`,
        '<p>Same line.</p>',
        `<p ${mark}>SAME LINE.</p>`,
        '<p>Same line.</p>',
        `<p ${mark}>SAME LINE.</p>`,
        '<p>2026</p>',
        '<p><img src="only.png" alt=""/></p>',
      ].join('\n'),
    )
    // the chapter's own language stays
    expect(htmlTag(texts.get(C1)!)).not.toContain('lang=')
    expect(report.translatedBlocks).toBe(7)
  })

  it('removes every id from the copy and its descendants, appending to an existing class', async () => {
    const chapterOneBody =
      '<p id="p1" class="lead first" xml:id="x1">Hello <a id="a1" href="#p1">link</a>' +
      '<span id=\'s1\'/><svg id="g1"><g id="g2"/></svg></p>'
    const original = await translateBookBytes({ chapterOneBody })
    const { bytes } = await build(original, { kind: 'bilingual' })
    const c1 = (await entryTexts(bytes)).get(C1)!
    expect(body(c1)).toBe(
      chapterOneBody +
        '\n' +
        `<p class="lead first ${EPUB_TRANSLATION_CLASS}" lang="en" xml:lang="en">HELLO ` +
        '<a href="#p1">LINK</a><span/><svg><g/></svg></p>',
    )
    expectNoDuplicateIds(c1)
    expect(checkWellFormed(c1).ok).toBe(true)
  })

  it('titles the book "original (translation)" and adds the target language after the original', async () => {
    const original = await translateBookBytes()
    const { bytes } = await build(original, { kind: 'bilingual' })
    const texts = await entryTexts(bytes)
    const opfText = texts.get(OPF)!
    expect(opfText).toContain('<dc:title>A Tale &amp; More (A TALE &amp; MORE)</dc:title>')
    expect(opfText).toContain('<dc:language>fr</dc:language>\n<dc:language>en</dc:language>')
    expect(opfText).toContain(`<dc:identifier id="uid">${NEW_ID}</dc:identifier>`)
    expect(opfText).toContain(`<dc:source>${OLD_ID}</dc:source>`)
    // contents labels carry the translation only
    expect(texts.get(NAV)).toContain('<a href="text/c1.xhtml">CHAPTER ONE</a>')
    expect(texts.get(NCX)).toContain('<text>LAST &amp; LEAST</text>')
    const book = await open(bytes)
    expect(book.metadata.languages).toEqual(['fr', 'en'])
    expect(book.metadata.title).toBe('A Tale & More (A TALE & MORE)')
  })

  it('marks copies dir="rtl" for an arabic target, leaving the chapter as it was', async () => {
    const original = await translateBookBytes()
    const { bytes } = await build(original, { kind: 'bilingual', lang: 'ar' })
    const c4 = (await entryTexts(bytes)).get(C4)!
    expect(body(c4)).toBe(
      '<h2>The end</h2>\n' +
        `<h2 lang="ar" xml:lang="ar" class="${EPUB_TRANSLATION_CLASS}" dir="rtl">THE END</h2>\n` +
        '<p>Same line.</p>\n' +
        `<p lang="ar" xml:lang="ar" class="${EPUB_TRANSLATION_CLASS}" dir="rtl">SAME LINE.</p>`,
    )
    expect(htmlTag(c4)).not.toContain('dir=')
  })

  it('keeps unchosen and broken chapters byte for byte', async () => {
    const original = await translateBookBytes()
    const { bytes, report } = await build(original, {
      kind: 'bilingual',
      chapters: [0, 1],
      results: await resultsFor(original, undefined, [0, 1]),
    })
    const before = await entryBytes(original)
    const after = await entryBytes(bytes)
    for (const name of [C2, C3, C4]) expect(after.get(name), name).toEqual(before.get(name))
    expect(report.originalChapters).toEqual([
      { chapter: 1, path: C2, reason: 'broken' },
      { chapter: 2, path: C3, reason: 'not-chosen' },
      { chapter: 3, path: C4, reason: 'not-chosen' },
    ])
  })
})

describe('buildTranslatedEpub: partial and stale results', () => {
  const partial: Answer = (u) => {
    if (u.text === 'Chapter <i>One</i>') return { status: 'translated', text: 'CHAPTER <i>ONE</i>' }
    if (u.text === 'Read <x1>the end</x1><x2/>') {
      return { status: 'failed', reason: 'placeholder-mismatch' }
    }
    if (u.text === 'The end') return { status: 'translated', text: 'THE END' }
    return undefined
  }

  it.each(['translated', 'bilingual'] as const)(
    '%s: builds from what is there; the rest stays as it was and is reported',
    async (kind) => {
      const original = await translateBookBytes()
      const { bytes, report } = await build(original, {
        kind,
        results: await resultsFor(original, partial),
      })
      const texts = await entryTexts(bytes)
      expect(report.translatedBlocks).toBe(2)
      expect(report.untranslatedBlocks).toEqual([
        { chapter: 0, path: C1, blockId: 'b2', reason: 'not-translated' },
        { chapter: 0, path: C1, blockId: 'b3', reason: 'placeholder-mismatch' },
        { chapter: 0, path: C1, blockId: 'b4', reason: 'not-translated' },
        { chapter: 0, path: C1, blockId: 'b5', reason: 'not-translated' },
        { chapter: 3, path: C4, blockId: 'b2', reason: 'not-translated' },
      ])
      const c1 = body(texts.get(C1)!)
      expect(c1).toContain('<p>Read <a href="c4.xhtml">the end</a><img src="i.png" alt=""/></p>')
      expect(c1).toContain('<p>The <ruby>漢<rt>かん</rt></ruby> sign')
      expect(c1).not.toContain('READ')
      // untranslated title and labels stay
      expect(texts.get(OPF)).toContain('<dc:title>A Tale &amp; More</dc:title>')
      expect(texts.get(NCX)).toContain('<text>Chapter One</text>')
      if (kind === 'bilingual') {
        expect(c1.match(new RegExp(EPUB_TRANSLATION_CLASS, 'g'))).toHaveLength(1)
      }
      expect((await open(bytes)).spine.items).toHaveLength(4)
    },
  )

  it('a chapter with nothing translated is left byte for byte', async () => {
    const original = await translateBookBytes()
    const results = await resultsFor(original, (u) =>
      u.page === 3 ? undefined : { status: 'translated', text: shout(u.text) },
    )
    const { bytes, report } = await build(original, { kind: 'translated', results })
    expect((await entryBytes(bytes)).get(C4)).toEqual((await entryBytes(original)).get(C4))
    expect(report.untranslatedBlocks.filter((b) => b.chapter === 3)).toHaveLength(2)
  })

  it('re-checks a stored translation against the block and leaves a mismatch untranslated', async () => {
    const original = await translateBookBytes()
    const results = await resultsFor(original, (u) =>
      u.text === 'Read <x1>the end</x1><x2/>'
        ? { status: 'translated', text: 'READ <x1>THE END</x1>' }
        : u.text === 'The end'
          ? { status: 'translated', text: '   ' }
          : { status: 'translated', text: shout(u.text) },
    )
    for (const kind of ['translated', 'bilingual'] as const) {
      const { bytes, report } = await build(original, { kind, results })
      expect(report.untranslatedBlocks).toEqual([
        { chapter: 0, path: C1, blockId: 'b3', reason: 'placeholder-mismatch' },
        { chapter: 3, path: C4, blockId: 'b1', reason: 'empty-translation' },
      ])
      expect(report.translatedBlocks).toBe(5)
      expect(body((await entryTexts(bytes)).get(C1)!)).toContain(
        '<p>Read <a href="c4.xhtml">the end</a><img src="i.png" alt=""/></p>',
      )
    }
  })
})

describe('buildTranslatedEpub: the result reopens', () => {
  it.each(['translated', 'bilingual'] as const)(
    '%s: opens, every chapter is well-formed and no id repeats',
    async (kind) => {
      const chapterOneBody =
        '<h1 id="top">Title</h1>\n<p id="p1">One <a id="n1" href="#top">note</a></p>\n' +
        '<ul><li id="l1">Item <span id="sp">one</span></li></ul>'
      const original = await translateBookBytes({ chapterOneBody })
      const { bytes } = await build(original, { kind })
      const book = await open(bytes)
      expect(book.spine.items.map((i) => i.path)).toEqual([C1, C2, C3, C4])
      const texts = await entryTexts(bytes)
      for (const path of [C1, C3, C4, NAV, NCX, OPF]) {
        expect(checkWellFormed(texts.get(path)!).ok, path).toBe(true)
        expectNoDuplicateIds(texts.get(path)!)
      }
      const units = await epubTranslationUnits(book)
      expect(units.skipped.map((s) => s.reason)).toEqual(['broken', 'fixed-layout'])
    },
  )
})

// ---------------------------------------------------------------------------
// Fonts

function fakeFont(length: number): Uint8Array {
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) out[i] = (i * 13 + 5) & 0xff
  return out
}

const ENCRYPTION = (entries: [string, string][]): string =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">\n' +
  entries
    .map(
      ([algorithm, uri]) =>
        `<enc:EncryptedData><enc:EncryptionMethod Algorithm="${algorithm}"/>` +
        `<enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData></enc:EncryptedData>`,
    )
    .join('\n') +
  '\n</encryption>\n'

async function fontBook(): Promise<{ bytes: Uint8Array; fonts: Map<string, Uint8Array> }> {
  const id = 'urn:uuid:0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'
  const fonts = new Map<string, Uint8Array>([
    ['OEBPS/fonts/a.otf', fakeFont(3000)],
    ['OEBPS/fonts/b.ttf', fakeFont(500)],
  ])
  const algorithms: Record<string, FontObfuscationAlgorithm> = {
    'OEBPS/fonts/a.otf': IDPF_FONT_OBFUSCATION,
    'OEBPS/fonts/b.ttf': ADOBE_FONT_OBFUSCATION,
  }
  const files: Record<string, string | Uint8Array> = {
    'META-INF/encryption.xml': ENCRYPTION([
      [IDPF_FONT_OBFUSCATION, 'OEBPS/fonts/a.otf'],
      [ADOBE_FONT_OBFUSCATION, 'OEBPS/fonts/b.ttf'],
    ]),
    'OEBPS/content.opf': opf({
      metadata: [
        `<dc:identifier id="uid">${id}</dc:identifier>`,
        '<dc:title>Fonts</dc:title>',
        '<dc:language>fr</dc:language>',
        '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>',
      ].join('\n'),
      manifest: [
        '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="fa" href="fonts/a.otf" media-type="font/otf"/>',
        '<item id="fb" href="fonts/b.ttf" media-type="font/ttf"/>',
      ].join('\n'),
      spine: '<itemref idref="c1"/>',
    }),
    'OEBPS/c1.xhtml': xhtml('One', '<p>Bonjour.</p>'),
  }
  for (const [path, font] of fonts) files[path] = obfuscateFont(font, algorithms[path]!, id)!
  return { bytes: await buildEpub(files), fonts }
}

describe('buildTranslatedEpub: obfuscated fonts', () => {
  it.each(['translated', 'bilingual'] as const)(
    '%s: hides the fonts again under the new identifier',
    async (kind) => {
      const { bytes: original, fonts } = await fontBook()
      const { bytes } = await build(original, { kind })
      const book = await open(bytes)
      expect(book.metadata.uniqueIdentifier).toBe(NEW_ID)
      expect(book.obfuscatedFonts.map((f) => f.path)).toEqual([...fonts.keys()])
      const stored = await entryBytes(bytes)
      for (const font of book.obfuscatedFonts) {
        const plain = fonts.get(font.path)!
        expect(await book.readForRendering(font.path)).toEqual(plain)
        expect(stored.get(font.path)).toEqual(obfuscateFont(plain, font.algorithm, NEW_ID))
        expect(stored.get(font.path)).not.toEqual((await entryBytes(original)).get(font.path))
      }
      // encryption.xml itself is unchanged
      expect(stored.get('META-INF/encryption.xml')).toEqual(
        (await entryBytes(original)).get('META-INF/encryption.xml'),
      )
    },
  )
})

// ---------------------------------------------------------------------------
// Vertical writing

const HORIZONTAL = 'writing-mode: horizontal-tb !important'

describe('buildTranslatedEpub: vertical books', () => {
  it.each(['translated', 'bilingual'] as const)(
    '%s: a non-CJK target turns the book horizontal (EPUB 2, primary-writing-mode)',
    async (kind) => {
      const original = await buildEpub(epub2Files(), 'content.opf')
      const { bytes } = await build(original, { kind })
      const texts = await entryTexts(bytes)
      expect(texts.get('content.opf')).toContain(
        '<spine toc="ncx" page-progression-direction="ltr">',
      )
      for (const path of ['ch1.html', 'ch2.html']) {
        const head = /<head>[\s\S]*<\/head>/.exec(texts.get(path)!)![0]
        expect(head).toContain(HORIZONTAL)
        expect(checkWellFormed(texts.get(path)!).ok).toBe(true)
      }
      const book = await open(bytes)
      expect(book.spine.pageProgressionDirection).toBe('ltr')
      // EPUB 2: no dcterms:modified is written
      expect(texts.get('content.opf')).not.toContain('dcterms:modified')
    },
  )

  it.each(['ja', 'ko', 'zh', 'zh-TW'])('target %s keeps the book vertical', async (lang) => {
    const original = await buildEpub(epub2Files(), 'content.opf')
    const { bytes } = await build(original, { kind: 'translated', lang })
    const texts = await entryTexts(bytes)
    expect(texts.get('content.opf')).toContain('page-progression-direction="rtl"')
    expect(texts.get('ch1.html')).not.toContain('horizontal-tb')
    expect(htmlTag(texts.get('ch1.html')!)).toContain(` lang="${lang}" xml:lang="${lang}"`)
  })

  it('reads vertical writing from the CSS too and adds a missing direction', async () => {
    const files = translateBookFiles()
    files[OPF] = files[OPF]!.replace(
      '<item id="nav"',
      '<item id="css" href="v.css" media-type="text/css"/>\n<item id="nav"',
    )
    files['OEBPS/v.css'] = 'html { -epub-writing-mode: vertical-rl; writing-mode: vertical-rl }\n'
    const original = await buildEpub(files)
    expect((await open(original)).verticalWriting).toBe(true)
    const { bytes } = await build(original, { kind: 'translated', chapters: [0] })
    const texts = await entryTexts(bytes)
    expect(texts.get(OPF)).toContain('<spine toc="ncx" page-progression-direction="ltr">')
    expect(texts.get(C1)).toContain(HORIZONTAL)
    // only translated chapters get the style
    expect(texts.get(C4)).not.toContain('horizontal-tb')
  })

  it('a horizontal book is left horizontal without a style', async () => {
    const original = await translateBookBytes()
    const { bytes } = await build(original, { kind: 'translated' })
    const texts = await entryTexts(bytes)
    expect(texts.get(C1)).not.toContain('writing-mode')
    expect(texts.get(OPF)).toContain('<spine toc="ncx">')
  })
})

describe('buildTranslatedEpub: EPUB 2 identifier', () => {
  it('replaces the unique identifier, its scheme and keeps the old one as dc:source', async () => {
    const original = await buildEpub(epub2Files(), 'content.opf')
    const { bytes } = await build(original, { kind: 'translated' })
    const opfText = (await entryTexts(bytes)).get('content.opf')!
    expect(opfText).toContain(
      `<dc:identifier id="BookId" opf:scheme="UUID">${NEW_ID}</dc:identifier>\n` +
        '<dc:source>0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0</dc:source>',
    )
    expect(opfText).toContain('<dc:language>en</dc:language>')
    expect(opfText).toContain('<dc:title>OLD BOOK</dc:title>')
  })
})

describe('buildTranslatedEpub: refusals', () => {
  const base = (results = new Map<string, EpubTranslationOutcome>()) => ({
    kind: 'translated' as const,
    lang: 'en',
    results,
  })

  it('refuses bytes that do not open', async () => {
    const result = await buildTranslatedEpub(new Uint8Array([1, 2, 3]), base())
    expect(result).toMatchObject({ ok: false, reason: 'not-opened' })
  })

  it('refuses a fixed-layout book', async () => {
    const files = translateBookFiles()
    files[OPF] = files[OPF]!.replace(
      '<meta property="dcterms:modified">',
      '<meta property="rendition:layout">pre-paginated</meta>\n<meta property="dcterms:modified">',
    )
    const result = await buildTranslatedEpub(await buildEpub(files), base())
    expect(result).toMatchObject({ ok: false, reason: 'fixed-layout' })
  })

  it('refuses a chapter the book does not have and a malformed language', async () => {
    const original = await translateBookBytes()
    expect(await buildTranslatedEpub(original, { ...base(), chapters: [9] })).toMatchObject({
      ok: false,
      reason: 'unknown-chapter',
    })
    expect(await buildTranslatedEpub(original, { ...base(), lang: 'e"n' })).toMatchObject({
      ok: false,
      reason: 'invalid-language',
    })
  })
})

describe('public entry', () => {
  it('exports the translated book builder', () => {
    expect(engine).toHaveProperty('buildTranslatedEpub')
    expect(engine).toHaveProperty('EPUB_TRANSLATION_CLASS')
  })
})
