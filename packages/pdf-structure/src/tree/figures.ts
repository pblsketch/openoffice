/**
 * Figure regions (decision 0057): drawings made of vector shapes, which the
 * IR has no block for. A chart or a diagram otherwise reaches the tree as
 * loose paragraphs (its labels, flowed as prose) or as an empty table (its
 * grid lines).
 *
 * Read-only: the page's objects are read through PDFium, never changed.
 * A region is a cluster of nearby shapes with curves, diagonals or filled
 * bars in it. Bare rules (tables, underlines), page backgrounds and boxes
 * holding prose are left out, and a cluster with prose inside is not a
 * figure.
 */
import { encodeRgbaPng } from '../../../pdf2docx/src/extract/png'
import type { PdfiumModule } from '../../../pdf2docx/src/extract/pdfium'
import type {
  ImageBlock as IrImageBlock,
  IrPage,
  Line,
  PageBlock,
  TableBlock as IrTableBlock,
  TextBlock as IrTextBlock,
} from '../../../pdf2docx/src/ir'
import { scriptOf, type UnicodeScript } from '../../../pdf2docx/src/script'
import { objectBounds, PageFrame, renderPageBitmap } from '../writeback/pdfium'
import { isCaptionText } from './captions'
import type { Rect } from './types'

const FPDF_PAGEOBJ_TEXT = 1
const FPDF_PAGEOBJ_PATH = 2
const FPDF_PAGEOBJ_IMAGE = 3
const FPDF_PAGEOBJ_SHADING = 4
const FPDF_PAGEOBJ_FORM = 5
const FPDF_SEGMENT_LINETO = 0
const FPDF_SEGMENT_BEZIERTO = 1

/** shapes this close (points) belong to one drawing */
const CLUSTER_GAP = 6
/** clusters this close and lined up along it (rows of a dot plot) are one drawing */
const ROW_GAP = 30
/** a shape covering this share of the page is a background */
const BACKGROUND_SHARE = 0.5
/** a form covering this share of the page wraps the page content: look inside it */
const WRAPPER_SHARE = 0.8
/** a figure covers at least this share of the page, and this many points each way */
const MIN_FIGURE_SHARE = 0.02
const MIN_FIGURE_W = 50
const MIN_FIGURE_H = 30
/** ... and at most this share (a full-page design is not one figure) */
const MAX_FIGURE_SHARE = 0.85
/** a stroke thinner than this (points) is a rule, not a bar */
const THIN = 2
/** a drawing lying this much inside tables the analysis found belongs to them */
const TABLE_SHARE = 0.3
/** a table with fewer of its cells holding text is a drawing's grid */
const REAL_TABLE_FILL = 0.5

type ShapeKind = 'curve' | 'rule' | 'bar' | 'image' | 'form'

interface Shape {
  box: Rect
  kind: ShapeKind
}

/** affine [a b c d e f], PDF order */
type Matrix = readonly [number, number, number, number, number, number]

const compose = (outer: Matrix, inner: Matrix): Matrix => [
  inner[0] * outer[0] + inner[1] * outer[2],
  inner[0] * outer[1] + inner[1] * outer[3],
  inner[2] * outer[0] + inner[3] * outer[2],
  inner[2] * outer[1] + inner[3] * outer[3],
  inner[4] * outer[0] + inner[5] * outer[2] + outer[4],
  inner[4] * outer[1] + inner[5] * outer[3] + outer[5],
]

function transformRect(m: Matrix, r: Rect): Rect {
  const pts = [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x0, r.y1],
    [r.x1, r.y1],
  ].map(([x, y]) => [m[0] * x! + m[2] * y! + m[4], m[1] * x! + m[3] * y! + m[5]] as const)
  return {
    x0: Math.min(...pts.map((p) => p[0])),
    y0: Math.min(...pts.map((p) => p[1])),
    x1: Math.max(...pts.map((p) => p[0])),
    y1: Math.max(...pts.map((p) => p[1])),
  }
}

