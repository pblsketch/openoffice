import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import type { SkillProposal } from '@genoffice/agent-core'
import type {
  UserSkillPreviewInput,
  UserSkillsResult,
} from '@genoffice/electron-utils/user-skills-channels'
import { productName, type Lang } from '@genoffice/i18n'
import { safeExternalUrl } from '@genoffice/electron-utils'
import type { AgentSessionEvent } from '@genoffice/ai-provider/agent-session'
import type { AiSubscriptionProviderId, AiSubscriptionStatus } from '@genoffice/ai-provider'
import {
  AGENT_BLOCKED_PROVIDERS,
  AGENT_CHANNELS,
  AGENT_MODES,
  AGENT_PROVIDERS,
  AGENT_WARNING_VERSION,
  agentProjectPrefsPatch,
  normalizeAgentPrefs,
  withRecentFolder,
  type AgentAllowScope,
  type AgentConnection,
  type AgentEventView,
  type AgentInit,
  type AgentMode,
  type AgentPrefs,
  type AgentProjectPrefs,
  type AgentProjectSkillsView,
  type AgentProvider,
  type AgentStartResponse,
  type AgentTemplateAsIs,
  type AgentTemplateBlank,
  type AgentTemplateCheck,
} from '../../shared/agent-api'
import { readAgentProjectPref, writeAgentProjectPref } from '../app-settings'
import { AGENT_HOME_OPEN_CHANNEL } from '../../shared/agent-home-channel'
import { agentText } from '../../renderer/src/i18n/strings-agent'
import {
  agentProtectedPaths,
  createAgentManager,
  openableProjectFile,
  type AgentManagerDeps,
  type AgentMcpSession,
} from './agent-sessions'
import type { AgentSkillToolHooks } from './agent-mcp'
import {
  agentSkillProposalOf,
  agentTemplateCandidates,
  candidateView,
  readTemplateCandidate,
  templateRedactionOf,
  type AgentOpenTab,
  type AgentSessionSkillName,
  type AgentSkillListEntry,
  type AgentTemplateCandidate,
} from './agent-skills'

/**
 * The agent window (decision 0032): a window of its own beside the main one,
 * so the person can watch an open document change while the agent works. It
 * owns its sessions; closing it ends them.
 */

/** The template preview's opener (the shell's templateTabs.openPreview) as the window uses it */
export type AgentTemplatePreviewOpener = (
  owner: {
    readonly id: number
    isDestroyed(): boolean
    send(channel: string, payload: unknown): void
  },
  input: UserSkillPreviewInput,
) => Promise<UserSkillsResult<{ tabId: string; previewId: string }>>

export interface AgentWindowDeps extends Omit<
  AgentManagerDeps,
  'emit' | 'language' | 'statuses' | 'startAppMcp'
> {
  /**
   * start a session's own MCP server with the window's skill tools; absent when
   * the app has no editors to offer
   */
  startAppMcp?:
    | ((
        projectRoot: string,
        extra: { skillTools: AgentSkillToolHooks },
      ) => Promise<{ url: string; token: string; stop(): Promise<void> }>)
    | undefined
  /** every skill with its state (the skills service's list), for a card that changes one */
  listSkills?: (() => Promise<AgentSkillListEntry[]>) | undefined
  /** open a template preview tab (spec 5.6); the window hears its end */
  openTemplatePreview?: AgentTemplatePreviewOpener | undefined
  parentWindow(): BrowserWindow | null
  lang(): Lang
  theme(): 'light' | 'dark' | 'system'
  statuses(): Partial<Record<AiSubscriptionProviderId, AiSubscriptionStatus>>
  readPrefs(): AgentPrefs
  writePrefs(prefs: AgentPrefs): void
  /** open a file in a tab; false when nothing could open it */
  openPath(path: string): boolean
  /**
   * the Codex choices remembered for a project folder; by default the app
   * settings file in the data folder (`agentProjectPrefs`)
   */
  readProjectPrefs?: ((folder: string) => AgentProjectPrefs) | undefined
  writeProjectPrefs?:
    ((folder: string, patch: Partial<AgentProjectPrefs>) => AgentProjectPrefs) | undefined
  /** a project folder's own skills and the person's choice for them (decision 0064) */
  projectSkills?:
    | {
        view(folder: string): Promise<AgentProjectSkillsView>
        set(folder: string, on: boolean): Promise<AgentProjectSkillsView>
      }
    | undefined
}

