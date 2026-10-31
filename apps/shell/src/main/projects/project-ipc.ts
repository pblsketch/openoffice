import { isAbsolute, join } from 'node:path'
import {
  isValidProjectId,
  PROJECT_FOLDER_NAMES,
  PROJECT_FOLDER_CHANNELS,
  PROJECT_FOLDER_EVENTS,
  type AddFolderResult,
  type AppendProjectChatArgs,
  type CreateProjectResult,
  type LegacyDocumentChat,
  type OpenProjectChatEvent,
  type OpenProjectScreenEvent,
  type ProjectChangedEvent,
  type ProjectChangedPart,
  type ProjectChatAppendedEvent,
  type ProjectChatRef,
  type ProjectEditor,
  type ProjectFolderEventMethod,
  type ProjectId,
  type ProjectMemoryOp,
  type ProjectScreenSection,
  type ProjectSelection,
  type ProjectSettings,
  type ProjectTrustPrompt,
} from '@genoffice/project-store'
import type { KbRunScopes } from '../knowledge-base'
import type { ProjectChatStore } from './chat-store'
import type { ProjectFolderPickPurpose, ProjectTrustChoice } from './project-dialog-text'
import { listIgnoredFiles, toEntry, withCloudFlags, type CloudOnlyResolver } from './project-files'
import type { NewProjectRequest, ProjectGuide, SelectionTarget, TrustAsk } from './project-guide'
import { PROJECT_SCOPE_UNKNOWN, type ProjectFolderTools } from './project-tools'
import { relativeInside } from './paths'

/**
 * The shell main process's side of the project folder bridge (decision 0088,
 * `PROJECT_FOLDER_CHANNELS`). Every request is judged by the window that sent
 * it: main finds that window's editor and saved document itself, so a renderer
 * names project and chat ids only, never a path or a list a scope depends on.
 *
 * It also keeps which window shows which chat, so a message one window records
 * reaches the other windows with the same chat open (spec 5.3.3), tells every
 * listening window when a request wrote a project's memory, instructions,
 * switches or chats (`onProjectChanged`), and holds an
 * "open this chat" or "show the project screen" request for a window that is
 * not listening yet (a tab still loading) until it listens.
 *
 * Electron stays outside: dialogs, window lookup, sending and opening files
 * arrive as functions, so the whole layer is testable with fakes.
 */

/** The calling window as main identified it */
export type ProjectWindow =
  | { kind: 'home' }
  | { kind: 'editor'; editor: Exclude<ProjectEditor, 'home'>; docPath: string | null }

export interface ProjectFolderServices {
  guide: Pick<
    ProjectGuide,
    | 'listProjects'
    | 'addFolder'
    | 'relocateProject'
    | 'getDefaultParentFolder'
    | 'createProject'
    | 'removeFromList'
    | 'setPinned'
    | 'renameProject'
    | 'retryUnwritable'
    | 'projectRoot'
    | 'getSelection'
    | 'setSelection'
    | 'adoptFolderHint'
    | 'readContext'
    | 'editMemory'
    | 'saveMemory'
    | 'applyMemoryConsolidation'
    | 'undoMemoryConsolidation'
    | 'getProjectDetail'
    | 'getSettings'
    | 'setSettings'
    | 'decideTrust'
    | 'saveInstructions'
    | 'addIgnore'
    | 'removeIgnore'
    | 'aiVisibility'
  >
  chats: Pick<
    ProjectChatStore,
    | 'newChat'
    | 'listChats'
    | 'openChat'
    | 'append'
    | 'renameChat'
    | 'deleteChat'
    | 'attachDocument'
    | 'chatForDocument'
    | 'chatInfo'
    | 'onAppended'
  >
  tools: Pick<ProjectFolderTools, 'openScope' | 'closeScope' | 'listFiles' | 'search' | 'read'>
  /** the run scopes `tools` mints (for `remember`, which the tools class does not carry) */
  scopes: Pick<KbRunScopes, 'projectOf'>
}

