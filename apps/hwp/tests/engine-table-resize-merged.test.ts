/**
 * The table size keys on tables with merged cells, through the real engine: the plans of
 * studio-plugin/table-sizes.mjs keep every row and column of the drawn table lined up, and the
 * same after saving as HWP and HWPX and opening again. H/W and Shift+Up/Down place the cells
 * with the engine's setTableCellExtents (vendor/rhwp-core patch 0027); a row a merged cell's
 * text stretches is looked at again after drawing (hancom-keys.mjs settleRows).
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { settleRows } from '../studio-plugin/hancom-keys.mjs'
import {
  HWPUNIT_PER_PX,
  equalExtents,
  moveBoundary,
  moveCellEdge,
  textLeast,
  resizeAll,
  resizeLines,
} from '../studio-plugin/table-sizes.mjs'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

type Merge = [number, number, number, number]

/** A 3×3 table with text in every cell, merged as given ([startRow, startCol, endRow, endCol]). */
function table(merges: Merge[]): HwpDocument {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  doc.splitParagraph(0, 0, 0)
  const rows = ['A', 'B', 'C']
    .map((r) => `<tr>${[1, 2, 3].map((c) => `<td>${r}${c}</td>`).join('')}</tr>`)
    .join('')
  doc.pasteHtml(0, 1, 0, `<table>${rows}</table>`)
  for (const m of merges) expect(JSON.parse(doc.mergeTableCells(0, 1, 0, ...m)).ok).toBe(true)
  return doc
}

interface Box {
  cellIdx: number
  row: number
  col: number
  rowSpan?: number
  colSpan?: number
  x: number
  y: number
  w: number
  h: number
}

const boxesOf = (doc: HwpDocument): Box[] => JSON.parse(doc.getTableCellBboxes(0, 1, 0))

function cellsOf(doc: HwpDocument) {
  const dims = JSON.parse(doc.getTableDimensions(0, 1, 0))
  const drawn = new Map<number, number>()
  for (const box of boxesOf(doc)) {
    drawn.set(box.cellIdx, (drawn.get(box.cellIdx) ?? 0) + box.h * HWPUNIT_PER_PX)
  }
  return Array.from({ length: dims.cellCount }, (_, i) => {
    const info = JSON.parse(doc.getCellInfo(0, 1, 0, i))
    const props = JSON.parse(doc.getCellProperties(0, 1, 0, i))
    return {
      cellIdx: i,
      row: info.row,
      col: info.col,
      rowSpan: info.rowSpan,
      colSpan: info.colSpan,
      width: props.width,
      height: props.height,
      drawnHeight: Math.round(drawn.get(i) ?? 0),
    }
  })
}

/**
 * The drawn table is a proper grid: every grid line a cell starts or ends on is shared by the
 * cells beside it, so no cell sticks out or leaves a gap. Returned as the column and row lines.
 */
function gridLines(doc: HwpDocument) {
  const cells = cellsOf(doc)
  const boxes = boxesOf(doc)
  const near = (a: number, b: number) => Math.abs(a - b) < 0.6
  const cols: number[] = []
  const rows: number[] = []
  for (const cell of cells) {
    const box = boxes.find((b) => b.cellIdx === cell.cellIdx)!
    const lines: [number[], number, number][] = [
      [cols, cell.col, box.x],
      [cols, cell.col + cell.colSpan, box.x + box.w],
      [rows, cell.row, box.y],
      [rows, cell.row + cell.rowSpan, box.y + box.h],
    ]
    for (const [list, index, at] of lines) {
      if (list[index] === undefined) list[index] = at
      else expect(near(list[index], at), `line ${index} of cell ${cell.row},${cell.col}`).toBe(true)
    }
  }
  return {
    cols: cols.map((x) => Math.round(x * 10) / 10),
    rows: rows.map((y) => Math.round(y * 10) / 10),
  }
}

