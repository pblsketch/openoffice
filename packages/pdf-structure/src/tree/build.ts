/**
 * IR → document tree. Pure: takes the analyzed pdf2docx IR plus the
 * document-level facts read from PDFium (bookmarks, info, fingerprints) and
 * the page-number map of the analyzed range. Never mutates the IR's text;
 * every structure decision lives in drafts (./draft.ts).
 */
import type { IrDocument } from '../../../pdf2docx/src/pipeline'
import type { IrPage, Line, TextBlock as IrTextBlock } from '../../../pdf2docx/src/ir'
import { bindCaptions } from './captions'
import { lineFontSize, unionBox, type Draft, type ImageDraft, type TextDraft } from './draft'
import type { FigurePlan } from './figures'
import { assignHeadingLevels, type TocTarget } from './headings'
import { lineText, linesToRuns, type RunContext } from './inline'
import type { RawBookmark } from './pdfium-doc'
import { columnOf, joinAcrossPages } from './stitch'
import { tableFromIr } from './tables'
import type {
  BlockBase,
  BlockRegion,
  BlockSource,
  CaptionBlock,
  DocumentInfo,
  DocumentTree,
  FootnoteDef,
  InlineRun,
  OutlineEntry,
  PageInfo,
  PageStatus,
  ParagraphBlock,
  TocEntry,
  TreeBlock,
} from './types'

export interface BuildTreeInput {
  ir: IrDocument
  /** analyzed page index → original 1-based page number */
  pageNumbers: number[]
  /** analyzed page index → fingerprint */
  fingerprints: string[]
  /** outline of the SOURCE document (page indexes in source numbering) */
  bookmarks: RawBookmark[]
  info: DocumentInfo
  sourcePageCount: number
  /** analyzed page index → its drawings (figures.ts); absent = none found */
  figures?: FigurePlan[][]
}

/** a page whose text blocks are at least this share of TOC entries… */
const TOC_PAGE_MIN_SHARE = 0.5
/** …and at least this many entries is a printed table of contents */
const TOC_PAGE_MIN_ENTRIES = 3

/** a stray footnote marker: a 1–3 digit span this much smaller than its line… */
const STRAY_MARKER_SIZE_RATIO = 0.8
/** …raised above the baseline by this share of the line's font size */
const STRAY_MARKER_RAISE_RATIO = 0.12

function isTocPage(page: IrPage): boolean {
  const text = page.blocks.filter((b) => b.kind === 'text')
  const toc = text.filter((b) => b.kind === 'text' && b.tocEntry !== undefined)
  return toc.length >= TOC_PAGE_MIN_ENTRIES && toc.length / text.length >= TOC_PAGE_MIN_SHARE
}

function pageStatus(page: IrPage, toc: boolean): PageStatus {
  if (page.ocrRecovered) return 'ocr'
  if (page.scanned) return 'scanned'
  if (page.degraded) return 'degraded'
  return toc ? 'toc' : 'text'
}

/** lines from `stitchedFromLine` on came from the next analyzed page (IR stitch) */
function segmentsOf(block: IrTextBlock, pageIndex: number): TextDraft['segments'] {
  const split = block.stitchedFromLine
  const boxOf = (lines: Line[]) => unionBox(lines.map((l) => l.box))
  if (split === undefined || split <= 0 || split >= block.lines.length) {
    return [{ pageIndex, lines: block.lines, box: block.box }]
  }
  const own = block.lines.slice(0, split)
  const next = block.lines.slice(split)
  return [
    { pageIndex, lines: own, box: boxOf(own) },
    { pageIndex: pageIndex + 1, lines: next, box: boxOf(next) },
  ]
}

/** a drawing's labels as drafts (they reach the tree as paragraphs marked with the figure) */
function labelDrafts(
  plan: FigurePlan,
  pageIndex: number,
  source: BlockSource,
  key: string,
): TextDraft[] {
  return plan.labels.map((lines) => {
    const box = unionBox(lines.map((l) => l.box))
    return {
      kind: 'text' as const,
      pageIndex,
      source,
      ir: {
        kind: 'text' as const,
        lines,
        box,
        align: 'center' as const,
        firstLineIndentPt: 0,
        dir: 'ltr' as const,
      },
      segments: [{ pageIndex, lines, box }],
      role: 'label' as const,
      figureKey: key,
    }
  })
}

