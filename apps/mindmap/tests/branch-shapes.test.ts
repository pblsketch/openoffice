// @vitest-environment node
/**
 * The shapes a branch line can take, as path data: each a pure function of the
 * two boxes, the same as the theme's own shapes when the shape asked for is
 * the theme's, and the underline of the line skeleton kept whatever the shape.
 */
import { describe, expect, it } from 'vitest'
import { themeLook } from '@genoffice/xmind-engine'
import {
  type BranchBoxes,
  linePatternDash,
  mainBranchPath,
  subBranchPath,
  taperedBranchPath,
} from '../src/renderer/map/branches'
import { branchGeometry } from '../src/renderer/map/look'

const numbers = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
const line = branchGeometry(themeLook('line/paper/light'))
const pill = branchGeometry(themeLook('pill/paper/light'))
const block = branchGeometry(themeLook('block/paper/light'))

const main: BranchBoxes = {
  pT: 100,
  pL: 300,
  pW: 200,
  pH: 60,
  cT: 40,
  cL: 560,
  cW: 90,
  cH: 32,
  direction: 'rhs',
}
const sub: BranchBoxes = {
  pT: 0,
  pL: 0,
  pW: 100,
  pH: 30,
  cT: 60,
  cL: 160,
  cW: 120,
  cH: 30,
  direction: 'rhs',
  isFirst: true,
}
const down: BranchBoxes = { ...main, cT: 220, cL: 100, direction: 'down' }

describe("the theme's shape asked for by name is the theme's path", () => {
  it('curves from the centre, in every skeleton and direction', () => {
    for (const geometry of [line, pill, block]) {
      for (const box of [main, down, { ...main, cL: 150, direction: 'lhs' }]) {
        expect(mainBranchPath(geometry, box, { shape: 'curve' })).toBe(
          mainBranchPath(geometry, box),
        )
      }
    }
  })

  it("the skeleton's own shape below the main level", () => {
    expect(subBranchPath(pill, sub, { shape: 'curve' })).toBe(subBranchPath(pill, sub))
    expect(subBranchPath(line, sub, { shape: 'curve' })).toBe(subBranchPath(line, sub))
    expect(subBranchPath(block, sub, { shape: 'roundedElbow' })).toBe(subBranchPath(block, sub))
    const subDown = { ...sub, direction: 'down' }
    expect(subBranchPath(block, subDown, { shape: 'roundedElbow' })).toBe(
      subBranchPath(block, subDown),
    )
  })
})

describe('the other shapes', () => {
  it('a straight line goes from end to end', () => {
    const d = mainBranchPath(pill, main, { shape: 'straight' })
    expect(d).toMatch(/^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/)
    const [, , ex, ey] = numbers(d)
    expect([ex, ey]).toEqual([main.cL, main.cT + main.cH / 2])
    expect(subBranchPath(pill, { ...sub, direction: 'down' }, { shape: 'straight' })).toMatch(
      /^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/,
    )
  })

  it('an elbow turns with square corners, half way; level ends make it straight', () => {
    const d = subBranchPath(pill, sub, { shape: 'elbow' })
    expect(d).toMatch(/^M [\d.]+ [\d.]+ H [\d.]+ V [\d.]+ H [\d.]+$/)
    expect(d).not.toContain('Q')
    const level = subBranchPath(pill, { ...sub, cT: 0 }, { shape: 'elbow' })
    expect(level).toMatch(/^M [\d.]+ [\d.]+ H [\d.]+$/)
    expect(mainBranchPath(pill, down, { shape: 'elbow' })).toMatch(
      /^M [\d.]+ [\d.]+ V [\d.]+ H [\d.]+ V [\d.]+$/,
    )
  })

  it('a rounded elbow is the rounded one whatever the skeleton', () => {
    expect(subBranchPath(pill, sub, { shape: 'roundedElbow' }).match(/Q/g)).toHaveLength(2)
    expect(mainBranchPath(pill, main, { shape: 'roundedElbow' }).match(/Q/g)).toHaveLength(2)
  })

  it('a curve with an arrow ends in an arrowhead pointing at the topic', () => {
    const d = mainBranchPath(pill, main, { shape: 'arrowedCurve', width: 2 })
    expect(d).toContain(' C ')
    const end = `L ${main.cL} ${main.cT + main.cH / 2} L`
    expect(d).toContain(end)
    // on the left side the head points the other way
    const left = { ...main, cL: 150, direction: 'lhs' }
    const head = numbers(mainBranchPath(pill, left, { shape: 'arrowedCurve' })).slice(-6)
    expect(head[0]).toBeGreaterThan(left.cL + left.cW)
    // downward, it points down
    const fall = numbers(mainBranchPath(pill, down, { shape: 'arrowedCurve' })).slice(-6)
    expect(fall[1]).toBeLessThan(down.cT)
    // a wider line has a larger head
    const wide = numbers(mainBranchPath(pill, main, { shape: 'arrowedCurve', width: 6 })).slice(-6)
    const thin = numbers(mainBranchPath(pill, main, { shape: 'arrowedCurve', width: 1 })).slice(-6)
    expect(main.cL - wide[0]!).toBeGreaterThan(main.cL - thin[0]!)
  })

  it('no line draws nothing but a point to move to', () => {
    expect(mainBranchPath(pill, main, { shape: 'none' })).toMatch(/^M [\d.]+ [\d.]+$/)
    expect(subBranchPath(block, sub, { shape: 'none' })).toMatch(/^M [\d.]+ [\d.]+$/)
  })

  it('in the line skeleton the underline stays, whatever the shape', () => {
    for (const shape of ['straight', 'elbow', 'roundedElbow', 'arrowedCurve', 'none'] as const) {
      const d = mainBranchPath(line, main, { shape })
      expect(d, shape).toContain(`H ${main.cL + main.cW}`)
      const below = subBranchPath(line, sub, { shape })
      expect(below, shape).toContain(`H ${sub.cL + sub.cW - line.subPadX}`)
    }
    // with no line, only the underline is drawn
    expect(mainBranchPath(line, main, { shape: 'none' })).toMatch(/^M [\d.]+ [\d.]+ H [\d.]+$/)
  })
})

