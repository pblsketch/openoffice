import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { sheetNameFromStem } from '../src/formats/csv'
import { run, tempDir } from './helpers'

describe('sheet names derived from file stems', () => {
  it.each([
    ['a\u0001b', 'a_b'],
    ['\u0000\u001f', '__'],
    ['q\u000bq\u000cq', 'q_q_q'],
    ['x\ufffey\uffffz', 'x_y_z'],
    ['lone\ud800high', 'lone_high'],
    ['lone\udc00low', 'lone_low'],
  ])('replaces the XML-invalid characters in %j', (stem, expected) => {
    expect(sheetNameFromStem(stem)).toBe(expected)
  })

  it.each(['plain', 'tab\there', '매출 현황 😀', 'Q1/Q2:budget'])('keeps valid text %j', (stem) => {
    expect(sheetNameFromStem(stem)).toBe(stem.replace(/[\\/?*[\]:]/g, '_'))
  })

  // Windows refuses control characters in file names, so the file cannot exist there
  it.skipIf(process.platform === 'win32')(
    'writes a well-formed workbook when the CSV file name has a control character',
    async () => {
      const dir = tempDir()
      const csv = join(dir, 'sales\u0001.csv')
      const output = join(dir, 'sales.xlsx')
      writeFileSync(csv, 'a,b\n1,2\n')
      const result = await run(['convert', csv, '--to', 'xlsx', '--out', output, '--json'])
      expect(result.code).toBe(0)
      const zip = await JSZip.loadAsync(readFileSync(output))
      const workbook = await zip.file('xl/workbook.xml')!.async('string')
      expect(workbook).toContain('<sheet name="sales_"')
      // eslint-disable-next-line no-control-regex
      expect(workbook).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/)
    },
  )
})
