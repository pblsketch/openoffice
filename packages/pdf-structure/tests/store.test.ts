/** Result store (spec §6): keys, corrupt entries, migration on save, delete, size, jobs. */
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  JOB_RUNNING_WINDOW_MS,
  ResultStore,
  STORE_DIR_NAME,
  StoreWriteError,
  blockKeyString,
  documentHash,
  documentHashOfFile,
  normalizeSourceText,
  translationBlockKeys,
} from '../src/store'
import { sha256Hex } from '../src/tree'
import type { InlineRun, TextUnit } from '../src/tree'

const t = (text: string): InlineRun[] => [{ kind: 'text', text }]
const fp = (n: number) => sha256Hex(`page-${n}`)
const DOC_A = sha256Hex('doc-a')
const DOC_B = sha256Hex('doc-b')

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pdf-store-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const page = (n: number, text = `page ${n} body`) => ({ version: 1, markdown: text })

function unit(key: string, pageFp: string, text: string): TextUnit {
  return { key, runs: t(text), blockId: key, page: 1, pageFingerprint: pageFp }
}

describe('location', () => {
  it('lives in one subfolder of the given user-data folder', () => {
    const store = new ResultStore(root)
    expect(store.dir).toBe(join(root, STORE_DIR_NAME))
  })

  it('refuses a relative root and the original program folder', () => {
    expect(() => new ResultStore('relative/dir')).toThrow(TypeError)
    expect(() => new ResultStore(join(root, '.genoffice'))).toThrow(TypeError)
    expect(() => new ResultStore(join(root, '.genoffice', 'x'))).toThrow(TypeError)
  })
})

describe('document hash', () => {
  it('is the SHA-256 of the file bytes, from bytes or from the file', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 fake')
    expect(documentHash(bytes)).toBe(sha256Hex(bytes))
    const file = join(root, 'a.pdf')
    writeFileSync(file, bytes)
    expect(await documentHashOfFile(file)).toBe(sha256Hex(bytes))
  })
})

describe('translation block keys', () => {
  it('normalizes whitespace and Unicode composition', () => {
    expect(normalizeSourceText(t('  Hello \n  world  '))).toBe('Hello world')
    expect(normalizeSourceText(t('\u1100\u1161'))).toBe('\uac00')
  })

  it('is start-page fingerprint + text hash + occurrence of that hash on the page', () => {
    const keys = translationBlockKeys([
      unit('a', fp(1), 'Same'),
      unit('b', fp(1), 'Other'),
      unit('c', fp(1), ' Same '),
      unit('d', fp(2), 'Same'),
    ])
    const same = sha256Hex('Same')
    expect(keys[0]).toEqual({ pageFingerprint: fp(1), textHash: same, occurrence: 0 })
    expect(keys[1]).toEqual({
      pageFingerprint: fp(1),
      textHash: sha256Hex('Other'),
      occurrence: 0,
    })
    expect(keys[2]).toEqual({ pageFingerprint: fp(1), textHash: same, occurrence: 1 })
    expect(keys[3]).toEqual({ pageFingerprint: fp(2), textHash: same, occurrence: 0 })
    expect(blockKeyString(keys[2]!)).toBe(`${fp(1)}:${same}:1`)
  })

  it('does not depend on which other pages are in the run', () => {
    const full = translationBlockKeys([unit('a', fp(1), 'One'), unit('b', fp(2), 'Two')])
    const partial = translationBlockKeys([unit('b', fp(2), 'Two')])
    expect(partial[0]).toEqual(full[1])
  })
})

