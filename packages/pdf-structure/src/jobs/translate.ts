/**
 * The document translation job (spec §8) on the job engine. Blocks already
 * in the stored translation (translated or failed) are skipped; the rest are
 * cut into batches by the caller's `batch` (about 2,500 tokens each), one
 * call per batch. Each batch's blocks are stored together once it returns.
 * The translation's provider and model are recorded before its first block.
 *
 * Blocks a person edited are stored blocks too, so they count as done and
 * are never sent. A restart can keep them (`keepEdited`). A page translation
 * from the bilingual view (`kind: 'translate-page'`) runs on the same engine
 * but keeps its own job record, leaves an existing provider record alone and
 * never restarts.
 *
 * `mode` 'easy' runs either kind as an easy explanation: every read and
 * write goes to the easy results (`easy/<lang>/`) and the job record is the
 * easy one (`<kind>.<lang>.easy.json`), so resuming continues the easy
 * explanation and never touches the plain translation. A plain job passes
 * no mode to the store, exactly as before.
 */
import type { TextUnit } from '../tree/derive'
import type { InlineRun } from '../tree/types'
import { isTranslationMode, type TranslationMode } from '../store/job-keys'
import type { StoredTranslation, TranslationBlockInput } from '../store/store'
import { blockKeyString, translationBlockKeys, type TranslationBlockKey } from '../store/keys'
import type { DocumentJobStore } from './engine'
import { JobUnitFailure } from './errors'
import {
  startDocumentJob,
  type DocumentJobEstimate,
  type DocumentJobHandle,
  type JobModelChoice,
  type ProviderChange,
  type StartDocumentJobOptions,
} from './job'

/** a block to translate: a tree text unit or anything with its runs and page */
export type TranslationSourceBlock = Pick<TextUnit, 'runs' | 'pageFingerprint' | 'page'>

export interface TranslationJobItem<B> {
  block: B
  /** the block's key in the store */
  key: TranslationBlockKey
}

/** the result for one block of a batch, in the batch's order */
export type TranslationBlockResult =
  | {
      status: 'translated'
      text: string
      runs?: InlineRun[]
      /**
       * sentence ends, both or neither (spec 4.2, 6.1): offsets into the plain
       * text of the source runs and into `text`; see store/sentence-ends.ts
       */
      sourceSentenceEnds?: number[]
      sentenceEnds?: number[]
    }
  /** the block stays in the source language (spec §8: placeholders kept failing) */
  | { status: 'failed'; reason: string }

export interface TranslationJobInput<B extends TranslationSourceBlock> {
  docHash: string
  /** target language code */
  lang: string
  /** every block of the confirmed page range, in reading order */
  blocks: readonly B[]
  /** cut the pending blocks into batches (each non-empty, all blocks once, in order) */
  batch: (items: readonly TranslationJobItem<B>[]) => TranslationJobItem<B>[][]
  model: JobModelChoice
  store: Pick<
    DocumentJobStore,
    | 'readTranslation'
    | 'writeTranslationMeta'
    | 'writeTranslationBlocks'
    | 'deleteTranslation'
    | 'deleteTranslationExceptEdited'
    | 'writeJob'
  >
  /**
   * 'translate' (default): the document translation, record
   * `translate.<lang>`. 'translate-page': a page translation, record
   * `translate-page.<lang>`; the provider record is written only when there
   * is none; it cannot restart.
   */
  kind?: 'translate' | 'translate-page'
  /**
   * 'easy': an easy explanation; the stored results, the provider record and
   * the job record are the easy ones. Default 'translate'.
   */
  mode?: TranslationMode
  /** start over: the stored translation is replaced (the user confirmed it) */
  restart?: boolean
  /**
   * with `restart`: blocks a person edited stay (and count as done); only the
   * others are removed and sent again. Needs a store with
   * `deleteTranslationExceptEdited`.
   */
  keepEdited?: boolean
}

export interface TranslationJobPlan<B> {
  estimate: DocumentJobEstimate
  batches: TranslationJobItem<B>[][]
}

type PlanInput<B extends TranslationSourceBlock> = Omit<TranslationJobInput<B>, 'store'> & {
  store: Pick<DocumentJobStore, 'readTranslation'>
}

export async function planTranslationJob<B extends TranslationSourceBlock>(
  input: PlanInput<B>,
): Promise<TranslationJobPlan<B>> {
  return (await planWithStored(input)).plan
}

/**
 * the trailing store argument of a mode: none for a plain translation (its
 * store calls stay exactly as they were), `'easy'` for an easy explanation
 */
function modeArgs(mode: TranslationMode | undefined): [] | ['easy'] {
  if (mode !== undefined && !isTranslationMode(mode)) {
    throw new TypeError(`translation job: invalid mode ${JSON.stringify(mode)}`)
  }
  return mode === 'easy' ? ['easy'] : []
}

