/**
 * The text format of topics: the format panel's and the shortcuts' changes to
 * whole topics, a format on part of a title while it is typed, and what of it
 * reaches the file. The real drawing library runs in jsdom.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ViewTitleRun, XmindSheet, XmindTopic } from '@genoffice/xmind-engine'
import { DocumentSession } from '../src/renderer/document/session'
import { MapController, type MapStrings } from '../src/renderer/map/controller'
import {
  formatParts,
  formatShortcut,
  formatTopic,
  normaliseRuns,
  partsShow,
  shownFormat,
  trimRuns,
} from '../src/renderer/map/text-format'
import { selectIn } from '../src/renderer/map/title-runs'
import { documentOf, topic } from './helpers/fixtures'

const ID = {
  sheet: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0',
  root: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  main: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  sub: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  other: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
  rich: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
} as const

function sheet(): XmindSheet {
  return {
    id: ID.sheet,
    class: 'sheet',
    title: 'Formats',
    rootTopic: topic(ID.root, 'Centre', {}, [
      topic(ID.main, 'Main', {}, [
        topic(ID.sub, 'Hello world'),
        topic(ID.other, 'Other', {
          style: { id: 'style-o', properties: { 'svg:fill': '#ddeeff' } },
        }),
        topic(ID.rich, 'Red and plain', {
          attributedTitle: [
            { text: 'Red', 'fo:color': '#ff0000', future: 'kept' },
            { text: ' and plain' },
          ],
        }),
      ]),
    ]),
  }
}

const STRINGS: MapStrings = {
  newTopic: 'New',
  summary: 'Summary',
  menu: {
    addChild: 'Child',
    addParent: 'Parent',
    addSibling: 'Sibling',
    removeNode: 'Delete',
    focus: 'Focus',
    cancelFocus: 'End focus',
    moveUp: 'Up',
    moveDown: 'Down',
    link: 'Line',
    linkBidirectional: 'Line both ways',
    clickTips: 'Pick a topic',
    summary: 'Summary',
  },
  menuRelationship: 'Line',
  menuLabel: 'Label',
  menuNote: 'Note',
  menuLink: 'Link',
  menuInsertPicture: 'Picture',
  menuRemovePicture: 'Remove picture',
  decoration: {
    priority: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `Priority ${n}`),
    progress: [0, 13, 25, 38, 50, 63, 75, 88, 100].map((percent) => `Progress ${percent}%`),
    flag: 'Flag',
    star: 'Star',
    otherMarker: 'Marker',
    pictureNotShown: 'Picture not shown',
  },
}

const mounted: MapController[] = []
afterEach(() => {
  mounted.splice(0).forEach((controller) => controller.destroy())
  document.body.innerHTML = ''
})

async function mount() {
  const doc = await documentOf(sheet())
  const original = await doc.save()
  const session = new DocumentSession(doc)
  const el = document.createElement('div')
  document.body.appendChild(el)
  const host = {
    confirmDelete: vi.fn(async () => true),
    openLink: vi.fn(),
    onRequest: vi.fn(),
    onStateChange: vi.fn(),
  }
  const key = session.tabs()[0]!.key
  const controller = new MapController({ el, session, sheetKey: key, strings: STRINGS, host })
  mounted.push(controller)
  const find = (id: string): XmindTopic => {
    const walk = (at: XmindTopic): XmindTopic | null =>
      at.id === id ? at : ((at.children?.attached ?? []).map(walk).find(Boolean) ?? null)
    const hit = walk(doc.sheets[0]!.rootTopic)
    if (!hit) throw new Error(`no topic ${id}`)
    return hit
  }
  return { doc, original, session, el, controller, mind: controller.mind, find }
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setTimeout(resolve, 0))
}

function press(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

function topicEl(el: HTMLElement, id: string): HTMLElement {
  const found = el.querySelector<HTMLElement>(`[data-nodeid="me${id}"]`)
  if (!found) throw new Error(`topic ${id} is not drawn`)
  return found
}

async function editTitle(
  mind: MapController['mind'],
  el: HTMLElement,
  id: string,
): Promise<HTMLElement> {
  mind.selectNode(mind.findEle(id))
  press(mind.container, { key: 'F2' })
  await settle()
  const box = el.querySelector<HTMLElement>('#input-box')
  if (!box) throw new Error('the edit box did not open')
  return box
}

describe('a format on whole topics', () => {
  it('bold on a topic writes the weight, and taking it off again saves the file as it was', async () => {
    const { controller, mind, find, session, original } = await mount()
    mind.selectNode(mind.findEle(ID.sub))
    expect(controller.textFormat()).toMatchObject({ bold: false, italic: false })
    expect(controller.toggleTextFormat('bold')).toBe(true)
    await settle()
    expect(find(ID.sub).style).toEqual({
      id: expect.any(String),
      properties: { 'fo:font-weight': '700' },
    })
    expect(controller.textFormat()).toMatchObject({ bold: true })
    controller.toggleTextFormat('bold')
    await settle()
    expect(find(ID.sub).style).toBeUndefined()
    expect(await session.produceBytes()).toEqual(original)
  })

  it('a topic its theme draws bold is made regular with a weight of its own', async () => {
    const { controller, mind, find } = await mount()
    mind.selectNode(mind.findEle(ID.root))
    expect(controller.textFormat()).toMatchObject({ bold: true })
    controller.toggleTextFormat('bold')
    await settle()
    expect(find(ID.root).style).toMatchObject({ properties: { 'fo:font-weight': '400' } })
  })

  it('sets every value of the panel, keeps the fill and the style id, and is one step to undo', async () => {
    const { controller, mind, find, session, original, el } = await mount()
    mind.selectNode(mind.findEle(ID.other))
    controller.formatText({
      italic: true,
      underline: true,
      strike: true,
      color: '#112233',
      fontSize: 20,
      fontFamily: 'Noto Sans KR',
      align: 'left',
      textCase: 'uppercase',
    })
    await settle()
    expect(find(ID.other).style).toEqual({
      id: 'style-o',
      properties: {
        'svg:fill': '#ddeeff',
        'fo:font-style': 'italic',
        'fo:text-decoration': 'underline line-through',
        'fo:color': '#112233',
        'fo:font-size': '20pt',
        'fo:font-family': 'Noto Sans KR',
        'fo:text-align': 'left',
        'fo:text-transform': 'uppercase',
      },
    })
    const drawn = topicEl(el, ID.other).style
    expect(drawn.fontStyle).toBe('italic')
    expect(drawn.textDecoration).toContain('line-through')
    expect(drawn.fontFamily).toContain('Noto Sans KR')
    expect(drawn.textAlign).toBe('left')
    expect(drawn.textTransform).toBe('uppercase')
    expect(controller.textFormat()).toMatchObject({
      italic: true,
      underline: true,
      strike: true,
      color: '#112233',
      fontSize: 20,
      fontFamily: 'Noto Sans KR',
      align: 'left',
      textCase: 'uppercase',
    })
    expect(controller.undo()).toBe(true)
    await settle()
    expect(find(ID.other).style).toEqual({ id: 'style-o', properties: { 'svg:fill': '#ddeeff' } })
    expect(await session.produceBytes()).toEqual(original)
  })

  it('a change for every selected topic, with the shortcuts, whatever the input language', async () => {
    const { mind, find } = await mount()
    mind.selectNodes([mind.findEle(ID.sub), mind.findEle(ID.other)])
    // a Korean layout types ㅠ on the B key
    const bold = press(mind.container, { key: 'ㅠ', code: 'KeyB', ctrlKey: true })
    expect(bold.defaultPrevented).toBe(true)
    press(mind.container, { key: 'X', code: 'KeyX', ctrlKey: true, shiftKey: true })
    press(mind.container, { key: 'i', code: 'KeyI', metaKey: true })
    await settle()
    for (const id of [ID.sub, ID.other]) {
      expect(find(id).style).toMatchObject({
        properties: {
          'fo:font-weight': '700',
          'fo:text-decoration': 'line-through',
          'fo:font-style': 'italic',
        },
      })
    }
  })

  it('a whole-topic change takes the same key off the parts of the title', async () => {
    const { controller, mind, find } = await mount()
    mind.selectNode(mind.findEle(ID.rich))
    controller.formatText({ color: '#0000ff' })
    await settle()
    expect(find(ID.rich).attributedTitle).toBeUndefined()
    expect(find(ID.rich).style).toMatchObject({ properties: { 'fo:color': '#0000ff' } })
  })

  it('a topic whose format nobody changed keeps the one in the file', async () => {
    const { controller, mind, find } = await mount()
    mind.selectNode(mind.findEle(ID.rich))
    controller.toggleTextFormat('italic')
    await settle()
    // the part the user did not touch keeps every key it had
    expect(find(ID.rich).attributedTitle).toEqual([
      { text: 'Red', 'fo:color': '#ff0000', future: 'kept' },
      { text: ' and plain' },
    ])
  })
})

describe('a format on part of a title', () => {
  it('the title of the file is drawn in parts, as text', async () => {
    const { el } = await mount()
    const parts = [...topicEl(el, ID.rich).querySelectorAll<HTMLElement>('.text .mm-run')]
    expect(parts.map((part) => part.textContent)).toEqual(['Red', ' and plain'])
    expect(parts[0]!.style.color).toBe('rgb(255, 0, 0)')
  })

  it('Ctrl+B in the edit box makes the selected characters bold, and leaving the box writes the parts', async () => {
    const { mind, el, find, session, original, controller } = await mount()
    const box = await editTitle(mind, el, ID.sub)
    selectIn(box, 0, 5)
    expect(press(box, { key: 'b', code: 'KeyB', ctrlKey: true }).defaultPrevented).toBe(true)
    expect([...box.querySelectorAll('.mm-run')].map((part) => part.textContent)).toEqual([
      'Hello',
      ' world',
    ])
    box.dispatchEvent(new FocusEvent('blur'))
    await settle()
    expect(find(ID.sub)).toMatchObject({
      title: 'Hello world',
      attributedTitle: [{ text: 'Hello', 'fo:font-weight': '700' }, { text: ' world' }],
    })
    expect(find(ID.sub).style).toBeUndefined()
    const parts = [...topicEl(el, ID.sub).querySelectorAll<HTMLElement>('.text .mm-run')]
    expect(parts.map((part) => [part.textContent, part.style.fontWeight])).toEqual([
      ['Hello', '700'],
      [' world', ''],
    ])
    // one step
    expect(controller.undo()).toBe(true)
    await settle()
    expect(find(ID.sub).attributedTitle).toBeUndefined()
    expect(await session.produceBytes()).toEqual(original)
  })

  it('typing in a formatted title keeps the parts, and the file gets both the title and the parts', async () => {
    const { mind, el, find } = await mount()
    const box = await editTitle(mind, el, ID.rich)
    const parts = box.querySelectorAll<HTMLElement>('.mm-run')
    expect([...parts].map((part) => part.textContent)).toEqual(['Red', ' and plain'])
    parts[0]!.firstChild!.nodeValue = 'Dark red'
    box.dispatchEvent(new FocusEvent('blur'))
    await settle()
    expect(find(ID.rich)).toMatchObject({
      title: 'Dark red and plain',
      attributedTitle: [{ text: 'Dark red', 'fo:color': '#ff0000' }, { text: ' and plain' }],
    })
  })

  it('Escape leaves the title and its parts as they were', async () => {
    const { mind, el, find, session, original } = await mount()
    const box = await editTitle(mind, el, ID.sub)
    selectIn(box, 0, 5)
    press(box, { key: 'b', code: 'KeyB', ctrlKey: true })
    press(box, { key: 'Escape' })
    await settle()
    expect(find(ID.sub).attributedTitle).toBeUndefined()
    expect(await session.produceBytes()).toEqual(original)
  })

  it('a panel change a part cannot carry ends the typing and goes to the whole topic', async () => {
    const { mind, el, find, controller } = await mount()
    await editTitle(mind, el, ID.sub)
    controller.formatText({ align: 'right' })
    await settle()
    expect(el.querySelector('#input-box')).toBeNull()
    expect(find(ID.sub).style).toMatchObject({ properties: { 'fo:text-align': 'right' } })
  })

  it('a new title from elsewhere (the AI, a dialog) takes the parts out of the file', async () => {
    const { controller, find } = await mount()
    controller.setTitle(ID.rich, 'Another title')
    await settle()
    expect(find(ID.rich).title).toBe('Another title')
    expect(find(ID.rich).attributedTitle).toBeUndefined()
  })
})

describe('the format rules', () => {
  const base = { fontWeight: 400, fontSize: 16 }
  const runs = (...parts: [string, ViewTitleRun['style']][]): ViewTitleRun[] =>
    parts.map(([text, style]) => ({ text, style }))

  it('a value equal to what the topic shows anyway is no value', () => {
    expect(
      formatTopic(
        {},
        null,
        { bold: false, italic: false, align: 'center', textCase: 'none' },
        base,
      ),
    ).toEqual({
      style: {},
      titleRuns: null,
    })
    expect(formatTopic({}, null, { bold: false }, { ...base, fontWeight: 700 }).style).toEqual({
      fontWeight: '400',
    })
  })

  it('takes out of range sizes and font names that are more than a name', () => {
    expect(formatTopic({}, null, { fontSize: 500 }, base).style).toEqual({ fontSize: '96pt' })
    expect(formatTopic({}, null, { fontSize: 10.3 }, base).style).toEqual({ fontSize: '10.5pt' })
    expect(formatTopic({ fontFamily: 'A' }, null, { fontFamily: 'B", serif' }, base).style).toEqual(
      {},
    )
  })

  it('formats a range of parts, and a part inside a bold topic is bold without a value', () => {
    const before = runs(['Hello world', {}])
    const bold = formatParts(before, 6, 11, { bold: true }, {}, base)
    expect(bold).toEqual(runs(['Hello ', {}], ['world', { fontWeight: '700' }]))
    expect(partsShow(bold, 6, 11, 'bold', {}, base)).toBe(true)
    expect(partsShow(bold, 0, 11, 'bold', {}, base)).toBe(false)
    // the whole topic is bold: a bold part needs no value of its own
    expect(
      normaliseRuns(formatParts(before, 0, 5, { bold: true }, { fontWeight: '700' }, base)),
    ).toBeNull()
    // an empty range is the whole title
    expect(formatParts(before, 3, 3, { strike: true }, {}, base)).toEqual(
      runs(['Hello world', { textDecoration: 'line-through' }]),
    )
    const both = formatParts(
      runs(['ab', { textDecoration: 'underline' }]),
      0,
      2,
      { strike: true },
      {},
      base,
    )
    expect(both).toEqual(runs(['ab', { textDecoration: 'underline line-through' }]))
  })

  it('joins neighbours of one format and cuts white space the way the edit box does', () => {
    expect(
      normaliseRuns(
        runs(['a', { color: '#ff0000' }], ['b', { color: '#ff0000' }], ['', {}], ['c', {}]),
      ),
    ).toEqual(runs(['ab', { color: '#ff0000' }], ['c', {}]))
    expect(trimRuns(runs(['  Hi', { fontWeight: '700' }], [' there ', {}]), 'Hi there')).toEqual(
      runs(['Hi', { fontWeight: '700' }], [' there', {}]),
    )
    expect(trimRuns(runs(['Hi', {}]), 'Other')).toBeNull()
  })

  it('reads what the topic shows', () => {
    expect(
      shownFormat({ textDecoration: 'line-through', fontSize: '12pt' }, null, base),
    ).toMatchObject({
      bold: false,
      strike: true,
      underline: false,
      fontSize: 12,
      align: 'center',
      partly: false,
    })
    expect(shownFormat({}, runs(['a', { color: '#ff0000' }]), base).partly).toBe(true)
  })

  it('knows the format keys and nothing else', () => {
    const key = (init: KeyboardEventInit) => formatShortcut(new KeyboardEvent('keydown', init))
    expect(key({ key: 'b', code: 'KeyB', ctrlKey: true })).toBe('bold')
    expect(key({ key: 'u', code: 'KeyU', metaKey: true })).toBe('underline')
    expect(key({ key: 'x', code: 'KeyX', ctrlKey: true })).toBeNull()
    expect(key({ key: 'b', code: 'KeyB' })).toBeNull()
    expect(key({ key: 'b', code: 'KeyB', ctrlKey: true, altKey: true })).toBeNull()
    expect(key({ key: 'B', code: 'KeyB', ctrlKey: true, shiftKey: true })).toBeNull()
  })
})
