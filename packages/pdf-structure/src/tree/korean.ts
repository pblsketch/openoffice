/**
 * Korean line-end repair. PDF lines wrap between syllables, and a line that
 * starts with a particle continues the word on the line above: "별도" + "의"
 * is one word ("별도의"), never two. The IR's gap rules cannot see this — a
 * justified line ends at the same edge whether the break fell on a space or
 * inside a word — so the script-aware join in inline.ts asks this module.
 *
 * Only particles are used: they are suffixes and can never start a word, so
 * joining on them cannot merge two real words. One-syllable nouns that can
 * stand alone (이, 가, 도, 만, 나) are deliberately absent.
 */

/** particles that attach to the word before them */
const JOINING_PARTICLES = new Set([
  '은',
  '는',
  '을',
  '를',
  '의',
  '에',
  '에서',
  '에게',
  '에게서',
  '께',
  '께서',
  '으로',
  '로',
  '으로서',
  '으로써',
  '과',
  '와',
  '부터',
  '까지',
  '처럼',
  '이나',
  '라도',
  '마저',
  '조차',
  '밖에',
  '뿐',
  '이랑',
  '랑',
])

const HANGUL = /[\uac00-\ud7a3]/

/** first whitespace-delimited token of a line (quoted or punctuated tokens never match) */
function firstWord(text: string): string {
  return text.trim().split(/\s+/, 1)[0] ?? ''
}

/**
 * True when a line break between `prevText` and `nextText` is inside one word
 * because the next line opens with a particle. `prevText` must end in a
 * Hangul syllable and `nextText` must open with one; both callers and this
 * function check, so a Latin or CJK neighbor never reaches here.
 */
export function continuesWithParticle(prevText: string, nextText: string): boolean {
  const prev = prevText.trimEnd()
  if (!HANGUL.test(prev.slice(-1))) return false
  const next = firstWord(nextText)
  return JOINING_PARTICLES.has(next)
}
