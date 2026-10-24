// pdf-structure pulls in pdf2docx sources; their bidi-js shim is not on this package's include list.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../pdf2docx/src/bidi-js.d.ts" />
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DocumentJobRegistry, type TranslationModelRequest } from '@genoffice/pdf-structure'
import { blockKeyString, ResultStore } from '@genoffice/pdf-structure/store'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openEpub } from '../src/open'
import {
  EPUB_METADATA_FINGERPRINT,
  defaultEpubTargetLanguage,
  epubBlockKeyString,
  epubBookLanguage,
  epubChapterFingerprint,
  epubDocumentHash,
  epubMigrationInfo,
  epubSampleText,
  epubTranslationUnits,
  estimateEpubTranslationJob,
  planEpubTranslationJob,
  startEpubTranslationJob,
  type EpubTranslationUnit,
} from '../src/translate'
import {
  FakeRunError,
  answerWith,
  openTranslateBook,
  requestBlocks,
  shout,
  translateBookBytes,
} from './translate-helpers'

const MODEL = { provider: 'claude', model: '' }
const FAST = { retryDelayMs: 0, heartbeatMs: 60_000 }

let root: string
let store: ResultStore

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'epub-translate-'))
  store = new ResultStore(root)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

async function bookUnits(): Promise<{ docHash: string; units: EpubTranslationUnit[] }> {
  const bytes = await translateBookBytes()
  const opened = await openEpub(bytes)
  if (!opened.ok) throw new Error(opened.reason)
  return {
    docHash: await epubDocumentHash(bytes),
    units: (await epubTranslationUnits(opened.book)).units,
  }
}

/** a fake model that records what it was sent */
function fakeModel(answer: (text: string) => string | undefined = shout) {
  const sent: string[][] = []
  const send = async (request: TranslationModelRequest) => {
    const blocks = requestBlocks(request.prompt)
    sent.push(blocks.map((b) => b.text))
    return answerWith(blocks, answer)
  }
  return { sent, send }
}

