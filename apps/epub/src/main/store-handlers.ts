/**
 * The result-store channels of the EPUB editor (`epub:store-*`), Electron-free
 * (the main module binds them to ipcMain; the tests call them directly).
 *
 * The book translation job runs in the renderer and keeps its results in the
 * same store as the PDF translation (`<userData>/pdf-store`, the folder name
 * never changes). A view reaches only the documents the main process hashed
 * for that view: the bytes of the book it opened, and those it saved since
 * (the PDF editor's `know(owner, docHash)` rule). Only what a book translation
 * job reads and writes is offered: translations and `translate` job records.
 *
 * Every handler answers an outcome and never throws.
 */
import {
  StoreWriteError,
  jobKeyOf,
  type ResultStore,
  type TranslationBlockInput,
} from '@genoffice/pdf-structure/store'
import type {
  EpubFailure,
  EpubOutcome,
  EpubStoredTranslation,
  EpubStoreWriteResult,
} from '../shared/ipc'
import type { JobStatus } from '@genoffice/pdf-structure/store'

export type EpubStore = Pick<
  ResultStore,
  | 'listTranslations'
  | 'readTranslation'
  | 'unfinishedJobs'
  | 'writeTranslationMeta'
  | 'writeTranslationBlocks'
  | 'deleteTranslation'
  | 'deleteTranslationExceptEdited'
  | 'writeJob'
  | 'heartbeatJob'
>

export interface EpubStoreHandlerDeps {
  /** created on first use (userData is final by then) */
  store: () => EpubStore
  /** whether the main process hashed `docHash` for this view */
  knows: (owner: number, docHash: string) => boolean
}

/** store keys: document hashes and language codes (the store's segment rule) */
const KEY = /^[A-Za-z0-9_-]{1,128}$/
const MAX_META = 200
/** blocks written in one call */
const MAX_BLOCKS = 10_000

const fail = (error: EpubFailure['error'], message?: string): EpubFailure => ({
  ok: false,
  error,
  ...(message ? { message } : {}),
})

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isKey = (v: unknown): v is string => typeof v === 'string' && KEY.test(v)

const isMeta = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_META

function storeFailure(err: unknown): EpubFailure {
  if (err instanceof StoreWriteError) return fail('store-write-failed', err.message)
  if (err instanceof TypeError) return fail('invalid-request', err.message)
  return fail('failed', err instanceof Error ? err.message : String(err))
}

export function createEpubStoreHandlers(deps: EpubStoreHandlerDeps) {
  const granted = (owner: number, docHash: unknown): docHash is string =>
    isKey(docHash) && deps.knows(owner, docHash)

  return {
    async translations(owner: number, docHash: unknown): Promise<EpubOutcome<{ langs: string[] }>> {
      if (!granted(owner, docHash)) return fail('not-granted', 'unknown document hash')
      try {
        return { ok: true, langs: await deps.store().listTranslations(docHash) }
      } catch (err) {
        return storeFailure(err)
      }
    },

    async translation(
      owner: number,
      docHash: unknown,
      lang: unknown,
    ): Promise<EpubOutcome<{ translation: EpubStoredTranslation | null }>> {
      if (!granted(owner, docHash)) return fail('not-granted', 'unknown document hash')
      if (!isKey(lang)) return fail('invalid-request', 'bad language')
      try {
        const stored = await deps.store().readTranslation(docHash, lang)
        return {
          ok: true,
          translation: stored && {
            lang: stored.lang,
            provider: stored.provider,
            model: stored.model,
            blocks: [...stored.blocks.values()],
          },
        }
      } catch (err) {
        return storeFailure(err)
      }
    },

    async unfinishedJobs(
      owner: number,
      docHash: unknown,
    ): Promise<EpubOutcome<{ jobs: JobStatus[] }>> {
      if (!granted(owner, docHash)) return fail('not-granted', 'unknown document hash')
      try {
        return { ok: true, jobs: await deps.store().unfinishedJobs(docHash) }
      } catch (err) {
        return storeFailure(err)
      }
    },

    async write(owner: number, req: unknown): Promise<EpubOutcome<EpubStoreWriteResult>> {
      if (!isRecord(req)) return fail('invalid-request', 'request must be an object')
      if (!granted(owner, req.docHash)) return fail('not-granted', 'unknown document hash')
      const docHash = req.docHash
      if (!isKey(req.lang)) return fail('invalid-request', 'bad language')
      const lang = req.lang
      const store = deps.store()
      try {
        switch (req.kind) {
          case 'translationMeta':
            if (!isMeta(req.provider) || !isMeta(req.model)) break
            await store.writeTranslationMeta(docHash, lang, {
              provider: req.provider,
              model: req.model,
            })
            return { ok: true }
          case 'translationBlocks':
            if (!Array.isArray(req.blocks) || req.blocks.length > MAX_BLOCKS) break
            if (!req.blocks.every(isRecord)) break
            await store.writeTranslationBlocks(
              docHash,
              lang,
              req.blocks as unknown as TranslationBlockInput[],
            )
            return { ok: true }
          case 'deleteTranslation':
            await store.deleteTranslation(docHash, lang)
            return { ok: true }
          case 'deleteTranslationExceptEdited':
            return { ok: true, removed: await store.deleteTranslationExceptEdited(docHash, lang) }
          case 'job': {
            // a book translation writes `translate` records only, under its own language
            const job = req.job
            if (!isRecord(job) || job.kind !== 'translate' || job.lang !== lang) break
            await store.writeJob(docHash, job as unknown as Parameters<EpubStore['writeJob']>[1])
            return { ok: true }
          }
          case 'heartbeat': {
            if (req.job !== 'translate') break
            const key = jobKeyOf({ kind: 'translate', lang })
            return (await store.heartbeatJob(docHash, 'translate', key))
              ? { ok: true }
              : fail('failed', 'no running job record')
          }
        }
        return fail('invalid-request', 'bad store write')
      } catch (err) {
        return storeFailure(err)
      }
    },
  }
}

export type EpubStoreHandlers = ReturnType<typeof createEpubStoreHandlers>
