/**
 * Running a "my PC" MCP server (user MCP spec 5.3, 5.5, 5.6): the one place
 * the app starts a program a person typed in, and only after they approved
 * that exact launch (4.5).
 *
 * - The program starts from the plan `prepareLocalLaunch` computes, which is
 *   also what the confirmation shows: a resolved absolute path and an
 *   argument array, never a shell, in an empty folder the app made, with the
 *   minimal system variables and the registered ones only.
 * - A launch whose fingerprint is not the approved one never starts, and
 *   neither does one whose resolved plan (program path, arguments, variable
 *   names) is not the plan the person allowed.
 * - One process per server, started at the first need and shared by every
 *   caller; it ends after an idle time, with the app (it is in the same
 *   registry as the subscription programs, so a force-killed app's leftover
 *   is ended at the next start), and always with everything it started.
 * - A crash means a fresh start at the next call; three failed starts in a
 *   row leave the server failed until the person retries.
 * - Standard error is never logged: only its last lines stay in memory, for
 *   the "couldn't connect" reason view.
 * - The client declares no capabilities; sampling, roots and elicitation
 *   requests from the server are refused.
 */
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  ErrorCode,
  McpError,
  ToolListChangedNotificationSchema,
  type JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js'
import {
  USER_MCP_CHILD_KIND,
  killProcessTree,
  sharedSubscriptionChildRegistry,
  type SubscriptionChildRegistry,
} from '@genoffice/ai-provider/subscription'
import {
  MCP_RESULT_MAX_CHARS,
  shapeMcpResult,
  type ShapedMcpResult,
} from '@genoffice/agent-core/user-mcp/result'
import { launchReviewNeeded, planFingerprint } from './fingerprint'
import { MCP_CALL_TIMEOUT_MS } from './limits'
import type { ListedTool, McpListing } from './listing'
import { prepareLocalLaunch, type LocalLaunchProblem, type PlannedLaunch } from './local-launch'
import type { McpRuntimeKit } from './runtimes'
import type { McpServerConfig } from './store'

/** Idle time after which a server is ended (5.3), a tunable default */
export const MCP_LOCAL_IDLE_MS = 10 * 60_000
/** Limit of a start up to the MCP handshake; npx may download the package first */
export const MCP_LOCAL_START_TIMEOUT_MS = 3 * 60_000
/** Failed starts in a row after which the server waits for the person (5.3) */
export const MCP_LOCAL_MAX_START_FAILURES = 3
/** Standard-error lines kept for the reason view */
export const MCP_STDERR_TAIL_LINES = 20
const STDERR_LINE_MAX_CHARS = 1_000
/** Longest wait for a stopped process to be gone */
const EXIT_WAIT_MS = 5_000
/** Pages of a tool list read before giving up on a server that never ends it */
const MAX_LIST_PAGES = 100

/** Why a server is not usable right now */
export type LocalMcpFailure = 'start-failed' | 'runtime-missing'

/**
 * What the connection is doing. `idle`: not running, starts at the next need
 * (never started, ended after the idle time, or exited).
 */
export type LocalMcpState =
  | { state: 'idle' }
  | { state: 'starting' }
  | { state: 'running' }
  | { state: 'review-required' }
  | {
      state: 'failed'
      reason: LocalMcpFailure
      /** what went wrong, for the reason view */
      problem: LocalLaunchProblem | 'did-not-start'
      /** English; holds no secret */
      message: string
    }

export type LocalMcpErrorReason =
  'disabled' | 'review-required' | 'start-failed' | 'runtime-missing' | 'unreachable' | 'timeout'

/** A failure to start or reach the server; its message names no secret */
export class LocalMcpError extends Error {
  constructor(
    readonly reason: LocalMcpErrorReason,
    message: string,
    readonly problem: LocalLaunchProblem | 'did-not-start' | null = null,
  ) {
    super(message)
    this.name = 'LocalMcpError'
  }
}

