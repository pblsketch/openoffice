import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'
import { windowsSystemDir, windowsSystemTool } from '@genoffice/ai-provider/subscription'

/**
 * Which files of a project folder are "not on this PC" (spec 5.8).
 *
 * A cloud-only file (OneDrive Files On-Demand, other cloud-filter providers,
 * offline storage) is downloaded the moment its content is opened, so it must
 * be judged without opening it. On Windows the judgement comes from the
 * attribute word the directory listing already carries; nothing here opens,
 * reads, pins or unpins a file. Elsewhere the attributes are not available and
 * callers fall back to the known sync-folder rule (`isUnderKnownSyncFolder`).
 */

export const FILE_ATTRIBUTE_OFFLINE = 0x1000
export const FILE_ATTRIBUTE_RECALL_ON_OPEN = 0x40000
export const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS = 0x400000
/** Any one of these bits means the content is not on this PC */
export const CLOUD_ONLY_ATTRIBUTES =
  FILE_ATTRIBUTE_OFFLINE | FILE_ATTRIBUTE_RECALL_ON_OPEN | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS

export type CloudFileVerdict = 'cloud-only' | 'local' | 'unknown'

/** Entry name → attribute word, or null when the directory could not be listed */
export type DirectoryAttributes = ReadonlyMap<string, number> | null

/**
 * Lists the given directories (absolute paths) in one go. Resolves to one entry
 * per asked directory; a directory missing from the result counts as unlisted.
 * Rejects when the listing as a whole failed.
 */
export type AttributeReader = (
  dirs: readonly string[],
  options: { timeoutMs: number },
) => Promise<ReadonlyMap<string, DirectoryAttributes>>

/** Starts one program and resolves to its standard output */
export type ListingRun = (
  file: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; input: string },
) => Promise<string>

export interface DetectOptions {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  /** Replaces the PowerShell listing (tests, or a future native reader) */
  reader?: AttributeReader
  timeoutMs?: number
}

export const DEFAULT_LISTING_TIMEOUT_MS = 20_000
/** Room for several hundred thousand entries; a bigger listing fails as a whole */
const MAX_LISTING_BYTES = 64 * 1024 * 1024

export function isCloudOnlyAttributes(attributes: number): boolean {
  if (!Number.isInteger(attributes) || attributes < 0) return false
  return (attributes & CLOUD_ONLY_ATTRIBUTES) !== 0
}

/**
 * The PowerShell program behind the Windows reader. It is a constant: the
 * directories arrive on standard input, one per line, as UTF-8, so no path is
 * ever part of a command line. `DirectoryInfo.GetFileSystemInfos` enumerates
 * the directory (FindFirstFile/FindNextFile) and each entry's attributes come
 * from that enumeration; no file is opened and `Refresh` is never called.
 *
 * Output, UTF-8, one record per line (Windows names cannot hold tabs or line
 * breaks): `D<TAB>i` starts directory i, `F<TAB>attributes<TAB>name` is one of
 * its entries, `E<TAB>i` says directory i could not be listed, and `END` says
 * the whole input was handled.
 */
export const POWERSHELL_LISTING_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$ProgressPreference = 'SilentlyContinue'",
  '$utf8 = New-Object System.Text.UTF8Encoding $false',
  '$reader = New-Object System.IO.StreamReader ([Console]::OpenStandardInput()), $utf8',
  '$writer = New-Object System.IO.StreamWriter ([Console]::OpenStandardOutput()), $utf8',
  '$index = 0',
  'while ($null -ne ($line = $reader.ReadLine())) {',
  '  try {',
  '    if ($line.Length -eq 0) { throw "empty" }',
  '    $entries = ([System.IO.DirectoryInfo]::new($line)).GetFileSystemInfos()',
  '    $writer.WriteLine("D`t$index")',
  '    foreach ($entry in $entries) {',
  '      $writer.WriteLine("F`t" + [int]$entry.Attributes + "`t" + $entry.Name)',
  '    }',
  '  } catch {',
  '    $writer.WriteLine("E`t$index")',
  '  }',
  '  $index++',
  '}',
  "$writer.WriteLine('END')",
  '$writer.Flush()',
].join('\n')

