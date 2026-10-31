import { describe, expect, it } from 'vitest'
import { numberingOf } from '../src/index'

describe('numberingOf', () => {
  it('reads every rung of the ladder', () => {
    expect(numberingOf('Ⅰ. 목적')).toEqual({ kind: 'roman', rank: 0 })
    expect(numberingOf('1. 추진 배경')).toEqual({ kind: 'arabic', rank: 1 })
    expect(numberingOf('가. 세부 내용')).toEqual({ kind: 'hangul', rank: 2 })
    expect(numberingOf('1) 첫째')).toEqual({ kind: 'arabic-paren', rank: 3 })
    expect(numberingOf('가) 첫째')).toEqual({ kind: 'hangul-paren', rank: 4 })
    expect(numberingOf('(1) 첫째')).toEqual({ kind: 'arabic-round', rank: 5 })
    expect(numberingOf('(가) 첫째')).toEqual({ kind: 'hangul-round', rank: 6 })
    expect(numberingOf('① 첫째')).toEqual({ kind: 'circled-arabic', rank: 7 })
    expect(numberingOf('㉮ 첫째')).toEqual({ kind: 'circled-hangul', rank: 8 })
  })

  it('leaves dates alone', () => {
    expect(numberingOf('2026. 8. 24. 대면보고')).toBeNull()
    expect(numberingOf('8. 24. 회의')).toBeNull()
  })

  it('leaves decimals and ordinary sentences alone', () => {
    expect(numberingOf('3.14는 원주율')).toBeNull()
    expect(numberingOf('1.5% 인상')).toBeNull()
    expect(numberingOf('배경 설명입니다.')).toBeNull()
    expect(numberingOf('')).toBeNull()
  })

  it('needs a space after a dot form', () => {
    expect(numberingOf('1.추진')).toBeNull()
    expect(numberingOf('가.추진')).toBeNull()
  })

  it('accepts a bare number line', () => {
    expect(numberingOf('1.')).toEqual({ kind: 'arabic', rank: 1 })
  })
})