export interface ProjectDialogs {
  /** OS folder picker parented to `owner`'s window; null when closed */
  pickFolder(owner: number, purpose: ProjectFolderPickPurpose): Promise<string | null>
  /** "Use this folder as the project?"; true only on the person's yes */
  confirmUseExisting(owner: number, folderPath: string): Promise<boolean>
  /** The first-time trust prompt (spec 5.10) over `owner`'s window; null when closed */
  askTrust(owner: number, prompt: ProjectTrustPrompt): Promise<ProjectTrustChoice>
  /**
   * After [view all] opened the files in the app: resolves true when the person
   * comes back to `owner`'s page (the prompt then shows again), false when that
   * page is gone (the addition is cancelled). See `waitForPageReturn`.
   */
  waitForReturn(owner: number): Promise<boolean>
}

export interface ProjectIpcDeps {
  /** created on first use (the guide needs the final app data folder) */
  services: () => ProjectFolderServices
  /** registers one request channel; `sender` is the calling webContents id */
  handle: (channel: string, handler: (sender: number, args: unknown) => unknown) => void
  /** the window behind a webContents id; null for anything that is not an AI window */
  windowOf: (sender: number) => ProjectWindow | null
  /** sends one event; false when the window is gone */
  send: (target: number, channel: string, payload: unknown) => boolean
  dialogs: ProjectDialogs
  /** this document's earlier per-document chat (project-store), found without creating one */
  legacyChatFor: (docPath: string) => LegacyDocumentChat | null
  /** opens a folder in Explorer / Finder */
  openFolder: (path: string) => Promise<void>
  /** opens (or focuses) a document through the shell's file-open path; its webContents id, or null */
  openDocument: (path: string) => number | null
  /** switches to the home tab; the home renderer's webContents id, or null */
  showHome: () => number | null
  /** the list, a folder or a project's place changed (the search index follows) */
  projectsChanged: () => void
  /** "not on this PC" for the project screen's ignored-files list (a cached detector) */
  resolveCloudOnly?: CloudOnlyResolver
  /**
   * The project a create flow opened this untitled window in (spec 5.2, 6), or
   * null. Asked only while the window's own panel has chosen nothing yet.
   */
  presetProjectOf?: (sender: number) => Promise<ProjectId | null> | ProjectId | null
  platform?: NodeJS.Platform
}

export interface ProjectIpcController {
  /** a window's bridge started or stopped listening to one event */
  listen(sender: number, method: unknown, listening: unknown): void
  /** a window closed: forget everything about it */
  forget(sender: number): void
  /**
   * a window started loading a page (a reload): its listeners and its chat are
   * gone, but what is held for it stays until the new page listens
   */
  reset(sender: number): void
  /** the project an untitled document's panel chose (for saving new documents later) */
  untitledProject(sender: number): ProjectId | null
  /**
   * The project this window's AI panel has chosen now (spec 6): the panel's last
   * answer when it has asked, else the starting selection main would give it.
   * Null for "no project" and for anything that is not an AI window.
   */
  windowProject(sender: number): Promise<ProjectId | null>
}

/** a request that names no usable project or chat id */
export const PROJECT_IPC_BAD_REQUEST = 'invalid project folder request'

/** the request came from a window that has no AI panel the shell knows */
export const PROJECT_IPC_UNKNOWN_WINDOW = 'not an AI window'

const EVENT_METHODS = Object.keys(PROJECT_FOLDER_EVENTS) as ProjectFolderEventMethod[]

function record(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}
}

function projectIdOf(raw: unknown): ProjectId {
  const id = record(raw).projectId
  if (!isValidProjectId(id)) throw new Error(PROJECT_IPC_BAD_REQUEST)
  return id
}

