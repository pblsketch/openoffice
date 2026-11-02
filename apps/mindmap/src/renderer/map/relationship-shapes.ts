/**
 * How a relationship is drawn: pure functions from its values and the boxes
 * of its two ends.
 *
 * - `relationshipPaint`: the values of the file (`ViewRelationshipStyle`)
 *   through the filter of `style-values.ts`. A relationship whose values all
 *   come to the defaults is `plain`: the library draws it as it always did
 *   (dashed, an open arrowhead at the end, the map's relationship colour,
 *   1.5 wide; `map.css`).
 * - `relationshipGeometry`: the path of each shape. `curved` goes through the
 *   two control points, as the library draws it; `straight`, `angled` and
 *   `zigzag` join the two boxes on their own and have no control points to
 *   move.
 * - `arrowMarker`: the drawing of each end, made by this app, and where the
 *   line stops under it (`inset`).
 * - `relationshipDrawing`: the line cut short under its ends, the ends placed
 *   along the path (made smaller on a line too short for both, so they never
 *   meet), and the dashes fitted so a dash meets each end.
 * - `labelSpot` / `labelAlong`: where a title goes so that it covers no topic
 *   and neither end of its line.
 * - `curveToDeltas` / `deltasToCurve`: a curve as the file keeps it (each
 *   control point measured from the reference point of the topic at that
 *   end, the middle of its box) and as the library keeps it (`delta1`,
 *   `delta2`: each control point measured from the middle of that end's box).
 *   The two measure from the same point, so the numbers carry over as they
 *   are; the functions copy them and are the one place that says so.
 */
import type { ViewCurve, ViewRelationshipStyle } from '@genoffice/xmind-engine'
import { linePatternDash } from './branches'
import {
  type ArrowShape,
  type LinePattern,
  type RelationshipShape,
  safeArrowShape,
  safeBranchLineWidth,
  safeColor,
  safeLinePattern,
  safeRelationshipShape,
  type SafeColor,
} from './style-values'

export interface Point {
  x: number
  y: number
}

/** A box by its middle and its size, in the coordinates of the library's `me-nodes`. */
export interface Box {
  cx: number
  cy: number
  w: number
  h: number
}

/** How wide a relationship is drawn without a width of its own (CSS pixels; `map.css`). */
export const RELATIONSHIP_WIDTH = 1.5

export interface RelationshipPaint {
  shape: RelationshipShape
  begin: ArrowShape
  end: ArrowShape
  /** null: the map's relationship colour (`--mm-relation`) */
  color: SafeColor | null
  /** CSS pixels; null: `RELATIONSHIP_WIDTH` */
  width: number | null
  /** null: the dashes a relationship always had */
  pattern: LinePattern | null
  /** every value is the default: drawn exactly as the library draws a relationship */
  plain: boolean
}

function valueOf(style: unknown, key: string): unknown {
  return typeof style === 'object' && style !== null
    ? (style as Record<string, unknown>)[key]
    : undefined
}

/** The values a relationship is drawn with. */
export function relationshipPaint(
  style: ViewRelationshipStyle | null | undefined | unknown,
): RelationshipPaint {
  const shape = safeRelationshipShape(valueOf(style, 'shape')) ?? 'curved'
  const begin = safeArrowShape(valueOf(style, 'begin')) ?? 'none'
  const end = safeArrowShape(valueOf(style, 'end')) ?? 'normal'
  const color = safeColor(valueOf(style, 'color'))
  const width = safeBranchLineWidth(valueOf(style, 'width'))
  const pattern = safeLinePattern(valueOf(style, 'pattern'))
  const plain =
    shape === 'curved' &&
    begin === 'none' &&
    end === 'normal' &&
    color === null &&
    width === null &&
    pattern === null
  return { shape, begin, end, color, width, pattern, plain }
}

/** What the library's own options for a relationship's line say (`Arrow.style`); undefined when it draws its own way. */
export interface RelationshipArrowStyle {
  stroke?: string
  strokeWidth?: number
  strokeDasharray?: string
}

