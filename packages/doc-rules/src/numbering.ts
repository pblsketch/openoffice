/**
 * The numbering ladder the guideline fixes:
 *   Ⅰ.  →  1.  →  가.  →  1)  →  가)  →  (1)  →  (가)  →  ①  →  ㉮
 *
 * Government documents type these numbers as plain text rather than using a numbering
 * field, so the only way to see the ladder is to read the start of each paragraph.
 */

export type NumberingKind =
  | 'roman'
  | 'arabic'
  | 'hangul'
  | 'arabic-paren'
  | 'hangul-paren'
  | 'arabic-round'
  | 'hangul-round'
  | 'circled-arabic'
  | 'circled-hangul'

export type NumberingToken = {
  kind: NumberingKind
  /** 0 is the top of the ladder (Ⅰ.) */
  rank: number
}

/**
 * A dot form needs a space or the end of the line after it, so "1.5%" and "3.14" are not
 * numbering. A date ("2026. 8. 24.", "8. 24.") looks exactly like "8." followed by "24.",
 * so it is excluded before the patterns run.
 */
const DATE_LIKE = /^\d{1,2}\.\s*\d{1,2}\./

const PATTERNS: readonly { kind: NumberingKind; rank: number; re: RegExp }[] = [
  { kind: 'roman', rank: 0, re: /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\.(?=\s|$)/ },
  { kind: 'arabic', rank: 1, re: /^\d{1,2}\.(?=\s|$)/ },
  { kind: 'hangul', rank: 2, re: /^[가-힣]\.(?=\s|$)/ },
  { kind: 'arabic-paren', rank: 3, re: /^\d{1,2}\)/ },
  { kind: 'hangul-paren', rank: 4, re: /^[가-힣]\)/ },
  { kind: 'arabic-round', rank: 5, re: /^\(\d{1,2}\)/ },
  { kind: 'hangul-round', rank: 6, re: /^\([가-힣]\)/ },
  { kind: 'circled-arabic', rank: 7, re: /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/ },
  { kind: 'circled-hangul', rank: 8, re: /^[㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹㉺㉻]/ },
]

/** The ladder rung a paragraph starts on, or null when it does not start with a number. */
export function numberingOf(text: string): NumberingToken | null {
  const line = text.trimStart()
  if (line === '' || DATE_LIKE.test(line)) return null
  for (const pattern of PATTERNS) {
    if (pattern.re.test(line)) return { kind: pattern.kind, rank: pattern.rank }
  }
  return null
}
