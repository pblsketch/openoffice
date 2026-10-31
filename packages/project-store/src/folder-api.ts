/**
 * Project folders: the shared contract between the shell main process and every
 * renderer that talks to it (the nine editor AI panels, the home ask panel and
 * the home project screen).
 *
 * A project is one local folder. Its instructions, memory and chats live inside
 * the folder under `.ieumoffice/`, so moving or copying the folder carries the
 * context along. What only this PC knows (the list, pins, trust, per-document
 * choices) lives in `app-settings.json` under `projects`.
 *
 * This file holds types and constants only (plus one pure id check). No
 * Electron, no filesystem. Behavior lives in the shell main process.
 *
 * Scope rule: the main process identifies the calling window from the IPC
 * sender and judges by that window's document. Requests never carry a document
 * path the renderer picked for a scope decision; the renderer names a project
 * id, and read tools carry an opaque run scope minted by main from that id.
 */
import type {
  ChatAttachment,
  ChatMessage,
  ChatMeta,
  ChatScope,
  ChatSkillChip,
  ToolActivity,
} from './types.js'

// ────────────────────────────────────────────────────────────
// Ids and fixed names
// ────────────────────────────────────────────────────────────

/** Project ids and chat ids accept only these characters; a file carrying anything else is ignored */
export const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]+$/

/** A project id (`project.json` `id`) or a chat id; always matches `PROJECT_ID_PATTERN` */
export type ProjectId = string

/** Whether `value` is usable as a project id or chat id (non-empty, `PROJECT_ID_PATTERN` only) */
export function isValidProjectId(value: unknown): value is ProjectId {
  return typeof value === 'string' && PROJECT_ID_PATTERN.test(value)
}

/**
 * Names inside a project folder. Fixed regardless of the UI language; text is UTF-8.
 *
 * ```
 * <project folder>/
 * ├── AGENTS.md, CLAUDE.md          read as instructions when present (and enabled)
 * └── .ieumoffice/
 *     ├── project.json
 *     ├── instructions.md
 *     ├── memory.md
 *     ├── memory.<YYYYMMDD-HHmmss>.bak.md   backup before a consolidation, newest 3 kept
 *     ├── ignore
 *     └── chats/
 *         ├── <chatId>.json         chat info
 *         └── <chatId>.jsonl        chat messages, one per line
 * ```
 */
export const PROJECT_FOLDER_NAMES = {
  dataDir: '.ieumoffice',
  projectFile: 'project.json',
  instructionsFile: 'instructions.md',
  memoryFile: 'memory.md',
  ignoreFile: 'ignore',
  chatsDir: 'chats',
  chatInfoExt: '.json',
  chatMessagesExt: '.jsonl',
  rootAgentsFile: 'AGENTS.md',
  rootClaudeFile: 'CLAUDE.md',
} as const

/** Memory backup file name: `memory.<YYYYMMDD-HHmmss>.bak.md` */
export const MEMORY_BACKUP_PATTERN = /^memory\.\d{8}-\d{6}\.bak\.md$/

/** Longest project name kept in `project.json` */
export const PROJECT_NAME_MAX_CHARS = 128

/** Format version written in `project.json` and in chat info files */
export const PROJECT_FORMAT_VERSION = 1

// ────────────────────────────────────────────────────────────
// Editors
// ────────────────────────────────────────────────────────────

/** Where a chat message was written: one of the nine editors or the home ask panel */
export const PROJECT_EDITORS = [
  'docs',
  'sheets',
  'slides',
  'pdf',
  'markdown',
  'html',
  'mindmap',
  'hwp',
  'epub',
  'home',
] as const

export type ProjectEditor = (typeof PROJECT_EDITORS)[number]

// ────────────────────────────────────────────────────────────
// On-disk formats inside the folder
// ────────────────────────────────────────────────────────────

/** `.ieumoffice/project.json` */
export interface ProjectFolderFile {
  version: typeof PROJECT_FORMAT_VERSION
  id: ProjectId
  /** Up to `PROJECT_NAME_MAX_CHARS`; renaming changes only this, never the folder name */
  name: string
  /** ISO time */
  createdAt: string
}

