/**
 * The host side of LAN co-editing (decision 0073). One TCP listener carries
 * every document this PC shares; a guest names its room by the PIN alone,
 * through the handshake in `secure.ts`, so the PIN never crosses the wire.
 * The listener exists only while something is shared.
 *
 * The host's own editor is one more peer, reached through `HostEndpoint`
 * (in the app, its webContents). Messages are opaque: the server routes them
 * by peer id and never looks inside, so it holds no copy of the document
 * beyond the base file a joining guest is handed.
 */
import { randomBytes } from 'node:crypto'
import { createServer, type Server, type Socket } from 'node:net'
import {
  COLLAB_DEFAULT_PORT,
  COLLAB_HOST_PEER,
  type CollabEvent,
  type CollabKind,
} from '@genoffice/electron-utils/collab-channels'
import { newPin, PinAttempts } from './pin'
import { hostHandshake, type HostHandshake, type SecureChannel } from './secure'
import {
  confirmOf,
  decodeRelay,
  encodeChallenge,
  encodeJsonFrame,
  FRAME,
  FrameReader,
  helloOf,
  MAX_FRAME,
  MAX_OFFERS,
  openFrame,
  PRE_AUTH_MAX_FRAME,
  relayPayload,
  sealFrame,
  sealJsonFrame,
  WIRE_PROTOCOL,
  type DeniedReason,
  type Frame,
  type Welcome,
} from './wire'

export interface HostEndpoint {
  message(from: string, data: Uint8Array): void
  event(event: CollabEvent): void
}

export interface RoomSpec {
  kind: CollabKind
  title: string
  fileName: string
  hostName: string
  hostColor: number
  base: Uint8Array
  endpoint: HostEndpoint
}

export interface HostedRoom {
  readonly pin: string
  readonly port: number
  /** to one guest, or to every guest when `to` is absent */
  send(to: string | undefined, data: Uint8Array): void
  newPin(): string
  close(reason: 'stopped' | 'host-left'): void
}

export interface CollabHostServerOptions {
  port?: number
  /** tests bind to loopback; the app listens on every interface */
  bindAddress?: string
  maxGuests?: number
  helloTimeoutMs?: number
  now?: () => number
}

const DEFAULT_MAX_GUESTS = 16
const HELLO_TIMEOUT_MS = 10_000
/** a guest that stops reading is dropped before its backlog eats the host's memory */
const MAX_PENDING_BYTES = 2 * MAX_FRAME

interface Guest {
  socket: Socket
  channel: SecureChannel
}

function addressOf(socket: Socket): string {
  return (socket.remoteAddress ?? '').replace(/^::ffff:/, '')
}

function write(socket: Socket, frame: Buffer): void {
  if (socket.destroyed) return
  if (socket.writableLength > MAX_PENDING_BYTES) {
    socket.destroy()
    return
  }
  socket.write(frame)
}

class Room implements HostedRoom {
  readonly guests = new Map<string, Guest>()
  pin: string
  closed = false

  constructor(
    private readonly server: CollabHostServer,
    readonly spec: RoomSpec,
    pin: string,
  ) {
    this.pin = pin
  }

  get port(): number {
    return this.server.port ?? 0
  }

  admit(socket: Socket, channel: SecureChannel): string {
    const peerId = randomBytes(4).toString('hex')
    const welcome: Welcome = {
      protocol: WIRE_PROTOCOL,
      peerId,
      kind: this.spec.kind,
      title: this.spec.title,
      fileName: this.spec.fileName,
      hostName: this.spec.hostName,
      hostColor: this.spec.hostColor,
    }
    write(socket, sealJsonFrame(channel, FRAME.welcome, welcome))
    write(socket, sealFrame(channel, FRAME.base, this.spec.base))
    for (const other of this.guests.values()) {
      write(other.socket, sealJsonFrame(other.channel, FRAME.peer, { event: 'join', peerId }))
    }
    this.guests.set(peerId, { socket, channel })
    this.spec.endpoint.event({ type: 'peer-join', peerId })
    return peerId
  }

