/**
 * writeTranslatedPdf: a copy of the source PDF with each translated block's
 * text written over its own place (spec §8, translated PDF).
 *
 * Three steps. Reading (the source opened read-only): every page's text
 * objects are tied to their tree blocks, scanned pages get their OCR lines,
 * colors are sampled. Planning: fonts are found and subset, each block's
 * translation is wrapped and fitted into its boxes. Writing (the source
 * opened again): the planned objects are removed, scan lines painted over,
 * the translation drawn, and the result saved as a new document. The input
 * bytes are only ever copied.
 */
import { PdfLoadError, withPdfDocument } from '../../../pdf2docx/src/extract'
import { encodeRgbaPng } from '../../../pdf2docx/src/extract/png'
import { translationUnits } from '../translate/result'
import { cellKey, textUnits, type TextUnit } from '../tree/derive'
import { PageRangeError } from '../tree/extract'
import type { BlockRegion, DocumentTree, InlineRun, PageInfo, Rect } from '../tree/types'
import {
  adoptHyphens,
  assignObjects,
  expand,
  contains,
  center,
  linesInRegion,
  matchLinesToBlocks,
  medianOf,
  mostlyInside,
  normText,
  placeCells,
  placeCellsByArea,
  readShapeBounds,
  readTextObjects,
  readingOrder,
  recognizeLines,
  similarity,
  union,
  type CellPlacement,
  type CellText,
  type FormChar,
  type OcrLineBox,
  type Owner,
  type TextObjectInfo,
} from './analyze'
import { FaceMetrics, checkedFont, createSubsetter, defaultWritebackFontLocator } from './font'
import { writeBilingualPdf } from './bilingual'
import { placeBlocks, type PageSpace, type PlanBlock } from './place'
import {
  FPDF_FILLMODE_ALTERNATE,
  FPDF_FONT_TRUETYPE,
  FPDF_TEXTRENDERMODE_FILL_STROKE,
  PageFrame,
  asWritebackPdfium,
  readableInk,
  renderPageBitmap,
  sampleBackground,
  sampleInk,
  saveDocument,
  utf16Ptr,
  type PageBitmap,
  type Rgb,
  type WritebackPdfium,
} from './pdfium'
import {
  DEFAULT_LINE_HEIGHT,
  MIN_FONT_SCALE,
  WritebackEncryptedError,
  type OriginalPage,
  type OriginalPageReason,
  type WritebackOptions,
  type WritebackOverflow,
  type WritebackResult,
  type WritebackSkipReason,
  type WritebackSkippedBlock,
} from './types'

