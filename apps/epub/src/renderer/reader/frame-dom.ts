/**
 * What the editor page does inside a loaded chapter frame. The frame runs no
 * script of its own (`sandbox="allow-same-origin"` without `allow-scripts`);
 * everything here is the page reaching into the frame's document, which the
 * shared origin allows.
 */
import { BLOCK_ATTR, VIEW_STYLE_ID } from './chapter-html'
import { FIND_HIGHLIGHT } from './view-prefs'

/** Where to put the reader once a chapter is drawn. */
export type ChapterTarget =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'block'; id: string }
  | { kind: 'fragment'; id: string }
  | { kind: 'hit'; start: number; length: number }

function scroller(doc: Document): Element {
  return doc.scrollingElement ?? doc.documentElement
}

export function frameEdges(doc: Document): { atStart: boolean; atEnd: boolean } {
  const el = scroller(doc)
  return {
    atStart: el.scrollTop <= 1,
    atEnd: el.scrollTop + el.clientHeight >= el.scrollHeight - 2,
  }
}

export function scrollToStart(doc: Document): void {
  scroller(doc).scrollTop = 0
}

export function scrollToEnd(doc: Document): void {
  const el = scroller(doc)
  el.scrollTop = el.scrollHeight
}

/** The element of a block, by engine id. */
export function blockElement(doc: Document, id: string): Element | null {
  for (const el of Array.from(doc.querySelectorAll(`[${BLOCK_ATTR}]`))) {
    if (el.getAttribute(BLOCK_ATTR) === id) return el
  }
  return null
}

/** The target of a fragment: an element with that id, else an anchor with that name. */
export function fragmentElement(doc: Document, fragment: string): Element | null {
  const byId = doc.getElementById(fragment)
  if (byId) return byId
  for (const el of Array.from(doc.querySelectorAll('[name]'))) {
    if (el.getAttribute('name') === fragment) return el
  }
  return null
}

export function scrollToElement(el: Element): void {
  el.scrollIntoView({ block: 'start' })
}

/** The first block at least partly below the top of the frame: where the reader is. */
export function topBlockId(doc: Document): string | null {
  const blocks = Array.from(doc.querySelectorAll(`[${BLOCK_ATTR}]`))
  for (const el of blocks) {
    if (el.getBoundingClientRect().bottom > 1) return el.getAttribute(BLOCK_ATTR)
  }
  return blocks.length > 0 ? (blocks.at(-1)!.getAttribute(BLOCK_ATTR) ?? null) : null
}

/** Replaces the frame's view settings style. */
export function applyViewCss(doc: Document, css: string): void {
  const style = doc.getElementById(VIEW_STYLE_ID)
  if (style && style.textContent !== css) style.textContent = css
}

interface HighlightWindow {
  Highlight?: new (...ranges: Range[]) => unknown
  CSS?: { highlights?: Map<string, unknown> }
}

/**
 * Marks a search hit without touching the chapter's DOM: a CSS custom
 * highlight when the frame has it, else the frame's selection. Scrolls it
 * into the middle of the view.
 */
export function showHit(doc: Document, range: Range): void {
  const win = doc.defaultView as (Window & HighlightWindow) | null
  const highlights = win?.CSS?.highlights
  if (win?.Highlight && highlights) {
    highlights.set(FIND_HIGHLIGHT, new win.Highlight(range))
  } else {
    const selection = doc.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
  const rect = range.getBoundingClientRect()
  const el = scroller(doc)
  el.scrollTop += rect.top - el.clientHeight / 3
}

export function clearHit(doc: Document): void {
  const win = doc.defaultView as (Window & HighlightWindow) | null
  win?.CSS?.highlights?.delete(FIND_HIGHLIGHT)
}
