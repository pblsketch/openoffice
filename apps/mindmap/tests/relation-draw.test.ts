/**
 * Relationships, summary brackets and boundaries on screen, with the real
 * drawing library in jsdom: each drawn with the values the file holds for it
 * (through the filter), the library's handles on a curve only, the boundaries
 * in a layer under everything else, and a map without such values drawn as
 * before. Drawing never writes: the file keeps every value it had.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { XmindDocument } from '@genoffice/xmind-engine'
import { MapController, type MapHost } from '../src/renderer/map/controller'
import { DocumentSession } from '../src/renderer/document/session'
import { mapStrings } from '../src/renderer/i18n/map-strings'
import type { MapArrow, MapSummary } from '../src/renderer/document/convert'
import { parseSummaryFrame, summaryBracketPath } from '../src/renderer/map/summary-shapes'
import { BOUNDARY_PAD, BOUNDARY_TITLE_HEIGHT } from '../src/renderer/map/boundary-shapes'
import { ROOM_HALF_GAP, ROOM_MARK } from '../src/renderer/map/boundary-room'
import {
  BOUNDARY_ID_ATTRIBUTE,
  BOUNDARY_LAYER_CLASS,
  RELATIONSHIP_END_CLASS,
} from '../src/renderer/map/relations'
import {
  copyOf,
  documentOf,
  FORMAT_IDS as ID,
  lineFormatSheet,
  plainSheet,
  richSheet,
} from './helpers/fixtures'

const mounted: MapController[] = []
afterEach(() => {
  mounted.splice(0).forEach((controller) => controller.destroy())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function show(doc: XmindDocument) {
  const session = new DocumentSession(doc)
  const el = document.createElement('div')
  document.body.appendChild(el)
  const host: MapHost = {
    confirmDelete: vi.fn(async () => true),
    openLink: vi.fn(),
    onRequest: vi.fn(),
    onStateChange: vi.fn(),
  }
  const key = session.tabs()[0]!.key
  const controller = new MapController({
    el,
    session,
    sheetKey: key,
    strings: mapStrings('en'),
    host,
  })
  mounted.push(controller)
  return { doc, session, el, key, controller, mind: controller.mind }
}

/**
 * jsdom lays nothing out: every element gets a box of its own, each a little
 * further down and to the right, and the map is 100 wide at a scale of 1;
 * the library measures each topic 100 by 30.
 */
function layOut(): void {
  const boxes = new WeakMap<Element, DOMRect>()
  let next = 0
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(30)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.localName === 'me-nodes') return new DOMRect(0, 0, 100, 100)
    let box = boxes.get(this)
    if (!box) {
      next++
      box = new DOMRect(40 + next * 70, 20 + next * 45, 100, 30)
      boxes.set(this, box)
    }
    return box
  })
}

async function mountFormatted() {
  layOut()
  return show(await documentOf(lineFormatSheet()))
}

const groupOf = (el: HTMLElement, id: string) =>
  [...el.querySelectorAll<SVGGElement>('.topiclinks > g')].find(
    (group) => group.dataset.linkid === id,
  )!

type Group = SVGGElement & {
  line: SVGPathElement
  arrow1: SVGPathElement
  arrow2: SVGPathElement
  labelEl?: HTMLElement
}

const numbers = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)

