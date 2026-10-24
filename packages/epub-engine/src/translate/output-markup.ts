/**
 * Small source-level helpers for building a translated book: reading and
 * rewriting one start tag as written, removing ids from a markup fragment,
 * and walking the position-tracking tree. Everything works on the source
 * text, so what is not rewritten keeps its exact characters.
 */
import type { RangeReplacement } from '../ranges'
import type { XmlElement } from '../xml-positions'

export interface StartTagAttribute {
  name: string
  /** the attribute as written, with the whitespace before it */
  raw: string
  /** the value as written between the quotes (references not resolved) */
  value: string
}

export interface StartTag {
  name: string
  attributes: StartTagAttribute[]
  /** what follows the last attribute: optional whitespace, then `>` or `/>` */
  tail: string
}

const TAG_NAME = /<([^\s/>]+)/y
const ATTRIBUTE = /\s+([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y
const TAG_CLOSE = /\s*\/?>/y

/**
 * Reads the start tag that begins at `at` (a `<` followed by a name).
 * Attribute values are always quoted in XML, so the attributes are read in
 * sequence and a `>` inside a value is never taken for the tag's end.
 */
export function readStartTag(markup: string, at = 0): { tag: StartTag; end: number } | null {
  TAG_NAME.lastIndex = at
  const name = TAG_NAME.exec(markup)
  if (!name) return null
  let i = TAG_NAME.lastIndex
  const attributes: StartTagAttribute[] = []
  for (;;) {
    ATTRIBUTE.lastIndex = i
    const m = ATTRIBUTE.exec(markup)
    if (!m) break
    attributes.push({ name: m[1]!, raw: m[0], value: m[2] ?? m[3] ?? '' })
    i = ATTRIBUTE.lastIndex
  }
  TAG_CLOSE.lastIndex = i
  const close = TAG_CLOSE.exec(markup)
  if (!close) return null
  return { tag: { name: name[1]!, attributes, tail: close[0] }, end: TAG_CLOSE.lastIndex }
}

export function writeStartTag(tag: StartTag): string {
  return `<${tag.name}${tag.attributes.map((a) => a.raw).join('')}${tag.tail}`
}

/** `&`, `<` and `"` escaped for a double-quoted attribute value. */
export function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

export function tagAttribute(tag: StartTag, name: string): string | undefined {
  return tag.attributes.find((a) => a.name === name)?.value
}

/**
 * Sets an attribute to an already escaped value: in place when the tag has
 * it (keeping the whitespace before it), else added after the last one.
 */
export function setTagAttribute(tag: StartTag, name: string, escaped: string): void {
  const existing = tag.attributes.find((a) => a.name === name)
  if (existing) {
    const lead = /^\s+/.exec(existing.raw)![0]
    existing.raw = `${lead}${name}="${escaped}"`
    existing.value = escaped
    return
  }
  tag.attributes.push({ name, raw: ` ${name}="${escaped}"`, value: escaped })
}

export function removeTagAttributes(tag: StartTag, names: ReadonlySet<string>): void {
  tag.attributes = tag.attributes.filter((a) => !names.has(a.name))
}

export const ID_ATTRIBUTES: ReadonlySet<string> = new Set(['id', 'xml:id'])

/**
 * The markup fragment with every `id` and `xml:id` attribute removed from
 * its start tags. Comments, CDATA sections, processing instructions and end
 * tags are copied as they are; text never holds a literal `<`.
 */
export function removeIds(markup: string): string {
  let out = ''
  let i = 0
  const skipTo = (from: number, terminator: string): number => {
    const at = markup.indexOf(terminator, from)
    return at < 0 ? markup.length : at + terminator.length
  }
  while (i < markup.length) {
    const lt = markup.indexOf('<', i)
    if (lt < 0) {
      out += markup.slice(i)
      break
    }
    out += markup.slice(i, lt)
    let end: number
    if (markup.startsWith('<!--', lt)) end = skipTo(lt + 4, '-->')
    else if (markup.startsWith('<![CDATA[', lt)) end = skipTo(lt + 9, ']]>')
    else if (markup.startsWith('<?', lt)) end = skipTo(lt + 2, '?>')
    else if (markup.startsWith('</', lt) || markup.startsWith('<!', lt)) end = skipTo(lt + 2, '>')
    else {
      const read = readStartTag(markup, lt)
      if (read) {
        removeTagAttributes(read.tag, ID_ATTRIBUTES)
        out += writeStartTag(read.tag)
        i = read.end
        continue
      }
      end = lt + 1
    }
    out += markup.slice(lt, end)
    i = end
  }
  return out
}

// ---------------------------------------------------------------------------
// The position-tracking tree

export const childElements = (el: XmlElement): XmlElement[] =>
  el.children.filter((c): c is XmlElement => c.type === 'element')

/** Depth-first, document order, including `el` itself. */
export function* walkElements(el: XmlElement): Generator<XmlElement> {
  yield el
  for (const child of childElements(el)) yield* walkElements(child)
}

export const attributeOf = (el: XmlElement, name: string): string | undefined =>
  el.attributes.find((a) => a.name === name)?.value

export const localIs = (el: XmlElement, local: string): boolean => el.local.toLowerCase() === local

/** `dc:` for `dc:title`, '' for an unprefixed name. */
export function prefixOf(name: string): string {
  const colon = name.indexOf(':')
  return colon < 0 ? '' : name.slice(0, colon + 1)
}

/** The namespace a prefix ('' for the default) is bound to at `el`, or null. */
export function namespaceOf(el: XmlElement, prefix: string): string | null {
  const name = prefix === '' ? 'xmlns' : `xmlns:${prefix}`
  for (let e: XmlElement | null = el; e; e = e.parent) {
    const value = attributeOf(e, name)
    if (value !== undefined) return value === '' ? null : value
  }
  return null
}

/** All descendant text, leaving out elements named in `skip` (by lower-case local name). */
export function elementText(el: XmlElement, skip: ReadonlySet<string>): string {
  let out = ''
  for (const child of el.children) {
    if (child.type === 'text') out += child.value
    else if (child.type === 'element' && !skip.has(child.local.toLowerCase())) {
      out += elementText(child, skip)
    }
  }
  return out
}

/** Offset of the start of the whitespace run that ends at `offset`. */
export function whitespaceStart(source: string, offset: number): number {
  let i = offset
  while (i > 0 && /[ \t\r\n]/.test(source[i - 1]!)) i--
  return i
}

/** The start tag of `el` rewritten by `change`, as one replacement. */
export function startTagReplacement(
  source: string,
  el: XmlElement,
  change: (tag: StartTag) => void,
): RangeReplacement | null {
  const end = el.selfClosing ? el.end : el.startTagEnd
  const read = readStartTag(source.slice(el.start, end))
  if (!read) return null
  change(read.tag)
  return { start: el.start, end, text: writeStartTag(read.tag) }
}

/**
 * The replacements that make `el`'s content `escaped`: the content range, or
 * the whole element when it is self-closing.
 */
export function elementTextReplacement(
  source: string,
  el: XmlElement,
  escaped: string,
): RangeReplacement {
  if (!el.selfClosing) return { start: el.startTagEnd, end: el.endTagStart, text: escaped }
  const read = readStartTag(source.slice(el.start, el.end))!
  read.tag.tail = read.tag.tail.replace(/\s*\/>$/, '>')
  return { start: el.start, end: el.end, text: `${writeStartTag(read.tag)}${escaped}</${el.name}>` }
}

/**
 * Inserts `markup` right after `el`: on a line of its own with `el`'s
 * indentation and line end when `el` starts its line, else directly after it.
 */
export function insertionAfter(source: string, el: XmlElement, markup: string): RangeReplacement {
  const lineStart = source.lastIndexOf('\n', el.start - 1) + 1
  const indent = source.slice(lineStart, el.start)
  if (lineStart === 0 || /\S/.test(indent)) return { start: el.end, end: el.end, text: markup }
  const newline = source[lineStart - 2] === '\r' ? '\r\n' : '\n'
  return { start: el.end, end: el.end, text: `${newline}${indent}${markup}` }
}
