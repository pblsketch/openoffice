/**
 * @genoffice/pdf-structure/store — the result store (spec §6). Node-only
 * (node:fs, node:crypto), so it is its own package entry and is not exported
 * from the package root. `keys.ts` is pure and may be imported directly by
 * environment-free code.
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export {
  ResultStore,
  STORE_DIR_NAME,
  JOB_FILE,
  JOB_KINDS,
  JOB_RUNNING_WINDOW_MS,
  MODE_JOB_KINDS,
  TRANSLATION_MODES,
  isTranslationMode,
  jobKeyField,
  jobKeyOf,
  jobModeAllowed,
  type AiReadPayload,
  type AiReadPageEntry,
  type JobKind,
  type JobLastError,
  type JobProgress,
  type JobRecordInput,
  type JobState,
  type JobStatus,
  type MigrateInput,
  type MigrateResult,
  type ResultStoreOptions,
  type StoredTranslation,
  type TranslationBlockEntry,
  type TranslationBlockInput,
  type TranslationBlockStatus,
  type TranslationMetaInput,
  type TranslationMode,
} from './store'
export { StoreWriteError } from './files'
export { sentenceEndsPair, validSentenceEnds, type SentenceEnds } from './sentence-ends'
export {
  HIGHLIGHT_MAX_LABELS,
  HIGHLIGHT_PRESET_IDS,
  type HighlightBlockEntry,
  type HighlightBlockInput,
  type HighlightLabel,
  type HighlightPresetId,
  type HighlightRun,
  type HighlightSuggestion,
  type HighlightSuggestionState,
  type InsightsEntry,
  type PassageCard,
  type PassageCardInput,
} from './reading'
export {
  NOTE_LINKS_FILE,
  noteLinkKey,
  type FoundNoteLink,
  type NoteLink,
  type NoteLinks,
} from './note-links'
export {
  blockKeyString,
  normalizeSourceText,
  translationBlockKeys,
  type TranslationBlockKey,
} from './keys'

/** document key: SHA-256 hex of the file bytes */
export function documentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** documentHash of a file, streamed */
export function documentHashOfFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}
