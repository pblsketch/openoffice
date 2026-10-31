/**
 * The "open fonts folder" channel: registered by registerSlidesIpc (the registration the shell
 * runs when it opens a slides tab; registerAiIpc runs only standalone), and it opens exactly the
 * bundled font folder whatever the renderer sends.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { templateFontsDir } from '@genoffice/electron-utils/template-fonts-dir'

const CHANNEL = 'slides:open-template-fonts-folder'
const APP_PATH = resolve(__dirname, '..')

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  openPath: vi.fn((_path: string): Promise<string> => Promise.resolve('')),
}))
const openPath = h.openPath

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => resolve(__dirname, '..'),
    getPath: () => tmpdir(),
    getName: () => 'slides-test',
    getVersion: () => '0',
    whenReady: () => Promise.resolve(),
  },
  dialog: {},
  clipboard: { writeBuffer: () => {} },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => h.handlers.set(channel, fn),
    on: () => {},
    removeHandler: () => {},
  },
  BrowserWindow: class {},
  webContents: { getAllWebContents: () => [], fromId: () => null },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
  session: {
    defaultSession: { protocol: { handle: () => {} }, setDisplayMediaRequestHandler: () => {} },
  },
  nativeImage: {},
  shell: {
    openPath: (p: string) => h.openPath(p),
    openExternal: () => {},
    showItemInFolder: () => {},
  },
  desktopCapturer: { getSources: async () => [] },
  WebContentsView: class {},
}))
vi.mock('../src/main/shaped-metrics', () => ({
  shapedMetricsReady: async () => {},
  refineComplexWidths: async () => {},
  complexScriptOf: () => null,
  initShapedMetrics: () => {},
  gtMeasure: () => null,
  shapedFamily: () => null,
  shapedMeasure: () => null,
}))

import { registerSlidesIpc } from '../src/main/slides-main'

const FOLDER = templateFontsDir({
  isPackaged: false,
  getAppPath: () => APP_PATH,
  resourcesPath: '',
})

beforeAll(() => {
  registerSlidesIpc()
})
beforeEach(() => {
  openPath.mockReset()
  openPath.mockResolvedValue('')
})

describe('open fonts folder', () => {
  it('is registered by registerSlidesIpc, the registration the shell runs too', () => {
    expect(h.handlers.has(CHANNEL)).toBe(true)
  })

  it('opens the bundled font folder and nothing else, whatever the renderer passes', async () => {
    const handler = h.handlers.get(CHANNEL)!
    const event = { sender: { id: 1 } }
    await expect(handler(event)).resolves.toBe(true)
    await expect(handler(event, 'C:\\Windows\\System32', '..\\..')).resolves.toBe(true)
    expect(openPath.mock.calls).toEqual([[FOLDER], [FOLDER]])
  })

  it('reports false when Explorer could not open it', async () => {
    openPath.mockResolvedValue('Failed to open path')
    await expect(h.handlers.get(CHANNEL)!({ sender: { id: 1 } })).resolves.toBe(false)
    openPath.mockRejectedValue(new Error('boom'))
    await expect(h.handlers.get(CHANNEL)!({ sender: { id: 1 } })).resolves.toBe(false)
  })

  it('the standalone-only AI registration does not own it', () => {
    const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
    expect(read('src/main/ai-ipc.ts')).not.toContain(CHANNEL)
  })

  it('the preload exposes it as openTemplateFontsFolder(): Promise<boolean>', () => {
    const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
    expect(read('src/preload/index.ts')).toContain(
      `openTemplateFontsFolder: () => ipcRenderer.invoke('${CHANNEL}')`,
    )
    expect(read('src/shared/ipc.ts')).toMatch(/openTemplateFontsFolder: \(\) => Promise<boolean>/)
  })
})
