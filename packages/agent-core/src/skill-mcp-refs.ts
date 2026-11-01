/**
 * The MCP servers a skill expects, and the note that goes after a skill's
 * text on its way to the model (spec 8).
 *
 * A skill may call MCP tools (`mcp__<server>__<tool>`) in its body or list
 * them under the front matter's `allowed-tools`. The regular AI panels have
 * no MCP server, and any tool call can fail, so the model is told to say
 * which step it could not do instead of writing as if it did it.
 *
 * A file with no imports, exported as `@genoffice/agent-core/skill-mcp-refs`:
 * `@genoffice/ai-provider` reads it while it reads skill folders, and an
 * editor's main process that leaves that package unbundled loads this source
 * as it is at run time.
 */

/**
 * Goes after every skill's text on both ways it reaches the model (`use_skill`
 * and the skills the person chose), and into the agent window's instruction.
 */
export const SKILL_SKIPPED_STEPS_SENTENCE =
  'If any step of this skill cannot be done here (running scripts, a tool that is missing ' +
  'or failed), say in your answer which step you could not do. Do not write as if that step ' +
  'was done.'

/** The line naming a server the skill expects that cannot be used now */
export function mcpServerUnusableLine(server: string): string {
  return `This skill expects tools from MCP server ${server}, which cannot be used right now.`
}

/** `mcp__<server>__<tool>` anywhere in a text; the server stops at the first `__` */
const TOOL_IN_TEXT = /(?<![A-Za-z0-9_])mcp__([A-Za-z0-9][A-Za-z0-9_.-]*?)__[A-Za-z0-9*][\w.*-]*/g

/** One `allowed-tools` entry: a tool, or a server alone (all its tools) */
const ALLOWED_ENTRY = /^mcp__([A-Za-z0-9][A-Za-z0-9_.-]*?)(?:__[A-Za-z0-9*][\w.*-]*)?$/

function addOnce(into: string[], server: string): void {
  if (server && !into.includes(server)) into.push(server)
}

/** The servers of the `mcp__<server>__<tool>` names in a text, once each, in order */
export function mcpServersInText(text: string): string[] {
  const out: string[] = []
  for (const match of text.matchAll(TOOL_IN_TEXT)) addOnce(out, match[1]!)
  return out
}

/**
 * The servers named by a front matter `allowed-tools` value: a YAML list, or
 * one string with the names separated by commas or spaces.
 */
export function mcpServersInAllowedTools(value: string | readonly string[] | undefined): string[] {
  if (value === undefined) return []
  const text = typeof value === 'string' ? value : value.join(' ')
  const out: string[] = []
  for (const raw of text.split(/[\s,]+/)) {
    const entry = raw.replace(/^["']+|["']+$/g, '')
    const match = ALLOWED_ENTRY.exec(entry)
    if (match) addOnce(out, match[1]!)
  }
  return out
}

/** Every MCP server a skill refers to: its front matter first, then its body */
export function mcpServersOfSkill(
  body: string,
  allowedTools: string | readonly string[] | undefined,
): string[] {
  const out = mcpServersInAllowedTools(allowedTools)
  for (const server of mcpServersInText(body)) addOnce(out, server)
  return out
}

/**
 * The servers that cannot be used now. Without `isUsable` (no server list is
 * known), and when it throws, a server counts as not usable.
 */
export function unusableMcpServers(
  servers: readonly string[],
  isUsable?: ((name: string) => boolean) | undefined,
): string[] {
  return servers.filter((server) => {
    if (!isUsable) return true
    try {
      return !isUsable(server)
    } catch {
      return true
    }
  })
}

/**
 * What follows a skill's text: a line per referenced server that cannot be
 * used now, then the sentence every skill gets.
 */
export function skillStepsNote(
  servers: readonly string[],
  isUsable?: ((name: string) => boolean) | undefined,
): string {
  return [
    ...unusableMcpServers(servers, isUsable).map(mcpServerUnusableLine),
    SKILL_SKIPPED_STEPS_SENTENCE,
  ].join('\n')
}

/** A bridge answer's server list: non-empty strings, once each */
export function mcpServerListOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const server of value) if (typeof server === 'string') addOnce(out, server)
  return out
}
