import { describe, expect, it } from 'vitest'
import { openChapter, type OpenChapter } from '../src/blocks'
import { applyBlockEdit, applyBlockEdits, type BlockEdit } from '../src/edits'
import { blockNotation } from '../src/notation'
import { applyReplacements } from '../src/ranges'
import { checkWellFormed } from '../src/xml-positions'
import { chapter } from './chapter-helpers'

function open(source: string): OpenChapter {
  const map = openChapter(source)
  if (map.broken) throw new Error(map.error)
  return map
}

function edit(map: OpenChapter, e: BlockEdit) {
  const result = applyBlockEdit(map, e)
  if (!result.ok) throw new Error(`${result.refusal.code}: ${result.refusal.message}`)
  // The replacements alone must turn the old source into the new one.
  expect(applyReplacements(map.source, result.replacements)).toBe(result.map.source)
  expect(checkWellFormed(result.map.source)).toEqual({ ok: true })
  return result
}

function body(source: string): string {
  return source.slice(source.indexOf('<body>') + 6, source.indexOf('</body>'))
}

function refused(map: OpenChapter, e: BlockEdit): string {
  const result = applyBlockEdit(map, e)
  if (result.ok) throw new Error('expected a refusal')
  return result.refusal.code
}

describe('replace', () => {
  const src = chapter('<p class="a">Hello <a href="#x">link</a></p><p>Other</p>')

  it('rewrites only the inner range and keeps the id and inline markup', () => {
    const map = open(src)
    const result = edit(map, { op: 'replace', blockId: 'b1', text: 'Bonjour <x1>lien</x1>' })
    expect(body(result.map.source)).toBe(
      '<p class="a">Bonjour <a href="#x">lien</a></p><p>Other</p>',
    )
    expect(result.replacements).toEqual([
      {
        start: map.blocks[0]!.inner.start,
        end: map.blocks[0]!.inner.end,
        text: 'Bonjour <a href="#x">lien</a>',
      },
    ])
    expect(result.map.blocks.map((b) => b.id)).toEqual(['b1', 'b2'])
    expect(result.created).toEqual([])
  })

  it('makes no replacement when the notation is unchanged', () => {
    const map = open(chapter('<p>a &#169; <!-- c --> b</p>'))
    const text = blockNotation(map, map.blocks[0]!).text
    const result = edit(map, { op: 'replace', blockId: 'b1', text })
    expect(result.replacements).toEqual([])
    expect(result.map.source).toBe(map.source)
  })

  it('refuses a notation whose placeholders do not match', () => {
    expect(refused(open(src), { op: 'replace', blockId: 'b1', text: 'Bonjour lien' })).toBe(
      'invalid-notation',
    )
  })

  it('refuses an unknown block id', () => {
    expect(refused(open(src), { op: 'replace', blockId: 'b9', text: 'x' })).toBe('unknown-block')
  })

  it('writes into a self-closing block', () => {
    const result = edit(open(chapter('<p class="x"/>')), {
      op: 'replace',
      blockId: 'b1',
      text: 'Hi',
    })
    expect(body(result.map.source)).toBe('<p class="x">Hi</p>')
    expect(result.map.blocks[0]!.id).toBe('b1')
  })

  it('edits structural text blocks', () => {
    const result = edit(open(chapter('<table><tr><td>a</td></tr></table>')), {
      op: 'replace',
      blockId: 'b1',
      text: 'b<br/>c',
    })
    expect(body(result.map.source)).toBe('<table><tr><td>b<br/>c</td></tr></table>')
  })

  it('can decode a notation written without ruby readings', () => {
    const map = open(chapter('<p><ruby>漢<rt>kan</rt></ruby>字</p>'))
    const result = edit(map, {
      op: 'replace',
      blockId: 'b1',
      text: '<x1>Han</x1> ji',
      dropRuby: true,
    })
    expect(body(result.map.source)).toBe('<p><ruby>Han</ruby> ji</p>')
  })
})

