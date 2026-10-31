import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { StringDecoder } from 'node:string_decoder'
import type { AgentImage, AgentMessage, AgentToolCall, AgentToolDef } from '@genoffice/agent-core'
import { PRODUCT_NAME } from '@genoffice/i18n'
import type {
  AiChatResponse,
  AiProviderConfig,
  AiSubscriptionModel,
  AiSubscriptionUsage,
  AiUsageWindow,
  CodexModelCatalog,
} from './types'
import {
  parseToolInput,
  throwIfToolCountOverBudget,
  throwIfToolJsonOverBudget,
  type StreamCallbacks,
} from './protocols/shared'
import { AiRunError } from './run-error'
import { subscriptionModelsOf } from './subscription/contract'
import { onSubscriptionLoginChange } from './subscription/launch'
import { createTrackedTempDir, removeTrackedTempDir } from './subscription/temp-dirs'
import { resolveSubscriptionProgram, type SubscriptionProgram } from './subscription/locate'
import { setSubscriptionModelSource } from './subscription/models'
import {
  killProcessTree,
  spawnSubscriptionProgram,
  type SubscriptionSpawn,
} from './subscription/process'
import { codexAccountInfo, setCodexAccountSource } from './subscription/status'
import { createStreamWatchdog } from './watchdog'

interface CodexAppServerTurn {
  text: string
  toolCalls: Array<{
    id: string
    name: string
    inputJson: string
  }>
}

export interface RpcMessage {
  id?: unknown
  method?: unknown
  params?: unknown
  result?: unknown
  error?: unknown
}

interface RpcError {
  code?: unknown
  message?: unknown
  data?: unknown
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface NativeSession {
  threadId: string
  signature: string
  messageFingerprints: string[]
  /** Created with the thread and kept alive as long as it: the thread's cwd and
   * permission profile are bound to this path, and later localImage files land
   * here. Removed only when the session is dropped. */
  tempDir: string
}

interface ModelEntry {
  id?: unknown
  model?: unknown
  displayName?: unknown
  hidden?: unknown
  isDefault?: unknown
}

const DIAGNOSTIC_LIMIT = 16_000
const REQUEST_TIMEOUT_MS = 30_000
const IDLE_SHUTDOWN_MS = 120_000
const MAX_NATIVE_SESSIONS = 64
const MAX_MODEL_PAGES = 10
const MAX_MCP_STATUS_PAGES = 10
const CODEX_TEMP_PREFIX = 'genoffice-codex-app-server-'
/**
 * How this client names itself to Codex, which passes it on to OpenAI: the
 * product, not the project it is based on. Also the tag around a turn's payload.
 */
const CODEX_CLIENT_NAME = PRODUCT_NAME.toLowerCase()
const CODEX_BASE_INSTRUCTIONS = `You are the language-model backend embedded in ${PRODUCT_NAME}. Never inspect or modify local files, run shell commands, browse, call MCP, use apps, or invoke any built-in Codex tool. The caller supplies the complete relevant conversation and a JSON Schema. Return exactly one assistant response matching that schema; ${PRODUCT_NAME} itself executes document tools.`

/** Max buffered stdout line: a child that writes megabytes without a newline would grow the RPC
 *  buffer until the process dies. The SSE reader and this bridge's stderr reader are both capped;
 *  stdout is the last unbounded reader here. */
export const MAX_RPC_LINE_BYTES = 4 * 1024 * 1024

interface CodexChildOutput {
  on(event: 'data', listener: (chunk: Buffer) => void): unknown
  on(event: 'end' | 'close', listener: () => void): unknown
}

export interface CodexChildLike {
  stdout: CodexChildOutput
  kill(): unknown
}

/**
 * Split the child's stdout into RPC lines, with a cap on the line being buffered. Over the cap the
 * reader stops, the child is killed and `onOverflow` reports a bounded diagnostic, which fails every
 * in-flight request instead of letting the buffer grow. A trailing line without a newline is still
 * delivered when the stream ends, as the previous readline reader did. A throwing `onLine` is
 * reported through `onOverflow` the same way, because a listener throw would otherwise surface as an
 * uncaught exception instead of failing the in-flight requests.
 */
export function attachBoundedRpcStdout(
  child: CodexChildLike,
  onLine: (line: string) => void,
  onOverflow: (error: Error) => void,
): void {
  // A StringDecoder keeps a multi-byte UTF-8 sequence that straddles two pipe chunks intact
  // (Buffer#toString per chunk would turn it into U+FFFD).
  const decoder = new StringDecoder('utf8')
  let pending = ''
  /** UTF-8 bytes buffered for the current line, including any partial sequence held by the decoder. */
  let pendingBytes = 0
  let stopped = false
  const emit = (line: string): void => {
    try {
      onLine(line.endsWith('\r') ? line.slice(0, -1) : line)
    } catch (error) {
      // `onLine` writes back to the child (rejecting an unsupported server request, for one) and
      // throws once stdin is no longer writable, which is a normal shutdown race while buffered
      // stdout lines are still being delivered. A listener throw is not catchable by the caller's
      // promise chain, so report it like an overflow and stop reading rather than crashing the host.
      stopped = true
      pending = ''
      pendingBytes = 0
      onOverflow(error instanceof Error ? error : new Error(String(error)))
    }
  }
  const flush = (): void => {
    if (stopped) return
    stopped = true
    const tail = pending + decoder.end()
    pending = ''
    pendingBytes = 0
    if (tail) emit(tail)
  }
  child.stdout.on('end', flush)
  child.stdout.on('close', flush)
  child.stdout.on('data', (chunk: Buffer) => {
    if (stopped) return
    pending += decoder.write(chunk)
    const parts = pending.split('\n')
    pending = parts.pop() ?? ''
    if (parts.length === 0) {
      pendingBytes += chunk.length
    } else {
      pendingBytes = Buffer.byteLength(pending, 'utf8')
      for (const part of parts) {
        emit(part)
        if (stopped) return
      }
    }
    if (pendingBytes > MAX_RPC_LINE_BYTES) {
      stopped = true
      pending = ''
      pendingBytes = 0
      onOverflow(
        new Error(
          `Codex app-server stdout line exceeded ${MAX_RPC_LINE_BYTES} bytes without a newline; the child was stopped`,
        ),
      )
      try {
        child.kill()
      } catch {
        /* already gone */
      }
    }
  })
}

function appendDiagnostic(current: string, chunk: Buffer | string): string {
  const next = current + chunk.toString()
  return next.length <= DIAGNOSTIC_LIMIT ? next : next.slice(-DIAGNOSTIC_LIMIT)
}

function rpcError(error: unknown): Error {
  const value = error && typeof error === 'object' ? (error as RpcError) : undefined
  const message = typeof value?.message === 'string' ? value.message : 'Unknown app-server error'
  const code = typeof value?.code === 'number' ? ` (${value.code})` : ''
  const data = value?.data === undefined ? '' : `: ${JSON.stringify(value.data)}`
  return new Error(`Codex app-server error${code}: ${message}${data}`)
}

function cancelledError(): Error {
  const error = new Error('Codex app-server request was cancelled')
  error.name = 'AbortError'
  return error
}

function unsafeToolsError(message: string): AiRunError {
  return new AiRunError('unsafe-tools', message, { provider: 'codex' })
}

function signedOutError(): AiRunError {
  return new AiRunError(
    'signed-out',
    'Codex CLI is not signed in. Run codex login, then try again.',
    { provider: 'codex' },
  )
}

/**
 * `codex app-server` has no switch that skips the user's `config.toml` (only
 * `codex exec` has one), so each thing that file can bring into a run is
 * overridden here. Feature switches go through `-c features.<name>=false`: an
 * unknown name there is a warning, while after `--disable` it stops Codex from
 * starting. The login is untouched; it is read from the same Codex home.
 * MCP servers are named tables that cannot be emptied from here; they are
 * switched off per thread (see `codexMcpServerOverrides`).
 */
export const CODEX_CONFIG_OVERRIDES: readonly string[] = [
  // user hooks, plugins (with their MCP servers, skills and hooks), ChatGPT
  // connectors, and personal memories
  'features.hooks=false',
  'features.plugins=false',
  'features.apps=false',
  'features.memories=false',
  // the program the user has Codex run after each turn
  'notify=[]',
  // no prompt history file
  'history.persistence="none"',
  // the built-in OpenAI provider on its default address, whatever provider or
  // address (a proxy, another vendor) the user configured: empty is "not set"
  'model_provider="openai"',
  'openai_base_url=""',
  // the list of the user's skills is not added to the prompt
  'skills.include_instructions=false',
  // Codex's own web search: a way out the app neither sees nor guards (the
  // app's own search tool keeps redaction and the Drive rule); off, like every
  // tool the app can turn off
  'web_search="disabled"',
]

export function codexAppServerLaunchArgs(): string[] {
  return [
    'app-server',
    ...CODEX_CONFIG_OVERRIDES.flatMap((override) => ['-c', override]),
    '--listen',
    'stdio://',
  ]
}

/** How the bridge finds, starts and ends the Codex program */
export interface CodexAppServerRuntime {
  resolve: typeof resolveSubscriptionProgram
  /** the process spawner handed to `spawnSubscriptionProgram`; Node's own when absent */
  spawn: SubscriptionSpawn | undefined
  killTree: typeof killProcessTree
}

const defaultRuntime: CodexAppServerRuntime = {
  resolve: resolveSubscriptionProgram,
  spawn: undefined,
  killTree: killProcessTree,
}
let runtime = defaultRuntime

/** For tests: replace parts of the runtime. Returns a function that puts the real one back. */
export function setCodexAppServerRuntime(overrides: Partial<CodexAppServerRuntime>): () => void {
  runtime = { ...defaultRuntime, ...overrides }
  return () => {
    runtime = defaultRuntime
  }
}

class CodexAppServerClient {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<number, PendingRequest>()
  private readonly notificationListeners = new Set<(message: RpcMessage) => void>()
  private readonly sessions = new Map<string, NativeSession>()
  private readonly initialized: Promise<void>
  private nextId = 1
  private stderr = ''
  private closed = false
  private users = 0
  private idleTimer: ReturnType<typeof setTimeout> | undefined
  private readonly closeListeners = new Set<(error: Error) => void>()
  private stopWhenReleased = false

