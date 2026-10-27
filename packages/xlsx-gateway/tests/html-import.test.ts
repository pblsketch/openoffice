import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { buildWorksheetXml } from '../src/gateway/csv-import'
import {
  decodeHtmlBuffer,
  decodeHtmlEntities,
  htmlTablesToXlsxBuffer,
  looksLikeHtmlWorkbook,
  parseHtmlTables,
} from '../src/gateway/html-import'

const EXCEL_HTML_HEAD = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<meta name=ProgId content=Excel.Sheet>
<!--[if gte mso 9]><xml>
 <x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
  <x:Name>Data</x:Name>
 </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
</xml><![endif]-->
<style>td { mso-number-format:"Short Date"; }</style>
</head>
<body>`

async function openWorkbook(buffer: Buffer): Promise<JSZip> {
  return JSZip.loadAsync(buffer)
}

async function sheetXml(buffer: Buffer, index = 1): Promise<string> {
  const zip = await openWorkbook(buffer)
  const entry = zip.file(`xl/worksheets/sheet${index}.xml`)
  if (entry === null) throw new Error(`missing sheet ${index}`)
  return entry.async('text')
}

describe('looksLikeHtmlWorkbook', () => {
  it('recognizes Excel HTML exports and plain web tables', () => {
    expect(looksLikeHtmlWorkbook(Buffer.from(EXCEL_HTML_HEAD, 'utf8'))).toBe(true)
    expect(looksLikeHtmlWorkbook(Buffer.from('<!DOCTYPE html><html><body>', 'utf8'))).toBe(true)
    expect(looksLikeHtmlWorkbook(Buffer.from('<table><tr><td>1</td></tr></table>', 'utf8'))).toBe(
      true,
    )
    expect(looksLikeHtmlWorkbook(Buffer.from(`\uFEFF${EXCEL_HTML_HEAD}`, 'utf8'))).toBe(true)
  })

  it('leaves real containers, binary files and SpreadsheetML alone', () => {
    expect(
      looksLikeHtmlWorkbook(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])),
    ).toBe(false)
    expect(looksLikeHtmlWorkbook(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(false)
    expect(
      looksLikeHtmlWorkbook(
        Buffer.from(
          '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet><Table/></Worksheet></Workbook>',
        ),
      ),
    ).toBe(false)
  })

  it('reads a UTF-16 web page too', () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<html><body>', 'utf16le')])
    expect(looksLikeHtmlWorkbook(utf16)).toBe(true)
  })
})

describe('decodeHtmlBuffer', () => {
  it('honors the charset the page declares', () => {
    const before = Buffer.from(
      '<html><head><meta charset=euc-kr></head><body><table><tr><td>',
      'latin1',
    )
    const korean = Buffer.from([0xb0, 0xa1, 0xb3, 0xaa, 0xb4, 0xd9])
    const after = Buffer.from('</td></tr></table></body></html>', 'latin1')
    const html = decodeHtmlBuffer(Buffer.concat([before, korean, after]))
    expect(html).toContain('가나다')
  })

  it('ignores a charset declaration that does not fit the bytes', () => {
    const html = Buffer.concat([
      Buffer.from('<html><head><meta charset=euc-kr></head><body><table><tr><td>', 'latin1'),
      Buffer.from('가나다', 'utf8'),
      Buffer.from('</td></tr></table></body></html>', 'latin1'),
    ])
    expect(decodeHtmlBuffer(html)).toContain('가나다')
  })

  it('falls back to the CSV charset sniffing without a declaration', () => {
    const bytes = Buffer.from('<html><body>caf\u00e9</body></html>', 'latin1')
    expect(decodeHtmlBuffer(bytes)).toContain('café')
  })

  it('decodes named and numeric references', () => {
    expect(decodeHtmlEntities('a &amp; b &lt;c&gt; &#44032; &#xAC00; &nbsp;x')).toBe(
      'a & b <c> 가 가 \u00a0x',
    )
    expect(decodeHtmlEntities('&unknown;')).toBe('&unknown;')
  })
})

describe('parseHtmlTables', () => {
  it('reads Excel HTML: values, merges, line breaks and the declared sheet name', () => {
    const html = `${EXCEL_HTML_HEAD}