function pageDrafts(
  page: IrPage,
  pageIndex: number,
  toc: boolean,
  figures: readonly FigurePlan[] = [],
): Draft[] {
  const source: BlockSource = page.ocrRecovered ? 'ocr' : 'pdf'
  if ((page.scanned || page.degraded) && !page.ocrRecovered) {
    return page.render ? [{ kind: 'pageImage', pageIndex, source, page }] : []
  }
  if (toc) return []
  const drafts: Draft[] = []
  const placed = new Set<FigurePlan>()
  for (const block of page.blocks) {
    const figure = figures.find((f) => f.blocks.has(block))
    if (figure) {
      // the drawing takes the place of the first block it takes in
      if (placed.has(figure)) continue
      placed.add(figure)
      const key = `${pageIndex}:${figures.indexOf(figure)}`
      const picture: ImageDraft = {
        kind: 'image',
        pageIndex,
        source,
        figureKey: key,
        ir: {
          kind: 'image',
          box: figure.box,
          data: figure.png,
          mime: 'image/png',
          pixelWidth: figure.pixelWidth,
          pixelHeight: figure.pixelHeight,
        },
      }
      drafts.push(picture, ...labelDrafts(figure, pageIndex, source, key))
      continue
    }
    if (block.kind === 'text') {
      if (block.lines.length === 0) continue
      const draft: TextDraft = {
        kind: 'text',
        pageIndex,
        source,
        ir: block,
        column: columnOf(page, block),
        segments: segmentsOf(block, pageIndex),
        role: block.list ? 'listItem' : 'paragraph',
      }
      if (block.tocEntry) draft.tocLabel = block.tocEntry.pageNumber
      drafts.push(draft)
    } else if (block.kind === 'image') {
      // pattern-fill rasters and behind-text wallpapers are decoration
      if (block.synthetic || block.float?.wrap === 'behind') continue
      drafts.push({ kind: 'image', pageIndex, source, ir: block })
    } else {
      drafts.push({ kind: 'table', pageIndex, source, ir: block })
    }
  }
  return drafts
}

/** superscript-looking digits left in the body (no footnote linked them) */
function hasStrayMarker(lines: Line[]): boolean {
  for (const line of lines) {
    const size = lineFontSize(line)
    for (let i = 1; i < line.spans.length; i++) {
      const span = line.spans[i]!
      if (span.noteRef !== undefined || !/^\s*[0-9]{1,3}\s*$/.test(span.text)) continue
      const before = line.spans[i - 1]!.text.trimEnd()
      if (before === '' || /[0-9]$/.test(before)) continue
      if (span.fontSize > STRAY_MARKER_SIZE_RATIO * size) continue
      if (span.box.y0 < line.baseline + STRAY_MARKER_RAISE_RATIO * size) continue
      return true
    }
  }
  return false
}

