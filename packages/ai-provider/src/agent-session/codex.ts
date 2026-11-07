/**
 * Agent mode on Codex (decision 0032): a Codex app-server of the session's own
 * runs one thread in the project folder with Codex's tools on, inside Codex's
 * sandbox, and asks the app before it goes beyond it.
 *
 * What keeps it contained:
 * - a permission profile of the session: the project folder is writable, the
 *   documents open in tabs are read-only, protected folders cannot be read,
 *   and commands reach the internet only when the person turned that on for
 *   the project folder. Codex enforces it in its own sandbox (on Windows,
 *   MXC), checked on this PC before the session opens. A thread that does not
 *   report the profile and approval policy asked for is ended rather than run
 *   under looser rules;
 * - an approval policy under which an approved command stays in the sandbox;
 * - the same configuration overrides as the brain-only bridge (no user hooks,
 *   plugins, apps or memories, and no list of Codex's own skills): the skills
 *   are the app's copy of the enabled ones, readable in the sandbox and listed
 *   in the instructions, so Codex follows the same on/off states as every
 *   other AI window. Only web search differs: the person's choice for the
 *   project folder, as in the Codex app;
 * - every user MCP server switched off for the thread, the app's own server
 *   and the session's relays of the person's MCP servers in the app (user MCP
 *   spec 9) added, and the attached list checked afterwards;
 * - the login checked before the thread opens: a metered login runs only when
 *   the person accepted it.
 */
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { join, posix, win32 } from 'node:path'
import {
  CODEX_CONFIG_OVERRIDES,
  activePermissionProfileId,
  attachBoundedRpcStdout,
  codexAttachedMcpServers,
  codexListedEffort,
  codexMcpServerOverrides,
  codexRunError,
} from '../codex-app-server'
import type { AiEffort } from '../effort'
import { isPlainObject } from '../protocols/shared'
import { AiRunError } from '../run-error'
import { resolveSubscriptionProgram, type SubscriptionProgram } from '../subscription/locate'
import {
  killProcessTree,
  spawnSubscriptionProgram,
  type SubscriptionChildRegistry,
  type SubscriptionSpawn,
} from '../subscription/process'
import { codexAccountInfo } from '../subscription/status'
import { APP_MCP_SERVER_NAME, agentUsableRelays, isAgentAppMcpTool } from './claude'
import { probeCodexSandbox, type CodexSandboxProbeResult } from './codex-sandbox-probe'
import { agentPolicyVerdict, comparablePath, isInsidePath } from './policy'
import { AgentProgramError } from './program-problem'
import type {
  AgentAction,
  AgentCodexWebSearch,
  AgentMcpRelay,
  AgentPermissionAnswer,
  AgentPermissionMode,
  AgentSession,
  AgentSessionEvent,
  AgentSessionOptions,
} from './types'

const PROVIDER = 'codex'

/** Codex's sandbox could not start on this PC (a Windows without MXC, a policy against it) */
export class AgentSandboxUnavailableError extends Error {
  readonly kind = 'sandbox-unavailable'
  constructor() {
    super('Codex sandbox (MXC) is not available on this PC; nothing was run')
    this.name = 'AgentSandboxUnavailableError'
  }
}
export const CODEX_AGENT_PROFILE = 'ieumoffice-agent'
const REQUEST_TIMEOUT_MS = 30_000
/**
 * Opening the thread applies the permission profile, and Codex's Windows sandbox
 * sets file permissions on every folder the profile names; a folder of many
 * thousand files takes minutes the first time.
 */
export const THREAD_START_TIMEOUT_MS = 5 * 60_000
const DIAGNOSTIC_LIMIT = 4_000
const DEFAULT_IDLE_MS = 30 * 60_000
const MAX_MCP_STATUS_PAGES = 10

/**
 * The brain-only overrides. Skill instructions stay off
 * (`skills.include_instructions=false`): Codex would list the skills of its
 * own folders, whatever the person turned off; the app lists the enabled ones
 * in the instructions instead. Web search is the person's choice for the
 * project folder (the Codex app's default is cached results), given after the
 * inherited overrides: the chat window's "off" is left out, and a later `-c`
 * of the same key wins anyway (checked 2026-10-21, codex-cli 0.159.2).
 */
