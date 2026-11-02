/**
 * The shapes of what hangs on no branch, as pure functions: the values a
 * relationship, a summary bracket and a boundary are drawn with (through the
 * filter), the path of each relationship shape and of each end, the saved
 * curve and the library's control points, the bracket shapes and the
 * boundary shapes.
 */
import { describe, expect, it } from 'vitest'
import {
  ARROW_SHAPE_PREFIX,
  ARROW_SHAPES,
  BOUNDARY_SHAPE_PREFIX,
  BOUNDARY_SHAPES,
  RELATIONSHIP_SHAPE_PREFIX,
  SUMMARY_SHAPE_PREFIX,
  SUMMARY_SHAPES,
} from '@genoffice/xmind-engine'
import {
  arrowMarker,
  borderPoint,
  curveToDeltas,
  deltasToCurve,
  endsGap,
  fitDashes,
  labelAlong,
  labelSpot,
  markerReach,
  markerSize,
  pathLength,
  pointAlong,
  relationshipArrowStyle,
  relationshipDrawing,
  relationshipGeometry,
  relationshipPaint,
  trimPath,
  zigzagMeasure,
} from '../src/renderer/map/relationship-shapes'
import {
  parseSummaryFrame,
  summaryBracketPath,
  summaryPaint,
} from '../src/renderer/map/summary-shapes'
import {
  BOUNDARY_NEST_GAP,
  BOUNDARY_PAD,
  BOUNDARY_SIDE_GAP,
  BOUNDARY_TITLE_HEIGHT,
  boundaryExtent,
  boundaryOutlines,
  boundaryPaint,
  boundaryPath,
  boundaryPieces,
  boundaryReach,
  boundaryTitlePlace,
  TITLE_INSET,
} from '../src/renderer/map/boundary-shapes'
import type { BoundaryShape } from '../src/renderer/map/style-values'

const rel = (word: string) => `${RELATIONSHIP_SHAPE_PREFIX}${word}`
const arrow = (word: string) => `${ARROW_SHAPE_PREFIX}${word}`

/** The numbers of a path, in order. */
const numbers = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)

describe('the values a relationship is drawn with', () => {
  it('a relationship without values is drawn as before, and says so', () => {
    expect(relationshipPaint(undefined)).toEqual({
      shape: 'curved',
      begin: 'none',
      end: 'normal',
      color: null,
      width: null,
      pattern: null,
      plain: true,
    })
    expect(relationshipArrowStyle(relationshipPaint({}))).toBeUndefined()
  })

  it('takes the file values through the filter', () => {
    const paint = relationshipPaint({
      shape: rel('zigzag'),
      begin: arrow('diamond'),
      end: arrow('none'),
      color: '#AABBCC',
      width: '3pt',
      pattern: 'dot',
    })
    expect(paint).toEqual({
      shape: 'zigzag',
      begin: 'diamond',
      end: 'none',
      color: '#aabbcc',
      width: 3,
      pattern: 'dot',
      plain: false,
    })
    expect(relationshipArrowStyle(paint)).toEqual({
      stroke: '#aabbcc',
      strokeWidth: 3,
      strokeDasharray: '3 3',
    })
  })

  it('a solid line asks the library for no dashes at all', () => {
    expect(relationshipArrowStyle(relationshipPaint({ pattern: 'solid' }))).toEqual({
      strokeDasharray: 'none',
    })
  })

  it('an end of another program is drawn as the normal end; values that are not values are not drawn', () => {
    for (const word of [
      'ring',
      'eye',
      'doublearrow',
      'squarering',
      'antiTriangle',
      'attached',
      'hook',
      'what',
    ]) {
      expect(relationshipPaint({ end: arrow(word) }).end, word).toBe('normal')
      expect(relationshipPaint({ begin: arrow(word) }).begin, word).toBe('normal')
    }
    const hostile = relationshipPaint({
      shape: 'url(https://evil.example/)',
      begin: 'javascript:alert(1)',
      end: '<b>',
      color: 'red; background:url(x)',
      width: 'calc(10px)',
      pattern: 'dash; x',
    })
    expect(hostile).toEqual({
      shape: 'curved',
      begin: 'none',
      end: 'normal',
      color: null,
      width: null,
      pattern: null,
      plain: true,
    })
    // another program's shape word: drawn curved
    expect(relationshipPaint({ shape: rel('elbow') }).shape).toBe('curved')
  })
})