describe('relationships', () => {
  it('one without values is drawn exactly as the library draws it', async () => {
    const { el } = await mountFormatted()
    const plain = groupOf(el, ID.plainLine) as Group
    expect(plain.getAttributeNames().filter((name) => name.startsWith('data-mm'))).toEqual([])
    expect(plain.querySelectorAll(`.${RELATIONSHIP_END_CLASS}`)).toHaveLength(0)
    expect(plain.arrow1.hasAttribute('visibility')).toBe(false)
    expect(plain.arrow1.getAttribute('d')).not.toBe('')
    // the library's own dashes, which the map's rules turn into the relationship's 5 5
    expect(plain.line.getAttribute('stroke-dasharray')).toBe('8,2')
    expect(plain.line.getAttribute('d')).toMatch(/^M .* C /)
  })

  it('a map without such values has no mark of them anywhere', async () => {
    layOut()
    const { el } = show(await documentOf(plainSheet()))
    expect(el.querySelector(`.${BOUNDARY_LAYER_CLASS}`)).toBeNull()
    expect(
      el.querySelector('[data-mm-color], [data-mm-width], [data-mm-pattern], [data-mm-shape]'),
    ).toBeNull()
  })

  it('one with values: its colour, width and pattern on the line, its two ends drawn by the editor', async () => {
    const { el } = await mountFormatted()
    const styled = groupOf(el, ID.styledLine) as Group
    for (const mark of ['data-mm-color', 'data-mm-width', 'data-mm-pattern']) {
      expect(styled.hasAttribute(mark), mark).toBe(true)
    }
    expect(styled.line.getAttribute('stroke')).toBe('#cc3300')
    expect(styled.line.getAttribute('stroke-width')).toBe('3')
    // inline, over the dashes the map's rules give a relationship without a pattern
    expect(styled.line.style.getPropertyValue('stroke-dasharray')).toBe('none')
    const ends = [...styled.querySelectorAll<SVGPathElement>(`.${RELATIONSHIP_END_CLASS}`)]
    expect(ends.map((end) => end.getAttribute('data-mm-end'))).toEqual(['begin', 'end'])
    for (const end of ends) {
      // a dot and a triangle are filled with the line's colour, with no outline to round their corners
      expect(end.getAttribute('fill')).toBe('#cc3300')
      expect(end.getAttribute('stroke')).toBe('none')
      expect(end.hasAttribute('data-mm-solid')).toBe(true)
    }
    // the dot at the start is drawn with arcs, the triangle is a closed path
    expect(ends[0]!.getAttribute('d')).toMatch(/ A /)
    expect(ends[1]!.getAttribute('d')).toMatch(/ Z$/)
    // the library's own arrowheads are hidden and carry the ends drawn
    expect(styled.arrow1.getAttribute('visibility')).toBe('hidden')
    expect(styled.arrow2.getAttribute('visibility')).toBe('hidden')
    expect(styled.arrow1.getAttribute('d')).toBe(ends[1]!.getAttribute('d'))
    expect(styled.arrow2.getAttribute('d')).toBe(ends[0]!.getAttribute('d'))
  })

  it('a curve the file gives is the curve drawn', async () => {
    const { el, mind } = await mountFormatted()
    const arrow = (mind.arrows as MapArrow[]).find((line) => line.id === ID.styledLine)!
    expect(arrow.delta1).toEqual({ x: 40, y: -30 })
    expect(arrow.delta2).toEqual({ x: -50, y: 25 })
    const styled = groupOf(el, ID.styledLine) as Group
    // the curve as the library drew it is on the path that takes the clicks; the line drawn
    // is the same curve, stopped short where the ends are drawn
    const curve = styled.line.previousElementSibling!.getAttribute('d')!
    const drawn = styled.line.getAttribute('d')!
    expect(drawn).toMatch(/^M [-\d.]+ [-\d.]+ C /)
    expect(drawn).not.toBe(curve)
    const [, , c1x, c1y, c2x, c2y] = numbers(curve)
    // the control points stand at those offsets from the middle of each end's box
    const from = mind.findEle(ID.rightB)
    const to = mind.findEle(ID.left)
    expect(c1x! - c2x!).toBe(
      from.offsetLeft + from.offsetWidth / 2 + 40 - (to.offsetLeft + to.offsetWidth / 2 - 50),
    )
    expect(c1y! - c2y!).toBe(
      -30 - 25 + (from.offsetTop + from.offsetHeight / 2) - (to.offsetTop + to.offsetHeight / 2),
    )
  })

  it('each shape has its own path; only a curve keeps the library’s', async () => {
    const { el, mind } = await mountFormatted()
    const arrow = (mind.arrows as MapArrow[]).find((line) => line.id === ID.plainLine)!
    const shapes: Record<string, RegExp> = {
      curved: /^M [-\d.]+ [-\d.]+ C /,
      straight: /^M [-\d.]+ [-\d.]+ L [-\d.]+ [-\d.]+$/,
      angled: /^M [-\d.]+ [-\d.]+ [HV] [-\d.]+ [HV] [-\d.]+ [HV] [-\d.]+$/,
      zigzag: /^M [-\d.]+ [-\d.]+( L [-\d.]+ [-\d.]+){5,}$/,
    }
    for (const [shape, form] of Object.entries(shapes)) {
      arrow.metadata = { style: { shape: `org.xmind.relationshipShape.${shape}` } }
      mind.linkDiv()
      const group = groupOf(el, ID.plainLine) as Group
      // the see-through path that takes the clicks has the whole path of the shape
      const whole = group.line.previousElementSibling!.getAttribute('d')!
      expect(whole, shape).toMatch(form)
      // the line drawn is that path, stopped short under an end drawn by the editor
      if (shape === 'curved') expect(group.line.getAttribute('d'), shape).toBe(whole)
      else
        expect(group.line.getAttribute('d'), shape).toMatch(
          /^M [-\d.]+ [-\d.]+( L [-\d.]+ [-\d.]+)+$/,
        )
      const ends = group.querySelectorAll(`.${RELATIONSHIP_END_CLASS}`)
      if (shape === 'curved') {
        // every value the default: the library's own arrowhead, as for a line without values
        expect(ends).toHaveLength(0)
        expect(group.arrow1.hasAttribute('visibility')).toBe(false)
        continue
      }
      // the default end: the open arrowhead, drawn by the editor
      expect(ends, shape).toHaveLength(1)
      expect(ends[0]!.getAttribute('fill')).toBe('none')
    }
  })

  it('a colour the map shows through is put on the whole relationship, so nothing shows darker where it overlaps', async () => {
    const { el, mind } = await mountFormatted()
    const arrow = (mind.arrows as MapArrow[]).find((line) => line.id === ID.plainLine)!
    arrow.metadata = {
      style: {
        color: '#cc330080',
        end: 'org.xmind.arrowShape.triangle',
        shape: 'org.xmind.relationshipShape.straight',
      },
    }
    mind.linkDiv()
    const group = groupOf(el, ID.plainLine) as Group
    expect(group.getAttribute('opacity')).toBe('0.5')
    expect(group.line.getAttribute('stroke')).toBe('#cc3300')
    expect(group.querySelector(`.${RELATIONSHIP_END_CLASS}`)!.getAttribute('fill')).toBe('#cc3300')
    // its title is placed by the editor, and goes back to the library's place when the values go
    const label = group.labelEl as HTMLElement
    expect(label.hasAttribute('data-mm-placed')).toBe(true)
    arrow.metadata = {}
    mind.linkDiv()
    const again = groupOf(el, ID.plainLine) as Group
    expect(again.hasAttribute('opacity')).toBe(false)
    expect((again.labelEl as HTMLElement).hasAttribute('data-mm-placed')).toBe(false)
  })

  it('drawn again without the library drawing first, a shaped line keeps its path and its ends', async () => {
    const { el, mind } = await mountFormatted()
    const straight = groupOf(el, ID.straightLine) as Group
    const d = straight.line.getAttribute('d')
    const ends = straight.querySelectorAll(`.${RELATIONSHIP_END_CLASS}`).length
    expect(ends).toBe(1)
    // a dragged curve elsewhere, or a new relationship, draws the relationships again
    mind.bus.fire('updateArrowDelta', mind.arrows[0]!)
    mind.bus.fire('updateArrowDelta', mind.arrows[0]!)
    expect(straight.line.getAttribute('d')).toBe(d)
    expect(straight.querySelectorAll(`.${RELATIONSHIP_END_CLASS}`)).toHaveLength(ends)
  })

  it('the handles show on a curve only', async () => {
    const { el, mind } = await mountFormatted()
    mind.selectArrow(groupOf(el, ID.straightLine) as never)
    for (const handle of [mind.P2, mind.P3, mind.linkController]) {
      expect((handle as unknown as HTMLElement).style.display).toBe('none')
    }
    mind.unselectArrow()
    mind.selectArrow(groupOf(el, ID.styledLine) as never)
    for (const handle of [mind.P2, mind.P3]) {
      expect((handle as unknown as HTMLElement).style.display).not.toBe('none')
    }
  })

  it('a line in two directions is not taken away: the library may keep both ends', async () => {
    const { mind, controller } = await mountFormatted()
    expect(controller.addRelationship(ID.rightA, ID.rightB)).toBe(true)
    const added = mind.arrows[mind.arrows.length - 1]!
    added.bidirectional = true
    mind.linkDiv()
    expect(mind.arrows[mind.arrows.length - 1]!.bidirectional).toBe(true)
  })

  it('drawing writes nothing: the file keeps its values and its curves', async () => {
    const { doc, mind, controller } = await mountFormatted()
    const before = copyOf(doc.sheets)
    mind.linkDiv()
    mind.selectArrow(mind.arrowSvg.querySelector('g') as never)
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(controller.canUndo).toBe(false)
    expect(doc.changed).toBe(false)
    expect(doc.sheets).toEqual(before)
  })
})

