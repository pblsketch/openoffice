/**
 * The format panel on a real map: what it shows for each kind of selection
 * (topics, a relationship, a summary, a boundary, nothing), and that its
 * controls reach the controller's edit functions, each one step of the
 * history. The panel is wired the way the editor wires it (`App.tsx`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { XmindSheet } from '@genoffice/xmind-engine'
import { FORMAT_TAB_KEY, FormatPanel } from '../src/renderer/components/FormatPanel'
import { formatModel } from '../src/renderer/components/format-model'
import { noticeText } from '../src/renderer/components/map-notices'
import { DocumentSession } from '../src/renderer/document/session'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import { mapStrings } from '../src/renderer/i18n/map-strings'
import { strings } from '../src/renderer/i18n/strings'
import { MapController, type MapHost, type MapNotice } from '../src/renderer/map/controller'
import type { MindmapApi } from '../src/shared/ipc'
import { documentOf, topic } from './helpers/fixtures'

const ID = {
  sheet: 'f0000000-0000-4000-8000-000000000000',
  root: 'f0000000-0000-4000-8000-000000000001',
  a: 'f0000000-0000-4000-8000-000000000002',
  a1: 'f0000000-0000-4000-8000-000000000003',
  b: 'f0000000-0000-4000-8000-000000000004',
  b1: 'f0000000-0000-4000-8000-000000000005',
  folded: 'f0000000-0000-4000-8000-000000000006',
  rel: 'f0000000-0000-4000-8000-000000000007',
  styledRel: 'f0000000-0000-4000-8000-000000000008',
  summaryRecord: 'f0000000-0000-4000-8000-000000000009',
  summaryTopic: 'f0000000-0000-4000-8000-00000000000a',
  boundary: 'f0000000-0000-4000-8000-00000000000b',
} as const

const style = (properties: Record<string, string>) => ({ style: { id: 's', properties } })

/**
 * A: a line of its own (straight, 3pt, a colour); A1 below it the same.
 * B: no line values, with a boundary around B1. F: a shape only read.
 * A plain and a formatted relationship (with a curve), a summary over A's branch.
 */
function sheet(): XmindSheet {
  const line = {
    'line-class': 'org.xmind.branchConnection.straight',
    'line-width': '3pt',
    'line-color': '#112233',
  }
  return {
    id: ID.sheet,
    class: 'sheet',
    title: 'Panel',
    rootTopic: topic(ID.root, 'Root', {}, [
      topic(
        ID.a,
        'A',
        {
          ...style(line),
          summaries: [{ id: ID.summaryRecord, range: '(0,0)', topicId: ID.summaryTopic }],
          children: { summary: [topic(ID.summaryTopic, 'Sum')] },
        },
        [topic(ID.a1, 'A1', style(line))],
      ),
      topic(ID.b, 'B', { boundaries: [{ id: ID.boundary, range: '(0,0)', title: 'grp' }] }, [
        topic(ID.b1, 'B1'),
      ]),
      topic(ID.folded, 'F', style({ 'line-class': 'org.xmind.branchConnection.fold' })),
    ]),
    relationships: [
      { id: ID.rel, end1Id: ID.a1, end2Id: ID.b1, title: 'plain' },
      {
        id: ID.styledRel,
        end1Id: ID.a,
        end2Id: ID.folded,
        title: 'styled',
        style: {
          id: 'r',
          properties: {
            'shape-class': 'org.xmind.relationshipShape.angled',
            'arrow-end-class': 'org.xmind.arrowShape.dot',
          },
        },
        controlPoints: { '0': { x: 10, y: 20 }, '1': { x: -10, y: -20 } },
      },
    ],
  }
}

let container: HTMLElement
let root: Root
const mounted: MapController[] = []

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  ;(window as unknown as { mindmapApi: Partial<MindmapApi> }).mindmapApi = {
    onLanguageChanged: () => () => {},
  }
})
afterEach(() => {
  act(() => root?.unmount())
  for (const controller of mounted.splice(0)) controller.destroy()
  document.body.innerHTML = ''
  localStorage.removeItem(FORMAT_TAB_KEY)
  vi.unstubAllGlobals()
})

