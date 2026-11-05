/**
 * Sending and receiving sentence by sentence (spec 4.2, 4.3, 11.1): a unit
 * with two or more sentences goes as a sentence list, an answer with the same
 * count and each sentence's own placeholders is kept with its sentence ends,
 * any other answer is kept as one paragraph without a resend when the joined
 * text passes the block check, and resent as before when it does not. The
 * output files read only the translated text and runs, so the ends change
 * nothing in them. The model is a fake; calls are counted.
 */
import { describe, expect, it } from 'vitest'
import {
  DocumentJobRegistry,
  startTranslationJob,
  type DocumentJobStore,
  type TranslationBlockResult,
  type TranslationJobItem,
} from '../src/jobs'
import {
  blockKeyString,
  sentenceEndsPair,
  translationBlockKeys,
  type JobRecordInput,
  type StoredTranslation,
  type TranslationBlockEntry,
  type TranslationBlockInput,
  type TranslationMetaInput,
} from '../src/store'
import { writeEpub } from '../src/epub'
import { treeToMarkdown } from '../src/markdown'
import { runsText } from '../src/tree/inline'
import { sha256Hex, type DocumentTree, type InlineRun, type TextUnit } from '../src/tree'
import {
  BLOCK_OVERHEAD_TOKENS,
  SENTENCE_OVERHEAD_TOKENS,
  TRANSLATION_MAX_RESENDS,
  batchTranslationItems,
  blockTokens,
  buildBilingualTree,
  buildTranslatedTree,
  buildTranslationRequest,
  createTranslationModelCall,
  estimateTokens,
  parseSentenceTranslationOutput,
  parseTranslationOutput,
  splitSentences,
  translationJobParts,
  translationSentenceSeparator,
  translationSourceLanguage,
  translationSystemPrompt,
  translationUnits,
  type TranslationModelRequest,
} from '../src/translate'

// ── helpers ──

const t = (text: string, marks: { bold?: true; italic?: true; href?: string } = {}): InlineRun => ({
  kind: 'text',
  text,
  ...marks,
})
const note = (id: string): InlineRun => ({ kind: 'footnoteRef', id, marker: id })

type Block = { runs: InlineRun[]; page: number; pageFingerprint: string }
const item = (runs: InlineRun[], n = 0): TranslationJobItem<Block> => ({
  block: { runs, page: 1, pageFingerprint: 'fp' },
  key: { pageFingerprint: 'fp', textHash: `h${n}`, occurrence: 0 },
})

interface SentBlock {
  id: string
  text?: string
  sentences?: string[]
}

/** the data blocks of a request */
function sentBlocks(req: TranslationModelRequest): SentBlock[] {
  const json = /<document_blocks>\n([\s\S]*)\n<\/document_blocks>/.exec(req.prompt)?.[1]
  return (JSON.parse(json!) as { blocks: SentBlock[] }).blocks
}

type Answer = { id: string; text: string } | { id: string; sentences: string[] }
const answer = (entries: Answer[]): string => JSON.stringify({ translations: entries })

/** upper-case the text between placeholders: keeps every tag where it was */
const shout = (encoded: string): string =>
  encoded.replace(/(^|>)([^<]*)/g, (_m, edge: string, text: string) => edge + text.toUpperCase())

/** a model that mirrors the request shape and shouts every text */
function mirrorModel(log: TranslationModelRequest[] = []) {
  return async (req: TranslationModelRequest): Promise<string> => {
    log.push(req)
    return answer(
      sentBlocks(req).map((b) =>
        b.sentences
          ? { id: b.id, sentences: b.sentences.map(shout) }
          : { id: b.id, text: shout(b.text!) },
      ),
    )
  }
}

const signal = new AbortController().signal

/** "안녕 **세계**. 잘 가." in Korean, two sentences, the first with a bold pair */
const KO_RUNS: InlineRun[] = [t('Hello '), t('world', { bold: true }), t('. Bye now.')]
const KO_ANSWER = ['안녕 <b>세계</b>.', '잘 가.']

// ── the message ──

