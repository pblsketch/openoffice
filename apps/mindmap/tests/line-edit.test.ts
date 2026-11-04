/**
 * Editing the line format on the map, with the real drawing library in jsdom:
 * the line into a branch (on a topic and its whole branch), the topics that
 * arrive in a formatted branch, the map-wide settings of the theme panel,
 * relationships and their curve, summary brackets, boundaries, taking a
 * format off, and the format painter. Every edit is one step of the history,
 * reaches the file only for what was changed, and undoes back to the bytes
 * of the file.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_THEME_ID,
  themeLook,
  type XmindDocument,
  type XmindSheet,
  type XmindTopic,
} from '@genoffice/xmind-engine'
import { MapController, type MapHost, type MapNotice } from '../src/renderer/map/controller'
import { DocumentSession } from '../src/renderer/document/session'
import type { MapNode } from '../src/renderer/document/convert'
import { mapStrings } from '../src/renderer/i18n/map-strings'
import { BOUNDARY_ID_ATTRIBUTE } from '../src/renderer/map/relations'
import { themeColorsAt } from '../src/renderer/map/format-painter'
import { copyOf, documentOf, topic } from './helpers/fixtures'

const CURVE = 'org.xmind.branchConnection.curve'
const STRAIGHT = 'org.xmind.branchConnection.straight'

const ID = {
  sheet: 'e0000000-0000-4000-8000-000000000000',
  root: 'e0000000-0000-4000-8000-000000000001',
  a: 'e0000000-0000-4000-8000-000000000002',
  a1: 'e0000000-0000-4000-8000-000000000003',
  a2: 'e0000000-0000-4000-8000-000000000004',
  a2x: 'e0000000-0000-4000-8000-000000000005',
  b: 'e0000000-0000-4000-8000-000000000006',
  b1: 'e0000000-0000-4000-8000-000000000007',
  c: 'e0000000-0000-4000-8000-000000000008',
  c1: 'e0000000-0000-4000-8000-000000000009',
  rel: 'e0000000-0000-4000-8000-00000000000a',
  styledRel: 'e0000000-0000-4000-8000-00000000000b',
  summaryRecord: 'e0000000-0000-4000-8000-00000000000c',
  summaryTopic: 'e0000000-0000-4000-8000-00000000000d',
  boundary: 'e0000000-0000-4000-8000-00000000000e',
} as const

const LINE_A = {
  'line-class': CURVE,
  'line-width': '3pt',
  'line-color': '#112233',
}

function lineStyle(properties: Record<string, string>, id = 'style-id'): Record<string, unknown> {
  return { style: { id, properties: { ...properties } } }
}

/**
 * A map laid out to both sides: A and B on the right, C on the left. A's
 * branch carries a line format all the way down (A2 a pattern of its own); B
 * and C carry none. A plain and a formatted relationship, a summary over A's
 * branches, a boundary around B's.
 */
function linesSheet(): XmindSheet {
  const a = topic(
    ID.a,
    'A',
    {
      ...lineStyle(LINE_A, 'style-a'),
      summaries: [{ id: ID.summaryRecord, range: '(0,1)', topicId: ID.summaryTopic }],
      children: { summary: [topic(ID.summaryTopic, 'Sum')] },
    },
    [
      topic(ID.a1, 'A1', lineStyle(LINE_A, 'style-a1')),
      topic(ID.a2, 'A2', lineStyle({ ...LINE_A, 'line-pattern': 'dot' }, 'style-a2'), [
        topic(ID.a2x, 'A2x', lineStyle(LINE_A, 'style-a2x')),
      ]),
    ],
  )
  const b = topic(ID.b, 'B', { boundaries: [{ id: ID.boundary, range: '(0,0)', title: 'old' }] }, [
    topic(ID.b1, 'B1'),
  ])
  const c = topic(ID.c, 'C', {}, [topic(ID.c1, 'C1')])
  return {
    id: ID.sheet,
    class: 'sheet',
    title: 'Lines',
    rootTopic: topic(ID.root, 'Root', {}, [a, b, c]),
    relationships: [
      { id: ID.rel, end1Id: ID.a1, end2Id: ID.b1, title: 'plain' },
      {
        id: ID.styledRel,
        end1Id: ID.a2,
        end2Id: ID.c,
        title: 'styled',
        style: {
          id: 'rel-style',
          properties: {
            'shape-class': 'org.xmind.relationshipShape.angled',
            'arrow-end-class': 'org.xmind.arrowShape.dot',
            'line-color': '#cc3300',
          },
        },
        controlPoints: { '0': { x: 10, y: 20 }, '1': { x: -10, y: -20 } },
        lineEndPoints: { '0': { x: 1, y: 1 }, '1': { x: 2, y: 2 } },
      },
    ],
  }
}

/** The lines sheet with A2 drawn in a colour of its own, other than the one A has. */
function ownColourSheet(): XmindSheet {
  const sheet = linesSheet()
  const a2 = sheet.rootTopic.children!.attached![0]!.children!.attached![1]!
  ;(a2.style as { properties: Record<string, string> }).properties['line-color'] = '#999999'
  return sheet
}

const OTHER = 'e0000000-0000-4000-8000-00000000000f'

const mounted: MapController[] = []
afterEach(() => {
  mounted.splice(0).forEach((controller) => controller.destroy())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function mount(sheet: XmindSheet = linesSheet(), doc?: XmindDocument) {
  const document_ = doc ?? (await documentOf(sheet))
  const original = await document_.save()
  const session = new DocumentSession(document_)
  const el = document.createElement('div')
  document.body.appendChild(el)
  const notices: MapNotice[] = []
  const host: MapHost & { onBoundaryMenu: ReturnType<typeof vi.fn> } = {
    confirmDelete: vi.fn(async () => true),
    openLink: vi.fn(),
    onRequest: vi.fn(),
    onStateChange: vi.fn(),
    onNotice: (notice) => notices.push(notice),
    onBoundaryMenu: vi.fn(),
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
  const doc_ = document_
  const find = (id: string, from: XmindTopic = doc_.sheets[0]!.rootTopic): XmindTopic | null => {
    if (from.id === id) return from
    for (const kind of Object.values(from.children ?? {})) {
      for (const child of (kind as XmindTopic[]) ?? []) {
        const hit = find(id, child)
        if (hit) return hit
      }
    }
    return null
  }
  /** The style properties a topic holds in the file. */
  const props = (id: string): Record<string, unknown> =>
    ((find(id)?.style as { properties?: Record<string, unknown> } | undefined)?.properties ??
      {}) as Record<string, unknown>
  const relationship = (id: string) =>
    (doc_.sheets[0]!.relationships as Record<string, unknown>[]).find((line) => line.id === id)!
  return {
    doc: doc_,
    original,
    session,
    el,
    host,
    notices,
    key,
    controller,
    mind: controller.mind,
    find,
    props,
    relationship,
    /** whether the bytes a save makes now are the file's own */
    async unchanged(): Promise<boolean> {
      return Buffer.from(await doc_.save()).equals(Buffer.from(original))
    },
  }
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setTimeout(resolve, 0))
}

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  )
}

