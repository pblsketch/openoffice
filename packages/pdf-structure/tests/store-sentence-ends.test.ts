/**
 * Sentence boundaries beside translated blocks (spec 6.1, 11.1): the two
 * optional fields round-trip, invalid values are dropped while the entry
 * stays, edited and failed blocks never carry them, an edit removes them,
 * migration and "keep the edited blocks" keep the rules, and an entry with
 * the fields still reads under the reading rule that does not know them.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ResultStore,
  blockKeyString,
  sentenceEndsPair,
  translationBlockKeys,
  validSentenceEnds,
  type TranslationBlockKey,
} from '../src/store'
import { runsText, sha256Hex } from '../src/tree'
import type { InlineRun, TextUnit } from '../src/tree'

const t = (text: string): InlineRun[] => [{ kind: 'text', text }]
const fp = (n: number) => sha256Hex(`page-${n}`)
const DOC_A = sha256Hex('doc-a')
const DOC_B = sha256Hex('doc-b')

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pdf-store-sentences-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function unit(key: string, pageFp: string, text: string): TextUnit {
  return { key, runs: t(text), blockId: key, page: 1, pageFingerprint: pageFp }
}

const keyOn = (pageN: number, text: string): TranslationBlockKey =>
  translationBlockKeys([unit('a', fp(pageN), text)])[0]!

// source "One two. Three four." (20), translation "하나 둘. 셋 넷." (10)
const SOURCE = 'One two. Three four.'
const TRANSLATED_RUNS: InlineRun[] = [
  { kind: 'text', text: '하나 ' },
  { kind: 'text', text: '둘.', bold: true },
  { kind: 'footnoteRef', id: 'fn1', marker: '1' },
  { kind: 'text', text: ' 셋 넷.' },
]
const TRANSLATED = runsText(TRANSLATED_RUNS)
const SOURCE_ENDS = [8, SOURCE.length]
const ENDS = [4, TRANSLATED.length]

const readRaw = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>

function writeRaw(path: string, entry: Record<string, unknown>) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(entry))
}

const rawBlock = (key: TranslationBlockKey, extra: Record<string, unknown>) => ({
  format: 1,
  key: { pageFingerprint: key.pageFingerprint, textHash: key.textHash, occurrence: key.occurrence },
  savedAt: 5,
  ...extra,
})

/**
 * The block reading rule of the store before the sentence fields: a copy of
 * `asBlock` as it was, standing for an earlier version of the program.
 */
function oldAsBlock(raw: unknown, expect: TranslationBlockKey): Record<string, unknown> | null {
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const isStr = (v: unknown): v is string => typeof v === 'string'
  const optStr = (v: unknown) => v === undefined || isStr(v)
  if (!isRecord(raw) || raw.format !== 1 || !isRecord(raw.key) || !isNum(raw.savedAt)) {
    return null
  }
  const k = raw.key
  if (
    k.pageFingerprint !== expect.pageFingerprint ||
    k.textHash !== expect.textHash ||
    k.occurrence !== expect.occurrence
  ) {
    return null
  }
  if (raw.status !== 'translated' && raw.status !== 'failed') return null
  if (raw.status === 'translated' && !isStr(raw.text)) return null
  if (!optStr(raw.text) || !optStr(raw.reason)) return null
  if (raw.runs !== undefined && !Array.isArray(raw.runs)) return null
  const entry: Record<string, unknown> = {
    key: { ...expect },
    status: raw.status,
    savedAt: raw.savedAt,
  }
  const edited = raw.edited === true && raw.status === 'translated'
  if (isStr(raw.text)) entry.text = raw.text
  if (Array.isArray(raw.runs) && !edited) entry.runs = raw.runs as InlineRun[]
  if (isStr(raw.reason)) entry.reason = raw.reason
  if (edited) entry.edited = true
  return entry
}

