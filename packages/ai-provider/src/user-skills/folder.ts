/**
 * One skill folder: what is in it (size, scripts, template), its front matter,
 * the content hash a GitHub install records, and the web addresses in its
 * text files.
 */
import { createHash } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { mcpServersOfSkill } from '@genoffice/agent-core/skill-mcp-refs'
import {
  IEUM_SOURCE_FILE,
  IEUM_TEMPLATE_KEY,
  IEUM_TITLE_KEY,
  MAX_USER_SKILL_BYTES,
  MAX_USER_SKILL_FILES,
  SKILL_SCRIPTS_FOLDER,
  SKILL_SCRIPT_EXTENSIONS,
  SKILL_TEMPLATE_FOLDER,
  SKILL_TEXT_EXTENSIONS,
} from './constants'
import { parseSkillMd, type ParsedSkillMd } from './frontmatter'
import { isReservedUserSkillName, isValidUserSkillName, userSkillId } from './names'
import type { UserSkill, UserSkillSource, UserSkillUnreadableReason } from './types'

export interface SkillFolderFile {
  /** the path inside the skill folder, with `/` between parts */
  rel: string
  path: string
  size: number
}

export interface SkillFolderLimits {
  files: number
  bytes: number
}

/**
 * Every file in a folder, sorted by inside path. Links to folders are not
 * followed. A link to a file counts only when its real place is inside the
 * folder's real place, and then `path` is that real place; a link leading out
 * (into `~/.codex`, for one) is skipped, so nothing reads through it. With
 * limits, the walk stops once either is passed and `tooLarge` is set.
 * `undefined` when the folder or a folder in it cannot be read.
 */
export async function listSkillFolderFiles(
  dir: string,
  limits?: SkillFolderLimits,
): Promise<{ files: SkillFolderFile[]; bytes: number; tooLarge: boolean } | undefined> {
  const files: SkillFolderFile[] = []
  let bytes = 0
  let tooLarge = false
  let root: string
  try {
    root = await realpath(dir)
  } catch {
    return undefined
  }
  const walk = async (current: string, rel: string): Promise<boolean> => {
    let entries: Dirent[]
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return false
    }
    for (const entry of entries) {
      if (tooLarge) return true
      const path = join(current, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!(await walk(path, relPath))) return false
        continue
      }
      let target = path
      if (entry.isSymbolicLink()) {
        const real = await realpath(path).catch(() => undefined)
        if (!real || !isInsideDir(real, root)) continue
        target = real
      } else if (!entry.isFile()) {
        continue
      }
      const info = await stat(target).catch(() => undefined)
      if (!info?.isFile()) continue
      files.push({ rel: relPath, path: target, size: info.size })
      bytes += info.size
      if (limits && (files.length > limits.files || bytes > limits.bytes)) tooLarge = true
    }
    return true
  }
  if (!(await walk(dir, ''))) return undefined
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  return { files, bytes, tooLarge }
}

/** A file in the scripts folder or of a script type makes a skill "with scripts" */
export function isSkillScriptPath(rel: string): boolean {
  const parts = rel.split('/')
  if (parts.slice(0, -1).some((part) => part.toLowerCase() === SKILL_SCRIPTS_FOLDER)) return true
  return SKILL_SCRIPT_EXTENSIONS.has(extname(rel).toLowerCase())
}

/** A template path the app accepts: relative, under `assets/`, no `.` or `..` parts */
export function normalizeSkillTemplatePath(value: string | undefined): string | undefined {
  if (!value) return undefined
  const path = value.trim()
  if (path.includes('\\') || isAbsolute(path) || /^[A-Za-z]:/.test(path)) return undefined
  const parts = path.split('/')
  if (parts[0] !== SKILL_TEMPLATE_FOLDER || parts.length < 2) return undefined
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return undefined
  return path
}

