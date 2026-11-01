import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { SpawnOptions } from 'node:child_process'
import { PRODUCT_NAME, UPSTREAM_PRODUCT_NAME } from '@genoffice/i18n'
import { AiRunError } from '../src/run-error'
import type { StreamCallbacks } from '../src/protocols/shared'
import type { AiSubscriptionUsage } from '../src/types'
import type { SubscriptionProgram } from '../src/subscription/locate'
import type { SubscriptionChildLike } from '../src/subscription/process'
import { SUBSCRIPTION_STRIPPED_ENV_VARS } from '../src/subscription/env'
import { codexAccountInfo, detectSubscriptionLogin } from '../src/subscription/status'
import { subscriptionModelsOf } from '../src/subscription/contract'
import { notifySubscriptionLoginChange } from '../src/subscription/launch'
import { listSubscriptionModels } from '../src/subscription/models'
import {
  chatCodexAppServer,
  codexAppServerLaunchArgs,
  codexAttachedMcpServers,
  codexMcpServerOverrides,
  codexRunError,
  codexSubscriptionModels,
  codexSubscriptionUsage,
  codexThreadStartParams,
  listCodexModels,
  listCodexSubscriptionModels,
  MAX_RPC_LINE_BYTES,
  readCodexAccount,
  setCodexAppServerRuntime,
  shutdownCodexAppServers,
  streamCodexAppServer,
  waitForTurn,
  type CodexTurnTransport,
  type RpcMessage,
} from '../src/codex-app-server'

const PROGRAM: SubscriptionProgram = {
  provider: 'codex',
  command: '/opt/codex/bin/codex',
  prefixArgs: [],
  env: {},
  entry: '/opt/codex/bin/codex',
  source: 'path',
}

const CHATGPT_ACCOUNT = {
  account: { type: 'chatgpt', email: 'someone@example.com', planType: 'plus' },
  requiresOpenaiAuth: true,
}
const API_KEY_ACCOUNT = { account: { type: 'apiKey' }, requiresOpenaiAuth: true }

type Handler = (params: unknown, child: FakeCodex) => unknown

/** Returned by a handler that leaves its request unanswered */
const NO_REPLY = Symbol('no reply')

const completedTurn = (text: string): RpcMessage[] => [
  {
    method: 'item/completed',
    params: { threadId: 'th-1', turnId: 't1', item: { type: 'agentMessage', text } },
  },
  {
    method: 'turn/completed',
    params: { threadId: 'th-1', turnId: 't1', turn: { id: 't1', status: 'completed' } },
  },
]

const ANSWER = JSON.stringify({ text: 'hello', toolCalls: [] })

/** A stand-in for the `codex app-server` child: answers RPC requests from a handler table. */
class FakeCodex extends EventEmitter implements SubscriptionChildLike {
  // no pid: the shared child registry and the real tree kill both skip a child without one
  readonly pid = undefined
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly requests: Array<{ method: string; params: unknown }> = []
  killed = 0
  private buffer = ''

  constructor(private readonly handlers: Record<string, Handler>) {
    super()
    this.stdin.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8')
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) this.receive(JSON.parse(line) as RpcMessage)
    })
  }

  kill(): boolean {
    this.killed++
    return true
  }

  send(message: RpcMessage): void {
    this.stdout.write(`${JSON.stringify(message)}\n`)
  }

  exit(code: number): void {
    this.emit('exit', code)
    this.emit('close', code)
  }

  methods(): string[] {
    return this.requests.map((request) => request.method)
  }

  paramsOf(method: string): Record<string, unknown> | undefined {
    return this.requests.find((request) => request.method === method)?.params as
      Record<string, unknown> | undefined
  }

  private receive(message: RpcMessage): void {
    if (typeof message.method !== 'string' || message.id === undefined) return
    this.requests.push({ method: message.method, params: message.params })
    const handler = this.handlers[message.method]
    if (!handler) {
      this.send({ id: message.id, error: { code: -32601, message: 'Method not found' } })
      return
    }
    try {
      const result = handler(message.params, this)
      if (result !== NO_REPLY) this.send({ id: message.id, result })
    } catch (error) {
      this.send({ id: message.id, error })
    }
  }
}

interface Harness {
  children: FakeCodex[]
  spawns: Array<{ command: string; args: string[]; options: SpawnOptions }>
  treeKills: unknown[]
  /** the only child, once exactly one was started */
  child(): FakeCodex
}

let restoreRuntime: (() => void) | undefined

function harness(
  overrides: Record<string, Handler> = {},
  setRuntime: typeof setCodexAppServerRuntime = setCodexAppServerRuntime,
): Harness {
  const handlers: Record<string, Handler> = {
    initialize: () => ({ userAgent: 'fake' }),
    'account/read': () => CHATGPT_ACCOUNT,
    'config/read': () => ({ config: {} }),
    'thread/start': () => ({
      thread: { id: 'th-1' },
      activePermissionProfile: { id: 'genoffice' },
    }),
    'mcpServerStatus/list': () => ({ data: [], nextCursor: null }),
    'thread/delete': () => ({}),
    'turn/interrupt': () => ({}),
    'turn/start': (_params, child) => {
      queueMicrotask(() => completedTurn(ANSWER).forEach((message) => child.send(message)))
      return { turn: { id: 't1' } }
    },
    ...overrides,
  }
  const state: Harness = {
    children: [],
    spawns: [],
    treeKills: [],
    child() {
      expect(state.children).toHaveLength(1)
      return state.children[0]!
    },
  }
  restoreRuntime = setRuntime({
    resolve: async () => PROGRAM,
    spawn: (command, args, options) => {
      const child = new FakeCodex(handlers)
      state.children.push(child)
      state.spawns.push({ command, args, options })
      return child
    },
    killTree: (target) => {
      state.treeKills.push(target)
    },
  })
  return state
}

function callbacks(signal = new AbortController().signal) {
  const usage: AiSubscriptionUsage[][] = []
  const deltas: string[] = []
  const cb: StreamCallbacks = {
    signal,
    onDelta: (text) => void deltas.push(text),
    onToolCall: () => undefined,
    onSubscriptionUsage: (windows) => void usage.push(windows),
  }
  return { usage, deltas, cb }
}

