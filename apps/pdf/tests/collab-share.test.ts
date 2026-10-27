import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  EditShare,
  existingPages,
  normalizeOrder,
  repairBlankPages,
  savedSnapshotOf,
  type ShareHost,
} from '../src/renderer/collab-share'
import { peerMarksByPage } from '../src/renderer/collab'
import { planEditOps, reduceEditOps, type Op } from '../src/renderer/edit-ops'
import type { EditSnapshot, SavedSnapshot } from '../src/renderer/edit-state'

const REMOTE = 'remote'

const empty = (): EditSnapshot => ({
  markups: [],
  annotDeletes: [],
  noteEdits: [],
  drawings: [],
  textEdits: [],
  textInserts: [],
  imageEdits: [],
  stampCfg: null,
  formEdits: new Map(),
  formFields: [],
  formWidgetEdits: new Map(),
  blankPages: [],
  rotations: new Map(),
  deleted: new Set(),
  order: null,
  metadata: null,
})

/** one peer's editor: its buckets change only through ops (local) or the share (others) */
class Editor {
  state = empty()
  share: EditShare | null = null
  readonly doc = new Y.Doc()
  private seq = 0

  constructor(
    readonly name: string,
    public real = 3,
  ) {}

  private host(): ShareHost {
    return {
      read: () => ({ ...this.state }),
      write: (bucket, fn) => {
        this.state = { ...this.state, [bucket]: fn(this.state[bucket]) }
      },
      realPages: () => this.real,
    }
  }

  bind(role: 'host' | 'guest'): this {
    this.share = new EditShare(this.doc, role, this.host())
    this.share.start()
    return this
  }

  edit(ops: Op[], coalesceKey?: string): string[] {
    const plan = planEditOps(
      ops,
      {
        readOnly: false,
        pageCount: this.real + this.state.blankPages.length,
        deleted: this.state.deleted,
        claimedImages: new Set(),
      },
      () => `${this.name}${++this.seq}`,
    )
    if (plan.failures.length > 0) throw new Error(plan.failures[0]!.error)
    this.state = reduceEditOps(this.state, plan.ops)
    this.share?.local(coalesceKey)
    return plan.records.flatMap((r) => r.created ?? [])
  }

  /** the render after an edit: what did not come through an op is shared */
  sync(): void {
    this.share?.sync()
  }
}

/** the editor's post-save reload: what the save wrote leaves the buckets */
function reloaded(state: EditSnapshot, saved: SavedSnapshot): EditSnapshot {
  return {
    ...state,
    markups: state.markups.filter((m) => !saved.markupIds.has(m.id)),
    drawings: state.drawings.filter((d) => !saved.drawingIds.has(d.id)),
    blankPages: state.blankPages.filter((b) => !saved.blankPageIds.has(b.id)),
    rotations: new Map(),
    deleted: new Set(),
    order: null,
  }
}

/** every peer's updates reach every other peer when flushed, like the relay */
function wire(...editors: Editor[]): () => Promise<void> {
  const queue: Array<() => void> = []
  for (const from of editors) {
    from.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return
      for (const to of editors) {
        if (to !== from) queue.push(() => Y.applyUpdate(to.doc, update, REMOTE))
      }
    })
  }
  return async () => {
    for (let round = 0; round < 10; round++) {
      while (queue.length > 0) queue.shift()!()
      // late items are carried in a microtask
      await Promise.resolve()
      await Promise.resolve()
      if (queue.length === 0) return
    }
  }
}

const quad = [10, 20, 30, 20, 10, 10, 30, 10]
const markup = (pageIndex: number, color: [number, number, number] = [1, 1, 0]): Op => ({
  op: 'addMarkup',
  markup: { pageIndex, type: 'highlight', color, quads: [quad] },
})

async function session(...guests: string[]) {
  const host = new Editor('h')
  const others = guests.map((name) => new Editor(name))
  const flush = wire(host, ...others)
  return { host, guests: others, flush }
}

