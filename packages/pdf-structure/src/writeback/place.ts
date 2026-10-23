/**
 * Placement of every translated block on its pages (decision 0057).
 *
 * Pure geometry, no PDFium. Two passes:
 *
 * 1. Measure: the largest size step at which each block fits its own boxes
 *    without touching anything around it; a block that only fits small
 *    also tries its box grown into the free space below, then to the right.
 * 2. Place, block by block in reading order: a uniform-size group (same
 *    role and source size, one table, one figure) is laid out at the
 *    group's most common step (weighted by text length), or smaller when
 *    a block needs it. Space a block grows into, and the ink it draws, is
 *    claimed; later blocks treat it as taken.
 *
 * A block that fits at no step down to the floor is not placed: it keeps
 * its source text (the caller reports it).
 */
import type { Rect } from '../tree/types'
import { layoutText, scaleSteps, type Layout, type Measurer } from './layout'

export interface PlanBlock {
  /** translation unit key */
  key: string
  text: string
  /** one box per part, display space */
  boxes: Rect[]
  /** page of each box */
  pages: number[]
  /** source size, points */
  size: number
  /** baseline-to-baseline distance as a multiple of the size */
  lineHeight: number
  align: 'left' | 'center'
  font: Measurer
  /** uniform-size group */
  group: string
  /** a single-box block that may grow into free space */
  expandable: boolean
  /**
   * the area the block's ink stays in, a drawing for its labels: it grows
   * inside it, sideways around its center first
   */
  container?: Rect
  /**
   * other box sets to try at each size before a smaller one (a table
   * paragraph's whole area, when its source top leaves too little room)
   */
  alternatives?: Rect[][]
}

export interface PageSpace {
  /** text objects on the page (display space) */
  text: Rect[]
  /** paths, images and forms on the page (display space) */
  shapes: Rect[]
  /** extent of the page's text: a block never grows past it */
  content: Rect
}

export interface Placement {
  layout: Layout
  /** the boxes the layout ran through (grown when it needed room) */
  boxes: Rect[]
}

/** a block that fits at this step or larger is not grown */
const EXPAND_BELOW = 0.9
/** room kept to the object below / to the right, as a share of the size */
const GAP_DOWN_EM = 0.2
const GAP_RIGHT_EM = 0.5
/** overlap tolerated between ink and an object, points */
const TOUCH = 0.25
/**
 * Visible ink of a line, as shares of the size above and below the
 * baseline. Glyphs seldom reach the font's full ascender and descender,
 * and the neighbors' boxes are tight glyph boxes too.
 */
const INK_ASCENT = 0.8
const INK_DESCENT = 0.15

/** the visible ink of each laid line */
export function inkOf(layout: Layout, font: Measurer): Rect[] {
  const size = layout.size
  const up = Math.min(font.ascent, INK_ASCENT) * size
  const down = Math.min(font.descent, INK_DESCENT) * size
  return layout.lines.map((l) => ({
    x0: l.x,
    y0: l.y - down,
    x1: l.x + font.measure(l.text) * size,
    y1: l.y + up,
  }))
}

const intersects = (a: Rect, b: Rect, tol = 0): boolean =>
  a.x0 < b.x1 - tol && a.x1 > b.x0 + tol && a.y0 < b.y1 - tol && a.y1 > b.y0 + tol

const contains = (outer: Rect, inner: Rect, tol = 1): boolean =>
  outer.x0 <= inner.x0 + tol &&
  outer.y0 <= inner.y0 + tol &&
  outer.x1 >= inner.x1 - tol &&
  outer.y1 >= inner.y1 - tol

interface Surroundings {
  /** rects the block's ink must stay clear of */
  obstacles: Rect[]
  /** rects holding the block (backdrop, frame): ink stays inside them */
  containers: Rect[]
}

/**
 * What surrounds a block on one page, near enough to matter: within an em
 * of the box, or below and right of it up to the page's text extent (where
 * it may grow). Anything overlapping the block's own box was there in the
 * source (its own text, an underline, a highlight). A shape holding the box
 * is its backdrop or frame; text and other blocks never hold it. Ink already
 * drawn for another block is clear of nothing: it is never drawn over, even
 * where the two blocks' source boxes overlapped.
 */
