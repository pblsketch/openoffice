/**
 * The result store as the book translation job sees it, over this editor's
 * store channels (`window.epubApi.store`, `epub:store-*`). The job runs in the
 * page; every read and write goes to the main process, which keeps the store
 * (`<userData>/pdf-store`) and answers only document hashes of this view's
 * book.
 *
 * A failed call throws: the engine stops a job whose result cannot be stored
 * ('store-write-failed') instead of counting the unit as done.
 */
import type { StartEpubTranslationJobOptions } from '@genoffice/epub-engine'
import type { StoredTranslation, TranslationBlockEntry } from '@genoffice/pdf-structure/store'
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

async function write(api: BookStoreApi, request: EpubStoreWriteRequest): Promise<void> {
  const out = await api.write(request)
  if (!out.ok) throw new BookStoreCallError(out)
}

/** the store the translation job and its estimate use */
export function createBookJobStore(api: BookStoreApi): BookJobStore {
  return {
    async readTranslation(docHash, lang): Promise<StoredTranslation | null> {
      const out = await api.translation(docHash, lang)
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
    writeTranslationMeta: (docHash, lang, meta) =>
      write(api, {
        kind: 'translationMeta',
        docHash,
        lang,
        provider: meta.provider,
        model: meta.model,
      }),
    writeTranslationBlocks: (docHash, lang, blocks) =>
      write(api, { kind: 'translationBlocks', docHash, lang, blocks: [...blocks] }),
    deleteTranslation: (docHash, lang) => write(api, { kind: 'deleteTranslation', docHash, lang }),
    async deleteTranslationExceptEdited(docHash, lang) {
      const out = await api.write({ kind: 'deleteTranslationExceptEdited', docHash, lang })
      if (!out.ok) throw new BookStoreCallError(out)
      return out.removed ?? 0
    },
    // the main process files a record under the request's language as well as the record's own
    writeJob: (docHash, job) => write(api, { kind: 'job', docHash, job, lang: job.lang ?? '' }),
  }
}
