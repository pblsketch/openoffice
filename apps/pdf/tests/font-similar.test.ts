import { beforeEach, describe, expect, it, vi } from 'vitest'

// The picker's only I/O is the installed-font lookup and the coverage check:
// both are faked so the ranking is tested the same on every machine
const installed = new Map<string, Buffer>()
const lookups: Array<[string, string]> = []
vi.mock('../src/main/font-locate', () => ({
  findSystemFont: (ps: string, family: string) => {
    lookups.push([ps, family])
    return installed.get(family) ?? null
  },
}))
const uncovered = new Set<Buffer>()
vi.mock('../src/main/font-cmap', () => ({
  fontCoversText: (font: Buffer) => !uncovered.has(font),
}))

import { os2Traits, similarFontFor, sourceTraits } from '../src/main/font-similar'

/** Minimal sfnt holding only an OS/2 table with the given weight and PANOSE head */
function sfntWithOs2(weight: number, panose: [number, number, number, number]): Buffer {
  const os2 = Buffer.alloc(96)
  os2.writeUInt16BE(weight, 4)
  Buffer.from(panose).copy(os2, 32)
  const head = Buffer.alloc(12 + 16)
  head.writeUInt32BE(0x00010000, 0)
  head.writeUInt16BE(1, 4)
  head.write('OS/2', 12, 'latin1')
  head.writeUInt32BE(head.length, 12 + 8)
  head.writeUInt32BE(os2.length, 12 + 12)
  return Buffer.concat([head, os2])
}

const NONSYMBOLIC = 1 << 5
const SERIF = 1 << 1

beforeEach(() => {
  installed.clear()
  uncovered.clear()
  lookups.length = 0
})

describe('os2Traits', () => {
  it('reads weight and the PANOSE serif class', () => {
    expect(os2Traits(sfntWithOs2(700, [2, 2, 6, 3]))).toEqual({ weight: 700, style: 'serif' })
    expect(os2Traits(sfntWithOs2(400, [2, 11, 6, 4]))).toEqual({ weight: 400, style: 'sans' })
    expect(os2Traits(sfntWithOs2(400, [2, 11, 6, 9]))).toEqual({ weight: 400, style: 'mono' })
    expect(os2Traits(sfntWithOs2(400, [3, 0, 0, 0]))).toEqual({ weight: 400, style: 'brush' })
  })

  it('ignores PANOSE outside the Latin kinds and non-sfnt programs', () => {
    expect(os2Traits(sfntWithOs2(400, [0, 0, 0, 0]))).toEqual({ weight: 400 })
    expect(os2Traits(Buffer.from('%!PS-AdobeFont'))).toEqual({})
    expect(os2Traits(null)).toEqual({})
  })
})

describe('sourceTraits', () => {
  it('prefers the name, then PANOSE, then the descriptor flags', () => {
    const sansPanose = sfntWithOs2(400, [2, 11, 6, 4])
    expect(sourceTraits({ psName: 'HCRBatang', flags: 0, embedded: sansPanose }).style).toBe(
      'serif',
    )
    expect(
      sourceTraits({ psName: 'F1', flags: NONSYMBOLIC | SERIF, embedded: sansPanose }).style,
    ).toBe('sans')
    expect(sourceTraits({ psName: 'F1', flags: NONSYMBOLIC | SERIF, embedded: null }).style).toBe(
      'serif',
    )
    expect(sourceTraits({ psName: 'F1', flags: 0, embedded: null }).style).toBe('sans')
  })

  it('takes fixed pitch for Latin text only (CJK faces are full-width)', () => {
    const fixed = { psName: 'F1', flags: NONSYMBOLIC | 1, embedded: null }
    expect(sourceTraits(fixed, 'latin').style).toBe('mono')
    expect(sourceTraits(fixed, 'ko').style).toBe('sans')
    // the name outranks the flag
    expect(sourceTraits({ ...fixed, psName: 'Arial' }, 'latin').style).toBe('sans')
    expect(
      sourceTraits({ psName: 'HYPost', flags: NONSYMBOLIC | SERIF | 1, embedded: null }).style,
    ).toBe('serif')
  })

  it('reads bold from the name, ForceBold or the OS/2 weight', () => {
    expect(sourceTraits({ psName: 'Batang,Bold', flags: 0, embedded: null }).bold).toBe(true)
    expect(sourceTraits({ psName: 'F1', flags: 1 << 18, embedded: null }).bold).toBe(true)
    expect(
      sourceTraits({ psName: 'F1', flags: 0, embedded: sfntWithOs2(700, [0, 0, 0, 0]) }).bold,
    ).toBe(true)
  })
})

describe('similarFontFor', () => {
  const batang = Buffer.from('batang')
  const malgun = Buffer.from('malgun')
  const times = Buffer.from('times')

  it('keeps a Korean serif run in an installed Korean serif face', () => {
    installed.set('Batang', batang).set('Malgun Gothic', malgun)
    const got = similarFontFor({ psName: '가상명조', flags: 0, embedded: null }, '안녕하세요')
    expect(got?.bytes).toBe(batang)
    // HCR Batang is the first choice and was asked for before Batang
    expect(lookups.map(([, f]) => f).slice(0, 2)).toEqual(['HCR Batang', 'Batang'])
  })

  it('keeps a Korean sans run sans', () => {
    installed.set('Batang', batang).set('Malgun Gothic', malgun)
    const got = similarFontFor({ psName: 'HYGothic-Medium', flags: 0, embedded: null }, '고딕')
    expect(got?.bytes).toBe(malgun)
  })

  it('switches to a Korean face of the same style when Hangul meets a Latin face', () => {
    installed.set('Batang', batang).set('Times New Roman', times)
    const got = similarFontFor({ psName: 'TimesNewRomanPSMT', flags: 0, embedded: null }, '한글')
    expect(got?.bytes).toBe(batang)
  })

  it('skips a look-alike that cannot draw the text', () => {
    installed.set('HCR Batang', Buffer.from('hcr')).set('Batang', batang)
    uncovered.add(installed.get('HCR Batang')!)
    const got = similarFontFor({ psName: 'HCRBatang', flags: 0, embedded: null }, '똠')
    expect(got?.bytes).toBe(batang)
  })

  it('asks for the bold/italic face and reports a non-bold pick of a bold source', () => {
    installed.set('Batang', batang)
    const got = similarFontFor({ psName: 'HYSinMyeongJo-Bold', flags: 0, embedded: null }, '굵게', {
      italic: true,
    })
    expect(lookups[0]).toEqual(['HCR Batang-BoldItalic', 'HCR Batang'])
    expect(got).toEqual({ bytes: batang, bold: false, sourceBold: true })
  })

  it('reports a bold pick from its OS/2 weight', () => {
    const boldFace = sfntWithOs2(700, [0, 0, 0, 0])
    installed.set('HCR Batang', boldFace)
    const got = similarFontFor({ psName: 'HCRBatang-Bold', flags: 0, embedded: null }, '굵게')
    expect(got).toEqual({ bytes: boldFace, bold: true, sourceBold: true })
  })

  it('returns null when no look-alike is installed', () => {
    installed.set('Malgun Gothic', malgun)
    expect(similarFontFor({ psName: '가상명조', flags: 0, embedded: null }, '안녕')).toBeNull()
  })
})
