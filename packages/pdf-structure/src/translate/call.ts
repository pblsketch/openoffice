/**
 * The model call of the translation job (spec §8): one batch in, one result
 * per block out, in order.
 *
 * Each block is sent with placeholders: a block of one sentence as its text,
 * a block of two or more sentences as its sentence list (spec 4.2, split by
 * the document language, `sourceLang`). A sentence answer is kept with its
 * sentence ends only when it has as many sentences as the source, each with
 * its own source sentence's placeholders, none empty. Any other answer for a
 * sentence block is joined and checked like a paragraph: when the joined text
 * passes it is kept without sentence ends, and it is not sent again for that.
 *
 * A block whose (joined) text comes back with the wrong placeholders, empty,
 * or not at all is sent again, together with the other such blocks of the
 * batch, up to TRANSLATION_MAX_RESENDS times; after that it keeps its source
 * text and is recorded as failed with the reason. Blocks that came back right
 * are not sent again.
 *
 * When no answer of the batch could be read at all, the call throws
 * JobUnitFailure: nothing is stored, the batch stays pending, and resuming
 * the translation sends it again. Run errors (rate limit, timeout, …) from
 * `send` go to the job engine untouched; it retries or stops (spec §9).
 *
 * `mode` 'easy' makes the call an easy explanation's: the easy instruction,
 * and `mode: 'easy'` on each request. Everything else (sentence lists, the
 * checks, the fall back to a paragraph, the resends) is the same. No block is
 * skipped for being in the target language already: every block is sent.
 */
import { JobUnitFailure } from '../jobs/errors'
import type {
  TranslationBlockResult,
  TranslationJobItem,
  TranslationSourceBlock,
} from '../jobs/translate'
import type { TranslationMode } from '../store/job-keys'
import { sentenceEndsPair } from '../store/sentence-ends'
import { runsText } from '../tree/inline'
import { translationSentenceSeparator } from './language'
import { decodeTranslation, type EncodedBlock, type PlaceholderFailure } from './placeholders'
import {
  buildTranslationRequest,
  parseSentenceTranslationOutput,
  type TranslationRequest,
  type TranslationRequestBlock,
} from './prompt'
import { splitSentences, type SentenceSplit } from './sentences'

/** times a batch's wrong blocks are sent again (spec §8: up to two) */
export const TRANSLATION_MAX_RESENDS = 2

/** why a block stayed in the source language */
export type TranslationFailureReason = PlaceholderFailure | 'missing-translation'

export interface TranslationModelRequest extends TranslationRequest {
  /** target language code */
  lang: string
  /** the document language the blocks were split into sentences by, when known */
  sourceLang?: string
  /** 0 for the first send, then 1, 2 for the resends */
  attempt: number
  /** 'easy' for an easy explanation's call; absent for a plain translation */
  mode?: Extract<TranslationMode, 'easy'>
}

/** one model call: the answer text, or a thrown run error */
export type TranslationSend = (
  request: TranslationModelRequest,
  signal: AbortSignal,
) => Promise<string>

export interface TranslationModelCallOptions {
  /** target language code */
  lang: string
  send: TranslationSend
  /** default TRANSLATION_MAX_RESENDS */
  maxResends?: number
  /**
   * the document language, guessed once per job (translationSourceLanguage);
   * units are split into sentences by its rules. Missing or unknown: the
   * default locale's rules.
   */
  sourceLang?: string
  /** 'easy': write an easy explanation (the easy instruction); default 'translate' */
  mode?: TranslationMode
}

type Translated = Extract<TranslationBlockResult, { status: 'translated' }>
type Checked = { ok: true; result: Translated } | { ok: false; reason: PlaceholderFailure }

/** the paragraph check (placeholder kinds and counts) on a whole block */
function checkParagraph(block: EncodedBlock, text: string): Checked {
  const decoded = decodeTranslation(block, text)
  if (!decoded.ok) return decoded
  return {
    ok: true,
    result: { status: 'translated', text: runsText(decoded.runs), runs: decoded.runs },
  }
}

/**
 * The translated sentences kept with their sentence ends, or null when any
 * rule fails: as many as the source's, each with its own source sentence's
 * placeholders and not empty, and the joined text decoding to exactly the
 * sentences' plain texts joined.
 */