describe('split', () => {
  it('splits into two blocks with the same tag and attributes minus id, reopening inline elements', () => {
    const map = open(
      chapter('\n  <p id="a" class="c">Hello <a id="l" href="#">link</a> world</p>\n  <p>next</p>'),
    )
    const result = edit(map, { op: 'split', blockId: 'b1', offset: 8 })
    expect(body(result.map.source)).toBe(
      '\n  <p id="a" class="c">Hello <a id="l" href="#">li</a></p>' +
        '\n  <p class="c"><a href="#">nk</a> world</p>\n  <p>next</p>',
    )
    expect(result.map.blocks.map((b) => b.id)).toEqual(['b1', 'b3', 'b2'])
    expect(result.created).toEqual(['b3'])
  })

  it('leaves an empty second block when splitting at the end, and an empty first at the start', () => {
    const map = open(chapter('<p class="c">ab<a href="#">cd</a></p>'))
    expect(body(edit(map, { op: 'split', blockId: 'b1', offset: 4 }).map.source)).toBe(
      '<p class="c">ab<a href="#">cd</a></p><p class="c"></p>',
    )
    expect(body(edit(map, { op: 'split', blockId: 'b1', offset: 0 }).map.source)).toBe(
      '<p class="c"></p><p class="c">ab<a href="#">cd</a></p>',
    )
  })

  it('splits before a line break that sits at the offset', () => {
    const map = open(chapter('<p>a<br/>b</p>'))
    expect(body(edit(map, { op: 'split', blockId: 'b1', offset: 1 }).map.source)).toBe(
      '<p>a</p><p><br/>b</p>',
    )
  })

  it('splits between entities and inside CDATA without breaking them', () => {
    const map = open(chapter('<p>a&amp;b<![CDATA[cd]]></p>'))
    expect(body(edit(map, { op: 'split', blockId: 'b1', offset: 2 }).map.source)).toBe(
      '<p>a&amp;</p><p>b<![CDATA[cd]]></p>',
    )
    expect(body(edit(map, { op: 'split', blockId: 'b1', offset: 4 }).map.source)).toBe(
      '<p>a&amp;b<![CDATA[c]]></p><p><![CDATA[d]]></p>',
    )
  })

  it('splits a self-closing block', () => {
    const map = open(chapter('<p class="x"/>'))
    expect(body(edit(map, { op: 'split', blockId: 'b1', offset: 0 }).map.source)).toBe(
      '<p class="x"></p><p class="x"></p>',
    )
  })

  it('refuses structural text blocks and offsets outside the text', () => {
    const map = open(chapter('<p>ab</p><table><tr><td>a</td></tr></table>'))
    expect(refused(map, { op: 'split', blockId: 'b2', offset: 0 })).toBe('not-flowing')
    expect(refused(map, { op: 'split', blockId: 'b1', offset: 3 })).toBe('bad-offset')
    expect(refused(map, { op: 'split', blockId: 'b1', offset: -1 })).toBe('bad-offset')
  })
})

describe('line_break', () => {
  it('inserts a br in a structural text block', () => {
    const map = open(chapter('<dl><dt>ab</dt></dl>'))
    expect(body(edit(map, { op: 'line_break', blockId: 'b1', offset: 1 }).map.source)).toBe(
      '<dl><dt>a<br/>b</dt></dl>',
    )
  })
})

describe('merge', () => {
  it('merges with the next block; the first keeps its id, the second leaves an id span', () => {
    const map = open(chapter('<p id="a">One</p>\n<p id="b" class="x">Two <i>2</i></p>\n<p>3</p>'))
    const result = edit(map, { op: 'merge', blockId: 'b1', with: 'next' })
    expect(body(result.map.source)).toBe(
      '<p id="a">One<span id="b"></span>Two <i>2</i></p>\n<p>3</p>',
    )
    expect(result.map.blocks.map((b) => b.id)).toEqual(['b1', 'b3'])
  })

  it('merges with the previous block, writing the first block end tag', () => {
    const map = open(chapter('<h2>Head</h2> <p>tail</p>'))
    const result = edit(map, { op: 'merge', blockId: 'b2', with: 'previous' })
    expect(body(result.map.source)).toBe('<h2>Headtail</h2>')
    expect(result.map.blocks.map((b) => b.id)).toEqual(['b1'])
  })

  it('merges self-closing blocks', () => {
    const map = open(chapter('<p class="a"/><p id="z"/>'))
    expect(body(edit(map, { op: 'merge', blockId: 'b1', with: 'next' }).map.source)).toBe(
      '<p class="a"><span id="z"></span></p>',
    )
  })

  it('refuses blocks that are not neighbours under the same parent, or not flowing', () => {
    const map = open(
      chapter(
        '<div><p>a</p></div><p>b</p><hr/><p>c</p><table><tr><td>d</td><td>e</td></tr></table><p>f</p>',
      ),
    )
    expect(refused(map, { op: 'merge', blockId: 'b1', with: 'next' })).toBe('no-neighbour')
    expect(refused(map, { op: 'merge', blockId: 'b2', with: 'next' })).toBe('no-neighbour')
    expect(refused(map, { op: 'merge', blockId: 'b1', with: 'previous' })).toBe('no-neighbour')
    expect(refused(map, { op: 'merge', blockId: 'b4', with: 'next' })).toBe('not-flowing')
    expect(refused(map, { op: 'merge', blockId: 'b6', with: 'previous' })).toBe('no-neighbour')
  })

  it('refuses when text or a comment sits between the blocks', () => {
    const map = open(chapter('<div><p>a</p>text<p>b</p><!-- c --><p>d</p></div>'))
    expect(refused(map, { op: 'merge', blockId: 'b1', with: 'next' })).toBe('no-neighbour')
    expect(refused(map, { op: 'merge', blockId: 'b2', with: 'next' })).toBe('no-neighbour')
  })
})

