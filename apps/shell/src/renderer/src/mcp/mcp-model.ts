import type { ServerNameProblem, ToolNameProblem } from '@genoffice/agent-core/user-mcp/names'
import {
  isNearAddress,
  toolDisplayOf,
  type McpFailReason,
  type McpPermission,
  type McpRuntimeId,
  type McpSecretView,
  type McpServerSettingsView,
  type McpServerStatusInfo,
  type McpServersApi,
  type McpServersSettingsView,
  type McpSettingsProblem,
  type McpSignInAnswer,
} from '../../../shared/mcp-servers-api'
import type { McpServersStringKey } from '../i18n/strings-mcp-servers'

/**
 * Pure helpers of the MCP server card (user MCP spec 4): which text a status,
 * a failure or a refusal shows, the counts on a server row, sizes in the
 * person's locale. No React here, so tests and other panes can share them.
 */

declare global {
  interface Window {
    /** Settings → Integrations → MCP servers (src/preload/index.ts), shell window only */
    aiOfficeMcpServers?: McpServersApi
  }
}

export const mcpServersApi = (): McpServersApi | undefined => window.aiOfficeMcpServers

export const STATUS_KEYS: Record<McpServerStatusInfo['status'], McpServersStringKey> = {
  connected: 'statusConnected',
  ready: 'statusReady',
  unchecked: 'statusUnchecked',
  connecting: 'statusConnecting',
  failed: 'statusFailed',
  'login-required': 'statusLogin',
  'review-required': 'statusReview',
  disabled: 'statusDisabled',
}

export const FAIL_KEYS: Record<McpFailReason, McpServersStringKey> = {
  unreachable: 'failUnreachable',
  'http-error': 'failHttpError',
  'runtime-missing': 'failRuntimeMissing',
  'start-failed': 'failStartFailed',
  'refused-redirect': 'failRedirect',
  'insecure-address': 'failInsecure',
}

export const TOOL_PROBLEM_KEYS: Record<ToolNameProblem, McpServersStringKey> = {
  empty: 'toolUnusableEmpty',
  'too-long': 'toolUnusableLong',
  collision: 'toolUnusableCollision',
  'server-name': 'toolUnusableServer',
}

export const NAME_PROBLEM_KEYS: Record<ServerNameProblem, McpServersStringKey> = {
  empty: 'nameEmpty',
  'too-long': 'nameTooLong',
  'bad-char': 'nameBadChar',
  'double-underscore': 'nameDouble',
  'edge-underscore': 'nameEdge',
  reserved: 'nameReserved',
}

export const PERMISSION_KEYS: Record<McpPermission, McpServersStringKey> = {
  always: 'permAlways',
  ask: 'permAsk',
  off: 'permOff',
}

/** The runtimes by the names their makers give them */
export const RUNTIME_NAMES: Record<McpRuntimeId, string> = {
  node: 'Node.js',
  uv: 'uv',
  python: 'Python',
}

/** What a sign-in answer tells the person, and whether the edit form should open */
export function signInOutcome(answer: McpSignInAnswer): {
  key: McpServersStringKey
  open: 'key' | 'advanced' | null
} {
  if (answer.ok) return { key: 'signedIn', open: null }
  switch (answer.reason) {
    case 'key-in-use':
      return { key: 'signInKeyInUse', open: 'key' }
    case 'client-required':
    case 'not-supported':
      return { key: 'signInClient', open: 'advanced' }
    case 'cancelled':
      return { key: 'signInCancelled', open: null }
    case 'timeout':
      return { key: 'signInTimeout', open: null }
    case 'denied':
      return { key: 'signInDenied', open: null }
    case 'network':
      return { key: 'signInNetwork', open: null }
    case 'insecure-address':
      return { key: 'signInInsecure', open: null }
    default:
      return { key: 'signInFailed', open: null }
  }
}

/** The text of a refused add or edit */
export function settingsProblemKey(
  problem: McpSettingsProblem,
  detail: string | undefined,
): McpServersStringKey {
  switch (problem) {
    case 'name':
      return detail && detail in NAME_PROBLEM_KEYS
        ? NAME_PROBLEM_KEYS[detail as ServerNameProblem]
        : 'nameBadChar'
    case 'name-taken':
      return 'nameTaken'
    case 'address':
      if (detail === 'public-http') return 'addrPublicHttp'
      if (detail === 'unresolved') return 'addrUnresolved'
      return 'addrInvalid'
    case 'plain-http-unconfirmed':
      return 'httpWarn'
    case 'paste-expired':
      return 'pasteExpired'
    case 'invalid':
      if (detail === 'headers') return 'invalidHeaders'
      if (detail === 'env') return 'invalidEnv'
      if (detail === 'command') return 'invalidCommand'
      return 'invalidOther'
    default:
      return 'saveFailed'
  }
}