function pairSentences(
  split: Extract<SentenceSplit, { kind: 'sentences' }>,
  parts: readonly string[],
  separator: string,
): Translated | null {
  if (parts.length !== split.sentences.length) return null
  const plains: string[] = []
  for (let k = 0; k < parts.length; k++) {
    const decoded = decodeTranslation(split.sentences[k]!, parts[k]!)
    if (!decoded.ok) return null
    plains.push(runsText(decoded.runs))
  }
  // the runs come from the joined text, decoded once with the whole block
  const whole = decodeTranslation(split.block, parts.join(separator))
  if (!whole.ok) return null
  const text = runsText(whole.runs)
  // an escape or a tag that the joining formed across a seam would change the text
  if (plains.join(separator) !== text) return null
  const ends: number[] = []
  let start = 0
  plains.forEach((plain, k) => {
    const last = k === plains.length - 1
    ends.push(last ? text.length : start + plain.trimEnd().length)
    start += plain.length + separator.length
  })
  const pair = sentenceEndsPair(split.sourceSentenceEnds, ends, text.length)
  if (!pair) return null
  return { status: 'translated', text, runs: whole.runs, ...pair }
}

/** check one block's answer: a text or a sentence list, whatever shape it was sent in */
function checkAnswer(split: SentenceSplit, value: string | string[], separator: string): Checked {
  if (typeof value === 'string') return checkParagraph(split.block, value)
  // each translated sentence loses its outer whitespace before joining
  const parts = value.map((s) => s.trim())
  if (split.kind === 'sentences') {
    const paired = pairSentences(split, parts, separator)
    if (paired) return { ok: true, result: paired }
  }
  return checkParagraph(split.block, parts.join(separator))
}

/** what a block is sent as */
const requestBlock = (split: SentenceSplit, id: string): TranslationRequestBlock =>
  split.kind === 'sentences'
    ? { id, sentences: split.sentences.map((s) => s.text) }
    : { id, text: split.block.text }

/** the `callModel` of startTranslationJob */
export function createTranslationModelCall<B extends TranslationSourceBlock>(
  o: TranslationModelCallOptions,
): (batch: TranslationJobItem<B>[], signal: AbortSignal) => Promise<TranslationBlockResult[]> {
  const maxResends = o.maxResends ?? TRANSLATION_MAX_RESENDS
  if (!Number.isInteger(maxResends) || maxResends < 0) {
    throw new RangeError(`translation: invalid resend count ${maxResends}`)
  }
  const easy = o.mode === 'easy'
  if (o.mode !== undefined && o.mode !== 'translate' && !easy) {
    throw new TypeError(`translation: invalid mode ${JSON.stringify(o.mode)}`)
  }
  const separator = translationSentenceSeparator(o.lang)
  return async (batch, signal) => {
    const splits = batch.map((item) => splitSentences(item.block.runs, o.sourceLang))
    const results: (TranslationBlockResult | undefined)[] = batch.map(() => undefined)
    const reasons: TranslationFailureReason[] = batch.map(() => 'missing-translation')
    let pending = batch.map((_, i) => i)
    let anyParsed = false
    for (let attempt = 0; attempt <= maxResends && pending.length > 0; attempt++) {
      if (signal.aborted) throw signal.reason
      const blocks = pending.map((i) => requestBlock(splits[i]!, String(i + 1)))
      const request = buildTranslationRequest(o.lang, blocks, easy ? 'easy' : 'translate')
      const answer = await o.send(
        {
          ...request,
          lang: o.lang,
          ...(o.sourceLang !== undefined ? { sourceLang: o.sourceLang } : {}),
          attempt,
          ...(easy ? { mode: 'easy' as const } : {}),
        },
        signal,
      )
      const parsed = parseSentenceTranslationOutput(answer)
      if (!parsed) continue
      anyParsed = true
      pending = pending.filter((i) => {
        const value = parsed.get(String(i + 1))
        if (value === undefined) {
          reasons[i] = 'missing-translation'
          return true
        }
        const checked = checkAnswer(splits[i]!, value, separator)
        if (!checked.ok) {
          reasons[i] = checked.reason
          return true
        }
        results[i] = checked.result
        return false
      })
    }
    if (!anyParsed) throw new JobUnitFailure('unparseable-response')
    return results.map((r, i) => r ?? { status: 'failed', reason: reasons[i]! })
  }
}