function surroundings(
  own: Rect,
  solid: readonly Rect[],
  shapes: readonly Rect[],
  drawn: readonly Rect[],
  content: Rect | undefined,
  size: number,
): Surroundings {
  const reach: Rect = {
    x0: own.x0 - size,
    y0: Math.min(own.y0, content?.y0 ?? own.y0) - size,
    x1: Math.max(own.x1, content?.x1 ?? own.x1) + size,
    y1: own.y1 + size,
  }
  const obstacles: Rect[] = []
  const containers: Rect[] = []
  for (const r of solid) if (!intersects(r, own) && intersects(r, reach)) obstacles.push(r)
  for (const r of drawn) if (intersects(r, reach)) obstacles.push(r)
  for (const r of shapes) {
    if (contains(r, own)) containers.push(r)
    else if (!intersects(r, own) && intersects(r, reach)) obstacles.push(r)
  }
  return { obstacles, containers }
}

/** the box grown down, then down and right, into free space */
function grownBoxes(box: Rect, around: Surroundings, content: Rect, size: number): Rect[] {
  let y0 = Math.min(box.y0, content.y0)
  for (const ob of around.obstacles) {
    if (ob.x0 < box.x1 && ob.x1 > box.x0 && ob.y1 <= box.y0 + 0.5) {
      y0 = Math.max(y0, ob.y1 + Math.max(1, GAP_DOWN_EM * size))
    }
  }
  for (const c of around.containers) y0 = Math.max(y0, c.y0 + 1)
  const down: Rect = { ...box, y0: Math.min(y0, box.y0) }
  let x1 = Math.max(box.x1, content.x1)
  for (const ob of around.obstacles) {
    if (ob.y0 < down.y1 && ob.y1 > down.y0 && ob.x0 >= box.x1 - 0.5) {
      x1 = Math.min(x1, ob.x0 - Math.max(3, GAP_RIGHT_EM * size))
    }
  }
  for (const c of around.containers) x1 = Math.min(x1, c.x1 - 1)
  const both: Rect = { ...down, x1: Math.max(x1, box.x1) }
  const out: Rect[] = []
  if (down.y0 < box.y0 - 0.5) out.push(down)
  if (both.x1 > box.x1 + 0.5) out.push(both)
  return out
}

/** a label's box widened evenly to both sides (it stays centered on its spot), then also down */
function grownAround(box: Rect, around: Surroundings, size: number): Rect[] {
  const gap = Math.max(2, GAP_DOWN_EM * size)
  let left = -Infinity
  let right = Infinity
  for (const ob of around.obstacles) {
    if (ob.y0 >= box.y1 || ob.y1 <= box.y0) continue
    if (ob.x1 <= box.x0 + 0.5) left = Math.max(left, ob.x1 + gap)
    if (ob.x0 >= box.x1 - 0.5) right = Math.min(right, ob.x0 - gap)
  }
  for (const c of around.containers) {
    left = Math.max(left, c.x0 + 1)
    right = Math.min(right, c.x1 - 1)
  }
  const half = Math.max(0, Math.min(box.x0 - left, right - box.x1))
  const wide: Rect = { ...box, x0: box.x0 - half, x1: box.x1 + half }
  let y0 = -Infinity
  for (const ob of around.obstacles) {
    if (ob.x0 < wide.x1 && ob.x1 > wide.x0 && ob.y1 <= box.y0 + 0.5) y0 = Math.max(y0, ob.y1 + gap)
  }
  for (const c of around.containers) y0 = Math.max(y0, c.y0 + 1)
  const tall: Rect = { ...wide, y0: Math.min(box.y0, y0) }
  const out: Rect[] = []
  if (half > 0.5) out.push(wide)
  if (tall.y0 < box.y0 - 0.5) out.push(tall)
  return out
}

interface Attempt {
  block: PlanBlock
  /** surroundings per box */
  around: Surroundings[]
}

/** the layout at `scale` when it fits its boxes and its ink is clear */
function tryAt(a: Attempt, boxes: readonly Rect[], scale: number): Layout | null {
  const { block } = a
  const layout = layoutText(block.text, boxes, block.size * scale, block.font, block)
  if (layout.overflowed) return null
  const ink = inkOf(layout, block.font)
  for (const [i, line] of layout.lines.entries()) {
    const around = a.around[line.box]!
    const r = ink[i]!
    if (around.obstacles.some((ob) => intersects(r, ob, TOUCH))) return null
    if (around.containers.some((c) => !contains(c, r, TOUCH))) return null
  }
  return layout
}

