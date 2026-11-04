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
 * drew it (`map.css` gives it the map's colour, 1.5 wide, dashed), except
 * that its title, where the library put it on a topic or on an end of the
 * line, is moved the same way as below (`data-mm-moved`). One with values
 * gets:
 *
 * - its colour, width and dashes on the line (the same values are the
 *   library's line options, so the library keeps them while a curve is
 *   dragged), and a `data-mm-color` / `data-mm-width` / `data-mm-pattern`
 *   mark on the group so the map's rules leave those to it;
 * - a path of its own for a shape that is not curved;
 * - its title in the middle of the line, or along it to the nearest place
 *   where it covers no topic and neither end (`labelSpot`), beside the line
 *   when there is none;
 * - the two ends drawn by this app (`mm-rel-end`), the line stopping under
 *   each and its dashes fitted to meet them (`relationshipDrawing`); a colour
 *   the map shows through goes on the whole group as its `opacity`. The
 *   library's arrowheads are hidden and carry the same paths, so the
 *   selection's glow and the places that take a click follow the ends that
 *   are drawn.
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
 * central topic goes around the whole map. All the outlines of a map are
 * placed together (`boundaryOutlines`), so one around another stands outside
 * it and two side by side keep apart; the map has made room for each
 * (`boundary-room.ts`). Each outline is a group marked with the boundary's
 * id (`data-mm-boundary`), and so is its title, which is written on a chip
 * of the map's ground on the outline's top edge (`boundaryTitlePlace`); an
 * outline is at least as wide as its title. Under the outline lies a rim of no colour of its
 * own, which `styles.css` paints while the boundary is selected. The title
 * is text (`textContent`), never markup. A map without boundaries has no
 * layer at all.
 *
 * No colour is written here except a filtered value of the file; every other
 * colour is a `--mm-` property, given by `map.css`.
 */
import type { MindElixirInstance, Topic } from 'mind-elixir'
import { boundariesOf, type MapArrow, type MapSummary } from '../document/convert'
import {
  BOUNDARY_TITLE_HEIGHT,
  BOUNDARY_WIDTH,
  boundaryOutlines,
  boundaryPaint,
  boundaryPath,
  boundaryPieces,
  boundaryTitlePlace,
  type Rect,
} from './boundary-shapes'
import { linePatternDash } from './branches'
import {
  type Box,
  labelSpot,
  relationshipArrowStyle,
  relationshipDrawing,
  relationshipGeometry,
  relationshipLinecap,
  relationshipPaint,
  type RelationshipPath,
  RELATIONSHIP_WIDTH,
} from './relationship-shapes'
import { splitAlpha } from './style-values'
import { parseSummaryFrame, summaryBracketPath, summaryPaint } from './summary-shapes'

const SVG = 'http://www.w3.org/2000/svg'

/** The layer the boundaries are drawn in. */
export const BOUNDARY_LAYER_CLASS = 'mm-boundaries'
/** The attribute that names the boundary an outline or a title belongs to. */
export const BOUNDARY_ID_ATTRIBUTE = 'data-mm-boundary'
export const BOUNDARY_SHAPE_CLASS = 'mm-boundary-shape'
export const BOUNDARY_TITLE_CLASS = 'mm-boundary-title'
/** The rim under a boundary's outline that shows when it is selected. */
export const BOUNDARY_RING_CLASS = 'mm-boundary-ring'
/** The chip of the map's ground a boundary's title is written on. */
export const BOUNDARY_CHIP_CLASS = 'mm-boundary-chip'
/** An end of a relationship drawn by this app. */
export const RELATIONSHIP_END_CLASS = 'mm-rel-end'

/** How far a title's text stands in from the ends of its chip. */
const CHIP_PAD = 5
/** How far below the middle of its chip a title's baseline is (its text is 12px; `map.css`). */
const TITLE_BASELINE = 4

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

/** What drawing the relationships measures of the map, once. */
interface Measured {
  frame: Frame | null
  topics: Map<string, Topic>
  /** the box of every topic drawn */
  boxes: Rect[]
}

/** On a relationship's title once this editor has placed it, so it goes back where the library puts it when the values go. */
const LABEL_MARK = 'data-mm-placed'
/** On the title of a relationship without values that this editor moved off a topic or an end. */
const LABEL_MOVED = 'data-mm-moved'

export class RelationDrawer {
  readonly #mind: MindElixirInstance
  /** the paths the library gave the brackets, kept while their elements live */
  readonly #libraryBrackets = new WeakMap<Element, string>()
  /** the curves the library drew the relationships with, and their paths, kept while their elements live */
  readonly #libraryCurves = new WeakMap<Element, LibraryCurve & { d: string }>()
  /** the path this editor last wrote on each line, so it is not taken for the library's */
  readonly #written = new WeakMap<Element, string>()
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
    // measured once, and only when a relationship needs it (a shape other than the curve, or a title)
    let measured: Measured | null = null
    const measure = (): Measured => {
      if (measured) return measured
      const frame = this.#frame()
      const topics = this.#topicsById()
      const boxes = frame ? [...topics.values()].map((topic) => rectIn(frame, topic)) : []
      return (measured = { frame, topics, boxes })
    }
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

  #drawRelationship(group: ArrowGroup, measure: () => Measured): void {
    const arrow = group.arrowObj
    const line = group.line
    if (!arrow || !line) return
    // the curve the library drew last: a path of this editor has replaced it on the line
    const current = line.getAttribute('d') ?? ''
    const fresh = current !== this.#written.get(line) ? libraryCurve(current) : null
    if (fresh) this.#libraryCurves.set(line, { ...fresh, d: current })
    const drawn = this.#libraryCurves.get(line)
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
    const label = group.labelEl
    if (paint.plain) {
      // as the library drew it: its curve, its dashes, its arrowheads and the title where it put it
      if (current !== drawn.d) line.setAttribute('d', drawn.d)
      this.#written.delete(line)
      line.style.removeProperty('stroke-dasharray')
      line.removeAttribute('stroke-dashoffset')
      group.removeAttribute('opacity')
      for (const head of heads) {
        head.removeAttribute('visibility')
        hitOf(head)?.removeAttribute('visibility')
      }
      if (!label) return
      const placedBefore = label.hasAttribute(LABEL_MARK)
      label.removeAttribute(LABEL_MARK)
      // where the library puts it, unless that lies on a topic or on an end of the line
      const path: RelationshipPath = { kind: 'cubic', ...drawn }
      const spot = titledLabel(label)
        ? labelSpot(
            path,
            labelSize(label),
            measure().boxes,
            relationshipDrawing(paint, path).endBoxes,
          )
        : null
      if (spot?.moved) {
        label.setAttribute(LABEL_MOVED, '')
        placeLabel(label, spot.at.x, spot.at.y)
      } else if (label.hasAttribute(LABEL_MOVED) || placedBefore) {
        label.removeAttribute(LABEL_MOVED)
        const middle = libraryMiddle(drawn)
        placeLabel(label, middle.x, middle.y)
      }
      return
    }

    const width = paint.width ?? RELATIONSHIP_WIDTH
    // a colour that lets the map show through is put on the whole relationship, so where the
    // line goes in under an end it does not show darker
    const colour = paint.color === null ? null : splitAlpha(paint.color)
    if (colour) line.setAttribute('stroke', colour.solid)
    if (colour && colour.alpha < 1) group.setAttribute('opacity', num(colour.alpha))
    else group.removeAttribute('opacity')
    if (paint.width !== null) line.setAttribute('stroke-width', String(paint.width))
    const linecap = relationshipLinecap(paint)
    if (linecap) line.setAttribute('stroke-linecap', linecap)
    label?.setAttribute(LABEL_MARK, '')

    let path: RelationshipPath = { kind: 'cubic', ...drawn }
    let middle = libraryMiddle(drawn)
    if (paint.shape !== 'curved') {
      const { frame, topics } = measure()
      const at = (id: string, fallback: { x: number; y: number }): Box => {
        const topic = topics.get(id)
        return frame && topic ? boxIn(frame, topic) : { cx: fallback.x, cy: fallback.y, w: 0, h: 0 }
      }
      const shape = relationshipGeometry(
        paint.shape,
        { from: at(arrow.from, drawn.p1), to: at(arrow.to, drawn.p2), c1: drawn.c1, c2: drawn.c2 },
        width,
      )
      path = shape.path
      middle = shape.label
      hitOf(line)?.setAttribute('d', shape.d)
    }

    const drawing = relationshipDrawing(paint, path)
    if (label) {
      // in the middle of the line, or the nearest place along it where it covers no topic and neither end
      const place = titledLabel(label)
        ? labelSpot(path, labelSize(label), measure().boxes, drawing.endBoxes).at
        : middle
      label.removeAttribute(LABEL_MOVED)
      placeLabel(label, place.x, place.y)
    }
    line.setAttribute('d', drawing.d)
    this.#written.set(line, drawing.d)
    // inline, over the dashes `map.css` gives a relationship without a pattern of its own
    line.style.setProperty('stroke-dasharray', drawing.dasharray)
    if (drawing.dashoffset > 0) line.setAttribute('stroke-dashoffset', num(drawing.dashoffset))
    else line.removeAttribute('stroke-dashoffset')

    const markers = [
      { marker: drawing.begin, head: group.arrow2, name: 'begin' },
      { marker: drawing.end, head: group.arrow1, name: 'end' },
    ]
    for (const { marker, head, name } of markers) {
      if (head) {
        // hidden, with the path of the end drawn: the selection glow and the click follow it
        head.setAttribute('d', marker?.d ?? '')
        head.setAttribute('visibility', 'hidden')
        hitOf(head)?.setAttribute('d', marker?.d ?? '')
      }
      if (!marker) continue
      const end = group.ownerDocument.createElementNS(SVG, 'path')
      end.setAttribute('class', RELATIONSHIP_END_CLASS)
      end.setAttribute('data-mm-end', name)
      end.setAttribute('d', marker.d)
      if (marker.filled) {
        // a filled end has no outline: its corners and its tip stay sharp
        end.setAttribute('data-mm-solid', '')
        end.setAttribute('stroke', 'none')
        if (colour) end.setAttribute('fill', colour.solid)
        else end.setAttribute('data-mm-filled', '')
      } else {
        end.setAttribute('fill', 'none')
        end.setAttribute('stroke-linecap', 'round')
        end.setAttribute('stroke-linejoin', 'round')
        if (colour) end.setAttribute('stroke', colour.solid)
        if (paint.width !== null) end.setAttribute('stroke-width', String(paint.width))
      }
      group.appendChild(end)
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
    // how wide each title is written, measured where it is drawn
    const titleWidths = new Map<string, number>()
    const measuring = doc.createElementNS(SVG, 'text')
    measuring.setAttribute('class', BOUNDARY_TITLE_CLASS)
    layer.appendChild(measuring)
    for (const boundary of boundaries) {
      if (boundary.title.trim() === '' || titleWidths.has(boundary.title)) continue
      measuring.textContent = boundary.title
      titleWidths.set(boundary.title, textWidth(measuring) + 2 * CHIP_PAD)
    }
    measuring.remove()
    // every outline of the map first: where each goes depends on the others
    const drawn = boundaries.flatMap((boundary) => {
      const paint = boundaryPaint(boundary.style)
      const titled = boundary.title.trim() !== ''
      const groups = this.#enclosed(boundary, frame, topics).filter(
        (group) => group.rects.length > 0,
      )
      return boundaryPieces(groups.map((group) => group.rects)).map((piece, at) => ({
        boundary,
        paint,
        content: piece.content,
        shape: paint.shape,
        withTitle: piece.withTitle && titled,
        titleWidth: titleWidths.get(boundary.title) ?? 0,
        // an outline narrower than its title grows away from the central topic
        grow: groups[at]!.side.includes('lhs') ? ('left' as const) : ('right' as const),
      }))
    })
    const topicBoxes = [...topics.values()].map((topic) => rectIn(frame, topic))
    const outlines = boundaryOutlines(drawn, topicBoxes)

    const titles: { group: SVGGElement; at: number }[] = []
    drawn.forEach(({ boundary, paint, withTitle }, at) => {
      const rect = outlines[at]!
      const group = doc.createElementNS(SVG, 'g')
      group.setAttribute(BOUNDARY_ID_ATTRIBUTE, boundary.id)
      setMark(group, 'data-mm-color', paint.color !== null)
      setMark(group, 'data-mm-width', paint.width !== null)
      setMark(group, 'data-mm-fill', paint.fill !== null)
      const outline = doc.createElementNS(SVG, 'path')
      outline.setAttribute('class', BOUNDARY_SHAPE_CLASS)
      outline.setAttribute('d', boundaryPath(paint.shape, rect))
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
      // under the outline, the rim it shows while selected (`styles.css`); of no colour of its own, so unseen otherwise
      const ring = doc.createElementNS(SVG, 'path')
      ring.setAttribute('class', BOUNDARY_RING_CLASS)
      ring.setAttribute('d', outline.getAttribute('d') ?? '')
      ring.setAttribute('fill', 'none')
      ring.setAttribute('stroke-width', num((paint.width ?? BOUNDARY_WIDTH) + 4))
      group.append(ring, outline)
      layer.appendChild(group)
      if (withTitle) titles.push({ group, at })
    })

    // the titles, each on a chip of the map's ground on the top edge of its outline
    for (const { group, at } of titles) {
      const { boundary } = drawn[at]!
      const rect = outlines[at]!
      const chip = doc.createElementNS(SVG, 'rect')
      chip.setAttribute('class', BOUNDARY_CHIP_CLASS)
      const title = doc.createElementNS(SVG, 'text')
      title.setAttribute('class', BOUNDARY_TITLE_CLASS)
      title.setAttribute(BOUNDARY_ID_ATTRIBUTE, boundary.id)
      title.textContent = boundary.title
      group.append(chip, title)
      const size = {
        w: titleWidths.get(boundary.title) ?? textWidth(title) + 2 * CHIP_PAD,
        h: BOUNDARY_TITLE_HEIGHT,
      }
      const place = boundaryTitlePlace(rect, size)
      chip.setAttribute('x', num(place.x))
      chip.setAttribute('y', num(place.y))
      chip.setAttribute('width', num(size.w))
      chip.setAttribute('height', num(size.h))
      chip.setAttribute('rx', '4')
      title.setAttribute('x', num(place.x + CHIP_PAD))
      title.setAttribute('y', num(place.y + size.h / 2 + TITLE_BASELINE))
    }
  }

  /** The boxes a boundary goes around, one group per side of the central topic (named as its `me-main` is), in the order of its range. */
  #enclosed(
    boundary: { topicId: string; range: { start: number; end: number } | 'master' },
    frame: Frame,
    topics: Map<string, Topic>,
  ): { side: string; rects: Rect[] }[] {
    const owner = topics.get(boundary.topicId)
    if (!owner?.nodeObj) return []
    // the topics, and the "+" of each folded branch, which the outline goes around too
    const shownIn = (root: ParentNode): Rect[] =>
      [...root.querySelectorAll('me-tpc, me-epd:not(.minus)')].map((el) => rectIn(frame, el))
    const rectsBelow = (topic: Topic): Rect[] => {
      const wrapper = topic.parentElement?.parentElement
      return wrapper && wrapper.localName === 'me-wrapper'
        ? shownIn(wrapper)
        : [rectIn(frame, topic)]
    }
    if (boundary.range === 'master') {
      if (!owner.nodeObj.parent) return [{ side: '', rects: shownIn(this.#mind.nodes) }]
      return [{ side: owner.closest('me-main')?.className ?? '', rects: rectsBelow(owner) }]
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
    return [...groups].map(([side, rects]) => ({ side, rects }))
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

/** The middle of a curve the library drew, where it puts the title. */
function libraryMiddle(curve: LibraryCurve): { x: number; y: number } {
  return relationshipGeometry('curved', {
    from: { cx: curve.p1.x, cy: curve.p1.y, w: 0, h: 0 },
    to: { cx: curve.p2.x, cy: curve.p2.y, w: 0, h: 0 },
    c1: curve.c1,
    c2: curve.c2,
  }).label
}

function titledLabel(label: HTMLElement): boolean {
  return (label.textContent ?? '').trim() !== ''
}

function labelSize(label: HTMLElement): { w: number; h: number } {
  return { w: label.offsetWidth, h: label.offsetHeight }
}

/** Puts a title centred on a point, as the library places one. */
function placeLabel(label: HTMLElement | undefined, x: number, y: number): void {
  if (!label) return
  label.dataset.x = String(x)
  label.dataset.y = String(y)
  label.style.left = `${x - label.clientWidth / 2}px`
  label.style.top = `${y - label.clientHeight / 2}px`
}

/** How wide a title is drawn; guessed from its letters where the page cannot measure text. */
function textWidth(text: SVGTextElement): number {
  try {
    const measured = text.getComputedTextLength()
    if (measured > 0) return measured
  } catch {
    // measured as below
  }
  let width = 0
  for (const char of text.textContent ?? '') width += (char.codePointAt(0) ?? 0) >= 0x1100 ? 12 : 7
  return width
}

function setMark(element: Element, name: string, on: boolean): void {
  if (on) element.setAttribute(name, '')
  else element.removeAttribute(name)
}

function num(value: number): string {
  return String(Math.round(value * 100) / 100)
}
