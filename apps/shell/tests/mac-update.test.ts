import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { EventEmitter, once } from 'node:events'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  MAC_SWAP_SCRIPT,
  installMacStaging,
  macAppBundle,
  macPreviousDir,
  macSelfUpdateBlock,
  macStagingDir,
  removeMacLeftovers,
  stageMacUpdate,
  startMacSwap,
} from '../src/main/mac-update'
import type { RunProgram } from '../src/main/mac-update'

/**
 * The Mac self-update without Squirrel.Mac (src/main/mac-update.ts, decision
 * 0097). The macOS programs (ditto, PlistBuddy, codesign) are faked; the swap
 * script itself runs under the real /bin/sh where there is one.
 */

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ieum-mac-update-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('macAppBundle', () => {
  it('finds the bundle around the executable', () => {
    expect(macAppBundle('/Applications/IeumOffice.app/Contents/MacOS/IeumOffice')).toBe(
      '/Applications/IeumOffice.app',
    )
    expect(macAppBundle('/Users/me/Apps/IeumOffice 2.app/Contents/MacOS/IeumOffice')).toBe(
      '/Users/me/Apps/IeumOffice 2.app',
    )
  })

  it('rejects an executable outside an app bundle', () => {
    expect(macAppBundle('/usr/local/bin/IeumOffice')).toBeNull()
    expect(macAppBundle('/Applications/IeumOffice/Contents/MacOS/IeumOffice')).toBeNull()
    expect(macAppBundle('/Applications/IeumOffice.app/Contents/Resources/IeumOffice')).toBeNull()
  })

  it('keeps the update folders beside the bundle, hidden', () => {
    expect(macStagingDir('/Applications/IeumOffice.app')).toBe(
      join('/Applications', '.IeumOffice.app.update'),
    )
    expect(macPreviousDir('/Applications/IeumOffice.app')).toBe(
      join('/Applications', '.IeumOffice.app.previous'),
    )
  })
})

describe('macSelfUpdateBlock', () => {
  const exe = '/Applications/IeumOffice.app/Contents/MacOS/IeumOffice'

  it('allows an app in a folder this user can write', () => {
    const probed: string[] = []
    const writable = (dir: string): boolean => {
      probed.push(dir)
      return true
    }
    expect(macSelfUpdateBlock(exe, writable)).toBeNull()
    // the folder that holds the bundle, where the renames happen
    expect(probed).toEqual(['/Applications'])
  })

  it('blocks a folder only an administrator can write', () => {
    expect(macSelfUpdateBlock(exe, () => false)).toBe('read-only')
  })

  it('blocks a translocated app without probing it', () => {
    const writable = vi.fn(() => true)
    const translocated =
      '/private/var/folders/ab/xyz/T/AppTranslocation/1234-ABCD/d/IeumOffice.app/Contents/MacOS/IeumOffice'
    expect(macSelfUpdateBlock(translocated, writable)).toBe('translocated')
    expect(writable).not.toHaveBeenCalled()
  })

  it('blocks a run outside an app bundle', () => {
    expect(macSelfUpdateBlock('/opt/ieumoffice/IeumOffice', () => true)).toBe('not-an-app-bundle')
  })
})

/** an installed bundle under `root`, with its Info.plist values */
function installedBundle(): string {
  const bundle = join(root, 'Applications', 'IeumOffice.app')
  mkdirSync(join(bundle, 'Contents', 'MacOS'), { recursive: true })
  return bundle
}

interface FakeMac {
  run: RunProgram
  calls: [string, string[]][]
}

/**
 * Fakes the three macOS programs. ditto "unpacks" `apps` (name → plist
 * values) into its target folder; PlistBuddy answers from the values of the
 * bundle it is asked about (the installed one is `installed`); codesign
 * passes unless told otherwise.
 */
