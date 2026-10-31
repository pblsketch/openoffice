import { randomBytes } from 'node:crypto'
import { lstat, rmdir, stat } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import {
  isValidProjectId,
  MEMORY_BACKUP_PATTERN,
  PROJECT_FOLDER_NAMES,
  PROJECT_FORMAT_VERSION,
  PROJECT_NAME_MAX_CHARS,
  type AddFolderResult,
  type ApplyMemoryConsolidationArgs,
  type ApplyMemoryConsolidationResult,
  type CreateProjectResult,
  type DecideTrustResult,
  type ProjectContextResult,
  type ProjectDetail,
  type ProjectFileEntry,
  type ProjectFolderFile,
  type ProjectHashedFile,
  type ProjectId,
  type ProjectListEntry,
  type ProjectListItem,
  type ProjectMemoryEditResult,
  type ProjectMemoryOp,
  type ProjectNotice,
  type ProjectSelection,
  type ProjectSettings,
  type ProjectTrustAnswer,
  type ProjectTrustDecision,
  type ProjectTrustPrompt,
  type ProjectTrustRecord,
  type ProjectTrustState,
  type ProjectWriteResult,
  type UndoMemoryConsolidationArgs,
  type UndoMemoryConsolidationResult,
} from '@genoffice/project-store'
import {
  readProjectsSettings,
  updateProjectsSettings,
  type StoredProjectsSettings,
} from '../app-settings'
import { isValidRenameName } from '../rename-validation'
import { isUnderKnownSyncFolder } from './cloud-files'
import {
  cleanProjectName,
  hashText,
  plainFolderEntries,
  projectFileText,
  readDataText,
  readProjectFile,
} from './folder-files'
import {
  addIgnoreLine,
  compileIgnore,
  ignoreFoldsCase,
  removeIgnoreLine,
  type IgnoreMatcher,
} from './ignore'
import {
  applyMemoryOp,
  buildMemoryText,
  localDate,
  memoryBackupName,
  memoryEntries,
  memoryHeader,
  type MemoryOpResult,
} from './memory'
import {
  canonicalPath,
  folderRefusal,
  isInsideFolder,
  locationRefusal,
  relativeInside,
  samePath,
  type RefusalContext,
} from './paths'
import { readHashedTexts, scanForTrust } from './trust'
import { assembleTrustedContext, type TrustedContext } from './context'
import { classifyFolder, rebaseOptOuts } from './identity'
import {
  dropFromList,
  findUnregisteredProject,
  recordOutsideChat,
  recordSelection,
  selectionFor,
  type ResolvedSelectionTarget,
} from './selection'
import { isAiVisiblePath } from './visibility'
import { ProjectWriteGuard, ProjectWriteRefused } from './write-guard'

/**
 * The project guide (decision 0088): the one place in the shell main process
 * that knows the project list, reads a project folder's instructions and memory,
 * decides identity and trust, and writes into the folder (through the write
 * guard). It holds no Electron objects: dialogs arrive as callbacks (`TrustAsk`)
 * and the IPC layer passes the calling window's document path.
 */

export { MEMORY_SOFT_LIMIT_CHARS } from './memory'

export { INSTRUCTIONS_LIMIT_CHARS } from './context'

/** Shows the first-time trust prompt; resolves to the answer, or null when it was closed */
export type TrustAsk = (prompt: ProjectTrustPrompt) => Promise<ProjectTrustAnswer>

/**
 * "New project" as main decides it (spec 5.1). `parentDir` is a folder main
 * itself chose (the default save folder, or the person's pick in main's own
 * folder picker); it never comes from a renderer.
 */
export interface NewProjectRequest {
  name: string
  /** Absent: the default save folder */
  parentDir?: string
  /** After a `status: 'exists'` answer the person confirmed: use that folder as the project */
  useExisting?: boolean
}

/** Whose AI panel asks for a selection */
export type SelectionTarget =
  /** A saved document (absolute path, canonicalized here) */
  | { kind: 'document'; path: string }
  /** A never-saved document; `projectId` is the project a create flow opened it in (spec 5.2, 6) */
  | { kind: 'untitled'; projectId?: ProjectId | null }
  /** The home ask panel */
  | { kind: 'home' }

/** What the AI may see in one project: used by the tools and the file list */
export interface ProjectAiVisibility {
  root: string
  matcher: IgnoreMatcher
  /** Folder-relative path (either separator) is visible: inside, not hidden, not `.ieumoffice/`, not ignored */
  isVisible(relPath: string, isDir?: boolean): boolean
  /** Same for the same rule (`ignore` text and case folding); a file list cache keys on it */
  ruleKey?: string
}

export interface ContextFilesRequest {
  id: ProjectId
  root: string
  visibility: ProjectAiVisibility
}

export interface ContextFiles {
  files: ProjectFileEntry[]
  omitted: number
}

export interface ProjectGuideDeps {
  /** `<userData>/app-settings.json` */
  settingsPath: string
  homeDir: string
  /** The app data folder (protected, never a project) */
  userData: string
  /** The default save folder (`configuredDefaultSaveDir`), parent of a new project */
  defaultParentDir: () => string
  platform?: NodeJS.Platform
  /** For the sync-folder rule (`OneDrive*` variables) */
  env?: NodeJS.ProcessEnv
  now?: () => Date
  /** A new project id; must match `PROJECT_ID_PATTERN` */
  newId?: () => string
  /** The screen language, for the header of a new `memory.md` */
  language?: () => string
  /** The file names of a project for the context (spec 5.4 item 4); absent sends none */
  contextFiles?: (request: ContextFilesRequest) => Promise<ContextFiles>
  /** At most one write of a project's use time per this long; default `PROJECT_TOUCH_WRITE_MS` */
  touchWriteMs?: number
}