export function buildDocumentTree(input: BuildTreeInput): DocumentTree {
  const { ir, pageNumbers, fingerprints } = input
  const irPages = ir.irPages
  const pageNumberOf = (pageIndex: number): number => pageNumbers[pageIndex] ?? pageIndex + 1
  const analyzedBySource = new Map<number, number>()
  pageNumbers.forEach((n, i) => analyzedBySource.set(n - 1, i))
  const analyzedIndexOf = (sourceIndex: number): number | undefined =>
    analyzedBySource.get(sourceIndex)

  // ── page classification + printed TOC ──
  const tocPages = irPages.map(isTocPage)
  const tocTargets: TocTarget[] = []
  irPages.forEach((page, pageIndex) => {
    for (const b of page.blocks) {
      if (b.kind !== 'text' || !b.tocEntry) continue
      tocTargets.push({
        title: b.lines.map(lineText).join(' ').trim(),
        level: b.tocEntry.level,
        pageLabel: b.tocEntry.pageNumber,
        tocPageIndex: pageIndex,
      })
    }
  })

  // ── drafts, captions, headings, joins ──
  const pages = irPages.map((page, i) =>
    bindCaptions(pageDrafts(page, i, tocPages[i]!, input.figures?.[i])),
  )
  const textDrafts = pages.flat().filter((d): d is TextDraft => d.kind === 'text')
  assignHeadingLevels(textDrafts, {
    bookmarks: input.bookmarks,
    tocEntries: tocTargets,
    analyzedIndexOf,
    pageNumberOf,
  })
  joinAcrossPages(irPages, pages, (i) => !tocPages[i])

  // ── emission ──
  const blocks: TreeBlock[] = []
  const counters = new Map<number, number>()
  const failedPages = new Set<number>()
  const refPages = new Map<string, number[]>()
  /** a drawing's figureKey → its picture's block id */
  const figureIds = new Map<string, string>()

  const base = (pageIndex: number, source: BlockSource, regions?: BlockRegion[]): BlockBase => {
    const page = pageNumberOf(pageIndex)
    const n = (counters.get(page) ?? 0) + 1
    counters.set(page, n)
    const b: BlockBase = {
      id: `p${page}.${n}`,
      page,
      pageFingerprint: fingerprints[pageIndex] ?? '',
      source,
    }
    if (regions) b.regions = regions
    return b
  }

  const runContext = (pageIndex: number): RunContext => ({
    pageNumberOf: (i) => (i >= 0 && i < pageNumbers.length ? pageNumberOf(i) : undefined),
    onNoteRef: (id) => {
      const list = refPages.get(id) ?? []
      list.push(pageNumberOf(pageIndex))
      refPages.set(id, list)
    },
  })

  const textRuns = (d: TextDraft): InlineRun[] => {
    const lines: Line[] = []
    const seams = new Set<number>()
    for (const [k, seg] of d.segments.entries()) {
      if (k > 0) seams.add(lines.length)
      lines.push(...seg.lines)
    }
    // IR-stitched blocks arrive as two segments too (segmentsOf), so every
    // page seam gets the seam hyphen rule
    const runs = linesToRuns(lines, runContext(d.pageIndex), seams)
    if (d.tocLabel && d.role === 'paragraph') runs.push({ kind: 'text', text: ` ${d.tocLabel}` })
    if (hasStrayMarker(lines)) failedPages.add(pageNumberOf(d.pageIndex))
    return runs
  }

  const regionsOf = (d: TextDraft): BlockRegion[] =>
    d.segments.map((s) => ({ page: pageNumberOf(s.pageIndex), box: s.box }))

  const caption = (
    c: { draft: TextDraft; position: 'above' | 'below' } | undefined,
  ): CaptionBlock | undefined =>
    c && {
      ...base(c.draft.pageIndex, c.draft.source, regionsOf(c.draft)),
      kind: 'caption',
      position: c.position,
      runs: textRuns(c.draft),
    }

  const cellParagraphs = (pageIndex: number) => (cellBlocks: IrTextBlock[]) =>
    cellBlocks
      .map((b) => ({ runs: linesToRuns(b.lines, runContext(pageIndex)), box: b.box }))
      .filter((p) => p.runs.length > 0)

  pages.forEach((drafts, pageIndex) => {
    if (tocPages[pageIndex]) return
    const page = irPages[pageIndex]!
    blocks.push({ ...base(pageIndex, page.ocrRecovered ? 'ocr' : 'pdf'), kind: 'pageBreak' })
    for (const d of drafts) {
      if (d.pageIndex !== pageIndex) continue
      if (d.kind === 'pageImage') {
        const r = d.page.render!
        blocks.push({
          ...base(pageIndex, d.source, [
            {
              page: pageNumberOf(pageIndex),
              box: { x0: 0, y0: 0, x1: page.widthPt, y1: page.heightPt },
            },
          ]),
          kind: 'pageImage',
          reason: page.scanned ? 'scanned' : 'degraded',
          ...(page.degradedReason ? { detail: page.degradedReason } : {}),
          data: r.data,
          mime: r.mime,
          pixelWidth: r.pixelWidth,
          pixelHeight: r.pixelHeight,
          widthPt: page.widthPt,
          heightPt: page.heightPt,
        })
      } else if (d.kind === 'image') {
        const b = d.ir
        const head = base(pageIndex, d.source, [{ page: pageNumberOf(pageIndex), box: b.box }])
        if (d.figureKey) figureIds.set(d.figureKey, head.id)
        const cap = caption(d.caption)
        blocks.push({
          ...head,
          kind: 'image',
          data: b.data,
          mime: b.mime,
          pixelWidth: b.pixelWidth,
          pixelHeight: b.pixelHeight,
          widthPt: b.box.x1 - b.box.x0,
          heightPt: b.box.y1 - b.box.y0,
          ...(cap ? { caption: cap } : {}),
        })
      } else if (d.kind === 'table') {
        const head = base(pageIndex, d.source, [{ page: pageNumberOf(pageIndex), box: d.ir.box }])
        const cap = caption(d.caption)
        blocks.push({
          ...head,
          kind: 'table',
          table: tableFromIr(d.ir, cellParagraphs(pageIndex), pageNumberOf(pageIndex)),
          ...(cap ? { caption: cap } : {}),
        })
      } else {
        const head = base(pageIndex, d.source, regionsOf(d))
        const runs = textRuns(d)
        if (runs.length === 0) continue
        if (d.role === 'heading') {
          blocks.push({
            ...head,
            kind: 'heading',
            level: d.headingLevel as 1 | 2 | 3 | 4 | 5 | 6,
            levelSource: d.levelSource!,
            runs,
          })
        } else if (d.role === 'listItem' && d.ir.list) {
          blocks.push({
            ...head,
            kind: 'listItem',
            ordered: d.ir.list.kind === 'ordered',
            level: d.ir.list.level,
            ...(d.ir.list.marker ? { marker: d.ir.list.marker } : {}),
            runs,
          })
        } else {
          const figure = d.role === 'label' && d.figureKey ? figureIds.get(d.figureKey) : undefined
          blocks.push({ ...head, kind: 'paragraph', runs, ...(figure ? { figure } : {}) })
        }
      }
    }
  })

  // ── footnotes ──
  const footnotes: FootnoteDef[] = []
  irPages.forEach((page, pageIndex) => {
    if (tocPages[pageIndex]) return
    for (const note of page.footnotes ?? []) {
      const pageNo = pageNumberOf(pageIndex)
      const noteBlocks: ParagraphBlock[] = []
      note.blocks.forEach((b, k) => {
        const runs = linesToRuns(b.lines, runContext(pageIndex))
        if (runs.length === 0) return
        noteBlocks.push({
          id: `fn${note.id}.${k + 1}`,
          page: pageNo,
          pageFingerprint: fingerprints[pageIndex] ?? '',
          source: page.ocrRecovered ? 'ocr' : 'pdf',
          regions: [{ page: pageNo, box: b.box }],
          kind: 'paragraph',
          runs,
        })
      })
      footnotes.push({
        id: note.id,
        ...(note.marker ? { marker: note.marker } : {}),
        page: pageNo,
        pageFingerprint: fingerprints[pageIndex] ?? '',
        blocks: noteBlocks,
      })
    }
  })
  const noteIds = new Set(footnotes.map((f) => f.id))
  for (const [id, onPages] of refPages) {
    if (!noteIds.has(id)) for (const p of onPages) failedPages.add(p)
  }
  for (const f of footnotes) if (!refPages.has(f.id)) failedPages.add(f.page)
  // markers carry the printed number when the note knows it
  const markerOf = new Map(footnotes.filter((f) => f.marker).map((f) => [f.id, f.marker!]))
  const addMarkers = (runs: InlineRun[]): void => {
    for (const r of runs)
      if (r.kind === 'footnoteRef' && markerOf.has(r.id)) r.marker = markerOf.get(r.id)!
  }
  for (const b of blocks) {
    if ('runs' in b) addMarkers(b.runs)
    if (b.kind === 'table') for (const c of b.table.cells) c.paragraphs.forEach(addMarkers)
    if ((b.kind === 'image' || b.kind === 'table') && b.caption) addMarkers(b.caption.runs)
  }

  // ── outline, TOC, pages, warnings ──
  const outline: OutlineEntry[] = input.bookmarks.map((bm) => {
    const e: OutlineEntry = { title: bm.title, level: bm.level }
    if (bm.pageIndex >= 0 && analyzedIndexOf(bm.pageIndex) !== undefined) e.page = bm.pageIndex + 1
    return e
  })
  const toc: TocEntry[] = tocTargets.map((t) => ({
    title: t.title,
    level: t.level,
    pageLabel: t.pageLabel,
    tocPage: pageNumberOf(t.tocPageIndex),
    ...(t.targetPageIndex !== undefined ? { targetPage: pageNumberOf(t.targetPageIndex) } : {}),
  }))
  const pageInfos: PageInfo[] = irPages.map((page, i) => ({
    page: pageNumberOf(i),
    fingerprint: fingerprints[i] ?? '',
    status: pageStatus(page, tocPages[i]!),
    ...(page.degraded && page.degradedReason ? { reason: page.degradedReason } : {}),
    widthPt: page.widthPt,
    heightPt: page.heightPt,
  }))
  const warnings = ir.warnings.map((w) =>
    w.replace(/^page (\d+):/, (_, n: string) => `page ${pageNumberOf(Number(n) - 1)}:`),
  )

  return {
    version: 1,
    variant: 'original',
    info: input.info,
    sourcePageCount: input.sourcePageCount,
    pages: pageInfos,
    blocks,
    footnotes,
    outline,
    toc,
    footnoteLinkFailedPages: [...failedPages].sort((a, b) => a - b),
    warnings,
  }
}