  fromGuest(peerId: string, frame: Frame): void {
    if (frame.type !== FRAME.relay) return
    const relay = decodeRelay(frame.payload)
    if (!relay) return
    if (relay.peer === COLLAB_HOST_PEER) {
      this.spec.endpoint.message(peerId, relay.data)
      return
    }
    if (relay.peer) {
      const target = this.guests.get(relay.peer)
      if (target) this.relayTo(target, peerId, relay.data)
      return
    }
    this.spec.endpoint.message(peerId, relay.data)
    for (const [id, guest] of this.guests)
      if (id !== peerId) this.relayTo(guest, peerId, relay.data)
  }

  drop(peerId: string): void {
    if (!this.guests.delete(peerId) || this.closed) return
    this.spec.endpoint.event({ type: 'peer-leave', peerId })
    for (const guest of this.guests.values()) {
      write(guest.socket, sealJsonFrame(guest.channel, FRAME.peer, { event: 'leave', peerId }))
    }
  }

  send(to: string | undefined, data: Uint8Array): void {
    if (this.closed) return
    if (to !== undefined) {
      const guest = this.guests.get(to)
      if (guest) this.relayTo(guest, COLLAB_HOST_PEER, data)
      return
    }
    for (const guest of this.guests.values()) this.relayTo(guest, COLLAB_HOST_PEER, data)
  }

  newPin(): string {
    this.pin = newPin(this.server.pinsInUse(this))
    return this.pin
  }

  close(reason: 'stopped' | 'host-left'): void {
    if (this.closed) return
    this.closed = true
    for (const guest of this.guests.values()) {
      guest.socket.end(sealJsonFrame(guest.channel, FRAME.end, { reason }))
      setTimeout(() => guest.socket.destroy(), 2_000).unref()
    }
    this.guests.clear()
    this.server.forget(this)
  }

  // each guest has its own keys, so a broadcast is sealed once per guest
  private relayTo(guest: Guest, from: string, data: Uint8Array): void {
    write(guest.socket, sealFrame(guest.channel, FRAME.relay, relayPayload(from, data)))
  }
}

export class CollabHostServer {
  private server: Server | null = null
  private listening: Promise<number> | null = null
  private boundPort: number | null = null
  private readonly rooms = new Set<Room>()
  private readonly attempts: PinAttempts

  constructor(private readonly options: CollabHostServerOptions = {}) {
    this.attempts = new PinAttempts(options.now)
  }

  get port(): number | null {
    return this.boundPort
  }

  get roomCount(): number {
    return this.rooms.size
  }

  /** the rooms announced on the LAN */
  openRooms(): Array<{ kind: CollabKind; title: string; hostName: string }> {
    return [...this.rooms].map(({ spec }) => ({
      kind: spec.kind,
      title: spec.title,
      hostName: spec.hostName,
    }))
  }

  async open(spec: RoomSpec): Promise<HostedRoom> {
    await this.listen()
    const room = new Room(this, spec, newPin(this.pinsInUse()))
    this.rooms.add(room)
    return room
  }

  close(): void {
    for (const room of [...this.rooms]) room.close('host-left')
    this.stopListening()
  }

  pinsInUse(except?: Room): Set<string> {
    return new Set([...this.rooms].filter((room) => room !== except).map((room) => room.pin))
  }

  forget(room: Room): void {
    this.rooms.delete(room)
    if (this.rooms.size === 0) this.stopListening()
  }

  private listen(): Promise<number> {
    if (this.listening) return this.listening
    const server = createServer((socket) => this.accept(socket))
    this.server = server
    const host = this.options.bindAddress ?? '0.0.0.0'
    const preferred = this.options.port ?? COLLAB_DEFAULT_PORT
    const attempt = (port: number) =>
      new Promise<number>((resolve, reject) => {
        const onError = (err: Error) => reject(err)
        server.once('error', onError)
        server.listen(port, host, () => {
          server.off('error', onError)
          const address = server.address()
          resolve(typeof address === 'object' && address ? address.port : port)
        })
      })
    this.listening = attempt(preferred)
      // another program holds the usual port: take any free one and show it
      .catch((err: NodeJS.ErrnoException) =>
        err.code === 'EADDRINUSE' ? attempt(0) : Promise.reject(err),
      )
      .then((port) => {
        this.boundPort = port
        server.on('error', (err) => console.error('[collab] listener error:', err))
        return port
      })
      .catch((err) => {
        this.stopListening()
        throw err
      })
    return this.listening
  }

