import { randomUUID } from 'node:crypto'
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import {
  normalizeUserSkillSettings,
  type UserSkillSettings,
  type UserSkillStateSetting,
} from '@genoffice/ai-provider'
import {
  isValidProjectId,
  type OutsideDocumentChoice,
  type ProjectHashedFile,
  type ProjectId,
  type ProjectsAppSettings,
  type ProjectTrustRecord,
} from '@genoffice/project-store'
import { AGENT_CODEX_WEB_SEARCH, type AgentCodexWebSearch } from '../shared/agent-api'

/**
 * Helpers for userData/app-settings.json — a flat JSON object holding
 * cross-module app preferences (UI language, first-run onboarding flag).
 * Editor modules read the same file, so the shape must stay a plain object.
 */

export function readAppSettings(path: string): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>
    }
  } catch {
    // missing or corrupt file: treat as empty settings
  }
  return {}
}

/**
 * Persist several related settings as one atomic replacement. The temporary
 * file lives beside the destination so rename never crosses filesystems.
 */
export function writeAppSettings(path: string, updates: Record<string, unknown>): void {
  const settings = { ...readAppSettings(path), ...updates }
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(tempPath, JSON.stringify(settings, null, 2), {
      encoding: 'utf8',
      flag: 'wx',
      flush: true,
    })
    renameSync(tempPath, path)
  } catch (error) {
    try {
      unlinkSync(tempPath)
    } catch {
      // The write may have failed before the temporary file was created.
    }
    throw error
  }
}

export function writeAppSetting(path: string, key: string, value: unknown): void {
  writeAppSettings(path, { [key]: value })
}

/**
 * Persist `key` and run `apply` only once the bytes are on disk. writeAppSetting
 * rethrows when userData/app-settings.json is unwritable, so a caller that
 * updates its cached value first keeps showing a preference that was never
 * stored and silently reverts on the next launch.
 */
export function writeAppSettingThen<T>(
  path: string,
  key: string,
  value: T,
  apply: (value: T) => void,
): void {
  writeAppSetting(path, key, value)
  apply(value)
}

// ---- the person's skills and the agent window (spec 10.1) ----

/** `skills`: on/off states the person changed and the builtins they hid */
export const SKILLS_SETTING_KEY = 'skills'
/** set once the agent window's one-time skills notice was seen or not needed */
export const AGENT_SKILL_NOTICE_KEY = 'agentSkillNoticeSeen'
/** per project folder: the Codex web search and command network choices */
export const AGENT_PROJECT_PREFS_KEY = 'agentProjectPrefs'
/** where the agent window keeps its preferences, the warning acceptance among them */
const AGENT_PREFS_KEY = 'agent'

/** The `skills` value read back; unknown values fall back to the initial state */
export function readSkillSettings(path: string): UserSkillSettings {
  return normalizeUserSkillSettings(readAppSettings(path)[SKILLS_SETTING_KEY])
}

/** Write the `skills` value, keeping only states that hold something */
export function writeSkillSettings(path: string, settings: UserSkillSettings): void {
  const states: Record<string, UserSkillStateSetting> = {}
  for (const [id, state] of Object.entries(settings.states)) {
    const kept: UserSkillStateSetting = {}
    if (typeof state.enabled === 'boolean') kept.enabled = state.enabled
    if (state.invoke === 'auto' || state.invoke === 'manual') kept.invoke = state.invoke
    if (kept.enabled !== undefined || kept.invoke !== undefined) states[id] = kept
  }
  const value: { states?: typeof states; hiddenBuiltins?: string[] } = {}
  if (Object.keys(states).length > 0) value.states = states
  const hidden = [...new Set(settings.hiddenBuiltins.filter((name) => !!name))]
  if (hidden.length > 0) value.hiddenBuiltins = hidden
  writeAppSetting(path, SKILLS_SETTING_KEY, value)
}

/** Read, change and write the `skills` value; returns what was written */
export function updateSkillSettings(
  path: string,
  change: (settings: UserSkillSettings) => void,
): UserSkillSettings {
  const settings = readSkillSettings(path)
  change(settings)
  writeSkillSettings(path, settings)
  return readSkillSettings(path)
}

function acceptedAgentWarning(agent: unknown): boolean {
  const value = (agent && typeof agent === 'object' ? agent : {}) as { warningAccepted?: unknown }
  return (
    typeof value.warningAccepted === 'number' &&
    Number.isInteger(value.warningAccepted) &&
    value.warningAccepted >= 1
  )
}

/**
 * The agent window's one-time notice (spec 6.5) is due for someone who
 * accepted the agent warning before this version and has not seen it.
 */
