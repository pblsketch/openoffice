import { createHash } from 'node:crypto'
import { realpath, type Stats } from 'node:fs'
import { lstat, readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import {
  isValidProjectId,
  PROJECT_FOLDER_NAMES,
  PROJECT_FORMAT_VERSION,
  PROJECT_NAME_MAX_CHARS,
  type ProjectFolderFile,
} from '@genoffice/project-store'
import { relativeInside } from './paths'

/** the OS's own resolution (long names on Windows), unlike the JS `realpath` */
const realpathNative = promisify(realpath.native)

/**
 * Reading what a project folder holds (spec 3). Reads never create anything and
 * never follow a link or junction: a linked `.ieumoffice/`, a linked file or a
 * file with a second hard link reads as absent, so a planted link cannot pull a
 * file from elsewhere on the PC (a sign-in store, say) into a request.
 */

/** sha256 hex of the UTF-8 text, as kept in the trust record */
export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

async function lstatOrNull(path: string): Promise<Stats | null> {
  try {
    return await lstat(path)
  } catch {
    return null
  }
}

/**
 * The absolute path of `<root>/<segments>` when every folder on the way is a real
 * folder and the last entry is a plain file with one name; null otherwise.
 */
export async function plainFileIn(
  root: string,
  segments: readonly string[],
): Promise<string | null> {
  let path = root
  for (let index = 0; index < segments.length; index++) {
    path = join(path, segments[index]!)
    const info = await lstatOrNull(path)
    if (!info || info.isSymbolicLink()) return null
    const last = index === segments.length - 1
    if (!last && !info.isDirectory()) return null
    if (last && (!info.isFile() || info.nlink > 1)) return null
  }
  return path
}

/** a file reached by `realPlainFileIn`: where it is on disk and its segments below the root */
export interface RealFolderFile {
  path: string
  segments: string[]
}

/**
 * `plainFileIn` for a path someone else named (the AI's read tool): the file as it
 * is named on disk. On Windows one entry answers to several spellings: an 8.3 short
 * name (`IEUMOF~1`), trailing dots or spaces, other letter case. A rule judged on
 * the given spelling could pass a hidden or ignored entry, so the caller judges the
 * segments returned here, which come from the file's real path. `root` is the
 * project's canonical path. Null when the file is not plain or its real path does
 * not lie below `root`.
 */
export async function realPlainFileIn(
  root: string,
  segments: readonly string[],
  platform: NodeJS.Platform = process.platform,
): Promise<RealFolderFile | null> {
  const path = await plainFileIn(root, segments)
  if (!path) return null
  let real: string
  try {
    real = (await realpathNative(path)).normalize('NFC')
  } catch {
    return null
  }
  const rel = relativeInside(root, real, platform)
  if (rel === null) return null
  return { path: real, segments: rel.split('/') }
}

/** The entry names of `<root>/<segments>` when it is a real folder (no link on the way); [] otherwise */
export async function plainFolderEntries(
  root: string,
  segments: readonly string[],
): Promise<string[]> {
  let path = root
  for (const segment of segments) {
    path = join(path, segment)
    const info = await lstatOrNull(path)
    if (!info || info.isSymbolicLink() || !info.isDirectory()) return []
  }
  try {
    return await readdir(path)
  } catch {
    return []
  }
}

/** UTF-8 text of a plain file in the folder (BOM dropped), or null when absent or not plain */
export async function readFolderText(
  root: string,
  segments: readonly string[],
): Promise<string | null> {
  const path = await plainFileIn(root, segments)
  if (!path) return null
  try {
    const text = await readFile(path, 'utf8')
    return text.startsWith('\uFEFF') ? text.slice(1) : text
  } catch {
    return null
  }
}

/** A file under `.ieumoffice/` */
export function readDataText(root: string, name: string): Promise<string | null> {
  return readFolderText(root, [PROJECT_FOLDER_NAMES.dataDir, name])
}

/** A project name as stored: one line, at most `PROJECT_NAME_MAX_CHARS` characters */
export function cleanProjectName(name: string): string {
  const oneLine = name.replace(/\s+/g, ' ').trim()
  return Array.from(oneLine).slice(0, PROJECT_NAME_MAX_CHARS).join('')
}

/** `.ieumoffice/project.json` when present and well-formed (a bad id makes the file count as absent) */
export async function readProjectFile(root: string): Promise<ProjectFolderFile | null> {
  const text = await readDataText(root, PROJECT_FOLDER_NAMES.projectFile)
  if (text === null) return null
  try {
    const raw = JSON.parse(text) as Record<string, unknown>
    if (!raw || typeof raw !== 'object' || !isValidProjectId(raw.id)) return null
    const name = typeof raw.name === 'string' ? cleanProjectName(raw.name) : ''
    return {
      version: PROJECT_FORMAT_VERSION,
      id: raw.id,
      name: name || basename(root),
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
    }
  } catch {
    return null
  }
}

/** `project.json` text as the app writes it */
export function projectFileText(file: ProjectFolderFile): string {
  return `${JSON.stringify(
    { version: PROJECT_FORMAT_VERSION, id: file.id, name: file.name, createdAt: file.createdAt },
    null,
    2,
  )}\n`
}