export type LocalMcpSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess

export interface LocalMcpDeps {
  kit: Pick<McpRuntimeKit, 'resolveCommand'>
  /** the product name and version the server is told (5.6) */
  clientInfo: { name: string; version: string }
  /** where started servers are recorded; the subscription programs' shared one when absent */
  registry?: SubscriptionChildRegistry | null | undefined
  /** the app's environment the system variables are read from */
  baseEnv?: NodeJS.ProcessEnv | undefined
  /** see `MCP_LOCAL_SYSTEM_ENV` */
  systemEnv?: readonly string[] | undefined
  platform?: NodeJS.Platform | undefined
  /** the folder the per-start empty working folders are made in; the temp folder when absent */
  workRoot?: string | undefined
  idleMs?: number | undefined
  callTimeoutMs?: number | undefined
  startTimeoutMs?: number | undefined
  maxStartFailures?: number | undefined
  resultMaxChars?: number | undefined
  /** the app is quitting: stop, and abort a runtime download under way */
  appSignal?: AbortSignal | undefined
  spawn?: LocalMcpSpawn | undefined
}

export interface LocalMcpConnection {
  readonly serverId: string
  status(): LocalMcpState
  /** the last lines the server wrote to standard error, for the reason view only */
  stderrTail(): string[]
  /** Start the server unless it runs; rejects with a `LocalMcpError` */
  ensure(signal?: AbortSignal): Promise<void>
  /** The tool list and instructions, read from the server (starting it when needed) */
  listTools(signal?: AbortSignal): Promise<McpListing>
  /**
   * Call a tool. A tool error, a server that cannot be started or reached
   * and a call over the time limit all resolve as a tool error naming the
   * server and the reason; only the caller's own abort rejects (`AbortError`).
   */
  callTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ShapedMcpResult>
  /** The server said its tool list changed; returns an unsubscribe function */
  onToolsChanged(listener: () => void): () => void
  onStateChanged(listener: (state: LocalMcpState) => void): () => void
  /** End the process (calls under way end as tool errors); the next need starts it again */
  stop(): Promise<void>
  /** Clear a failed state so the next need tries again */
  retry(): void
  /**
   * A changed configuration. A launch that now needs approval stops at once;
   * another change of the command, arguments or variables restarts the
   * server once the calls under way have finished.
   */
  setServer(server: McpServerConfig): void
  /** The command this server runs, as the confirmation shows it */
  plannedLaunch(): Promise<PlannedLaunch>
}

function abortError(): Error {
  const error = new Error('The call was cancelled')
  error.name = 'AbortError'
  return error
}

/** Lines of standard error, the last few only; a line never grows without bound */
class StderrTail {
  private lines: string[] = []
  private partial = ''

  constructor(private readonly max: number) {}

  push(chunk: Buffer | string): void {
    const parts = (this.partial + chunk.toString()).split(/\r?\n/)
    this.partial = (parts.pop() ?? '').slice(-STDERR_LINE_MAX_CHARS)
    for (const line of parts) this.add(line)
  }

  end(): void {
    if (this.partial) this.add(this.partial)
    this.partial = ''
  }

  clear(): void {
    this.lines = []
    this.partial = ''
  }

  snapshot(): string[] {
    return this.partial ? [...this.lines, this.partial].slice(-this.max) : [...this.lines]
  }

  private add(line: string): void {
    if (!line) return
    this.lines.push(line.slice(0, STDERR_LINE_MAX_CHARS))
    if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max)
  }
}

/**
 * MCP over a child's standard input and output, for a child this module
 * started itself (the SDK's own stdio transport would start it through
 * cross-spawn, which wraps Windows scripts in a command interpreter).
 */
class ChildProcessTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void
  private readonly buffer = new ReadBuffer()
  private closed = false
  private started = false

  constructor(
    private readonly child: ChildProcess,
    private readonly end: () => void,
  ) {}

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.buffer.append(chunk)
      for (;;) {
        let message: JSONRPCMessage | null
        try {
          message = this.buffer.readMessage()
        } catch (error) {
          this.onerror?.(error instanceof Error ? error : new Error(String(error)))
          continue
        }
        if (!message) break
        this.onmessage?.(message)
      }
    })
    // a server that exits mid-write must not take the app down with EPIPE
    this.child.stdin?.on('error', () => this.finish())
    this.child.once('error', (error) => {
      this.onerror?.(error)
      this.finish()
    })
    this.child.once('exit', () => this.finish())
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      const stdin = this.child.stdin
      if (this.closed || !stdin || stdin.destroyed) {
        reject(new McpError(ErrorCode.ConnectionClosed, 'The server is not running'))
        return
      }
      if (stdin.write(serializeMessage(message))) resolve()
      else stdin.once('drain', resolve)
    })
  }

  async close(): Promise<void> {
    this.end()
    this.finish()
  }

  private finish(): void {
    if (this.closed) return
    this.closed = true
    this.buffer.clear()
    this.onclose?.()
  }
}

interface Running {
  child: ChildProcess
  client: Client
  cwd: string
  /** resolves when the process has exited and its streams are closed */
  gone: Promise<void>
}

