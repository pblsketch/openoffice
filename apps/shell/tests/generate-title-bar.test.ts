import { describe, expect, it } from 'vitest'
import { GENERATE_TITLE_BAR_HEIGHT, generateTitleBarOverlay } from '../src/main/generate/title-bar'

describe('generateTitleBarOverlay', () => {
  it('matches the generate window surface and text tokens in both themes', () => {
    expect(generateTitleBarOverlay(false)).toEqual({
      color: '#ffffff',
      symbolColor: '#242424',
      height: GENERATE_TITLE_BAR_HEIGHT,
    })
    expect(generateTitleBarOverlay(true)).toEqual({
      color: '#1e1e1e',
      symbolColor: '#e4e4e4',
      height: GENERATE_TITLE_BAR_HEIGHT,
    })
  })

  it('keeps the caption band the same height in both themes', () => {
    expect(generateTitleBarOverlay(false).height).toBe(generateTitleBarOverlay(true).height)
  })
})
