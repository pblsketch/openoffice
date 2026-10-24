/**
 * Resolution of internal links for the main process. The renderer only sends
 * the link text; every path is built here against the file the view has
 * open, so a page can never name an arbitrary path to open or display.
 *
 * - A CommonMark link (`[x](../other.md)`) resolves against the note's folder.
 * - A wiki link (`[[Other]]`) is looked up in the note's vault: the nearest
 *   folder above the note holding `.obsidian`, else the note's own folder.
 *   Obsidian's rule applies — a bare name matches that file anywhere in the
 *   vault, and when two share it the one closest to the note wins.
 * - Network paths (`\\server\share`, `//server`) are never touched: Windows
 *   would send the user's credentials to the server just to look at them.
 *
 * Opening goes through the shell's document router, which only opens formats
 * an editor owns. Nothing here launches a program.
 */
import type { Dirent } from 'node:fs'
import { readdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { EXPORT_IMAGE_MIME_BY_EXT } from '../shared/export-image-mime'
import type { NoteSuggestion } from '../shared/internal-links'

/** Obsidian keeps its settings in this folder at the top of a vault */
export const VAULT_MARKER = '.obsidian'
/** a vault listing stops here; bigger vaults resolve only by path */
export const MAX_VAULT_FILES = 20000
const MAX_VAULT_DEPTH = 32
/** a listing is reused for this long, so typing `[[` does not walk the disk per key */
const VAULT_INDEX_TTL_MS = 10_000
/** pictures larger than this are not shown inline */
export const MAX_EMBED_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_SUGGESTIONS = 50

export type ResolveResult =
  { ok: true; path: string } | { ok: false; reason: 'untitled' | 'blocked' | 'not-found' }

/** `\\server\share`, `//server/share`, `\\?\UNC\…` — anything that may reach the network */
export function isNetworkPath(path: string): boolean {
  return /^[\\/]{2}/.test(path)
}

function isInside(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate)
  return (
    fromRoot.length > 0 &&
    fromRoot !== '..' &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  )
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** the nearest folder above the note that holds `.obsidian`, else the note's folder */
export async function findVaultRoot(notePath: string): Promise<string> {
  const noteDir = dirname(resolve(notePath))
  if (isNetworkPath(noteDir)) return noteDir
  for (let dir = noteDir; ;) {
    if (await isDirectory(join(dir, VAULT_MARKER))) return dir
    const parent = dirname(dir)
    if (parent === dir) return noteDir
    dir = parent
  }
}

/** candidates for a link written without its extension, in the order Obsidian tries them */
function withNoteExtension(target: string): string[] {
  const lower = target.toLowerCase()
  if (lower.endsWith('.md')) return [target]
  return extname(target) ? [target, `${target}.md`] : [`${target}.md`, target]
}

/**
 * A CommonMark link destination against the note's folder. A path without an
 * extension also tries `.md`, as many note apps write `[x](Other Note)`.
 */
export async function resolveLinkPath(
  notePath: string | null,
  linkPath: string,
): Promise<ResolveResult> {
  if (isNetworkPath(linkPath)) return { ok: false, reason: 'blocked' }
  let base: string
  if (isAbsolute(linkPath) || /^[a-zA-Z]:[\\/]/.test(linkPath)) base = ''
  else if (notePath) base = dirname(resolve(notePath))
  else return { ok: false, reason: 'untitled' }
  for (const name of extname(linkPath) ? [linkPath] : [linkPath, `${linkPath}.md`]) {
    const candidate = base ? resolve(base, name) : resolve(name)
    if (isNetworkPath(candidate)) return { ok: false, reason: 'blocked' }
    if (await isFile(candidate)) return { ok: true, path: candidate }
  }
  return { ok: false, reason: 'not-found' }
}

/** files of one vault as `/`-separated paths relative to its root */
export interface VaultIndex {
  root: string
  files: string[]
  /** the listing stopped at {@link MAX_VAULT_FILES} */
  truncated: boolean
}

/** Walk a vault: hidden folders and files are left out, links are not followed. */
export async function listVault(root: string, limit = MAX_VAULT_FILES): Promise<VaultIndex> {
  const files: string[] = []
  let truncated = false
  const walk = async (dir: string, prefix: string, depth: number): Promise<void> => {
    if (truncated || depth > MAX_VAULT_DEPTH) return
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), rel, depth + 1)
      } else if (entry.isFile()) {
        if (files.length >= limit) {
          truncated = true
          return
        }
        files.push(rel)
      }
      if (truncated) return
    }
  }
  await walk(root, '', 0)
  return { root, files, truncated }
}

/** Vault listings, reused for a few seconds; a resolution that misses refreshes it once. */
export class VaultIndexCache {
  private readonly entries = new Map<string, { at: number; index: Promise<VaultIndex> }>()

  constructor(
    private readonly now: () => number = Date.now,
    private readonly list: (root: string) => Promise<VaultIndex> = listVault,
  ) {}

  get(root: string, fresh = false): Promise<VaultIndex> {
    const hit = this.entries.get(root)
    if (hit && !fresh && this.now() - hit.at < VAULT_INDEX_TTL_MS) return hit.index
    const index = this.list(root)
    this.entries.set(root, { at: this.now(), index })
    // a failed walk must not stay cached
    index.catch(() => this.entries.delete(root))
    return index
  }
}

function segmentsOf(relPath: string): string[] {
  return relPath.split('/').filter(Boolean)
}