  private stopListening(): void {
    this.server?.close()
    this.server = null
    this.listening = null
    this.boundPort = null
  }

  private replaceAllPins(): void {
    for (const room of this.rooms) {
      room.newPin()
      room.spec.endpoint.event({ type: 'pin', pin: room.pin })
    }
  }

  /**
   * One guess at a PIN. The challenge lets a client check its guess without
   * answering, so the guess is spent before the challenge goes out, even when
   * many connections arrive at once; a right PIN gets it back (`admit`).
   */
  private spend(address: string): void {
    if (this.attempts.miss(address).replacePins) this.replaceAllPins()
  }

  private accept(socket: Socket): void {
    const address = addressOf(socket)
    // what the handshake has reached: one answer per room offered, then the admitted guest
    let offered: Array<{ room: Room; pin: string; handshake: HostHandshake }> | null = null
    let joined: { room: Room; peerId: string; channel: SecureChannel } | null = null
    let finished = false
    socket.setNoDelay(true)
    socket.setKeepAlive(true, 15_000)
    socket.on('error', () => {})
    const reader = new FrameReader(() => (joined ? MAX_FRAME : PRE_AUTH_MAX_FRAME))
    const handshakeTimer = setTimeout(
      () => socket.destroy(),
      this.options.helloTimeoutMs ?? HELLO_TIMEOUT_MS,
    )
    handshakeTimer.unref()

    const deny = (reason: DeniedReason) => {
      finished = true
      clearTimeout(handshakeTimer)
      socket.end(encodeJsonFrame(FRAME.denied, { reason }))
      setTimeout(() => socket.destroy(), 1_000).unref()
    }

    const onHello = (frame: Frame) => {
      const hello = frame.type === FRAME.hello ? helloOf(frame.payload) : null
      if (!hello) {
        socket.destroy()
        return
      }
      if (hello.protocol !== WIRE_PROTOCOL) return deny('version')
      if (this.attempts.isLocked(address)) return deny('locked')
      this.spend(address)
      offered = []
      for (const room of [...this.rooms].slice(0, MAX_OFFERS)) {
        const handshake = hostHandshake(room.pin, hello.share)
        if (handshake) offered.push({ room, pin: room.pin, handshake })
      }
      if (offered.length === 0) {
        socket.destroy()
        return
      }
      socket.write(encodeChallenge(offered.map(({ handshake }) => handshake.offer)))
    }

    const onConfirm = (
      frame: Frame,
      candidates: Array<{ room: Room; pin: string; handshake: HostHandshake }>,
    ) => {
      const confirm = frame.type === FRAME.confirm ? confirmOf(frame.payload) : null
      const chosen = confirm && confirm.offer >= 0 ? candidates[confirm.offer] : undefined
      const channel = chosen && confirm ? chosen.handshake.confirm(confirm.proof) : null
      // a PIN replaced since the challenge went out lets no one in
      if (!chosen || !channel || chosen.room.closed || chosen.room.pin !== chosen.pin) {
        return deny(this.attempts.isLocked(address) ? 'locked' : 'pin')
      }
      this.attempts.admit(address)
      if (chosen.room.guests.size >= (this.options.maxGuests ?? DEFAULT_MAX_GUESTS)) {
        return deny('full')
      }
      finished = true
      clearTimeout(handshakeTimer)
      joined = { room: chosen.room, channel, peerId: chosen.room.admit(socket, channel) }
    }

    socket.on('data', (chunk: Buffer) => {
      let frames: Frame[]
      try {
        frames = reader.push(chunk)
      } catch {
        socket.destroy()
        return
      }
      for (const frame of frames) {
        if (socket.destroyed) return
        if (joined) {
          let inner: Frame
          try {
            inner = openFrame(joined.channel, frame)
          } catch {
            // altered, replayed or not sealed: this connection can no longer be trusted
            socket.destroy()
            return
          }
          joined.room.fromGuest(joined.peerId, inner)
        } else if (finished) {
          return
        } else if (offered) {
          onConfirm(frame, offered)
        } else {
          onHello(frame)
        }
      }
    })
    socket.on('close', () => {
      clearTimeout(handshakeTimer)
      if (joined) joined.room.drop(joined.peerId)
    })
  }
}
