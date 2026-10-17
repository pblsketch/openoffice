import { beforeEach, describe, expect, it, vi } from 'vitest'
import { productName } from '@genoffice/i18n'
import { DOC_ATTACH_CHANNELS } from '@genoffice/electron-utils/doc-attach-channels'
import type { DocAttachResult } from '@genoffice/electron-utils/doc-attach-bridge'
import {
  DOC_PICKER_CHANNELS,
  type DocListItem,
  type DocListResult,
} from '../src/shared/doc-picker-api'
import { docPickerText } from '../src/renderer/src/i18n/strings-doc-picker'

/**
 * The shell end of the "Attach documents" window (src/main/doc-picker/):
 * one window over the editor that asked, ids validated against the list it
 * read, chosen paths handed back, closing/cancelling = cancelled, a second
 * asker gets "busy", and a request from a non-window sender is refused.
 */

type Handler = (event?: unknown, ...args: unknown[]) => unknown

const handlers = new Map<string, Handler>()
const winOptions: Array<Record<string, unknown>> = []
const windows: FakeBrowserWindow[] = []
let nextWcId = 1

class FakeWebContents {
  readonly id: number
  constructor() {
    this.id = nextWcId++
  }
  setWindowOpenHandler(): void {}
  send(): void {}
}

interface WindowLike {
  isDestroyed(): boolean
}

class FakeBrowserWindow {
  static windowForWc = new Map<FakeWebContents, WindowLike>()
  webContents = new FakeWebContents()
  options: Record<string, unknown>
  shown = false
  focused = false
  destroyed = false
  private readyCb: (() => void) | null = null
  private closedCb: (() => void) | null = null

  constructor(options: Record<string, unknown> = {}) {
    this.options = options
    winOptions.push(options)
    windows.push(this)
  }
  static fromWebContents(wc: FakeWebContents): WindowLike | null {
    return FakeBrowserWindow.windowForWc.get(wc) ?? null
  }
  isDestroyed(): boolean {
    return this.destroyed
  }
  show(): void {
    this.shown = true
  }
  focus(): void {
    this.focused = true
  }
  removeMenu(): void {}
  once(event: string, cb: () => void): void {
    if (event === 'ready-to-show') this.readyCb = cb
  }
  on(event: string, cb: () => void): void {
    if (event === 'closed') this.closedCb = cb
  }
  loadURL(): Promise<void> {
    return Promise.resolve()
  }
  loadFile(): Promise<void> {
    return Promise.resolve()
  }
  close(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.closedCb?.()
  }
  fireReady(): void {
    this.readyCb?.()
  }
}

vi.mock('electron', () => ({
  BrowserWindow: FakeBrowserWindow,
  ipcMain: {
    handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
  },
  shell: { openExternal: vi.fn() },
}))

const ITEMS: DocListItem[] = [
  { id: 'C:/docs/a.docx', title: 'a.docx', dir: 'C:/docs', state: 'ok', group: 'open' },
  { id: 'C:/docs/b.pdf', title: 'b.pdf', dir: 'C:/docs', state: 'ok', group: 'recent' },
  { id: 'unsaved:tab-1', title: '제목 없는 문서', dir: '', state: 'unsaved', group: 'open' },
  { id: 'C:/docs/gone.pdf', title: 'gone.pdf', dir: 'C:/docs', state: 'missing', group: 'recent' },
]

function makeDeps() {
  return {
    list: vi.fn(async (): Promise<DocListResult> => ({ ok: true, items: ITEMS })),
    lang: () => 'ko' as const,
    theme: () => 'light' as const,
  }
}

async function load(deps = makeDeps()) {
  const mod = await import('../src/main/doc-picker/doc-picker-window')
  return { picker: mod.createDocPicker(deps), deps }
}

/** a window that can be the parent of the modal picker (a plain stand-in) */
function fakeParent(): { webContents: FakeWebContents; isDestroyed: () => boolean } {
  const webContents = new FakeWebContents()
  const parent = { webContents, isDestroyed: () => false }
  FakeBrowserWindow.windowForWc.set(webContents, parent)
  return parent
}

const pickerWindow = (): FakeBrowserWindow => windows.at(-1)!

function invoke(channel: string, event?: unknown, ...args: unknown[]): unknown {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`no handler for ${channel}`)
  return handler(event, ...args)
}

/** open through the real entry point and return the pending pick + the window */
async function openPicker() {
  const parent = fakeParent()
  const pending = invoke(DOC_ATTACH_CHANNELS.pick, { sender: parent.webContents }) as Promise<DocAttachResult>
  const win = windows.at(-1)!
  return { parent, pending, win }
}

const atPicker = () => ({ sender: pickerWindow().webContents })

beforeEach(() => {
  vi.resetModules()
  handlers.clear()
  winOptions.length = 0
  windows.length = 0
  FakeBrowserWindow.windowForWc.clear()
  nextWcId = 1
})

