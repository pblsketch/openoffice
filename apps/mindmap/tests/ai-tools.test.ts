/**
 * The AI's tools against the real editor: a real session and real
 * controllers (the drawing library in jsdom), so every AI edit goes the way a
 * user's edit goes, through the controller, reconciling and the history.
 * No model is involved; the tools are called the way the agent loop calls them.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentToolCall } from '@genoffice/agent-core'
import type { XmindSheet, XmindTopic } from '@genoffice/xmind-engine'
import { DocumentSession } from '../src/renderer/document/session'
import { newMap } from '../src/renderer/document/open'
import { MapController } from '../src/renderer/map/controller'
import { mapStrings } from '../src/renderer/i18n/map-strings'
import {
  EDIT_BATCH_LIMIT,
  type MapAiHost,
  MapTurn,
  readMap,
  readTopic,
  editMap,
  writeMap,
  revertTurn,
  blankNewMapSheet,
  setTopicImage,
} from '../src/renderer/ai/map-tools'
import { createMindmapSkill, IMAGE_GEN_OFF_NOTE } from '../src/renderer/ai/mindmap-skill'
import {
  copyOf,
  documentOf,
  FORMAT_IDS,
  IDS,
  lineFormatSheet,
  plainSheet,
  richSheet,
  topic,
} from './helpers/fixtures'

const mounted: MapController[] = []
afterEach(() => {
  mounted.splice(0).forEach((controller) => controller.destroy())
  document.body.innerHTML = ''
})

interface Rig {
  session: DocumentSession
  host: MapAiHost
  controller(key?: string): MapController
  /** the key of sheet n (from 1) */
  key(n: number): string
  /** the source tree of sheet n (from 1) */
  sheet(n: number): XmindSheet
  els: Map<string, HTMLDivElement>
}