export function codexAgentLaunchArgs(webSearch: AgentCodexWebSearch = 'cached'): string[] {
  const overrides = CODEX_CONFIG_OVERRIDES.filter((override) => !override.startsWith('web_search='))
  return [
    'app-server',
    ...overrides.flatMap((override) => ['-c', override]),
    '-c',
    `web_search="${codexWebSearchValue(webSearch)}"`,
    // Windows: the MXC sandbox, explicitly. It honours denied paths at once and
    // fails when unavailable, so a session never falls back to a sandbox that
    // cannot keep commands out of the sign-in folder (the elevated one needs
    // whole-disk reads and minutes to deny a large folder). Other systems ignore it.
    '-c',
    'windows.sandbox="mxc"',
    '--listen',
    'stdio://',
  ]
}

/** A known web search value; anything else is the default */
function codexWebSearchValue(value: unknown): AgentCodexWebSearch {
  return value === 'live' || value === 'disabled' ? value : 'cached'
}

/**
 * Codex's approval policy for the person's choice. `untrusted` brings every
 * command but known-safe reads to the app, which asks the person or decides by
 * its own rules; `never` does not ask, and what the sandbox does not allow
 * simply fails. `on-request` is never used: there, an approved command runs
 * outside the sandbox (checked 2026-10-15, codex-cli 0.159.2: an approved write
 * to Documents landed under `on-request` and was refused under `untrusted`).
 */
export function codexAgentApprovalPolicy(mode: AgentPermissionMode): 'untrusted' | 'never' {
  switch (mode) {
    case 'ask-commands':
    case 'ask-writes':
      return 'untrusted'
    case 'trust-project':
      return 'never'
  }
}

/**
 * The session's file-system rules: the platform's minimal set and the folders a
 * command needs (the project, to write; the runtimes on PATH and the session's
 * skill copy, to read), the open documents read-only, and the protected
 * folders denied. Everything else of the person's disk is out of reach.
 * Checked on this PC (MXC sandbox,
 * 2026-10-15): the Codex sign-in folder, Documents and the network were
 * refused, the project was writable, node and python ran.
 */
export function codexAgentFilesystem(
  options: Pick<
    AgentSessionOptions,
    'projectRoot' | 'openDocuments' | 'protectedPaths' | 'skillBundleDir'
  >,
  readableDirs: readonly string[] = [],
): Record<string, 'read' | 'write' | 'deny'> {
  const filesystem: Record<string, 'read' | 'write' | 'deny'> = { ':minimal': 'read' }
  for (const dir of readableDirs) filesystem[dir] = 'read'
  if (options.skillBundleDir) filesystem[options.skillBundleDir] = 'read'
  filesystem[options.projectRoot] = 'write'
  for (const path of options.openDocuments) filesystem[path] = 'read'
  for (const path of options.protectedPaths) filesystem[path] = 'deny'
  return filesystem
}

/**
 * Characters Codex reads as a glob in a permission profile path. A read or
 * write entry with one is refused, and a deny entry with one does not keep the
 * named folder out (checked 2026-11-07, codex-cli 0.166.0 under `codex
 * sandbox`; the 0.163.0 source reads them the same way).
 */
const CODEX_PROFILE_GLOB = /[*?[\]]/

export function codexProfilePathsLiteral(
  filesystem: Record<string, 'read' | 'write' | 'deny'>,
): boolean {
  return Object.keys(filesystem).every(
    (path) => path === ':minimal' || !CODEX_PROFILE_GLOB.test(path),
  )
}

/**
 * The folders on PATH a command may read, so scripts can find their runtime
 * (python, node, …): absolute, existing folders that are not a drive root and
 * not inside a protected folder or the project.
 */
export function codexAgentReadableDirs(
  pathValue: string | undefined,
  options: Pick<AgentSessionOptions, 'projectRoot' | 'protectedPaths'>,
  platform: NodeJS.Platform = process.platform,
  exists: (dir: string) => boolean = (dir) => {
    try {
      return statSync(dir).isDirectory()
    } catch {
      return false
    }
  },
): string[] {
  const api = platform === 'win32' ? win32 : posix
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of (pathValue ?? '').split(platform === 'win32' ? ';' : ':')) {
    const dir = raw.trim().replace(/^"|"$/g, '')
    if (!dir || !api.isAbsolute(dir) || CODEX_PROFILE_GLOB.test(dir)) continue
    const key = comparablePath(dir, dir, platform)
    if (seen.has(key) || api.parse(key).root === key) continue
    if (
      options.protectedPaths.some((guard) =>
        isInsidePath(key, comparablePath(guard, guard, platform), platform),
      )
    )
      continue
    if (
      isInsidePath(
        key,
        comparablePath(options.projectRoot, options.projectRoot, platform),
        platform,
      )
    )
      continue
    if (!exists(dir)) continue
    seen.add(key)
    out.push(dir)
  }
  return out
}

