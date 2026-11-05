import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readSheet } from '../src/formats/xlsx'

const native = vi.hoisted(() => ({ open: vi.fn(), read: vi.fn(), close: vi.fn() }))
vi.mock('../src/resources', async (original) => ({
  ...(await original<typeof import('../src/resources')>()),
  xlsxSidecarPath: () => 'mock-sidecar',
}))
vi.mock('../../../apps/sheets/src/main/xlsx-sidecar-client', () => ({
  XlsxSidecarClient: class {
    open = native.open
    readRange = native.read
    close = native.close
    stop() {}
  },
}))
beforeEach(() => {
  native.open.mockReset().mockResolvedValue({
    sessionId: 'session',
    activeTab: 0,
    sheets: [{ id: '1', name: 'Data', rowCount: 2, columnCount: 2 }],
  })
  native.close.mockReset().mockResolvedValue(undefined)
  native.read.mockReset().mockImplementation(async ({ range }) => ({
    cells: [
      { row: 0, column: 0, value: 1 },
      { row: 0, column: 1, value: 2 },
      { row: 1, column: 0, value: 3 },
      { row: 1, column: 1, value: 4 },
    ].filter(
      (cell) =>
        cell.row >= range.startRow &&
        cell.row <= range.endRow &&
        cell.column >= range.startColumn &&
        cell.column <= range.endColumn,
    ),
  }))
})
describe('sheet read requires both range endpoints', () => {
  it.each(['', 'A1:', 'B2:', 'XFD1048576:', ':B2', ':', 'A1::B2', 'A1:B2:'])(
    'rejects the incomplete range %j',
    async (range) => {
      await expect(readSheet('unused.xlsx', { range })).rejects.toMatchObject({
        reason: 'invalid_argument',
      })
      expect(native.read).not.toHaveBeenCalled()
    },
  )
  it('still reads the used area when no range is supplied', async () => {
    const result = await readSheet('unused.xlsx', {})
    expect(result.range).toBe('A1:B2')
    expect(result.rows).toEqual([
      [1, 2],
      [3, 4],
    ])
  })
  it('keeps a single-cell address valid', async () => {
    const result = await readSheet('unused.xlsx', { range: 'B2' })
    expect(result.range).toBe('B2:B2')
    expect(result.rows).toEqual([[4]])
  })
  it.each(['A1:B2', 'B2:A1'])('normalizes the complete range %s', async (range) => {
    const result = await readSheet('unused.xlsx', { range })
    expect(result.range).toBe('A1:B2')
    expect(result.rows).toEqual([
      [1, 2],
      [3, 4],
    ])
  })
})
