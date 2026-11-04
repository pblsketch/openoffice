/**
 * Runtimes for the person's own MCP servers (spec 5.3, 5.4): which runtime a
 * command needs, finding that runtime on the PC first, and otherwise
 * downloading the pinned one into `<userData>/mcp-runtimes/` after asking.
 *
 * Nothing here changes the PC's PATH or registry. What a launch needs on top
 * of its environment (the runtime's directory first on the child's PATH, uv's
 * data folders) is returned for the launcher to add to the child alone.
 */
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { access, mkdir, readdir, realpath, rename, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join } from 'node:path'
import { commonUnixBinDirs, isFullDir, pathDirs } from '@genoffice/ai-provider/subscription'
import {
  RuntimeArchiveError,
  downloadVerifiedArchive,
  extractRuntimeArchive,
  type RuntimeFetch,
} from './runtime-archive'
import {
  MCP_RUNTIME_PINS,
  mcpRuntimePlatformKey,
  type McpRuntimePins,
  type McpRuntimePlatformKey,
} from './runtime-pins'

export type { RuntimeFetch } from './runtime-archive'

/** A runtime the app can download; the key under `runtimes` in `mcp-servers.json` */
export type McpRuntimeId = 'node' | 'uv' | 'python'

/** The folder under the app data folder that holds downloaded runtimes */
export const MCP_RUNTIMES_DIR_NAME = 'mcp-runtimes'

export function mcpRuntimesRoot(userDataDir: string): string {
  return join(userDataDir, MCP_RUNTIMES_DIR_NAME)
}

/** Where a downloaded Node or uv of `version` is unpacked */
export function runtimeInstallDir(
  runtimesRoot: string,
  id: 'node' | 'uv',
  version: string,
): string {
  return join(runtimesRoot, `${id}-${version}`)
}

export interface UvDataEnv {
  UV_PYTHON_INSTALL_DIR: string
  UV_CACHE_DIR: string
}

/** Variables a launch adds when it runs the app's own uv (spec 5.3) */
export function uvDataEnv(runtimesRoot: string): UvDataEnv {
  const data = join(runtimesRoot, 'uv-data')
  return { UV_PYTHON_INSTALL_DIR: join(data, 'python'), UV_CACHE_DIR: join(data, 'cache') }
}

const NODE_COMMANDS = new Set(['node', 'npx', 'npm'])
const UV_COMMANDS = new Set(['uv', 'uvx'])
const PYTHON_COMMANDS = new Set(['python', 'python3'])
const WINDOWS_EXTENSIONS = ['.exe', '.com', '.cmd', '.bat']

/** A bare command name as the pairing table sees it, or null for a path */
function bareName(command: string, platform: NodeJS.Platform): string | null {
  const trimmed = command.trim()
  if (!trimmed || /[\\/]/.test(trimmed)) return null
  if (platform !== 'win32') return trimmed
  const lower = trimmed.toLowerCase()
  const extension = extname(lower)
  return WINDOWS_EXTENSIONS.includes(extension) ? lower.slice(0, -extension.length) : lower
}

/**
 * The runtime a command is paired with (spec 5.3): `node`/`npx`/`npm` use
 * Node, `uv`/`uvx` use uv, `python`/`python3` use the PC's Python or else the
 * one uv manages. Any other command, and any path, is only looked up.
 */
export function runtimeForCommand(
  command: string,
  platform: NodeJS.Platform = process.platform,
): McpRuntimeId | null {
  const name = bareName(command, platform)
  if (!name) return null
  if (NODE_COMMANDS.has(name)) return 'node'
  if (UV_COMMANDS.has(name)) return 'uv'
  if (PYTHON_COMMANDS.has(name)) return 'python'
  return null
}

// ── finding a runtime on the PC ──

export interface PcLookupOptions {
  env?: NodeJS.ProcessEnv | undefined
  platform?: NodeJS.Platform | undefined
  /**
   * Directories searched after PATH. When absent: on macOS and Linux the usual
   * bin folders a Finder- or menu-started app does not inherit on PATH; on
   * Windows the per-runtime install folders.
   */
  fallbackDirs?: string[] | undefined
}

