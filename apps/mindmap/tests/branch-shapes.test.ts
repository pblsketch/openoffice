// @vitest-environment node
/**
 * The shapes a branch line can take, as path data: each a pure function of the
 * two boxes, the same as the theme's own shapes when the shape asked for is
 * the theme's, and the underline of the line skeleton kept whatever the shape.
 * The arrowhead drawn apart, the tapered outline along every shape, and a
 * pattern laid onto a line by its length.
 */
import { describe, expect, it } from 'vitest'
import { themeLook } from '@genoffice/xmind-engine'
import {
  type BranchBoxes,
  fittedLinePattern,
  linePatternDash,
  mainBranchDrawing,
  mainBranchPath,
  subBranchDrawing,
  subBranchPath,
  taperBaseWidth,
  taperedBranchPath,
} from '../src/renderer/map/branches'
import { branchGeometry } from '../src/renderer/map/look'

interface Point {
  x: number
  y: number
}

const numbers = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
/** The points of a polygon's `points` attribute. */
const pairs = (points: string): Point[] =>
  points.split(' ').map((pair) => {
    const [x, y] = pair.split(',').map(Number)
    return { x: x!, y: y! }
  })
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

  it('a curve with an arrow ends in a filled head drawn apart, the line stopping inside its base', () => {
    const drawing = mainBranchDrawing(pill, main, { shape: 'arrowedCurve', width: 2 })
    // the path is the curve alone
    expect(drawing.d).toMatch(/^M [\d.]+ [\d.]+ C [\d. ]+$/)
    const head = pairs(drawing.head!)
    expect(head).toHaveLength(3)
    const tip = { x: main.cL, y: main.cT + main.cH / 2 }
    expect(head).toContainEqual(tip)
    const base = Math.min(...head.map((point) => point.x))
    const [ex, ey] = numbers(drawing.d).slice(-2)
    // the line's end lies between the head's base and its point, at the point's height
    expect(ex).toBeGreaterThan(base)
    expect(ex).toBeLessThan(tip.x)
    expect(ey).toBe(tip.y)
    // on the left side the head points the other way
    const left = { ...main, cL: 150, direction: 'lhs' }
    const leftHead = pairs(mainBranchDrawing(pill, left, { shape: 'arrowedCurve' }).head!)
    expect(Math.min(...leftHead.map((point) => point.x))).toBe(left.cL + left.cW)
    expect(Math.max(...leftHead.map((point) => point.x))).toBeGreaterThan(left.cL + left.cW)
    // downward, it points down
    const fall = pairs(mainBranchDrawing(pill, down, { shape: 'arrowedCurve' }).head!)
    expect(Math.max(...fall.map((point) => point.y))).toBe(down.cT)
    // a wider line has a larger head
    const span = (width: number): number => {
      const points = pairs(mainBranchDrawing(pill, main, { shape: 'arrowedCurve', width }).head!)
      return Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y))
    }
    expect(span(6)).toBeGreaterThan(span(1))
    // the other shapes have no head
    for (const shape of ['curve', 'straight', 'elbow', 'roundedElbow', 'none'] as const) {
      expect(mainBranchDrawing(pill, main, { shape }).head, shape).toBeNull()
    }
  })

  it('the path functions give the drawing without its head', () => {
    for (const shape of ['curve', 'arrowedCurve', 'elbow'] as const) {
      expect(mainBranchPath(line, main, { shape, width: 3 })).toBe(
        mainBranchDrawing(line, main, { shape, width: 3 }).d,
      )
      expect(subBranchPath(block, sub, { shape, width: 3 })).toBe(
        subBranchDrawing(block, sub, { shape, width: 3 }).d,
      )
    }
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

describe('the length of a line, and the part of it under the topic it leaves', () => {
  it('a straight line is as long as it runs, and starts under the central topic', () => {
    const level = { ...main, cT: main.pT + main.pH / 2 - main.cH / 2 }
    const drawing = mainBranchDrawing(pill, level, { shape: 'straight' })
    const start = main.pL + main.pW - pill.centralInset
    expect(drawing.length).toBeCloseTo(main.cL - start, 5)
    expect(drawing.lead).toBeCloseTo(pill.centralInset, 3)
    expect(drawing.shared).toBe(false)
  })

  it('a curve is measured along it; a line below the main level starts at its topic', () => {
    const curve = mainBranchDrawing(pill, main, { shape: 'curve' })
    const chord = Math.hypot(
      main.cL - (main.pL + main.pW - pill.centralInset),
      main.cT + main.cH / 2 - (main.pT + main.pH / 2),
    )
    expect(curve.length).toBeGreaterThan(chord)
    expect(curve.length).toBeLessThan(chord * 1.3)
    // a curve leaves level, so a little more than the inset lies under the topic
    expect(curve.lead).toBeGreaterThanOrEqual(pill.centralInset)
    expect(curve.lead).toBeLessThan(pill.centralInset + 0.5)
    expect(subBranchDrawing(pill, sub).lead).toBe(0)
  })

  it('an underline joined on counts; an elbow shares its trunk', () => {
    expect(mainBranchDrawing(line, main, { shape: 'none' }).length).toBeCloseTo(main.cW, 5)
    expect(mainBranchDrawing(pill, main, { shape: 'none' }).length).toBe(0)
    const underlined = mainBranchDrawing(line, main, { shape: 'curve' })
    expect(underlined.length).toBeGreaterThan(main.cW + (main.cL - main.pL - main.pW))
    expect(mainBranchDrawing(pill, main, { shape: 'elbow' }).shared).toBe(true)
    expect(subBranchDrawing(block, sub).shared).toBe(true)
    expect(subBranchDrawing(pill, sub).shared).toBe(false)
  })
})

/** The pieces of an outline: its four- and three-sided pieces, and its discs with their middles and radii. */
function pieces(d: string) {
  const polygons: Point[][] = []
  const discs: Array<{ x: number; y: number; r: number }> = []
  for (const part of d.split('M ').filter((part) => part.trim() !== '')) {
    if (part.includes(' A ')) {
      const [x, y, r] = numbers(part)
      discs.push({ x: x! - r!, y: y!, r: r! })
    } else {
      const values = numbers(part)
      const points: Point[] = []
      for (let at = 0; at + 1 < values.length; at += 2) {
        points.push({ x: values[at]!, y: values[at + 1]! })
      }
      polygons.push(points)
    }
  }
  return { polygons, discs }
}

/** Twice the area inside the points; positive when they go round clockwise on screen. */
const turning = (points: readonly Point[]): number =>
  points.reduce((sum, point, at) => {
    const next = points[(at + 1) % points.length]!
    return sum + point.x * next.y - next.x * point.y
  }, 0)

describe('a tapered line from the centre', () => {
  const level = { ...main, cT: main.pT + main.pH / 2 - main.cH / 2 }
  const start = main.pL + main.pW - pill.centralInset

  it('is as wide as the base where it leaves the centre and as wide as the line at the topic', () => {
    const d = taperedBranchPath(pill, level, { shape: 'straight', width: 2 })
    expect(d).toMatch(/^M .* Z$/)
    expect(d).not.toContain('C')
    const { polygons, discs } = pieces(d)
    const first = polygons[0]!
    // square along the central topic's edge, the base's width across
    expect(first[0]!.x).toBeCloseTo(start, 5)
    expect(first[3]!.x).toBeCloseTo(start, 5)
    expect(Math.abs(first[0]!.y - first[3]!.y)).toBeCloseTo(taperBaseWidth(2), 5)
    // round at the topic, the line's own width
    const last = discs.at(-1)!
    expect(last.x).toBeCloseTo(main.cL, 5)
    expect(last.r * 2).toBeCloseTo(2, 5)
  })

  it('narrows all the way, faster at first', () => {
    const d = taperedBranchPath(pill, main, { shape: 'curve', width: 4 })
    const radii = pieces(d).discs.map((disc) => disc.r)
    for (let at = 1; at < radii.length; at++) expect(radii[at]!).toBeLessThanOrEqual(radii[at - 1]!)
    const middle = radii[Math.floor(radii.length / 2)]!
    // half way, less than half of the extra width is left
    expect(middle - 2).toBeLessThan((taperBaseWidth(4) / 2 - 2) / 2)
  })

  it('the base grows with the line, by a few pixels at most', () => {
    expect(taperBaseWidth(1)).toBe(3)
    expect(taperBaseWidth(2)).toBe(6)
    expect(taperBaseWidth(4)).toBe(8)
    expect(taperBaseWidth(6)).toBe(10)
    expect(taperBaseWidth(10)).toBe(14)
  })

  it('follows every shape, both sides and downward, never reaching back into the centre', () => {
    const boxes = [main, { ...main, cL: 150, direction: 'lhs' }, down]
    for (const shape of ['curve', 'straight', 'elbow', 'roundedElbow', 'arrowedCurve'] as const) {
      for (const box of boxes) {
        const d = taperedBranchPath(block, box, { shape, width: 6 })
        const what = `${shape} ${box.direction}`
        expect(d, what).toMatch(/^M .* Z$/)
        expect(numbers(d).every(Number.isFinite), what).toBe(true)
        const { polygons, discs } = pieces(d)
        // every piece goes round the same way, so they fill as one
        for (const polygon of polygons) expect(turning(polygon), what).toBeGreaterThan(0)
        // nothing goes back past where the line starts (a sharp turn's inner side, under a pixel)
        const edge =
          box.direction === 'down'
            ? (p: Point) => p.y - (box.pT + box.pH - block.centralInset)
            : box.direction === 'lhs'
              ? (p: Point) => box.pL + block.centralInset - p.x
              : (p: Point) => p.x - (box.pL + box.pW - block.centralInset)
        for (const point of polygons.flat()) expect(edge(point), what).toBeGreaterThan(-1)
        for (const disc of discs) {
          const reach =
            box.direction === 'down'
              ? { x: disc.x, y: disc.y - disc.r }
              : { x: disc.x - (box.direction === 'lhs' ? -disc.r : disc.r), y: disc.y }
          expect(edge(reach), what).toBeGreaterThan(-1)
        }
      }
    }
  })

  it('turns an elbow round: a disc at each corner, no point standing out', () => {
    const d = taperedBranchPath(pill, main, { shape: 'elbow', width: 4 })
    const { discs } = pieces(d)
    const mx = (start + main.cL) / 2
    const ey = main.cT + main.cH / 2
    expect(
      discs.some((disc) => Math.abs(disc.x - mx) < 0.01 && Math.abs(disc.y - 130) < 0.01),
    ).toBe(true)
    expect(discs.some((disc) => Math.abs(disc.x - mx) < 0.01 && Math.abs(disc.y - ey) < 0.01)).toBe(
      true,
    )
    // no outline point lies further from the line than half the base
    const { polygons } = pieces(d)
    const half = taperBaseWidth(4) / 2
    for (const point of polygons.flat()) {
      const off = Math.min(Math.abs(point.y - 130), Math.abs(point.x - mx), Math.abs(point.y - ey))
      expect(off).toBeLessThanOrEqual(half + 0.01)
    }
  })

  it('ends a curve with an arrow in a filled head, pointing at the topic', () => {
    const d = taperedBranchPath(pill, main, { shape: 'arrowedCurve', width: 2 })
    const { polygons } = pieces(d)
    const tip = { x: main.cL, y: main.cT + main.cH / 2 }
    expect(
      polygons.some(
        (polygon) => polygon.length === 3 && polygon.some((p) => p.x === tip.x && p.y === tip.y),
      ),
    ).toBe(true)
  })

  it('runs on into the underline of the line skeleton at the line width', () => {
    const d = taperedBranchPath(line, main, { shape: 'curve', width: 3 })
    const { discs } = pieces(d)
    const y = main.cT + main.cH - (line.mainUnderline ?? 0) / 2
    const at = (x: number) =>
      discs.find((disc) => Math.abs(disc.x - x) < 0.01 && Math.abs(disc.y - y) < 0.01)
    expect(at(main.cL)?.r).toBeCloseTo(1.5, 5)
    expect(at(main.cL + main.cW)?.r).toBeCloseTo(1.5, 5)
    // no line: the underline alone
    const none = taperedBranchPath(line, main, { shape: 'none', width: 3 })
    expect(pieces(none).discs).toHaveLength(2)
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

describe('a pattern laid onto a line', () => {
  const sum = (dash: string): number => numbers(dash).reduce((total, value) => total + value, 0)

  it('starts with a whole dash where the line comes out from under its topic', () => {
    for (const lead of [0, 3, 6, 40]) {
      const fitted = fittedLinePattern('dash', 3, { length: 200, lead, shared: false })!
      const period = sum(fitted.dasharray)
      expect(fitted.dashoffset).toBeGreaterThanOrEqual(0)
      // at the start of what shows, the pattern is at its own start
      const phase = (fitted.dashoffset + lead) % period
      expect(Math.min(phase, period - phase)).toBeCloseTo(0, 1)
    }
    expect(fittedLinePattern('dash', 3, { length: 200, lead: 0, shared: false })!.dashoffset).toBe(
      0,
    )
  })

  it('ends with the end of a dash, the dashes stretched a little to fit', () => {
    for (const pattern of ['dash', 'dot', 'dash-dot', 'dash-dot-dot'] as const) {
      for (const length of [37, 80, 151.5, 400]) {
        const fitted = fittedLinePattern(pattern, 2, { length, lead: 5, shared: false })!
        const dashes = numbers(fitted.dasharray)
        const period = sum(fitted.dasharray)
        const seen = length - 5
        // whole periods and then the first dash
        const periods = (seen - dashes[0]!) / period
        expect(Math.abs(periods - Math.round(periods)), `${pattern} ${length}`).toBeLessThan(0.005)
        // never far from the pattern's own lengths
        const own = numbers(linePatternDash(pattern, 2)!.dasharray)
        expect(dashes[0]! / own[0]!, `${pattern} ${length}`).toBeGreaterThan(0.6)
        expect(dashes[0]! / own[0]!, `${pattern} ${length}`).toBeLessThan(1.5)
      }
    }
  })

  it('puts round dots whole at both ends', () => {
    const width = 4
    const fitted = fittedLinePattern('round-dot', width, { length: 100, lead: 0, shared: false })!
    expect(fitted.linecap).toBe('round')
    const period = sum(fitted.dasharray)
    // the first dot half a width in, the last half a width before the end
    expect(period - fitted.dashoffset).toBeCloseTo(width / 2, 1)
    const periods = (100 - width) / period
    expect(Math.abs(periods - Math.round(periods))).toBeLessThan(0.01)
  })

  it('keeps the dashes of a line that shares its trunk as they are', () => {
    const fitted = fittedLinePattern('dash', 3, { length: 133, lead: 6, shared: true })!
    expect(fitted.dasharray).toBe(linePatternDash('dash', 3)!.dasharray)
    const period = sum(fitted.dasharray)
    expect((fitted.dashoffset + 6) % period).toBeCloseTo(0, 1)
  })

  it('a line too short for two dashes is one dash; a solid line has none', () => {
    const fitted = fittedLinePattern('dash', 3, { length: 10, lead: 0, shared: false })!
    expect(numbers(fitted.dasharray)[0]).toBeCloseTo(10, 5)
    expect(fittedLinePattern('solid', 3, { length: 100, lead: 0, shared: false })).toBeNull()
  })
})
