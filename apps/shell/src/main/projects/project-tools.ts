import { lstat, stat } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import {
  fileHasUnsavedChanges,
  UNSAVED_CHANGES_MESSAGE,
  withoutUnsavedFiles,
} from '@genoffice/electron-utils/unsaved-files'
import type {
  ProjectId,
  ProjectListFilesResult,
  ProjectReadRefusal,
  ProjectReadResult,
  ProjectSearchHit,
  ProjectSearchResult,
} from '@genoffice/project-store'
import type { FileIndexStore } from '../file-index/store'
import { isSupportedTreeFile } from '../folder-tree'
import { KB_READ_MAX_BYTES, readKnowledgeFilePage, type KbRunScopes } from '../knowledge-base'
import { resolveCloudOnly as detectCloudOnly } from './cloud-files'
import { realPlainFileIn } from './folder-files'
import { compileIgnore } from './ignore'
import { isPlainSegment, relativeInside } from './paths'
import {
  listVisibleFiles,
  toEntry,
  withCloudFlags,
  type CloudOnlyResolver,
  type VisibleFile,
  type VisibleFileLister,
} from './project-files'
import type { ProjectAiVisibility, ProjectGuide } from './project-guide'
import { isAiVisiblePath } from './visibility'

/**
 * The project folder tools of one shell (spec 5.5, 5.8; decision 0020 for the
 * run scope). The screen names a project id once per run; main mints an opaque
 * scope for it (`openScope`) and every tool call carries that scope. On every
 * call main resolves the project's folder and visibility rule again (list,
 * `ignore`), so a path or list sent by the renderer is never trusted, a project
 * removed mid-run is refused, and `ignore` edits apply to the next call.
 *
 * Reading is the attachment path: unsaved changes refused, the size cap, then
 * `parseFileToText` with its withholding (a mark it cannot process fails the
 * read). A file that is not on this PC is opened only after the person agreed
 * to download it (`askDownload`).
 */

/** a call named no scope, a scope main does not hold, another window's, or a starred-only scope */
export const PROJECT_SCOPE_UNKNOWN = 'project scope is not open'

/** the project is not in the list (any more) or its folder is gone */
export const PROJECT_UNAVAILABLE = 'project is not listed or its folder is missing'

/** default page sizes; the tool input may ask for other sizes */
export const PROJECT_LIST_DEFAULT_LIMIT = 200
export const PROJECT_SEARCH_DEFAULT_LIMIT = 20

/** query cap, same as the home search box and the knowledge search */
const QUERY_MAX_CHARS = 200

/** what the download question shows and where */
export interface DownloadAsk {
  /** the asking window (webContents id), parent of the dialog */
  owner: number
  projectId: ProjectId
  /** the file's name, as the question names it */
  fileName: string
  /** folder-relative path, `/`-separated */
  relPath: string
}

export interface ProjectToolsDeps {
  guide: Pick<ProjectGuide, 'aiVisibility'>
  /** the run scopes (may be shared with the knowledge-base channel) */
  scopes: KbRunScopes
  /** the home search index, or null while it is unavailable */
  store: () => Pick<FileIndexStore, 'search' | 'pathsIndexedAsOnDisk'> | null
  /**
   * The check right before a read opens a file; never cached. Default:
   * `resolveCloudOnly` (one detector run per call)
   */
  resolveCloudOnly?: CloudOnlyResolver
  /**
   * The "not on this PC" marks of list and search results, which a run asks for
   * often; may reuse recent verdicts. Default: `resolveCloudOnly`
   */
  listCloudOnly?: CloudOnlyResolver
  /** the project's AI-visible files; may reuse a recent walk. Default: `listVisibleFiles` */
  listFiles?: VisibleFileLister
  /** asks "'<file>' is not on this PC; download it?"; true only when the person agreed */
  askDownload: (ask: DownloadAsk) => Promise<boolean>
  platform?: NodeJS.Platform
}

function argsOf(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}
}

function count(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback
}

/** `/`-separated, without a leading `./`; the rest is judged by the visibility rule */
function cleanRelPath(value: string): string {
  let rel = value.trim().replace(/\\/g, '/')
  while (rel.startsWith('./')) rel = rel.slice(2)
  return rel
}

function foldsCase(platform: NodeJS.Platform): boolean {
  return platform === 'win32' || platform === 'darwin'
}

const NO_IGNORE = compileIgnore('', { caseInsensitive: false })

export class ProjectFolderTools {
  private readonly platform: NodeJS.Platform
  private readonly resolveCloud: CloudOnlyResolver
  private readonly listCloud: CloudOnlyResolver
  private readonly list: VisibleFileLister

  constructor(private readonly deps: ProjectToolsDeps) {
    this.platform = deps.platform ?? process.platform
    this.resolveCloud = deps.resolveCloudOnly ?? ((paths) => detectCloudOnly(paths))
    this.listCloud = deps.listCloudOnly ?? this.resolveCloud
    this.list = deps.listFiles ?? listVisibleFiles
  }

