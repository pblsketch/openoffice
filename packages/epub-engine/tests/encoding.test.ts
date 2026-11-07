import { describe, expect, it } from 'vitest'
import { decodeEntryText, encodeEntryText } from '../src/encoding'
import { modifiedReplacements } from '../src/save'
import { checkWellFormed } from '../src/xml-positions'

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

  it.each([
    ['UTF-32LE', new Uint8Array([0xff, 0xfe, 0x00, 0x00, 0x41, 0x00, 0x00, 0x00])],
    ['UTF-32BE', new Uint8Array([0x00, 0x00, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x41])],
  ])('rejects a %s BOM instead of calling it valid UTF-16 or UTF-8', (_label, bytes) => {
    const decoded = decodeEntryText(bytes)
    expect(decoded.valid).toBe(false)
    expect(decoded.text).toBe('')
  })
})

function utf32le(text: string): Uint8Array {
  const out = new Uint8Array(4 + text.length * 4)
  out[0] = 0xff
  out[1] = 0xfe
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    out[4 + i * 4] = code & 0xff
    out[5 + i * 4] = (code >> 8) & 0xff
  }
  return out
}

describe('UTF-32 misread versus save XML checks', () => {
  const xhtml =
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hi</p></body></html>'
  const opf =
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">t</dc:title></metadata><manifest/><spine/></package>'

  it('XML parsing rejects the NUL-punctuated text a UTF-16LE misread of UTF-32LE would produce', () => {
    const misread = new TextDecoder('utf-16le', { ignoreBOM: true }).decode(utf32le(xhtml))
    expect(misread.includes('\0')).toBe(true)
    const wellFormed = checkWellFormed(misread)
    expect(wellFormed.ok).toBe(false)
    if (!wellFormed.ok) expect(wellFormed.error).toMatch(/disallowed character/)
  })

  it('modifiedReplacements likewise refuses that misread OPF text rather than stamping it', () => {
    const misread = new TextDecoder('utf-16le', { ignoreBOM: true }).decode(utf32le(opf))
    expect(modifiedReplacements(misread, '2026-01-01T00:00:00Z')).toBeNull()
  })
})