/** `.ieumoffice/chats/<chatId>.json` */
export interface ProjectChatInfo {
  version: typeof PROJECT_FORMAT_VERSION
  id: ProjectId
  /** The project this chat was born in; a copied folder's chats keep the old id and stay hidden */
  projectId: ProjectId
  title: string
  /** ISO time */
  createdAt: string
  /** ISO time */
  updatedAt: string
  /** `installId` of the install that created the chat */
  origin: string
  lastEditor: ProjectEditor
  /**
   * Paths, relative to the project folder, of documents inside the folder that used
   * this chat, in last-used order (a document used again moves to the end). Documents
   * outside the folder are never listed here; their last chat id lives in settings.
   */
  documents: string[]
}

/**
 * One line of `.ieumoffice/chats/<chatId>.jsonl`: the project-store message record
 * (same caps and lenient reading) plus who wrote it.
 *
 * `fileRef`, when present, is the sending document's path relative to the project
 * folder, or its base name for a document outside the folder; it is absent for the
 * home ask panel and for untitled documents. Memory lines ("remembered: ...") are
 * rebuilt from `tools` entries named `project_remember`; there is no separate field.
 */
export interface ProjectChatMessage extends ChatMessage {
  /** The editor (or home) that wrote this message */
  editor: ProjectEditor
  /** `installId` of the install that wrote this message */
  origin: string
}

// ────────────────────────────────────────────────────────────
// This PC's records (`app-settings.json` → `projects`)
// ────────────────────────────────────────────────────────────

/** The two persisted trust states; a project with no record has not been confirmed yet */
export type ProjectTrustDecision = 'use' | 'without'

/** Trust as the screens see it */
export type ProjectTrustState = ProjectTrustDecision | 'unconfirmed'

/** The files whose content hash the app records when it last saw or wrote them */
export type ProjectHashedFile = 'instructions' | 'memory' | 'agents' | 'claude'

/** One project in this PC's list */
export interface ProjectListEntry {
  id: ProjectId
  /** Canonical folder path (same rule as `canonicalPathKey`) */
  path: string
  pinned: boolean
  /** ISO time; the recent list is ordered by this, newest first */
  lastUsedAt: string
}

/** Trust record for one project id; kept after "remove from list" so re-adding does not ask again */
export interface ProjectTrustRecord {
  decision: ProjectTrustDecision
  /** Content hash (sha256 hex) per file, as last seen or written by this install */
  hashes: Partial<Record<ProjectHashedFile, string>>
}

/** The choice made for a document outside every project folder */
export interface OutsideDocumentChoice {
  /** The chosen project, or null for "no project" */
  projectId: ProjectId | null
  /** The chat this document last used in that project */
  lastChatId?: ProjectId
}

/** A document inside a project folder that was switched to "no project" */
export interface DocumentOptOut {
  /** The project the document sits in; lets moves and "remove from list" find the record */
  projectId: ProjectId
}

/** Per-project switches */
export interface ProjectSettings {
  /** `project_remember` is offered only when on (existing memory is read either way) */
  memoryEnabled: boolean
  /** Read the folder's root `AGENTS.md` and `CLAUDE.md` as instructions */
  readAgentsFiles: boolean
}

/** The whole `projects` key of `app-settings.json` */
export interface ProjectsAppSettings {
  /** Random value made once per install; tells this PC's chats from other PCs' */
  installId: string
  list: ProjectListEntry[]
  /** Project id → trust record */
  trust: Record<ProjectId, ProjectTrustRecord>
  /** Canonical document path → choice, for documents outside every project folder */
  outsideDocuments: Record<string, OutsideDocumentChoice>
  /** Canonical document path → opt-out, for documents inside a project folder set to "no project" */
  optedOutDocuments: Record<string, DocumentOptOut>
  /** Project id → switches */
  settings: Record<ProjectId, ProjectSettings>
  /** The home ask panel's last choice (null: "no project"); absent before the first choice */
  homeProjectId?: ProjectId | null
}

// ────────────────────────────────────────────────────────────
// Project list and selection (renderer-facing)
// ────────────────────────────────────────────────────────────

/** One row of the picker and of the home project list */
export interface ProjectListItem {
  id: ProjectId
  /** From `project.json`, or the folder's base name when the file is absent or the folder is missing */
  name: string
  /** Canonical folder path, for display */
  path: string
  pinned: boolean
  lastUsedAt: string
  /** The folder is gone ("folder missing"); choosing the row opens a folder picker to relocate */
  missing: boolean
  /** A write into `.ieumoffice/` failed during this app run; chats and memory are not saved */
  unwritable: boolean
  /** The folder is under a known sync folder (OneDrive, Google Drive for desktop) */
  syncFolder: boolean
}

