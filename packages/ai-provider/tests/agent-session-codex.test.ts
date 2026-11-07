/**
 * Agent mode on Codex, driven by a fake app-server: the thread's sandbox and
 * permissions, the login and MCP checks, approval requests and their answers.
 * Nothing here reaches a real `codex`.
 */
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import type { SpawnOptions } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import {
  codexAgentAction,
  codexAgentApprovalPolicy,
  codexAppMcpExtraTools,
  codexDeclineDecision,
  codexElicitationAnswer,
  codexAgentFilesystem,
  codexAgentLaunchArgs,
  codexAgentReadableDirs,
  codexAgentThreadParams,
  codexSandboxProbeArgs,
  codexSandboxProbeVerdict,
  startCodexAgentSession,
  type AgentSessionEvent,
  type CodexSandboxProbeResult,
  type CodexAgentDeps,
  type CodexAgentSessionOptions,
} from '../src/agent-session'
import type { SubscriptionProgram } from '../src/subscription'
import { CODEX_CONFIG_OVERRIDES, codexAppServerLaunchArgs } from '../src/codex-app-server'

const PROGRAM: SubscriptionProgram = {
  provider: 'codex',
  command: 'C:\\fake\\codex.exe',
  prefixArgs: [],
  env: {},
  entry: 'C:\\fake\\codex.exe',
  source: 'path',
}

type Handler = (server: FakeCodex, params: any, id: number) => unknown

class FakeCodex extends EventEmitter {
  readonly pid = 777
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly received: Array<Record<string, any>> = []
  readonly stdin: Writable
  exited = false
  private pending = ''

  constructor(private readonly handlers: Record<string, Handler>) {
    super()
    this.stdin = new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        this.pending += chunk.toString('utf8')
        const parts = this.pending.split('\n')
        this.pending = parts.pop() ?? ''
        for (const part of parts) if (part.trim()) this.receive(JSON.parse(part))
        done()
      },
    })
  }

  private receive(message: Record<string, any>): void {
    this.received.push(message)
    if (typeof message.method !== 'string' || message.id === undefined) return
    const handler = this.handlers[message.method]
    if (!handler) {
      this.send({ id: message.id, result: {} })
      return
    }
    const result = handler(this, message.params, message.id)
    if (result !== undefined) this.send({ id: message.id, result })
  }

  send(message: unknown): void {
    if (!this.exited) this.stdout.write(`${JSON.stringify(message)}\n`)
  }

  exit(code: number | null = 0): void {
    if (this.exited) return
    this.exited = true
    this.stdout.end()
    setImmediate(() => this.emit('close', code, null))
  }

  kill(): boolean {
    return true
  }
}

const baseHandlers = (overrides: Record<string, Handler> = {}): Record<string, Handler> => ({
  initialize: () => ({ userAgent: 'codex' }),
  'account/read': () => ({ account: { type: 'chatgpt', planType: 'plus' } }),
  'config/read': () => ({ config: { mcp_servers: { github: { command: 'x' } } } }),
  'model/list': () => ({ data: [{ id: 'gpt-x', isDefault: true }] }),
  'thread/start': (_server, params) => ({
    thread: { id: 'th1' },
    approvalPolicy: params.approvalPolicy,
    activePermissionProfile: { id: 'ieumoffice-agent' },
  }),
  'mcpServerStatus/list': () => ({
    data: [{ name: 'github', runtimeStatus: 'disabled', tools: {} }],
  }),
  'turn/start': () => ({ turn: { id: 'tu1' } }),
  ...overrides,
})

function options(overrides: Partial<CodexAgentSessionOptions> = {}): CodexAgentSessionOptions {
  return {
    projectRoot: 'C:\\Users\\me\\Project',
    mode: 'ask-commands',
    model: '',
    instructions: 'Answer in Korean.',
    openDocuments: ['C:\\Users\\me\\Project\\open.md'],
    protectedPaths: ['C:\\Users\\me\\.codex'],
    sessionDir: 'C:\\Temp\\session-2',
    meteredAccepted: false,
    ...overrides,
  }
}