/** Whether `child` is `parent` or inside it, comparing without case on Windows */
export function isInsideDir(child: string, parent: string): boolean {
  const fold = (path: string) => (process.platform === 'win32' ? path.toLowerCase() : path)
  const rel = relative(fold(resolve(parent)), fold(resolve(child)))
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

export interface ReadUserSkillFolderOptions {
  source: UserSkillSource
  plugin?: string | undefined
  /** builtin names the builtin list marks as agent-window only */
  agentOnlyNames?: ReadonlySet<string> | undefined
}

/**
 * Read one skill folder. Returns `undefined` for a reserved name (by folder or
 * by front matter): such a skill is never listed. A skill that cannot be used
 * still comes back, with `unreadable` set.
 */
export async function readUserSkillFolder(
  dir: string,
  options: ReadUserSkillFolderOptions,
): Promise<UserSkill | undefined> {
  const folderName = basename(dir)
  if (isReservedUserSkillName(folderName)) return undefined

  let unreadable: UserSkillUnreadableReason | undefined
  const listed = await listSkillFolderFiles(dir, {
    files: MAX_USER_SKILL_FILES,
    bytes: MAX_USER_SKILL_BYTES,
  })
  if (!listed) unreadable = 'unreadable'
  else if (listed.tooLarge) unreadable = 'too-large'

  let text: string | undefined
  if (listed) {
    const fold = (rel: string) => (process.platform === 'win32' ? rel.toLowerCase() : rel)
    const skillMd =
      listed.files.find((file) => file.rel === 'SKILL.md') ??
      listed.files.find((file) => fold(file.rel) === fold('SKILL.md'))
    if (skillMd) {
      try {
        text = await readFile(skillMd.path, 'utf8')
      } catch {
        unreadable ??= 'unreadable'
      }
    } else {
      // something named SKILL.md that is not a file in the folder, such as a link leading out
      const there = await lstat(join(dir, 'SKILL.md')).catch(() => undefined)
      if (there) unreadable ??= 'unreadable'
    }
  }
  const parsed = text === undefined ? undefined : parseSkillMd(text)
  const frontName = parsed?.name?.trim()
  if (frontName && isReservedUserSkillName(frontName)) return undefined
  const description = parsed?.description?.trim() ?? ''
  if (!parsed || !description) unreadable ??= 'no-frontmatter'
  if (!frontName || !isValidUserSkillName(frontName)) unreadable ??= 'bad-name'

  const name = frontName && isValidUserSkillName(frontName) ? frontName : folderName
  const template = normalizeSkillTemplatePath(parsed?.metadata[IEUM_TEMPLATE_KEY])
  const title = parsed?.metadata[IEUM_TITLE_KEY]?.trim() || name
  const files = listed?.files ?? []
  return {
    id: userSkillId(options.source, name, options.plugin),
    source: options.source,
    plugin: options.source === 'plugin' ? options.plugin : undefined,
    name,
    folderName,
    dir,
    title,
    description,
    template,
    templateExists: template !== undefined && files.some((file) => file.rel === template),
    hasScripts: files.some((file) => isSkillScriptPath(file.rel)),
    mcpServers: parsed ? mcpServersOfSkillMd(parsed) : [],
    github: options.source === 'app' && files.some((file) => file.rel === IEUM_SOURCE_FILE),
    agentOnly:
      options.source === 'builtin' &&
      (options.agentOnlyNames?.has(name) === true ||
        options.agentOnlyNames?.has(folderName) === true),
    files: files.length,
    bytes: listed?.bytes ?? 0,
    unreadable,
  }
}

/**
 * The MCP servers a read SKILL.md refers to (spec 8): its front matter
 * `allowed-tools` (a list or a string) and `mcp__<server>__<tool>` in its body.
 */
export function mcpServersOfSkillMd(parsed: ParsedSkillMd): string[] {
  return mcpServersOfSkill(
    parsed.body,
    parsed.lists['allowed-tools'] ?? parsed.fields['allowed-tools'],
  )
}

/**
 * SHA-256 (hex) of a skill folder's paths, sizes and contents, leaving out the
 * GitHub source record at its top. The same files give the same hash on any
 * machine: paths use `/` and are sorted by code unit.
 */
export async function skillContentHash(dir: string): Promise<string> {
  const listed = await listSkillFolderFiles(dir)
  if (!listed) throw new Error(`Cannot read the skill folder: ${dir}`)
  const hash = createHash('sha256')
  for (const file of listed.files) {
    if (file.rel === IEUM_SOURCE_FILE) continue
    const content = await readFile(file.path)
    hash.update(`${file.rel}\0${content.length}\0`)
    hash.update(content)
  }
  return hash.digest('hex')
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`()[\]{}]+/gi

/** The http and https addresses in a text, each once, in order, without trailing punctuation */
export function findUrlsInText(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(/[.,;:!?]+$/, '')
    if (/^https?:\/\/[^/]/i.test(url)) found.add(url)
  }
  return [...found]
}

/** Files larger than this are not searched for web addresses */
export const SKILL_URL_SEARCH_MAX_FILE_BYTES = 2 * 1024 * 1024

/** The web addresses in a skill folder's text files, each once */
export async function findSkillUrls(
  dir: string,
  maxFileBytes = SKILL_URL_SEARCH_MAX_FILE_BYTES,
): Promise<string[]> {
  const listed = await listSkillFolderFiles(dir, {
    files: MAX_USER_SKILL_FILES,
    bytes: MAX_USER_SKILL_BYTES,
  })
  const found = new Set<string>()
  for (const file of listed?.files ?? []) {
    if (!SKILL_TEXT_EXTENSIONS.has(extname(file.rel).toLowerCase())) continue
    if (file.size > maxFileBytes) continue
    const text = await readFile(file.path, 'utf8').catch(() => '')
    for (const url of findUrlsInText(text)) found.add(url)
  }
  return [...found]
}
