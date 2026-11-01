/**
 * Agent mode on Claude Code, driven by a fake CLI: the command line, the
 * session files, the tool-list check, permission prompts and their answers,
 * and stopping. Nothing here reaches a real `claude`.
 */
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import type { SpawnOptions } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import {
  AGENT_APP_MCP_TOOLS,
  CLAUDE_AGENT_TOOLS,
  agentUsableRelays,
  claudeAgentAction,
  claudeAgentInitProblem,
  claudeAgentLaunchArgs,
  claudeAgentSettings,
  claudeRulePath,
  startClaudeAgentSession,
  type AgentSessionEvent,
  type AgentSessionOptions,
} from '../src/agent-session'
import type { SubscriptionProgram } from '../src/subscription'

const PROGRAM: SubscriptionProgram = {
  provider: 'claude-code',
  command: 'C:\\fake\\claude.exe',
  prefixArgs: [],
  env: {},
  entry: 'C:\\fake\\claude.exe',
  source: 'path',
}

class FakeClaude extends EventEmitter {
  readonly pid = 4242
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly lines: Array<Record<string, any>> = []
  readonly stdin: Writable
  exited = false
  private pending = ''

  constructor(private readonly onLine: (child: FakeClaude, line: Record<string, any>) => void) {
    super()
    this.stdin = new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        this.pending += chunk.toString('utf8')
        const parts = this.pending.split('\n')
        this.pending = parts.pop() ?? ''
        for (const part of parts) {
          if (!part.trim()) continue
          const line = JSON.parse(part) as Record<string, any>
          this.lines.push(line)
          this.onLine(this, line)
        }
        done()
      },
    })
  }

  send(...events: unknown[]): void {
    for (const event of events) if (!this.exited) this.stdout.write(`${JSON.stringify(event)}\n`)
  }

  exit(code: number | null = 0): void {
    if (this.exited) return
    this.exited = true
    this.stdout.end()
    this.stderr.end()
    setImmediate(() => this.emit('close', code, null))
  }

  kill(): boolean {
    return true
  }
}

const INIT = {
  type: 'system',
  subtype: 'init',
  tools: [
    'Bash',
    'Edit',
    'Glob',
    'Grep',
    'PowerShell',
    'Read',
    'Skill',
    'WebFetch',
    'WebSearch',
    'Write',
  ],
  mcp_servers: [],
  model: 'claude-test',
  skills: ['ieum-skills:probe'],
}

function options(overrides: Partial<AgentSessionOptions> = {}): AgentSessionOptions {
  return {
    projectRoot: 'C:\\Users\\me\\Project',
    mode: 'ask-commands',
    model: '',
    instructions: 'Answer in Korean.',
    openDocuments: ['C:\\Users\\me\\Project\\open.md'],
    protectedPaths: ['C:\\Users\\me\\.codex'],
    sessionDir: 'C:\\Temp\\session-1',
    ...overrides,
  }
}

interface Harness {
  child: FakeClaude
  events: AgentSessionEvent[]
  spawnCalls: Array<{ command: string; args: string[]; options: SpawnOptions }>
  files: Map<string, string>
  killTree: ReturnType<typeof vi.fn>
}

