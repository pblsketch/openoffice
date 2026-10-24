/**
 * Read-only page analysis for the writeback: which source text objects
 * belong to which tree block, and where scanned text lines sit.
 *
 * Every text object is owned by at most one tree block — the smallest block
 * box holding the object's center — and translated or not, every text block
 * claims its objects, so writing one block never takes another's text away.
 * Objects are recorded by their index in the page's object list, which is
 * stable when the same bytes are opened again for writing.
 */
import { withAlloc } from '../../../pdf2docx/src/extract/pdfium'
import type { OcrEngine } from '../../../pdf2docx/src/ocr'
import type { Rect } from '../tree/types'
import {
  FPDF_PAGEOBJ_TEXT,
  INVISIBLE_RENDER_MODES,
  objectBounds,
  objectFillColor,
  type PageFrame,
  type Rgb,
  type WritebackPdfium,
} from './pdfium'

export interface TextObjectInfo {
  /** index in the page's top-level object list */
  index: number
  /** display space */
  bounds: Rect
  text: string
  /** median char font size, points */
  size: number
  /** display-space baselines of its chars */
  baselines: number[]
  color: Rgb
  invisible: boolean
  /** chars advance downward, or the text is turned off the horizontal */
  vertical: boolean
}

/** a char drawn inside a form XObject: the writeback cannot remove it */
export interface FormChar {
  /** display-space origin */
  at: [number, number]
  /** points */
  size: number
}

export interface PageTextObjects {
  objects: TextObjectInfo[]
  formChars: FormChar[]
}

/** PDFium's code for a line-end hyphen it recognized (pdf2docx lines.ts) */
const HYPHEN_MARKER = 0x02

/** tolerated turn of a "horizontal" char, radians */
const MAX_UPRIGHT_ANGLE = 0.15

const normalizeAngle = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI))

/**
 * Vertical scale of a char's matrix: FPDFText_GetFontSize reports the
 * nominal `Tf` size, and the text and graphics matrices scale it into page
 * space (`1 Tf` under a 12× text matrix is 12pt; browsers print 16 × 0.75).
 * pdf2docx measures sizes the same way.
 */
function charScale(m: WritebackPdfium, textPage: number, index: number, mx: number): number {
  if (!m._FPDFText_GetMatrix(textPage, index, mx)) return 1
  const base = mx >> 2
  const s = Math.hypot(m.HEAPF32[base + 2]!, m.HEAPF32[base + 3]!)
  return s > 0 ? s : 1
}