  constructor(
    program: SubscriptionProgram,
    private readonly onClosed: () => void,
  ) {
    // Sanitised environment, no shell, registered so that quitting or crashing ends it. The
    // temp dir as working directory keeps the project configuration of wherever the app was
    // started out of the process.
    this.child = spawnSubscriptionProgram(program, codexAppServerLaunchArgs(), {
      cwd: tmpdir(),
      stdio: ['pipe', 'pipe', 'pipe'],
      spawn: runtime.spawn,
    }) as ChildProcessWithoutNullStreams
    attachBoundedRpcStdout(
      { stdout: this.child.stdout, kill: () => runtime.killTree(this.child) },
      (line) => this.onLine(line),
      (error) => this.fail(error),
    )
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderr = appendDiagnostic(this.stderr, chunk)
    })
    this.child.once('error', (error) =>
      this.fail(
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? new AiRunError('not-installed', 'Codex CLI was not found', { provider: 'codex' })
          : error,
      ),
    )
    this.child.once('close', (code) => {
      const detail = this.stderr.trim()
      this.fail(
        new Error(`Codex app-server exited (${code ?? 'unknown'})${detail ? `: ${detail}` : ''}`),
      )
    })
    this.initialized = this.initialize()
  }

  get isClosed(): boolean {
    return this.closed
  }

  retain(): void {
    this.users++
    clearTimeout(this.idleTimer)
    this.idleTimer = undefined
  }

  release(): void {
    this.users = Math.max(0, this.users - 1)
    if (this.users > 0 || this.closed) return
    if (this.stopWhenReleased) {
      this.close()
      return
    }
    this.idleTimer = setTimeout(() => this.close(), IDLE_SHUTDOWN_MS)
    this.idleTimer.unref?.()
  }

  /**
   * A cancelled run must not leave the process, or anything it started, behind. The process is
   * shared, so it ends as soon as no other run is using it.
   */
  stopWhenUnused(): void {
    this.stopWhenReleased = true
  }

  /**
   * The process is out of date (it holds a login that was since changed): it ends now when no
   * run is using it, otherwise as soon as the last of them is done.
   */
  endOnceUnused(): void {
    this.stopWhenReleased = true
    if (this.users === 0) this.close()
  }

  async ready(): Promise<void> {
    await this.initialized
  }

  async request(method: string, params: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
    await this.initialized
    return this.requestWire(method, params, timeoutMs)
  }

  notify(method: string, params?: unknown): void {
    this.write(params === undefined ? { method } : { method, params })
  }

  onNotification(listener: (message: RpcMessage) => void): () => void {
    this.notificationListeners.add(listener)
    return () => this.notificationListeners.delete(listener)
  }

  /** Called once with the reason when the process is gone, however it ended */
  onClose(listener: (error: Error) => void): () => void {
    this.closeListeners.add(listener)
    return () => this.closeListeners.delete(listener)
  }

  getSession(id: string): NativeSession | undefined {
    return this.sessions.get(id)
  }

  setSession(id: string, session: NativeSession): void {
    this.sessions.delete(id)
    this.sessions.set(id, session)
    while (this.sessions.size > MAX_NATIVE_SESSIONS) {
      const oldest = this.sessions.keys().next().value as string | undefined
      if (!oldest) break
      const evicted = this.sessions.get(oldest)
      this.sessions.delete(oldest)
      if (evicted) this.disposeSession(evicted, true)
    }
  }

  deleteSession(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    this.sessions.delete(id)
    this.disposeSession(session, true)
  }

  /** Drop a session's temp dir and, when the process is still alive, its native
   * thread. `signal` is false during shutdown, where the child is already gone. */
  private disposeSession(session: NativeSession, signal: boolean): void {
    void removeTrackedTempDir(session.tempDir)
    if (signal && !this.closed) {
      void this.requestWire('thread/delete', { threadId: session.threadId }).catch(() => undefined)
    }
  }

  stop(reason?: Error): void {
    this.close(reason)
  }

  private async initialize(): Promise<void> {
    await this.requestWire('initialize', {
      clientInfo: { name: CODEX_CLIENT_NAME, title: PRODUCT_NAME, version: '0.1.0' },
      capabilities: { experimentalApi: false, requestAttestation: false },
    })
    this.notify('initialized')
  }

  private requestWire(
    method: string,
    params: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('Codex app-server is not running'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Codex app-server request timed out: ${method}`))
      }, timeoutMs)
      timer.unref?.()
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.write({ method, id, params })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private write(message: unknown): void {
    if (this.closed || !this.child.stdin.writable) {
      throw new Error('Codex app-server input is closed')
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private onLine(line: string): void {
    let message: RpcMessage
    try {
      message = JSON.parse(line) as RpcMessage
    } catch {
      this.stderr = appendDiagnostic(this.stderr, `\nInvalid stdout JSON: ${line}`)
      return
    }
    if (typeof message.method === 'string' && message.id !== undefined) {
      // GenOffice deliberately disables Codex-owned tools. Reply instead of
      // leaving an unexpected server request pending forever.
      this.write({
        id: message.id,
        error: { code: -32601, message: `Unsupported server request: ${message.method}` },
      })
      return
    }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(message.id)
      if (message.error !== undefined) pending.reject(rpcError(message.error))
      else pending.resolve(message.result)
      return
    }
    if (typeof message.method === 'string') {
      if (message.method === 'mcpServer/startupStatus/updated') {
        // Every thread of this process has its MCP servers switched off, so one starting means
        // the switch-off did not hold. Nothing may run with it attached.
        const status = objectValue(message.params)?.status
        if (status === 'starting' || status === 'ready') {
          this.close(unsafeToolsError('Codex started an MCP server that was switched off'))
          return
        }
      }
      for (const listener of this.notificationListeners) listener(message)
    }
  }

  private fail(error: Error): void {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.idleTimer)
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
    for (const session of this.sessions.values()) this.disposeSession(session, false)
    this.sessions.clear()
    this.notificationListeners.clear()
    // a turn waits on notifications, not on a request: tell it the process is gone
    const closeListeners = [...this.closeListeners]
    this.closeListeners.clear()
    for (const listener of closeListeners) listener(error)
    this.onClosed()
  }

  private close(reason?: Error): void {
    if (this.closed) return
    try {
      // the whole tree: Codex starts helper processes of its own
      runtime.killTree(this.child)
    } finally {
      this.fail(reason ?? new Error('Codex app-server stopped after being idle'))
    }
  }
}

const clients = new Map<string, CodexAppServerClient>()

/** Stop every child process during Electron shutdown or integration-test cleanup. */
export function shutdownCodexAppServers(): void {
  for (const client of [...clients.values()]) client.stop()
  clients.clear()
}

/**
 * The app ran Codex's own login or logout. A running app-server may go on with the login it
 * started with, so none of them serves another request: each is ended at once when idle, and
 * after the runs it is serving otherwise. The next request starts a process on the new login.
 */
function retireCodexAppServers(): void {
  for (const [key, client] of [...clients]) {
    clients.delete(key)
    client.endOnceUnused()
  }
}

onSubscriptionLoginChange((provider) => {
  if (provider === 'codex') retireCodexAppServers()
})

async function clientFor(cliPathValue: string | undefined): Promise<CodexAppServerClient> {
  const program = await runtime.resolve('codex', { configuredPath: cliPathValue })
  const key = process.platform === 'win32' ? program.entry.toLowerCase() : program.entry
  const existing = clients.get(key)
  if (existing && !existing.isClosed) return existing
  const client = new CodexAppServerClient(program, () => {
    if (clients.get(key) === client) clients.delete(key)
  })
  clients.set(key, client)
  return client
}

async function withClient<T>(
  cliPath: string | undefined,
  action: (client: CodexAppServerClient) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const client = await clientFor(cliPath)
  client.retain()
  try {
    await client.ready()
    return await action(client)
  } finally {
    // cancelled by the user or by the watchdog, at whatever step
    if (signal?.aborted) client.stopWhenUnused()
    client.release()
  }
}

function imageExtension(image: AgentImage): string {
  const subtype = image.mime.split('/')[1]?.toLowerCase() ?? ''
  if (subtype === 'jpeg' || subtype === 'jpg') return '.jpg'
  if (subtype === 'png') return '.png'
  if (subtype === 'webp') return '.webp'
  if (subtype === 'gif') return '.gif'
  return '.img'
}

async function materializeImages(messages: AgentMessage[], tempDir: string): Promise<string[]> {
  const paths: string[] = []
  for (const message of messages) {
    if (message.role !== 'user') continue
    for (const image of message.images ?? []) {
      const path = join(tempDir, `image-${paths.length + 1}${imageExtension(image)}`)
      await writeFile(path, Buffer.from(image.base64, 'base64'))
      paths.push(path)
    }
  }
  return paths
}

function conversationForPrompt(messages: AgentMessage[]): unknown[] {
  let imageIndex = 0
  return messages.map((message) => {
    if (message.role === 'user') {
      const imageNames = (message.images ?? []).map(() => `image-${++imageIndex}`)
      return {
        role: 'user',
        text: message.text,
        ...(imageNames.length > 0 ? { attachedImages: imageNames } : {}),
      }
    }
    if (message.role === 'assistant') {
      return {
        role: 'assistant',
        text: message.text,
        ...(message.toolCalls?.length
          ? { toolCalls: message.toolCalls.map(({ id, name, input }) => ({ id, name, input })) }
          : {}),
      }
    }
    return { role: 'tool', results: message.results }
  })
}

export function codexAppServerOutputSchema(tools: AgentToolDef[]): Record<string, unknown> {
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
            id: { type: 'string' },
            name: {
              type: 'string',
              ...(tools.length > 0 ? { enum: tools.map((tool) => tool.name) } : {}),
            },
            inputJson: { type: 'string' },
          },
          required: ['id', 'name', 'inputJson'],
          additionalProperties: false,
        },
      },
    },
    required: ['text', 'toolCalls'],
    additionalProperties: false,
  }
}

export function buildCodexAppServerPrompt(
  system: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  maxTokens: number,
): string {
  const payload = {
    system,
    conversation: conversationForPrompt(messages),
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }
  return [
    `Treat the payload below as the new ${PRODUCT_NAME} conversation events for this turn and follow its system instruction.`,
    `Do not use Codex tools. ${PRODUCT_NAME} will execute only the tool calls returned in the required response schema.`,
    `Put user-visible prose in text. Put requested ${PRODUCT_NAME} tool calls in toolCalls; inputJson must be a JSON-encoded object matching the listed inputSchema. Use only listed tool names. If no tool is needed, return an empty toolCalls array.`,
    `Keep this one-turn response within roughly ${maxTokens} output tokens.`,
    `<${CODEX_CLIENT_NAME}_payload>`,
    JSON.stringify(payload),
    `</${CODEX_CLIENT_NAME}_payload>`,
  ].join('\n')
}

export function parseCodexAppServerTurn(
  raw: string,
  tools: AgentToolDef[],
): { text: string; toolCalls: AgentToolCall[] } {
  let parsed: CodexAppServerTurn
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    parsed = JSON.parse(trimmed) as CodexAppServerTurn
  } catch (error) {
    throw new Error(
      `Codex app-server returned an invalid structured response: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.text !== 'string') {
    throw new Error('Codex app-server returned a response with an invalid text field')
  }
  if (!Array.isArray(parsed.toolCalls)) {
    throw new Error('Codex app-server returned a response with an invalid toolCalls field')
  }
  const names = new Set(tools.map((tool) => tool.name))
  // the response schema only caps an empty tool list, so cap the parsed turn here
  throwIfToolCountOverBudget(parsed.toolCalls.length, 'codex-app-server')
  const toolCalls = parsed.toolCalls.map((call): AgentToolCall => {
    if (!call || typeof call !== 'object' || typeof call.name !== 'string') {
      throw new Error('Codex app-server returned an invalid tool call')
    }
    if (!names.has(call.name)) {
      throw new Error(`Codex app-server requested an unknown tool: ${call.name}`)
    }
    const inputJson = typeof call.inputJson === 'string' ? call.inputJson : ''
    throwIfToolJsonOverBudget(inputJson.length, 'codex-app-server')
    const { input, error } = parseToolInput(inputJson)
    return {
      id: typeof call.id === 'string' && call.id ? call.id : `codex-${randomUUID()}`,
      name: call.name,
      input,
      ...(error ? { inputError: error } : {}),
    }
  })
  if (!parsed.text && toolCalls.length === 0) {
    throw new Error('Codex app-server returned no content')
  }
  return { text: parsed.text, toolCalls }
}

