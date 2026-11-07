/**
 * The one IPC contract every editor shares for the subscription providers:
 * channel names and payloads importable from renderer code, and the main-side
 * helper that routes each channel.
 */
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import * as browser from '../src/browser'
import * as root from '../src/index'
import {
  SUBSCRIPTION_IPC_CHANNELS,
  checkingSubscriptionStatus,
  createSubscriptionIpcDeps,
  ensureSubscriptionIpc,
  notifySubscriptionLoginChange,
  registerSubscriptionIpc,
  resetSharedSubscriptionIpc,
  setSubscriptionModelSource,
  sharedSubscriptionStatuses,
  subscriptionNeedsUpdate,
  subscriptionStatusErrorKind,
  type SubscriptionIpcDeps,
  type SubscriptionIpcSetup,
  type SubscriptionLaunchResult,
  type SubscriptionMeteredResult,
  type SubscriptionOffResult,
  type SubscriptionStatusMap,
} from '../src/subscription'
import { setCodexImageGenerationAvailable } from '../src/image-backend'
import { defaultAiSettings } from '../src/providers'
import type { AiSubscriptionProviderId } from '../src/types'

type Handler = (event: unknown, ...args: unknown[]) => unknown

class FakeIpcMain {
  handlers = new Map<string, Handler>()
  handle(channel: string, handler: Handler): void {
    if (this.handlers.has(channel)) throw new Error(`second handler for ${channel}`)
    this.handlers.set(channel, handler)
  }
  removeHandler(channel: string): void {
    this.handlers.delete(channel)
  }
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`no handler for ${channel}`)
    return Promise.resolve(handler({ sender: {} }, ...args))
  }
}

const READY: SubscriptionStatusMap = {
  'claude-code': {
    provider: 'claude-code',
    state: 'ready',
    version: '2.1.287',
    loginMethod: 'subscription',
    planName: 'max',
    meteredAccepted: false,
  },
  codex: { provider: 'codex', state: 'signed-out', version: '0.159.2', meteredAccepted: false },
  chatgpt: { provider: 'chatgpt', state: 'signed-out', meteredAccepted: false },
}

/** what reached the launchers and the service, without the reads of the last known statuses */
function actions(log: string[]): string[] {
  return log.filter((entry) => entry !== 'getStatuses')
}

function setup(): {
  ipc: FakeIpcMain
  log: string[]
  broadcasts: Array<[string, unknown]>
  deps: SubscriptionIpcDeps
  emitChange: (statuses: SubscriptionStatusMap) => void
} {
  const log: string[] = []
  const broadcasts: Array<[string, unknown]> = []
  const listeners = new Set<(statuses: SubscriptionStatusMap) => void>()
  const deps: SubscriptionIpcDeps = {
    service: {
      getStatuses: () => {
        log.push('getStatuses')
        return READY
      },
      check: async (providers, options) => {
        log.push(
          `check:${providers ? providers.join(',') : 'all'}${options?.fresh ? ':fresh' : ''}`,
        )
        return READY
      },
      setMeteredAccepted: async (provider, accepted): Promise<SubscriptionMeteredResult> => {
        log.push(`metered:${provider}:${accepted}`)
        return { ok: true, statuses: READY }
      },
      clearMeteredAcceptance: async (provider) => {
        log.push(`clear:${provider}`)
      },
      setOff: async (provider, off): Promise<SubscriptionOffResult> => {
        log.push(`off:${provider}:${off}`)
        return { ok: true, statuses: READY }
      },
      onChange: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      setSigningIn: (provider, mode) => void log.push(`signingIn:${provider}:${mode ?? 'none'}`),
      setLoginUnfinished: (provider, unfinished) =>
        void log.push(`unfinished:${provider}:${unfinished}`),
    },
    launchLogin: async (provider, mode): Promise<SubscriptionLaunchResult> => {
      log.push(`login:${provider}${mode ? `:${mode}` : ''}`)
      return { ok: true }
    },
    launchLogout: async (provider): Promise<SubscriptionLaunchResult> => {
      log.push(`logout:${provider}`)
      return { ok: true }
    },
    launchInstall: async (provider): Promise<SubscriptionLaunchResult> => {
      log.push(`install:${provider}`)
      return { ok: true }
    },
    launchUpdate: async (provider): Promise<SubscriptionLaunchResult> => {
      log.push(`update:${provider}`)
      return { ok: true }
    },
    cancelLogin: async (provider): Promise<SubscriptionLaunchResult> => {
      log.push(`cancel:${provider}`)
      return { ok: true }
    },
    broadcast: (channel, payload) => broadcasts.push([channel, payload]),
  }
  return {
    ipc: new FakeIpcMain(),
    log,
    broadcasts,
    deps,
    emitChange: (statuses) => {
      for (const listener of listeners) listener(statuses)
    },
  }
}