/** The project and chat a window's AI panel starts with */
export interface ProjectSelection {
  /** null: "no project" */
  projectId: ProjectId | null
  /** The chat to open first (spec 5.3.1); null opens an empty new chat */
  initialChatId: ProjectId | null
  /**
   * Set when the document sits under an unregistered folder holding
   * `.ieumoffice/project.json`; the panel offers "[use]" (`adoptFolderHint`), never automatically.
   */
  unregisteredProjectHint?: UnregisteredProjectHint
}

export interface UnregisteredProjectHint {
  /** Name from that folder's `project.json` */
  name: string
  /** That folder's path, for display */
  folderPath: string
}

/** Why a folder cannot become a project */
export type FolderRefusalReason =
  /** A whole drive */
  | 'drive-root'
  /** The whole user folder */
  | 'user-home'
  /** An agent-mode protected folder (`~/.claude`, `~/.codex`, `~/.genoffice`, `~/.ieumoffice`, app data) */
  | 'protected'
  /** A folder that contains a protected folder */
  | 'contains-protected'
  /** Not a folder, or unreadable */
  | 'not-a-folder'
  /** Relocating a missing project onto a folder whose `project.json` has a different id */
  | 'different-project'

/** How a newly listed folder relates to the existing list (spec 5.11) */
export type FolderIdentity =
  /** A folder the list did not know */
  | 'new'
  /** Already listed at this path */
  | 'existing'
  /** A listed project whose old path no longer holds it: same project, new path */
  | 'moved'
  /** A listed project still present at its old path: a copy, given a new id */
  | 'copied'

/** Result of adding a folder, relocating a missing project, or adopting a hinted folder */
export type AddFolderResult =
  | {
      status: 'added'
      project: ProjectListItem
      identity: FolderIdentity
      /** One-time notices for this addition (for example `sync-folder`) */
      notices: ProjectNotice[]
    }
  /** `dialog`: the folder picker was closed; `trust`: the trust prompt was closed without a choice */
  | { status: 'cancelled'; stage: 'dialog' | 'trust' }
  | { status: 'refused'; reason: FolderRefusalReason }

/** Result of "new project" */
export type CreateProjectResult =
  | { status: 'created'; project: ProjectListItem }
  /** A folder of that name already exists (main asks "use this folder as the project?" itself) */
  | { status: 'exists'; folderPath: string }
  | { status: 'invalid-name' }
  /** The folder or `project.json` could not be written */
  | { status: 'unwritable' }
  /** The person chose to use an existing folder: the add-folder path (identity and trust) */
  | AddFolderResult

// ────────────────────────────────────────────────────────────
// Context for one send
// ────────────────────────────────────────────────────────────

/** One file the AI can see inside the folder */
export interface ProjectFileEntry {
  /** Path relative to the project folder, `/`-separated */
  relPath: string
  /** Lowercased extension without the dot ('' when none) */
  ext: string
  sizeBytes: number
  mtimeMs: number
  /** Not on this PC (cloud-only); reading it asks the person to download first */
  cloudOnly: boolean
}

/** Where an instructions part came from */
export type ProjectInstructionsSource = 'instructions' | 'agents' | 'claude'

/** A notice line shown in the AI panel */
export type ProjectNotice =
  /** `instructions.md`, `AGENTS.md` or `CLAUDE.md` changed outside the app; "[view]" opens the screen */
  | { kind: 'instructions-changed'; files: ProjectInstructionsSource[] }
  /** `memory.md` changed outside the app; "[view]" opens the screen */
  | { kind: 'memory-changed' }
  /** Memory is over the soft length; still sent in full; offers "[consolidate]" */
  | { kind: 'memory-long'; chars: number; limit: number }
  /** Instructions were over the limit; the tail was dropped */
  | { kind: 'instructions-truncated'; chars: number; limit: number }
  /** `.ieumoffice/` cannot be written; chats and memory are not saved */
  | { kind: 'unwritable' }
  /** First use of a folder under a sync service; instructions, memory and chats upload with it */
  | { kind: 'sync-folder'; service?: 'onedrive' | 'google-drive' }

