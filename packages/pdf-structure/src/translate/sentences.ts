/**
 * Sentence splitting of a translation unit (spec 4.1, 4.2).
 *
 * The unit's runs are encoded as for a paragraph (`encodeRuns`), and the
 * encoded text is cut into sentences. Boundaries come from the standard
 * segmenter (`Intl.Segmenter`, granularity 'sentence') run over the plain
 * text in the document language, with these adjustments:
 *
 *   - no cut after an English abbreviation (SENTENCE_ABBREVIATIONS);
 *   - no cut inside a placeholder; a bold / italic / link pair that spans a
 *     boundary merges the sentences it spans, other sentences still split;
 *   - a footnote marker, a closing tag, whitespace or a line break right
 *     after a boundary stays with the sentence before it; an opening tag
 *     goes with the sentence after it;
 *   - a formula is one opaque character to the segmenter, so a period in
 *     its LaTeX never splits; a line break reads as a space, so it does not
 *     split on its own.
 *
 * Offsets. The plain source text is exactly `runsText(runs)` (UTF-16 code
 * units): text characters as they are, a formula as its LaTeX, a line break
 * as '\n', footnote markers and pair tags as nothing. The mapping between the
 * encoded and the plain text is read off the encoded text token by token
 * (a tag, an escape `&amp;` `&lt;` `&gt;`, or one code point), so it is exact.
 * `sourceSentenceEnds[i]` is the offset just after the last non-whitespace
 * character of sentence i, except the last one, which is always the plain
 * text length. Sentence i covers `ends[i-1]` (0 for the first) to `ends[i]`
 * with leading and trailing whitespace ignored.
 *
 * Each sentence is an EncodedBlock: its `text` is its slice of the encoded
 * text with outer whitespace trimmed, and its `links`, `notes` and `maths`
 * are the whole unit's, so placeholders keep the unit's numbering and
 * `decodeTranslation(sentence, translated)` checks one sentence on its own.
 */
import { runsText } from '../tree/inline'
import type { InlineRun } from '../tree/types'
import { encodeRuns, type EncodedBlock } from './placeholders'

/**
 * Abbreviations whose period does not end a sentence. Matched case-sensitively
 * at the end of the text before a boundary, also with the first letter in
 * upper case ("E.g."), and only after a non-letter, non-digit character.
 * Tunable: add or remove entries here.
 */
export const SENTENCE_ABBREVIATIONS: readonly string[] = [
  'e.g.',
  'i.e.',
  'et al.',
  'cf.',
  'vs.',
  'etc.',
  'viz.',
  'approx.',
  'resp.',
  'Fig.',
  'Figs.',
  'Eq.',
  'Eqs.',
  'Sec.',
  'Secs.',
  'Ch.',
  'Tab.',
  'Ref.',
  'Refs.',
  'Vol.',
  'No.',
  'Nos.',
  'pp.',
  'Dr.',
  'Prof.',
  'Mr.',
  'Mrs.',
  'Ms.',
  'Jr.',
  'Sr.',
  'St.',
]

/** one sentence ready to send; numbering of placeholders is the unit's */
export interface EncodedSentence extends EncodedBlock {
  /** the placeholder tags of this sentence, in order (see placeholderTags) */
  placeholders: string[]
}

/** how a unit is sent: as one paragraph, or sentence by sentence */
export type SentenceSplit =
  | {
      kind: 'paragraph'
      /** the whole unit, encoded as today */
      block: EncodedBlock
      /** the plain source text, `runsText(runs)` */
      source: string
    }
  | {
      kind: 'sentences'
      block: EncodedBlock
      source: string
      /** two or more, in order */
      sentences: EncodedSentence[]
      /** per sentence, its end offset in `source`; strictly increasing, last = source.length */
      sourceSentenceEnds: number[]
    }

/** a placeholder tag as encodeRuns writes it, or an escape */
const TOKEN = /<(\/?)(b|i|a[1-9]\d*)>|<(n[1-9]\d*|m[1-9]\d*|br)\/>|&(amp|lt|gt);|[\s\S]/gu

/** the placeholder tags of an encoded text, in order */
export function placeholderTags(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(TOKEN)) {
    if (m[2] !== undefined || m[3] !== undefined) out.push(m[0])
  }
  return out
}

type TokenKind = 'char' | 'open' | 'close' | 'note' | 'math' | 'br'

interface Token {
  kind: TokenKind
  /** start in the encoded text; the token ends where the next one starts */
  enc: number
  /** start in the plain text */
  plain: number
  /** start in the text given to the segmenter */
  seg: number
  /** carries a non-whitespace character of the plain text (a character or a formula) */
  content: boolean
}

/** a formula reads as one neutral character (OBJECT REPLACEMENT CHARACTER) */
const FORMULA_STAND_IN = '￼'
const ESCAPED: Record<string, string> = { amp: '&', lt: '<', gt: '>' }

interface Tokenized {
  tokens: Token[]
  plain: string
  seg: string
}