export function createLocalMcpConnection(
  initial: McpServerConfig,
  deps: LocalMcpDeps,
): LocalMcpConnection {
  let server = initial
  const platform = deps.platform ?? process.platform
  const registry = deps.registry === undefined ? sharedSubscriptionChildRegistry() : deps.registry
  const spawnChild: LocalMcpSpawn =
    deps.spawn ?? ((command, args, options) => nodeSpawn(command, [...args], options))
  const idleMs = deps.idleMs ?? MCP_LOCAL_IDLE_MS
  const callTimeoutMs = deps.callTimeoutMs ?? MCP_CALL_TIMEOUT_MS
  const startTimeoutMs = deps.startTimeoutMs ?? MCP_LOCAL_START_TIMEOUT_MS
  const maxFailures = deps.maxStartFailures ?? MCP_LOCAL_MAX_START_FAILURES
  const resultMaxChars = deps.resultMaxChars ?? MCP_RESULT_MAX_CHARS
  const tail = new StderrTail(MCP_STDERR_TAIL_LINES)
  const toolListeners = new Set<() => void>()
  const stateListeners = new Set<(state: LocalMcpState) => void>()

  let state: LocalMcpState = launchReviewNeeded(server)
    ? { state: 'review-required' }
    : { state: 'idle' }
  let running: Running | null = null
  let starting: Promise<Running> | null = null
  /** aborted by `stop`: a start under way gives up, a runtime download stops */
  let lifetime = new AbortController()
  let failures = 0
  let busy = 0
  let idleTimer: NodeJS.Timeout | null = null
  let restartWhenIdle = false
  /** the last start found a resolved plan other than the approved one (4.5) */
  let planReview = false

  const setState = (next: LocalMcpState): void => {
    state = next
    for (const listener of stateListeners) {
      try {
        listener(next)
      } catch {
        /* a listener's failure is its own */
      }
    }
  }

  const clearIdle = (): void => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
  }

  const armIdle = (): void => {
    clearIdle()
    if (!running || busy > 0) return
    if (restartWhenIdle) {
      restartWhenIdle = false
      void stopProcess()
      return
    }
    idleTimer = setTimeout(() => {
      idleTimer = null
      if (busy === 0) void stopProcess()
    }, idleMs)
    idleTimer.unref?.()
  }

  /** End the process tree and wait (a little) until it is gone */
  async function stopProcess(): Promise<void> {
    clearIdle()
    const current = running
    running = null
    if (!current) return
    if (state.state === 'running' || state.state === 'starting') setState({ state: 'idle' })
    await current.client.close().catch(() => undefined)
    await Promise.race([current.gone, new Promise((done) => setTimeout(done, EXIT_WAIT_MS))])
  }

  deps.appSignal?.addEventListener('abort', () => void connection.stop(), { once: true })

  function failStart(
    reason: LocalMcpFailure,
    problem: LocalLaunchProblem | 'did-not-start',
    message: string,
    permanent: boolean,
  ): LocalMcpError {
    if (reason === 'start-failed') {
      failures = permanent ? maxFailures : failures + 1
      if (failures >= maxFailures) setState({ state: 'failed', reason, problem, message })
      else setState({ state: 'idle' })
    } else {
      setState({ state: 'failed', reason, problem, message })
    }
    return new LocalMcpError(reason, message, problem)
  }

  async function start(): Promise<Running> {
    const own = lifetime
    const signal = own.signal
    setState({ state: 'starting' })
    tail.clear()
    let prepared: Awaited<ReturnType<typeof prepareLocalLaunch>>
    try {
      prepared = await prepareLocalLaunch(server, deps.kit, {
        baseEnv: deps.baseEnv,
        platform,
        systemEnv: deps.systemEnv,
        offerDownload: true,
        signal,
      })
    } catch {
      if (signal.aborted) throw new LocalMcpError('unreachable', 'The server was stopped')
      throw failStart('start-failed', 'did-not-start', 'The program could not be looked up', false)
    }
    if (signal.aborted) throw new LocalMcpError('unreachable', 'The server was stopped')
    const plan = prepared.plan
    if (!plan.ok || !prepared.env) {
      if (!plan.ok && plan.problem === 'runtime-missing') {
        throw failStart('runtime-missing', plan.problem, plan.message, false)
      }
      const problem = plan.ok ? 'did-not-start' : plan.problem
      throw failStart('start-failed', problem, plan.ok ? 'no environment' : plan.message, true)
    }
    // 4.5: the program resolves elsewhere since the person allowed it (the PC's runtime gone
    // and the app's in its place, another version): what would run now is asked about again
    if (planFingerprint(plan) !== server.approvedPlan) {
      planReview = true
      setState({ state: 'review-required' })
      throw new LocalMcpError('review-required', 'The command must be approved again')
    }
    planReview = false

    let cwd: string
    try {
      const workRoot = deps.workRoot ?? tmpdir()
      await mkdir(workRoot, { recursive: true })
      cwd = await mkdtemp(join(workRoot, 'ieum-mcp-'))
    } catch {
      throw failStart('start-failed', 'did-not-start', 'No working folder could be made', false)
    }
    let child: ChildProcess
    try {
      child = spawnChild(plan.command, plan.args, {
        cwd,
        env: prepared.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
        // POSIX: its own process group, so the whole group can be ended
        detached: platform !== 'win32',
      })
    } catch (error) {
      await rm(cwd, { recursive: true, force: true }).catch(() => undefined)
      throw failStart(
        'start-failed',
        'did-not-start',
        error instanceof Error ? error.message : String(error),
        false,
      )
    }
    registry?.track(child, { provider: USER_MCP_CHILD_KIND, command: plan.command })
    child.stderr?.on('data', (chunk: Buffer) => tail.push(chunk))
    const gone = new Promise<void>((resolve) => {
      let finished = false
      const done = (): void => {
        if (finished) return
        finished = true
        tail.end()
        void rm(cwd, { recursive: true, force: true }).catch(() => undefined)
        resolve()
      }
      child.once('close', done)
      child.once('error', () => {
        // a child that never started emits no close
        if (child.pid === undefined) done()
      })
    })
    let ended = false
    const endTree = (): void => {
      if (ended) return
      ended = true
      killProcessTree(child, { platform })
    }

    const client = new Client(deps.clientInfo, { capabilities: {} })
    // 5.6: the app answers no request of the server's (sampling, roots, elicitation, …)
    client.fallbackRequestHandler = async (request) => {
      throw new McpError(ErrorCode.MethodNotFound, `Method not found: ${request.method}`)
    }
    client.onerror = () => undefined
    client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      for (const listener of toolListeners) {
        try {
          listener()
        } catch {
          /* a listener's failure is its own */
        }
      }
    })
    const transport = new ChildProcessTransport(child, endTree)
    const current: Running = { child, client, cwd, gone }
    client.onclose = () => {
      // the process exited, or the connection was closed
      endTree()
      if (running === current) {
        running = null
        clearIdle()
        if (state.state === 'running') setState({ state: 'idle' })
      }
    }
    try {
      await client.connect(transport, { timeout: startTimeoutMs, signal })
    } catch (error) {
      await client.close().catch(() => undefined)
      endTree()
      await Promise.race([gone, new Promise((done) => setTimeout(done, EXIT_WAIT_MS))])
      if (signal.aborted) throw new LocalMcpError('unreachable', 'The server was stopped')
      const timedOut = error instanceof McpError && error.code === ErrorCode.RequestTimeout
      throw failStart(
        'start-failed',
        'did-not-start',
        timedOut ? 'The server did not answer in time' : 'The server did not start',
        false,
      )
    }
    if (signal.aborted || own !== lifetime) {
      await client.close().catch(() => undefined)
      throw new LocalMcpError('unreachable', 'The server was stopped')
    }
    failures = 0
    running = current
    setState({ state: 'running' })
    return current
  }

  function gate(): LocalMcpError | null {
    if (deps.appSignal?.aborted) return new LocalMcpError('unreachable', 'The app is closing')
    if (!server.enabled) return new LocalMcpError('disabled', 'The server is turned off')
    if (server.kind !== 'local') return new LocalMcpError('start-failed', 'Not a local server')
    if (launchReviewNeeded(server)) {
      if (state.state !== 'review-required') setState({ state: 'review-required' })
      return new LocalMcpError('review-required', 'The command must be approved again')
    }
    if (state.state === 'failed') {
      return new LocalMcpError(state.reason, state.message, state.problem)
    }
    return null
  }

  async function ensureRunning(signal?: AbortSignal): Promise<Running> {
    if (signal?.aborted) throw abortError()
    const refused = gate()
    if (refused) throw refused
    if (running) return running
    if (!starting) {
      starting = start().finally(() => {
        starting = null
      })
    }
    const pending = starting
    if (!signal) return pending
    return new Promise<Running>((resolve, reject) => {
      const onAbort = (): void => reject(abortError())
      signal.addEventListener('abort', onAbort, { once: true })
      pending.then(
        (value) => {
          signal.removeEventListener('abort', onAbort)
          resolve(value)
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort)
          reject(error)
        },
      )
    })
  }

  /** Run `task` against a started server, holding off the idle timer meanwhile */
  async function withServer<T>(
    signal: AbortSignal | undefined,
    task: (current: Running) => Promise<T>,
  ): Promise<T> {
    busy += 1
    clearIdle()
    try {
      const current = await ensureRunning(signal)
      return await task(current)
    } finally {
      busy -= 1
      armIdle()
    }
  }

  const describeFailure = (error: unknown): string => {
    if (error instanceof LocalMcpError) {
      switch (error.reason) {
        case 'disabled':
          return 'the server is turned off'
        case 'review-required':
          return 'its command changed and must be approved again in settings'
        case 'runtime-missing':
          return 'the program it needs is not on this PC'
        case 'start-failed':
          return 'the server could not be started'
        case 'timeout':
          return `the server did not answer within ${Math.round(callTimeoutMs / 1000)} seconds`
        default:
          return 'the server could not be reached'
      }
    }
    if (error instanceof McpError) {
      if (error.code === ErrorCode.RequestTimeout) {
        return `the server did not answer within ${Math.round(callTimeoutMs / 1000)} seconds`
      }
      if (error.code === ErrorCode.ConnectionClosed) return 'the server stopped during the call'
      return `the server refused the call (${error.message.slice(0, 500)})`
    }
    return 'the server could not be reached'
  }

  const connection: LocalMcpConnection = {
    serverId: initial.id,

    status: () => state,

    stderrTail: () => tail.snapshot(),

    async ensure(signal) {
      busy += 1
      clearIdle()
      try {
        await ensureRunning(signal)
      } finally {
        busy -= 1
        armIdle()
      }
    },

    listTools(signal) {
      return withServer(signal, async ({ client }) => {
        const tools: ListedTool[] = []
        let cursor: string | undefined
        for (let page = 0; page < MAX_LIST_PAGES; page++) {
          const result = await client
            .listTools(cursor ? { cursor } : {}, { signal, timeout: callTimeoutMs })
            .catch((error: unknown) => {
              if (signal?.aborted) throw abortError()
              const timedOut = error instanceof McpError && error.code === ErrorCode.RequestTimeout
              throw new LocalMcpError(timedOut ? 'timeout' : 'unreachable', describeFailure(error))
            })
          for (const tool of result.tools) {
            const listed: ListedTool = { name: tool.name }
            if (tool.description !== undefined) listed.description = tool.description
            if (tool.inputSchema !== undefined) {
              listed.inputSchema = tool.inputSchema as Record<string, unknown>
            }
            if (tool.annotations !== undefined) listed.annotations = { ...tool.annotations }
            tools.push(listed)
          }
          cursor = result.nextCursor
          if (!cursor) break
        }
        return { tools, instructions: client.getInstructions() ?? null }
      })
    },

    async callTool(name, args, signal) {
      try {
        return await withServer(signal, async ({ client }) => {
          const result = await client.callTool({ name, arguments: args }, undefined, {
            signal,
            timeout: callTimeoutMs,
          })
          return shapeMcpResult(result, resultMaxChars)
        })
      } catch (error) {
        if (signal?.aborted) throw abortError()
        return { output: `${server.name}: ${describeFailure(error)}.`, isError: true }
      }
    },

    onToolsChanged(listener) {
      toolListeners.add(listener)
      return () => toolListeners.delete(listener)
    },

    onStateChanged(listener) {
      stateListeners.add(listener)
      return () => stateListeners.delete(listener)
    },

    async stop() {
      lifetime.abort()
      lifetime = new AbortController()
      restartWhenIdle = false
      const pending = starting
      await stopProcess()
      if (pending)
        await pending.then(
          () => stopProcess(),
          () => undefined,
        )
      if (state.state === 'starting' || state.state === 'running') setState({ state: 'idle' })
    },

    retry() {
      failures = 0
      if (state.state === 'failed') {
        setState(launchReviewNeeded(server) ? { state: 'review-required' } : { state: 'idle' })
      }
    },

    setServer(next) {
      const before = server
      server = next
      if (launchReviewNeeded(next) || !next.enabled) {
        if (launchReviewNeeded(next)) setState({ state: 'review-required' })
        void connection.stop()
        return
      }
      // a review the launcher found (another resolved program) ends only with a new approval
      if (
        state.state === 'review-required' &&
        (!planReview || before.approvedPlan !== next.approvedPlan)
      ) {
        planReview = false
        setState({ state: 'idle' })
      }
      const launchChanged =
        before.command !== next.command ||
        JSON.stringify(before.args) !== JSON.stringify(next.args) ||
        JSON.stringify(Object.entries(before.env).sort()) !==
          JSON.stringify(Object.entries(next.env).sort())
      if (!launchChanged) return
      // a new launch deserves a fresh try
      failures = 0
      if (state.state === 'failed') setState({ state: 'idle' })
      if (!running) return
      if (busy === 0) void stopProcess()
      else restartWhenIdle = true
    },

    plannedLaunch() {
      return prepareLocalLaunch(server, deps.kit, {
        baseEnv: deps.baseEnv,
        platform,
        systemEnv: deps.systemEnv,
      }).then((prepared) => prepared.plan)
    },
  }
  return connection
}
