// @vitest-environment node
/**
 * What a shared Hangul document is sent as (main/collab.ts, decision 0073): the
 * editor's export with the corrections a save makes against the file this view
 * opened, without writing anything. Bytes that are not a container of the format
 * are refused.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
  },
}))

const fixes = vi.fn((data: Uint8Array, _format: unknown, _tabs: unknown, _base: unknown) => ({
  bytes: new Uint8Array([...data, 0xff]),
}))
vi.mock('../src/main/save-fixes', () => ({
  applySaveFixes: (...args: [Uint8Array, unknown, unknown, unknown]) => fixes(...args),
}))

const { registerHwpCollabIpc } = await import('../src/main/collab')
const { HWP_CHANNELS } = await import('../src/shared/ipc')

const BLANK = new Uint8Array(readFileSync(resolve(process.cwd(), 'src/renderer/assets/blank.hwp')))
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2])

describe('the bytes a shared document goes out as', () => {
  const base = { tails: undefined, kinds: undefined }
  const saveBaseOf = vi.fn((_wcId: number) => base)

  beforeEach(() => {
    handlers.clear()
    fixes.mockClear()
    saveBaseOf.mockClear()
    registerHwpCollabIpc(saveBaseOf)
  })

  const invoke = (data: unknown, format: unknown) =>
    handlers.get(HWP_CHANNELS.collabBase)!({ sender: { id: 7 } }, data, format)

  it('corrects the export against what this view opened, as a save does', () => {
    const out = invoke(BLANK, 'hwp') as Uint8Array
    expect(saveBaseOf).toHaveBeenCalledWith(7)
    expect(fixes).toHaveBeenCalledWith(BLANK, 'hwp', undefined, base)
    expect(out).toEqual(new Uint8Array([...BLANK, 0xff]))
  })

  it('takes an HWPX export too', () => {
    invoke(ZIP, 'hwpx')
    expect(fixes).toHaveBeenCalledWith(ZIP, 'hwpx', undefined, base)
  })

  it('refuses bytes that are not a document of that format', () => {
    expect(() => invoke(ZIP, 'hwp')).toThrow()
    expect(() => invoke(BLANK, 'hwpx')).toThrow()
    expect(() => invoke(BLANK, 'docx')).toThrow()
    expect(() => invoke(new Uint8Array(), 'hwp')).toThrow()
    expect(() => invoke('bytes', 'hwp')).toThrow()
    expect(fixes).not.toHaveBeenCalled()
  })
})