describe('the channel names', () => {
  it('are one set of distinct names under ai:subscription', () => {
    expect(SUBSCRIPTION_IPC_CHANNELS).toEqual({
      statuses: 'ai:subscription-statuses',
      recheck: 'ai:subscription-recheck',
      login: 'ai:subscription-login',
      logout: 'ai:subscription-logout',
      install: 'ai:subscription-install',
      update: 'ai:subscription-update',
      cancelLogin: 'ai:subscription-cancel-login',
      metered: 'ai:subscription-metered',
      off: 'ai:subscription-off',
      codexImage: 'ai:subscription-codex-image',
      changed: 'ai:subscription-changed',
    })
    const names = Object.values(SUBSCRIPTION_IPC_CHANNELS)
    expect(new Set(names).size).toBe(names.length)
  })

  it('come from a file a renderer bundle can import: no Node, no Electron', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/subscription/contract.ts', import.meta.url)),
      'utf8',
    )
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
    expect(imports.length).toBeGreaterThan(0)
    for (const specifier of imports) {
      expect(specifier.startsWith('node:')).toBe(false)
      expect(specifier).not.toBe('electron')
      expect(specifier).toMatch(/^\.\.?\//)
    }
    expect(source).not.toMatch(/\bprocess\.|\brequire\(/)
  })

  it('are exported from the browser entry and the root entry alike', () => {
    for (const name of [
      'SUBSCRIPTION_IPC_CHANNELS',
      'SUBSCRIPTION_INSTALL_COMMANDS',
      'SUBSCRIPTION_INSTALL_URLS',
      'checkingSubscriptionStatus',
      'subscriptionStatusErrorKind',
    ] as const) {
      expect(browser[name]).toBeDefined()
      expect(browser[name]).toBe(root[name])
    }
    expect(browser.SUBSCRIPTION_IPC_CHANNELS).toBe(SUBSCRIPTION_IPC_CHANNELS)
  })

  it('the browser entry does not pull in the Node side of the module', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/browser.ts', import.meta.url)),
      'utf8',
    )
    const subscriptionImports = [...source.matchAll(/from\s+'(\.\/subscription[^']*)'/g)].map(
      (match) => match[1],
    )
    expect([...new Set(subscriptionImports)]).toEqual(['./subscription/contract'])
  })
})

describe('the contract helpers', () => {
  it('checkingSubscriptionStatus is the status before any answer', () => {
    expect(checkingSubscriptionStatus('codex')).toEqual({
      provider: 'codex',
      state: 'checking',
      meteredAccepted: false,
    })
  })

  it('subscriptionStatusErrorKind tells the UI which error text to show', () => {
    const error = (text?: string) => ({ state: 'error' as const, error: text })
    expect(subscriptionStatusErrorKind(error('needs-update: Claude Code 1.0.0 is too old'))).toBe(
      'needs-update',
    )
    expect(subscriptionStatusErrorKind(error('timeout: no answer within 20 s'))).toBe('timeout')
    expect(subscriptionStatusErrorKind(error('failed: spawn EACCES'))).toBe('failed')
    expect(subscriptionStatusErrorKind(error())).toBe('failed')
    expect(subscriptionStatusErrorKind({ state: 'ready' })).toBeNull()
  })

  it('subscriptionNeedsUpdate names the version found, the floor and the update command', () => {
    const outdated = (
      provider: 'claude-code' | 'codex',
      version?: string,
      error = 'needs-update: old',
    ) => ({
      provider,
      state: 'error' as const,
      error,
      ...(version ? { version } : {}),
    })
    expect(subscriptionNeedsUpdate(outdated('claude-code', '2.1.237'))).toEqual({
      version: '2.1.237',
      minimum: '2.1.248',
      command: 'claude update',
    })
    // no version reported, or one at the floor (an unknown subcommand): nothing to compare
    expect(subscriptionNeedsUpdate(outdated('claude-code'))).toBeNull()
    expect(subscriptionNeedsUpdate(outdated('claude-code', '2.1.248'))).toBeNull()
    // Codex has no floor
    expect(subscriptionNeedsUpdate(outdated('codex', '0.1.0'))).toBeNull()
    // another error, or another state
    expect(subscriptionNeedsUpdate(outdated('claude-code', '2.1.237', 'failed: spawn'))).toBeNull()
    expect(
      subscriptionNeedsUpdate({ provider: 'claude-code', state: 'ready', version: '2.1.237' }),
    ).toBeNull()
  })
})