interface Lookup {
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  fallbackDirs: string[] | undefined
}

function lookupOf(options: PcLookupOptions = {}): Lookup {
  return {
    env: options.env ?? process.env,
    platform: options.platform ?? process.platform,
    fallbackDirs: options.fallbackDirs,
  }
}

function homeOf(lookup: Lookup): string {
  const value =
    lookup.platform === 'win32' ? (lookup.env.USERPROFILE ?? lookup.env.HOME) : lookup.env.HOME
  return value || homedir()
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function isRunnableFile(path: string, platform: NodeJS.Platform): Promise<boolean> {
  if (!(await isFile(path))) return false
  if (platform === 'win32') return true
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Windows' store stubs: a `python.exe` there may only open the Microsoft Store */
const WINDOWS_APPS_DIR = /[\\/]microsoft[\\/]windowsapps[\\/]?$/i

async function searchDirs(lookup: Lookup, extra: string[]): Promise<string[]> {
  const dirs = [...pathDirs(lookup.env, lookup.platform)]
  const fallback =
    lookup.fallbackDirs ??
    (lookup.platform === 'win32' ? extra : [...(await commonUnixBinDirs(homeOf(lookup))), ...extra])
  for (const dir of fallback) if (isFullDir(dir) && !dirs.includes(dir)) dirs.push(dir)
  return dirs
}

/**
 * The first runnable `name` in PATH (empty and relative entries skipped, so a
 * same-named file in the document's folder is never taken), then the
 * fallback directories. On Windows `extensions` are tried in order unless the
 * name already carries one of them.
 */
export async function findProgramOnPath(
  name: string,
  options: PcLookupOptions & {
    extensions?: string[] | undefined
    /** directories to leave out */
    skipDir?: ((dir: string) => boolean) | undefined
    /** extra fallback directories (after the defaults) */
    extraDirs?: string[] | undefined
  } = {},
): Promise<string | null> {
  const lookup = lookupOf(options)
  if (!name || /[\\/]/.test(name)) return null
  const candidates =
    lookup.platform === 'win32'
      ? (options.extensions ?? ['.exe']).some((ext) => name.toLowerCase().endsWith(ext))
        ? [name]
        : (options.extensions ?? ['.exe']).map((ext) => `${name}${ext}`)
      : [name]
  for (const dir of await searchDirs(lookup, options.extraDirs ?? [])) {
    if (options.skipDir?.(dir)) continue
    for (const candidate of candidates) {
      const path = join(dir, candidate)
      if (await isRunnableFile(path, lookup.platform)) return path
    }
  }
  return null
}

export interface NodeInstall {
  node: string
  /** npm's `npm-cli.js`, or null when this Node has no npm */
  npmCli: string | null
  /** npm's `npx-cli.js`, or null when this Node has no npm */
  npxCli: string | null
}

function windowsNodeDirs(lookup: Lookup): string[] {
  const programFiles = lookup.env.ProgramFiles ?? lookup.env.PROGRAMFILES
  return programFiles ? [join(programFiles, 'nodejs')] : []
}

/** npm's CLI script beside a Node: `<dir>/node_modules/npm` (Windows) or `<prefix>/lib/node_modules/npm` */
async function npmScriptBeside(node: string, script: string): Promise<string | null> {
  const nodes = [node]
  const real = await realpath(node).catch(() => node)
  if (real !== node) nodes.push(real)
  for (const path of nodes) {
    const dir = dirname(path)
    for (const candidate of [
      join(dir, 'node_modules', 'npm', 'bin', script),
      join(dirname(dir), 'lib', 'node_modules', 'npm', 'bin', script),
    ]) {
      if (await isFile(candidate)) return candidate
    }
  }
  return null
}

/** The PC's Node and npm's CLI scripts, or null when no Node is found */
export async function findPcNode(options: PcLookupOptions = {}): Promise<NodeInstall | null> {
  const lookup = lookupOf(options)
  const extraDirs = lookup.platform === 'win32' ? windowsNodeDirs(lookup) : []
  const node = await findProgramOnPath('node', { ...options, extraDirs })
  if (!node) return null
  let npmCli = await npmScriptBeside(node, 'npm-cli.js')
  let npxCli = await npmScriptBeside(node, 'npx-cli.js')
  if (lookup.platform !== 'win32') {
    // a POSIX `npx`/`npm` on PATH is a link to the script itself
    for (const [name, script] of [
      ['npm', 'npm-cli.js'],
      ['npx', 'npx-cli.js'],
    ] as const) {
      if (name === 'npm' ? npmCli : npxCli) continue
      const found = await findProgramOnPath(name, options)
      const real = found ? await realpath(found).catch(() => found) : null
      if (real && basename(real) === script) {
        if (name === 'npm') npmCli = real
        else npxCli = real
      }
    }
  }
  return { node, npmCli, npxCli }
}

export interface UvInstall {
  uv: string
  uvx: string | null
}

function uvInstallerDirs(lookup: Lookup): string[] {
  const home = homeOf(lookup)
  return home ? [join(home, '.local', 'bin'), join(home, '.cargo', 'bin')] : []
}

/** The PC's uv (and its `uvx`), or null when none is found */
export async function findPcUv(options: PcLookupOptions = {}): Promise<UvInstall | null> {
  const lookup = lookupOf(options)
  const uv = await findProgramOnPath('uv', { ...options, extraDirs: uvInstallerDirs(lookup) })
  if (!uv) return null
  const sibling = join(dirname(uv), lookup.platform === 'win32' ? 'uvx.exe' : 'uvx')
  return { uv, uvx: (await isRunnableFile(sibling, lookup.platform)) ? sibling : null }
}

/**
 * macOS ships `/usr/bin/python3` as a stub that asks to install the developer
 * tools; it is a Python only once those tools are there.
 */
async function macStubWithoutTools(path: string): Promise<boolean> {
  if (path !== '/usr/bin/python3' && path !== '/usr/bin/python') return false
  for (const real of [
    '/Library/Developer/CommandLineTools/usr/bin/python3',
    '/Applications/Xcode.app/Contents/Developer/usr/bin/python3',
  ]) {
    if (await isFile(real)) return false
  }
  return true
}

/**
 * The PC's Python for `python`/`python3`, or null. Windows' store stubs and
 * the macOS stub are not taken: they open an installer instead of running.
 */
export async function findPcPython(
  command: 'python' | 'python3' = 'python',
  options: PcLookupOptions = {},
): Promise<string | null> {
  const lookup = lookupOf(options)
  const names =
    lookup.platform === 'win32'
      ? ['python']
      : command === 'python3'
        ? ['python3', 'python']
        : ['python', 'python3']
  for (const name of names) {
    const found = await findProgramOnPath(name, {
      ...options,
      skipDir: (dir) => lookup.platform === 'win32' && WINDOWS_APPS_DIR.test(dir),
    })
    if (!found) continue
    if (lookup.platform === 'darwin' && (await macStubWithoutTools(found))) continue
    return found
  }
  return null
}

// ── resolving a command ──

export interface RuntimeDownloadItem {
  runtime: McpRuntimeId
  version: string
  /** download size in bytes, for the question */
  bytes: number
}

/** What the question before a download shows (spec 5.4) */
export interface RuntimeDownloadQuestion {
  /** the server's command, e.g. `npx` */
  command: string
  /** the runtime the command needs */
  runtime: McpRuntimeId
  /** everything this launch would download, in order (uv before its Python) */
  downloads: RuntimeDownloadItem[]
  totalBytes: number
}

export interface ResolvedLaunch {
  ok: true
  /** absolute path of the program to start, without a shell */
  command: string
  /** arguments before the server's own (npm's CLI script for `npx`/`npm`) */
  prefixArgs: string[]
  /** variables the launch adds (uv's data folders for the app's uv) */
  env: Record<string, string>
  /** directories to put first on the child's PATH (the runtime's own) */
  pathPrepend: string[]
  /** the PC's own program, or one the app downloaded */
  source: 'pc' | 'app'
  runtime: McpRuntimeId | null
}

export type RuntimeMissingDetail =
  /** the program is not on the PC and no runtime is paired with it */
  | 'not-found'
  /** the app pins nothing for this OS and chip */
  | 'unsupported-platform'
  /** the person said no to the download */
  | 'declined'
  /** a download is needed and the caller asked not to offer one */
  | 'download-needed'
  /** the download could not be made */
  | 'offline'
  /** the download was not the pinned file; it was deleted */
  | 'hash-mismatch'
  | 'extract-failed'
  /** uv could not install or find its Python */
  | 'python-install-failed'

/** The server shows as "failed: runtime-missing" with a retry (spec 5.4, 12.2) */
export interface RuntimeMissing {
  ok: false
  reason: 'runtime-missing'
  detail: RuntimeMissingDetail
  runtime: McpRuntimeId | null
  /** what a download would bring, when one is involved */
  downloads: RuntimeDownloadItem[]
  /** English, for the log and the "why" view; never holds secrets */
  message: string
}

export type RuntimeResolution = ResolvedLaunch | RuntimeMissing

export interface UvRunResult {
  code: number
  stdout: string
}

/** Runs uv without a shell; injected in tests */
export type UvRunner = (
  uv: string,
  args: string[],
  options: { env: Record<string, string>; cwd: string; signal?: AbortSignal | undefined },
) => Promise<UvRunResult>

export interface McpRuntimeKitOptions {
  /** `<userData>/mcp-runtimes` (see `mcpRuntimesRoot`) */
  runtimesRoot: string
  /** whether `runtimes[id].allowed` is set in `mcp-servers.json` */
  isRuntimeAllowed: (id: McpRuntimeId) => boolean | Promise<boolean>
  /** set `runtimes[id].allowed`; called after the person says yes */
  recordRuntimeAllowed: (id: McpRuntimeId) => void | Promise<void>
  /** the question, shown by the UI; true only when the person pressed "download" */
  askDownload: (question: RuntimeDownloadQuestion) => Promise<boolean>
  /** Electron's `net.fetch` in the app (system proxy); global `fetch` when absent */
  fetch?: RuntimeFetch | undefined
  env?: NodeJS.ProcessEnv | undefined
  platform?: NodeJS.Platform | undefined
  arch?: string | undefined
  /** see `PcLookupOptions.fallbackDirs` */
  fallbackDirs?: string[] | undefined
  pins?: McpRuntimePins | undefined
  runUv?: UvRunner | undefined
}

export interface ResolveOptions {
  /** false: report `download-needed` instead of asking (e.g. for a preview) */
  offerDownload?: boolean | undefined
  signal?: AbortSignal | undefined
}

export interface McpRuntimeKit {
  /**
   * The program to start for a server's `command`: the PC's runtime first,
   * else the app's downloaded one (asked for unless already allowed, and
   * fetched again without asking when the pinned version changed).
   */
  resolveCommand(command: string, options?: ResolveOptions): Promise<RuntimeResolution>
}

/** Variables passed to uv itself; nothing of the app's or the subscriptions' */
const UV_BASE_ENV = [
  'PATH',
  'Path',
  'SystemRoot',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'LANG',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
]

const UV_INSTALL_TIMEOUT_MS = 15 * 60_000

const defaultUvRunner: UvRunner = (uv, args, { env, cwd, signal }) =>
  new Promise((resolvePromise) => {
    execFile(
      uv,
      args,
      {
        env,
        cwd,
        shell: false,
        windowsHide: true,
        timeout: UV_INSTALL_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        ...(signal ? { signal } : {}),
      },
      (error, stdout) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0
        resolvePromise({ code, stdout: String(stdout ?? '') })
      },
    )
  })

const RETRYABLE_RENAME = new Set(['EPERM', 'EACCES', 'EBUSY'])
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

/** Antivirus scanners briefly hold freshly unpacked programs on Windows */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? ''
      if (!RETRYABLE_RENAME.has(code) || attempt >= 5) throw error
      await sleep(100 * 2 ** attempt)
    }
  }
}

