import { describe, expect, it } from 'vitest'
import { LANGS, type Lang } from '@genoffice/i18n'
import { DOC_MENTION_STRINGS, type DocMentionStringKey } from '../src/strings-doc-mention'

const KEYS = Object.keys(DOC_MENTION_STRINGS.zh) as DocMentionStringKey[]
const NON_LATIN: readonly Lang[] = ['zh', 'ja', 'ko', 'th', 'ru', 'ar', 'he', 'hi', 'zh-TW']

describe('DOC_MENTION_STRINGS', () => {
  it('has the eight keys', () => {
    expect([...KEYS].sort()).toEqual(
      [
        'listLabel',
        'groupPane',
        'groupOpen',
        'groupProject',
        'groupRecent',
        'reasonModified',
        'reasonUnsaved',
        'more',
      ].sort(),
    )
  })

  it('has every key, non-empty, in all 21 languages', () => {
    expect(LANGS).toHaveLength(21)
    expect(Object.keys(DOC_MENTION_STRINGS).sort()).toEqual([...LANGS].sort())
    for (const lang of LANGS) {
      const dict = DOC_MENTION_STRINGS[lang] as Record<string, string>
      expect(Object.keys(dict).sort(), lang).toEqual([...KEYS].sort())
      for (const key of KEYS) expect(dict[key]?.trim().length, `${lang}.${key}`).toBeGreaterThan(0)
    }
  })

  it('is translated, not copied from English, in non-Latin-script languages', () => {
    for (const lang of NON_LATIN) {
      for (const key of KEYS) {
        expect(DOC_MENTION_STRINGS[lang][key], `${lang}.${key}`).not.toBe(
          DOC_MENTION_STRINGS.en[key],
        )
      }
    }
  })

  it('ends "Find more" with an ellipsis everywhere', () => {
    for (const lang of LANGS) expect(DOC_MENTION_STRINGS[lang].more, lang).toMatch(/…$/)
  })

  it('says the spec sentences in Korean', () => {
    const ko = DOC_MENTION_STRINGS.ko
    expect(ko.groupPane).toBe('옆 칸')
    expect(ko.groupOpen).toBe('열린 문서')
    expect(ko.groupProject).toBe('이 프로젝트의 파일')
    expect(ko.groupRecent).toBe('최근 문서')
    expect(ko.reasonModified).toBe('저장하면 붙일 수 있어요')
    expect(ko.reasonUnsaved).toBe('저장 안 한 새 문서')
    expect(ko.more).toBe('더 찾아보기…')
  })
})
