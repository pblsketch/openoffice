/**
 * Bridge to the Claude Code CLI (protocol `claude-code-cli`). Entry point
 * `@genoffice/ai-provider/claude-code-cli`.
 *
 * The locally installed, already signed-in CLI answers one model turn. The app
 * keeps its own agent loop and runs its own tools, as with the Codex bridge:
 * the model is told to answer with one structured turn (text plus requested
 * tool calls) that follows a JSON Schema built from the app's tool list.
 *
 * One CLI process serves one turn and then ends. Everything the model reads
 * (system prompt, conversation, images) goes over stdin; the command line
 * carries fixed flags, the model name and, for a structured turn, the schema,
 * which holds nothing but the app's tool names.
 *
 * A structured turn passes the schema to the CLI's own `--json-schema`
 * (decision 0082). Told in words to answer with JSON, the model kept slipping
 * into its own tool-call markup and runaway repetition; with the option, it
 * answers through the CLI's `StructuredOutput` tool, which the CLI validates
 * against the schema and answers itself. That tool is the only one a
 * structured turn runs with: the CLI must report exactly it, and any other
 * tool, tool block or permission request ends the run. A plain turn and the
 * model list run with no tool at all.
 */
import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import type { AgentMessage, AgentToolCall, AgentToolDef } from '@genoffice/agent-core'
import { isAiNetworkError } from './network-error'
import { createTrackedTempDir, removeTrackedTempDir } from './subscription/temp-dirs'
import {
  MAX_SSE_LINE_BYTES,
  isPlainObject,
  parseToolInput,
  throwIfToolCountOverBudget,
  throwIfToolJsonOverBudget,
  usageCount,
  type StreamCallbacks,
} from './protocols/shared'
import { AiRunError } from './run-error'
import { resolveSubscriptionProgram, type SubscriptionProgram } from './subscription/locate'
import { setSubscriptionModelSource } from './subscription/models'
import {
  killProcessTree,
  spawnSubscriptionProgram,
  type SubscriptionChildRegistry,
  type SubscriptionSpawn,
} from './subscription/process'
import type {
  AiChatResponse,
  AiProviderConfig,
  AiSubscriptionModel,
  AiSubscriptionUsage,
  AiTokenUsage,
  AiUsageWindow,
} from './types'
import { createStreamWatchdog, type StreamWatchdog } from './watchdog'

const PROVIDER = 'claude-code'
const BUDGET_LABEL = 'claude-code-cli'
const DIAGNOSTIC_LIMIT = 4_000
const TEMP_PREFIX = 'genoffice-claude-code-'
const INITIALIZE_REQUEST_ID = 'initialize'
/** How long a CLI may take to leave after its stdin was closed, before its process tree is ended */
const EXIT_GRACE_MS = 5_000

/**
 * Background work a run started per turn has no use for. A self-update that a
 * short-lived turn begins could be cut off when the turn ends; the CLI still
 * updates itself when the user runs it in a terminal. Neither touches the login
 * or the billing path.
 */
const CLAUDE_CODE_RUN_ENV: Readonly<Record<string, string>> = {
  DISABLE_AUTOUPDATER: '1',
  DISABLE_TELEMETRY: '1',
}

/**
 * Most images one request may carry (the Anthropic API's limit per request).
 * Older images beyond it are left out, and the caller is told the input was cut.
 */
export const MAX_CLAUDE_CODE_IMAGES = 100

/**
 * Cross-layer contracts with the agent loop (see agent-core `loop.ts`): a turn
 * that fails with the first mark and delivered nothing is replayed, and a turn
 * that fails with the second and delivered no tool call is replayed once.
 */
const EMPTY_STREAM_MARK = '(empty stream)'
const TOOL_ARGS_DROP_MARK = 'while sending tool arguments'

/**
 * The CLI's own tool that `--json-schema` adds: the model hands its answer to
 * it, and the CLI checks the answer against the schema and acknowledges it
 * without asking anyone. It is the one tool a structured turn may run with.
 */
const STRUCTURED_OUTPUT_TOOL = 'StructuredOutput'

/** A tool name as the model APIs take it; only names of this shape go on the command line */
const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/

const NO_TOOLS_INSTRUCTIONS =
  'You are the language-model backend embedded in an office application. You have no tools of your own: you cannot read or change files, run commands, browse the web or call any tool, and you must not try.'

const STRUCTURED_INSTRUCTIONS =
  'You are the language-model backend embedded in an office application. You cannot read or change files, run commands or browse the web yourself, and you must not try. ' +
  `The caller supplies the conversation so far and the list of application tools. Give your whole answer by calling ${STRUCTURED_OUTPUT_TOOL} exactly once; write nothing outside that call. ` +
  'Write the "text" property first and put the user-visible prose there. ' +
  'Put the application tool calls you request in "toolCalls"; each "inputJson" must be a JSON-encoded object matching that tool\'s inputSchema; use only the listed tool names; return an empty "toolCalls" array when no tool is needed. ' +
  'Never write a tool call into "text": a call written as text is never run. ' +
  `The application tools are not tools of yours: do not call them directly, request them in "toolCalls" of the ${STRUCTURED_OUTPUT_TOOL} call. ` +
  'The application runs the requested tools itself and reports their results in the next turn.'

const PLAIN_INSTRUCTIONS = `${NO_TOOLS_INSTRUCTIONS} Answer the request directly.`

/**
 * The `note` of every tool-result event. Every turn is a fresh CLI session
 * that reads the whole conversation as one user message, and a smaller model
 * then tends to answer the first user event again and re-request calls that
 * already ran (seen live: one requested paragraph inserted four times).
 *
 * It is a field of the event, the same text on each one, and never a block of
 * its own after the events: a block that is last in one turn and gone in the
 * next would make that turn's blocks no prefix of the next turn's, and a tool
 * loop would read its whole input uncached every turn.
 */
const AFTER_TOOL_RESULTS =
  'These are the results of the tool calls requested in the event before this one. The application has already run those calls exactly once: do not request them again. ' +
  'Continue from the results: request only the further calls that are still needed, or finish with an empty "toolCalls" array.'

// ── What the CLI is started with ──

/** A model alias or id as the CLI takes it; never something that could read as an option */
export const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:[\]-]{0,127}$/

/**
 * The whole command line: fixed flags, plus the configured model and, for a
 * structured turn, the output schema. Built-in tools off (`--tools ""`),
 * user/project/local settings and with them hooks and plugins ignored
 * (`--restricted`, `--setting-sources ""`), no MCP server from any
 * configuration (`--strict-mcp-config`), no skills, nothing written to the
 * session store. Never `--bare`: that mode does not read the subscription
 * login. The flags are not trusted: the run checks the tool list the CLI
 * reports.
 *
 * The schema is built by `claudeCodeOutputSchema` from tool names only, and
 * every name must have the shape model APIs take, so nothing a person wrote
 * reaches the command line.
 */
