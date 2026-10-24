import { describe, expect, it } from 'vitest'
import { LANGS, productName } from '@genoffice/i18n'
import { aiSubscriptionLoginWindowText } from '../src/ai-subscription-login-window'
import { aiSubscriptionText } from '../src/strings-ai-subscription'

describe('aiSubscriptionLoginWindowText', () => {
  it("names the window after the company's program, never as part of this product", () => {
    for (const lang of LANGS) {
      const text = aiSubscriptionLoginWindowText(lang, 'claude-code')
      expect(text.title, lang).toContain('Claude')
      for (const value of Object.values(text)) {
        expect(value, lang).not.toContain(productName(lang))
        expect(value, lang).not.toContain('GenOffice')
      }
    }
  })

  it("lists Claude's four steps, numbered, under the opening line", () => {
    const lines = aiSubscriptionLoginWindowText('en', 'claude-code').guide.split('\n')
    expect(lines[0]).toBe(
      aiSubscriptionText('en', 'loginWindowIntro', { provider: 'Claude', vendor: 'Anthropic' }),
    )
    expect(lines[1]).toBe('')
    expect(lines.slice(2).map((line) => line.slice(0, 3))).toEqual(['1. ', '2. ', '3. ', '4. '])
    expect(lines[4]).toContain(aiSubscriptionText('en', 'loginWindowStepCode'))
    expect(lines[5]).toContain('"Invalid code"')
  })

  it('gives Codex no code steps: its sign-in comes back from the browser by itself', () => {
    const guide = aiSubscriptionLoginWindowText('en', 'codex').guide
    expect(guide.split('\n').filter((line) => /^\d\. /.test(line))).toHaveLength(2)
    expect(guide).not.toContain('Invalid code')
    expect(guide).toContain('OpenAI')
  })

  it('fills every placeholder in every language', () => {
    for (const lang of LANGS) {
      for (const provider of ['claude-code', 'codex'] as const) {
        const text = aiSubscriptionLoginWindowText(lang, provider)
        for (const value of Object.values(text)) {
          expect(value, `${lang} ${provider}`).not.toMatch(/\{\w+\}/)
          expect(value.trim().length, `${lang} ${provider}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('uses English where a console cannot draw the script, and the language elsewhere', () => {
    const english = aiSubscriptionLoginWindowText('en', 'claude-code')
    for (const lang of ['ar', 'he', 'hi', 'th'] as const) {
      expect(aiSubscriptionLoginWindowText(lang, 'claude-code'), lang).toEqual(english)
    }
    for (const lang of ['ko', 'ja', 'zh', 'ru', 'vi'] as const) {
      expect(aiSubscriptionLoginWindowText(lang, 'claude-code').guide, lang).not.toBe(english.guide)
    }
  })
})
