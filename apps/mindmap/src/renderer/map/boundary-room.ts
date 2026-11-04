/**
 * The room the map makes for its boundaries, before the library measures it
 * for the lines (`controller.ts` calls `make` right before the library's
 * `linkDiv`).
 *
 * The library lays the branches out as if there were no boundaries, so an
 * outline drawn around a few branches would touch the next branch, or the
 * next boundary, and its title would have no room on its top edge. Here each
 * boundary that is drawn gets room in the layout: the library's wrapper of
 * the first branch it goes around is given room on top (the outline's
 * padding, the shape's bulges and, for a titled one, the title written on
 * the top edge), the wrapper of the last one room below, and the first one
 * room on the side away from the parent when the title is wider than the
 * branches. Where the branches stand in a row (a timeline, a chart
 * downward), the room goes to their left and right instead, and room for the
 * title above the row goes to the row. The room is padding on the library's
 * elements (`data-mm-room` marks them), so it has no colour, and the lines,
 * the summaries and an export all follow it.
 *
 * Boundaries inside another are given their room first, so the one around
 * them makes room around their drawings too. A map without boundaries is
 * left exactly as the library lays it out: nothing is written on it, and
 * what an earlier drawing wrote is taken away.
 *
 * How far a drawing reaches past its branches is `boundaryReach` of
 * `boundary-shapes.ts`, the same rule the outlines are drawn by.
 */
import type { MindElixirInstance, Topic } from 'mind-elixir'
import { boundariesOf } from '../document/convert'
import { BOUNDARY_LAYER_CLASS, BOUNDARY_TITLE_CLASS } from './relations'
import {
  BOUNDARY_NEST_GAP,
  BOUNDARY_WIDTH,
  boundaryPaint,
  boundaryReach,
  type Pads,
  type Rect,
  unionRect,
} from './boundary-shapes'

const SVG = 'http://www.w3.org/2000/svg'

/** The mark on an element of the library that has room of this module. */
export const ROOM_MARK = 'data-mm-room'
/** Half the gap that stays between a boundary's drawing and what is next to it. */
export const ROOM_HALF_GAP = 5
/** The padding of a title's chip at each end of its text (`relations.ts`). */
const CHIP_PAD = 5

const SIDES = ['top', 'bottom', 'left', 'right'] as const

/** One outline to make room for: the wrappers of the branches it goes around, in order. */
interface Piece {
  wrappers: HTMLElement[]
  shape: ReturnType<typeof boundaryPaint>['shape']
  titleWidth: number
  withTitle: boolean
  grow: 'left' | 'right'
  /** half the width of its line, which stands out of its outline */
  stroke: number
  /** the branches stand in a row: the room goes to their left and right */
  row: boolean
  /** how many wrappers deep the first one is */
  depth: number
  order: number
}

export class BoundaryRoom {
  readonly #mind: MindElixirInstance
  #measureText: ((text: string) => number) | null = null

  constructor(mind: MindElixirInstance) {
    this.#mind = mind
  }

