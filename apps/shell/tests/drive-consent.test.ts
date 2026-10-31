import { describe, expect, it } from 'vitest'
import { normalizeAiSettings } from '@genoffice/ai-provider'
import { freeAiInUse, isFreeAi } from '../src/main/drive/drive-consent'

const settings = (provider: string, models: Record<string, string> = {}) =>
  normalizeAiSettings({
    provider,
    providers: Object.fromEntries(
      Object.entries(models).map(([id, model]) => [id, { apiKey: 'k', model }]),
    ),
  })

describe('freeAiInUse', () => {
  it('counts Gemini and a free OpenRouter model', () => {
    expect(freeAiInUse(settings('gemini', { gemini: 'gemini-3.5-flash-lite' }))).toBe(true)
    expect(freeAiInUse(settings('openrouter', { openrouter: 'google/gemma-4-31b-it:free' }))).toBe(
      true,
    )
  })

  it('does not count a paid OpenRouter model, a key provider, a subscription or auto', () => {
    expect(freeAiInUse(settings('openrouter', { openrouter: 'anthropic/claude-x' }))).toBe(false)
    expect(freeAiInUse(settings('anthropic', { anthropic: 'claude-x' }))).toBe(false)
    expect(freeAiInUse(settings('claude-code'))).toBe(false)
    expect(freeAiInUse(settings('auto'))).toBe(false)
  })

  it('reads a provider and model the same way', () => {
    expect(isFreeAi('gemini', '')).toBe(true)
    expect(isFreeAi('openrouter', 'x:free')).toBe(true)
    expect(isFreeAi('openrouter', 'x')).toBe(false)
    expect(isFreeAi('claude-code', '')).toBe(false)
  })
})