export function claudeCodeCliLaunchArgs(
  model: string,
  outputSchema?: Record<string, unknown>,
): string[] {
  const name = model.trim()
  if (name && !MODEL_NAME.test(name)) {
    throw new Error(`Invalid Claude Code model name: ${name.slice(0, 80)}`)
  }
  return [
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
    ...(name ? ['--model', name] : []),
    ...(outputSchema ? ['--json-schema', JSON.stringify(outputSchema)] : []),
  ]
}

// ── What goes over stdin ──

export type ClaudeCodeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

export interface ClaudeCodeInput {
  /** first line: sets the system prompt, in place of the CLI's own */
  initialize: {
    type: 'control_request'
    request_id: string
    request: { subtype: 'initialize'; systemPrompt: string[] }
  }
  /** second line, sent once the first was accepted: the turn's input */
  user: { type: 'user'; message: { role: 'user'; content: ClaudeCodeContentBlock[] } }
  /** images were left out to fit `MAX_CLAUDE_CODE_IMAGES` */
  truncated: boolean
}

/**
 * The structured turn the model must answer with: prose, and calls to the app's
 * tools by name. It goes on the command line, so it carries the tool names and
 * nothing else of the tools, and a name of any other shape is refused.
 */
export function claudeCodeOutputSchema(tools: AgentToolDef[]): Record<string, unknown> {
  for (const tool of tools) {
    if (!TOOL_NAME.test(tool.name)) {
      throw new Error(`Invalid tool name for Claude Code: ${tool.name.slice(0, 80)}`)
    }
  }
  return {
    type: 'object',
    properties: {
      text: { type: 'string' },
      toolCalls: {
        type: 'array',
        ...(tools.length === 0 ? { maxItems: 0 } : {}),
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              ...(tools.length > 0 ? { enum: tools.map((tool) => tool.name) } : {}),
            },
            inputJson: { type: 'string' },
          },
          required: ['name', 'inputJson'],
          additionalProperties: false,
        },
      },
    },
    required: ['text', 'toolCalls'],
    additionalProperties: false,
  }
}

function initializeRequest(system: string, instructions: string): ClaudeCodeInput['initialize'] {
  return {
    type: 'control_request',
    request_id: INITIALIZE_REQUEST_ID,
    request: {
      subtype: 'initialize',
      systemPrompt: [system, instructions].filter((part) => part.trim()),
    },
  }
}

/**
 * The two stdin lines of a structured turn. The user message is a list of
 * blocks: the tool list and the schema first, then one JSON object per
 * conversation event with a user event's images right after it. A tool-result
 * event carries a note that its calls already ran. A later turn of the same
 * conversation repeats the earlier blocks unchanged and appends to them,
 * whatever event the earlier turn ended on, so the provider's prompt cache can
 * serve the common prefix.
 */
export function buildClaudeCodeInput(
  system: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  maxTokens: number,
): ClaudeCodeInput {
  const imageCount = messages.reduce(
    (count, message) => count + (message.role === 'user' ? (message.images?.length ?? 0) : 0),
    0,
  )
  // the oldest images go first: the newest are the ones the user is asking about
  let toOmit = Math.max(0, imageCount - MAX_CLAUDE_CODE_IMAGES)
  const truncated = toOmit > 0
  const content: ClaudeCodeContentBlock[] = [
    {
      type: 'text',
      text: [
        '<app_tools>',
        JSON.stringify(
          tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        ),
        '</app_tools>',
        '<response_schema>',
        JSON.stringify(claudeCodeOutputSchema(tools)),
        '</response_schema>',
        'The content blocks after this one are the conversation so far, in order: one JSON object per event, and the images attached to a user event right after it.',
        `Answer the conversation with one ${STRUCTURED_OUTPUT_TOOL} call whose input matches response_schema, "text" first, and nothing outside it.`,
        `Keep this one-turn response within roughly ${maxTokens} output tokens.`,
      ].join('\n'),
    },
  ]
  let imageIndex = 0
  for (const message of messages) {
    if (message.role === 'user') {
      const images = message.images ?? []
      const omitted = Math.min(toOmit, images.length)
      toOmit -= omitted
      const kept = images.slice(omitted)
      content.push({
        type: 'text',
        text: JSON.stringify({
          role: 'user',
          text: message.text,
          ...(kept.length > 0 ? { attachedImages: kept.map(() => `image-${++imageIndex}`) } : {}),
          ...(omitted > 0 ? { omittedImages: omitted } : {}),
        }),
      })
      for (const image of kept) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: image.mime, data: image.base64 },
        })
      }
    } else if (message.role === 'assistant') {
      content.push({
        type: 'text',
        text: JSON.stringify({
          role: 'assistant',
          text: message.text,
          ...(message.toolCalls?.length
            ? { toolCalls: message.toolCalls.map(({ id, name, input }) => ({ id, name, input })) }
            : {}),
        }),
      })
    } else {
      content.push({
        type: 'text',
        // the note last: it is what the model reads last when the turn ends on this event
        text: JSON.stringify({
          role: 'tool',
          results: message.results,
          note: AFTER_TOOL_RESULTS,
        }),
      })
    }
  }
  return {
    initialize: initializeRequest(system, STRUCTURED_INSTRUCTIONS),
    user: { type: 'user', message: { role: 'user', content } },
    truncated,
  }
}

// ── Reading the structured turn ──

/** The answer does not follow the response schema; the run hands it to the loop's replay path */
export class ClaudeCodeStructureError extends Error {}

/**
 * Parse the model's answer into text and tool calls. A call to a tool that is
 * not in the app's list is never run: it is passed on with an input error, the
 * same way unparseable input is, so the loop reports it back to the model.
 * Throws a structure error when the answer is not the structure at all.
 */