/** The app settings file, as the shell keeps it in the data folder */
function appSettingsPath(userData: string): string {
  return join(userData, 'app-settings.json')
}

function readProjectPrefsOf(d: AgentWindowDeps, folder: string): AgentProjectPrefs {
  return d.readProjectPrefs
    ? d.readProjectPrefs(folder)
    : readAgentProjectPref(appSettingsPath(d.userData), folder)
}

function writeProjectPrefsOf(
  d: AgentWindowDeps,
  folder: string,
  patch: Partial<AgentProjectPrefs>,
): AgentProjectPrefs {
  return d.writeProjectPrefs
    ? d.writeProjectPrefs(folder, patch)
    : writeAgentProjectPref(appSettingsPath(d.userData), folder, patch)
}

/**
 * What a Codex session gets from the folder's remembered choices: its web
 * search and whether commands reach the internet. Claude Code takes neither.
 */
export function agentCodexStartChoices(
  provider: AgentProvider,
  prefs: AgentProjectPrefs,
): { webSearch: AgentProjectPrefs['codexWebSearch']; network: boolean } | undefined {
  return provider === 'codex'
    ? { webSearch: prefs.codexWebSearch, network: prefs.codexNetwork === true }
    : undefined
}

/** The person's answer as the session takes it; only an allow can last the session */
export function agentPermissionAnswer(
  allow: unknown,
  scope: unknown,
): { allow: true; scope: AgentAllowScope } | { allow: false } {
  if (allow !== true) return { allow: false }
  return { allow: true, scope: scope === 'session' ? 'session' : 'once' }
}

let deps: AgentWindowDeps | null = null
let win: BrowserWindow | null = null
let manager: ReturnType<typeof createAgentManager> | null = null
let ipcRegistered = false

/** The agent window's own page: the skills gateway lets it make the install-preview calls */
export function isAgentWindowContents(sender: WebContents): boolean {
  return !!win && !win.isDestroyed() && sender === win.webContents
}

/** A skill card shown in the window: its session and the template candidates it offered */
export interface ShownProposal {
  ownerId: number
  sessionId: string
  proposal: SkillProposal
  candidates: AgentTemplateCandidate[]
}

/** Cards kept for their template buttons (tunable); the oldest go first */
const MAX_SHOWN_PROPOSALS = 20
const shownProposals = new Map<string, ShownProposal>()

function keepProposal(shown: ShownProposal): void {
  shownProposals.set(shown.proposal.key, shown)
  while (shownProposals.size > MAX_SHOWN_PROPOSALS) {
    const oldest = shownProposals.keys().next().value
    if (oldest === undefined) break
    shownProposals.delete(oldest)
  }
}

/** The page a session reports to, while its window is open and still the session's owner */
export interface AgentSkillWindow {
  send(channel: string, payload: unknown): void
}

/** What the two skill tools of a session need besides the window */
export interface AgentSkillToolsDeps {
  /** the session's window, or null once it is closed */
  window(): AgentSkillWindow | null
  listSkills?: (() => Promise<AgentSkillListEntry[]>) | undefined
  /** the skills of the session's copy, by the names the model knows them under */
  sessionSkills?: (() => readonly AgentSessionSkillName[]) | undefined
  /** where the shown cards are kept for their template buttons */
  keep(shown: ShownProposal): void
  newKey(): string
}

/**
 * The two skill tools of one session (spec 6.3, 6.4): a card or an install
 * proposal in the session's window. Nothing is written or installed here;
 * the person's clicks in the window do that through the skills service.
 */
