import { expect, it, vi } from 'vitest'
import { readSheet } from '../src/formats/xlsx'

vi.mock('../src/resources', async (original) => ({
  ...(await original<object>()),
  xlsxSidecarPath: () => 'fake-sidecar',
}))
vi.mock('../../../apps/sheets/src/main/xlsx-sidecar-client', () => ({
  XlsxSidecarClient: class {
    async open() {
      return {
        sessionId: 'test',
        activeTab: 0,
        sheets: [{ id: '1', name: 'Data', rowCount: 4, columnCount: 3 }],
      }
    }
    async readRange({
      range,
    }: {
      range: { startRow: number; endRow: number; startColumn: number; endColumn: number }
    }) {
      const values = [
        ['Label', 'Count', 'Result'],
        [1, 3, 3],
        ['#N/A', true, 'Tail'],
        [0, null, 2],
      ]
      const cells = values.flatMap((row, r) =>
        row.map((value, column) => ({
          row: r,
          column,
          value,
          ...(column === 2 && (r === 1 || r === 3) ? { formula: '=1+2' } : {}),
        })),
      )
      return {
        indexingComplete: true,
        cells: cells.filter(
          (c) =>
            c.row >= range.startRow &&
            c.row <= range.endRow &&
            c.column >= range.startColumn &&
            c.column <= range.endColumn,
        ),
      }
    }
    async close() {}
    stop() {}
  },
}))

it('counts only column A', async () => {
  const r = await readSheet('fixture.xlsx', { stats: true, cols: 'A' })
  expect(r.stats).toMatchObject({
    nonEmpty: 4,
    numbers: 2,
    errors: 1,
    text: 1,
    booleans: 0,
    formulas: 0,
  })
  expect(r.columns).toEqual(['A'])
})
it('counts only column C including its formulas', async () => {
  const r = await readSheet('fixture.xlsx', { stats: true, cols: 'C' })
  expect(r.stats).toMatchObject({ nonEmpty: 4, numbers: 2, errors: 0, text: 2, formulas: 2 })
})
it('counts disjoint selected columns once', async () => {
  const r = await readSheet('fixture.xlsx', { stats: true, cols: 'A,C,A' })
  expect(r.stats).toMatchObject({
    nonEmpty: 8,
    numbers: 4,
    errors: 1,
    text: 3,
    booleans: 0,
    formulas: 2,
  })
})
it('counts the shown rows and reports their actual scanned bounds', async () => {
  const r = await readSheet('fixture.xlsx', { stats: true, cols: 'B', maxRows: 2 })
  expect(r.stats).toMatchObject({
    nonEmpty: 2,
    numbers: 1,
    text: 1,
    booleans: 0,
    formulas: 0,
    scanned: 'A1:C2',
    rows: 4,
    columns: 3,
  })
  expect(r).toMatchObject({ rowsShown: 2, rowsTotal: 4, truncated: true })
})
it('combines range, column and row limits', async () => {
  const r = await readSheet('fixture.xlsx', { stats: true, range: 'A2:C4', cols: 'C', maxRows: 1 })
  expect(r.stats).toMatchObject({ nonEmpty: 1, numbers: 1, text: 0, formulas: 1, scanned: 'A2:C2' })
})
it('keeps unfiltered workbook dimensions and counts', async () => {
  const r = await readSheet('fixture.xlsx', { stats: true })
  expect(r.stats).toMatchObject({
    nonEmpty: 11,
    numbers: 5,
    errors: 1,
    text: 4,
    booleans: 1,
    formulas: 2,
    scanned: 'A1:C4',
    usedRange: 'A1:C4',
  })
})
it('keeps ordinary row output unchanged', async () => {
  const r = await readSheet('fixture.xlsx', { cols: 'B', maxRows: 2 })
  expect(r.rows).toEqual([['Count'], [3]])
  expect(r.stats).toBeUndefined()
})
it('still refuses columns outside the requested range', async () => {
  await expect(
    readSheet('fixture.xlsx', { stats: true, range: 'A1:B2', cols: 'C' }),
  ).rejects.toMatchObject({ reason: 'out_of_range' })
})
