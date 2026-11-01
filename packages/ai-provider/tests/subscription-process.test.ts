/**
 * Starting, tracking and stopping the subscription CLIs: no shell on the way
 * in, the whole process tree on the way out, and nothing left behind by a run
 * the app did not get to clean up.
 */
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SUBSCRIPTION_LEFTOVER_FILE_PREFIX,
  USER_MCP_CHILD_KIND,
  cleanupLeftoverSubscriptionChildren,
  createSubscriptionChildRegistry,
  inspectProcesses,
  killProcessTree,
  leftoverRecordFile,
  runSubscriptionProgram,
  shutdownSubscriptionChildren,
  spawnSubscriptionProgram,
  trackedSubscriptionChildCount,
  windowsSystemDir,
  windowsSystemTool,
  type ProcessInfo,
  type SubscriptionProgram,
} from '../src/subscription'

class FakeChild extends EventEmitter {
  killed = false
  constructor(readonly pid: number | undefined) {
    super()
  }
  kill(): boolean {
    this.killed = true
    return true
  }
  unref(): void {}
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitUntil(check: () => boolean, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (check()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return check()
}

/** this Node binary standing in for a CLI */
function nodeProgram(): SubscriptionProgram {
  return {
    provider: 'codex',
    command: process.execPath,
    prefixArgs: [],
    env: {},
    entry: process.execPath,
    source: 'configured',
  }
}

describe('Windows system tools', () => {
  const SYSTEM32 = 'C:\\Windows\\System32'

  it('are named by full path in the system directory', () => {
    expect(windowsSystemDir({ SystemRoot: 'C:\\Windows' })).toBe(SYSTEM32)
    expect(windowsSystemTool({ SystemRoot: 'D:\\WinNT' }, 'cmd.exe')).toBe(
      'D:\\WinNT\\System32\\cmd.exe',
    )
    expect(windowsSystemDir({ windir: 'D:\\WinNT\\' })).toBe('D:\\WinNT\\System32')
    expect(windowsSystemDir({})).toBe(SYSTEM32)
  })

  it('never from a value that the working directory would complete', () => {
    for (const SystemRoot of ['', '.', 'Windows', '\\Windows', 'C:Windows', 'C:/Windows', 'C:\\']) {
      expect(windowsSystemDir({ SystemRoot })).toBe(SYSTEM32)
      expect(windowsSystemDir({ SystemRoot, windir: 'D:\\WinNT' })).toBe('D:\\WinNT\\System32')
    }
  })

  it('never from a value a command line would read as more than a path', () => {
    for (const SystemRoot of ['C:\\x" & calc.exe & "', 'C:\\%X%', 'C:\\a|b', 'C:\\a\nb']) {
      expect(windowsSystemTool({ SystemRoot }, 'cmd.exe')).toBe(`${SYSTEM32}\\cmd.exe`)
    }
  })
})

describe('killProcessTree', () => {
  it('on Windows asks taskkill for the whole tree, by argument list', () => {
    const spawned: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = []
    killProcessTree(4242, {
      platform: 'win32',
      env: { SystemRoot: 'C:\\Windows' },
      spawn: (command, args, options) => {
        spawned.push({ command, args, options: { ...options } })
        return new FakeChild(1)
      },
    })
    expect(spawned).toHaveLength(1)
    expect(spawned[0]!.command.toLowerCase()).toContain('taskkill')
    expect(spawned[0]!.args).toEqual(['/PID', '4242', '/T', '/F'])
    expect(spawned[0]!.options.shell).toBeUndefined()
  })

  it('on Windows starts taskkill in the system directory, not the folder the app was started in', () => {
    const spawned: Array<{ command: string; options: Record<string, unknown> }> = []
    killProcessTree(4242, {
      platform: 'win32',
      env: { SystemRoot: 'D:\\WinNT' },
      spawn: (command, _args, options) => {
        spawned.push({ command, options: { ...options } })
        return new FakeChild(1)
      },
    })
    expect(spawned[0]!.command).toBe('D:\\WinNT\\System32\\taskkill.exe')
    // the app may have been started in a document's folder: nothing is looked up there
    expect(spawned[0]!.options.cwd).toBe('D:\\WinNT\\System32')
    expect(spawned[0]!.options.cwd).not.toBe(process.cwd())
  })

  it('elsewhere signals the process group', () => {
    const signals: Array<[number, string | number | undefined]> = []
    killProcessTree(4242, {
      platform: 'linux',
      force: true,
      kill: (pid, signal) => {
        signals.push([pid, signal])
      },
    })
    expect(signals).toEqual([[-4242, 'SIGKILL']])
  })

  it('falls back to the process itself when it leads no group', () => {
    const signals: Array<[number, string | number | undefined]> = []
    killProcessTree(4242, {
      platform: 'linux',
      force: true,
      kill: (pid, signal) => {
        signals.push([pid, signal])
        if (pid < 0) throw Object.assign(new Error('no such process'), { code: 'ESRCH' })
      },
    })
    expect(signals).toEqual([
      [-4242, 'SIGKILL'],
      [4242, 'SIGKILL'],
    ])
  })

  it('ignores a pid that cannot be a process', () => {
    let calls = 0
    for (const pid of [0, -5, 1.5, Number.NaN]) {
      killProcessTree(pid, { platform: 'linux', kill: () => void calls++ })
      killProcessTree(pid, { platform: 'win32', spawn: () => (calls++, new FakeChild(1)) })
    }
    expect(calls).toBe(0)
  })

  it('really ends a child and the grandchild it started', async () => {
    const grandchild = `setInterval(() => {}, 1000)`
    const parent = [
      `const { spawn } = require('node:child_process')`,
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore' })`,
      `console.log(child.pid)`,
      `setInterval(() => {}, 1000)`,
    ].join(';')
    const child = spawnSubscriptionProgram(nodeProgram(), ['-e', parent], {
      registry: createSubscriptionChildRegistry(),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const grandchildPid = await new Promise<number>((resolve, reject) => {
      child.stdout!.once('data', (chunk: Buffer) => resolve(Number(chunk.toString().trim())))
      child.once('error', reject)
    })
    expect(alive(child.pid!)).toBe(true)
    expect(alive(grandchildPid)).toBe(true)
    killProcessTree(child, { force: true })
    expect(await waitUntil(() => !alive(child.pid!) && !alive(grandchildPid))).toBe(true)
  }, 30_000)
})

describe('the registry of children this app started', () => {
  it('ends every tracked tree on shutdown', () => {
    const killed: number[] = []
    const registry = createSubscriptionChildRegistry({ killTree: (pid) => killed.push(pid) })
    registry.track(new FakeChild(101), { provider: 'claude-code', command: 'claude' })
    registry.track(new FakeChild(202), { provider: 'codex', command: 'codex' })
    expect(registry.size).toBe(2)
    registry.shutdown()
    expect(killed.sort()).toEqual([101, 202])
    expect(registry.size).toBe(0)
    // a second call, as from a quit handler followed by an exit handler, does nothing
    registry.shutdown()
    expect(killed).toHaveLength(2)
  })

  it('forgets a child that exited on its own, or was untracked', () => {
    const killed: number[] = []
    const registry = createSubscriptionChildRegistry({ killTree: (pid) => killed.push(pid) })
    const exits = new FakeChild(101)
    registry.track(exits, { provider: 'claude-code', command: 'claude' })
    const untrack = registry.track(new FakeChild(202), { provider: 'codex', command: 'codex' })
    exits.emit('exit', 0, null)
    untrack()
    expect(registry.size).toBe(0)
    registry.shutdown()
    expect(killed).toEqual([])
  })

  it('does not track a child that never started', () => {
    const registry = createSubscriptionChildRegistry({ killTree: () => undefined })
    registry.track(new FakeChild(undefined), { provider: 'codex', command: 'codex' })
    expect(registry.size).toBe(0)
  })

  it('spawnSubscriptionProgram registers with the shared registry that shutdownSubscriptionChildren empties', async () => {
    const child = spawnSubscriptionProgram(nodeProgram(), ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    })
    expect(trackedSubscriptionChildCount()).toBe(1)
    shutdownSubscriptionChildren()
    expect(trackedSubscriptionChildCount()).toBe(0)
    expect(await waitUntil(() => !alive(child.pid!))).toBe(true)
  }, 30_000)
})

describe('how a program is started', () => {
  it('without a shell, with the sanitised environment and the arguments as given', async () => {
    const calls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = []
    const program: SubscriptionProgram = {
      provider: 'codex',
      command: 'C:\\app\\app.exe',
      prefixArgs: ['C:\\npm\\codex.js'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
      entry: 'C:\\npm\\codex.js',
      source: 'npm',
    }
    spawnSubscriptionProgram(program, ['login', 'status', '& calc.exe'], {
      registry: createSubscriptionChildRegistry({ killTree: () => undefined }),
      baseEnv: { OPENAI_API_KEY: 'sk-x', KEEP: '1' },
      spawn: (command, args, options) => {
        calls.push({ command, args, options: { ...options } })
        return new FakeChild(77)
      },
    })
    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.command).toBe('C:\\app\\app.exe')
    expect(call.args).toEqual(['C:\\npm\\codex.js', 'login', 'status', '& calc.exe'])
    expect(call.options.shell).toBeUndefined()
    expect(call.options.windowsHide).toBe(true)
    const env = call.options.env as NodeJS.ProcessEnv
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.KEEP).toBe('1')
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1')
  })

  it('runSubscriptionProgram returns the exit code and both streams', async () => {
    const result = await runSubscriptionProgram(
      nodeProgram(),
      ['-e', 'process.stdout.write("out"); process.stderr.write("err"); process.exit(3)'],
      { timeoutMs: 20_000, signal: new AbortController().signal },
    )
    expect(result).toEqual({ code: 3, stdout: 'out', stderr: 'err' })
  }, 30_000)

  it('runSubscriptionProgram stops the program when the caller gives up', async () => {
    const controller = new AbortController()
    const started = Date.now()
    const pending = runSubscriptionProgram(nodeProgram(), ['-e', 'setInterval(() => {}, 1000)'], {
      timeoutMs: 60_000,
      signal: controller.signal,
    })
    setTimeout(() => controller.abort(), 300)
    await expect(pending).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(20_000)
  }, 30_000)

  it('runSubscriptionProgram does not leave stdin open for the program to wait on', async () => {
    const result = await runSubscriptionProgram(
      nodeProgram(),
      ['-e', 'process.stdin.on("data", () => {}).on("end", () => process.stdout.write("eof"))'],
      { timeoutMs: 20_000, signal: new AbortController().signal },
    )
    expect(result.stdout).toBe('eof')
  }, 30_000)

  it('runSubscriptionProgram reports a program that cannot be started', async () => {
    const missing: SubscriptionProgram = {
      ...nodeProgram(),
      command: join(tmpdir(), 'no-such-dir', 'no-such-cli.exe'),
    }
    await expect(
      runSubscriptionProgram(missing, ['--version'], {
        timeoutMs: 5_000,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow()
  })
})

describe('what a force-killed app left behind', () => {
  let dir: string
  const OWNER = 900_001
  const OWNER_STARTED = 1_700_000_000_000
  const CHILD_STARTED = 1_700_000_100_000

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'subscription-leftover-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  async function writeRecord(
    children: Array<{ pid: number; command: string; startedAt?: number; provider?: string }>,
    owner = { pid: OWNER, startedAt: OWNER_STARTED },
  ): Promise<string> {
    const file = join(dir, `${SUBSCRIPTION_LEFTOVER_FILE_PREFIX}${owner.pid}.json`)
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        owner,
        children: children.map((child) => ({
          provider: 'claude-code',
          startedAt: CHILD_STARTED,
          ...child,
        })),
      }),
    )
    return file
  }

  function cleanup(processes: Record<number, ProcessInfo>) {
    const killed: number[] = []
    const asked: number[][] = []
    return {
      killed,
      asked,
      run: () =>
        cleanupLeftoverSubscriptionChildren(dir, {
          platform: 'win32',
          ownerPid: 123,
          inspect: async (pids) => {
            asked.push([...pids].sort())
            const found = new Map<number, ProcessInfo>()
            for (const pid of pids) if (processes[pid]) found.set(pid, processes[pid]!)
            return found
          },
          killTree: (pid) => killed.push(pid),
        }),
    }
  }

  it('ends a recorded process that is still the one this app started', async () => {
    const file = await writeRecord([{ pid: 5001, command: 'C:\\npm\\claude.exe' }])
    const job = cleanup({
      5001: { startedAt: CHILD_STARTED - 400, image: 'c:\\NPM\\claude.exe' },
    })
    const result = await job.run()
    expect(job.killed).toEqual([5001])
    expect(result.killed).toEqual([5001])
    expect(existsSync(file)).toBe(false)
  })

  it('ends a recorded user MCP server by the same checks as a subscription CLI', async () => {
    const file = await writeRecord([
      { pid: 5001, command: 'C:\\nodejs\\node.exe', provider: USER_MCP_CHILD_KIND },
      { pid: 5002, command: 'C:\\nodejs\\node.exe', provider: USER_MCP_CHILD_KIND },
      { pid: 5003, command: 'C:\\nodejs\\node.exe', provider: USER_MCP_CHILD_KIND },
    ])
    const job = cleanup({
      5001: { startedAt: CHILD_STARTED - 400, image: 'c:\\NODEJS\\node.exe' },
      // the pid now belongs to another program
      5002: { startedAt: CHILD_STARTED, image: 'C:\\Windows\\System32\\notepad.exe' },
      // the same program, started long after ours
      5003: { startedAt: CHILD_STARTED + 3_600_000, image: 'C:\\nodejs\\node.exe' },
    })
    const result = await job.run()
    expect(job.killed).toEqual([5001])
    expect(result.skipped.sort()).toEqual([5002, 5003])
    expect(existsSync(file)).toBe(false)
  })

  it('ignores a record line of a kind it does not know', async () => {
    await writeRecord([{ pid: 5001, command: 'C:\\npm\\claude.exe', provider: 'something-else' }])
    const job = cleanup({ 5001: { startedAt: CHILD_STARTED, image: 'C:\\npm\\claude.exe' } })
    const result = await job.run()
    expect(job.killed).toEqual([])
    expect(result).toEqual({ killed: [], skipped: [] })
  })

  it('leaves a process alone when the pid now belongs to something started later', async () => {
    await writeRecord([{ pid: 5001, command: 'C:\\npm\\claude.exe' }])
    // the user's own Claude, same program, started an hour after ours ended
    const job = cleanup({
      5001: { startedAt: CHILD_STARTED + 3_600_000, image: 'C:\\npm\\claude.exe' },
    })
    const result = await job.run()
    expect(job.killed).toEqual([])
    expect(result.skipped).toEqual([5001])
  })

  it('leaves a process alone when the pid now belongs to another program', async () => {
    await writeRecord([{ pid: 5001, command: 'C:\\npm\\claude.exe' }])
    const job = cleanup({
      5001: { startedAt: CHILD_STARTED, image: 'C:\\Windows\\System32\\notepad.exe' },
    })
    await job.run()
    expect(job.killed).toEqual([])
  })

  it('leaves a process alone when its start time or program cannot be read', async () => {
    await writeRecord([
      { pid: 5001, command: 'C:\\npm\\claude.exe' },
      { pid: 5002, command: 'C:\\npm\\claude.exe' },
    ])
    const job = cleanup({
      5001: { startedAt: Number.NaN, image: 'C:\\npm\\claude.exe' },
      5002: { startedAt: CHILD_STARTED, image: '' },
    })
    await job.run()
    expect(job.killed).toEqual([])
  })

  it('does nothing for a recorded process that is gone, and removes the record', async () => {
    const file = await writeRecord([{ pid: 5001, command: 'C:\\npm\\claude.exe' }])
    const job = cleanup({})
    const result = await job.run()
    expect(job.killed).toEqual([])
    expect(result).toEqual({ killed: [], skipped: [] })
    expect(existsSync(file)).toBe(false)
  })

  it('does not touch the children of another running instance of the app', async () => {
    const file = await writeRecord([{ pid: 5001, command: 'C:\\npm\\claude.exe' }])
    const job = cleanup({
      [OWNER]: { startedAt: OWNER_STARTED + 200, image: 'C:\\app\\IeumOffice.exe' },
      5001: { startedAt: CHILD_STARTED, image: 'C:\\npm\\claude.exe' },
    })
    await job.run()
    expect(job.killed).toEqual([])
    expect(existsSync(file)).toBe(true)
  })

  it('treats a record whose owner pid was reused by another process as abandoned', async () => {
    await writeRecord([{ pid: 5001, command: 'C:\\npm\\claude.exe' }])
    const job = cleanup({
      [OWNER]: { startedAt: OWNER_STARTED + 86_400_000, image: 'C:\\Windows\\explorer.exe' },
      5001: { startedAt: CHILD_STARTED, image: 'C:\\npm\\claude.exe' },
    })
    await job.run()
    expect(job.killed).toEqual([5001])
  })

  it('never ends the app itself or its parent, whatever a record says', async () => {
    await writeRecord([
      { pid: 123, command: 'C:\\npm\\claude.exe' },
      { pid: process.ppid, command: 'C:\\npm\\claude.exe' },
    ])
    const job = cleanup({
      123: { startedAt: CHILD_STARTED, image: 'C:\\npm\\claude.exe' },
      [process.ppid]: { startedAt: CHILD_STARTED, image: 'C:\\npm\\claude.exe' },
    })
    await job.run()
    expect(job.killed).toEqual([])
  })

  it('ignores a damaged record and other files in the directory', async () => {
    await writeFile(join(dir, `${SUBSCRIPTION_LEFTOVER_FILE_PREFIX}77.json`), '{ nope')
    await writeFile(join(dir, 'app-settings.json'), '{"keep":true}')
    await writeFile(
      join(dir, `${SUBSCRIPTION_LEFTOVER_FILE_PREFIX}78.json`),
      JSON.stringify({ version: 1, owner: { pid: 78, startedAt: 1 }, children: [{ pid: '5001' }] }),
    )
    const job = cleanup({ 5001: { startedAt: CHILD_STARTED, image: 'C:\\npm\\claude.exe' } })
    const result = await job.run()
    expect(result).toEqual({ killed: [], skipped: [] })
    expect((await readdir(dir)).sort()).toEqual(['app-settings.json'])
  })

  it('with no record, asks the system nothing', async () => {
    const job = cleanup({})
    expect(await job.run()).toEqual({ killed: [], skipped: [] })
    expect(job.asked).toEqual([])
    const absent = await cleanupLeftoverSubscriptionChildren(join(dir, 'never-created'), {
      inspect: async () => new Map(),
      killTree: () => undefined,
    })
    expect(absent).toEqual({ killed: [], skipped: [] })
  })

  it('asks Windows about processes from the system directory, not the folder the app was started in', async () => {
    const spawned: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = []
    const found = await inspectProcesses([4242], {
      platform: 'win32',
      env: { SystemRoot: 'D:\\WinNT' },
      spawn: (command, args, options) => {
        spawned.push({ command, args, options: { ...options } })
        const child = Object.assign(new FakeChild(1), { stdout: new EventEmitter() })
        setImmediate(() => {
          child.stdout.emit('data', Buffer.from('4242|1700000100000|C:\\npm\\claude.exe\r\n'))
          child.emit('close', 0)
        })
        return child as never
      },
    })
    expect(spawned).toHaveLength(1)
    expect(spawned[0]!.command).toBe('D:\\WinNT\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(spawned[0]!.options.shell).toBeUndefined()
    // the app may have been started in a document's folder: nothing is looked up there
    expect(spawned[0]!.options.cwd).toBe('D:\\WinNT\\System32')
    expect(spawned[0]!.options.cwd).not.toBe(process.cwd())
    expect(found).toEqual(
      new Map([[4242, { startedAt: 1_700_000_100_000, image: 'C:\\npm\\claude.exe' }]]),
    )
  })

  it('a registry writes down what it started, and takes it back when it ends', async () => {
    const registry = createSubscriptionChildRegistry({ killTree: () => undefined })
    registry.recordIn(dir)
    const file = leftoverRecordFile(dir)
    expect(file).toBe(join(dir, `${SUBSCRIPTION_LEFTOVER_FILE_PREFIX}${process.pid}.json`))

    const child = new FakeChild(6001)
    const before = Date.now()
    registry.track(child, { provider: 'codex', command: 'C:\\npm\\codex.exe' })
    await registry.flushed()
    const record = JSON.parse(await readFile(file, 'utf8'))
    expect(record.version).toBe(1)
    expect(record.owner.pid).toBe(process.pid)
    expect(record.children).toHaveLength(1)
    expect(Object.keys(record.children[0]).sort()).toEqual([
      'command',
      'pid',
      'provider',
      'startedAt',
    ])
    expect(record.children[0]).toMatchObject({
      pid: 6001,
      provider: 'codex',
      command: 'C:\\npm\\codex.exe',
    })
    expect(record.children[0].startedAt).toBeGreaterThanOrEqual(before)

    child.emit('exit', 0, null)
    await registry.flushed()
    expect(JSON.parse(await readFile(file, 'utf8')).children).toEqual([])
  })

  it('a registry writes down a user MCP server under its own kind', async () => {
    const registry = createSubscriptionChildRegistry({ killTree: () => undefined })
    registry.recordIn(dir)
    const child = new FakeChild(6002)
    registry.track(child, { provider: USER_MCP_CHILD_KIND, command: 'C:\\nodejs\\node.exe' })
    await registry.flushed()
    const record = JSON.parse(await readFile(leftoverRecordFile(dir), 'utf8'))
    expect(record.children).toEqual([
      expect.objectContaining({
        pid: 6002,
        provider: 'user-mcp',
        command: 'C:\\nodejs\\node.exe',
      }),
    ])
    child.emit('exit', 0, null)
    await registry.flushed()
    expect(JSON.parse(await readFile(leftoverRecordFile(dir), 'utf8')).children).toEqual([])
  })

  it('shutdown removes the record together with the children', async () => {
    const registry = createSubscriptionChildRegistry({ killTree: () => undefined })
    registry.recordIn(dir)
    registry.track(new FakeChild(6001), { provider: 'codex', command: 'codex.exe' })
    await registry.flushed()
    expect(existsSync(leftoverRecordFile(dir))).toBe(true)
    registry.shutdown()
    expect(existsSync(leftoverRecordFile(dir))).toBe(false)
  })

  it('finds and ends a real process a previous run left behind, and only that one', async () => {
    const leftover = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
      detached: process.platform !== 'win32',
    })
    const bystander = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    })
    // a pid no process holds, below macOS's ceiling of 99998: `ps -p` there
    // prints nothing at all when one of the pids it is given is above it
    let ownerPid = 99_998
    while (alive(ownerPid)) ownerPid--
    try {
      const startedAt = Date.now()
      await writeFile(
        join(dir, `${SUBSCRIPTION_LEFTOVER_FILE_PREFIX}${ownerPid}.json`),
        JSON.stringify({
          version: 1,
          owner: { pid: ownerPid, startedAt: 1 },
          children: [
            { pid: leftover.pid, provider: 'codex', command: process.execPath, startedAt },
            // same pid as a live process, but recorded as started long ago: a reused pid
            {
              pid: bystander.pid,
              provider: 'codex',
              command: process.execPath,
              startedAt: startedAt - 86_400_000,
            },
          ],
        }),
      )
      const result = await cleanupLeftoverSubscriptionChildren(dir)
      expect(result.killed).toEqual([leftover.pid])
      expect(result.skipped).toEqual([bystander.pid])
      expect(await waitUntil(() => !alive(leftover.pid!))).toBe(true)
      expect(alive(bystander.pid!)).toBe(true)
    } finally {
      leftover.kill()
      bystander.kill()
    }
  }, 60_000)
})
