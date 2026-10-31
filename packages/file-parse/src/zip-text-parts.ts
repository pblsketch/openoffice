import { open, type FileHandle } from 'node:fs/promises'

/**
 * A large zip-based document read for its words only.
 *
 * A pptx, docx, hwpx or epub is mostly pictures by size: a 300 MB slide deck
 * may carry 2 MB of slide XML. Reading the whole file into memory to get at
 * that XML is what made large documents unreadable. Here the zip is read from
 * disk by its central directory, the text parts (XML, relationships, JSON,
 * HTML, plain text) are copied over still compressed, and every other part
 * (pictures, media, fonts, embedded objects) is kept by name with no content.
 * The result is a small, well-formed zip the format readers open as before;
 * a part kept by name keeps manifests and relationships pointing at something.
 *
 * Nothing is inflated here. The zip gate still meters every kept part when the
 * format reader opens the result.
 */

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50
const EOCD_MIN = 22
const EOCD_SEARCH = EOCD_MIN + 0xffff
const CEN_FIXED = 46
const LOC_FIXED = 30
/** general purpose flag: names are UTF-8 */
const FLAG_UTF8 = 0x0800

/** part name endings whose content is words or structure, never pictures */
const TEXT_PART_EXTS = new Set([
  'xml',
  'rels',
  'json',
  'txt',
  'html',
  'htm',
  'xhtml',
  'xht',
  'opf',
  'ncx',
  'hpf',
])

/** whether a part is read for text; a part with no extension (`mimetype`) is */
export function isTextPart(name: string): boolean {
  const last = name.slice(name.lastIndexOf('/') + 1)
  const dot = last.lastIndexOf('.')
  if (dot <= 0) return true
  return TEXT_PART_EXTS.has(last.slice(dot + 1).toLowerCase())
}

interface CentralEntry {
  flags: number
  method: number
  time: number
  date: number
  crc: number
  compSize: number
  size: number
  localOffset: number
  name: Buffer
}

async function readAt(file: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  let read = 0
  while (read < length) {
    const { bytesRead } = await file.read(buffer, read, length - read, position + read)
    if (bytesRead === 0) throw new Error('zip: unexpected end of file')
    read += bytesRead
  }
  return buffer
}

function findEocd(tail: Buffer): number {
  for (let i = tail.length - EOCD_MIN; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD_SIG) return i
  }
  return -1
}

function centralEntries(cd: Buffer, count: number): CentralEntry[] {
  const out: CentralEntry[] = []
  let at = 0
  for (let i = 0; i < count; i++) {
    if (at + CEN_FIXED > cd.length || cd.readUInt32LE(at) !== CEN_SIG) {
      throw new Error('zip: broken central directory')
    }
    const nameLen = cd.readUInt16LE(at + 28)
    const extraLen = cd.readUInt16LE(at + 30)
    const commentLen = cd.readUInt16LE(at + 32)
    const end = at + CEN_FIXED + nameLen + extraLen + commentLen
    if (end > cd.length) throw new Error('zip: broken central directory')
    const compSize = cd.readUInt32LE(at + 20)
    const size = cd.readUInt32LE(at + 24)
    const localOffset = cd.readUInt32LE(at + 42)
    if (compSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('zip: zip64 archives are not supported')
    }
    out.push({
      flags: cd.readUInt16LE(at + 8),
      method: cd.readUInt16LE(at + 10),
      time: cd.readUInt16LE(at + 12),
      date: cd.readUInt16LE(at + 14),
      crc: cd.readUInt32LE(at + 16),
      compSize,
      size,
      localOffset,
      name: Buffer.from(cd.subarray(at + CEN_FIXED, at + CEN_FIXED + nameLen)),
    })
    at = end
  }
  return out
}

