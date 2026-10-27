import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { convertLegacyWorkbook } from '../src/main/legacy-import'

const EXCEL_HTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<!--[if gte mso 9]><xml>
 <x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
  <x:Name>성적</x:Name>
 </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
</xml><![endif]-->
</head>
<body>
<table>
 <tr><td colspan=2>2026학년도 성적</td></tr>
 <tr><td>이름</td><td>점수</td></tr>
 <tr><td>김하늘</td><td>95</td></tr>
</table>
</body></html>`

describe('convertLegacyWorkbook', () => {
  let directory: string
  let source: string
  let target: string
  const calls: { path: string; targetPath: string }[] = []
  const client = {
    async convertWorkbook(input: { path: string; targetPath: string }): Promise<unknown> {
      calls.push(input)
      return { sheets: 1, cells: 1 }
    },
  }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sheets-html-import-'))
    source = join(directory, 'report.xls')
    target = join(directory, 'opened.xlsx')
    calls.length = 0
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('reads an HTML table export without asking the sidecar to open it', async () => {
    await writeFile(source, EXCEL_HTML)

    await expect(convertLegacyWorkbook(client, source, target)).resolves.toBe('html')
    expect(calls).toHaveLength(0)

    const zip = await JSZip.loadAsync(await readFile(target))
    const workbook = await zip.file('xl/workbook.xml')?.async('text')
    const sheet = await zip.file('xl/worksheets/sheet1.xml')?.async('text')
    expect(workbook).toContain('<sheet name="성적" sheetId="1" r:id="rId1"/>')
    expect(sheet).toContain('<mergeCell ref="A1:B1"/>')
    expect(sheet).toContain('<t xml:space="preserve">김하늘</t>')
    expect(sheet).toContain('<v>95</v>')
  })

  it('decodes the charset the export declares', async () => {
    const encoded = Buffer.concat([
      Buffer.from(
        '<html><head><meta http-equiv="Content-Type" content="text/html; charset=euc-kr"></head><body><table><tr><td>',
        'latin1',
      ),
      Buffer.from([0xb0, 0xa1, 0xb3, 0xaa, 0xb4, 0xd9]),
      Buffer.from('</td></tr></table></body></html>', 'latin1'),
    ])
    await writeFile(source, encoded)

    await expect(convertLegacyWorkbook(client, source, target)).resolves.toBe('html')
    const zip = await JSZip.loadAsync(await readFile(target))
    const sheet = await zip.file('xl/worksheets/sheet1.xml')?.async('text')
    expect(sheet).toContain('<t xml:space="preserve">가나다</t>')
  })

  it('leaves real legacy workbooks to the sidecar converter', async () => {
    await writeFile(source, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]))

    await expect(convertLegacyWorkbook(client, source, target)).resolves.toBe('workbook')
    expect(calls).toEqual([{ path: source, targetPath: target }])
  })

  it('reports a web page without a table instead of opening an empty grid', async () => {
    await writeFile(source, '<html><body><p>안내문</p></body></html>')

    await expect(convertLegacyWorkbook(client, source, target)).resolves.toBe('html-no-table')
    expect(calls).toHaveLength(0)
  })
})
