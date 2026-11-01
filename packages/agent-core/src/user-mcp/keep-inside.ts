import { isOutboundCall } from '../outbound'
import type { AgentSkill } from '../skill'
import type { AgentMessage, AgentToolCall, ToolExecution } from '../types'
import { isMcpToolName, parseMcpToolName } from './names'

/**
 * "Keep received content inside" (user MCP spec 7.2), the Drive guard's
 * counterpart for user MCP servers.
 *
 * Once a non-error result of a server S with the setting on is in the
 * conversation, every outbound call that is not S's own is refused until a
 * new chat: web tools, calls that fetch an address, and other servers' tools.
 * S's tools stay callable. When two or more such servers hold content, a call
 * to any one of them is a call to "another server" for the others' content,
 * so all of them are refused. A conversation reopened from disk restores the
 * block from its history; an empty history (a new chat) clears it. Turning
 * the setting off mid-conversation does not lift a block already in place
 * (spec 13).
 */

export interface ReceivedContentGuardDeps {
  /**
   * Whether the server of this name keeps what it returns inside, read live.
   * For a name it does not know (a server removed since), answering true is
   * the safe side: the setting is on by default.
   */
  keepsInside(server: string): boolean
  /** the conversation so far (the loop's history, restored transcripts included) */
  messages(): readonly AgentMessage[]
}

export interface ReceivedContentGuardedSkill extends AgentSkill {
  /** keep-inside servers whose content is in this conversation, in arrival order */
  readonly keptInsideServers: ReadonlySet<string>
}

/** The server of a successful user MCP result that the setting keeps inside, or null */
function keptServerOf(
  name: string,
  isError: boolean | undefined,
  keepsInside: (server: string) => boolean,
): string | null {
  if (isError || !isMcpToolName(name)) return null
  const server = parseMcpToolName(name)?.server
  return server !== undefined && keepsInside(server) ? server : null
}

/** Keep-inside servers whose non-error results stand in a conversation, in order of first result */
export function keptInsideServersIn(
  history: readonly AgentMessage[],
  keepsInside: (server: string) => boolean,
): Set<string> {
  const found = new Set<string>()
  for (const m of history) {
    if (m.role !== 'tool') continue
    for (const r of m.results) {
      const server = keptServerOf(r.name, r.isError, keepsInside)
      if (server !== null) found.add(server)
    }
  }
  return found
}

/** The refusal the AI gets, naming the servers whose content caused it */
export function keepInsideRefusalText(servers: readonly string[]): string {
  const named = servers.map((s) => `"${s}"`).join(', ')
  const which = servers.length === 1 ? `the MCP server ${named}` : `the MCP servers ${named}`
  return (
    `Refused: this conversation contains content returned by ${which}, which is set to keep ` +
    'what it returns inside, so tools that send text or fetch addresses outside this PC (web ' +
    'tools and other MCP servers’ tools) are off until a new chat. Continue without it, and ' +
    'tell the user they can start a new chat to use it again.'
  )
}

/**
 * Why a call is refused while `held` servers' content is in the conversation,
 * or null when it may run: calls that stay on the PC always may, and a call
 * to a held server is refused only for the other held servers' content.
 */
export function keepInsideRefusal(call: AgentToolCall, held: ReadonlySet<string>): string | null {
  if (held.size === 0 || !isOutboundCall(call)) return null
  const target = parseMcpToolName(call.name)?.server
  const blockers = [...held].filter((s) => s !== target)
  return blockers.length === 0 ? null : keepInsideRefusalText(blockers)
}

/**
 * Wrap a composed skill with the keep-inside rule. Getters stay live: the
 * composed skill's tools and prompt are read through on every access, and the
 * tool list is not narrowed (a refused call tells the AI why).
 */
export function guardReceivedContent(
  skill: AgentSkill,
  deps: ReceivedContentGuardDeps,
): ReceivedContentGuardedSkill {
  let held = new Set<string>()

  const record = (call: AgentToolCall, result: ToolExecution): ToolExecution => {
    const server = keptServerOf(call.name, result.isError, deps.keepsInside)
    if (server !== null) held.add(server)
    return result
  }

  return {
    id: skill.id,
    get systemPrompt() {
      return skill.systemPrompt
    },
    get tools() {
      return skill.tools
    },
    get keptInsideServers() {
      return held
    },
    buildContext: () => {
      // run start: a new chat holds nothing; a transcript restored from disk
      // may hold content received in an earlier session
      const history = deps.messages()
      if (history.length === 0) held = new Set()
      else for (const s of keptInsideServersIn(history, deps.keepsInside)) held.add(s)
      return skill.buildContext?.() ?? ''
    },
    executeTool: (call, signal) => {
      const refusal = keepInsideRefusal(call, held)
      if (refusal !== null) return { output: refusal, isError: true, summary: call.name }
      const result = skill.executeTool(call, signal)
      if (!isMcpToolName(call.name)) return result
      return result instanceof Promise ? result.then((r) => record(call, r)) : record(call, result)
    },
    ...(skill.verifyResponse ? { verifyResponse: skill.verifyResponse.bind(skill) } : {}),
  }
}
