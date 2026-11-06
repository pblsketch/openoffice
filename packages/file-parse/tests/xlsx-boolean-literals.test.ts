import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { xlsxToText } from '../src/xlsx'

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'

async function workbookWithBooleans(cells: string): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    'xl/workbook.xml',
    `${XML_DECL}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Flags" sheetId="1" r:id="rId1"/></sheets></workbook>',
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>',
  )
  zip.file(
    'xl/worksheets/sheet1.xml',
    `${XML_DECL}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
      `<row r="1">${cells}</row>` +
      '</sheetData></worksheet>',
  )
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

describe('xlsx boolean cells', () => {
  it('treats OOXML true/false literals the same as 1/0', async () => {
    const text = await xlsxToText(
      await workbookWithBooleans(
        '<c r="A1" t="b"><v>true</v></c>' +
          '<c r="B1" t="b"><v>TRUE</v></c>' +
          '<c r="C1" t="b"><v>false</v></c>' +
          '<c r="D1" t="b"><v>FALSE</v></c>' +
          '<c r="E1" t="b"><v>1</v></c>' +
          '<c r="F1" t="b"><v>0</v></c>',
      ),
    )
    expect(text).toContain('TRUE | TRUE | FALSE | FALSE | TRUE | FALSE')
  })
})
