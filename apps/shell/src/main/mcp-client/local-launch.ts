/**
 * The exact command a "my PC" MCP server runs as (user MCP spec 4.5, 5.3).
 *
 * `plannedLaunch` is what the confirmation screen shows: the full path of the
 * program, every argument (with what the app adds, such as `--yes` for npx)
 * and the names of the environment variables. The launcher starts the server
 * from the same computation (`prepareLocalLaunch`), so what the person
 * approved and what runs can never differ.
 *
 * Nothing here runs a shell. The program is a resolved absolute path started
 * with an argument array; a Windows `.cmd`/`.bat`, which only a command
 * window can run, is refused instead.
 */
import { extname, posix, win32 } from 'node:path'
import type { McpRuntimeId, McpRuntimeKit, RuntimeMissing } from './runtimes'
import type { McpServerConfig } from './store'

/**
 * The system variables a server gets from the app's environment (5.3), a
 * tunable default. Everything else of the app's environment stays behind:
 * its secrets, the subscription programs' variables, `GENOFFICE_*`. On
 * Windows names match without regard to case; elsewhere the lowercase proxy
 * spellings, which many tools read, are taken too.
 */
export const MCP_LOCAL_SYSTEM_ENV: readonly string[] = [
  'PATH',
  'SystemRoot',
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
]

/**
 * On Windows, Node's process library copies these from the app's environment
 * into every child's whatever the app passes (libuv's "required" variables).
 * They name the machine, user and system folders, and hold no secret. They
 * are listed so the confirmation shows what the server really gets.
 */
export const MCP_LOCAL_WINDOWS_ENV: readonly string[] = [
  'HOMEDRIVE',
  'HOMEPATH',
  'LOGONSERVER',
  'SYSTEMDRIVE',
  'USERDOMAIN',
  'USERNAME',
  'WINDIR',
]

/** Registered names the app never passes on, whatever the person typed */
const NEVER_PASSED = /^GENOFFICE_/i

/** Where a variable of the launch comes from, as the confirmation labels it */
export type PlannedEnvOrigin = 'system' | 'registered' | 'app'

export interface PlannedEnvVar {
  name: string
  origin: PlannedEnvOrigin
}

export interface PlannedLaunchReady {
  ok: true
  /** absolute path of the program, started directly */
  command: string
  /** every argument, in order: the runtime's own script, what the app adds, the server's */
  args: string[]
  /** the arguments the app added (shown as "added by the app") */
  addedArgs: string[]
  /** the variable names the program gets; values are never part of the plan */
  env: PlannedEnvVar[]
  /** registered names the app does not pass on (`GENOFFICE_*`) */
  droppedEnv: string[]
  /** the PC's own runtime or one the app downloaded */
  source: 'pc' | 'app'
  runtime: McpRuntimeId | null
}

/**
 * Why a launch cannot happen:
 * - `empty-command`: nothing to run;
 * - `runtime-missing`: the program or its runtime is not on this PC (5.4);
 * - `needs-command-window`: a Windows `.cmd`/`.bat` other than npx/npm;
 * - `not-a-program`: the resolved file is not something that starts without a shell.
 */
export type LocalLaunchProblem =
  'empty-command' | 'runtime-missing' | 'needs-command-window' | 'not-a-program'

export interface PlannedLaunchBlocked {
  ok: false
  problem: LocalLaunchProblem
  /** what the runtime lookup reported, for `runtime-missing` */
  runtime: RuntimeMissing | null
  /** English, for the "why" view; holds no secret */
  message: string
}

export type PlannedLaunch = PlannedLaunchReady | PlannedLaunchBlocked

export interface PlanOptions {
  /** the app's environment the system variables are read from; this process's when absent */
  baseEnv?: NodeJS.ProcessEnv | undefined
  platform?: NodeJS.Platform | undefined
  /** see `MCP_LOCAL_SYSTEM_ENV` */
  systemEnv?: readonly string[] | undefined
  /** false (the default here): report a needed download instead of asking for it */
  offerDownload?: boolean | undefined
  signal?: AbortSignal | undefined
}

/** A plan together with the variable values the launcher passes; never leaves the main process */
export interface PreparedLaunch {
  plan: PlannedLaunch
  /** exactly the names of `plan.env`, with their values; null when the plan is blocked */
  env: Record<string, string> | null
}

function blocked(
  problem: LocalLaunchProblem,
  message: string,
  runtime: RuntimeMissing | null = null,
): PreparedLaunch {
  return { plan: { ok: false, problem, runtime, message }, env: null }
}

/** The bare command name without a Windows program extension, or null for a path */
function bareCommand(command: string, platform: NodeJS.Platform): string | null {
  const trimmed = command.trim()
  if (!trimmed || /[\\/]/.test(trimmed)) return null
  if (platform !== 'win32') return trimmed
  const lower = trimmed.toLowerCase()
  const ext = extname(lower)
  return ['.exe', '.com', '.cmd', '.bat'].includes(ext) ? lower.slice(0, -ext.length) : lower
}