function chatRefOf(raw: unknown): ProjectChatRef {
  const args = record(raw)
  if (!isValidProjectId(args.projectId) || !isValidProjectId(args.chatId)) {
    throw new Error(PROJECT_IPC_BAD_REQUEST)
  }
  return { projectId: args.projectId, chatId: args.chatId }
}

function textOf(raw: unknown, key: string): string {
  const value = record(raw)[key]
  if (typeof value !== 'string') throw new Error(PROJECT_IPC_BAD_REQUEST)
  return value
}

function memoryOpOf(value: unknown): ProjectMemoryOp {
  const op = record(value)
  if (op.op === 'add' && typeof op.text === 'string') return { op: 'add', text: op.text }
  if (op.op === 'remove' && typeof op.text === 'string') return { op: 'remove', text: op.text }
  if (op.op === 'replace' && typeof op.old === 'string' && typeof op.new === 'string') {
    return { op: 'replace', old: op.old, new: op.new }
  }
  throw new Error(PROJECT_IPC_BAD_REQUEST)
}

function sectionOf(value: unknown): ProjectScreenSection | undefined {
  return value === 'instructions' || value === 'memory' ? value : undefined
}

/** a folder-relative path from a chat's `documents`, made absolute only when it stays inside */
function documentPathIn(root: string, rel: string, platform: NodeJS.Platform): string | null {
  if (typeof rel !== 'string' || !rel || isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) return null
  const segments = rel.split(/[\\/]/).filter((segment) => segment !== '')
  if (segments.length === 0 || segments.some((s) => s === '..' || s === '.')) return null
  const path = join(root, ...segments)
  return relativeInside(root, path, platform) !== null ? path : null
}

