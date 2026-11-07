/**
 * FreeMind and Freeplane maps (`.mm`): read once into a new map, never written.
 *
 * The file is XML another program wrote, so it is untrusted. It is parsed with
 * the browser's `DOMParser`, and a document type declaration is refused before
 * parsing: neither program writes one, and without it there is no entity to
 * expand. Topics deeper than the engine accepts make the file unreadable.
 *
 * What comes over: each node's text, its children in order, its note, its web
 * link, whether it is folded, and which side of the central topic its main
 * branches stand on. Rich text and notes become plain text, wherever the two
 * programs keep them: a `richcontent` element, HTML inside the `TEXT`
 * attribute (FreeMind 0.8), and the note hook of FreeMind 0.7 and 0.8. Icons,
 * fonts, colours, edges, clouds, arrow links, attributes, details and links to
 * other nodes are left behind.
 */
import {
  MAX_TOPIC_DEPTH,
  createXmindDocumentFromSheets,
  newSheet,
  newTopic,
  structureClassForLayout,
  type XmindDocument,
  type XmindTopic,
} from '@genoffice/xmind-engine'

/** One node of a FreeMind or Freeplane map, as this editor takes it over. */
export interface FreeMindNode {
  text: string
  children: FreeMindNode[]
  note?: string
  link?: string
  folded?: boolean
  /** set on the central topic's own branches only */
  side?: 'left' | 'right'
}

export type FreeMindRead =
  | { ok: true; root: FreeMindNode }
  | { ok: false; problem: 'not-text' | 'not-xml' | 'not-a-map' | 'too-deep' }

/** The file's text: UTF-8, or the encoding its XML declaration names. */
function decode(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200))
    const label = /^\s*<\?xml[^>]*\bencoding\s*=\s*["']([\w.:-]+)["']/.exec(head)?.[1]
    if (!label) return null
    try {
      return new TextDecoder(label, { fatal: true }).decode(bytes)
    } catch {
      return null
    }
  }
}

const BLOCKS = new Set(['p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br'])
const SKIPPED = new Set(['head', 'style', 'script'])

/** HTML as a browser shows it: one line per block, white space collapsed. */
function htmlText(content: Node): string {
  const lines: string[] = []
  let line = ''
  const breakLine = (): void => {
    lines.push(line.trim())
    line = ''
  }
  const pending: (Node | 'break')[] = [content]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (next === 'break') {
      breakLine()
      continue
    }
    if (next.nodeType === Node.TEXT_NODE || next.nodeType === Node.CDATA_SECTION_NODE) {
      line += (next.nodeValue ?? '').replace(/\s+/g, ' ')
      continue
    }
    if (next.nodeType !== Node.ELEMENT_NODE) continue
    const name = (next as Element).localName?.toLowerCase() ?? ''
    if (SKIPPED.has(name)) continue
    const block = BLOCKS.has(name)
    if (block) pending.push('break')
    const children = Array.from(next.childNodes)
    for (let at = children.length - 1; at >= 0; at--) pending.push(children[at]!)
    if (block) pending.push('break')
  }
  breakLine()
  return lines
    .join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/**
 * The text of a `richcontent` element. Content without HTML (Freeplane's plain
 * forms) is taken line by line as it stands.
 */
