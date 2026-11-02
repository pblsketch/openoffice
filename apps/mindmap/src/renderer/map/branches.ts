/**
 * The branch lines of a map, as SVG path data.
 *
 * The drawing library asks for one path per branch through two hooks: from
 * the central topic to a main topic, and from any topic to one below it. It
 * hands over boxes only (top, left, width, height of the two ends), so each
 * function here is pure geometry.
 *
 * Three shapes are drawn by the themes: a curve that leaves and arrives level,
 * an elbow with both corners rounded, and, for a skeleton whose topics sit on
 * their line, a curve that runs on under the topic's text. In that last one
 * the underline is part of the same path as the branch, so the two cannot come
 * apart; and the branch that leaves such a topic starts at the far end of its
 * underline, at the height the underline was drawn at.
 *
 * A line may also take a shape of its own (`BranchLine`): a curve, a straight
 * line, an elbow with square or rounded corners, a curve ending in an
 * arrowhead, or no line. Asked for the theme's shape, each function gives the
 * theme's path exactly. The underline of the line skeleton belongs to the
 * topic, so it is drawn whatever the shape of the line into it. A line from
 * the centre can be drawn tapered instead (`taperedBranchPath`): a filled
 * outline, wide at the centre and narrow at the topic.
 *
 * A tree and a timeline have their own lines: a trunk near the parent's left
 * edge that turns toward each topic below it, and, between the steps of a
 * timeline, a line from one main topic to the next with an arrowhead.
 */
import type { ThemeBranchShape } from '@genoffice/xmind-engine'
import type { BranchLineShape, LinePattern } from './style-values'

/** The boxes the library hands a branch hook (pixels inside the element the path is drawn in). */
export interface BranchBoxes {
  /** the parent's box */
  pT: number
  pL: number
  pW: number
  pH: number
  /** the child's box */
  cT: number
  cL: number
  cW: number
  cH: number
  /** which side of the centre the branch is on: `lhs`, `rhs`, or `down` for the layout that grows downward */
  direction: string
  /** true when the parent is a main topic (hook for the lower branches only) */
  isFirst?: boolean
}

/** What the path functions need to know about the look being drawn. */
export interface BranchGeometry {
  /** how the lines below a main topic run */
  subShape: ThemeBranchShape
  cornerRadius: number
  /** the stroke width of the line a main topic sits on; null when main topics have no underline */
  mainUnderline: number | null
  /** the same for the topics below */
  subUnderline: number | null
  /** how far inside the central topic's edge a main branch starts, so its end is hidden under the topic */
  centralInset: number
  /** the space left and right of a topic below the main level, inside the box the library measures */
  subPadX: number
  /** the space above and below it */
  subPadY: number
  /** the space left and right of such a topic in the downward layout */
  downPadX: number
}

/** What a line asks for besides its boxes: a shape of its own, and its width for the arrowhead. */
export interface BranchLine {
  /** absent: the theme's shape */
  shape?: BranchLineShape
  /** CSS pixels; the arrowhead of `arrowedCurve` grows with it */
  width?: number
}

const DOWN = 'down'
const LHS = 'lhs'

/** How far in from a parent's left edge the trunk of a tree runs down. */
export const TREE_TRUNK = 18
/** How far right of a parent's left edge the topics below it begin in a tree. `map.css` indents by the same. */
export const TREE_INDENT = 42
/** The corner where a trunk turns toward a topic, for skeletons whose lines are curves. */
const TREE_CURVE = 8
/** The arrowhead at the end of a step of a timeline, and the least one of a curve with an arrow. */
const ARROW = 6

function n(value: number): string {
  return String(Math.round(value * 100) / 100)
}

interface Point {
  x: number
  y: number
}

/** Leaves `(sx, sy)` level and arrives at `(ex, ey)` level. */
function levelCurve(sx: number, sy: number, ex: number, ey: number, bend = 0.5): string {
  const mx = sx + (ex - sx) * bend
  return `M ${n(sx)} ${n(sy)} C ${n(mx)} ${n(sy)} ${n(mx)} ${n(ey)} ${n(ex)} ${n(ey)}`
}

