/**
 * Cleaning up after an app that was force-killed. No handler runs in that case,
 * so the registry keeps a record of what it started (`process.ts`), and the
 * next start ends whatever is still alive from it.
 *
 * Only a process that is verifiably the recorded one is ended: same pid, same
 * program file, and a start time that matches the moment this app started it.
 * A pid that was reused, by anything at all, fails that check. A Claude or
 * Codex the user runs on their own was never recorded and is never looked at.
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { readFile, readdir, readlink, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { AI_SUBSCRIPTION_PROVIDERS } from '../providers'
import {
  SUBSCRIPTION_LEFTOVER_FILE_PREFIX,
  SUBSCRIPTION_OWNER_STARTED_AT,
  killProcessTree,
  sharedSubscriptionChildRegistry,
  windowsSystemDir,
  windowsSystemTool,
  type LeftoverChildRecord,
  type LeftoverRecord,
} from './process'
import { cleanupTrackedTempDirs, setSubscriptionTempRecordDir } from './temp-dirs'

/** What the system says about a live process */
export interface ProcessInfo {
  /** creation time, epoch ms; NaN when it could not be read */
  startedAt: number
  /** full path of the program file; empty when it could not be read */
  image: string
}

/** Looks up live processes by pid; a pid that is not running is absent from the result */
export type ProcessInspector = (pids: number[]) => Promise<Map<number, ProcessInfo>>

export interface LeftoverCleanupDeps {
  inspect?: ProcessInspector | undefined
  killTree?: ((pid: number) => void) | undefined
  platform?: NodeJS.Platform | undefined
  /** pid of the calling app process; this process when absent */
  ownerPid?: number | undefined
}

export interface LeftoverCleanupResult {
  /** recorded processes that were verified and ended */
  killed: number[]
  /** recorded pids that are alive but are not (verifiably) the recorded process */
  skipped: number[]
}

/** The recorded start is taken right after spawn returns, so the real one is a little earlier */
const STARTED_BEFORE_RECORD_MS = 10_000
/** Slack for clocks and for `ps`, which reports whole seconds */
const STARTED_AFTER_RECORD_MS = 1_500
/** An owner's start is recorded from its own uptime; allow the same kind of slack */
const OWNER_START_SLACK_MS = 10_000
const INSPECT_TIMEOUT_MS = 15_000
const MAX_TOOL_OUTPUT_BYTES = 1024 * 1024

function validPid(pid: unknown): pid is number {
  return typeof pid === 'number' && Number.isInteger(pid) && pid > 0
}

function parseRecord(text: string): LeftoverRecord | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const raw = value as { owner?: unknown; children?: unknown }
  const owner = raw.owner as { pid?: unknown; startedAt?: unknown } | undefined
  if (!owner || !validPid(owner.pid) || typeof owner.startedAt !== 'number') return null
  const children: LeftoverChildRecord[] = []
  for (const item of Array.isArray(raw.children) ? raw.children : []) {
    const child = item as Partial<LeftoverChildRecord> | null
    if (
      !child ||
      !validPid(child.pid) ||
      typeof child.command !== 'string' ||
      !child.command ||
      typeof child.startedAt !== 'number' ||
      !Number.isFinite(child.startedAt) ||
      !AI_SUBSCRIPTION_PROVIDERS.includes(child.provider!)
    ) {
      continue
    }
    children.push({
      pid: child.pid,
      provider: child.provider!,
      command: child.command,
      startedAt: child.startedAt,
    })
  }
  return { version: 1, owner: { pid: owner.pid, startedAt: owner.startedAt }, children }
}

