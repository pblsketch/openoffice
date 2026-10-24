import { describe, expect, it } from 'vitest'
import { extractChapterText } from '../src/text'
import { chapter } from './chapter-helpers'

describe('extractChapterText', () => {
  it('gives the text in reading order with # headings by level', () => {
    const src = chapter(
      `
  <h1>Book <i>One</i></h1>
  <section>
    <h2 class="c">Chapter
      1</h2>
    <p>First   paragraph,
       with <a href="#n">a link</a>.</p>
    <p>Line<br/>break &amp; more</p>
    <ul><li>One</li><li>Two</li></ul>
    <h6>Small</h6>
    <table><tr><th>A</th><td>B</td></tr></table>
    <p><ruby>漢<rp>(</rp><rt>kan</rt><rp>)</rp></ruby>字</p>
    <script>ignored()</script>
  </section>`,
      '<title>Not this</title><style>p{}</style>',
    )
    expect(extractChapterText(src)).toBe(
      [
        '# Book One',
        '## Chapter 1',
        'First paragraph, with a link.',
        'Line\nbreak & more',
        'One',
        'Two',
        '###### Small',
        'A\tB',
        '漢字',
      ].join('\n\n'),
    )
  })

  it('keeps the line structure of pre', () => {
    const src = chapter('<pre>a  b\n  c</pre><p>d</p>')
    expect(extractChapterText(src)).toBe('a  b\n  c\n\nd')
  })

  it('reads CDATA as text', () => {
    expect(extractChapterText(chapter('<p><![CDATA[x < y]]></p>'))).toBe('x < y')
  })

  it('falls back to an HTML parser for a chapter that is not well-formed', () => {
    const src =
      '<html><head><title>t</title></head><body><h2>T</h2><p>a<br>b &copy; c<p>next</body></html>'
    expect(extractChapterText(src)).toBe('## T\n\na\nb © c\n\nnext')
  })

  it('returns an empty string for a chapter without text', () => {
    expect(extractChapterText(chapter('<div><img src="a.png" alt="x"/></div>'))).toBe('')
  })
})
