import { describe, expect, it } from 'vitest'
import {
  autoFillBlock,
  fillSeries,
  formatNumber,
  hanjaNumber,
  hanjaNumeral,
  nativeOrdinal,
  plainNumber,
} from '../studio-plugin/table-auto-fill.mjs'

/**
 * Every expectation here is what Hancom Hangul 2024's own 표 자동 채우기 wrote into the same
 * block, typed and filled through its automation interface (2026-10-31).
 */

/** A one-column block of `length` cells holding the seeds on top, filled; its cells top down. */
function column(seeds: string[], length = 5): string[] {
  const grid = Array.from({ length }, (_, i) => [seeds[i] ?? ''])
  const out = autoFillBlock(grid)
  return grid.map(([text], r) => out[r][0] ?? text)
}

/** A block given row by row ('' for an empty cell), filled; its cells row by row. */
function block(rows: string[][]): string[][] {
  const out = autoFillBlock(rows)
  return rows.map((row, r) => row.map((text, c) => out[r][c] ?? text))
}

describe('표 자동 채우기, as Hangul fills a column', () => {
  it('copies one seed, whatever it is', () => {
    for (const seed of ['1', '월', '1월', '갑', '가', '제1과', '1.5', '2026-10-31', 'Mon', '①']) {
      expect(column([seed], 4), seed).toEqual([seed, seed, seed, seed])
    }
  })

  it('goes on by the step of two or more numbers', () => {
    expect(column(['1', '3'])).toEqual(['1', '3', '5', '7', '9'])
    expect(column(['10', '8'], 4)).toEqual(['10', '8', '6', '4'])
    expect(column(['1', '2', '3'])).toEqual(['1', '2', '3', '4', '5'])
    expect(column(['3', '3'], 4)).toEqual(['3', '3', '3', '3'])
  })

  it('goes on by the ratio when the step is not constant', () => {
    expect(column(['1', '2', '4'])).toEqual(['1', '2', '4', '8', '16'])
    expect(column(['2', '6', '18'])).toEqual(['2', '6', '18', '54', '162'])
    expect(column(['8', '4', '2'])).toEqual(['8', '4', '2', '1', '0.5'])
  })

  it('repeats numbers that follow neither', () => {
    expect(column(['1', '2', '4', '7'], 6)).toEqual(['1', '2', '4', '7', '1', '2'])
  })

  it('writes numbers plainly', () => {
    expect(column(['1.5', '2'], 4)).toEqual(['1.5', '2', '2.5', '3'])
    expect(column(['1.0', '1.5'], 4)).toEqual(['1.0', '1.5', '2', '2.5'])
    expect(column(['0.1', '0.2'])).toEqual(['0.1', '0.2', '0.3', '0.4', '0.5'])
    expect(column(['1.25', '1.5'])).toEqual(['1.25', '1.5', '1.75', '2', '2.25'])
    expect(column(['1,000', '2,000'], 4)).toEqual(['1,000', '2,000', '3000', '4000'])
    expect(column(['01', '02'])).toEqual(['01', '02', '3', '4', '5'])
    expect(column([' 1', ' 2'], 4)).toEqual([' 1', ' 2', '3', '4'])
  })

  it('counts a number inside the same text', () => {
    expect(column(['1번', '2번'], 4)).toEqual(['1번', '2번', '3번', '4번'])
    expect(column(['1번', '3번'], 4)).toEqual(['1번', '3번', '5번', '7번'])
    expect(column(['제1과', '제2과'], 4)).toEqual(['제1과', '제2과', '제3과', '제4과'])
    expect(column(['a1', 'a2'], 4)).toEqual(['a1', 'a2', 'a3', 'a4'])
    expect(column(['1월', '3월'])).toEqual(['1월', '3월', '5월', '7월', '9월'])
    expect(column(['(1)', '(2)'])).toEqual(['(1)', '(2)', '(3)', '(4)', '(5)'])
    expect(column(['1.', '2.'])).toEqual(['1.', '2.', '3.', '4.', '5.'])
    expect(column(['1학년', '2학년'])).toEqual(['1학년', '2학년', '3학년', '4학년', '5학년'])
    // the number is taken as it reads, a decimal included, as Hangul does
    expect(column(['v1.9', 'v1.10'], 4)).toEqual(['v1.9', 'v1.10', 'v0.3', 'v-0.5'])
    // Hangul goes on by the step here too (12월, 1월, -10월); past that first negative number it
    // writes -8월, -6월, which no step explains, so that tail is not followed
    expect(column(['12월', '1월'], 3)).toEqual(['12월', '1월', '-10월'])
  })

  it('repeats text with two numbers in it', () => {
    expect(column(['1-1', '1-2'], 4)).toEqual(['1-1', '1-2', '1-1', '1-2'])
  })

  it('goes through the lists from consecutive seeds', () => {
    const cases: [string, string, string[]][] = [
      ['가', '나', ['다', '라', '마']],
      ['갑', '을', ['병', '정', '무']],
      ['子', '丑', ['寅', '卯', '辰']],
      ['자', '축', ['인', '묘', '진']],
      ['신', '유', ['술', '해', '자']],
      ['일', '월', ['화', '수', '목']],
      ['일요일', '월요일', ['화요일', '수요일', '목요일']],
      ['월요일', '화요일', ['수요일', '목요일', '금요일']],
      ['Sun', 'Mon', ['Tue', 'Wed', 'Thu']],
      ['Mon', 'Tue', ['Wed', 'Thu', 'Fri']],
      ['January', 'February', ['March', 'April', 'May']],
      ['Jan', 'Feb', ['Mar', 'Apr', 'May']],
      ['A', 'B', ['C', 'D', 'E']],
      ['a', 'b', ['c', 'd', 'e']],
      ['ㄱ', 'ㄴ', ['ㄷ', 'ㄹ', 'ㅁ']],
    ]
    for (const [a, b, next] of cases) expect(column([a, b]), `${a},${b}`).toEqual([a, b, ...next])
  })

  it('wraps a list round at its end', () => {
    const cases: [string, string, string[]][] = [
      ['금', '토', ['일', '월', '화']],
      ['토', '일', ['월', '화', '수']],
      ['임', '계', ['갑', '을']],
      ['戌', '亥', ['子', '丑']],
      ['Y', 'Z', ['A', 'B']],
      ['y', 'z', ['a', 'b']],
      ['ㅍ', 'ㅎ', ['ㄱ', 'ㄴ']],
      ['파', '하', ['가', '나']],
      ['Nov', 'Dec', ['Jan', 'Feb']],
      ['November', 'December', ['January', 'February']],
      ['금요일', '토요일', ['일요일', '월요일']],
      ['Fri', 'Sat', ['Sun', 'Mon']],
      ['Friday', 'Saturday', ['Sunday', 'Monday']],
    ]
    for (const [a, b, next] of cases) {
      expect(column([a, b], 2 + next.length), `${a},${b}`).toEqual([a, b, ...next])
    }
  })

  it('repeats seeds that are no list series', () => {
    const cases: [string, string][] = [
      ['계', '갑'],
      ['亥', '子'],
      ['Z', 'A'],
      ['ㅎ', 'ㄱ'],
      ['하', '가'],
      ['가', '다'],
      ['월', '수'],
      ['①', '②'],
      ['I', 'II'],
      ['ⅰ', 'ⅱ'],
      ['㉠', '㉡'],
      ['가.', '나.'],
      ['1', '가'],
    ]
    for (const [a, b] of cases) expect(column([a, b]), `${a},${b}`).toEqual([a, b, a, b, a])
  })

  it('counts on in Hanja numerals and Korean ordinals past ten', () => {
    expect(column(['一', '二'])).toEqual(['一', '二', '三', '四', '五'])
    expect(column(['八', '九'], 4)).toEqual(['八', '九', '十', '十一'])
    expect(column(['九', '十'], 4)).toEqual(['九', '十', '十一', '十二'])
    expect(column(['첫째', '둘째'])).toEqual(['첫째', '둘째', '셋째', '넷째', '다섯째'])
    expect(column(['아홉째', '열째'], 4)).toEqual(['아홉째', '열째', '열하나째', '열둘째'])
  })

  it('overwrites what comes after the first empty cell', () => {
    expect(column(['1', '', '3'])).toEqual(['1', '1', '1', '1', '1'])
    expect(column(['1', '', 'x'], 4)).toEqual(['1', '1', '1', '1'])
  })
})

