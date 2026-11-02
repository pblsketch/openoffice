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
 * - `boundaryOutlines`: where all the outlines of a map go, together. Each
 *   stands `BOUNDARY_PAD` from its boxes; one that goes around another stands
 *   a little outside it (and further above one with a title), and two side by
 *   side give way to each other so a gap stays between them. One with a title
 *   is at least as wide as its title.
 * - `boundaryReach`: how far the drawing of one outline, with its title,
 *   reaches past its boxes on each side: the room the map makes for it
 *   (`boundary-room.ts`), so the outlines and titles of a map keep clear of
 *   the topics and of each other.
 * - `boundaryPath`: the outline of each shape around a box. The shapes are
 *   drawn by this app; another program's shape is drawn rounded.
 * - `boundaryTitlePlace`: where a title's chip goes: on the outline's top
 *   edge, near its left end, as a legend sits on a frame.
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
export const BOUNDARY_PAD = 10
/** How far an outline stands outside an outline it goes around. */
export const BOUNDARY_NEST_GAP = 6
/** The least gap between two outlines side by side. */
export const BOUNDARY_SIDE_GAP = 4
/** How tall the chip a boundary's title is written on is. */
export const BOUNDARY_TITLE_HEIGHT = 18
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

/** One outline to draw: the boxes it goes around (one box around them all) and whether the title goes on it. */
export interface BoundaryPiece {
  content: Rect
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

/** One outline for each group of boxes that has any, in the order given. The title goes on the first. */
export function boundaryPieces(groups: readonly (readonly Rect[])[]): BoundaryPiece[] {
  const pieces: BoundaryPiece[] = []
  for (const group of groups) {
    const content = unionRect(group)
    if (!content) continue
    pieces.push({ content, withTitle: pieces.length === 0 })
  }
  return pieces
}

/** How far in the middle of each side of a tension outline is drawn. */
function tensionDepth(w: number, h: number): number {
  return Math.min(12, w * 0.08, h * 0.08)
}

/** How far the points of a six-sided outline stand out from the sides of its box. */
function polygonCut(height: number): number {
  return Math.min(12, height / 4)
}

/** How far the drawing of an outline of this shape stands out of its box, at the most. */
function bulgeOf(shape: BoundaryShape, rect: Rect): { x: number; y: number } {
  switch (shape) {
    case 'polygon':
    case 'roundedPolygon':
      return { x: polygonCut(rect.h), y: 0 }
    case 'scallops':
      return { x: SCALLOP_BULGE / 2, y: SCALLOP_BULGE / 2 }
    case 'waves':
      return { x: WAVE_BULGE / 2, y: WAVE_BULGE / 2 }
    default:
      return { x: 0, y: 0 }
  }
}

/** The box the drawing of an outline of this shape takes. */
export function boundaryExtent(shape: BoundaryShape, rect: Rect): Rect {
  const bulge = bulgeOf(shape, rect)
  return {
    x: rect.x - bulge.x,
    y: rect.y - bulge.y,
    w: rect.w + 2 * bulge.x,
    h: rect.h + 2 * bulge.y,
  }
}

const NEAR = 0.5

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - NEAR &&
    inner.y >= outer.y - NEAR &&
    inner.x + inner.w <= outer.x + outer.w + NEAR &&
    inner.y + inner.h <= outer.y + outer.h + NEAR
  )
}

/** One outline of a map, as `boundaryOutlines` takes it. */
export interface OutlineRequest {
  content: Rect
  shape: BoundaryShape
  withTitle: boolean
  /** how wide the chip of its title is; the outline is made at least that wide, and a little more */
  titleWidth?: number
  /** the side an outline narrower than its title grows to: away from the parent (right unless given) */
  grow?: 'left' | 'right'
}

