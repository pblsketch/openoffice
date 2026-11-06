/**
 * Text entries of a book are UTF-8 or UTF-16 (OCF). The encoding is taken
 * from a byte order mark, else UTF-8. A BOM stays in the decoded text as
 * U+FEFF so that offsets into the text cover the whole entry and the entry
 * can be written back with the same bytes.
 */

export type EpubTextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be'

export interface DecodedText {
  text: string
  encoding: EpubTextEncoding
  /**
   * False when the bytes are not valid in `encoding`; `text` then carries
   * replacement characters and must not be written back.
   */
  valid: boolean
}

/** UTF-32 BOMs: UTF-32LE is FF FE 00 00, which UTF-16LE would otherwise claim. */
function isUtf32Bom(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    ((bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff) ||
      (bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0 && bytes[3] === 0))
  )
}

function sniffEncoding(bytes: Uint8Array): EpubTextEncoding {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'
  return 'utf-8'
}

/** Decodes a text entry, keeping a BOM, and says whether the bytes were valid. */
export function decodeEntryText(bytes: Uint8Array): DecodedText {
  // OCF text is UTF-8 or UTF-16. A UTF-32 BOM is not a valid entry: UTF-32LE
  // would otherwise be sniffed as UTF-16LE (valid: true, NULs in the text).
  if (isUtf32Bom(bytes)) {
    return { text: '', encoding: 'utf-8', valid: false }
  }
  const encoding = sniffEncoding(bytes)
  try {
    const text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes)
    return { text, encoding, valid: true }
  } catch {
    const text = new TextDecoder(encoding, { ignoreBOM: true }).decode(bytes)
    return { text, encoding, valid: false }
  }
}

/** Encodes text in `encoding`; the inverse of `decodeEntryText` for valid text. */
export function encodeEntryText(text: string, encoding: EpubTextEncoding): Uint8Array {
  if (encoding === 'utf-8') return new TextEncoder().encode(text)
  const out = new Uint8Array(text.length * 2)
  const littleEndian = encoding === 'utf-16le'
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i)
    out[2 * i + (littleEndian ? 0 : 1)] = unit & 0xff
    out[2 * i + (littleEndian ? 1 : 0)] = unit >> 8
  }
  return out
}
