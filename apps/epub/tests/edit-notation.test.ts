/**
 * Reading an edited block back for the engine: the roles of the drawn
 * inline elements, the notation the screen sends, what the engine writes
 * from it (original inline elements kept, only strong, em and br new), plain
 * text offsets, and find and replace inside one block. Also the shortcut map.
 */
import { describe, expect, it } from 'vitest'
import {
  blockNotation,
  blockPlainText,
  notationToXhtml,
  openChapter,
  type ChapterBlock,
  type OpenChapter,
} from '@genoffice/epub-engine'
import { buildChapterHtml } from '../src/renderer/reader/chapter-html'
import {
  domNotation,
  domPlainText,
  inlineRoleTree,
  offsetAt,
  pairRoles,
  pointAt,
  type RoleMap,
} from '../src/renderer/edit/inline-roles'
import {
  blockMatches,
  blockReadingText,
  plainOffsetAtSource,
  replacedNotation,
} from '../src/renderer/edit/block-text'
import { belongsToField, shortcutOf } from '../src/renderer/edit/shortcuts'
import { xhtml } from './helpers/book'

const BODY =
  '<p id="p1">Hello <a href="#n1" class="ref">link</a> and <span class="c">span</span> <b>bold</b><br/>end <ruby>漢<rt>かん</rt></ruby></p>\n' +
  '<p>Second <i>it</i> and <em class="x">styled</em><a id="anchor"/></p>\n' +
  '<table><tr><td>Cell <strong>text</strong></td></tr></table>'

interface Drawn {
  map: OpenChapter
  block: ChapterBlock
  el: Element
  roles: RoleMap
  placeholders: ReturnType<typeof inlineRoleTree>['placeholders']
}

function drawn(body: string, index: number): Drawn {
  const source = xhtml('T', body)
  const map = openChapter(source)
  if (map.broken) throw new Error('broken')
  const html = buildChapterHtml({
    source,
    broken: false,
    blocks: map.blocks,
    baseUrl: 'epub-asset://t/OEBPS/c.xhtml',
  })
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const block = map.blocks[index]!
  const el = doc.querySelector(`[data-epub-block="${block.id}"]`)!
  const tree = inlineRoleTree(block)
  const roles: RoleMap = new Map()
  expect(pairRoles(tree.nodes, el, roles)).toBe(true)
  return { map, block, el, roles, placeholders: tree.placeholders }
}

/** The inner XHTML the engine writes for a notation of the block. */
function engineXhtml(d: Drawn, text: string): string {
  const decoded = notationToXhtml(text, blockNotation(d.map, d.block).context)
  if (!decoded.ok) throw new Error(decoded.error)
  return decoded.xhtml
}

function textNode(el: Element, contains: string): Text {
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* text */)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if ((n as Text).data.includes(contains)) return n as Text
  }
  throw new Error(`no text "${contains}"`)
}

/** Every start tag in `xhtml` that is not one of `original`'s start tags. */
function newTags(original: string, xhtml: string): string[] {
  const known = new Set(original.match(/<[A-Za-z][^>]*>/g) ?? [])
  return (xhtml.match(/<[A-Za-z][^>]*>/g) ?? []).filter((tag) => !known.has(tag))
}

