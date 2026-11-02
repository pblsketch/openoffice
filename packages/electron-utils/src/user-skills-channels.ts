/**
 * The person's skills between the screens and the shell's main process: the
 * channel names, the shapes that cross them, and the checks both ends run on
 * what they receive. The main process alone reads and writes skill folders;
 * the screens and the editors' AI only ask. No Electron here (plain data).
 */
import type { HandoffSkillChip } from './generate-handoff'
import { isHandoffEditor, type HandoffEditor } from './handoff-editors'

/** The renderer-exposed bridge name every window shares */
export const USER_SKILLS_BRIDGE_KEY = 'aiOfficeUserSkills'

export const USER_SKILLS_CHANNELS = {
  list: 'skills:list',
  read: 'skills:read',
  setState: 'skills:set-state',
  hideBuiltin: 'skills:hide-builtin',
  unhideBuiltins: 'skills:unhide-builtins',
  remove: 'skills:remove',
  copyToMine: 'skills:copy-to-mine',
  suggestName: 'skills:suggest-name',
  checkName: 'skills:check-name',
  save: 'skills:save',
  saveFromCard: 'skills:save-from-card',
  importFolder: 'skills:import-folder',
  importZip: 'skills:import-zip',
  importGitHub: 'skills:import-github',
  cancelImport: 'skills:cancel-import',
  install: 'skills:install',
  checkUpdate: 'skills:check-update',
  applyUpdate: 'skills:apply-update',
  cancelUpdate: 'skills:cancel-update',
  exportInfo: 'skills:export-info',
  exportZip: 'skills:export-zip',
  openFolder: 'skills:open-folder',
  aiRead: 'skills:ai-read',
  aiReadFile: 'skills:ai-read-file',
  openSettings: 'skills:open-settings',
  agentNotice: 'skills:agent-notice',
  agentNoticeSeen: 'skills:agent-notice-seen',
  /** a template skill's copy in a new tab of its editor, with the request handed over (spec 5.7) */
  openTemplate: 'skills:open-template',
  /** the current document's copy in a template preview tab (spec 5.6) */
  openPreview: 'skills:open-preview',
  /** the preview tab: the original document's bytes, for "save the original as is" */
  previewOriginal: 'skills:preview-original',
  /** the preview tab: its card was saved or cancelled */
  finishPreview: 'skills:finish-preview',
  /** a new tab's AI panel takes its skill hand-off, once */
  takeHandoff: 'skills:take-handoff',
  /** bring a tab this flow opened to the front */
  focusTab: 'skills:focus-tab',
  /** main → the original tab: its template preview ended (saved, or not) */
  previewEnded: 'skills:preview-ended',
  /** main → every window: the list or a state changed; read the list again */
  changed: 'skills:changed',
} as const

/** Stored source values (spec 10.1); never renamed */
export type UserSkillSourceValue = 'builtin' | 'app' | 'user' | 'plugin' | 'codex' | 'project'

export type UserSkillInvokeValue = 'auto' | 'manual'

export type UserSkillUnreadable = 'no-frontmatter' | 'bad-name' | 'too-large' | 'unreadable'

/** One skill as the screens see it (no folder paths) */
export interface UserSkillView {
  /** `source:name`, `plugin:<plugin>:<name>` */
  id: string
  source: UserSkillSourceValue
  plugin: string | undefined
  name: string
  /** `metadata.ieum-title`, else the name */
  title: string
  description: string
  enabled: boolean
  invoke: UserSkillInvokeValue
  /** a builtin the person hid; it is off */
  hidden: boolean
  hasScripts: boolean
  /** MCP servers the skill refers to (body and front matter `allowed-tools`, spec 8) */
  mcpServers: string[]
  /** the template path inside the skill folder (`assets/...`), when the skill names one */
  template: string | undefined
  templateExists: boolean
  /** a builtin only the agent window uses */
  agentOnly: boolean
  unreadable: UserSkillUnreadable | undefined
  files: number
  bytes: number
  /** installed from GitHub: where from */
  github: { repo: string; ref: string; path: string; commit: string } | undefined
  /** the skill lives in the app's own folder (`~/.ieumoffice/skills`) */
  owned: boolean
  /** what the more-menu offers (spec 5.1) */
  can: {
    edit: boolean
    copyToMine: boolean
    export: boolean
    checkUpdate: boolean
    openFolder: boolean
    /** to the OS trash (own skills) */
    remove: boolean
    /** builtins are hidden instead of removed */
    hide: boolean
  }
  /** enabled but pushed back by an enabled skill of the same name: that skill's identifier */
  shadowedBy: string | undefined
}

