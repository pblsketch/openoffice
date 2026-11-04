import { describe, expect, it } from 'vitest'
import type { MindElixirData, NodeObj } from 'mind-elixir'
import { reconcileSheet, sheetToView, type ViewSheet } from '@genoffice/xmind-engine'
import {
  cleanPastedNode,
  layoutOfDirection,
  LINK_CHIP_CLASS,
  mindToState,
  NOTE_CHIP_CLASS,
  structureOfLayout,
  viewToMind,
  type MapNode,
  type StateBase,
} from '../src/renderer/document/convert'
import { copyOf, documentOf, FISHBONE, IDS, plainSheet, richSheet } from './helpers/fixtures'

const base = (view: ViewSheet, extra: Partial<StateBase> = {}): StateBase => ({
  view,
  layoutPicked: false,
  removedSummaries: new Set(),
  removedRelationships: new Set(),
  ...extra,
})

/** What the library hands back from getData(): a JSON copy. */
const roundTrip = (data: MindElixirData): MindElixirData => copyOf(data)

function find(node: NodeObj, id: string): MapNode {
  const hit = lookFor(node, id)
  if (!hit) throw new Error(`no node ${id}`)
  return hit as MapNode
}

function lookFor(node: NodeObj, id: string): NodeObj | null {
  if (node.id === id) return node
  for (const child of node.children ?? []) {
    const hit = lookFor(child, id)
    if (hit) return hit
  }
  return null
}

describe('view data to library data', () => {
  const view = sheetToView(richSheet(), 0)
  const data = viewToMind(view)

  it('keeps ids, titles and the order of branches', () => {
    expect(data.nodeData.id).toBe(IDS.root)
    expect(data.nodeData.topic).toBe('Plan')
    expect(data.nodeData.children!.map((child) => child.id)).toEqual([IDS.a, IDS.b, IDS.c])
    expect(find(data.nodeData, IDS.a).children!.map((child) => child.topic)).toEqual([
      'Alpha one',
      'Alpha two',
      'Alpha three',
    ])
  })

  it('carries folding, labels, the note and the web link', () => {
    expect(find(data.nodeData, IDS.b).expanded).toBe(false)
    expect(find(data.nodeData, IDS.a).expanded).not.toBe(false)
    const alpha = find(data.nodeData, IDS.a)
    expect(alpha.metadata).toMatchObject({
      labels: ['urgent', 'draft'],
      note: 'note of alpha',
      link: 'https://example.com/alpha',
    })
    // a link to another topic is kept in the file and is not a link on screen
    expect(find(data.nodeData, IDS.b).metadata!.link).toBeNull()
  })

  it('shows labels, the note and the link as plain-text tags, never as a library link or raw HTML', () => {
    const alpha = find(data.nodeData, IDS.a)
    expect(alpha.tags).toEqual([
      'urgent',
      'draft',
      { text: expect.any(String), className: NOTE_CHIP_CLASS },
      { text: 'https://example.com/alpha', className: LINK_CHIP_CLASS },
    ])
    const walk = (node: NodeObj): void => {
      expect(node).not.toHaveProperty('dangerouslySetInnerHTML')
      expect(node).not.toHaveProperty('hyperLink')
      node.children?.forEach(walk)
    }
    walk(data.nodeData)
  })

  it('maps summaries by their summary topic and relationships by id', () => {
    expect(data.summaries).toEqual([
      { id: IDS.summaryTopic, label: 'Summary', parent: IDS.a, start: 0, end: 1 },
    ])
    // the curve the file gives is the library's control points too
    const curve = { from: { x: 10, y: 20 }, to: { x: -10, y: -20 } }
    expect(data.arrows).toEqual([
      {
        id: IDS.relShown,
        label: 'leads to',
        from: IDS.a1,
        to: IDS.c,
        metadata: { curve },
        delta1: curve.from,
        delta2: curve.to,
      },
    ])
  })

  it('maps the four layouts to the four directions', () => {
    const directions = (['left', 'right', 'both', 'down'] as const).map(
      (layout) => viewToMind({ ...view, layout }).direction,
    )
    expect(directions).toEqual([0, 1, 2, 3])
  })

  it('draws a tree on the direction to the right and a timeline on the one downward', () => {
    const directions = (['tree', 'timeline'] as const).map(
      (layout) => viewToMind({ ...view, layout }).direction,
    )
    expect(directions).toEqual([1, 3])
  })

  it('reads a direction back as the structure it is drawn as, and only on its own direction', () => {
    expect(layoutOfDirection(1, 'tree')).toBe('tree')
    expect(layoutOfDirection(3, 'timeline')).toBe('timeline')
    expect(layoutOfDirection(1)).toBe('right')
    expect(layoutOfDirection(3, 'map')).toBe('down')
    // a structure that does not sit on the direction shown is not what the screen draws
    expect(layoutOfDirection(0, 'tree')).toBe('left')
    expect(layoutOfDirection(1, 'timeline')).toBe('right')
    expect(structureOfLayout('tree')).toBe('tree')
    expect(structureOfLayout('timeline')).toBe('timeline')
    for (const layout of ['left', 'right', 'both', 'down'] as const) {
      expect(structureOfLayout(layout), layout).toBe('map')
    }
  })
})