const intersection = (a: Rect, b: Rect): Rect => ({
  x0: Math.max(a.x0, b.x0),
  y0: Math.max(a.y0, b.y0),
  x1: Math.min(a.x1, b.x1),
  y1: Math.min(a.y1, b.y1),
})

const area = (r: Rect): number => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0)

const overlaps = (a: Rect, b: Rect, pad = 0): boolean =>
  a.x0 - pad < b.x1 && a.x1 + pad > b.x0 && a.y0 - pad < b.y1 && a.y1 + pad > b.y0

const holds = (outer: Rect, inner: Rect, pad = 0): boolean =>
  outer.x0 - pad <= inner.x0 &&
  outer.y0 - pad <= inner.y0 &&
  outer.x1 + pad >= inner.x1 &&
  outer.y1 + pad >= inner.y1

const centerIn = (r: Rect, box: Rect): boolean => {
  const x = (r.x0 + r.x1) / 2
  const y = (r.y0 + r.y1) / 2
  return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1
}

export const unionRect = (rects: readonly Rect[]): Rect => ({
  x0: Math.min(...rects.map((r) => r.x0)),
  y0: Math.min(...rects.map((r) => r.y0)),
  x1: Math.max(...rects.map((r) => r.x1)),
  y1: Math.max(...rects.map((r) => r.y1)),
})

