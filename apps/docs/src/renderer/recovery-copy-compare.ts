/**
 * Whether two crash-recovery copies hold the same document. Two serializations
 * of an unchanged document still differ in bytes once the clock moved: the zip
 * writer stamps entry times (folders in a docx, every entry in an ODT) and the
 * save stamps docx `dcterms:modified` (and the ODT `dc:date` carried from it)
 * with the moment it ran. A copy tick 30 s after the last copy would therefore
 * never see an unchanged document. This compares what the parts hold instead,
 * exactly: entry times are never read, a part whose compressed data is the same
 * holds the same bytes, any other part is inflated and compared byte for byte,
 * and the properties part is compared without its modified stamp. The CRC-32
 * and size in the central directory only answer "different" early; equal ones
 * prove nothing (two texts can share both).
 */

/** parts that carry the serialization moment (docx core properties, ODT meta) */
const STAMPED_PARTS = new Set(['docProps/core.xml', 'meta.xml'])

const STAMPS = [
  /(<dcterms:modified\b[^>]*>)[^<]*(<\/dcterms:modified>)/g,
  /(<dc:date\b[^>]*>)[^<]*(<\/dc:date>)/g,
]

interface ZipEntry {
  crc: number
  size: number
  method: number
  /** the entry's compressed data inside the archive */
  data: Uint8Array
}

/**
 * File entries by name from the central directory, each with its compressed
 * data, or null when the bytes are not a plain zip this can read (a zip64
 * archive, a cut-off file): the caller then treats the copies as different.
 */
function zipEntries(zip: Uint8Array): Map<string, ZipEntry> | null {
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
  const entries = new Map<string, ZipEntry>()
  for (let i = 0; i < count; i++) {
    if (at + 46 > len || view.getUint32(at, true) !== 0x02014b50) return null
    const method = view.getUint16(at + 10, true)
    const crc = view.getUint32(at + 16, true)
    const compressed = view.getUint32(at + 20, true)
    const size = view.getUint32(at + 24, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    if (at + 46 + nameLen > len) return null
    const name = names.decode(zip.subarray(at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen
    // a folder entry holds nothing but its time
    if (name.endsWith('/')) continue
    if (local + 30 > len || view.getUint32(local, true) !== 0x04034b50) return null
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    if (start + compressed > len) return null
    entries.set(name, { crc, size, method, data: zip.subarray(start, start + compressed) })
  }
  return entries
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false
  return true
}

/** the entry's own bytes, or null for a method this does not read */
async function inflate(entry: ZipEntry): Promise<Uint8Array | null> {
  if (entry.method === 0) return entry.data
  if (entry.method !== 8) return null
  // the copies are plain ArrayBuffer-backed bytes (never shared memory)
  const input = entry.data as Uint8Array<ArrayBuffer>
  const reader = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(input)
      controller.close()
    },
  })
    .pipeThrough(new DecompressionStream('deflate-raw'))
    .getReader()
  const out = new Uint8Array(entry.size)
  let filled = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (filled + value.byteLength > out.byteLength) return null
    out.set(value, filled)
    filled += value.byteLength
  }
  return filled === out.byteLength ? out : null
}

function unstamped(bytes: Uint8Array): string {
  let xml = new TextDecoder().decode(bytes)
  for (const stamp of STAMPS) xml = xml.replace(stamp, '$1$2')
  return xml
}

export async function sameRecoveryCopy(a: Uint8Array, b: Uint8Array): Promise<boolean> {
  if (sameBytes(a, b)) return true
  const left = zipEntries(a)
  const right = zipEntries(b)
  if (!left || !right || left.size !== right.size) return false
  const toRead: Array<[string, ZipEntry, ZipEntry]> = []
  for (const [name, entry] of left) {
    const other = right.get(name)
    if (!other) return false
    const stamped = STAMPED_PARTS.has(name)
    // a different CRC or size is a different part (the stamp aside)
    if (!stamped && (other.crc !== entry.crc || other.size !== entry.size)) return false
    // the same compressed data inflates to the same bytes
    if (other.method === entry.method && sameBytes(other.data, entry.data)) continue
    toRead.push([name, entry, other])
  }
  for (const [name, entry, other] of toRead) {
    const [x, y] = await Promise.all([inflate(entry), inflate(other)])
    if (!x || !y) return false
    if (STAMPED_PARTS.has(name) ? unstamped(x) !== unstamped(y) : !sameBytes(x, y)) return false
  }
  return true
}
