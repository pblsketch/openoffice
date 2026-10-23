/**
 * The pictures an Obsidian drawing note points at (`Embedded Files`).
 *
 * The note does not carry them: `[[cat.png]]` names a file in the user's
 * vault, either by its path from the vault folder or by its bare name. The
 * vault folder is the nearest folder above the note that holds `.obsidian`;
 * a note outside any vault uses its own folder.
 *
 * Only picture files inside that folder are read. A target that climbs out of
 * it (`../`, an absolute path, a link that resolves elsewhere) is not read,
 * and neither is anything that is not a picture or is too large. A picture
 * that is not found is left out; the drawing shows its empty frame and the
 * note keeps the reference.
 */
import { existsSync, statSync } from 'node:fs'
import { readFile, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import type { EmbeddedPicture } from '../shared/ipc'

const PICTURE_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
}

export const MAX_PICTURE_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_BYTES = 200 * 1024 * 1024
/** at most this many references are looked up for one note */
export const MAX_REFS = 500
/** the name search walks at most this many folder entries and this deep */
const MAX_WALK_ENTRIES = 50_000
const MAX_WALK_DEPTH = 16
const MAX_VAULT_CLIMB = 40

/** The vault folder of a note: the nearest folder above it holding `.obsidian`, else the note's own. */
export function vaultRootOf(notePath: string): string {
  let dir = dirname(resolve(notePath))
  for (let i = 0; i < MAX_VAULT_CLIMB; i++) {
    try {
      if (statSync(join(dir, '.obsidian')).isDirectory()) return dir
    } catch {
      // not here; keep climbing
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return dirname(resolve(notePath))
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** Every picture in the vault by lower-case file name, first found wins. Hidden folders are skipped. */
async function pictureNames(root: string): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  let seen = 0
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_WALK_DEPTH || seen > MAX_WALK_ENTRIES) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (++seen > MAX_WALK_ENTRIES) return
      if (entry.name.startsWith('.')) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path, depth + 1)
      else if (entry.isFile() && PICTURE_TYPES[extname(entry.name).toLowerCase()]) {
        const key = entry.name.toLowerCase()
        if (!names.has(key)) names.set(key, path)
      }
    }
  }
  await walk(root, 0)
  return names
}

/** The file a target names, or null. Never a path outside `root`. */
async function locate(
  target: string,
  noteDir: string,
  root: string,
  byName: () => Promise<Map<string, string>>,
): Promise<string | null> {
  let decoded = target
  try {
    decoded = decodeURIComponent(target)
  } catch {
    // keep the target as written
  }
  if (!PICTURE_TYPES[extname(decoded).toLowerCase()] || isAbsolute(decoded)) return null
  const candidates = [resolve(noteDir, decoded), resolve(root, decoded)]
  if (!/[\\/]/.test(decoded)) {
    const found = (await byName()).get(basename(decoded).toLowerCase())
    if (found) candidates.push(found)
  }
  for (const candidate of candidates) {
    if (!inside(root, candidate) || !existsSync(candidate)) continue
    try {
      // a link inside the vault may point anywhere: judge where it really is
      const real = await realpath(candidate)
      const realRoot = await realpath(root)
      if (inside(realRoot, real) && statSync(real).isFile()) return real
    } catch {
      // unreadable: try the next candidate
    }
  }
  return null
}

/** The pictures found for a note's references, as data URLs. */
export async function readEmbeddedPictures(
  notePath: string,
  refs: ReadonlyArray<{ fileId: string; target: string }>,
): Promise<EmbeddedPicture[]> {
  const root = vaultRootOf(notePath)
  const noteDir = dirname(resolve(notePath))
  let index: Promise<Map<string, string>> | null = null
  const byName = (): Promise<Map<string, string>> => (index ??= pictureNames(root))
  const pictures: EmbeddedPicture[] = []
  let total = 0
  for (const ref of refs.slice(0, MAX_REFS)) {
    const path = await locate(ref.target, noteDir, root, byName)
    if (!path) continue
    const size = statSync(path).size
    if (size > MAX_PICTURE_BYTES || total + size > MAX_TOTAL_BYTES) continue
    const bytes = await readFile(path)
    total += bytes.byteLength
    const mimeType = PICTURE_TYPES[extname(path).toLowerCase()]!
    pictures.push({
      fileId: ref.fileId,
      mimeType,
      dataURL: `data:${mimeType};base64,${bytes.toString('base64')}`,
    })
  }
  return pictures
}
