/**
 * The Claude Code bridge, driven by a fake child process: what is put on the
 * command line and on stdin, what the CLI's events become, and when a run is
 * refused or ended.
 */
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { PassThrough, Writable } from 'node:stream'
import type { SpawnOptions } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentMessage, AgentToolCall, AgentToolDef } from '@genoffice/agent-core'
import {
  MAX_CLAUDE_CODE_IMAGES,
  buildClaudeCodeInput,
  chatClaudeCodeCli,
  claudeCodeCliLaunchArgs,
  claudeCodeModels,
  claudeCodeOutputSchema,
  claudeCodeUsage,
  listClaudeCodeModels,
  parseClaudeCodeTurn,
  streamClaudeCodeCli,
  type ClaudeCodeCliDeps,
} from '../src/claude-code-cli'
import { MAX_SSE_LINE_BYTES, MAX_STREAM_TOOL_CALLS } from '../src/protocols/shared'
import { AiRunError } from '../src/run-error'
import {
  createSubscriptionChildRegistry,
  subscriptionModelsOf,
  type SubscriptionProgram,
} from '../src/subscription'
import type { AiProviderConfig, AiSubscriptionUsage, AiTokenUsage } from '../src/types'
import { AiTimeoutError, createStreamWatchdog } from '../src/watchdog'

const PROGRAM: SubscriptionProgram = {
  provider: 'claude-code',
  command: '/opt/fake/claude',
  prefixArgs: [],
  env: {},
  entry: '/opt/fake/claude',
  source: 'path',
}

const tools: AgentToolDef[] = [
  {
    name: 'replace_text',
    description: 'Replace document text',
    inputSchema: {
      type: 'object',
      properties: { before: { type: 'string' }, after: { type: 'string' } },
      required: ['before', 'after'],
    },
  },
]

const config: AiProviderConfig = { apiKey: '', model: 'haiku' }

interface FakeScript {
  /** the CLI's answer to the initialize request; a success response when absent */
  onInitialize?: (child: FakeClaude, request: Record<string, any>) => void
  /** what the CLI does with the user message */
  onUser?: (child: FakeClaude, message: Record<string, any>) => void
  /** stdin was closed; the CLI exits with 0 when absent */
  onStdinEnd?: (child: FakeClaude) => void
}

class FakeClaude extends EventEmitter {
  /** undefined for a program that could not be started */
  readonly pid: number | undefined
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly lines: Array<Record<string, any>> = []
  stdinEnded = false
  exited = false
  readonly stdin: Writable
  private pending = ''

  constructor(
    private readonly script: FakeScript,
    started = true,
  ) {
    super()
    this.pid = started ? 4242 : undefined
    this.stdin = new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        this.pending += chunk.toString('utf8')
        const parts = this.pending.split('\n')
        this.pending = parts.pop() ?? ''
        for (const part of parts) if (part.trim()) this.receive(JSON.parse(part))
        done()
      },
      final: (done) => {
        this.stdinEnded = true
        if (this.script.onStdinEnd) this.script.onStdinEnd(this)
        else this.exit(0)
        done()
      },
    })
  }

  private receive(line: Record<string, any>): void {
    this.lines.push(line)
    if (line.type === 'control_request') {
      if (this.script.onInitialize) this.script.onInitialize(this, line)
      else this.send(initializeOk(line.request_id))
    } else if (line.type === 'user') {
      this.script.onUser?.(this, line)
    }
  }

  send(...events: unknown[]): void {
    for (const event of events) {
      // the bridge can tree-kill the child while reading an earlier event; a killed process writes nothing more
      if (this.exited) return
      this.stdout.write(`${JSON.stringify(event)}\n`)
    }
  }

  exit(code: number | null = 0): void {
    if (this.exited) return
    this.exited = true
    this.stdout.end()
    this.stderr.end()
    setImmediate(() => {
      this.emit('exit', code, null)
      this.emit('close', code, null)
    })
  }

  kill(): boolean {
    return true
  }
}

function initializeOk(requestId: unknown): unknown {
  return {
    type: 'control_response',
    response: { subtype: 'success', request_id: requestId, response: { commands: [] } },
  }
}

function initEvent(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: 'system',
    subtype: 'init',
    tools: [],
    mcp_servers: [],
    model: 'claude-haiku-4-5',
    apiKeySource: 'none',
    claude_code_version: '2.1.287',
    ...overrides,
  }
}

function textDelta(text: string): unknown {
  return {
    type: 'stream_event',
    event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } },
  }
}

function resultEvent(result: string, overrides: Record<string, unknown> = {}): unknown {
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    api_error_status: null,
    stop_reason: 'end_turn',
    result,
    usage: {
      input_tokens: 900,
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 90,
      output_tokens: 120,
    },
    ...overrides,
  }
}

function rateLimitEvent(info: Record<string, unknown>): unknown {
  return { type: 'rate_limit_event', rate_limit_info: info }
}

/** A whole successful turn whose text is `raw`, streamed in `chunkSize` pieces */
function answer(raw: string, chunkSize = 7): FakeScript {
  return {
    onUser: (child) => {
      child.send(initEvent())
      for (let index = 0; index < raw.length; index += chunkSize) {
        child.send(textDelta(raw.slice(index, index + chunkSize)))
      }
      child.send(resultEvent(raw))
    },
  }
}

interface RunRecord {
  child: FakeClaude | undefined
  command: string | undefined
  args: string[]
  options: SpawnOptions | undefined
  deltas: string[]
  toolCalls: AgentToolCall[]
  reasoning: string[]
  usage: AiTokenUsage[]
  subscriptionUsage: AiSubscriptionUsage[][]
  stopReasons: string[]
  truncated: number
  killed: unknown[]
  deps: ClaudeCodeCliDeps
  callbacks: Parameters<typeof streamClaudeCodeCli>[5]
}

/** working directories of the runs a test started */
const startedIn: string[] = []

// every run cleans up after itself, whatever way it ended
afterEach(async () => {
  for (const cwd of startedIn.splice(0)) {
    await vi.waitFor(() => expect(existsSync(cwd)).toBe(false))
  }
})

function harness(
  script: FakeScript,
  options: { signal?: AbortSignal; baseEnv?: NodeJS.ProcessEnv; deps?: ClaudeCodeCliDeps } = {},
): RunRecord {
  const record: RunRecord = {
    child: undefined,
    command: undefined,
    args: [],
    options: undefined,
    deltas: [],
    toolCalls: [],
    reasoning: [],
    usage: [],
    subscriptionUsage: [],
    stopReasons: [],
    truncated: 0,
    killed: [],
    deps: {},
    callbacks: {
      signal: options.signal ?? new AbortController().signal,
      onDelta: (text) => record.deltas.push(text),
      onToolCall: (call) => record.toolCalls.push(call),
      onReasoningDelta: (text) => record.reasoning.push(text),
      onUsage: (usage) => record.usage.push(usage),
      onSubscriptionUsage: (usage) => record.subscriptionUsage.push(usage),
      onStopReason: (reason) => record.stopReasons.push(reason),
      onInputTruncated: () => {
        record.truncated++
      },
    },
  }
  record.deps = {
    resolveProgram: async () => PROGRAM,
    spawn: (command, args, spawnOptions) => {
      record.command = command
      record.args = args
      record.options = spawnOptions
      if (typeof spawnOptions.cwd === 'string') startedIn.push(spawnOptions.cwd)
      record.child = new FakeClaude(script)
      return record.child
    },
    registry: null,
    baseEnv: options.baseEnv ?? { PATH: '/usr/bin' },
    killTree: (child) => {
      record.killed.push(child)
      // a real tree kill ends the process
      record.child?.exit(null)
    },
    exitGraceMs: 20,
    ...options.deps,
  }
  return record
}