/** Leaves `(sx, sy)` downward and arrives at `(ex, ey)` from above. */
function fallingCurve(sx: number, sy: number, ex: number, ey: number): string {
  const my = sy + (ey - sy) * 0.5
  return `M ${n(sx)} ${n(sy)} C ${n(sx)} ${n(my)} ${n(ex)} ${n(my)} ${n(ex)} ${n(ey)}`
}

/** Out level, across on a trunk half way, in level; both corners rounded. */
function levelElbow(sx: number, sy: number, ex: number, ey: number, radius: number): string {
  const dx = ex - sx
  const dy = ey - sy
  if (Math.abs(dy) < 1) return `M ${n(sx)} ${n(sy)} H ${n(ex)}`
  const side = dx >= 0 ? 1 : -1
  const fall = dy >= 0 ? 1 : -1
  const mx = sx + dx / 2
  const r = Math.max(0, Math.min(radius, Math.abs(dx) / 2, Math.abs(dy) / 2))
  return (
    `M ${n(sx)} ${n(sy)} H ${n(mx - side * r)} Q ${n(mx)} ${n(sy)} ${n(mx)} ${n(sy + fall * r)}` +
    ` V ${n(ey - fall * r)} Q ${n(mx)} ${n(ey)} ${n(mx + side * r)} ${n(ey)} H ${n(ex)}`
  )
}

/** Down, across on a trunk half way, down again; both corners rounded. */
function fallingElbow(sx: number, sy: number, ex: number, ey: number, radius: number): string {
  const dx = ex - sx
  const dy = ey - sy
  if (Math.abs(dx) < 1) return `M ${n(sx)} ${n(sy)} V ${n(ey)}`
  const side = dx >= 0 ? 1 : -1
  const my = sy + dy / 2
  const r = Math.max(0, Math.min(radius, Math.abs(dx) / 2, Math.abs(dy) / 2))
  return (
    `M ${n(sx)} ${n(sy)} V ${n(my - r)} Q ${n(sx)} ${n(my)} ${n(sx + side * r)} ${n(my)}` +
    ` H ${n(ex - side * r)} Q ${n(ex)} ${n(my)} ${n(ex)} ${n(my + r)} V ${n(ey)}`
  )
}

/** Out level, across on a trunk half way, in level; square corners. */
function sharpLevelElbow(sx: number, sy: number, ex: number, ey: number): string {
  if (Math.abs(ey - sy) < 1) return `M ${n(sx)} ${n(sy)} H ${n(ex)}`
  const mx = sx + (ex - sx) / 2
  return `M ${n(sx)} ${n(sy)} H ${n(mx)} V ${n(ey)} H ${n(ex)}`
}

/** Down, across on a trunk half way, down again; square corners. */
function sharpFallingElbow(sx: number, sy: number, ex: number, ey: number): string {
  if (Math.abs(ex - sx) < 1) return `M ${n(sx)} ${n(sy)} V ${n(ey)}`
  const my = sy + (ey - sy) / 2
  return `M ${n(sx)} ${n(sy)} V ${n(my)} H ${n(ex)} V ${n(ey)}`
}

/** Down from `(sx, sy)`, then across to `(ex, ey)`; the corner rounded. */
function trunkElbow(sx: number, sy: number, ex: number, ey: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, Math.abs(ex - sx), Math.abs(ey - sy)))
  return (
    `M ${n(sx)} ${n(sy)} V ${n(ey - r)} Q ${n(sx)} ${n(ey)} ${n(sx + r)} ${n(ey)}` + ` H ${n(ex)}`
  )
}

/** How long the arrowhead of `arrowedCurve` is for a line this wide. */
function headSize(width: number | undefined): number {
  return Math.max(ARROW, (width ?? 0) * 2.5)
}

/**
 * An arrowhead whose point is at `(x, y)`, the line arriving along `(dx, dy)`
 * (a unit step): one wing, the point, the other wing. `closed` makes it a
 * triangle to fill.
 */
function arrowHead(x: number, y: number, dx: number, dy: number, size: number, closed = false) {
  const bx = x - dx * size
  const by = y - dy * size
  const wing = size * 0.7
  return (
    `M ${n(bx - dy * wing)} ${n(by + dx * wing)} L ${n(x)} ${n(y)}` +
    ` L ${n(bx + dy * wing)} ${n(by - dx * wing)}${closed ? ' Z' : ''}`
  )
}

