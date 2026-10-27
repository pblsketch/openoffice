/**
 * Two copies of one map in a co-editing session (collab/binding.ts), joined
 * by an in-memory relay: edits travel both ways and end the same on every
 * copy, what the editor never shows survives someone else's undo, and undo
 * never takes back another person's work. No socket is opened.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CollabSession } from '@genoffice/collab'
import type { ViewSheet, ViewTopic, XmindTopic } from '@genoffice/xmind-engine'
import { DocumentSession } from '../src/renderer/document/session'
import { openCopiedMap } from '../src/renderer/document/open'
import { captureSheets, MapCollabBinding, type MapCollabHost } from '../src/renderer/collab/binding'
import type { MapController } from '../src/renderer/map/controller'
import { copyOf, documentOf, IDS, plainSheet, richSheet } from './helpers/fixtures'

type Handler = (payload: unknown, from: string) => void

/** The shell's relay, in memory: messages arrive in order, one turn of the event loop apart. */
class Relay {
  readonly peers = new Map<string, Peer>()
  readonly queue: Array<() => void | Promise<void>> = []
  /** how many times a guest asked the host for its whole map */
  catchups = 0

  post(delivery: () => void | Promise<void>): void {
    this.queue.push(delivery)
  }

  /** delivers until nothing has moved for a while (opening a map takes the zip library a few turns) */
  async settle(): Promise<void> {
    let quiet = 0
    while (quiet < 20) {
      await new Promise((resolve) => setTimeout(resolve, 2))
      const next = this.queue.shift()
      if (!next) {
        quiet++
        continue
      }
      quiet = 0
      await next()
    }
  }
}

/** The part of `CollabSession` the op stream and the binding use. */
class Peer {
  readonly handlers = new Map<string, Set<Handler>>()
  readonly unheard = new Map<string, Array<[unknown, string]>>()
  readonly answers = new Map<string, Handler>()
  readonly joins = new Set<(peerId: string) => void>()

  constructor(
    readonly relay: Relay,
    readonly role: 'host' | 'guest',
    readonly peerId: string,
  ) {
    relay.peers.set(peerId, this)
  }

  get session(): CollabSession {
    return this as unknown as CollabSession
  }

  on(topic: string, handler: Handler): () => void {
    const set = this.handlers.get(topic) ?? new Set()
    this.handlers.set(topic, set)
    set.add(handler)
    for (const [payload, from] of this.unheard.get(topic) ?? []) handler(payload, from)
    this.unheard.delete(topic)
    return () => set.delete(handler)
  }

  handle(topic: string, handler: Handler): () => void {
    this.answers.set(topic, handler)
    return () => this.answers.delete(topic)
  }

  onPeerJoin(handler: (peerId: string) => void): () => void {
    this.joins.add(handler)
    return () => this.joins.delete(handler)
  }

  send(topic: string, payload: unknown, to?: string): void {
    const copy = structuredClone(payload)
    const targets = to
      ? [this.relay.peers.get(to)!]
      : [...this.relay.peers.values()].filter((peer) => peer !== this)
    for (const peer of targets) {
      this.relay.post(() => peer.receive(topic, structuredClone(copy), this.peerId))
    }
  }

  receive(topic: string, payload: unknown, from: string): void {
    const set = this.handlers.get(topic)
    if (set && set.size > 0) {
      for (const handler of [...set]) handler(payload, from)
      return
    }
    const held = this.unheard.get(topic) ?? []
    held.push([payload, from])
    this.unheard.set(topic, held)
  }

  request(topic: string, payload: unknown): Promise<unknown> {
    this.relay.catchups++
    const host = this.relay.peers.get('host')!
    return new Promise((resolve, reject) => {
      this.relay.post(async () => {
        try {
          const answer = await host.answers.get(topic)!(structuredClone(payload), this.peerId)
          this.relay.post(() => resolve(structuredClone(answer)))
        } catch (err) {
          this.relay.post(() => reject(err))
        }
      })
    })
  }

