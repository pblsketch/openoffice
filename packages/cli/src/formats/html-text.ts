/**
 * An HTML file's bytes as text: a byte order mark first, then the charset the page declares in its
 * head (`<meta charset>` or the http-equiv form, as legacy Korean pages declare euc-kr), then UTF-8.
 * An unknown charset name reads as UTF-8; broken bytes become replacement characters.
 */
export function decodeHtmlBytes(bytes: Uint8Array): string {
  const label = bomCharset(bytes) ?? metaCharset(bytes) ?? 'utf-8'
  try {
    return new TextDecoder(label.toLowerCase()).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

function bomCharset(bytes: Uint8Array): string | undefined {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8'
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'
  return undefined
}

function metaCharset(bytes: Uint8Array): string | undefined {
  // the declaration is ASCII; any single-byte reading finds it in the first kilobytes
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096))
  return /<meta[^>]*charset\s*=\s*["']?\s*([a-z0-9_:.-]+)/i.exec(head)?.[1]
}