describe('library data to the state for reconciling', () => {
  it('a map that was only opened reconciles to "nothing changed"', async () => {
    const document = await documentOf(richSheet(), plainSheet())
    const before = copyOf(document.sheets)
    for (const [index, sheet] of document.sheets.entries()) {
      const view = sheetToView(sheet, index)
      const state = mindToState(roundTrip(viewToMind(view)), base(view))
      const result = reconcileSheet(document, index, state)
      expect(result).toMatchObject({ ok: true, changed: false, inSync: true })
    }
    expect(document.sheets).toEqual(before)
    expect(document.changed).toBe(false)
  })

  async function edit(change: (data: MindElixirData) => void, extra: Partial<StateBase> = {}) {
    const document = await documentOf(richSheet())
    const view = sheetToView(document.sheets[0]!, 0)
    const data = roundTrip(viewToMind(view))
    change(data)
    const result = reconcileSheet(document, 0, mindToState(data, base(view, extra)))
    if (!result.ok) throw new Error(result.problem)
    return { document, result, root: document.sheets[0]!.rootTopic }
  }
  const attached = (topic: { children?: { attached?: { id: string }[] } }) =>
    (topic.children?.attached ?? []).map((child) => child.id)

  it('a retitled topic keeps everything else, the stand-in layout included', async () => {
    const { root, result } = await edit((data) => {
      find(data.nodeData, IDS.a).topic = 'Alpha, renamed'
    })
    expect(result.inSync).toBe(true)
    const alpha = root.children!.attached![0]!
    expect(alpha.title).toBe('Alpha, renamed')
    expect(alpha.unknownTopicKey).toEqual({ nested: ['kept', 1, true] })
    expect(alpha.children!.callout).toHaveLength(1)
    expect(root.structureClass).toBe(FISHBONE)
  })

  it('reordered and moved branches arrive in the new order', async () => {
    const { root } = await edit((data) => {
      const [alpha, beta, gamma] = data.nodeData.children!
      data.nodeData.children = [gamma!, alpha!]
      alpha!.children!.push(beta!)
    })
    expect(attached(root)).toEqual([IDS.c, IDS.a])
    expect(attached(root.children!.attached![1]!)).toEqual([IDS.a1, IDS.a2, IDS.a3, IDS.b])
  })

  it('folding and unfolding are written', async () => {
    const { root } = await edit((data) => {
      find(data.nodeData, IDS.a).expanded = false
      find(data.nodeData, IDS.b).expanded = true
    })
    expect(root.children!.attached![0]!.branch).toBe('folded')
    expect(root.children!.attached![1]!).not.toHaveProperty('branch')
  })

  it('labels, the note and the link come from the node, not from what is drawn', async () => {
    const { root } = await edit((data) => {
      const gamma = find(data.nodeData, IDS.c)
      gamma.metadata = {
        ...gamma.metadata!,
        labels: ['one'],
        note: 'a note',
        link: 'https://example.org/',
      }
      // what the library draws must not be read back as data
      gamma.tags = ['<b>forged</b>']
      ;(gamma as NodeObj).hyperLink = 'javascript:alert(1)'
    })
    const gamma = root.children!.attached![2]!
    expect(gamma.labels).toEqual(['one'])
    expect(gamma.notes).toEqual({ plain: { content: 'a note' } })
    expect(gamma.href).toBe('https://example.org/')
  })

  it('a link nothing would open is still a link: it reaches the file as text', async () => {
    const { root, result } = await edit((data) => {
      const gamma = find(data.nodeData, IDS.c)
      gamma.metadata = { ...gamma.metadata!, link: 'javascript:alert(1)' }
    })
    expect(result).toMatchObject({ ok: true, inSync: true })
    expect(root.children!.attached![2]!.href).toBe('javascript:alert(1)')
  })

  it('a reference into the file is not a link a node can carry', async () => {
    const { root, result } = await edit((data) => {
      const gamma = find(data.nodeData, IDS.c)
      gamma.metadata = { ...gamma.metadata!, link: 'xap:attachments/a.pdf' }
      // Beta holds a link to another topic; a forged one on screen must not replace it
      const beta = find(data.nodeData, IDS.b)
      beta.metadata = { ...beta.metadata!, link: 'xmind:#somewhere-else' }
    })
    expect(result.ok).toBe(true)
    expect(root.children!.attached![2]!).not.toHaveProperty('href')
    expect(root.children!.attached![1]!.href).toBe(`xmind:#${IDS.a}`)
  })

  it('a summary the user added is created, one the user removed is deleted', async () => {
    const added = await edit((data) => {
      data.summaries!.push({
        id: '12121212-1212-4212-8212-121212121212',
        label: 'New summary',
        parent: IDS.a,
        start: 2,
        end: 2,
      })
    })
    const alpha = added.root.children!.attached![0]!
    expect(alpha.summaries as unknown[]).toHaveLength(2)
    expect(alpha.children!.summary!.map((summary) => summary.title)).toContain('New summary')

    const removed = await edit(
      (data) => {
        data.summaries = []
      },
      { removedSummaries: new Set([IDS.summaryTopic]) },
    )
    expect(removed.root.children!.attached![0]!).not.toHaveProperty('summaries')
  })

  it('a summary the library dropped on its own stays in the file', async () => {
    const { root } = await edit((data) => {
      // what the library does when a range no longer fits: it forgets the summary
      data.summaries = []
    })
    const alpha = root.children!.attached![0]!
    expect(alpha.summaries).toEqual([
      { id: IDS.summaryRecord, range: '(0,1)', topicId: IDS.summaryTopic },
    ])
    expect(alpha.children!.summary![0]!.children!.attached).toHaveLength(1)
  })

  it('relationships: retitled, kept when the library lost one, removed by the user, added', async () => {
    type Line = { id: string; title?: string; controlPoints?: unknown }
    const shown = (sheet: { relationships?: unknown }) =>
      ((sheet.relationships as Line[] | undefined) ?? []).find((line) => line.id === IDS.relShown)

    const retitled = await edit((data) => {
      data.arrows![0]!.label = 'renamed line'
    })
    expect(shown(retitled.document.sheets[0]!)!.title).toBe('renamed line')
    // the curve was not touched, so its shape stays
    expect(shown(retitled.document.sheets[0]!)!.controlPoints).toBeDefined()

    const lost = await edit((data) => {
      data.arrows = []
    })
    expect(shown(lost.document.sheets[0]!)).toBeDefined()

    const removed = await edit(
      (data) => {
        data.arrows = []
      },
      { removedRelationships: new Set([IDS.relShown]) },
    )
    expect(shown(removed.document.sheets[0]!)).toBeUndefined()
    // the line the editor never showed is still there
    expect(removed.document.sheets[0]!.relationships).toHaveLength(1)

    const added = await edit((data) => {
      data.arrows!.push({
        id: '13131313-1313-4313-8313-131313131313',
        label: '',
        from: IDS.b,
        to: IDS.c,
      })
    })
    expect(added.document.sheets[0]!.relationships).toHaveLength(3)
  })

  it('a picked layout is written, an untouched stand-in is not', async () => {
    const picked = await edit(
      (data) => {
        data.direction = 1
      },
      { layoutPicked: true },
    )
    expect(picked.root.structureClass).toBe('org.xmind.ui.logic.right')

    const same = await edit(() => {})
    expect(same.root.structureClass).toBe(FISHBONE)
    expect(same.result.changed).toBe(false)
  })

  it('a picked tree or timeline is written as the class of the format', async () => {
    const tree = await edit(
      (data) => {
        data.direction = 1
      },
      { layoutPicked: true, structure: 'tree' },
    )
    expect(tree.root.structureClass).toBe('org.xmind.ui.tree.right')
    expect(tree.result.view).toMatchObject({ layout: 'tree', layoutExact: true })

    const timeline = await edit(
      (data) => {
        data.direction = 3
      },
      { layoutPicked: true, structure: 'timeline' },
    )
    expect(timeline.root.structureClass).toBe('org.xmind.ui.timeline.horizontal')
  })

  it('an opened tree or timeline reconciles to "nothing changed"', async () => {
    for (const structureClass of ['org.xmind.ui.tree.right', 'org.xmind.ui.timeline.horizontal']) {
      const sheet = richSheet()
      sheet.rootTopic.structureClass = structureClass
      const document = await documentOf(sheet)
      const view = sheetToView(document.sheets[0]!, 0)
      expect(view.layoutExact, structureClass).toBe(true)
      const state = mindToState(roundTrip(viewToMind(view)), base(view))
      expect(state.layout, structureClass).toBe(view.layout)
      expect(reconcileSheet(document, 0, state), structureClass).toMatchObject({
        ok: true,
        changed: false,
      })
    }
  })

  it('a deleted branch takes its relationship with it without a refusal', async () => {
    const { result, document } = await edit((data) => {
      data.nodeData.children = data.nodeData.children!.filter((child) => child.id !== IDS.c)
    })
    expect(result).toMatchObject({ ok: true, inSync: true })
    // only the line the editor never showed is left: it ended on the deleted branch too, so it went as well
    expect(document.sheets[0]!).not.toHaveProperty('relationships')
  })
})