describe('createDocPicker window', () => {
  it('registers its own channels and the editor attach channels', async () => {
    await load()
    for (const channel of Object.values(DOC_PICKER_CHANNELS)) expect(handlers.has(channel)).toBe(true)
    for (const channel of Object.values(DOC_ATTACH_CHANNELS)) expect(handlers.has(channel)).toBe(true)
  })

  it('answers the editor that the shell is available', async () => {
    await load()
    expect(invoke(DOC_ATTACH_CHANNELS.available)).toBe(true)
  })

  it('refuses a pick from a sender that is not a window', async () => {
    await load()
    const result = await invoke(DOC_ATTACH_CHANNELS.pick, { sender: new FakeWebContents() })
    expect(result).toEqual({ ok: false, reason: 'unavailable' })
    expect(winOptions).toHaveLength(0)
  })

  it('opens one modal child of the requesting window, sized and titled like the Drive picker', async () => {
    await load()
    const { parent, pending } = await openPicker()
    const win = pickerWindow()
    expect(win.options.parent).toBe(parent)
    expect(win.options.modal).toBe(true)
    expect(win.options.width).toBe(720)
    expect(win.options.height).toBe(640)
    expect(win.options.minWidth).toBe(480)
    expect(win.options.minHeight).toBe(420)
    expect(win.options.show).toBe(false)
    expect(win.options.title).toBe(`${docPickerText('ko', 'docPickTitle')} - ${productName('ko')}`)
    expect(win.options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    })
    // shown once the page is ready
    win.fireReady()
    expect(win.shown).toBe(true)
    void invoke(DOC_PICKER_CHANNELS.cancel, atPicker())
    await expect(pending).resolves.toEqual({ ok: false, reason: 'cancelled' })
  })

  it('answers the picker window with its language and theme, and nothing to others', async () => {
    await load()
    await openPicker()
    expect(invoke(DOC_PICKER_CHANNELS.getInit, atPicker())).toEqual({ lang: 'ko', theme: 'light' })
    expect(invoke(DOC_PICKER_CHANNELS.getInit, { sender: new FakeWebContents() })).toBeNull()
  })

  it('hands the ticked paths back after validating the ids against the list just read', async () => {
    await load()
    const { pending } = await openPicker()
    const listed = await invoke(DOC_PICKER_CHANNELS.list, atPicker())
    expect(listed).toEqual({ ok: true, items: ITEMS })
    // valid, unsaved, missing, unknown, non-string and too-long ids
    const chosen = invoke(DOC_PICKER_CHANNELS.choose, atPicker(), [
      'C:/docs/a.docx',
      'unsaved:tab-1',
      'C:/docs/gone.pdf',
      'C:/docs/never-listed.pdf',
      42,
      'x'.repeat(4097),
      'C:/docs/b.pdf',
    ])
    expect(chosen).toEqual({ ok: true })
    await expect(pending).resolves.toEqual({ ok: true, paths: ['C:/docs/a.docx', 'C:/docs/b.pdf'] })
    expect(pickerWindow().destroyed).toBe(true)
  })

  it('drops duplicate ids', async () => {
    await load()
    const { pending } = await openPicker()
    await invoke(DOC_PICKER_CHANNELS.list, atPicker())
    invoke(DOC_PICKER_CHANNELS.choose, atPicker(), ['C:/docs/a.docx', 'C:/docs/a.docx'])
    await expect(pending).resolves.toEqual({ ok: true, paths: ['C:/docs/a.docx'] })
  })

  it('cancels when nothing survives validation', async () => {
    await load()
    const { pending } = await openPicker()
    await invoke(DOC_PICKER_CHANNELS.list, atPicker())
    const chosen = invoke(DOC_PICKER_CHANNELS.choose, atPicker(), ['unsaved:tab-1', 'C:/docs/gone.pdf'])
    expect(chosen).toEqual({ ok: true })
    await expect(pending).resolves.toEqual({ ok: false, reason: 'cancelled' })
  })

  it('cancels when the picker window never read a list', async () => {
    await load()
    const { pending } = await openPicker()
    invoke(DOC_PICKER_CHANNELS.choose, atPicker(), ['C:/docs/a.docx'])
    await expect(pending).resolves.toEqual({ ok: false, reason: 'cancelled' })
  })

  it('resolves cancel as cancelled and closes the window', async () => {
    await load()
    const { pending, win } = await openPicker()
    invoke(DOC_PICKER_CHANNELS.cancel, atPicker())
    await expect(pending).resolves.toEqual({ ok: false, reason: 'cancelled' })
    expect(win.destroyed).toBe(true)
  })

  it('resolves closing the window as cancelled, never ok', async () => {
    await load()
    const { pending, win } = await openPicker()
    win.close()
    await expect(pending).resolves.toEqual({ ok: false, reason: 'cancelled' })
  })

  it('turns a second asker away as busy and brings the open window forward', async () => {
    await load()
    const { pending, win } = await openPicker()
    const other = fakeParent()
    const second = await invoke(DOC_ATTACH_CHANNELS.pick, { sender: other.webContents })
    expect(second).toEqual({ ok: false, reason: 'busy' })
    expect(win.shown).toBe(true)
    expect(win.focused).toBe(true)
    // still only one window, the first asker is still waiting
    expect(winOptions).toHaveLength(1)
    void invoke(DOC_PICKER_CHANNELS.cancel, atPicker())
    await expect(pending).resolves.toEqual({ ok: false, reason: 'cancelled' })
  })

  it('refuses picker-channel calls when no window is open', async () => {
    await load()
    const stray = { sender: new FakeWebContents() }
    await expect(invoke(DOC_PICKER_CHANNELS.list, stray)).resolves.toEqual({
      ok: false,
      kind: 'unavailable',
    })
    expect(invoke(DOC_PICKER_CHANNELS.choose, stray, ['x'])).toEqual({
      ok: false,
      kind: 'unavailable',
    })
  })
})
