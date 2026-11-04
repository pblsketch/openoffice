// @vitest-environment node
/**
 * The filter between a file's style values and a style on screen: only a
 * colour shape and a number shape get through, as values this app writes
 * itself; a word only when it is one of the known ones; everything else is no
 * value at all.
 */
import { describe, expect, it } from 'vitest'
import {
  decorationValue,
  fontFamilyValue,
  FONT_SIZE_DRAWN,
  isPlainStyle,
  NO_FILL,
  type OwnTopicStyle,
  ownTopicStyle,
  safeColor,
  safeDecoration,
  safeFill,
  safeFontFamily,
  safeFontSize,
  safeFontWeight,
  safeItalic,
  safeTextAlign,
  safeTextTransform,
  splitAlpha,
  BRANCH_LINE_WIDTH_DRAWN_MAX,
  safeBranchLineWidth,
  safeBranchShape,
  safeLinePattern,
} from '../src/renderer/map/style-values'

/** A topic style that sets nothing. */
const NOTHING: OwnTopicStyle = {
  color: null,
  fill: null,
  fontWeight: null,
  fontSize: null,
  fontFamily: null,
  italic: null,
  decoration: null,
  textAlign: null,
  textTransform: null,
}

/** Values no style may ever receive, whatever property they were written under. */
const HOSTILE: unknown[] = [
  'url(https://x)',
  'url("https://example.com/a.png")',
  'red; background:url(x)',
  'expression(alert(1))',
  '#fff; position:fixed',
  '#fff;',
  '#fff }',
  ' #ffffff',
  '#ffffff ',
  '#ffffff\n',
  'calc(1px)',
  'calc(100px + 1px)',
  'var(--accent)',
  'var(--surface)',
  'rgb(1,2,3)',
  'rgba(0,0,0,.5)',
  'hsl(0 0% 0%)',
  'red',
  'transparent',
  'currentColor',
  'inherit',
  'inherited',
  'initial',
  '!important',
  '14pt !important',
  '14 pt',
  '14em',
  '14rem',
  '14%',
  '14vw',
  '1e9',
  '1e3pt',
  '0x10',
  '-1',
  '-14pt',
  '+14pt',
  '14pt;',
  '14pt 20pt',
  '99999999999999999999pt',
  '12345',
  '1.2.3',
  '.5',
  '5.',
  'NaN',
  'Infinity',
  '',
  ' ',
  '\\31 4pt',
  '14pt/*x*/',
  '</style><script>alert(1)</script>',
  'javascript:alert(1)',
  null,
  undefined,
  14,
  700,
  true,
  {},
  ['#ffffff'],
  { toString: () => '#ffffff' },
]

describe('a colour', () => {
  it.each([
    ['#d9dcd6', '#d9dcd6'],
    ['#FFBC9F', '#ffbc9f'],
    ['#abc', '#aabbcc'],
    ['#ABCD', '#aabbccdd'],
    ['#11223344', '#11223344'],
  ])('%s is taken, and written back as %s', (value, written) => {
    expect(safeColor(value)).toBe(written)
  })

  it.each(['#ff', '#fffff', '#fffffff', '#fffffffff', '#ggg', '#', 'ffffff', '# ffffff'])(
    '%s is not a colour',
    (value) => {
      expect(safeColor(value)).toBeNull()
    },
  )

  it('is never anything but a hex colour this app wrote, for every hostile value', () => {
    for (const value of HOSTILE) expect(safeColor(value), String(value)).toBeNull()
  })

  it('carries its opacity apart from its colour', () => {
    expect(splitAlpha('#102030')).toEqual({ solid: '#102030', alpha: 1 })
    expect(splitAlpha('#10203080')).toEqual({ solid: '#102030', alpha: 128 / 255 })
  })
})

describe('a fill', () => {
  it('is a colour, or the one word for no fill', () => {
    expect(safeFill('#83C5BE')).toBe('#83c5be')
    expect(safeFill('none')).toBe(NO_FILL)
  })

  it('is nothing for any other word and for every hostile value', () => {
    expect(safeFill('None')).toBeNull()
    expect(safeFill('solid')).toBeNull()
    for (const value of HOSTILE) expect(safeFill(value), String(value)).toBeNull()
  })
})

