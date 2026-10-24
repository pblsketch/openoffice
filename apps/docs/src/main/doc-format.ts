/**
 * Format rules of the main-process open/save paths. The Word editor opens and
 * saves `.docx` and `.odt`; the extension decides the format, and the bytes a
 * renderer sends must match it — docx bytes never land on an `.odt` path and
 * the other way round. docx-only treatment (lazy pictures, the open password)
 * never touches an ODT. Kept free of Electron so the rules are unit-tested.
 */
import { docFormatOfPath, type DocFormat } from '../shared/open-file'

export { docFormatOfPath, type DocFormat }

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50

/**
 * Entry names from a zip's central directory, or null when the bytes are not
 * a readable zip (zip64 directories included: neither format writes one).
 */
export function zipEntryNames(bytes: Uint8Array): string[] | null {
  if (bytes.length < 22) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const lowest = Math.max(0, bytes.length - 22 - 0xffff)
  for (let at = bytes.length - 22; at >= lowest; at--) {
    if (view.getUint32(at, true) !== EOCD_SIGNATURE) continue
    const count = view.getUint16(at + 10, true)
    let offset = view.getUint32(at + 16, true)
    if (count === 0xffff || offset === 0xffffffff) return null
    const decoder = new TextDecoder()
    const names: string[] = []
    for (let i = 0; i < count; i++) {
      if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
        return null
      }
      const nameLength = view.getUint16(offset + 28, true)
      const extraLength = view.getUint16(offset + 30, true)
      const commentLength = view.getUint16(offset + 32, true)
      if (offset + 46 + nameLength > bytes.length) return null
      names.push(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)))
      offset += 46 + nameLength + extraLength + commentLength
    }
    return names
  }
  return null
}

/** an OpenDocument package: `mimetype` and `content.xml`, no OOXML content types */
export function isOdtPackage(bytes: Uint8Array): boolean {
  const names = zipEntryNames(bytes)
  return (
    names !== null &&
    names.includes('mimetype') &&
    names.includes('content.xml') &&
    !names.includes('[Content_Types].xml')
  )
}

/** Save As target: a name without a Word-editor extension takes the current format's */
export function withDocExtension(filePath: string, fallback: DocFormat): string {
  return docFormatOfPath(filePath) ? filePath : `${filePath}.${fallback}`
}

/** extension of a document's crash-recovery copy: the copy keeps its document's format */
export function recoveryExtFor(filePath: string): '.docx' | '.odt' {
  return docFormatOfPath(filePath) === 'odt' ? '.odt' : '.docx'
}

export interface SaveBytesDeps {
  /** docx only: inline lazily served pictures before the file is written */
  materialize: (plain: Buffer) => Promise<{ bytes: Buffer; hashes: Set<string> }>
  /** docx only: the ECMA-376 open-password wrapper */
  encrypt: (plain: Buffer, password: string) => Buffer
  /** docx only: the password the write uses (null = plain) */
  password: string | null
}

export interface PreparedSave {
  /** what lands on disk */
  bytes: Buffer
  /** the plain document (docx before encryption; the ODT itself) */
  plain: Buffer
  /** lazy picture hashes the docx write absorbed (always empty for ODT) */
  hashes: Set<string>
  encrypted: boolean
}

/**
 * The bytes a save writes for `format`. An ODT is written exactly as the
 * renderer produced it (no lazy pictures, no open password: neither exists for
 * ODT here); bytes of the other format are refused so no path ever receives a
 * document in the wrong format.
 */
export async function prepareSaveBytes(
  format: DocFormat,
  data: Buffer,
  deps: SaveBytesDeps,
): Promise<PreparedSave> {
  if (format === 'odt') {
    if (!isOdtPackage(data)) throw new Error('save data is not an ODT document')
    return { bytes: data, plain: data, hashes: new Set(), encrypted: false }
  }
  if (isOdtPackage(data)) throw new Error('save data is not a docx document')
  const { bytes: plain, hashes } = await deps.materialize(data)
  const bytes = deps.password ? deps.encrypt(plain, deps.password) : plain
  return { bytes, plain, hashes, encrypted: !!deps.password }
}

export interface RecoveryBytesDeps {
  /** docx only: inline lazily served pictures, as a save does */
  materialize: SaveBytesDeps['materialize']
  /**
   * docx only: protect the plain copy for the file's current state on disk
   * (its open password), or null to skip this copy
   */
  protect: (plain: Buffer) => Buffer | null
}

/**
 * The bytes of a crash-recovery copy: what a save would write now, so the
 * copy stands on its own when the opened file is gone. A docx gets its lazily
 * served pictures back first (the caller holds the copy's write ticket by
 * then, so a save landing meanwhile still wins), then is protected against
 * the disk state as it is after that wait. Pictures that cannot be inlined
 * (their source went away) leave the copy as the renderer built it: the text
 * is kept, the pictures still point at the file. An ODT is copied as built;
 * bytes of the other format are refused (null skips the copy).
 */
export async function prepareRecoveryBytes(
  format: DocFormat,
  data: Buffer,
  deps: RecoveryBytesDeps,
): Promise<Buffer | null> {
  if (format === 'odt') return isOdtPackage(data) ? data : null
  if (isOdtPackage(data)) return null
  let plain = data
  try {
    plain = (await deps.materialize(data)).bytes
  } catch {
    /* keep the copy as built */
  }
  return deps.protect(plain)
}