export function registerProjectFolderIpc(deps: ProjectIpcDeps): ProjectIpcController {
  const C = PROJECT_FOLDER_CHANNELS
  const platform = deps.platform ?? process.platform

  // ── per-window state ──
  /** chat key (`projectId/chatId`) → windows showing that chat */
  const watchers = new Map<string, Set<number>>()
  /** window → the chat it shows */
  const watching = new Map<number, string>()
  /** window → events its bridge listens to */
  const listening = new Map<number, Set<ProjectFolderEventMethod>>()
  /** window → the latest event per kind it was sent before it listened */
  const held = new Map<number, Map<ProjectFolderEventMethod, unknown>>()
  /** window of an untitled document → the project its panel chose */
  const untitled = new Map<number, ProjectId | null>()
  /** window → the selection its panel was last given (getSelection / setSelection) */
  const chosen = new Map<number, ProjectId | null>()

  let services: ProjectFolderServices | null = null
  const svc = (): ProjectFolderServices => {
    if (services) return services
    services = deps.services()
    services.chats.onAppended((event, sender) => forward(event, sender.key))
    return services
  }

  const keyOf = (ref: ProjectChatRef) => `${ref.projectId}/${ref.chatId}`

  const unwatch = (sender: number): void => {
    const key = watching.get(sender)
    if (key === undefined) return
    watching.delete(sender)
    const set = watchers.get(key)
    set?.delete(sender)
    if (set && set.size === 0) watchers.delete(key)
  }

  const watch = (sender: number, ref: ProjectChatRef): void => {
    const key = keyOf(ref)
    if (watching.get(sender) === key) return
    unwatch(sender)
    watching.set(sender, key)
    const set = watchers.get(key) ?? new Set<number>()
    set.add(sender)
    watchers.set(key, set)
  }

  const reset = (sender: number): void => {
    unwatch(sender)
    listening.delete(sender)
    untitled.delete(sender)
    chosen.delete(sender)
  }

  const forget = (sender: number): void => {
    reset(sender)
    held.delete(sender)
  }

  /** a recorded message goes to every other window showing the same chat */
  const forward = (event: ProjectChatAppendedEvent, from: unknown): void => {
    const set = watchers.get(keyOf(event))
    if (!set) return
    for (const target of [...set]) {
      if (target === from) continue
      if (!deps.send(target, PROJECT_FOLDER_EVENTS.onChatMessageAppended, event)) forget(target)
    }
  }

  /**
   * A request wrote part of a project: every window listening hears it, the
   * sender included. Sent before the request answers, so a window reading
   * the answer already knows. Nothing is held for a window not listening yet:
   * it reads the project when it starts.
   */
  const announce = (projectId: ProjectId, part: ProjectChangedPart): void => {
    const event: ProjectChangedEvent = { projectId, part }
    for (const [target, methods] of [...listening]) {
      if (!methods.has('onProjectChanged')) continue
      if (!deps.send(target, PROJECT_FOLDER_EVENTS.onProjectChanged, event)) forget(target)
    }
  }

  /** runs a write and announces it when `wrote` says it went through */
  const announced = async <T>(
    projectId: ProjectId,
    part: ProjectChangedPart,
    write: Promise<T> | T,
    wrote: (result: T) => boolean = (result) =>
      (result as { status?: unknown } | null)?.status === 'ok',
  ): Promise<T> => {
    const result = await write
    if (wrote(result)) announce(projectId, part)
    return result
  }

  /** sends now when the window listens, else holds the latest of its kind until it does */
  const deliver = (target: number, method: ProjectFolderEventMethod, payload: unknown): void => {
    if (listening.get(target)?.has(method)) {
      if (deps.send(target, PROJECT_FOLDER_EVENTS[method], payload)) return
      forget(target)
      return
    }
    const waiting = held.get(target) ?? new Map<ProjectFolderEventMethod, unknown>()
    waiting.set(method, payload)
    held.set(target, waiting)
  }

  const windowOf = (sender: number): ProjectWindow => {
    const win = deps.windowOf(sender)
    if (!win) throw new Error(PROJECT_IPC_UNKNOWN_WINDOW)
    return win
  }

  const docPathOf = (win: ProjectWindow): string | null =>
    win.kind === 'editor' ? win.docPath : null

  const targetOf = async (sender: number, win: ProjectWindow): Promise<SelectionTarget> => {
    if (win.kind === 'home') return { kind: 'home' }
    if (win.docPath) return { kind: 'document', path: win.docPath }
    if (untitled.has(sender)) return { kind: 'untitled', projectId: untitled.get(sender) ?? null }
    // a tab a create flow opened in a project starts in it (spec 5.2)
    const preset = deps.presetProjectOf ? await deps.presetProjectOf(sender) : null
    return { kind: 'untitled', projectId: preset ?? null }
  }

  /**
   * [view all] in the trust prompt: the quoted files open in the app (Markdown
   * opens in the app's editor) and the chats folder in the file manager. The
   * paths are built here from the prompt main made, never from a request.
   * True when something opened in the app, so the prompt waits for the person.
   */
  const showTrustFiles = async (prompt: ProjectTrustPrompt): Promise<boolean> => {
    const N = PROJECT_FOLDER_NAMES
    const root = prompt.folderPath
    const files: Array<[string | null, string]> = [
      [prompt.instructions, join(root, N.dataDir, N.instructionsFile)],
      [prompt.memory, join(root, N.dataDir, N.memoryFile)],
      [prompt.agents, join(root, N.rootAgentsFile)],
      [prompt.claude, join(root, N.rootClaudeFile)],
    ]
    let opened = false
    for (const [text, path] of files) {
      if (text === null) continue
      if (deps.openDocument(path) !== null) opened = true
    }
    if (prompt.foreignChats.length > 0) {
      try {
        await deps.openFolder(join(root, N.dataDir, N.chatsDir))
      } catch {
        // The prompt still lists the chats by title.
      }
    }
    return opened
  }

  /** The trust prompt over the asking window, again after each [view all], until an answer */
  const askTrustFor =
    (sender: number): TrustAsk =>
    async (prompt) => {
      for (;;) {
        const choice = await deps.dialogs.askTrust(sender, prompt)
        if (choice !== 'view') return choice
        if ((await showTrustFiles(prompt)) && !(await deps.dialogs.waitForReturn(sender))) {
          return null
        }
      }
    }

  /** the chat a document opens with (spec 5.3.1), checked against the list in both cases */
  const withInitialChat = async (
    win: ProjectWindow,
    selection: ProjectSelection,
  ): Promise<ProjectSelection> => {
    const docPath = docPathOf(win)
    if (!selection.projectId || !docPath) return { ...selection, initialChatId: null }
    const initialChatId = await svc().chats.chatForDocument(selection.projectId, docPath)
    return { ...selection, initialChatId }
  }

  const afterAdd = <T extends AddFolderResult | CreateProjectResult>(result: T): T => {
    if (result.status === 'added' || result.status === 'created') deps.projectsChanged()
    return result
  }

  // ── handlers: one per bridge request (a missing one is a type error) ──
  const handlers: {
    [K in keyof typeof C]: (sender: number, raw: unknown) => unknown
  } = {
    // ---- list ----
    listProjects: () => svc().guide.listProjects(),

    addFolder: async (sender): Promise<AddFolderResult> => {
      const folder = await deps.dialogs.pickFolder(sender, 'add')
      if (!folder) return { status: 'cancelled', stage: 'dialog' }
      return afterAdd(await svc().guide.addFolder(folder, askTrustFor(sender)))
    },

    getDefaultParentFolder: () => svc().guide.getDefaultParentFolder(),

    createProject: async (sender, raw): Promise<CreateProjectResult> => {
      const args = record(raw)
      const name = typeof args.name === 'string' ? args.name.trim() : ''
      if (!name) return { status: 'invalid-name' }
      // The place is main's to decide (spec 5.1): the default save folder, or a
      // parent the person picks in main's own folder picker. A path in the
      // request is never read.
      const request: NewProjectRequest = { name }
      if (args.otherPlace === true) {
        const parent = await deps.dialogs.pickFolder(sender, 'parent')
        if (!parent) return { status: 'cancelled', stage: 'dialog' }
        request.parentDir = parent
      }
      const ask = askTrustFor(sender)
      const created = await svc().guide.createProject(request, ask)
      if (created.status !== 'exists') return afterAdd(created)
      if (!(await deps.dialogs.confirmUseExisting(sender, created.folderPath))) {
        return { status: 'cancelled', stage: 'dialog' }
      }
      return afterAdd(await svc().guide.createProject({ ...request, useExisting: true }, ask))
    },

    removeFromList: async (_sender, raw) => {
      const projectId = projectIdOf(raw)
      await svc().guide.removeFromList(projectId)
      deps.projectsChanged()
      announce(projectId, 'settings')
    },

    setPinned: async (_sender, raw) => {
      const pinned = record(raw).pinned
      if (typeof pinned !== 'boolean') throw new Error(PROJECT_IPC_BAD_REQUEST)
      const projectId = projectIdOf(raw)
      await svc().guide.setPinned(projectId, pinned)
      announce(projectId, 'settings')
    },

    renameProject: (_sender, raw) => {
      const projectId = projectIdOf(raw)
      return announced(
        projectId,
        'settings',
        svc().guide.renameProject(projectId, textOf(raw, 'name')),
      )
    },

    relocateProject: async (sender, raw): Promise<AddFolderResult> => {
      const projectId = projectIdOf(raw)
      const folder = await deps.dialogs.pickFolder(sender, 'relocate')
      if (!folder) return { status: 'cancelled', stage: 'dialog' }
      return afterAdd(await svc().guide.relocateProject(projectId, folder, askTrustFor(sender)))
    },

    openInFileManager: async (_sender, raw) => {
      const root = svc().guide.projectRoot(projectIdOf(raw))
      if (root) await deps.openFolder(root)
    },

    retryUnwritable: (_sender, raw) => svc().guide.retryUnwritable(projectIdOf(raw)),

    // ---- selection for this window's document ----
    getSelection: async (sender) => {
      const win = windowOf(sender)
      const selection = await svc().guide.getSelection(await targetOf(sender, win))
      chosen.set(sender, selection.projectId)
      return withInitialChat(win, selection)
    },

    setSelection: async (sender, raw) => {
      const win = windowOf(sender)
      const value = record(raw).projectId
      const projectId = value === null ? null : isValidProjectId(value) ? value : undefined
      if (projectId === undefined) throw new Error(PROJECT_IPC_BAD_REQUEST)
      const target = await targetOf(sender, win)
      const selection = await svc().guide.setSelection(target, projectId)
      if (target.kind === 'untitled') untitled.set(sender, projectId)
      chosen.set(sender, selection.projectId)
      if (projectId === null) unwatch(sender)
      return withInitialChat(win, selection)
    },

    adoptFolderHint: async (sender): Promise<AddFolderResult> => {
      const docPath = docPathOf(windowOf(sender))
      if (!docPath) return { status: 'refused', reason: 'not-a-folder' }
      return afterAdd(await svc().guide.adoptFolderHint(docPath, askTrustFor(sender)))
    },

    // ---- one send ----
    readContext: (_sender, raw) => svc().guide.readContext(projectIdOf(raw)),
    openScope: (sender, raw) => svc().tools.openScope(sender, raw),
    closeScope: (sender, raw) => svc().tools.closeScope(sender, raw),

    // ---- tools ----
    listFiles: (sender, raw) => svc().tools.listFiles(sender, raw),
    search: (sender, raw) => svc().tools.search(sender, raw),
    read: (sender, raw) => svc().tools.read(sender, raw),
    remember: (sender, raw) => {
      // the project comes from the run scope this window holds, never from the request
      let projectId: ProjectId | null
      try {
        projectId = record(raw).scope === undefined ? null : svc().scopes.projectOf(sender, raw)
      } catch {
        projectId = null
      }
      if (!projectId) throw new Error(PROJECT_SCOPE_UNKNOWN)
      const change = memoryOpOf(record(raw).change)
      return announced(projectId, 'memory', svc().guide.editMemory(projectId, change, 'ai'))
    },

    // ---- memory ----
    editMemory: (_sender, raw) => {
      const projectId = projectIdOf(raw)
      const change = memoryOpOf(record(raw).change)
      return announced(projectId, 'memory', svc().guide.editMemory(projectId, change, 'person'))
    },
    saveMemory: (_sender, raw) => {
      const projectId = projectIdOf(raw)
      return announced(projectId, 'memory', svc().guide.saveMemory(projectId, textOf(raw, 'text')))
    },
    applyMemoryConsolidation: (_sender, raw) => {
      const entries = record(raw).entries
      if (!Array.isArray(entries)) throw new Error(PROJECT_IPC_BAD_REQUEST)
      const projectId = projectIdOf(raw)
      return announced(
        projectId,
        'memory',
        svc().guide.applyMemoryConsolidation({ projectId, entries: entries as string[] }),
      )
    },
    undoMemoryConsolidation: (_sender, raw) => {
      const projectId = projectIdOf(raw)
      return announced(
        projectId,
        'memory',
        svc().guide.undoMemoryConsolidation({ projectId, backupName: textOf(raw, 'backupName') }),
      )
    },

    // ---- chats ----
    listChats: async (sender, raw) => {
      const projectId = projectIdOf(raw)
      const docPath = docPathOf(windowOf(sender))
      const chats = await svc().chats.listChats(projectId)
      let legacy: LegacyDocumentChat | null = null
      if (docPath) {
        try {
          legacy = deps.legacyChatFor(docPath)
        } catch {
          legacy = null
        }
      }
      return { chats, legacy }
    },

    newChat: async (sender, raw) => {
      const projectId = projectIdOf(raw)
      const created = await svc().chats.newChat(projectId)
      watch(sender, { projectId, chatId: created.chatId })
      return created
    },

    openChat: async (sender, raw) => {
      const ref = chatRefOf(raw)
      const limit = record(raw).limit
      const opened = await svc().chats.openChat({
        ...ref,
        ...(typeof limit === 'number' ? { limit } : {}),
      })
      if (opened.status === 'ok') watch(sender, ref)
      return opened
    },

    appendChat: async (sender, raw) => {
      const ref = chatRefOf(raw)
      const win = windowOf(sender)
      const args = { ...record(raw), ...ref } as unknown as AppendProjectChatArgs
      const result = await svc().chats.append(args, {
        editor: win.kind === 'home' ? 'home' : win.editor,
        docPath: docPathOf(win),
        key: sender,
      })
      watch(sender, ref)
      // a saved message moves the chat in the lists (title, time, last editor)
      if (result.status === 'saved') announce(ref.projectId, 'chats')
      return result
    },

    renameChat: (_sender, raw) => {
      const ref = chatRefOf(raw)
      return announced(
        ref.projectId,
        'chats',
        svc().chats.renameChat({ ...ref, title: textOf(raw, 'title') }),
      )
    },

    deleteChat: async (sender, raw) => {
      const ref = chatRefOf(raw)
      const result = await svc().chats.deleteChat(ref)
      if (result.status === 'ok' && watching.get(sender) === keyOf(ref)) unwatch(sender)
      if (result.status === 'ok') announce(ref.projectId, 'chats')
      return result
    },

    attachDocument: async (sender, raw) => {
      const ref = chatRefOf(raw)
      // the path is this window's saved document, as the shell knows it
      const docPath = docPathOf(windowOf(sender))
      if (!docPath) return { status: 'ok' }
      return svc().chats.attachDocument(ref, docPath)
    },

    openDocumentChat: async (_sender, raw) => {
      const ref = chatRefOf(raw)
      const info = await svc().chats.chatInfo(ref)
      if (!info) return
      const event: OpenProjectChatEvent = ref
      let target: number | null = null
      const latest = info.documents.at(-1)
      const root = svc().guide.projectRoot(ref.projectId)
      if (latest && info.lastEditor !== 'home' && root) {
        const path = documentPathIn(root, latest, platform)
        if (path) target = deps.openDocument(path)
      }
      // no document (or one that cannot be opened), or a chat last used at home
      if (target === null) target = deps.showHome()
      if (target !== null) deliver(target, 'onOpenChat', event)
    },

    // ---- project screen ----
    getProjectDetail: (_sender, raw) => svc().guide.getProjectDetail(projectIdOf(raw)),
    getSettings: (_sender, raw) => svc().guide.getSettings(projectIdOf(raw)),
    setSettings: (_sender, raw) => {
      const patch = record(record(raw).settings)
      const settings: Partial<ProjectSettings> = {}
      if (typeof patch.memoryEnabled === 'boolean') settings.memoryEnabled = patch.memoryEnabled
      if (typeof patch.readAgentsFiles === 'boolean') {
        settings.readAgentsFiles = patch.readAgentsFiles
      }
      const projectId = projectIdOf(raw)
      return announced(
        projectId,
        'settings',
        svc().guide.setSettings(projectId, settings),
        () => true,
      )
    },
    decideTrust: (sender, raw) => {
      const decision = record(raw).decision
      if (decision !== 'use' && decision !== 'without') throw new Error(PROJECT_IPC_BAD_REQUEST)
      const projectId = projectIdOf(raw)
      return announced(
        projectId,
        'settings',
        svc().guide.decideTrust(projectId, decision, askTrustFor(sender)),
      )
    },
    saveInstructions: (_sender, raw) => {
      const projectId = projectIdOf(raw)
      return announced(
        projectId,
        'instructions',
        svc().guide.saveInstructions(projectId, textOf(raw, 'text')),
      )
    },
    addIgnore: (_sender, raw) => {
      const projectId = projectIdOf(raw)
      return announced(
        projectId,
        'settings',
        svc().guide.addIgnore(projectId, textOf(raw, 'relPath')),
      )
    },
    removeIgnore: (_sender, raw) => {
      const projectId = projectIdOf(raw)
      return announced(
        projectId,
        'settings',
        svc().guide.removeIgnore(projectId, textOf(raw, 'relPath')),
      )
    },
    listIgnoredFiles: async (_sender, raw) => {
      const visibility = await svc().guide.aiVisibility(projectIdOf(raw))
      if (!visibility) return []
      const files = await listIgnoredFiles(visibility)
      const flagged = deps.resolveCloudOnly
        ? await withCloudFlags(files, deps.resolveCloudOnly)
        : files
      return flagged.map(toEntry)
    },
    openProjectScreen: (_sender, raw) => {
      const projectId = projectIdOf(raw)
      const section = sectionOf(record(raw).section)
      const event: OpenProjectScreenEvent = { projectId, ...(section ? { section } : {}) }
      const home = deps.showHome()
      if (home !== null) deliver(home, 'onOpenProjectScreen', event)
    },
  }

  for (const name of Object.keys(handlers) as Array<keyof typeof C>) {
    deps.handle(C[name], handlers[name])
  }

  return {
    listen(sender, method, on) {
      if (!EVENT_METHODS.includes(method as ProjectFolderEventMethod)) return
      const event = method as ProjectFolderEventMethod
      const set = listening.get(sender) ?? new Set<ProjectFolderEventMethod>()
      if (on !== true) {
        set.delete(event)
        return
      }
      set.add(event)
      listening.set(sender, set)
      const waiting = held.get(sender)
      if (!waiting?.has(event)) return
      const payload = waiting.get(event)
      waiting.delete(event)
      if (waiting.size === 0) held.delete(sender)
      deliver(sender, event, payload)
    },
    forget,
    reset,
    untitledProject: (sender) => untitled.get(sender) ?? null,
    windowProject: async (sender) => {
      const win = deps.windowOf(sender)
      if (!win) return null
      if (chosen.has(sender)) return chosen.get(sender) ?? null
      try {
        return (await svc().guide.getSelection(await targetOf(sender, win))).projectId
      } catch {
        return null
      }
    },
  }
}