describe('summary brackets', () => {
  it('a bracket with a shape is drawn in it, where the library put its own', async () => {
    const { el } = await mountFormatted()
    const group = el.querySelector<SVGGElement>(`.summary > g#s-${ID.summaryTopic}`)!
    expect(group.getAttribute('data-mm-shape')).toBe('curly')
    expect(group.querySelector('path')!.getAttribute('d')).toMatch(/ Q /)
  })

  it('every shape a user can pick; without one, and for `bracket`, the library’s own', async () => {
    const { el, mind } = await mountFormatted()
    const summary = (mind.summaries as MapSummary[])[0]!
    summary.metadata = undefined
    mind.linkDiv()
    const library = el.querySelector(`.summary > g#s-${ID.summaryTopic} path`)!.getAttribute('d')!
    const frame = parseSummaryFrame(library)
    expect(frame).not.toBeNull()
    for (const shape of [
      'curly',
      'angle',
      'square',
      'round',
      'sharp',
      'fold',
      'straight',
    ] as const) {
      summary.metadata = { style: { shape: `org.xmind.summaryShape.${shape}` } }
      mind.linkDiv()
      const path = el.querySelector(`.summary > g#s-${ID.summaryTopic} path`)!
      expect(path.getAttribute('d'), shape).toBe(summaryBracketPath(shape, frame!))
    }
    for (const style of [{ shape: 'org.xmind.summaryShape.bracket' }, { shape: 'x' }, {}]) {
      summary.metadata = { style }
      mind.linkDiv()
      const group = el.querySelector(`.summary > g#s-${ID.summaryTopic}`)!
      expect(group.querySelector('path')!.getAttribute('d')).toBe(library)
      expect(group.hasAttribute('data-mm-shape')).toBe(false)
    }
  })

  it('a map whose summaries have no shape keeps the library’s brackets', async () => {
    layOut()
    const { el } = show(await documentOf(richSheet()))
    const paths = [...el.querySelectorAll('.summary path')]
    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) expect(path.getAttribute('d')).toMatch(/ c 5 0 | c -5 0 | c 0 5 /)
  })
})

