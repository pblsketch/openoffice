/**
 * The book preview's page arithmetic. The box positions below are what
 * Chromium reported for chapters laid out with `previewCss` (a 600×800
 * e-reader page, a 1024×768 two-page spread, right-to-left text and vertical
 * writing), so the page a block lands on is checked against a real layout.
 */
import { describe, expect, it } from 'vitest'
import {
  DEVICE_SIZES,
  PREVIEW_DEFAULTS,
  STAGE_GAP,
  fitScale,
  fixedViewport,
  pageCount,
  pageGeometry,
  pageOfBox,
  previewCss,
  readPreviewSettings,
  screenSize,
  stepPreviewFont,
  viewCount,
  viewOfPage,
  viewOffset,
} from '../src/renderer/reader/preview-pages'
import type { FrameColors } from '../src/renderer/reader/view-prefs'

const COLORS: FrameColors = {
  paper: 'var-paper',
  ink: 'var-ink',
  nightPaper: 'var-night-paper',
  nightInk: 'var-night-ink',
  nightLink: 'var-night-link',
  sepiaPaper: 'var-sepia-paper',
  sepiaInk: 'var-sepia-ink',
  hitBg: 'var-hit-bg',
  hitInk: 'var-hit-ink',
}

const LTR = { axis: 'horizontal', rtl: false } as const
const RTL = { axis: 'horizontal', rtl: true } as const
const VERTICAL = { axis: 'vertical', rtl: false } as const

describe('preview settings', () => {
  it('keeps only known values from what was saved', () => {
    expect(readPreviewSettings(null)).toEqual(PREVIEW_DEFAULTS)
    expect(readPreviewSettings('not json')).toEqual(PREVIEW_DEFAULTS)
    expect(
      readPreviewSettings(
        JSON.stringify({ device: 'phone', landscape: true, theme: 'sepia', fontScale: 1.5 }),
      ),
    ).toEqual({ device: 'phone', landscape: true, theme: 'sepia', fontScale: 1.5 })
    expect(
      readPreviewSettings(
        JSON.stringify({ device: 'watch', landscape: 'yes', theme: 'neon', fontScale: 9 }),
      ),
    ).toEqual(PREVIEW_DEFAULTS)
  })

  it('steps the text size inside its range', () => {
    expect(stepPreviewFont(1, 1)).toBe(1.15)
    expect(stepPreviewFont(1, -1)).toBe(0.9)
    expect(stepPreviewFont(2, 1)).toBe(2)
    expect(stepPreviewFont(0.75, -1)).toBe(0.75)
  })
})

describe('the screen', () => {
  const stage = { width: 1000, height: 700 }

  it('uses the device size, turned on its side when landscape', () => {
    expect(screenSize({ ...PREVIEW_DEFAULTS, device: 'ereader' }, stage)).toEqual(
      DEVICE_SIZES.ereader,
    )
    expect(screenSize({ ...PREVIEW_DEFAULTS, device: 'tablet', landscape: true }, stage)).toEqual({
      width: 1024,
      height: 768,
    })
  })

  it('fills the preview area for "fit", with an even width and a smallest size', () => {
    expect(screenSize({ ...PREVIEW_DEFAULTS, device: 'fit', landscape: true }, stage)).toEqual({
      width: 1000 - 2 * STAGE_GAP,
      height: 700 - 2 * STAGE_GAP,
    })
    expect(
      screenSize({ ...PREVIEW_DEFAULTS, device: 'fit' }, { width: 501, height: 401 }).width % 2,
    ).toBe(0)
    expect(screenSize({ ...PREVIEW_DEFAULTS, device: 'fit' }, { width: 50, height: 50 })).toEqual({
      width: 240,
      height: 320,
    })
  })

  it('shrinks a screen that does not fit, and never enlarges one', () => {
    expect(fitScale({ width: 768, height: 1024 }, stage)).toBeCloseTo((700 - 2 * STAGE_GAP) / 1024)
    expect(fitScale({ width: 390, height: 500 }, { width: 2000, height: 2000 })).toBe(1)
  })

  it('shows two pages side by side only on a wide landscape screen', () => {
    expect(pageGeometry({ width: 600, height: 800 }, 'horizontal').columns).toBe(1)
    expect(pageGeometry({ width: 1024, height: 768 }, 'horizontal').columns).toBe(2)
    expect(pageGeometry({ width: 844, height: 390 }, 'horizontal').columns).toBe(1)
    // vertical writing turns one page at a time
    expect(pageGeometry({ width: 1024, height: 768 }, 'vertical').columns).toBe(1)
  })
})