describe('a tapered line from the centre', () => {
  /** Half the line's thickness at the given x, from the outline's points there. */
  function spreadAt(d: string, x: number): number {
    const values = numbers(d)
    const ys: number[] = []
    for (let at = 0; at + 1 < values.length; at += 2) {
      if (Math.abs(values[at]! - x) < 0.6) ys.push(values[at + 1]!)
    }
    return Math.max(...ys) - Math.min(...ys)
  }

  it('is a closed shape, wide at the centre and narrow at the topic', () => {
    // level with the centre, so the outline's thickness is measured straight up and down
    const level = { ...main, cT: main.pT + main.pH / 2 - main.cH / 2 }
    const d = taperedBranchPath(pill, level, { shape: 'straight', width: 2 })
    expect(d).toMatch(/^M .* Z$/)
    expect(d).not.toContain('C')
    const start = main.pL + main.pW - pill.centralInset
    expect(spreadAt(d, start)).toBeGreaterThan(spreadAt(d, main.cL))
    expect(spreadAt(d, start)).toBeCloseTo(6, 0)
    expect(spreadAt(d, main.cL)).toBeCloseTo(1, 0)
  })

  it('takes every shape and both directions', () => {
    for (const shape of ['curve', 'straight', 'elbow', 'roundedElbow', 'arrowedCurve'] as const) {
      for (const box of [main, down, { ...main, cL: 150, direction: 'lhs' }]) {
        const d = taperedBranchPath(block, box, { shape, width: 2.25 })
        expect(d, `${shape} ${box.direction}`).toMatch(/^M .* Z$/)
        expect(numbers(d).every(Number.isFinite), shape).toBe(true)
      }
    }
  })

  it('keeps the underline of the line skeleton, as a filled band', () => {
    const d = taperedBranchPath(line, main, { shape: 'curve', width: 2.25 })
    // the band ends where the topic ends; the line itself ends where the topic begins
    expect(d).toMatch(/ Z$/)
    expect(d).toContain(`H ${main.cL + main.cW}`)
  })
})

describe('the patterns of a line', () => {
  it('solid has no dashes; every other pattern has its own, wider with the line', () => {
    expect(linePatternDash('solid', 2)).toBeNull()
    const patterns = ['dash', 'dot', 'dash-dot', 'dash-dot-dot', 'round-dot'] as const
    const thin = patterns.map((pattern) => linePatternDash(pattern, 1)!)
    expect(new Set(thin.map((dash) => dash.dasharray)).size).toBe(patterns.length)
    for (const pattern of patterns) {
      const one = numbers(linePatternDash(pattern, 1)!.dasharray)
      const three = numbers(linePatternDash(pattern, 3)!.dasharray)
      expect(three, pattern).toEqual(one.map((value) => value * 3))
    }
  })

  it('round dots have round ends; the others are cut square', () => {
    expect(linePatternDash('round-dot', 2)!.linecap).toBe('round')
    for (const pattern of ['dash', 'dot', 'dash-dot', 'dash-dot-dot'] as const) {
      expect(linePatternDash(pattern, 2)!.linecap, pattern).toBe('butt')
    }
    // the dashes of a very thin line stay visible
    expect(numbers(linePatternDash('dash', 0.25)!.dasharray)).toEqual(
      numbers(linePatternDash('dash', 1)!.dasharray),
    )
  })
})
