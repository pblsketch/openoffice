import { describe, expect, it } from 'vitest'
import {
  MIN_CELL_SIZE,
  coveringRange,
  equalExtents,
  gridOf,
  moveBoundary,
  moveCellEdge,
  resizeAll,
  resizeLines,
  spanUpdates,
  textLeast,
} from '../studio-plugin/table-sizes.mjs'

/**
 * Row and column sizes in tables with merged cells. The expectations for merged cells follow
 * what Hancom Hangul 2024 wrote for the same keys on 3×3 tables (2026-10-31): a merged cell takes
 * the step for each selected column/row it spans, and stays as it is across a moved boundary.
 */

interface Cell {
  cellIdx: number
  row: number
  col: number
  rowSpan: number
  colSpan: number
  width: number
  height: number
  drawnHeight?: number
}

/**
 * A 3×3 grid of 1000×1000 cells (drawn as stored), with the given merges [row, col, rows, cols];
 * the cells a merge covers are left out, as the engine lists them.
 */
function grid(merges: [number, number, number, number][] = [], size = 1000): Cell[] {
  const covered = new Set<string>()
  const cells: Cell[] = []
  for (const [r, c, rows, cols] of merges) {
    for (let dr = 0; dr < rows; dr += 1) {
      for (let dc = 0; dc < cols; dc += 1) if (dr || dc) covered.add(`${r + dr},${c + dc}`)
    }
  }
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (covered.has(`${row},${col}`)) continue
      const merge = merges.find(([r, c]) => r === row && c === col)
      const rowSpan = merge?.[2] ?? 1
      const colSpan = merge?.[3] ?? 1
      cells.push({
        cellIdx: cells.length,
        row,
        col,
        rowSpan,
        colSpan,
        width: size * colSpan,
        height: size * rowSpan,
        drawnHeight: size * rowSpan,
      })
    }
  }
  return cells
}

/** The updates as "rowcol:delta", for short expectations. */
function changes(
  cells: Cell[],
  updates: { cellIdx: number; widthDelta?: number; heightDelta?: number }[],
) {
  return updates.map((u) => {
    const cell = cells[u.cellIdx]
    return `${cell.row}${cell.col}:${u.widthDelta ?? u.heightDelta}`
  })
}

describe('the grid of a table with merged cells', () => {
  it('reads columns and rows from the cells that span one', () => {
    const cells = grid([[0, 0, 1, 2]])
    cells[2].width = 1500 // (1,0)
    expect(gridOf(cells)).toMatchObject({
      colCount: 3,
      rowCount: 3,
      colWidth: [1500, 1000, 1000],
      rowStored: [1000, 1000, 1000],
    })
  })

  it('gives a merged cell the sum over what it spans', () => {
    const cells = grid([[0, 0, 1, 2]])
    expect(changes(cells, spanUpdates(cells, 'col', [100, 20]))).toEqual([
      '00:120',
      '10:100',
      '11:20',
      '20:100',
      '21:20',
    ])
  })

  it('grows a block over the merged cells it cuts through', () => {
    const cells = grid([
      [0, 0, 1, 2],
      [1, 1, 2, 1],
    ])
    expect(coveringRange(cells, { startRow: 0, startCol: 0, endRow: 0, endCol: 0 })).toEqual({
      startRow: 0,
      startCol: 0,
      endRow: 0,
      endCol: 1,
    })
    // through the first merge into the second, and on
    expect(coveringRange(cells, { startRow: 0, startCol: 1, endRow: 1, endCol: 1 })).toEqual({
      startRow: 0,
      startCol: 0,
      endRow: 2,
      endCol: 1,
    })
  })
})