  // ────────────────────────── scope ──────────────────────────

  /** the folder and visibility of a listed project whose folder exists; null otherwise */
  private async visibility(projectId: unknown): Promise<ProjectAiVisibility | null> {
    if (typeof projectId !== 'string' || !projectId) return null
    const visibility = await this.deps.guide.aiVisibility(projectId)
    if (!visibility) return null
    try {
      if (!(await stat(visibility.root)).isDirectory()) return null
    } catch {
      return null
    }
    return visibility
  }

  /** `openScope({ projectId })` for an editor's panel: the project folder only */
  async openScope(owner: number, raw: unknown): Promise<string> {
    const projectId = argsOf(raw).projectId
    if (!(await this.visibility(projectId))) throw new Error(PROJECT_UNAVAILABLE)
    return this.deps.scopes.openProject(owner, projectId as ProjectId, 'none')
  }

  /** only the window that opened a scope can close it */
  closeScope(owner: number, raw: unknown): void {
    this.deps.scopes.close(owner, argsOf(raw).scope)
  }

  /** whether a project can be scoped (listed, folder present); for the home ask's combined scope */
  async isAvailable(projectId: unknown): Promise<boolean> {
    return (await this.visibility(projectId)) !== null
  }

  /** the project of the call's scope and its visibility now; throws when either is gone */
  private async scoped(
    owner: number,
    raw: unknown,
  ): Promise<{
    projectId: ProjectId
    visibility: ProjectAiVisibility
  }> {
    let projectId: ProjectId | null
    try {
      // a call without a scope is never an unscoped call here
      projectId = argsOf(raw).scope === undefined ? null : this.deps.scopes.projectOf(owner, raw)
    } catch {
      projectId = null
    }
    if (!projectId) throw new Error(PROJECT_SCOPE_UNKNOWN)
    const visibility = await this.visibility(projectId)
    if (!visibility) throw new Error(PROJECT_UNAVAILABLE)
    return { projectId, visibility }
  }

  // ────────────────────────── project_list_files ──────────────────────────

  async listFiles(owner: number, raw: unknown): Promise<ProjectListFilesResult> {
    const { visibility } = await this.scoped(owner, raw)
    const args = argsOf(raw)
    const prefix = typeof args.prefix === 'string' ? cleanRelPath(args.prefix) : ''
    let files: VisibleFile[] = await this.list(visibility)
    if (prefix) {
      const fold = foldsCase(this.platform)
      const wanted = fold ? prefix.toLowerCase() : prefix
      files = files.filter((file) =>
        (fold ? file.relPath.toLowerCase() : file.relPath).startsWith(wanted),
      )
    }
    const offset = count(args.offset, 0)
    const limit = count(args.limit, PROJECT_LIST_DEFAULT_LIMIT)
    const page = await withCloudFlags(files.slice(offset, offset + limit), this.listCloud)
    return { files: page.map(toEntry), total: files.length }
  }

  // ────────────────────────── project_search ──────────────────────────

  /**
   * The project's "visible to the AI" test on absolute paths, or null when the
   * project is not available; for the home ask's knowledge search
   */
  async visibleTest(projectId: ProjectId): Promise<((path: string) => boolean) | null> {
    const visibility = await this.visibility(projectId)
    return visibility ? (path) => this.relOf(visibility, path) !== null : null
  }

  /** folder-relative path of an absolute path the AI may see in this project, or null */
  private relOf(visibility: ProjectAiVisibility, path: string): string | null {
    const rel = relativeInside(visibility.root, path, this.platform)
    return rel !== null && visibility.isVisible(rel) ? rel : null
  }

  async search(owner: number, raw: unknown): Promise<ProjectSearchResult> {
    const { visibility } = await this.scoped(owner, raw)
    const args = argsOf(raw)
    const query = typeof args.query === 'string' ? args.query.trim().slice(0, QUERY_MAX_CHARS) : ''
    const store = this.deps.store()
    if (!query || !store) return { hits: [], total: 0 }
    const exts = Array.isArray(args.exts)
      ? args.exts.filter((ext): ext is string => typeof ext === 'string' && ext !== '')
      : []
    const result = store.search(query, {
      offset: count(args.offset, 0),
      limit: count(args.limit, PROJECT_SEARCH_DEFAULT_LIMIT),
      ...(exts.length > 0 ? { exts: exts.map((ext) => ext.replace(/^\./, '').toLowerCase()) } : {}),
      // narrowed in the query: only this project's visible files are ranked and paged
      within: (path) => this.relOf(visibility, path) !== null,
    })
    const paths = result.hits.map((hit) => hit.path)
    // an excerpt is quoted only from a file indexed as it is on disk and not open with unsaved changes
    const quotable = new Set(
      await withoutUnsavedFiles(store.pathsIndexedAsOnDisk(paths), (path) => path),
    )
    const cloud = await this.cloudVerdicts(paths, this.listCloud)
    const hits: ProjectSearchHit[] = []
    for (const hit of result.hits) {
      const relPath = this.relOf(visibility, hit.path)
      if (relPath === null) continue
      hits.push({
        relPath,
        name: hit.name,
        ext: hit.ext,
        mtimeMs: hit.mtimeMs,
        cloudOnly: cloud ? cloud.get(hit.path) !== false : true,
        snippet: quotable.has(hit.path)
          ? (hit.snippet ?? []).map((part) => part.text).join('')
          : '',
      })
    }
    return { hits, total: result.total }
  }

