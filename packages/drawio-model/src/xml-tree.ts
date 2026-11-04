/**
 * A small position-keeping XML tree for draw.io files.
 *
 * saxes checks well-formedness and decodes attribute values; this module keeps,
 * for every node, its exact source range so that a writer can copy untouched
 * parts byte for byte and rebuild only what changed. saxes reports a markup
 * item (tag, PI, CDATA, doctype) once its closing `>` has been read, and a
 * comment just before it; the item's end is therefore the first `>` at or after
 * `position - 1`. Its start is the first `<` after the previous item, because
 * character data never contains a literal `<`. Text between items is kept raw.
 */
import { SaxesParser } from 'saxes'

export interface XmlAttr {
  name: string
  value: string
}

export interface XmlElement {
  type: 'element'
  name: string
  attrs: XmlAttr[]
  children: XmlNode[]
  parent: XmlElement | null
  /** Source range; `start < 0` marks an element built in memory. */
  start: number
  startTagEnd: number
  endTagStart: number
  end: number
  selfClosing: boolean
  /** The start tag must be rebuilt from `attrs`. */
  attrsDirty: boolean
  /** The children must be written one by one (clean ones are still copied). */
  contentDirty: boolean
}

/** Text, comments, PIs, CDATA and any other markup, kept as written. */
export interface XmlRaw {
  type: 'raw'
  raw: string
  /** True for character data (not markup). */
  text: boolean
}

export type XmlNode = XmlElement | XmlRaw

export interface XmlTree {
  source: string
  /** Everything at the top level, the root element included. */
  nodes: XmlNode[]
  root: XmlElement
}

export class XmlParseError extends Error {}

/** Parses `source` into a tree; throws `XmlParseError` when it is not well-formed XML. */
export function parseXmlTree(source: string): XmlTree {
  const parser = new SaxesParser({ position: true })
  const top: XmlNode[] = []
  const stack: XmlElement[] = []
  let root: XmlElement | null = null
  let prevEnd = 0
  let failure: string | null = null

  const append = (node: XmlNode): void => {
    const parent = stack[stack.length - 1]
    if (parent) {
      parent.children.push(node)
      if (node.type === 'element') node.parent = parent
    } else {
      top.push(node)
    }
  }
  const itemEnd = (): number => source.indexOf('>', Math.max(0, parser.position - 1)) + 1
  const markupStart = (): number => {
    const start = source.indexOf('<', prevEnd)
    if (start > prevEnd) {
      append({ type: 'raw', raw: source.slice(prevEnd, start), text: true })
    }
    return start
  }
  const rawMarkup = (): void => {
    const start = markupStart()
    const end = itemEnd()
    append({ type: 'raw', raw: source.slice(start, end), text: false })
    prevEnd = end
  }

  parser.on('error', (error) => {
    failure ??= error.message
  })
  parser.on('xmldecl', rawMarkup)
  parser.on('doctype', rawMarkup)
  parser.on('comment', rawMarkup)
  parser.on('processinginstruction', rawMarkup)
  parser.on('cdata', rawMarkup)
  parser.on('opentag', (tag) => {
    const start = markupStart()
    const end = itemEnd()
    const element: XmlElement = {
      type: 'element',
      name: tag.name,
      attrs: Object.entries(tag.attributes as Record<string, string>).map(([name, value]) => ({
        name,
        value,
      })),
      children: [],
      parent: null,
      start,
      startTagEnd: end,
      endTagStart: end,
      end,
      selfClosing: tag.isSelfClosing,
      attrsDirty: false,
      contentDirty: false,
    }
    append(element)
    if (!root && stack.length === 0) root = element
    prevEnd = end
    if (!tag.isSelfClosing) stack.push(element)
  })
  parser.on('closetag', (tag) => {
    if (tag.isSelfClosing) return
    // The text before the end tag still belongs to the element.
    const start = markupStart()
    const element = stack.pop()
    if (!element) return
    const end = itemEnd()
    element.endTagStart = start
    element.end = end
    prevEnd = end
  })

  try {
    parser.write(source).close()
  } catch (error) {
    failure ??= error instanceof Error ? error.message : String(error)
  }
  if (failure !== null) throw new XmlParseError(failure)
  if (prevEnd < source.length) top.push({ type: 'raw', raw: source.slice(prevEnd), text: true })
  if (!root) throw new XmlParseError('no root element')
  return { source, nodes: top, root }
}

export function getAttr(element: XmlElement, name: string): string | undefined {
  return element.attrs.find((attr) => attr.name === name)?.value
}

/** Sets (or, with `undefined`, removes) an attribute and marks the start tag for rebuilding. */
export function setAttr(element: XmlElement, name: string, value: string | undefined): void {
  const index = element.attrs.findIndex((attr) => attr.name === name)
  if (value === undefined) {
    if (index < 0) return
    element.attrs.splice(index, 1)
  } else if (index >= 0) {
    if (element.attrs[index]!.value === value) return
    element.attrs[index] = { name, value }
  } else {
    element.attrs.push({ name, value })
  }
  element.attrsDirty = true
  markContentDirty(element.parent)
}

