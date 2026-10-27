import { afterEach, describe, expect, it } from 'vitest'
import { createConnection, createServer } from 'node:net'
import type { CollabEvent } from '@genoffice/electron-utils/collab-channels'
import { CollabHostServer, type HostedRoom } from '../src/main/collab/host-server'
import {
  CollabJoinError,
  connectToHost,
  hostAddressOf,
  type GuestLink,
} from '../src/main/collab/guest-link'
import {
  decodeRelay,
  encodeFrame,
  encodeJsonFrame,
  relayPayload,
  encodeHello,
  FRAME,
  FrameError,
  FrameReader,
  PRE_AUTH_MAX_FRAME,
  deniedOf,
} from '../src/main/collab/wire'
import { guestHandshake } from '../src/main/collab/secure'
import {
  MAX_MISSES_BEFORE_NEW_PINS,
  MAX_MISSES_PER_ADDRESS,
  PinAttempts,
  newPin,
  samePin,
} from '../src/main/collab/pin'
import { collabFileName } from '../src/main/collab/file-name'
import { announcementOf, encodeAnnouncement } from '../src/main/collab/discovery'
import { broadcastAddresses, lanAddresses } from '../src/main/collab/lan'

function hostEndpoint() {
  const messages: Array<{ from: string; data: number[] }> = []
  const events: CollabEvent[] = []
  return {
    messages,
    events,
    endpoint: {
      message: (from: string, data: Uint8Array) => messages.push({ from, data: [...data] }),
      event: (event: CollabEvent) => events.push(event),
    },
  }
}

