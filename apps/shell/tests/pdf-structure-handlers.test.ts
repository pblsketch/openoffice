import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResultStore, documentHashOfFile } from '../../../packages/pdf-structure/src/store'
import type { DocumentTree } from '../../../packages/pdf-structure/src/tree/types'
import {
  createPdfStructureHandlers,
  type CallContext,
  type PickPathRequest,
} from '../src/main/pdf-structure/handlers'
import { migrateJobRecords } from '../src/main/pdf-structure/job-migration'
import type { StructureJob } from '../src/main/pdf-structure/protocol'
import type { JobRunOutcome } from '../src/main/pdf-structure/runner'

const OWNER = 7
const OTHER = 8
const FP_A = 'a'.repeat(64)
const FP_B = 'b'.repeat(64)

let dir: string
let pdfPath: string
let store: ResultStore
let granted: Map<number, Set<string>>
let picks: Array<string | null>
let pickRequests: PickPathRequest[]
let jobs: Array<{ owner: number; jobId: string; job: StructureJob }>
let answer: (job: StructureJob) => JobRunOutcome
let now: number

const ctx = (owner = OWNER): CallContext & { events: unknown[] } => {
  const events: unknown[] = []
  return { owner, progress: (p) => events.push(p), events }
}

function tinyTree(): DocumentTree {
  return {
    version: 1,
    variant: 'original',
    info: {},
    sourcePageCount: 1,
    pages: [],
    blocks: [
      {
        kind: 'pageImage',
        id: 'p1.1',
        page: 1,
        pageFingerprint: FP_A,
        regions: [],
        source: 'pdf',
        reason: 'scanned',
        data: new Uint8Array([1, 2, 3]),
        mime: 'image/png',
        pixelWidth: 1,
        pixelHeight: 1,
        widthPt: 1,
        heightPt: 1,
      },
    ],
    footnotes: [],
    outline: [],
    toc: [],
    footnoteLinkFailedPages: [],
    warnings: [],
  } as unknown as DocumentTree
}

