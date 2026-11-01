/**
 * User MCP servers between the shell's main process and its screens (user
 * MCP spec 12). The value sets, the status the card shows and the
 * renderer-safe view of a registered server. Secrets never cross this
 * boundary: a screen sees whether a value is saved and its last four
 * characters, nothing more.
 */

import type { ToolNameProblem } from '@genoffice/agent-core/user-mcp/names'

/** How a tool may run (12.2) */
export const MCP_PERMISSIONS = ['always', 'ask', 'off'] as const
export type McpPermission = (typeof MCP_PERMISSIONS)[number]

/** A stored or pasted permission; anything unknown reads as `ask` */
export function permissionOf(value: unknown): McpPermission {
  return value === 'always' || value === 'off' ? value : 'ask'
}

/** `remote`: reached by address; `local`: a program the app starts on this PC */
export type McpServerKind = 'remote' | 'local'
/** `auto`: Streamable HTTP, then SSE; `sse`: SSE only (a pasted `type: sse`) */
export type McpTransport = 'auto' | 'sse'

/** The hints a server puts on a tool; display only, never trusted for safety */
export interface McpToolAnnotations {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
  [key: string]: unknown
}

/** What the AI window declares to the model for one tool */
export interface McpToolDefinition {
  description: string
  inputSchema: Record<string, unknown>
  annotations?: McpToolAnnotations
}

/** One tool of a registered server, keyed by the name the server reported */
export interface McpToolEntry {
  permission: McpPermission
  /** fingerprint of the approved definition (`sha256:…`) */
  approved: string
  /** the approved definition */
  definition: McpToolDefinition
  /** a changed definition awaiting approval, or null */
  pending: McpToolDefinition | null
}

/** The approved server instructions, kept so they can be used before connecting */
export interface McpInstructions {
  approved: string
  text: string
}

/** Why a server could not be reached or started (12.2) */
export type McpFailReason =
  'unreachable' | 'runtime-missing' | 'start-failed' | 'refused-redirect' | 'insecure-address'

/** The one status a server card shows (12.2) */
export type McpServerStatusInfo =
  | { status: 'connected' }
  | { status: 'connecting' }
  | { status: 'failed'; reason: McpFailReason }
  | { status: 'login-required' }
  | { status: 'review-required'; what: 'command' }
  | { status: 'disabled' }

/** What is true of a server right now; `serverStatusOf` picks what shows */
export interface McpServerStatusFacts {
  enabled: boolean
  /** a local server whose command, arguments or env names changed since approval */
  commandReviewNeeded: boolean
  /** the server asked for a login that has not happened or whose refresh failed */
  loginRequired: boolean
  /** the last connection attempt failed, or null */
  failure: McpFailReason | null
  connecting: boolean
}

/**
 * The single status shown when several apply: disabled > review-required
 * (command) > login-required > failed > connecting > connected. Tool and
 * instruction reviews are shown apart from the server status.
 */
export function serverStatusOf(facts: McpServerStatusFacts): McpServerStatusInfo {
  if (!facts.enabled) return { status: 'disabled' }
  if (facts.commandReviewNeeded) return { status: 'review-required', what: 'command' }
  if (facts.loginRequired) return { status: 'login-required' }
  if (facts.failure) return { status: 'failed', reason: facts.failure }
  if (facts.connecting) return { status: 'connecting' }
  return { status: 'connected' }
}

/** How one tool row shows: usable, waiting for review, or never usable by its name */
export type McpToolDisplay =
  { display: 'ok' } | { display: 'review' } | { display: 'unusable'; reason: ToolNameProblem }

/** A name that cannot work outranks a pending change: approving would not help */
export function toolDisplayOf(
  tool: Pick<McpToolEntry, 'pending'>,
  nameProblem: ToolNameProblem | null,
): McpToolDisplay {
  if (nameProblem) return { display: 'unusable', reason: nameProblem }
  if (tool.pending) return { display: 'review' }
  return { display: 'ok' }
}

