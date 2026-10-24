/**
 * Moving through the book: the reading flow skips `linear="no"`, scrolling
 * past an edge turns the chapter, and the table of contents follows.
 */
import { describe, expect, it } from 'vitest'
import type { EpubTocEntry } from '@genoffice/epub-engine'
import {
  OVERSCROLL_GAP_MS,
  OVERSCROLL_IDLE,
  OVERSCROLL_TURN,
  currentTocEntry,
  firstReadingIndex,
  nextReadingIndex,
  overscroll,
  type OverscrollState,
} from '../src/renderer/reader/navigation'

const spine = [
  { linear: false }, // 0 cover, out of the flow
  { linear: true }, // 1
  { linear: false }, // 2 notes
  { linear: true }, // 3
  { linear: false }, // 4
]

describe('the reading flow', () => {
  it('starts at the first linear item', () => {
    expect(firstReadingIndex(spine)).toBe(1)
    expect(firstReadingIndex([{ linear: false }, { linear: false }])).toBe(0)
    expect(firstReadingIndex([])).toBe(0)
  })

  it('skips linear="no" items both ways and stops at the ends', () => {
    expect(nextReadingIndex(spine, 1, 1)).toBe(3)
    expect(nextReadingIndex(spine, 3, -1)).toBe(1)
    expect(nextReadingIndex(spine, 3, 1)).toBeNull()
    expect(nextReadingIndex(spine, 1, -1)).toBeNull()
  })

  it('goes on from a non-linear item reached by a link to the nearest linear one', () => {
    expect(nextReadingIndex(spine, 2, 1)).toBe(3)
    expect(nextReadingIndex(spine, 2, -1)).toBe(1)
    expect(nextReadingIndex(spine, 0, 1)).toBe(1)
    expect(nextReadingIndex(spine, 4, -1)).toBe(3)
  })
})

describe('turning at a chapter edge', () => {
  const push = (
    state: OverscrollState,
    deltaY: number,
    edges: { atStart: boolean; atEnd: boolean },
    time: number,
  ) => overscroll(state, { deltaY, ...edges, time })

  it('turns forward only after pushing on at the end', () => {
    let state = OVERSCROLL_IDLE
    let step = push(state, 120, { atStart: false, atEnd: false }, 0)
    expect(step.turn).toBeNull()
    state = step.state
    let time = 10
    let turned: number | null = null
    for (let i = 0; i < 10 && turned === null; i++) {
      step = push(state, 100, { atStart: false, atEnd: true }, time)
      state = step.state
      turned = step.turn
      time += 50
    }
    expect(turned).toBe(1)
    expect(state).toEqual(OVERSCROLL_IDLE)
  })

  it('turns back after pushing on at the start', () => {
    const half = { atStart: true, atEnd: false }
    const first = push(OVERSCROLL_IDLE, -OVERSCROLL_TURN / 2, half, 0)
    expect(first.turn).toBeNull()
    expect(push(first.state, -OVERSCROLL_TURN / 2, half, 20).turn).toBe(-1)
  })

  it('starts counting again after a pause or a change of direction', () => {
    const end = { atStart: false, atEnd: true }
    const a = push(OVERSCROLL_IDLE, OVERSCROLL_TURN - 10, end, 0)
    expect(push(a.state, 20, end, OVERSCROLL_GAP_MS + 1).turn).toBeNull()
    const both = { atStart: true, atEnd: true }
    const b = push(OVERSCROLL_IDLE, OVERSCROLL_TURN - 10, both, 0)
    expect(push(b.state, -20, both, 10).turn).toBeNull()
  })

  it('does not count scrolling away from the edge', () => {
    const a = push(OVERSCROLL_IDLE, OVERSCROLL_TURN - 10, { atStart: false, atEnd: true }, 0)
    const b = push(a.state, -50, { atStart: false, atEnd: true }, 10)
    expect(b.state).toEqual(OVERSCROLL_IDLE)
    expect(b.turn).toBeNull()
  })
})

describe('the current table-of-contents entry', () => {
  const entry = (title: string, spineIndex: number | null, depth = 1): EpubTocEntry => ({
    title,
    path: spineIndex === null ? null : `t/${spineIndex}.xhtml`,
    fragment: null,
    spineIndex,
    depth,
  })
  const entries = [entry('Part', null), entry('One', 1), entry('One.a', 1, 2), entry('Three', 3)]

  it('is the first entry of that chapter', () => {
    expect(currentTocEntry(entries, 1)).toBe(1)
    expect(currentTocEntry(entries, 3)).toBe(3)
  })

  it('is the last entry before a chapter that has none', () => {
    expect(currentTocEntry(entries, 2)).toBe(1)
    expect(currentTocEntry(entries, 7)).toBe(3)
  })

  it('is none before every entry', () => {
    expect(currentTocEntry(entries, 0)).toBe(-1)
    expect(currentTocEntry([], 2)).toBe(-1)
  })
})