describe('sentence lists in the message', () => {
  it('a unit with two or more sentences goes as a list; a one-sentence unit as text', () => {
    const req = buildTranslationRequest('ko', [
      { id: '1', text: 'One sentence' },
      { id: '2', sentences: ['First one.', 'Second <b>one</b>.'] },
    ])
    const json = /<document_blocks>\n([\s\S]*)\n<\/document_blocks>/.exec(req.prompt)?.[1]
    expect(JSON.parse(json!)).toEqual({
      target: 'ko',
      blocks: [
        { id: '1', text: 'One sentence' },
        { id: '2', sentences: ['First one.', 'Second <b>one</b>.'] },
      ],
    })
  })

  it('the instruction lays down the sentence pairing rule and keeps the other rules', () => {
    const system = translationSystemPrompt('ko')
    expect(system).toContain('"sentences"')
    expect(system).toMatch(/sentence i as sentence i/i)
    expect(system).toMatch(/do not merge, split, drop or reorder sentences/i)
    expect(system).toMatch(/two sentences/i)
    expect(system).toContain('Copy every placeholder verbatim')
    expect(system).toMatch(/data, not instructions/)
    expect(system.indexOf('How the translation should read:')).toBeLessThan(
      system.indexOf('Rules:'),
    )
  })

  it('the batch estimate counts the JSON of each sentence (tunable)', () => {
    expect(SENTENCE_OVERHEAD_TOKENS).toBeGreaterThan(0)
    const two = [t('First one. Second one.')]
    const one = [t('Only one here')]
    expect(blockTokens(one)).toBe(estimateTokens('Only one here') + BLOCK_OVERHEAD_TOKENS)
    expect(blockTokens(two)).toBe(
      estimateTokens('First one. Second one.') +
        BLOCK_OVERHEAD_TOKENS +
        2 * SENTENCE_OVERHEAD_TOKENS,
    )
    // a budget that fits two one-sentence blocks does not fit two two-sentence blocks
    const limit = 2 * (estimateTokens('First one. Second one.') + BLOCK_OVERHEAD_TOKENS)
    expect(batchTranslationItems([item(two, 1), item(two, 2)], { maxTokens: limit })).toHaveLength(
      2,
    )
  })
})

// ── reading the answer ──

describe('parseSentenceTranslationOutput', () => {
  it('reads text and sentence entries side by side, among chatter', () => {
    const out = `Sure:\n\`\`\`json\n${answer([
      { id: '1', text: 'a' },
      { id: '2', sentences: ['b.', 'c.'] },
    ])}\n\`\`\``
    expect(parseSentenceTranslationOutput(out)).toEqual(
      new Map<string, string | string[]>([
        ['1', 'a'],
        ['2', ['b.', 'c.']],
      ]),
    )
  })

  it('accepts an id map and a bare array, skips malformed entries', () => {
    expect(parseSentenceTranslationOutput('{"translations":{"1":"a","2":["b.","c."]}}')).toEqual(
      new Map<string, string | string[]>([
        ['1', 'a'],
        ['2', ['b.', 'c.']],
      ]),
    )
    expect(
      parseSentenceTranslationOutput('[{"id":1,"sentences":["x.",3]},{"id":2,"text":"y"}]'),
    ).toEqual(new Map([['2', 'y']]))
    expect(parseSentenceTranslationOutput('no json here')).toBeNull()
  })

  it('the shared reader EPUB uses is unchanged: sentence entries are not text', () => {
    const out = answer([
      { id: '1', text: 'a' },
      { id: '2', sentences: ['b.', 'c.'] },
    ])
    expect(parseTranslationOutput(out)).toEqual(new Map([['1', 'a']]))
  })
})

// ── the model call ──