function stream(
  record: RunRecord,
  messages: AgentMessage[] = [{ role: 'user', text: 'Make the title bold.' }],
  system = 'You are the document assistant.',
  runTools: AgentToolDef[] = tools,
): Promise<void> {
  return streamClaudeCodeCli(
    config,
    system,
    messages,
    runTools,
    4096,
    record.callbacks,
    record.deps,
  )
}

function turnJson(text: string, toolCalls: unknown[] = []): string {
  return JSON.stringify({ text, toolCalls })
}

describe('Claude Code bridge: what is started', () => {
  it('starts the located program with fixed lock-down flags and nothing of the conversation', async () => {
    const record = harness(answer(turnJson('Done.')))
    await stream(
      record,
      [{ role: 'user', text: 'SECRET-USER-TEXT make the title bold' }],
      'SECRET-SYSTEM-PROMPT',
    )
    expect(record.command).toBe(PROGRAM.command)
    expect(record.args).toEqual(claudeCodeCliLaunchArgs('haiku'))
    expect(record.args).toEqual([
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--tools',
      '',
      '--restricted',
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--model',
      'haiku',
    ])
    const commandLine = record.args.join('\n')
    expect(commandLine).not.toContain('SECRET-USER-TEXT')
    expect(commandLine).not.toContain('SECRET-SYSTEM-PROMPT')
    expect(commandLine).not.toContain('replace_text')
    // never the API-key-only minimal mode, never a shell
    expect(record.args).not.toContain('--bare')
    expect(record.options?.shell).toBeFalsy()
  })

  it('leaves the model to the CLI when none is configured and refuses a flag-shaped model', async () => {
    expect(claudeCodeCliLaunchArgs('')).not.toContain('--model')
    expect(claudeCodeCliLaunchArgs('  opus ')).toContain('opus')
    expect(() => claudeCodeCliLaunchArgs('--dangerously-skip-permissions')).toThrow(/model/i)
    const record = harness(answer(turnJson('Done.')))
    await expect(
      streamClaudeCodeCli(
        { apiKey: '', model: '-p' },
        'system',
        [{ role: 'user', text: 'hi' }],
        [],
        1024,
        record.callbacks,
        record.deps,
      ),
    ).rejects.toThrow(/model/i)
    expect(record.child).toBeUndefined()
  })

  it('starts the CLI without the variables that would move it off the subscription', async () => {
    const record = harness(answer(turnJson('Done.')), {
      baseEnv: {
        PATH: '/usr/bin',
        HOME: '/home/someone',
        ANTHROPIC_API_KEY: 'sk-ant-test',
        ANTHROPIC_AUTH_TOKEN: 'token',
        ANTHROPIC_BASE_URL: 'https://proxy.example',
        CLAUDE_CODE_USE_BEDROCK: '1',
        CLAUDE_CODE_USE_VERTEX: '1',
        OPENAI_API_KEY: 'sk-test',
      },
    })
    await stream(record)
    const env = record.options?.env ?? {}
    for (const name of [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_BASE_URL',
      'CLAUDE_CODE_USE_BEDROCK',
      'CLAUDE_CODE_USE_VERTEX',
      'OPENAI_API_KEY',
    ]) {
      expect(env[name]).toBeUndefined()
    }
    expect(env.HOME).toBe('/home/someone')
  })

  it('runs in an empty directory of its own and removes it afterwards', async () => {
    const record = harness(answer(turnJson('Done.')))
    await stream(record)
    const cwd = String(record.options?.cwd)
    expect(cwd).not.toBe(process.cwd())
    await vi.waitFor(() => expect(existsSync(cwd)).toBe(false))
  })

  it('reports a missing CLI as not-installed', async () => {
    const record = harness(answer(turnJson('Done.')), {
      deps: {
        resolveProgram: async () => {
          throw new AiRunError('not-installed', 'Claude Code CLI was not found', {
            provider: 'claude-code',
          })
        },
      },
    })
    await expect(stream(record)).rejects.toMatchObject({
      kind: 'not-installed',
      provider: 'claude-code',
    })
    expect(record.child).toBeUndefined()
  })

  it('reports a program that vanished before it could start as not-installed', async () => {
    const record = harness(
      {},
      {
        deps: {
          spawn: (_command, _args, spawnOptions) => {
            const child = new FakeClaude({}, false)
            if (typeof spawnOptions.cwd === 'string') startedIn.push(spawnOptions.cwd)
            setImmediate(() => {
              child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))
            })
            return child
          },
        },
      },
    )
    await expect(stream(record)).rejects.toMatchObject({
      kind: 'not-installed',
      provider: 'claude-code',
    })
  })
})

