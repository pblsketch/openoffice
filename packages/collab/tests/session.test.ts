import { describe, expect, it } from 'vitest'
import { CollabSession } from '../src/session'
import { startHosting, takeGuestSession } from '../src/connect'
import { OpLog } from '../src/op-log'
import { FakeRelay } from './fake-relay'

const BASE = new Uint8Array([1])

async function hostOn(relay: FakeRelay, seed: (session: CollabSession) => void = () => {}) {
  const started = await startHosting(
    relay.host(),
    { kind: 'markdown', title: 'Doc', fileName: 'doc.md', base: BASE },
    { name: 'Host', color: 1 },
    seed,
  )
  if (!started.ok) throw new Error(started.reason)
  return started.session
}

async function guestOn(relay: FakeRelay, name: string, color = 2) {
  const bridge = relay.guest()
  await relay.flush()
  const session = await takeGuestSession(bridge, { name, color })
  if (!session) throw new Error('no ticket')
  await relay.flush()
  await session.synced
  return session
}

describe('collab session', () => {
  it('gives a guest the host state and keeps everyone in step', async () => {
    const relay = new FakeRelay()
    const host = await hostOn(relay, (s) => s.doc.getText('text').insert(0, 'hello'))
    const a = await guestOn(relay, 'A')
    const b = await guestOn(relay, 'B')
    expect(a.doc.getText('text').toString()).toBe('hello')

    a.doc.getText('text').insert(5, ' world')
    b.doc.getText('text').insert(0, '>> ')
    await relay.flush()
    for (const session of [host, a, b]) {
      expect(session.doc.getText('text').toString()).toBe('>> hello world')
    }
  })

  it('lists everyone with the host first, and drops a guest that leaves', async () => {
    const relay = new FakeRelay()
    const host = await hostOn(relay)
    const a = await guestOn(relay, 'A', 3)
    await guestOn(relay, 'B')
    await relay.flush()
    expect(a.peers().map((p) => [p.name, p.host, p.self])).toEqual([
      ['Host', true, false],
      ['A', false, true],
      ['B', false, false],
    ])
    expect(a.peers()[1].color).toBe(3)

    await a.leave()
    await relay.flush()
    expect(host.peers().map((p) => p.name)).toEqual(['Host', 'B'])
  })

  it('ends a guest session when the host goes', async () => {
    const relay = new FakeRelay()
    const host = await hostOn(relay)
    const a = await guestOn(relay, 'A')
    const reasons: string[] = []
    a.onEnd((reason) => reasons.push(reason))
    await host.leave()
    await relay.flush()
    expect(reasons).toEqual(['host-left'])
    expect(a.ended).toBe('host-left')
  })

  it('answers a guest request on the host and rejects unknown topics', async () => {
    const relay = new FakeRelay()
    const host = await hostOn(relay)
    host.handle('double', (n) => Number(n) * 2)
    const a = await guestOn(relay, 'A')
    const answer = a.request('double', 21)
    await relay.flush()
    await expect(answer).resolves.toBe(42)
    const missing = expect(a.request('nothing', null)).rejects.toThrow(/no handler/)
    await relay.flush()
    await missing
  })
})

describe('host-ordered op log', () => {
  /** a toy editor: a list of strings, ops insert at an index */
  type Op = { at: number; text: string }
  function editor(session: CollabSession) {
    let items: string[] = []
    const log = new OpLog<Op>(session, {
      topic: 'list',
      apply: (op) => {
        items.splice(Math.min(op.at, items.length), 0, op.text)
      },
      snapshot: async () => new TextEncoder().encode(JSON.stringify(items)),
      reload: async (bytes) => {
        items = JSON.parse(new TextDecoder().decode(bytes)) as string[]
      },
    })
    return {
      log,
      get items() {
        return items
      },
      edit(op: Op) {
        items.splice(Math.min(op.at, items.length), 0, op.text)
        log.submit(op)
      },
    }
  }

  it('replays every edit in the host order on every peer', async () => {
    const relay = new FakeRelay()
    const hostSession = await hostOn(relay)
    const host = editor(hostSession)
    host.edit({ at: 0, text: 'h1' })
    const a = editor(await guestOn(relay, 'A'))
    await relay.flush()
    // a guest joining after the first edit catches up from the backlog
    expect(a.items).toEqual(['h1'])

    a.edit({ at: 1, text: 'a1' })
    host.edit({ at: 0, text: 'h2' })
    await relay.flush()
    // positions are read against the host's document when the op reaches it
    expect(host.items).toEqual(['h2', 'a1', 'h1'])
    expect(a.items).toEqual(host.items)
  })

  it('brings a guest back in step from a snapshot when the host refuses its edit', async () => {
    const relay = new FakeRelay()
    const hostSession = await hostOn(relay)
    const host = editor(hostSession)
    const guestSession = await guestOn(relay, 'A')
    const resyncs: number[] = []
    let items: string[] = []
    const log = new OpLog<Op>(guestSession, {
      topic: 'list',
      apply: (op) => {
        items.splice(op.at, 0, op.text)
      },
      snapshot: async () => new Uint8Array(),
      reload: async (bytes) => {
        items = JSON.parse(new TextDecoder().decode(bytes)) as string[]
      },
      onResync: () => resyncs.push(1),
    })
    // the host refuses everything a guest proposes
    host.log.dispose()
    const strict = new OpLog<Op>(hostSession, {
      topic: 'list',
      accept: () => null,
      apply: () => {},
      snapshot: async () => new TextEncoder().encode(JSON.stringify(host.items)),
      reload: async () => {},
    })
    host.edit({ at: 0, text: 'kept' })
    strict.submit({ at: 0, text: 'kept' })
    await relay.flush()

    items.splice(0, 0, 'mine')
    log.submit({ at: 0, text: 'mine' })
    await relay.flush()
    expect(items).toEqual(['kept'])
    expect(resyncs.length).toBe(1)
  })

  it('takes the host state when a host op does not apply on a guest', async () => {
    const relay = new FakeRelay()
    const host = editor(await hostOn(relay))
    const guestSession = await guestOn(relay, 'A')
    let items: string[] = []
    new OpLog<Op>(guestSession, {
      topic: 'list',
      apply: (op) => {
        if (op.text === 'bad') throw new Error('no such place')
        items.splice(op.at, 0, op.text)
      },
      snapshot: async () => new Uint8Array(),
      reload: async (bytes) => {
        items = JSON.parse(new TextDecoder().decode(bytes)) as string[]
      },
    })
    await relay.flush()
    host.edit({ at: 0, text: 'bad' })
    host.edit({ at: 1, text: 'after' })
    await relay.flush()
    expect(items).toEqual(['bad', 'after'])
  })

  it('starts everyone on a new epoch after a host rebase', async () => {
    const relay = new FakeRelay()
    const host = editor(await hostOn(relay))
    const a = editor(await guestOn(relay, 'A'))
    host.edit({ at: 0, text: 'x' })
    await relay.flush()
    await host.log.rebase()
    await relay.flush()
    host.edit({ at: 1, text: 'y' })
    a.edit({ at: 0, text: 'z' })
    await relay.flush()
    expect(a.items).toEqual(host.items)
    expect(host.items).toEqual(['z', 'x', 'y'])
  })
})
