/**
 * The channels an AI window uses to reach the person's own MCP servers (user
 * MCP spec 5.1, 7). The shell's main process is the one MCP client and
 * answers them for every window; it lists the approved tool definitions from
 * `mcp-servers.json` and never sends a secret. Changing a server is not here:
 * that is Settings' own channel, which only the shell window can use.
 *
 * Node-free: the editors' sandboxed preloads load it.
 */

/** The global name the preloads expose the bridge under */
export const MCP_TOOLS_BRIDGE_KEY = 'aiOfficeMcpTools'

export const MCP_TOOLS_CHANNELS = {
  list: 'mcp-tools:list',
  call: 'mcp-tools:call',
  cancel: 'mcp-tools:cancel',
  retry: 'mcp-tools:retry',
  openSettings: 'mcp-tools:open-settings',
  /** main → every window: the list changed (no payload; ask `list` again) */
  changed: 'mcp-tools:changed',
} as const

/** The answer to a call that could not be made, in English for the model */
export interface McpToolRefusal {
  ok: false
  error: string
}

export interface McpToolCallRequest {
  /** the server's name as the AI window lists it */
  server: string
  /** the server's own tool name */
  tool: string
  input: Record<string, unknown>
  /** the window's id of this call, for `cancel` */
  callId: string
}

const NAME_MAX = 256
const CALL_ID_MAX = 200

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** A short non-empty text, or undefined */
function shortText(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined
}

export const mcpServerNameOf = (value: unknown): string | undefined => shortText(value, NAME_MAX)
export const mcpCallIdOf = (value: unknown): string | undefined => shortText(value, CALL_ID_MAX)

/** A call request as it crossed from a window; undefined when it is malformed */
export function mcpToolCallRequestOf(raw: unknown): McpToolCallRequest | undefined {
  if (!isRecord(raw)) return undefined
  const server = mcpServerNameOf(raw.server)
  const tool = shortText(raw.tool, NAME_MAX)
  const callId = mcpCallIdOf(raw.callId)
  const input = raw.input === undefined ? {} : raw.input
  if (!server || !tool || !callId || !isRecord(input)) return undefined
  return { server, tool, input, callId }
}
