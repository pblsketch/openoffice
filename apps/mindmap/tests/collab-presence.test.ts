/**
 * Where the others are on a shared map (collab/presence.ts), drawn on the real
 * map in jsdom: a frame in each person's colour around what they selected,
 * with their name, in a layer the export and the preview picture never copy.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CollabSession, CollabUser } from '@genoffice/collab'
import { MapController } from '../src/renderer/map/controller'
import { DocumentSession } from '../src/renderer/document/session'
import { mapStrings } from '../src/renderer/i18n/map-strings'
import { MapPresence, PRESENCE_FIELD } from '../src/renderer/collab/presence'
import { documentOf, IDS, plainSheet, richSheet } from './helpers/fixtures'

const JUN: CollabUser = {
  name: 'Guest Jun',
  palette: 3,
  color: 'var(--collab-3)',
  colorLight: 'transparent',
  host: false,
}

const cleanup: Array<() => void> = []
afterEach(() => {
  cleanup.splice(0).forEach((step) => step())
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

const box = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  }) as DOMRect

async function mountShared(others: Array<{ value: unknown; user?: CollabUser }>) {
  const session = new DocumentSession(await documentOf(richSheet(), plainSheet('Second')))
  const el = document.createElement('div')
  document.body.appendChild(el)
  const key = session.tabs()[0]!.key
  const controller = new MapController({
    el,
    session,
    sheetKey: key,
    strings: mapStrings('en'),
    host: {
      confirmDelete: async () => true,
      openLink: () => {},
      onRequest: () => {},
      onStateChange: () => {},
    },
  })
  cleanup.push(() => controller.destroy())
  const { mind } = controller
  mind.scaleVal = 2
  // jsdom lays nothing out: the canvas sits at (100, 50), every topic at (300, 150)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this === mind.map) return box(100, 50, 800, 600)
    if (this.tagName === 'ME-TPC') return box(300, 150, 80, 30)
    return box(0, 0, 0, 0)
  })
  const collab = {
    setPresence: vi.fn(),
    presences: () =>
      others.map((other, at) => ({
        clientId: at + 2,
        user: other.user ?? JUN,
        value: other.value,
      })),
    onPeersChanged: () => () => {},
  }
  const presence = new MapPresence(collab as unknown as CollabSession, session, {
    controllers: () => new Map([[key, controller]]),
    activeKey: () => key,
  })
  cleanup.push(() => presence.dispose())
  return { session, controller, mind, collab, presence }
}

describe('other people on a shared map', () => {
  it('a frame in their colour around each topic they selected, with their name once', async () => {
    const { mind } = await mountShared([
      { value: { sheet: IDS.sheet, index: 0, topics: [IDS.a1, IDS.c] } },
    ])
    const layer = mind.map.querySelector(':scope > .mm-collab-layer')!
    expect(layer).not.toBeNull()
    const frames = [...layer.querySelectorAll<HTMLElement>('.mm-collab-frame')]
    expect(frames).toHaveLength(2)
    expect(frames[0]!.style.getPropertyValue('--collab-c')).toBe('var(--collab-3)')
    // in the canvas's own units: (300 - 100) / 2
    expect(frames[0]!.style.left).toBe('100px')
    expect(frames[0]!.style.width).toBe('40px')
    expect(layer.querySelectorAll('.mm-collab-name')).toHaveLength(1)
    expect(layer.querySelector('.mm-collab-name')!.textContent).toBe('Guest Jun')
  })

  it('the frames are never part of the drawing that export, print and the preview copy', async () => {
    const { mind } = await mountShared([
      { value: { sheet: IDS.sheet, index: 0, topics: [IDS.a1] } },
    ])
    expect(mind.map.querySelector('.mm-collab-frame')).not.toBeNull()
    expect(mind.nodes.querySelector('.mm-collab-layer, .mm-collab-frame')).toBeNull()
    const copy = mind.nodes.cloneNode(true) as HTMLElement
    expect(copy.querySelector('.mm-collab-frame')).toBeNull()
  })

  it('follows the map when it is drawn again, and shows nothing of someone on another sheet', async () => {
    const { mind, controller } = await mountShared([
      { value: { sheet: IDS.sheet, index: 0, topics: [IDS.a1] } },
      { value: { sheet: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', index: 1, topics: [IDS.c] } },
      { value: { sheet: 7, topics: 'everything' } },
    ])
    controller.redraw()
    expect(mind.map.querySelectorAll('.mm-collab-frame')).toHaveLength(1)
  })

  it('a name is text, whatever it holds', async () => {
    const { mind } = await mountShared([
      {
        value: { sheet: IDS.sheet, index: 0, topics: [IDS.a1] },
        user: { ...JUN, name: '<img src=x onerror=alert(1)>' },
      },
    ])
    const name = mind.map.querySelector('.mm-collab-name')!
    expect(name.textContent).toBe('<img src=x onerror=alert(1)>')
    expect(name.children).toHaveLength(0)
  })

  it('tells the others the sheet on screen and what is selected there', async () => {
    const { mind, collab, presence } = await mountShared([])
    expect(collab.setPresence).toHaveBeenLastCalledWith(PRESENCE_FIELD, {
      sheet: IDS.sheet,
      index: 0,
      topics: [],
    })
    mind.selectNode(mind.findEle(IDS.c))
    presence.publish()
    expect(collab.setPresence).toHaveBeenLastCalledWith(PRESENCE_FIELD, {
      sheet: IDS.sheet,
      index: 0,
      topics: [IDS.c],
    })
    // nothing new: nothing sent
    const calls = collab.setPresence.mock.calls.length
    presence.publish()
    expect(collab.setPresence.mock.calls.length).toBe(calls)
  })

  it('goes away with the session', async () => {
    const { mind, presence } = await mountShared([
      { value: { sheet: IDS.sheet, index: 0, topics: [IDS.a1] } },
    ])
    presence.dispose()
    expect(mind.map.querySelector('.mm-collab-layer')).toBeNull()
  })
})

describe("the drawing after someone else's change", () => {
  it('forgetting the history leaves nothing to undo and keeps the selection', async () => {
    const { mind, controller } = await mountShared([])
    controller.setTitle(IDS.c, 'mine')
    expect(controller.canUndo).toBe(true)
    mind.selectNode(mind.findEle(IDS.a1))
    controller.forgetHistory()
    expect(controller.canUndo).toBe(false)
    expect(controller.selectedTopicIds()).toEqual([IDS.a1])
    expect(controller.undo()).toBe(false)
  })

  it('drawing again takes up a theme someone else picked for the sheet', async () => {
    const { session, controller } = await mountShared([])
    const key = session.tabs()[0]!.key
    session.applyTheme(key, 'line/signal/dark')
    expect(controller.themeId).not.toBe('line/signal/dark')
    controller.redraw()
    expect(controller.themeId).toBe('line/signal/dark')
  })
})
