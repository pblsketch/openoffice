/**
 * Yjs over the shell's relay. The shell forwards opaque messages between the
 * host's tab and each guest's tab; this file speaks the standard y-protocols
 * sync and awareness messages over it, plus two of our own: app messages
 * (an editor's op stream, snapshots) and request/response pairs (a guest
 * asking the host to do something).
 *
 * The host's tab is authoritative: a guest syncs with the host only, and
 * guests reach each other through broadcasts the relay fans out.
 */
import * as Y from 'yjs'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import { COLLAB_HOST_PEER } from '@genoffice/electron-utils/collab-channels'

export const MESSAGE = {
  sync: 0,
  awareness: 1,
  app: 2,
  request: 3,
  response: 4,
} as const

export interface RelayTransport {
  /** to one peer, or everyone else when `to` is absent */
  send(to: string | undefined, data: Uint8Array): void
}

export interface RelayHandlers {
  /** guest: the first full state from the host has been applied */
  synced(): void
  app(topic: string, payload: unknown, from: string): void
  request(id: string, topic: string, payload: unknown, from: string): void
  response(id: string, ok: boolean, payload: unknown): void
}

/** the awareness field that says which relay peer a client belongs to */
export const PEER_FIELD = 'peer'

export class RelayProvider {
  private isSynced = false
  private destroyed = false

  constructor(
    private readonly transport: RelayTransport,
    readonly doc: Y.Doc,
    readonly awareness: awarenessProtocol.Awareness,
    readonly role: 'host' | 'guest',
    private readonly handlers: RelayHandlers,
  ) {
    doc.on('update', this.onDocUpdate)
    awareness.on('update', this.onAwarenessUpdate)
  }

  get synced(): boolean {
    return this.isSynced
  }

  /** tell everyone who this is; a guest also asks the host for everything it has */
  start(): void {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE.awareness)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]),
    )
    this.transport.send(undefined, encoding.toUint8Array(encoder))
    if (this.role === 'host') {
      this.isSynced = true
      return
    }
    this.sendSyncStep1(COLLAB_HOST_PEER)
  }

  /** host: a guest arrived; exchange state with it and tell it who is here */
  peerJoined(peerId: string): void {
    if (this.role !== 'host') return
    this.sendSyncStep1(peerId)
    const clients = [...this.awareness.getStates().keys()]
    if (clients.length > 0) {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE.awareness)
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients),
      )
      this.transport.send(peerId, encoding.toUint8Array(encoder))
    }
  }

  /** a peer left the relay: its carets go now rather than after the awareness timeout */
  peerLeft(peerId: string): void {
    const gone: number[] = []
    for (const [client, state] of this.awareness.getStates()) {
      if (client !== this.doc.clientID && state?.[PEER_FIELD] === peerId) gone.push(client)
    }
    if (gone.length > 0) awarenessProtocol.removeAwarenessStates(this.awareness, gone, this)
  }

  receive(from: string, data: Uint8Array): void {
    if (this.destroyed) return
    const decoder = decoding.createDecoder(data)
    const type = decoding.readVarUint(decoder)
    switch (type) {
      case MESSAGE.sync: {
        // a guest takes document state from the host only
        if (this.role === 'guest' && from !== COLLAB_HOST_PEER) {
          const peek = decoding.clone(decoder)
          if (decoding.readVarUint(peek) !== syncProtocol.messageYjsUpdate) return
        }
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, MESSAGE.sync)
        const syncType = syncProtocol.readSyncMessage(decoder, encoder, this.doc, this)
        if (encoding.length(encoder) > 1) this.transport.send(from, encoding.toUint8Array(encoder))
        if (
          syncType === syncProtocol.messageYjsSyncStep2 &&
          from === COLLAB_HOST_PEER &&
          !this.isSynced
        ) {
          this.isSynced = true
          this.handlers.synced()
        }
        return
      }
      case MESSAGE.awareness:
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          this,
        )
        return
      case MESSAGE.app: {
        const topic = decoding.readVarString(decoder)
        this.handlers.app(topic, decoding.readAny(decoder), from)
        return
      }
      case MESSAGE.request: {
        const id = decoding.readVarString(decoder)
        const topic = decoding.readVarString(decoder)
        this.handlers.request(id, topic, decoding.readAny(decoder), from)
        return
      }
      case MESSAGE.response: {
        const id = decoding.readVarString(decoder)
        const ok = decoding.readVarUint(decoder) === 1
        this.handlers.response(id, ok, decoding.readAny(decoder))
        return
      }
      default:
    }
  }

  sendApp(topic: string, payload: unknown, to?: string): void {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE.app)
    encoding.writeVarString(encoder, topic)
    encoding.writeAny(encoder, payload as never)
    this.transport.send(to, encoding.toUint8Array(encoder))
  }

  sendRequest(id: string, topic: string, payload: unknown, to: string): void {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE.request)
    encoding.writeVarString(encoder, id)
    encoding.writeVarString(encoder, topic)
    encoding.writeAny(encoder, payload as never)
    this.transport.send(to, encoding.toUint8Array(encoder))
  }

  sendResponse(id: string, ok: boolean, payload: unknown, to: string): void {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE.response)
    encoding.writeVarString(encoder, id)
    encoding.writeVarUint(encoder, ok ? 1 : 0)
    encoding.writeAny(encoder, payload as never)
    this.transport.send(to, encoding.toUint8Array(encoder))
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'local')
    this.doc.off('update', this.onDocUpdate)
    this.awareness.off('update', this.onAwarenessUpdate)
  }

  private sendSyncStep1(to: string): void {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE.sync)
    syncProtocol.writeSyncStep1(encoder, this.doc)
    this.transport.send(to, encoding.toUint8Array(encoder))
  }

  private readonly onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.destroyed) return
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE.sync)
    syncProtocol.writeUpdate(encoder, update)
    this.transport.send(undefined, encoding.toUint8Array(encoder))
  }

  private readonly onAwarenessUpdate = (
    change: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this) return
    const changed = [...change.added, ...change.updated, ...change.removed]
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE.awareness)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed),
    )
    this.transport.send(undefined, encoding.toUint8Array(encoder))
  }
}
