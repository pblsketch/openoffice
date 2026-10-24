/**
 * Finding the subscription CLI to start, as a file that can be spawned without
 * a shell. On Windows the npm command in `%APPDATA%\npm` is a `.cmd` shim, which
 * Node refuses to spawn directly, so the lookup goes to the program behind it:
 * the native `claude.exe`, or for Codex the native binary its JS launcher would
 * start (the JS launcher on a Node runtime when that binary is not found).
 */
import { constants } from 'node:fs'
import { access, open, readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, delimiter, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'
import { AiRunError } from '../run-error'
import type { AiSubscriptionProviderId } from '../types'

export type SubscriptionProgramSource =
  /** the path the user set */
  | 'configured'
  /** the Codex desktop app's own copy */
  | 'managed'
  /** a directory on PATH */
  | 'path'
  /** an npm (or compatible) global install, found off PATH */
  | 'npm'
  /** the vendor installer's own location */
  | 'native-installer'
  | 'winget'

/** A CLI resolved to something `spawn` can start directly */
export interface SubscriptionProgram {
  provider: AiSubscriptionProviderId
  /** absolute path of the file to start; never a `.cmd` shim */
  command: string
  /** arguments that go before the CLI's own (the JS entry, when `command` is a Node runtime) */
  prefixArgs: string[]
  /** variables the launch needs on top of the sanitised environment */
  env: Record<string, string>
  /** the CLI itself: `command`, or the JS entry it runs */
  entry: string
  source: SubscriptionProgramSource
}

/** A Node runtime for a CLI that ships as a JS entry */
export interface SubscriptionNodeRuntime {
  command: string
  /** the runtime is Electron and needs `ELECTRON_RUN_AS_NODE=1` to act as Node */
  electron?: boolean | undefined
}

export interface SubscriptionLocateOptions {
  /** the user's own path (the Codex `cliPath` setting); wins over the automatic lookup */
  configuredPath?: string | undefined
  env?: NodeJS.ProcessEnv | undefined
  platform?: NodeJS.Platform | undefined
  arch?: string | undefined
  /** runtime for a JS entry; this process (Electron as Node, or Node) when absent */
  nodeRuntime?: SubscriptionNodeRuntime | undefined
  /** override of the Codex desktop bin tree, for tests and portable distributions */
  managedInstallRoot?: string | undefined
  /** macOS application folders checked for the ChatGPT/Codex app's own CLI */
  applicationDirs?: string[] | undefined
  /** extra POSIX bin directories searched after PATH; the usual ones when absent */
  commonDirs?: string[] | undefined
}

export type SubscriptionLocator = (
  provider: AiSubscriptionProviderId,
  options?: SubscriptionLocateOptions,
) => Promise<SubscriptionProgram | null>

interface ProviderLayout {
  /** command name, without extension */
  name: string
  /** package directory under an npm prefix's node_modules */
  npmPackage: string[]
  /** the package's bin file, relative to the package */
  npmEntry: string[]
}

const LAYOUTS: Record<AiSubscriptionProviderId, ProviderLayout> = {
  'claude-code': {
    name: 'claude',
    npmPackage: ['@anthropic-ai', 'claude-code'],
    npmEntry: ['bin', 'claude.exe'],
  },
  codex: { name: 'codex', npmPackage: ['@openai', 'codex'], npmEntry: ['bin', 'codex.js'] },
}

const SHIM_READ_LIMIT = 64 * 1024
const JS_EXTENSIONS = new Set(['.js', '.cjs', '.mjs'])

/** winget's per-user and per-machine link directories: entries here are symlinks */
const WINGET_LINKS = /[\\/]microsoft[\\/]winget[\\/]links[\\/]/i

/**
 * The file behind a winget Links entry. The entries are symlinks into the
 * package that created them, and several packages can put a `codex.exe` there.
 * Resolving the link here lets the update plan tell the OpenAI Codex package
 * from another package's copy; a link that cannot be resolved stays as it is.
 */
async function wingetLinkTarget(file: string): Promise<string> {
  if (!WINGET_LINKS.test(file)) return file
  return realpath(file).catch(() => file)
}

interface Context {
  provider: AiSubscriptionProviderId
  layout: ProviderLayout
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
  arch: string
  nodeRuntime: SubscriptionNodeRuntime | undefined
  applicationDirs: string[] | undefined
  commonDirs: string[] | undefined
}

function cleanCliPath(value: string | undefined): string {
  const trimmed = (value ?? '').trim()
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function homeOf(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  const fromEnv = platform === 'win32' ? (env.USERPROFILE ?? env.HOME) : env.HOME
  return fromEnv || homedir()
}

function expandHome(value: string, home: string): string {
  if (value === '~') return home
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(home, value.slice(2))
  return value
}

async function fileExists(path: string): Promise<boolean> {
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

function isInside(path: string, root: string, platform: NodeJS.Platform): boolean {
  const normalizedPath = resolve(path)
  const normalizedRoot = resolve(root)
  const pathValue = platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath
  const rootValue = platform === 'win32' ? normalizedRoot.toLowerCase() : normalizedRoot
  return pathValue === rootValue || pathValue.startsWith(`${rootValue}${sep}`)
}

/**
 * A directory named in full. A relative one (`.`, `tools`) would be completed
 * from the working directory, which is the document's folder when the app was
 * started by opening a file. `\tools` is absolute to Node, yet Windows
 * completes it from the drive of the working directory.
 */
function isFullDir(dir: string): boolean {
  return isAbsolute(dir) && !(sep === '\\' && /^[\\/](?![\\/])/.test(dir))
}

function pathDirs(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const value = env.PATH ?? env.Path ?? env.path ?? ''
  if (!value) return []
  return value
    .split(platform === 'win32' ? ';' : delimiter)
    .map((dir) => cleanCliPath(dir))
    .filter(isFullDir)
}

function native(
  context: Context,
  command: string,
  source: SubscriptionProgramSource,
  env: Record<string, string> = {},
): SubscriptionProgram {
  return { provider: context.provider, command, prefixArgs: [], env, entry: command, source }
}

// ── Codex: the desktop app's managed copy (ported from codex-app-server.ts) ──

function managedCodexRoot(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string | undefined {
  if (platform !== 'win32') return undefined
  const localAppData = env.LOCALAPPDATA ?? env.LocalAppData
  return localAppData ? join(localAppData, 'OpenAI', 'Codex', 'bin') : undefined
}

async function newestManagedCodex(root: string, platform: NodeJS.Platform): Promise<string | null> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return null
  }
  const executable = platform === 'win32' ? 'codex.exe' : 'codex'
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const path = join(root, entry.name, executable)
        try {
          const [info, directoryInfo] = await Promise.all([
            stat(path),
            stat(join(root, entry.name)),
          ])
          if (!info.isFile()) return null
          const companion =
            platform !== 'win32' ||
            (await fileExists(join(root, entry.name, 'codex-code-mode-host.exe')))
          return { path, modified: Math.max(info.mtimeMs, directoryInfo.mtimeMs), companion }
        } catch {
          return null
        }
      }),
  )
  const found = candidates.filter((candidate) => candidate !== null)
  const complete = found.filter((candidate) => candidate.companion)
  const pool = complete.length > 0 ? complete : found
  pool.sort((a, b) => b.modified - a.modified || b.path.localeCompare(a.path))
  return pool[0]?.path ?? null
}

