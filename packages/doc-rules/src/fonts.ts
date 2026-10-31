/**
 * Font names, compared after folding case and dropping spaces: "HY 신명조" and "hy신명조"
 * are the same font in a document and in this list.
 *
 * The guideline bans fonts that only the Korean word processor ships, because other
 * programs substitute them. Its full list lives on the vendor's notice board and is not
 * published, so HANGUL_ONLY_FONTS is our own approximation. Say so wherever it surfaces;
 * do not present it as the official list.
 */

/** Fonts to avoid: bundled with the Korean word processor only. */
export const HANGUL_ONLY_FONTS: readonly string[] = [
  // 휴먼 계열
  '휴먼명조',
  '휴먼고딕',
  '휴먼엑스포',
  '휴먼옛체',
  '휴먼매직체',
  '휴먼둥근헤드라인',
  '휴먼궁서',
  '휴먼편지체',
  // HY 계열
  'HY신명조',
  'HY견명조',
  'HY중고딕',
  'HY헤드라인',
  'HY그래픽',
  'HY강B',
  'HY강M',
  'HY목각파임B',
  'HY엽서L',
  'HY엽서M',
  'HY백송B',
  'HY하쿠민',
  'HY태고딕',
  // 양재 계열
  '양재와당체',
  '양재소슬',
  '양재블럭',
  '양재깨비',
  '양재매화',
  '양재참숯',
  // 그 밖에 문서에서 흔한 것
  '새굴림',
  '필기체',
  '한양중고딕',
  '한양견명조',
]

/** The fonts the guideline names as safe (it says "등", so these are examples, not a list). */
export const RECOMMENDED_FONTS: readonly string[] = ['함초롬바탕', '함초롬돋움', '맑은고딕']

/**
 * Fonts that every Windows PC has, so they render wherever the document goes. They are
 * not the guideline's examples, but the rule is about compatibility, and these are
 * compatible: flagging them only taught us that all 40 press releases "fail".
 */
export const COMPATIBLE_FONTS: readonly string[] = [
  '바탕',
  '돋움',
  '굴림',
  '굴림체',
  '돋움체',
  '바탕체',
]

/**
 * Prefixes of the fonts bundled with the Korean word processor: HY* and 한컴 *. A
 * document that names one of these names a font the reader's PC may not have.
 */
const HANGUL_ONLY_PREFIXES: readonly string[] = ['hy', '한컴']

/** Generic families: not a font choice, so they never count as outside the list. */
const GENERIC_FONTS: readonly string[] = [
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
]

function fold(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '')
}

const HANGUL_ONLY_SET = new Set(HANGUL_ONLY_FONTS.map(fold))
const RECOMMENDED_SET = new Set(RECOMMENDED_FONTS.map(fold))
const COMPATIBLE_SET = new Set(COMPATIBLE_FONTS.map(fold))
const GENERIC_SET = new Set(GENERIC_FONTS.map(fold))

export function isHangulOnlyFont(name: string): boolean {
  const key = fold(name)
  if (key === '') return false
  if (HANGUL_ONLY_SET.has(key)) return true
  return HANGUL_ONLY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/** True when the name is a real font outside the recommended list. */
export function isOutsideRecommendedFont(name: string): boolean {
  const key = fold(name)
  if (key === '') return false
  if (RECOMMENDED_SET.has(key) || COMPATIBLE_SET.has(key)) return false
  return !GENERIC_SET.has(key)
}