/**
 * One secret as a screen may see it. `memory-only`: saved for this run only,
 * because this PC cannot seal it; `missing`: empty (never entered, lost at the
 * last restart, or sealed by another PC or account).
 */
export interface McpSecretView {
  state: 'saved' | 'memory-only' | 'missing'
  /** the last four characters, or '' when the value is too short to show any */
  last4: string
}

/**
 * A registered server for the settings screen, with its secrets reduced to
 * views. Not the AI windows' `McpServerView` of agent-core, which carries the
 * approved tools only.
 */
export interface McpServerRecordView {
  id: string
  name: string
  kind: McpServerKind
  enabled: boolean
  keepResultsInside: boolean
  url: string
  transport: McpTransport
  headers: Record<string, McpSecretView>
  oauth: { clientId: string; clientSecret: McpSecretView; signedIn: boolean } | null
  command: string
  args: string[]
  env: Record<string, McpSecretView>
  /** the command, arguments or env names differ from what the person approved */
  launchReviewNeeded: boolean
  instructions: McpInstructions | null
  pendingInstructions: string | null
  tools: Record<string, McpToolEntry>
  newTools: string[]
  /** some secret of this server lives only until the app closes */
  secretsMemoryOnly: boolean
}

export interface McpServersView {
  /** this PC seals secrets; when false, cards say they must be entered again after a restart */
  sealing: boolean
  runtimes: Record<string, { allowed: boolean }>
  servers: McpServerRecordView[]
}

// ---- the settings channel ---------------------------------------------------

/**
 * Settings → Integrations talks to the main process over these channels. Only
 * the shell window's preload exposes them (as `window.aiOfficeMcpServers`),
 * and the main process answers only the shell window: an editor or the agent
 * window can neither change a server nor read its settings, the same rule as
 * the subscription logout. The AI windows use `mcp-tools:*` instead.
 */
export const MCP_SERVERS_SETTINGS_KEY = 'aiOfficeMcpServers'

export const MCP_SERVERS_CHANNELS = {
  list: 'mcp-servers:list',
  /** main → the shell window: the list changed (payload: `McpServersSettingsView`) */
  changed: 'mcp-servers:changed',
  /** main → the shell window: show this server's card (payload: the server id) */
  openServer: 'mcp-servers:open-server',
  parsePaste: 'mcp-servers:parse-paste',
  add: 'mcp-servers:add',
  edit: 'mcp-servers:edit',
  remove: 'mcp-servers:remove',
  test: 'mcp-servers:test',
  signIn: 'mcp-servers:sign-in',
  cancelSignIn: 'mcp-servers:cancel-sign-in',
  approveTool: 'mcp-servers:approve-tool',
  approveInstructions: 'mcp-servers:approve-instructions',
  approveLaunch: 'mcp-servers:approve-launch',
  setToolPermission: 'mcp-servers:set-tool-permission',
  setKeepResultsInside: 'mcp-servers:set-keep-results-inside',
  setEnabled: 'mcp-servers:set-enabled',
  markToolsSeen: 'mcp-servers:mark-tools-seen',
  plannedLaunch: 'mcp-servers:planned-launch',
  answerRuntimeDownload: 'mcp-servers:answer-runtime-download',
  retry: 'mcp-servers:retry',
} as const

/** What changed and waits for the person's review */
export type McpReviewSubject = 'tools' | 'instructions' | 'command'

/** The name a tool has in the AI windows (6.1) */
export interface McpToolNameView {
  /** `mcp__<server>__<tool>` */
  exposedName: string
  /** characters were replaced: show the new name */
  changed: boolean
  /** why the tool cannot be turned on, or null */
  problem: ToolNameProblem | null
}

