/**
 * Agent mode on Claude Code (decision 0032): the CLI runs with its own file,
 * command, skill and web tools in the project folder, and asks the app before it
 * acts. One process serves the whole conversation; each message the person
 * sends is one turn over stdin.
 *
 * What stays from the brain-only bridge: the CLI is started by its real file
 * with no shell, a sanitised environment and fixed flags; user settings, hooks,
 * plugins and MCP servers stay out (`--restricted`, `--setting-sources ""`,
 * `--strict-mcp-config`); the tool list it reports is checked rather than the
 * flags trusted; and stopping ends the whole process tree. Paths and the MCP
 * token travel in files of the session folder, not on the command line.
 */
import type { ChildProcess } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join, posix, win32 } from 'node:path'
import {
  MODEL_NAME,
  claudeCodeEffort,
  exitFailure,
  readLines,
  reportedFailure,
  startFailure,
} from '../claude-code-cli'
import { isPlainObject } from '../protocols/shared'
import { AiRunError } from '../run-error'
import { resolveSubscriptionProgram, type SubscriptionProgram } from '../subscription/locate'
import {
  killProcessTree,
  spawnSubscriptionProgram,
  type SubscriptionChildRegistry,
  type SubscriptionSpawn,
} from '../subscription/process'
import { agentPolicyVerdict, webHostOf } from './policy'
import { DECLINED_BY_PERSON, denyMessage } from './messages'
import type {
  AgentAction,
  AgentMcpRelay,
  AgentPermissionAnswer,
  AgentPermissionMode,
  AgentSession,
  AgentSessionAllowances,
  AgentSessionEvent,
  AgentSessionOptions,
} from './types'

const PROVIDER = 'claude-code'

/** The CLI's own tools the session turns on; everything else stays off */
export const CLAUDE_AGENT_TOOLS = [
  'Read',
  'Edit',
  'Write',
  'Glob',
  'Grep',
  'Bash',
  'PowerShell',
  'Skill',
  // the web, as in the program's own app: each asks the person first (see the policy)
  'WebSearch',
  'WebFetch',
] as const

/** Name of the app's MCP server for open documents, as the programs see it */
export const APP_MCP_SERVER_NAME = 'ieumoffice-editor'

/**
 * The tools of the app's MCP server an agent session gets (spec 6.6): the
 * open-document tools, the two file readers and the two skill proposals. The
 * start checks of both programs end a session that reports any other tool of
 * that server.
 */
export const AGENT_APP_MCP_TOOLS = [
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
] as const

const APP_MCP_TOOL_SET: ReadonlySet<string> = new Set(AGENT_APP_MCP_TOOLS)

/** A tool name of the app's server, bare or as a program prefixes it, is one the session gets */
export function isAgentAppMcpTool(name: string): boolean {
  const prefix = `mcp__${APP_MCP_SERVER_NAME}__`
  return APP_MCP_TOOL_SET.has(name.startsWith(prefix) ? name.slice(prefix.length) : name)
}

/**
 * A relay name both programs can carry in a tool name: the user MCP
 * server-name shape (letters, digits, `-`, `_`; no `__`, no `_` at an edge)
 */
const RELAY_NAME = /^(?!_)(?!.*__)[A-Za-z0-9_-]+(?<!_)$/

/**
 * The relays a session can use (user MCP spec 9): each with a name of the
 * server-name shape that is not the app's own server, once. The start checks,
 * the MCP configuration and the permission rules all read this one list, so a
 * relay the app did not open can never pass a check.
 */
export function agentUsableRelays(
  relays: readonly AgentMcpRelay[] | undefined,
): readonly AgentMcpRelay[] {
  const seen = new Set<string>([APP_MCP_SERVER_NAME.toLowerCase()])
  const out: AgentMcpRelay[] = []
  for (const relay of relays ?? []) {
    const key = relay.name.toLowerCase()
    if (!RELAY_NAME.test(relay.name) || seen.has(key)) continue
    seen.add(key)
    out.push(relay)
  }
  return out
}

/** The relay a program-side tool name `mcp__<relay>__<tool>` belongs to, with the bare tool */
export function agentRelayToolOf(
  name: string,
  relays: readonly AgentMcpRelay[] | undefined,
): { relay: AgentMcpRelay; tool: string } | undefined {
  for (const relay of agentUsableRelays(relays)) {
    const prefix = `mcp__${relay.name}__`
    if (name.startsWith(prefix)) return { relay, tool: name.slice(prefix.length) }
  }
  return undefined
}