/** text objects of a page with their text, geometry and paint */
export function readTextObjects(
  m: WritebackPdfium,
  page: number,
  frame: PageFrame,
): PageTextObjects {
  const count = m._FPDFPage_CountObjects(page)
  const indexOf = new Map<number, number>()
  for (let i = 0; i < count; i++) {
    const obj = m._FPDFPage_GetObject(page, i)
    if (obj && m._FPDFPageObj_GetType(obj) === FPDF_PAGEOBJ_TEXT) indexOf.set(obj, i)
  }
  interface Acc {
    handle: number
    chars: string[]
    sizes: number[]
    origins: [number, number][]
    turned: number
  }
  const acc = new Map<number, Acc>()
  const formChars: FormChar[] = []
  const textPage = m._FPDFText_LoadPage(page)
  if (textPage) {
    try {
      const n = m._FPDFText_CountChars(textPage)
      // two doubles (char origin), then six floats (char matrix)
      withAlloc(m, 40, (p) => {
        const mx = p + 16
        for (let i = 0; i < n; i++) {
          const obj = m._FPDFText_GetTextObject(textPage, i)
          if (!obj) continue
          const cp = m._FPDFText_GetUnicode(textPage, i)
          // a recognized line-end hyphen is still ink on the page
          const ink = cp > 0x20 || cp === HYPHEN_MARKER
          m._FPDFText_GetCharOrigin(textPage, i, p, p + 8)
          const origin = frame.toDisplay(m.HEAPF64[p >> 3]!, m.HEAPF64[(p >> 3) + 1]!)
          const index = indexOf.get(obj)
          if (index === undefined) {
            if (ink) {
              const size = m._FPDFText_GetFontSize(textPage, i) * charScale(m, textPage, i, mx)
              formChars.push({ at: origin, size })
            }
            continue
          }
          let a = acc.get(index)
          if (!a) {
            a = { handle: obj, chars: [], sizes: [], origins: [], turned: 0 }
            acc.set(index, a)
          }
          a.chars.push(cp === HYPHEN_MARKER ? '-' : String.fromCodePoint(cp))
          if (ink) {
            a.sizes.push(m._FPDFText_GetFontSize(textPage, i) * charScale(m, textPage, i, mx))
            a.origins.push(origin)
            const angle = normalizeAngle(m._FPDFText_GetCharAngle(textPage, i) + frame.angleDelta)
            if (Math.abs(angle) > MAX_UPRIGHT_ANGLE) a.turned++
          }
        }
      })
    } finally {
      m._FPDFText_ClosePage(textPage)
    }
  }
  const objects: TextObjectInfo[] = []
  for (const [index, a] of acc) {
    if (a.origins.length === 0) continue
    const userBounds = objectBounds(m, a.handle)
    if (!userBounds) continue
    const size = medianOf(a.sizes) || 1
    const first = a.origins[0]!
    const last = a.origins[a.origins.length - 1]!
    const dx = Math.abs(last[0] - first[0])
    const dy = Math.abs(last[1] - first[1])
    objects.push({
      index,
      bounds: frame.rectToDisplay(userBounds),
      text: a.chars.join(''),
      size,
      baselines: a.origins.map((o) => o[1]),
      color: objectFillColor(m, a.handle) ?? [0, 0, 0],
      invisible: INVISIBLE_RENDER_MODES.has(m._FPDFTextObj_GetTextRenderMode(a.handle)),
      vertical: a.turned * 2 > a.origins.length || (dy > dx && dy > size * 0.5),
    })
  }
  objects.sort((a, b) => a.index - b.index)
  return { objects, formChars }
}

/** display-space bounds of the page's top-level objects other than text (paths, images, forms) */
export function readShapeBounds(m: WritebackPdfium, page: number, frame: PageFrame): Rect[] {
  const out: Rect[] = []
  const count = m._FPDFPage_CountObjects(page)
  for (let i = 0; i < count; i++) {
    const obj = m._FPDFPage_GetObject(page, i)
    if (!obj || m._FPDFPageObj_GetType(obj) === FPDF_PAGEOBJ_TEXT) continue
    const b = objectBounds(m, obj)
    if (b) out.push(frame.rectToDisplay(b))
  }
  return out
}

export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[s.length >> 1]!
}

// ── geometry ──

export const center = (r: Rect): [number, number] => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2]

export const area = (r: Rect): number => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0)

export const expand = (r: Rect, d: number): Rect => ({
  x0: r.x0 - d,
  y0: r.y0 - d,
  x1: r.x1 + d,
  y1: r.y1 + d,
})

export const contains = (r: Rect, [x, y]: readonly [number, number]): boolean =>
  x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1

export function union(rects: readonly Rect[]): Rect {
  return rects.reduce((a, r) => ({
    x0: Math.min(a.x0, r.x0),
    y0: Math.min(a.y0, r.y0),
    x1: Math.max(a.x1, r.x1),
    y1: Math.max(a.y1, r.y1),
  }))
}

/** share of `r`'s extent along one axis that lies inside `box` */
function overlapShare(r: Rect, box: Rect, axis: 'x' | 'y'): number {
  const [a0, a1, b0, b1] =
    axis === 'x' ? [r.x0, r.x1, box.x0, box.x1] : [r.y0, r.y1, box.y0, box.y1]
  const len = a1 - a0
  if (len <= 0) return 1
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / len
}

