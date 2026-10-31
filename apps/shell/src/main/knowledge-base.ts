/// Knowledge-base channel: the reader's starred files (the star corpus) as
/// AI can search and read, so an answer can cite the folder and file it came
/// from. Lives in the shell main process because that is the one place that
/// already holds both halves — the starred list (readStarredFiles, docs-main)
/// and the full-text index (file-index). The handlers are app-agnostic IPC;
/// docs wires them into its AI panel first, the other apps can follow.
///
/// Why search filters in JS rather than in SQLite: the FTS index's path column
/// stores tokenized FOLDER names (see store.ts upsert), not real paths, so a
/// `path IN (...)` cannot express "within the starred set". Starred corpora
/// are small (a reader's hand-picked files), and the indexed whole is local,
/// so fetching a bounded page and filtering by real path is the cheap,
/// correct filter.

import { randomBytes } from 'node:crypto'
import { statSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import {
  assertFileSaved,
  UNSAVED_CHANGES_MESSAGE,
  withoutUnsavedFiles,
} from '@genoffice/electron-utils/unsaved-files'
import { parseFileToText } from '@genoffice/file-parse'
import type { ProjectId, ProjectReadResult } from '@genoffice/project-store'

/** characters of parsed text one read_knowledge_file page returns (aligned
 *  with the chat-attachment reader, files-skill.ts, so models meet one paging
 *  convention everywhere) */
export const KB_READ_CHUNK_CHARS = 24_000

/** byte cap per corpus file, aligned with the chat-attachment reader's
 *  ATTACHMENT_MAX_BYTES: a larger file is refused before parse rather than
 *  parsed and held in the text cache */
export const KB_READ_MAX_BYTES = 50 * 1024 * 1024

/** query cap, same as the home search box */
const KB_QUERY_MAX_CHARS = 200

/** how many indexed hits to fetch before filtering to the starred set */
const KB_SEARCH_POOL = 200

/** one corpus entry as the AI (and the panel) sees it */
export interface KbFile {
  /** absolute path — also the citation target (filenav:///abs/path) */
  path: string
  /** owning folder name ("contracts" in /Users/me/contracts/lease.docx) */
  folder: string
  /** absolute folder path */
  folderPath: string
  name: string
  ext: string
  sizeBytes: number
}

/** search result as the model sees it */
export interface KbSearchHit {
  path: string
  name: string
  ext: string
  folder: string
  snippet: string
}

/** text extraction cache, keyed by path, invalidated by mtime+size */
const kbTextCache = new Map<string, { stamp: string; text: string }>()
const KB_TEXT_CACHE_MAX = 8

/** the corpus: every starred file that still exists on disk */
export function listKnowledgeFiles(starredPaths: readonly string[]): KbFile[] {
  const out: KbFile[] = []
  for (const path of starredPaths) {
    try {
      const stat = statSync(path)
      if (!stat.isFile()) continue
      const folderPath = dirname(path)
      out.push({
        path,
        folder: basename(folderPath),
        folderPath,
        name: basename(path),
        ext: basename(path)
          .replace(/^[^.]*./, '')
          .toLowerCase(),
        sizeBytes: stat.size,
      })
    } catch {
      // a starred path can outlive its file (r158 keeps the dimmed row in the
      // home UI); for the corpus it simply drops out
    }
  }
  return out
}

/** fetch + filter + trim one search page; pure so it is unit-testable */
export function searchKnowledgeBase(
  search: (
    q: string,
    limit: number,
  ) => ReadonlyArray<{ path: string; name: string; ext: string; snippetText?: string }>,
  query: string,
  starredPaths: readonly string[],
  limit: number,
): KbSearchHit[] {
  const q = query.trim().slice(0, KB_QUERY_MAX_CHARS)
  if (!q) return []
  const starred = new Set(starredPaths)
  const pool = search(q, KB_SEARCH_POOL)
  const seen = new Set<string>()
  const out: KbSearchHit[] = []
  for (const hit of pool) {
    if (!starred.has(hit.path) || seen.has(hit.path)) continue
    seen.add(hit.path)
    out.push({
      path: hit.path,
      name: hit.name,
      ext: hit.ext,
      folder: basename(dirname(hit.path)),
      snippet: hit.snippetText ?? '',
    })
    if (out.length >= limit) break
  }
  return out
}

/**
 * searchKnowledgeBase over the starred files that are not open with unsaved
 * changes. The excerpt comes from the index, which holds a file as it was last
 * saved; a file being edited may carry a withholding mark that has not reached
 * the disk yet, so nothing of it is quoted until it is saved.
 */
export async function searchSavedKnowledgeBase(
  search: Parameters<typeof searchKnowledgeBase>[0],
  query: string,
  starredPaths: readonly string[],
  limit: number,
): Promise<KbSearchHit[]> {
  const saved = await withoutUnsavedFiles(starredPaths, (path) => path)
  return searchKnowledgeBase(search, query, saved, limit)
}

/** parsed text of one corpus file; throws with a plain message the panel can
 *  show — shell main has no i18n channel of its own (unlike the docs
 *  attachment reader, whose errors carry locale strings and a larger budget) */
export async function readKnowledgeFileText(filePath: string): Promise<string> {
  // before the cache: a file open with unsaved changes is not read at all
  await assertFileSaved(filePath)
  const stat = statSync(filePath)
  const stamp = `${stat.mtimeMs}:${stat.size}`
  const cached = kbTextCache.get(filePath)
  if (cached && cached.stamp === stamp) return cached.text
  if (stat.size > KB_READ_MAX_BYTES) {
    throw new Error(
      `file too large to read (${Math.round(stat.size / 1024 / 1024)}MB, cap ${KB_READ_MAX_BYTES / 1024 / 1024}MB)`,
    )
  }
  const parsed = await parseFileToText(filePath)
  if (!parsed.ok || parsed.kind !== 'text' || parsed.text == null) {
    throw new Error(parsed.error ?? 'unreadable file')
  }
  kbTextCache.set(filePath, { stamp, text: parsed.text })
  if (kbTextCache.size > KB_TEXT_CACHE_MAX) {
    const oldest = kbTextCache.keys().next().value
    if (oldest) kbTextCache.delete(oldest)
  }
  return parsed.text
}

/** one page of a corpus file's text */
export interface KbReadPage {
  text: string
  /** total parsed characters, so the reader knows whether to page on */
  totalChars: number
  offset: number
}

export async function readKnowledgeFilePage(filePath: string, offset: number): Promise<KbReadPage> {
  const text = await readKnowledgeFileText(filePath)
  const start = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0
  if (start >= text.length) return { text: '', totalChars: text.length, offset: start }
  return {
    text: text.slice(start, start + KB_READ_CHUNK_CHARS),
    totalChars: text.length,
    offset: start,
  }
}

// ---- asking one starred group (spec 8.8) ----
//
// A home ask can be narrowed to one starred group. The narrowing is kept here
// in main, not by the screen: the panel names a group once per run, main mints
// an opaque scope for it, and every kb:* call of that run carries the scope.
// Main resolves the group's members from the starred store on each call, so a
// file list sent from the renderer is never trusted, and there is no call that
// changes what an open scope covers. A call without a scope is an unscoped ask
// (every starred file, as before); a scope main does not hold is refused, never
// read as unscoped. Narrowing only ever filters what the existing checks
// (starred only, unsaved files refused, excerpts from files indexed as on disk)
// already allow.

/** the refusal of a read outside the run's knowledge base: the starred set, or the run's group */
export const KB_NOT_IN_BASE = 'path is not in the knowledge base'

/** a call carried a scope main does not hold (never opened, closed, evicted, or another window's) */
export const KB_SCOPE_UNKNOWN = 'knowledge-base scope is not open'

/** a scope was asked for a group with no starred files (never existed, emptied, renamed away) */
export const KB_GROUP_EMPTY = 'knowledge-base group has no starred files'

/** how many group scopes main holds at once; the oldest is dropped (and then refused) past this */
const KB_SCOPES_MAX = 16

/**
 * The starred part of a scope: every starred file, one group's, or none (the
 * project scope of an editor's AI panel, which reads its project folder only).
 */
export type KbStarredReach = 'all' | 'none' | { group: string }

interface HeldScope {
  owner: number
  starred: KbStarredReach
  /** a project folder the run may also read (spec 5.5); the project tools re-check it on every call */
  projectId: ProjectId | null
}

/**
 * The scopes of runs (decision 0020). A scope covers a starred group, a project
 * folder (kind "project folder", decision 0088), or both: the home ask with a
 * project chosen reads the project folder plus its starred scope (all or one
 * group). What a scope covers never changes after it is opened.
 */
export class KbRunScopes {
  private readonly scopes = new Map<string, HeldScope>()

  constructor(
    private readonly newScope: () => string = () => randomBytes(24).toString('hex'),
    private readonly max = KB_SCOPES_MAX,
  ) {}

  /** a scope for one run of `owner` (a webContents id) over `group`; refuses a group with no starred files */
  open(owner: number, group: unknown, groupOf: ReadonlyMap<string, string>): string {
    return this.hold({ owner, starred: { group: checkedGroup(group, groupOf) }, projectId: null })
  }

  /**
   * A scope for one run of `owner` over a project folder plus a starred part:
   * 'none' for an editor's panel, 'all' or a group for the home ask. The caller
   * has checked that the project is listed and its folder exists.
   */
  openProject(
    owner: number,
    projectId: ProjectId,
    starred: KbStarredReach = 'none',
    groupOf: ReadonlyMap<string, string> = new Map(),
  ): string {
    const reach: KbStarredReach =
      typeof starred === 'object' ? { group: checkedGroup(starred.group, groupOf) } : starred
    return this.hold({ owner, starred: reach, projectId })
  }

  private hold(held: HeldScope): string {
    const scope = this.newScope()
    this.scopes.set(scope, held)
    while (this.scopes.size > this.max) {
      const oldest = this.scopes.keys().next().value
      if (oldest === undefined) break
      this.scopes.delete(oldest)
    }
    return scope
  }

  /** the held scope a call names; undefined when it names none; throws for any other value */
  private heldFor(owner: number, raw: unknown): HeldScope | undefined {
    const scope = raw && typeof raw === 'object' ? (raw as { scope?: unknown }).scope : undefined
    if (scope === undefined) return undefined
    const held = typeof scope === 'string' ? this.scopes.get(scope) : undefined
    if (!held || held.owner !== owner) throw new Error(KB_SCOPE_UNKNOWN)
    return held
  }

  /** the run is over; only the window that opened a scope can close it */
  close(owner: number, scope: unknown): void {
    if (typeof scope === 'string' && this.scopes.get(scope)?.owner === owner) {
      this.scopes.delete(scope)
    }
  }

  /**
   * `paths` narrowed to what this call may touch. `raw` is the call's argument
   * object; only its `scope` field is read. No scope: every path (an unscoped
   * ask). A held scope: every path ('all'), none ('none'), or the paths whose
   * group is the scope's group right now. Anything else: refused.
   */
  narrow(
    owner: number,
    raw: unknown,
    paths: readonly string[],
    groupOf: () => ReadonlyMap<string, string>,
  ): string[] {
    const held = this.heldFor(owner, raw)
    if (held === undefined || held.starred === 'all') return [...paths]
    if (held.starred === 'none') return []
    const group = held.starred.group
    const groups = groupOf()
    return paths.filter((path) => groups.get(path) === group)
  }

  /**
   * The project folder the call's scope also reads, or null (no scope, or a
   * starred-only scope). A scope main does not hold is refused, as in `narrow`.
   */
  projectOf(owner: number, raw: unknown): ProjectId | null {
    return this.heldFor(owner, raw)?.projectId ?? null
  }
}

function checkedGroup(group: unknown, groupOf: ReadonlyMap<string, string>): string {
  if (typeof group !== 'string' || !group || ![...groupOf.values()].includes(group)) {
    throw new Error(KB_GROUP_EMPTY)
  }
  return group
}

/**
 * What `kb:open-scope` was asked for: a group name alone (as before), or
 * `{ group, projectId }` from the home ask with a project chosen, where a
 * missing or null group means every starred file.
 */
export function parseKbOpenScope(raw: unknown): { group: unknown; projectId: ProjectId | null } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { group: raw, projectId: null }
  const req = raw as { group?: unknown; projectId?: unknown }
  return {
    group: req.group ?? null,
    projectId: typeof req.projectId === 'string' && req.projectId ? req.projectId : null,
  }
}