/** The engine as the studio's bridge answers (parsed), for hancom-keys.mjs. */
const bridgeOf = (doc: HwpDocument) => ({
  getTableDimensions: (sec: number, ppi: number, ci: number) =>
    JSON.parse(doc.getTableDimensions(sec, ppi, ci)),
  getCellInfo: (sec: number, ppi: number, ci: number, i: number) =>
    JSON.parse(doc.getCellInfo(sec, ppi, ci, i)),
  getCellProperties: (sec: number, ppi: number, ci: number, i: number) =>
    JSON.parse(doc.getCellProperties(sec, ppi, ci, i)),
  getTableCellBboxes: (sec: number, ppi: number, ci: number) =>
    JSON.parse(doc.getTableCellBboxes(sec, ppi, ci)),
  setTableCellExtents: (sec: number, ppi: number, ci: number, vertical: boolean, e: unknown[]) =>
    JSON.parse(doc.setTableCellExtents(sec, ppi, ci, vertical, JSON.stringify(e))),
})

/** The grid now and after saving both ways must be the same proper grid. */
function savedAlike(doc: HwpDocument) {
  const lines = gridLines(doc)
  for (const saved of [new HwpDocument(doc.exportHwp()), new HwpDocument(doc.exportHwpx())]) {
    expect(gridLines(saved)).toEqual(lines)
  }
  return lines
}

/** Apply a plan as the app does (with the look after drawing), then check the grid. */
function apply(doc: HwpDocument, updates: unknown[]) {
  expect(updates.length).toBeGreaterThan(0)
  const before = cellsOf(doc)
  expect(JSON.parse(doc.resizeTableCells(0, 1, 0, JSON.stringify(updates))).ok).toBe(true)
  const targets = (updates as { rowTargets?: Map<number, number> }).rowTargets
  if (targets) {
    expect(
      settleRows(bridgeOf(doc), { sec: 0, ppi: 1, ci: 0 }, before, targets, updates as never[]),
    ).toBe(true)
  }
  return savedAlike(doc)
}

/**
 * Place cells as H/W and Shift+Up/Down do. The engine lists the cells again row by row, so the
 * sizes are compared as a whole: the cells draw at the sizes asked.
 */
function place(
  doc: HwpDocument,
  axis: 'row' | 'col',
  extents: { cellIdx: number; start: number; end: number }[],
) {
  expect(extents.length).toBeGreaterThan(0)
  const vertical = axis === 'row'
  expect(JSON.parse(doc.setTableCellExtents(0, 1, 0, vertical, JSON.stringify(extents))).ok).toBe(
    true,
  )
  const asked = extents.map(({ start, end }) => end - start).sort((a, b) => a - b)
  const drawn = boxesOf(doc)
    .map((box) => (vertical ? box.h : box.w) * HWPUNIT_PER_PX)
    .sort((a, b) => a - b)
  expect(drawn.length).toBe(asked.length)
  drawn.forEach((size, i) => {
    expect(size).toBeCloseTo(asked[i], -2)
  })
  return savedAlike(doc)
}

/**
 * H as the app does it: equal shares, and once more with the table grown where a cell's text
 * needs more than its share (the merged cells here hold two lines).
 */
function equalHeights(doc: HwpDocument) {
  const first = equalExtents(cellsOf(doc), 'row')!
  expect(JSON.parse(doc.setTableCellExtents(0, 1, 0, true, JSON.stringify(first))).ok).toBe(true)
  // as applyCellExtents does: again until no cell draws taller than its share
  for (let pass = 0; pass < 8; pass += 1) {
    const least = textLeast(cellsOf(doc))
    const again = least ? equalExtents(cellsOf(doc), 'row', least)! : []
    if (!again.length) break
    expect(JSON.parse(doc.setTableCellExtents(0, 1, 0, true, JSON.stringify(again))).ok).toBe(true)
  }
  // no cell draws taller than it stores: every share holds its text
  for (const cell of cellsOf(doc)) {
    expect(cell.drawnHeight - cell.height).toBeLessThan(HWPUNIT_PER_PX / 2)
  }
  return savedAlike(doc)
}

const LAYOUTS: Record<string, Merge[]> = {
  'merged across the top': [[0, 0, 0, 1]],
  'merged down the right': [[1, 2, 2, 2]],
  both: [
    [0, 0, 0, 1],
    [1, 2, 2, 2],
  ],
  'merged 2×2': [[0, 0, 1, 1]],
}

