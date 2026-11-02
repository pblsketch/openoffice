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
  relationshipArrowStyle,
  relationshipGeometry,
  relationshipPaint,
} from '../src/renderer/map/relationship-shapes'
import {
  parseSummaryFrame,
  summaryBracketPath,
  summaryPaint,
} from '../src/renderer/map/summary-shapes'
import {
  BOUNDARY_PAD,
  boundaryPaint,
  boundaryPath,
  boundaryPieces,
} from '../src/renderer/map/boundary-shapes'

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
      // the end touches the tip
      expect(marker!.d, kind).toMatch(/100 50|100\.\d* 50/)
    }
    expect(drawn.size).toBe(ARROW_SHAPES.length - 1)
  })

  it('the normal end is the open arrowhead the library draws', () => {
    const marker = arrowMarker('normal', tip, from, 1.5)!
    expect(marker.filled).toBe(false)
    const [x1, y1, x, y, x2, y2] = numbers(marker.d)
    expect([x, y]).toEqual([100, 50])
    expect(x1).toBeCloseTo(100 - 12 * Math.cos(Math.PI / 6))
    expect(y1).toBeCloseTo(50 + 12 * Math.sin(Math.PI / 6))
    expect(x2).toBeCloseTo(100 - 12 * Math.cos(Math.PI / 6))
    expect(y2).toBeCloseTo(50 - 12 * Math.sin(Math.PI / 6))
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

  it('one outline per group of boxes, padded; the title only on the first', () => {
    const pieces = boundaryPieces([
      [
        { x: 10, y: 10, w: 50, h: 20 },
        { x: 30, y: 40, w: 50, h: 20 },
      ],
      [],
      [{ x: -200, y: 0, w: 40, h: 10 }],
    ])
    expect(pieces).toEqual([
      {
        rect: {
          x: 10 - BOUNDARY_PAD,
          y: 10 - BOUNDARY_PAD,
          w: 70 + 2 * BOUNDARY_PAD,
          h: 50 + 2 * BOUNDARY_PAD,
        },
        withTitle: true,
      },
      {
        rect: {
          x: -200 - BOUNDARY_PAD,
          y: -BOUNDARY_PAD,
          w: 40 + 2 * BOUNDARY_PAD,
          h: 10 + 2 * BOUNDARY_PAD,
        },
        withTitle: false,
      },
    ])
    expect(boundaryPieces([[], []])).toEqual([])
  })
})