function makeHandlers() {
  const cancelOwner = vi.fn((_owner: number) => 0)
  const handlers = createPdfStructureHandlers({
    runner: {
      run: async (owner, jobId, job, onProgress) => {
        jobs.push({ owner, jobId, job })
        onProgress?.(1, 1)
        return answer(job)
      },
      cancel: () => false,
      cancelOwner,
    },
    store: () => store,
    isGranted: (owner, path) => !!granted.get(owner)?.has(path),
    pickPath: async (_owner, request) => {
      pickRequests.push(request)
      return picks.shift() ?? null
    },
    hashFile: documentHashOfFile,
    caseInsensitivePaths: process.platform === 'win32',
  })
  return { handlers, cancelOwner }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pdf-structure-handlers-'))
  pdfPath = join(dir, 'book.pdf')
  writeFileSync(pdfPath, '%PDF-1.4 version one\n%%EOF\n')
  now = 1_000_000
  store = new ResultStore(join(dir, 'userData'), { now: () => now })
  granted = new Map([[OWNER, new Set([pdfPath])]])
  picks = []
  pickRequests = []
  jobs = []
  answer = () => ({ ok: false, error: 'failed', message: 'unexpected job' })
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('path permission', () => {
  it('refuses jobs on a file not granted to the view', async () => {
    const { handlers } = makeHandlers()
    const other = join(dir, 'other.pdf')
    writeFileSync(other, '%PDF-1.4\n')
    const c = ctx()
    for (const out of [
      await handlers.tree(c, { jobId: 'j', path: other }),
      await handlers.text(c, { jobId: 'j', path: other }),
      await handlers.convert(c, {
        jobId: 'j',
        path: other,
        format: 'md',
        outPath: join(dir, 'x.md'),
      }),
      await handlers.extractImages(c, { jobId: 'j', path: other, outDir: dir }),
      await handlers.writeBack(c, {
        jobId: 'j',
        path: other,
        outPath: join(dir, 'x.pdf'),
        payload: 1,
      }),
      await handlers.tree(ctx(OTHER), { jobId: 'j', path: pdfPath }),
    ]) {
      expect(out).toMatchObject({ ok: false, error: 'not-granted' })
    }
    expect(jobs).toEqual([])
  })

  it('refuses an output path the dialog did not pick for this view and format', async () => {
    const { handlers } = makeHandlers()
    const outPath = join(dir, 'book.md')
    const c = ctx()
    expect(
      await handlers.convert(c, { jobId: 'j', path: pdfPath, format: 'md', outPath }),
    ).toMatchObject({ ok: false, error: 'not-granted' })

    picks.push(outPath)
    expect(await handlers.pickTarget(OWNER, { kind: 'md', path: pdfPath })).toBe(outPath)
    expect(pickRequests[0]).toEqual({ kind: 'md', defaultPath: join(dir, 'book.md') })
    // picked as Markdown: not usable for EPUB, not by another view
    expect(
      await handlers.convert(c, {
        jobId: 'j',
        path: pdfPath,
        format: 'epub',
        outPath,
        epub: { title: 'T' },
      }),
    ).toMatchObject({ ok: false, error: 'not-granted' })
    granted.set(OTHER, new Set([pdfPath]))
    expect(
      await handlers.convert(ctx(OTHER), { jobId: 'j', path: pdfPath, format: 'md', outPath }),
    ).toMatchObject({ ok: false, error: 'not-granted' })
    expect(jobs).toEqual([])
  })

  it('never grants or writes the source document', async () => {
    const { handlers } = makeHandlers()
    picks.push(pdfPath)
    expect(await handlers.pickTarget(OWNER, { kind: 'pdf', path: pdfPath })).toBeNull()
    expect(
      await handlers.writeBack(ctx(), { jobId: 'j', path: pdfPath, outPath: pdfPath, payload: {} }),
    ).toMatchObject({ ok: false, error: 'not-granted' })
    expect(jobs).toEqual([])
  })

  it("does not open a dialog for a file that is not the view's own", async () => {
    const { handlers } = makeHandlers()
    expect(await handlers.pickTarget(OWNER, { kind: 'md', path: join(dir, 'x.pdf') })).toBeNull()
    expect(await handlers.pickTarget(OWNER, { kind: 'exe' as 'md', path: pdfPath })).toBeNull()
    expect(pickRequests).toEqual([])
  })

  it('keeps a picked target until a job using it succeeds', async () => {
    const { handlers } = makeHandlers()
    const outPath = join(dir, 'book.md')
    picks.push(outPath)
    await handlers.pickTarget(OWNER, { kind: 'md', path: pdfPath, defaultName: 'Book' })
    expect(pickRequests[0]!.defaultPath).toBe(join(dir, 'Book.md'))
    answer = () => ({ ok: false, error: 'password-required' })
    const req = { jobId: 'j', path: pdfPath, format: 'md' as const, outPath }
    expect(await handlers.convert(ctx(), req)).toMatchObject({ error: 'password-required' })
    answer = () => ({
      ok: true,
      value: { docHash: 'h', outPath, warnings: [], assetsWritten: 0, assetsReused: 0 },
    })
    expect(await handlers.convert(ctx(), { ...req, password: 'pw' })).toMatchObject({ ok: true })
    expect(jobs[1]!.job).toMatchObject({
      op: 'markdown',
      outPath,
      source: { pdfPath, password: 'pw' },
    })
    // used up: converting again needs a new pick (and its overwrite prompt)
    expect(await handlers.convert(ctx(), req)).toMatchObject({ error: 'not-granted' })
  })

  it('checks the request fields', async () => {
    const { handlers } = makeHandlers()
    const c = ctx()
    expect(await handlers.tree(c, { jobId: 'bad id!', path: pdfPath })).toMatchObject({
      error: 'invalid-request',
    })
    expect(await handlers.tree(c, { jobId: 'j', path: pdfPath, pages: [0] })).toMatchObject({
      error: 'invalid-request',
    })
    expect(await handlers.tree(c, { jobId: 'j', path: pdfPath, pages: [] })).toMatchObject({
      error: 'invalid-request',
    })
    picks.push(join(dir, 'b.epub'))
    const outPath = (await handlers.pickTarget(OWNER, { kind: 'epub', path: pdfPath }))!
    expect(
      await handlers.convert(c, {
        jobId: 'j',
        path: pdfPath,
        format: 'epub',
        outPath,
        epub: { title: 'T', language: 'not a tag' },
      }),
    ).toMatchObject({ error: 'invalid-request' })
    expect(
      await handlers.convert(c, {
        jobId: 'j',
        path: pdfPath,
        format: 'epub',
        outPath,
        epub: { title: 'T', pageBreaks: 'yes' as unknown as boolean },
      }),
    ).toMatchObject({ error: 'invalid-request' })
    expect(jobs).toEqual([])
  })
})

describe('tree jobs', () => {
  it('forwards progress, caches the tree per view and strips picture bytes', async () => {
    const { handlers } = makeHandlers()
    const docHash = await documentHashOfFile(pdfPath)
    answer = () => ({
      ok: true,
      value: { docHash, tree: tinyTree(), fingerprints: [{ page: 1, fingerprint: FP_A }] },
    })
    const c = ctx()
    const first = await handlers.tree(c, { jobId: 'j1', path: pdfPath })
    expect(first).toMatchObject({ ok: true, docHash, cached: false })
    expect(c.events).toEqual([{ jobId: 'j1', done: 1, total: 1 }])
    if (!first.ok) throw new Error('expected a tree')
    expect((first.tree.blocks[0] as { data: Uint8Array }).data).toHaveLength(0)

    const again = await handlers.tree(ctx(), { jobId: 'j2', path: pdfPath, imageData: true })
    expect(again).toMatchObject({ ok: true, cached: true })
    if (!again.ok) throw new Error('expected a tree')
    expect((again.tree.blocks[0] as { data: Uint8Array }).data).toHaveLength(3)
    expect(jobs).toHaveLength(1)

    // a conversion reuses the cached tree instead of extracting again
    picks.push(join(dir, 'book.md'))
    const outPath = (await handlers.pickTarget(OWNER, { kind: 'md', path: pdfPath }))!
    answer = () => ({
      ok: true,
      value: { docHash, outPath, warnings: [], assetsWritten: 0, assetsReused: 0 },
    })
    await handlers.convert(ctx(), { jobId: 'j3', path: pdfPath, format: 'md', outPath })
    expect((jobs[1]!.job as { tree?: unknown }).tree).toBeDefined()

    // other pages, or the file saved with new bytes: a new job
    answer = () => ({
      ok: true,
      value: { docHash, tree: tinyTree(), fingerprints: [] },
    })
    await handlers.tree(ctx(), { jobId: 'j4', path: pdfPath, pages: [1] })
    expect(jobs).toHaveLength(3)
    writeFileSync(pdfPath, '%PDF-1.4 version two\n%%EOF\n')
    const after = await handlers.tree(ctx(), { jobId: 'j5', path: pdfPath, pages: [1] })
    expect(after).toMatchObject({ cached: false })
    expect(jobs).toHaveLength(4)
  })

  it('structured text answers not-available until the formatter is plugged in', async () => {
    const { handlers } = makeHandlers()
    answer = () => ({ ok: false, error: 'not-available', message: 'later' })
    expect(await handlers.text(ctx(), { jobId: 'j', path: pdfPath })).toMatchObject({
      ok: false,
      error: 'not-available',
    })
  })

  it('closing the view cancels its jobs and forgets its grants', async () => {
    const { handlers, cancelOwner } = makeHandlers()
    const { docHash } = (await handlers.storeDocHash(OWNER, pdfPath)) as { docHash: string }
    picks.push(join(dir, 'book.md'))
    const outPath = (await handlers.pickTarget(OWNER, { kind: 'md', path: pdfPath }))!
    handlers.forgetOwner(OWNER)
    expect(cancelOwner).toHaveBeenCalledWith(OWNER)
    expect(await handlers.storeAiReadPages(OWNER, docHash)).toMatchObject({ error: 'not-granted' })
    expect(
      await handlers.convert(ctx(), { jobId: 'j', path: pdfPath, format: 'md', outPath }),
    ).toMatchObject({ error: 'not-granted' })
  })
})

describe('store channels', () => {
  it('accept only document hashes the main process computed for the view', async () => {
    const { handlers } = makeHandlers()
    const docHash = await documentHashOfFile(pdfPath)
    expect(await handlers.storeAiReadPages(OWNER, docHash)).toMatchObject({
      ok: false,
      error: 'not-granted',
    })
    expect(await handlers.storeDocHash(OWNER, join(dir, 'other.pdf'))).toMatchObject({
      error: 'not-granted',
    })
    expect(await handlers.storeDocHash(OWNER, pdfPath)).toEqual({ ok: true, docHash })
    expect(await handlers.storeAiReadPages(OWNER, docHash)).toEqual({ ok: true, pages: [] })
    // another view did not compute it
    expect(await handlers.storeAiReadPages(OTHER, docHash)).toMatchObject({ error: 'not-granted' })
    expect(
      await handlers.storeWrite(OTHER, { kind: 'deleteTranslation', docHash, lang: 'en' }),
    ).toMatchObject({ error: 'not-granted' })
  })

  it('write, read and delete one document', async () => {
    const { handlers } = makeHandlers()
    const { docHash } = (await handlers.storeDocHash(OWNER, pdfPath)) as { docHash: string }
    expect(
      await handlers.storeWrite(OWNER, {
        kind: 'aiReadPage',
        docHash,
        pageFingerprint: FP_A,
        payload: { version: 1, text: 'read' },
        provider: 'codex',
        model: 'm',
      }),
    ).toEqual({ ok: true })
    const pages = await handlers.storeAiReadPages(OWNER, docHash)
    expect(pages).toMatchObject({
      ok: true,
      pages: [{ pageFingerprint: FP_A, payload: { version: 1, text: 'read' }, provider: 'codex' }],
    })

    const key = { pageFingerprint: FP_A, textHash: 'c'.repeat(64), occurrence: 0 }
    await handlers.storeWrite(OWNER, {
      kind: 'translationMeta',
      docHash,
      lang: 'en',
      provider: 'codex',
      model: 'm',
    })
    await handlers.storeWrite(OWNER, {
      kind: 'translationBlocks',
      docHash,
      lang: 'en',
      blocks: [{ key, status: 'translated', text: 'Hello' }],
    })
    expect(await handlers.storeTranslations(OWNER, docHash)).toEqual({ ok: true, langs: ['en'] })
    const tr = await handlers.storeTranslation(OWNER, docHash, 'en')
    expect(tr).toMatchObject({
      ok: true,
      translation: { lang: 'en', provider: 'codex', blocks: [{ key, text: 'Hello' }] },
    })
    expect(await handlers.storeTranslation(OWNER, docHash, 'fr')).toEqual({
      ok: true,
      translation: null,
    })

    await handlers.storeWrite(OWNER, {
      kind: 'job',
      docHash,
      job: { kind: 'translate', lang: 'en', state: 'stopped', last_error: 'rate-limit' },
    })
    expect(await handlers.storeUnfinishedJobs(OWNER, docHash)).toMatchObject({
      ok: true,
      jobs: [{ kind: 'translate', lang: 'en', state: 'stopped', last_error: 'rate-limit' }],
    })
    expect(
      await handlers.storeWrite(OWNER, {
        kind: 'heartbeat',
        docHash,
        job: 'translate',
        lang: 'en',
      }),
    ).toMatchObject({ ok: false })

    // malformed writes are refused, not thrown
    expect(
      await handlers.storeWrite(OWNER, {
        kind: 'aiReadPage',
        docHash,
        pageFingerprint: '../x',
        payload: { version: 1 },
      }),
    ).toMatchObject({ ok: false, error: 'invalid-request' })
    expect(await handlers.storeWrite(OWNER, { kind: 'nope', docHash } as never)).toMatchObject({
      ok: false,
      error: 'invalid-request',
    })

    expect(await handlers.storeDeleteDocument(OWNER, docHash)).toEqual({ ok: true })
    expect(await handlers.storeAiReadPages(OWNER, docHash)).toEqual({ ok: true, pages: [] })
    expect(await handlers.storeUnfinishedJobs(OWNER, docHash)).toEqual({ ok: true, jobs: [] })
  })

  it('migrates results and job records after an in-app save', async () => {
    const { handlers } = makeHandlers()
    const { docHash: oldHash } = (await handlers.storeDocHash(OWNER, pdfPath)) as {
      docHash: string
    }
    await handlers.storeWrite(OWNER, {
      kind: 'aiReadPage',
      docHash: oldHash,
      pageFingerprint: FP_A,
      payload: { version: 1 },
    })
    await handlers.storeWrite(OWNER, {
      kind: 'aiReadPage',
      docHash: oldHash,
      pageFingerprint: FP_B,
      payload: { version: 1 },
    })
    await handlers.storeWrite(OWNER, {
      kind: 'job',
      docHash: oldHash,
      job: {
        kind: 'ai-read',
        state: 'stopped',
        last_error: 'cancelled',
        progress: { done: 1, total: 3 },
      },
    })
    await handlers.storeWrite(OWNER, {
      kind: 'job',
      docHash: oldHash,
      job: { kind: 'translate', lang: 'ko', state: 'complete' },
    })

    // the saved file: page B changed
    writeFileSync(pdfPath, '%PDF-1.4 saved\n%%EOF\n')
    const newHash = await documentHashOfFile(pdfPath)
    answer = (job) =>
      job.op === 'fingerprints'
        ? { ok: true, value: { docHash: newHash, fingerprints: [FP_A, 'd'.repeat(64)] } }
        : { ok: false, error: 'failed' }

    now += 1000
    const out = await handlers.storeMigrate(ctx(), { path: pdfPath, oldDocHash: oldHash })
    expect(out).toEqual({
      ok: true,
      docHash: newHash,
      aiReadPages: 1,
      translationBlocks: 0,
      languages: [],
      jobs: 2,
    })
    expect(jobs.at(-1)!.job).toEqual({ op: 'fingerprints', source: { pdfPath } })
    // the new hash is now usable by this view
    expect(await handlers.storeAiReadPages(OWNER, newHash)).toMatchObject({
      pages: [{ pageFingerprint: FP_A }],
    })
    expect(await handlers.storeUnfinishedJobs(OWNER, newHash)).toMatchObject({
      jobs: [
        {
          kind: 'ai-read',
          state: 'stopped',
          last_error: 'cancelled',
          progress: { done: 1, total: 3 },
        },
      ],
    })
    // a finished job carries over too, and is not offered as unfinished
    expect((await store.readJob(newHash, 'translate', 'ko')).state).toBe('complete')
    // the old document keeps its entries until the user deletes them
    expect(await handlers.storeUnfinishedJobs(OWNER, oldHash)).toMatchObject({
      jobs: [{ kind: 'ai-read' }],
    })
  })

  it('refuses a migration from a hash the view never had', async () => {
    const { handlers } = makeHandlers()
    expect(
      await handlers.storeMigrate(ctx(), { path: pdfPath, oldDocHash: 'f'.repeat(64) }),
    ).toMatchObject({ ok: false, error: 'not-granted' })
    expect(jobs).toEqual([])
  })

  it('maps a store write failure to store-write-failed', async () => {
    const { handlers } = makeHandlers()
    const { docHash } = (await handlers.storeDocHash(OWNER, pdfPath)) as { docHash: string }
    // a file where the store folder should be makes every write fail
    writeFileSync(join(dir, 'userData'), 'not a folder')
    expect(
      await handlers.storeWrite(OWNER, {
        kind: 'aiReadPage',
        docHash,
        pageFingerprint: FP_A,
        payload: { version: 1 },
      }),
    ).toMatchObject({ ok: false, error: 'store-write-failed' })
  })
})

describe('migrateJobRecords', () => {
  const oldHash = '1'.repeat(64)
  const newHash = '2'.repeat(64)

  it('keeps a newer record in the new document and carries complete jobs too', async () => {
    await store.writeJob(oldHash, { kind: 'translate', lang: 'en', state: 'stopped' })
    await store.writeJob(oldHash, { kind: 'translate', lang: 'fr', state: 'stopped' })
    await store.writeJob(oldHash, {
      kind: 'ai-read',
      state: 'complete',
      progress: { done: 3, total: 3 },
    })
    now += 10
    await store.writeJob(newHash, { kind: 'translate', lang: 'en', state: 'running' })
    expect(await migrateJobRecords(store, oldHash, newHash)).toBe(2)
    expect((await store.readJob(newHash, 'translate', 'en')).state).toBe('running')
    expect((await store.readJob(newHash, 'translate', 'fr')).state).toBe('stopped')
    expect(await store.readJob(newHash, 'ai-read')).toMatchObject({
      state: 'complete',
      progress: { done: 3, total: 3 },
    })
    expect(await migrateJobRecords(store, oldHash, oldHash)).toBe(0)
  })

  it('carries a stale running job as interrupted', async () => {
    await store.writeJob(oldHash, { kind: 'ai-read', state: 'running' })
    now += 60_000
    expect(await migrateJobRecords(store, oldHash, newHash)).toBe(1)
    expect(await store.readJob(newHash, 'ai-read')).toMatchObject({
      state: 'stopped',
      last_error: 'interrupted',
    })
  })

  it("a job that finishes after the save replaces its 'running' copy when migrated again", async () => {
    await store.writeJob(oldHash, {
      kind: 'ai-read',
      state: 'running',
      progress: { done: 1, total: 2 },
    })
    now += 1000
    expect(await migrateJobRecords(store, oldHash, newHash)).toBe(1)
    expect((await store.readJob(newHash, 'ai-read')).state).toBe('running')
    now += 1000
    await store.writeJob(oldHash, {
      kind: 'ai-read',
      state: 'complete',
      progress: { done: 2, total: 2 },
    })
    expect(await migrateJobRecords(store, oldHash, newHash)).toBe(1)
    now += 60_000
    expect(await store.unfinishedJobs(newHash)).toEqual([])
    expect(await store.readJob(newHash, 'ai-read')).toMatchObject({
      state: 'complete',
      progress: { done: 2, total: 2 },
    })
  })

  it('copies again a final write the job made while its record was being copied', async () => {
    await store.writeJob(oldHash, {
      kind: 'ai-read',
      state: 'running',
      progress: { done: 1, total: 2 },
    })
    now += 1000
    // the job's final write lands between reading the old record and writing its copy;
    // the copy is stamped the same moment, so a later migration could not tell them apart
    let raced = false
    const racing = {
      listJobs: (h: string) => store.listJobs(h),
      readJob: (h: string, kind: 'ai-read' | 'translate', lang?: string) =>
        store.readJob(h, kind, lang),
      writeJob: async (h: string, job: Parameters<ResultStore['writeJob']>[1]) => {
        if (h === newHash && !raced) {
          raced = true
          await store.writeJob(oldHash, {
            kind: 'ai-read',
            state: 'complete',
            progress: { done: 2, total: 2 },
          })
        }
        await store.writeJob(h, job)
      },
    }
    expect(await migrateJobRecords(racing, oldHash, newHash)).toBe(1)
    expect(await store.readJob(newHash, 'ai-read')).toMatchObject({
      state: 'complete',
      progress: { done: 2, total: 2 },
    })
  })
})