// ── macOS: the CLI bundled with the ChatGPT/Codex desktop app ──

/**
 * The ChatGPT desktop app keeps its own Codex build, which can be newer than
 * the `codex` on PATH (OpenAI says features may reach one surface before the
 * other). The app's documented compatibility bundle path is
 * `/Applications/Codex.app/Contents/Resources/codex`; a ChatGPT.app copies the
 * same layout. Only an app copy newer than the PATH one is taken, so updating
 * the CLI yourself still wins.
 */
const MAC_CODEX_BUNDLES = ['Codex.app', 'ChatGPT.app'] as const

async function newestMacBundledCodex(context: Context): Promise<string | null> {
  const home = homeOf(context.env, 'darwin')
  const roots = context.applicationDirs ?? ['/Applications', join(home, 'Applications')]
  const found: Array<{ path: string; modified: number }> = []
  for (const root of roots) {
    for (const bundle of MAC_CODEX_BUNDLES) {
      const path = join(root, bundle, 'Contents', 'Resources', 'codex')
      try {
        const info = await stat(path)
        if (!info.isFile()) continue
        await access(path, constants.X_OK)
        found.push({ path, modified: info.mtimeMs })
      } catch {
        // no such app, or no bundled CLI: the next place is asked
      }
    }
  }
  // stable sort: an equal time keeps the earlier bundle (Codex.app before ChatGPT.app)
  found.sort((a, b) => b.modified - a.modified)
  return found[0]?.path ?? null
}