describe('PDF co-editing state', () => {
  it('gives a guest the host’s pending edits and keeps both in step', async () => {
    const { host, guests, flush } = await session('g')
    const [guest] = guests as [Editor]
    host.edit([markup(0), { op: 'rotatePages', pages: [1], dir: 90 }])
    host.bind('host')
    await flush()
    guest.bind('guest')
    expect(guest.state.markups).toEqual(host.state.markups)
    expect(guest.state.rotations).toEqual(new Map([[1, 90]]))

    guest.edit([markup(2, [0, 1, 0]), { op: 'deletePage', pageIndex: 1 }])
    await flush()
    expect(host.state.markups.map((m) => m.pageIndex)).toEqual([0, 2])
    expect(host.state.deleted).toEqual(new Set([1]))
    // another person's edit is no step in the host's undo
    expect(host.share!.canUndo).toBe(false)
  })

  it('puts items added at the same moment in the same order everywhere', async () => {
    const { host, guests, flush } = await session('a', 'b')
    host.bind('host')
    await flush()
    for (const guest of guests) guest.bind('guest')
    guests[0]!.edit([markup(0)])
    guests[1]!.edit([markup(1)])
    host.edit([markup(2)])
    await flush()
    const order = host.state.markups.map((m) => m.id)
    expect(order).toHaveLength(3)
    for (const guest of guests) expect(guest.state.markups.map((m) => m.id)).toEqual(order)
  })

  it('undoes only this person’s own edit and redoes it', async () => {
    const { host, guests, flush } = await session('g')
    const [guest] = guests as [Editor]
    host.bind('host')
    await flush()
    guest.bind('guest')
    const [mine] = guest.edit([markup(0)])
    await flush()
    const [theirs] = host.edit([markup(1)])
    await flush()

    expect(guest.share!.undo()).toBe(true)
    await flush()
    for (const peer of [host, guest]) expect(peer.state.markups.map((m) => m.id)).toEqual([theirs])

    expect(guest.share!.redo()).toBe(true)
    await flush()
    for (const peer of [host, guest]) {
      expect(peer.state.markups.map((m) => m.id).sort()).toEqual([mine, theirs].sort())
    }
  })

  it('leaves an edit alone once someone else changed it', async () => {
    const { host, guests, flush } = await session('g')
    const [guest] = guests as [Editor]
    host.bind('host')
    await flush()
    guest.bind('guest')
    const [id] = guest.edit([markup(0)])
    await flush()
    host.edit([{ op: 'recolorMarkup', id, color: [0, 0, 1] }])
    await flush()

    expect(guest.share!.undo()).toBe(false)
    await flush()
    for (const peer of [host, guest]) {
      expect(peer.state.markups).toEqual([expect.objectContaining({ id, color: [0, 0, 1] })])
    }
  })

  it('folds typing into one form field into one undo step', async () => {
    const { host, guests, flush } = await session('g')
    const [guest] = guests as [Editor]
    host.bind('host')
    await flush()
    guest.bind('guest')
    const value = (text: string): Op => ({
      op: 'setFormValue',
      value: { name: 'city', kind: 'text', value: text },
    })
    guest.edit([value('S')], 'form:city')
    guest.edit([value('Se')], 'form:city')
    guest.edit([value('Seoul')], 'form:city')
    await flush()
    expect(host.state.formEdits.get('city')?.value).toBe('Seoul')

    guest.share!.undo()
    await flush()
    expect(host.state.formEdits.size).toBe(0)
    expect(guest.share!.canUndo).toBe(false)
  })

  it('shares what the editor changed by itself without an undo step, and undo follows it', async () => {
    const { host, guests, flush } = await session('g')
    const [guest] = guests as [Editor]
    host.bind('host')
    await flush()
    guest.bind('guest')
    const [id] = guest.edit([
      {
        op: 'putTextEdit',
        input: { pageIndex: 0, rect: [0, 0, 50, 10], oldText: 'a', newText: 'b', fontSize: 10 },
      },
    ])
    // the background validation widens the cover; it is no edit of its own
    guest.state = {
      ...guest.state,
      textEdits: guest.state.textEdits.map((e) => ({ ...e, cover: [0, 0, 52, 11] })),
    }
    guest.sync()
    await flush()
    expect(host.state.textEdits[0]).toMatchObject({ id, cover: [0, 0, 52, 11] })

    expect(guest.share!.undo()).toBe(true)
    await flush()
    expect(host.state.textEdits).toEqual([])
  })

  it('ignores a value another peer could not have meant', async () => {
    const { host, guests, flush } = await session('g')
    const [guest] = guests as [Editor]
    host.bind('host')
    await flush()
    guest.bind('guest')
    host.doc
      .getMap('pdf.markups')
      .set('x', { e: 0, r: 99, v: { id: 'not-x', pageIndex: 0, quads: [] } })
    host.doc.getMap('pdf.rotations').set('1', { e: 0, v: 45 })
    await flush()
    expect(guest.state.markups).toEqual([])
    expect(guest.state.rotations.size).toBe(0)
  })

  it('moves to the host’s saved file: saved edits leave, the rest follows the new pages', async () => {
    const { host, guests, flush } = await session('g')
    const [guest] = guests as [Editor]
    host.bind('host')
    await flush()
    guest.bind('guest')
    const [savedId] = guest.edit([markup(0)])
    await flush()

    // the host saves with pages 0 and 1 swapped
    const pageMap = new Map([
      [0, 1],
      [1, 0],
      [2, 2],
    ])
    const saved = savedSnapshotOf(host.state, pageMap)
    host.share!.announce()
    // meanwhile the guest, still on the old file, recolors the saved markup and adds one on page 0
    guest.edit([{ op: 'recolorMarkup', id: savedId, color: [1, 0, 0] }])
    const [late] = guest.edit([markup(0, [0, 0, 1])])
    // the host's post-save reload subtracted what it wrote
    host.state = { ...host.state, markups: [] }
    host.share!.saved(saved)
    await flush()
    host.share!.settle()
    host.sync()
    await flush()

    expect(host.state.markups).toEqual([expect.objectContaining({ id: late, pageIndex: 1 })])
    // the guest loads the saved file, then shows what is pending in it
    expect(guest.share!.beginReload(1)).toBe(true)
    guest.share!.endReload(1)
    expect(guest.state.markups).toEqual(host.state.markups)
    expect(guest.share!.epoch).toBe(1)
  })

  it('keeps a guest edit made while the host’s saved file is being written into its copy', async () => {
    const { host, guests, flush } = await session('g')
    const [guest] = guests as [Editor]
    host.real = 2
    guest.real = 2
    host.bind('host')
    await flush()
    guest.bind('guest')
    host.edit([{ op: 'rotatePages', pages: [0], dir: 90 }])
    await flush()

    // the host saves its rotation, tells the guest, and reloads
    const pageMap = new Map([
      [0, 0],
      [1, 1],
    ])
    const saved = savedSnapshotOf(host.state, pageMap)
    const epoch = host.share!.announce()
    host.state = { ...host.state, rotations: new Map() }
    host.share!.saved(saved)
    host.share!.settle()
    host.sync()
    expect(guest.share!.beginReload(epoch)).toBe(true)
    await flush()

    await guest.share!.follow(epoch, pageMap, {
      replace: async () => {
        // the guest adds a page while its copy is being rewritten
        guest.edit([{ op: 'insertBlankPage', after: 1, pageIndex: 2, width: 100, height: 100 }])
        await flush()
        return true
      },
      reload: async (s) => {
        guest.state = reloaded(guest.state, s)
      },
    })
    await flush()
    for (const peer of [host, guest]) {
      expect(peer.state.blankPages.map((b) => b.input.pageIndex)).toEqual([2])
      expect(peer.state.order).toEqual([0, 1, 2])
      expect(peer.state.rotations.size).toBe(0)
    }
  })

  it('carries every kind of late guest edit into the saved file’s pages', async () => {
    const { host, guests, flush } = await session('g')
    const [guest] = guests as [Editor]
    host.bind('host')
    await flush()
    guest.bind('guest')
    host.edit([
      { op: 'rotatePages', pages: [0], dir: 90 },
      { op: 'setPageOrder', order: [2, 0, 1] },
    ])
    await flush()

    // the save bakes the rotation and the order: old page 2 is now 0, 0 is 1, 1 is 2
    const pageMap = new Map([
      [2, 0],
      [0, 1],
      [1, 2],
    ])
    const saved = savedSnapshotOf(host.state, pageMap)
    const epoch = host.share!.announce()
    // before the guest hears of the save it turns page 0 again, deletes page 1,
    // and adds a page after page 2 with a highlight on it
    guest.edit([{ op: 'rotatePages', pages: [0], dir: 90 }])
    guest.edit([{ op: 'deletePage', pageIndex: 1 }])
    guest.edit([{ op: 'insertBlankPage', after: 2, pageIndex: 3, width: 100, height: 100 }])
    const [late] = guest.edit([markup(3)])
    host.state = { ...host.state, rotations: new Map(), order: null }
    host.share!.saved(saved)
    await flush()
    host.share!.settle()
    host.sync()
    await flush()

    expect(host.state.rotations).toEqual(new Map([[1, 90]]))
    expect(host.state.deleted).toEqual(new Set([2]))
    expect(host.state.blankPages.map((b) => b.input.pageIndex)).toEqual([3])
    expect(host.state.markups).toEqual([expect.objectContaining({ id: late, pageIndex: 3 })])
    expect(host.state.order).toEqual([0, 3, 1, 2])

    expect(guest.share!.beginReload(epoch)).toBe(true)
    await guest.share!.follow(epoch, pageMap, {
      replace: async () => true,
      reload: async (s) => {
        guest.state = reloaded(guest.state, s)
      },
    })
    for (const bucket of ['rotations', 'deleted', 'blankPages', 'markups', 'order'] as const) {
      expect(guest.state[bucket]).toEqual(host.state[bucket])
    }
  })

  it('shows a guest only the edits of the file it has open', async () => {
    const { host, guests, flush } = await session('g')
    const [guest] = guests as [Editor]
    host.edit([markup(0)])
    host.bind('host')
    await flush()
    guest.bind('guest')
    host.share!.announce()
    host.share!.saved(savedSnapshotOf(empty(), new Map([[0, 0]])))
    host.share!.settle()
    // still pending after the save: re-tagged for the new file
    host.sync()
    await flush()
    expect(guest.state.markups).toEqual([])
    guest.share!.beginReload(1)
    guest.share!.endReload(1)
    expect(guest.state.markups).toEqual(host.state.markups)
  })

  it('makes a guest who joins after a save wait for the saved file', async () => {
    const { host, guests, flush } = await session('g')
    const [guest] = guests as [Editor]
    host.bind('host')
    host.share!.announce()
    host.edit([markup(1)])
    host.share!.saved(savedSnapshotOf(empty(), new Map()))
    host.share!.settle()
    host.sync()
    await flush()
    guest.bind('guest')
    expect(guest.state.markups).toEqual([])
    expect(guest.share!.beginReload(1)).toBe(true)
    guest.share!.endReload(1)
    expect(guest.state.markups).toEqual(host.state.markups)
  })

  it('renumbers blank pages two people inserted at once, and keeps every page in the order', async () => {
    const { host, guests, flush } = await session('g')
    const [guest] = guests as [Editor]
    host.real = 2
    guest.real = 2
    host.bind('host')
    await flush()
    guest.bind('guest')
    const blank = (after: number): Op => ({
      op: 'insertBlankPage',
      after,
      pageIndex: 2,
      width: 100,
      height: 100,
    })
    host.edit([blank(0)])
    guest.edit([blank(1)])
    await flush()
    host.sync()
    await flush()
    for (const peer of [host, guest]) {
      expect(peer.state.blankPages.map((b) => b.input.pageIndex).sort()).toEqual([2, 3])
      expect([...(peer.state.order ?? [])].sort()).toEqual([0, 1, 2, 3])
    }
    expect(guest.state.order).toEqual(host.state.order)
  })
})

