import type { Lang } from '@genoffice/i18n'
import type { McpServerView } from '@genoffice/agent-core'
import { userMcpText, type UserMcpStringKey } from './strings-user-mcp'

/**
 * What the AI window shows about the person's MCP servers (user MCP spec
 * 7.4, 7.5, 12.2). Pure rules; the card and the server button only lay
 * them out.
 */

/** Characters of the input the permission card shows before "Show more" (spec 7.4) */
export const MCP_INPUT_PREVIEW_CHARS = 2000

/** The input a tool would be sent, as the person reads it; empty when there is none */
export function mcpInputText(input: Record<string, unknown>): string {
  if (Object.keys(input).length === 0) return ''
  try {
    return JSON.stringify(input, null, 2) ?? ''
  } catch {
    // an input that cannot be written as JSON still shows something readable
    return String(input)
  }
}

/**
 * The part of the input to show: the first 2,000 characters (whole code
 * points, so no character is split) and whether more remains, until the
 * person asks for all of it.
 */
export function mcpInputPreview(text: string, full: boolean): { text: string; more: boolean } {
  if (full || text.length <= MCP_INPUT_PREVIEW_CHARS) return { text, more: false }
  const chars = Array.from(text)
  if (chars.length <= MCP_INPUT_PREVIEW_CHARS) return { text, more: false }
  return { text: `${chars.slice(0, MCP_INPUT_PREVIEW_CHARS).join('')}…`, more: true }
}

const STATUS_KEYS: Record<McpServerView['status'], UserMcpStringKey> = {
  connected: 'statusConnected',
  ready: 'statusReady',
  unchecked: 'statusUnchecked',
  connecting: 'statusConnecting',
  failed: 'statusFailed',
  'login-required': 'statusLoginRequired',
  'review-required': 'statusReviewRequired',
  disabled: 'statusDisabled',
}

const REASON_KEYS: Record<NonNullable<McpServerView['failReason']>, UserMcpStringKey> = {
  unreachable: 'reasonUnreachable',
  'http-error': 'reasonHttpError',
  'runtime-missing': 'reasonRuntimeMissing',
  'start-failed': 'reasonStartFailed',
  'refused-redirect': 'reasonRefusedRedirect',
  'insecure-address': 'reasonInsecureAddress',
}

/**
 * A server's status in plain words, with the reason of a failure after it.
 * `offInChat`: the person turned it off for this conversation, which is what
 * the list says then (a server off in Settings still says so).
 */
export function mcpServerStatusText(
  lang: Lang,
  server: Pick<McpServerView, 'status' | 'failReason'>,
  offInChat = false,
): string {
  if (offInChat && server.status !== 'disabled') return userMcpText(lang, 'offInChat')
  const status = userMcpText(lang, STATUS_KEYS[server.status] ?? 'statusFailed')
  const reason =
    server.status === 'failed' && server.failReason ? REASON_KEYS[server.failReason] : undefined
  return reason ? `${status} · ${userMcpText(lang, reason)}` : status
}

/**
 * What the server list offers for a status: sign in again, review, check
 * (never checked) and turn on (off in Settings) open Settings at that
 * server; retry asks the shell to connect again.
 */
export type McpServerAction = 'login' | 'review' | 'retry' | 'check' | 'enable'

export function mcpServerAction(server: Pick<McpServerView, 'status'>): McpServerAction | null {
  switch (server.status) {
    case 'login-required':
      return 'login'
    case 'review-required':
      return 'review'
    case 'failed':
      return 'retry'
    case 'unchecked':
      return 'check'
    case 'disabled':
      return 'enable'
    default:
      return null
  }
}

/** Characters of a tool's description the permission card shows before "Show more" */
export const MCP_DESCRIPTION_PREVIEW_CHARS = 200

/** The first lines of a tool description, whole code points, and whether more remains */
export function mcpDescriptionPreview(
  text: string,
  full: boolean,
): { text: string; more: boolean } {
  const trimmed = text.trim()
  const chars = Array.from(trimmed)
  if (full || chars.length <= MCP_DESCRIPTION_PREVIEW_CHARS) return { text: trimmed, more: false }
  return { text: `${chars.slice(0, MCP_DESCRIPTION_PREVIEW_CHARS).join('')}…`, more: true }
}

/** The server button shows only while a registered server is on in Settings (spec 7.5) */
export function mcpServerButtonVisible(servers: readonly Pick<McpServerView, 'status'>[]): boolean {
  return servers.some((s) => s.status !== 'disabled')
}
