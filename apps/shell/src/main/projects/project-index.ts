import { statSync } from 'node:fs'
import type { ProjectId } from '@genoffice/project-store'
import { readProjectsSettings } from '../app-settings'
import { resolveCloudOnly as detectCloudOnly } from './cloud-files'
import { isInsideFolder, relativeInside } from './paths'
import type { CloudOnlyResolver } from './project-files'
import type { ProjectGuide } from './project-guide'

/**
 * Project folders in the home search index (spec 5.8, 5.9). The functions here
 * are handed to the indexer and the reranker by `index.ts`:
 *
 * - `projectFolderRoots` + `mergeIndexRoots`: the listed project folders join
 *   the indexer's roots (not the home folder list).
 * - `createProjectNameOnly`: inside a project folder, a file that is not on this
 *   PC is indexed by name only, so the indexer never opens (downloads) it. The
 *   rule goes by path: a project folder inside a home root gets it too, and a
 *   file outside every project folder is indexed exactly as before.
 * - `createRerankIgnoreFilter`: what any project's `ignore` lists stays out of
 *   the excerpts the reranker sends out; the home results still show it.
 */

/** The listed project folders that exist now (synchronous: the indexer asks once per scan) */
export function projectFolderRoots(settingsPath: string): string[] {
  const out: string[] = []
  for (const entry of readProjectsSettings(settingsPath).list) {
    try {
      if (statSync(entry.path).isDirectory()) out.push(entry.path)
    } catch {
      // a missing folder ("folder missing") is not walked
    }
  }
  return out
}

/**
 * The home roots followed by the project folders that are not already inside
 * one of them (or listed twice), so a file is walked under one spelling only
 */
export function mergeIndexRoots(
  homeRoots: readonly string[],
  projectRoots: readonly string[],
  platform: NodeJS.Platform = process.platform,
): string[] {
  const out = [...homeRoots]
  for (const root of projectRoots) {
    if (out.some((kept) => isInsideFolder(root, kept, platform))) continue
    out.push(root)
  }
  return out
}

/**
 * The indexer's `nameOnly` source: of a scan's batch, the files inside a
 * project folder that are not on this PC. One detector run per batch, and none
 * when no path is inside a project. A detector that fails leaves every project
 * path name-only (nothing gets downloaded by mistake).
 */
export function createProjectNameOnly(options: {
  projectRoots: () => readonly string[]
  resolveCloudOnly?: CloudOnlyResolver
  platform?: NodeJS.Platform
}): (paths: readonly string[]) => Promise<Set<string>> {
  const platform = options.platform ?? process.platform
  const resolve = options.resolveCloudOnly ?? ((paths) => detectCloudOnly(paths))
  return async (paths) => {
    const roots = options.projectRoots()
    if (roots.length === 0) return new Set()
    const inside = paths.filter((path) =>
      roots.some((root) => isInsideFolder(path, root, platform)),
    )
    if (inside.length === 0) return new Set()
    try {
      const verdicts = await resolve(inside)
      return new Set(inside.filter((path) => verdicts.get(path) !== false))
    } catch {
      return new Set(inside)
    }
  }
}

/**
 * The reranker's `sendable` filter: drops each path that some project's
 * `ignore` matches (read fresh per call). Paths outside every project pass.
 */
export function createRerankIgnoreFilter(options: {
  guide: Pick<ProjectGuide, 'listProjects' | 'aiVisibility'>
  platform?: NodeJS.Platform
}): (paths: readonly string[]) => Promise<string[]> {
  const platform = options.platform ?? process.platform
  return async (paths) => {
    const projects = (await options.guide.listProjects()).filter((project) => !project.missing)
    const holding = projects.filter((project) =>
      paths.some((path) => isInsideFolder(path, project.path, platform)),
    )
    if (holding.length === 0) return [...paths]
    const rules = (
      await Promise.all(
        holding.map((project) => options.guide.aiVisibility(project.id as ProjectId)),
      )
    ).filter((rule) => rule !== null)
    return paths.filter(
      (path) =>
        !rules.some((rule) => {
          const rel = relativeInside(rule.root, path, platform)
          return rel !== null && rule.matcher.ignores(rel)
        }),
    )
  }
}