/** What a send carries for the chosen project; read just before the send and fixed for that request */
export interface ProjectContextBundle {
  projectId: ProjectId
  name: string
  trust: ProjectTrustDecision
  /**
   * Instructions text as sent (already cut to the limit), or null when there are none
   * or trust is `without`.
   */
  instructions: { text: string; sources: ProjectInstructionsSource[] } | null
  /** Full `memory.md` (never cut), or null when empty or trust is `without` */
  memory: { text: string; chars: number } | null
  /** File names the AI sees, most recently modified first, up to the list limit */
  files: ProjectFileEntry[]
  /** Files left out of `files` past the limit ("N more, use the search tool") */
  filesOmitted: number
  /** Whether `project_remember` is offered (memory on, trust `use`, folder writable) */
  canRemember: boolean
  notices: ProjectNotice[]
}

export type ProjectContextResult =
  { status: 'ok'; context: ProjectContextBundle } | { status: 'missing' } | { status: 'unknown' }

// ────────────────────────────────────────────────────────────
// Tools (app-defined, app-executed; every call carries a run scope)
// ────────────────────────────────────────────────────────────

/** Tool names as the model sees them */
export const PROJECT_TOOL_NAMES = {
  listFiles: 'project_list_files',
  search: 'project_search',
  read: 'project_read',
  remember: 'project_remember',
} as const

export type ProjectToolName = (typeof PROJECT_TOOL_NAMES)[keyof typeof PROJECT_TOOL_NAMES]

/** Every tool call names the run scope main minted for one project (`openScope`) */
export interface ProjectToolScope {
  scope: string
}

export interface ProjectListFilesRequest extends ProjectToolScope {
  /** Narrow to paths starting with this folder-relative prefix */
  prefix?: string
  offset?: number
  limit?: number
}

export interface ProjectListFilesResult {
  /** Most recently modified first */
  files: ProjectFileEntry[]
  total: number
}

export interface ProjectSearchRequest extends ProjectToolScope {
  query: string
  /** Restrict to these lowercased extensions */
  exts?: string[]
  offset?: number
  limit?: number
}

export interface ProjectSearchHit {
  relPath: string
  name: string
  ext: string
  mtimeMs: number
  cloudOnly: boolean
  /** Excerpt around the first match; '' when only the name matched */
  snippet: string
}

export interface ProjectSearchResult {
  hits: ProjectSearchHit[]
  total: number
}

export interface ProjectReadRequest extends ProjectToolScope {
  relPath: string
  /** Character offset to page on from */
  offset?: number
}

/** Why a read was refused */
export type ProjectReadRefusal =
  /** Outside the folder, through a link, or `..` */
  | 'outside'
  /** Hidden entry, `~$` file or inside `.ieumoffice/` */
  | 'hidden'
  /** Matched by `.ieumoffice/ignore` */
  | 'ignored'
  | 'not-found'
  /** Open with unsaved changes */
  | 'unsaved'
  | 'too-large'
  /** The parser could not read it (or redaction could not be applied) */
  | 'unreadable'

export type ProjectReadResult =
  | { status: 'ok'; text: string; totalChars: number; offset: number }
  /** The file is cloud-only and the person declined the download */
  | { status: 'declined' }
  | { status: 'refused'; reason: ProjectReadRefusal }

/** One memory edit; `replace` and `remove` name the entry by its text */
export type ProjectMemoryOp =
  | { op: 'add'; text: string }
  | { op: 'replace'; old: string; new: string }
  | { op: 'remove'; text: string }

export interface ProjectRememberRequest extends ProjectToolScope {
  change: ProjectMemoryOp
}

/** Why a memory edit was refused */
export type ProjectMemoryRefusal =
  /** Memory is switched off for this project */
  | 'disabled'
  /** Trust is `without` */
  | 'without'
  | 'unwritable'
  /** `replace`/`remove` named an entry that is not in `memory.md` */
  | 'not-found'
  /** Empty text or more than one line */
  | 'invalid'

export type ProjectMemoryEditResult =
  /** `change` echoes what was applied, for the "remembered / changed / removed" line */
  { status: 'ok'; change: ProjectMemoryOp } | { status: 'refused'; reason: ProjectMemoryRefusal }

// ────────────────────────────────────────────────────────────
// Memory consolidation (person-triggered only)
// ────────────────────────────────────────────────────────────

export interface ApplyMemoryConsolidationArgs {
  projectId: ProjectId
  /** The consolidated entries, one line each, replacing the current list */
  entries: string[]
}

export type ApplyMemoryConsolidationResult =
  | {
      status: 'ok'
      /** Entry counts before and after ("N → M") */
      before: number
      after: number
      /** The backup just written (matches `MEMORY_BACKUP_PATTERN`); pass it to undo */
      backupName: string
    }
  | { status: 'unwritable' }

