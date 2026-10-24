/**
 * Placement of translated blocks (decision 0057): sizes shared within a
 * group, growth into free space, ink kept clear of what is around, and
 * blocks with no room left in their source text.
 */
import { describe, expect, it } from 'vitest'
import type { Rect } from '../src/tree'
import { MIN_FONT_SCALE } from '../src/writeback'
import type { Measurer } from '../src/writeback/layout'
import { inkOf, placeBlocks, type PageSpace, type PlanBlock } from '../src/writeback/place'

/** monospace: every char is half an em wide */
const mono: Measurer = { measure: (s) => [...s].length * 0.5, ascent: 0.8, descent: 0.2 }

/** a one-line box 100pt wide (20 chars at 10pt) with its top at `top` */
const lineBox = (x0: number, top: number, width = 100): Rect => ({
  x0,
  y0: top - 10,
  x1: x0 + width,
  y1: top,
})

const block = (
  key: string,
  text: string,
  box: Rect,
  extra: Partial<PlanBlock> = {},
): PlanBlock => ({
  key,
  text,
  boxes: [box],
  pages: [1],
  size: 10,
  lineHeight: 1.2,
  align: 'left',
  font: mono,
  group: 'text:10',
  expandable: true,
  ...extra,
})

const page = (shapes: Rect[] = [], content: Rect = { x0: 0, y0: 0, x1: 200, y1: 200 }) =>
  new Map<number, PageSpace>([[1, { text: [], shapes, content }]])

const intersects = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

describe('placing translated blocks', () => {
  it('lays a block out at the source size when it fits', () => {
    const placed = placeBlocks([block('a', 'short text', lineBox(0, 100))], page(), MIN_FONT_SCALE)
    expect(placed.get('a')!.layout.size).toBe(10)
  })

  it('sizes a group alike: the step most of its text needs', () => {
    const placed = placeBlocks(
      [
        // 30 chars on one 100pt line: fits from 0.64 down
        block('long', 'x'.repeat(30), lineBox(0, 100), { expandable: false }),
        block('short', 'y'.repeat(10), lineBox(0, 80), { expandable: false }),
        block('other', 'z'.repeat(10), lineBox(0, 60), { expandable: false, group: 'heading:10' }),
      ],
      page(),
      MIN_FONT_SCALE,
    )
    expect(placed.get('long')!.layout.size).toBeCloseTo(6.4)
    // fits at 10, drawn at the group's size
    expect(placed.get('short')!.layout.size).toBeCloseTo(6.4)
    // another group keeps its own size
    expect(placed.get('other')!.layout.size).toBe(10)
  })

  it('grows a block into the free space below before shrinking further', () => {
    const box = lineBox(0, 100)
    const placed = placeBlocks([block('a', 'y'.repeat(50), box)], page(), MIN_FONT_SCALE)
    const at = placed.get('a')!
    // the first step under 0.9 that may grow
    expect(at.layout.size).toBeCloseTo(8.8)
    expect(at.boxes[0]!.y0).toBeLessThan(box.y0)
    expect(at.layout.lines.length).toBe(3)
  })

  it('stops growing short of an object below and keeps the ink clear of it', () => {
    const below: Rect = { x0: 0, y0: 60, x1: 50, y1: 70 }
    const placed = placeBlocks(
      [block('a', 'y'.repeat(50), lineBox(0, 100))],
      page([below]),
      MIN_FONT_SCALE,
    )
    const at = placed.get('a')!
    expect(at.boxes[0]!.y0).toBeGreaterThanOrEqual(below.y1)
    for (const ink of inkOf(at.layout, mono)) expect(intersects(ink, below)).toBe(false)
  })

  it('keeps a block inside the backdrop that holds it', () => {
    const backdrop: Rect = { x0: -5, y0: 80, x1: 105, y1: 105 }
    const placed = placeBlocks(
      [block('a', 'y'.repeat(50), lineBox(0, 100))],
      page([backdrop]),
      MIN_FONT_SCALE,
    )
    const at = placed.get('a')!
    expect(at.boxes[0]!.y0).toBeGreaterThanOrEqual(backdrop.y0)
    for (const ink of inkOf(at.layout, mono)) {
      expect(ink.y0).toBeGreaterThanOrEqual(backdrop.y0 - 0.25)
      expect(ink.x1).toBeLessThanOrEqual(backdrop.x1 + 0.25)
    }
  })

  it('does not grow into another block', () => {
    const other = lineBox(0, 70)
    const placed = placeBlocks(
      [block('a', 'y'.repeat(50), lineBox(0, 100)), block('b', 'short', other)],
      page(),
      MIN_FONT_SCALE,
    )
    const a = placed.get('a')!
    for (const ink of inkOf(a.layout, mono)) expect(intersects(ink, other)).toBe(false)
  })

  it('keeps the ink of blocks growing into the same space apart', () => {
    const placed = placeBlocks(
      [
        block('right', 'y'.repeat(60), lineBox(110, 100, 90)),
        block('left', 'z'.repeat(80), lineBox(0, 60)),
      ],
      page(),
      MIN_FONT_SCALE,
    )
    const right = inkOf(placed.get('right')!.layout, mono)
    const left = inkOf(placed.get('left')!.layout, mono)
    expect(right.length).toBeGreaterThan(1)
    expect(left.length).toBeGreaterThan(1)
    for (const r of right) for (const l of left) expect(intersects(r, l)).toBe(false)
  })

  it('never draws over a translation already placed, even where the source boxes overlapped', () => {
    // two rows the analysis merged into overlapping paragraphs
    const placed = placeBlocks(
      [
        block('first', 'x'.repeat(18), { x0: 0, y0: 84, x1: 100, y1: 100 }, { expandable: false }),
        block('second', 'y'.repeat(18), { x0: 0, y0: 80, x1: 100, y1: 96 }, { expandable: false }),
      ],
      page(),
      MIN_FONT_SCALE,
    )
    const first = inkOf(placed.get('first')!.layout, mono)
    const second = placed.get('second')
    if (second) {
      for (const a of first)
        for (const b of inkOf(second.layout, mono)) expect(intersects(a, b)).toBe(false)
    }
  })

  it('leaves a block unplaced when it has no room even at the floor size', () => {
    const placed = placeBlocks(
      [block('a', 'y'.repeat(200), lineBox(0, 100), { expandable: false })],
      page(),
      MIN_FONT_SCALE,
    )
    expect(placed.get('a')).toBeNull()
  })
})