describe('insert_after', () => {
  it('inserts a block with the same tag and attributes minus id, on its own line', () => {
    const map = open(chapter('\n  <p class="c" id="a">x</p>\n  <p>y</p>'))
    const result = edit(map, {
      op: 'insert_after',
      blockId: 'b1',
      text: 'new <b>bold</b> &amp; <i>it</i>',
    })
    expect(body(result.map.source)).toBe(
      '\n  <p class="c" id="a">x</p>\n  <p class="c">new <strong>bold</strong> &amp; <em>it</em></p>\n  <p>y</p>',
    )
    expect(result.map.blocks.map((b) => b.id)).toEqual(['b1', 'b3', 'b2'])
    expect(result.created).toEqual(['b3'])
  })

  it('refuses placeholders and structural text blocks', () => {
    const map = open(chapter('<p>x</p><table><tr><td>a</td></tr></table>'))
    expect(refused(map, { op: 'insert_after', blockId: 'b1', text: '<x1/>' })).toBe(
      'invalid-notation',
    )
    expect(refused(map, { op: 'insert_after', blockId: 'b2', text: 'a' })).toBe('not-flowing')
  })
})

describe('delete', () => {
  it('removes a block without an id together with its leading whitespace', () => {
    const map = open(chapter('\n<p>a</p>\n<p>b</p>\n<p>c</p>\n'))
    const result = edit(map, { op: 'delete', blockId: 'b2' })
    expect(body(result.map.source)).toBe('\n<p>a</p>\n<p>c</p>\n')
    expect(result.map.blocks.map((b) => b.id)).toEqual(['b1', 'b3'])
  })

  it('leaves the id as an empty span at the end of the previous flowing sibling', () => {
    const map = open(chapter('<p>a</p><img src="i.png" alt=""/><p id="t">b</p>'))
    expect(body(edit(map, { op: 'delete', blockId: 'b2' }).map.source)).toBe(
      '<p>a<span id="t"></span></p><img src="i.png" alt=""/>',
    )
  })

  it('uses the next flowing sibling when there is no previous one', () => {
    const map = open(chapter('<div><h1 id="t">a</h1><p>b</p></div>'))
    expect(body(edit(map, { op: 'delete', blockId: 'b1' }).map.source)).toBe(
      '<div><p><span id="t"></span>b</p></div>',
    )
  })

  it('refuses to delete an id-bearing block with no flowing sibling', () => {
    const map = open(chapter('<div><p id="t">a</p></div><p>b</p>'))
    expect(refused(map, { op: 'delete', blockId: 'b1' })).toBe('no-anchor-host')
  })

  it('refuses structural text blocks', () => {
    const map = open(chapter('<table><tr><td>a</td></tr></table>'))
    expect(refused(map, { op: 'delete', blockId: 'b1' })).toBe('not-flowing')
  })
})