async function start(
  handlers: Record<string, Handler>,
  overrides: Partial<CodexAgentSessionOptions> = {},
  probe: CodexSandboxProbeResult = 'contained',
  deps: Partial<CodexAgentDeps> = {},
) {
  const events: AgentSessionEvent[] = []
  const spawnCalls: Array<{ command: string; args: string[]; options: SpawnOptions }> = []
  let server!: FakeCodex
  const killTree = vi.fn((target: { pid?: number }) => {
    if (target === server) server.exit(null)
  })
  const probeSandbox = vi.fn(async () => probe)
  const run = startCodexAgentSession(options(overrides), (event) => events.push(event), {
    resolveProgram: async () => PROGRAM,
    probeSandbox,
    registry: null,
    platform: 'win32',
    baseEnv: { PATH: 'C:\\Windows', OPENAI_API_KEY: 'sk-no' },
    killTree,
    spawn: (command, args, spawnOptions) => {
      spawnCalls.push({ command, args, options: spawnOptions })
      server = new FakeCodex(handlers)
      return server
    },
    ...deps,
  })
  return { run, events, spawnCalls, killTree, probeSandbox, server: () => server }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

describe('the launch and the thread', () => {
  it('keeps the brain-only overrides, skill instructions included: the app lists the enabled skills', () => {
    const args = codexAgentLaunchArgs()
    expect(args).toContain('features.hooks=false')
    expect(args).toContain('features.plugins=false')
    expect(args[args.indexOf('skills.include_instructions=false') - 1]).toBe('-c')
    expect(args).not.toContain('skills.include_instructions=true')
    // web search follows the Codex app's default in an agent session, not the chat's "off"
    expect(args.filter((arg) => arg.startsWith('web_search='))).toEqual(['web_search="cached"'])
    expect(args.slice(-2)).toEqual(['--listen', 'stdio://'])
    // the MXC sandbox, explicitly: it fails rather than fall back to one that cannot deny the sign-in folder
    expect(args[args.indexOf('windows.sandbox="mxc"') - 1]).toBe('-c')
  })

  it('gives the chosen web search after every inherited override', () => {
    for (const choice of ['cached', 'live', 'disabled'] as const) {
      const args = codexAgentLaunchArgs(choice)
      const overrides = args.filter((_, index) => args[index - 1] === '-c')
      const inherited = CODEX_CONFIG_OVERRIDES.filter((o) => !o.startsWith('web_search='))
      expect(overrides.slice(0, inherited.length)).toEqual(inherited)
      expect(overrides[inherited.length]).toBe(`web_search="${choice}"`)
      expect(overrides.filter((o) => o.startsWith('web_search='))).toHaveLength(1)
    }
    // an unknown value is the default, never a raw string on the command line
    expect(codexAgentLaunchArgs('x"; evil' as never)).toContain('web_search="cached"')
  })

  it('leaves the chat window launch as it was: web search off, nothing added', () => {
    expect([...CODEX_CONFIG_OVERRIDES]).toEqual([
      'features.hooks=false',
      'features.plugins=false',
      'features.apps=false',
      'features.memories=false',
      'notify=[]',
      'history.persistence="none"',
      'model_provider="openai"',
      'openai_base_url=""',
      'skills.include_instructions=false',
      'web_search="disabled"',
    ])
    expect(codexAppServerLaunchArgs()).toEqual([
      'app-server',
      ...CODEX_CONFIG_OVERRIDES.flatMap((override) => ['-c', override]),
      '--listen',
      'stdio://',
    ])
  })

  it('opens the network of the profile only when commands may reach the internet', () => {
    const closed = codexAgentThreadParams(options(), 'gpt-x', {})
    expect((closed.config as any).permissions['ieumoffice-agent']).not.toHaveProperty('network')
    const open = codexAgentThreadParams(options({ network: true }), 'gpt-x', {})
    const profile = (open.config as any).permissions['ieumoffice-agent']
    expect(profile.network).toEqual({ enabled: true })
    // the file rules stay as they are, protected folders denied
    expect(profile.filesystem).toEqual(codexAgentFilesystem(options()))
    expect(profile.filesystem['C:\\Users\\me\\.codex']).toBe('deny')
    expect(open.approvalPolicy).toBe('untrusted')
  })

  it('maps each choice to an approval policy, never one where an approval leaves the sandbox', () => {
    expect(codexAgentApprovalPolicy('ask-commands')).toBe('untrusted')
    expect(codexAgentApprovalPolicy('ask-writes')).toBe('untrusted')
    expect(codexAgentApprovalPolicy('trust-project')).toBe('never')
    const params = codexAgentThreadParams(options({ mode: 'trust-project' }), 'gpt-x', {})
    expect(params).not.toHaveProperty('sandbox')
    expect((params.config as any).default_permissions).toBe('ieumoffice-agent')
  })

  it('reads the minimal set and the runtimes, writes the project, keeps open documents read-only and denies protected folders', () => {
    expect(codexAgentFilesystem(options(), ['C:\\Python314'])).toEqual({
      ':minimal': 'read',
      'C:\\Python314': 'read',
      'C:\\Users\\me\\Project': 'write',
      'C:\\Users\\me\\Project\\open.md': 'read',
      'C:\\Users\\me\\.codex': 'deny',
    })
  })

  it('lets the session read its skill copy', () => {
    const bundle = 'C:\\Users\\me\\AppData\\Local\\IeumOffice\\agent-skills'
    const filesystem = codexAgentFilesystem(options({ skillBundleDir: bundle }))
    expect(filesystem[bundle]).toBe('read')
    expect(filesystem['C:\\Users\\me\\.codex']).toBe('deny')
    const params = codexAgentThreadParams(options({ skillBundleDir: bundle }), 'gpt-x', {})
    expect((params.config as any).permissions['ieumoffice-agent'].filesystem[bundle]).toBe('read')
  })

  it('lets commands read the folders on PATH, but not a drive root, a protected folder or a missing one', () => {
    const dirs = codexAgentReadableDirs(
      [
        'C:\\Python314',
        'relative\\bin',
        'C:\\',
        'C:\\Users\\me\\.codex\\bin',
        '"C:\\Program Files\\nodejs"',
        'C:\\missing',
        'C:\\python314',
      ].join(';'),
      options(),
      'win32',
      (dir) => !dir.toLowerCase().includes('missing'),
    )
    expect(dirs).toEqual(['C:\\Python314', 'C:\\Program Files\\nodejs'])
  })

  it('keeps a PATH folder whose name starts with ".." out when it is in a protected folder or the project', () => {
    const dirs = codexAgentReadableDirs(
      ['C:\\Users\\me\\.codex\\..bin', 'C:\\Users\\me\\Project\\..tools', 'C:\\Python314'].join(
        ';',
      ),
      options(),
      'win32',
      () => true,
    )
    expect(dirs).toEqual(['C:\\Python314'])
  })

  it('switches user MCP servers off and adds the app one with its token', () => {
    const params = codexAgentThreadParams(
      options({ appMcp: { url: 'http://127.0.0.1:3093/mcp', token: 'tok' } }),
      'gpt-x',
      { github: { enabled: false } },
    )
    expect((params.config as any).mcp_servers).toEqual({
      github: { enabled: false },
      'ieumoffice-editor': {
        url: 'http://127.0.0.1:3093/mcp',
        http_headers: { Authorization: 'Bearer tok' },
        default_tools_approval_mode: 'approve',
      },
    })
    expect(params.developerInstructions).toBe('Answer in Korean.')
    expect(params.ephemeral).toBe(true)
  })

  it('answers only the tool approvals of the app server', () => {
    const approval = {
      serverName: 'ieumoffice-editor',
      mode: 'form',
      _meta: { codex_approval_kind: 'mcp_tool_call' },
    }
    expect(codexElicitationAnswer(approval).action).toBe('accept')
    expect(codexElicitationAnswer({ ...approval, serverName: 'github' }).action).toBe('decline')
    expect(codexElicitationAnswer({ ...approval, _meta: null }).action).toBe('decline')
    expect(codexDeclineDecision({})).toBe('decline')
    expect(codexDeclineDecision({ availableDecisions: ['accept', 'decline', 'cancel'] })).toBe(
      'decline',
    )
    expect(codexDeclineDecision({ availableDecisions: ['accept', 'cancel'] })).toBe('cancel')
  })

  it('keeps the full command for judging and its own reading only for display', () => {
    const action = codexAgentAction(
      'item/commandExecution/requestApproval',
      {
        command: String.raw`"C:\\WINDOWS\\powershell.exe" -Command "cmd /c echo ok"`,
        commandActions: [{ type: 'unknown', command: 'cmd /c echo ok' }],
      },
      new Map(),
    )
    expect(action.command).toBe(String.raw`"C:\\WINDOWS\\powershell.exe" -Command "cmd /c echo ok"`)
    expect(action.summary).toBe('cmd /c echo ok')
    expect(
      codexAgentAction('item/commandExecution/requestApproval', { command: 'dir' }, new Map())
        .summary,
    ).toBeUndefined()
  })

  it('probes with findstr on a readable and a denied marker, judged by their names', () => {
    const probeDir = join(String.raw`C:\Temp\s 1`, 'sandbox-probe')
    const { args, readable, denied } = codexSandboxProbeArgs(
      { ':minimal': 'read', [String.raw`C:\P`]: 'write' },
      probeDir,
    )
    expect(args.slice(0, 3)).toEqual(['sandbox', '-c', 'windows.sandbox="mxc"'])
    const table = args[6]!
    expect(table).toContain(`${JSON.stringify(probeDir)} = "read"`)
    expect(table).toContain(`${JSON.stringify(join(probeDir, 'denied'))} = "deny"`)
    expect(args.slice(-3)).toEqual(['ieumoffice-sandbox-probe', readable, denied])
    expect(args.some((arg) => arg.includes('network'))).toBe(false)
    const open = codexSandboxProbeArgs({ ':minimal': 'read' }, probeDir, true).args
    expect(open[open.indexOf('--') - 1]).toBe('permissions.ieumoffice-probe.network.enabled=true')
    expect(open[open.indexOf('--') - 2]).toBe('-c')
    // a Korean user folder comes back in the console code page: the names still match
    expect(
      codexSandboxProbeVerdict(String.raw`C:\Users\??\ieumoffice-probe-readable.txt` + '\r\n'),
    ).toBe('contained')
    expect(codexSandboxProbeVerdict(`${readable}\r\n${denied}\r\n`)).toBe('not-contained')
    expect(codexSandboxProbeVerdict('')).toBe('unavailable')
    expect(codexSandboxProbeVerdict('Error: unknown variant')).toBe('unavailable')
  })

  it('reads the paths of a file change from the item that announced it', () => {
    const action = codexAgentAction(
      'item/fileChange/requestApproval',
      { itemId: 'i1', reason: 'save' },
      new Map([['i1', ['C:\\Users\\me\\Project\\a.md']]]),
    )
    expect(action).toMatchObject({
      kind: 'write',
      paths: ['C:\\Users\\me\\Project\\a.md'],
      reason: 'save',
    })
  })
})

describe('starting a session', () => {
  it('opens a thread in the project folder, sanitised, after checking login and MCP', async () => {
    const { run, spawnCalls, server } = await start(baseHandlers())
    const session = await run
    expect(spawnCalls[0]!.options.cwd).toBe('C:\\Temp\\session-2')
    expect((spawnCalls[0]!.options.env ?? {}).OPENAI_API_KEY).toBeUndefined()
    const methods = server().received.map((message) => message.method)
    expect(methods).toEqual([
      'initialize',
      'initialized',
      'account/read',
      'config/read',
      'model/list',
      'thread/start',
      'mcpServerStatus/list',
    ])
    const thread = server().received.find((message) => message.method === 'thread/start')!
    expect(thread.params).toMatchObject({
      model: 'gpt-x',
      cwd: 'C:\\Users\\me\\Project',
      approvalPolicy: 'untrusted',
      config: { mcp_servers: { github: { enabled: false } } },
    })
    session.stop()
  })

  it('checks the sandbox with the session profile before Codex starts', async () => {
    const { run, probeSandbox, spawnCalls } = await start(baseHandlers())
    const session = await run
    const [filesystem, probeDir] = probeSandbox.mock.calls[0] as unknown as [
      Record<string, string>,
      string,
    ]
    expect(filesystem).toMatchObject({
      ':minimal': 'read',
      [String.raw`C:\Users\me\Project`]: 'write',
      [String.raw`C:\Users\me\.codex`]: 'deny',
    })
    expect(probeDir.startsWith(String.raw`C:\Temp\session-2`)).toBe(true)
    expect(spawnCalls).toHaveLength(1)
    session.stop()
  })

  it('starts Codex with the web search and the network chosen for the folder', async () => {
    const { run, spawnCalls, probeSandbox, server } = await start(baseHandlers(), {
      webSearch: 'live',
      network: true,
    })
    const session = await run
    expect(spawnCalls[0]!.args).toContain('web_search="live"')
    expect((probeSandbox.mock.calls[0] as unknown as unknown[])[2]).toBe(true)
    const thread = server().received.find((message) => message.method === 'thread/start')!
    expect(thread.params.config.permissions['ieumoffice-agent'].network).toEqual({ enabled: true })
    session.stop()
  })

  it('starts with cached search and no network for a folder with no choices', async () => {
    const { run, spawnCalls, probeSandbox, server } = await start(baseHandlers())
    const session = await run
    expect(spawnCalls[0]!.args).toContain('web_search="cached"')
    expect((probeSandbox.mock.calls[0] as unknown as unknown[])[2]).toBe(false)
    const thread = server().received.find((message) => message.method === 'thread/start')!
    expect(thread.params.config.permissions['ieumoffice-agent']).not.toHaveProperty('network')
    session.stop()
  })

  it('does not start with the network off when the sandbox cannot open it', async () => {
    const { run, spawnCalls } = await start(baseHandlers(), { network: true }, 'unavailable')
    await expect(run).rejects.toMatchObject({ kind: 'sandbox-unavailable' })
    expect(spawnCalls).toHaveLength(0)
  })

  it('refuses a thread that reports the network open when it was left off', async () => {
    const { run } = await start(
      baseHandlers({
        'thread/start': (_server, params) => ({
          thread: { id: 'th1' },
          approvalPolicy: params.approvalPolicy,
          activePermissionProfile: { id: 'ieumoffice-agent' },
          sandbox: { type: 'workspaceWrite', networkAccess: true },
        }),
      }),
    )
    await expect(run).rejects.toMatchObject({ kind: 'unsafe-tools' })
  })

  it('does not start when the sandbox cannot start, and says so', async () => {
    const { run, spawnCalls } = await start(baseHandlers(), {}, 'unavailable')
    await expect(run).rejects.toMatchObject({ kind: 'sandbox-unavailable' })
    expect(spawnCalls).toHaveLength(0)
  })

  it('does not start when the sandbox lets a denied folder be read', async () => {
    const { run, spawnCalls } = await start(baseHandlers(), {}, 'not-contained')
    await expect(run).rejects.toMatchObject({ kind: 'unsafe-tools' })
    expect(spawnCalls).toHaveLength(0)
  })

  it('refuses a metered login the person did not accept, before any thread', async () => {
    const { run, server } = await start(
      baseHandlers({ 'account/read': () => ({ account: { type: 'apiKey' } }) }),
    )
    await expect(run).rejects.toMatchObject({ kind: 'metered-not-accepted' })
    expect(server().received.some((message) => message.method === 'thread/start')).toBe(false)
  })

  it('runs a metered login the person accepted', async () => {
    const { run } = await start(
      baseHandlers({ 'account/read': () => ({ account: { type: 'apiKey' } }) }),
      { meteredAccepted: true },
    )
    const session = await run
    session.stop()
  })

  it('refuses a signed-out Codex', async () => {
    const { run } = await start(
      baseHandlers({ 'account/read': () => ({ requiresOpenaiAuth: true }) }),
    )
    await expect(run).rejects.toMatchObject({ kind: 'signed-out' })
  })

  it('refuses a thread that runs without the session permissions', async () => {
    const { run, killTree } = await start(
      baseHandlers({
        'thread/start': () => ({ thread: { id: 'th1' }, activePermissionProfile: null }),
      }),
    )
    await expect(run).rejects.toMatchObject({ kind: 'unsafe-tools' })
    expect(killTree).toHaveBeenCalled()
  })

  it('refuses a thread that runs under another approval policy than asked', async () => {
    const { run, killTree } = await start(
      baseHandlers({
        'thread/start': () => ({
          thread: { id: 'th1' },
          approvalPolicy: 'on-request',
          activePermissionProfile: { id: 'ieumoffice-agent' },
        }),
      }),
    )
    await expect(run).rejects.toMatchObject({ kind: 'unsafe-tools' })
    expect(killTree).toHaveBeenCalled()
  })

  it('refuses a thread with a user MCP server still attached', async () => {
    const { run } = await start(
      baseHandlers({
        'mcpServerStatus/list': () => ({
          data: [{ name: 'github', runtimeStatus: 'ready', tools: {} }],
        }),
      }),
    )
    await expect(run).rejects.toMatchObject({ kind: 'unsafe-tools' })
  })
})

describe('paths Codex reads as patterns', () => {
  it('does not start, before the sandbox check or Codex, when a path of the profile has [ ] * or ?', async () => {
    for (const overrides of [
      { projectRoot: 'C:\\Users\\me\\Project [draft]', openDocuments: [] },
      { openDocuments: ['C:\\Users\\me\\Desktop\\[final] report.hwp'] },
      { protectedPaths: ['C:\\Users\\me [x]\\.codex'] },
      { skillBundleDir: 'C:\\Temp\\skills?' },
    ] satisfies Array<Partial<CodexAgentSessionOptions>>) {
      const { run, spawnCalls, probeSandbox } = await start(baseHandlers(), overrides)
      await expect(run).rejects.toMatchObject({ problem: { type: 'unsupported-path' } })
      expect(probeSandbox).not.toHaveBeenCalled()
      expect(spawnCalls).toHaveLength(0)
    }
  })

  it('does not start on macOS either, where no sandbox check comes first', async () => {
    const { run, spawnCalls } = await start(
      baseHandlers(),
      {
        projectRoot: '/Users/me/Project',
        openDocuments: ['/Users/me/Desktop/[final] report.hwp'],
        protectedPaths: ['/Users/me/.codex'],
        sessionDir: '/tmp/session-2',
      },
      'contained',
      { platform: 'darwin', baseEnv: { PATH: '/usr/bin:/bin' } },
    )
    await expect(run).rejects.toMatchObject({ problem: { type: 'unsupported-path' } })
    expect(spawnCalls).toHaveLength(0)
  })

  it('leaves a PATH folder with such a name out of the folders commands may read', () => {
    const dirs = codexAgentReadableDirs(
      ['C:\\Tools[1]', 'C:\\Python314', 'C:\\What?'].join(';'),
      options(),
      'win32',
      () => true,
    )
    expect(dirs).toEqual(['C:\\Python314'])
  })
})

describe('why a session did not start', () => {
  it('names the step Codex refused, with its error code, and ends the process', async () => {
    const { run, killTree } = await start(
      baseHandlers({
        'thread/start': (fake, _params, id) => {
          fake.send({ id, error: { code: -32600, message: 'invalid profile at /Users/me' } })
          return undefined
        },
      }),
    )
    await expect(run).rejects.toMatchObject({
      problem: { type: 'refused', step: 'thread/start', code: -32600 },
    })
    expect(killTree).toHaveBeenCalled()
  })

  it('names Codex ending before the session was set up, with its exit code', async () => {
    const { run } = await start(
      baseHandlers({
        initialize: (fake) => {
          fake.stderr.write('error: unknown configuration key\n')
          fake.exit(2)
          return undefined
        },
      }),
    )
    await expect(run).rejects.toMatchObject({ problem: { type: 'exited', exitCode: 2 } })
  })

  it('names the step Codex did not answer in time', async () => {
    const { run } = await start(
      baseHandlers({ 'thread/start': () => undefined }),
      {},
      'contained',
      { threadStartTimeoutMs: 5 },
    )
    await expect(run).rejects.toMatchObject({
      problem: { type: 'no-answer', step: 'thread/start' },
    })
  })

  it('says when no model is set and Codex lists none', async () => {
    const { run } = await start(baseHandlers({ 'model/list': () => ({ data: [] }) }))
    await expect(run).rejects.toMatchObject({ problem: { type: 'no-model' } })
  })

  it('keeps the run errors Codex itself reports', async () => {
    const { run } = await start(
      baseHandlers({ 'account/read': () => ({ requiresOpenaiAuth: true }) }),
    )
    const error = await run.catch((failure: unknown) => failure)
    expect(error).toMatchObject({ kind: 'signed-out' })
    expect(error).not.toHaveProperty('problem')
  })
})

describe('the tools of the app server at the start', () => {
  it('starts when the app server lists only the session tools', async () => {
    const { run } = await start(
      baseHandlers({
        'mcpServerStatus/list': () => ({
          data: [
            { name: 'github', runtimeStatus: 'disabled', tools: {} },
            {
              name: 'ieumoffice-editor',
              runtimeStatus: 'ready',
              tools: { read_document: {}, propose_skill: {}, propose_skill_install: {} },
            },
          ],
        }),
      }),
    )
    await expect(run).resolves.toBeDefined()
  })

  it('refuses a thread whose app server lists a tool outside the 13', async () => {
    const { run, killTree } = await start(
      baseHandlers({
        'mcpServerStatus/list': () => ({
          data: [
            {
              name: 'ieumoffice-editor',
              runtimeStatus: 'ready',
              tools: { read_document: {}, create_docx: {} },
            },
          ],
        }),
      }),
    )
    await expect(run).rejects.toMatchObject({ kind: 'unsafe-tools' })
    expect(killTree).toHaveBeenCalled()
  })

  it('reads qualified and bare tool names alike', () => {
    expect(
      codexAppMcpExtraTools({
        data: [
          {
            name: 'ieumoffice-editor',
            tools: {
              'mcp__ieumoffice-editor__propose_skill': {},
              read_pdf: {},
              'mcp__ieumoffice-editor__use_skill': {},
            },
          },
          { name: 'other', tools: { anything: {} } },
        ],
      }),
    ).toEqual(['mcp__ieumoffice-editor__use_skill'])
  })
})

describe('a running session', () => {
  it('passes messages and tool lines on and ends the turn', async () => {
    const { run, events, server } = await start(
      baseHandlers({
        'turn/start': (fake) => {
          setImmediate(() => {
            fake.send({ method: 'turn/started', params: { turn: { id: 'tu1' } } })
            fake.send({
              method: 'item/started',
              params: {
                item: {
                  type: 'commandExecution',
                  id: 'c1',
                  command: 'dir',
                  cwd: 'C:\\Users\\me\\Project',
                },
              },
            })
            fake.send({
              method: 'item/completed',
              params: {
                item: { type: 'commandExecution', id: 'c1', command: 'dir', status: 'completed' },
              },
            })
            fake.send({
              method: 'item/completed',
              params: { item: { type: 'agentMessage', text: 'Done.' } },
            })
            fake.send({
              method: 'turn/completed',
              params: { turn: { id: 'tu1', status: 'completed' } },
            })
          })
          return { turn: { id: 'tu1' } }
        },
      }),
    )
    const session = await run
    await session.send('list the folder')
    await tick()
    await tick()
    expect(events).toEqual([
      { type: 'started', provider: 'codex', model: 'gpt-x', skills: [] },
      {
        type: 'tool',
        action: expect.objectContaining({ kind: 'command', command: 'dir' }),
        status: 'running',
      },
      {
        type: 'tool',
        action: expect.objectContaining({ kind: 'command', command: 'dir' }),
        status: 'done',
      },
      { type: 'text', text: 'Done.' },
      { type: 'turn-done', ok: true },
    ])
    expect(server().received.find((message) => message.method === 'turn/start')!.params).toEqual({
      threadId: 'th1',
      input: [{ type: 'text', text: 'list the folder', text_elements: [] }],
    })
    session.stop()
  })

  it('names a configured level on every turn when the model takes it, reading the list once', async () => {
    const listed = {
      data: [
        {
          id: 'gpt-x',
          isDefault: true,
          supportedReasoningEfforts: [{ reasoningEffort: 'high', description: '' }],
        },
      ],
    }
    const turns = async (effort: string | undefined, model = '') => {
      const { run, server } = await start(baseHandlers({ 'model/list': () => listed }), {
        effort,
        model,
      })
      const session = await run
      await session.send('one')
      await session.send('two').catch(() => undefined)
      const received = server().received
      session.stop()
      return {
        lists: received.filter((message) => message.method === 'model/list').length,
        efforts: received
          .filter((message) => message.method === 'turn/start')
          .map((message) => (message.params as { effort?: unknown }).effort),
        thread: received.find((message) => message.method === 'thread/start')!.params,
      }
    }
    const high = await turns('high')
    expect(high.lists).toBe(1)
    expect(high.efforts[0]).toBe('high')
    expect(JSON.stringify(high.thread)).not.toContain('effort')
    // a configured model reads the list only for the level
    expect((await turns('high', 'gpt-x')).lists).toBe(1)
    expect((await turns(undefined, 'gpt-x')).lists).toBe(0)
    // a level the model does not take, or no level, is left out
    expect((await turns('low')).efforts[0]).toBeUndefined()
    expect((await turns(undefined)).efforts[0]).toBeUndefined()
  })

  it('asks the person about a command that needs approval, and answers Codex', async () => {
    const { run, events, server } = await start(
      baseHandlers({
        'turn/start': (fake) => {
          setImmediate(() =>
            fake.send({
              id: 'srv-1',
              method: 'item/commandExecution/requestApproval',
              params: {
                itemId: 'c1',
                command: 'curl.exe https://example.com',
                reason: 'needs network',
              },
            }),
          )
          return { turn: { id: 'tu1' } }
        },
      }),
    )
    const session = await run
    await session.send('fetch')
    await tick()
    const asked = events.find((event) => event.type === 'permission')
    expect(asked).toMatchObject({
      request: { provider: 'codex', kind: 'command', reason: 'needs network' },
    })
    session.answer((asked as any).request.id, { allow: true })
    expect(server().received.at(-1)).toEqual({ id: 'srv-1', result: { decision: 'accept' } })
    session.stop()
  })

  it('declines a change to an open document without asking', async () => {
    const { run, events, server } = await start(
      baseHandlers({
        'turn/start': (fake) => {
          setImmediate(() => {
            fake.send({
              method: 'item/started',
              params: {
                item: {
                  type: 'fileChange',
                  id: 'f1',
                  changes: [{ path: 'C:\\Users\\me\\Project\\open.md', kind: 'update', diff: '' }],
                },
              },
            })
            fake.send({
              id: 'srv-2',
              method: 'item/fileChange/requestApproval',
              params: { itemId: 'f1' },
            })
          })
          return { turn: { id: 'tu1' } }
        },
      }),
    )
    const session = await run
    await session.send('edit')
    await tick()
    await tick()
    expect(server().received.at(-1)).toEqual({ id: 'srv-2', result: { decision: 'decline' } })
    expect(events.some((event) => event.type === 'permission')).toBe(false)
    session.stop()
  })

  it('refuses with cancel when the request does not offer decline', async () => {
    const { run, server } = await start(
      baseHandlers({
        'turn/start': (fake) => {
          setImmediate(() =>
            fake.send({
              id: 'srv-5',
              method: 'item/commandExecution/requestApproval',
              params: {
                itemId: 'c1',
                command: 'type C:\\Users\\me\\.codex\\config.toml',
                availableDecisions: ['accept', 'cancel'],
              },
            }),
          )
          return { turn: { id: 'tu1' } }
        },
      }),
    )
    const session = await run
    await session.send('x')
    await tick()
    expect(server().received.at(-1)).toEqual({ id: 'srv-5', result: { decision: 'cancel' } })
    session.stop()
  })

  it('allows the app tools when Codex asks before calling them, and declines other forms', async () => {
    const { run, server } = await start(
      baseHandlers({
        'turn/start': (fake) => {
          setImmediate(() => {
            fake.send({
              id: 'srv-6',
              method: 'mcpServer/elicitation/request',
              params: {
                serverName: 'ieumoffice-editor',
                mode: 'form',
                _meta: { codex_approval_kind: 'mcp_tool_call' },
                message: 'Allow?',
                requestedSchema: { type: 'object', properties: {} },
              },
            })
            fake.send({
              id: 'srv-7',
              method: 'mcpServer/elicitation/request',
              params: { serverName: 'ieumoffice-editor', mode: 'url', url: 'https://x' },
            })
          })
          return { turn: { id: 'tu1' } }
        },
      }),
    )
    const session = await run
    await session.send('x')
    await tick()
    await tick()
    const replies = server().received.filter(
      (message) => message.id === 'srv-6' || message.id === 'srv-7',
    )
    expect(replies).toEqual([
      { id: 'srv-6', result: { action: 'accept', content: {}, _meta: null } },
      { id: 'srv-7', result: { action: 'decline', content: null, _meta: null } },
    ])
    session.stop()
  })

  it('refuses requests it does not grant, such as wider permissions or sign-in tokens', async () => {
    const { run, server } = await start(
      baseHandlers({
        'turn/start': (fake) => {
          setImmediate(() => {
            fake.send({ id: 'srv-3', method: 'item/permissions/requestApproval', params: {} })
            fake.send({ id: 'srv-4', method: 'account/chatgptAuthTokens/refresh', params: {} })
          })
          return { turn: { id: 'tu1' } }
        },
      }),
    )
    const session = await run
    await session.send('x')
    await tick()
    await tick()
    const replies = server().received.filter(
      (message) => message.id === 'srv-3' || message.id === 'srv-4',
    )
    expect(replies).toHaveLength(2)
    for (const reply of replies) expect(reply.error).toMatchObject({ code: -32601 })
    session.stop()
  })

  it('reports a failed turn with its kind', async () => {
    const { run, events } = await start(
      baseHandlers({
        'turn/start': (fake) => {
          setImmediate(() =>
            fake.send({
              method: 'turn/completed',
              params: {
                turn: {
                  id: 'tu1',
                  status: 'failed',
                  error: { message: 'usage limit', codexErrorInfo: 'usageLimitExceeded' },
                },
              },
            }),
          )
          return { turn: { id: 'tu1' } }
        },
      }),
    )
    const session = await run
    await session.send('x')
    await tick()
    expect(events).toContainEqual({ type: 'turn-done', ok: false })
    expect(events).toContainEqual(expect.objectContaining({ type: 'error' }))
    session.stop()
  })

  it('stops a switched-off MCP server that starts anyway', async () => {
    const { run, events } = await start(
      baseHandlers({
        'turn/start': (fake) => {
          setImmediate(() =>
            fake.send({
              method: 'mcpServer/startupStatus/updated',
              params: { name: 'github', status: 'starting' },
            }),
          )
          return { turn: { id: 'tu1' } }
        },
      }),
    )
    const session = await run
    await session.send('x')
    await tick()
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', kind: 'unsafe-tools' }))
    expect(events.at(-1)).toEqual({ type: 'ended' })
  })

  it('ends the process tree when stopped', async () => {
    const { run, killTree, events } = await start(baseHandlers())
    const session = await run
    session.stop()
    session.stop()
    expect(killTree).toHaveBeenCalledTimes(1)
    expect(events.filter((event) => event.type === 'ended')).toHaveLength(1)
  })
})

describe('relays of the person’s MCP servers (user MCP spec 9)', () => {
  const RELAYS = [
    { name: 'law', url: 'http://127.0.0.1:4100/mcp', token: 'relay-tok', tools: ['search'] },
  ]

  it('adds each relay with its session token and approve mode, over a same-named user server', () => {
    const params = codexAgentThreadParams(
      options({
        appMcp: { url: 'http://127.0.0.1:3093/mcp', token: 'tok' },
        userMcpRelays: RELAYS,
      }),
      'gpt-x',
      { github: { enabled: false }, law: { enabled: false } },
    )
    expect((params.config as any).mcp_servers).toEqual({
      github: { enabled: false },
      law: {
        url: 'http://127.0.0.1:4100/mcp',
        http_headers: { Authorization: 'Bearer relay-tok' },
        default_tools_approval_mode: 'approve',
      },
      'ieumoffice-editor': {
        url: 'http://127.0.0.1:3093/mcp',
        http_headers: { Authorization: 'Bearer tok' },
        default_tools_approval_mode: 'approve',
      },
    })
  })

  it('never lets a relay take the app server name', () => {
    const params = codexAgentThreadParams(
      options({
        userMcpRelays: [{ name: 'ieumoffice-editor', url: 'http://x/mcp', token: 'r', tools: [] }],
      }),
      'gpt-x',
      {},
    )
    expect((params.config as any).mcp_servers).toEqual({})
  })

  it('answers the tool approvals of a relay as of the app server, and declines others', () => {
    const approval = {
      serverName: 'law',
      mode: 'form',
      _meta: { codex_approval_kind: 'mcp_tool_call' },
    }
    expect(codexElicitationAnswer(approval, RELAYS).action).toBe('accept')
    expect(codexElicitationAnswer(approval).action).toBe('decline')
    expect(codexElicitationAnswer({ ...approval, serverName: 'github' }, RELAYS).action).toBe(
      'decline',
    )
    expect(codexElicitationAnswer({ ...approval, mode: 'url' }, RELAYS).action).toBe('decline')
  })

  it('counts a relay tool it did not list as extra, by bare or qualified name', () => {
    expect(
      codexAppMcpExtraTools(
        {
          data: [
            { name: 'law', tools: { search: {}, mcp__law__search: {}, delete_all: {} } },
            { name: 'other', tools: { anything: {} } },
          ],
        },
        RELAYS,
      ),
    ).toEqual(['delete_all'])
  })

  it('starts with the relay attached, and asks Codex with the relay over the user server', async () => {
    const { run, server } = await start(
      baseHandlers({
        'config/read': () => ({
          config: { mcp_servers: { github: { command: 'x' }, law: { command: 'y' } } },
        }),
        'mcpServerStatus/list': () => ({
          data: [
            { name: 'github', runtimeStatus: 'disabled', tools: {} },
            { name: 'law', runtimeStatus: 'ready', tools: { search: {} } },
          ],
        }),
      }),
      { userMcpRelays: RELAYS },
    )
    const session = await run
    const thread = server().received.find((m) => m.method === 'thread/start')
    expect(thread?.params.config.mcp_servers.law).toEqual({
      url: 'http://127.0.0.1:4100/mcp',
      http_headers: { Authorization: 'Bearer relay-tok' },
      default_tools_approval_mode: 'approve',
    })
    session.stop()
  })

  it('refuses a thread whose relay lists a tool it did not list, or another server', async () => {
    const extra = await start(
      baseHandlers({
        'mcpServerStatus/list': () => ({
          data: [{ name: 'law', runtimeStatus: 'ready', tools: { search: {}, delete_all: {} } }],
        }),
      }),
      { userMcpRelays: RELAYS },
    )
    await expect(extra.run).rejects.toMatchObject({ kind: 'unsafe-tools' })
    const foreign = await start(
      baseHandlers({
        'mcpServerStatus/list': () => ({
          data: [{ name: 'github', runtimeStatus: 'ready', tools: {} }],
        }),
      }),
      { userMcpRelays: RELAYS },
    )
    await expect(foreign.run).rejects.toMatchObject({ kind: 'unsafe-tools' })
  })

  it('lets a relay start during the session, and stops on any other server', async () => {
    const starting = (name: string) => (fake: FakeCodex) => {
      setImmediate(() =>
        fake.send({
          method: 'mcpServer/startupStatus/updated',
          params: { name, status: 'starting' },
        }),
      )
      return { turn: { id: 'tu1' } }
    }
    const relay = await start(baseHandlers({ 'turn/start': starting('law') }), {
      userMcpRelays: RELAYS,
    })
    const ok = await relay.run
    await ok.send('x')
    await tick()
    expect(relay.events.some((event) => event.type === 'error')).toBe(false)
    ok.stop()
    const other = await start(baseHandlers({ 'turn/start': starting('github') }), {
      userMcpRelays: RELAYS,
    })
    const stopped = await other.run
    await stopped.send('x')
    await tick()
    expect(other.events).toContainEqual(
      expect.objectContaining({ type: 'error', kind: 'unsafe-tools' }),
    )
  })
})
