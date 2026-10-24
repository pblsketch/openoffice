import { OUTBOUND_TOOLS, isOutboundCall } from './outbound'
import type { AgentSkill } from './skill'
import type { AgentMessage, AgentToolCall, ToolExecution } from './types'

/**
 * The person's say over what leaves the PC through the AI's tools (decision 0062).
 *
 * Two rules on top of every editor's composed skill:
 * - "Let AI use internet tools" off: the outbound tools leave the tool list
 *   and any call that would still reach off the PC is refused.
 * - An address the AI wants to fetch must already stand, character for
 *   character, in the conversation: in the person's messages or in a tool
 *   result (search results, a page or file it read). Anything else is put to
 *   the person first. Smuggling document text out needs a new address built
 *   around that text, and such an address appears nowhere before the call.
 * Search queries are not asked about: they reach only the search service.
 */

export interface OutboundBridgeLike {
  /** the setting "Let AI use internet tools" (absent in the file = on) */
  internetToolsEnabled(): Promise<boolean>
  onInternetToolsChanged?(listener: (on: boolean) => void): () => void
  /** asks the person whether the tool may fetch these addresses; false on any failure */
  confirmAddresses(tool: string, addresses: string[]): Promise<boolean>
}

export const INTERNET_TOOLS_OFF =
  'Refused: the person turned off internet tools for the AI in Settings, so nothing is sent to ' +
  'or fetched from outside this PC. Continue without it, and tell the user they can turn ' +
  '"Let AI use internet tools" back on in Settings.'

export const ADDRESS_DECLINED =
  'Refused: the person did not allow fetching this address. Do not try it again in another ' +
  'form; continue without it.'

/** Input fields that hold one address, and the one that holds a list (analyze_media) */
const ADDRESS_FIELDS = new Set(['url', 'src', 'imageUrl', 'image_url'])
const ADDRESS_LIST_FIELDS = new Set(['mediaUrls'])

const isWebAddress = (v: unknown): v is string => typeof v === 'string' && /^\s*https?:/i.test(v)

/** The web addresses a call would fetch, trimmed, in order, without repeats */
export function fetchedAddresses(input: unknown): string[] {
  const found: string[] = []
  const walk = (value: unknown, depth: number) => {
    if (depth > 6 || value === null || typeof value !== 'object') return
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (ADDRESS_FIELDS.has(key) && isWebAddress(inner)) found.push(inner.trim())
      else if (ADDRESS_LIST_FIELDS.has(key) && Array.isArray(inner)) {
        for (const item of inner) if (isWebAddress(item)) found.push(item.trim())
      } else if (typeof inner === 'object') walk(inner, depth + 1)
    }
  }
  walk(input, 0)
  return [...new Set(found)]
}

/**
 * Whether the address already stands in text the AI did not write: the
 * person's messages and tool results. The AI's own replies do not count, or
 * it could vouch for an address by writing it first.
 */
export function addressInConversation(address: string, history: readonly AgentMessage[]): boolean {
  return history.some((m) =>
    m.role === 'user'
      ? m.text.includes(address)
      : m.role === 'tool' && m.results.some((r) => r.output.includes(address)),
  )
}

/** The outbound bridge the editor's preload exposed as `window.aiOfficeOutbound`, if any */
export function windowOutboundBridge(): OutboundBridgeLike | null {
  const b = (globalThis as { aiOfficeOutbound?: Partial<OutboundBridgeLike> }).aiOfficeOutbound
  return typeof b?.internetToolsEnabled === 'function' && typeof b.confirmAddresses === 'function'
    ? (b as OutboundBridgeLike)
    : null
}

/**
 * Wrap a composed skill with both rules. Without a bridge (a test, an older
 * preload) the skill is returned as it is. The switch is cached for the
 * synchronous tool list and asked again before each outbound call.
 */
export function guardOutbound(
  skill: AgentSkill,
  bridge: OutboundBridgeLike | null,
  messages: () => readonly AgentMessage[],
): AgentSkill {
  if (!bridge) return skill
  const main = bridge
  // off until the main process answers: the first request must not reach out before it is known
  let on = false
  void main.internetToolsEnabled().then(
    (value) => (on = value === true),
    () => (on = false),
  )
  main.onInternetToolsChanged?.((value) => (on = value))
  /** addresses the person allowed, for the conversation they were allowed in */
  let allowed = new Set<string>()
  let allowedFor: AgentMessage | undefined

  const refuse = (call: AgentToolCall, output: string): ToolExecution => ({
    output,
    isError: true,
    summary: call.name,
  })

  return {
    id: skill.id,
    get systemPrompt() {
      return skill.systemPrompt
    },
    get tools() {
      return on ? skill.tools : skill.tools.filter((t) => !OUTBOUND_TOOLS.has(t.name))
    },
    buildContext: () => skill.buildContext?.() ?? '',
    executeTool: (call, signal) => {
      const addresses = fetchedAddresses(call.input)
      // calls that stay on the PC run exactly as before, synchronously if they were
      if (!isOutboundCall(call) && addresses.length === 0) return skill.executeTool(call, signal)
      return checked(call, addresses, signal)
    },
    ...(skill.verifyResponse ? { verifyResponse: skill.verifyResponse.bind(skill) } : {}),
  }

  async function checked(
    call: AgentToolCall,
    addresses: string[],
    signal: AbortSignal | undefined,
  ): Promise<ToolExecution> {
    on = await main.internetToolsEnabled().catch(() => false)
    if (!on) return refuse(call, INTERNET_TOOLS_OFF)
    const history = messages()
    // a new conversation starts with nothing allowed
    if (history[0] !== allowedFor) {
      allowed = new Set()
      allowedFor = history[0]
    }
    const unknown = addresses.filter((a) => !allowed.has(a) && !addressInConversation(a, history))
    if (unknown.length > 0) {
      const yes = await main.confirmAddresses(call.name, unknown).catch(() => false)
      if (yes !== true) return refuse(call, ADDRESS_DECLINED)
      for (const a of unknown) allowed.add(a)
    }
    return skill.executeTool(call, signal)
  }
}
