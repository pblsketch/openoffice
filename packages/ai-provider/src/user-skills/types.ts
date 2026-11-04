/**
 * Shapes of the person's skills: where one comes from, what was read from its
 * folder, and its on/off state.
 */

/**
 * Where a skill comes from. Stored in the settings file as the first part of
 * an identifier, so the values never change:
 * - `builtin`: shipped with the app
 * - `app`: `~/.ieumoffice/skills` (also the ones installed from GitHub)
 * - `user`: Claude's skill folder, `~/.claude/skills`
 * - `plugin`: the `skills` folder of an installed Claude plugin
 * - `codex`: the shared agents folder, `~/.agents/skills`
 * - `project`: the agent window's project folder; never stored
 */
export type UserSkillSource = 'builtin' | 'app' | 'user' | 'plugin' | 'codex' | 'project'

/** A folder whose child folders are skills */
export interface UserSkillSourceDir {
  source: UserSkillSource
  dir: string
  /** the plugin a plugin source came from */
  plugin?: string | undefined
}

/** Why a listed skill cannot be turned on */
export type UserSkillUnreadableReason = 'no-frontmatter' | 'bad-name' | 'too-large' | 'unreadable'

/** One skill folder as read from disk */
export interface UserSkill {
  /** `source:name`, `plugin:<plugin>:<name>` or `project:<name>` */
  id: string
  source: UserSkillSource
  plugin: string | undefined
  /** the front matter `name`; the folder name when that is missing or not allowed */
  name: string
  folderName: string
  /** the skill folder, absolute when the source was */
  dir: string
  /** `metadata.ieum-title`, else the name */
  title: string
  description: string
  /** `metadata.ieum-template` when it names a file under `assets/` */
  template: string | undefined
  templateExists: boolean
  hasScripts: boolean
  /** MCP servers named in SKILL.md: front matter `allowed-tools` and the body (spec 8) */
  mcpServers: string[]
  /** an app skill installed from GitHub (it has a source record) */
  github: boolean
  /** a builtin skill only the agent window uses */
  agentOnly: boolean
  files: number
  bytes: number
  unreadable: UserSkillUnreadableReason | undefined
}

/** When an enabled skill is used: whenever the AI sees fit, or only when the person calls it */
export type UserSkillInvoke = 'auto' | 'manual'

/** What the settings file keeps for one skill; only what the person changed */
export interface UserSkillStateSetting {
  enabled?: boolean
  invoke?: UserSkillInvoke
}

/** The `skills` value of the app settings file, after reading */
export interface UserSkillSettings {
  /** key: the skill identifier */
  states: Record<string, UserSkillStateSetting>
  /** builtin skill names the person hid */
  hiddenBuiltins: string[]
}

/** A skill with its on/off state worked out */
export interface ResolvedUserSkill extends UserSkill {
  enabled: boolean
  invoke: UserSkillInvoke
  /** a builtin skill the person hid; it is off */
  hidden: boolean
}

/** One entry of `builtin-skills.json` */
export interface BuiltinSkillManifestEntry {
  name: string
  /** where the skill was taken from, such as `owner/repo` */
  source: string
  /** the folder inside that repository */
  path: string
  commit: string
  license: string
  agentOnly: boolean
  /** the app changed the original text */
  modified: boolean
}
