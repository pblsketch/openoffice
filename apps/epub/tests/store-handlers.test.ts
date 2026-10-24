// @vitest-environment node
/**
 * `epub:store-*`: a view reaches only the document hashes the main process
 * computed for it, and only what a book translation job reads and writes.
 * Runs on a real result store in a temporary folder.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ResultStore } from '@genoffice/pdf-structure/store'
import { createEpubStoreHandlers } from '../src/main/store-handlers'

const HASH = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)
const OWNER = 7

let dir: string
let store: ResultStore
let handlers: ReturnType<typeof createEpubStoreHandlers>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-epub-store-'))
  store = new ResultStore(dir)
  handlers = createEpubStoreHandlers({
    store: () => store,
    knows: (owner, docHash) => owner === OWNER && docHash === HASH,
  })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const key = { pageFingerprint: 'c'.repeat(64), textHash: 'd'.repeat(64), occurrence: 0 }

describe('permission', () => {
  it('refuses a document hash the view was not given, and another view', async () => {
    expect(await handlers.translations(OWNER, OTHER)).toMatchObject({
      ok: false,
      error: 'not-granted',
    })
    expect(await handlers.translations(8, HASH)).toMatchObject({ ok: false, error: 'not-granted' })
    expect(await handlers.translation(OWNER, '../x', 'ko')).toMatchObject({ error: 'not-granted' })
    expect(
      await handlers.write(OWNER, { kind: 'deleteTranslation', docHash: OTHER, lang: 'ko' }),
    ).toMatchObject({ ok: false, error: 'not-granted' })
    expect(await handlers.unfinishedJobs(OWNER, OTHER)).toMatchObject({ error: 'not-granted' })
  })

  it('stores under <userData>/pdf-store', () => {
    expect(store.dir).toBe(join(dir, 'pdf-store'))
  })
})

describe('translation reads and writes', () => {
  it('writes meta and blocks, and reads them back as a list', async () => {
    expect(
      await handlers.write(OWNER, {
        kind: 'translationMeta',
        docHash: HASH,
        lang: 'ko',
        provider: 'claude',
        model: 'm',
      }),
    ).toEqual({ ok: true })
    expect(
      await handlers.write(OWNER, {
        kind: 'translationBlocks',
        docHash: HASH,
        lang: 'ko',
        blocks: [{ key, status: 'translated', text: '번역' }],
      }),
    ).toEqual({ ok: true })
    expect(await handlers.translations(OWNER, HASH)).toEqual({ ok: true, langs: ['ko'] })
    const read = await handlers.translation(OWNER, HASH, 'ko')
    expect(read).toMatchObject({
      ok: true,
      translation: { lang: 'ko', provider: 'claude', model: 'm' },
    })
    expect(read.ok && read.translation?.blocks).toMatchObject([
      { status: 'translated', text: '번역' },
    ])
    expect(
      await handlers.write(OWNER, { kind: 'deleteTranslation', docHash: HASH, lang: 'ko' }),
    ).toEqual({ ok: true })
    expect(await handlers.translation(OWNER, HASH, 'ko')).toEqual({ ok: true, translation: null })
  })

  it('writes translate job records under their own language only', async () => {
    const job = { kind: 'translate', lang: 'ko', state: 'stopped', last_error: 'cancelled' }
    expect(await handlers.write(OWNER, { kind: 'job', docHash: HASH, lang: 'ko', job })).toEqual({
      ok: true,
    })
    const unfinished = await handlers.unfinishedJobs(OWNER, HASH)
    expect(unfinished.ok && unfinished.jobs).toMatchObject([{ kind: 'translate', lang: 'ko' }])
    expect(
      await handlers.write(OWNER, {
        kind: 'job',
        docHash: HASH,
        lang: 'ko',
        job: { kind: 'highlight', runId: 'r', state: 'running' },
      }),
    ).toMatchObject({ ok: false, error: 'invalid-request' })
    expect(
      await handlers.write(OWNER, {
        kind: 'job',
        docHash: HASH,
        lang: 'ko',
        job: { ...job, lang: 'ja' },
      }),
    ).toMatchObject({ ok: false, error: 'invalid-request' })
  })

  it('refuses writes the book translation never makes, and bad fields', async () => {
    for (const request of [
      { kind: 'passage', docHash: HASH, lang: 'ko', card: {} },
      { kind: 'aiReadPage', docHash: HASH, lang: 'ko' },
      { kind: 'translationMeta', docHash: HASH, lang: 'ko', provider: 1, model: 'm' },
      { kind: 'translationBlocks', docHash: HASH, lang: 'ko', blocks: 'x' },
      { kind: 'deleteTranslation', docHash: HASH, lang: '../ko' },
    ]) {
      expect(await handlers.write(OWNER, request)).toMatchObject({
        ok: false,
        error: 'invalid-request',
      })
    }
    expect(await handlers.write(OWNER, null)).toMatchObject({ ok: false, error: 'invalid-request' })
  })

  it('answers a store failure as an outcome, never a throw', async () => {
    const result = await handlers.write(OWNER, {
      kind: 'translationBlocks',
      docHash: HASH,
      lang: 'ko',
      blocks: [{ key: { pageFingerprint: '../bad' }, status: 'translated', text: 'x' }],
    })
    expect(result.ok).toBe(false)
  })
})