/**
 * A project's "last used" time is written to `app-settings.json` at most once per
 * this long (tunable); newer times are kept in memory meanwhile and flushed at quit.
 */
export const PROJECT_TOUCH_WRITE_MS = 60_000

/** Writes into one project's `.ieumoffice/`, each through the write guard */
interface DataWriter {
  root: string
  write(relPath: string, text: string): Promise<void>
  append(relPath: string, text: string): Promise<void>
  update(
    relPath: string,
    change: (
      current: string | null,
    ) => string | null | undefined | Promise<string | null | undefined>,
  ): Promise<{ written: boolean; text: string | null }>
  remove(relPath: string): Promise<void>
}

export type DataUpdateOutcome =
  { status: 'ok'; written: boolean; text: string | null } | { status: 'unwritable' }

const DEFAULT_SETTINGS: ProjectSettings = { memoryEnabled: true, readAgentsFiles: true }

function defaultNewId(): string {
  return randomBytes(16).toString('base64url')
}

async function isFolder(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch {
    return false
  }
}

function cloneTrust(record: ProjectTrustRecord): ProjectTrustRecord {
  return { decision: record.decision, hashes: { ...record.hashes } }
}

export class ProjectGuide {
  private readonly platform: NodeJS.Platform
  private readonly env: NodeJS.ProcessEnv
  private readonly now: () => Date
  private readonly newId: () => string
  private readonly language: () => string
  private readonly guard: ProjectWriteGuard
  /** Projects whose `.ieumoffice/` could not be written during this app run */
  private readonly unwritable = new Set<ProjectId>()
  /** Copied folders listed under a new id whose `project.json` still names the original */
  private readonly pendingIdFix = new Set<ProjectId>()
  private cachedInstallId: string | null = null
  /** use times not written to the settings file yet (see `touch`) */
  private readonly pendingTouches = new Map<ProjectId, string>()
  /** when each project's use time was last written (ms) */
  private readonly touchWrittenAt = new Map<ProjectId, number>()
  private touchTimer: ReturnType<typeof setTimeout> | null = null
  private readonly touchWriteMs: number

  constructor(private readonly deps: ProjectGuideDeps) {
    this.platform = deps.platform ?? process.platform
    this.env = deps.env ?? process.env
    this.now = deps.now ?? (() => new Date())
    this.newId = deps.newId ?? defaultNewId
    this.language = deps.language ?? (() => 'en')
    this.guard = new ProjectWriteGuard(this.platform)
    this.touchWriteMs = deps.touchWriteMs ?? PROJECT_TOUCH_WRITE_MS
  }

  // ────────────────────────── settings ──────────────────────────

  private read(): StoredProjectsSettings {
    return readProjectsSettings(this.deps.settingsPath)
  }

  private update(change: (settings: StoredProjectsSettings) => void): StoredProjectsSettings {
    return updateProjectsSettings(this.deps.settingsPath, change)
  }

  private refusalContext(): RefusalContext {
    return { homeDir: this.deps.homeDir, userData: this.deps.userData, platform: this.platform }
  }

  /** This install's random id, made and stored once */
  installId(): string {
    if (this.cachedInstallId) return this.cachedInstallId
    let id = this.read().installId
    if (!id) {
      const fresh = this.newId()
      id = this.update((settings) => {
        if (!settings.installId) settings.installId = fresh
      }).installId
    }
    this.cachedInstallId = id
    return id
  }

  private entry(id: ProjectId, settings = this.read()): ProjectListEntry | undefined {
    return settings.list.find((item) => item.id === id)
  }

  /** The canonical folder of a listed project, or null */
  projectRoot(id: ProjectId): string | null {
    return this.entry(id)?.path ?? null
  }

  trustState(id: ProjectId): ProjectTrustState {
    return this.read().trust[id]?.decision ?? 'unconfirmed'
  }

  isUnwritable(id: ProjectId): boolean {
    return this.unwritable.has(id)
  }

  /** Marks a project "unwritable" for this app run (a write into `.ieumoffice/` failed) */
  markUnwritable(id: ProjectId): void {
    this.unwritable.add(id)
  }

  private settingsOf(id: ProjectId, settings = this.read()): ProjectSettings {
    return { ...DEFAULT_SETTINGS, ...settings.settings[id] }
  }

  private isSyncFolder(path: string): boolean {
    return isUnderKnownSyncFolder(path, this.env, {
      platform: this.platform,
      homeDir: this.deps.homeDir,
    })
  }

  private syncService(path: string): 'onedrive' | 'google-drive' | undefined {
    for (const key of ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial']) {
      const root = this.env[key]
      if (root && isInsideFolder(path, root, this.platform)) return 'onedrive'
    }
    if (/onedrive/i.test(path)) return 'onedrive'
    return this.isSyncFolder(path) ? 'google-drive' : undefined
  }

  /** The one-time sync-folder notice, when due; marks it shown */
  private takeSyncNotice(id: ProjectId, path: string): ProjectNotice[] {
    if (!this.isSyncFolder(path)) return []
    if (this.read().syncNoticeShown.includes(id)) return []
    this.update((settings) => {
      if (!settings.syncNoticeShown.includes(id)) settings.syncNoticeShown.push(id)
    })
    const service = this.syncService(path)
    return [service ? { kind: 'sync-folder', service } : { kind: 'sync-folder' }]
  }

  private async toItem(entry: ProjectListEntry): Promise<ProjectListItem> {
    const missing = !(await isFolder(entry.path))
    const file = missing ? null : await readProjectFile(entry.path)
    return {
      id: entry.id,
      name: file?.name ?? basename(entry.path),
      path: entry.path,
      pinned: entry.pinned,
      lastUsedAt: this.lastUsedOf(entry),
      missing,
      unwritable: this.unwritable.has(entry.id),
      syncFolder: this.isSyncFolder(entry.path),
    }
  }