function fingerprint(message: AgentMessage): string {
  return createHash('sha256').update(JSON.stringify(message)).digest('hex')
}

function sessionSignature(system: string, tools: AgentToolDef[], model: string): string {
  return createHash('sha256').update(JSON.stringify({ system, tools, model })).digest('hex')
}

function incrementalMessages(
  existing: NativeSession | undefined,
  signature: string,
  messages: AgentMessage[],
): AgentMessage[] | null {
  if (!existing || existing.signature !== signature) return null
  if (messages.length < existing.messageFingerprints.length) return null
  for (let index = 0; index < existing.messageFingerprints.length; index++) {
    if (fingerprint(messages[index]!) !== existing.messageFingerprints[index]) return null
  }
  // The assistant response is already native app-server history. GenOffice's
  // following tool results or user message are the only new events to inject.
  return messages.slice(existing.messageFingerprints.length).filter((m) => m.role !== 'assistant')
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
}

function threadIdFrom(result: unknown): string {
  const id = optionalThreadId(result)
  if (!id) throw new Error('Codex app-server did not return a thread id')
  return id
}

function optionalThreadId(result: unknown): string | undefined {
  const thread = objectValue(objectValue(result)?.thread)
  return typeof thread?.id === 'string' && thread.id ? thread.id : undefined
}