export function parseClaudeCodeTurn(
  raw: string,
  tools: AgentToolDef[],
  idPrefix = 'claude',
): { text: string; toolCalls: AgentToolCall[] } {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error) {
    // the object may sit inside a sentence the model added around it
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    // No object at all: the model answered in plain prose (seen live: a bare "done" after
    // its tool calls had run). That is an answer without tool calls, not a broken one.
    if (start < 0 && trimmed) return { text: trimmed, toolCalls: [] }
    try {
      if (start < 0 || end <= start) throw error
      parsed = JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      throw new ClaudeCodeStructureError(
        `the answer is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  }
  if (!isPlainObject(parsed) || typeof parsed.text !== 'string') {
    throw new ClaudeCodeStructureError('the "text" field is missing or not a string')
  }
  const calls = parsed.toolCalls ?? []
  if (!Array.isArray(calls)) {
    throw new ClaudeCodeStructureError('the "toolCalls" field is not an array')
  }
  // the schema is not enforced by the CLI, so the parsed turn is capped here
  throwIfToolCountOverBudget(calls.length, BUDGET_LABEL)
  const names = new Set(tools.map((tool) => tool.name))
  const toolCalls = calls.map((call: unknown): AgentToolCall => {
    if (!isPlainObject(call) || typeof call.name !== 'string' || !call.name) {
      throw new ClaudeCodeStructureError('a tool call has no name')
    }
    // ids are the bridge's own: every turn is a fresh CLI session, so the model cannot keep them unique
    const id = `${idPrefix}-${randomUUID()}`
    if (!names.has(call.name)) {
      const name = call.name.slice(0, 200)
      return {
        id,
        name,
        input: {},
        inputError: `"${name}" is not a tool of this application and was not run. Use only these tools: ${
          [...names].join(', ') || '(none are available)'
        }`,
      }
    }
    const given = call.inputJson ?? call.input
    const inputJson =
      typeof given === 'string' ? given : given === undefined ? '' : JSON.stringify(given)
    throwIfToolJsonOverBudget(inputJson.length, BUDGET_LABEL)
    const { input, error } = parseToolInput(inputJson)
    return { id, name: call.name, input, ...(error ? { inputError: error } : {}) }
  })
  return { text: parsed.text, toolCalls }
}

const TEXT_OPENING = /^\s*(?:```[A-Za-z]*\s*)?\{\s*"text"\s*:\s*"/
const TEXT_OPENING_SEARCH_LIMIT = 256

/** JSON escapes that stand for another character than the one written */
const SIMPLE_ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff
}

/**
 * Decodes the `text` string of a structured turn while its JSON is still
 * arriving, so prose reaches the user as it is written. Only an answer that
 * opens with the `text` property is followed; anything else is delivered once
 * the whole answer has been parsed.
 */
export class TurnTextScanner {
  private pending = ''
  private state: 'opening' | 'text' | 'complete' | 'off' = 'opening'

  /** the answer opened with the `text` property */
  get started(): boolean {
    return this.state === 'text' || this.state === 'complete'
  }

  /** the closing quote of `text` was read */
  get complete(): boolean {
    return this.state === 'complete'
  }

  /** Feed more of the answer; returns the piece of `text` it completes */
  push(chunk: string): string {
    if (this.state === 'complete' || this.state === 'off') return ''
    let raw = this.pending + chunk
    if (this.state === 'opening') {
      const opening = TEXT_OPENING.exec(raw)
      if (!opening) {
        if (raw.length > TEXT_OPENING_SEARCH_LIMIT) this.state = 'off'
        this.pending = this.state === 'off' ? '' : raw
        return ''
      }
      raw = raw.slice(opening[0].length)
      this.state = 'text'
    }
    let out = ''
    let index = 0
    while (index < raw.length) {
      const char = raw[index]!
      if (char === '"') {
        this.state = 'complete'
        this.pending = ''
        return out
      }
      if (char !== '\\') {
        // half of a character outside the BMP: wait for the other half
        if (isHighSurrogate(char.charCodeAt(0)) && index + 1 >= raw.length) break
        out += char
        index++
        continue
      }
      if (index + 1 >= raw.length) break
      const escape = raw[index + 1]!
      if (escape !== 'u') {
        out += SIMPLE_ESCAPES[escape] ?? escape
        index += 2
        continue
      }
      if (index + 6 > raw.length) break
      const code = Number.parseInt(raw.slice(index + 2, index + 6), 16)
      if (Number.isNaN(code)) {
        out += 'u'
        index += 2
        continue
      }
      if (isHighSurrogate(code)) {
        const rest = raw.slice(index + 6, index + 12)
        // the pair's second escape may still be on its way
        if (rest.length < 6 && '\\u'.startsWith(rest.slice(0, 2))) break
        const low = rest.startsWith('\\u') ? Number.parseInt(rest.slice(2), 16) : Number.NaN
        if (low >= 0xdc00 && low <= 0xdfff) {
          out += String.fromCharCode(code, low)
          index += 12
          continue
        }
      }
      out += String.fromCharCode(code)
      index += 6
    }
    this.pending = raw.slice(index)
    return out
  }
}

// ── Subscription usage ──

const USAGE_WINDOWS: readonly AiUsageWindow[] = ['five_hour', 'seven_day']

function usageEntry(
  window: AiUsageWindow,
  utilization: unknown,
  resetsAt: unknown,
): AiSubscriptionUsage | null {
  if (typeof utilization !== 'number' || !Number.isFinite(utilization) || utilization < 0) {
    return null
  }
  // a window without a real reset time is not a usage value
  if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt) || resetsAt <= 0) return null
  return {
    provider: PROVIDER,
    window,
    // the CLI reports more than 1 when usage runs past a window's cap
    utilization: Math.min(1, utilization),
    resetsAt: Math.round(resetsAt * 1000),
  }
}

/**
 * The usage windows in the `rate_limit_info` of a `rate_limit_event`: one
 * entry per window (five-hour, seven-day) that has both a utilization and a
 * reset time. The CLI gives reset times in epoch seconds. Without the
 * per-window report, the one limiting window it names is read instead.
 */
export function claudeCodeUsage(rateLimitInfo: unknown): AiSubscriptionUsage[] {
  if (!isPlainObject(rateLimitInfo)) return []
  const usage: AiSubscriptionUsage[] = []
  const windows = rateLimitInfo.unifiedWindows
  if (isPlainObject(windows)) {
    for (const window of USAGE_WINDOWS) {
      const report = windows[window]
      if (!isPlainObject(report)) continue
      const entry = usageEntry(window, report.utilization, report.resetsAt)
      if (entry) usage.push(entry)
    }
    return usage
  }
  const limiting = USAGE_WINDOWS.find((window) => window === rateLimitInfo.rateLimitType)
  const entry = limiting
    ? usageEntry(limiting, rateLimitInfo.utilization, rateLimitInfo.resetsAt)
    : null
  if (entry) usage.push(entry)
  return usage
}

/** When the limit that rejected the run resets, in epoch ms; undefined when the CLI did not say */
function rejectedUntil(rateLimitInfo: Record<string, unknown> | undefined): number | undefined {
  if (rateLimitInfo?.status !== 'rejected') return undefined
  const resetsAt = rateLimitInfo.resetsAt
  return typeof resetsAt === 'number' && Number.isFinite(resetsAt) && resetsAt > 0
    ? Math.round(resetsAt * 1000)
    : undefined
}

// ── Failures ──