/** A registered server as the settings card shows it */
export interface McpServerSettingsView extends McpServerRecordView {
  status: McpServerStatusInfo
  /** what waits for review: changed tools, changed instructions, a changed command */
  review: McpReviewSubject[]
  /** per tool, keyed like `tools` */
  toolNames: Record<string, McpToolNameView>
  /**
   * A "my PC" server that could not start: why, in the person's language, and
   * the last lines it wrote to standard error (kept in memory only, 5.3).
   */
  failure: { text: string; stderrTail: string[] } | null
}

export interface McpServersSettingsView {
  sealing: boolean
  runtimes: Record<string, { allowed: boolean }>
  servers: McpServerSettingsView[]
}

/** A runtime the app can download for "my PC" servers (5.4) */
export type McpRuntimeId = 'node' | 'uv' | 'python'

/** The question before a runtime download (5.4), with the real sizes */
export interface McpRuntimeQuestion {
  /** the server's command, e.g. `npx` */
  command: string
  runtime: McpRuntimeId
  downloads: { runtime: McpRuntimeId; version: string; bytes: number }[]
  totalBytes: number
  /** the person allowed these downloads before: no need to ask again */
  allowed: boolean
}

/**
 * A server as the registration screen sends it. Secret fields take `null` for
 * "keep the value already held": the stored one when editing, the pasted one
 * when adding from a paste. Values never come back to the screen.
 */
export interface McpServerInput {
  name: string
  kind: McpServerKind
  url?: string
  transport?: McpTransport
  /** the key field, sent as `Authorization: Bearer <key>`; '' removes it; null keeps it */
  key?: string | null
  headers?: Record<string, string | null>
  /** the client for sign-in under "advanced"; null for none */
  oauthClient?: { clientId: string; clientSecret: string | null } | null
  command?: string
  args?: string[]
  env?: Record<string, string | null>
  /** the person confirmed plain http to this PC or a private address (4.3) */
  allowPlainHttp?: boolean
  /** the pasted server this one came from (`parsePaste`), for the values it held */
  paste?: { token: string; index: number }
}

/** An edit: the fields that change (the kind cannot) */
export type McpServerPatch = Partial<Omit<McpServerInput, 'kind' | 'paste'>>

/**
 * name: the name breaks the rule (detail: the problem); name-taken: another
 * server has it; address: the address is not allowed (detail: the problem);
 * plain-http-unconfirmed: plain http was not confirmed; paste-expired: the
 * pasted text is no longer held; not-remote / not-local: the action needs the
 * other kind; invalid: the request was malformed (detail: the field);
 * launch-changed: the command to run is no longer the one the person was
 * shown (show the new plan and ask again).
 */
export type McpSettingsProblem =
  | 'not-found'
  | 'invalid'
  | 'name'
  | 'name-taken'
  | 'address'
  | 'plain-http-unconfirmed'
  | 'paste-expired'
  | 'not-remote'
  | 'not-local'
  | 'failed'
  | 'launch-changed'

export type McpSettingsResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; problem: McpSettingsProblem; detail?: string }

/** A pasted server for the registration screen; its secret values stay in the main process */
export interface McpPastedServerView {
  pastedName: string
  name: string
  nameChanged: boolean
  kind: McpServerKind
  url: string
  transport: McpTransport
  headers: Record<string, McpSecretView>
  command: string
  args: string[]
  env: Record<string, McpSecretView>
  keyNeeded: boolean
  keyEnvVar: string | null
  ignored: string[]
  problem: 'no-target' | 'unsupported-type' | null
}

export type McpPasteView =
  | {
      ok: true
      /** hand back in `McpServerInput.paste` to keep the pasted values */
      token: string
      format: 'json' | 'json-bare' | 'toml'
      servers: McpPastedServerView[]
      ignored: string[]
    }
  | { ok: false; error: 'empty' | 'unreadable' | 'no-servers' }

/**
 * "Connection check" (4.6). runtime-download: a runtime must be downloaded
 * first (ask with `question`, answer with `answerRuntimeDownload`);
 * launch-not-approved: the command must be allowed first; failed: with the
 * reason, and for a "my PC" server the reason view's text.
 */