function fakeMac(options: {
  apps?: Record<string, { version: string; id: string }>
  installed?: { version: string; id: string }
  codesignFails?: boolean
  dittoFails?: boolean
}): FakeMac {
  const {
    apps = { 'IeumOffice.app': { version: '0.2.0', id: 'com.pblsketch.ieumoffice' } },
    installed = { version: '0.1.0', id: 'com.pblsketch.ieumoffice' },
  } = options
  const plists = new Map<string, { version: string; id: string }>()
  const calls: [string, string[]][] = []
  const run: RunProgram = async (file, args) => {
    calls.push([file, args])
    if (file === '/usr/bin/ditto') {
      if (options.dittoFails) throw new Error('ditto: Couldn’t read PKZip signature')
      const target = args[3]
      for (const [name, values] of Object.entries(apps)) {
        mkdirSync(join(target, name, 'Contents'), { recursive: true })
        plists.set(join(target, name, 'Contents', 'Info.plist'), values)
      }
      return ''
    }
    if (file === '/usr/libexec/PlistBuddy') {
      const plist = args[2]
      const values = plists.get(plist) ?? installed
      return `${args[1] === 'Print :CFBundleIdentifier' ? values.id : values.version}\n`
    }
    if (file === '/usr/bin/codesign') {
      if (options.codesignFails) throw new Error('a sealed resource is missing or invalid')
      return ''
    }
    throw new Error(`unexpected program ${file}`)
  }
  return { run, calls }
}

describe('stageMacUpdate', () => {
  it('unpacks the zip beside the bundle and checks the new app', async () => {
    const bundle = installedBundle()
    const mac = fakeMac({})
    const staged = await stageMacUpdate({
      zip: join(root, 'update.zip'),
      bundle,
      version: '0.2.0',
      run: mac.run,
    })
    expect(staged).toBe(join(macStagingDir(bundle), 'IeumOffice.app'))
    expect(mac.calls[0]).toEqual([
      '/usr/bin/ditto',
      ['-x', '-k', join(root, 'update.zip'), macStagingDir(bundle)],
    ])
    expect(mac.calls.at(-1)).toEqual([
      '/usr/bin/codesign',
      ['--verify', '--deep', '--strict', staged],
    ])
    expect(existsSync(staged)).toBe(true)
  })

  it('replaces what an earlier staging left', async () => {
    const bundle = installedBundle()
    mkdirSync(join(macStagingDir(bundle), 'Old.app'), { recursive: true })
    const staged = await stageMacUpdate({
      zip: 'update.zip',
      bundle,
      version: '0.2.0',
      run: fakeMac({}).run,
    })
    expect(staged).toBe(join(macStagingDir(bundle), 'IeumOffice.app'))
    expect(existsSync(join(macStagingDir(bundle), 'Old.app'))).toBe(false)
  })

  const refusals: [string, Parameters<typeof fakeMac>[0], RegExp][] = [
    ['a zip that does not unpack', { dittoFails: true }, /PKZip/],
    ['a zip without an app', { apps: {} }, /0 apps/],
    [
      'a zip with two apps',
      {
        apps: {
          'IeumOffice.app': { version: '0.2.0', id: 'com.pblsketch.ieumoffice' },
          'Other.app': { version: '0.2.0', id: 'com.example.other' },
        },
      },
      /2 apps/,
    ],
    [
      'another version than the feed announced',
      { apps: { 'IeumOffice.app': { version: '0.1.9', id: 'com.pblsketch.ieumoffice' } } },
      /0\.1\.9, not 0\.2\.0/,
    ],
    [
      'another app than the installed one',
      { apps: { 'IeumOffice.app': { version: '0.2.0', id: 'com.example.other' } } },
      /com\.example\.other/,
    ],
    ['a bundle whose signature does not cover its files', { codesignFails: true }, /sealed/],
  ]

  it.each(refusals)('refuses %s and leaves nothing behind', async (_name, options, message) => {
    const bundle = installedBundle()
    await expect(
      stageMacUpdate({ zip: 'update.zip', bundle, version: '0.2.0', run: fakeMac(options).run }),
    ).rejects.toThrow(message)
    expect(existsSync(macStagingDir(bundle))).toBe(false)
    // the installed app is untouched
    expect(existsSync(bundle)).toBe(true)
  })
})

describe('removeMacLeftovers', () => {
  it('clears both update folders beside the bundle', () => {
    const bundle = installedBundle()
    mkdirSync(join(macStagingDir(bundle), 'IeumOffice.app'), { recursive: true })
    mkdirSync(join(macPreviousDir(bundle), 'Contents'), { recursive: true })
    removeMacLeftovers(bundle)
    expect(existsSync(macStagingDir(bundle))).toBe(false)
    expect(existsSync(macPreviousDir(bundle))).toBe(false)
    expect(existsSync(bundle)).toBe(true)
    // nothing to clear is fine too
    expect(() => removeMacLeftovers(bundle)).not.toThrow()
  })
})