/** OCR reads a ≥3 px/pt render (pdf2docx's recognition scale) */
const OCR_RENDER_SCALE = 3
/** color sampling for searchable scans (invisible text over a page image) */
const SAMPLE_RENDER_SCALE = 2
/** the source objects must carry at least this much of the block's text */
const MIN_TEXT_MATCH = 0.5
/** glyph share of an OCR line box's height, by script (pdf2docx ocr.ts) */
const OCR_SIZE_SHARE_CJK = 0.9
const OCR_SIZE_SHARE_LATIN = 0.72
/** synthetic bold stroke, as a share of the size */
const BOLD_STROKE_EM = 0.03
/** text needing shaping or right-to-left order (Hebrew, Arabic, Indic, …) */
const COMPLEX_SCRIPT =
  /[\u0590-\u08FF\u0900-\u0DFF\u0F00-\u0FFF\u1000-\u109F\u1780-\u17FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u
const CJK = /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/u

// ── units ──

/** what a unit is, for sizing it alike with its kind (decision 0057) */
type Role = 'heading' | 'caption' | 'footnote' | 'text' | 'cell' | 'label'

interface UnitRec {
  unit: TextUnit
  /** the block owning its source objects (the table for a cell) */
  ownerId: string
  isCell: boolean
  regions: BlockRegion[] | undefined
  /** heading or caption: may be centered */
  titleLike: boolean
  role: Role
  marker: string | undefined
  original: string
  /** null: not translated */
  translation: string | null
  bold: boolean
}

function plainText(runs: readonly InlineRun[]): string {
  let s = ''
  for (const r of runs) {
    if (r.kind === 'text') s += r.text
    else if (r.kind === 'footnoteRef') s += r.marker ?? ''
    else if (r.kind === 'math') s += r.latex
    else s += '\n'
  }
  return s
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}

const allBold = (runs: readonly InlineRun[]): boolean => {
  const text = runs.filter((r) => r.kind === 'text' && /\S/u.test(r.text))
  return text.length > 0 && text.every((r) => r.kind === 'text' && r.bold)
}

interface OwnerBlock {
  id: string
  regions: BlockRegion[]
}

interface TreeIndex {
  owners: OwnerBlock[]
  regionsOf: Map<string, BlockRegion[] | undefined>
  titleLike: Set<string>
  roles: Map<string, Role>
  /** a drawing's label → the drawing's place (its picture block's region) */
  figureOf: Map<string, BlockRegion>
  markers: Map<string, string>
  cells: Map<string, CellText[]>
}

function indexTree(tree: DocumentTree): TreeIndex {
  const owners: OwnerBlock[] = []
  const regionsOf = new Map<string, BlockRegion[] | undefined>()
  const titleLike = new Set<string>()
  const roles = new Map<string, Role>()
  const figureOf = new Map<string, BlockRegion>()
  const pictures = new Map<string, BlockRegion>()
  for (const b of tree.blocks) {
    if (b.kind === 'image' && b.regions?.[0]) pictures.set(b.id, b.regions[0])
  }
  const markers = new Map<string, string>()
  const add = (id: string, regions: BlockRegion[] | undefined) => {
    regionsOf.set(id, regions)
    if (regions?.length) owners.push({ id, regions })
  }
  for (const b of tree.blocks) {
    if (b.kind === 'heading' || b.kind === 'paragraph' || b.kind === 'listItem') {
      add(b.id, b.regions)
      if (b.kind === 'heading') {
        titleLike.add(b.id)
        roles.set(b.id, 'heading')
      }
      const figure = b.kind === 'paragraph' && b.figure ? pictures.get(b.figure) : undefined
      if (figure) {
        roles.set(b.id, 'label')
        figureOf.set(b.id, figure)
      }
      if (b.kind === 'listItem' && b.marker) markers.set(b.id, b.marker)
    }
    if (b.kind === 'table') add(b.id, b.regions)
    if ((b.kind === 'image' || b.kind === 'table') && b.caption) {
      add(b.caption.id, b.caption.regions)
      titleLike.add(b.caption.id)
      roles.set(b.caption.id, 'caption')
    }
  }
  // a table paragraph's area: its cell, split between paragraphs halfway across the gaps
  const areas = new Map<string, Rect>()
  for (const b of tree.blocks) {
    if (b.kind !== 'table') continue
    for (const c of b.table.cells) {
      const boxes = c.paragraphBoxes
      if (!c.region || !boxes || boxes.length !== c.paragraphs.length) continue
      const cell = c.region.box
      const cut = (k: number) => (boxes[k - 1]!.y0 + boxes[k]!.y1) / 2
      boxes.forEach((_, k) => {
        areas.set(cellKey(b.id, c.row, c.col, k), {
          x0: cell.x0,
          x1: cell.x1,
          y1: k === 0 ? cell.y1 : cut(k),
          y0: k === boxes.length - 1 ? cell.y0 : cut(k + 1),
        })
      })
    }
  }
  for (const f of tree.footnotes) {
    for (const p of f.blocks) {
      add(p.id, p.regions)
      roles.set(p.id, 'footnote')
    }
  }
  const cells = new Map<string, CellText[]>()
  for (const u of textUnits(tree)) {
    if (!u.key.includes('#')) continue
    const list = cells.get(u.blockId) ?? []
    const area = areas.get(u.key)
    list.push({ key: u.key, text: plainText(u.runs), ...(area ? { area } : {}) })
    cells.set(u.blockId, list)
  }
  return { owners, regionsOf, titleLike, roles, figureOf, markers, cells }
}

/** original unit key → translated runs */
function translatedRuns(translated: DocumentTree, lang: string): Map<string, InlineRun[]> {
  const suffix = `@${lang}`
  const out = new Map<string, InlineRun[]>()
  for (const u of textUnits(translated)) {
    const hash = u.key.indexOf('#')
    const head = hash < 0 ? u.key : u.key.slice(0, hash)
    if (!head.endsWith(suffix)) continue
    out.set(head.slice(0, -suffix.length) + (hash < 0 ? '' : u.key.slice(hash)), u.runs)
  }
  return out
}

// ── reading ──

/** what one block region contributes on its page */
interface Part {
  page: number
  box: Rect
  /** object indices to remove */
  remove: number[]
  /** removed text, reading order (empty for scans) */
  sourceText: string
  paints: { rect: Rect; color: Rgb }[]
  sizes: number[]
  /** display y of each source line, top first */
  lines: number[]
  /** a table paragraph's whole area, for text needing more room than `box` */
  area?: Rect
  color: Rgb
  scan: boolean
}

type PartResult = Part | WritebackSkipReason

interface PageReading {
  kept?: { reason: OriginalPageReason; detail?: string }
  /** what is drawn where, for growing blocks and keeping their ink clear */
  space?: PageSpace
  /** unit key → its parts on this page, in region order */
  parts: Map<string, PartResult[]>
}

interface ReadContext {
  m: WritebackPdfium
  o: WritebackOptions
  index: TreeIndex
  recs: UnitRec[]
  pageInfo: Map<number, PageInfo>
}

/** `r` narrowed to `to` on every side (the block's own text, when stray objects widened it) */
const clip = (r: Rect, to: Rect): Rect => ({
  x0: Math.max(r.x0, to.x0),
  y0: Math.max(r.y0, to.y0),
  x1: Math.min(r.x1, to.x1),
  y1: Math.min(r.y1, to.y1),
})

const ownerKey = (id: string, region: number) => `${id}\u0001${region}`

const unitPages = (r: UnitRec): number[] =>
  r.regions?.length ? [...new Set(r.regions.map((g) => g.page))] : [r.unit.page]

function distinctLines(ys: readonly number[], size: number): number[] {
  const out: number[] = []
  for (const y of [...ys].sort((a, b) => b - a)) {
    if (out.length === 0 || out[out.length - 1]! - y > size * 0.3) out.push(y)
  }
  return out
}

function textPart(
  page: number,
  box: Rect,
  objects: readonly TextObjectInfo[],
  bitmap: () => PageBitmap | null,
  area?: Rect,
): Part {
  const ordered = readingOrder(objects)
  const size = medianOf(objects.map((o) => o.size))
  const scan = objects.every((o) => o.invisible)
  const part: Part = {
    page,
    box,
    remove: objects.map((o) => o.index),
    sourceText: ordered.map((o) => o.text).join(' '),
    paints: [],
    sizes: objects.map((o) => o.size),
    lines: distinctLines(
      objects.flatMap((o) => o.baselines),
      size,
    ),
    color: objects.find((o) => !o.invisible)?.color ?? [0, 0, 0],
    scan: false,
    ...(area ? { area } : {}),
  }
  if (scan) {
    // a searchable scan: the visible text is in the page image below
    const b = bitmap()
    if (b) {
      part.scan = true
      part.paints = objects.map((o) => {
        const rect = expand(o.bounds, Math.max(1, (o.bounds.y1 - o.bounds.y0) * 0.15))
        return { rect, color: sampleBackground(b, rect) }
      })
      part.color = readableInk(
        sampleInk(b, union(objects.map((o) => o.bounds))),
        part.paints[0]!.color,
      )
    }
  }
  return part
}

function readTextPage(
  ctx: ReadContext,
  page: number,
  pageNo: number,
  frame: PageFrame,
  onPage: UnitRec[],
): PageReading {
  const { m, index } = ctx
  const { objects, formChars } = readTextObjects(m, page, frame)
  const owners: Owner[] = []
  for (const ob of index.owners) {
    ob.regions.forEach((r, i) => {
      if (r.page === pageNo) owners.push({ id: ownerKey(ob.id, i), box: r.box })
    })
  }
  const owned = assignObjects(objects, owners)
  const adopted = adoptHyphens(objects, owners, owned)
  let cached: PageBitmap | null | undefined
  const bitmap = () => (cached ??= renderPageBitmap(m, page, frame, SAMPLE_RENDER_SCALE))
  const parts = new Map<string, PartResult[]>()
  const tables = new Map<string, Map<string, CellPlacement | 'shared'>>()

  for (const rec of onPage) {
    const results: PartResult[] = []
    // a block with no measured place cannot be found among the text objects
    if (!rec.regions?.length) results.push('no-position')
    rec.regions?.forEach((region, i) => {
      if (region.page !== pageNo) return
      const owns = owned.get(ownerKey(rec.ownerId, i)) ?? []
      // turned text keeps its block, not its page. A turned object inside an
      // upright block (an arXiv margin stamp the analysis read into the first
      // column) stays as drawn, and the block keeps to its upright text.
      const upright = rec.isCell ? owns : owns.filter((o) => !o.vertical)
      if (owns.length > 0 && upright.length === 0) {
        results.push('vertical-text')
        return
      }
      const objs = upright
      // the analysis may widen a box with chars it read in from elsewhere: keep to the block's own ink
      const box =
        upright.length > 0
          ? clip(region.box, expand(union(upright.map((o) => o.bounds)), 1))
          : region.box
      if (rec.isCell) {
        const key = ownerKey(rec.ownerId, i)
        let placed = tables.get(key)
        if (!placed) {
          const cells = index.cells.get(rec.ownerId) ?? []
          // cells the analysis measured are found by place, AI tables by their text
          placed = cells.every((c): c is CellText & { area: Rect } => c.area !== undefined)
            ? placeCellsByArea(objs, cells as (CellText & { area: Rect })[])
            : placeCells(objs, cells, region.box)
          tables.set(key, placed)
        }
        const cell = placed.get(rec.unit.key)
        if (cell === 'shared') results.push('shared-text-object')
        else if (!cell) results.push('text-not-found')
        else if (cell.objects.some((o) => o.vertical)) results.push('vertical-text')
        else results.push(textPart(pageNo, cell.box, cell.objects, bitmap, cell.area))
        return
      }
      const inForm = formChars.filter((c) => contains(expand(box, 1), c.at))
      // a drawing's label inside an embedded graphic: painted over, then written
      if (objs.length === 0 && inForm.length > 0 && rec.role === 'label') {
        const part = coverPart(pageNo, box, inForm, bitmap)
        results.push(part ?? 'text-in-form')
      } else if (objs.length === 0) results.push('text-not-found')
      else if (inForm.length > 0) results.push('text-in-form')
      else if (!objs.every((o) => adopted.has(o) || mostlyInside(o.bounds, expand(box, 2))))
        results.push('shared-text-object')
      else results.push(textPart(pageNo, box, objs, bitmap))
    })
    parts.set(rec.unit.key, results)
  }
  const text = objects.map((o) => o.bounds)
  const space: PageSpace = {
    text,
    shapes: readShapeBounds(m, page, frame),
    content:
      text.length > 0 ? union(text) : { x0: 0, y0: 0, x1: frame.widthPt, y1: frame.heightPt },
  }
  return { parts, space }
}

/**
 * A label drawn inside a form XObject, which the writeback cannot edit: its
 * box is painted with the background around it and the translation drawn
 * over it, as on a scanned page.
 */
function coverPart(
  pageNo: number,
  box: Rect,
  chars: readonly FormChar[],
  bitmap: () => PageBitmap | null,
): Part | null {
  const b = bitmap()
  if (!b) return null
  const size = medianOf(chars.map((c) => c.size))
  const rect = expand(box, Math.max(0.5, (box.y1 - box.y0) * 0.1))
  const paint = { rect, color: sampleBackground(b, rect) }
  return {
    page: pageNo,
    box,
    remove: [],
    sourceText: '',
    paints: [paint],
    sizes: chars.map((c) => c.size),
    lines: distinctLines(
      chars.map((c) => c.at[1]),
      size,
    ),
    color: readableInk(sampleInk(b, box), paint.color),
    scan: true,
  }
}

function scanPart(
  pageNo: number,
  box: Rect,
  lines: readonly OcrLineBox[],
  original: string,
  b: PageBitmap,
): Part {
  const share = CJK.test(original) ? OCR_SIZE_SHARE_CJK : OCR_SIZE_SHARE_LATIN
  const heights = lines.map((l) => l.box.y1 - l.box.y0)
  const sizes = heights.length > 0 ? heights.map((h) => h * share) : [(box.y1 - box.y0) * share]
  const rects = lines.length > 0 ? lines.map((l) => l.box) : [box]
  const paints = rects.map((r) => {
    const rect = expand(r, Math.max(1, (r.y1 - r.y0) * 0.12))
    return { rect, color: sampleBackground(b, rect) }
  })
  return {
    page: pageNo,
    box,
    remove: [],
    sourceText: '',
    paints,
    sizes,
    lines: lines.map((l) => center(l.box)[1]).sort((a, c) => c - a),
    color: readableInk(sampleInk(b, union(rects)), paints[0]!.color),
    scan: true,
  }
}

function readScannedPage(
  ctx: ReadContext,
  page: number,
  pageNo: number,
  frame: PageFrame,
  onPage: UnitRec[],
  everyOnPage: UnitRec[],
): PageReading {
  const parts = new Map<string, PartResult[]>()
  const engine = ctx.o.ocr
  const b = engine ? renderPageBitmap(ctx.m, page, frame, OCR_RENDER_SCALE) : null
  const lines =
    engine && b ? recognizeLines(engine, encodeRgbaPng(b.rgba, b.width, b.height), frame) : null
  if (!b || !lines) return { kept: { reason: 'ocr-unavailable' }, parts }
  // blocks with no measured place (AI-read) follow the lines in reading order
  const unplaced = everyOnPage.filter((r) => !r.regions?.length)
  const matched = matchLinesToBlocks(
    lines,
    unplaced.map((r) => r.original),
  )
  for (const rec of onPage) {
    if (rec.regions?.length) {
      parts.set(
        rec.unit.key,
        rec.regions
          .filter((g) => g.page === pageNo)
          .map((g) => scanPart(pageNo, g.box, linesInRegion(lines, g.box), rec.original, b)),
      )
      continue
    }
    const mine = matched.get(unplaced.indexOf(rec))
    parts.set(
      rec.unit.key,
      mine
        ? [scanPart(pageNo, union(mine.map((l) => l.box)), mine, rec.original, b)]
        : ['no-position'],
    )
  }
  // the scan's ink is in the page image: blocks keep to their own lines
  return { parts, space: { text: [], shapes: [], content: { x0: 0, y0: 0, x1: 0, y1: 0 } } }
}

function readPages(ctx: ReadContext, pdf: Uint8Array, pages: number[]): Map<number, PageReading> {
  const { m, o, recs } = ctx
  const out = new Map<number, PageReading>()
  withPdfDocument(m, pdf, (doc) => {
    for (const pageNo of pages) {
      checkAbort(o.signal)
      const info = ctx.pageInfo.get(pageNo)
      const status = info?.status ?? 'text'
      const everyOnPage = recs.filter((r) => unitPages(r).includes(pageNo))
      const onPage = everyOnPage.filter((r) => r.translation !== null)
      if (status === 'toc') {
        out.set(pageNo, { kept: { reason: 'toc-page' }, parts: new Map() })
        continue
      }
      if (status === 'degraded') {
        const kept: PageReading['kept'] =
          info?.reason === 'vertical-text'
            ? { reason: 'vertical-text' }
            : { reason: 'not-editable', ...(info?.reason ? { detail: info.reason } : {}) }
        out.set(pageNo, { kept, parts: new Map() })
        continue
      }
      if (status === 'scanned') {
        out.set(pageNo, { kept: { reason: 'scanned-no-text' }, parts: new Map() })
        continue
      }
      if (onPage.length === 0) continue
      const page = m._FPDF_LoadPage(doc, pageNo - 1)
      if (!page) throw new Error(`could not load page ${pageNo}`)
      try {
        const frame = new PageFrame(m, page)
        out.set(
          pageNo,
          status === 'ocr' || status === 'ai'
            ? readScannedPage(ctx, page, pageNo, frame, onPage, everyOnPage)
            : readTextPage(ctx, page, pageNo, frame, onPage),
        )
      } finally {
        m._FPDF_ClosePage(page)
      }
    }
  })
  return out
}

// ── planning ──

interface DrawLine {
  text: string
  x: number
  y: number
  size: number
  color: Rgb
  bold: boolean
  face: number
}

interface PageOps {
  remove: Set<number>
  paints: { rect: Rect; color: Rgb }[]
  lines: DrawLine[]
}

interface Writable {
  rec: UnitRec
  parts: Part[]
  text: string
}

function lineHeightOf(parts: readonly Part[], size: number): number {
  const gaps: number[] = []
  for (const p of parts) {
    for (let i = 1; i < p.lines.length; i++) gaps.push(p.lines[i - 1]! - p.lines[i]!)
  }
  if (gaps.length === 0 || size <= 0) return DEFAULT_LINE_HEIGHT
  return Math.max(1, Math.min(2.5, medianOf(gaps) / size))
}

function alignOf(rec: UnitRec, parts: readonly Part[], pageWidth: (page: number) => number) {
  const p = parts[0]!
  const singleLine = parts.length === 1 && p.lines.length <= 1
  if (!rec.titleLike && !singleLine) return 'left' as const
  const w = pageWidth(p.page)
  const [cx] = center(p.box)
  return Math.abs(cx - w / 2) < w * 0.02 && p.box.x1 - p.box.x0 < w * 0.8
    ? ('center' as const)
    : ('left' as const)
}

// ── entry ──

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason
  if (reason instanceof Error) return reason
  const err = new Error('translated PDF writing aborted')
  err.name = 'AbortError'
  return err
}

function checkAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal)
}

/** page count of the source, refusing encrypted documents */
function openSource(m: WritebackPdfium, pdf: Uint8Array): number {
  try {
    return withPdfDocument(m, pdf, (doc) => {
      if (m._FPDF_GetSecurityHandlerRevision(doc) !== -1) throw new WritebackEncryptedError()
      const count = m._FPDF_GetPageCount(doc)
      if (count <= 0) throw new PdfLoadError('corrupt', 0)
      return count
    })
  } catch (err) {
    if (err instanceof PdfLoadError && err.code === 'password-required') {
      throw new WritebackEncryptedError()
    }
    throw err
  }
}

/**
 * Write the translation into a copy of `pdf`. Throws WritebackEncryptedError
 * for an encrypted source and PdfLoadError when it cannot be opened.
 */
export async function writeTranslatedPdf(
  pdf: Uint8Array,
  o: WritebackOptions,
): Promise<WritebackResult> {
  checkAbort(o.signal)
  const m = asWritebackPdfium(o.pdfium)
  if (o.translated.variant !== 'translated' || !o.translated.targetLanguage) {
    throw new TypeError('`translated` must be a translated tree (buildTranslatedTree)')
  }
  const lang = o.translated.targetLanguage
  const pageCount = openSource(m, pdf)
  if (o.pages) {
    const bad = o.pages.filter((p) => !Number.isInteger(p) || p < 1 || p > pageCount)
    if (bad.length > 0) throw new PageRangeError(pageCount, `page ${bad.join(', ')}`)
  }
  const selected = new Set(o.pages ?? o.tree.pages.map((p) => p.page))

  // units on the chosen pages and their translations
  const index = indexTree(o.tree)
  const translatedRunsOf = translatedRuns(o.translated, lang)
  const recs: UnitRec[] = translationUnits(o.tree, { pages: selected }).map((unit) => {
    const isCell = unit.key.includes('#')
    const ownerId = isCell ? unit.blockId : unit.key
    const runs = translatedRunsOf.get(unit.key)
    const original = plainText(unit.runs)
    let translation = runs ? plainText(runs) : null
    if (translation !== null && (translation === '' || (isCell && translation === original))) {
      translation = null
    }
    return {
      unit,
      ownerId,
      isCell,
      regions: index.regionsOf.get(ownerId),
      titleLike: index.titleLike.has(unit.key),
      role: isCell ? 'cell' : (index.roles.get(unit.key) ?? 'text'),
      marker: index.markers.get(unit.key),
      original,
      translation,
      bold: runs ? allBold(runs) : false,
    }
  })

  // reading: every chosen page plus the pages the chosen blocks run onto
  const pages = [
    ...new Set([...selected, ...recs.filter((r) => r.translation !== null).flatMap(unitPages)]),
  ]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b)
  const pageInfo = new Map(o.tree.pages.map((p) => [p.page, p]))
  const readings = readPages({ m, o, index, recs, pageInfo }, pdf, pages)

  const untranslated: WritebackSkippedBlock[] = []
  const skip = (rec: UnitRec, reason: WritebackSkipReason) =>
    untranslated.push({
      unitKey: rec.unit.key,
      blockId: rec.unit.blockId,
      page: rec.unit.page,
      reason,
    })
  const originalPages: OriginalPage[] = []
  for (const [page, r] of readings) {
    if (r.kept) originalPages.push({ page, ...r.kept })
  }
  const keptPages = new Set(originalPages.map((p) => p.page))

  const writable: Writable[] = []
  for (const rec of recs) {
    if (rec.translation === null) {
      skip(rec, 'not-translated')
      continue
    }
    const onPages = unitPages(rec)
    if (onPages.some((p) => keptPages.has(p))) {
      skip(rec, 'page-kept')
      continue
    }
    if (COMPLEX_SCRIPT.test(rec.translation)) {
      skip(rec, 'script-unsupported')
      continue
    }
    const results = onPages.flatMap((p) => readings.get(p)?.parts.get(rec.unit.key) ?? [])
    const failed = results.find((x): x is WritebackSkipReason => typeof x === 'string')
    if (failed || results.length === 0) {
      skip(rec, failed ?? 'text-not-found')
      continue
    }
    const parts = results as Part[]
    const scanned = parts.every((p) => p.scan)
    const source = parts.map((p) => p.sourceText).join(' ')
    if (
      !scanned &&
      !rec.isCell &&
      similarity(normText(source), normText(rec.original)) < MIN_TEXT_MATCH
    ) {
      skip(rec, 'text-not-found')
      continue
    }
    // a list marker drawn in the block box goes away with it: draw it again
    const marker = rec.marker && normText(source).startsWith(normText(rec.marker)) ? rec.marker : ''
    writable.push({ rec, parts, text: marker ? `${marker} ${rec.translation}` : rec.translation })
  }

  // fonts: one face for everything when one covers it, else per block
  const locate = o.fontLocator ?? defaultWritebackFontLocator
  const faces: Buffer[] = []
  const faceText: string[] = []
  const faceOf = new Map<Writable, number>()
  const faceIndex = (bytes: Buffer): number => {
    let i = faces.indexOf(bytes)
    if (i < 0) {
      i = faces.push(bytes) - 1
      faceText.push('')
    }
    return i
  }
  const allText = [
    ...new Set([
      ...writable
        .map((w) => w.text)
        .join('')
        .replace(/\n/g, ''),
    ]),
  ].join('')
  const shared = allText ? checkedFont(locate(allText, lang), allText) : null
  for (const w of writable) {
    const text = w.text.replace(/\n/g, '')
    const bytes = shared ?? checkedFont(locate(text, lang), text)
    if (!bytes) continue
    const i = faceIndex(bytes)
    faceOf.set(w, i)
    faceText[i] += text
  }
  checkAbort(o.signal)
  const subset = faces.length > 0 ? await createSubsetter(o.hbSubsetWasm) : null
  const embedded: (Buffer | null)[] = faces.map((f, i) => {
    try {
      return subset!(f, [...new Set(faceText[i]! + ' ')].join(''))
    } catch {
      return null
    }
  })
  const metrics = faces.map((f) => new FaceMetrics(f))

  // placement: every block at once, so sizes match and ink stays clear
  const minScale = o.minFontScale ?? MIN_FONT_SCALE
  const ops = new Map<number, PageOps>()
  const opsOf = (page: number): PageOps => {
    let p = ops.get(page)
    if (!p) ops.set(page, (p = { remove: new Set(), paints: [], lines: [] }))
    return p
  }
  const pageWidth = (page: number) => pageInfo.get(page)?.widthPt ?? 612
  const plans: { w: Writable; face: number; plan: PlanBlock }[] = []
  for (const w of writable) {
    const face = faceOf.get(w)
    if (face === undefined || !embedded[face]) {
      skip(w.rec, 'font-missing')
      continue
    }
    const size = medianOf(w.parts.flatMap((p) => p.sizes)) || 10
    const figure = index.figureOf.get(w.rec.unit.key)
    // cells size alike per table, labels per drawing, the rest per role and source size
    const group = w.rec.isCell
      ? `cell:${w.rec.ownerId}`
      : figure
        ? `label:${figure.page}:${figure.box.x0},${figure.box.y1}`
        : `${w.rec.role}:${Math.round(size * 2) / 2}`
    plans.push({
      w,
      face,
      plan: {
        key: w.rec.unit.key,
        text: w.text,
        boxes: w.parts.map((p) => p.box),
        pages: w.parts.map((p) => p.page),
        size,
        lineHeight: lineHeightOf(w.parts, size),
        align: figure ? 'center' : alignOf(w.rec, w.parts, pageWidth),
        font: metrics[face]!,
        group,
        expandable: w.parts.length === 1 && !w.parts[0]!.scan && !w.rec.isCell,
        ...(figure && figure.page === w.parts[0]!.page ? { container: figure.box } : {}),
        ...(w.parts.length === 1 && w.parts[0]!.area ? { alternatives: [[w.parts[0]!.area]] } : {}),
      },
    })
  }
  const spaces = new Map<number, PageSpace>()
  for (const [page, r] of readings) if (r.space) spaces.set(page, r.space)
  const placed = placeBlocks(
    plans.map((p) => p.plan),
    spaces,
    minScale,
  )
  const overflowed: WritebackOverflow[] = []
  let translated = 0
  for (const { w, face, plan } of plans) {
    const at = placed.get(plan.key)
    if (!at) {
      // no room even at the floor size: the source text stays (decision 0057)
      overflowed.push({
        unitKey: w.rec.unit.key,
        blockId: w.rec.unit.blockId,
        page: w.rec.unit.page,
      })
      continue
    }
    for (const p of w.parts) {
      const po = opsOf(p.page)
      for (const i of p.remove) po.remove.add(i)
      po.paints.push(...p.paints)
    }
    for (const line of at.layout.lines) {
      if (!line.text) continue
      const part = w.parts[line.box]!
      opsOf(part.page).lines.push({
        text: line.text,
        x: line.x,
        y: line.y,
        size: at.layout.size,
        color: part.color,
        bold: w.rec.bold,
        face,
      })
    }
    translated++
  }

  const written = writePages(m, pdf, pages, ops, embedded, o)
  checkAbort(o.signal)
  const out = o.bilingual ? writeBilingualPdf(m, pdf, written) : written
  untranslated.sort((a, b) => a.page - b.page)
  return {
    pdf: out,
    report: {
      lang,
      total: recs.length,
      translated,
      overflowed,
      originalPages: originalPages.sort((a, b) => a.page - b.page),
      untranslated,
    },
  }
}

