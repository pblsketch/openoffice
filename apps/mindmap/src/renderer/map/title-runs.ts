/**
 * The parts of a title on screen: drawn on a topic, and in the edit box while
 * the title is typed.
 *
 * A part is a span with the part's text as `textContent` and its format set
 * through the filter in `style-values.ts`. Nothing here uses `innerHTML`, and
 * no text of the file reaches an attribute or a style.
 *
 * The edit box stays the library's plain text box (`plaintext-only`), so what
 * is typed or pasted is text. The spans in it are put there by this module;
 * their format is kept beside them (`formatOf`), never read off the markup. So
 * the parts read back from the box are the characters it holds, each with the
 * format of the span it sits in, and nothing the box could have taken in.
 */
import type { ViewRunStyle, ViewTitleRun } from '@genoffice/xmind-engine'
import {
  decorationValue,
  fontFamilyValue,
  isPlainText,
  ownTextStyle,
  type OwnTextStyle,
} from './style-values'
import { lineHeightFor } from './look'

export const TITLE_RUN_CLASS = 'mm-run'

/** A part as it is drawn. */
export interface DrawnRun {
  text: string
  own: OwnTextStyle
}

/**
 * The parts to draw for a title: null unless they are a list of parts with
 * text that spells the title and at least one of them carries a format that
 * gets through the filter.
 */
export function drawnRuns(runs: unknown, title: string): DrawnRun[] | null {
  if (!Array.isArray(runs) || runs.length === 0) return null
  const out: DrawnRun[] = []
  for (const run of runs as unknown[]) {
    if (typeof run !== 'object' || run === null) return null
    const { text, style } = run as { text?: unknown; style?: unknown }
    if (typeof text !== 'string') return null
    out.push({
      text,
      own: ownTextStyle(typeof style === 'object' ? (style as ViewRunStyle) : null),
    })
  }
  if (out.map((run) => run.text).join('') !== title) return null
  return out.some((run) => !isPlainText(run.own)) ? out : null
}

/** Puts a part's format on an element, through the filter's values only. */
export function dressRun(element: HTMLElement, own: OwnTextStyle): void {
  const { style } = element
  style.color = own.color ?? ''
  style.fontWeight = own.fontWeight === null ? '' : String(own.fontWeight)
  style.fontSize = own.fontSize === null ? '' : `${own.fontSize}px`
  style.lineHeight = own.fontSize === null ? '' : `${lineHeightFor(own.fontSize)}px`
  style.fontFamily = own.fontFamily === null ? '' : fontFamilyValue(own.fontFamily)
  style.fontStyle = own.italic === null ? '' : own.italic ? 'italic' : 'normal'
  style.textDecoration = own.decoration === null ? '' : decorationValue(own.decoration)
}

export function runElement(run: DrawnRun): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = TITLE_RUN_CLASS
  span.textContent = run.text
  dressRun(span, run.own)
  return span
}

// ---- the edit box ----

/** The format of each span this module put into an edit box. */
const formatOf = new WeakMap<Element, ViewRunStyle>()

/** Fills the edit box with the parts of a title. */
export function fillBox(box: HTMLElement, runs: readonly ViewTitleRun[]): void {
  box.replaceChildren(
    ...runs.map((run) => {
      const span = runElement({ text: run.text, own: ownTextStyle(run.style) })
      formatOf.set(span, { ...run.style })
      return span
    }),
  )
}

/**
 * The parts the edit box holds: its characters, each with the format of the
 * span this module put it in, or none. A line break is a `\n`, as the box's
 * text has it.
 */
export function readBox(box: Node): ViewTitleRun[] {
  const out: ViewTitleRun[] = []
  walkText(box, (text, style) => {
    const last = out.at(-1)
    if (last && last.style === style) last.text += text
    else out.push({ text, style })
  })
  return out.map((run) => ({ text: run.text, style: { ...run.style } }))
}

const PLAIN: ViewRunStyle = Object.freeze({}) as ViewRunStyle

/** Every piece of text below `root` in order, with the format it sits in. */
function walkText(root: Node, visit: (text: string, style: ViewRunStyle) => void): void {
  let seen = false
  const walk = (node: Node, style: ViewRunStyle): void => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.nodeValue ?? ''
        if (text !== '') {
          seen = true
          visit(text, style)
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as Element
        if (element.localName === 'br') {
          seen = true
          visit('\n', style)
          continue
        }
        const own = formatOf.get(element) ?? style
        // a line the box started as a block of its own begins on a new line
        if (element.localName === 'div' && seen) visit('\n', own)
        walk(element, own)
      }
    }
  }
  walk(root, PLAIN)
}

function textLength(root: Node): number {
  let length = 0
  walkText(root, (text) => (length += text.length))
  return length
}

/** Where the selection lies in the box's text, as character positions; null when it is not in the box. */
export function selectionIn(box: HTMLElement): { start: number; end: number } | null {
  const selection = box.ownerDocument.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!box.contains(range.startContainer) || !box.contains(range.endContainer)) return null
  const start = offsetOf(box, range.startContainer, range.startOffset)
  const end = offsetOf(box, range.endContainer, range.endOffset)
  return start <= end ? { start, end } : { start: end, end: start }
}

/** Selects characters `start` to `end` of the box's text. */
export function selectIn(box: HTMLElement, start: number, end: number): void {
  const selection = box.ownerDocument.getSelection()
  if (!selection) return
  const range = box.ownerDocument.createRange()
  const from = pointAt(box, start)
  const to = pointAt(box, end)
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  selection.removeAllRanges()
  selection.addRange(range)
}

/** The position in the box's text of a point given as a node and an offset in it. */
function offsetOf(box: HTMLElement, container: Node, offset: number): number {
  const range = box.ownerDocument.createRange()
  range.setStart(box, 0)
  range.setEnd(container, offset)
  return textLength(range.cloneContents())
}

/** The text node and offset at a character position of the box's text. */
function pointAt(box: HTMLElement, position: number): { node: Node; offset: number } {
  // counted the way `walkText` counts: text, a line break as one, a block after text as one
  let left = position
  let seen = false
  const walk = (node: Node): { node: Node; offset: number } | null => {
    for (const [index, child] of [...node.childNodes].entries()) {
      if (child.nodeType === Node.TEXT_NODE) {
        const length = child.nodeValue?.length ?? 0
        if (length === 0) continue
        if (left <= length) return { node: child, offset: left }
        left -= length
        seen = true
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as Element
        if (element.localName === 'br' || (element.localName === 'div' && seen)) {
          if (left === 0) return { node, offset: index }
          left -= 1
          seen = true
          if (element.localName === 'br') continue
        }
        const inside = walk(element)
        if (inside) return inside
      }
    }
    return null
  }
  return walk(box) ?? { node: box, offset: box.childNodes.length }
}
