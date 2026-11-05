/**
 * Easy explanations over the shell's store channels (spec 6.2, 6.3): every
 * translation read and write takes an optional `mode`; left out, the store is
 * called exactly as before. Deleting counts the easy edits, a save carries
 * `easy/` and the easy job records to the new hash, and the resume source
 * lists easy records with their mode.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResultStore, documentHashOfFile } from '../../../packages/pdf-structure/src/store'
import { createPdfStructureHandlers, type CallContext } from '../src/main/pdf-structure/handlers'
import { migrateJobRecords } from '../src/main/pdf-structure/job-migration'
import type { StructureJob } from '../src/main/pdf-structure/protocol'
import type { JobRunOutcome } from '../src/main/pdf-structure/runner'
import type { PdfStoreWriteRequest } from '../../pdf/src/shared/ipc'

const OWNER = 7
const FP_A = 'a'.repeat(64)
const FP_B = 'b'.repeat(64)
const KEY_A = { pageFingerprint: FP_A, textHash: 'c'.repeat(64), occurrence: 0 }
const KEY_B = { pageFingerprint: FP_B, textHash: 'c'.repeat(64), occurrence: 0 }

let dir: string
let pdfPath: string
let store: ResultStore
let answer: (job: StructureJob) => JobRunOutcome
let now: number

const ctx = (owner = OWNER): CallContext => ({ owner, progress: () => {} })

function makeHandlers() {
  return createPdfStructureHandlers({
    runner: {
      run: async (_owner, _jobId, job) => answer(job),
      cancel: () => false,
      cancelOwner: vi.fn(() => 0),
    },
    store: () => store,
    isGranted: (owner, path) => owner === OWNER && path === pdfPath,
    pickPath: async () => null,
    hashFile: documentHashOfFile,
    caseInsensitivePaths: process.platform === 'win32',
  })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pdf-easy-store-'))
  pdfPath = join(dir, 'book.pdf')
  writeFileSync(pdfPath, '%PDF-1.4 version one\n%%EOF\n')
  now = 1_000_000
  store = new ResultStore(join(dir, 'userData'), { now: () => now })
  answer = () => ({ ok: false, error: 'failed', message: 'unexpected job' })
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function ownHash(handlers: ReturnType<typeof makeHandlers>): Promise<string> {
  return ((await handlers.storeDocHash(OWNER, pdfPath)) as { docHash: string }).docHash
}

describe('translation channels with a mode', () => {
  it('write and read the easy explanation apart from the translation', async () => {
    const handlers = makeHandlers()
    const docHash = await ownHash(handlers)
    const writes: PdfStoreWriteRequest[] = [
      { kind: 'translationMeta', docHash, lang: 'ko', provider: 'p', model: 'm', mode: 'easy' },
      {
        kind: 'translationBlocks',
        docHash,
        lang: 'ko',
        blocks: [{ key: KEY_A, status: 'translated', text: 'easy' }],
        mode: 'easy',
      },
      { kind: 'editedTranslationBlock', docHash, lang: 'ko', key: KEY_B, text: 'e', mode: 'easy' },
      {
        kind: 'job',
        docHash,
        job: { kind: 'translate', lang: 'ko', state: 'running', mode: 'easy' },
      },
      { kind: 'heartbeat', docHash, job: 'translate', lang: 'ko', mode: 'easy' },
    ]
    for (const w of writes) expect(await handlers.storeWrite(OWNER, w)).toEqual({ ok: true })

    expect(await handlers.storeTranslations(OWNER, docHash)).toEqual({ ok: true, langs: [] })
    expect(await handlers.storeTranslations(OWNER, docHash, 'easy')).toEqual({
      ok: true,
      langs: ['ko'],
    })
    expect(await handlers.storeTranslation(OWNER, docHash, 'ko')).toEqual({
      ok: true,
      translation: null,
    })
    const easy = await handlers.storeTranslation(OWNER, docHash, 'ko', 'easy')
    expect(easy).toMatchObject({ ok: true, translation: { lang: 'ko', provider: 'p' } })
    expect((easy as { translation: { blocks: unknown[] } }).translation.blocks).toHaveLength(2)
    expect(await handlers.storeTranslationRecency(OWNER, docHash)).toEqual({ ok: true, langs: [] })
    expect(await handlers.storeTranslationRecency(OWNER, docHash, 'easy')).toEqual({
      ok: true,
      langs: [{ lang: 'ko', savedAt: now }],
    })
    // the plain heartbeat does not find the easy record
    expect(
      await handlers.storeWrite(OWNER, {
        kind: 'heartbeat',
        docHash,
        job: 'translate',
        lang: 'ko',
      }),
    ).toMatchObject({ ok: false, error: 'failed' })
    expect(await handlers.storeUnfinishedJobs(OWNER, docHash)).toMatchObject({
      ok: true,
      jobs: [{ kind: 'translate', lang: 'ko', mode: 'easy', state: 'running' }],
    })

    expect(
      await handlers.storeWrite(OWNER, {
        kind: 'deleteTranslationExceptEdited',
        docHash,
        lang: 'ko',
        mode: 'easy',
      }),
    ).toEqual({ ok: true, removed: 1 })
    expect(
      await handlers.storeWrite(OWNER, {
        kind: 'deleteTranslation',
        docHash,
        lang: 'ko',
        mode: 'easy',
      }),
    ).toEqual({ ok: true })
    expect(await handlers.storeTranslations(OWNER, docHash, 'easy')).toEqual({
      ok: true,
      langs: [],
    })
  })

  it('call the store as before when no mode is given', async () => {
    const handlers = makeHandlers()
    const docHash = await ownHash(handlers)
    const spies = [
      vi.spyOn(store, 'listTranslations'),
      vi.spyOn(store, 'readTranslation'),
      vi.spyOn(store, 'writeTranslationMeta'),
      vi.spyOn(store, 'writeTranslationBlocks'),
      vi.spyOn(store, 'deleteTranslation'),
      vi.spyOn(store, 'deleteTranslationExceptEdited'),
      vi.spyOn(store, 'writeEditedTranslationBlock'),
      vi.spyOn(store, 'heartbeatJob'),
    ]
    await handlers.storeTranslations(OWNER, docHash)
    await handlers.storeTranslation(OWNER, docHash, 'ko')
    await handlers.storeWrite(OWNER, {
      kind: 'translationMeta',
      docHash,
      lang: 'ko',
      provider: 'p',
      model: 'm',
    })
    await handlers.storeWrite(OWNER, {
      kind: 'translationBlocks',
      docHash,
      lang: 'ko',
      blocks: [{ key: KEY_A, status: 'translated', text: 't' }],
    })
    await handlers.storeWrite(OWNER, {
      kind: 'editedTranslationBlock',
      docHash,
      lang: 'ko',
      key: KEY_B,
      text: 'e',
    })
    await handlers.storeWrite(OWNER, { kind: 'deleteTranslationExceptEdited', docHash, lang: 'ko' })
    await handlers.storeWrite(OWNER, { kind: 'deleteTranslation', docHash, lang: 'ko' })
    await handlers.storeWrite(OWNER, { kind: 'heartbeat', docHash, job: 'translate', lang: 'ko' })
    expect(spies[0]).toHaveBeenCalledWith(docHash)
    expect(spies[1]).toHaveBeenCalledWith(docHash, 'ko')
    expect(spies[2]).toHaveBeenCalledWith(docHash, 'ko', { provider: 'p', model: 'm' })
    expect(spies[3]!.mock.calls[0]).toHaveLength(3)
    expect(spies[4]).toHaveBeenCalledWith(docHash, 'ko')
    expect(spies[5]).toHaveBeenCalledWith(docHash, 'ko')
    expect(spies[6]!.mock.calls[0]).toHaveLength(4)
    expect(spies[7]).toHaveBeenCalledWith(docHash, 'translate', 'ko')
  })

  it('refuse a mode that is not one, without throwing', async () => {
    const handlers = makeHandlers()
    const docHash = await ownHash(handlers)
    const bad = { error: 'invalid-request', ok: false }
    expect(await handlers.storeTranslations(OWNER, docHash, 'other')).toMatchObject(bad)
    expect(await handlers.storeTranslation(OWNER, docHash, 'ko', 3)).toMatchObject(bad)
    expect(await handlers.storeTranslationRecency(OWNER, docHash, {})).toMatchObject(bad)
    expect(
      await handlers.storeWrite(OWNER, {
        kind: 'deleteTranslation',
        docHash,
        lang: 'ko',
        mode: 'other',
      } as unknown as PdfStoreWriteRequest),
    ).toMatchObject(bad)
    // an easy record of a kind that has none
    expect(
      await handlers.storeWrite(OWNER, {
        kind: 'job',
        docHash,
        job: { kind: 'summary', lang: 'en', state: 'running', mode: 'easy' },
      }),
    ).toMatchObject(bad)
  })
})

describe('delete and save with easy explanations', () => {
  it('the delete confirmation counts the edited easy blocks too', async () => {
    const handlers = makeHandlers()
    const docHash = await ownHash(handlers)
    await store.writeEditedTranslationBlock(docHash, 'ko', KEY_A, 'plain edit')
    await store.writeEditedTranslationBlock(docHash, 'ko', KEY_A, 'easy edit', 'easy')
    await store.writeEditedTranslationBlock(docHash, 'en', KEY_B, 'easy edit', 'easy')
    expect(await handlers.storeDeleteCounts(OWNER, docHash)).toEqual({
      ok: true,
      editedTranslationBlocks: 3,
      passages: 0,
    })
    expect(await handlers.storeDeleteDocument(OWNER, docHash)).toEqual({ ok: true })
    expect(await store.listTranslations(docHash, 'easy')).toEqual([])
    expect(await handlers.storeDeleteCounts(OWNER, docHash)).toMatchObject({
      editedTranslationBlocks: 0,
    })
  })

  it('a save carries easy/ and the easy job records to the new hash', async () => {
    const handlers = makeHandlers()
    const oldHash = await ownHash(handlers)
    await store.writeTranslationBlocks(oldHash, 'ko', [
      { key: KEY_A, status: 'translated', text: 'plain' },
    ])
    await store.writeTranslationMeta(oldHash, 'en', { provider: 'p', model: 'm' }, 'easy')
    await store.writeTranslationBlocks(
      oldHash,
      'en',
      [
        { key: KEY_A, status: 'translated', text: 'easy a' },
        { key: KEY_B, status: 'translated', text: 'easy b' },
      ],
      'easy',
    )
    await store.writeJob(oldHash, { kind: 'translate', lang: 'ko', state: 'stopped' })
    await store.writeJob(oldHash, { kind: 'translate', lang: 'en', state: 'stopped', mode: 'easy' })

    writeFileSync(pdfPath, '%PDF-1.4 saved\n%%EOF\n')
    const newHash = await documentHashOfFile(pdfPath)
    answer = (job) =>
      job.op === 'fingerprints'
        ? { ok: true, value: { docHash: newHash, fingerprints: [FP_A] } }
        : { ok: false, error: 'failed' }
    now += 1000
    expect(await handlers.storeMigrate(ctx(), { path: pdfPath, oldDocHash: oldHash })).toEqual({
      ok: true,
      docHash: newHash,
      aiReadPages: 0,
      translationBlocks: 1,
      languages: ['ko'],
      easyBlocks: 1,
      easyLanguages: ['en'],
      jobs: 2,
    })
    expect(await store.listTranslations(newHash)).toEqual(['ko'])
    expect(await store.listTranslations(newHash, 'easy')).toEqual(['en'])
    expect((await store.readJob(newHash, 'translate', 'en', 'easy')).state).toBe('stopped')
    // the easy record did not land on the plain one
    expect((await store.readJob(newHash, 'translate', 'en')).state).toBe('idle')
    expect(
      (await store.listJobs(newHash)).map((j) => [j.lang, j.mode ?? 'translate']).sort(),
    ).toEqual([
      ['en', 'easy'],
      ['ko', 'translate'],
    ])
  })
})

describe('migrateJobRecords and easy records', () => {
  const oldHash = '1'.repeat(64)
  const newHash = '2'.repeat(64)

  it('moves an easy record onto the easy record, by the same newer-wins rule', async () => {
    await store.writeJob(oldHash, {
      kind: 'translate-page',
      lang: 'ko',
      state: 'stopped',
      mode: 'easy',
      progress: { done: 1, total: 2 },
    })
    await store.writeJob(oldHash, { kind: 'translate-page', lang: 'ko', state: 'complete' })
    now += 10
    await store.writeJob(newHash, { kind: 'translate', lang: 'ko', state: 'running', mode: 'easy' })
    now += 10
    // newer than the new document's easy record, which it therefore replaces
    await store.writeJob(oldHash, { kind: 'translate', lang: 'ko', state: 'stopped', mode: 'easy' })
    expect(await migrateJobRecords(store, oldHash, newHash)).toBe(3)
    expect(await store.readJob(newHash, 'translate-page', 'ko', 'easy')).toMatchObject({
      state: 'stopped',
      mode: 'easy',
      progress: { done: 1, total: 2 },
    })
    expect((await store.readJob(newHash, 'translate-page', 'ko')).state).toBe('complete')
    expect((await store.readJob(newHash, 'translate', 'ko', 'easy')).state).toBe('stopped')
    expect((await store.readJob(newHash, 'translate', 'ko')).state).toBe('idle')
    // again: nothing newer
    expect(await migrateJobRecords(store, oldHash, newHash)).toBe(0)
  })
})
