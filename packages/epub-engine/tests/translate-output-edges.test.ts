// pdf-structure pulls in pdf2docx sources; their bidi-js shim is not on this package's include list.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../pdf2docx/src/bidi-js.d.ts" />
import { describe, expect, it } from 'vitest'
import { openEpub } from '../src/open'
import {
  EPUB_TRANSLATION_CLASS,
  buildTranslatedEpub,
  epubBlockKeyString,
  epubTranslationUnits,
  type EpubTranslationOutcome,
  type EpubTranslationOutputKind,
} from '../src/translate'
import { checkWellFormed } from '../src/xml-positions'
import { buildEpub, epub2Files, opf, xhtml } from './helpers'
import { readEntries, utf8 } from './save-helpers'
import { shout } from './translate-helpers'

const UUID = '01234567-89ab-4cde-8f01-23456789abcd'

async function shoutAll(bytes: Uint8Array): Promise<Map<string, EpubTranslationOutcome>> {
  const opened = await openEpub(bytes)
  if (!opened.ok) throw new Error(opened.detail)
  const results = new Map<string, EpubTranslationOutcome>()
  for (const unit of (await epubTranslationUnits(opened.book)).units) {
    results.set(epubBlockKeyString(unit.key), { status: 'translated', text: shout(unit.text) })
  }
  return results
}

async function translate(bytes: Uint8Array, kind: EpubTranslationOutputKind, lang = 'en') {
  const result = await buildTranslatedEpub(bytes, {
    kind,
    lang,
    results: await shoutAll(bytes),
    uuid: () => UUID,
    now: () => new Date('2026-10-24T00:00:00Z'),
  })
  if (!result.ok) throw new Error(`${result.reason}: ${result.detail}`)
  const texts = new Map((await readEntries(result.bytes)).map((e) => [e.name, utf8(e.bytes)]))
  const reopened = await openEpub(result.bytes)
  if (!reopened.ok) throw new Error(reopened.detail)
  return { ...result, texts, book: reopened.book }
}

/** a book whose navigation document is also its first chapter */
function navInSpine(): Record<string, string> {
  return {
    'OEBPS/content.opf': opf({
      metadata: [
        '<dc:identifier id="uid">book-1</dc:identifier>',
        '<dc:title>Book</dc:title>',
        '<dc:language>fr</dc:language>',
        '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>',
      ].join('\n'),
      manifest: [
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>',
      ].join('\n'),
      spine: '<itemref idref="nav"/>\n<itemref idref="c1"/>',
    }),
    'OEBPS/nav.xhtml': xhtml(
      'Contents',
      '<h1>Contents</h1>\n<nav epub:type="toc" id="toc"><ol>\n' +
        '<li id="e1"><a href="c1.xhtml">First chapter</a></li>\n' +
        '</ol></nav>',
    ),
    'OEBPS/c1.xhtml': xhtml('One', '<p>Bonjour.</p>'),
  }
}

describe('buildTranslatedEpub: a navigation document in the spine', () => {
  it.each(['translated', 'bilingual'] as const)(
    '%s: the contents entry is translated once, as a contents label',
    async (kind) => {
      const { texts, report, book } = await translate(await buildEpub(navInSpine()), kind)
      const nav = texts.get('OEBPS/nav.xhtml')!
      expect(checkWellFormed(nav).ok).toBe(true)
      expect(nav).toContain('<li id="e1"><a href="c1.xhtml">FIRST CHAPTER</a></li>\n</ol>')
      expect(nav.match(/<li/g)).toHaveLength(1)
      expect(book.toc.entries.map((e) => e.title)).toEqual(['FIRST CHAPTER'])
      // the heading outside the contents list is an ordinary block
      expect(nav).toContain(
        kind === 'translated'
          ? '<h1>CONTENTS</h1>'
          : `<h1>Contents</h1>\n<h1 lang="en" xml:lang="en" class="${EPUB_TRANSLATION_CLASS}">CONTENTS</h1>`,
      )
      expect(report.translatedBlocks).toBe(2)
      expect(report.untranslatedBlocks).toEqual([])
    },
  )
})

describe('buildTranslatedEpub: a package without a unique identifier', () => {
  it('adds one, points the package at it and keeps the first identifier as dc:source', async () => {
    const files = navInSpine()
    files['OEBPS/content.opf'] = files['OEBPS/content.opf']!.replace(
      'unique-identifier="uid"',
      'unique-identifier="missing"',
    )
    const { texts, book, identifier } = await translate(await buildEpub(files), 'translated')
    expect(identifier).toBe(`urn:uuid:${UUID}`)
    expect(book.metadata.uniqueIdentifier).toBe(identifier)
    const opfText = texts.get('OEBPS/content.opf')!
    expect(opfText).toContain('unique-identifier="uid-2"')
    expect(opfText).toContain(`<dc:identifier id="uid-2">${identifier}</dc:identifier>`)
    expect(opfText).toContain('<dc:source>book-1</dc:source>')
    expect(opfText).toContain('<dc:identifier id="uid">book-1</dc:identifier>')
  })
})

describe('buildTranslatedEpub: out of a right-to-left book', () => {
  function rtlBook(): Record<string, string> {
    const files = navInSpine()
    files['OEBPS/c1.xhtml'] = xhtml('One', '<p dir="rtl">مرحبا</p>').replace(
      '<html ',
      '<html dir="rtl" lang="ar" ',
    )
    return files
  }

  it('translated: the chapter turns left-to-right for a left-to-right target', async () => {
    const { texts } = await translate(await buildEpub(rtlBook()), 'translated')
    const c1 = texts.get('OEBPS/c1.xhtml')!
    expect(/<html\b[^>]*>/.exec(c1)![0]).toContain('dir="ltr" lang="en"')
  })

  it('bilingual: copies are marked left-to-right', async () => {
    const { texts } = await translate(await buildEpub(rtlBook()), 'bilingual')
    expect(texts.get('OEBPS/c1.xhtml')).toContain(
      `<p dir="ltr" lang="en" xml:lang="en" class="${EPUB_TRANSLATION_CLASS}">مرحبا</p>`,
    )
  })
})

describe('buildTranslatedEpub: an identifier with another scheme', () => {
  it('renames the scheme of the replaced identifier to UUID', async () => {
    const files = epub2Files()
    files['content.opf'] = files['content.opf']!.replace(
      '<dc:identifier id="BookId" opf:scheme="UUID">0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
      '<dc:identifier id="BookId" opf:scheme="ISBN">978-0-00-000000-0',
    )
    const { texts } = await translate(await buildEpub(files, 'content.opf'), 'bilingual')
    expect(texts.get('content.opf')).toContain(
      `<dc:identifier id="BookId" opf:scheme="UUID">urn:uuid:${UUID}</dc:identifier>\n` +
        '<dc:source>978-0-00-000000-0</dc:source>',
    )
  })
})
