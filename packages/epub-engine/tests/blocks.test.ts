import { describe, expect, it } from 'vitest'
import { openChapter, type ChapterBlock, type OpenChapter } from '../src/blocks'
import { chapter } from './chapter-helpers'

function open(source: string): OpenChapter {
  const map = openChapter(source)
  if (map.broken) throw new Error(`unexpected broken chapter: ${map.error}`)
  return map
}

function inner(map: OpenChapter, block: ChapterBlock): string {
  return map.source.slice(block.inner.start, block.inner.end)
}

describe('openChapter: editable blocks', () => {
  it('maps every editable kind with its tag, attributes, flow and inner range', () => {
    const src = chapter(`
<h1 id="top">Title</h1>
<p class="a">One <a href="#x">link</a></p>
<ul><li>Item</li></ul>
<blockquote>Quoted <i>words</i></blockquote>
<table><tr><th>H</th><td>D</td></tr></table>
<figure><img src="i.png" alt=""/><figcaption>Cap</figcaption></figure>
<dl><dt>T</dt><dd>Def</dd></dl>
<div class="note">Just text</div>`)
    const map = open(src)
    expect(map.blocks.map((b) => [b.id, b.kind, b.flowing])).toEqual([
      ['b1', 'h1', true],
      ['b2', 'p', true],
      ['b3', 'li', true],
      ['b4', 'blockquote', true],
      ['b5', 'th', false],
      ['b6', 'td', false],
      ['b7', 'figcaption', false],
      ['b8', 'dt', false],
      ['b9', 'dd', false],
      ['b10', 'div', true],
    ])
    const [h1, p] = map.blocks
    expect(h1!.attributes).toEqual([{ name: 'id', value: 'top' }])
    expect(inner(map, p!)).toBe('One <a href="#x">link</a>')
    expect(src.slice(p!.outer.start, p!.outer.end)).toBe(
      '<p class="a">One <a href="#x">link</a></p>',
    )
    expect(p!.tag).toBe('p')
  })

  it('does not treat mixed containers as blocks, but finds the blocks inside them', () => {
    const map = open(
      chapter(`
<ul><li>Text <ul><li>Nested</li></ul></li></ul>
<div><p>In div</p></div>
<blockquote><p>Quoted para</p></blockquote>
<table><tr><td><p>Cell para</p></td></tr></table>
<dl><dd><p>Def para</p></dd></dl>`),
    )
    expect(map.blocks.map((b) => [b.kind, inner(map, b), b.flowing])).toEqual([
      ['li', 'Nested', true],
      ['p', 'In div', true],
      ['p', 'Quoted para', true],
      ['p', 'Cell para', true],
      ['p', 'Def para', true],
    ])
  })

  it('keeps a whitespace-only, an empty and a self-closing paragraph as blocks', () => {
    const map = open(chapter('<p>   </p><p></p><p class="x"/>'))
    expect(map.blocks.map((b) => [b.kind, inner(map, b)])).toEqual([
      ['p', '   '],
      ['p', ''],
      ['p', ''],
    ])
    const selfClosing = map.blocks[2]!
    expect(selfClosing.selfClosing).toBe(true)
    expect(selfClosing.inner.start).toBe(selfClosing.inner.end)
  })

  it('needs text in a div, but not in a paragraph', () => {
    const map = open(
      chapter('<div><img src="a.png" alt=""/></div><div>  </div><p><img src="b.png" alt=""/></p>'),
    )
    expect(map.blocks.map((b) => b.kind)).toEqual(['p'])
  })

  it('treats entities, comments and CDATA inside a block as inline content', () => {
    const map = open(chapter('<p>a &amp; b<!-- c --><![CDATA[ <d> ]]></p>'))
    expect(map.blocks).toHaveLength(1)
    expect(inner(map, map.blocks[0]!)).toBe('a &amp; b<!-- c --><![CDATA[ <d> ]]>')
  })

  it('ignores the head and anything inside svg or math', () => {
    const map = open(
      chapter(
        '<p>a</p><svg xmlns="http://www.w3.org/2000/svg"><foreignObject><p>in svg</p></foreignObject></svg>',
        '<title>T</title>',
      ),
    )
    expect(map.blocks.map((b) => inner(map, b))).toEqual(['a'])
  })

  it('keeps the qualified tag name and the local kind for a prefixed XHTML element', () => {
    const map = open(
      '<h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:body><h:p>x</h:p></h:body></h:html>',
    )
    expect(map.blocks.map((b) => [b.kind, b.tag])).toEqual([['p', 'h:p']])
  })

  it('reports a chapter that is not well-formed as broken, without blocks', () => {
    const map = openChapter('<html><body><p>a<br>b</p></body></html>')
    expect(map.broken).toBe(true)
    expect('blocks' in map).toBe(false)
  })
})
