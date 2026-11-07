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
import { equalizeTableCells, hancomCommands, settleRows } from '../studio-plugin/hancom-keys.mjs'
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

/**
 * H/W on a block through the key's own path (equalizeTableCells), in a snapshot the engine runs:
 * what the editor's cell block hands the module, with the excluded cells it keeps.
 */
function keyOn(holder: { doc: HwpDocument }, range: Range, excluded: string[] = []) {
  const bridge = {
    ...bridgeOf(holder.doc),
    getTableDimensions: (s: number, p: number, c: number) =>
      JSON.parse(holder.doc.getTableDimensions(s, p, c)),
    getCellInfo: (s: number, p: number, c: number, i: number) =>
      JSON.parse(holder.doc.getCellInfo(s, p, c, i)),
    getCellProperties: (s: number, p: number, c: number, i: number) =>
      JSON.parse(holder.doc.getCellProperties(s, p, c, i)),
    getTableCellBboxes: (s: number, p: number, c: number) =>
      JSON.parse(holder.doc.getTableCellBboxes(s, p, c)),
    setTableCellExtents: (s: number, p: number, c: number, v: boolean, e: unknown[]) =>
      JSON.parse(holder.doc.setTableCellExtents(s, p, c, v, JSON.stringify(e))),
  }
  const ih = {
    cursor: {
      isInCellSelectionMode: () => true,
      getCellTableContext: () => ({ sec: 0, ppi: 1, ci: 0 }),
      getSelectedCellRange: () => range,
      getExcludedCells: () => new Set(excluded),
    },
    getCursorPosition: () => ({
      sectionIndex: 0,
      paragraphIndex: 0,
      charOffset: 0,
      parentParaIndex: 1,
      controlIndex: 0,
      cellIndex: 0,
      cellParaIndex: 0,
    }),
    // the editor's snapshot: an operation that throws puts the document back
    executeOperation: ({ operation }: { operation: (b: typeof bridge) => unknown }) => {
      const saved = holder.doc.exportHwp()
      try {
        operation(bridge)
      } catch (e) {
        holder.doc = new HwpDocument(saved)
        throw e
      }
    },
    updateCellSelection: () => {},
  }
  return { getInputHandler: () => ih, wasm: bridge }
}

type Range = { startRow: number; startCol: number; endRow: number; endCol: number }

/** Every cell as it stores itself: place, span and size. */
const stored = (doc: HwpDocument) =>
  cellsOf(doc).map((c) => `${c.row},${c.col}/${c.rowSpan}x${c.colSpan}:w${c.width},h${c.height}`)

/** The widths each row's cells store, left to right. */
const widthsByRow = (doc: HwpDocument) => {
  const rows: Record<number, number[]> = {}
  for (const cell of [...cellsOf(doc)].sort((a, b) => a.row - b.row || a.col - b.col)) {
    ;(rows[cell.row] ??= []).push(cell.width)
  }
  return rows
}

/**
 * A 3×3 table whose rows are split as the given column boundaries say (each row its own, so
 * the grid splits), saved as HWP and read again so it is what a file holds.
 */
function splitRows(bounds: number[][]): HwpDocument {
  const doc = table([])
  const cells = cellsOf(doc)
  const plan = cells.map((c) => ({
    cellIdx: c.cellIdx,
    start: bounds[c.row][c.col],
    end: bounds[c.row][c.col + 1],
  }))
  expect(JSON.parse(doc.setTableCellExtents(0, 1, 0, false, JSON.stringify(plan))).ok).toBe(true)
  return new HwpDocument(doc.exportHwp())
}

/** The block from the first to the second cell of row 0, as the studio names it. */
function firstTwoOfTopRow(doc: HwpDocument): Range {
  const top = cellsOf(doc)
    .filter((c) => c.row === 0)
    .sort((a, b) => a.col - b.col)
  return { startRow: 0, startCol: top[0].col, endRow: 0, endCol: top[1].col }
}

