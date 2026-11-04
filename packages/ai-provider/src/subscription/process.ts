/**
 * Starting and stopping the subscription CLIs. A CLI is always started from its
 * resolved file with an argument list, never through a shell, and every child
 * is registered so that quitting (or crashing) ends it together with whatever
 * it started itself.
 */
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { rmSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import type { AiSubscriptionProviderId } from '../types'
import { subscriptionChildEnv } from './env'
import type { SubscriptionProgram } from './locate'

/** The part of a child process this module needs; lets tests pass a stand-in */
export interface SubscriptionChildLike {
  readonly pid?: number | undefined
  kill(signal?: NodeJS.Signals | number): boolean
  once(event: string, listener: (...args: any[]) => void): unknown
  unref?(): void
}

export type SubscriptionSpawn = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => SubscriptionChildLike

const KILL_GRACE_MS = 2_000

export interface KillTreeOptions {
  /** POSIX: SIGKILL at once instead of SIGTERM first. Windows always forces. */
  force?: boolean | undefined
  graceMs?: number | undefined
  platform?: NodeJS.Platform | undefined
  env?: NodeJS.ProcessEnv | undefined
  spawn?: SubscriptionSpawn | undefined
  kill?: ((pid: number, signal?: NodeJS.Signals | number) => void) | undefined
}

function validPid(pid: unknown): pid is number {
  return typeof pid === 'number' && Number.isInteger(pid) && pid > 0
}

/**
 * A drive path made of plain file names. Anything else is not taken as the
 * Windows directory: a relative value would be completed from the working
 * directory, and the value also goes onto the install command line.
 */
const WINDOWS_ROOT_PATTERN = /^[A-Za-z]:(?:\\[^\\/:*?"<>|%\r\n]+)+\\?$/

/**
 * The Windows system directory (`%SystemRoot%\System32`). It is also the
 * working directory of the system tools the app starts: the folder the app was
 * started in may be a document's, and a program must not be looked up there.
 */
export function windowsSystemDir(env: NodeJS.ProcessEnv): string {
  const root = [env.SystemRoot, env.SYSTEMROOT, env.windir].find(
    (value) => value !== undefined && WINDOWS_ROOT_PATTERN.test(value),
  )
  return win32.join(root ?? 'C:\\Windows', 'System32')
}

/** Windows system tools are started by full path: PATH is not trusted to find them */
export function windowsSystemTool(env: NodeJS.ProcessEnv, ...segments: string[]): string {
  return win32.join(windowsSystemDir(env), ...segments)
}

/**
 * End a process and everything it started. Windows: `taskkill /T /F` on the
 * process tree. Elsewhere: a signal to the process group, which is the child's
 * own because `spawnSubscriptionProgram` starts it detached; a child that leads
 * no group is signalled alone. Never throws; a process already gone is fine.
 */
export function killProcessTree(
  target: number | { readonly pid?: number | undefined },
  options: KillTreeOptions = {},
): void {
  const pid = typeof target === 'number' ? target : target.pid
  if (!validPid(pid)) return
  const platform = options.platform ?? process.platform
  const kill = options.kill ?? ((id, signal) => void process.kill(id, signal))
  const killSingle = (signal?: NodeJS.Signals): void => {
    try {
      kill(pid, signal)
    } catch {
      /* already gone */
    }
  }
  if (platform === 'win32') {
    // The root must still be alive for taskkill to walk its children, so it is
    // not ended first; it is ended directly only when taskkill cannot run.
    try {
      const spawn = options.spawn ?? nodeSpawn
      const env = options.env ?? process.env
      const tool = windowsSystemTool(env, 'taskkill.exe')
      const killer = spawn(tool, ['/PID', String(pid), '/T', '/F'], {
        // not the folder the app was started in, which may be a document's
        cwd: windowsSystemDir(env),
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.once('error', () => killSingle())
      killer.unref?.()
    } catch {
      killSingle()
    }
    return
  }
  const signalGroup = (signal: NodeJS.Signals): void => {
    try {
      kill(-pid, signal)
    } catch {
      killSingle(signal)
    }
  }
  if (options.force) {
    signalGroup('SIGKILL')
    return
  }
  signalGroup('SIGTERM')
  const timer = setTimeout(() => signalGroup('SIGKILL'), options.graceMs ?? KILL_GRACE_MS)
  timer.unref?.()
}

// ── The registry of children this app started ──

/** Leftover records are `<prefix><pid of the app process>.json` in the directory the app passes */
export const SUBSCRIPTION_LEFTOVER_FILE_PREFIX = 'subscription-children-'

/** When this process started, by its own clock; identifies it as the owner of a record */
export const SUBSCRIPTION_OWNER_STARTED_AT = Math.round(Date.now() - process.uptime() * 1000)

/** The record file of one app process (this one by default) */
export function leftoverRecordFile(dir: string, ownerPid: number = process.pid): string {
  return join(dir, `${SUBSCRIPTION_LEFTOVER_FILE_PREFIX}${ownerPid}.json`)
}

/**
 * The kind of program a record line stands for, kept in the record's
 * `provider` field: a subscription CLI, or a server the person registered and
 * approved for the app to start (user MCP spec 5.3). Both are verified and
 * ended the same way.
 */
export const USER_MCP_CHILD_KIND = 'user-mcp'
export type TrackedChildKind = AiSubscriptionProviderId | typeof USER_MCP_CHILD_KIND

export interface TrackedChildInfo {
  provider: TrackedChildKind
  /** the file that was started, as passed to spawn */
  command: string
  /** when it was started (epoch ms); now when absent */
  startedAt?: number | undefined
}

/** One line of a leftover record. Nothing here identifies the user or the conversation. */
export interface LeftoverChildRecord {
  pid: number
  provider: TrackedChildKind
  command: string
  startedAt: number
}

export interface LeftoverRecord {
  version: 1
  owner: { pid: number; startedAt: number }
  children: LeftoverChildRecord[]
}

export interface SubscriptionChildRegistry {
  /** Register a started child; it is forgotten when it exits. Returns a function that forgets it now. */
  track(child: SubscriptionChildLike, info: TrackedChildInfo): () => void
  /** End every registered child with its process tree. Synchronous: safe in quit and crash handlers. */
  shutdown(): void
  readonly size: number
  /** Keep a record of the registered children in `dir` (null: stop), for the next start to clean up */
  recordIn(dir: string | null): void
  /** Resolves when the record on disk reflects every change so far */
  flushed(): Promise<void>
}

export interface SubscriptionChildRegistryDeps {
  killTree?: ((pid: number) => void) | undefined
}

export function createSubscriptionChildRegistry(
  deps: SubscriptionChildRegistryDeps = {},
): SubscriptionChildRegistry {
  const killTree = deps.killTree ?? ((pid: number) => killProcessTree(pid, { force: true }))
  const children = new Map<number, LeftoverChildRecord>()
  let recordDir: string | null = null
  let writes: Promise<void> = Promise.resolve()

  const persist = (): void => {
    const dir = recordDir
    if (!dir) return
    const record: LeftoverRecord = {
      version: 1,
      owner: { pid: process.pid, startedAt: SUBSCRIPTION_OWNER_STARTED_AT },
      children: [...children.values()],
    }
    const file = leftoverRecordFile(dir)
    writes = writes
      .then(async () => {
        await mkdir(dir, { recursive: true })
        // written whole, then swapped in: a crash mid-write must not leave half a record
        const temp = `${file}.tmp`
        await writeFile(temp, JSON.stringify(record))
        await rename(temp, file)
      })
      .catch(() => undefined)
  }

  return {
    track(child, info) {
      const pid = child.pid
      if (!validPid(pid)) return () => undefined
      const entry: LeftoverChildRecord = {
        pid,
        provider: info.provider,
        command: info.command,
        startedAt: info.startedAt ?? Date.now(),
      }
      children.set(pid, entry)
      persist()
      const forget = (): void => {
        if (children.get(pid) !== entry) return
        children.delete(pid)
        persist()
      }
      child.once('exit', forget)
      return forget
    },
    shutdown() {
      const pids = [...children.keys()]
      children.clear()
      for (const pid of pids) {
        try {
          killTree(pid)
        } catch {
          /* keep ending the others */
        }
      }
      const dir = recordDir
      if (!dir) return
      const file = leftoverRecordFile(dir)
      try {
        rmSync(file, { force: true })
      } catch {
        /* the next start reads it and finds nothing alive */
      }
      // a write that was already under way must not bring the record back
      writes = writes.then(() => rm(file, { force: true })).catch(() => undefined)
    },
    get size() {
      return children.size
    },
    recordIn(dir) {
      recordDir = dir
      if (dir) persist()
    },
    flushed() {
      return writes
    },
  }
}

const defaultRegistry = createSubscriptionChildRegistry()

/**
 * Register a child that was not started through `spawnSubscriptionProgram`, so
 * that `shutdownSubscriptionChildren` ends it too.
 */
export function trackSubscriptionChild(
  child: SubscriptionChildLike,
  info: TrackedChildInfo,
): () => void {
  return defaultRegistry.track(child, info)
}

/**
 * End every subscription CLI this app started, with its descendants. Call it
 * from the app's quit handler and from its crash handlers; it is synchronous
 * and safe to call more than once.
 */
export function shutdownSubscriptionChildren(): void {
  defaultRegistry.shutdown()
}

export function trackedSubscriptionChildCount(): number {
  return defaultRegistry.size
}

/** The registry `spawnSubscriptionProgram` uses unless told otherwise */
export function sharedSubscriptionChildRegistry(): SubscriptionChildRegistry {
  return defaultRegistry
}

// ── Starting a program ──

export interface SubscriptionSpawnOptions {
  cwd?: string | undefined
  /** default: three pipes */
  stdio?: SpawnOptions['stdio'] | undefined
  /** environment to sanitise; the app's own when absent */
  baseEnv?: NodeJS.ProcessEnv | undefined
  /** variables for this run, applied after the sanitising */
  env?: Record<string, string> | undefined
  platform?: NodeJS.Platform | undefined
  /** where the child is registered; the shared registry when absent, null for none */
  registry?: SubscriptionChildRegistry | null | undefined
  spawn?: SubscriptionSpawn | undefined
}

/**
 * Start a located CLI: its resolved file, an argument list, the sanitised
 * environment, no shell. The child is registered for shutdown, and on POSIX
 * leads its own process group so the whole group can be ended.
 */
export function spawnSubscriptionProgram(
  program: SubscriptionProgram,
  args: string[],
  options: SubscriptionSpawnOptions = {},
): ChildProcess {
  const platform = options.platform ?? process.platform
  const spawn = options.spawn ?? nodeSpawn
  const child = spawn(program.command, [...program.prefixArgs, ...args], {
    cwd: options.cwd,
    env: subscriptionChildEnv({
      base: options.baseEnv,
      platform,
      command: program.command,
      extra: { ...program.env, ...options.env },
    }),
    stdio: options.stdio ?? ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    // POSIX: a process group of its own, so the group can be signalled. Windows ends trees by
    // pid, and a detached child there would only lose its console.
    detached: platform !== 'win32',
  })
  const registry = options.registry === undefined ? defaultRegistry : options.registry
  registry?.track(child, { provider: program.provider, command: program.command })
  return child as ChildProcess
}

export interface SubscriptionCommandResult {
  /** null when the program was ended by a signal */
  code: number | null
  stdout: string
  stderr: string
}

export interface SubscriptionRunOptions {
  /** the caller gave up: the program is ended and the run rejects */
  signal: AbortSignal
  timeoutMs: number
  baseEnv?: NodeJS.ProcessEnv | undefined
  cwd?: string | undefined
  spawn?: SubscriptionSpawn | undefined
}

/** Runs one CLI command to its end; `runSubscriptionProgram` is the real one */
export type SubscriptionRunner = (
  program: SubscriptionProgram,
  args: string[],
  options: SubscriptionRunOptions,
) => Promise<SubscriptionCommandResult>

const MAX_COMMAND_OUTPUT_BYTES = 256 * 1024

/**
 * Run a short CLI command (version, login status) and collect its output.
 * Asynchronous: the event loop is never blocked. stdin is closed from the
 * start, because both CLIs wait on an open stdin. The working directory is the
 * temp dir, so no project-level configuration of some other directory applies.
 */
export const runSubscriptionProgram: SubscriptionRunner = (program, args, options) =>
  new Promise((resolve, reject) => {
    if (options.signal.aborted) {
      reject(abortError())
      return
    }
    let child: ChildProcess
    try {
      child = spawnSubscriptionProgram(program, args, {
        cwd: options.cwd ?? tmpdir(),
        stdio: ['ignore', 'pipe', 'pipe'],
        baseEnv: options.baseEnv,
        spawn: options.spawn,
      })
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
      return
    }
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let size = 0
    let settled = false
    const collect = (into: Buffer[]) => (chunk: Buffer) => {
      if (size >= MAX_COMMAND_OUTPUT_BYTES) return
      size += chunk.length
      into.push(chunk)
    }
    const finish = (error: Error | null, code: number | null = null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal.removeEventListener('abort', onAbort)
      if (error) {
        killProcessTree(child, { force: true })
        reject(error)
        return
      }
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      })
    }
    const onAbort = (): void => finish(abortError())
    const timer = setTimeout(
      () => finish(new Error(`The command did not finish within ${options.timeoutMs} ms`)),
      options.timeoutMs,
    )
    timer.unref?.()
    options.signal.addEventListener('abort', onAbort, { once: true })
    child.stdout?.on('data', collect(stdout))
    child.stderr?.on('data', collect(stderr))
    child.once('error', (error) => finish(error))
    child.once('close', (code) => finish(null, code))
  })

function abortError(): Error {
  const error = new Error('The command was cancelled')
  error.name = 'AbortError'
  return error
}
