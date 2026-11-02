/**
 * Ink colors for visual signatures. A signature keeps its own color, apart
 * from the drawing pen, so marking a page in red never turns the next
 * signature red. Pure; the caller owns storage.
 */

export type Rgb = [number, number, number]

export type SignColorName = 'black' | 'blue' | 'red'

/** the dialog's swatches, first is the default: black and blue are what forms ask for */
export const SIGN_COLORS: readonly { name: SignColorName; rgb: Rgb }[] = [
  { name: 'black', rgb: [0.1, 0.1, 0.12] },
  { name: 'blue', rgb: [0.1, 0.24, 0.62] },
  { name: 'red', rgb: [0.86, 0.22, 0.18] },
]

export const DEFAULT_SIGN_COLOR: Rgb = [...SIGN_COLORS[0]!.rgb]

export const SIGN_COLOR_KEY = 'genoffice-pdf-sign-color'

const isRgb = (v: unknown): v is Rgb =>
  Array.isArray(v) &&
  v.length === 3 &&
  v.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)

/** the remembered signature color; missing or malformed storage gives black */
export function parseSignColor(raw: string | null): Rgb {
  if (!raw) return [...DEFAULT_SIGN_COLOR]
  try {
    const v = JSON.parse(raw) as unknown
    return isRgb(v) ? [...v] : [...DEFAULT_SIGN_COLOR]
  } catch {
    return [...DEFAULT_SIGN_COLOR]
  }
}

/** the swatch matching `color`, or null for a custom pick */
export function signColorName(color: readonly number[]): SignColorName | null {
  const found = SIGN_COLORS.find(({ rgb }) => rgb.every((v, i) => Math.abs(v - color[i]!) < 0.01))
  return found?.name ?? null
}
