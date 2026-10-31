import { describe, expect, it } from 'vitest'
import { LANGS, type Lang } from '@genoffice/i18n'
import {
  PROJECT_CHAT_STRINGS,
  projectChatText,
  type ProjectChatStringKey,
} from '../src/strings-project-chat'

const KEYS = Object.keys(PROJECT_CHAT_STRINGS.zh) as ProjectChatStringKey[]
const NON_LATIN: readonly Lang[] = ['zh', 'ja', 'ko', 'th', 'ru', 'ar', 'he', 'hi', 'zh-TW']

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('PROJECT_CHAT_STRINGS', () => {
  it('has every key, non-empty, in all 21 languages', () => {
    expect(LANGS).toHaveLength(21)
    expect(Object.keys(PROJECT_CHAT_STRINGS).sort()).toEqual([...LANGS].sort())
    for (const lang of LANGS) {
      const dict = PROJECT_CHAT_STRINGS[lang] as Record<string, string>
      expect(Object.keys(dict).sort(), lang).toEqual([...KEYS].sort())
      for (const key of KEYS) expect(dict[key]?.trim().length, `${lang}.${key}`).toBeGreaterThan(0)
    }
  })

  it('keeps the same placeholders in every language', () => {
    for (const lang of LANGS) {
      for (const key of KEYS) {
        expect(placeholders(PROJECT_CHAT_STRINGS[lang][key]), `${lang}.${key}`).toEqual(
          placeholders(PROJECT_CHAT_STRINGS.zh[key]),
        )
      }
    }
  })

  it('is translated, not copied from English, in non-Latin-script languages', () => {
    for (const lang of NON_LATIN) {
      for (const key of KEYS) {
        expect(PROJECT_CHAT_STRINGS[lang][key], `${lang}.${key}`).not.toBe(
          PROJECT_CHAT_STRINGS.en[key],
        )
      }
    }
  })

  it('says the memory lines of the spec in Korean', () => {
    expect(projectChatText('ko', 'toolRemembered', { text: 'x' })).toBe('기억함: x')
    expect(projectChatText('ko', 'toolMemoryChanged', { text: 'x' })).toBe('기억 고침: x')
    expect(projectChatText('ko', 'toolMemoryRemoved', { text: 'x' })).toBe('기억 지움: x')
  })
})