/**
 * The library's style options for the line: the colour, the width and the
 * dashes of the values the relationship has. A solid line is `none`, since
 * the library dashes a line that asks for nothing. Undefined when there is
 * none of the three.
 */
export function relationshipArrowStyle(
  paint: RelationshipPaint,
): RelationshipArrowStyle | undefined {
  const out: RelationshipArrowStyle = {}
  if (paint.color !== null) out.stroke = paint.color
  if (paint.width !== null) out.strokeWidth = paint.width
  if (paint.pattern !== null) {
    out.strokeDasharray =
      linePatternDash(paint.pattern, paint.width ?? RELATIONSHIP_WIDTH)?.dasharray ?? 'none'
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** The cap of the line's dashes: round dots need round ends; null for the solid line and for no pattern. */
export function relationshipLinecap(paint: RelationshipPaint): 'butt' | 'round' | null {
  if (paint.pattern === null) return null
  return linePatternDash(paint.pattern, paint.width ?? RELATIONSHIP_WIDTH)?.linecap ?? 'round'
}

function n(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function p(point: Point): string {
  return `${n(point.x)} ${n(point.y)}`
}

/**
 * Where the line from the middle of a box towards a point leaves the box: the
 * same point the library takes for the ends of a curve.
 */
export function borderPoint(box: Box, toward: Point): Point {
  const halfW = box.w / 2
  const halfH = box.h / 2
  const dx = toward.x - box.cx
  const dy = toward.y - box.cy
  const length = Math.hypot(dx, dy)
  if (length === 0 || (halfW === 0 && halfH === 0)) return { x: box.cx, y: box.cy }
  const ux = dx / length
  const uy = dy / length
  const reach = Math.min(halfW / Math.abs(ux), halfH / Math.abs(uy))
  return { x: box.cx + ux * reach, y: box.cy + uy * reach }
}

/** The two boxes a relationship joins, and the two control points of its curve (absolute). */
export interface RelationshipEnds {
  from: Box
  to: Box
  c1: Point
  c2: Point
}

/** One end of a drawn relationship: where the line ends, and the point it comes from there. */
export interface RelationshipEnd {
  tip: Point
  from: Point
}

/** The path a relationship follows, before its ends are drawn on it. */
export type RelationshipPath =
  | { kind: 'polyline'; points: Point[] }
  | { kind: 'cubic'; p1: Point; c1: Point; c2: Point; p2: Point }

export interface RelationshipGeometry {
  d: string
  /** the same path, to be measured and cut short where the ends are drawn */
  path: RelationshipPath
  begin: RelationshipEnd
  end: RelationshipEnd
  /** where the title sits */
  label: Point
}

/**
 * How a zigzag is drawn on a line this wide: the straight piece at each end
 * (long enough for the largest end to sit on it), the length of each zig and
 * how far it swings out. All grow with the width, so a wide zigzag stays a
 * zigzag and does not crumple.
 */
export function zigzagMeasure(width: number): { lead: number; step: number; amplitude: number } {
  return {
    lead: markerSize(width) * 1.1 + Math.max(4, width * 1.5),
    step: 10 + width * 4,
    amplitude: 3 + width * 2,
  }
}

/** The path of a relationship of this shape between these ends, on a line this wide. */
export function relationshipGeometry(
  shape: RelationshipShape,
  ends: RelationshipEnds,
  width: number = RELATIONSHIP_WIDTH,
): RelationshipGeometry {
  const { from, to } = ends
  const fromCentre = { x: from.cx, y: from.cy }
  const toCentre = { x: to.cx, y: to.cy }
  switch (shape) {
    case 'curved': {
      const p1 = borderPoint(from, ends.c1)
      const p2 = borderPoint(to, ends.c2)
      const c1 = { ...ends.c1 }
      const c2 = { ...ends.c2 }
      return {
        d: `M ${p(p1)} C ${p(c1)} ${p(c2)} ${p(p2)}`,
        path: { kind: 'cubic', p1, c1, c2, p2 },
        begin: { tip: p1, from: { ...c1 } },
        end: { tip: p2, from: { ...c2 } },
        // the middle of the curve, as the library places the title
        label: cubicAt({ p1, c1, c2, p2 }, 0.5),
      }
    }
    case 'straight': {
      const p1 = borderPoint(from, toCentre)
      const p2 = borderPoint(to, fromCentre)
      return {
        d: `M ${p(p1)} L ${p(p2)}`,
        path: { kind: 'polyline', points: [p1, p2] },
        begin: { tip: p1, from: p2 },
        end: { tip: p2, from: p1 },
        label: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
      }
    }
    case 'angled':
      return angled(from, to)
    case 'zigzag':
      return zigzag(borderPoint(from, toCentre), borderPoint(to, fromCentre), width)
  }
}

/** Leaves one box level (or upright, when the other box is more below than beside it), turns once halfway, arrives the same way. */
function angled(from: Box, to: Box): RelationshipGeometry {
  const dx = to.cx - from.cx
  const dy = to.cy - from.cy
  if (Math.abs(dx) >= Math.abs(dy)) {
    const side = dx >= 0 ? 1 : -1
    const start = { x: from.cx + (side * from.w) / 2, y: from.cy }
    const stop = { x: to.cx - (side * to.w) / 2, y: to.cy }
    const mid = (start.x + stop.x) / 2
    return {
      d: `M ${p(start)} H ${n(mid)} V ${n(stop.y)} H ${n(stop.x)}`,
      path: {
        kind: 'polyline',
        points: [start, { x: mid, y: start.y }, { x: mid, y: stop.y }, stop],
      },
      begin: { tip: start, from: { x: mid, y: start.y } },
      end: { tip: stop, from: { x: mid, y: stop.y } },
      label: { x: mid, y: (start.y + stop.y) / 2 },
    }
  }
  const side = dy >= 0 ? 1 : -1
  const start = { x: from.cx, y: from.cy + (side * from.h) / 2 }
  const stop = { x: to.cx, y: to.cy - (side * to.h) / 2 }
  const mid = (start.y + stop.y) / 2
  return {
    d: `M ${p(start)} V ${n(mid)} H ${n(stop.x)} V ${n(stop.y)}`,
    path: {
      kind: 'polyline',
      points: [start, { x: start.x, y: mid }, { x: stop.x, y: mid }, stop],
    },
    begin: { tip: start, from: { x: start.x, y: mid } },
    end: { tip: stop, from: { x: stop.x, y: mid } },
    label: { x: (start.x + stop.x) / 2, y: mid },
  }
}

/** How many turns a zigzag has at the least; a line with no room for them is drawn straight. */
const ZIGZAG_LEAST_TURNS = 2

/**
 * Straight for a short way at each end, a zigzag across the line in between.
 * A line too short for the straight ends and two clean turns between them is
 * drawn straight: a zigzag squeezed shorter than that is a tangle.
 */
function zigzag(p1: Point, p2: Point, width: number): RelationshipGeometry {
  const label = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
  const length = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  const measure = zigzagMeasure(width)
  const span = length - 2 * measure.lead
  if (!(span >= (ZIGZAG_LEAST_TURNS + 1) * measure.step * 0.75)) {
    return {
      d: `M ${p(p1)} L ${p(p2)}`,
      path: { kind: 'polyline', points: [p1, p2] },
      begin: { tip: p1, from: p2 },
      end: { tip: p2, from: p1 },
      label,
    }
  }
  const ux = (p2.x - p1.x) / length
  const uy = (p2.y - p1.y) / length
  const lead = measure.lead
  const a = { x: p1.x + ux * lead, y: p1.y + uy * lead }
  const b = { x: p2.x - ux * lead, y: p2.y - uy * lead }
  const steps = Math.max(ZIGZAG_LEAST_TURNS + 1, Math.round(span / measure.step))
  // a short line swings less, so its zigs keep their angle
  const amplitude = Math.min(measure.amplitude, (span / steps) * 0.9)
  const points: Point[] = [p1, a]
  for (let step = 1; step < steps; step++) {
    const along = (span * step) / steps
    const side = step % 2 === 1 ? 1 : -1
    points.push({
      x: a.x + ux * along - uy * amplitude * side,
      y: a.y + uy * along + ux * amplitude * side,
    })
  }
  points.push(b, p2)
  return {
    d: `M ${points.map(p).join(' L ')}`,
    path: { kind: 'polyline', points },
    begin: { tip: p1, from: a },
    end: { tip: p2, from: b },
    label,
  }
}

// ---- measuring a path ----

interface Cubic {
  p1: Point
  c1: Point
  c2: Point
  p2: Point
}

function cubicAt({ p1, c1, c2, p2 }: Cubic, t: number): Point {
  const s = 1 - t
  const a = s * s * s
  const b = 3 * s * s * t
  const c = 3 * s * t * t
  const d = t * t * t
  return {
    x: a * p1.x + b * c1.x + c * c2.x + d * p2.x,
    y: a * p1.y + b * c1.y + c * c2.y + d * p2.y,
  }
}

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/** A curve cut in two at `t`. */
function splitCubic(curve: Cubic, t: number): { before: Cubic; after: Cubic } {
  const ab = lerp(curve.p1, curve.c1, t)
  const bc = lerp(curve.c1, curve.c2, t)
  const cd = lerp(curve.c2, curve.p2, t)
  const abc = lerp(ab, bc, t)
  const bcd = lerp(bc, cd, t)
  const at = lerp(abc, bcd, t)
  return {
    before: { p1: curve.p1, c1: ab, c2: abc, p2: at },
    after: { p1: at, c1: bcd, c2: cd, p2: curve.p2 },
  }
}

/** The part of a curve from `t0` to `t1`. */
function cubicPart(curve: Cubic, t0: number, t1: number): Cubic {
  const head = t1 < 1 ? splitCubic(curve, t1).before : curve
  return t0 > 0 && t1 > 0 ? splitCubic(head, t0 / t1).after : head
}

const CURVE_STEPS = 64

/** Points along the path, close enough together to measure it by. */
function pathSamples(path: RelationshipPath): Point[] {
  if (path.kind === 'polyline') return path.points
  const out: Point[] = []
  for (let step = 0; step <= CURVE_STEPS; step++) out.push(cubicAt(path, step / CURVE_STEPS))
  return out
}

/** How far along a row of points each one is. */
function runningLengths(points: readonly Point[]): number[] {
  const out = [0]
  for (let at = 1; at < points.length; at++) {
    const a = points[at - 1]!
    const b = points[at]!
    out.push(out[at - 1]! + Math.hypot(b.x - a.x, b.y - a.y))
  }
  return out
}

/** The length of a path. */
export function pathLength(path: RelationshipPath): number {
  const lengths = runningLengths(pathSamples(path))
  return lengths[lengths.length - 1] ?? 0
}

/** The point a given way along a row of points (clamped to its ends). */
function alongPoints(
  points: readonly Point[],
  lengths: readonly number[],
  distance: number,
): Point {
  const total = lengths[lengths.length - 1] ?? 0
  const want = Math.min(Math.max(distance, 0), total)
  for (let at = 1; at < points.length; at++) {
    if (lengths[at]! >= want) {
      const span = lengths[at]! - lengths[at - 1]!
      return lerp(points[at - 1]!, points[at]!, span > 0 ? (want - lengths[at - 1]!) / span : 0)
    }
  }
  return { ...(points[points.length - 1] ?? { x: 0, y: 0 }) }
}

/** The point this far along the path from its start (or, with `fromEnd`, back from its end). */
export function pointAlong(path: RelationshipPath, distance: number, fromEnd = false): Point {
  const points = pathSamples(path)
  const lengths = runningLengths(points)
  const total = lengths[lengths.length - 1] ?? 0
  return alongPoints(points, lengths, fromEnd ? total - distance : distance)
}

/** The curve's parameter a given way along it, read from its samples. */
function cubicParameter(lengths: readonly number[], distance: number): number {
  const total = lengths[lengths.length - 1] ?? 0
  const want = Math.min(Math.max(distance, 0), total)
  for (let at = 1; at < lengths.length; at++) {
    if (lengths[at]! >= want) {
      const span = lengths[at]! - lengths[at - 1]!
      const part = span > 0 ? (want - lengths[at - 1]!) / span : 0
      return (at - 1 + part) / (lengths.length - 1)
    }
  }
  return 1
}

/** The path with `start` taken off its start and `end` off its end; null when nothing is left. */
export function trimPath(
  path: RelationshipPath,
  start: number,
  end: number,
): RelationshipPath | null {
  const points = pathSamples(path)
  const lengths = runningLengths(points)
  const total = lengths[lengths.length - 1] ?? 0
  const from = Math.max(0, start)
  const to = total - Math.max(0, end)
  if (!(to - from > 0.01)) return null
  if (path.kind === 'cubic') {
    return {
      kind: 'cubic',
      ...cubicPart(path, cubicParameter(lengths, from), cubicParameter(lengths, to)),
    }
  }
  const kept: Point[] = [alongPoints(points, lengths, from)]
  points.forEach((point, at) => {
    if (lengths[at]! > from && lengths[at]! < to) kept.push(point)
  })
  kept.push(alongPoints(points, lengths, to))
  return { kind: 'polyline', points: kept }
}

/** The `d` of a path. */
export function pathD(path: RelationshipPath): string {
  if (path.kind === 'cubic') return `M ${p(path.p1)} C ${p(path.c1)} ${p(path.c2)} ${p(path.p2)}`
  return `M ${path.points.map(p).join(' L ')}`
}

// ---- the ends ----

/**
 * The drawing of an end: a path, whether it is filled with the line's colour
 * (a filled end has no outline, so its corners stay sharp), and where the line
 * stops under it.
 */
export interface ArrowMarker {
  d: string
  filled: boolean
  /** how far back from the tip the line stops; inside the end, so no seam shows */
  inset: number
  /** how much of the line before `inset` the end covers */
  overlap: number
}

/** How long an end is drawn on a line this wide. The library's arrowhead is 12 long, on a line 1.5 wide. */
export function markerSize(width: number): number {
  return 7.5 + width * 3
}

/** How far back from its tip an end of this kind reaches on a line this wide (drawn `size` long); 0 for none. */
export function markerReach(
  kind: ArrowShape,
  width: number,
  size: number = markerSize(width),
): number {
  switch (kind) {
    case 'none':
      return 0
    case 'normal':
      return width / 2 + size * Math.cos(Math.PI / 6)
    case 'herringbone':
      return size * 1.1
    case 'dot':
    case 'square':
      return size * 0.7
    default:
      return size
  }
}

/**
 * The drawing of an end of the kind given, its tip on `tip`, pointing away
 * from `from`, `size` long (`markerSize` unless given). Null for `none` and
 * for an end with no direction.
 *
 * Each drawing ends on `tip`: a filled end has no outline, and an open one
 * (`normal`, `herringbone`) is drawn half a line's width back, so its round
 * stroke ends on the point.
 */
export function arrowMarker(
  kind: ArrowShape,
  tip: Point,
  from: Point,
  width: number,
  size: number = markerSize(width),
): ArrowMarker | null {
  if (kind === 'none') return null
  const length = Math.hypot(tip.x - from.x, tip.y - from.y)
  if (!(length > 0)) return null
  const ux = (tip.x - from.x) / length
  const uy = (tip.y - from.y) / length
  const half = width / 2
  // how far into a solid end the line runs, so the two meet without a seam
  const overlap = Math.min(1, half)
  // a point `back` behind the tip and `side` to its left (negative: to its right)
  const at = (back: number, side: number): Point => ({
    x: tip.x - ux * back - uy * side,
    y: tip.y - uy * back + ux * side,
  })
  const path = (points: Point[], close: boolean): string =>
    `M ${points.map(p).join(' L ')}${close ? ' Z' : ''}`
  // a filled end, the line going in up to `edge` behind the tip
  const solid = (d: string, edge: number): ArrowMarker => ({
    d,
    filled: true,
    inset: edge - overlap,
    overlap,
  })
  switch (kind) {
    case 'normal': {
      // the library's own arrowhead, 30° to either side; the line meets it at its point
      const back = size * Math.cos(Math.PI / 6)
      const side = size * Math.sin(Math.PI / 6)
      return {
        d: path([at(half + back, side), at(half, 0), at(half + back, -side)], false),
        filled: false,
        inset: half,
        overlap: 0,
      }
    }
    case 'spearhead':
      return solid(
        path([tip, at(size, size * 0.45), at(size * 0.65, 0), at(size, -size * 0.45)], true),
        size * 0.65,
      )
    case 'triangle':
      return solid(path([tip, at(size, size * 0.5), at(size, -size * 0.5)], true), size)
    case 'dot': {
      const r = size * 0.35
      const back = at(2 * r, 0)
      return solid(
        `M ${p(tip)} A ${n(r)} ${n(r)} 0 1 0 ${p(back)} A ${n(r)} ${n(r)} 0 1 0 ${p(tip)} Z`,
        // as far in as the circle is as wide as the line
        r + Math.sqrt(Math.max(0, r * r - half * half)),
      )
    }
    case 'square': {
      const r = size * 0.35
      return solid(path([tip, at(0, r), at(2 * r, r), at(2 * r, -r), at(0, -r)], true), 2 * r)
    }
    case 'diamond':
      return solid(
        path([tip, at(size * 0.5, size * 0.35), at(size, 0), at(size * 0.5, -size * 0.35)], true),
        // as far in as the diamond is as wide as the line
        size - half / 0.7,
      )
    case 'herringbone': {
      // a spine up to the tip, with two pairs of short strokes leaning back from it; the line stops where the spine starts
      const spine = size * 1.1
      const strokes = [0.35, 0.75].map((place) => {
        const root = at(size * place, 0)
        return ` M ${p(at(size * place + size * 0.3, size * 0.35))} L ${p(root)} L ${p(at(size * place + size * 0.3, -size * 0.35))}`
      })
      return {
        d: `M ${p(at(half, 0))} L ${p(at(spine, 0))}${strokes.join('')}`,
        filled: false,
        inset: spine - overlap,
        overlap,
      }
    }
  }
}

// ---- the line between the ends ----

/** The dashes a relationship always had (`map.css`), for a line without a pattern of its own. */
const DEFAULT_DASHES = [5, 5]

/**
 * Dashes stretched or squeezed a little so that a line this long starts and
 * ends with a dash: a whole number of repeats, and then the first dash once
 * more. Empty for a line too short to have a gap.
 */
export function fitDashes(dashes: readonly number[], length: number): number[] {
  const period = dashes.reduce((sum, dash) => sum + dash, 0)
  const first = dashes[0] ?? 0
  if (!(period > 0) || !(length > 0)) return []
  const repeats = Math.round((length - first) / period)
  if (repeats < 1) return []
  const scale = length / (repeats * period + first)
  return dashes.map((dash) => dash * scale)
}

/** The line of a relationship, cut short under its ends, and the ends drawn on it. */
export interface RelationshipDrawing {
  d: string
  begin: ArrowMarker | null
  end: ArrowMarker | null
  /** the dashes, fitted to the line so that a dash meets each end; `none` for a solid line */
  dasharray: string
  /** where the dashes start: the first one starts where the line comes out from under its end */
  dashoffset: number
  /** the room each end of the line takes, drawn or not: what its title keeps clear of */
  endBoxes: LabelObstacle[]
}

/** The least length of line left between the two ends of a relationship. */
export function endsGap(width: number): number {
  return Math.max(3, width)
}

/**
 * How a relationship of these values is drawn along a path: each end placed
 * at its end of the path, pointing the way the path goes over the length of
 * the end (so a curve meets the end where the end begins), the line stopping
 * under each end, and the dashes fitted to what shows between them.
 */
export function relationshipDrawing(
  paint: RelationshipPaint,
  path: RelationshipPath,
): RelationshipDrawing {
  const width = paint.width ?? RELATIONSHIP_WIDTH
  const total = pathLength(path)
  // on a line too short for both ends and a little line between, both are drawn smaller
  // (each reach grows with the size in a straight line, so the size that fits is exact)
  const fixed = markerReach(paint.begin, width, 0) + markerReach(paint.end, width, 0)
  const growing = markerReach(paint.begin, width, 1) + markerReach(paint.end, width, 1) - fixed
  let size = markerSize(width)
  if (growing > 0 && fixed + growing * size + endsGap(width) > total) {
    size = Math.max(0, (total - endsGap(width) - fixed) / growing)
  }
  // too small to read as an end: none is drawn
  const drawn = size >= Math.max(3, width * 1.2)
  const markerAt = (kind: ArrowShape, fromEnd: boolean): ArrowMarker | null => {
    const reach = markerReach(kind, width, size)
    if (reach === 0 || !drawn) return null
    // on a line shorter than the end, the end points along the whole line
    const from = pointAlong(path, Math.min(reach, total), fromEnd)
    return arrowMarker(kind, pointAlong(path, 0, fromEnd), from, width, size)
  }
  const begin = markerAt(paint.begin, false)
  const end = markerAt(paint.end, true)
  const endBox = (
    marker: ArrowMarker | null,
    kind: ArrowShape,
    fromEnd: boolean,
  ): LabelObstacle => {
    const tip = pointAlong(path, 0, fromEnd)
    const reach = marker ? Math.min(markerReach(kind, width, size), total) : 0
    const back = pointAlong(path, reach, fromEnd)
    const around = (marker ? size / 2 : 2) + width / 2
    const x = Math.min(tip.x, back.x) - around
    const y = Math.min(tip.y, back.y) - around
    return {
      x,
      y,
      w: Math.max(tip.x, back.x) + around - x,
      h: Math.max(tip.y, back.y) + around - y,
    }
  }
  const endBoxes = [endBox(begin, paint.begin, false), endBox(end, paint.end, true)]
  const cut = trimPath(path, begin?.inset ?? 0, end?.inset ?? 0)
  const line = cut ?? path
  const hiddenStart = cut ? (begin?.overlap ?? 0) : 0
  const hiddenEnd = cut ? (end?.overlap ?? 0) : 0

  let base: readonly number[] | null = DEFAULT_DASHES
  if (paint.pattern !== null) {
    const dash = linePatternDash(paint.pattern, width)
    base = dash ? dash.dasharray.split(' ').map(Number) : null
  }
  const fitted = base ? fitDashes(base, pathLength(line) - hiddenStart - hiddenEnd) : []
  const period = fitted.reduce((sum, dash) => sum + dash, 0)
  return {
    d: pathD(line),
    begin,
    end,
    dasharray: fitted.length > 0 ? fitted.map(n).join(' ') : 'none',
    dashoffset: period > 0 && hiddenStart > 0 ? Number(n(period - (hiddenStart % period))) : 0,
    endBoxes,
  }
}

/** A box by its top left corner and its size, in the coordinates of the library's `me-nodes`. */
export interface LabelObstacle {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Where a relationship's title goes on its path: in the middle, or, when its
 * box there would lie on a topic or on an end of the line (`ends`), at the
 * nearest place along the path where it lies on none; when there is no such
 * place, beside the middle of the line, on whichever side is free. Where it
 * covers least when nothing is free, the ends counting more than the topics
 * (the middle among equals). `moved`: it is not in the middle.
 */
export function labelSpot(
  path: RelationshipPath,
  size: { w: number; h: number },
  obstacles: readonly LabelObstacle[],
  ends: readonly LabelObstacle[] = [],
  margin = 3,
): { at: Point; moved: boolean } {
  const points = pathSamples(path)
  const lengths = runningLengths(points)
  const total = lengths[lengths.length - 1] ?? 0
  const middle = alongPoints(points, lengths, total / 2)
  const cover = (at: Point, box: LabelObstacle): number => {
    const w =
      Math.min(at.x + size.w / 2 + margin, box.x + box.w) -
      Math.max(at.x - size.w / 2 - margin, box.x)
    const h =
      Math.min(at.y + size.h / 2 + margin, box.y + box.h) -
      Math.max(at.y - size.h / 2 - margin, box.y)
    return w > 0 && h > 0 ? w * h : 0
  }
  const covered = (at: Point): number =>
    obstacles.reduce((sum, box) => sum + cover(at, box), 0) +
    10 * ends.reduce((sum, box) => sum + cover(at, box), 0)
  if (covered(middle) === 0) return { at: middle, moved: false }
  const step = 2
  for (let away = step; away <= total / 2; away += step) {
    for (const distance of [total / 2 - away, total / 2 + away]) {
      const at = alongPoints(points, lengths, distance)
      if (covered(at) === 0) return { at, moved: true }
    }
  }
  // beside the middle, across the way the line goes from end to end (not the way its middle
  // piece goes: the middle of an angled line runs across it), far enough off that the box
  // does not lie on it
  const before = points[0] ?? middle
  const after = points[points.length - 1] ?? middle
  const length = Math.hypot(after.x - before.x, after.y - before.y)
  const candidates = [middle]
  if (length > 0) {
    const nx = -(after.y - before.y) / length
    const ny = (after.x - before.x) / length
    const off = (Math.abs(nx) * size.w) / 2 + (Math.abs(ny) * size.h) / 2 + margin + 2
    // a little further out each time, past the ends that stand out of the line
    for (const further of [0, 4, 8, 12, 18, 24, 32, 44, 60]) {
      for (const sign of [-1, 1]) {
        const at = {
          x: middle.x + nx * (off + further) * sign,
          y: middle.y + ny * (off + further) * sign,
        }
        if (covered(at) === 0) return { at, moved: true }
        candidates.push(at)
      }
    }
  }
  let best = candidates[0]!
  let least = Infinity
  for (const at of candidates) {
    const amount = covered(at)
    if (amount < least - 0.01) {
      least = amount
      best = at
    }
  }
  return { at: best, moved: best !== middle }
}

/** Where a relationship's title goes on its path (`labelSpot`): the point. */
export function labelAlong(
  path: RelationshipPath,
  size: { w: number; h: number },
  obstacles: readonly LabelObstacle[],
  ends: readonly LabelObstacle[] = [],
): Point {
  return labelSpot(path, size, obstacles, ends).at
}

/** The library's control points (`delta1`, `delta2`) for a curve as the file keeps it. */
export function curveToDeltas(curve: ViewCurve): { delta1: Point; delta2: Point } {
  return {
    delta1: { x: curve.from.x, y: curve.from.y },
    delta2: { x: curve.to.x, y: curve.to.y },
  }
}

/** The curve as the file keeps it for the library's control points. */
export function deltasToCurve(delta1: Point, delta2: Point): ViewCurve {
  return { from: { x: delta1.x, y: delta1.y }, to: { x: delta2.x, y: delta2.y } }
}