/** curve: any Bézier segment or a line neither horizontal nor vertical */
function pathKind(m: PdfiumModule, path: number, box: Rect): ShapeKind {
  const n = m._FPDFPath_CountSegments(path)
  let prev: [number, number] | null = null
  const p = m._malloc(8)
  try {
    for (let i = 0; i < n; i++) {
      const seg = m._FPDFPath_GetPathSegment(path, i)
      if (!seg) continue
      const type = m._FPDFPathSegment_GetType(seg)
      if (type === FPDF_SEGMENT_BEZIERTO) return 'curve'
      if (!m._FPDFPathSegment_GetPoint(seg, p, p + 4)) continue
      const pt: [number, number] = [m.HEAPF32[p >> 2]!, m.HEAPF32[(p >> 2) + 1]!]
      if (type === FPDF_SEGMENT_LINETO && prev) {
        if (Math.abs(pt[0] - prev[0]) > 0.5 && Math.abs(pt[1] - prev[1]) > 0.5) return 'curve'
      }
      prev = pt
    }
  } finally {
    m._free(p)
  }
  return Math.min(box.x1 - box.x0, box.y1 - box.y0) < THIN ? 'rule' : 'bar'
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

function formMatrix(m: PdfiumModule, form: number): Matrix {
  const p = m._malloc(24)
  try {
    if (!m._FPDFPageObj_GetMatrix(form, p)) return IDENTITY
    const f = m.HEAPF32
    const b = p >> 2
    return [f[b]!, f[b + 1]!, f[b + 2]!, f[b + 3]!, f[b + 4]!, f[b + 5]!]
  } finally {
    m._free(p)
  }
}

/** paths and images inside a form (an embedded graphic has several; a text box has none) */
function formGraphics(m: PdfiumModule, form: number, depth = 0): number {
  let count = 0
  const n = m._FPDFFormObj_CountObjects?.(form) ?? 0
  for (let i = 0; i < n; i++) {
    const child = m._FPDFFormObj_GetObject?.(form, i)
    if (!child) continue
    const type = m._FPDFPageObj_GetType(child)
    if (type === FPDF_PAGEOBJ_PATH || type === FPDF_PAGEOBJ_IMAGE) count++
    else if (type === FPDF_PAGEOBJ_FORM && depth < 4) count += formGraphics(m, child, depth + 1)
  }
  return count
}

/** an embedded graphic holds at least this many paths or images */
const MIN_FORM_GRAPHICS = 3

/** the page's shapes in display space (backgrounds left out) */
function readShapes(m: PdfiumModule, page: number, frame: PageFrame): Shape[] {
  const pageArea = frame.widthPt * frame.heightPt
  const out: Shape[] = []
  const visit = (obj: number, toPage: Matrix | null, depth: number) => {
    const type = m._FPDFPageObj_GetType(obj)
    if (type === FPDF_PAGEOBJ_TEXT) return
    const raw = objectBounds(m, obj)
    if (!raw) return
    const box = frame.rectToDisplay(toPage ? transformRect(toPage, raw) : raw)
    if (type === FPDF_PAGEOBJ_FORM) {
      if (area(box) > WRAPPER_SHARE * pageArea && depth < 4) {
        const inner = compose(toPage ?? IDENTITY, formMatrix(m, obj))
        const n = m._FPDFFormObj_CountObjects?.(obj) ?? 0
        for (let i = 0; i < n; i++) {
          const child = m._FPDFFormObj_GetObject?.(obj, i)
          if (child) visit(child, inner, depth + 1)
        }
        return
      }
      if (area(box) <= BACKGROUND_SHARE * pageArea && formGraphics(m, obj) >= MIN_FORM_GRAPHICS) {
        out.push({ box, kind: 'form' })
      }
      return
    }
    if (area(box) > BACKGROUND_SHARE * pageArea) return
    if (type === FPDF_PAGEOBJ_IMAGE) out.push({ box, kind: 'image' })
    else if (type === FPDF_PAGEOBJ_SHADING) out.push({ box, kind: 'bar' })
    else if (type === FPDF_PAGEOBJ_PATH) out.push({ box, kind: pathKind(m, obj, raw) })
  }
  const count = m._FPDFPage_CountObjects(page)
  for (let i = 0; i < count; i++) {
    const obj = m._FPDFPage_GetObject(page, i)
    if (obj) visit(obj, null, 0)
  }
  return out
}

/** clusters of shapes within CLUSTER_GAP of each other (grid buckets, union-find) */
function cluster(shapes: readonly Shape[]): Shape[][] {
  const parent = shapes.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)))
  const cell = 48
  const buckets = new Map<string, number[]>()
  shapes.forEach((s, i) => {
    for (
      let gx = Math.floor((s.box.x0 - CLUSTER_GAP) / cell);
      gx <= Math.floor((s.box.x1 + CLUSTER_GAP) / cell);
      gx++
    ) {
      for (
        let gy = Math.floor((s.box.y0 - CLUSTER_GAP) / cell);
        gy <= Math.floor((s.box.y1 + CLUSTER_GAP) / cell);
        gy++
      ) {
        const key = `${gx}:${gy}`
        const list = buckets.get(key)
        if (!list) {
          buckets.set(key, [i])
          continue
        }
        for (const j of list) {
          if (find(i) !== find(j) && overlaps(s.box, shapes[j]!.box, CLUSTER_GAP)) {
            parent[find(i)] = find(j)
          }
        }
        list.push(i)
      }
    }
  })
  const groups = new Map<number, Shape[]>()
  shapes.forEach((s, i) => {
    const root = find(i)
    const g = groups.get(root) ?? []
    g.push(s)
    groups.set(root, g)
  })
  return [...groups.values()]
}

const lineChars = (b: IrTextBlock): number[] =>
  b.lines.map(
    (l) =>
      [
        ...l.spans
          .map((s) => s.text)
          .join('')
          .trim(),
      ].length,
  )

/** running text: several long lines (a label is a word or a short phrase) */
export function isProse(b: IrTextBlock): boolean {
  const chars = lineChars(b)
  const long = chars.filter((n) => n >= 40).length
  return long >= 2 || (chars.length >= 3 && chars.reduce((a, n) => a + n, 0) / chars.length >= 30)
}

/** a table the analysis found whose cells mostly hold text */
export function isRealTable(t: IrTableBlock): boolean {
  let cells = 0
  let filled = 0
  for (const row of t.rows) {
    for (const c of row) {
      if (c.vMerge === 'continue') continue
      cells++
      if (c.blocks.some((b) => b.lines.some((l) => l.spans.some((s) => s.text.trim() !== '')))) {
        filled++
      }
    }
  }
  return cells > 0 && filled / cells >= REAL_TABLE_FILL
}