function richText(content: Element): string {
  if (content.getElementsByTagName('html').length > 0) return htmlText(content)
  return (content.textContent ?? '')
    .split(/\r\n?|\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * Text kept in an attribute or a plain element. Both programs show it as HTML
 * when it starts with `<html`. A document from `DOMParser` is inert: nothing in
 * it runs or loads.
 */
function markupText(text: string): string {
  if (!/^\s*<html/i.test(text)) return text.replace(/\r\n?/g, '\n').trim()
  return htmlText(new DOMParser().parseFromString(text, 'text/html').documentElement)
}

function elementChildren(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === name)
}

/** FreeMind 0.7 and 0.8 keep a note in a plugin hook rather than in `richcontent`. */
const NOTE_HOOK = 'accessories/plugins/NodeNote.properties'

function hookNote(node: Element): string | undefined {
  const hook = elementChildren(node, 'hook').find(
    (child) => child.getAttribute('NAME') === NOTE_HOOK,
  )
  const text = hook ? elementChildren(hook, 'text')[0]?.textContent : undefined
  return text ? markupText(text) || undefined : undefined
}

function richContent(node: Element, type: 'NODE' | 'NOTE'): string | undefined {
  const content = elementChildren(node, 'richcontent').find(
    (child) => child.getAttribute('TYPE')?.toUpperCase() === type,
  )
  return content ? richText(content) : undefined
}

function nodeOf(element: Element, depth: number): FreeMindNode {
  const attribute = element.getAttribute('TEXT')
  const text = attribute !== null ? markupText(attribute) : (richContent(element, 'NODE') ?? '')
  const node: FreeMindNode = { text, children: [] }
  const note = richContent(element, 'NOTE') || hookNote(element)
  if (note) node.note = note
  const link = element.getAttribute('LINK')?.trim()
  // a link to another node of the same map has no counterpart in a web link
  if (link && !link.startsWith('#')) node.link = link
  if (element.getAttribute('FOLDED') === 'true') node.folded = true
  const side = SIDES.get(element.getAttribute('POSITION') ?? '')
  if (depth === 1 && side) node.side = side
  return node
}

/** `POSITION` as FreeMind writes it, and as newer Freeplane versions do. */
const SIDES: ReadonlyMap<string, 'left' | 'right'> = new Map([
  ['left', 'left'],
  ['right', 'right'],
  ['top_or_left', 'left'],
  ['bottom_or_right', 'right'],
])

/** Reads a `.mm` file: the central topic and everything below it, or why it cannot be read. */
export function parseFreeMind(bytes: Uint8Array): FreeMindRead {
  const xml = decode(bytes)
  if (xml === null) return { ok: false, problem: 'not-text' }
  if (/<!DOCTYPE/i.test(xml)) return { ok: false, problem: 'not-xml' }
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.getElementsByTagName('parsererror').length > 0) {
    return { ok: false, problem: 'not-xml' }
  }
  const map = document.documentElement
  const top = map.localName === 'map' ? elementChildren(map, 'node')[0] : undefined
  if (!top) return { ok: false, problem: 'not-a-map' }

  const root = nodeOf(top, 0)
  const pending: [Element, FreeMindNode, number][] = [[top, root, 0]]
  for (let next = pending.pop(); next; next = pending.pop()) {
    const [element, node, depth] = next
    const children = elementChildren(element, 'node')
    if (children.length === 0) continue
    if (depth + 1 > MAX_TOPIC_DEPTH) return { ok: false, problem: 'too-deep' }
    for (const child of children) {
      const made = nodeOf(child, depth + 1)
      node.children.push(made)
      pending.push([child, made, depth + 1])
    }
  }
  return { ok: true, root }
}

function dress(topic: XmindTopic, node: FreeMindNode): void {
  if (node.link) topic.href = node.link
  if (node.note) topic.notes = { plain: { content: node.note } }
}

/**
 * A new map file from a read `.mm`: one sheet named `title`, the central
 * topic named after the map's root (or `title` when the root has no text).
 *
 * Sides: main branches all on one side give that one-sided layout. With both
 * sides, the right-hand branches come first, each side in its own order. The
 * map keeps no side per branch and the editor draws the first half of the
 * branches on the right, so a side with more than half of them gives the rest
 * to the other side.
 */
export function freeMindToXmind(root: FreeMindNode, title: string): Promise<XmindDocument> {
  const sheet = newSheet({ title, rootTitle: root.text || title })
  dress(sheet.rootTopic, root)
  const sides = new Set(root.children.map((child) => child.side))
  const oneSide = sides.size === 1 ? [...sides][0] : undefined
  if (oneSide) sheet.rootTopic.structureClass = structureClassForLayout(oneSide)
  const mains =
    sides.size > 1
      ? [
          ...root.children.filter((child) => child.side !== 'left'),
          ...root.children.filter((child) => child.side === 'left'),
        ]
      : root.children

  const pending: [XmindTopic, FreeMindNode[]][] = [[sheet.rootTopic, mains]]
  for (let next = pending.pop(); next; next = pending.pop()) {
    const [topic, children] = next
    if (children.length === 0) continue
    topic.children = {
      attached: children.map((child) => {
        const made = newTopic(child.text)
        dress(made, child)
        if (child.folded && child.children.length > 0) made.branch = 'folded'
        pending.push([made, child.children])
        return made
      }),
    }
  }
  return createXmindDocumentFromSheets([sheet])
}