describe('createTranslationModelCall, sentence by sentence', () => {
  it('counts that match keep the sentence ends; the text is the sentences joined', async () => {
    const log: TranslationModelRequest[] = []
    const call = createTranslationModelCall<Block>({
      lang: 'ko',
      sourceLang: 'en',
      send: async (req) => {
        log.push(req)
        return answer([{ id: '1', sentences: KO_ANSWER }])
      },
    })
    const [result] = await call([item(KO_RUNS)], signal)
    expect(log).toHaveLength(1)
    expect(log[0]!.sourceLang).toBe('en')
    expect(sentBlocks(log[0]!)).toEqual([
      { id: '1', sentences: ['Hello <b>world</b>.', 'Bye now.'] },
    ])
    const split = splitSentences(KO_RUNS, 'en')
    expect(split.kind).toBe('sentences')
    expect(result).toEqual({
      status: 'translated',
      text: '안녕 세계. 잘 가.',
      runs: [t('안녕 '), t('세계', { bold: true }), t('. 잘 가.')],
      sourceSentenceEnds: split.kind === 'sentences' ? split.sourceSentenceEnds : [],
      sentenceEnds: [6, 11],
    })
    const r = result as Extract<TranslationBlockResult, { status: 'translated' }>
    expect(r.sourceSentenceEnds).toEqual([12, 21])
    expect(r.text).toBe(runsText(r.runs!))
    expect(sentenceEndsPair(r.sourceSentenceEnds, r.sentenceEnds, r.text.length)).not.toBeNull()
  })

  it('each translated sentence is trimmed before joining', async () => {
    const call = createTranslationModelCall<Block>({
      lang: 'ko',
      send: async () => answer([{ id: '1', sentences: ['  안녕 <b>세계</b>.  ', '\n잘 가. '] }]),
    })
    const [result] = await call([item(KO_RUNS)], signal)
    expect(result).toMatchObject({ text: '안녕 세계. 잘 가.', sentenceEnds: [6, 11] })
  })

  it('a count that differs is not resent: kept as one paragraph, without sentence ends', async () => {
    let calls = 0
    const call = createTranslationModelCall<Block>({
      lang: 'ko',
      send: async () => {
        calls++
        return answer([{ id: '1', sentences: ['안녕 <b>세계</b>. 잘 가.'] }])
      },
    })
    const [result] = await call([item(KO_RUNS)], signal)
    expect(calls).toBe(1)
    expect(result).toEqual({
      status: 'translated',
      text: '안녕 세계. 잘 가.',
      runs: [t('안녕 '), t('세계', { bold: true }), t('. 잘 가.')],
    })
  })

  it('three sentences for two are joined, kept as a paragraph, not resent', async () => {
    let calls = 0
    const call = createTranslationModelCall<Block>({
      lang: 'ko',
      send: async () => {
        calls++
        return answer([{ id: '1', sentences: ['안녕 <b>세계</b>.', '잘', '가.'] }])
      },
    })
    const [result] = await call([item(KO_RUNS)], signal)
    expect(calls).toBe(1)
    expect(result).toEqual({
      status: 'translated',
      text: '안녕 세계. 잘 가.',
      runs: [t('안녕 '), t('세계', { bold: true }), t('. 잘 가.')],
    })
  })

  it('a plain text answer for a sentence list is kept as a paragraph', async () => {
    let calls = 0
    const call = createTranslationModelCall<Block>({
      lang: 'ko',
      send: async () => {
        calls++
        return answer([{ id: '1', text: '안녕 <b>세계</b>. 잘 가.' }])
      },
    })
    const [result] = await call([item(KO_RUNS)], signal)
    expect(calls).toBe(1)
    expect(result).toMatchObject({ status: 'translated', text: '안녕 세계. 잘 가.' })
    expect(result).not.toHaveProperty('sentenceEnds')
    expect(result).not.toHaveProperty('sourceSentenceEnds')
  })

  it('placeholders moved to another sentence: the joined text passes, kept as a paragraph', async () => {
    let calls = 0
    const call = createTranslationModelCall<Block>({
      lang: 'ko',
      send: async () => {
        calls++
        // the bold pair belongs to sentence 1 but came back in sentence 2
        return answer([{ id: '1', sentences: ['안녕 세계.', '<b>잘</b> 가.'] }])
      },
    })
    const [result] = await call([item(KO_RUNS)], signal)
    expect(calls).toBe(1)
    expect(result).toEqual({
      status: 'translated',
      text: '안녕 세계. 잘 가.',
      runs: [t('안녕 세계. '), t('잘', { bold: true }), t(' 가.')],
    })
  })

  it('an empty translated sentence: the joined text passes, kept as a paragraph', async () => {
    let calls = 0
    const call = createTranslationModelCall<Block>({
      lang: 'ko',
      send: async () => {
        calls++
        return answer([{ id: '1', sentences: ['안녕 <b>세계</b>. 잘 가.', '  '] }])
      },
    })
    const [result] = await call([item(KO_RUNS)], signal)
    expect(calls).toBe(1)
    expect(result).toMatchObject({ status: 'translated', text: '안녕 세계. 잘 가.' })
    expect(result).not.toHaveProperty('sentenceEnds')
  })

  it('a joined text that fails the block check is resent as today, then fails', async () => {
    const log: TranslationModelRequest[] = []
    const call = createTranslationModelCall<Block>({
      lang: 'ko',
      send: async (req) => {
        log.push(req)
        // the bold pair is lost
        return answer([{ id: '1', sentences: ['안녕 세계.', '잘 가.'] }])
      },
    })
    const [result] = await call([item(KO_RUNS)], signal)
    expect(log).toHaveLength(1 + TRANSLATION_MAX_RESENDS)
    expect(log.map((r) => r.attempt)).toEqual([0, 1, 2])
    // a resend sends the same sentence list again
    for (const r of log) {
      expect(sentBlocks(r)).toEqual([{ id: '1', sentences: ['Hello <b>world</b>.', 'Bye now.'] }])
    }
    expect(result).toEqual({ status: 'failed', reason: 'placeholder-mismatch' })
  })

  it('a resend that comes back right keeps the sentence ends', async () => {
    let calls = 0
    const call = createTranslationModelCall<Block>({
      lang: 'ko',
      send: async () => {
        calls++
        return answer([{ id: '1', sentences: calls === 1 ? ['안녕 세계.', '잘 가.'] : KO_ANSWER }])
      },
    })
    const [result] = await call([item(KO_RUNS)], signal)
    expect(calls).toBe(2)
    expect(result).toMatchObject({ status: 'translated', sentenceEnds: [6, 11] })
  })

  it('a mixed batch: paragraph blocks and sentence blocks side by side', async () => {
    const log: TranslationModelRequest[] = []
    const call = createTranslationModelCall<Block>({ lang: 'de', send: mirrorModel(log) })
    const results = await call(
      [
        item([t('Just a heading')], 1),
        item([t('Sentence one'), note('1'), t('. Sentence two.')], 2),
        item([t('Another single line')], 3),
      ],
      signal,
    )
    expect(log).toHaveLength(1)
    expect(sentBlocks(log[0]!)).toEqual([
      { id: '1', text: 'Just a heading' },
      { id: '2', sentences: ['Sentence one<n1/>.', 'Sentence two.'] },
      { id: '3', text: 'Another single line' },
    ])
    expect(results[0]).toEqual({
      status: 'translated',
      text: 'JUST A HEADING',
      runs: [t('JUST A HEADING')],
    })
    expect(results[1]).toEqual({
      status: 'translated',
      text: 'SENTENCE ONE. SENTENCE TWO.',
      runs: [t('SENTENCE ONE'), note('1'), t('. SENTENCE TWO.')],
      sourceSentenceEnds: [13, 27],
      sentenceEnds: [13, 27],
    })
    expect(results[2]).toMatchObject({ status: 'translated', text: 'ANOTHER SINGLE LINE' })
    expect(results[2]).not.toHaveProperty('sentenceEnds')
  })

  it('Chinese and Japanese join sentences with nothing between them', async () => {
    expect(translationSentenceSeparator('zh')).toBe('')
    expect(translationSentenceSeparator('zh-TW')).toBe('')
    expect(translationSentenceSeparator('ja')).toBe('')
    expect(translationSentenceSeparator('ko')).toBe(' ')
    expect(translationSentenceSeparator('en')).toBe(' ')
    const cases: [string, string[], string, number[]][] = [
      ['ja', ['こんにちは<b>世界</b>。', 'さようなら。'], 'こんにちは世界。さようなら。', [8, 14]],
      ['zh', ['你好<b>世界</b>。', '再见。'], '你好世界。再见。', [5, 8]],
      ['zh-TW', ['你好<b>世界</b>。', '再見。'], '你好世界。再見。', [5, 8]],
      ['fr', ['Bonjour le <b>monde</b>.', 'Au revoir.'], 'Bonjour le monde. Au revoir.', [17, 28]],
    ]
    for (const [lang, sentences, text, ends] of cases) {
      const call = createTranslationModelCall<Block>({
        lang,
        send: async () => answer([{ id: '1', sentences }]),
      })
      const [result] = await call([item(KO_RUNS)], signal)
      expect(result, lang).toMatchObject({ status: 'translated', text, sentenceEnds: ends })
    }
  })

  it('a count mismatch in Japanese joins without spaces too', async () => {
    const call = createTranslationModelCall<Block>({
      lang: 'ja',
      send: async () =>
        answer([{ id: '1', sentences: ['こんにちは<b>世界</b>。', 'さよう', 'なら。'] }]),
    })
    const [result] = await call([item(KO_RUNS)], signal)
    expect(result).toEqual({
      status: 'translated',
      text: 'こんにちは世界。さようなら。',
      runs: [t('こんにちは'), t('世界', { bold: true }), t('。さようなら。')],
    })
  })
})

