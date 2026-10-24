import { describe, expect, it } from 'vitest'
import { openChapter, remapChapter, type OpenChapter } from '../src/blocks'
import { applyBlockEdit } from '../src/edits'
import {
  applyReplacements,
  composeReplacements,
  mapOffset,
  validateReplacements,
  type RangeReplacement,
} from '../src/ranges'
import { chapter } from './chapter-helpers'

describe('applyReplacements', () => {
  it('applies replacements in any order and keeps insertions at one offset in order', () => {
    const reps: RangeReplacement[] = [
      { start: 6, end: 11, text: 'there' },
      { start: 0, end: 0, text: '[' },
      { start: 0, end: 0, text: '(' },
      { start: 11, end: 11, text: '!' },
    ]
    expect(applyReplacements('hello world', reps)).toBe('[(hello there!')
  })

  it('rejects overlapping and out-of-bounds ranges', () => {
    expect(
      validateReplacements(
        [
          { start: 0, end: 3, text: '' },
          { start: 2, end: 4, text: '' },
        ],
        10,
      ),
    ).toMatch(/overlaps/)
    expect(validateReplacements([{ start: 5, end: 11, text: '' }], 10)).toMatch(/out of bounds/)
    expect(() => applyReplacements('abc', [{ start: 2, end: 1, text: '' }])).toThrow(RangeError)
  })
})

describe('mapOffset', () => {
  it('shifts offsets after edits, drops covered ones, pushes on insertions at the offset', () => {
    const reps = [
      { start: 2, end: 4, text: 'xyz' },
      { start: 8, end: 8, text: '++' },
    ]
    expect(mapOffset(1, reps)).toBe(1)
    expect(mapOffset(2, reps)).toBeNull()
    expect(mapOffset(4, reps)).toBe(5)
    expect(mapOffset(8, reps)).toBe(11)
  })
})

describe('composeReplacements', () => {
  it('gives one list against the original that yields the same text, trimmed to real changes', () => {
    const base = 'The quick brown fox jumps'
    const first = [{ start: 4, end: 9, text: 'slow' }]
    const mid = applyReplacements(base, first)
    const second = [
      { start: 0, end: 3, text: 'A' },
      { start: 15, end: 18, text: 'cat' },
    ]
    const end = applyReplacements(mid, second)
    const composed = composeReplacements(base, first, second)
    expect(applyReplacements(base, composed)).toBe(end)
    expect(composed).toEqual([
      { start: 0, end: 3, text: 'A' },
      { start: 4, end: 9, text: 'slow' },
      { start: 16, end: 19, text: 'cat' },
    ])
  })

  it('drops an edit that was undone by the next one', () => {
    const base = '<p>Hello</p>'
    const first = [{ start: 3, end: 8, text: '<b>Hello</b>' }]
    const second = [{ start: 3, end: 15, text: 'Hello' }]
    expect(composeReplacements(base, first, second)).toEqual([])
  })
})

describe('block ids', () => {
  function open(source: string): OpenChapter {
    const map = openChapter(source)
    if (map.broken) throw new Error(map.error)
    return map
  }

  it('never reuses the id of a deleted block', () => {
    const map = open(chapter('<p>a</p><p>b</p><p>c</p>'))
    const deleted = applyBlockEdit(map, { op: 'delete', blockId: 'b3' })
    if (!deleted.ok) throw new Error(deleted.refusal.message)
    const inserted = applyBlockEdit(deleted.map, { op: 'insert_after', blockId: 'b2', text: 'd' })
    if (!inserted.ok) throw new Error(inserted.refusal.message)
    expect(inserted.map.blocks.map((b) => b.id)).toEqual(['b1', 'b2', 'b4'])
  })

  it('carries ids through an arbitrary replacement outside the blocks', () => {
    const map = open(chapter('<p>a</p><hr/><p>b</p>'))
    const at = map.source.indexOf('<hr/>')
    const reps = [{ start: at, end: at + 5, text: '<p>new</p><hr/>' }]
    const next = remapChapter(map, applyReplacements(map.source, reps), reps)
    if (next.broken) throw new Error(next.error)
    expect(next.blocks.map((b) => b.id)).toEqual(['b1', 'b3', 'b2'])
  })
})
