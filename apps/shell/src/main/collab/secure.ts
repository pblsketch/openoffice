/**
 * The encrypted channel between two PCs in a session (decision 0073).
 *
 * A six-digit PIN is far too short to be a key: anyone who recorded a
 * handshake keyed by it could try all million PINs offline. So the two sides
 * run SPAKE2 over ristretto255 with the PIN as the password. Someone watching
 * the network learns nothing, someone in the middle gets one guess per
 * connection (which the host's miss limits count), and the PIN itself never
 * crosses the wire. The agreed secret then keys ChaCha20-Poly1305 for every
 * frame, one key per direction with a counter nonce.
 *
 * A host may share several documents, each with its own PIN, and a guest only
 * types the PIN. So the host answers a guest's first message once per open
 * document; only the one whose PIN matches proves itself to the guest.
 */
import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { ristretto255, ristretto255_hasher } from '@noble/curves/ed25519.js'
import { chacha20poly1305 } from '@noble/ciphers/chacha.js'

const Point = ristretto255.Point
type Point = InstanceType<typeof Point>

const CONTEXT = 'ieumoffice-collab spake2 v1'
const ORDER = Point.Fn.ORDER
const utf8 = (text: string) => new TextEncoder().encode(text)
// fixed points with no known discrete log, one per side (RFC 9382)
const M = ristretto255_hasher.hashToCurve(utf8('M'), { DST: CONTEXT })
const N = ristretto255_hasher.hashToCurve(utf8('N'), { DST: CONTEXT })

const KEY_BYTES = 32
const TAG_BYTES = 16

function scalarOf(bytes: Uint8Array): bigint {
  let n = 0n
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i])
  const scalar = n % ORDER
  return scalar === 0n ? 1n : scalar
}

const randomScalar = () => scalarOf(randomBytes(64))

function pinScalar(pin: string): { scalar: bigint; bytes: Uint8Array } {
  const bytes = createHash('sha512').update(CONTEXT).update('\0').update(pin, 'utf8').digest()
  return { scalar: scalarOf(bytes), bytes }
}

function pointOf(bytes: Uint8Array): Point | null {
  try {
    const point = Point.fromBytes(bytes)
    return point.is0() ? null : point
  } catch {
    return null
  }
}

/** length-prefixed concatenation, so no two different transcripts hash alike */
function transcript(parts: Uint8Array[]): Buffer {
  const chunks: Buffer[] = []
  for (const part of parts) {
    const length = Buffer.alloc(8)
    length.writeBigUInt64LE(BigInt(part.byteLength))
    chunks.push(length, Buffer.from(part))
  }
  return Buffer.concat(chunks)
}

function derive(prk: Buffer, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', prk, Buffer.alloc(0), info, KEY_BYTES))
}

interface Agreed {
  guestProof: Buffer
  hostProof: Buffer
  guestToHost: Buffer
  hostToGuest: Buffer
}

function agree(
  guestShare: Uint8Array,
  hostShare: Uint8Array,
  shared: Point,
  w: Uint8Array,
): Agreed {
  const tt = transcript([utf8(CONTEXT), guestShare, hostShare, shared.toBytes(), w])
  const prk = createHash('sha256').update(tt).digest()
  const proof = (info: string) => createHmac('sha256', derive(prk, info)).update(tt).digest()
  return {
    guestProof: proof('confirm guest'),
    hostProof: proof('confirm host'),
    guestToHost: derive(prk, 'key guest to host'),
    hostToGuest: derive(prk, 'key host to guest'),
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && timingSafeEqual(a, b)
}

/** one frame direction: ChaCha20-Poly1305 with a counter nonce, so nothing repeats or reorders */
class Direction {
  private counter = 0n

  constructor(private readonly key: Uint8Array) {}

  nonce(): Uint8Array {
    const nonce = new Uint8Array(12)
    new DataView(nonce.buffer).setBigUint64(4, this.counter++)
    return nonce
  }

  seal(plain: Uint8Array): Uint8Array {
    return chacha20poly1305(this.key, this.nonce()).encrypt(plain)
  }

  open(sealed: Uint8Array): Uint8Array {
    if (sealed.byteLength < TAG_BYTES) throw new Error('sealed frame too short')
    // throws when the frame was altered, dropped, replayed or reordered
    return chacha20poly1305(this.key, this.nonce()).decrypt(sealed)
  }
}

export class SecureChannel {
  private readonly out: Direction
  private readonly in: Direction

  constructor(sendKey: Uint8Array, receiveKey: Uint8Array) {
    this.out = new Direction(sendKey)
    this.in = new Direction(receiveKey)
  }

  seal(plain: Uint8Array): Uint8Array {
    return this.out.seal(plain)
  }

  open(sealed: Uint8Array): Uint8Array {
    return this.in.open(sealed)
  }
}

export const SEAL_OVERHEAD = TAG_BYTES

/** the host's answer for one shared document */
export interface Offer {
  share: Uint8Array
  proof: Uint8Array
}

/** the host side of one handshake, per shared document */
export interface HostHandshake {
  offer: Offer
  /** accepts the guest's proof; the channel to talk on, or null for a wrong PIN */
  confirm(guestProof: Uint8Array): SecureChannel | null
}

export function hostHandshake(pin: string, guestShare: Uint8Array): HostHandshake | null {
  const t = pointOf(guestShare)
  if (!t) return null
  const w = pinScalar(pin)
  const y = randomScalar()
  const share = Point.BASE.multiply(y).add(N.multiplyUnsafe(w.scalar)).toBytes()
  const shared = t.subtract(M.multiplyUnsafe(w.scalar)).multiply(y)
  if (shared.is0()) return null
  const agreed = agree(guestShare, share, shared, w.bytes)
  return {
    offer: { share, proof: agreed.hostProof },
    confirm: (guestProof) =>
      sameBytes(guestProof, agreed.guestProof)
        ? new SecureChannel(agreed.hostToGuest, agreed.guestToHost)
        : null,
  }
}

/** the guest side: its first message, then the offer whose PIN matches */
export interface GuestHandshake {
  share: Uint8Array
  /** the index of the matching offer with the proof to send back, or null if none matches */
  choose(offers: Offer[]): { index: number; proof: Uint8Array; channel: SecureChannel } | null
}

export function guestHandshake(pin: string): GuestHandshake {
  const w = pinScalar(pin)
  const x = randomScalar()
  const share = Point.BASE.multiply(x).add(M.multiplyUnsafe(w.scalar)).toBytes()
  return {
    share,
    choose(offers) {
      for (const [index, offer] of offers.entries()) {
        const s = pointOf(offer.share)
        if (!s) continue
        const shared = s.subtract(N.multiplyUnsafe(w.scalar)).multiply(x)
        if (shared.is0()) continue
        const agreed = agree(share, offer.share, shared, w.bytes)
        if (!sameBytes(offer.proof, agreed.hostProof)) continue
        return {
          index,
          proof: agreed.guestProof,
          channel: new SecureChannel(agreed.guestToHost, agreed.hostToGuest),
        }
      }
      return null
    },
  }
}