describe('registerSubscriptionIpc', () => {
  it('registers a handler for each request channel and none for the event channel', () => {
    const { ipc, deps } = setup()
    registerSubscriptionIpc(ipc, deps)
    expect([...ipc.handlers.keys()].sort()).toEqual(
      [
        SUBSCRIPTION_IPC_CHANNELS.statuses,
        SUBSCRIPTION_IPC_CHANNELS.recheck,
        SUBSCRIPTION_IPC_CHANNELS.login,
        SUBSCRIPTION_IPC_CHANNELS.logout,
        SUBSCRIPTION_IPC_CHANNELS.install,
        SUBSCRIPTION_IPC_CHANNELS.update,
        SUBSCRIPTION_IPC_CHANNELS.cancelLogin,
        SUBSCRIPTION_IPC_CHANNELS.metered,
        SUBSCRIPTION_IPC_CHANNELS.off,
        SUBSCRIPTION_IPC_CHANNELS.codexImage,
      ].sort(),
    )
  })

  it('answers whether this process can generate images through the Codex subscription', async () => {
    const { ipc, deps } = setup()
    registerSubscriptionIpc(ipc, deps)
    setCodexImageGenerationAvailable(false)
    expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.codexImage)).toBe(false)
    setCodexImageGenerationAvailable(true)
    expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.codexImage)).toBe(true)
    setCodexImageGenerationAvailable(false)
  })

  it('routes get-statuses to the cached statuses', async () => {
    const { ipc, deps, log } = setup()
    registerSubscriptionIpc(ipc, deps)
    expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.statuses)).toEqual(READY)
    expect(log).toEqual(['getStatuses'])
  })

  it('a window that asks before anything was checked gets "checking" and starts the first check', async () => {
    const { ipc, deps, log } = setup()
    const unchecked: SubscriptionStatusMap = {
      'claude-code': checkingSubscriptionStatus('claude-code'),
      codex: READY.codex,
      chatgpt: READY.chatgpt,
    }
    deps.service.getStatuses = () => unchecked
    registerSubscriptionIpc(ipc, deps)
    expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.statuses)).toEqual(unchecked)
    expect(log).toEqual(['check:all'])
  })

  it('routes re-check to a fresh check, for all providers or the ones named', async () => {
    const { ipc, deps, log } = setup()
    registerSubscriptionIpc(ipc, deps)
    expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.recheck)).toEqual(READY)
    await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.recheck, { providers: ['codex'] })
    await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.recheck, { providers: ['codex', 'gpt', 7] })
    await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.recheck, { providers: 'codex' })
    expect(log).toEqual(['check:all', 'check:codex', 'check:codex', 'check:all'])
  })

  it('routes launch-login and launch-install to their launchers', async () => {
    const { ipc, deps, log } = setup()
    registerSubscriptionIpc(ipc, deps)
    expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.login, { provider: 'claude-code' })).toEqual({
      ok: true,
    })
    expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.install, { provider: 'codex' })).toEqual({
      ok: true,
    })
    // a window asked for is passed on; `browser` and anything else is the login as always
    await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.login, { provider: 'claude-code', mode: 'window' })
    await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.login, { provider: 'codex', mode: 'browser' })
    await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.login, { provider: 'codex', mode: 'terminal' })
    expect(actions(log)).toEqual([
      'login:claude-code',
      'install:codex',
      'login:claude-code:window',
      'login:codex',
      'login:codex',
    ])
  })

  it('routes update and cancel-login to theirs', async () => {
    const { ipc, deps, log } = setup()
    registerSubscriptionIpc(ipc, deps)
    expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.update, { provider: 'codex' })).toEqual({
      ok: true,
    })
    expect(
      await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.cancelLogin, { provider: 'claude-code' }),
    ).toEqual({ ok: true })
    expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.update, { provider: 'gpt' })).toEqual({
      ok: false,
      reason: 'invalid',
    })
    expect(actions(log)).toEqual(['update:codex', 'cancel:claude-code'])
  })

  it('routes logout to its launcher, then checks that provider again before it answers', async () => {
    const { ipc, deps, log } = setup()
    registerSubscriptionIpc(ipc, deps)
    expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.logout, { provider: 'codex' })).toEqual({
      ok: true,
    })
    // a check that started after the logout: one already under way may hold the old login
    expect(actions(log)).toEqual(['logout:codex', 'check:codex:fresh'])
  })

  it('checks again after a logout that failed too: the CLI may be signed out all the same', async () => {
    const { ipc, deps, log } = setup()
    deps.launchLogout = async (provider) => {
      log.push(`logout:${provider}`)
      return { ok: false, reason: 'failed' }
    }
    deps.service.check = async (providers, options) => {
      log.push(`check:${providers ? providers.join(',') : 'all'}${options?.fresh ? ':fresh' : ''}`)
      throw new Error('the check failed')
    }
    registerSubscriptionIpc(ipc, deps)
    expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.logout, { provider: 'claude-code' })).toEqual(
      { ok: false, reason: 'failed' },
    )
    expect(actions(log)).toEqual(['logout:claude-code', 'check:claude-code:fresh'])
  })

  it('routes set-metered-acceptance to the service', async () => {
    const { ipc, deps, log } = setup()
    registerSubscriptionIpc(ipc, deps)
    const result = await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.metered, {
      provider: 'codex',
      accepted: true,
    })
    expect(result).toEqual({ ok: true, statuses: READY })
    expect(actions(log)).toEqual(['metered:codex:true'])
  })

  it('rejects payloads a renderer should not be able to send', async () => {
    const { ipc, deps, log } = setup()
    registerSubscriptionIpc(ipc, deps)
    const bad: unknown[] = [
      undefined,
      null,
      'codex',
      {},
      { provider: 'anthropic' },
      { provider: 'codex; calc.exe' },
      { provider: ['codex'] },
    ]
    for (const payload of bad) {
      expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.login, payload)).toMatchObject({
        ok: false,
        reason: 'invalid',
      })
      expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.install, payload)).toMatchObject({
        ok: false,
        reason: 'invalid',
      })
      expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.logout, payload)).toMatchObject({
        ok: false,
        reason: 'invalid',
      })
      expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.metered, payload)).toMatchObject({
        ok: false,
      })
    }
    // acceptance needs a real boolean: a truthy string is not consent
    expect(
      await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.metered, { provider: 'codex', accepted: 'true' }),
    ).toMatchObject({ ok: false, statuses: READY })
    expect(log.filter((entry) => !entry.startsWith('getStatuses'))).toEqual([])
  })

  it('a launcher that throws becomes a failed result, not a rejected call', async () => {
    const { ipc, deps } = setup()
    deps.launchLogin = async () => {
      throw new Error('boom')
    }
    registerSubscriptionIpc(ipc, deps)
    expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.login, { provider: 'codex' })).toMatchObject({
      ok: false,
      reason: 'failed',
    })
    deps.launchLogout = async () => {
      throw new Error('boom')
    }
    expect(await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.logout, { provider: 'codex' })).toMatchObject(
      { ok: false, reason: 'failed' },
    )
  })

  it('a login or logout the app ran withdraws the metered acceptance of that provider', () => {
    const { ipc, deps, log } = setup()
    const unregister = registerSubscriptionIpc(ipc, deps)
    // what the launchers do when a login window closed or a logout command ended
    notifySubscriptionLoginChange('codex')
    expect(log).toEqual(['clear:codex'])
    unregister()
    notifySubscriptionLoginChange('codex')
    expect(log).toEqual(['clear:codex'])
  })

  it('announces status changes on the event channel', () => {
    const { ipc, deps, broadcasts, emitChange } = setup()
    registerSubscriptionIpc(ipc, deps)
    emitChange(READY)
    expect(broadcasts).toEqual([[SUBSCRIPTION_IPC_CHANNELS.changed, READY]])
  })

  it('unregisters everything it registered', () => {
    const { ipc, deps, broadcasts, emitChange } = setup()
    const unregister = registerSubscriptionIpc(ipc, deps)
    unregister()
    expect(ipc.handlers.size).toBe(0)
    emitChange(READY)
    expect(broadcasts).toEqual([])
  })

  it('the provider ids in the payload types are the subscription ids', () => {
    const providers: AiSubscriptionProviderId[] = ['claude-code', 'chatgpt', 'codex']
    expect(Object.keys(READY).sort()).toEqual(providers.sort())
  })
})

