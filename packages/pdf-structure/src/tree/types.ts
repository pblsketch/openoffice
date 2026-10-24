/**
 * Document tree: the reflowable structure every pdf-structure output reads
 * (Markdown, EPUB, AI reading, translation, the result store). One flat,
 * reading-order block list with page-boundary markers, plus document-level
 * footnotes, outline and printed-TOC entries.
 *
 * Coordinates (block regions) are PDF points in page space, origin
 * bottom-left, y up — the same space as the pdf2docx IR.
 */
import type { Rect } from '../../../pdf2docx/src/geometry'

export type { Rect }

// ── inline content ──

/** plain text with the marks the IR carries (bold / italic / link) */
export interface TextRun {
  kind: 'text'
  text: string
  bold?: true
  italic?: true
  /** URI, or `#page=N` (1-based original page) for an in-document link */
  href?: string
}

/** body marker of a footnote; `id` matches a FootnoteDef.id in the tree */
export interface FootnoteRefRun {
  kind: 'footnoteRef'
  id: string
  /** marker as printed in the source ("3"), when known */
  marker?: string
}

/** inline formula (only AI-read pages produce these) */
export interface MathRun {
  kind: 'math'
  latex: string
}

/** intentional line break inside one paragraph */
export interface LineBreakRun {
  kind: 'lineBreak'
}

export type InlineRun = TextRun | FootnoteRefRun | MathRun | LineBreakRun

// ── blocks ──

/** where (part of) a block sits on an original page */
export interface BlockRegion {
  /** 1-based page number in the ORIGINAL document */
  page: number
  box: Rect
}

/** where a block's content came from */
export type BlockSource = 'pdf' | 'ocr' | 'ai'

export interface BlockBase {
  /** unique inside one tree: `p{page}.{n}`; translated copies `${id}@${lang}` */
  id: string
  /** 1-based page number in the ORIGINAL document where the block starts */
  page: number
  /** fingerprint of that start page (see PageInfo.fingerprint) */
  pageFingerprint: string
  /**
   * placement on the source pages, one entry per page the block touches
   * (a paragraph joined across a page boundary has two). Absent when the
   * block has no measured position (AI-read pages).
   */
  regions?: BlockRegion[]
  source: BlockSource
  /**
   * translated / bilingual trees: id of the original block this one
   * translates. Absent on original blocks.
   */
  translationOf?: string
  /** BCP-47-ish language tag of a translated block's text */
  lang?: string
}

/** how a heading's level was decided (spec §1 priority order) */
export type HeadingLevelSource = 'bookmark' | 'toc' | 'font' | 'ai'

export interface HeadingBlock extends BlockBase {
  kind: 'heading'
  level: 1 | 2 | 3 | 4 | 5 | 6
  levelSource: HeadingLevelSource
  runs: InlineRun[]
}

export interface ParagraphBlock extends BlockBase {
  kind: 'paragraph'
  runs: InlineRun[]
  /**
   * a label of a drawing (decision 0057): the id of the image block that
   * pictures the drawing. Translated in place in a translated PDF; left out
   * of reflowed outputs, where the picture shows it.
   */
  figure?: string
}

export interface ListItemBlock extends BlockBase {
  kind: 'listItem'
  ordered: boolean
  /** nesting level, 0-based */
  level: number
  /** original marker text ("•", "3.", "(a)"), already stripped from `runs` */
  marker?: string
  runs: InlineRun[]
}

/** caption bound to an image or table (removed from the body flow) */
export interface CaptionBlock extends BlockBase {
  kind: 'caption'
  /** where the caption sat relative to its image/table in the source */
  position: 'above' | 'below'
  runs: InlineRun[]
}

/**
 * One table cell. Shared by IR tables (gridSpan / vMerge) and HTML tables
 * returned by AI reading (rowspan / colspan): covered positions have no cell.
 */
export interface TableCell {
  /** 0-based grid row / column of the cell's top-left position */
  row: number
  col: number
  rowSpan: number
  colSpan: number
  /** header cell (`<th>`); IR tables never set it */
  header?: true
  /** cell paragraphs; translation unit = one cell */
  paragraphs: InlineRun[][]
  /**
   * where the cell sits, merged extent included (tables the PDF analysis
   * found; AI-read tables have none)
   */
  region?: BlockRegion
  /** the box of each paragraph, in `paragraphs` order (with `region`) */
  paragraphBoxes?: Rect[]
}