function pointer(target: EventTarget, type: string, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  Object.defineProperty(event, 'pointerType', { value: 'mouse' })
  target.dispatchEvent(event)
  return event
}

/** jsdom lays nothing out: every element gets a box of its own (as in relation-draw.test.ts). */
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

const boundaryParts = (el: HTMLElement, id: string) =>
  [...el.querySelectorAll(`[${BOUNDARY_ID_ATTRIBUTE}]`)].filter(
    (element) => element.getAttribute(BOUNDARY_ID_ATTRIBUTE) === id,
  )

describe('the line into a branch', () => {
  it('a value set on a topic goes on it and every topic below it, as one step that undoes to the file', async () => {
    const { controller, props, unchanged, doc } = await mount()
    expect(controller.setBranchLine({ color: '#00AA00', width: 4 }, [ID.c])).toEqual({ ok: true })
    for (const id of [ID.c, ID.c1]) {
      expect(props(id)).toMatchObject({ 'line-color': '#00aa00', 'line-width': '4pt' })
    }
    // the rest of the map is untouched
    expect(props(ID.b)).toEqual({})
    expect(controller.canUndo).toBe(true)
    controller.undo()
    expect(controller.canUndo).toBe(false)
    expect(doc.changed).toBe(false)
    expect(await unchanged()).toBe(true)
  })

  it('writes over the values the topics below had, and leaves their other keys', async () => {
    const { controller, props } = await mount()
    controller.setBranchLine({ pattern: 'dash' }, [ID.a])
    for (const id of [ID.a, ID.a1, ID.a2, ID.a2x]) expect(props(id)['line-pattern']).toBe('dash')
    expect(props(ID.a2)).toMatchObject({ 'line-color': '#112233', 'line-class': CURVE })
  })

  it('on the central topic it is the whole map; several topics take it each', async () => {
    const { controller, props } = await mount()
    controller.setBranchLine({ shape: 'straight' }, [ID.root])
    for (const id of [ID.root, ID.a, ID.a2x, ID.b, ID.b1, ID.c1]) {
      expect(props(id)['line-class']).toBe(STRAIGHT)
    }
    controller.undo()
    controller.mind.selectNodes([controller.mind.findEle(ID.b), controller.mind.findEle(ID.c)])
    expect(controller.setBranchLine({ color: '#445566' })).toEqual({ ok: true })
    for (const id of [ID.b, ID.b1, ID.c, ID.c1]) expect(props(id)['line-color']).toBe('#445566')
    expect(props(ID.a)['line-color']).toBe('#112233')
    controller.undo()
    expect(controller.canUndo).toBe(false)
  })

  it('a value the file cannot hold is turned down whole; the same values again make no step', async () => {
    const { controller, props } = await mount()
    expect(controller.setBranchLine({ color: 'red' }, [ID.c])).toEqual({
      ok: false,
      reason: 'invalid-value',
    })
    expect(controller.setBranchLine({ color: '#00aa00', width: 2.5 }, [ID.c])).toEqual({
      ok: false,
      reason: 'invalid-value',
    })
    expect(controller.setBranchLine({ width: 21 }, [ID.c]).ok).toBe(false)
    expect(controller.setBranchLine({ shape: 'fold' as never }, [ID.c]).ok).toBe(false)
    expect(props(ID.c)).toEqual({})
    expect(controller.setBranchLine({ color: '#112233' }, [ID.a])).toEqual({
      ok: false,
      reason: 'unchanged',
    })
    expect(controller.setBranchLine({ color: '#112233' }, ['no-such-topic'])).toEqual({
      ok: false,
      reason: 'nothing',
    })
    expect(controller.canUndo).toBe(false)
  })

  it('taking the values off a branch: it follows the branch above it again', async () => {
    const { controller, props, unchanged } = await mount()
    expect(controller.topicLine(ID.a2)!.drawn.pattern).toBe('dot')
    expect(controller.clearBranchLine([ID.a2])).toEqual({ ok: true })
    expect(props(ID.a2)).toEqual({})
    expect(props(ID.a2x)).toEqual({})
    expect(controller.topicLine(ID.a2)!.own).toEqual({})
    // the colour comes from A now; the width and the pattern from A2's parent
    const drawn = controller.topicLine(ID.a2)!.drawn
    expect(drawn).toMatchObject({
      color: '#112233',
      colorFrom: 'inherited',
      width: 3,
      pattern: 'solid',
    })
    expect(props(ID.a1)).toMatchObject(LINE_A)
    controller.undo()
    expect(await unchanged()).toBe(true)
  })
})