describe('page order and blank pages', () => {
  it('completes an order that lost or gained pages', () => {
    expect(normalizeOrder([1, 0, 5, 1], [0, 1, 2])).toEqual([1, 0, 2])
    const order = [2, 0, 1]
    expect(normalizeOrder(order, [0, 1, 2])).toBe(order)
    expect(normalizeOrder(null, [0, 1])).toBeNull()
  })

  it('closes the gap an undone blank page leaves, moving what is on the later one', () => {
    const snapshot: EditSnapshot = {
      ...empty(),
      blankPages: [{ id: 'b', input: { pageIndex: 3, width: 10, height: 10 } }],
      markups: [{ id: 'm', pageIndex: 3, type: 'highlight', color: [1, 1, 0], quads: [quad] }],
      rotations: new Map([[3, 90]]),
      order: [3, 0, 1],
    }
    const fixed = repairBlankPages(snapshot, 2)!
    expect(fixed.blankPages![0]!.input.pageIndex).toBe(2)
    expect(fixed.markups![0]!.pageIndex).toBe(2)
    expect(fixed.rotations).toEqual(new Map([[2, 90]]))
    expect(fixed.order).toEqual([2, 0, 1])
    expect(existingPages({ ...snapshot, ...fixed }, 2)).toEqual([0, 1, 2])
    expect(repairBlankPages({ ...snapshot, ...fixed }, 2)).toBeNull()
  })
})

describe('presence', () => {
  it('marks the page each person looks at and their selection, in the open file only', () => {
    const user = (name: string) => ({ name, color: 'var(--collab-2)' })
    const marks = peerMarksByPage(
      [
        { clientId: 1, user: user('Ann'), value: { e: 0, page: 2, sel: [[3, [quad]]] } },
        { clientId: 2, user: user('Bo'), value: { e: 1, page: 2, sel: null } },
        { clientId: 3, user: user('Cy'), value: { e: 0, page: 'x', sel: null } },
      ],
      0,
    )
    expect(marks.get(2)).toEqual([
      { clientId: 1, name: 'Ann', color: 'var(--collab-2)', here: true, quads: [] },
    ])
    expect(marks.get(3)).toEqual([
      { clientId: 1, name: 'Ann', color: 'var(--collab-2)', here: false, quads: [quad] },
    ])
  })
})