/** The map, and the panel beside it redrawn whenever the map reports a change. */
async function mount() {
  const doc = await documentOf(sheet())
  const session = new DocumentSession(doc)
  const el = document.createElement('div')
  document.body.appendChild(el)
  const notices: MapNotice[] = []
  let redraw = (): void => {}
  const host: MapHost = {
    confirmDelete: async () => true,
    openLink: () => {},
    onRequest: () => {},
    onStateChange: () => redraw(),
    onNotice: (notice) => notices.push(notice),
  }
  const controller = new MapController({
    el,
    session,
    sheetKey: session.tabs()[0]!.key,
    strings: mapStrings('en'),
    host,
  })
  mounted.push(controller)

  function Panel() {
    const [, setTick] = useState(0)
    useEffect(() => {
      redraw = () => setTick((tick) => tick + 1)
    }, [])
    return createElement(FormatPanel, {
      model: formatModel(controller),
      format: controller.textFormat(),
      editing: controller.editingText,
      painter: controller.formatPainter,
      onToggle: (key) => controller.toggleTextFormat(key),
      onFormat: (format) => controller.formatText(format),
      onBranchLine: (change) => controller.setBranchLine(change),
      onRelationship: (change) => controller.setRelationshipStyle(change),
      onCurveAuto: () => controller.resetRelationshipCurve(),
      onSummary: (change) => controller.setSummaryStyle(change),
      onBoundary: (change) => controller.setBoundaryStyle(change),
      onClear: () => controller.clearFormat(),
      onPainter: () => controller.toggleFormatPainter(),
      onClose: () => {},
    })
  }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(createElement(LocaleProvider, { initial: 'en', children: createElement(Panel) }))
  })
  const mind = controller.mind
  return {
    controller,
    mind,
    notices,
    /** runs something on the map, then lets the panel catch up */
    async on(step: () => unknown): Promise<void> {
      await act(async () => {
        step()
      })
    },
  }
}

const panel = (): HTMLElement => container.querySelector<HTMLElement>('.mm-format-panel')!
const kind = (): string | undefined =>
  panel().querySelector<HTMLElement>('[data-format-kind]')!.dataset.formatKind
const button = (action: string): HTMLButtonElement => {
  const found = panel().querySelector<HTMLButtonElement>(`[data-action="${action}"]`)
  if (!found) throw new Error(`no button ${action}`)
  return found
}
const pressed = (prefix: string): string[] =>
  [
    ...panel().querySelectorAll<HTMLElement>(`[data-action^="${prefix}-"][aria-pressed="true"]`),
  ].map((element) => element.dataset.action!.slice(prefix.length + 1))
const dropdownValue = (className: string): string | undefined =>
  panel().querySelector<HTMLElement>(`.${className} .gs-dd-btn`)?.dataset.value
const state = (): string[] =>
  [...panel().querySelectorAll<HTMLElement>('[data-format-state]')].map(
    (element) => element.dataset.formatState!,
  )

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click()
  })
}

/** The "Line" side of the switch above a topic's format. */
const showLine = (): Promise<void> => click(button('format-tab-line'))
const tabsPressed = (): string[] => pressed('format-tab')
const section = (name: string): Element | null =>
  panel().querySelector(`[data-format-section="${name}"]`)

async function pick(className: string, value: string): Promise<void> {
  await click(panel().querySelector<HTMLElement>(`.${className} .gs-dd-btn`)!)
  await click(
    panel().querySelector<HTMLElement>(`.${className} .gs-dd-item[data-value="${value}"]`)!,
  )
}