describe('sentence-end checks', () => {
  it('accept two or more increasing positive integers, ending at the length when given', () => {
    expect(validSentenceEnds([3, 7])).toBe(true)
    expect(validSentenceEnds([3, 7], 7)).toBe(true)
    expect(validSentenceEnds([1, 2, 3, 10], 10)).toBe(true)
    expect(validSentenceEnds([3, 7], 8)).toBe(false)
    expect(validSentenceEnds([7])).toBe(false)
    expect(validSentenceEnds([])).toBe(false)
    expect(validSentenceEnds([0, 7])).toBe(false)
    expect(validSentenceEnds([-1, 7])).toBe(false)
    expect(validSentenceEnds([3, 3])).toBe(false)
    expect(validSentenceEnds([5, 3])).toBe(false)
    expect(validSentenceEnds([2.5, 7])).toBe(false)
    expect(validSentenceEnds([3, Number.NaN])).toBe(false)
    expect(validSentenceEnds([3, Infinity])).toBe(false)
    expect(validSentenceEnds(['3', '7'])).toBe(false)
    expect(validSentenceEnds({ 0: 3, 1: 7, length: 2 })).toBe(false)
    expect(validSentenceEnds(null)).toBe(false)
  })

  it('pair two lists of the same length whose translated side ends at its text', () => {
    expect(sentenceEndsPair([4, 9], [3, 7], 7)).toEqual({
      sourceSentenceEnds: [4, 9],
      sentenceEnds: [3, 7],
    })
    expect(sentenceEndsPair([4, 9, 12], [3, 7], 7)).toBeNull()
    expect(sentenceEndsPair([4, 9], [3, 6], 7)).toBeNull()
    expect(sentenceEndsPair(undefined, [3, 7], 7)).toBeNull()
    expect(sentenceEndsPair([4, 9], undefined, 7)).toBeNull()
    expect(sentenceEndsPair([9, 4], [3, 7], 7)).toBeNull()
  })
})

