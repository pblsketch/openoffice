import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SUBSCRIPTION_IPC_CHANNELS } from '@genoffice/ai-provider/browser'
import type { HtmlApi } from '../src/shared/ipc'
import { AI_CHANNELS } from '../src/shared/ipc'
import {
  SUBSCRIPTION_CONNECT_HELP_CHANNEL,
  SUBSCRIPTION_INSTALL_HELP_CHANNEL,
  checkingSubscriptionStatuses,
  isSubscriptionProviderId,
  subscriptionLaunchResultOf,
  subscriptionMeteredResultOf,
  subscriptionStatusMapOf,
} from '../src/shared/subscription-api'

const electron = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => electron.exposed.set(name, api),
  },
  ipcRenderer: {
    invoke: electron.invoke,
    send: vi.fn(),
    on: electron.on,
    removeListener: electron.removeListener,
  },
  webUtils: { getPathForFile: () => '' },
}))
vi.mock('@genoffice/electron-utils/drop-open', () => ({ installDropOpenBridge: () => undefined }))

describe('subscription answers as the renderer reads them', () => {
  it('fills in a provider that is missing or malformed as still checking', () => {
    expect(subscriptionStatusMapOf(undefined)).toEqual(checkingSubscriptionStatuses())
    expect(subscriptionStatusMapOf('nope')).toEqual(checkingSubscriptionStatuses())
    const map = subscriptionStatusMapOf({
      'claude-code': { provider: 'claude-code', state: 'ready', planName: 'max' },
      codex: { provider: 'codex', state: 'not-a-state' },
    })
    expect(map['claude-code']).toEqual({
      provider: 'claude-code',
      state: 'ready',
      planName: 'max',
      meteredAccepted: false,
    })
    expect(map.codex).toEqual(checkingSubscriptionStatuses().codex)
  })

  it('never trusts the provider or the acceptance flag of a malformed entry', () => {
    const map = subscriptionStatusMapOf({
      codex: { provider: 'claude-code', state: 'metered', meteredAccepted: 'yes' },
    })
    expect(map.codex).toMatchObject({ provider: 'codex', state: 'metered', meteredAccepted: false })
  })

  it('leaves the spawn error text behind (it can carry an executable path)', () => {
    expect(subscriptionLaunchResultOf({ ok: true, error: 'ignored' })).toEqual({ ok: true })
    expect(
      subscriptionLaunchResultOf({
        ok: false,
        reason: 'unsupported',
        error: 'spawn C:\\Users\\someone\\codex.exe ENOENT',
        installUrl: 'https://example.com/install',
      }),
    ).toEqual({ ok: false, reason: 'unsupported', installUrl: 'https://example.com/install' })
    expect(subscriptionLaunchResultOf(null)).toEqual({ ok: false, reason: 'failed' })
    expect(subscriptionLaunchResultOf({ ok: false, reason: 'made-up' })).toEqual({
      ok: false,
      reason: 'failed',
    })
  })

  it('always answers "use anyway" with a full status map', () => {
    expect(subscriptionMeteredResultOf(undefined)).toEqual({
      ok: false,
      statuses: checkingSubscriptionStatuses(),
    })
    const accepted = subscriptionMeteredResultOf({
      ok: true,
      statuses: { codex: { provider: 'codex', state: 'metered', meteredAccepted: true } },
    })
    expect(accepted.ok).toBe(true)
    expect(accepted.statuses.codex.meteredAccepted).toBe(true)
    expect(accepted.statuses['claude-code'].state).toBe('checking')
  })

  it('recognises only the two subscription providers', () => {
    expect(isSubscriptionProviderId('claude-code')).toBe(true)
    expect(isSubscriptionProviderId('codex')).toBe(true)
    expect(isSubscriptionProviderId('openai')).toBe(false)
    expect(isSubscriptionProviderId(undefined)).toBe(false)
  })
})

