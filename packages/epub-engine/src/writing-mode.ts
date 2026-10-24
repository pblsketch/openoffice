/**
 * Vertical writing detection (spec §8 "Vertical books"): a book is vertical
 * when its package says so in the `primary-writing-mode` meta, or when any of
 * its stylesheets sets `writing-mode` (or the `-epub-` / `-webkit-` forms) to a
 * `vertical-*` value.
 */

/** True for `vertical-rl`, `vertical-lr` and any other `vertical-*` value. */
export function isVerticalWritingMode(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^vertical-/i.test(value.trim())
}

/** Removes comments and quoted strings, which can mention the property without setting it. */
function stripCommentsAndStrings(css: string): string {
  return css.replace(
    /\/\*[\s\S]*?(?:\*\/|$)|"(?:[^"\\\n]|\\[\s\S])*"|'(?:[^'\\\n]|\\[\s\S])*'/g,
    ' ',
  )
}

const VERTICAL_DECLARATION = /(?:^|[\s;{])(?:-epub-|-webkit-)?writing-mode\s*:\s*vertical-/i

/** True when the stylesheet sets a vertical writing mode anywhere. */
export function cssDeclaresVerticalWriting(css: string): boolean {
  return VERTICAL_DECLARATION.test(stripCommentsAndStrings(css))
}
