/**
 * Batching and the model call of the book translation (spec §8): one batch
 * in, one result per unit out, in order.
 *
 * Each unit is sent in the block notation. A unit that comes back with
 * placeholders that do not match its own (checkNotation), empty, or not at
 * all is sent again, together with the other such units of the batch, up to
 * EPUB_TRANSLATION_MAX_RESENDS times; after that it stays in the source
 * language and is recorded as failed with the reason. Units that came back
 * right are not sent again.
 *
 * As in the PDF call: when no answer of the batch could be read at all, the
 * call throws JobUnitFailure (nothing is stored, resuming sends the batch
 * again), and run errors from `send` (rate limit, signed out, …) go to the
 * job engine untouched; it retries or stops.
 */
import {
  BLOCK_OVERHEAD_TOKENS,
  JobUnitFailure,
  TRANSLATION_BATCH_TOKENS,
  TRANSLATION_MAX_RESENDS,
  estimateTokens,
  parseTranslationOutput,
  type BatchOptions,
  type TranslationBlockResult,
  type TranslationJobItem,
  type TranslationModelCallOptions,
} from '@genoffice/pdf-structure'
import { notationPlainText, parseBlockNotation } from '../notation'
import { buildEpubTranslationRequest } from './prompt'
import type { EpubTranslationUnit } from './units'

/** times a batch's wrong units are sent again (spec §8: up to two, as for PDF) */
export const EPUB_TRANSLATION_MAX_RESENDS = TRANSLATION_MAX_RESENDS

/** why a unit stayed in the source language */
export type EpubTranslationFailureReason =
  'placeholder-mismatch' | 'empty-translation' | 'missing-translation'

/** what the model call needs of a unit */
export type EpubTranslationCallUnit = Pick<EpubTranslationUnit, 'text' | 'context'>

/** tokens one unit adds to a batch: its notation text plus the JSON around it */
export function epubUnitTokens(unit: Pick<EpubTranslationUnit, 'text'>): number {
  return estimateTokens(unit.text) + BLOCK_OVERHEAD_TOKENS
}

/**
 * Cut units into batches in order (the `batch` of the translation job). A
 * batch closes before the unit that would take it over the budget; a unit
 * over the budget on its own goes alone.
 */
export function batchEpubTranslationItems<B extends Pick<EpubTranslationUnit, 'text'>>(
  items: readonly TranslationJobItem<B>[],
  options: BatchOptions = {},
): TranslationJobItem<B>[][] {
  const max = options.maxTokens ?? TRANSLATION_BATCH_TOKENS
  if (!Number.isFinite(max) || max <= 0) {
    throw new RangeError(`epub translation batch: invalid token budget ${max}`)
  }
  const batches: TranslationJobItem<B>[][] = []
  let current: TranslationJobItem<B>[] = []
  let used = 0
  for (const item of items) {
    const tokens = epubUnitTokens(item.block)
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

type Checked = { ok: true; text: string } | { ok: false; reason: EpubTranslationFailureReason }

function checkTranslation(unit: EpubTranslationCallUnit, answer: string): Checked {
  const text = answer.trim()
  const parsed = parseBlockNotation(text, unit.context)
  if (!parsed.ok) return { ok: false, reason: 'placeholder-mismatch' }
  if (notationPlainText(parsed.tree).trim() === '')
    return { ok: false, reason: 'empty-translation' }
  return { ok: true, text }
}

/**
 * The `callModel` of the book translation job. `send` gets the PDF request
 * shape (system, prompt, lang, attempt) with the EPUB instruction.
 */
export function createEpubTranslationModelCall<B extends EpubTranslationCallUnit>(
  o: TranslationModelCallOptions,
): (batch: TranslationJobItem<B>[], signal: AbortSignal) => Promise<TranslationBlockResult[]> {
  const maxResends = o.maxResends ?? EPUB_TRANSLATION_MAX_RESENDS
  if (!Number.isInteger(maxResends) || maxResends < 0) {
    throw new RangeError(`epub translation: invalid resend count ${maxResends}`)
  }
  return async (batch, signal) => {
    const results: (TranslationBlockResult | undefined)[] = batch.map(() => undefined)
    const reasons: EpubTranslationFailureReason[] = batch.map(() => 'missing-translation')
    let pending = batch.map((_, i) => i)
    let anyParsed = false
    for (let attempt = 0; attempt <= maxResends && pending.length > 0; attempt++) {
      if (signal.aborted) throw signal.reason
      const request = buildEpubTranslationRequest(
        o.lang,
        pending.map((i) => ({ id: String(i + 1), text: batch[i]!.block.text })),
      )
      const answer = await o.send({ ...request, lang: o.lang, attempt }, signal)
      const parsed = parseTranslationOutput(answer)
      if (!parsed) continue
      anyParsed = true
      pending = pending.filter((i) => {
        const text = parsed.get(String(i + 1))
        if (text === undefined) {
          reasons[i] = 'missing-translation'
          return true
        }
        const checked = checkTranslation(batch[i]!.block, text)
        if (!checked.ok) {
          reasons[i] = checked.reason
          return true
        }
        results[i] = { status: 'translated', text: checked.text }
        return false
      })
    }
    if (!anyParsed) throw new JobUnitFailure('unparseable-response')
    return results.map((r, i) => r ?? { status: 'failed', reason: reasons[i]! })
  }
}
