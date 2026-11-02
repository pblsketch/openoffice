/**
 * What this editor draws of the things that hang on no branch, on top of the
 * library's drawing: the format of relationships, the shape of summary
 * brackets, and boundaries. The values come from the records' `metadata` and
 * the data's boundaries (`document/convert.ts`), through the filter
 * (`relationship-shapes.ts`, `summary-shapes.ts`, `boundary-shapes.ts`).
 *
 * Relationships. The library draws each one as a group: its line, the
 * library's own arrowhead at the end and, for a line in two directions, at
 * the start. A relationship without values is left exactly as the library
 * drew it (`map.css` gives it the map's colour, 1.5 wide, dashed). One with
 * values gets:
 *
 * - its colour, width and dashes on the line (the same values are the
 *   library's line options, so the library keeps them while a curve is
 *   dragged), and a `data-mm-color` / `data-mm-width` / `data-mm-pattern`
 *   mark on the group so the map's rules leave those to it;
 * - a path of its own for a shape that is not curved, and the title moved to
 *   the middle of it;
 * - the two ends drawn by this app (`mm-rel-end`). The library's arrowheads
 *   are hidden and carry the same paths, so the selection's glow and the
 *   places that take a click follow the ends that are drawn.
 *
 * Only a curved relationship has the library's handles; the others hide them
 * when selected, and the curve the file keeps is never touched by drawing.
 *
 * Summaries. A bracket with a shape gets the path of that shape in the room
 * the library gave it; one without (or with `bracket`, the library's own)
 * keeps the library's path.
 *
 * Boundaries. Drawn in a layer of their own (`mm-boundaries`), the first
 * thing in the map, so that topics and lines lie on top. A boundary goes
 * around the boxes of the topics it covers and every topic shown below them;
 * a folded branch is its own box. A boundary none of whose topics is shown is
 * not drawn. One whose topics stand on both sides of the central topic is
 * drawn once per side, its title on the first. A `master` boundary on the
 * central topic goes around the whole map. Each outline is a group marked
 * with the boundary's id (`data-mm-boundary`), and so is its title. The
 * title is text (`textContent`), never markup. A map without boundaries has
 * no layer at all.
 *
 * No colour is written here except a filtered value of the file; every other
 * colour is a `--mm-` property, given by `map.css`.
 */
import type { MindElixirInstance, Topic } from 'mind-elixir'
import { boundariesOf, type MapArrow, type MapSummary } from '../document/convert'
import {
  BOUNDARY_WIDTH,
  boundaryPaint,
  boundaryPath,
  boundaryPieces,
  type Rect,
} from './boundary-shapes'
import { linePatternDash } from './branches'
import {
  arrowMarker,
  type Box,
  type RelationshipEnd,
  relationshipArrowStyle,
  relationshipGeometry,
  relationshipLinecap,
  relationshipPaint,
  RELATIONSHIP_WIDTH,
} from './relationship-shapes'
import { parseSummaryFrame, summaryBracketPath, summaryPaint } from './summary-shapes'

const SVG = 'http://www.w3.org/2000/svg'

/** The layer the boundaries are drawn in. */
export const BOUNDARY_LAYER_CLASS = 'mm-boundaries'
/** The attribute that names the boundary an outline or a title belongs to. */
export const BOUNDARY_ID_ATTRIBUTE = 'data-mm-boundary'
export const BOUNDARY_SHAPE_CLASS = 'mm-boundary-shape'
export const BOUNDARY_TITLE_CLASS = 'mm-boundary-title'
/** An end of a relationship drawn by this app. */
export const RELATIONSHIP_END_CLASS = 'mm-rel-end'

/** How far a boundary's title stands above its outline. */
const TITLE_RISE = 5
/** How far in from the outline's left edge the title starts. */
const TITLE_INSET = 12

/** The group the library draws a relationship in. */
interface ArrowGroup extends SVGGElement {
  arrowObj?: MapArrow
  line?: SVGPathElement
  arrow1?: SVGPathElement
  arrow2?: SVGPathElement
  labelEl?: HTMLElement
}

/** The group the library draws a summary in. */
interface SummaryGroup extends SVGGElement {
  summaryObj?: MapSummary
}

/** How the map is laid out now: its frame and the scale the screen draws it at. */
interface Frame {
  rect: DOMRect
  scale: number
}

export class RelationDrawer {
  readonly #mind: MindElixirInstance
  /** the paths the library gave the brackets, kept while their elements live */
  readonly #libraryBrackets = new WeakMap<Element, string>()
  /** the curves the library drew the relationships with, kept while their elements live */
  readonly #libraryCurves = new WeakMap<Element, LibraryCurve>()
  #layer: SVGSVGElement | null = null

  constructor(mind: MindElixirInstance) {
    this.#mind = mind
  }