const SETTINGS_FILE = 'claude-settings.json'
const MCP_CONFIG_FILE = 'claude-mcp.json'
const INITIALIZE_REQUEST_ID = 'initialize'
const DIAGNOSTIC_LIMIT = 4_000
/** a conversation left alone this long is ended */
const DEFAULT_IDLE_MS = 30 * 60_000
const INITIALIZE_TIMEOUT_MS = 30_000

/**
 * The CLI's permission mode for the person's choice. The first two run in the
 * CLI's manual mode so that every edit and command comes to the app, which
 * applies its own policy. Trusting the project runs in the CLI's `auto` mode:
 * Claude Code has no command sandbox on Windows, so "nothing asks" is left to
 * its own reviewer model rather than to an app that allows everything.
 */
export function claudeAgentPermissionMode(mode: AgentPermissionMode): 'default' | 'auto' {
  return mode === 'trust-project' ? 'auto' : 'default'
}

export interface ClaudeAgentLaunch {
  model: string
  /** a level of `CLAUDE_EFFORTS`; anything else is left out */
  effort?: string | undefined
  mode: AgentPermissionMode
  settingsFile: string
  mcpConfigFile?: string | undefined
  skillBundleDir?: string | undefined
}

export function claudeAgentLaunchArgs(launch: ClaudeAgentLaunch): string[] {
  const model = launch.model.trim()
  if (model && !MODEL_NAME.test(model)) {
    throw new Error(`Invalid Claude Code model name: ${model.slice(0, 80)}`)
  }
  const effort = claudeCodeEffort(launch.effort)
  return [
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
    CLAUDE_AGENT_TOOLS.join(','),
    // both are needed for the CLI to send its permission prompts over stdout
    '--permission-prompts',
    'host',
    '--permission-prompt-tool',
    'stdio',
    '--permission-mode',
    claudeAgentPermissionMode(launch.mode),
    '--settings',
    launch.settingsFile,
    ...(launch.mcpConfigFile ? ['--mcp-config', launch.mcpConfigFile] : []),
    // a skill's scripts live in the copy, which must count as a working folder to run
    ...(launch.skillBundleDir
      ? ['--plugin-dir', launch.skillBundleDir, '--add-dir', launch.skillBundleDir]
      : []),
    '--no-session-persistence',
    ...(model ? ['--model', model] : []),
    ...(effort ? ['--effort', effort] : []),
  ]
}

/**
 * An absolute path in the CLI's permission-rule form: `//` and the POSIX path,
 * with a Windows drive written as its lowercase letter (`C:\a` → `//c/a`).
 * Undefined for a path a rule cannot carry (parentheses end the rule, glob
 * characters would widen it); such a path is still judged by the app's policy
 * whenever the CLI asks.
 */
export function claudeRulePath(
  path: string,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (/[()*?[\]{}]/.test(path)) return undefined
  if (platform === 'win32') {
    const normal = win32.normalize(path)
    const drive = /^([A-Za-z]):\\(.*)$/.exec(normal)
    if (!drive) return undefined
    const rest = drive[2]!.split('\\').filter(Boolean).join('/')
    return `//${drive[1]!.toLowerCase()}/${rest}`
  }
  const normal = posix.normalize(path)
  return normal.startsWith('/') ? `/${normal}` : undefined
}

/**
 * The settings the session adds on top of no settings at all. Reads outside
 * the working folders ask even in `auto` mode; protected folders cannot be
 * read or written; documents open in tabs cannot be written by the file tools.
 * In the manual modes the app judges every such request again; in `auto` mode
 * these rules are what keeps an open document from being overwritten, so they
 * are rebuilt from the open documents at the start.
 */
