import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  nextZoom,
  pageLabel,
  paperSizeLabel,
  screenStart,
  stepPage,
  viewFromValue,
  viewValue,
  visibleSlots,
} from '../src/renderer/preview/preview-model'

describe('the preview zoom', () => {
  it('stays between 10 and 500 percent', () => {
    expect(clampZoom(-4)).toBe(MIN_ZOOM)
    expect(clampZoom(900)).toBe(MAX_ZOOM)
    expect(clampZoom(Number.NaN)).toBe(100)
  })

  it('walks the list by 25 percent steps at the ends and the usual steps between', () => {
    expect(nextZoom(100, 1)).toBe(125)
    expect(nextZoom(100, -1)).toBe(75)
    expect(nextZoom(10, -1)).toBe(10)
    expect(nextZoom(500, 1)).toBe(500)
    expect(nextZoom(120, 1)).toBe(125)
    expect(nextZoom(120, -1)).toBe(100)
  })
})

describe('the page view', () => {
  it('round trips its select values', () => {
    expect(viewValue('single')).toBe('single')
    expect(viewValue('facing')).toBe('facing')
    expect(viewValue({ cols: 2, rows: 2 })).toBe('2x2')
    expect(viewFromValue('2x2')).toEqual({ cols: 2, rows: 2 })
    expect(viewFromValue('4x4')).toEqual({ cols: 4, rows: 4 })
    expect(viewFromValue('8x8')).toEqual({ cols: 8, rows: 8 })
    expect(viewFromValue('9x9')).toBe('single')
    expect(viewFromValue('nonsense')).toBe('single')
  })

  it('shows one page, a facing pair with page 1 alone on the right, or a grid', () => {
    expect(visibleSlots(2, 'single', 5)).toEqual([2])
    expect(visibleSlots(0, 'facing', 5)).toEqual([null, 0])
    expect(visibleSlots(1, 'facing', 5)).toEqual([1, 2])
    expect(visibleSlots(2, 'facing', 5)).toEqual([1, 2])
    expect(visibleSlots(1, { cols: 2, rows: 2 }, 10)).toEqual([0, 1, 2, 3])
    expect(visibleSlots(9, { cols: 2, rows: 2 }, 10)).toEqual([8, 9])
    const big = visibleSlots(0, { cols: 8, rows: 8 }, 100)
    expect(big).toHaveLength(64)
    expect(big[0]).toBe(0)
    expect(big[63]).toBe(63)
  })

  it('moves by one page, by a facing pair, or by a grid screen', () => {
    expect(stepPage(2, 'single', 5, 1)).toBe(3)
    expect(stepPage(2, 'single', 5, -1)).toBe(1)
    expect(stepPage(0, 'facing', 5, 1)).toBe(1)
    expect(stepPage(1, 'facing', 5, 1)).toBe(3)
    expect(stepPage(2, 'facing', 5, -1)).toBe(0)
    expect(stepPage(5, { cols: 2, rows: 2 }, 10, 1)).toBe(8)
    expect(stepPage(5, { cols: 2, rows: 2 }, 10, -1)).toBe(0)
    expect(stepPage(9, { cols: 2, rows: 2 }, 10, 1)).toBe(9)
    expect(stepPage(0, { cols: 8, rows: 8 }, 100, 1)).toBe(64)
    expect(stepPage(64, { cols: 8, rows: 8 }, 100, -1)).toBe(0)
  })

  it('starts a screen on the page that holds the asked page', () => {
    expect(screenStart(0, 'facing', 5)).toBe(0)
    expect(screenStart(2, 'facing', 5)).toBe(1)
    expect(screenStart(5, { cols: 2, rows: 2 }, 10)).toBe(4)
  })
})

describe('the preview labels', () => {
  it('names one page, a facing pair, or a grid range', () => {
    expect(pageLabel(2, 'single', 5)).toBe('3 / 5')
    expect(pageLabel(0, 'facing', 5)).toBe('1 / 5')
    expect(pageLabel(1, 'facing', 5)).toBe('2–3 / 5')
    expect(pageLabel(4, 'facing', 5)).toBe('4–5 / 5')
    expect(pageLabel(5, { cols: 2, rows: 2 }, 10)).toBe('5–8 / 10')
    expect(pageLabel(9, { cols: 2, rows: 2 }, 10)).toBe('9–10 / 10')
    expect(pageLabel(0, 'single', 0)).toBe('0 / 0')
  })

  it('reads a page size in millimetres, as the print pages are measured', () => {
    expect(paperSizeLabel(793.7, 1122.5)).toBe('210 × 297 mm')
  })
})