describe('AI-read pages', () => {
  it('round-trips an opaque payload keyed by page fingerprint', async () => {
    const store = new ResultStore(root)
    expect(await store.readAiReadPage(DOC_A, fp(1))).toBeNull()
    await store.writeAiReadPage(DOC_A, fp(1), page(1), { provider: 'claude-code', model: 'm' })
    const entry = await store.readAiReadPage(DOC_A, fp(1))
    expect(entry?.payload).toEqual(page(1))
    expect(entry?.provider).toBe('claude-code')
    expect(entry?.model).toBe('m')
    expect(entry?.pageFingerprint).toBe(fp(1))
    const all = await store.readAiReadPages(DOC_A)
    expect([...all.keys()]).toEqual([fp(1)])
  })

  it('rejects a payload without a version field', async () => {
    const store = new ResultStore(root)
    await expect(
      store.writeAiReadPage(DOC_A, fp(1), { markdown: 'x' } as unknown as { version: number }),
    ).rejects.toThrow(TypeError)
  })

  it('last writer wins on the same entry', async () => {
    const store = new ResultStore(root)
    await store.writeAiReadPage(DOC_A, fp(1), page(1, 'first'))
    await store.writeAiReadPage(DOC_A, fp(1), page(1, 'second'))
    expect((await store.readAiReadPage(DOC_A, fp(1)))?.payload).toEqual(page(1, 'second'))
  })
})

describe('translations', () => {
  it('keeps one translation per (document, language) with provider, model and blocks', async () => {
    const store = new ResultStore(root)
    const [k1, k2] = translationBlockKeys([unit('a', fp(1), 'One'), unit('b', fp(2), 'Two')])
    await store.writeTranslationMeta(DOC_A, 'en', { provider: 'codex', model: 'gpt-x' })
    await store.writeTranslationBlocks(DOC_A, 'en', [
      { key: k1!, status: 'translated', text: 'Uno' },
      { key: k2!, status: 'failed', reason: 'placeholders' },
    ])
    await store.writeTranslationMeta(DOC_A, 'ko', { provider: 'claude-code', model: 'c' })

    const en = await store.readTranslation(DOC_A, 'en')
    expect(en?.provider).toBe('codex')
    expect(en?.model).toBe('gpt-x')
    expect(en?.blocks.get(blockKeyString(k1!))?.text).toBe('Uno')
    expect(en?.blocks.get(blockKeyString(k2!))?.status).toBe('failed')
    expect(en?.blocks.get(blockKeyString(k2!))?.reason).toBe('placeholders')
    expect((await store.readTranslation(DOC_A, 'ko'))?.blocks.size).toBe(0)
    expect(await store.readTranslation(DOC_A, 'fr')).toBeNull()
    expect((await store.listTranslations(DOC_A)).sort()).toEqual(['en', 'ko'])
  })

  it('a restart replaces the stored translation', async () => {
    const store = new ResultStore(root)
    const [k1] = translationBlockKeys([unit('a', fp(1), 'One')])
    await store.writeTranslationMeta(DOC_A, 'en', { provider: 'codex', model: 'a' })
    await store.writeTranslationBlock(DOC_A, 'en', { key: k1!, status: 'translated', text: 'x' })
    await store.deleteTranslation(DOC_A, 'en')
    expect(await store.readTranslation(DOC_A, 'en')).toBeNull()
  })

  it('rejects a translated block without text', async () => {
    const store = new ResultStore(root)
    const [k1] = translationBlockKeys([unit('a', fp(1), 'One')])
    await expect(
      store.writeTranslationBlock(DOC_A, 'en', { key: k1!, status: 'translated' }),
    ).rejects.toThrow(TypeError)
  })
})