describe('installMacStaging', () => {
  function fakeUpdater() {
    const dispatched: unknown[] = []
    const updater = {
      squirrel: vi.fn(),
      updateDownloaded(): Promise<string[]> {
        this.squirrel()
        return Promise.resolve([])
      },
      dispatchUpdateDownloaded(event: unknown): void {
        // called with the updater as `this`, as electron-updater's own call is
        expect(this).toBe(updater)
        dispatched.push(event)
      },
    }
    return { updater, dispatched }
  }

  const event = {
    downloadedFile: '/cache/pending/IeumOffice-0.2.0-arm64-mac.zip',
    version: '0.2.0',
  }

  it('stages the verified download instead of serving it to Squirrel.Mac', async () => {
    const { updater, dispatched } = fakeUpdater()
    const stage = vi.fn(() => Promise.resolve())
    expect(installMacStaging(updater, stage)).toBe(true)
    // electron-updater calls it as updateDownloaded(fileInfo, event)
    await (updater.updateDownloaded as unknown as (f: unknown, e: unknown) => Promise<unknown>)(
      {},
      event,
    )
    expect(stage).toHaveBeenLastCalledWith(event.downloadedFile, '0.2.0')
    expect(dispatched.at(-1)).toBe(event)
    expect(updater.squirrel).not.toHaveBeenCalled()
  })

  it('fails the download when staging fails, without announcing it', async () => {
    const { updater, dispatched } = fakeUpdater()
    installMacStaging(updater, () => Promise.reject(new Error('codesign failed')))
    await expect(
      (updater.updateDownloaded as unknown as (f: unknown, e: unknown) => Promise<unknown>)(
        {},
        event,
      ),
    ).rejects.toThrow('codesign failed')
    expect(dispatched).toEqual([])
  })

  it('changes nothing when electron-updater lacks the two methods', () => {
    const updater = { updateDownloaded: () => Promise.resolve([]) }
    const before = updater.updateDownloaded
    expect(installMacStaging(updater, () => Promise.resolve())).toBe(false)
    expect(updater.updateDownloaded).toBe(before)
  })

  it("matches electron-updater's MacUpdater", () => {
    // the hook only works while MacUpdater hands the downloaded zip to its own
    // updateDownloaded and AppUpdater announces through dispatchUpdateDownloaded
    const require = createRequire(import.meta.url)
    const out = dirname(require.resolve('electron-updater/out/MacUpdater.js'))
    const macUpdater = readFileSync(join(out, 'MacUpdater.js'), 'utf8')
    expect(macUpdater).toContain('return this.updateDownloaded(zipFileInfo, event);')
    expect(macUpdater).toMatch(/async updateDownloaded\(zipFileInfo, event\)/)
    const appUpdater = readFileSync(join(out, 'AppUpdater.js'), 'utf8')
    expect(appUpdater).toMatch(/\n {4}dispatchUpdateDownloaded\(event\) \{/)
    // the download is checked against the feed's sha512 before that call
    expect(appUpdater).toContain('sha512: fileInfo.info.sha512')
  })
})

describe('startMacSwap', () => {
  it('starts the script detached, every value as its own argument', () => {
    const child = Object.assign(new EventEmitter(), { pid: 42, unref: vi.fn() })
    const spawnProgram = vi.fn(() => child as unknown as ChildProcess)
    const started = startMacSwap({
      pid: 7,
      bundle: '/Applications/IeumOffice.app',
      staged: '/Applications/.IeumOffice.app.update/IeumOffice.app',
      logFile: '/Users/me/Library/Application Support/IeumOffice/update-log.txt',
      spawnProgram: spawnProgram as unknown as typeof spawn,
    })
    expect(started).toBe(true)
    expect(spawnProgram).toHaveBeenCalledWith(
      '/bin/sh',
      [
        '-c',
        MAC_SWAP_SCRIPT,
        'ieumoffice-update',
        '7',
        '/Applications/IeumOffice.app',
        '/Applications/.IeumOffice.app.update/IeumOffice.app',
        join('/Applications', '.IeumOffice.app.update'),
        join('/Applications', '.IeumOffice.app.previous'),
        '/Users/me/Library/Application Support/IeumOffice/update-log.txt',
        '/usr/bin/open',
      ],
      { detached: true, stdio: 'ignore' },
    )
    expect(child.unref).toHaveBeenCalled()
    // a late spawn error does not become an uncaught exception
    expect(() => child.emit('error', new Error('ENOENT'))).not.toThrow()
  })

  it('reports a script that could not start', () => {
    const throwing = (() => {
      throw new Error('EAGAIN')
    }) as unknown as typeof spawn
    const noPid = (() =>
      Object.assign(new EventEmitter(), {
        pid: undefined,
        unref: () => {},
      })) as unknown as typeof spawn
    const base = { pid: 7, bundle: '/A/X.app', staged: '/A/.X.app.update/X.app', logFile: '/l' }
    expect(startMacSwap({ ...base, spawnProgram: throwing })).toBe(false)
    expect(startMacSwap({ ...base, spawnProgram: noPid })).toBe(false)
  })
})

// The script itself, under a real POSIX shell (Linux CI, a Mac). The app's
// process is a short sleep; "open" is a stand-in that records its arguments.
describe.skipIf(process.platform === 'win32')('the swap script', () => {
  let apps = ''
  let bundle = ''
  let staged = ''
  let log = ''
  let opener = ''

  beforeEach(() => {
    apps = join(root, 'Applications')
    bundle = join(apps, 'IeumOffice.app')
    mkdirSync(join(bundle, 'Contents'), { recursive: true })
    writeFileSync(join(bundle, 'Contents', 'version'), 'old')
    staged = join(macStagingDir(bundle), 'IeumOffice.app')
    mkdirSync(join(staged, 'Contents'), { recursive: true })
    writeFileSync(join(staged, 'Contents', 'version'), 'new')
    log = join(root, 'update-log.txt')
    opener = join(root, 'open')
    writeFileSync(opener, `#!/bin/sh\nprintf '%s\\n' "$@" > "${join(root, 'opened')}"\n`)
    chmodSync(opener, 0o755)
  })

  // Run without blocking the event loop: a synchronous spawn would keep Node
  // from reaping the "app" child, which then lingers as a zombie that
  // `kill -0` still finds, so the script would wait out its full minute
  async function runSwap(pid: number): Promise<void> {
    const script = spawn(
      '/bin/sh',
      [
        '-c',
        MAC_SWAP_SCRIPT,
        'ieumoffice-update',
        String(pid),
        bundle,
        staged,
        macStagingDir(bundle),
        macPreviousDir(bundle),
        log,
        opener,
      ],
      { stdio: 'ignore', timeout: 15_000 },
    )
    const [code, signal] = (await once(script, 'close')) as [number | null, NodeJS.Signals | null]
    expect(signal).toBeNull()
    expect(code).toBe(0)
  }

  const opened = (): string[] => readFileSync(join(root, 'opened'), 'utf8').trim().split('\n')
  const installedVersion = (): string => readFileSync(join(bundle, 'Contents', 'version'), 'utf8')

  it('waits for the app to quit, swaps the new version in and opens it', async () => {
    const app = spawn('/bin/sleep', ['0.5'])
    const started = Date.now()
    await runSwap(app.pid!)
    expect(Date.now() - started).toBeGreaterThanOrEqual(300)
    expect(installedVersion()).toBe('new')
    expect(existsSync(macStagingDir(bundle))).toBe(false)
    expect(existsSync(macPreviousDir(bundle))).toBe(false)
    expect(opened()).toEqual([bundle, '--args', '--updated'])
    expect(readFileSync(log, 'utf8')).toMatch(/^\S+Z info \[swap\] installed the new version\n$/)
  })

  it('puts the old version back and opens it when the new one cannot move in', async () => {
    rmSync(macStagingDir(bundle), { recursive: true })
    await runSwap(999_999)
    expect(installedVersion()).toBe('old')
    expect(existsSync(macPreviousDir(bundle))).toBe(false)
    expect(opened()).toEqual([bundle, '--args', '--updated'])
    expect(readFileSync(log, 'utf8')).toContain('putting the previous one back')
  })

  it('handles paths with spaces and quotes as plain values', async () => {
    const odd = join(root, "My Apps 'x'")
    mkdirSync(odd)
    const oddBundle = join(odd, 'IeumOffice.app')
    mkdirSync(join(oddBundle, 'Contents'), { recursive: true })
    writeFileSync(join(oddBundle, 'Contents', 'version'), 'old')
    const oddStaged = join(macStagingDir(oddBundle), 'IeumOffice.app')
    mkdirSync(join(oddStaged, 'Contents'), { recursive: true })
    writeFileSync(join(oddStaged, 'Contents', 'version'), 'new')
    bundle = oddBundle
    staged = oddStaged
    await runSwap(999_999)
    expect(installedVersion()).toBe('new')
    expect(opened()[0]).toBe(oddBundle)
  })
})
