/**
 * The IPC job store passes a translation's `mode` on (spec 6.3): 'easy'
 * reaches the easy explanation; without a mode every request stays exactly
 * as it was.
 */
import { describe, expect, it, vi } from 'vitest'
import { createIpcJobStore } from '../src/renderer/doc-jobs/ipc-store'
import type { PdfStoreWriteRequest } from '../src/shared/ipc'

const DOC = 'a'.repeat(64)
const KEY = { pageFingerprint: 'b'.repeat(64), textHash: 'c'.repeat(64), occurrence: 0 }

function fakeApi() {
  const writes: PdfStoreWriteRequest[] = []
  const api = {
    aiReadPages: vi.fn(async () => ({ ok: true as const, pages: [] })),
    translation: vi.fn(async () => ({ ok: true as const, translation: null })),
    write: vi.fn(async (request: PdfStoreWriteRequest) => {
      writes.push(request)
      return { ok: true as const, removed: 0 }
    }),
  }
  return { api, writes }
}

describe('createIpcJobStore and the translation mode', () => {
  it('sends every request as before without a mode', async () => {
    const { api, writes } = fakeApi()
    const store = createIpcJobStore(api)
    await store.readTranslation(DOC, 'ko')
    await store.writeTranslationMeta(DOC, 'ko', { provider: 'p', model: 'm' })
    await store.writeTranslationBlocks(DOC, 'ko', [{ key: KEY, status: 'failed' }])
    await store.deleteTranslation(DOC, 'ko')
    await store.deleteTranslationExceptEdited!(DOC, 'ko', 'translate')
    await store.writeJob(DOC, { kind: 'translate', lang: 'ko', state: 'running' })
    expect(api.translation.mock.calls).toEqual([[DOC, 'ko']])
    expect(writes).toEqual([
      { kind: 'translationMeta', docHash: DOC, lang: 'ko', provider: 'p', model: 'm' },
      {
        kind: 'translationBlocks',
        docHash: DOC,
        lang: 'ko',
        blocks: [{ key: KEY, status: 'failed' }],
      },
      { kind: 'deleteTranslation', docHash: DOC, lang: 'ko' },
      { kind: 'deleteTranslationExceptEdited', docHash: DOC, lang: 'ko' },
      { kind: 'job', docHash: DOC, job: { kind: 'translate', lang: 'ko', state: 'running' } },
    ])
  })

  it("passes mode 'easy' on to every translation call and the job record", async () => {
    const { api, writes } = fakeApi()
    const store = createIpcJobStore(api)
    await store.readTranslation(DOC, 'ko', 'easy')
    await store.writeTranslationMeta(DOC, 'ko', { provider: 'p', model: 'm' }, 'easy')
    await store.writeTranslationBlocks(DOC, 'ko', [], 'easy')
    await store.deleteTranslation(DOC, 'ko', 'easy')
    await store.deleteTranslationExceptEdited!(DOC, 'ko', 'easy')
    await store.writeJob(DOC, { kind: 'translate', lang: 'ko', state: 'running', mode: 'easy' })
    expect(api.translation.mock.calls).toEqual([[DOC, 'ko', 'easy']])
    expect(writes.map((w) => ('mode' in w ? w.mode : undefined))).toEqual([
      'easy',
      'easy',
      'easy',
      'easy',
      undefined,
    ])
    expect(writes.at(-1)).toEqual({
      kind: 'job',
      docHash: DOC,
      job: { kind: 'translate', lang: 'ko', state: 'running', mode: 'easy' },
    })
  })
})
