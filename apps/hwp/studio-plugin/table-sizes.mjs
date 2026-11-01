/**
 * Row and column sizes for the table keys of hancom-keys.mjs, in a table that may hold merged
 * cells. The engine stores a size per cell (`resizeTableCells` changes each cell's own width or
 * height), so a change is planned per grid column or row and every cell takes the sum over the
 * columns/rows it spans. A merged cell across a moved boundary then takes +step and -step, and
 * stays as it is, which is what Hancom Hangul 2024 writes for the same keys (2026-10-31).
 *
 * Heights: a table the editor made stores rows far lower than its text draws them (282 HWPUNIT
 * against about 1,270), and a row draws at the larger of the two. Hangul grows a row by its step
 * from the height it draws at, so a row grows on the first press; the plans here start from the
 * drawn height too. Widths draw as stored.
 *
 * Pure functions; hancom-keys.mjs reads the cells and writes the updates.
 */

/** The engine's least cell width or height (HWPUNIT); it raises anything below it. */
export const MIN_CELL_SIZE = 200

/** HWPUNIT per CSS pixel at 100%, the unit of the engine's cell boxes. */
export const HWPUNIT_PER_PX = 7200 / 96

const spanOf = (cell, axis) => (axis === 'col' ? cell.colSpan : cell.rowSpan)
const startOf = (cell, axis) => (axis === 'col' ? cell.col : cell.row)

/**
 * The table's grid from its cells ({ cellIdx, row, col, rowSpan, colSpan, width, height, and
 * drawnHeight in HWPUNIT when known }): each column's width and each row's stored and drawn height,
 * read from the cells that span that one column/row alone (undefined where every cell spans more).
 */
export function gridOf(cells) {
  const colCount = Math.max(0, ...cells.map((c) => c.col + c.colSpan))
  const rowCount = Math.max(0, ...cells.map((c) => c.row + c.rowSpan))
  const colWidth = Array(colCount).fill(undefined)
  const rowStored = Array(rowCount).fill(undefined)
  const rowDrawn = Array(rowCount).fill(undefined)
  for (const cell of cells) {
    if (cell.colSpan === 1) colWidth[cell.col] = Math.max(colWidth[cell.col] ?? 0, cell.width)
    if (cell.rowSpan === 1) {
      rowStored[cell.row] = Math.max(rowStored[cell.row] ?? 0, cell.height)
      if (Number.isFinite(cell.drawnHeight)) {
        rowDrawn[cell.row] = Math.max(rowDrawn[cell.row] ?? 0, cell.drawnHeight)
      }
    }
  }
  return { colCount, rowCount, colWidth, rowStored, rowDrawn }
}

/** A row's height as it draws: the stored height, or the text's when that is taller. */
export function rowBase(grid, row) {
  const stored = grid.rowStored[row]
  if (stored === undefined) return undefined
  return Math.max(stored, grid.rowDrawn[row] ?? 0)
}

/**
 * The change that brings row `row` to draw at `target`. A row is never stored taller to make it
 * draw lower: its text holds it up, and only the stored minimum can go.
 */
function rowDelta(grid, row, target, growing) {
  const change = Math.max(MIN_CELL_SIZE, target) - grid.rowStored[row]
  return growing ? change : Math.min(0, change)
}

/**
 * The cell updates for per-column (axis 'col') or per-row ('row') changes: `deltas[i]` is the
 * change of column/row i (undefined or 0 leaves it). Each cell takes the sum over what it spans.
 */
export function spanUpdates(cells, axis, deltas) {
  const updates = []
  for (const cell of cells) {
    let change = 0
    for (let i = startOf(cell, axis); i < startOf(cell, axis) + spanOf(cell, axis); i += 1) {
      change += deltas[i] ?? 0
    }
    if (change === 0) continue
    updates.push(
      axis === 'col'
        ? { cellIdx: cell.cellIdx, widthDelta: change }
        : { cellIdx: cell.cellIdx, heightDelta: change },
    )
  }
  return updates
}

/**
 * The deltas made safe: a cell the engine would raise to MIN_CELL_SIZE breaks the sums of the
 * cells beside it, so the whole change is scaled back until every cell stays at least that size.
 * Null when nothing can move.
 */
