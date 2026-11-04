import { randomUUID } from 'node:crypto'
import type { McpServerView, McpToolView } from '@genoffice/agent-core'
import { mapServerToolNames, serverNameProblem } from '@genoffice/agent-core/user-mcp/names'
import {
  MCP_RESULT_MAX_CHARS,
  shapeMcpResult,
  shapedMcpAnswer,
  type McpCallAnswer,
} from '@genoffice/agent-core/user-mcp/result'
import type { Lang } from '@genoffice/i18n'
import {
  serverStatusOf,
  type McpFailReason,
  type McpPasteView,
  type McpPermission,
  type McpPlannedLaunchAnswer,
  type McpPlannedLaunchView,
  type McpReviewSubject,
  type McpRuntimeId,
  type McpRuntimeQuestion,
  type McpServerInput,
  type McpServerPatch,
  type McpServerSettingsView,
  type McpServerStatusInfo,
  type McpServersSettingsView,
  type McpSettingsResult,
  type McpSignInAnswer,
  type McpTestResult,
  type McpToolNameView,
} from '../../shared/mcp-servers-api'
import { checkServerAddress } from './address'
import { launchReviewNeeded, planFingerprint, serverLaunchFingerprint } from './fingerprint'
import { mcpLaunchProblemText, mcpSignInPages, type McpLaunchProblemKey } from './hub-strings'
import {
  acceptFirstListing,
  applyListing,
  approveInstructions as approveInstructionsOf,
  approveLaunch as approveLaunchOf,
  approveTool as approveToolOf,
  markToolsSeen as markToolsSeenOf,
  setToolPermission as setToolPermissionOf,
  toolsAwaitingReview,
  type McpListing,
} from './listing'
import { LocalMcpError, type LocalMcpConnection, type LocalMcpState } from './local'
import type { LocalLaunchProblem, PlannedLaunch } from './local-launch'
import { storeOAuthAccess, type McpFetch, type McpOAuthAccess } from './oauth'
import { parseMcpPaste, type PastedServer } from './paste'
import { RemoteMcpError, type RemoteMcpConnection } from './remote'
import type { McpRuntimeKit, RuntimeMissing } from './runtimes'
import { secretView } from './secrets'
import { newMcpServerConfig, type McpServerConfig, type McpServersStore } from './store'

/**
 * The one place the app holds the person's MCP servers (user MCP spec 5.1):
 * the store, and a connection per server (remote or "my PC") shared by every
 * window. It answers two kinds of callers:
 *
 * - the AI windows (`editorList`, `call`, `cancel`, `retryByName`,
 *   `openSettingsByName`): the list is built from the approved definitions
 *   in `mcp-servers.json`, so it works before anything connects; a server
 *   connects on its first call (7.1). Every refusal names the server and the
 *   reason, in English for the model. Nothing they get holds a secret.
 * - Settings (`settingsView` and the changes): registration, the connection
 *   check, sign-in, approvals and permissions.
 *
 * Every tool list read from a live connection goes through `applyListing`
 * and is saved (6.2); the first one, read during the person's connection
 * check of a server with nothing approved yet, is accepted as shown (4.6).
 *
 * The AI windows never prompt about a runtime download: a runtime that is
 * missing and not allowed yet leaves the server "failed: runtime-missing",
 * and the question is asked in Settings (5.4). A runtime the person allowed
 * before is downloaded without asking (13).
 */

// ---- what the hub needs -------------------------------------------------------

export interface McpHubDeps {
  store: McpServersStore
  /** a connection to a remote server; the app uses `net.fetch` behind it */
  remote(server: McpServerConfig, oauth: McpOAuthAccess): RemoteMcpConnection
  /** a "my PC" server; `appSignal` aborts when the app quits (a download under way stops) */
  local(server: McpServerConfig, appSignal: AbortSignal): LocalMcpConnection
  /** the runtime lookup (the app's kit never asks on its own; its question is Settings') */
  kit: Pick<McpRuntimeKit, 'resolveCommand'>
  /** the command a local server would run, without downloading anything */
  plannedLaunch(server: McpServerConfig): Promise<PlannedLaunch>
  /** the person's language, for the sign-in pages and the reason view */
  lang(): Lang
  /** the system browser; false when it did not open */
  openExternal(url: string): Promise<unknown>
  /** show Settings → Integrations at this server */
  openSettings(serverId: string): void
}

export interface McpHub {
  /** read `mcp-servers.json` (once, at start) */
  load(): Promise<void>
  /** something changed that a window shows (coalesced) */
  onChanged(listener: () => void): () => void

  // the AI windows
  editorList(): McpServerView[]
  /**
   * `caller` keeps call ids of different windows apart. The answer is the
   * result shaped for the AI (5.5), the same for both kinds of server, or
   * the reason the call could not be made.
   */
  call(
    caller: string,
    server: string,
    tool: string,
    input: Record<string, unknown>,
    callId: string,
  ): Promise<McpCallAnswer>
  cancel(caller: string, callId: string): void
  /** the caller's window went away: stop every call of it */
  cancelCaller(caller: string): void
  retryByName(server: string): { ok: boolean }
  openSettingsByName(server: string): { ok: boolean }

  // Settings
  settingsView(): McpServersSettingsView
  parsePaste(text: string): McpPasteView
  add(input: McpServerInput): Promise<McpSettingsResult<{ id: string }>>
  edit(id: string, patch: McpServerPatch): Promise<McpSettingsResult>
  remove(id: string): Promise<McpSettingsResult>
  test(id: string): Promise<McpTestResult>
  signIn(id: string): Promise<McpSignInAnswer>
  cancelSignIn(id: string): void
  approveTool(id: string, tool: string): Promise<McpSettingsResult>
  approveInstructions(id: string): Promise<McpSettingsResult>
  /** `planFingerprint`: the fingerprint of the plan the person was shown (`plannedLaunch`) */
  approveLaunch(id: string, planFingerprint: string): Promise<McpSettingsResult>
  setToolPermission(id: string, tool: string, permission: McpPermission): Promise<McpSettingsResult>
  setKeepResultsInside(id: string, on: boolean): Promise<McpSettingsResult>
  setEnabled(id: string, on: boolean): Promise<McpSettingsResult>
  markToolsSeen(id: string): Promise<McpSettingsResult>
  plannedLaunch(id: string): Promise<McpPlannedLaunchAnswer>
  answerRuntimeDownload(id: string, download: boolean): Promise<McpPlannedLaunchAnswer>
  retry(id: string): McpSettingsResult