describe('reading a drawn block back', () => {
  it('gives the engine its own notation when nothing changed', () => {
    for (const index of [0, 1, 2]) {
      const d = drawn(BODY, index)
      const own = blockNotation(d.map, d.block).text
      expect(domNotation(d.el, d.roles, d.placeholders)).toBe(own)
      expect(replacedNotation(d.block, [])).toBe(own)
      expect(domPlainText(d.el, d.roles)).toBe(blockPlainText(d.map, d.block))
    }
  })

  it('keeps every original inline element, tags and attributes as written, around typed text', () => {
    const d = drawn(BODY, 0)
    const hello = textNode(d.el, 'Hello')
    hello.data = 'Hello there, '
    textNode(d.el, 'link').data = 'the link'
    const text = domNotation(d.el, d.roles, d.placeholders)
    expect(text).toBe(
      'Hello there, <x1>the link</x1> and <x2>span</x2> <b>bold</b><br/>end <x3>漢<x4>かん</x4></x3>',
    )
    const out = engineXhtml(d, text)
    expect(out).toBe(
      'Hello there, <a href="#n1" class="ref">the link</a> and <span class="c">span</span> <b>bold</b><br/>end <ruby>漢<rt>かん</rt></ruby>',
    )
    const inner = d.map.source.slice(d.block.inner.start, d.block.inner.end)
    expect(newTags(inner, out)).toEqual([])
  })

  it('turns marks the browser made into strong and em only, and unwraps anything else', () => {
    const d = drawn(BODY, 1)
    const doc = d.el.ownerDocument
    const second = textNode(d.el, 'Second')
    // the browser's own bold, a styled span and a font element around typed text
    const b = doc.createElement('b')
    b.textContent = 'New'
    const span = doc.createElement('span')
    span.setAttribute('style', 'font-weight: bold')
    span.textContent = ' plain'
    const font = doc.createElement('font')
    const i = doc.createElement('i')
    i.textContent = 'slanted'
    font.append(i)
    d.el.insertBefore(b, second)
    d.el.insertBefore(span, second)
    d.el.insertBefore(font, second)
    const text = domNotation(d.el, d.roles, d.placeholders)
    expect(text).toBe('<b>New</b> plain<i>slanted</i>Second <i>it</i> and <x1>styled</x1><x2/>')
    const out = engineXhtml(d, text)
    const inner = d.map.source.slice(d.block.inner.start, d.block.inner.end)
    // with more italics than before the engine writes every italic anew; still only em
    expect(new Set(newTags(inner, out))).toEqual(new Set(['<strong>', '<em>']))
    expect(out).toContain('<em class="x">styled</em>')
    expect(out).toContain('<a id="anchor"/>')
    expect(out).not.toContain('style=')
    expect(out).not.toContain('font')
  })

  it('writes a typed line break as br, and drops the empty-line filler the browser keeps at the end', () => {
    const d = drawn('<p>One two</p>', 0)
    const doc = d.el.ownerDocument
    const one = textNode(d.el, 'One')
    one.data = 'One'
    d.el.append(doc.createElement('br'), doc.createTextNode('two'), doc.createElement('br'))
    expect(domNotation(d.el, d.roles, d.placeholders)).toBe('One<br/>two')
  })

  it('puts a link the user deleted whole back, empty, where the caret is', () => {
    const d = drawn(BODY, 0)
    const link = d.el.querySelector('a')!
    const before = link.previousSibling as Text
    link.remove()
    const text = domNotation(d.el, d.roles, d.placeholders, {
      caret: { node: before, offset: before.data.length },
    })
    expect(text.startsWith('Hello <x1></x1> and <x2>span</x2>')).toBe(true)
    expect(engineXhtml(d, text)).toContain('Hello <a href="#n1" class="ref"></a> and')
  })

  it('turns the no-break spaces the browser types into spaces when the block had none', () => {
    const d = drawn('<p>One</p>', 0)
    textNode(d.el, 'One').data = 'One\u00a0two\u00a0'
    expect(domNotation(d.el, d.roles, d.placeholders, { nbspToSpace: true })).toBe('One two ')
    expect(domNotation(d.el, d.roles, d.placeholders)).toBe('One\u00a0two\u00a0')
  })

  it('does not pair a drawing that lost an element of its source', () => {
    const d = drawn(BODY, 0)
    d.el.querySelector('span')!.remove()
    const roles: RoleMap = new Map()
    expect(pairRoles(inlineRoleTree(d.block).nodes, d.el, roles)).toBe(false)
  })

  it('counts offsets as the engine does and finds the point of an offset again', () => {
    const d = drawn(BODY, 0)
    const plain = blockPlainText(d.map, d.block)
    expect(plain).toBe('Hello link and span boldend 漢かん')
    const end = textNode(d.el, 'end')
    expect(offsetAt(d.el, d.roles, end, 0)).toBe(plain.indexOf('end'))
    const linkText = textNode(d.el, 'link')
    expect(offsetAt(d.el, d.roles, linkText, 2)).toBe(plain.indexOf('link') + 2)
    expect(offsetAt(d.el, d.roles, d.el, d.el.childNodes.length)).toBe(plain.length)
    const at = pointAt(d.el, d.roles, plain.indexOf('end'))
    expect(offsetAt(d.el, d.roles, at.node, at.offset)).toBe(plain.indexOf('end'))
    // after a line break: the point is behind it, at the start of the next text
    const after = pointAt(d.el, d.roles, plain.indexOf('end'), true)
    expect(after.node).toBe(end)
    expect(after.offset).toBe(0)
  })
})

