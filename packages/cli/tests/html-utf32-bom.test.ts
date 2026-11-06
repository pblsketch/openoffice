import { describe, expect, it } from 'vitest'
import { decodeHtmlBytes } from '../src/formats/html-text'

const utf16le = (text: string) =>
  Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
const utf16be = (text: string) =>
  Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(Buffer.from(text, 'utf16le')).swap16()])

describe('decodeHtmlBytes', () => {
  const html = '<html><body>한글</body></html>'

  it('decodes UTF-8, UTF-16LE and UTF-16BE by their byte order marks', () => {
    expect(decodeHtmlBytes(Buffer.from(html, 'utf8'))).toBe(html)
    expect(decodeHtmlBytes(utf16le(html)).replace(/^\uFEFF/, '')).toBe(html)
    expect(decodeHtmlBytes(utf16be(html)).replace(/^\uFEFF/, '')).toBe(html)
  })

  it('rejects a UTF-32 BOM instead of decoding it as UTF-16 or UTF-8', () => {
    const le = Buffer.from([0xff, 0xfe, 0x00, 0x00, 0x3c, 0x00, 0x00, 0x00])
    const be = Buffer.from([0x00, 0x00, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x3c])
    expect(() => decodeHtmlBytes(le)).toThrow(/UTF-32/)
    expect(() => decodeHtmlBytes(be)).toThrow(/UTF-32/)
  })
})