export interface UndoMemoryConsolidationArgs {
  projectId: ProjectId
  /** The backup to restore; main checks it against `MEMORY_BACKUP_PATTERN` */
  backupName: string
}

export type UndoMemoryConsolidationResult =
  { status: 'ok'; entries: number } | { status: 'no-backup' } | { status: 'unwritable' }

// ────────────────────────────────────────────────────────────
// Trust prompt
// ────────────────────────────────────────────────────────────

/** A chat in the folder written by another install */
export interface ProjectForeignChat {
  id: ProjectId
  title: string
  updatedAt: string
}

/**
 * What the first-time trust prompt shows: everything in the folder this install did
 * not write. Each text is null when that file is absent or was written by this install.
 */
export interface ProjectTrustPrompt {
  projectId: ProjectId
  name: string
  folderPath: string
  instructions: string | null
  memory: string | null
  agents: string | null
  claude: string | null
  foreignChats: ProjectForeignChat[]
}

/** The person's answer to the trust prompt; null when the prompt was closed (cancels an addition) */
export type ProjectTrustAnswer = ProjectTrustDecision | null

export type DecideTrustResult =
  | { status: 'ok'; trust: ProjectTrustDecision }
  /** Switching to `use` shows the prompt again; it was closed */
  | { status: 'cancelled' }

// ────────────────────────────────────────────────────────────
// Project screen
// ────────────────────────────────────────────────────────────

/** Section of the home project screen */
export type ProjectScreenSection = 'instructions' | 'memory'

/** Everything the home project screen shows for one project, read as-is (trust does not hide it) */
export interface ProjectDetail {
  project: ProjectListItem
  trust: ProjectTrustState
  settings: ProjectSettings
  /** `instructions.md` text ('' when absent) */
  instructions: string
  /** Root `AGENTS.md` / `CLAUDE.md` text, null when absent */
  agents: string | null
  claude: string | null
  /** `memory.md` text ('' when absent) */
  memory: string
  /** Memory entries, one per line, header comment excluded */
  memoryEntries: string[]
  memoryChars: number
  /** Sync conflict copies of `memory.md` (other `memory*.md` names that are not backups) */
  memoryConflictCopies: string[]
}

/** Common result of a write into `.ieumoffice/` */
export type ProjectWriteResult = { status: 'ok' } | { status: 'unwritable' }

// ────────────────────────────────────────────────────────────
// Chats
// ────────────────────────────────────────────────────────────

/** One row of the [chat ▾] list and the project screen's chat list */
export interface ProjectChatListItem {
  id: ProjectId
  title: string
  updatedAt: string
  lastEditor: ProjectEditor
  /** Written (info or any message) by another install: "other PC" */
  foreign: boolean
}

/**
 * "Earlier chats of this document": the per-document chat in the app-data
 * project-store from before this feature. It is continued through the existing
 * `ProjectApi` (`loadChat` / `appendChat`), never migrated.
 */
export interface LegacyDocumentChat extends ChatMeta {
  /** project-store project id */
  projectId: string
}

export interface ProjectChatListResult {
  /** Chats whose `projectId` is this project, newest `updatedAt` first */
  chats: ProjectChatListItem[]
  /** This window's document's earlier chat, when it has one */
  legacy: LegacyDocumentChat | null
}

export interface ProjectChatRef {
  projectId: ProjectId
  chatId: ProjectId
}

export interface OpenProjectChatArgs extends ProjectChatRef {
  /** Most recent messages to return (default 200) */
  limit?: number
}

export type OpenProjectChatResult =
  | {
      status: 'ok'
      info: ProjectChatInfo
      messages: ProjectChatMessage[]
      foreign: boolean
    }
  /** Absent, unreadable, or not shown in this project's list */
  | { status: 'not-found' }

/**
 * One message to record. Main fills `seq`, `ts`, `editor` and `origin` from the
 * sender, and updates the chat info (`updatedAt`, `lastEditor`, `documents`) from
 * the sender's document.
 */
export interface AppendProjectChatArgs extends ProjectChatRef {
  role: 'user' | 'assistant'
  text: string
  tools?: ToolActivity[]
  attachments?: ChatAttachment[]
  scope?: ChatScope
  skills?: ChatSkillChip[]
}

