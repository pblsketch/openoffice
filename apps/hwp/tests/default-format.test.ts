// @vitest-environment node
/**
 * The first save of a brand-new Hangul document follows the format chosen in
 * Settings › General (userData/app-settings.json). A document that came from a
 * file keeps that file's format, and an untitled template copy keeps the
 * template's format, whatever the setting says.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

const userData = { dir: '' }

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: () => new Promise(() => {}),
    getPath: (name: string) =>
      name === 'userData' ? userData.dir : join(tmpdir(), `hwp-test-${name}`),
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

import { createHwpView, hwpRecoveryIdentity } from '../src/main/hwp-main'
import {
  HWP_DEFAULT_FORMAT_KEY,
  normalizeHwpDefaultFormat,
  readHwpDefaultFormat,
} from '../src/main/default-format'
import { HWP_CHANNELS } from '../src/shared/ipc'
import type { BeginSaveResult } from '../src/shared/ipc'

const call = <T>(channel: string, contents: FakeContents, ...args: unknown[]): T =>
  handlers.get(channel)!({ sender: contents }, ...args) as T

/** HWPX bytes enough for the container check (ZIP magic). */
const HWPX = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x21, 0x22, 0x23])

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-hwp-default-format-'))
  userData.dir = join(dir, 'userData')
  mkdirSync(userData.dir, { recursive: true })
  showSaveDialog.mockClear()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function storeFormat(value: unknown): void {
  writeFileSync(
    join(userData.dir, 'app-settings.json'),
    JSON.stringify({ [HWP_DEFAULT_FORMAT_KEY]: value }),
  )
}

async function beginNewDocumentSave(): Promise<{
  begin: BeginSaveResult
  options: { defaultPath: string; filters: Array<{ extensions: string[] }> }
}> {
  const contents = createHwpView().webContents as unknown as FakeContents
  const begin = await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, 'save')
  const options = showSaveDialog.mock.calls.at(-1)!.at(-1) as {
    defaultPath: string
    filters: Array<{ extensions: string[] }>
  }
  return { begin, options }
}

describe('the format setting', () => {
  it('reads HWPX and falls back to HWP for anything else', () => {
    expect(normalizeHwpDefaultFormat('hwpx')).toBe('hwpx')
    expect(normalizeHwpDefaultFormat('hwp')).toBe('hwp')
    expect(normalizeHwpDefaultFormat('odt')).toBe('hwp')
    expect(normalizeHwpDefaultFormat(undefined)).toBe('hwp')
  })

  it('reads the choice from app-settings.json and survives a missing or broken file', () => {
    const app = { getPath: (): string => userData.dir }
    expect(readHwpDefaultFormat(app)).toBe('hwp')
    storeFormat('hwpx')
    expect(readHwpDefaultFormat(app)).toBe('hwpx')
    writeFileSync(join(userData.dir, 'app-settings.json'), '{not json')
    expect(readHwpDefaultFormat(app)).toBe('hwp')
  })
})

describe('the first save of a new document', () => {
  it('offers HWP by default', async () => {
    const target = join(dir, 'notes')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    const { begin, options } = await beginNewDocumentSave()
    expect(options.filters[0]!.extensions).toEqual(['hwp'])
    expect(options.defaultPath.endsWith('.hwp')).toBe(true)
    expect(begin).toEqual({ ok: true, path: `${target}.hwp`, format: 'hwp' })
  })

  it('offers HWPX first when the setting says so', async () => {
    storeFormat('hwpx')
    const target = join(dir, 'notes')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    const { begin, options } = await beginNewDocumentSave()
    expect(options.filters[0]!.extensions).toEqual(['hwpx'])
    expect(options.defaultPath.endsWith('.hwpx')).toBe(true)
    expect(begin).toEqual({ ok: true, path: `${target}.hwpx`, format: 'hwpx' })
  })

  it('keeps the format of a file the document was opened from', async () => {
    storeFormat('hwpx')
    const file = join(dir, 'doc.hwp')
    writeFileSync(file, HWPX)
    const contents = createHwpView(file).webContents as unknown as FakeContents
    await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, contents, file)
    const begin = await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, 'save')
    expect(begin).toEqual({ ok: true, path: file, format: 'hwp' })
    expect(showSaveDialog).not.toHaveBeenCalled()
  })

  it('keeps an untitled template copy in the template’s format', async () => {
    storeFormat('hwpx')
    const copyPath = join(dir, 'template.hwp')
    writeFileSync(copyPath, HWPX)
    const contents = createHwpView(copyPath, { untitledCopy: true })
      .webContents as unknown as FakeContents
    await call<Promise<Uint8Array>>(HWP_CHANNELS.readFile, contents, copyPath)
    const begin = await call<Promise<BeginSaveResult>>(HWP_CHANNELS.beginSave, contents, 'save')
    expect(begin).toEqual({ ok: true, canceled: true })
    const options = showSaveDialog.mock.calls.at(-1)!.at(-1) as {
      defaultPath: string
      filters: Array<{ extensions: string[] }>
    }
    expect(options.filters[0]!.extensions).toEqual(['hwp'])
    expect(options.defaultPath.endsWith('.hwp')).toBe(true)
  })

  it('keeps a new document’s recovery copy in the configured format', () => {
    storeFormat('hwpx')
    const contents = createHwpView().webContents as unknown as FakeContents
    expect(hwpRecoveryIdentity(contents as never)).toMatchObject({ ext: '.hwpx' })
  })
})