describe('the path of each relationship shape', () => {
  const ends = {
    from: { cx: 0, cy: 0, w: 40, h: 20 },
    to: { cx: 200, cy: 100, w: 40, h: 20 },
    c1: { x: 60, y: 0 },
    c2: { x: 140, y: 100 },
  }

  it('curved: through the two control points, from border to border', () => {
    const shape = relationshipGeometry('curved', ends)
    expect(shape.d).toBe('M 20 0 C 60 0 140 100 180 100')
    expect(shape.begin).toEqual({ tip: { x: 20, y: 0 }, from: { x: 60, y: 0 } })
    expect(shape.end).toEqual({ tip: { x: 180, y: 100 }, from: { x: 140, y: 100 } })
    expect(shape.label).toEqual({ x: 100, y: 50 })
  })

  it('straight: one line between the two boxes', () => {
    const shape = relationshipGeometry('straight', ends)
    expect(shape.d).toMatch(/^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/)
    const [x1, y1, x2, y2] = numbers(shape.d)
    // on the border of each box, on the line between the centres
    expect(x1).toBeCloseTo(20)
    expect(y1).toBeCloseTo(10)
    expect(x2).toBeCloseTo(180)
    expect(y2).toBeCloseTo(90)
    expect(shape.end.from).toEqual(shape.begin.tip)
  })

  it('angled: leaves level, turns, arrives level', () => {
    const shape = relationshipGeometry('angled', ends)
    expect(shape.d).toBe('M 20 0 H 100 V 100 H 180')
    expect(shape.end).toEqual({ tip: { x: 180, y: 100 }, from: { x: 100, y: 100 } })
    expect(shape.begin).toEqual({ tip: { x: 20, y: 0 }, from: { x: 100, y: 0 } })
    // more down than across: leaves upright instead
    const tall = relationshipGeometry('angled', { ...ends, to: { cx: 20, cy: 300, w: 40, h: 20 } })
    expect(tall.d).toBe('M 0 10 V 150 H 20 V 290')
  })

  it('zigzag: straight at both ends, zigzag between', () => {
    const shape = relationshipGeometry('zigzag', ends)
    expect(shape.d.startsWith('M ')).toBe(true)
    const points = numbers(shape.d)
    expect(points.length / 2).toBeGreaterThan(5)
    const [x1, y1] = points
    const [x2, y2] = points.slice(-2)
    expect(x1).toBeCloseTo(20)
    expect(y1).toBeCloseTo(10)
    expect(x2).toBeCloseTo(180)
    expect(y2).toBeCloseTo(90)
    // the last piece is straight along the line, so the end points the way the line goes
    const { tip, from } = shape.end
    expect((tip.y - from.y) / (tip.x - from.x)).toBeCloseTo(80 / 160)
  })

  it('a point on the border is the one the library takes', () => {
    expect(borderPoint({ cx: 0, cy: 0, w: 40, h: 20 }, { x: 100, y: 0 })).toEqual({ x: 20, y: 0 })
    expect(borderPoint({ cx: 0, cy: 0, w: 40, h: 20 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 })
  })
})

describe('the ends of a relationship', () => {
  const tip = { x: 100, y: 50 }
  const from = { x: 0, y: 50 }

  it('every end a user can pick has a drawing of this app, none has none', () => {
    const drawn = new Set<string>()
    for (const kind of ARROW_SHAPES) {
      const marker = arrowMarker(kind, tip, from, 1.5)
      if (kind === 'none') {
        expect(marker).toBeNull()
        continue
      }
      expect(marker, kind).not.toBeNull()
      expect(marker!.d, kind).toMatch(/^M /)
      drawn.add(marker!.d)
      // the end reaches the tip: a filled one with its point, an open one with its round stroke
      const xs = numbers(marker!.d).filter((_, at) => at % 2 === 0)
      const reach = Math.max(...xs) + (marker!.filled ? 0 : 1.5 / 2)
      expect(reach, kind).toBeCloseTo(100, 1)
    }
    expect(drawn.size).toBe(ARROW_SHAPES.length - 1)
  })

  it('the normal end is the open arrowhead the library draws, its round point on the tip', () => {
    const marker = arrowMarker('normal', tip, from, 1.5)!
    expect(marker.filled).toBe(false)
    const [x1, y1, x, y, x2, y2] = numbers(marker.d)
    // half the line's width back, so the round join of the stroke ends on the tip
    expect([x, y]).toEqual([99.25, 50])
    expect(markerSize(1.5)).toBe(12)
    expect(x1).toBeCloseTo(99.25 - 12 * Math.cos(Math.PI / 6))
    expect(y1).toBeCloseTo(50 + 12 * Math.sin(Math.PI / 6))
    expect(x2).toBeCloseTo(99.25 - 12 * Math.cos(Math.PI / 6))
    expect(y2).toBeCloseTo(50 - 12 * Math.sin(Math.PI / 6))
    // the line meets it at its point
    expect(marker.inset).toBe(0.75)
    expect(marker.overlap).toBe(0)
  })

  it('the line stops inside each end, where the end is as wide as the line', () => {
    for (const width of [1, 1.5, 3, 6]) {
      const size = markerSize(width)
      const at = (kind: (typeof ARROW_SHAPES)[number]) => arrowMarker(kind, tip, from, width)!
      const overlap = Math.min(1, width / 2)
      expect(at('triangle').inset).toBeCloseTo(size - overlap)
      expect(at('spearhead').inset).toBeCloseTo(size * 0.65 - overlap)
      expect(at('square').inset).toBeCloseTo(size * 0.7 - overlap)
      // the herringbone's spine starts where the line stops, and ends half a width short of the tip
      const bone = at('herringbone')
      expect(bone.inset).toBeCloseTo(size * 1.1 - overlap)
      expect(numbers(bone.d).slice(0, 2)[0]).toBeCloseTo(100 - width / 2)
      // the dot and the diamond: where they are as wide as the line
      const r = size * 0.35
      expect(at('dot').inset).toBeCloseTo(r + Math.sqrt(r * r - (width / 2) ** 2) - overlap)
      const diamond = at('diamond')
      const halfAt = (back: number) => (0.35 / 0.5) * (size - back)
      expect(halfAt(diamond.inset + overlap)).toBeCloseTo(width / 2)
      for (const kind of ARROW_SHAPES) {
        if (kind === 'none') continue
        // the line never runs past the end it goes under
        expect(at(kind).inset, kind).toBeLessThanOrEqual(markerReach(kind, width))
        expect(at(kind).inset, kind).toBeGreaterThan(0)
      }
    }
  })

  it('ends grow with the width of the line', () => {
    expect(markerSize(1)).toBeLessThan(markerSize(1.5))
    expect(markerSize(3)).toBeLessThan(markerSize(6))
    expect(markerSize(6) / 6).toBeGreaterThan(4)
    expect(markerReach('none', 3)).toBe(0)
  })

  it('solid ends are filled, open ones are not', () => {
    for (const kind of ['spearhead', 'triangle', 'dot', 'square', 'diamond'] as const) {
      expect(arrowMarker(kind, tip, from, 1.5)!.filled, kind).toBe(true)
    }
    for (const kind of ['normal', 'herringbone'] as const) {
      expect(arrowMarker(kind, tip, from, 1.5)!.filled, kind).toBe(false)
    }
  })

  it('a wider line gets a larger end; an end with no direction is not drawn', () => {
    const thin = numbers(arrowMarker('triangle', tip, from, 1.5)!.d)
    const wide = numbers(arrowMarker('triangle', tip, from, 6)!.d)
    expect(Math.min(...wide.filter((_, at) => at % 2 === 0))).toBeLessThan(
      Math.min(...thin.filter((_, at) => at % 2 === 0)),
    )
    expect(arrowMarker('triangle', tip, tip, 1.5)).toBeNull()
  })
})

describe('the line between the ends', () => {
  const straight = {
    kind: 'polyline' as const,
    points: [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ],
  }
  const curve = {
    kind: 'cubic' as const,
    p1: { x: 0, y: 0 },
    c1: { x: 60, y: -80 },
    c2: { x: 140, y: 80 },
    p2: { x: 200, y: 0 },
  }

  it('a path is measured, walked and cut short at either end', () => {
    expect(pathLength(straight)).toBe(200)
    expect(pointAlong(straight, 30)).toEqual({ x: 30, y: 0 })
    expect(pointAlong(straight, 30, true)).toEqual({ x: 170, y: 0 })
    expect(trimPath(straight, 10, 20)).toEqual({
      kind: 'polyline',
      points: [
        { x: 10, y: 0 },
        { x: 180, y: 0 },
      ],
    })
    expect(trimPath(straight, 120, 100)).toBeNull()
    // an angled path keeps its corners
    const angled = {
      kind: 'polyline' as const,
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 50 },
      ],
    }
    expect(trimPath(angled, 5, 5)).toEqual({
      kind: 'polyline',
      points: [
        { x: 5, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 95, y: 50 },
      ],
    })
    // a curve stays a curve, its ends on the old one
    const cut = trimPath(curve, 15, 15)!
    expect(cut.kind).toBe('cubic')
    const total = pathLength(curve)
    expect(pathLength(cut)).toBeCloseTo(total - 30, 0)
    const start = pointAlong(curve, 15)
    if (cut.kind === 'cubic') {
      expect(cut.p1.x).toBeCloseTo(start.x, 1)
      expect(cut.p1.y).toBeCloseTo(start.y, 1)
    }
  })

  it('dashes are fitted so the line starts and ends with a dash', () => {
    const fitted = fitDashes([4, 2], 101)
    const period = fitted[0]! + fitted[1]!
    // whole repeats and then the first dash once more
    const repeats = (101 - fitted[0]!) / period
    expect(repeats).toBeCloseTo(Math.round(repeats))
    expect(fitted[0]! / fitted[1]!).toBeCloseTo(2)
    expect(fitDashes([4, 2], 5)).toEqual([])
    expect(fitDashes([0, 2], 10)).toEqual([0, 2])
  })

  it('the line stops under each end and the dashes meet each end', () => {
    for (const width of [1, 1.5, 3, 6]) {
      for (const kind of ['triangle', 'dot', 'normal', 'herringbone'] as const) {
        const paint = relationshipPaint({
          begin: arrow(kind),
          end: arrow(kind),
          width: `${width}pt`,
          pattern: 'dash',
          shape: rel('straight'),
        })
        const drawing = relationshipDrawing(paint, straight)
        const marker = arrowMarker(kind, { x: 200, y: 0 }, { x: 0, y: 0 }, paint.width!)!
        const [x1, , x2] = numbers(drawing.d)
        expect(x1, kind).toBeCloseTo(marker.inset)
        expect(200 - x2!, kind).toBeCloseTo(marker.inset)
        expect(drawing.end!.d).toBe(marker.d)
        // a dash comes out from under the first end and goes in under the last
        const dashes = drawing.dasharray.split(' ').map(Number)
        const period = dashes.reduce((sum, dash) => sum + dash, 0)
        const shown = x2! - x1! - 2 * marker.overlap
        // (the dashes are written to a hundredth of a pixel)
        const repeats = (shown - dashes[0]!) / period
        expect(Math.abs(repeats - Math.round(repeats)), kind).toBeLessThan(0.05)
        const phase = (drawing.dashoffset + marker.overlap) % period
        expect(Math.min(phase, period - phase), kind).toBeLessThan(0.05)
      }
    }
  })

  it('an end on a curve points along the curve over its length', () => {
    const paint = relationshipPaint({ end: arrow('triangle'), width: '6pt' })
    const drawing = relationshipDrawing(paint, curve)
    const reach = markerReach('triangle', paint.width!)
    const base = pointAlong(curve, reach, true)
    const [tx, ty, ax, ay, bx, by] = numbers(drawing.end!.d)
    // the middle of the triangle's back is on the curve (within a fraction of a pixel)
    expect(Math.hypot((ax! + bx!) / 2 - base.x, (ay! + by!) / 2 - base.y)).toBeLessThan(0.5)
    expect([tx, ty]).toEqual([200, 0])
    expect(drawing.begin).toBeNull()
  })

  it('a solid line, and the dashes a relationship always had', () => {
    const solid = relationshipDrawing(
      relationshipPaint({ pattern: 'solid', end: arrow('dot') }),
      straight,
    )
    expect(solid.dasharray).toBe('none')
    const plainDashes = relationshipDrawing(relationshipPaint({ end: arrow('dot') }), straight)
    const [dash, gap] = plainDashes.dasharray.split(' ').map(Number)
    expect(dash).toBeCloseTo(gap!)
    expect(dash).toBeGreaterThan(4)
    expect(dash).toBeLessThan(6)
  })

  it('a zigzag on a wider line swings wider and longer, and its ends are straight for the largest end', () => {
    const thin = zigzagMeasure(1.5)
    const wide = zigzagMeasure(6)
    expect(wide.step).toBeGreaterThan(thin.step)
    expect(wide.amplitude).toBeGreaterThan(thin.amplitude)
    for (const width of [1, 1.5, 3, 6]) {
      for (const kind of ARROW_SHAPES) {
        expect(zigzagMeasure(width).lead, kind).toBeGreaterThan(markerReach(kind, width))
      }
    }
    const ends = {
      from: { cx: 0, cy: 0, w: 40, h: 20 },
      to: { cx: 600, cy: 0, w: 40, h: 20 },
      c1: { x: 0, y: 0 },
      c2: { x: 0, y: 0 },
    }
    const shape = relationshipGeometry('zigzag', ends, 6)
    const ys = numbers(shape.d).filter((_, at) => at % 2 === 1)
    expect(Math.max(...ys)).toBeCloseTo(wide.amplitude)
    // the straight lead at the end takes the whole end
    const [tip, before] =
      shape.path.kind === 'polyline' ? shape.path.points.slice(-2).reverse() : []
    expect(tip!.x - before!.x).toBeGreaterThan(markerReach('herringbone', 6))
  })
})