describe('boundaries', () => {
  const layerOf = (el: HTMLElement) => el.querySelector(`me-nodes > .${BOUNDARY_LAYER_CLASS}`)!
  const groupsOf = (el: HTMLElement, id: string) =>
    [...layerOf(el).querySelectorAll('g')].filter(
      (group) => group.getAttribute(BOUNDARY_ID_ATTRIBUTE) === id,
    )

  it('lie in a layer under everything else of the map', async () => {
    const { el } = await mountFormatted()
    const nodes = el.querySelector('me-nodes')!
    expect(nodes.firstElementChild).toBe(layerOf(el))
  })

  it('around a range, around the whole map, and once per side; none under a folded branch', async () => {
    const { el } = await mountFormatted()
    expect(groupsOf(el, ID.around)).toHaveLength(1)
    expect(groupsOf(el, ID.master)).toHaveLength(1)
    const sides = groupsOf(el, ID.sides)
    expect(sides).toHaveLength(2)
    // the title only on the first side
    expect(sides.map((group) => group.querySelectorAll('text').length)).toEqual([1, 0])
    expect(groupsOf(el, ID.underFold)).toHaveLength(0)
  })

  it('a folded branch shows its box only; opened, its boundary is drawn', async () => {
    const { el, mind } = await mountFormatted()
    expect(groupsOf(el, ID.underFold)).toHaveLength(0)
    mind.expandNode(mind.findEle(ID.folded), true)
    expect(groupsOf(el, ID.underFold)).toHaveLength(1)
  })

  it('the master boundary goes around every topic of the map', async () => {
    const { el } = await mountFormatted()
    const d = groupsOf(el, ID.master)[0]!.querySelector('.mm-boundary-shape')!.getAttribute('d')!
    const xs = numbers(d).filter((_, at) => at % 2 === 0)
    const ys = numbers(d).filter((_, at) => at % 2 === 1)
    for (const topic of el.querySelectorAll('me-tpc')) {
      const box = topic.getBoundingClientRect()
      expect(Math.min(...xs)).toBeLessThanOrEqual(box.left - BOUNDARY_PAD + 0.01)
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(box.right + BOUNDARY_PAD - 0.01)
      expect(Math.min(...ys)).toBeLessThanOrEqual(box.top - BOUNDARY_PAD + 0.01)
      expect(Math.max(...ys)).toBeGreaterThanOrEqual(box.bottom + BOUNDARY_PAD - 0.01)
    }
  })

  it('the title is written on a chip; under the outline, a rim of no colour of its own', async () => {
    const { el } = await mountFormatted()
    const group = groupsOf(el, ID.around)[0]!
    expect([...group.children].map((child) => child.getAttribute('class'))).toEqual([
      'mm-boundary-ring',
      'mm-boundary-shape',
      'mm-boundary-chip',
      'mm-boundary-title',
    ])
    const ring = group.querySelector('.mm-boundary-ring')!
    expect(ring.getAttribute('d')).toBe(
      group.querySelector('.mm-boundary-shape')!.getAttribute('d'),
    )
    expect(ring.getAttribute('fill')).toBe('none')
    expect(ring.hasAttribute('stroke')).toBe(false)
    // wider than the outline (2), so it shows on both sides of it when selected
    expect(ring.getAttribute('stroke-width')).toBe('6')
    const chip = group.querySelector('.mm-boundary-chip')!
    const title = group.querySelector('.mm-boundary-title')!
    const x = Number(chip.getAttribute('x'))
    const width = Number(chip.getAttribute('width'))
    expect(width).toBeGreaterThan(0)
    expect(Number(title.getAttribute('x'))).toBeGreaterThan(x)
    expect(Number(title.getAttribute('x'))).toBeLessThan(x + width)
    // a chip carries no colour: the map's ground comes from its rules
    expect(chip.hasAttribute('fill')).toBe(false)
  })

  it('the title is text, never markup', async () => {
    const { el } = await mountFormatted()
    const title = groupsOf(el, ID.around)[0]!.querySelector('text')!
    expect(title.textContent).toBe('<b>around</b>')
    expect(title.children).toHaveLength(0)
    expect(el.querySelector('.mm-boundaries b')).toBeNull()
    expect(title.getAttribute(BOUNDARY_ID_ATTRIBUTE)).toBe(ID.around)
  })

  it('without values: rounded, the map’s colours from its rules; with values: those, filtered', async () => {
    const { el } = await mountFormatted()
    const master = groupsOf(el, ID.master)[0]!
    expect(master.getAttributeNames().filter((name) => name.startsWith('data-mm-'))).toEqual([
      BOUNDARY_ID_ATTRIBUTE,
    ])
    const plain = master.querySelector('.mm-boundary-shape')!
    for (const name of ['stroke', 'stroke-width', 'fill', 'stroke-dasharray']) {
      expect(plain.hasAttribute(name), name).toBe(false)
    }
    expect(plain.getAttribute('d')).toMatch(/ Q /)
    const around = groupsOf(el, ID.around)[0]!
    const outline = around.querySelector('.mm-boundary-shape')!
    expect(outline.getAttribute('stroke')).toBe('#336699')
    expect(outline.getAttribute('stroke-width')).toBe('2')
    expect(outline.getAttribute('fill')).toBe('#eeddcc')
    expect(outline.getAttribute('stroke-dasharray')).toBe('8 4')
    for (const mark of ['data-mm-color', 'data-mm-width', 'data-mm-fill']) {
      expect(around.hasAttribute(mark), mark).toBe(true)
    }
  })

  it('a line colour without a fill lies on a faint fill of that colour; a hostile value is not drawn', async () => {
    const { el, mind } = await mountFormatted()
    const carried = mind.meta!.boundaries as { id: string; style: Record<string, string> }[]
    carried.find((boundary) => boundary.id === ID.master)!.style = { color: '#112233' }
    carried.find((boundary) => boundary.id === ID.around)!.style = {
      color: 'url(https://evil.example/)',
      fill: 'expression(alert(1))',
      shape: 'javascript:alert(1)',
    }
    mind.linkDiv()
    const master = groupsOf(el, ID.master)[0]!.querySelector('.mm-boundary-shape')!
    expect(master.getAttribute('fill')).toBe('#112233')
    expect(master.getAttribute('fill-opacity')).toBe('0.08')
    const around = groupsOf(el, ID.around)[0]!
    expect(around.outerHTML).not.toMatch(/evil|expression|javascript/)
  })

  it('every shape a user can pick has its own outline', async () => {
    const { el, mind } = await mountFormatted()
    const carried = mind.meta!.boundaries as { id: string; style: Record<string, string> }[]
    const seen = new Set<string>()
    for (const shape of [
      'rect',
      'roundedRect',
      'scallops',
      'waves',
      'tension',
      'polygon',
      'roundedPolygon',
    ]) {
      carried.find((boundary) => boundary.id === ID.master)!.style = {
        shape: `org.xmind.boundaryShape.${shape}`,
      }
      mind.linkDiv()
      seen.add(groupsOf(el, ID.master)[0]!.querySelector('.mm-boundary-shape')!.getAttribute('d')!)
    }
    expect(seen.size).toBe(7)
  })
})

