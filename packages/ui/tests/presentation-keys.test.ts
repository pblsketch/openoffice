import { describe, expect, it } from 'vitest'
import { presentationKeyOf, type PresentationKeyInput } from '../src/presentation-keys'

function key(overrides: Partial<PresentationKeyInput> = {}): PresentationKeyInput {
  return {
    key: 'F5',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  }
}

describe('presentation keys', () => {
  it('F5 presents, Ctrl/Cmd+F5 or Shift+F5 presents from the current spot', () => {
    expect(presentationKeyOf(key(), false)).toBe('present')
    expect(presentationKeyOf(key({ ctrlKey: true }), false)).toBe('present-windowed')
    expect(presentationKeyOf(key({ metaKey: true }), false)).toBe('present-windowed')
    expect(presentationKeyOf(key({ shiftKey: true }), false)).toBe('present-windowed')
  })

  it('F5 or Esc ends a show, and neither does anything outside one', () => {
    expect(presentationKeyOf(key(), true)).toBe('exit')
    expect(presentationKeyOf(key({ ctrlKey: true }), true)).toBe('exit')
    expect(presentationKeyOf(key({ key: 'Escape' }), true)).toBe('exit')
    expect(presentationKeyOf(key({ key: 'Escape' }), false)).toBeNull()
  })

  it('leaves Alt and every other key alone', () => {
    expect(presentationKeyOf(key({ altKey: true }), false)).toBeNull()
    expect(presentationKeyOf(key({ key: 'F11' }), false)).toBeNull()
    expect(presentationKeyOf(key({ key: 'f5' }), false)).toBeNull()
  })

  it('ignores a held key repeating', () => {
    expect(presentationKeyOf(key({ repeat: true }), false)).toBeNull()
    expect(presentationKeyOf(key({ key: 'Escape', repeat: true }), true)).toBeNull()
  })
})
