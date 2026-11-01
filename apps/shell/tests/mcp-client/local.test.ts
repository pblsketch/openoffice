/**
 * The person's own MCP servers started on this PC (user MCP spec 4.5, 5.3,
 * 5.5, 5.6): the exact command the confirmation shows is the one that runs,
 * without a shell, with a minimal environment, in an empty folder, and the
 * process (with whatever it started) ends with the connection.
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// each start of the fixture loads the MCP SDK, about two seconds on a slow disk
vi.setConfig({ testTimeout: 60_000 })
import {
  createSubscriptionChildRegistry,
  leftoverRecordFile,
  type SubscriptionChildRegistry,
} from '@genoffice/ai-provider/subscription'
import { planFingerprint, serverLaunchFingerprint } from '../../src/main/mcp-client/fingerprint'
import {
  MCP_LOCAL_SYSTEM_ENV,
  MCP_LOCAL_WINDOWS_ENV,
  plannedLaunch,
  type PlannedLaunch,
} from '../../src/main/mcp-client/local-launch'
import {
  createLocalMcpConnection,
  LocalMcpError,
  type LocalMcpConnection,
  type LocalMcpDeps,
} from '../../src/main/mcp-client/local'
import type { McpRuntimeKit, RuntimeResolution } from '../../src/main/mcp-client/runtimes'
import { newMcpServerConfig, type McpServerConfig } from '../../src/main/mcp-client/store'

const FIXTURE = resolve(__dirname, 'fixtures', 'stdio-mcp-server.mjs')
const CLIENT_INFO = { name: 'IeumOffice', version: '0.0.0-test' }

/** A kit that pairs `node` with this Node binary, as the PC's runtime */
function nodeKit(overrides: Record<string, RuntimeResolution> = {}): McpRuntimeKit & {
  asked: string[]
} {
  const asked: string[] = []
  return {
    asked,
    async resolveCommand(command) {
      asked.push(command)
      const override = overrides[command]
      if (override) return override
      if (command === 'node') {
        return {
          ok: true,
          command: process.execPath,
          prefixArgs: [],
          env: {},
          pathPrepend: [dirname(process.execPath)],
          source: 'pc',
          runtime: 'node',
        }
      }
      return {
        ok: false,
        reason: 'runtime-missing',
        detail: 'not-found',
        runtime: null,
        downloads: [],
        message: 'the program was not found on PATH',
      }
    },
  }
}

function localServer(
  input: { command?: string; args?: string[]; env?: Record<string, string> } = {},
  approve = true,
): McpServerConfig {
  const server = newMcpServerConfig({
    name: 'fixture',
    kind: 'local',
    command: input.command ?? 'node',
    args: input.args ?? [FIXTURE],
    env: input.env ?? {},
  })
  // the plan the person saw is filled in by `connect`, which knows the kit it resolves with
  return approve ? { ...server, approvedLaunch: serverLaunchFingerprint(server) } : server
}

/** The fingerprint of a plan that must be ready */
function readyFingerprint(plan: PlannedLaunch): string {
  if (!plan.ok) throw new Error(`no plan: ${plan.message}`)
  return planFingerprint(plan)
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitUntil(check: () => boolean, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return true
    await new Promise((done) => setTimeout(done, 50))
  }
  return check()
}

interface SpawnCall {
  command: string
  args: string[]
  options: SpawnOptions
}

/** The real spawn, with every call written down */
function recordingSpawn(): { calls: SpawnCall[]; spawn: NonNullable<LocalMcpDeps['spawn']> } {
  const calls: SpawnCall[] = []
  return {
    calls,
    spawn: (command, args, options) => {
      calls.push({ command, args: [...args], options })
      return spawn(command, args, options) as ChildProcess
    },
  }
}

const BASE_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GENOFFICE_SECRET_THING: 'genoffice-secret',
  ANTHROPIC_API_KEY: 'sk-ant-secret',
  OPENAI_API_KEY: 'sk-openai-secret',
  CLAUDE_CODE_OAUTH_TOKEN: 'oauth-secret',
  SOME_APP_TOKEN: 'app-secret',
}