describe('Ctrl+arrow: the selected columns/rows and the table change size', () => {
  it('widens a column under a merge, the merged cell with it (Hangul: 00 +283, 10 +283, 20 +283)', () => {
    const cells = grid([[0, 0, 1, 2]])
    expect(changes(cells, resizeLines(cells, 'col', 0, 0, 300))).toEqual([
      '00:300',
      '10:300',
      '20:300',
    ])
  })

  it('widens both columns of a merged cell by a step each (Hangul: 00 +566)', () => {
    const cells = grid([[0, 0, 1, 2]])
    expect(changes(cells, resizeLines(cells, 'col', 0, 1, 300))).toEqual([
      '00:600',
      '10:300',
      '11:300',
      '20:300',
      '21:300',
    ])
  })

  it('heightens a row through a cell merged down over it', () => {
    const cells = grid([[1, 2, 2, 1]])
    expect(changes(cells, resizeLines(cells, 'row', 1, 1, 300))).toEqual([
      '10:300',
      '11:300',
      '12:300',
    ])
    expect(changes(cells, resizeLines(cells, 'row', 1, 2, 300))).toEqual([
      '10:300',
      '11:300',
      '12:600',
      '20:300',
      '21:300',
    ])
  })

  it('grows a row from the height its text draws it at, as Hangul does', () => {
    const cells = grid([], 282)
    for (const cell of cells) cell.drawnHeight = 1275
    // 282 stored, 1275 drawn: one press draws it 300 taller
    expect(changes(cells, resizeLines(cells, 'row', 1, 1, 300))).toEqual([
      '10:1293',
      '11:1293',
      '12:1293',
    ])
    // shrinking below the text only lowers what is stored, never raises it
    expect(resizeLines(cells, 'row', 1, 1, -300)).toEqual([])
  })

  it('shrinks only as far as every cell stays at the least size', () => {
    const cells = grid([[0, 0, 1, 2]], 400)
    // the merged cell (800) takes two steps, the single cells (400) one: 400 - 200 = 200 room
    expect(changes(cells, resizeLines(cells, 'col', 0, 1, -300))).toEqual([
      '00:-400',
      '10:-200',
      '11:-200',
      '20:-200',
      '21:-200',
    ])
    const thin = grid([], MIN_CELL_SIZE)
    expect(resizeLines(thin, 'col', 0, 0, -300)).toEqual([])
  })
})

describe('Alt+arrow: the boundary after the block moves, the table keeps its size', () => {
  it('moves the boundary after the last column only', () => {
    const cells = grid()
    expect(changes(cells, moveBoundary(cells, 'col', 0, 300))).toEqual([
      '00:300',
      '01:-300',
      '10:300',
      '11:-300',
      '20:300',
      '21:-300',
    ])
  })

  it('leaves a merged cell across the boundary as it is (Hangul: merged 00 unchanged)', () => {
    const cells = grid([[0, 0, 1, 2]])
    expect(changes(cells, moveBoundary(cells, 'col', 0, 300))).toEqual([
      '10:300',
      '11:-300',
      '20:300',
      '21:-300',
    ])
  })

  it('moves the boundary after a merged block (Hangul: 00 +283, 02 -283, 11 +283, 12 -283)', () => {
    const cells = grid([[0, 0, 1, 2]])
    expect(changes(cells, moveBoundary(cells, 'col', 1, 300))).toEqual([
      '00:300',
      '02:-300',
      '11:300',
      '12:-300',
      '21:300',
      '22:-300',
    ])
  })

  it('does nothing at the table edge, or where the neighbour has no room', () => {
    const cells = grid()
    expect(moveBoundary(cells, 'col', 2, 300)).toEqual([])
    const thin = grid([], MIN_CELL_SIZE)
    expect(moveBoundary(thin, 'col', 0, 300)).toEqual([])
  })

  it('moves a row boundary from the drawn heights', () => {
    const cells = grid([], 282)
    for (const cell of cells) cell.drawnHeight = 1275
    // row 1 draws 300 taller; row 2 cannot draw lower than its text, so its stored minimum
    // stays (the table grows there, as the text asks)
    expect(changes(cells, moveBoundary(cells, 'row', 1, 300))).toEqual([
      '10:1293',
      '11:1293',
      '12:1293',
    ])
  })
})

