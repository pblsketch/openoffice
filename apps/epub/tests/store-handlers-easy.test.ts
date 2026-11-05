// @vitest-environment node
/**
 * `epub:store-*` and the book's easy explanation (spec 6.2, 6.3): the same
 * channels take an optional `mode`; 'easy' reaches `easy/<lang>/` and the
 * easy `translate` record in the same store, EPUB keys unchanged. Left out,
 * every call reaches the plain translation as before.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResultStore } from '@genoffice/pdf-structure/store'
import { createEpubStoreHandlers } from '../src/main/store-handlers'

const HASH = 'a'.repeat(64)
const OWNER = 7
const key = { pageFingerprint: 'c'.repeat(64), textHash: 'd'.repeat(64), occurrence: 0 }

let dir: string
let store: ResultStore
let handlers: ReturnType<typeof createEpubStoreHandlers>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-epub-easy-'))
  store = new ResultStore(dir)
  handlers = createEpubStoreHandlers({
    store: () => store,
    knows: (owner, docHash) => owner === OWNER && docHash === HASH,
  })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('the easy explanation of a book', () => {
  it('writes, reads, beats and lists apart from the translation', async () => {
    const writes = [
      {
        kind: 'translationMeta',
        docHash: HASH,
        lang: 'ko',
        provider: 'p',
        model: 'm',
        mode: 'easy',
      },
      {
        kind: 'translationBlocks',
        docHash: HASH,
        lang: 'ko',
        blocks: [{ key, status: 'translated', text: 'easy' }],
        mode: 'easy',
      },
      {
        kind: 'job',
        docHash: HASH,
        lang: 'ko',
        mode: 'easy',
        job: { kind: 'translate', lang: 'ko', state: 'running', mode: 'easy' },
      },
      { kind: 'heartbeat', docHash: HASH, job: 'translate', lang: 'ko', mode: 'easy' },
    ]
    for (const w of writes) expect(await handlers.write(OWNER, w)).toEqual({ ok: true })
    expect(store.translationDir(HASH, 'ko', 'easy')).toBe(
      join(dir, 'pdf-store', 'docs', HASH, 'easy', 'ko'),
    )

    expect(await handlers.translations(OWNER, HASH)).toEqual({ ok: true, langs: [] })
    expect(await handlers.translations(OWNER, HASH, 'easy')).toEqual({ ok: true, langs: ['ko'] })
    expect(await handlers.translation(OWNER, HASH, 'ko')).toEqual({ ok: true, translation: null })
    expect(await handlers.translation(OWNER, HASH, 'ko', 'easy')).toMatchObject({
      ok: true,
      translation: { lang: 'ko', provider: 'p', blocks: [{ key, text: 'easy' }] },
    })
    expect(await handlers.unfinishedJobs(OWNER, HASH)).toMatchObject({
      ok: true,
      jobs: [{ kind: 'translate', lang: 'ko', mode: 'easy', state: 'running' }],
    })
    // the plain heartbeat finds no plain record
    expect(
      await handlers.write(OWNER, {
        kind: 'heartbeat',
        docHash: HASH,
        job: 'translate',
        lang: 'ko',
      }),
    ).toMatchObject({ ok: false, error: 'failed' })

    expect(
      await handlers.write(OWNER, {
        kind: 'deleteTranslationExceptEdited',
        docHash: HASH,
        lang: 'ko',
        mode: 'easy',
      }),
    ).toEqual({ ok: true, removed: 1 })
    expect(
      await handlers.write(OWNER, {
        kind: 'deleteTranslation',
        docHash: HASH,
        lang: 'ko',
        mode: 'easy',
      }),
    ).toEqual({ ok: true })
    expect(await handlers.translations(OWNER, HASH, 'easy')).toEqual({ ok: true, langs: [] })
  })

  it('refuses a job record whose mode is not the request mode, and a mode that is not one', async () => {
    const job = { kind: 'translate', lang: 'ko', state: 'running', mode: 'easy' }
    expect(
      await handlers.write(OWNER, { kind: 'job', docHash: HASH, lang: 'ko', job }),
    ).toMatchObject({ ok: false, error: 'invalid-request' })
    expect(
      await handlers.write(OWNER, {
        kind: 'job',
        docHash: HASH,
        lang: 'ko',
        mode: 'easy',
        job: { kind: 'translate', lang: 'ko', state: 'running' },
      }),
    ).toMatchObject({ ok: false, error: 'invalid-request' })
    expect(await handlers.translations(OWNER, HASH, 'x')).toMatchObject({
      error: 'invalid-request',
    })
    expect(await handlers.translation(OWNER, HASH, 'ko', 1)).toMatchObject({
      error: 'invalid-request',
    })
    expect(
      await handlers.write(OWNER, {
        kind: 'deleteTranslation',
        docHash: HASH,
        lang: 'ko',
        mode: 'x',
      }),
    ).toMatchObject({ error: 'invalid-request' })
    expect(await store.listJobs(HASH)).toEqual([])
  })

  it('calls the store as before when no mode is given', async () => {
    const list = vi.spyOn(store, 'listTranslations')
    const read = vi.spyOn(store, 'readTranslation')
    const meta = vi.spyOn(store, 'writeTranslationMeta')
    const beat = vi.spyOn(store, 'heartbeatJob')
    await handlers.translations(OWNER, HASH)
    await handlers.translation(OWNER, HASH, 'ko')
    await handlers.write(OWNER, {
      kind: 'translationMeta',
      docHash: HASH,
      lang: 'ko',
      provider: 'p',
      model: 'm',
    })
    await handlers.write(OWNER, { kind: 'heartbeat', docHash: HASH, job: 'translate', lang: 'ko' })
    expect(list).toHaveBeenCalledWith(HASH)
    expect(read).toHaveBeenCalledWith(HASH, 'ko')
    expect(meta).toHaveBeenCalledWith(HASH, 'ko', { provider: 'p', model: 'm' })
    expect(beat).toHaveBeenCalledWith(HASH, 'translate', 'ko')
  })
})
