/** An in-memory stand-in for the shell: routes bridge traffic like the LAN host server does. */
import type { CollabBridge } from '@genoffice/electron-utils/collab-bridge'
import {
  COLLAB_HOST_PEER,
  type CollabEvent,
  type CollabIncoming,
  type CollabTicket,
} from '@genoffice/electron-utils/collab-channels'

interface Peer {
  id: string
  onMessage: Set<(message: CollabIncoming) => void>
  onEvent: Set<(event: CollabEvent) => void>
  ticket: CollabTicket | null
  /** a guest's traffic waits until its tab takes the session, as in the shell */
  held: Array<() => void> | null
}

export class FakeRelay {
  private readonly peers = new Map<string, Peer>()
  /** messages wait here until `flush`, like packets on a wire */
  private readonly queue: Array<() => void> = []
  private seq = 0

  private peer(id: string, ticket: CollabTicket | null): Peer {
    const peer: Peer = {
      id,
      onMessage: new Set(),
      onEvent: new Set(),
      ticket,
      held: ticket ? [] : null,
    }
    this.peers.set(id, peer)
    return peer
  }

  private bridgeFor(peer: Peer): CollabBridge {
    return {
      available: async () => true,
      profile: async () => ({ name: peer.id, color: 0 }),
      setProfile: async (p) => p,
      host: async () => ({ ok: true, info: { pin: '123456', port: 47631, addresses: [] } }),
      newPin: async () => '654321',
      join: async () => ({ ok: true }),
      take: async () => {
        const ticket = peer.ticket
        peer.ticket = null
        if (peer.held) this.queue.push(...peer.held.splice(0))
        peer.held = null
        return ticket
      },
      leave: async () => {
        this.drop(peer.id)
      },
      send: ({ to, data }) => this.route(peer.id, to, data),
      onMessage: (handler) => {
        peer.onMessage.add(handler)
        return () => peer.onMessage.delete(handler)
      },
      onEvent: (handler) => {
        peer.onEvent.add(handler)
        return () => peer.onEvent.delete(handler)
      },
      discover: () => () => {},
    }
  }

  host(): CollabBridge {
    return this.bridgeFor(this.peer(COLLAB_HOST_PEER, null))
  }

  /** a guest arrives: the host hears about it now, like the server's admit */
  guest(kind: CollabTicket['kind'] = 'markdown'): CollabBridge {
    const id = `g${++this.seq}`
    const bridge = this.bridgeFor(
      this.peer(id, { peerId: id, kind, title: 'Doc', hostName: 'host', hostColor: 0 }),
    )
    this.event(COLLAB_HOST_PEER, { type: 'peer-join', peerId: id })
    return bridge
  }

  drop(id: string): void {
    if (!this.peers.delete(id)) return
    if (id === COLLAB_HOST_PEER) {
      for (const other of [...this.peers.keys()])
        this.event(other, { type: 'ended', reason: 'host-left' })
      return
    }
    for (const other of this.peers.keys()) this.event(other, { type: 'peer-leave', peerId: id })
  }

  async flush(): Promise<void> {
    for (let round = 0; round < 1000; round++) {
      // let async handlers (op-log queues, requests) catch up before the next delivery
      await new Promise((resolve) => setTimeout(resolve, 0))
      const next = this.queue.shift()
      if (!next) {
        await new Promise((resolve) => setTimeout(resolve, 0))
        if (this.queue.length === 0) return
        continue
      }
      next()
    }
    throw new Error('relay never went quiet')
  }

  private deliver(to: string, call: () => void): void {
    const held = this.peers.get(to)?.held
    if (held) held.push(call)
    else this.queue.push(call)
  }

  private event(to: string, event: CollabEvent): void {
    this.deliver(to, () => {
      for (const handler of [...(this.peers.get(to)?.onEvent ?? [])]) handler(event)
    })
  }

  private route(from: string, to: string | undefined, data: Uint8Array): void {
    const targets = to !== undefined ? [to] : [...this.peers.keys()].filter((id) => id !== from)
    for (const target of targets) {
      const copy = new Uint8Array(data)
      this.deliver(target, () => {
        for (const handler of [...(this.peers.get(target)?.onMessage ?? [])]) {
          handler({ from, data: copy })
        }
      })
    }
  }
}
