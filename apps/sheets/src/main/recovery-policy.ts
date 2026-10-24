import { createHash } from 'node:crypto'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { writeJsonAtomic } from '@genoffice/electron-utils/atomic-write'
import {
  newUntitledRecoveryId,
  type RecoveryIdentity,
  type RecoveryStore,
  type RecoveryUntitledIdentity,
} from '@genoffice/electron-utils'

/**
 * The current xlsx patcher materializes worksheet XML as JavaScript strings.
 * Rewriting a large entry can therefore require several times its uncompressed
 * size in the Electron main process. Automatic recovery is best-effort and
 * must not make an otherwise responsive workbook crash in the background.
 */
export const MAX_AUTOMATIC_RECOVERY_WORKSHEET_XML_BYTES = 64 * 1024 * 1024

export function allowsAutomaticWorkbookRecovery(
  sheets: readonly { readonly sourceXmlBytes?: number | undefined }[],
): boolean {
  return sheets.every(
    (sheet) =>
      sheet.sourceXmlBytes === undefined ||
      sheet.sourceXmlBytes <= MAX_AUTOMATIC_RECOVERY_WORKSHEET_XML_BYTES,
  )
}

/** what decides which recovery copy a workbook session writes */
export interface RecoverySessionShape {
  readonly path: string
  readonly suggestSaveAs?: string | undefined
  readonly unsavedNew?: boolean | undefined
  readonly csvSourcePath?: string | undefined
  readonly restoreTarget?: string | undefined
  readonly password?: string | undefined
  /**
   * set for an untitled workbook, a CSV or converted session (see
   * convertedSessionRecovery), and a copy restored as untitled
   */
  readonly recoveryIdentity?: RecoveryIdentity | undefined
}

/**
 * The document a session's recovery copy belongs to, or null when the session
 * has none:
 * - a password workbook never gets a copy (it would be plaintext, decision 0041);
 * - a new workbook (a temp backing file the user never saved) is untitled and
 *   carries its own identity;
 * - a CSV or converted .xls/.tsv session has no original that could hold the
 *   workbook bytes: it writes the untitled copy it was given when it opened
 *   (convertedSessionRecovery), and none without one (a merge source);
 * - a restored copy or an empty original runs on a temp file and belongs to
 *   the user's file (`restoreTarget`); anything else to the opened path.
 */
export function sessionRecoveryIdentity(session: RecoverySessionShape): RecoveryIdentity | null {
  if (session.password !== undefined) return null
  if (session.recoveryIdentity !== undefined) return session.recoveryIdentity
  if (session.unsavedNew) return null
  if (session.csvSourcePath !== undefined || session.suggestSaveAs !== undefined) return null
  return { kind: 'sheets', filePath: session.restoreTarget ?? session.path }
}

/** what decides whether an opened file is a CSV or converted session */
export interface ConvertedOpenShape {
  readonly csvSourcePath?: string | undefined
  readonly suggestSaveAs?: string | undefined
  readonly unsavedNew?: boolean | undefined
  readonly password?: string | undefined
  readonly recoveryIdentity?: RecoveryIdentity | undefined
}

/**
 * The recovery copy a CSV or converted (.xls/.tsv) session keeps: an untitled
 * .xlsx copy that remembers the file it came from (shown in the launch list,
 * offered by the first Save As of the restored workbook). The original file
 * cannot hold the workbook bytes, so the copy never belongs to its path. Null
 * for every other open, a password workbook included (no plaintext copy).
 */
export function convertedSessionRecovery(
  prepared: ConvertedOpenShape,
  openedPath: string,
): { recoveryIdentity: RecoveryUntitledIdentity; recoveryOriginalPath: string } | null {
  if (prepared.password !== undefined || prepared.unsavedNew) return null
  if (prepared.recoveryIdentity !== undefined) return null
  if (prepared.csvSourcePath === undefined && prepared.suggestSaveAs === undefined) return null
  return {
    recoveryIdentity: { kind: 'sheets', untitledId: newUntitledRecoveryId(), ext: '.xlsx' },
    recoveryOriginalPath: prepared.csvSourcePath ?? openedPath,
  }
}

/**
 * The first Save As a workbook opened from `originalPath` suggests: the file
 * itself when it is a workbook, else its .xlsx sibling — what a CSV or
 * converted session offers before any crash.
 */
export function saveAsDefaultFor(originalPath: string): string {
  if (/.xls[xm]$/i.test(originalPath)) return originalPath
  const ext = extname(originalPath)
  return `${ext ? originalPath.slice(0, -ext.length) : originalPath}.xlsx`
}

/** the extension an untitled workbook's copy is written in (its first save's format) */
export function untitledWorkbookExt(suggestSaveAs: string): '.xlsx' | '.xlsm' {
  return extname(suggestSaveAs).toLowerCase() === '.xlsm' ? '.xlsm' : '.xlsx'
}

/** Earlier versions listed unsaved new workbooks here (their would-be paths). */
export const LEGACY_UNSAVED_NEW_INDEX = 'unsaved-new.json'

/** where an earlier version kept the copy of a workbook keyed by `filePath` */
export function legacyCopyName(filePath: string): string {
  return `${createHash('sha1').update(filePath).digest('hex').slice(0, 16)}.xlsx`
}

/**
 * Move the unsaved new workbooks an earlier version left behind into the
 * shared store as untitled copies in state "later": the launch list offers
 * them, and they are no longer reopened at every launch. Each listed
 * would-be path's copy (named by the hash of that path, like a file copy) is
 * adopted under the path's file name as its title. Entries whose copy is gone
 * are dropped; an entry whose move failed stays listed and is retried at the
 * next call. The index file goes away once it is empty; an index that cannot
 * be read is left in place. Nothing outside the recovery folder is read or
 * written.
 */
export function migrateLegacyUnsavedNew(
  store: Pick<RecoveryStore, 'adoptUntitledCopy'>,
  recoveryDir: string,
): RecoveryUntitledIdentity[] {
  const indexPath = join(recoveryDir, LEGACY_UNSAVED_NEW_INDEX)
  if (!existsSync(indexPath)) return []
  let listed: unknown
  try {
    listed = JSON.parse(readFileSync(indexPath, 'utf8'))
  } catch {
    listed = undefined
  }
  // Unreadable (earlier versions did not write it atomically): keep it as it
  // is rather than lose the only record of those workbooks, and go on.
  if (!Array.isArray(listed)) return []
  const paths = listed.filter((path): path is string => typeof path === 'string' && path.length > 0)
  const adopted: RecoveryUntitledIdentity[] = []
  const remaining: string[] = []
  for (const path of [...new Set(paths)]) {
    const copy = join(recoveryDir, legacyCopyName(path))
    if (!existsSync(copy)) continue
    const identity = store.adoptUntitledCopy('sheets', copy, {
      title: basename(path),
      ext: untitledWorkbookExt(path),
      state: 'later',
    })
    if (identity) adopted.push(identity)
    else remaining.push(path)
  }
  try {
    if (remaining.length === 0) unlinkSync(indexPath)
    else writeJsonAtomic(indexPath, remaining)
  } catch (error) {
    console.warn('[sheets] legacy unsaved-new index update failed:', error)
  }
  return adopted
}