function finalMessageFromTurn(params: unknown): string {
  const turn = objectValue(objectValue(params)?.turn)
  const items = Array.isArray(turn?.items) ? turn.items : []
  for (let index = items.length - 1; index >= 0; index--) {
    const item = objectValue(items[index])
    if (item?.type === 'agentMessage' && typeof item.text === 'string') return item.text
  }
  return ''
}

const CODEX_PERMISSION_PROFILE = 'genoffice'

/**
 * Codex keeps its own shell tool even when told not to use it, and the plain
 * read-only sandbox still lets that tool read the whole disk. A permission
 * profile confines reads to platform paths plus our temp dir. An explicit
 * `sandbox` would disable the profile, so it is only used in the fallback.
 */
export function codexThreadStartParams(
  config: AiProviderConfig,
  tempDir: string,
  mode: 'profile' | 'read-only',
  mcpServers: CodexMcpServerOverrides = {},
): Record<string, unknown> {
  const base = {
    ...(config.model.trim() ? { model: config.model.trim() } : {}),
    cwd: tempDir,
    approvalPolicy: 'never',
    serviceName: CODEX_CLIENT_NAME,
    baseInstructions: CODEX_BASE_INSTRUCTIONS,
    // nothing of the thread is written to the user's Codex home
    ephemeral: true,
  }
  const mcp = Object.keys(mcpServers).length > 0 ? { mcp_servers: mcpServers } : undefined
  if (mode === 'read-only') {
    return { ...base, sandbox: 'read-only', ...(mcp ? { config: mcp } : {}) }
  }
  return {
    ...base,
    config: {
      default_permissions: CODEX_PERMISSION_PROFILE,
      permissions: {
        [CODEX_PERMISSION_PROFILE]: { filesystem: { ':minimal': 'read', [tempDir]: 'read' } },
      },
      ...mcp,
    },
  }
}