/** the plan, and the stored translation it was made against (edited blocks only on a restart) */
async function planWithStored<B extends TranslationSourceBlock>(
  input: PlanInput<B>,
): Promise<{ plan: TranslationJobPlan<B>; stored: StoredTranslation | null }> {
  const mode = modeArgs(input.mode)
  const keys = translationBlockKeys(input.blocks)
  const read =
    input.restart && !input.keepEdited
      ? null
      : await input.store.readTranslation(input.docHash, input.lang, ...mode)
  // a restart that keeps the edits starts from them alone
  const stored =
    read && input.restart
      ? { ...read, blocks: new Map([...read.blocks].filter(([, b]) => b.edited === true)) }
      : read
  const pending: TranslationJobItem<B>[] = []
  input.blocks.forEach((block, i) => {
    const key = keys[i]!
    if (!stored?.blocks.has(blockKeyString(key))) pending.push({ block, key })
  })
  const batches = pending.length > 0 ? input.batch(pending) : []
  const batched = batches.reduce((n, b) => n + b.length, 0)
  if (batches.some((b) => b.length === 0) || batched !== pending.length) {
    throw new TypeError('translation job: the batches must hold every pending block once')
  }

  let providerChange: ProviderChange | null = null
  if (
    !input.restart &&
    stored &&
    stored.blocks.size > 0 &&
    (stored.provider !== input.model.provider || stored.model !== input.model.model)
  ) {
    providerChange = {
      stored: { provider: stored.provider, model: stored.model },
      next: { ...input.model },
    }
  }

  const done = input.blocks.length - pending.length
  return {
    stored,
    plan: {
      batches,
      estimate: {
        kind: input.kind ?? 'translate',
        lang: input.lang,
        ...(mode.length > 0 ? { mode: 'easy' as const } : {}),
        calls: batches.length,
        pending: pending.length,
        done,
        total: input.blocks.length,
        model: { ...input.model },
        providerChange,
      },
    },
  }
}

/** the pre-start confirmation data: calls, blocks already translated, provider change */
export async function estimateTranslationJob<B extends TranslationSourceBlock>(
  input: PlanInput<B>,
): Promise<DocumentJobEstimate> {
  return (await planTranslationJob(input)).estimate
}

export interface StartTranslationJobOptions<B extends TranslationSourceBlock>
  extends TranslationJobInput<B>, StartDocumentJobOptions<TranslationJobItem<B>[]> {
  /** translate one batch; one result per block, in order */
  callModel: (
    batch: TranslationJobItem<B>[],
    signal: AbortSignal,
  ) => Promise<TranslationBlockResult[]>
}

const isResult = (r: unknown): r is TranslationBlockResult => {
  if (typeof r !== 'object' || r === null) return false
  const v = r as Record<string, unknown>
  if (v.status === 'translated') return typeof v.text === 'string'
  return v.status === 'failed' && typeof v.reason === 'string'
}

function toInput(key: TranslationBlockKey, r: TranslationBlockResult): TranslationBlockInput {
  if (r.status === 'failed') return { key, status: 'failed', reason: r.reason }
  const input: TranslationBlockInput = { key, status: 'translated', text: r.text }
  if (r.runs !== undefined) input.runs = r.runs
  if (r.sourceSentenceEnds !== undefined && r.sentenceEnds !== undefined) {
    input.sourceSentenceEnds = r.sourceSentenceEnds
    input.sentenceEnds = r.sentenceEnds
  }
  return input
}

/** start translating; throws DocumentJobBusyError when the document has a job */
export function startTranslationJob<B extends TranslationSourceBlock>(
  o: StartTranslationJobOptions<B>,
): DocumentJobHandle<TranslationJobItem<B>[]> {
  type Batch = TranslationJobItem<B>[]
  const jobKind = o.kind ?? 'translate'
  if (jobKind === 'translate-page' && o.restart) {
    throw new TypeError('translation job: a page translation does not restart')
  }
  const mode = modeArgs(o.mode)
  return startDocumentJob<Batch, TranslationBlockResult[]>(
    { ...o, kind: jobKind },
    async (signal) => {
      if (o.restart && !signal.aborted) {
        if (!o.keepEdited) await o.store.deleteTranslation(o.docHash, o.lang, ...mode)
        else if (o.store.deleteTranslationExceptEdited) {
          await o.store.deleteTranslationExceptEdited(o.docHash, o.lang, ...mode)
        } else {
          // deleting everything instead would lose the person's edits
          throw new TypeError('translation job: this store cannot keep edited blocks on a restart')
        }
      }
      const {
        plan: { batches, estimate },
        stored,
      } = await planWithStored({ ...o, restart: false })
      // a page translation leaves the provider record of the document translation alone
      const writeMeta = jobKind === 'translate' || !stored || stored.provider === null
      let meta: Promise<void> | null = null
      return {
        store: o.store,
        units: batches,
        unitSize: (batch) => batch.length,
        doneBefore: estimate.done,
        total: estimate.total,
        callModel: async (batch, callSignal) => {
          const results = await o.callModel(batch, callSignal)
          if (!Array.isArray(results) || results.length !== batch.length) {
            throw new JobUnitFailure('result-mismatch')
          }
          if (!results.every(isResult)) throw new JobUnitFailure('result-mismatch')
          return results
        },
        persist: async (batch, results) => {
          meta ??= writeMeta
            ? o.store.writeTranslationMeta(
                o.docHash,
                o.lang,
                { provider: o.model.provider, model: o.model.model },
                ...mode,
              )
            : Promise.resolve()
          await meta
          await o.store.writeTranslationBlocks(
            o.docHash,
            o.lang,
            batch.map((item, i) => toInput(item.key, results[i]!)),
            ...mode,
          )
        },
      }
    },
  )
}
