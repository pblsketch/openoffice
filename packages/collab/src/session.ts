/**
 * One co-editing session as an editor sees it: the shared Y.Doc and presence,
 * who is here, app messages for editors that sync through an op stream, and
 * the end of the session. Editors never talk to the bridge themselves.
 */
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import type { CollabBridge } from '@genoffice/electron-utils/collab-bridge'
import {
  COLLAB_HOST_PEER,
  collabColorOf,
  type CollabEndReason,
  type CollabHostInfo,
  type CollabKind,
  type CollabProfile,
  type CollabTicket,
} from '@genoffice/electron-utils/collab-channels'
import { PEER_FIELD, RelayProvider } from './provider'

export type CollabRole = 'host' | 'guest'

/**
 * What every peer publishes about itself. `color` and `colorLight` are CSS
 * values because the editor bindings paint carets with them as they are.
 */
export interface CollabUser {
  name: string
  palette: number
  color: string
  colorLight: string
  host: boolean
}

export interface CollabPeer {
  clientId: number
  name: string
  /** index into the --collab-<n> palette */
  color: number
  host: boolean
  self: boolean
}

export function collabUserOf(profile: CollabProfile, host: boolean): CollabUser {
  const color = `var(--collab-${profile.color})`
  return {
    name: profile.name,
    palette: profile.color,
    color,
    colorLight: `color-mix(in srgb, ${color} 25%, transparent)`,
    host,
  }
}

type AppHandler = (payload: unknown, from: string) => void
type RequestHandler = (payload: unknown, from: string) => unknown

const REQUEST_TIMEOUT_MS = 30_000
/** app messages kept per topic until an editor listens for it */
const MAX_UNHEARD = 10_000

export class CollabRequestError extends Error {}

function listeners<T extends unknown[]>() {
  const set = new Set<(...args: T) => void>()
  return {
    add(handler: (...args: T) => void): () => void {
      set.add(handler)
      return () => {
        set.delete(handler)
      }
    },
    emit(...args: T): void {
      for (const handler of [...set]) handler(...args)
    },
  }
}

export class CollabSession {
  readonly doc = new Y.Doc()
  readonly awareness: Awareness
  /** guest: resolves once the host's state has arrived; host: already resolved */
  readonly synced: Promise<void>

