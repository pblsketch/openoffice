/**
 * The login a user starts from a card: on Windows the CLI's window stays hidden
 * and the sign-in happens in the browser the CLI opens; pressing again while it
 * runs opens the window, for a code the browser hands back. The statuses carry
 * which of the two is under way, so every card can say what to do.
 */
import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAiSettings } from '../src/providers'
import {
  SUBSCRIPTION_LOGIN_ARGS_ENV,
  SUBSCRIPTION_LOGIN_CLOSING_ENV,
  SUBSCRIPTION_LOGIN_EXE_ENV,
  SUBSCRIPTION_LOGIN_GUIDE_ENV,
  SUBSCRIPTION_LOGIN_TITLE_ENV,
  createSubscriptionIpcDeps,
  launchSubscriptionLogin,
  subscriptionStatusMapOf,
  type SubscriptionIpcDeps,
  type SubscriptionLoginWindowText,
  type SubscriptionProgram,
  type SubscriptionStatusMap,
} from '../src/subscription'
import type { AiSubscriptionProviderId } from '../src/types'

class FakeChild extends EventEmitter {
  constructor(readonly pid: number) {
    super()
  }
  kill(): boolean {
    return true
  }
  unref(): void {}
}

const WINDOWS = { SystemRoot: 'C:\\Windows' }

function program(provider: AiSubscriptionProviderId): SubscriptionProgram {
  const command = provider === 'codex' ? 'C:\\npm\\codex.exe' : 'C:\\npm\\claude.exe'
  return { provider, command, prefixArgs: [], env: {}, entry: command, source: 'npm' }
}

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'login-window-'))
})
afterEach(async () => {
  vi.useRealTimers()
  await rm(dir, { recursive: true, force: true })
})

function app(platform: NodeJS.Platform = 'win32'): {
  deps: SubscriptionIpcDeps
  scripts: string[]
  children: FakeChild[]
  ended: FakeChild[]
  broadcasts: SubscriptionStatusMap[]
  checks: () => number
} {
  const scripts: string[] = []
  const children: FakeChild[] = []
  const ended: FakeChild[] = []
  const broadcasts: SubscriptionStatusMap[] = []
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
    locate: async (provider) => program(provider),
    spawn: ((_command: string, args: string[]) => {
      scripts.push(args.at(-1) ?? '')
      const child = new FakeChild(1000 + children.length)
      children.push(child)
      return child
    }) as never,
    platform,
    killTree: (child) => {
      ended.push(child as FakeChild)
      ;(child as FakeChild).emit('exit', 1, null)
    },
    hiddenLoginTimeoutMs: 1000,
  })
  deps.service.onChange((statuses) => broadcasts.push(statuses))
  return { deps, scripts, children, ended, broadcasts, checks: () => checks }
}

describe('the login started from a card', () => {
  it('first signs in in the browser, with the CLI window hidden', async () => {
    const running = app()
    expect(await running.deps.launchLogin('claude-code')).toEqual({ ok: true })
    expect(running.scripts).toHaveLength(1)
    expect(running.scripts[0]).toContain('-WindowStyle Hidden')
    expect(running.deps.service.getStatuses()['claude-code'].signingIn).toBe('browser')
    expect(running.deps.service.getStatuses().codex.signingIn).toBeUndefined()
    expect(running.broadcasts.at(-1)!['claude-code'].signingIn).toBe('browser')
  })

  it('pressed again, ends the hidden login and opens the window for a code', async () => {
    const running = app()
    await running.deps.launchLogin('claude-code')
    await running.deps.launchLogin('claude-code')
    expect(running.ended).toEqual([running.children[0]])
    expect(running.scripts).toHaveLength(2)
    expect(running.scripts[1]).toContain('-WindowStyle Normal')
    // the hidden login's end does not take the mark of the window that replaced it
    expect(running.deps.service.getStatuses()['claude-code'].signingIn).toBe('window')
  })

  it('pressed while the window is open, starts nothing more', async () => {
    const running = app()
    await running.deps.launchLogin('codex')
    await running.deps.launchLogin('codex')
    expect(await running.deps.launchLogin('codex')).toEqual({ ok: true })
    expect(running.scripts).toHaveLength(2)
  })

  it('once the login ends, clears the mark and looks at the provider again', async () => {
    const running = app()
    await running.deps.launchLogin('claude-code')
    const before = running.checks()
    running.children[0]!.emit('exit', 0, null)
    expect(running.deps.service.getStatuses()['claude-code'].signingIn).toBeUndefined()
    await vi.waitFor(() => expect(running.checks()).toBeGreaterThan(before))
    // the next press starts in the browser again
    await running.deps.launchLogin('claude-code')
    expect(running.scripts.at(-1)).toContain('-WindowStyle Hidden')
  })

  it('ends a browser sign-in nobody finishes', async () => {
    vi.useFakeTimers()
    const running = app()
    await running.deps.launchLogin('claude-code')
    vi.advanceTimersByTime(1000)
    expect(running.ended).toEqual([running.children[0]])
    expect(running.deps.service.getStatuses()['claude-code'].signingIn).toBeUndefined()
  })

  it('a window the user opened has no time limit', async () => {
    vi.useFakeTimers()
    const running = app()
    await running.deps.launchLogin('claude-code')
    await running.deps.launchLogin('claude-code')
    vi.advanceTimersByTime(60 * 60_000)
    expect(running.ended).toEqual([running.children[0]])
    expect(running.deps.service.getStatuses()['claude-code'].signingIn).toBe('window')
  })

  it('a login that could not start leaves no mark', async () => {
    const deps = createSubscriptionIpcDeps({
      getSettings: () => defaultAiSettings(),
      setMeteredAccepted: () => undefined,
      dataDir: dir,
      detect: async (provider) => ({ provider, state: 'not-installed' }),
      listModels: async () => undefined,
      locate: async () => null,
      platform: 'win32',
    })
    expect(await deps.launchLogin('codex')).toMatchObject({ ok: false, reason: 'not-installed' })
    expect(deps.service.getStatuses().codex.signingIn).toBeUndefined()
  })

  it('elsewhere there is no window to open: a second press changes nothing', async () => {
    const running = app('linux')
    await running.deps.launchLogin('codex')
    await running.deps.launchLogin('codex')
    expect(running.children).toHaveLength(1)
    expect(running.ended).toEqual([])
    expect(running.deps.service.getStatuses().codex.signingIn).toBe('browser')
  })
})