/** most of the object lies inside the box (it carries no text of a neighbor) */
export function mostlyInside(r: Rect, box: Rect): boolean {
  return overlapShare(r, box, 'x') >= 0.7 && overlapShare(r, box, 'y') >= 0.5
}

// ── text comparison ──

export const normText = (s: string): string =>
  s.normalize('NFKC').replace(/\s+/gu, '').toLowerCase()

/** Dice coefficient of char bigrams (1 = same text) */
export function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return a.includes(b) || b.includes(a) ? 0.5 : 0
  const grams = new Map<string, number>()
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2)
    grams.set(g, (grams.get(g) ?? 0) + 1)
  }
  let hits = 0
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2)
    const n = grams.get(g) ?? 0
    if (n > 0) {
      hits++
      grams.set(g, n - 1)
    }
  }
  return (2 * hits) / (a.length - 1 + b.length - 1)
}

// ── object ownership ──

export interface Owner {
  /** tree block id */
  id: string
  box: Rect
}

/** owner id → its objects; objects inside no owner are left out */
export function assignObjects(
  objects: readonly TextObjectInfo[],
  owners: readonly Owner[],
): Map<string, TextObjectInfo[]> {
  const out = new Map<string, TextObjectInfo[]>()
  for (const o of objects) {
    const c = center(o.bounds)
    let best: Owner | null = null
    for (const w of owners) {
      if (!contains(expand(w.box, 1.5), c)) continue
      if (!best || area(w.box) < area(best.box)) best = w
    }
    if (!best) continue
    const list = out.get(best.id) ?? []
    list.push(o)
    out.set(best.id, list)
  }
  return out
}

const HYPHEN_ONLY = /^[-\u00ad\u2010-\u2013]+$/u

/**
 * A line-end hyphen drawn as its own object sits just past its paragraph's
 * box (the analysis leaves it out of the line). Give each such object to
 * the block whose box ends within an em to its left on that line, and
 * return the objects given, which lie outside their owner's box by design.
 */
export function adoptHyphens(
  objects: readonly TextObjectInfo[],
  owners: readonly Owner[],
  owned: Map<string, TextObjectInfo[]>,
): Set<TextObjectInfo> {
  const taken = new Set([...owned.values()].flat())
  const adopted = new Set<TextObjectInfo>()
  for (const o of objects) {
    if (taken.has(o) || !HYPHEN_ONLY.test(normText(o.text))) continue
    const [, cy] = center(o.bounds)
    let best: Owner | null = null
    let bestGap = Infinity
    for (const w of owners) {
      if (cy < w.box.y0 - 1 || cy > w.box.y1 + 1) continue
      const gap = o.bounds.x0 - w.box.x1
      if (gap < -1 || gap > o.size || gap >= bestGap) continue
      best = w
      bestGap = gap
    }
    if (!best) continue
    owned.set(best.id, [...(owned.get(best.id) ?? []), o])
    adopted.add(o)
  }
  return adopted
}

/** objects in reading order: top to bottom, then left to right */
export function readingOrder(objects: readonly TextObjectInfo[]): TextObjectInfo[] {
  return [...objects].sort((a, b) => {
    const dy = b.baselines[0]! - a.baselines[0]!
    if (Math.abs(dy) > Math.min(a.size, b.size) * 0.3) return dy
    return a.bounds.x0 - b.bounds.x0
  })
}

export interface CellText {
  key: string
  text: string
  /**
   * the paragraph's share of its cell (the whole cell for a one-paragraph
   * cell), from the cell boxes the PDF analysis found; absent for AI tables
   */
  area?: Rect
}

export interface CellPlacement {
  objects: TextObjectInfo[]
  box: Rect
  /** the paragraph's whole area, for text that needs more room than `box` */
  area?: Rect
}

