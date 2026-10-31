import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DriveApi, DriveFile } from '@genoffice/google-drive'
import {
  DriveFiles,
  type DriveFilesDeps,
  type SyncAnswer,
  type SyncNotice,
  type SyncQuestion,
} from '../src/main/drive/drive-files'

const md5 = (bytes: Uint8Array | string) => createHash('md5').update(bytes).digest('hex')

/** A Drive in memory: files by id, with content and the fields the service reads */
class FakeDrive {
  files = new Map<string, DriveFile & { bytes: Uint8Array }>()
  uploads: { target: unknown; text: string }[] = []
  failNext: string | null = null
  private next = 1

  add(file: Partial<DriveFile> & { id: string; name: string; text?: string }) {
    const bytes = Buffer.from(file.text ?? '')
    const google = (file.mimeType ?? '').startsWith('application/vnd.google-apps.')
    this.files.set(file.id, {
      mimeType: 'application/pdf',
      modifiedTime: '2026-10-01T00:00:00Z',
      canEdit: true,
      parents: ['folder-1'],
      ...file,
      ...(google ? {} : { md5Checksum: md5(bytes) }),
      bytes,
    })
  }

  edit(id: string, text: string) {
    const f = this.files.get(id)!
    f.bytes = Buffer.from(text)
    f.md5Checksum = md5(f.bytes)
    f.modifiedTime = '2026-10-02T00:00:00Z'
  }

  api(): DriveApi {
    const meta = (f: DriveFile & { bytes: Uint8Array }): DriveFile => {
      const { bytes: _bytes, ...rest } = f
      return rest
    }
    return {
      file: async (id: string) => {
        const f = this.files.get(id)
        return f ? { ok: true, file: meta(f) } : { ok: false, kind: 'not-found' }
      },
      download: async (id: string) => ({ ok: true, bytes: this.files.get(id)!.bytes }),
      export: async (id: string) => ({
        ok: true,
        bytes: Buffer.from(`export of ${this.files.get(id)!.name}`),
      }),
      upload: async (
        target: { existingId: string } | { name: string; parentId?: string },
        bytes: Uint8Array,
      ) => {
        if (this.failNext) {
          const kind = this.failNext
          this.failNext = null
          return { ok: false, kind }
        }
        this.uploads.push({ target, text: Buffer.from(bytes).toString() })
        if ('existingId' in target) {
          this.edit(target.existingId, Buffer.from(bytes).toString())
          return { ok: true, file: meta(this.files.get(target.existingId)!) }
        }
        const id = `new-${this.next++}`
        this.add({ id, name: target.name, text: Buffer.from(bytes).toString() })
        return { ok: true, file: meta(this.files.get(id)!) }
      },
    } as unknown as DriveApi
  }
}

let dir: string
let drive: FakeDrive
let opened: string[]
let questions: SyncQuestion[]
let notices: SyncNotice[]
let answer: SyncAnswer
let onChange: (path: string) => void

function service(over: Partial<DriveFilesDeps> = {}): DriveFiles {
  return new DriveFiles({
    api: () => drive.api(),
    connected: () => true,
    cacheDir: join(dir, 'drive-cache'),
    openPath: (path) => {
      opened.push(path)
      return true
    },
    isOpen: () => false,
    ask: async (q) => {
      questions.push(q)
      return answer
    },
    notify: (n) => notices.push(n),
    copyName: (name) => `${name} (copy)`,
    debounceMs: 0,
    retryDelaysMs: [10, 10, 10],
    watch: (_dir, cb) => {
      onChange = cb
      return () => {}
    },
    ...over,
  })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'drive-files-'))
  drive = new FakeDrive()
  opened = []
  questions = []
  notices = []
  answer = 'copy'
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function save(files: DriveFiles, path: string, text: string) {
  writeFileSync(path, text)
  onChange(path)
  await new Promise((r) => setTimeout(r, 5))
  const entry = files.entryFor(path)!
  await files.syncIfChanged(entry.sourceId)
}