const UNKNOWN_OPTION = /unknown option|unknown argument|unrecognized option/i
const SIGNED_OUT_TEXT = /not logged in|please run \/login|invalid api key|authentication/i
const CONNECTION_TEXT = /connection error|unable to connect/i
const TIMEOUT_TEXT = /timed out|timeout/i

/**
 * The run error for a failure the CLI reported itself. `code` is the `error`
 * field of its synthetic assistant message (`authentication_failed`,
 * `rate_limit`, `overloaded`, `model_not_found`, …), `status` the
 * `api_error_status` of its result, `text` what it would have printed.
 */
export function reportedFailure(
  code: string | undefined,
  status: unknown,
  text: string,
  rateLimitInfo: Record<string, unknown> | undefined,
): Error {
  const message = text.trim() || 'Claude Code reported an error'
  if (code === 'authentication_failed' || status === 401) {
    return new AiRunError('signed-out', message, { provider: PROVIDER })
  }
  if (code === 'rate_limit' || status === 429) {
    const resetsAt = rejectedUntil(rateLimitInfo)
    return new AiRunError('rate-limit', message, {
      provider: PROVIDER,
      ...(resetsAt !== undefined ? { resetsAt } : {}),
    })
  }
  if (code === 'overloaded' || status === 529 || status === 503) {
    return new AiRunError('overloaded', message)
  }
  if (isAiNetworkError(message) || CONNECTION_TEXT.test(message)) {
    return new AiRunError('network', message)
  }
  if (TIMEOUT_TEXT.test(message)) return new AiRunError('timeout', message)
  if ((!code || code === 'unknown') && SIGNED_OUT_TEXT.test(message)) {
    return new AiRunError('signed-out', message, { provider: PROVIDER })
  }
  return new Error(message)
}

/** The run error for a CLI that ended without a result */
export function exitFailure(code: number | null, stderr: string): Error {
  const detail = stderr.trim()
  if (UNKNOWN_OPTION.test(detail)) {
    return new AiRunError(
      'needs-update',
      'Claude Code is too old for this app: it does not know an option it is started with',
      { provider: PROVIDER },
    )
  }
  // the text itself is not passed on: it can name the account
  if (SIGNED_OUT_TEXT.test(detail)) {
    return new AiRunError('signed-out', 'Claude Code is not signed in', { provider: PROVIDER })
  }
  return new Error(
    `Claude Code exited (${code ?? 'unknown'}) before answering${detail ? `: ${detail}` : ''}`,
  )
}

export function startFailure(error: unknown): Error {
  if ((error as { code?: unknown } | null)?.code === 'ENOENT') {
    return new AiRunError('not-installed', 'Claude Code CLI could not be started', {
      provider: PROVIDER,
    })
  }
  return new Error(
    `Claude Code could not be run: ${error instanceof Error ? error.message : String(error)}`,
    { cause: error },
  )
}

function cancelledError(): Error {
  const error = new Error('Claude Code request was cancelled')
  error.name = 'AbortError'
  return error
}

function appendDiagnostic(current: string, chunk: Buffer | string): string {
  const next = current + chunk.toString()
  return next.length <= DIAGNOSTIC_LIMIT ? next : next.slice(-DIAGNOSTIC_LIMIT)
}

// ── One turn ──

/** Stand-ins for tests; none of them relaxes what a run requires of the CLI */
export interface ClaudeCodeCliDeps {
  /** finds the CLI; `resolveSubscriptionProgram('claude-code')` when absent */
  resolveProgram?:
    ((configuredPath: string | undefined) => Promise<SubscriptionProgram>) | undefined
  spawn?: SubscriptionSpawn | undefined
  /** where the child is registered for shutdown; the shared registry when absent */
  registry?: SubscriptionChildRegistry | null | undefined
  /** environment to sanitise; the app's own when absent */
  baseEnv?: NodeJS.ProcessEnv | undefined
  /** ends the process tree; `killProcessTree` when absent */
  killTree?: ((child: { readonly pid?: number | undefined }) => void) | undefined
  exitGraceMs?: number | undefined
}

interface TurnRequest {
  mode: 'structured' | 'plain'
  input: ClaudeCodeInput
  tools: AgentToolDef[]
}

/** The tool list a turn may run with: the CLI's structured-output tool for a structured turn, none otherwise */
function expectedTools(mode: TurnRequest['mode']): readonly string[] {
  return mode === 'structured' ? [STRUCTURED_OUTPUT_TOOL] : []
}

function isStructuredOutputUse(block: unknown): block is Record<string, unknown> {
  return isPlainObject(block) && block.type === 'tool_use' && block.name === STRUCTURED_OUTPUT_TOOL
}

/**
 * The input of a direct app-tool call, in the shape `parseClaudeCodeTurn`
 * takes. The CLI does not know the tool, so the model guesses the input's
 * shape (seen live): it may wrap the real input as a `toolCalls` item's
 * `"inputJson"` string, or write an array or object field as a JSON string.
 * Both are undone against the tool's schema; numeric strings are left to the
 * loop, which repairs them for every provider.
 */
export function directCallInput(
  tool: AgentToolDef | undefined,
  input: unknown,
): { inputJson: string } | { input: Record<string, unknown> } {
  if (!isPlainObject(input)) return { input: {} }
  const keys = Object.keys(input)
  if (keys.length === 1 && keys[0] === 'inputJson' && typeof input.inputJson === 'string') {
    return { inputJson: input.inputJson }
  }
  const properties = tool?.inputSchema?.properties
  if (!isPlainObject(properties)) return { input }
  let out = input
  for (const [field, schema] of Object.entries(properties)) {
    const value = input[field]
    if (typeof value !== 'string' || !isPlainObject(schema)) continue
    const declared = (Array.isArray(schema.type) ? schema.type : [schema.type]).filter(
      (type): type is string => typeof type === 'string',
    )
    if (declared.includes('string')) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      continue
    }
    const fits =
      (declared.includes('array') && Array.isArray(parsed)) ||
      (declared.includes('object') && isPlainObject(parsed))
    if (!fits) continue
    if (out === input) out = { ...input }
    out[field] = parsed
  }
  return { input: out }
}

/** Split a stream into lines, giving up on a line that grows past the cap */
export function readLines(
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void,
  onOverflow: () => void,
): void {
  // a StringDecoder keeps a multi-byte character that straddles two chunks intact
  const decoder = new StringDecoder('utf8')
  let pending = ''
  let pendingBytes = 0
  let stopped = false
  const flush = (): void => {
    if (stopped) return
    stopped = true
    const tail = pending + decoder.end()
    pending = ''
    if (tail.trim()) onLine(tail)
  }
  stream.on('end', flush)
  stream.on('close', flush)
  stream.on('data', (chunk: Buffer) => {
    if (stopped) return
    pending += decoder.write(chunk)
    const parts = pending.split('\n')
    pending = parts.pop() ?? ''
    if (parts.length === 0) pendingBytes += chunk.length
    else pendingBytes = Buffer.byteLength(pending, 'utf8')
    for (const part of parts) if (part.trim()) onLine(part)
    if (pendingBytes > MAX_SSE_LINE_BYTES) {
      stopped = true
      pending = ''
      onOverflow()
    }
  })
}

