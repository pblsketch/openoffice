import { describe, expect, it } from 'vitest'
import { HANGUL_ONLY_FONTS, isHangulOnlyFont, isOutsideRecommendedFont } from '../src/index'

describe('fonts', () => {
  it('knows the fonts the guideline names', () => {
    expect(isHangulOnlyFont('휴먼명조')).toBe(true)
    expect(isHangulOnlyFont('HY신명조')).toBe(true)
    expect(isHangulOnlyFont('양재와당체')).toBe(true)
  })

  it('catches the word processor fonts the list does not name', () => {
    expect(isHangulOnlyFont('HY헤드라인M')).toBe(true)
    expect(isHangulOnlyFont('HY울릉도M')).toBe(true)
    expect(isHangulOnlyFont('한컴 고딕')).toBe(true)
    expect(isHangulOnlyFont('한컴 윤고딕 230')).toBe(true)
  })

  it('ignores case and spacing', () => {
    expect(isHangulOnlyFont('hy 헤드라인 M')).toBe(true)
    expect(isHangulOnlyFont('HY 헤드라인 M')).toBe(true)
  })

  it('leaves the fonts it recommends alone', () => {
    expect(isHangulOnlyFont('함초롬바탕')).toBe(false)
    expect(isOutsideRecommendedFont('함초롬돋움')).toBe(false)
    expect(isOutsideRecommendedFont('맑은 고딕')).toBe(false)
  })

  it('does not call a font everyone has "outside the list"', () => {
    expect(isOutsideRecommendedFont('바탕')).toBe(false)
    expect(isOutsideRecommendedFont('돋움')).toBe(false)
    expect(isOutsideRecommendedFont('돋움체')).toBe(false)
    expect(isOutsideRecommendedFont('sans-serif')).toBe(false)
  })

  it('does call an unusual font outside the list', () => {
    expect(isOutsideRecommendedFont('Arial')).toBe(true)
    expect(isOutsideRecommendedFont('신명조')).toBe(true)
  })

  it('does not keep a font in both lists', () => {
    for (const name of HANGUL_ONLY_FONTS) {
      expect(isHangulOnlyFont(name)).toBe(true)
    }
  })
})