async function start(
  onUser: (child: FakeClaude, line: Record<string, any>) => void,
  overrides: Partial<AgentSessionOptions> = {},
  onOther?: (child: FakeClaude, line: Record<string, any>) => void,
) {
  const events: AgentSessionEvent[] = []
  const spawnCalls: Harness['spawnCalls'] = []
  const files = new Map<string, string>()
  let child!: FakeClaude
  const killTree = vi.fn((target: { pid?: number }) => {
    if (target === child) child.exit(null)
  })
  const session = await startClaudeAgentSession(options(overrides), (event) => events.push(event), {
    resolveProgram: async () => PROGRAM,
    registry: null,
    platform: 'win32',
    baseEnv: { PATH: 'C:\\Windows', ANTHROPIC_API_KEY: 'sk-should-not-pass' },
    killTree,
    writeFile: async (path, data) => {
      files.set(path, data)
    },
    spawn: (command, args, spawnOptions) => {
      spawnCalls.push({ command, args, options: spawnOptions })
      child = new FakeClaude((fake, line) => {
        if (line.type === 'control_request' && line.request?.subtype === 'initialize') {
          fake.send({
            type: 'control_response',
            response: { subtype: 'success', request_id: line.request_id, response: {} },
          })
        } else if (line.type === 'user') onUser(fake, line)
        else onOther?.(fake, line)
      })
      return child
    },
  })
  return { session, harness: { child, events, spawnCalls, files, killTree } as Harness }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

describe('the command line and the session files', () => {
  it('turns on the agent tools, keeps user settings out, and puts no path or token on it', () => {
    const args = claudeAgentLaunchArgs({
      model: 'sonnet',
      mode: 'ask-commands',
      settingsFile: 'C:\\Temp\\s\\claude-settings.json',
      mcpConfigFile: 'C:\\Temp\\s\\claude-mcp.json',
      skillBundleDir: 'C:\\Temp\\skills',
    })
    expect(args).toEqual([
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--restricted',
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--tools',
      'Read,Edit,Write,Glob,Grep,Bash,PowerShell,Skill,WebSearch,WebFetch',
      '--permission-prompts',
      'host',
      '--permission-prompt-tool',
      'stdio',
      '--permission-mode',
      'default',
      '--settings',
      'C:\\Temp\\s\\claude-settings.json',
      '--mcp-config',
      'C:\\Temp\\s\\claude-mcp.json',
      '--plugin-dir',
      'C:\\Temp\\skills',
      '--add-dir',
      'C:\\Temp\\skills',
      '--no-session-persistence',
      '--model',
      'sonnet',
    ])
    expect(args).not.toContain('--dangerously-skip-permissions')
    expect(args).not.toContain('bypassPermissions')
  })

  it('runs a trusted project in the CLI auto mode, never bypassing permissions', () => {
    const args = claudeAgentLaunchArgs({ model: '', mode: 'trust-project', settingsFile: 's.json' })
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('auto')
    expect(args).not.toContain('--model')
  })

  it('refuses a model name that could read as something else', () => {
    expect(() =>
      claudeAgentLaunchArgs({ model: '--evil', mode: 'ask-commands', settingsFile: 's.json' }),
    ).toThrow(/Invalid Claude Code model name/)
  })

  it('writes Windows paths in the rule form and skips paths a rule cannot carry', () => {
    expect(claudeRulePath('C:\\Users\\me\\.codex', 'win32')).toBe('//c/Users/me/.codex')
    expect(claudeRulePath('C:\\a (1)\\b.md', 'win32')).toBeUndefined()
    expect(claudeRulePath('/home/me/.codex', 'linux')).toBe('//home/me/.codex')
  })

  it('blocks reads outside the folder, protected folders, and writes to open documents', () => {
    const settings = claudeAgentSettings(
      { openDocuments: ['C:\\P\\open.md'], protectedPaths: ['C:\\Users\\me\\.codex'] },
      'win32',
    )
    expect(settings).toEqual({
      permissions: {
        blockReadsOutsideWorkingDirectories: true,
        deny: [
          'Read(//c/Users/me/.codex)',
          'Read(//c/Users/me/.codex/**)',
          'Edit(//c/Users/me/.codex)',
          'Edit(//c/Users/me/.codex/**)',
          'Write(//c/Users/me/.codex)',
          'Write(//c/Users/me/.codex/**)',
          'Edit(//c/P/open.md)',
          'Write(//c/P/open.md)',
        ],
      },
    })
  })
})

describe('the tools the session turns on', () => {
  it('are the eight file, command and skill tools and the two web tools, nothing else', () => {
    expect([...CLAUDE_AGENT_TOOLS]).toEqual([
      'Read',
      'Edit',
      'Write',
      'Glob',
      'Grep',
      'Bash',
      'PowerShell',
      'Skill',
      'WebSearch',
      'WebFetch',
    ])
  })
})

describe('what the CLI reports at the start', () => {
  it('accepts the tools it was given and the app MCP server', () => {
    expect(claudeAgentInitProblem(INIT)).toBeUndefined()
    expect(
      claudeAgentInitProblem({
        ...INIT,
        tools: [...INIT.tools, 'mcp__ieumoffice-editor__read_document'],
        mcp_servers: [{ name: 'ieumoffice-editor', status: 'connected' }],
      }),
    ).toBeUndefined()
  })

  it('refuses any other tool or MCP server', () => {
    expect(claudeAgentInitProblem({ ...INIT, tools: [...INIT.tools, 'Agent'] })).toMatch(/tools/)
    expect(claudeAgentInitProblem({ ...INIT, tools: [...INIT.tools, 'NotebookEdit'] })).toMatch(
      /tools/,
    )
    expect(
      claudeAgentInitProblem({ ...INIT, tools: [...INIT.tools, 'mcp__github__create_issue'] }),
    ).toMatch(/tools/)
    expect(
      claudeAgentInitProblem({ ...INIT, mcp_servers: [{ name: 'github', status: 'connected' }] }),
    ).toMatch(/MCP server/)
    expect(claudeAgentInitProblem({ ...INIT, tools: undefined })).toMatch(/tool list/)
  })

  it('accepts each of the 13 app tools by name and nothing else of the app server', () => {
    expect([...AGENT_APP_MCP_TOOLS]).toEqual([
      'open_documents',
      'read_document',
      'insert_content',
      'replace_blocks',
      'apply_ops',
      'read_sheet',
      'apply_sheet_ops',
      'read_deck',
      'apply_slide_ops',
      'read_hwp',
      'read_pdf',
      'propose_skill',
      'propose_skill_install',
    ])
    const server = [{ name: 'ieumoffice-editor', status: 'connected' }]
    expect(
      claudeAgentInitProblem({
        ...INIT,
        tools: [...INIT.tools, ...AGENT_APP_MCP_TOOLS.map((t) => `mcp__ieumoffice-editor__${t}`)],
        mcp_servers: server,
      }),
    ).toBeUndefined()
    for (const outside of ['create_docx', 'close_document', 'use_skill', 'save_session']) {
      expect(
        claudeAgentInitProblem({
          ...INIT,
          tools: [...INIT.tools, `mcp__ieumoffice-editor__${outside}`],
          mcp_servers: server,
        }),
      ).toMatch(/tools/)
    }
  })

  it('reads what each tool call does', () => {
    expect(claudeAgentAction('Write', { file_path: 'a.md', content: 'x' })).toMatchObject({
      kind: 'write',
      paths: ['a.md'],
    })
    expect(claudeAgentAction('PowerShell', { command: 'dir', description: 'list' })).toMatchObject({
      kind: 'command',
      command: 'dir',
      reason: 'list',
    })
    expect(claudeAgentAction('mcp__ieumoffice-editor__apply_ops', {})).toMatchObject({
      kind: 'app-tool',
    })
    expect(claudeAgentAction('WebSearch', { query: 'tide tables' })).toEqual({
      kind: 'web-search',
      tool: 'WebSearch',
      target: 'tide tables',
      paths: [],
    })
    expect(
      claudeAgentAction('WebFetch', { url: 'https://Docs.Example.com/a?b=1', prompt: 'x' }),
    ).toEqual({
      kind: 'web-fetch',
      tool: 'WebFetch',
      target: 'https://Docs.Example.com/a?b=1',
      host: 'docs.example.com',
      paths: [],
    })
    // an address that is not http(s) has no site to remember
    expect(claudeAgentAction('WebFetch', { url: 'file:///C:/a.txt' }).host).toBeUndefined()
  })
})

describe('a session', () => {
  it('starts in the project folder, sanitised, with its instructions in the setup request', async () => {
    const { session, harness } = await start(() => undefined, {
      appMcp: { url: 'http://127.0.0.1:3093/mcp', token: 'tok-123' },
    })
    const call = harness.spawnCalls[0]!
    expect(call.command).toBe('C:\\fake\\claude.exe')
    expect(call.options.cwd).toBe('C:\\Users\\me\\Project')
    expect(call.options.shell).toBeFalsy()
    expect((call.options.env ?? {}).ANTHROPIC_API_KEY).toBeUndefined()
    expect(call.args.join(' ')).not.toContain('tok-123')
    // the session joins with the host's separator, so the key is built the same way
    expect(harness.files.get(join('C:\\Temp\\session-1', 'claude-mcp.json'))).toContain(
      'Bearer tok-123',
    )
    expect(harness.child.lines[0]).toMatchObject({
      type: 'control_request',
      request: { subtype: 'initialize', appendSystemPrompt: 'Answer in Korean.' },
    })
    session.stop()
  })

  it('passes text and tool lines on, and ends a turn on the result', async () => {
    const { session, harness } = await start((child) => {
      child.send(
        INIT,
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Looking.' },
              { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a.md' } },
            ],
          },
        },
        {
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
        },
        { type: 'result', subtype: 'success', is_error: false, result: 'done' },
      )
    })
    await session.send('Summarise a.md')
    await tick()
    expect(harness.events).toEqual([
      {
        type: 'started',
        provider: 'claude-code',
        model: 'claude-test',
        skills: ['ieum-skills:probe'],
      },
      { type: 'text', text: 'Looking.' },
      {
        type: 'tool',
        action: expect.objectContaining({ kind: 'read', tool: 'Read' }),
        status: 'running',
      },
      {
        type: 'tool',
        action: expect.objectContaining({ kind: 'read', tool: 'Read' }),
        status: 'done',
      },
      { type: 'turn-done', ok: true },
    ])
    expect(harness.child.lines.at(-1)).toMatchObject({
      type: 'user',
      message: { content: [{ type: 'text', text: 'Summarise a.md' }] },
    })
    session.stop()
  })

  it('stops when the CLI starts with a tool it was not given', async () => {
    const { session, harness } = await start((child) => {
      child.send({ ...INIT, tools: [...INIT.tools, 'Agent'] })
    })
    await session.send('hi')
    await tick()
    expect(harness.events).toContainEqual(
      expect.objectContaining({ type: 'error', kind: 'unsafe-tools' }),
    )
    expect(harness.events.at(-1)).toEqual({ type: 'ended' })
    expect(harness.killTree).toHaveBeenCalled()
  })

  it('answers a write inside the project itself, and refuses one to an open document', async () => {
    const { session, harness } = await start((child) => {
      child.send(
        INIT,
        {
          type: 'control_request',
          request_id: 'r1',
          request: {
            subtype: 'can_use_tool',
            tool_name: 'Write',
            input: { file_path: 'C:\\Users\\me\\Project\\new.md' },
          },
        },
        {
          type: 'control_request',
          request_id: 'r2',
          request: {
            subtype: 'can_use_tool',
            tool_name: 'Edit',
            input: { file_path: 'C:\\Users\\me\\Project\\OPEN.md' },
            tool_use_id: 'u2',
          },
        },
      )
    })
    await session.send('write')
    await tick()
    const responses = harness.child.lines.filter((line) => line.type === 'control_response')
    expect(responses[0]).toMatchObject({
      response: {
        request_id: 'r1',
        response: {
          behavior: 'allow',
          updatedInput: { file_path: 'C:\\Users\\me\\Project\\new.md' },
        },
      },
    })
    expect(responses[1]).toMatchObject({
      response: { request_id: 'r2', response: { behavior: 'deny' } },
    })
    expect(responses[1]!.response.response.message).toMatch(/ieumoffice-editor/)
    expect(harness.events.some((event) => event.type === 'permission')).toBe(false)
    session.stop()
  })

  it('asks the person about a command and passes the answer back', async () => {
    const { session, harness } = await start((child) => {
      child.send(INIT, {
        type: 'control_request',
        request_id: 'r9',
        request: {
          subtype: 'can_use_tool',
          tool_name: 'Bash',
          input: { command: 'node make.js', description: 'build the deck' },
          tool_use_id: 'u9',
        },
      })
    })
    await session.send('make it')
    await tick()
    const asked = harness.events.find((event) => event.type === 'permission')
    expect(asked).toMatchObject({
      type: 'permission',
      request: {
        id: 'r9',
        provider: 'claude-code',
        kind: 'command',
        command: 'node make.js',
        reason: 'build the deck',
      },
    })
    session.answer('r9', { allow: false })
    await tick()
    expect(harness.child.lines.at(-1)).toMatchObject({
      type: 'control_response',
      response: { request_id: 'r9', response: { behavior: 'deny' } },
    })
    // an answer to a request that is no longer pending writes nothing
    const count = harness.child.lines.length
    session.answer('r9', { allow: true })
    expect(harness.child.lines.length).toBe(count)
    session.stop()
  })

  it('asks before the web, and keeps a session allowance for searches or one site', async () => {
    const ask = (id: string, tool: string, input: Record<string, unknown>) => ({
      type: 'control_request',
      request_id: id,
      request: { subtype: 'can_use_tool', tool_name: tool, input, tool_use_id: `u-${id}` },
    })
    const { session, harness } = await start((child) => {
      child.send(
        INIT,
        ask('s1', 'WebSearch', { query: 'weather' }),
        ask('f1', 'WebFetch', { url: 'https://Example.com/a' }),
      )
    })
    await session.send('look it up')
    await tick()
    const asked = () =>
      harness.events.flatMap((event) => (event.type === 'permission' ? [event.request] : []))
    expect(asked().map((request) => request.id)).toEqual(['s1', 'f1'])
    expect(asked()[0]).toMatchObject({ kind: 'web-search', target: 'weather' })
    expect(asked()[1]).toMatchObject({
      kind: 'web-fetch',
      host: 'example.com',
      target: 'https://Example.com/a',
    })
    session.answer('s1', { allow: true, scope: 'session' })
    session.answer('f1', { allow: true, scope: 'session' })
    harness.child.send(
      ask('s2', 'WebSearch', { query: 'news' }),
      ask('f2', 'WebFetch', { url: 'http://example.com/b' }),
      ask('f3', 'WebFetch', { url: 'https://other.org/' }),
    )
    await tick()
    const answered = (id: string) =>
      harness.child.lines.find(
        (line) => line.type === 'control_response' && line.response?.request_id === id,
      )?.response.response.behavior
    expect(answered('s1')).toBe('allow')
    expect(answered('f1')).toBe('allow')
    // allowed for the session: answered without asking
    expect(answered('s2')).toBe('allow')
    expect(answered('f2')).toBe('allow')
    // another site still asks; a plain "allow" is for this page only
    expect(asked().map((request) => request.id)).toEqual(['s1', 'f1', 'f3'])
    session.answer('f3', { allow: true })
    harness.child.send(ask('f4', 'WebFetch', { url: 'https://other.org/next' }))
    await tick()
    expect(answered('f3')).toBe('allow')
    expect(answered('f4')).toBeUndefined()
    expect(asked().at(-1)?.id).toBe('f4')
    session.answer('f4', { allow: false })
    await tick()
    expect(answered('f4')).toBe('deny')
    session.stop()

    // a new session starts with nothing allowed
    const next = await start((child) => child.send(INIT, ask('s9', 'WebSearch', { query: 'x' })))
    await next.session.send('again')
    await tick()
    expect(next.harness.events.some((event) => event.type === 'permission')).toBe(true)
    next.session.stop()
  })

  it('asks before the web when the project is trusted, too', async () => {
    const { session, harness } = await start(
      (child) =>
        child.send(INIT, {
          type: 'control_request',
          request_id: 'w1',
          request: {
            subtype: 'can_use_tool',
            tool_name: 'WebFetch',
            input: { url: 'https://example.com/' },
          },
        }),
      { mode: 'trust-project' },
    )
    await session.send('go')
    await tick()
    expect(harness.events.some((event) => event.type === 'permission')).toBe(true)
    session.stop()
  })

  it('refuses a permission prompt that comes before the tool list', async () => {
    const { session, harness } = await start((child) => {
      child.send({
        type: 'control_request',
        request_id: 'r1',
        request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'dir' } },
      })
    })
    await session.send('hi')
    await tick()
    expect(harness.events).toContainEqual(
      expect.objectContaining({ type: 'error', kind: 'unsafe-tools' }),
    )
  })

  it('reports a failed turn and stays open for the next message', async () => {
    let turns = 0
    const { session, harness } = await start((child) => {
      turns++
      if (turns === 1) {
        child.send(INIT, {
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          api_error_status: 429,
          result: 'limit reached',
        })
      } else child.send({ type: 'result', subtype: 'success', is_error: false, result: 'ok' })
    })
    await session.send('one')
    await tick()
    expect(harness.events).toContainEqual({ type: 'turn-done', ok: false })
    expect(harness.events).toContainEqual(
      expect.objectContaining({ type: 'error', kind: 'rate-limit' }),
    )
    await session.send('two')
    await tick()
    expect(harness.events.at(-1)).toEqual({ type: 'turn-done', ok: true })
    session.stop()
  })

  it('does not take a second message while one is being answered', async () => {
    const { session } = await start(() => undefined)
    await session.send('one')
    await expect(session.send('two')).rejects.toThrow(/still answering/)
    session.stop()
  })

  it('ends the process tree when stopped, and reports it once', async () => {
    const { session, harness } = await start(() => undefined)
    session.stop()
    session.stop()
    await tick()
    expect(harness.killTree).toHaveBeenCalledTimes(1)
    expect(harness.events.filter((event) => event.type === 'ended')).toHaveLength(1)
    await expect(session.send('late')).rejects.toThrow(/ended/)
  })

  it('reports a CLI that exits by itself', async () => {
    const { session, harness } = await start((child) => {
      child.stderr.write('boom')
      child.exit(3)
    })
    await session.send('hi')
    await tick()
    await tick()
    expect(harness.events).toContainEqual(expect.objectContaining({ type: 'error' }))
    expect(harness.events.at(-1)).toEqual({ type: 'ended' })
  })
})

