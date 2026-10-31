import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { PROJECT_FOLDER_NAMES, type ProjectId } from '@genoffice/project-store'
import type { ProjectGuide } from './project-guide'
import { relativeInside } from './paths'
import { ProjectWriteRefused } from './write-guard'

/**
 * New documents the AI makes while a project is chosen (spec 6, invariant 3).
 *
 * The folder rule: the folder of the window's current document when that
 * document is inside the project folder (not under `.ieumoffice/`), else the
 * project folder itself. The home ask has no document, so it is the top. A
 * name already taken gets " (2)", " (3)"... and is never written over. The
 * bytes go through the project guide's write guard only (`writeNewDocument`),
 * after the document was made: a failed make writes nothing.
 *
 * A tab a create flow opened (the create window, a template copy, the AI's new
 * Word document) carries the placement of the window that opened it, so the
 * new tab's AI panel starts in that project and its first save lands in the
 * same folder. Without a project nothing here applies: callers keep their
 * behavior of today.
 *
 * No Electron import: windows are named by webContents id and the shell passes
 * how to read a window's project and document.
 */

/** Where one window's new documents go */
export interface NewDocumentPlacement {
  projectId: ProjectId
  /** the project folder (canonical, as listed) */
  root: string
  /** the folder new documents are written into: `root` or a folder below it */
  dir: string
}

/** Who opened a create flow: the home ask, or an editor window */
export type NewDocumentOpener = { kind: 'home' } | { kind: 'window'; webContentsId: number }

/** Names tried for one new document before giving up (a folder full of copies) */
export const NEW_DOCUMENT_NAME_ATTEMPTS = 1000

/**
 * The folder rule (spec 6): `docPath`'s folder when it is inside `root` and not
 * under `.ieumoffice/`, else `root`. The result keeps the root's spelling.
 */
export function newDocumentFolder(
  root: string,
  docPath: string | null | undefined,
  platform: NodeJS.Platform = process.platform,
): string {
  if (!docPath) return root
  const rel = relativeInside(root, docPath, platform)
  if (rel === null) return root
  const segments = rel.split('/')
  segments.pop()
  if (segments.length === 0) return root
  if (segments[0]!.toLowerCase() === PROJECT_FOLDER_NAMES.dataDir) return root
  return join(root, ...segments)
}

/**
 * Whether `fileName` names a file only: no folder part (either slash), no
 * drive, not `.` or `..`. The folder always comes from the placement, never
 * from whoever named the document (an editor passes a renderer's name on).
 */
export function isBareFileName(fileName: string): boolean {
  if (!fileName || fileName === '.' || fileName === '..') return false
  return !/[\\/:]/.test(fileName)
}

/** `name.ext` for 1, `name (2).ext` for 2, and so on (the extension stays last) */
export function numberedFileName(fileName: string, n: number): string {
  if (n <= 1) return fileName
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  return `${base} (${n})${ext}`
}

async function entryExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch {
    return false
  }
}

export interface NewDocumentPlacerDeps {
  guide: Pick<ProjectGuide, 'projectRoot' | 'writeNewDocument'>
  /** the project the window's AI panel has chosen now; null for none or no AI window */
  windowProject(webContentsId: number): Promise<ProjectId | null>
  /** the window's saved document, as the shell knows it; null when untitled or unknown */
  documentOf(webContentsId: number): string | null
  platform?: NodeJS.Platform
}

export class NewDocumentPlacer {
  private readonly platform: NodeJS.Platform
  /** tabs opened by a create flow → the placement they were opened with */
  private readonly presets = new Map<number, Promise<NewDocumentPlacement | null>>()

  constructor(private readonly deps: NewDocumentPlacerDeps) {
    this.platform = deps.platform ?? process.platform
  }

  /**
   * Where `webContentsId`'s new documents go now, or null when its panel has no
   * project (the caller then does what it did before projects existed).
   */
  async placementFor(webContentsId: number): Promise<NewDocumentPlacement | null> {
    const projectId = await this.deps.windowProject(webContentsId)
    if (!projectId) return null
    const root = this.deps.guide.projectRoot(projectId)
    if (!root) return null
    const preset = await this.presetOf(webContentsId)
    if (preset && preset.projectId === projectId && preset.root === root) return preset
    return {
      projectId,
      root,
      dir: newDocumentFolder(root, this.deps.documentOf(webContentsId), this.platform),
    }
  }

  /** The placement of the window or home ask that opened a create flow */
  placementOfOpener(opener: NewDocumentOpener | null | undefined, homeId: number | null) {
    if (!opener) return Promise.resolve(null)
    if (opener.kind === 'window') return this.placementFor(opener.webContentsId)
    return homeId === null ? Promise.resolve(null) : this.placementFor(homeId)
  }

  /**
   * A create flow opened `webContentsId` for its opener: the tab starts in the
   * opener's project and saves into the opener's folder (spec 5.2, 6). A
   * placement that resolves to null leaves the tab as it is today.
   */
  preset(webContentsId: number, placement: Promise<NewDocumentPlacement | null>): void {
    const settled = placement.catch(() => null)
    this.presets.set(webContentsId, settled)
  }

  /** The project a create flow opened this tab in, or null (for the project request layer) */
  async presetProjectOf(webContentsId: number): Promise<ProjectId | null> {
    const preset = await this.presetOf(webContentsId)
    if (!preset || !this.deps.guide.projectRoot(preset.projectId)) return null
    return preset.projectId
  }

  /** The tab closed */
  forget(webContentsId: number): void {
    this.presets.delete(webContentsId)
  }

  /**
   * The folder an untitled document's save dialog opens in (spec 6): the
   * placement's folder, or null for the editor's default save folder.
   */
  async saveDialogFolder(webContentsId: number): Promise<string | null> {
    return (await this.placementFor(webContentsId))?.dir ?? null
  }

  /**
   * Write a new document of `webContentsId`'s run into its project folder;
   * null (nothing written) when its panel has no project. Throws when the
   * project folder refuses the write: nothing goes elsewhere instead.
   */
  async writeFor(
    webContentsId: number,
    fileName: string,
    bytes: Uint8Array,
  ): Promise<string | null> {
    const placement = await this.placementFor(webContentsId)
    return placement ? this.write(placement, fileName, bytes) : null
  }

  /**
   * Write `bytes` as `fileName` (or the first free numbered name) in the
   * placement's folder through the write guard; resolves to the path written.
   */
  async write(
    placement: NewDocumentPlacement,
    fileName: string,
    bytes: Uint8Array,
  ): Promise<string> {
    if (!isBareFileName(fileName)) throw new ProjectWriteRefused('bad-path', fileName)
    for (let n = 1; n <= NEW_DOCUMENT_NAME_ATTEMPTS; n++) {
      const target = join(placement.dir, numberedFileName(fileName, n))
      if (await entryExists(target)) continue
      try {
        await this.deps.guide.writeNewDocument(placement.projectId, target, bytes)
        return target
      } catch (error) {
        // another write took the name in between: try the next one
        if (error instanceof ProjectWriteRefused && error.reason === 'exists') continue
        throw error
      }
    }
    throw new ProjectWriteRefused('exists', join(placement.dir, fileName))
  }

  private presetOf(webContentsId: number): Promise<NewDocumentPlacement | null> {
    return this.presets.get(webContentsId) ?? Promise.resolve(null)
  }
}