  /**
   * Makes the room of every boundary of the map anew. True when the room is
   * not what it was, so every branch has to be measured again.
   */
  make(): boolean {
    const nodes = this.#mind.nodes
    const before = new Map<Element, string>()
    for (const element of nodes.querySelectorAll<HTMLElement>(`[${ROOM_MARK}]`)) {
      before.set(element, element.getAttribute(ROOM_MARK) ?? '')
      element.removeAttribute(ROOM_MARK)
      for (const side of SIDES) element.style.removeProperty(`padding-${side}`)
    }
    const room = new Map<HTMLElement, Pads>()
    const boundaries = boundariesOf({ meta: this.#mind.meta })
    const frame = boundaries.length > 0 ? this.#frame() : null
    if (frame) {
      const pieces = this.#pieces(boundaries)
      // the inner ones first: deeper, then smaller, then in the order of the file
      const order = [...pieces].sort(
        (a, b) => b.depth - a.depth || a.wrappers.length - b.wrappers.length || a.order - b.order,
      )
      const done: Piece[] = []
      for (const piece of order) {
        this.#roomFor(piece, done, frame, room)
        done.push(piece)
      }
    }
    let changed = false
    for (const [element, pads] of room) {
      const value = SIDES.map((side) => round(pads[side])).join(' ')
      element.setAttribute(ROOM_MARK, value)
      if (before.get(element) !== value) changed = true
      before.delete(element)
    }
    return changed || before.size > 0
  }

  /** The outlines of the map that are drawn around wrappers of the library (not the whole map). */
  #pieces(boundaries: ReturnType<typeof boundariesOf>): Piece[] {
    const topics = new Map<string, Topic>()
    for (const topic of this.#mind.nodes.querySelectorAll<Topic>('me-tpc')) {
      const id = topic.nodeObj?.id
      if (typeof id === 'string' && !topics.has(id)) topics.set(id, topic)
    }
    const pieces: Piece[] = []
    boundaries.forEach((boundary, order) => {
      const owner = topics.get(boundary.topicId)
      if (!owner?.nodeObj) return
      let wrappers: HTMLElement[] = []
      if (boundary.range === 'master') {
        // around the whole map: the map's own margin is its room
        if (!owner.nodeObj.parent) return
        const own = wrapperOf(owner)
        if (own) wrappers = [own]
      } else {
        const children = owner.nodeObj.children ?? []
        for (let at = boundary.range.start; at <= boundary.range.end; at++) {
          const child = children[at]
          const topic = child ? topics.get(child.id) : undefined
          const wrapper = topic ? wrapperOf(topic) : null
          if (wrapper) wrappers.push(wrapper)
        }
      }
      if (wrappers.length === 0) return
      const paint = boundaryPaint(boundary.style)
      const title = boundary.title.trim()
      // drawn once per side of the central topic, the title on the first
      const sides = new Map<string, HTMLElement[]>()
      for (const wrapper of wrappers) {
        const side = wrapper.closest('me-main')?.className ?? ''
        sides.set(side, [...(sides.get(side) ?? []), wrapper])
      }
      let first = true
      for (const [side, group] of sides) {
        const withTitle = first && title !== ''
        pieces.push({
          wrappers: group,
          shape: paint.shape,
          withTitle,
          titleWidth: withTitle ? this.#textWidth(title) + 2 * CHIP_PAD + 2 : 0,
          grow: side.includes('lhs') ? 'left' : 'right',
          stroke: (paint.width ?? BOUNDARY_WIDTH) / 2,
          row: this.#inRow(group[0]!),
          depth: depthOf(group[0]!),
          order,
        })
        first = false
      }
    })
    return pieces
  }

  /** Room for one outline, with the room of those inside it already made. */
  #roomFor(
    piece: Piece,
    before: readonly Piece[],
    frame: Frame,
    room: Map<HTMLElement, Pads>,
  ): void {
    const content = this.#content(piece, before, frame)
    if (!content) return
    const reach = widen(boundaryReach({ content, ...piece }), piece.stroke)
    const first = piece.wrappers[0]!
    const last = piece.wrappers[piece.wrappers.length - 1]!
    const add = (element: HTMLElement, side: (typeof SIDES)[number], amount: number): void => {
      if (!(amount > 0.5)) return
      const pads = room.get(element) ?? { top: 0, bottom: 0, left: 0, right: 0 }
      pads[side] += Math.ceil(amount)
      room.set(element, pads)
      element.style.setProperty(`padding-${side}`, `${pads[side]}px`)
    }
    const boxes = piece.wrappers.map((wrapper) => rectIn(frame, wrapper))
    const top = rectIn(frame, first)
    const bottom = rectIn(frame, last)
    if (piece.row) {
      add(first, 'left', reach.left + ROOM_HALF_GAP - (content.x - top.x))
      add(
        last,
        'right',
        reach.right + ROOM_HALF_GAP - (bottom.x + bottom.w - content.x - content.w),
      )
      // above a row of branches under a parent: room for all of the row, so it stays a row
      const holder = first.parentElement
      if (holder?.localName === 'me-children') {
        const above = Math.min(...boxes.map((box) => box.y))
        add(holder, 'top', reach.top + ROOM_HALF_GAP - (content.y - above))
      }
      return
    }
    // half the space between two wrappers is this one's to take (the other half, the neighbour's)
    const gapTo = (other: Element | null, after: boolean): number => {
      if (other?.localName !== 'me-wrapper') return 0
      const box = rectIn(frame, other)
      return Math.max(0, after ? box.y - (bottom.y + bottom.h) : top.y - (box.y + box.h)) / 2
    }
    const above = gapTo(first.previousElementSibling, false)
    const below = gapTo(last.nextElementSibling, true)
    add(first, 'top', reach.top + ROOM_HALF_GAP - (content.y - top.y) - above)
    add(
      last,
      'bottom',
      reach.bottom + ROOM_HALF_GAP - (bottom.y + bottom.h - content.y - content.h) - below,
    )
    // the side away from the parent, for a title wider than the branches
    if (piece.grow === 'left') {
      const edge = Math.min(...boxes.map((box) => box.x))
      add(first, 'left', reach.left + ROOM_HALF_GAP - (content.x - edge))
    } else {
      const edge = Math.max(...boxes.map((box) => box.x + box.w))
      add(first, 'right', reach.right + ROOM_HALF_GAP - (edge - content.x - content.w))
    }
  }

