/**
 * A small element tree for the book's own XML files (container, package,
 * encryption, nav, NCX). Text is kept exactly as the parser hands it over.
 *
 * Namespaces are resolved here rather than by saxes so that an undeclared
 * prefix (a common slip in older packages: `dc:` without `xmlns:dc`) leaves
 * the name without a namespace instead of failing the whole file. Everything
 * else that is not well-formed XML throws.
 */
import { parse, type DefaultTreeAdapterTypes as P5 } from 'parse5'
import { SaxesParser } from 'saxes'

export interface XmlAttribute {
  /** qualified name as written */
  name: string
  local: string
  /** namespace URI, or null for an unprefixed or unbound attribute */
  uri: string | null
  value: string
}

export interface XmlElement {
  /** qualified name as written */
  name: string
  local: string
  /** namespace URI, or null when none applies */
  uri: string | null
  attributes: XmlAttribute[]
  children: XmlNode[]
}

export type XmlNode = XmlElement | string

const XML_NS = 'http://www.w3.org/XML/1998/namespace'

/**
 * HTML named entities often found in navigation documents and titles, which
 * XML without a DTD does not define. A file using any other undefined entity
 * fails to parse.
 */
const EXTRA_ENTITIES: Record<string, string> = {
  nbsp: '\u00a0',
  ensp: '\u2002',
  emsp: '\u2003',
  thinsp: '\u2009',
  zwnj: '\u200c',
  zwj: '\u200d',
  shy: '\u00ad',
  ndash: '\u2013',
  mdash: '\u2014',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  laquo: '\u00ab',
  raquo: '\u00bb',
  hellip: '\u2026',
  middot: '\u00b7',
  bull: '\u2022',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
}

function splitName(name: string): { prefix: string; local: string } {
  const colon = name.indexOf(':')
  return colon < 0
    ? { prefix: '', local: name }
    : { prefix: name.slice(0, colon), local: name.slice(colon + 1) }
}

/** Parses well-formed XML into an element tree; throws on anything else. */
export function parseXml(text: string): XmlElement {
  const parser = new SaxesParser({ xmlns: false })
  Object.assign(parser.ENTITIES, EXTRA_ENTITIES)
  const scopes: Map<string, string>[] = [new Map([['xml', XML_NS]])]
  const stack: XmlElement[] = []
  let root: XmlElement | null = null

  const lookup = (prefix: string): string | null => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const uri = scopes[i]!.get(prefix)
      if (uri !== undefined) return uri === '' ? null : uri
    }
    return null
  }

  parser.on('error', (error) => {
    throw error
  })
  parser.on('opentag', (tag) => {
    const scope = new Map<string, string>()
    const raw = Object.entries(tag.attributes as Record<string, string>)
    for (const [name, value] of raw) {
      if (name === 'xmlns') scope.set('', value)
      else if (name.startsWith('xmlns:')) scope.set(name.slice(6), value)
    }
    scopes.push(scope)
    const { prefix, local } = splitName(tag.name)
    const element: XmlElement = {
      name: tag.name,
      local,
      uri: lookup(prefix),
      attributes: raw
        .filter(([name]) => name !== 'xmlns' && !name.startsWith('xmlns:'))
        .map(([name, value]) => {
          const parts = splitName(name)
          return {
            name,
            local: parts.local,
            uri: parts.prefix === '' ? null : lookup(parts.prefix),
            value,
          }
        }),
      children: [],
    }
    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(element)
    else root = element
    stack.push(element)
  })
  parser.on('closetag', () => {
    stack.pop()
    scopes.pop()
  })
  const onText = (text: string): void => {
    stack[stack.length - 1]?.children.push(text)
  }
  parser.on('text', onText)
  parser.on('cdata', onText)
  parser.write(text).close()
  if (!root) throw new Error('xml: no root element')
  return root
}

/** Parses markup the way a browser would and returns the same tree shape. */
export function parseHtml(text: string): XmlElement {
  const document = parse(text)
  const html = document.childNodes.find(
    (node): node is P5.Element => 'tagName' in node && node.tagName === 'html',
  )
  const convert = (node: P5.Element): XmlElement => ({
    name: node.tagName,
    local: splitName(node.tagName).local,
    uri: null,
    attributes: node.attrs.map((attr) => ({
      name: attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name,
      local: splitName(attr.name).local,
      uri: attr.namespace ?? null,
      value: attr.value,
    })),
    children: (node.tagName === 'template'
      ? (node as P5.Template).content.childNodes
      : node.childNodes
    ).flatMap((child): XmlNode[] => {
      if (child.nodeName === '#text') return [(child as P5.TextNode).value]
      if ('tagName' in child) return [convert(child)]
      return []
    }),
  })
  if (!html) throw new Error('html: no root element')
  return convert(html)
}

export function isElement(node: XmlNode): node is XmlElement {
  return typeof node !== 'string'
}

export function childElements(element: XmlElement): XmlElement[] {
  return element.children.filter(isElement)
}

/** Depth-first, document order, including `element` itself. */
export function* walk(element: XmlElement): Generator<XmlElement> {
  yield element
  for (const child of element.children) if (isElement(child)) yield* walk(child)
}

/** The first element (document order) whose local name matches, case-insensitively. */
export function findFirst(element: XmlElement, local: string): XmlElement | undefined {
  const wanted = local.toLowerCase()
  for (const el of walk(element)) if (el.local.toLowerCase() === wanted) return el
  return undefined
}

/** An attribute by local name; when `uri` is given the namespace must match too. */
export function attr(element: XmlElement, local: string, uri?: string): string | undefined {
  for (const a of element.attributes) {
    if (a.local !== local) continue
    if (uri === undefined ? a.uri === null : a.uri === uri) return a.value
  }
  return undefined
}

/** An attribute by its qualified name as written (e.g. `epub:type` from an HTML parse). */
export function attrByName(element: XmlElement, name: string): string | undefined {
  return element.attributes.find((a) => a.name === name)?.value
}

/**
 * All descendant text, joined. `skip` names elements (by local name) whose
 * text is left out, such as ruby annotations.
 */
export function textContent(element: XmlElement, skip: ReadonlySet<string> = new Set()): string {
  let out = ''
  for (const child of element.children) {
    if (typeof child === 'string') out += child
    else if (!skip.has(child.local.toLowerCase())) out += textContent(child, skip)
  }
  return out
}

/** Trims and collapses XML whitespace only; a no-break space stays. */
export function collapseWhitespace(text: string): string {
  return text.replace(/[ \t\r\n]+/g, ' ').replace(/^ | $/g, '')
}

/** Splits an XML token list (`properties`, `epub:type`). */
export function tokens(value: string | undefined): string[] {
  return value === undefined ? [] : value.split(/[ \t\r\n]+/).filter((t) => t !== '')
}