describe('Shift+arrow on a selected table: every column/row', () => {
  it('widens merged cells by the columns they span', () => {
    const cells = grid([[0, 0, 1, 2]])
    expect(changes(cells, resizeAll(cells, 'col', 300))).toEqual([
      '00:600',
      '02:300',
      '10:300',
      '11:300',
      '12:300',
      '20:300',
      '21:300',
      '22:300',
    ])
  })
})

/** Extents as "rowcol:start-end", for short expectations. */
function places(cells: Cell[], extents: { cellIdx: number; start: number; end: number }[]) {
  return extents.map((e) => {
    const cell = cells[e.cellIdx]
    return `${cell.row}${cell.col}:${e.start}-${e.end}`
  })
}

describe('Ctrl/Alt+arrow on rows: the heights the growing rows should draw at', () => {
  it('names each growing row with its drawn height plus the step, out of sight of toEqual', () => {
    const cells = grid([[1, 2, 2, 1]], 282)
    for (const cell of cells) cell.drawnHeight = 1275 * cell.rowSpan
    const grown = resizeLines(cells, 'row', 1, 1, 300) as ReturnType<typeof resizeLines> & {
      rowTargets?: Map<number, number>
    }
    expect([...(grown.rowTargets ?? [])]).toEqual([[1, 1575]])
    expect(Object.keys(grown)).not.toContain('rowTargets')
    const moved = moveBoundary(cells, 'row', 0, 300) as typeof grown
    expect([...(moved.rowTargets ?? [])]).toEqual([[0, 1575]])
    // a shrinking row is not looked at again
    const shrunk = resizeLines(grid(), 'row', 1, 1, -300) as typeof grown
    expect(shrunk.rowTargets).toBeUndefined()
  })
})

/**
 * H/W as Hancom Hangul 2024 writes them over the whole table (2026-10-31, 3×3 tables, one or two
 * merges): every row's cells (W) or every column's cells (H) come out equally sized, so where
 * rows hold different numbers of cells the grid splits.
 */
describe('H/W: equal cells in each row (W) or column (H)', () => {
  it('splits the columns when the top row merges two cells (Hangul: four columns)', () => {
    const cells = grid([[0, 0, 1, 2]])
    for (const cell of cells) if (cell.col === 0 && cell.colSpan === 1) cell.width = 1600
    cells[0].width = 2600 // the merged cell spans 1600 + 1000
    for (const cell of cells) if (cell.col === 2) cell.width = 1300
    // 3900 wide: the top row's two cells take 1950 each, the other rows' three 1300 each
    expect(places(cells, equalExtents(cells, 'col')!)).toEqual([
      '00:0-1950',
      '02:1950-3900',
      '10:0-1300',
      '11:1300-2600',
      '12:2600-3900',
      '20:0-1300',
      '21:1300-2600',
      '22:2600-3900',
    ])
  })

  it('gives each column the average drawn height, not the tallest', () => {
    const cells = grid([[1, 2, 2, 1]], 282)
    for (const cell of cells) cell.drawnHeight = 1275 * cell.rowSpan
    for (const cell of cells) if (cell.row === 0) cell.drawnHeight = 2000
    // 4550 tall: three cells down the left columns, two down the right one
    expect(places(cells, equalExtents(cells, 'row')!)).toEqual([
      '00:0-1517',
      '01:0-1517',
      '02:0-2275',
      '10:1517-3033',
      '11:1517-3033',
      '12:2275-4550',
      '20:3033-4550',
      '21:3033-4550',
    ])
  })

  it('keeps a line the columns share as one, though each column rounds on its own', () => {
    // Hangul's own case: rows drawn 1282, 1848, 1282 under a top row that merges A and B
    const cells = grid([[0, 0, 1, 2]], 282)
    const drawn = [1282, 1848, 1282]
    for (const cell of cells) cell.drawnHeight = drawn[cell.row]
    expect(places(cells, equalExtents(cells, 'row')!)).toEqual([
      '00:0-1471',
      '02:0-1471',
      '10:1471-2941',
      '11:1471-2941',
      '12:1471-2941',
      '20:2941-4412',
      '21:2941-4412',
      '22:2941-4412',
    ])
  })

  it('grows the table so no cell gets shorter than its text (Hangul: four lines in A1, 6082 each)', () => {
    const cells = grid([], 282)
    for (const cell of cells) cell.drawnHeight = cell.row === 0 ? 6082 : 1282
    // row 0 is held up by its text: three cells down each column must each hold 6082
    expect(textLeast(cells)).toBe(18246)
    const rows = places(cells, equalExtents(cells, 'row', textLeast(cells))!)
    expect(rows.filter((p) => p.endsWith(':0-6082'))).toHaveLength(3)
    expect(rows.filter((p) => p.endsWith(':12164-18246'))).toHaveLength(3)
    // a row drawn at what it stores tells nothing about its text
    const stored = grid([], 1500)
    expect(textLeast(stored)).toBe(0)
  })

  it('writes nothing when the sizes are already equal', () => {
    expect(equalExtents(grid(), 'col')).toEqual([])
    expect(equalExtents(grid([[1, 0, 1, 3]]), 'row')).toEqual([])
  })

  it('cannot place cells whose lines no size tells', () => {
    // one cell merged over columns 0 and 1: where column 1 starts, nothing says
    const [merged] = grid([[0, 0, 1, 2]])
    expect(equalExtents([merged, { ...merged, cellIdx: 1, col: 1, colSpan: 2 }], 'col')).toBeNull()
  })
})