/** What `waitForPageReturn` needs of a page (an Electron `WebContents`) */
export interface ReturnablePage {
  isDestroyed(): boolean
  on(event: 'focus' | 'blur' | 'destroyed', listener: () => void): unknown
  off(event: 'focus' | 'blur' | 'destroyed', listener: () => void): unknown
}

/** How long after [view all] a focus on the asking page still counts as the dialog handing it back */
export const TRUST_RETURN_ARM_MS = 1_000

/**
 * Resolves true when the person comes back to `page` (it takes the focus
 * again) after [view all] opened the files elsewhere, false when the page is
 * gone first. The focus a closing dialog hands straight back to its window is
 * not a return: a focus counts once the page lost it, or after `armAfterMs`.
 */
export function waitForPageReturn(
  page: ReturnablePage,
  armAfterMs: number = TRUST_RETURN_ARM_MS,
): Promise<boolean> {
  if (page.isDestroyed()) return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    let armed = false
    const arm = () => {
      armed = true
    }
    const timer = setTimeout(arm, armAfterMs)
    const finish = (back: boolean) => {
      clearTimeout(timer)
      page.off('focus', onFocus)
      page.off('blur', arm)
      page.off('destroyed', onGone)
      resolve(back)
    }
    const onFocus = () => {
      if (armed) finish(true)
    }
    const onGone = () => finish(false)
    page.on('focus', onFocus)
    page.on('blur', arm)
    page.on('destroyed', onGone)
  })
}