describe('Claude Code bridge: what goes over stdin', () => {
  it('sends the system prompt in the initialize request and the conversation only after it was accepted', async () => {
    let userSeenBeforeAck = false
    const record = harness({
      onInitialize: (child, request) => {
        setTimeout(() => {
          userSeenBeforeAck = child.lines.some((line) => line.type === 'user')
          child.send(initializeOk(request.request_id))
        }, 15)
      },
      ...{ onUser: answer(turnJson('Done.')).onUser },
    })
    await stream(record, [{ role: 'user', text: 'Make the title bold.' }], 'APP SYSTEM PROMPT')
    expect(userSeenBeforeAck).toBe(false)
    const [initialize, user] = record.child!.lines
    expect(initialize.type).toBe('control_request')
    expect(initialize.request.subtype).toBe('initialize')
    expect(initialize.request.systemPrompt[0]).toBe('APP SYSTEM PROMPT')
    const contract = initialize.request.systemPrompt.slice(1).join('\n')
    expect(contract).toMatch(/no tools of your own/i)
    expect(contract).toMatch(/exactly one JSON object/i)
    // no schema is handed to the CLI: that would add its StructuredOutput tool
    expect(initialize.request.jsonSchema).toBeUndefined()
    expect(user.type).toBe('user')
    expect(user.message.role).toBe('user')
    const blocks = user.message.content as Array<Record<string, any>>
    expect(blocks[0].type).toBe('text')
    expect(blocks[0].text).toContain('replace_text')
    expect(blocks[0].text).toContain(JSON.stringify(claudeCodeOutputSchema(tools)))
    expect(JSON.parse(blocks[1].text)).toEqual({ role: 'user', text: 'Make the title bold.' })
  })

  it('serialises the conversation one event per block, with tool calls and results', () => {
    const messages: AgentMessage[] = [
      { role: 'user', text: 'Fix the typo.' },
      {
        role: 'assistant',
        text: 'Fixing.',
        toolCalls: [{ id: 'c1', name: 'replace_text', input: { before: 'teh', after: 'the' } }],
        reasoning: 'hidden',
      },
      { role: 'tool', results: [{ id: 'c1', name: 'replace_text', output: 'ok' }] },
    ]
    const input = buildClaudeCodeInput('system', messages, tools, 2048)
    expect(input.truncated).toBe(false)
    const blocks = input.user.message.content as Array<Record<string, any>>
    // one block per event and nothing after the last one, a trailing tool result included
    expect(blocks).toHaveLength(4)
    expect(blocks[0].text).toContain('2048')
    expect(JSON.parse(blocks[2].text)).toEqual({
      role: 'assistant',
      text: 'Fixing.',
      toolCalls: [{ id: 'c1', name: 'replace_text', input: { before: 'teh', after: 'the' } }],
    })
    // a tool event says its calls already ran, so they are not requested again
    const toolEvent = JSON.parse(blocks[3].text)
    expect(toolEvent).toEqual({
      role: 'tool',
      results: [{ id: 'c1', name: 'replace_text', output: 'ok' }],
      note: expect.any(String),
    })
    expect(toolEvent.note).toMatch(/already run those calls exactly once/)
    expect(toolEvent.note).toMatch(/do not request them again/)
    expect(toolEvent.note).toMatch(/only the further calls that are still needed/)
    expect(toolEvent.note).toMatch(/empty "toolCalls" array/)
    // the note is the last thing of the event, so the last thing read when the turn ends on it
    expect(Object.keys(toolEvent).at(-1)).toBe('note')
    const answered = buildClaudeCodeInput(
      'system',
      [...messages, { role: 'assistant', text: 'Fixed.' }],
      tools,
      2048,
    )
    expect(answered.user.message.content).toHaveLength(5)
    expect(answered.user.message.content.slice(0, 4)).toEqual(blocks)
    expect(JSON.parse((answered.user.message.content[4] as { text: string }).text)).toEqual({
      role: 'assistant',
      text: 'Fixed.',
    })
  })

  it('every earlier turn of a tool loop is an exact prefix of the next one', () => {
    const messages: AgentMessage[] = [
      { role: 'user', text: 'Fix both typos.' },
      {
        role: 'assistant',
        text: 'First one.',
        toolCalls: [{ id: 'c1', name: 'replace_text', input: { before: 'teh', after: 'the' } }],
      },
      { role: 'tool', results: [{ id: 'c1', name: 'replace_text', output: 'ok' }] },
      {
        role: 'assistant',
        text: 'Second one.',
        toolCalls: [{ id: 'c2', name: 'replace_text', input: { before: 'adn', after: 'and' } }],
      },
      { role: 'tool', results: [{ id: 'c2', name: 'replace_text', output: 'ok' }] },
    ]
    const blocksOf = (count: number) =>
      buildClaudeCodeInput('system', messages.slice(0, count), tools, 2048).user.message.content
    const whole = blocksOf(messages.length)
    expect(whole).toHaveLength(1 + messages.length)
    // the prompt cache is keyed on the blocks up to the last one: a turn that ended on a tool
    // result (3 events) must be found again, block for block, at the start of the next turn
    for (let count = 1; count < messages.length; count++) {
      const shorter = blocksOf(count)
      expect(shorter).toHaveLength(1 + count)
      expect(whole.slice(0, shorter.length), `${count} events`).toEqual(shorter)
    }
    // the same text on every tool event, whether or not it is the last one
    const notes = [whole[3], whole[5]].map((block) => JSON.parse((block as { text: string }).text))
    expect(notes[0].note).toBe(notes[1].note)
    expect(notes[0].note).toMatch(/do not request them again/)
  })

  it('a conversation without tool events carries the note nowhere', () => {
    const input = buildClaudeCodeInput(
      'system',
      [
        { role: 'user', text: 'Fix the typo.' },
        { role: 'assistant', text: 'Which one?' },
        { role: 'user', text: 'The first.' },
      ],
      tools,
      2048,
    )
    expect(input.user.message.content).toHaveLength(4)
    const sent = [
      ...input.initialize.request.systemPrompt,
      ...input.user.message.content.map((block) => (block.type === 'text' ? block.text : '')),
    ].join('\n')
    expect(sent).not.toMatch(/already run|request them again|"note"/)
  })

  it('passes user images as image blocks right after the event that lists them', () => {
    const input = buildClaudeCodeInput(
      'system',
      [
        {
          role: 'user',
          text: 'What is on this slide?',
          images: [
            { base64: 'QUJD', mime: 'image/png' },
            { base64: 'REVG', mime: 'image/jpeg' },
          ],
        },
      ],
      [],
      1024,
    )
    const blocks = input.user.message.content as Array<Record<string, any>>
    expect(JSON.parse(blocks[1].text)).toEqual({
      role: 'user',
      text: 'What is on this slide?',
      attachedImages: ['image-1', 'image-2'],
    })
    expect(blocks[2]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'QUJD' },
    })
    expect(blocks[3]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'REVG' },
    })
    expect(input.truncated).toBe(false)
  })

  it('drops the oldest images beyond the request limit and says so', async () => {
    const image = { base64: 'QUJD', mime: 'image/png' }
    const messages: AgentMessage[] = [
      { role: 'user', text: 'old', images: Array.from({ length: 3 }, () => image) },
      { role: 'assistant', text: 'ok' },
      {
        role: 'user',
        text: 'new',
        images: Array.from({ length: MAX_CLAUDE_CODE_IMAGES }, () => image),
      },
    ]
    const input = buildClaudeCodeInput('system', messages, [], 1024)
    expect(input.truncated).toBe(true)
    const blocks = input.user.message.content as Array<Record<string, any>>
    expect(blocks.filter((block) => block.type === 'image')).toHaveLength(MAX_CLAUDE_CODE_IMAGES)
    expect(JSON.parse(blocks[1].text)).toEqual({ role: 'user', text: 'old', omittedImages: 3 })

    const record = harness(answer(turnJson('Done.')))
    await stream(record, messages)
    expect(record.truncated).toBe(1)

    const whole = harness(answer(turnJson('Done.')))
    await stream(whole, messages.slice(2))
    expect(whole.truncated).toBe(0)
  })
})

