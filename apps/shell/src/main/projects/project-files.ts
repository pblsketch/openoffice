import type { Dirent } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { ProjectFileEntry } from '@genoffice/project-store'
import { isSupportedTreeFile } from '../folder-tree'
import { SCAN_MAX_DEPTH } from '../file-index/scan'
import { resolveCloudOnly as detectCloudOnly } from './cloud-files'
import { compileIgnore } from './ignore'
import type { ContextFiles, ContextFilesRequest, ProjectAiVisibility } from './project-guide'
import { isAiVisiblePath } from './visibility'

/**
 * The files of a project folder the AI may see (spec 5.4 item 4, 5.5): every
 * supported document under the folder (the home tree's formats) that the
 * visibility rule lets through, newest modification first. The walk never
 * follows a link or junction (a directory entry that is a link is neither a
 * file nor a folder), never opens a file, and reads `ignore` through the
 * visibility the caller fetched for this call.
 */

/** file names per send (spec 5.4 item 4); past this the context says "N more, use search" */
export const PROJECT_CONTEXT_FILES_LIMIT = 500

/** `resolveCloudOnly` from cloud-files: one detector run per call, true = not on this PC */
export type CloudOnlyResolver = (paths: readonly string[]) => Promise<Map<string, boolean>>

/** a listed file and where it is on disk */
export interface VisibleFile extends ProjectFileEntry {
  path: string
}

/** newest first; equal times by path so the order is stable */
function newestFirst(a: VisibleFile, b: VisibleFile): number {
  return b.mtimeMs - a.mtimeMs || (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0)
}

/**
 * Every AI-visible supported file of the folder, newest first, `cloudOnly`
 * unset (false). Depth follows the index's walk (`SCAN_MAX_DEPTH`).
 */
export function listVisibleFiles(visibility: ProjectAiVisibility): Promise<VisibleFile[]> {
  return walkSupportedFiles(
    visibility.root,
    (rel) => visibility.isVisible(rel, true),
    (rel) => visibility.isVisible(rel, false),
  )
}

/** `listVisibleFiles` or a cached stand-in for it */
export type VisibleFileLister = (visibility: ProjectAiVisibility) => Promise<VisibleFile[]>

/**
 * How long one project's walk is reused (context file names of each send, the
 * `@` list, the list tool). A send, its tool calls and the `@` list of the next
 * message often ask within seconds; on a large folder each walk is thousands of
 * file system calls. Tunable; a file added or removed meanwhile shows after this.
 */
export const PROJECT_FILE_LIST_CACHE_MS = 5_000

export interface CachedFileLister extends VisibleFileLister {
  /** forget the walks of one project root, or of every project */
  invalidate(root?: string): void
}

/**
 * `listVisibleFiles` with each project's walk remembered for `ttlMs`, keyed by
 * the root and the visibility rule (`ruleKey`), so an `ignore` edit is a new key
 * and never served a stale list. Callers asking at the same time share one walk.
 * A visibility without a `ruleKey` is never cached. A failed walk is not kept.
 */
export function createCachedFileLister(
  options: { ttlMs?: number; now?: () => number; list?: VisibleFileLister } = {},
): CachedFileLister {
  const ttl = options.ttlMs ?? PROJECT_FILE_LIST_CACHE_MS
  const now = options.now ?? Date.now
  const list = options.list ?? listVisibleFiles
  const walks = new Map<string, { root: string; at: number; files: Promise<VisibleFile[]> }>()
  const lister = (async (visibility: ProjectAiVisibility) => {
    if (visibility.ruleKey === undefined) return list(visibility)
    const at = now()
    for (const [key, walk] of walks) {
      if (at - walk.at >= ttl) walks.delete(key)
    }
    const key = `${visibility.root}\u0000${visibility.ruleKey}`
    let walk = walks.get(key)
    if (!walk) {
      const files = list(visibility)
      walk = { root: visibility.root, at, files }
      walks.set(key, walk)
      const kept = walk
      files.catch(() => {
        if (walks.get(key) === kept) walks.delete(key)
      })
    }
    // a copy: callers filter and slice, and one caller's array is never another's
    return [...(await walk.files)]
  }) as CachedFileLister
  lister.invalidate = (root) => {
    for (const [key, walk] of walks) {
      if (root === undefined || walk.root === root) walks.delete(key)
    }
  }
  return lister
}

const NO_IGNORE = compileIgnore('', { caseInsensitive: false })

