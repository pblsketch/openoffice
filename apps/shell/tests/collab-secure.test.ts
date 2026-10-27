import { describe, expect, it } from 'vitest'
import { guestHandshake, hostHandshake } from '../src/main/collab/secure'

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
const bytes = (value: string) => new TextEncoder().encode(value)

describe('collab handshake and channel', () => {
  it('agrees on a channel when the PINs match, in both directions', () => {
    const guest = guestHandshake('482913')
    const host = hostHandshake('482913', guest.share)!
    const chosen = guest.choose([host.offer])!
    expect(chosen.index).toBe(0)
    const hostChannel = host.confirm(chosen.proof)!
    expect(hostChannel).not.toBeNull()

    expect(text(hostChannel.open(chosen.channel.seal(bytes('from guest'))))).toBe('from guest')
    expect(text(chosen.channel.open(hostChannel.seal(bytes('from host'))))).toBe('from host')
    // the counter moves on: a second frame still opens
    expect(text(hostChannel.open(chosen.channel.seal(bytes('again'))))).toBe('again')
  })

  it('finds no offer for a wrong PIN, and the host refuses a forged proof', () => {
    const guest = guestHandshake('000000')
    const host = hostHandshake('482913', guest.share)!
    expect(guest.choose([host.offer])).toBeNull()
    expect(host.confirm(new Uint8Array(32))).toBeNull()
  })

  it('picks the document whose PIN matches among several', () => {
    const guest = guestHandshake('222222')
    const offers = ['111111', '222222', '333333'].map((pin) => hostHandshake(pin, guest.share)!)
    const chosen = guest.choose(offers.map((h) => h.offer))!
    expect(chosen.index).toBe(1)
    expect(offers[1].confirm(chosen.proof)).not.toBeNull()
    expect(offers[0].confirm(chosen.proof)).toBeNull()
  })

  it('never puts the PIN or its hash on the wire', () => {
    const guest = guestHandshake('482913')
    const host = hostHandshake('482913', guest.share)!
    const wire = Buffer.concat([guest.share, host.offer.share, host.offer.proof]).toString('latin1')
    expect(wire).not.toContain('482913')
    // two handshakes with the same PIN look unrelated
    expect(Buffer.from(guestHandshake('482913').share).equals(Buffer.from(guest.share))).toBe(false)
  })

  it('refuses a frame that was altered, replayed or reordered', () => {
    const guest = guestHandshake('482913')
    const host = hostHandshake('482913', guest.share)!
    const chosen = guest.choose([host.offer])!
    const hostChannel = host.confirm(chosen.proof)!
    const first = chosen.channel.seal(bytes('one'))
    const second = chosen.channel.seal(bytes('two'))

    const tampered = new Uint8Array(first)
    tampered[0] ^= 1
    expect(() => hostChannel.open(tampered)).toThrow()

    // a failed frame ends the connection, so each case gets a fresh receiver
    expect(() => host.confirm(chosen.proof)!.open(second)).toThrow()
    const receiver = host.confirm(chosen.proof)!
    expect(text(receiver.open(first))).toBe('one')
    expect(() => receiver.open(first)).toThrow()
  })

  it('rejects a guest share that is not a valid point', () => {
    expect(hostHandshake('482913', new Uint8Array(32).fill(0xff))).toBeNull()
    expect(hostHandshake('482913', new Uint8Array(32))).toBeNull()
  })
})