interface ArchiveLayout {
  /** the program, relative to the unpacked folder */
  main: string[]
  /** further files the install must have, relative to the unpacked folder */
  required: string[][]
}

function nodeLayout(platform: NodeJS.Platform): ArchiveLayout & { npm: string[]; npx: string[] } {
  if (platform === 'win32') {
    const scripts = ['node_modules', 'npm', 'bin']
    return {
      main: ['node.exe'],
      npm: [...scripts, 'npm-cli.js'],
      npx: [...scripts, 'npx-cli.js'],
      required: [
        [...scripts, 'npm-cli.js'],
        [...scripts, 'npx-cli.js'],
      ],
    }
  }
  const scripts = ['lib', 'node_modules', 'npm', 'bin']
  return {
    main: ['bin', 'node'],
    npm: [...scripts, 'npm-cli.js'],
    npx: [...scripts, 'npx-cli.js'],
    required: [
      [...scripts, 'npm-cli.js'],
      [...scripts, 'npx-cli.js'],
    ],
  }
}

function uvLayout(platform: NodeJS.Platform): ArchiveLayout & { uvx: string[] } {
  const exe = platform === 'win32' ? '.exe' : ''
  return { main: [`uv${exe}`], uvx: [`uvx${exe}`], required: [[`uvx${exe}`]] }
}

