import { describe, expect, it } from 'vitest'
import { LANGS, type Lang } from '@genoffice/i18n'
import { USER_MCP_STRINGS, type UserMcpStringKey } from '../src/strings-user-mcp'

const KEYS = Object.keys(USER_MCP_STRINGS.zh) as UserMcpStringKey[]
const NON_LATIN: readonly Lang[] = ['zh', 'ja', 'ko', 'th', 'ru', 'ar', 'he', 'hi', 'zh-TW']

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('USER_MCP_STRINGS', () => {
  it('has every key, non-empty, in all 21 languages', () => {
    expect(Object.keys(USER_MCP_STRINGS).sort()).toEqual([...LANGS].sort())
    for (const lang of LANGS) {
      const dict = USER_MCP_STRINGS[lang] as Record<string, string>
      expect(Object.keys(dict).sort(), lang).toEqual([...KEYS].sort())
      for (const key of KEYS) expect(dict[key]?.trim().length, `${lang}.${key}`).toBeGreaterThan(0)
    }
  })

  it('keeps the same placeholders in every language', () => {
    for (const lang of LANGS) {
      for (const key of KEYS) {
        expect(placeholders(USER_MCP_STRINGS[lang][key]), `${lang}.${key}`).toEqual(
          placeholders(USER_MCP_STRINGS.zh[key]),
        )
      }
    }
  })

  it('is translated, not copied from English, in non-Latin-script languages', () => {
    for (const lang of NON_LATIN) {
      for (const key of KEYS) {
        expect(USER_MCP_STRINGS[lang][key], `${lang}.${key}`).not.toBe(USER_MCP_STRINGS.en[key])
      }
    }
  })

  it('uses plain words: no protocol jargon, no company names', () => {
    for (const lang of LANGS) {
      for (const key of KEYS) {
        expect(USER_MCP_STRINGS[lang][key], `${lang}.${key}`).not.toMatch(
          /oauth|stdio|json|claude|anthropic|openai|chatgpt|codex/i,
        )
      }
    }
  })

  it('says the spec words in Korean', () => {
    const ko = USER_MCP_STRINGS.ko
    expect(ko.allowOnce).toBe('이번만 허용')
    expect(ko.allowConversation).toBe('이 대화에서 항상 허용')
    expect(ko.deny).toBe('막기')
    expect(ko.more).toBe('더 보기')
    expect(ko.relogin).toBe('다시 로그인')
    expect(ko.review).toBe('확인하러 가기')
    expect(ko.retry).toBe('다시 시도')
  })
})