export function claudeAgentSettings(
  options: Pick<AgentSessionOptions, 'openDocuments' | 'protectedPaths'> &
    Partial<Pick<AgentSessionOptions, 'mode' | 'userMcpRelays'>>,
  platform: NodeJS.Platform = process.platform,
): Record<string, unknown> {
  const deny: string[] = []
  for (const path of options.protectedPaths) {
    const rule = claudeRulePath(path, platform)
    if (!rule) continue
    for (const tool of ['Read', 'Edit', 'Write'])
      deny.push(`${tool}(${rule})`, `${tool}(${rule}/**)`)
  }
  for (const path of options.openDocuments) {
    const rule = claudeRulePath(path, platform)
    if (!rule) continue
    deny.push(`Edit(${rule})`, `Write(${rule})`)
  }
  // In `auto` mode the CLI's own reviewer judges a call before it reaches the app; a relay asks
  // the person itself (user MCP spec 9), so its calls are let through to it rather than asked twice
  const relays = options.mode === 'trust-project' ? agentUsableRelays(options.userMcpRelays) : []
  const allow = relays.map((relay) => `mcp__${relay.name}`)
  return {
    permissions: {
      blockReadsOutsideWorkingDirectories: true,
      ...(allow.length > 0 ? { allow } : {}),
      deny,
    },
  }
}

/**
 * The session's MCP servers: the app's own, and a relay per person's server
 * (user MCP spec 9). Each entry holds a loopback address and a token of this
 * session only; the person's servers' own addresses and keys stay in the app.
 */
export function claudeAgentMcpConfig(
  appMcp: { url: string; token: string } | undefined,
  relays: readonly AgentMcpRelay[] = [],
): Record<string, unknown> {
  const entry = (server: { url: string; token: string }) => ({
    type: 'http',
    url: server.url,
    headers: { Authorization: `Bearer ${server.token}` },
  })
  const mcpServers: Record<string, unknown> = {}
  for (const relay of agentUsableRelays(relays)) mcpServers[relay.name] = entry(relay)
  if (appMcp) mcpServers[APP_MCP_SERVER_NAME] = entry(appMcp)
  return { mcpServers }
}

function stringField(input: unknown, ...names: string[]): string | undefined {
  if (!isPlainObject(input)) return undefined
  for (const name of names) {
    const value = input[name]
    if (typeof value === 'string' && value) return value
  }
  return undefined
}

/**
 * What a Claude Code tool call does, in the policy's terms. A tool of this
 * session's relays is an app tool: the relay asks the person when its
 * permission says so, and the program-level card would ask a second time.
 */
export function claudeAgentAction(
  tool: string,
  input: unknown,
  relays: readonly AgentMcpRelay[] = [],
): AgentAction {
  const reason = stringField(input, 'description')
  if (tool.startsWith(`mcp__${APP_MCP_SERVER_NAME}__`) || agentRelayToolOf(tool, relays)) {
    return { kind: 'app-tool', tool, paths: [] }
  }
  switch (tool) {
    case 'Read':
    case 'Glob':
    case 'Grep': {
      const path = stringField(input, 'file_path', 'path')
      return { kind: 'read', tool, paths: path ? [path] : [], reason }
    }
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
    case 'NotebookEdit': {
      const path = stringField(input, 'file_path', 'notebook_path')
      return { kind: 'write', tool, paths: path ? [path] : [], reason }
    }
    case 'Bash':
    case 'PowerShell':
      return {
        kind: 'command',
        tool,
        command: stringField(input, 'command') ?? '',
        paths: [],
        reason,
      }
    case 'Skill':
      return { kind: 'skill', tool, paths: [] }
    case 'WebSearch':
      return { kind: 'web-search', tool, target: stringField(input, 'query'), paths: [] }
    case 'WebFetch': {
      const url = stringField(input, 'url')
      return { kind: 'web-fetch', tool, target: url, host: webHostOf(url), paths: [] }
    }
    default:
      return { kind: 'other', tool, paths: [], reason }
  }
}

/**
 * The tool list and MCP servers the CLI reported are the ones the session
 * asked for: its fixed tools, the app server's tools, and this session's
 * relays (user MCP spec 9) with the tools each listed at the start. Anything
 * else, a relay's tool it did not list included, is a problem.
 */