describe('the page CSS', () => {
  it('cuts the chapter into columns one page wide', () => {
    const geom = pageGeometry({ width: 600, height: 800 }, 'horizontal')
    const css = previewCss(geom, PREVIEW_DEFAULTS, COLORS)
    expect(css).toContain(`column-width: ${600 - 2 * geom.marginX}px`)
    expect(css).toContain(`column-gap: ${2 * geom.marginX}px`)
    expect(css).toContain('width: 600px !important; height: 800px !important')
    expect(css).toContain('var-paper')
    expect(css).not.toContain('font-size')
  })

  it("carries the reader's text size and paper", () => {
    const geom = pageGeometry({ width: 600, height: 800 }, 'horizontal')
    const css = previewCss(geom, { ...PREVIEW_DEFAULTS, theme: 'sepia', fontScale: 1.3 }, COLORS)
    expect(css).toContain('font-size: 130% !important')
    expect(css).toContain('var-sepia-paper')
    const dark = previewCss(geom, { ...PREVIEW_DEFAULTS, theme: 'dark' }, COLORS)
    expect(dark).toContain('var-night-paper')
  })

  it('runs the columns downwards for vertical writing', () => {
    const geom = pageGeometry({ width: 600, height: 800 }, 'vertical')
    const css = previewCss(geom, PREVIEW_DEFAULTS, COLORS)
    expect(css).toContain(`column-width: ${800 - 2 * geom.marginY}px`)
    expect(css).toContain(`column-gap: ${2 * geom.marginY}px`)
  })
})

describe('pages and views', () => {
  it('counts the pages of a laid-out chapter', () => {
    const single = pageGeometry({ width: 600, height: 800 }, 'horizontal')
    // Chromium: 40 paragraphs ran 6558 px on a 600 px page
    expect(pageCount(single, { scrollWidth: 6558, scrollHeight: 800 })).toBe(11)
    expect(pageCount(single, { scrollWidth: 600, scrollHeight: 800 })).toBe(1)
    expect(pageCount(single, { scrollWidth: 601, scrollHeight: 800 })).toBe(1)
    expect(pageCount(single, { scrollWidth: 0, scrollHeight: 0 })).toBe(1)
    const spread = pageGeometry({ width: 1024, height: 768 }, 'horizontal')
    expect(pageCount(spread, { scrollWidth: 6620, scrollHeight: 768 })).toBe(13)
    expect(viewCount(spread, 13)).toBe(7)
    const vertical = pageGeometry({ width: 600, height: 800 }, 'vertical')
    expect(pageCount(vertical, { scrollWidth: 600, scrollHeight: 5560 })).toBe(7)
  })

  it('moves one view at a time, the other way for right-to-left books', () => {
    const single = pageGeometry({ width: 600, height: 800 }, 'horizontal')
    expect(viewOffset(single, LTR, 2)).toEqual({ left: 1200, top: 0 })
    expect(viewOffset(single, RTL, 2)).toEqual({ left: -1200, top: 0 })
    const spread = pageGeometry({ width: 1024, height: 768 }, 'horizontal')
    expect(viewOffset(spread, LTR, 2)).toEqual({ left: 2048, top: 0 })
    const vertical = pageGeometry({ width: 600, height: 800 }, 'vertical')
    expect(viewOffset(vertical, VERTICAL, 2)).toEqual({ left: 0, top: 1600 })
  })

  it('finds the page a block is on, as Chromium laid it out', () => {
    const single = pageGeometry({ width: 600, height: 800 }, 'horizontal')
    expect(pageOfBox(single, LTR, { left: 42, right: 558, top: 40 }, { left: 1200, top: 0 })).toBe(
      2,
    )
    const spread = pageGeometry({ width: 1024, height: 768 }, 'horizontal')
    const left = pageOfBox(spread, LTR, { left: 36, right: 476, top: 38 }, { left: 2048, top: 0 })
    const right = pageOfBox(
      spread,
      LTR,
      { left: 548, right: 988, top: 146 },
      { left: 2048, top: 0 },
    )
    expect([left, right]).toEqual([4, 5])
    expect(viewOfPage(spread, left)).toBe(2)
    expect(viewOfPage(spread, right)).toBe(2)
    expect(
      pageOfBox(single, RTL, { left: 42, right: 558, top: 102 }, { left: -1200, top: 0 }),
    ).toBe(2)
    const vertical = pageGeometry({ width: 600, height: 800 }, 'vertical')
    expect(
      pageOfBox(vertical, VERTICAL, { left: 420, right: 489, top: 40 }, { left: 0, top: 1600 }),
    ).toBe(2)
  })
})

describe('fixed-layout pages', () => {
  it("reads the page size from the chapter's viewport", () => {
    expect(
      fixedViewport('<head><meta name="viewport" content="width=1200, height=1600"/></head>'),
    ).toEqual({ width: 1200, height: 1600 })
    expect(fixedViewport("<meta content='height=900,width=600' name='viewport'>")).toEqual({
      width: 600,
      height: 900,
    })
    expect(fixedViewport('<meta name="viewport" content="width=device-width"/>')).toBeNull()
    expect(fixedViewport('<p>no viewport</p>')).toBeNull()
  })
})
