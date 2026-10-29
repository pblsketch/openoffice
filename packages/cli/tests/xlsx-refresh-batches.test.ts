import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { xlsxBufferFromSheets } from '@genoffice/xlsx-gateway/gateway/csv-import'
import { canChangeValues, formulaReadBatches, writeWorkbook } from '../src/formats/xlsx'
import { EMPTY_PAYLOADS } from '../src/formats/xlsx-gateway-ops'

const { recalc } = vi.hoisted(() => ({ recalc: vi.fn() }))
vi.mock('../src/resources', async (original) => ({
  ...(await original<typeof import('../src/resources')>()),
  xlsxSidecarPath: () => 'mock-sidecar',
}))
vi.mock('../../../apps/sheets/src/main/xlsx-sidecar-client', () => ({
  XlsxSidecarClient: class {
    recalcCells = recalc
    stop() {}
  },
}))
const part = 'xl/worksheets/sheet1.xml'
async function refresh(rows: string, formula?: string) {
  const zip = await JSZip.loadAsync(await xlsxBufferFromSheets([{ name: 'Data', rows: [] }]))
  zip.file(
    part,
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
  )
  const path = join(mkdtempSync(join(tmpdir(), 'refresh-batches-')), 'out.xlsx')
  const result = await writeWorkbook(
    await zip.generateAsync({ type: 'nodebuffer' }),
    [
      {
        sheetName: 'Data',
        row: 0,
        column: 2,
        writeValue: true,
        cell: { value: formula ? null : 5, ...(formula ? { formula } : {}) },
      },
    ],
    path,
  )
  return {
    result,
    xml: await (await JSZip.loadAsync(readFileSync(path))).file(part)!.async('string'),
  }
}
const stale = (result: Awaited<ReturnType<typeof writeWorkbook>>) => {
  expect(result.cachedValues).toBe(false)
  expect(result.notes).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'dependent_formulas_not_refreshed' })]),
  )
}
beforeEach(() => {
  recalc.mockReset()
})

