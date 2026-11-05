import { describe, expect, it } from 'vitest'
import { decodeHtmlBytes } from '../src/formats/html-text'

describe('HTML charset declarations inside comments', () => {
  it.each([
    '<!-- <meta charset="euc-kr"> -->',
    '<!-- old encoding\n<meta http-equiv="Content-Type" content="text/html; charset=euc-kr">\n-->',
    '<!-- <meta charset="euc-kr"> --><!-- another comment -->',
  ])('ignores an inactive declaration: %s', (comment) => {
    const source = `<html><head>${comment}<meta charset="utf-8"></head><body>한글 본문</body></html>`
    expect(decodeHtmlBytes(Buffer.from(source))).toBe(source)
  })

  it('uses a real legacy declaration after a commented UTF-8 declaration', () => {
    const head = '<!-- <meta charset="utf-8"> --><meta charset="euc-kr">'
    const bytes = Buffer.concat([
      Buffer.from(head + '<p>'),
      Buffer.from([0xc7, 0xd1, 0xb1, 0xdb]),
      Buffer.from('</p>'),
    ])
    expect(decodeHtmlBytes(bytes)).toBe(head + '<p>한글</p>')
  })

  it('uses UTF-8 when every declaration is commented out', () => {
    const source = '<!-- <meta charset="euc-kr"> --><p>한글</p>'
    expect(decodeHtmlBytes(Buffer.from(source))).toBe(source)
  })

  it('ignores a comment whose closing marker is beyond the scan window', () => {
    const source = '<!-- <meta charset="euc-kr">' + ' '.repeat(4096) + '--><p>한글</p>'
    expect(decodeHtmlBytes(Buffer.from(source))).toBe(source)
  })

  it('keeps real declarations and BOM precedence', () => {
    const source = '<meta charset="euc-kr"><p>한글</p>'
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(source)])
    expect(decodeHtmlBytes(bytes)).toBe(source)
    expect(decodeHtmlBytes(Buffer.from('<meta charset="utf-8"><p>plain</p>'))).toBe(
      '<meta charset="utf-8"><p>plain</p>',
    )
  })
})