describe('ensureSubscriptionIpc', () => {
  const SETUP = {
    getSettings: () => ({ providers: {} as never }),
    setMeteredAccepted: () => undefined,
    dataDir: 'unused',
  }

  it('registers once per process: a second caller gets the first registration back', async () => {
    resetSharedSubscriptionIpc()
    const { ipc, deps, log } = setup()
    let created = 0
    const create = (): SubscriptionIpcDeps => {
      created++
      return deps
    }
    expect(sharedSubscriptionStatuses()).toEqual({})
    const first = ensureSubscriptionIpc(ipc, SETUP, create)
    // a second module in the same process: must not register the channels again (that throws)
    const second = ensureSubscriptionIpc(ipc, SETUP, create)
    expect(second).toBe(first)
    expect(created).toBe(1)
    expect(ipc.handlers.has(SUBSCRIPTION_IPC_CHANNELS.statuses)).toBe(true)
    // registering checks nothing: a process that never shows AI must not start the vendor programs
    await Promise.resolve()
    expect(log.filter((entry) => entry.startsWith('check'))).toHaveLength(0)
    expect(sharedSubscriptionStatuses()).toEqual(READY)
    resetSharedSubscriptionIpc()
    expect(ipc.handlers.size).toBe(0)
    expect(sharedSubscriptionStatuses()).toEqual({})
  })
})