function tokenUsage(usage: unknown): AiTokenUsage | null {
  if (!isPlainObject(usage)) return null
  // the prompt as sent: what was read from and written to the prompt cache counts too
  const input = [
    usage.input_tokens,
    usage.cache_creation_input_tokens,
    usage.cache_read_input_tokens,
  ].map(usageCount)
  const output = usageCount(usage.output_tokens)
  const result: AiTokenUsage = {}
  if (input.some((count) => count !== undefined)) {
    result.inputTokens = input.reduce<number>((sum, count) => sum + (count ?? 0), 0)
  }
  if (output !== undefined) result.outputTokens = output
  return result.inputTokens !== undefined || result.outputTokens !== undefined ? result : null
}

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((block) =>
      isPlainObject(block) && block.type === 'text' && typeof block.text === 'string'
        ? block.text
        : '',
    )
    .join('')
}

/** `tool_use`, `server_tool_use`, `mcp_tool_use`, and their results */
function isToolBlock(block: unknown): boolean {
  return (
    isPlainObject(block) &&
    typeof block.type === 'string' &&
    /tool_use$|tool_result$/.test(block.type)
  )
}

async function runClaudeCodeTurn(
  config: AiProviderConfig,
  request: TurnRequest,
  cb: StreamCallbacks,
  deps: ClaudeCodeCliDeps,
): Promise<void> {
  if (cb.signal.aborted) throw cancelledError()
  const { mode, tools } = request
  const args = claudeCodeCliLaunchArgs(
    config.model,
    mode === 'structured' ? claudeCodeOutputSchema(tools) : undefined,
  )
  const program = await (
    deps.resolveProgram ??
    ((configuredPath) => resolveSubscriptionProgram(PROVIDER, { configuredPath }))
  )(config.cliPath)
  if (cb.signal.aborted) throw cancelledError()
  if (request.input.truncated) cb.onInputTruncated?.()

  // an empty directory of the run's own: no project file of some other directory applies
  const cwd = await createTrackedTempDir(TEMP_PREFIX)
  const removeCwd = (): void => {
    void removeTrackedTempDir(cwd)
  }
  let child: ChildProcess
  try {
    if (cb.signal.aborted) throw cancelledError()
    child = spawnSubscriptionProgram(program, args, {
      cwd,
      baseEnv: deps.baseEnv,
      env: { ...CLAUDE_CODE_RUN_ENV },
      spawn: deps.spawn,
      registry: deps.registry,
    })
  } catch (error) {
    removeCwd()
    throw error instanceof Error && error.name === 'AbortError' ? error : startFailure(error)
  }

  const killTree = deps.killTree ?? ((target) => killProcessTree(target, { force: true }))
  const allowed = expectedTools(mode)
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let exited = false
    let stderr = ''
    /** the CLI accepted the system prompt */
    let initialized = false
    /** the CLI reported its tool list, and the list is exactly what the turn may run with */
    let verified = false
    /** the model's answer as streamed: the text of a plain turn, the StructuredOutput input of a structured one */
    let raw = ''
    /** the model's answer as carried by whole assistant messages */
    let whole = ''
    /** stream indexes of the StructuredOutput blocks of the current message */
    const structuredBlocks = new Set<number>()
    /** ids of the StructuredOutput calls, whose acknowledgement the CLI sends back itself */
    const structuredIds = new Set<string>()
    /**
     * A structured turn's model may call an app tool directly instead of naming
     * it in "toolCalls" (seen live: the editor prompts name the tools). The CLI
     * has no such tool, so the call cannot run there: `takeDirectCalls` takes it
     * as the turn's request and ends the CLI. Only a call to a tool of this
     * turn's list is let through, and the only result the CLI may send for it
     * is its "no such tool" error.
     */
    const appToolNames = new Set(mode === 'structured' ? tools.map((tool) => tool.name) : [])
    const appToolBlocks = new Set<number>()
    const appToolIds = new Set<string>()
    const isAppToolUse = (block: unknown): block is Record<string, unknown> =>
      isPlainObject(block) &&
      block.type === 'tool_use' &&
      typeof block.name === 'string' &&
      block.name !== STRUCTURED_OUTPUT_TOOL &&
      appToolNames.has(block.name)
    const toolNameOf = (block: unknown): string =>
      isPlainObject(block) && typeof block.name === 'string' ? ` (${block.name.slice(0, 80)})` : ''
    /** the answer as the CLI validated it, from its result */
    let structuredOutput: unknown
    /** what was passed to onDelta so far */
    let emitted = ''
    /** characters of a restarted answer that were already passed on */
    let skip = 0
    let scanner = new TurnTextScanner()
    let failureCode: string | undefined
    let failureText = ''
    let rateLimitInfo: Record<string, unknown> | undefined

    const stop = (force: boolean): void => {
      if (exited) return
      if (force) {
        killTree(child)
        return
      }
      // the CLI leaves by itself once its input ends; it is ended if it does not
      child.stdin?.end()
      const timer = setTimeout(() => {
        if (!exited) killTree(child)
      }, deps.exitGraceMs ?? EXIT_GRACE_MS)
      timer.unref?.()
      child.once('close', () => clearTimeout(timer))
    }
    /** `end`: the answer is complete but the CLI would go on working, so it is ended at once */
    const finish = (error?: Error, end = false): void => {
      if (settled) return
      settled = true
      cb.signal.removeEventListener('abort', onAbort)
      stop(error !== undefined || end)
      if (error) reject(error)
      else resolve()
    }
    const onAbort = (): void => finish(cancelledError())
    const refuse = (reason: string): void => {
      finish(new AiRunError('unsafe-tools', `${reason}; the run was stopped`))
    }
    const requireVerified = (): boolean => {
      if (!verified) refuse('Claude Code started answering before it reported its tool list')
      return verified
    }
    const write = (message: unknown): void => {
      // a CLI that is already gone is reported by the close handler
      if (child.stdin?.writable) child.stdin.write(`${JSON.stringify(message)}\n`)
    }

    const deliver = (piece: string): void => {
      if (skip > 0) {
        const repeated = Math.min(skip, piece.length)
        skip -= repeated
        piece = piece.slice(repeated)
      }
      if (!piece) return
      emitted += piece
      cb.onDelta(piece)
    }
    const deliverRest = (text: string): void => {
      if (text.length > emitted.length && text.startsWith(emitted)) {
        const rest = text.slice(emitted.length)
        emitted = text
        cb.onDelta(rest)
      }
    }

    /**
     * The run must stop at the first sign of a tool other than the one it may
     * run with: one of the CLI's own, or one of an MCP server
     */
    const checkTools = (event: Record<string, unknown>): void => {
      const listed = event.tools
      if (!Array.isArray(listed)) {
        refuse('Claude Code did not report its tool list')
        return
      }
      const exact =
        listed.length === allowed.length && allowed.every((name) => listed.includes(name))
      if (!exact) {
        const names = listed
          .filter((name): name is string => typeof name === 'string')
          .slice(0, 5)
          .map((name) => name.slice(0, 80))
        refuse(
          `Claude Code started with ${listed.length} tool(s) available (${names.join(', ')}${
            listed.length > names.length ? ', …' : ''
          }) instead of ${allowed.length ? allowed.join(', ') : 'none'}`,
        )
        return
      }
      // a server that is still connecting lists no tool yet
      const servers = event.mcp_servers
      if (Array.isArray(servers) ? servers.length > 0 : servers != null) {
        refuse('Claude Code started with an MCP server attached')
        return
      }
      verified = true
    }

    const onStreamEvent = (event: Record<string, unknown>): void => {
      if (event.type === 'content_block_start') {
        const block = event.content_block
        if (mode === 'structured' && isStructuredOutputUse(block)) {
          if (typeof event.index === 'number') structuredBlocks.add(event.index)
          if (typeof block.id === 'string') structuredIds.add(block.id)
          return
        }
        if (isAppToolUse(block)) {
          if (typeof event.index === 'number') appToolBlocks.add(event.index)
          if (typeof block.id === 'string') appToolIds.add(block.id)
          return
        }
        if (isToolBlock(block)) refuse(`Claude Code started to call a tool${toolNameOf(block)}`)
        return
      }
      if (event.type === 'message_start') {
        structuredBlocks.clear()
        appToolBlocks.clear()
        // the CLI is sending the answer again (a retried request, or a new try after the
        // CLI rejected a structured answer): skip what was already passed on
        if (raw) {
          raw = ''
          whole = ''
          skip = emitted.length
          scanner = new TurnTextScanner()
        }
        return
      }
      if (event.type !== 'content_block_delta' || !isPlainObject(event.delta)) return
      const delta = event.delta
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        // a structured turn answers through StructuredOutput: prose beside the call is not the answer
        if (mode === 'plain') {
          raw += delta.text
          deliver(delta.text)
        }
      } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        if (delta.thinking) cb.onReasoningDelta?.(delta.thinking)
      } else if (delta.type === 'input_json_delta') {
        // the input of a direct app-tool call is never used: the CLI refuses that call
        if (typeof event.index === 'number' && appToolBlocks.has(event.index)) return
        if (
          typeof event.index !== 'number' ||
          !structuredBlocks.has(event.index) ||
          typeof delta.partial_json !== 'string'
        ) {
          refuse('Claude Code started to call a tool')
          return
        }
        raw += delta.partial_json
        deliver(scanner.push(delta.partial_json))
      }
    }

    /** Deliver a structured answer; throws what the loop should see when it is not usable */
    const deliverStructured = (answer: string, stopReason: string): void => {
      try {
        const turn = parseClaudeCodeTurn(answer, tools)
        deliverRest(turn.text)
        for (const call of turn.toolCalls) cb.onToolCall(call)
        return
      } catch (error) {
        if (!(error instanceof ClaudeCodeStructureError)) throw error
        const partial = new TurnTextScanner()
        const text = partial.push(answer)
        if (stopReason === 'max_tokens' && partial.started) {
          // cut by the output limit: the text so far stands, and a call that was being written
          // goes on as truncated so the loop asks for smaller calls
          deliverRest(text)
          if (!partial.complete) return
          const name = [...answer.matchAll(/"name"\s*:\s*"([^"\\]+)"/g)].at(-1)?.[1]
          if (name && tools.some((tool) => tool.name === name)) {
            cb.onToolCall({ id: `claude-${randomUUID()}`, name, input: {}, truncated: true })
            return
          }
          throw new Error(
            'Claude Code reached the output limit before its tool calls were complete. Ask for the output in several smaller parts.',
            { cause: error },
          )
        }
        if (emitted) {
          throw new Error(
            `Claude Code returned a structured response that broke off ${TOOL_ARGS_DROP_MARK}: ${error.message}`,
            { cause: error },
          )
        }
        throw new Error(
          `Claude Code returned an invalid structured response: ${error.message} ${EMPTY_STREAM_MARK}`,
          { cause: error },
        )
      }
    }

    /**
     * The model called app tools directly instead of naming them in
     * StructuredOutput (seen live, the editor prompts name the tools). The CLI
     * has no such tool and would answer with an error, which led the model to
     * report the tool as unusable and give up. The calls are taken as this
     * turn's requests, checked the same way as "toolCalls", and the CLI is
     * ended before it answers them.
     */
    const takeDirectCalls = (
      content: unknown,
      calls: Record<string, unknown>[],
      message: unknown,
    ): void => {
      const turn = {
        text: textOf(content).trim(),
        toolCalls: calls.map((call) => {
          const tool = tools.find((entry) => entry.name === call.name)
          return { name: call.name, ...directCallInput(tool, call.input) }
        }),
      }
      try {
        deliverStructured(JSON.stringify(turn), 'tool_use')
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)))
        return
      }
      const usage = tokenUsage(isPlainObject(message) ? message.usage : undefined)
      if (usage) cb.onUsage?.(usage)
      finish(undefined, true)
    }

    const onResult = (event: Record<string, unknown>): void => {
      const text = typeof event.result === 'string' ? event.result : ''
      if (event.is_error === true || event.subtype !== 'success') {
        const errors = Array.isArray(event.errors) ? event.errors.join('; ') : ''
        finish(
          reportedFailure(
            failureCode,
            event.api_error_status,
            text || failureText || errors,
            rateLimitInfo,
          ),
        )
        return
      }
      if (!requireVerified()) return
      let stopReason = typeof event.stop_reason === 'string' ? event.stop_reason : ''
      // the result text of a structured turn may be prose the model wrote beside the call: never the answer
      let answer = raw || whole || text
      if (mode === 'structured') {
        if (isPlainObject(event.structured_output)) structuredOutput = event.structured_output
        answer = structuredOutput !== undefined ? JSON.stringify(structuredOutput) : raw || whole
        // the turn ended on the CLI's own tool, which the CLI answered; for the loop it is a finished turn
        if (stopReason === 'tool_use' && structuredOutput !== undefined) stopReason = 'end_turn'
      }
      try {
        if (mode === 'plain') deliverRest(answer)
        else deliverStructured(answer, stopReason)
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)))
        return
      }
      if (stopReason) cb.onStopReason?.(stopReason)
      const usage = tokenUsage(event.usage)
      if (usage) cb.onUsage?.(usage)
      finish()
    }

    const onLine = (line: string): void => {
      if (settled) return
      cb.onActivity?.()
      let event: unknown
      try {
        event = JSON.parse(line)
      } catch {
        return
      }
      if (!isPlainObject(event)) return
      switch (event.type) {
        case 'control_response': {
          const response = event.response
          if (!isPlainObject(response) || response.request_id !== INITIALIZE_REQUEST_ID) return
          if (initialized) return
          if (response.subtype !== 'success') {
            finish(
              new AiRunError(
                'needs-update',
                'Claude Code did not accept the setup request of this app; it may be too old',
                { provider: PROVIDER },
              ),
            )
            return
          }
          // only now does the conversation leave the app: the system prompt is in place
          initialized = true
          write(request.input.user)
          return
        }
        case 'control_request': {
          const subtype = isPlainObject(event.request) ? event.request.subtype : undefined
          if (subtype === 'can_use_tool') {
            refuse('Claude Code asked for permission to use a tool')
            return
          }
          // no hook and no MCP server is registered, so nothing is expected; answer instead of
          // leaving the CLI waiting
          write({
            type: 'control_response',
            response: {
              subtype: 'error',
              request_id: event.request_id,
              error: `Unsupported request: ${String(subtype)}`,
            },
          })
          return
        }
        case 'system':
          if (event.subtype === 'init') checkTools(event)
          return
        case 'rate_limit_event': {
          if (!isPlainObject(event.rate_limit_info)) return
          rateLimitInfo = event.rate_limit_info
          const usage = claudeCodeUsage(rateLimitInfo)
          if (usage.length > 0) cb.onSubscriptionUsage?.(usage)
          return
        }
        case 'stream_event':
          if (requireVerified() && isPlainObject(event.event)) onStreamEvent(event.event)
          return
        case 'assistant': {
          const content = isPlainObject(event.message) ? event.message.content : undefined
          if (typeof event.error === 'string') {
            // the CLI's own report of a failed request; the result that follows ends the run
            failureCode = event.error
            failureText = textOf(content)
            return
          }
          if (!requireVerified()) return
          const blocks = Array.isArray(content) ? content : []
          const direct: Record<string, unknown>[] = []
          let answered = false
          for (const block of blocks) {
            if (mode === 'structured' && isStructuredOutputUse(block)) {
              answered = true
              if (typeof block.id === 'string') structuredIds.add(block.id)
              if (isPlainObject(block.input)) whole = JSON.stringify(block.input)
            } else if (isAppToolUse(block)) {
              if (typeof block.id === 'string') appToolIds.add(block.id)
              direct.push(block)
            } else if (isToolBlock(block)) {
              refuse(`Claude Code called a tool${toolNameOf(block)}`)
              return
            }
          }
          if (mode === 'plain') whole += textOf(content)
          if (direct.length > 0 && !answered) takeDirectCalls(content, direct, event.message)
          return
        }
        case 'user': {
          const content = isPlainObject(event.message) ? event.message.content : undefined
          // the only tool results a run may see: the CLI's own acknowledgement of a StructuredOutput
          // call, and its error for a direct call to an app tool it does not have
          const expected = (block: unknown): boolean =>
            mode === 'structured' &&
            isPlainObject(block) &&
            block.type === 'tool_result' &&
            typeof block.tool_use_id === 'string' &&
            (structuredIds.has(block.tool_use_id) ||
              (appToolIds.has(block.tool_use_id) && block.is_error === true))
          const ranTool =
            Array.isArray(content) &&
            content.some((block) => isToolBlock(block) && !expected(block))
          if (ranTool) refuse('Claude Code ran a tool')
          return
        }
        case 'result':
          onResult(event)
          return
      }
    }

    child.stdin?.on('error', () => undefined)
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = appendDiagnostic(stderr, chunk)
    })
    if (child.stdout) {
      readLines(
        child.stdout,
        (line) => {
          try {
            onLine(line)
          } catch (error) {
            // a throwing callback would otherwise surface as an uncaught exception of the host
            finish(error instanceof Error ? error : new Error(String(error)))
          }
        },
        () =>
          finish(
            new Error(
              `Claude Code wrote a line of more than ${MAX_SSE_LINE_BYTES} bytes without a newline; it was stopped`,
            ),
          ),
      )
    }
    child.once('error', (error) => {
      // without a pid the program never started, and no close event follows
      if (child.pid === undefined) {
        exited = true
        removeCwd()
      }
      finish(startFailure(error))
    })
    child.once('close', (code) => {
      exited = true
      removeCwd()
      finish(
        failureCode
          ? reportedFailure(failureCode, undefined, failureText, rateLimitInfo)
          : exitFailure(code, stderr),
      )
    })
    cb.signal.addEventListener('abort', onAbort, { once: true })
    write(request.input.initialize)
  })
}

