/**
 * Watch mode for co-editing a Hangul document (renderer/collab-flow.ts, decision 0073).
 * The host's document goes out whole: only after its work pauses (an export runs on
 * the thread it types on), only when the cheap change mark moved or the AI changed
 * it, and only when the bytes differ from the last ones sent. A guest shows the newest
 * snapshot, one load at a time, and refuses every key that could edit.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CollabPeer } from '@genoffice/collab'
import {
  SNAPSHOT_TIMING,
  createSnapshotPublisher,
  createSnapshotReceiver,
  guestKeyAllowed,
  hostPlaceOf,
  pageOfIndicator,
  presenceOf,
  sameBytes,
  snapshotOf,
  type HwpSnapshot,
  type KeyLike,
} from '../src/renderer/collab-flow'

const { idleMs, maxWaitMs, costFactor, pollMs, failureMs } = SNAPSHOT_TIMING

/** the shared copy as a save writes it, and the editor's own export of the same document */
const BASE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 9])
const BASELINE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1])

function host(
  options: {
    baselineMark?: string | null
    exportCost?: number
    markFails?: boolean
    busy?: () => boolean
  } = {},
) {
  let clock = 1_000_000
  let count = 0
  let version = 1
  let exportFails = 0
  const sent: HwpSnapshot[] = []
  const docOf = (n: number) => new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, n])
  const source = {
    changeMark: vi.fn(async () => {
      if (options.markFails) throw new Error('the plugin is not up')
      return `${count}`
    }),
    exportBytes: vi.fn(async () => {
      clock += options.exportCost ?? 0
      if (exportFails > 0) {
        exportFails -= 1
        throw new Error('the export timed out')
      }
      return docOf(version)
    }),
  }
  const publisher = createSnapshotPublisher({
    source,
    base: BASE,
    baseline: BASELINE,
    baselineMark: 'baselineMark' in options ? options.baselineMark : '0',
    publish: (snapshot) => sent.push(snapshot),
    now: () => clock,
    ...(options.busy ? { isBusy: options.busy } : {}),
  })
  return {
    publisher,
    source,
    sent,
    docOf,
    now: () => clock,
    advance(ms: number) {
      clock += ms
    },
    /** a key in the editor that changes the document */
    type() {
      count += 1
      version += 1
      publisher.noteInput()
    },
    /** the document changed and nothing in the editor said so */
    changeQuietly() {
      count += 1
      version += 1
    },
    /** a change of the layout only: the mark moves, the bytes stay */
    relayout() {
      count += 1
      publisher.noteInput()
    },
    failNextExport() {
      exportFails += 1
    },
  }
}

