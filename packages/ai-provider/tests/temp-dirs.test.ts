import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cleanupTrackedTempDirs,
  createTrackedTempDir,
  removeTrackedTempDir,
} from '../src/subscription/temp-dirs'

let root: string
let records: string
let tempRoot: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ieum-temp-dirs-test-'))
  records = join(root, 'records')
  tempRoot = join(root, 'temp')
  await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('tracked temporary folders', () => {
  it('removes a recorded folder and its record when the owner is gone', async () => {
    const dir = await createTrackedTempDir('genoffice-codex-app-server-', {
      tempRoot,
      recordDir: records,
      ownerPid: 2_147_483_647,
    })
    await writeFile(join(dir, 'image-1.png'), 'pixels')
    expect(await cleanupTrackedTempDirs(records, { tempRoot, alive: () => false })).toBe(1)
    await expect(readFile(join(dir, 'image-1.png'))).rejects.toThrow()
    expect(await cleanupTrackedTempDirs(records, { tempRoot, alive: () => false })).toBe(0)
  })

  it('keeps a folder whose owner process still runs', async () => {
    const dir = await createTrackedTempDir('genoffice-claude-code-', {
      tempRoot,
      recordDir: records,
    })
    expect(await cleanupTrackedTempDirs(records, { tempRoot, alive: () => true })).toBe(0)
    expect((await stat(dir)).isDirectory()).toBe(true)
    // the folder is still there; the normal end removes it
    await removeTrackedTempDir(dir, { recordDir: records })
    await expect(stat(dir)).rejects.toThrow()
  })

  it('never removes a folder outside the system temp directory or without the app prefix', async () => {
    const outside = join(root, 'genoffice-codex-app-server-elsewhere')
    await mkdir(outside)
    const record = join(records, 'ai-temp-dir-0000000000000000.json')
    await mkdir(records, { recursive: true })
    await writeFile(
      record,
      JSON.stringify({
        version: 1,
        path: outside,
        ownerPid: 1,
        ownerStartedAt: 1,
      }),
    )
    const other = join(tempRoot, 'not-ours')
    await mkdir(other)
    await writeFile(
      join(records, 'ai-temp-dir-1111111111111111.json'),
      JSON.stringify({ version: 1, path: other, ownerPid: 1, ownerStartedAt: 1 }),
    )
    expect(await cleanupTrackedTempDirs(records, { tempRoot, alive: () => false })).toBe(0)
    expect((await stat(outside)).isDirectory()).toBe(true)
    expect((await stat(other)).isDirectory()).toBe(true)
  })

  it('drops a malformed record instead of guessing', async () => {
    await mkdir(records, { recursive: true })
    await writeFile(join(records, 'ai-temp-dir-2222222222222222.json'), '{not json')
    expect(await cleanupTrackedTempDirs(records, { tempRoot, alive: () => false })).toBe(0)
    await expect(readFile(join(records, 'ai-temp-dir-2222222222222222.json'))).rejects.toThrow()
  })
})