/** Reads the listing program's output; throws when it is incomplete or malformed */
export function parseAttributeListing(
  stdout: string,
  dirs: readonly string[],
): Map<string, DirectoryAttributes> {
  const out = new Map<string, DirectoryAttributes>()
  for (const dir of dirs) out.set(dir, null)
  let current: Map<string, number> | null = null
  let finished = false
  const dirAt = (field: string): string => {
    const index = /^\d+$/.test(field) ? Number(field) : -1
    if (index < 0 || index >= dirs.length) throw new Error(`unexpected directory index ${field}`)
    return dirs[index]
  }
  for (const line of stdout.split(/\r?\n/)) {
    if (line === '') continue
    if (finished) throw new Error('output after END')
    const fields = line.split('\t')
    switch (fields[0]) {
      case 'D':
        current = new Map()
        out.set(dirAt(fields[1] ?? ''), current)
        break
      case 'E':
        current = null
        out.set(dirAt(fields[1] ?? ''), null)
        break
      case 'F': {
        const attributes = /^\d+$/.test(fields[1] ?? '') ? Number(fields[1]) : Number.NaN
        if (current === null || fields.length !== 3 || !Number.isSafeInteger(attributes)) {
          throw new Error('unexpected entry line')
        }
        current.set(fields[2], attributes)
        break
      }
      case 'END':
        finished = true
        break
      default:
        throw new Error('unexpected listing line')
    }
  }
  if (!finished) throw new Error('listing did not finish')
  return out
}

function execFileListing(...[file, args, options]: Parameters<ListingRun>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      [...args],
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs,
        maxBuffer: MAX_LISTING_BYTES,
        windowsHide: true,
        shell: false,
        encoding: 'utf8',
      },
      (error, stdout) => {
        if (error) reject(error)
        else resolve(stdout)
      },
    )
    // A program that dies early closes its input; the exit is reported above.
    child.stdin?.on('error', () => undefined)
    child.stdin?.end(options.input, 'utf8')
  })
}

/**
 * The Windows attribute reader: one Windows PowerShell for the whole batch,
 * started by full path from the system folder, without a shell, hidden, with a
 * timeout. A failure rejects, which detection turns into 'unknown'.
 */
