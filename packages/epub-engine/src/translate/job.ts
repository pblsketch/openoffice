/**
 * The book translation job on pdf-structure's job engine (spec §8): the same
 * store, resume, restart, stops and per-document lock as the PDF
 * translation, with the EPUB units, batching and model call. The app (in the
 * editor screen) and the terminal command both start it after the user
 * confirmed; nothing here starts on its own.
 *
 * `mode` 'easy' makes every step an easy explanation's: the easy instruction,
 * the easy results in the store and the easy job record
 * (`translate.<lang>.easy`). Left out, everything is the plain translation's.
 */
import {
  estimateTranslationJob,
  planTranslationJob,
  startTranslationJob,
  type DocumentJobEstimate,
  type DocumentJobHandle,
  type DocumentJobStore,
  type JobModelChoice,
  type StartDocumentJobOptions,
  type StartTranslationJobOptions,
  type TranslationJobItem,
  type TranslationJobPlan,
  type TranslationMode,
  type TranslationSend,
} from '@genoffice/pdf-structure'
import { batchEpubTranslationItems, createEpubTranslationModelCall } from './call'
import type { EpubTranslationUnit } from './units'

export interface EpubTranslationJobPartsOptions {
  /** target language code */
  lang: string
  send: TranslationSend
  /** token budget per batch; default TRANSLATION_BATCH_TOKENS (the PDF value) */
  maxTokens?: number
  /** resends of mismatched units; default EPUB_TRANSLATION_MAX_RESENDS */
  maxResends?: number
  /** 'easy': an easy explanation; default 'translate' */
  mode?: TranslationMode
}

/** the book-specific options of pdf-structure's startTranslationJob / estimateTranslationJob */
export function epubTranslationJobParts(
  units: readonly EpubTranslationUnit[],
  o: EpubTranslationJobPartsOptions,
): Pick<
  StartTranslationJobOptions<EpubTranslationUnit>,
  'blocks' | 'batch' | 'callModel' | 'mode'
> {
  return {
    blocks: units,
    batch: epubBatcher(o.maxTokens),
    callModel: createEpubTranslationModelCall<EpubTranslationUnit>({
      lang: o.lang,
      send: o.send,
      ...(o.maxResends !== undefined ? { maxResends: o.maxResends } : {}),
      ...(o.mode !== undefined ? { mode: o.mode } : {}),
    }),
    ...(o.mode === 'easy' ? { mode: 'easy' as const } : {}),
  }
}

const epubBatcher =
  (maxTokens: number | undefined) => (items: readonly TranslationJobItem<EpubTranslationUnit>[]) =>
    batchEpubTranslationItems(items, maxTokens !== undefined ? { maxTokens } : {})

/** what planning and the pre-start estimate need */
export interface EpubTranslationPlanInput {
  /** epubDocumentHash of the stored book */
  docHash: string
  /** target language code */
  lang: string
  /** epubTranslationUnits(book, …).units */
  units: readonly EpubTranslationUnit[]
  model: JobModelChoice
  store: Pick<DocumentJobStore, 'readTranslation'>
  /** plan as for a restart (the stored translation is ignored) */
  restart?: boolean
  /** with `restart`: blocks a person edited count as done */
  keepEdited?: boolean
  /** token budget per batch; default TRANSLATION_BATCH_TOKENS */
  maxTokens?: number
  /** 'easy': plan the easy explanation (its stored results); default 'translate' */
  mode?: TranslationMode
}

function planInput(o: EpubTranslationPlanInput) {
  return {
    docHash: o.docHash,
    lang: o.lang,
    blocks: o.units,
    batch: epubBatcher(o.maxTokens),
    model: o.model,
    store: o.store,
    ...(o.restart !== undefined ? { restart: o.restart } : {}),
    ...(o.keepEdited !== undefined ? { keepEdited: o.keepEdited } : {}),
    ...(o.mode !== undefined ? { mode: o.mode } : {}),
  }
}

/** the batches still to send and the estimate; stored units are left out */
export function planEpubTranslationJob(
  o: EpubTranslationPlanInput,
): Promise<TranslationJobPlan<EpubTranslationUnit>> {
  return planTranslationJob(planInput(o))
}

/** the pre-start confirmation data: calls, units already done, provider change */
export function estimateEpubTranslationJob(
  o: EpubTranslationPlanInput,
): Promise<DocumentJobEstimate> {
  return estimateTranslationJob(planInput(o))
}

export interface StartEpubTranslationJobOptions
  extends
    Omit<EpubTranslationPlanInput, 'store'>,
    StartDocumentJobOptions<TranslationJobItem<EpubTranslationUnit>[]> {
  store: StartTranslationJobOptions<EpubTranslationUnit>['store']
  /** one model call (the app's `ai:stream`, the command's provider stream) */
  send: TranslationSend
  /** resends of mismatched units; default EPUB_TRANSLATION_MAX_RESENDS */
  maxResends?: number
}

/**
 * Start translating the book (job record `translate.<lang>`, or
 * `translate.<lang>.easy` with `mode` 'easy'); throws
 * DocumentJobBusyError when the book already has a job here (the lock
 * registry); jobs of other programs are the caller's to check.
 */
export function startEpubTranslationJob(
  o: StartEpubTranslationJobOptions,
): DocumentJobHandle<TranslationJobItem<EpubTranslationUnit>[]> {
  const { units, send, maxTokens, maxResends, ...rest } = o
  return startTranslationJob<EpubTranslationUnit>({
    ...rest,
    kind: 'translate',
    ...epubTranslationJobParts(units, {
      lang: o.lang,
      send,
      ...(maxTokens !== undefined ? { maxTokens } : {}),
      ...(maxResends !== undefined ? { maxResends } : {}),
      ...(o.mode !== undefined ? { mode: o.mode } : {}),
    }),
  })
}