export function claudeAgentInitProblem(
  init: Record<string, unknown>,
  relays: readonly AgentMcpRelay[] = [],
): string | undefined {
  const tools = init.tools
  if (!Array.isArray(tools)) return 'Claude Code did not report its tool list'
  const allowed = new Set<string>(CLAUDE_AGENT_TOOLS)
  const appPrefix = `mcp__${APP_MCP_SERVER_NAME}__`
  const relayTool = (tool: string): boolean => {
    const found = agentRelayToolOf(tool, relays)
    return found !== undefined && found.relay.tools.includes(found.tool)
  }
  // the app's own tools by name: a tool of its server the session was not meant to get is extra
  const extra = tools.filter(
    (tool) =>
      typeof tool !== 'string' ||
      (!allowed.has(tool) &&
        !(tool.startsWith(appPrefix) && isAgentAppMcpTool(tool)) &&
        !relayTool(tool)),
  )
  if (extra.length > 0)
    return `Claude Code started with tools the app did not turn on: ${extra.length}`
  const given = new Set([APP_MCP_SERVER_NAME, ...agentUsableRelays(relays).map((r) => r.name)])
  const servers = Array.isArray(init.mcp_servers) ? init.mcp_servers : []
  const foreign = servers.filter(
    (server) =>
      !isPlainObject(server) || typeof server.name !== 'string' || !given.has(server.name),
  )
  if (foreign.length > 0) return 'Claude Code started with an MCP server the app did not give it'
  return undefined
}

export interface ClaudeAgentDeps {
  resolveProgram?:
    ((configuredPath: string | undefined) => Promise<SubscriptionProgram>) | undefined
  spawn?: SubscriptionSpawn | undefined
  registry?: SubscriptionChildRegistry | null | undefined
  baseEnv?: NodeJS.ProcessEnv | undefined
  killTree?: ((child: { readonly pid?: number | undefined }) => void) | undefined
  writeFile?: ((path: string, data: string) => Promise<void>) | undefined
  idleMs?: number | undefined
  platform?: NodeJS.Platform | undefined
}

