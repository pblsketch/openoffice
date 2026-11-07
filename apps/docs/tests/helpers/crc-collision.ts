import { crc32 } from 'node:zlib'

/**
 * Two different lowercase strings of `length` letters that give `prefix + x`
 * and `prefix + y` the same CRC-32 (and, being as long, the same size). A
 * birthday search: about 2^16 tries for a 32-bit checksum.
 */
export function crcTwins(prefix: string, length: number): [string, string] {
  const start = crc32(Buffer.from(prefix, 'utf8'))
  const seen = new Map<number, string>()
  let seed = 12345
  for (;;) {
    let s = ''
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      s += String.fromCharCode(97 + ((seed >>> 8) % 26))
    }
    const crc = crc32(Buffer.from(s, 'utf8'), start)
    const prev = seen.get(crc)
    if (prev !== undefined && prev !== s) return [prev, s]
    seen.set(crc, s)
  }
}
