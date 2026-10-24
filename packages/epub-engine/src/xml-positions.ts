/**
 * A position-tracking XML reader for chapter XHTML.
 *
 * saxes reports `parser.position` as the offset of the next unread UTF-16 code
 * unit of the string it was given (a surrogate pair advances it by two, CRLF by
 * two, a leading BOM by one), so its positions are plain JS string offsets and
 * need no conversion (tests/xml-positions.test.ts proves it). Every markup item
 * (tag, comment, PI, CDATA, doctype) is reported when its closing `>` has been
 * read; its start is the first `<` after the previous item, because character
 * data never contains a literal `<`. Text nodes are the gaps between markup
 * items, decoded here (line ends normalized, references resolved) so that their
 * raw source ranges stay exact.
 */
import { parseFragment } from 'parse5'
import { SaxesParser } from 'saxes'

export interface XmlAttribute {
  name: string
  value: string
}

export interface XmlElement {
  type: 'element'
  /** Qualified name as written (`p`, `epub:switch`). */
  name: string
  /** Part after the prefix (`switch` for `epub:switch`). */
  local: string
  /** Decoded attribute values, in source order. */
  attributes: XmlAttribute[]
  /** Offset of `<` of the start tag. */
  start: number
  /** Offset just after the start tag's `>` (equals `end` for a self-closing tag). */
  startTagEnd: number
  /** Offset of `</` of the end tag (equals `end` for a self-closing tag). */
  endTagStart: number
  /** Offset just after the end tag (or the self-closing tag). */
  end: number
  selfClosing: boolean
  children: XmlNode[]
  parent: XmlElement | null
}

export interface XmlText {
  type: 'text'
  /** Raw source range; for CDATA it includes `<![CDATA[` and `]]>`. */
  start: number
  end: number
  /** Decoded character data. */
  value: string
  cdata: boolean
}

export interface XmlOther {
  type: 'comment' | 'pi'
  start: number
  end: number
}

export type XmlNode = XmlElement | XmlText | XmlOther

export interface XmlDocument {
  source: string
  root: XmlElement
  /** HTML named entities are resolved only when the chapter declares a doctype. */
  hasDoctype: boolean
}

export type XmlParseResult =
  { ok: true; doc: XmlDocument } | { ok: false; error: string; offset: number }

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

const htmlEntityCache = new Map<string, string | undefined>()

/**
 * Resolves an HTML named entity (`nbsp`, `eacute`, …) through parse5's HTML
 * tokenizer. XHTML chapters with an XHTML doctype may use these; readers that
 * render them resolve them the same way.
 */
export function resolveHtmlEntity(name: string): string | undefined {
  if (htmlEntityCache.has(name)) return htmlEntityCache.get(name)
  let value: string | undefined
  if (/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
    const ref = `&${name};`
    const fragment = parseFragment(ref)
    const node = fragment.childNodes[0] as { nodeName: string; value?: string } | undefined
    const decoded = node?.nodeName === '#text' ? node.value : undefined
    // A legacy prefix match (`&notin` read as `&not` + `in;`) leaves the `;` behind.
    if (decoded !== undefined && decoded !== ref && (!decoded.endsWith(';') || name === 'semi')) {
      value = decoded
    }
  }
  htmlEntityCache.set(name, value)
  return value
}

function entityTable(withHtml: boolean): Record<string, string> {
  return new Proxy(Object.create(null) as Record<string, string>, {
    get(_target, key) {
      if (typeof key !== 'string') return undefined
      if (Object.prototype.hasOwnProperty.call(XML_ENTITIES, key)) return XML_ENTITIES[key]
      return withHtml ? resolveHtmlEntity(key) : undefined
    },
  })
}

function resolveReference(ref: string, withHtml: boolean): string {
  if (ref.startsWith('#x') || ref.startsWith('#X')) {
    return String.fromCodePoint(parseInt(ref.slice(2), 16))
  }
  if (ref.startsWith('#')) return String.fromCodePoint(parseInt(ref.slice(1), 10))
  if (Object.prototype.hasOwnProperty.call(XML_ENTITIES, ref)) return XML_ENTITIES[ref]!
  const html = withHtml ? resolveHtmlEntity(ref) : undefined
  // The parser already rejected unknown references; keep the raw text as a fallback.
  return html ?? `&${ref};`
}

const REFERENCE = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[^\s&;<]+);/g

/** Decodes raw character data: line ends become `\n`, references are resolved. */
export function decodeCharacterData(raw: string, withHtml: boolean): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(REFERENCE, (_m, ref: string) => resolveReference(ref, withHtml))
}

function normalizeNewlines(raw: string): string {
  return raw.replace(/\r\n?/g, '\n')
}

function localName(name: string): string {
  const colon = name.indexOf(':')
  return colon < 0 ? name : name.slice(colon + 1)
}