function localHeader(entry: CentralEntry, flags: number): Buffer {
  const head = Buffer.alloc(LOC_FIXED)
  head.writeUInt32LE(LOC_SIG, 0)
  head.writeUInt16LE(20, 4)
  head.writeUInt16LE(flags, 6)
  head.writeUInt16LE(entry.method, 8)
  head.writeUInt16LE(entry.time, 10)
  head.writeUInt16LE(entry.date, 12)
  head.writeUInt32LE(entry.crc, 14)
  head.writeUInt32LE(entry.compSize, 18)
  head.writeUInt32LE(entry.size, 22)
  head.writeUInt16LE(entry.name.length, 26)
  head.writeUInt16LE(0, 28)
  return head
}

function centralHeader(entry: CentralEntry, flags: number, offset: number): Buffer {
  const head = Buffer.alloc(CEN_FIXED)
  head.writeUInt32LE(CEN_SIG, 0)
  head.writeUInt16LE(20, 4)
  head.writeUInt16LE(20, 6)
  head.writeUInt16LE(flags, 8)
  head.writeUInt16LE(entry.method, 10)
  head.writeUInt16LE(entry.time, 12)
  head.writeUInt16LE(entry.date, 14)
  head.writeUInt32LE(entry.crc, 16)
  head.writeUInt32LE(entry.compSize, 20)
  head.writeUInt32LE(entry.size, 24)
  head.writeUInt16LE(entry.name.length, 28)
  head.writeUInt32LE(offset, 42)
  return head
}

/**
 * The zip at `filePath` with only its text parts' content: every part keeps its
 * name, parts that are not text (`isTextPart`) become empty stored parts.
 * Throws `zip: …` on an archive it cannot walk (broken, zip64).
 */
export async function readZipTextParts(filePath: string): Promise<Buffer> {
  const file = await open(filePath, 'r')
  try {
    const fileSize = (await file.stat()).size
    if (fileSize < EOCD_MIN) throw new Error('zip: file too short')
    const tailLength = Math.min(fileSize, EOCD_SEARCH)
    const tail = await readAt(file, fileSize - tailLength, tailLength)
    const eocd = findEocd(tail)
    if (eocd < 0) throw new Error('zip: end of central directory not found')
    const count = tail.readUInt16LE(eocd + 10)
    const cdSize = tail.readUInt32LE(eocd + 12)
    const cdOffset = tail.readUInt32LE(eocd + 16)
    if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      throw new Error('zip: zip64 archives are not supported')
    }
    if (cdOffset + cdSize > fileSize) throw new Error('zip: central directory out of range')
    const entries = centralEntries(await readAt(file, cdOffset, cdSize), count)

    const locals: Buffer[] = []
    const centrals: Buffer[] = []
    let offset = 0
    for (const entry of entries) {
      const keep = isTextPart(entry.name.toString('utf8'))
      // the data descriptor bit is dropped: sizes and crc are written up front
      const flags = keep ? entry.flags & ~0x0008 : entry.flags & FLAG_UTF8
      let data: Buffer = Buffer.alloc(0)
      let written = entry
      if (keep) {
        if (entry.localOffset + LOC_FIXED > fileSize) throw new Error('zip: entry out of range')
        const head = await readAt(file, entry.localOffset, LOC_FIXED)
        if (head.readUInt32LE(0) !== LOC_SIG) throw new Error('zip: broken local header')
        const start = entry.localOffset + LOC_FIXED + head.readUInt16LE(26) + head.readUInt16LE(28)
        if (start + entry.compSize > fileSize) throw new Error('zip: entry out of range')
        data = await readAt(file, start, entry.compSize)
      } else {
        written = { ...entry, method: 0, crc: 0, compSize: 0, size: 0 }
      }
      locals.push(localHeader(written, flags), entry.name, data)
      centrals.push(centralHeader(written, flags, offset), entry.name)
      offset += LOC_FIXED + entry.name.length + data.length
    }
    const central = Buffer.concat(centrals)
    const end = Buffer.alloc(EOCD_MIN)
    end.writeUInt32LE(EOCD_SIG, 0)
    end.writeUInt16LE(entries.length, 8)
    end.writeUInt16LE(entries.length, 10)
    end.writeUInt32LE(central.length, 12)
    end.writeUInt32LE(offset, 16)
    return Buffer.concat([...locals, central, end])
  } finally {
    await file.close()
  }
}
