/**
 * Whether two crash-recovery copies hold the same document. Two serializations
 * of an unchanged document still differ in bytes once the clock moved: the zip
 * writer stamps entry times (folders in a docx, every entry in an ODT) and the
 * save stamps docx `dcterms:modified` (and the ODT `dc:date` carried from it)
 * with the moment it ran. A copy tick 30 s after the last copy would therefore
 * never see an unchanged document. This compares what the parts hold instead:
 * each file entry's name, CRC-32 and size from the zip's central directory,
 * and the one properties part whose stamp differs read without its stamp.
 */
import { readDocxPartBase64 } from '@genoffice/docx-engine'

/** parts that carry the serialization moment (docx core properties, ODT meta) */
const STAMPED_PARTS = new Set(['docProps/core.xml', 'meta.xml'])

const STAMPS = [
  /(<dcterms:modified\b[^>]*>)[^<]*(<\/dcterms:modified>)/g,
  /(<dc:date\b[^>]*>)[^<]*(<\/dc:date>)/g,
]

interface EntryDigest {
  crc: number
  size: number
}

/**
 * File entries (name → CRC-32 and uncompressed size) from the central
 * directory, or null when the bytes are not a plain zip this can read (a zip64
 * archive, a cut-off file): the caller then treats the copies as different.
 */
function zipEntryDigests(zip: Uint8Array): Map<string, EntryDigest> | null {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const len = zip.byteLength
  let eocd = -1
  for (let at = len - 22; at >= 0 && at >= len - 22 - 0xffff; at--) {
    if (view.getUint32(at, true) === 0x06054b50) {
      eocd = at
      break
    }
  }
  if (eocd < 0) return null
  const count = view.getUint16(eocd + 10, true)
  const cdSize = view.getUint32(eocd + 12, true)
  let at = view.getUint32(eocd + 16, true)
  if (count === 0xffff || at === 0xffffffff || at + cdSize > len) return null
  const names = new TextDecoder()
  const entries = new Map<string, EntryDigest>()
  for (let i = 0; i < count; i++) {
    if (at + 46 > len || view.getUint32(at, true) !== 0x02014b50) return null
    const crc = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 24, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    if (at + 46 + nameLen > len) return null
    const name = names.decode(zip.subarray(at + 46, at + 46 + nameLen))
    // a folder entry holds nothing but its time
    if (!name.endsWith('/')) entries.set(name, { crc, size })
    at += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function unstampedPart(zip: Uint8Array, path: string): Promise<string | null> {
  const base64 = await readDocxPartBase64(zip, path)
  if (base64 === null) return null
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  let xml = new TextDecoder().decode(bytes)
  for (const stamp of STAMPS) xml = xml.replace(stamp, '$1$2')
  return xml
}

export async function sameRecoveryCopy(a: Uint8Array, b: Uint8Array): Promise<boolean> {
  if (a.byteLength === b.byteLength) {
    let same = true
    for (let i = 0; i < a.byteLength && same; i++) same = a[i] === b[i]
    if (same) return true
  }
  const left = zipEntryDigests(a)
  const right = zipEntryDigests(b)
  if (!left || !right || left.size !== right.size) return false
  const stamped: string[] = []
  for (const [name, digest] of left) {
    const other = right.get(name)
    if (!other) return false
    if (other.crc === digest.crc && other.size === digest.size) continue
    if (!STAMPED_PARTS.has(name)) return false
    stamped.push(name)
  }
  for (const name of stamped) {
    const [x, y] = await Promise.all([unstampedPart(a, name), unstampedPart(b, name)])
    if (x === null || x !== y) return false
  }
  return true
}