describe('html preload', () => {
  let api: HtmlApi

  beforeEach(async () => {
    electron.exposed.clear()
    electron.invoke.mockReset()
    electron.on.mockReset()
    electron.removeListener.mockReset()
    vi.resetModules()
    await import('../src/preload/index')
    api = electron.exposed.get('htmlApi') as HtmlApi
  })
  afterEach(() => vi.restoreAllMocks())

  it('exposes the subscription contract and no vendor account API', () => {
    expect(Object.keys(api.subscription).sort()).toEqual(
      [
        'install',
        'update',
        'cancelLogin',
        'login',
        'onChanged',
        'openConnectHelp',
        'openInstallHelp',
        'recheck',
        'setMeteredAccepted',
        'statuses',
      ].sort(),
    )
    // the account status call that used to sit next to the settings calls is gone, with its channel
    expect(Object.keys(api).filter((key) => /status|account|login|credit/i.test(key))).toEqual([])
    expect(Object.values(AI_CHANNELS).sort()).toEqual(
      [
        'ai:get-settings',
        'ai:set-settings',
        'ai:settings-changed',
        'ai:open-model-settings',
        'ai:stream',
        'ai:stream-chunk',
        'ai:stream-cancel',
        'ai:web-search',
        'ai:read-url',
        'ai:image-search',
      ].sort(),
    )
  })

  it('reads the statuses over the shared channel and normalises the answer', async () => {
    electron.invoke.mockResolvedValue({ 'claude-code': { state: 'ready' } })
    const statuses = await api.subscription.statuses()
    expect(electron.invoke).toHaveBeenCalledWith(SUBSCRIPTION_IPC_CHANNELS.statuses)
    expect(statuses['claude-code']).toMatchObject({ provider: 'claude-code', state: 'ready' })
    expect(statuses.codex.state).toBe('checking')
  })

  it('sends each action with the payload the shared handlers expect', async () => {
    electron.invoke.mockResolvedValue({ ok: true, statuses: {} })
    await api.subscription.recheck()
    await api.subscription.recheck(['codex'])
    await api.subscription.login('claude-code')
    await api.subscription.install('codex')
    await api.subscription.setMeteredAccepted('codex', true)
    await api.subscription.openInstallHelp('claude-code')
    await api.subscription.openConnectHelp('free')
    expect(electron.invoke.mock.calls).toEqual([
      [SUBSCRIPTION_IPC_CHANNELS.recheck, undefined],
      [SUBSCRIPTION_IPC_CHANNELS.recheck, { providers: ['codex'] }],
      [SUBSCRIPTION_IPC_CHANNELS.login, { provider: 'claude-code' }],
      [SUBSCRIPTION_IPC_CHANNELS.install, { provider: 'codex' }],
      [SUBSCRIPTION_IPC_CHANNELS.metered, { provider: 'codex', accepted: true }],
      [SUBSCRIPTION_INSTALL_HELP_CHANNEL, 'claude-code'],
      [SUBSCRIPTION_CONNECT_HELP_CHANNEL, 'free'],
    ])
  })

  it('rejects when no handler is registered, which the panel reads as "still checking"', async () => {
    electron.invoke.mockRejectedValue(
      new Error("No handler registered for 'ai:subscription-statuses'"),
    )
    await expect(api.subscription.statuses()).rejects.toThrow('No handler registered')
  })

  it('follows status changes pushed by the main process', () => {
    const seen: unknown[] = []
    const off = api.subscription.onChanged((statuses) => seen.push(statuses))
    const [channel, listener] = electron.on.mock.calls[0] as [
      string,
      (event: unknown, payload: unknown) => void,
    ]
    expect(channel).toBe(SUBSCRIPTION_IPC_CHANNELS.changed)
    listener({}, { codex: { state: 'signed-out' } })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({
      codex: { provider: 'codex', state: 'signed-out' },
      'claude-code': { state: 'checking' },
    })
    off()
    expect(electron.removeListener).toHaveBeenCalledWith(
      SUBSCRIPTION_IPC_CHANNELS.changed,
      listener,
    )
  })
})

describe('html main image tool', () => {
  // the main module imports electron and cannot be loaded in this jsdom suite: the call is pinned by its source
  const source = (relative: string) =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
  const main = source('../src/main/html-main.ts')
  const call = main.slice(main.indexOf('HTML_CHANNELS.aiGenerateImage,'))
  const body = call.slice(0, call.indexOf('const MIME_BY_EXT'))

  it('calls the image tool on the screen path with the shared subscription statuses', () => {
    expect(body).toContain('generateImageTool(')
    expect(body).toContain("context: { path: 'screen', statuses: sharedSubscriptionStatuses() }")
  })

  it('carries no login gate of its own: the tool decides from the context', () => {
    expect(body).not.toMatch(/notLoggedInError|cloudToolsEnabled|LoggedIn/)
  })
})
