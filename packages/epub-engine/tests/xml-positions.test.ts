import { describe, expect, it } from 'vitest'
import {
  checkWellFormed,
  parseXml,
  textRawOffset,
  type XmlDocument,
  type XmlElement,
  type XmlNode,
  type XmlText,
} from '../src/xml-positions'

function parsed(source: string): XmlDocument {
  const result = parseXml(source)
  if (!result.ok) throw new Error(`expected well-formed XML: ${result.error}`)
  return result.doc
}

function elements(node: XmlNode, out: XmlElement[] = []): XmlElement[] {
  if (node.type === 'element') {
    out.push(node)
    for (const child of node.children) elements(child, out)
  }
  return out
}

function texts(node: XmlNode, out: XmlText[] = []): XmlText[] {
  if (node.type === 'text') out.push(node)
  if (node.type === 'element') for (const child of node.children) texts(child, out)
  return out
}

function byName(doc: XmlDocument, name: string): XmlElement[] {
  return elements(doc.root).filter((el) => el.name === name)
}

/** Every element's recorded ranges must slice its own markup out of the source string. */
function expectRangesSliceMarkup(source: string, doc: XmlDocument): void {
  for (const el of elements(doc.root)) {
    const startTag = source.slice(el.start, el.startTagEnd)
    expect(startTag.startsWith(`<${el.name}`)).toBe(true)
    expect(startTag.endsWith('>')).toBe(true)
    if (el.selfClosing) {
      expect(startTag.endsWith('/>')).toBe(true)
      expect(el.endTagStart).toBe(el.end)
      expect(el.startTagEnd).toBe(el.end)
    } else {
      expect(source.slice(el.endTagStart, el.end)).toMatch(new RegExp(`^</${el.name}\\s*>$`))
    }
  }
}

describe('saxes positions are JS string (UTF-16) offsets', () => {
  it('maps plain markup', () => {
    const src = '<html><body><p class="a">Hi <b>there</b></p></body></html>'
    const doc = parsed(src)
    expectRangesSliceMarkup(src, doc)
    const [p] = byName(doc, 'p')
    expect(src.slice(p!.startTagEnd, p!.endTagStart)).toBe('Hi <b>there</b>')
  })

  it('counts a surrogate pair as two code units', () => {
    const src = '<r><p>😀𝔸</p><p a="😀">x</p>😀<q/></r>'
    const doc = parsed(src)
    expectRangesSliceMarkup(src, doc)
    const [first, second] = byName(doc, 'p')
    expect(src.slice(first!.startTagEnd, first!.endTagStart)).toBe('😀𝔸')
    expect(second!.attributes).toEqual([{ name: 'a', value: '😀' }])
    const [q] = byName(doc, 'q')
    expect(q!.start).toBe(src.indexOf('<q/>'))
  })

  it('counts CRLF as two code units and normalizes it in decoded text', () => {
    const src = '<r>\r\n<p>a\r\nb\rc</p>\r\n<p\r\n class="x"\r\n>d</p>\r\n</r>'
    const doc = parsed(src)
    expectRangesSliceMarkup(src, doc)
    const [first] = byName(doc, 'p')
    const [text] = texts(first!)
    expect(text!.value).toBe('a\nb\nc')
    expect(src.slice(text!.start, text!.end)).toBe('a\r\nb\rc')
  })

  it('keeps the BOM as offset 0', () => {
    const src = '﻿<?xml version="1.0"?>\n<r><p>x</p></r>'
    const doc = parsed(src)
    expectRangesSliceMarkup(src, doc)
    expect(doc.root.start).toBe(src.indexOf('<r>'))
  })

  it('handles a doctype, comments, processing instructions and CDATA', () => {
    const src = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">',
      '<!-- top <comment> -->',
      '<html><body>',
      '<p>a<!-- in <p> --><?pi data?>b<![CDATA[<![CDATA[ x < y & ]]>c</p>',
      '</body></html>',
    ].join('\n')
    const doc = parsed(src)
    expectRangesSliceMarkup(src, doc)
    expect(doc.hasDoctype).toBe(true)
    const [p] = byName(doc, 'p')
    const kinds = p!.children.map((c) => c.type)
    expect(kinds).toEqual(['text', 'comment', 'pi', 'text', 'text', 'text'])
    const comment = p!.children[1]!
    expect(src.slice(comment.start, comment.end)).toBe('<!-- in <p> -->')
    const pi = p!.children[2]!
    expect(src.slice(pi.start, pi.end)).toBe('<?pi data?>')
    const cdata = p!.children[4] as XmlText
    expect(cdata.cdata).toBe(true)
    expect(src.slice(cdata.start, cdata.end)).toBe('<![CDATA[<![CDATA[ x < y & ]]>')
    expect(cdata.value).toBe('<![CDATA[ x < y & ')
  })

  it('decodes entities in text and attributes while keeping raw ranges', () => {
    const src = '<r><p t="a&amp;b&#x41;">x &amp; y &lt;z&gt; &#169;&#x1F600;</p></r>'
    const doc = parsed(src)
    expectRangesSliceMarkup(src, doc)
    const [p] = byName(doc, 'p')
    expect(p!.attributes).toEqual([{ name: 't', value: 'a&bA' }])
    const [text] = texts(p!)
    expect(text!.value).toBe('x & y <z> ©😀')
    expect(src.slice(text!.start, text!.end)).toBe('x &amp; y &lt;z&gt; &#169;&#x1F600;')
  })

  it('handles end tags with trailing whitespace and self-closing tags with spaces', () => {
    const src = '<r><p >a<br /><img src="x" alt=">"/></p ></r>'
    const doc = parsed(src)
    expectRangesSliceMarkup(src, doc)
    const [img] = byName(doc, 'img')
    expect(src.slice(img!.start, img!.end)).toBe('<img src="x" alt=">"/>')
  })

  it('keeps qualified names and their local part', () => {
    const src =
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><p epub:type="x"><m:math xmlns:m="http://www.w3.org/1998/Math/MathML"/></p></body></html>'
    const doc = parsed(src)
    const math = elements(doc.root).find((el) => el.local === 'math')!
    expect(math.name).toBe('m:math')
    expect(byName(doc, 'p')[0]!.attributes[0]).toEqual({ name: 'epub:type', value: 'x' })
  })
})