function withinLimits(cells, axis, deltas) {
  let scale = 1
  for (const cell of cells) {
    let change = 0
    for (let i = startOf(cell, axis); i < startOf(cell, axis) + spanOf(cell, axis); i += 1) {
      change += deltas[i] ?? 0
    }
    if (change >= 0) continue
    const size = axis === 'col' ? cell.width : cell.height
    const room = Math.max(0, size - MIN_CELL_SIZE)
    scale = Math.min(scale, room / -change)
  }
  if (scale <= 0) return null
  if (scale >= 1) return deltas
  return deltas.map((d) => (d === undefined ? d : Math.trunc(d * scale)))
}

/**
 * The updates for safe deltas. A row plan also names the heights its growing rows should draw at
 * (`rowTargets`, row → HWPUNIT, not enumerable): the engine shares a merged cell's text over the
 * rows it spans by its own rule, so hancom-keys.mjs looks once more after drawing and makes up a
 * row that came out short. Not when the plan had to be scaled back to keep the least sizes.
 */
const finish = (cells, axis, deltas, targets) => {
  const safe = withinLimits(cells, axis, deltas)
  if (!safe) return []
  const updates = spanUpdates(cells, axis, safe)
  if (targets?.size && safe === deltas) {
    Object.defineProperty(updates, 'rowTargets', { value: targets, enumerable: false })
  }
  return updates
}

/**
 * Hangul's Ctrl+arrow on a block over columns/rows first..last: each grows (step > 0) or shrinks
 * by the step and the table with them.
 */
export function resizeLines(cells, axis, first, last, step) {
  const grid = gridOf(cells)
  const deltas = []
  const targets = new Map()
  for (let i = first; i <= last; i += 1) {
    if (axis === 'col') {
      if (grid.colWidth[i] !== undefined) deltas[i] = step
    } else {
      const base = rowBase(grid, i)
      if (base === undefined) continue
      deltas[i] = rowDelta(grid, i, base + step, step > 0)
      if (step > 0) targets.set(i, base + step)
    }
  }
  return finish(cells, axis, deltas, axis === 'row' ? targets : undefined)
}

/**
 * Hangul's Alt+arrow on a block whose last column/row is `last`: the boundary after it moves by
 * the step, `last` taking the change and the column/row after it the opposite, so the table keeps
 * its size. A merged cell across the boundary stays as it is. Nothing at the table's edge.
 */
export function moveBoundary(cells, axis, last, step) {
  const grid = gridOf(cells)
  const next = last + 1
  const count = axis === 'col' ? grid.colCount : grid.rowCount
  if (next >= count) return []
  const deltas = []
  if (axis === 'col') {
    if (grid.colWidth[last] === undefined || grid.colWidth[next] === undefined) return []
    deltas[last] = step
    deltas[next] = -step
  } else {
    const before = rowBase(grid, last)
    const after = rowBase(grid, next)
    if (before === undefined || after === undefined) return []
    const moved = Math.min(
      Math.abs(step),
      step > 0 ? after - MIN_CELL_SIZE : before - MIN_CELL_SIZE,
    )
    if (moved <= 0) return []
    const signed = step > 0 ? moved : -moved
    deltas[last] = rowDelta(grid, last, before + signed, signed > 0)
    deltas[next] = rowDelta(grid, next, after - signed, signed < 0)
    const growing = signed > 0 ? [last, before + signed] : [next, after - signed]
    return finish(cells, axis, deltas, new Map([growing]))
  }
  return finish(cells, axis, deltas)
}

/** Shift+arrow on a selected table: every column (or row) grows or shrinks by the step. */
export function resizeAll(cells, axis, step) {
  const grid = gridOf(cells)
  return resizeLines(cells, axis, 0, (axis === 'col' ? grid.colCount : grid.rowCount) - 1, step)
}

/**
 * Each cell's start and end along an axis (HWPUNIT from the table's edge), from the cells' sizes:
 * every grid line is the end of a cell that starts on the line before it. For heights the size is
 * the drawn height (`drawnHeight`, falling back to the stored one). Null when a line cannot be told.
 */