const CONFIG = { apiKey: '', model: 'gpt-5.6-luna' }
const run = (cb: StreamCallbacks, text = 'hi') =>
  streamCodexAppServer(CONFIG, 'system', [{ role: 'user', text }], [], 1024, cb)

const settle = () => new Promise((resolve) => setImmediate(resolve))

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the run to fail')
}

afterEach(() => {
  shutdownCodexAppServers()
  restoreRuntime?.()
  restoreRuntime = undefined
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('Codex app-server launch', () => {
  it('starts the located program without a shell and without billing-route variables', async () => {
    for (const name of SUBSCRIPTION_STRIPPED_ENV_VARS) vi.stubEnv(name, 'secret-value')
    const h = harness()
    await run(callbacks().cb)
    expect(h.spawns).toHaveLength(1)
    const { command, args, options } = h.spawns[0]!
    expect(command).toBe(PROGRAM.command)
    expect(args).toEqual(codexAppServerLaunchArgs())
    expect(options.shell).toBeUndefined()
    const names = Object.keys(options.env ?? {}).map((name) => name.toUpperCase())
    for (const name of SUBSCRIPTION_STRIPPED_ENV_VARS) expect(names).not.toContain(name)
    expect(Object.values(options.env ?? {})).not.toContain('secret-value')
  })

  it('introduces itself to Codex as this product, not as the project it is based on', async () => {
    const h = harness()
    await run(callbacks().cb)
    const child = h.child()
    const product = PRODUCT_NAME.toLowerCase()
    expect(child.paramsOf('initialize')).toMatchObject({
      clientInfo: { name: product, title: PRODUCT_NAME, version: '0.1.0' },
    })
    const thread = child.paramsOf('thread/start')!
    expect(thread.serviceName).toBe(product)
    expect(String(thread.baseInstructions)).toContain(PRODUCT_NAME)
    const turn = child.paramsOf('turn/start')!
    const sent = JSON.stringify([
      child.paramsOf('initialize'),
      thread.serviceName,
      thread.baseInstructions,
      turn.input,
    ])
    expect(sent).toContain(PRODUCT_NAME)
    expect(sent.toLowerCase()).not.toContain(UPSTREAM_PRODUCT_NAME.toLowerCase())
  })

  it('switches off what the user configuration would bring into the run', () => {
    const args = codexAppServerLaunchArgs()
    expect(args[0]).toBe('app-server')
    expect(args.slice(-2)).toEqual(['--listen', 'stdio://'])
    const overrides = args.filter((_, index) => args[index - 1] === '-c')
    expect(overrides).toEqual(
      expect.arrayContaining([
        'features.hooks=false',
        'features.plugins=false',
        'features.apps=false',
        'features.memories=false',
        'notify=[]',
        'history.persistence="none"',
        'skills.include_instructions=false',
        // Codex's own web search: off in the app's chat, like every tool it can turn off
        'web_search="disabled"',
      ]),
    )
    // the official route: the user's own provider or API address (a proxy, say) must not apply
    expect(overrides).toContain('model_provider="openai"')
    expect(overrides).toContain('openai_base_url=""')
    // an unknown name after `--disable` stops Codex from starting; `-c features.x=false` only warns
    expect(args).not.toContain('--disable')
  })

  it('reports a missing program as not installed', async () => {
    harness()
    restoreRuntime?.()
    restoreRuntime = setCodexAppServerRuntime({
      resolve: async () => {
        throw new AiRunError('not-installed', 'Codex CLI was not found', { provider: 'codex' })
      },
    })
    const error = await failure(run(callbacks().cb))
    expect(error).toBeInstanceOf(AiRunError)
    expect(error).toMatchObject({ kind: 'not-installed', provider: 'codex' })
  })

  it('reports a program that vanished before it could start as not installed', async () => {
    harness({
      // the start fails before the first request is answered
      initialize: (_params, child) => {
        queueMicrotask(() =>
          child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })),
        )
        return NO_REPLY
      },
    })
    const error = await failure(run(callbacks().cb))
    expect(error).toBeInstanceOf(AiRunError)
    expect(error).toMatchObject({ kind: 'not-installed', provider: 'codex' })
  })
})