/** The direction a line of these ends arrives in: down (or up), or along the side it is on. */
function arrival(falling: boolean, from: Point, to: Point, side: number): Point {
  if (falling) return { x: 0, y: to.y >= from.y ? 1 : -1 }
  return { x: to.x === from.x ? side : Math.sign(to.x - from.x), y: 0 }
}

interface Ends {
  /** the line leaves downward and arrives from above, rather than level */
  falling: boolean
  /** 1 on the right of the centre, -1 on the left */
  side: number
  from: Point
  to: Point
  /** the topic's underline: on from where the line ends (`apart` false), or a piece of its own */
  underline: { x: number; y: number; end: number; apart: boolean } | null
}

interface ConnectorOptions {
  /** how far along a level curve its two control points sit */
  bend: number
  radius: number
  width?: number
}

/**
 * A line of the given shape between the two ends. The arrowhead, if any, is
 * handed back apart, so that what is drawn after the line (an underline)
 * starts where the line ends.
 */
function connector(
  shape: BranchLineShape,
  ends: Ends,
  options: ConnectorOptions,
): { line: string; head: string } {
  const { falling, from, to } = ends
  const { x: sx, y: sy } = from
  const { x: ex, y: ey } = to
  switch (shape) {
    case 'straight':
      return { line: `M ${n(sx)} ${n(sy)} L ${n(ex)} ${n(ey)}`, head: '' }
    case 'elbow':
      return {
        line: falling ? sharpFallingElbow(sx, sy, ex, ey) : sharpLevelElbow(sx, sy, ex, ey),
        head: '',
      }
    case 'roundedElbow':
      return {
        line: falling
          ? fallingElbow(sx, sy, ex, ey, options.radius)
          : levelElbow(sx, sy, ex, ey, options.radius),
        head: '',
      }
    case 'none':
      return { line: `M ${n(ex)} ${n(ey)}`, head: '' }
    case 'curve':
    case 'arrowedCurve': {
      const line = falling ? fallingCurve(sx, sy, ex, ey) : levelCurve(sx, sy, ex, ey, options.bend)
      if (shape === 'curve') return { line, head: '' }
      const along = arrival(falling, from, to, ends.side)
      return { line, head: ` ${arrowHead(ex, ey, along.x, along.y, headSize(options.width))}` }
    }
  }
}

/** A line, the underline after it, then its arrowhead. */
function drawn(line: { line: string; head: string }, underline: Ends['underline']): string {
  if (underline === null) return `${line.line}${line.head}`
  const rest = underline.apart
    ? ` M ${n(underline.x)} ${n(underline.y)} H ${n(underline.end)}`
    : ` H ${n(underline.end)}`
  return `${line.line}${rest}${line.head}`
}

/** The height the middle of an underline of this width is drawn at, for a topic whose box ends at `bottom`. */
function underlineY(bottom: number, width: number): number {
  return bottom - width / 2
}

/** Where the line from the central topic to a main topic starts and ends, and the underline it runs on into. */
function mainEnds(geometry: BranchGeometry, box: BranchBoxes): Ends {
  const { pT, pL, pW, pH, cT, cL, cW, cH, direction } = box
  const underline = geometry.mainUnderline
  if (direction === DOWN) {
    return {
      falling: true,
      side: 1,
      from: { x: pL + pW / 2, y: pT + pH - geometry.centralInset },
      to: { x: cL + cW / 2, y: cT },
      underline:
        underline === null
          ? null
          : { x: cL, y: underlineY(cT + cH, underline), end: cL + cW, apart: true },
    }
  }
  const left = direction === LHS
  const nearX = left ? cL + cW : cL
  const ey = underline === null ? cT + cH / 2 : underlineY(cT + cH, underline)
  return {
    falling: false,
    side: left ? -1 : 1,
    from: {
      x: left ? pL + geometry.centralInset : pL + pW - geometry.centralInset,
      y: pT + pH / 2,
    },
    to: { x: nearX, y: ey },
    underline:
      underline === null ? null : { x: nearX, y: ey, end: left ? cL : cL + cW, apart: false },
  }
}

