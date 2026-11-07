import { describe, expect, it } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import { STANDARD_COLORS, THEME_COLORS } from '../src/color-picker'
import { colorSwatchName, COLOR_SWATCH_NAMES } from '../src/strings-color-names'

const SWATCHES = [...THEME_COLORS, ...STANDARD_COLORS]

describe('color swatch names', () => {
  it('names every named swatch in every UI language', () => {
    for (const lang of LANGS) {
      for (const swatch of SWATCHES)
        expect(COLOR_SWATCH_NAMES[lang][swatch.hex], `${lang} ${swatch.hex}`).toBeTruthy()
    }
  })

  it('gives the Korean name, not the English one', () => {
    expect(colorSwatchName('ko', { name: 'Dark Red', hex: 'C00000' })).toBe('진한 빨강')
    for (const swatch of SWATCHES) expect(colorSwatchName('ko', swatch)).not.toBe(swatch.name)
  })

  it('falls back to the English name for an unknown hex', () => {
    expect(colorSwatchName('ko', { name: 'Teal', hex: '008080' })).toBe('Teal')
  })
})