export type AppendProjectChatResult =
  /** Written to the folder */
  | { status: 'saved'; message: ProjectChatMessage }
  /** Held in memory until the first assistant reply creates the files */
  | { status: 'pending'; message: ProjectChatMessage }
  /** `.ieumoffice/` cannot be written; the message is kept only on screen and in model input */
  | { status: 'unwritable' }

export interface RenameProjectChatArgs extends ProjectChatRef {
  title: string
}

/** A message recorded by another window that has the same chat open */
export interface ProjectChatAppendedEvent extends ProjectChatRef {
  message: ProjectChatMessage
}

/** Tells an AI panel to open a chat (from the project screen or another window) */
export type OpenProjectChatEvent = ProjectChatRef

/** Tells the home renderer to show the project screen at a section */
export interface OpenProjectScreenEvent {
  projectId: ProjectId
  section?: ProjectScreenSection
}

/** What part of a project the app just wrote (`ProjectChangedEvent`) */
export type ProjectChangedPart = 'memory' | 'instructions' | 'settings' | 'chats'

/**
 * The app wrote something of a project (memory, instructions, its switches,
 * trust or name, or its chats), from any window. Sent to every window that
 * listens, the writing one included, so the project screen and the panels'
 * memory lines can read again. Changes made outside the app are not announced;
 * the screen reads again whenever it is shown.
 */
export interface ProjectChangedEvent {
  projectId: ProjectId
  part: ProjectChangedPart
}

// ────────────────────────────────────────────────────────────
// Bridge
// ────────────────────────────────────────────────────────────

export interface ProjectIdArgs {
  projectId: ProjectId
}

/**
 * "New project" (spec 5.1). The renderer sends the typed name only: main
 * creates `<default save folder>/<name>`, or with `otherPlace` asks for the
 * parent folder itself (an OS folder picker over the asking window) in the same
 * request. No path from the renderer decides where the folder is written.
 */
export interface CreateProjectArgs {
  name: string
  /** "Create somewhere else…": main shows a folder picker for the parent first */
  otherPlace?: boolean
}

export interface SetPinnedArgs extends ProjectIdArgs {
  pinned: boolean
}

export interface RenameProjectArgs extends ProjectIdArgs {
  name: string
}

export interface SetSelectionArgs {
  /** null: "no project" */
  projectId: ProjectId | null
}

export interface SetProjectSettingsArgs extends ProjectIdArgs {
  settings: Partial<ProjectSettings>
}

export interface DecideTrustArgs extends ProjectIdArgs {
  decision: ProjectTrustDecision
}

export interface SaveProjectTextArgs extends ProjectIdArgs {
  text: string
}

export interface EditMemoryArgs extends ProjectIdArgs {
  change: ProjectMemoryOp
}

export interface IgnorePathArgs extends ProjectIdArgs {
  /** Folder-relative path; added to or removed from `.ieumoffice/ignore` as one line */
  relPath: string
}

export interface OpenProjectScreenArgs extends ProjectIdArgs {
  section?: ProjectScreenSection
}

/**
 * What the preload exposes to renderers. The calling window is identified by main
 * from the IPC sender; nothing here carries the window's own document path.
 */
export interface ProjectFolderApi {
  // ---- list ----
  /** Pinned and recent projects */
  listProjects(): Promise<ProjectListItem[]>
  /** OS folder picker, then refusal rules, identity (5.11) and trust (5.10) */
  addFolder(): Promise<AddFolderResult>
  /** Default parent of a new project ("default save folder"), for display */
  getDefaultParentFolder(): Promise<string>
  /**
   * Creates `<name>` under the default save folder, or under a folder main asks
   * for (`otherPlace`). A folder of that name that already exists is offered as
   * "use this folder as the project?" (identity and trust, as for "add folder").
   */
  createProject(args: CreateProjectArgs): Promise<CreateProjectResult>
  /** Drops the list entry and its per-document choices; folder, trust and hashes stay */
  removeFromList(args: ProjectIdArgs): Promise<void>
  setPinned(args: SetPinnedArgs): Promise<void>
  /** Renames in `project.json` only */
  renameProject(args: RenameProjectArgs): Promise<ProjectWriteResult>
  /** Folder picker for a missing project (moved folder) */
  relocateProject(args: ProjectIdArgs): Promise<AddFolderResult>
  /** Opens the folder in Explorer / Finder */
  openInFileManager(args: ProjectIdArgs): Promise<void>
  /** Clears "unwritable" and tries the write again */
  retryUnwritable(args: ProjectIdArgs): Promise<ProjectWriteResult>

