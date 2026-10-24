import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  ADOBE_FONT_OBFUSCATION,
  deobfuscateFont,
  fontObfuscationKey,
  IDPF_FONT_OBFUSCATION,
  obfuscateFont,
} from '../src/fonts'
import { sha1 } from '../src/sha1'

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex')

function fakeFont(length: number): Uint8Array {
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) out[i] = (i * 31 + 7) & 0xff
  return out
}

describe('sha1', () => {
  it.each([
    ['', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
    ['abc', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
    ],
  ])('hashes %j like the published vectors', (text, digest) => {
    expect(hex(sha1(new TextEncoder().encode(text)))).toBe(digest)
  })

  it('agrees with node:crypto across block boundaries', () => {
    for (const length of [55, 56, 63, 64, 65, 119, 120, 1000, 4097]) {
      const data = fakeFont(length)
      expect(hex(sha1(data))).toBe(createHash('sha1').update(data).digest('hex'))
    }
  })
})

describe('fontObfuscationKey', () => {
  it('IDPF: SHA-1 of the unique identifier with XML whitespace removed', () => {
    const id = ' urn:uuid:1234\t5678\r\n-abcd '
    const expected = createHash('sha1').update('urn:uuid:12345678-abcd', 'utf8').digest('hex')
    expect(hex(fontObfuscationKey(IDPF_FONT_OBFUSCATION, id)!)).toBe(expected)
  })

  it('IDPF: hashes the UTF-8 bytes of a non-ASCII identifier', () => {
    const expected = createHash('sha1').update('책-ID', 'utf8').digest('hex')
    expect(hex(fontObfuscationKey(IDPF_FONT_OBFUSCATION, '책-ID')!)).toBe(expected)
  })

  it('Adobe: the 16 bytes of the UUID in the identifier', () => {
    const key = fontObfuscationKey(
      ADOBE_FONT_OBFUSCATION,
      'urn:uuid:0F1E2D3C-4B5A-6978-8796-A5B4C3D2E1F0',
    )
    expect(hex(key!)).toBe('0f1e2d3c4b5a69788796a5b4c3d2e1f0')
    expect(
      hex(fontObfuscationKey(ADOBE_FONT_OBFUSCATION, '0f1e2d3c4b5a69788796a5b4c3d2e1f0')!),
    ).toBe('0f1e2d3c4b5a69788796a5b4c3d2e1f0')
  })

  it('Adobe: no key without a UUID', () => {
    expect(fontObfuscationKey(ADOBE_FONT_OBFUSCATION, 'isbn:978-0-00-000000-0')).toBeNull()
  })
})

describe('obfuscation round trip', () => {
  const id = 'urn:uuid:12345678-90ab-cdef-1234-567890abcdef'

  it('IDPF XORs exactly the first 1040 bytes with the 20-byte key', () => {
    const font = fakeFont(1500)
    const key = fontObfuscationKey(IDPF_FONT_OBFUSCATION, id)!
    const hidden = obfuscateFont(font, IDPF_FONT_OBFUSCATION, id)!
    for (let i = 0; i < 1500; i++) {
      expect(hidden[i]).toBe(i < 1040 ? font[i]! ^ key[i % 20]! : font[i])
    }
    expect(deobfuscateFont(hidden, IDPF_FONT_OBFUSCATION, id)).toEqual(font)
  })

  it('Adobe XORs exactly the first 1024 bytes with the 16-byte key', () => {
    const font = fakeFont(1500)
    const key = fontObfuscationKey(ADOBE_FONT_OBFUSCATION, id)!
    const hidden = obfuscateFont(font, ADOBE_FONT_OBFUSCATION, id)!
    for (let i = 0; i < 1500; i++) {
      expect(hidden[i]).toBe(i < 1024 ? font[i]! ^ key[i % 16]! : font[i])
    }
    expect(deobfuscateFont(hidden, ADOBE_FONT_OBFUSCATION, id)).toEqual(font)
  })

  it('handles fonts shorter than the obfuscated prefix and leaves the input alone', () => {
    const font = fakeFont(10)
    const copy = new Uint8Array(font)
    const hidden = obfuscateFont(font, IDPF_FONT_OBFUSCATION, id)!
    expect(hidden).toHaveLength(10)
    expect(font).toEqual(copy)
    expect(deobfuscateFont(hidden, IDPF_FONT_OBFUSCATION, id)).toEqual(font)
  })

  it('re-encodes under a new identifier', () => {
    const font = fakeFont(2048)
    const newId = 'urn:uuid:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    for (const algorithm of [IDPF_FONT_OBFUSCATION, ADOBE_FONT_OBFUSCATION] as const) {
      const hidden = obfuscateFont(font, algorithm, id)!
      const plain = deobfuscateFont(hidden, algorithm, id)!
      const rehidden = obfuscateFont(plain, algorithm, newId)!
      expect(rehidden).not.toEqual(hidden)
      expect(deobfuscateFont(rehidden, algorithm, newId)).toEqual(font)
    }
  })

  it('returns null when no key can be made', () => {
    expect(obfuscateFont(fakeFont(8), ADOBE_FONT_OBFUSCATION, 'not-a-uuid')).toBeNull()
  })
})
