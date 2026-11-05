/**
 * "Translate again" on one paragraph of the side-by-side translation view
 * (reading-assist spec 4.5): exactly one model call for that block, outside
 * the document job engine (the engine skips blocks already stored).
 *
 * The request and its check are the translation module's own: the block is
 * encoded with placeholders (sentence by sentence when it has two or more,
 * split by the document language), sent with the translation instruction,
 * and the answer is decoded with the same placeholder rule. With no resend
 * allowed the call is made once. Sentence ends that come back with a good
 * answer are stored with it. The block is keyed by the whole-page key the view
 * computed (same text on one page is told apart by its occurrence), so the
 * result overwrites the stored block in place.
 *
 * - A good answer replaces the stored block (a person's edit included, after
 *   the person confirmed that).
 * - A wrong answer leaves a translated block as it was; a block that had
 *   failed is stored as failed again, with the new reason.
 * - The translation's provider record is written only when there is none,
 *   like a page translation: translations from different AIs may mix.
 *
 * With `mode` 'easy' the call asks for an easy explanation and every read
 * and write goes to the easy results; a plain call passes no mode, as before.
 *
 * The answer is document data: it is stored as text and nothing in it runs.
 */
import { guessLanguageFromText } from '../../../../../packages/pdf-structure/src/epub/language'
import { JobUnitFailure } from '../../../../../packages/pdf-structure/src/jobs/errors'
import type { TranslationMode } from '../../../../../packages/pdf-structure/src/store/job-keys'
import type { TranslationBlockKey } from '../../../../../packages/pdf-structure/src/store/keys'
import type { TranslationBlockInput } from '../../../../../packages/pdf-structure/src/store/store'
import {
  createTranslationModelCall,
  type TranslationSend,
} from '../../../../../packages/pdf-structure/src/translate/call'
import { runsText } from '../../../../../packages/pdf-structure/src/tree/inline'
import type { InlineRun } from '../../../../../packages/pdf-structure/src/tree/types'
import type { PdfStoreApi } from '../../shared/ipc'

/** the block to translate again, as the view knows it */
export interface RetranslateUnit {
  key: TranslationBlockKey
  /** page the block starts on */
  page: number
  /** the source runs */
  source: InlineRun[]
  state: 'translated' | 'failed' | 'pending'
}

export interface RetranslateOptions {
  docHash: string
  lang: string
  /** 'easy': the easy explanation's block; default the plain translation */
  mode?: TranslationMode
  unit: RetranslateUnit
  /** the one model call (no tools) */
  send: TranslationSend
  store: Pick<PdfStoreApi, 'translation' | 'write'>
  /** what the translation's provider record names, when there is none yet */
  model: { provider: string; model: string }
  signal: AbortSignal
  /**
   * the document language for the sentence split, guessed from the whole tree
   * (translationSourceLanguage); without it, guessed from this block's text
   */
  sourceLang?: string
}

export type RetranslateOutcome =
  | { ok: true; text: string }
  /** the answer could not be used; `stored`: the block was recorded as failed again */
  | { ok: false; reason: string; stored: boolean }

/** a store write the shell refused */
export class RetranslateStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RetranslateStoreError'
  }
}

async function write(
  store: RetranslateOptions['store'],
  request: Parameters<PdfStoreApi['write']>[0],
): Promise<void> {
  const out = await store.write(request)
  if (!out.ok) throw new RetranslateStoreError(out.message ?? out.error)
}

/** translate one stored block again; run errors (rate limit, sign-out, …) are thrown as they come */
export async function retranslateBlock(o: RetranslateOptions): Promise<RetranslateOutcome> {
  const sourceLang = o.sourceLang ?? guessLanguageFromText(runsText(o.unit.source))
  const easy = o.mode === 'easy'
  // a plain request stays exactly as it was: no mode field
  const mode = easy ? { mode: 'easy' as const } : {}
  const call = createTranslationModelCall({
    lang: o.lang,
    send: o.send,
    maxResends: 0,
    ...(sourceLang !== undefined ? { sourceLang } : {}),
    ...mode,
  })
  const item = {
    block: { runs: o.unit.source, pageFingerprint: o.unit.key.pageFingerprint, page: o.unit.page },
    key: o.unit.key,
  }
  let result
  try {
    ;[result] = await call([item], o.signal)
  } catch (err) {
    if (err instanceof JobUnitFailure) return { ok: false, reason: err.reason, stored: false }
    throw err
  }
  if (!result) return { ok: false, reason: 'missing-translation', stored: false }
  if (result.status === 'failed') {
    // a translation that was there stays; a failed block keeps failing, with the new reason
    if (o.unit.state !== 'failed') return { ok: false, reason: result.reason, stored: false }
    await write(o.store, {
      kind: 'translationBlocks',
      docHash: o.docHash,
      lang: o.lang,
      blocks: [{ key: o.unit.key, status: 'failed', reason: result.reason }],
      ...mode,
    })
    return { ok: false, reason: result.reason, stored: true }
  }
  const stored = await (
    easy ? o.store.translation(o.docHash, o.lang, 'easy') : o.store.translation(o.docHash, o.lang)
  ).catch(() => null)
  const hasMeta = !!(stored?.ok && stored.translation && stored.translation.provider !== null)
  if (!hasMeta) {
    await write(o.store, {
      kind: 'translationMeta',
      docHash: o.docHash,
      lang: o.lang,
      provider: o.model.provider,
      model: o.model.model,
      ...mode,
    })
  }
  const block: TranslationBlockInput = { key: o.unit.key, status: 'translated', text: result.text }
  if (result.runs !== undefined) block.runs = result.runs
  if (result.sourceSentenceEnds !== undefined && result.sentenceEnds !== undefined) {
    block.sourceSentenceEnds = result.sourceSentenceEnds
    block.sentenceEnds = result.sentenceEnds
  }
  await write(o.store, {
    kind: 'translationBlocks',
    docHash: o.docHash,
    lang: o.lang,
    blocks: [block],
    ...mode,
  })
  return { ok: true, text: result.text }
}
