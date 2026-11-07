import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { run, tempDir } from './helpers'

describe('valued flags refuse a missing value instead of falling back', () => {
  it('does not treat a valueless sheet --range as the default used range', async () => {
    const file = join(tempDir(), 'book.xlsx')
    writeFileSync(file, 'fixture')
    const r = await run(['sheet', 'read', file, '--range', '--json'])
    expect(r.code, r.stdout).toBe(1)
    expect(r.json().error).toBe('missing_argument')
  })

  it('does not write convert output to the default path when --out has no value', async () => {
    const dir = tempDir()
    const input = join(dir, 'note.md')
    writeFileSync(input, '# Title\n')
    const r = await run(['convert', input, '--to', 'docx', '--out', '--json'])
    expect(r.code, r.stdout).toBe(1)
    expect(r.json().error).toBe('missing_argument')
    expect(existsSync(join(dir, 'note.docx'))).toBe(false)
  })

  it('refuses a valueless info --password', async () => {
    const file = join(tempDir(), 'note.md')
    writeFileSync(file, '# Title\n')
    const r = await run(['info', file, '--password', '--json'])
    expect(r.code, r.stdout).toBe(1)
    expect(r.json().error).toBe('missing_argument')
  })

  it('keeps explicit values working', async () => {
    const dir = tempDir()
    const input = join(dir, 'note.md')
    writeFileSync(input, '# Title\n')
    expect((await run(['info', input, '--json'])).code).toBe(0)
  })
})