// ── through the job and the store ──

type Store = Pick<
  DocumentJobStore,
  | 'readTranslation'
  | 'writeTranslationMeta'
  | 'writeTranslationBlocks'
  | 'deleteTranslation'
  | 'writeJob'
>

class MemoryStore implements Store {
  readonly blocks = new Map<string, TranslationBlockEntry>()
  readonly written: TranslationBlockInput[] = []
  meta: TranslationMetaInput | null = null
  async writeJob(_docHash: string, _job: JobRecordInput): Promise<void> {}
  async readTranslation(_docHash: string, lang: string): Promise<StoredTranslation | null> {
    if (!this.meta && this.blocks.size === 0) return null
    return {
      lang,
      provider: this.meta?.provider ?? null,
      model: this.meta?.model ?? null,
      blocks: new Map(structuredClone([...this.blocks])),
    }
  }
  async writeTranslationMeta(_docHash: string, _lang: string, meta: TranslationMetaInput) {
    this.meta = { ...meta }
  }
  async writeTranslationBlocks(_d: string, _l: string, blocks: readonly TranslationBlockInput[]) {
    for (const b of blocks) {
      this.written.push(structuredClone(b))
      this.blocks.set(blockKeyString(b.key), structuredClone({ ...b, savedAt: 1 }))
    }
  }
  async deleteTranslation(): Promise<void> {
    this.blocks.clear()
  }
}

