import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { run, tempDir } from './helpers'

vi.mock('../src/resources', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/resources')>()),
  xlsxSidecarPath: () => null,
}))

describe('sheet apply without the xlsx engine', () => {
  it('says the formulas that read an edited cell were not refreshed', async () => {
    const dir = tempDir()
    const table = join(dir, 't.json')
    writeFileSync(table, JSON.stringify([[2, '=A1*10']]))
    const out = join(dir, 't.xlsx')
    expect((await run(['create', '--type', 'xlsx', '--from', table, '--out', out])).code).toBe(0)
    const ops = join(dir, 'ops.json')
    writeFileSync(ops, JSON.stringify([{ op: 'set_cell', address: 'A1', value: 5 }]))
    const applied = await run(['sheet', 'apply', out, '--ops', ops, '--json'])
    expect(applied.code).toBe(0)
    expect(JSON.stringify(applied.json())).toContain('dependent_formulas_not_refreshed')
    expect(applied.json().detail.cached_values).toBe(false)
  })

  it('still finds the formulas when the sheet relationship climbs out with ../', async () => {
    const dir = tempDir()
    const table = join(dir, 't.json')
    writeFileSync(table, JSON.stringify([[2, '=A1*10']]))
    const out = join(dir, 't.xlsx')
    await run(['create', '--type', 'xlsx', '--from', table, '--out', out])
    const zip = await JSZip.loadAsync(readFileSync(out))
    const rels = 'xl/_rels/workbook.xml.rels'
    zip.file(
      rels,
      (await zip.file(rels)!.async('string')).replace(
        /Target="(?:\/xl\/|xl\/)?worksheets\/sheet1\.xml"/,
        'Target="../xl/worksheets/sheet1.xml"',
      ),
    )
    writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer' }))
    const ops = join(dir, 'ops.json')
    writeFileSync(ops, JSON.stringify([{ op: 'set_cell', address: 'A1', value: 5 }]))
    const applied = await run(['sheet', 'apply', out, '--ops', ops, '--json'])
    expect(applied.code).toBe(0)
    // the scan used to miss the sheet, find no formulas and answer cached_values: true in silence
    expect(JSON.stringify(applied.json())).toContain('dependent_formulas_not_refreshed')
    expect(applied.json().detail.cached_values).toBe(false)
  })

  it('stays quiet when the batch cannot change a value', async () => {
    const dir = tempDir()
    const table = join(dir, 't.json')
    writeFileSync(table, JSON.stringify([[2, '=A1*10']]))
    const out = join(dir, 't.xlsx')
    await run(['create', '--type', 'xlsx', '--from', table, '--out', out])
    const ops = join(dir, 'ops.json')
    writeFileSync(
      ops,
      JSON.stringify([{ op: 'set_col_width', column: 'A', widthPx: 120, count: 1 }]),
    )
    const applied = await run(['sheet', 'apply', out, '--ops', ops, '--json'])
    expect(applied.code).toBe(0)
    expect(JSON.stringify(applied.json())).not.toContain('dependent_formulas_not_refreshed')
  })
})
