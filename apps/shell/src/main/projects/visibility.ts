import { isAbsolute, join } from 'node:path'
import { PROJECT_FOLDER_NAMES } from '@genoffice/project-store'
import { isHiddenEntry } from '../folder-tree'
import type { IgnoreMatcher } from './ignore'

/**
 * Whether a folder-relative path is a file the AI may see (spec 5.5, 5.9): it
 * stays inside the folder (no `..`, not absolute), no segment is a hidden entry
 * by the home tree's rule (dot names, `~$` lock files, OS junk, the Markdown
 * app-owned `assets/` folder), it is not under `.ieumoffice/`, and `ignore` does
 * not match it. Paths are not resolved here; callers that touch the disk also
 * check links (the read tool resolves the real path).
 */
export function isAiVisiblePath(
  root: string,
  relPath: string,
  matcher: IgnoreMatcher,
  isDir = false,
): boolean {
  if (!relPath || isAbsolute(relPath) || /^[\\/]/.test(relPath) || /^[A-Za-z]:/.test(relPath)) {
    return false
  }
  const segments = relPath.split(/[\\/]/).filter((segment) => segment !== '')
  if (segments.length === 0) return false
  let dir = root
  for (let index = 0; index < segments.length; index++) {
    const name = segments[index]!
    if (name === '.' || name === '..') return false
    if (index === 0 && name.toLowerCase() === PROJECT_FOLDER_NAMES.dataDir) return false
    const segmentIsDir = index < segments.length - 1 || isDir
    if (isHiddenEntry(dir, name, segmentIsDir)) return false
    dir = join(dir, name)
  }
  return !matcher.ignores(segments.join('/'), isDir)
}
