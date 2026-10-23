// @vitest-environment node
/**
 * The main process: what it hands the renderer on open, what it agrees to
 * write, and which links it opens. A file that did not open as `ok` is never
 * written, and a save never changes a file's format, whatever the renderer asks for.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
const openExternal = vi.fn(async (_url: string) => {})
const showSaveDialog = vi.fn()
const showMessageBox = vi.fn()

interface FakeContents {
  id: number
  sent: Array<[string, ...unknown[]]>
  destroyed: boolean
  windowOpenHandler: ((details: { url: string }) => { action: string }) | null
  listeners: Map<string, (...args: unknown[]) => void>
  isDestroyed(): boolean
  setWindowOpenHandler(handler: (details: { url: string }) => { action: string }): void
  loadURL(url: string): Promise<void>
  getURL(): string
  send(channel: string, ...args: unknown[]): void
  on(event: string, listener: (...args: unknown[]) => void): void
  once(event: string, listener: (...args: unknown[]) => void): void
}

let nextId = 1
const loaded: string[] = []
function fakeContents(): FakeContents {
  const contents: FakeContents = {
    id: nextId++,
    sent: [],
    destroyed: false,
    windowOpenHandler: null,
    listeners: new Map(),
    isDestroyed: () => contents.destroyed,
    setWindowOpenHandler: (handler) => {
      contents.windowOpenHandler = handler
    },
    loadURL: async (url) => {
      loaded.push(url)
    },
    getURL: () => loaded.at(-1) ?? '',
    send: (channel, ...args) => {
      contents.sent.push([channel, ...args])
    },
    on: (event, listener) => {
      contents.listeners.set(event, listener)
    },
    once: (event, listener) => {
      contents.listeners.set(event, listener)
    },
  }
  return contents
}

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: () => new Promise(() => {}),
    getPath: (name: string) => join(tmpdir(), `excalidraw-test-${name}`),
    getLocale: () => 'en-US',
  },
  dialog: {
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
    showMessageBox: (...args: unknown[]) => showMessageBox(...args),
  },
  shell: { openExternal: (url: string) => openExternal(url) },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
  net: {},
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

import { createDrawing } from '@genoffice/excalidraw-engine'
import {
  createExcalidrawView,
  excalidrawFilePath,
  excalidrawIsDirty,
  requestExcalidrawClose,
  requestExcalidrawSave,
} from '../src/main/excalidraw-main'
import { EXCALIDRAW_CHANNELS } from '../src/shared/ipc'
import type { OpenFileResult, PendingOpen, SaveDrawingResult } from '../src/shared/ipc'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-excalidraw-main-'))
  openExternal.mockClear()
  showSaveDialog.mockReset()
  showMessageBox.mockReset()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const noteBytes = (): Uint8Array => createDrawing('markdown').save(null)
const sceneBytes = (): Uint8Array => createDrawing('json').save(null)

function view(openPath?: string | null): FakeContents {
  return createExcalidrawView(openPath).webContents as unknown as FakeContents
}

const call = <T>(channel: string, contents: FakeContents, ...args: unknown[]): T =>
  handlers.get(channel)!({ sender: contents }, ...args) as T

const open = (contents: FakeContents, path: string) =>
  call<Promise<OpenFileResult>>(EXCALIDRAW_CHANNELS.openFile, contents, path)

const save = (contents: FakeContents, request: unknown) =>
  call<Promise<SaveDrawingResult>>(EXCALIDRAW_CHANNELS.save, contents, request)

describe('channel names', () => {
  it('every channel of the editor starts with excalidraw: and no name is used twice', () => {
    const names = Object.values(EXCALIDRAW_CHANNELS)
    for (const name of names) expect(name).toMatch(/^excalidraw:[a-z-]+$/)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('opening', () => {
  it('hands the queued file with the format its name says', async () => {
    const path = join(dir, 'Board.excalidraw.md')
    writeFileSync(path, noteBytes())
    const contents = view(path)
    expect(await call<PendingOpen | null>(EXCALIDRAW_CHANNELS.consumePending, contents)).toEqual({
      path,
      format: 'markdown',
    })
    const result = await open(contents, path)
    expect(result.status).toBe('ok')
    expect(excalidrawFilePath(contents.id)).toBe(path)
  })

  it('refuses a path the view was not given', async () => {
    const contents = view(null)
    await expect(open(contents, join(dir, 'other.excalidraw'))).rejects.toThrow(/not granted/)
  })

  it('never writes a file that did not open, by any way of saving', async () => {
    const path = join(dir, 'plain.md')
    writeFileSync(path, '# just notes\n')
    const contents = view(path)
    expect((await open(contents, path)).status).toBe('not-a-drawing')
    const result = await save(contents, { bytes: noteBytes(), format: 'markdown', mode: 'save' })
    expect(result.ok).toBe(false)
    call(EXCALIDRAW_CHANNELS.dirtyChanged, contents, true)
    expect(excalidrawIsDirty(contents.id)).toBe(false)
    expect(await requestExcalidrawSave(contents as never, 'save')).toBe(false)
    expect(await requestExcalidrawClose(contents as never)).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe('# just notes\n')
    expect(showSaveDialog).not.toHaveBeenCalled()
  })

  it('refuses a save before the file was seen open', async () => {
    const path = join(dir, 'Board.excalidraw.md')
    writeFileSync(path, noteBytes())
    const contents = view(path)
    const result = await save(contents, { bytes: noteBytes(), format: 'markdown', mode: 'save' })
    expect(result.ok).toBe(false)
  })
})

describe('saving', () => {
  it('writes an opened note in place', async () => {
    const path = join(dir, 'Board.excalidraw.md')
    writeFileSync(path, noteBytes())
    const contents = view(path)
    await open(contents, path)
    const bytes = noteBytes()
    expect(await save(contents, { bytes, format: 'markdown', mode: 'save' })).toEqual({
      ok: true,
      path,
    })
    expect(new Uint8Array(readFileSync(path))).toEqual(bytes)
  })

  it('never changes a file format, nor writes bytes that do not open', async () => {
    const path = join(dir, 'board.excalidraw')
    writeFileSync(path, sceneBytes())
    const contents = view(path)
    await open(contents, path)
    const asNote = await save(contents, { bytes: noteBytes(), format: 'markdown', mode: 'save' })
    expect(asNote.ok).toBe(false)
    const junk = await save(contents, {
      bytes: new TextEncoder().encode('not json'),
      format: 'json',
      mode: 'save',
    })
    expect(junk.ok).toBe(false)
    expect(new Uint8Array(readFileSync(path))).toEqual(sceneBytes())
  })

  it('names a new drawing as an Obsidian note', async () => {
    const contents = view(null)
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: join(dir, 'Sketch') })
    const result = await save(contents, { bytes: noteBytes(), format: 'markdown', mode: 'save' })
    expect(result).toEqual({ ok: true, path: join(dir, 'Sketch.excalidraw.md') })
    expect(readdirSync(dir)).toEqual(['Sketch.excalidraw.md'])
  })
})

describe('links', () => {
  it('opens web links only', async () => {
    const contents = view(null)
    expect(await call(EXCALIDRAW_CHANNELS.openLink, contents, 'https://example.com')).toBe(true)
    expect(await call(EXCALIDRAW_CHANNELS.openLink, contents, 'file:///C:/x.exe')).toBe(false)
    expect(await call(EXCALIDRAW_CHANNELS.openLink, contents, 'javascript:alert(1)')).toBe(false)
    expect(openExternal).toHaveBeenCalledTimes(1)
  })
})

describe('pictures', () => {
  it('reads nothing for a view without an opened note', async () => {
    const contents = view(null)
    expect(
      await call(EXCALIDRAW_CHANNELS.readEmbedded, contents, {
        refs: [{ fileId: 'a', target: 'a.png' }],
      }),
    ).toEqual([])
  })
})