const fp = (n: number) => sha256Hex(`sentence-page-${n}`)
const at = (page: number) => ({ page, pageFingerprint: fp(page), source: 'pdf' as const })

function tree(): DocumentTree {
  return {
    version: 1,
    variant: 'original',
    info: {},
    sourcePageCount: 1,
    pages: [{ page: 1, fingerprint: fp(1), status: 'text', widthPt: 612, heightPt: 792 }],
    blocks: [
      { ...at(1), id: 'p1.0', kind: 'pageBreak' },
      { ...at(1), id: 'p1.1', kind: 'heading', level: 1, levelSource: 'font', runs: [t('Title')] },
      { ...at(1), id: 'p1.2', kind: 'paragraph', runs: KO_RUNS },
      {
        ...at(1),
        id: 'p1.3',
        kind: 'paragraph',
        runs: [t('The first idea is '), t('simple', { italic: true }), t('. The second is not.')],
      },
    ],
    footnotes: [],
    outline: [],
    toc: [],
    footnoteLinkFailedPages: [],
    warnings: [],
  }
}

const docHash = sha256Hex('sentence-doc')

async function translate(send: (req: TranslationModelRequest) => Promise<string>) {
  const store = new MemoryStore()
  const parts = translationJobParts(tree(), { lang: 'ko', send })
  const summary = await startTranslationJob<TextUnit>({
    docHash,
    lang: 'ko',
    model: { provider: 'claude-code', model: 'opus' },
    store,
    registry: new DocumentJobRegistry(),
    retryDelayMs: 0,
    ...parts,
  }).result
  return { store, summary }
}

