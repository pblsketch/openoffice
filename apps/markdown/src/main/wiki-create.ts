/**
 * Creating the note an unresolved `[[target]]` names — the write half of the
 * wiki family. Resolution (`wiki-resolve.ts`) answers for a name that is
 * already on disk; this closes the loop for one that is not, so a link
 * written a minute ago resolves the next time anyone reads it.
 *
 * Placement follows the resolver's own lookup order: a target carrying a
 * directory is vault-rooted (`[[folder/Note]]` -> `<root>/folder/Note.md`,
 * the way `resolveWikiLinks` reads it), a bare name lands beside the open
 * document — the first place the resolver looks. The file that comes into
 * being is empty: it is a destination, not a document.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join } from 'node:path'

import { splitTarget } from './wiki-resolve'

/** characters no file name can carry; Windows names the set, the rest inherit it */
const ILLEGAL_NAME_CHARS = /[/\\:*?"<>|]/g

/**
 * Windows device names. `CON`, `NUL.md` or `com1.txt` open the device instead
 * of a file (the part before the first dot decides), so a segment spelling one
 * is refused rather than written.
 */
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/**
 * The note types a created file may have: the ones resolution and the vault
 * index read as notes. A link naming any other extension (`[[tool.exe]]`,
 * `[[Figure 1.png]]`) creates nothing; an empty file of that type is no note.
 */
const NOTE_EXTS = new Set(['.md', '.markdown', '.txt'])

function isReservedSegment(segment: string): boolean {
  return RESERVED_NAME.test(segment.split('.')[0]!.trim())
}

/**
 * One directory segment of a created note's path, safe to join on every
 * supported filesystem. The same replacement the AI auto-naming save path
 * uses, plus a trimmed tail: Windows refuses names that end in a dot or a
 * space, and `Note.` + `.md` would spell a double dot.
 */
function sanitizeSegment(segment: string): string {
  const cleaned = segment.replace(ILLEGAL_NAME_CHARS, '_').replace(/[. ]+$/, '')
  return cleaned === '' ? '_' : cleaned
}

export interface CreateNoteOptions {
  /** the vault root a directory-carrying target lands under */
  root: string
  /** directory of the open document; a bare name is created here, '' for an untitled one */
  fromDir: string
}

export interface CreatedNote {
  /** absolute path of the note, created or already there */
  path: string
  /**
   * the spelling a link to it resolves by: the sanitized stem, with its
   * directories kept (`folder/Note`) so a bare name cannot land on a
   * same-named note found earlier in the lookup order
   */
  target: string
  /** the `#Heading` part of the target, for the caller to open on */
  fragment: string
  /** false when a file already occupied the path and nothing was written */
  created: boolean
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/**
 * Create (or find) the note `target` names; null when the target cannot name
 * a note at all — empty (`[[#Heading]]` addresses this document), climbing
 * out with `..`, absolute, spelling a Windows device name, or naming a file
 * type that is not a note. A file already
 * at the path is returned as is, never touched.
 */
export async function createWikiNote(
  target: string,
  options: CreateNoteOptions,
): Promise<CreatedNote | null> {
  const { name, fragment } = splitTarget(target)
  if (!name) return null
  // the gate the resolver applies before a name reaches the filesystem:
  // nothing created here may reach outside the vault
  if (isAbsolute(name) || name.split(/[\\/]/).includes('..')) return null
  const segments = name
    .split(/[\\/]/)
    .filter((segment) => segment !== '' && segment !== '.')
    .map(sanitizeSegment)
  if (segments.some(isReservedSegment)) return null
  const base = segments[segments.length - 1]!
  // resolution's own candidate rule, mirrored exactly: an extension is the
  // file as written, a bare stem stands for `<stem>.md`
  const ext = extname(base).toLowerCase()
  if (ext && !NOTE_EXTS.has(ext)) return null
  const fileName = ext ? base : `${base}.md`
  const dir =
    segments.length > 1
      ? options.root
        ? join(options.root, ...segments.slice(0, -1))
        : null
      : options.fromDir || options.root
  if (!dir) return null
  const path = join(dir, fileName)
  const linkTarget = [...segments.slice(0, -1), base].join('/')
  // already there: opening it is the whole job, a second write would clobber it
  if (await fileExists(path)) return { path, target: linkTarget, fragment, created: false }
  await mkdir(dirname(path), { recursive: true })
  // exclusive create: a file that appeared since the check above is kept, not
  // emptied. The note starts empty, so there is no partial write to guard.
  try {
    await writeFile(path, '', { flag: 'wx' })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST' && (await fileExists(path))) {
      return { path, target: linkTarget, fragment, created: false }
    }
    throw err
  }
  return { path, target: linkTarget, fragment, created: true }
}
