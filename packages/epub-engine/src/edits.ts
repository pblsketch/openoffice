/**
 * Block edits, each expressed as range replacements on the chapter source.
 *
 * Nothing outside the edited blocks is rewritten: a text edit replaces the
 * block's inner range; split, merge, insert and delete only write the tags at
 * the seams they create. Flowing blocks (p, h1–h6, li, blockquote, div) take
 * every edit; structural text blocks (td, th, figcaption, dt, dd) only take
 * text edits, line breaks and bold/italic.
 */
import {
  findBlock,
  OPAQUE_ELEMENTS,
  remapChapter,
  type ChapterBlock,
  type OpenChapter,
} from './blocks'
import { toggleMarkInTree } from './marks'
import {
  blockNotation,
  encodeBlock,
  newBlockNotationToXhtml,
  notationPlainText,
  notationToXhtml,
  notationTreeToXhtml,
} from './notation'
import { applyReplacements, composeReplacements, type RangeReplacement } from './ranges'
import { textRawOffset, type XmlElement } from './xml-positions'

export type BlockEdit =
  /** Replace the block's text with notation; its placeholders must match. */
  | { op: 'replace'; blockId: string; text: string; dropRuby?: boolean }
  /** Insert a new block of the same tag and attributes (minus id) after this one. */
  | { op: 'insert_after'; blockId: string; text: string }
  /** Delete the block; an id it had survives as an empty span in a flowing sibling. */
  | { op: 'delete'; blockId: string }
  /** Enter: split the block at a plain-text offset. */
  | { op: 'split'; blockId: string; offset: number }
  /** Backspace at the start (`previous`) or Delete at the end (`next`). */
  | { op: 'merge'; blockId: string; with: 'previous' | 'next' }
  /** Shift+Enter: a `br` at a plain-text offset. */
  | { op: 'line_break'; blockId: string; offset: number }
  /** Ctrl+B / Ctrl+I on the plain-text range `[start, end)`. */
  | { op: 'toggle_mark'; blockId: string; mark: 'bold' | 'italic'; start: number; end: number }

export type EditRefusalCode =
  | 'unknown-block'
  | 'not-flowing'
  | 'invalid-notation'
  | 'no-neighbour'
  | 'no-anchor-host'
  | 'bad-offset'
  | 'not-well-formed'

export interface EditRefusal {
  code: EditRefusalCode
  message: string
}

export type EditReplacements =
  { ok: true; replacements: RangeReplacement[] } | { ok: false; refusal: EditRefusal }

export type EditResult =
  | { ok: true; map: OpenChapter; replacements: RangeReplacement[]; created: string[] }
  | { ok: false; refusal: EditRefusal }

function refuse(code: EditRefusalCode, message: string): { ok: false; refusal: EditRefusal } {
  return { ok: false, refusal: { code, message } }
}

const ID_ATTRIBUTE = /\s+(?:xml:)?id\s*=\s*(?:"[^"]*"|'[^']*')/g

/** The start tag as written, made non-self-closing. */
function openTag(source: string, el: XmlElement): string {
  if (!el.selfClosing) return source.slice(el.start, el.startTagEnd)
  return source.slice(el.start, el.end - 2).replace(/\s+$/, '') + '>'
}

function openTagWithoutId(source: string, el: XmlElement): string {
  return openTag(source, el).replace(ID_ATTRIBUTE, '')
}

function closeTag(source: string, el: XmlElement): string {
  return el.selfClosing ? `</${el.name}>` : source.slice(el.endTagStart, el.end)
}

