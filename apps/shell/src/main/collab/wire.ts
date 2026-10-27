/**
 * The LAN wire format between two app main processes (decision 0073).
 *
 * A frame is a 4-byte big-endian length, one type byte, then the payload.
 * The handshake (HELLO, CHALLENGE, CONFIRM, DENIED) travels in the clear and
 * carries no PIN; everything after it is a SEALED frame whose payload is the
 * inner type and payload, encrypted. Until a guest is admitted the reader
 * only accepts handshake-sized frames, so a socket that never proved the PIN
 * cannot make the host buffer much.
 */
import {
  COLLAB_MAX_BASE_BYTES,
  COLLAB_MAX_MESSAGE_BYTES,
  collabColorOf,
  collabNameOf,
  collabTitleOf,
  isCollabKind,
  type CollabKind,
} from '@genoffice/electron-utils/collab-channels'
import { SEAL_OVERHEAD, type Offer, type SecureChannel } from './secure'

export const WIRE_APP = 'ieumoffice-collab'
export const WIRE_PROTOCOL = 1

export const FRAME = {
  hello: 1,
  welcome: 2,
  denied: 3,
  base: 4,
  relay: 5,
  peer: 6,
  end: 7,
  challenge: 8,
  confirm: 9,
  sealed: 10,
} as const
export type FrameType = (typeof FRAME)[keyof typeof FRAME]

export const PRE_AUTH_MAX_FRAME = 4096
export const MAX_FRAME =
  Math.max(COLLAB_MAX_BASE_BYTES, COLLAB_MAX_MESSAGE_BYTES) + 1024 + SEAL_OVERHEAD
/** offers one CHALLENGE may carry: one per shared document, within the handshake frame size */
export const MAX_OFFERS = 24
const MAX_PEER_ID = 64
const POINT_BYTES = 32
const PROOF_BYTES = 32

export interface Hello {
  app: typeof WIRE_APP
  protocol: number
  /** the guest's SPAKE2 share */
  share: Uint8Array
}

export interface Confirm {
  /** the offer the guest's PIN matched, or -1 for none */
  offer: number
  proof: Uint8Array
}

export interface Welcome {
  protocol: number
  peerId: string
  kind: CollabKind
  title: string
  fileName: string
  hostName: string
  hostColor: number
}

export type DeniedReason = 'pin' | 'locked' | 'full' | 'version'

export interface PeerNotice {
  event: 'join' | 'leave'
  peerId: string
}

export interface Frame {
  type: number
  payload: Buffer
}

export class FrameError extends Error {}

export function encodeFrame(type: FrameType, payload: Uint8Array): Buffer {
  const head = Buffer.alloc(5)
  head.writeUInt32BE(payload.byteLength + 1, 0)
  head.writeUInt8(type, 4)
  return Buffer.concat([head, payload])
}

export function encodeJsonFrame(type: FrameType, value: unknown): Buffer {
  return encodeFrame(type, Buffer.from(JSON.stringify(value), 'utf8'))
}

/** an inner frame, encrypted into a SEALED one */
export function sealFrame(channel: SecureChannel, type: FrameType, payload: Uint8Array): Buffer {
  const inner = Buffer.concat([Buffer.of(type), payload])
  return encodeFrame(FRAME.sealed, channel.seal(inner))
}

export function sealJsonFrame(channel: SecureChannel, type: FrameType, value: unknown): Buffer {
  return sealFrame(channel, type, Buffer.from(JSON.stringify(value), 'utf8'))
}

/** the inner frame of a SEALED one; throws when it was altered or is out of order */
export function openFrame(channel: SecureChannel, frame: Frame): Frame {
  if (frame.type !== FRAME.sealed) throw new FrameError('expected a sealed frame')
  const inner = Buffer.from(channel.open(frame.payload))
  if (inner.byteLength < 1) throw new FrameError('empty sealed frame')
  return { type: inner.readUInt8(0), payload: inner.subarray(1) }
}

/** a relay payload names one peer: the target going to the host, the sender coming from it */
export function relayPayload(peer: string, data: Uint8Array): Buffer {
  const id = Buffer.from(peer, 'utf8')
  if (id.byteLength > MAX_PEER_ID) throw new FrameError('peer id too long')
  return Buffer.concat([Buffer.of(id.byteLength), id, data])
}

export function decodeRelay(payload: Buffer): { peer: string; data: Uint8Array } | null {
  if (payload.byteLength < 1) return null
  const length = payload.readUInt8(0)
  if (length > MAX_PEER_ID || payload.byteLength < 1 + length) return null
  return {
    peer: payload.subarray(1, 1 + length).toString('utf8'),
    // a copy: the reader's buffer is reused for the next frames
    data: new Uint8Array(payload.subarray(1 + length)),
  }
}

function jsonOf(payload: Buffer): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(payload.toString('utf8'))
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