describe('the host sends its document', () => {
  it('sends nothing while the document is as it was shared', async () => {
    const h = host()
    expect(await h.publisher.tick()).toBe('unchanged')
    for (let i = 0; i < 20; i++) {
      h.advance(pollMs)
      await h.publisher.tick()
    }
    expect(h.source.exportBytes).not.toHaveBeenCalled()
    expect(h.sent).toEqual([])
  })

  it('waits for a pause in the typing, then sends the document once', async () => {
    const h = host()
    await h.publisher.tick()
    h.type()
    h.advance(idleMs - 100)
    expect(await h.publisher.tick()).toBe('waiting')
    h.advance(100)
    expect(await h.publisher.tick()).toBe('sent')
    expect(h.sent).toEqual([{ seq: 1, bytes: h.docOf(2) }])
    h.advance(pollMs)
    expect(await h.publisher.tick()).toBe('unchanged')
    expect(h.sent).toHaveLength(1)
  })

  it('does not send bytes equal to the last ones sent', async () => {
    const h = host()
    h.relayout()
    h.advance(idleMs)
    // the first export of the shared document equals the editor's export it was shared from
    expect(await h.publisher.tick()).toBe('unchanged')
    expect(h.source.exportBytes).toHaveBeenCalledTimes(1)
    h.type()
    h.advance(idleMs)
    expect(await h.publisher.tick()).toBe('sent')
    h.relayout()
    h.advance(idleMs)
    expect(await h.publisher.tick()).toBe('unchanged')
    expect(h.sent.map((s) => s.seq)).toEqual([1])
  })

  it('still sends during long unbroken work on a light document', async () => {
    const h = host()
    await h.publisher.tick()
    const start = h.now()
    let sentAt = -1
    while (h.now() - start < maxWaitMs + 1_000) {
      h.type()
      h.advance(250)
      if ((await h.publisher.tick()) === 'sent' && sentAt < 0) sentAt = h.now() - start
    }
    expect(sentAt).toBeGreaterThanOrEqual(maxWaitMs)
    expect(sentAt).toBeLessThan(maxWaitMs + 500)
  })

  it('waits for a real pause when the document is slow to export', async () => {
    const h = host({ exportCost: 800 })
    await h.publisher.tick()
    h.type()
    h.advance(idleMs)
    expect(await h.publisher.tick()).toBe('sent')
    const start = h.now()
    while (h.now() - start < 3 * maxWaitMs) {
      h.type()
      h.advance(250)
      expect(await h.publisher.tick()).toBe('waiting')
    }
    h.advance(idleMs)
    expect(await h.publisher.tick()).toBe('sent')
  })

  it('spaces exports by what they cost', async () => {
    const h = host({ exportCost: 1_000 })
    await h.publisher.tick()
    h.type()
    h.advance(idleMs)
    expect(await h.publisher.tick()).toBe('sent')
    const exportedAt = h.now()
    h.type()
    h.advance(idleMs)
    expect(await h.publisher.tick()).toBe('waiting')
    h.advance(exportedAt + 1_000 * costFactor - h.now() - 1)
    expect(await h.publisher.tick()).toBe('waiting')
    h.advance(1)
    expect(await h.publisher.tick()).toBe('sent')
  })

  it('sends a change the AI made, though it did not move the change mark', async () => {
    const h = host()
    await h.publisher.tick()
    h.changeQuietly()
    // the AI's own edits are not in the plugin's count of the user's changes
    h.source.changeMark.mockResolvedValue('0')
    h.publisher.noteChange()
    h.advance(idleMs)
    expect(await h.publisher.tick()).toBe('sent')
    expect(h.sent[0].bytes).toEqual(h.docOf(2))
  })

  it('finds a change nothing announced on a quiet look', async () => {
    const h = host()
    await h.publisher.tick()
    h.changeQuietly()
    h.advance(pollMs - 1)
    expect(await h.publisher.tick()).toBe('waiting')
    h.advance(1)
    expect(await h.publisher.tick()).toBe('sent')
  })

  it('exports without a change mark only after work in the editor', async () => {
    const h = host({ markFails: true, baselineMark: null })
    // nothing tells whether the document moved since it was exported for sharing
    expect(await h.publisher.tick()).toBe('unchanged')
    expect(h.source.exportBytes).toHaveBeenCalledTimes(1)
    h.advance(pollMs)
    expect(await h.publisher.tick()).toBe('unchanged')
    expect(h.source.exportBytes).toHaveBeenCalledTimes(1)
    h.type()
    h.advance(idleMs)
    expect(await h.publisher.tick()).toBe('sent')
  })

  it('tries a failed export again later', async () => {
    const h = host()
    await h.publisher.tick()
    h.type()
    h.failNextExport()
    h.advance(idleMs)
    expect(await h.publisher.tick()).toBe('failed')
    h.advance(failureMs - 1)
    expect(await h.publisher.tick()).toBe('waiting')
    h.advance(1)
    expect(await h.publisher.tick()).toBe('sent')
  })

  it('does not export while a save or a print has the editor', async () => {
    let busy = true
    const h = host({ busy: () => busy })
    h.type()
    h.advance(idleMs)
    expect(await h.publisher.tick()).toBe('waiting')
    busy = false
    expect(await h.publisher.tick()).toBe('sent')
  })

  it('gives the copy guests opened until something newer was sent', async () => {
    const h = host()
    expect(h.publisher.latest()).toEqual({ seq: 0, bytes: BASE })
    h.type()
    h.advance(idleMs)
    await h.publisher.tick()
    expect(h.publisher.latest()).toEqual({ seq: 1, bytes: h.docOf(2) })
  })
})