  /** the app is quitting: stop every call, every server and any download under way */
  stopAll(): Promise<void>
}

// ---- texts the model reads (English, no secret, no address) -------------------

const FAIL_TEXT: Record<McpFailReason, string> = {
  unreachable: 'the server could not be reached',
  'http-error': 'the server answered with an error; its address may be wrong',
  'runtime-missing': 'the program it needs is not on this PC',
  'start-failed': 'the server could not be started',
  'refused-redirect':
    'the server sent the request to another address, which this app does not follow',
  'insecure-address': 'its address may not be reached over plain http',
}

/** a tool name as quoted back to the model: what it sent, shortened */
const quoted = (text: string) => JSON.stringify(text.slice(0, 80))

const refusal = (error: string): McpCallAnswer => ({ ok: false, error })

const TEXT = {
  unknownServer: (name: string) => `No MCP server named ${quoted(name)} is registered in this app.`,
  unknownTool: (s: string, t: string) => `${s}: the server has no tool named ${quoted(t)}.`,
  disabled: (s: string) => `${s}: the server is turned off in Settings.`,
  removing: (s: string) => `${s}: the server is being removed in Settings.`,
  unusable: (s: string, t: string) =>
    `${s}: the tool ${quoted(t)} cannot be used because of its name.`,
  toolOff: (s: string, t: string) => `${s}: the tool ${quoted(t)} is turned off in Settings.`,
  pending: (s: string, t: string) =>
    `${s}: the tool ${quoted(t)} changed and waits for the person’s review in Settings.`,
  command: (s: string) => `${s}: its command changed and must be approved again in Settings.`,
  login: (s: string) => `${s}: the server needs the person to sign in again in Settings.`,
  failed: (s: string, reason: McpFailReason) => `${s}: ${FAIL_TEXT[reason]}.`,
  timeout: (s: string) => `${s}: the server did not answer in time.`,
  serverError: (s: string) => `${s}: the server refused the request.`,
  stopped: {
    cancelled: (s: string) => `${s}: the call was stopped.`,
    disabled: (s: string) => `${s}: the server was turned off during the call.`,
    removed: (s: string) => `${s}: the server was removed during the call.`,
    closing: (s: string) => `${s}: the app is closing.`,
  },
}

type StopReason = keyof typeof TEXT.stopped

// ---- per-server state ----------------------------------------------------------

interface Live {
  remote: RemoteMcpConnection | null
  /** what the remote connection was made from; a change makes a new one */
  remoteKey: string
  local: LocalMcpConnection | null
  /** connection attempts under way (remote) */
  connecting: number
  /**
   * The last connection failure. A local server keeps its own after three
   * failed starts; this one also holds a single failed start, so the card
   * shows it at once (with `localProblem` for the reason view).
   */
  failure: McpFailReason | null
  localProblem: LocalLaunchProblem | 'did-not-start' | null
  /** the server asked for a sign-in (remote) */
  loginRequired: boolean
  /** a tool list was read from the live connection in this run (5.7) */
  listed: boolean
  listing: Promise<Trouble | null> | null
  signIn: AbortController | null
  unsubscribe: (() => void)[]
}

interface Call {
  serverId: string
  /** the window (or agent session) the call came from */
  caller: string
  controller: AbortController
}

/** What went wrong with a connection, a listing or a call */
type Trouble =
  | { kind: 'stopped'; reason: StopReason }
  | { kind: 'login' }
  | { kind: 'failed'; reason: McpFailReason }
  /** this call only; the server status stays */
  | { kind: 'call'; text: (server: string) => string }

const remoteKeyOf = (s: McpServerConfig) =>
  JSON.stringify([s.name, s.url, s.transport, Object.entries(s.headers).sort()])

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Header names as HTTP allows them */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const BAD_HEADER_VALUE = /[\r\n\0]/
const BAD_ENV_NAME = /[=\0]/

const PASTE_TOKENS_MAX = 8
const PASTE_TOKEN_TTL_MS = 60 * 60_000