/** a drawing: an embedded graphic, curves or diagonals, or filled bars along rules */
function isDrawing(shapes: readonly Shape[]): boolean {
  if (shapes.some((s) => s.kind === 'form')) return true
  const curves = shapes.filter((s) => s.kind === 'curve').length
  const bars = shapes.filter((s) => s.kind === 'bar').length
  return curves >= 2 || (curves >= 1 && shapes.length >= 4) || (bars >= 4 && shapes.length >= 8)
}

/**
 * The figure regions of one analyzed page, in the IR's display space.
 * `page` is the PDFium page the IR page came from.
 */
export function findFigureRegions(m: PdfiumModule, page: number, ir: IrPage): Rect[] {
  return findDrawings(m, page, ir).map((d) => d.box)
}

interface Drawing {
  box: Rect
  /** holds an embedded graphic (a form XObject): tables read into it are its own */
  embedded: boolean
}

function findDrawings(m: PdfiumModule, page: number, ir: IrPage): Drawing[] {
  if (ir.scanned || ir.degraded || ir.ocrRecovered) return []
  const frame = new PageFrame(m, page)
  const pageArea = frame.widthPt * frame.heightPt
  const texts = ir.blocks.filter((b): b is IrTextBlock => b.kind === 'text')
  const prose = texts.filter(isProse).map((b) => b.box)
  const tables = ir.blocks
    .filter((b): b is IrTableBlock => b.kind === 'table' && isRealTable(b))
    .map((t) => t.box)
  const shapes = readShapes(m, page, frame).filter(
    (s) =>
      // a real table's rules and fills are the table's
      !tables.some((t) => holds(t, s.box, 2)) &&
      // a box or form holding prose is a panel or a frame, not part of a drawing
      !(
        (s.kind === 'bar' || s.kind === 'rule' || s.kind === 'form') &&
        prose.some((p) => holds(s.box, p, 1))
      ),
  )
  const out: Drawing[] = []
  for (const group of joinRows(cluster(shapes))) {
    if (!isDrawing(group)) continue
    const box = unionRect(group.map((s) => s.box))
    const share = area(box) / pageArea
    if (share < MIN_FIGURE_SHARE || share > MAX_FIGURE_SHARE) continue
    if (box.x1 - box.x0 < MIN_FIGURE_W || box.y1 - box.y0 < MIN_FIGURE_H) continue
    // running text inside: a layout of panels, not a drawing
    if (prose.some((p) => centerIn(p, box))) continue
    // a piece of a table's own graphics (dots, bars along its rows): the table keeps it;
    // an embedded graphic stays a drawing even where the analysis read a table into it
    const embedded = group.some((s) => s.kind === 'form')
    const inTables = tables.reduce((sum, t) => sum + area(intersection(t, box)), 0)
    if (!embedded && inTables > TABLE_SHARE * area(box)) continue
    out.push({ box, embedded })
  }
  // drawings cut in two by a gap a little wider than CLUSTER_GAP are one figure when they overlap
  return mergeOverlapping(out)
}

/** clusters stacked within ROW_GAP that share most of their width, or side by side sharing their height */
function joinRows(groups: Shape[][]): Shape[][] {
  const out = groups.map((g) => ({ shapes: g, box: unionRect(g.map((s) => s.box)) }))
  const lined = (a: Rect, b: Rect): boolean => {
    const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
    const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
    const narrow = Math.min(a.x1 - a.x0, b.x1 - b.x0)
    const short = Math.min(a.y1 - a.y0, b.y1 - b.y0)
    const vGap = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)
    const hGap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)
    return (vGap <= ROW_GAP && w >= 0.5 * narrow) || (hGap <= ROW_GAP && h >= 0.5 * short)
  }
  for (let changed = true; changed;) {
    changed = false
    for (let i = 0; i < out.length && !changed; i++) {
      for (let j = i + 1; j < out.length; j++) {
        if (!lined(out[i]!.box, out[j]!.box)) continue
        out[i] = {
          shapes: [...out[i]!.shapes, ...out[j]!.shapes],
          box: unionRect([out[i]!.box, out[j]!.box]),
        }
        out.splice(j, 1)
        changed = true
        break
      }
    }
  }
  return out.map((g) => g.shapes)
}