/** The servers a skill may count on: registered and turned on (skills list mark, spec 8) */
export function usableMcpServerNames(view: McpServersSettingsView | null): ReadonlySet<string> {
  return new Set((view?.servers ?? []).filter((s) => s.enabled).map((s) => s.name))
}

/** Tools the AI windows may offer: not turned off, usable by name, nothing waiting for review */
export function enabledToolCount(server: McpServerSettingsView): number {
  return Object.entries(server.tools).filter(
    ([name, tool]) =>
      tool.permission !== 'off' &&
      toolDisplayOf(tool, server.toolNames[name]?.problem ?? null).display === 'ok',
  ).length
}

/** Changed tools and a changed guide waiting for the person (the command shows as the status) */
export function reviewCount(server: McpServerSettingsView): number {
  const tools = Object.values(server.tools).filter((tool) => tool.pending !== null).length
  return tools + (server.pendingInstructions !== null ? 1 : 0)
}

/** Bytes as megabytes in the person's locale, one decimal at most */
export function formatBytes(bytes: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'megabyte',
    maximumFractionDigits: 1,
  }).format(bytes / (1024 * 1024))
}

/**
 * Which arguments of a planned launch the app put there: everything before the
 * server's own arguments (the runtime's script, `--yes`). When the tail does
 * not match, fall back to the arguments the plan names as added.
 */
export function appAddedArgs(
  launchArgs: readonly string[],
  addedArgs: readonly string[],
  serverArgs: readonly string[],
): boolean[] {
  const prefix = launchArgs.length - serverArgs.length
  const tailMatches = prefix >= 0 && serverArgs.every((arg, i) => launchArgs[prefix + i] === arg)
  if (tailMatches) return launchArgs.map((_, i) => i < prefix)
  const added = new Set(addedArgs)
  return launchArgs.map((arg) => added.has(arg))
}

/** How a secret shows: never the value, only whether it is held and its last four characters */
export function secretPlaceholderKey(
  view: McpSecretView,
  from: 'saved' | 'pasted',
): { key: McpServersStringKey; last4: string } {
  if (view.state === 'missing') return { key: 'secretMissing', last4: '' }
  if (view.state === 'memory-only') return { key: 'secretMemory', last4: view.last4 }
  if (from === 'pasted') {
    return { key: view.last4 ? 'secretPasted' : 'secretPastedNoTail', last4: view.last4 }
  }
  return { key: view.last4 ? 'secretSaved' : 'secretSavedNoTail', last4: view.last4 }
}

/** Whether an address is plain http (the warning and the confirmation of 4.3) */
export const isPlainHttp = (url: string): boolean => /^\s*http:\/\//i.test(url)

/**
 * The text of a failure the card shows once: a "my PC" server's own reason
 * from the main process, else the reason's words. A server that could not
 * be reached at an address on this PC or a private network is not blamed on
 * the internet connection.
 */
export function failureTextKey(server: McpServerSettingsView): McpServersStringKey | null {
  if (server.status.status !== 'failed') return null
  const reason = server.status.reason
  if (reason === 'unreachable' && server.kind === 'remote' && isNearAddress(server.url)) {
    return 'failUnreachableNear'
  }
  return FAIL_KEYS[reason]
}

/** The test answer's reason as the card says it, the same way as `failureTextKey` */
export function testFailureKey(
  reason: McpFailReason,
  server: Pick<McpServerSettingsView, 'kind' | 'url'>,
): McpServersStringKey {
  if (reason === 'unreachable' && server.kind === 'remote' && isNearAddress(server.url)) {
    return 'failUnreachableNear'
  }
  return FAIL_KEYS[reason]
}

/** The system variables of a planned launch go last, folded; what the person set comes first */
export function launchEnvGroups<T extends { origin: 'system' | 'registered' | 'app' }>(
  env: readonly T[],
): { own: T[]; system: T[] } {
  return {
    own: env.filter((v) => v.origin !== 'system'),
    system: env.filter((v) => v.origin === 'system'),
  }
}
