import { describe, expect, it } from 'vitest'
import { openChapter, type ChapterBlock, type OpenChapter } from '../src/blocks'
import {
  blockNotation,
  blockPlainText,
  checkNotation,
  escapeNotationText,
  newBlockNotationToXhtml,
  notationToXhtml,
  type BlockNotation,
} from '../src/notation'
import { chapter } from './chapter-helpers'

function firstBlock(body: string): { map: OpenChapter; block: ChapterBlock } {
  const map = openChapter(chapter(body))
  if (map.broken) throw new Error(map.error)
  return { map, block: map.blocks[0]! }
}

function notationOf(body: string, dropRuby = false): BlockNotation & { inner: string } {
  const { map, block } = firstBlock(body)
  return {
    ...blockNotation(map, block, { dropRuby }),
    inner: map.source.slice(block.inner.start, block.inner.end),
  }
}

function decoded(text: string, n: BlockNotation): string {
  const result = notationToXhtml(text, n.context)
  if (!result.ok) throw new Error(result.error)
  return result.xhtml
}

const RICH =
  '<p>One <strong>bold</strong> and <em>it</em> and <b>b</b> <i>i</i><br/>line ' +
  '<a  href=\'#x\'   class="y">link <span>deep</span></a> <img src="a.png" alt=""/> ' +
  '&amp; &lt;tag&gt;</p>'

describe('blockNotation (encode)', () => {
  it('writes bold, italic and line breaks, numbers other inline elements and escapes text', () => {
    expect(notationOf(RICH).text).toBe(
      'One <b>bold</b> and <i>it</i> and <b>b</b> <i>i</i><br/>line ' +
        '<x1>link <x2>deep</x2></x1> <x3/> &amp; &lt;tag&gt;',
    )
  })

  it('keeps formatting elements that carry attributes as placeholders', () => {
    expect(
      notationOf('<p><strong class="c">x</strong><em xml:lang="fr">y</em><br class="z"/></p>').text,
    ).toBe('<x1>x</x1><x2>y</x2><x3/>')
  })

  it('writes opaque elements and elements without text or children as empty placeholders', () => {
    expect(
      notationOf('<p>x<math><mi>y</mi></math><span id="a"><!-- c --></span><span></span></p>').text,
    ).toBe('x<x1/><x2/><x3/>')
  })

  it('drops comments and processing instructions, reads CDATA as text, keeps whitespace', () => {
    expect(notationOf('<p>\n  a<!-- c -->b<![CDATA[<d> & e]]>\n</p>').text).toBe(
      '\n  ab&lt;d&gt; &amp; e\n',
    )
  })

  it('can leave out ruby readings', () => {
    const body = '<p><ruby>漢<rp>(</rp><rt>kan</rt><rp>)</rp></ruby>字</p>'
    expect(notationOf(body).text).toBe('<x1>漢<x2>(</x2><x3>kan</x3><x4>)</x4></x1>字')
    expect(notationOf(body, true).text).toBe('<x1>漢</x1>字')
  })

  it('gives the plain text that edit offsets count (opaque content excluded)', () => {
    const { map, block } = firstBlock(
      '<p>a&amp;<b>b</b><br/><math><mi>m</mi></math><a href="#">c</a></p>',
    )
    expect(blockPlainText(map, block)).toBe('a&bc')
  })
})