function mergeOverlapping(drawings: Drawing[]): Drawing[] {
  const out = [...drawings]
  for (let changed = true; changed;) {
    changed = false
    for (let i = 0; i < out.length && !changed; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!
        const b = out[j]!
        if (overlaps(a.box, b.box)) {
          out[i] = { box: unionRect([a.box, b.box]), embedded: a.embedded || b.embedded }
          out.splice(j, 1)
          changed = true
          break
        }
      }
    }
  }
  return out
}

// ── what a figure takes in ──

/** labels this close to a drawing (points) belong to it: axis titles, ticks, legends */
const LABEL_REACH = 10
/** a label line holds at most this many chars */
const MAX_LABEL_CHARS = 60
/** room kept around a figure's picture, points */
const PICTURE_PAD = 2
/** a gap wider than this share of the font size starts another label */
const LABEL_SPLIT_EMS = 1
/** stacked label lines this close (share of the line height) are one label */
const LABEL_STACK_GAP = 0.6
/** PDFium's code for a line-end hyphen it recognized (pdf2docx lines.ts) */
const HYPHEN_MARKER = 0x02
/** tolerated turn of an upright char, radians */
const MAX_UPRIGHT_ANGLE = 0.15
const BOLD_WEIGHT = 600

const blockText = (b: IrTextBlock): string =>
  b.lines.map((l) => l.spans.map((s) => s.text).join('')).join(' ')

/** a short text inside or right by a drawing: one of its labels */
function isLabel(b: IrTextBlock): boolean {
  if (isProse(b) || isCaptionText(blockText(b))) return false
  return lineChars(b).every((n) => n <= MAX_LABEL_CHARS)
}

export interface FigurePlan {
  /** the drawing with its labels, display space */
  box: Rect
  /** IR blocks it takes in (labels, a grid table read off its gridlines, pictures inside) */
  blocks: Set<PageBlock>
  /**
   * its labels, one IR-shaped line per label line, read from the page's own
   * chars (the analysis drops the text of drawings it renders as pictures);
   * only upright labels with letters (tick numbers stay as drawn)
   */
  labels: Line[][]
  /** the picture of `box` */
  png: Uint8Array
  pixelWidth: number
  pixelHeight: number
}

interface PageChar {
  text: string
  box: Rect
  baseline: number
  size: number
  bold: boolean
  upright: boolean
  script: UnicodeScript
}

const SPACE: PageChar = {
  text: ' ',
  box: { x0: 0, y0: 0, x1: 0, y1: 0 },
  baseline: 0,
  size: 0,
  bold: false,
  upright: true,
  script: scriptOf(0x20),
}

const normalizeAngle = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI))

