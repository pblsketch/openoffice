/**
 * When the renderer takes a recovery copy (renderer/recovery-flow.ts): only while
 * the document has unsaved changes that are not in a copy yet, about every 30 s, and
 * never while the user is typing — the export runs on the thread that types.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  RECOVERY_TIMING,
  createRecoveryCopier,
  withChangeNotes,
  type RecoveryCopyApi,
  type RecoveryEditorPort,
} from '../src/renderer/recovery-flow'
import type { HwpFormat, RecoveryWriteOutcome } from '../src/shared/ipc'

const HWP = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])
const HWPX = new Uint8Array([0x50, 0x4b, 0x03, 0x04])

function setup(
  options: {
    dirty?: boolean
    protectedDoc?: boolean | 'unknown'
    format?: HwpFormat
    begin?: boolean
    write?: () => Promise<RecoveryWriteOutcome>
    busy?: () => boolean
    restored?: () => boolean
  } = {},
) {
  let clock = 1_000_000
  let dirty = options.dirty ?? true
  const editor = {
    isDirty: vi.fn(async () => dirty),
    isPasswordProtected: vi.fn(async () => {
      if (options.protectedDoc === 'unknown') throw new Error('no flag')
      return options.protectedDoc === true
    }),
    exportHwp: vi.fn(async () => HWP),
    exportHwpx: vi.fn(async () => HWPX),
    measureTabs: vi.fn(async () => [{ width: 4000, type: 0, fill: 0 }]),
  } satisfies RecoveryEditorPort
  const api = {
    recoveryBegin: vi.fn(async () =>
      options.begin === false
        ? ({ ok: false } as const)
        : ({ ok: true, format: options.format ?? 'hwp' } as const),
    ),
    recoveryNewTabs: vi.fn(async () => [{ sec: 0, para: 0, cells: [], tab: 0, tabs: 1 }]),
    recoveryWrite: vi.fn(options.write ?? (async (): Promise<RecoveryWriteOutcome> => 'written')),
  } satisfies RecoveryCopyApi
  const copier = createRecoveryCopier({
    editor,
    api,
    now: () => clock,
    ...(options.busy ? { isBusy: options.busy } : {}),
    ...(options.restored ? { restoredUnsaved: options.restored } : {}),
  })
  return {
    editor,
    api,
    copier,
    advance: (ms: number) => {
      clock += ms
    },
    setDirty: (next: boolean) => {
      dirty = next
    },
  }
}

const { intervalMs, idleMs } = RECOVERY_TIMING

describe('a recovery copy', () => {
  it('is not taken while the user types, however long', async () => {
    const { copier, editor, api, advance } = setup()
    // two minutes of typing, a key every 300 ms, the copier looking every second
    for (let elapsed = 0; elapsed < 120_000; elapsed += 300) {
      copier.noteInput()
      advance(300)
      if (elapsed % 1000 < 300) await copier.tick()
    }
    expect(editor.exportHwp).not.toHaveBeenCalled()
    expect(editor.isDirty).not.toHaveBeenCalled()
    expect(api.recoveryBegin).not.toHaveBeenCalled()
  })

  it('is taken once the user has left the editor alone for a moment', async () => {
    const { copier, editor, api, advance } = setup()
    copier.noteInput()
    advance(intervalMs)
    copier.noteInput()
    advance(idleMs - 100)
    expect(await copier.tick()).toBe('waiting')
    advance(200)
    expect(await copier.tick()).toBe('written')
    expect(editor.exportHwp).toHaveBeenCalledTimes(1)
    // with the widths of the new tabs, as a save measures them
    expect(api.recoveryWrite).toHaveBeenCalledWith(HWP, 'hwp', [
      { sec: 0, para: 0, cells: [], tab: 0, tabs: 1, width: 4000, type: 0, fill: 0 },
    ])
  })

  it('waits about 30 s between copies', async () => {
    const { copier, editor, advance } = setup()
    copier.noteInput()
    advance(intervalMs)
    await copier.tick()
    copier.noteInput()
    advance(intervalMs - idleMs - 1)
    expect(await copier.tick()).toBe('waiting')
    advance(idleMs + 1)
    expect(await copier.tick()).toBe('written')
    expect(editor.exportHwp).toHaveBeenCalledTimes(2)
  })

  it('is not taken again when nothing changed since the last one', async () => {
    const { copier, editor, advance } = setup()
    copier.noteInput()
    advance(intervalMs)
    await copier.tick()
    advance(intervalMs)
    expect(await copier.tick()).toBe('unchanged')
    expect(editor.exportHwp).toHaveBeenCalledTimes(1)
    // work elsewhere on the page holds a copy back but is no change
    copier.noteInput(false)
    advance(intervalMs)
    expect(await copier.tick()).toBe('unchanged')
    expect(editor.exportHwp).toHaveBeenCalledTimes(1)
  })

  it('is not taken while the document has no unsaved changes', async () => {
    const { copier, editor, api, advance } = setup({ dirty: false })
    copier.noteInput()
    advance(intervalMs)
    expect(await copier.tick()).toBe('clean')
    expect(editor.exportHwp).not.toHaveBeenCalled()
    expect(api.recoveryWrite).not.toHaveBeenCalled()
  })

  it('is taken of a restored copy edited since, even when the editor calls it saved', async () => {
    let restored = true
    const { copier, editor, advance } = setup({ dirty: false, restored: () => restored })
    copier.noteInput()
    advance(intervalMs)
    expect(await copier.tick()).toBe('written')
    restored = false
    copier.noteInput()
    advance(intervalMs)
    expect(await copier.tick()).toBe('clean')
    expect(editor.exportHwp).toHaveBeenCalledTimes(1)
  })

  it('is never taken of a password document, nor of one whose protection is unknown', async () => {
    for (const protectedDoc of [true, 'unknown'] as const) {
      const { copier, editor, api, advance } = setup({ protectedDoc })
      copier.noteInput()
      advance(intervalMs)
      expect(await copier.tick()).toBe('protected')
      expect(editor.exportHwp).not.toHaveBeenCalled()
      expect(api.recoveryWrite).not.toHaveBeenCalled()
    }
  })

  it('is not taken when the main process takes none for this document', async () => {
    const { copier, editor, advance } = setup({ begin: false })
    copier.noteInput()
    advance(intervalMs)
    expect(await copier.tick()).toBe('refused')
    expect(editor.exportHwp).not.toHaveBeenCalled()
  })

  it('is exported in the format a save would write', async () => {
    const { copier, editor, api, advance } = setup({ format: 'hwpx' })
    copier.noteInput()
    advance(intervalMs)
    await copier.tick()
    expect(editor.exportHwp).not.toHaveBeenCalled()
    expect(api.recoveryWrite).toHaveBeenCalledWith(HWPX, 'hwpx', expect.any(Array))
  })

  it('stands back while a save runs, and is taken again after one that won', async () => {
    let busy = false
    const outcomes: RecoveryWriteOutcome[] = ['superseded', 'written']
    const { copier, editor, advance } = setup({
      busy: () => busy,
      write: async () => outcomes.shift()!,
    })
    copier.noteInput()
    advance(intervalMs)
    busy = true
    expect(await copier.tick()).toBe('waiting')
    busy = false
    expect(await copier.tick()).toBe('superseded')
    advance(intervalMs)
    expect(await copier.tick()).toBe('written')
    expect(editor.exportHwp).toHaveBeenCalledTimes(2)
  })

  it('is not exported when a save is still finishing as its turn begins', async () => {
    // the save's file is written (its copy removed) but the editor is not told yet: a copy
    // exported now would come back as an unresolved copy of a saved document
    let busy = false
    const { copier, editor, api, advance } = setup({ busy: () => busy })
    api.recoveryBegin.mockImplementationOnce(async () => {
      busy = true
      return { ok: true, format: 'hwp' } as const
    })
    copier.noteInput()
    advance(intervalMs)
    expect(await copier.tick()).toBe('superseded')
    expect(editor.exportHwp).not.toHaveBeenCalled()
  })

  it('skips some turns after a failure, then tries again', async () => {
    let fail = true
    const { copier, editor, advance } = setup({
      write: async () => {
        if (fail) throw new Error('disk full')
        return 'written'
      },
    })
    copier.noteInput()
    advance(intervalMs)
    expect(await copier.tick()).toBe('failed')
    fail = false
    for (let turn = 0; turn < RECOVERY_TIMING.failureSkips; turn++) {
      advance(intervalMs)
      expect(await copier.tick()).toBe('waiting')
    }
    advance(intervalMs)
    expect(await copier.tick()).toBe('written')
    expect(editor.exportHwp).toHaveBeenCalledTimes(2)
  })

  it('is taken at once when the OS is ending the session', async () => {
    const { copier, editor, advance } = setup()
    copier.noteInput()
    advance(10)
    expect(await copier.flush()).toBe('written')
    expect(editor.exportHwp).toHaveBeenCalledTimes(1)
    // already in the copy
    expect(await copier.flush()).toBe('unchanged')
  })

  it('is written again after the copy was removed while the tab stayed open', async () => {
    const { copier, advance } = setup()
    copier.noteInput()
    advance(intervalMs)
    await copier.tick()
    copier.reset()
    advance(intervalMs)
    expect(await copier.tick()).toBe('written')
  })
})

describe('the AI panel’s edits', () => {
  it('count as changes; its reads do not', async () => {
    const onChange = vi.fn()
    const bridge = withChangeNotes(
      {
        selection: vi.fn(async () => null),
        readText: vi.fn(async () => ''),
        replaceText: vi.fn(async () => ({ ok: true })),
      },
      onChange,
    )
    await bridge.selection()
    await bridge.readText()
    expect(onChange).not.toHaveBeenCalled()
    await expect(bridge.replaceText()).resolves.toEqual({ ok: true })
    // when it starts and when it lands
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})