describe('sentence ends in the store', () => {
  it('round-trip on a translated block, with and without runs', async () => {
    const store = new ResultStore(root)
    const k1 = keyOn(1, SOURCE)
    const k2 = keyOn(2, SOURCE)
    await store.writeTranslationBlocks(DOC_A, 'ko', [
      {
        key: k1,
        status: 'translated',
        text: TRANSLATED,
        runs: TRANSLATED_RUNS,
        sourceSentenceEnds: SOURCE_ENDS,
        sentenceEnds: ENDS,
      },
      {
        key: k2,
        status: 'translated',
        text: TRANSLATED,
        sourceSentenceEnds: SOURCE_ENDS,
        sentenceEnds: ENDS,
      },
    ])
    const ko = await store.readTranslation(DOC_A, 'ko')
    for (const k of [k1, k2]) {
      expect(ko?.blocks.get(blockKeyString(k))).toMatchObject({
        status: 'translated',
        text: TRANSLATED,
        sourceSentenceEnds: SOURCE_ENDS,
        sentenceEnds: ENDS,
      })
    }
    expect(ko?.blocks.get(blockKeyString(k1))?.runs).toEqual(TRANSLATED_RUNS)
    expect(readRaw(store.translationBlockPath(DOC_A, 'ko', k1))).toMatchObject({
      sourceSentenceEnds: SOURCE_ENDS,
      sentenceEnds: ENDS,
    })
  })

  it('a block without them reads as before', async () => {
    const store = new ResultStore(root)
    const k1 = keyOn(1, SOURCE)
    await store.writeTranslationBlock(DOC_A, 'ko', { key: k1, status: 'translated', text: 'x' })
    const entry = (await store.readTranslation(DOC_A, 'ko'))?.blocks.get(blockKeyString(k1))
    expect(entry).toBeDefined()
    expect(entry).not.toHaveProperty('sourceSentenceEnds')
    expect(entry).not.toHaveProperty('sentenceEnds')
  })

  const INVALID: [string, Record<string, unknown>][] = [
    ['only the source list', { sourceSentenceEnds: SOURCE_ENDS }],
    ['only the translated list', { sentenceEnds: ENDS }],
    ['lists of different lengths', { sourceSentenceEnds: [3, 8, 20], sentenceEnds: ENDS }],
    ['one sentence', { sourceSentenceEnds: [20], sentenceEnds: [TRANSLATED.length] }],
    ['a zero offset', { sourceSentenceEnds: [0, 20], sentenceEnds: ENDS }],
    ['offsets out of order', { sourceSentenceEnds: [8, 8], sentenceEnds: ENDS }],
    ['a fractional offset', { sourceSentenceEnds: SOURCE_ENDS, sentenceEnds: [4.5, 10] }],
    ['a translated end past the text', { sourceSentenceEnds: SOURCE_ENDS, sentenceEnds: [4, 11] }],
    [
      'a translated end short of the text',
      { sourceSentenceEnds: SOURCE_ENDS, sentenceEnds: [4, 9] },
    ],
    ['strings', { sourceSentenceEnds: ['8', '20'], sentenceEnds: ['4', '10'] }],
    ['objects', { sourceSentenceEnds: { a: 1 }, sentenceEnds: 'x' }],
  ]

  it.each(INVALID)('written with %s: the entry stays, the fields are dropped', async (_, bad) => {
    const store = new ResultStore(root)
    const k1 = keyOn(1, SOURCE)
    await store.writeTranslationBlock(DOC_A, 'ko', {
      key: k1,
      status: 'translated',
      text: TRANSLATED,
      ...bad,
    })
    const raw = readRaw(store.translationBlockPath(DOC_A, 'ko', k1))
    expect(raw).not.toHaveProperty('sourceSentenceEnds')
    expect(raw).not.toHaveProperty('sentenceEnds')
    const entry = (await store.readTranslation(DOC_A, 'ko'))?.blocks.get(blockKeyString(k1))
    expect(entry).toMatchObject({ status: 'translated', text: TRANSLATED })
    expect(entry).not.toHaveProperty('sourceSentenceEnds')
    expect(entry).not.toHaveProperty('sentenceEnds')
  })

  it.each(INVALID)('stored with %s: reads without the fields, entry kept', async (_, bad) => {
    const store = new ResultStore(root)
    const k1 = keyOn(1, SOURCE)
    writeRaw(
      store.translationBlockPath(DOC_A, 'ko', k1),
      rawBlock(k1, { status: 'translated', text: TRANSLATED, ...bad }),
    )
    const entry = (await store.readTranslation(DOC_A, 'ko'))?.blocks.get(blockKeyString(k1))
    expect(entry).toMatchObject({ status: 'translated', text: TRANSLATED, savedAt: 5 })
    expect(entry).not.toHaveProperty('sourceSentenceEnds')
    expect(entry).not.toHaveProperty('sentenceEnds')
  })

  it('failed and edited blocks never carry them, written or stored', async () => {
    const store = new ResultStore(root)
    const kFailed = keyOn(1, SOURCE)
    const kEdited = keyOn(2, SOURCE)
    const both = { sourceSentenceEnds: SOURCE_ENDS, sentenceEnds: ENDS }
    await store.writeTranslationBlock(DOC_A, 'ko', {
      key: kFailed,
      status: 'failed',
      reason: 'x',
      ...both,
    })
    await store.writeTranslationBlock(DOC_A, 'ko', {
      key: kEdited,
      status: 'translated',
      text: TRANSLATED,
      edited: true,
      ...both,
    })
    for (const k of [kFailed, kEdited]) {
      const raw = readRaw(store.translationBlockPath(DOC_A, 'ko', k))
      expect(raw).not.toHaveProperty('sourceSentenceEnds')
      expect(raw).not.toHaveProperty('sentenceEnds')
    }

    // entries written by hand (or by another program) with the fields
    writeRaw(
      store.translationBlockPath(DOC_A, 'ko', kFailed),
      rawBlock(kFailed, { status: 'failed', reason: 'x', text: TRANSLATED, ...both }),
    )
    writeRaw(
      store.translationBlockPath(DOC_A, 'ko', kEdited),
      rawBlock(kEdited, { status: 'translated', text: TRANSLATED, edited: true, ...both }),
    )
    const ko = await store.readTranslation(DOC_A, 'ko')
    expect(ko?.blocks.get(blockKeyString(kFailed))).toMatchObject({ status: 'failed' })
    expect(ko?.blocks.get(blockKeyString(kEdited))).toMatchObject({ edited: true })
    for (const k of [kFailed, kEdited]) {
      const entry = ko?.blocks.get(blockKeyString(k))
      expect(entry).not.toHaveProperty('sourceSentenceEnds')
      expect(entry).not.toHaveProperty('sentenceEnds')
    }
  })

  it('a person editing the block removes them', async () => {
    const store = new ResultStore(root)
    const k1 = keyOn(1, SOURCE)
    await store.writeTranslationBlock(DOC_A, 'ko', {
      key: k1,
      status: 'translated',
      text: TRANSLATED,
      runs: TRANSLATED_RUNS,
      sourceSentenceEnds: SOURCE_ENDS,
      sentenceEnds: ENDS,
    })
    // the editor's save (the shell's 'editedTranslationBlock' write) ends here
    await store.writeEditedTranslationBlock(DOC_A, 'ko', k1, '사람이 고친 글. 두 문장.')
    const raw = readRaw(store.translationBlockPath(DOC_A, 'ko', k1))
    expect(raw).not.toHaveProperty('sourceSentenceEnds')
    expect(raw).not.toHaveProperty('sentenceEnds')
    const entry = (await store.readTranslation(DOC_A, 'ko'))?.blocks.get(blockKeyString(k1))
    expect(entry).toMatchObject({ text: '사람이 고친 글. 두 문장.', edited: true })
    expect(entry).not.toHaveProperty('sourceSentenceEnds')
    expect(entry).not.toHaveProperty('sentenceEnds')
  })

  it('move with migrateDocument, with and without keepBlockKeys', async () => {
    let clock = 1
    const store = new ResultStore(root, { now: () => clock })
    const k1 = keyOn(1, SOURCE)
    const k2 = keyOn(2, SOURCE)
    const both = { sourceSentenceEnds: SOURCE_ENDS, sentenceEnds: ENDS }
    await store.writeTranslationMeta(DOC_A, 'ko', { provider: 'codex', model: '' })
    await store.writeTranslationBlocks(DOC_A, 'ko', [
      { key: k1, status: 'translated', text: TRANSLATED, runs: TRANSLATED_RUNS, ...both },
      { key: k2, status: 'translated', text: TRANSLATED, ...both },
    ])
    clock = 2
    const all = await store.migrateDocument({
      oldDocHash: DOC_A,
      newDocHash: DOC_B,
      pageFingerprints: [fp(1), fp(2)],
    })
    expect(all.translationBlocks).toBe(2)
    const moved = await store.readTranslation(DOC_B, 'ko')
    for (const k of [k1, k2]) expect(moved?.blocks.get(blockKeyString(k))).toMatchObject(both)

    const DOC_C = sha256Hex('doc-c')
    const some = await store.migrateDocument({
      oldDocHash: DOC_A,
      newDocHash: DOC_C,
      pageFingerprints: [fp(1), fp(2)],
      keepBlockKeys: [k2],
    })
    expect(some.translationBlocks).toBe(1)
    const kept = await store.readTranslation(DOC_C, 'ko')
    expect([...kept!.blocks.keys()]).toEqual([blockKeyString(k2)])
    expect(kept?.blocks.get(blockKeyString(k2))).toMatchObject(both)
  })

  it('migration does not carry invalid stored fields over', async () => {
    let clock = 1
    const store = new ResultStore(root, { now: () => clock })
    const k1 = keyOn(1, SOURCE)
    writeRaw(
      store.translationBlockPath(DOC_A, 'ko', k1),
      rawBlock(k1, {
        status: 'translated',
        text: TRANSLATED,
        sourceSentenceEnds: SOURCE_ENDS,
        sentenceEnds: [4, 99],
      }),
    )
    clock = 10
    await store.migrateDocument({ oldDocHash: DOC_A, newDocHash: DOC_B, pageFingerprints: [fp(1)] })
    const raw = readRaw(store.translationBlockPath(DOC_B, 'ko', k1))
    expect(raw).toMatchObject({ status: 'translated', text: TRANSLATED })
    expect(raw).not.toHaveProperty('sourceSentenceEnds')
    expect(raw).not.toHaveProperty('sentenceEnds')
  })

  it('"keep the edited blocks" keeps the edits (without the fields) and drops the rest', async () => {
    const store = new ResultStore(root)
    const kEdited = keyOn(1, SOURCE)
    const kMachine = keyOn(2, SOURCE)
    const both = { sourceSentenceEnds: SOURCE_ENDS, sentenceEnds: ENDS }
    await store.writeTranslationMeta(DOC_A, 'ko', { provider: 'codex', model: '' })
    await store.writeTranslationBlocks(DOC_A, 'ko', [
      { key: kEdited, status: 'translated', text: TRANSLATED, ...both },
      { key: kMachine, status: 'translated', text: TRANSLATED, ...both },
    ])
    await store.writeEditedTranslationBlock(DOC_A, 'ko', kEdited, 'by hand')
    expect(await store.deleteTranslationExceptEdited(DOC_A, 'ko')).toBe(1)
    const ko = await store.readTranslation(DOC_A, 'ko')
    expect([...ko!.blocks.keys()]).toEqual([blockKeyString(kEdited)])
    const entry = ko?.blocks.get(blockKeyString(kEdited))
    expect(entry).toMatchObject({ text: 'by hand', edited: true })
    expect(entry).not.toHaveProperty('sourceSentenceEnds')
    expect(entry).not.toHaveProperty('sentenceEnds')
  })
})

