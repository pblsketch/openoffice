import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { formulaCellsInPackage, formulaCellsInSheet } from '../src/formats/xlsx'
import { xlsxSidecarPath } from '../src/resources'
import { run, tempDir } from './helpers'

const sidecar = Boolean(xlsxSidecarPath())

/** A one-sheet workbook, A1 = 2 and B1 = a formula over it, as bytes the test can reshape. */
async function workbook(dir: string, formula = '=A1*10'): Promise<{ path: string; zip: JSZip }> {
  const table = join(dir, 't.json')
  writeFileSync(table, JSON.stringify([[2, formula]]))
  const path = join(dir, 't.xlsx')
  expect((await run(['create', '--type', 'xlsx', '--from', table, '--out', path])).code).toBe(0)
  return { path, zip: await JSZip.loadAsync(readFileSync(path)) }
}

// `create --from t.json` names the one sheet after the file
const SHEET_NAME = 't'
const SHEET = 'xl/worksheets/sheet1.xml'
const RELS = 'xl/_rels/workbook.xml.rels'

async function save(zip: JSZip, path: string): Promise<Buffer> {
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  writeFileSync(path, buffer)
  return buffer
}

describe('formulaCellsInSheet', () => {
  it('marks a formula cell whose cached result the file typed as a boolean', () => {
    const xml =
      '<sheetData><row r="1"><c r="A1"><v>2</v></c>' +
      '<c r="B1" t="b"><f>A1&gt;0</f><v>1</v></c>' +
      '<c r="C1" t="str"><f>"a"</f><v>a</v></c></row></sheetData>'
    expect(formulaCellsInSheet(xml)).toEqual([
      { row: 0, column: 1, boolean: true },
      { row: 0, column: 2 },
    ])
  })
})

