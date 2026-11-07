import { describe, expect, it } from 'vitest'
import { decodeXlsxEscapes, encodeXlsxEscapes } from '../src/gateway/xlsx-escapes'

describe('encodeXlsxEscapes', () => {
  it('encodes C0 controls and noncharacters as _xHHHH_', () => {
    expect(encodeXlsxEscapes('a\u0001b')).toBe('a_x0001_b')
    expect(encodeXlsxEscapes('a\uFFFEb\uFFFFc')).toBe('a_xFFFE_b_xFFFF_c')
  })

  it('encodes lone surrogates without splitting valid emoji pairs', () => {
    expect(encodeXlsxEscapes('Revenue\uD840Q1')).toBe('Revenue_xD840_Q1')
    expect(encodeXlsxEscapes('x\uDFFFy')).toBe('x_xDFFF_y')
    expect(encodeXlsxEscapes('ok \u{1F600} end')).toBe('ok \u{1F600} end')
    expect(encodeXlsxEscapes('ok \u{1F600} end')).toContain('\u{1F600}')
  })

  it('still escapes a literal _xHHHH_ marker prefix', () => {
    expect(encodeXlsxEscapes('see _x0001_ raw')).toBe('see _x005F_x0001_ raw')
  })
})

describe('decodeXlsxEscapes', () => {
  it('restores encoded controls but refuses to rehydrate surrogate hex', () => {
    expect(decodeXlsxEscapes('a_x0001_b')).toBe('a\u0001b')
    expect(decodeXlsxEscapes('Revenue_xD840_Q1')).toBe('Revenue_xD840_Q1')
  })
})