function comparable(path: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? path.replace(/\//g, '\\').toLowerCase() : path
}

/** Same program file, allowing for a command that was started through a link */
async function sameImage(
  image: string,
  command: string,
  platform: NodeJS.Platform,
): Promise<boolean> {
  if (!image || !command) return false
  const names = async (path: string): Promise<string[]> => {
    const real = await realpath(path).catch(() => path)
    return [comparable(path, platform), comparable(real, platform)]
  }
  const [left, right] = await Promise.all([names(image), names(command)])
  return left.some((name) => right.includes(name))
}

async function isRecordedProcess(
  info: ProcessInfo,
  recorded: LeftoverChildRecord,
  platform: NodeJS.Platform,
): Promise<boolean> {
  if (!Number.isFinite(info.startedAt)) return false
  const delta = info.startedAt - recorded.startedAt
  if (delta > STARTED_AFTER_RECORD_MS || delta < -STARTED_BEFORE_RECORD_MS) return false
  return sameImage(info.image, recorded.command, platform)
}

/**
 * End what a previous, force-killed run of the app left behind in `dir`, and
 * remove its records. Records of an app process that is still running (a
 * second window process, a terminal command) are left alone, children included.
 */
export async function cleanupLeftoverSubscriptionChildren(
  dir: string,
  deps: LeftoverCleanupDeps = {},
): Promise<LeftoverCleanupResult> {
  const result: LeftoverCleanupResult = { killed: [], skipped: [] }
  const platform = deps.platform ?? process.platform
  const selfPid = deps.ownerPid ?? process.pid
  const names = (await readdir(dir).catch(() => [] as string[])).filter(
    (name) =>
      name.startsWith(SUBSCRIPTION_LEFTOVER_FILE_PREFIX) &&
      /^\d+\.json$/.test(name.slice(SUBSCRIPTION_LEFTOVER_FILE_PREFIX.length)),
  )
  if (names.length === 0) return result

  const records: Array<{ file: string; record: LeftoverRecord }> = []
  for (const name of names) {
    const file = join(dir, name)
    const record = parseRecord(await readFile(file, 'utf8').catch(() => ''))
    if (record) records.push({ file, record })
    else await rm(file, { force: true }).catch(() => undefined)
  }
  // this process's own live record is not a leftover
  const stale = records.filter(
    ({ record }) =>
      !(
        record.owner.pid === selfPid &&
        Math.abs(record.owner.startedAt - SUBSCRIPTION_OWNER_STARTED_AT) <= OWNER_START_SLACK_MS
      ),
  )
  if (stale.length === 0) return result

  const pids = new Set<number>()
  for (const { record } of stale) {
    if (record.owner.pid !== selfPid) pids.add(record.owner.pid)
    for (const child of record.children) pids.add(child.pid)
  }
  let processes: Map<number, ProcessInfo>
  try {
    processes = await (deps.inspect ?? inspectProcesses)([...pids])
  } catch {
    // nothing can be verified, so nothing is ended; the records stay for the next start
    for (const { record } of stale) result.skipped.push(...record.children.map((c) => c.pid))
    return result
  }

  const killTree = deps.killTree ?? ((pid: number) => killProcessTree(pid, { force: true }))
  const untouchable = new Set([selfPid, process.pid, process.ppid])
  for (const { file, record } of stale) {
    const owner = record.owner.pid === selfPid ? undefined : processes.get(record.owner.pid)
    if (owner && Math.abs(owner.startedAt - record.owner.startedAt) <= OWNER_START_SLACK_MS) {
      continue
    }
    for (const child of record.children) {
      const info = processes.get(child.pid)
      if (!info) continue
      if (!untouchable.has(child.pid) && (await isRecordedProcess(info, child, platform))) {
        killTree(child.pid)
        result.killed.push(child.pid)
      } else {
        result.skipped.push(child.pid)
      }
    }
    await rm(file, { force: true }).catch(() => undefined)
  }
  return result
}

/**
 * For the app's start-up: end the leftovers of a previous run recorded in `dir`
 * (the app's userData directory), then keep this run's own record there.
 */
export async function initSubscriptionChildTracking(
  dir: string,
  deps: LeftoverCleanupDeps = {},
): Promise<LeftoverCleanupResult> {
  setSubscriptionTempRecordDir(dir)
  const result = await cleanupLeftoverSubscriptionChildren(dir, deps).catch(
    (): LeftoverCleanupResult => ({ killed: [], skipped: [] }),
  )
  // the same forced exit may have left the bridges' temporary folders behind
  await cleanupTrackedTempDirs(dir).catch(() => 0)
  sharedSubscriptionChildRegistry().recordIn(dir)
  return result
}

// ── Asking the system about processes ──

/** Starts a system tool; lets tests pass a stand-in for `spawn` */
type ToolSpawn = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => Pick<ChildProcess, 'stdout' | 'kill' | 'once'>

/** Stand-ins for the tests; the system this process runs on when absent */
export interface ProcessInspectionDeps {
  platform?: NodeJS.Platform | undefined
  env?: NodeJS.ProcessEnv | undefined
  spawn?: ToolSpawn | undefined
}

function runTool(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  options: { cwd?: string | undefined; spawn?: ToolSpawn | undefined } = {},
): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = (options.spawn ?? spawn)(command, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      env,
    })
    const chunks: Buffer[] = []
    let size = 0
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('The process query did not finish'))
    }, INSPECT_TIMEOUT_MS)
    timer.unref?.()
    child.stdout?.on('data', (chunk: Buffer) => {
      if (size >= MAX_TOOL_OUTPUT_BYTES) return
      size += chunk.length
      chunks.push(chunk)
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout: Buffer.concat(chunks).toString('utf8') })
    })
  })
}