describe('toggle_mark', () => {
  it('turns bold on with strong and off again', () => {
    const map = open(chapter('<p>Hello world</p>'))
    const on = edit(map, { op: 'toggle_mark', blockId: 'b1', mark: 'bold', start: 0, end: 5 })
    expect(body(on.map.source)).toBe('<p><strong>Hello</strong> world</p>')
    const off = edit(on.map, { op: 'toggle_mark', blockId: 'b1', mark: 'bold', start: 0, end: 5 })
    expect(body(off.map.source)).toBe('<p>Hello world</p>')
  })

  it('turns part of an existing b off, keeping the b element for the rest', () => {
    const map = open(chapter('<p><b>Hello</b> world</p>'))
    const off = edit(map, { op: 'toggle_mark', blockId: 'b1', mark: 'bold', start: 1, end: 3 })
    expect(body(off.map.source)).toBe('<p><b>H</b>el<b>lo</b> world</p>')
  })

  it('extends an adjacent bold element instead of adding a second one', () => {
    const map = open(chapter('<p><b>Hel</b>lo world</p>'))
    const on = edit(map, { op: 'toggle_mark', blockId: 'b1', mark: 'bold', start: 0, end: 5 })
    expect(body(on.map.source)).toBe('<p><b>Hello</b> world</p>')
  })

  it('wraps across inline elements without splitting them', () => {
    const map = open(chapter('<p>ab<a href="#">cd</a>ef</p>'))
    const on = edit(map, { op: 'toggle_mark', blockId: 'b1', mark: 'bold', start: 1, end: 5 })
    expect(body(on.map.source)).toBe('<p>a<strong>b<a href="#">cd</a>e</strong>f</p>')
  })

  it('puts the mark inside an inline element when only part of it is covered', () => {
    const map = open(chapter('<p>ab<a href="#">cd</a>ef</p>'))
    const on = edit(map, { op: 'toggle_mark', blockId: 'b1', mark: 'italic', start: 1, end: 3 })
    expect(body(on.map.source)).toBe('<p>a<em>b</em><a href="#"><em>c</em>d</a>ef</p>')
  })

  it('keeps marks that were inside an inline element inside it', () => {
    const map = open(chapter('<p><a href="#"><b>cd</b></a> ef</p>'))
    const on = edit(map, { op: 'toggle_mark', blockId: 'b1', mark: 'italic', start: 3, end: 5 })
    expect(body(on.map.source)).toBe('<p><a href="#"><b>cd</b></a> <em>ef</em></p>')
  })

  it('keeps the original nesting of bold and italic', () => {
    const map = open(chapter('<p><i><b>abc</b></i></p>'))
    const off = edit(map, { op: 'toggle_mark', blockId: 'b1', mark: 'bold', start: 2, end: 3 })
    expect(body(off.map.source)).toBe('<p><i><b>ab</b>c</i></p>')
  })

  it('treats italic from em and i alike, and never removes CSS styling', () => {
    const map = open(chapter('<p><em>ab</em><i>cd</i><span style="font-weight:bold">ef</span></p>'))
    const off = edit(map, { op: 'toggle_mark', blockId: 'b1', mark: 'italic', start: 0, end: 4 })
    expect(body(off.map.source)).toBe('<p>abcd<span style="font-weight:bold">ef</span></p>')
    const on = edit(map, { op: 'toggle_mark', blockId: 'b1', mark: 'bold', start: 4, end: 6 })
    expect(body(on.map.source)).toBe(
      '<p><em>ab</em><i>cd</i><span style="font-weight:bold"><strong>ef</strong></span></p>',
    )
    const back = edit(on.map, { op: 'toggle_mark', blockId: 'b1', mark: 'bold', start: 4, end: 6 })
    expect(body(back.map.source)).toBe(body(map.source))
  })

  it('does nothing for an empty range and refuses a range outside the text', () => {
    const map = open(chapter('<p>ab</p>'))
    expect(
      edit(map, { op: 'toggle_mark', blockId: 'b1', mark: 'bold', start: 1, end: 1 }).replacements,
    ).toEqual([])
    expect(refused(map, { op: 'toggle_mark', blockId: 'b1', mark: 'bold', start: 0, end: 3 })).toBe(
      'bad-offset',
    )
  })

  it('never splits a surrogate pair', () => {
    const map = open(chapter('<p>a😀b</p>'))
    const on = edit(map, { op: 'toggle_mark', blockId: 'b1', mark: 'bold', start: 2, end: 3 })
    expect(body(on.map.source)).toBe('<p>a<strong>😀</strong>b</p>')
  })
})

