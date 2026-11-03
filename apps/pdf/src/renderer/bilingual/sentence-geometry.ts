/**
 * Sentence linking in the side-by-side view (translation-reading spec 4.4):
 * where each source sentence of a sentence-linked unit sits on a drawn page.
 * Pure functions; the view runs them once per page when the page's text
 * content arrives and only hit-tests the result while the pointer moves.
 *
 * The tree keeps no character positions, so the source sentence is found
 * again among the page's PDF.js text items:
 *
 *   - each item is cut into characters, its advance split evenly by a rough
 *     glyph width (wide scripts a full em, others about half), and every
 *     character box is turned into tree space (the saved page's display
 *     space, origin at the crop box's lower-left, y up);
 *   - only characters whose middle lies in the block's box (or the cell
 *     paragraph's box) count, in content order;
 *   - both sides are compared without whitespace and hyphens (the tree text
 *     was joined across lines and de-hyphenated) after NFKC folding;
 *   - each sentence is looked up in order after the previous match; on a
 *     block that runs across pages, the piece before the first match on a
 *     later box ends the sentence before it, and the piece after the last
 *     match on an earlier box starts the sentence after it.
 *
 * A sentence found nowhere on the drawn pages falls back to the block
 * outline (the caller decides). Nothing here sends or writes anything.
 */
import { runsText } from '../../../../../packages/pdf-structure/src/tree/inline'
import type { BlockRegion, Rect } from '../../../../../packages/pdf-structure/src/tree/types'
import { geomDispSize, pdfToView, type PageGeom } from '../annotations'
import type { BilingualModel, BilingualUnit } from './model'

// ── tunable constants ──

/** how far (tree units, PDF points) a character's middle may sit outside a box and still count */
export const SENTENCE_REGION_TOLERANCE = 1
/** the hit test's slack around a sentence box (PDF points) */
export const SENTENCE_HIT_TOLERANCE = 1
/** a glyph's extent below / above the baseline, as a share of the font height */
const DESCENT = 0.22
const ASCENT = 0.85

// ── input ──

/** the fields of a PDF.js getTextContent() text item this module reads */
export interface PageTextItem {
  str: string
  /** text space → PDF user space: [a, b, c, d, e, f] */
  transform: number[]
  /** advance along the baseline, user space */
  width: number
  /** font height, user space */
  height: number
}

/** the text items of a PDF.js text content (marked-content entries dropped) */
export function textItemsOf(items: readonly unknown[]): PageTextItem[] {
  const out: PageTextItem[] = []
  for (const it of items) {
    const r = it as Partial<PageTextItem> | null
    if (!r || typeof r.str !== 'string' || !Array.isArray(r.transform)) continue
    out.push({
      str: r.str,
      transform: r.transform,
      width: typeof r.width === 'number' ? r.width : 0,
      height: typeof r.height === 'number' ? r.height : 0,
    })
  }
  return out
}

/**
 * A point in PDF user space as a tree point. `geom` is the page as saved:
 * its size, crop origin, user unit and the saved /Rotate (no unsaved turn).
 */
export function userToTree(geom: PageGeom, x: number, y: number): [number, number] {
  const unit = geom.userUnit ?? 1
  const [vx, vy] = pdfToView(geom, x, y)
  const { height } = geomDispSize(geom)
  return [vx / unit, (height - vy) / unit]
}

// ── normalizing ──

/** whitespace, hyphens and zero-width marks: never compared */
const IGNORED = /[\s\-\u00AD\u2010\u2011\u200B-\u200D\u2060\uFEFF]/u

/** the code points of `ch` as compared (NFKC, ignored ones dropped) */
function folded(ch: string): string[] {
  return [...ch.normalize('NFKC')].filter((c) => !IGNORED.test(c))
}

/** a text as compared: NFKC folded, no whitespace, no hyphens */
export function normalizeForMatch(text: string): string {
  return [...text].flatMap(folded).join('')
}

// ── page characters ──

/** one compared character of the page, with its box in tree space */
export interface PageChar {
  ch: string
  box: Rect
  /** index of the text item it came from */
  item: number
  /** the middle of the box */
  cx: number
  cy: number
}