/** Marks an element and its ancestors as having changed content. */
export function markContentDirty(element: XmlElement | null): void {
  for (let current = element; current; current = current.parent) current.contentDirty = true
}

export function childElements(element: XmlElement, name?: string): XmlElement[] {
  return element.children.filter(
    (child): child is XmlElement =>
      child.type === 'element' && (name === undefined || child.name === name),
  )
}

export function newElement(name: string, attrs: XmlAttr[], children: XmlNode[] = []): XmlElement {
  const element: XmlElement = {
    type: 'element',
    name,
    attrs,
    children,
    parent: null,
    start: -1,
    startTagEnd: -1,
    endTagStart: -1,
    end: -1,
    selfClosing: children.length === 0,
    attrsDirty: true,
    contentDirty: true,
  }
  for (const child of children) if (child.type === 'element') child.parent = element
  return element
}

export function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#xa;')
    .replace(/\r/g, '&#xd;')
    .replace(/\t/g, '&#x9;')
}

export function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Decodes the five XML entities and character references in raw character data. */
export function decodeXmlText(raw: string): string {
  return raw.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_match, ref: string) => {
    if (ref.startsWith('#x')) return String.fromCodePoint(parseInt(ref.slice(2), 16))
    if (ref.startsWith('#')) return String.fromCodePoint(parseInt(ref.slice(1), 10))
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[ref]!
  })
}

function buildStartTag(element: XmlElement, selfClose: boolean): string {
  const attrs = element.attrs.map((attr) => ` ${attr.name}="${escapeXmlAttr(attr.value)}"`).join('')
  return `<${element.name}${attrs}${selfClose ? ' />' : '>'}`
}

/** Writes a node, copying every untouched part from `source` as it was. */
export function serializeNode(node: XmlNode, source: string): string {
  if (node.type === 'raw') return node.raw
  const fresh = node.start < 0
  if (!fresh && !node.attrsDirty && !node.contentDirty) return source.slice(node.start, node.end)
  const empty = node.children.length === 0
  const rebuildStart = fresh || node.attrsDirty || (node.selfClosing && !empty)
  if (empty) {
    if (!rebuildStart && node.selfClosing) return source.slice(node.start, node.end)
    if (rebuildStart) return buildStartTag(node, true)
  }
  const startTag = rebuildStart
    ? buildStartTag(node, false)
    : source.slice(node.start, node.startTagEnd)
  const endTag =
    fresh || node.selfClosing ? `</${node.name}>` : source.slice(node.endTagStart, node.end)
  return startTag + node.children.map((child) => serializeNode(child, source)).join('') + endTag
}

export function serializeTree(tree: XmlTree): string {
  return tree.nodes.map((node) => serializeNode(node, tree.source)).join('')
}

/**
 * The whitespace that precedes `element` among its siblings, used to indent a
 * new sibling the same way; empty when the element sits on the same line.
 */
export function leadingWhitespace(element: XmlElement): string {
  const siblings = element.parent?.children ?? []
  const index = siblings.indexOf(element)
  const before = index > 0 ? siblings[index - 1] : undefined
  if (before?.type === 'raw' && before.text && /^\s+$/.test(before.raw)) {
    const lastBreak = before.raw.lastIndexOf('\n')
    return lastBreak >= 0 ? before.raw.slice(lastBreak) : ''
  }
  return ''
}

/** Removes an element and the whitespace that indents it. */
export function removeElement(element: XmlElement): void {
  const parent = element.parent
  if (!parent) return
  const siblings = parent.children
  const index = siblings.indexOf(element)
  if (index < 0) return
  const before = siblings[index - 1]
  if (before?.type === 'raw' && before.text && /^\s+$/.test(before.raw)) {
    siblings.splice(index - 1, 2)
  } else {
    siblings.splice(index, 1)
  }
  element.parent = null
  markContentDirty(parent)
}

/**
 * Appends `element` after the last element child of `parent`, indented like
 * that child (or with `fallbackIndent` when the parent has no element child).
 */
export function appendElement(parent: XmlElement, element: XmlElement, fallbackIndent = ''): void {
  const elements = childElements(parent)
  const last = elements[elements.length - 1]
  const indent = last ? leadingWhitespace(last) : fallbackIndent
  const siblings = parent.children
  const at = last ? siblings.indexOf(last) + 1 : 0
  const inserted: XmlNode[] = indent
    ? [{ type: 'raw', raw: indent, text: true }, element]
    : [element]
  if (!last && indent) {
    // An empty parent gets a line break before its end tag as well.
    const closing = indent.length > 2 ? indent.slice(0, -2) : '\n'
    if (!siblings.some((child) => child.type === 'raw' && child.text)) {
      inserted.push({ type: 'raw', raw: closing, text: true })
    }
  }
  siblings.splice(at, 0, ...inserted)
  element.parent = parent
  markContentDirty(parent)
}