describe('EPUB translation job', () => {
  it('translates every unit into the store and records the provider', async () => {
    const { docHash, units } = await bookUnits()
    const model = fakeModel()
    const handle = startEpubTranslationJob({
      docHash,
      lang: 'ko',
      units,
      model: MODEL,
      store,
      send: model.send,
      registry: new DocumentJobRegistry(),
      ...FAST,
    })
    const summary = await handle.result
    expect(summary.state).toBe('complete')
    expect(summary.progress).toEqual({ done: units.length, total: units.length })
    expect(model.sent).toHaveLength(1)
    expect(model.sent[0]).toEqual(units.map((u) => u.text))

    const stored = await store.readTranslation(docHash, 'ko')
    expect(stored).toMatchObject({ provider: 'claude', model: '' })
    expect(stored!.blocks.size).toBe(units.length)
    for (const u of units) {
      expect(stored!.blocks.get(epubBlockKeyString(u.key))).toMatchObject({
        status: 'translated',
        text: shout(u.text),
      })
    }
    expect((await store.readJob(docHash, 'translate', 'ko')).state).toBe('complete')
  })

  it('cuts the units into batches by the token budget', async () => {
    const { docHash, units } = await bookUnits()
    const estimate = await estimateEpubTranslationJob({
      docHash,
      lang: 'ko',
      units,
      model: MODEL,
      store,
      maxTokens: 20,
    })
    expect(estimate.calls).toBeGreaterThan(1)
    const model = fakeModel()
    const summary = await startEpubTranslationJob({
      docHash,
      lang: 'ko',
      units,
      model: MODEL,
      store,
      send: model.send,
      maxTokens: 20,
      registry: new DocumentJobRegistry(),
      ...FAST,
    }).result
    expect(summary.state).toBe('complete')
    expect(model.sent).toHaveLength(estimate.calls)
    expect(model.sent.flat()).toEqual(units.map((u) => u.text))
  })

  it('stores a block whose placeholders keep failing as failed, after two resends', async () => {
    const { docHash, units } = await bookUnits()
    const model = fakeModel((text) => text.replace(/<\/?x\d+\/?>/g, ''))
    const summary = await startEpubTranslationJob({
      docHash,
      lang: 'ko',
      units,
      model: MODEL,
      store,
      send: model.send,
      registry: new DocumentJobRegistry(),
      ...FAST,
    }).result
    expect(summary.state).toBe('complete')
    expect(model.sent).toHaveLength(3)
    const withPlaceholders = units.filter((u) => u.context.placeholders.length > 0)
    expect(model.sent[1]).toEqual(withPlaceholders.map((u) => u.text))
    expect(model.sent[2]).toEqual(withPlaceholders.map((u) => u.text))
    const stored = await store.readTranslation(docHash, 'ko')
    for (const u of withPlaceholders) {
      expect(stored!.blocks.get(epubBlockKeyString(u.key))).toMatchObject({
        status: 'failed',
        reason: 'placeholder-mismatch',
      })
    }
  })

  it('resumes: stored blocks are not sent again', async () => {
    const { docHash, units } = await bookUnits()
    // a first run stops on a rate limit after the first batch
    let calls = 0
    const first = fakeModel()
    const stopped = await startEpubTranslationJob({
      docHash,
      lang: 'ko',
      units,
      model: MODEL,
      store,
      maxTokens: 20,
      concurrency: 1,
      send: async (request) => {
        if (++calls === 2) throw new FakeRunError('rate-limit', 1_000)
        return first.send(request)
      },
      registry: new DocumentJobRegistry(),
      ...FAST,
    }).result
    expect(stopped.state).toBe('stopped')
    expect(stopped.stopReason).toBe('rate-limit')
    expect(stopped.resetsAt).toBe(1_000)
    const doneFirst = first.sent.flat()
    expect(doneFirst.length).toBeGreaterThan(0)
    expect(doneFirst.length).toBeLessThan(units.length)

    const estimate = await estimateEpubTranslationJob({
      docHash,
      lang: 'ko',
      units,
      model: MODEL,
      store,
      maxTokens: 20,
    })
    expect(estimate).toMatchObject({
      done: doneFirst.length,
      pending: units.length - doneFirst.length,
      total: units.length,
      providerChange: null,
    })

    const second = fakeModel()
    const summary = await startEpubTranslationJob({
      docHash,
      lang: 'ko',
      units,
      model: MODEL,
      store,
      send: second.send,
      registry: new DocumentJobRegistry(),
      ...FAST,
    }).result
    expect(summary.state).toBe('complete')
    expect(summary.skippedItems).toBe(doneFirst.length)
    expect(second.sent.flat()).toEqual(units.slice(doneFirst.length).map((u) => u.text))
    expect((await store.readTranslation(docHash, 'ko'))!.blocks.size).toBe(units.length)

    const plan = await planEpubTranslationJob({ docHash, lang: 'ko', units, model: MODEL, store })
    expect(plan.batches).toEqual([])
    expect(plan.estimate).toMatchObject({ calls: 0, pending: 0, done: units.length })
  })

  it('a restart sends everything again', async () => {
    const { docHash, units } = await bookUnits()
    const run = (restart: boolean) => {
      const model = fakeModel()
      return startEpubTranslationJob({
        docHash,
        lang: 'ko',
        units,
        model: MODEL,
        store,
        send: model.send,
        restart,
        registry: new DocumentJobRegistry(),
        ...FAST,
      }).result.then(() => model.sent.flat())
    }
    expect(await run(false)).toHaveLength(units.length)
    expect(await run(false)).toHaveLength(0)
    expect(await run(true)).toHaveLength(units.length)
  })

  it('stops at once on a stop kind and keeps it as the reason', async () => {
    for (const kind of ['signed-out', 'credits', 'not-connected']) {
      const { docHash, units } = await bookUnits()
      let calls = 0
      const summary = await startEpubTranslationJob({
        docHash,
        lang: 'ko',
        units,
        model: MODEL,
        store,
        maxTokens: 20,
        send: async () => {
          calls++
          throw new FakeRunError(kind)
        },
        registry: new DocumentJobRegistry(),
        ...FAST,
      }).result
      expect(summary.state).toBe('stopped')
      expect(summary.stopReason).toBe(kind)
      expect(calls).toBeLessThanOrEqual(2)
      expect(await store.readTranslation(docHash, 'ko')).toBeNull()
    }
  })

  it('reports a provider change against the stored translation', async () => {
    const { docHash, units } = await bookUnits()
    await startEpubTranslationJob({
      docHash,
      lang: 'ko',
      units,
      model: MODEL,
      store,
      send: fakeModel().send,
      registry: new DocumentJobRegistry(),
      ...FAST,
    }).result
    const estimate = await estimateEpubTranslationJob({
      docHash,
      lang: 'ko',
      units,
      model: { provider: 'codex', model: 'm' },
      store,
    })
    expect(estimate.providerChange).toEqual({
      stored: { provider: 'claude', model: '' },
      next: { provider: 'codex', model: 'm' },
    })
  })
})