/** the page's chars in content order, display space; spaces carry no box */
function readChars(m: PdfiumModule, page: number, frame: PageFrame): PageChar[] {
  const tp = m._FPDFText_LoadPage(page)
  if (!tp) return []
  const out: PageChar[] = []
  // four doubles (char box), two doubles (origin), six floats (char matrix)
  const p = m._malloc(72)
  try {
    const n = m._FPDFText_CountChars(tp)
    for (let i = 0; i < n; i++) {
      const cp = m._FPDFText_GetUnicode(tp, i)
      if (cp === 0x20 || cp === 0xa0) {
        out.push(SPACE)
        continue
      }
      if (cp < 0x20 && cp !== HYPHEN_MARKER) continue
      if (!m._FPDFText_GetCharBox(tp, i, p, p + 8, p + 16, p + 24)) continue
      const d = m.HEAPF64
      const b = p >> 3
      const box = frame.rectToDisplay({ x0: d[b]!, x1: d[b + 1]!, y0: d[b + 2]!, y1: d[b + 3]! })
      m._FPDFText_GetCharOrigin(tp, i, p + 32, p + 40)
      const [, baseline] = frame.toDisplay(d[b + 4]!, d[b + 5]!)
      let scale = 1
      if (m._FPDFText_GetMatrix(tp, i, p + 48)) {
        const f = (p + 48) >> 2
        scale = Math.hypot(m.HEAPF32[f + 2]!, m.HEAPF32[f + 3]!) || 1
      }
      const angle = normalizeAngle(m._FPDFText_GetCharAngle(tp, i) + frame.angleDelta)
      out.push({
        text: cp === HYPHEN_MARKER ? '-' : String.fromCodePoint(cp),
        box,
        baseline,
        size: m._FPDFText_GetFontSize(tp, i) * scale,
        bold: m._FPDFText_GetFontWeight(tp, i) >= BOLD_WEIGHT,
        upright: Math.abs(angle) <= MAX_UPRIGHT_ANGLE,
        script: scriptOf(cp),
      })
    }
  } finally {
    m._free(p)
    m._FPDFText_ClosePage(tp)
  }
  return out
}

const median = (v: number[]): number => [...v].sort((a, b) => a - b)[v.length >> 1] ?? 0

/** one label line from its chars, shaped like an IR line of one span */
function pieceLine(chars: PageChar[]): Line {
  const ink = chars.filter((c) => c !== SPACE)
  const box = unionRect(ink.map((c) => c.box))
  const scripts = ink.map((c) => c.script).filter((s) => s !== 'common')
  return {
    spans: [
      {
        text: chars
          .map((c) => c.text)
          .join('')
          .trim(),
        box,
        fontSize: median(ink.map((c) => c.size)),
        fontFamily: '',
        bold: ink.every((c) => c.bold),
        italic: false,
        color: '000000',
        dir: 'ltr',
        script: scripts[0] ?? ink[0]!.script,
      },
    ],
    box,
    baseline: median(ink.map((c) => c.baseline)),
    endsWithHyphen: false,
  }
}

/** the page's upright chars cut into lines at baseline changes and wide gaps */
function labelLines(chars: readonly PageChar[]): Line[] {
  const out: Line[] = []
  let cur: PageChar[] = []
  let last: PageChar | null = null
  const flush = () => {
    if (cur.some((c) => c !== SPACE)) out.push(pieceLine(cur))
    cur = []
    last = null
  }
  for (const c of chars) {
    if (c === SPACE) {
      if (last) cur.push(c)
      continue
    }
    if (!c.upright) {
      flush()
      continue
    }
    if (last) {
      const em = Math.max(last.size, c.size)
      if (
        Math.abs(c.baseline - last.baseline) > 0.3 * em ||
        c.box.x0 - last.box.x1 > LABEL_SPLIT_EMS * em ||
        c.box.x1 < last.box.x0
      ) {
        flush()
      }
    }
    cur.push(c)
    last = c
  }
  flush()
  return out
}

const NO_LETTERS = /^[^\p{L}]*$/u

