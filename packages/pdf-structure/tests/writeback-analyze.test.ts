/**
 * Writeback analysis rules on hand-made text objects: line-end hyphens
 * adopted by their paragraph, table text split among cells by place.
 */
import { describe, expect, it } from 'vitest'
import type { Rect } from '../src/tree'
import { adoptHyphens, placeCellsByArea, type TextObjectInfo } from '../src/writeback/analyze'

let next = 0
const obj = (text: string, bounds: Rect, size = 10): TextObjectInfo => ({
  index: next++,
  bounds,
  text,
  size,
  baselines: [bounds.y0 + 2],
  color: [0, 0, 0],
  invisible: false,
  vertical: false,
})

describe('line-end hyphens', () => {
  const para = { id: 'p1', box: { x0: 72, y0: 600, x1: 300, y1: 640 } }
  const other = { id: 'p2', box: { x0: 320, y0: 600, x1: 540, y1: 640 } }

  it('gives a hyphen just past a paragraph to that paragraph', () => {
    const hyphen = obj('-', { x0: 301, y0: 628, x1: 305, y1: 638 })
    const owned = new Map([['p1', [obj('aggre', { x0: 72, y0: 628, x1: 300, y1: 638 })]]])
    const adopted = adoptHyphens([hyphen], [para, other], owned)
    expect(adopted.has(hyphen)).toBe(true)
    expect(owned.get('p1')).toContain(hyphen)
    expect(owned.get('p2')).toBeUndefined()
  })

  it('leaves a hyphen far from any paragraph, or other short text, alone', () => {
    const far = obj('-', { x0: 312, y0: 628, x1: 316, y1: 638 })
    const word = obj('ab', { x0: 301, y0: 628, x1: 310, y1: 638 })
    const owned = new Map<string, TextObjectInfo[]>()
    expect(adoptHyphens([far, word], [para], owned).size).toBe(0)
    expect(owned.size).toBe(0)
  })

  it('does not take a hyphen a paragraph already owns', () => {
    const hyphen = obj('-', { x0: 290, y0: 628, x1: 294, y1: 638 })
    const owned = new Map([['p1', [hyphen]]])
    expect(adoptHyphens([hyphen], [para], owned).size).toBe(0)
  })
})

describe('table text by cell place', () => {
  const left = { key: 't#0.0.0', text: 'Name', area: { x0: 72, y0: 660, x1: 200, y1: 700 } }
  const right = { key: 't#0.1.0', text: 'Price', area: { x0: 200, y0: 660, x1: 328, y1: 700 } }

  it('gives each object to the cell holding it and starts at the source top', () => {
    const a = obj('Name', { x0: 80, y0: 672, x1: 110, y1: 682 })
    const b = obj('Price', { x0: 208, y0: 672, x1: 240, y1: 682 })
    const placed = placeCellsByArea([a, b], [left, right])
    const l = placed.get(left.key)
    if (!l || l === 'shared') throw new Error('left cell not placed')
    expect(l.objects).toEqual([a])
    expect(l.box.y1).toBeCloseTo(682)
    expect(l.area!.y1).toBeLessThan(left.area.y1)
    expect(l.area!.y1).toBeGreaterThan(682)
  })

  it('tolerates a glyph touching the rule', () => {
    const a = obj('Name', { x0: 150, y0: 672, x1: 201, y1: 682 })
    const placed = placeCellsByArea([a], [left, right])
    expect(placed.get(left.key)).not.toBe('shared')
    expect(placed.get(right.key)).toBeUndefined()
  })

  it('marks the cells a string drawn across them touches', () => {
    // mostly in the left cell, yet a neighbor's text sits in its tail
    const row = obj('Name and the price', { x0: 80, y0: 672, x1: 260, y1: 682 })
    const placed = placeCellsByArea([row], [left, right])
    expect(placed.get(left.key)).toBe('shared')
    expect(placed.get(right.key)).toBe('shared')
  })
})