/**
 * The session's permission profile: the file-system rules, and the network
 * opened only when the person turned commands' internet access on for the
 * project folder (no list of sites, as in the Codex app). Checked on this PC
 * (MXC, 2026-10-21): with `network.enabled = true` a command reached the
 * internet and a denied folder stayed unreadable; without it, no internet.
 */
function codexAgentProfile(
  options: AgentSessionOptions & { network?: boolean | undefined },
  readableDirs: readonly string[],
): Record<string, unknown> {
  const filesystem = codexAgentFilesystem(options, readableDirs)
  return options.network === true ? { filesystem, network: { enabled: true } } : { filesystem }
}

export function codexAgentThreadParams(
  options: AgentSessionOptions & { network?: boolean | undefined },
  model: string,
  userMcpServers: Record<string, { enabled: false }>,
  readableDirs: readonly string[] = [],
): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = { ...userMcpServers }
  // a relay replaces the person's Codex server of the same name: the relay is what the session
  // gets, and the app asks before a call when the tool's permission says so (user MCP spec 9)
  for (const relay of agentUsableRelays(options.userMcpRelays)) {
    mcpServers[relay.name] = {
      url: relay.url,
      http_headers: { Authorization: `Bearer ${relay.token}` },
      default_tools_approval_mode: 'approve',
    }
  }
  if (options.appMcp) {
    mcpServers[APP_MCP_SERVER_NAME] = {
      url: options.appMcp.url,
      http_headers: { Authorization: `Bearer ${options.appMcp.token}` },
      // the app's own tools, which keep their own limits: without this, Codex asks before each
      // call, and under the `never` policy ("trust this project") refuses them unasked
      default_tools_approval_mode: 'approve',
    }
  }
  return {
    model,
    cwd: options.projectRoot,
    approvalPolicy: codexAgentApprovalPolicy(options.mode),
    serviceName: CODEX_AGENT_PROFILE,
    developerInstructions: options.instructions,
    ephemeral: true,
    config: {
      default_permissions: CODEX_AGENT_PROFILE,
      permissions: { [CODEX_AGENT_PROFILE]: codexAgentProfile(options, readableDirs) },
      mcp_servers: mcpServers,
    },
  }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

/**
 * Codex's own reading of a command (`commandActions`): the command without the
 * shell it is wrapped in and without doubled backslashes. Best effort, so only
 * shown, never judged.
 */
function commandSummary(source: Record<string, unknown>): string | undefined {
  const actions = Array.isArray(source.commandActions) ? source.commandActions : []
  const commands = actions.flatMap((action) =>
    isPlainObject(action) && text(action.command) ? [action.command as string] : [],
  )
  return commands.length > 0 ? commands.join('; ') : undefined
}

/** What a Codex approval request asks for, in the policy's terms */
export function codexAgentAction(
  method: string,
  params: Record<string, unknown>,
  fileChangePaths: ReadonlyMap<string, string[]>,
): AgentAction {
  if (method === 'item/commandExecution/requestApproval') {
    return {
      kind: 'command',
      tool: 'commandExecution',
      command: text(params.command) ?? '',
      summary: commandSummary(params),
      cwd: text(params.cwd),
      paths: [],
      reason: text(params.reason),
    }
  }
  if (method === 'item/fileChange/requestApproval') {
    const itemId = text(params.itemId) ?? ''
    const grantRoot = text(params.grantRoot)
    return {
      kind: 'write',
      tool: 'fileChange',
      paths: [...(fileChangePaths.get(itemId) ?? []), ...(grantRoot ? [grantRoot] : [])],
      reason: text(params.reason),
    }
  }
  return { kind: 'other', tool: method, paths: [], reason: text(params.reason) }
}

/**
 * The refusal an approval request accepts: `decline` lets the turn go on, but a
 * request may offer only `cancel`, which ends the turn.
 */
export function codexDeclineDecision(params: Record<string, unknown>): 'decline' | 'cancel' {
  const offered = params.availableDecisions
  return !Array.isArray(offered) || offered.includes('decline') ? 'decline' : 'cancel'
}