describe('a font size', () => {
  it.each([
    ['14pt', 18.67],
    ['12', 16],
    ['20pt', 26.67],
    ['16px', 16],
    ['10.5pt', 14],
    ['38pt', 50.67],
  ])('%s is %s pixels', (value, pixels) => {
    expect(safeFontSize(value)).toBe(pixels)
  })

  it('is drawn no smaller and no larger than the editor draws text', () => {
    expect(safeFontSize('1pt')).toBe(FONT_SIZE_DRAWN.min)
    expect(safeFontSize('3px')).toBe(FONT_SIZE_DRAWN.min)
    expect(safeFontSize('400pt')).toBe(FONT_SIZE_DRAWN.max)
    expect(safeFontSize('200px')).toBe(FONT_SIZE_DRAWN.max)
  })

  it('is nothing when no file means it: zero, a huge number, a negative one', () => {
    for (const value of ['0', '0pt', '0.5pt', '401pt', '9999pt', '9999', '-12pt']) {
      expect(safeFontSize(value), value).toBeNull()
    }
  })

  it('is nothing for every hostile value', () => {
    for (const value of HOSTILE) expect(safeFontSize(value), String(value)).toBeNull()
  })
})

describe('a font weight', () => {
  it.each([
    ['700', 700],
    ['600', 600],
    ['400', 400],
    ['450', 450],
    ['bold', 700],
    ['normal', 400],
    ['1', 100],
    ['1000', 900],
  ])('%s is %s', (value, weight) => {
    expect(safeFontWeight(value)).toBe(weight)
  })

  it('is nothing for a word this app does not know, a unit, a fraction or a number out of range', () => {
    for (const value of [
      'bolder',
      'lighter',
      'Bold',
      'BOLD',
      '700pt',
      '700px',
      '650.5',
      '0',
      '1001',
      '9999',
    ]) {
      expect(safeFontWeight(value), value).toBeNull()
    }
  })

  it('is nothing for every hostile value', () => {
    for (const value of HOSTILE) expect(safeFontWeight(value), String(value)).toBeNull()
  })
})

