/**
 * The branch lines of a map on screen, with the real drawing library in
 * jsdom: each line drawn with the values the file holds for it (through the
 * filter), the map-wide tapered lines and rainbow, the tree and the timeline
 * keeping their own lines, and a map without line values drawn as before.
 * An arrowhead is drawn apart and never dashed, a picked colour is drawn as
 * picked, and a pattern starts with a whole dash at the topic it leaves.
 * Drawing never writes: the file keeps every value it had.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applySheetRainbow,
  applySheetTheme,
  DEFAULT_THEME_ID,
  mixColors,
  sheetToView,
  themeLook,
  type XmindDocument,
  type XmindSheet,
} from '@genoffice/xmind-engine'
import { MapController, type MapHost, type MapStrings } from '../src/renderer/map/controller'
import { DocumentSession } from '../src/renderer/document/session'
import { mapStrings } from '../src/renderer/i18n/map-strings'
import { branchVars } from '../src/renderer/map/look'
import { copyOf, documentOf, richSheet, topic } from './helpers/fixtures'

const STRINGS: MapStrings = mapStrings('ko')

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
  const controller = new MapController({ el, session, sheetKey: key, strings: STRINGS, host })
  mounted.push(controller)
  return { doc, session, el, key, controller, mind: controller.mind }
}

async function mount(sheet: XmindSheet) {
  return show(await documentOf(sheet))
}

/**
 * jsdom lays nothing out: every element gets a box of its own, each a little
 * further down and to the right, so the lines are drawn again from boxes.
 */
function layOut(): void {
  const boxes = new WeakMap<Element, DOMRect>()
  let next = 0
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    let box = boxes.get(this)
    if (!box) {
      next++
      box = new DOMRect(40 + next * 70, 20 + next * 45, 100, 30)
      boxes.set(this, box)
    }
    return box
  })
}

const ID = {
  root: 'aaaaaaaa-0000-4000-8000-000000000001',
  one: 'aaaaaaaa-0000-4000-8000-000000000002',
  two: 'aaaaaaaa-0000-4000-8000-000000000003',
  oneA: 'aaaaaaaa-0000-4000-8000-000000000004',
  oneB: 'aaaaaaaa-0000-4000-8000-000000000005',
  deep: 'aaaaaaaa-0000-4000-8000-000000000006',
} as const

const lineStyle = (properties: Record<string, string>) => ({
  style: { id: 'made-up-style', properties },
})
const shape = (word: string): string => `org.xmind.branchConnection.${word}`

/** Centre → One (→ One A → Deep, One B), Two. `lines` sets line values by topic id. */
function sheetWith(
  lines: Partial<Record<keyof typeof ID, Record<string, string>>> = {},
  theme?: unknown,
): XmindSheet {
  const t = (key: keyof typeof ID, title: string, children: ReturnType<typeof topic>[] = []) =>
    topic(ID[key], title, lines[key] ? lineStyle(lines[key]) : {}, children)
  const sheet: XmindSheet = {
    id: 'aaaaaaaa-0000-4000-8000-0000000000ff',
    class: 'sheet',
    rootTopic: t('root', 'Centre', [
      t('one', 'One', [t('oneA', 'One A', [t('deep', 'Deep')]), t('oneB', 'One B')]),
      t('two', 'Two'),
    ]),
    title: 'Sheet',
  }
  if (theme !== undefined) sheet.theme = theme as XmindSheet['theme']
  return sheet
}

/** A theme holding nothing but the two map-wide line settings. */
const settingsOnly = (properties: Record<string, string>) => ({
  map: { id: 'aaaaaaaa-0000-4000-8000-0000000000ee', properties },
})

/** The main topics in the order of the file; on both sides the library lists the left ones first. */
const MAINS = [ID.one, ID.two] as const

/** Where the library put main topic `at` (in the file's order) among its branches and their lines. */
function placeOf(el: HTMLElement, at: number): number {
  const wrappers = [...el.querySelectorAll('me-main > me-wrapper')]
  const place = wrappers.findIndex(
    (wrapper) => wrapper.querySelector<HTMLElement>('me-tpc')?.dataset.nodeid === `me${MAINS[at]}`,
  )
  if (place < 0) throw new Error(`main topic ${at} is not drawn`)
  return place
}

