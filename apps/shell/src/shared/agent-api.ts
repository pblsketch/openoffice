import type { Lang } from '@genoffice/i18n'
import type { SkillProposal } from '@genoffice/agent-core'
import type { AgentCodexWebSearch } from '@genoffice/ai-provider/agent-session'

/**
 * The agent window (decision 0032): channels and the shapes the window and the
 * shell main share. The window's preload (src/preload/agent.ts) is the only
 * caller of these channels; Home only opens the window.
 */

export const AGENT_CHANNELS = {
  getInit: 'agent-window:get-init',
  pickFolder: 'agent-window:pick-folder',
  setPrefs: 'agent-window:set-prefs',
  start: 'agent-window:start',
  send: 'agent-window:send',
  answer: 'agent-window:answer',
  stop: 'agent-window:stop',
  openFile: 'agent-window:open-file',
  getTheme: 'agent-window:get-theme',
  /** the Codex choices remembered for a project folder (spec 7.2) */
  getProjectPrefs: 'agent-window:get-project-prefs',
  setProjectPrefs: 'agent-window:set-project-prefs',
  /** a project folder's own skills and whether the person turned them on (decision 0064) */
  getProjectSkills: 'agent-window:get-project-skills',
  setProjectSkills: 'agent-window:set-project-skills',
  /** main → window: one session event */
  event: 'agent-window:event',
  /** main → window: `propose_skill` asks for a skill card (spec 6.3) */
  skillProposal: 'agent-window:skill-proposal',
  /** main → window: `propose_skill_install` proposes a GitHub skill (spec 6.4) */
  installProposal: 'agent-window:install-proposal',
  /** whether a template candidate can be saved as it is (its redaction marks) */
  templateCheck: 'agent-window:template-check',
  /** a template candidate's bytes for "save as it is"; refused while it may withhold */
  templateAsIs: 'agent-window:template-as-is',
  /** "make a blank template": the candidate's copy in a template preview tab */
  templateBlank: 'agent-window:template-blank',
} as const

export type AgentProvider = 'claude-code' | 'codex'
export type AgentMode = 'ask-commands' | 'ask-writes' | 'trust-project'

export const AGENT_PROVIDERS: readonly AgentProvider[] = ['claude-code', 'codex']
export const AGENT_MODES: readonly AgentMode[] = ['ask-commands', 'ask-writes', 'trust-project']

/**
 * Programs agent mode does not start, whatever their connection. Empty now:
 * Codex was held here until its sessions could keep commands out of its own
 * sign-in folder, which the MXC sandbox does (the agent-session runner). A
 * program goes back on this list when it cannot be contained.
 */
export const AGENT_BLOCKED_PROVIDERS: readonly AgentProvider[] = []

/** Bump when the first-use warning says something new: an older consent no longer counts */
export const AGENT_WARNING_VERSION = 1

export interface AgentPrefs {
  provider: AgentProvider
  mode: AgentMode
  /** most recent first, at most `AGENT_RECENT_LIMIT` */
  recentFolders: string[]
  /** the warning version the person accepted; 0 for none */
  warningAccepted: number
}

export const AGENT_RECENT_LIMIT = 8

export const DEFAULT_AGENT_PREFS: AgentPrefs = {
  provider: 'claude-code',
  mode: 'ask-commands',
  recentFolders: [],
  warningAccepted: 0,
}

/** The connection of each program as the window needs it to offer a start */
export type AgentConnection = 'ready' | 'metered-accepted' | 'unavailable' | 'checking' | 'blocked'

/** Codex's own web search in an agent session: cached results, live, or off (one type, the session's) */
export type { AgentCodexWebSearch }

export const AGENT_CODEX_WEB_SEARCH: readonly AgentCodexWebSearch[] = ['cached', 'live', 'disabled']

/**
 * What a project folder remembers for Codex sessions (`agentProjectPrefs` of the
 * app settings): a folder used for the first time starts from the defaults, the
 * Codex app's own (cached search, no internet for commands).
 */
export interface AgentProjectPrefs {
  codexWebSearch: AgentCodexWebSearch
  /** commands may reach the internet */
  codexNetwork: boolean
}

export const DEFAULT_AGENT_PROJECT_PREFS: AgentProjectPrefs = {
  codexWebSearch: 'cached',
  codexNetwork: false,
}

