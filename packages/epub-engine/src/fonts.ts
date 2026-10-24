/**
 * Font obfuscation (spec §3 "Resources", §8 "Obfuscated fonts").
 *
 * Two schemes exist, and both XOR the start of the font with a key derived
 * from a book identifier, so hiding and revealing are the same operation:
 *
 * - IDPF (OCF "Font Obfuscation", `http://www.idpf.org/2008/embedding`): the
 *   key is the SHA-1 digest of the UTF-8 unique identifier with every XML
 *   whitespace character (U+0020, U+0009, U+000D, U+000A) removed; the first
 *   1040 bytes are XORed with the 20-byte key, repeated.
 * - Adobe (`http://ns.adobe.com/pdf/enc#RC`): the key is the 16 bytes of the
 *   UUID in the identifier (`urn:uuid:` prefix and dashes removed); the first
 *   1024 bytes are XORed with the 16-byte key, repeated.
 *
 * Neither is encryption, which is why they are the only two entries an
 * `encryption.xml` may list for a book to open.
 */
import { sha1 } from './sha1'

export const IDPF_FONT_OBFUSCATION = 'http://www.idpf.org/2008/embedding'
export const ADOBE_FONT_OBFUSCATION = 'http://ns.adobe.com/pdf/enc#RC'

/** The two obfuscation algorithms a book may use; any other entry is DRM. */
export type FontObfuscationAlgorithm = typeof IDPF_FONT_OBFUSCATION | typeof ADOBE_FONT_OBFUSCATION

const IDPF_PREFIX_BYTES = 1040
const ADOBE_PREFIX_BYTES = 1024

export function isFontObfuscationAlgorithm(value: string): value is FontObfuscationAlgorithm {
  return value === IDPF_FONT_OBFUSCATION || value === ADOBE_FONT_OBFUSCATION
}

/** The 16 bytes of the UUID an identifier carries, or null when it carries none. */
function uuidBytes(identifier: string): Uint8Array | null {
  const hex = identifier
    .trim()
    .replace(/^urn:uuid:/i, '')
    .replace(/[{}-]/g, '')
  if (!/^[0-9a-f]{32}$/i.test(hex)) return null
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/**
 * The key `algorithm` derives from `identifier`. Null when no key can be made
 * (an Adobe key needs a UUID).
 */
export function fontObfuscationKey(
  algorithm: FontObfuscationAlgorithm,
  identifier: string,
): Uint8Array | null {
  if (algorithm === ADOBE_FONT_OBFUSCATION) return uuidBytes(identifier)
  return sha1(new TextEncoder().encode(identifier.replace(/[ \t\r\n]/g, '')))
}

/**
 * XORs the algorithm's prefix of `bytes` with a key from `fontObfuscationKey`;
 * returns a new array. Hiding and revealing are the same call.
 */
export function obfuscateFontWithKey(
  bytes: Uint8Array,
  algorithm: FontObfuscationAlgorithm,
  key: Uint8Array,
): Uint8Array {
  const out = new Uint8Array(bytes)
  const limit = Math.min(
    out.length,
    algorithm === ADOBE_FONT_OBFUSCATION ? ADOBE_PREFIX_BYTES : IDPF_PREFIX_BYTES,
  )
  for (let i = 0; i < limit; i++) out[i] = out[i]! ^ key[i % key.length]!
  return out
}

/**
 * Hides a font under the key `identifier` gives. Returns a new array, or null
 * when no key can be made from `identifier`.
 */
export function obfuscateFont(
  bytes: Uint8Array,
  algorithm: FontObfuscationAlgorithm,
  identifier: string,
): Uint8Array | null {
  const key = fontObfuscationKey(algorithm, identifier)
  return key ? obfuscateFontWithKey(bytes, algorithm, key) : null
}

/**
 * Reveals a font hidden under the key `identifier` gives. The same XOR as
 * `obfuscateFont`, named for the direction the caller means.
 */
export function deobfuscateFont(
  bytes: Uint8Array,
  algorithm: FontObfuscationAlgorithm,
  identifier: string,
): Uint8Array | null {
  return obfuscateFont(bytes, algorithm, identifier)
}
