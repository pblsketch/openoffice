import { mcpServerListOf, skillStepsNote } from '@genoffice/agent-core/skill-mcp-refs'
import type { AiSkillsBridge } from './skill-picker-model'

/**
 * What the app adds to a request for the skills the person chose (spec 5.4):
 * per skill its identifier, title, SKILL.md body without the front matter and
 * the list of its text files. The app reads the text and adds it; the program
 * gets no tool for it and no script of a skill runs. After each skill comes
 * the note that tells the model to name the steps it could not do (spec 8).
 */

/** Largest total the added skill text may reach; over it nothing is sent */
export const SKILL_SEND_MAX_CHARS = 150_000

/** One skill as the bridge's `aiRead` gives it */
export interface SkillForRequest {
  id: string
  title: string
  /** SKILL.md after the front matter */
  body: string
  /** text files of the folder besides SKILL.md, `/` between parts */
  files: string[]
  /** MCP servers the skill refers to (body and front matter `allowed-tools`) */
  mcpServers: string[]
}

export interface SkillRequestOptions {
  /**
   * whether an MCP server can be used now (registered and on); without it no
   * referenced server counts as usable
   */
  mcpServerUsable?: ((name: string) => boolean) | undefined
}

function attr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

const SKILLS_LEAD =
  'The person chose the skills below for this request. A skill is a set of instructions ' +
  'the person keeps; follow it for this request. Its scripts are not run here.'

/** The text added to a request for these skills; empty for none */
export function skillRequestText(
  skills: readonly SkillForRequest[],
  options: SkillRequestOptions = {},
): string {
  if (skills.length === 0) return ''
  const blocks = skills.map((skill) => {
    const files =
      skill.files.length > 0
        ? `\n\nText files in this skill's folder: ${skill.files.join(', ')}`
        : ''
    return (
      `<skill id="${attr(skill.id)}" title="${attr(skill.title)}">\n` +
      `${skill.body.trim()}${files}\n</skill>\n` +
      skillStepsNote(skill.mcpServers, options.mcpServerUsable)
    )
  })
  return `\n\n${SKILLS_LEAD}\n\n${blocks.join('\n\n')}`
}

export type SkillRequestBuild =
  { ok: true; text: string } | { ok: false; reason: 'too-large'; chars: number }

/** The added text, or a refusal when it would pass `max` characters */
export function buildSkillRequest(
  skills: readonly SkillForRequest[],
  max: number = SKILL_SEND_MAX_CHARS,
  options: SkillRequestOptions = {},
): SkillRequestBuild {
  const text = skillRequestText(skills, options)
  if (text.length > max) return { ok: false, reason: 'too-large', chars: text.length }
  return { ok: true, text }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** A skill out of an `aiRead` answer, or undefined for a refusal or a malformed answer */
export function skillForRequestOf(raw: unknown): SkillForRequest | undefined {
  if (!isRecord(raw) || raw.ok !== true || !isRecord(raw.skill)) return undefined
  const s = raw.skill
  if (typeof s.id !== 'string' || typeof s.body !== 'string') return undefined
  return {
    id: s.id,
    title: typeof s.title === 'string' && s.title ? s.title : s.id,
    body: s.body,
    files: Array.isArray(s.files) ? s.files.filter((f): f is string => typeof f === 'string') : [],
    mcpServers: mcpServerListOf(s.mcpServers),
  }
}

/**
 * Read the current contents of these skills (never a cached copy). Skills the
 * bridge refuses (gone, turned off, agent-only, unreadable) come back in `missing`.
 */
export async function readSkillsForRequest(
  bridge: Pick<AiSkillsBridge, 'aiRead'>,
  ids: readonly string[],
): Promise<{ skills: SkillForRequest[]; missing: string[] }> {
  const unique = [...new Set(ids)]
  const answers = await Promise.all(
    unique.map((id) =>
      bridge.aiRead(id).then(
        (raw) => skillForRequestOf(raw),
        () => undefined,
      ),
    ),
  )
  const skills: SkillForRequest[] = []
  const missing: string[] = []
  unique.forEach((id, i) => {
    const skill = answers[i]
    if (skill) skills.push(skill)
    else missing.push(id)
  })
  return { skills, missing }
}
