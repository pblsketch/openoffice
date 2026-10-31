/**
 * Temporary working folders the two subscription bridges create (Codex's
 * app-server thread folder, Claude's per-turn folder). A normal end removes
 * them; a force-killed app cannot, and the Codex folder may still hold copies
 * of attached images.
 *
 * A folder is recorded next to the app's data when it is made, so the next
 * start can tell "a folder this app made" from any other folder in the
 * system's temporary directory. Only a recorded folder, directly under that
 * directory and carrying the app's prefix, is removed. A record whose owner
 * process is still running is left alone (a second window process).
 */
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

/** Every temporary folder name this module is allowed to remove */
export const TRACKED_TEMP_PREFIXES = [
  'genoffice-codex-app-server-',
  'genoffice-claude-code-',
] as const

const RECORD_PREFIX = 'ai-temp-dir-'
const RECORD_VERSION = 1
/** A record and a run of this process are the same run within this slack */
const OWNER_START_SLACK_MS = 10_000

let recordDir: string | undefined

/** Where records go; the app's userData. Called by `initSubscriptionChildTracking`. */
export function setSubscriptionTempRecordDir(dir: string | undefined): void {
  recordDir = dir
}

interface TempDirRecord {
  version: number
  /** absolute path of the folder this app made */
  path: string
  ownerPid: number
  /** when the owner process started, so a reused pid is not mistaken for the owner */
  ownerStartedAt: number
}

function ownerStartedAt(): number {
  return Date.now() - process.uptime() * 1000
}

function recordName(path: string): string {
  return `${RECORD_PREFIX}${createHash('sha1').update(path).digest('hex').slice(0, 16)}.json`
}

function comparable(path: string): string {
  const full = resolve(path)
  return process.platform === 'win32' ? full.toLowerCase() : full
}

function isTrackedPath(path: string, tempRoot: string): boolean {
  const full = resolve(path)
  if (comparable(dirname(full)) !== comparable(tempRoot)) return false
  return TRACKED_TEMP_PREFIXES.some((prefix) => basename(full).startsWith(prefix))
}

function validRecord(text: string): TempDirRecord | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<TempDirRecord>
  if (typeof raw.path !== 'string' || !raw.path) return null
  if (typeof raw.ownerPid !== 'number' || !Number.isInteger(raw.ownerPid)) return null
  if (typeof raw.ownerStartedAt !== 'number' || !Number.isFinite(raw.ownerStartedAt)) return null
  return {
    version: typeof raw.version === 'number' ? raw.version : RECORD_VERSION,
    path: raw.path,
    ownerPid: raw.ownerPid,
    ownerStartedAt: raw.ownerStartedAt,
  }
}

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // a process owned by another user answers "not permitted", which still means alive
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export interface TempDirOptions {
  /** the system temporary directory; the real one when absent */
  tempRoot?: string | undefined
  /** where records are written; the module's record directory when absent */
  recordDir?: string | undefined
  /** the owner recorded for the folder; this process when absent */
  ownerPid?: number | undefined
}

/**
 * Make a temporary folder and record that this app made it. Without a record
 * directory (standalone editors that never call the tracking init) the folder
 * is made as before; it just cannot be cleaned after a forced exit.
 */
export async function createTrackedTempDir(
  prefix: (typeof TRACKED_TEMP_PREFIXES)[number],
  options: TempDirOptions = {},
): Promise<string> {
  const path = await mkdtemp(join(options.tempRoot ?? tmpdir(), prefix))
  const dir = options.recordDir ?? recordDir
  if (!dir) return path
  try {
    await mkdir(dir, { recursive: true })
    const record: TempDirRecord = {
      version: RECORD_VERSION,
      path,
      ownerPid: options.ownerPid ?? process.pid,
      ownerStartedAt: ownerStartedAt(),
    }
    await writeFile(join(dir, recordName(path)), JSON.stringify(record))
  } catch {
    // the folder is still usable; without a record it is left for the system's cleanup
  }
  return path
}

/** Remove a folder made by `createTrackedTempDir`, and its record */
export async function removeTrackedTempDir(
  path: string,
  options: TempDirOptions = {},
): Promise<void> {
  const removed = await rm(path, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  }).then(
    () => true,
    () => false,
  )
  // a locked folder keeps its record, so the next start tries again
  if (!removed) return
  const dir = options.recordDir ?? recordDir
  if (dir) await rm(join(dir, recordName(path)), { force: true }).catch(() => undefined)
}

export interface CleanupTempDirsOptions extends TempDirOptions {
  /** test seam: whether a pid is alive */
  alive?: ((pid: number) => boolean) | undefined
}

/**
 * Remove folders a previous, force-killed run recorded. Returns how many
 * folders were removed. A folder whose owner still runs is kept, record and
 * all, so a second live process is never disturbed.
 */
export async function cleanupTrackedTempDirs(
  dir: string,
  options: CleanupTempDirsOptions = {},
): Promise<number> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter(
    (name) => name.startsWith(RECORD_PREFIX) && name.endsWith('.json'),
  )
  if (names.length === 0) return 0
  const tempRoot = options.tempRoot ?? tmpdir()
  const alive = options.alive ?? processAlive
  const now = ownerStartedAt()
  let removed = 0
  for (const name of names) {
    const file = join(dir, name)
    const record = validRecord(await readFile(file, 'utf8').catch(() => ''))
    if (!record) {
      await rm(file, { force: true }).catch(() => undefined)
      continue
    }
    if (!isTrackedPath(record.path, tempRoot)) {
      // not something this module made: drop the record, leave the folder alone
      await rm(file, { force: true }).catch(() => undefined)
      continue
    }
    if (
      record.ownerPid === process.pid &&
      Math.abs(record.ownerStartedAt - now) <= OWNER_START_SLACK_MS
    ) {
      continue
    }
    if (record.ownerPid !== process.pid && alive(record.ownerPid)) continue
    try {
      const info = await lstat(record.path)
      // a link is removed as a link; recursive removal never follows it
      await rm(record.path, {
        recursive: info.isDirectory(),
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      })
      removed++
      await rm(file, { force: true })
    } catch {
      // gone already, or locked: keep the record and try again next start
      if (!(await lstat(record.path).catch(() => null))) {
        await rm(file, { force: true }).catch(() => undefined)
      }
    }
  }
  return removed
}
