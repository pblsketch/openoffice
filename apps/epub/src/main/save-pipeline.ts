/**
 * Saving a book and carrying its stored translations over, Electron-free (the
 * main module supplies the atomic write, the result store and the shell's
 * job-record migration; the tests supply fakes).
 *
 * Rules (spec §6, §12.1):
 * - nothing changed: the book's own file is not written at all; a save to
 *   another path (Save As) copies the bytes the book was opened from;
 * - something changed: the engine's `saveEpub` bytes are written, and only
 *   after the write succeeded does the session take them as its own;
 * - then, when the document hash changed, the stored translations move to the
 *   new hash: first the results (`ResultStore.migrateDocument` with
 *   `epubMigrationInfo`), then the job records (the shell's
 *   `migrateJobRecords`). A failed migration does not undo the save.
 */
import { epubMigrationInfo, type EpubBook } from '@genoffice/epub-engine'
import type { MigrateResult, ResultStore } from '@genoffice/pdf-structure/store'
import type { EpubBookSession } from './book-session'

/** what the migration needs of the result store */
export type MigrationStore = Pick<
  ResultStore,
  'migrateDocument' | 'listJobs' | 'readJob' | 'writeJob'
>

/** the shell's `migrateJobRecords` (apps/shell/src/main/pdf-structure/job-migration.ts) */
export type MigrateJobRecords = (
  store: Pick<ResultStore, 'listJobs' | 'readJob' | 'writeJob'>,
  oldDocHash: string,
  newDocHash: string,
) => Promise<number>

export interface MigrationDeps {
  /** the result store at `<userData>/pdf-store`, created on first use */
  store: () => MigrationStore
  /** absent in a standalone run: job records then stay where they are */
  migrateJobRecords?: MigrateJobRecords
  log?: (message: string) => void
}

export interface SaveDeps extends MigrationDeps {
  /** writes the whole file atomically; throws when it could not */
  write: (path: string, bytes: Uint8Array) => Promise<void>
  /** the save time for `dcterms:modified` */
  now?: () => Date
}

export interface MigrationOutcome {
  results: MigrateResult
  jobs: number
}

export type SaveBookOutcome =
  | {
      ok: true
      /** false when nothing changed and the book's own file was left alone */
      written: boolean
      /** the store key of the bytes now on disk */
      docHash: string
      /** null when the document hash did not change or the migration failed */
      migration: MigrationOutcome | null
    }
  | { ok: false; error: string }

/**
 * Moves what the store holds for `oldDocHash` to `newDocHash`: results first,
 * then job records. Null when the hashes are the same.
 */
export async function migrateStoredResults(
  saved: EpubBook,
  hashes: { oldDocHash: string; newDocHash: string },
  deps: MigrationDeps,
): Promise<MigrationOutcome | null> {
  if (hashes.oldDocHash === hashes.newDocHash) return null
  const store = deps.store()
  const info = await epubMigrationInfo(saved, hashes)
  const results = await store.migrateDocument(info)
  const jobs = deps.migrateJobRecords
    ? await deps.migrateJobRecords(store, hashes.oldDocHash, hashes.newDocHash)
    : 0
  return { results, jobs }
}

/**
 * Saves the session's book to `target`. `sameFile` says whether `target` is
 * the file the book came from (then an unchanged book writes nothing).
 */
export async function saveBook(
  session: EpubBookSession,
  target: string,
  sameFile: boolean,
  deps: SaveDeps,
): Promise<SaveBookOutcome> {
  const { result, snapshot } = await session.prepareSave(deps.now ? { now: deps.now } : {})
  if (!result.ok) {
    return { ok: false, error: `epub: the save was refused (${result.reason}): ${result.detail}` }
  }
  if (!result.changed) {
    if (sameFile) return { ok: true, written: false, docHash: session.docHash, migration: null }
    await deps.write(target, session.bytes)
    return { ok: true, written: true, docHash: session.docHash, migration: null }
  }
  await deps.write(target, result.bytes)
  const hashes = await session.rebase(result.bytes, snapshot)
  let migration: MigrationOutcome | null = null
  try {
    migration = await migrateStoredResults(session.book, hashes, deps)
  } catch (err) {
    deps.log?.(
      `[epub] stored translations did not move to the saved file: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
  return { ok: true, written: true, docHash: hashes.newDocHash, migration }
}
