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

/** The levels one model of a key provider or a local server takes, as its list reported them */
export interface AiModelEffort {
  efforts: AiEffort[]
  /** the level the vendor runs the model at when none is sent, when it tells */
  defaultEffort?: AiEffort | undefined
}

/** most models a stored effort table keeps, the bound on a key provider's model list */
const MAX_MODEL_EFFORTS = 2000
const MAX_MODEL_ID_LENGTH = 256

/** One model's levels with unknown ones dropped; undefined when none is left */
export function aiModelEffortOf(value: unknown): AiModelEffort | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const efforts = aiEffortsOf(raw.efforts)
  if (!efforts) return undefined
  const defaultEffort = aiEffortOf(raw.defaultEffort)
  return {
    efforts,
    ...(defaultEffort && efforts.includes(defaultEffort) ? { defaultEffort } : {}),
  }
}

/** A stored table of levels by model id, bounded and with malformed entries dropped */
export function aiModelEffortsOf(value: unknown): Record<string, AiModelEffort> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const table: Record<string, AiModelEffort> = {}
  let count = 0
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (count >= MAX_MODEL_EFFORTS) break
    const id = key.trim()
    if (!id || id.length > MAX_MODEL_ID_LENGTH) continue
    const effort = aiModelEffortOf(entry)
    if (!effort) continue
    table[id] = effort
    count += 1
  }
  return count > 0 ? table : undefined
}