describe('Claude Code bridge: the structured turn', () => {
  it('streams the text as it arrives and delivers it whole', async () => {
    const text = 'Line one.\nShe said "hi" \\ done — 완료 \u{1F600}'
    const record = harness(answer(turnJson(text), 5))
    await stream(record)
    expect(record.deltas.join('')).toBe(text)
    // streamed while the JSON was still arriving, not as one piece at the end
    expect(record.deltas.length).toBeGreaterThan(3)
    expect(record.toolCalls).toEqual([])
    expect(record.stopReasons).toEqual(['end_turn'])
    expect(record.usage).toEqual([{ inputTokens: 1000, outputTokens: 120 }])
    await vi.waitFor(() => expect(record.child!.stdinEnded).toBe(true))
  })

  it('reads a fenced, pretty-printed answer the same way', async () => {
    const raw = '```json\n{\n  "text": "The image is red.",\n  "toolCalls": []\n}\n```'
    const record = harness(answer(raw, 4))
    await stream(record)
    expect(record.deltas.join('')).toBe('The image is red.')
    expect(record.deltas.length).toBeGreaterThan(1)
  })

  it('never splits an escaped surrogate pair across two deltas', async () => {
    const raw = '{"text":"a\\ud83d\\ude00b","toolCalls":[]}'
    const record = harness(answer(raw, 3))
    await stream(record)
    expect(record.deltas.join('')).toBe('a\u{1F600}b')
    for (const delta of record.deltas) {
      expect(/[\ud800-\udbff]$/.test(delta)).toBe(false)
      expect(/^[\udc00-\udfff]/.test(delta)).toBe(false)
    }
  })

  it('falls back to the final message when the CLI sent no partial output', async () => {
    const raw = turnJson('Whole answer.')
    const record = harness({
      onUser: (child) => {
        child.send(
          initEvent(),
          { type: 'assistant', message: { content: [{ type: 'text', text: raw }] } },
          resultEvent(raw),
        )
      },
    })
    await stream(record)
    expect(record.deltas).toEqual(['Whole answer.'])
  })

  it('delivers the text at the end when the answer does not open with it', async () => {
    const raw = JSON.stringify({
      toolCalls: [{ name: 'replace_text', inputJson: '{"before":"a","after":"b"}' }],
      text: 'Replacing.',
    })
    const record = harness(answer(raw, 6))
    await stream(record)
    expect(record.deltas).toEqual(['Replacing.'])
    expect(record.toolCalls).toHaveLength(1)
  })

  it('passes requested tool calls on, each with an id of its own', async () => {
    const raw = turnJson('Fixing both.', [
      { name: 'replace_text', inputJson: JSON.stringify({ before: 'teh', after: 'the' }) },
      { name: 'replace_text', inputJson: JSON.stringify({ before: 'adn', after: 'and' }) },
    ])
    const record = harness(answer(raw))
    await stream(record)
    expect(record.deltas.join('')).toBe('Fixing both.')
    expect(record.toolCalls.map(({ name, input }) => ({ name, input }))).toEqual([
      { name: 'replace_text', input: { before: 'teh', after: 'the' } },
      { name: 'replace_text', input: { before: 'adn', after: 'and' } },
    ])
    const ids = record.toolCalls.map((call) => call.id)
    expect(new Set(ids).size).toBe(2)
    expect(ids.every((id) => id.startsWith('claude-'))).toBe(true)
    expect(record.toolCalls.every((call) => call.inputError === undefined)).toBe(true)
  })

  it('accepts tool input given as an object instead of a JSON string', () => {
    const turn = parseClaudeCodeTurn(
      JSON.stringify({
        text: '',
        toolCalls: [{ name: 'replace_text', input: { before: 'a', after: 'b' } }],
      }),
      tools,
    )
    expect(turn.toolCalls[0]).toMatchObject({
      name: 'replace_text',
      input: { before: 'a', after: 'b' },
    })
  })

  it('does not run a call to a tool that is not in the list: it goes back as an input error', async () => {
    const raw = turnJson('Trying.', [
      { name: 'Bash', inputJson: JSON.stringify({ command: 'rm -rf /' }) },
      { name: 'replace_text', inputJson: JSON.stringify({ before: 'a', after: 'b' }) },
    ])
    const record = harness(answer(raw))
    await stream(record)
    expect(record.toolCalls).toHaveLength(2)
    const [unknown, known] = record.toolCalls
    expect(unknown!.name).toBe('Bash')
    expect(unknown!.input).toEqual({})
    expect(unknown!.inputError).toMatch(/not .*tool/i)
    expect(unknown!.inputError).toContain('replace_text')
    expect(known).toMatchObject({ name: 'replace_text', input: { before: 'a', after: 'b' } })
    expect(known!.inputError).toBeUndefined()
  })

  it('reports unparseable tool input through the same retry path', async () => {
    const raw = turnJson('Trying.', [{ name: 'replace_text', inputJson: '{"before": ' }])
    const record = harness(answer(raw))
    await stream(record)
    expect(record.toolCalls).toHaveLength(1)
    expect(record.toolCalls[0]!.inputError).toBeTruthy()
    expect(record.toolCalls[0]!.input).toEqual({})
  })

  it('takes an answer in plain prose as text without tool calls', async () => {
    // seen live: after its tool calls had run, the model answered a bare "done"
    const record = harness(answer('done'))
    await stream(record)
    expect(record.deltas.join('')).toBe('done')
    expect(record.toolCalls).toEqual([])
    expect(parseClaudeCodeTurn('  I would rather answer in plain prose.  ', tools)).toEqual({
      text: 'I would rather answer in plain prose.',
      toolCalls: [],
    })
  })

  it('hands an answer that is a broken structure to the replay path, with nothing delivered', async () => {
    const record = harness(answer('{"toolCalls": [ {"name": "replace_text" '))
    const failure = await stream(record).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect(failure).not.toBeInstanceOf(AiRunError)
    // the loop replays a turn whose error carries this mark and that delivered nothing
    expect((failure as Error).message).toContain('(empty stream)')
    expect(record.deltas).toEqual([])
    expect(record.toolCalls).toEqual([])
  })

  it('hands an answer whose tool calls are broken to the one-replay path once text was shown', async () => {
    const record = harness(answer('{"text":"Working on it.","toolCalls":[{"name":"replace_text",'))
    const failure = await stream(record).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain('while sending tool arguments')
    expect(record.deltas.join('')).toBe('Working on it.')
    expect(record.toolCalls).toEqual([])
  })

  it('rejects a structure with a wrong shape the same way', () => {
    expect(() => parseClaudeCodeTurn('{"text":1,"toolCalls":[]}', tools)).toThrow(/text/)
    expect(() => parseClaudeCodeTurn('{"text":"x","toolCalls":{}}', tools)).toThrow(/toolCalls/)
    expect(() => parseClaudeCodeTurn('{"text":"x","toolCalls":[{}]}', tools)).toThrow(/tool call/)
    const many = Array.from({ length: MAX_STREAM_TOOL_CALLS + 1 }, () => ({
      name: 'replace_text',
      inputJson: '{}',
    }))
    expect(() => parseClaudeCodeTurn(turnJson('', many), tools)).toThrow(/Too many/)
  })

  it('finds the structure inside surrounding prose', () => {
    const turn = parseClaudeCodeTurn(`Here is the answer:\n${turnJson('Hello.')}\nThanks.`, tools)
    expect(turn).toEqual({ text: 'Hello.', toolCalls: [] })
  })

  it('keeps a text answer that was cut by the output limit, marked as cut', async () => {
    const raw = '{"text":"A very long answer that never'
    const record = harness({
      onUser: (child) => {
        child.send(initEvent(), textDelta(raw), resultEvent(raw, { stop_reason: 'max_tokens' }))
      },
    })
    await stream(record)
    expect(record.deltas.join('')).toBe('A very long answer that never')
    expect(record.stopReasons).toEqual(['max_tokens'])
  })

  it('marks a tool call cut by the output limit as truncated instead of dropping it', async () => {
    const raw =
      '{"text":"Writing.","toolCalls":[{"name":"replace_text","inputJson":"{\\"before\\":\\"a'
    const record = harness({
      onUser: (child) => {
        child.send(initEvent(), textDelta(raw), resultEvent(raw, { stop_reason: 'max_tokens' }))
      },
    })
    await stream(record)
    expect(record.toolCalls).toHaveLength(1)
    expect(record.toolCalls[0]).toMatchObject({ name: 'replace_text', truncated: true })
    expect(record.stopReasons).toEqual(['max_tokens'])
  })

  it('forwards visible reasoning and ignores the empty placeholders', async () => {
    const thinking = (text: string): unknown => ({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: text },
      },
    })
    const raw = turnJson('Done.')
    const record = harness({
      onUser: (child) => {
        child.send(
          initEvent(),
          thinking(''),
          thinking('Considering.'),
          textDelta(raw),
          resultEvent(raw),
        )
      },
    })
    await stream(record)
    expect(record.reasoning).toEqual(['Considering.'])
  })
})