  /**
   * What an outline goes around now: the topics shown in its wrappers, and
   * the drawings of the outlines inside them (`before`: the outlines given
   * room before this one, in that order).
   */
  #content(piece: Piece, before: readonly Piece[], frame: Frame): Rect | null {
    const rects: Rect[] = []
    for (const wrapper of piece.wrappers) {
      for (const shown of wrapper.querySelectorAll('me-tpc, me-epd:not(.minus)')) {
        rects.push(rectIn(frame, shown))
      }
    }
    before.forEach((inner, at) => {
      const within = inner.wrappers.every((wrapper) =>
        piece.wrappers.some((outer) => outer.contains(wrapper)),
      )
      if (!within) return
      const drawn = this.#drawn(inner, before.slice(0, at), frame)
      if (drawn) rects.push(grow(drawn, BOUNDARY_NEST_GAP))
    })
    return unionRect(rects)
  }

  /** Where the drawing of an outline (with its title) reaches now. */
  #drawn(piece: Piece, before: readonly Piece[], frame: Frame): Rect | null {
    const content = this.#content(piece, before, frame)
    if (!content) return null
    const reach = widen(boundaryReach({ content, ...piece }), piece.stroke)
    return {
      x: content.x - reach.left,
      y: content.y - reach.top,
      w: content.w + reach.left + reach.right,
      h: content.h + reach.top + reach.bottom,
    }
  }

  /** How wide a title is written: measured as the boundaries' layer writes it (`map.css`). */
  #textWidth(text: string): number {
    if (!this.#measureText) {
      const doc = this.#mind.nodes.ownerDocument
      const layer = doc.createElementNS(SVG, 'svg')
      layer.setAttribute('class', BOUNDARY_LAYER_CLASS)
      const title = doc.createElementNS(SVG, 'text')
      title.setAttribute('class', BOUNDARY_TITLE_CLASS)
      layer.appendChild(title)
      this.#measureText = (value) => {
        title.textContent = value
        this.#mind.nodes.appendChild(layer)
        try {
          const measured = title.getComputedTextLength()
          if (measured > 0) return measured
        } catch {
          // measured as below
        } finally {
          layer.remove()
        }
        // where the page cannot measure text
        let width = 0
        for (const char of value) width += (char.codePointAt(0) ?? 0) >= 0x1100 ? 12 : 7
        return width
      }
    }
    return this.#measureText(text)
  }

  /**
   * The wrappers of this one's parent stand in a row: the main branches of a
   * map laid out downward (a timeline too), and the branches below them where
   * the library's own layout downward is drawn.
   */
  #inRow(wrapper: HTMLElement): boolean {
    if (!this.#mind.nodes.classList.contains('down')) return false
    const holder = wrapper.parentElement
    return holder?.localName === 'me-main' || this.#mind.container.dataset.mmStructure === undefined
  }

  #frame(): Frame | null {
    const nodes = this.#mind.nodes
    const rect = nodes.getBoundingClientRect()
    if (!(rect.width > 0) || !(nodes.offsetWidth > 0)) return null
    return { rect, scale: rect.width / nodes.offsetWidth }
  }
}

interface Frame {
  rect: DOMRect
  scale: number
}

/** The library's wrapper of a topic (with the branches below it); null for the central topic. */
function wrapperOf(topic: Element): HTMLElement | null {
  const wrapper = topic.parentElement?.parentElement
  return wrapper?.localName === 'me-wrapper' ? (wrapper as HTMLElement) : null
}

function depthOf(element: Element): number {
  let depth = 0
  for (let at = element.parentElement; at; at = at.parentElement) {
    if (at.localName === 'me-wrapper') depth++
  }
  return depth
}

function rectIn(frame: Frame, element: Element): Rect {
  const rect = element.getBoundingClientRect()
  return {
    x: (rect.left - frame.rect.left) / frame.scale,
    y: (rect.top - frame.rect.top) / frame.scale,
    w: rect.width / frame.scale,
    h: rect.height / frame.scale,
  }
}

function widen(pads: Pads, by: number): Pads {
  return {
    top: pads.top + by,
    bottom: pads.bottom + by,
    left: pads.left + by,
    right: pads.right + by,
  }
}

function grow(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + 2 * by, h: rect.h + 2 * by }
}

function round(value: number): string {
  return String(Math.round(value))
}