describe('formulaCellsInPackage', () => {
  it('normalizes prefixed workbook, relationship and worksheet parts before scanning', async () => {
    const dir = tempDir()
    const { zip } = await workbook(dir)
    for (const path of ['xl/workbook.xml', RELS, SHEET]) {
      const xml = await zip.file(path)!.async('string')
      zip.file(
        path,
        xml.replace(/xmlns="/g, 'xmlns:x="').replace(/<(\/?)([A-Za-z][A-Za-z0-9]*)/g, '<$1x:$2'),
      )
    }
    const found = await formulaCellsInPackage(await save(zip, join(dir, 'prefixed.xlsx')))
    expect(found.unreadable).toEqual([])
    expect(found.cells.get(SHEET_NAME)).toEqual([{ row: 0, column: 1 }])
  })

  it('finds the formulas of a sheet whose relationship target climbs out with ../', async () => {
    const dir = tempDir()
    const { zip } = await workbook(dir)
    const rels = (await zip.file(RELS)!.async('string')).replace(
      /Target="(?:\/xl\/|xl\/)?worksheets\/sheet1\.xml"/,
      'Target="../xl/worksheets/sheet1.xml"',
    )
    expect(rels).toContain('../xl/worksheets/sheet1.xml')
    zip.file(RELS, rels)
    const found = await formulaCellsInPackage(await save(zip, join(dir, 'up.xlsx')))
    expect(found.unreadable).toEqual([])
    expect(found.cells.get(SHEET_NAME)).toEqual([{ row: 0, column: 1 }])
  })

  it('finds the formulas of a sheet whose part name is percent-encoded in the target', async () => {
    const dir = tempDir()
    const { zip } = await workbook(dir)
    zip.file('xl/worksheets/sheet 1.xml', await zip.file(SHEET)!.async('string'))
    zip.remove(SHEET)
    zip.file(
      RELS,
      (await zip.file(RELS)!.async('string')).replace(
        /Target="(?:\/xl\/|xl\/)?worksheets\/sheet1\.xml"/,
        'Target="worksheets/sheet%201.xml"',
      ),
    )
    const found = await formulaCellsInPackage(await save(zip, join(dir, 'enc.xlsx')))
    expect(found.unreadable).toEqual([])
    expect(found.cells.get(SHEET_NAME)).toEqual([{ row: 0, column: 1 }])
  })

  it('names a sheet it could not open instead of reporting no formulas', async () => {
    const dir = tempDir()
    const { zip } = await workbook(dir)
    zip.remove(SHEET)
    const found = await formulaCellsInPackage(await save(zip, join(dir, 'gone.xlsx')))
    expect(found.cells.size).toBe(0)
    expect(found.unreadable).toEqual([SHEET_NAME])
  })

  it('does not throw on bytes that are not a package', async () => {
    const found = await formulaCellsInPackage(Buffer.from('not a zip'))
    expect(found.cells.size).toBe(0)
    expect(found.unreadable).toEqual(['(workbook)'])
  })
})

describe('cached results of formulas the edit did not write', () => {
  it.skipIf(!sidecar)(
    'refreshes distant formulas through multiple small reads without touching data cells',
    async () => {
      const dir = tempDir()
      const { path, zip } = await workbook(dir)
      zip.file(
        SHEET,
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>C1*10</f><v>20</v></c><c r="B1"><v>123</v></c><c r="C1"><v>2</v></c></row><row r="1048576"><c r="Z1048576"><f>C1*20</f><v>40</v></c></row></sheetData></worksheet>',
      )
      await save(zip, path)
      const ops = join(dir, 'distant-ops.json')
      writeFileSync(ops, JSON.stringify([{ op: 'set_cell', address: 'C1', value: 5 }]))
      const applied = await run(['sheet', 'apply', path, '--ops', ops, '--json'])
      expect(applied.code).toBe(0)
      expect(applied.json().detail.cached_values).toBe(true)
      const xml = await (await JSZip.loadAsync(readFileSync(path))).file(SHEET)!.async('string')
      expect(xml).toContain('<c r="B1"><v>123</v></c>')
      expect(xml).toContain('<f>C1*10</f><v>50</v>')
      expect(xml).toContain('<f>C1*20</f><v>100</v>')
    },
  )
  it.skipIf(!sidecar)('keeps a boolean result typed t="b"', async () => {
    const dir = tempDir()
    const { path, zip } = await workbook(dir, '=A1>0')
    // the file types the result as a boolean, as Excel writes it
    const cell = /<c r="B1"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/
    zip.file(
      SHEET,
      (await zip.file(SHEET)!.async('string')).replace(
        cell,
        '<c r="B1" t="b"><f>A1&gt;0</f><v>1</v></c>',
      ),
    )
    await save(zip, path)
    const ops = join(dir, 'ops.json')
    writeFileSync(ops, JSON.stringify([{ op: 'set_cell', address: 'A1', value: -1 }]))
    expect((await run(['sheet', 'apply', path, '--ops', ops, '--json'])).code).toBe(0)
    const xml = await (await JSZip.loadAsync(readFileSync(path))).file(SHEET)!.async('string')
    expect(xml).toMatch(/<c r="B1"[^>]*t="b"[^>]*><f>[^<]*<\/f><v>0<\/v>/)
  })

  it.skipIf(!sidecar)('keeps an empty-string result as an empty typed value', async () => {
    const dir = tempDir()
    const { path, zip } = await workbook(dir, '=IF(A1>0,"x","")')
    const cell = /<c r="B1"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/
    zip.file(
      SHEET,
      (await zip.file(SHEET)!.async('string')).replace(
        cell,
        '<c r="B1" t="str"><f>IF(A1&gt;0,"x","")</f><v>x</v></c>',
      ),
    )
    await save(zip, path)
    const ops = join(dir, 'ops.json')
    writeFileSync(ops, JSON.stringify([{ op: 'set_cell', address: 'A1', value: -1 }]))
    expect((await run(['sheet', 'apply', path, '--ops', ops, '--json'])).code).toBe(0)
    const xml = await (await JSZip.loadAsync(readFileSync(path))).file(SHEET)!.async('string')
    expect(xml).toMatch(/<c r="B1"[^>]*t="str"[^>]*><f>[^<]*<\/f><v><\/v>/)
  })
})
