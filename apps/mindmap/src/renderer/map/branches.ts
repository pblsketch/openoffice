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
 * topic, so it is drawn whatever the shape of the line into it, and with the
 * line's own values: it is the same path. The arrowhead is a triangle drawn
 * apart (`BranchDrawing.head`), so it stays whole on a dashed line; on a
 * line that runs on into an underline it sits at the underline's far end. A line
 * from the centre can be drawn tapered instead (`taperedBranchPath`): a
 * filled outline along the line's own shape, wide at the centre and as wide
 * as the line at the topic. A pattern is laid onto a line by its length
 * (`fittedLinePattern`), so that it starts and ends with a dash.
 *
 * Lines that leave one parent may share a trunk: the elbows of siblings, and
 * the branches of a tree. Drawn together (`mainBranchDrawings`,
 * `subBranchDrawings`, `treeBranchDrawings`), each draws only its own piece
 * of the trunk, from where the line before it turns off to where it turns
 * off itself, so lines of different values never lie on top of each other.
 * Together they draw the same shape the whole lines drew.
 *
 * A tree and a timeline have their own lines: a trunk near the parent's left
 * edge that turns toward each topic below it, and, between the steps of a
 * timeline, a line from one main topic to the next with an arrowhead, drawn
 * apart as the arrowhead of a curve is.
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
  /** round dots keep clear of an arrowhead, so the last one shows whole */
  pattern?: LinePattern
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

/** How long the arrowhead of `arrowedCurve` is for a line this wide, from its base to its point. */
function headSize(width: number | undefined): number {
  return Math.max(ARROW, (width ?? 0) * 2.5)
}

/**
 * How far back from an arrowhead's point the line under it stops. A line
 * ends half its width inside the head's base, so the two meet with no seam;
 * a line of round dots stops a gap short of the base instead, so its last
 * dot shows whole, apart from the head as the dots are from each other.
 */
function headBack(
  size: number,
  width: number | undefined,
  pattern: LinePattern | undefined,
): number {
  const w = width ?? 0
  if (pattern === 'round-dot') return size + Math.max(1, w)
  return size - Math.min(w / 2, size / 2)
}

/** How far each side of the line the base of that arrowhead reaches, in lengths of the head. */
const HEAD_SPREAD = 0.6

/** Twice the area inside `points`; positive when they go round clockwise on screen (y down). */
function turning(points: readonly Point[]): number {
  let sum = 0
  points.forEach((point, at) => {
    const next = points[(at + 1) % points.length]!
    sum += point.x * next.y - next.x * point.y
  })
  return sum
}

/** The points going round clockwise on screen, so every closed piece of a filled outline adds to it. */
function clockwise(points: Point[]): Point[] {
  return turning(points) < 0 ? [...points].reverse() : points
}

/** An arrowhead to fill, its point at `tip`, the line arriving along `along` (a unit step). */
function arrowTriangle(tip: Point, along: Point, size: number): Point[] {
  const bx = tip.x - along.x * size
  const by = tip.y - along.y * size
  const wing = size * HEAD_SPREAD
  return clockwise([
    { x: bx - along.y * wing, y: by + along.x * wing },
    tip,
    { x: bx + along.y * wing, y: by - along.x * wing },
  ])
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
  pattern?: LinePattern
}

/** A line between the ends: its path data, the points along its middle, and its arrowhead (a triangle) if it has one. */
interface Shaft {
  line: string
  middle: Point[]
  head: Point[] | null
}

/**
 * The line of the given shape between the two ends. A curve with an arrow
 * stops inside the base of its arrowhead, which is handed back apart to be
 * filled: the line's end, square or round, stays inside the head and never
 * shows through its point, and a dashed line still has a whole head.
 */
function shaft(shape: BranchLineShape, ends: Ends, options: ConnectorOptions): Shaft {
  const { falling, from, to } = ends
  if (shape === 'none') return { line: `M ${n(to.x)} ${n(to.y)}`, middle: [to], head: null }
  let end = to
  let head: Point[] | null = null
  if (shape === 'arrowedCurve') {
    const along = arrival(falling, from, to, ends.side)
    const size = headSize(options.width)
    head = arrowTriangle(to, along, size)
    const back = headBack(size, options.width, options.pattern)
    end = { x: to.x - along.x * back, y: to.y - along.y * back }
  }
  const { x: sx, y: sy } = from
  const { x: ex, y: ey } = end
  let line: string
  switch (shape) {
    case 'straight':
      line = `M ${n(sx)} ${n(sy)} L ${n(ex)} ${n(ey)}`
      break
    case 'elbow':
      line = falling ? sharpFallingElbow(sx, sy, ex, ey) : sharpLevelElbow(sx, sy, ex, ey)
      break
    case 'roundedElbow':
      line = falling
        ? fallingElbow(sx, sy, ex, ey, options.radius)
        : levelElbow(sx, sy, ex, ey, options.radius)
      break
    case 'curve':
    case 'arrowedCurve':
      line = falling ? fallingCurve(sx, sy, ex, ey) : levelCurve(sx, sy, ex, ey, options.bend)
      break
  }
  return { line, middle: middleLine(shape, falling, from, end, options), head }
}