describe('a short relationship', () => {
  const vertical = (length: number) => ({
    kind: 'polyline' as const,
    points: [
      { x: 0, y: 0 },
      { x: 0, y: length },
    ],
  })

  it('a zigzag with no room for two clean turns is drawn straight', () => {
    const between = (gap: number, width: number) =>
      relationshipGeometry(
        'zigzag',
        {
          from: { cx: 0, cy: 0, w: 40, h: 20 },
          to: { cx: 0, cy: 20 + gap, w: 40, h: 20 },
          c1: { x: 0, y: 0 },
          c2: { x: 0, y: 0 },
        },
        width,
      )
    for (const width of [1, 3, 6]) {
      const short = between(30, width)
      expect(short.path.kind === 'polyline' && short.path.points, String(width)).toHaveLength(2)
      const long = between(400, width)
      const points = long.path.kind === 'polyline' ? long.path.points : []
      // the straight ends, and at least two turns between them
      expect(points.length - 4, String(width)).toBeGreaterThanOrEqual(2)
    }
  })

  it('the two ends never meet: on a short line they are drawn smaller, a little line between them', () => {
    for (const width of [1, 3, 6]) {
      for (const length of [12, 20, 30, 45]) {
        const paint = relationshipPaint({
          begin: arrow('spearhead'),
          end: arrow('triangle'),
          width: `${width}pt`,
          shape: rel('straight'),
        })
        const drawing = relationshipDrawing(paint, vertical(length))
        const reach = (marker: typeof drawing.begin, kind: 'spearhead' | 'triangle') => {
          if (!marker) return 0
          const ys = numbers(marker.d).filter((_, at) => at % 2 === 1)
          return kind === 'spearhead' ? Math.max(...ys) : length - Math.min(...ys)
        }
        const used = reach(drawing.begin, 'spearhead') + reach(drawing.end, 'triangle')
        expect(used, `${width} ${length}`).toBeLessThanOrEqual(length - endsGap(width) + 0.01)
      }
    }
    // a line long enough keeps its ends at their size
    const paint = relationshipPaint({ end: arrow('triangle'), width: '3pt' })
    const long = relationshipDrawing(paint, vertical(200))
    const full = arrowMarker('triangle', { x: 0, y: 200 }, { x: 0, y: 0 }, 3)!
    expect(long.end!.d).toBe(full.d)
  })

  it('each end has room its title keeps clear of, drawn or not', () => {
    const paint = relationshipPaint({ begin: arrow('dot'), end: arrow('none'), width: '3pt' })
    const drawing = relationshipDrawing(paint, vertical(200))
    expect(drawing.endBoxes).toHaveLength(2)
    const [begin, end] = drawing.endBoxes
    // around the dot at the start, as long as it reaches
    expect(begin!.y).toBeLessThan(0)
    expect(begin!.y + begin!.h).toBeGreaterThanOrEqual(markerReach('dot', 3))
    // a small room at an end without a drawing
    expect(end!.y).toBeLessThan(200)
    expect(end!.y + end!.h).toBeGreaterThan(200)
    expect(end!.h).toBeLessThan(10)
  })
})

