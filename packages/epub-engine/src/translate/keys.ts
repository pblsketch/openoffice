/**
 * Store keys of a book translation (spec §8). They have the shape of the PDF
 * translation keys (pdf-structure `TranslationBlockKey`) so the same result
 * store and job engine serve both:
 * - the "page fingerprint" of a chapter block is the SHA-256 hex of the
 *   chapter's path inside the package (the store takes only
 *   `[A-Za-z0-9_-]{1,128}` segments, so the path itself cannot be used);
 * - title and contents units share one fixed fingerprint;
 * - the text hash is that of the unit's notation text, normalized as the PDF
 *   keys normalize their source text, so a formatting change is a new key.
 *
 * `epubTranslationKeys` and `epubBlockKeyString` give exactly what
 * pdf-structure's `translationBlockKeys` and `blockKeyString` give (the job
 * engine computes those); they live here because pdf-structure exports its
 * key helpers only from its Node-only store entry. A test holds them equal.
 *
 * Changing any value here loses every stored book translation.
 */
import { runsText, sha256Hex, type InlineRun } from '@genoffice/pdf-structure'
import type { TranslationBlockKey } from '@genoffice/pdf-structure/store'

/** the text the title and contents fingerprint is made from; never change it */
export const EPUB_METADATA_FINGERPRINT_SOURCE = 'epub-translation:title-and-contents'

/** page fingerprint of every title and contents unit */
export const EPUB_METADATA_FINGERPRINT = sha256Hex(EPUB_METADATA_FINGERPRINT_SOURCE)

/** page fingerprint of a chapter: SHA-256 hex of its zip entry path */
export function epubChapterFingerprint(path: string): string {
  return sha256Hex(path)
}

/** what the key hashes: NFC, whitespace runs collapsed, trimmed (as pdf-structure) */
function normalizedText(runs: readonly InlineRun[]): string {
  return runsText(runs).normalize('NFC').replace(/\s+/g, ' ').trim()
}

/**
 * One key per unit, in the given order: fingerprint, text hash, and how many
 * earlier units with that fingerprint had the same hash.
 */
export function epubTranslationKeys(
  units: readonly { runs: readonly InlineRun[]; pageFingerprint: string }[],
): TranslationBlockKey[] {
  const seen = new Map<string, number>()
  return units.map((u) => {
    const textHash = sha256Hex(normalizedText(u.runs))
    const slot = `${u.pageFingerprint}\u0000${textHash}`
    const occurrence = seen.get(slot) ?? 0
    seen.set(slot, occurrence + 1)
    return { pageFingerprint: u.pageFingerprint, textHash, occurrence }
  })
}

/** the map key of a block in a stored translation (`StoredTranslation.blocks`) */
export function epubBlockKeyString(key: TranslationBlockKey): string {
  return `${key.pageFingerprint}:${key.textHash}:${key.occurrence}`
}

/** document key of a book: SHA-256 hex of the file bytes */
export async function epubDocumentHash(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return sha256Hex(bytes)
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
  let hex = ''
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0')
  return hex
}