export function createMcpHub(deps: McpHubDeps): McpHub {
  const { store } = deps
  const lives = new Map<string, Live>()
  const calls = new Map<string, Call>()
  const listeners = new Set<() => void>()
  /** remote connections replaced while calls still ran on them */
  const remoteUse = new Map<RemoteMcpConnection, number>()
  const retiring = new Set<RemoteMcpConnection>()
  const pastes = new Map<string, { servers: PastedServer[]; at: number }>()
  /**
   * Servers being turned off or removed: set before the store is written, so
   * a call arriving meanwhile is refused instead of running (13)
   */
  const stopping = new Map<string, 'disabled' | 'removed'>()
  const app = new AbortController()
  let notifyQueued = false

  // ---- notifying ----

  function notify(): void {
    if (notifyQueued) return
    notifyQueued = true
    queueMicrotask(() => {
      notifyQueued = false
      for (const listener of [...listeners]) {
        try {
          listener()
        } catch {
          // a listener's failure is its own
        }
      }
    })
  }

  // ---- connections ----

  function liveOf(id: string): Live {
    let live = lives.get(id)
    if (!live) {
      live = {
        remote: null,
        remoteKey: '',
        local: null,
        connecting: 0,
        failure: null,
        localProblem: null,
        loginRequired: false,
        listed: false,
        listing: null,
        signIn: null,
        unsubscribe: [],
      }
      lives.set(id, live)
    }
    return live
  }

  function closeWhenUnused(conn: RemoteMcpConnection): void {
    if ((remoteUse.get(conn) ?? 0) > 0) {
      retiring.add(conn)
      return
    }
    retiring.delete(conn)
    remoteUse.delete(conn)
    void conn.close().catch(() => {})
  }

  /** the remote connection made from the server's current settings */
  function remoteOf(server: McpServerConfig): RemoteMcpConnection {
    const live = liveOf(server.id)
    const key = remoteKeyOf(server)
    if (live.remote && live.remoteKey === key) return live.remote
    if (live.remote) closeWhenUnused(live.remote)
    const conn = deps.remote(server, storeOAuthAccess(store, server.id))
    live.remote = conn
    live.remoteKey = key
    live.unsubscribe.push(conn.onToolsChanged(() => void relistQuietly(server.id, conn)))
    return conn
  }

  function localOf(server: McpServerConfig): LocalMcpConnection {
    const live = liveOf(server.id)
    if (live.local) return live.local
    const conn = deps.local(server, app.signal)
    live.local = conn
    live.unsubscribe.push(
      conn.onStateChanged((state) => {
        // a start that worked clears the failure of the one before
        if (state.state === 'running') {
          live.failure = null
          live.localProblem = null
        }
        notify()
      }),
      conn.onToolsChanged(() => void relistQuietly(server.id, conn)),
    )
    return conn
  }

  /** after a change in the store: the connections follow the new settings */
  function follow(id: string): void {
    const server = store.server(id)
    const live = lives.get(id)
    if (!server || !live) return
    if (live.local) live.local.setServer(server)
    if (live.remote && (live.remoteKey !== remoteKeyOf(server) || !server.enabled)) {
      closeWhenUnused(live.remote)
      live.remote = null
      live.remoteKey = ''
      live.listed = false
    }
  }

  // ---- status ----

  function localState(live: Live | undefined): LocalMcpState | null {
    return live?.local?.status() ?? null
  }

  /**
   * A local server whose command must be allowed (again): the stored command
   * changed, or the launcher found that it now resolves to another program
   * than the one the person allowed (4.5)
   */
  function commandReviewNeeded(server: McpServerConfig): boolean {
    if (server.kind !== 'local') return false
    return (
      launchReviewNeeded(server) || localState(lives.get(server.id))?.state === 'review-required'
    )
  }

  function statusOf(server: McpServerConfig): McpServerStatusInfo {
    const live = lives.get(server.id)
    // approved tools or guide stored from an earlier listing: usable before connecting
    const listedBefore =
      Object.keys(server.tools).length > 0 ||
      server.instructions !== null ||
      server.pendingInstructions !== null
    if (server.kind === 'local') {
      const state = localState(live)
      return serverStatusOf({
        enabled: server.enabled,
        commandReviewNeeded: commandReviewNeeded(server),
        loginRequired: false,
        failure: state?.state === 'failed' ? state.reason : (live?.failure ?? null),
        connecting: state?.state === 'starting',
        reached: !!live && (live.listed || state?.state === 'running'),
        listedBefore,
      })
    }
    return serverStatusOf({
      enabled: server.enabled,
      commandReviewNeeded: false,
      loginRequired: !!live && (live.loginRequired || live.remote?.needsSignIn() === true),
      failure: live?.failure ?? null,
      connecting: (live?.connecting ?? 0) > 0,
      reached: live?.listed === true,
      listedBefore,
    })
  }

  function reviewOf(server: McpServerConfig): McpReviewSubject[] {
    const review: McpReviewSubject[] = []
    if (toolsAwaitingReview(server).length > 0) review.push('tools')
    if (server.pendingInstructions !== null) review.push('instructions')
    if (commandReviewNeeded(server)) review.push('command')
    return review
  }

  // ---- troubles ----

  function troubleOf(error: unknown, signal?: AbortSignal): Trouble {
    if (signal?.aborted) {
      const reason: unknown = signal.reason
      return {
        kind: 'stopped',
        reason:
          typeof reason === 'string' && reason in TEXT.stopped
            ? (reason as StopReason)
            : 'cancelled',
      }
    }
    if (error instanceof RemoteMcpError) {
      switch (error.reason) {
        case 'aborted':
          return { kind: 'stopped', reason: 'cancelled' }
        case 'login-required':
          return { kind: 'login' }
        case 'refused-redirect':
        case 'insecure-address':
        case 'unreachable':
        case 'http-error':
          return { kind: 'failed', reason: error.reason }
        case 'timeout':
          return { kind: 'call', text: TEXT.timeout }
        default:
          return { kind: 'call', text: TEXT.serverError }
      }
    }
    if (error instanceof LocalMcpError) {
      switch (error.reason) {
        case 'disabled':
          return { kind: 'call', text: TEXT.disabled }
        case 'review-required':
          return { kind: 'call', text: TEXT.command }
        case 'runtime-missing':
        case 'start-failed':
          return { kind: 'failed', reason: error.reason }
        case 'timeout':
          return { kind: 'call', text: TEXT.timeout }
        default:
          return { kind: 'call', text: (s) => TEXT.failed(s, 'unreachable') }
      }
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return { kind: 'stopped', reason: 'cancelled' }
    }
    return { kind: 'failed', reason: 'unreachable' }
  }

  /**
   * What a trouble does to the server's status. A local server keeps its own
   * state; a start that failed is noted here too, so a single failed start
   * shows as "could not connect" with its reason and standard error (the
   * launcher itself stops trying only after three).
   */
  function note(server: McpServerConfig, trouble: Trouble, error?: unknown): void {
    const live = liveOf(server.id)
    if (server.kind !== 'remote') {
      if (trouble.kind !== 'failed' || !(error instanceof LocalMcpError)) return
      live.failure = trouble.reason
      live.localProblem = error.problem
      notify()
      return
    }
    if (trouble.kind === 'login') live.loginRequired = true
    else if (trouble.kind === 'failed') live.failure = trouble.reason
    else return
    notify()
  }

  function troubleText(server: string, trouble: Trouble): string {
    switch (trouble.kind) {
      case 'stopped':
        return TEXT.stopped[trouble.reason](server)
      case 'login':
        return TEXT.login(server)
      case 'failed':
        return TEXT.failed(server, trouble.reason)
      default:
        return trouble.text(server)
    }
  }

  // ---- reading the tool list (5.7, 6.2) ----

  async function replaceServer(
    id: string,
    change: (server: McpServerConfig) => McpServerConfig,
  ): Promise<McpServerConfig | null> {
    let changed: McpServerConfig | null = null
    if (!store.server(id)) return null
    await store.update((file) => {
      file.servers = file.servers.map((s) => {
        if (s.id !== id) return s
        changed = change(s)
        return changed
      })
    })
    return changed
  }

  async function readListing(
    server: McpServerConfig,
    signal: AbortSignal | undefined,
  ): Promise<McpListing> {
    if (server.kind === 'local') return localOf(server).listTools(signal)
    const live = liveOf(server.id)
    const conn = remoteOf(server)
    live.connecting += 1
    notify()
    try {
      return await conn.listTools(signal)
    } finally {
      live.connecting -= 1
      notify()
    }
  }

  /**
   * Read the tool list from the live connection and save what it changes.
   * `first`: the person's connection check of a server with nothing approved
   * yet, which approves what it shows. Null when it worked.
   */
  async function relist(
    id: string,
    options: { first?: boolean; signal?: AbortSignal } = {},
  ): Promise<Trouble | null> {
    const server = store.server(id)
    if (!server) return { kind: 'call', text: TEXT.unknownServer }
    const live = liveOf(id)
    let listing: McpListing
    try {
      listing = await readListing(server, options.signal)
    } catch (error) {
      const trouble = troubleOf(error, options.signal)
      note(server, trouble, error)
      return trouble
    }
    // a list that lands while the server is turned off or removed is not applied
    const halt = stopping.get(id)
    if (halt) return { kind: 'stopped', reason: halt }
    if (!store.server(id)?.enabled) return { kind: 'stopped', reason: 'disabled' }
    live.failure = null
    live.localProblem = null
    if (server.kind === 'remote') live.loginRequired = false
    await replaceServer(id, (s) =>
      options.first ? acceptFirstListing(s, listing) : applyListing(s, listing).server,
    )
    live.listed = true
    follow(id)
    notify()
    return null
  }

  /** the list a server announced as changed; nothing to report to anyone */
  async function relistQuietly(
    id: string,
    from: RemoteMcpConnection | LocalMcpConnection,
  ): Promise<void> {
    const live = lives.get(id)
    if (!live || (live.remote !== from && live.local !== from)) return
    await relist(id).catch(() => null)
  }

  /** the first listing of this run, shared by calls that arrive together */
  function ensureListed(id: string, signal: AbortSignal): Promise<Trouble | null> {
    const live = liveOf(id)
    if (live.listed) return Promise.resolve(null)
    live.listing ??= relist(id).finally(() => {
      live.listing = null
    })
    const listing = live.listing
    return new Promise((resolve) => {
      const onAbort = () => resolve(troubleOf(null, signal))
      if (signal.aborted) return onAbort()
      signal.addEventListener('abort', onAbort, { once: true })
      void listing.then((trouble) => {
        signal.removeEventListener('abort', onAbort)
        resolve(trouble)
      })
    })
  }

  // ---- the AI windows ----

  function findByName(name: string): McpServerConfig | null {
    return store.get().servers.find((s) => s.name === name) ?? null
  }

  function editorView(server: McpServerConfig): McpServerView {
    const status = statusOf(server)
    const review = reviewOf(server)
    const entries = Object.entries(server.tools)
    const names = mapServerToolNames(
      server.name,
      entries.map(([name]) => name),
    )
    const tools: McpToolView[] = entries.map(([name, tool], index) => {
      const mapped = names[index]
      return {
        name,
        exposedName: mapped?.name ?? '',
        // the approved definition only: a pending one never reaches a window
        description: tool.definition.description,
        inputSchema: tool.definition.inputSchema,
        permission: tool.permission,
        pending: tool.pending !== null,
        ...(mapped?.problem ? { unusable: mapped.problem } : {}),
        ...(tool.definition.annotations?.destructiveHint === true ? { destructive: true } : {}),
      }
    })
    return {
      name: server.name,
      status: status.status,
      ...(status.status === 'failed' ? { failReason: status.reason } : {}),
      ...(review.length > 0 ? { review } : {}),
      newToolCount: server.newTools.length,
      keepResultsInside: server.keepResultsInside,
      instructions:
        server.instructions && server.pendingInstructions === null
          ? server.instructions.text
          : null,
      tools,
    }
  }

  /** why a call to this server and tool cannot go now, or null */
  function refusalFor(server: McpServerConfig, toolName: string, listed: boolean): string | null {
    const status = statusOf(server)
    switch (status.status) {
      case 'disabled':
        return TEXT.disabled(server.name)
      case 'review-required':
        return TEXT.command(server.name)
      case 'login-required':
        return TEXT.login(server.name)
      case 'failed':
        // an unreachable address may be back: the call tries to connect once more and
        // the status stays failed until it works; other failures wait for the person
        if (
          server.kind === 'remote' &&
          (status.reason === 'unreachable' || status.reason === 'http-error')
        ) {
          break
        }
        // one failed start shows at once, but the launcher tries again until its third
        if (server.kind === 'local' && localState(lives.get(server.id))?.state !== 'failed') break
        return TEXT.failed(server.name, status.reason)
      default:
        break
    }
    const names = Object.keys(server.tools)
    const index = names.indexOf(toolName)
    if (index < 0) return listed ? TEXT.unknownTool(server.name, toolName) : null
    const tool = server.tools[names[index] as string]
    if (!tool) return listed ? TEXT.unknownTool(server.name, toolName) : null
    // a tool with no usable AI-facing name is never declared; the main process refuses it too
    if (mapServerToolNames(server.name, names)[index]?.problem) {
      return TEXT.unusable(server.name, toolName)
    }
    if (tool.permission === 'off') return TEXT.toolOff(server.name, toolName)
    if (tool.pending) return TEXT.pending(server.name, toolName)
    return null
  }

  function stoppingRefusal(server: McpServerConfig): string | null {
    const halt = stopping.get(server.id)
    if (!halt) return null
    return halt === 'removed' ? TEXT.removing(server.name) : TEXT.disabled(server.name)
  }

  /**
   * Run one call. Either kind answers the result shaped for the AI here in
   * the main process (5.5): a local connection shapes its own results, a
   * remote one's are shaped below, so pictures and other non-text blocks
   * never cross to a window and the windows read one answer form.
   */
  async function runCall(
    server: McpServerConfig,
    tool: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<McpCallAnswer> {
    if (server.kind === 'local') {
      const conn = localOf(server)
      try {
        await conn.ensure(signal)
        return shapedMcpAnswer(await conn.callTool(tool, input, signal))
      } catch (error) {
        const trouble = troubleOf(error, signal)
        note(server, trouble, error)
        return refusal(troubleText(server.name, trouble))
      }
    }
    const conn = remoteOf(server)
    remoteUse.set(conn, (remoteUse.get(conn) ?? 0) + 1)
    try {
      const result = await conn.callTool(tool, input, signal)
      const live = liveOf(server.id)
      if (live.failure || live.loginRequired) {
        live.failure = null
        live.loginRequired = false
        notify()
      }
      return shapedMcpAnswer(shapeMcpResult(result, MCP_RESULT_MAX_CHARS))
    } catch (error) {
      const trouble = troubleOf(error, signal)
      note(server, trouble)
      return refusal(troubleText(server.name, trouble))
    } finally {
      const left = (remoteUse.get(conn) ?? 1) - 1
      remoteUse.set(conn, left)
      if (left <= 0 && retiring.has(conn)) closeWhenUnused(conn)
    }
  }

  async function call(
    caller: string,
    serverName: string,
    toolName: string,
    input: Record<string, unknown>,
    callId: string,
  ): Promise<McpCallAnswer> {
    const found = findByName(serverName)
    if (!found) return refusal(TEXT.unknownServer(serverName))
    const live = liveOf(found.id)
    const early = stoppingRefusal(found) ?? refusalFor(found, toolName, live.listed)
    if (early) return refusal(early)

    const key = `${caller}\u0000${callId}`
    calls.get(key)?.controller.abort('cancelled')
    const controller = new AbortController()
    calls.set(key, { serverId: found.id, caller, controller })
    const signal = controller.signal
    try {
      // the first use after the app started reads the list (5.7) and applies its changes
      const trouble = await ensureListed(found.id, signal)
      if (trouble) return refusal(troubleText(found.name, trouble))
      if (signal.aborted) return refusal(troubleText(found.name, troubleOf(null, signal)))
      const server = store.server(found.id)
      if (!server) return refusal(TEXT.stopped.removed(found.name))
      const late = stoppingRefusal(server) ?? refusalFor(server, toolName, true)
      if (late) return refusal(late)
      return await runCall(server, toolName, input, signal)
    } finally {
      if (calls.get(key)?.controller === controller) calls.delete(key)
    }
  }

  function stopCalls(serverId: string | null, reason: StopReason): void {
    for (const [key, entry] of calls) {
      if (serverId !== null && entry.serverId !== serverId) continue
      entry.controller.abort(reason)
      calls.delete(key)
    }
  }

  // ---- Settings ----

  function toolNamesOf(server: McpServerConfig): Record<string, McpToolNameView> {
    const entries = mapServerToolNames(server.name, Object.keys(server.tools))
    return Object.fromEntries(
      entries.map((e) => [
        e.original,
        { exposedName: e.name, changed: e.changed, problem: e.problem },
      ]),
    )
  }

  function failureOf(server: McpServerConfig): McpServerSettingsView['failure'] {
    if (server.kind !== 'local') return null
    const live = lives.get(server.id)
    const state = localState(live)
    let failed: { reason: McpFailReason; problem: LocalLaunchProblem | 'did-not-start' } | null =
      null
    if (state?.state === 'failed') failed = { reason: state.reason, problem: state.problem }
    else if (live?.failure) {
      failed = { reason: live.failure, problem: live.localProblem ?? 'did-not-start' }
    }
    if (!failed) return null
    const problem: McpLaunchProblemKey =
      failed.problem === 'runtime-missing' || failed.reason === 'runtime-missing'
        ? 'runtime-missing'
        : failed.problem
    return {
      text: mcpLaunchProblemText(deps.lang(), problem),
      stderrTail: live?.local?.stderrTail() ?? [],
    }
  }

  function settingsView(): McpServersSettingsView {
    const base = store.view()
    const servers = base.servers.map((view): McpServerSettingsView => {
      const server = store.server(view.id)
      if (!server) {
        return { ...view, status: { status: 'disabled' }, review: [], toolNames: {}, failure: null }
      }
      return {
        ...view,
        launchReviewNeeded: commandReviewNeeded(server),
        status: statusOf(server),
        review: reviewOf(server),
        toolNames: toolNamesOf(server),
        failure: failureOf(server),
      }
    })
    return { sealing: base.sealing, runtimes: base.runtimes, servers }
  }

  type Refused = Exclude<McpSettingsResult, { ok: true }>

  function invalid(problem: Refused['problem'], detail?: string): Refused {
    return detail === undefined ? { ok: false, problem } : { ok: false, problem, detail }
  }

  /** null keeps the held value; a name with null and nothing held is malformed */
  function resolveHeld(
    given: Record<string, string | null>,
    held: Record<string, string>,
  ): Record<string, string> | null {
    const out: [string, string][] = []
    for (const [name, value] of Object.entries(given)) {
      if (value !== null) {
        out.push([name, value])
        continue
      }
      const kept = Object.entries(held).find(([k]) => k === name)?.[1]
      if (kept === undefined) return null
      out.push([name, kept])
    }
    return Object.fromEntries(out)
  }

  function withKey(headers: Record<string, string>, key: string): Record<string, string> {
    const rest = Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'authorization')
    const bare = key.trim().replace(/^bearer\s+/i, '')
    return Object.fromEntries(bare ? [...rest, ['Authorization', `Bearer ${bare}`]] : rest)
  }

  function checkName(name: string, exceptId: string | null): Refused | null {
    const problem = serverNameProblem(name)
    if (problem) return invalid('name', problem)
    const taken = store.get().servers.some((s) => s.id !== exceptId && sameName(s.name, name))
    return taken ? invalid('name-taken') : null
  }

  function checkRemote(url: string, allowPlainHttp: boolean | undefined): Refused | null {
    const check = checkServerAddress(url)
    if (!check.ok) return invalid('address', check.problem)
    if (check.plain && allowPlainHttp !== true) return invalid('plain-http-unconfirmed')
    return null
  }

  function checkHeaders(headers: Record<string, string>): Refused | null {
    for (const [name, value] of Object.entries(headers)) {
      if (!HEADER_NAME.test(name) || BAD_HEADER_VALUE.test(value))
        return invalid('invalid', 'headers')
    }
    return null
  }

  function checkLaunch(
    command: string,
    args: string[],
    env: Record<string, string>,
  ): Refused | null {
    if (!command.trim() || command.includes('\0')) return invalid('invalid', 'command')
    if (args.some((a) => a.includes('\0'))) return invalid('invalid', 'args')
    for (const [name, value] of Object.entries(env)) {
      if (!name || BAD_ENV_NAME.test(name) || value.includes('\0')) return invalid('invalid', 'env')
    }
    return null
  }

  function takePaste(ref: { token: string; index: number }): PastedServer | null {
    const now = Date.now()
    for (const [token, entry] of pastes) {
      if (now - entry.at > PASTE_TOKEN_TTL_MS) pastes.delete(token)
    }
    return pastes.get(ref.token)?.servers[ref.index] ?? null
  }

  function rememberPaste(servers: PastedServer[]): string {
    const token = randomUUID()
    pastes.set(token, { servers, at: Date.now() })
    while (pastes.size > PASTE_TOKENS_MAX) {
      const oldest = pastes.keys().next().value
      if (oldest === undefined) break
      pastes.delete(oldest)
    }
    return token
  }

  async function add(input: McpServerInput): Promise<McpSettingsResult<{ id: string }>> {
    const nameProblem = checkName(input.name, null)
    if (nameProblem) return nameProblem
    let pasted: PastedServer | null = null
    if (input.paste) {
      pasted = takePaste(input.paste)
      if (!pasted) return invalid('paste-expired')
    }
    const heldHeaders = pasted?.headers ?? {}
    const heldEnv = pasted?.env ?? {}
    if (input.kind === 'remote') {
      const url = input.url ?? ''
      const addressProblem = checkRemote(url, input.allowPlainHttp)
      if (addressProblem) return addressProblem
      let headers = input.headers ? resolveHeld(input.headers, heldHeaders) : { ...heldHeaders }
      if (!headers) return invalid('invalid', 'headers')
      if (typeof input.key === 'string') headers = withKey(headers, input.key)
      const headerProblem = checkHeaders(headers)
      if (headerProblem) return headerProblem
      const client = input.oauthClient
      const server = newMcpServerConfig({
        name: input.name,
        kind: 'remote',
        url,
        transport: input.transport ?? 'auto',
        headers,
        oauth: client
          ? { clientId: client.clientId, clientSecret: client.clientSecret ?? '', tokens: '' }
          : null,
      })
      await store.update((file) => {
        file.servers.push(server)
      })
      notify()
      return { ok: true, id: server.id }
    }
    const command = input.command ?? ''
    const args = input.args ?? []
    const env = input.env ? resolveHeld(input.env, heldEnv) : { ...heldEnv }
    if (!env) return invalid('invalid', 'env')
    const launchProblem = checkLaunch(command, args, env)
    if (launchProblem) return launchProblem
    const server = newMcpServerConfig({ name: input.name, kind: 'local', command, args, env })
    await store.update((file) => {
      file.servers.push(server)
    })
    notify()
    return { ok: true, id: server.id }
  }

  async function edit(id: string, patch: McpServerPatch): Promise<McpSettingsResult> {
    const current = store.server(id)
    if (!current) return invalid('not-found')
    const next: McpServerConfig = { ...current }
    if (patch.name !== undefined && patch.name !== current.name) {
      const nameProblem = checkName(patch.name, id)
      if (nameProblem) return nameProblem
      next.name = patch.name
    }
    if (current.kind === 'remote') {
      if (patch.url !== undefined && patch.url !== current.url) {
        const addressProblem = checkRemote(patch.url, patch.allowPlainHttp)
        if (addressProblem) return addressProblem
        next.url = patch.url
        // a sign-in belongs to the address it was made for
        if (next.oauth) next.oauth = { ...next.oauth, tokens: '' }
      }
      if (patch.transport !== undefined) next.transport = patch.transport
      let headers = current.headers
      if (patch.headers) {
        const resolved = resolveHeld(patch.headers, current.headers)
        if (!resolved) return invalid('invalid', 'headers')
        headers = resolved
      }
      if (typeof patch.key === 'string') headers = withKey(headers, patch.key)
      const headerProblem = checkHeaders(headers)
      if (headerProblem) return headerProblem
      next.headers = headers
      if (patch.oauthClient === null) next.oauth = null
      else if (patch.oauthClient) {
        const secret = patch.oauthClient.clientSecret ?? current.oauth?.clientSecret ?? ''
        next.oauth = {
          clientId: patch.oauthClient.clientId,
          clientSecret: secret,
          tokens: next.oauth?.tokens ?? '',
        }
      }
    } else {
      if (patch.command !== undefined) next.command = patch.command
      if (patch.args !== undefined) next.args = [...patch.args]
      if (patch.env) {
        const resolved = resolveHeld(patch.env, current.env)
        if (!resolved) return invalid('invalid', 'env')
        next.env = resolved
      }
      const launchProblem = checkLaunch(next.command, next.args, next.env)
      if (launchProblem) return launchProblem
    }
    await replaceServer(id, () => next)
    const live = lives.get(id)
    if (live && (next.url !== current.url || next.command !== current.command)) {
      live.listed = false
      live.failure = null
      live.localProblem = null
    }
    follow(id)
    notify()
    return { ok: true }
  }

  async function remove(id: string): Promise<McpSettingsResult> {
    const server = store.server(id)
    if (!server) return invalid('not-found')
    // before any wait: no call may start against a server on its way out (13)
    stopping.set(id, 'removed')
    stopCalls(id, 'removed')
    const live = lives.get(id)
    live?.signIn?.abort()
    // 4.9: ask the server to revoke the sign-in before its tokens are forgotten
    let revoker: RemoteMcpConnection | null = null
    try {
      if (server.kind === 'remote') {
        revoker = live?.remote ?? deps.remote(server, storeOAuthAccess(store, id))
        await revoker.revoke().catch(() => {})
      }
      await store.removeServer(id)
    } finally {
      stopCalls(id, 'removed')
      stopping.delete(id)
    }
    if (live) {
      for (const unsubscribe of live.unsubscribe.splice(0)) unsubscribe()
      if (live.local) await live.local.stop().catch(() => {})
      if (live.remote) closeWhenUnused(live.remote)
      lives.delete(id)
    }
    if (revoker && revoker !== live?.remote) void revoker.close().catch(() => {})
    notify()
    return { ok: true }
  }

  function runtimeQuestion(
    command: string,
    missing: RuntimeMissing | null,
  ): McpRuntimeQuestion | null {
    if (!missing || missing.detail !== 'download-needed' || missing.downloads.length === 0) {
      return null
    }
    const runtimes = store.get().runtimes
    const allowed = missing.downloads.every(
      (d) => Object.entries(runtimes).find(([k]) => k === d.runtime)?.[1].allowed === true,
    )
    return {
      command,
      runtime: (missing.runtime ?? missing.downloads[0]?.runtime ?? 'node') as McpRuntimeId,
      downloads: missing.downloads.map((d) => ({
        runtime: d.runtime,
        version: d.version,
        bytes: d.bytes,
      })),
      totalBytes: missing.downloads.reduce((sum, d) => sum + d.bytes, 0),
      allowed,
    }
  }

  function launchView(server: McpServerConfig, plan: PlannedLaunch): McpPlannedLaunchView {
    if (plan.ok) {
      return {
        ok: true,
        fingerprint: planFingerprint(plan),
        command: plan.command,
        args: [...plan.args],
        addedArgs: [...plan.addedArgs],
        env: plan.env.map((e) => ({ name: e.name, origin: e.origin })),
        droppedEnv: [...plan.droppedEnv],
        source: plan.source,
        runtime: plan.runtime,
      }
    }
    return {
      ok: false,
      problem: plan.problem,
      text: mcpLaunchProblemText(deps.lang(), plan.problem),
      question:
        plan.problem === 'runtime-missing' ? runtimeQuestion(server.command, plan.runtime) : null,
    }
  }

  async function plannedLaunchOf(id: string): Promise<McpPlannedLaunchAnswer> {
    const server = store.server(id)
    if (!server) return { ok: false, problem: 'not-found' }
    if (server.kind !== 'local') return { ok: false, problem: 'not-local' }
    return { ok: true, launch: launchView(server, await deps.plannedLaunch(server)) }
  }

  async function test(id: string): Promise<McpTestResult> {
    const server = store.server(id)
    if (!server) return { ok: false, problem: 'not-found' }
    if (!server.enabled) return { ok: false, problem: 'disabled' }
    const live = liveOf(id)
    if (server.kind === 'local') {
      if (launchReviewNeeded(server)) return { ok: false, problem: 'launch-not-approved' }
      const plan = await deps.plannedLaunch(server)
      if (!plan.ok) {
        const question =
          plan.problem === 'runtime-missing' ? runtimeQuestion(server.command, plan.runtime) : null
        // allowed before: the start downloads it without asking (13)
        if (question && !question.allowed)
          return { ok: false, problem: 'runtime-download', question }
        if (!question) {
          // the card shows it as the server's failure, with its reason, once
          live.failure = plan.problem === 'runtime-missing' ? 'runtime-missing' : 'start-failed'
          live.localProblem = plan.problem
          notify()
          return {
            ok: false,
            problem: 'failed',
            reason: plan.problem === 'runtime-missing' ? 'runtime-missing' : 'start-failed',
            text: mcpLaunchProblemText(deps.lang(), plan.problem),
          }
        }
      }
      localOf(server).retry()
      live.failure = null
      live.localProblem = null
    } else {
      live.failure = null
      live.loginRequired = false
    }
    const first =
      Object.keys(server.tools).length === 0 &&
      server.instructions === null &&
      server.pendingInstructions === null
    const trouble = await relist(id, { first, signal: app.signal })
    if (trouble) {
      if (trouble.kind === 'login') return { ok: false, problem: 'login-required' }
      // the program resolves elsewhere than the person allowed: the command is shown again
      const now = store.server(id)
      if (now && commandReviewNeeded(now)) return { ok: false, problem: 'launch-not-approved' }
      const reason: McpFailReason = trouble.kind === 'failed' ? trouble.reason : 'unreachable'
      const failure = store.server(id) ? failureOf(store.server(id) as McpServerConfig) : null
      return { ok: false, problem: 'failed', reason, text: failure?.text ?? null }
    }
    return { ok: true, toolCount: Object.keys(store.server(id)?.tools ?? {}).length }
  }

  async function signIn(id: string): Promise<McpSignInAnswer> {
    const server = store.server(id)
    if (!server) return { ok: false, reason: 'not-found' }
    if (server.kind !== 'remote') return { ok: false, reason: 'not-remote' }
    const live = liveOf(id)
    live.signIn?.abort()
    const controller = new AbortController()
    live.signIn = controller
    try {
      const result = await remoteOf(server).signIn({
        openExternal: (url) => deps.openExternal(url),
        pages: mcpSignInPages(deps.lang()),
        signal: AbortSignal.any([controller.signal, app.signal]),
      })
      if (result.ok) {
        live.loginRequired = false
        live.failure = null
        live.listed = false
        notify()
      }
      return result
    } finally {
      if (live.signIn === controller) live.signIn = null
    }
  }

  /** a stored change, then the connections follow and the windows hear of it */
  async function change(
    id: string,
    apply: (server: McpServerConfig) => McpServerConfig,
  ): Promise<McpSettingsResult> {
    const done = await replaceServer(id, apply)
    if (!done) return invalid('not-found')
    follow(id)
    notify()
    return { ok: true }
  }

  async function answerRuntimeDownload(
    id: string,
    download: boolean,
  ): Promise<McpPlannedLaunchAnswer> {
    const server = store.server(id)
    if (!server) return { ok: false, problem: 'not-found' }
    if (server.kind !== 'local') return { ok: false, problem: 'not-local' }
    if (download) {
      const plan = await deps.plannedLaunch(server)
      const missing = !plan.ok && plan.problem === 'runtime-missing' ? plan.runtime : null
      if (missing && missing.downloads.length > 0) {
        await store.update((file) => {
          const runtimes = { ...file.runtimes }
          for (const item of missing.downloads) runtimes[item.runtime] = { allowed: true }
          file.runtimes = runtimes
        })
        // allowed now, so the kit downloads without asking
        await deps.kit
          .resolveCommand(server.command, { offerDownload: true, signal: app.signal })
          .catch(() => null)
        lives.get(id)?.local?.retry()
        notify()
      }
    }
    return plannedLaunchOf(id)
  }

  /**
   * "Allow to run" (4.5): only for the very plan the person was shown. The
   * plan is computed again, by the function the launcher uses; when it is
   * not the one `planFingerprint` names (the command, the program it
   * resolves to, the arguments or the variable names changed since the view
   * was made), nothing is approved and the screen shows the plan again.
   */
  async function approveLaunch(id: string, fingerprint: string): Promise<McpSettingsResult> {
    const server = store.server(id)
    if (!server) return invalid('not-found')
    if (server.kind !== 'local') return invalid('not-local')
    const shape = serverLaunchFingerprint(server)
    const plan = await deps.plannedLaunch(server)
    if (!plan.ok || planFingerprint(plan) !== fingerprint) return invalid('launch-changed')
    let stale = false
    const done = await replaceServer(id, (s) => {
      // an edit that landed while the plan was computed is not what was shown
      if (serverLaunchFingerprint(s) !== shape) {
        stale = true
        return s
      }
      return approveLaunchOf(s, fingerprint)
    })
    if (!done) return invalid('not-found')
    if (stale) return invalid('launch-changed')
    follow(id)
    notify()
    return { ok: true }
  }

  function retry(id: string): McpSettingsResult {
    const server = store.server(id)
    if (!server) return invalid('not-found')
    const live = lives.get(id)
    if (live) {
      live.failure = null
      live.localProblem = null
      live.local?.retry()
    }
    notify()
    return { ok: true }
  }

  async function setEnabled(id: string, on: boolean): Promise<McpSettingsResult> {
    if (on) {
      // a removal under way stays in force
      if (stopping.get(id) === 'disabled') stopping.delete(id)
      const result = await change(id, (s) => ({ ...s, enabled: true }))
      // turned back on: an old failure gets a fresh try
      if (result.ok) retry(id)
      return result
    }
    // before the write: calls arriving meanwhile are refused, those under way end (13)
    stopping.set(id, 'disabled')
    stopCalls(id, 'disabled')
    try {
      return await change(id, (s) => ({ ...s, enabled: false }))
    } finally {
      stopCalls(id, 'disabled')
      if (stopping.get(id) === 'disabled') stopping.delete(id)
    }
  }

  async function stopAll(): Promise<void> {
    app.abort('closing')
    stopCalls(null, 'closing')
    const stops: Promise<unknown>[] = []
    for (const live of lives.values()) {
      live.signIn?.abort()
      if (live.local) stops.push(live.local.stop().catch(() => {}))
      if (live.remote) stops.push(live.remote.close().catch(() => {}))
    }
    for (const conn of retiring) stops.push(conn.close().catch(() => {}))
    retiring.clear()
    await Promise.all(stops)
  }

  return {
    load: async () => {
      await store.load()
      notify()
    },
    onChanged: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    editorList: () => store.get().servers.map(editorView),
    call,
    cancel: (caller, callId) => {
      const key = `${caller}\u0000${callId}`
      const entry = calls.get(key)
      if (!entry) return
      entry.controller.abort('cancelled')
      calls.delete(key)
    },
    cancelCaller: (caller) => {
      for (const [key, entry] of calls) {
        if (entry.caller !== caller) continue
        entry.controller.abort('cancelled')
        calls.delete(key)
      }
    },
    retryByName: (name) => {
      const server = findByName(name)
      if (!server) return { ok: false }
      const state = localState(lives.get(server.id))
      retry(server.id)
      // a runtime is downloaded only after the person agrees, and that question is Settings'
      if (state?.state === 'failed' && state.reason === 'runtime-missing') {
        deps.openSettings(server.id)
      }
      return { ok: true }
    },
    openSettingsByName: (name) => {
      const server = findByName(name)
      if (!server) return { ok: false }
      deps.openSettings(server.id)
      return { ok: true }
    },

    settingsView,
    parsePaste: (text) => {
      const taken = store.get().servers.map((s) => s.name)
      const result = parseMcpPaste(text, taken)
      if (!result.ok) return result
      const views = (record: Record<string, string>) =>
        Object.fromEntries(Object.entries(record).map(([k, v]) => [k, secretView(v, false)]))
      return {
        ok: true,
        token: rememberPaste(result.servers),
        format: result.format,
        ignored: [...result.ignored],
        servers: result.servers.map((s) => ({
          pastedName: s.pastedName,
          name: s.name,
          nameChanged: s.nameChanged,
          kind: s.kind,
          url: s.url,
          transport: s.transport,
          headers: views(s.headers),
          command: s.command,
          args: [...s.args],
          env: views(s.env),
          keyNeeded: s.keyNeeded,
          keyEnvVar: s.keyEnvVar,
          headerVars: { ...s.headerVars },
          envVars: { ...s.envVars },
          typeIgnored: s.typeIgnored,
          ignored: [...s.ignored],
          problem: s.problem,
        })),
      }
    },
    add,
    edit,
    remove,
    test,
    signIn,
    cancelSignIn: (id) => {
      lives.get(id)?.signIn?.abort()
    },
    approveTool: (id, tool) => change(id, (s) => approveToolOf(s, tool)),
    approveInstructions: (id) => change(id, approveInstructionsOf),
    approveLaunch,
    setToolPermission: (id, tool, permission) =>
      change(id, (s) => setToolPermissionOf(s, tool, permission)),
    setKeepResultsInside: (id, on) => change(id, (s) => ({ ...s, keepResultsInside: on })),
    setEnabled,
    markToolsSeen: (id) => change(id, markToolsSeenOf),
    plannedLaunch: plannedLaunchOf,
    answerRuntimeDownload,
    retry,
    stopAll,
  }
}

/**
 * The network call behind remote servers. Every request asks not to follow
 * redirects; the connection then refuses one to another origin. Should the
 * network layer follow one anyway (Electron's `net.fetch` with `manual` has
 * not been seen here), the answer is turned back into the redirect it
 * followed, so the same refusal applies.
 */
export function redirectSafeFetch(base: McpFetch): McpFetch {
  return async (url, init) => {
    const response = await base(url, { ...init, redirect: 'manual' })
    if (response.type === 'opaqueredirect' || !response.redirected) return response
    await response.body?.cancel().catch(() => {})
    return new Response(null, { status: 307, headers: { location: response.url } })
  }
}
