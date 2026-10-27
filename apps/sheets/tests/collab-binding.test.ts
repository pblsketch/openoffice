import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { startHosting, takeGuestSession, type CollabSession } from '@genoffice/collab'
import { SheetsCollabBinding } from '../src/renderer/collab/binding'
import { PRESENCE_FIELD } from '../src/renderer/collab/presence'
import { FakeBook, Relay, hooksFor } from './collab-fakes'

const BASE = new Uint8Array([1])

interface Peer {
  book: FakeBook
  session: CollabSession
  binding: SheetsCollabBinding
  refused: string[]
  reloads: { count: number }
}

const bindings: SheetsCollabBinding[] = []

async function hostOn(relay: Relay, written?: () => unknown): Promise<Peer> {
  const book = new FakeBook('file-host')
  const refused: string[] = []
  const reloads = { count: 0 }
  let binding: SheetsCollabBinding | null = null
  const started = await startHosting(
    relay.host(),
    { kind: 'sheets', title: 'Book', fileName: 'Book.xlsx', base: BASE },
    { name: 'Host Mina', color: 1 },
    (session) => {
      binding = new SheetsCollabBinding(
        session,
        hooksFor(book, { refused, reloads, ...(written ? { written } : {}) }),
      )
    },
  )
  if (!started.ok || !binding) throw new Error('could not host')
  bindings.push(binding)
  return { book, session: started.session, binding, refused, reloads }
}

/** a guest whose copy starts as the host's book does now (the shared bytes) */
async function guestOn(relay: Relay, host: Peer, name: string): Promise<Peer> {
  const bridge = relay.guest()
  const book = new FakeBook(`file-${name}`)
  book.load(JSON.stringify(host.book.dump()), `file-${name}`)
  await relay.flush()
  const session = await takeGuestSession(bridge, { name, color: 3 })
  if (!session) throw new Error('no ticket')
  await relay.flush()
  await session.synced
  const refused: string[] = []
  const reloads = { count: 0 }
  const binding = new SheetsCollabBinding(session, hooksFor(book, { refused, reloads }))
  bindings.push(binding)
  await relay.flush()
  return { book, session, binding, refused, reloads }
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 0))
  vi.stubGlobal('cancelAnimationFrame', (handle: ReturnType<typeof setTimeout>) =>
    clearTimeout(handle),
  )
})

afterEach(() => {
  for (const binding of bindings.splice(0)) binding.dispose()
  vi.unstubAllGlobals()
})