function missing(
  detail: RuntimeMissingDetail,
  runtime: McpRuntimeId | null,
  message: string,
  downloads: RuntimeDownloadItem[] = [],
): RuntimeMissing {
  return { ok: false, reason: 'runtime-missing', detail, runtime, downloads, message }
}

class DownloadFailure extends Error {
  constructor(
    readonly detail: RuntimeMissingDetail,
    message: string,
  ) {
    super(message)
  }
}

export function createMcpRuntimeKit(options: McpRuntimeKitOptions): McpRuntimeKit {
  const root = options.runtimesRoot
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const env = options.env ?? process.env
  const pins = options.pins ?? MCP_RUNTIME_PINS
  const fetchImpl: RuntimeFetch = options.fetch ?? ((url, init) => fetch(url, init))
  const runUv = options.runUv ?? defaultUvRunner
  const platformKey: McpRuntimePlatformKey | null = mcpRuntimePlatformKey(platform, arch)
  const lookup: PcLookupOptions = { env, platform, fallbackDirs: options.fallbackDirs }
  const uvEnv = uvDataEnv(root)
  /** one question and one download at a time, so two servers never fetch the same file */
  let queue: Promise<unknown> = Promise.resolve()

  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  function installDir(id: 'node' | 'uv'): string {
    return runtimeInstallDir(root, id, pins[id].version)
  }

  function layoutOf(id: 'node' | 'uv'): ArchiveLayout {
    return id === 'node' ? nodeLayout(platform) : uvLayout(platform)
  }

  async function installed(id: 'node' | 'uv'): Promise<boolean> {
    const dir = installDir(id)
    const layout = layoutOf(id)
    for (const parts of [layout.main, ...layout.required]) {
      if (!(await isFile(join(dir, ...parts)))) return false
    }
    return true
  }

  function downloadItem(id: McpRuntimeId): RuntimeDownloadItem {
    if (!platformKey) return { runtime: id, version: '', bytes: 0 }
    if (id === 'python') {
      return { runtime: id, version: pins.python.version, bytes: pins.python.bytes[platformKey] }
    }
    return { runtime: id, version: pins[id].version, bytes: pins[id].archives[platformKey].bytes }
  }

  /** Older pinned versions and leftovers of interrupted downloads of `id` */
  async function prune(id: 'node' | 'uv', keepCurrent: boolean): Promise<void> {
    const current = basename(installDir(id))
    const entries = await readdir(root).catch(() => [] as string[])
    const version = new RegExp(`^${id}-\\d`)
    const leftover = new RegExp(`^\\.(download|staging)-${id}-`)
    for (const entry of entries) {
      const old = version.test(entry) && !(keepCurrent && entry === current)
      if (old || leftover.test(entry)) {
        await rm(join(root, entry), { recursive: true, force: true }).catch(() => undefined)
      }
    }
  }

  async function installArchive(id: 'node' | 'uv', signal?: AbortSignal): Promise<void> {
    if (!platformKey) throw new DownloadFailure('unsupported-platform', `no pinned ${id} here`)
    const archive = pins[id].archives[platformKey]
    await mkdir(root, { recursive: true })
    await prune(id, false)
    const tag = `${id}-${pins[id].version}-${randomBytes(4).toString('hex')}`
    const download = join(root, `.download-${tag}`)
    const staging = join(root, `.staging-${tag}`)
    try {
      await downloadVerifiedArchive(archive, download, fetchImpl, signal)
      await extractRuntimeArchive(download, archive.format, archive.root, staging)
      const layout = layoutOf(id)
      for (const parts of [layout.main, ...layout.required]) {
        if (!(await isFile(join(staging, ...parts)))) {
          throw new DownloadFailure('extract-failed', `${id} archive lacks ${parts.join('/')}`)
        }
      }
      await renameWithRetry(staging, installDir(id))
    } catch (error) {
      if (error instanceof DownloadFailure) throw error
      if (error instanceof RuntimeArchiveError) throw new DownloadFailure(error.kind, error.message)
      throw new DownloadFailure(
        'extract-failed',
        error instanceof Error ? error.message : String(error),
      )
    } finally {
      await rm(download, { force: true }).catch(() => undefined)
      await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    }
    await prune(id, true)
  }

  function uvRunEnv(appUv: boolean): Record<string, string> {
    const base: Record<string, string> = {}
    for (const name of UV_BASE_ENV) {
      const value = env[name]
      if (value !== undefined) base[name] = value
    }
    return appUv ? { ...base, ...uvEnv } : base
  }

  /** The pinned Python, as uv reports it, or null */
  async function findUvPython(
    uv: string,
    appUv: boolean,
    signal?: AbortSignal,
  ): Promise<string | null> {
    if (appUv && !(await appPythonPresent())) return null
    await mkdir(root, { recursive: true })
    const result = await runUv(uv, ['python', 'find', pins.python.version], {
      env: uvRunEnv(appUv),
      cwd: root,
      signal,
    })
    const path = result.stdout.split(/\r?\n/)[0]?.trim() ?? ''
    return result.code === 0 && isAbsolute(path) && (await isFile(path)) ? path : null
  }

  /** Any `cpython-<pinned>-…` folder in the app's uv Python folder */
  async function appPythonPresent(): Promise<boolean> {
    const entries = await readdir(uvEnv.UV_PYTHON_INSTALL_DIR).catch(() => [] as string[])
    return entries.some((entry) => entry.startsWith(`cpython-${pins.python.version}-`))
  }

  async function installUvPython(uv: string, appUv: boolean, signal?: AbortSignal): Promise<void> {
    await mkdir(root, { recursive: true })
    const result = await runUv(uv, ['python', 'install', pins.python.version], {
      env: uvRunEnv(appUv),
      cwd: root,
      signal,
    })
    if (result.code !== 0) {
      throw new DownloadFailure(
        'python-install-failed',
        `uv could not install Python ${pins.python.version} (exit ${result.code})`,
      )
    }
  }

  interface Plan {
    needs: Array<'node' | 'uv' | 'python'>
  }

  /**
   * Ask (unless every download is allowed already), record the permission,
   * then download in order. Null when everything is in place.
   */
  async function obtain(
    command: string,
    runtime: McpRuntimeId,
    plan: Plan,
    resolve: ResolveOptions,
    pythonInstall: (() => Promise<void>) | null,
  ): Promise<RuntimeMissing | null> {
    if (plan.needs.length === 0) return null
    const downloads = plan.needs.map(downloadItem)
    if (!platformKey) {
      return missing(
        'unsupported-platform',
        runtime,
        `no pinned ${runtime} for ${platform}-${arch}`,
        downloads,
      )
    }
    if (resolve.offerDownload === false) {
      return missing('download-needed', runtime, `${runtime} must be downloaded first`, downloads)
    }
    const allowed = await Promise.all(
      plan.needs.map(async (id) => !!(await options.isRuntimeAllowed(id))),
    )
    if (allowed.includes(false)) {
      const question: RuntimeDownloadQuestion = {
        command,
        runtime,
        downloads,
        totalBytes: downloads.reduce((sum, item) => sum + item.bytes, 0),
      }
      const yes = await options.askDownload(question).catch(() => false)
      if (!yes)
        return missing('declined', runtime, `downloading ${runtime} was declined`, downloads)
      for (const [index, id] of plan.needs.entries()) {
        if (!allowed[index]) await options.recordRuntimeAllowed(id)
      }
    }
    try {
      for (const id of plan.needs) {
        if (id === 'python') await pythonInstall?.()
        else await installArchive(id, resolve.signal)
      }
    } catch (error) {
      const detail = error instanceof DownloadFailure ? error.detail : 'offline'
      return missing(
        detail,
        runtime,
        error instanceof Error ? error.message : String(error),
        downloads,
      )
    }
    return null
  }

  async function resolveNode(
    command: string,
    name: 'node' | 'npx' | 'npm',
    resolve: ResolveOptions,
  ): Promise<RuntimeResolution> {
    const pc = await findPcNode(lookup)
    const pcScript = name === 'npx' ? pc?.npxCli : name === 'npm' ? pc?.npmCli : undefined
    if (pc && (name === 'node' || pcScript)) {
      return {
        ok: true,
        command: pc.node,
        prefixArgs: pcScript ? [pcScript] : [],
        env: {},
        pathPrepend: [dirname(pc.node)],
        source: 'pc',
        runtime: 'node',
      }
    }
    const failed = await serial(async () => {
      if (await installed('node')) {
        await prune('node', true)
        return null
      }
      return obtain(command, 'node', { needs: ['node'] }, resolve, null)
    })
    if (failed) return failed
    const dir = installDir('node')
    const layout = nodeLayout(platform)
    const node = join(dir, ...layout.main)
    const script = name === 'npx' ? layout.npx : name === 'npm' ? layout.npm : null
    return {
      ok: true,
      command: node,
      prefixArgs: script ? [join(dir, ...script)] : [],
      env: {},
      pathPrepend: [dirname(node)],
      source: 'app',
      runtime: 'node',
    }
  }

  /**
   * uv itself (PC first, else the app's) and whether its pinned Python must
   * be installed: only when the PC has no Python and uv has none either.
   */
  async function resolveUvSide(
    command: string,
    runtime: 'uv' | 'python',
    wantUvx: boolean,
    pythonCommand: 'python' | 'python3',
    resolve: ResolveOptions,
  ): Promise<
    RuntimeMissing | { uv: string; uvx: string | null; appUv: boolean; python: string | null }
  > {
    const pcUv = await findPcUv(lookup)
    const usePcUv = !!pcUv && (!wantUvx || !!pcUv.uvx)
    const pcPython = await findPcPython(pythonCommand, lookup)
    return serial(async () => {
      const needs: Plan['needs'] = []
      const appUv = !usePcUv
      if (appUv && !(await installed('uv'))) needs.push('uv')
      else if (appUv) await prune('uv', true)
      const uvLayoutNow = uvLayout(platform)
      const uv = appUv ? join(installDir('uv'), ...uvLayoutNow.main) : pcUv!.uv
      const uvx = appUv ? join(installDir('uv'), ...uvLayoutNow.uvx) : pcUv!.uvx
      let python: string | null = null
      if (!pcPython) {
        if (needs.includes('uv')) {
          // a new uv version finds the Python an older one installed in the same folder
          if (!(await appPythonPresent())) needs.push('python')
        } else {
          python = await findUvPython(uv, appUv, resolve.signal)
          if (!python) needs.push('python')
        }
      }
      const failed = await obtain(command, runtime, { needs }, resolve, () =>
        installUvPython(uv, appUv, resolve.signal),
      )
      if (failed) return failed
      if (!pcPython && !python) {
        python = await findUvPython(uv, appUv, resolve.signal)
        if (!python) {
          return missing(
            'python-install-failed',
            runtime,
            `uv did not report Python ${pins.python.version} after installing it`,
          )
        }
      }
      return { uv, uvx, appUv, python: pcPython ?? python }
    })
  }

  async function resolveUv(
    command: string,
    name: 'uv' | 'uvx',
    resolve: ResolveOptions,
  ): Promise<RuntimeResolution> {
    const side = await resolveUvSide(command, 'uv', name === 'uvx', 'python3', resolve)
    if ('ok' in side) return side
    const program = name === 'uvx' ? side.uvx : side.uv
    if (!program) return missing('not-found', 'uv', 'uvx was not found beside uv')
    return {
      ok: true,
      command: program,
      prefixArgs: [],
      env: side.appUv ? { ...uvEnv } : {},
      pathPrepend: [dirname(program)],
      source: side.appUv ? 'app' : 'pc',
      runtime: 'uv',
    }
  }

  async function resolvePython(
    command: string,
    name: 'python' | 'python3',
    resolve: ResolveOptions,
  ): Promise<RuntimeResolution> {
    const pc = await findPcPython(name, lookup)
    if (pc) {
      return {
        ok: true,
        command: pc,
        prefixArgs: [],
        env: {},
        pathPrepend: [dirname(pc)],
        source: 'pc',
        runtime: 'python',
      }
    }
    const side = await resolveUvSide(command, 'python', false, name, resolve)
    if ('ok' in side) return side
    return {
      ok: true,
      command: side.python!,
      prefixArgs: [],
      env: {},
      pathPrepend: [dirname(side.python!)],
      source: 'app',
      runtime: 'python',
    }
  }

  async function resolveOther(command: string): Promise<RuntimeResolution> {
    const trimmed = command.trim()
    if (/[\\/]/.test(trimmed)) {
      // a path: only a full one, never completed from a working folder
      if (isAbsolute(trimmed) && isFullDir(dirname(trimmed)) && (await isFile(trimmed))) {
        return {
          ok: true,
          command: trimmed,
          prefixArgs: [],
          env: {},
          pathPrepend: [],
          source: 'pc',
          runtime: null,
        }
      }
      return missing('not-found', null, 'the program was not found')
    }
    const found = await findProgramOnPath(trimmed, { ...lookup, extensions: WINDOWS_EXTENSIONS })
    if (!found) return missing('not-found', null, 'the program was not found on PATH')
    return {
      ok: true,
      command: found,
      prefixArgs: [],
      env: {},
      pathPrepend: [],
      source: 'pc',
      runtime: null,
    }
  }

  return {
    async resolveCommand(command, resolve = {}) {
      const runtime = runtimeForCommand(command, platform)
      const name = bareName(command, platform)
      if (!runtime || !name) return resolveOther(command)
      if (runtime === 'node') return resolveNode(command, name as 'node' | 'npx' | 'npm', resolve)
      if (runtime === 'uv') return resolveUv(command, name as 'uv' | 'uvx', resolve)
      return resolvePython(command, name as 'python' | 'python3', resolve)
    },
  }
}
