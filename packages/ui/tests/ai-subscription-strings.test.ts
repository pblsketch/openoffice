import { describe, expect, it } from 'vitest'
import { LANGS, type Lang } from '@genoffice/i18n'
import {
  AI_SUBSCRIPTION_STRINGS,
  aiSubscriptionText,
  type AiSubscriptionStringKey,
} from '../src/strings-ai-subscription'

const KEYS = Object.keys(AI_SUBSCRIPTION_STRINGS.en) as AiSubscriptionStringKey[]

/** Languages written in another script: a value equal to the English one is an untranslated copy */
const NON_LATIN: readonly Lang[] = ['zh', 'ja', 'ko', 'th', 'ru', 'ar', 'he', 'hi', 'zh-TW']

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('AI_SUBSCRIPTION_STRINGS', () => {
  it('covers all 21 ui languages', () => {
    expect(LANGS).toHaveLength(21)
    expect(Object.keys(AI_SUBSCRIPTION_STRINGS).sort()).toEqual([...LANGS].sort())
  })

  it('has every key, non-empty, in every language', () => {
    expect(KEYS.length).toBeGreaterThan(40)
    for (const lang of LANGS) {
      const dict = AI_SUBSCRIPTION_STRINGS[lang] as Record<string, string>
      expect(Object.keys(dict).sort(), lang).toEqual([...KEYS].sort())
      for (const key of KEYS) {
        expect(dict[key]?.trim().length, `${lang}.${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('is translated, not copied from English, in every non-Latin-script language', () => {
    for (const lang of NON_LATIN) {
      for (const key of KEYS) {
        expect(AI_SUBSCRIPTION_STRINGS[lang][key], `${lang}.${key}`).not.toBe(
          AI_SUBSCRIPTION_STRINGS.en[key],
        )
      }
    }
  })

  it('carries text in the language’s own script in every non-Latin-script language', () => {
    // a sentence left in English would be all ASCII once the names and placeholders are removed
    for (const lang of NON_LATIN) {
      for (const key of KEYS) {
        const own = AI_SUBSCRIPTION_STRINGS[lang][key].replace(/\{\w+\}/g, '').replace(/[ -~]/g, '')
        expect(own.replace(/[·…]/g, '').length, `${lang}.${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('is translated in the Latin-script languages too', () => {
    for (const lang of LANGS) {
      if (lang === 'en' || NON_LATIN.includes(lang)) continue
      const same = KEYS.filter(
        (key) => AI_SUBSCRIPTION_STRINGS[lang][key] === AI_SUBSCRIPTION_STRINGS.en[key],
      )
      expect(same, lang).toEqual([])
    }
  })

  it('keeps the same placeholders as English in every language', () => {
    for (const lang of LANGS) {
      for (const key of KEYS) {
        expect(placeholders(AI_SUBSCRIPTION_STRINGS[lang][key]), `${lang}.${key}`).toEqual(
          placeholders(AI_SUBSCRIPTION_STRINGS.en[key]),
        )
      }
    }
  })

  it('names the vendors in text and never as a feature of this product', () => {
    for (const lang of LANGS) {
      for (const key of KEYS) {
        if (key === 'claudeDesktopNote') continue
        const text = AI_SUBSCRIPTION_STRINGS[lang][key]
        expect(text, `${lang}.${key}`).not.toMatch(/Claude Code|GenOffice/)
      }
      expect(AI_SUBSCRIPTION_STRINGS[lang].claudeDesktopNote, lang).toMatch(/Claude Code/)
      expect(AI_SUBSCRIPTION_STRINGS[lang].claudeDesktopNote, lang).not.toMatch(/GenOffice/)
      // the two notices keep the company names as they are written
      expect(AI_SUBSCRIPTION_STRINGS[lang].noticeSend, lang).toMatch(/Anthropic/)
      expect(AI_SUBSCRIPTION_STRINGS[lang].noticeSend, lang).toMatch(/OpenAI/)
      expect(AI_SUBSCRIPTION_STRINGS[lang].codexNotice, lang).toMatch(/Codex/)
      expect(AI_SUBSCRIPTION_STRINGS[lang].codexNotice, lang).toMatch(/OpenAI/)
      expect(AI_SUBSCRIPTION_STRINGS[lang].noticeCodexHistory, lang).toMatch(/Codex/)
    }
  })
})

describe('the AI entry label', () => {
  it('is one key every editor shares for its ribbon button, panel title and panel label', () => {
    expect(AI_SUBSCRIPTION_STRINGS.en.aiAssistant).toBe('AI Assistant')
    expect(AI_SUBSCRIPTION_STRINGS.ko.aiAssistant).toBe('AI 도우미')
    expect(aiSubscriptionText('ko', 'aiAssistant')).toBe('AI 도우미')
  })

  it('is a short label in all 21 languages: no placeholder, no sentence', () => {
    for (const lang of LANGS) {
      const label = AI_SUBSCRIPTION_STRINGS[lang].aiAssistant
      expect(label.length, lang).toBeLessThanOrEqual(24)
      expect(label, lang).not.toMatch(/[{}.。]/)
      expect(label.trim(), lang).toBe(label)
    }
  })
})

describe('the connection-check error sentences', () => {
  const ERROR_KEYS = ['cardErrNeedsUpdate', 'cardErrTimeout', 'cardErrFailed'] as const

  it('name the provider in every language', () => {
    for (const lang of LANGS) {
      for (const key of ERROR_KEYS) {
        expect(placeholders(AI_SUBSCRIPTION_STRINGS[lang][key]), `${lang}.${key}`).toEqual([
          'provider',
        ])
        expect(aiSubscriptionText(lang, key, { provider: 'Codex' }), `${lang}.${key}`).toContain(
          'Codex',
        )
      }
    }
  })

  it('are three different sentences in every language', () => {
    for (const lang of LANGS) {
      const texts = ERROR_KEYS.map((key) => AI_SUBSCRIPTION_STRINGS[lang][key])
      expect(new Set(texts).size, lang).toBe(3)
    }
  })

  it('tell the user to update the program when it is too old', () => {
    expect(AI_SUBSCRIPTION_STRINGS.en.cardErrNeedsUpdate).toMatch(/Update it/)
    expect(AI_SUBSCRIPTION_STRINGS.ko.cardErrNeedsUpdate).toMatch(/업데이트/)
  })

  it('never carry the raw kind prefix of a status text', () => {
    for (const lang of LANGS) {
      for (const key of ERROR_KEYS) {
        expect(AI_SUBSCRIPTION_STRINGS[lang][key], `${lang}.${key}`).not.toMatch(
          /needs-update|timeout:|failed:/,
        )
      }
    }
  })
})

describe('the versioned needs-update sentence', () => {
  it('names the provider, the version found, the floor and the command in every language', () => {
    for (const lang of LANGS) {
      const text = AI_SUBSCRIPTION_STRINGS[lang].cardErrNeedsUpdateVersion
      expect(placeholders(text).sort(), lang).toEqual(['command', 'minimum', 'provider', 'version'])
      const filled = aiSubscriptionText(lang, 'cardErrNeedsUpdateVersion', {
        provider: 'Claude',
        version: '2.1.237',
        minimum: '2.1.248',
        command: 'claude update',
      })
      for (const part of ['Claude', '2.1.237', '2.1.248', 'claude update']) {
        expect(filled, lang).toContain(part)
      }
    }
  })
})

describe('the lines under the program path', () => {
  it('name the provider and the command on Windows, in every language', () => {
    for (const lang of LANGS) {
      const strings = AI_SUBSCRIPTION_STRINGS[lang]
      expect(placeholders(strings.cardErrNeedsUpdatePath), lang).toEqual([])
      expect(placeholders(strings.cardErrNeedsUpdateWindows).sort(), lang).toEqual([
        'command',
        'provider',
      ])
      expect(strings.cardErrNeedsUpdateWindows, lang).toMatch(/WSL/)
      expect(strings.cardErrNeedsUpdateWindows, lang).toMatch(/PowerShell/)
    }
  })
})

describe('aiSubscriptionText', () => {
  it('fills the placeholders', () => {
    expect(aiSubscriptionText('en', 'continueWith', { provider: 'Codex' })).toBe(
      'Continue with Codex',
    )
    expect(aiSubscriptionText('ko', 'continueWith', { provider: 'Codex' })).toBe('Codex로 계속')
    expect(aiSubscriptionText('en', 'installNote', { vendor: 'OpenAI' })).toBe(
      "OpenAI's official install command runs in a new terminal window.",
    )
  })
})