/**
 * Whether `candidate` was written more recently than `current`. Used to pick
 * the newer of the desktop app's Codex and the one on PATH: either can be the
 * stale copy. An unreadable time loses.
 */
async function isNewerFile(candidate: string, current: string | undefined): Promise<boolean> {
  if (!current) return true
  const [candidateTime, currentTime] = await Promise.all([
    stat(candidate).then(
      (info) => info.mtimeMs,
      () => Number.NEGATIVE_INFINITY,
    ),
    stat(current).then(
      (info) => info.mtimeMs,
      () => Number.NEGATIVE_INFINITY,
    ),
  ])
  return candidateTime >= currentTime
}

// ── Codex: the native binary behind the npm package's JS launcher ──

function codexTargetTriple(platform: NodeJS.Platform, arch: string): string | null {
  const cpu = arch === 'x64' ? 'x86_64' : arch === 'arm64' ? 'aarch64' : null
  if (!cpu) return null
  if (platform === 'win32') return `${cpu}-pc-windows-msvc`
  if (platform === 'darwin') return `${cpu}-apple-darwin`
  if (platform === 'linux' || platform === 'android') return `${cpu}-unknown-linux-musl`
  return null
}

/**
 * `@openai/codex/bin/codex.js` only picks the platform package's native binary
 * and starts it with two variables set. Doing the same here leaves no Node
 * process between the app and Codex. Null when the layout is not the known one.
 */
async function codexNativeBehindEntry(
  context: Context,
  entry: string,
  source: SubscriptionProgramSource,
): Promise<SubscriptionProgram | null> {
  const packageRoot = dirname(dirname(entry))
  if (
    basename(entry) !== 'codex.js' ||
    basename(dirname(entry)) !== 'bin' ||
    basename(packageRoot) !== 'codex' ||
    basename(dirname(packageRoot)) !== '@openai'
  ) {
    return null
  }
  const triple = codexTargetTriple(context.platform, context.arch)
  if (!triple) return null
  const os = context.platform === 'android' ? 'linux' : context.platform
  const platformPackage = `codex-${os}-${context.arch}`
  const executable = context.platform === 'win32' ? 'codex.exe' : 'codex'
  const vendorRoots = [
    join(packageRoot, 'node_modules', '@openai', platformPackage, 'vendor'),
    join(dirname(packageRoot), platformPackage, 'vendor'),
    join(packageRoot, 'vendor'),
  ]
  for (const vendorRoot of vendorRoots) {
    const candidate = join(vendorRoot, triple, 'bin', executable)
    if (await fileExists(candidate)) {
      return native(context, candidate, source, {
        CODEX_MANAGED_BY_NPM: '1',
        CODEX_MANAGED_PACKAGE_ROOT: packageRoot,
      })
    }
  }
  return null
}

function defaultNodeRuntime(): SubscriptionNodeRuntime {
  return { command: process.execPath, electron: !!process.versions.electron }
}