/** the first step from `from` on at which the block fits, in its boxes or grown ones */
function firstFit(
  a: Attempt,
  steps: readonly number[],
  from: number,
  content: Rect | undefined,
): { step: number; placement: Placement } | null {
  const { block } = a
  let grown: Rect[][] | undefined
  for (let k = from; k < steps.length; k++) {
    const own = tryAt(a, block.boxes, steps[k]!)
    if (own) return { step: k, placement: { layout: own, boxes: block.boxes } }
    for (const boxes of block.alternatives ?? []) {
      const layout = tryAt(a, boxes, steps[k]!)
      if (layout) return { step: k, placement: { layout, boxes } }
    }
    if (!block.expandable || !content || steps[k]! >= EXPAND_BELOW) continue
    grown ??= (
      block.container
        ? grownAround(block.boxes[0]!, a.around[0]!, block.size)
        : grownBoxes(block.boxes[0]!, a.around[0]!, content, block.size)
    ).map((b) => [b])
    for (const boxes of grown) {
      const layout = tryAt(a, boxes, steps[k]!)
      if (layout) return { step: k, placement: { layout, boxes } }
    }
  }
  return null
}

/** the group's most common step, weighted by text length; ties take the smaller size */
function groupSteps(blocks: readonly PlanBlock[], best: Map<string, number>): Map<string, number> {
  const weights = new Map<string, Map<number, number>>()
  for (const b of blocks) {
    const step = best.get(b.key)
    if (step === undefined) continue
    let w = weights.get(b.group)
    if (!w) weights.set(b.group, (w = new Map()))
    w.set(step, (w.get(step) ?? 0) + [...b.text].length)
  }
  const out = new Map<string, number>()
  for (const [group, w] of weights) {
    let pick = -1
    let most = -1
    for (const [step, weight] of w) {
      if (weight > most || (weight === most && step > pick)) {
        pick = step
        most = weight
      }
    }
    out.set(group, pick)
  }
  return out
}

/**
 * Place the blocks (in reading order). Returns unit key → placement, or
 * null for a block that keeps its source text.
 */
export function placeBlocks(
  blocks: readonly PlanBlock[],
  spaces: ReadonlyMap<number, PageSpace>,
  floorScale: number,
): Map<string, Placement | null> {
  const steps = scaleSteps(floorScale)
  const textOn = (page: number) => spaces.get(page)?.text ?? []
  const shapesOn = (page: number) => spaces.get(page)?.shapes ?? []
  const boxesOn = (page: number, except: PlanBlock): Rect[] =>
    blocks.flatMap((b) => (b === except ? [] : b.boxes.filter((_, i) => b.pages[i] === page)))

  const pageContent = (page: number) => spaces.get(page)?.content
  /** how far a block may reach: its container, else the page's text */
  const reachOf = (block: PlanBlock) => block.container ?? pageContent(block.pages[0]!)
  const near = (block: PlanBlock, i: number, drawn: readonly Rect[]) => {
    const page = block.pages[i]!
    return surroundings(
      block.boxes[i]!,
      [...textOn(page), ...boxesOn(page, block)],
      block.container ? [...shapesOn(page), block.container] : shapesOn(page),
      drawn,
      i === 0 && block.expandable ? reachOf(block) : undefined,
      block.size,
    )
  }

  // 1. measure against what is drawn and the other blocks' own boxes
  const best = new Map<string, number>()
  for (const block of blocks) {
    const around = block.boxes.map((_, i) => near(block, i, []))
    const fit = firstFit({ block, around }, steps, 0, reachOf(block))
    if (fit) best.set(block.key, fit.step)
  }
  const shared = groupSteps(blocks, best)

  // 2. place in order, claiming the ink and the grown space
  const claims = new Map<number, Rect[]>()
  const out = new Map<string, Placement | null>()
  for (const block of blocks) {
    const mine = best.get(block.key)
    if (mine === undefined) {
      out.set(block.key, null)
      continue
    }
    const from = Math.max(mine, shared.get(block.group) ?? mine)
    const around = block.boxes.map((_, i) => near(block, i, claims.get(block.pages[i]!) ?? []))
    const fit = firstFit({ block, around }, steps, from, reachOf(block))
    out.set(block.key, fit?.placement ?? null)
    if (!fit) continue
    const ink = inkOf(fit.placement.layout, block.font)
    fit.placement.layout.lines.forEach((line, i) => {
      const page = block.pages[line.box]!
      const list = claims.get(page) ?? []
      list.push(ink[i]!)
      claims.set(page, list)
    })
  }
  return out
}