export function createPowerShellAttributeReader(
  deps: { env?: NodeJS.ProcessEnv; run?: ListingRun } = {},
): AttributeReader {
  const env = deps.env ?? process.env
  const run = deps.run ?? execFileListing
  const encoded = Buffer.from(POWERSHELL_LISTING_SCRIPT, 'utf16le').toString('base64')
  return async (dirs, { timeoutMs }) => {
    const stdout = await run(
      windowsSystemTool(env, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { cwd: windowsSystemDir(env), env, timeoutMs, input: `${dirs.join('\n')}\n` },
    )
    return parseAttributeListing(stdout, dirs)
  }
}

/** Drive-absolute (`C:\…`) or UNC (`\\server\share\…`); root-relative and relative paths are not */
function isWindowsAbsolute(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || /^[\\/]{2}[^\\/]+[\\/]+[^\\/]+/.test(path)
}

/** Line breaks cannot be carried by the listing protocol (and are not valid in Windows names) */
function hasLineBreak(path: string): boolean {
  return /[\r\n]/.test(path)
}

function lookupEntry(entries: ReadonlyMap<string, number>, name: string): number | undefined {
  const exact = entries.get(name)
  if (exact !== undefined) return exact
  const folded = name.toLowerCase()
  let found: number | undefined
  let matches = 0
  for (const [entry, attributes] of entries) {
    if (entry.toLowerCase() !== folded) continue
    matches++
    found = attributes
  }
  return matches === 1 ? found : undefined
}

/**
 * Judges each path: 'cloud-only', 'local', or 'unknown' when it could not be
 * told (not Windows, the listing failed or timed out, the file is not in its
 * directory's listing). Every distinct parent directory is listed once, in a
 * single program run for the whole call.
 */
export async function detectCloudOnlyFiles(
  paths: readonly string[],
  options: DetectOptions = {},
): Promise<Map<string, CloudFileVerdict>> {
  const out = new Map<string, CloudFileVerdict>()
  for (const path of paths) out.set(path, 'unknown')
  if ((options.platform ?? process.platform) !== 'win32') return out

  const dirs: string[] = []
  const dirByKey = new Map<string, string>()
  const wanted: { path: string; dir: string; name: string }[] = []
  for (const path of paths) {
    if (!isWindowsAbsolute(path) || hasLineBreak(path)) continue
    const normalized = win32.normalize(path)
    const name = win32.basename(normalized)
    if (name === '') continue
    const parent = win32.dirname(normalized)
    const key = parent.toLowerCase()
    let dir = dirByKey.get(key)
    if (dir === undefined) {
      dir = parent
      dirByKey.set(key, dir)
      dirs.push(dir)
    }
    wanted.push({ path, dir, name })
  }
  if (dirs.length === 0) return out

  const reader = options.reader ?? createPowerShellAttributeReader({ env: options.env })
  let listings: ReadonlyMap<string, DirectoryAttributes>
  try {
    listings = await reader(dirs, { timeoutMs: options.timeoutMs ?? DEFAULT_LISTING_TIMEOUT_MS })
  } catch {
    return out
  }
  for (const { path, dir, name } of wanted) {
    const entries = listings.get(dir)
    if (!entries) continue
    const attributes = lookupEntry(entries, name)
    if (attributes === undefined) continue
    out.set(path, isCloudOnlyAttributes(attributes) ? 'cloud-only' : 'local')
  }
  return out
}

export interface SyncFolderOptions {
  platform?: NodeJS.Platform
  /** The user's home folder; defaults to `USERPROFILE` on Windows, else the OS home */
  homeDir?: string
  /** More sync roots found by other means (e.g. a drive found by its volume label) */
  extraRoots?: readonly string[]
}

const ONEDRIVE_ENV_KEYS = ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial'] as const

/**
 * Top-level folders of the Google Drive for desktop streaming drive (any drive
 * letter), in English and Korean. A path whose first folder under a drive root
 * is one of these is taken as being on that drive.
 */
const GOOGLE_DRIVE_STREAM_TOP = new Set([
  'my drive',
  '내 드라이브',
  'shared drives',
  '공유 드라이브',
  'other computers',
  '다른 컴퓨터',
  '.shortcut-targets-by-id',
])

function pathApi(platform: NodeJS.Platform): typeof win32 {
  return platform === 'win32' ? win32 : posix
}

function isAbsoluteFor(platform: NodeJS.Platform, path: string): boolean {
  return platform === 'win32' ? isWindowsAbsolute(path) : posix.isAbsolute(path)
}

/** Normalized, without trailing separators (except a root), case-folded where the file system is */
function comparable(platform: NodeJS.Platform, path: string): string {
  const api = pathApi(platform)
  let normalized = api.normalize(path)
  const root = api.parse(normalized).root
  while (normalized.length > root.length && /[\\/]$/.test(normalized)) {
    normalized = normalized.slice(0, -1)
  }
  return platform === 'win32' || platform === 'darwin' ? normalized.toLowerCase() : normalized
}

function isInside(platform: NodeJS.Platform, path: string, root: string): boolean {
  const p = comparable(platform, path)
  const r = comparable(platform, root)
  if (p === r) return true
  const sep = pathApi(platform).sep
  return p.startsWith(r.endsWith(sep) ? r : r + sep)
}

function defaultHome(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
  const profile = platform === 'win32' ? env.USERPROFILE : env.HOME
  return profile && isAbsoluteFor(platform, profile) ? profile : homedir()
}

/**
 * Concrete sync roots: the OneDrive folders named by the environment, and on
 * Windows the Google Drive for desktop mirror folder (`<home>\My Drive`) and the
 * older Backup and Sync folder (`<home>\Google Drive`), plus `extraRoots`.
 * Pattern rules (the Google Drive streaming drive, macOS cloud storage) are not
 * listed here; `isUnderKnownSyncFolder` applies them.
 */
export function knownSyncFolders(
  env: NodeJS.ProcessEnv = process.env,
  options: SyncFolderOptions = {},
): string[] {
  const platform = options.platform ?? process.platform
  const candidates: string[] = []
  for (const key of ONEDRIVE_ENV_KEYS) {
    const value = env[key]
    if (value) candidates.push(value)
  }
  if (platform === 'win32') {
    const home = options.homeDir ?? defaultHome(platform, env)
    if (isAbsoluteFor(platform, home)) {
      candidates.push(win32.join(home, 'My Drive'), win32.join(home, 'Google Drive'))
    }
  }
  candidates.push(...(options.extraRoots ?? []))

  const roots: string[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (!isAbsoluteFor(platform, candidate)) continue
    const key = comparable(platform, candidate)
    if (seen.has(key)) continue
    seen.add(key)
    roots.push(candidate)
  }
  return roots
}

/** On the Google Drive for desktop streaming drive (Windows), judged by the path alone */
export function isOnGoogleDriveStream(
  path: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== 'win32' || !/^[A-Za-z]:[\\/]/.test(path)) return false
  const top = win32.normalize(path).slice(3).split('\\')[0]
  return GOOGLE_DRIVE_STREAM_TOP.has(top.toLowerCase())
}