/** Where a line from a topic to one below it starts and ends, and the underline it runs on into. */
function subEnds(geometry: BranchGeometry, box: BranchBoxes): Ends {
  const { pT, pL, pW, pH, cT, cL, cW, cH, direction, isFirst } = box
  const underline = geometry.subUnderline
  if (direction === DOWN) {
    return {
      falling: true,
      side: 1,
      from: { x: pL + pW / 2, y: pT + pH },
      to: { x: cL + cW / 2, y: cT },
      underline:
        underline === null
          ? null
          : {
              x: cL + geometry.downPadX,
              y: underlineY(cT + cH, underline),
              end: cL + cW - geometry.downPadX,
              apart: true,
            },
    }
  }
  const left = direction === LHS
  // a main topic fills the box the library measures; a topic below it has space around it
  const out = isFirst ? 0 : geometry.subPadX
  const parentUnderline = isFirst ? geometry.mainUnderline : geometry.subUnderline
  const sy =
    parentUnderline === null
      ? pT + pH / 2
      : underlineY(pT + pH - (isFirst ? 0 : geometry.subPadY), parentUnderline)
  const nearX = left ? cL + cW - geometry.subPadX : cL + geometry.subPadX
  const ey = underline === null ? cT + cH / 2 : underlineY(cT + cH - geometry.subPadY, underline)
  return {
    falling: false,
    side: left ? -1 : 1,
    from: { x: left ? pL + out : pL + pW - out, y: sy },
    to: { x: nearX, y: ey },
    underline:
      underline === null
        ? null
        : {
            x: nearX,
            y: ey,
            end: left ? cL + geometry.subPadX : cL + cW - geometry.subPadX,
            apart: false,
          },
  }
}

/** The shape the theme gives a line below the main level. */
function themeSubShape(geometry: BranchGeometry): BranchLineShape {
  return geometry.subShape === 'rounded-elbow' ? 'roundedElbow' : 'curve'
}

/** From the central topic to a main topic. */
export function mainBranchPath(
  geometry: BranchGeometry,
  box: BranchBoxes,
  line: BranchLine = {},
): string {
  const ends = mainEnds(geometry, box)
  const options = { bend: 0.5, radius: geometry.cornerRadius, width: line.width }
  return drawn(connector(line.shape ?? 'curve', ends, options), ends.underline)
}

/** From a topic to one below it. */
export function subBranchPath(
  geometry: BranchGeometry,
  box: BranchBoxes,
  line: BranchLine = {},
): string {
  const ends = subEnds(geometry, box)
  const options = { bend: 0.55, radius: geometry.cornerRadius, width: line.width }
  return drawn(connector(line.shape ?? themeSubShape(geometry), ends, options), ends.underline)
}

// ---- the tapered line from the centre ----

/** How many straight pieces a curve is outlined with. */
const TAPER_STEPS = 24
/** How many a rounded corner is outlined with. */
const CORNER_STEPS = 6
/** How much wider than its width a tapered line is at the centre, and at the topic. */
const TAPER_START = 3
const TAPER_END = 0.5

function cubicPoints(p0: Point, p1: Point, p2: Point, p3: Point): Point[] {
  const points: Point[] = []
  for (let step = 0; step <= TAPER_STEPS; step++) {
    const t = step / TAPER_STEPS
    const u = 1 - t
    points.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    })
  }
  return points
}

/** The points of a rounded corner at `corner`, from `start` to `end`, the first left out. */
function cornerPoints(start: Point, corner: Point, end: Point): Point[] {
  const points: Point[] = []
  for (let step = 1; step <= CORNER_STEPS; step++) {
    const t = step / CORNER_STEPS
    const u = 1 - t
    points.push({
      x: u * u * start.x + 2 * u * t * corner.x + t * t * end.x,
      y: u * u * start.y + 2 * u * t * corner.y + t * t * end.y,
    })
  }
  return points
}

/** The point `by` from `p` toward `q`. */
function toward(p: Point, q: Point, by: number): Point {
  const length = Math.hypot(q.x - p.x, q.y - p.y) || 1
  return { x: p.x + ((q.x - p.x) / length) * by, y: p.y + ((q.y - p.y) / length) * by }
}