describe('Codex MCP servers', () => {
  it('names every configured server as switched off', () => {
    expect(
      codexMcpServerOverrides({
        config: { mcp_servers: { files: { command: 'x', env: { TOKEN: 's' } }, web: {} } },
      }),
    ).toEqual({ files: { enabled: false }, web: { enabled: false } })
    expect(codexMcpServerOverrides({ config: {} })).toEqual({})
    expect(codexMcpServerOverrides({ config: { mcp_servers: null } })).toEqual({})
  })

  it('passes the switch-off in both thread start modes', () => {
    const off = { files: { enabled: false as const } }
    const profile = codexThreadStartParams(CONFIG, '/tmp/x', 'profile', off)
    expect(profile.config).toMatchObject({ default_permissions: 'genoffice', mcp_servers: off })
    const readOnly = codexThreadStartParams(CONFIG, '/tmp/x', 'read-only', off)
    expect(readOnly).toMatchObject({ sandbox: 'read-only', config: { mcp_servers: off } })
    expect(codexThreadStartParams(CONFIG, '/tmp/x', 'read-only')).not.toHaveProperty('config')
  })

  it('starts a thread with the servers Codex itself reports switched off', async () => {
    const h = harness({
      'config/read': () => ({ config: { mcp_servers: { files: { command: 'x' }, web: {} } } }),
    })
    await run(callbacks().cb)
    const child = h.child()
    expect(child.methods().indexOf('config/read')).toBeLessThan(
      child.methods().indexOf('thread/start'),
    )
    expect(child.paramsOf('thread/start')).toMatchObject({
      approvalPolicy: 'never',
      ephemeral: true,
      config: { mcp_servers: { files: { enabled: false }, web: { enabled: false } } },
    })
  })

  it('refuses to run when Codex cannot report its configuration', async () => {
    const h = harness({
      'config/read': () => {
        throw { code: -32601, message: 'Method not found' }
      },
    })
    const error = await failure(run(callbacks().cb))
    expect(error).toBeInstanceOf(AiRunError)
    expect(error).toMatchObject({ kind: 'unsafe-tools', provider: 'codex' })
    expect(h.child().methods()).not.toContain('thread/start')
  })

  it('reads which servers are attached from the status Codex reports for a thread', () => {
    const server = (name: string, runtimeStatus: unknown, tools: Record<string, unknown> = {}) => ({
      name,
      runtimeStatus,
      tools,
    })
    expect(
      codexAttachedMcpServers({
        data: [
          server('off', 'disabled'),
          server('unknown-state', null),
          server('connected', 'connected', { read: {} }),
          server('starting', 'starting'),
          server('waiting', 'notStarted'),
          server('has-tools', 'disabled', { read: {} }),
        ],
      }),
    ).toEqual(['connected', 'starting', 'waiting', 'has-tools'])
    expect(codexAttachedMcpServers({ data: [] })).toEqual([])
    expect(() => codexAttachedMcpServers({})).toThrow()
    expect(() => codexAttachedMcpServers(null)).toThrow()
  })

  it('asks Codex what is attached to the new thread before the first turn', async () => {
    const h = harness({
      'config/read': () => ({ config: { mcp_servers: { files: {} } } }),
      'mcpServerStatus/list': () => ({
        data: [{ name: 'files', runtimeStatus: 'disabled', tools: {} }],
        nextCursor: null,
      }),
    })
    const { cb, deltas } = callbacks()
    await run(cb)
    expect(deltas).toEqual(['hello'])
    const methods = h.child().methods()
    expect(methods.indexOf('thread/start')).toBeLessThan(methods.indexOf('mcpServerStatus/list'))
    expect(methods.indexOf('mcpServerStatus/list')).toBeLessThan(methods.indexOf('turn/start'))
    expect(h.child().paramsOf('mcpServerStatus/list')).toMatchObject({ threadId: 'th-1' })
  })

  it.each([
    ['an enabled server', { name: 'files', runtimeStatus: 'connected', tools: {} }],
    ['a tool of a server', { name: 'files', runtimeStatus: null, tools: { read: {} } }],
  ])('refuses to run when the thread still reports %s', async (_label, entry) => {
    const h = harness({
      'mcpServerStatus/list': () => ({ data: [entry], nextCursor: null }),
    })
    const error = await failure(run(callbacks().cb))
    expect(error).toBeInstanceOf(AiRunError)
    expect(error).toMatchObject({ kind: 'unsafe-tools', provider: 'codex' })
    expect(h.child().methods()).not.toContain('turn/start')
    expect(h.treeKills).toEqual([h.child()])
  })

  it('refuses to run when Codex cannot say what is attached to the thread', async () => {
    const h = harness({
      'mcpServerStatus/list': () => {
        throw { code: -32601, message: 'Method not found' }
      },
    })
    const error = await failure(run(callbacks().cb))
    expect(error).toMatchObject({ kind: 'unsafe-tools', provider: 'codex' })
    expect(h.child().methods()).not.toContain('turn/start')
    expect(h.treeKills).toEqual([h.child()])
  })

  it('does not mind a server that Codex reports as not started', async () => {
    harness({
      'turn/start': (_params, child) => {
        queueMicrotask(() => {
          for (const status of ['failed', 'cancelled']) {
            child.send({
              method: 'mcpServer/startupStatus/updated',
              params: { threadId: 'th-1', name: 'files', status },
            })
          }
          completedTurn(ANSWER).forEach((message) => child.send(message))
        })
        return { turn: { id: 't1' } }
      },
    })
    const { cb, deltas } = callbacks()
    await run(cb)
    expect(deltas).toEqual(['hello'])
  })

  it('stops the run and the process when Codex starts an MCP server anyway', async () => {
    const h = harness({
      'turn/start': (_params, child) => {
        queueMicrotask(() =>
          child.send({
            method: 'mcpServer/startupStatus/updated',
            params: { threadId: 'th-1', name: 'files', status: 'starting' },
          }),
        )
        return { turn: { id: 't1' } }
      },
    })
    const error = await failure(run(callbacks().cb))
    expect(error).toMatchObject({ kind: 'unsafe-tools', provider: 'codex' })
    expect(h.treeKills).toEqual([h.child()])
  })
})

describe('Codex process lifetime', () => {
  it('ends the whole process tree when the output outgrows the line limit', async () => {
    const h = harness({
      'turn/start': (_params, child) => {
        queueMicrotask(() => child.stdout.write(Buffer.alloc(MAX_RPC_LINE_BYTES + 1, 0x61)))
        return { turn: { id: 't1' } }
      },
    })
    const error = await failure(run(callbacks().cb))
    expect(String(error)).toContain('without a newline')
    expect(h.treeKills).toEqual([h.child()])
    expect(h.child().killed).toBe(0)
  })

  it('ends the whole process tree on shutdown', async () => {
    const h = harness()
    await run(callbacks().cb)
    expect(h.treeKills).toEqual([])
    shutdownCodexAppServers()
    expect(h.treeKills).toEqual([h.child()])
  })

  it('ends the whole process tree when a run is cancelled', async () => {
    const h = harness({ 'turn/start': () => ({ turn: { id: 't1' } }) })
    const controller = new AbortController()
    const pending = failure(run(callbacks(controller.signal).cb))
    while (!h.children[0]?.methods().includes('turn/start')) await settle()
    controller.abort()
    expect(await pending).toMatchObject({ name: 'AbortError' })
    expect(h.treeKills).toEqual([h.child()])
  })

  it('ends the process tree for a run cancelled before its turn, which is never sent', async () => {
    const h = harness()
    const controller = new AbortController()
    controller.abort()
    expect(await failure(run(callbacks(controller.signal).cb))).toMatchObject({
      name: 'AbortError',
    })
    expect(h.child().methods()).not.toContain('turn/start')
    expect(h.treeKills).toEqual([h.child()])
  })

  it('keeps the process for a run still in flight and ends it when that run is done', async () => {
    let turns = 0
    const h = harness({
      'thread/start': () => ({
        thread: { id: `th-${++turns}` },
        activePermissionProfile: { id: 'genoffice' },
      }),
      'turn/start': () => ({ turn: { id: 't1' } }),
    })
    const first = new AbortController()
    const cancelled = failure(run(callbacks(first.signal).cb, 'run-to-cancel'))
    const second = callbacks()
    const other = run(second.cb, 'run-to-keep')
    const turnStarts = () =>
      (h.children[0]?.requests ?? []).filter((request) => request.method === 'turn/start')
    while (turnStarts().length < 2) await settle()
    first.abort()
    expect(await cancelled).toMatchObject({ name: 'AbortError' })
    expect(h.treeKills).toEqual([])
    const kept = turnStarts().find((request) => JSON.stringify(request).includes('run-to-keep'))!
    const { threadId } = kept.params as { threadId: string }
    for (const message of completedTurn(ANSWER)) {
      h.child().send({ ...message, params: { ...(message.params as object), threadId } })
    }
    await other
    expect(second.deltas).toEqual(['hello'])
    expect(h.treeKills).toEqual([h.child()])
  })

  it('ends the whole process tree when it has been idle', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const h = harness()
    await run(callbacks().cb)
    expect(h.treeKills).toEqual([])
    vi.advanceTimersByTime(120_000)
    expect(h.treeKills).toEqual([h.child()])
  })

  it('fails a waiting turn when the process exits', async () => {
    const h = harness({
      'turn/start': (_params, child) => {
        queueMicrotask(() => child.exit(3))
        return { turn: { id: 't1' } }
      },
    })
    const error = await failure(run(callbacks().cb))
    expect(String(error)).toContain('Codex app-server exited (3)')
    expect(h.children).toHaveLength(1)
  })
})