describe('the room the boundaries take in the layout', () => {
  /**
   * As `layOut`, but each wrapper of the library is as large as the topics in
   * it, so the room a boundary needs is all to be made.
   */
  function layOutTight(): void {
    const boxes = new WeakMap<Element, DOMRect>()
    let next = 0
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(30)
    const own = (element: Element): DOMRect => {
      let box = boxes.get(element)
      if (!box) {
        next++
        box = new DOMRect(40 + next * 70, 20 + next * 45, 100, 30)
        boxes.set(element, box)
      }
      return box
    }
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.localName === 'me-nodes') return new DOMRect(0, 0, 100, 100)
      if (this.localName === 'me-wrapper') {
        const inside = [...this.querySelectorAll('me-tpc')].map(own)
        const left = Math.min(...inside.map((box) => box.left))
        const top = Math.min(...inside.map((box) => box.top))
        const right = Math.max(...inside.map((box) => box.right))
        const bottom = Math.max(...inside.map((box) => box.bottom))
        return new DOMRect(left, top, right - left, bottom - top)
      }
      return own(this)
    })
  }

  const wrapperOf = (mind: { findEle(id: string): HTMLElement }, id: string) =>
    mind.findEle(id).parentElement!.parentElement as HTMLElement

  it('a map without boundaries is laid out as the library lays it out', async () => {
    layOutTight()
    const { el } = show(await documentOf(plainSheet()))
    expect(el.querySelector(`[${ROOM_MARK}]`)).toBeNull()
    for (const wrapper of el.querySelectorAll<HTMLElement>('me-wrapper')) {
      expect(wrapper.style.padding).toBe('')
    }
  })

  it('room above the first branch a boundary goes around (more with a title) and below the last', async () => {
    layOutTight()
    const { mind } = show(await documentOf(lineFormatSheet()))
    const first = wrapperOf(mind, ID.rightA)
    const last = wrapperOf(mind, ID.rightB)
    expect(first.hasAttribute(ROOM_MARK)).toBe(true)
    expect(last.hasAttribute(ROOM_MARK)).toBe(true)
    // the outline's padding, its waves and half the title written on its top edge, and a gap
    expect(parseFloat(first.style.paddingTop)).toBeGreaterThanOrEqual(
      BOUNDARY_PAD + BOUNDARY_TITLE_HEIGHT / 2 + ROOM_HALF_GAP,
    )
    expect(parseFloat(last.style.paddingBottom)).toBeGreaterThanOrEqual(
      BOUNDARY_PAD + ROOM_HALF_GAP,
    )
    expect(parseFloat(last.style.paddingBottom)).toBeLessThan(parseFloat(first.style.paddingTop))
    // a branch between them, or after them, gets none of it
    expect(first.style.paddingBottom).toBe('')
    expect(last.style.paddingTop).toBe('')
  })

  it('made anew each time the map is drawn: the same room again, none once the boundaries are gone', async () => {
    layOutTight()
    const { el, mind, controller } = show(await documentOf(lineFormatSheet()))
    const room = () =>
      [...el.querySelectorAll(`[${ROOM_MARK}]`)].map((element) => [
        element.getAttribute(ROOM_MARK),
        (element as HTMLElement).style.cssText,
      ])
    const before = room()
    expect(before.length).toBeGreaterThan(0)
    mind.linkDiv()
    expect(room()).toEqual(before)
    for (const boundary of controller.boundaries()) controller.removeBoundary(boundary.id)
    expect(el.querySelector(`[${ROOM_MARK}]`)).toBeNull()
    for (const wrapper of el.querySelectorAll<HTMLElement>('me-wrapper')) {
      expect(wrapper.style.paddingTop).toBe('')
      expect(wrapper.style.paddingBottom).toBe('')
    }
  })
})