describe('topics that arrive in a branch', () => {
  it('a new topic under a formatted topic takes its line values, in the step that adds it', async () => {
    const { controller, mind, props, find, unchanged } = await mount()
    mind.addChild(mind.findEle(ID.a1))
    await settle()
    const added = find(ID.a1)!.children!.attached![0]!
    expect(props(added.id)).toMatchObject(LINE_A)
    controller.undo()
    expect(find(ID.a1)!.children).toBeUndefined()
    expect(await unchanged()).toBe(true)
  })

  it('a new sibling takes the values of the parent it joins', async () => {
    const { mind, props, find } = await mount()
    mind.insertSibling('after', mind.findEle(ID.a1))
    await settle()
    const added = find(ID.a)!.children!.attached![1]!
    expect(added.id).not.toBe(ID.a2)
    expect(props(added.id)).toMatchObject(LINE_A)
  })

  it('under a topic without values a new topic has none', async () => {
    const { mind, props, find } = await mount()
    mind.addChild(mind.findEle(ID.b1))
    await settle()
    const added = find(ID.b1)!.children!.attached![0]!
    expect(props(added.id)).toEqual({})
  })

  it('a topic dragged into a formatted branch takes its values with its own branch, as one step', async () => {
    const { controller, mind, props, unchanged } = await mount()
    await mind.moveNodeIn([mind.findEle(ID.c)], mind.findEle(ID.a1))
    await settle()
    for (const id of [ID.c, ID.c1]) expect(props(id)).toMatchObject(LINE_A)
    controller.undo()
    expect(await unchanged()).toBe(true)
  })

  it('a formatted topic moved under a topic without values keeps its own', async () => {
    const { mind, props } = await mount()
    await mind.moveNodeIn([mind.findEle(ID.a2)], mind.findEle(ID.b1))
    await settle()
    expect(props(ID.a2)).toMatchObject({ ...LINE_A, 'line-pattern': 'dot' })
  })

  it('moved before a topic of another branch it takes that parent’s values, as one step', async () => {
    const { mind, props, controller, unchanged } = await mount()
    await mind.moveNodeBefore([mind.findEle(ID.c1)], mind.findEle(ID.a1))
    await settle()
    expect(props(ID.c1)).toMatchObject(LINE_A)
    controller.undo()
    expect(await unchanged()).toBe(true)
  })

  it('moved up among its siblings by a key, a topic keeps every value of its own', async () => {
    const { mind, props, find } = await mount(ownColourSheet())
    const before = copyOf(props(ID.a2))
    expect(before['line-color']).toBe('#999999')
    mind.selectNode(mind.findEle(ID.a2))
    press(mind.container, 'ArrowUp', { altKey: true })
    await settle()
    // it did move, under the same parent
    expect(find(ID.a)!.children!.attached!.map((child) => child.id)).toEqual([ID.a2, ID.a1])
    expect(props(ID.a2)).toEqual(before)
    expect(props(ID.a2x)['line-color']).toBe('#112233')
  })

  it('cut and pasted into a formatted branch, the topic comes back whole and takes the values', async () => {
    const { controller, mind, props, find, unchanged } = await mount()
    const clipboard = await cutTopic(mind, ID.c)
    await pasteInto(mind, ID.a1, clipboard)
    const moved = find(ID.a1)!.children!.attached![0]!
    expect(moved.id).toBe(ID.c)
    for (const id of [ID.c, ID.c1]) expect(props(id)).toMatchObject(LINE_A)
    controller.undo()
    controller.undo()
    expect(await unchanged()).toBe(true)
  })

  it('copied and pasted into a formatted branch, the new topics take the values', async () => {
    const { controller, mind, props, find, unchanged } = await mount()
    mind.selectNode(mind.findEle(ID.c))
    const copy = clipboardEvent('copy')
    mind.container.dispatchEvent(copy.event)
    await pasteInto(mind, ID.a1, copy.text())
    const pasted = find(ID.a1)!.children!.attached![0]!
    expect(pasted.title).toBe('C')
    expect(pasted.id).not.toBe(ID.c)
    expect(props(pasted.id)).toMatchObject(LINE_A)
    expect(props(pasted.children!.attached![0]!.id)).toMatchObject(LINE_A)
    controller.undo()
    expect(await unchanged()).toBe(true)
  })

  it('copied and pasted under a topic without values, the new topics keep their own', async () => {
    const { controller, mind, props, find, unchanged } = await mount()
    mind.selectNode(mind.findEle(ID.a2))
    const copy = clipboardEvent('copy')
    mind.container.dispatchEvent(copy.event)
    await pasteInto(mind, ID.b1, copy.text())
    const pasted = find(ID.b1)!.children!.attached![0]!
    expect(pasted.id).not.toBe(ID.a2)
    expect(props(pasted.id)).toEqual({ ...LINE_A, 'line-pattern': 'dot' })
    expect(props(pasted.children!.attached![0]!.id)).toEqual(LINE_A)
    controller.undo()
    expect(await unchanged()).toBe(true)
  })

  it('pasted under a topic without values, the topics keep their own', async () => {
    const { mind, props, find } = await mount()
    const clipboard = await cutTopic(mind, ID.a2)
    await pasteInto(mind, ID.b1, clipboard)
    expect(find(ID.b1)!.children!.attached![0]!.id).toBe(ID.a2)
    expect(props(ID.a2)).toMatchObject({ ...LINE_A, 'line-pattern': 'dot' })
  })

  it('a topic the AI adds or moves into a formatted branch (an edit of the data) takes the values', async () => {
    const { controller, props, find, unchanged } = await mount()
    controller.edit((root) => {
      const a = root.children![0]!
      const c = root.children!.splice(2, 1)[0]!
      a.children!.push(c)
      a.children![0]!.children = [{ id: 'new', topic: 'Added' } as MapNode]
    })
    const added = find(ID.a1)!.children!.attached![0]!
    expect(added.title).toBe('Added')
    expect(props(added.id)).toMatchObject(LINE_A)
    for (const id of [ID.c, ID.c1]) expect(props(id)).toMatchObject(LINE_A)
    controller.undo()
    expect(await unchanged()).toBe(true)
  })
})

describe('a new topic put above a branch, and a line set in the same edit', () => {
  it('a new parent takes the values of the topic above it for itself; the branch below keeps its own', async () => {
    const { controller, mind, props, find, unchanged } = await mount(ownColourSheet())
    const before = { a2: copyOf(props(ID.a2)), a2x: copyOf(props(ID.a2x)) }
    mind.insertParent(mind.findEle(ID.a2))
    await settle()
    const inserted = find(ID.a)!.children!.attached![1]!
    expect(inserted.id).not.toBe(ID.a2)
    expect(inserted.children!.attached!.map((child) => child.id)).toEqual([ID.a2])
    expect(props(inserted.id)).toEqual(LINE_A)
    expect(props(ID.a2)).toEqual(before.a2)
    expect(props(ID.a2x)).toEqual(before.a2x)
    controller.commitEdit()
    while (controller.canUndo) controller.undo()
    expect(await unchanged()).toBe(true)
  })

  it('a topic moved into a formatted branch keeps the keys the same edit set, over the parent’s', async () => {
    const { controller, props, find, unchanged } = await mount()
    const own = { color: '#00ff00' }
    controller.edit(
      (root) => {
        const a = root.children![0]!
        const c = root.children!.splice(2, 1)[0]!
        a.children!.push(c)
        c.metadata = { ...c.metadata!, line: own }
        c.children![0]!.metadata = { ...c.children![0]!.metadata!, line: own }
        // and a new topic the edit gives no line takes the parent's
        c.children!.push({ id: OTHER, topic: 'Plain new' } as MapNode)
      },
      {
        restyledLines: [ID.c, ID.c1],
        lineEdits: new Map([
          [ID.c, own],
          [ID.c1, own],
        ]),
      },
    )
    expect(find(ID.a)!.children!.attached!.map((child) => child.id)).toContain(ID.c)
    // the colour set; the keys it did not set are the parent's
    expect(props(ID.c)).toEqual({ ...LINE_A, 'line-color': '#00ff00' })
    expect(props(ID.c1)).toEqual({ ...LINE_A, 'line-color': '#00ff00' })
    expect(props(OTHER)).toEqual(LINE_A)
    controller.undo()
    expect(await unchanged()).toBe(true)
  })
})