/** The known values of a change the window asks for; anything else is dropped */
export function agentProjectPrefsPatch(raw: unknown): Partial<AgentProjectPrefs> {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const patch: Partial<AgentProjectPrefs> = {}
  if (AGENT_CODEX_WEB_SEARCH.includes(value.codexWebSearch as AgentCodexWebSearch)) {
    patch.codexWebSearch = value.codexWebSearch as AgentCodexWebSearch
  }
  if (typeof value.codexNetwork === 'boolean') patch.codexNetwork = value.codexNetwork
  return patch
}

/**
 * A project folder's own skills (`.claude/skills`, `.agents/skills`) as the
 * start screen lists them (decision 0064). They join a session only while
 * `allowed`; `changed` says they were turned on before and have changed since.
 */
export interface AgentProjectSkillsView {
  skills: Array<{ name: string; title: string; description: string }>
  allowed: boolean
  changed: boolean
}

/** How long an "allow" holds: this request, or (web only) the rest of the session */
export type AgentAllowScope = 'once' | 'session'

export interface AgentInit {
  lang: Lang
  prefs: AgentPrefs
  connections: Record<AgentProvider, AgentConnection>
}

/**
 * A skill of a running session, as the window's `/` list and chips need it:
 * the skill as copied into the session's bundle (spec 6.1), its name there,
 * and the absolute paths the chip's instruction names (spec 6.2).
 */
export interface AgentSessionSkill {
  id: string
  /** the name in the bundle: the skill's own, or `<name>--<source>` */
  name: string
  source: string
  plugin: string | undefined
  title: string
  description: string
  invoke: 'auto' | 'manual'
  /** the bundle copy's SKILL.md */
  skillMd: string
  /** the bundle copy's template document, when the skill names one that is there */
  template: string | undefined
}

/** A document a skill card can keep as the template (spec 6.3) */
export interface AgentTemplateCandidateView {
  id: string
  title: string
  fileName: string
  /** open in a tab, or a file of the project folder */
  from: 'tab' | 'project'
  /** open in a tab with changes not saved: the saved file is what goes along */
  unsaved: boolean
}

/** A skill card the session's `propose_skill` asked for */
export interface AgentSkillProposalPayload {
  sessionId: string
  proposal: SkillProposal
  candidates: AgentTemplateCandidateView[]
  /** the candidate the model suggested; none: "no template" */
  selected: string | undefined
}

/** A GitHub skill the session's `propose_skill_install` proposed */
export interface AgentInstallProposalPayload {
  sessionId: string
  /** a key for this proposal */
  key: string
  address: string
}

/**
 * Whether a template candidate may be saved as it is: no redaction marks, or
 * marks found, or no way to tell for its format (then it is not saved as is).
 */
export type AgentTemplateRedaction = 'none' | 'redacted' | 'unknown'

export type AgentTemplateCheck =
  | { ok: true; redaction: AgentTemplateRedaction }
  | { ok: false; reason: 'not-found' | 'unreadable' | 'too-large' }

export type AgentTemplateAsIs =
  | { ok: true; bytes: Uint8Array; fileName: string }
  | {
      ok: false
      reason: 'not-found' | 'unreadable' | 'too-large' | 'redacted' | 'unknown'
    }

export type AgentTemplateBlank =
  { ok: true; tabId: string; previewId: string } | { ok: false; reason: string }

export type AgentStartResponse =
  | { ok: true; sessionId: string; skills: AgentSessionSkill[] }
  | {
      ok: false
      reason: 'bad-folder' | 'not-connected' | 'start-failed' | 'not-accepted' | 'provider-blocked'
      kind?: string | undefined
    }

/** What a tool line or a permission request shows; paths and commands are shown as they are */
export interface AgentActionView {
  kind: 'read' | 'write' | 'command' | 'app-tool' | 'skill' | 'web-search' | 'web-fetch' | 'other'
  tool: string
  command?: string | undefined
  /** a shorter reading of the command for the progress line; the full one stays in `command` */
  summary?: string | undefined
  paths: string[]
  reason?: string | undefined
  /** a web action's search words or page address */
  target?: string | undefined
  /** the site of a page address, when it has one */
  host?: string | undefined
}