/** The middle of a line of the given shape, as points from its start to its end. */
function centreLine(shape: BranchLineShape, ends: Ends, radius: number): Point[] {
  const { falling, from, to } = ends
  const { x: sx, y: sy } = from
  const { x: ex, y: ey } = to
  if (shape === 'straight') return [from, to]
  if (shape === 'elbow' || shape === 'roundedElbow') {
    if (falling ? Math.abs(ex - sx) < 1 : Math.abs(ey - sy) < 1) return [from, to]
    const a: Point = falling ? { x: sx, y: (sy + ey) / 2 } : { x: (sx + ex) / 2, y: sy }
    const b: Point = falling ? { x: ex, y: (sy + ey) / 2 } : { x: (sx + ex) / 2, y: ey }
    if (shape === 'elbow') return [from, a, b, to]
    const r = Math.max(0, Math.min(radius, Math.abs(ex - sx) / 2, Math.abs(ey - sy) / 2))
    const intoA = toward(a, from, r)
    const intoB = toward(b, a, r)
    return [
      from,
      intoA,
      ...cornerPoints(intoA, a, toward(a, b, r)),
      intoB,
      ...cornerPoints(intoB, b, toward(b, to, r)),
      to,
    ]
  }
  // a curve, with or without its arrowhead
  return falling
    ? cubicPoints(from, { x: sx, y: (sy + ey) / 2 }, { x: ex, y: (sy + ey) / 2 }, to)
    : cubicPoints(from, { x: (sx + ex) / 2, y: sy }, { x: (sx + ex) / 2, y: ey }, to)
}

/** A filled outline around `points`, `startWidth` wide at the first and `endWidth` at the last. */
function taperOutline(points: readonly Point[], startWidth: number, endWidth: number): string {
  const kept = points.filter(
    (point, at) =>
      at === 0 || Math.hypot(point.x - points[at - 1]!.x, point.y - points[at - 1]!.y) > 0.01,
  )
  if (kept.length < 2) return ''
  // the unit normal of each piece, to the left of the way the line runs
  const normals: Point[] = []
  const lengths = [0]
  for (let at = 0; at + 1 < kept.length; at++) {
    const dx = kept[at + 1]!.x - kept[at]!.x
    const dy = kept[at + 1]!.y - kept[at]!.y
    const length = Math.hypot(dx, dy)
    normals.push({ x: dy / length, y: -dx / length })
    lengths.push(lengths[at]! + length)
  }
  const total = lengths[lengths.length - 1]!
  const left: Point[] = []
  const right: Point[] = []
  kept.forEach((point, at) => {
    const before = normals[Math.max(0, at - 1)]!
    const after = normals[Math.min(normals.length - 1, at)]!
    let mx = before.x + after.x
    let my = before.y + after.y
    const length = Math.hypot(mx, my)
    if (length < 1e-6) {
      // a corner that turns all the way back: the piece after it decides
      mx = after.x
      my = after.y
    } else {
      mx /= length
      my /= length
    }
    // at a corner the outline stands out further, so both pieces keep their width (at most twice)
    const scale = 1 / Math.max(0.5, mx * after.x + my * after.y)
    const half = ((startWidth + (endWidth - startWidth) * (lengths[at]! / total)) / 2) * scale
    left.push({ x: point.x + mx * half, y: point.y + my * half })
    right.push({ x: point.x - mx * half, y: point.y - my * half })
  })
  const outline = [...left, ...right.reverse()]
  return `M ${outline.map((point) => `${n(point.x)} ${n(point.y)}`).join(' L ')} Z`
}

/**
 * A line from the central topic to a main topic, drawn tapered: a filled
 * outline around the line of the given shape, three times its width at the
 * centre and half of it at the topic, and a filled arrowhead for a curve with
 * an arrow. The underline of the line skeleton is a filled band of its own
 * width. No line (`none`) leaves the underline alone.
 */
export function taperedBranchPath(
  geometry: BranchGeometry,
  box: BranchBoxes,
  line: Required<BranchLine>,
): string {
  const ends = mainEnds(geometry, box)
  const parts: string[] = []
  if (line.shape !== 'none') {
    const points = centreLine(line.shape, ends, geometry.cornerRadius)
    const outline = taperOutline(points, line.width * TAPER_START, line.width * TAPER_END)
    if (outline !== '') parts.push(outline)
    if (line.shape === 'arrowedCurve') {
      const along = arrival(ends.falling, ends.from, ends.to, ends.side)
      parts.push(arrowHead(ends.to.x, ends.to.y, along.x, along.y, headSize(line.width), true))
    }
  }
  const band = ends.underline
  if (band !== null && geometry.mainUnderline !== null) {
    const half = geometry.mainUnderline / 2
    parts.push(
      `M ${n(band.x)} ${n(band.y - half)} H ${n(band.end)} V ${n(band.y + half)} H ${n(band.x)} Z`,
    )
  }
  return parts.length > 0 ? parts.join(' ') : `M ${n(ends.to.x)} ${n(ends.to.y)}`
}

