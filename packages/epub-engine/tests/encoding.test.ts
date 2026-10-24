import { describe, expect, it } from 'vitest'
import { decodeEntryText, encodeEntryText } from '../src/encoding'

describe('decodeEntryText / encodeEntryText', () => {
  const samples = ['<p>plain</p>', '\ufeff<p>with BOM</p>', '\ufeff<p>한글 😀 \r\n</p>']

  it.each(['utf-8', 'utf-16le', 'utf-16be'] as const)(
    'round-trips %s byte for byte',
    (encoding) => {
      for (const text of samples) {
        // UTF-16 is only recognised by its BOM
        const source = encoding === 'utf-8' || text.startsWith('\ufeff') ? text : `\ufeff${text}`
        const bytes = encodeEntryText(source, encoding)
        const decoded = decodeEntryText(bytes)
        expect(decoded).toEqual({ text: source, encoding, valid: true })
        expect(encodeEntryText(decoded.text, decoded.encoding)).toEqual(bytes)
      }
    },
  )

  it('keeps a UTF-8 BOM as U+FEFF', () => {
    expect(decodeEntryText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])).text).toBe('\ufeffA')
  })

  it('reports invalid UTF-8 and still gives text', () => {
    const decoded = decodeEntryText(new Uint8Array([0x41, 0xc3, 0x28]))
    expect(decoded.valid).toBe(false)
    expect(decoded.text.startsWith('A')).toBe(true)
  })
})