// ── Entry points ──

/** One streamed turn of the agent loop: text deltas, then the tool calls the model requests */
export async function streamClaudeCodeCli(
  config: AiProviderConfig,
  system: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  maxTokens: number,
  cb: StreamCallbacks,
  deps: ClaudeCodeCliDeps = {},
): Promise<void> {
  const wd = createStreamWatchdog(cb.signal)
  return wd.guard(() =>
    runClaudeCodeTurn(
      config,
      {
        mode: 'structured',
        input: buildClaudeCodeInput(system, messages, tools, maxTokens),
        tools,
      },
      {
        ...cb,
        signal: wd.signal,
        onActivity: () => {
          wd.touch()
          cb.onActivity?.()
        },
      },
      deps,
    ),
  )
}

/** One-shot text chat: the answer is the model's text as it is, with no structure around it */
export async function chatClaudeCodeCli(
  wd: StreamWatchdog,
  config: AiProviderConfig,
  system: string,
  user: string,
  deps: ClaudeCodeCliDeps = {},
): Promise<AiChatResponse> {
  let content = ''
  await runClaudeCodeTurn(
    config,
    {
      mode: 'plain',
      input: {
        initialize: initializeRequest(system, PLAIN_INSTRUCTIONS),
        user: { type: 'user', message: { role: 'user', content: [{ type: 'text', text: user }] } },
        truncated: false,
      },
      tools: [],
    },
    {
      signal: wd.signal,
      onDelta: (text) => {
        content += text
      },
      onToolCall: () => undefined,
      onActivity: () => wd.touch(),
    },
    deps,
  )
  return content ? { ok: true, content } : { ok: false, error: 'Claude Code returned no content' }
}

