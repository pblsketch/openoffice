/**
 * The ops a shared map sends (collab/ops.ts): an edit is the difference of two
 * views, laid over another view it gives back the second, edits of different
 * topics pass each other, and nothing that is not an op gets read as one.
 */
import { describe, expect, it } from 'vitest'
import { sheetToView, type ViewSheet, type ViewTopic } from '@genoffice/xmind-engine'
import {
  commutes,
  diffSheet,
  type MapOp,
  mergeEdit,
  readOp,
  type SheetEdit,
  showsState,
  touches,
} from '../src/renderer/collab/ops'
import { copyOf, IDS, plainSheet, richSheet } from './helpers/fixtures'

const NEW_A = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
const NEW_B = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'
const NEW_LINE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
const NEW_SUMMARY = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'
const NEW_SUMMARY_TOPIC = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3'

const base = (): ViewSheet => sheetToView(richSheet(), 0)

function find(view: ViewSheet, id: string): ViewTopic {
  const pending = [view.root]
  for (let topic = pending.pop(); topic; topic = pending.pop()) {
    if (topic.id === id) return topic
    pending.push(...topic.children)
  }
  throw new Error(`no topic ${id}`)
}

function edited(view: ViewSheet, change: (copy: ViewSheet) => void): ViewSheet {
  const copy = copyOf(view)
  change(copy)
  return copy
}

const fresh = (id: string, title: string): ViewTopic => ({
  id,
  title,
  folded: false,
  labels: [],
  note: null,
  link: null,
  image: null,
  markers: [],
  style: {},
  summaries: [],
  children: [],
})

function detach(view: ViewSheet, id: string): ViewTopic {
  const pending = [view.root]
  for (let topic = pending.pop(); topic; topic = pending.pop()) {
    const at = topic.children.findIndex((child) => child.id === id)
    if (at >= 0) return topic.children.splice(at, 1)[0]!
    pending.push(...topic.children)
  }
  throw new Error(`no topic ${id}`)
}

/** what a view shows, with relationships in one order */
const shownOf = (view: ViewSheet): ViewSheet => ({
  ...view,
  relationships: [...view.relationships].sort((a, b) => a.id.localeCompare(b.id)),
})

const op = (edit: SheetEdit): MapOp => ({
  kind: 'edit',
  sheet: { id: IDS.sheet, index: 0 },
  edit,
})

const CHANGES: Array<[string, (view: ViewSheet) => void]> = [
  [
    'the values of topics',
    (view) => {
      const one = find(view, IDS.a1)
      one.title = 'Alpha uno'
      one.labels = ['new label']
      one.note = 'a note'
      one.link = 'https://example.com/one'
      find(view, IDS.b).folded = false
    },
  ],
  [
    'a new branch with a branch of its own',
    (view) => {
      const added = fresh(NEW_A, 'New')
      added.children.push(fresh(NEW_B, 'Newer'))
      find(view, IDS.a2).children.push(added)
    },
  ],
  ['a deleted branch', (view) => void detach(view, IDS.b)],
  ['a moved branch', (view) => find(view, IDS.c).children.push(detach(view, IDS.a3))],
  ['branches in another order', (view) => view.root.children.reverse()],
  [
    'relationships added, changed and removed',
    (view) => {
      view.relationships[0]!.title = 'now leads to'
      view.relationships.push({ id: NEW_LINE, fromId: IDS.a3, toId: IDS.b, title: '' })
    },
  ],
  ['a relationship removed', (view) => void view.relationships.splice(0, 1)],
  [
    'summaries retitled, removed and added',
    (view) => {
      const a = find(view, IDS.a)
      a.summaries = []
      view.root.summaries.push({
        id: NEW_SUMMARY,
        topicId: NEW_SUMMARY_TOPIC,
        title: 'All of it',
        start: 0,
        end: 2,
      })
    },
  ],
  ['the layout', (view) => Object.assign(view, { layout: 'down', layoutExact: true })],
]