interface LoginStart {
  script: string
  env: NodeJS.ProcessEnv
}

async function startWindow(
  window: 'hidden' | 'visible',
  windowText?: SubscriptionLoginWindowText,
): Promise<LoginStart> {
  let start: LoginStart | undefined
  await launchSubscriptionLogin('claude-code', {
    locate: async () => program('claude-code'),
    spawn: ((_command: string, args: string[], options: { env: NodeJS.ProcessEnv }) => {
      start = { script: args.at(-1) ?? '', env: options.env }
      return new FakeChild(7)
    }) as never,
    platform: 'win32',
    baseEnv: WINDOWS,
    registry: null,
    window,
    windowText,
  })
  return start!
}

const WINDOW_TEXT: SubscriptionLoginWindowText = {
  title: 'GenOffice – Claude',
  guide: '1. "quoted" $env:PATH; calc\n2. second line',
  closing: 'Press Enter',
}

/** The script the visible window's own PowerShell runs: the single-quoted text the launcher hands it */
function guidedScript(script: string): string {
  const match = /^\$guided = '((?:[^']|'')*)'; /.exec(script)
  expect(match).not.toBeNull()
  return match![1]!.replace(/''/g, "'")
}

describe('the hidden login itself', () => {
  it('starts the CLI straight into a console that is never shown', async () => {
    const { script } = await startWindow('hidden', WINDOW_TEXT)
    expect(script).toContain('-WindowStyle Hidden')
    expect(script).toContain('Start-Process -FilePath $exe -ArgumentList $arguments')
    expect(script).not.toContain('powershell.exe')
  })

  it('carries none of the window words: nobody would read them', async () => {
    const { env } = await startWindow('hidden', WINDOW_TEXT)
    expect(env[SUBSCRIPTION_LOGIN_TITLE_ENV]).toBeUndefined()
    expect(env[SUBSCRIPTION_LOGIN_GUIDE_ENV]).toBeUndefined()
    expect(env[SUBSCRIPTION_LOGIN_CLOSING_ENV]).toBeUndefined()
  })

  it('hands the caller a way to end it', async () => {
    const ended: unknown[] = []
    let stop: (() => void) | undefined
    const child = new FakeChild(8)
    await launchSubscriptionLogin('codex', {
      locate: async () => program('codex'),
      spawn: (() => child) as never,
      platform: 'win32',
      baseEnv: WINDOWS,
      registry: null,
      killTree: (tree) => void ended.push(tree),
      onStarted: (s) => (stop = s),
    })
    expect(ended).toEqual([])
    stop!()
    expect(ended).toEqual([child])
  })
})

