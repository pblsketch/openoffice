/**
 * How a boundary is drawn: pure functions from its values and the boxes it
 * goes around.
 *
 * - `boundaryPaint`: the values of the file (`ViewBoundaryStyle`) through the
 *   filter of `style-values.ts`. A boundary without values is a rounded box
 *   in the map's relationship colour, 1.5 wide and solid, over a faint fill
 *   of that colour; that fill is drawn only and never written (`map.css`).
 * - `boundaryPieces`: the outlines to draw for groups of boxes. A boundary
 *   whose topics stand on both sides of the central topic is drawn once per
 *   side, its title on the first only.
 * - `boundaryPath`: the outline of each shape around a box. The shapes are
 *   drawn by this app; another program's shape is drawn rounded.
 */
import type { ViewBoundaryStyle } from '@genoffice/xmind-engine'
import {
  type BoundaryShape,
  type LinePattern,
  safeBoundaryShape,
  safeBranchLineWidth,
  safeColor,
  safeFill,
  safeLinePattern,
  type SafeColor,
} from './style-values'

/** A box: its top left corner and its size, in the coordinates of the library's `me-nodes`. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** How far an outline stands from the boxes it goes around. */
export const BOUNDARY_PAD = 8
/** How wide a boundary is drawn without a width of its own (CSS pixels; `map.css`). */
export const BOUNDARY_WIDTH = 1.5

export interface BoundaryPaint {
  shape: BoundaryShape
  /** null: the map's relationship colour (`--mm-relation`) */
  color: SafeColor | null
  /** CSS pixels; null: `BOUNDARY_WIDTH` */
  width: number | null
  /** null: solid */
  pattern: LinePattern | null
  /** null: a faint fill of the line's colour, drawn only */
  fill: SafeColor | 'none' | null
}

/** The values a boundary is drawn with. */
export function boundaryPaint(
  style: ViewBoundaryStyle | null | undefined | unknown,
): BoundaryPaint {
  const value = (key: string): unknown =>
    typeof style === 'object' && style !== null
      ? (style as Record<string, unknown>)[key]
      : undefined
  return {
    shape: safeBoundaryShape(value('shape')) ?? 'roundedRect',
    color: safeColor(value('color')),
    width: safeBranchLineWidth(value('width')),
    pattern: safeLinePattern(value('pattern')),
    fill: safeFill(value('fill')),
  }
}

/** One outline to draw: the box it goes around (padded) and whether the title goes on it. */
export interface BoundaryPiece {
  rect: Rect
  withTitle: boolean
}

/** The smallest box around all of these; null for none. */
export function unionRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const rect of rects) {
    left = Math.min(left, rect.x)
    top = Math.min(top, rect.y)
    right = Math.max(right, rect.x + rect.w)
    bottom = Math.max(bottom, rect.y + rect.h)
  }
  return { x: left, y: top, w: right - left, h: bottom - top }
}

/**
 * One outline for each group of boxes that has any, in the order given, each
 * standing `BOUNDARY_PAD` from its boxes. The title goes on the first.
 */
export function boundaryPieces(groups: readonly (readonly Rect[])[]): BoundaryPiece[] {
  const pieces: BoundaryPiece[] = []
  for (const group of groups) {
    const around = unionRect(group)
    if (!around) continue
    pieces.push({
      rect: {
        x: around.x - BOUNDARY_PAD,
        y: around.y - BOUNDARY_PAD,
        w: around.w + 2 * BOUNDARY_PAD,
        h: around.h + 2 * BOUNDARY_PAD,
      },
      withTitle: pieces.length === 0,
    })
  }
  return pieces
}

function n(value: number): string {
  return String(Math.round(value * 100) / 100)
}

interface Point {
  x: number
  y: number
}

const pt = (point: Point): string => `${n(point.x)} ${n(point.y)}`

/** The corners of a box, clockwise from the top left. */
function corners({ x, y, w, h }: Rect): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

/** A closed outline through these points, each corner rounded by up to `radius`. */
function roundedThrough(points: readonly Point[], radius: number): string {
  const parts: string[] = []
  points.forEach((corner, at) => {
    const before = points[(at + points.length - 1) % points.length]!
    const after = points[(at + 1) % points.length]!
    const toward = (other: Point): Point => {
      const length = Math.hypot(other.x - corner.x, other.y - corner.y)
      const reach = length > 0 ? Math.min(radius, length / 2) / length : 0
      return {
        x: corner.x + (other.x - corner.x) * reach,
        y: corner.y + (other.y - corner.y) * reach,
      }
    }
    const into = toward(before)
    const out = toward(after)
    parts.push(`${at === 0 ? 'M' : 'L'} ${pt(into)} Q ${pt(corner)} ${pt(out)}`)
  })
  return `${parts.join(' ')} Z`
}

/**
 * Each side of the box as a row of curves from corner to corner, each bulging
 * out by `bulge` (in, when negative) at its middle; `alternate` turns every
 * other one the other way.
 */
function curvedSides(rect: Rect, step: number, bulge: number, alternate: boolean): string {
  const points = corners(rect)
  const parts = [`M ${pt(points[0]!)}`]
  let count = 0
  points.forEach((start, at) => {
    const end = points[(at + 1) % points.length]!
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    const pieces = Math.max(1, Math.round(length / step))
    // outward from a clockwise outline is to the left of the way it goes
    const ox = length > 0 ? (end.y - start.y) / length : 0
    const oy = length > 0 ? -(end.x - start.x) / length : 0
    for (let piece = 0; piece < pieces; piece++) {
      const t0 = piece / pieces
      const t1 = (piece + 1) / pieces
      const mid = (t0 + t1) / 2
      const sign = alternate && count % 2 === 1 ? -1 : 1
      count++
      const control = {
        x: start.x + (end.x - start.x) * mid + ox * bulge * sign,
        y: start.y + (end.y - start.y) * mid + oy * bulge * sign,
      }
      const to = { x: start.x + (end.x - start.x) * t1, y: start.y + (end.y - start.y) * t1 }
      parts.push(`Q ${pt(control)} ${pt(to)}`)
    }
  })
  return `${parts.join(' ')} Z`
}

/** The outline of a boundary of this shape around a box. */
export function boundaryPath(shape: BoundaryShape, rect: Rect): string {
  const { x, y, w, h } = rect
  switch (shape) {
    case 'rect':
      return `M ${n(x)} ${n(y)} H ${n(x + w)} V ${n(y + h)} H ${n(x)} Z`
    case 'roundedRect':
      return roundedThrough(corners(rect), Math.min(10, w / 2, h / 2))
    case 'scallops':
      return curvedSides(rect, 18, 8, false)
    case 'waves':
      return curvedSides(rect, 24, 6, true)
    case 'tension': {
      // the sides drawn in, as if pulled by the corners
      const depth = Math.min(12, w * 0.08, h * 0.08)
      return curvedSides(rect, Math.max(w, h) * 2, -depth * 2, false)
    }
    case 'polygon':
    case 'roundedPolygon': {
      // six sides: the box with a point on its left and its right
      const cut = Math.min(16, h / 2)
      const points: Point[] = [
        { x, y },
        { x: x + w, y },
        { x: x + w + cut, y: y + h / 2 },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x: x - cut, y: y + h / 2 },
      ]
      if (shape === 'roundedPolygon') return roundedThrough(points, 8)
      return `M ${points.map(pt).join(' L ')} Z`
    }
  }
}