// ── writing ──

function writePages(
  m: WritebackPdfium,
  pdf: Uint8Array,
  pages: number[],
  ops: Map<number, PageOps>,
  embedded: (Buffer | null)[],
  o: WritebackOptions,
): Uint8Array {
  return withPdfDocument(m, pdf, (doc) => {
    const fonts = new Map<number, number>()
    const fontFor = (face: number): number => {
      let font = fonts.get(face)
      if (font === undefined) {
        const bytes = embedded[face]!
        const ptr = m._malloc(bytes.length)
        m.HEAPU8.set(bytes, ptr)
        font = m._FPDFText_LoadFont(doc, ptr, bytes.length, FPDF_FONT_TRUETYPE, 1)
        m._free(ptr)
        if (!font) throw new Error('PDFium could not load the embedded font')
        fonts.set(face, font)
      }
      return font
    }
    let done = 0
    for (const pageNo of pages) {
      checkAbort(o.signal)
      const op = ops.get(pageNo)
      if (op) writePage(m, doc, pageNo, op, fontFor)
      done++
      o.onProgress?.(done, pages.length, pageNo)
    }
    checkAbort(o.signal)
    return saveDocument(m, doc)
  })
}

function writePage(
  m: WritebackPdfium,
  doc: number,
  pageNo: number,
  op: PageOps,
  fontFor: (face: number) => number,
): void {
  const page = m._FPDF_LoadPage(doc, pageNo - 1)
  if (!page) throw new Error(`could not load page ${pageNo}`)
  try {
    const frame = new PageFrame(m, page)
    const handles: number[] = []
    for (let i = 0; i < m._FPDFPage_CountObjects(page); i++)
      handles.push(m._FPDFPage_GetObject(page, i))
    for (const i of op.remove) {
      const obj = handles[i]
      if (obj && m._FPDFPage_RemoveObject(page, obj)) m._FPDFPageObj_Destroy(obj)
    }
    for (const { rect, color } of op.paints) {
      const r = frame.rectToUser(rect)
      const path = m._FPDFPageObj_CreateNewRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)
      if (!path) continue
      m._FPDFPageObj_SetFillColor(path, color[0], color[1], color[2], 255)
      m._FPDFPath_SetDrawMode(path, FPDF_FILLMODE_ALTERNATE, 0)
      m._FPDFPage_InsertObject(page, path)
    }
    const [a, b, c, d] = frame.textAxes()
    const matrix = m._malloc(24)
    try {
      for (const line of op.lines) {
        const obj = m._FPDFPageObj_CreateTextObj(doc, fontFor(line.face), line.size)
        if (!obj) throw new Error('PDFium could not create a text object')
        const text = utf16Ptr(m, line.text)
        const ok = m._FPDFText_SetText(obj, text)
        m._free(text)
        if (!ok) {
          m._FPDFPageObj_Destroy(obj)
          throw new Error('PDFium could not set the translated text')
        }
        const [e, f] = frame.toUser(line.x, line.y)
        m.HEAPF32.set([a, b, c, d, e, f], matrix >> 2)
        m._FPDFPageObj_SetMatrix(obj, matrix)
        const [r, g, bl] = line.color
        m._FPDFPageObj_SetFillColor(obj, r, g, bl, 255)
        if (line.bold) {
          m._FPDFTextObj_SetTextRenderMode(obj, FPDF_TEXTRENDERMODE_FILL_STROKE)
          m._FPDFPageObj_SetStrokeColor(obj, r, g, bl, 255)
          m._FPDFPageObj_SetStrokeWidth(obj, line.size * BOLD_STROKE_EM)
        }
        m._FPDFPage_InsertObject(page, obj)
      }
    } finally {
      m._free(matrix)
    }
    if (!m._FPDFPage_GenerateContent(page)) throw new Error(`could not rewrite page ${pageNo}`)
  } finally {
    m._FPDF_ClosePage(page)
  }
}