describe('the visible login window', () => {
  it('gives the window a PowerShell of its own, from the system folder', async () => {
    const { script } = await startWindow('visible')
    expect(script).toContain(
      `Start-Process -FilePath "$PSHOME\\powershell.exe" -ArgumentList '-NoProfile', '-NoLogo', '-Command', $guided -WindowStyle Normal -Wait`,
    )
  })

  it('hands that PowerShell a constant script with no double quote, which its command line would eat', async () => {
    const plain = guidedScript((await startWindow('visible')).script)
    const worded = guidedScript((await startWindow('visible', WINDOW_TEXT)).script)
    expect(worded).toBe(plain)
    expect(plain).not.toContain('"')
    for (const value of Object.values(WINDOW_TEXT)) expect(plain).not.toContain(value)
  })

  it('removes every value it was handed before the CLI starts, then runs the CLI in the same console', async () => {
    const guided = guidedScript((await startWindow('visible')).script)
    const removal = guided.indexOf('Remove-Item')
    const cli = guided.indexOf('Start-Process -FilePath $exe')
    expect(removal).toBeGreaterThan(-1)
    expect(cli).toBeGreaterThan(removal)
    for (const name of [
      SUBSCRIPTION_LOGIN_EXE_ENV,
      SUBSCRIPTION_LOGIN_ARGS_ENV,
      SUBSCRIPTION_LOGIN_TITLE_ENV,
      SUBSCRIPTION_LOGIN_GUIDE_ENV,
      SUBSCRIPTION_LOGIN_CLOSING_ENV,
    ]) {
      expect(guided.slice(removal, cli)).toContain(`Env:${name}`)
    }
    // the CLI keeps the console the user types into
    expect(guided.slice(cli)).toContain('-NoNewWindow -Wait -PassThru')
    // a sign-in that did not finish leaves its window until Enter, so its message can be read
    expect(guided).toContain('if ($login.ExitCode -ne 0 -and $closing)')
    expect(guided).toContain('[Console]::ReadLine()')
  })

  it('passes the words as values in the environment', async () => {
    const { env } = await startWindow('visible', WINDOW_TEXT)
    expect(env[SUBSCRIPTION_LOGIN_TITLE_ENV]).toBe(WINDOW_TEXT.title)
    expect(env[SUBSCRIPTION_LOGIN_GUIDE_ENV]).toBe(WINDOW_TEXT.guide)
    expect(env[SUBSCRIPTION_LOGIN_CLOSING_ENV]).toBe(WINDOW_TEXT.closing)
  })

  it('leaves out words it was not given', async () => {
    const { env } = await startWindow('visible', { title: 'Sign-in', guide: '' })
    expect(env[SUBSCRIPTION_LOGIN_TITLE_ENV]).toBe('Sign-in')
    expect(env[SUBSCRIPTION_LOGIN_GUIDE_ENV]).toBeUndefined()
    expect(env[SUBSCRIPTION_LOGIN_CLOSING_ENV]).toBeUndefined()
  })
})

describe('the window words the app supplies', () => {
  function appWithWords(
    loginWindowText: (provider: AiSubscriptionProviderId) => SubscriptionLoginWindowText,
  ): {
    deps: SubscriptionIpcDeps
    envs: NodeJS.ProcessEnv[]
    asked: AiSubscriptionProviderId[]
  } {
    const envs: NodeJS.ProcessEnv[] = []
    const asked: AiSubscriptionProviderId[] = []
    const deps = createSubscriptionIpcDeps({
      getSettings: () => defaultAiSettings(),
      setMeteredAccepted: () => undefined,
      dataDir: dir,
      detect: async (provider) => ({ provider, state: 'signed-out' }),
      listModels: async () => undefined,
      locate: async (provider) => program(provider),
      spawn: ((_command: string, _args: string[], options: { env: NodeJS.ProcessEnv }) => {
        envs.push(options.env)
        return new FakeChild(2000 + envs.length)
      }) as never,
      platform: 'win32',
      killTree: (child) => void (child as FakeChild).emit('exit', 1, null),
      loginWindowText: (provider) => {
        asked.push(provider)
        return loginWindowText(provider)
      },
    })
    return { deps, envs, asked }
  }

  it('are asked for only when the window opens, for that provider', async () => {
    const running = appWithWords((provider) => ({ title: `title ${provider}` }))
    await running.deps.launchLogin('codex')
    expect(running.asked).toEqual([])
    expect(running.envs[0]![SUBSCRIPTION_LOGIN_TITLE_ENV]).toBeUndefined()
    await running.deps.launchLogin('codex')
    expect(running.asked).toEqual(['codex'])
    expect(running.envs[1]![SUBSCRIPTION_LOGIN_TITLE_ENV]).toBe('title codex')
  })

  it('that cannot be had do not stop the window from opening', async () => {
    const running = appWithWords(() => {
      throw new Error('no strings')
    })
    await running.deps.launchLogin('claude-code')
    expect(await running.deps.launchLogin('claude-code')).toEqual({ ok: true })
    expect(running.envs).toHaveLength(2)
    expect(running.envs[1]![SUBSCRIPTION_LOGIN_TITLE_ENV]).toBeUndefined()
    expect(running.deps.service.getStatuses()['claude-code'].signingIn).toBe('window')
  })
})

describe('the mark as a window reads it', () => {
  it('passes the two known values and drops anything else', () => {
    const map = (signingIn: unknown) =>
      subscriptionStatusMapOf({
        'claude-code': { provider: 'claude-code', state: 'signed-out', signingIn },
      })['claude-code'].signingIn
    expect(map('browser')).toBe('browser')
    expect(map('window')).toBe('window')
    expect(map('yes')).toBeUndefined()
    expect(map(true)).toBeUndefined()
  })
})
