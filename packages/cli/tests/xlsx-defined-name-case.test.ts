import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { run, tempDir } from './helpers'

async function parts(path: string): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(readFileSync(path))
  const out = new Map<string, string>()
  for (const name of Object.keys(zip.files)) {
    if (/\.(xml|rels|vml)$/.test(name)) out.set(name, await zip.file(name)!.async('string'))
  }
  return out
}

async function book(dir: string): Promise<string> {
  const table = join(dir, 'sales.json')
  writeFileSync(
    table,
    JSON.stringify([
      ['region', 'q1', 'q2'],
      ['North', 120, 150],
    ]),
  )
  const out = join(dir, 'sales.xlsx')
  expect((await run(['create', '--type', 'xlsx', '--from', table, '--out', out])).code).toBe(0)
  return out
}

async function apply(path: string, ops: unknown[]) {
  const file = join(path, '..', `ops-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(file, JSON.stringify(ops))
  return run(['sheet', 'apply', path, '--ops', file, '--json'])
}

function definedNames(workbook: string): Array<{ name: string; ref: string }> {
  return [...workbook.matchAll(/<definedName name="([^"]+)">([^<]*)<\/definedName>/g)].map((m) => ({
    name: m[1]!,
    ref: m[2]!,
  }))
}

describe('defined names are matched without regard to case', () => {
  it('updates and deletes an existing name when only the spelling case differs', async () => {
    const dir = tempDir()
    const out = await book(dir)
    expect(
      (await apply(out, [{ op: 'add_defined_name', name: 'Rate', ref: 'sales!$B$2' }])).code,
    ).toBe(0)
    const updated = await apply(out, [{ op: 'add_defined_name', name: 'rate', ref: 'sales!$C$2' }])
    expect(updated.code, updated.stdout).toBe(0)
    expect(definedNames((await parts(out)).get('xl/workbook.xml')!)).toEqual([
      { name: 'rate', ref: 'sales!$C$2' },
    ])
    const gone = await apply(out, [{ op: 'delete_defined_name', name: 'RATE' }])
    expect(gone.code, gone.stdout).toBe(0)
    expect((await parts(out)).get('xl/workbook.xml')).not.toContain('<definedName')
  })
})