describe('unreadable entries', () => {
  it('a corrupt or truncated entry reads as absent and can be rewritten', async () => {
    const store = new ResultStore(root)
    await store.writeAiReadPage(DOC_A, fp(1), page(1))
    const file = store.aiReadPagePath(DOC_A, fp(1))
    writeFileSync(file, readFileSync(file, 'utf8').slice(0, 10))
    expect(await store.readAiReadPage(DOC_A, fp(1))).toBeNull()
    expect((await store.readAiReadPages(DOC_A)).size).toBe(0)
    await store.writeAiReadPage(DOC_A, fp(1), page(1))
    expect((await store.readAiReadPage(DOC_A, fp(1)))?.payload).toEqual(page(1))
  })

  it('well-formed JSON of the wrong shape reads as absent', async () => {
    const store = new ResultStore(root)
    const [k1] = translationBlockKeys([unit('a', fp(1), 'One')])
    await store.writeTranslationMeta(DOC_A, 'en', { provider: 'codex', model: 'a' })
    await store.writeTranslationBlock(DOC_A, 'en', { key: k1!, status: 'translated', text: 'x' })
    writeFileSync(store.translationBlockPath(DOC_A, 'en', k1!), '{"format":1,"status":7}')
    writeFileSync(store.translationMetaPath(DOC_A, 'en'), '[]')
    const en = await store.readTranslation(DOC_A, 'en')
    expect(en?.blocks.size).toBe(0)
    expect(en?.provider).toBeNull()
    await store.writeAiReadPage(DOC_A, fp(2), page(2))
    writeFileSync(store.aiReadPagePath(DOC_A, fp(2)), '\u0000\u0001garbage')
    expect(await store.readAiReadPage(DOC_A, fp(2))).toBeNull()
  })

  it('a corrupt job record reads as idle', async () => {
    const store = new ResultStore(root)
    await store.writeJob(DOC_A, { kind: 'ai-read', state: 'running' })
    writeFileSync(store.jobPath(DOC_A, 'ai-read'), '{"format":1,')
    expect((await store.readJob(DOC_A, 'ai-read')).state).toBe('idle')
    expect(await store.listJobs(DOC_A)).toEqual([])
  })

  it('an entry stored under another key reads as absent', async () => {
    const store = new ResultStore(root)
    await store.writeAiReadPage(DOC_A, fp(1), page(1))
    writeFileSync(
      store.aiReadPagePath(DOC_A, fp(2)),
      readFileSync(store.aiReadPagePath(DOC_A, fp(1))),
    )
    expect(await store.readAiReadPage(DOC_A, fp(2))).toBeNull()
  })
})