export function activePermissionProfileId(result: unknown): string | undefined {
  const active = objectValue(objectValue(result)?.activePermissionProfile)
  return typeof active?.id === 'string' ? active.id : undefined
}

export type CodexMcpServerOverrides = Record<string, { enabled: false }>

/**
 * The per-thread override that switches off every MCP server in the
 * configuration Codex reports (`config/read`). A launch argument cannot do
 * this: an override table is merged into the user's, so the servers have to
 * be named. Only the names are read; a server's command and environment are
 * not looked at.
 */
export function codexMcpServerOverrides(configRead: unknown): CodexMcpServerOverrides {
  const config = objectValue(objectValue(configRead)?.config)
  if (!config) throw new Error('Codex app-server did not return its configuration')
  const overrides: CodexMcpServerOverrides = {}
  for (const name of Object.keys(objectValue(config.mcp_servers) ?? {})) {
    overrides[name] = { enabled: false }
  }
  return overrides
}

/**
 * Names of the MCP servers a thread can use, from `mcpServerStatus/list` for
 * that thread: a server in any state but `disabled`, or one that lists a tool.
 * Throws when the value is not such a list, because then nothing is known.
 */
export function codexAttachedMcpServers(statusList: unknown): string[] {
  const data = objectValue(statusList)?.data
  if (!Array.isArray(data)) throw new Error('Codex app-server did not list its MCP servers')
  const attached: string[] = []
  for (const value of data) {
    const entry = objectValue(value)
    if (!entry) throw new Error('Codex app-server did not list its MCP servers')
    const enabled = typeof entry.runtimeStatus === 'string' && entry.runtimeStatus !== 'disabled'
    const tools = Object.keys(objectValue(entry.tools) ?? {}).length
    if (enabled || tools > 0) attached.push(typeof entry.name === 'string' ? entry.name : '')
  }
  return attached
}

/**
 * The run is refused unless Codex itself confirms that the thread has no MCP
 * server: the switch-off is checked by its result, not trusted. A thread that
 * cannot be checked counts as unsafe, and the process is ended with it.
 */
async function assertNoMcpServers(client: CodexAppServerClient, threadId: string): Promise<void> {
  let attached = 0
  let checked: boolean
  try {
    let cursor: string | null = null
    for (let page = 0; page < MAX_MCP_STATUS_PAGES; page++) {
      const result = await client.request('mcpServerStatus/list', {
        threadId,
        detail: 'toolsAndAuthOnly',
        cursor,
        limit: 100,
      })
      attached += codexAttachedMcpServers(result).length
      const next = objectValue(result)?.nextCursor
      cursor = typeof next === 'string' && next ? next : null
      if (!cursor) break
    }
    checked = cursor === null
  } catch {
    checked = false
  }
  if (checked && attached === 0) return
  const error = unsafeToolsError(
    checked
      ? 'Codex attached an MCP server to the run although all of them were switched off'
      : 'Codex could not confirm that no MCP server is attached to the run',
  )
  client.stop(error)
  throw error
}

async function startNativeThread(
  client: CodexAppServerClient,
  config: AiProviderConfig,
  tempDir: string,
): Promise<string> {
  let mcpServers: CodexMcpServerOverrides
  try {
    mcpServers = codexMcpServerOverrides(
      await client.request('config/read', { includeLayers: false, cwd: tempDir }),
    )
  } catch {
    // without the names nothing can be switched off, so nothing is started
    throw unsafeToolsError('Codex could not report its configured MCP servers')
  }
  const threadId = await startThreadWithPermissions(client, config, tempDir, mcpServers)
  await assertNoMcpServers(client, threadId)
  return threadId
}

async function startThreadWithPermissions(
  client: CodexAppServerClient,
  config: AiProviderConfig,
  tempDir: string,
  mcpServers: CodexMcpServerOverrides,
): Promise<string> {
  let profileResult: unknown
  try {
    profileResult = await client.request(
      'thread/start',
      codexThreadStartParams(config, tempDir, 'profile', mcpServers),
    )
    if (activePermissionProfileId(profileResult) === CODEX_PERMISSION_PROFILE) {
      return threadIdFrom(profileResult)
    }
  } catch {
    // Older Codex builds reject the profile keys; fall through to the sandbox.
    profileResult = undefined
  }
  // A user config.toml sandbox_mode or an older Codex ignored the profile. Discard
  // that thread before falling back so it does not linger under looser permissions.
  const abandoned = optionalThreadId(profileResult)
  if (abandoned) {
    await client.request('thread/delete', { threadId: abandoned }).catch(() => undefined)
  }
  return threadIdFrom(
    await client.request(
      'thread/start',
      codexThreadStartParams(config, tempDir, 'read-only', mcpServers),
    ),
  )
}

const USAGE_WINDOWS: Record<number, AiUsageWindow> = { 300: 'five_hour', 10080: 'seven_day' }

