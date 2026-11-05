/**
 * The result store as the document job engine sees it (`DocumentJobStore`),
 * over the pdf editor's store channels (window.pdfApi.store). The engine runs
 * in the renderer; every read and write goes to the shell, which keeps the
 * store and accepts only document hashes it computed for this view.
 *
 * A failed call throws: the engine stops a job whose result cannot be stored
 * ('store-write-failed') instead of counting the unit as done.
 */
import type { DocumentJobStore } from '../../../../../packages/pdf-structure/src/jobs/engine'
import { blockKeyString } from '../../../../../packages/pdf-structure/src/store/keys'
import type {
  AiReadPageEntry,
  StoredTranslation,
  TranslationBlockEntry,
  TranslationMode,
} from '../../../../../packages/pdf-structure/src/store/store'
import type {
  PdfStoreApi,
  PdfStoreWriteRequest,
  PdfStructureErrorCode,
  PdfStructureFailure,
} from '../../shared/ipc'

/** a store call the shell refused or could not do */
export class JobStoreCallError extends Error {
  readonly code: PdfStructureErrorCode

  constructor(failure: PdfStructureFailure) {
    super(failure.message ?? `result store call failed: ${failure.error}`)
    this.name = 'JobStoreCallError'
    this.code = failure.error
  }
}

export type JobStoreApi = Pick<PdfStoreApi, 'aiReadPages' | 'translation' | 'write'>

/** the `mode` of a request: none for a plain translation, so its request stays as it was */
const modeField = (mode: TranslationMode | undefined): { mode?: 'easy' } =>
  mode === 'easy' ? { mode } : {}

async function write(api: JobStoreApi, request: PdfStoreWriteRequest): Promise<void> {
  const out = await api.write(request)
  if (!out.ok) throw new JobStoreCallError(out)
}

/**
 * `DocumentJobStore` over IPC: AI-read pages, translations and job records.
 * A job record carries its own second key (`lang`, or `runId` for a
 * highlight job) and its mode; the shell stores it under those. The
 * translation calls pass their optional `mode` on ('easy' reaches the easy
 * explanation; left out, the plain translation).
 */
export function createIpcJobStore(api: JobStoreApi): DocumentJobStore {
  return {
    async readAiReadPages(docHash) {
      const out = await api.aiReadPages(docHash)
      if (!out.ok) throw new JobStoreCallError(out)
      return new Map<string, AiReadPageEntry>(out.pages.map((p) => [p.pageFingerprint, p]))
    },
    writeAiReadPage: (docHash, pageFingerprint, payload, meta = {}) =>
      write(api, {
        kind: 'aiReadPage',
        docHash,
        pageFingerprint,
        payload,
        ...(meta.provider !== undefined ? { provider: meta.provider } : {}),
        ...(meta.model !== undefined ? { model: meta.model } : {}),
      }),
    async readTranslation(docHash, lang, mode): Promise<StoredTranslation | null> {
      const out =
        mode === 'easy'
          ? await api.translation(docHash, lang, mode)
          : await api.translation(docHash, lang)
      if (!out.ok) throw new JobStoreCallError(out)
      const t = out.translation
      if (!t) return null
      return {
        lang: t.lang,
        provider: t.provider,
        model: t.model,
        blocks: new Map<string, TranslationBlockEntry>(
          t.blocks.map((b) => [blockKeyString(b.key), b]),
        ),
      }
    },
    writeTranslationMeta: (docHash, lang, meta, mode) =>
      write(api, {
        kind: 'translationMeta',
        docHash,
        lang,
        provider: meta.provider,
        model: meta.model,
        ...modeField(mode),
      }),
    writeTranslationBlocks: (docHash, lang, blocks, mode) =>
      write(api, {
        kind: 'translationBlocks',
        docHash,
        lang,
        blocks: [...blocks],
        ...modeField(mode),
      }),
    deleteTranslation: (docHash, lang, mode) =>
      write(api, { kind: 'deleteTranslation', docHash, lang, ...modeField(mode) }),
    /** "translate again from the start" keeping the person's edits; the entries removed */
    async deleteTranslationExceptEdited(docHash, lang, mode) {
      const out = await api.write({
        kind: 'deleteTranslationExceptEdited',
        docHash,
        lang,
        ...modeField(mode),
      })
      if (!out.ok) throw new JobStoreCallError(out)
      return out.removed ?? 0
    },
    writeJob: (docHash, job) => write(api, { kind: 'job', docHash, job }),
  }
}
