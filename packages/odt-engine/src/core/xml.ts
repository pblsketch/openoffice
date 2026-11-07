/**
 * A lenient, position-preserving XML scanner.
 *
 * Nothing here builds a DOM or re-serialises XML. Every token and element is
 * reported as offsets into the ORIGINAL string, so slicing the string by a
 * reported range returns exactly the source text — the same approach as the
 * docx engine's `scanBody`. That is what lets later stages copy untouched
 * parts byte for byte and patch only what changed.
 *
 * Leniency: Hancom ODTs carry schema errors, so the scanner never throws on
 * malformed input. An unclosed element ends where an enclosing element's end
 * tag begins, a stray end tag is skipped, and both are reported as warnings.
 */

export type XmlTokenKind =
  'open' | 'close' | 'empty' | 'text' | 'comment' | 'cdata' | 'pi' | 'doctype'

const LT = 60 // <
const GT = 62 // >
const SLASH = 47 // /
const BANG = 33 // !
const QUESTION = 63 // ?
const DQUOTE = 34
const SQUOTE = 39
const EQUALS = 61

function isSpace(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13
}

/**
 * Token-at-a-time cursor over `xml[from, to)`. Mutable fields describe the
 * current token after each successful `next()`; allocation-free so that a
 * 10+ MB content.xml scans quickly.
 */
export class XmlScanner {
  kind: XmlTokenKind = 'text'
  /** first character of the token */
  start = 0
  /** one past the token's last character */
  end = 0
  /** element or processing-instruction name as written (tags and PIs only) */
  name = ''
  /** one past the end of the name inside the tag (attribute scanning starts here) */
  nameEnd = 0
  private pos: number

  constructor(
    readonly xml: string,
    from = 0,
    readonly limit = xml.length,
  ) {
    this.pos = from
  }

  next(): boolean {
    const xml = this.xml
    const limit = this.limit
    const pos = this.pos
    if (pos >= limit) return false
    this.start = pos
    this.name = ''
    if (xml.charCodeAt(pos) !== LT) return this.text(pos + 1)
    const c1 = xml.charCodeAt(pos + 1)
    if (c1 === BANG) {
      if (xml.startsWith('<!--', pos)) return this.until('comment', '-->', pos + 4)
      if (xml.startsWith('<![CDATA[', pos)) return this.until('cdata', ']]>', pos + 9)
      return this.doctype(pos)
    }
    if (c1 === QUESTION) {
      const nameEnd = this.scanName(pos + 2)
      this.name = xml.slice(pos + 2, nameEnd)
      return this.until('pi', '?>', nameEnd)
    }
    if (c1 === SLASH) {
      const nameEnd = this.scanName(pos + 2)
      if (nameEnd === pos + 2) return this.text(pos + 1)
      const gt = xml.indexOf('>', nameEnd)
      this.kind = 'close'
      this.name = xml.slice(pos + 2, nameEnd)
      this.nameEnd = nameEnd
      this.end = gt < 0 || gt >= limit ? limit : gt + 1
      this.pos = this.end
      return true
    }
    const nameEnd = this.scanName(pos + 1)
    // `<` not followed by a name is malformed text; keep it as text
    if (nameEnd === pos + 1) return this.text(pos + 1)
    const gt = this.findTagEnd(nameEnd)
    if (gt < 0) return this.text(pos + 1)
    this.kind = xml.charCodeAt(gt - 1) === SLASH ? 'empty' : 'open'
    this.name = xml.slice(pos + 1, nameEnd)
    this.nameEnd = nameEnd
    this.end = gt + 1
    this.pos = this.end
    return true
  }

  private text(from: number): boolean {
    let lt = this.xml.indexOf('<', from)
    if (lt < 0 || lt > this.limit) lt = this.limit
    this.kind = 'text'
    this.end = lt
    this.pos = lt
    return true
  }

  private until(kind: XmlTokenKind, terminator: string, from: number): boolean {
    const at = this.xml.indexOf(terminator, from)
    this.kind = kind
    this.end = at < 0 || at + terminator.length > this.limit ? this.limit : at + terminator.length
    this.pos = this.end
    return true
  }