export async function startClaudeAgentSession(
  options: AgentSessionOptions,
  onEvent: (event: AgentSessionEvent) => void,
  deps: ClaudeAgentDeps = {},
): Promise<AgentSession> {
  const platform = deps.platform ?? process.platform
  const write = deps.writeFile ?? ((path: string, data: string) => writeFile(path, data, 'utf8'))
  const settingsFile = join(options.sessionDir, SETTINGS_FILE)
  const relays = agentUsableRelays(options.userMcpRelays)
  await write(settingsFile, JSON.stringify(claudeAgentSettings(options, platform)))
  let mcpConfigFile: string | undefined
  if (options.appMcp || relays.length > 0) {
    mcpConfigFile = join(options.sessionDir, MCP_CONFIG_FILE)
    await write(mcpConfigFile, JSON.stringify(claudeAgentMcpConfig(options.appMcp, relays)))
  }
  const args = claudeAgentLaunchArgs({
    model: options.model,
    effort: options.effort,
    mode: options.mode,
    settingsFile,
    mcpConfigFile,
    skillBundleDir: options.skillBundleDir,
  })
  const program = await (
    deps.resolveProgram ??
    ((configuredPath) => resolveSubscriptionProgram(PROVIDER, { configuredPath }))
  )(options.cliPath)

  let child: ChildProcess
  try {
    child = spawnSubscriptionProgram(program, args, {
      cwd: options.projectRoot,
      baseEnv: deps.baseEnv,
      spawn: deps.spawn,
      registry: deps.registry,
      platform,
    })
  } catch (error) {
    throw startFailure(error)
  }
  const killTree = deps.killTree ?? ((target) => killProcessTree(target, { force: true }))

  let openDocuments = [...options.openDocuments]
  let ended = false
  let stopping = false
  let verified = false
  let busy = false
  let stderr = ''
  let failureCode: string | undefined
  let failureText = ''
  let rateLimitInfo: Record<string, unknown> | undefined
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  /** permission prompts waiting for the person, by request id */
  const pending = new Map<
    string,
    { input: unknown; toolUseId: string | undefined; action: AgentAction }
  >()
  /** what the person allowed for the rest of this session; memory only, never written */
  const webHosts = new Set<string>()
  const allowances: AgentSessionAllowances = { webSearch: false, webHosts }
  /** tool uses by id, so their results can be shown against them */
  const toolUses = new Map<string, AgentAction>()
  const denied = new Set<string>()

  const emit = (event: AgentSessionEvent): void => {
    if (!ended) onEvent(event)
  }
  const send = (message: unknown): void => {
    if (child.stdin?.writable) child.stdin.write(`${JSON.stringify(message)}\n`)
  }
  const end = (error?: Error): void => {
    if (ended) return
    if (error) {
      emit({
        type: 'error',
        kind: error instanceof AiRunError ? error.kind : undefined,
        message: error.message,
      })
    }
    ended = true
    clearTimeout(idleTimer)
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

  let initialized: (ok: boolean, error?: Error) => void = () => undefined
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Claude Code did not accept the session setup in time')),
      INITIALIZE_TIMEOUT_MS,
    )
    timer.unref?.()
    initialized = (ok, error) => {
      clearTimeout(timer)
      if (ok) resolve()
      else reject(error ?? new Error('Claude Code did not accept the session setup'))
    }
  })

  const respond = (requestId: string, response: Record<string, unknown>): void => {
    send({
      type: 'control_response',
      response: { subtype: 'success', request_id: requestId, response },
    })
  }
  const allow = (requestId: string, input: unknown): void =>
    respond(requestId, { behavior: 'allow', updatedInput: isPlainObject(input) ? input : {} })
  const deny = (requestId: string, message: string): void =>
    respond(requestId, { behavior: 'deny', message })

  const onPermissionRequest = (requestId: string, request: Record<string, unknown>): void => {
    if (!verified) {
      stopNow(
        new AiRunError(
          'unsafe-tools',
          'Claude Code asked for a tool before it reported its tool list',
        ),
      )
      return
    }
    const tool = typeof request.tool_name === 'string' ? request.tool_name : ''
    const action = claudeAgentAction(tool, request.input, relays)
    if (typeof request.decision_reason === 'string' && !action.reason) {
      action.reason = request.decision_reason
    }
    const toolUseId = typeof request.tool_use_id === 'string' ? request.tool_use_id : undefined
    const verdict = agentPolicyVerdict(action, {
      mode: options.mode,
      projectRoot: options.projectRoot,
      openDocuments,
      protectedPaths: options.protectedPaths,
      skillBundleDir: options.skillBundleDir,
      allowances,
      platform,
    })
    if (verdict.decision === 'allow') {
      allow(requestId, request.input)
      return
    }
    if (verdict.decision === 'deny') {
      if (toolUseId) denied.add(toolUseId)
      deny(requestId, denyMessage(verdict.reason))
      return
    }
    pending.set(requestId, { input: request.input, toolUseId, action })
    if (toolUseId) toolUses.set(toolUseId, action)
    emit({ type: 'permission', request: { ...action, id: requestId, provider: PROVIDER } })
  }

  const onAssistant = (event: Record<string, unknown>): void => {
    const content = isPlainObject(event.message) ? event.message.content : undefined
    if (typeof event.error === 'string') {
      failureCode = event.error
      failureText = Array.isArray(content)
        ? content
            .map((block) =>
              isPlainObject(block) && typeof block.text === 'string' ? block.text : '',
            )
            .join('')
        : ''
      return
    }
    if (!verified) {
      stopNow(
        new AiRunError('unsafe-tools', 'Claude Code answered before it reported its tool list'),
      )
      return
    }
    if (!Array.isArray(content)) return
    for (const block of content) {
      if (!isPlainObject(block)) continue
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
        emit({ type: 'text', text: block.text })
      } else if (block.type === 'tool_use' && typeof block.name === 'string') {
        const action = claudeAgentAction(block.name, block.input, relays)
        if (typeof block.id === 'string') toolUses.set(block.id, action)
        emit({ type: 'tool', action, status: 'running' })
      }
    }
  }

  const onUser = (event: Record<string, unknown>): void => {
    const content = isPlainObject(event.message) ? event.message.content : undefined
    if (!Array.isArray(content)) return
    for (const block of content) {
      if (!isPlainObject(block) || block.type !== 'tool_result') continue
      const id = typeof block.tool_use_id === 'string' ? block.tool_use_id : ''
      const action = toolUses.get(id)
      if (!action) continue
      toolUses.delete(id)
      const status = denied.delete(id) ? 'denied' : block.is_error === true ? 'failed' : 'done'
      emit({ type: 'tool', action, status })
    }
  }

  const onResult = (event: Record<string, unknown>): void => {
    busy = false
    armIdle()
    if (event.is_error === true || event.subtype !== 'success') {
      const errors = Array.isArray(event.errors) ? event.errors.join('; ') : ''
      const text = typeof event.result === 'string' ? event.result : ''
      const error = reportedFailure(
        failureCode,
        event.api_error_status,
        text || failureText || errors,
        rateLimitInfo,
      )
      failureCode = undefined
      failureText = ''
      emit({ type: 'turn-done', ok: false })
      emit({
        type: 'error',
        kind: error instanceof AiRunError ? error.kind : undefined,
        message: error.message,
      })
      return
    }
    emit({ type: 'turn-done', ok: true })
  }

  const onLine = (line: string): void => {
    if (ended) return
    let event: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(line)
      if (!isPlainObject(parsed)) return
      event = parsed
    } catch {
      return
    }
    switch (event.type) {
      case 'control_response': {
        const response = isPlainObject(event.response) ? event.response : undefined
        if (response?.request_id !== INITIALIZE_REQUEST_ID) return
        if (response.subtype === 'success') initialized(true)
        else {
          initialized(
            false,
            new AiRunError(
              'needs-update',
              'Claude Code did not accept the session setup of this app; it may be too old',
              {
                provider: PROVIDER,
              },
            ),
          )
        }
        return
      }
      case 'control_request': {
        const requestId = typeof event.request_id === 'string' ? event.request_id : ''
        const request = isPlainObject(event.request) ? event.request : {}
        if (request.subtype === 'can_use_tool' && requestId) {
          onPermissionRequest(requestId, request)
          return
        }
        // no hook is registered and the app's MCP server is reached over HTTP, so nothing else
        // is expected; answer instead of leaving the CLI waiting
        send({
          type: 'control_response',
          response: {
            subtype: 'error',
            request_id: requestId,
            error: `Unsupported request: ${String(request.subtype)}`,
          },
        })
        return
      }
      case 'system':
        if (event.subtype === 'init') {
          const problem = claudeAgentInitProblem(event, relays)
          if (problem) {
            stopNow(new AiRunError('unsafe-tools', `${problem}; the session was stopped`))
            return
          }
          verified = true
          const skills = Array.isArray(event.skills)
            ? event.skills.filter((skill): skill is string => typeof skill === 'string')
            : []
          emit({
            type: 'started',
            provider: PROVIDER,
            model: typeof event.model === 'string' ? event.model : undefined,
            skills,
          })
        }
        return
      case 'rate_limit_event':
        if (isPlainObject(event.rate_limit_info)) rateLimitInfo = event.rate_limit_info
        return
      case 'assistant':
        onAssistant(event)
        return
      case 'user':
        onUser(event)
        return
      case 'result':
        onResult(event)
        return
    }
  }

  child.stdin?.on('error', () => undefined)
  child.stderr?.on('data', (chunk: Buffer) => {
    const next = stderr + chunk.toString()
    stderr = next.length <= DIAGNOSTIC_LIMIT ? next : next.slice(-DIAGNOSTIC_LIMIT)
  })
  child.once('error', (error) => {
    initialized(false, startFailure(error))
    end(startFailure(error))
  })
  child.once('close', (code: number | null) => {
    const error = stopping ? undefined : exitFailure(code, stderr)
    initialized(false, error ?? new Error('Claude Code ended'))
    end(error)
  })
  if (child.stdout) {
    readLines(child.stdout, onLine, () =>
      stopNow(new Error('Claude Code wrote a line too long to read; the session was stopped')),
    )
  }

  send({
    type: 'control_request',
    request_id: INITIALIZE_REQUEST_ID,
    request: { subtype: 'initialize', appendSystemPrompt: options.instructions },
  })
  try {
    await ready
  } catch (error) {
    stopNow()
    throw error
  }
  armIdle()

  return {
    provider: PROVIDER,
    async send(text: string): Promise<void> {
      if (ended) throw new Error('The agent session has ended')
      if (busy) throw new Error('The agent is still answering the previous message')
      busy = true
      clearTimeout(idleTimer)
      send({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } })
    },
    answer(id: string, answer: AgentPermissionAnswer): void {
      const request = pending.get(id)
      if (!request) return
      pending.delete(id)
      if (answer.allow) {
        if (answer.scope === 'session') {
          if (request.action.kind === 'web-search') allowances.webSearch = true
          else if (request.action.kind === 'web-fetch' && request.action.host) {
            webHosts.add(request.action.host)
          }
        }
        allow(id, request.input)
        return
      }
      if (request.toolUseId) denied.add(request.toolUseId)
      deny(id, answer.message ?? DECLINED_BY_PERSON)
    },
    setOpenDocuments(paths: string[]): void {
      openDocuments = [...paths]
    },
    stop(): void {
      if (!ended) stopNow()
    },
  }
}