describe('Claude Code bridge: zero tools or no run', () => {
  const answering = (init: unknown): FakeScript => ({
    onUser: (child) => {
      const raw = turnJson('This must never be shown.')
      child.send(init, textDelta(raw), resultEvent(raw))
    },
  })

  it('refuses the run when the CLI starts with any tool', async () => {
    const record = harness(answering(initEvent({ tools: ['mcp__notion__search'] })))
    const failure = await stream(record).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(AiRunError)
    expect((failure as AiRunError).kind).toBe('unsafe-tools')
    expect(record.deltas).toEqual([])
    expect(record.toolCalls).toEqual([])
    expect(record.killed).toEqual([record.child])
  })

  it('counts even the CLI own structured-output tool as a tool', async () => {
    const record = harness(answering(initEvent({ tools: ['StructuredOutput'] })))
    await expect(stream(record)).rejects.toMatchObject({ kind: 'unsafe-tools' })
  })

  it('refuses when an MCP server is attached, even with no tool listed yet', async () => {
    const record = harness(
      answering(initEvent({ mcp_servers: [{ name: 'notion', status: 'pending' }] })),
    )
    await expect(stream(record)).rejects.toMatchObject({ kind: 'unsafe-tools' })
    expect(record.deltas).toEqual([])
  })

  it('refuses when the tool list cannot be read', async () => {
    for (const init of [initEvent({ tools: undefined }), initEvent({ tools: 'none' })]) {
      const record = harness(answering(init))
      await expect(stream(record)).rejects.toMatchObject({ kind: 'unsafe-tools' })
      expect(record.deltas).toEqual([])
    }
  })

  it('refuses an answer that arrives before the tool list was reported', async () => {
    const raw = turnJson('This must never be shown.')
    const record = harness({
      onUser: (child) => child.send(textDelta(raw), resultEvent(raw)),
    })
    await expect(stream(record)).rejects.toMatchObject({ kind: 'unsafe-tools' })
    expect(record.deltas).toEqual([])
    expect(record.killed).toHaveLength(1)
  })

  it('refuses a later report that lists tools', async () => {
    const raw = turnJson('This must never be shown.')
    const record = harness({
      onUser: (child) => {
        child.send(initEvent(), initEvent({ tools: ['Bash'] }), textDelta(raw), resultEvent(raw))
      },
    })
    await expect(stream(record)).rejects.toMatchObject({ kind: 'unsafe-tools' })
    expect(record.deltas).toEqual([])
  })

  it('ends the run when the model starts a tool of the CLI after all', async () => {
    const record = harness({
      onUser: (child) => {
        child.send(initEvent(), {
          type: 'stream_event',
          event: {
            type: 'content_block_start',
            index: 1,
            content_block: { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: {} },
          },
        })
      },
    })
    await expect(stream(record)).rejects.toMatchObject({ kind: 'unsafe-tools' })
    expect(record.killed).toHaveLength(1)
  })

  it('ends the run when the CLI asks for permission to use a tool', async () => {
    const record = harness({
      onUser: (child) => {
        child.send(initEvent(), {
          type: 'control_request',
          request_id: 'perm-1',
          request: { subtype: 'can_use_tool', tool_name: 'Bash', input: {} },
        })
      },
    })
    await expect(stream(record)).rejects.toMatchObject({ kind: 'unsafe-tools' })
  })

  it('has no option that turns the check off', async () => {
    const record = harness(answering(initEvent({ tools: ['Read'] })), {
      deps: { allowTools: true, skipToolCheck: true } as unknown as ClaudeCodeCliDeps,
    })
    await expect(stream(record)).rejects.toMatchObject({ kind: 'unsafe-tools' })
    const wd = createStreamWatchdog()
    const chat = harness(answering(initEvent({ tools: ['Read'] })))
    await expect(
      wd.guard(() => chatClaudeCodeCli(wd, config, 'system', 'hi', chat.deps)),
    ).rejects.toMatchObject({ kind: 'unsafe-tools' })
  })
})