/**
 * The tools Codex lists in one page of `mcpServerStatus/list` that the session
 * was not meant to get: of the app's own server (spec 6.6), and of each relay
 * (user MCP spec 9) beyond the tools it listed at the start. Other servers are
 * the attachment check's; a tool listed under a qualified name counts by its
 * bare name.
 */
export function codexAppMcpExtraTools(
  statusList: unknown,
  relays: readonly AgentMcpRelay[] = [],
): string[] {
  const data = isPlainObject(statusList) ? statusList.data : undefined
  if (!Array.isArray(data)) return []
  const relayByName = new Map(agentUsableRelays(relays).map((relay) => [relay.name, relay]))
  const extra: string[] = []
  for (const entry of data) {
    if (!isPlainObject(entry)) continue
    const tools = Object.keys(isPlainObject(entry.tools) ? entry.tools : {})
    if (entry.name === APP_MCP_SERVER_NAME) {
      for (const name of tools) if (!isAgentAppMcpTool(name)) extra.push(name)
      continue
    }
    const relay = typeof entry.name === 'string' ? relayByName.get(entry.name) : undefined
    if (!relay) continue
    const prefix = `mcp__${relay.name}__`
    for (const name of tools) {
      const bare = name.startsWith(prefix) ? name.slice(prefix.length) : name
      if (!relay.tools.includes(bare)) extra.push(name)
    }
  }
  return extra
}

/**
 * The answer to an MCP elicitation. Codex asks this way before each MCP tool
 * call; only the app's own server and the session's relays are attached, and
 * their tools are the app's to allow (a relay asks the person itself when the
 * tool's permission says so). Anything else (a form a server wants filled, a
 * link to open) is declined.
 */
export function codexElicitationAnswer(
  params: Record<string, unknown>,
  relays: readonly AgentMcpRelay[] = [],
): {
  action: 'accept' | 'decline'
  content: Record<string, never> | null
  _meta: null
} {
  const meta = isPlainObject(params._meta) ? params._meta : {}
  const appServer =
    params.serverName === APP_MCP_SERVER_NAME ||
    agentUsableRelays(relays).some((relay) => relay.name === params.serverName)
  const toolApproval =
    appServer && params.mode === 'form' && meta.codex_approval_kind === 'mcp_tool_call'
  return toolApproval
    ? { action: 'accept', content: {}, _meta: null }
    : { action: 'decline', content: null, _meta: null }
}

function itemAction(item: Record<string, unknown>): AgentAction | undefined {
  if (item.type === 'commandExecution') {
    return {
      kind: 'command',
      tool: 'commandExecution',
      command: text(item.command) ?? '',
      summary: commandSummary(item),
      cwd: text(item.cwd),
      paths: [],
    }
  }
  if (item.type === 'fileChange') {
    const changes = Array.isArray(item.changes) ? item.changes : []
    const paths = changes.flatMap((change) =>
      isPlainObject(change) && text(change.path) ? [change.path as string] : [],
    )
    return { kind: 'write', tool: 'fileChange', paths }
  }
  if (item.type === 'webSearch') {
    return { kind: 'web-search', tool: 'webSearch', target: text(item.query), paths: [] }
  }
  if (item.type === 'mcpToolCall') {
    return {
      kind: 'app-tool',
      tool: `${text(item.server) ?? ''}:${text(item.tool) ?? ''}`,
      paths: [],
    }
  }
  return undefined
}

function itemStatus(item: Record<string, unknown>): 'done' | 'failed' | 'denied' {
  const status = text(item.status)
  if (status === 'declined') return 'denied'
  if (status === 'failed') return 'failed'
  return 'done'
}

export interface CodexAgentDeps {
  resolveProgram?:
    ((configuredPath: string | undefined) => Promise<SubscriptionProgram>) | undefined
  spawn?: SubscriptionSpawn | undefined
  registry?: SubscriptionChildRegistry | null | undefined
  baseEnv?: NodeJS.ProcessEnv | undefined
  killTree?: ((child: { readonly pid?: number | undefined }) => void) | undefined
  idleMs?: number | undefined
  platform?: NodeJS.Platform | undefined
  threadStartTimeoutMs?: number | undefined
  /** the check that Codex's sandbox starts and denies (Windows); see `codex-sandbox-probe.ts` */
  probeSandbox?:
    | ((
        filesystem: Record<string, 'read' | 'write' | 'deny'>,
        probeDir: string,
        network: boolean,
      ) => Promise<CodexSandboxProbeResult>)
    | undefined
}

