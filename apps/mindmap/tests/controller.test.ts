/**
 * The map on screen, with the real drawing library in jsdom: what the user
 * does reaches the source tree, what the file holds is never read as markup,
 * and undo brings back the source tree whole.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  openXmind,
  sheetToView,
  type ViewTopic,
  type XmindSheet,
  type XmindTopic,
} from '@genoffice/xmind-engine'
import { MapController, type MapHost, type MapStrings } from '../src/renderer/map/controller'
import { DocumentSession } from '../src/renderer/document/session'
import { copyOf, documentOf, FISHBONE, IDS, plainSheet, richSheet, topic } from './helpers/fixtures'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const STRINGS: MapStrings = {
  newTopic: '새 토픽',
  summary: '요약',
  menu: {
    addChild: '하위 토픽',
    addParent: '상위 토픽',
    addSibling: '형제 토픽',
    removeNode: '지우기',
    focus: '집중',
    cancelFocus: '집중 끝내기',
    moveUp: '위로',
    moveDown: '아래로',
    link: '연결선',
    linkBidirectional: '양방향 연결선',
    clickTips: '연결할 토픽을 누르세요',
    summary: '요약',
  },
  menuRelationship: '연결선',
  menuLabel: '라벨',
  menuNote: '메모',
  menuLink: '링크',
  menuRemovePicture: '그림 지우기',
  decoration: {
    priority: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `우선순위 ${n}`),
    progress: [0, 13, 25, 38, 50, 63, 75, 88, 100].map((percent) => `진행 ${percent}%`),
    flag: '깃발',
    star: '별',
    otherMarker: '표식',
    pictureNotShown: '불러오지 않은 그림',
  },
}

const mounted: MapController[] = []
afterEach(() => {
  mounted.splice(0).forEach((controller) => controller.destroy())
  document.body.innerHTML = ''
})

async function mount(sheets: XmindSheet[] = [richSheet()], hostOverrides: Partial<MapHost> = {}) {
  const doc = await documentOf(...sheets)
  const original = await doc.save()
  const session = new DocumentSession(doc)
  const el = document.createElement('div')
  document.body.appendChild(el)
  const host = {
    confirmDelete: vi.fn(async (_count: number) => true),
    openLink: vi.fn(),
    onRequest: vi.fn(),
    onStateChange: vi.fn(),
    ...hostOverrides,
  }
  const key = session.tabs()[0]!.key
  const controller = new MapController({ el, session, sheetKey: key, strings: STRINGS, host })
  mounted.push(controller)
  const root = () => doc.sheets[0]!.rootTopic
  const attached = (parent: XmindTopic = root()) => parent.children?.attached ?? []
  return {
    doc,
    original,
    session,
    el,
    host,
    key,
    controller,
    mind: controller.mind,
    root,
    attached,
  }
}

/** Lets the library's own promises (its before-hooks make every edit asynchronous) and ours run out. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setTimeout(resolve, 0))
}

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  )
}

function topicEl(el: HTMLElement, id: string): HTMLElement {
  const found = el.querySelector<HTMLElement>(`[data-nodeid="me${id}"]`)
  if (!found) throw new Error(`topic ${id} is not drawn`)
  return found
}

function finishEditing(el: HTMLElement, text: string): void {
  const box = el.querySelector<HTMLElement>('#input-box')
  if (!box) throw new Error('no topic is being edited')
  box.textContent = text
  box.dispatchEvent(new FocusEvent('blur'))
}

describe('opening', () => {
  it('drawing a map changes nothing in the file', async () => {
    const { controller, doc, session, original } = await mount([richSheet(), plainSheet()])
    controller.flush()
    expect(doc.changed).toBe(false)
    expect(await session.produceBytes()).toEqual(original)
  })

  it('draws the topics, the labels and the chips for a note and a link', async () => {
    const { el } = await mount()
    const alpha = topicEl(el, IDS.a)
    expect(alpha.querySelector('.text')!.textContent).toBe('Alpha')
    expect([...alpha.querySelectorAll('.tags span')].map((span) => span.textContent)).toEqual([
      'urgent',
      'draft',
      expect.any(String),
      'https://example.com/alpha',
    ])
    expect(alpha.querySelector('a')).toBeNull()
  })
})

describe('shortcuts', () => {
  it('Tab adds a child topic with an id the file can keep', async () => {
    const { controller, mind, root, attached } = await mount()
    mind.selectNode(mind.findEle(IDS.c))
    press(mind.container, 'Tab')
    await settle()
    const gamma = attached()[2]!
    expect(attached(gamma)).toHaveLength(1)
    const added = attached(gamma)[0]!
    expect(added.title).toBe('새 토픽')
    expect(added.id).toMatch(UUID)
    // the screen and the file name the topic alike: nothing had to be renamed or drawn again
    expect(mind.currentNode!.nodeObj.id).toBe(added.id)
    expect(root().structureClass).toBe(FISHBONE)
    expect(controller.canUndo).toBe(true)
  })

  it('Enter adds a sibling after the selected topic', async () => {
    const { mind, attached } = await mount()
    mind.selectNode(mind.findEle(IDS.a2))
    press(mind.container, 'Enter')
    await settle()
    const alpha = attached()[0]!
    expect(attached(alpha).map((child) => child.title)).toEqual([
      'Alpha one',
      'Alpha two',
      '새 토픽',
      'Alpha three',
    ])
  })

  it.each(['F2', ' '])('%j starts editing, and the typed title reaches the file', async (key) => {
    const { mind, el, attached } = await mount()
    mind.selectNode(mind.findEle(IDS.c))
    press(mind.container, key)
    await settle()
    finishEditing(el, '감마 계획')
    await settle()
    expect(attached()[2]!.title).toBe('감마 계획')
    expect(topicEl(el, IDS.c).querySelector('.text')!.textContent).toBe('감마 계획')
  })

  it('Enter while a composition is open does not end the edit or add a topic', async () => {
    const { mind, el, attached } = await mount()
    mind.selectNode(mind.findEle(IDS.c))
    press(mind.container, 'F2')
    await settle()
    const box = el.querySelector<HTMLElement>('#input-box')!
    box.textContent = '한'
    press(box, 'Enter', { isComposing: true })
    await settle()
    expect(el.querySelector('#input-box')).not.toBeNull()
    expect(attached()).toHaveLength(3)
    finishEditing(el, '한글')
    await settle()
    expect(attached()[2]!.title).toBe('한글')
    expect(attached()).toHaveLength(3)
  })

  it('while a title is typed, Ctrl+arrow belongs to the text: the caret moves by words', async () => {
    const { mind, el, root } = await mount()
    mind.selectNode(mind.findEle(IDS.c))
    press(mind.container, 'F2')
    await settle()
    const box = el.querySelector<HTMLElement>('#input-box')!
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp']) {
      const event = new KeyboardEvent('keydown', {
        key,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
      box.dispatchEvent(event)
      expect(event.defaultPrevented, key).toBe(false)
    }
    expect(root().structureClass).toBe(FISHBONE)
  })

  it('a title still being typed is committed on request, so a save does not miss it', async () => {
    const { controller, mind, el, attached } = await mount()
    mind.selectNode(mind.findEle(IDS.c))
    press(mind.container, 'F2')
    await settle()
    el.querySelector<HTMLElement>('#input-box')!.textContent = '아직 치는 중'
    expect(controller.editingText).toBe(true)
    expect(attached()[2]!.title).toBe('Gamma')

    expect(controller.commitEdit()).toBe(true)
    expect(controller.editingText).toBe(false)
    expect(attached()[2]!.title).toBe('아직 치는 중')
    expect(controller.commitEdit()).toBe(false)
    controller.undo()
    expect(attached()[2]!.title).toBe('Gamma')
  })

  it('knows when an input method is composing in the edit box', async () => {
    const { controller, mind, el } = await mount()
    mind.selectNode(mind.findEle(IDS.c))
    press(mind.container, 'F2')
    await settle()
    const box = el.querySelector<HTMLElement>('#input-box')!
    expect(controller.composing).toBe(false)
    box.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    expect(controller.composing).toBe(true)
    box.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '한' }))
    expect(controller.composing).toBe(false)
  })

  it('the arrow keys with Ctrl do not change the layout behind the user', async () => {
    const { mind, root, doc } = await mount()
    mind.selectNode(mind.findEle(IDS.c))
    press(mind.container, 'ArrowRight', { ctrlKey: true })
    press(mind.container, 'ArrowLeft', { ctrlKey: true })
    press(mind.container, 'ArrowUp', { ctrlKey: true })
    await settle()
    expect(root().structureClass).toBe(FISHBONE)
    expect(doc.changed).toBe(false)
  })
})

describe('deleting', () => {
  it('a topic with nothing hidden under it is deleted without a question', async () => {
    const { mind, host, attached } = await mount()
    mind.selectNode(mind.findEle(IDS.b))
    press(mind.container, 'Delete')
    await settle()
    expect(host.confirmDelete).not.toHaveBeenCalled()
    expect(attached().map((child) => child.id)).toEqual([IDS.a, IDS.c])
  })

  it('a topic with hidden elements asks first, with their number; declining keeps everything', async () => {
    const { mind, host, attached, doc } = await mount([richSheet()], {
      confirmDelete: vi.fn(async () => false),
    })
    mind.selectNode(mind.findEle(IDS.a))
    press(mind.container, 'Delete')
    await settle()
    expect(host.confirmDelete).toHaveBeenCalledExactlyOnceWith(3)
    expect(attached().map((child) => child.id)).toEqual([IDS.a, IDS.b, IDS.c])
    expect(doc.changed).toBe(false)
  })

  it('confirming deletes the topic together with what was hidden under it', async () => {
    const { mind, host, attached, doc } = await mount()
    mind.selectNode(mind.findEle(IDS.a))
    press(mind.container, 'Delete')
    await settle()
    expect(host.confirmDelete).toHaveBeenCalledExactlyOnceWith(3)
    expect(attached().map((child) => child.id)).toEqual([IDS.b, IDS.c])
    expect(JSON.stringify(doc.sheets[0])).not.toContain(IDS.callout)
  })

  it('a caller that may not ask (the AI) is refused, and told how many elements are in the way', async () => {
    const { controller, host, attached } = await mount()
    const refused = await controller.removeTopics([IDS.a], 'refuse')
    expect(refused).toEqual({ ok: false, reason: 'preserved', preserved: 3 })
    expect(host.confirmDelete).not.toHaveBeenCalled()
    expect(attached()).toHaveLength(3)
    expect(await controller.removeTopics([IDS.b], 'refuse')).toEqual({ ok: true })
    expect(attached().map((child) => child.id)).toEqual([IDS.a, IDS.c])
  })

  it('the central topic is never deleted', async () => {
    const { mind, doc } = await mount()
    mind.selectNode(mind.findEle(IDS.root))
    press(mind.container, 'Delete')
    await settle()
    expect(doc.changed).toBe(false)
    expect(doc.sheets[0]!.rootTopic.id).toBe(IDS.root)
  })

  it('a summary with a branch under it asks before it goes', async () => {
    const { controller, host, attached } = await mount()
    await controller.removeSummary(IDS.summaryTopic)
    await settle()
    expect(host.confirmDelete).toHaveBeenCalledExactlyOnceWith(1)
    expect(attached()[0]!).not.toHaveProperty('summaries')
  })
})

describe('undo and redo', () => {
  it('deleting a topic and undoing gives back the very source tree, and the save is the original bytes', async () => {
    const { controller, mind, el, doc, session, original } = await mount()
    const before = JSON.stringify(doc.sheets[0])
    mind.selectNode(mind.findEle(IDS.a))
    press(mind.container, 'Delete')
    await settle()
    expect(JSON.stringify(doc.sheets[0])).not.toContain('unknownTopicKey')

    controller.undo()
    expect(JSON.stringify(doc.sheets[0])).toBe(before)
    expect(doc.changed).toBe(false)
    expect(await session.produceBytes()).toEqual(original)
    // and the screen shows it again, drawn from the file
    expect(topicEl(el, IDS.a).querySelector('.text')!.textContent).toBe('Alpha')
    expect(el.querySelectorAll('.svg-label[data-type="summary"]')).toHaveLength(1)
  })

  it('Ctrl+Z and Ctrl+Y on the map reach the same history', async () => {
    const { mind, el, doc, attached } = await mount()
    mind.selectNode(mind.findEle(IDS.c))
    press(mind.container, 'F2')
    await settle()
    finishEditing(el, 'edited')
    await settle()
    expect(attached()[2]!.title).toBe('edited')

    press(mind.container, 'z', { ctrlKey: true })
    expect(attached()[2]!.title).toBe('Gamma')
    expect(doc.changed).toBe(false)

    press(mind.container, 'y', { ctrlKey: true })
    expect(attached()[2]!.title).toBe('edited')
    expect(topicEl(el, IDS.c).querySelector('.text')!.textContent).toBe('edited')
  })

  it('each sheet has its own history', async () => {
    const doc = await documentOf(richSheet(), plainSheet())
    const session = new DocumentSession(doc)
    const host = {
      confirmDelete: vi.fn(async () => true),
      openLink: vi.fn(),
      onRequest: vi.fn(),
      onStateChange: vi.fn(),
    }
    const [first, second] = session.tabs().map((tab) => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      const controller = new MapController({
        el,
        session,
        sheetKey: tab.key,
        strings: STRINGS,
        host,
      })
      mounted.push(controller)
      return controller
    })
    await first!.setTitle(IDS.c, 'edited on the first sheet')
    expect(first!.canUndo).toBe(true)
    expect(second!.canUndo).toBe(false)
    second!.undo()
    expect(doc.sheets[0]!.rootTopic.children!.attached![2]!.title).toBe('edited on the first sheet')
  })
})

describe('labels, notes and links', () => {
  it('are set through the library, one history step each, and reach the file', async () => {
    const { controller, el, attached, doc } = await mount()
    expect(controller.setLabels(IDS.c, ['alpha', 'beta'])).toBe(true)
    expect(controller.setNote(IDS.c, 'a plain note')).toBe(true)
    expect(controller.setLink(IDS.c, 'https://example.org/page')).toBe(true)
    const gamma = attached()[2]!
    expect(gamma.labels).toEqual(['alpha', 'beta'])
    expect(gamma.notes).toEqual({ plain: { content: 'a plain note' } })
    expect(gamma.href).toBe('https://example.org/page')
    expect([...topicEl(el, IDS.c).querySelectorAll('.tags span')]).toHaveLength(4)

    controller.undo()
    controller.undo()
    controller.undo()
    expect(doc.changed).toBe(false)
  })

  it('a typed address nothing will open is kept and shown as text, like one from a file', async () => {
    const { controller, el, attached } = await mount()
    expect(controller.setLink(IDS.c, 'javascript:alert(1)')).toBe(true)
    expect(attached()[2]!.href).toBe('javascript:alert(1)')
    const chip = topicEl(el, IDS.c).querySelector('.mm-chip-link')!
    expect(chip.tagName).toBe('SPAN')
    expect(chip.textContent).toBe('javascript:alert(1)')
    expect(el.querySelector('a')).toBeNull()
    expect(controller.topic(IDS.c)!.link).toBe('javascript:alert(1)')
  })

  it('an address in the form of a reference into the file is not taken', async () => {
    const { controller, attached, doc } = await mount()
    for (const internal of ['xmind:#some-topic', 'XMIND:#x', 'xap:attachments/a.pdf', '  xap:x']) {
      expect(controller.setLink(IDS.c, internal), internal).toBe(false)
    }
    expect(attached()[2]!).not.toHaveProperty('href')
    expect(doc.changed).toBe(false)
  })

  it('removing a web link leaves a link to another topic alone', async () => {
    const { controller, attached } = await mount()
    // Beta links to another topic: the editor shows no link there and must not delete it
    controller.setLabels(IDS.b, ['x'])
    expect(attached()[1]!.href).toBe(`xmind:#${IDS.a}`)
    controller.setLink(IDS.a, null)
    expect(attached()[0]!).not.toHaveProperty('href')
  })

  it('a click on the link chip asks the host to open it; the map opens nothing itself', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { el, host } = await mount()
    const chip = topicEl(el, IDS.a).querySelector<HTMLElement>('.mm-chip-link')!
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(host.openLink).toHaveBeenCalledExactlyOnceWith('https://example.com/alpha')
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('a click on the note chip asks the host for the note of that topic', async () => {
    const { el, host } = await mount()
    const chip = topicEl(el, IDS.a).querySelector<HTMLElement>('.mm-chip-note')!
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(host.onRequest).toHaveBeenCalledExactlyOnceWith('note', IDS.a)
  })
})

describe('summaries, relationships and the layout', () => {
  it("a new summary gets a title in the user's language and an id the file keeps", async () => {
    const { controller, mind, attached } = await mount()
    mind.selectNode(mind.findEle(IDS.a3))
    expect(controller.addSummary()).toBe(true)
    await settle()
    const alpha = attached()[0]!
    const records = alpha.summaries as { topicId: string; range: string }[]
    expect(records).toHaveLength(2)
    const added = records[1]!
    expect(added.range).toBe('(2,2)')
    expect(added.topicId).toMatch(UUID)
    expect(alpha.children!.summary!.find((summary) => summary.id === added.topicId)!.title).toBe(
      '요약',
    )
    expect(mind.summaries.map((summary) => summary.id)).toContain(added.topicId)
  })

  it('a new relationship has no made-up English text', async () => {
    const { controller, doc } = await mount()
    expect(controller.addRelationship(IDS.b, IDS.c)).toBe(true)
    await settle()
    const lines = doc.sheets[0]!.relationships as {
      id: string
      end1Id: string
      end2Id: string
      title?: string
    }[]
    const added = lines.find((line) => line.end1Id === IDS.b && line.end2Id === IDS.c)!
    expect(added.id).toMatch(UUID)
    expect(added.title ?? '').toBe('')
  })

  it("picking a layout writes it; only then does the file's own value go", async () => {
    const { controller, root } = await mount()
    expect(controller.layout).toBe('both')
    controller.setLayout('right')
    expect(root().structureClass).toBe('org.xmind.ui.logic.right')
    expect(controller.layout).toBe('right')
  })

  it('a tree and a timeline are written as the classes of the format and marked on the map', async () => {
    const { controller, mind, root } = await mount()
    controller.setLayout('tree')
    expect(root().structureClass).toBe('org.xmind.ui.tree.right')
    expect(controller.layout).toBe('tree')
    expect(mind.direction).toBe(1)
    expect(mind.container.dataset.mmStructure).toBe('tree')

    controller.setLayout('timeline')
    expect(root().structureClass).toBe('org.xmind.ui.timeline.horizontal')
    expect(controller.layout).toBe('timeline')
    expect(mind.direction).toBe(3)
    expect(mind.container.dataset.mmStructure).toBe('timeline')

    // the same direction as a tree, drawn as it is
    controller.setLayout('right')
    expect(root().structureClass).toBe('org.xmind.ui.logic.right')
    expect(controller.layout).toBe('right')
    expect(mind.container.dataset.mmStructure).toBeUndefined()
  })

  it('in a timeline the arrow keys move the way the map looks, ahead of the library', async () => {
    const { controller, mind } = await mount()
    const selected = () => controller.selectedTopicIds()
    controller.setLayout('timeline')
    mind.selectNode(mind.findEle(IDS.a1))
    // the topics below a main topic stand in a column
    press(mind.container, 'ArrowDown')
    expect(selected()).toEqual([IDS.a2])
    press(mind.container, 'ArrowUp')
    press(mind.container, 'ArrowUp')
    expect(selected()).toEqual([IDS.a])
    // the main topics stand in a row after the central topic
    press(mind.container, 'ArrowRight')
    expect(selected()).toEqual([IDS.b])
    press(mind.container, 'ArrowLeft')
    press(mind.container, 'ArrowLeft')
    expect(selected()).toEqual([IDS.root])
    press(mind.container, 'ArrowRight')
    expect(selected()).toEqual([IDS.a])
    press(mind.container, 'ArrowDown')
    expect(selected()).toEqual([IDS.a1])
    press(mind.container, 'ArrowLeft')
    expect(selected()).toEqual([IDS.a])
  })

  it('outside a timeline the arrow keys are the library’s', async () => {
    const { controller, mind } = await mount()
    controller.setLayout('down')
    mind.selectNode(mind.findEle(IDS.a1))
    // the library's rule for the downward layout: down goes below, right to the next one
    press(mind.container, 'ArrowRight')
    expect(controller.selectedTopicIds()).toEqual([IDS.a2])
    controller.setLayout('tree')
    mind.selectNode(mind.findEle(IDS.a1))
    press(mind.container, 'ArrowDown')
    expect(controller.selectedTopicIds()).toEqual([IDS.a2])
  })

  it('a tree stays a tree through an edit and an undo', async () => {
    const { controller, mind, root } = await mount()
    controller.setLayout('tree')
    controller.edit((top) => {
      top.children![0]!.topic = 'Renamed'
    })
    await settle()
    expect(controller.canUndo).toBe(true)
    expect(controller.layout).toBe('tree')
    expect(root().structureClass).toBe('org.xmind.ui.tree.right')
    expect(controller.undo()).toBe(true)
    expect(controller.layout).toBe('tree')
    expect(root().structureClass).toBe('org.xmind.ui.tree.right')
    expect(mind.container.dataset.mmStructure).toBe('tree')
  })

  it('folding with the handle is written without becoming a history step', async () => {
    const { controller, mind, attached } = await mount()
    mind.expandNode(mind.findEle(IDS.a), false)
    expect(attached()[0]!.branch).toBe('folded')
    expect(controller.canUndo).toBe(false)
    controller.setAllFolded(false)
    expect(attached()[0]!).not.toHaveProperty('branch')
    expect(attached()[1]!).not.toHaveProperty('branch')
  })

  it('moving a topic moves the whole source topic, hidden parts included', async () => {
    const { mind, attached } = await mount()
    await mind.moveNodeIn([mind.findEle(IDS.a)], mind.findEle(IDS.c))
    await settle()
    const gamma = attached()[1]!
    expect(gamma.id).toBe(IDS.c)
    const moved = attached(gamma)[0]!
    expect(moved.id).toBe(IDS.a)
    expect(moved.unknownTopicKey).toEqual({ nested: ['kept', 1, true] })
    expect(moved.children!.callout).toHaveLength(1)
  })
})

describe('text from the file is never markup', () => {
  const HOSTILE = '<img src=x onerror="window.pwned=1"><script>window.pwned=1</script><b>bold</b>'

  function hostileSheet(): XmindSheet {
    const sheet = plainSheet(HOSTILE)
    sheet.rootTopic.title = HOSTILE
    const [one, two] = sheet.rootTopic.children!.attached!
    one!.title = HOSTILE
    one!.labels = [HOSTILE]
    one!.notes = { plain: { content: HOSTILE } }
    one!.href = 'https://example.com/?q=<b>'
    one!.children = {
      attached: [topic('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', HOSTILE)],
      summary: [topic('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', HOSTILE)],
    }
    one!.summaries = [
      {
        id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3',
        range: '(0,0)',
        topicId: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
      },
    ]
    sheet.relationships = [
      {
        id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4',
        end1Id: one!.id,
        end2Id: two!.id,
        title: HOSTILE,
      },
    ]
    return sheet
  }

  const texts = (view: { root: ViewTopic }) => view.root.children[0]!

  it('titles, labels, summary and relationship text show their characters and create no element', async () => {
    const { el, doc } = await mount([hostileSheet()])
    expect(el.querySelectorAll('img, script, b, iframe, a')).toHaveLength(0)
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined()

    const view = sheetToView(doc.sheets[0]!, 0)
    expect(topicEl(el, view.root.id).querySelector('.text')!.textContent).toBe(HOSTILE)
    const first = topicEl(el, texts(view).id)
    expect(first.querySelector('.text')!.textContent).toBe(HOSTILE)
    expect(first.querySelector('.tags span')!.textContent).toBe(HOSTILE)
    const labels = [...el.querySelectorAll('.svg-label')]
    expect(labels).toHaveLength(2)
    for (const label of labels) {
      expect(label.textContent).toBe(HOSTILE)
      expect(label.children).toHaveLength(0)
    }
  })

  it('stays text after an edit, an undo and a redraw', async () => {
    const { controller, el, doc } = await mount([hostileSheet()])
    const view = sheetToView(doc.sheets[0]!, 0)
    await controller.setTitle(texts(view).id, `${HOSTILE} again`)
    controller.setLabels(texts(view).id, [HOSTILE, '<i>second</i>'])
    controller.undo()
    controller.redo()
    controller.redraw()
    expect(el.querySelectorAll('img, script, b, i, iframe, a')).toHaveLength(0)
    expect(topicEl(el, texts(view).id).querySelector('.text')!.textContent).toBe(`${HOSTILE} again`)
  })

  it('a node pasted from the clipboard cannot bring markup or a link of its own', async () => {
    const { mind, el, attached } = await mount([plainSheet()])
    const target = attached()[0]!
    mind.selectNode(mind.findEle(target.id))
    const payload = JSON.stringify({
      magic: 'MIND-ELIXIR-WAIT-COPY',
      data: [
        {
          id: 'pasted',
          topic: HOSTILE,
          dangerouslySetInnerHTML: HOSTILE,
          hyperLink: 'javascript:alert(1)',
          image: { url: 'https://example.com/t.png', width: 5, height: 5 },
          metadata: { labels: ['ok'], link: 'javascript:alert(1)' },
        },
      ],
    })
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => payload } })
    mind.container.dispatchEvent(paste)
    await settle()

    expect(el.querySelectorAll('img, script, b, a')).toHaveLength(0)
    const pasted = attached(attached()[0]!)[0]!
    expect(pasted.title).toBe(HOSTILE)
    expect(pasted.id).toMatch(UUID)
    expect(pasted.labels).toEqual(['ok'])
    // a pasted address is text like any other: kept, shown, and never an anchor
    expect(pasted.href).toBe('javascript:alert(1)')
  })

  // Clipboard text claiming to be one of the map's own nodes is still clipboard text.
  it.each([
    ['null', () => null],
    ['an empty object', () => ({})],
    ['the id of a live topic', (rootId: string) => ({ id: rootId })],
    [
      'a copy of the live central topic',
      (rootId: string) => ({ id: rootId, topic: 'Root', root: true, children: [] }),
    ],
  ])('a pasted node whose parent is %s is cleaned too', async (_name, parentOf) => {
    const { mind, el, attached, root } = await mount([plainSheet()])
    const target = attached()[0]!
    mind.selectNode(mind.findEle(target.id))
    const payload = JSON.stringify({
      magic: 'MIND-ELIXIR-WAIT-COPY',
      data: [
        {
          // the id of a topic on the map does not make this one of its nodes
          id: target.id,
          topic: 'Pasted',
          parent: parentOf(root().id),
          dangerouslySetInnerHTML: '<b>bold</b>',
          style: { background: 'url(https://evil.example/bg.png)', color: 'red' },
          hyperLink: 'https://evil.example/',
          image: { url: 'https://evil.example/i.png', width: 5, height: 5 },
          nodeObj: { id: target.id, parent: { id: root().id } },
          children: [
            { id: 'below', topic: 'Below', parent: null, dangerouslySetInnerHTML: '<i>i</i>' },
          ],
        },
      ],
    })
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => payload } })
    mind.container.dispatchEvent(paste)
    await settle()

    expect(el.querySelectorAll('img, script, b, i, a')).toHaveLength(0)
    expect(el.querySelectorAll('[style*="url("]')).toHaveLength(0)
    expect(el.innerHTML).not.toContain('evil.example')
    const pasted = attached(attached()[0]!).at(-1)!
    expect(pasted.title).toBe('Pasted')
    expect(pasted.id).toMatch(UUID)
    expect(pasted.id).not.toBe(target.id)
    expect(pasted).not.toHaveProperty('href')
    expect(pasted.children!.attached![0]!.title).toBe('Below')
  })
})

describe('links nothing will open', () => {
  const PROBES = ['javascript:alert(1)', 'file:///C:/secret.txt', 'ftp://example.com/x'] as const

  function probeSheet(): XmindSheet {
    const sheet = plainSheet()
    sheet.rootTopic.children!.attached = PROBES.map((href, at) =>
      topic(`eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee${at}`, `Probe ${at}`, { href }),
    )
    return sheet
  }

  it('are shown on the topic as plain text and are not anchors', async () => {
    const { controller, el, attached } = await mount([probeSheet()])
    expect(el.querySelectorAll('a')).toHaveLength(0)
    attached().forEach((source, at) => {
      const chip = topicEl(el, source.id).querySelector('.mm-chip-link')!
      expect(chip.tagName).toBe('SPAN')
      expect(chip.children).toHaveLength(0)
      expect(chip.textContent).toBe(PROBES[at])
      expect(controller.topic(source.id)!.link).toBe(PROBES[at])
    })
  })

  it('pressing one asks only the host, which hands it to the main process; the map opens nothing', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { el, host, attached } = await mount([probeSheet()])
    for (const source of attached()) {
      topicEl(el, source.id)
        .querySelector<HTMLElement>('.mm-chip-link')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    }
    expect(host.openLink.mock.calls.map((call) => call[0])).toEqual([...PROBES])
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })

  it('stay in the file byte for byte through an unrelated edit and a save', async () => {
    const { controller, session, attached } = await mount([probeSheet()])
    controller.setTitle(attached()[0]!.id, 'Probe 0, renamed')
    controller.setLabels(attached()[1]!.id, ['unrelated'])
    const saved = await openXmind(await session.produceBytes())
    if (saved.status !== 'ok') throw new Error('did not open')
    const topics = saved.document.sheets[0]!.rootTopic.children!.attached!
    expect(topics.map((source) => source.href)).toEqual([...PROBES])
    expect(topics[0]!.title).toBe('Probe 0, renamed')
  })
})

describe('cut and paste', () => {
  /** What the library put on the clipboard at a copy or cut. */
  function clipboardEvent(
    type: 'cut' | 'copy' | 'paste',
    text = '',
  ): { event: Event; text: () => string } {
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

  async function cut(mind: MapController['mind'], id: string): Promise<string> {
    mind.selectNode(mind.findEle(id))
    const clipboard = clipboardEvent('cut')
    mind.container.dispatchEvent(clipboard.event)
    await settle()
    return clipboard.text()
  }

  async function paste(mind: MapController['mind'], targetId: string, text: string): Promise<void> {
    mind.selectNode(mind.findEle(targetId))
    mind.container.dispatchEvent(clipboardEvent('paste', text).event)
    await settle()
  }

  it('a cut topic pasted in the same sheet arrives as the original source topic, whole', async () => {
    const { controller, mind, el, doc, host, attached } = await mount()
    const original = JSON.stringify(doc.sheets[0])
    const alpha = copyOf(attached()[0]!)
    expect(alpha).toMatchObject({
      id: IDS.a,
      unknownTopicKey: { nested: ['kept', 1, true] },
      markers: [{ markerId: 'priority-1' }],
      notes: { realHTML: { content: '<div>note of alpha</div>' } },
    })

    const clipboard = await cut(mind, IDS.a)
    expect(host.confirmDelete).toHaveBeenCalledExactlyOnceWith(3)
    expect(attached().map((source) => source.id)).toEqual([IDS.b, IDS.c])
    const afterCut = JSON.stringify(doc.sheets[0])

    await paste(mind, IDS.c, clipboard)
    const gamma = attached()[1]!
    expect(gamma.id).toBe(IDS.c)
    // same ids, every source key, the picture, markers, style, both note forms, summary, boundary, callout
    expect(gamma.children!.attached).toEqual([alpha])
    expect(JSON.stringify(doc.sheets[0])).toContain(IDS.underSummary)
    // the line from one of its branches is back with its curve
    const line = (doc.sheets[0]!.relationships as { id: string; controlPoints?: unknown }[]).find(
      (candidate) => candidate.id === IDS.relShown,
    )
    expect(line?.controlPoints).toBeDefined()
    // and the screen shows the same topic, under its own id
    expect(topicEl(el, IDS.a).querySelector('.text')!.textContent).toBe('Alpha')
    expect(mind.nodeData.children![1]!.children![0]!.id).toBe(IDS.a)

    // undo and redo across the cut and the paste restore exactly
    controller.undo()
    expect(JSON.stringify(doc.sheets[0])).toBe(afterCut)
    controller.undo()
    expect(JSON.stringify(doc.sheets[0])).toBe(original)
    expect(doc.changed).toBe(false)
    controller.redo()
    controller.redo()
    expect(attached()[1]!.children!.attached).toEqual([alpha])
    expect(topicEl(el, IDS.a).querySelector('.text')!.textContent).toBe('Alpha')
  })

  it('a second paste of the same clipboard makes new topics from what is shown', async () => {
    const { mind, attached } = await mount()
    const clipboard = await cut(mind, IDS.a)
    await paste(mind, IDS.c, clipboard)
    await paste(mind, IDS.b, clipboard)
    const beta = attached()[0]!
    const second = beta.children!.attached!.at(-1)!
    expect(second.title).toBe('Alpha')
    expect(second.id).not.toBe(IDS.a)
    expect(second.id).toMatch(UUID)
    expect(second.labels).toEqual(['urgent', 'draft'])
    expect(second).not.toHaveProperty('unknownTopicKey')
    expect(second).not.toHaveProperty('markers')
    // the one that was moved is untouched
    expect(attached()[1]!.children!.attached![0]!.id).toBe(IDS.a)
  })

  it('copy and paste makes new topics, and a copy forgets an earlier cut', async () => {
    const { mind, attached } = await mount()
    const cutText = await cut(mind, IDS.b)
    mind.selectNode(mind.findEle(IDS.c))
    const copy = clipboardEvent('copy')
    mind.container.dispatchEvent(copy.event)
    await paste(mind, IDS.a, copy.text())
    const copied = attached()[0]!.children!.attached!.at(-1)!
    expect(copied.title).toBe('Gamma')
    expect(copied.id).not.toBe(IDS.c)

    // the clipboard of the earlier cut, pasted after something else was copied: a new topic
    await paste(mind, IDS.c, cutText)
    const again = attached()[1]!.children!.attached!.at(-1)!
    expect(again.title).toBe('Beta')
    expect(again.id).not.toBe(IDS.b)
    expect(again).not.toHaveProperty('href')
  })

  it('a cut the user called off leaves the topic, and pasting then makes a copy', async () => {
    const { mind, attached } = await mount([richSheet()], {
      confirmDelete: vi.fn(async () => false),
    })
    const clipboard = await cut(mind, IDS.a)
    expect(attached().map((source) => source.id)).toEqual([IDS.a, IDS.b, IDS.c])
    await paste(mind, IDS.c, clipboard)
    const pasted = attached()[2]!.children!.attached![0]!
    expect(pasted.id).not.toBe(IDS.a)
    expect(pasted).not.toHaveProperty('unknownTopicKey')
  })

  it('pasting into another sheet makes new topics there', async () => {
    const doc = await documentOf(richSheet(), plainSheet())
    const session = new DocumentSession(doc)
    const host = {
      confirmDelete: vi.fn(async () => true),
      openLink: vi.fn(),
      onRequest: vi.fn(),
      onStateChange: vi.fn(),
    }
    const [first, second] = session.tabs().map((tab) => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      const controller = new MapController({
        el,
        session,
        sheetKey: tab.key,
        strings: STRINGS,
        host,
      })
      mounted.push(controller)
      return controller
    })
    const clipboard = await cut(first!.mind, IDS.a)
    const target = doc.sheets[1]!.rootTopic.children!.attached![0]!
    await paste(second!.mind, target.id, clipboard)
    const pasted = doc.sheets[1]!.rootTopic.children!.attached![0]!.children!.attached![0]!
    expect(pasted.title).toBe('Alpha')
    expect(pasted.id).not.toBe(IDS.a)
    expect(pasted).not.toHaveProperty('unknownTopicKey')
  })
})

