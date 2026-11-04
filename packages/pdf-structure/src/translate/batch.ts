/**
 * Batches of blocks for one model call each (spec §8: about 2,500 tokens).
 *
 * The token count is an estimate, not a tokenizer: tokenizers differ by
 * provider and model, and the batch size only has to be roughly right.
 *   - Han, kana and Hangul: one token per character (CJK text tokenizes at
 *     about one character per token, often worse)
 *   - other non-ASCII characters (accented Latin, Cyrillic, Thai, …): one
 *     token per two characters
 *   - ASCII: one token per four characters (the usual rate for English)
 * Blocks are measured as they are sent (placeholder text) plus a fixed
 * overhead for the JSON wrapping each block in the request, plus a small
 * overhead per sentence for a block sent as a sentence list (spec 4.2).
 */
import type { TranslationJobItem, TranslationSourceBlock } from '../jobs/translate'
import type { InlineRun } from '../tree/types'
import { splitSentences } from './sentences'

/** source tokens per batch (spec §8: about 2,500, tunable) */
export const TRANSLATION_BATCH_TOKENS = 2_500
/** tokens of JSON around one block in the request (id, keys, quotes) */
export const BLOCK_OVERHEAD_TOKENS = 8
/** tokens of JSON around each sentence of a block sent as a sentence list (quotes, comma; tunable) */
export const SENTENCE_OVERHEAD_TOKENS = 2

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/** rough token count of a text (see the rates above), rounded up */
export function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  let ascii = 0
  for (const ch of text) {
    if (ch.charCodeAt(0) < 0x80) ascii++
    else if (CJK.test(ch)) cjk++
    else other++
  }
  return Math.ceil(cjk + other / 2 + ascii / 4)
}

/**
 * Tokens one block adds to a batch. `sourceLang` is the document language
 * the sentences are split by (as for the model call); a block of one
 * sentence costs what it always did.
 */
export function blockTokens(runs: readonly InlineRun[], sourceLang?: string): number {
  const split = splitSentences(runs, sourceLang)
  const sentences = split.kind === 'sentences' ? split.sentences.length : 0
  return (
    estimateTokens(split.block.text) + BLOCK_OVERHEAD_TOKENS + sentences * SENTENCE_OVERHEAD_TOKENS
  )
}

export interface BatchOptions {
  /** token budget of one batch; default TRANSLATION_BATCH_TOKENS */
  maxTokens?: number
  /** document language for the sentence split (translationSourceLanguage) */
  sourceLang?: string
}

/**
 * Cut blocks into batches in reading order. A batch closes before the block
 * that would take it over the budget; a block over the budget on its own
 * goes alone. This is the `batch` function the translation job expects.
 */
export function batchTranslationItems<B extends TranslationSourceBlock>(
  items: readonly TranslationJobItem<B>[],
  options: BatchOptions = {},
): TranslationJobItem<B>[][] {
  const max = options.maxTokens ?? TRANSLATION_BATCH_TOKENS
  if (!Number.isFinite(max) || max <= 0) {
    throw new RangeError(`translation batch: invalid token budget ${max}`)
  }
  const batches: TranslationJobItem<B>[][] = []
  let current: TranslationJobItem<B>[] = []
  let used = 0
  for (const item of items) {
    const tokens = blockTokens(item.block.runs, options.sourceLang)
    if (current.length > 0 && used + tokens > max) {
      batches.push(current)
      current = []
      used = 0
    }
    current.push(item)
    used += tokens
  }
  if (current.length > 0) batches.push(current)
  return batches
}
