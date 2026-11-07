/**
 * The standalone sheets main writes the "use anyway" answer on a metered login
 * to ai-settings.json. That write must leave the key providers' keys sealed
 * (decision 0063), and the app must still read them back. The subscription
 * service and the spreadsheet engine are mocked.
 */
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { setAiSecretCodec, type AiSettings } from '@genoffice/ai-provider'
import { IPC_CHANNELS } from '../src/shared/ipc-channels'

type Handler = (event: { sender: unknown }, ...args: unknown[]) => unknown
type MeteredWriter = (provider: 'claude-code' | 'codex', accepted: boolean) => unknown

const state = vi.hoisted(() => ({
  userData: '',
  handlers: new Map<string, Handler>(),
  lastContents: null as unknown,
  setMeteredAccepted: null as MeteredWriter | null,
}))

class FakeContents extends EventEmitter {
  id = 950
  isDestroyed = () => false
  setWindowOpenHandler = vi.fn()
  loadURL = vi.fn()
  send = vi.fn()
}

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? state.userData : tmpdir()),
    getName: () => 'sheets-test',
    getVersion: () => '0',
    getAppPath: () => tmpdir(),
    isPackaged: false,
    on: () => {},
    once: () => {},
    whenReady: () => new Promise(() => {}),
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => state.handlers.set(channel, fn),
    on: () => {},
    removeHandler: () => {},
  },
  BrowserWindow: class {},
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
  WebContentsView: class {
    webContents = (state.lastContents = new FakeContents())
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
vi.mock('../src/main/xlsx-sidecar-client', () => ({
  XlsxSidecarClient: class {
    start(): void {}
    onProcessExit(): void {}
  },
}))
vi.mock('@genoffice/ai-provider/subscription', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/ai-provider/subscription')>()),
  ensureSubscriptionIpc: (_ipc: unknown, setup: { setMeteredAccepted: MeteredWriter }) => {
    state.setMeteredAccepted = setup.setMeteredAccepted
    return {}
  },
  sharedSubscriptionStatuses: () => ({}),
}))

import { createSheetsView } from '../src/main/sheets-main'

const KEY = 'sk-test-plain-key-1234'
const codec = {
  seal: (plain: string) => `sealed:v1:${Buffer.from(plain).toString('base64')}`,
  open: (sealed: string) => Buffer.from(sealed.slice('sealed:v1:'.length), 'base64').toString(),
}
const settingsFile = () => join(state.userData, 'ai-settings.json')

beforeAll(() => {
  state.userData = mkdtempSync(join(tmpdir(), 'sheets-metered-seal-'))
  createSheetsView({ includeAiHandlers: true })
})
afterEach(() => setAiSecretCodec(null))
afterAll(() => rmSync(state.userData, { recursive: true, force: true }))

it.each([true, false])('keeps the keys sealed when "use anyway" is set to %s', async (accepted) => {
  setAiSecretCodec(codec)
  writeFileSync(
    settingsFile(),
    JSON.stringify({ provider: 'auto', providers: { openai: { apiKey: codec.seal(KEY) } } }),
  )

  await state.setMeteredAccepted!('claude-code', accepted)

  const onDisk = readFileSync(settingsFile(), 'utf8')
  expect(onDisk).not.toContain(KEY)
  const written = JSON.parse(onDisk) as AiSettings
  expect(written.providers.openai?.apiKey).toBe(codec.seal(KEY))
  expect(written.meteredAccepted?.['claude-code']).toBe(accepted)

  const read = (await state.handlers.get(IPC_CHANNELS.aiGetSettings)!({
    sender: state.lastContents,
  })) as AiSettings
  expect(read.providers.openai?.apiKey).toBe(KEY)
  expect(read.meteredAccepted?.['claude-code']).toBe(accepted)
})
