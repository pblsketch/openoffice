/**
 * The plain parts of the book translation screen: the chapter list and the
 * units a choice sends, the chapters named in a request, the remembered
 * choice of a job, the resume offer's pick, and the report lines.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { epubTranslationUnits, openEpub, type EpubTranslationReport } from '@genoffice/epub-engine'
import { bookSummary } from '../src/main/book-session'
import {
  chapterRows,
  chosenChapters,
  initialChapters,
  jobPercent,
  originalChapterLines,
  recallChapters,
  rememberChapters,
  resumableTranslation,
  sameLanguage,
  unitsForChapters,
  untranslatedLines,
} from '../src/renderer/translate/translate-model'
import { strings } from '../src/renderer/i18n/strings'
import { buildTranslateBook } from './helpers/translate-backend'

const t = (key: keyof typeof strings.en, params?: Record<string, string | number>) =>
  Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    strings.en[key] as string,
  )

afterEach(() => window.localStorage.clear())

async function rows() {
  const bytes = await buildTranslateBook([
    { title: 'Opening', body: '<h1>Opening</h1><p>One.</p>' },
    { title: 'Broken', body: '', broken: true },
    { title: 'Closing', body: '<p>Two.</p><p>Three.</p>' },
  ])
  const opened = await openEpub(bytes)
  if (!opened.ok) throw new Error('not opened')
  const { units, skipped } = await epubTranslationUnits(opened.book)
  return { units, rows: chapterRows(bookSummary(opened.book), units, skipped, t) }
}

describe('the chapter list', () => {
  it('lists the spine with contents titles, block counts and the damaged chapter blocked', async () => {
    const { rows: list } = await rows()
    expect(list.map((r) => [r.index, r.title, r.units, r.blocked])).toEqual([
      [0, 'Opening', 2, null],
      [1, 'Broken', 0, 'broken'],
      [2, 'Closing', 2, null],
    ])
  })

  it('chooses every open chapter by default, or the ones asked for', async () => {
    const { rows: list } = await rows()
    expect([...initialChapters(list, null)]).toEqual([0, 2])
    expect([...initialChapters(list, [2])]).toEqual([2])
    // a damaged chapter asked for is not chosen; nothing left means every open one
    expect([...initialChapters(list, [1])]).toEqual([0, 2])
  })

  it('sends the title and contents with the chosen chapters only', async () => {
    const { units, rows: list } = await rows()
    const some = unitsForChapters(units, new Set([2]))
    expect(some.every((u) => u.page === -1 || u.page === 2)).toBe(true)
    expect(some.some((u) => u.page === -1)).toBe(true)
    expect(some.filter((u) => u.page === 2)).toHaveLength(2)
    // every open chapter chosen: the request names none
    expect(chosenChapters(list, new Set([0, 2]))).toBeUndefined()
    expect(chosenChapters(list, new Set([2]))).toEqual([2])
  })
})

describe('the resume offer', () => {
  it('offers a stopped translation with its language, never a running one', () => {
    expect(
      resumableTranslation([
        { kind: 'translate', lang: 'ja', state: 'running', outputs: [] },
        { kind: 'translate', lang: 'ko', state: 'stopped', outputs: [] },
      ]),
    ).toMatchObject({ lang: 'ko' })
    expect(resumableTranslation([{ kind: 'translate', state: 'stopped', outputs: [] }])).toBeNull()
    expect(jobPercent({ done: 1, total: 3 })).toBe(33)
    expect(jobPercent(undefined)).toBe(0)
  })

  it('remembers the chapters a translation started with', () => {
    rememberChapters('h', 'ko', [2, 4])
    expect(recallChapters('h', 'ko')).toEqual([2, 4])
    rememberChapters('h', 'ko', undefined)
    expect(recallChapters('h', 'ko')).toBeNull()
  })
})

describe('the report and the language check', () => {
  it('groups untranslated blocks by chapter and reason, and names kept chapters', () => {
    const report: EpubTranslationReport = {
      translatedBlocks: 5,
      untranslatedBlocks: [
        { chapter: 2, path: 'c', blockId: 'b1', reason: 'placeholder-mismatch' },
        { chapter: 0, path: 'a', blockId: 'b2', reason: 'not-translated' },
        { chapter: 2, path: 'c', blockId: 'b3', reason: 'placeholder-mismatch' },
      ],
      originalChapters: [{ chapter: 1, path: 'b', reason: 'broken' }],
    }
    const name = (i: number) => `Ch${i}`
    expect(untranslatedLines(report, name, t)).toEqual([
      'Ch0: 1 blocks (not translated yet)',
      'Ch2: 2 blocks (the formatting marks did not come back intact)',
    ])
    expect(originalChapterLines(report, name, t)).toEqual(['Ch1: damaged chapter'])
  })

  it('compares languages by their primary subtag', () => {
    expect(sameLanguage('en-US', 'en')).toBe(true)
    expect(sameLanguage('zh-Hant', 'zh-TW')).toBe(true)
    expect(sameLanguage('ko', 'en')).toBe(false)
    expect(sameLanguage(undefined, 'en')).toBe(false)
  })
})
