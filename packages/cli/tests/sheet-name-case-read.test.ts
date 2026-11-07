import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { run, tempDir } from './helpers'

const fake = vi.hoisted(() => ({ opens: [] as string[] }))
vi.mock('../src/resources', async (original) => ({
  ...(await original<object>()),
  xlsxSidecarPath: () => 'fake-sidecar',
}))
vi.mock('../../../apps/sheets/src/main/xlsx-sidecar-client', () => ({
  XlsxSidecarClient: class {
    async open(path: string) {
      fake.opens.push(path)
      return {
        sessionId: 'test',
        activeTab: 0,
        sheets: [{ id: '1', name: 'Data', rowCount: 1, columnCount: 1 }],
      }
    }
    async readRange() {
      return { cells: [{ row: 0, column: 0, value: 'hello' }], indexingComplete: true }
    }
    async close() {}
    stop() {}
  },
}))

describe('sheet read matches worksheet names case-insensitively', () => {
  beforeEach(() => {
    fake.opens.length = 0
  })

  it('finds a sheet named Data when asked for data', async () => {
    const path = join(tempDir(), 'book.xlsx')
    writeFileSync(path, 'fixture')
    const r = await run(['sheet', 'read', path, '--sheet', 'data', '--json'])
    expect(r.code, r.stdout).toBe(0)
    expect(r.json().detail.sheet).toBe('Data')
    expect(r.json().detail.rows[0][0]).toBe('hello')
  })

  it('still refuses a name that is not on the workbook', async () => {
    const path = join(tempDir(), 'book.xlsx')
    writeFileSync(path, 'fixture')
    const r = await run(['sheet', 'read', path, '--sheet', 'Notes', '--json'])
    expect(r.code, r.stdout).toBe(1)
    expect(r.json().error).toBe('sheet_not_found')
  })
})
