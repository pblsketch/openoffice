import { statSync } from 'node:fs'
import { isAbsolute, posix, win32 } from 'node:path'
import { canonicalPathKey, type FolderRefusalReason } from '@genoffice/project-store'
import { agentProtectedPaths } from '../agent/agent-sessions'

/**
 * Path rules of the project guide. Every path the guide stores or compares is
 * canonical by the same rule as project-store's `canonicalPathKey` (the real
 * path, NFC), and comparisons ignore case where the file system does.
 */

export function pathApi(platform: NodeJS.Platform): typeof win32 {
  return platform === 'win32' ? win32 : posix
}

/** The one key a folder or document is stored under (same rule as project-store) */
export function canonicalPath(path: string): string {
  return canonicalPathKey(path)
}

function foldsCase(platform: NodeJS.Platform): boolean {
  return platform === 'win32' || platform === 'darwin'
}

/** Normalized, NFC, without trailing separators (except a root), case-folded where needed */
export function comparablePath(path: string, platform: NodeJS.Platform): string {
  const api = pathApi(platform)
  let normalized = api.normalize(path).normalize('NFC')
  const root = api.parse(normalized).root
  while (normalized.length > root.length && /[\\/]$/.test(normalized)) {
    normalized = normalized.slice(0, -1)
  }
  return foldsCase(platform) ? normalized.toLowerCase() : normalized
}

/**
 * One path segment as a person or the app could name it inside the folder: not
 * empty, `.` or `..`, no control characters or `:` (a drive or an NTFS stream),
 * and no trailing dot or space (Windows drops those, so such a name could stand
 * for another entry).
 */
export function isPlainSegment(segment: string): boolean {
  if (segment === '' || segment === '.' || segment === '..') return false
  // eslint-disable-next-line no-control-regex -- control characters are the check
  if (/[\u0000-\u001f:]/.test(segment)) return false
  return !segment.endsWith('.') && !segment.endsWith(' ')
}

export function samePath(a: string, b: string, platform: NodeJS.Platform): boolean {
  return comparablePath(a, platform) === comparablePath(b, platform)
}

/** `child` is `root` itself or somewhere below it */
export function isInsideFolder(child: string, root: string, platform: NodeJS.Platform): boolean {
  const c = comparablePath(child, platform)
  const r = comparablePath(root, platform)
  if (c === r) return true
  const sep = pathApi(platform).sep
  return c.startsWith(r.endsWith(sep) ? r : r + sep)
}

/**
 * `child` relative to `root`, `/`-separated, or null when it is not strictly
 * inside. The spelling of `child` is kept (only the root prefix is dropped).
 */
export function relativeInside(
  root: string,
  child: string,
  platform: NodeJS.Platform,
): string | null {
  if (!isInsideFolder(child, root, platform) || samePath(child, root, platform)) return null
  const api = pathApi(platform)
  const rel = api.relative(api.normalize(root), api.normalize(child))
  if (!rel || rel.startsWith('..') || api.isAbsolute(rel)) return null
  return rel.split(api.sep).join('/').normalize('NFC')
}

export interface RefusalContext {
  homeDir: string
  userData: string
  platform: NodeJS.Platform
}

/**
 * Why a folder cannot become a project, or null when it can (spec 5.1). `folder`
 * is the canonical path. Same refusals as an agent-mode project folder: a whole
 * drive, the whole user folder, a protected folder (`agentProtectedPaths`) or a
 * folder holding one. The user folder counts as holding itself, so a folder above
 * it is refused too.
 */
export function folderRefusal(folder: string, ctx: RefusalContext): FolderRefusalReason | null {
  if (!folder || !isAbsolute(folder)) return 'not-a-folder'
  try {
    if (!statSync(folder).isDirectory()) return 'not-a-folder'
  } catch {
    return 'not-a-folder'
  }
  return locationRefusal(folder, ctx)
}

/** The location rules of `folderRefusal` alone, for a folder that does not exist yet */
export function locationRefusal(folder: string, ctx: RefusalContext): FolderRefusalReason | null {
  const { platform } = ctx
  if (!folder || !isAbsolute(folder)) return 'not-a-folder'
  const api = pathApi(platform)
  if (samePath(folder, api.parse(api.normalize(folder)).root, platform)) return 'drive-root'
  const home = canonicalPathKey(ctx.homeDir)
  if (samePath(folder, home, platform)) return 'user-home'
  const guarded = agentProtectedPaths(home, canonicalPathKey(ctx.userData)).map(canonicalPathKey)
  for (const guard of guarded) {
    if (isInsideFolder(folder, guard, platform)) return 'protected'
  }
  for (const guard of [...guarded, home]) {
    if (isInsideFolder(guard, folder, platform)) return 'contains-protected'
  }
  return null
}