async function until(check: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out waiting')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

let server: CollabHostServer | null = null
const links: GuestLink[] = []

afterEach(() => {
  for (const link of links.splice(0)) link.close()
  server?.close()
  server = null
})

async function openRoom(base = new Uint8Array([1, 2, 3])) {
  server = new CollabHostServer({ port: 0, bindAddress: '127.0.0.1' })
  const host = hostEndpoint()
  const room: HostedRoom = await server.open({
    kind: 'markdown',
    title: 'Notes',
    fileName: 'notes.md',
    hostName: 'Host',
    hostColor: 1,
    base,
    endpoint: host.endpoint,
  })
  return { room, host }
}

async function join(room: HostedRoom, pin = room.pin): Promise<GuestLink> {
  const link = await connectToHost({ address: '127.0.0.1', port: room.port, pin })
  links.push(link)
  return link
}

describe('collab wire format', () => {
  it('splits a stream into frames across arbitrary chunk boundaries', () => {
    const reader = new FrameReader(() => 1 << 20)
    const bytes = Buffer.concat([
      encodeJsonFrame(FRAME.hello, { a: 1 }),
      encodeFrame(FRAME.relay, relayPayload('peer', new Uint8Array([9, 8, 7]))),
    ])
    const frames = []
    for (const byte of bytes) frames.push(...reader.push(Buffer.of(byte)))
    expect(frames.map((f) => f.type)).toEqual([FRAME.hello, FRAME.relay])
    expect(decodeRelay(frames[1].payload)).toEqual({
      peer: 'peer',
      data: new Uint8Array([9, 8, 7]),
    })
  })

  it('refuses a frame larger than the current limit', () => {
    const reader = new FrameReader(() => PRE_AUTH_MAX_FRAME)
    expect(() =>
      reader.push(encodeFrame(FRAME.base, new Uint8Array(PRE_AUTH_MAX_FRAME + 10))),
    ).toThrow(FrameError)
  })
})

describe('collab PINs', () => {
  it('makes six-digit PINs that avoid the ones in use', () => {
    const taken = new Set(['000000'])
    for (let i = 0; i < 50; i++) {
      const pin = newPin(taken)
      expect(pin).toMatch(/^\d{6}$/)
      expect(taken.has(pin)).toBe(false)
    }
    expect(samePin('123456', '123456')).toBe(true)
    expect(samePin('123456', '123457')).toBe(false)
    expect(samePin('12345', '123456')).toBe(false)
  })

  it('locks an address after repeated misses and asks for new PINs when misses pile up', () => {
    let now = 0
    const attempts = new PinAttempts(() => now)
    for (let i = 1; i < MAX_MISSES_PER_ADDRESS; i++) expect(attempts.miss('a').locked).toBe(false)
    expect(attempts.miss('a').locked).toBe(true)
    expect(attempts.isLocked('a')).toBe(true)
    now += 11 * 60_000
    expect(attempts.isLocked('a')).toBe(false)
    let replace = false
    for (let i = MAX_MISSES_PER_ADDRESS; i < MAX_MISSES_BEFORE_NEW_PINS; i++) {
      replace = attempts.miss(`b${i}`).replacePins
    }
    expect(replace).toBe(true)
  })

  it('gives a right PIN its guess back, so joining never brings new PINs closer', () => {
    const attempts = new PinAttempts()
    for (let i = 0; i < MAX_MISSES_BEFORE_NEW_PINS - 2; i++) attempts.miss(`b${i}`)
    attempts.miss('guest')
    attempts.admit('guest')
    expect(attempts.isLocked('guest')).toBe(false)
    expect(attempts.miss('c').replacePins).toBe(false)
    expect(attempts.miss('d').replacePins).toBe(true)
  })
})

describe('collab host and guest', () => {
  it('admits a guest with the right PIN and hands over the base file', async () => {
    const { room, host } = await openRoom(new Uint8Array([5, 6, 7, 8]))
    const link = await join(room)
    expect(link.welcome).toMatchObject({ kind: 'markdown', title: 'Notes', hostName: 'Host' })
    expect([...link.base]).toEqual([5, 6, 7, 8])
    await until(() => host.events.length > 0)
    expect(host.events[0]).toEqual({ type: 'peer-join', peerId: link.welcome.peerId })
  })

  it('turns a wrong PIN away and locks the address after five misses', async () => {
    const { room } = await openRoom()
    const wrong = room.pin === '000000' ? '111111' : '000000'
    for (let i = 1; i < MAX_MISSES_PER_ADDRESS; i++) {
      await expect(join(room, wrong)).rejects.toMatchObject({ reason: 'pin' })
    }
    await expect(join(room, wrong)).rejects.toMatchObject({ reason: 'locked' })
    // even the right PIN waits out the lock
    await expect(join(room)).rejects.toBeInstanceOf(CollabJoinError)
  })

  it('spends a guess per challenge, so opening many connections at once gets no more', async () => {
    const { room } = await openRoom()
    const answers = await Promise.all(
      Array.from({ length: MAX_MISSES_PER_ADDRESS + 3 }, async () => {
        const socket = createConnection({ host: '127.0.0.1', port: room.port })
        await new Promise((resolve) => socket.once('connect', resolve))
        const reader = new FrameReader(() => PRE_AUTH_MAX_FRAME)
        const first = new Promise<{ type: number; payload: Buffer }>((resolve) =>
          socket.on('data', (chunk: Buffer) => {
            const [frame] = reader.push(chunk)
            if (frame) resolve(frame)
          }),
        )
        // each one asks before any of them has answered or gone
        socket.write(encodeHello(guestHandshake('000000').share))
        return { socket, frame: await first }
      }),
    )
    for (const { socket } of answers) socket.destroy()
    const challenges = answers.filter(({ frame }) => frame.type === FRAME.challenge)
    const refused = answers.filter(({ frame }) => frame.type === FRAME.denied)
    expect(challenges).toHaveLength(MAX_MISSES_PER_ADDRESS)
    expect(refused.map(({ frame }) => deniedOf(frame.payload))).toEqual(Array(3).fill('locked'))
  })

  it('relays between host and guests by peer id and broadcast', async () => {
    const { room, host } = await openRoom()
    const a = await join(room)
    const b = await join(room)
    const got: Record<string, Array<{ from: string; data: number[] }>> = { a: [], b: [] }
    a.attach({
      message: (from, data) => got.a.push({ from, data: [...data] }),
      peer: () => {},
      ended: () => {},
    })
    b.attach({
      message: (from, data) => got.b.push({ from, data: [...data] }),
      peer: () => {},
      ended: () => {},
    })

    room.send(undefined, new Uint8Array([1]))
    room.send(a.welcome.peerId, new Uint8Array([2]))
    a.send('host', new Uint8Array([3]))
    a.send(undefined, new Uint8Array([4]))
    b.send(a.welcome.peerId, new Uint8Array([5]))

    await until(() => got.a.length >= 3 && got.b.length >= 2 && host.messages.length >= 2)
    expect(got.a).toEqual([
      { from: 'host', data: [1] },
      { from: 'host', data: [2] },
      { from: b.welcome.peerId, data: [5] },
    ])
    expect(got.b).toEqual([
      { from: 'host', data: [1] },
      { from: a.welcome.peerId, data: [4] },
    ])
    expect(host.messages).toEqual([
      { from: a.welcome.peerId, data: [3] },
      { from: a.welcome.peerId, data: [4] },
    ])
  })

  it('tells the host and the other guests when a guest leaves, and guests when the host stops', async () => {
    const { room, host } = await openRoom()
    const a = await join(room)
    const b = await join(room)
    const notices: string[] = []
    let ended = ''
    b.attach({
      message: () => {},
      peer: (notice) => notices.push(`${notice.event}:${notice.peerId}`),
      ended: (reason) => {
        ended = reason
      },
    })
    a.close()
    await until(() => host.events.some((e) => e.type === 'peer-leave'))
    await until(() => notices.includes(`leave:${a.welcome.peerId}`))
    room.close('stopped')
    await until(() => ended !== '')
    expect(ended).toBe('host-left')
  })

  it('drops a connection that sends no HELLO before talking', async () => {
    const { room } = await openRoom()
    const socket = createConnection({ host: '127.0.0.1', port: room.port })
    await new Promise((resolve) => socket.once('connect', resolve))
    socket.write(encodeFrame(FRAME.relay, relayPayload('', new Uint8Array([1]))))
    await new Promise((resolve) => socket.once('close', resolve))
    expect(socket.destroyed).toBe(true)
  })

  it('shows someone watching the wire neither the PIN nor the document nor the edits', async () => {
    const secret = new TextEncoder().encode('TOP-SECRET-PLAN')
    const { room, host } = await openRoom(secret)
    // a relay in the middle that records every byte in both directions
    const seen: Buffer[] = []
    const tap = createServer((inbound) => {
      const outbound = createConnection({ host: '127.0.0.1', port: room.port })
      inbound.on('data', (chunk: Buffer) => {
        seen.push(chunk)
        outbound.write(chunk)
      })
      outbound.on('data', (chunk: Buffer) => {
        seen.push(chunk)
        inbound.write(chunk)
      })
      inbound.on('close', () => outbound.destroy())
      outbound.on('close', () => inbound.destroy())
      inbound.on('error', () => {})
      outbound.on('error', () => {})
    })
    await new Promise<void>((resolve) => tap.listen(0, '127.0.0.1', resolve))
    try {
      const port = (tap.address() as { port: number }).port
      const link = await connectToHost({ address: '127.0.0.1', port, pin: room.pin })
      links.push(link)
      expect(new TextDecoder().decode(link.base)).toBe('TOP-SECRET-PLAN')
      link.send('host', new TextEncoder().encode('edit: hello world'))
      await until(() => host.messages.length > 0)
      const wire = Buffer.concat(seen).toString('latin1')
      expect(wire).not.toContain(room.pin)
      expect(wire).not.toContain('TOP-SECRET-PLAN')
      expect(wire).not.toContain('hello world')
      expect(wire).not.toContain('Notes')
    } finally {
      tap.close()
    }
  })

  it('stops listening once the last room closes', async () => {
    const { room } = await openRoom()
    const port = room.port
    room.close('stopped')
    expect(server?.port).toBeNull()
    await expect(
      connectToHost({ address: '127.0.0.1', port, pin: room.pin, timeoutMs: 2000 }),
    ).rejects.toMatchObject({ reason: 'unreachable' })
  })
})

describe('collab names and addresses', () => {
  it('keeps the guest copy a plain file name of the session editor', () => {
    expect(collabFileName('Report.docx', 'docs')).toBe('Report.docx')
    expect(collabFileName('..\\..\\evil.docx', 'docs')).toBe('evil.docx')
    expect(collabFileName('notes.exe', 'markdown')).toBe('document.md')
    expect(collabFileName('con.md', 'markdown')).toBe('document.md')
    expect(collabFileName('a<b>?.hwp', 'hwp')).toBe('ab.hwp')
    expect(collabFileName(42, 'pdf')).toBe('document.pdf')
  })

  it('accepts host names and IP literals only', () => {
    expect(hostAddressOf(' 192.168.0.12 ')).toBe('192.168.0.12')
    expect(hostAddressOf('my-pc.local')).toBe('my-pc.local')
    expect(hostAddressOf('::1')).toBe('::1')
    expect(hostAddressOf('a/b')).toBeNull()
    expect(hostAddressOf('host:80')).toBeNull()
    expect(hostAddressOf('')).toBeNull()
  })

  it('round-trips an announcement and ignores foreign datagrams', () => {
    const message = encodeAnnouncement({
      port: 47631,
      hostName: 'Mina',
      sessions: [{ kind: 'docs', title: 'Plan.docx' }],
    })
    expect(announcementOf(message)).toEqual({
      port: 47631,
      hostName: 'Mina',
      sessions: [{ kind: 'docs', title: 'Plan.docx' }],
    })
    expect(announcementOf(Buffer.from('{"app":"other"}'))).toBeNull()
    expect(announcementOf(Buffer.from('not json'))).toBeNull()
  })

  it('lists private LAN addresses first and the subnet broadcast', () => {
    const interfaces = {
      eth: [
        { address: '8.8.8.8', netmask: '255.0.0.0', family: 'IPv4', internal: false },
        { address: '192.168.1.20', netmask: '255.255.255.0', family: 'IPv4', internal: false },
        { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', internal: true },
      ],
    } as unknown as Parameters<typeof lanAddresses>[0]
    expect(lanAddresses(interfaces)).toEqual(['192.168.1.20', '8.8.8.8'])
    expect(broadcastAddresses(interfaces)).toContain('192.168.1.255')
  })
})
