import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { AgentProjectSkillsView } from '../../shared/agent-api'
import { readAppSettings, writeAppSetting } from '../app-settings'

/**
 * A project folder's own skills in the agent window (decision 0064). A folder
 * someone else made can carry `.claude/skills` or `.agents/skills`; the agent
 * reads and follows them without asking. So they stay out of a session until
 * the person has seen the list for that folder and turned them on, and they
 * stay out again once any of their files changes.
 *
 * What the person turned on is kept per folder as a fingerprint of the skills'
 * files (`agentProjectSkills` in app-settings.json). The session's start reads
 * the fingerprint again, so the window cannot let skills in on its own.
 */

/** A project skill as the skills service lists it */
export interface ProjectSkillLike {
  id: string
  name: string
  title: string
  description: string
  dir: string
  source: string
}

export const PROJECT_SKILLS_KEY = 'agentProjectSkills'

/** Bounds of one fingerprint: a folder past them is never "the same as before" */
const MAX_FILES = 400
const MAX_BYTES = 16 * 1024 * 1024

export function projectSkillsOf<T extends ProjectSkillLike>(skills: readonly T[]): T[] {
  return skills.filter((skill) => skill.source === 'project')
}

async function filesOf(dir: string, budget: { files: number }): Promise<string[]> {
  const out: string[] = []
  const walk = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(current, entry.name)
      // links are not followed: the session's copy does not follow them either
      if ((await lstat(path)).isSymbolicLink()) continue
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) {
        if (--budget.files < 0) throw new Error('too many files')
        out.push(path)
      }
    }
  }
  await walk(dir)
  return out
}

/**
 * The fingerprint of a folder's project skills: every file's place and
 * content. Null when there are none, or when they cannot all be read within
 * the bounds (then nothing matches it and they stay off).
 */
export async function projectSkillsFingerprint(
  skills: readonly ProjectSkillLike[],
): Promise<string | null> {
  if (skills.length === 0) return null
  const hash = createHash('sha256')
  const budget = { files: MAX_FILES }
  let bytes = 0
  try {
    for (const skill of [...skills].sort((a, b) => a.id.localeCompare(b.id))) {
      hash.update(`skill\0${skill.id}\0`)
      for (const file of await filesOf(skill.dir, budget)) {
        const content = await readFile(file)
        bytes += content.length
        if (bytes > MAX_BYTES) return null
        hash.update(`${relative(skill.dir, file).replace(/\\/g, '/')}\0`)
        hash.update(createHash('sha256').update(content).digest())
      }
    }
  } catch {
    return null
  }
  return hash.digest('hex')
}

function folderKey(folder: string): string {
  const full = resolve(folder)
  return process.platform === 'win32' ? full.toLowerCase() : full
}

function approvalsOf(settingsPath: string): Record<string, string> {
  const raw = readAppSettings(settingsPath)[PROJECT_SKILLS_KEY]
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isAbsolute(key) && typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)) {
      out[key] = value
    }
  }
  return out
}

/** The fingerprint the person turned on for this folder, if any */
export function approvedFingerprint(settingsPath: string, folder: string): string | undefined {
  return approvalsOf(settingsPath)[folderKey(folder)]
}

export function writeProjectSkillsApproval(
  settingsPath: string,
  folder: string,
  fingerprint: string | null,
): void {
  const approvals = approvalsOf(settingsPath)
  const key = folderKey(folder)
  if (fingerprint) approvals[key] = fingerprint
  else delete approvals[key]
  writeAppSetting(settingsPath, PROJECT_SKILLS_KEY, approvals)
}

/** Whether a session in this folder may carry its project skills right now */
export async function projectSkillsAllowed(
  settingsPath: string,
  folder: string,
  skills: readonly ProjectSkillLike[],
): Promise<boolean> {
  const approved = approvedFingerprint(settingsPath, folder)
  if (!approved) return false
  return (await projectSkillsFingerprint(projectSkillsOf(skills))) === approved
}

/** What the start screen shows for a folder */
export async function projectSkillsView(
  settingsPath: string,
  folder: string,
  skills: readonly ProjectSkillLike[],
): Promise<AgentProjectSkillsView> {
  const own = projectSkillsOf(skills)
  const fingerprint = await projectSkillsFingerprint(own)
  const approved = approvedFingerprint(settingsPath, folder)
  return {
    skills: own.map((s) => ({ name: s.name, title: s.title, description: s.description })),
    allowed: fingerprint !== null && approved === fingerprint,
    changed: approved !== undefined && fingerprint !== null && approved !== fingerprint,
  }
}

/** Turn a folder's skills on (as they are now) or off; returns the view after */
export async function setProjectSkills(
  settingsPath: string,
  folder: string,
  skills: readonly ProjectSkillLike[],
  on: boolean,
): Promise<AgentProjectSkillsView> {
  const fingerprint = on ? await projectSkillsFingerprint(projectSkillsOf(skills)) : null
  writeProjectSkillsApproval(settingsPath, folder, fingerprint)
  return projectSkillsView(settingsPath, folder, skills)
}
