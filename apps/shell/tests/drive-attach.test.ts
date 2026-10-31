import { mkdtempSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DriveApi, DriveFile } from '@genoffice/google-drive'
import { MAX_ATTACH_FILES, downloadPicks } from '../src/main/drive/drive-attach'

const file = (id: string, name: string, mimeType = 'application/pdf'): DriveFile => ({
  id,
  name,
  mimeType,
  modifiedTime: '2026-10-01T00:00:00Z',
  canEdit: true,
})

/** a Drive holding the given files */
function fakeDrive(files: DriveFile[]): DriveApi {
  const all = new Map(files.map((f) => [f.id, f]))
  return {
    file: async (id: string) => {
      const f = all.get(id)
      return f ? { ok: true, file: f } : { ok: false, kind: 'not-found' }
    },
    download: async (id: string) =>
      id === 'broken'
        ? { ok: false, kind: 'forbidden' }
        : { ok: true, bytes: Buffer.from(`bytes of ${id}`) },
    export: async (id: string, mime: string) => ({
      ok: true,
      bytes: Buffer.from(`${id} as ${mime}`),
    }),
  } as unknown as DriveApi
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'drive-attach-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('downloadPicks', () => {
  it('downloads files and exports Google documents, each into its own folder', async () => {
    const api = fakeDrive([
      file('p', 'report.pdf'),
      file('g', '회의록', 'application/vnd.google-apps.document'),
    ])
    const got = await downloadPicks(api, ['p', 'g'], dir)
    expect(got.failed).toBe(0)
    expect(got.paths).toHaveLength(2)
    expect(got.paths[0]!.endsWith('report.pdf')).toBe(true)
    expect(got.paths[1]!.endsWith('회의록.docx')).toBe(true)
    expect(readFileSync(got.paths[0]!, 'utf8')).toBe('bytes of p')
    expect(got.paths.every((p) => p.startsWith(dir))).toBe(true)
  })

  it('counts files Drive would not hand over', async () => {
    const api = fakeDrive([file('broken', 'x.pdf')])
    const got = await downloadPicks(api, ['broken', 'missing'], dir)
    expect(got).toEqual({ paths: [], skipped: 0, failed: 2 })
  })

  it('attaches each file once and counts what is past the limit', async () => {
    const many = Array.from({ length: MAX_ATTACH_FILES + 3 }, (_, i) => file(`f${i}`, `${i}.pdf`))
    const api = fakeDrive(many)
    const got = await downloadPicks(api, ['f0', 'f0', ...many.map((f) => f.id)], dir)
    expect(got.paths).toHaveLength(MAX_ATTACH_FILES)
    expect(got.skipped).toBe(3)
  })

  it('leaves out a picked file no editor reads', async () => {
    const api = fakeDrive([file('v', 'clip.mp4', 'video/mp4')])
    expect(await downloadPicks(api, ['v'], dir)).toEqual({ paths: [], skipped: 1, failed: 0 })
  })
})