describe('Codex account', () => {
  it('reads the account for the status check and maps its kind', async () => {
    harness()
    const account = await readCodexAccount(undefined)
    expect(codexAccountInfo(account)).toMatchObject({
      signedIn: true,
      loginMethod: 'subscription',
      planName: 'plus',
    })
    expect(codexAccountInfo(API_KEY_ACCOUNT)).toMatchObject({ loginMethod: 'metered' })
    expect(
      codexAccountInfo({ account: { type: 'amazonBedrock' }, requiresOpenaiAuth: false }),
    ).toMatchObject({ loginMethod: 'unknown' })
  })

  it('is the account source of the status check', async () => {
    const h = harness()
    const detection = await detectSubscriptionLogin('codex', {
      locate: async () => PROGRAM,
      run: async (_program, args) => ({
        code: 0,
        stdout: args[0] === '--version' ? 'codex-cli 0.162.0' : '',
        stderr: args[0] === 'login' ? 'Logged in using ChatGPT' : '',
      }),
    })
    // the plan name exists only in account/read, so it proves the bridge was asked
    expect(detection).toMatchObject({
      state: 'ready',
      planName: 'plus',
      account: 'someone@example.com',
    })
    expect(h.child().methods()).toContain('account/read')
  })

  it('refuses to run when Codex is signed out', async () => {
    const h = harness({ 'account/read': () => ({ account: null, requiresOpenaiAuth: true }) })
    const error = await failure(run(callbacks().cb))
    expect(error).toMatchObject({ kind: 'signed-out', provider: 'codex' })
    expect(h.child().methods()).not.toContain('thread/start')
    expect(await failure(listCodexModels())).toMatchObject({
      kind: 'signed-out',
      provider: 'codex',
    })
  })

  it('refuses a metered login the status check has not seen', async () => {
    let account: unknown = CHATGPT_ACCOUNT
    const h = harness({ 'account/read': () => account })
    await readCodexAccount(undefined)
    account = API_KEY_ACCOUNT
    const error = await failure(run(callbacks().cb))
    expect(error).toMatchObject({ kind: 'metered-not-accepted', provider: 'codex' })
    expect(h.child().methods()).not.toContain('thread/start')
    expect(h.child().methods()).not.toContain('turn/start')
  })

  it('runs on a metered login the status check has seen (the selection decided on it)', async () => {
    harness({ 'account/read': () => API_KEY_ACCOUNT })
    await readCodexAccount(undefined)
    const { cb, deltas } = callbacks()
    await run(cb)
    expect(deltas).toEqual(['hello'])
  })

  it('forgets what the status check saw when its next reading fails', async () => {
    let account: unknown = CHATGPT_ACCOUNT
    harness({
      'account/read': () => {
        if (account === undefined) throw { code: -32000, message: 'unavailable' }
        return account
      },
    })
    await readCodexAccount(undefined)
    account = undefined
    await failure(readCodexAccount(undefined))
    // the status check decided without the bridge, so the bridge has nothing to compare with
    account = API_KEY_ACCOUNT
    const { cb, deltas } = callbacks()
    await run(cb)
    expect(deltas).toEqual(['hello'])
  })

  it('leaves a metered login to the selection when no status check has run yet', async () => {
    vi.resetModules()
    const fresh = await import('../src/codex-app-server')
    try {
      harness({ 'account/read': () => API_KEY_ACCOUNT }, fresh.setCodexAppServerRuntime)
      const { cb, deltas } = callbacks()
      await fresh.streamCodexAppServer(
        CONFIG,
        'system',
        [{ role: 'user', text: 'hi' }],
        [],
        1024,
        cb,
      )
      expect(deltas).toEqual(['hello'])
    } finally {
      fresh.shutdownCodexAppServers()
    }
  })

  it('stops reading the account when the status check gives up', async () => {
    harness({
      'account/read': () => {
        throw { code: -32000, message: 'unreachable' }
      },
    })
    const controller = new AbortController()
    controller.abort()
    expect(await failure(readCodexAccount(undefined, controller.signal))).toMatchObject({
      name: 'AbortError',
    })
  })
})

