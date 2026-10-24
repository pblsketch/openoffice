/**
 * The view settings are screen-only styles of the chapter frame.
 */
import { describe, expect, it } from 'vitest'
import { EPUB_VIEW_PREFS_DEFAULT } from '../src/shared/ipc'
import {
  FIND_HIGHLIGHT,
  FONT_SCALES,
  stepFontScale,
  viewPrefsCss,
  type FrameColors,
} from '../src/renderer/reader/view-prefs'

const COLORS: FrameColors = {
  paper: 'var-paper',
  ink: 'var-ink',
  nightPaper: 'var-night-paper',
  nightInk: 'var-night-ink',
  nightLink: 'var-night-link',
  hitBg: 'var-hit-bg',
  hitInk: 'var-hit-ink',
}

describe('view settings', () => {
  it('steps the text size inside the allowed range', () => {
    expect(stepFontScale(1, 1)).toBe(1.1)
    expect(stepFontScale(1, -1)).toBe(0.9)
    expect(stepFontScale(1.3, 1)).toBe(1.5)
    expect(stepFontScale(1.3, -1)).toBe(1.25)
    expect(stepFontScale(3, 1)).toBe(3)
    expect(stepFontScale(0.5, -1)).toBe(0.5)
    expect(FONT_SCALES[0]).toBe(0.5)
    expect(FONT_SCALES.at(-1)).toBe(3)
  })

  it('leaves the book alone by default: its paper, its line height, its size', () => {
    const css = viewPrefsCss(EPUB_VIEW_PREFS_DEFAULT, COLORS)
    expect(css).toContain('background-color: var-paper;')
    expect(css).not.toContain('!important')
    expect(css).not.toContain('zoom')
    expect(css).not.toContain('line-height')
    expect(css).toContain(`::highlight(${FIND_HIGHLIGHT})`)
  })

  it('applies text size, line spacing and the dark view', () => {
    const css = viewPrefsCss({ fontScale: 1.5, lineHeight: 1.8, dark: true }, COLORS)
    expect(css).toContain(':root { zoom: 1.5; }')
    expect(css).toContain('line-height: 1.8 !important')
    expect(css).toContain('color-scheme: dark')
    expect(css).toContain('background-color: var-night-paper !important')
    expect(css).toContain('color: var-night-link !important')
    expect(css).not.toContain('var-paper')
  })
})
