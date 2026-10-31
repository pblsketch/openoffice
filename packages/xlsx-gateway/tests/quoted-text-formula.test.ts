/// `="0123"` cells (2026-10-30 report): systems export codes and numbers that
/// way so Excel keeps them as written. Excel evaluates that one formula when it
/// opens a CSV or an HTML table and shows the quoted text; the import used to
/// show the formula itself until the cell was edited.
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import {
  buildWorksheetXml,
  csvToXlsxBufferForOpen,
  parseCsv,
  quotedTextFormula,
} from '../src/gateway/csv-import'
import { htmlTablesToXlsxBuffer, parseHtmlTables } from '../src/gateway/html-import'

async function sheetXml(buffer: Buffer): Promise<string> {
  const entry = (await JSZip.loadAsync(buffer)).file('xl/worksheets/sheet1.xml')
  if (entry === null) throw new Error('missing sheet')
  return entry.async('text')
}

describe('quotedTextFormula', () => {
  it('reads the text of a ="..." cell, doubled quotes included', () => {
    expect(quotedTextFormula('="0123"')).toBe('0123')
    expect(quotedTextFormula('="123"')).toBe('123')
    expect(quotedTextFormula('=""')).toBe('')
    expect(quotedTextFormula('="say ""hi"""')).toBe('say "hi"')
  })

  it('leaves every other formula-looking value alone', () => {
    for (const value of ['=1+2', '=SUM(A1:A2)', '="a"&"b"', '="a" ', ' ="a"', '="a', '0123', ''])
      expect(quotedTextFormula(value), value).toBeNull()
  })
})

describe('opening ="..." cells', () => {
  it('writes the quoted text as a text cell, zeros and long digits intact', () => {
    const xml = buildWorksheetXml([['="0123"', '="123"', '="12345678901234567890"', '=1+2']])
    expect(xml).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">0123</t></is></c>')
    expect(xml).toContain('<c r="B1" t="inlineStr"><is><t xml:space="preserve">123</t></is></c>')
    expect(xml).toContain('<t xml:space="preserve">12345678901234567890</t>')
    // any other formula stays the text it was
    expect(xml).toContain('<t xml:space="preserve">=1+2</t>')
  })

  it('unwraps the cells of a CSV export', async () => {
    const csv = 'code,name\r\n"=""00123""",Kim\r\n="456",Lee\r\n'
    expect(parseCsv(csv)[1]![0]).toBe('="00123"')
    const xml = await sheetXml((await csvToXlsxBufferForOpen(csv)).buffer)
    expect(xml).toContain('<t xml:space="preserve">00123</t>')
    expect(xml).toContain('<t xml:space="preserve">456</t>')
    expect(xml).not.toContain('=&quot;')
  })

  it('unwraps the cells of an HTML table saved as .xls', async () => {
    const html =
      '<table><tr><td>code</td></tr><tr><td>=&quot;0042&quot;</td></tr><tr><td>="7"</td></tr></table>'
    const xml = await sheetXml(await htmlTablesToXlsxBuffer(parseHtmlTables(html)))
    expect(xml).toContain('<t xml:space="preserve">0042</t>')
    expect(xml).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">7</t></is></c>')
  })
})
