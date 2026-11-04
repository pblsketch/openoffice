import type { AgentToolCall } from './types'
import { isMcpToolName } from './user-mcp/names'

/** Tools that send model-chosen text to, or fetch from, somewhere off the PC */
export const OUTBOUND_TOOLS: ReadonlySet<string> = new Set([
  'web_search',
  'image_search',
  'generate_image',
  'transform_image',
  'remove_image_background',
  'analyze_media',
  'insert_web_image',
  'read_url',
])

/** Input fields an editor fetches when they hold a web address */
const FETCHED_FIELDS = new Set(['url', 'src', 'imageUrl', 'image_url'])

function fetchesAddress(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === null || typeof value !== 'object') return false
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (FETCHED_FIELDS.has(key) && typeof inner === 'string' && /^\s*https?:/i.test(inner)) {
      return true
    }
    if (typeof inner === 'object' && fetchesAddress(inner, depth + 1)) return true
  }
  return false
}

/**
 * Whether a tool reaches off the PC by its name alone: the outbound tools and
 * every user MCP server's tool (`mcp__` prefix, user MCP spec 7.2), whatever
 * the server is, so no list of registered servers is needed to tell.
 */
export function isOutboundToolName(name: string): boolean {
  return OUTBOUND_TOOLS.has(name) || isMcpToolName(name)
}

/** Whether a call would carry text or an address off the PC */
export function isOutboundCall(call: AgentToolCall): boolean {
  return isOutboundToolName(call.name) || fetchesAddress(call.input)
}
