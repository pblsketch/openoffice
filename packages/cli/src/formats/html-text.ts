/**
 * An HTML file's bytes as text: a byte order mark first, then the charset the page declares in its
 * head (`<meta charset>`, the http-equiv Content-Type form, or an XML encoding declaration, as
 * legacy Korean pages declare euc-kr), then UTF-8.
 * An unknown charset name reads as UTF-8; broken bytes become replacement characters.
 */
export function decodeHtmlBytes(bytes: Uint8Array): string {
  const label = bomCharset(bytes) ?? declaredCharset(bytes) ?? 'utf-8'
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

function declaredCharset(bytes: Uint8Array): string | undefined {
  // the declaration is ASCII; any single-byte reading finds it in the first kilobytes
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096))
  return htmlMetaCharset(head) ?? xmlEncoding(head)
}

/** Charset from a real <meta> declaration, not from the word "charset=" inside another attribute. */
function htmlMetaCharset(head: string): string | undefined {
  let fromCharsetAttr: string | undefined
  let fromHttpEquiv: string | undefined
  const re = /<meta\b([^>]*?)\/?>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(head))) {
    const attrs = parseHtmlAttributes(match[1]!)
    if (attrs.charset && !fromCharsetAttr) fromCharsetAttr = attrs.charset
    if (/^content-type$/i.test(attrs['http-equiv'] ?? '') && attrs.content) {
      const enc = /charset\s*=\s*([a-z0-9_:.-]+)/i.exec(attrs.content)
      if (enc && !fromHttpEquiv) fromHttpEquiv = enc[1]
    }
  }
  return fromCharsetAttr ?? fromHttpEquiv
}

function xmlEncoding(head: string): string | undefined {
  return /^\s*<\?xml\b[^>]*\bencoding\s*=\s*["']?\s*([a-z0-9_:.-]+)/i.exec(head)?.[1]
}

function parseHtmlAttributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw))) {
    out[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return out
}
