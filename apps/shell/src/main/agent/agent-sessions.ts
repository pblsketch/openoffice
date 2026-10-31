import { randomUUID } from 'node:crypto'
import { existsSync, rmSync, statSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
import type {
  AgentCodexWebSearch,
  AgentPermissionAnswer,
  AgentPermissionMode,
  AgentSession,
  AgentSessionEvent,
  AgentSessionOptions,
  AgentSkillBundle,
  AgentSkillEntry,
} from '@genoffice/ai-provider/agent-session'
import { comparablePath, isInsidePath } from '@genoffice/ai-provider/agent-session'
import type {
  AiSettings,
  AiSubscriptionProviderId,
  AiSubscriptionStatus,
} from '@genoffice/ai-provider'
import { subscriptionConnection } from '@genoffice/ai-provider'
import type { AgentSessionSkill } from '../../shared/agent-api'
import { agentSessionSkillsOf } from './agent-skills'

/**
 * Agent sessions of the shell (decision 0032): one per agent window, each the
 * person's Claude Code or Codex working in a project folder they chose.
 *
 * Electron-free so the rules can be tested: the IPC module injects the
 * runners, the app's MCP server, the subscription statuses and settings, the
 * open tabs, and the event sink.
 */

export type AgentStartFailure =
  /** the folder is missing, not a folder, a drive root, the home folder, or a protected place */
  | 'bad-folder'
  /** the program is not signed in on a subscription, and no metered login was accepted */
  | 'not-connected'
  /** the program could not be started or refused the session (see `message`) */
  | 'start-failed'

export interface AgentStartRequest {
  provider: AiSubscriptionProviderId
  projectRoot: string
  mode: AgentPermissionMode
  /**
   * Codex only: its web search and whether commands reach the internet, as
   * remembered for the project folder; the Codex app's defaults when absent
   */
  codex?: { webSearch: AgentCodexWebSearch; network: boolean } | undefined
}

export type AgentStartResult =
  | { ok: true; sessionId: string; skills: AgentSessionSkill[] }
  | {
      ok: false
      reason: AgentStartFailure
      kind?: string | undefined
      message?: string | undefined
    }

export interface AgentRunners {
  claude: (
    options: AgentSessionOptions,
    onEvent: (event: AgentSessionEvent) => void,
  ) => Promise<AgentSession>
  codex: (
    options: AgentSessionOptions & {
      meteredAccepted: boolean
      webSearch: AgentCodexWebSearch
      network: boolean
    },
    onEvent: (event: AgentSessionEvent) => void,
  ) => Promise<AgentSession>
}

export interface AgentManagerDeps {
  runners: AgentRunners
  statuses: () => Partial<Record<AiSubscriptionProviderId, AiSubscriptionStatus>>
  aiSettings: () => AiSettings
  /** absolute paths of documents open in tabs */
  openDocuments: () => string[]
  /** the app's data folder; protected, and the skill copy lives under it */
  userData: string
  homeDir?: string | undefined
  /** the screen language, for the reply-language line of the instructions */
  language: () => string
  /**
   * start the session's own MCP server; absent when the app has no editors to
   * offer. `session` names the window and session its skill tools answer to
   */
  startAppMcp?:
    | ((
        projectRoot: string,
        session: AgentMcpSession,
      ) => Promise<{ url: string; token: string; stop(): Promise<void> }>)
    | undefined
  /**
   * refresh the copy of the enabled skills (and the project's) as they are now, and return it;
   * both programs get it. Absent, or undefined, to give no skills
   */
  buildSkills?: ((projectRoot: string) => Promise<AgentSkillBundle | undefined>) | undefined
  emit: (ownerId: number, sessionId: string, event: AgentSessionEvent) => void
  platform?: NodeJS.Platform | undefined
}

/** The session a session MCP server serves: its window and its identifier */
export interface AgentMcpSession {
  ownerId: number
  sessionId: string
}

/** Folders no session may use or reach: sign-in stores, the original app, this app's data */
export function agentProtectedPaths(homeDir: string, userData: string): string[] {
  return [
    join(homeDir, '.claude'),
    join(homeDir, '.codex'),
    join(homeDir, '.genoffice'),
    join(homeDir, '.ieumoffice'),
    userData,
  ]
}

/** Why a folder cannot be a project folder, or undefined when it can */
export function projectFolderProblem(
  folder: string,
  homeDir: string,
  protectedPaths: readonly string[],
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (!folder || !isAbsolute(folder)) return 'not-absolute'
  let info
  try {
    info = statSync(folder)
  } catch {
    return 'missing'
  }
  if (!info.isDirectory()) return 'not-a-folder'
  const root = comparablePath(folder, folder, platform)
  if (parse(root).root === root || comparablePath(parse(root).root, root, platform) === root) {
    return 'drive-root'
  }
  if (root === comparablePath(homeDir, homeDir, platform)) return 'home-folder'
  for (const guard of protectedPaths) {
    const g = comparablePath(guard, guard, platform)
    if (isInsidePath(root, g, platform) || isInsidePath(g, root, platform)) return 'protected'
  }
  return undefined
}

const PROJECT_NOTE_FILES = ['CLAUDE.md', 'AGENTS.md']
const MAX_PROJECT_NOTES_CHARS = 32_000

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * The skills of a Codex session, for its instructions: Codex lists no skills
 * of its own here (its skill instructions are off), so the app names the ones
 * in the session's copy, with where each SKILL.md is and whether the person
 * must call it.
 */
export function codexSkillInstructions(skills: readonly AgentSkillEntry[]): string[] {
  if (skills.length === 0) return []
  // the plugin root of the session's copy, for a SKILL.md that names files beside its folder
  const bundleDir = skills[0]?.skillMd ? dirname(dirname(skills[0].skillMd)) : ''
  const lines = [
    '',
    'Skills: each skill below is a folder with a SKILL.md of instructions. When a skill is relevant to the task, or the person asks for it, read its SKILL.md first and follow it; paths in it are relative to its folder. A skill marked "manual" is used only when the person asks for it by name. To change a skill with propose_skill, give its name or its id as targetId.',
  ]
  if (bundleDir) {
    lines.push(
      `In a SKILL.md, \${CLAUDE_PLUGIN_ROOT} means ${bundleDir}; the plugin's scripts and other files are there.`,
    )
  }
  for (const skill of skills) {
    const title = oneLine(skill.title)
    const named =
      title && title !== skill.name
        ? `${skill.name} (id: ${skill.id}; title: ${title})`
        : `${skill.name} (id: ${skill.id})`
    const manual = skill.invoke === 'manual' ? '; manual: only when the person asks' : ''
    lines.push(
      `- ${named}: ${oneLine(skill.description) || 'no description'}; SKILL.md: ${skill.skillMd}${manual}`,
    )
  }
  return lines
}

/**
 * What the app adds to the program's own instructions. English, as all model
 * prompts in this app; the reply language follows the screen.
 */
export async function agentInstructions(
  provider: AiSubscriptionProviderId,
  projectRoot: string,
  language: string,
  withAppTools: boolean,
  skills: readonly AgentSkillEntry[] = [],
): Promise<string> {
  const lines = [
    'You are working for the person inside an office app, in the project folder they chose.',
    `Reply in the language with code "${language}" unless the person writes in another language.`,
    'Work inside the project folder. Create new files there; do not write anywhere else.',
    'Documents the person has open in the app must not be written as files: the app holds their current state.',
  ]
  if (withAppTools) {
    lines.push(
      'To read or change a document that is open in the app, use the ieumoffice-editor tools: open_documents (action "list") shows what is open; pass a document\'s id or path as `document` to read_document / insert_content / replace_blocks / apply_ops (Word), read_sheet / apply_sheet_ops (Excel), read_deck / apply_slide_ops (PowerPoint). Changes made this way show in the editor and the person can undo them.',
      'Some words may read as {{label}}: the person withheld them from AI. Keep every such marker exactly as it is, never guess what it stands for, and never write a marker into a file.',
      'read_hwp and read_pdf read Hangul and PDF files of the project folder.',
      'When the person asks to keep the work as a skill, or to make or change a skill, call propose_skill: the app shows them a card to check and save; never write skill files yourself. To install a skill from GitHub, call propose_skill_install with its address: the app shows the person a preview and they decide; never install skills with a command.',
    )
  }
  // Claude Code finds the skills in the plugin it is given; Codex is told about them
  if (provider === 'codex') lines.push(...codexSkillInstructions(skills))
  // Claude Code runs with no project settings, so it does not read these files itself; Codex
  // reads AGENTS.md on its own, so only CLAUDE.md is added for it
  const files = provider === 'claude-code' ? PROJECT_NOTE_FILES : ['CLAUDE.md']
  const notes: string[] = []
  for (const name of files) {
    try {
      const text = await readFile(join(projectRoot, name), 'utf8')
      if (text.trim()) notes.push(`## ${name}\n${text.slice(0, MAX_PROJECT_NOTES_CHARS)}`)
    } catch {
      // no such file
    }
  }
  if (notes.length > 0) {
    lines.push('', 'The project folder has its own notes for you:', '', ...notes)
  }
  return lines.join('\n')
}

interface LiveSession {
  id: string
  ownerId: number
  session: AgentSession | undefined
  sessionDir: string
  appMcp?: { stop(): Promise<void> } | undefined
  projectRoot: string
  /** the skills of the session's copy, once built */
  skills?: readonly AgentSkillEntry[] | undefined
  /** documents the program was told to treat as read-only when the session started */
  protectedDocuments: Set<string>
  /** documents warned about already, so one notice is not repeated every message */
  warnedDocuments: Set<string>
}

export interface AgentManager {
  start(ownerId: number, request: AgentStartRequest): Promise<AgentStartResult>
  send(ownerId: number, sessionId: string, text: string): Promise<void>
  answer(ownerId: number, sessionId: string, requestId: string, answer: AgentPermissionAnswer): void
  stop(ownerId: number, sessionId: string): void
  /** the owner window went away: its sessions end */
  stopOwner(ownerId: number): void
  /** the app is quitting */
  stopAll(): void
  /** the project folder of a live session, for opening its files in tabs */
  projectRootOf(ownerId: number, sessionId: string): string | undefined
  /** the skills a live session got, by their names in its copy (empty before the copy is built) */
  skillsOf(ownerId: number, sessionId: string): readonly AgentSkillEntry[]
}

export function createAgentManager(deps: AgentManagerDeps): AgentManager {
  const platform = deps.platform ?? process.platform
  const homeDir = deps.homeDir ?? homedir()
  const protectedPaths = agentProtectedPaths(homeDir, deps.userData)
  const live = new Map<string, LiveSession>()

  const cleanup = (entry: LiveSession, { quitting = false } = {}): void => {
    if (!live.has(entry.id)) return
    live.delete(entry.id)
    void entry.appMcp?.stop().catch(() => undefined)
    // the folder is the program's working directory: Windows refuses to remove it until the
    // ended process is gone, which can take a moment
    const options = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }
    if (!quitting) {
      void rm(entry.sessionDir, options).catch(() => undefined)
      return
    }
    // the app is going away and would not wait for an asynchronous removal
    try {
      rmSync(entry.sessionDir, options)
    } catch {
      // left for the system's temporary-file cleanup
    }
  }

  const own = (ownerId: number, sessionId: string): LiveSession | undefined => {
    const entry = live.get(sessionId)
    return entry && entry.ownerId === ownerId ? entry : undefined
  }

  return {
    async start(ownerId, request) {
      const projectRoot = resolve(request.projectRoot)
      if (projectFolderProblem(projectRoot, homeDir, protectedPaths, platform)) {
        return { ok: false, reason: 'bad-folder' }
      }
      const settings = deps.aiSettings()
      const connection = subscriptionConnection(settings, deps.statuses()[request.provider])
      if (!connection) return { ok: false, reason: 'not-connected' }

      const id = randomUUID()
      const sessionDir = await mkdtemp(join(tmpdir(), 'ieum-agent-'))
      const openAtStart = deps.openDocuments()
      const entry: LiveSession = {
        id,
        ownerId,
        session: undefined,
        sessionDir,
        projectRoot,
        protectedDocuments: new Set(
          openAtStart.map((path) => comparablePath(path, path, platform)),
        ),
        warnedDocuments: new Set(),
      }
      live.set(id, entry)
      try {
        const appMcp = deps.startAppMcp
          ? await deps.startAppMcp(projectRoot, { ownerId, sessionId: id })
          : undefined
        entry.appMcp = appMcp
        // the skills as they are now: a change made during the session applies to the next one
        const skills = deps.buildSkills ? await deps.buildSkills(projectRoot) : undefined
        entry.skills = skills?.skills
        const config = settings.providers[request.provider]
        const options: AgentSessionOptions = {
          projectRoot,
          mode: request.mode,
          model: config?.model ?? '',
          cliPath: config?.cliPath,
          instructions: await agentInstructions(
            request.provider,
            projectRoot,
            deps.language(),
            appMcp !== undefined,
            skills?.skills,
          ),
          openDocuments: openAtStart,
          protectedPaths,
          skillBundleDir: skills?.dir,
          appMcp: appMcp ? { url: appMcp.url, token: appMcp.token } : undefined,
          sessionDir,
        }
        const onEvent = (event: AgentSessionEvent): void => {
          deps.emit(ownerId, id, event)
          if (event.type === 'ended') cleanup(entry)
        }
        entry.session =
          request.provider === 'claude-code'
            ? await deps.runners.claude(options, onEvent)
            : await deps.runners.codex(
                {
                  ...options,
                  meteredAccepted: connection === 'metered',
                  webSearch: request.codex?.webSearch ?? 'cached',
                  network: request.codex?.network === true,
                },
                onEvent,
              )
        return {
          ok: true,
          sessionId: id,
          // the window's `/` list: what the session got, with the paths a chip names
          skills: skills ? await agentSessionSkillsOf(skills.skills) : [],
        }
      } catch (error) {
        cleanup(entry)
        return {
          ok: false,
          reason: 'start-failed',
          kind: (error as { kind?: unknown } | null)?.kind as string | undefined,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },

    async send(ownerId, sessionId, text) {
      const entry = own(ownerId, sessionId)
      if (!entry?.session) throw new Error('No such agent session')
      // documents opened since the session started were not in its program-level rules
      const current = deps.openDocuments()
      const added: string[] = []
      for (const path of current) {
        const key = comparablePath(path, path, platform)
        if (entry.protectedDocuments.has(key)) continue
        entry.protectedDocuments.add(key)
        if (!entry.warnedDocuments.has(key)) {
          entry.warnedDocuments.add(key)
          added.push(path)
        }
      }
      if (added.length > 0) {
        deps.emit(ownerId, sessionId, { type: 'documents-unprotected', paths: added })
      }
      // tabs opened or closed since the last message count from here on
      entry.session.setOpenDocuments(current)
      await entry.session.send(text)
    },

    answer(ownerId, sessionId, requestId, answer) {
      own(ownerId, sessionId)?.session?.answer(requestId, answer)
    },

    stop(ownerId, sessionId) {
      const entry = own(ownerId, sessionId)
      if (!entry) return
      entry.session?.stop()
      cleanup(entry)
    },

    stopOwner(ownerId) {
      for (const entry of [...live.values()]) {
        if (entry.ownerId !== ownerId) continue
        entry.session?.stop()
        cleanup(entry)
      }
    },

    stopAll() {
      for (const entry of [...live.values()]) {
        entry.session?.stop()
        cleanup(entry, { quitting: true })
      }
    },

    projectRootOf(ownerId, sessionId) {
      return own(ownerId, sessionId)?.projectRoot
    },

    skillsOf(ownerId, sessionId) {
      return own(ownerId, sessionId)?.skills ?? []
    },
  }
}

/** A path the session may open in a tab: an existing file inside its project folder */
export function openableProjectFile(
  projectRoot: string,
  path: string,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (!path) return undefined
  const full = isAbsolute(path) ? path : join(projectRoot, path)
  const root = comparablePath(projectRoot, projectRoot, platform)
  if (!isInsidePath(comparablePath(full, root, platform), root, platform)) return undefined
  try {
    if (!statSync(full).isFile()) return undefined
  } catch {
    return undefined
  }
  return existsSync(dirname(full)) ? full : undefined
}
