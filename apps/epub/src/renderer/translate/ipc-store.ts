/**
 * The result store as the book translation job sees it, over this editor's
 * store channels (`window.epubApi.store`, `epub:store-*`). The job runs in the
 * page; every read and write goes to the main process, which keeps the store
 * (`<userData>/pdf-store`) and answers only document hashes of this view's
 * book.
 *
 * A failed call throws: the engine stops a job whose result cannot be stored
 * ('store-write-failed') instead of counting the unit as done.
 *
 * The job passes an easy explanation's mode ('easy') as the last argument of
 * each translation call, and an easy job record carries `mode: 'easy'`; both
 * go on as the request's `mode`, so the main process reads and writes the
 * easy results and record. A plain translation's requests carry no mode, as
 * before.
 */
import type { StartEpubTranslationJobOptions } from '@genoffice/epub-engine'
import type {
  StoredTranslation,
  TranslationBlockEntry,
  TranslationMode,
} from '@genoffice/pdf-structure/store'
import { blockKeyString } from '../../../../../packages/pdf-structure/src/store/keys'
import type {
  EpubErrorCode,
  EpubFailure,
  EpubStoreApi,
  EpubStoreWriteRequest,
} from '../../shared/ipc'

/** a store call the main process refused or could not do */
export class BookStoreCallError extends Error {
  readonly code: EpubErrorCode

  constructor(failure: EpubFailure) {
    super(failure.message ?? `result store call failed: ${failure.error}`)
    this.name = 'BookStoreCallError'
    this.code = failure.error
  }
}

export type BookJobStore = StartEpubTranslationJobOptions['store']

export type BookStoreApi = Pick<EpubStoreApi, 'translation' | 'write'>

/** the `mode` of a request: none for a plain translation, so its request stays as it was */
const modeField = (mode: TranslationMode | undefined): { mode?: 'easy' } =>
  mode === 'easy' ? { mode } : {}

async function write(api: BookStoreApi, request: EpubStoreWriteRequest): Promise<void> {
  const out = await api.write(request)
  if (!out.ok) throw new BookStoreCallError(out)
}

/** the store the translation job and its estimate use */
export function createBookJobStore(api: BookStoreApi): BookJobStore {
  return {
    async readTranslation(docHash, lang, mode): Promise<StoredTranslation | null> {
      const out =
        mode === 'easy'
          ? await api.translation(docHash, lang, mode)
          : await api.translation(docHash, lang)
      if (!out.ok) throw new BookStoreCallError(out)
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
    async deleteTranslationExceptEdited(docHash, lang, mode) {
      const out = await api.write({
        kind: 'deleteTranslationExceptEdited',
        docHash,
        lang,
        ...modeField(mode),
      })
      if (!out.ok) throw new BookStoreCallError(out)
      return out.removed ?? 0
    },
    // the main process files a record under the request's language and mode as well as the
    // record's own, and refuses a record whose mode is not the request's
    writeJob: (docHash, job) =>
      write(api, { kind: 'job', docHash, job, lang: job.lang ?? '', ...modeField(job.mode) }),
  }
}