describe("the map's own menu", () => {
  const menuTexts = (el: HTMLElement) =>
    [...el.querySelectorAll('.context-menu .menu-list > li')].map(
      (item) => item.firstElementChild!.textContent,
    )

  it("is in the user's language, with the editor's entries after the library's, and follows a language change", async () => {
    const { controller, el } = await mount()
    expect(menuTexts(el)).toEqual([
      '하위 토픽',
      '상위 토픽',
      '형제 토픽',
      '지우기',
      '위로',
      '아래로',
      '요약',
      '연결선',
      '라벨',
      '메모',
      '링크',
      '그림 지우기',
    ])
    controller.setStrings({
      ...STRINGS,
      newTopic: 'New topic',
      menu: { ...STRINGS.menu, addChild: 'Add subtopic', summary: 'Summary' },
      menuLink: 'Link',
      menuRemovePicture: 'Remove picture',
    })
    const texts = menuTexts(el)
    expect(texts[0]).toBe('Add subtopic')
    expect(texts[6]).toBe('Summary')
    expect(texts.at(-2)).toBe('Link')
    expect(texts.at(-1)).toBe('Remove picture')
    expect(controller.mind.newTopicName).toBe('New topic')
  })

  it('asks the host for the label, note or link of the selected topic', async () => {
    const { mind, el, host } = await mount()
    mind.selectNode(mind.findEle(IDS.c))
    const items = [...el.querySelectorAll<HTMLElement>('.context-menu .menu-list > li')]
    items.at(-4)!.click()
    items.at(-2)!.click()
    expect(host.onRequest.mock.calls).toEqual([
      ['label', IDS.c],
      ['link', IDS.c],
    ])
  })

  it('offers to remove a picture only on a topic that has one, and removes it', async () => {
    const { mind, el, doc } = await mount()
    const entry = () => el.querySelector<HTMLElement>('.context-menu .menu-list > li:last-child')!
    const openOn = (id: string) => {
      mind.selectNode(mind.findEle(id))
      mind.bus.fire('showContextMenu', { target: topicEl(el, id) } as unknown as MouseEvent)
    }
    openOn(IDS.c)
    expect(entry().classList.contains('disabled')).toBe(true)
    openOn(IDS.a)
    expect(entry().classList.contains('disabled')).toBe(false)
    entry().click()
    await settle()
    expect(doc.sheets[0]!.rootTopic.children!.attached![0]!.image).toBeUndefined()
  })
})