async function jsEntryProgram(
  context: Context,
  entry: string,
  source: SubscriptionProgramSource,
  shimDir: string | undefined,
): Promise<SubscriptionProgram> {
  if (context.provider === 'codex') {
    const direct = await codexNativeBehindEntry(context, entry, source)
    if (direct) return direct
  }
  // npm's shim prefers a node.exe sitting next to it
  const adjacent = shimDir
    ? join(shimDir, context.platform === 'win32' ? 'node.exe' : 'node')
    : undefined
  if (adjacent && (await fileExists(adjacent))) {
    return {
      provider: context.provider,
      command: adjacent,
      prefixArgs: [entry],
      env: {},
      entry,
      source,
    }
  }
  const runtime = context.nodeRuntime ?? defaultNodeRuntime()
  return {
    provider: context.provider,
    command: runtime.command,
    prefixArgs: [entry],
    env: runtime.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {},
    entry,
    source,
  }
}

// ── Windows: the program behind a `.cmd` shim ──

/** Targets a cmd-shim names relative to its own directory (`%dp0%\…` or `%~dp0\…`) */
async function shimTargets(shim: string): Promise<string[]> {
  let text: string
  let handle
  try {
    handle = await open(shim, 'r')
    const buffer = Buffer.alloc(SHIM_READ_LIMIT)
    const { bytesRead } = await handle.read(buffer, 0, SHIM_READ_LIMIT, 0)
    text = buffer.subarray(0, bytesRead).toString('utf8')
  } catch {
    return []
  } finally {
    await handle?.close().catch(() => undefined)
  }
  const targets: string[] = []
  for (const match of text.matchAll(/"%(?:~dp0|dp0%)[\\/]?([^"\r\n%]+)"/gi)) {
    const relative = match[1]!.split(/[\\/]+/).filter(Boolean)
    if (relative.length === 0 || relative.includes('..')) continue
    targets.push(join(dirname(shim), ...relative))
  }
  return targets
}

async function programBehindShim(
  context: Context,
  shim: string,
  source: SubscriptionProgramSource,
): Promise<SubscriptionProgram | null> {
  const shimDir = dirname(shim)
  const { layout } = context
  const candidates = [
    ...(await shimTargets(shim)),
    join(shimDir, 'node_modules', ...layout.npmPackage, ...layout.npmEntry),
  ]
  for (const candidate of candidates) {
    const extension = extname(candidate).toLowerCase()
    const name = basename(candidate).toLowerCase()
    // the shim's own Node runtime is not the CLI
    if (name === 'node.exe' || name === 'node') continue
    if (!(await fileExists(candidate))) continue
    if (extension === '.exe') return native(context, await wingetLinkTarget(candidate), source)
    if (JS_EXTENSIONS.has(extension)) return jsEntryProgram(context, candidate, source, shimDir)
  }
  return null
}

/** Turn an existing file into something spawnable, or null when it is not a program we can start */
async function programFromFile(
  context: Context,
  file: string,
  source: SubscriptionProgramSource,
): Promise<SubscriptionProgram | null> {
  const extension = extname(file).toLowerCase()
  if (context.platform === 'win32') {
    if (extension === '.exe') return native(context, await wingetLinkTarget(file), source)
    if (extension === '.cmd' || extension === '.bat') {
      return programBehindShim(context, file, source)
    }
    if (JS_EXTENSIONS.has(extension)) return jsEntryProgram(context, file, source, undefined)
    // npm also writes a `.ps1` and an extension-less sh shim next to the `.cmd` one
    const sibling = join(dirname(file), `${basename(file, extname(file))}.cmd`)
    if ((extension === '.ps1' || extension === '') && (await fileExists(sibling))) {
      return programBehindShim(context, sibling, source)
    }
    return null
  }
  // POSIX: a global npm install links the command to the package's JS entry
  const real = await realpath(file).catch(() => file)
  if (context.provider === 'codex' && JS_EXTENSIONS.has(extname(real).toLowerCase())) {
    const direct = await codexNativeBehindEntry(context, real, source)
    if (direct) return direct
  }
  return native(context, file, source)
}

