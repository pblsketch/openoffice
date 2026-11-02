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
 * - `arrowMarker`: the drawing of each end, made by this app.
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

export interface RelationshipGeometry {
  d: string
  begin: RelationshipEnd
  end: RelationshipEnd
  /** where the title sits */
  label: Point
}

const ZIG_LEAD = 16
const ZIG_STEP = 12
const ZIG_AMPLITUDE = 5

/** The path of a relationship of this shape between these ends. */
export function relationshipGeometry(
  shape: RelationshipShape,
  ends: RelationshipEnds,
): RelationshipGeometry {
  const { from, to } = ends
  const fromCentre = { x: from.cx, y: from.cy }
  const toCentre = { x: to.cx, y: to.cy }
  switch (shape) {
    case 'curved': {
      const p1 = borderPoint(from, ends.c1)
      const p2 = borderPoint(to, ends.c2)
      const { c1, c2 } = ends
      return {
        d: `M ${p(p1)} C ${p(c1)} ${p(c2)} ${p(p2)}`,
        begin: { tip: p1, from: { ...c1 } },
        end: { tip: p2, from: { ...c2 } },
        // the middle of the curve, as the library places the title
        label: {
          x: p1.x / 8 + (c1.x * 3) / 8 + (c2.x * 3) / 8 + p2.x / 8,
          y: p1.y / 8 + (c1.y * 3) / 8 + (c2.y * 3) / 8 + p2.y / 8,
        },
      }
    }
    case 'straight': {
      const p1 = borderPoint(from, toCentre)
      const p2 = borderPoint(to, fromCentre)
      return {
        d: `M ${p(p1)} L ${p(p2)}`,
        begin: { tip: p1, from: p2 },
        end: { tip: p2, from: p1 },
        label: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
      }
    }
    case 'angled':
      return angled(from, to)
    case 'zigzag':
      return zigzag(borderPoint(from, toCentre), borderPoint(to, fromCentre))
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
    begin: { tip: start, from: { x: start.x, y: mid } },
    end: { tip: stop, from: { x: stop.x, y: mid } },
    label: { x: (start.x + stop.x) / 2, y: mid },
  }
}

/** Straight for a short way at each end, a zigzag across the line in between. */
function zigzag(p1: Point, p2: Point): RelationshipGeometry {
  const label = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
  const length = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  if (length === 0) {
    return {
      d: `M ${p(p1)} L ${p(p2)}`,
      begin: { tip: p1, from: p2 },
      end: { tip: p2, from: p1 },
      label,
    }
  }
  const ux = (p2.x - p1.x) / length
  const uy = (p2.y - p1.y) / length
  const lead = Math.min(ZIG_LEAD, length * 0.2)
  const a = { x: p1.x + ux * lead, y: p1.y + uy * lead }
  const b = { x: p2.x - ux * lead, y: p2.y - uy * lead }
  const span = length - 2 * lead
  const steps = Math.max(2, Math.round(span / ZIG_STEP))
  const points: Point[] = [p1, a]
  for (let step = 1; step < steps; step++) {
    const along = (span * step) / steps
    const side = step % 2 === 1 ? 1 : -1
    points.push({
      x: a.x + ux * along - uy * ZIG_AMPLITUDE * side,
      y: a.y + uy * along + ux * ZIG_AMPLITUDE * side,
    })
  }
  points.push(b, p2)
  return {
    d: `M ${points.map(p).join(' L ')}`,
    begin: { tip: p1, from: a },
    end: { tip: p2, from: b },
    label,
  }
}

/** The drawing of an end: a path, and whether it is filled with the line's colour. */
export interface ArrowMarker {
  d: string
  filled: boolean
}

/** How long an end is drawn on a line this wide. The library's arrowhead is 12 long. */
function markerSize(width: number): number {
  return Math.max(12, width * 4)
}

/**
 * The drawing of an end of the kind given, its tip on `tip`, pointing away
 * from `from`. Null for `none` and for an end with no direction.
 */
export function arrowMarker(
  kind: ArrowShape,
  tip: Point,
  from: Point,
  width: number,
): ArrowMarker | null {
  if (kind === 'none') return null
  const length = Math.hypot(tip.x - from.x, tip.y - from.y)
  if (!(length > 0)) return null
  const ux = (tip.x - from.x) / length
  const uy = (tip.y - from.y) / length
  const size = markerSize(width)
  // a point `back` behind the tip and `side` to its left (negative: to its right)
  const at = (back: number, side: number): Point => ({
    x: tip.x - ux * back - uy * side,
    y: tip.y - uy * back + ux * side,
  })
  const path = (points: Point[], close: boolean): string =>
    `M ${points.map(p).join(' L ')}${close ? ' Z' : ''}`
  const cos = Math.cos(Math.PI / 6)
  const sin = Math.sin(Math.PI / 6)
  switch (kind) {
    case 'normal':
      // the library's own arrowhead: 30° to either side of the line
      return {
        d: path([at(size * cos, size * sin), tip, at(size * cos, -size * sin)], false),
        filled: false,
      }
    case 'spearhead':
      return {
        d: path([tip, at(size, size * 0.45), at(size * 0.65, 0), at(size, -size * 0.45)], true),
        filled: true,
      }
    case 'triangle':
      return { d: path([tip, at(size, size * 0.5), at(size, -size * 0.5)], true), filled: true }
    case 'dot': {
      const r = size * 0.35
      const back = at(2 * r, 0)
      return {
        d: `M ${p(tip)} A ${n(r)} ${n(r)} 0 1 0 ${p(back)} A ${n(r)} ${n(r)} 0 1 0 ${p(tip)} Z`,
        filled: true,
      }
    }
    case 'square': {
      const r = size * 0.35
      return {
        d: path([tip, at(0, r), at(2 * r, r), at(2 * r, -r), at(0, -r)], true),
        filled: true,
      }
    }
    case 'diamond':
      return {
        d: path([tip, at(size * 0.5, size * 0.3), at(size, 0), at(size * 0.5, -size * 0.3)], true),
        filled: true,
      }
    case 'herringbone': {
      // the shaft to the tip, with two pairs of short strokes leaning back from it
      const strokes = [0.35, 0.75].map((place) => {
        const root = at(size * place, 0)
        return ` M ${p(at(size * place + size * 0.3, size * 0.35))} L ${p(root)} L ${p(at(size * place + size * 0.3, -size * 0.35))}`
      })
      return { d: `M ${p(tip)} L ${p(at(size * 1.05, 0))}${strokes.join('')}`, filled: false }
    }
  }
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