function scripted(script: RpcMessage[]): CodexTurnTransport & { requests: string[] } {
  let listener: ((message: RpcMessage) => void) | undefined
  const requests: string[] = []
  return {
    requests,
    request: async (method) => {
      requests.push(method)
      if (method === 'turn/start') {
        queueMicrotask(() => script.forEach((message) => listener?.(message)))
        return { turn: { id: 't1' } }
      }
      if (method === 'account/rateLimits/read') {
        return {
          rateLimits: {
            primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: 1_800_000 },
          },
        }
      }
      return {}
    },
    onNotification: (next) => {
      listener = next
      return () => {
        listener = undefined
      }
    },
  }
}

const turnEvent = (method: string, params: Record<string, unknown>): RpcMessage => ({
  method,
  params: { threadId: 'th', turnId: 't1', ...params },
})

const failedTurn = (error: unknown): RpcMessage =>
  turnEvent('turn/completed', { turn: { id: 't1', status: 'failed', error } })

function wait(transport: CodexTurnTransport, cb = callbacks().cb) {
  return waitForTurn(transport, 'th', () => transport.request('turn/start', {}), cb.signal, cb)
}

describe('Codex turn outcome', () => {
  it('does not fail a turn that completes after an error notification', async () => {
    const transport = scripted([
      turnEvent('error', { willRetry: false, error: { message: 'model fallback warning' } }),
      turnEvent('item/completed', { item: { type: 'error', message: 'a warning item' } }),
      turnEvent('item/completed', { item: { type: 'agentMessage', text: 'done' } }),
      turnEvent('turn/completed', { turn: { id: 't1', status: 'completed' } }),
    ])
    await expect(wait(transport)).resolves.toBe('done')
  })

  it('fails with the reported error when the turn itself fails', async () => {
    const transport = scripted([
      turnEvent('error', { willRetry: false, error: { message: 'boom' } }),
      turnEvent('turn/completed', { turn: { id: 't1', status: 'failed', error: null } }),
    ])
    await expect(wait(transport)).rejects.toThrow('boom')
  })

  it('does not count a reconnect notice as activity', async () => {
    const activity = vi.fn()
    const transport = scripted([
      turnEvent('error', { willRetry: true, error: { message: 'Reconnecting... 2/5' } }),
      turnEvent('turn/completed', { turn: { id: 't1', status: 'completed' } }),
    ])
    await wait(transport, { ...callbacks().cb, onActivity: activity })
    expect(activity).toHaveBeenCalledTimes(1)
  })

  it('maps a usage limit to rate-limit with the reset time of the exhausted window', async () => {
    const transport = scripted([
      {
        method: 'account/rateLimits/updated',
        params: {
          rateLimits: {
            limitId: 'codex',
            primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: 1_794_469_543 },
            secondary: { usedPercent: 64, windowDurationMins: 10080, resetsAt: 1_794_900_000 },
          },
        },
      },
      failedTurn({ message: "You've hit your usage limit.", codexErrorInfo: 'usageLimitExceeded' }),
    ])
    const error = await failure(wait(transport))
    expect(error).toBeInstanceOf(AiRunError)
    expect(error).toMatchObject({
      kind: 'rate-limit',
      provider: 'codex',
      resetsAt: 1_794_469_543_000,
    })
    expect(transport.requests).not.toContain('account/rateLimits/read')
  })

  it('asks Codex for the reset time when the turn did not report one', async () => {
    const transport = scripted([
      failedTurn({ message: 'usage limit', codexErrorInfo: 'usageLimitExceeded' }),
    ])
    expect(await failure(wait(transport))).toMatchObject({
      kind: 'rate-limit',
      resetsAt: 1_800_000_000,
    })
  })

  it('reports the error Codex gave when the process ends before the turn does', async () => {
    let closed: ((error: Error) => void) | undefined
    const base = scripted([
      turnEvent('error', {
        willRetry: false,
        error: { message: 'usage limit', codexErrorInfo: 'usageLimitExceeded' },
      }),
    ])
    const transport: CodexTurnTransport = {
      ...base,
      onClose: (listener) => {
        closed = listener
        return () => undefined
      },
    }
    const pending = failure(wait(transport))
    await settle()
    closed?.(new Error('Codex app-server exited (1)'))
    expect(await pending).toMatchObject({ kind: 'rate-limit', provider: 'codex' })
  })

  it('maps a rejected login to signed-out', async () => {
    const byInfo = scripted([failedTurn({ message: 'expired', codexErrorInfo: 'unauthorized' })])
    expect(await failure(wait(byInfo))).toMatchObject({ kind: 'signed-out', provider: 'codex' })
    const byStatus = scripted([
      failedTurn({
        message: 'unexpected status 401',
        codexErrorInfo: { responseStreamConnectionFailed: { httpStatusCode: 401 } },
      }),
    ])
    expect(await failure(wait(byStatus))).toMatchObject({ kind: 'signed-out', provider: 'codex' })
  })

  it('keeps other failures as plain errors with the message Codex gave', () => {
    const error = codexRunError({
      message: 'server overloaded',
      codexErrorInfo: 'serverOverloaded',
    })
    expect(error).not.toBeInstanceOf(AiRunError)
    expect(error.message).toBe('server overloaded')
    expect(codexRunError(null).message).toBe('Codex turn failed')
    expect(codexRunError({ message: 'limit', codexErrorInfo: 'usageLimitExceeded' })).toMatchObject(
      { kind: 'rate-limit', provider: 'codex' },
    )
    expect(
      (codexRunError({ message: 'limit', codexErrorInfo: 'usageLimitExceeded' }) as AiRunError)
        .resetsAt,
    ).toBeUndefined()
  })
})