export type McpTestResult =
  | { ok: true; toolCount: number }
  | { ok: false; problem: 'not-found' | 'disabled' | 'launch-not-approved' | 'login-required' }
  | { ok: false; problem: 'runtime-download'; question: McpRuntimeQuestion }
  | { ok: false; problem: 'failed'; reason: McpFailReason; text: string | null }

/**
 * The browser sign-in (4.8). key-in-use: the server is set up with a pasted
 * key (an `Authorization` header); say "enter the key again" instead.
 */
export type McpSignInAnswer =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'not-found'
        | 'not-remote'
        | 'cancelled'
        | 'timeout'
        | 'denied'
        | 'not-supported'
        | 'client-required'
        | 'network'
        | 'insecure-address'
        | 'key-in-use'
    }

/** What the command confirmation shows (4.5); variable values are never part of it */
export type McpPlannedLaunchView =
  | {
      ok: true
      /** what `approveLaunch` brings back, so the approval is of exactly this plan */
      fingerprint: string
      command: string
      args: string[]
      addedArgs: string[]
      env: { name: string; origin: 'system' | 'registered' | 'app' }[]
      droppedEnv: string[]
      source: 'pc' | 'app'
      runtime: McpRuntimeId | null
    }
  | {
      ok: false
      problem: 'empty-command' | 'runtime-missing' | 'needs-command-window' | 'not-a-program'
      /** in the person's language */
      text: string
      /** a runtime the app can download, when that is what is missing */
      question: McpRuntimeQuestion | null
    }

export type McpPlannedLaunchAnswer =
  { ok: true; launch: McpPlannedLaunchView } | { ok: false; problem: 'not-found' | 'not-local' }

/** What the settings screen calls: `window.aiOfficeMcpServers`, in the shell window only */
export interface McpServersApi {
  list(): Promise<McpServersSettingsView>
  onChanged(listener: (view: McpServersSettingsView) => void): () => void
  /** an AI window asked to show this server in Settings */
  onOpenServer(listener: (serverId: string) => void): () => void
  parsePaste(text: string): Promise<McpPasteView>
  add(input: McpServerInput): Promise<McpSettingsResult<{ id: string }>>
  edit(id: string, patch: McpServerPatch): Promise<McpSettingsResult>
  /** revokes the sign-in when the server offers it, forgets every secret, ends a running server */
  remove(id: string): Promise<McpSettingsResult>
  /** connect and read the tool list; a first list is approved as shown (4.6) */
  test(id: string): Promise<McpTestResult>
  signIn(id: string): Promise<McpSignInAnswer>
  cancelSignIn(id: string): Promise<void>
  approveTool(id: string, tool: string): Promise<McpSettingsResult>
  approveInstructions(id: string): Promise<McpSettingsResult>
  /**
   * The person pressed "allow" under the command `plannedLaunch` showed, whose
   * `fingerprint` comes back here; `launch-changed` when that is no longer
   * the command that would run
   */
  approveLaunch(id: string, planFingerprint: string): Promise<McpSettingsResult>
  setToolPermission(id: string, tool: string, permission: McpPermission): Promise<McpSettingsResult>
  setKeepResultsInside(id: string, on: boolean): Promise<McpSettingsResult>
  setEnabled(id: string, on: boolean): Promise<McpSettingsResult>
  /** the person opened this server's tool list: "n new tools" goes */
  markToolsSeen(id: string): Promise<McpSettingsResult>
  plannedLaunch(id: string): Promise<McpPlannedLaunchAnswer>
  /** the answer to a `McpRuntimeQuestion`; a download answers with the new planned launch */
  answerRuntimeDownload(id: string, download: boolean): Promise<McpPlannedLaunchAnswer>
  /** clear a failure (and the three-failure lock) so the next use tries again */
  retry(id: string): Promise<McpSettingsResult>
}