describe('write failures', () => {
  it('surface as a typed error the job can report, leaving the old entry intact', async () => {
    const store = new ResultStore(root)
    await store.writeAiReadPage(DOC_A, fp(1), page(1))
    // a file where the translations folder belongs: every write under it fails
    mkdirSync(join(store.dir, 'docs', DOC_A), { recursive: true })
    writeFileSync(join(store.dir, 'docs', DOC_A, 'translations'), 'not a folder')
    const [k1] = translationBlockKeys([unit('a', fp(1), 'One')])
    const err = await store
      .writeTranslationBlock(DOC_A, 'en', { key: k1!, status: 'translated', text: 'x' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StoreWriteError)
    expect((err as StoreWriteError).code).toBe('store-write-failed')
    expect(typeof (err as StoreWriteError).errno).toBe('string')
    expect((await store.readAiReadPage(DOC_A, fp(1)))?.payload).toEqual(page(1))
  })

  it('rejects keys that are not plain path segments', async () => {
    const store = new ResultStore(root)
    await expect(store.writeAiReadPage('../x', fp(1), page(1))).rejects.toThrow(TypeError)
    await expect(
      store.writeTranslationMeta(DOC_A, 'en/..', { provider: 'p', model: 'm' }),
    ).rejects.toThrow(TypeError)
  })
})

describe('migration on in-app save', () => {
  async function seedOld(store: ResultStore) {
    for (const n of [1, 2, 3]) await store.writeAiReadPage(DOC_A, fp(n), page(n))
    const keys = translationBlockKeys([
      unit('a', fp(1), 'One'),
      unit('b', fp(2), 'Two'),
      unit('c', fp(3), 'Three'),
    ])
    await store.writeTranslationMeta(DOC_A, 'en', { provider: 'codex', model: 'gpt-x' })
    await store.writeTranslationBlocks(
      DOC_A,
      'en',
      keys.map((key, i) => ({ key, status: 'translated' as const, text: `t${i + 1}` })),
    )
    await store.writeJob(DOC_A, { kind: 'translate', lang: 'en', state: 'stopped' })
    return keys
  }

  it('moves results of pages whose fingerprint survives, in any page order', async () => {
    const store = new ResultStore(root)
    const keys = await seedOld(store)
    // new document: page 3 moved to the front, page 2 changed, a new page 4
    const result = await store.migrateDocument({
      oldDocHash: DOC_A,
      newDocHash: DOC_B,
      pageFingerprints: [fp(3), fp(1), fp(99), fp(4)],
    })
    expect(result).toEqual({ aiReadPages: 2, translationBlocks: 2, languages: ['en'] })

    const read = await store.readAiReadPages(DOC_B)
    expect([...read.keys()].sort()).toEqual([fp(1), fp(3)].sort())
    expect(read.get(fp(3))?.payload).toEqual(page(3))

    const en = await store.readTranslation(DOC_B, 'en')
    expect(en?.provider).toBe('codex')
    expect(en?.model).toBe('gpt-x')
    expect(en?.blocks.get(blockKeyString(keys[0]!))?.text).toBe('t1')
    expect(en?.blocks.get(blockKeyString(keys[2]!))?.text).toBe('t3')
    expect(en?.blocks.has(blockKeyString(keys[1]!))).toBe(false)

    // job records stay with the document they ran on; old results remain
    expect(await store.listJobs(DOC_B)).toEqual([])
    expect((await store.readAiReadPages(DOC_A)).size).toBe(3)
    expect((await store.readTranslation(DOC_A, 'en'))?.blocks.size).toBe(3)
  })

  it('with a block key filter, moves only the listed translation blocks', async () => {
    const store = new ResultStore(root)
    const keys = await seedOld(store)
    const result = await store.migrateDocument({
      oldDocHash: DOC_A,
      newDocHash: DOC_B,
      pageFingerprints: [fp(1), fp(2), fp(3)],
      // only page 2's key is listed: page 1's and 3's blocks stay behind
      keepBlockKeys: [keys[1]!, { pageFingerprint: fp(9), textHash: fp(9), occurrence: 0 }],
    })
    expect(result).toEqual({ aiReadPages: 3, translationBlocks: 1, languages: ['en'] })
    const en = await store.readTranslation(DOC_B, 'en')
    expect(en?.provider).toBe('codex')
    expect([...(en?.blocks.keys() ?? [])]).toEqual([blockKeyString(keys[1]!)])
    expect(en?.blocks.get(blockKeyString(keys[1]!))?.text).toBe('t2')

    // an empty filter moves no block, and still the provider record and the AI-read pages
    const none = await store.migrateDocument({
      oldDocHash: DOC_A,
      newDocHash: sha256Hex('doc-c'),
      pageFingerprints: [fp(1), fp(2), fp(3)],
      keepBlockKeys: [],
    })
    expect(none).toEqual({ aiReadPages: 3, translationBlocks: 0, languages: ['en'] })
    expect((await store.readTranslation(sha256Hex('doc-c'), 'en'))?.blocks.size).toBe(0)
  })

  it('without a filter, a listed-key field left undefined moves what no filter moves', async () => {
    const store = new ResultStore(root)
    await seedOld(store)
    const input = { oldDocHash: DOC_A, pageFingerprints: [fp(1), fp(2), fp(3)] }
    const plain = await store.migrateDocument({ ...input, newDocHash: DOC_B })
    const undef = await store.migrateDocument({
      ...input,
      newDocHash: sha256Hex('doc-c'),
      keepBlockKeys: undefined,
    })
    expect(plain).toEqual({ aiReadPages: 3, translationBlocks: 3, languages: ['en'] })
    expect(undef).toEqual(plain)
  })

  it('a result finished after the save is carried over by a second migration', async () => {
    let clock = 1_000
    const store = new ResultStore(root, { now: () => clock })
    await store.writeAiReadPage(DOC_A, fp(1), page(1, 'early'))
    await store.migrateDocument({
      oldDocHash: DOC_A,
      newDocHash: DOC_B,
      pageFingerprints: [fp(1), fp(2)],
    })
    clock = 2_000
    await store.writeAiReadPage(DOC_A, fp(1), page(1, 'redone'))
    await store.writeAiReadPage(DOC_A, fp(2), page(2))
    const second = await store.migrateDocument({
      oldDocHash: DOC_A,
      newDocHash: DOC_B,
      pageFingerprints: [fp(1), fp(2)],
    })
    expect(second.aiReadPages).toBe(2)
    expect((await store.readAiReadPage(DOC_B, fp(1)))?.payload).toEqual(page(1, 'redone'))
  })

  it('does not overwrite a newer entry of the new document', async () => {
    let clock = 1_000
    const store = new ResultStore(root, { now: () => clock })
    await store.writeAiReadPage(DOC_A, fp(1), page(1, 'old'))
    clock = 2_000
    await store.writeAiReadPage(DOC_B, fp(1), page(1, 'new'))
    const result = await store.migrateDocument({
      oldDocHash: DOC_A,
      newDocHash: DOC_B,
      pageFingerprints: [fp(1)],
    })
    expect(result.aiReadPages).toBe(0)
    expect((await store.readAiReadPage(DOC_B, fp(1)))?.payload).toEqual(page(1, 'new'))
  })

  it('skips corrupt source entries and is a no-op for an unknown or identical document', async () => {
    const store = new ResultStore(root)
    await store.writeAiReadPage(DOC_A, fp(1), page(1))
    await store.writeAiReadPage(DOC_A, fp(2), page(2))
    writeFileSync(store.aiReadPagePath(DOC_A, fp(2)), 'broken')
    const result = await store.migrateDocument({
      oldDocHash: DOC_A,
      newDocHash: DOC_B,
      pageFingerprints: [fp(1), fp(2)],
    })
    expect(result.aiReadPages).toBe(1)
    const none = { aiReadPages: 0, translationBlocks: 0, languages: [] }
    expect(
      await store.migrateDocument({
        oldDocHash: sha256Hex('never'),
        newDocHash: DOC_B,
        pageFingerprints: [fp(1)],
      }),
    ).toEqual(none)
    expect(
      await store.migrateDocument({ oldDocHash: DOC_A, newDocHash: DOC_A, pageFingerprints: [] }),
    ).toEqual(none)
  })
})

describe('delete and size', () => {
  async function seed(store: ResultStore, doc: string) {
    await store.writeAiReadPage(doc, fp(1), page(1, 'x'.repeat(500)))
    const [k1] = translationBlockKeys([unit('a', fp(1), 'One')])
    await store.writeTranslationMeta(doc, 'en', { provider: 'codex', model: 'a' })
    await store.writeTranslationBlock(doc, 'en', { key: k1!, status: 'translated', text: 'x' })
    await store.writeJob(doc, { kind: 'ai-read', state: 'stopped' })
  }

  it('size is the byte total of every stored file, per document or overall', async () => {
    const store = new ResultStore(root)
    expect(await store.size()).toBe(0)
    await seed(store, DOC_A)
    const a = await store.size(DOC_A)
    expect(a).toBeGreaterThan(500)
    await seed(store, DOC_B)
    expect(await store.size(DOC_B)).toBe(a)
    expect(await store.size()).toBe(a * 2)
  })

  it('deletes one document and leaves the others', async () => {
    const store = new ResultStore(root)
    await seed(store, DOC_A)
    await seed(store, DOC_B)
    await store.deleteDocument(DOC_A)
    expect(await store.size(DOC_A)).toBe(0)
    expect((await store.readAiReadPages(DOC_A)).size).toBe(0)
    expect(await store.readTranslation(DOC_A, 'en')).toBeNull()
    expect(await store.listJobs(DOC_A)).toEqual([])
    expect((await store.readAiReadPages(DOC_B)).size).toBe(1)
    await store.deleteDocument(DOC_A) // deleting again is fine
  })

  it('delete-all empties the store and only the store', async () => {
    const neighbour = join(root, 'ai-settings.json')
    writeFileSync(neighbour, '{"providers":{}}')
    const store = new ResultStore(root)
    await seed(store, DOC_A)
    await seed(store, DOC_B)
    await store.deleteAll()
    expect(await store.size()).toBe(0)
    expect((await store.readAiReadPages(DOC_B)).size).toBe(0)
    expect(readFileSync(neighbour, 'utf8')).toBe('{"providers":{}}')
    await store.deleteAll() // nothing left is fine
    await store.writeAiReadPage(DOC_A, fp(1), page(1))
    expect((await store.readAiReadPage(DOC_A, fp(1)))?.payload).toEqual(page(1))
  })
})

describe('job records', () => {
  it('a missing record is idle', async () => {
    const store = new ResultStore(root)
    expect(await store.readJob(DOC_A, 'ai-read')).toEqual({
      kind: 'ai-read',
      state: 'idle',
      outputs: [],
    })
  })

  it('running means a heartbeat within the window; a stale one is an interrupted stop', async () => {
    let clock = 100_000
    const store = new ResultStore(root, { now: () => clock })
    await store.writeJob(DOC_A, {
      kind: 'translate',
      lang: 'en',
      state: 'running',
      progress: { done: 3, total: 10 },
    })
    clock += JOB_RUNNING_WINDOW_MS
    expect((await store.readJob(DOC_A, 'translate', 'en')).state).toBe('running')
    clock += 1
    const stale = await store.readJob(DOC_A, 'translate', 'en')
    expect(stale.state).toBe('stopped')
    expect(stale.last_error).toBe('interrupted')
    expect(stale.progress).toEqual({ done: 3, total: 10 })

    expect(await store.heartbeatJob(DOC_A, 'translate', 'en')).toBe(true)
    expect((await store.readJob(DOC_A, 'translate', 'en')).state).toBe('running')
    expect(await store.heartbeatJob(DOC_A, 'ai-read')).toBe(false)
  })

  it('the window is tunable', async () => {
    let clock = 0
    const store = new ResultStore(root, { now: () => clock, runningWindowMs: 5 })
    await store.writeJob(DOC_A, { kind: 'ai-read', state: 'running' })
    clock = 6
    expect((await store.readJob(DOC_A, 'ai-read')).state).toBe('stopped')
  })

  it('keeps stop reason, reset time and outputs; complete stays complete', async () => {
    let clock = 0
    const store = new ResultStore(root, { now: () => clock })
    await store.writeJob(DOC_A, {
      kind: 'translate',
      lang: 'ko',
      state: 'stopped',
      last_error: 'rate-limit',
      resetsAt: 1_700_000_000_000,
      outputs: ['C:\\out\\a.ko.md'],
    })
    await store.writeJob(DOC_A, { kind: 'ai-read', state: 'complete', outputs: [] })
    clock = 10 * JOB_RUNNING_WINDOW_MS
    const ko = await store.readJob(DOC_A, 'translate', 'ko')
    expect(ko).toMatchObject({
      kind: 'translate',
      lang: 'ko',
      state: 'stopped',
      last_error: 'rate-limit',
      resetsAt: 1_700_000_000_000,
      outputs: ['C:\\out\\a.ko.md'],
      updatedAt: 0,
    })
    expect((await store.readJob(DOC_A, 'ai-read')).state).toBe('complete')
  })

  it('lists unfinished jobs of a document for the resume offer', async () => {
    const store = new ResultStore(root, { now: () => 0 })
    await store.writeJob(DOC_A, { kind: 'ai-read', state: 'complete' })
    await store.writeJob(DOC_A, { kind: 'translate', lang: 'en', state: 'stopped' })
    await store.writeJob(DOC_A, { kind: 'translate', lang: 'ko', state: 'running' })
    await store.writeJob(DOC_B, { kind: 'translate', lang: 'ja', state: 'stopped' })
    const unfinished = await store.unfinishedJobs(DOC_A)
    expect(unfinished.map((j) => `${j.kind}:${j.lang ?? ''}:${j.state}`).sort()).toEqual([
      'translate:en:stopped',
      'translate:ko:running',
    ])
    expect((await store.listJobs(DOC_A)).length).toBe(3)
  })

  it('a translate record needs a language', async () => {
    const store = new ResultStore(root)
    await expect(store.writeJob(DOC_A, { kind: 'translate', state: 'running' })).rejects.toThrow(
      TypeError,
    )
  })
})
