// @vitest-environment node
/**
 * Result books never go over the book itself or a file a tab has open.
 */
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { checkResultPath } from '../src/main/result-paths'
import { defaultResultName } from '../src/shared/asset-url'

const dir = join(tmpdir(), 'epub-results')
const source = join(dir, 'Book.epub')

describe('checkResultPath', () => {
  const context = { sourcePath: source, isOpenInTab: (p: string) => p.endsWith('open.epub') }

  it('accepts another .epub path', () => {
    expect(checkResultPath(join(dir, 'Book.ko.epub'), context)).toEqual({ ok: true })
  })

  it('refuses the book itself, also spelled differently', () => {
    expect(checkResultPath(source, context)).toEqual({ ok: false, reason: 'source' })
    expect(checkResultPath(join(dir, 'sub', '..', 'Book.epub'), context)).toEqual({
      ok: false,
      reason: 'source',
    })
    expect(checkResultPath(join(dir, 'BOOK.EPUB'), { ...context, caseInsensitive: true })).toEqual({
      ok: false,
      reason: 'source',
    })
  })

  it('refuses a file open in a tab', () => {
    expect(checkResultPath(join(dir, 'open.epub'), context)).toEqual({
      ok: false,
      reason: 'open-in-tab',
    })
  })

  it('refuses other extensions and paths that are not absolute', () => {
    expect(checkResultPath(join(dir, 'Book.ko.txt'), context)).toEqual({
      ok: false,
      reason: 'not-epub',
    })
    expect(checkResultPath('Book.ko.epub', context)).toEqual({ ok: false, reason: 'invalid' })
    expect(checkResultPath(42, context)).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('defaultResultName', () => {
  it('names the translated and the bilingual book after the original', () => {
    expect(defaultResultName(source, 'ko', 'translated')).toBe('Book.ko.epub')
    expect(defaultResultName(source, 'zh-TW', 'bilingual')).toBe('Book.zh-TW.bilingual.epub')
    expect(defaultResultName('C:\\books\\My Book.EPUB', 'en', 'translated')).toBe('My Book.en.epub')
  })
})