describe('default target language', () => {
  it('takes dc:language first', () => {
    expect(epubBookLanguage(['fr-CA', 'en'], '한국어 본문입니다 한국어 본문입니다 한국어')).toBe(
      'fr-CA',
    )
    expect(defaultEpubTargetLanguage('ko', ['fr'], '')).toBe('ko')
    expect(defaultEpubTargetLanguage('fr', ['fr-CA'], '')).toBe('en')
    expect(defaultEpubTargetLanguage('zh-TW', ['zh-Hans'], '')).toBe('en')
  })

  it('guesses from the text when the book names no language', () => {
    const korean = '이 책은 한국어로 쓴 책입니다. '.repeat(4)
    expect(epubBookLanguage([], korean)).toBe('ko')
    expect(epubBookLanguage(['', 'und'], korean)).toBe('ko')
    expect(defaultEpubTargetLanguage('ko', [], korean)).toBe('en')
    expect(defaultEpubTargetLanguage('ja', [], korean)).toBe('ja')
    expect(epubBookLanguage([], '')).toBeUndefined()
    expect(defaultEpubTargetLanguage('de', [], '')).toBe('de')
  })

  it('normalizes the UI language like the PDF rule', () => {
    expect(defaultEpubTargetLanguage('pt-BR', ['ja'], '')).toBe('pt')
    expect(defaultEpubTargetLanguage('xx', ['ja'], '')).toBe('en')
  })

  it('samples the book text from the block units', async () => {
    const book = await openTranslateBook({ languages: [] })
    const { units } = await epubTranslationUnits(book)
    const sample = epubSampleText(units)
    expect(sample).toContain('The 漢 sign & bold text.')
    expect(sample).not.toContain('<x1>')
    expect(sample).not.toContain('A Tale')
    expect(defaultEpubTargetLanguage('en', book.metadata.languages, sample)).toBe('en')
  })
})

describe('epubMigrationInfo', () => {
  it('lists the saved book chapter fingerprints and the block keys still present', async () => {
    const before = await translateBookBytes()
    const afterBytes = await translateBookBytes({
      chapterOneBody: '<h1>Chapter <em>One</em></h1>\n<p>Changed.</p>\n<p>Same line.</p>',
    })
    const opened = await openEpub(afterBytes)
    if (!opened.ok) throw new Error(opened.reason)
    const info = await epubMigrationInfo(opened.book, {
      oldDocHash: await epubDocumentHash(before),
      newDocHash: await epubDocumentHash(afterBytes),
    })
    expect(info.oldDocHash).toBe(await epubDocumentHash(before))
    expect(info.newDocHash).toBe(await epubDocumentHash(afterBytes))
    expect(info.pageFingerprints).toEqual([
      EPUB_METADATA_FINGERPRINT,
      ...opened.book.spine.items.map((item) => epubChapterFingerprint(item.path)),
    ])
    const units = (await epubTranslationUnits(opened.book)).units
    expect(info.blockKeys).toEqual(units.map((u) => u.key))
    expect(info.keepBlockKeys).toEqual(units.map((u) => u.key))
  })

  it('carries the translation to the saved book through the store', async () => {
    const before = await translateBookBytes()
    const openedBefore = await openEpub(before)
    if (!openedBefore.ok) throw new Error(openedBefore.reason)
    const oldDocHash = await epubDocumentHash(before)
    const units = (await epubTranslationUnits(openedBefore.book)).units
    await startEpubTranslationJob({
      docHash: oldDocHash,
      lang: 'ko',
      units,
      model: MODEL,
      store,
      send: fakeModel().send,
      registry: new DocumentJobRegistry(),
      ...FAST,
    }).result

    const afterBytes = await translateBookBytes({
      chapterOneBody: '<h1>Chapter <em>One</em></h1>\n<p>Changed.</p>\n<p>Same line.</p>',
    })
    const openedAfter = await openEpub(afterBytes)
    if (!openedAfter.ok) throw new Error(openedAfter.reason)
    const info = await epubMigrationInfo(openedAfter.book, {
      oldDocHash,
      newDocHash: await epubDocumentHash(afterBytes),
    })
    await store.migrateDocument(info)
    const unitsAfter = (await epubTranslationUnits(openedAfter.book)).units
    const estimate = await estimateEpubTranslationJob({
      docHash: info.newDocHash,
      lang: 'ko',
      units: unitsAfter,
      model: MODEL,
      store,
    })
    // only the changed paragraph is new
    expect(estimate.pending).toBe(1)
    expect(estimate.done).toBe(unitsAfter.length - 1)
    // and the old paragraph's translation did not move: only keys the saved book has
    const moved = await store.readTranslation(info.newDocHash, 'ko')
    const keysAfter = new Set(unitsAfter.map((u) => blockKeyString(u.key)))
    expect(moved!.blocks.size).toBe(unitsAfter.length - 1)
    for (const key of moved!.blocks.keys()) expect(keysAfter.has(key), key).toBe(true)
  })
})