export type AgentEventView =
  | { type: 'started'; provider: AgentProvider; model?: string | undefined; skills: number }
  | { type: 'text'; text: string }
  | { type: 'tool'; action: AgentActionView; status: 'running' | 'done' | 'failed' | 'denied' }
  | { type: 'permission'; id: string; action: AgentActionView }
  | { type: 'turn-done'; ok: boolean }
  | { type: 'error'; kind?: string | undefined }
  | { type: 'ended' }

export interface AgentEventPayload {
  sessionId: string
  event: AgentEventView
}

export interface AgentWindowApi {
  getInit(): Promise<AgentInit>
  getTheme(): Promise<'light' | 'dark' | 'system'>
  onThemeChanged(handler: (theme: 'light' | 'dark' | 'system') => void): () => void
  /** the folder dialog; null when cancelled */
  pickFolder(): Promise<string | null>
  setPrefs(prefs: Partial<AgentPrefs>): Promise<AgentPrefs>
  start(request: {
    provider: AgentProvider
    mode: AgentMode
    folder: string
  }): Promise<AgentStartResponse>
  send(sessionId: string, text: string): Promise<boolean>
  /** `scope: 'session'` allows a web action of the same kind for the rest of the session */
  answer(
    sessionId: string,
    requestId: string,
    allow: boolean,
    scope?: AgentAllowScope,
  ): Promise<void>
  /** the Codex choices of a project folder; the defaults for a folder used for the first time */
  getProjectPrefs(folder: string): Promise<AgentProjectPrefs | null>
  /** change the Codex choices of a project folder; returns them as stored */
  setProjectPrefs(
    folder: string,
    patch: Partial<AgentProjectPrefs>,
  ): Promise<AgentProjectPrefs | null>
  /** a project folder's own skills; null when the folder cannot be read */
  getProjectSkills(folder: string): Promise<AgentProjectSkillsView | null>
  /** turn a project folder's skills on, as they are now, or off */
  setProjectSkills(folder: string, on: boolean): Promise<AgentProjectSkillsView | null>
  stop(sessionId: string): Promise<void>
  /** open a file of the session's project folder in a tab */
  openFile(sessionId: string, path: string): Promise<boolean>
  onEvent(handler: (payload: AgentEventPayload) => void): () => void
  onSkillProposal(handler: (payload: AgentSkillProposalPayload) => void): () => void
  onInstallProposal(handler: (payload: AgentInstallProposalPayload) => void): () => void
  /** whether a candidate of a card can be saved as it is */
  templateCheck(proposalKey: string, candidateId: string): Promise<AgentTemplateCheck>
  /** a candidate's bytes for "save as it is"; refused while it may withhold something */
  templateAsIs(proposalKey: string, candidateId: string): Promise<AgentTemplateAsIs>
  /** open a candidate's copy in a template preview tab with the clearing request */
  templateBlank(
    proposalKey: string,
    candidateId: string,
    request: { tabTitle: string; text: string; draft: unknown },
  ): Promise<AgentTemplateBlank>
}

export function normalizeAgentPrefs(raw: unknown): AgentPrefs {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const provider = AGENT_PROVIDERS.includes(value.provider as AgentProvider)
    ? (value.provider as AgentProvider)
    : DEFAULT_AGENT_PREFS.provider
  const mode = AGENT_MODES.includes(value.mode as AgentMode)
    ? (value.mode as AgentMode)
    : DEFAULT_AGENT_PREFS.mode
  const recentFolders = Array.isArray(value.recentFolders)
    ? [
        ...new Set(
          value.recentFolders.filter((f): f is string => typeof f === 'string' && f.length > 0),
        ),
      ].slice(0, AGENT_RECENT_LIMIT)
    : []
  const warningAccepted =
    typeof value.warningAccepted === 'number' && Number.isInteger(value.warningAccepted)
      ? value.warningAccepted
      : 0
  return { provider, mode, recentFolders, warningAccepted }
}

/** `folder` first, without its older copy */
export function withRecentFolder(prefs: AgentPrefs, folder: string): AgentPrefs {
  const rest = prefs.recentFolders.filter((f) => f.toLowerCase() !== folder.toLowerCase())
  return { ...prefs, recentFolders: [folder, ...rest].slice(0, AGENT_RECENT_LIMIT) }
}