describe('notationToXhtml (decode)', () => {
  it('round-trips the original inner XHTML exactly', () => {
    const n = notationOf(RICH)
    expect(decoded(n.text, n)).toBe(n.inner)
  })

  it('restores every placeholder to its original tag and attributes', () => {
    const n = notationOf(RICH)
    expect(decoded('Un <x1>lien <x2>profond</x2></x1><x3/>', n)).toBe(
      'Un <a  href=\'#x\'   class="y">lien <span>profond</span></a><img src="a.png" alt=""/>',
    )
  })

  it('restores empty placeholders verbatim, comments included', () => {
    const n = notationOf('<p>x<math><mi>y</mi></math><span id="a"><!-- c --></span></p>')
    expect(decoded('<x2/>z<x1/>', n)).toBe('<span id="a"><!-- c --></span>z<math><mi>y</mi></math>')
  })

  it('keeps the original formatting tags while their number is unchanged', () => {
    const n = notationOf('<p><b>a</b> <em>b</em> <strong>c</strong></p>')
    expect(decoded('<b>A</b> <i>B</i> <b>C</b>', n)).toBe('<b>A</b> <em>B</em> <strong>C</strong>')
  })

  it('writes strong and em once bold or italic is added or removed', () => {
    const n = notationOf('<p><b>a</b> <i>b</i></p>')
    expect(decoded('<b>A</b> <b>new</b> B', n)).toBe('<strong>A</strong> <strong>new</strong> B')
  })

  it('accepts lenient text: a bare ampersand or a less-than sign that starts no tag', () => {
    const n = notationOf('<p>x</p>')
    expect(decoded('Tom & Jerry < 3 &quot;q&quot; &#65;', n)).toBe('Tom &amp; Jerry &lt; 3 "q" A')
  })

  it('accepts <br> and <br /> as line breaks', () => {
    const n = notationOf('<p>x</p>')
    expect(decoded('a<br>b<br />c', n)).toBe('a<br/>b<br/>c')
  })

  it('drops the ruby readings when decoding a notation written without them', () => {
    const n = notationOf('<p><ruby class="r">漢<rt>kan</rt></ruby>字</p>', true)
    expect(decoded('<x1>Chinese</x1> character', n)).toBe(
      '<ruby class="r">Chinese</ruby> character',
    )
  })
})

describe('checkNotation (placeholder check)', () => {
  const n = notationOf(RICH)

  it.each([
    ['a missing placeholder', 'x <x1>link</x1> <x3/>'],
    ['a duplicated placeholder', '<x1>a <x2>b</x2></x1> <x1>c</x1> <x3/>'],
    ['an unknown placeholder', '<x1>a <x2>b</x2></x1> <x3/> <x4/>'],
    ['an empty placeholder written with content', '<x1>a <x2>b</x2></x1> <x3>img</x3>'],
    ['a placeholder with content written empty', '<x1/> <x2/> <x3/>'],
    ['an unclosed placeholder', '<x1>a <x2>b</x2> <x3/>'],
    ['a stray closing tag', '<x1>a <x2>b</x2></x1></x2> <x3/>'],
    ['misnested tags', '<x1>a <b><x2>b</x2></x1></b> <x3/>'],
    ['an unknown tag', '<x1>a <x2>b</x2></x1> <x3/> <p>x</p>'],
    ['an unclosed bold', '<x1>a <x2>b</x2></x1> <x3/> <b>x'],
  ])('rejects %s', (_label, text) => {
    const check = checkNotation(text, n.context)
    expect(check.ok).toBe(false)
    expect(notationToXhtml(text, n.context).ok).toBe(false)
  })

  it('accepts placeholders that keep kind and count, in any order', () => {
    expect(checkNotation('<x3/> <x2>b</x2> then <x1></x1>', n.context)).toEqual({ ok: true })
  })
})

describe('newBlockNotationToXhtml', () => {
  it('writes only strong, em and br', () => {
    expect(newBlockNotationToXhtml('a <b>b</b> <i>c</i><br/>d &amp; e')).toEqual({
      ok: true,
      xhtml: 'a <strong>b</strong> <em>c</em><br/>d &amp; e',
    })
  })

  it('rejects placeholders', () => {
    expect(newBlockNotationToXhtml('a <x1>b</x1>').ok).toBe(false)
    expect(newBlockNotationToXhtml('a <x1/>').ok).toBe(false)
  })
})

describe('escapeNotationText', () => {
  it('escapes &, < and >', () => {
    expect(escapeNotationText('a & <b> c')).toBe('a &amp; &lt;b&gt; c')
  })
})