describe('the map-wide line settings', () => {
  it('are written into the sheet’s theme, are no step of the history, and are not written twice', async () => {
    const { controller, doc } = await mount()
    expect(controller.lineSettings).toEqual({ tapered: false, rainbow: true })
    expect(controller.setTapered(true)).toBe(true)
    expect(controller.setTapered(true)).toBe(false)
    expect(controller.setRainbow(false)).toBe(true)
    const properties = (doc.sheets[0]!.theme as { map: { properties: Record<string, string> } }).map
      .properties
    expect(properties).toEqual({ 'line-tapered': 'tapered', 'multi-line-colors': 'none' })
    expect(controller.lineSettings).toEqual({ tapered: true, rainbow: false })
    expect(controller.canUndo).toBe(false)
    // off, the lines draw with the theme's line colour
    expect(controller.topicLine(ID.b)!.drawn.colorFrom).toBe('theme')
  })

  it('switched on again, the branch colours get back the list the sheet had', async () => {
    const sheet = linesSheet()
    sheet.theme = {
      map: {
        id: 'their-map',
        properties: { 'multi-line-colors': '#aa0000 #00bb00', 'svg:fill': '#fff' },
      },
    }
    const { controller, doc } = await mount(sheet)
    const properties = () =>
      (doc.sheets[0]!.theme as { map: { properties: Record<string, string> } }).map.properties
    controller.setRainbow(false)
    expect(properties()['multi-line-colors']).toBe('none')
    controller.setRainbow(true)
    expect(properties()).toEqual({ 'multi-line-colors': '#aa0000 #00bb00', 'svg:fill': '#fff' })
  })
})

describe('relationships', () => {
  it('take every value as one step, written on the relationship only, and undo to the file', async () => {
    const { controller, relationship, unchanged } = await mount()
    const outcome = controller.setRelationshipStyle(
      {
        shape: 'zigzag',
        begin: 'dot',
        end: 'triangle',
        color: '#123456',
        width: 2,
        pattern: 'dash',
      },
      [ID.rel],
    )
    expect(outcome).toEqual({ ok: true })
    expect((relationship(ID.rel).style as { properties: unknown }).properties).toEqual({
      'shape-class': 'org.xmind.relationshipShape.zigzag',
      'arrow-begin-class': 'org.xmind.arrowShape.dot',
      'arrow-end-class': 'org.xmind.arrowShape.triangle',
      'line-color': '#123456',
      'line-width': '2pt',
      'line-pattern': 'dash',
    })
    // the other relationship keeps its curve and its end points
    expect(relationship(ID.styledRel).lineEndPoints).toBeDefined()
    expect(controller.relationshipFormat(ID.rel)!.style.shape).toBe(
      'org.xmind.relationshipShape.zigzag',
    )
    controller.undo()
    expect(await unchanged()).toBe(true)
  })

  it('a value taken off goes from the file; taking them all off keeps the curve', async () => {
    const { controller, relationship } = await mount()
    controller.setRelationshipStyle({ end: null }, [ID.styledRel])
    expect((relationship(ID.styledRel).style as { properties: unknown }).properties).toEqual({
      'shape-class': 'org.xmind.relationshipShape.angled',
      'line-color': '#cc3300',
    })
    controller.clearRelationshipStyle([ID.styledRel])
    expect(relationship(ID.styledRel).style).toBeUndefined()
    expect(relationship(ID.styledRel).controlPoints).toEqual({
      '0': { x: 10, y: 20 },
      '1': { x: -10, y: -20 },
    })
  })

  it('letting go of a dragged handle keeps the curve, as one step; the old end points go', async () => {
    const { controller, mind, relationship, unchanged } = await mount()
    const arrow = mind.arrows.find((line) => line.id === ID.styledRel)!
    // what the library does when a handle is let go: its control points moved, then the step
    mind.reshapeArrow(arrow, { delta1: { x: 33, y: 44 }, delta2: { x: -5, y: 6 } })
    await settle()
    expect(relationship(ID.styledRel).controlPoints).toEqual({
      '0': { x: 33, y: 44 },
      '1': { x: -5, y: 6 },
    })
    expect(relationship(ID.styledRel).lineEndPoints).toBeUndefined()
    expect(controller.relationshipFormat(ID.styledRel)!.curve).toEqual({
      from: { x: 33, y: 44 },
      to: { x: -5, y: 6 },
    })
    controller.undo()
    expect(await unchanged()).toBe(true)
  })

  it('a relationship without a curve that is dragged gets one', async () => {
    const { mind, relationship } = await mount()
    const arrow = mind.arrows.find((line) => line.id === ID.rel)!
    mind.reshapeArrow(arrow, { delta1: { x: 1, y: 2 }, delta2: { x: 3, y: 4 } })
    await settle()
    expect(relationship(ID.rel).controlPoints).toEqual({ '0': { x: 1, y: 2 }, '1': { x: 3, y: 4 } })
  })

  it('"curve on its own" takes the curve and its end points off, as one step', async () => {
    const { controller, relationship, unchanged } = await mount()
    expect(controller.resetRelationshipCurve([ID.styledRel])).toEqual({ ok: true })
    expect(relationship(ID.styledRel).controlPoints).toBeUndefined()
    expect(relationship(ID.styledRel).lineEndPoints).toBeUndefined()
    expect(controller.relationshipFormat(ID.styledRel)!.curve).toBeNull()
    // already on its own
    expect(controller.resetRelationshipCurve([ID.rel])).toEqual({ ok: false, reason: 'unchanged' })
    controller.undo()
    expect(await unchanged()).toBe(true)
    expect(
      controller.setRelationshipCurve(ID.rel, { from: { x: 5, y: 5 }, to: { x: 6, y: 6 } }),
    ).toEqual({
      ok: true,
    })
    expect(relationship(ID.rel).controlPoints).toEqual({ '0': { x: 5, y: 5 }, '1': { x: 6, y: 6 } })
  })

  it('the selected relationship is the one changed when no id is given, and stays selected', async () => {
    layOut()
    const { controller, mind, relationship } = await mount()
    const group = [...mind.arrowSvg.children].find(
      (child) => (child as SVGGElement).dataset.linkid === ID.rel,
    ) as Parameters<typeof mind.selectArrow>[0]
    mind.selectArrow(group)
    expect(controller.selection()).toEqual({ kind: 'relationship', id: ID.rel })
    expect(controller.setRelationshipStyle({ color: '#010203' })).toEqual({ ok: true })
    expect((relationship(ID.rel).style as { properties: unknown }).properties).toEqual({
      'line-color': '#010203',
    })
    expect(controller.selection()).toEqual({ kind: 'relationship', id: ID.rel })
  })
})