// ── The model list ──

/** How long the CLI is given to answer the setup request with its model list */
const MODEL_LIST_TIMEOUT_MS = 15_000

/** The entry of the CLI's list that stands for its own default, which an empty selection runs */
const DEFAULT_MODEL_VALUE = 'default'

/**
 * The models named in the CLI's answer to the setup request: `{ value,
 * displayName, resolvedModel }` each. `value` is what `--model` takes, so an
 * entry whose value could not be passed there is left out. Only the `models`
 * field is read; the answer also names the account, which is not touched.
 */
export function claudeCodeModels(initialized: unknown): AiSubscriptionModel[] {
  const listed = isPlainObject(initialized) ? initialized.models : undefined
  if (!Array.isArray(listed)) return []
  const models: AiSubscriptionModel[] = []
  for (const entry of listed) {
    if (!isPlainObject(entry) || typeof entry.value !== 'string') continue
    const value = entry.value.trim()
    if (!MODEL_NAME.test(value)) continue
    const isDefault = value === DEFAULT_MODEL_VALUE
    const id = isDefault ? '' : value
    if (models.some((model) => model.id === id)) continue
    const resolved =
      typeof entry.resolvedModel === 'string' && MODEL_NAME.test(entry.resolvedModel.trim())
        ? entry.resolvedModel.trim()
        : undefined
    // the default is listed only when the CLI says what it runs on
    if (isDefault && !resolved) continue
    const name = typeof entry.displayName === 'string' ? entry.displayName.trim() : ''
    models.push({
      id,
      label: name || value,
      ...(resolved ? { resolved } : {}),
      ...(isDefault ? { isDefault: true } : {}),
    })
  }
  return models
}