/**
 * Windows has no process tool that reports a creation time, so this asks CIM
 * through PowerShell, started by full path with an argument list. The script
 * is fixed; the only variable part is the list of pids, which are integers.
 * It starts in the system directory: the folder the app was started in may be
 * a document's, and nothing is to be looked up there.
 */
async function inspectWindows(
  pids: number[],
  deps: ProcessInspectionDeps,
): Promise<Map<number, ProcessInfo>> {
  const env = deps.env ?? process.env
  const filter = pids.map((pid) => `ProcessId=${pid}`).join(' OR ')
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8',
    `Get-CimInstance Win32_Process -Filter "${filter}" | ForEach-Object { $t=''; if ($_.CreationDate) { $t=([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() }; '{0}|{1}|{2}' -f $_.ProcessId,$t,$_.ExecutablePath }`,
  ].join('; ')
  const { stdout } = await runTool(
    windowsSystemTool(env, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-NoLogo', '-Command', script],
    env,
    { cwd: windowsSystemDir(env), spawn: deps.spawn },
  )
  const found = new Map<number, ProcessInfo>()
  for (const line of stdout.split(/\r?\n/)) {
    const [pidText, startedText, ...rest] = line.trim().split('|')
    const pid = Number(pidText)
    if (!pidText || !validPid(pid)) continue
    found.set(pid, {
      startedAt: startedText ? Number(startedText) : Number.NaN,
      image: rest.join('|'),
    })
  }
  return found
}

/** Linux: the kernel's own view under /proc */
async function inspectLinux(pids: number[]): Promise<Map<number, ProcessInfo>> {
  const found = new Map<number, ProcessInfo>()
  const bootLine = (await readFile('/proc/stat', 'utf8').catch(() => ''))
    .split('\n')
    .find((line) => line.startsWith('btime '))
  const bootSeconds = bootLine ? Number(bootLine.split(/\s+/)[1]) : Number.NaN
  for (const pid of pids) {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8').catch(() => null)
    if (stat === null) continue
    // the command name may itself contain spaces and parentheses; fields resume after the last ')'
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    // field 22 (start time in clock ticks since boot) is the 20th after the name; ticks are 1/100 s
    const ticks = Number(fields[19])
    const image = await readlink(`/proc/${pid}/exe`).catch(() => '')
    found.set(pid, { startedAt: (bootSeconds + ticks / 100) * 1000, image })
  }
  return found
}

/** macOS and the rest: `ps`, in the C locale so the start time parses */
async function inspectWithPs(pids: number[]): Promise<Map<number, ProcessInfo>> {
  const { stdout } = await runTool(
    '/bin/ps',
    ['-p', pids.join(','), '-o', 'pid=', '-o', 'lstart=', '-o', 'comm='],
    { ...process.env, LC_ALL: 'C', LANG: 'C' },
  )
  const found = new Map<number, ProcessInfo>()
  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.*)$/.exec(line)
    if (!match) continue
    found.set(Number(match[1]), { startedAt: Date.parse(match[2]!), image: match[3]!.trim() })
  }
  return found
}

/** Start time and program file of each of `pids` that is running */
export const inspectProcesses = async (
  pids: number[],
  deps: ProcessInspectionDeps = {},
): Promise<Map<number, ProcessInfo>> => {
  const valid = [...new Set(pids.filter(validPid))]
  if (valid.length === 0) return new Map()
  const platform = deps.platform ?? process.platform
  if (platform === 'win32') return inspectWindows(valid, deps)
  if (platform === 'linux') return inspectLinux(valid)
  return inspectWithPs(valid)
}
