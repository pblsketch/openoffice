/**
 * Line breaking of a translation into its block's boxes.
 *
 * Text flows through the boxes in order (a paragraph joined across a page
 * boundary has one box per page). `layoutText` lays it out at one size and
 * says whether it ran past the last box; the placement (place.ts) tries the
 * sizes `scaleSteps` lists, from the source size down to the floor.
 */
import type { Rect } from '../tree/types'

/** something that measures a string in em units (1 = the font size) */
export interface Measurer {
  measure(text: string): number
  /** ascender / descender as a share of the em */
  ascent: number
  descent: number
}

export interface LaidLine {
  /** index into the boxes */
  box: number
  text: string
  /** baseline start, display space */
  x: number
  y: number
}

export interface Layout {
  size: number
  lines: LaidLine[]
  overflowed: boolean
  /** box index the overflow runs past (the last box) */
  overflowBox: number
}

export interface LayoutOptions {
  /** baseline-to-baseline distance as a multiple of the size */
  lineHeight: number
  align: 'left' | 'center'
}

/** size reduction per fitting step, as a share of the source size */
export const SHRINK_STEP = 0.04
/** a line may run this share of the size past the box's right edge */
const WIDTH_SLACK_EM = 0.15
/** the last line's descender may hang this share of the size below the box */
const HEIGHT_SLACK_EM = 0.25

const CJK_BREAK =
  /[\u2E80-\u2FFF\u3000-\u303F\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]|[\u{20000}-\u{2FA1F}]/u
/** chars that must not start a line (they cling to the previous token) */
const NO_LINE_START =
  /^[\u3001\u3002\uFF0C\uFF0E,.!?\uFF01\uFF1F:;\uFF1A\uFF1B)\]}\uFF09\u300D\u300F\u3015\uFF3D\uFF5D\u3009\u300B\u30FB\u30FC\u3005\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308E\u30A1\u30A3\u30A5\u30A7\u30A9\u30C3\u30E3\u30E5\u30E7\u30EE\u30F5\u30F6%\uFF05'"\u2019\u201D]/u
/** chars that must not end a line (they cling to the next token) */
const NO_LINE_END = /[([{\uFF08\u300C\u300E\u3014\uFF3B\uFF5B\u3008\u300A\u2018\u201C]$/u

/**
 * Break opportunities: whitespace, and between CJK ideographs / kana (which
 * break anywhere). Hangul and alphabetic words break at spaces. Returns
 * tokens; a token beginning with whitespace marks a space before it.
 */
export function tokenize(paragraph: string): string[] {
  const out: string[] = []
  let word = ''
  let space = false
  const push = () => {
    if (word) out.push((space ? ' ' : '') + word)
    word = ''
    space = false
  }
  for (const ch of paragraph) {
    if (/\s/u.test(ch)) {
      push()
      space = out.length > 0
      continue
    }
    if (CJK_BREAK.test(ch)) {
      if (word && !NO_LINE_END.test(word)) push()
      word += ch
      continue
    }
    if (word && CJK_BREAK.test([...word].pop()!) && !NO_LINE_START.test(ch)) push()
    word += ch
  }
  push()
  // closing punctuation never starts a token of its own
  const merged: string[] = []
  for (const t of out) {
    if (merged.length > 0 && !t.startsWith(' ') && NO_LINE_START.test(t)) {
      merged[merged.length - 1] += t
    } else merged.push(t)
  }
  return merged
}

/** paragraphs as tokens, consumed line by line */
class TokenStream {
  private readonly paras: string[][]
  private p = 0
  private t = 0

  constructor(text: string) {
    this.paras = text.split('\n').map(tokenize)
  }

  get done(): boolean {
    return this.p >= this.paras.length
  }

  /** the next line no wider than `width` points (at least one char) */
  next(width: number, size: number, font: Measurer): string {
    const em = (s: string) => font.measure(s) * size
    const tokens = this.paras[this.p]!
    let line = ''
    while (this.t < tokens.length) {
      const tok = line ? tokens[this.t]! : tokens[this.t]!.trimStart()
      if (em(line + tok) <= width) {
        line += tok
        this.t++
        continue
      }
      if (!line) {
        // a token wider than the line breaks by chars
        const chars = [...tok]
        let n = 1
        while (n < chars.length && em(chars.slice(0, n + 1).join('')) <= width) n++
        line = chars.slice(0, n).join('')
        tokens[this.t] = chars.slice(n).join('')
      }
      break
    }
    if (this.t >= tokens.length) {
      this.p++
      this.t = 0
    }
    return line
  }
}

/** the text laid out at `size`; `overflowed` when it runs past the last box */
export function layoutText(
  text: string,
  boxes: readonly Rect[],
  size: number,
  font: Measurer,
  o: LayoutOptions,
): Layout {
  if (boxes.length === 0) throw new Error('no box to lay out into')
  const leading = size * o.lineHeight
  const lines: LaidLine[] = []
  const stream = new TokenStream(text)
  const fits = (box: Rect, baseline: number) =>
    baseline - font.descent * size >= box.y0 - HEIGHT_SLACK_EM * size
  let b = 0
  let y = boxes[0]!.y1 - font.ascent * size
  let usedInBox = 0
  let overflowed = false
  while (!stream.done) {
    const box = boxes[b]!
    if (!fits(box, y) && b < boxes.length - 1 && usedInBox > 0) {
      b++
      y = boxes[b]!.y1 - font.ascent * size
      usedInBox = 0
      continue
    }
    if (!fits(box, y)) overflowed = true
    const line = stream.next(box.x1 - box.x0 + WIDTH_SLACK_EM * size, size, font)
    const lineWidth = font.measure(line) * size
    const x = o.align === 'center' ? box.x0 + (box.x1 - box.x0 - lineWidth) / 2 : box.x0
    lines.push({ box: b, text: line, x: Math.max(box.x0, x), y })
    usedInBox++
    y -= leading
  }
  return { size, lines, overflowed, overflowBox: boxes.length - 1 }
}

/** scales of the source size to try, largest first, ending at the floor */
export function scaleSteps(floor: number): number[] {
  const out: number[] = []
  for (let k = 0; ; k++) {
    const s = 1 - k * SHRINK_STEP
    if (s <= floor + 1e-6) {
      out.push(floor)
      return out
    }
    out.push(s)
  }
}
