import { describe, expect, it } from 'vitest'
import { isSourceViewKey, type SourceViewKeyInput } from '../src/renderer/source-view-key'

function key(over: Partial<SourceViewKeyInput> = {}): SourceViewKeyInput {
  return {
    key: 'e',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...over,
  }
}

describe('source view shortcut', () => {
  it('accepts Ctrl+E and Cmd+E', () => {
    expect(isSourceViewKey(key())).toBe(true)
    expect(isSourceViewKey(key({ ctrlKey: false, metaKey: true }))).toBe(true)
    expect(isSourceViewKey(key({ key: 'E' }))).toBe(true)
  })

  it('leaves Shift, Alt and paste-style chords alone', () => {
    expect(isSourceViewKey(key({ shiftKey: true }))).toBe(false)
    expect(isSourceViewKey(key({ altKey: true }))).toBe(false)
    expect(isSourceViewKey(key({ repeat: true }))).toBe(false)
    expect(isSourceViewKey(key({ ctrlKey: false }))).toBe(false)
    expect(isSourceViewKey(key({ key: 'v' }))).toBe(false)
  })
})