describe('relays of the person’s MCP servers (user MCP spec 9)', () => {
  const RELAYS = [
    {
      name: 'law',
      url: 'http://127.0.0.1:4100/mcp',
      token: 'relay-tok-1',
      tools: ['search', 'get_text'],
    },
    { name: 'notes-2', url: 'http://127.0.0.1:4101/mcp', token: 'relay-tok-2', tools: ['find'] },
  ]
  const APP_SERVER = { name: 'ieumoffice-editor', status: 'connected' }

  it('accepts this session’s relays and the tools each listed at the start', () => {
    expect(
      claudeAgentInitProblem(
        {
          ...INIT,
          tools: [...INIT.tools, 'mcp__law__search', 'mcp__law__get_text', 'mcp__notes-2__find'],
          mcp_servers: [
            APP_SERVER,
            { name: 'law', status: 'connected' },
            { name: 'notes-2', status: 'connected' },
          ],
        },
        RELAYS,
      ),
    ).toBeUndefined()
    // fewer tools than listed (one dropped out for review) still passes
    expect(
      claudeAgentInitProblem(
        { ...INIT, tools: [...INIT.tools, 'mcp__law__search'], mcp_servers: [{ name: 'law' }] },
        RELAYS,
      ),
    ).toBeUndefined()
  })

  it('refuses any other server, a tool a relay did not list, and relays of no session', () => {
    expect(
      claudeAgentInitProblem(
        { ...INIT, mcp_servers: [{ name: 'github', status: 'connected' }] },
        RELAYS,
      ),
    ).toMatch(/MCP server/)
    expect(
      claudeAgentInitProblem({ ...INIT, tools: [...INIT.tools, 'mcp__law__delete_all'] }, RELAYS),
    ).toMatch(/tools/)
    expect(
      claudeAgentInitProblem({ ...INIT, tools: [...INIT.tools, 'mcp__github__search'] }, RELAYS),
    ).toMatch(/tools/)
    // a tool of one relay under another relay's name
    expect(
      claudeAgentInitProblem({ ...INIT, tools: [...INIT.tools, 'mcp__notes-2__search'] }, RELAYS),
    ).toMatch(/tools/)
    // without relays the same report is refused, as before
    expect(
      claudeAgentInitProblem({
        ...INIT,
        tools: [...INIT.tools, 'mcp__law__search'],
        mcp_servers: [{ name: 'law' }],
      }),
    ).toMatch(/tools/)
    expect(claudeAgentInitProblem({ ...INIT, mcp_servers: [{ name: 'law' }] })).toMatch(
      /MCP server/,
    )
  })

  it('never takes a relay named like the app server or of a malformed name', () => {
    expect(
      agentUsableRelays([
        { name: 'ieumoffice-editor', url: 'u', token: 't', tools: ['create_docx'] },
        { name: 'IEUMOFFICE-EDITOR', url: 'u', token: 't', tools: [] },
        { name: 'a__b', url: 'u', token: 't', tools: [] },
        { name: '_x', url: 'u', token: 't', tools: [] },
        { name: 'x y', url: 'u', token: 't', tools: [] },
        { name: 'law', url: 'u', token: 't', tools: [] },
        { name: 'LAW', url: 'u', token: 't', tools: [] },
      ]).map((relay) => relay.name),
    ).toEqual(['law'])
    expect(
      claudeAgentInitProblem(
        { ...INIT, tools: [...INIT.tools, 'mcp__ieumoffice-editor__create_docx'] },
        [{ name: 'ieumoffice-editor', url: 'u', token: 't', tools: ['create_docx'] }],
      ),
    ).toMatch(/tools/)
  })

  it('classifies a relay tool as an app tool, and another server’s tool as other', () => {
    expect(claudeAgentAction('mcp__law__search', { q: 'x' }, RELAYS)).toEqual({
      kind: 'app-tool',
      tool: 'mcp__law__search',
      paths: [],
    })
    expect(claudeAgentAction('mcp__github__search', {}, RELAYS).kind).toBe('other')
    expect(claudeAgentAction('mcp__law__search', {}).kind).toBe('other')
  })

  it('adds an allow rule per relay in auto mode only', () => {
    const base = { openDocuments: [], protectedPaths: [], userMcpRelays: RELAYS }
    const trusted = claudeAgentSettings({ ...base, mode: 'trust-project' }, 'win32') as any
    expect(trusted.permissions.allow).toEqual(['mcp__law', 'mcp__notes-2'])
    for (const mode of ['ask-commands', 'ask-writes'] as const) {
      expect(claudeAgentSettings({ ...base, mode }, 'win32')).toEqual({
        permissions: { blockReadsOutsideWorkingDirectories: true, deny: [] },
      })
    }
    expect(
      claudeAgentSettings(
        { openDocuments: [], protectedPaths: [], mode: 'trust-project' },
        'win32',
      ),
    ).toEqual({ permissions: { blockReadsOutsideWorkingDirectories: true, deny: [] } })
  })

  it('writes the relays into the session MCP file with session tokens only', async () => {
    const { session, harness } = await start(() => undefined, {
      appMcp: { url: 'http://127.0.0.1:4000/mcp', token: 'app-tok' },
      userMcpRelays: RELAYS,
      mode: 'trust-project',
    })
    const config = JSON.parse(harness.files.get(join('C:\\Temp\\session-1', 'claude-mcp.json'))!)
    expect(config).toEqual({
      mcpServers: {
        law: {
          type: 'http',
          url: 'http://127.0.0.1:4100/mcp',
          headers: { Authorization: 'Bearer relay-tok-1' },
        },
        'notes-2': {
          type: 'http',
          url: 'http://127.0.0.1:4101/mcp',
          headers: { Authorization: 'Bearer relay-tok-2' },
        },
        'ieumoffice-editor': {
          type: 'http',
          url: 'http://127.0.0.1:4000/mcp',
          headers: { Authorization: 'Bearer app-tok' },
        },
      },
    })
    const settings = JSON.parse(
      harness.files.get(join('C:\\Temp\\session-1', 'claude-settings.json'))!,
    )
    expect(settings.permissions.allow).toEqual(['mcp__law', 'mcp__notes-2'])
    expect(harness.spawnCalls[0]!.args).toContain('--strict-mcp-config')
    expect(harness.spawnCalls[0]!.args.join(' ')).not.toContain('relay-tok')
    session.stop()
  })

  it('writes an MCP file for relays even without the app server', async () => {
    const { session, harness } = await start(() => undefined, { userMcpRelays: [RELAYS[0]!] })
    const config = JSON.parse(harness.files.get(join('C:\\Temp\\session-1', 'claude-mcp.json'))!)
    expect(Object.keys(config.mcpServers)).toEqual(['law'])
    session.stop()
  })

  it('starts with the relays reported and lets their calls through to the relay', async () => {
    const { session, harness } = await start(
      (child) => {
        child.send(
          {
            ...INIT,
            tools: [...INIT.tools, 'mcp__law__search'],
            mcp_servers: [{ name: 'law', status: 'connected' }],
          },
          {
            type: 'control_request',
            request_id: 'm1',
            request: {
              subtype: 'can_use_tool',
              tool_name: 'mcp__law__search',
              input: { q: 'x' },
              tool_use_id: 'um1',
            },
          },
        )
      },
      { userMcpRelays: RELAYS },
    )
    await session.send('look it up')
    await tick()
    expect(harness.events).toContainEqual(expect.objectContaining({ type: 'started' }))
    const response = harness.child.lines.find(
      (line) => line.type === 'control_response' && line.response?.request_id === 'm1',
    )
    expect(response?.response.response.behavior).toBe('allow')
    // the relay asks the person; the program level does not ask a second time
    expect(harness.events.some((event) => event.type === 'permission')).toBe(false)
    session.stop()
  })

  it('stops a session that reports a server other than its relays', async () => {
    const { session, harness } = await start(
      (child) => {
        child.send({ ...INIT, mcp_servers: [{ name: 'github', status: 'connected' }] })
      },
      { userMcpRelays: RELAYS },
    )
    await session.send('x')
    await tick()
    expect(harness.events).toContainEqual(
      expect.objectContaining({ type: 'error', kind: 'unsafe-tools' }),
    )
  })
})