export interface TreeTable {
  rowCount: number
  colCount: number
  /** row-major, anchor cells only (covered positions are absent) */
  cells: TableCell[]
}

export interface TableBlock extends BlockBase {
  kind: 'table'
  table: TreeTable
  caption?: CaptionBlock
}

export interface ImageBlock extends BlockBase {
  kind: 'image'
  data: Uint8Array
  mime: 'image/png' | 'image/jpeg'
  pixelWidth: number
  pixelHeight: number
  /** displayed size on the source page, points */
  widthPt: number
  heightPt: number
  caption?: CaptionBlock
  /** bilingual trees only: the caption's translation (the image is not repeated) */
  captionTranslation?: CaptionBlock
  /** AI-read pages only: a figure placeholder with no bytes yet */
  placeholder?: true
}

/** display formula (AI-read pages only) */
export interface MathBlock extends BlockBase {
  kind: 'math'
  latex: string
}

/** a page kept as one picture: scanned, or degraded to protect fidelity */
export interface PageImageBlock extends BlockBase {
  kind: 'pageImage'
  reason: 'scanned' | 'degraded'
  /** degrade reason from the IR ('bad-tounicode', 'low-confidence', …) */
  detail?: string
  data: Uint8Array
  mime: 'image/png'
  pixelWidth: number
  pixelHeight: number
  widthPt: number
  heightPt: number
}

/** start of an original page in the reading flow */
export interface PageBreakBlock extends BlockBase {
  kind: 'pageBreak'
}

export type TreeBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListItemBlock
  | TableBlock
  | ImageBlock
  | MathBlock
  | PageImageBlock
  | PageBreakBlock

/** blocks whose text a translation replaces (captions ride on their host) */
export type TextBearingBlock = HeadingBlock | ParagraphBlock | ListItemBlock | CaptionBlock

// ── document-level parts ──

export interface FootnoteDef {
  /** matches FootnoteRefRun.id */
  id: string
  marker?: string
  /** page of the note text */
  page: number
  pageFingerprint: string
  /** note paragraphs (each a translation unit) */
  blocks: ParagraphBlock[]
}

export interface DocumentInfo {
  title?: string
  author?: string
  subject?: string
  keywords?: string
}

/** one PDF bookmark, flattened in document order */
export interface OutlineEntry {
  title: string
  /** 1-based nesting depth */
  level: number
  /** 1-based original page it points to; absent when the target is outside the analyzed pages */
  page?: number
}

/** one entry of a printed table of contents */
export interface TocEntry {
  title: string
  /** 1-based level from the entry's indentation */
  level: number
  /** printed page label ("12", "iv") */
  pageLabel: string
  /** page the TOC itself sits on (original numbering) */
  tocPage: number
  /** original page of the heading the entry was matched to, if any */
  targetPage?: number
}

export type PageStatus = 'text' | 'ocr' | 'scanned' | 'degraded' | 'toc' | 'ai'

export interface PageInfo {
  /** 1-based page number in the original document */
  page: number
  /** content hash (text + images); independent of the page's position */
  fingerprint: string
  status: PageStatus
  /** IR degrade reason, when status is 'degraded' */
  reason?: string
  widthPt: number
  heightPt: number
}

export type TreeVariant = 'original' | 'translated' | 'bilingual'

export interface DocumentTree {
  version: 1
  /**
   * original: as extracted. translated: each translated block replaces its
   * original. bilingual: each translated block follows its original block.
   * Translated blocks carry id `${id}@${lang}`, `translationOf` and `lang`
   * (see ./derive.ts); untranslated blocks stay as they were.
   */
  variant: TreeVariant
  /** target language of translated / bilingual trees */
  targetLanguage?: string
  info: DocumentInfo
  /** page count of the whole source document */
  sourcePageCount: number
  /** analyzed pages, in the order they were analyzed */
  pages: PageInfo[]
  blocks: TreeBlock[]
  footnotes: FootnoteDef[]
  outline: OutlineEntry[]
  toc: TocEntry[]
  /** pages carrying a footnote marker or note that could not be linked */
  footnoteLinkFailedPages: number[]
  warnings: string[]
}
