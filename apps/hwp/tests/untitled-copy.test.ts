// @vitest-environment node
/**
 * A skill template's copy in a new HWP tab (spec 5.7): the view reads the copy
 * from its temp file like any open, but it has no save target, so its first
 * save asks where, offering the copy's name in the copy's own format; the
 * temp copy is never written. After that save the document is the chosen file.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
const showSaveDialog = vi.fn(
  async (..._args: unknown[]): Promise<{ canceled: boolean; filePath?: string }> => ({
    canceled: true,
  }),
)

interface FakeContents {
  id: number
  destroyed: boolean
  isDestroyed(): boolean
  setWindowOpenHandler(handler: unknown): void
  loadURL(url: string): Promise<void>
  send(channel: string, ...args: unknown[]): void
  on(event: string, listener: (...args: unknown[]) => void): void
  once(event: string, listener: (...args: unknown[]) => void): void
}

let nextId = 1
function fakeContents(): FakeContents {
  const contents: FakeContents = {
    id: nextId++,
    destroyed: false,
    isDestroyed: () => contents.destroyed,
    setWindowOpenHandler: () => {},
    loadURL: async () => {},
    send: () => {},
    on: () => {},
    once: () => {},
  }
  return contents
}

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: () => new Promise(() => {}),
    getPath: (name: string) => join(tmpdir(), `hwp-test-${name}`),
    getLocale: () => 'en-US',
  },
  dialog: {
    showMessageBox: vi.fn(async () => ({ response: 1 })),
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
  },
  shell: { openExternal: vi.fn(async () => {}), showItemInFolder: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
  net: {},
  ipcRenderer: {},
  webUtils: {},
  BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null },
  WebContentsView: class {
    webContents = fakeContents()
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    on: (channel: string, fn: Handler) => handlers.set(channel, fn),
    removeHandler: vi.fn(),
  },
}))

vi.mock('@genoffice/file-parse', () => ({
  hwpToText: vi.fn(async () => ''),
  parseFileToText: vi.fn(async () => ({ kind: 'text', text: '' })),
  ATTACHABLE_EXTS: new Set<string>(),
  ATTACHABLE_IMAGE_EXTS: new Set<string>(),
  ATTACHABLE_MAX_BYTES: 25 * 1024 * 1024,
  ATTACHABLE_IMAGE_MAX_BYTES: 5 * 1024 * 1024,
}))

import { configureHwpRuntime, createHwpView } from '../src/main/hwp-main'
import { HWP_CHANNELS } from '../src/shared/ipc'
import type { BeginSaveResult, CommitSaveResult } from '../src/shared/ipc'

const call = <T>(channel: string, contents: FakeContents, ...args: unknown[]): T =>
  handlers.get(channel)!({ sender: contents }, ...args) as T

/** HWPX bytes enough for the container check (ZIP magic). */
const HWPX = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x21, 0x22, 0x23])

let dir: string
let copyPath: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-hwp-copy-'))
  copyPath = join(dir, 'Family letter.hwpx')
  writeFileSync(copyPath, HWPX)
  showSaveDialog.mockClear()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('an untitled copy in an HWP tab', () => {
  it('reads the copy and says it is an untitled copy', async () => {
    const contents = createHwpView(copyPath, { untitledCopy: true })
      .webContents as unknown as FakeContents
    expect(call(HWP_CHANNELS.consumePending, contents)).toBe(copyPath)
    expect(call(HWP_CHANNELS.untitledCopy, contents)).toEqual({
      name: 'Family letter.hwpx',
      format: 'hwpx',
    })
    const bytes = await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, contents, copyPath)
    expect([...bytes]).toEqual([...HWPX])
  })

  it('asks where its first save goes, offering the copy’s name and format', async () => {
    const contents = createHwpView(copyPath, { untitledCopy: true })
      .webContents as unknown as FakeContents
    await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, contents, copyPath)
    const begin = await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, 'save')
    expect(begin).toEqual({ ok: true, canceled: true })
    expect(showSaveDialog).toHaveBeenCalledTimes(1)
    const options = showSaveDialog.mock.calls[0]!.at(-1) as {
      defaultPath: string
      filters: Array<{ extensions: string[] }>
    }
    expect(basename(options.defaultPath)).toBe('Family letter.hwpx')
    expect(options.filters[0]!.extensions[0]).toBe('hwpx')
    // the temp copy was not touched
    expect([...readFileSync(copyPath)]).toEqual([...HWPX])
  })

  it('offers the project folder when its panel has a project (spec 6), else as before', async () => {
    const project = join(dir, 'Report')
    configureHwpRuntime({ preloadPath: '', newDocumentDir: async () => project })
    try {
      const contents = createHwpView(copyPath, { untitledCopy: true })
        .webContents as unknown as FakeContents
      await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, contents, copyPath)
      await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, 'save')
      const options = showSaveDialog.mock.calls.at(-1)!.at(-1) as { defaultPath: string }
      expect(options.defaultPath).toBe(join(project, 'Family letter.hwpx'))
    } finally {
      configureHwpRuntime({ preloadPath: '', newDocumentDir: async () => null })
    }
    const plain = createHwpView(copyPath, { untitledCopy: true })
      .webContents as unknown as FakeContents
    await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, plain, copyPath)
    await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, plain, 'save')
    const options = showSaveDialog.mock.calls.at(-1)!.at(-1) as { defaultPath: string }
    expect(options.defaultPath).toBe(
      join(tmpdir(), 'hwp-test-documents', 'IeumOffice', 'Family letter.hwpx'),
    )
  })

  it('becomes the chosen file after its first save', async () => {
    const target = join(dir, 'saved.hwpx')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    const contents = createHwpView(copyPath, { untitledCopy: true })
      .webContents as unknown as FakeContents
    await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, contents, copyPath)
    const begin = await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, 'save')
    expect(begin).toMatchObject({ ok: true, path: target })
    const done = await call<Promise<CommitSaveResult>>(HWP_CHANNELS.commitSave, contents, HWPX, [])
    expect(done).toMatchObject({ ok: true, path: target })
    expect(existsSync(target)).toBe(true)
    expect(call(HWP_CHANNELS.untitledCopy, contents)).toBeNull()
    // a later save goes straight to the file
    const again = await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, 'save')
    expect(again).toMatchObject({ ok: true, path: target })
    expect(showSaveDialog).toHaveBeenCalledTimes(1)
  })

  it('leaves an ordinary open as it was', async () => {
    const file = join(dir, 'doc.hwpx')
    writeFileSync(file, HWPX)
    const contents = createHwpView(file).webContents as unknown as FakeContents
    expect(call(HWP_CHANNELS.untitledCopy, contents)).toBeNull()
    await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, contents, file)
    const begin = await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, 'save')
    expect(begin).toMatchObject({ ok: true, path: file })
    expect(showSaveDialog).not.toHaveBeenCalled()
  })
})
