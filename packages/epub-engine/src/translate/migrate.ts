/**
 * Carrying stored translations over an in-app save (spec §8). The save
 * changes the file bytes and so the document key, but not the chapter paths
 * the fingerprints are made from. A block whose chapter path and text did not
 * change keeps its key in the saved book, so the store's `migrateDocument`
 * moves exactly the blocks whose key the saved book still has
 * (`keepBlockKeys`); the translation of an edited block stays behind.
 */
import type { MigrateInput, TranslationBlockKey } from '@genoffice/pdf-structure/store'
import type { EpubBook } from '../types'
import { EPUB_METADATA_FINGERPRINT, epubChapterFingerprint } from './keys'
import { epubTranslationUnits } from './units'

export interface EpubMigrationInfo extends MigrateInput {
  /** the keys of every unit of the saved book (all chapters, title and contents) */
  blockKeys: TranslationBlockKey[]
  /** the same keys: the only translation blocks that move */
  keepBlockKeys: TranslationBlockKey[]
}

/**
 * The input of `ResultStore.migrateDocument` for a saved book: the title and
 * contents fingerprint and every spine chapter's, plus the block keys the
 * saved book has, which are the only translation blocks that move.
 */
export async function epubMigrationInfo(
  saved: EpubBook,
  hashes: { oldDocHash: string; newDocHash: string },
): Promise<EpubMigrationInfo> {
  const fingerprints = [EPUB_METADATA_FINGERPRINT]
  for (const item of saved.spine.items) {
    const fp = epubChapterFingerprint(item.path)
    if (!fingerprints.includes(fp)) fingerprints.push(fp)
  }
  const { units } = await epubTranslationUnits(saved)
  const blockKeys = units.map((u) => u.key)
  return {
    oldDocHash: hashes.oldDocHash,
    newDocHash: hashes.newDocHash,
    pageFingerprints: fingerprints,
    blockKeys,
    keepBlockKeys: blockKeys,
  }
}
