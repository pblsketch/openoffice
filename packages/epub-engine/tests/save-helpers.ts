import JSZip from 'jszip'

/** One file or folder entry of an archive as a reader sees it. */
export interface ReadEntry {
  name: string
  dir: boolean
  /** decompressed content */
  bytes: Uint8Array
  /** the stored compression method: 'STORE', 'DEFLATE' or the raw magic */
  method: string
  date: number
}

/** Every entry of an archive in the archive's order, decompressed. */
export async function readEntries(bytes: Uint8Array): Promise<ReadEntry[]> {
  const zip = await JSZip.loadAsync(bytes)
  const out: ReadEntry[] = []
  for (const file of Object.values(zip.files)) {
    const data = (file as unknown as { _data?: { compression?: { magic?: string } } })._data
    const magic = data?.compression?.magic
    out.push({
      name: file.name,
      dir: file.dir,
      bytes: new Uint8Array(await file.async('uint8array')),
      method: magic === '\x00\x00' ? 'STORE' : magic === '\x08\x00' ? 'DEFLATE' : String(magic),
      date: file.date.getTime(),
    })
  }
  return out
}

export const utf8 = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

/**
 * The first local file header of an archive: what an OCF reader checks for the
 * `mimetype` entry (name, method, no extra field, the content right after).
 */
export function firstLocalEntry(bytes: Uint8Array): {
  signature: number
  method: number
  name: string
  extraLength: number
  content: string
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const nameLength = view.getUint16(26, true)
  const extraLength = view.getUint16(28, true)
  const compressedSize = view.getUint32(18, true)
  const start = 30 + nameLength + extraLength
  return {
    signature: view.getUint32(0, true),
    method: view.getUint16(8, true),
    name: utf8(bytes.subarray(30, 30 + nameLength)),
    extraLength,
    content: utf8(bytes.subarray(start, start + compressedSize)),
  }
}
