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
  mainBranchDrawings,
  mainBranchPath,
  subBranchDrawing,
  subBranchDrawings,
  subBranchPath,
  taperBaseWidth,
  taperedBranchPath,
  timelineStepDrawing,
  TREE_INDENT,
  TREE_TRUNK,
  treeBranchDrawings,
  treeBranchPath,
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
    for (const shape of ['straight', 'elbow', 'roundedElbow', 'none'] as const) {
      const d = mainBranchPath(line, main, { shape })
      expect(d, shape).toContain(`H ${main.cL + main.cW}`)
      const below = subBranchPath(line, sub, { shape })
      expect(below, shape).toContain(`H ${sub.cL + sub.cW - line.subPadX}`)
    }
    // with no line, only the underline is drawn
    expect(mainBranchPath(line, main, { shape: 'none' })).toMatch(/^M [\d.]+ [\d.]+ H [\d.]+$/)
  })

  it('in the line skeleton a curve with an arrow points from the far end of the underline', () => {
    for (const [drawing, far, way] of [
      [mainBranchDrawing(line, main, { shape: 'arrowedCurve', width: 4 }), main.cL + main.cW, 1],
      [
        mainBranchDrawing(line, { ...main, cL: 150, direction: 'lhs' }, { shape: 'arrowedCurve' }),
        150,
        -1,
      ],
      [subBranchDrawing(line, sub, { shape: 'arrowedCurve' }), sub.cL + sub.cW - line.subPadX, 1],
    ] as const) {
      const head = pairs(drawing.head!)
      const tip = head.find((point) => point.x === far)!
      expect(tip).toBeDefined()
      // the head lies along the underline, at its height (the curve ends there, then `H` runs on)
      expect(drawing.d).toMatch(/ H [\d.]+$/)
      expect(tip.y).toBe(numbers(drawing.d).at(-2))
      const base = head.filter((point) => point !== tip)
      for (const point of base) expect(Math.sign(far - point.x)).toBe(way)
      // the underline stops inside the head, at or past its base
      const end = numbers(drawing.d).at(-1)!
      expect(Math.sign(far - end)).toBe(way)
      expect(Math.abs(far - end)).toBeLessThanOrEqual(Math.abs(far - base[0]!.x))
    }
  })

  it('a line of round dots stops a gap before its arrowhead, so its last dot shows whole', () => {
    const width = 6
    const dots = mainBranchDrawing(pill, main, {
      shape: 'arrowedCurve',
      width,
      pattern: 'round-dot',
    })
    const base = Math.min(...pairs(dots.head!).map((point) => point.x))
    const [ex] = numbers(dots.d).slice(-2)
    // the last dot sits half its width in from the end: its edge is clear of the base
    expect(ex).toBeLessThanOrEqual(base - width)
    // a solid line still ends inside the base
    const solid = mainBranchDrawing(pill, main, { shape: 'arrowedCurve', width })
    expect(numbers(solid.d).at(-2)!).toBeGreaterThan(base)
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

  /** The dashes a fitted pattern draws along a line of this length, each as [from, to]. */
  const drawnDashes = (fitted: { dasharray: string; dashoffset: number }, length: number) => {
    const list = numbers(fitted.dasharray)
    const total = list.reduce((sum, value) => sum + value, 0)
    const on: Array<[number, number]> = []
    // where along the line the list starts: back by the offset, then round again and again
    for (let from = -fitted.dashoffset; from < length; from += total) {
      let at = from
      list.forEach((value, place) => {
        if (place % 2 === 0 && at + value >= 0 && at <= length) on.push([at, at + value])
        at += value
      })
    }
    return on
  }

  it('ends with the end of a dash, the dashes stretched a little to fit', () => {
    for (const pattern of ['dash', 'dot', 'dash-dot', 'dash-dot-dot'] as const) {
      for (const length of [37, 80, 151.5, 400]) {
        const fitted = fittedLinePattern(pattern, 2, { length, lead: 5, shared: false })!
        const what = `${pattern} ${length}`
        // what lies under the topic is not seen
        const on = drawnDashes(fitted, length).filter(([, to]) => to > 5.001)
        // the first dash starts where the line comes out, the last one ends with the line
        expect(on[0]![0], what).toBeCloseTo(5, 3)
        expect(on.at(-1)![1], what).toBeCloseTo(length, 2)
        // never far from the pattern's own lengths
        const own = numbers(linePatternDash(pattern, 2)!.dasharray)
        for (const [from, to] of on) {
          const ratio = (to - from) / Math.min(...own.filter((_, at) => at % 2 === 0))
          expect(ratio, what).toBeGreaterThan(0.6)
        }
        expect((on[0]![1] - on[0]![0]) / own[0]!, what).toBeLessThan(1.5)
      }
    }
  })

  it('keeps the first period as it is on a longer line, so lines leaving one topic start alike', () => {
    const own = numbers(linePatternDash('dash-dot', 3)!.dasharray)
    const starts = [120, 157, 233].map((length) => {
      const fitted = fittedLinePattern('dash-dot', 3, { length, lead: 0, shared: false })!
      const on = drawnDashes(fitted, length)
      expect(on.at(-1)![1]).toBeCloseTo(length, 2)
      return numbers(fitted.dasharray).slice(0, own.length)
    })
    for (const start of starts) expect(start).toEqual(own)
    // a long line of fine dots is stretched all along, its list kept short
    const long = fittedLinePattern('dot', 1, { length: 2000, lead: 0, shared: false })!
    expect(numbers(long.dasharray)).toHaveLength(2)
  })

  it('puts round dots whole at both ends', () => {
    const width = 4
    for (const length of [30, 100]) {
      const fitted = fittedLinePattern('round-dot', width, { length, lead: 0, shared: false })!
      expect(fitted.linecap).toBe('round')
      // the first dot half a width in, the last half a width before the end
      const on = drawnDashes(fitted, length)
      expect(on[0]![0]).toBeCloseTo(width / 2, 3)
      expect(on.at(-1)![1]).toBeCloseTo(length - width / 2, 3)
    }
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

/** The straight pieces of a path of absolute `M`, `H`, `V`, `L`, `Q` and `C` commands. */
function straightPieces(d: string): Array<{ from: Point; to: Point }> {
  const pieces: Array<{ from: Point; to: Point }> = []
  let here: Point = { x: 0, y: 0 }
  for (const [, command, args] of d.matchAll(/([MHVLQC])([^MHVLQC]*)/g)) {
    const values = numbers(args!)
    if (command === 'M') here = { x: values[0]!, y: values[1]! }
    else if (command === 'Q' || command === 'C') here = { x: values.at(-2)!, y: values.at(-1)! }
    else {
      const to =
        command === 'H'
          ? { x: values[0]!, y: here.y }
          : command === 'V'
            ? { x: here.x, y: values[0]! }
            : { x: values[0]!, y: values[1]! }
      pieces.push({ from: here, to })
      here = to
    }
  }
  return pieces
}

type Stretch = [number, number]

/** The stretches of the paths' straight pieces along `axis` at `at` (a vertical line at x, or a level one at y). */
function stretchesOn(paths: readonly string[], axis: 'x' | 'y', at: number): Stretch[] {
  const other = axis === 'x' ? 'y' : 'x'
  return paths.flatMap((d) =>
    straightPieces(d)
      .filter(
        (piece) => Math.abs(piece.from[axis] - at) < 0.01 && Math.abs(piece.to[axis] - at) < 0.01,
      )
      .map((piece): Stretch => [
        Math.min(piece.from[other], piece.to[other]),
        Math.max(piece.from[other], piece.to[other]),
      ]),
  )
}

/** How much of the stretches lies on top of another. */
function overlap(stretches: readonly Stretch[]): number {
  let total = 0
  stretches.forEach(([low, high], at) => {
    for (const [otherLow, otherHigh] of stretches.slice(at + 1)) {
      total += Math.max(0, Math.min(high, otherHigh) - Math.max(low, otherLow))
    }
  })
  return total
}

/** The lowest and highest point the stretches reach. */
const reach = (stretches: readonly Stretch[]): Stretch => [
  Math.min(...stretches.map(([low]) => low)),
  Math.max(...stretches.map(([, high]) => high)),
]

/** The last point of a path, as written. */
const lastPoint = (d: string): string[] => d.split(' ').slice(-2)

describe('lines that share a trunk, drawn together', () => {
  // a main topic with five topics below it, the middle one level with it
  const parent = { pT: 100, pL: 0, pW: 100, pH: 30, direction: 'rhs', isFirst: true }
  const boxes: BranchBoxes[] = [-60, 20, 100, 180, 260].map((cT) => ({
    ...parent,
    cT,
    cL: 160,
    cW: 120,
    cH: 30,
  }))
  const ex = 160 + block.subPadX
  const trunk = (100 + ex) / 2

  for (const shape of ['elbow', 'roundedElbow'] as const) {
    it(`each ${shape} draws only its own piece of the trunk, and together they draw the whole`, () => {
      const items = boxes.map((box) => ({ box, line: { shape } }))
      const together = subBranchDrawings(block, items).map((drawing) => drawing.d)
      const alone = boxes.map((box) => subBranchPath(block, box, { shape }))
      // the line that turns nearest the parent is drawn whole, as before: here the level one
      expect(together[2]).toBe(alone[2])
      const drawn = stretchesOn(together, 'x', trunk)
      expect(overlap(drawn)).toBeCloseTo(0, 5)
      expect(overlap(stretchesOn(alone, 'x', trunk))).toBeGreaterThan(100)
      // together they reach as far along the trunk as the lines drawn alone, and each ends at its topic
      expect(reach(drawn)).toEqual(reach(stretchesOn(alone, 'x', trunk)))
      together.forEach((d, at) => expect(lastPoint(d)).toEqual(lastPoint(alone[at]!)))
      // the first below the level line starts with its own turn, where the piece from the parent ends
      const [startX, startY] = numbers(together[3]!)
      const sy = numbers(alone[2]!)[1]!
      expect(startY).toBe(sy)
      expect(startX).toBeLessThanOrEqual(trunk)
      expect(startX).toBeGreaterThanOrEqual(trunk - block.cornerRadius)
      // the one after it starts on the trunk, where that one turns off
      const [nextX, nextY] = numbers(together[4]!)
      expect(nextX).toBe(trunk)
      expect(nextY).toBeCloseTo(195 - (shape === 'elbow' ? 0 : block.cornerRadius), 5)
    })
  }

  it('a line that starts on the trunk counts only its own piece, with nothing under a topic', () => {
    const items = boxes.map((box) => ({
      box,
      line: { shape: 'elbow' as const, pattern: 'dash' as const },
    }))
    const drawings = subBranchDrawings(block, items)
    const alone = subBranchDrawing(block, boxes[4]!, { shape: 'elbow' })
    expect(drawings[4]!.length).toBeLessThan(alone.length)
    expect(drawings[4]!.length).toBeCloseTo(275 - 195 + (ex - trunk), 5)
    for (const drawing of drawings) {
      expect(drawing.lead).toBe(0)
      expect(drawing.shared).toBe(false)
      expect(drawing.head).toBeNull()
    }
  })

  it('lines from the centre split their trunk too, each side on its own', () => {
    const centre = { pT: 300, pL: 300, pW: 200, pH: 60 }
    const right: BranchBoxes[] = [150, 250, 350, 450].map((cT) => ({
      ...centre,
      cT,
      cL: 600,
      cW: 90,
      cH: 32,
      direction: 'rhs',
    }))
    const left = right.map((box) => ({ ...box, cL: 110, direction: 'lhs' }))
    const items = [...right, ...left].map((box) => ({
      box,
      line: { shape: 'roundedElbow' as const },
    }))
    const drawings = mainBranchDrawings(pill, items)
    const rightTrunk = (500 - pill.centralInset + 600) / 2
    const leftTrunk = (300 + pill.centralInset + 200) / 2
    for (const [at, part] of [
      [rightTrunk, drawings.slice(0, 4)],
      [leftTrunk, drawings.slice(4)],
    ] as const) {
      const drawn = stretchesOn(
        part.map((drawing) => drawing.d),
        'x',
        at,
      )
      expect(drawn).toHaveLength(4)
      expect(overlap(drawn)).toBeCloseTo(0, 5)
    }
    // only the line that leaves the centre on each side starts under it
    expect(drawings.filter((drawing) => drawing.lead > 0)).toHaveLength(2)
  })

  it('downward, the lines split the trunk that runs across', () => {
    const items = [100, 300, 500, 700].map((cL) => ({
      box: { ...down, cL, cT: 260 },
      line: { shape: 'roundedElbow' as const },
    }))
    const together = subBranchDrawings(pill, items).map((drawing) => drawing.d)
    const across = stretchesOn(together, 'y', (160 + 260) / 2)
    expect(across).toHaveLength(4)
    expect(overlap(across)).toBeCloseTo(0, 5)
  })

  it('lines of other shapes, and elbows on trunks of their own, are drawn whole', () => {
    const shapes = ['curve', 'elbow', 'straight', 'roundedElbow', 'arrowedCurve'] as const
    const items = boxes.map((box, at) => ({
      box: { ...box, cL: 160 + at * 30 },
      line: { shape: shapes[at]! },
    }))
    expect(subBranchDrawings(block, items).map((drawing) => drawing.d)).toEqual(
      items.map((item) => subBranchPath(block, item.box, item.line)),
    )
  })

  it('a map without line values draws the same shape as before', () => {
    const items = boxes.map((box) => ({ box }))
    for (const geometry of [pill, block, line]) {
      const together = subBranchDrawings(geometry, items).map((drawing) => drawing.d)
      const alone = boxes.map((box) => subBranchPath(geometry, box))
      // the theme's curves share nothing; its rounded elbows share a trunk, drawn once
      if (geometry.subShape === 'curve') expect(together).toEqual(alone)
      else expect(together[2]).toBe(alone[2])
    }
  })
})

describe('the branches of a tree, drawn together', () => {
  const parent = { pT: 0, pL: 0, pW: 160, pH: 40, direction: 'rhs' }
  const boxes: BranchBoxes[] = [80, 140, 200].map((cT) => ({
    ...parent,
    cT,
    cL: TREE_INDENT,
    cW: 120,
    cH: 30,
  }))

  it('the first runs from the top of the trunk; each other one from where the one above turns off', () => {
    const items = boxes.map((box) => ({ box, from: 'central' as const }))
    const drawings = treeBranchDrawings(pill, items)
    expect(drawings[0]!.d).toBe(treeBranchPath(pill, boxes[0]!, 'central'))
    const drawn = stretchesOn(
      drawings.map((drawing) => drawing.d),
      'x',
      TREE_TRUNK,
    )
    expect(overlap(drawn)).toBeCloseTo(0, 5)
    expect(reach(drawn)[0]).toBe(parent.pH - pill.centralInset)
    // the second starts where the first begins its corner
    expect(numbers(drawings[1]!.d).slice(0, 2)).toEqual([TREE_TRUNK, 95 - 8])
    drawings.forEach((drawing, at) =>
      expect(lastPoint(drawing.d)).toEqual(lastPoint(treeBranchPath(pill, boxes[at]!, 'central'))),
    )
    // only the first starts under the central topic; a pattern is fitted to each
    expect(drawings.map((drawing) => drawing.lead)).toEqual([pill.centralInset, 0, 0])
    expect(drawings.every((drawing) => !drawing.shared && drawing.length > 0)).toBe(true)
  })

  it('in the line skeleton each runs on under its topic', () => {
    const drawings = treeBranchDrawings(
      line,
      boxes.map((box) => ({ box, from: 'sub' as const })),
    )
    for (const drawing of drawings) {
      expect(drawing.d).toMatch(new RegExp(` H ${TREE_INDENT + 120 - line.subPadX}$`))
    }
  })
})

describe('a step of a timeline', () => {
  const step: BranchBoxes = {
    pT: 0,
    pL: 0,
    pW: 100,
    pH: 30,
    cT: 0,
    cL: 150,
    cW: 90,
    cH: 30,
    direction: 'rhs',
  }

  it('draws its arrowhead apart, the line stopping at its base', () => {
    const drawing = timelineStepDrawing(pill, step, false)
    expect(drawing.d).toMatch(/^M 100 15 C [\d. ]+$/)
    expect(numbers(drawing.d).slice(-2)).toEqual([142, 15])
    // the head: the last piece of the line, and an open point just before the main topic
    expect(drawing.arrow).toBe('M 142 15 L 148 15 M 142 10.8 L 148 15 L 142 19.2')
    expect(drawing.length).toBeCloseTo(42, 5)
    expect(drawing.shared).toBe(false)
    // from the central topic the line starts hidden under its edge
    const first = timelineStepDrawing(pill, step, true)
    expect(numbers(first.d)[0]).toBe(100 - pill.centralInset)
    expect(first.lead).toBe(pill.centralInset)
    // in the line skeleton the main topic sits on its line
    expect(timelineStepDrawing(line, step, false).d).toMatch(/ M 150 [\d.]+ H 240$/)
  })

  it('a wide line has a larger head; round dots stop a gap before it', () => {
    const wide = timelineStepDrawing(pill, step, false, { width: 4 })
    expect(numbers(wide.arrow).slice(0, 2)).toEqual([138, 15])
    const dots = timelineStepDrawing(pill, step, false, { width: 4, pattern: 'round-dot' })
    expect(numbers(dots.d).at(-2)).toBeCloseTo(134, 5)
    expect(numbers(dots.arrow).slice(0, 2)).toEqual([138, 15])
  })
})