/** inset of the translation from the cell rules, points */
const CELL_PAD_X = 2
const CELL_PAD_Y = 1
/** how far a text object may poke past its cell's rule into a neighbor, points */
const CELL_REACH = 1.5

const inset = (r: Rect): Rect => ({
  x0: r.x0 + CELL_PAD_X,
  y0: r.y0 + CELL_PAD_Y,
  x1: Math.max(r.x0 + CELL_PAD_X, r.x1 - CELL_PAD_X),
  y1: Math.max(r.y0 + CELL_PAD_Y, r.y1 - CELL_PAD_Y),
})

/**
 * Split a table's objects among its cell paragraphs by place: an object
 * belongs to the area holding most of it. An object reaching more than
 * CELL_REACH into another area (a whole row drawn as one string) belongs
 * to none, and the paragraphs it
 * touches are not written ('shared'): removing it would take a neighbor's
 * text. A paragraph starts at its source top (`box`); its whole `area` is
 * the room it may take when that is not enough.
 */
export function placeCellsByArea(
  objects: readonly TextObjectInfo[],
  cells: readonly (CellText & { area: Rect })[],
): Map<string, CellPlacement | 'shared'> {
  const got = new Map<string, TextObjectInfo[]>()
  const straddling: Rect[] = []
  const overlap = (r: Rect, a: Rect) =>
    Math.max(0, Math.min(r.x1, a.x1) - Math.max(r.x0, a.x0)) *
    Math.max(0, Math.min(r.y1, a.y1) - Math.max(r.y0, a.y0))
  for (const o of objects) {
    if (!normText(o.text)) continue
    const reached = cells.filter((c) => overlap(o.bounds, expand(c.area, -CELL_REACH)) > 0)
    const home = cells.reduce<(typeof cells)[number] | null>(
      (best, c) => (!best || overlap(o.bounds, c.area) > overlap(o.bounds, best.area) ? c : best),
      null,
    )
    if (home && reached.every((c) => c.area === home.area)) {
      got.set(home.key, [...(got.get(home.key) ?? []), o])
    } else straddling.push(o.bounds)
  }
  const out = new Map<string, CellPlacement | 'shared'>()
  for (const c of cells) {
    const touched = straddling.some(
      (r) => r.x0 < c.area.x1 && r.x1 > c.area.x0 && r.y0 < c.area.y1 && r.y1 > c.area.y0,
    )
    if (touched) {
      out.set(c.key, 'shared')
      continue
    }
    const objs = got.get(c.key)
    if (!objs?.length) continue
    const area = inset(c.area)
    const top = Math.min(area.y1, union(objs.map((o) => o.bounds)).y1)
    out.set(c.key, { objects: objs, box: { ...area, y1: Math.max(area.y0, top) }, area })
  }
  return out
}

/**
 * Split a table's objects among its cell paragraphs by text: an object goes
 * to the first cell (row-major) whose text contains it and still has room.
 * A cell is found when its objects carry at least 80% of its text; its box
 * is their union, widened right and down to the nearest neighbor (or the
 * table edge) so the translation has the cell's space.
 */