describe('an edit is the difference of two views', () => {
  it.each(CHANGES)('%s: laid over the first view it gives the second', (_name, change) => {
    const before = base()
    const after = edited(before, change)
    const edit = diffSheet(before, after)
    expect(edit).not.toBeNull()
    expect(shownOf(mergeEdit(before, edit!)!)).toEqual(shownOf(after))
    // and it survives the trip over the network as it is
    expect(readOp(structuredClone(op(edit!)))).toEqual(op(edit!))
  })

  it('two equal views make no edit', () => {
    expect(diffSheet(base(), base())).toBeNull()
  })

  it('an edit laid twice changes nothing the second time', () => {
    const before = base()
    const after = edited(before, CHANGES[1]![1])
    const edit = diffSheet(before, after)!
    const once = mergeEdit(before, edit)!
    expect(shownOf(mergeEdit(once, edit)!)).toEqual(shownOf(once))
  })

  it('names a summary by the branches it covers, so it lands right among other branches', () => {
    const before = base()
    const after = edited(before, (view) => {
      find(view, IDS.a).summaries[0]!.title = 'Renamed summary'
    })
    const edit = diffSheet(before, after)!
    expect(edit.summaries).toEqual([
      {
        id: IDS.a,
        list: [
          {
            id: IDS.summaryRecord,
            topicId: IDS.summaryTopic,
            title: 'Renamed summary',
            from: IDS.a1,
            to: IDS.a2,
          },
        ],
      },
    ])
    // someone else put a branch in front meanwhile: the summary stays over the same two
    const elsewhere = edited(before, (view) =>
      find(view, IDS.a).children.unshift(fresh(NEW_A, 'x')),
    )
    const merged = mergeEdit(elsewhere, edit)!
    expect(find(merged, IDS.a).summaries[0]).toMatchObject({ start: 1, end: 2 })
  })
})

describe('edits made at the same time', () => {
  const retitle = (id: string, title: string): SheetEdit =>
    diffSheet(
      base(),
      edited(base(), (view) => {
        find(view, id).title = title
      }),
    )!
  const addUnder = (parent: string, id: string): SheetEdit =>
    diffSheet(
      base(),
      edited(base(), (view) => find(view, parent).children.push(fresh(id, 'added'))),
    )!

  it('edits of different topics pass each other and land the same in either order', () => {
    const pairs: Array<[SheetEdit, SheetEdit]> = [
      [retitle(IDS.a1, 'one'), addUnder(IDS.c, NEW_A)],
      [retitle(IDS.a1, 'one'), retitle(IDS.c, 'three')],
      [addUnder(IDS.a2, NEW_A), addUnder(IDS.b1, NEW_B)],
      // a title set on a branch someone deleted: gone either way
      [
        retitle(IDS.a1, 'one'),
        diffSheet(
          base(),
          edited(base(), (view) => void detach(view, IDS.a)),
        )!,
      ],
    ]
    for (const [first, second] of pairs) {
      expect(commutes(op(first), op(second))).toBe(true)
      const one = mergeEdit(mergeEdit(base(), first)!, second)!
      const other = mergeEdit(mergeEdit(base(), second)!, first)!
      expect(shownOf(one)).toEqual(shownOf(other))
    }
  })

  it('edits of the same thing do not pass each other', () => {
    expect(commutes(op(retitle(IDS.a1, 'one')), op(retitle(IDS.a1, 'two')))).toBe(false)
    expect(commutes(op(addUnder(IDS.c, NEW_A)), op(addUnder(IDS.c, NEW_B)))).toBe(false)
    const moveOut = diffSheet(
      base(),
      edited(base(), (view) => find(view, IDS.c).children.push(detach(view, IDS.a2))),
    )!
    const deleteA = diffSheet(
      base(),
      edited(base(), (view) => void detach(view, IDS.a)),
    )!
    // moving a branch out of one that is deleted: the order decides whether it lives
    expect(commutes(op(moveOut), op(deleteA))).toBe(false)
    const title = { kind: 'rename-sheet', sheet: { id: IDS.sheet, index: 0 }, title: 'x' } as const
    expect(commutes(title, { ...title, title: 'y' })).toBe(false)
    expect(commutes(title, op(retitle(IDS.a1, 'one')))).toBe(true)
    const added = { kind: 'add-sheet', sheet: plainSheet() } as const
    expect(commutes(added, added)).toBe(false)
    expect(commutes(added, title)).toBe(true)
    const otherSheet = { ...op(retitle(IDS.a1, 'two')), sheet: { id: 'other', index: 1 } }
    expect(commutes(op(retitle(IDS.a1, 'one')), otherSheet)).toBe(true)
  })

  it('branches only the receiver knew of stay after the branch they followed', () => {
    const reordered = diffSheet(
      base(),
      edited(base(), (view) => view.root.children.reverse()),
    )!
    const receiver = edited(base(), (view) => view.root.children.splice(1, 0, fresh(NEW_A, 'mine')))
    const merged = mergeEdit(receiver, reordered)!
    expect(merged.root.children.map((topic) => topic.id)).toEqual([IDS.c, IDS.b, IDS.a, NEW_A])
  })

  it('a branch added under one someone deleted goes with it; a loop is refused', () => {
    const deleted = edited(base(), (view) => void detach(view, IDS.a))
    const merged = mergeEdit(deleted, addUnder(IDS.a2, NEW_A))!
    expect(() => find(merged, NEW_A)).toThrow()
    // one copy put b1 under a, the other a under b1: neither branch may simply vanish
    const b1UnderA = edited(base(), (view) => find(view, IDS.a).children.push(detach(view, IDS.b1)))
    const aUnderB1 = diffSheet(
      base(),
      edited(base(), (view) => find(view, IDS.b1).children.push(detach(view, IDS.a))),
    )!
    expect(mergeEdit(b1UnderA, aUnderB1)).toBeNull()
    // where the op says where both go, its order wins
    const cUnderA = edited(base(), (view) => find(view, IDS.a).children.push(detach(view, IDS.c)))
    const aUnderC = diffSheet(
      base(),
      edited(base(), (view) => find(view, IDS.c).children.push(detach(view, IDS.a))),
    )!
    const merged2 = mergeEdit(cUnderA, aUnderC)!
    expect(merged2.root.children.map((topic) => topic.id)).toEqual([IDS.b, IDS.c])
    expect(find(merged2, IDS.c).children.map((topic) => topic.id)).toEqual([IDS.a])
  })

  it('names what each edit depends on', () => {
    expect([...touches(retitle(IDS.a1, 'one'))]).toEqual([`v:${IDS.a1}:title`])
    expect(touches(addUnder(IDS.c, NEW_A))).toEqual(new Set([`p:${NEW_A}`, `b:${IDS.c}`]))
  })
})