describe('HTML named entities', () => {
  it('resolves HTML named entities when the chapter has a doctype', () => {
    const src = '<!DOCTYPE html>\n<html><body><p t="&eacute;">a&nbsp;b&mdash;c</p></body></html>'
    const doc = parsed(src)
    const [p] = byName(doc, 'p')
    expect(texts(p!)[0]!.value).toBe('a b—c')
    expect(p!.attributes[0]!.value).toBe('é')
  })

  it('treats an HTML named entity without a doctype as not well-formed', () => {
    expect(parseXml('<html><body><p>a&nbsp;b</p></body></html>').ok).toBe(false)
  })

  it('rejects an unknown entity even with a doctype', () => {
    expect(parseXml('<!DOCTYPE html><html><p>&notanentityname;</p></html>').ok).toBe(false)
  })
})

describe('not well-formed XML', () => {
  it.each([
    ['mismatched tags', '<r><p>a</b></r>'],
    ['unclosed element', '<r><p>a</r>'],
    ['bare ampersand', '<r><p>a & b</p></r>'],
    ['unquoted attribute', '<r><p class=x>a</p></r>'],
    ['two roots', '<r/><r/>'],
    ['empty', ''],
    ['HTML void tag', '<html><body><p>a<br>b</p></body></html>'],
  ])('reports %s', (_label, src) => {
    const result = parseXml(src)
    expect(result.ok).toBe(false)
    expect(checkWellFormed(src).ok).toBe(false)
  })

  it('accepts a well-formed chapter in checkWellFormed', () => {
    expect(checkWellFormed('<html><body><p>a</p></body></html>')).toEqual({ ok: true })
  })
})

describe('textRawOffset', () => {
  it('maps decoded offsets back to source offsets across entities and CRLF', () => {
    const src = '<r><p>a&amp;b\r\nc&#x1F600;d</p></r>'
    const doc = parsed(src)
    const [text] = texts(byName(doc, 'p')[0]!)
    expect(text!.value).toBe('a&b\nc😀d')
    const raw = (k: number) => textRawOffset(doc, text!, k)
    expect(raw(0)).toBe(text!.start)
    expect(src.slice(text!.start, raw(1))).toBe('a')
    expect(src.slice(text!.start, raw(2))).toBe('a&amp;')
    expect(src.slice(text!.start, raw(4))).toBe('a&amp;b\r\n')
    expect(src.slice(text!.start, raw(5))).toBe('a&amp;b\r\nc')
    // Offset 6 would land inside the surrogate pair of one character reference; it moves past it.
    expect(src.slice(text!.start, raw(6))).toBe('a&amp;b\r\nc&#x1F600;')
    expect(src.slice(text!.start, raw(7))).toBe('a&amp;b\r\nc&#x1F600;')
    expect(raw(8)).toBe(text!.end)
  })

  it('never splits a literal surrogate pair', () => {
    const src = '<r><p>a😀b</p></r>'
    const doc = parsed(src)
    const [text] = texts(byName(doc, 'p')[0]!)
    expect(src.slice(text!.start, textRawOffset(doc, text!, 2))).toBe('a😀')
  })

  it('maps offsets inside CDATA', () => {
    const src = '<r><p><![CDATA[a\r\nb]]></p></r>'
    const doc = parsed(src)
    const [text] = texts(byName(doc, 'p')[0]!)
    expect(src.slice(0, textRawOffset(doc, text!, 2))).toBe('<r><p><![CDATA[a\r\n')
    expect(textRawOffset(doc, text!, 0)).toBe(text!.start + 9)
    expect(textRawOffset(doc, text!, 3)).toBe(text!.end - 3)
  })
})