interface CodexRateLimitWindow {
  usedPercent: number
  minutes: number | undefined
  /** epoch milliseconds */
  resetsAt: number | undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** The windows of a `RateLimitSnapshot` (`account/rateLimits/updated`, `account/rateLimits/read`) */
function rateLimitWindows(snapshot: unknown): CodexRateLimitWindow[] {
  const value = objectValue(snapshot)
  const windows: CodexRateLimitWindow[] = []
  for (const key of ['primary', 'secondary']) {
    const window = objectValue(value?.[key])
    const usedPercent = finiteNumber(window?.usedPercent)
    if (!window || usedPercent === undefined) continue
    // Codex reports the reset time in epoch seconds
    const resetsAt = finiteNumber(window.resetsAt)
    windows.push({
      usedPercent,
      minutes: finiteNumber(window.windowDurationMins),
      resetsAt: resetsAt !== undefined && resetsAt > 0 ? resetsAt * 1000 : undefined,
    })
  }
  return windows
}

/**
 * The usage Codex reports, as the windows the app shows. Codex names a window
 * by its length: five hours and seven days are passed on, any other length
 * (the free plan has one 30-day window) is not. A window without a reset time
 * is not a usage value, and neither is a snapshot of another limit than the
 * account's main one.
 */
export function codexSubscriptionUsage(snapshot: unknown): AiSubscriptionUsage[] {
  const limitId = objectValue(snapshot)?.limitId
  if (limitId != null && limitId !== 'codex') return []
  const usage: AiSubscriptionUsage[] = []
  for (const window of rateLimitWindows(snapshot)) {
    const name = window.minutes === undefined ? undefined : USAGE_WINDOWS[window.minutes]
    if (!name || window.resetsAt === undefined) continue
    usage.push({
      provider: 'codex',
      window: name,
      utilization: Math.min(1, Math.max(0, window.usedPercent / 100)),
      resetsAt: window.resetsAt,
    })
  }
  return usage
}

/** When an exhausted limit is usable again: the latest reset among the windows that are used up */
function limitResetTime(snapshot: unknown): number | undefined {
  const resets = rateLimitWindows(snapshot)
    .filter((window) => window.usedPercent >= 100 && window.resetsAt !== undefined)
    .map((window) => window.resetsAt!)
  return resets.length > 0 ? Math.max(...resets) : undefined
}

function httpStatusOf(codexErrorInfo: unknown): number | undefined {
  for (const detail of Object.values(objectValue(codexErrorInfo) ?? {})) {
    const status = finiteNumber(objectValue(detail)?.httpStatusCode)
    if (status !== undefined) return status
  }
  return undefined
}

function isUsageLimitError(turnError: unknown): boolean {
  return objectValue(turnError)?.codexErrorInfo === 'usageLimitExceeded'
}

/**
 * The error of a failed turn (`TurnError`: `message` plus `codexErrorInfo`) as
 * the error the app reports. A used-up subscription limit and a rejected login
 * get their own kinds; `rateLimits` is the last snapshot Codex gave, for the
 * reset time. Everything else keeps Codex's message.
 */
export function codexRunError(turnError: unknown, rateLimits?: unknown): Error {
  const value = objectValue(turnError)
  const message =
    typeof value?.message === 'string' && value.message ? value.message : 'Codex turn failed'
  const info = value?.codexErrorInfo
  if (info === 'usageLimitExceeded') {
    const resetsAt = limitResetTime(rateLimits)
    return new AiRunError('rate-limit', message, {
      provider: 'codex',
      ...(resetsAt !== undefined ? { resetsAt } : {}),
    })
  }
  if (info === 'unauthorized' || httpStatusOf(info) === 401) {
    return new AiRunError('signed-out', message, { provider: 'codex' })
  }
  return new Error(message)
}

const RATE_LIMIT_READ_TIMEOUT_MS = 5_000

export interface CodexTurnTransport {
  request(method: string, params: unknown): Promise<unknown>
  onNotification(listener: (message: RpcMessage) => void): () => void
  /** the process ended; without it a turn only ends by its own notifications */
  onClose?(listener: (error: Error) => void): () => void
}

export async function waitForTurn(
  client: CodexTurnTransport,
  threadId: string,
  start: () => Promise<unknown>,
  signal: AbortSignal,
  cb: StreamCallbacks,
): Promise<string> {
  if (signal.aborted) throw cancelledError()
  let turnId = ''
  let finalText = ''
  let settled = false
  /** the last error Codex reported for the turn; it decides nothing until the turn itself ends */
  let reportedError: unknown
  let rateLimits: unknown
  return new Promise<string>((resolve, reject) => {
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      unsubscribe()
      unsubscribeClose?.()
      signal.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve(finalText)
    }
    const fail = (turnError: unknown) => {
      if (!isUsageLimitError(turnError) || limitResetTime(rateLimits) !== undefined) {
        finish(codexRunError(turnError, rateLimits))
        return
      }
      // The turn did not come with the limits; ask for them, briefly, for the reset time.
      const timeout = new Promise<undefined>((done) => {
        const timer = setTimeout(() => done(undefined), RATE_LIMIT_READ_TIMEOUT_MS)
        timer.unref?.()
      })
      void Promise.race([client.request('account/rateLimits/read', undefined), timeout])
        .catch(() => undefined)
        .then((result) => finish(codexRunError(turnError, objectValue(result)?.rateLimits)))
    }
    let interrupted = false
    const interrupt = () => {
      if (!turnId || interrupted) return
      interrupted = true
      void client.request('turn/interrupt', { threadId, turnId }).catch(() => undefined)
    }
    const onAbort = () => {
      interrupt()
      finish(cancelledError())
    }
    const unsubscribe = client.onNotification((message) => {
      const params = objectValue(message.params)
      if (message.method === 'account/rateLimits/updated') {
        // account-wide, so it carries no thread id
        rateLimits = params?.rateLimits
        const usage = codexSubscriptionUsage(rateLimits)
        if (usage.length > 0) cb.onSubscriptionUsage?.(usage)
        return
      }
      if (params?.threadId !== threadId) return
      // A reconnect notice is not data: while only those arrive, the idle timeout keeps running.
      if (message.method !== 'error' || params.willRetry !== true) cb.onActivity?.()
      const eventTurnId = typeof params.turnId === 'string' ? params.turnId : ''
      if (turnId && eventTurnId && eventTurnId !== turnId) return
      if (message.method === 'turn/started') {
        const turn = objectValue(params.turn)
        if (typeof turn?.id === 'string') turnId = turn.id
      } else if (message.method === 'item/completed') {
        const item = objectValue(params.item)
        if (item?.type === 'agentMessage' && typeof item.text === 'string') finalText = item.text
      } else if (message.method === 'item/reasoning/summaryTextDelta') {
        if (typeof params.delta === 'string') cb.onReasoningDelta?.(params.delta)
      } else if (message.method === 'turn/completed') {
        const turn = objectValue(params.turn)
        if (typeof turn?.id === 'string') turnId = turn.id
        if (!finalText) finalText = finalMessageFromTurn(params)
        if (turn?.status === 'failed') {
          fail(turn.error ?? reportedError)
        } else {
          finish()
        }
      } else if (message.method === 'error') {
        // willRetry: a dropped model stream Codex reconnects on its own ("Reconnecting... 2/5");
        // the turn is still live and ends with turn/completed.
        if (params.willRetry === true) return
        // Codex reports warnings this way too, so an error alone does not fail the turn: the
        // turn's own outcome (turn/completed, or the process ending) does.
        reportedError = objectValue(params.error) ?? params
      }
    })
    const unsubscribeClose = client.onClose?.((error) =>
      finish(error instanceof AiRunError || !reportedError ? error : codexRunError(reportedError)),
    )
    signal.addEventListener('abort', onAbort, { once: true })
    void start()
      .then((result) => {
        const turn = objectValue(objectValue(result)?.turn)
        if (typeof turn?.id === 'string') turnId = turn.id
        // An abort that raced the turn/start response settled locally; stop the server turn too.
        if (signal.aborted) interrupt()
      })
      .catch((error) => finish(error instanceof Error ? error : new Error(String(error))))
  })
}