/** A line, then the underline after it. */
function drawn(line: string, underline: Ends['underline']): string {
  if (underline === null) return line
  const rest = underline.apart
    ? ` M ${n(underline.x)} ${n(underline.y)} H ${n(underline.end)}`
    : ` H ${n(underline.end)}`
  return `${line}${rest}`
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

/** A branch line as it is drawn: the path, its arrowhead, and what a pattern is laid on it by. */
export interface BranchDrawing {
  /** the line and the underline it runs on into */
  d: string
  /** the arrowhead of a curve with an arrow, as the points of a polygon (`x,y x,y x,y`); null without one */
  head: string | null
  /** how long the line is up to where it ends (with an underline joined on, to the underline's end), in CSS pixels */
  length: number
  /** how much of that, from its start, lies under the topic it leaves */
  lead: number
  /**
   * The line may share a piece with the lines beside it: an elbow runs
   * across on the same trunk as its siblings. A pattern on such a line keeps
   * its dashes as they are (`fittedLinePattern`). Lines drawn together
   * (`mainBranchDrawings`, `subBranchDrawings`) share nothing: each draws its
   * own piece of a trunk.
   */
  shared: boolean
}

type Box = { left: number; top: number; right: number; bottom: number }

/**
 * An arrowhead on a line that runs on into its topic's underline goes at the
 * far end of the underline, the end of the text, so the line and the
 * underline read as one arrow. The underline stops at the head's base.
 */
function underlineHead(
  ends: Ends,
  options: ConnectorOptions,
): { underline: NonNullable<Ends['underline']>; head: Point[] } {
  const band = ends.underline!
  const way = Math.sign(band.end - band.x) || ends.side
  const size = headSize(options.width)
  const back = Math.min(headBack(size, options.width, options.pattern), Math.abs(band.end - band.x))
  return {
    underline: { ...band, end: band.end - way * back },
    head: arrowTriangle({ x: band.end, y: band.y }, { x: way, y: 0 }, size),
  }
}

/** The line of a shape between its ends, and the underline drawn on after it. */
function connector(
  shape: BranchLineShape,
  ends: Ends,
  options: ConnectorOptions,
): { line: Shaft; underline: Ends['underline'] } {
  if (shape === 'arrowedCurve' && ends.underline !== null && !ends.underline.apart) {
    const { underline, head } = underlineHead(ends, options)
    return { line: { ...shaft('curve', ends, options), head }, underline }
  }
  return { line: shaft(shape, ends, options), underline: ends.underline }
}

function drawing(
  shape: BranchLineShape,
  ends: Ends,
  options: ConnectorOptions,
  under: Box | null,
): BranchDrawing {
  const { line, underline } = connector(shape, ends, options)
  let length = pathLength(line.middle)
  if (underline !== null && !underline.apart)
    length += Math.abs(underline.end - ends.to.x) + distance(line.middle.at(-1)!, ends.to)
  return {
    d: drawn(line.line, underline),
    head: line.head ? line.head.map((point) => `${n(point.x)},${n(point.y)}`).join(' ') : null,
    length,
    lead: under ? leadInside(line.middle, under) : 0,
    shared: shape === 'elbow' || shape === 'roundedElbow',
  }
}

/** One line of several drawn together: its boxes and what it asks for. */
export interface BranchItem {
  box: BranchBoxes
  line?: BranchLine
}

/** A line made ready to draw: its shape, its ends, and the box it starts under (the central topic's). */
interface Planned {
  shape: BranchLineShape
  ends: Ends
  options: ConnectorOptions
  under: Box | null
}

function mainPlan(geometry: BranchGeometry, { box, line = {} }: BranchItem): Planned {
  return {
    shape: line.shape ?? 'curve',
    ends: mainEnds(geometry, box),
    options: { bend: 0.5, radius: geometry.cornerRadius, width: line.width, pattern: line.pattern },
    under: { left: box.pL, top: box.pT, right: box.pL + box.pW, bottom: box.pT + box.pH },
  }
}

function subPlan(geometry: BranchGeometry, { box, line = {} }: BranchItem): Planned {
  return {
    shape: line.shape ?? themeSubShape(geometry),
    ends: subEnds(geometry, box),
    options: {
      bend: 0.55,
      radius: geometry.cornerRadius,
      width: line.width,
      pattern: line.pattern,
    },
    under: null,
  }
}

/** From the central topic to a main topic. */
export function mainBranchDrawing(
  geometry: BranchGeometry,
  box: BranchBoxes,
  line: BranchLine = {},
): BranchDrawing {
  const plan = mainPlan(geometry, { box, line })
  return drawing(plan.shape, plan.ends, plan.options, plan.under)
}

/** From a topic to one below it. */
export function subBranchDrawing(
  geometry: BranchGeometry,
  box: BranchBoxes,
  line: BranchLine = {},
): BranchDrawing {
  const plan = subPlan(geometry, { box, line })
  return drawing(plan.shape, plan.ends, plan.options, plan.under)
}

/** All the lines from the central topic, drawn together so that a trunk they share is drawn once. */
export function mainBranchDrawings(
  geometry: BranchGeometry,
  items: readonly BranchItem[],
): BranchDrawing[] {
  return together(items.map((item) => mainPlan(geometry, item)))
}

/** The lines below one main topic, drawn together so that a trunk they share is drawn once. */
export function subBranchDrawings(
  geometry: BranchGeometry,
  items: readonly BranchItem[],
): BranchDrawing[] {
  return together(items.map((item) => subPlan(geometry, item)))
}

// ---- lines that share a trunk ----

/**
 * An elbow in a frame of its own: `u` runs along the piece that leaves the
 * parent and the piece that reaches the topic, `v` along the trunk between
 * them (for a level elbow `u` is x and `v` is y; for a falling one the other
 * way round).
 */
interface Elbow {
  /** its place among the lines drawn together */
  at: number
  falling: boolean
  /** where it leaves the parent */
  su: number
  sv: number
  /** where its trunk runs */
  tu: number
  /** where it reaches the topic */
  eu: number
  ev: number
  /** its corners; 0 for square ones */
  r: number
  /** the way from the parent to the trunk, and the way along the trunk */
  side: number
  fall: number
  /** its ends are level: no trunk, one straight piece */
  level: boolean
}

function elbowOf(at: number, plan: Planned): Elbow {
  const { falling, from, to } = plan.ends
  const s = falling ? { u: from.y, v: from.x } : { u: from.x, v: from.y }
  const e = falling ? { u: to.y, v: to.x } : { u: to.x, v: to.y }
  const du = e.u - s.u
  const dv = e.v - s.v
  const rounded = plan.shape === 'roundedElbow'
  return {
    at,
    falling,
    su: s.u,
    sv: s.v,
    tu: s.u + du / 2,
    eu: e.u,
    ev: e.v,
    r: rounded ? Math.max(0, Math.min(plan.options.radius, Math.abs(du) / 2, Math.abs(dv) / 2)) : 0,
    side: du >= 0 ? 1 : -1,
    fall: dv >= 0 ? 1 : -1,
    level: Math.abs(dv) < 1,
  }
}

/** Where a line that does not draw the whole of its elbow starts: on the piece from the parent (`u`), or on the trunk (`v`). */
type TrunkStart = { u: number } | { v: number }

/**
 * Splits a trunk among the elbows that run down it. The one that turns
 * nearest the parent draws the piece from the parent and its own turn, as it
 * always did. On each side of it along the trunk, every other one draws from
 * where the one before it turns off to where it turns off itself; the first
 * on a side starts with its own turn, where the piece from the parent ends.
 * So no piece of the trunk is drawn twice, and each piece carries the values
 * of the line that runs on from it. Null: the whole elbow.
 */
function trunkStarts(group: readonly Elbow[]): Array<[Elbow, TrunkStart | null]> {
  const reach = (elbow: Elbow): number => Math.abs(elbow.ev - elbow.sv)
  const owner = group.reduce((best, elbow) => (reach(elbow) < reach(best) ? elbow : best))
  const starts: Array<[Elbow, TrunkStart | null]> = [[owner, null]]
  // how far short of the trunk the owner's piece from the parent stops: at its turn
  const turnBack = owner.level ? 0 : owner.r
  for (const fall of [1, -1]) {
    let before: Elbow | null = !owner.level && owner.fall === fall ? owner : null
    const along = group
      .filter((elbow) => elbow !== owner && !elbow.level && elbow.fall === fall)
      .sort((a, b) => reach(a) - reach(b))
    for (const elbow of along) {
      starts.push([
        elbow,
        before
          ? { v: before.ev - fall * before.r }
          : { u: elbow.tu - elbow.side * Math.max(elbow.r, turnBack) },
      ])
      before = elbow
    }
  }
  for (const elbow of group) {
    if (elbow !== owner && elbow.level) starts.push([elbow, { v: elbow.sv }])
  }
  return starts
}

/** The part of an elbow from `start` on: its path data and the points along its middle. */
function elbowPiece(elbow: Elbow, start: TrunkStart): { d: string; middle: Point[] } {
  const { falling, tu, sv, eu, ev, r, side, fall, level } = elbow
  const at = (u: number, v: number): Point => (falling ? { x: v, y: u } : { x: u, y: v })
  const middle: Point[] = []
  let d = ''
  let here: Point = { x: 0, y: 0 }
  const move = (point: Point): void => {
    d = `M ${n(point.x)} ${n(point.y)}`
    here = point
    middle.push(point)
  }
  const line = (point: Point): void => {
    if (distance(here, point) < 0.005) return
    if (point.y === here.y) d += ` H ${n(point.x)}`
    else if (point.x === here.x) d += ` V ${n(point.y)}`
    else d += ` L ${n(point.x)} ${n(point.y)}`
    here = point
    middle.push(point)
  }
  const corner = (control: Point, point: Point): void => {
    if (r <= 0) return
    d += ` Q ${n(control.x)} ${n(control.y)} ${n(point.x)} ${n(point.y)}`
    middle.push(...cornerPoints(here, control, point))
    here = point
  }
  if ('u' in start) {
    move(at(start.u, sv))
    line(at(tu - side * r, sv))
    corner(at(tu, sv), at(tu, sv + fall * r))
  } else {
    move(at(tu, start.v))
  }
  if (level) {
    line(at(eu, sv))
  } else {
    line(at(tu, ev - fall * r))
    corner(at(tu, ev), at(tu + side * r, ev))
    line(at(eu, ev))
  }
  return { d, middle }
}

/**
 * The lines, drawn together. Elbows that leave the same point and run down
 * the same trunk split it among them (`trunkStarts`). A line no other line
 * leaves beside shares nothing, so a pattern on it is fitted to it.
 */
function together(plans: readonly Planned[]): BranchDrawing[] {
  const drawings = plans.map((plan) => drawing(plan.shape, plan.ends, plan.options, plan.under))
  const startOf = (plan: Planned): string => `${n(plan.ends.from.x)} ${n(plan.ends.from.y)}`
  const leaving = new Map<string, number>()
  for (const plan of plans) leaving.set(startOf(plan), (leaving.get(startOf(plan)) ?? 0) + 1)
  const trunks = new Map<string, Elbow[]>()
  plans.forEach((plan, at) => {
    if (plan.shape !== 'elbow' && plan.shape !== 'roundedElbow') return
    const elbow = elbowOf(at, plan)
    const key = `${elbow.falling} ${n(elbow.su)} ${n(elbow.sv)} ${Math.round(elbow.tu)}`
    trunks.set(key, [...(trunks.get(key) ?? []), elbow])
  })
  for (const group of trunks.values()) {
    if (group.length < 2) continue
    for (const [elbow, start] of trunkStarts(group)) {
      const whole = drawings[elbow.at]!
      if (start === null) {
        drawings[elbow.at] = { ...whole, shared: false }
        continue
      }
      const { ends } = plans[elbow.at]!
      const piece = elbowPiece(elbow, start)
      const band = ends.underline
      const joined = band !== null && !band.apart
      drawings[elbow.at] = {
        d: drawn(piece.d, band),
        head: null,
        length: pathLength(piece.middle) + (joined ? Math.abs(band.end - ends.to.x) : 0),
        lead: 0,
        shared: false,
      }
    }
  }
  plans.forEach((plan, at) => {
    if (leaving.get(startOf(plan)) === 1) drawings[at] = { ...drawings[at]!, shared: false }
  })
  return drawings
}

/** The path from the central topic to a main topic (its arrowhead, if any, is drawn apart). */
export function mainBranchPath(
  geometry: BranchGeometry,
  box: BranchBoxes,
  line: BranchLine = {},
): string {
  return mainBranchDrawing(geometry, box, line).d
}

/** The path from a topic to one below it (its arrowhead, if any, is drawn apart). */
export function subBranchPath(
  geometry: BranchGeometry,
  box: BranchBoxes,
  line: BranchLine = {},
): string {
  return subBranchDrawing(geometry, box, line).d
}

// ---- the middle of a line, as points ----

/** How many straight pieces a curve is followed with. */
const CURVE_STEPS = 24
/** How many a rounded corner is followed with. */
const CORNER_STEPS = 6

function cubicPoints(p0: Point, p1: Point, p2: Point, p3: Point): Point[] {
  const points: Point[] = []
  for (let step = 0; step <= CURVE_STEPS; step++) {
    const t = step / CURVE_STEPS
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

function distance(p: Point, q: Point): number {
  return Math.hypot(q.x - p.x, q.y - p.y)
}

/** The middle of a line of the given shape from `from` to `to`, as points: the same line its path draws. */
function middleLine(
  shape: BranchLineShape,
  falling: boolean,
  from: Point,
  to: Point,
  options: ConnectorOptions,
): Point[] {
  const { x: sx, y: sy } = from
  const { x: ex, y: ey } = to
  if (shape === 'none') return [to]
  if (shape === 'straight') return [from, to]
  if (shape === 'elbow' || shape === 'roundedElbow') {
    if (falling ? Math.abs(ex - sx) < 1 : Math.abs(ey - sy) < 1) return [from, to]
    const a: Point = falling ? { x: sx, y: (sy + ey) / 2 } : { x: (sx + ex) / 2, y: sy }
    const b: Point = falling ? { x: ex, y: (sy + ey) / 2 } : { x: (sx + ex) / 2, y: ey }
    if (shape === 'elbow') return [from, a, b, to]
    const r = Math.max(0, Math.min(options.radius, Math.abs(ex - sx) / 2, Math.abs(ey - sy) / 2))
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
  if (falling) {
    const my = sy + (ey - sy) * 0.5
    return cubicPoints(from, { x: sx, y: my }, { x: ex, y: my }, to)
  }
  const mx = sx + (ex - sx) * options.bend
  return cubicPoints(from, { x: mx, y: sy }, { x: mx, y: ey }, to)
}

function pathLength(points: readonly Point[]): number {
  let length = 0
  for (let at = 1; at < points.length; at++) length += distance(points[at - 1]!, points[at]!)
  return length
}

/** How far a line runs from its start before it comes out from under a box it starts inside. */
function leadInside(
  points: readonly Point[],
  box: { left: number; top: number; right: number; bottom: number },
): number {
  const inside = (p: Point): boolean =>
    p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom
  if (points.length === 0 || !inside(points[0]!)) return 0
  let lead = 0
  for (let at = 1; at < points.length; at++) {
    const p = points[at - 1]!
    const q = points[at]!
    if (inside(q)) {
      lead += distance(p, q)
      continue
    }
    // where the piece crosses the edge, found by halving
    let low = 0
    let high = 1
    for (let step = 0; step < 20; step++) {
      const mid = (low + high) / 2
      if (inside({ x: p.x + (q.x - p.x) * mid, y: p.y + (q.y - p.y) * mid })) low = mid
      else high = mid
    }
    return lead + distance(p, q) * low
  }
  return lead
}

// ---- the tapered line from the centre ----

/**
 * How much wider than its width a tapered line is where it leaves the
 * centre, and how many pixels wider at most: a wide line does not grow
 * without end, so the main lines that leave the centre side by side stay
 * apart.
 */
const TAPER_RATIO = 3
const TAPER_MAX_EXTRA = 4

/** How wide a tapered line of this width is where it leaves the central topic. */
export function taperBaseWidth(width: number): number {
  return Math.max(width, Math.min(width * TAPER_RATIO, width + TAPER_MAX_EXTRA))
}

/** The edge of a topic a line starts against: its direction, and the way out of the topic across it. */
interface StartEdge {
  along: Point
  out: Point
}

/**
 * A filled outline around a line through `points`, `widths[i]` wide at each:
 * a four-sided piece from each point to the next, and a disc at every point,
 * so the outline turns every corner round, as a line with round joins does.
 * Every piece goes round the same way, so they fill as one shape. Started
 * against the `edge` of a topic, the outline starts square along that edge,
 * and no disc reaches back across it: a wide start does not bulge into the
 * topic, even one drawn as an outline only.
 */
function stampedOutline(
  points: readonly Point[],
  widths: readonly number[],
  edge: StartEdge | null = null,
): string {
  const kept: Array<{ point: Point; half: number }> = []
  points.forEach((point, at) => {
    const last = kept.at(-1)
    const half = widths[at]! / 2
    if (last && distance(last.point, point) < 0.01) last.half = Math.max(last.half, half)
    else kept.push({ point, half })
  })
  const parts: string[] = []
  for (let at = 0; at + 1 < kept.length; at++) {
    const { point: p, half: hp } = kept[at]!
    const { point: q, half: hq } = kept[at + 1]!
    const length = distance(p, q)
    // the normal to the left of the way the line runs, so the four corners go round clockwise
    const nx = (q.y - p.y) / length
    const ny = -(q.x - p.x) / length
    // the very start lies along the edge, on the same side as that normal
    let sx = nx
    let sy = ny
    if (edge && at === 0) {
      const sign = edge.along.x * nx + edge.along.y * ny < 0 ? -1 : 1
      sx = edge.along.x * sign
      sy = edge.along.y * sign
    }
    parts.push(
      polygonPath([
        { x: p.x + sx * hp, y: p.y + sy * hp },
        { x: q.x + nx * hq, y: q.y + ny * hq },
        { x: q.x - nx * hq, y: q.y - ny * hq },
        { x: p.x - sx * hp, y: p.y - sy * hp },
      ]),
    )
  }
  const first = kept[0]?.point
  for (const { point, half } of kept) {
    if (edge && first && kept.length > 1) {
      const out = (point.x - first.x) * edge.out.x + (point.y - first.y) * edge.out.y
      if (out < half) continue
    }
    const r = n(half)
    parts.push(
      `M ${n(point.x + half)} ${n(point.y)} A ${r} ${r} 0 1 1 ${n(point.x - half)} ${n(point.y)}` +
        ` A ${r} ${r} 0 1 1 ${n(point.x + half)} ${n(point.y)} Z`,
    )
  }
  return parts.join(' ')
}

function polygonPath(points: readonly Point[]): string {
  return `M ${points.map((point) => `${n(point.x)} ${n(point.y)}`).join(' L ')} Z`
}

/**
 * A line from the central topic to a main topic, drawn tapered: a filled
 * outline that follows the line of the given shape, starting where an even
 * line starts, square along the central topic's edge. It is `taperBaseWidth`
 * wide there and narrows smoothly, faster at first, to the line's own width at
 * the topic. A curve with an arrow ends
 * in a filled arrowhead, the line stopping at its base; with the underline of
 * the line skeleton the head goes at the underline's far end. The underline of the
 * line skeleton goes on at the line's width, as part of the same outline. No
 * line (`none`) leaves the underline alone.
 */
export function taperedBranchPath(
  geometry: BranchGeometry,
  box: BranchBoxes,
  line: { shape: BranchLineShape; width: number },
): string {
  const ends = mainEnds(geometry, box)
  const { width } = line
  const parts: string[] = []
  const points: Point[] = []
  const widths: number[] = []
  let band = ends.underline
  if (line.shape !== 'none') {
    const options = { bend: 0.5, radius: geometry.cornerRadius, width }
    const drawn = connector(line.shape, ends, options)
    const { middle, head } = drawn.line
    band = drawn.underline
    const base = taperBaseWidth(width)
    const total = pathLength(middle)
    let along = 0
    middle.forEach((point, at) => {
      if (at > 0) along += distance(middle[at - 1]!, point)
      const left = total > 0 ? 1 - along / total : 0
      points.push(point)
      widths.push(width + (base - width) * left * left)
    })
    if (head) parts.push(polygonPath(head))
  }
  if (band !== null) {
    if (!band.apart && points.length > 0) {
      points.push({ x: band.x, y: band.y }, { x: band.end, y: band.y })
      widths.push(width, width)
    } else {
      parts.unshift(
        stampedOutline(
          [
            { x: band.x, y: band.y },
            { x: band.end, y: band.y },
          ],
          [width, width],
        ),
      )
    }
  }
  const edge: StartEdge = ends.falling
    ? { along: { x: 1, y: 0 }, out: { x: 0, y: 1 } }
    : { along: { x: 0, y: 1 }, out: { x: ends.side, y: 0 } }
  if (points.length > 0) parts.unshift(stampedOutline(points, widths, edge))
  const d = parts.filter((part) => part !== '').join(' ')
  return d !== '' ? d : `M ${n(ends.to.x)} ${n(ends.to.y)}`
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

/** A pattern laid onto one line: its dashes, where along them the line starts, and the ends of each dash. */
export interface FittedDash {
  dasharray: string
  /** CSS pixels, never below zero */
  dashoffset: number
  linecap: 'butt' | 'round'
}

/**
 * A pattern laid onto a branch line so that the line is seen to start and
 * end at its topics. The dashes start whole where the line comes out from
 * under the topic it leaves (`lead`), and the line ends with the end of a
 * dash: the dashes and gaps are all made a little longer or shorter, by the
 * same factor, to fit along the line a whole number of times. Round dots sit
 * half their width in from both ends, so each shows whole.
 *
 * Lines that leave one topic start at the same point and run on top of each
 * other for a little while. So on a line long enough for a few periods, the
 * first period keeps the pattern's own lengths and only the rest is
 * stretched: the dashes of such lines start alike and lie on each other
 * where the lines do. The dashes are then written out one by one, up to the
 * end of the line and a gap past it (`FITTED_MAX` numbers at most; a longer
 * list is stretched all along instead).
 *
 * A line that shares a piece with the lines beside it (`shared`: the trunk of
 * an elbow) is not stretched, since each line's own factor would set the
 * dashes of the shared piece apart; it only starts with a whole dash. A line
 * too short for a dash, a gap and a dash is one dash.
 */
export function fittedLinePattern(
  pattern: LinePattern,
  width: number,
  line: { length: number; lead: number; shared: boolean },
): FittedDash | null {
  if (pattern === 'solid') return null
  const unit = Math.max(1, width)
  const dashes = DASHES[pattern].map((length) => length * unit)
  const linecap = pattern === 'round-dot' ? 'round' : 'butt'
  const inset = linecap === 'round' ? width / 2 : 0
  const start = Math.max(0, line.lead) + inset
  const seen = line.length - start - inset
  const period = dashes.reduce((sum, length) => sum + length, 0)
  const first = dashes[0]!
  // finer than a path's points, and rounded where each dash ends, so no error adds up along the line
  const fine = (value: number): number => Math.round(value * 10000) / 10000
  const laid = (list: readonly number[]): FittedDash => {
    let along = 0
    const written = list.map((length) => {
      const from = fine(along)
      along += length
      return fine(fine(along) - from)
    })
    const total = written.reduce((sum, length) => sum + length, 0)
    const phase = total > 0 ? start % total : 0
    return {
      dasharray: written.join(' '),
      dashoffset: fine(phase === 0 ? 0 : total - phase),
      linecap,
    }
  }
  if (line.shared || !(seen > 0)) return laid(dashes)
  // whole periods, then the first dash: the line ends where that dash ends
  let periods = Math.round((seen - first) / period)
  if (seen < (first + period) / 2) periods = 0
  else periods = Math.max(1, periods)
  if (periods >= KEPT_FROM && (periods + 1) * dashes.length + 2 <= FITTED_MAX) {
    const scale = (seen - period) / ((periods - 1) * period + first)
    const rest = dashes.map((length) => length * scale)
    const list = [...dashes]
    for (let at = 1; at < periods; at++) list.push(...rest)
    // the last dash, and a gap past the end of the line so the list never starts again on it
    list.push(first * scale, line.length + period)
    return laid(list)
  }
  const fitted = periods * period + first
  const scale = fitted > 0 ? seen / fitted : 1
  return laid(dashes.map((length) => length * scale))
}

/** How many periods a line takes before its first one keeps the pattern's own lengths. */
const KEPT_FROM = 3
/** The most numbers a pattern laid onto one line is written with. */
const FITTED_MAX = 400

// ---- tree and timeline ----

/** Which topic a branch of a tree leaves from: the boxes of the three levels are measured differently. */
export type TreeParent = 'central' | 'main' | 'sub'

/** One branch of a tree: where its trunk starts, the topic it turns to, its corner, and the underline it runs on into. */
interface TreeLine {
  sx: number
  sy: number
  ex: number
  ey: number
  r: number
  /** the far end of the topic's underline; null without one */
  end: number | null
  /** how much of it lies under the topic it leaves */
  lead: number
}

function treeLine(geometry: BranchGeometry, box: BranchBoxes, from: TreeParent): TreeLine {
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
  return {
    sx,
    sy,
    ex,
    ey,
    r: Math.max(0, Math.min(radius, Math.abs(ex - sx), Math.abs(ey - sy))),
    end: underline === null ? null : cL + cW - childPadX,
    lead: toMain ? geometry.centralInset : 0,
  }
}

/** The branch from `top` on its trunk: down, the corner rounded, across, and on under the topic. */
function treePath(line: TreeLine, top: number): string {
  const { sx, ex, ey, r, end } = line
  const path =
    `M ${n(sx)} ${n(top)} V ${n(ey - r)} Q ${n(sx)} ${n(ey)} ${n(sx + r)} ${n(ey)}` + ` H ${n(ex)}`
  return end === null ? path : `${path} H ${n(end)}`
}

/**
 * A branch of a tree: down the trunk near the parent's left edge, then
 * across to the topic's left edge. All the branches of one parent run down
 * the same trunk; drawn on its own, a branch draws it from the top.
 */
export function treeBranchPath(
  geometry: BranchGeometry,
  box: BranchBoxes,
  from: TreeParent,
): string {
  const line = treeLine(geometry, box, from)
  return treePath(line, line.sy)
}

/** One branch of a tree among those drawn together. */
export interface TreeItem {
  box: BranchBoxes
  from: TreeParent
}

/**
 * The branches of a tree, drawn together. The branches of one parent run
 * down its trunk: the first from the top, each other one from where the one
 * above it turns off, so no piece of the trunk is drawn twice and each piece
 * carries the values of the branch that runs on from it.
 */
export function treeBranchDrawings(
  geometry: BranchGeometry,
  items: readonly TreeItem[],
): BranchDrawing[] {
  const lines = items.map((item) => treeLine(geometry, item.box, item.from))
  const trunks = new Map<string, number[]>()
  lines.forEach((line, at) => {
    const key = `${n(line.sx)} ${n(line.sy)}`
    trunks.set(key, [...(trunks.get(key) ?? []), at])
  })
  const drawings: BranchDrawing[] = []
  for (const trunk of trunks.values()) {
    trunk.sort((a, b) => lines[a]!.ey - lines[b]!.ey)
    let before: TreeLine | null = null
    for (const at of trunk) {
      const line = lines[at]!
      const { sx, ex, ey, r, end } = line
      const top = before ? before.ey - before.r : line.sy
      const turn = { x: sx, y: ey - r }
      const middle: Point[] = [
        { x: sx, y: top },
        turn,
        ...cornerPoints(turn, { x: sx, y: ey }, { x: sx + r, y: ey }),
        { x: ex, y: ey },
      ]
      if (end !== null) middle.push({ x: end, y: ey })
      drawings[at] = {
        d: treePath(line, top),
        head: null,
        length: pathLength(middle),
        lead: before ? 0 : line.lead,
        shared: false,
      }
      before = line
    }
  }
  return drawings
}

/** A step of a timeline as drawn: the line, and its arrowhead drawn apart. */
export interface TimelineStep {
  /** the line, and the underline of the topic it reaches */
  d: string
  /** the arrowhead: an open point, and the last piece of the line under it, to be stroked whole */
  arrow: string
  length: number
  lead: number
  shared: boolean
}

/** The point at `t` along a cubic curve, and the first part of the curve up to it. */
function cubicUpTo(p0: Point, p1: Point, p2: Point, p3: Point, t: number): [Point, Point, Point] {
  const mix = (p: Point, q: Point): Point => ({
    x: p.x + (q.x - p.x) * t,
    y: p.y + (q.y - p.y) * t,
  })
  const a = mix(p0, p1)
  const b = mix(p1, p2)
  const c = mix(p2, p3)
  const ab = mix(a, b)
  const bc = mix(b, c)
  return [a, ab, mix(ab, bc)]
}

/**
 * A step of a timeline: from the right edge of the step before (the central
 * topic for the first) to the left edge of this main topic, ending in an
 * arrowhead. The head is drawn apart, with the last piece of the line under
 * it, so a pattern never cuts it: the line stops at the head's base (a line
 * of round dots a gap before it, so its last dot shows whole). The head grows
 * with a line's own width (`width`); without one it keeps its size.
 */
export function timelineStepDrawing(
  geometry: BranchGeometry,
  box: BranchBoxes,
  fromCentral: boolean,
  line: { width?: number; pattern?: LinePattern } = {},
): TimelineStep {
  const { pT, pL, pW, pH, cT, cL, cW, cH } = box
  const underline = geometry.mainUnderline
  const sx = fromCentral ? pL + pW - geometry.centralInset : pL + pW
  const sy = fromCentral || underline === null ? pT + pH / 2 : underlineY(pT + pH, underline)
  const ey = underline === null ? cT + cH / 2 : underlineY(cT + cH, underline)
  const ex = cL - 2
  const size = headSize(line.width)
  const base = ex - size
  const stop = base - (line.pattern === 'round-dot' ? Math.max(1, line.width ?? 1) : 0)
  const start = { x: sx, y: sy }
  let d = `M ${n(sx)} ${n(sy)}`
  let middle: Point[] = [start]
  let neck: Point = { x: base, y: ey }
  if (stop > sx) {
    // the same curve as the whole step, cut where it reaches `stop`
    const mx = sx + (ex - sx) / 2
    const curve = [start, { x: mx, y: sy }, { x: mx, y: ey }, { x: ex, y: ey }] as const
    let low = 0
    let high = 1
    for (let step = 0; step < 40; step++) {
      const mid = (low + high) / 2
      if (cubicUpTo(...curve, mid)[2].x < stop) low = mid
      else high = mid
    }
    const [c1, c2, end] = cubicUpTo(...curve, low)
    d = `M ${n(sx)} ${n(sy)} C ${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(end.x)} ${n(end.y)}`
    middle = cubicPoints(start, c1, c2, end)
    if (stop === base) neck = end
  }
  const arrow =
    `M ${n(neck.x)} ${n(neck.y)} L ${n(ex)} ${n(ey)}` +
    ` M ${n(ex - size)} ${n(ey - size * 0.7)} L ${n(ex)} ${n(ey)}` +
    ` L ${n(ex - size)} ${n(ey + size * 0.7)}`
  return {
    d: underline === null ? d : `${d} M ${n(cL)} ${n(ey)} H ${n(cL + cW)}`,
    arrow,
    length: pathLength(middle),
    lead: fromCentral ? geometry.centralInset : 0,
    shared: false,
  }
}