async function programInDir(
  context: Context,
  dir: string,
  name: string,
  source: SubscriptionProgramSource,
): Promise<SubscriptionProgram | null> {
  if (context.platform === 'win32') {
    for (const extension of ['.exe', '.cmd']) {
      const candidate = join(dir, `${name}${extension}`)
      if (!(await fileExists(candidate))) continue
      const program = await programFromFile(context, candidate, source)
      if (program) return program
    }
    return null
  }
  const candidate = join(dir, name)
  if (!(await fileExists(candidate))) return null
  try {
    await access(candidate, constants.X_OK)
  } catch {
    return null
  }
  return programFromFile(context, candidate, source)
}

/**
 * Finder/Dock-launched Electron inherits a minimal PATH, so the directories
 * npm, Homebrew, version managers and the Claude installer (`~/.local/bin`)
 * install into are probed explicitly.
 */
async function commonUnixBinDirs(home: string): Promise<string[]> {
  const dirs = ['/opt/homebrew/bin', '/usr/local/bin']
  if (home) {
    dirs.push(
      join(home, '.local', 'bin'),
      join(home, '.npm-global', 'bin'),
      join(home, '.volta', 'bin'),
      join(home, '.bun', 'bin'),
      join(home, '.yarn', 'bin'),
    )
    const nvmRoot = join(home, '.nvm', 'versions', 'node')
    const versions = await readdir(nvmRoot).catch(() => [] as string[])
    for (const version of versions.sort().reverse()) dirs.push(join(nvmRoot, version, 'bin'))
  }
  return dirs
}

/**
 * `winget install OpenAI.Codex` unpacks the release archive here when it cannot
 * link it into Links. The archive also holds helper programs whose names begin
 * with `codex-` (`codex-code-mode-host.exe`, the sandbox helpers). Running one
 * of those as the CLI answers an unknown subcommand, which the status check
 * reads as "too old" and then cannot update away. So only the CLI is taken: the
 * alias `codex.exe` winget writes, or the platform's `codex-<triple>.exe`.
 */
async function wingetCodexPackage(localAppData: string, arch: string): Promise<string | null> {
  const packages = join(localAppData, 'Microsoft', 'WinGet', 'Packages')
  const entries = await readdir(packages).catch(() => [] as string[])
  const triple = codexTargetTriple('win32', arch)
  const names = ['codex.exe', ...(triple ? [`codex-${triple}.exe`] : [])]
  for (const entry of entries.filter((name) => /^OpenAI\.Codex_/i.test(name)).sort()) {
    for (const name of names) {
      const candidate = join(packages, entry, name)
      if (await fileExists(candidate)) return candidate
    }
  }
  return null
}

/** Places a CLI can be on Windows without being on the PATH the app inherited */
function windowsFallbackDirs(
  context: Context,
): Array<{ dir: string; source: SubscriptionProgramSource }> {
  const { env, provider } = context
  const home = homeOf(env, 'win32')
  const appData = env.APPDATA ?? (home ? join(home, 'AppData', 'Roaming') : undefined)
  const localAppData = env.LOCALAPPDATA ?? env.LocalAppData
  const dirs: Array<{ dir: string; source: SubscriptionProgramSource }> = []
  // where `irm https://claude.ai/install.ps1 | iex` (`claude install`) puts claude.exe
  if (provider === 'claude-code' && home) {
    dirs.push({ dir: join(home, '.local', 'bin'), source: 'native-installer' })
  }
  if (appData) dirs.push({ dir: join(appData, 'npm'), source: 'npm' })
  if (localAppData) {
    dirs.push({ dir: join(localAppData, 'Microsoft', 'WinGet', 'Links'), source: 'winget' })
  }
  return dirs
}

