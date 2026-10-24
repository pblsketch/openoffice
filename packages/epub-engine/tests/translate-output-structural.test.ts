// pdf-structure pulls in pdf2docx sources; their bidi-js shim is not on this package's include list.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../pdf2docx/src/bidi-js.d.ts" />
import { describe, expect, it } from 'vitest'
import { openChapter } from '../src/blocks'
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
import { buildEpub, opf, xhtml } from './helpers'
import { readEntries, utf8 } from './save-helpers'
import { shout } from './translate-helpers'

const C1 = 'OEBPS/c1.xhtml'

const BODY =
  '<table id="t"><tr><th id="h1">Name</th><th>Age</th></tr>\n' +
  '<tr><td id="d1">Anna <a id="r1" href="#h1">note</a></td><td>ten</td></tr></table>\n' +
  '<figure><img src="i.png" alt=""/><figcaption id="cap">A <em>picture</em></figcaption></figure>\n' +
  '<dl><dt id="term">Word</dt><dd>Meaning <span id="m"/></dd></dl>\n' +
  '<p id="para">Plain text.</p>'

function files(body = BODY, html = ''): Record<string, string> {
  return {
    'OEBPS/content.opf': opf({
      metadata: [
        '<dc:identifier id="uid">book-1</dc:identifier>',
        '<dc:title>Book</dc:title>',
        '<dc:language>fr</dc:language>',
        '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>',
      ].join('\n'),
      manifest: '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>',
      spine: '<itemref idref="c1"/>',
    }),
    [C1]: xhtml('One', body).replace('<html ', `<html ${html}`),
  }
}

async function translate(bytes: Uint8Array, kind: EpubTranslationOutputKind, lang = 'en') {
  const opened = await openEpub(bytes)
  if (!opened.ok) throw new Error(opened.detail)
  const results = new Map<string, EpubTranslationOutcome>()
  for (const unit of (await epubTranslationUnits(opened.book)).units) {
    results.set(epubBlockKeyString(unit.key), { status: 'translated', text: shout(unit.text) })
  }
  const result = await buildTranslatedEpub(bytes, {
    kind,
    lang,
    results,
    uuid: () => '01234567-89ab-4cde-8f01-23456789abcd',
  })
  if (!result.ok) throw new Error(`${result.reason}: ${result.detail}`)
  const reopened = await openEpub(result.bytes)
  if (!reopened.ok) throw new Error(reopened.detail)
  const entries = await readEntries(result.bytes)
  const c1 = utf8(entries.find((e) => e.name === C1)!.bytes)
  return { c1, report: result.report, book: reopened.book }
}

const body = (chapter: string): string =>
  chapter.slice(chapter.indexOf('<body>') + 6, chapter.indexOf('</body>')).trim()

const count = (text: string, re: RegExp): number => text.match(re)?.length ?? 0

function ids(text: string): string[] {
  return [...text.matchAll(/\s(?:xml:)?id\s*=\s*("[^"]*"|'[^']*')/g)].map((m) => m[1]!)
}

const span = (dir = ''): string =>
  `<br/><span class="${EPUB_TRANSLATION_CLASS}" lang="en" xml:lang="en"${dir}>`

describe('bilingual book: structural text blocks', () => {
  it('appends the translation inside td, th, figcaption, dt and dd', async () => {
    const { c1, report } = await translate(await buildEpub(files()), 'bilingual')
    expect(body(c1)).toBe(
      `<table id="t"><tr><th id="h1">Name${span()}NAME</span></th><th>Age${span()}AGE</span></th></tr>\n` +
        `<tr><td id="d1">Anna <a id="r1" href="#h1">note</a>${span()}ANNA <a href="#h1">NOTE</a></span></td>` +
        `<td>ten${span()}TEN</span></td></tr></table>\n` +
        `<figure><img src="i.png" alt=""/><figcaption id="cap">A <em>picture</em>${span()}A <em>PICTURE</em></span></figcaption></figure>\n` +
        `<dl><dt id="term">Word${span()}WORD</span></dt><dd>Meaning <span id="m"/>${span()}MEANING <span/></span></dd></dl>\n` +
        '<p id="para">Plain text.</p>\n' +
        `<p lang="en" xml:lang="en" class="${EPUB_TRANSLATION_CLASS}">PLAIN TEXT.</p>`,
    )
    expect(report.translatedBlocks).toBe(8)
  })

  it('keeps the table, figure and list structure, ids unique, and reopens', async () => {
    const original = await buildEpub(files())
    const { c1, book } = await translate(original, 'bilingual')
    const before = body(xhtml('One', BODY))
    for (const re of [/<tr\b/g, /<td\b/g, /<th\b/g, /<figcaption\b/g, /<dt\b/g, /<dd\b/g]) {
      expect(count(body(c1), re), String(re)).toBe(count(before, re))
    }
    expect(count(body(c1), /<p\b/g)).toBe(2)
    expect(checkWellFormed(c1).ok).toBe(true)
    const all = ids(c1)
    expect(new Set(all).size).toBe(all.length)
    expect(all).toEqual(ids(xhtml('One', BODY)))
    // the reopened chapter still maps to the same structural blocks
    const map = openChapter((await book.readText(C1))!.text)
    expect(map.broken).toBe(false)
    if (map.broken) return
    expect(map.blocks.map((b) => b.kind)).toEqual([
      'th',
      'th',
      'td',
      'td',
      'figcaption',
      'dt',
      'dd',
      'p',
      'p',
    ])
  })

  it('marks the span dir="rtl" for arabic and dir="ltr" out of a right-to-left chapter', async () => {
    const ar = await translate(
      await buildEpub(files('<table><tr><td>Cell</td></tr></table>')),
      'bilingual',
      'ar',
    )
    expect(body(ar.c1)).toBe(
      `<table><tr><td>Cell<br/><span class="${EPUB_TRANSLATION_CLASS}" lang="ar" xml:lang="ar" dir="rtl">CELL</span></td></tr></table>`,
    )
    const fromRtl = await translate(
      await buildEpub(files('<dl><dt>كلمة</dt><dd dir="rtl">معنى</dd></dl>', 'dir="rtl" ')),
      'bilingual',
    )
    expect(body(fromRtl.c1)).toBe(
      `<dl><dt>كلمة${span(' dir="ltr"')}كلمة</span></dt><dd dir="rtl">معنى${span(' dir="ltr"')}معنى</span></dd></dl>`,
    )
  })

  it('the translated book still replaces their content in place', async () => {
    const { c1 } = await translate(await buildEpub(files()), 'translated')
    expect(body(c1)).toContain('<td id="d1">ANNA <a id="r1" href="#h1">NOTE</a></td>')
    expect(body(c1)).toContain('<figcaption id="cap">A <em>PICTURE</em></figcaption>')
    expect(c1).not.toContain(EPUB_TRANSLATION_CLASS)
  })
})

describe('bilingual book: list items', () => {
  it('keeps the item count of an ordered list and puts the translation inside each item', async () => {
    const list = '<ol id="l"><li id="i1">First</li><li>Second <em>one</em></li></ol>'
    const { c1 } = await translate(await buildEpub(files(list)), 'bilingual')
    const out = body(c1)
    expect(count(out, /<li[\s>]/g)).toBe(2)
    expect(out).toContain(`<li id="i1">First${span()}FIRST</span></li>`)
    expect(new Set(ids(out)).size).toBe(ids(out).length)
    expect(checkWellFormed(c1).ok).toBe(true)
  })
})
