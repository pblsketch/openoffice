import { describe, expect, it } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { csvToXlsxBuffer } from '@genoffice/xlsx-gateway/gateway/csv-import'
import { readMergeDataSource } from '../src/main/merge-data-source'

/**
 * The data source of the mail merge: a local .xlsx or .csv read as a field
 * list plus records. genoffice#2097.
 */

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'genoffice-merge-'))
}

describe('readMergeDataSource', () => {
  it('reads a CSV with a UTF-8 BOM and quoted fields', async () => {
    const dir = await tempDir()
    const path = join(dir, 'recipients.csv')
    await writeFile(
      path,
      '﻿Name,Note\r\n"Ada Lovelace","a, b"\r\n"Grace Hopper","line1\nline2"\r\n',
      'utf8',
    )
    const source = await readMergeDataSource(path)
    expect(source.name).toBe('recipients.csv')
    expect(source.fields).toEqual(['Name', 'Note'])
    expect(source.records).toEqual([
      { Name: 'Ada Lovelace', Note: 'a, b' },
      { Name: 'Grace Hopper', Note: 'line1\nline2' },
    ])
  })

  it('reads the first sheet of an xlsx', async () => {
    const dir = await tempDir()
    const path = join(dir, 'recipients.xlsx')
    await writeFile(path, await csvToXlsxBuffer('First Name,Age\nAda,36\nGrace,45\n'))
    const source = await readMergeDataSource(path)
    expect(source.name).toBe('recipients.xlsx')
    expect(source.fields).toEqual(['First Name', 'Age'])
    expect(source.records).toEqual([
      { 'First Name': 'Ada', Age: '36' },
      { 'First Name': 'Grace', Age: '45' },
    ])
  })

  it('names an empty header column and separates a repeated one', async () => {
    const dir = await tempDir()
    const path = join(dir, 'recipients.csv')
    await writeFile(path, 'Name,,Name\nAda,x,y\n', 'utf8')
    const source = await readMergeDataSource(path)
    expect(source.fields).toEqual(['Name', 'Column2', 'Name2'])
    expect(source.records).toEqual([{ Name: 'Ada', Column2: 'x', Name2: 'y' }])
  })

  it('keeps a one-column note file in one column, as Sheets opens it', async () => {
    const dir = await tempDir()
    const path = join(dir, 'notes.csv')
    await writeFile(path, 'note\nalpha;beta\ngamma\n', 'utf8')
    const source = await readMergeDataSource(path)
    expect(source.fields).toEqual(['note'])
    expect(source.records).toEqual([{ note: 'alpha;beta' }, { note: 'gamma' }])
  })

  it('splits a European semicolon list with decimal commas', async () => {
    const dir = await tempDir()
    const path = join(dir, 'liste.csv')
    await writeFile(path, 'Name;Wert\nA;1,5\n', 'utf8')
    const source = await readMergeDataSource(path)
    expect(source.fields).toEqual(['Name', 'Wert'])
    expect(source.records).toEqual([{ Name: 'A', Wert: '1,5' }])
  })

  it('obeys a sep= declaration, tabs, quoted commas and a single column', async () => {
    const dir = await tempDir()
    const declared = join(dir, 'declared.csv')
    await writeFile(declared, 'sep=;\nName,x;Age\nAda,L;36\n', 'utf8')
    expect((await readMergeDataSource(declared)).records).toEqual([
      { 'Name,x': 'Ada,L', Age: '36' },
    ])

    const tabbed = join(dir, 'tabbed.csv')
    await writeFile(tabbed, 'Name\tAge\nAda\t36\n', 'utf8')
    expect((await readMergeDataSource(tabbed)).records).toEqual([{ Name: 'Ada', Age: '36' }])

    const quoted = join(dir, 'quoted.csv')
    await writeFile(quoted, 'Name,Note\n"Ada, L.",x\n', 'utf8')
    expect((await readMergeDataSource(quoted)).records).toEqual([{ Name: 'Ada, L.', Note: 'x' }])

    const single = join(dir, 'single.csv')
    await writeFile(single, 'Name\nAda\nGrace\n', 'utf8')
    const source = await readMergeDataSource(single)
    expect(source.fields).toEqual(['Name'])
    expect(source.records).toEqual([{ Name: 'Ada' }, { Name: 'Grace' }])
  })

  it('refuses a format it cannot read', async () => {
    const dir = await tempDir()
    const path = join(dir, 'recipients.txt')
    await writeFile(path, 'Name\nAda\n', 'utf8')
    await expect(readMergeDataSource(path)).rejects.toThrow(/unsupported data source/)
  })
})