/** The lines from the centre, in the file's order of the main topics. */
function mainLines(el: HTMLElement): SVGPathElement[] {
  const lines = [...el.querySelectorAll<SVGPathElement>('svg.lines path')]
  return MAINS.map((_id, at) => lines[placeOf(el, at)]!)
}

/** The drawing that holds the lines below main topic `at` (in the file's order). */
function subLayer(el: HTMLElement, at: number): SVGSVGElement {
  const wrapper = el.querySelectorAll('me-main > me-wrapper')[placeOf(el, at)]!
  return wrapper.querySelector<SVGSVGElement>(':scope > svg.subLines')!
}

/** A `#rrggbb` colour as a browser writes it back. */
function rgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1, 7), 16)
  return `rgb(${value >> 16}, ${(value >> 8) & 0xff}, ${value & 0xff})`
}

/** The lines below main topic `at` (in the file's order), in the library's order: parent before child. */
function subLines(el: HTMLElement, at: number): SVGPathElement[] {
  const wrapper = el.querySelectorAll('me-main > me-wrapper')[placeOf(el, at)]!
  return [...wrapper.querySelectorAll<SVGPathElement>(':scope > svg.subLines path')]
}

describe('a map without line values', () => {
  it('is drawn as before: the branch colour on the lines from the centre, nothing on the others', async () => {
    const { el } = await mount(sheetWith())
    const look = themeLook(DEFAULT_THEME_ID)
    expect(mainLines(el).map((path) => path.getAttribute('stroke'))).toEqual([
      look.branches[0]!.color,
      look.branches[1]!.color,
    ])
    for (const path of [...mainLines(el), ...subLines(el, 0)]) {
      expect(path.getAttribute('style')).toBeNull()
      expect(path.getAttribute('fill')).toBe('none')
    }
    expect(subLines(el, 0)).toHaveLength(3)
    // the lines below keep the theme's lighter layer
    expect(subLayer(el, 0).getAttribute('style')).toBeNull()
    expect(el.querySelectorAll('.mm-line-head')).toHaveLength(0)
  })

  it('takes the same paths when laid out', async () => {
    const { el, mind } = await mount(sheetWith())
    layOut()
    mind.linkDiv()
    for (const path of [...mainLines(el), ...subLines(el, 0)]) {
      expect(path.getAttribute('style')).toBeNull()
      expect(path.getAttribute('d')).toMatch(/ C /)
    }
  })
})

describe('the values of a line', () => {
  it('a colour on a main topic draws its line and the branch below it', async () => {
    const { el } = await mount(sheetWith({ one: { 'line-color': '#FF0000' } }))
    const look = themeLook(DEFAULT_THEME_ID)
    expect(mainLines(el)[0]!.getAttribute('stroke')).toBe('#ff0000')
    // the other branch keeps its rainbow colour
    expect(mainLines(el)[1]!.getAttribute('stroke')).toBe(look.branches[1]!.color)
    for (const path of subLines(el, 0)) expect(path.style.stroke).toBe('rgb(255, 0, 0)')
    // the topic box keeps the colour of its branch
    const wrapper = el.querySelectorAll<HTMLElement>('me-main > me-wrapper')[placeOf(el, 0)]!
    expect(wrapper.style.getPropertyValue('--mm-branch')).toBe(branchVars(look, 0)['--mm-branch'])
  })

  it('a width and a pattern go into the line of the topic and the lines below it', async () => {
    const { el } = await mount(sheetWith({ oneA: { 'line-width': '4pt', 'line-pattern': 'dash' } }))
    const [intoA, intoDeep, intoB] = subLines(el, 0)
    for (const path of [intoA!, intoDeep!]) {
      expect(path.style.strokeWidth).toBe('4px')
      expect(path.style.strokeDasharray).not.toBe('')
      expect(path.style.strokeLinecap).toBe('butt')
    }
    expect(intoB!.getAttribute('style')).toBeNull()
  })

  it("a topic's own width and pattern draw the line into it and the lines into its children", async () => {
    const { el } = await mount(
      sheetWith({ one: { 'line-width': '5pt', 'line-pattern': 'round-dot' } }),
    )
    expect(mainLines(el)[0]!.style.strokeWidth).toBe('5px')
    const [intoA] = subLines(el, 0)
    expect(intoA!.style.strokeWidth).toBe('5px')
    expect(intoA!.style.strokeLinecap).toBe('round')
  })

  it('a value the filter does not take is drawn as if not there, and the file keeps it', async () => {
    const { el, controller, doc, session } = await mount(
      sheetWith({ one: { 'line-color': 'url(x)', 'line-width': 'thick', 'line-pattern': 'wavy' } }),
    )
    const original = await session.produceBytes()
    expect(mainLines(el)[0]!.getAttribute('stroke')).toBe(
      themeLook(DEFAULT_THEME_ID).branches[0]!.color,
    )
    for (const path of [...mainLines(el), ...subLines(el, 0)]) {
      expect(path.getAttribute('style')).toBeNull()
    }
    controller.flush()
    expect(doc.changed).toBe(false)
    expect(await session.produceBytes()).toEqual(original)
  })
})