describe('where a relationship’s title goes', () => {
  const line = {
    kind: 'polyline' as const,
    points: [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
    ],
  }
  const size = { w: 60, h: 16 }

  it('in the middle when it covers no topic there', () => {
    expect(labelAlong(line, size, [])).toEqual({ x: 150, y: 0 })
  })

  it('at the nearest place along the line where it covers none', () => {
    const topic = { x: 130, y: -10, w: 60, h: 20 }
    const at = labelAlong(line, size, [topic])
    expect(at.y).toBe(0)
    expect(at.x + size.w / 2 + 3).toBeLessThanOrEqual(topic.x)
    // the nearest: just clear of the topic
    expect(at.x).toBeGreaterThan(topic.x - size.w / 2 - 3 - 3)
  })

  it('in the middle when nothing is free anywhere', () => {
    const everywhere = { x: -1000, y: -1000, w: 3000, h: 3000 }
    expect(labelAlong(line, size, [everywhere])).toEqual({ x: 150, y: 0 })
    expect(labelSpot(line, size, [everywhere]).moved).toBe(false)
  })

  it('never on an end of its line: along it, or beside its middle when the line is short', () => {
    const ends = [
      { x: -2, y: -8, w: 20, h: 16 },
      { x: 282, y: -8, w: 20, h: 16 },
    ]
    // a long line: the middle is free of the ends
    expect(labelSpot(line, size, [], ends)).toEqual({ at: { x: 150, y: 0 }, moved: false })
    // a line shorter than its title: beside the middle, clear of both ends and of the line
    const short = {
      kind: 'polyline' as const,
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 40 },
      ],
    }
    const shortEnds = [
      { x: -8, y: -2, w: 16, h: 18 },
      { x: -8, y: 24, w: 16, h: 18 },
    ]
    const spot = labelSpot(short, size, [], shortEnds)
    expect(spot.moved).toBe(true)
    const box = { x: spot.at.x - size.w / 2, y: spot.at.y - size.h / 2, ...size }
    for (const end of shortEnds) {
      expect(box.x >= end.x + end.w || box.x + box.w <= end.x).toBe(true)
    }
    expect(spot.at.y).toBeCloseTo(20)
  })

  it('a title on a topic in the middle of a curve moves along the curve', () => {
    const curve = {
      kind: 'cubic' as const,
      p1: { x: 0, y: 0 },
      c1: { x: 100, y: 0 },
      c2: { x: 200, y: 0 },
      p2: { x: 300, y: 0 },
    }
    const topic = { x: 120, y: -20, w: 60, h: 40 }
    const spot = labelSpot(curve, size, [topic])
    expect(spot.moved).toBe(true)
    expect(spot.at.x + size.w / 2 <= topic.x || spot.at.x - size.w / 2 >= topic.x + topic.w).toBe(
      true,
    )
  })
})