describe('summary brackets', () => {
  it('take a shape on the summary record, as one step; the summary topic’s shape is untouched', async () => {
    const { controller, find, doc, unchanged } = await mount()
    expect(controller.setSummaryStyle({ shape: 'square' }, [ID.summaryTopic])).toEqual({ ok: true })
    const record = (find(ID.a)!.summaries as Record<string, unknown>[])[0]!
    expect((record.style as { properties: unknown }).properties).toEqual({
      'shape-class': 'org.xmind.summaryShape.square',
    })
    expect(find(ID.summaryTopic)!.style).toBeUndefined()
    expect(controller.summaryFormat(ID.summaryTopic)).toEqual({
      shape: 'org.xmind.summaryShape.square',
    })
    controller.undo()
    expect(doc.changed).toBe(false)
    expect(await unchanged()).toBe(true)
  })
})

describe('boundaries', () => {
  it('a boundary goes around the selected branches of one parent, from the first to the last, with no values', async () => {
    const { controller, mind, find, unchanged } = await mount()
    mind.selectNodes([mind.findEle(ID.a2), mind.findEle(ID.a1)])
    const outcome = controller.addBoundary()
    expect(outcome.ok).toBe(true)
    const records = find(ID.a)!.boundaries as Record<string, unknown>[]
    expect(records).toHaveLength(1)
    expect(records[0]).toEqual({ id: (outcome as { id: string }).id, range: '(0,1)' })
    // it is selected now, and nothing else is
    expect(controller.selection()).toEqual({ kind: 'boundary', id: records[0]!.id })
    expect(controller.selectedTopicIds()).toEqual([])
    controller.undo()
    expect(await unchanged()).toBe(true)
  })

  it('the central topic alone gets a boundary around the whole map', async () => {
    const { controller, find } = await mount()
    expect(controller.addBoundary([ID.root]).ok).toBe(true)
    expect((find(ID.root)!.boundaries as Record<string, unknown>[])[0]).toMatchObject({
      range: 'master',
    })
  })

  it('is turned down with a reason for other parents, the central topic with others, and both sides', async () => {
    const { controller, notices, doc } = await mount()
    const before = JSON.stringify(doc.sheets[0])
    expect(controller.addBoundary([ID.a1, ID.b1])).toEqual({
      ok: false,
      reason: 'different-parents',
    })
    expect(controller.addBoundary([ID.root, ID.a])).toEqual({ ok: false, reason: 'central-mixed' })
    // A and B are on the right of the central topic, C on its left
    expect(controller.addBoundary([ID.a, ID.c])).toEqual({ ok: false, reason: 'both-sides' })
    expect(controller.addBoundary([])).toEqual({ ok: false, reason: 'nothing-selected' })
    expect(notices).toEqual([
      { code: 'boundary-refused', reason: 'different-parents' },
      { code: 'boundary-refused', reason: 'central-mixed' },
      { code: 'boundary-refused', reason: 'both-sides' },
      { code: 'boundary-refused', reason: 'nothing-selected' },
    ])
    expect(JSON.stringify(doc.sheets[0])).toBe(before)
    expect(controller.canUndo).toBe(false)
    // on one side it is made
    expect(controller.addBoundary([ID.a, ID.b]).ok).toBe(true)
  })

  it('outside the layout to both sides the range may reach over the centre, and takes in the branch between', async () => {
    const { controller, find } = await mount()
    controller.setLayout('right')
    const outcome = controller.addBoundary([ID.c, ID.a])
    expect(outcome.ok).toBe(true)
    const records = find(ID.root)!.boundaries as Record<string, unknown>[]
    expect(records).toEqual([{ id: (outcome as { id: string }).id, range: '(0,2)' }])
    // B, not selected, stands between A and C and is inside it
    expect(controller.boundary()).toMatchObject({ topicId: ID.root, range: { start: 0, end: 2 } })
  })

  it('selecting a boundary ends the selection of topics, and selecting a topic ends the boundary’s', async () => {
    const { controller, mind } = await mount()
    mind.selectNode(mind.findEle(ID.a))
    expect(controller.selectBoundary(ID.boundary)).toBe(true)
    expect(controller.selectedTopicIds()).toEqual([])
    expect(controller.selection()).toEqual({ kind: 'boundary', id: ID.boundary })
    mind.selectNode(mind.findEle(ID.b))
    expect(controller.selectedBoundaryId).toBeNull()
    expect(controller.selection()).toEqual({ kind: 'topics', ids: [ID.b] })
    expect(controller.selectBoundary('no-such-boundary')).toBe(false)
  })

  it('a press on its outline or title selects it and marks it; the library does not see the press', async () => {
    layOut()
    const { controller, mind, el } = await mount()
    mind.selectNode(mind.findEle(ID.a))
    const [group] = boundaryParts(el, ID.boundary)
    expect(group).toBeDefined()
    const outline = group!.querySelector('.mm-boundary-shape')!
    const down = pointer(outline, 'pointerdown')
    expect(down.defaultPrevented).toBe(true)
    expect(controller.selectedBoundaryId).toBe(ID.boundary)
    expect(controller.selectedTopicIds()).toEqual([])
    expect(boundaryParts(el, ID.boundary)[0]!.classList.contains('selected')).toBe(true)
    // drawn again, it stays marked
    mind.linkDiv()
    expect(boundaryParts(el, ID.boundary)[0]!.classList.contains('selected')).toBe(true)
    const title = el.querySelector('.mm-boundary-title')!
    controller.selectBoundary(null)
    pointer(title, 'pointerdown')
    expect(controller.selectedBoundaryId).toBe(ID.boundary)
  })

  it('a press on empty space lets the boundary go, so a later Delete takes nothing', async () => {
    layOut()
    const { controller, mind, find } = await mount()
    controller.selectBoundary(ID.boundary)
    const down = pointer(mind.nodes, 'pointerdown')
    // the library still has the press
    expect(down.defaultPrevented).toBe(false)
    expect(controller.selectedBoundaryId).toBeNull()
    expect(controller.selection()).toEqual({ kind: 'none' })
    press(mind.container, 'Delete')
    expect((find(ID.b)!.boundaries as Record<string, unknown>[])[0]!.id).toBe(ID.boundary)
    expect(controller.canUndo).toBe(false)
  })

  it('Delete removes the selected boundary, as one step; the topics stay', async () => {
    const { controller, mind, find, unchanged } = await mount()
    controller.selectBoundary(ID.boundary)
    press(mind.container, 'Delete')
    expect(find(ID.b)!.boundaries).toBeUndefined()
    expect(find(ID.b1)).not.toBeNull()
    expect(controller.selectedBoundaryId).toBeNull()
    expect(controller.boundaries().map((boundary) => boundary.id)).toEqual([])
    controller.undo()
    expect(await unchanged()).toBe(true)
    expect(controller.boundaries().map((boundary) => boundary.id)).toEqual([ID.boundary])
  })

  it('the menu on a boundary selects it and asks the host, whose entry removes it', async () => {
    layOut()
    const { controller, el, host, find } = await mount()
    const [group] = boundaryParts(el, ID.boundary)
    const menu = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 34,
    })
    group!.querySelector('.mm-boundary-shape')!.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
    expect(host.onBoundaryMenu).toHaveBeenCalledExactlyOnceWith(ID.boundary, { x: 12, y: 34 })
    expect(controller.selectedBoundaryId).toBe(ID.boundary)
    expect(controller.removeBoundary(ID.boundary)).toBe(true)
    expect(find(ID.b)!.boundaries).toBeUndefined()
  })

  it('its title is typed like a relationship’s: text only, empty is no title, Esc leaves it', async () => {
    layOut()
    const { controller, mind, el, find, doc } = await mount()
    controller.selectBoundary(ID.boundary)
    press(mind.container, 'F2')
    let box = el.querySelector<HTMLElement>('#input-box')!
    expect(box.dataset.type).toBe('boundary')
    expect(box.textContent).toBe('old')
    expect(controller.editingText).toBe(true)
    box.textContent = '<b>new</b> title'
    box.dispatchEvent(new FocusEvent('blur'))
    expect((find(ID.b)!.boundaries as Record<string, unknown>[])[0]!.title).toBe('<b>new</b> title')
    expect(el.querySelector('.mm-boundaries b')).toBeNull()
    expect(el.querySelector('.mm-boundary-title')!.textContent).toBe('<b>new</b> title')

    // Esc leaves the title as it was
    controller.editBoundaryTitle(ID.boundary)
    box = el.querySelector<HTMLElement>('#input-box')!
    box.textContent = 'not this'
    press(box, 'Escape')
    expect(el.querySelector('#input-box')).toBeNull()
    expect((find(ID.b)!.boundaries as Record<string, unknown>[])[0]!.title).toBe('<b>new</b> title')

    // a double click opens it too; an empty title takes it off
    const title = el.querySelector('.mm-boundary-title')!
    title.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    box = el.querySelector<HTMLElement>('#input-box')!
    box.textContent = '   '
    box.dispatchEvent(new FocusEvent('blur'))
    expect((find(ID.b)!.boundaries as Record<string, unknown>[])[0]).not.toHaveProperty('title')
    controller.undo()
    controller.undo()
    expect(doc.changed).toBe(false)
  })

  it('its title is one line: Shift+Enter breaks no line, and a typed or pasted break is a space', async () => {
    layOut()
    const { controller, el, find } = await mount()
    const title = () => (find(ID.b)!.boundaries as Record<string, unknown>[])[0]!.title
    controller.selectBoundary(ID.boundary)
    controller.editBoundaryTitle(ID.boundary)
    const box = el.querySelector<HTMLElement>('#input-box')!
    const shiftEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    box.dispatchEvent(shiftEnter)
    expect(shiftEnter.defaultPrevented).toBe(true)
    // the box stays open: Shift+Enter neither breaks the line nor takes the title
    expect(el.querySelector('#input-box')).toBe(box)
    box.textContent = 'first\r\n  second\nthird'
    box.dispatchEvent(new FocusEvent('blur'))
    expect(title()).toBe('first second third')
    expect(el.querySelector('#input-box')).toBeNull()

    // the controller's own way in takes one line too
    expect(controller.setBoundaryTitle(ID.boundary, 'a\nb')).toBe(true)
    expect(title()).toBe('a b')
    expect(controller.setBoundaryTitle(ID.boundary, 'a \n b')).toBe(false)
  })

  it('takes every value, the fill included, as one step; taking them off goes back to none', async () => {
    const { controller, find, unchanged } = await mount()
    controller.selectBoundary(ID.boundary)
    expect(
      controller.setBoundaryStyle({
        shape: 'rect',
        color: '#123456',
        width: 2,
        pattern: 'dot',
        fill: 'none',
      }),
    ).toEqual({ ok: true })
    const record = () => (find(ID.b)!.boundaries as Record<string, unknown>[])[0]!
    expect((record().style as { properties: unknown }).properties).toEqual({
      'shape-class': 'org.xmind.boundaryShape.rect',
      'line-color': '#123456',
      'line-width': '2pt',
      'line-pattern': 'dot',
      'svg:fill': 'none',
    })
    expect(controller.selectedBoundaryId).toBe(ID.boundary)
    expect(controller.setBoundaryStyle({ fill: 'transparent' })).toEqual({
      ok: false,
      reason: 'invalid-value',
    })
    expect(controller.clearFormat()).toEqual({ ok: true })
    expect(record().style).toBeUndefined()
    controller.undo()
    controller.undo()
    expect(await unchanged()).toBe(true)
  })
})

