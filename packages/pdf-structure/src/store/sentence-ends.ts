/**
 * Sentence boundaries kept beside a translated block (spec §6.1). Pure code:
 * the store checks entries with it and the bilingual view may import it
 * directly to check the source side against the current tree.
 *
 * An offset is a UTF-16 index into a plain text made by `runsText`: the
 * block's source runs for `sourceSentenceEnds`, the stored translated runs
 * (the entry's `text`) for `sentenceEnds`. The two lists come together or not
 * at all; when any rule fails the block reads as one paragraph pair.
 */

/** the two optional fields of a translation block entry */
export interface SentenceEnds {
  /** where each source sentence ends: offsets into the plain text of the source runs */
  sourceSentenceEnds: number[]
  /** where each translated sentence ends: offsets into the plain text of the translated runs */
  sentenceEnds: number[]
}

/**
 * True when `ends` has the shape of a sentence-end list: at least two
 * integers, each greater than zero and greater than the one before. With
 * `length`, the last value must also equal it (the length of the text the
 * offsets point into).
 */
export function validSentenceEnds(ends: unknown, length?: number): ends is number[] {
  if (!Array.isArray(ends) || ends.length < 2) return false
  let previous = 0
  for (const end of ends) {
    if (!Number.isSafeInteger(end) || (end as number) <= previous) return false
    previous = end as number
  }
  return length === undefined || previous === length
}

/**
 * The pair as a translated block may keep it, or null when it may not: the
 * two lists must both be valid and of the same length, and the translated
 * list must end at `translatedLength`. The source length is not known here;
 * the view checks it against the current tree (`validSentenceEnds`).
 */
export function sentenceEndsPair(
  sourceSentenceEnds: unknown,
  sentenceEnds: unknown,
  translatedLength: number,
): SentenceEnds | null {
  if (
    !validSentenceEnds(sourceSentenceEnds) ||
    !validSentenceEnds(sentenceEnds, translatedLength)
  ) {
    return null
  }
  if (sourceSentenceEnds.length !== sentenceEnds.length) return null
  return { sourceSentenceEnds: [...sourceSentenceEnds], sentenceEnds: [...sentenceEnds] }
}
