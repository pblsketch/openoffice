// @vitest-environment node
/**
 * Saving: nothing changed writes nothing; a change writes only the edited
 * ranges (and the EPUB 3 `dcterms:modified`), then moves the stored
 * translations to the new bytes, results first and job records second.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { epubDocumentHash, epubTranslationUnits } from '@genoffice/epub-engine'
import { blockKeyString, ResultStore } from '@genoffice/pdf-structure/store'
import { EpubBookSession } from '../src/main/book-session'
import { saveBook, type MigrationStore, type SaveDeps } from '../src/main/save-pipeline'
import { buildBook, entryBytes, entryText } from './helpers/book'

async function session(options: Parameters<typeof buildBook>[0] = {}) {
  const bytes = await buildBook(options)
  const opened = await EpubBookSession.open(bytes)
  if (!opened.ok) throw new Error('did not open')
  return { s: opened.session, bytes }
}

function fakeDeps(calls: string[] = []) {
  const written = new Map<string, Uint8Array>()
  const store: MigrationStore = {
    migrateDocument: vi.fn(async (input) => {
      calls.push(`migrateDocument:${input.oldDocHash.slice(0, 6)}->${input.newDocHash.slice(0, 6)}`)
      return { aiReadPages: 0, translationBlocks: 2, languages: ['ko'] }
    }),
    listJobs: vi.fn(async () => []),
    readJob: vi.fn(),
    writeJob: vi.fn(),
  }
  const migrateJobRecords = vi.fn(async (_store: unknown, oldHash: string, newHash: string) => {
    calls.push(`migrateJobRecords:${oldHash.slice(0, 6)}->${newHash.slice(0, 6)}`)
    return 1
  })
  const deps: SaveDeps = {
    write: vi.fn(async (path: string, bytes: Uint8Array) => {
      calls.push(`write:${path}`)
      written.set(path, bytes)
    }),
    store: () => store,
    migrateJobRecords,
    now: () => new Date('2026-10-24T05:06:07.890Z'),
  }
  return { deps, written, store, migrateJobRecords, calls }
}

async function editFirstParagraph(s: EpubBookSession, text: string) {
  const chapter = await s.readChapter(0)
  if (!chapter.ok || chapter.broken) throw new Error('no chapter')
  const block = chapter.blocks.find((b) => b.kind === 'p')!
  const result = await s.applyEdits(0, [{ op: 'replace', blockId: block.id, text }])
  if (!result.ok) throw new Error('edit refused')
}

describe('saveBook', () => {
  it('writes nothing when nothing changed', async () => {
    const { s } = await session()
    const { deps, written, store } = fakeDeps()
    const outcome = await saveBook(s, '/books/a.epub', true, deps)
    expect(outcome).toMatchObject({ ok: true, written: false, docHash: s.docHash })
    expect(written.size).toBe(0)
    expect(store.migrateDocument).not.toHaveBeenCalled()
  })

  it('a Save As of an unchanged book copies the original bytes', async () => {
    const { s, bytes } = await session()
    const { deps, written } = fakeDeps()
    const outcome = await saveBook(s, '/books/copy.epub', false, deps)
    expect(outcome).toMatchObject({ ok: true, written: true })
    expect(written.get('/books/copy.epub')).toEqual(bytes)
  })

  it('writes the edited ranges only, stamps dcterms:modified, then migrates results before job records', async () => {
    const { s, bytes } = await session()
    const oldHash = s.docHash
    await editFirstParagraph(s, 'Changed.')
    const { deps, written, calls } = fakeDeps()
    const outcome = await saveBook(s, '/books/a.epub', true, deps)
    expect(outcome.ok && outcome.written).toBe(true)
    const saved = written.get('/books/a.epub')!
    const newHash = await epubDocumentHash(saved)
    expect(outcome).toMatchObject({ docHash: newHash })
    expect(newHash).not.toBe(oldHash)

    // every other entry has the same content bytes
    const before = await entryBytes(bytes)
    const after = await entryBytes(saved)
    expect([...after.keys()]).toEqual([...before.keys()])
    for (const [name, data] of before) {
      if (name === 'OEBPS/text/one.xhtml' || name === 'OEBPS/content.opf') continue
      expect(after.get(name), name).toEqual(data)
    }
    const chapterBefore = await entryText(bytes, 'OEBPS/text/one.xhtml')
    expect(await entryText(saved, 'OEBPS/text/one.xhtml')).toBe(
      chapterBefore.replace('First paragraph.', 'Changed.'),
    )
    expect(await entryText(saved, 'OEBPS/content.opf')).toContain(
      '<meta property="dcterms:modified">2026-10-24T05:06:07Z</meta>',
    )

    expect(calls).toEqual([
      'write:/books/a.epub',
      `migrateDocument:${oldHash.slice(0, 6)}->${newHash.slice(0, 6)}`,
      `migrateJobRecords:${oldHash.slice(0, 6)}->${newHash.slice(0, 6)}`,
    ])
    // the session now stands on the saved bytes
    expect(s.docHash).toBe(newHash)
    expect(s.bytes).toBe(saved)
    expect(s.isDirty()).toBe(false)
  })

  it("passes the saved book's fingerprints and block keys to migrateDocument", async () => {
    const { s } = await session()
    await editFirstParagraph(s, 'Changed.')
    const { deps, store } = fakeDeps()
    await saveBook(s, '/books/a.epub', true, deps)
    const input = vi.mocked(store.migrateDocument).mock.calls[0]![0] as unknown as {
      pageFingerprints: string[]
      blockKeys: unknown[]
    }
    // title-and-contents fingerprint + two chapters
    expect(input.pageFingerprints).toHaveLength(3)
    expect(input.blockKeys.length).toBeGreaterThan(0)
    const units = (await epubTranslationUnits(s.book)).units
    expect(vi.mocked(store.migrateDocument).mock.calls[0]![0].keepBlockKeys).toEqual(
      units.map((u) => u.key),
    )
  })

  it('moves the stored translation of unchanged blocks only, not of the edited one', async () => {
    const root = mkdtempSync(join(tmpdir(), 'genoffice-epub-save-'))
    try {
      const realStore = new ResultStore(root)
      const { s } = await session()
      const oldHash = s.docHash
      const units = (await epubTranslationUnits(s.book)).units
      await realStore.writeTranslationMeta(oldHash, 'ko', { provider: 'codex', model: 'm' })
      await realStore.writeTranslationBlocks(
        oldHash,
        'ko',
        units.map((u) => ({ key: u.key, status: 'translated' as const, text: `ko:${u.text}` })),
      )
      await editFirstParagraph(s, 'Changed.')
      const { deps } = fakeDeps()
      const outcome = await saveBook(s, '/books/a.epub', true, { ...deps, store: () => realStore })
      if (!outcome.ok) throw new Error(outcome.error)

      const edited = units.find((u) => u.text === 'First paragraph.')!
      const kept = units.find((u) => u.text === 'Second paragraph.')!
      const moved = await realStore.readTranslation(outcome.docHash, 'ko')
      expect(moved!.blocks.has(blockKeyString(edited.key))).toBe(false)
      expect(moved!.blocks.get(blockKeyString(kept.key))?.text).toBe('ko:Second paragraph.')
      expect(moved!.blocks.size).toBe(units.length - 1)
      expect(outcome.migration?.results.translationBlocks).toBe(units.length - 1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not touch the session when the write fails', async () => {
    const { s } = await session()
    const oldHash = s.docHash
    await editFirstParagraph(s, 'Changed.')
    const { deps, store } = fakeDeps()
    deps.write = async () => {
      throw new Error('disk full')
    }
    await expect(saveBook(s, '/books/a.epub', true, deps)).rejects.toThrow('disk full')
    expect(s.docHash).toBe(oldHash)
    expect(s.isDirty()).toBe(true)
    expect(store.migrateDocument).not.toHaveBeenCalled()
  })

  it('a failed migration does not fail the save', async () => {
    const { s } = await session()
    await editFirstParagraph(s, 'Changed.')
    const { deps, store, migrateJobRecords } = fakeDeps()
    vi.mocked(store.migrateDocument).mockRejectedValueOnce(new Error('store broken'))
    const log = vi.fn()
    const outcome = await saveBook(s, '/books/a.epub', true, { ...deps, log })
    expect(outcome).toMatchObject({ ok: true, written: true, migration: null })
    expect(migrateJobRecords).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledOnce()
  })

  it("works without the shell's job-record migration (standalone)", async () => {
    const { s } = await session()
    await editFirstParagraph(s, 'Changed.')
    const { deps } = fakeDeps()
    delete deps.migrateJobRecords
    const outcome = await saveBook(s, '/books/a.epub', true, deps)
    expect(outcome.ok && outcome.migration).toMatchObject({ jobs: 0 })
  })

  it('an edit that arrives while the save runs stays unsaved', async () => {
    const { s } = await session()
    await editFirstParagraph(s, 'Saved edit.')
    const { deps, written } = fakeDeps()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const write = deps.write
    deps.write = async (path, bytes) => {
      await gate
      await write(path, bytes)
    }
    const saving = saveBook(s, '/books/a.epub', true, deps)
    await new Promise((r) => setTimeout(r, 50))
    const chapter = await s.readChapter(1)
    if (!chapter.ok || chapter.broken) throw new Error('no chapter')
    const block = chapter.blocks.find((b) => b.kind === 'p')!
    expect(
      (await s.applyEdits(1, [{ op: 'replace', blockId: block.id, text: 'Late edit.' }])).ok,
    ).toBe(true)
    release()
    await saving
    const saved = written.get('/books/a.epub')!
    expect(await entryText(saved, 'OEBPS/text/two.xhtml')).toContain('Third paragraph.')
    expect(s.isDirty()).toBe(true)
    // saving again writes the late edit on top of the saved bytes
    const again = await saveBook(s, '/books/a.epub', true, deps)
    expect(again.ok && again.written).toBe(true)
    const second = written.get('/books/a.epub')!
    expect(await entryText(second, 'OEBPS/text/two.xhtml')).toContain('Late edit.')
    expect(await entryText(second, 'OEBPS/text/one.xhtml')).toContain('Saved edit.')
  })

  it('leaves an EPUB 2 package alone', async () => {
    const { s, bytes } = await session({ epub2: true })
    await editFirstParagraph(s, 'Changed.')
    const { deps, written } = fakeDeps()
    await saveBook(s, '/books/a.epub', true, deps)
    const saved = written.get('/books/a.epub')!
    expect(await entryText(saved, 'OEBPS/content.opf')).toBe(
      await entryText(bytes, 'OEBPS/content.opf'),
    )
  })
})