describe('the saved curve and the library’s control points', () => {
  it('a curve measured from each end topic is the library’s offsets from each box centre', () => {
    const curve = { from: { x: 128.5, y: -50 }, to: { x: -12, y: 33.25 } }
    const deltas = curveToDeltas(curve)
    expect(deltas).toEqual({ delta1: { x: 128.5, y: -50 }, delta2: { x: -12, y: 33.25 } })
    expect(deltasToCurve(deltas.delta1, deltas.delta2)).toEqual(curve)
  })

  it('goes there and back without change', () => {
    for (const curve of [
      { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
      { from: { x: -300, y: 12 }, to: { x: 7, y: -99.5 } },
      { from: { x: 1e6, y: -1e6 }, to: { x: 0.001, y: 3 } },
    ]) {
      const { delta1, delta2 } = curveToDeltas(curve)
      expect(deltasToCurve(delta1, delta2)).toEqual(curve)
      const again = curveToDeltas(deltasToCurve(delta1, delta2))
      expect(again).toEqual({ delta1, delta2 })
    }
  })

  it('the deltas are copies: moving the library’s points does not move the saved curve', () => {
    const curve = { from: { x: 1, y: 2 }, to: { x: 3, y: 4 } }
    const { delta1 } = curveToDeltas(curve)
    delta1.x = 99
    expect(curve.from.x).toBe(1)
  })
})

describe('the bracket of a summary', () => {
  // the paths the library draws, for the three sides
  const right = 'M 290 20 c 5 0 10 5 10 10 L 300 110 c 0 5 -5 10 -10 10 M 300 70 h 10'
  const left = 'M 110 20 c -5 0 -10 5 -10 10 L 100 110 c 0 5 5 10 10 10 M 100 70 h -10'
  const down = 'M 20 190 c 0 5 5 10 10 10 L 290 200 c 5 0 10 -5 10 -10 M 160 200 v 10'

  it('reads where the library put the bracket', () => {
    expect(parseSummaryFrame(right)).toEqual({
      side: 'right',
      spine: 300,
      from: 20,
      to: 120,
      mid: 70,
    })
    expect(parseSummaryFrame(left)).toEqual({
      side: 'left',
      spine: 100,
      from: 20,
      to: 120,
      mid: 70,
    })
    expect(parseSummaryFrame(down)).toEqual({
      side: 'down',
      spine: 200,
      from: 20,
      to: 300,
      mid: 160,
    })
    expect(parseSummaryFrame('M 0 0 L 10 10')).toBeNull()
  })

  it('no shape, another word or a value that is not one: the bracket as before', () => {
    expect(summaryPaint(undefined).shape).toBeNull()
    expect(summaryPaint({ shape: `${SUMMARY_SHAPE_PREFIX}whatever` }).shape).toBeNull()
    expect(summaryPaint({ shape: 'url(x)' }).shape).toBeNull()
    expect(summaryPaint({ shape: `${SUMMARY_SHAPE_PREFIX}curly` }).shape).toBe('curly')
  })

  it('every shape a user can pick has a path of its own, inside the room of the bracket', () => {
    const frame = parseSummaryFrame(right)!
    const paths = new Set<string>()
    for (const shape of SUMMARY_SHAPES) {
      const d = summaryBracketPath(shape, frame)
      expect(d, shape).toMatch(/^M /)
      paths.add(d)
      const xs = numbers(d).filter((_, at) => at % 2 === 0)
      const ys = numbers(d).filter((_, at) => at % 2 === 1)
      // between the topics and the title: from 10 before the spine to 10 past it
      expect(Math.min(...xs), shape).toBeGreaterThanOrEqual(290)
      expect(Math.max(...xs), shape).toBeLessThanOrEqual(310)
      expect(Math.min(...ys), shape).toBeGreaterThanOrEqual(20)
      expect(Math.max(...ys), shape).toBeLessThanOrEqual(120)
    }
    expect(paths.size).toBe(SUMMARY_SHAPES.length)
  })

  it('every shape reaches as far towards the title as the library’s stem, so the title stands as near each', () => {
    const frame = parseSummaryFrame(right)!
    for (const shape of SUMMARY_SHAPES) {
      const xs = numbers(summaryBracketPath(shape, frame)).filter((_, at) => at % 2 === 0)
      expect(Math.max(...xs), shape).toBe(310)
    }
  })

  it('the bracket keeps to its side: to the left and downward it is mirrored', () => {
    const toLeft = numbers(summaryBracketPath('angle', parseSummaryFrame(left)!))
    expect(toLeft).toEqual([110, 20, 90, 70, 110, 120])
    const downward = numbers(summaryBracketPath('angle', parseSummaryFrame(down)!))
    expect(downward).toEqual([20, 190, 160, 210, 300, 190])
  })
})

describe('the values and shapes of a boundary', () => {
  const box = { x: 100, y: 50, w: 200, h: 80 }

  it('a boundary without values: rounded, the relationship colour, no fill of its own', () => {
    expect(boundaryPaint(undefined)).toEqual({
      shape: 'roundedRect',
      color: null,
      width: null,
      pattern: null,
      fill: null,
    })
  })

  it('takes the file values through the filter; another program’s shape is rounded', () => {
    expect(
      boundaryPaint({
        shape: `${BOUNDARY_SHAPE_PREFIX}waves`,
        color: '#123456',
        width: '4pt',
        pattern: 'dash',
        fill: '#ABCDEF',
      }),
    ).toEqual({ shape: 'waves', color: '#123456', width: 4, pattern: 'dash', fill: '#abcdef' })
    expect(boundaryPaint({ fill: 'none' }).fill).toBe('none')
    for (const word of ['newboundary1', 'newboundary2', 'newboundary3', 'focus', 'cross', 'x']) {
      expect(boundaryPaint({ shape: `${BOUNDARY_SHAPE_PREFIX}${word}` }).shape, word).toBe(
        'roundedRect',
      )
    }
    expect(boundaryPaint({ fill: 'url(https://evil.example/)', color: 'expression(1)' })).toEqual({
      shape: 'roundedRect',
      color: null,
      width: null,
      pattern: null,
      fill: null,
    })
  })

  it('every shape has a closed path of its own around the box', () => {
    const paths = new Set<string>()
    for (const shape of BOUNDARY_SHAPES) {
      const d = boundaryPath(shape, box)
      expect(d, shape).toMatch(/^M [\s\S]* Z$/)
      paths.add(d)
      const xs = numbers(d).filter((_, at) => at % 2 === 0)
      // reaches the sides of the box (arcs carry flags, so only the reach is checked)
      expect(Math.min(...xs), shape).toBeLessThanOrEqual(100)
      expect(Math.max(...xs), shape).toBeGreaterThanOrEqual(300)
    }
    expect(paths.size).toBe(BOUNDARY_SHAPES.length)
    expect(boundaryPath('rect', box)).toBe('M 100 50 H 300 V 130 H 100 Z')
  })

  it('one outline per group of boxes; the title only on the first', () => {
    const pieces = boundaryPieces([
      [
        { x: 10, y: 10, w: 50, h: 20 },
        { x: 30, y: 40, w: 50, h: 20 },
      ],
      [],
      [{ x: -200, y: 0, w: 40, h: 10 }],
    ])
    expect(pieces).toEqual([
      { content: { x: 10, y: 10, w: 70, h: 50 }, withTitle: true },
      { content: { x: -200, y: 0, w: 40, h: 10 }, withTitle: false },
    ])
    expect(boundaryPieces([[], []])).toEqual([])
  })
})

describe('where the outlines of a map go', () => {
  const content = { x: 100, y: 100, w: 100, h: 60 }
  const one = (shape: BoundaryShape, withTitle = false) => ({ content, shape, withTitle })

  it('each stands the same way off its boxes on every side', () => {
    expect(boundaryOutlines([one('rect')])).toEqual([
      {
        x: 100 - BOUNDARY_PAD,
        y: 100 - BOUNDARY_PAD,
        w: 100 + 2 * BOUNDARY_PAD,
        h: 60 + 2 * BOUNDARY_PAD,
      },
    ])
    // a six-sided one less at its sides, where its points stand out: as far off at both ends
    const [hexagon] = boundaryOutlines([one('roundedPolygon')])
    expect(hexagon!.x - 100).toBeCloseTo(-(hexagon!.x + hexagon!.w - 200))
    const drawn = boundaryExtent('roundedPolygon', hexagon!)
    expect(100 - drawn.x).toBeLessThan(2 * BOUNDARY_PAD)
    // sides drawn inward stand further off, so they do not come nearer than the others
    const [tension] = boundaryOutlines([one('tension')])
    expect(tension!.x).toBeLessThan(100 - BOUNDARY_PAD)
  })

  it('one with a title has room under its top edge for the title written on it', () => {
    const [titled] = boundaryOutlines([one('rect', true)])
    expect(100 - titled!.y).toBeGreaterThanOrEqual(BOUNDARY_TITLE_HEIGHT / 2 + 2)
  })

  it('one with a title is at least as wide as the title, growing away from the parent', () => {
    const narrow = { content: { x: 100, y: 100, w: 30, h: 20 }, shape: 'tension' as const }
    const [base] = boundaryOutlines([{ ...narrow, withTitle: true }])
    const [right] = boundaryOutlines([{ ...narrow, withTitle: true, titleWidth: 140 }])
    expect(right!.w).toBeGreaterThanOrEqual(140 + 2 * TITLE_INSET)
    expect(right!.x).toBeCloseTo(base!.x)
    const [left] = boundaryOutlines([{ ...narrow, withTitle: true, titleWidth: 140, grow: 'left' }])
    expect(left!.w).toBeCloseTo(right!.w)
    expect(left!.x + left!.w).toBeCloseTo(base!.x + base!.w)
    // without a title it keeps to its boxes
    const [untitled] = boundaryOutlines([{ ...narrow, withTitle: false, titleWidth: 140 }])
    expect(untitled!.w).toBeLessThan(140)
  })

  it('how far a drawing reaches past its boxes: pads, bulges, the title above it and its width', () => {
    const content = { x: 100, y: 100, w: 200, h: 60 }
    const plainRect = boundaryReach({ content, shape: 'rect', withTitle: false })
    expect(plainRect).toEqual({
      top: BOUNDARY_PAD,
      bottom: BOUNDARY_PAD,
      left: BOUNDARY_PAD,
      right: BOUNDARY_PAD,
    })
    const titled = boundaryReach({ content, shape: 'rect', withTitle: true })
    const [outline] = boundaryOutlines([{ content, shape: 'rect', withTitle: true }])
    // the chip sits on the top edge: half of it above
    expect(titled.top).toBeCloseTo(100 - outline!.y + BOUNDARY_TITLE_HEIGHT / 2)
    const waves = boundaryReach({ content, shape: 'waves', withTitle: false })
    const [wavy] = boundaryOutlines([{ content, shape: 'waves', withTitle: false }])
    const drawn = boundaryExtent('waves', wavy!)
    expect(waves.bottom).toBeCloseTo(drawn.y + drawn.h - 160)
    expect(waves.left).toBeCloseTo(100 - drawn.x)
    const wide = boundaryReach({ content, shape: 'rect', withTitle: true, titleWidth: 400 })
    expect(wide.right + wide.left + 200).toBeCloseTo(400 + 2 * TITLE_INSET)
  })

  it('stops short of a topic just outside its boxes', () => {
    const parent = { x: 80, y: 60, w: 120, h: 36 }
    const below = { x: 100, y: 168, w: 80, h: 20 }
    const beside = { x: 30, y: 110, w: 50, h: 20 }
    const [rect] = boundaryOutlines([one('rect', true)], [parent, below, beside, content])
    expect(rect!.y).toBeGreaterThan(parent.y + parent.h)
    expect(rect!.y + rect!.h).toBeLessThan(below.y)
    expect(rect!.x).toBeGreaterThan(beside.x + beside.w)
  })

  it('one around another stands outside its drawing, further above for titles', () => {
    const inner = {
      content: { x: 120, y: 120, w: 40, h: 20 },
      shape: 'scallops' as const,
      withTitle: true,
    }
    const outer = {
      content: { x: 100, y: 100, w: 100, h: 100 },
      shape: 'rect' as const,
      withTitle: true,
    }
    const [i, o] = boundaryOutlines([inner, outer])
    const drawn = boundaryExtent('scallops', i!)
    expect(o!.x).toBeLessThanOrEqual(drawn.x - BOUNDARY_NEST_GAP)
    expect(o!.y).toBeLessThanOrEqual(drawn.y - BOUNDARY_NEST_GAP - BOUNDARY_TITLE_HEIGHT)
    expect(o!.x + o!.w).toBeGreaterThanOrEqual(drawn.x + drawn.w + BOUNDARY_NEST_GAP)
    // two around the same boxes: the later one goes outside, their top lines apart
    const [first, second] = boundaryOutlines([one('rect'), one('rect')])
    expect(second!.y).toBeLessThan(first!.y - BOUNDARY_NEST_GAP + 0.01)
    expect(second!.x).toBeLessThan(first!.x)
  })

  it('two side by side keep a gap between them', () => {
    const upper = {
      content: { x: 100, y: 100, w: 80, h: 20 },
      shape: 'rect' as const,
      withTitle: false,
    }
    const lower = {
      content: { x: 100, y: 126, w: 80, h: 20 },
      shape: 'rect' as const,
      withTitle: false,
    }
    const [a, b] = boundaryOutlines([upper, lower])
    expect(b!.y - (a!.y + a!.h)).toBeGreaterThanOrEqual(BOUNDARY_SIDE_GAP - 0.01)
    // and still go around their boxes
    expect(a!.y + a!.h).toBeGreaterThan(120)
    expect(b!.y).toBeLessThan(126)
  })
})

describe('where a boundary title goes', () => {
  const outline = { x: 100, y: 100, w: 200, h: 100 }
  const chip = { w: 50, h: BOUNDARY_TITLE_HEIGHT }

  it('on the top edge near its left end, as a legend on a frame', () => {
    expect(boundaryTitlePlace(outline, chip)).toEqual({ x: 112, y: 100 - chip.h / 2 })
  })

  it('on an outline hardly wider than it, in the middle of the top edge', () => {
    const tight = { ...outline, w: 60 }
    expect(boundaryTitlePlace(tight, chip)).toEqual({ x: 105, y: 91 })
  })
})