function guest(options: { busy?: () => boolean } = {}) {
  const loads: Array<{
    bytes: Uint8Array
    resolve: () => void
    reject: (error: Error) => void
  }> = []
  const receiver = createSnapshotReceiver({
    load: (bytes) =>
      new Promise<void>((resolve, reject) => {
        loads.push({ bytes, resolve, reject })
      }),
    retryMs: 100,
    ...(options.busy ? { isBusy: options.busy } : {}),
  })
  return { receiver, loads }
}

const snap = (seq: number): HwpSnapshot => ({ seq, bytes: new Uint8Array([0xd0, seq]) })
/** lets the receiver's promise chain run */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('a guest shows the host document', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the copy its tab opened without loading it again', async () => {
    const g = guest()
    g.receiver.offer(snap(0))
    await settle()
    expect(g.loads).toHaveLength(0)
    expect(g.receiver.shown()).toBe(0)
  })

  it('loads the newest of the snapshots that came during a load', async () => {
    const g = guest()
    g.receiver.offer(snap(1))
    g.receiver.offer(snap(2))
    g.receiver.offer(snap(3))
    expect(g.loads.map((l) => l.bytes)).toEqual([snap(1).bytes])
    g.loads[0].resolve()
    await settle()
    expect(g.loads.map((l) => l.bytes)).toEqual([snap(1).bytes, snap(3).bytes])
    g.loads[1].resolve()
    await settle()
    expect(g.receiver.shown()).toBe(3)
  })

  it('ignores a snapshot older than the one on screen', async () => {
    const g = guest()
    g.receiver.offer(snap(2))
    g.loads[0].resolve()
    await settle()
    g.receiver.offer(snap(1))
    g.receiver.offer(snap(2))
    await settle()
    expect(g.loads).toHaveLength(1)
  })

  it('puts the host document back after a stray edit', async () => {
    const g = guest()
    // before the bytes on screen are known, there is nothing to put back yet
    g.receiver.restore()
    await settle()
    expect(g.loads).toHaveLength(0)
    g.receiver.offer(snap(0))
    expect(g.loads.map((l) => l.bytes)).toEqual([snap(0).bytes])
    g.loads[0].resolve()
    await settle()
    g.receiver.restore()
    expect(g.loads.map((l) => l.bytes)).toEqual([snap(0).bytes, snap(0).bytes])
  })

  it('holds a snapshot while the guest prints', async () => {
    vi.useFakeTimers()
    let busy = true
    const g = guest({ busy: () => busy })
    g.receiver.offer(snap(1))
    await vi.advanceTimersByTimeAsync(300)
    expect(g.loads).toHaveLength(0)
    busy = false
    await vi.advanceTimersByTimeAsync(100)
    expect(g.loads.map((l) => l.bytes)).toEqual([snap(1).bytes])
  })

  it('keeps what is on screen when a load fails, and loads the snapshot when it comes again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const g = guest()
    g.receiver.offer(snap(1))
    g.loads[0].reject(new Error('not a document'))
    await settle()
    expect(g.receiver.shown()).toBe(0)
    g.receiver.offer(snap(1))
    expect(g.loads).toHaveLength(2)
    warn.mockRestore()
  })

  it('loads nothing once the session is over', async () => {
    const g = guest()
    g.receiver.dispose()
    g.receiver.offer(snap(1))
    g.receiver.restore()
    await settle()
    expect(g.loads).toHaveLength(0)
  })
})