export function agentSkillToolsFor(
  session: AgentMcpSession,
  projectRoot: string,
  d: AgentSkillToolsDeps,
): AgentSkillToolHooks {
  return {
    async proposeSkill(input, context) {
      if (!d.window()) throw new Error('The agent window is closed; the card cannot be shown.')
      const list = d.listSkills ? await d.listSkills().catch(() => []) : []
      const made = agentSkillProposalOf(input, list, d.newKey(), d.sessionSkills?.() ?? [])
      if (!made.ok) throw new Error(made.message)
      let tabs: AgentOpenTab[] = []
      try {
        tabs = await context.openTabs()
      } catch {
        // the project folder's files are still offered
      }
      const { candidates, selected } = await agentTemplateCandidates({
        projectRoot,
        tabs,
        suggested: input.suggestedTemplatePath,
      })
      const owner = d.window()
      if (!owner) throw new Error('The agent window is closed; the card cannot be shown.')
      d.keep({ ...session, proposal: made.proposal, candidates })
      owner.send(AGENT_CHANNELS.skillProposal, {
        sessionId: session.sessionId,
        proposal: made.proposal,
        candidates: candidates.map(candidateView),
        selected,
      })
    },
    async proposeInstall(address) {
      const owner = d.window()
      if (!owner) throw new Error('The agent window is closed; the proposal cannot be shown.')
      owner.send(AGENT_CHANNELS.installProposal, {
        sessionId: session.sessionId,
        key: d.newKey(),
        address,
      })
    },
  }
}

/** The window's page while it is open and still the owner of the session */
function liveOwner(ownerId: number): AgentSkillWindow | null {
  if (!win || win.isDestroyed() || win.webContents.id !== ownerId) return null
  const contents = win.webContents
  return { send: (channel, payload) => contents.send(channel, payload) }
}

/** A card's candidate, asked for by the window that was shown the card */
function shownCandidate(
  event: IpcMainInvokeEvent,
  proposalKey: unknown,
  candidateId: unknown,
): { shown: ShownProposal; candidate: AgentTemplateCandidate } | null {
  const owner = ownerOf(event)
  if (owner === null || typeof proposalKey !== 'string' || typeof candidateId !== 'string') {
    return null
  }
  const shown = shownProposals.get(proposalKey)
  if (!shown || shown.ownerId !== owner) return null
  const candidate = shown.candidates.find((c) => c.id === candidateId)
  return candidate ? { shown, candidate } : null
}

/** Whether the candidate is open in a tab now (a PDF's marks are then the editor's) */
function openInTab(candidate: AgentTemplateCandidate): boolean {
  const key = candidate.path.toLowerCase()
  return (
    candidate.from === 'tab' ||
    (deps?.openDocuments() ?? []).some((path) => path.toLowerCase() === key)
  )
}

/** Read a candidate and tell whether it can hold a redaction mark */
async function readCandidate(candidate: AgentTemplateCandidate) {
  const homeDir = deps?.homeDir ?? homedir()
  const read = await readTemplateCandidate(candidate.path, {
    homeDir,
    protectedPaths: deps ? agentProtectedPaths(homeDir, deps.userData) : [],
  })
  if (!read.ok) return read
  const redaction = await templateRedactionOf(candidate.fileName, read.bytes, openInTab(candidate))
  return { ok: true as const, bytes: read.bytes, redaction }
}

/** What the window shows of an event: no program output beyond the model's own words */
export function agentEventView(event: AgentSessionEvent): AgentEventView {
  switch (event.type) {
    case 'started':
      return {
        type: 'started',
        provider: event.provider,
        model: event.model,
        skills: event.skills.length,
      }
    case 'permission': {
      const { id, provider: _provider, ...action } = event.request
      return { type: 'permission', id, action }
    }
    case 'error':
      // the message can carry program output (paths, diagnostics); the window shows the kind
      return { type: 'error', kind: event.kind }
    default:
      return event
  }
}