async function runCodexAppServer(
  config: AiProviderConfig,
  system: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  maxTokens: number,
  cb: StreamCallbacks,
): Promise<void> {
  const nativeSessionId = cb.sessionId ?? `one-shot-${randomUUID()}`
  // One-shot chats and the connection test have no reusable transport id, so
  // their thread and temp dir are dropped as soon as the turn ends.
  const ephemeral = cb.sessionId === undefined
  const run = async (client: CodexAppServerClient): Promise<void> => {
    await assertRunnableAccount(client)
    const model = config.model.trim() || (await defaultModelFor(client))
    const signature = sessionSignature(system, tools, model)
    let session = client.getSession(nativeSessionId)
    let nextMessages = incrementalMessages(session, signature, messages)
    if (!session || nextMessages === null) {
      if (session) client.deleteSession(nativeSessionId)
      const tempDir = await createTrackedTempDir(CODEX_TEMP_PREFIX)
      let threadId: string
      try {
        threadId = await startNativeThread(client, { ...config, model }, tempDir)
      } catch (error) {
        await removeTrackedTempDir(tempDir)
        throw error
      }
      session = { threadId, signature, messageFingerprints: [], tempDir }
      client.setSession(nativeSessionId, session)
      nextMessages = messages
    }
    try {
      const imagePaths = await materializeImages(nextMessages, session.tempDir)
      const prompt = buildCodexAppServerPrompt(system, nextMessages, tools, maxTokens)
      const raw = await waitForTurn(
        client,
        session.threadId,
        () =>
          client.request('turn/start', {
            threadId: session.threadId,
            input: [
              { type: 'text', text: prompt, text_elements: [] },
              ...imagePaths.map((path) => ({ type: 'localImage', path })),
            ],
            outputSchema: codexAppServerOutputSchema(tools),
          }),
        cb.signal,
        cb,
      )
      const turn = parseCodexAppServerTurn(raw, tools)
      session.messageFingerprints = messages.map(fingerprint)
      if (turn.text) cb.onDelta(turn.text)
      for (const call of turn.toolCalls) cb.onToolCall(call)
    } catch (error) {
      client.deleteSession(nativeSessionId)
      throw error
    } finally {
      if (ephemeral) client.deleteSession(nativeSessionId)
    }
  }
  await withClient(config.cliPath, run, cb.signal)
}

export async function streamCodexAppServer(
  config: AiProviderConfig,
  system: string,
  messages: AgentMessage[],
  tools: AgentToolDef[],
  maxTokens: number,
  cb: StreamCallbacks,
): Promise<void> {
  const wd = createStreamWatchdog(cb.signal)
  return wd.guard(() =>
    runCodexAppServer(config, system, messages, tools, maxTokens, {
      ...cb,
      signal: wd.signal,
      onActivity: () => {
        wd.touch()
        cb.onActivity?.()
      },
    }),
  )
}

export async function chatCodexAppServer(
  config: AiProviderConfig,
  system: string,
  user: string,
  signal: AbortSignal,
): Promise<AiChatResponse> {
  let content = ''
  // No sessionId: a one-shot chat/connection test is not reused, so it runs as
  // an ephemeral turn whose thread and temp dir are dropped when it ends.
  await runCodexAppServer(config, system, [{ role: 'user', text: user }], [], 1024, {
    signal,
    onDelta: (text) => {
      content += text
    },
    onToolCall: () => undefined,
  })
  return content
    ? { ok: true, content }
    : { ok: false, error: 'Codex app-server returned no content' }
}

/**
 * The kind of login the status check last read through this bridge
 * (`signed-out` when it found none). Undefined until a status check ran.
 */
let statusLoginKind: string | undefined

function abortError(): Error {
  const error = new Error('The Codex account check was cancelled')
  error.name = 'AbortError'
  return error
}

/**
 * The app-server's `account/read` result, as is: what kind of login Codex is
 * on (`chatgpt` with a plan, `apiKey`, …). It is what the subscription status
 * check asks for; `codexAccountInfo` there maps it and drops the email. The
 * login itself is never read: Codex only says what kind it is.
 */