export function placeCells(
  objects: readonly TextObjectInfo[],
  cells: readonly CellText[],
  table: Rect,
): Map<string, CellPlacement> {
  const want = cells.map((c) => normText(c.text))
  const got: TextObjectInfo[][] = cells.map(() => [])
  const used = cells.map(() => 0)
  const loose: TextObjectInfo[] = []
  for (const o of readingOrder(objects)) {
    const t = normText(o.text)
    if (!t) continue
    const i = want.findIndex((w, k) => w.includes(t) && used[k]! + t.length <= w.length + 1)
    if (i < 0) {
      loose.push(o)
      continue
    }
    got[i]!.push(o)
    used[i]! += t.length
  }
  const found = new Map<string, Rect>()
  cells.forEach((c, i) => {
    if (want[i]!.length > 0 && used[i]! >= want[i]!.length * 0.8) {
      found.set(c.key, union(got[i]!.map((o) => o.bounds)))
    } else loose.push(...got[i]!)
  })
  const obstacles = (key: string): Rect[] => [
    ...[...found].filter(([k]) => k !== key).map(([, r]) => r),
    ...loose.map((o) => o.bounds),
  ]
  const out = new Map<string, CellPlacement>()
  cells.forEach((c, i) => {
    const r = found.get(c.key)
    if (!r) return
    let right = table.x1
    let bottom = table.y0
    for (const ob of obstacles(c.key)) {
      const vertical = ob.y0 < r.y1 && ob.y1 > r.y0
      const horizontal = ob.x0 < r.x1 && ob.x1 > r.x0
      if (vertical && ob.x0 >= r.x1 - 0.5) right = Math.min(right, ob.x0 - 2)
      if (horizontal && ob.y1 <= r.y0 + 0.5) bottom = Math.max(bottom, ob.y1 + 2)
    }
    out.set(c.key, {
      objects: got[i]!,
      box: { x0: r.x0, y0: Math.min(r.y0, bottom), x1: Math.max(r.x1, right), y1: r.y1 },
    })
  })
  return out
}

// ── scanned pages ──

export interface OcrLineBox {
  text: string
  /** display space */
  box: Rect
}

/** recognition lines kept below this confidence are stray texture (pdf2docx rule) */
const OCR_LINE_MIN_CONFIDENCE = 0.3

/** the engine's text lines in display space, or null when it gave none */
export function recognizeLines(
  engine: OcrEngine,
  png: Uint8Array,
  frame: PageFrame,
): OcrLineBox[] | null {
  let rec
  try {
    rec = engine(png, { widthPt: frame.widthPt, heightPt: frame.heightPt })
  } catch {
    return null
  }
  const lines = (rec?.lines ?? [])
    .filter((l) => l.confidence >= OCR_LINE_MIN_CONFIDENCE && l.text.trim() !== '')
    .map((l) => ({
      text: l.text,
      box: {
        x0: l.box.x0 * frame.widthPt,
        y0: l.box.y0 * frame.heightPt,
        x1: l.box.x1 * frame.widthPt,
        y1: l.box.y1 * frame.heightPt,
      },
    }))
  return lines.length > 0 ? lines : null
}

/** line boxes whose center lies in the region */
export function linesInRegion(lines: readonly OcrLineBox[], region: Rect): OcrLineBox[] {
  return lines.filter((l) => contains(expand(region, 2), center(l.box)))
}

/** blocks further than this from any line match are not placed */
const MIN_LINE_MATCH = 0.45
/** lines a block may skip over (running heads, page numbers the AI left out) */
const MAX_SKIPPED_LINES = 3

/**
 * Place blocks without a measured position (AI-read pages) on the OCR lines:
 * in reading order, each block takes the run of following lines whose text
 * matches it best. Returns block index → its lines.
 */
export function matchLinesToBlocks(
  lines: readonly OcrLineBox[],
  blocks: readonly string[],
): Map<number, OcrLineBox[]> {
  const out = new Map<number, OcrLineBox[]>()
  const texts = lines.map((l) => normText(l.text))
  let cursor = 0
  blocks.forEach((block, bi) => {
    const t = normText(block)
    if (!t) return
    let best = { score: 0, start: -1, end: -1 }
    for (let s = cursor; s < Math.min(lines.length, cursor + MAX_SKIPPED_LINES + 1); s++) {
      let acc = ''
      for (let e = s; e < lines.length; e++) {
        acc += texts[e]
        const score = similarity(acc, t)
        if (score > best.score) best = { score, start: s, end: e }
        if (acc.length > t.length * 1.6) break
      }
    }
    if (best.score < MIN_LINE_MATCH) return
    out.set(bi, lines.slice(best.start, best.end + 1))
    cursor = best.end + 1
  })
  return out
}
