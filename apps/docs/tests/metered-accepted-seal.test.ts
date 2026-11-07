// @vitest-environment node
/**
 * The "use anyway" answer on a metered login is written to ai-settings.json by
 * the docs main without the user saving any settings. That write must leave
 * the key providers' keys sealed (decision 0063), and the app must still read
 * them back. The subscription service and the CLIs are mocked.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { setAiSecretCodec, type AiSettings } from '@genoffice/ai-provider'

type Handler = (event: unknown, ...args: unknown[]) => unknown
type MeteredWriter = (provider: 'claude-code' | 'codex', accepted: boolean) => unknown

const state = vi.hoisted(() => ({
  userData: '',
  handlers: new Map<string, Handler>(),
  setMeteredAccepted: null as MeteredWriter | null,
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? state.userData : tmpdir()),
    getName: () => 'docs-test',
    getVersion: () => '0',
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
  WebContentsView: class {},
  clipboard: {},
  dialog: {},
  nativeImage: {},
  net: {},
  session: {},
  shell: {},
  webContents: { getAllWebContents: () => [], fromId: () => null },
}))
vi.mock('@genoffice/ai-search', () => ({
  createCodexImageCliGenerator: () => async () => ({ bytes: new Uint8Array(), mime: 'image/png' }),
  registerCodexImageGenerator: () => {},
}))
vi.mock('@genoffice/ai-provider/subscription', () => ({
  ensureSubscriptionIpc: (_ipc: unknown, setup: { setMeteredAccepted: MeteredWriter }) => {
    state.setMeteredAccepted = setup.setMeteredAccepted
    return {}
  },
  sharedSubscriptionStatuses: () => ({}),
}))
vi.mock('@genoffice/ai-provider/codex-app-server', () => ({
  shutdownCodexAppServers: () => {},
}))
vi.mock('@genoffice/ai-provider/custom-models', () => ({}))
vi.mock('../src/main/lazy-media', () => ({ readLazyMedia: async () => null }))
vi.mock('../src/main/lazy-media-inline', () => ({}))

import { registerAiIpc } from '../src/main/docs-main'

const KEY = 'sk-test-plain-key-1234'
const codec = {
  seal: (plain: string) => `sealed:v1:${Buffer.from(plain).toString('base64')}`,
  open: (sealed: string) => Buffer.from(sealed.slice('sealed:v1:'.length), 'base64').toString(),
}
const settingsFile = () => join(state.userData, 'ai-settings.json')

beforeAll(() => {
  state.userData = mkdtempSync(join(tmpdir(), 'docs-metered-seal-'))
  registerAiIpc()
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

  const read = (await state.handlers.get('ai:get-settings')!({})) as AiSettings
  expect(read.providers.openai?.apiKey).toBe(KEY)
  expect(read.meteredAccepted?.['claude-code']).toBe(accepted)
})
