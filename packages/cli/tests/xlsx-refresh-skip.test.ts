import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { canChangeValues, formulaCellsInSheet } from '../src/formats/xlsx'
import { EMPTY_PAYLOADS } from '../src/formats/xlsx-gateway-ops'
import { xlsxSidecarPath } from '../src/resources'
import { run, tempDir } from './helpers'

const sidecar = Boolean(xlsxSidecarPath())

const styleOnly = {
  sheetName: 'Sheet1',
  row: 0,
  column: 0,
  writeValue: false,
  cell: { value: null },
} as const

describe('formulaCellsInSheet', () => {
  it('finds plain, shared and dependent formula cells from the sheet XML', () => {
    const xml =
      '<sheetData>' +
      '<row r="1"><c r="A1"><v>2</v></c><c r="B1"><f>A1*10</f><v>20</v></c></row>' +
      // a drag-filled column: only the first cell carries the formula text
      '<row r="2"><c r="A2"><v>3</v></c><c r="B2"><f t="shared" ref="B2:B4" si="0">A2*10</f><v>30</v></c></row>' +
      '<row r="3"><c r="A3"/><c r="B3"><f t="shared" si="0"/><v>40</v></c></row>' +
      '<row r="4"><c r="B4" s="1"><f t="shared" si="0"/></c></row>' +
      '</sheetData>'
    expect(formulaCellsInSheet(xml)).toEqual([
      { row: 0, column: 1 },
      { row: 1, column: 1 },
      { row: 2, column: 1 },
      { row: 3, column: 1 },
    ])
  })

  it('counts positions when cells and rows leave out their r attribute', () => {
    const xml =
      '<sheetData><row><c><v>1</v></c><c><f>A1+1</f></c></row><row><c><f>A1</f></c></row></sheetData>'
    expect(formulaCellsInSheet(xml)).toEqual([
      { row: 0, column: 1 },
      { row: 1, column: 0 },
    ])
  })

  it('ignores a value that merely looks like a formula tag', () => {
    const xml =
      '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&lt;f&gt;</t></is></c></row></sheetData>'
    expect(formulaCellsInSheet(xml)).toEqual([])
  })
})

describe('canChangeValues', () => {
  it('is false for sizing, styling and outline batches', () => {
    expect(
      canChangeValues(
        [styleOnly],
        undefined,
        [
          {
            sheetName: 'Sheet1',
            ops: [
              { kind: 'set-col-size', start: 0, end: 0, size: 20 },
              { kind: 'set-rows-outline', start: 0, end: 3, level: 1 },
            ],
          },
        ],
        EMPTY_PAYLOADS,
      ),
    ).toBe(false)
  })

  it('is true when a value is written or cells move', () => {
    expect(
      canChangeValues([{ ...styleOnly, writeValue: true }], undefined, [], EMPTY_PAYLOADS),
    ).toBe(true)
    expect(
      canChangeValues(
        [],
        undefined,
        [{ sheetName: 'Sheet1', ops: [{ kind: 'insert-rows', index: 1, count: 1 }] }],
        EMPTY_PAYLOADS,
      ),
    ).toBe(true)
  })
})

/** A two-column sheet whose B2:B4 is one shared formula and whose cached results are deliberately wrong. */
async function sharedFormulaWorkbook(dir: string): Promise<string> {
  const table = join(dir, 't.json')
  writeFileSync(
    table,
    JSON.stringify([
      ['n', 'x10'],
      [1, '=A2*10'],
      [2, '=A3*10'],
      [3, '=A4*10'],
    ]),
  )
  const out = join(dir, 't.xlsx')
  await run(['create', '--type', 'xlsx', '--from', table, '--out', out])
  const zip = await JSZip.loadAsync(readFileSync(out))
  const name = 'xl/worksheets/sheet1.xml'
  const cell = (ref: string) => new RegExp(`<c r="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`)
  const xml = (await zip.file(name)!.async('string'))
    .replace(cell('B2'), '<c r="B2"><f t="shared" ref="B2:B4" si="0">A2*10</f><v>999</v></c>')
    .replace(cell('B3'), '<c r="B3"><f t="shared" si="0"/><v>999</v></c>')
    .replace(cell('B4'), '<c r="B4"><f t="shared" si="0"/><v>999</v></c>')
  expect(xml).toContain('si="0"/>')
  zip.file(name, xml)
  writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer' }))
  return out
}

async function sheetXml(path: string): Promise<string> {
  return (await JSZip.loadAsync(readFileSync(path)))
    .file('xl/worksheets/sheet1.xml')!
    .async('string')
}

describe('formula results after sheet apply', () => {
  it.skipIf(!sidecar)('refreshes every cell of a drag-filled formula column', async () => {
    const dir = tempDir()
    const out = await sharedFormulaWorkbook(dir)
    const ops = join(dir, 'ops.json')
    writeFileSync(ops, JSON.stringify([{ op: 'set_cell', address: 'A3', value: 7 }]))
    expect((await run(['sheet', 'apply', out, '--ops', ops, '--json'])).code).toBe(0)
    const xml = await sheetXml(out)
    // B2:B4 read A2:A4 = 1, 7, 3: the one-formula-text-per-column layout does not hide the dependents
    expect(xml).toMatch(/<c r="B2"[^>]*><f[^>]*>A2\*10<\/f><v>10<\/v>/)
    expect(xml).toMatch(/<c r="B3"[^>]*><f[^>]*\/><v>70<\/v>/)
    expect(xml).toMatch(/<c r="B4"[^>]*><f[^>]*\/><v>30<\/v>/)
  })

  it.skipIf(!sidecar)(
    'leaves cached results alone when the batch cannot change a value',
    async () => {
      const dir = tempDir()
      const out = await sharedFormulaWorkbook(dir)
      const ops = join(dir, 'ops.json')
      writeFileSync(
        ops,
        JSON.stringify([{ op: 'set_col_width', column: 'A', widthPx: 120, count: 1 }]),
      )
      const applied = await run(['sheet', 'apply', out, '--ops', ops, '--json'])
      expect(applied.code).toBe(0)
      // nothing was recalculated: the 999 placeholders are still the cached results
      const xml = await sheetXml(out)
      expect(xml.match(/<v>999<\/v>/g)).toHaveLength(3)
    },
  )
})