export interface CodexAgentSessionOptions extends AgentSessionOptions {
  /** the person accepted a metered login for Codex (settings and the acceptance record agree) */
  meteredAccepted: boolean
  /** Codex's own web search, as chosen for the project folder; cached results when absent */
  webSearch?: AgentCodexWebSearch | undefined
  /** commands may reach the internet (chosen for the project folder); off when absent */
  network?: boolean | undefined
}

export async function startCodexAgentSession(
  options: CodexAgentSessionOptions,
  onEvent: (event: AgentSessionEvent) => void,
  deps: CodexAgentDeps = {},
): Promise<AgentSession> {
  const platform = deps.platform ?? process.platform
  const network = options.network === true
  const relays = agentUsableRelays(options.userMcpRelays)
  /** the MCP servers the thread may start: the app's own and the session's relays */
  const givenServers = new Set([APP_MCP_SERVER_NAME, ...relays.map((relay) => relay.name)])
  const program = await (
    deps.resolveProgram ??
    ((configuredPath) => resolveSubscriptionProgram(PROVIDER, { configuredPath }))
  )(options.cliPath)
  const readableDirs = codexAgentReadableDirs(
    (deps.baseEnv ?? process.env).PATH ?? (deps.baseEnv ?? process.env).Path,
    options,
    platform,
  )
  if (!codexProfilePathsLiteral(codexAgentFilesystem(options, readableDirs))) {
    throw new AgentProgramError(
      { type: 'unsupported-path' },
      'A path of the session has a character Codex reads as a pattern; nothing was run',
    )
  }
  if (platform === 'win32') {
    const probe =
      deps.probeSandbox ??
      ((filesystem, probeDir, withNetwork) =>
        probeCodexSandbox(program, filesystem, probeDir, {
          spawn: deps.spawn,
          registry: deps.registry,
          baseEnv: deps.baseEnv,
          killTree: deps.killTree,
          network: withNetwork,
        }))
    // the profile as the session uses it, network included: a sandbox that cannot start with
    // the network on does not start the session (it is not run with the network off instead)
    const result = await probe(
      codexAgentFilesystem(options, readableDirs),
      join(options.sessionDir, 'sandbox-probe'),
      network,
    )
    if (result === 'unavailable') throw new AgentSandboxUnavailableError()
    if (result === 'not-contained') {
      throw new AiRunError(
        'unsafe-tools',
        'Codex sandbox did not keep a denied folder out of reach; nothing was run',
        { provider: PROVIDER },
      )
    }
  }
  let child: ChildProcessWithoutNullStreams
  try {
    // the session folder as working directory: no project configuration of wherever the app
    // was started applies to the process; the thread's own folder is given per thread
    child = spawnSubscriptionProgram(program, codexAgentLaunchArgs(options.webSearch), {
      cwd: options.sessionDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      baseEnv: deps.baseEnv,
      spawn: deps.spawn,
      registry: deps.registry,
      platform,
    }) as ChildProcessWithoutNullStreams
  } catch (error) {
    throw (error as NodeJS.ErrnoException)?.code === 'ENOENT'
      ? new AiRunError('not-installed', 'Codex CLI was not found', { provider: PROVIDER })
      : error
  }
  const killTree = deps.killTree ?? ((target) => killProcessTree(target, { force: true }))

  let openDocuments = [...options.openDocuments]
  let ended = false
  let stopping = false
  let threadId = ''
  let turnId = ''
  // the configured level when the model takes it; every turn names it, the default otherwise
  let effort: AiEffort | undefined
  let busy = false
  let stderr = ''
  let nextId = 1
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let reportedError: unknown
  const rpcPending = new Map<
    number,
    {
      method: string
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  /** approval requests waiting for the person, by the id shown to them */
  const pending = new Map<string, { rpcId: number | string; declineAs: string }>()
  const fileChangePaths = new Map<string, string[]>()

  const emit = (event: AgentSessionEvent): void => {
    if (!ended) onEvent(event)
  }
  const writeLine = (message: unknown): void => {
    if (!ended && child.stdin.writable) child.stdin.write(`${JSON.stringify(message)}\n`)
  }
  const end = (error?: Error): void => {
    if (ended) return
    if (error) {
      onEvent({
        type: 'error',
        kind: error instanceof AiRunError ? error.kind : undefined,
        message: error.message,
      })
    }
    ended = true
    clearTimeout(idleTimer)
    for (const request of rpcPending.values()) {
      clearTimeout(request.timer)
      request.reject(error ?? new Error('The agent session has ended'))
    }
    rpcPending.clear()
    pending.clear()
    onEvent({ type: 'ended' })
  }
  const stopNow = (error?: Error): void => {
    stopping = true
    killTree(child)
    end(error)
  }
  const armIdle = (): void => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => stopNow(), deps.idleMs ?? DEFAULT_IDLE_MS)
    idleTimer.unref?.()
  }
  const request = (
    method: string,
    params: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (ended) {
        reject(new Error('The agent session has ended'))
        return
      }
      const id = nextId++
      const timer = setTimeout(() => {
        rpcPending.delete(id)
        reject(
          new AgentProgramError(
            { type: 'no-answer', step: method },
            `Codex app-server request timed out: ${method}`,
          ),
        )
      }, timeoutMs)
      timer.unref?.()
      rpcPending.set(id, { method, resolve, reject, timer })
      writeLine({ method, id, params })
    })

  const answerApproval = (rpcId: number | string, accept: boolean, declineAs: string): void => {
    writeLine({ id: rpcId, result: { decision: accept ? 'accept' : declineAs } })
  }

  const onServerRequest = (message: Record<string, unknown>): void => {
    const rpcId = message.id as number | string
    const method = message.method as string
    const params = isPlainObject(message.params) ? message.params : {}
    if (
      method === 'item/commandExecution/requestApproval' ||
      method === 'item/fileChange/requestApproval'
    ) {
      const action = codexAgentAction(method, params, fileChangePaths)
      const declineAs = codexDeclineDecision(params)
      const verdict = agentPolicyVerdict(action, {
        mode: options.mode,
        projectRoot: options.projectRoot,
        openDocuments,
        protectedPaths: options.protectedPaths,
        skillBundleDir: options.skillBundleDir,
        platform,
      })
      if (verdict.decision === 'allow') {
        answerApproval(rpcId, true, declineAs)
        return
      }
      if (verdict.decision === 'deny') {
        // Codex reports the declined item itself, which the panel shows as denied
        answerApproval(rpcId, false, declineAs)
        return
      }
      const id = randomUUID()
      pending.set(id, { rpcId, declineAs })
      emit({ type: 'permission', request: { ...action, id, provider: PROVIDER } })
      return
    }
    if (method === 'mcpServer/elicitation/request') {
      writeLine({ id: rpcId, result: codexElicitationAnswer(params, relays) })
      return
    }
    // anything else (more permissions, questions, attestation, sign-in tokens) is not the
    // app's to grant: refuse it instead of leaving Codex waiting
    writeLine({
      id: rpcId,
      error: { code: -32601, message: `Unsupported server request: ${method}` },
    })
  }

  const onNotification = (method: string, params: Record<string, unknown>): void => {
    switch (method) {
      case 'mcpServer/startupStatus/updated': {
        const name = text(params.name)
        const status = text(params.status)
        if ((status === 'starting' || status === 'ready') && !givenServers.has(name ?? '')) {
          stopNow(
            new AiRunError('unsafe-tools', 'Codex started an MCP server that was switched off'),
          )
        }
        return
      }
      case 'item/started': {
        const item = isPlainObject(params.item) ? params.item : undefined
        if (!item) return
        const action = itemAction(item)
        if (item.type === 'fileChange' && typeof item.id === 'string' && action) {
          fileChangePaths.set(item.id, action.paths)
        }
        if (action) emit({ type: 'tool', action, status: 'running' })
        return
      }
      case 'item/completed': {
        const item = isPlainObject(params.item) ? params.item : undefined
        if (!item) return
        if (item.type === 'agentMessage' && typeof item.text === 'string' && item.text.trim()) {
          emit({ type: 'text', text: item.text })
          return
        }
        const action = itemAction(item)
        if (action) emit({ type: 'tool', action, status: itemStatus(item) })
        if (typeof item.id === 'string') fileChangePaths.delete(item.id)
        return
      }
      case 'turn/started': {
        const turn = isPlainObject(params.turn) ? params.turn : undefined
        if (typeof turn?.id === 'string') turnId = turn.id
        return
      }
      case 'turn/completed': {
        busy = false
        turnId = ''
        armIdle()
        const turn = isPlainObject(params.turn) ? params.turn : undefined
        if (turn?.status === 'failed') {
          const error = codexRunError(turn.error ?? reportedError)
          reportedError = undefined
          emit({ type: 'turn-done', ok: false })
          emit({
            type: 'error',
            kind: error instanceof AiRunError ? error.kind : undefined,
            message: error.message,
          })
          return
        }
        reportedError = undefined
        emit({ type: 'turn-done', ok: turn?.status !== 'interrupted' })
        return
      }
      case 'error':
        // a retried stream is still live; a warning arrives the same way, so only the turn's
        // own outcome decides
        if (params.willRetry !== true)
          reportedError = isPlainObject(params.error) ? params.error : params
        return
    }
  }

  const onLine = (line: string): void => {
    let message: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(line)
      if (!isPlainObject(parsed)) return
      message = parsed
    } catch {
      return
    }
    if (typeof message.method === 'string' && message.id !== undefined) {
      onServerRequest(message)
      return
    }
    if (typeof message.id === 'number') {
      const waiting = rpcPending.get(message.id)
      if (!waiting) return
      clearTimeout(waiting.timer)
      rpcPending.delete(message.id)
      if (message.error !== undefined) {
        const error = isPlainObject(message.error) ? message.error : {}
        const detail = typeof error.message === 'string' ? error.message : 'error'
        waiting.reject(
          new AgentProgramError(
            {
              type: 'refused',
              step: waiting.method,
              code: Number.isInteger(error.code) ? (error.code as number) : undefined,
            },
            `Codex app-server: ${detail}`,
          ),
        )
      } else waiting.resolve(message.result)
      return
    }
    if (typeof message.method === 'string') {
      onNotification(message.method, isPlainObject(message.params) ? message.params : {})
    }
  }

  attachBoundedRpcStdout({ stdout: child.stdout, kill: () => killTree(child) }, onLine, (error) =>
    stopNow(error),
  )
  child.stdin.on('error', () => undefined)
  child.stderr.on('data', (chunk: Buffer) => {
    const next = stderr + chunk.toString()
    stderr = next.length <= DIAGNOSTIC_LIMIT ? next : next.slice(-DIAGNOSTIC_LIMIT)
  })
  child.once('error', (error) =>
    end(
      (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? new AiRunError('not-installed', 'Codex CLI was not found', { provider: PROVIDER })
        : error,
    ),
  )
  child.once('close', (code: number | null) => {
    const detail = stderr.trim()
    end(
      stopping
        ? undefined
        : new AgentProgramError(
            { type: 'exited', exitCode: code ?? undefined },
            `Codex app-server exited (${code ?? 'unknown'})${detail ? `: ${detail}` : ''}`,
          ),
    )
  })

  try {
    await request('initialize', {
      clientInfo: { name: CODEX_AGENT_PROFILE, title: 'Agent session', version: '0.1.0' },
      capabilities: { experimentalApi: false, requestAttestation: false },
    })
    writeLine({ method: 'initialized' })

    const login = codexAccountInfo(await request('account/read', { refreshToken: false }))
    if (!login || !login.signedIn) {
      throw new AiRunError('signed-out', 'Codex is not signed in', { provider: PROVIDER })
    }
    if (login.loginMethod !== 'subscription' && !options.meteredAccepted) {
      throw new AiRunError(
        'metered-not-accepted',
        'Codex is signed in with a login that is billed by usage, which has not been accepted',
        { provider: PROVIDER },
      )
    }

    let userMcpServers: Record<string, { enabled: false }>
    try {
      userMcpServers = codexMcpServerOverrides(
        await request('config/read', { includeLayers: false, cwd: options.projectRoot }),
      )
    } catch {
      throw new AiRunError('unsafe-tools', 'Codex could not report its configured MCP servers')
    }
    delete (userMcpServers as Record<string, unknown>)[APP_MCP_SERVER_NAME]
    for (const relay of relays) delete (userMcpServers as Record<string, unknown>)[relay.name]

    // read once when it is needed for the default model, and again only for a level
    let listed: unknown
    const model =
      options.model.trim() || defaultModelOf((listed = await request('model/list', MODEL_LIST)))
    effort = await codexAgentEffort(request, model, options.effort, listed)
    const started = await request(
      'thread/start',
      codexAgentThreadParams(options, model, userMcpServers, readableDirs),
      deps.threadStartTimeoutMs ?? THREAD_START_TIMEOUT_MS,
    )
    if (
      activePermissionProfileId(started) !== CODEX_AGENT_PROFILE ||
      !isPlainObject(started) ||
      started.approvalPolicy !== codexAgentApprovalPolicy(options.mode)
    ) {
      throw new AiRunError(
        'unsafe-tools',
        'Codex did not apply the session permissions; nothing was run',
      )
    }
    // the network the thread reports, when it does: open while the person left it off is not run
    if (!network && codexThreadNetworkAccess(started) === true) {
      throw new AiRunError(
        'unsafe-tools',
        'Codex opened the network for commands, which was left off; nothing was run',
      )
    }
    const thread =
      isPlainObject(started) && isPlainObject(started.thread) ? started.thread : undefined
    threadId = typeof thread?.id === 'string' ? thread.id : ''
    if (!threadId) {
      throw new AgentProgramError(
        { type: 'refused', step: 'thread/start' },
        'Codex app-server did not return a thread id',
      )
    }

    let cursor: string | null = null
    const attached: string[] = []
    const extraTools: string[] = []
    for (let page = 0; page < MAX_MCP_STATUS_PAGES; page++) {
      const result = await request('mcpServerStatus/list', {
        threadId,
        detail: 'toolsAndAuthOnly',
        cursor,
        limit: 100,
      })
      attached.push(...codexAttachedMcpServers(result))
      extraTools.push(...codexAppMcpExtraTools(result, relays))
      const next = isPlainObject(result) ? result.nextCursor : undefined
      cursor = typeof next === 'string' && next ? next : null
      if (!cursor) break
    }
    if (cursor !== null || attached.some((name) => !givenServers.has(name))) {
      throw new AiRunError('unsafe-tools', 'Codex attached an MCP server the app did not give it')
    }
    if (extraTools.length > 0) {
      throw new AiRunError(
        'unsafe-tools',
        `Codex listed tools of the app's servers the app did not give it: ${extraTools.length}`,
      )
    }
    emit({ type: 'started', provider: PROVIDER, model, skills: [] })
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error))
    stopNow()
    throw failure
  }
  armIdle()

  return {
    provider: PROVIDER,
    async send(message: string): Promise<void> {
      if (ended) throw new Error('The agent session has ended')
      if (busy) throw new Error('The agent is still answering the previous message')
      busy = true
      clearTimeout(idleTimer)
      try {
        await request('turn/start', {
          threadId,
          input: [{ type: 'text', text: message, text_elements: [] }],
          ...(effort ? { effort } : {}),
        })
      } catch (error) {
        busy = false
        armIdle()
        throw error
      }
    },
    answer(id: string, answer: AgentPermissionAnswer): void {
      const waiting = pending.get(id)
      if (!waiting) return
      pending.delete(id)
      answerApproval(waiting.rpcId, answer.allow, waiting.declineAs)
    },
    setOpenDocuments(paths: string[]): void {
      openDocuments = [...paths]
    },
    stop(): void {
      if (ended) return
      if (threadId && turnId)
        writeLine({ method: 'turn/interrupt', id: nextId++, params: { threadId, turnId } })
      stopNow()
    },
  }
}

