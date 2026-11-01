/**
 * Colors on the selection bar: the three highlighter pens, the remembered
 * color of each line markup, what a pen click does to the selection, and
 * where the bar sits so it never leaves the viewer. Pure; the caller owns
 * storage and the DOM.
 */
import type { MarkupType } from '../shared/ipc'
import { MARKUP_COLORS, MARKUP_PALETTE } from './annotations'

export type Rgb = [number, number, number]

/** markups whose color the bar remembers per type (the highlighter has pens) */
export type LineMarkupType = Exclude<MarkupType, 'highlight'>
export const LINE_MARKUP_TYPES: readonly LineMarkupType[] = ['underline', 'squiggly', 'strikeout']

const paletteColor = (hex: string): Rgb => {
  const found = MARKUP_PALETTE.find((p) => p.hex === hex)
  if (!found) throw new Error(`not in the markup palette: ${hex}`)
  return [...found.color]
}

/** yellow, green, cyan: light enough that text under them stays readable */
export const DEFAULT_HIGHLIGHT_PENS: readonly Rgb[] = [
  paletteColor('#FFDE59'),
  paletteColor('#7CB342'),
  paletteColor('#00ACC1'),
]

export const HIGHLIGHT_PENS_KEY = 'genoffice-pdf-highlight-pens'
export const LINE_MARKUP_COLORS_KEY = 'genoffice-pdf-line-markup-colors'

export function sameColor(a: readonly number[], b: readonly number[]): boolean {
  return a.length === 3 && b.length === 3 && a.every((v, i) => Math.abs(v - b[i]!) < 0.01)
}

const isRgb = (v: unknown): v is Rgb =>
  Array.isArray(v) &&
  v.length === 3 &&
  v.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)

const readJson = (raw: string | null): unknown => {
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/** the stored pens; any malformed slot falls back to its default */
export function parseHighlightPens(raw: string | null): Rgb[] {
  const stored = readJson(raw)
  return DEFAULT_HIGHLIGHT_PENS.map((def, i) => {
    const v = Array.isArray(stored) ? stored[i] : undefined
    return isRgb(v) ? [...v] : [...def]
  })
}

/** the stored line markup colors; missing or malformed entries use MARKUP_COLORS */
export function parseLineMarkupColors(raw: string | null): Record<LineMarkupType, Rgb> {
  const stored = readJson(raw)
  const obj = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
  const out = {} as Record<LineMarkupType, Rgb>
  for (const type of LINE_MARKUP_TYPES) {
    const v = obj[type]
    out[type] = isRgb(v) ? [...v] : [...MARKUP_COLORS[type]]
  }
  return out
}

/** per page of the selection: null = no highlight there, else the color it has */
export type PenPageState<P> = { page: P; existing: Rgb | null }

export type PenPlan<P> = { kind: 'remove'; pages: P[] } | { kind: 'paint'; add: P[]; recolor: P[] }

/**
 * What clicking a pen does: a selection already highlighted in that color on
 * every page loses the highlight (the bar's toggle); otherwise unmarked pages
 * get the pen's color and pages highlighted in another color are recolored,
 * not stacked.
 */
export function planHighlightPen<P>(pages: readonly PenPageState<P>[], pen: Rgb): PenPlan<P> {
  if (pages.length > 0 && pages.every((p) => p.existing && sameColor(p.existing, pen))) {
    return { kind: 'remove', pages: pages.map((p) => p.page) }
  }
  return {
    kind: 'paint',
    add: pages.filter((p) => !p.existing).map((p) => p.page),
    recolor: pages.filter((p) => p.existing && !sameColor(p.existing, pen)).map((p) => p.page),
  }
}

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** the height of the bar's button row (28px buttons, 4px padding, 1px border) */
export const SEL_BAR_ROW_HEIGHT = 38

/** clamp a span of `size` starting at `want` into [lo, hi]; pinned to `lo` when it cannot fit */
const clampSpan = (want: number, size: number, lo: number, hi: number): number =>
  hi - size < lo ? lo : Math.min(Math.max(want, lo), hi - size)

/**
 * Where the bar goes: centered over the selection on its `side`, and kept
 * wholly inside `bounds` (the viewer); on an axis where the viewer is too
 * small for it, inside `outer` (the window) instead. The side is chosen when
 * the bar opens and kept while the bar grows, so growing above extends upward
 * and growing below extends downward: the buttons under the pointer stay.
 */
export function placeSelectionBar(o: {
  anchor: Box
  width: number
  height: number
  bounds: Box
  outer: Box
  side: 'above' | 'below'
  gap?: number
  margin?: number
}): { left: number; top: number } {
  const gap = o.gap ?? 8
  const m = o.margin ?? 6
  const { anchor, width, height } = o
  const fitsX = o.bounds.right - o.bounds.left - 2 * m >= width
  const fitsY = o.bounds.bottom - o.bounds.top - 2 * m >= height
  const bx = fitsX ? o.bounds : o.outer
  const by = fitsY ? o.bounds : o.outer
  const center = (anchor.left + anchor.right) / 2
  const left = clampSpan(center - width / 2, width, bx.left + m, bx.right - m)
  const want = o.side === 'above' ? anchor.top - gap - height : anchor.bottom + gap
  const top = clampSpan(want, height, by.top + m, by.bottom - m)
  return { left: Math.round(left), top: Math.round(top) }
}

/** the side the bar opens on: above when its first row fits there inside the viewer */
export function selectionBarSide(
  anchor: Box,
  bounds: Box,
  rowHeight: number,
  gap = 8,
  margin = 6,
): 'above' | 'below' {
  return anchor.top - gap - rowHeight >= bounds.top + margin ? 'above' : 'below'
}
