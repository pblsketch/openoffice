/**
 * The block map of one chapter: the editable blocks with their source ranges.
 *
 * A block is an element of an editable kind whose content is only inline
 * (text and inline elements). Mixed containers (text next to block-level
 * elements) are not blocks; the blocks inside them are. Flowing blocks (p,
 * h1–h6, li, a text-only blockquote, a text-only div) can be split, merged,
 * inserted and deleted; structural text blocks (td, th, figcaption, dt, dd)
 * only take text edits.
 */
import { mapOffset, type RangeReplacement } from './ranges'
import { parseXml, type XmlAttribute, type XmlDocument, type XmlElement } from './xml-positions'

export type BlockKind =
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'li'
  | 'blockquote'
  | 'td'
  | 'th'
  | 'figcaption'
  | 'dt'
  | 'dd'
  | 'div'

export interface SourceRange {
  start: number
  end: number
}

export interface ChapterBlock {
  /** Engine id, unique in the chapter and stable while the chapter stays open. */
  id: string
  /** Tag name without prefix. */
  kind: BlockKind
  /** Qualified tag name as written. */
  tag: string
  attributes: XmlAttribute[]
  /** p, h1–h6, li, blockquote, div; false for td, th, figcaption, dt, dd. */
  flowing: boolean
  selfClosing: boolean
  /** The whole element. */
  outer: SourceRange
  /** The content between the tags (empty, at the `/>`, for a self-closing element). */
  inner: SourceRange
  element: XmlElement
}

export interface OpenChapter {
  broken: false
  source: string
  doc: XmlDocument
  blocks: ChapterBlock[]
  /** Counter for the next fresh block id. */
  nextId: number
}

export interface BrokenChapter {
  broken: true
  source: string
  error: string
  offset: number
}

export type ChapterMap = OpenChapter | BrokenChapter

const FLOWING_KINDS = new Set<string>([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
  'div',
])
const STRUCTURAL_KINDS = new Set<string>(['td', 'th', 'figcaption', 'dt', 'dd'])

/** Elements that make their parent a block container rather than inline content. */
const BLOCK_LEVEL = new Set<string>([
  'address',
  'article',
  'aside',
  'blockquote',
  'body',
  'caption',
  'center',
  'col',
  'colgroup',
  'dd',
  'details',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hgroup',
  'hr',
  'html',
  'legend',
  'li',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
])

/**
 * Inline elements whose content is not text of the block (pictures, formulas,
 * code). They stay one opaque unit: never searched for blocks, never counted
 * as block text, written as an empty placeholder in the notation.
 */
export const OPAQUE_ELEMENTS = new Set<string>(['svg', 'math', 'script', 'style', 'template'])

const SKIPPED = new Set<string>(['head', ...OPAQUE_ELEMENTS])

export function isFlowingKind(kind: string): boolean {
  return FLOWING_KINDS.has(kind)
}

function isInlineOnly(el: XmlElement): boolean {
  for (const child of el.children) {
    if (child.type !== 'element') continue
    if (BLOCK_LEVEL.has(child.local)) return false
    if (OPAQUE_ELEMENTS.has(child.local)) continue
    if (!isInlineOnly(child)) return false
  }
  return true
}

function hasText(el: XmlElement): boolean {
  return el.children.some((child) =>
    child.type === 'text'
      ? child.value.trim() !== ''
      : child.type === 'element' && !OPAQUE_ELEMENTS.has(child.local) && hasText(child),
  )
}

function isBlock(el: XmlElement): boolean {
  if (!FLOWING_KINDS.has(el.local) && !STRUCTURAL_KINDS.has(el.local)) return false
  if (!isInlineOnly(el)) return false
  return el.local !== 'div' || hasText(el)
}

function collectBlockElements(el: XmlElement, out: XmlElement[]): void {
  if (SKIPPED.has(el.local)) return
  if (isBlock(el)) {
    out.push(el)
    return
  }
  for (const child of el.children) if (child.type === 'element') collectBlockElements(child, out)
}

function toBlock(el: XmlElement, id: string): ChapterBlock {
  const inner = el.selfClosing
    ? { start: el.end - 2, end: el.end - 2 }
    : { start: el.startTagEnd, end: el.endTagStart }
  return {
    id,
    kind: el.local as BlockKind,
    tag: el.name,
    attributes: el.attributes,
    flowing: FLOWING_KINDS.has(el.local),
    selfClosing: el.selfClosing,
    outer: { start: el.start, end: el.end },
    inner,
    element: el,
  }
}

function parseBlocks(source: string): { doc: XmlDocument; elements: XmlElement[] } | BrokenChapter {
  const parsed = parseXml(source)
  if (!parsed.ok) return { broken: true, source, error: parsed.error, offset: parsed.offset }
  const elements: XmlElement[] = []
  collectBlockElements(parsed.doc.root, elements)
  return { doc: parsed.doc, elements }
}

/** Reads a chapter and numbers its blocks `b1`, `b2`, … in reading order. */
export function openChapter(source: string): ChapterMap {
  const parsed = parseBlocks(source)
  if ('broken' in parsed) return parsed
  const blocks = parsed.elements.map((el, i) => toBlock(el, `b${i + 1}`))
  return { broken: false, source, doc: parsed.doc, blocks, nextId: blocks.length + 1 }
}

/**
 * Re-reads a chapter after `replacements` (in the coordinates of
 * `previous.source`) turned it into `source`. A block whose start tag offset
 * was not inside a replaced range keeps its id; every other block gets a fresh
 * one.
 */
export function remapChapter(
  previous: OpenChapter,
  source: string,
  replacements: readonly RangeReplacement[],
): ChapterMap {
  const parsed = parseBlocks(source)
  if ('broken' in parsed) return parsed
  const carried = new Map<number, string>()
  for (const block of previous.blocks) {
    const at = mapOffset(block.outer.start, replacements)
    if (at !== null) carried.set(at, block.id)
  }
  let nextId = previous.nextId
  const blocks = parsed.elements.map((el) => {
    const id = carried.get(el.start)
    if (id !== undefined) {
      carried.delete(el.start)
      return toBlock(el, id)
    }
    return toBlock(el, `b${nextId++}`)
  })
  return { broken: false, source, doc: parsed.doc, blocks, nextId }
}

export function findBlock(map: OpenChapter, id: string): ChapterBlock | undefined {
  return map.blocks.find((b) => b.id === id)
}