describe('sentence ends through the job', () => {
  it('the document language is guessed once from the tree and passed with every call', async () => {
    expect(translationSourceLanguage(tree())).toBe('en')
    const log: TranslationModelRequest[] = []
    await translate(mirrorModel(log))
    expect(log.length).toBeGreaterThan(0)
    expect(log.every((r) => r.sourceLang === 'en')).toBe(true)
  })

  it('the stored entry carries both lists; failed and paragraph entries carry none', async () => {
    const { store, summary } = await translate(async (req) =>
      answer(
        sentBlocks(req).map((b) =>
          b.sentences
            ? b.sentences[0]!.startsWith('Hello')
              ? { id: b.id, sentences: KO_ANSWER }
              : // the italic pair is lost every time
                { id: b.id, sentences: ['첫 생각은 단순하다.', '둘째는 아니다.'] }
            : { id: b.id, text: `[ko]${b.text!}` },
        ),
      ),
    )
    expect(summary.state).toBe('complete')
    const byText = new Map(store.written.map((w) => [w.text ?? w.reason, w]))
    expect(byText.get('[ko]Title')).toEqual(expect.objectContaining({ status: 'translated' }))
    expect(byText.get('[ko]Title')).not.toHaveProperty('sentenceEnds')
    expect(byText.get('안녕 세계. 잘 가.')).toMatchObject({
      status: 'translated',
      sourceSentenceEnds: [12, 21],
      sentenceEnds: [6, 11],
    })
    const failed = store.written.find((w) => w.status === 'failed')
    expect(failed).toEqual({ key: failed!.key, status: 'failed', reason: 'placeholder-mismatch' })
  })
})

// ── output files (4.3) ──

describe('output files read the translated text only', () => {
  const units = translationUnits(tree())
  const keys = translationBlockKeys(units)
  const runsOf = (text: string, bold: string): InlineRun[] => [t(text), t(bold, { bold: true })]

  function stored(withEnds: boolean): StoredTranslation {
    const entries: TranslationBlockEntry[] = [
      { key: keys[0]!, status: 'translated', text: '제목', runs: [t('제목')], savedAt: 1 },
      {
        key: keys[1]!,
        status: 'translated',
        text: '안녕 세계. 잘 가.',
        runs: [t('안녕 '), t('세계', { bold: true }), t('. 잘 가.')],
        savedAt: 1,
        ...(withEnds ? { sourceSentenceEnds: [12, 21], sentenceEnds: [6, 11] } : {}),
      },
      {
        key: keys[2]!,
        status: 'translated',
        text: '첫 생각은 단순하다. 둘째는',
        runs: runsOf('첫 생각은 단순하다. ', '둘째는'),
        savedAt: 1,
        ...(withEnds ? { sourceSentenceEnds: [25, 44], sentenceEnds: [11, 15] } : {}),
      },
    ]
    return {
      lang: 'ko',
      provider: 'claude-code',
      model: 'opus',
      blocks: new Map(entries.map((e) => [blockKeyString(e.key), e])),
    }
  }

  it('the translated and bilingual trees, Markdown and EPUB are the same with or without the ends', async () => {
    const source = tree()
    const a = stored(true)
    const b = stored(false)
    const translatedA = buildTranslatedTree(source, 'ko', a)
    const translatedB = buildTranslatedTree(source, 'ko', b)
    expect(translatedA).toEqual(translatedB)
    const bilingualA = buildBilingualTree(source, 'ko', a)
    const bilingualB = buildBilingualTree(source, 'ko', b)
    expect(bilingualA).toEqual(bilingualB)

    for (const [x, y] of [
      [translatedA, translatedB],
      [bilingualA, bilingualB],
    ] as const) {
      expect(treeToMarkdown(x).markdown).toBe(treeToMarkdown(y).markdown)
      const opts = {
        title: 'Book',
        author: 'A',
        uiLanguage: 'en',
        cover: false,
        modified: new Date('2026-01-02T03:04:05.678Z'),
      }
      expect(
        Buffer.from(await writeEpub(x, opts)).equals(Buffer.from(await writeEpub(y, opts))),
      ).toBe(true)
    }
    expect(treeToMarkdown(translatedA).markdown).toContain('안녕 **세계**. 잘 가.')
  })
})