describe('createSubscriptionIpcDeps', () => {
  const MODELS = [{ id: 'opus', label: 'Opus 5.5', resolved: 'claude-opus-5-5' }]
  const setupFor = (extra: Partial<SubscriptionIpcSetup> = {}): SubscriptionIpcSetup => ({
    getSettings: () => ({
      providers: {
        ...defaultAiSettings().providers,
        codex: { apiKey: '', model: '', cliPath: 'D:\\tools\\codex.exe' },
      },
    }),
    setMeteredAccepted: () => undefined,
    dataDir: tmpdir(),
    detect: async (provider) =>
      provider === 'claude-code'
        ? { provider, state: 'ready', loginMethod: 'subscription', account: 'someone@example.com' }
        : { provider, state: 'not-installed' },
    ...extra,
  })
  const settle = () => new Promise((resolve) => setImmediate(resolve))

  afterEach(() => setSubscriptionModelSource('claude-code', null))

  it('the status service reads the model list through the sources the bridges registered', async () => {
    setSubscriptionModelSource('claude-code', async () => MODELS)
    const broadcasts: SubscriptionStatusMap[] = []
    const deps = createSubscriptionIpcDeps(
      setupFor({ broadcast: (_channel, statuses) => broadcasts.push(statuses) }),
    )
    const ipc = new FakeIpcMain()
    const unregister = registerSubscriptionIpc(ipc, deps)
    try {
      const checked = (await ipc.invoke(SUBSCRIPTION_IPC_CHANNELS.recheck)) as SubscriptionStatusMap
      expect(checked['claude-code']).toMatchObject({
        state: 'ready',
        account: 'someone@example.com',
      })
      await settle()
      // the list follows on the change channel every window already listens to
      expect(broadcasts.at(-1)!['claude-code'].models).toEqual(MODELS)
      expect(broadcasts.at(-1)!.codex).toEqual({
        provider: 'codex',
        state: 'not-installed',
        meteredAccepted: false,
      })
    } finally {
      unregister()
    }
  })

  it('takes a stand-in lister, and none is asked for a provider that cannot run', async () => {
    const asked: string[] = []
    const deps = createSubscriptionIpcDeps(
      setupFor({
        listModels: async (provider) => {
          asked.push(provider)
          return MODELS
        },
      }),
    )
    await deps.service.check()
    await settle()
    expect(asked).toEqual(['claude-code'])
    expect(deps.service.getStatuses()['claude-code'].models).toEqual(MODELS)
  })
})