export function cellExtents(cells, axis) {
  const startOf = (c) => (axis === 'col' ? c.col : c.row)
  const spanOf = (c) => (axis === 'col' ? c.colSpan : c.rowSpan)
  const sizeOf = (c) => (axis === 'col' ? c.width : (c.drawnHeight ?? c.height))
  const count = Math.max(0, ...cells.map((c) => startOf(c) + spanOf(c)))
  const lines = Array(count + 1).fill(undefined)
  lines[0] = 0
  const ordered = [...cells].sort((a, b) => spanOf(a) - spanOf(b) || startOf(a) - startOf(b))
  for (let grown = true; grown;) {
    grown = false
    for (const cell of ordered) {
      const s = startOf(cell)
      const e = s + spanOf(cell)
      if (lines[s] !== undefined && lines[e] === undefined) {
        lines[e] = lines[s] + sizeOf(cell)
        grown = true
      } else if (lines[s] === undefined && lines[e] !== undefined) {
        lines[s] = lines[e] - sizeOf(cell)
        grown = true
      }
    }
  }
  if (lines.some((line) => line === undefined)) return null
  return cells.map((c) => [lines[startOf(c)], lines[startOf(c) + spanOf(c)]])
}

/**
 * Hangul's W and H (셀 너비를 같게, 셀 높이를 같게) over the whole table, as Hancom Hangul 2024
 * writes them (2026-10-31): W makes the cells that lie in each row equally wide across the row,
 * H the cells that lie in each column equally tall down the column, from the heights they draw at
 * (so H gives every row the average height, not the tallest). Where rows hold different numbers
 * of cells the boundaries no longer line up and the grid splits, as in Hangul (a 3×3 table whose
 * top row merges A and B gets four columns). A cell spanning several rows (for W) takes its place
 * from the first of them; the cells of a later row share what is left around it.
 *
 * Hangul never leaves a cell shorter than its text: with four lines in one cell H gives every row
 * the height of those four lines. `least` is that: the table's size at the least, for a caller
 * that has seen a cell draw taller than its share.
 *
 * The cells' new starts and ends ([{ cellIdx, start, end }]) for the engine's setTableCellExtents,
 * [] when nothing changes, null when the cells cannot be placed.
 */
export function equalExtents(cells, axis, least = 0) {
  const extents = cellExtents(cells, axis)
  if (!extents) return null
  const cross = axis === 'col' ? 'row' : 'col'
  const crossStart = (c) => c[cross]
  const crossSpan = (c) => (cross === 'row' ? c.rowSpan : c.colSpan)
  const lineCount = Math.max(0, ...cells.map((c) => crossStart(c) + crossSpan(c)))
  const total = Math.max(least, ...extents.map(([, e]) => e))
  const placed = new Map()
  for (let line = 0; line < lineCount; line += 1) {
    const members = cells
      .map((cell, i) => ({ cell, i, start: extents[i][0] }))
      .filter(({ cell }) => line >= crossStart(cell) && line < crossStart(cell) + crossSpan(cell))
      .sort((a, b) => a.start - b.start)
    // runs of cells not yet placed, each sharing the room between the placed cells around it
    let from = 0
    let run = []
    const share = (to) => {
      const room = to - from
      run.forEach(({ i }, k) => {
        const start = from + Math.round((room * k) / run.length)
        const end = from + Math.round((room * (k + 1)) / run.length)
        placed.set(i, [start, end])
      })
      run = []
    }
    for (const member of members) {
      const fixed = placed.get(member.i)
      if (!fixed) {
        run.push(member)
        continue
      }
      share(fixed[0])
      from = fixed[1]
    }
    share(total)
  }
  // sharing rounds each run on its own, so one boundary can come out a unit apart in two lines;
  // boundaries closer than half a pixel are the same line
  const raw = cells.map((cell, i) => placed.get(i) ?? extents[i])
  const snapped = new Map()
  let line
  for (const value of [...new Set(raw.flat())].sort((a, b) => a - b)) {
    if (line === undefined || value - line >= HWPUNIT_PER_PX / 2) line = value
    snapped.set(value, line)
  }
  const next = raw.map(([start, end]) => [snapped.get(start), snapped.get(end)])
  const moved = next.some(
    ([start, end], i) =>
      Math.abs(start - extents[i][0]) >= HWPUNIT_PER_PX / 2 ||
      Math.abs(end - extents[i][1]) >= HWPUNIT_PER_PX / 2,
  )
  if (!moved) return []
  return cells.map((cell, i) => ({ cellIdx: cell.cellIdx, start: next[i][0], end: next[i][1] }))
}