describe('H/W on part of the table, through the key (issue #299)', () => {
  beforeAll(() => {
    hancomCommands('ko', { showToast: ({ message }: { message: string }) => toasts.push(message) })
  })
  const toasts: string[] = []

  it('W on two cells of the top row makes them equal and leaves the rest', () => {
    const W = cellsOf(table([]))[0].width
    const holder = { doc: splitRows([0, 1, 2].map(() => [0, W - 1500, 2 * W, 3 * W])) }
    const top = cellsOf(holder.doc).filter((c) => c.row === 0)
    expect(top.map((c) => c.width)).toEqual([W - 1500, W + 1500, W])
    const before = widthsByRow(holder.doc)
    expect(equalizeTableCells(keyOn(holder, firstTwoOfTopRow(holder.doc)), 'width', true)).toBe(
      true,
    )
    const after = widthsByRow(holder.doc)
    expect(after[0]).toEqual([W, W, W])
    expect(after[1]).toEqual(before[1])
    expect(after[2]).toEqual(before[2])
    savedAlike(holder.doc)
  })

  for (const off of [1, 20, 37]) {
    it(`W keeps a row outside the block that lies ${off} HU off the block's lines, saved too`, () => {
      // row 0 unequal (the block), row 1 on the grid, row 2 a little off it: the half-pixel
      // snapping of the block's lines once pulled row 2 onto row 1 (F1 of the review)
      const W = cellsOf(table([]))[0].width
      const holder = {
        doc: splitRows([
          [0, W - 1500, 2 * W, 3 * W],
          [0, W, 2 * W, 3 * W],
          [0, W + off, 2 * W, 3 * W],
        ]),
      }
      const before = widthsByRow(holder.doc)
      expect(equalizeTableCells(keyOn(holder, firstTwoOfTopRow(holder.doc)), 'width', true)).toBe(
        true,
      )
      for (const saved of [
        holder.doc,
        new HwpDocument(holder.doc.exportHwp()),
        new HwpDocument(holder.doc.exportHwpx()),
      ]) {
        const rows = widthsByRow(saved)
        expect(rows[0]).toEqual([W, W, W])
        expect(rows[1]).toEqual(before[1])
        expect(rows[2]).toEqual(before[2])
      }
    })
  }

  it('W on two merged cells chosen whole shares their width (B1:B2 and C1:C2)', () => {
    const holder = {
      doc: table([
        [0, 1, 1, 1],
        [0, 2, 1, 2],
      ]),
    }
    apply(holder.doc, resizeLines(cellsOf(holder.doc), 'col', 1, 1, 1500))
    const merged = () => cellsOf(holder.doc).filter((c) => c.rowSpan === 2)
    const before = merged()
    expect(before.map((c) => c.width)).not.toEqual([before[0].width, before[0].width])
    // the others keep what they store; where the merged cells' line moves the grid splits, so
    // their columns are numbered again
    const sizes = () =>
      stored(holder.doc)
        .filter((s) => !s.includes('/2x'))
        .map((s) => `${s.split(',')[0]}:${s.split(':')[1]}`)
    const outside = sizes()
    // the studio reads B1 to C1 as row 0 only
    expect(
      equalizeTableCells(
        keyOn(holder, { startRow: 0, startCol: 1, endRow: 0, endCol: 2 }),
        'width',
        true,
      ),
    ).toBe(true)
    const after = merged()
    expect(after[0].width).toBe(after[1].width)
    expect(after[0].width + after[1].width).toBe(before[0].width + before[1].width)
    expect(sizes()).toEqual(outside)
    savedAlike(holder.doc)
  })

  it('H on A1:A2 shares their height and leaves every other cell as it stores (F2)', () => {
    // A1 two thousand taller: B1 and C1 draw at its height but store their own
    const holder = { doc: table([]) }
    expect(
      JSON.parse(
        holder.doc.resizeTableCells(0, 1, 0, JSON.stringify([{ cellIdx: 0, heightDelta: 2000 }])),
      ).ok,
    ).toBe(true)
    const before = cellsOf(holder.doc)
    const a1 = before[0]
    const a2 = before.find((c) => c.row === 1 && c.col === 0)!
    expect(a1.height).toBeGreaterThan(a2.height)
    const others = stored(holder.doc).filter((s) => !s.startsWith('0,0/') && !s.startsWith('1,0/'))
    expect(
      equalizeTableCells(
        keyOn(holder, { startRow: 0, startCol: 0, endRow: 1, endCol: 0 }),
        'height',
        true,
      ),
    ).toBe(true)
    const after = cellsOf(holder.doc)
    const column = after.filter((c) => c.col === 0).sort((a, b) => a.row - b.row)
    // A1 and A2 store the same share of what they stored together; A3 is not in the block
    expect(column[0].height).toBe(column[1].height)
    expect(column[0].height + column[1].height).toBe(a1.height + a2.height)
    // B1, C1 (held up by A1) and the rest keep what they store, in the file too
    const keep = (doc: HwpDocument) =>
      cellsOf(doc)
        .filter((c) => c.col > 0 || c.row > 1)
        .map((c) => `w${c.width},h${c.height}`)
        .sort()
    const kept = others.map((s) => s.split(':')[1]).sort()
    expect(keep(holder.doc)).toEqual(kept)
    expect(keep(new HwpDocument(holder.doc.exportHwp()))).toEqual(kept)
    expect(keep(new HwpDocument(holder.doc.exportHwpx()))).toEqual(kept)
  })

  it('H leaves a block alone, saying why, where its rows draw taller than they store', () => {
    // the rows below A1 grow with their text past what they store (as the editor's own tables
    // store 282): placing A2:A3 would mean storing new heights for B2, C2 and the rest
    const holder = { doc: table([]) }
    for (let k = 0; k < 3; k += 1) holder.doc.splitParagraphInCell(0, 1, 0, 4, k, 2)
    const before = stored(holder.doc)
    expect(cellsOf(holder.doc)[4].drawnHeight - cellsOf(holder.doc)[4].height).toBeGreaterThan(
      HWPUNIT_PER_PX,
    )
    toasts.length = 0
    expect(
      equalizeTableCells(
        keyOn(holder, { startRow: 1, startCol: 0, endRow: 2, endCol: 0 }),
        'height',
        true,
      ),
    ).toBe(false)
    expect(toasts.join()).toContain('표 전체를 골라 주세요')
    expect(stored(holder.doc)).toEqual(before)
  })

  it('a Ctrl+click outside the block does not stop it; one inside does (F3)', () => {
    const W = cellsOf(table([]))[0].width
    const make = () => ({ doc: splitRows([0, 1, 2].map(() => [0, W - 1500, 2 * W, 3 * W])) })
    const outside = make()
    const range = firstTwoOfTopRow(outside.doc)
    // the studio keeps a Ctrl+clicked key wherever it was (cursor.ts ctrlToggleCell)
    expect(equalizeTableCells(keyOn(outside, range, ['2,2']), 'width', true)).toBe(true)
    const inside = make()
    toasts.length = 0
    const before = stored(inside.doc)
    expect(
      equalizeTableCells(
        keyOn(inside, range, [`${range.startRow},${range.endCol}`]),
        'width',
        true,
      ),
    ).toBe(false)
    expect(toasts.join()).toContain('빼낸 칸')
    expect(stored(inside.doc)).toEqual(before)
  })
})