  /**
   * Marks a project used now. Every send uses its project, so writing
   * `app-settings.json` each time would rewrite the whole file per message: one
   * project's time is written at most once per `touchWriteMs`; later times wait
   * in memory (the list order already follows them) and are written when that
   * interval is over or at `flushTouches` (app quit).
   */
  private touch(id: ProjectId): void {
    const at = this.now().toISOString()
    const nowMs = this.now().getTime()
    const last = this.touchWrittenAt.get(id)
    if (last === undefined || nowMs - last >= this.touchWriteMs) {
      this.pendingTouches.set(id, at)
      this.flushTouches()
      return
    }
    this.pendingTouches.set(id, at)
    if (!this.touchTimer) {
      const timer = setTimeout(
        () => {
          this.touchTimer = null
          this.flushTouches()
        },
        Math.max(0, last + this.touchWriteMs - nowMs),
      )
      timer.unref?.()
      this.touchTimer = timer
    }
  }

  /** Writes the use times still held in memory (call at app quit) */
  flushTouches(): void {
    if (this.touchTimer) {
      clearTimeout(this.touchTimer)
      this.touchTimer = null
    }
    if (this.pendingTouches.size === 0) return
    const pending = new Map(this.pendingTouches)
    this.pendingTouches.clear()
    const nowMs = this.now().getTime()
    this.update((settings) => {
      for (const [id, at] of pending) {
        const entry = settings.list.find((item) => item.id === id)
        if (entry && at > entry.lastUsedAt) entry.lastUsedAt = at
      }
    })
    for (const id of pending.keys()) this.touchWrittenAt.set(id, nowMs)
  }

  /** `lastUsedAt` with a use time not written yet */
  private lastUsedOf(entry: ProjectListEntry): string {
    const pending = this.pendingTouches.get(entry.id)
    return pending !== undefined && pending > entry.lastUsedAt ? pending : entry.lastUsedAt
  }

  // ────────────────────────── list ──────────────────────────