function rig(session: DocumentSession, untitled = false): Rig {
  const controllers = new Map<string, MapController>()
  const els = new Map<string, HTMLDivElement>()
  let active = session.tabs()[0]!.key
  const make = (key: string): MapController => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    els.set(key, el)
    const made = new MapController({
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
    mounted.push(made)
    controllers.set(key, made)
    return made
  }
  make(active)
  const host: MapAiHost = {
    session: () => session,
    activeSheetKey: () => active,
    controllerOf: (key) => controllers.get(key) ?? null,
    showSheet: (key) => {
      if (session.indexOf(key) < 0) return
      active = key
      if (!controllers.has(key)) make(key)
    },
    flush: () =>
      controllers.forEach((each, key) => {
        if (session.indexOf(key) < 0) return
        each.commitEdit()
        each.flush()
      }),
    isUntitled: () => untitled,
    newSheetNames: (n) => ({ title: `Sheet ${n}`, rootTitle: 'Central Topic' }),
  }
  return {
    session,
    host,
    els,
    controller: (key = active) => controllers.get(key)!,
    key: (n) => session.tabs()[n - 1]!.key,
    sheet: (n) => session.sheet(session.tabs()[n - 1]!.key),
  }
}

async function rigOf(...sheets: XmindSheet[]): Promise<Rig> {
  return rig(new DocumentSession(await documentOf(...sheets)))
}

const attached = (topicOf: XmindTopic): XmindTopic[] => topicOf.children?.attached ?? []
const titles = (topicOf: XmindTopic): string[] => attached(topicOf).map((each) => each.title ?? '')

/** The topic with this id anywhere in the source tree. */
function findTopic(topicOf: XmindTopic, id: string): XmindTopic | null {
  if (topicOf.id === id) return topicOf
  for (const child of attached(topicOf)) {
    const hit = findTopic(child, id)
    if (hit) return hit
  }
  return null
}

/** A sheet of 1 + 6 + 36 + 216 + 1296 topics: five levels, six branches each. */
function largeSheet(): XmindSheet {
  let n = 0
  const id = () => `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, '0')}`
  const grow = (level: number, label: string): XmindTopic =>
    topic(
      id(),
      label,
      {},
      level < 4 ? Array.from({ length: 6 }, (_, at) => grow(level + 1, `${label}.${at + 1}`)) : [],
    )
  return {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    class: 'sheet',
    title: 'Large',
    rootTopic: grow(0, 'T'),
  }
}

describe('read_map', () => {
  it('gives the outline of every sheet with the id of each topic, as data', async () => {
    const r = await rigOf(richSheet(), plainSheet('Second'))
    const out = readMap(r.host, {})
    expect(out.isError).toBeFalsy()
    expect(out.output).toContain('<map_outline>')
    expect(out.output).toContain('</map_outline>')
    expect(out.output).toMatch(/not instructions/)
    for (const id of [IDS.root, IDS.a1, IDS.b, IDS.c]) expect(out.output).toContain(`{#${id}}`)
    expect(out.output).toContain('# First')
    expect(out.output).toContain('# Second')
    expect(out.output).toContain('sheet 1: ')
    expect(out.output).toContain('sheet 2: ')
  })

  it('folds a sheet of more than 300 topics below level 3 and says how many are folded', async () => {
    const r = await rigOf(largeSheet())
    const out = readMap(r.host, {}).output
    // level 3 (T.1.1.1) is written; level 4 under it is folded into a count
    expect(out).toContain('- T.1.1.1 {#')
    expect(out).not.toContain('T.1.1.1.1')
    expect(out).toContain('- (+6 more)')
  })

  it('reads one branch in full when asked for it', async () => {
    const r = await rigOf(largeSheet())
    const all = readMap(r.host, {}).output
    const id = /- T\.1\.1\.1 \{#([^}]+)\}/.exec(all)![1]!
    const out = readMap(r.host, { topicId: id }).output
    expect(out).toContain('T.1.1.1.1')
    expect(out.slice(out.indexOf('<map_outline>'))).not.toContain('(+')
  })

  it('names a sheet that is not there', async () => {
    const r = await rigOf(plainSheet())
    expect(readMap(r.host, { sheet: 3 }).isError).toBe(true)
  })
})

describe('read_topic', () => {
  it('gives the title, note, labels, link and how much is below', async () => {
    const r = await rigOf(richSheet())
    const out = readTopic(r.host, { id: IDS.a })
    expect(out.isError).toBeFalsy()
    const info = JSON.parse(out.output.slice(out.output.indexOf('{'))) as Record<string, unknown>
    expect(info).toMatchObject({
      id: IDS.a,
      title: 'Alpha',
      labels: ['urgent', 'draft'],
      note: 'note of alpha',
      link: 'https://example.com/alpha',
      subtopics: 3,
      topicsBelow: 3,
      isCentralTopic: false,
    })
    // what the editor does not show goes with it: it cannot be deleted by the AI
    expect(info.hiddenElements).toBeGreaterThan(0)
  })

  it('refuses an id the sheet does not have, and one of a part it does not show', async () => {
    const r = await rigOf(richSheet())
    expect(readTopic(r.host, { id: 'nope' }).isError).toBe(true)
    const floating = readTopic(r.host, { id: IDS.floating })
    expect(floating.isError).toBe(true)
    expect(floating.output).toMatch(/is not a branch/)
  })
})

describe('edit_map', () => {
  it('checks each edit on its own: invalid ones fail with a reason, the rest apply', async () => {
    const r = await rigOf(richSheet())
    const out = await editMap(
      r.host,
      {
        edits: [
          { op: 'add', parentId: IDS.c, title: 'New under gamma', ref: 'n1' },
          { op: 'add', parentId: 'n1', title: 'Below the new one', note: 'a note' },
          { op: 'set_title', id: 'missing-id', title: 'x' },
          { op: 'set_title', id: IDS.a1, title: 'Alpha first' },
          { op: 'set_labels', id: IDS.a2, labels: ['one', ' two ', ''] },
          { op: 'set_link', id: IDS.a3, link: 'https://example.org/' },
          { op: 'set_link', id: IDS.a3, link: `xmind:#${IDS.a}` },
          { op: 'move', id: IDS.b1, parentId: IDS.c },
          { op: 'move', id: IDS.c, parentId: 'n1' },
          { op: 'frobnicate', id: IDS.c },
          { op: 'fold', id: IDS.a },
        ],
      },
      null,
    )
    expect(out.mutated).toBe(true)
    expect(out.output).toContain('7 of 11 edit(s) applied')
    expect(out.output).toMatch(/#2 set_title FAILED.*missing-id/)
    expect(out.output).toMatch(/#6 set_link FAILED/)
    expect(out.output).toMatch(/#8 move FAILED.*under itself/)
    expect(out.output).toMatch(/#9 frobnicate FAILED.*unknown op/)

    // in the source tree, reconciled like any edit
    const root = r.sheet(1).rootTopic
    const [a, b, c] = attached(root)
    expect(titles(a!)).toEqual(['Alpha first', 'Alpha two', 'Alpha three'])
    expect(attached(a!)[1]!.labels).toEqual(['one', 'two'])
    expect(attached(a!)[2]!.href).toBe('https://example.org/')
    expect(a!.branch).toBe('folded')
    expect(attached(b!)).toEqual([])
    expect(titles(c!)).toEqual(['New under gamma', 'Beta one'])
    expect(titles(attached(c!)[0]!)).toEqual(['Below the new one'])
  })

  it('is one step of the history: one undo takes the whole batch back', async () => {
    const r = await rigOf(plainSheet())
    const before = copyOf(r.sheet(1))
    await editMap(
      r.host,
      {
        edits: [
          { op: 'add', parentId: before.rootTopic.id, title: 'Three' },
          { op: 'set_title', id: attached(before.rootTopic)[0]!.id, title: 'Uno' },
        ],
      },
      null,
    )
    expect(titles(r.sheet(1).rootTopic)).toEqual(['Uno', 'Two', 'Three'])
    expect(r.controller().canUndo).toBe(true)
    r.controller().undo()
    expect(copyOf(r.sheet(1))).toEqual(before)
    expect(r.controller().canUndo).toBe(false)
  })

  it('set_format gives whole topics a text format, checked key by key, and read_topic reports it', async () => {
    const r = await rigOf(plainSheet())
    const [one, two] = attached(r.sheet(1).rootTopic)
    const out = await editMap(
      r.host,
      {
        edits: [
          {
            op: 'set_format',
            id: one!.id,
            bold: false,
            italic: true,
            strike: true,
            color: '#112233',
            size: 18,
            font: 'Noto Sans KR',
            align: 'left',
            case: 'uppercase',
          },
          { op: 'set_format', id: two!.id, color: 'red' },
          { op: 'set_format', id: two!.id, font: 'A", serif' },
          { op: 'set_format', id: two!.id, size: 400 },
          { op: 'set_format', id: two!.id, align: 'justify' },
          { op: 'set_format', id: two!.id },
          { op: 'set_format', id: two!.id, underline: 'yes' },
        ],
      },
      null,
    )
    expect(out.output).toContain('1 of 7 edit(s) applied')
    expect(out.output).toMatch(/#1 set_format FAILED.*#rrggbb/)
    expect(out.output).toMatch(/#2 set_format FAILED.*one font name/)
    expect(out.output).toMatch(/#3 set_format FAILED.*points/)
    expect(out.output).toMatch(/#4 set_format FAILED.*align/)
    expect(out.output).toMatch(/#5 set_format FAILED.*at least one/)
    expect(out.output).toMatch(/#6 set_format FAILED.*true or false/)
    // a main topic of the default theme is drawn bold: not bold is a weight of its own
    expect(findTopic(r.sheet(1).rootTopic, one!.id)!.style).toEqual({
      id: expect.any(String),
      properties: {
        'fo:font-weight': '400',
        'fo:font-style': 'italic',
        'fo:text-decoration': 'line-through',
        'fo:color': '#112233',
        'fo:font-size': '18pt',
        'fo:font-family': 'Noto Sans KR',
        'fo:text-align': 'left',
        'fo:text-transform': 'uppercase',
      },
    })
    expect(findTopic(r.sheet(1).rootTopic, two!.id)!.style).toBeUndefined()
    const read = readTopic(r.host, { id: one!.id })
    const info = JSON.parse(read.output.slice(read.output.indexOf('{'))) as { format: unknown }
    expect(info.format).toEqual({
      bold: false,
      italic: true,
      underline: false,
      strike: true,
      color: '#112233',
      size: 18,
      font: 'Noto Sans KR',
      align: 'left',
      case: 'uppercase',
    })

    // clear puts the theme's look back, and the batch is one step to undo
    await editMap(r.host, { edits: [{ op: 'set_format', id: one!.id, clear: true }] }, null)
    expect(findTopic(r.sheet(1).rootTopic, one!.id)!.style).toBeUndefined()
    r.controller().undo()
    expect(findTopic(r.sheet(1).rootTopic, one!.id)!.style).toMatchObject({
      properties: { 'fo:color': '#112233' },
    })
  })

  it(`refuses a batch of more than ${EDIT_BATCH_LIMIT} edits whole`, async () => {
    const r = await rigOf(plainSheet())
    const before = copyOf(r.sheet(1))
    const edits = Array.from({ length: EDIT_BATCH_LIMIT + 1 }, (_, n) => ({
      op: 'add',
      parentId: before.rootTopic.id,
      title: `T${n}`,
    }))
    const out = await editMap(r.host, { edits }, null)
    expect(out.isError).toBe(true)
    expect(out.mutated).toBeFalsy()
    expect(out.output).toMatch(/at most 50/)
    expect(copyOf(r.sheet(1))).toEqual(before)
    expect(r.controller().canUndo).toBe(false)

    const fifty = await editMap(r.host, { edits: edits.slice(0, EDIT_BATCH_LIMIT) }, null)
    expect(fifty.output).toContain(`${EDIT_BATCH_LIMIT} of ${EDIT_BATCH_LIMIT} edit(s) applied`)
  })

  it('does not delete a topic that carries elements the editor does not show, and says why', async () => {
    const r = await rigOf(richSheet())
    const out = await editMap(
      r.host,
      {
        edits: [
          { op: 'delete', id: IDS.a },
          { op: 'delete', id: IDS.b1 },
        ],
      },
      null,
    )
    expect(out.output).toMatch(
      /#0 delete FAILED \(id [^)]+\): this topic carries \d+ element\(s\) only the user may delete/,
    )
    expect(out.output).toMatch(/the user has to delete it themselves/)
    expect(out.output).toMatch(/#1 delete ok/)
    const [a, b] = attached(r.sheet(1).rootTopic)
    expect(a!.id).toBe(IDS.a)
    expect(a!.children?.callout).toHaveLength(1)
    expect(attached(b!)).toEqual([])
  })

  it('does not delete a topic whose boundary is drawn on the map either', async () => {
    const sheet = plainSheet()
    const one = attached(sheet.rootTopic)[0]!
    one.children = { attached: [topic('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'Below one')] }
    Object.assign(one, { boundaries: [{ id: 'drawn', range: '(0,0)', title: 'on screen' }] })
    const r = await rigOf(sheet)
    // the boundary is drawn: the open notice does not count it, the guard does
    expect(r.session.preservedTotal()).toBe(0)
    const read = readTopic(r.host, { id: one.id }).output
    expect(JSON.parse(read.slice(read.indexOf('{'))).hiddenElements).toBe(1)
    const out = await editMap(r.host, { edits: [{ op: 'delete', id: one.id }] }, null)
    expect(out.output).toMatch(/#0 delete FAILED .*only the user may delete/)
    expect(attached(r.sheet(1).rootTopic).map((each) => each.id)).toContain(one.id)
  })

  it('counts what a topic moved in below another would take when that one is deleted', async () => {
    const r = await rigOf(richSheet())
    const out = await editMap(
      r.host,
      {
        edits: [
          { op: 'move', id: IDS.a, parentId: IDS.c },
          { op: 'delete', id: IDS.c },
        ],
      },
      null,
    )
    expect(out.output).toMatch(/#1 delete FAILED/)
    expect(attached(r.sheet(1).rootTopic).map((each) => each.id)).toContain(IDS.c)
  })

  it('has no way to delete a sheet', async () => {
    const r = await rigOf(plainSheet(), plainSheet('Other'))
    const out = await editMap(r.host, { edits: [{ op: 'delete_sheet', id: r.key(2) }] }, null)
    expect(out.isError).toBe(true)
    expect(out.output).toMatch(/unknown op "delete_sheet"/)
    expect(r.session.tabs()).toHaveLength(2)
  })

  it('never deletes or moves the central topic', async () => {
    const r = await rigOf(plainSheet())
    const root = r.sheet(1).rootTopic.id
    const out = await editMap(
      r.host,
      {
        edits: [
          { op: 'delete', id: root },
          { op: 'move', id: root, parentId: attached(r.sheet(1).rootTopic)[0]!.id },
        ],
      },
      null,
    )
    expect(out.isError).toBe(true)
    expect(out.output).toMatch(/central topic cannot be deleted/)
    expect(out.output).toMatch(/central topic cannot be moved/)
  })

  it('keeps text that looks like markup as text', async () => {
    const r = await rigOf(plainSheet())
    const evil = '<img src=x onerror="window.__hit=1"><b>bold</b>'
    await editMap(
      r.host,
      {
        edits: [
          { op: 'add', parentId: r.sheet(1).rootTopic.id, title: evil, labels: ['<i>x</i>'] },
        ],
      },
      null,
    )
    const el = r.els.get(r.key(1))!
    expect(el.querySelector('img')).toBeNull()
    expect(el.querySelector('b')).toBeNull()
    expect(el.textContent).toContain(evil)
    expect(attached(r.sheet(1).rootTopic).at(-1)!.title).toBe(evil)
    expect((window as { __hit?: number }).__hit).toBeUndefined()
  })
})

describe('line format and relationships', () => {
  const F = FORMAT_IDS
  const CLASS = 'org.xmind.branchConnection.'

  /** The style properties of a topic of the source tree, attached branches only. */
  const props = (r: Rig, id: string): Record<string, unknown> =>
    ((findTopic(r.sheet(1).rootTopic, id)?.style as { properties?: object } | undefined)
      ?.properties ?? {}) as Record<string, unknown>
  const relationship = (r: Rig, id: string): Record<string, unknown> | undefined =>
    (r.sheet(1).relationships as Record<string, unknown>[]).find((line) => line.id === id)
  const record = (r: Rig, topicId: string, list: 'summaries' | 'boundaries', id: string) =>
    (findTopic(r.sheet(1).rootTopic, topicId)![list] as Record<string, unknown>[]).find(
      (entry) => entry.id === id,
    )!
  const styleOf = (value: Record<string, unknown> | undefined): Record<string, unknown> =>
    ((value?.style as { properties?: object } | undefined)?.properties ?? {}) as Record<
      string,
      unknown
    >

  async function linesRig(): Promise<{ r: Rig; original: Uint8Array }> {
    const doc = await documentOf(lineFormatSheet())
    const original = await doc.save()
    return { r: rig(new DocumentSession(doc)), original }
  }

  it('read_map names drawn relationships, summaries and boundaries with their format; the outline without ids is as before', async () => {
    const { r } = await linesRig()
    const out = readMap(r.host, {}).output
    expect(out).toContain(
      `(relationship) {#${F.styledLine}} Right B {#${F.rightB}} -> Left {#${F.left}}: styled [shape=curved, begin=dot, end=triangle, color=#cc3300, width=3, pattern=solid]`,
    )
    // a relationship without a title is listed too
    expect(out).toContain(
      `(relationship) {#${F.straightLine}} Right A {#${F.rightA}} -> Folded {#${F.folded}} [shape=straight]`,
    )
    expect(out).toContain(
      `(summary) Both {#${F.summaryTopic}} [over {#${F.rightA}}..{#${F.rightB}}, shape=curly]`,
    )
    expect(out).toContain(
      `(boundary) {#${F.around}} \\<b>around\\</b> [around {#${F.rightA}}..{#${F.rightB}}, shape=waves, color=#336699, width=2, pattern=dash, fill=#eeddcc]`,
    )
    expect(out).toContain(`(boundary) {#${F.master}} everything [around {#${F.root}}]`)
    // a boundary under a folded branch is drawn when the branch opens: it is listed
    expect(out).toContain(`(boundary) {#${F.underFold}} unseen [around {#${F.foldedA}}..`)
    expect(out).toMatch(/can change their format/)
    // what the file export and the MCP read is the outline without ids, as it was
    const plain = r.session.outline()
    expect(plain).not.toMatch(/\{#|\[around|\[over|shape=/)
    expect(plain).toContain('- (relationship) styled -> Left')

    // what the editor does not draw is not listed, not even with its title
    const rich = await rigOf(richSheet())
    const richOut = readMap(rich.host, {}).output
    expect(richOut).not.toContain(IDS.relHidden)
    expect(richOut).not.toContain('hidden line')
    expect(richOut).toContain(`(boundary) {#${IDS.boundary}} group [around {#${IDS.a1}}..`)
  })

  it('read_map of one branch lists the relationships that start in it', async () => {
    const { r } = await linesRig()
    const out = readMap(r.host, { topicId: F.right }).output
    expect(out).toContain(`(relationship) {#${F.plainLine}} Right A {#${F.rightA}} -> Left`)
    expect(out).not.toContain(F.master)
  })

  it('read_topic reports the line format set on the topic itself', async () => {
    const { r } = await linesRig()
    await editMap(
      r.host,
      { edits: [{ op: 'set_line', id: F.right, shape: 'elbow', width: 3, pattern: 'dash' }] },
      null,
    )
    const out = readTopic(r.host, { id: F.rightA })
    const info = JSON.parse(out.output.slice(out.output.indexOf('{'))) as { line: unknown }
    expect(info.line).toEqual({ shape: 'elbow', width: 3, pattern: 'dash' })
    const left = readTopic(r.host, { id: F.left })
    expect(
      (JSON.parse(left.output.slice(left.output.indexOf('{'))) as { line: unknown }).line,
    ).toEqual({})
  })

  it('set_line puts the line on the topic and its whole branch, checked value by value', async () => {
    const { r } = await linesRig()
    const out = await editMap(
      r.host,
      {
        edits: [
          {
            op: 'set_line',
            id: F.right,
            shape: 'roundedElbow',
            width: 4,
            color: '#112233',
            pattern: 'dash-dot',
          },
          { op: 'set_line', id: F.left, shape: 'fold' },
          { op: 'set_line', id: F.left, width: 2.5 },
          { op: 'set_line', id: F.left, width: 21 },
          { op: 'set_line', id: F.left, color: 'red' },
          { op: 'set_line', id: F.left, pattern: 'dotted' },
          { op: 'set_line', id: F.left },
          { op: 'set_line', id: F.left, fill: '#ffffff' },
          { op: 'set_line', id: 'no-such-topic', width: 2 },
        ],
      },
      null,
    )
    expect(out.output).toContain('1 of 9 edit(s) applied')
    expect(out.output).toMatch(
      /#1 set_line FAILED.*shape must be one of curve, straight, elbow, roundedElbow, arrowedCurve, none/,
    )
    expect(out.output).toMatch(/#2 set_line FAILED.*whole points from 1 to 20/)
    expect(out.output).toMatch(/#3 set_line FAILED.*whole points from 1 to 20/)
    expect(out.output).toMatch(/#4 set_line FAILED.*#rrggbb/)
    expect(out.output).toMatch(
      /#5 set_line FAILED.*pattern must be one of solid, dash, dot, dash-dot, dash-dot-dot, round-dot/,
    )
    expect(out.output).toMatch(/#6 set_line FAILED.*at least one/)
    expect(out.output).toMatch(/#7 set_line FAILED.*does not take fill/)
    expect(out.output).toMatch(/#8 set_line FAILED.*no-such-topic/)
    const line = {
      'line-class': `${CLASS}roundedElbow`,
      'line-width': '4pt',
      'line-color': '#112233',
      'line-pattern': 'dash-dot',
    }
    for (const id of [F.right, F.rightA, F.rightB]) expect(props(r, id)).toMatchObject(line)
    expect(props(r, F.left)).toEqual({})

    // clear takes the keys off the whole branch again; then a value set with it stays
    await editMap(
      r.host,
      { edits: [{ op: 'set_line', id: F.right, clear: true, color: '#445566' }] },
      null,
    )
    for (const id of [F.right, F.rightA, F.rightB]) {
      expect(props(r, id)).toEqual({ 'line-color': '#445566' })
    }
  })

  it('set_line on the central topic changes every line of the map', async () => {
    const { r } = await linesRig()
    await editMap(r.host, { edits: [{ op: 'set_line', id: F.root, width: 2 }] }, null)
    for (const id of [F.root, F.right, F.rightA, F.folded, F.foldedA, F.left]) {
      expect(props(r, id)['line-width']).toBe('2pt')
    }
  })

  it('set_relationship_style changes a drawn relationship, and clear takes its values off', async () => {
    const { r } = await linesRig()
    const rich = await rigOf(richSheet())
    const out = await editMap(
      r.host,
      {
        edits: [
          {
            op: 'set_relationship_style',
            id: F.plainLine,
            shape: 'zigzag',
            begin: 'dot',
            end: 'diamond',
            color: '#00AA00',
            width: 2,
            pattern: 'dot',
          },
          { op: 'set_relationship_style', id: F.styledLine, clear: true },
          { op: 'set_relationship_style', id: F.plainLine, begin: 'ring' },
          { op: 'set_relationship_style', id: F.plainLine, shape: 'curve' },
          { op: 'set_relationship_style', id: F.plainLine, fill: 'none' },
          { op: 'set_relationship_style', id: F.rightA, width: 2 },
        ],
      },
      null,
    )
    expect(out.output).toContain('2 of 6 edit(s) applied')
    expect(out.output).toMatch(
      /#2 set_relationship_style FAILED.*begin must be one of none, normal/,
    )
    expect(out.output).toMatch(/#3 set_relationship_style FAILED.*curved, straight, angled, zigzag/)
    expect(out.output).toMatch(/#4 set_relationship_style FAILED.*does not take fill/)
    expect(out.output).toMatch(/#5 set_relationship_style FAILED.*no relationship/)
    expect(styleOf(relationship(r, F.plainLine))).toEqual({
      'shape-class': 'org.xmind.relationshipShape.zigzag',
      'arrow-begin-class': 'org.xmind.arrowShape.dot',
      'arrow-end-class': 'org.xmind.arrowShape.diamond',
      'line-color': '#00aa00',
      'line-width': '2pt',
      'line-pattern': 'dot',
    })
    const styled = relationship(r, F.styledLine)!
    expect(styleOf(styled)).toEqual({})
    // its curve is not a value: it stays
    expect(styled.controlPoints).toEqual({ '0': { x: 40, y: -30 }, '1': { x: -50, y: 25 } })

    // one the editor does not draw cannot be changed
    const hidden = await editMap(
      rich.host,
      { edits: [{ op: 'set_relationship_style', id: IDS.relHidden, color: '#000000' }] },
      null,
    )
    expect(hidden.isError).toBe(true)
    expect(hidden.output).toMatch(/no relationship/)
    expect(relationship(rich, IDS.relHidden)!.style).toBeUndefined()
  })

  it('set_summary_style changes the bracket of a summary, named by its summary topic', async () => {
    const { r } = await linesRig()
    const out = await editMap(
      r.host,
      {
        edits: [
          { op: 'set_summary_style', id: F.summaryTopic, shape: 'square' },
          { op: 'set_summary_style', id: F.summaryTopic, shape: 'brace' },
          { op: 'set_summary_style', id: F.summaryRecord, shape: 'round' },
          { op: 'set_summary_style', id: F.summaryTopic, color: '#000000' },
        ],
      },
      null,
    )
    expect(out.output).toContain('1 of 4 edit(s) applied')
    expect(out.output).toMatch(/#1 set_summary_style FAILED.*curly, angle, square/)
    expect(out.output).toMatch(/#2 set_summary_style FAILED.*no summary/)
    expect(out.output).toMatch(/#3 set_summary_style FAILED.*does not take color/)
    expect(styleOf(record(r, F.right, 'summaries', F.summaryRecord))).toEqual({
      'shape-class': 'org.xmind.summaryShape.square',
    })
    await editMap(
      r.host,
      { edits: [{ op: 'set_summary_style', id: F.summaryTopic, clear: true }] },
      null,
    )
    expect(record(r, F.right, 'summaries', F.summaryRecord).style).toBeUndefined()
  })

  it('set_boundary_style changes a drawn boundary, one under a folded branch too', async () => {
    const { r } = await linesRig()
    const out = await editMap(
      r.host,
      {
        edits: [
          { op: 'set_boundary_style', id: F.around, shape: 'rect', width: 4, fill: 'none' },
          { op: 'set_boundary_style', id: F.master, color: '#FF0000' },
          { op: 'set_boundary_style', id: F.underFold, pattern: 'round-dot', fill: '#abcdef' },
          { op: 'set_boundary_style', id: F.around, fill: 'transparent' },
          { op: 'set_boundary_style', id: F.around, shape: 'cloud' },
          { op: 'set_boundary_style', id: F.around, begin: 'dot' },
          { op: 'set_boundary_style', id: 'no-such-boundary', width: 2 },
        ],
      },
      null,
    )
    expect(out.output).toContain('3 of 7 edit(s) applied')
    expect(out.output).toMatch(/#3 set_boundary_style FAILED.*fill must be/)
    expect(out.output).toMatch(/#4 set_boundary_style FAILED.*rect, roundedRect, scallops/)
    expect(out.output).toMatch(/#5 set_boundary_style FAILED.*does not take begin/)
    expect(out.output).toMatch(/#6 set_boundary_style FAILED.*no boundary/)
    expect(styleOf(record(r, F.right, 'boundaries', F.around))).toEqual({
      'shape-class': 'org.xmind.boundaryShape.rect',
      'line-color': '#336699',
      'line-width': '4pt',
      'line-pattern': 'dash',
      'svg:fill': 'none',
    })
    expect(styleOf(record(r, F.root, 'boundaries', F.master))).toEqual({ 'line-color': '#ff0000' })
    expect(styleOf(record(r, F.folded, 'boundaries', F.underFold))).toEqual({
      'line-pattern': 'round-dot',
      'svg:fill': '#abcdef',
    })
    await editMap(
      r.host,
      { edits: [{ op: 'set_boundary_style', id: F.around, clear: true }] },
      null,
    )
    expect(record(r, F.right, 'boundaries', F.around).style).toBeUndefined()
    expect(record(r, F.right, 'boundaries', F.around).title).toBe('<b>around</b>')
  })

  it('add_relationship joins two topics, unfolding the branch an end is folded in', async () => {
    const { r } = await linesRig()
    expect(findTopic(r.sheet(1).rootTopic, F.folded)!.branch).toBe('folded')
    const out = await editMap(
      r.host,
      {
        edits: [
          {
            op: 'add_relationship',
            fromId: F.rightA,
            toId: F.foldedA,
            title: 'see\nalso',
            ref: 'rel',
          },
          { op: 'set_relationship_style', id: 'rel', end: 'square' },
          { op: 'add', parentId: F.left, title: 'New', ref: 'n' },
          { op: 'add_relationship', fromId: 'n', toId: F.root },
        ],
      },
      null,
    )
    expect(out.output).toContain('4 of 4 edit(s) applied')
    const id = /#0 add_relationship ok \(id ([^)]+)\)/.exec(out.output)![1]!
    const added = relationship(r, id)!
    expect(added).toMatchObject({ end1Id: F.rightA, end2Id: F.foldedA, title: 'see also' })
    expect(styleOf(added)).toEqual({ 'arrow-end-class': 'org.xmind.arrowShape.square' })
    expect(findTopic(r.sheet(1).rootTopic, F.folded)!.branch).toBeUndefined()
    const fresh = attached(findTopic(r.sheet(1).rootTopic, F.left)!)[0]!
    expect(
      (r.sheet(1).relationships as Record<string, unknown>[]).some(
        (line) => line.end1Id === fresh.id && line.end2Id === F.root,
      ),
    ).toBe(true)
    // it is drawn, and read_map lists it
    expect(readMap(r.host, {}).output).toContain(`(relationship) {#${id}} Right A`)
  })

  it('add_relationship refuses ends that are not drawn branches, unknown ids and one topic twice', async () => {
    const rich = await rigOf(richSheet())
    const before = (rich.sheet(1).relationships ?? []).length
    const out = await editMap(
      rich.host,
      {
        edits: [
          { op: 'add_relationship', fromId: IDS.a1, toId: IDS.floating },
          { op: 'add_relationship', fromId: IDS.callout, toId: IDS.c },
          { op: 'add_relationship', fromId: IDS.underSummary, toId: IDS.c },
          { op: 'add_relationship', fromId: IDS.summaryTopic, toId: IDS.c },
          { op: 'add_relationship', fromId: 'nope', toId: IDS.c },
          { op: 'add_relationship', fromId: IDS.c, toId: IDS.c },
          { op: 'add_relationship', fromId: IDS.a1 },
          { op: 'add_relationship', fromId: IDS.a1, toId: IDS.c, title: 3 },
        ],
      },
      null,
    )
    expect(out.isError).toBe(true)
    expect(out.output).toContain('0 of 8 edit(s) applied')
    expect(out.output).toMatch(/#0 add_relationship FAILED.*not a drawn branch/)
    expect(out.output).toMatch(/#1 add_relationship FAILED.*not a drawn branch/)
    expect(out.output).toMatch(/#2 add_relationship FAILED.*not a drawn branch/)
    expect(out.output).toMatch(/#3 add_relationship FAILED.*summary/)
    expect(out.output).toMatch(/#4 add_relationship FAILED.*there is no topic with id "nope"/)
    expect(out.output).toMatch(/#5 add_relationship FAILED.*two different topics/)
    expect(out.output).toMatch(/#6 add_relationship FAILED.*toId/)
    expect(out.output).toMatch(/#7 add_relationship FAILED.*title must be text/)
    expect(rich.sheet(1).relationships).toHaveLength(before)
  })

  it('delete_relationship removes a drawn relationship and nothing else', async () => {
    const { r } = await linesRig()
    const rich = await rigOf(richSheet())
    const out = await editMap(
      r.host,
      {
        edits: [
          { op: 'delete_relationship', id: F.plainLine },
          { op: 'delete_relationship', id: F.plainLine },
          { op: 'delete_relationship', id: F.rightA },
        ],
      },
      null,
    )
    expect(out.output).toContain('1 of 3 edit(s) applied')
    expect(out.output).toMatch(/#1 delete_relationship FAILED.*no relationship/)
    expect(relationship(r, F.plainLine)).toBeUndefined()
    expect(relationship(r, F.styledLine)).toBeDefined()
    expect(findTopic(r.sheet(1).rootTopic, F.rightA)).not.toBeNull()

    const hidden = await editMap(
      rich.host,
      { edits: [{ op: 'delete_relationship', id: IDS.relHidden }] },
      null,
    )
    expect(hidden.isError).toBe(true)
    expect(relationship(rich, IDS.relHidden)).toBeDefined()
  })

  it('has no way to make or delete a boundary, and still does not delete a topic that carries one', async () => {
    const { r } = await linesRig()
    const out = await editMap(
      r.host,
      {
        edits: [
          { op: 'add_boundary', id: F.left },
          { op: 'delete_boundary', id: F.around },
          { op: 'delete', id: F.folded },
          { op: 'delete', id: F.left },
        ],
      },
      null,
    )
    expect(out.output).toMatch(/#0 add_boundary FAILED.*unknown op/)
    expect(out.output).toMatch(/#1 delete_boundary FAILED.*unknown op/)
    expect(out.output).toMatch(/#2 delete FAILED.*1 element\(s\) only the user may delete/)
    expect(out.output).toMatch(/#3 delete ok/)
    expect(findTopic(r.sheet(1).rootTopic, F.folded)).not.toBeNull()
    expect(record(r, F.folded, 'boundaries', F.underFold)).toBeDefined()
  })

  it('a topic the AI adds or moves into a branch takes the line of the branch', async () => {
    const line = {
      'line-class': `${CLASS}elbow`,
      'line-color': '#112233',
    }
    const sheet = plainSheet()
    const [one, two] = attached(sheet.rootTopic)
    one!.style = { id: 'one-style', properties: { ...line } }
    two!.children = {
      attached: [
        topic('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 'Moving', {
          style: { id: 'moving-style', properties: { 'line-width': '5pt' } },
        }),
      ],
    }
    const r = await rigOf(sheet)
    const moving = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
    const out = await editMap(
      r.host,
      {
        edits: [
          { op: 'move', id: moving, parentId: one!.id },
          { op: 'add', parentId: one!.id, title: 'Added' },
          { op: 'add', parentId: one!.id, title: 'Set', ref: 'set' },
          { op: 'set_line', id: 'set', color: '#999999' },
        ],
      },
      null,
    )
    expect(out.output).toContain('4 of 4 edit(s) applied')
    expect(props(r, moving)).toEqual({ ...line, 'line-width': '5pt' })
    const [, added, set] = attached(findTopic(r.sheet(1).rootTopic, one!.id)!)
    expect(added!.style).toMatchObject({ properties: line })
    // a key the same batch set wins over the parent's; the other keys are the parent's
    expect(set!.style).toMatchObject({ properties: { ...line, 'line-color': '#999999' } })

    // moved under a topic without a line of its own, a topic keeps its line
    await editMap(r.host, { edits: [{ op: 'move', id: moving, parentId: two!.id }] }, null)
    expect(props(r, moving)).toEqual({ ...line, 'line-width': '5pt' })
  })

  /** A plain sheet whose branch One carries a blue dashed line, and whose branch Two has a red topic under it. */
  function arrivingSheet(): { sheet: XmindSheet; one: string; two: string; red: string } {
    const sheet = plainSheet()
    const [one, two] = attached(sheet.rootTopic)
    one!.style = {
      id: 'one-style',
      properties: { 'line-color': '#0000ff', 'line-pattern': 'dash' },
    }
    const red = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'
    two!.children = {
      attached: [
        topic(red, 'Red', {
          style: { id: 'red-style', properties: { 'line-color': '#ff0000' } },
        }),
      ],
    }
    return { sheet, one: one!.id, two: two!.id, red }
  }

  it('a key the batch sets on a moved topic wins even when it is the value the topic had', async () => {
    const { sheet, one, red } = arrivingSheet()
    const r = await rigOf(sheet)
    for (const edits of [
      [
        { op: 'move', id: red, parentId: one },
        { op: 'set_line', id: red, color: '#ff0000' },
      ],
      // the order of the batch does not matter
      [
        { op: 'set_line', id: red, color: '#ff0000' },
        { op: 'move', id: red, parentId: one },
      ],
    ]) {
      const out = await editMap(r.host, { edits }, null)
      expect(out.output).toContain('2 of 2 edit(s) applied')
      // the colour set, and the parent's pattern
      expect(props(r, red)).toEqual({ 'line-color': '#ff0000', 'line-pattern': 'dash' })
      expect(r.controller().undo()).toBe(true)
      expect(props(r, red)).toEqual({ 'line-color': '#ff0000' })
    }
  })

  it('a moved topic whose width alone the batch sets takes the parent’s colour and pattern', async () => {
    const { sheet, one, red } = arrivingSheet()
    const r = await rigOf(sheet)
    const out = await editMap(
      r.host,
      {
        edits: [
          { op: 'move', id: red, parentId: one },
          { op: 'set_line', id: red, width: 4 },
        ],
      },
      null,
    )
    expect(out.output).toContain('2 of 2 edit(s) applied')
    expect(props(r, red)).toEqual({
      'line-color': '#0000ff',
      'line-pattern': 'dash',
      'line-width': '4pt',
    })
  })

  it('is one step of the history: one undo gives back the bytes of the file', async () => {
    const { r, original } = await linesRig()
    const out = await editMap(
      r.host,
      {
        edits: [
          { op: 'set_line', id: F.right, width: 3 },
          { op: 'set_relationship_style', id: F.plainLine, shape: 'angled' },
          { op: 'set_summary_style', id: F.summaryTopic, shape: 'fold' },
          { op: 'set_boundary_style', id: F.around, fill: '#123456' },
          { op: 'add_relationship', fromId: F.left, toId: F.foldedA },
          { op: 'delete_relationship', id: F.straightLine },
        ],
      },
      null,
    )
    expect(out.output).toContain('6 of 6 edit(s) applied')
    expect(relationship(r, F.straightLine)).toBeUndefined()
    expect(props(r, F.rightA)['line-width']).toBe('3pt')
    expect(r.controller().undo()).toBe(true)
    expect(r.controller().canUndo).toBe(false)
    expect(Buffer.from(await r.session.document.save()).equals(Buffer.from(original))).toBe(true)
  })
})

describe('write_map', () => {
  const OUTLINE = [
    '# Trip',
    '',
    '- Summer trip',
    '  - Where [idea] <https://example.com/map>',
    '    > by the sea',
    '    - Coast',
    '  - When',
    '',
  ].join('\n')

  it('makes a new sheet and leaves the sheets with content as they were', async () => {
    const r = await rigOf(richSheet())
    const before = copyOf(r.sheet(1))
    const out = await writeMap(r.host, { outline: OUTLINE }, null)
    expect(out.isError).toBeFalsy()
    expect(out.mutated).toBe(true)
    expect(r.session.tabs()).toHaveLength(2)
    expect(copyOf(r.sheet(1))).toEqual(before)
    const written = r.sheet(2)
    expect(written.title).toBe('Trip')
    expect(written.rootTopic.title).toBe('Summer trip')
    const [where, when] = attached(written.rootTopic)
    expect(where!.title).toBe('Where')
    expect(where!.labels).toEqual(['idea'])
    expect(where!.href).toBe('https://example.com/map')
    expect(titles(where!)).toEqual(['Coast'])
    expect(when!.title).toBe('When')
    // the new sheet is the one on screen
    expect(r.host.activeSheetKey()).toBe(r.key(2))
  })

  it('takes read_map output pasted back without its id tags and fold lines', async () => {
    const r = await rigOf(largeSheet())
    const read = readMap(r.host, {}).output
    const outline = read.slice(
      read.indexOf('<map_outline>') + '<map_outline>'.length,
      read.indexOf('</map_outline>'),
    )
    expect(outline).toContain('{#')
    expect(outline).toContain('(+6 more)')
    const out = await writeMap(r.host, { outline }, null)
    expect(out.isError).toBeFalsy()
    const written = r.sheet(2)
    expect(written.rootTopic.title).toBe('T')
    expect(titles(written.rootTopic)).toEqual(['T.1', 'T.2', 'T.3', 'T.4', 'T.5', 'T.6'])
    const deepest = attached(attached(attached(written.rootTopic)[0]!)[0]!)
    expect(deepest.map((each) => each.title)).toEqual(
      ['1', '2', '3', '4', '5', '6'].map((n) => `T.1.1.${n}`),
    )
    expect(deepest.every((each) => attached(each).length === 0)).toBe(true)
    expect(JSON.stringify(written)).not.toMatch(/\{#|more\)/)
  })

  it('takes the ids and format marks of relationships, summaries and boundaries off', async () => {
    const r = await rigOf(lineFormatSheet())
    const read = readMap(r.host, {}).output
    const outline = read.slice(
      read.indexOf('<map_outline>') + '<map_outline>'.length,
      read.indexOf('</map_outline>'),
    )
    expect(outline).toMatch(/\[around \{#/)
    const out = await writeMap(r.host, { outline }, null)
    expect(out.isError).toBeFalsy()
    const written = JSON.stringify(r.sheet(2))
    expect(written).not.toMatch(/\{#|around \{|over \{|shape=|fill=/)
    const right = attached(r.sheet(2).rootTopic)[0]!
    expect(titles(right)).toEqual(['Right A', 'Right B', 'Both', '<b>around</b>'])
    const [rightA, rightB] = attached(right)
    expect(titles(rightA!)).toEqual(['Right A -> Left: plain', 'Right A -> Folded'])
    expect(titles(rightB!)).toEqual(['Right B -> Left: styled'])
  })

  it('fills a blank new map instead of adding a sheet', async () => {
    const r = rig(await newMap({ sheetTitle: 'Sheet 1', rootTitle: 'Central Topic' }), true)
    expect(blankNewMapSheet(r.host)).toBe(r.key(1))
    await writeMap(r.host, { outline: OUTLINE }, null)
    expect(r.session.tabs()).toHaveLength(1)
    expect(r.sheet(1).title).toBe('Trip')
    expect(r.sheet(1).rootTopic.title).toBe('Summer trip')
    expect(titles(r.sheet(1).rootTopic)).toEqual(['Where', 'When'])
  })

  it('does not take a map for blank once it was edited, saved, or has more than its central topic', async () => {
    const edited = rig(await newMap({ sheetTitle: 'Sheet 1', rootTitle: 'Central Topic' }), true)
    edited.controller().setTitle(edited.sheet(1).rootTopic.id, 'Mine')
    expect(blankNewMapSheet(edited.host)).toBeNull()
    await writeMap(edited.host, { outline: OUTLINE }, null)
    expect(edited.session.tabs()).toHaveLength(2)
    expect(edited.sheet(1).rootTopic.title).toBe('Mine')

    const saved = rig(await newMap({ sheetTitle: 'Sheet 1', rootTitle: 'Central Topic' }), false)
    expect(blankNewMapSheet(saved.host)).toBeNull()

    const bare = await rigOf({ ...plainSheet(), rootTopic: topic(IDS.root, 'Only') })
    expect(blankNewMapSheet(bare.host)).toBeNull()
  })
})

describe('one AI turn', () => {
  it('is taken back whole: its edits are undone and the sheets it added are gone', async () => {
    const r = await rigOf(plainSheet(), plainSheet('Other'))
    const first = copyOf(r.sheet(1))
    const turn = new MapTurn()
    await editMap(
      r.host,
      { edits: [{ op: 'add', parentId: first.rootTopic.id, title: 'Added by AI' }] },
      turn,
    )
    await editMap(
      r.host,
      { edits: [{ op: 'set_title', id: attached(first.rootTopic)[1]!.id, title: 'Changed' }] },
      turn,
    )
    await writeMap(r.host, { outline: '# New\n\n- Centre\n  - A\n' }, turn)
    expect(r.session.tabs()).toHaveLength(3)
    expect(turn.changed).toBe(true)

    expect(await revertTurn(r.host, turn)).toBe(true)
    expect(r.session.tabs().map((tab) => tab.title)).toEqual(['Plain', 'Other'])
    expect(copyOf(r.sheet(1))).toEqual(first)
    // the steps are still in the history: redo brings them back
    expect(r.controller(r.key(1)).canRedo).toBe(true)
  })

  it('takes back the filling of a blank new map, name included', async () => {
    const r = rig(await newMap({ sheetTitle: 'Sheet 1', rootTitle: 'Central Topic' }), true)
    const blank = copyOf(r.sheet(1))
    const turn = new MapTurn()
    await writeMap(r.host, { outline: '# Named\n\n- Centre\n  - A\n' }, turn)
    expect(r.sheet(1).title).toBe('Named')
    expect(await revertTurn(r.host, turn)).toBe(true)
    expect(r.session.tabs()).toHaveLength(1)
    expect(copyOf(r.sheet(1))).toEqual(blank)
  })

  it('never deletes a sheet the turn did not add', async () => {
    const r = await rigOf(plainSheet(), plainSheet('Other'))
    const turn = new MapTurn()
    for (const outline of ['# A\n\n- a\n', '# B\n\n- b\n']) {
      await writeMap(r.host, { outline }, turn)
    }
    expect(r.session.tabs()).toHaveLength(4)
    await revertTurn(r.host, turn)
    expect(r.session.tabs().map((tab) => tab.title)).toEqual(['Plain', 'Other'])
  })
})

describe('pictures', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])
  const PNG_BASE64 = btoa(String.fromCharCode(...png))
  afterEach(() => {
    delete (window as unknown as { mindmapApi?: unknown }).mindmapApi
  })

  it('saves the bytes in the map file and puts the reference on the topic as one step', async () => {
    const r = await rigOf(richSheet())
    const turn = new MapTurn()
    const entryBefore = new Set(r.session.document.entryNames)
    const out = await setTopicImage(r.host, { topicId: IDS.a1 }, { bytes: png, ext: 'png' }, turn)
    expect(out.isError).toBeFalsy()
    const entry = r.session.document.entryNames.find((name) => !entryBefore.has(name))
    expect(entry).toMatch(/^resources\/[0-9a-f-]+\.png$/)

    const written = findTopic(r.sheet(1).rootTopic, IDS.a1)!
    expect(written.image).toEqual({ src: `xap:${entry}` })
    expect((await r.session.document.readEntry(entry!))?.byteLength).toBe(png.byteLength)

    // one undo step: the picture reference comes back off, the entry stays (the
    // archive's bytes are not part of the sheet history)
    expect(r.controller().undo()).toBe(true)
    expect(findTopic(r.sheet(1).rootTopic, IDS.a1)!.image).toBeUndefined()
  })

  it('takes the entry back out when the topic does not exist', async () => {
    const r = await rigOf(richSheet())
    const before = [...r.session.document.entryNames]
    const out = await setTopicImage(
      r.host,
      { topicId: '00000000-0000-4000-8000-000000000000' },
      { bytes: png, ext: 'png' },
      null,
    )
    expect(out.isError).toBe(true)
    expect(out.output).toContain('there is no topic')
    expect(r.session.document.entryNames).toEqual(before)
  })

  it('inserts an image attached to the chat, by the name the panel showed', async () => {
    const r = await rigOf(richSheet())
    const bridge = {
      readAttachmentImage: async () => ({ ok: true, base64: PNG_BASE64, mime: 'image/png' }),
    }
    ;(window as unknown as { mindmapApi: unknown }).mindmapApi = bridge
    const skill = createMindmapSkill({
      host: () => r.host,
      turn: () => null,
      attachmentPath: (name) => (name === 'probe.png' ? 'C:/tmp/probe.png' : null),
      attachmentNames: () => ['probe.png'],
    })
    expect(skill.systemPrompt).toContain('probe.png')
    const before = new Set(r.session.document.entryNames)
    const out = await skill.executeTool({
      id: '1',
      name: 'insert_image',
      input: { topicId: IDS.a1, attachment: 'probe.png' },
    } satisfies AgentToolCall)
    expect(out.isError).toBeFalsy()
    const entry = r.session.document.entryNames.find((name) => !before.has(name))
    expect(entry).toMatch(/^resources\/.*\.png$/)
    expect(findTopic(r.sheet(1).rootTopic, IDS.a1)!.image).toEqual({ src: `xap:${entry}` })
  })

  it('offers generate_image only while the main process reports an image route', () => {
    const deps = {
      host: () => ({}) as MapAiHost,
      turn: () => null,
    }
    const off = createMindmapSkill({ ...deps, imageGenAvailable: () => false })
    expect(off.tools.map((tool) => tool.name)).not.toContain('generate_image')
    expect(off.tools.map((tool) => tool.name)).toContain('image_search')
    expect(off.tools.map((tool) => tool.name)).toContain('insert_image')
    expect(off.systemPrompt).toContain(IMAGE_GEN_OFF_NOTE)

    const on = createMindmapSkill({ ...deps, imageGenAvailable: () => true })
    expect(on.tools.map((tool) => tool.name)).toContain('generate_image')
    expect(on.systemPrompt).not.toContain(IMAGE_GEN_OFF_NOTE)
  })
})