describe('Claude Code bridge: subscription usage', () => {
  it('converts both windows, seconds to milliseconds', () => {
    expect(
      claudeCodeUsage({
        status: 'allowed',
        resetsAt: 1791879000,
        rateLimitType: 'five_hour',
        unifiedWindows: {
          five_hour: { utilization: 0.64, resetsAt: 1791879000 },
          seven_day: { utilization: 0.14, resetsAt: 1792389600 },
        },
      }),
    ).toEqual([
      { provider: 'claude-code', window: 'five_hour', utilization: 0.64, resetsAt: 1791879000000 },
      { provider: 'claude-code', window: 'seven_day', utilization: 0.14, resetsAt: 1792389600000 },
    ])
  })

  it('leaves out a window that has no real reset time or no utilization', () => {
    expect(
      claudeCodeUsage({
        unifiedWindows: {
          five_hour: { utilization: 0.5 },
          seven_day: { utilization: 0.2, resetsAt: 0 },
        },
      }),
    ).toEqual([])
    expect(
      claudeCodeUsage({
        unifiedWindows: {
          five_hour: { resetsAt: 1791879000 },
          seven_day: { utilization: 1.3, resetsAt: 1792389600 },
          seven_day_overage_included: { utilization: 0.1, resetsAt: 1792389600 },
        },
      }),
    ).toEqual([
      { provider: 'claude-code', window: 'seven_day', utilization: 1, resetsAt: 1792389600000 },
    ])
    expect(claudeCodeUsage(undefined)).toEqual([])
    expect(claudeCodeUsage({ status: 'allowed' })).toEqual([])
  })

  it('reads the limiting window when the per-window report is absent', () => {
    expect(
      claudeCodeUsage({
        status: 'allowed_warning',
        rateLimitType: 'seven_day',
        utilization: 0.91,
        resetsAt: 1792389600,
      }),
    ).toEqual([
      { provider: 'claude-code', window: 'seven_day', utilization: 0.91, resetsAt: 1792389600000 },
    ])
    expect(
      claudeCodeUsage({ rateLimitType: 'overage', utilization: 0.4, resetsAt: 1792389600 }),
    ).toEqual([])
  })

  it('sends the windows on when the CLI reports them, and nothing when there is nothing to show', async () => {
    const raw = turnJson('Done.')
    const record = harness({
      onUser: (child) => {
        child.send(
          initEvent(),
          textDelta(raw),
          rateLimitEvent({ status: 'allowed' }),
          rateLimitEvent({
            status: 'allowed',
            unifiedWindows: {
              five_hour: { utilization: 0.82, resetsAt: 1791879000 },
              seven_day: { utilization: 0.14 },
            },
          }),
          resultEvent(raw),
        )
      },
    })
    await stream(record)
    expect(record.subscriptionUsage).toEqual([
      [
        {
          provider: 'claude-code',
          window: 'five_hour',
          utilization: 0.82,
          resetsAt: 1791879000000,
        },
      ],
    ])
  })
})