describe('nodes from the clipboard', () => {
  it('keeps the text and the editable values, drops everything that could draw HTML or load something', () => {
    const pasted = {
      id: 'x',
      topic: '<img src=x onerror=alert(1)>',
      dangerouslySetInnerHTML: '<img src=x onerror=alert(1)>',
      hyperLink: 'javascript:alert(1)',
      image: { url: 'https://example.com/tracker.png', width: 1, height: 1 },
      icons: ['<b>x</b>'],
      style: { background: 'url(https://example.com/x)' },
      tags: [{ text: 'forged', className: 'mm-chip mm-chip-link' }],
      metadata: {
        labels: ['ok', 5],
        note: 7,
        link: 'xmind:#topic',
        image: { src: 'x' },
        width: '9999px',
      },
      children: [
        { id: 'y', topic: 42, dangerouslySetInnerHTML: '<b>x</b>', metadata: { width: 180 } },
      ],
    }
    cleanPastedNode(pasted)
    expect(pasted).toEqual({
      id: 'x',
      topic: '<img src=x onerror=alert(1)>',
      tags: ['ok'],
      metadata: {
        labels: ['ok'],
        note: null,
        link: null,
        image: null,
        width: null,
        markers: [],
        style: {},
        titleRuns: null,
      },
      children: [
        {
          id: 'y',
          topic: '42',
          // the width of a copied box comes along: it is a number the file can hold
          metadata: {
            labels: [],
            note: null,
            link: null,
            image: null,
            width: 180,
            markers: [],
            style: {},
            titleRuns: null,
          },
        },
      ],
    })
  })

  it('keeps a text format the engine would write, and nothing else of the style', () => {
    const pasted = {
      id: 'x',
      topic: 'Bold part',
      metadata: {
        style: {
          fontWeight: '700',
          fontStyle: 'italic',
          textDecoration: 'underline',
          color: 'red; background: url(x)',
          fontFamily: 'Font", serif',
          fill: '#ff0000',
          textAlign: 'center',
        },
        titleRuns: [
          { text: 'Bold', style: { fontWeight: '700', color: 'url(x)' } },
          { text: ' part', style: {} },
        ],
      },
    }
    cleanPastedNode(pasted)
    expect((pasted.metadata as { style: unknown }).style).toEqual({
      fontWeight: '700',
      fontStyle: 'italic',
      textDecoration: 'underline',
      textAlign: 'center',
    })
    expect((pasted.metadata as { titleRuns: unknown }).titleRuns).toEqual([
      { text: 'Bold', style: { fontWeight: '700' } },
      { text: ' part', style: {} },
    ])
  })

  it('drops parts that do not spell the pasted title', () => {
    const pasted = {
      id: 'x',
      topic: 'Another title',
      metadata: { titleRuns: [{ text: 'Old', style: { fontWeight: '700' } }] },
    }
    cleanPastedNode(pasted)
    expect((pasted.metadata as { titleRuns: unknown }).titleRuns).toBeNull()
  })
})