export function agentSkillNoticeDue(path: string): boolean {
  const settings = readAppSettings(path)
  return (
    acceptedAgentWarning(settings[AGENT_PREFS_KEY]) && settings[AGENT_SKILL_NOTICE_KEY] !== true
  )
}

export function markAgentSkillNoticeSeen(path: string): void {
  writeAppSetting(path, AGENT_SKILL_NOTICE_KEY, true)
}

/**
 * Store the agent window's preferences. Accepting the warning for the first
 * time also records the skills notice as seen: a new user never gets it.
 */
export function writeAgentPrefs(path: string, prefs: { warningAccepted: number }): void {
  const before = readAppSettings(path)
  const updates: Record<string, unknown> = { [AGENT_PREFS_KEY]: prefs }
  if (
    !acceptedAgentWarning(before[AGENT_PREFS_KEY]) &&
    acceptedAgentWarning(prefs) &&
    before[AGENT_SKILL_NOTICE_KEY] === undefined
  ) {
    updates[AGENT_SKILL_NOTICE_KEY] = true
  }
  writeAppSettings(path, updates)
}

export interface AgentProjectPref {
  codexWebSearch: AgentCodexWebSearch
  codexNetwork: boolean
}

/** A folder used for the first time (spec 7.2) */
export const DEFAULT_AGENT_PROJECT_PREF: AgentProjectPref = {
  codexWebSearch: 'cached',
  codexNetwork: false,
}

type StoredAgentProjectPref = Partial<AgentProjectPref>

function codexWebSearchOf(value: unknown): AgentCodexWebSearch | undefined {
  return AGENT_CODEX_WEB_SEARCH.find((choice) => choice === value)
}

/** The `agentProjectPrefs` value read back; unknown values are dropped */
export function normalizeAgentProjectPrefs(raw: unknown): Record<string, StoredAgentProjectPref> {
  const out: Record<string, StoredAgentProjectPref> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [folder, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!folder || !isAbsolute(folder) || !value || typeof value !== 'object') continue
    const entry = value as Record<string, unknown>
    const kept: StoredAgentProjectPref = {}
    const webSearch = codexWebSearchOf(entry.codexWebSearch)
    if (webSearch) kept.codexWebSearch = webSearch
    if (typeof entry.codexNetwork === 'boolean') kept.codexNetwork = entry.codexNetwork
    if (kept.codexWebSearch !== undefined || kept.codexNetwork !== undefined) out[folder] = kept
  }
  return out
}

function sameFolder(a: string, b: string): boolean {
  const fold = (p: string) => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p))
  return fold(a) === fold(b)
}

/** The stored key of a project folder, matching an earlier spelling of the same folder */
function projectKey(prefs: Record<string, StoredAgentProjectPref>, folder: string): string {
  return Object.keys(prefs).find((key) => sameFolder(key, folder)) ?? resolve(folder)
}

/** A project folder's Codex choices; a folder used for the first time gets the defaults */
export function readAgentProjectPref(path: string, folder: string): AgentProjectPref {
  const prefs = normalizeAgentProjectPrefs(readAppSettings(path)[AGENT_PROJECT_PREFS_KEY])
  const stored = prefs[projectKey(prefs, folder)] ?? {}
  return { ...DEFAULT_AGENT_PROJECT_PREF, ...stored }
}

/** Change a project folder's Codex choices; returns them as stored */
export function writeAgentProjectPref(
  path: string,
  folder: string,
  patch: Partial<AgentProjectPref>,
): AgentProjectPref {
  if (!isAbsolute(folder)) throw new Error('A project folder must be an absolute path')
  const prefs = normalizeAgentProjectPrefs(readAppSettings(path)[AGENT_PROJECT_PREFS_KEY])
  const key = projectKey(prefs, folder)
  const next: StoredAgentProjectPref = { ...prefs[key] }
  const webSearch = codexWebSearchOf(patch.codexWebSearch)
  if (webSearch) next.codexWebSearch = webSearch
  if (typeof patch.codexNetwork === 'boolean') next.codexNetwork = patch.codexNetwork
  prefs[key] = next
  writeAppSetting(path, AGENT_PROJECT_PREFS_KEY, prefs)
  return { ...DEFAULT_AGENT_PROJECT_PREF, ...next }
}

// ---- project folders (decision 0088) ----

/** `projects`: this PC's list of project folders, trust records and per-document choices */
export const PROJECTS_SETTING_KEY = 'projects'

/**
 * The stored `projects` value. Besides the shared contract it remembers which
 * projects already showed the one-time "this is a sync folder" notice.
 */
