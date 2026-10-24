import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: { sender: { id: number } }, ...args: unknown[]) => unknown

const handlers = new Map<string, IpcHandler>()
const generateImageTool = vi.fn(
  async (..._args: unknown[]): Promise<{ url?: string; error?: string }> => ({
    url: 'file:///generated.png',
  }),
)
let nextId = 0
/** a tab's webContents: an id, and the `destroyed` event of a closed tab */
class FakeContents extends EventEmitter {
  id = ++nextId
  destroyed = false
  isDestroyed = () => this.destroyed
  loadFile = vi.fn()
  loadURL = vi.fn()
  send = vi.fn()
  setWindowOpenHandler = vi.fn()
  destroy(): void {
    this.destroyed = true
    this.emit('destroyed')
  }
}
const statuses = {
  'claude-code': { provider: 'claude-code', state: 'ready', meteredAccepted: false },
  codex: { provider: 'codex', state: 'ready', meteredAccepted: false },
}

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => tmpdir()),
    on: vi.fn(),
    quit: vi.fn(),
    whenReady: vi.fn(() => new Promise(() => {})),
  },
  BrowserWindow: class {
    static fromWebContents() {
      return null
    }
    static getFocusedWindow() {
      return null
    }
  },
  dialog: { showMessageBox: vi.fn() },
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlers.set(channel, handler)),
    on: vi.fn((channel: string, handler: IpcHandler) => handlers.set(channel, handler)),
    removeHandler: vi.fn(),
  },
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn() },
  shell: { openExternal: vi.fn() },
  WebContentsView: class {
    webContents = new FakeContents()
  },
}))

vi.mock('@genoffice/electron-utils', () => ({
  configuredDefaultSaveDir: vi.fn(() => tmpdir()),
  contextMenuLabels: vi.fn(() => ({})),
  installContextMenu: vi.fn(),
  installNavigationGuard: vi.fn(),
  registerRecoveryEditor: vi.fn(() => () => {}),
  rendererUrl: vi.fn(() => 'genoffice-app://markdown/index.html'),
  safeExternalUrl: vi.fn(() => null),
  showOpenDialogWithMemory: vi.fn(),
  showSaveDialogWithMemory: vi.fn(),
}))

vi.mock('@genoffice/ai-search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/ai-search')>()),
  generateImageTool: (...args: unknown[]) => generateImageTool(...args),
  documentMediaRoots: vi.fn(() => ['/doc-dir']),
}))

// the process-wide statuses of the subscription service (registered by the docs main in the shell)
vi.mock('@genoffice/ai-provider/subscription', () => ({
  sharedSubscriptionStatuses: vi.fn(() => statuses),
}))

import { abortMediaCalls } from '@genoffice/ai-search'
import { createMarkdownView } from '../src/main/markdown-main'
import { MARKDOWN_CHANNELS } from '../src/shared/ipc'

describe('markdown:ai-generate-image', () => {
  it('calls the image tool on the screen path with the live subscription statuses', async () => {
    const view = createMarkdownView(null)
    const handler = handlers.get(MARKDOWN_CHANNELS.aiGenerateImage)
    expect(handler).toBeDefined()

    const result = await handler!(
      { sender: view.webContents as never },
      { prompt: 'a lighthouse at dusk', aspectRatio: '16:9' },
    )

    expect(result).toEqual({ url: 'file:///generated.png' })
    expect(generateImageTool).toHaveBeenCalledTimes(1)
    const [settingsPath, op, options] = generateImageTool.mock.calls[0]!
    expect(settingsPath).toBe(join(tmpdir(), 'ai-settings.json'))
    expect(op).toEqual({ prompt: 'a lighthouse at dusk', aspectRatio: '16:9' })
    expect(options).toEqual({
      mediaRoots: ['/doc-dir'],
      context: { path: 'screen', statuses },
      signal: expect.any(AbortSignal),
    })
    expect((options as { signal: AbortSignal }).signal.aborted).toBe(false)
    // no login gate of a removed provider is passed along any more
    expect(options).not.toHaveProperty('notLoggedInError')
  })

  describe('cancelling', () => {
    /** a request that stays in flight until the test answers it */
    function startRequest() {
      let answer!: (result: { url?: string; error?: string }) => void
      generateImageTool.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve
          }),
      )
      const sender = createMarkdownView(null).webContents as unknown as FakeContents
      const result = handlers.get(MARKDOWN_CHANNELS.aiGenerateImage)!(
        { sender },
        { prompt: 'a lighthouse at dusk' },
      )
      const options = generateImageTool.mock.calls.at(-1)![2] as { signal: AbortSignal }
      return { sender, signal: options.signal, result, answer }
    }

    it('aborts when the tab that asked is closed', async () => {
      const request = startRequest()
      expect(request.signal.aborted).toBe(false)
      request.sender.destroy()
      expect(request.signal.aborted).toBe(true)
      request.answer({ error: 'cancelled' })
      await request.result
    })

    it('aborts when the AI run of its tab is stopped, and leaves another tab alone', async () => {
      const stopped = startRequest()
      const other = startRequest()
      // what the AI handlers do on the stop message (ai:stream-cancel) of a tab
      abortMediaCalls(stopped.sender.id)
      expect(stopped.signal.aborted).toBe(true)
      expect(other.signal.aborted).toBe(false)
      stopped.answer({ error: 'cancelled' })
      other.answer({ url: 'file:///generated.png' })
      expect(await other.result).toEqual({ url: 'file:///generated.png' })
      await stopped.result
    })
  })
})