  private doctype(pos: number): boolean {
    // `<!DOCTYPE … [ … ]>`: an internal subset may contain `>`
    const xml = this.xml
    let depth = 0
    let i = pos + 2
    for (; i < this.limit; i++) {
      const c = xml.charCodeAt(i)
      if (c === 91) depth++
      else if (c === 93) depth--
      else if (c === GT && depth <= 0) break
    }
    this.kind = 'doctype'
    this.end = Math.min(i + 1, this.limit)
    this.pos = this.end
    return true
  }

  private scanName(from: number): number {
    const xml = this.xml
    let i = from
    while (i < this.limit) {
      const c = xml.charCodeAt(i)
      if (isSpace(c) || c === GT || c === SLASH || c === LT || c === EQUALS) break
      if (c === QUESTION && i > from) break
      i++
    }
    return i
  }

  /** Index of the `>` closing a start tag, honouring quoted attribute values. */
  private findTagEnd(from: number): number {
    const xml = this.xml
    let quote = 0
    for (let i = from; i < this.limit; i++) {
      const c = xml.charCodeAt(i)
      if (quote) {
        if (c === quote) quote = 0
      } else if (c === DQUOTE || c === SQUOTE) quote = c
      else if (c === GT) return i
    }
    // an unbalanced quote: fall back to the first `>` so one bad attribute
    // does not swallow the rest of the document
    const gt = xml.indexOf('>', from)
    return gt < 0 || gt >= this.limit ? -1 : gt
  }
}

/** One attribute of a start tag, with source offsets for narrow patching. */
export interface XmlAttribute {
  /** name as written (prefix not canonicalised) */
  name: string
  /** raw (still entity-escaped) value */
  raw: string
  nameStart: number
  /** first character of the value (after the quote) */
  valueStart: number
  /** one past the value's last character (the closing quote's index) */
  valueEnd: number
}

/**
 * Reads the attributes of the start tag whose name ends at `nameEnd` and
 * whose `>` is at `tagEnd - 1`. Malformed attributes are skipped, never thrown.
 */
export function readAttributes(xml: string, nameEnd: number, tagEnd: number): XmlAttribute[] {
  const out: XmlAttribute[] = []
  let i = nameEnd
  const stop = tagEnd
  while (i < stop) {
    let c = xml.charCodeAt(i)
    if (isSpace(c) || c === SLASH || c === GT) {
      i++
      continue
    }
    const nameStart = i
    while (i < stop) {
      c = xml.charCodeAt(i)
      if (isSpace(c) || c === EQUALS || c === GT || c === SLASH) break
      i++
    }
    const name = xml.slice(nameStart, i)
    while (i < stop && isSpace(xml.charCodeAt(i))) i++
    if (xml.charCodeAt(i) !== EQUALS) {
      if (name) out.push({ name, raw: '', nameStart, valueStart: i, valueEnd: i })
      continue
    }
    i++
    while (i < stop && isSpace(xml.charCodeAt(i))) i++
    const quote = xml.charCodeAt(i)
    if (quote !== DQUOTE && quote !== SQUOTE) {
      // unquoted value: read to whitespace or tag end
      const valueStart = i
      while (i < stop && !isSpace(xml.charCodeAt(i)) && xml.charCodeAt(i) !== GT) i++
      out.push({ name, raw: xml.slice(valueStart, i), nameStart, valueStart, valueEnd: i })
      continue
    }
    const valueStart = i + 1
    let valueEnd = xml.indexOf(String.fromCharCode(quote), valueStart)
    if (valueEnd < 0 || valueEnd >= stop) valueEnd = Math.max(valueStart, stop - 1)
    out.push({ name, raw: xml.slice(valueStart, valueEnd), nameStart, valueStart, valueEnd })
    i = valueEnd + 1
  }
  return out
}

const NAMED_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
}

/** Decodes the five XML entities and numeric references; unknown references stay verbatim. */
export function decodeXmlEntities(raw: string): string {
  if (raw.indexOf('&') < 0) return raw
  return raw.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, ref: string) => {
    if (ref.charCodeAt(0) === 35) {
      const code =
        ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole
      try {
        return String.fromCodePoint(code)
      } catch {
        return whole
      }
    }
    return NAMED_ENTITIES[ref] ?? whole
  })
}

// Control characters outside \t \n \r are illegal in XML 1.0 even when escaped
// (same class as packages/docx-engine escapeXmlText).
// eslint-disable-next-line no-control-regex
const ILLEGAL_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g