/** Parses one XML document with exact UTF-16 source ranges for every node. */
export function parseXml(source: string): XmlParseResult {
  let error: { error: string; offset: number } | null = null
  const parser = new SaxesParser({ position: true })
  let hasDoctype = false
  parser.ENTITIES = entityTable(false)

  const stack: XmlElement[] = []
  let root: XmlElement | null = null
  let lastEnd = 0
  // Whether a start tag is self-closing is only known from its `/>`.
  let pendingSelfClosing: XmlElement | null = null

  const markupStart = (): number => {
    const at = source.indexOf('<', lastEnd)
    return at < 0 ? lastEnd : at
  }

  const addText = (start: number, end: number): void => {
    const parent = stack[stack.length - 1]
    if (!parent || end <= start) return
    parent.children.push({
      type: 'text',
      start,
      end,
      value: decodeCharacterData(source.slice(start, end), hasDoctype),
      cdata: false,
    })
  }

  /** Records a markup item that ended at the parser's current position (or at `knownEnd`). */
  const markup = (knownEnd?: (start: number) => number): { start: number; end: number } => {
    const start = markupStart()
    addText(lastEnd, start)
    const end = knownEnd ? knownEnd(start) : parser.position
    lastEnd = end
    return { start, end }
  }

  parser.on('error', (err) => {
    if (!error) error = { error: err.message, offset: parser.position }
  })
  parser.on('xmldecl', () => {
    markup()
  })
  parser.on('doctype', () => {
    markup()
    hasDoctype = true
    parser.ENTITIES = entityTable(true)
  })
  parser.on('processinginstruction', () => {
    const { start, end } = markup()
    stack[stack.length - 1]?.children.push({ type: 'pi', start, end })
  })
  parser.on('comment', () => {
    // saxes reports a comment on its closing `--`, before the `>`; `--` cannot occur inside.
    const { start, end } = markup((at) => source.indexOf('-->', at + 4) + 3)
    stack[stack.length - 1]?.children.push({ type: 'comment', start, end })
  })
  parser.on('cdata', () => {
    const { start, end } = markup()
    const parent = stack[stack.length - 1]
    parent?.children.push({
      type: 'text',
      start,
      end,
      value: normalizeNewlines(source.slice(start + 9, end - 3)),
      cdata: true,
    })
  })
  parser.on('opentag', (tag) => {
    const { start, end } = markup()
    const parent = stack[stack.length - 1] ?? null
    const el: XmlElement = {
      type: 'element',
      name: tag.name,
      local: localName(tag.name),
      attributes: Object.entries(tag.attributes as Record<string, string>).map(([name, value]) => ({
        name,
        value,
      })),
      start,
      startTagEnd: end,
      endTagStart: end,
      end,
      selfClosing: tag.isSelfClosing,
      children: [],
      parent,
    }
    if (parent) parent.children.push(el)
    else if (!root) root = el
    stack.push(el)
    pendingSelfClosing = tag.isSelfClosing ? el : null
  })
  parser.on('closetag', () => {
    const el = stack[stack.length - 1]
    if (!el) return
    if (pendingSelfClosing === el) {
      pendingSelfClosing = null
      stack.pop()
      return
    }
    // Text before the end tag belongs to the closing element, so record it before popping.
    const { start, end } = markup()
    stack.pop()
    el.endTagStart = start
    el.end = end
  })

  try {
    parser.write(source).close()
  } catch (err) {
    if (!error) error = { error: (err as Error).message, offset: parser.position }
  }
  if (error) return { ok: false, ...(error as { error: string; offset: number }) }
  if (!root) return { ok: false, error: 'document has no root element', offset: 0 }
  return { ok: true, doc: { source, root, hasDoctype } }
}

/** Re-reads a (possibly edited) chapter and reports whether it is well-formed XML. */
export function checkWellFormed(
  source: string,
): { ok: true } | { ok: false; error: string; offset: number } {
  const result = parseXml(source)
  return result.ok ? { ok: true } : { ok: false, error: result.error, offset: result.offset }
}

/**
 * Source offset at which `k` decoded characters of `text` lie before it. An
 * offset that would fall inside one reference's expansion or between the two
 * halves of a surrogate pair moves forward past it.
 */
export function textRawOffset(doc: XmlDocument, text: XmlText, k: number): number {
  const { source } = doc
  let i = text.cdata ? text.start + 9 : text.start
  const end = text.cdata ? text.end - 3 : text.end
  let count = 0
  while (i < end && count < k) {
    const ch = source.charCodeAt(i)
    if (ch === 0x0d) {
      i += source.charCodeAt(i + 1) === 0x0a ? 2 : 1
      count += 1
    } else if (ch === 0x26 && !text.cdata) {
      const semi = source.indexOf(';', i)
      const ref = source.slice(i + 1, semi)
      count += resolveReference(ref, doc.hasDoctype).length
      i = semi + 1
    } else if (ch >= 0xd800 && ch <= 0xdbff) {
      i += 2
      count += 2
    } else {
      i += 1
      count += 1
    }
  }
  return i
}