export interface ClaudeCodeModelsRequest {
  /** the user's own path to the CLI, when one is configured */
  cliPath?: string | undefined
  /** the caller gave up: the process tree is ended and the reading rejects */
  signal: AbortSignal
  timeoutMs?: number | undefined
}

/**
 * Ask the CLI which models it offers, without asking a model anything. The CLI
 * is started exactly as for a turn (the same flags, an empty directory of its
 * own, the sanitised environment), is sent the setup request and nothing else,
 * and is told to leave as soon as it answered. No user message is ever
 * written, so no request reaches the model and no usage is spent.
 *
 * Resolves with the list, empty when the CLI names none or does not accept the
 * request (an older CLI). Rejects when the CLI cannot be started, does not
 * answer in time, or does anything other than answer; its process tree is
 * ended in each of those cases, and the CLI's own output is not repeated.
 */
export async function listClaudeCodeModels(
  request: ClaudeCodeModelsRequest,
  deps: ClaudeCodeCliDeps = {},
): Promise<AiSubscriptionModel[]> {
  const { signal } = request
  if (signal.aborted) throw cancelledError()
  const args = claudeCodeCliLaunchArgs('')
  const program = await (
    deps.resolveProgram ??
    ((configuredPath) => resolveSubscriptionProgram(PROVIDER, { configuredPath }))
  )(request.cliPath)
  if (signal.aborted) throw cancelledError()

  const cwd = await createTrackedTempDir(TEMP_PREFIX)
  const removeCwd = (): void => {
    void removeTrackedTempDir(cwd)
  }
  let child: ChildProcess
  try {
    if (signal.aborted) throw cancelledError()
    child = spawnSubscriptionProgram(program, args, {
      cwd,
      baseEnv: deps.baseEnv,
      env: { ...CLAUDE_CODE_RUN_ENV },
      spawn: deps.spawn,
      registry: deps.registry,
    })
  } catch (error) {
    removeCwd()
    throw error instanceof Error && error.name === 'AbortError' ? error : startFailure(error)
  }

  const killTree = deps.killTree ?? ((target) => killProcessTree(target, { force: true }))
  return new Promise<AiSubscriptionModel[]>((resolve, reject) => {
    let settled = false
    let exited = false
    const finish = (models: AiSubscriptionModel[] | undefined, error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      if (!exited) {
        if (error) {
          killTree(child)
        } else {
          // the CLI leaves by itself once its input ends; it is ended if it does not
          child.stdin?.end()
          const grace = setTimeout(() => {
            if (!exited) killTree(child)
          }, deps.exitGraceMs ?? EXIT_GRACE_MS)
          grace.unref?.()
          child.once('close', () => clearTimeout(grace))
        }
      }
      if (error) reject(error)
      else resolve(models ?? [])
    }
    const onAbort = (): void => finish(undefined, cancelledError())
    const timer = setTimeout(
      () => finish(undefined, new Error('Claude Code did not list its models in time')),
      request.timeoutMs ?? MODEL_LIST_TIMEOUT_MS,
    )
    timer.unref?.()

    const onLine = (line: string): void => {
      if (settled) return
      let event: unknown
      try {
        event = JSON.parse(line)
      } catch {
        return
      }
      if (!isPlainObject(event)) return
      if (event.type === 'control_response') {
        const response = event.response
        if (!isPlainObject(response) || response.request_id !== INITIALIZE_REQUEST_ID) return
        // a CLI that does not accept the request has no list to give
        finish(response.subtype === 'success' ? claudeCodeModels(response.response) : [])
        return
      }
      // Nothing was asked of a model, so there is nothing to answer, run or permit. A CLI that
      // asks for something or produces output is not doing what it was started for.
      if (
        event.type === 'control_request' ||
        event.type === 'stream_event' ||
        event.type === 'assistant' ||
        event.type === 'user' ||
        event.type === 'result'
      ) {
        finish(undefined, new Error('Claude Code did more than list its models; it was stopped'))
      }
    }

    child.stdin?.on('error', () => undefined)
    // what the CLI prints is not kept: it can name the account
    child.stderr?.on('data', () => undefined)
    if (child.stdout) {
      readLines(child.stdout, onLine, () =>
        finish(undefined, new Error('Claude Code wrote an endless line; it was stopped')),
      )
    }
    child.once('error', (error) => {
      // without a pid the program never started, and no close event follows
      if (child.pid === undefined) {
        exited = true
        removeCwd()
      }
      finish(undefined, startFailure(error))
    })
    child.once('close', () => {
      exited = true
      removeCwd()
      finish(undefined, new Error('Claude Code exited before it listed its models'))
    })
    signal.addEventListener('abort', onAbort, { once: true })
    if (child.stdin?.writable) {
      child.stdin.write(`${JSON.stringify(initializeRequest(NO_TOOLS_INSTRUCTIONS, ''))}\n`)
    }
  })
}

// the status check reads the list through this bridge, as it reads Codex's through that one
setSubscriptionModelSource(PROVIDER, ({ configuredPath, signal }) =>
  listClaudeCodeModels({ cliPath: configuredPath, signal }),
)
