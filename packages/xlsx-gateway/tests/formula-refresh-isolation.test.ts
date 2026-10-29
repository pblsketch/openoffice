import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { xlsxBufferFromSheets } from '../src/gateway/csv-import'
import {
  applyCellEditsToXlsx,
  assembleWithJsZip,
  createBufferEntrySource,
  planCellEditsToXlsx,
  type CellEdit,
  type SheetFormulaValues,
} from '../src/gateway/xlsx-gateway'

const sheet2 = 'xl/worksheets/sheet2.xml'
const formulas =
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="b"><f>Sheet1!A1&gt;0</f><v>1</v></c><c r="B1" t="str"><f>IF(Sheet1!A1,"","")</f></c></row></sheetData></worksheet>'
const edit: CellEdit = {
  sheetName: 'Sheet1',
  row: 0,
  column: 0,
  writeValue: true,
  cell: { value: 2 },
}
const appValues: SheetFormulaValues[] = [
  {
    sheetName: 'Sheet2',
    cells: [
      { row: 0, column: 0, value: 'TRUE' },
      { row: 0, column: 1, value: '' },
    ],
  },
]
async function source() {
  const zip = await JSZip.loadAsync(
    await xlsxBufferFromSheets([
      { name: 'Sheet1', rows: [['1']] },
      { name: 'Sheet2', rows: [] },
    ]),
  )
  zip.file(sheet2, formulas)
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('formula cache refresh is a CLI opt-in', () => {
  it('keeps every untouched entry byte-identical on an app-style save with viewed-sheet values', async () => {
    const before = await source()
    const result = await applyCellEditsToXlsx(
      before,
      [edit],
      [],
      [],
      undefined,
      [],
      [],
      [],
      [],
      [],
      null,
      [],
      [],
      appValues,
    )
    expect(result.touchedEntries).not.toContain(sheet2)
    const a = await JSZip.loadAsync(before)
    const b = await JSZip.loadAsync(result.buffer)
    for (const [path, entry] of Object.entries(a.files)) {
      if (entry.dir || result.touchedEntries.includes(path)) continue
      expect(await b.file(path)!.async('nodebuffer'), path).toEqual(await entry.async('nodebuffer'))
    }
    expect(await b.file('xl/worksheets/sheet1.xml')!.async('string')).toContain('<v>2</v>')
  })

  it('retains the default empty-result behavior even on a touched sheet', async () => {
    const before = await source()
    const result = await applyCellEditsToXlsx(
      before,
      [{ ...edit, sheetName: 'Sheet2', column: 2 }],
      [],
      [],
      undefined,
      [],
      [],
      [],
      [],
      [],
      null,
      [],
      [],
      appValues,
    )
    const xml = await (await JSZip.loadAsync(result.buffer)).file(sheet2)!.async('string')
    expect(xml).not.toContain('<v></v>')
  })

  it('allows the CLI to refresh an otherwise untouched sheet with typed boolean and empty caches', async () => {
    const before = await source()
    const values: SheetFormulaValues[] = [
      {
        sheetName: 'Sheet2',
        cells: [
          { row: 0, column: 0, value: false },
          { row: 0, column: 1, value: '' },
        ],
      },
    ]
    const plan = await planCellEditsToXlsx(
      await createBufferEntrySource(before),
      [edit],
      [],
      [],
      undefined,
      [],
      [],
      [],
      [],
      [],
      null,
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      values,
      null,
      null,
      [],
      [],
      [],
      [],
      [],
      { refreshUntouchedSheets: true },
    )
    const result = await assembleWithJsZip(before, plan)
    const xml = await (await JSZip.loadAsync(result.buffer)).file(sheet2)!.async('string')
    expect(xml).toContain('t="b"><f>Sheet1!A1&gt;0</f><v>0</v>')
    expect(xml).toContain('t="str"><f>IF(Sheet1!A1,"","")</f><v></v>')
  })
})