/** A skill's text for the read-only view and the editor */
export interface UserSkillContent {
  id: string
  name: string
  title: string
  description: string
  /** SKILL.md after the front matter */
  body: string
  template: string | undefined
  /** every file in the folder, `/` between parts */
  files: Array<{ rel: string; size: number }>
}

export type UserSkillNameProblem =
  'empty' | 'too-long' | 'characters' | 'hyphen-edge' | 'double-hyphen' | 'reserved'

export type UserSkillsFailReason =
  | 'not-found'
  /** not one of the app's own skills (delete, edit, export, update) */
  | 'not-owned'
  | 'disabled'
  | 'agent-only'
  | 'unreadable'
  /** the path leads outside the skill folder */
  | 'outside'
  | 'not-text'
  | 'too-large'
  | 'bad-name'
  | 'empty-title'
  | 'empty-description'
  | 'empty-body'
  /** the app's skills folder already has a skill of that name */
  | 'name-taken'
  /** copy to mine: the name is taken; ask, then call again with `overwrite` */
  | 'exists'
  /** a hidden builtin cannot be turned on before it is shown again */
  | 'hidden'
  /** the template is not a document the app's editors open, or cannot be read */
  | 'bad-template'
  /** the skill names a template whose file is not there (spec 5.7) */
  | 'no-template'
  /** the request came from a window that may not do this */
  | 'not-allowed'
  /** a template preview's original may withhold something: it is not saved as it is */
  | 'redacted'
  | 'invalid'
  | 'cancelled'
  /** another import or update is running for this window */
  | 'busy'
  | 'failed'
  // import, update and export (the core's error kinds)
  | 'bad-address'
  | 'rate-limited'
  | 'network'
  | 'unsafe'
  | 'no-skills'
  | 'needs-choice'
  | 'not-installable'
  | 'invalid-source'
  /** a replaced skill could not be moved to the OS trash; the old one was kept */
  | 'trash-failed'
  | 'not-github'

export type UserSkillsFail = { ok: false; reason: UserSkillsFailReason; problem?: string }

export type UserSkillsResult<T extends object = object> = ({ ok: true } & T) | UserSkillsFail

/** Settings editor: a new skill (no `id`) or an edit of one of the app's own skills */
export interface UserSkillSaveInput {
  id?: string | undefined
  title: string
  /** a new skill without one gets a name made from the title */
  name?: string | undefined
  description: string
  body: string
}

/**
 * The template a skill card saves along (spec 5.6): the document's bytes. A
 * window never names a file for the main process to read; the agent window's
 * candidates are read in main and handed back as bytes.
 */
export interface UserSkillTemplateInput {
  /** the document's bytes */
  bytes: Uint8Array
  /** the file name under `assets/`, with the extension */
  fileName: string
}

/** A skill card's save (spec 5.6) */
export interface UserSkillCardSaveInput {
  title: string
  name: string
  description: string
  body: string
  invoke: UserSkillInvokeValue
  template?: UserSkillTemplateInput | undefined
  /** the skill being changed; none for a new skill */
  targetId?: string | undefined
  /** replace an own skill of the same name when copying another source's skill */
  overwrite?: boolean | undefined
}

/** One found skill of an import preview (spec 5.2) */
export interface UserSkillImportCandidateView {
  key: string
  rel: string
  name: string
  title: string
  description: string
  files: number
  bytes: number
  hasScripts: boolean
  hasTemplate: boolean
  urls: string[]
  urlCount: number
  license: string | undefined
  collision: boolean
  problem: UserSkillUnreadable | 'duplicate' | undefined
}

export interface UserSkillImportPreview {
  /** pass to install or cancelImport */
  token: string
  origin:
    | { kind: 'folder' }
    | { kind: 'zip' }
    | { kind: 'github'; repo: string; ref: string; commit: string; path: string }
  candidates: UserSkillImportCandidateView[]
  rootLicense: string | undefined
}

export type UserSkillCollisionChoice = 'replace' | 'skip'

export interface UserSkillInstallRequest {
  token: string
  /** candidate keys the person checked */
  selected: string[]
  /** for checked candidates whose name is taken */
  onCollision: Record<string, UserSkillCollisionChoice>
}

export type UserSkillUpdateCheck =
  | { ok: true; status: 'up-to-date'; locallyEdited: boolean }
  | {
      ok: true
      status: 'changed'
      token: string
      locallyEdited: boolean
      changedFiles: Array<{ rel: string; change: 'added' | 'removed' | 'modified' }>
      candidate: UserSkillImportCandidateView
    }
  | UserSkillsFail

