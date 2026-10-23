// @vitest-environment node
/**
 * The embedded editor swallows Ctrl+O (its own file:open is off in embed mode) and
 * Ctrl+Shift+H (its document history) before the page or the shell menu sees them,
 * just like Ctrl+S and Ctrl+P. The main process takes those keys off the event and
 * asks the shell to open a file or go home. A view the shell passed no action for
 * (the standalone editor) leaves them to the menu, whose accelerators still work.
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeEvent {
  preventDefault: ReturnType<typeof vi.fn>
}
interface FakeInput {
  type: string
  code: string
  key: string
  isAutoRepeat: boolean
  shift: boolean
  alt: boolean
  control: boolean
  meta: boolean
}
type Listener = (event: FakeEvent, input: FakeInput) => void

interface FakeContents {
  id: number
  destroyed: boolean
  isDestroyed(): boolean
  setWindowOpenHandler(handler: unknown): void
  loadURL(url: string): Promise<void>
  send(channel: string, ...args: unknown[]): void
  on(event: string, listener: Listener): void
  once(event: string, listener: (...args: unknown[]) => void): void
  press(event: string, input: FakeInput): FakeEvent
}

let nextId = 1
function fakeContents(): FakeContents {
  const listeners = new Map<string, Listener[]>()
  const contents: FakeContents = {
    id: nextId++,
    destroyed: false,
    isDestroyed: () => contents.destroyed,
    setWindowOpenHandler: () => {},
    loadURL: async () => {},
    send: () => {},
    on: (event, listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    },
    once: () => {},
    press: (event, input) => {
      const fakeEvent = { preventDefault: vi.fn() }
      for (const listener of listeners.get(event) ?? []) listener(fakeEvent, input)
      return fakeEvent
    },
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
    showSaveDialog: vi.fn(async () => ({ canceled: true })),
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
    handle: vi.fn(),
    on: vi.fn(),
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

const openFileDialog = vi.fn()
const goHome = vi.fn()

/** One key event as the editor's webContents would receive it. */
function press(code: string, keys: Partial<FakeInput> = {}): FakeEvent {
  const contents = createHwpView().webContents as unknown as FakeContents
  return contents.press('before-input-event', {
    type: 'keyDown',
    code,
    key: code.slice(3),
    isAutoRepeat: false,
    shift: false,
    alt: false,
    control: process.platform !== 'darwin',
    meta: process.platform === 'darwin',
    ...keys,
  })
}

beforeEach(() => {
  openFileDialog.mockClear()
  goHome.mockClear()
  configureHwpRuntime({ preloadPath: '', openFileDialog, goHome })
})

describe('file shortcuts the editor swallows', () => {
  it('asks the shell to open a file on Ctrl+O', () => {
    const event = press('KeyO')
    expect(openFileDialog).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('goes home on Ctrl+Shift+H', () => {
    const event = press('KeyH', { shift: true })
    expect(goHome).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('leaves Ctrl+Shift+O and Alt+O to the menu', () => {
    const shifted = press('KeyO', { shift: true })
    const altered = press('KeyO', { alt: true })
    expect(openFileDialog).not.toHaveBeenCalled()
    expect(shifted.preventDefault).not.toHaveBeenCalled()
    expect(altered.preventDefault).not.toHaveBeenCalled()
  })

  it('leaves the keys alone when the shell passed no action', () => {
    configureHwpRuntime({ preloadPath: '' })
    const open = press('KeyO')
    const home = press('KeyH', { shift: true })
    expect(openFileDialog).not.toHaveBeenCalled()
    expect(goHome).not.toHaveBeenCalled()
    expect(open.preventDefault).not.toHaveBeenCalled()
    expect(home.preventDefault).not.toHaveBeenCalled()
  })
})