describe('Codex usage windows', () => {
  const window = (usedPercent: number, windowDurationMins: number, resetsAt: number | null) => ({
    usedPercent,
    windowDurationMins,
    resetsAt,
  })

  it('reports the five-hour and seven-day windows that have a reset time', () => {
    expect(
      codexSubscriptionUsage({
        limitId: 'codex',
        primary: window(42, 300, 1_794_469_543),
        secondary: window(7, 10080, 1_794_900_000),
      }),
    ).toEqual([
      { provider: 'codex', window: 'five_hour', utilization: 0.42, resetsAt: 1_794_469_543_000 },
      { provider: 'codex', window: 'seven_day', utilization: 0.07, resetsAt: 1_794_900_000_000 },
    ])
  })

  it('leaves out a window without a reset time, of another length, or of another limit', () => {
    expect(
      codexSubscriptionUsage({ primary: window(42, 300, null), secondary: window(7, 10080, 5) }),
    ).toEqual([{ provider: 'codex', window: 'seven_day', utilization: 0.07, resetsAt: 5000 }])
    // the free plan reports one 30-day window
    expect(codexSubscriptionUsage({ primary: window(3, 43200, 1_794_469_543) })).toEqual([])
    expect(
      codexSubscriptionUsage({ limitId: 'codex_other', primary: window(42, 300, 1_794_469_543) }),
    ).toEqual([])
    expect(codexSubscriptionUsage({ primary: { windowDurationMins: 300, resetsAt: 9 } })).toEqual(
      [],
    )
    expect(codexSubscriptionUsage(null)).toEqual([])
    expect(codexSubscriptionUsage({ primary: window(250, 300, 9) })[0]?.utilization).toBe(1)
  })

  it('forwards the windows Codex reports during a run', async () => {
    harness({
      'turn/start': (_params, child) => {
        queueMicrotask(() => {
          child.send({
            method: 'account/rateLimits/updated',
            params: { rateLimits: { limitId: 'codex', primary: window(81, 300, 1_794_469_543) } },
          })
          child.send({
            method: 'account/rateLimits/updated',
            params: { rateLimits: { limitId: 'codex', primary: window(3, 43200, 1_794_469_543) } },
          })
          completedTurn(ANSWER).forEach((message) => child.send(message))
        })
        return { turn: { id: 't1' } }
      },
    })
    const { cb, usage } = callbacks()
    await run(cb)
    expect(usage).toEqual([
      [{ provider: 'codex', window: 'five_hour', utilization: 0.81, resetsAt: 1_794_469_543_000 }],
    ])
  })

  it('still answers a one-shot chat', async () => {
    harness()
    await expect(
      chatCodexAppServer(CONFIG, 'system', 'hi', new AbortController().signal),
    ).resolves.toEqual({ ok: true, content: 'hello' })
  })
})