describe('the line values of a topic', () => {
  const lined = () => {
    const sheet = plainSheet()
    const one = sheet.rootTopic.children!.attached![0]!
    one.style = {
      id: 'kept-style-id',
      properties: {
        'line-class': 'org.xmind.branchConnection.fold',
        'line-width': 'thick',
        'line-color': '#FF0000',
        'line-pattern': 'dash',
        'svg:fill': '#00ff00',
      },
    }
    return { sheet, id: one.id }
  }

  it('are carried into the metadata as the file holds them, and back into the state', async () => {
    const { sheet, id } = lined()
    const document = await documentOf(sheet)
    const view = sheetToView(document.sheets[0]!, 0)
    const data = viewToMind(view)
    const line = {
      shape: 'org.xmind.branchConnection.fold',
      width: 'thick',
      color: '#FF0000',
      pattern: 'dash',
    }
    expect(find(data.nodeData, id).metadata!.line).toEqual(line)
    // a topic without line values carries none
    expect(data.nodeData.metadata).not.toHaveProperty('line')
    const state = mindToState(roundTrip(data), base(view))
    expect(state.root.children[0]!.line).toEqual(line)
    expect(state.root.line).toEqual({})
  })

  it('a map with line values that was only opened reconciles to "nothing changed"', async () => {
    const { sheet } = lined()
    const document = await documentOf(sheet)
    const before = copyOf(document.sheets)
    const view = sheetToView(document.sheets[0]!, 0)
    const result = reconcileSheet(document, 0, mindToState(roundTrip(viewToMind(view)), base(view)))
    expect(result).toMatchObject({ ok: true, changed: false, inSync: true })
    expect(document.sheets).toEqual(before)
  })

  it("the line values the screen lost stay the file's: not written, and the screen drawn again", async () => {
    const { sheet, id } = lined()
    const document = await documentOf(sheet)
    const before = copyOf(document.sheets)
    const view = sheetToView(document.sheets[0]!, 0)
    const data = roundTrip(viewToMind(view))
    delete (find(data.nodeData, id).metadata as { line?: unknown }).line
    const result = reconcileSheet(document, 0, mindToState(data, base(view)))
    expect(result).toMatchObject({ ok: true, changed: false, inSync: false })
    expect(document.sheets).toEqual(before)
  })

  it('a pasted node keeps the line values the engine would write, and nothing else of them', () => {
    const pasted = {
      id: 'x',
      topic: 'Pasted',
      metadata: {
        line: {
          shape: 'org.xmind.branchConnection.straight',
          width: '3pt',
          color: '#ff0000; background: url(x)',
          pattern: 'wavy',
          extra: 'dropped',
        },
      },
      children: [
        {
          id: 'y',
          topic: 'Below',
          metadata: { line: { shape: 'org.xmind.branchConnection.fold' } },
        },
      ],
    }
    cleanPastedNode(pasted)
    expect((pasted.metadata as { line?: unknown }).line).toEqual({
      shape: 'org.xmind.branchConnection.straight',
      width: '3pt',
    })
    expect(pasted.children[0]!.metadata).not.toHaveProperty('line')
  })
})