async function searchByName(
  context: Context,
  name: string,
  pathSource: SubscriptionProgramSource,
  fallbackSource?: SubscriptionProgramSource,
): Promise<SubscriptionProgram | null> {
  const { env, platform } = context
  for (const dir of pathDirs(env, platform)) {
    const program = await programInDir(context, dir, name, pathSource)
    if (program) return program
  }
  if (platform === 'win32') {
    for (const { dir, source } of windowsFallbackDirs(context)) {
      const program = await programInDir(context, dir, name, fallbackSource ?? source)
      if (program) return program
    }
    return null
  }
  const dirs = context.commonDirs ?? (await commonUnixBinDirs(homeOf(env, platform)))
  for (const dir of dirs) {
    const program = await programInDir(context, dir, name, fallbackSource ?? 'path')
    if (program) return program
  }
  return null
}

/**
 * The CLI of `provider` as a directly spawnable program, or null when none is
 * installed. Order: the configured path, the Codex desktop app's copy (its bin
 * tree on Windows; on macOS the newer of its bundle and the PATH copy), PATH,
 * then the install locations PATH may not list yet (`%APPDATA%\npm`, the
 * vendor installers' own directories).
 *
 * A configured path may name the executable, its directory, an npm shim or a
 * bare command. One that points into the Codex desktop tree (its directories
 * carry a release hash) or no longer exists is treated as automatic.
 */
export async function locateSubscriptionProgram(
  provider: AiSubscriptionProviderId,
  options: SubscriptionLocateOptions = {},
): Promise<SubscriptionProgram | null> {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const context: Context = {
    provider,
    layout: LAYOUTS[provider],
    env,
    platform,
    arch: options.arch ?? process.arch,
    nodeRuntime: options.nodeRuntime,
    applicationDirs: options.applicationDirs,
    commonDirs: options.commonDirs,
  }
  const { name } = context.layout
  const managedRoot =
    provider === 'codex'
      ? (options.managedInstallRoot ?? managedCodexRoot(platform, env))
      : undefined

  const configured = expandHome(cleanCliPath(options.configuredPath), homeOf(env, platform))
  if (configured) {
    if (isAbsolute(configured) || /[\\/]/.test(configured)) {
      const absolute = resolve(configured)
      const managed = managedRoot ? isInside(absolute, managedRoot, platform) : false
      if (!managed) {
        const program = (await isDirectory(absolute))
          ? await programInDir(context, absolute, name, 'configured')
          : (await fileExists(absolute))
            ? await programFromFile(context, absolute, 'configured')
            : null
        if (program) return program
      }
    } else {
      const bare = /\.(exe|cmd|bat)$/i.test(configured)
        ? configured.slice(0, -extname(configured).length)
        : configured
      const program = await searchByName(context, bare, 'configured', 'configured')
      if (program) return program
    }
  }

  if (managedRoot) {
    const managed = await newestManagedCodex(managedRoot, platform)
    if (managed) return native(context, managed, 'managed')
  }
  const found = await searchByName(context, name, 'path')
  if (provider === 'codex' && platform === 'darwin') {
    const bundled = await newestMacBundledCodex(context)
    if (bundled && (await isNewerFile(bundled, found?.entry))) {
      return native(context, bundled, 'managed')
    }
  }
  if (found) return found
  if (provider === 'codex' && platform === 'win32') {
    const localAppData = env.LOCALAPPDATA ?? env.LocalAppData
    const packaged = localAppData ? await wingetCodexPackage(localAppData, context.arch) : null
    if (packaged) return native(context, packaged, 'winget')
  }
  return null
}

const PROVIDER_LABELS: Record<AiSubscriptionProviderId, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
}

/** Display name of a subscription provider, for messages */
export function subscriptionProviderLabel(provider: AiSubscriptionProviderId): string {
  return PROVIDER_LABELS[provider]
}

/** `locateSubscriptionProgram`, with a missing program reported as the `not-installed` run error */
export async function resolveSubscriptionProgram(
  provider: AiSubscriptionProviderId,
  options: SubscriptionLocateOptions = {},
): Promise<SubscriptionProgram> {
  const program = await locateSubscriptionProgram(provider, options)
  if (program) return program
  throw new AiRunError('not-installed', `${PROVIDER_LABELS[provider]} CLI was not found`, {
    provider,
  })
}