export async function readCodexAccount(cliPath?: string, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) throw abortError()
  const read = withClient(cliPath, async (client) => {
    const account = await client.request('account/read', { refreshToken: false })
    const login = codexAccountInfo(account)
    if (login) statusLoginKind = login.signedIn ? login.loginKind : 'signed-out'
    return account
  }).catch((error: unknown) => {
    // the status check went on without this reading, so it is no longer what the check saw
    statusLoginKind = undefined
    throw error
  })
  if (!signal) return read
  return new Promise((resolve, reject) => {
    const onAbort = (): void => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    read.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

setCodexAccountSource(({ configuredPath, signal }) => readCodexAccount(configuredPath, signal))

/**
 * Whether Codex may be used on a metered login (an API key, say) is decided
 * where the provider is selected, from the status check and the user's "use
 * anyway". That decision is about the login the status check saw. So a run is
 * stopped here in the one case the selection cannot see: Codex is now on a
 * metered login of another kind than the status check last read (the user
 * switched logins since). The next status check picks the new login up.
 */
async function assertRunnableAccount(client: CodexAppServerClient): Promise<void> {
  const login = codexAccountInfo(await client.request('account/read', { refreshToken: false }))
  if (!login) return
  if (!login.signedIn) throw signedOutError()
  if (login.loginMethod === 'subscription') return
  if (statusLoginKind !== undefined && statusLoginKind !== login.loginKind) {
    throw new AiRunError(
      'metered-not-accepted',
      'Codex is signed in with a login that is billed by usage, which has not been accepted',
      { provider: 'codex' },
    )
  }
}

export async function listCodexModels(cliPath?: string): Promise<CodexModelCatalog> {
  return withClient(cliPath, async (client) => {
    const account = objectValue(await client.request('account/read', { refreshToken: false }))
    if (account?.requiresOpenaiAuth === true && account.account == null) {
      throw signedOutError()
    }
    return readModelCatalog(client)
  })
}

/** The id a `model/list` entry is selected by */
function modelEntryId(entry: ModelEntry): string {
  return typeof entry.id === 'string'
    ? entry.id
    : typeof entry.model === 'string'
      ? entry.model
      : ''
}

/** Every entry of `model/list` that is not hidden, page by page, as Codex gives it */
async function readModelEntries(client: CodexAppServerClient): Promise<ModelEntry[]> {
  const entries: ModelEntry[] = []
  let cursor: string | null = null
  for (let page = 0; page < MAX_MODEL_PAGES; page++) {
    const result = objectValue(
      await client.request('model/list', { cursor, limit: 100, includeHidden: false }),
    )
    const data = Array.isArray(result?.data) ? result.data : []
    for (const value of data) {
      const entry = objectValue(value) as ModelEntry | undefined
      if (!entry || entry.hidden === true) continue
      entries.push(entry)
    }
    cursor = typeof result?.nextCursor === 'string' ? result.nextCursor : null
    if (!cursor) break
  }
  return entries
}

async function readModelCatalog(client: CodexAppServerClient): Promise<CodexModelCatalog> {
  const models: string[] = []
  let defaultModel = ''
  for (const entry of await readModelEntries(client)) {
    const id = modelEntryId(entry)
    if (!id || models.includes(id)) continue
    models.push(id)
    if (entry.isDefault === true) defaultModel = id
  }
  if (!defaultModel) defaultModel = models[0] ?? ''
  return { models, defaultModel }
}

/**
 * The entries of `model/list` as the connection status lists them: the id a
 * selection stores, Codex's display name, the model behind the id when that is
 * another name, and which one an empty selection runs on. That is the entry
 * Codex flags as its default, or the first one when it flags none: the same
 * choice `defaultModelFor` makes for a run.
 */
export function codexSubscriptionModels(entries: unknown): AiSubscriptionModel[] {
  if (!Array.isArray(entries)) return []
  const listed = entries.flatMap((value) => {
    const entry = objectValue(value) as ModelEntry | undefined
    if (!entry || entry.hidden === true) return []
    const id = modelEntryId(entry)
    return id
      ? [
          {
            id,
            label: typeof entry.displayName === 'string' ? entry.displayName : '',
            ...(typeof entry.model === 'string' && entry.model !== id
              ? { resolved: entry.model }
              : {}),
            ...(entry.isDefault === true ? { isDefault: true } : {}),
          },
        ]
      : []
  })
  // ids Codex could not be given back, and names out of bounds, end here
  const models = subscriptionModelsOf(listed) ?? []
  const flagged = models.filter((model) => model.isDefault)
  const fallback = flagged.at(-1) ?? models[0]
  return models.map((model) => ({
    id: model.id,
    label: model.label,
    ...(model.resolved ? { resolved: model.resolved } : {}),
    ...(model === fallback ? { isDefault: true } : {}),
  }))
}

/**
 * The models Codex offers, read from the app-server's `model/list`: no thread
 * is opened and no turn is run, so nothing is asked of a model. It is what the
 * subscription status check asks for.
 */
export async function listCodexSubscriptionModels(
  cliPath?: string,
  signal?: AbortSignal,
): Promise<AiSubscriptionModel[]> {
  if (signal?.aborted) throw abortError()
  const reading = withClient(
    cliPath,
    async (client) => codexSubscriptionModels(await readModelEntries(client)),
    signal,
  )
  if (!signal) return reading
  return new Promise((resolve, reject) => {
    const onAbort = (): void => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    reading.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

setSubscriptionModelSource('codex', ({ configuredPath, signal }) =>
  listCodexSubscriptionModels(configuredPath, signal),
)

/**
 * How `rpcError` words a request Codex does not know: "method not found", or
 * "invalid request", which is what `codex app-server` answers for an unknown
 * method name.
 */
const RPC_UNSUPPORTED = /^Codex app-server error \((?:-32601|-32600)\)/

/** The default model each running process listed; an entry is gone with its process */
const defaultModels = new WeakMap<CodexAppServerClient, Promise<string>>()

/**
 * The model of a run whose configuration names none. Left out of the thread,
 * Codex takes the model from the user's own `config.toml`, the file this bridge
 * otherwise overrides, and that one may only exist at the provider the user
 * configured there. So a model is always named: the default of the list Codex
 * itself gives. The list is read once per process. Without a default the run
 * fails rather than leave the choice to that file.
 */
function defaultModelFor(client: CodexAppServerClient): Promise<string> {
  const known = defaultModels.get(client)
  if (known) return known
  const reading = readModelCatalog(client).then(
    ({ defaultModel }) => {
      if (defaultModel) return defaultModel
      throw new Error('Codex listed no model, so there is no default model to run with')
    },
    (error: unknown) => {
      if (error instanceof AiRunError) throw error
      const detail = error instanceof Error ? error.message : String(error)
      if (RPC_UNSUPPORTED.test(detail)) {
        throw new AiRunError(
          'needs-update',
          'Codex is too old for this app: it cannot list its models, so there is no default model to run with',
          { provider: 'codex' },
        )
      }
      throw new Error(`Codex could not report its default model: ${detail}`, { cause: error })
    },
  )
  defaultModels.set(client, reading)
  // a failed reading is not kept: the next run asks again
  reading.catch(() => {
    if (defaultModels.get(client) === reading) defaultModels.delete(client)
  })
  return reading
}