  private readonly provider: RelayProvider
  private readonly appHandlers = new Map<string, Set<AppHandler>>()
  private readonly unheard = new Map<string, Array<[unknown, string]>>()
  private readonly requestHandlers = new Map<string, RequestHandler>()
  private readonly pending = new Map<
    string,
    {
      resolve(value: unknown): void
      reject(err: Error): void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private readonly peerJoins = listeners<[string]>()
  private readonly pinChanges = listeners<[string]>()
  private readonly ends = listeners<[CollabEndReason]>()
  private readonly offBridge: Array<() => void> = []
  private requestSeq = 0
  private endReason: CollabEndReason | null = null
  private resolveSynced!: () => void

  constructor(
    private readonly bridge: CollabBridge,
    readonly role: CollabRole,
    readonly kind: CollabKind,
    /** this tab's id on the relay: COLLAB_HOST_PEER for the host */
    readonly peerId: string,
    user: CollabProfile,
    /** host: what guests type in */
    public hostInfo: CollabHostInfo | null,
    /** guest: what the host told it at the door */
    readonly ticket: CollabTicket | null,
  ) {
    this.awareness = new Awareness(this.doc)
    this.awareness.setLocalState({
      [PEER_FIELD]: peerId,
      user: collabUserOf(user, role === 'host'),
    })
    this.synced = new Promise((resolve) => {
      this.resolveSynced = resolve
    })
    this.provider = new RelayProvider(
      { send: (to, data) => bridge.send(to === undefined ? { data } : { to, data }) },
      this.doc,
      this.awareness,
      role,
      {
        synced: () => this.resolveSynced(),
        app: (topic, payload, from) => {
          const handlers = this.appHandlers.get(topic)
          if (handlers && handlers.size > 0) {
            for (const handler of [...handlers]) handler(payload, from)
            return
          }
          // the editor binds after the first sync; what came before waits for it
          const held = this.unheard.get(topic) ?? []
          if (held.length < MAX_UNHEARD) held.push([payload, from])
          this.unheard.set(topic, held)
        },
        request: (id, topic, payload, from) => void this.answer(id, topic, payload, from),
        response: (id, ok, payload) => {
          const waiting = this.pending.get(id)
          if (!waiting) return
          this.pending.delete(id)
          clearTimeout(waiting.timer)
          if (ok) waiting.resolve(payload)
          else waiting.reject(new CollabRequestError(String(payload)))
        },
      },
    )
    this.offBridge.push(
      bridge.onMessage(({ from, data }) => this.provider.receive(from, data)),
      bridge.onEvent((event) => {
        if (event.type === 'peer-join') {
          this.provider.peerJoined(event.peerId)
          this.peerJoins.emit(event.peerId)
        } else if (event.type === 'peer-leave') {
          this.provider.peerLeft(event.peerId)
        } else if (event.type === 'pin') {
          if (this.hostInfo) this.hostInfo = { ...this.hostInfo, pin: event.pin }
          this.pinChanges.emit(event.pin)
        } else if (event.type === 'ended') {
          this.finish(event.reason)
        }
      }),
    )
    if (role === 'host') this.resolveSynced()
  }

  /** begins syncing; call once the editor is bound so nothing is missed */
  start(): void {
    this.provider.start()
  }

  get ended(): CollabEndReason | null {
    return this.endReason
  }

  setUser(user: CollabProfile): void {
    this.awareness.setLocalStateField('user', collabUserOf(user, this.role === 'host'))
  }

  peers(): CollabPeer[] {
    const out: CollabPeer[] = []
    for (const [clientId, state] of this.awareness.getStates()) {
      const user = state?.user as Partial<CollabUser> | undefined
      if (!user || typeof user.name !== 'string') continue
      out.push({
        clientId,
        name: user.name,
        color: collabColorOf(user.palette),
        host: user.host === true,
        self: clientId === this.doc.clientID,
      })
    }
    // the host first, then me, then everyone else in arrival order
    return out.sort((a, b) => Number(b.host) - Number(a.host) || Number(b.self) - Number(a.self))
  }

  /**
   * Publish where this person is in an editor-specific shape (a cell, a slide
   * and shape, a page and rectangle); null clears it. Text editors bound
   * through `tiptap`/`codemirror` already publish their caret.
   */
  setPresence(field: string, value: unknown): void {
    if (!this.endReason) this.awareness.setLocalStateField(field, value)
  }

  /** everyone else's value for `field`, with who they are */
  presences<T>(field: string): Array<{ clientId: number; user: CollabUser; value: T }> {
    const out: Array<{ clientId: number; user: CollabUser; value: T }> = []
    for (const [clientId, state] of this.awareness.getStates()) {
      if (clientId === this.doc.clientID) continue
      const value = state?.[field] as T | null | undefined
      const user = state?.user as CollabUser | undefined
      if (value === null || value === undefined || !user || typeof user.name !== 'string') continue
      out.push({ clientId, user, value })
    }
    return out
  }

  onPeersChanged(handler: () => void): () => void {
    this.awareness.on('change', handler)
    return () => this.awareness.off('change', handler)
  }

  /** an app message to one peer, or to everyone else */
  send(topic: string, payload: unknown, to?: string): void {
    if (!this.endReason) this.provider.sendApp(topic, payload, to)
  }

  on(topic: string, handler: AppHandler): () => void {
    let set = this.appHandlers.get(topic)
    if (!set) this.appHandlers.set(topic, (set = new Set()))
    const handlers = set
    handlers.add(handler)
    const held = this.unheard.get(topic)
    if (held) {
      this.unheard.delete(topic)
      for (const [payload, from] of held) handler(payload, from)
    }
    return () => {
      handlers.delete(handler)
    }
  }

  /** host: a guest arrived, after its copy and the shared state went out to it */
  onPeerJoin(handler: (peerId: string) => void): () => void {
    return this.peerJoins.add(handler)
  }

  onPinChanged(handler: (pin: string) => void): () => void {
    return this.pinChanges.add(handler)
  }

  /** guest: ask the host and wait for its answer */
  request(topic: string, payload: unknown): Promise<unknown> {
    if (this.endReason) return Promise.reject(new CollabRequestError('ended'))
    const id = `${this.peerId}:${++this.requestSeq}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new CollabRequestError('timeout'))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      this.provider.sendRequest(id, topic, payload, COLLAB_HOST_PEER)
    })
  }

  /** host: answer guests' requests for `topic`; a throw becomes the guest's rejection */
  handle(topic: string, handler: RequestHandler): () => void {
    this.requestHandlers.set(topic, handler)
    return () => {
      if (this.requestHandlers.get(topic) === handler) this.requestHandlers.delete(topic)
    }
  }

  onEnd(handler: (reason: CollabEndReason) => void): () => void {
    return this.ends.add(handler)
  }

  /** host: end it for everyone; guest: leave (the copy stays as an unsaved document) */
  async leave(): Promise<void> {
    if (this.endReason) return
    this.finish('stopped')
    await this.bridge.leave()
  }

  /** a session that never went live: drop it without telling the shell */
  discard(): void {
    this.finish('stopped')
  }

  private async answer(id: string, topic: string, payload: unknown, from: string): Promise<void> {
    const handler = this.role === 'host' ? this.requestHandlers.get(topic) : undefined
    try {
      if (!handler) throw new Error(`no handler for ${topic}`)
      this.provider.sendResponse(id, true, (await handler(payload, from)) ?? null, from)
    } catch (err) {
      this.provider.sendResponse(id, false, err instanceof Error ? err.message : String(err), from)
    }
  }

  private finish(reason: CollabEndReason): void {
    if (this.endReason) return
    this.endReason = reason
    for (const off of this.offBridge.splice(0)) off()
    for (const waiting of this.pending.values()) {
      clearTimeout(waiting.timer)
      waiting.reject(new CollabRequestError('ended'))
    }
    this.pending.clear()
    this.provider.destroy()
    this.awareness.destroy()
    this.ends.emit(reason)
  }
}
