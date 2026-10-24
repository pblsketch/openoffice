/**
 * The update button of a card whose CLI is too old, and the way to end a login
 * the app started. The update runs the vendor's own command in a window the
 * user can see; the shell is only ever given a constant line.
 */
import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAiSettings } from '../src/providers'
import {
  SUBSCRIPTION_CODEX_UPDATE_COMMANDS,
  SUBSCRIPTION_INSTALL_URLS,
  SUBSCRIPTION_IPC_CHANNELS,
  SUBSCRIPTION_UPDATE_ARGS_ENV,
  SUBSCRIPTION_UPDATE_EXE_ENV,
  createSubscriptionIpcDeps,
  launchSubscriptionUpdate,
  subscriptionUpdateCommandLine,
  subscriptionUpdatePlan,
  type SubscriptionProgram,
  type SubscriptionProgramSource,
} from '../src/subscription'
import type { AiSubscriptionProviderId } from '../src/types'

class FakeChild extends EventEmitter {
  unrefs = 0
  constructor(readonly pid: number | undefined) {
    super()
  }
  kill(): boolean {
    return true
  }
  unref(): void {
    this.unrefs++
  }
}

interface SpawnCall {
  command: string
  args: string[]
  options: Record<string, unknown>
}

function recorder(): {
  calls: SpawnCall[]
  spawn: (command: string, args: string[], options: object) => FakeChild
} {
  const calls: SpawnCall[] = []
  return {
    calls,
    spawn: (command, args, options) => {
      calls.push({ command, args, options: options as Record<string, unknown> })
      return new FakeChild(4321)
    },
  }
}

const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
const WINDOWS = { SystemRoot: 'C:\\Windows' }

function program(
  provider: AiSubscriptionProviderId,
  entry: string,
  source: SubscriptionProgramSource = 'path',
  extra: Partial<SubscriptionProgram> = {},
): SubscriptionProgram {
  return { provider, command: entry, prefixArgs: [], env: {}, entry, source, ...extra }
}

const NPM_CODEX =
  'C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe'
const WINGET_CODEX =
  'C:\\Users\\u\\AppData\\Local\\Microsoft\\WinGet\\Packages\\OpenAI.Codex_Microsoft.Winget.Source_8wekyb3d8bbwe\\codex.exe'

describe('subscriptionUpdatePlan', () => {
  it('Claude updates itself, whatever installed it', () => {
    for (const source of ['npm', 'native-installer', 'path', 'configured'] as const) {
      expect(subscriptionUpdatePlan(program('claude-code', 'C:\\x\\claude.exe', source))).toEqual({
        kind: 'program',
        args: ['update'],
      })
    }
  })

  it('Codex from npm is updated by npm, Codex from winget by winget', () => {
    expect(subscriptionUpdatePlan(program('codex', NPM_CODEX))).toEqual({
      kind: 'command',
      command: 'npm install -g @openai/codex@latest',
    })
    // the JS launcher on a Node runtime: the entry tells where it came from
    expect(
      subscriptionUpdatePlan(
        program('codex', 'C:\\Program Files\\nodejs\\node.exe', 'npm', {
          entry: 'D:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js',
        }),
      ),
    ).toEqual({ kind: 'command', command: SUBSCRIPTION_CODEX_UPDATE_COMMANDS.npm })
    expect(subscriptionUpdatePlan(program('codex', WINGET_CODEX))).toEqual({
      kind: 'command',
      command: 'winget upgrade --id OpenAI.Codex -e',
    })
    // a Links entry alone does not name the package; the locator resolves it first
    expect(
      subscriptionUpdatePlan(
        program(
          'codex',
          'C:\\Users\\u\\AppData\\Local\\Microsoft\\WinGet\\Links\\codex.exe',
          'winget',
        ),
      ),
    ).toBeNull()
    // another package's codex.exe under WinGet is not OpenAI.Codex
    expect(
      subscriptionUpdatePlan(
        program(
          'codex',
          'C:\\Users\\u\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Other.Codex_x\\codex.exe',
          'winget',
        ),
      ),
    ).toBeNull()
  })

  it('a Codex the app cannot tell the origin of gets no command', () => {
    expect(
      subscriptionUpdatePlan(program('codex', 'D:\\tools\\codex.exe', 'configured')),
    ).toBeNull()
    expect(
      subscriptionUpdatePlan(
        program('codex', 'C:\\Users\\u\\AppData\\Local\\OpenAI\\Codex\\bin\\codex.exe', 'managed'),
      ),
    ).toBeNull()
  })
})