/** Whether each program can start a session now, as the window offers it */
export function agentConnections(
  statuses: Partial<Record<AiSubscriptionProviderId, AiSubscriptionStatus>>,
  meteredAccepted: Partial<Record<AiSubscriptionProviderId, boolean>> | undefined,
  blocked: readonly AgentProvider[] = AGENT_BLOCKED_PROVIDERS,
): Record<AgentProvider, AgentConnection> {
  const out = {} as Record<AgentProvider, AgentConnection>
  for (const provider of AGENT_PROVIDERS) {
    const status = statuses[provider]
    if (blocked.includes(provider)) out[provider] = 'blocked'
    else if (!status || status.state === 'checking') out[provider] = 'checking'
    else if (status.state === 'ready') out[provider] = 'ready'
    else if (
      status.state === 'metered' &&
      status.meteredAccepted === true &&
      meteredAccepted?.[provider] === true
    ) {
      out[provider] = 'metered-accepted'
    } else out[provider] = 'unavailable'
  }
  return out
}

function ownerOf(event: IpcMainInvokeEvent): number | null {
  return win && !win.isDestroyed() && event.sender === win.webContents ? event.sender.id : null
}

function registerIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle(AGENT_CHANNELS.getInit, (event): AgentInit | null => {
    if (ownerOf(event) === null || !deps) return null
    return {
      lang: deps.lang(),
      prefs: deps.readPrefs(),
      connections: agentConnections(deps.statuses(), deps.aiSettings().meteredAccepted),
    }
  })

  ipcMain.handle(AGENT_CHANNELS.getTheme, () => deps?.theme() ?? 'system')

  // Home opens the window; nothing else may
  ipcMain.handle(AGENT_HOME_OPEN_CHANNEL, (event) => {
    const home = deps?.parentWindow()
    if (!home || home.isDestroyed() || event.sender !== home.webContents) return
    openAgentWindow()
  })

  ipcMain.handle(AGENT_CHANNELS.pickFolder, async (event): Promise<string | null> => {
    if (ownerOf(event) === null || !win) return null
    const picked = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return picked.canceled || !picked.filePaths[0] ? null : picked.filePaths[0]
  })

  ipcMain.handle(AGENT_CHANNELS.setPrefs, (event, update: unknown): AgentPrefs | null => {
    if (ownerOf(event) === null || !deps) return null
    const current = deps.readPrefs()
    const patch = normalizeAgentPrefs({
      ...current,
      ...(update && typeof update === 'object' ? update : {}),
    })
    // the window cannot add folders to the list or claim a newer warning than it showed
    const next: AgentPrefs = {
      ...patch,
      recentFolders: current.recentFolders.filter((f) => patch.recentFolders.includes(f)),
      warningAccepted: Math.min(patch.warningAccepted, AGENT_WARNING_VERSION),
    }
    deps.writePrefs(next)
    return next
  })

  ipcMain.handle(AGENT_CHANNELS.getProjectPrefs, (event, folder: unknown) => {
    if (ownerOf(event) === null || !deps) return null
    if (typeof folder !== 'string' || !isAbsolute(folder)) return null
    try {
      return readProjectPrefsOf(deps, folder)
    } catch {
      return null
    }
  })

  ipcMain.handle(AGENT_CHANNELS.setProjectPrefs, (event, folder: unknown, patch: unknown) => {
    if (ownerOf(event) === null || !deps) return null
    if (typeof folder !== 'string' || !isAbsolute(folder)) return null
    try {
      return writeProjectPrefsOf(deps, folder, agentProjectPrefsPatch(patch))
    } catch {
      return null
    }
  })

  ipcMain.handle(AGENT_CHANNELS.getProjectSkills, async (event, folder: unknown) => {
    if (ownerOf(event) === null || !deps?.projectSkills) return null
    if (typeof folder !== 'string' || !isAbsolute(folder)) return null
    try {
      return await deps.projectSkills.view(folder)
    } catch {
      return null
    }
  })

  ipcMain.handle(AGENT_CHANNELS.setProjectSkills, async (event, folder: unknown, on: unknown) => {
    if (ownerOf(event) === null || !deps?.projectSkills) return null
    if (typeof folder !== 'string' || !isAbsolute(folder)) return null
    try {
      return await deps.projectSkills.set(folder, on === true)
    } catch {
      return null
    }
  })

  ipcMain.handle(
    AGENT_CHANNELS.start,
    async (event, request: unknown): Promise<AgentStartResponse> => {
      const owner = ownerOf(event)
      if (owner === null || !deps || !manager) return { ok: false, reason: 'start-failed' }
      const value = (request && typeof request === 'object' ? request : {}) as Record<
        string,
        unknown
      >
      const provider = value.provider as AgentProvider
      const mode = value.mode as AgentMode
      const folder = typeof value.folder === 'string' ? value.folder : ''
      if (!AGENT_PROVIDERS.includes(provider) || !AGENT_MODES.includes(mode)) {
        return { ok: false, reason: 'start-failed' }
      }
      if (AGENT_BLOCKED_PROVIDERS.includes(provider))
        return { ok: false, reason: 'provider-blocked' }
      const prefs = deps.readPrefs()
      // the warning is a precondition the main process checks, not only the window
      if (prefs.warningAccepted < AGENT_WARNING_VERSION)
        return { ok: false, reason: 'not-accepted' }
      // the folder's remembered Codex choices, read here rather than taken from the window
      let codex: ReturnType<typeof agentCodexStartChoices>
      try {
        codex = agentCodexStartChoices(provider, readProjectPrefsOf(deps, folder))
      } catch {
        return { ok: false, reason: 'bad-folder' }
      }
      const result = await manager.start(owner, { provider, mode, projectRoot: folder, codex })
      if (!result.ok) return { ok: false, reason: result.reason, kind: result.kind }
      deps.writePrefs(withRecentFolder({ ...prefs, provider, mode }, folder))
      return { ok: true, sessionId: result.sessionId, skills: result.skills }
    },
  )

  ipcMain.handle(AGENT_CHANNELS.send, async (event, sessionId: unknown, text: unknown) => {
    const owner = ownerOf(event)
    if (owner === null || !manager || typeof sessionId !== 'string' || typeof text !== 'string')
      return false
    if (!text.trim()) return false
    try {
      await manager.send(owner, sessionId, text)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle(
    AGENT_CHANNELS.answer,
    (event, sessionId: unknown, requestId: unknown, allow: unknown, scope: unknown) => {
      const owner = ownerOf(event)
      if (
        owner === null ||
        !manager ||
        typeof sessionId !== 'string' ||
        typeof requestId !== 'string'
      )
        return
      manager.answer(owner, sessionId, requestId, agentPermissionAnswer(allow, scope))
    },
  )

  ipcMain.handle(AGENT_CHANNELS.stop, (event, sessionId: unknown) => {
    const owner = ownerOf(event)
    if (owner === null || !manager || typeof sessionId !== 'string') return
    manager.stop(owner, sessionId)
  })

  ipcMain.handle(
    AGENT_CHANNELS.templateCheck,
    async (event, proposalKey: unknown, candidateId: unknown): Promise<AgentTemplateCheck> => {
      const found = shownCandidate(event, proposalKey, candidateId)
      if (!found) return { ok: false, reason: 'not-found' }
      const read = await readCandidate(found.candidate)
      return read.ok ? { ok: true, redaction: read.redaction } : read
    },
  )

  // "save the document as it is": the bytes go to the card's Save only when no mark can be in them
  ipcMain.handle(
    AGENT_CHANNELS.templateAsIs,
    async (event, proposalKey: unknown, candidateId: unknown): Promise<AgentTemplateAsIs> => {
      const found = shownCandidate(event, proposalKey, candidateId)
      if (!found) return { ok: false, reason: 'not-found' }
      const read = await readCandidate(found.candidate)
      if (!read.ok) return read
      if (read.redaction !== 'none') return { ok: false, reason: read.redaction }
      return { ok: true, bytes: read.bytes, fileName: found.candidate.fileName }
    },
  )

  // "make a blank template": the copy opens in a preview tab whose AI clears it (spec 5.6, 6.3)
  ipcMain.handle(
    AGENT_CHANNELS.templateBlank,
    async (
      event,
      proposalKey: unknown,
      candidateId: unknown,
      request: unknown,
    ): Promise<AgentTemplateBlank> => {
      const found = shownCandidate(event, proposalKey, candidateId)
      const open = deps?.openTemplatePreview
      if (!found || !open) return { ok: false, reason: 'not-found' }
      const value = (request && typeof request === 'object' ? request : {}) as Record<
        string,
        unknown
      >
      const tabTitle = typeof value.tabTitle === 'string' ? value.tabTitle.slice(0, 300) : ''
      const text = typeof value.text === 'string' ? value.text.slice(0, 10_000) : ''
      if (!tabTitle || !text) return { ok: false, reason: 'invalid' }
      const read = await readCandidate(found.candidate)
      if (!read.ok) return read
      const sender = event.sender
      try {
        const opened = await open(
          {
            id: sender.id,
            isDestroyed: () => sender.isDestroyed(),
            send: (channel, payload) => sender.send(channel, payload),
          },
          {
            bytes: read.bytes,
            fileName: found.candidate.fileName,
            title: found.candidate.title,
            tabTitle,
            text,
            // the preview's "save as it is" stays blocked unless the original surely has no mark
            originalRedacted: read.redaction !== 'none',
            proposal: found.shown.proposal,
            draft: value.draft,
          },
        )
        return opened.ok
          ? { ok: true, tabId: opened.tabId, previewId: opened.previewId }
          : { ok: false, reason: opened.reason }
      } catch {
        return { ok: false, reason: 'failed' }
      }
    },
  )

  ipcMain.handle(AGENT_CHANNELS.openFile, (event, sessionId: unknown, path: unknown) => {
    const owner = ownerOf(event)
    if (
      owner === null ||
      !manager ||
      !deps ||
      typeof sessionId !== 'string' ||
      typeof path !== 'string'
    ) {
      return false
    }
    const root = manager.projectRootOf(owner, sessionId)
    const file = root ? openableProjectFile(root, path) : undefined
    return file ? deps.openPath(file) : false
  })
}

export function configureAgentWindow(next: AgentWindowDeps): void {
  deps = next
  const startAppMcp = next.startAppMcp
  manager = createAgentManager({
    ...next,
    statuses: () => next.statuses(),
    language: () => next.lang(),
    startAppMcp: startAppMcp
      ? (projectRoot, session) =>
          startAppMcp(projectRoot, {
            skillTools: agentSkillToolsFor(session, projectRoot, {
              window: () => liveOwner(session.ownerId),
              listSkills: next.listSkills,
              sessionSkills: () => manager?.skillsOf(session.ownerId, session.sessionId) ?? [],
              keep: keepProposal,
              newKey: () => randomUUID(),
            }),
          })
      : undefined,
    emit: (ownerId, sessionId, event) => {
      if (!win || win.isDestroyed() || win.webContents.id !== ownerId) return
      win.webContents.send(AGENT_CHANNELS.event, { sessionId, event: agentEventView(event) })
    },
  })
  registerIpc()
}

export function openAgentWindow(): void {
  const d = deps
  if (!d) throw new Error('the agent window is not configured')
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    return
  }
  const lang = d.lang()
  const next = new BrowserWindow({
    width: 560,
    height: 760,
    minWidth: 440,
    minHeight: 520,
    show: false,
    center: true,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: `${agentText(lang, 'windowTitle')} - ${productName(lang)}`,
    webPreferences: {
      preload: join(__dirname, '../preload/agent.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win = next
  const ownerId = next.webContents.id
  next.removeMenu()
  next.webContents.setWindowOpenHandler(({ url }) => {
    const target = safeExternalUrl(url)
    if (target) void shell.openExternal(target)
    return { action: 'deny' }
  })
  next.once('ready-to-show', () => next.show())
  next.on('closed', () => {
    manager?.stopOwner(ownerId)
    if (win === next) win = null
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void next.loadURL(`${process.env.ELECTRON_RENDERER_URL}/agent.html`)
  } else {
    void next.loadFile(join(__dirname, '../renderer/agent.html'))
  }
}

/** The app is quitting: every session ends with it */
export function stopAgentSessions(): void {
  manager?.stopAll()
}
