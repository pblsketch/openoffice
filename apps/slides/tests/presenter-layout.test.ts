import { describe, expect, it } from 'vitest'
import {
  clampPresenterSideW,
  parsePresenterSideW,
  presenterNextThumbW,
  presenterSideMaxW,
  presenterSideWAtPointer,
  presenterSideWForKey,
  PRESENTER_MAIN_MIN_W,
  PRESENTER_SIDE_STEP,
  PRESENTER_SIDE_STEP_LARGE,
  PRESENTER_SIDE_W_DEFAULT,
  PRESENTER_SIDE_W_MIN,
} from '../src/renderer/presenter-layout'

describe('presenter side column width', () => {
  it('keeps the main area room for the bottom row and the column its minimum', () => {
    expect(presenterSideMaxW(1920)).toBe(1920 - PRESENTER_MAIN_MIN_W)
    expect(clampPresenterSideW(5000, 1920)).toBe(1920 - PRESENTER_MAIN_MIN_W)
    expect(clampPresenterSideW(10, 1920)).toBe(PRESENTER_SIDE_W_MIN)
    expect(clampPresenterSideW(512.4, 1920)).toBe(512)
    // a window too small for both: the column keeps its minimum
    expect(presenterSideMaxW(700)).toBe(PRESENTER_SIDE_W_MIN)
    expect(clampPresenterSideW(600, 700)).toBe(PRESENTER_SIDE_W_MIN)
    expect(clampPresenterSideW(Number.NaN, 1920)).toBe(PRESENTER_SIDE_W_DEFAULT)
  })

  it('draws the old fixed width until someone drags it', () => {
    expect(PRESENTER_SIDE_W_DEFAULT).toBe(340)
    expect(parsePresenterSideW(null)).toBe(PRESENTER_SIDE_W_DEFAULT)
    expect(parsePresenterSideW('')).toBe(PRESENTER_SIDE_W_DEFAULT)
    expect(parsePresenterSideW('abc')).toBe(PRESENTER_SIDE_W_DEFAULT)
    expect(parsePresenterSideW('-20')).toBe(PRESENTER_SIDE_W_DEFAULT)
    expect(parsePresenterSideW('720')).toBe(720)
  })

  it('a remembered width wider than this screen is drawn narrower but not forgotten', () => {
    const remembered = parsePresenterSideW('1100')
    expect(clampPresenterSideW(remembered, 1366)).toBe(1366 - PRESENTER_MAIN_MIN_W)
    expect(clampPresenterSideW(remembered, 2560)).toBe(1100)
  })

  it('measures the drag from the edge the column sits on', () => {
    const body = { left: 0, right: 1920 }
    expect(presenterSideWAtPointer(1500, body, false)).toBe(420)
    // right to left: the column is at the left edge
    expect(presenterSideWAtPointer(420, body, true)).toBe(420)
    expect(presenterSideWAtPointer(500, { left: 100, right: 1300 }, true)).toBe(400)
  })
})

describe('presenter splitter keys', () => {
  const opts = { shift: false, rtl: false, windowW: 1920 }

  it('moves the splitter the way the arrow points', () => {
    expect(presenterSideWForKey(400, 'ArrowLeft', opts)).toBe(400 + PRESENTER_SIDE_STEP)
    expect(presenterSideWForKey(400, 'ArrowRight', opts)).toBe(400 - PRESENTER_SIDE_STEP)
    expect(presenterSideWForKey(400, 'ArrowLeft', { ...opts, shift: true })).toBe(
      400 + PRESENTER_SIDE_STEP_LARGE,
    )
    // right to left: the column is on the left, so the right arrow widens it
    expect(presenterSideWForKey(400, 'ArrowRight', { ...opts, rtl: true })).toBe(
      400 + PRESENTER_SIDE_STEP,
    )
    expect(presenterSideWForKey(400, 'ArrowLeft', { ...opts, rtl: true })).toBe(
      400 - PRESENTER_SIDE_STEP,
    )
  })

  it('Home and End go to the narrowest and widest the window allows', () => {
    expect(presenterSideWForKey(400, 'Home', opts)).toBe(PRESENTER_SIDE_W_MIN)
    expect(presenterSideWForKey(400, 'End', opts)).toBe(1920 - PRESENTER_MAIN_MIN_W)
  })

  it('stops at the limits and leaves other keys to the show', () => {
    expect(presenterSideWForKey(PRESENTER_SIDE_W_MIN, 'ArrowRight', opts)).toBe(
      PRESENTER_SIDE_W_MIN,
    )
    expect(presenterSideWForKey(1320, 'ArrowLeft', opts)).toBe(1320)
    // a width above this window's limit steps from what is drawn, not from the stored value
    expect(presenterSideWForKey(5000, 'ArrowRight', opts)).toBe(1320 - PRESENTER_SIDE_STEP)
    for (const key of [' ', 'Enter', 'Escape', 'PageDown', 'b', 'ArrowUp']) {
      expect(presenterSideWForKey(400, key, opts)).toBeNull()
    }
  })
})

describe('next-slide preview in the side column', () => {
  it('fills the default column as before', () => {
    // 1080p and 768p screens: column height minus the top bar and the strip
    expect(presenterNextThumbW(340, 1080 - 44 - 118, 16 / 9)).toBe(312)
    expect(presenterNextThumbW(340, 768 - 44 - 118, 16 / 9)).toBe(312)
  })

  it('stops growing at a share of the column height so the notes get the room', () => {
    const sideH = 1080 - 44 - 118
    const w = presenterNextThumbW(1200, sideH, 16 / 9)
    expect(w).toBeLessThan(1200 - 28)
    expect(w / (16 / 9)).toBeLessThanOrEqual(sideH * 0.4 + 1)
    // a wider column never shrinks the preview
    expect(w).toBeGreaterThanOrEqual(presenterNextThumbW(340, sideH, 16 / 9))
  })
})
