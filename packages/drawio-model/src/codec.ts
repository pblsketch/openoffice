/**
 * draw.io's compressed page form: base64 of the raw deflate of
 * `encodeURIComponent(xml)`. The deflate itself is injected (`PageCodec`) so
 * this module stays usable in a renderer: Node callers use `nodePageCodec` from
 * `@genoffice/drawio-model/node`, a renderer can wrap the `pako` that draw.io
 * already loads.
 */

export interface PageCodec {
  /** Inflates a raw deflate stream (no zlib header). Throws on corrupt input. */
  inflateRaw(data: Uint8Array): Uint8Array
  /** Produces a raw deflate stream (no zlib header). */
  deflateRaw(data: Uint8Array): Uint8Array
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_INDEX = new Map([...B64].map((char, index) => [char, index]))

export function base64Encode(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    out += B64[a >> 2]
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)]
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]
    out += c === undefined ? '=' : B64[c & 63]
  }
  return out
}

/** Decodes base64 (whitespace ignored); returns null when it is not base64. */
export function base64Decode(text: string): Uint8Array | null {
  const clean = text.replace(/[\s]/g, '').replace(/=+$/, '')
  if (clean.length % 4 === 1) return null
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let bits = 0
  let value = 0
  let o = 0
  for (const char of clean) {
    const index = B64_INDEX.get(char)
    if (index === undefined) return null
    value = (value << 6) | index
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (value >> bits) & 0xff
    }
  }
  return out.subarray(0, o)
}

export function latin1Decode(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return out
}

export function asciiEncode(text: string): Uint8Array {
  const out = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff
  return out
}

/** Decodes a compressed `<diagram>` body into the page's `mxGraphModel` XML; throws on failure. */
export function decodeCompressedPage(text: string, codec: PageCodec): string {
  const bytes = base64Decode(text)
  if (!bytes || bytes.length === 0) throw new Error('the page is not base64')
  const inflated = codec.inflateRaw(bytes)
  return decodeURIComponent(latin1Decode(inflated))
}

/** Encodes `mxGraphModel` XML the way draw.io compresses a page. */
export function encodeCompressedPage(xml: string, codec: PageCodec): string {
  return base64Encode(codec.deflateRaw(asciiEncode(encodeURIComponent(xml))))
}