/** how many leading folders two vault paths share */
function sharedDepth(a: string[], b: string[]): number {
  let i = 0
  while (i < a.length && i < b.length && a[i]!.toLowerCase() === b[i]!.toLowerCase()) i++
  return i
}

/** the vault file a bare name or partial path names; the closest to the note wins a tie */
export function pickVaultFile(
  index: VaultIndex,
  noteRel: string,
  candidates: readonly string[],
): string | null {
  const noteDir = segmentsOf(noteRel).slice(0, -1)
  for (const candidate of candidates) {
    const wanted = candidate.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
    const hits = index.files.filter((file) => {
      const lower = file.toLowerCase()
      return lower === wanted || lower.endsWith(`/${wanted}`)
    })
    if (hits.length === 0) continue
    hits.sort((a, b) => {
      const da = segmentsOf(a).slice(0, -1)
      const db = segmentsOf(b).slice(0, -1)
      const shared = sharedDepth(db, noteDir) - sharedDepth(da, noteDir)
      if (shared !== 0) return shared
      if (da.length !== db.length) return da.length - db.length
      return a < b ? -1 : a > b ? 1 : 0
    })
    return hits[0]!
  }
  return null
}

/** a vault-relative path back to an absolute one, refusing anything that climbs out */
function inVault(root: string, rel: string): string | null {
  const candidate = resolve(root, rel)
  return isInside(root, candidate) ? candidate : null
}

/**
 * A wiki link's file. A link with a folder (`[[sub/Note]]`) is tried from the
 * note's folder and from the vault root first; otherwise, and when that
 * misses, the vault listing is searched by name.
 */
export async function resolveWikiTarget(
  notePath: string | null,
  target: string,
  cache: VaultIndexCache,
): Promise<ResolveResult> {
  if (!notePath) return { ok: false, reason: 'untitled' }
  const clean = target.trim().replace(/\\/g, '/')
  if (!clean) return { ok: false, reason: 'not-found' }
  if (isNetworkPath(clean) || isAbsolute(clean) || /^[a-zA-Z]:/.test(clean)) {
    return { ok: false, reason: 'blocked' }
  }
  const note = resolve(notePath)
  const root = await findVaultRoot(note)
  if (isNetworkPath(root)) return { ok: false, reason: 'blocked' }
  const candidates = withNoteExtension(clean)
  if (clean.includes('/')) {
    for (const base of [dirname(note), root]) {
      for (const name of candidates) {
        const candidate = resolve(base, name)
        if (isInside(root, candidate) && (await isFile(candidate))) {
          return { ok: true, path: candidate }
        }
      }
    }
  }
  const noteRel = relative(root, note).split(sep).join('/')
  for (const fresh of [false, true]) {
    const index = await cache.get(root, fresh)
    const hit = pickVaultFile(index, noteRel, candidates)
    const path = hit ? inVault(root, hit) : null
    if (path && (await isFile(path))) return { ok: true, path }
  }
  return { ok: false, reason: 'not-found' }
}

/** extensions an embedded picture may have — the same list the editor displays */
export function isDisplayImage(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(EXPORT_IMAGE_MIME_BY_EXT, extname(name).toLowerCase())
}

/**
 * The picture an `![[…]]` embed shows, or null. Only a picture file inside
 * the vault (after following links), no larger than
 * {@link MAX_EMBED_IMAGE_BYTES}.
 */
export async function resolveEmbedImage(
  notePath: string | null,
  target: string,
  cache: VaultIndexCache,
): Promise<string | null> {
  if (!notePath || !isDisplayImage(target)) return null
  const found = await resolveWikiTarget(notePath, target, cache)
  if (!found.ok) return null
  try {
    const root = await findVaultRoot(resolve(notePath))
    const [realRoot, realTarget, info] = await Promise.all([
      realpath(root),
      realpath(found.path),
      stat(found.path),
    ])
    if (!info.isFile() || info.size > MAX_EMBED_IMAGE_BYTES) return null
    if (!isInside(realRoot, realTarget) || !isDisplayImage(realTarget)) return null
    return realTarget
  } catch {
    return null
  }
}

/** `[[` completions: notes (`.md`) whose vault path contains the query */
export async function suggestNotes(
  notePath: string | null,
  query: string,
  cache: VaultIndexCache,
): Promise<NoteSuggestion[]> {
  if (!notePath) return []
  const root = await findVaultRoot(resolve(notePath))
  if (isNetworkPath(root)) return []
  const index = await cache.get(root)
  const notes = index.files.filter((file) => file.toLowerCase().endsWith('.md'))
  const nameCount = new Map<string, number>()
  for (const file of notes) {
    const key = basename(file).toLowerCase()
    nameCount.set(key, (nameCount.get(key) ?? 0) + 1)
  }
  const q = query.trim().toLowerCase()
  const ranked: { rank: number; file: string }[] = []
  for (const file of notes) {
    const name = basename(file).slice(0, -3).toLowerCase()
    const rank = !q
      ? 0
      : name.startsWith(q)
        ? 0
        : name.includes(q)
          ? 1
          : file.toLowerCase().includes(q)
            ? 2
            : -1
    if (rank >= 0) ranked.push({ rank, file })
  }
  ranked.sort(
    (a, b) => a.rank - b.rank || a.file.length - b.file.length || (a.file < b.file ? -1 : 1),
  )
  return ranked.slice(0, MAX_SUGGESTIONS).map(({ file }) => {
    const name = basename(file).slice(0, -3)
    const folder = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : ''
    const unique = nameCount.get(basename(file).toLowerCase()) === 1
    return { name, folder, insert: unique ? name : file.slice(0, -3) }
  })
}