describe('reading an op that came over the network', () => {
  const sheet = { id: IDS.sheet, index: 0 }
  it.each<[string, unknown]>([
    ['not an object', 'edit'],
    ['an unknown kind', { kind: 'replace-everything', sheet }],
    ['a sheet without a place', { kind: 'delete-sheet', sheet: { id: IDS.sheet, index: -1 } }],
    ['a sheet id of another type', { kind: 'delete-sheet', sheet: { id: 7, index: 0 } }],
    ['a theme this app does not have', { kind: 'theme', sheet, theme: 'neon/everything/now' }],
    ['a list that is not one', { kind: 'edit', sheet, edit: { added: 'all' } }],
    ['a new topic without its values', { kind: 'edit', sheet, edit: { added: [{ id: NEW_A }] } }],
    [
      'a value of the wrong type',
      { kind: 'edit', sheet, edit: { values: [{ id: IDS.a1, title: 5 }] } },
    ],
    [
      'a layout the editor does not draw',
      { kind: 'edit', sheet, edit: { layout: { layout: 'spiral', exact: true } } },
    ],
    [
      'a new sheet whose topics repeat an id',
      {
        kind: 'add-sheet',
        sheet: { id: 's', rootTopic: { id: 'r', children: { attached: [{ id: 'r' }] } } },
      },
    ],
  ])('refuses %s', (_name, value) => {
    expect(readOp(value)).toBeNull()
  })

  it('keeps only what an op is made of', () => {
    const read = readOp({
      kind: 'edit',
      sheet,
      edit: { values: [{ id: IDS.a1, title: 'x', extra: '<b>' }], unknown: true },
      more: 1,
    })
    expect(read).toEqual({ kind: 'edit', sheet, edit: { values: [{ id: IDS.a1, title: 'x' }] } })
  })
})

describe('checking what reconciling made', () => {
  it('a summary the engine moved along is still what was asked for; a lost picture is not', () => {
    const state = base()
    const moved = edited(state, (view) => {
      find(view, IDS.a).summaries[0]!.start = 1
    })
    expect(showsState(state, moved)).toBe(true)
    const pictureless = edited(state, (view) => {
      find(view, IDS.a).image = null
    })
    expect(showsState(state, pictureless)).toBe(false)
  })
})
