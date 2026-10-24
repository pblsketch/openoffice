/**
 * Find and replace inside one block of the chapter source (spec §5).
 *
 * A match never crosses a block boundary: every block is searched on its
 * own. Within a block the text is read as the in-book search reads it
 * (white space collapsed to one space, a line break reads as a space, ruby
 * readings left out, case ignored), so replace finds what find lists.
 *
 * A replacement is written back as the block's notation with the matched
 * characters swapped (`replacedNotation`): inline elements stay where they
 * are, with their placeholders; an element whose text was all matched stays
 * as an empty element, so an `id` on it is kept.
 */
import type { ChapterBlock, XmlElement, XmlNode } from '@genoffice/epub-engine'
import { findInText } from '@genoffice/ui'
import { normalizeQuery } from '../reader/book-search'
import { OPAQUE_ELEMENTS, escapeNotationText } from './engine'

/** A plain-text range `[start, end)` of a block and what it becomes. */
export interface PlainReplacement {
  start: number
  end: number
  text: string
}

const BOLD = new Set(['strong', 'b'])
const ITALIC = new Set(['em', 'i'])
/** Not read by the in-book search (ruby readings). */
const UNREAD = new Set(['rt', 'rp'])

function hasContent(el: XmlElement): boolean {
  return el.children.some((c) => c.type === 'text' || c.type === 'element')
}

/**
 * The block's notation with `edits` applied to its plain text. Without
 * edits it is the engine's own notation of the block.
 */
export function replacedNotation(block: ChapterBlock, edits: readonly PlainReplacement[]): string {
  const sorted = [...edits].sort((a, b) => a.start - b.start)
  let pos = 0
  let n = 0
  const text = (value: string): string => {
    let raw = ''
    for (let i = 0; i < value.length; i++) {
      const at = pos + i
      const edit = sorted.find((e) => e.start <= at && at < e.end)
      if (!edit) raw += value[i]
      else if (at === edit.start) raw += edit.text
    }
    pos += value.length
    return escapeNotationText(raw)
  }
  const walk = (children: readonly XmlNode[]): string => {
    let out = ''
    for (const node of children) {
      if (node.type === 'text') {
        out += text(node.value)
        continue
      }
      if (node.type !== 'element') continue
      const plain = node.attributes.length === 0
      if (plain && node.local === 'br' && !hasContent(node)) {
        out += '<br/>'
        continue
      }
      const empty = OPAQUE_ELEMENTS.has(node.local) || !hasContent(node)
      if (!empty && plain && (BOLD.has(node.local) || ITALIC.has(node.local))) {
        const mark = BOLD.has(node.local) ? 'b' : 'i'
        out += `<${mark}>${walk(node.children)}</${mark}>`
        continue
      }
      const number = ++n
      out += empty ? `<x${number}/>` : `<x${number}>${walk(node.children)}</x${number}>`
    }
    return out
  }
  return walk(block.element.children)
}

/** The block's reading text, with the plain-text offset of each of its characters. */
export function blockReadingText(block: ChapterBlock): { text: string; plainOf: number[] } {
  const parts: string[] = []
  const plainOf: number[] = []
  let pos = 0
  let last = ''
  let pendingBreak = false
  let breakAt = -1
  const push = (ch: string, at: number): void => {
    parts.push(ch)
    plainOf.push(at)
    last = ch
  }
  const walk = (children: readonly XmlNode[], read: boolean): void => {
    for (const node of children) {
      if (node.type === 'text') {
        for (let i = 0; i < node.value.length; i++, pos++) {
          if (!read) continue
          const ch = node.value[i]!
          if (/\s/.test(ch)) {
            if (last !== '' && last !== ' ' && !pendingBreak) {
              pendingBreak = true
              breakAt = pos
            }
            continue
          }
          if (pendingBreak && last !== '' && last !== ' ') push(' ', breakAt < 0 ? pos : breakAt)
          pendingBreak = false
          breakAt = -1
          push(ch, pos)
        }
        continue
      }
      if (node.type !== 'element') continue
      if (OPAQUE_ELEMENTS.has(node.local)) continue
      if (node.local === 'br') {
        if (last !== '' && !pendingBreak) {
          pendingBreak = true
          breakAt = -1
        }
        continue
      }
      const empty = !hasContent(node)
      if (empty) continue
      walk(node.children, read && !UNREAD.has(node.local))
    }
  }
  walk(block.element.children, true)
  return { text: parts.join(''), plainOf }
}

/** Where `query` is in the block, as plain-text ranges; case is ignored and white space collapsed. */
export function blockMatches(
  block: ChapterBlock,
  query: string,
): Array<{ start: number; end: number }> {
  const needle = normalizeQuery(query)
  if (!needle) return []
  const { text, plainOf } = blockReadingText(block)
  return findInText(text, needle, { matchCase: false, wholeWord: false }).map((at) => ({
    start: plainOf[at]!,
    end: plainOf[at + needle.length - 1]! + 1,
  }))
}

/** How many times `query` is in a reading text (what the search lists for a chapter). */
export function countMatches(readingText: string, query: string): number {
  const needle = normalizeQuery(query)
  if (!needle) return 0
  return findInText(readingText, needle, { matchCase: false, wholeWord: false }).length
}

/**
 * The plain-text offset of a source position inside a block (where the
 * caret goes after an undo). Entities count as one character only roughly;
 * the result is clamped to the block.
 */
export function plainOffsetAtSource(block: ChapterBlock, position: number): number {
  let count = 0
  const walk = (children: readonly XmlNode[]): boolean => {
    for (const node of children) {
      if (node.start >= position) return true
      if (node.type === 'text') {
        if (node.end <= position) count += node.value.length
        else {
          count += Math.min(node.value.length, position - node.start)
          return true
        }
        continue
      }
      if (node.type !== 'element' || OPAQUE_ELEMENTS.has(node.local)) continue
      if (walk(node.children)) return true
    }
    return false
  }
  walk(block.element.children)
  return count
}