describe('H with a cell whose text needs more than its share', () => {
  it('gives every row the height of that text, as Hangul 2024 does (four lines in A1: 6082 each)', () => {
    const doc = table([])
    // four lines in A1: the engine splits the paragraph at the cell's end, three times
    for (let k = 0; k < 3; k += 1) {
      const info = JSON.parse(doc.getCellInfo(0, 1, 0, 0))
      expect(info.row).toBe(0)
      doc.splitParagraphInCell(0, 1, 0, 0, k, 2)
    }
    const lines = cellsOf(doc)[0].drawnHeight
    expect(lines).toBeGreaterThan(4 * 1200)
    equalHeights(doc)
    for (const cell of cellsOf(doc)) expect(cell.drawnHeight).toBeCloseTo(lines, -2)
  })
})

describe('table size keys on merged tables, through the engine', () => {
  for (const [name, merges] of Object.entries(LAYOUTS)) {
    it(`Ctrl+arrow widens and heightens lines (${name})`, () => {
      const doc = table(merges)
      const before = gridLines(doc)
      const after = apply(doc, resizeLines(cellsOf(doc), 'col', 0, 0, 300))
      expect(after.cols[1] - after.cols[0]).toBeCloseTo(before.cols[1] - before.cols[0] + 4, 0)
      // every row, also one a merged cell's text stretches, grows by the step and the other
      // rows keep their heights (the engine alone spread the stored growth over every row)
      for (const row of [0, 1, 2]) {
        const was = gridLines(doc)
        const taller = apply(doc, resizeLines(cellsOf(doc), 'row', row, row, 300))
        for (const other of [0, 1, 2]) {
          expect(
            taller.rows[other + 1] - taller.rows[other],
            `row ${other} after ${row}`,
          ).toBeCloseTo(was.rows[other + 1] - was.rows[other] + (other === row ? 4 : 0), 0)
        }
      }
    })

    it(`Alt+arrow moves one boundary and keeps the table size (${name})`, () => {
      const doc = table(merges)
      const before = gridLines(doc)
      const after = apply(doc, moveBoundary(cellsOf(doc), 'col', 0, 300))
      expect(after.cols[3] - after.cols[0]).toBeCloseTo(before.cols[3] - before.cols[0], 0)
      expect(after.cols[1]).toBeCloseTo(before.cols[1] + 4, 0)
      // a row boundary (Alt+Down, and the Alt drag): the first row draws taller and the last
      // row, which the boundary does not touch, keeps its height
      const rows = gridLines(doc).rows
      const lower = apply(doc, moveBoundary(cellsOf(doc), 'row', 0, 300))
      expect(lower.rows[1] - lower.rows[0]).toBeCloseTo(rows[1] - rows[0] + 4, 0)
      expect(lower.rows[3] - lower.rows[2]).toBeCloseTo(rows[3] - rows[2], 0)
    })

    it(`Shift+arrow on the table and H/W keep the grid (${name})`, () => {
      const doc = table(merges)
      apply(doc, resizeAll(cellsOf(doc), 'col', 300))
      apply(doc, resizeLines(cellsOf(doc), 'col', 0, 0, 900))
      const wide = savedAlike(doc).cols
      place(doc, 'col', equalExtents(cellsOf(doc), 'col')!)
      // the table keeps its width
      const even = gridLines(doc).cols
      expect(even[even.length - 1] - even[0]).toBeCloseTo(wide[wide.length - 1] - wide[0], 0)
      apply(doc, resizeLines(cellsOf(doc), 'row', 0, 0, 900))
      equalHeights(doc)
    })

    it(`Shift+Up/Down moves one cell from its drawn height (${name})`, () => {
      const doc = table(merges)
      apply(doc, resizeLines(cellsOf(doc), 'row', 0, 2, 900))
      const cells = cellsOf(doc)
      const first = cells.find((c) => c.row === 0)!
      const down = moveCellEdge(cells, first.cellIdx, 283)!
      place(doc, 'row', down)
      // the engine numbers the cells again; the moved cell keeps its row and column
      const after = cellsOf(doc).find((c) => c.row === first.row && c.col === first.col)!
      expect(after.drawnHeight).toBeCloseTo(first.drawnHeight + 283, -2)
    })
  }
})