describe('Claude Code bridge: failures', () => {
  /** The CLI's own failure report: a synthetic assistant message, then an error result */
  function failing(
    error: string | undefined,
    text: string,
    status: number | null,
    before: unknown[] = [],
  ): FakeScript {
    return {
      onUser: (child) => {
        child.send(
          initEvent(),
          ...before,
          {
            type: 'assistant',
            message: { model: '<synthetic>', content: [{ type: 'text', text }] },
            ...(error ? { error } : {}),
            is_api_error_message: true,
          },
          resultEvent(text, {
            is_error: true,
            api_error_status: status,
            terminal_reason: 'api_error',
            stop_reason: 'stop_sequence',
          }),
        )
        child.exit(1)
      },
    }
  }

  it('maps a failed login to signed-out', async () => {
    const record = harness(
      failing('authentication_failed', 'Not logged in · Please run /login', 401),
    )
    await expect(stream(record)).rejects.toMatchObject({
      name: 'AiRunError',
      kind: 'signed-out',
      provider: 'claude-code',
    })
    expect(record.deltas).toEqual([])
  })

  it('maps a login failure the CLI only describes in words to signed-out', async () => {
    const record = harness(failing(undefined, 'Invalid API key · Please run /login', null))
    await expect(stream(record)).rejects.toMatchObject({ kind: 'signed-out' })
  })

  it('maps an exhausted subscription limit to rate-limit with the reset time', async () => {
    const record = harness(
      failing('rate_limit', "You've hit your session limit · resets 3pm", 429, [
        rateLimitEvent({
          status: 'rejected',
          resetsAt: 1791879000,
          rateLimitType: 'five_hour',
          unifiedWindows: { five_hour: { utilization: 1, resetsAt: 1791879000 } },
        }),
      ]),
    )
    const failure = await stream(record).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure).toMatchObject({
      kind: 'rate-limit',
      provider: 'claude-code',
      resetsAt: 1791879000000,
    })
    // the exhausted window still reaches the usage display
    expect(record.subscriptionUsage).toHaveLength(1)
  })

  it('reports rate-limit without a reset time when the CLI gave none', async () => {
    const record = harness(failing('rate_limit', 'Rate limited', 429))
    const failure = (await stream(record).catch((error: unknown) => error)) as AiRunError
    expect(failure.kind).toBe('rate-limit')
    expect(failure.resetsAt).toBeUndefined()
  })

  it('maps capacity, connectivity and timeout failures to the existing kinds', async () => {
    await expect(stream(harness(failing('overloaded', 'Overloaded', 529)))).rejects.toMatchObject({
      kind: 'overloaded',
    })
    await expect(
      stream(harness(failing('unknown', 'API Error: Repeated 529 errors', 529))),
    ).rejects.toMatchObject({ kind: 'overloaded' })
    await expect(
      stream(harness(failing('unknown', 'API Error: Connection error.', null))),
    ).rejects.toMatchObject({ kind: 'network' })
    await expect(
      stream(harness(failing('unknown', 'Unable to connect to API (ENOTFOUND)', null))),
    ).rejects.toMatchObject({ kind: 'network' })
    await expect(
      stream(harness(failing('unknown', 'API Error: Request timed out.', null))),
    ).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('passes any other failure on with the text of the CLI', async () => {
    const text = "There's an issue with the selected model (nope). It may not exist."
    const failure = await stream(harness(failing('model_not_found', text, 404))).catch(
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect(failure).not.toBeInstanceOf(AiRunError)
    expect((failure as Error).message).toContain(text)
  })

  it('maps a CLI too old for a flag to needs-update', async () => {
    const record = harness({
      onInitialize: (child) => {
        child.stderr.write("error: unknown option '--restricted'\n")
        child.exit(1)
      },
    })
    await expect(stream(record)).rejects.toMatchObject({
      kind: 'needs-update',
      provider: 'claude-code',
    })
    expect(record.child!.lines.some((line) => line.type === 'user')).toBe(false)
  })

  it('maps a CLI that rejects the setup request to needs-update and never sends the conversation', async () => {
    const record = harness({
      onInitialize: (child, request) => {
        child.send({
          type: 'control_response',
          response: {
            subtype: 'error',
            request_id: request.request_id,
            error: 'Unsupported control request subtype: initialize',
          },
        })
      },
    })
    await expect(stream(record)).rejects.toMatchObject({ kind: 'needs-update' })
    expect(record.child!.lines.some((line) => line.type === 'user')).toBe(false)
    expect(record.killed).toHaveLength(1)
  })

  it('reports a CLI that exits without answering, signed out or otherwise', async () => {
    const signedOut = harness({
      onUser: (child) => {
        child.stderr.write('Not logged in · Please run /login\n')
        child.exit(1)
      },
    })
    await expect(stream(signedOut)).rejects.toMatchObject({ kind: 'signed-out' })

    const crashed = harness({
      onUser: (child) => {
        child.stderr.write('panic: something broke\n')
        child.exit(3)
      },
    })
    const failure = await stream(crashed).catch((error: unknown) => error)
    expect(failure).not.toBeInstanceOf(AiRunError)
    expect((failure as Error).message).toMatch(/exited \(3\)/)
    expect((failure as Error).message).toContain('something broke')
  })

  it('ends the run when a callback of the caller throws', async () => {
    const record = harness(answer(turnJson('Done.')))
    record.callbacks.onDelta = () => {
      throw new Error('renderer is gone')
    }
    await expect(stream(record)).rejects.toThrow('renderer is gone')
    expect(record.killed).toEqual([record.child])
  })

  it('stops a CLI that writes an endless line', async () => {
    const record = harness({
      onUser: (child) => {
        child.send(initEvent())
        child.stdout.write('x'.repeat(MAX_SSE_LINE_BYTES + 16))
      },
    })
    await expect(stream(record)).rejects.toThrow(/without a newline/)
    expect(record.killed).toHaveLength(1)
  })
})

describe('Claude Code bridge: cancelling and process lifetime', () => {
  it('ends the process tree on cancel and settles as an abort', async () => {
    const controller = new AbortController()
    const record = harness(
      {
        onUser: (child) => {
          child.send(initEvent(), textDelta('{"text":"Star'))
          setTimeout(() => controller.abort(), 10)
        },
      },
      { signal: controller.signal },
    )
    const failure = await stream(record).then(
      () => undefined,
      (error: unknown) => error,
    )
    // the caller sends its completion chunk when the run settles with the signal aborted
    expect((failure as Error).name).toBe('AbortError')
    expect(controller.signal.aborted).toBe(true)
    expect(record.killed).toEqual([record.child])
    expect(record.deltas.join('')).toBe('Star')
  })

  it('does not start anything for a run that is already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const record = harness(answer(turnJson('Done.')), { signal: controller.signal })
    await expect(stream(record)).rejects.toMatchObject({ name: 'AbortError' })
    expect(record.child).toBeUndefined()
  })

  it('closes stdin after the answer and ends a CLI that does not leave by itself', async () => {
    const raw = turnJson('Done.')
    const record = harness({
      onUser: (child) => child.send(initEvent(), textDelta(raw), resultEvent(raw)),
      // ignores the end of input and stays alive
      onStdinEnd: () => undefined,
    })
    await stream(record)
    expect(record.deltas.join('')).toBe('Done.')
    await vi.waitFor(() => expect(record.killed).toEqual([record.child]))
  })

  it('leaves a CLI that exits by itself alone', async () => {
    const record = harness(answer(turnJson('Done.')))
    await stream(record)
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(record.killed).toEqual([])
  })

  it('registers the process for shutdown while it runs', async () => {
    const ended: number[] = []
    const registry = createSubscriptionChildRegistry({ killTree: (pid) => ended.push(pid) })
    let sizeDuringRun = -1
    const raw = turnJson('Done.')
    const record = harness(
      {
        onUser: (child) => {
          sizeDuringRun = registry.size
          child.send(initEvent(), textDelta(raw), resultEvent(raw))
        },
      },
      { deps: { registry } },
    )
    await stream(record)
    expect(sizeDuringRun).toBe(1)
    await vi.waitFor(() => expect(registry.size).toBe(0))
    expect(ended).toEqual([])
  })

  it('surfaces a stalled CLI as a timeout and ends it', async () => {
    // the CLI reports its tools and then goes silent
    const record = harness({ onUser: (child) => child.send(initEvent()) })
    const wd = createStreamWatchdog(undefined, 1_000, 1_000)
    const failure = await wd
      .guard(() =>
        streamClaudeCodeCli(
          config,
          'system',
          [{ role: 'user', text: 'hi' }],
          tools,
          1024,
          { ...record.callbacks, signal: wd.signal, onActivity: () => wd.touch() },
          record.deps,
        ),
      )
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(AiTimeoutError)
    expect(record.killed).toEqual([record.child])
  })
})

/** The `models` of the initialize response, as Claude Code 2.1.287 gives them */
const LISTED_MODELS = [
  {
    value: 'default',
    resolvedModel: 'claude-opus-5-5',
    displayName: 'Default (recommended)',
    description: 'Opus 5.5 · Best for everyday, complex tasks',
  },
  { value: 'opus', resolvedModel: 'claude-opus-5-5', displayName: 'Opus 5.5' },
  { value: 'fable', resolvedModel: 'claude-fable-5-1', displayName: 'Fable 5.1' },
  { value: 'sonnet', resolvedModel: 'claude-sonnet-5-5', displayName: 'Sonnet 5.5' },
  { value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001', displayName: 'Haiku 4.5' },
  { value: 'claude-sonnet-5', displayName: 'Sonnet 5' },
]

function initializeWith(response: unknown): FakeScript {
  return {
    onInitialize: (child, request) =>
      child.send({
        type: 'control_response',
        response: { subtype: 'success', request_id: request.request_id, response },
      }),
  }
}

describe('Claude Code bridge: the model list', () => {
  const list = (
    record: RunRecord,
    request: Partial<Parameters<typeof listClaudeCodeModels>[0]> = {},
  ) => listClaudeCodeModels({ signal: record.callbacks.signal, ...request }, record.deps)

  it('maps what the CLI lists: the value it takes, its name, what it resolves to', async () => {
    const record = harness(
      initializeWith({
        commands: [],
        models: LISTED_MODELS,
        account: { email: 'jun.il@school.kr', organization: 'Acme Hagwon Seoul' },
      }),
    )
    const models = await list(record)
    expect(models).toEqual([
      // the CLI's own default is what an empty selection runs
      { id: '', label: 'Default (recommended)', resolved: 'claude-opus-5-5', isDefault: true },
      { id: 'opus', label: 'Opus 5.5', resolved: 'claude-opus-5-5' },
      { id: 'fable', label: 'Fable 5.1', resolved: 'claude-fable-5-1' },
      { id: 'sonnet', label: 'Sonnet 5.5', resolved: 'claude-sonnet-5-5' },
      { id: 'haiku', label: 'Haiku 4.5', resolved: 'claude-haiku-4-5-20251001' },
      { id: 'claude-sonnet-5', label: 'Sonnet 5' },
    ])
    // the account in the same response is not read
    expect(JSON.stringify(models)).not.toMatch(/school|Acme/)
  })

  it('starts the CLI the way a turn does, and sends the initialize request and nothing else', async () => {
    const record = harness(initializeWith({ models: LISTED_MODELS }), {
      baseEnv: { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'sk-ant', CLAUDE_CODE_USE_BEDROCK: '1' },
    })
    await list(record)
    const child = record.child!
    expect(record.command).toBe(PROGRAM.command)
    expect(record.args).toEqual(claudeCodeCliLaunchArgs(''))
    expect(record.args).not.toContain('--model')
    expect(record.options?.shell).toBeUndefined()
    // an empty directory of its own, removed afterwards (checked by the afterEach above)
    expect(String(record.options?.cwd)).toMatch(/genoffice-claude-code-/)
    const env = record.options?.env as NodeJS.ProcessEnv
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined()

    expect(child.lines).toHaveLength(1)
    expect(child.lines[0]).toMatchObject({
      type: 'control_request',
      request: { subtype: 'initialize' },
    })
    // no user message: no model was asked anything
    expect(child.lines.some((line) => line.type === 'user')).toBe(false)
    // the process was told to leave, and left
    expect(child.stdinEnded).toBe(true)
    expect(record.killed).toEqual([])
  })

  it('ends a CLI that does not leave after it answered', async () => {
    const record = harness({
      ...initializeWith({ models: LISTED_MODELS }),
      onStdinEnd: () => undefined,
    })
    expect(await list(record)).toHaveLength(LISTED_MODELS.length)
    await vi.waitFor(() => expect(record.killed).toEqual([record.child]))
  })

  it('reads a missing or malformed list as no list', async () => {
    for (const response of [
      { commands: [] },
      { models: 'opus' },
      { models: [null, 7, { displayName: 'No value' }, { value: '--flag', displayName: 'x' }] },
      'not an object',
      undefined,
    ]) {
      const record = harness(initializeWith(response))
      expect(await list(record), JSON.stringify(response)).toEqual([])
      expect(record.child!.lines.some((line) => line.type === 'user')).toBe(false)
    }
  })

  it('reads a CLI that rejects the request as no list', async () => {
    const record = harness({
      onInitialize: (child, request) =>
        child.send({
          type: 'control_response',
          response: { subtype: 'error', request_id: request.request_id, error: 'unknown' },
        }),
    })
    expect(await list(record)).toEqual([])
    expect(record.child!.stdinEnded).toBe(true)
  })

  it('gives up on a CLI that does not answer in time and ends its process tree', async () => {
    const record = harness({ onInitialize: () => undefined })
    const failure = await list(record, { timeoutMs: 30 }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect(record.killed).toEqual([record.child])
    expect(record.child!.lines.some((line) => line.type === 'user')).toBe(false)
  })

  it('ends the process tree when the caller gives up', async () => {
    const controller = new AbortController()
    const record = harness(
      { onInitialize: () => setTimeout(() => controller.abort(), 10) },
      { signal: controller.signal },
    )
    await expect(list(record)).rejects.toMatchObject({ name: 'AbortError' })
    expect(record.killed).toEqual([record.child])

    const already = new AbortController()
    already.abort()
    const unstarted = harness(initializeWith({ models: LISTED_MODELS }), { signal: already.signal })
    await expect(list(unstarted)).rejects.toMatchObject({ name: 'AbortError' })
    expect(unstarted.child).toBeUndefined()
  })

  it('stops a CLI that does anything but answer the request', async () => {
    for (const event of [
      { type: 'control_request', request_id: 'x', request: { subtype: 'can_use_tool' } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } },
      resultEvent('Hello'),
    ]) {
      const record = harness({ onInitialize: (child) => child.send(event) })
      await expect(list(record)).rejects.toBeInstanceOf(Error)
      expect(record.killed).toEqual([record.child])
      // nothing was answered and nothing was sent after the request
      expect(record.child!.lines).toHaveLength(1)
    }
  })

  it('reports a CLI that exits before answering, without repeating what it printed', async () => {
    const record = harness({
      onInitialize: (child) => {
        child.stderr.write('Error: organization Acme Hagwon Seoul has disabled Claude Code\n')
        child.exit(1)
      },
    })
    const failure = (await list(record).catch((error: unknown) => error)) as Error
    expect(failure).toBeInstanceOf(Error)
    expect(failure.message).not.toMatch(/Acme|Seoul/)
  })

  it('is the model source of the status check for Claude', async () => {
    const record = harness(initializeWith({ models: LISTED_MODELS }))
    const models = claudeCodeModels({ models: LISTED_MODELS })
    expect(await list(record)).toEqual(models)
    expect(subscriptionModelsOf(models)).toEqual(models)
  })
})

describe('Claude Code bridge: one-shot chat', () => {
  it('answers in plain text, with no structure and no tool list', async () => {
    const record = harness({
      onUser: (child) => {
        child.send(
          initEvent(),
          textDelta('Hello '),
          textDelta('there.'),
          resultEvent('Hello there.'),
        )
      },
    })
    const wd = createStreamWatchdog()
    const reply = await wd.guard(() =>
      chatClaudeCodeCli(wd, config, 'CHAT SYSTEM', 'CHAT-USER-TEXT', record.deps),
    )
    expect(reply).toEqual({ ok: true, content: 'Hello there.' })
    expect(record.args).toEqual(claudeCodeCliLaunchArgs('haiku'))
    expect(record.args.join('\n')).not.toContain('CHAT-USER-TEXT')
    const [initialize, user] = record.child!.lines
    expect(initialize.request.systemPrompt[0]).toBe('CHAT SYSTEM')
    expect(initialize.request.systemPrompt.join('\n')).toMatch(/no tools of your own/i)
    expect(initialize.request.systemPrompt.join('\n')).not.toMatch(/JSON object/i)
    expect(user.message.content).toEqual([{ type: 'text', text: 'CHAT-USER-TEXT' }])
  })

  it('uses the final message when nothing was streamed and reports an empty answer', async () => {
    const whole = harness({
      onUser: (child) => child.send(initEvent(), resultEvent('Only at the end.')),
    })
    const wd = createStreamWatchdog()
    await expect(
      wd.guard(() => chatClaudeCodeCli(wd, config, 'system', 'hi', whole.deps)),
    ).resolves.toEqual({ ok: true, content: 'Only at the end.' })

    const empty = harness({ onUser: (child) => child.send(initEvent(), resultEvent('')) })
    const wd2 = createStreamWatchdog()
    const reply = await wd2.guard(() => chatClaudeCodeCli(wd2, config, 'system', 'hi', empty.deps))
    expect(reply.ok).toBe(false)
  })

  it('rejects with the run error of a failed chat', async () => {
    const record = harness({
      onUser: (child) => {
        child.send(
          initEvent(),
          { type: 'assistant', message: { content: [] }, error: 'authentication_failed' },
          resultEvent('Please run /login', { is_error: true, api_error_status: 401 }),
        )
      },
    })
    const wd = createStreamWatchdog()
    await expect(
      wd.guard(() => chatClaudeCodeCli(wd, config, 'system', 'hi', record.deps)),
    ).rejects.toMatchObject({ kind: 'signed-out' })
  })
})

describe('Claude Code bridge: the response schema', () => {
  it('lists the application tool names and forbids calls when there are none', () => {
    const schema = claudeCodeOutputSchema(tools) as any
    expect(schema.required).toEqual(['text', 'toolCalls'])
    expect(schema.properties.toolCalls.items.properties.name.enum).toEqual(['replace_text'])
    expect(schema.properties.toolCalls.items.required).toEqual(['name', 'inputJson'])
    expect((claudeCodeOutputSchema([]) as any).properties.toolCalls.maxItems).toBe(0)
  })
})
