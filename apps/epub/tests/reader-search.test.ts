/**
 * Finding text in the whole book: the reading text of a chapter, the hits
 * across chapters, and mapping a hit back to the drawn chapter.
 */
import { describe, expect, it } from 'vitest'
import { openChapter } from '@genoffice/epub-engine'
import {
  buildTextIndex,
  normalizeQuery,
  rangeOf,
  searchBook,
} from '../src/renderer/reader/book-search'
import { buildChapterHtml } from '../src/renderer/reader/chapter-html'
import { xhtml } from './helpers/book'

const BASE = 'epub-asset://0123abcd/OEBPS/text/one.xhtml'

function drawn(source: string): Document {
  const map = openChapter(source)
  const html = buildChapterHtml({
    source,
    broken: map.broken,
    blocks: map.broken ? [] : map.blocks,
    baseUrl: BASE,
    viewCss: 'html { color: red }',
  })
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('the reading text of a chapter', () => {
  it('collapses white space, separates blocks and leaves out styles and ruby readings', () => {
    const doc = drawn(
      xhtml(
        'One',
        '<h1>Chapter\n   One</h1><p>First   <em>para</em>graph.</p><p><ruby>漢<rt>かん</rt>字<rt>じ</rt></ruby>です</p>',
        '<style>p { color: blue }</style>',
      ),
    )
    expect(buildTextIndex(doc.body).text).toBe('Chapter One First paragraph. 漢字です')
  })

  it('maps a hit back to a DOM range in the drawn chapter', () => {
    const doc = drawn(xhtml('One', '<p>First <em>para</em>graph.</p>\n<p>Second paragraph.</p>'))
    const index = buildTextIndex(doc.body)
    const start = index.text.indexOf('paragraph.')
    const range = rangeOf(doc, index, start, 'paragraph.'.length)
    expect(range?.toString()).toBe('paragraph.')
    const second = index.text.lastIndexOf('paragraph')
    expect(rangeOf(doc, index, second, 9)?.toString()).toBe('paragraph')
    expect(rangeOf(doc, index, index.text.length - 1, 5)).toBeNull()
  })

  it('normalises what was typed the same way', () => {
    expect(normalizeQuery('  first \n  paragraph ')).toBe('first paragraph')
  })
})

describe('searching the book', () => {
  const texts = [
    'The cover',
    null, // could not be read
    'A broken chapter is searched as well: the whale.',
    'Whale, whale and WHALE.',
  ]
  const chapterText = async (i: number) => texts[i] ?? null

  it('finds hits in every chapter, case-insensitively, in spine order', async () => {
    const result = await searchBook({ query: 'whale', chapterCount: texts.length, chapterText })
    expect(result.hits.map((h) => [h.spineIndex, h.start])).toEqual([
      [2, 42],
      [3, 0],
      [3, 7],
      [3, 17],
    ])
    expect(result.hits[1]!.match).toBe('Whale')
    expect(result.hits[0]!.before.endsWith('as well: the ')).toBe(true)
    expect(result.hits[0]!.after).toBe('.')
    expect(result.unreadable).toEqual([1])
    expect(result.truncated).toBe(false)
  })

  it('stops at the limit and says so', async () => {
    const result = await searchBook({
      query: 'whale',
      chapterCount: texts.length,
      chapterText,
      limit: 2,
    })
    expect(result.hits).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })

  it('stops when a newer search takes over', async () => {
    let calls = 0
    const result = await searchBook({
      query: 'whale',
      chapterCount: texts.length,
      chapterText: async (i) => {
        calls++
        return texts[i] ?? null
      },
      isCancelled: () => calls >= 2,
    })
    expect(result.cancelled).toBe(true)
    expect(calls).toBe(2)
  })

  it('finds nothing for an empty query', async () => {
    const result = await searchBook({ query: '   ', chapterCount: 2, chapterText })
    expect(result.hits).toEqual([])
  })

  it('finds a hit of a drawn chapter at the place the frame shows', async () => {
    const source = xhtml('One', '<h1>Moby Dick</h1>\n<p>Call me <b>Ish</b>mael.</p>')
    const result = await searchBook({
      query: 'ishmael',
      chapterCount: 1,
      chapterText: async () => buildTextIndex(drawn(source).body).text,
    })
    expect(result.hits).toHaveLength(1)
    // the frame's own document, read again from the same copy
    const frame = drawn(source)
    const hit = result.hits[0]!
    expect(rangeOf(frame, buildTextIndex(frame.body), hit.start, hit.length)?.toString()).toBe(
      'Ishmael',
    )
  })
})