  // ---- selection for this window's document ----
  getSelection(): Promise<ProjectSelection>
  setSelection(args: SetSelectionArgs): Promise<ProjectSelection>
  /** "[use]" on the unregistered-folder hint: the add-folder path for the hinted folder, then selects it */
  adoptFolderHint(): Promise<AddFolderResult>

  // ---- one send ----
  /** Name, instructions, memory and file names for the next request; records changed hashes */
  readContext(args: ProjectIdArgs): Promise<ProjectContextResult>
  /** Mints the run scope the tools carry; rejects for an unknown or missing project */
  openScope(args: ProjectIdArgs): Promise<string>
  /** Ends a run; only the window that opened a scope can close it */
  closeScope(args: ProjectToolScope): Promise<void>

  // ---- tools ----
  listFiles(args: ProjectListFilesRequest): Promise<ProjectListFilesResult>
  search(args: ProjectSearchRequest): Promise<ProjectSearchResult>
  read(args: ProjectReadRequest): Promise<ProjectReadResult>
  remember(args: ProjectRememberRequest): Promise<ProjectMemoryEditResult>

  // ---- memory ----
  /** A person's edit outside a run ("[remove]" on a memory line, the screen's per-entry delete) */
  editMemory(args: EditMemoryArgs): Promise<ProjectMemoryEditResult>
  /** Replaces the whole `memory.md` (the screen's "edit all") */
  saveMemory(args: SaveProjectTextArgs): Promise<ProjectWriteResult>
  applyMemoryConsolidation(
    args: ApplyMemoryConsolidationArgs,
  ): Promise<ApplyMemoryConsolidationResult>
  undoMemoryConsolidation(args: UndoMemoryConsolidationArgs): Promise<UndoMemoryConsolidationResult>

  // ---- chats ----
  listChats(args: ProjectIdArgs): Promise<ProjectChatListResult>
  /** A new chat id; no file is written until the first assistant reply */
  newChat(args: ProjectIdArgs): Promise<{ chatId: ProjectId }>
  /** Opens a chat in this window and subscribes it to messages appended elsewhere */
  openChat(args: OpenProjectChatArgs): Promise<OpenProjectChatResult>
  appendChat(args: AppendProjectChatArgs): Promise<AppendProjectChatResult>
  renameChat(args: RenameProjectChatArgs): Promise<ProjectWriteResult>
  /** Moves both chat files to the OS trash */
  deleteChat(args: ProjectChatRef): Promise<ProjectWriteResult>
  /**
   * This window's document was just saved (first save, save as): when it now sits
   * inside the chat's project folder its path joins the chat's `documents` (spec
   * 5.3.6). Main takes the path from the calling window, never from the request.
   */
  attachDocument(args: ProjectChatRef): Promise<ProjectWriteResult>
  /** Opens the chat's latest document (or the home ask panel) and tells that AI panel to open the chat */
  openDocumentChat(args: ProjectChatRef): Promise<void>
  onChatMessageAppended(listener: (event: ProjectChatAppendedEvent) => void): () => void
  onOpenChat(listener: (event: OpenProjectChatEvent) => void): () => void

  // ---- project screen ----
  getProjectDetail(args: ProjectIdArgs): Promise<ProjectDetail>
  getSettings(args: ProjectIdArgs): Promise<ProjectSettings>
  setSettings(args: SetProjectSettingsArgs): Promise<ProjectSettings>
  /** `use` shows the trust prompt again; `without` applies at once */
  decideTrust(args: DecideTrustArgs): Promise<DecideTrustResult>
  saveInstructions(args: SaveProjectTextArgs): Promise<ProjectWriteResult>
  addIgnore(args: IgnorePathArgs): Promise<ProjectWriteResult>
  removeIgnore(args: IgnorePathArgs): Promise<ProjectWriteResult>
  /** Files left out by `ignore` (screen only; never offered to AI tools) */
  listIgnoredFiles(args: ProjectIdArgs): Promise<ProjectFileEntry[]>
  /** Switches to the home tab and shows the project screen at a section */
  openProjectScreen(args: OpenProjectScreenArgs): Promise<void>
  onOpenProjectScreen(listener: (event: OpenProjectScreenEvent) => void): () => void
  /** The app wrote memory, instructions, settings or chats of a project (any window) */
  onProjectChanged(listener: (event: ProjectChangedEvent) => void): () => void
}

