import type { Stats } from 'node:fs'
import {
  appendFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { isAbsolute, join, posix, win32 } from 'node:path'
import { tempPathBeside } from '@genoffice/electron-utils/atomic-write'
import { PROJECT_FOLDER_NAMES } from '@genoffice/project-store'
import { atomicWriteFile } from '../atomic-write'
import { isValidRenameName } from '../rename-validation'
import { comparablePath, isPlainSegment, pathApi, relativeInside, samePath } from './paths'

/**
 * The single write guard for project folders (spec 3, invariants 3 and 9).
 *
 * The app writes into a person's folder in two places only: under the project's
 * `.ieumoffice/`, and a new document the AI made inside the project folder. Every
 * such write goes through this class, which checks each time that the project
 * root is still its canonical path, that the target stays below it (no `..`, no
 * drive or stream names), and that no folder on the way nor the target itself is
 * a link or junction. JSON and Markdown are written to a temporary file and
 * renamed; writes to one file run one at a time in arrival order. `.ieumoffice/`
 * and its subfolders are created only by an actual write.
 *
 * A policy refusal throws `ProjectWriteRefused`; a file system failure throws the
 * original error. Neither is swallowed.
 */

export type ProjectWriteRefusal =
  /** The relative path is empty, absolute, or holds `..`, `.`, a stream or control characters */
  | 'bad-path'
  /** The target is not below the project folder (or, for a new document, inside `.ieumoffice/`) */
  | 'outside'
  /** A folder on the way, or the target, is a link or junction */
  | 'link'
  /** Something that should be a folder is a file, or the target is a folder */
  | 'not-a-folder'
  /** The project folder no longer resolves to the path it was registered under */
  | 'root-moved'
  /** A new document or new project folder would replace an existing entry */
  | 'exists'
  /** A new document's folder does not exist (new documents never create folders) */
  | 'missing-folder'
  /** A hard-linked file would be appended to through its other name */
  | 'hard-link'

export class ProjectWriteRefused extends Error {
  constructor(
    readonly reason: ProjectWriteRefusal,
    detail: string,
  ) {
    super(`project folder write refused (${reason}): ${detail}`)
    this.name = 'ProjectWriteRefused'
  }
}

export interface DataUpdateResult {
  /** False when the change returned null or undefined: nothing was written or created */
  written: boolean
  /** The text now in the file (the previous text when nothing was written; null when absent) */
  text: string | null
}

function errorCode(error: unknown): string {
  return (error as NodeJS.ErrnoException | undefined)?.code ?? ''
}

async function lstatOrNull(path: string): Promise<Stats | null> {
  try {
    return await lstat(path)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null
    throw error
  }
}

function looksAbsolute(path: string): boolean {
  return (
    isAbsolute(path) || win32.isAbsolute(path) || posix.isAbsolute(path) || /^[A-Za-z]:/.test(path)
  )
}

/** The segments of a path relative to `.ieumoffice/`, or a refusal */
function dataSegments(relPath: string): string[] {
  if (typeof relPath !== 'string' || relPath === '' || looksAbsolute(relPath)) {
    throw new ProjectWriteRefused('bad-path', String(relPath))
  }
  const segments = relPath.split(/[\\/]/)
  if (!segments.every(isPlainSegment)) throw new ProjectWriteRefused('bad-path', relPath)
  return segments
}

export class ProjectWriteGuard {
  private readonly queues = new Map<string, Promise<void>>()

  constructor(private readonly platform: NodeJS.Platform = process.platform) {}

  /** The absolute path of a file under `<root>/.ieumoffice/`; checks the name only, touches nothing */
  dataPath(root: string, relPath: string): string {
    return join(root, PROJECT_FOLDER_NAMES.dataDir, ...dataSegments(relPath))
  }

  /** Replace a file under `.ieumoffice/` (temporary file, then rename) */
  async writeData(root: string, relPath: string, data: string | Uint8Array): Promise<void> {
    const target = this.dataPath(root, relPath)
    await this.serialize(target, async () => {
      await this.prepareData(root, relPath, true)
      await atomicWriteFile(target, typeof data === 'string' ? Buffer.from(data, 'utf8') : data)
    })
  }

  /** Append to a file under `.ieumoffice/` (chat message lines) */
  async appendData(root: string, relPath: string, text: string): Promise<void> {
    const target = this.dataPath(root, relPath)
    await this.serialize(target, async () => {
      const existing = await this.prepareData(root, relPath, true)
      if (existing && existing.nlink > 1) throw new ProjectWriteRefused('hard-link', target)
      await appendFile(target, text, { encoding: 'utf8' })
    })
  }

  /**
   * Read, change and write one file under `.ieumoffice/` without another write to
   * that file in between. `change` gets the current text (null when absent) and
   * returns the new text, or null/undefined to leave the file (and the folder) alone.
   */
  async updateData(
    root: string,
    relPath: string,
    change: (
      current: string | null,
    ) => string | null | undefined | Promise<string | null | undefined>,
  ): Promise<DataUpdateResult> {
    const target = this.dataPath(root, relPath)
    return this.serialize(target, async () => {
      const existing = await this.prepareData(root, relPath, false)
      const current = existing ? await readFile(target, 'utf8') : null
      const next = await change(current)
      if (next === null || next === undefined) return { written: false, text: current }
      await this.prepareData(root, relPath, true)
      await atomicWriteFile(target, Buffer.from(next, 'utf8'))
      return { written: true, text: next }
    })
  }

  /** Delete one file under `.ieumoffice/` (old memory backups); a missing file is fine */
  async removeData(root: string, relPath: string): Promise<void> {
    const target = this.dataPath(root, relPath)
    await this.serialize(target, async () => {
      const existing = await this.prepareData(root, relPath, false)
      if (existing) await unlink(target)
    })
  }

  /**
   * Write a new document the AI made (spec 6): an absolute path inside the project
   * folder, not under `.ieumoffice/`, in a folder that already exists, never over an
   * existing entry. The bytes go to a temporary file beside it first.
   */
  async writeNewDocument(root: string, target: string, data: Uint8Array): Promise<void> {
    const api = pathApi(this.platform)
    if (typeof target !== 'string' || !looksAbsolute(target)) {
      throw new ProjectWriteRefused('bad-path', String(target))
    }
    if (target.split(/[\\/]/).some((segment) => segment === '..' || segment === '.')) {
      throw new ProjectWriteRefused('bad-path', target)
    }
    await this.assertRoot(root)
    const rel = relativeInside(root, api.normalize(target), this.platform)
    if (rel === null) throw new ProjectWriteRefused('outside', target)
    const segments = rel.split('/')
    if (!segments.every(isPlainSegment)) throw new ProjectWriteRefused('bad-path', target)
    if (segments[0]!.toLowerCase() === PROJECT_FOLDER_NAMES.dataDir) {
      throw new ProjectWriteRefused('outside', target)
    }
    let dir = root
    for (const segment of segments.slice(0, -1)) {
      dir = join(dir, segment)
      const info = await lstatOrNull(dir)
      if (!info) throw new ProjectWriteRefused('missing-folder', dir)
      if (info.isSymbolicLink()) throw new ProjectWriteRefused('link', dir)
      if (!info.isDirectory()) throw new ProjectWriteRefused('not-a-folder', dir)
    }
    if (!samePath(await realpath(dir), dir, this.platform))
      throw new ProjectWriteRefused('link', dir)
    const final = join(dir, segments[segments.length - 1]!)
    await this.serialize(final, async () => {
      if (await lstatOrNull(final)) throw new ProjectWriteRefused('exists', final)
      const temp = tempPathBeside(final)
      try {
        await writeFile(temp, data, { flag: 'wx' })
        if (await lstatOrNull(final)) throw new ProjectWriteRefused('exists', final)
        await rename(temp, final)
      } catch (error) {
        await unlink(temp).catch(() => undefined)
        throw error
      }
    })
  }

  /**
   * Make the folder of a new project (spec 5.1): one new folder `name` in an existing
   * `parent`. Never reuses or replaces an existing entry. Returns the folder's path
   * under the parent's canonical path.
   */
  async createProjectFolder(parent: string, name: string): Promise<string> {
    if (!isValidRenameName(name) || !isPlainSegment(name)) {
      throw new ProjectWriteRefused('bad-path', name)
    }
    if (!looksAbsolute(parent)) throw new ProjectWriteRefused('bad-path', parent)
    const realParent = (await realpath(parent)).normalize('NFC')
    const target = join(realParent, name)
    return this.serialize(target, async () => {
      if (await lstatOrNull(target)) throw new ProjectWriteRefused('exists', target)
      try {
        await mkdir(target)
      } catch (error) {
        if (errorCode(error) === 'EEXIST') throw new ProjectWriteRefused('exists', target)
        throw error
      }
      return target
    })
  }

  /** Runs `task` after every earlier task for the same file, whatever their outcome */
  private serialize<T>(path: string, task: () => Promise<T>): Promise<T> {
    const key = comparablePath(path, this.platform)
    const previous = this.queues.get(key) ?? Promise.resolve()
    const run = previous.then(task, task)
    const tail = run.then(
      () => undefined,
      () => undefined,
    )
    this.queues.set(key, tail)
    void tail.then(() => {
      if (this.queues.get(key) === tail) this.queues.delete(key)
    })
    return run
  }

  /** The root must still be a folder at exactly its registered (canonical) path */
  private async assertRoot(root: string): Promise<void> {
    if (!looksAbsolute(root)) throw new ProjectWriteRefused('bad-path', root)
    const real = await realpath(root)
    if (!samePath(real, root, this.platform)) throw new ProjectWriteRefused('root-moved', root)
    const info = await lstat(root)
    if (!info.isDirectory()) throw new ProjectWriteRefused('not-a-folder', root)
  }

  /**
   * Checks the way from the root to a data file. With `create`, missing folders
   * below the root are made one level at a time; without it, a missing folder means
   * the file is absent. Resolves to the target's stats, or null when it is absent.
   */
  private async prepareData(root: string, relPath: string, create: boolean): Promise<Stats | null> {
    const segments = dataSegments(relPath)
    await this.assertRoot(root)
    let dir = join(root, PROJECT_FOLDER_NAMES.dataDir)
    const folders = [dir]
    for (const segment of segments.slice(0, -1)) {
      dir = join(dir, segment)
      folders.push(dir)
    }
    for (const folder of folders) {
      let info = await lstatOrNull(folder)
      if (!info) {
        if (!create) return null
        try {
          await mkdir(folder)
        } catch (error) {
          if (errorCode(error) !== 'EEXIST') throw error
        }
        info = await lstat(folder)
      }
      if (info.isSymbolicLink()) throw new ProjectWriteRefused('link', folder)
      if (!info.isDirectory()) throw new ProjectWriteRefused('not-a-folder', folder)
    }
    if (!samePath(await realpath(dir), dir, this.platform)) {
      throw new ProjectWriteRefused('link', dir)
    }
    const target = join(dir, segments[segments.length - 1]!)
    const info = await lstatOrNull(target)
    if (!info) return null
    if (info.isSymbolicLink()) throw new ProjectWriteRefused('link', target)
    if (!info.isFile()) throw new ProjectWriteRefused('not-a-folder', target)
    return info
  }
}

/** The folder a data file lives in; exported for callers that list `.ieumoffice/` */
export function dataDirOf(root: string): string {
  return join(root, PROJECT_FOLDER_NAMES.dataDir)
}