/**
 * After H, the table height at which every cell's equal share holds its text: a cell that draws
 * taller than it stores is held up by its text, and its column shares the table among as many
 * cells as lie in it. 0 when every cell draws at the size it stores.
 */
export function textLeast(cells) {
  let least = 0
  for (const cell of cells) {
    if (cell.drawnHeight === undefined || cell.drawnHeight - cell.height < HWPUNIT_PER_PX / 2) {
      continue
    }
    const sharing = cells.filter(
      (other) => other.col <= cell.col && cell.col < other.col + other.colSpan,
    ).length
    least = Math.max(least, cell.drawnHeight * sharing)
  }
  return least
}

/**
 * Hangul's Shift+↑/↓ on one cell, as Hancom Hangul 2024 writes it (2026-10-31): the cell's
 * bottom moves by `step` from the height it draws at, and the cells right below it, within its
 * columns, move their top with it; the cells beside it stay, so the rows split. The engine's own
 * resizeTableCell works from the stored heights (282 against about 1,282 drawn), which put a cell
 * next to one merged down over several rows on the wrong rows.
 *
 * Every cell's start and end ([{ cellIdx, start, end }]) for setTableCellExtents, or null where
 * Hangul refuses: the last row (nothing below gives way), a cell below reaching past the cell's
 * columns, or a cell that would get smaller than the least size. Whether the text still fits is
 * for the caller to see after drawing, as Hangul also refuses that.
 */
export function moveCellEdge(cells, cellIdx, step) {
  const extents = cellExtents(cells, 'row')
  const active = cells.findIndex((cell) => cell.cellIdx === cellIdx)
  if (!extents || active < 0) return null
  const cell = cells[active]
  const edge = extents[active][1]
  const first = cell.col
  const last = cell.col + cell.colSpan - 1
  const below = []
  for (let i = 0; i < cells.length; i += 1) {
    const other = cells[i]
    if (Math.abs(extents[i][0] - edge) >= HWPUNIT_PER_PX / 2) continue
    const otherLast = other.col + other.colSpan - 1
    if (otherLast < first || other.col > last) continue
    if (other.col < first || otherLast > last) return null
    below.push(i)
  }
  if (below.length === 0) return null
  const next = extents.map(([start, end]) => [start, end])
  next[active][1] = edge + step
  for (const i of below) next[i][0] = edge + step
  if (next.some(([start, end]) => end - start < MIN_CELL_SIZE)) return null
  return cells.map((c, i) => ({ cellIdx: c.cellIdx, start: next[i][0], end: next[i][1] }))
}

/**
 * A block's range grown over the merged cells it cuts through, so it names the columns and rows
 * its cells really span (a block on a cell merged over two columns covers both).
 */
export function coveringRange(cells, range) {
  let { startRow, startCol, endRow, endCol } = range
  for (let grown = true; grown;) {
    grown = false
    for (const cell of cells) {
      const lastRow = cell.row + cell.rowSpan - 1
      const lastCol = cell.col + cell.colSpan - 1
      const overlaps =
        cell.row <= endRow && lastRow >= startRow && cell.col <= endCol && lastCol >= startCol
      if (!overlaps) continue
      if (cell.row < startRow || lastRow > endRow || cell.col < startCol || lastCol > endCol) {
        startRow = Math.min(startRow, cell.row)
        endRow = Math.max(endRow, lastRow)
        startCol = Math.min(startCol, cell.col)
        endCol = Math.max(endCol, lastCol)
        grown = true
      }
    }
  }
  return { startRow, startCol, endRow, endCol }
}