describe('removing a picture', () => {
  it('takes it off the topic as one step that undoes back to the original bytes', async () => {
    const { controller, doc, original, attached, el } = await mount()
    const alpha = () => attached()[0]!
    expect(alpha().image).toEqual({ src: 'xap:resources/picture.png', width: 40, height: 30 })
    const before = copyOf(doc.sheets[0])

    expect(controller.removePicture(IDS.a)).toBe(true)
    await settle()
    expect(alpha().image).toBeUndefined()
    expect(topicEl(el, IDS.a).querySelector('img')).toBeNull()
    // nothing else of the topic or the sheet moved
    const after = copyOf(doc.sheets[0]) as { rootTopic: { children: { attached: unknown[] } } }
    const expected = copyOf(before) as typeof after
    delete (expected.rootTopic.children.attached[0] as { image?: unknown }).image
    expect(after).toEqual(expected)
    expect(doc.changed).toBe(true)

    expect(controller.undo()).toBe(true)
    await settle()
    expect(doc.sheets[0]).toEqual(before)
    expect(await doc.save()).toEqual(original)

    expect(controller.redo()).toBe(true)
    await settle()
    expect(alpha().image).toBeUndefined()
  })

  it('turns down a topic without a picture and changes nothing', async () => {
    const { controller, doc } = await mount()
    expect(controller.removePicture(IDS.c)).toBe(false)
    expect(controller.removePicture('00000000-0000-4000-8000-000000000000')).toBe(false)
    await settle()
    expect(doc.changed).toBe(false)
  })

  it('a state that merely lacks the picture never deletes it', async () => {
    const { controller, mind, attached } = await mount()
    // the library's data loses the picture without the user asking (as a bug might)
    const alpha = mind.nodeData.children![0]!
    alpha.metadata = { ...(alpha.metadata as object), image: null }
    controller.flush()
    await settle()
    expect(attached()[0]!.image).toEqual({
      src: 'xap:resources/picture.png',
      width: 40,
      height: 30,
    })
  })
})