// ---- patterns ----

/** The dashes of each pattern, in widths of the line: dash, gap, and so on. */
const DASHES: Readonly<Record<Exclude<LinePattern, 'solid'>, readonly number[]>> = {
  dash: [4, 2],
  dot: [1, 1],
  'dash-dot': [4, 2, 1, 2],
  'dash-dot-dot': [4, 2, 1, 2, 1, 2],
  // dots of no length, drawn by their round ends
  'round-dot': [0, 2],
}

/**
 * How a pattern is drawn on a line of this width: the dash lengths and the
 * ends of each dash. Null for a solid line. Dashes are measured in widths of
 * the line, never less than one pixel, so a hair line still shows them.
 */
export function linePatternDash(
  pattern: LinePattern,
  width: number,
): { dasharray: string; linecap: 'butt' | 'round' } | null {
  if (pattern === 'solid') return null
  const unit = Math.max(1, width)
  return {
    dasharray: DASHES[pattern].map((length) => n(length * unit)).join(' '),
    linecap: pattern === 'round-dot' ? 'round' : 'butt',
  }
}

// ---- tree and timeline ----

/** Which topic a branch of a tree leaves from: the boxes of the three levels are measured differently. */
export type TreeParent = 'central' | 'main' | 'sub'

/**
 * A branch of a tree: down the trunk near the parent's left edge, then
 * across to the topic's left edge. All the branches of one parent run down
 * the same trunk, so together they draw it.
 */
export function treeBranchPath(
  geometry: BranchGeometry,
  box: BranchBoxes,
  from: TreeParent,
): string {
  const { pT, pL, pW, pH, cT, cL, cW, cH } = box
  // a topic below the main level has space around it inside its box; the others fill theirs
  const padX = from === 'sub' ? geometry.subPadX : 0
  const padY = from === 'sub' ? geometry.subPadY : 0
  const sx = pL + padX + Math.min(TREE_TRUNK, (pW - 2 * padX) / 2)
  const sy = from === 'central' ? pT + pH - geometry.centralInset : pT + pH - padY
  const toMain = from === 'central'
  const childPadX = toMain ? 0 : geometry.subPadX
  const childPadY = toMain ? 0 : geometry.subPadY
  const underline = toMain ? geometry.mainUnderline : geometry.subUnderline
  const ex = cL + childPadX
  const ey = underline === null ? cT + cH / 2 : underlineY(cT + cH - childPadY, underline)
  const radius = geometry.subShape === 'rounded-elbow' ? geometry.cornerRadius : TREE_CURVE
  const path = trunkElbow(sx, sy, ex, ey, radius)
  return underline === null ? path : `${path} H ${n(cL + cW - childPadX)}`
}

/**
 * A step of a timeline: from the right edge of the step before (the central
 * topic for the first) to the left edge of this main topic, ending in an
 * arrowhead.
 */
export function timelineStepPath(
  geometry: BranchGeometry,
  box: BranchBoxes,
  fromCentral: boolean,
): string {
  const { pT, pL, pW, pH, cT, cL, cW, cH } = box
  const underline = geometry.mainUnderline
  const sx = fromCentral ? pL + pW - geometry.centralInset : pL + pW
  const sy = fromCentral || underline === null ? pT + pH / 2 : underlineY(pT + pH, underline)
  const ey = underline === null ? cT + cH / 2 : underlineY(cT + cH, underline)
  const ex = cL - 2
  const head =
    ` M ${n(ex - ARROW)} ${n(ey - ARROW * 0.7)} L ${n(ex)} ${n(ey)}` +
    ` L ${n(ex - ARROW)} ${n(ey + ARROW * 0.7)}`
  const path = `${levelCurve(sx, sy, ex, ey)}${head}`
  return underline === null ? path : `${path} M ${n(cL)} ${n(ey)} H ${n(cL + cW)}`
}