// ---- the home ask with a project chosen (spec 5.5) ----

/** a knowledge read reached a cloud-only project file and the person declined the download */
export const KB_DOWNLOAD_DECLINED =
  'the person declined to download this file, which is not on this PC'

/**
 * searchSavedKnowledgeBase widened by a project folder the run also reads.
 * `within` is the project's "visible to the AI" test on absolute paths. The
 * narrowing happens in the index query (`search`'s filter), so starred and
 * project files rank together and nothing else fills the pool. Project hits
 * keep the protections of starred ones: only files indexed as they are on
 * disk, none open with unsaved changes. Without a project this is the starred
 * search unchanged.
 */
export async function searchSavedKnowledgeWithProject(
  search: (
    q: string,
    limit: number,
    within?: (path: string) => boolean,
  ) => ReadonlyArray<{ path: string; name: string; ext: string; snippetText?: string }>,
  query: string,
  starredPaths: readonly string[],
  limit: number,
  within: ((path: string) => boolean) | null,
  indexedAsOnDisk: (paths: readonly string[]) => readonly string[],
): Promise<KbSearchHit[]> {
  if (!within) return searchSavedKnowledgeBase((q, n) => search(q, n), query, starredPaths, limit)
  const q = query.trim().slice(0, KB_QUERY_MAX_CHARS)
  if (!q) return []
  const starred = new Set(await withoutUnsavedFiles(starredPaths, (path) => path))
  const pool = search(q, KB_SEARCH_POOL, (path) => starred.has(path) || within(path))
  const fromProject = pool.map((hit) => hit.path).filter((path) => !starred.has(path))
  const projectOk = new Set(await withoutUnsavedFiles(indexedAsOnDisk(fromProject), (path) => path))
  const allowed = pool
    .map((hit) => hit.path)
    .filter((path) => starred.has(path) || projectOk.has(path))
  return searchKnowledgeBase(() => pool, q, allowed, limit)
}

