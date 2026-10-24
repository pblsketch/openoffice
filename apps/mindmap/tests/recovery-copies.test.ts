/**
 * When the editor writes a crash-recovery copy: only while the map has
 * unsaved changes and only when it changed since the last copy; never by
 * closing a title being typed; a big map only after the user paused; after a
 * failure a few ticks later again; never a copy a save overtook.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  RECOVERY_COPY_TIMING,
  RecoveryCopier,
  type CopiedSheet,
  type RecoveryCopierHost,
} from '../src/renderer/document/recovery-copies'
import type { DocumentSession } from '../src/renderer/document/session'
import type { RecoveryCopyResult } from '../src/shared/ipc'
import { until } from './helpers/wait'

interface Rig {
  copier: RecoveryCopier
  map: { dirty: boolean; topics: number; failNext: boolean; bytes: Uint8Array }
  sheet: { editingText: boolean; composing: boolean }
  writes: Uint8Array[]
  flushes: boolean[]
  result: RecoveryCopyResult
  saving: boolean
  clock: { now: number }
  /** runs while the bytes are being made */
  duringCopy: (() => void) | null
}

function rig(timing: Partial<typeof RECOVERY_COPY_TIMING> = {}): Rig {
  const state: Rig = {
    copier: null as unknown as RecoveryCopier,
    map: { dirty: true, topics: 3, failNext: false, bytes: new Uint8Array([1, 2, 3]) },
    sheet: { editingText: false, composing: false },
    writes: [],
    flushes: [],
    result: 'written',
    saving: false,
    clock: { now: 1_000_000 },
    duringCopy: null,
  }
  const session = {
    get dirty() {
      return state.map.dirty
    },
    topicIds: () => new Set(Array.from({ length: state.map.topics }, (_, i) => `t${i}`)),
    recoveryBytes: async () => {
      state.duringCopy?.()
      if (state.map.failNext) {
        state.map.failNext = false
        throw new Error('disk full')
      }
      return state.map.bytes
    },
  } as unknown as DocumentSession
  const host: RecoveryCopierHost = {
    session: () => session,
    sheets: () => [state.sheet as CopiedSheet],
    flush: (commit) => void state.flushes.push(commit),
    saving: () => state.saving,
    write: async (bytes) => {
      state.writes.push(bytes)
      return state.result
    },
  }
  state.copier = new RecoveryCopier(
    host,
    { ...RECOVERY_COPY_TIMING, ...timing },
    () => state.clock.now,
  )
  return state
}

describe('recovery copies', () => {
  it('are written while the map has unsaved changes, once per change', async () => {
    const r = rig()
    r.copier.noteChange()
    expect(await r.copier.tick()).toBe('written')
    expect(r.writes).toHaveLength(1)
    // nothing changed since: no second copy
    expect(await r.copier.tick()).toBe('unchanged')
    expect(r.writes).toHaveLength(1)
    r.copier.noteChange()
    expect(await r.copier.tick()).toBe('written')
    expect(r.writes).toHaveLength(2)
  })

  it('are not written for a map without unsaved changes', async () => {
    const r = rig()
    r.map.dirty = false
    r.copier.noteChange()
    expect(await r.copier.tick()).toBe('clean')
    expect(r.writes).toHaveLength(0)
  })

  it('skip the tick while a title is being typed and leave its box alone', async () => {
    const r = rig()
    r.copier.noteChange()
    r.sheet.editingText = true
    expect(await r.copier.tick()).toBe('typing')
    // the box was not committed or flushed: it stays open
    expect(r.flushes).toEqual([])
    expect(r.writes).toHaveLength(0)
    r.sheet.composing = true
    expect(await r.copier.tick()).toBe('typing')
    r.sheet.editingText = false
    r.sheet.composing = false
    expect(await r.copier.tick()).toBe('written')
    // the timer flushes what the screen shows, without committing a box
    expect(r.flushes).toEqual([false])
  })

  it('wait for a pause in typing before copying a big map', async () => {
    const r = rig({ idleMs: 40, bigMapTopics: 100 })
    r.map.topics = 500
    r.copier.noteChange()
    r.copier.noteInput()
    expect(await r.copier.tick()).toBe('waiting')
    expect(r.writes).toHaveLength(0)
    // the user stopped: the copy follows by itself once the pause is long enough
    r.clock.now += 50
    await until(() => r.writes.length === 1, 'the copy after the pause', { react: false })
  })

  it('copy a small map right away even while the user is working', async () => {
    const r = rig({ bigMapTopics: 100 })
    r.copier.noteChange()
    r.copier.noteInput()
    expect(await r.copier.tick()).toBe('written')
  })

  it('back off after a failure and try again later, never giving up', async () => {
    const r = rig({ backoffTicks: 2 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    r.copier.noteChange()
    r.map.failNext = true
    expect(await r.copier.tick()).toBe('failed')
    expect(await r.copier.tick()).toBe('backoff')
    expect(await r.copier.tick()).toBe('backoff')
    expect(await r.copier.tick()).toBe('written')
    warn.mockRestore()
  })

  it('drop a copy a save overtook', async () => {
    const r = rig()
    r.copier.noteChange()
    r.duringCopy = () => r.copier.noteSave()
    expect(await r.copier.tick()).toBe('dropped')
    expect(r.writes).toHaveLength(0)
    r.duringCopy = null
    // the copy did not land: the next tick tries again
    expect(await r.copier.tick()).toBe('written')
  })

  it('do not run during a save', async () => {
    const r = rig()
    r.copier.noteChange()
    r.saving = true
    expect(await r.copier.tick()).toBe('busy')
    expect(r.writes).toHaveLength(0)
  })

  it('count a copy the main process did not keep as not written', async () => {
    const r = rig()
    r.copier.noteChange()
    r.result = 'skipped'
    expect(await r.copier.tick()).toBe('dropped')
    r.result = 'written'
    expect(await r.copier.tick()).toBe('written')
  })

  it('after a reset copy the map again though nothing changed', async () => {
    const r = rig()
    r.copier.noteChange()
    expect(await r.copier.tick()).toBe('written')
    expect(await r.copier.tick()).toBe('unchanged')
    // the main process dropped the copy ("Don't Save") and the tab stayed open
    r.copier.reset()
    expect(await r.copier.tick()).toBe('written')
    expect(r.writes).toHaveLength(2)
  })

  it('asked for at once (the OS ends the session) take the title being typed', async () => {
    const r = rig()
    r.copier.noteChange()
    r.sheet.editingText = true
    expect(await r.copier.writeNow()).toBe('written')
    expect(r.flushes).toEqual([true])
  })
})