describe('what a guest may press', () => {
  const key = (key: string, code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
    key,
    code,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  })

  it.each([
    ['moving the caret', key('ArrowDown', 'ArrowDown')],
    ['selecting', key('ArrowLeft', 'ArrowLeft', { shiftKey: true })],
    ['jumping to the end', key('End', 'End', { ctrlKey: true })],
    ['paging', key('PageDown', 'PageDown')],
    ['copying', key('c', 'KeyC', { ctrlKey: true })],
    ['copying on a Mac', key('c', 'KeyC', { metaKey: true })],
    ['selecting everything', key('a', 'KeyA', { ctrlKey: true })],
    ['a modifier on its own', key('Shift', 'ShiftLeft', { shiftKey: true })],
    ['the presentation key', key('F5', 'F5')],
    ['Escape', key('Escape', 'Escape')],
  ])('lets through %s', (_name, event) => {
    expect(guestKeyAllowed(event)).toBe(true)
  })

  it.each([
    ['a letter', key('a', 'KeyA')],
    ['Korean composition', key('Process', 'KeyR')],
    ['Enter', key('Enter', 'Enter')],
    ['Backspace', key('Backspace', 'Backspace')],
    ['Delete', key('Delete', 'Delete')],
    ['Tab', key('Tab', 'Tab')],
    ['paste', key('v', 'KeyV', { ctrlKey: true })],
    ['cut', key('x', 'KeyX', { ctrlKey: true })],
    ['undo', key('z', 'KeyZ', { ctrlKey: true })],
    ["Hangul's line delete", key('y', 'KeyY', { ctrlKey: true })],
    ["Hangul's centre alignment", key('C', 'KeyC', { ctrlKey: true, shiftKey: true })],
    ['a style key', key('1', 'Digit1', { ctrlKey: true })],
    ['resizing a cell block', key('ArrowRight', 'ArrowRight', { altKey: true })],
  ])('refuses %s', (_name, event) => {
    expect(guestKeyAllowed(event)).toBe(false)
  })
})

describe('the snapshot and presence on the wire', () => {
  it('takes a snapshot only with a sequence number and bytes', () => {
    const bytes = new Uint8Array([1])
    expect(snapshotOf({ seq: 3, bytes })).toEqual({ seq: 3, bytes })
    expect(snapshotOf({ seq: -1, bytes })).toBeNull()
    expect(snapshotOf({ seq: 1.5, bytes })).toBeNull()
    expect(snapshotOf({ seq: 1, bytes: [1] })).toBeNull()
    expect(snapshotOf({ seq: 1, bytes: new Uint8Array() })).toBeNull()
    expect(snapshotOf(null)).toBeNull()
  })

  it('takes a page from 1 up', () => {
    expect(presenceOf({ page: 4 })).toEqual({ page: 4 })
    expect(presenceOf({ page: 0 })).toBeNull()
    expect(presenceOf({ page: '4' })).toBeNull()
    expect(presenceOf(undefined)).toBeNull()
  })

  it("reads the host's page off its status bar in either of the editor's languages", () => {
    expect(pageOfIndicator('Page 3 / 10')).toBe(3)
    expect(pageOfIndicator('3 / 10 쪽')).toBe(3)
    expect(pageOfIndicator('')).toBeNull()
    expect(pageOfIndicator(null)).toBeNull()
    expect(pageOfIndicator('Page 0 / 0')).toBeNull()
  })

  it('compares bytes by content', () => {
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true)
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false)
    expect(sameBytes(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false)
  })
})

describe('where the host is, for a guest', () => {
  const peer = (clientId: number, name: string, mods: Partial<CollabPeer> = {}): CollabPeer => ({
    clientId,
    name,
    color: 2,
    host: false,
    self: false,
    ...mods,
  })

  it('names the person sharing and the page they are on', () => {
    const peers = [peer(1, 'Mina', { host: true }), peer(2, 'Jun', { self: true })]
    expect(hostPlaceOf(peers, [{ clientId: 1, value: { page: 3 } }])).toEqual({
      name: 'Mina',
      color: 2,
      page: 3,
    })
  })

  it('names the person sharing before their page is known', () => {
    const peers = [peer(1, 'Mina', { host: true })]
    expect(hostPlaceOf(peers, [])).toEqual({ name: 'Mina', color: 2, page: null })
    expect(hostPlaceOf(peers, [{ clientId: 1, value: { page: 'x' } }])?.page).toBeNull()
  })

  it('shows nothing on the host itself', () => {
    expect(hostPlaceOf([peer(1, 'Mina', { host: true, self: true })], [])).toBeNull()
  })
})