  /** Pinned projects first, then the rest; each group newest `lastUsedAt` first */
  async listProjects(): Promise<ProjectListItem[]> {
    const entries = this.read()
      .list.map((entry) => ({ ...entry, lastUsedAt: this.lastUsedOf(entry) }))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return b.lastUsedAt.localeCompare(a.lastUsedAt)
      })
    return Promise.all(entries.map((entry) => this.toItem(entry)))
  }

  /** The list row of one project, or null when it is not listed */
  async getProject(id: ProjectId): Promise<ProjectListItem | null> {
    const entry = this.entry(id)
    return entry ? this.toItem(entry) : null
  }

  getDefaultParentFolder(): string {
    return this.deps.defaultParentDir()
  }

  async setPinned(id: ProjectId, pinned: boolean): Promise<void> {
    this.update((settings) => {
      const entry = settings.list.find((item) => item.id === id)
      if (entry) entry.pinned = pinned
    })
  }

  /**
   * "Remove from list": drops the list entry (with its pin) and the project's
   * per-document records. The folder, the trust record and its hashes stay, so
   * adding the folder again does not ask again.
   */
  async removeFromList(id: ProjectId): Promise<void> {
    this.update((settings) => dropFromList(settings, id))
    this.unwritable.delete(id)
    this.pendingIdFix.delete(id)
  }

  /** "Add folder" (spec 5.1): refusal rules, identity (5.11), trust (5.10) */
  addFolder(folderPath: string, askTrust: TrustAsk): Promise<AddFolderResult> {
    return this.adopt(folderPath, askTrust)
  }

  /** Re-pick a "folder missing" project (spec 5.11) */
  async relocateProject(
    id: ProjectId,
    folderPath: string,
    askTrust: TrustAsk,
  ): Promise<AddFolderResult> {
    if (!this.entry(id)) throw new Error(`unknown project ${id}`)
    return this.adopt(folderPath, askTrust, id)
  }

  private async adopt(
    folderPath: string,
    askTrust: TrustAsk,
    relocateId?: ProjectId,
  ): Promise<AddFolderResult> {
    const platform = this.platform
    if (typeof folderPath !== 'string' || !isAbsolute(folderPath)) {
      return { status: 'refused', reason: 'not-a-folder' }
    }
    const root = canonicalPath(folderPath)
    const refusal = folderRefusal(root, this.refusalContext())
    if (refusal) return { status: 'refused', reason: refusal }

    const file = await readProjectFile(root)
    const settings = this.read()
    const verdict = await classifyFolder({ root, file, settings, platform, relocateId })
    if (verdict.kind === 'refused') return { status: 'refused', reason: verdict.reason }
    const { identity, previous, copiedFrom, staleAtPath } = verdict
    const id = verdict.id ?? this.uniqueNewId(settings)

    const name = file?.name ?? basename(root)
    let trustToRecord: ProjectTrustRecord | undefined
    const inherited = copiedFrom ? settings.trust[copiedFrom] : undefined
    if (!settings.trust[id] && !inherited) {
      const scan = await scanForTrust({ root, projectId: id, name, installId: this.installId() })
      let decision: ProjectTrustDecision = 'use'
      if (scan.foreign) {
        const answer = await askTrust(scan.prompt)
        if (answer !== 'use' && answer !== 'without') return { status: 'cancelled', stage: 'trust' }
        decision = answer
      }
      trustToRecord = { decision, hashes: scan.hashes }
    }

    if (identity === 'copied') {
      const copyFile: ProjectFolderFile = {
        version: PROJECT_FORMAT_VERSION,
        id,
        name,
        createdAt: this.now().toISOString(),
      }
      const wrote = await this.tryWrite(id, () =>
        this.guard.writeData(root, PROJECT_FOLDER_NAMES.projectFile, projectFileText(copyFile)),
      )
      // the folder still names the original's id: the next write that succeeds fixes it
      if (wrote.status !== 'ok') this.pendingIdFix.add(id)
    }

    const at = this.now().toISOString()
    let finalId = id
    let finalIdentity = identity
    this.update((next) => {
      if (staleAtPath) next.list = next.list.filter((item) => item.id !== staleAtPath)
      // Another window may have listed this folder while the trust prompt was open.
      const taken = next.list.find((item) => item.id !== id && samePath(item.path, root, platform))
      if (taken) {
        finalId = taken.id
        finalIdentity = 'existing'
        return
      }
      const listed = next.list.find((item) => item.id === id)
      if (listed) {
        if (previous && !samePath(previous.path, root, platform)) {
          rebaseOptOuts(next, id, previous.path, root, platform)
        }
        listed.path = root
        listed.lastUsedAt = at
      } else {
        next.list.push({ id, path: root, pinned: false, lastUsedAt: at })
      }
      if (trustToRecord) next.trust[id] = trustToRecord
      if (copiedFrom) {
        const source = next.trust[copiedFrom]
        if (source && !next.trust[id]) next.trust[id] = cloneTrust(source)
        const switches = next.settings[copiedFrom]
        if (switches && !next.settings[id]) next.settings[id] = { ...switches }
      }
    })

    if (finalId !== id) this.pendingIdFix.delete(id)
    const notices = this.takeSyncNotice(finalId, root)
    const entry = this.entry(finalId)
    if (!entry) throw new Error(`project ${finalId} was not listed`)
    return { status: 'added', project: await this.toItem(entry), identity: finalIdentity, notices }
  }

  private uniqueNewId(settings: StoredProjectsSettings): ProjectId {
    for (;;) {
      const id = this.newId()
      if (!isValidProjectId(id)) throw new Error('newId produced an invalid project id')
      if (!settings.trust[id] && !settings.list.some((item) => item.id === id)) return id
    }
  }

  /**
   * "New project" (spec 5.1): a new folder named `name` under the default save
   * folder (or `parentDir`) with `.ieumoffice/project.json`, trusted without asking.
   * An existing folder of that name is never written to unless `useExisting` asks
   * to add it as a project (identity and trust as for "add folder").
   */
  async createProject(args: NewProjectRequest, askTrust: TrustAsk): Promise<CreateProjectResult> {
    const name = typeof args.name === 'string' ? args.name.trim() : ''
    if (!isValidRenameName(name) || Array.from(name).length > PROJECT_NAME_MAX_CHARS) {
      return { status: 'invalid-name' }
    }
    let parent: string
    try {
      const chosen = args.parentDir ?? this.deps.defaultParentDir()
      if (typeof chosen !== 'string' || !isAbsolute(chosen)) return { status: 'unwritable' }
      parent = canonicalPath(chosen)
    } catch {
      return { status: 'unwritable' }
    }
    const target = join(parent, name)
    const refusal = locationRefusal(target, this.refusalContext())
    if (refusal) return { status: 'refused', reason: refusal }
    if (await exists(target)) {
      // A folder of that name that is already a listed project just opens:
      // there is nothing to ask (the result says `existing`).
      const listed = this.read().list.some((item) => samePath(item.path, target, this.platform))
      return args.useExisting || listed
        ? this.adopt(target, askTrust)
        : { status: 'exists', folderPath: target }
    }

    let root: string
    try {
      root = await this.guard.createProjectFolder(parent, name)
    } catch (error) {
      if (error instanceof ProjectWriteRefused && error.reason === 'exists') {
        return { status: 'exists', folderPath: target }
      }
      return { status: 'unwritable' }
    }
    const id = this.uniqueNewId(this.read())
    const file: ProjectFolderFile = {
      version: PROJECT_FORMAT_VERSION,
      id,
      name: cleanProjectName(name),
      createdAt: this.now().toISOString(),
    }
    try {
      await this.guard.writeData(root, PROJECT_FOLDER_NAMES.projectFile, projectFileText(file))
    } catch {
      await this.removeEmptyNewFolder(root)
      return { status: 'unwritable' }
    }
    const at = this.now().toISOString()
    this.update((settings) => {
      settings.list.push({ id, path: root, pinned: false, lastUsedAt: at })
      settings.trust[id] = { decision: 'use', hashes: {} }
    })
    const entry = this.entry(id)
    if (!entry) throw new Error(`project ${id} was not listed`)
    return { status: 'created', project: await this.toItem(entry) }
  }

  /** Undo a just-made project folder whose `project.json` could not be written */
  private async removeEmptyNewFolder(root: string): Promise<void> {
    const dataDir = join(root, PROJECT_FOLDER_NAMES.dataDir)
    for (const dir of [dataDir, root]) {
      try {
        await rmdir(dir)
      } catch {
        // Not empty or already gone: leave whatever is there.
      }
    }
  }

  /** Renames in `project.json` only; the folder keeps its name */
  async renameProject(id: ProjectId, name: string): Promise<ProjectWriteResult> {
    const clean = cleanProjectName(name)
    if (!clean) throw new Error('a project name cannot be empty')
    const entry = this.entry(id)
    if (!entry) throw new Error(`unknown project ${id}`)
    if (this.unwritable.has(id)) return { status: 'unwritable' }
    return this.tryWrite(id, async () => {
      await this.guard.updateData(entry.path, PROJECT_FOLDER_NAMES.projectFile, (current) => {
        const existing = current === null ? null : parseCreatedAt(current)
        return projectFileText({
          version: PROJECT_FORMAT_VERSION,
          id,
          name: clean,
          createdAt: existing ?? this.now().toISOString(),
        })
      })
    })
  }

  /** Clears "unwritable" and writes `project.json` again (creating it when absent) */
  async retryUnwritable(id: ProjectId): Promise<ProjectWriteResult> {
    this.unwritable.delete(id)
    const entry = this.entry(id)
    if (!entry) throw new Error(`unknown project ${id}`)
    const fresh = projectFileText(await this.projectFileFor(id, entry.path))
    const result = await this.tryWrite(id, () =>
      this.guard
        .updateData(entry.path, PROJECT_FOLDER_NAMES.projectFile, (current) =>
          current === null || this.idNeedsFix(id, entry.path, current) ? fresh : current,
        )
        .then(() => undefined),
    )
    if (result.status === 'ok') this.pendingIdFix.delete(id)
    return result
  }

  /**
   * `project.json` text at a listed project's folder names another id that must be
   * replaced: a copy whose new id could not be written when it was added (this run),
   * or, after a restart, a folder whose file still names a project listed at another
   * folder (the original of the copy). Any other id is left alone.
   */
  private idNeedsFix(id: ProjectId, root: string, current: string): boolean {
    let fileId: unknown
    try {
      fileId = (JSON.parse(current) as { id?: unknown } | null)?.id
    } catch {
      return false
    }
    if (fileId === id || !isValidProjectId(fileId)) return false
    if (this.pendingIdFix.has(id)) return true
    const original = this.entry(fileId)
    return original !== undefined && !samePath(original.path, root, this.platform)
  }

  private async projectFileFor(id: ProjectId, root: string): Promise<ProjectFolderFile> {
    const file = await readProjectFile(root)
    return {
      version: PROJECT_FORMAT_VERSION,
      id,
      name: file?.name ?? basename(root),
      createdAt: file?.createdAt ?? this.now().toISOString(),
    }
  }

  // ────────────────────────── writes ──────────────────────────

  /** Runs one write; a failure marks the project unwritable for this run and is reported, not thrown */
  private async tryWrite(id: ProjectId, write: () => Promise<void>): Promise<ProjectWriteResult> {
    try {
      await write()
      return { status: 'ok' }
    } catch (error) {
      this.unwritable.add(id)
      console.warn(`[projects] cannot write into project ${id}:`, error)
      return { status: 'unwritable' }
    }
  }

  /**
   * A write into a listed project's `.ieumoffice/`. Refused without trying while the
   * project is marked unwritable. The first file actually written also writes
   * `project.json` when the folder has none, so the folder carries its identity; an
   * operation that ends up writing nothing creates nothing.
   */
  private async writeWithIdentity(
    id: ProjectId,
    write: (data: DataWriter) => Promise<void>,
  ): Promise<ProjectWriteResult> {
    const entry = this.entry(id)
    if (!entry) throw new Error(`unknown project ${id}`)
    if (this.unwritable.has(id)) return { status: 'unwritable' }
    const root = entry.path
    const fresh = projectFileText(await this.projectFileFor(id, root))
    let identified = false
    const identify = async (): Promise<void> => {
      if (identified) return
      identified = true
      await this.guard.updateData(root, PROJECT_FOLDER_NAMES.projectFile, (current) =>
        current === null || this.idNeedsFix(id, root, current) ? fresh : null,
      )
      this.pendingIdFix.delete(id)
    }
    const data: DataWriter = {
      root,
      write: async (relPath, text) => {
        await identify()
        await this.guard.writeData(root, relPath, text)
      },
      append: async (relPath, text) => {
        await identify()
        await this.guard.appendData(root, relPath, text)
      },
      update: (relPath, change) =>
        this.guard.updateData(root, relPath, async (current) => {
          const next = await change(current)
          if (next !== null && next !== undefined) await identify()
          return next
        }),
      remove: (relPath) => this.guard.removeData(root, relPath),
    }
    return this.tryWrite(id, () => write(data))
  }

  /** Replace a file under `.ieumoffice/` (for the chat store) */
  async writeData(id: ProjectId, relPath: string, text: string): Promise<ProjectWriteResult> {
    assertNotProjectFile(relPath)
    return this.writeWithIdentity(id, (data) => data.write(relPath, text))
  }

  /** Append to a file under `.ieumoffice/` (chat message lines) */
  async appendData(id: ProjectId, relPath: string, text: string): Promise<ProjectWriteResult> {
    assertNotProjectFile(relPath)
    return this.writeWithIdentity(id, (data) => data.append(relPath, text))
  }

  /** Read-change-write one file under `.ieumoffice/`, serialized with every other write to it */
  async updateData(
    id: ProjectId,
    relPath: string,
    change: (
      current: string | null,
    ) => string | null | undefined | Promise<string | null | undefined>,
  ): Promise<DataUpdateOutcome> {
    assertNotProjectFile(relPath)
    let outcome: { written: boolean; text: string | null } = { written: false, text: null }
    const result = await this.writeWithIdentity(id, async (data) => {
      outcome = await data.update(relPath, change)
    })
    return result.status === 'ok' ? { status: 'ok', ...outcome } : result
  }

  /** Delete one file under `.ieumoffice/` */
  async removeData(id: ProjectId, relPath: string): Promise<ProjectWriteResult> {
    assertNotProjectFile(relPath)
    return this.writeWithIdentity(id, (data) => data.remove(relPath))
  }

  /** The checked absolute path of a file under a listed project's `.ieumoffice/` (nothing is touched) */
  dataPath(id: ProjectId, relPath: string): string | null {
    const entry = this.entry(id)
    return entry ? this.guard.dataPath(entry.path, relPath) : null
  }

  /**
   * Write a new document the AI made (spec 6) at `target`: inside the project folder,
   * not under `.ieumoffice/`, in an existing folder, never over an existing entry.
   * Throws `ProjectWriteRefused` (or the file system error); callers pick a free name.
   */
  async writeNewDocument(
    id: ProjectId,
    target: string,
    data: Uint8Array,
  ): Promise<ProjectWriteResult> {
    const entry = this.entry(id)
    if (!entry) throw new Error(`unknown project ${id}`)
    await this.guard.writeNewDocument(entry.path, target, data)
    return { status: 'ok' }
  }

  /** A document's path relative to a project folder (`/`-separated), or null when outside */
  documentRelativePath(id: ProjectId, docPath: string): string | null {
    const entry = this.entry(id)
    return entry ? relativeInside(entry.path, canonicalPath(docPath), this.platform) : null
  }

  private recordHashes(
    id: ProjectId,
    hashes: Partial<Record<ProjectHashedFile, string | null>>,
  ): void {
    this.update((settings) => {
      const record = settings.trust[id]
      if (!record) return
      for (const [file, hash] of Object.entries(hashes) as [ProjectHashedFile, string | null][]) {
        if (hash === null) delete record.hashes[file]
        else record.hashes[file] = hash
      }
    })
  }

  // ────────────────────────── context ──────────────────────────

  /** The visibility rule of one project (reads its `ignore` now); null when not listed */
  async aiVisibility(id: ProjectId): Promise<ProjectAiVisibility | null> {
    const entry = this.entry(id)
    if (!entry) return null
    const root = entry.path
    const text = (await readDataText(root, PROJECT_FOLDER_NAMES.ignoreFile)) ?? ''
    const matcher = compileIgnore(text, { caseInsensitive: ignoreFoldsCase(this.platform) })
    return {
      root,
      matcher,
      isVisible: (relPath, isDir = false) => isAiVisiblePath(root, relPath, matcher, isDir),
      ruleKey: hashText(`${ignoreFoldsCase(this.platform) ? 'i' : 's'}:${text}`),
    }
  }

  /**
   * What the next request carries (spec 5.4): name, instructions (cut at the limit),
   * memory (whole), file names, notices. Under `without` the instructions, memory and
   * root agent files are left out. A file changed outside the app gives one
   * "changed" notice, then its new hash is recorded.
   */
  async readContext(id: ProjectId): Promise<ProjectContextResult> {
    const settings = this.read()
    const entry = this.entry(id, settings)
    if (!entry) return { status: 'unknown' }
    const root = entry.path
    if (!(await isFolder(root))) return { status: 'missing' }
    const record = settings.trust[id]
    // A listed project without a trust record was never confirmed: send nothing foreign.
    const trust: ProjectTrustDecision = record?.decision ?? 'without'
    const switches = this.settingsOf(id, settings)
    const notices: ProjectNotice[] = []
    let instructions: TrustedContext['instructions'] = null
    let memory: TrustedContext['memory'] = null
    if (trust === 'use' && record) {
      const assembled = assembleTrustedContext(await readHashedTexts(root), record, switches)
      instructions = assembled.instructions
      memory = assembled.memory
      notices.push(...assembled.notices)
      if (Object.keys(assembled.hashUpdates).length > 0)
        this.recordHashes(id, assembled.hashUpdates)
    }

    const unwritable = this.unwritable.has(id)
    if (unwritable) notices.push({ kind: 'unwritable' })
    notices.push(...this.takeSyncNotice(id, root))

    let files: ContextFiles = { files: [], omitted: 0 }
    if (this.deps.contextFiles) {
      const visibility = await this.aiVisibility(id)
      if (visibility) files = await this.deps.contextFiles({ id, root, visibility })
    }
    this.touch(id)
    const file = await readProjectFile(root)
    return {
      status: 'ok',
      context: {
        projectId: id,
        name: file?.name ?? basename(root),
        trust,
        instructions,
        memory,
        files: files.files,
        filesOmitted: files.omitted,
        canRemember: switches.memoryEnabled && trust === 'use' && !unwritable,
        notices,
      },
    }
  }

  // ────────────────────────── project screen ──────────────────────────

  /** Everything the project screen shows, read as it is (trust does not hide it) */
  async getProjectDetail(id: ProjectId): Promise<ProjectDetail> {
    const entry = this.entry(id)
    if (!entry) throw new Error(`unknown project ${id}`)
    const root = entry.path
    const texts = await readHashedTexts(root)
    const memory = texts.memory ?? ''
    const names = await plainFolderEntries(root, [PROJECT_FOLDER_NAMES.dataDir])
    const conflicts = names
      .filter(
        (name) =>
          /^memory.*\.md$/i.test(name) &&
          name.toLowerCase() !== PROJECT_FOLDER_NAMES.memoryFile &&
          !MEMORY_BACKUP_PATTERN.test(name),
      )
      .sort()
    return {
      project: await this.toItem(entry),
      trust: this.trustState(id),
      settings: this.settingsOf(id),
      instructions: texts.instructions ?? '',
      agents: texts.agents,
      claude: texts.claude,
      memory,
      memoryEntries: memoryEntries(memory),
      memoryChars: memory.length,
      memoryConflictCopies: conflicts,
    }
  }

  async getSettings(id: ProjectId): Promise<ProjectSettings> {
    return this.settingsOf(id)
  }

  async setSettings(id: ProjectId, patch: Partial<ProjectSettings>): Promise<ProjectSettings> {
    const next = this.update((settings) => {
      const current = { ...DEFAULT_SETTINGS, ...settings.settings[id] }
      if (typeof patch.memoryEnabled === 'boolean') current.memoryEnabled = patch.memoryEnabled
      if (typeof patch.readAgentsFiles === 'boolean')
        current.readAgentsFiles = patch.readAgentsFiles
      settings.settings[id] = current
    })
    return this.settingsOf(id, next)
  }

  /**
   * Change trust from the project screen. `without` applies at once; `use` shows the
   * trust prompt again when the folder holds anything to confirm, and a closed prompt
   * leaves the project as it was.
   */
  async decideTrust(
    id: ProjectId,
    decision: ProjectTrustDecision,
    askTrust: TrustAsk,
  ): Promise<DecideTrustResult> {
    const entry = this.entry(id)
    if (!entry) throw new Error(`unknown project ${id}`)
    if (decision === 'without') {
      this.update((settings) => {
        const record = settings.trust[id]
        settings.trust[id] = { decision: 'without', hashes: { ...record?.hashes } }
      })
      return { status: 'ok', trust: 'without' }
    }
    if (this.trustState(id) === 'use') return { status: 'ok', trust: 'use' }
    const file = await readProjectFile(entry.path)
    const scan = await scanForTrust({
      root: entry.path,
      projectId: id,
      name: file?.name ?? basename(entry.path),
      installId: this.installId(),
    })
    let answer: ProjectTrustAnswer = 'use'
    if (scan.foreign) answer = await askTrust(scan.prompt)
    if (answer === null) return { status: 'cancelled' }
    if (answer === 'without') return { status: 'ok', trust: 'without' }
    this.update((settings) => {
      settings.trust[id] = { decision: 'use', hashes: scan.hashes }
    })
    return { status: 'ok', trust: 'use' }
  }

  async saveInstructions(id: ProjectId, text: string): Promise<ProjectWriteResult> {
    const result = await this.writeWithIdentity(id, (data) =>
      data.write(PROJECT_FOLDER_NAMES.instructionsFile, text),
    )
    if (result.status === 'ok') this.recordHashes(id, { instructions: hashText(text) })
    return result
  }

  async addIgnore(id: ProjectId, relPath: string): Promise<ProjectWriteResult> {
    assertFolderRelative(relPath)
    return this.writeWithIdentity(id, async (data) => {
      await data.update(PROJECT_FOLDER_NAMES.ignoreFile, (current) => {
        const next = addIgnoreLine(current ?? '', relPath)
        return next === current ? null : next
      })
    })
  }

  async removeIgnore(id: ProjectId, relPath: string): Promise<ProjectWriteResult> {
    assertFolderRelative(relPath)
    return this.writeWithIdentity(id, async (data) => {
      await data.update(PROJECT_FOLDER_NAMES.ignoreFile, (current) => {
        if (current === null) return null
        const next = removeIgnoreLine(current, relPath)
        return next === current ? null : next
      })
    })
  }

  // ────────────────────────── memory ──────────────────────────

  private memoryContext(): { today: string; header: string } {
    return { today: localDate(this.now()), header: memoryHeader(this.language()) }
  }

  /**
   * One memory change (spec 5.6), applied to the file as it is right now. `ai` is the
   * `project_remember` tool: refused while memory is off or trust is `without`. `person`
   * is a "[remove]" on a memory line or the screen's per-entry delete.
   */
  async editMemory(
    id: ProjectId,
    change: ProjectMemoryOp,
    by: 'ai' | 'person',
  ): Promise<ProjectMemoryEditResult> {
    if (!this.entry(id)) throw new Error(`unknown project ${id}`)
    if (by === 'ai') {
      if (!this.settingsOf(id).memoryEnabled) return { status: 'refused', reason: 'disabled' }
      if (this.trustState(id) !== 'use') return { status: 'refused', reason: 'without' }
    }
    if (this.unwritable.has(id)) return { status: 'refused', reason: 'unwritable' }
    let applied: MemoryOpResult | null = null
    let written: string | null = null
    const result = await this.writeWithIdentity(id, async (data) => {
      const outcome = await data.update(PROJECT_FOLDER_NAMES.memoryFile, (current) => {
        applied = applyMemoryOp(current, change, this.memoryContext())
        if (!applied.ok || applied.text === current) return null
        return applied.text
      })
      if (outcome.written) written = outcome.text
    })
    if (result.status !== 'ok') return { status: 'refused', reason: 'unwritable' }
    const done = applied as MemoryOpResult | null
    if (!done) return { status: 'refused', reason: 'invalid' }
    if (!done.ok) return { status: 'refused', reason: done.reason }
    if (written !== null) this.recordHashes(id, { memory: hashText(written) })
    return { status: 'ok', change: done.change }
  }

  /** The screen's "edit all": replaces `memory.md` with the person's text */
  async saveMemory(id: ProjectId, text: string): Promise<ProjectWriteResult> {
    const result = await this.writeWithIdentity(id, (data) =>
      data.write(PROJECT_FOLDER_NAMES.memoryFile, text),
    )
    if (result.status === 'ok') this.recordHashes(id, { memory: hashText(text) })
    return result
  }

  /**
   * Replace the memory with a consolidated list (person-triggered only). The current
   * `memory.md` is first kept as `memory.<YYYYMMDD-HHmmss>.bak.md`; only the newest
   * three backups stay.
   */
  async applyMemoryConsolidation(
    args: ApplyMemoryConsolidationArgs,
  ): Promise<ApplyMemoryConsolidationResult> {
    const id = args.projectId
    const entry = this.entry(id)
    if (!entry) throw new Error(`unknown project ${id}`)
    const { today, header } = this.memoryContext()
    let before = 0
    let after = 0
    let backupName = ''
    let written = ''
    if (!Array.isArray(args.entries) || !args.entries.every((item) => typeof item === 'string')) {
      throw new Error('entries must be a list of strings')
    }
    const result = await this.writeWithIdentity(id, async (data) => {
      await data.update(PROJECT_FOLDER_NAMES.memoryFile, async (current) => {
        backupName = await this.freeBackupName(data.root)
        await data.write(backupName, current ?? '')
        written = buildMemoryText(args.entries, header, today)
        before = memoryEntries(current ?? '').length
        after = memoryEntries(written).length
        return written
      })
      await this.pruneBackups(data)
    })
    if (result.status !== 'ok') return { status: 'unwritable' }
    this.recordHashes(id, { memory: hashText(written) })
    return { status: 'ok', before, after, backupName }
  }

  /** Restore the newest backup (the one the "[undo]" line names) */
  async undoMemoryConsolidation(
    args: UndoMemoryConsolidationArgs,
  ): Promise<UndoMemoryConsolidationResult> {
    const id = args.projectId
    const entry = this.entry(id)
    if (!entry) throw new Error(`unknown project ${id}`)
    if (typeof args.backupName !== 'string' || !MEMORY_BACKUP_PATTERN.test(args.backupName)) {
      return { status: 'no-backup' }
    }
    const newest = (await this.backupNames(entry.path))[0]
    if (newest !== args.backupName) return { status: 'no-backup' }
    const text = await readDataText(entry.path, newest)
    if (text === null) return { status: 'no-backup' }
    const result = await this.writeWithIdentity(id, (data) =>
      data.write(PROJECT_FOLDER_NAMES.memoryFile, text),
    )
    if (result.status !== 'ok') return { status: 'unwritable' }
    this.recordHashes(id, { memory: hashText(text) })
    return { status: 'ok', entries: memoryEntries(text).length }
  }

  /** Backup names, newest first */
  private async backupNames(root: string): Promise<string[]> {
    const names = await plainFolderEntries(root, [PROJECT_FOLDER_NAMES.dataDir])
    return names
      .filter((name) => MEMORY_BACKUP_PATTERN.test(name))
      .sort()
      .reverse()
  }

  private async freeBackupName(root: string): Promise<string> {
    const taken = new Set(await this.backupNames(root))
    let at = this.now().getTime()
    for (;;) {
      const name = memoryBackupName(new Date(at))
      if (!taken.has(name)) return name
      at += 1000
    }
  }

  private async pruneBackups(data: DataWriter): Promise<void> {
    const names = await this.backupNames(data.root)
    for (const name of names.slice(MEMORY_BACKUPS_KEPT)) await data.remove(name)
  }

  // ────────────────────────── selection ──────────────────────────

  private resolveTarget(target: SelectionTarget): ResolvedSelectionTarget {
    if (target.kind === 'document' && !isAbsolute(target.path)) {
      throw new Error('expected an absolute document path')
    }
    return target.kind === 'document'
      ? { kind: 'document', docKey: canonicalPath(target.path) }
      : target
  }

  /**
   * The project a window's AI panel starts with (spec 5.2). `initialChatId` is set
   * only for a document outside every project (its remembered last chat); the chat
   * store picks the chat of a document inside a project (spec 5.3.1).
   */
  async getSelection(target: SelectionTarget): Promise<ProjectSelection> {
    const settings = this.read()
    const resolved = this.resolveTarget(target)
    const selection = selectionFor(settings, resolved, this.platform)
    if (resolved.kind !== 'document') return selection
    const hint = await findUnregisteredProject(resolved.docKey, settings, this.refusalContext())
    return hint ? { ...selection, unregisteredProjectHint: hint } : selection
  }

  /** Record a choice made in a window's AI panel (see `recordSelection`); returns the selection now */
  async setSelection(
    target: SelectionTarget,
    projectId: ProjectId | null,
  ): Promise<ProjectSelection> {
    if (projectId !== null && !this.entry(projectId)) {
      throw new Error(`unknown project ${projectId}`)
    }
    const resolved = this.resolveTarget(target)
    this.update((settings) => recordSelection(settings, resolved, projectId, this.platform))
    if (projectId !== null) this.touch(projectId)
    const selection = await this.getSelection(target)
    return selection.projectId === projectId
      ? selection
      : { ...selection, projectId, initialChatId: null }
  }

  /** A document outside every project used `chatId` of `projectId` last (spec 3, 5.3.1) */
  async recordOutsideChat(docPath: string, projectId: ProjectId, chatId: ProjectId): Promise<void> {
    if (!isValidProjectId(chatId)) throw new Error('invalid chat id')
    if (!isAbsolute(docPath)) throw new Error('expected an absolute document path')
    const docKey = canonicalPath(docPath)
    this.update((settings) => recordOutsideChat(settings, docKey, projectId, chatId, this.platform))
  }

  /** "[use]" on the hint: the add-folder path for the hinted folder, then the document uses it */
  async adoptFolderHint(docPath: string, askTrust: TrustAsk): Promise<AddFolderResult> {
    const selection = await this.getSelection({ kind: 'document', path: docPath })
    const hint = selection.unregisteredProjectHint
    if (!hint) return { status: 'refused', reason: 'not-a-folder' }
    const result = await this.adopt(hint.folderPath, askTrust)
    if (result.status === 'added') {
      await this.setSelection({ kind: 'document', path: docPath }, result.project.id)
    }
    return result
  }
}

/** Memory backups kept after a consolidation (spec 3) */
export const MEMORY_BACKUPS_KEPT = 3

function parseCreatedAt(text: string): string | null {
  try {
    const raw = JSON.parse(text) as { createdAt?: unknown }
    return typeof raw?.createdAt === 'string' ? raw.createdAt : null
  } catch {
    return null
  }
}

function assertFolderRelative(relPath: string): void {
  if (
    typeof relPath !== 'string' ||
    relPath.trim() === '' ||
    /^[\\/]/.test(relPath) ||
    /^[A-Za-z]:/.test(relPath) ||
    relPath.split(/[\\/]/).some((segment) => segment === '..')
  ) {
    throw new Error('expected a path relative to the project folder')
  }
}

/** `project.json` belongs to the guide (identity, rename); other modules never write it */
function assertNotProjectFile(relPath: string): void {
  if (relPath.replace(/\\/g, '/').toLowerCase() === PROJECT_FOLDER_NAMES.projectFile) {
    throw new Error('project.json is written by the project guide only')
  }
}