describe('subscriptionUpdateCommandLine', () => {
  it('a package manager command runs as is, in a window that stays open', () => {
    expect(
      subscriptionUpdateCommandLine(
        { kind: 'command', command: 'winget upgrade --id OpenAI.Codex -e' },
        WINDOWS,
      ),
    ).toBe(
      `start "" "${POWERSHELL}" -NoLogo -NoExit -Command "winget upgrade --id OpenAI.Codex -e"`,
    )
  })

  it('the program update is a constant script: the path and arguments are not in it', () => {
    const line = subscriptionUpdateCommandLine({ kind: 'program', args: ['update'] }, WINDOWS)
    expect(line).toBe(
      subscriptionUpdateCommandLine({ kind: 'program', args: ['something', 'else'] }, WINDOWS),
    )
    expect(line).not.toContain('update"')
    expect(line).toContain(`$env:${SUBSCRIPTION_UPDATE_EXE_ENV}`)
    expect(line).toContain(`Remove-Item Env:${SUBSCRIPTION_UPDATE_EXE_ENV}`)
    // one pair of quotes around the script: nothing inside ends it early
    const script = line.slice(line.indexOf('-Command "') + '-Command "'.length, -1)
    expect(script).not.toContain('"')
  })
})

describe('launchSubscriptionUpdate', () => {
  it('runs Claude by the file the app found, its path handed over as a value', async () => {
    const { calls, spawn } = recorder()
    const found = program(
      'claude-code',
      'C:\\Users\\u\\.local\\bin\\claude.exe',
      'native-installer',
    )
    const result = await launchSubscriptionUpdate('claude-code', {
      spawn,
      platform: 'win32',
      env: { ...WINDOWS, ANTHROPIC_API_KEY: 'sk-ant-x' },
      locate: async () => found,
    })
    expect(result).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.command).toBe(
      subscriptionUpdateCommandLine({ kind: 'program', args: ['update'] }, WINDOWS),
    )
    expect(call.options.shell).toBe('C:\\Windows\\System32\\cmd.exe')
    expect(call.options.cwd).toBe('C:\\Windows\\System32')
    const env = call.options.env as NodeJS.ProcessEnv
    expect(env[SUBSCRIPTION_UPDATE_EXE_ENV]).toBe(found.command)
    expect(env[SUBSCRIPTION_UPDATE_ARGS_ENV]).toBe('update')
    // the sanitised environment of every CLI launch
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it('a JS entry on a Node runtime goes after the runtime, before the update argument', async () => {
    const { calls, spawn } = recorder()
    const found = program('claude-code', 'C:\\app\\IeumOffice.exe', 'npm', {
      prefixArgs: ['D:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    })
    await launchSubscriptionUpdate('claude-code', {
      spawn,
      platform: 'win32',
      env: WINDOWS,
      locate: async () => found,
    })
    const env = calls[0]!.options.env as NodeJS.ProcessEnv
    expect(env[SUBSCRIPTION_UPDATE_ARGS_ENV]).toBe(
      'D:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js\nupdate',
    )
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
  })

  it('runs the package manager of the Codex it found', async () => {
    const { calls, spawn } = recorder()
    await launchSubscriptionUpdate('codex', {
      spawn,
      platform: 'win32',
      env: WINDOWS,
      locate: async () => program('codex', NPM_CODEX, 'npm'),
    })
    expect(calls[0]!.command).toBe(
      `start "" "${POWERSHELL}" -NoLogo -NoExit -Command "npm install -g @openai/codex@latest"`,
    )
  })

  it('without a way to update, runs nothing and names the install page', async () => {
    const { calls, spawn } = recorder()
    expect(
      await launchSubscriptionUpdate('codex', {
        spawn,
        platform: 'win32',
        env: WINDOWS,
        locate: async () => program('codex', 'D:\\tools\\codex.exe', 'configured'),
      }),
    ).toEqual({ ok: false, reason: 'unsupported', installUrl: SUBSCRIPTION_INSTALL_URLS.codex })
    expect(
      await launchSubscriptionUpdate('codex', {
        spawn,
        platform: 'win32',
        env: WINDOWS,
        locate: async () => null,
      }),
    ).toEqual({ ok: false, reason: 'not-installed', installUrl: SUBSCRIPTION_INSTALL_URLS.codex })
    expect(
      await launchSubscriptionUpdate('claude-code', {
        spawn,
        platform: 'darwin',
        locate: async () => program('claude-code', '/usr/local/bin/claude'),
      }),
    ).toEqual({
      ok: false,
      reason: 'unsupported',
      installUrl: SUBSCRIPTION_INSTALL_URLS['claude-code'],
    })
    expect(
      await launchSubscriptionUpdate('gpt' as AiSubscriptionProviderId, {
        spawn,
        platform: 'win32',
      }),
    ).toEqual({ ok: false, reason: 'invalid' })
    expect(calls).toEqual([])
  })

  it('a window that could not start is a failure, with the install page', async () => {
    const spawn = () => {
      const child = new FakeChild(undefined)
      setImmediate(() => child.emit('error', new Error('spawn cmd.exe ENOENT')))
      return child
    }
    expect(
      await launchSubscriptionUpdate('codex', {
        spawn: spawn as never,
        platform: 'win32',
        env: WINDOWS,
        locate: async () => program('codex', WINGET_CODEX, 'winget'),
      }),
    ).toEqual({
      ok: false,
      reason: 'failed',
      error: 'spawn cmd.exe ENOENT',
      installUrl: SUBSCRIPTION_INSTALL_URLS.codex,
    })
  })
})

describe('ending a login the app started', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cancel-login-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function app() {
    const children: FakeChild[] = []
    const ended: FakeChild[] = []
    let checks = 0
    const deps = createSubscriptionIpcDeps({
      getSettings: () => defaultAiSettings(),
      setMeteredAccepted: () => undefined,
      dataDir: dir,
      detect: async (provider) => {
        checks++
        return { provider, state: 'signed-out' }
      },
      listModels: async () => undefined,
      locate: async (provider) => program(provider, `C:\\npm\\${provider}.exe`, 'npm'),
      spawn: (() => {
        const child = new FakeChild(1000 + children.length)
        children.push(child)
        return child
      }) as never,
      platform: 'win32',
      killTree: (child) => {
        ended.push(child as FakeChild)
        ;(child as FakeChild).emit('exit', 1, null)
      },
    })
    return { deps, children, ended, checks: () => checks }
  }

  it('ends the login, clears the mark at once and looks again', async () => {
    const running = app()
    await running.deps.launchLogin('claude-code')
    const before = running.checks()
    expect(await running.deps.cancelLogin('claude-code')).toEqual({ ok: true })
    expect(running.ended).toEqual([running.children[0]])
    expect(running.deps.service.getStatuses()['claude-code'].signingIn).toBeUndefined()
    await vi.waitFor(() => expect(running.checks()).toBeGreaterThan(before))
    // the next press starts in the browser again
    await running.deps.launchLogin('claude-code')
    expect(running.deps.service.getStatuses()['claude-code'].signingIn).toBe('browser')
  })

  it('ends the window for a code just the same', async () => {
    const running = app()
    await running.deps.launchLogin('codex')
    await running.deps.launchLogin('codex')
    await running.deps.cancelLogin('codex')
    expect(running.ended).toEqual([running.children[0], running.children[1]])
    expect(running.deps.service.getStatuses().codex.signingIn).toBeUndefined()
  })

  it('with no login under way, ends nothing', async () => {
    const running = app()
    expect(await running.deps.cancelLogin('codex')).toEqual({ ok: true })
    expect(running.ended).toEqual([])
    expect(running.checks()).toBe(0)
  })

  it('has its own channel, next to the update', () => {
    expect(SUBSCRIPTION_IPC_CHANNELS.update).toBe('ai:subscription-update')
    expect(SUBSCRIPTION_IPC_CHANNELS.cancelLogin).toBe('ai:subscription-cancel-login')
  })
})
