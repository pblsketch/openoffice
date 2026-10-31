import { afterEach, describe, expect, it } from 'vitest'
import { aiRunRefusal, setAiRunGuard } from '../src/ai-run-guard'

afterEach(() => setAiRunGuard(null))

describe('aiRunRefusal', () => {
  it('lets every run go while no check is set', () => {
    expect(aiRunRefusal({ senderId: 1, provider: 'gemini', model: '' })).toBeNull()
  })

  it('answers with the check the shell set', () => {
    setAiRunGuard(({ senderId, provider }) =>
      senderId === 7 && provider === 'gemini' ? 'no' : null,
    )
    expect(aiRunRefusal({ senderId: 7, provider: 'gemini', model: '' })).toBe('no')
    expect(aiRunRefusal({ senderId: 8, provider: 'gemini', model: '' })).toBeNull()
  })
})