/** What `use_skill` gets (spec 5.8) */
export interface UserSkillAiRead {
  id: string
  name: string
  title: string
  /** SKILL.md after the front matter */
  body: string
  /** the text files of the folder besides SKILL.md, `/` between parts */
  files: string[]
  /** the template path when the skill names one and the file is there */
  template: string | undefined
  hasScripts: boolean
  /** MCP servers the skill refers to (body and front matter `allowed-tools`, spec 8) */
  mcpServers: string[]
}

/** Open a template skill's copy in a new tab and hand the request over (spec 5.7) */
export interface UserSkillTemplateOpenInput {
  /** the skill whose template is copied */
  skillId: string
  /** the person's request */
  text: string
  /** every chip the request carried; the receiving panel reads their skills */
  chips: HandoffSkillChip[]
}

/** Open the current document's copy in a template preview tab (spec 5.6) */
export interface UserSkillPreviewInput {
  /** the current document as edited */
  bytes: Uint8Array
  /** the file name the template is saved under, with its extension */
  fileName: string
  /** the document's title as this tab shows it */
  title: string
  /** the new tab's title ("Template preview - <title>", in the UI language) */
  tabTitle: string
  /** the clearing request the preview tab's AI runs */
  text: string
  /** the document has redaction marks: "save the original as is" stays blocked */
  originalRedacted: boolean
  /** the pending skill proposal (plain data) */
  proposal: unknown
  /** the card's fields as the person left them (plain data) */
  draft?: unknown
}

export type UserSkillPreviewOutcome = 'saved' | 'unsaved'

/** What the original tab hears when its template preview ends */
export interface UserSkillPreviewEnded {
  previewId: string
  outcome: UserSkillPreviewOutcome
  /** the saved skill */
  skillId?: string | undefined
  /** the title it was saved with */
  title?: string | undefined
}

// ---- checks ------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, max = 1_000_000): string | undefined {
  return typeof value === 'string' && value.length <= max ? value : undefined
}

/** A skill identifier as the screens send it: short text with a `:` */
export function skillIdOf(value: unknown): string | undefined {
  const id = text(value, 512)
  return id && id.includes(':') ? id : undefined
}

export function invokeOf(value: unknown): UserSkillInvokeValue | undefined {
  return value === 'auto' || value === 'manual' ? value : undefined
}

/** A state change: on/off and when it is used; nothing else */
export function statePatchOf(
  value: unknown,
): { enabled?: boolean; invoke?: UserSkillInvokeValue } | undefined {
  if (!isRecord(value)) return undefined
  const patch: { enabled?: boolean; invoke?: UserSkillInvokeValue } = {}
  if (typeof value.enabled === 'boolean') patch.enabled = value.enabled
  const invoke = invokeOf(value.invoke)
  if (invoke) patch.invoke = invoke
  return patch.enabled === undefined && patch.invoke === undefined ? undefined : patch
}

/** Longest SKILL.md body the app writes (well under the folder limit) */
export const USER_SKILL_BODY_MAX = 2_000_000

export function saveInputOf(value: unknown): UserSkillSaveInput | undefined {
  if (!isRecord(value)) return undefined
  const title = text(value.title, 10_000)
  const description = text(value.description, 100_000)
  const body = text(value.body, USER_SKILL_BODY_MAX)
  if (title === undefined || description === undefined || body === undefined) return undefined
  const id = value.id === undefined ? undefined : skillIdOf(value.id)
  if (value.id !== undefined && !id) return undefined
  const name = value.name === undefined ? undefined : text(value.name, 512)
  if (value.name !== undefined && name === undefined) return undefined
  return { id, title, name, description, body }
}

/** Largest template a card may hand over (the folder limit) */
export const USER_SKILL_TEMPLATE_MAX_BYTES = 64 * 1024 * 1024

function templateOf(value: unknown): UserSkillTemplateInput | undefined | null {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) return null
  const fileName = text(value.fileName, 1024)
  if (!fileName) return null
  const bytes = value.bytes
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > USER_SKILL_TEMPLATE_MAX_BYTES) {
    return null
  }
  return { bytes, fileName }
}

export function cardSaveInputOf(value: unknown): UserSkillCardSaveInput | undefined {
  if (!isRecord(value)) return undefined
  const title = text(value.title, 10_000)
  const name = text(value.name, 512)
  const description = text(value.description, 100_000)
  const body = text(value.body, USER_SKILL_BODY_MAX)
  const invoke = invokeOf(value.invoke) ?? 'auto'
  if (title === undefined || name === undefined || description === undefined) return undefined
  if (body === undefined) return undefined
  const template = templateOf(value.template)
  if (template === null) return undefined
  const targetId = value.targetId === undefined ? undefined : skillIdOf(value.targetId)
  if (value.targetId !== undefined && !targetId) return undefined
  return {
    title,
    name,
    description,
    body,
    invoke,
    template,
    targetId,
    overwrite: value.overwrite === true,
  }
}