/** a word worth translating: three Latin-like letters, or one letter of a script without spaces */
const WORDY =
  /\p{L}[^\p{L}]*\p{L}[^\p{L}]*\p{L}|[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u

/** label lines stacked close and overlapping are one label; labels with no word are left as drawn */
function stackLabels(lines: readonly Line[]): Line[][] {
  const sorted = [...lines].sort((a, b) => b.box.y1 - a.box.y1 || a.box.x0 - b.box.x0)
  const groups: Line[][] = []
  for (const line of sorted) {
    const h = line.box.y1 - line.box.y0
    const under = groups.find((g) => {
      const last = g[g.length - 1]!
      const gap = last.box.y0 - line.box.y1
      const overlap = Math.min(last.box.x1, line.box.x1) - Math.max(last.box.x0, line.box.x0)
      const narrower = Math.min(last.box.x1 - last.box.x0, line.box.x1 - line.box.x0)
      return gap >= -0.2 * h && gap <= LABEL_STACK_GAP * h && overlap >= 0.5 * narrower
    })
    if (under) under.push(line)
    else groups.push([line])
  }
  return groups.filter((g) => WORDY.test(g.map((l) => l.spans[0]!.text).join(' ')))
}

/**
 * The figures of one analyzed page: each drawing with the IR blocks it
 * takes in (short text inside or right by it, an empty grid table read off
 * its gridlines, pictures inside it), its labels and a picture of the whole.
 */
export function planFigures(
  m: PdfiumModule,
  page: number,
  ir: IrPage,
  renderScale: number,
): FigurePlan[] {
  const drawings = findDrawings(m, page, ir)
  if (drawings.length === 0) return []
  const plans: { box: Rect; blocks: Set<PageBlock> }[] = []
  const taken = new Set<PageBlock>()
  for (const { box: region, embedded } of drawings) {
    const reach: Rect = {
      x0: region.x0 - LABEL_REACH,
      y0: region.y0 - LABEL_REACH,
      x1: region.x1 + LABEL_REACH,
      y1: region.y1 + LABEL_REACH,
    }
    const blocks = new Set<PageBlock>()
    for (const b of ir.blocks) {
      if (taken.has(b)) continue
      // numbers (axis ticks) sit out by the axis: touching the reach is enough
      const inside =
        b.kind === 'text'
          ? (NO_LETTERS.test(blockText(b)) ? overlaps(b.box, reach) : centerIn(b.box, reach)) &&
            isLabel(b)
          : b.kind === 'table'
            ? (embedded || !isRealTable(b)) && holds(reach, b.box, LABEL_REACH)
            : centerIn((b as IrImageBlock).box, region)
      if (!inside) continue
      blocks.add(b)
      taken.add(b)
    }
    const box = unionRect([region, ...[...blocks].map((b) => b.box)])
    plans.push({
      box: {
        x0: Math.max(0, box.x0 - PICTURE_PAD),
        y0: Math.max(0, box.y0 - PICTURE_PAD),
        x1: Math.min(ir.widthPt, box.x1 + PICTURE_PAD),
        y1: Math.min(ir.heightPt, box.y1 + PICTURE_PAD),
      },
      blocks,
    })
  }
  const frame = new PageFrame(m, page)
  const lines = labelLines(readChars(m, page, frame))
  const bitmap = renderPageBitmap(m, page, frame, renderScale)
  if (!bitmap) return []
  const used = new Set<Line>()
  return plans.map((p) => {
    // whole lines: a label running past the drawing's edge is taken whole
    const mine = lines.filter((l) => !used.has(l) && centerIn(l.box, p.box))
    for (const l of mine) used.add(l)
    const box = unionRect([p.box, ...mine.map((l) => l.box)])
    return { ...p, box, labels: stackLabels(mine), ...crop(bitmap, box) }
  })
}

function crop(
  b: { rgba: Uint8Array; width: number; height: number; scale: number; heightPt: number },
  r: Rect,
): { png: Uint8Array; pixelWidth: number; pixelHeight: number } {
  const x0 = Math.max(0, Math.floor(r.x0 * b.scale))
  const y0 = Math.max(0, Math.floor((b.heightPt - r.y1) * b.scale))
  const x1 = Math.min(b.width, Math.ceil(r.x1 * b.scale))
  const y1 = Math.min(b.height, Math.ceil((b.heightPt - r.y0) * b.scale))
  const w = Math.max(1, x1 - x0)
  const h = Math.max(1, y1 - y0)
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * b.width + x0) * 4
    out.set(b.rgba.subarray(from, from + w * 4), y * w * 4)
  }
  return { png: encodeRgbaPng(out, w, h), pixelWidth: w, pixelHeight: h }
}