/** macOS: File Provider folders of Google Drive and OneDrive, and the older Google Drive mount */
function isMacCloudStorage(path: string, home: string): boolean {
  const p = comparable('darwin', path)
  if (/^\/volumes\/googledrive(-[^/]+)?(\/|$)/.test(p)) return true
  const storage = `${comparable('darwin', posix.join(home, 'Library', 'CloudStorage'))}/`
  if (!p.startsWith(storage)) return false
  const top = p.slice(storage.length).split('/')[0]
  return top.startsWith('googledrive-') || top.startsWith('onedrive')
}

/**
 * The fallback for PCs where attributes cannot be read: is this path (file or
 * folder) inside a known sync folder? Comparison ignores case on Windows and
 * macOS. Rules: the OneDrive / OneDriveConsumer / OneDriveCommercial folders;
 * Google Drive for desktop's mirror folder and streaming drive on Windows; the
 * Google Drive and OneDrive folders under `~/Library/CloudStorage` and the
 * `/Volumes/GoogleDrive` mount on macOS; `extraRoots`.
 */
export function isUnderKnownSyncFolder(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
  options: SyncFolderOptions = {},
): boolean {
  const platform = options.platform ?? process.platform
  if (!isAbsoluteFor(platform, path)) return false
  if (knownSyncFolders(env, options).some((root) => isInside(platform, path, root))) return true
  if (platform === 'win32') return isOnGoogleDriveStream(path, platform)
  if (platform === 'darwin') {
    return isMacCloudStorage(path, options.homeDir ?? defaultHome(platform, env))
  }
  return false
}

/**
 * The decision callers act on: true means "treat as not on this PC" (index the
 * name only, ask before reading). Attributes decide where they could be read;
 * 'unknown' falls back to the sync-folder rule. A 'local' answer on the Google
 * Drive streaming drive is not trusted: that drive is not a cloud-filter
 * provider and may not mark streamed files, so reading could download them.
 */
export async function resolveCloudOnly(
  paths: readonly string[],
  options: DetectOptions & SyncFolderOptions = {},
): Promise<Map<string, boolean>> {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const verdicts = await detectCloudOnlyFiles(paths, { ...options, platform, env })
  const out = new Map<string, boolean>()
  for (const [path, verdict] of verdicts) {
    if (verdict === 'cloud-only' || isOnGoogleDriveStream(path, platform)) out.set(path, true)
    else if (verdict === 'local') out.set(path, false)
    else out.set(path, isUnderKnownSyncFolder(path, env, { ...options, platform }))
  }
  return out
}