export function installRequestOf(value: unknown): UserSkillInstallRequest | undefined {
  if (!isRecord(value)) return undefined
  const token = text(value.token, 128)
  if (!token || !Array.isArray(value.selected)) return undefined
  const selected = value.selected.filter(
    (key): key is string => typeof key === 'string' && key.length <= 4096,
  )
  const onCollision: Record<string, UserSkillCollisionChoice> = {}
  if (isRecord(value.onCollision)) {
    for (const [key, choice] of Object.entries(value.onCollision)) {
      if (choice === 'replace' || choice === 'skip') onCollision[key] = choice
    }
  }
  return { token, selected, onCollision }
}

/** A list answer as the screen reads it: an array of skill views, else none */
export function skillViewsOf(value: unknown): UserSkillView[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is UserSkillView =>
      isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string',
  )
}

/** Any answer that should be a result: a malformed one is a failure */
export function skillsResultOf<T extends object>(value: unknown): UserSkillsResult<T> {
  if (isRecord(value) && typeof value.ok === 'boolean') return value as UserSkillsResult<T>
  return { ok: false, reason: 'failed' }
}

function chipsOf(value: unknown): HandoffSkillChip[] | undefined {
  if (!Array.isArray(value) || value.length > 50) return undefined
  const chips: HandoffSkillChip[] = []
  for (const item of value) {
    if (!isRecord(item)) return undefined
    const id = skillIdOf(item.id)
    const source = text(item.source, 64)
    const title = text(item.title, 10_000)
    if (!id || source === undefined || title === undefined) return undefined
    chips.push({ id, source, title })
  }
  return chips
}

/** Longest request a hand-off carries */
export const USER_SKILL_HANDOFF_TEXT_MAX = 200_000

export function templateOpenInputOf(value: unknown): UserSkillTemplateOpenInput | undefined {
  if (!isRecord(value)) return undefined
  const skillId = skillIdOf(value.skillId)
  const request = text(value.text, USER_SKILL_HANDOFF_TEXT_MAX)
  const chips = chipsOf(value.chips)
  if (!skillId || request === undefined || !chips) return undefined
  return { skillId, text: request, chips }
}

/** Largest plain-data proposal or draft a preview carries */
const PREVIEW_DATA_MAX_CHARS = 4_000_000

function plainDataOf(value: unknown): unknown {
  if (value === undefined) return undefined
  try {
    const json = JSON.stringify(value)
    if (json === undefined || json.length > PREVIEW_DATA_MAX_CHARS) return null
    return JSON.parse(json) as unknown
  } catch {
    return null
  }
}

export function previewInputOf(value: unknown): UserSkillPreviewInput | undefined {
  if (!isRecord(value)) return undefined
  const bytes = value.bytes
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > USER_SKILL_TEMPLATE_MAX_BYTES) {
    return undefined
  }
  const fileName = text(value.fileName, 1024)
  const title = text(value.title, 10_000)
  const tabTitle = text(value.tabTitle, 10_000)
  const request = text(value.text, USER_SKILL_HANDOFF_TEXT_MAX)
  if (!fileName || title === undefined || !tabTitle || request === undefined) return undefined
  if (typeof value.originalRedacted !== 'boolean') return undefined
  const proposal = plainDataOf(value.proposal)
  const draft = plainDataOf(value.draft)
  if (!isRecord(proposal) || draft === null) return undefined
  return {
    bytes,
    fileName,
    title,
    tabTitle,
    text: request,
    originalRedacted: value.originalRedacted,
    proposal,
    ...(draft !== undefined ? { draft } : {}),
  }
}

/** The editor a take names, or undefined */
export function handoffTargetOf(value: unknown): HandoffEditor | undefined {
  return isHandoffEditor(value) ? value : undefined
}

/** A preview's end as the screens send it and hear it */
export function previewEndedOf(value: unknown): UserSkillPreviewEnded | undefined {
  if (!isRecord(value)) return undefined
  const previewId = text(value.previewId, 128)
  const outcome = value.outcome === 'saved' || value.outcome === 'unsaved' ? value.outcome : null
  if (!previewId || !outcome) return undefined
  const skillId = value.skillId === undefined ? undefined : skillIdOf(value.skillId)
  const title = value.title === undefined ? undefined : text(value.title, 10_000)
  return {
    previewId,
    outcome,
    ...(skillId ? { skillId } : {}),
    ...(title !== undefined ? { title } : {}),
  }
}
