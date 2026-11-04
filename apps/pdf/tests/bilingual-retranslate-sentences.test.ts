/**
 * "Translate again" on one paragraph, sentence by sentence (spec 4.2): the
 * call sends a block of two or more sentences as a sentence list, split by
 * the document language the view passes (or, without it, the block's own
 * guess); a good answer is stored with both sentence-end lists, and a count
 * that differs is stored as a paragraph without them, still in one call.
 * The model and the store are fakes.
 */
import { describe, expect, it } from 'vitest'
import type { TranslationBlockKey } from '../../../packages/pdf-structure/src/store/keys'
import type { TranslationModelRequest } from '../../../packages/pdf-structure/src/translate/call'
import type { InlineRun } from '../../../packages/pdf-structure/src/tree/types'
import { retranslateBlock } from '../src/renderer/bilingual/retranslate'
import type { PdfStoreWriteRequest } from '../src/shared/ipc'

const t = (text: string, bold?: true): InlineRun =>
  bold ? { kind: 'text', text, bold } : { kind: 'text', text }
const KEY: TranslationBlockKey = { pageFingerprint: 'fp1', textHash: 'h', occurrence: 0 }
const SOURCE: InlineRun[] = [t('Hello '), t('world', true), t('. Bye now.')]

interface SentBlock {
  id: string
  text?: string
  sentences?: string[]
}
const sentBlocks = (req: TranslationModelRequest): SentBlock[] => {
  const json = /<document_blocks>\n([\s\S]*)\n<\/document_blocks>/.exec(req.prompt)?.[1]
  return (JSON.parse(json!) as { blocks: SentBlock[] }).blocks
}

function fakeStore() {
  const writes: PdfStoreWriteRequest[] = []
  return {
    writes,
    store: {
      translation: async () => ({
        ok: true as const,
        translation: { lang: 'ko', provider: 'claude-code', model: 'opus', blocks: [] },
      }),
      write: async (request: PdfStoreWriteRequest) => {
        writes.push(structuredClone(request))
        return { ok: true as const }
      },
    },
  }
}

function run(
  answer: unknown,
  extra: { sourceLang?: string; source?: InlineRun[] } = {},
): Promise<{ log: TranslationModelRequest[]; writes: PdfStoreWriteRequest[]; ok: boolean }> {
  const log: TranslationModelRequest[] = []
  const { store, writes } = fakeStore()
  return retranslateBlock({
    docHash: 'd'.repeat(64),
    lang: 'ko',
    unit: { key: KEY, page: 1, source: extra.source ?? SOURCE, state: 'translated' },
    send: async (req) => {
      log.push(req)
      return JSON.stringify({ translations: [{ id: '1', ...(answer as object) }] })
    },
    store,
    model: { provider: 'claude-code', model: 'opus' },
    signal: new AbortController().signal,
    ...(extra.sourceLang !== undefined ? { sourceLang: extra.sourceLang } : {}),
  }).then((out) => ({ log, writes, ok: out.ok }))
}

const storedBlock = (writes: PdfStoreWriteRequest[]) => {
  const w = writes.find((x) => x.kind === 'translationBlocks')
  return w?.kind === 'translationBlocks' ? w.blocks[0] : undefined
}

describe('translate again, sentence by sentence', () => {
  it('passes the document language and stores both sentence-end lists', async () => {
    const { log, writes, ok } = await run(
      { sentences: ['안녕 <b>세계</b>.', '잘 가.'] },
      { sourceLang: 'en' },
    )
    expect(ok).toBe(true)
    expect(log).toHaveLength(1)
    expect(log[0]!.sourceLang).toBe('en')
    expect(sentBlocks(log[0]!)).toEqual([
      { id: '1', sentences: ['Hello <b>world</b>.', 'Bye now.'] },
    ])
    expect(storedBlock(writes)).toEqual({
      key: KEY,
      status: 'translated',
      text: '안녕 세계. 잘 가.',
      runs: [t('안녕 '), t('세계', true), t('. 잘 가.')],
      sourceSentenceEnds: [12, 21],
      sentenceEnds: [6, 11],
    })
  })

  it('without a document language it guesses one from the block', async () => {
    const source = [t('이것은 꽤 긴 한국어 문장입니다. 그리고 이것은 두 번째 문장입니다.')]
    const { log } = await run({ sentences: ['This is long.', 'And second.'] }, { source })
    expect(log[0]!.sourceLang).toBe('ko')
    expect(sentBlocks(log[0]!)[0]!.sentences).toHaveLength(2)
  })

  it('a sentence count that differs is stored as a paragraph, in the one call', async () => {
    const { log, writes, ok } = await run(
      { sentences: ['안녕 <b>세계</b>. 잘 가.'] },
      { sourceLang: 'en' },
    )
    expect(ok).toBe(true)
    expect(log).toHaveLength(1)
    const block = storedBlock(writes)
    expect(block).toMatchObject({ status: 'translated', text: '안녕 세계. 잘 가.' })
    expect(block).not.toHaveProperty('sentenceEnds')
    expect(block).not.toHaveProperty('sourceSentenceEnds')
  })
})