/**
 * The supported files `ignore` keeps from the AI (the project screen's own
 * list, spec 5.12; never offered to AI tools), newest first. Hidden entries and
 * `.ieumoffice/` stay out of this list too.
 */
export function listIgnoredFiles(visibility: ProjectAiVisibility): Promise<VisibleFile[]> {
  const shown = (rel: string, isDir: boolean) =>
    isAiVisiblePath(visibility.root, rel, NO_IGNORE, isDir)
  return walkSupportedFiles(
    visibility.root,
    (rel) => shown(rel, true),
    (rel) => shown(rel, false) && !visibility.isVisible(rel, false),
  )
}

async function walkSupportedFiles(
  root: string,
  enterFolder: (relPath: string) => boolean,
  keepFile: (relPath: string) => boolean,
): Promise<VisibleFile[]> {
  const out: VisibleFile[] = []
  const walk = async (dir: string, rel: string, depth: number): Promise<void> => {
    if (depth > SCAN_MAX_DEPTH) return
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    const folders: Array<{ path: string; rel: string }> = []
    const files: Array<{ path: string; rel: string; name: string }> = []
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (enterFolder(childRel)) folders.push({ path, rel: childRel })
      } else if (entry.isFile() && isSupportedTreeFile(entry.name) && keepFile(childRel)) {
        files.push({ path, rel: childRel, name: entry.name })
      }
    }
    await Promise.all(
      files.map(async (file) => {
        try {
          const info = await stat(file.path)
          if (!info.isFile()) return
          out.push({
            path: file.path,
            relPath: file.rel.normalize('NFC'),
            ext: extname(file.name).slice(1).toLowerCase(),
            sizeBytes: info.size,
            mtimeMs: info.mtimeMs,
            cloudOnly: false,
          })
        } catch {
          // vanished between the listing and the stat
        }
      }),
    )
    for (const folder of folders) await walk(folder.path, folder.rel, depth + 1)
  }
  await walk(root, '', 0)
  return out.sort(newestFirst)
}

/**
 * The given files with `cloudOnly` filled in from one detector run. A detector
 * that fails marks every file as not on this PC: reading one then asks first,
 * which is the safe side.
 */
export async function withCloudFlags(
  files: readonly VisibleFile[],
  resolve: CloudOnlyResolver,
): Promise<VisibleFile[]> {
  if (files.length === 0) return []
  let verdicts: Map<string, boolean> | null = null
  try {
    verdicts = await resolve(files.map((file) => file.path))
  } catch {
    verdicts = null
  }
  return files.map((file) => ({
    ...file,
    cloudOnly: verdicts ? verdicts.get(file.path) !== false : true,
  }))
}

/** a list entry as the bridge carries it (no absolute path) */
export function toEntry(file: VisibleFile): ProjectFileEntry {
  return {
    relPath: file.relPath,
    ext: file.ext,
    sizeBytes: file.sizeBytes,
    mtimeMs: file.mtimeMs,
    cloudOnly: file.cloudOnly,
  }
}

/** project files in the AI input's `@` list (spec 5.13); tunable */
export const PROJECT_MENTION_FILES_LIMIT = 50

/**
 * The `@` list's "files of this project" (spec 5.13): the newest `limit`
 * AI-visible supported files (hidden entries, `.ieumoffice/` and `ignore` left
 * out), as path and file name. Nothing is opened.
 */
export async function projectMentionFiles(
  visibility: ProjectAiVisibility,
  limit: number = PROJECT_MENTION_FILES_LIMIT,
  list: VisibleFileLister = listVisibleFiles,
): Promise<Array<{ path: string; title: string }>> {
  const files = await list(visibility)
  return files.slice(0, limit).map((file) => ({ path: file.path, title: basename(file.path) }))
}

/**
 * The guide's `contextFiles`: the newest `limit` visible files with their
 * "not on this PC" mark, and how many were left out.
 */
export function createContextFiles(
  options: { resolveCloudOnly?: CloudOnlyResolver; limit?: number; list?: VisibleFileLister } = {},
): (request: ContextFilesRequest) => Promise<ContextFiles> {
  const resolve = options.resolveCloudOnly ?? ((paths) => detectCloudOnly(paths))
  const limit = options.limit ?? PROJECT_CONTEXT_FILES_LIMIT
  const list = options.list ?? listVisibleFiles
  return async ({ visibility }) => {
    const all = await list(visibility)
    const shown = await withCloudFlags(all.slice(0, limit), resolve)
    return { files: shown.map(toEntry), omitted: Math.max(0, all.length - shown.length) }
  }
}
