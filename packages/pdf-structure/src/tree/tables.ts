/**
 * One table shape for both sources: IR tables (docx-style gridSpan + vMerge
 * placeholders) and HTML tables from AI reading (rowspan / colspan with
 * covered positions omitted).
 */
import type { TableBlock as IrTableBlock } from '../../../pdf2docx/src/ir'
import { unionBox } from './draft'
import type { InlineRun, Rect, TableCell, TreeTable } from './types'

/** one HTML-style cell as written in its row (covered positions omitted) */
export interface SpanCellInput {
  rowSpan?: number
  colSpan?: number
  header?: boolean
  paragraphs: InlineRun[][]
}

const span = (n: number | undefined): number =>
  n !== undefined && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1

/**
 * HTML table model: each row lists only the cells that start in it; a cell
 * takes the first grid column not covered by a rowspan from above.
 */
export function tableFromSpans(rows: SpanCellInput[][]): TreeTable {
  const covered: boolean[][] = []
  const isCovered = (r: number, c: number): boolean => covered[r]?.[c] === true
  const cover = (r: number, c: number): void => {
    ;(covered[r] ??= [])[c] = true
  }
  const cells: TableCell[] = []
  let colCount = 0
  rows.forEach((row, r) => {
    let c = 0
    for (const input of row) {
      while (isCovered(r, c)) c++
      const rowSpan = Math.min(span(input.rowSpan), rows.length - r)
      const colSpan = span(input.colSpan)
      for (let dr = 0; dr < rowSpan; dr++) {
        for (let dc = 0; dc < colSpan; dc++) cover(r + dr, c + dc)
      }
      const cell: TableCell = { row: r, col: c, rowSpan, colSpan, paragraphs: input.paragraphs }
      if (input.header) cell.header = true
      cells.push(cell)
      c += colSpan
      colCount = Math.max(colCount, c)
    }
    colCount = Math.max(colCount, (covered[r] ?? []).length)
  })
  return { rowCount: rows.length, colCount, cells }
}

/**
 * IR table → TreeTable. Every IR row covers all grid columns via gridSpan;
 * `vMerge: 'continue'` cells are placeholders that extend the restart cell
 * above them in the same column.
 */
export function tableFromIr(
  table: IrTableBlock,
  cellParagraphs: (
    blocks: IrTableBlock['rows'][number][number]['blocks'],
  ) => { runs: InlineRun[]; box: Rect }[],
  /** 1-based original page: cells then carry their place */
  page?: number,
): TreeTable {
  const cells: TableCell[] = []
  /** grid column → the cell currently open for vertical merging */
  const openByCol = new Map<number, TableCell>()
  let colCount = table.colWidthsPt.length
  table.rows.forEach((row, r) => {
    let c = 0
    for (const irCell of row) {
      const colSpan = Math.max(1, irCell.gridSpan)
      if (irCell.vMerge === 'continue') {
        const open = openByCol.get(c)
        if (open && open.colSpan === colSpan) {
          open.rowSpan++
          if (open.region) open.region.box = unionBox([open.region.box, irCell.box])
          c += colSpan
          continue
        }
      }
      const paragraphs = cellParagraphs(irCell.blocks)
      const cell: TableCell = {
        row: r,
        col: c,
        rowSpan: 1,
        colSpan,
        paragraphs: paragraphs.map((p) => p.runs),
      }
      if (page !== undefined) {
        cell.region = { page, box: { ...irCell.box } }
        cell.paragraphBoxes = paragraphs.map((p) => ({ ...p.box }))
      }
      cells.push(cell)
      if (irCell.vMerge === 'restart') openByCol.set(c, cell)
      else openByCol.delete(c)
      c += colSpan
    }
    colCount = Math.max(colCount, c)
  })
  return { rowCount: table.rows.length, colCount, cells }
}