function bytesOf(raw: unknown, length: number): Uint8Array | null {
  if (typeof raw !== 'string' || raw.length > 4 * length) return null
  const bytes = Buffer.from(raw, 'base64')
  return bytes.byteLength === length ? new Uint8Array(bytes) : null
}

export function encodeHello(share: Uint8Array): Buffer {
  return encodeJsonFrame(FRAME.hello, {
    app: WIRE_APP,
    protocol: WIRE_PROTOCOL,
    share: base64(share),
  })
}

export function helloOf(payload: Buffer): Hello | null {
  const raw = jsonOf(payload)
  if (!raw || raw.app !== WIRE_APP || typeof raw.protocol !== 'number') return null
  // another protocol's hello may not parse further; the version check still answers it
  if (raw.protocol !== WIRE_PROTOCOL)
    return { app: WIRE_APP, protocol: raw.protocol, share: new Uint8Array() }
  const share = bytesOf(raw.share, POINT_BYTES)
  return share ? { app: WIRE_APP, protocol: raw.protocol, share } : null
}

export function encodeChallenge(offers: Offer[]): Buffer {
  return encodeJsonFrame(FRAME.challenge, {
    offers: offers.map((offer) => ({ share: base64(offer.share), proof: base64(offer.proof) })),
  })
}

export function challengeOf(payload: Buffer): Offer[] | null {
  const raw = jsonOf(payload)
  if (!raw || !Array.isArray(raw.offers) || raw.offers.length > MAX_OFFERS) return null
  const offers: Offer[] = []
  for (const entry of raw.offers as Array<Record<string, unknown>>) {
    const share = bytesOf(entry?.share, POINT_BYTES)
    const proof = bytesOf(entry?.proof, PROOF_BYTES)
    if (!share || !proof) return null
    offers.push({ share, proof })
  }
  return offers
}

export function encodeConfirm(confirm: Confirm): Buffer {
  return encodeJsonFrame(FRAME.confirm, { offer: confirm.offer, proof: base64(confirm.proof) })
}

export function confirmOf(payload: Buffer): Confirm | null {
  const raw = jsonOf(payload)
  if (!raw || typeof raw.offer !== 'number' || !Number.isInteger(raw.offer)) return null
  if (raw.offer < 0) return { offer: -1, proof: new Uint8Array() }
  const proof = bytesOf(raw.proof, PROOF_BYTES)
  return proof ? { offer: raw.offer, proof } : null
}

export function welcomeOf(payload: Buffer): Welcome | null {
  const raw = jsonOf(payload)
  if (!raw || typeof raw.protocol !== 'number' || !isCollabKind(raw.kind)) return null
  if (typeof raw.peerId !== 'string' || !raw.peerId || raw.peerId.length > MAX_PEER_ID) return null
  return {
    protocol: raw.protocol,
    peerId: raw.peerId,
    kind: raw.kind,
    title: collabTitleOf(raw.title),
    fileName: collabTitleOf(raw.fileName),
    hostName: collabNameOf(raw.hostName),
    hostColor: collabColorOf(raw.hostColor),
  }
}

export function deniedOf(payload: Buffer): DeniedReason {
  const reason = jsonOf(payload)?.reason
  return reason === 'locked' || reason === 'full' || reason === 'version' ? reason : 'pin'
}

export function peerNoticeOf(payload: Buffer): PeerNotice | null {
  const raw = jsonOf(payload)
  if (!raw || (raw.event !== 'join' && raw.event !== 'leave')) return null
  if (typeof raw.peerId !== 'string' || !raw.peerId || raw.peerId.length > MAX_PEER_ID) return null
  return { event: raw.event, peerId: raw.peerId }
}

/**
 * Splits a byte stream into frames. `limit` is read before every frame, so a
 * connection can raise it once the peer is admitted.
 */
export class FrameReader {
  private chunks: Buffer[] = []
  private buffered = 0

  constructor(private readonly limit: () => number) {}

  push(chunk: Buffer): Frame[] {
    this.chunks.push(chunk)
    this.buffered += chunk.byteLength
    const frames: Frame[] = []
    while (this.buffered >= 4) {
      const head = this.peek(4)
      const length = head.readUInt32BE(0)
      if (length < 1 || length > this.limit()) throw new FrameError(`frame of ${length} bytes`)
      if (this.buffered < 4 + length) break
      const whole = this.take(4 + length)
      frames.push({ type: whole.readUInt8(4), payload: whole.subarray(5) })
    }
    return frames
  }

  private peek(size: number): Buffer {
    if (this.chunks[0].byteLength < size) this.chunks = [Buffer.concat(this.chunks)]
    return this.chunks[0].subarray(0, size)
  }

  private take(size: number): Buffer {
    if (this.chunks[0].byteLength < size) this.chunks = [Buffer.concat(this.chunks)]
    const first = this.chunks[0]
    const out = first.subarray(0, size)
    if (first.byteLength === size) this.chunks.shift()
    else this.chunks[0] = first.subarray(size)
    this.buffered -= size
    return out
  }
}