describe('Codex default model', () => {
  const NO_MODEL = { apiKey: '', model: '' }
  const MODELS = {
    data: [
      { id: 'gpt-hidden', hidden: true, isDefault: true },
      { id: 'gpt-other', hidden: false, isDefault: false },
      { id: 'gpt-default', hidden: false, isDefault: true },
    ],
    nextCursor: null,
  }
  type Messages = Parameters<typeof streamCodexAppServer>[2]
  const sent = (child: FakeCodex, method: string) =>
    child.requests.filter((request) => request.method === method)
  const models = (child: FakeCodex, method: string) =>
    sent(child, method).map((request) => (request.params as { model?: unknown }).model)
  const stream = (
    config: { apiKey: string; model: string },
    cb: StreamCallbacks,
    messages: Messages = [{ role: 'user', text: 'hi' }],
  ) => streamCodexAppServer(config, 'system', messages, [], 1024, cb)
  const chat = (config: { apiKey: string; model: string }) =>
    chatCodexAppServer(config, 'system', 'hi', new AbortController().signal)

  it.each([
    ['empty', ''],
    ['blank', '  '],
  ])('names the default Codex itself lists when the model is %s', async (_label, model) => {
    const h = harness({ 'model/list': () => MODELS })
    const { cb, deltas } = callbacks()
    await stream({ apiKey: '', model }, cb)
    expect(deltas).toEqual(['hello'])
    const child = h.child()
    expect(sent(child, 'model/list')).toHaveLength(1)
    expect(models(child, 'thread/start')).toEqual(['gpt-default'])
    expect(child.methods().indexOf('model/list')).toBeLessThan(
      child.methods().indexOf('thread/start'),
    )
  })

  it('names it in the read-only fallback thread too', async () => {
    const h = harness({
      'model/list': () => MODELS,
      // the permission profile was not applied, so the thread is started again
      'thread/start': () => ({ thread: { id: 'th-1' } }),
    })
    await stream(NO_MODEL, callbacks().cb)
    expect(models(h.child(), 'thread/start')).toEqual(['gpt-default', 'gpt-default'])
  })

  it('names it for a one-shot chat', async () => {
    const h = harness({ 'model/list': () => MODELS })
    await expect(chat(NO_MODEL)).resolves.toEqual({ ok: true, content: 'hello' })
    expect(sent(h.child(), 'model/list')).toHaveLength(1)
    expect(models(h.child(), 'thread/start')).toEqual(['gpt-default'])
  })

  it('asks for the list once per process', async () => {
    const h = harness({ 'model/list': () => MODELS })
    await stream(NO_MODEL, callbacks().cb)
    await stream(NO_MODEL, callbacks().cb)
    await chat(NO_MODEL)
    const child = h.child()
    expect(sent(child, 'model/list')).toHaveLength(1)
    expect(models(child, 'thread/start')).toEqual(['gpt-default', 'gpt-default', 'gpt-default'])
  })

  it('asks once for runs that start together', async () => {
    const h = harness({ 'model/list': () => MODELS })
    await Promise.all([stream(NO_MODEL, callbacks().cb), stream(NO_MODEL, callbacks().cb)])
    expect(sent(h.child(), 'model/list')).toHaveLength(1)
    expect(models(h.child(), 'thread/start')).toEqual(['gpt-default', 'gpt-default'])
  })

  it('asks again after the process was replaced', async () => {
    let listed = 0
    const h = harness({
      'model/list': () => ({
        data: [{ id: `gpt-default-${++listed}`, isDefault: true }],
        nextCursor: null,
      }),
    })
    await stream(NO_MODEL, callbacks().cb)
    shutdownCodexAppServers()
    await stream(NO_MODEL, callbacks().cb)
    expect(h.children).toHaveLength(2)
    expect(models(h.children[0]!, 'thread/start')).toEqual(['gpt-default-1'])
    expect(sent(h.children[1]!, 'model/list')).toHaveLength(1)
    expect(models(h.children[1]!, 'thread/start')).toEqual(['gpt-default-2'])
  })

  it('passes a configured model on unchanged, without asking for the list', async () => {
    const h = harness({ 'model/list': () => MODELS })
    await stream({ apiKey: '', model: ' gpt-5.6-luna ' }, callbacks().cb)
    await chat(CONFIG)
    expect(h.child().methods()).not.toContain('model/list')
    expect(models(h.child(), 'thread/start')).toEqual(['gpt-5.6-luna', 'gpt-5.6-luna'])
  })

  it('keeps a session only while the model that runs stays the same', async () => {
    const h = harness({ 'model/list': () => MODELS })
    const history: Messages = [{ role: 'user', text: 'hi' }]
    const turn = async (model: string) => {
      await stream({ apiKey: '', model }, { ...callbacks().cb, sessionId: 'session-1' }, [
        ...history,
      ])
      history.push({ role: 'assistant', text: 'hello' }, { role: 'user', text: 'more' })
    }
    await turn('')
    await turn('')
    const child = h.child()
    expect(models(child, 'thread/start')).toEqual(['gpt-default'])
    // the default under its own name is the same model, so the same thread
    await turn('gpt-default')
    expect(models(child, 'thread/start')).toEqual(['gpt-default'])
    await turn('gpt-other')
    expect(models(child, 'thread/start')).toEqual(['gpt-default', 'gpt-other'])
    await turn('')
    expect(models(child, 'thread/start')).toEqual(['gpt-default', 'gpt-other', 'gpt-default'])
    expect(sent(child, 'model/list')).toHaveLength(1)
  })

  it.each([
    ['lists no model', { data: [], nextCursor: null }],
    ['lists only hidden models', { data: [{ id: 'gpt-hidden', hidden: true }], nextCursor: null }],
    ['answers with something else', null],
  ])('fails the run when Codex %s, and starts no thread', async (_label, list) => {
    const h = harness({ 'model/list': () => list })
    const error = await failure(stream(NO_MODEL, callbacks().cb))
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/default model/i)
    await expect(chat(NO_MODEL)).rejects.toThrow(/default model/i)
    expect(h.child().methods()).not.toContain('thread/start')
    expect(h.child().methods()).not.toContain('turn/start')
  })

  it.each([
    ['method not found', { code: -32601, message: 'Method not found' }],
    // what `codex app-server` answers for a method name it does not know
    ['invalid request', { code: -32600, message: 'Invalid request: unknown variant `model/list`' }],
  ])('reports a Codex that cannot list its models (%s) as needing an update', async (_l, reply) => {
    const h = harness({
      'model/list': () => {
        throw reply
      },
    })
    const error = await failure(stream(NO_MODEL, callbacks().cb))
    expect(error).toBeInstanceOf(AiRunError)
    expect(error).toMatchObject({ kind: 'needs-update', provider: 'codex' })
    expect(h.child().methods()).toContain('model/list')
    expect(h.child().methods()).not.toContain('thread/start')
  })

  it('fails the run when the list cannot be read, and asks again on the next run', async () => {
    let available = false
    const h = harness({
      'model/list': () => {
        if (!available) throw { code: -32000, message: 'unavailable' }
        return MODELS
      },
    })
    const error = await failure(stream(NO_MODEL, callbacks().cb))
    expect(error).not.toBeInstanceOf(AiRunError)
    expect((error as Error).message).toMatch(/default model/i)
    expect((error as Error).message).toContain('unavailable')
    expect(h.child().methods()).not.toContain('thread/start')
    available = true
    await stream(NO_MODEL, callbacks().cb)
    expect(sent(h.child(), 'model/list')).toHaveLength(2)
    expect(models(h.child(), 'thread/start')).toEqual(['gpt-default'])
  })

  it('checks the login before it asks for the list', async () => {
    const h = harness({
      'account/read': () => ({ account: null, requiresOpenaiAuth: true }),
      'model/list': () => MODELS,
    })
    expect(await failure(stream(NO_MODEL, callbacks().cb))).toMatchObject({
      kind: 'signed-out',
      provider: 'codex',
    })
    expect(h.child().methods()).not.toContain('model/list')
  })
})

describe('Codex effort', () => {
  const MODELS = {
    data: [
      {
        id: 'gpt-default',
        isDefault: true,
        supportedReasoningEfforts: [
          { reasoningEffort: 'low', description: '' },
          { reasoningEffort: 'high', description: '' },
        ],
      },
      { id: 'gpt-plain', isDefault: false },
    ],
    nextCursor: null,
  }
  type Messages = Parameters<typeof streamCodexAppServer>[2]
  const sent = (child: FakeCodex, method: string) =>
    child.requests.filter((request) => request.method === method)
  const efforts = (child: FakeCodex) =>
    sent(child, 'turn/start').map((request) => (request.params as { effort?: unknown }).effort)
  const stream = (
    config: { apiKey: string; model: string; effort?: string },
    cb: StreamCallbacks,
    messages: Messages = [{ role: 'user', text: 'hi' }],
  ) => streamCodexAppServer(config, 'system', messages, [], 1024, cb)

  it('names a configured level on the turn when the model takes it', async () => {
    const h = harness({ 'model/list': () => MODELS })
    await stream({ apiKey: '', model: 'gpt-default', effort: 'high' }, callbacks().cb)
    await stream({ apiKey: '', model: '', effort: 'low' }, callbacks().cb)
    const child = h.child()
    expect(efforts(child)).toEqual(['high', 'low'])
    // read once per process, and never put on the thread
    expect(sent(child, 'model/list')).toHaveLength(1)
    for (const request of sent(child, 'thread/start')) {
      expect(JSON.stringify(request.params)).not.toContain('effort')
    }
  })

  it('leaves the level out when the model does not take it or none is set', async () => {
    const h = harness({ 'model/list': () => MODELS })
    await stream({ apiKey: '', model: 'gpt-default', effort: 'max' }, callbacks().cb)
    await stream({ apiKey: '', model: 'gpt-plain', effort: 'high' }, callbacks().cb)
    await stream({ apiKey: '', model: 'gpt-unlisted', effort: 'high' }, callbacks().cb)
    await stream({ apiKey: '', model: 'gpt-default', effort: '--evil' }, callbacks().cb)
    await stream({ apiKey: '', model: 'gpt-default' }, callbacks().cb)
    const child = h.child()
    expect(efforts(child)).toEqual([undefined, undefined, undefined, undefined, undefined])
    for (const request of sent(child, 'turn/start')) {
      expect(request.params).not.toHaveProperty('effort')
    }
  })

  it('runs at the default level when the list cannot be read', async () => {
    const h = harness({
      'model/list': () => {
        throw { code: -32000, message: 'unavailable' }
      },
    })
    const { cb, deltas } = callbacks()
    await stream({ apiKey: '', model: 'gpt-default', effort: 'high' }, cb)
    expect(deltas).toEqual(['hello'])
    expect(sent(h.child(), 'turn/start')[0]!.params).not.toHaveProperty('effort')
  })

  it('starts a new thread when the level changes, since a turn level holds for the next turns', async () => {
    const h = harness({ 'model/list': () => MODELS })
    const history: Messages = [{ role: 'user', text: 'hi' }]
    const turn = async (effort?: string) => {
      await stream(
        { apiKey: '', model: 'gpt-default', ...(effort ? { effort } : {}) },
        { ...callbacks().cb, sessionId: 'session-1' },
        [...history],
      )
      history.push({ role: 'assistant', text: 'hello' }, { role: 'user', text: 'more' })
    }
    await turn('high')
    await turn('high')
    const child = h.child()
    expect(sent(child, 'thread/start')).toHaveLength(1)
    await turn('low')
    expect(sent(child, 'thread/start')).toHaveLength(2)
    // back to the default: the thread run at "low" would keep it
    await turn()
    expect(sent(child, 'thread/start')).toHaveLength(3)
    expect(efforts(child)).toEqual(['high', 'high', 'low', undefined])
  })
})

