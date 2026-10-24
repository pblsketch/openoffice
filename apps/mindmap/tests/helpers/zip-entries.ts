/**
 * The entries of a zip archive exactly as they are stored: name, compression
 * method, modification time and date, checksum and the stored (compressed)
 * bytes, read from the central directory. Two entries that compare equal here
 * are the same bytes in the file, not merely the same content.
 */
export interface StoredEntry {
  name: string
  method: number
  time: number
  date: number
  crc: number
  stored: Uint8Array
}

export function storedEntries(archive: Uint8Array): StoredEntry[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  let end = archive.byteLength - 22
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < 0) throw new Error('not a zip archive: no end of central directory')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const decoder = new TextDecoder()
  const entries: StoredEntry[] = []
  for (let index = 0; index < count; index++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('broken central directory')
    const method = view.getUint16(at + 10, true)
    const time = view.getUint16(at + 12, true)
    const date = view.getUint16(at + 14, true)
    const crc = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    const name = decoder.decode(archive.subarray(at + 46, at + 46 + nameLength))
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error(`broken local header: ${name}`)
    const data = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    entries.push({ name, method, time, date, crc, stored: archive.slice(data, data + size) })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}