describe('formula-only read batching', () => {
  it('reads two cells, not the 27-million-cell bounding box, in one multi-range request', async () => {
    recalc.mockResolvedValue({
      cells: [
        { sheet: 'Data', row: 0, column: 0, number: 10, formatted: '10' },
        { sheet: 'Data', row: 1048575, column: 25, number: 20, formatted: '20' },
        { sheet: 'Data', row: 0, column: 1, number: 999, formatted: '999' },
      ],
    })
    const { result, xml } = await refresh(
      '<row r="1"><c r="A1"><f>C1*2</f><v>1</v></c><c r="B1"><v>123</v></c></row><row r="1048576"><c r="Z1048576"><f>C1*4</f><v>2</v></c></row>',
    )
    expect(result.cachedValues).toBe(true)
    expect(recalc).toHaveBeenCalledTimes(1)
    expect(recalc.mock.calls[0]![0].reads).toEqual([
      { sheet: 'Data', range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 } },
      {
        sheet: 'Data',
        range: { startRow: 1048575, endRow: 1048575, startColumn: 25, endColumn: 25 },
      },
    ])
    expect(xml).toContain('<c r="B1"><v>123</v></c>')
    expect(xml).toContain('<v>20</v>')
  })
  it('groups contiguous rows per column and never reads gaps or more than 20000 cells', () => {
    const cells = Array.from({ length: 50001 }, (_, row) => ({ row, column: 9 }))
    cells.push({ row: 0, column: 0 }, { row: 100, column: 0 }, { row: 0, column: 0 })
    const batches = [...formulaReadBatches(cells)]
    expect(batches).toHaveLength(3)
    expect(batches.flat().reduce((n, r) => n + r.endRow - r.startRow + 1, 0)).toBe(50003)
    for (const ranges of batches) {
      expect(ranges.reduce((n, r) => n + r.endRow - r.startRow + 1, 0)).toBeLessThanOrEqual(20000)
      for (const range of ranges) expect(range.startColumn).toBe(range.endColumn)
    }
    expect(batches[2]!.slice(1)).toEqual([
      { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
      { startRow: 100, endRow: 100, startColumn: 0, endColumn: 0 },
    ])
  })
  it('retains boolean, empty-string and shared-formula caches without a native binary', async () => {
    recalc.mockResolvedValue({
      cells: [
        { sheet: 'Data', row: 0, column: 0, formatted: 'FALSE' },
        { sheet: 'Data', row: 0, column: 1, formatted: '' },
        { sheet: 'Data', row: 1, column: 0, formatted: '10', number: 10 },
        { sheet: 'Data', row: 2, column: 0, formatted: '15', number: 15 },
      ],
    })
    const { result, xml } = await refresh(
      '<row r="1"><c r="A1" t="b"><f>C1&lt;0</f><v>1</v></c><c r="B1" t="str"><f>IF(C1,"","")</f><v>old</v></c></row><row r="2"><c r="A2"><f t="shared" si="0" ref="A2:A3">C1*2</f><v>1</v></c></row><row r="3"><c r="A3"><f t="shared" si="0"/><v>1</v></c></row>',
    )
    expect(result.cachedValues).toBe(true)
    expect(xml).toContain('t="b"><f>C1&lt;0</f><v>0</v>')
    expect(xml).toContain('t="str"><f>IF(C1,"","")</f><v></v>')
    expect(xml).toContain('<f t="shared" si="0" ref="A2:A3">C1*2</f><v>10</v>')
    expect(xml).toContain('<f t="shared" si="0"/><v>15</v>')
  })
  it.each(['#NAME?', '#ERROR!'])(
    'reports partial refresh as cached_values false for %s',
    async (formatted) => {
      recalc.mockResolvedValue({
        cells: [
          { sheet: 'Data', row: 0, column: 0, formatted, isError: true },
          { sheet: 'Data', row: 0, column: 1, formatted: '10', number: 10 },
        ],
      })
      const { result, xml } = await refresh(
        '<row r="1"><c r="A1"><f>MISSING(C1)</f><v>99</v></c><c r="B1"><f>C1*2</f><v>1</v></c></row>',
      )
      stale(result)
      expect(xml).toContain('<f>MISSING(C1)</f><v>99</v>')
      expect(xml).toContain('<f>C1*2</f><v>10</v>')
    },
  )
  it('does not treat a function name inside a string literal as locale-dependent', async () => {
    recalc.mockResolvedValue({
      cells: [{ sheet: 'Data', row: 0, column: 0, formatted: 'DOLLAR(C1)' }],
    })
    const { result } = await refresh(
      '<row r="1"><c r="A1" t="str"><f>&quot;DOLLAR(C1)&quot;</f><v>old</v></c></row>',
    )
    expect(result.cachedValues).toBe(true)
    expect(recalc).toHaveBeenCalledTimes(1)
  })
  it('reports a failed import only as stale dependents when no formula was written', async () => {
    recalc.mockRejectedValue(new Error('unsupported workbook'))
    const { result } = await refresh('<row r="1"><c r="A1"><f>C1*2</f><v>1</v></c></row>')
    stale(result)
    expect(result.warning).toBeUndefined()
  })
  it('marks missing results stale instead of claiming complete refresh', async () => {
    recalc.mockResolvedValue({ cells: [] })
    stale((await refresh('<row r="1"><c r="A1"><f>C1*2</f><v>1</v></c></row>')).result)
  })
  it.each(['DOLLAR(C1)', 'NUMBERSTRING(C1,1)', '_xlfn.DOLLAR(C1)'])(
    'preserves the locale-dependent cache of %s',
    async (formula) => {
      const cell = `<c r="A1" t="str"><f>${formula}</f><v>₩1,000</v></c>`
      const { result, xml } = await refresh(`<row r="1">${cell}</row>`)
      stale(result)
      expect(recalc).not.toHaveBeenCalled()
      expect(xml).toContain(cell)
    },
  )
  it('preserves shared followers of a locale-dependent master', async () => {
    const rows =
      '<row r="1"><c r="A1" t="str"><f t="shared" si="0" ref="A1:A2">DOLLAR(C1)</f><v>₩1,000</v></c></row><row r="2"><c r="A2" t="str"><f t="shared" si="0"/><v>₩2,000</v></c></row>'
    const { result, xml } = await refresh(rows)
    stale(result)
    expect(recalc).not.toHaveBeenCalled()
    for (const cell of rows.match(/<c\b[\s\S]*?<\/c>/g)!) expect(xml).toContain(cell)
  })
  it('preserves array masters and spill followers and reports that they were not refreshed', async () => {
    const rows =
      '<row r="1"><c r="A1"><f t="array" ref="A1:A2">SEQUENCE(C1)</f><v>1</v></c></row><row r="2"><c r="A2"><v>2</v></c></row>'
    const { result, xml } = await refresh(rows)
    stale(result)
    expect(recalc).not.toHaveBeenCalled()
    expect(xml).toContain('<c r="A1"><f t="array" ref="A1:A2">SEQUENCE(C1)</f><v>1</v></c>')
    expect(xml).toContain('<c r="A2"><v>2</v></c>')
  })
  it('leaves a boolean result without a cached type alone', async () => {
    recalc.mockResolvedValue({ cells: [{ sheet: 'Data', row: 0, column: 0, formatted: 'TRUE' }] })
    const { result, xml } = await refresh('<row r="1"><c r="A1"><f>C1&gt;0</f></c></row>')
    stale(result)
    expect(xml).toContain('<c r="A1"><f>C1&gt;0</f></c>')
    expect(xml).not.toContain('<v>TRUE</v>')
  })
  it('writes an evaluated empty string as a real cache for a new formula', async () => {
    recalc.mockResolvedValue({ cells: [{ sheet: 'Data', row: 0, column: 2, formatted: '' }] })
    const { result, xml } = await refresh('', '=IF(1,"","")')
    expect(result.cachedValues).toBe(true)
    expect(xml).toContain('t="str"><f>IF(1,"","")</f><v></v>')
  })
  it('does not guess the type of a newly written boolean result', async () => {
    recalc.mockResolvedValue({ cells: [{ sheet: 'Data', row: 0, column: 2, formatted: 'TRUE' }] })
    const { result, xml } = await refresh('', '=1>0')
    expect(result.cachedValues).toBe(false)
    expect(result.uncached).toEqual(['Data!C1'])
    expect(xml).not.toContain('<v>TRUE</v>')
  })
  it('refreshes after tab order changes, which can affect SHEET() and 3D references', () => {
    expect(
      canChangeValues(
        [],
        { renames: [], additions: [], removals: [], order: [], orderChanged: true },
        [],
        EMPTY_PAYLOADS,
      ),
    ).toBe(true)
  })
})