/** How far each side of an outline stands from the boxes it goes around. */
export interface Pads {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * How far each side of an outline stands from its boxes, before anything
 * around it is taken into account: `BOUNDARY_PAD`, more where its sides are
 * drawn inward (tension, waves) and less at the sides of a six-sided one,
 * whose points stand out there, so each looks as far off all round. One with
 * a title has room under its top edge for the lower half of the title
 * written on it, and a little air between that and the topic below.
 */
export function outlinePads(content: Rect, shape: BoundaryShape, withTitle: boolean): Pads {
  // a side drawn inward comes that much nearer the boxes
  const inward =
    shape === 'tension'
      ? tensionDepth(content.w + 2 * BOUNDARY_PAD, content.h + 2 * BOUNDARY_PAD)
      : shape === 'waves'
        ? WAVE_BULGE / 2
        : 0
  const pad = BOUNDARY_PAD + inward
  const side =
    shape === 'polygon' || shape === 'roundedPolygon'
      ? Math.max(4, pad - polygonCut(content.h + 2 * pad) / 2)
      : pad
  const top = withTitle ? Math.max(pad, BOUNDARY_TITLE_HEIGHT / 2 + TITLE_AIR) : pad
  return { top, bottom: pad, left: side, right: side }
}

/** How much wider than its pads make it an outline is drawn, so that its title fits on its top edge. */
function titleWidening(request: OutlineRequest, rectWidth: number): number {
  if (!request.withTitle || !(request.titleWidth !== undefined && request.titleWidth > 0)) return 0
  return Math.max(0, request.titleWidth + 2 * TITLE_INSET - rectWidth)
}

/**
 * How far the drawing of one outline reaches past its boxes on each side, on
 * its own: its pads, the bulges and points of its shape, the upper half of
 * its title's chip, and the widening for a title wider than its boxes (on
 * the side it grows to).
 */
export function boundaryReach(request: OutlineRequest): Pads {
  const { content, shape, withTitle } = request
  const pads = outlinePads(content, shape, withTitle)
  const rect = {
    x: content.x - pads.left,
    y: content.y - pads.top,
    w: content.w + pads.left + pads.right,
    h: content.h + pads.top + pads.bottom,
  }
  const bulge = bulgeOf(shape, rect)
  const wider = titleWidening(request, rect.w)
  return {
    top: pads.top + Math.max(bulge.y, withTitle ? BOUNDARY_TITLE_HEIGHT / 2 : 0),
    bottom: pads.bottom + bulge.y,
    left: pads.left + bulge.x + (request.grow === 'left' ? wider : 0),
    right: pads.right + bulge.x + (request.grow === 'left' ? 0 : wider),
  }
}

/**
 * The box of each outline of a map, in the order given, all placed together:
 *
 * - each stands off its boxes as `outlinePads` says, and is at least as wide
 *   as its title and a little more (growing to the side given);
 * - it stops short of a topic just outside its boxes (`topics`), such as the
 *   parent right above the branches of a tree, or the next branch below;
 * - one whose boxes take in another's stands `BOUNDARY_NEST_GAP` outside that
 *   one's drawing, and further above it by half a title for each of the two
 *   with a title. Of two around the same boxes, the later one goes outside;
 * - two side by side (neither inside the other) give way on the sides that
 *   face each other, so `BOUNDARY_SIDE_GAP` stays between them, as far as
 *   their boxes and what is inside them allow.
 *
 * The map makes room for each outline (`boundary-room.ts`), so the last two
 * rarely have anything to do.
 */
export function boundaryOutlines(
  requests: readonly OutlineRequest[],
  topics: readonly Rect[] = [],
): Rect[] {
  const inside = (i: number, j: number): boolean =>
    i !== j &&
    contains(requests[j]!.content, requests[i]!.content) &&
    // of two around the same boxes, the later goes outside
    (!contains(requests[i]!.content, requests[j]!.content) || i < j)

  const rects = requests.map((request) => {
    const { content, shape, withTitle } = request
    const pads = outlinePads(content, shape, withTitle)
    const pad = pads.bottom
    // the bulges and points of the drawing stand out of its box: they too stop short of a topic
    const bulge = bulgeOf(shape, {
      x: content.x - pads.left,
      y: content.y - pad,
      w: content.w + pads.left + pads.right,
      h: content.h + 2 * pad,
    })
    // a topic just outside the boxes (the parent above a tree's branch, the next branch below) stays outside
    for (const box of topics) {
      if (contains(content, box)) continue
      const across =
        box.x < content.x + content.w + pads.right && box.x + box.w > content.x - pads.left
      const along =
        box.y < content.y + content.h + pads.bottom && box.y + box.h > content.y - pads.top
      const room = (gap: number, out: number): number => Math.max(1, gap - 2 - out)
      if (across && box.y + box.h <= content.y + NEAR) {
        pads.top = Math.min(pads.top, room(content.y - (box.y + box.h), bulge.y))
      } else if (across && box.y >= content.y + content.h - NEAR) {
        pads.bottom = Math.min(pads.bottom, room(box.y - (content.y + content.h), bulge.y))
      } else if (along && box.x + box.w <= content.x + NEAR) {
        pads.left = Math.min(pads.left, room(content.x - (box.x + box.w), bulge.x))
      } else if (along && box.x >= content.x + content.w - NEAR) {
        pads.right = Math.min(pads.right, room(box.x - (content.x + content.w), bulge.x))
      }
    }
    const rect = {
      x: content.x - pads.left,
      y: content.y - pads.top,
      w: content.w + pads.left + pads.right,
      h: content.h + pads.top + pads.bottom,
    }
    // as wide as its title, and a little more
    const wider = titleWidening(request, rect.w)
    if (request.grow === 'left') rect.x -= wider
    rect.w += wider
    return rect
  })

  // around another: outside its drawing, the smaller ones first so each grows around what is inside it
  const area = (at: number): number => requests[at]!.content.w * requests[at]!.content.h
  const order = requests.map((_, at) => at).sort((a, b) => area(a) - area(b) || a - b)
  // how far in each side may come: its boxes, and the drawings of the outlines inside it
  const floors = requests.map(({ content, withTitle }, at) => {
    // one widened for its title does not give that width back
    const rect = rects[at]!
    const titled = withTitle && rect.w > content.w + 2 * BOUNDARY_PAD + 0.5
    return {
      left: titled ? Math.min(content.x, rect.x + 2) - 1 : content.x - 1,
      top: content.y - 1,
      right: titled
        ? Math.max(content.x + content.w, rect.x + rect.w - 2) + 1
        : content.x + content.w + 1,
      bottom: content.y + content.h + 1,
    }
  })
  for (const i of order) {
    for (let j = 0; j < requests.length; j++) {
      if (!inside(i, j)) continue
      const drawn = boundaryExtent(requests[i]!.shape, rects[i]!)
      const halfTitles = (requests[i]!.withTitle ? 1 : 0) + (requests[j]!.withTitle ? 1 : 0)
      const above = BOUNDARY_NEST_GAP + (halfTitles * BOUNDARY_TITLE_HEIGHT) / 2
      const outer = rects[j]!
      // the outer one's own points and bulges stand out of its box already; only its box has to clear
      const left = Math.min(outer.x, drawn.x - BOUNDARY_NEST_GAP)
      const top = Math.min(outer.y, drawn.y - above)
      const right = Math.max(outer.x + outer.w, drawn.x + drawn.w + BOUNDARY_NEST_GAP)
      const bottom = Math.max(outer.y + outer.h, drawn.y + drawn.h + BOUNDARY_NEST_GAP)
      rects[j] = { x: left, y: top, w: right - left, h: bottom - top }
      const floor = floors[j]!
      floor.left = Math.min(floor.left, drawn.x - 2)
      floor.top = Math.min(floor.top, drawn.y - 2)
      floor.right = Math.max(floor.right, drawn.x + drawn.w + 2)
      floor.bottom = Math.max(floor.bottom, drawn.y + drawn.h + 2)
    }
  }

  // side by side (neither inside the other): each gives way on the side facing the other
  for (let i = 0; i < requests.length; i++) {
    for (let j = i + 1; j < requests.length; j++) {
      if (inside(i, j) || inside(j, i)) continue
      const a = requests[i]!.content
      const b = requests[j]!.content
      const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h))
      const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w))
      if (gapY >= 0 && gapX < 0) {
        const [upper, lower] = a.y < b.y ? [i, j] : [j, i]
        const up = rects[upper]!
        const low = rects[lower]!
        const need = up.y + up.h + BOUNDARY_SIDE_GAP - low.y
        if (need <= 0) continue
        const fromUp = Math.min(need / 2, Math.max(0, up.y + up.h - floors[upper]!.bottom))
        const fromLow = Math.min(need - fromUp, Math.max(0, floors[lower]!.top - low.y))
        up.h -=
          fromUp +
          Math.min(
            need - fromUp - fromLow,
            Math.max(0, up.y + up.h - fromUp - floors[upper]!.bottom),
          )
        low.y += fromLow
        low.h -= fromLow
      } else if (gapX >= 0 && gapY < 0) {
        const [before, after] = a.x < b.x ? [i, j] : [j, i]
        const left = rects[before]!
        const right = rects[after]!
        const need = left.x + left.w + BOUNDARY_SIDE_GAP - right.x
        if (need <= 0) continue
        const fromLeft = Math.min(need / 2, Math.max(0, left.x + left.w - floors[before]!.right))
        const fromRight = Math.min(need - fromLeft, Math.max(0, floors[after]!.left - right.x))
        left.w -=
          fromLeft +
          Math.min(
            need - fromLeft - fromRight,
            Math.max(0, left.x + left.w - fromLeft - floors[before]!.right),
          )
        right.x += fromRight
        right.w -= fromRight
      }
    }
  }
  return rects
}