describe("a topic's own style", () => {
  it('keeps what is colour-shaped or number-shaped and the known words', () => {
    expect(
      ownTopicStyle({ color: '#AA0000', fill: 'none', fontWeight: 'bold', fontSize: '14pt' }),
    ).toEqual({ ...NOTHING, color: '#aa0000', fill: NO_FILL, fontWeight: 700, fontSize: 18.67 })
    expect(
      ownTopicStyle({
        fontFamily: '맑은 고딕',
        fontStyle: 'italic',
        textDecoration: 'underline line-through',
        textAlign: 'right',
        textTransform: 'manual',
      }),
    ).toEqual({
      ...NOTHING,
      fontFamily: '맑은 고딕',
      italic: true,
      decoration: { underline: true, strike: true },
      textAlign: 'right',
      textTransform: 'none',
    })
  })

  it('takes a font name only when it is one plain name, and draws it quoted', () => {
    expect(safeFontFamily('Noto Sans KR')).toBe('Noto Sans KR')
    expect(fontFamilyValue('Noto Sans KR')).toBe('"Noto Sans KR", sans-serif')
    for (const value of [
      'A", serif',
      "A'",
      'A, B',
      'A; color: red',
      'url(x)',
      'A}',
      ' A',
      'A ',
      'A\\',
      '',
      'x'.repeat(101),
      5,
    ]) {
      expect(safeFontFamily(value), String(value)).toBeNull()
    }
  })

  it('takes the words of the text format and nothing else', () => {
    expect(safeItalic('italic')).toBe(true)
    expect(safeItalic('normal')).toBe(false)
    expect(safeItalic('oblique')).toBeNull()
    expect(safeDecoration('line-through')).toEqual({ underline: false, strike: true })
    expect(safeDecoration('none')).toEqual({ underline: false, strike: false })
    expect(safeDecoration('blink')).toBeNull()
    expect(decorationValue({ underline: true, strike: false })).toBe('underline')
    expect(decorationValue({ underline: false, strike: false })).toBe('none')
    expect(safeTextAlign('justify')).toBeNull()
    expect(safeTextTransform('capitalize')).toBe('capitalize')
    expect(safeTextTransform('full-width')).toBeNull()
  })

  it('drops each value that is anything else, on its own', () => {
    const own = ownTopicStyle({
      color: 'red; background:url(x)',
      fill: 'url(https://example.com/x.png)',
      fontWeight: '600',
      fontSize: 'calc(100px)',
    })
    expect(own).toEqual({ ...NOTHING, fontWeight: 600 })
    expect(isPlainStyle(own)).toBe(false)
  })

  it('is plain for no style, for an empty one and for one made of values that are not used', () => {
    expect(isPlainStyle(ownTopicStyle(undefined))).toBe(true)
    expect(isPlainStyle(ownTopicStyle(null))).toBe(true)
    expect(isPlainStyle(ownTopicStyle({}))).toBe(true)
    expect(
      isPlainStyle(
        ownTopicStyle({
          color: 'inherited',
          fill: 'inherited',
          fontWeight: 'inherited',
          fontSize: 'inherited',
        }),
      ),
    ).toBe(true)
  })

  it('never hands on a string of the file: what comes out is rebuilt', () => {
    const fromFile = '#ABCDEF'
    const own = ownTopicStyle({ color: fromFile, fill: fromFile })
    expect(own.color).toBe('#abcdef')
    expect(own.color).toMatch(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/)
    expect(own.fill).toMatch(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/)
    for (const value of HOSTILE) {
      const hostile = ownTopicStyle({
        color: value as string,
        fill: value as string,
        fontWeight: value as string,
        fontSize: value as string,
        fontStyle: value as string,
        textDecoration: value as string,
        textAlign: value as string,
        textTransform: value as string,
      })
      expect(isPlainStyle(hostile), String(value)).toBe(true)
      // a word may be a font's name; anything that could end the name is not
      const family = safeFontFamily(value)
      if (family !== null) {
        expect(family, String(value)).not.toMatch(/["'`;:,(){}[\]<>\\=@/*!]/u)
        expect([...family].every((character) => character >= ' ')).toBe(true)
      }
    }
  })
})

describe('the values of a branch line', () => {
  const shape = (word: string): string => `org.xmind.branchConnection.${word}`

  it('a shape a user can pick is itself; a shape only read is the nearest one', () => {
    for (const word of ['curve', 'straight', 'elbow', 'roundedElbow', 'arrowedCurve', 'none']) {
      expect(safeBranchShape(shape(word)), word).toBe(word)
    }
    expect(safeBranchShape(shape('fold'))).toBe('elbow')
    expect(safeBranchShape(shape('fold2'))).toBe('elbow')
    expect(safeBranchShape(shape('roundedfold'))).toBe('roundedElbow')
    expect(safeBranchShape(shape('bight'))).toBe('curve')
    expect(safeBranchShape(shape('timeline.horizontal'))).toBe('straight')
  })

  it('any other shape is no value', () => {
    for (const value of [shape('mystery'), shape(''), 'curve', shape('Curve'), shape('toString')]) {
      expect(safeBranchShape(value), value).toBeNull()
    }
    for (const value of HOSTILE) expect(safeBranchShape(value), String(value)).toBeNull()
  })

  it('a pattern is one of the words of the format', () => {
    for (const word of ['solid', 'dash', 'dot', 'dash-dot', 'dash-dot-dot', 'round-dot']) {
      expect(safeLinePattern(word)).toBe(word)
    }
    for (const value of ['dashed', 'Dash', 'constructor', ...HOSTILE]) {
      expect(safeLinePattern(value), String(value)).toBeNull()
    }
  })

  it('a width is drawn one point to one pixel, as the theme tables are written', () => {
    expect(safeBranchLineWidth('3pt')).toBe(3)
    expect(safeBranchLineWidth('3')).toBe(3)
    expect(safeBranchLineWidth('2.5px')).toBe(2.5)
    expect(safeBranchLineWidth('40pt')).toBe(BRANCH_LINE_WIDTH_DRAWN_MAX)
    for (const value of ['0', '0pt', '65', '9999px', '-2', '3em', ...HOSTILE]) {
      expect(safeBranchLineWidth(value), String(value)).toBeNull()
    }
  })
})
