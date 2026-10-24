/**
 * Fixtures for the translation tests: a book with a nav and an NCX, ruby,
 * formatting and placeholders, a broken chapter and a fixed-layout chapter,
 * and a fake model that answers the EPUB translation request.
 */
import { openEpub } from '../src/open'
import type { EpubBook } from '../src/types'
import { buildEpub, opf, xhtml } from './helpers'

export interface TranslateBookOptions {
  /** dc:language elements; default ['fr'] */
  languages?: string[]
  /** replaces the first chapter's body */
  chapterOneBody?: string
}

export const CHAPTER_ONE_BODY =
  '<h1>Chapter <em>One</em></h1>\n' +
  '<p>The <ruby>漢<rt>かん</rt></ruby> sign &amp; <b>bold</b> text.</p>\n' +
  '<p>Read <a href="c4.xhtml">the end</a><img src="i.png" alt=""/></p>\n' +
  '<p>Same line.</p>\n' +
  '<p>Same line.</p>\n' +
  '<p>2026</p>\n' +
  '<p><img src="only.png" alt=""/></p>'

export function translateBookFiles(o: TranslateBookOptions = {}): Record<string, string> {
  const languages = o.languages ?? ['fr']
  return {
    'OEBPS/content.opf': opf({
      metadata: [
        '<dc:identifier id="uid">urn:uuid:11111111-2222-3333-4444-555555555555</dc:identifier>',
        '<dc:title>A Tale &amp; More</dc:title>',
        '<dc:title>Chapter One</dc:title>',
        ...languages.map((l) => `<dc:language>${l}</dc:language>`),
        '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>',
      ].join('\n'),
      manifest: [
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
        '<item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="c3" href="text/c3.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="c4" href="text/c4.xhtml" media-type="application/xhtml+xml"/>',
      ].join('\n'),
      spine: [
        '<itemref idref="c1"/>',
        '<itemref idref="c2"/>',
        '<itemref idref="c3" properties="rendition:layout-pre-paginated"/>',
        '<itemref idref="c4"/>',
      ].join('\n'),
      spineAttrs: 'toc="ncx"',
    }),
    'OEBPS/nav.xhtml': xhtml(
      'Contents',
      '<nav epub:type="toc"><ol>\n' +
        '<li><a href="text/c1.xhtml">Chapter <ruby>One<rt>1</rt></ruby></a></li>\n' +
        '<li><a href="text/c4.xhtml">The   End</a></li>\n' +
        '<li><a href="text/c2.xhtml">II</a></li>\n' +
        '</ol></nav>',
    ),
    'OEBPS/toc.ncx':
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n' +
      '<head/><docTitle><text>A Tale</text></docTitle>\n<navMap>\n' +
      '<navPoint id="n1"><navLabel><text>Chapter One</text></navLabel><content src="text/c1.xhtml"/></navPoint>\n' +
      '<navPoint id="n2"><navLabel><text>Last &amp; Least</text></navLabel><content src="text/c4.xhtml"/></navPoint>\n' +
      '</navMap>\n</ncx>\n',
    'OEBPS/text/c1.xhtml': xhtml('One', o.chapterOneBody ?? CHAPTER_ONE_BODY),
    'OEBPS/text/c2.xhtml': xhtml('Two', '<p>Broken <b>chapter</p>'),
    'OEBPS/text/c3.xhtml': xhtml('Three', '<p>Fixed layout page.</p>'),
    'OEBPS/text/c4.xhtml': xhtml('Four', '<h2>The end</h2>\n<p>Same line.</p>'),
  }
}

export async function translateBookBytes(o: TranslateBookOptions = {}): Promise<Uint8Array> {
  return buildEpub(translateBookFiles(o))
}

export async function openTranslateBook(o: TranslateBookOptions = {}): Promise<EpubBook> {
  const result = await openEpub(await translateBookBytes(o))
  if (!result.ok) throw new Error(`${result.reason}: ${result.detail}`)
  return result.book
}

/** the blocks of a translation request, read back from its JSON data section */
export function requestBlocks(prompt: string): { id: string; text: string }[] {
  const start = prompt.indexOf('<document_blocks>')
  const end = prompt.indexOf('</document_blocks>')
  if (start < 0 || end < 0) throw new Error('no document_blocks section')
  const data = JSON.parse(prompt.slice(start + '<document_blocks>'.length, end)) as {
    blocks: { id: string; text: string }[]
  }
  return data.blocks
}

/** a model answer translating each block with `translate` */
export function answerWith(
  blocks: readonly { id: string; text: string }[],
  translate: (text: string, id: string) => string | undefined,
): string {
  const translations = blocks.flatMap((b) => {
    const text = translate(b.text, b.id)
    return text === undefined ? [] : [{ id: b.id, text }]
  })
  return JSON.stringify({ translations })
}

/** uppercase the text outside tags and entities, keeping every tag */
export function shout(notation: string): string {
  return notation.replace(/(<[^>]*>|&[a-z]+;)|([^<&]+)/g, (_m, tag: string, text: string) =>
    tag !== undefined ? tag : text.toUpperCase(),
  )
}

/** an error shaped like ai-provider's AiRunError */
export class FakeRunError extends Error {
  constructor(
    readonly kind: string,
    readonly resetsAt?: number,
  ) {
    super(`fake run error: ${kind}`)
  }
}
