import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveSheetName } from '../src/suggest'
import { run, tempDir } from './helpers'
import { book, cells } from './xlsx-helpers'

describe('resolveSheetName', () => {
  it('prefers an exact spelling and otherwise matches case-insensitively', () => {
    expect(resolveSheetName('Data', ['Notes', 'Data'])).toBe('Data')
    expect(resolveSheetName('data', ['Notes', 'Data'])).toBe('Data')
    expect(resolveSheetName('DATA', ['Notes', 'Data'])).toBe('Data')
    expect(resolveSheetName('Data', ['data'])).toBe('data')
    expect(resolveSheetName('Other', ['Notes', 'Data'])).toBeUndefined()
  })
})

describe('sheet apply --ops matches worksheet names case-insensitively', () => {
  it('writes a cell when the op uses a different spelling of the sheet name', async () => {
    const dir = tempDir()
    const file = await book(dir, [['hello']])
    const ops = join(dir, 'ops.json')
    writeFileSync(
      ops,
      JSON.stringify([{ op: 'set_cell', sheet: 'TABLE', address: 'A2', value: 'ok' }]),
    )
    const r = await run(['sheet', 'apply', file, '--ops', ops, '--json'])
    expect(r.code, r.stdout).toBe(0)
    expect((await cells(file, 'xl/worksheets/sheet1.xml')).get('A2')?.value).toBe('ok')
  })

  it('still refuses a name that is not on the workbook', async () => {
    const dir = tempDir()
    const file = await book(dir, [['hello']])
    const ops = join(dir, 'ops.json')
    writeFileSync(
      ops,
      JSON.stringify([{ op: 'set_cell', sheet: 'Missing', address: 'A2', value: 'no' }]),
    )
    const r = await run(['sheet', 'apply', file, '--ops', ops, '--json'])
    expect(r.code, r.stdout).toBe(1)
    expect(r.json().error).toBe('sheet_not_found')
  })
})