describe('compatibility with earlier versions', () => {
  it('an entry with the fields keeps the format number, key shape and place', async () => {
    const store = new ResultStore(root)
    const k1 = keyOn(1, SOURCE)
    await store.writeTranslationBlock(DOC_A, 'ko', {
      key: k1,
      status: 'translated',
      text: TRANSLATED,
      runs: TRANSLATED_RUNS,
      sourceSentenceEnds: SOURCE_ENDS,
      sentenceEnds: ENDS,
    })
    const path = store.translationBlockPath(DOC_A, 'ko', k1)
    expect(path).toBe(
      join(
        store.documentDir(DOC_A),
        'translations',
        'ko',
        'blocks',
        k1.pageFingerprint,
        `${k1.textHash}.${k1.occurrence}.json`,
      ),
    )
    const raw = readRaw(path)
    expect(raw.format).toBe(1)
    expect(raw.key).toEqual({
      pageFingerprint: k1.pageFingerprint,
      textHash: k1.textHash,
      occurrence: k1.occurrence,
    })
  })

  it('an entry with the fields reads under the earlier reading rule', async () => {
    const store = new ResultStore(root)
    const k1 = keyOn(1, SOURCE)
    await store.writeTranslationBlock(DOC_A, 'ko', {
      key: k1,
      status: 'translated',
      text: TRANSLATED,
      runs: TRANSLATED_RUNS,
      sourceSentenceEnds: SOURCE_ENDS,
      sentenceEnds: ENDS,
    })
    const raw = readRaw(store.translationBlockPath(DOC_A, 'ko', k1))
    expect(raw).toHaveProperty('sentenceEnds')
    const old = oldAsBlock(raw, k1)
    expect(old).toEqual({
      key: k1,
      status: 'translated',
      savedAt: raw.savedAt,
      text: TRANSLATED,
      runs: TRANSLATED_RUNS,
    })
  })
})