/** `<span id="…"></span>` carrying the block's id attribute as written, or '' without one. */
function idAnchor(source: string, el: XmlElement): string {
  const m = /\s(id\s*=\s*(?:"[^"]*"|'[^']*'))/.exec(openTag(source, el))
  return m ? `<span ${m[1]}></span>` : ''
}

/** Whitespace written before the block on its line (its indentation). */
function leadingWhitespace(source: string, offset: number): number {
  let i = offset
  while (i > 0 && /[ \t\r\n]/.test(source[i - 1]!)) i--
  return i
}

/** Replaces the block's content (turning a self-closing block into a start and end tag). */
function innerReplacement(source: string, block: ChapterBlock, xhtml: string): RangeReplacement[] {
  const el = block.element
  if (el.selfClosing) {
    if (xhtml === '') return []
    return [{ start: el.end - 2, end: el.end, text: `>${xhtml}</${el.name}>` }]
  }
  if (source.slice(block.inner.start, block.inner.end) === xhtml) return []
  return [{ start: block.inner.start, end: block.inner.end, text: xhtml }]
}

/** Inserts markup at the start or end of a block's content. */
function contentInsertion(
  source: string,
  block: ChapterBlock,
  at: 'start' | 'end',
  markup: string,
): RangeReplacement {
  const el = block.element
  if (el.selfClosing) return { start: el.end - 2, end: el.end, text: `>${markup}</${el.name}>` }
  const offset = at === 'start' ? block.inner.start : block.inner.end
  return { start: offset, end: offset, text: markup }
}

interface Point {
  /** Source offset. */
  pos: number
  /** Inline elements open at the point, outside first. */
  open: XmlElement[]
  /** The point is inside a CDATA section. */
  cdata: boolean
}

/**
 * The source point after `offset` plain-text characters. Among the points
 * with that many characters before them, the one outside the most inline
 * elements wins, and the first of those, so a split at the end of a link
 * happens after the link and a split before a line break leaves the break in
 * the second block.
 */
function locate(map: OpenChapter, block: ChapterBlock, offset: number): Point | null {
  let count = 0
  let best: Point | null = null
  const consider = (pos: number, open: XmlElement[]): void => {
    if (count === offset && (!best || open.length < best.open.length)) {
      best = { pos, open, cdata: false }
    }
  }
  const walk = (el: XmlElement, open: XmlElement[], contentEnd: number): void => {
    for (const child of el.children) {
      consider(child.start, open)
      if (child.type === 'text') {
        const len = child.value.length
        if (count < offset && offset < count + len) {
          best = { pos: textRawOffset(map.doc, child, offset - count), open, cdata: child.cdata }
        }
        count += len
      } else if (
        child.type === 'element' &&
        !child.selfClosing &&
        !OPAQUE_ELEMENTS.has(child.local)
      ) {
        const inner = [...open, child]
        consider(child.startTagEnd, inner)
        walk(child, inner, child.endTagStart)
      }
    }
    consider(contentEnd, open)
  }
  if (block.selfClosing) {
    if (offset === 0) return { pos: block.inner.start, open: [], cdata: false }
    return null
  }
  consider(block.inner.start, [])
  walk(block.element, [], block.inner.end)
  return best
}

function plainLength(map: OpenChapter, block: ChapterBlock): number {
  return notationPlainText(encodeBlock(map, block).tree).length
}

function checkOffset(map: OpenChapter, block: ChapterBlock, offset: number): EditRefusal | null {
  const length = plainLength(map, block)
  if (!Number.isInteger(offset) || offset < 0 || offset > length) {
    return {
      code: 'bad-offset',
      message: `offset ${offset} is outside the block text (0–${length})`,
    }
  }
  return null
}

function splitBlock(map: OpenChapter, block: ChapterBlock, offset: number): EditReplacements {
  if (!block.flowing) return refuse('not-flowing', `${block.kind} blocks cannot be split`)
  const bad = checkOffset(map, block, offset)
  if (bad) return { ok: false, refusal: bad }
  const { source } = map
  const el = block.element
  const ws = source.slice(leadingWhitespace(source, el.start), el.start)
  if (el.selfClosing) {
    const text = `></${el.name}>${ws}${openTagWithoutId(source, el)}</${el.name}>`
    return { ok: true, replacements: [{ start: el.end - 2, end: el.end, text }] }
  }
  const point = locate(map, block, offset)!
  const closing = [...point.open].reverse().map((open) => `</${open.name}>`)
  const reopening = point.open.map((open) => openTagWithoutId(source, open))
  const text =
    (point.cdata ? ']]>' : '') +
    closing.join('') +
    closeTag(source, el) +
    ws +
    openTagWithoutId(source, el) +
    reopening.join('') +
    (point.cdata ? '<![CDATA[' : '')
  return { ok: true, replacements: [{ start: point.pos, end: point.pos, text }] }
}

function lineBreak(map: OpenChapter, block: ChapterBlock, offset: number): EditReplacements {
  const bad = checkOffset(map, block, offset)
  if (bad) return { ok: false, refusal: bad }
  if (block.selfClosing) {
    return { ok: true, replacements: [contentInsertion(map.source, block, 'end', '<br/>')] }
  }
  const point = locate(map, block, offset)!
  const text = point.cdata ? ']]><br/><![CDATA[' : '<br/>'
  return { ok: true, replacements: [{ start: point.pos, end: point.pos, text }] }
}

/** The editable block right next to this one under the same parent, with only whitespace between. */
function siblingBlock(
  map: OpenChapter,
  block: ChapterBlock,
  direction: 'previous' | 'next',
): ChapterBlock | null {
  const parent = block.element.parent
  if (!parent) return null
  const siblings = parent.children
  const index = siblings.indexOf(block.element)
  const step = direction === 'next' ? 1 : -1
  for (let i = index + step; i >= 0 && i < siblings.length; i += step) {
    const node = siblings[i]!
    if (node.type === 'text' && node.value.trim() === '' && !node.cdata) continue
    if (node.type !== 'element') return null
    return map.blocks.find((b) => b.element === node) ?? null
  }
  return null
}

function mergeBlocks(
  map: OpenChapter,
  block: ChapterBlock,
  other: 'previous' | 'next',
): EditReplacements {
  if (!block.flowing) return refuse('not-flowing', `${block.kind} blocks cannot be merged`)
  const neighbour = siblingBlock(map, block, other)
  if (!neighbour) {
    return refuse('no-neighbour', `no neighbouring editable block under the same parent (${other})`)
  }
  if (!neighbour.flowing) return refuse('not-flowing', `${neighbour.kind} blocks cannot be merged`)
  const [a, b] = other === 'next' ? [block, neighbour] : [neighbour, block]
  const { source } = map
  const ae = a.element
  const be = b.element
  const aEnd = closeTag(source, ae)
  const anchor = idAnchor(source, be)
  const replacements: RangeReplacement[] = []
  if (be.selfClosing) {
    replacements.push({
      start: ae.selfClosing ? ae.end - 2 : a.inner.end,
      end: be.end,
      text: (ae.selfClosing ? '>' : '') + anchor + aEnd,
    })
  } else {
    replacements.push({
      start: ae.selfClosing ? ae.end - 2 : a.inner.end,
      end: b.inner.start,
      text: (ae.selfClosing ? '>' : '') + anchor,
    })
    if (source.slice(b.inner.end, be.end) !== aEnd) {
      replacements.push({ start: b.inner.end, end: be.end, text: aEnd })
    }
  }
  return { ok: true, replacements }
}

function insertAfter(map: OpenChapter, block: ChapterBlock, text: string): EditReplacements {
  if (!block.flowing) return refuse('not-flowing', `cannot insert a block after a ${block.kind}`)
  const decoded = newBlockNotationToXhtml(text)
  if (!decoded.ok) return refuse('invalid-notation', decoded.error)
  const { source } = map
  const el = block.element
  const ws = source.slice(leadingWhitespace(source, el.start), el.start)
  const markup = ws + openTagWithoutId(source, el) + decoded.xhtml + `</${el.name}>`
  return { ok: true, replacements: [{ start: el.end, end: el.end, text: markup }] }
}

function nearestFlowingSibling(
  map: OpenChapter,
  block: ChapterBlock,
  direction: 'previous' | 'next',
): ChapterBlock | null {
  const parent = block.element.parent
  if (!parent) return null
  const siblings = parent.children
  const index = siblings.indexOf(block.element)
  const step = direction === 'next' ? 1 : -1
  for (let i = index + step; i >= 0 && i < siblings.length; i += step) {
    const node = siblings[i]!
    if (node.type !== 'element') continue
    const found = map.blocks.find((b) => b.element === node)
    if (found?.flowing) return found
  }
  return null
}

function deleteBlock(map: OpenChapter, block: ChapterBlock): EditReplacements {
  if (!block.flowing) return refuse('not-flowing', `${block.kind} blocks cannot be deleted`)
  const { source } = map
  const el = block.element
  const replacements: RangeReplacement[] = []
  const anchor = idAnchor(source, el)
  if (anchor) {
    const previous = nearestFlowingSibling(map, block, 'previous')
    const next = previous ? null : nearestFlowingSibling(map, block, 'next')
    if (!previous && !next) {
      return refuse(
        'no-anchor-host',
        'the block has an id and no flowing sibling under the same parent to keep it',
      )
    }
    replacements.push(
      previous
        ? contentInsertion(source, previous, 'end', anchor)
        : contentInsertion(source, next!, 'start', anchor),
    )
  }
  replacements.push({ start: leadingWhitespace(source, el.start), end: el.end, text: '' })
  return { ok: true, replacements }
}

function replaceText(
  map: OpenChapter,
  block: ChapterBlock,
  text: string,
  dropRuby: boolean,
): EditReplacements {
  const current = blockNotation(map, block, { dropRuby })
  if (current.text === text) return { ok: true, replacements: [] }
  const decoded = notationToXhtml(text, current.context)
  if (!decoded.ok) return refuse('invalid-notation', decoded.error)
  return { ok: true, replacements: innerReplacement(map.source, block, decoded.xhtml) }
}

function toggleMark(
  map: OpenChapter,
  block: ChapterBlock,
  mark: 'bold' | 'italic',
  start: number,
  end: number,
): EditReplacements {
  const length = plainLength(map, block)
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end > length
  ) {
    return refuse('bad-offset', `range [${start}, ${end}) is outside the block text (0–${length})`)
  }
  const { tree, context } = encodeBlock(map, block)
  const toggled = toggleMarkInTree(tree, mark === 'bold' ? 'b' : 'i', start, end)
  if (!toggled) return { ok: true, replacements: [] }
  return {
    ok: true,
    replacements: innerReplacement(map.source, block, notationTreeToXhtml(toggled, context)),
  }
}

