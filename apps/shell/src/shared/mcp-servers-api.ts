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
export type McpServerStatus =
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
export function serverStatusOf(facts: McpServerStatusFacts): McpServerStatus {
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

/** A registered server for the settings screen, with its secrets reduced to views */
export interface McpServerView {
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
  servers: McpServerView[]
}