  join(): void {
    const host = this.relay.peers.get('host')!
    for (const handler of host.joins) handler(this.peerId)
  }
}

/** A sheet controller as far as the binding sees one: here only whether a title is being typed. */
function fakeController(): MapController & { typing: boolean } {
  const container = document.createElement('div')
  const fake = {
    typing: false,
    get editingText() {
      return fake.typing
    },
    composing: false,
    mind: { container },
    flush: vi.fn(),
    redraw: vi.fn(),
    forgetHistory: vi.fn(),
    commitEdit: vi.fn(() => {
      fake.typing = false
    }),
  }
  return fake as unknown as MapController & { typing: boolean }
}

function hostOf(
  session: DocumentSession,
  controllers = new Map<string, MapController>(),
): MapCollabHost {
  return {
    controller: (key) => controllers.get(key) ?? null,
    activeKey: () => session.tabs()[0]?.key ?? null,
    showSheet: vi.fn(),
    changed: vi.fn(),
  }
}

const bindings: MapCollabBinding[] = []
afterEach(() => bindings.splice(0).forEach((binding) => binding.dispose()))

interface Shared {
  relay: Relay
  host: DocumentSession
  guest: DocumentSession
  original: Uint8Array
  hostKey: string
  guestKey: string
  hostControllers: Map<string, MapController>
  guestControllers: Map<string, MapController>
}

/** A host shares a map with the two sheets of the fixtures; a guest opens the copy and joins. */
async function share(before?: (host: DocumentSession) => void): Promise<Shared> {
  const relay = new Relay()
  const document = await documentOf(richSheet(), plainSheet('Second'))
  const original = await document.save()
  const host = new DocumentSession(document)
  const hostControllers = new Map<string, MapController>()
  const described = captureSheets(host)
  const bytes = await host.recoveryBytes()
  bindings.push(
    new MapCollabBinding(
      new Peer(relay, 'host', 'host').session,
      host,
      hostOf(host, hostControllers),
      described,
    ),
  )
  before?.(host)
  await relay.settle()
  // the shell opens the guest's tab on the host's bytes, like a template copy
  const opened = await openCopiedMap({ bytes })
  if (opened.status !== 'ok') throw new Error('the copy does not open')
  const guest = opened.session
  const guestControllers = new Map<string, MapController>()
  const peer = new Peer(relay, 'guest', 'guest-1')
  peer.join()
  bindings.push(new MapCollabBinding(peer.session, guest, hostOf(guest, guestControllers)))
  await relay.settle()
  return {
    relay,
    host,
    guest,
    original,
    hostKey: host.tabs()[0]!.key,
    guestKey: guest.tabs()[0]!.key,
    hostControllers,
    guestControllers,
  }
}

function find(view: ViewSheet, id: string): ViewTopic | null {
  const pending = [view.root]
  for (let topic = pending.pop(); topic; topic = pending.pop()) {
    if (topic.id === id) return topic
    pending.push(...topic.children)
  }
  return null
}

/** what the user would do on screen: a changed view, reconciled as one step */
function edit(session: DocumentSession, key: string, change: (view: ViewSheet) => void): void {
  const state = copyOf(session.view(key))
  change(state)
  const result = session.apply(key, state, { step: true })
  if (!result.ok) throw new Error(result.problem)
}

const retitle = (id: string, title: string) => (view: ViewSheet) => {
  find(view, id)!.title = title
}