/**
 * Where the chip of a boundary's title goes (its top left corner): on the
 * outline's top edge near its left end, as a legend sits on a frame. The map
 * makes room above each outline for it (`boundary-room.ts`), and an outline
 * is at least as wide as its title (`boundaryOutlines`).
 */
export function boundaryTitlePlace(
  outline: Rect,
  chip: { w: number; h: number },
): { x: number; y: number } {
  const inset = Math.max(0, Math.min(TITLE_INSET, (outline.w - chip.w) / 2))
  return { x: outline.x + inset, y: outline.y - chip.h / 2 }
}

/** How far in from an outline's end its title starts. */
export const TITLE_INSET = 12
/** The air between the chip of a title and the topic under it. */
const TITLE_AIR = 6

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

/** How far out the curves of scallops and of waves go (a curve through its control point goes half as far). */
const SCALLOP_BULGE = 8
const WAVE_BULGE = 6

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
      return curvedSides(rect, 18, SCALLOP_BULGE, false)
    case 'waves':
      return curvedSides(rect, 24, WAVE_BULGE, true)
    case 'tension': {
      // the sides drawn in, as if pulled by the corners
      return curvedSides(rect, Math.max(w, h) * 2, -tensionDepth(w, h) * 2, false)
    }
    case 'polygon':
    case 'roundedPolygon': {
      // six sides: the box with a point on its left and its right
      const cut = polygonCut(h)
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