describe('when the screen and the file disagree', () => {
  it('a state that cannot be applied is dropped and the screen is drawn from the file again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { controller, mind, el, doc } = await mount()
    const before = JSON.stringify(doc.sheets[0])
    // two topics under one id: nothing the library would do itself, and nothing the file can hold
    mind.nodeData.children![2]!.id = IDS.b
    mind.refresh()
    controller.flush()
    expect(JSON.stringify(doc.sheets[0])).toBe(before)
    expect(mind.nodeData.children!.map((child) => child.id)).toEqual([IDS.a, IDS.b, IDS.c])
    expect(topicEl(el, IDS.c).querySelector('.text')!.textContent).toBe('Gamma')
    warn.mockRestore()
  })

  it('an edit made on the data as one step is reconciled and can be undone', async () => {
    const { controller, attached, doc } = await mount()
    const before = copyOf(doc.sheets[0])
    controller.edit((root) => {
      root.children![2]!.topic = 'Edited in one step'
      root.children!.push({ id: 'not-an-id-the-file-uses', topic: 'Added in the same step' })
    })
    expect(attached().map((child) => child.title)).toEqual([
      'Alpha',
      'Beta',
      'Edited in one step',
      'Added in the same step',
    ])
    expect(attached()[3]!.id).toMatch(UUID)
    controller.undo()
    expect(doc.sheets[0]).toEqual(before)
  })
})
