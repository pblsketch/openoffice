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
  send: ReturnType<typeof vi.fn>
  mainFrame?: {
    framesInSubtree: { url: string; executeJavaScript(code: string): Promise<unknown> }[]
  }
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
    send: vi.fn(),
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
const newDocument = vi.fn()

/** One key event as the editor's webContents would receive it. */
function press(
  code: string,
  keys: Partial<FakeInput> = {},
  contents = createHwpView().webContents as unknown as FakeContents,
): FakeEvent {
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
  newDocument.mockClear()
  configureHwpRuntime({ preloadPath: '', openFileDialog, goHome, newDocument })
})

describe('file shortcuts the editor swallows', () => {
  it('asks the shell to open a file on Ctrl+O', () => {
    const event = press('KeyO')
    expect(openFileDialog).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('goes home on Ctrl+Shift+H (outside a table: the editor does not take it)', async () => {
    const event = press('KeyH', { shift: true })
    await flush()
    expect(goHome).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('leaves Ctrl+Shift+O to the menu', () => {
    const shifted = press('KeyO', { shift: true })
    expect(openFileDialog).not.toHaveBeenCalled()
    expect(shifted.preventDefault).not.toHaveBeenCalled()
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

/** The editor frame as the main process sees it, answering whether it took a key. */
function withEditorFrame(answer: unknown): FakeContents {
  const contents = createHwpView().webContents as unknown as FakeContents
  contents.mainFrame = {
    framesInSubtree: [
      { url: 'genoffice-app://hwp/index.html', executeJavaScript: async () => false },
      {
        url: 'genoffice-app://hwp/studio/index.html?chrome=embed',
        executeJavaScript: vi.fn(async () => answer),
      },
    ],
  }
  return contents
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe.skipIf(process.platform === 'darwin')(
  "Hangul's file keys (Alt+N/O/S/V/P, decision 0060)",
  () => {
    const alt = { alt: true, control: false, meta: false }

    it('make a new Hangul document on Alt+N and open a file on Alt+O', () => {
      expect(press('KeyN', alt).preventDefault).toHaveBeenCalled()
      expect(newDocument).toHaveBeenCalledTimes(1)
      expect(press('KeyO', alt).preventDefault).toHaveBeenCalled()
      expect(openFileDialog).toHaveBeenCalledTimes(1)
    })

    it('save on Alt+S, save as on Alt+V and print on Alt+P', () => {
      for (const [code, channel, mode] of [
        ['KeyS', 'hwp:save-request', 'save'],
        ['KeyV', 'hwp:save-request', 'saveAs'],
        ['KeyP', 'hwp:print-request', 'print'],
      ] as const) {
        const contents = createHwpView().webContents as unknown as FakeContents
        expect(press(code, alt, contents).preventDefault, code).toHaveBeenCalled()
        expect(
          contents.send.mock.calls.map((call) => call[1]),
          code,
        ).toEqual([mode])
        expect(contents.send.mock.calls[0][0], code).toBe(channel)
      }
    })

    it('leave the editor its own Alt keys (Alt+L, Alt+T, Alt+Shift+S, Ctrl+Alt+S)', () => {
      for (const [code, keys] of [
        ['KeyL', alt],
        ['KeyT', alt],
        ['KeyS', { ...alt, shift: true }],
        ['KeyS', { ...alt, control: true }],
      ] as const) {
        expect(press(code, keys).preventDefault, code).not.toHaveBeenCalled()
      }
    })

    it('leave Alt+N to the menu when the shell passed no action', () => {
      configureHwpRuntime({ preloadPath: '' })
      expect(press('KeyN', alt).preventDefault).not.toHaveBeenCalled()
    })
  },
)

describe('keys that are Hangul table keys where the caret is', () => {
  it('Ctrl+Shift+S: the block sum when the editor takes it, else save as', async () => {
    const block = withEditorFrame(true)
    press('KeyS', { shift: true }, block)
    await flush()
    expect(block.send).not.toHaveBeenCalled()
    const body = withEditorFrame(false)
    press('KeyS', { shift: true }, body)
    await flush()
    expect(body.send.mock.calls.map((call) => call[1])).toEqual(['saveAs'])
  })

  it('Ctrl+Shift+H: the horizontal sum in a table cell, else home', async () => {
    const cell = withEditorFrame(true)
    expect(press('KeyH', { shift: true }, cell).preventDefault).toHaveBeenCalled()
    await flush()
    expect(goHome).not.toHaveBeenCalled()
    press('KeyH', { shift: true }, withEditorFrame(false))
    await flush()
    expect(goHome).toHaveBeenCalledTimes(1)
  })

  it('fall back to what the app does when the editor frame cannot say', async () => {
    const lost = withEditorFrame(true)
    lost.mainFrame!.framesInSubtree[1].executeJavaScript = async () => {
      throw new Error('frame gone')
    }
    press('KeyS', { shift: true }, lost)
    await flush()
    expect(lost.send.mock.calls.map((call) => call[1])).toEqual(['saveAs'])
    press('KeyH', { shift: true })
    await flush()
    expect(goHome).toHaveBeenCalledTimes(1)
  })
})