describe('clear format', () => {
  it('on topics takes the text format and the line values of their branches off, as one step', async () => {
    const sheet = linesSheet()
    const a = sheet.rootTopic.children!.attached![0]!
    ;(a.style as { properties: Record<string, string> }).properties['fo:color'] = '#aa0000'
    const { controller, mind, props, unchanged } = await mount(sheet)
    mind.selectNode(mind.findEle(ID.a))
    expect(controller.clearFormat()).toEqual({ ok: true })
    for (const id of [ID.a, ID.a1, ID.a2, ID.a2x]) expect(props(id)).toEqual({})
    controller.undo()
    expect(await unchanged()).toBe(true)
    expect(controller.clearFormat()).toEqual({ ok: true })
    mind.selectNode(mind.findEle(ID.b))
    expect(controller.clearFormat()).toEqual({ ok: false, reason: 'unchanged' })
  })

  it('on a relationship takes its values off', async () => {
    layOut()
    const { controller, mind, relationship } = await mount()
    const group = [...mind.arrowSvg.children].find(
      (child) => (child as SVGGElement).dataset.linkid === ID.styledRel,
    ) as Parameters<typeof mind.selectArrow>[0]
    mind.selectArrow(group)
    expect(controller.clearFormat()).toEqual({ ok: true })
    expect(relationship(ID.styledRel).style).toBeUndefined()
  })
})