describe('Codex model list for the status', () => {
  const LIST = {
    data: [
      { id: 'gpt-hidden', model: 'gpt-hidden', displayName: 'Hidden', hidden: true },
      {
        id: 'gpt-next-codex',
        model: 'gpt-next-codex',
        displayName: 'GPT-Next-Codex',
        description: 'Latest agentic coding model',
        isDefault: true,
        supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: 'Balanced' }],
      },
      { id: 'gpt-next', model: 'gpt-next-2026-09-01', displayName: 'GPT-Next', isDefault: false },
      { model: 'gpt-mini' },
      { id: '--flag', displayName: 'Not an id' },
      'nonsense',
    ],
    nextCursor: null,
  }

  it('maps the entries Codex lists: id, display name, the concrete model, the default', () => {
    expect(codexSubscriptionModels(LIST.data)).toEqual([
      { id: 'gpt-next-codex', label: 'GPT-Next-Codex', isDefault: true, efforts: ['medium'] },
      { id: 'gpt-next', label: 'GPT-Next', resolved: 'gpt-next-2026-09-01' },
      { id: 'gpt-mini', label: 'gpt-mini' },
    ])
    expect(codexSubscriptionModels([])).toEqual([])
    expect(codexSubscriptionModels('nonsense')).toEqual([])
  })

  it('marks the first entry as the default when Codex flags none, as a run does', () => {
    expect(
      codexSubscriptionModels([
        { id: 'gpt-a', displayName: 'A' },
        { id: 'gpt-b', displayName: 'B' },
      ]),
    ).toEqual([
      { id: 'gpt-a', label: 'A', isDefault: true },
      { id: 'gpt-b', label: 'B' },
    ])
  })

  it('reads the list from the running app-server, with no thread and no turn', async () => {
    const h = harness({ 'model/list': () => LIST })
    const models = await listCodexSubscriptionModels()
    expect(models.map((model) => model.id)).toEqual(['gpt-next-codex', 'gpt-next', 'gpt-mini'])
    const methods = h.child().methods()
    expect(methods).toContain('model/list')
    expect(methods).not.toContain('thread/start')
    expect(methods).not.toContain('turn/start')
    // the list passes the bounds every status goes through
    expect(subscriptionModelsOf(models)).toEqual(models)
  })

  it('is what the status check asks for Codex models', async () => {
    harness({ 'model/list': () => LIST })
    const models = await listSubscriptionModels('codex')
    expect(models?.[0]).toEqual({
      id: 'gpt-next-codex',
      label: 'GPT-Next-Codex',
      isDefault: true,
      efforts: ['medium'],
    })
  })

  it('a Codex too old to list its models gives no list', async () => {
    harness()
    await expect(listCodexSubscriptionModels()).rejects.toThrow()
    expect(await listSubscriptionModels('codex')).toBeUndefined()
  })
})

describe('Codex after a login or logout the app ran', () => {
  it('ends an idle app-server, so the next request starts on the new login', async () => {
    const h = harness()
    await readCodexAccount(undefined)
    expect(h.children).toHaveLength(1)
    notifySubscriptionLoginChange('codex')
    expect(h.treeKills).toEqual([h.children[0]])
    await readCodexAccount(undefined)
    expect(h.children).toHaveLength(2)
  })

  it('lets a run in flight finish before the process is ended', async () => {
    let finishTurn: (() => void) | undefined
    const h = harness({
      'turn/start': (_params, child) => {
        finishTurn = () => completedTurn(ANSWER).forEach((message) => child.send(message))
        return { turn: { id: 't1' } }
      },
    })
    const { cb, deltas } = callbacks()
    const running = run(cb)
    await vi.waitFor(() => expect(finishTurn).toBeDefined())
    notifySubscriptionLoginChange('codex')
    expect(h.treeKills).toEqual([])
    finishTurn!()
    await running
    expect(deltas).toEqual(['hello'])
    expect(h.treeKills).toEqual([h.children[0]])
    // a request made meanwhile, or after, gets a process of its own
    await readCodexAccount(undefined)
    expect(h.children).toHaveLength(2)
  })

  it('leaves Codex alone when it was Claude that changed', async () => {
    const h = harness()
    await readCodexAccount(undefined)
    notifySubscriptionLoginChange('claude-code')
    expect(h.treeKills).toEqual([])
  })
})
