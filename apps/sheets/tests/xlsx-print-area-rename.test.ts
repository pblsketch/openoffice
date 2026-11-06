import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import {
  applyCellEditsToXlsx,
  assertOnlyTouchedEntriesChanged,
} from '@genoffice/xlsx-gateway/gateway/xlsx-gateway'
import { buildSheetsFixture } from './fixture-builder'

async function entryText(buffer: Buffer, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  return zip.file(path)?.async('text') ?? ''
}

// sheets-main.ts resolves every per-sheet state to the sheet's original file
// name, while print areas are written onto the post-rename workbook.xml —
// renaming a sheet and setting its print area in one save failed with
// 'Sheet "Data" was not found in the workbook.' on every retry.
describe('print area on a sheet renamed in the same save', () => {
  it('writes the print area under the new name', async () => {
    const mutation = await applyCellEditsToXlsx(
      await buildSheetsFixture(),
      [],
      [],
      [],
      {
        renames: [{ sheetName: 'Data', newName: 'Numbers' }],
        additions: [],
        removals: [],
        order: ['Numbers', 'Other', 'My Sheet'],
      },
      [],
      [],
      [],
      [],
      [],
      null,
      [{ sheetName: 'Data', printArea: 'A1:C10', printTitles: '$1:$1' }],
    )
    expect(() => assertOnlyTouchedEntriesChanged(mutation)).not.toThrow()
    const workbook = await entryText(mutation.buffer, 'xl/workbook.xml')
    expect(workbook).toMatch(
      /<definedName name="_xlnm\.Print_Area" localSheetId="0">'?Numbers'?!\$A\$1:\$C\$10<\/definedName>/,
    )
    expect(workbook).toContain('Numbers')
    expect(workbook).not.toMatch(/'?Data'?!/)
  })

  it('keeps an added sheet that takes the renamed sheet name as its target', async () => {
    const mutation = await applyCellEditsToXlsx(
      await buildSheetsFixture(),
      [],
      [],
      [],
      {
        renames: [{ sheetName: 'Data', newName: 'Numbers' }],
        additions: [{ name: 'Data' }],
        removals: [],
        order: ['Numbers', 'Other', 'My Sheet', 'Data'],
      },
      [],
      [],
      [],
      [],
      [],
      null,
      [{ sheetName: 'Data', printArea: 'A1:B2' }],
    )
    const workbook = await entryText(mutation.buffer, 'xl/workbook.xml')
    expect(workbook).toMatch(
      /<definedName name="_xlnm\.Print_Area" localSheetId="3">'?Data'?!\$A\$1:\$B\$2<\/definedName>/,
    )
  })
})