const textOf = (result: { output: string }) => result.output

describe('the command that will run', () => {
  it('is the resolved program and the arguments as given, with names of the variables only', async () => {
    const plan = await plannedLaunch(
      localServer({ args: [FIXTURE, '--flag'], env: { MY_TOKEN: 'tok-value' } }),
      nodeKit(),
      { baseEnv: BASE_ENV },
    )
    expect(plan).toMatchObject({
      ok: true,
      command: process.execPath,
      args: [FIXTURE, '--flag'],
      addedArgs: [],
      source: 'pc',
      runtime: 'node',
    })
    const ready = plan as Extract<PlannedLaunch, { ok: true }>
    const names = ready.env.map((v) => v.name)
    expect(ready.env).toContainEqual({ name: 'MY_TOKEN', origin: 'registered' })
    expect(names).toContain('PATH')
    expect(names.some((n) => n.startsWith('GENOFFICE_'))).toBe(false)
    expect(names).not.toContain('ANTHROPIC_API_KEY')
    expect(names).not.toContain('SOME_APP_TOKEN')
    expect(JSON.stringify(plan)).not.toContain('tok-value')
  })

  it('runs npx through Node and npm’s script, and adds --yes so npx never stops to ask', async () => {
    const kit = nodeKit({
      npx: {
        ok: true,
        command: '/opt/node/bin/node',
        prefixArgs: ['/opt/node/lib/node_modules/npm/bin/npx-cli.js'],
        env: {},
        pathPrepend: ['/opt/node/bin'],
        source: 'app',
        runtime: 'node',
      },
    })
    const without = await plannedLaunch(
      localServer({ command: 'npx', args: ['some-mcp-server', '-y'] }),
      kit,
      { platform: 'linux', baseEnv: { PATH: '/usr/bin' } },
    )
    expect(without).toMatchObject({
      ok: true,
      command: '/opt/node/bin/node',
      args: ['/opt/node/lib/node_modules/npm/bin/npx-cli.js', '--yes', 'some-mcp-server', '-y'],
      addedArgs: ['--yes'],
    })
    for (const flag of ['-y', '--yes']) {
      const withFlag = await plannedLaunch(
        localServer({ command: 'npx', args: [flag, 'some-mcp-server'] }),
        kit,
        { platform: 'linux', baseEnv: { PATH: '/usr/bin' } },
      )
      expect(withFlag).toMatchObject({
        args: ['/opt/node/lib/node_modules/npm/bin/npx-cli.js', flag, 'some-mcp-server'],
        addedArgs: [],
      })
    }
    // `node` itself is never given --yes
    const node = await plannedLaunch(localServer({ args: ['x.js'] }), nodeKit(), {
      baseEnv: { PATH: '/usr/bin' },
    })
    expect(node).toMatchObject({ args: ['x.js'], addedArgs: [] })
  })

  it('marks what the app adds for its own uv and puts the runtime first on the child’s PATH', async () => {
    const kit = nodeKit({
      uvx: {
        ok: true,
        command: '/data/mcp-runtimes/uv-0.9/uvx',
        prefixArgs: [],
        env: { UV_PYTHON_INSTALL_DIR: '/data/py', UV_CACHE_DIR: '/data/cache' },
        pathPrepend: ['/data/mcp-runtimes/uv-0.9'],
        source: 'app',
        runtime: 'uv',
      },
    })
    const plan = await plannedLaunch(localServer({ command: 'uvx', args: ['srv'] }), kit, {
      platform: 'linux',
      baseEnv: { PATH: '/usr/bin', HOME: '/home/me' },
    })
    expect(plan).toMatchObject({ ok: true, command: '/data/mcp-runtimes/uv-0.9/uvx' })
    const ready = plan as Extract<PlannedLaunch, { ok: true }>
    expect(ready.env).toEqual(
      expect.arrayContaining([
        { name: 'PATH', origin: 'system' },
        { name: 'HOME', origin: 'system' },
        { name: 'UV_PYTHON_INSTALL_DIR', origin: 'app' },
        { name: 'UV_CACHE_DIR', origin: 'app' },
      ]),
    )
  })

  it('refuses a Windows .cmd or .bat it cannot run without a command window', async () => {
    for (const file of ['C:\\tools\\server.cmd', 'C:\\tools\\server.BAT', 'C:\\tools\\x.cmd. ']) {
      const kit = nodeKit({
        'my-server': {
          ok: true,
          command: file,
          prefixArgs: [],
          env: {},
          pathPrepend: [],
          source: 'pc',
          runtime: null,
        },
      })
      const plan = await plannedLaunch(localServer({ command: 'my-server', args: [] }), kit, {
        platform: 'win32',
        baseEnv: { PATH: 'C:\\Windows' },
      })
      expect(plan).toMatchObject({ ok: false, problem: 'needs-command-window' })
    }
  })

  it('reports a missing runtime as runtime-missing', async () => {
    const plan = await plannedLaunch(localServer({ command: 'nothing-here' }), nodeKit())
    expect(plan).toMatchObject({ ok: false, problem: 'runtime-missing' })
  })
})