const WIDE = /[\u1100-\u11FF\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/u

/** a glyph's relative advance: wide scripts a full em, others about half */
const weight = (ch: string): number => (WIDE.test(ch) ? 1 : 0.55)

/**
 * The page's compared characters in content order, each with its box in
 * tree space. Items without an advance or a transform add nothing.
 */
export function pageChars(items: readonly PageTextItem[], geom: PageGeom): PageChar[] {
  const out: PageChar[] = []
  items.forEach((it, index) => {
    const chars = [...(it.str ?? '')]
    const tf = it.transform
    if (chars.length === 0 || !(it.width > 0) || !tf || tf.length < 6) return
    const [a, b, c, d, e, f] = tf as [number, number, number, number, number, number]
    const ul = Math.hypot(a, b) || 1
    const vl = Math.hypot(c, d) || 1
    const ux = a / ul
    const uy = b / ul
    const vx = c / vl
    const vy = d / vl
    const h = it.height > 0 ? it.height : vl
    const weights = chars.map(weight)
    const scale = it.width / weights.reduce((sum, w) => sum + w, 0)
    let start = 0
    chars.forEach((ch, i) => {
      const from = start * scale
      start += weights[i]!
      const keep = folded(ch)
      if (keep.length === 0) return
      const to = start * scale
      const xs: number[] = []
      const ys: number[] = []
      for (const along of [from, to]) {
        for (const up of [-DESCENT * h, ASCENT * h]) {
          const [tx, ty] = userToTree(geom, e + ux * along + vx * up, f + uy * along + vy * up)
          xs.push(tx)
          ys.push(ty)
        }
      }
      const box: Rect = {
        x0: Math.min(...xs),
        y0: Math.min(...ys),
        x1: Math.max(...xs),
        y1: Math.max(...ys),
      }
      const cx = (box.x0 + box.x1) / 2
      const cy = (box.y0 + box.y1) / 2
      for (const k of keep) out.push({ ch: k, box, item: index, cx, cy })
    })
  })
  return out
}

// ── targets ──

/** a sentence-linked unit to find on the pages */
export interface SentenceTarget {
  unitKey: string
  /** the column item it belongs to (the table for a cell paragraph) */
  itemId: string
  /** the boxes to look in, in reading order (a cell paragraph has one) */
  regions: BlockRegion[]
  /** each source sentence as compared (normalizeForMatch) */
  sentences: string[]
}

/** the source sentences of a unit with boundaries, as compared */
function sourceSentences(unit: BilingualUnit): string[] | null {
  const ends = unit.sentenceEnds?.source
  if (!ends) return null
  const text = runsText(unit.source)
  let prev = 0
  return ends.map((end) => {
    const s = normalizeForMatch(text.slice(prev, end))
    prev = end
    return s
  })
}

/** every unit of the model that links by sentence and has a box to look in */
export function sentenceTargets(model: BilingualModel): SentenceTarget[] {
  const out: SentenceTarget[] = []
  for (const item of model.itemsById.values()) {
    if (item.kind === 'text') {
      if (item.regions.length === 0) continue
      const sentences = sourceSentences(item.unit)
      if (sentences) {
        out.push({ unitKey: item.unit.unitKey, itemId: item.id, regions: item.regions, sentences })
      }
      continue
    }
    for (const cell of item.cells) {
      for (const p of cell.paragraphs) {
        if (!p.unit || !p.region) continue
        const sentences = sourceSentences(p.unit)
        if (sentences) {
          out.push({ unitKey: p.unit.unitKey, itemId: item.id, regions: [p.region], sentences })
        }
      }
    }
  }
  return out
}

/** the targets with a box on each page */
export function targetsByPage(targets: readonly SentenceTarget[]): Map<number, SentenceTarget[]> {
  const out = new Map<number, SentenceTarget[]>()
  for (const t of targets) {
    for (const page of new Set(t.regions.map((r) => r.page))) {
      const list = out.get(page) ?? []
      list.push(t)
      out.set(page, list)
    }
  }
  return out
}

// ── matching ──

/** a run of compared characters [from, to) of a box's text that belongs to a sentence */
export interface SentencePiece {
  sentence: number
  from: number
  to: number
}

/**
 * Where the sentences sit in `text`, the compared text inside one box.
 * `first` / `last`: the box is the unit's first / last one (a unit across
 * pages has more), so a sentence may begin before it or end after it.
 */
export function matchSentences(
  text: string,
  sentences: readonly string[],
  first: boolean,
  last: boolean,
): SentencePiece[] {
  const out: SentencePiece[] = []
  let cursor = 0
  let found = -1
  sentences.forEach((s, i) => {
    if (s.length === 0) return
    const at = text.indexOf(s, cursor)
    if (at < 0) return
    // the start of a later box: what comes before the first match ends the sentence before it
    if (out.length === 0 && !first && i > 0 && at > 0) {
      const head = text.slice(0, at)
      if (sentences[i - 1]!.endsWith(head)) out.push({ sentence: i - 1, from: 0, to: at })
    }
    out.push({ sentence: i, from: at, to: at + s.length })
    cursor = at + s.length
    found = i
  })
  if (found < 0) {
    // no whole sentence in the box: a middle or an end piece of one sentence
    if (text.length === 0) return out
    if (!first) {
      const i = sentences.findIndex((s) => s.length > text.length && s.endsWith(text))
      if (i >= 0) return [{ sentence: i, from: 0, to: text.length }]
    }
    if (first && !last && sentences[0]?.startsWith(text)) {
      return [{ sentence: 0, from: 0, to: text.length }]
    }
    return out
  }
  // the end of an earlier box: what follows the last match starts the next sentence
  if (!last && cursor < text.length && found + 1 < sentences.length) {
    const tail = text.slice(cursor)
    if (sentences[found + 1]!.startsWith(tail)) {
      out.push({ sentence: found + 1, from: cursor, to: text.length })
    }
  }
  return out
}

// ── page result ──

/** one lit line of a source sentence, in tree space */
export interface SentenceBox {
  unitKey: string
  itemId: string
  sentence: number
  box: Rect
}

/** where the sentences of one page sit */
export interface PageSentences {
  page: number
  boxes: SentenceBox[]
  /** boxes by sentenceKey(unitKey, sentence) */
  byKey: Map<string, Rect[]>
}

export const sentenceKey = (unitKey: string, sentence: number): string =>
  `${unitKey}\u0000${sentence}`

const insideBox = (c: PageChar, b: Rect, tol: number): boolean =>
  c.cx >= b.x0 - tol && c.cx <= b.x1 + tol && c.cy >= b.y0 - tol && c.cy <= b.y1 + tol

/** consecutive character boxes on one line merged into one box per line */
function lineBoxes(chars: readonly PageChar[]): Rect[] {
  const out: Rect[] = []
  let cur: Rect | null = null
  let item = -1
  for (const c of chars) {
    const b = c.box
    if (cur) {
      const h = Math.min(cur.y1 - cur.y0, b.y1 - b.y0)
      const overlap = Math.min(cur.y1, b.y1) - Math.max(cur.y0, b.y0)
      const sameLine =
        c.item === item ||
        (overlap >= h * 0.5 && b.x0 >= cur.x0 - h && b.x0 - cur.x1 <= Math.max(h, 1) * 2)
      if (sameLine) {
        cur = {
          x0: Math.min(cur.x0, b.x0),
          y0: Math.min(cur.y0, b.y0),
          x1: Math.max(cur.x1, b.x1),
          y1: Math.max(cur.y1, b.y1),
        }
        item = c.item
        continue
      }
      out.push(cur)
    }
    cur = { ...b }
    item = c.item
  }
  if (cur) out.push(cur)
  return out
}

/**
 * The lit lines of every target sentence on `page`, from the page's
 * compared characters. Sentences not found here get nothing.
 */
export function locatePageSentences(
  page: number,
  chars: readonly PageChar[],
  targets: readonly SentenceTarget[],
): PageSentences {
  const boxes: SentenceBox[] = []
  const byKey = new Map<string, Rect[]>()
  for (const t of targets) {
    t.regions.forEach((r, ri) => {
      if (r.page !== page) return
      const inside = chars.filter((c) => insideBox(c, r.box, SENTENCE_REGION_TOLERANCE))
      if (inside.length === 0) return
      // the compared text and, per UTF-16 unit, the character it belongs to
      let text = ''
      const owner: number[] = []
      inside.forEach((c, k) => {
        text += c.ch
        for (let u = 0; u < c.ch.length; u++) owner.push(k)
      })
      const pieces = matchSentences(text, t.sentences, ri === 0, ri === t.regions.length - 1)
      for (const p of pieces) {
        const picked: PageChar[] = []
        let prev = -1
        for (let u = p.from; u < p.to; u++) {
          const k = owner[u]!
          if (k !== prev) picked.push(inside[k]!)
          prev = k
        }
        const key = sentenceKey(t.unitKey, p.sentence)
        const list = byKey.get(key) ?? []
        for (const box of lineBoxes(picked)) {
          boxes.push({ unitKey: t.unitKey, itemId: t.itemId, sentence: p.sentence, box })
          list.push(box)
        }
        byKey.set(key, list)
      }
    })
  }
  return { page, boxes, byKey }
}

/** the lit lines of one sentence on a page (none when it is not there) */
export function sentenceBoxesOn(
  page: PageSentences | null | undefined,
  unitKey: string,
  sentence: number,
): Rect[] {
  return page?.byKey.get(sentenceKey(unitKey, sentence)) ?? []
}

/** the sentence was found on at least one of the pages (else: the block fallback) */
export function sentenceLocated(
  pages: Iterable<PageSentences>,
  unitKey: string,
  sentence: number,
): boolean {
  const key = sentenceKey(unitKey, sentence)
  for (const p of pages) if ((p.byKey.get(key)?.length ?? 0) > 0) return true
  return false
}

/** the sentence whose lit line holds the point (the smallest one when lines overlap), or null */
export function hitTestSentenceBoxes(
  boxes: readonly SentenceBox[] | undefined,
  x: number,
  y: number,
  tolerance = SENTENCE_HIT_TOLERANCE,
): SentenceBox | null {
  let best: { hit: SentenceBox; area: number } | null = null
  for (const hit of boxes ?? []) {
    const b = hit.box
    if (
      x < b.x0 - tolerance ||
      x > b.x1 + tolerance ||
      y < b.y0 - tolerance ||
      y > b.y1 + tolerance
    )
      continue
    const area = (b.x1 - b.x0) * (b.y1 - b.y0)
    if (!best || area < best.area) best = { hit, area }
  }
  return best?.hit ?? null
}
