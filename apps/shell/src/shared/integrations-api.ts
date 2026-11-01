import type {
  AgentId,
  AgentTarget,
  SkillInstallState,
  SkillInstallStatus,
} from '@genoffice/cli/agent-skills'
import type { InstallOutcome } from '@genoffice/cli/install'

export type { AgentId, AgentTarget, SkillInstallState, SkillInstallStatus }

/**
 * The shared `~/.agents` row (`SHARED_AGENT_ID` of @genoffice/cli/agent-skills, which the
 * renderer cannot import: it reads the disk). Codex, Cursor, Gemini CLI, Copilot and
 * OpenCode read that folder; a row with `legacy` set is an older copy in one of their own.
 */
export const SHARED_AGENT_ID = 'agents' satisfies AgentId

export interface CliStatus extends InstallOutcome {
  /** directory holding the genoffice launcher (what `~/.genoffice/launcher` points at) */
  launcherDir: string
  /** app runs from a dmg / AppImage mount: the launcher path will not survive a restart */
  ephemeral: boolean
  /** version of the bundled command line */
  version: string
}

export interface IntegrationsStatus {
  cli: CliStatus
  /** version of the bundled skill (skills/genoffice/SKILL.md front matter) */
  skillVersion: string
  /** lowest CLI version that skill describes */
  skillNeedsCli: string
  /** install rows present on this machine, then the legacy copies (`legacy: true`), in pane order */
  agents: Array<AgentTarget & { state: SkillInstallState }>
}

export interface IntegrationsApi {
  /** probe the CLI link and every detected agent's skills directory (no writes) */
  status(): Promise<IntegrationsStatus>
  /**
   * write the bundled skill into one row's skills directory (or a picked folder); the shared
   * row also rewrites the legacy copies that are outdated, and a legacy row only takes a write
   * when this app wrote a copy there before
   */
  installSkill(target: { agentId: AgentId } | { dir: string }): Promise<SkillInstallState>
  /** remove a skill this app wrote */
  uninstallSkill(agentId: AgentId): Promise<SkillInstallState>
  /** folder picker for "install elsewhere"; null when cancelled */
  pickSkillDir(title: string): Promise<string | null>
  /** save dialog + write of genoffice-skill-<version>.zip; the saved path, null when cancelled */
  saveSkillZip(title: string): Promise<string | null>
  /** put text on the clipboard (paths, the manual PATH command) */
  copyText(text: string): Promise<void>
}

export const INTEGRATIONS_CHANNELS = {
  status: 'integrations:status',
  installSkill: 'integrations:install-skill',
  uninstallSkill: 'integrations:uninstall-skill',
  pickSkillDir: 'integrations:pick-skill-dir',
  saveSkillZip: 'integrations:save-skill-zip',
  copyText: 'integrations:copy-text',
} as const
