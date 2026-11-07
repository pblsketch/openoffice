import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SUBSCRIPTION_IPC_CHANNELS } from '@genoffice/ai-provider/browser'
import type { SubscriptionApi } from '../src/shared/subscription-api'
import {
  SHELL_SUBSCRIPTION_CHANNELS,
  checkingSubscriptionStatuses,
} from '../src/shared/subscription-api'

const electronMocks = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => electronMocks.exposed.set(name, api),
  },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    send: electronMocks.send,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener,
  },
  // the preload imports @genoffice/electron-utils (drop-open bridge), which
  // binds webUtils at module scope even though node env never installs it
  webUtils: { getPathForFile: () => '' },
}))

import '../src/preload/index'

const api = electronMocks.exposed.get('aiOfficeSubscription') as SubscriptionApi

const READY = {
  'claude-code': { provider: 'claude-code', state: 'ready', meteredAccepted: false },
  chatgpt: { provider: 'chatgpt', state: 'signed-out', meteredAccepted: false },
  codex: { provider: 'codex', state: 'signed-out', meteredAccepted: false },
}

beforeEach(() => {
  electronMocks.invoke.mockReset()
  electronMocks.on.mockReset()
  electronMocks.removeListener.mockReset()
})

describe('subscription preload API', () => {
  it('is exposed next to the home API', () => {
    expect(electronMocks.exposed.has('aiOffice')).toBe(true)
    expect(api).toBeTruthy()
  })

  it('asks for the statuses on the shared channel and fills in what is missing', async () => {
    electronMocks.invoke.mockResolvedValue({ 'claude-code': READY['claude-code'] })
    await expect(api.statuses()).resolves.toEqual({
      'claude-code': READY['claude-code'],
      // an answer without it comes from an app that has no ChatGPT connection
      chatgpt: READY.chatgpt,
      codex: checkingSubscriptionStatuses().codex,
    })
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(SUBSCRIPTION_IPC_CHANNELS.statuses)
  })

  it('re-checks both providers, or only the named ones', async () => {
    electronMocks.invoke.mockResolvedValue(READY)
    await expect(api.recheck()).resolves.toEqual(READY)
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      SUBSCRIPTION_IPC_CHANNELS.recheck,
      undefined,
    )
    await api.recheck(['codex'])
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(SUBSCRIPTION_IPC_CHANNELS.recheck, {
      providers: ['codex'],
    })
  })

  it('starts a sign-in or an install for one provider and keeps the error text out', async () => {
    electronMocks.invoke.mockResolvedValue({ ok: true })
    await expect(api.login('claude-code')).resolves.toEqual({ ok: true })
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(SUBSCRIPTION_IPC_CHANNELS.login, {
      provider: 'claude-code',
    })

    electronMocks.invoke.mockResolvedValue({
      ok: false,
      reason: 'failed',
      error: 'spawn C:\\Users\\someone\\AppData\\codex.exe ENOENT',
    })
    await expect(api.install('codex')).resolves.toEqual({ ok: false, reason: 'failed' })
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(SUBSCRIPTION_IPC_CHANNELS.install, {
      provider: 'codex',
    })
  })

  it('asks for a sign-out on the shared channel and keeps the error text out', async () => {
    electronMocks.invoke.mockResolvedValue({ ok: true })
    await expect(api.logout('codex')).resolves.toEqual({ ok: true })
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(SUBSCRIPTION_IPC_CHANNELS.logout, {
      provider: 'codex',
    })
    expect(SUBSCRIPTION_IPC_CHANNELS.logout).toBe('ai:subscription-logout')

    electronMocks.invoke.mockResolvedValue({
      ok: false,
      reason: 'failed',
      error: 'spawn C:\\Users\\someone\\AppData\\claude.exe EPERM',
    })
    await expect(api.logout('claude-code')).resolves.toEqual({ ok: false, reason: 'failed' })
    // an answer of no known shape is a plain failure, never a success
    electronMocks.invoke.mockResolvedValue(undefined)
    await expect(api.logout('claude-code')).resolves.toEqual({ ok: false, reason: 'failed' })
  })

  it('passes the account and the model list of a status on only in their own shape', async () => {
    const models = [{ id: 'opus', label: 'Opus 5.5', resolved: 'claude-opus-5-5' }]
    electronMocks.invoke.mockResolvedValue({
      'claude-code': {
        ...READY['claude-code'],
        account: 'user@example.com',
        models: [...models, { id: '--flag', label: 'x' }],
      },
      codex: { ...READY.codex, account: 'user@example.com', models },
    })
    const statuses = await api.statuses()
    expect(statuses['claude-code']).toEqual({
      ...READY['claude-code'],
      account: 'user@example.com',
      models,
    })
    // signed out: neither belongs to it
    expect(statuses.codex).toEqual(READY.codex)

    electronMocks.invoke.mockResolvedValue({
      'claude-code': { ...READY['claude-code'], account: 'Example Research Org', models: 'opus' },
    })
    expect((await api.statuses())['claude-code']).toEqual(READY['claude-code'])
  })

  it('is the only preload that can ask for a sign-out: no editor window exposes it', () => {
    const preloadOf = (app: string): string =>
      readFileSync(
        fileURLToPath(new URL(`../../${app}/src/preload/index.ts`, import.meta.url)),
        'utf8',
      )
    const asksForLogout = /SUBSCRIPTION_IPC_CHANNELS\.logout|subscription-logout/
    expect(preloadOf('shell')).toMatch(asksForLogout)
    for (const app of ['docs', 'sheets', 'slides', 'pdf', 'markdown', 'html']) {
      expect(preloadOf(app), app).not.toMatch(asksForLogout)
    }
  })

  it('turns a CLI off or back on, and reads the answer as done only on a literal true', async () => {
    electronMocks.invoke.mockResolvedValue({ ok: true, statuses: READY })
    await expect(api.setSubscriptionOff('claude-code', true)).resolves.toEqual({
      ok: true,
      statuses: READY,
    })
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(SUBSCRIPTION_IPC_CHANNELS.off, {
      provider: 'claude-code',
      off: true,
    })
    expect(SUBSCRIPTION_IPC_CHANNELS.off).toBe('ai:subscription-off')
    electronMocks.invoke.mockResolvedValue({ ok: 'yes' })
    await expect(api.setSubscriptionOff('codex', false)).resolves.toMatchObject({ ok: false })
  })

  it('is the only preload that can turn a CLI off in this app (decision 0114)', () => {
    const preloadOf = (app: string): string =>
      readFileSync(
        fileURLToPath(new URL(`../../${app}/src/preload/index.ts`, import.meta.url)),
        'utf8',
      )
    const turnsOff = /SUBSCRIPTION_IPC_CHANNELS\.off\b|subscription-off/
    expect(preloadOf('shell')).toMatch(turnsOff)
    for (const app of [
      'docs',
      'sheets',
      'slides',
      'pdf',
      'markdown',
      'html',
      'hwp',
      'epub',
      'mindmap',
      'diagram',
    ]) {
      expect(preloadOf(app), app).not.toMatch(turnsOff)
    }
  })

  it('sends the metered choice and returns the statuses that come back', async () => {
    electronMocks.invoke.mockResolvedValue({ ok: true, statuses: READY })
    await expect(api.setMeteredAccepted('codex', true)).resolves.toEqual({
      ok: true,
      statuses: READY,
    })
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(SUBSCRIPTION_IPC_CHANNELS.metered, {
      provider: 'codex',
      accepted: true,
    })
  })

  it('reads Codex image generation as available only on a literal true', async () => {
    electronMocks.invoke.mockResolvedValue(true)
    await expect(api.codexImageAvailable()).resolves.toBe(true)
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(SUBSCRIPTION_IPC_CHANNELS.codexImage)
    electronMocks.invoke.mockResolvedValue('yes')
    await expect(api.codexImageAvailable()).resolves.toBe(false)
    electronMocks.invoke.mockResolvedValue(undefined)
    await expect(api.codexImageAvailable()).resolves.toBe(false)
  })

  it('subscribes to the change event and unsubscribes the same listener', () => {
    const handler = vi.fn()
    const off = api.onChanged(handler)
    expect(electronMocks.on).toHaveBeenCalledTimes(1)
    const [channel, listener] = electronMocks.on.mock.calls[0] as [
      string,
      (event: unknown, statuses: unknown) => void,
    ]
    expect(channel).toBe(SUBSCRIPTION_IPC_CHANNELS.changed)
    listener({}, READY)
    expect(handler).toHaveBeenCalledWith(READY)
    off()
    expect(electronMocks.removeListener).toHaveBeenCalledWith(
      SUBSCRIPTION_IPC_CHANNELS.changed,
      listener,
    )
  })

  it('asks the shell to open the install guide by provider, never by URL', async () => {
    electronMocks.invoke.mockResolvedValue(undefined)
    await api.openInstallHelp('claude-code')
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(
      SHELL_SUBSCRIPTION_CHANNELS.openInstallHelp,
      'claude-code',
    )
  })

  it('lets a missing handler surface as a rejection the renderer can read', async () => {
    electronMocks.invoke.mockRejectedValue(
      new Error("No handler registered for 'ai:subscription-statuses'"),
    )
    await expect(api.statuses()).rejects.toThrow('No handler registered')
  })
})