  /** one detector run for the paths; null when it failed (callers treat that as not on this PC) */
  private async cloudVerdicts(
    paths: readonly string[],
    resolve: CloudOnlyResolver,
  ): Promise<Map<string, boolean> | null> {
    if (paths.length === 0) return new Map()
    return resolve(paths).catch(() => null)
  }

  // ────────────────────────── project_read ──────────────────────────

  async read(owner: number, raw: unknown): Promise<ProjectReadResult> {
    const { projectId, visibility } = await this.scoped(owner, raw)
    const args = argsOf(raw)
    const given = typeof args.relPath === 'string' ? args.relPath : ''
    return this.readIn(owner, projectId, visibility, given, count(args.offset, 0))
  }

  /**
   * A read by absolute path for a run whose scope holds `projectId` (the home
   * ask's knowledge read); the same checks and question as `read`
   */
  async readPath(
    owner: number,
    projectId: ProjectId,
    path: string,
    offset: number,
  ): Promise<ProjectReadResult> {
    const visibility = await this.visibility(projectId)
    if (!visibility) return { status: 'refused', reason: 'outside' }
    return this.readIn(owner, projectId, visibility, path, count(offset, 0))
  }

  /** why the AI may not see these folder-relative segments, or null when it may */
  private judge(
    visibility: ProjectAiVisibility,
    segments: readonly string[],
  ): 'hidden' | 'ignored' | null {
    const rel = segments.join('/')
    if (!isAiVisiblePath(visibility.root, rel, NO_IGNORE)) return 'hidden'
    if (!visibility.isVisible(rel)) return 'ignored'
    return null
  }

  private async readIn(
    owner: number,
    projectId: ProjectId,
    visibility: ProjectAiVisibility,
    given: string,
    offset: number,
  ): Promise<ProjectReadResult> {
    const refused = (reason: ProjectReadRefusal): ProjectReadResult => ({
      status: 'refused',
      reason,
    })
    let rel: string
    if (isAbsolute(given.trim()) || /^[A-Za-z]:/.test(given.trim())) {
      // an absolute path is accepted only when it lies inside the folder
      const inside = relativeInside(visibility.root, given.trim(), this.platform)
      if (inside === null) return refused('outside')
      rel = inside
    } else {
      rel = cleanRelPath(given)
    }
    const asked = rel.split('/').filter((segment) => segment !== '')
    if (asked.length === 0 || asked.some((segment) => segment === '..' || segment === '.')) {
      return refused('outside')
    }
    // a stream name (`:`) or a trailing dot or space is another spelling of some entry on Windows
    if (this.platform === 'win32' && !asked.every(isPlainSegment)) return refused('not-found')
    const judged = this.judge(visibility, asked)
    if (judged) return refused(judged)

    // no link or junction on the way, a plain file at the end
    const found = await realPlainFileIn(visibility.root, asked, this.platform)
    if (!found) {
      try {
        const info = await lstat(join(visibility.root, ...asked))
        // a folder is no file to read; anything else present was reached through a link
        return refused(info.isDirectory() ? 'not-found' : 'outside')
      } catch {
        return refused('not-found')
      }
    }
    // judged again by the name on disk: a short name or other spelling may stand for
    // a hidden, `.ieumoffice/` or ignored entry; every later check uses the real path
    const { path, segments } = found
    const judgedReal = this.judge(visibility, segments)
    if (judgedReal) return refused(judgedReal)
    if (!isSupportedTreeFile(path)) return refused('unreadable')
    if (await fileHasUnsavedChanges(path)) return refused('unsaved')
    try {
      if ((await stat(path)).size > KB_READ_MAX_BYTES) return refused('too-large')
    } catch {
      return refused('not-found')
    }

    // the content of a file that is not on this PC is opened only on the person's yes
    // fresh, never the list cache: this decides whether opening the file downloads it
    const cloud = await this.cloudVerdicts([path], this.resolveCloud)
    if (!cloud || cloud.get(path) !== false) {
      const ask: DownloadAsk = {
        owner,
        projectId,
        fileName: basename(path),
        relPath: segments.join('/'),
      }
      const agreed = await this.deps.askDownload(ask).catch(() => false)
      if (agreed !== true) return { status: 'declined' }
    }

    try {
      const page = await readKnowledgeFilePage(path, offset)
      return { status: 'ok', text: page.text, totalChars: page.totalChars, offset: page.offset }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message === UNSAVED_CHANGES_MESSAGE) return refused('unsaved')
      return refused('unreadable')
    }
  }
}
