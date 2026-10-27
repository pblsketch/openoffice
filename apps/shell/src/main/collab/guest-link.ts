/**
 * The guest side of LAN co-editing (decision 0073): one TCP connection to a
 * host, admitted by PIN through the handshake in `secure.ts`; the PIN itself
 * never leaves this PC. `connectToHost` resolves only once the host has
 * welcomed the guest and handed over the base file; anything else rejects
 * with the reason the join dialog shows.
 */
import { connect, isIP, type Socket } from 'node:net'
import {
  COLLAB_DEFAULT_PORT,
  type CollabEndReason,
  type CollabJoinFail,
} from '@genoffice/electron-utils/collab-channels'
import { guestHandshake, type SecureChannel } from './secure'
import {
  challengeOf,
  decodeRelay,
  deniedOf,
  encodeConfirm,
  encodeHello,
  FRAME,
  FrameReader,
  MAX_FRAME,
  openFrame,
  peerNoticeOf,
  PRE_AUTH_MAX_FRAME,
  relayPayload,
  sealFrame,
  welcomeOf,
  type Frame,
  type PeerNotice,
  type Welcome,
} from './wire'

export class CollabJoinError extends Error {
  constructor(readonly reason: CollabJoinFail) {
    super(reason)
  }
}

export interface GuestLinkHandlers {
  message(from: string, data: Uint8Array): void
  peer(notice: PeerNotice): void
  ended(reason: CollabEndReason): void
}

export interface GuestLink {
  readonly welcome: Welcome
  readonly base: Uint8Array
  /** handlers start receiving only once set; earlier traffic waits for them */
  attach(handlers: GuestLinkHandlers): void
  /** to the host or one guest, or to everyone when `to` is absent */
  send(to: string | undefined, data: Uint8Array): void
  close(): void
}

export interface ConnectOptions {
  address: string
  port?: number
  pin: string
  timeoutMs?: number
}

const CONNECT_TIMEOUT_MS = 15_000

/** an IPv4/IPv6 literal or a plain host name, nothing that could smuggle a path or port */
export function hostAddressOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value || value.length > 253) return null
  if (isIP(value)) return value
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}))*$/.test(value)
    ? value
    : null
}

export function connectToHost(options: ConnectOptions): Promise<GuestLink> {
  return new Promise((resolve, reject) => {
    const socket: Socket = connect({
      host: options.address,
      port: options.port ?? COLLAB_DEFAULT_PORT,
    })
    socket.setNoDelay(true)
    socket.setKeepAlive(true, 15_000)
    const handshake = guestHandshake(options.pin)
    let channel: SecureChannel | null = null
    // a guest that found no matching document still waits for the host's verdict
    let noMatch = false
    let welcome: Welcome | null = null
    let settled = false
    let ended: CollabEndReason | null = null
    let handlers: GuestLinkHandlers | null = null
    const backlog: Array<(h: GuestLinkHandlers) => void> = []

    const fail = (reason: CollabJoinFail) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      reject(new CollabJoinError(reason))
    }
    const timer = setTimeout(() => fail('timeout'), options.timeoutMs ?? CONNECT_TIMEOUT_MS)
    timer.unref()

    const deliver = (call: (h: GuestLinkHandlers) => void) => {
      if (handlers) call(handlers)
      else backlog.push(call)
    }
    const finish = (reason: CollabEndReason) => {
      if (ended) return
      ended = reason
      deliver((h) => h.ended(reason))
    }

    const link = (base: Uint8Array, secure: SecureChannel): GuestLink => ({
      welcome: welcome!,
      base,
      attach(next) {
        handlers = next
        for (const call of backlog.splice(0)) call(next)
      },
      send(to, data) {
        if (!socket.destroyed && !ended) {
          socket.write(sealFrame(secure, FRAME.relay, relayPayload(to ?? '', data)))
        }
      },
      close() {
        ended ??= 'stopped'
        socket.destroy()
      },
    })

    // before admission: the host's challenge, a refusal, or (once sealed) the welcome and base
    const onHandshake = (frame: Frame) => {
      if (frame.type === FRAME.denied) return fail(deniedOf(frame.payload))
      if (!channel) {
        const offers = frame.type === FRAME.challenge ? challengeOf(frame.payload) : null
        if (!offers || noMatch) return fail('version')
        const chosen = handshake.choose(offers)
        if (!chosen) {
          // tell the host, which counts the miss and answers with pin or locked
          noMatch = true
          socket.write(encodeConfirm({ offer: -1, proof: new Uint8Array() }))
          return
        }
        channel = chosen.channel
        socket.write(encodeConfirm({ offer: chosen.index, proof: chosen.proof }))
        return
      }
      const inner = openFrame(channel, frame)
      if (!welcome) {
        welcome = inner.type === FRAME.welcome ? welcomeOf(inner.payload) : null
        if (!welcome) fail('version')
        return
      }
      if (inner.type !== FRAME.base) return fail('version')
      settled = true
      clearTimeout(timer)
      resolve(link(new Uint8Array(inner.payload), channel))
    }

    const onSession = (frame: Frame, secure: SecureChannel) => {
      const inner = openFrame(secure, frame)
      if (inner.type === FRAME.relay) {
        const relay = decodeRelay(inner.payload)
        if (relay) deliver((h) => h.message(relay.peer, relay.data))
      } else if (inner.type === FRAME.peer) {
        const notice = peerNoticeOf(inner.payload)
        if (notice) deliver((h) => h.peer(notice))
      } else if (inner.type === FRAME.end) {
        // stopped or closed, for the guest the host has gone either way
        finish('host-left')
      }
    }

    // the welcome and the whole document arrive before the guest is settled
    const reader = new FrameReader(() => (channel ? MAX_FRAME : PRE_AUTH_MAX_FRAME))
    socket.on('connect', () => socket.write(encodeHello(handshake.share)))
    socket.on('data', (chunk: Buffer) => {
      try {
        for (const frame of reader.push(chunk)) {
          if (!settled) onHandshake(frame)
          else if (channel) onSession(frame, channel)
        }
      } catch {
        // an altered or unreadable frame: nothing after it can be trusted
        if (!settled) fail('version')
        socket.destroy()
      }
    })
    socket.on('error', (err: NodeJS.ErrnoException) => {
      if (!settled) fail(err.code === 'ETIMEDOUT' ? 'timeout' : 'unreachable')
    })
    socket.on('close', () => {
      if (!settled) fail(noMatch ? 'pin' : 'unreachable')
      else finish('connection-lost')
    })
  })
}