// ────────────────────────────────────────────────────────────
// IPC channel names
// ────────────────────────────────────────────────────────────

/** The bridge's subscribe methods; each has an event channel instead of a request channel */
export type ProjectFolderEventMethod =
  'onChatMessageAppended' | 'onOpenChat' | 'onOpenProjectScreen' | 'onProjectChanged'

/** Event channels (main → renderer `webContents.send`), keyed by the bridge's subscribe method */
export const PROJECT_FOLDER_EVENTS = {
  onChatMessageAppended: 'projectFolder:event:chatMessageAppended',
  onOpenChat: 'projectFolder:event:openChat',
  onOpenProjectScreen: 'projectFolder:event:openProjectScreen',
  onProjectChanged: 'projectFolder:event:projectChanged',
} as const satisfies Record<ProjectFolderEventMethod, `projectFolder:event:${string}`>

/** Request channels (`ipcRenderer.invoke`), one per bridge method */
export const PROJECT_FOLDER_CHANNELS = {
  listProjects: 'projectFolder:listProjects',
  addFolder: 'projectFolder:addFolder',
  getDefaultParentFolder: 'projectFolder:getDefaultParentFolder',
  createProject: 'projectFolder:createProject',
  removeFromList: 'projectFolder:removeFromList',
  setPinned: 'projectFolder:setPinned',
  renameProject: 'projectFolder:renameProject',
  relocateProject: 'projectFolder:relocateProject',
  openInFileManager: 'projectFolder:openInFileManager',
  retryUnwritable: 'projectFolder:retryUnwritable',
  getSelection: 'projectFolder:getSelection',
  setSelection: 'projectFolder:setSelection',
  adoptFolderHint: 'projectFolder:adoptFolderHint',
  readContext: 'projectFolder:readContext',
  openScope: 'projectFolder:openScope',
  closeScope: 'projectFolder:closeScope',
  listFiles: 'projectFolder:listFiles',
  search: 'projectFolder:search',
  read: 'projectFolder:read',
  remember: 'projectFolder:remember',
  editMemory: 'projectFolder:editMemory',
  saveMemory: 'projectFolder:saveMemory',
  applyMemoryConsolidation: 'projectFolder:applyMemoryConsolidation',
  undoMemoryConsolidation: 'projectFolder:undoMemoryConsolidation',
  listChats: 'projectFolder:listChats',
  newChat: 'projectFolder:newChat',
  openChat: 'projectFolder:openChat',
  appendChat: 'projectFolder:appendChat',
  renameChat: 'projectFolder:renameChat',
  deleteChat: 'projectFolder:deleteChat',
  attachDocument: 'projectFolder:attachDocument',
  openDocumentChat: 'projectFolder:openDocumentChat',
  getProjectDetail: 'projectFolder:getProjectDetail',
  getSettings: 'projectFolder:getSettings',
  setSettings: 'projectFolder:setSettings',
  decideTrust: 'projectFolder:decideTrust',
  saveInstructions: 'projectFolder:saveInstructions',
  addIgnore: 'projectFolder:addIgnore',
  removeIgnore: 'projectFolder:removeIgnore',
  listIgnoredFiles: 'projectFolder:listIgnoredFiles',
  openProjectScreen: 'projectFolder:openProjectScreen',
} as const satisfies Record<
  Exclude<keyof ProjectFolderApi, ProjectFolderEventMethod>,
  `projectFolder:${string}`
>

export type ProjectFolderChannel =
  (typeof PROJECT_FOLDER_CHANNELS)[keyof typeof PROJECT_FOLDER_CHANNELS]

export type ProjectFolderEventChannel =
  (typeof PROJECT_FOLDER_EVENTS)[keyof typeof PROJECT_FOLDER_EVENTS]

/**
 * Renderer → main (`ipcRenderer.send`): a window started or stopped listening to
 * one event. Main holds an event addressed to a window that is not listening yet
 * (a tab still loading) and delivers it once the window listens.
 */
export const PROJECT_FOLDER_LISTEN_CHANNEL = 'projectFolder:listen'

export interface ProjectFolderListenMessage {
  method: ProjectFolderEventMethod
  listening: boolean
}

/** The global name the preloads expose the bridge under (`window.projectFolderApi`) */
export const PROJECT_FOLDER_BRIDGE_KEY = 'projectFolderApi'