describe('표 자동 채우기, as Hangul fills a block', () => {
  it('fills a row of one line', () => {
    expect(block([['1', '', '', '', '']])).toEqual([['1', '1', '1', '1', '1']])
    expect(block([['1', '2', '', '', '']])).toEqual([['1', '2', '3', '4', '5']])
    expect(block([['월', '수', '', '', '']])).toEqual([['월', '수', '월', '수', '월']])
  })

  it('reads a square or wide block row by row, an empty row going on with the row above', () => {
    expect(
      block([
        ['1', '2', ''],
        ['', '', ''],
        ['', '', ''],
      ]),
    ).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
    ])
    expect(
      block([
        ['1', '2', '', ''],
        ['', '', '', ''],
      ]),
    ).toEqual([
      ['1', '2', '3', '4'],
      ['5', '6', '7', '8'],
    ])
    expect(
      block([
        ['1', '', ''],
        ['2', '', ''],
        ['', '', ''],
      ]),
    ).toEqual([
      ['1', '1', '1'],
      ['2', '2', '2'],
      ['2', '2', '2'],
    ])
    expect(
      block([
        ['1', '5', ''],
        ['2', '', ''],
        ['', '', ''],
      ]),
    ).toEqual([
      ['1', '5', '9'],
      ['2', '2', '2'],
      ['2', '2', '2'],
    ])
    expect(
      block([
        ['1', '', ''],
        ['2', '', ''],
        ['3', '', ''],
      ]),
    ).toEqual([
      ['1', '1', '1'],
      ['2', '2', '2'],
      ['3', '3', '3'],
    ])
    expect(
      block([
        ['1', '월', '가'],
        ['', '', ''],
        ['', '', ''],
      ]),
    ).toEqual([
      ['1', '월', '가'],
      ['1', '월', '가'],
      ['1', '월', '가'],
    ])
    expect(
      block([
        ['1', '', ''],
        ['', '5', ''],
        ['', '', ''],
      ]),
    ).toEqual([
      ['1', '1', '1'],
      ['1', '1', '1'],
      ['1', '1', '1'],
    ])
    expect(
      block([
        ['1', '2', '', ''],
        ['7', '', '', ''],
        ['', '', '', ''],
      ]),
    ).toEqual([
      ['1', '2', '3', '4'],
      ['7', '7', '7', '7'],
      ['7', '7', '7', '7'],
    ])
    expect(
      block([
        ['1', '2', ''],
        ['10', '20', ''],
      ]),
    ).toEqual([
      ['1', '2', '3'],
      ['10', '20', '30'],
    ])
    expect(
      block([
        ['1', '2'],
        ['', ''],
      ]),
    ).toEqual([
      ['1', '2'],
      ['3', '4'],
    ])
    expect(
      block([
        ['1', '2', '3', '4'],
        ['', '', '', ''],
      ]),
    ).toEqual([
      ['1', '2', '3', '4'],
      ['5', '6', '7', '8'],
    ])
  })

  it('reads a tall block column by column', () => {
    expect(
      block([
        ['1', ''],
        ['2', ''],
        ['', ''],
        ['', ''],
      ]),
    ).toEqual([
      ['1', '5'],
      ['2', '6'],
      ['3', '7'],
      ['4', '8'],
    ])
    expect(
      block([
        ['1', '10'],
        ['2', ''],
        ['', ''],
      ]),
    ).toEqual([
      ['1', '10'],
      ['2', '10'],
      ['3', '10'],
    ])
    expect(
      block([
        ['1', 'x'],
        ['3', ''],
        ['', ''],
        ['', ''],
      ]),
    ).toEqual([
      ['1', 'x'],
      ['3', 'x'],
      ['5', 'x'],
      ['7', 'x'],
    ])
    expect(
      block([
        ['1', '5', ''],
        ['2', '', ''],
        ['', '', ''],
        ['', '', ''],
      ]),
    ).toEqual([
      ['1', '5', '5'],
      ['2', '5', '5'],
      ['3', '5', '5'],
      ['4', '5', '5'],
    ])
    expect(
      block([
        ['1', ''],
        ['2', ''],
        ['3', ''],
        ['4', ''],
      ]),
    ).toEqual([
      ['1', '5'],
      ['2', '6'],
      ['3', '7'],
      ['4', '8'],
    ])
  })

  it('leaves a block with no seed, and a full block, as it is', () => {
    expect(
      autoFillBlock([
        ['', ''],
        ['', ''],
      ]),
    ).toEqual([
      [null, null],
      [null, null],
    ])
    expect(autoFillBlock([['1', '2', '3']])).toEqual([[null, null, null]])
    expect(autoFillBlock([])).toEqual([])
  })

  it('marks only the cells it changes', () => {
    expect(autoFillBlock([['1'], ['1'], ['']])).toEqual([[null], [null], ['1']])
  })
})