describe('DriveFiles.open', () => {
  it('downloads a file into the cache and opens the copy', async () => {
    drive.add({ id: 'f1', name: 'report.pdf', text: 'v1' })
    const files = service()
    expect(await files.open('f1')).toEqual({ ok: true })
    expect(opened).toHaveLength(1)
    expect(opened[0]!.startsWith(join(dir, 'drive-cache', 'f1'))).toBe(true)
    expect(readFileSync(opened[0]!, 'utf8')).toBe('v1')
  })

  it('exports a Google document to Office', async () => {
    drive.add({ id: 'g1', name: '회의록', mimeType: 'application/vnd.google-apps.document' })
    const files = service()
    await files.open('g1')
    expect(opened[0]!.endsWith('회의록.docx')).toBe(true)
    expect(files.snapshot()[0]).toMatchObject({ google: true, targetId: null })
  })

  it('refuses what no editor opens', async () => {
    drive.add({ id: 'v', name: 'clip.mp4', mimeType: 'video/mp4' })
    expect(await service().open('v')).toEqual({ ok: false, kind: 'unsupported' })
  })

  it('keeps a copy with unsent changes instead of downloading over it', async () => {
    drive.add({ id: 'f1', name: 'a.md', mimeType: 'text/markdown', text: 'v1' })
    const files = service({ connected: () => false })
    await files.open('f1')
    writeFileSync(opened[0]!, 'local edit')
    drive.edit('f1', 'remote edit')
    await files.open('f1')
    expect(readFileSync(opened[1]!, 'utf8')).toBe('local edit')
  })

  it('refreshes a clean copy when Drive has a newer version', async () => {
    drive.add({ id: 'f1', name: 'a.md', mimeType: 'text/markdown', text: 'v1' })
    const files = service()
    await files.open('f1')
    drive.edit('f1', 'v2')
    await files.open('f1')
    expect(readFileSync(opened[1]!, 'utf8')).toBe('v2')
  })
})

