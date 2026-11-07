import { describe, expect, it } from 'vitest'
import {
  classifyFontName,
  decodeFontName,
  redecodeByteString,
  standInScript,
} from '../src/shared/font-classes'

/** CP949 bytes of a fictitious face name (no PC has it installed) */
const CP949_MYEONGJO = Uint8Array.from([0xb0, 0xa1, 0xbb, 0xf3, 0xb8, 0xed, 0xc1, 0xb6])

describe('decodeFontName', () => {
  it('decodes a CP949 PDF name into Hangul', () => {
    expect(decodeFontName(CP949_MYEONGJO)).toBe('가상명조')
  })

  it('keeps ASCII and UTF-8 names as they are', () => {
    expect(decodeFontName(new TextEncoder().encode('HYSinMyeongJo-Medium'))).toBe(
      'HYSinMyeongJo-Medium',
    )
    expect(decodeFontName(new TextEncoder().encode('함초롬바탕'))).toBe('함초롬바탕')
  })

  it('falls back to Latin-1 when neither decoder accepts the bytes', () => {
    expect(decodeFontName(Uint8Array.from([0x43, 0x61, 0x66, 0xe9]))).toBe('Café')
  })

  it('redecodes a one-char-per-byte name (pdf.js) and leaves real text alone', () => {
    expect(redecodeByteString(String.fromCharCode(...CP949_MYEONGJO))).toBe('가상명조')
    expect(redecodeByteString('Batang')).toBe('Batang')
    expect(redecodeByteString('가상명조')).toBe('가상명조')
  })
})

describe('classifyFontName', () => {
  it.each([
    ['HCRBatang', 'serif'],
    ['ABCDEF+HCRBatang-Bold', 'serif'],
    ['HYSinMyeongJo-Medium', 'serif'],
    ['가상명조', 'serif'],
    ['NanumMyeongjo', 'serif'],
    ['Batang', 'serif'],
    ['HYGothic-Medium', 'sans'],
    ['HYHeadLine-Medium', 'sans'],
    ['MalgunGothicBold', 'sans'],
    ['돋움', 'sans'],
    ['GowunDodum-Regular', 'sans'],
    ['GowunBatang-Regular', 'serif'],
    ['NotoSansCJKkr-Regular', 'sans'],
    ['Gungsuh', 'brush'],
    ['HYGungSo-Bold', 'brush'],
  ])('reads %s as a Korean %s face', (name, style) => {
    expect(classifyFontName(name)).toMatchObject({ script: 'ko', style })
  })

  it('leaves the style open for a Korean family without a style word', () => {
    expect(classifyFontName('HYPost-Light')).toMatchObject({ script: 'ko', style: undefined })
  })

  it('reads Japanese and Chinese names', () => {
    expect(classifyFontName('YuMincho-Regular')).toMatchObject({ script: 'ja', style: 'serif' })
    expect(classifyFontName('MS-Gothic')).toMatchObject({ script: 'ja', style: 'sans' })
    expect(classifyFontName('SimSun')).toMatchObject({ script: 'zh', style: 'serif' })
    expect(classifyFontName('MicrosoftYaHei')).toMatchObject({ script: 'zh', style: 'sans' })
    expect(classifyFontName('KaiTi')).toMatchObject({ script: 'zh', style: 'brush' })
    expect(classifyFontName('HiraginoSansGB-W3')).toMatchObject({ script: 'zh' })
  })

  it('reads Latin names, sans before serif and mono first', () => {
    expect(classifyFontName('TimesNewRomanPS-BoldMT')).toEqual({
      script: 'latin',
      style: 'serif',
      bold: true,
      italic: false,
    })
    expect(classifyFontName('MicrosoftSansSerif')).toMatchObject({ style: 'sans' })
    expect(classifyFontName('CourierNewPSMT')).toMatchObject({ style: 'mono' })
    expect(classifyFontName('Georgia-Italic')).toMatchObject({ style: 'serif', italic: true })
  })

  it('does not read Chinese out of Latin names that merely contain sung/ming', () => {
    expect(classifyFontName('SamsungSans-Regular').script).toBe('latin')
    expect(classifyFontName('GamingFont').script).toBeUndefined()
  })

  it('says nothing about names that carry no evidence', () => {
    expect(classifyFontName('F1')).toEqual({ bold: false, italic: false })
  })
})

describe('standInScript', () => {
  it('lets the drawn text force a script the face cannot draw', () => {
    expect(standInScript('latin', '안녕')).toBe('ko')
    expect(standInScript('zh', '안녕')).toBe('ko')
    expect(standInScript(undefined, 'かな')).toBe('ja')
    expect(standInScript('ko', 'かな')).toBe('ko')
  })

  it('keeps the face script for text it can draw', () => {
    expect(standInScript('ko', 'Hello')).toBe('ko')
    expect(standInScript('ja', '漢字')).toBe('ja')
    expect(standInScript(undefined, '漢字')).toBe('zh')
    expect(standInScript(undefined, 'Hello')).toBe('latin')
  })
})
