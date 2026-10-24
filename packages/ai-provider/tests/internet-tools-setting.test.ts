import { describe, expect, it } from 'vitest'
import { sanitizeAiSettings } from '../src/ai-settings-guard'
import { normalizeAiSettings } from '../src/legacy-settings'

/** Decision 0062: "Let AI use internet tools" is on unless the file says false. */
describe('internetTools setting', () => {
  const base = { provider: 'auto', providers: {} }

  it('is absent (on) by default and through a round trip', () => {
    expect(normalizeAiSettings(base).internetTools).toBeUndefined()
    expect(sanitizeAiSettings({ ...base, internetTools: true })?.internetTools).toBeUndefined()
  })

  it('keeps an explicit false through reading and saving', () => {
    expect(normalizeAiSettings({ ...base, internetTools: false }).internetTools).toBe(false)
    expect(sanitizeAiSettings({ ...base, internetTools: false })?.internetTools).toBe(false)
  })

  it('reads anything but false as on', () => {
    for (const v of ['false', 0, null, 'off']) {
      expect(normalizeAiSettings({ ...base, internetTools: v }).internetTools).toBeUndefined()
      expect(sanitizeAiSettings({ ...base, internetTools: v })?.internetTools).toBeUndefined()
    }
  })
})