/** The replacements one edit makes on `map.source`, or why it is refused. */
export function blockEditReplacements(map: OpenChapter, edit: BlockEdit): EditReplacements {
  const block = findBlock(map, edit.blockId)
  if (!block) return refuse('unknown-block', `no block ${edit.blockId} in this chapter`)
  switch (edit.op) {
    case 'replace':
      return replaceText(map, block, edit.text, edit.dropRuby === true)
    case 'insert_after':
      return insertAfter(map, block, edit.text)
    case 'delete':
      return deleteBlock(map, block)
    case 'split':
      return splitBlock(map, block, edit.offset)
    case 'merge':
      return mergeBlocks(map, block, edit.with)
    case 'line_break':
      return lineBreak(map, block, edit.offset)
    case 'toggle_mark':
      return toggleMark(map, block, edit.mark, edit.start, edit.end)
  }
}

/**
 * Applies one edit: the new block map (ids carried over, new blocks with
 * fresh ids listed in `created`) and the replacements that made it.
 */
export function applyBlockEdit(map: OpenChapter, edit: BlockEdit): EditResult {
  const computed = blockEditReplacements(map, edit)
  if (!computed.ok) return computed
  const { replacements } = computed
  if (replacements.length === 0) return { ok: true, map, replacements, created: [] }
  const source = applyReplacements(map.source, replacements)
  const next = remapChapter(map, source, replacements)
  if (next.broken)
    return refuse('not-well-formed', `the edit would break the chapter: ${next.error}`)
  const before = new Set(map.blocks.map((b) => b.id))
  const created = next.blocks.filter((b) => !before.has(b.id)).map((b) => b.id)
  return { ok: true, map: next, replacements, created }
}

/**
 * Applies edits in order, all or nothing. Block ids in later edits refer to
 * the chapter as the earlier edits left it. The replacements are composed
 * into one list against the original `map.source`.
 */
export function applyBlockEdits(
  map: OpenChapter,
  edits: readonly BlockEdit[],
):
  | { ok: true; map: OpenChapter; replacements: RangeReplacement[]; created: string[] }
  | { ok: false; index: number; refusal: EditRefusal } {
  let current = map
  let replacements: RangeReplacement[] = []
  const created: string[] = []
  for (const [index, edit] of edits.entries()) {
    const result = applyBlockEdit(current, edit)
    if (!result.ok) return { ok: false, index, refusal: result.refusal }
    replacements = composeReplacements(map.source, replacements, result.replacements)
    for (const id of result.created) created.push(id)
    current = result.map
  }
  const alive = new Set(current.blocks.map((b) => b.id))
  return { ok: true, map: current, replacements, created: created.filter((id) => alive.has(id)) }
}
