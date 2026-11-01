import { describe, expect, it } from 'vitest'
import type { RenderNode } from '@genoffice/pptx-render'
import { flattenPath, mergeOutline, mergeShapes } from '../src/renderer/merge-shapes'

function rect(id: string, x: number, y: number, w: number, h: number, extra = {}): RenderNode {
  return {
    id,
    type: 'shape',
    sourceId: id,
    box: { x, y, w, h, rotationDeg: 0, flipH: false, flipV: false, centerX: 0, centerY: 0 },
    fill: { kind: 'solid', color: '#000000' },
    ...extra,
  } as unknown as RenderNode
}

/** Shoelace area of every subpath, holes (opposite winding) subtract */
function area(cmds: Array<{ op: string; pts: number[] }>): number {
  let total = 0
  for (const ring of flattenPath(cmds as never)) {
    let a = 0
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i]!
      const [x2, y2] = ring[(i + 1) % ring.length]!
      a += x1 * y2 - x2 * y1
    }
    total += a / 2
  }
  return Math.abs(total)
}

const a = rect('a', 0, 0, 100, 100)
const b = rect('b', 50, 50, 100, 100)

describe('mergeShapes', () => {
  it('unions two overlapping squares into one outline', () => {
    const [u] = mergeShapes([a, b], 'union')!
    expect(u!.box).toEqual({ x: 0, y: 0, w: 150, h: 150 })
    expect(area(u!.path.cmds)).toBeCloseTo(17500)
  })

  it('intersects, subtracts and combines', () => {
    const [i] = mergeShapes([a, b], 'intersect')!
    expect(i!.box).toEqual({ x: 50, y: 50, w: 50, h: 50 })
    const [s] = mergeShapes([a, b], 'subtract')!
    expect(s!.box).toEqual({ x: 0, y: 0, w: 100, h: 100 })
    expect(area(s!.path.cmds)).toBeCloseTo(7500)
    const [c] = mergeShapes([a, b], 'combine')!
    expect(area(c!.path.cmds)).toBeCloseTo(15000)
  })

  it('fragments into every region', () => {
    const parts = mergeShapes([a, b], 'fragment')!
    expect(parts).toHaveLength(3)
    expect(parts.map((p) => Math.round(area(p.path.cmds))).sort((x, y) => x - y)).toEqual([
      2500, 7500, 7500,
    ])
  })

  it('returns nothing for shapes that do not overlap and null for unknown outlines', () => {
    expect(mergeShapes([a, rect('c', 300, 300, 10, 10)], 'intersect')).toEqual([])
    const star = rect('s', 0, 0, 10, 10, { presetGeometry: 'star5' })
    expect(mergeOutline(star)).toBeNull()
    expect(mergeShapes([a, star], 'union')).toBeNull()
  })

  it('places rotated boxes and ellipses on the slide', () => {
    const turned = rect('r', 0, 0, 100, 20, {
      box: {
        x: 0,
        y: 0,
        w: 100,
        h: 20,
        rotationDeg: 90,
        flipH: false,
        flipV: false,
        centerX: 0,
        centerY: 0,
      },
    })
    const [u] = mergeShapes([turned, rect('t', 40, 40, 20, 20)], 'union')!
    // a 100×20 bar turned about its center spans x 40..60, y -40..60
    expect(u!.box.x).toBeCloseTo(40)
    expect(u!.box.y).toBeCloseTo(-40)
    expect(u!.box.h).toBeCloseTo(100)
    const circle = rect('e', 0, 0, 100, 100, { presetGeometry: 'ellipse' })
    const [e] = mergeShapes([circle, rect('f', 0, 0, 1, 1)], 'union')!
    expect(area(e!.path.cmds)).toBeCloseTo(Math.PI * 50 * 50, -2)
  })
})
