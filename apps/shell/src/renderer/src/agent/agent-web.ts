import type { AgentActionView, AgentProjectPrefs } from '../../../shared/agent-api'
import type { AgentWebStringKey } from '../i18n/strings-agent-web'

/**
 * The web part of the agent window (spec 7): what a permission request offers
 * and when the Codex network warning shows. Kept out of the component so the
 * rules can be tested without a window.
 */

/** One answer a permission request offers, in the order the buttons appear */
export type AgentPermissionChoice = 'deny' | 'allow-session' | 'allow'

/**
 * A web search, a page of a known site, or a tool of the person's MCP server
 * (user MCP spec 9) may also be allowed for the rest of the session;
 * everything else is allowed or declined once.
 */
export function agentPermissionChoices(action: AgentActionView): AgentPermissionChoice[] {
  const lasting =
    action.kind === 'web-search' ||
    (action.kind === 'web-fetch' && Boolean(action.host)) ||
    action.kind === 'mcp-tool'
  return lasting ? ['deny', 'allow-session', 'allow'] : ['deny', 'allow']
}

/** The app's own MCP server, whose tools the window names by what they do */
const APP_MCP_SERVER = 'ieumoffice-editor'

/**
 * The person's MCP server and tool a program's tool line names, or undefined
 * for any other tool: Claude Code writes `mcp__<server>__<tool>`, Codex
 * `<server>:<tool>`. The app's own server is not one of them.
 */
export function agentUserMcpTool(
  action: AgentActionView,
): { server: string; tool: string } | undefined {
  if (action.kind === 'mcp-tool') {
    const server = action.server ?? ''
    const prefix = `mcp__${server}__`
    const tool = server && action.tool.startsWith(prefix) ? action.tool.slice(prefix.length) : ''
    return server ? { server, tool: tool || action.tool } : undefined
  }
  if (action.kind !== 'app-tool') return undefined
  const claude = /^mcp__(.+?)__(.+)$/.exec(action.tool)
  const codex = /^([^:]+):(.+)$/.exec(action.tool)
  const found = claude ?? codex
  if (!found || found[1] === APP_MCP_SERVER) return undefined
  return { server: found[1]!, tool: found[2]! }
}

/** The label of the "for this session" answer of a web request */
export function agentSessionAllowLabel(action: AgentActionView): AgentWebStringKey {
  return action.kind === 'web-search' ? 'permAllowSearchSession' : 'permAllowSiteSession'
}

/** What a permission request asks, for the web kinds; undefined for the others */
export function agentWebPermissionLabel(action: AgentActionView): AgentWebStringKey | undefined {
  if (action.kind === 'web-search') return 'permWebSearch'
  if (action.kind === 'web-fetch') return 'permWebFetch'
  return undefined
}

/** The warning about commands reaching the internet shows while that is on */
export function codexNetworkWarningShown(prefs: AgentProjectPrefs | null): boolean {
  return prefs?.codexNetwork === true
}