describe('the format painter', () => {
  it('held for one topic: the next topic takes the format, with its branch, as one step', async () => {
    const sheet = linesSheet()
    const a2 = sheet.rootTopic.children!.attached![0]!.children!.attached![1]!
    ;(a2.style as { properties: Record<string, string> }).properties['svg:fill'] = '#ABCDEF'
    const { controller, mind, props, unchanged, notices } = await mount(sheet)
    expect(controller.formatPainter).toEqual({ active: false, sticky: false, kind: null })
    expect(controller.startFormatPainter()).toEqual({ ok: false, reason: 'nothing-selected' })
    expect(notices).toEqual([{ code: 'painter-nothing-selected' }])
    mind.selectNode(mind.findEle(ID.a2))
    expect(controller.startFormatPainter()).toEqual({ ok: true })
    expect(controller.formatPainter).toEqual({ active: true, sticky: false, kind: 'topic' })
    expect(mind.container.dataset.mmPainter).toBe('topic')
    expect(controller.applyFormatTo({ kind: 'topic', id: ID.c })).toEqual({ ok: true })
    for (const id of [ID.c, ID.c1]) {
      expect(props(id)).toMatchObject({ ...LINE_A, 'line-pattern': 'dot' })
    }
    // the text and the fill go on the target alone
    expect(props(ID.c)).toHaveProperty('fo:font-size')
    expect(props(ID.c)['svg:fill']).toBe('#abcdef')
    expect(props(ID.c1)).not.toHaveProperty('fo:font-size')
    expect(props(ID.c1)).not.toHaveProperty('svg:fill')
    expect(controller.formatPainter.active).toBe(false)
    expect(mind.container.dataset.mmPainter).toBeUndefined()
    controller.undo()
    expect(controller.canUndo).toBe(false)
    expect(await unchanged()).toBe(true)
  })

  it('held on: every press puts it on, until Esc', async () => {
    const { controller, mind, props } = await mount()
    mind.selectNode(mind.findEle(ID.a))
    controller.toggleFormatPainter()
    expect(controller.toggleFormatPainter()).toEqual({ active: true, sticky: true, kind: 'topic' })
    pointer(mind.findEle(ID.b), 'pointerdown')
    pointer(mind.findEle(ID.b), 'pointerup')
    pointer(mind.findEle(ID.c), 'pointerdown')
    expect(props(ID.b)).toMatchObject(LINE_A)
    expect(props(ID.c)).toMatchObject(LINE_A)
    expect(controller.formatPainter.active).toBe(true)
    press(mind.container, 'Escape')
    expect(controller.formatPainter.active).toBe(false)
    // the button a third time lets go as well
    mind.selectNode(mind.findEle(ID.a))
    controller.toggleFormatPainter()
    controller.toggleFormatPainter()
    expect(controller.toggleFormatPainter().active).toBe(false)
  })

  it('another kind of item is turned down with a reason and nothing changes', async () => {
    const { controller, mind, notices, doc } = await mount()
    mind.selectNode(mind.findEle(ID.a))
    controller.startFormatPainter()
    const before = JSON.stringify(doc.sheets[0])
    expect(controller.applyFormatTo({ kind: 'relationship', id: ID.rel })).toEqual({
      ok: false,
      reason: 'wrong-kind',
    })
    expect(notices).toEqual([
      { code: 'painter-wrong-kind', held: 'topic', pressed: 'relationship' },
    ])
    expect(JSON.stringify(doc.sheets[0])).toBe(before)
    expect(controller.formatPainter.active).toBe(true)
  })

  it('a topic gives what it is drawn with, inherited and theme values included, rounded as the theme tables are', async () => {
    const { controller, mind, props } = await mount()
    // B1 has no values of its own: its line is the theme's (1.5 wide) in the colour of B's branch
    const source = controller.topicLine(ID.b1)!.drawn
    expect(source).toMatchObject({ width: 1.5, colorFrom: 'rainbow', shapeFrom: 'theme' })
    mind.selectNode(mind.findEle(ID.b1))
    controller.startFormatPainter()
    controller.applyFormatTo({ kind: 'topic', id: ID.a1 })
    expect(props(ID.a1)).toMatchObject({
      'line-color': source.color.slice(0, 7),
      'line-width': '1pt',
      'line-pattern': 'solid',
      'line-class': CURVE,
    })
    const target = controller.topicLine(ID.a1)!.drawn
    expect(target).toMatchObject({
      color: source.color.slice(0, 7),
      pattern: source.pattern,
      shape: source.shape,
    })
    // the fill the theme gives B1 (third level, second main branch), written as A1's own
    const theme = themeColorsAt(themeLook(DEFAULT_THEME_ID), 3, 1)
    expect(props(ID.a1)['svg:fill']).toBe(theme.fill === null ? 'none' : theme.fill.slice(0, 7))
    // the text: the weight and size the theme gives B1's level, written as A1's own
    expect(props(ID.a1)['fo:font-weight']).toMatch(/^[1-9]00$/)
    expect(props(ID.a1)['fo:font-size']).toMatch(/^\d+(\.5)?pt$/)
  })

  it('a value the editor cannot draw on the source leaves the target’s value as it was', async () => {
    const sheet = linesSheet()
    const b = sheet.rootTopic.children!.attached![1]!
    b.style = {
      id: 'odd',
      properties: { 'line-color': 'red', 'line-class': 'org.xmind.branchConnection.fold' },
    }
    const { controller, mind, props } = await mount(sheet)
    mind.selectNode(mind.findEle(ID.b))
    controller.startFormatPainter()
    controller.applyFormatTo({ kind: 'topic', id: ID.a1 })
    expect(props(ID.a1)['line-color']).toBe('#112233')
    expect(props(ID.a1)['line-class']).toBe(CURVE)
    // what it can draw goes on
    expect(props(ID.a1)['line-pattern']).toBe('solid')
  })

  it('a relationship gives its own values and takes off those it lacks', async () => {
    const { controller, mind, relationship } = await mount()
    controller.setRelationshipStyle({ width: 4, begin: 'square' }, [ID.rel])
    layOut()
    mind.linkDiv()
    const group = [...mind.arrowSvg.children].find(
      (child) => (child as SVGGElement).dataset.linkid === ID.styledRel,
    ) as Parameters<typeof mind.selectArrow>[0]
    mind.selectArrow(group)
    expect(controller.startFormatPainter()).toEqual({ ok: true })
    expect(controller.formatPainter.kind).toBe('relationship')
    expect(controller.applyFormatTo({ kind: 'relationship', id: ID.rel })).toEqual({ ok: true })
    expect((relationship(ID.rel).style as { properties: unknown }).properties).toEqual({
      'shape-class': 'org.xmind.relationshipShape.angled',
      'arrow-end-class': 'org.xmind.arrowShape.dot',
      'line-color': '#cc3300',
    })
    // its curve is its own
    expect(relationship(ID.rel).controlPoints).toBeUndefined()
  })

  it('a boundary and a summary give their values to their own kind', async () => {
    const { controller, find } = await mount()
    controller.addBoundary([ID.c1])
    const made = controller.selectedBoundaryId!
    controller.setBoundaryStyle({ shape: 'waves', fill: '#abcdef' })
    controller.startFormatPainter()
    expect(controller.applyFormatTo({ kind: 'boundary', id: ID.boundary })).toEqual({ ok: true })
    expect(
      ((find(ID.b)!.boundaries as Record<string, unknown>[])[0]!.style as { properties: unknown })
        .properties,
    ).toEqual({
      'shape-class': 'org.xmind.boundaryShape.waves',
      'svg:fill': '#abcdef',
    })
    expect(made).not.toBe(ID.boundary)
    // the title stays the target's
    expect((find(ID.b)!.boundaries as Record<string, unknown>[])[0]!.title).toBe('old')
  })
})

