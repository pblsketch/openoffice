/**
 * What an editor reports about an open document, and nothing more. Every judgement about
 * those facts lives in `audit.ts`, so the checks can be tested without an editor.
 *
 * An editor fills this in from what it can read. Anything it cannot read is left out
 * rather than guessed: a missing field makes the matching rule skip that place, and a
 * missing list makes it skip the whole check.
 */

/** One step of the table-in-table path the HWP editor uses to address a cell. */
export type CellStep = {
  controlIndex: number
  cellIndex: number
  cellParaIndex?: number
}

/** Where something sits, in the editor's own numbering. */
export type Anchor = {
  /** the section (HWP) the paragraph belongs to; 0 when the format has no sections */
  section?: number
  /** paragraph number inside the section (HWP) or top-level block index (docx) */
  para: number
  /** the cells a paragraph sits in, outermost first */
  path?: readonly CellStep[]
}

/** One character shape the document actually uses. */
export type CharShapeUse = {
  /** the editor's shape id; only used to group uses, never shown */
  id: string
  /** every font name the shape names, in the engine's language order: Hangul first */
  fonts: readonly string[]
  /** how many paragraphs use it (0 = defined but unused) */
  uses: number
  /** the first paragraph that uses it, when the editor tracked one */
  first?: Anchor
}

/** One paragraph of the document, reduced to what the checks need. */
export type ParagraphInfo = {
  index: number
  /** the section the paragraph belongs to; absent means 0 */
  section?: number
  /** the text, with runs of spaces collapsed by the editor */
  text: string
  /** set when the paragraph sits in a table cell */
  path?: readonly CellStep[]
}

/** One cell of a table, at the grid position its top-left corner occupies. */
export type TableCell = {
  /** 0-based row of the cell's top-left corner */
  row: number
  /** 0-based column of the cell's top-left corner */
  col: number
  /** rows the cell covers; omitted means 1 */
  rowSpan?: number
  /** columns the cell covers; omitted means 1 */
  colSpan?: number
  /** the cell's text, shortened by the editor */
  text?: string
}

/** One table of the document. */
export type TableInfo = {
  /** position in reading order, 0-based; nested tables follow the table that holds them */
  index: number
  /** the paragraph that holds the table */
  anchor: Anchor
  rows: number
  cols: number
  /**
   * The closest text above the table's top edge, skipping empty paragraphs: the text
   * before the table in its own paragraph, or the nearest non-empty paragraph above.
   * Empty string when there is none. Empty lines between a title and its table are
   * ordinary in Korean reports, so skipping them keeps the check from crying wolf.
   */
  titleAbove: string
  /** a table inside one of this table's cells */
  nested?: boolean
  /** omitted when the editor could not read the cells; the merge rule skips it then */
  cells?: readonly TableCell[]
}

/** One picture of the document, by the position it is anchored at. */
export type PictureInfo = {
  index: number
  anchor: Anchor
  /** as `TableInfo.titleAbove` */
  titleAbove: string
}

export type DocumentProfile = {
  format: 'hwp' | 'hwpx' | 'docx' | 'odt'
  /** true when the editor stopped at a cap, so the result covers part of the document */
  truncated?: boolean
  charShapes: readonly CharShapeUse[]
  paragraphs: readonly ParagraphInfo[]
  tables: readonly TableInfo[]
  pictures: readonly PictureInfo[]
}