describe('a running server', () => {
  let work: string
  let connections: LocalMcpConnection[]
  let registry: SubscriptionChildRegistry

  beforeEach(async () => {
    work = await mkdtemp(join(tmpdir(), 'user-mcp-local-'))
    connections = []
    registry = createSubscriptionChildRegistry()
  })
  afterEach(async () => {
    for (const connection of connections) await connection.stop()
    registry.shutdown()
    await rm(work, { recursive: true, force: true })
  })

  /**
   * A connection to `server`. A server whose command was approved gets the
   * plan the person would have seen (as the confirmation computes it with the
   * same kit), so it starts; one whose plan cannot be made gets a stand-in, so
   * the start reaches the reason it cannot run.
   */
  async function connect(
    server: McpServerConfig,
    deps: Partial<LocalMcpDeps> = {},
  ): Promise<LocalMcpConnection & { spawns: SpawnCall[] }> {
    const recorder = recordingSpawn()
    const connection = createLocalMcpConnection(server, {
      kit: nodeKit(),
      clientInfo: CLIENT_INFO,
      registry,
      baseEnv: BASE_ENV,
      workRoot: work,
      spawn: recorder.spawn,
      ...deps,
    })
    connections.push(connection)
    if (server.approvedLaunch !== null && server.approvedPlan === null) {
      const plan = await connection.plannedLaunch()
      connection.setServer({
        ...server,
        approvedPlan: plan.ok ? planFingerprint(plan) : 'sha256:no-plan',
      })
    }
    return Object.assign(connection, { spawns: recorder.calls })
  }

  it('starts at the first need, lists the tools and instructions, and calls a tool', async () => {
    const connection = await connect(localServer())
    expect(connection.status()).toEqual({ state: 'idle' })
    expect(connection.spawns).toHaveLength(0)
    const listing = await connection.listTools()
    expect(connection.status()).toEqual({ state: 'running' })
    expect(listing.instructions).toBe('Fixture server instructions.')
    expect(listing.tools.map((t) => t.name)).toContain('echo_args')
    expect(listing.tools.find((t) => t.name === 'pid')?.annotations).toEqual({
      readOnlyHint: true,
    })
    const pid = Number(textOf(await connection.callTool('pid', {})))
    expect(alive(pid)).toBe(true)
    // one process for every caller
    const again = Number(textOf(await connection.callTool('pid', {})))
    expect(again).toBe(pid)
    expect(connection.spawns).toHaveLength(1)
  })

  it('starts exactly the command the confirmation shows, without a shell, in an empty folder', async () => {
    const server = localServer({ env: { MY_TOKEN: 'tok-value' } })
    const connection = await connect(server)
    await connection.ensure()
    const plan = (await connection.plannedLaunch()) as Extract<PlannedLaunch, { ok: true }>
    expect(plan.ok).toBe(true)
    const [call] = connection.spawns
    expect(call!.command).toBe(plan.command)
    expect(call!.args).toEqual(plan.args)
    expect(Object.keys(call!.options.env!).sort()).toEqual(plan.env.map((v) => v.name).sort())
    expect(call!.options.shell).toBe(false)
    const where = JSON.parse(textOf(await connection.callTool('cwd', {})))
    expect(where.entries).toEqual([])
    expect(resolve(where.cwd).toLowerCase().startsWith(resolve(work).toLowerCase())).toBe(true)
  })

  it('passes shell characters in the arguments through as plain text', async () => {
    const tricky = [
      'a & echo pwned > pwned.txt',
      '$(whoami)',
      '`id`',
      '"quoted" \'single\'',
      '%PATH%',
      '| more',
      '; rm -rf x',
      '^&^|',
    ]
    const connection = await connect(localServer({ args: [FIXTURE, ...tricky] }))
    expect(JSON.parse(textOf(await connection.callTool('echo_args', {})))).toEqual(tricky)
    const where = JSON.parse(textOf(await connection.callTool('cwd', {})))
    expect(where.entries).toEqual([])
  })

  it('gives the server the minimal system variables and its registered ones, nothing of the app', async () => {
    const connection = await connect(
      localServer({ env: { MY_TOKEN: 'tok-value', GENOFFICE_INJECTED: 'x' } }),
    )
    const env = JSON.parse(textOf(await connection.callTool('env', {}))) as Record<string, string>
    expect(env.MY_TOKEN).toBe('tok-value')
    const names = Object.keys(env)
    expect(names.some((n) => n.toUpperCase().startsWith('GENOFFICE_'))).toBe(false)
    for (const secret of [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'SOME_APP_TOKEN',
    ]) {
      expect(names).not.toContain(secret)
    }
    const allowed = new Set(
      [...MCP_LOCAL_SYSTEM_ENV, ...MCP_LOCAL_WINDOWS_ENV, 'MY_TOKEN'].map((n) =>
        process.platform === 'win32' ? n.toUpperCase() : n,
      ),
    )
    const unexpected = names.filter(
      (name) => !allowed.has(process.platform === 'win32' ? name.toUpperCase() : name),
    )
    expect(unexpected).toEqual([])
    expect(env.PATH ?? env.Path).toContain(dirname(process.execPath))
  })

  it('does not start a server whose command was never approved or changed since', async () => {
    const never = await connect(localServer({}, false))
    await expect(never.ensure()).rejects.toMatchObject({ reason: 'review-required' })
    expect(never.status()).toEqual({ state: 'review-required' })
    const result = await never.callTool('pid', {})
    expect(result.isError).toBe(true)
    expect(never.spawns).toHaveLength(0)

    const approved = localServer()
    const changed = await connect({ ...approved, args: [...approved.args, '--extra'] })
    await expect(changed.ensure()).rejects.toBeInstanceOf(LocalMcpError)
    expect(changed.spawns).toHaveLength(0)
  })

  it('does not start when the program now resolves elsewhere than the plan the person allowed', async () => {
    // the person allowed the PC's Node; the PC's is gone and another copy answers instead
    const server = localServer()
    const allowedPlan = await plannedLaunch(server, nodeKit(), { baseEnv: BASE_ENV })
    const elsewhere = nodeKit({
      node: {
        ok: true,
        command: resolve(work, 'mcp-runtimes', 'node', 'node.exe'),
        prefixArgs: [],
        env: {},
        pathPrepend: [],
        source: 'app',
        runtime: 'node',
      },
    })
    const approved = { ...server, approvedPlan: readyFingerprint(allowedPlan) }
    const connection = await connect(approved, { kit: elsewhere })
    await expect(connection.ensure()).rejects.toMatchObject({ reason: 'review-required' })
    expect(connection.status()).toEqual({ state: 'review-required' })
    expect(connection.spawns).toHaveLength(0)
    // a setting that is not the approval leaves it waiting
    connection.setServer({ ...approved, keepResultsInside: false })
    expect(connection.status()).toEqual({ state: 'review-required' })
    // approving what would run now lets it go on to start
    const now = await connection.plannedLaunch()
    connection.setServer({ ...approved, approvedPlan: readyFingerprint(now) })
    expect(connection.status()).toEqual({ state: 'idle' })
  })

  it('stops a server whose command changes while it runs', async () => {
    const server = localServer()
    const connection = await connect(server)
    const pid = Number(textOf(await connection.callTool('pid', {})))
    connection.setServer({ ...server, command: 'node2' })
    expect(connection.status()).toEqual({ state: 'review-required' })
    expect(await waitUntil(() => !alive(pid))).toBe(true)
    expect(connection.spawns).toHaveLength(1)
  })

  it('refuses a .cmd without starting anything, until the person retries', async () => {
    const kit = nodeKit({
      'my-server': {
        ok: true,
        command: 'C:\\tools\\server.cmd',
        prefixArgs: [],
        env: {},
        pathPrepend: [],
        source: 'pc',
        runtime: null,
      },
    })
    const connection = await connect(localServer({ command: 'my-server', args: [] }), {
      kit,
      platform: 'win32',
    })
    await expect(connection.ensure()).rejects.toMatchObject({
      reason: 'start-failed',
      problem: 'needs-command-window',
    })
    expect(connection.status()).toMatchObject({
      state: 'failed',
      reason: 'start-failed',
      problem: 'needs-command-window',
    })
    expect(connection.spawns).toHaveLength(0)
  })

  it('stops after the idle time and starts again when needed', async () => {
    const connection = await connect(localServer(), { idleMs: 300 })
    const first = Number(textOf(await connection.callTool('pid', {})))
    expect(await waitUntil(() => !alive(first), 10_000)).toBe(true)
    expect(await waitUntil(() => connection.status().state === 'idle')).toBe(true)
    const second = Number(textOf(await connection.callTool('pid', {})))
    expect(second).not.toBe(first)
    expect(connection.spawns).toHaveLength(2)
  })

  it('starts again on the next call after the server crashed', async () => {
    const connection = await connect(localServer())
    const first = Number(textOf(await connection.callTool('pid', {})))
    const crashed = await connection.callTool('crash', {})
    expect(crashed.isError).toBe(true)
    expect(crashed.output).toContain('fixture')
    expect(await waitUntil(() => connection.status().state === 'idle')).toBe(true)
    const second = Number(textOf(await connection.callTool('pid', {})))
    expect(second).not.toBe(first)
  })

  it('after three failed starts in a row, waits for the person to retry', async () => {
    const connection = await connect(localServer({ args: [FIXTURE, '--fail-start'] }))
    for (let attempt = 1; attempt <= 3; attempt++) {
      await expect(connection.ensure()).rejects.toBeInstanceOf(LocalMcpError)
    }
    expect(connection.status()).toMatchObject({ state: 'failed', reason: 'start-failed' })
    expect(connection.spawns).toHaveLength(3)
    await expect(connection.ensure()).rejects.toMatchObject({ reason: 'start-failed' })
    expect((await connection.callTool('pid', {})).isError).toBe(true)
    expect(connection.spawns).toHaveLength(3)
    // the reason view shows the last lines the server wrote
    expect(connection.stderrTail().join('\n')).toContain('could not start')

    connection.retry()
    expect(connection.status()).toEqual({ state: 'idle' })
    await expect(connection.ensure()).rejects.toBeInstanceOf(LocalMcpError)
    expect(connection.spawns).toHaveLength(4)
  })

  it('keeps only the last lines of standard error, in memory, and logs nothing', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => undefined),
    )
    try {
      const connection = await connect(localServer({ args: [FIXTURE, '--chatty'] }))
      await connection.ensure()
      expect(
        await waitUntil(() => connection.stderrTail().at(-1) === 'chatty line 39', 5_000),
      ).toBe(true)
      const tail = connection.stderrTail()
      expect(tail.length).toBeLessThanOrEqual(20)
      expect(tail.join('\n')).not.toContain('stderr-secret-value')
      await connection.stop()
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })

  it('declares no capabilities and refuses sampling, roots and elicitation', async () => {
    const connection = await connect(localServer())
    expect(JSON.parse(textOf(await connection.callTool('caps', {})))).toEqual({})
    const asked = JSON.parse(textOf(await connection.callTool('ask_client', {})))
    // JSON-RPC "method not found"
    expect(asked).toEqual({
      sampling: { code: -32601 },
      roots: { code: -32601 },
      elicitation: { code: -32601 },
    })
  })

  it('hears that the tool list changed', async () => {
    const connection = await connect(localServer())
    const changed = vi.fn()
    connection.onToolsChanged(changed)
    await connection.callTool('add_tool', {})
    expect(await waitUntil(() => changed.mock.calls.length > 0, 5_000)).toBe(true)
    expect((await connection.listTools()).tools.map((t) => t.name)).toContain('added')
  })

  it('ends a call that takes too long, and one the caller stops', async () => {
    const connection = await connect(localServer(), { callTimeoutMs: 300 })
    const late = await connection.callTool('slow', { ms: 5_000 })
    expect(late.isError).toBe(true)
    expect(late.output).toMatch(/fixture/)
    expect(late.output).toMatch(/did not answer/)

    const patient = await connect(localServer())
    await patient.ensure()
    const controller = new AbortController()
    const call = patient.callTool('slow', { ms: 5_000 }, controller.signal)
    setTimeout(() => controller.abort(), 100)
    await expect(call).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('writes the server into the record of started programs, and takes it out when it stops', async () => {
    const dir = await mkdtemp(join(work, 'records-'))
    registry.recordIn(dir)
    const connection = await connect(localServer())
    const pid = Number(textOf(await connection.callTool('pid', {})))
    await registry.flushed()
    const record = JSON.parse(await readFile(leftoverRecordFile(dir), 'utf8'))
    expect(record.children).toEqual([
      expect.objectContaining({ pid, provider: 'user-mcp', command: process.execPath }),
    ])
    await connection.stop()
    await registry.flushed()
    expect(JSON.parse(await readFile(leftoverRecordFile(dir), 'utf8')).children).toEqual([])
    registry.recordIn(null)
  })

  it('ends the whole process tree when it stops, and the app’s shutdown does too', async () => {
    const connection = await connect(localServer())
    const pid = Number(textOf(await connection.callTool('pid', {})))
    const grandchild = Number(textOf(await connection.callTool('spawn_grandchild', {})))
    expect(alive(grandchild)).toBe(true)
    await connection.stop()
    expect(await waitUntil(() => !alive(pid) && !alive(grandchild))).toBe(true)
    expect(connection.status()).toEqual({ state: 'idle' })

    const other = await connect(localServer())
    const otherPid = Number(textOf(await other.callTool('pid', {})))
    const otherGrandchild = Number(textOf(await other.callTool('spawn_grandchild', {})))
    registry.shutdown()
    expect(await waitUntil(() => !alive(otherPid) && !alive(otherGrandchild))).toBe(true)
  })

  it('removes its working folder when the server ends', async () => {
    const connection = await connect(localServer())
    const where = JSON.parse(textOf(await connection.callTool('cwd', {})))
    expect(existsSync(where.cwd)).toBe(true)
    await connection.stop()
    expect(await waitUntil(() => !existsSync(where.cwd), 10_000)).toBe(true)
  })
})
