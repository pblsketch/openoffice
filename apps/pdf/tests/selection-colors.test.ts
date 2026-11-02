import { describe, expect, it } from 'vitest'
import { MARKUP_COLORS, MARKUP_PALETTE } from '../src/renderer/annotations'
import {
  DEFAULT_HIGHLIGHT_PENS,
  parseHighlightPens,
  parseLineMarkupColors,
  placeSelectionBar,
  planHighlightPen,
  sameColor,
  selectionBarSide,
  type Rgb,
} from '../src/renderer/selection-colors'

const YELLOW = DEFAULT_HIGHLIGHT_PENS[0]!
const GREEN = DEFAULT_HIGHLIGHT_PENS[1]!

describe('highlighter pens', () => {
  it('defaults to yellow, green and cyan from the markup palette', () => {
    expect(DEFAULT_HIGHLIGHT_PENS).toHaveLength(3)
    for (const pen of DEFAULT_HIGHLIGHT_PENS) {
      expect(MARKUP_PALETTE.some((p) => sameColor(p.color, pen))).toBe(true)
    }
    // the first pen is the highlighter's long-standing default
    expect(sameColor(YELLOW, MARKUP_COLORS.highlight)).toBe(true)
  })

  it('reads stored pens and falls back per slot', () => {
    const purple: Rgb = [0.5, 0.3, 0.8]
    expect(parseHighlightPens(JSON.stringify([purple, 'x', [2, 0, 0]]))).toEqual([
      purple,
      [...GREEN],
      [...DEFAULT_HIGHLIGHT_PENS[2]!],
    ])
    expect(parseHighlightPens(null)).toEqual(DEFAULT_HIGHLIGHT_PENS.map((p) => [...p]))
    expect(parseHighlightPens('{not json')).toEqual(DEFAULT_HIGHLIGHT_PENS.map((p) => [...p]))
  })

  it('reads stored line markup colors with MARKUP_COLORS as the fallback', () => {
    const colors = parseLineMarkupColors(JSON.stringify({ underline: [1, 0, 0], strikeout: 'red' }))
    expect(colors.underline).toEqual([1, 0, 0])
    expect(colors.squiggly).toEqual(MARKUP_COLORS.squiggly)
    expect(colors.strikeout).toEqual(MARKUP_COLORS.strikeout)
  })
})

describe('planHighlightPen', () => {
  it('removes a selection highlighted in the pen color on every page', () => {
    const plan = planHighlightPen(
      [
        { page: 1, existing: [...YELLOW] as Rgb },
        { page: 2, existing: [1, 0.871, 0.349] },
      ],
      YELLOW,
    )
    expect(plan).toEqual({ kind: 'remove', pages: [1, 2] })
  })

  it('recolors another color instead of stacking, and paints unmarked pages', () => {
    const plan = planHighlightPen(
      [
        { page: 1, existing: [...YELLOW] as Rgb },
        { page: 2, existing: null },
        { page: 3, existing: [...GREEN] as Rgb },
      ],
      GREEN,
    )
    expect(plan).toEqual({ kind: 'paint', add: [2], recolor: [1] })
  })

  it('paints an unmarked selection', () => {
    expect(planHighlightPen([{ page: 0, existing: null }], YELLOW)).toEqual({
      kind: 'paint',
      add: [0],
      recolor: [],
    })
  })
})

describe('placeSelectionBar', () => {
  const viewer = { left: 200, top: 100, right: 1000, bottom: 700 }
  const screen = { left: 0, top: 0, right: 1200, bottom: 800 }
  const base = { width: 400, height: 38, bounds: viewer, outer: screen }

  it('centers above the selection', () => {
    const anchor = { left: 500, top: 400, right: 700, bottom: 420 }
    expect(placeSelectionBar({ ...base, anchor, side: 'above' })).toEqual({
      left: 400,
      top: 400 - 8 - 38,
    })
  })

  it('stays inside the viewer near its right edge', () => {
    const anchor = { left: 950, top: 400, right: 995, bottom: 420 }
    const { left } = placeSelectionBar({ ...base, anchor, side: 'above' })
    expect(left + 400).toBeLessThanOrEqual(1000 - 6)
  })

  it('stays inside the viewer near its left edge', () => {
    const anchor = { left: 205, top: 400, right: 230, bottom: 420 }
    expect(placeSelectionBar({ ...base, anchor, side: 'above' }).left).toBe(206)
  })

  it('grows away from the selection: above keeps its bottom, below keeps its top', () => {
    const anchor = { left: 500, top: 400, right: 700, bottom: 420 }
    const short = placeSelectionBar({ ...base, anchor, side: 'above' })
    const tall = placeSelectionBar({ ...base, anchor, side: 'above', height: 70 })
    expect(short.top + 38).toBe(tall.top + 70)
    const below = placeSelectionBar({ ...base, anchor, side: 'below' })
    const belowTall = placeSelectionBar({ ...base, anchor, side: 'below', height: 70 })
    expect(below.top).toBe(belowTall.top)
  })

  it('uses the window when the viewer is narrower than the bar', () => {
    const narrow = { left: 900, top: 100, right: 1150, bottom: 700 }
    const anchor = { left: 1100, top: 400, right: 1140, bottom: 420 }
    const { left } = placeSelectionBar({ ...base, bounds: narrow, anchor, side: 'above' })
    expect(left).toBeGreaterThanOrEqual(6)
    expect(left + 400).toBeLessThanOrEqual(1200 - 6)
  })

  it('keeps the bar on screen when the selection fills the viewer', () => {
    const anchor = { left: 300, top: 90, right: 900, bottom: 720 }
    const { top } = placeSelectionBar({ ...base, anchor, side: 'below' })
    expect(top + 38).toBeLessThanOrEqual(700 - 6)
  })
})

describe('selectionBarSide', () => {
  const viewer = { left: 0, top: 100, right: 1000, bottom: 700 }
  it('opens above when the row fits there inside the viewer, else below', () => {
    expect(selectionBarSide({ left: 0, top: 300, right: 10, bottom: 320 }, viewer, 38)).toBe(
      'above',
    )
    expect(selectionBarSide({ left: 0, top: 130, right: 10, bottom: 150 }, viewer, 38)).toBe(
      'below',
    )
  })
})
