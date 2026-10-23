/**
 * Working representation between the IR and the emitted tree: one draft per
 * IR block, carrying the geometry the structure passes (captions, headings,
 * cross-page joins) need. Drafts are discarded once the tree is emitted.
 */
import type { Rect } from '../../../pdf2docx/src/geometry'
import type {
  ImageBlock as IrImageBlock,
  IrPage,
  Line,
  PageColumn,
  TableBlock as IrTableBlock,
  TextBlock as IrTextBlock,
} from '../../../pdf2docx/src/ir'
import type { BlockSource, HeadingLevelSource } from './types'

/** the lines a text draft holds from one analyzed page */
export interface Segment {
  /** 0-based analyzed page index */
  pageIndex: number
  lines: Line[]
  box: Rect
}

export interface TextDraft {
  kind: 'text'
  pageIndex: number
  source: BlockSource
  ir: IrTextBlock
  /** column the block sits in (layout of multi-column pages) */
  column?: PageColumn
  segments: Segment[]
  role: 'paragraph' | 'heading' | 'listItem' | 'caption' | 'label'
  /** a label's drawing (its ImageDraft's figureKey) */
  figureKey?: string
  headingLevel?: number
  levelSource?: HeadingLevelSource
  /** printed-TOC line kept in the body (non-TOC page): its page label */
  tocLabel?: string
}

export interface ImageDraft {
  kind: 'image'
  pageIndex: number
  source: BlockSource
  ir: IrImageBlock
  /** a picture of a drawing the labels with this key belong to */
  figureKey?: string
  caption?: { draft: TextDraft; position: 'above' | 'below' }
}

export interface TableDraft {
  kind: 'table'
  pageIndex: number
  source: BlockSource
  ir: IrTableBlock
  caption?: { draft: TextDraft; position: 'above' | 'below' }
}

export interface PageImageDraft {
  kind: 'pageImage'
  pageIndex: number
  source: BlockSource
  page: IrPage
}

export type Draft = TextDraft | ImageDraft | TableDraft | PageImageDraft

export const allLines = (d: TextDraft): Line[] => d.segments.flatMap((s) => s.lines)

export const draftBox = (d: Draft): Rect =>
  d.kind === 'text' ? d.ir.box : d.kind === 'pageImage' ? fullPage(d.page) : d.ir.box

const fullPage = (p: IrPage): Rect => ({ x0: 0, y0: 0, x1: p.widthPt, y1: p.heightPt })

export function unionBox(boxes: Rect[]): Rect {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const b of boxes) {
    if (b.x0 < x0) x0 = b.x0
    if (b.y0 < y0) y0 = b.y0
    if (b.x1 > x1) x1 = b.x1
    if (b.y1 > y1) y1 = b.y1
  }
  return { x0, y0, x1, y1 }
}

/** the largest span font size of a line (the stitch pass's measure) */
export const lineFontSize = (line: Line): number =>
  line.spans.reduce((max, s) => Math.max(max, s.fontSize), 1)

export const lineWidth = (line: Line): number => line.box.x1 - line.box.x0

/** char-weighted font size and bold share of a run of lines */
export function textStyle(lines: Line[]): { size: number; bold: boolean; chars: number } {
  const bySize = new Map<number, number>()
  let chars = 0
  let boldChars = 0
  for (const line of lines) {
    for (const span of line.spans) {
      const n = span.text.replace(/\s+/g, '').length
      if (n === 0) continue
      const key = Math.round(span.fontSize * 2) / 2
      bySize.set(key, (bySize.get(key) ?? 0) + n)
      chars += n
      if (span.bold) boldChars += n
    }
  }
  let size = 0
  let best = -1
  for (const [s, n] of bySize) {
    if (n > best || (n === best && s > size)) {
      size = s
      best = n
    }
  }
  return { size, bold: chars > 0 && boldChars === chars, chars }
}