/**
 * One page of a knowledge read in a run that may also hold a project. A
 * starred file the scope allows reads as before (the person chose it); else
 * the project read decides (visibility, unsaved, size, the cloud-only
 * question); without a project the path is outside the base.
 */
export async function readKnowledgeOrProjectPage(
  path: string,
  offset: number,
  starredAllowed: boolean,
  readProject: ((path: string, offset: number) => Promise<ProjectReadResult>) | null,
): Promise<KbReadPage> {
  if (starredAllowed) return readKnowledgeFilePage(path, offset)
  if (!readProject) throw new Error(KB_NOT_IN_BASE)
  const result = await readProject(path, offset)
  if (result.status === 'ok') {
    return { text: result.text, totalChars: result.totalChars, offset: result.offset }
  }
  if (result.status === 'declined') throw new Error(KB_DOWNLOAD_DECLINED)
  switch (result.reason) {
    case 'unsaved':
      throw new Error(UNSAVED_CHANGES_MESSAGE)
    case 'too-large':
      throw new Error(`file too large to read (cap ${KB_READ_MAX_BYTES / 1024 / 1024}MB)`)
    case 'unreadable':
      throw new Error('unreadable file')
    default:
      throw new Error(KB_NOT_IN_BASE)
  }
}

// ---- create_document: the ask panel's one write path ----