/**
 * npx asks before installing a package and waits on standard input, which is
 * the MCP channel. Unless npx's own leading options already say yes, `--yes`
 * goes first; a second `--yes` is harmless.
 */
function npxNeedsYes(args: readonly string[]): boolean {
  for (const arg of args) {
    if (arg === '--' || !arg.startsWith('-')) break
    if (arg === '-y' || arg === '--yes' || arg === '--yes=true') return false
  }
  return true
}

/** Windows drops trailing dots and spaces from a file name, so `x.cmd. ` is `x.cmd` */
function windowsExtension(path: string): string {
  return win32.extname(path.replace(/[. ]+$/, '')).toLowerCase()
}

function findName(env: NodeJS.ProcessEnv, name: string, platform: NodeJS.Platform): string | null {
  if (env[name] !== undefined) return name
  if (platform !== 'win32') return null
  const upper = name.toUpperCase()
  return Object.keys(env).find((key) => key.toUpperCase() === upper) ?? null
}

/**
 * Resolve a stored local server into the program, arguments and environment
 * that start it. The confirmation and the launcher both come through here.
 */
export async function prepareLocalLaunch(
  server: Pick<McpServerConfig, 'command' | 'args' | 'env'>,
  kit: Pick<McpRuntimeKit, 'resolveCommand'>,
  options: PlanOptions = {},
): Promise<PreparedLaunch> {
  const platform = options.platform ?? process.platform
  const baseEnv = options.baseEnv ?? process.env
  const command = server.command.trim()
  if (!command) return blocked('empty-command', 'the server has no command')

  const resolved = await kit.resolveCommand(command, {
    offerDownload: options.offerDownload ?? false,
    signal: options.signal,
  })
  if (!resolved.ok) return blocked('runtime-missing', resolved.message, resolved)
  const pathRules = platform === 'win32' ? win32 : posix
  if (!pathRules.isAbsolute(resolved.command)) {
    return blocked('not-a-program', 'the program was not found by its full path')
  }
  if (platform === 'win32') {
    const ext = windowsExtension(resolved.command)
    if (ext === '.cmd' || ext === '.bat') {
      return blocked('needs-command-window', 'this command cannot run without a command window')
    }
    if (ext !== '.exe' && ext !== '.com') {
      return blocked('not-a-program', 'the file is not a program that starts on its own')
    }
  }

  const addedArgs =
    bareCommand(command, platform) === 'npx' && npxNeedsYes(server.args) ? ['--yes'] : []
  const args = [...resolved.prefixArgs, ...addedArgs, ...server.args]

  // later origins replace earlier ones of the same name (without regard to case on Windows)
  const key = (name: string) => (platform === 'win32' ? name.toUpperCase() : name)
  const entries = new Map<string, { name: string; origin: PlannedEnvOrigin; value: string }>()
  const put = (name: string, origin: PlannedEnvOrigin, value: string) => {
    entries.delete(key(name))
    entries.set(key(name), { name, origin, value })
  }
  const system = [
    ...(options.systemEnv ?? MCP_LOCAL_SYSTEM_ENV),
    ...(platform === 'win32' ? MCP_LOCAL_WINDOWS_ENV : []),
  ]
  for (const wanted of system) {
    if (entries.has(key(wanted))) continue
    const found = findName(baseEnv, wanted, platform)
    const value = found === null ? undefined : baseEnv[found]
    if (value !== undefined) put(wanted, 'system', value)
  }
  const droppedEnv: string[] = []
  for (const [name, value] of Object.entries(server.env)) {
    if (NEVER_PASSED.test(name)) droppedEnv.push(name)
    else put(name, 'registered', value)
  }
  for (const [name, value] of Object.entries(resolved.env)) put(name, 'app', value)

  // the runtime's own folder first on the child's PATH, never on the app's or the PC's
  if (resolved.pathPrepend.length > 0) {
    const delimiter = platform === 'win32' ? ';' : ':'
    const current = entries.get(key('PATH'))
    const rest = current?.value ? [current.value] : []
    put(
      current?.name ?? 'PATH',
      current?.origin ?? 'app',
      [...resolved.pathPrepend, ...rest].join(delimiter),
    )
  }

  const env: Record<string, string> = {}
  const planned: PlannedEnvVar[] = []
  for (const entry of entries.values()) {
    env[entry.name] = entry.value
    planned.push({ name: entry.name, origin: entry.origin })
  }
  return {
    plan: {
      ok: true,
      command: resolved.command,
      args,
      addedArgs,
      env: planned,
      droppedEnv,
      source: resolved.source,
      runtime: resolved.runtime,
    },
    env,
  }
}

/**
 * The command a local server will run, for the confirmation screen (4.5): the
 * same computation the launcher uses, with the variable values left out.
 */
export async function plannedLaunch(
  server: Pick<McpServerConfig, 'command' | 'args' | 'env'>,
  kit: Pick<McpRuntimeKit, 'resolveCommand'>,
  options: PlanOptions = {},
): Promise<PlannedLaunch> {
  return (await prepareLocalLaunch(server, kit, options)).plan
}