describe('DriveFiles saving back', () => {
  it('uploads a save over the same Drive file', async () => {
    drive.add({ id: 'f1', name: 'a.md', mimeType: 'text/markdown', text: 'v1' })
    const files = service()
    await files.open('f1')
    await save(files, opened[0]!, 'v2')
    expect(drive.uploads).toEqual([{ target: { existingId: 'f1' }, text: 'v2' }])
    expect(questions).toEqual([])
  })

  it('does not upload a file that did not change', async () => {
    drive.add({ id: 'f1', name: 'a.md', mimeType: 'text/markdown', text: 'v1' })
    const files = service()
    await files.open('f1')
    await save(files, opened[0]!, 'v1')
    expect(drive.uploads).toEqual([])
  })

  it('asks before overwriting a file someone changed in Drive', async () => {
    drive.add({ id: 'f1', name: 'a.md', mimeType: 'text/markdown', text: 'v1' })
    const files = service()
    await files.open('f1')
    drive.edit('f1', 'theirs')
    answer = 'copy'
    await save(files, opened[0]!, 'mine')
    expect(questions).toEqual([{ kind: 'changed', name: 'a.md' }])
    expect(drive.files.get('f1')!.bytes.toString()).toBe('theirs')
    expect(drive.uploads[0]).toEqual({
      target: { name: 'a.md (copy)', parentId: 'folder-1' },
      text: 'mine',
    })
    expect(notices).toEqual([{ kind: 'saved-copy', name: 'a.md', copyName: 'a.md (copy)' }])
    // the next save goes to the copy, without asking again
    await save(files, opened[0]!, 'mine 2')
    expect(drive.uploads[1]).toEqual({ target: { existingId: 'new-1' }, text: 'mine 2' })
    expect(questions).toHaveLength(1)
  })

  it('overwrites when the person says so', async () => {
    drive.add({ id: 'f1', name: 'a.md', mimeType: 'text/markdown', text: 'v1' })
    const files = service()
    await files.open('f1')
    drive.edit('f1', 'theirs')
    answer = 'overwrite'
    await save(files, opened[0]!, 'mine')
    expect(drive.files.get('f1')!.bytes.toString()).toBe('mine')
  })

  it('keeps the change on this PC only and stops uploading it', async () => {
    drive.add({ id: 'f1', name: 'a.md', mimeType: 'text/markdown', text: 'v1', canEdit: false })
    const files = service()
    await files.open('f1')
    answer = 'local'
    await save(files, opened[0]!, 'mine')
    expect(questions).toEqual([{ kind: 'read-only', name: 'a.md' }])
    await save(files, opened[0]!, 'mine again')
    expect(drive.uploads).toEqual([])
    expect(questions).toHaveLength(1)
  })

  it('never overwrites a Google document: the first save makes an Office file beside it', async () => {
    drive.add({ id: 'g1', name: '회의록', mimeType: 'application/vnd.google-apps.document' })
    const files = service()
    await files.open('g1')
    await save(files, opened[0]!, 'edited')
    expect(drive.uploads[0]).toEqual({
      target: { name: '회의록.docx', parentId: 'folder-1' },
      text: 'edited',
    })
    expect(notices[0]).toEqual({
      kind: 'saved-office-copy',
      name: '회의록',
      copyName: '회의록.docx',
    })
    await save(files, opened[0]!, 'edited 2')
    expect(drive.uploads[1]).toEqual({ target: { existingId: 'new-1' }, text: 'edited 2' })
  })

  it('makes the Office file in My Drive when the folder is not one the app may see', async () => {
    drive.add({ id: 'g1', name: '회의록', mimeType: 'application/vnd.google-apps.document' })
    const files = service()
    await files.open('g1')
    // drive.file reaches the picked file, not the folder it sits in
    drive.failNext = 'not-found'
    await save(files, opened[0]!, 'edited')
    expect(drive.uploads[0]).toEqual({ target: { name: '회의록.docx' }, text: 'edited' })
  })

  it('waits while disconnected and uploads when Drive comes back', async () => {
    drive.add({ id: 'f1', name: 'a.md', mimeType: 'text/markdown', text: 'v1' })
    let connected = true
    const files = service({ connected: () => connected })
    await files.open('f1')
    connected = false
    await save(files, opened[0]!, 'offline edit')
    expect(drive.uploads).toEqual([])
    connected = true
    files.reconnected()
    await files.syncIfChanged('f1')
    expect(drive.uploads).toEqual([{ target: { existingId: 'f1' }, text: 'offline edit' }])
  })

  it('retries a failed upload and says so once retries run out', async () => {
    drive.add({ id: 'f1', name: 'a.md', mimeType: 'text/markdown', text: 'v1' })
    const files = service({ retryDelaysMs: [5] })
    await files.open('f1')
    drive.failNext = 'network'
    await save(files, opened[0]!, 'v2')
    expect(notices).toEqual([{ kind: 'upload-failed', name: 'a.md' }])
    await vi.waitFor(() => expect(drive.uploads).toHaveLength(1))
  })

  it('uploads at the next start what was saved but not sent', async () => {
    drive.add({ id: 'f1', name: 'a.md', mimeType: 'text/markdown', text: 'v1' })
    const first = service({ connected: () => false })
    await first.open('f1')
    writeFileSync(opened[0]!, 'saved before quitting')
    first.stop()
    const second = service()
    await second.start()
    await second.syncIfChanged('f1')
    expect(drive.uploads).toEqual([{ target: { existingId: 'f1' }, text: 'saved before quitting' }])
  })
})

describe('DriveFiles.inCache', () => {
  it('accepts only paths inside the cache folder', () => {
    const files = service()
    expect(files.inCache(join(dir, 'drive-cache', 'f1', 'a.md'))).toBe(true)
    expect(files.inCache(join(dir, 'drive-cache', '..', 'other.md'))).toBe(false)
    expect(files.inCache(join(dir, 'drive-cache'))).toBe(false)
  })
})