/** Shift+Up/Down on one cell, as Hancom Hangul 2024 writes it (2026-10-31). */
describe('Shift+Up/Down: one cell from the heights the cells draw at', () => {
  const tall = () => {
    // rows store 282 and draw 1282, as an editor's one-line rows do; the right column merges
    // rows 1 and 2
    const cells = grid([[1, 2, 2, 1]], 282)
    for (const cell of cells) cell.drawnHeight = 1282 * cell.rowSpan
    return cells
  }

  it('moves the cell bottom and the top of the cell below, the rows splitting (Hangul: C1 1565, C2:C3 2281)', () => {
    const cells = tall()
    const c1 = cells.find((c) => c.row === 0 && c.col === 2)!
    expect(places(cells, moveCellEdge(cells, c1.cellIdx, 283)!)).toEqual([
      '00:0-1282',
      '01:0-1282',
      '02:0-1565',
      '10:1282-2564',
      '11:1282-2564',
      '12:1565-3846',
      '20:2564-3846',
      '21:2564-3846',
    ])
  })

  it('moves up too, leaving whether the text fits to the drawing', () => {
    const cells = tall()
    const c1 = cells.find((c) => c.row === 0 && c.col === 2)!
    const up = moveCellEdge(cells, c1.cellIdx, -283)!
    expect(places(cells, up).filter((p) => p.startsWith('02') || p.startsWith('12'))).toEqual([
      '02:0-999',
      '12:999-3846',
    ])
  })

  it('refuses the last row, a cell below reaching past the columns, and the least size', () => {
    const cells = tall()
    expect(
      moveCellEdge(cells, cells.find((c) => c.row === 2 && c.col === 0)!.cellIdx, 283),
    ).toBeNull()
    const wide = grid([[2, 1, 1, 2]])
    expect(
      moveCellEdge(wide, wide.find((c) => c.row === 1 && c.col === 1)!.cellIdx, 283),
    ).toBeNull()
    const thin = grid([], MIN_CELL_SIZE)
    expect(moveCellEdge(thin, 0, 283)).toBeNull()
    expect(moveCellEdge(thin, 0, -100)).toBeNull()
  })
})
