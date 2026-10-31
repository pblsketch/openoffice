/**
 * ai:read-url in the sheets main process is a standalone handler: it parses
 * its input with zod, hands the tool a cancellable signal, and answers a plain
 * failure object instead of throwing. The tool and the sidecar are mocked —
 * nothing here touches the network or starts a program.
 */
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../src/shared/ipc-channels'

type Handler = (event: { sender: FakeContents }, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
let lastContents: FakeContents
let nextId = 900
class FakeContents extends EventEmitter {
  id = ++nextId
  destroyed = false
  isDestroyed = () => this.destroyed
  setWindowOpenHandler = vi.fn()
  loadURL = vi.fn()
  send = vi.fn()
  destroy(): void {
    this.destroyed = true
    this.emit('destroyed')
  }
}

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getName: () => 'sheets-test',
    getVersion: () => '0',
    getAppPath: () => tmpdir(),
    isPackaged: false,
    on: () => {},
    once: () => {},
    whenReady: () => new Promise(() => {}),
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    on: () => {},
    removeHandler: () => {},
  },
  BrowserWindow: class {},
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
  WebContentsView: class {
    webContents = (lastContents = new FakeContents())
  },
  desktopCapturer: {},
  dialog: {},
  net: {},
  screen: {},
  session: {},
  shell: {},
  systemPreferences: {},
  webContents: { getAllWebContents: () => [], fromId: () => null },
}))

// no spreadsheet engine process: a tab only needs a client object to exist
vi.mock('../src/main/xlsx-sidecar-client', () => ({
  XlsxSidecarClient: class {
    start(): void {}
    onProcessExit(): void {}
  },
}))

const readUrlTool = vi.fn()
vi.mock('@genoffice/ai-search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/ai-search')>()),
  readUrlTool: (...args: unknown[]) => readUrlTool(...args),
}))

// no status check either: registering the subscription channels would look for the CLIs
vi.mock('@genoffice/ai-provider/subscription', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/ai-provider/subscription')>()),
  ensureSubscriptionIpc: () => ({}),
  sharedSubscriptionStatuses: () => ({}),
}))

import { createSheetsView } from '../src/main/sheets-main'

const call = (sender: FakeContents, url: unknown, offset?: unknown) =>
  handlers.get('ai:read-url')!({ sender }, url, offset) as Promise<unknown>

beforeAll(() => {
  // the standalone app: this main answers ai:stream-cancel itself
  createSheetsView({ includeAiHandlers: true })
})

beforeEach(() => {
  readUrlTool.mockReset()
})

describe('sheets ai:read-url', () => {
  it('reads the address it was given, paged by a numeric offset', async () => {
    const done = {
      ok: true,
      url: 'https://example.com/',
      text: 'hello',
      offset: 0,
      totalChars: 5,
      truncated: false,
    }
    readUrlTool.mockResolvedValueOnce(done)
    const sender = lastContents

    expect(await call(sender, 'https://example.com/', 40)).toEqual(done)
    const [settingsPath, url, offset, options] = readUrlTool.mock.calls.at(-1)!
    expect(settingsPath).toBe(join(tmpdir(), 'ai-settings.json'))
    expect(url).toBe('https://example.com/')
    expect(offset).toBe(40)
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.signal.aborted).toBe(false)
  })

  it('rejects a non-string address and a non-numeric offset falls to 0', async () => {
    readUrlTool.mockResolvedValueOnce({ ok: false, error: 'bad', errorCode: 'invalid_url' })
    const sender = lastContents

    expect(await call(sender, 42)).toEqual({
      ok: false,
      error: 'The read failed.',
      errorCode: 'network',
    })
    expect(readUrlTool).not.toHaveBeenCalled()

    await call(sender, 'https://example.com/', '40')
    const [, url, offset] = readUrlTool.mock.calls.at(-1)!
    expect(url).toBe('https://example.com/')
    expect(offset).toBe(0)
  })

  it('answers a failure object when the tool throws', async () => {
    readUrlTool.mockRejectedValueOnce(new Error('boom'))

    expect(await call(lastContents, 'https://example.com/')).toEqual({
      ok: false,
      error: 'The read failed.',
      errorCode: 'network',
    })
  })

  it('refuses a sender that is not a registered sheets tab', async () => {
    const stranger = new FakeContents()

    await expect(call(stranger, 'https://example.com/')).rejects.toThrow('Untrusted IPC sender.')
    expect(readUrlTool).not.toHaveBeenCalled()
  })

  it('aborts the download when the user stops the AI run', async () => {
    let answer!: (result: unknown) => void
    readUrlTool.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    )
    const sender = lastContents
    const result = call(sender, 'https://example.com/')
    const signal = readUrlTool.mock.calls.at(-1)![3].signal as AbortSignal

    await handlers.get(IPC_CHANNELS.aiStreamCancel)!({ sender }, 'turn-that-already-ended')
    expect(signal.aborted).toBe(true)
    answer({ ok: false, error: 'The read was cancelled.', errorCode: 'network' })
    await result
  })
})
