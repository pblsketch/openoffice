/**
 * Translation units of a tree and the results built from a stored
 * translation (spec §8): the translated tree, the bilingual tree, and the
 * report. A build takes whatever is stored, so a stopped translation gives
 * a partial result: finished blocks translated, the rest in the source
 * language.
 *
 * The job and the builds must cut the tree into the same units in the same
 * order, because a block's store key counts same-text blocks per page
 * (store/keys.ts). Both go through `translationUnits`; a page range keeps or
 * drops whole pages, so it does not change the keys.
 */
import type { TranslationMode } from '../store/job-keys'
import type { StoredTranslation } from '../store/store'
import { blockKeyString, translationBlockKeys, type TranslationBlockKey } from '../store/keys'
import { deriveBilingualTree, deriveTranslatedTree, textUnits, type TextUnit } from '../tree/derive'
import type { DocumentTree, InlineRun } from '../tree/types'
import type { StartTranslationJobOptions } from '../jobs/translate'
import { batchTranslationItems } from './batch'
import { createTranslationModelCall, type TranslationSend } from './call'
import { translationSourceLanguage } from './language'

export interface TranslationUnitOptions {
  /** original page numbers to translate; default every page of the tree */
  pages?: Iterable<number>
}

/** text to translate: at least one letter outside formulas and markers */
const hasLetters = (runs: readonly InlineRun[]): boolean =>
  runs.some((r) => r.kind === 'text' && /\p{L}/u.test(r.text))

/**
 * The tree's translation units in reading order: headings, paragraphs, list
 * items, table cells, captions, footnotes (text inside images is never
 * translated). Units with no letters (numbers, empty cells, lone formulas)
 * are left out; they stay as they are.
 */
export function translationUnits(
  tree: DocumentTree,
  options: TranslationUnitOptions = {},
): TextUnit[] {
  const pages = options.pages ? new Set(options.pages) : null
  return textUnits(tree).filter((u) => (!pages || pages.has(u.page)) && hasLetters(u.runs))
}

export interface TranslationJobPartsOptions extends TranslationUnitOptions {
  /** target language code */
  lang: string
  send: TranslationSend
  /** token budget per batch; default TRANSLATION_BATCH_TOKENS */
  maxTokens?: number
  /** resends of wrong blocks; default TRANSLATION_MAX_RESENDS */
  maxResends?: number
  /** the document language for the sentence split; default guessed from the tree */
  sourceLang?: string
  /** 'easy': an easy explanation (the easy instruction, the easy results); default 'translate' */
  mode?: TranslationMode
}

/**
 * The tree-specific options of startTranslationJob / estimateTranslationJob.
 * The document language is guessed once here, from the whole tree, and the
 * batching and every call of the job split sentences by it. With `mode`
 * 'easy' the parts carry `mode: 'easy'` too, so spreading them into the job's
 * options makes the whole job an easy explanation's.
 */
export function translationJobParts(
  tree: DocumentTree,
  o: TranslationJobPartsOptions,
): Pick<StartTranslationJobOptions<TextUnit>, 'blocks' | 'batch' | 'callModel' | 'mode'> {
  const easy = o.mode === 'easy'
  const unitOptions: TranslationUnitOptions = o.pages ? { pages: o.pages } : {}
  const sourceLang = o.sourceLang ?? translationSourceLanguage(tree)
  const langOption = sourceLang !== undefined ? { sourceLang } : {}
  return {
    blocks: translationUnits(tree, unitOptions),
    batch: (items) =>
      batchTranslationItems(items, {
        ...(o.maxTokens !== undefined ? { maxTokens: o.maxTokens } : {}),
        ...langOption,
      }),
    callModel: createTranslationModelCall<TextUnit>({
      lang: o.lang,
      send: o.send,
      ...(o.maxResends !== undefined ? { maxResends: o.maxResends } : {}),
      ...langOption,
      ...(o.mode !== undefined ? { mode: o.mode } : {}),
    }),
    ...(easy ? { mode: 'easy' as const } : {}),
  }
}

/** a block that stayed in the source language */
export interface UntranslatedBlock {
  /** the unit key (block id, or `${tableId}#row.col.k` for a table cell) */
  unitKey: string
  /** the tree block it belongs to (the table for a cell) */
  blockId: string
  /** original page the block starts on */
  page: number
  /** why: 'placeholder-mismatch', 'missing-translation', … */
  reason: string
}

export interface TranslationReport {
  lang: string
  /** translation units in the tree */
  total: number
  /** units with a stored translation */
  translated: number
  /** units the translation tried and gave up on (kept in the source language) */
  untranslated: UntranslatedBlock[]
  /** units not tried yet (a stopped translation); they stay in the source language */
  pending: number
  /** every unit has a result (translated or untranslated) */
  complete: boolean
  /** provider and model the stored translation was made with */
  provider: string | null
  model: string | null
}

interface Collected {
  translations: Map<string, InlineRun[]>
  report: TranslationReport
}

function collect(tree: DocumentTree, lang: string, stored: StoredTranslation | null): Collected {
  const units = translationUnits(tree)
  const keys: TranslationBlockKey[] = translationBlockKeys(units)
  const translations = new Map<string, InlineRun[]>()
  const untranslated: UntranslatedBlock[] = []
  let pending = 0
  units.forEach((unit, i) => {
    const entry = stored?.blocks.get(blockKeyString(keys[i]!))
    if (!entry) pending++
    else if (entry.status === 'translated' && entry.text !== undefined) {
      // a person's edit is plain text and always wins over marks
      const plain: InlineRun[] = [{ kind: 'text', text: entry.text }]
      translations.set(unit.key, entry.edited ? plain : (entry.runs ?? plain))
    } else {
      untranslated.push({
        unitKey: unit.key,
        blockId: unit.blockId,
        page: unit.page,
        reason: entry.reason ?? 'unknown',
      })
    }
  })
  return {
    translations,
    report: {
      lang,
      total: units.length,
      translated: translations.size,
      untranslated,
      pending,
      complete: pending === 0,
      provider: stored?.provider ?? null,
      model: stored?.model ?? null,
    },
  }
}

/** counts and untranslated blocks of the stored translation of this tree */
export function translationReport(
  tree: DocumentTree,
  lang: string,
  stored: StoredTranslation | null,
): TranslationReport {
  return collect(tree, lang, stored).report
}

/** the tree with every stored translation in place of its source text */
export function buildTranslatedTree(
  tree: DocumentTree,
  lang: string,
  stored: StoredTranslation | null,
): DocumentTree {
  return deriveTranslatedTree(tree, lang, collect(tree, lang, stored).translations)
}

/** the tree with every stored translation after its source block */
export function buildBilingualTree(
  tree: DocumentTree,
  lang: string,
  stored: StoredTranslation | null,
): DocumentTree {
  return deriveBilingualTree(tree, lang, collect(tree, lang, stored).translations)
}