describe('find and replace inside a block', () => {
  it('matches across inline elements, never across blocks, ignoring case and collapsing spaces', () => {
    const d = drawn(BODY, 0)
    const plain = blockPlainText(d.map, d.block)
    expect(blockMatches(d.block, 'LO   LI')).toEqual([
      { start: plain.indexOf('lo li'), end: plain.indexOf('lo li') + 5 },
    ])
    // the second paragraph is another block: "it and" never meets "end" of the first
    expect(blockMatches(d.block, 'and styled')).toEqual([])
    // ruby readings are not read, as in the in-book search
    expect(blockReadingText(d.block).text.endsWith('end 漢')).toBe(true)
  })

  it('swaps only the matched characters and keeps the elements they were in', () => {
    const d = drawn(BODY, 0)
    const matches = blockMatches(d.block, 'lo li')
    const text = replacedNotation(
      d.block,
      matches.map((m) => ({ ...m, text: 'XY' })),
    )
    expect(text.startsWith('HelXY<x1>nk</x1> and')).toBe(true)
    const all = replacedNotation(d.block, [
      { ...blockMatches(d.block, 'span')[0]!, text: 'S&<' },
      { ...blockMatches(d.block, 'link')[0]!, text: '' },
    ])
    expect(all).toContain('<x1></x1> and <x2>S&amp;&lt;</x2>')
    expect(engineXhtml(d, all)).toContain(
      '<a href="#n1" class="ref"></a> and <span class="c">S&amp;&lt;</span>',
    )
  })

  it('finds the plain offset of a source position (where the caret goes after an undo)', () => {
    const d = drawn(BODY, 0)
    const at = d.map.source.indexOf('and', d.block.inner.start)
    expect(plainOffsetAtSource(d.block, at)).toBe(blockPlainText(d.map, d.block).indexOf('and'))
  })
})

describe('shortcuts', () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
    ({
      key: k,
      code: '',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      ...mods,
    }) as KeyboardEvent

  it('maps the editing keys, Ctrl and Cmd alike', () => {
    expect(shortcutOf(key('z'))).toBe('undo')
    expect(shortcutOf(key('Z', { shiftKey: true }))).toBe('redo')
    expect(shortcutOf(key('y'))).toBe('redo')
    expect(shortcutOf(key('f'))).toBe('find')
    expect(shortcutOf(key('h'))).toBe('replace')
    expect(shortcutOf(key('s'))).toBe('save')
    expect(shortcutOf(key('S', { shiftKey: true }))).toBe('saveAs')
    expect(shortcutOf(key('b'))).toBe('bold')
    expect(shortcutOf(key('i'))).toBe('italic')
    expect(shortcutOf(key('z', { ctrlKey: false, metaKey: true }))).toBe('undo')
    // a Korean layout reports the jamo; the physical key decides
    expect(shortcutOf(key('ㅋ', { code: 'KeyZ' }))).toBe('undo')
    expect(shortcutOf(key('z', { ctrlKey: false }))).toBeNull()
    expect(shortcutOf(key('z', { altKey: true }))).toBeNull()
    expect(shortcutOf(key('k'))).toBeNull()
  })

  it('leaves undo and marks to a text field of the page', () => {
    const input = document.createElement('textarea')
    expect(belongsToField('undo', input)).toBe(true)
    expect(belongsToField('bold', input)).toBe(true)
    expect(belongsToField('save', input)).toBe(false)
    expect(belongsToField('undo', document.createElement('button'))).toBe(false)
  })
})