export type KbCreateFormat = 'md' | 'docx'

export interface KbCreateRequest {
  title: string
  format: KbCreateFormat
  content: string
}

/** keep in step with CREATE_DOCUMENT_MAX_CHARS in agent-core */
export const KB_CREATE_MAX_CHARS = 2_000_000

/** validate the renderer's payload; throws a plain message for the panel */
export function parseKbCreateRequest(raw: unknown): KbCreateRequest {
  const req = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const format = req.format
  if (format !== 'md' && format !== 'docx') throw new Error('format must be "md" or "docx"')
  const content = typeof req.content === 'string' ? req.content : ''
  if (!content.trim()) throw new Error('content must not be empty')
  if (content.length > KB_CREATE_MAX_CHARS) throw new Error('content is too long')
  return { title: typeof req.title === 'string' ? req.title : '', format, content }
}

export interface KbCreateDeps {
  /** folder new files land in */
  dir: () => string
  /** `${sanitized title}${ext}` → first free absolute path in dir */
  uniquePath: (dir: string, fileName: string) => string
  sanitizeBase: (title: string) => string
  writeText: (path: string, text: string) => Promise<void>
  /** markdown → .docx at `out` (the bundled CLI) */
  markdownToDocx: (markdown: string, out: string) => Promise<void>
  recordRecent: (path: string) => void
  /**
   * A project chosen at home (spec 6): the document is made first (Word through
   * `docxBytes`, never inside the folder) and then written by `write`, which
   * picks a free name in the project folder through its write guard. Absent:
   * the default save folder as before.
   */
  project?: {
    write: (fileName: string, bytes: Uint8Array) => Promise<string>
    docxBytes: (markdown: string) => Promise<Uint8Array>
  }
}

export async function createKnowledgeDocument(
  deps: KbCreateDeps,
  req: KbCreateRequest,
): Promise<{ path: string }> {
  const fileName = `${deps.sanitizeBase(req.title)}.${req.format}`
  if (deps.project) {
    const bytes =
      req.format === 'md'
        ? Buffer.from(req.content, 'utf8')
        : await deps.project.docxBytes(req.content)
    const written = await deps.project.write(fileName, bytes)
    deps.recordRecent(written)
    return { path: written }
  }
  const path = deps.uniquePath(deps.dir(), fileName)
  if (req.format === 'md') await deps.writeText(path, req.content)
  else await deps.markdownToDocx(req.content, path)
  deps.recordRecent(path)
  return { path }
}