const addUnder = (parent: string, id: string, title: string) => (view: ViewSheet) => {
  find(view, parent)!.children.push({
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
}

function deleteTopic(id: string) {
  return (view: ViewSheet) => {
    const pending = [view.root]
    for (let topic = pending.pop(); topic; topic = pending.pop()) {
      topic.children = topic.children.filter((child) => child.id !== id)
      pending.push(...topic.children)
    }
  }
}

/** every sheet of a copy as the editor shows it */
const shown = (session: DocumentSession) =>
  session.tabs().map((tab) => ({ title: tab.title, view: session.view(tab.key) }))

function topicIn(session: DocumentSession, key: string, id: string): XmindTopic | null {
  const pending = [session.sheet(key).rootTopic]
  for (let topic = pending.pop(); topic; topic = pending.pop()) {
    if (topic.id === id) return topic
    for (const list of Object.values(topic.children ?? {})) {
      if (Array.isArray(list)) pending.push(...(list as XmindTopic[]))
    }
  }
  return null
}

const NEW_A = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
const NEW_B = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'

describe('a shared map', () => {
  it('the guest opens the same map, and edits travel both ways', async () => {
    const { relay, host, guest, hostKey, guestKey } = await share()
    expect(shown(guest)).toEqual(shown(host))

    edit(host, hostKey, retitle(IDS.a1, 'From the host'))
    await relay.settle()
    edit(guest, guestKey, addUnder(IDS.c, NEW_A, 'From the guest'))
    await relay.settle()

    expect(find(guest.view(guestKey), IDS.a1)!.title).toBe('From the host')
    expect(find(host.view(hostKey), NEW_A)!.title).toBe('From the guest')
    expect(shown(guest)).toEqual(shown(host))
    // the host's map holds the guest's work: the normal save picks it up
    expect(host.dirty).toBe(true)
    expect(relay.catchups).toBe(0)
  })

  it('edits of different topics made at the same time land the same without starting over', async () => {
    const { relay, host, guest, hostKey, guestKey } = await share()
    edit(host, hostKey, retitle(IDS.a1, 'host title'))
    edit(guest, guestKey, retitle(IDS.c, 'guest title'))
    edit(guest, guestKey, addUnder(IDS.b1, NEW_A, 'guest branch'))
    edit(host, hostKey, addUnder(IDS.a2, NEW_B, 'host branch'))
    await relay.settle()
    expect(shown(guest)).toEqual(shown(host))
    expect(relay.catchups).toBe(0)
  })

  it('edits of the same topic at the same time end the same on both copies', async () => {
    const { relay, host, guest, hostKey, guestKey } = await share()
    edit(host, hostKey, retitle(IDS.a1, 'host title'))
    edit(guest, guestKey, retitle(IDS.a1, 'guest title'))
    await relay.settle()
    expect(shown(guest)).toEqual(shown(host))
    // the host ordered its own edit first, so the guest's came last
    expect(find(host.view(hostKey), IDS.a1)!.title).toBe('guest title')
  })

  it("a guest's undo of a deletion brings back on the host what the editor never showed", async () => {
    const { relay, host, guest, hostKey, guestKey } = await share()
    const before = copyOf(host.sheet(hostKey))
    edit(guest, guestKey, deleteTopic(IDS.a))
    await relay.settle()
    expect(topicIn(host, hostKey, IDS.a)).toBeNull()
    expect(JSON.stringify(host.sheet(hostKey))).not.toContain('unknownTopicKey')

    expect(guest.undo(guestKey)).not.toBeNull()
    await relay.settle()
    // the branch with its unknown keys, the callout, the summary with the branch under it
    expect(topicIn(host, hostKey, IDS.a)).toEqual(before.rootTopic.children!.attached![0])
    // and the relationship that went with it, curve included, where it was
    expect(host.sheet(hostKey).relationships).toEqual(before.relationships)
    // the whole sheet key for key, so the host's save is the file's own bytes again
    expect(JSON.stringify(host.sheet(hostKey))).toBe(JSON.stringify(before))
    expect(host.document.changed).toBe(false)
    expect(shown(guest)).toEqual(shown(host))
  })

  it('a branch cut and pasted back on a guest arrives at the host whole', async () => {
    const { relay, host, guest, hostKey, guestKey } = await share()
    const original = copyOf(topicIn(host, hostKey, IDS.a))
    const cut = guest.copyOfTopic(guestKey, IDS.a)!
    const lines = guest.relationshipRecords(guestKey)
    edit(guest, guestKey, deleteTopic(IDS.a))
    await relay.settle()
    expect(guest.reinsertTopics(guestKey, IDS.c, [cut], lines)).not.toBeNull()
    await relay.settle()
    const c = topicIn(host, hostKey, IDS.c)!
    expect(c.children?.attached?.map((topic) => topic.id)).toEqual([IDS.a])
    expect(topicIn(host, hostKey, IDS.a)).toEqual(original)
    expect(shown(guest)).toEqual(shown(host))
  })

  it("undo never takes back someone else's edit", async () => {
    const { relay, host, guest, hostKey, guestKey } = await share()
    edit(guest, guestKey, retitle(IDS.c, 'mine'))
    await relay.settle()
    expect(guest.canUndo(guestKey)).toBe(true)
    edit(host, hostKey, retitle(IDS.b, 'theirs'))
    await relay.settle()
    // the guest's history held whole copies of the sheet without the host's edit
    expect(guest.canUndo(guestKey)).toBe(false)
    expect(host.canUndo(hostKey)).toBe(true)
  })

  it('sheets added, renamed, themed and deleted reach the other copy', async () => {
    const { relay, host, guest } = await share()
    const added = guest.addSheet({ title: 'Third', rootTitle: 'Center three' })
    await relay.settle()
    expect(host.tabs().map((tab) => tab.title)).toEqual(['First', 'Second', 'Third'])
    const hostThird = host.tabs()[2]!.key
    expect(host.sheet(hostThird)).toEqual(guest.sheet(added.key))

    guest.renameSheet(added.key, 'Third, renamed')
    host.applyTheme(hostThird, 'block/plum/tint')
    await relay.settle()
    expect(host.tabs()[2]!.title).toBe('Third, renamed')
    expect(guest.themeOf(added.key)).toBe('block/plum/tint')

    host.deleteSheet(hostThird)
    await relay.settle()
    expect(guest.tabs().map((tab) => tab.title)).toEqual(['First', 'Second'])
    expect(shown(guest)).toEqual(shown(host))
  })

  it('a guest who joins late catches up on what happened since the map was shared', async () => {
    const { relay, host, guest } = await share((map) => {
      const key = map.tabs()[0]!.key
      edit(map, key, retitle(IDS.a1, 'before the guest'))
      edit(map, key, deleteTopic(IDS.b))
      map.renameSheet(key, 'Renamed early')
    })
    await relay.settle()
    expect(shown(guest)).toEqual(shown(host))
    expect(relay.catchups).toBe(0)
  })

  it('an op the host cannot take is refused, and the guest starts over from the host map', async () => {
    const { relay, host, guest, hostKey, guestKey } = await share()
    const peer = relay.peers.get('guest-1')!
    peer.send('mindmap:propose', {
      epoch: 0,
      pid: 'guest-1.99',
      op: { kind: 'edit', sheet: { id: IDS.sheet, index: 0 }, edit: { added: 'everything' } },
    })
    await relay.settle()
    expect(relay.catchups).toBe(1)
    edit(guest, guestKey, retitle(IDS.c, 'after starting over'))
    await relay.settle()
    expect(find(host.view(hostKey), IDS.c)!.title).toBe('after starting over')
    expect(shown(guest)).toEqual(shown(host))
  })

  it('ops for a sheet wait while a title is typed on it, then land with the typed change after them', async () => {
    const shared = await share()
    const { relay, host, guest, hostKey, guestKey } = shared
    const typing = fakeController()
    shared.guestControllers.set(guestKey, typing)
    typing.typing = true

    edit(host, hostKey, retitle(IDS.a1, 'from the host'))
    await relay.settle()
    // nothing is drawn under the edit box
    expect(find(guest.view(guestKey), IDS.a1)!.title).toBe('Alpha one')
    expect(typing.redraw).not.toHaveBeenCalled()

    // the box closes: its title goes into the map, after the waiting op
    edit(guest, guestKey, retitle(IDS.c, 'typed'))
    typing.typing = false
    await vi.waitFor(() => expect(find(guest.view(guestKey), IDS.a1)!.title).toBe('from the host'))
    await relay.settle()
    expect(find(host.view(hostKey), IDS.c)!.title).toBe('typed')
    expect(shown(guest)).toEqual(shown(host))
    expect(typing.redraw).toHaveBeenCalled()
    expect(typing.forgetHistory).toHaveBeenCalled()
    expect(relay.catchups).toBe(0)
  })

  it('the host takes a guest op while typing, and its own typed change is ordered after it', async () => {
    const shared = await share()
    const { relay, host, guest, hostKey, guestKey } = shared
    const typing = fakeController()
    shared.hostControllers.set(hostKey, typing)
    typing.typing = true

    edit(guest, guestKey, retitle(IDS.a1, 'from the guest'))
    await relay.settle()
    expect(find(host.view(hostKey), IDS.a1)!.title).toBe('Alpha one')

    edit(host, hostKey, retitle(IDS.a1, 'typed by the host'))
    typing.typing = false
    await vi.waitFor(() =>
      expect(find(host.view(hostKey), IDS.a1)!.title).toBe('typed by the host'),
    )
    await relay.settle()
    expect(shown(guest)).toEqual(shown(host))
  })
})

describe('what the session does for co-editing', () => {
  async function richMap() {
    const session = new DocumentSession(await documentOf(richSheet(), plainSheet('Second')))
    return { session, key: session.tabs()[0]!.key }
  }

  it('a shared change that is turned down leaves the sheet exactly as it was', async () => {
    const { session, key } = await richMap()
    const before = JSON.stringify(session.sheet(key))
    const cut = session.copyOfTopic(key, IDS.a)!
    edit(session, key, deleteTopic(IDS.a))
    const deleted = JSON.stringify(session.sheet(key))
    const state = copyOf(session.view(key))
    addUnder(IDS.c, NEW_A, 'new')(state)
    const listener = vi.fn()
    session.subscribe(listener)
    const result = session.applyShared(
      key,
      state,
      { topics: [{ parentId: IDS.c, topic: cut }] },
      () => false,
    )
    expect(result).toBeNull()
    expect(JSON.stringify(session.sheet(key))).toBe(deleted)
    expect(listener).not.toHaveBeenCalled()
    expect(deleted).not.toBe(before)
  })

  it('a sheet from elsewhere joins only with ids the file does not use yet', async () => {
    const { session } = await richMap()
    expect(session.adoptSheet(plainSheet('Again'))).toBeNull()
    const fresh = copyOf(plainSheet('Fresh'))
    fresh.id = 'ffffffff-ffff-4fff-8fff-fffffffffff0'
    fresh.rootTopic.children!.attached![0]!.id = IDS.a1
    expect(session.adoptSheet(fresh)).toBeNull()
    fresh.rootTopic.children!.attached![0]!.id = 'ffffffff-ffff-4fff-8fff-fffffffffff1'
    fresh.rootTopic.id = 'ffffffff-ffff-4fff-8fff-fffffffffff2'
    fresh.rootTopic.children!.attached![1]!.id = 'ffffffff-ffff-4fff-8fff-fffffffffff3'
    expect(session.adoptSheet(fresh)?.title).toBe('Fresh')
    expect(session.tabs()).toHaveLength(3)
  })

  it('sheets taken whole keep their keys by id and lose their history', async () => {
    const { session, key } = await richMap()
    const second = session.tabs()[1]!.key
    edit(session, key, retitle(IDS.c, 'changed'))
    expect(session.canUndo(key)).toBe(true)
    const other = await documentOf(plainSheet('Only'), richSheet())
    session.replaceSheets(other.sheets)
    expect(session.tabs().map((tab) => tab.key)).toEqual([second, key])
    expect(session.canUndo(key)).toBe(false)
    expect(find(session.view(key), IDS.c)!.title).toBe('Gamma')
  })
})
