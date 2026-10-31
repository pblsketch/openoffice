import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  FolderIdentity,
  ProjectFolderFile,
  ProjectId,
  ProjectListEntry,
} from '@genoffice/project-store'
import type { StoredProjectsSettings } from '../app-settings'
import { readProjectFile } from './folder-files'
import { relativeInside, samePath } from './paths'

/**
 * A project's identity is the `id` in `.ieumoffice/project.json`, not its path
 * (spec 5.11). When a folder is added (or a missing project is re-picked) this
 * decides whether it is a project the list already knows, the same project moved,
 * or a copy that needs an id of its own.
 */

export type FolderClassification =
  | { kind: 'refused'; reason: 'different-project' }
  | {
      kind: 'ok'
      identity: FolderIdentity
      /** The project id to list the folder under; null when a new one must be made */
      id: ProjectId | null
      /** The list entry the folder takes over (moved, re-picked) */
      previous?: ProjectListEntry
      /** For a copy: the project it was copied from (its trust and switches carry over) */
      copiedFrom?: ProjectId
      /** A list entry at this path whose id the folder no longer carries; it is dropped */
      staleAtPath?: ProjectId
    }

export interface ClassifyInput {
  /** Canonical folder path */
  root: string
  /** The folder's `project.json`, or null */
  file: ProjectFolderFile | null
  settings: StoredProjectsSettings
  platform: NodeJS.Platform
  /** Re-picking this "folder missing" project */
  relocateId?: ProjectId
}

async function idAt(path: string): Promise<ProjectId | null> {
  try {
    if (!(await stat(path)).isDirectory()) return null
  } catch {
    return null
  }
  return (await readProjectFile(path))?.id ?? null
}

/**
 * - Re-pick: the chosen folder becomes the project's new path when it has no
 *   `project.json` or the same id; another id is refused.
 * - Already listed at this path (same id or no `project.json`): existing.
 * - Its id is listed at another path: a copy when that path still holds the same
 *   id, otherwise the same project moved.
 * - Otherwise new (keeping the folder's id when it has one).
 */
export async function classifyFolder(input: ClassifyInput): Promise<FolderClassification> {
  const { root, file, settings, platform, relocateId } = input
  const atPath = settings.list.find((item) => samePath(item.path, root, platform))

  if (relocateId) {
    if ((file && file.id !== relocateId) || (atPath && atPath.id !== relocateId)) {
      return { kind: 'refused', reason: 'different-project' }
    }
    return {
      kind: 'ok',
      identity: atPath ? 'existing' : 'moved',
      id: relocateId,
      previous: settings.list.find((item) => item.id === relocateId),
    }
  }

  if (atPath && (!file || file.id === atPath.id)) {
    return { kind: 'ok', identity: 'existing', id: atPath.id }
  }
  const staleAtPath = atPath?.id
  const listed = file
    ? settings.list.find((item) => item.id === file.id && !samePath(item.path, root, platform))
    : undefined
  if (file && listed) {
    if ((await idAt(listed.path)) === file.id) {
      return { kind: 'ok', identity: 'copied', id: null, copiedFrom: file.id, staleAtPath }
    }
    return { kind: 'ok', identity: 'moved', id: file.id, previous: listed, staleAtPath }
  }
  return { kind: 'ok', identity: 'new', id: file?.id ?? null, staleAtPath }
}

/** "No project" records of documents in a moved project follow it to the new path */
export function rebaseOptOuts(
  settings: StoredProjectsSettings,
  id: ProjectId,
  oldRoot: string,
  newRoot: string,
  platform: NodeJS.Platform,
): void {
  for (const [doc, record] of Object.entries(settings.optedOutDocuments)) {
    if (record.projectId !== id) continue
    const rel = relativeInside(oldRoot, doc, platform)
    if (rel === null) continue
    delete settings.optedOutDocuments[doc]
    settings.optedOutDocuments[join(newRoot, ...rel.split('/'))] = { projectId: id }
  }
}