/** Escapes text for use as element content. */
export function escapeXmlText(text: string): string {
  return text
    .replace(ILLEGAL_XML_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Escapes text for use inside a double-quoted attribute value. */
export function escapeXmlAttr(text: string): string {
  return escapeXmlText(text).replace(/"/g, '&quot;')
}

/** Namespace URIs of ODF and the prefixes this package uses for them. */
export const ODF_NAMESPACES: Readonly<Record<string, string>> = {
  'urn:oasis:names:tc:opendocument:xmlns:office:1.0': 'office',
  'urn:oasis:names:tc:opendocument:xmlns:style:1.0': 'style',
  'urn:oasis:names:tc:opendocument:xmlns:text:1.0': 'text',
  'urn:oasis:names:tc:opendocument:xmlns:table:1.0': 'table',
  'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0': 'draw',
  'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0': 'fo',
  'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0': 'svg',
  'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0': 'number',
  'urn:oasis:names:tc:opendocument:xmlns:meta:1.0': 'meta',
  'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0': 'manifest',
  'urn:oasis:names:tc:opendocument:xmlns:config:1.0': 'config',
  'urn:oasis:names:tc:opendocument:xmlns:chart:1.0': 'chart',
  'urn:oasis:names:tc:opendocument:xmlns:dr3d:1.0': 'dr3d',
  'urn:oasis:names:tc:opendocument:xmlns:form:1.0': 'form',
  'urn:oasis:names:tc:opendocument:xmlns:script:1.0': 'script',
  'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0': 'presentation',
  'urn:oasis:names:tc:opendocument:xmlns:animation:1.0': 'anim',
  'urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0': 'smil',
  'http://www.w3.org/1999/xlink': 'xlink',
  'http://purl.org/dc/elements/1.1/': 'dc',
  'http://www.w3.org/1998/Math/MathML': 'math',
  'http://www.w3.org/2002/xforms': 'xforms',
  'http://www.w3.org/1999/xhtml': 'xhtml',
}

/**
 * Maps the prefixes a document actually declares (on its root element) to the
 * canonical ODF prefixes, so `t:p` in a document that binds `t` to the text
 * namespace is recognised as `text:p`. Identity for the usual case.
 * Redeclarations below the root are not followed.
 */
export class PrefixMap {
  private readonly rename = new Map<string, string>()

  constructor(rootAttributes: readonly XmlAttribute[] = []) {
    for (const attr of rootAttributes) {
      if (!attr.name.startsWith('xmlns:')) continue
      const prefix = attr.name.slice(6)
      const canonical = ODF_NAMESPACES[decodeXmlEntities(attr.raw)]
      if (canonical && canonical !== prefix) this.rename.set(prefix, canonical)
    }
  }

  /** The canonical form of a qualified name as written. */
  canonical(qname: string): string {
    if (this.rename.size === 0) return qname
    const colon = qname.indexOf(':')
    if (colon < 0) return qname
    const mapped = this.rename.get(qname.slice(0, colon))
    return mapped ? mapped + qname.slice(colon) : qname
  }
}

/** The root element of a part: its name, attributes and namespace prefixes. */
export interface XmlRoot {
  name: string
  tag: string
  start: number
  end: number
  attributes: XmlAttribute[]
  prefixes: PrefixMap
}

/** Finds the document element (first start tag) of `xml`. */
export function readRoot(xml: string): XmlRoot | null {
  const scanner = new XmlScanner(xml)
  while (scanner.next()) {
    if (scanner.kind !== 'open' && scanner.kind !== 'empty') continue
    const attributes = readAttributes(xml, scanner.nameEnd, scanner.end)
    const prefixes = new PrefixMap(attributes)
    return {
      name: prefixes.canonical(scanner.name),
      tag: scanner.name,
      start: scanner.start,
      end: scanner.end,
      attributes,
      prefixes,
    }
  }
  return null
}

/** Decoded attributes of a start tag, keyed by canonical name. */
export function attributeMap(
  xml: string,
  nameEnd: number,
  tagEnd: number,
  prefixes: PrefixMap,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const attr of readAttributes(xml, nameEnd, tagEnd)) {
    const name = prefixes.canonical(attr.name)
    if (!(name in out)) out[name] = decodeXmlEntities(attr.raw)
  }
  return out
}

/** Source offsets of one element. For a self-closing element `openEnd === closeStart === end`. */
export interface ElementRange {
  /** `<` of the start tag */
  start: number
  /** one past the start tag's `>` */
  openEnd: number
  /** `<` of the end tag (or `end` when self-closing or unclosed) */
  closeStart: number
  /** one past the end tag's `>` */
  end: number
  selfClosing: boolean
}

/** An element being walked. `closeStart`/`end` are -1 until the element closes. */
export interface ElementFrame extends ElementRange {
  /** canonical qualified name */
  name: string
  /** qualified name as written */
  tag: string
  /** one past the name inside the start tag */
  nameEnd: number
  /** caller-owned slot */
  data: unknown
}

export interface ElementVisitor {
  /**
   * Called at a start tag. Return `'skip'` to walk the subtree silently,
   * `'stop'` to end the walk. Self-closing elements get `close` right after.
   */
  open(el: ElementFrame, parent: ElementFrame | null): void | 'skip' | 'stop'
  /** Called when the element's extent is known. */
  close?(el: ElementFrame, parent: ElementFrame | null): void | 'stop'
  /** Text, comments, CDATA, processing instructions and doctypes (not inside skipped subtrees). */
  other?(kind: XmlTokenKind, start: number, end: number, parent: ElementFrame | null): void
  /** Malformed markup that was tolerated. */
  warn?(message: string): void
}

/**
 * Walks the elements of `xml[from, to)` in document order with lenient
 * nesting. Returns the offset where the walk ended.
 */
export function walkElements(
  xml: string,
  prefixes: PrefixMap,
  visitor: ElementVisitor,
  from = 0,
  to = xml.length,
): number {
  const scanner = new XmlScanner(xml, from, to)
  const stack: ElementFrame[] = []
  // depth (stack length) at which a skipped subtree started; -1 when not skipping
  let skipDepth = -1
  const top = () => (stack.length ? stack[stack.length - 1] : null)
  while (scanner.next()) {
    const kind = scanner.kind
    if (kind === 'open' || kind === 'empty') {
      const el: ElementFrame = {
        name: prefixes.canonical(scanner.name),
        tag: scanner.name,
        start: scanner.start,
        nameEnd: scanner.nameEnd,
        openEnd: scanner.end,
        closeStart: -1,
        end: -1,
        selfClosing: kind === 'empty',
        data: undefined,
      }
      const parent = top()
      if (skipDepth >= 0) {
        if (kind === 'open') stack.push(el)
        continue
      }
      const verdict = visitor.open(el, parent)
      if (verdict === 'stop') return scanner.end
      if (kind === 'empty') {
        el.closeStart = el.end = scanner.end
        if (verdict !== 'skip' && visitor.close?.(el, parent) === 'stop') return scanner.end
        continue
      }
      if (verdict === 'skip') skipDepth = stack.length
      stack.push(el)
    } else if (kind === 'close') {
      const name = prefixes.canonical(scanner.name)
      let index = stack.length - 1
      while (index >= 0 && stack[index].name !== name) index--
      if (index < 0) {
        if (skipDepth < 0) visitor.warn?.(`stray </${scanner.name}> at ${scanner.start}`)
        continue
      }
      if (finishFrames(index, scanner.start, scanner.end) === 'stop') return scanner.end
    } else if (skipDepth < 0) {
      visitor.other?.(kind, scanner.start, scanner.end, top())
    }
  }
  if (stack.length) finishFrames(0, to, to)
  return to

  // Pops frames down to and including `index`. Frames above it were never
  // closed: they end where the closing tag begins.
  function finishFrames(index: number, closeStart: number, end: number): 'stop' | void {
    while (stack.length > index) {
      const el = stack.pop() as ElementFrame
      const isTarget = stack.length === index && end !== closeStart
      el.closeStart = closeStart
      el.end = isTarget ? end : closeStart
      const silent = skipDepth >= 0 && stack.length > skipDepth
      if (skipDepth >= 0 && stack.length === skipDepth) skipDepth = -1
      if (silent) continue
      if (!isTarget) visitor.warn?.(`unclosed <${el.tag}> at ${el.start}`)
      if (visitor.close?.(el, top()) === 'stop') return 'stop'
    }
  }
}