describe('the format painter undoes to the file', () => {
  it('put on a relationship, one undo gives back the bytes of the file', async () => {
    layOut()
    const { controller, mind, relationship, unchanged } = await mount()
    const group = [...mind.arrowSvg.children].find(
      (child) => (child as SVGGElement).dataset.linkid === ID.styledRel,
    ) as Parameters<typeof mind.selectArrow>[0]
    mind.selectArrow(group)
    controller.startFormatPainter()
    expect(controller.applyFormatTo({ kind: 'relationship', id: ID.rel })).toEqual({ ok: true })
    expect((relationship(ID.rel).style as { properties: unknown }).properties).toEqual({
      'shape-class': 'org.xmind.relationshipShape.angled',
      'arrow-end-class': 'org.xmind.arrowShape.dot',
      'line-color': '#cc3300',
    })
    controller.undo()
    expect(controller.canUndo).toBe(false)
    expect(await unchanged()).toBe(true)
  })

  it('put on a boundary, one undo gives back the bytes of the file', async () => {
    const sheet = linesSheet()
    const c = sheet.rootTopic.children!.attached![2]!
    c.boundaries = [
      {
        id: OTHER,
        range: '(0,0)',
        style: {
          id: 'their-boundary',
          properties: { 'shape-class': 'org.xmind.boundaryShape.waves', 'line-color': '#336699' },
        },
      },
    ]
    const { controller, find, unchanged } = await mount(sheet)
    controller.selectBoundary(OTHER)
    controller.startFormatPainter()
    expect(controller.applyFormatTo({ kind: 'boundary', id: ID.boundary })).toEqual({ ok: true })
    const record = (find(ID.b)!.boundaries as Record<string, unknown>[])[0]!
    expect((record.style as { properties: unknown }).properties).toEqual({
      'shape-class': 'org.xmind.boundaryShape.waves',
      'line-color': '#336699',
    })
    expect(record.title).toBe('old')
    controller.undo()
    expect(controller.canUndo).toBe(false)
    expect(await unchanged()).toBe(true)
  })
})

describe('edits of the data with the lists of the sheet', () => {
  it('a relationship added and one removed in one edit are one step; ids are the file’s', async () => {
    const { controller, doc, unchanged } = await mount()
    controller.edit(
      (_root, parts) => {
        parts.arrows = parts.arrows.filter((arrow) => arrow.id !== ID.rel)
        parts.arrows.push({ id: 'made-up', label: 'new', from: ID.b1, to: ID.c1 })
      },
      { removedRelationships: [ID.rel] },
    )
    const lines = doc.sheets[0]!.relationships as Record<string, unknown>[]
    expect(lines.map((line) => line.id)).not.toContain(ID.rel)
    const added = lines.find((line) => line.title === 'new')!
    expect(added.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/)
    expect(added).toMatchObject({ end1Id: ID.b1, end2Id: ID.c1 })
    controller.undo()
    expect(await unchanged()).toBe(true)
  })

  it('a boundary taken out of the list without being named stays in the file', async () => {
    const { controller, find } = await mount()
    const before = copyOf(find(ID.b)!.boundaries)
    controller.edit((_root, parts) => {
      parts.boundaries = []
    })
    expect(find(ID.b)!.boundaries).toEqual(before)
  })
})

/** What the library put on the clipboard at a copy or cut. */
function clipboardEvent(type: 'cut' | 'copy' | 'paste', text = '') {
  let held = text
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: () => held,
      setData: (_format: string, value: string) => {
        held = value
      },
    },
  })
  return { event, text: () => held }
}

async function cutTopic(mind: MapController['mind'], id: string): Promise<string> {
  mind.selectNode(mind.findEle(id))
  const clipboard = clipboardEvent('cut')
  mind.container.dispatchEvent(clipboard.event)
  await settle()
  return clipboard.text()
}

async function pasteInto(mind: MapController['mind'], targetId: string, text: string) {
  mind.selectNode(mind.findEle(targetId))
  mind.container.dispatchEvent(clipboardEvent('paste', text).event)
  await settle()
}