/** Whether the thread's sandbox lets commands reach the network, as `thread/start` reports it */
function codexThreadNetworkAccess(started: unknown): boolean | undefined {
  const sandbox = isPlainObject(started) && isPlainObject(started.sandbox) ? started.sandbox : {}
  return typeof sandbox.networkAccess === 'boolean' ? sandbox.networkAccess : undefined
}

/**
 * The configured effort when Codex lists it for the model. The list is read
 * only when a level is configured, and one that cannot be read leaves the
 * level out rather than failing the session.
 */
async function codexAgentEffort(
  request: (method: string, params: unknown) => Promise<unknown>,
  model: string,
  configured: string | undefined,
  listed: unknown,
): Promise<AiEffort | undefined> {
  if (!configured?.trim()) return undefined
  try {
    return codexListedEffort(listed ?? (await request('model/list', MODEL_LIST)), model, configured)
  } catch {
    return undefined
  }
}

const MODEL_LIST = { cursor: null, limit: 100, includeHidden: false }

function defaultModelOf(result: unknown): string {
  const data = isPlainObject(result) && Array.isArray(result.data) ? result.data : []
  let first = ''
  for (const value of data) {
    if (!isPlainObject(value) || value.hidden === true) continue
    const id = text(value.id) ?? text(value.model) ?? ''
    if (!id) continue
    if (value.isDefault === true) return id
    first ||= id
  }
  if (!first) {
    throw new AgentProgramError(
      { type: 'no-model' },
      'Codex listed no model, so there is no default model to run with',
    )
  }
  return first
}