describe('the shape of a line', () => {
  it('each line takes its shape when laid out', async () => {
    const { el, mind } = await mount(
      sheetWith({
        one: { 'line-class': shape('elbow') },
        oneB: { 'line-class': shape('none') },
        two: { 'line-class': shape('arrowedCurve') },
      }),
    )
    layOut()
    mind.linkDiv()
    const [intoOne, intoTwo] = mainLines(el).map((path) => path.getAttribute('d')!)
    expect(intoOne).toMatch(/^M [\d.-]+ [\d.-]+ H [\d.-]+ V [\d.-]+ H [\d.-]+$/)
    // the curve alone: its arrowhead is drawn apart, after the lines
    expect(intoTwo).toMatch(/^M [\d.-]+ [\d.-]+ C [\d. -]+$/)
    expect(el.querySelectorAll('svg.lines polygon.mm-line-head')).toHaveLength(1)
    const [intoA, intoDeep, intoB] = subLines(el, 0).map((path) => path.getAttribute('d')!)
    // One A has no shape of its own: the line into it takes its parent's
    expect(intoA).toMatch(/ V /)
    expect(intoA).not.toContain('C')
    // and no further: Deep's parent, One A, has no shape of its own, so the theme's
    expect(intoDeep).toMatch(/ C /)
    expect(intoB).toMatch(/^M [\d.-]+ [\d.-]+$/)
  })

  it('an arrowhead is a filled triangle after the lines, whole on a dashed line', async () => {
    const { el, mind } = await mount(
      sheetWith({
        one: { 'line-class': shape('arrowedCurve'), 'line-pattern': 'dot' },
        two: {
          'line-class': shape('arrowedCurve'),
          'line-pattern': 'dash',
          'line-color': '#0000ff',
        },
      }),
    )
    layOut()
    mind.linkDiv()
    const look = themeLook(DEFAULT_THEME_ID)
    const lines = [...el.querySelector('svg.lines')!.children]
    // the library's lines keep their places; the heads come after them
    expect(lines.map((child) => child.tagName.toLowerCase())).toEqual([
      'path',
      'path',
      'polygon',
      'polygon',
    ])
    const heads = lines.slice(2)
    for (const head of heads) {
      expect(head.getAttribute('class')).toBe('mm-line-head')
      expect(head.getAttribute('stroke-dasharray')).toBeNull()
      expect((head as SVGElement).style.strokeDasharray).toBe('')
      expect(head.getAttribute('points')!.split(' ')).toHaveLength(3)
    }
    expect(heads.map((head) => head.getAttribute('fill')).sort()).toEqual(
      ['#0000ff', look.branches[0]!.color].sort(),
    )
    // the lines themselves are dashed
    for (const path of mainLines(el)) expect(path.style.strokeDasharray).not.toBe('')
    // below One: the lines into One A and One B take One's shape, the one into Deep the theme's
    const below = [...subLayer(el, 0).children].map((child) => child.tagName.toLowerCase())
    expect(below).toEqual(['path', 'path', 'path', 'polygon', 'polygon'])
    const subHead = subLayer(el, 0).querySelector<SVGElement>('polygon')!
    expect(subHead.style.fill).toBe('var(--mm-branch)')
    expect(subHead.style.strokeDasharray).toBe('')
  })

  it('a shape only read is drawn as the nearest one, and the file keeps its value', async () => {
    const { el, mind, controller, doc, session } = await mount(
      sheetWith({ oneA: { 'line-class': shape('fold') } }),
    )
    const original = await session.produceBytes()
    layOut()
    mind.linkDiv()
    expect(subLines(el, 0)[0]!.getAttribute('d')).toMatch(/ V /)
    controller.flush()
    expect(doc.changed).toBe(false)
    expect(await session.produceBytes()).toEqual(original)
    const view = session.view(session.tabs()[0]!.key)
    expect(view.root.children[0]!.children[0]!.line).toEqual({ shape: shape('fold') })
  })

  it('a tree and a timeline keep their own lines and take only colour, width and pattern', async () => {
    for (const structureClass of ['org.xmind.ui.tree.right', 'org.xmind.ui.timeline.horizontal']) {
      const sheet = sheetWith({
        one: { 'line-class': shape('straight'), 'line-color': '#00ff00', 'line-width': '3pt' },
        oneA: { 'line-class': shape('straight') },
      })
      sheet.rootTopic.structureClass = structureClass
      const { el, mind } = await mount(sheet)
      layOut()
      mind.linkDiv()
      const intoOne = mainLines(el)[0]!
      expect(intoOne.getAttribute('d'), structureClass).not.toMatch(
        /^M [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+$/,
      )
      expect(intoOne.getAttribute('stroke'), structureClass).toBe('#00ff00')
      expect(intoOne.style.strokeWidth, structureClass).toBe('3px')
      const [intoA] = subLines(el, 0)
      expect(intoA!.getAttribute('d'), structureClass).toMatch(/ V /)
      expect(intoA!.style.stroke, structureClass).toBe('rgb(0, 255, 0)')
      mounted.splice(0).forEach((controller) => controller.destroy())
      vi.restoreAllMocks()
    }
  })
})

describe('the trunk of a tree', () => {
  const tree = (lines: Parameters<typeof sheetWith>[0] = {}): XmindSheet => {
    const sheet = sheetWith(lines)
    sheet.rootTopic.structureClass = 'org.xmind.ui.tree.right'
    return sheet
  }
  const start = (path: SVGPathElement): string =>
    path.getAttribute('d')!.split(' ').slice(1, 3).join(' ')

  it('without line values, every branch runs down the trunk from its top, as it always did', async () => {
    const { el, mind } = await mount(tree())
    layOut()
    mind.linkDiv()
    const [one, two] = mainLines(el)
    expect(start(two!)).toBe(start(one!))
  })

  it('with line values, each branch draws only its own piece of the trunk', async () => {
    const { el, mind } = await mount(tree({ two: { 'line-width': '4pt', 'line-pattern': 'dash' } }))
    layOut()
    mind.linkDiv()
    const [one, two] = mainLines(el)
    const [, topOne] = start(one!).split(' ').map(Number)
    const [, topTwo] = start(two!).split(' ').map(Number)
    // the second starts where the first turns off, below the top
    expect(topTwo).toBeGreaterThan(topOne!)
    expect(two!.style.strokeDasharray).not.toBe('')
  })
})

describe('the arrowheads of a timeline', () => {
  it('are drawn apart after the lines, whole on a dashed line, with the line colour and width', async () => {
    const sheet = sheetWith({
      one: { 'line-pattern': 'dot', 'line-color': '#00ff00', 'line-width': '4pt' },
    })
    sheet.rootTopic.structureClass = 'org.xmind.ui.timeline.horizontal'
    const { el, mind } = await mount(sheet)
    layOut()
    mind.linkDiv()
    const drawn = [...el.querySelector('svg.lines')!.children]
    expect(drawn.map((child) => child.tagName.toLowerCase())).toEqual([
      'path',
      'path',
      'path',
      'path',
    ])
    const [intoOne] = mainLines(el)
    expect(intoOne!.style.strokeDasharray).not.toBe('')
    const arrows = [...el.querySelectorAll<SVGPathElement>('svg.lines path.mm-line-head')]
    expect(arrows).toHaveLength(2)
    const own = arrows.find((arrow) => arrow.getAttribute('stroke') === '#00ff00')!
    expect(own.getAttribute('fill')).toBe('none')
    expect(own.style.strokeWidth).toBe('4px')
    expect(own.style.strokeDasharray).toBe('')
    expect(own.getAttribute('d')).toMatch(/^M [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+ M /)
    // the line itself carries no arrowhead any more
    expect(intoOne!.getAttribute('d')).not.toMatch(/ L /)
  })
})

describe('the map-wide settings', () => {
  it('rainbow off: every line takes the central topic line colour, the topic boxes keep theirs', async () => {
    const { el, session } = await mount(
      sheetWith({}, settingsOnly({ 'multi-line-colors': 'none' })),
    )
    const look = themeLook(DEFAULT_THEME_ID)
    expect(session.hasUnknownTheme()).toBe(false)
    for (const path of mainLines(el)) expect(path.getAttribute('stroke')).toBe(look.strongText)
    for (const path of subLines(el, 0)) expect(path.style.stroke).toBe('var(--mm-strong)')
    const wrappers = el.querySelectorAll<HTMLElement>('me-main > me-wrapper')
    expect(wrappers[placeOf(el, 1)]!.style.getPropertyValue('--mm-branch')).toBe(
      look.branches[1]!.color,
    )
  })

  it("rainbow off with a theme of this app: that theme's line colour, and a colour written on a branch still wins", async () => {
    const id = 'capsule/moss/dark'
    const document = await documentOf(sheetWith({ two: { 'line-color': '#00ff00' } }))
    applySheetTheme(document, 0, id)
    applySheetRainbow(document, 0, false)
    const { el, controller } = show(document)
    expect(controller.themeId).toBe(id)
    expect(mainLines(el).map((path) => path.getAttribute('stroke'))).toEqual([
      themeLook(id).strongText,
      '#00ff00',
    ])
  })

  it('picking another theme keeps the settings', async () => {
    const { el, controller } = await mount(
      sheetWith({}, settingsOnly({ 'multi-line-colors': 'none' })),
    )
    const id = 'block/moss/light'
    controller.setTheme(id)
    for (const path of mainLines(el))
      expect(path.getAttribute('stroke')).toBe(themeLook(id).strongText)
  })

  it('a theme this app does not know: the default look, with the settings still followed', async () => {
    const sheet = richSheet()
    const map = (sheet.theme as { map: { properties: Record<string, string> } }).map
    map.properties['multi-line-colors'] = 'none'
    const { el, session } = await mount(sheet)
    expect(session.hasUnknownTheme()).toBe(true)
    const lines = [...el.querySelectorAll<SVGPathElement>('svg.lines path')]
    expect(lines.length).toBeGreaterThan(0)
    for (const path of lines) {
      expect(path.getAttribute('stroke')).toBe(themeLook(DEFAULT_THEME_ID).strongText)
    }
  })

  it('tapered: the lines from the centre are filled shapes, narrowing towards the topic', async () => {
    const { el, mind } = await mount(
      sheetWith({ two: { 'line-color': '#0000ff' } }, settingsOnly({ 'line-tapered': 'tapered' })),
    )
    layOut()
    mind.linkDiv()
    const look = themeLook(DEFAULT_THEME_ID)
    const [intoOne, intoTwo] = mainLines(el)
    for (const path of [intoOne!, intoTwo!]) {
      expect(path.getAttribute('d')).toMatch(/ Z$/)
      expect(path.getAttribute('stroke')).toBe('none')
    }
    expect(intoOne!.getAttribute('fill')).toBe(look.branches[0]!.color)
    expect(intoTwo!.getAttribute('fill')).toBe('#0000ff')
    // the lines below are not tapered
    for (const path of subLines(el, 0)) expect(path.getAttribute('d')).not.toMatch(/Z$/)
  })

  it('a dashed line from the centre stays dashed with the tapered lines on', async () => {
    const { el, mind } = await mount(
      sheetWith({ one: { 'line-pattern': 'dash' } }, settingsOnly({ 'line-tapered': 'tapered' })),
    )
    layOut()
    mind.linkDiv()
    const [intoOne, intoTwo] = mainLines(el)
    expect(intoOne!.getAttribute('d')).not.toMatch(/Z$/)
    expect(intoOne!.style.strokeDasharray).not.toBe('')
    expect(intoTwo!.getAttribute('d')).toMatch(/ Z$/)
  })

  it('drawing the settings writes nothing', async () => {
    const { controller, doc, session } = await mount(
      sheetWith({}, settingsOnly({ 'line-tapered': 'tapered', 'multi-line-colors': 'none' })),
    )
    const theme = copyOf(doc.sheets[0]!.theme)
    const original = await session.produceBytes()
    controller.flush()
    expect(doc.changed).toBe(false)
    expect(doc.sheets[0]!.theme).toEqual(theme)
    expect(await session.produceBytes()).toEqual(original)
    expect(sheetToView(doc.sheets[0]!, 0).root.line).toBeUndefined()
  })
})

describe('colours and patterns as picked', () => {
  it('a picked colour below a main topic is drawn as picked, not lighter', async () => {
    const { el } = await mount(sheetWith({ oneA: { 'line-color': '#ff0000' } }))
    const look = themeLook(DEFAULT_THEME_ID)
    // the layer is drawn whole
    expect(subLayer(el, 0).style.opacity).toBe('1')
    const [intoA, intoDeep, intoB] = subLines(el, 0)
    expect(intoA!.style.stroke).toBe('rgb(255, 0, 0)')
    expect(intoDeep!.style.stroke).toBe('rgb(255, 0, 0)')
    // a line the theme colours takes the lighter colour itself
    const lighter = mixColors(look.branches[0]!.color, look.ground, 1 - look.lines.sub.opacity)
    expect(intoB!.style.stroke).toBe(rgb(lighter))
  })

  it('with the rainbow off, the lines beside a picked one take the lighter theme colour', async () => {
    const { el } = await mount(
      sheetWith(
        { oneB: { 'line-color': '#00ff00' } },
        settingsOnly({ 'multi-line-colors': 'none' }),
      ),
    )
    const look = themeLook(DEFAULT_THEME_ID)
    const [intoA, , intoB] = subLines(el, 0)
    expect(intoB!.style.stroke).toBe('rgb(0, 255, 0)')
    expect(intoA!.style.stroke).toBe(
      rgb(mixColors(look.strongText, look.ground, 1 - look.lines.sub.opacity)),
    )
  })

  it('a pattern starts with a whole dash where the line comes out from under its topic', async () => {
    const { el, mind } = await mount(sheetWith({ one: { 'line-pattern': 'dash' } }))
    layOut()
    mind.linkDiv()
    // the line from the centre starts under the central topic: the dashes are moved on by that much
    const intoOne = mainLines(el)[0]!
    expect(Number(intoOne.getAttribute('stroke-dashoffset'))).toBeGreaterThan(0)
    // the lines below start at their topic's edge
    for (const path of subLines(el, 0)) {
      expect(path.style.strokeDasharray).not.toBe('')
      expect(path.getAttribute('stroke-dashoffset')).toBeNull()
    }
    // a line without a pattern has no offset
    expect(mainLines(el)[1]!.getAttribute('stroke-dashoffset')).toBeNull()
  })
})
