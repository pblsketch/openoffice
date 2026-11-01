/**
 * How hard a model thinks before it answers, as the subscription CLIs take it:
 * Claude Code's `--effort` and Codex's `effort` of a turn. The CLIs tell which
 * levels each model takes (Claude's `supportedEffortLevels`, Codex's
 * `supportedReasoningEfforts`); a level outside this list is never stored,
 * listed or handed on.
 */
export const AI_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

export type AiEffort = (typeof AI_EFFORTS)[number]

/** The levels `claude --effort` takes; the only effort values that reach a command line */
export const CLAUDE_EFFORTS: readonly AiEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']

/** A known level, or undefined for anything else (the CLI's own default runs then) */
export function aiEffortOf(value: unknown): AiEffort | undefined {
  if (typeof value !== 'string') return undefined
  const effort = value.trim()
  return (AI_EFFORTS as readonly string[]).includes(effort) ? (effort as AiEffort) : undefined
}

/** Known levels in the order of `AI_EFFORTS`, each once; undefined when none is left */
export function aiEffortsOf(value: unknown): AiEffort[] | undefined {
  if (!Array.isArray(value)) return undefined
  const known = new Set(value.map(aiEffortOf).filter((effort) => effort !== undefined))
  const efforts = AI_EFFORTS.filter((effort) => known.has(effort))
  return efforts.length > 0 ? efforts : undefined
}