<table border=0 cellpadding=0 cellspacing=0>
 <tr height=17>
  <td colspan=2 class=xl65>제목 &amp; 부제</td>
 </tr>
 <tr>
  <td rowspan=2 style='mso-number-format:"Short Date"'>2026-10-27</td>
  <td>42</td>
 </tr>
 <tr>
  <td>둘째<br>줄</td>
 </tr>
</table>
</body></html>`
    const tables = parseHtmlTables(html)
    expect(tables).toHaveLength(1)
    expect(tables[0]?.name).toBe('Data')
    expect(tables[0]?.rows).toEqual([['제목 & 부제'], ['2026-10-27', '42'], ['', '둘째\n줄']])
    expect(tables[0]?.merges).toEqual(['A1:B1', 'A2:A3'])
  })

  it('ignores scripts, styles and comments but keeps cell text', () => {
    const html = `<html><head><style>td { color: red }</style>
<script>document.write('<table><tr><td>NO</td></tr></table>')</script></head>
<body><!-- <table><tr><td>NO</td></tr></table> -->
<table><tr><td>1</td><td><span>A</span> B</td></tr></table></body></html>`
    const tables = parseHtmlTables(html)
    expect(tables[0]?.rows).toEqual([['1', 'A B']])
  })

  it('keeps a nested layout table inside the cell that holds it', () => {
    const html = `<html><body><table><tr><td>
      <table><tr><td>안쪽</td><td>표</td></tr></table>
    </td><td>바깥</td></tr></table></body></html>`
    const tables = parseHtmlTables(html)
    expect(tables[0]?.rows).toEqual([['안쪽 표', '바깥']])
  })

  it('stacks tables without declared names on one sheet with a blank row', () => {
    const html = `<html><body>
<table><tr><td>first</td></tr></table>
<table><tr><td>second</td></tr></table>
</body></html>`
    const tables = parseHtmlTables(html)
    expect(tables).toHaveLength(1)
    expect(tables[0]?.rows).toEqual([['first'], [], ['second']])
  })

  it('keeps a single declared name when several tables were exported', () => {
    const html = `<html><head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
<x:ExcelWorksheet><x:Name>자료</x:Name></x:ExcelWorksheet>
</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>
<table><tr><td>first</td></tr></table>
<table><tr><td>second</td></tr></table>
</body></html>`
    const tables = parseHtmlTables(html)
    expect(tables).toHaveLength(1)
    expect(tables[0]?.name).toBe('자료')
    expect(tables[0]?.rows).toEqual([['first'], [], ['second']])
  })

  it('maps declared worksheet names to their tables', () => {
    const html = `<html><head><!--[if gte mso 9]><xml>
<x:ExcelWorkbook><x:ExcelWorksheets>
<x:ExcelWorksheet><x:Name>요약</x:Name></x:ExcelWorksheet>
<x:ExcelWorksheet><x:Name>Detail</x:Name></x:ExcelWorksheet>
</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>
<table><tr><td>합계</td></tr></table>
<table><tr><td>42</td></tr></table>
</body></html>`
    const tables = parseHtmlTables(html)
    expect(tables.map((table) => table.name)).toEqual(['요약', 'Detail'])
    expect(tables[1]?.rows).toEqual([['42']])
  })

  it('fills cells around spans without overlapping them', () => {
    const html = `<html><body><table>