describe('the pieces of auto fill', () => {
  it('reads plain numbers only', () => {
    expect(plainNumber('1,000')).toBe(1000)
    expect(plainNumber(' -2.5 ')).toBe(-2.5)
    expect(plainNumber('1,00')).toBeNull()
    expect(plainNumber('1번')).toBeNull()
    expect(plainNumber('')).toBeNull()
  })

  it('writes numbers without float noise', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatNumber(3)).toBe('3')
    expect(formatNumber(-0)).toBe('0')
  })

  it('reads and writes Hanja numerals', () => {
    for (const [text, n] of [
      ['一', 1],
      ['十', 10],
      ['十一', 11],
      ['二十', 20],
      ['九十九', 99],
      ['百', 100],
      ['三百五', 305],
      ['千二十', 1020],
    ] as const) {
      expect(hanjaNumber(text), text).toBe(n)
      expect(hanjaNumeral(n), text).toBe(text)
    }
    expect(hanjaNumber('十十')).toBeNull()
    expect(hanjaNumber('가')).toBeNull()
    expect(hanjaNumeral(0)).toBeNull()
  })

  it('writes Korean ordinals', () => {
    expect(nativeOrdinal(1)).toBe('첫째')
    expect(nativeOrdinal(2)).toBe('둘째')
    expect(nativeOrdinal(10)).toBe('열째')
    expect(nativeOrdinal(11)).toBe('열하나째')
    expect(nativeOrdinal(20)).toBe('스물째')
    expect(nativeOrdinal(100)).toBeNull()
  })

  it('names a series by place', () => {
    const series = fillSeries(['1', '3'])
    expect([0, 1, 2, 10].map(series)).toEqual(['1', '3', '5', '21'])
  })
})
