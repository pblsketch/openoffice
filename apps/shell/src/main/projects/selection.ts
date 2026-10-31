import type {
  ProjectId,
  ProjectListEntry,
  ProjectSelection,
  UnregisteredProjectHint,
} from '@genoffice/project-store'
import type { StoredProjectsSettings } from '../app-settings'
import { readProjectFile } from './folder-files'
import { isInsideFolder, locationRefusal, pathApi, samePath, type RefusalContext } from './paths'

/**
 * Which project a window's AI panel starts with (spec 5.2), and how a choice made
 * there is remembered (spec 4). Pure rules over the `projects` settings; document
 * paths arrive canonical.
 */

/** Whose AI panel asks, with a saved document's path already canonical */
export type ResolvedSelectionTarget =
  | { kind: 'document'; docKey: string }
  | { kind: 'untitled'; projectId?: ProjectId | null }
  | { kind: 'home' }

/** The key of `record` naming the same path as `path`, if any (earlier spellings included) */
export function findPathKey<T>(
  record: Record<string, T>,
  path: string,
  platform: NodeJS.Platform,
): string | undefined {
  if (Object.hasOwn(record, path)) return path
  return Object.keys(record).find((key) => samePath(key, path, platform))
}

/** The registered project folder holding a document; the nearest one when they nest */
export function containerOf(
  docKey: string,
  settings: StoredProjectsSettings,
  platform: NodeJS.Platform,
): ProjectListEntry | undefined {
  let best: ProjectListEntry | undefined
  for (const item of settings.list) {
    if (samePath(item.path, docKey, platform)) continue
    if (!isInsideFolder(docKey, item.path, platform)) continue
    if (!best || item.path.length > best.path.length) best = item
  }
  return best
}

function listedId(
  settings: StoredProjectsSettings,
  id: ProjectId | null | undefined,
): ProjectId | null {
  return id && settings.list.some((item) => item.id === id) ? id : null
}

/**
 * The starting selection without the unregistered-folder hint:
 * - inside a registered project folder: that project, unless the document was set to "no project";
 * - outside every project folder: the remembered choice and its last chat, else "no project";
 * - untitled: "no project", or the project a create flow opened it in;
 * - home: the home panel's last choice.
 */
export function selectionFor(
  settings: StoredProjectsSettings,
  target: ResolvedSelectionTarget,
  platform: NodeJS.Platform,
): ProjectSelection {
  if (target.kind === 'home') {
    return { projectId: listedId(settings, settings.homeProjectId), initialChatId: null }
  }
  if (target.kind === 'untitled') {
    return { projectId: listedId(settings, target.projectId), initialChatId: null }
  }
  const container = containerOf(target.docKey, settings, platform)
  if (container) {
    const optedOut = findPathKey(settings.optedOutDocuments, target.docKey, platform)
    return { projectId: optedOut ? null : container.id, initialChatId: null }
  }
  const key = findPathKey(settings.outsideDocuments, target.docKey, platform)
  const choice = key ? settings.outsideDocuments[key] : undefined
  const projectId = listedId(settings, choice?.projectId)
  return { projectId, initialChatId: projectId && choice?.lastChatId ? choice.lastChatId : null }
}

/**
 * Remember a choice (changes `settings`). A document inside a project keeps only
 * "no project" (or its undoing); a document outside every project keeps its choice
 * (and its last chat while the project stays the same); the home panel keeps its
 * last choice; an untitled document keeps nothing.
 */
export function recordSelection(
  settings: StoredProjectsSettings,
  target: ResolvedSelectionTarget,
  projectId: ProjectId | null,
  platform: NodeJS.Platform,
): void {
  if (target.kind === 'home') {
    settings.homeProjectId = projectId
    return
  }
  if (target.kind === 'untitled') return
  const { docKey } = target
  const container = containerOf(docKey, settings, platform)
  if (container) {
    const key = findPathKey(settings.optedOutDocuments, docKey, platform)
    if (projectId === null) {
      if (key) delete settings.optedOutDocuments[key]
      settings.optedOutDocuments[docKey] = { projectId: container.id }
    } else if (projectId === container.id && key) {
      delete settings.optedOutDocuments[key]
    }
    return
  }
  const key = findPathKey(settings.outsideDocuments, docKey, platform)
  const before = key ? settings.outsideDocuments[key] : undefined
  if (key) delete settings.outsideDocuments[key]
  settings.outsideDocuments[docKey] =
    projectId !== null && before?.projectId === projectId && before.lastChatId
      ? { projectId, lastChatId: before.lastChatId }
      : { projectId }
}

/** A document outside every project folder last used `chatId` of `projectId` (changes `settings`) */
export function recordOutsideChat(
  settings: StoredProjectsSettings,
  docKey: string,
  projectId: ProjectId,
  chatId: ProjectId,
  platform: NodeJS.Platform,
): void {
  if (containerOf(docKey, settings, platform)) return
  if (!settings.list.some((item) => item.id === projectId)) return
  const key = findPathKey(settings.outsideDocuments, docKey, platform)
  if (key) delete settings.outsideDocuments[key]
  settings.outsideDocuments[docKey] = { projectId, lastChatId: chatId }
}

/** "Remove from list": the entry, its pin and the project's per-document records go (changes `settings`) */
export function dropFromList(settings: StoredProjectsSettings, id: ProjectId): void {
  settings.list = settings.list.filter((item) => item.id !== id)
  for (const [doc, record] of Object.entries(settings.optedOutDocuments)) {
    if (record.projectId === id) delete settings.optedOutDocuments[doc]
  }
  for (const [doc, choice] of Object.entries(settings.outsideDocuments)) {
    if (choice.projectId === id) delete settings.outsideDocuments[doc]
  }
  if (settings.homeProjectId === id) settings.homeProjectId = null
}

/**
 * The nearest unregistered folder above a document holding `.ieumoffice/project.json`
 * (spec 5.2), stopping at the registered project folder holding the document.
 * Folders that could never be a project (drive, home, protected) are skipped.
 */
export async function findUnregisteredProject(
  docKey: string,
  settings: StoredProjectsSettings,
  ctx: RefusalContext,
): Promise<UnregisteredProjectHint | undefined> {
  const { platform } = ctx
  const api = pathApi(platform)
  const stopAt = containerOf(docKey, settings, platform)?.path
  let dir = api.dirname(docKey)
  for (;;) {
    if (stopAt && samePath(dir, stopAt, platform)) return undefined
    const listed = settings.list.some((item) => samePath(item.path, dir, platform))
    if (!listed && !locationRefusal(dir, ctx)) {
      const file = await readProjectFile(dir)
      if (file) return { name: file.name, folderPath: dir }
    }
    const parent = api.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}
