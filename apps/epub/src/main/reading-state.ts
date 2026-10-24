/**
 * Where each book was left and the view settings (spec §4), in one small JSON
 * file in the app data folder (`epub-reading.json`). Nothing here is ever
 * written into a book. Electron-free: the main module supplies the folder.
 *
 * - Positions are kept per file path (one spelling per path), newest first;
 *   the oldest are dropped past `MAX_POSITIONS` so the file stays small.
 * - View settings are shared by every book.
 * - A file that cannot be read or does not parse counts as empty; writes go
 *   one at a time, each replacing the whole file atomically.
 */
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { EPUB_VIEW_PREFS_DEFAULT } from '../shared/ipc'
import type { EpubReadPosition, EpubReadingState, EpubViewPrefs } from '../shared/ipc'
import { pathKey } from './result-paths'

export const READING_STATE_FILE = 'epub-reading.json'
/** remembered books; the least recently read are forgotten first */
export const MAX_POSITIONS = 1000

interface StoredPosition extends EpubReadPosition {
  updatedAt: number
}

interface ReadingFile {
  version: 1
  viewPrefs: EpubViewPrefs
  positions: Record<string, StoredPosition>
}

export interface ReadingStateDeps {
  /** the app data folder */
  dir: () => string
  /** writes the whole file atomically */
  write: (path: string, text: string) => Promise<void>
  now?: () => number
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/** View settings from untrusted input, over `base`; unknown or bad fields keep `base`'s. */
export function viewPrefsOf(
  v: unknown,
  base: EpubViewPrefs = EPUB_VIEW_PREFS_DEFAULT,
): EpubViewPrefs {
  const out: EpubViewPrefs = { ...base }
  if (!isRecord(v)) return out
  if (typeof v.fontScale === 'number' && Number.isFinite(v.fontScale)) {
    out.fontScale = clamp(v.fontScale, 0.5, 3)
  }
  if (v.lineHeight === null) out.lineHeight = null
  else if (typeof v.lineHeight === 'number' && Number.isFinite(v.lineHeight)) {
    out.lineHeight = clamp(v.lineHeight, 1, 3)
  }
  if (typeof v.dark === 'boolean') out.dark = v.dark
  return out
}

/** A reading position from untrusted input; null when it is not one. */
export function readPositionOf(v: unknown): EpubReadPosition | null {
  if (!isRecord(v) || !Number.isSafeInteger(v.spineIndex) || (v.spineIndex as number) < 0) {
    return null
  }
  const blockId = v.blockId
  if (blockId !== null && (typeof blockId !== 'string' || blockId.length > 64)) return null
  return { spineIndex: v.spineIndex as number, blockId }
}

function emptyFile(): ReadingFile {
  return { version: 1, viewPrefs: { ...EPUB_VIEW_PREFS_DEFAULT }, positions: {} }
}

function fileOf(v: unknown): ReadingFile {
  const file = emptyFile()
  if (!isRecord(v)) return file
  file.viewPrefs = viewPrefsOf(v.viewPrefs)
  if (isRecord(v.positions)) {
    for (const [key, value] of Object.entries(v.positions)) {
      const position = readPositionOf(value)
      if (!position || !isRecord(value)) continue
      const updatedAt = Number.isFinite(value.updatedAt) ? (value.updatedAt as number) : 0
      file.positions[key] = { ...position, updatedAt }
    }
  }
  return file
}

export function createReadingState(deps: ReadingStateDeps) {
  const now = deps.now ?? Date.now
  const filePath = (): string => join(deps.dir(), READING_STATE_FILE)
  let loading: Promise<ReadingFile> | null = null
  let queue: Promise<unknown> = Promise.resolve()

  /** the file, read once: concurrent first readers share one object, so no change is lost */
  function load(): Promise<ReadingFile> {
    loading ??= readFile(filePath(), 'utf8')
      .then((text) => fileOf(JSON.parse(text)))
      .catch(() => emptyFile())
    return loading
  }

  /** runs `change` on the file, then writes it; one change at a time */
  function update<T>(change: (file: ReadingFile) => T): Promise<T> {
    const run = queue.then(async () => {
      const file = await load()
      const result = change(file)
      await mkdir(deps.dir(), { recursive: true })
      await deps.write(filePath(), `${JSON.stringify(file, null, 2)}\n`)
      return result
    })
    queue = run.catch(() => undefined)
    return run
  }

  return {
    async get(bookPath: string | null): Promise<EpubReadingState> {
      // answer after the changes already asked for
      await queue
      const file = await load()
      const stored = bookPath ? file.positions[pathKey(bookPath)] : undefined
      return {
        position: stored ? { spineIndex: stored.spineIndex, blockId: stored.blockId } : null,
        viewPrefs: { ...file.viewPrefs },
      }
    },

    setPosition(bookPath: string, position: EpubReadPosition): Promise<void> {
      return update((file) => {
        file.positions[pathKey(bookPath)] = { ...position, updatedAt: now() }
        const keys = Object.keys(file.positions)
        if (keys.length > MAX_POSITIONS) {
          keys
            .sort((a, b) => file.positions[b]!.updatedAt - file.positions[a]!.updatedAt)
            .slice(MAX_POSITIONS)
            .forEach((key) => delete file.positions[key])
        }
      })
    },

    setViewPrefs(patch: unknown): Promise<EpubViewPrefs> {
      return update((file) => {
        file.viewPrefs = viewPrefsOf(patch, file.viewPrefs)
        return { ...file.viewPrefs }
      })
    },

    /** the file was renamed or saved elsewhere: its position follows */
    movePosition(fromPath: string, toPath: string): Promise<void> {
      return update((file) => {
        const from = pathKey(fromPath)
        const stored = file.positions[from]
        if (!stored) return
        delete file.positions[from]
        file.positions[pathKey(toPath)] = stored
      })
    },
  }
}

export type ReadingState = ReturnType<typeof createReadingState>