describe('the format panel', () => {
  it('with nothing selected says what to select, greys the text format out and offers no line', async () => {
    await mount()
    expect(kind()).toBe('none')
    expect(panel().textContent).toContain(strings.en.formatNoTopic)
    expect(panel().querySelector('[data-format-section="text"]')).not.toBeNull()
    expect(panel().querySelector('[data-format-section="line"]')).toBeNull()
    expect(button('format-bold').disabled).toBe(true)
    expect(button('format-clear').disabled).toBe(true)
    expect(button('format-painter').disabled).toBe(true)
  })

  it('shows the text and the line of a topic, and a shape goes on its whole branch as one step', async () => {
    const { controller, mind, on } = await mount()
    await on(() => mind.selectNode(mind.findEle(ID.a)))
    expect(kind()).toBe('topics')
    expect(section('text')).not.toBeNull()
    await showLine()
    expect(section('text')).toBeNull()
    expect(pressed('line-shape')).toEqual(['straight'])
    expect(dropdownValue('line-width')).toBe('3')
    expect(dropdownValue('line-pattern')).toBe('solid')
    expect(state()).toEqual([])

    await click(button('line-shape-elbow'))
    expect(controller.topicLine(ID.a)!.own.shape).toBe('org.xmind.branchConnection.elbow')
    expect(controller.topicLine(ID.a1)!.own.shape).toBe('org.xmind.branchConnection.elbow')
    expect(pressed('line-shape')).toEqual(['elbow'])

    await pick('line-width', '6')
    expect(controller.topicLine(ID.a1)!.own.width).toBe('6pt')
    await pick('line-pattern', 'dash-dot')
    expect(controller.topicLine(ID.a1)!.own.pattern).toBe('dash-dot')
    expect(dropdownValue('line-pattern')).toBe('dash-dot')

    // three changes, three steps
    await on(() => controller.undo())
    await on(() => controller.undo())
    await on(() => controller.undo())
    expect(controller.topicLine(ID.a1)!.own.shape).toBe('org.xmind.branchConnection.straight')
    expect(controller.canUndo).toBe(false)
  })

  it('offers the thicknesses 1, 2, 3, 4 and 6 pt and shows another one as it is', async () => {
    const { mind, on } = await mount()
    await on(() => mind.selectNode(mind.findEle(ID.b)))
    await showLine()
    // B has no width of its own: the theme's, which is not one of the choices
    const shown = dropdownValue('line-width')!
    await click(panel().querySelector<HTMLElement>('.line-width .gs-dd-btn')!)
    const items = [...panel().querySelectorAll<HTMLButtonElement>('.line-width .gs-dd-item')]
    const offered = items.filter((item) => !item.disabled).map((item) => item.dataset.value)
    expect(offered).toEqual(['1', '2', '3', '4', '6'])
    if (!['1', '2', '3', '4', '6'].includes(shown)) {
      expect(items[0]!.disabled).toBe(true)
      expect(items[0]!.dataset.value).toBe(shown)
    }
  })

  it('says "mixed" where the selected topics differ', async () => {
    const { mind, on } = await mount()
    await on(() => mind.selectNodes([mind.findEle(ID.a), mind.findEle(ID.b)]))
    expect(kind()).toBe('topics')
    await showLine()
    expect(dropdownValue('line-width')).toBe('mixed')
    expect(state()).toContain('mixed')
    expect(pressed('line-shape')).toEqual([])
  })

  it('shows a shape the file has that cannot be picked as another shape, kept in the file', async () => {
    const { controller, mind, on } = await mount()
    await on(() => mind.selectNode(mind.findEle(ID.folded)))
    await showLine()
    expect(state()).toEqual(['other'])
    expect(panel().textContent).toContain('Another shape (kept as in the file)')
    expect(pressed('line-shape')).toEqual([])
    expect(controller.topicLine(ID.folded)!.own.shape).toBe('org.xmind.branchConnection.fold')
  })

  it('turns the shape off in the tree and timeline layouts, with a word on why', async () => {
    const { mind, controller, on } = await mount()
    for (const layout of ['tree', 'timeline'] as const) {
      await on(() => controller.setLayout(layout))
      await on(() => mind.selectNode(mind.findEle(ID.a)))
      await showLine()
      expect(state()).toEqual(['locked'])
      expect(panel().textContent).toContain('Line shapes cannot be changed in this layout.')
      expect(button('line-shape-curve').disabled).toBe(true)
      // the thickness and the colour still apply
      expect(panel().querySelector<HTMLButtonElement>('.line-width .gs-dd-btn')!.disabled).toBe(
        false,
      )
    }
    await on(() => controller.setLayout('right'))
    await on(() => mind.selectNode(mind.findEle(ID.a)))
    expect(button('line-shape-curve').disabled).toBe(false)
  })

  it('shows one group of a topic at a time, text first, with the painter and "clear" above both', async () => {
    const { mind, on } = await mount()
    await on(() => mind.selectNode(mind.findEle(ID.a)))
    const tabs = panel().querySelector('.mm-format-tabs')!
    expect([...tabs.querySelectorAll('button')].map((tab) => tab.textContent)).toEqual([
      strings.en.formatTextSection,
      strings.en.formatLineSection,
    ])
    expect(tabsPressed()).toEqual(['text'])
    expect(section('text')).not.toBeNull()
    expect(section('line')).toBeNull()
    // the switch names the group: the group has no title of its own
    expect(section('text')!.querySelector('.mm-format-section-title')).toBeNull()

    await showLine()
    expect(tabsPressed()).toEqual(['line'])
    expect(section('text')).toBeNull()
    expect(section('line')).not.toBeNull()
    expect(section('line')!.querySelector('.mm-format-section-title')).toBeNull()
    // the actions stay, above the switch
    const actions = panel().querySelector('.mm-format-actions')!
    expect(actions.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(button('format-painter').disabled).toBe(false)
    expect(button('format-clear').disabled).toBe(false)

    await click(button('format-tab-text'))
    expect(tabsPressed()).toEqual(['text'])
    expect(section('line')).toBeNull()
  })

  it('keeps the last group chosen: for the next topic, and when the panel opens again', async () => {
    const { mind, on } = await mount()
    await on(() => mind.selectNode(mind.findEle(ID.a)))
    await showLine()
    expect(localStorage.getItem(FORMAT_TAB_KEY)).toBe('line')
    await on(() => mind.selectNode(mind.findEle(ID.b)))
    expect(tabsPressed()).toEqual(['line'])

    // nothing selected: no switch, the text format greyed out as before
    await on(() => mind.clearSelection())
    expect(kind()).toBe('none')
    expect(panel().querySelector('.mm-format-tabs')).toBeNull()
    expect(section('text')).not.toBeNull()

    // the panel closed and opened again
    act(() => root.unmount())
    const again = await mount()
    await again.on(() => again.mind.selectNode(again.mind.findEle(ID.a)))
    expect(tabsPressed()).toEqual(['line'])
    expect(section('line')).not.toBeNull()
  })

  it('has no switch for a relationship, a summary or a boundary', async () => {
    const { controller, mind, on } = await mount()
    await on(() => mind.selectNode(mind.findEle(ID.a)))
    await showLine()
    await on(() => controller.selectBoundary(ID.boundary))
    expect(kind()).toBe('boundary')
    expect(panel().querySelector('.mm-format-tabs')).toBeNull()
    expect(section('boundary')!.querySelector('.mm-format-section-title')).not.toBeNull()
  })

  it('shows a relationship’s shape, ends and curve, and changes them', async () => {
    const { controller, mind, on } = await mount()
    const group = [...mind.arrowSvg.children].find(
      (child) => (child as SVGGElement).dataset.linkid === ID.styledRel,
    ) as Parameters<typeof mind.selectArrow>[0]
    await on(() => mind.selectArrow(group))
    expect(kind()).toBe('relationship')
    expect(panel().querySelector('[data-format-section="text"]')).toBeNull()
    expect(pressed('rel-shape')).toEqual(['angled'])
    expect(pressed('rel-begin')).toEqual(['none'])
    expect(pressed('rel-end')).toEqual(['dot'])
    expect(dropdownValue('rel-pattern')).toBe('dash')

    // both ends can carry an arrow
    await click(button('rel-begin-triangle'))
    expect(controller.relationshipFormat(ID.styledRel)!.style.begin).toBe(
      'org.xmind.arrowShape.triangle',
    )
    expect(controller.relationshipFormat(ID.styledRel)!.style.end).toBe('org.xmind.arrowShape.dot')

    expect(button('rel-curve-auto').disabled).toBe(false)
    await click(button('rel-curve-auto'))
    expect(controller.relationshipFormat(ID.styledRel)!.curve).toBeNull()
    expect(button('rel-curve-auto').disabled).toBe(true)

    await click(button('format-clear'))
    expect(controller.relationshipFormat(ID.styledRel)!.style).toEqual({})
  })

  it('shows a summary’s bracket and changes its shape', async () => {
    const { controller, mind, on } = await mount()
    const group = [...mind.summarySvg.children].find(
      (child) => (child as { summaryObj?: { id: string } }).summaryObj?.id === ID.summaryTopic,
    ) as Parameters<typeof mind.selectSummary>[0]
    await on(() => mind.selectSummary(group))
    expect(kind()).toBe('summary')
    expect(pressed('summary-shape')).toEqual(['bracket'])
    await click(button('summary-shape-curly'))
    expect(controller.summaryFormat(ID.summaryTopic)).toEqual({
      shape: 'org.xmind.summaryShape.curly',
    })
    expect(pressed('summary-shape')).toEqual(['curly'])
  })

  it('shows a boundary’s shape, line and fill, "no fill" included, and changes them', async () => {
    const { controller, on } = await mount()
    await on(() => controller.selectBoundary(ID.boundary))
    expect(kind()).toBe('boundary')
    expect(pressed('boundary-shape')).toEqual(['roundedRect'])
    expect(button('boundary-fill-none').getAttribute('aria-pressed')).toBe('false')

    await click(button('boundary-shape-waves'))
    await click(button('boundary-fill-none'))
    await pick('boundary-width', '2')
    await pick('boundary-pattern', 'dot')
    expect(controller.boundary(ID.boundary)!.style).toEqual({
      shape: 'org.xmind.boundaryShape.waves',
      fill: 'none',
      width: '2pt',
      pattern: 'dot',
    })
    expect(button('boundary-fill-none').getAttribute('aria-pressed')).toBe('true')

    await click(button('format-clear'))
    expect(controller.boundary(ID.boundary)!.style).toEqual({})
  })

  it('clears the text and the line of the selected topics, so the branch follows the theme', async () => {
    const { controller, mind, on } = await mount()
    await on(() => mind.selectNode(mind.findEle(ID.a)))
    await click(button('format-clear'))
    expect(controller.topicLine(ID.a)!.own).toEqual({})
    expect(controller.topicLine(ID.a1)!.own).toEqual({})
  })

  it('the painter button: once, then until let go, then off; it shows which', async () => {
    const { controller, mind, on } = await mount()
    await on(() => mind.selectNode(mind.findEle(ID.a)))
    const painter = (): HTMLButtonElement => button('format-painter')
    expect(painter().dataset.painter).toBe('off')
    expect(painter().getAttribute('aria-pressed')).toBe('false')

    await click(painter())
    expect(painter().dataset.painter).toBe('once')
    expect(painter().getAttribute('aria-pressed')).toBe('true')
    expect(panel().querySelector('[data-painter-note="once"]')).not.toBeNull()
    expect(controller.formatPainter).toEqual({ active: true, sticky: false, kind: 'topic' })

    await click(painter())
    expect(painter().dataset.painter).toBe('sticky')
    expect(panel().querySelector('[data-painter-note="sticky"]')).not.toBeNull()

    await click(painter())
    expect(painter().dataset.painter).toBe('off')
    expect(controller.formatPainter.active).toBe(false)
  })

  it('the painter held for a topic, pressed on a relationship, is turned down in words', async () => {
    const { controller, mind, notices, on } = await mount()
    await on(() => mind.selectNode(mind.findEle(ID.a)))
    await click(button('format-painter'))
    await on(() => controller.applyFormatTo({ kind: 'relationship', id: ID.rel }))
    expect(notices).toEqual([
      { code: 'painter-wrong-kind', held: 'topic', pressed: 'relationship' },
    ])
    expect(strings.en[noticeText(notices[0]!)]).toBe("A topic's format can only go onto topics")
  })
})

describe('the map menu', () => {
  it('has "Add boundary" among the topic entries', async () => {
    const { controller } = await mount()
    const entries = [
      ...controller.mind.container.querySelectorAll<HTMLElement>('.context-menu .menu-list > li'),
    ].map((item) => item.textContent?.trim())
    expect(entries).toContain('Add boundary')
  })
})