  /** After the library drew the lines, the relationships and the summaries. */
  drawAll(): void {
    this.drawRelationships()
    this.drawSummaries()
    this.drawBoundaries()
  }

  // ---- relationships ----

  drawRelationships(): void {
    // measured once, and only when a relationship of a shape other than the curve needs it
    let measured: { frame: Frame | null; topics: Map<string, Topic> } | null = null
    const measure = () => (measured ??= { frame: this.#frame(), topics: this.#topicsById() })
    for (const group of this.#arrowGroups()) this.#drawRelationship(group, measure)
    this.fitHandles()
  }

  /** The library's handles go with a curve only: a relationship of another shape shows none. */
  fitHandles(): void {
    const mind = this.#mind
    const current = mind.currentArrow as ArrowGroup | null | undefined
    if (!current?.arrowObj) return
    if (relationshipPaint(current.arrowObj.metadata?.style).shape === 'curved') return
    for (const handle of [mind.linkController, mind.P2, mind.P3]) {
      ;(handle as unknown as ElementCSSInlineStyle | undefined)?.style.setProperty(
        'display',
        'none',
      )
    }
  }

  #arrowGroups(): ArrowGroup[] {
    const svg = this.#mind.arrowSvg as Element | undefined
    if (!svg) return []
    return [...svg.children].filter((child): child is ArrowGroup => child.localName === 'g')
  }

  #drawRelationship(
    group: ArrowGroup,
    measure: () => { frame: Frame | null; topics: Map<string, Topic> },
  ): void {
    const arrow = group.arrowObj
    const line = group.line
    if (!arrow || !line) return
    // the curve the library drew last: a shape of this editor has replaced it on the line
    const fresh = libraryCurve(line.getAttribute('d') ?? '')
    if (fresh) this.#libraryCurves.set(line, fresh)
    const drawn = fresh ?? this.#libraryCurves.get(line)
    if (!drawn) return
    for (const end of group.querySelectorAll(`.${RELATIONSHIP_END_CLASS}`)) end.remove()
    const paint = relationshipPaint(arrow.metadata?.style)
    // the library's own options for the line, so a curve being dragged keeps them
    const lineStyle = relationshipArrowStyle(paint)
    if (JSON.stringify(lineStyle) !== JSON.stringify(arrow.style)) {
      if (lineStyle) arrow.style = lineStyle
      else delete arrow.style
    }
    setMark(group, 'data-mm-color', paint.color !== null)
    setMark(group, 'data-mm-width', paint.width !== null)
    setMark(group, 'data-mm-pattern', paint.pattern !== null)
    const heads = [group.arrow1, group.arrow2].filter((head) => head !== undefined)
    if (paint.plain) {
      for (const head of heads) {
        head.removeAttribute('visibility')
        hitOf(head)?.removeAttribute('visibility')
      }
      return
    }

    const width = paint.width ?? RELATIONSHIP_WIDTH
    if (paint.color !== null) line.setAttribute('stroke', paint.color)
    if (paint.width !== null) line.setAttribute('stroke-width', String(paint.width))
    if (lineStyle?.strokeDasharray) line.setAttribute('stroke-dasharray', lineStyle.strokeDasharray)
    const linecap = relationshipLinecap(paint)
    if (linecap) line.setAttribute('stroke-linecap', linecap)

    let begin: RelationshipEnd = { tip: drawn.p1, from: drawn.c1 }
    let end: RelationshipEnd = { tip: drawn.p2, from: drawn.c2 }
    if (paint.shape !== 'curved') {
      const { frame, topics } = measure()
      const at = (id: string, fallback: { x: number; y: number }): Box => {
        const topic = topics.get(id)
        return frame && topic ? boxIn(frame, topic) : { cx: fallback.x, cy: fallback.y, w: 0, h: 0 }
      }
      const shape = relationshipGeometry(paint.shape, {
        from: at(arrow.from, drawn.p1),
        to: at(arrow.to, drawn.p2),
        c1: drawn.c1,
        c2: drawn.c2,
      })
      line.setAttribute('d', shape.d)
      hitOf(line)?.setAttribute('d', shape.d)
      begin = shape.begin
      end = shape.end
      placeLabel(group.labelEl, shape.label.x, shape.label.y)
    }

    const markers = [
      { kind: paint.begin, at: begin, head: group.arrow2, name: 'begin' },
      { kind: paint.end, at: end, head: group.arrow1, name: 'end' },
    ]
    for (const { kind, at, head, name } of markers) {
      const marker = arrowMarker(kind, at.tip, at.from, width)
      if (head) {
        // hidden, with the path of the end drawn: the selection glow and the click follow it
        head.setAttribute('d', marker?.d ?? '')
        head.setAttribute('visibility', 'hidden')
        hitOf(head)?.setAttribute('d', marker?.d ?? '')
      }
      if (!marker) continue
      const path = group.ownerDocument.createElementNS(SVG, 'path')
      path.setAttribute('class', RELATIONSHIP_END_CLASS)
      path.setAttribute('data-mm-end', name)
      path.setAttribute('d', marker.d)
      path.setAttribute('stroke-linecap', 'round')
      path.setAttribute('stroke-linejoin', 'round')
      if (paint.color !== null) path.setAttribute('stroke', paint.color)
      if (paint.width !== null) path.setAttribute('stroke-width', String(paint.width))
      if (!marker.filled) path.setAttribute('fill', 'none')
      else if (paint.color !== null) path.setAttribute('fill', paint.color)
      else path.setAttribute('data-mm-filled', '')
      group.appendChild(path)
    }
    // the glow of a selected relationship copies the paths it is made of
    const glow = group.querySelector('.arrow-highlight')
    if (glow) {
      const copies = glow.querySelectorAll('path')
      copies[0]?.setAttribute('d', line.getAttribute('d') ?? '')
      copies[1]?.setAttribute('d', group.arrow1?.getAttribute('d') ?? '')
      copies[2]?.setAttribute('d', group.arrow2?.getAttribute('d') ?? '')
    }
  }

  // ---- summaries ----

  drawSummaries(): void {
    const svg = this.#mind.summarySvg as Element | undefined
    if (!svg) return
    for (const group of svg.children as HTMLCollectionOf<SummaryGroup>) {
      const summary = group.summaryObj
      const path = group.querySelector('path')
      if (!summary || !path) continue
      let library = this.#libraryBrackets.get(path)
      if (library === undefined) {
        library = path.getAttribute('d') ?? ''
        this.#libraryBrackets.set(path, library)
      }
      const { shape } = summaryPaint(summary.metadata?.style)
      const frame = shape && shape !== 'bracket' ? parseSummaryFrame(library) : null
      if (!shape || !frame) {
        if (path.getAttribute('d') !== library) path.setAttribute('d', library)
        group.removeAttribute('data-mm-shape')
        continue
      }
      path.setAttribute('d', summaryBracketPath(shape, frame))
      group.setAttribute('data-mm-shape', shape)
    }
  }

  // ---- boundaries ----

  drawBoundaries(): void {
    const nodes = this.#mind.nodes
    const boundaries = boundariesOf({ meta: this.#mind.meta })
    if (boundaries.length === 0) {
      this.#layer?.remove()
      return
    }
    const doc = nodes.ownerDocument
    const layer = this.#layer ?? doc.createElementNS(SVG, 'svg')
    this.#layer = layer
    layer.setAttribute('class', BOUNDARY_LAYER_CLASS)
    layer.setAttribute('overflow', 'visible')
    layer.replaceChildren()
    // first in the map, so everything else lies on top
    if (nodes.firstChild !== layer) nodes.insertBefore(layer, nodes.firstChild)

    const frame = this.#frame()
    if (!frame) return
    const topics = this.#topicsById()
    for (const boundary of boundaries) {
      const pieces = boundaryPieces(this.#enclosed(boundary, frame, topics))
      const paint = boundaryPaint(boundary.style)
      for (const piece of pieces) {
        const group = doc.createElementNS(SVG, 'g')
        group.setAttribute(BOUNDARY_ID_ATTRIBUTE, boundary.id)
        setMark(group, 'data-mm-color', paint.color !== null)
        setMark(group, 'data-mm-width', paint.width !== null)
        setMark(group, 'data-mm-fill', paint.fill !== null)
        const outline = doc.createElementNS(SVG, 'path')
        outline.setAttribute('class', BOUNDARY_SHAPE_CLASS)
        outline.setAttribute('d', boundaryPath(paint.shape, piece.rect))
        if (paint.color !== null) outline.setAttribute('stroke', paint.color)
        if (paint.width !== null) outline.setAttribute('stroke-width', String(paint.width))
        if (paint.fill !== null) outline.setAttribute('fill', paint.fill)
        else if (paint.color !== null) {
          // the faint fill of a boundary without one is the colour of its line
          outline.setAttribute('fill', paint.color)
          outline.setAttribute('fill-opacity', '0.08')
        }
        const dash = paint.pattern
          ? linePatternDash(paint.pattern, paint.width ?? BOUNDARY_WIDTH)
          : null
        if (dash) {
          outline.setAttribute('stroke-dasharray', dash.dasharray)
          outline.setAttribute('stroke-linecap', dash.linecap)
        }
        group.appendChild(outline)
        if (piece.withTitle && boundary.title.trim() !== '') {
          const title = doc.createElementNS(SVG, 'text')
          title.setAttribute('class', BOUNDARY_TITLE_CLASS)
          title.setAttribute(BOUNDARY_ID_ATTRIBUTE, boundary.id)
          title.setAttribute('x', num(piece.rect.x + TITLE_INSET))
          title.setAttribute('y', num(piece.rect.y - TITLE_RISE))
          title.textContent = boundary.title
          group.appendChild(title)
        }
        layer.appendChild(group)
      }
    }
  }

  /** The boxes a boundary goes around, one group per side of the central topic, in the order of its range. */
  #enclosed(
    boundary: { topicId: string; range: { start: number; end: number } | 'master' },
    frame: Frame,
    topics: Map<string, Topic>,
  ): Rect[][] {
    const owner = topics.get(boundary.topicId)
    if (!owner?.nodeObj) return []
    const rectsBelow = (topic: Topic): Rect[] => {
      const wrapper = topic.parentElement?.parentElement
      const shown =
        wrapper && wrapper.localName === 'me-wrapper'
          ? [...wrapper.querySelectorAll('me-tpc')]
          : [topic]
      return shown.map((element) => rectIn(frame, element))
    }
    if (boundary.range === 'master') {
      if (!owner.nodeObj.parent) {
        return [[...this.#mind.nodes.querySelectorAll('me-tpc')].map((el) => rectIn(frame, el))]
      }
      return [rectsBelow(owner)]
    }
    const groups = new Map<string, Rect[]>()
    const children = owner.nodeObj.children ?? []
    for (let at = boundary.range.start; at <= boundary.range.end; at++) {
      const child = children[at]
      // under a folded topic the branches are not drawn
      const topic = child ? topics.get(child.id) : undefined
      if (!topic) continue
      const side = topic.closest('me-main')?.className ?? ''
      const group = groups.get(side) ?? []
      group.push(...rectsBelow(topic))
      groups.set(side, group)
    }
    return [...groups.values()]
  }

  // ---- measuring ----

  /** The map's frame and scale; null while it has no size. */
  #frame(): Frame | null {
    const nodes = this.#mind.nodes
    const rect = nodes.getBoundingClientRect()
    if (!(rect.width > 0) || !(nodes.offsetWidth > 0)) return null
    return { rect, scale: rect.width / nodes.offsetWidth }
  }

  /** Every topic drawn, by id. Ids are matched as values, never put into a selector. */
  #topicsById(): Map<string, Topic> {
    const out = new Map<string, Topic>()
    for (const topic of this.#mind.nodes.querySelectorAll<Topic>('me-tpc')) {
      const id = topic.nodeObj?.id
      if (typeof id === 'string' && !out.has(id)) out.set(id, topic)
    }
    return out
  }
}

/** A box in the coordinates of `me-nodes`, from what is on screen. */
function rectIn(frame: Frame, element: Element): Rect {
  const rect = element.getBoundingClientRect()
  return {
    x: (rect.left - frame.rect.left) / frame.scale,
    y: (rect.top - frame.rect.top) / frame.scale,
    w: rect.width / frame.scale,
    h: rect.height / frame.scale,
  }
}

function boxIn(frame: Frame, element: Element): Box {
  const { x, y, w, h } = rectIn(frame, element)
  return { cx: x + w / 2, cy: y + h / 2, w, h }
}

const NUMBER = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi

/** The ends and control points of a curve the library drew (`M p1 C c1 c2 p2`). */
interface LibraryCurve {
  p1: { x: number; y: number }
  c1: { x: number; y: number }
  c2: { x: number; y: number }
  p2: { x: number; y: number }
}

/** The curve of a path the library drew; null for a path of another form. */
function libraryCurve(d: string): LibraryCurve | null {
  if (!/^\s*M[^C]*C/.test(d)) return null
  const values = (d.match(NUMBER) ?? []).map(Number)
  if (values.length < 8 || values.slice(0, 8).some((value) => !Number.isFinite(value))) return null
  const [x1, y1, cx1, cy1, cx2, cy2, x2, y2] = values as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  return {
    p1: { x: x1, y: y1 },
    c1: { x: cx1, y: cy1 },
    c2: { x: cx2, y: cy2 },
    p2: { x: x2, y: y2 },
  }
}

/** The see-through path the library lays under a path of a relationship to take its clicks. */
function hitOf(path: Element): Element | null {
  const before = path.previousElementSibling
  return before?.getAttribute('stroke') === 'transparent' ? before : null
}

/** Puts a title centred on a point, as the library places one. */
function placeLabel(label: HTMLElement | undefined, x: number, y: number): void {
  if (!label) return
  label.dataset.x = String(x)
  label.dataset.y = String(y)
  label.style.left = `${x - label.clientWidth / 2}px`
  label.style.top = `${y - label.clientHeight / 2}px`
}

function setMark(element: Element, name: string, on: boolean): void {
  if (on) element.setAttribute(name, '')
  else element.removeAttribute(name)
}

function num(value: number): string {
  return String(Math.round(value * 100) / 100)
}