<tr><td rowspan=2>A</td><td>B</td><td rowspan=2>C</td></tr>
<tr><td>D</td></tr>
<tr><td>E</td><td colspan=2>F</td></tr>
</table></body></html>`
    const tables = parseHtmlTables(html)
    expect(tables[0]?.rows).toEqual([
      ['A', 'B', 'C'],
      ['', 'D'],
      ['E', 'F'],
    ])
    expect(tables[0]?.merges).toEqual(['A1:A2', 'C1:C2', 'B3:C3'])
  })

  it('uses the unformatted x:num value behind a formatted display', () => {
    const html =
      '<html><body><table><tr><td x:num="1234.5">1,234.50</td><td x:num="7">7</td></tr></table></body></html>'
    expect(parseHtmlTables(html)[0]?.rows).toEqual([['1234.5', '7']])
  })

  it('returns nothing for a page without a table', () => {
    expect(parseHtmlTables('<html><body><p>보고서</p></body></html>')).toEqual([])
  })

  it('does not choke on a stray less-than sign or an unclosed tag', () => {
    const html = '<html><body><table><tr><td>1 < 2</td><td>3</table></body></html>'
    expect(parseHtmlTables(html)[0]?.rows).toEqual([['1 < 2', '3']])
  })
})

describe('htmlTablesToXlsxBuffer', () => {
  it('writes values, numeric cells, merges and sheet names into the package', async () => {
    const tables = parseHtmlTables(`${EXCEL_HTML_HEAD}
<table><tr><td colspan=2>제목</td></tr><tr><td>42</td><td>둘째<br>줄</td></tr></table>
</body></html>`)
    const buffer = await htmlTablesToXlsxBuffer(tables)
    const sheet = await sheetXml(buffer)

    expect(sheet).toContain('<dimension ref="A1:B2"/>')
    expect(sheet).toContain('<v>42</v>')
    expect(sheet).toContain('<t xml:space="preserve">제목</t>')
    expect(sheet).toContain('<t xml:space="preserve">둘째\n줄</t>')
    expect(sheet).toContain('<mergeCell ref="A1:B1"/>')

    const zip = await openWorkbook(buffer)
    expect(await zip.file('xl/workbook.xml')?.async('text')).toContain(
      '<sheet name="Data" sheetId="1" r:id="rId1"/>',
    )
  })

  it('writes one worksheet per declared name', async () => {
    const tables = parseHtmlTables(`<html><head><!--[if gte mso 9]><xml>
<x:ExcelWorkbook><x:ExcelWorksheets>
<x:ExcelWorksheet><x:Name>요약</x:Name></x:ExcelWorksheet>
<x:ExcelWorksheet><x:Name>Detail</x:Name></x:ExcelWorksheet>
</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>
<table><tr><td>합계</td></tr></table>
<table><tr><td>42</td></tr></table>
</body></html>`)
    const buffer = await htmlTablesToXlsxBuffer(tables)
    const zip = await openWorkbook(buffer)
    const workbook = await zip.file('xl/workbook.xml')?.async('text')
    expect(workbook).toContain('<sheet name="요약" sheetId="1" r:id="rId1"/>')
    expect(workbook).toContain('<sheet name="Detail" sheetId="2" r:id="rId2"/>')
    expect(await sheetXml(buffer, 1)).toContain('<t xml:space="preserve">합계</t>')
    expect(await sheetXml(buffer, 2)).toContain('<v>42</v>')
  })

  it('numbers unnamed sheets without repeating the first name', async () => {
    const buffer = await htmlTablesToXlsxBuffer([
      { rows: [['a']], merges: [] },
      { rows: [['b']], merges: [] },
    ])
    const workbook = await (await openWorkbook(buffer)).file('xl/workbook.xml')?.async('text')
    expect(workbook).toContain('name="Sheet1"')
    expect(workbook).toContain('name="Sheet2"')
  })

  it('stacks tables without declared names onto one worksheet', async () => {
    const tables = parseHtmlTables(`<html><body>
<table><tr><td>one</td></tr></table>
<table><tr><td>two</td></tr></table>
</body></html>`)
    const buffer = await htmlTablesToXlsxBuffer(tables)
    const zip = await openWorkbook(buffer)
    const workbook = await zip.file('xl/workbook.xml')?.async('text')
    expect(workbook).toContain('name="Sheet1"')
    expect(await sheetXml(buffer, 1)).toContain('<t xml:space="preserve">one</t>')
    expect(await sheetXml(buffer, 1)).toContain('<t xml:space="preserve">two</t>')
  })
})

describe('buildWorksheetXml merge dimension', () => {
  it('reaches the far corner of a merge that covers empty cells', () => {
    const xml = buildWorksheetXml([['A']], ['A1:C2'])
    expect(xml).toContain('<dimension ref="A1:C2"/>')
  })
})