describe('a shared workbook', () => {
  it('carries typing both ways, rebound to each unit, with pooled styles inlined', async () => {
    const relay = new Relay()
    const host = await hostOn(relay)
    const guest = await guestOn(relay, host, 'Jun')

    guest.book.styles['s7'] = { bl: 1 }
    guest.book.type('sheet-1', 1, 1, 'from guest', 's7')
    host.book.type('sheet-1', 0, 0, 'from host')
    await relay.flush()

    expect(host.book.value('sheet-1', 1, 1)).toBe('from guest')
    expect(guest.book.value('sheet-1', 0, 0)).toBe('from host')
    const remote = host.book.executed.find(
      (entry) =>
        entry.params !== undefined && (entry.options as { fromCollab?: boolean }).fromCollab,
    )
    expect(remote?.params).toMatchObject({
      unitId: 'file-host',
      cellValue: { 1: { 1: { v: 'from guest', s: { bl: 1 } } } },
    })
    // typing in different cells never sends anyone back to the host's bytes
    expect(guest.reloads.count).toBe(0)
  })

  it('settles two people typing into one cell on the host order', async () => {
    const relay = new Relay()
    const host = await hostOn(relay)
    const guest = await guestOn(relay, host, 'Jun')

    host.book.type('sheet-1', 2, 2, 'host wins?')
    guest.book.type('sheet-1', 2, 2, 'guest wins?')
    await relay.flush()

    expect(guest.book.value('sheet-1', 2, 2)).toBe(host.book.value('sheet-1', 2, 2))
    expect(guest.book.dump()).toEqual(host.book.dump())
  })

  it('refuses an edit made against rows that moved, and the guest takes the host copy', async () => {
    const relay = new Relay()
    const host = await hostOn(relay)
    const guest = await guestOn(relay, host, 'Jun')
    host.book.type('sheet-1', 5, 0, 'row 6')
    await relay.flush()

    // the host inserts a row above while the guest types where row 6 was
    host.book.run([
      'sheet.mutation.insert-row',
      { subUnitId: 'sheet-1', range: { startRow: 0, endRow: 0, startColumn: 0, endColumn: 9 } },
    ])
    guest.book.type('sheet-1', 5, 1, 'next to row 6')
    guest.book.type('sheet-1', 9, 9, 'made after the refused one')
    await relay.flush()

    // landing at row 6 would now be next to the wrong row: it is dropped instead
    expect(host.book.value('sheet-1', 5, 1)).toBeUndefined()
    expect(host.book.value('sheet-1', 9, 9)).toBeUndefined()
    expect(host.book.value('sheet-1', 6, 0)).toBe('row 6')
    expect(guest.book.dump()).toEqual(host.book.dump())
    expect(guest.reloads.count).toBeGreaterThan(0)

    // back in step, the guest's edits go through again
    guest.book.type('sheet-1', 0, 3, 'after the reload')
    await relay.flush()
    expect(host.book.value('sheet-1', 0, 3)).toBe('after the reload')
  })

  it('keeps a moved layout out of an open cell editor, and out of undo', async () => {
    const relay = new Relay()
    const host = await hostOn(relay)
    const guest = await guestOn(relay, host, 'Jun')

    guest.book.editing = true
    host.book.run([
      'sheet.mutation.insert-row',
      { subUnitId: 'sheet-1', range: { startRow: 0, endRow: 1, startColumn: 0, endColumn: 9 } },
    ])
    await relay.flush()
    expect(guest.book.executed.some((entry) => entry.id === 'sheet.mutation.insert-row')).toBe(
      false,
    )

    guest.book.editing = false
    guest.book.emit('edit-ended')
    await relay.flush()
    expect(guest.book.executed.some((entry) => entry.id === 'sheet.mutation.insert-row')).toBe(true)
    expect(guest.book.undoCleared).toEqual([guest.book.unitId])
  })

  it('shares a new sheet under one id, and a reloaded guest still finds it', async () => {
    const relay = new Relay()
    // a save gives a sheet added this session the id the file assigns it
    const host = await hostOn(relay, () =>
      (host.book.dump() as Array<[string, string, unknown]>).map(([id, name, cells]) => [
        id === 'Xr4nd' ? 'sheet-2' : id,
        name,
        cells,
      ]),
    )
    const guest = await guestOn(relay, host, 'Jun')

    host.book.run([
      'sheet.mutation.insert-sheet',
      { index: 1, sheet: { id: 'Xr4nd', name: 'Notes' } },
    ])
    host.book.type('Xr4nd', 0, 0, 'on the new sheet')
    await relay.flush()
    expect(guest.book.value('Xr4nd', 0, 0)).toBe('on the new sheet')

    // the guest falls out of step and reloads the host's bytes
    const resync = (guest.binding as unknown as { log: { resync(): Promise<void> } }).log.resync()
    await relay.flush()
    await resync
    expect(guest.reloads.count).toBe(1)
    expect(guest.book.value('sheet-2', 0, 0)).toBe('on the new sheet')

    host.book.type('Xr4nd', 1, 0, 'still found')
    guest.book.type('sheet-2', 2, 0, 'from the guest')
    await relay.flush()
    expect(guest.book.value('sheet-2', 1, 0)).toBe('still found')
    expect(host.book.value('Xr4nd', 2, 0)).toBe('from the guest')
  })

  it('refuses a guest what the stream cannot carry and puts its copy back', async () => {
    const relay = new Relay()
    const host = await hostOn(relay)
    const guest = await guestOn(relay, host, 'Jun')

    expect(guest.book.emit('before-command', { id: 'sheet.command.copy-sheet' })).toBe(true)
    expect(guest.refused).toEqual(['guestBlocked'])

    // an app-side edit (a chart moved) reaches no one else: the copy goes back to the host's
    guest.book.run(['sheets.mutation.visual-edit-step', { token: 1 }])
    await relay.flush()
    expect(guest.refused).toEqual(['guestBlocked', 'guestBlocked'])
    expect(guest.reloads.count).toBe(1)
  })

  it('lets the host copy a sheet alone, and refuses it while someone is in', async () => {
    const relay = new Relay()
    const host = await hostOn(relay)
    expect(host.book.emit('before-command', { id: 'sheet.command.copy-sheet' })).toBe(false)
    await guestOn(relay, host, 'Jun')
    expect(host.book.emit('before-command', { id: 'sheet.command.copy-sheet' })).toBe(true)
    expect(host.refused).toEqual(['hostBlocked'])
  })

  it('starts guests over from the host bytes after the host saves', async () => {
    const relay = new Relay()
    const host = await hostOn(relay)
    const guest = await guestOn(relay, host, 'Jun')
    host.book.type('sheet-1', 0, 0, 'saved')
    await relay.flush()

    host.book.unitId = 'file-host-saved'
    host.binding.workbookOpened()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await relay.flush()
    expect(guest.reloads.count).toBe(1)
    // ops already inside those bytes are not applied a second time
    const applied = guest.book.executed.filter(
      (entry) => (entry.options as { fromCollab?: boolean }).fromCollab,
    ).length
    host.book.type('sheet-1', 0, 1, 'after the save')
    await relay.flush()
    expect(
      guest.book.executed.filter((entry) => (entry.options as { fromCollab?: boolean }).fromCollab)
        .length,
    ).toBe(applied + 1)
    expect(guest.book.dump()).toEqual(host.book.dump())
  })

  it('publishes where each person is', async () => {
    const relay = new Relay()
    const host = await hostOn(relay)
    const guest = await guestOn(relay, host, 'Jun')
    guest.book.active = { sheet: 'sheet-1', row: 4, col: 2 }
    guest.book.emit('selection')
    await new Promise((resolve) => setTimeout(resolve, 5))
    await relay.flush()
    const seen = host.session.presences<{ row: number; col: number }>(PRESENCE_FIELD)
    expect(seen.map((entry) => [entry.user.name, entry.value.row, entry.value.col])).toEqual([
      ['Jun', 4, 2],
    ])
  })
})