export interface StoredProjectsSettings extends ProjectsAppSettings {
  /** Project ids whose sync-folder notice was shown (spec 5.8, once per project) */
  syncNoticeShown: ProjectId[]
}

const PROJECT_HASHED_FILES: readonly ProjectHashedFile[] = [
  'instructions',
  'memory',
  'agents',
  'claude',
]
const SHA256_HEX = /^[0-9a-f]{64}$/

function plainObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function isIsoTime(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
}

/** The `projects` value read back; unknown or malformed parts are dropped, never guessed */
export function normalizeProjectsSettings(raw: unknown): StoredProjectsSettings {
  const source = plainObject(raw) ?? {}
  const out: StoredProjectsSettings = {
    installId: isValidProjectId(source.installId) ? source.installId : '',
    list: [],
    trust: {},
    outsideDocuments: {},
    optedOutDocuments: {},
    settings: {},
    syncNoticeShown: [],
  }
  const seen = new Set<string>()
  for (const item of Array.isArray(source.list) ? source.list : []) {
    const entry = plainObject(item)
    if (!entry || !isValidProjectId(entry.id) || seen.has(entry.id)) continue
    if (typeof entry.path !== 'string' || !isAbsolute(entry.path)) continue
    seen.add(entry.id)
    out.list.push({
      id: entry.id,
      path: entry.path,
      pinned: entry.pinned === true,
      lastUsedAt: isIsoTime(entry.lastUsedAt) ? entry.lastUsedAt : new Date(0).toISOString(),
    })
  }
  for (const [id, value] of Object.entries(plainObject(source.trust) ?? {})) {
    const record = plainObject(value)
    if (!isValidProjectId(id) || !record) continue
    if (record.decision !== 'use' && record.decision !== 'without') continue
    const hashes: ProjectTrustRecord['hashes'] = {}
    const storedHashes = plainObject(record.hashes) ?? {}
    for (const file of PROJECT_HASHED_FILES) {
      const hash = storedHashes[file]
      if (typeof hash === 'string' && SHA256_HEX.test(hash)) hashes[file] = hash
    }
    out.trust[id] = { decision: record.decision, hashes }
  }
  for (const [doc, value] of Object.entries(plainObject(source.outsideDocuments) ?? {})) {
    const choice = plainObject(value)
    if (!choice || !isAbsolute(doc)) continue
    if (choice.projectId !== null && !isValidProjectId(choice.projectId)) continue
    const kept: OutsideDocumentChoice = { projectId: choice.projectId }
    if (choice.projectId !== null && isValidProjectId(choice.lastChatId)) {
      kept.lastChatId = choice.lastChatId
    }
    out.outsideDocuments[doc] = kept
  }
  for (const [doc, value] of Object.entries(plainObject(source.optedOutDocuments) ?? {})) {
    const record = plainObject(value)
    if (!record || !isAbsolute(doc) || !isValidProjectId(record.projectId)) continue
    out.optedOutDocuments[doc] = { projectId: record.projectId }
  }
  for (const [id, value] of Object.entries(plainObject(source.settings) ?? {})) {
    const switches = plainObject(value)
    if (!isValidProjectId(id) || !switches) continue
    out.settings[id] = {
      memoryEnabled: switches.memoryEnabled !== false,
      readAgentsFiles: switches.readAgentsFiles !== false,
    }
  }
  if (source.homeProjectId === null || isValidProjectId(source.homeProjectId)) {
    out.homeProjectId = source.homeProjectId
  }
  const shown = Array.isArray(source.syncNoticeShown) ? source.syncNoticeShown : []
  out.syncNoticeShown = [...new Set(shown.filter(isValidProjectId))]
  return out
}

/** The `projects` value; a missing or unreadable file reads as an empty registry */
export function readProjectsSettings(path: string): StoredProjectsSettings {
  return normalizeProjectsSettings(readAppSettings(path)[PROJECTS_SETTING_KEY])
}

/** Write the whole `projects` value (other keys of the file are kept) */
export function writeProjectsSettings(path: string, value: StoredProjectsSettings): void {
  writeAppSetting(path, PROJECTS_SETTING_KEY, normalizeProjectsSettings(value))
}

/** Read, change and write the `projects` value in one go; returns what was written */
export function updateProjectsSettings(
  path: string,
  change: (settings: StoredProjectsSettings) => void,
): StoredProjectsSettings {
  const settings = readProjectsSettings(path)
  change(settings)
  writeProjectsSettings(path, settings)
  return normalizeProjectsSettings(settings)
}