/** walk the encoded text and record where each token sits in all three texts */
function tokenize(block: EncodedBlock): Tokenized | null {
  const tokens: Token[] = []
  let plain = ''
  let seg = ''
  for (const m of block.text.matchAll(TOKEN)) {
    const at = { enc: m.index, plain: plain.length, seg: seg.length }
    if (m[2] !== undefined) {
      tokens.push({ ...at, kind: m[1] === '/' ? 'close' : 'open', content: false })
    } else if (m[3] !== undefined) {
      const name = m[3]
      if (name === 'br') {
        tokens.push({ ...at, kind: 'br', content: false })
        plain += '\n'
        seg += ' '
      } else if (name[0] === 'n') {
        tokens.push({ ...at, kind: 'note', content: false })
      } else {
        const formula = block.maths[Number(name.slice(1)) - 1]
        if (!formula) return null
        // a formula with empty LaTeX adds nothing to the plain text, so it is no content
        tokens.push({ ...at, kind: 'math', content: /\S/u.test(formula.latex) })
        plain += formula.latex
        seg += FORMULA_STAND_IN
      }
    } else {
      const ch = m[4] !== undefined ? ESCAPED[m[4]]! : m[0]
      tokens.push({ ...at, kind: 'char', content: /\S/u.test(ch) })
      plain += ch
      seg += ch
    }
  }
  return { tokens, plain, seg }
}

const segmenters = new Map<string, Intl.Segmenter>()

/** the sentence segmenter for a language; the default locale when the code is unusable */
function segmenterFor(lang: string | undefined): Intl.Segmenter {
  const key = lang ?? ''
  let s = segmenters.get(key)
  if (!s) {
    try {
      s = new Intl.Segmenter(lang || undefined, { granularity: 'sentence' })
    } catch {
      s = new Intl.Segmenter(undefined, { granularity: 'sentence' })
    }
    segmenters.set(key, s)
  }
  return s
}

const WORD_CHAR = /[\p{L}\p{N}]/u

/** the text before a boundary ends with a listed abbreviation */
function endsWithAbbreviation(before: string): boolean {
  const text = before.trimEnd()
  for (const a of SENTENCE_ABBREVIATIONS) {
    for (const form of [a, a[0]!.toUpperCase() + a.slice(1)]) {
      if (!text.endsWith(form)) continue
      const prev = text[text.length - form.length - 1]
      if (prev === undefined || !WORD_CHAR.test(prev)) return true
    }
  }
  return false
}

/** first token index whose segmenter start is at or after `seg` */
function firstTokenAt(tokens: readonly Token[], seg: number): number {
  let lo = 0
  let hi = tokens.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (tokens[mid]!.seg < seg) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Token indexes where sentences start (after the first): segmenter
 * boundaries, minus abbreviations, moved to the right gap position, and
 * dropped where a pair is open.
 */
function cutPoints(t: Tokenized, lang: string | undefined): number[] {
  const { tokens, seg } = t
  const cuts: number[] = []
  for (const s of segmenterFor(lang).segment(seg)) {
    if (s.index === 0) continue
    if (endsWithAbbreviation(seg.slice(0, s.index))) continue
    // the next sentence's first content token
    let next = firstTokenAt(tokens, s.index)
    while (next < tokens.length && !tokens[next]!.content) next++
    if (next >= tokens.length) continue
    // the gap after the previous sentence's last content token
    let gap = next
    while (gap > 0 && !tokens[gap - 1]!.content) gap--
    if (gap === 0) continue
    let cut = next
    for (let k = gap; k < next; k++) {
      if (tokens[k]!.kind === 'open') {
        cut = k
        break
      }
    }
    if (cuts.length > 0 && cut <= cuts[cuts.length - 1]!) continue
    cuts.push(cut)
  }
  if (cuts.length === 0) return cuts
  // a cut with a pair open would split the pair: drop it, merging its sentences
  const open = new Set<number>()
  let depth = 0
  let c = 0
  for (let k = 0; k < tokens.length && c < cuts.length; k++) {
    if (k === cuts[c]) {
      if (depth > 0) open.add(k)
      c++
    }
    const kind = tokens[k]!.kind
    if (kind === 'open') depth++
    else if (kind === 'close') depth--
  }
  return cuts.filter((k) => !open.has(k))
}

/** end of the plain range [from, to) with trailing whitespace left out */
function trimmedEnd(plain: string, from: number, to: number): number {
  let end = to
  while (end > from && /\s/u.test(plain[end - 1]!)) end--
  return end
}

/**
 * Split a translation unit into sentences for sending. `lang` is the
 * document language guess (one per job); an unknown or missing code uses
 * the default locale. A unit with one sentence comes back as a paragraph.
 */
export function splitSentences(
  runs: readonly InlineRun[],
  lang: string | undefined,
): SentenceSplit {
  const block = encodeRuns(runs)
  const source = runsText(runs)
  const paragraph: SentenceSplit = { kind: 'paragraph', block, source }
  const t = tokenize(block)
  // the mapping must reproduce runsText exactly; anything else is sent whole
  if (!t || t.plain !== source) return paragraph
  const cuts = cutPoints(t, lang)
  if (cuts.length === 0) return paragraph

  const sentences: EncodedSentence[] = []
  const sourceSentenceEnds: number[] = []
  const bounds = [0, ...cuts, t.tokens.length]
  for (let i = 0; i + 1 < bounds.length; i++) {
    const from = bounds[i]!
    const to = bounds[i + 1]!
    const encFrom = t.tokens[from]!.enc
    const encTo = to < t.tokens.length ? t.tokens[to]!.enc : block.text.length
    const plainFrom = t.tokens[from]!.plain
    const plainTo = to < t.tokens.length ? t.tokens[to]!.plain : source.length
    const text = block.text.slice(encFrom, encTo).trim()
    sentences.push({ ...block, text, placeholders: placeholderTags(text) })
    const last = i + 2 === bounds.length
    sourceSentenceEnds.push(last ? source.length : trimmedEnd(source, plainFrom, plainTo))
  }
  return { kind: 'sentences', block, source, sentences, sourceSentenceEnds }
}