describe('applyBlockEdits', () => {
  const src = chapter(
    '\r\n<p id="a">One</p>\r\n<p>Two &amp; two</p>\r\n<p id="c">Three</p>\r\n<p>Four</p>\r\n',
  )

  it('applies a batch and returns one replacement list against the original', () => {
    const map = open(src)
    const result = applyBlockEdits(map, [
      { op: 'replace', blockId: 'b1', text: 'Uno' },
      { op: 'insert_after', blockId: 'b1', text: 'Half' },
      { op: 'replace', blockId: 'b2', text: 'Dos &amp; dos' },
      { op: 'delete', blockId: 'b3' },
    ])
    if (!result.ok) throw new Error(result.refusal.message)
    expect(body(result.map.source)).toBe(
      '\r\n<p id="a">Uno</p>\r\n<p>Half</p>\r\n<p>Dos &amp; dos<span id="c"></span></p>\r\n<p>Four</p>\r\n',
    )
    expect(applyReplacements(src, result.replacements)).toBe(result.map.source)
    expect(result.created).toEqual(['b5'])
    expect(result.map.blocks.map((b) => b.id)).toEqual(['b1', 'b5', 'b2', 'b4'])
  })

  it('rejects the whole batch when one edit is refused', () => {
    const map = open(src)
    const result = applyBlockEdits(map, [
      { op: 'replace', blockId: 'b1', text: 'Uno' },
      { op: 'replace', blockId: 'b9', text: 'x' },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.index).toBe(1)
  })
})

describe('unchanged ranges stay byte-identical', () => {
  const src =
    '﻿<?xml version="1.0" encoding="utf-8"?>\r\n' +
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">\r\n' +
    '<html xmlns="http://www.w3.org/1999/xhtml">\r\n<head><title>T &amp; t</title></head>\r\n<body>\r\n' +
    '  <!-- keep <me> -->\r\n' +
    "  <h1   class='t'>Title&nbsp;😀</h1>\r\n" +
    '  <p>First <span class="s">span</span> &#169;</p>\r\n' +
    '  <p id="second">Second</p>\r\n' +
    '  <p><![CDATA[Third <raw>]]></p>\r\n' +
    '  <table><tr><td>Cell</td></tr></table>\r\n' +
    '</body>\r\n</html>\r\n'

  const edits: BlockEdit[] = [
    { op: 'replace', blockId: 'b2', text: 'Premier <x1>span</x1> ©' },
    { op: 'split', blockId: 'b3', offset: 3 },
    { op: 'merge', blockId: 'b2', with: 'next' },
    { op: 'insert_after', blockId: 'b4', text: 'Inserted' },
    { op: 'delete', blockId: 'b3' },
    { op: 'toggle_mark', blockId: 'b1', mark: 'bold', start: 0, end: 5 },
    { op: 'line_break', blockId: 'b5', offset: 2 },
  ]

  it.each(edits.map((e) => [e.op, e] as const))('%s touches only its block', (_op, e) => {
    const map = open(src)
    const result = edit(map, e)
    expect(result.replacements.length).toBeGreaterThan(0)
    // Every block not involved in the edit keeps its exact bytes.
    const involved = new Set([e.blockId])
    if (e.op === 'merge') involved.add(e.with === 'next' ? 'b3' : 'b1')
    if (e.op === 'delete') involved.add('b2')
    for (const block of map.blocks) {
      if (involved.has(block.id)) continue
      const after = result.map.blocks.find((b) => b.id === block.id)!
      expect(result.map.source.slice(after.outer.start, after.outer.end)).toBe(
        map.source.slice(block.outer.start, block.outer.end),
      )
    }
    // Every replacement lies inside the involved blocks (with their leading whitespace).
    const touched = map.blocks.filter((b) => involved.has(b.id))
    const hullStart = Math.min(...touched.map((b) => b.outer.start)) - 4
    const hullEnd = Math.max(...touched.map((b) => b.outer.end))
    for (const r of result.replacements) {
      expect(r.start).toBeGreaterThanOrEqual(hullStart)
      expect(r.end).toBeLessThanOrEqual(hullEnd)
    }
    const first = Math.min(...result.replacements.map((r) => r.start))
    const last = Math.max(...result.replacements.map((r) => r.end))
    const tail = map.source.length - last
    expect(result.map.source.slice(0, first)).toBe(map.source.slice(0, first))
    expect(result.map.source.slice(result.map.source.length - tail)).toBe(map.source.slice(last))
  })
})
