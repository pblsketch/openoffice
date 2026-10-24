/**
 * Finding the program to start. Layouts are built in temp dirs: nothing here
 * runs or looks for the CLIs installed on the machine.
 */
import { symlinkSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, realpath, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AiRunError } from '../src/run-error'
import { locateSubscriptionProgram, resolveSubscriptionProgram } from '../src/subscription'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'subscription-locate-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function touch(path: string, content = ''): Promise<string> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content)
  return path
}

/** A Windows profile with nothing installed and an empty PATH */
function windowsEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    APPDATA: join(root, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(root, 'AppData', 'Local'),
    USERPROFILE: root,
    PATH: '',
    ...extra,
  }
}

const COMMAND_NAMES = { 'claude-code': 'claude', codex: 'codex' } as const

const CLAUDE_SHIM = [
  '@ECHO off',
  'GOTO start',
  ':find_dp0',
  'SET dp0=%~dp0',
  'EXIT /b',
  ':start',
  'SETLOCAL',
  'CALL :find_dp0',
  '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*',
  '',
].join('\r\n')

const CODEX_SHIM = [
  '@ECHO off',
  'GOTO start',
  ':find_dp0',
  'SET dp0=%~dp0',
  'EXIT /b',
  ':start',
  'SETLOCAL',
  'CALL :find_dp0',
  '',
  'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"',
  ') ELSE (',
  '  SET "_prog=node"',
  '  SET PATHEXT=%PATHEXT:;.JS;=;%',
  ')',
  '',
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*',
  '',
].join('\r\n')

describe('locateSubscriptionProgram on Windows', () => {
  it('finds nothing in an empty profile', async () => {
    const env = windowsEnv()
    expect(await locateSubscriptionProgram('claude-code', { env, platform: 'win32' })).toBeNull()
    expect(await locateSubscriptionProgram('codex', { env, platform: 'win32' })).toBeNull()
  })

  it('looks in %APPDATA%\\npm even when PATH does not list it, and runs the exe behind the Claude shim', async () => {
    const env = windowsEnv()
    const npm = join(env.APPDATA!, 'npm')
    await touch(join(npm, 'claude.cmd'), CLAUDE_SHIM)
    const exe = await touch(
      join(npm, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    )
    const program = await locateSubscriptionProgram('claude-code', { env, platform: 'win32' })
    expect(program).toMatchObject({
      provider: 'claude-code',
      command: exe,
      prefixArgs: [],
      source: 'npm',
    })
    expect(program!.command.toLowerCase().endsWith('.cmd')).toBe(false)
  })

  it('runs the native Codex binary the npm launcher itself would start', async () => {
    const env = windowsEnv()
    const npm = join(env.APPDATA!, 'npm')
    await touch(join(npm, 'codex.cmd'), CODEX_SHIM)
    const packageRoot = join(npm, 'node_modules', '@openai', 'codex')
    await touch(join(packageRoot, 'bin', 'codex.js'))
    const native = await touch(
      join(
        packageRoot,
        'node_modules',
        '@openai',
        'codex-win32-x64',
        'vendor',
        'x86_64-pc-windows-msvc',
        'bin',
        'codex.exe',
      ),
    )
    const program = await locateSubscriptionProgram('codex', {
      env,
      platform: 'win32',
      arch: 'x64',
    })
    expect(program).toMatchObject({ provider: 'codex', command: native, prefixArgs: [] })
    // the two variables the launcher sets for the native binary
    expect(program!.env.CODEX_MANAGED_PACKAGE_ROOT).toBe(packageRoot)
    expect(program!.env.CODEX_MANAGED_BY_NPM).toBe('1')
  })

  it('falls back to the JS entry on a Node runtime when the native binary is not where expected', async () => {
    const env = windowsEnv()
    const npm = join(env.APPDATA!, 'npm')
    await touch(join(npm, 'codex.cmd'), CODEX_SHIM)
    const entry = await touch(join(npm, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'))
    const runtime = { command: 'C:\\Program Files\\IeumOffice\\IeumOffice.exe', electron: true }
    const program = await locateSubscriptionProgram('codex', {
      env,
      platform: 'win32',
      arch: 'x64',
      nodeRuntime: runtime,
    })
    expect(program).toMatchObject({
      command: runtime.command,
      prefixArgs: [entry],
      entry,
    })
    expect(program!.env.ELECTRON_RUN_AS_NODE).toBe('1')
  })

  it('prefers the node.exe npm placed next to the shim, as the shim does', async () => {
    const env = windowsEnv()
    const npm = join(env.APPDATA!, 'npm')
    await touch(join(npm, 'codex.cmd'), CODEX_SHIM)
    const node = await touch(join(npm, 'node.exe'))
    const entry = await touch(join(npm, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'))
    const program = await locateSubscriptionProgram('codex', {
      env,
      platform: 'win32',
      arch: 'x64',
      nodeRuntime: { command: 'C:\\app\\app.exe', electron: true },
    })
    expect(program).toMatchObject({ command: node, prefixArgs: [entry] })
    expect(program!.env.ELECTRON_RUN_AS_NODE).toBeUndefined()
  })

  it('follows a shim whose target is not in the stock npm layout', async () => {
    const env = windowsEnv({ PATH: join(root, 'pnpm') })
    const exe = await touch(join(root, 'pnpm', 'global', '5', 'claude-code', 'bin', 'claude.exe'))
    await touch(
      join(root, 'pnpm', 'claude.cmd'),
      '@ECHO off\r\n"%~dp0\\global\\5\\claude-code\\bin\\claude.exe" %*\r\n',
    )
    const program = await locateSubscriptionProgram('claude-code', { env, platform: 'win32' })
    expect(program?.command).toBe(exe)
  })

  it("finds the Claude native installer's %USERPROFILE%\\.local\\bin\\claude.exe", async () => {
    const env = windowsEnv()
    const exe = await touch(join(root, '.local', 'bin', 'claude.exe'))
    const program = await locateSubscriptionProgram('claude-code', { env, platform: 'win32' })
    expect(program).toMatchObject({ command: exe, source: 'native-installer' })
  })

  it('finds a Codex that winget installed after the app started', async () => {
    const env = windowsEnv()
    const links = join(env.LOCALAPPDATA!, 'Microsoft', 'WinGet', 'Links')
    const exe = await touch(join(links, 'codex.exe'))
    expect((await locateSubscriptionProgram('codex', { env, platform: 'win32' }))?.command).toBe(
      exe,
    )
    await rm(links, { recursive: true })
    const packaged = await touch(
      join(
        env.LOCALAPPDATA!,
        'Microsoft',
        'WinGet',
        'Packages',
        'OpenAI.Codex_Microsoft.Winget.Source_8wekyb3d8bbwe',
        'codex-x86_64-pc-windows-msvc.exe',
      ),
    )
    const program = await locateSubscriptionProgram('codex', { env, platform: 'win32' })
    expect(program).toMatchObject({ command: packaged, source: 'winget' })
  })

  it("takes the CLI out of a winget package, never one of Codex's helper programs", async () => {
    const env = windowsEnv()
    const folder = join(
      env.LOCALAPPDATA!,
      'Microsoft',
      'WinGet',
      'Packages',
      'OpenAI.Codex_Microsoft.Winget.Source_8wekyb3d8bbwe',
    )
    // the archive also unpacks these next to the CLI
    await touch(join(folder, 'codex-code-mode-host.exe'))
    await touch(join(folder, 'codex-command-runner.exe'))
    await touch(join(folder, 'codex-windows-sandbox-setup.exe'))
    const cli = await touch(join(folder, 'codex-x86_64-pc-windows-msvc.exe'))
    const program = await locateSubscriptionProgram('codex', {
      env,
      platform: 'win32',
      arch: 'x64',
    })
    expect(program).toMatchObject({ command: cli, source: 'winget' })
    // the alias winget writes beside it is the CLI too, and comes first
    const alias = await touch(join(folder, 'codex.exe'))
    expect(
      (await locateSubscriptionProgram('codex', { env, platform: 'win32', arch: 'x64' }))?.command,
    ).toBe(alias)
  })

  it('finds no Codex when a winget package holds only its helper programs', async () => {
    const env = windowsEnv()
    const folder = join(
      env.LOCALAPPDATA!,
      'Microsoft',
      'WinGet',
      'Packages',
      'OpenAI.Codex_Microsoft.Winget.Source_8wekyb3d8bbwe',
    )
    await touch(join(folder, 'codex-code-mode-host.exe'))
    await touch(join(folder, 'codex-command-runner.exe'))
    expect(
      await locateSubscriptionProgram('codex', { env, platform: 'win32', arch: 'x64' }),
    ).toBeNull()
  })

  it('resolves a winget Links entry to the package file it points at', async () => {
    const env = windowsEnv()
    const folder = join(
      env.LOCALAPPDATA!,
      'Microsoft',
      'WinGet',
      'Packages',
      'OpenAI.Codex_Microsoft.Winget.Source_8wekyb3d8bbwe',
    )
    const target = await touch(join(folder, 'codex-x86_64-pc-windows-msvc.exe'))
    const links = join(env.LOCALAPPDATA!, 'Microsoft', 'WinGet', 'Links')
    await mkdir(links, { recursive: true })
    try {
      // winget's own aliases are symlinks into the package folder
      symlinkSync(target, join(links, 'codex.exe'), 'file')
    } catch {
      // a Windows account without the symlink privilege: nothing to resolve here
      return
    }
    const program = await locateSubscriptionProgram('codex', {
      env,
      platform: 'win32',
      arch: 'x64',
    })
    expect(program?.command).toBe(await realpath(target))
  })

  it('takes the newest complete Codex desktop install, as the existing lookup does', async () => {
    const env = windowsEnv()
    const managed = join(env.LOCALAPPDATA!, 'OpenAI', 'Codex', 'bin')
    await touch(join(managed, 'aaa', 'codex.exe'))
    const complete = await touch(join(managed, 'bbb', 'codex.exe'))
    await touch(join(managed, 'bbb', 'codex-code-mode-host.exe'))
    const program = await locateSubscriptionProgram('codex', { env, platform: 'win32' })
    expect(program).toMatchObject({ command: complete, source: 'managed' })
  })

  it('a PATH entry wins over the fallback locations', async () => {
    const onPath = await touch(join(root, 'tools', 'claude.exe'))
    await touch(join(root, '.local', 'bin', 'claude.exe'))
    const env = windowsEnv({ PATH: `${join(root, 'missing')};${join(root, 'tools')}` })
    const program = await locateSubscriptionProgram('claude-code', { env, platform: 'win32' })
    expect(program).toMatchObject({ command: onPath, source: 'path' })
  })
})

describe('PATH entries that are not full paths', () => {
  let startedIn: string

  beforeEach(() => {
    startedIn = process.cwd()
    // the folder the app was started in: a document's, when a file was double-clicked
    process.chdir(root)
  })

  afterEach(() => {
    process.chdir(startedIn)
  })

  it('never finds a program planted next to the document', async () => {
    await touch(join(root, 'claude.cmd'), CLAUDE_SHIM)
    await touch(join(root, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'))
    await touch(join(root, 'codex.exe'))
    await touch(join(root, 'tools', 'claude.exe'))
    await touch(join(root, 'tools', 'codex.exe'))
    for (const PATH of ['.', 'tools', `.${sep}tools`, ';.;', '"."', ` ;tools;.${sep}`]) {
      const env = windowsEnv({ PATH })
      for (const provider of ['claude-code', 'codex'] as const) {
        expect(await locateSubscriptionProgram(provider, { env, platform: 'win32' })).toBeNull()
        // a bare command name set by the user is searched in the same places
        const named = { env, platform: 'win32' as const, configuredPath: COMMAND_NAMES[provider] }
        expect(await locateSubscriptionProgram(provider, named)).toBeNull()
      }
    }
  })

  it('still finds the program in a full entry listed after them', async () => {
    await touch(join(root, 'codex.exe'))
    const real = await touch(join(root, 'tools', 'codex.exe'))
    const env = windowsEnv({ PATH: `.;tools;${join(root, 'tools')}` })
    const program = await locateSubscriptionProgram('codex', { env, platform: 'win32' })
    expect(program).toMatchObject({ command: real, source: 'path' })
  })

  // `\tools` is absolute to Node, yet Windows completes it from the drive of the working directory
  it.runIf(process.platform === 'win32')('skips an entry without a drive', async () => {
    await touch(join(root, 'tools', 'codex.exe'))
    const driveless = join(root, 'tools').replace(/^[A-Za-z]:/, '')
    expect(driveless.startsWith(sep)).toBe(true)
    const env = windowsEnv({ PATH: driveless })
    expect(await locateSubscriptionProgram('codex', { env, platform: 'win32' })).toBeNull()
  })

  it('applies elsewhere too', async () => {
    await chmod(await touch(join(root, 'tools', 'claude'), '#!/bin/sh\n'), 0o755)
    const program = await locateSubscriptionProgram('claude-code', {
      env: { HOME: root, PATH: ['.', 'tools', ''].join(delimiter) },
      platform: 'linux',
      commonDirs: [],
    })
    expect(program).toBeNull()
  })
})

describe('a user-configured path', () => {
  it('wins over everything found automatically', async () => {
    const env = windowsEnv()
    await touch(join(env.LOCALAPPDATA!, 'Microsoft', 'WinGet', 'Links', 'codex.exe'))
    const custom = await touch(join(root, 'custom', 'codex.exe'))
    const program = await locateSubscriptionProgram('codex', {
      env,
      platform: 'win32',
      configuredPath: `"${custom}"`,
    })
    expect(program).toMatchObject({ command: custom, source: 'configured' })
  })

  it('may be a directory, or the shim itself', async () => {
    const env = windowsEnv()
    const custom = await touch(join(root, 'custom', 'codex.exe'))
    const fromDir = await locateSubscriptionProgram('codex', {
      env,
      platform: 'win32',
      configuredPath: join(root, 'custom'),
    })
    expect(fromDir?.command).toBe(custom)

    const shim = await touch(join(root, 'prefix', 'claude.cmd'), CLAUDE_SHIM)
    const exe = await touch(
      join(root, 'prefix', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    )
    const fromShim = await locateSubscriptionProgram('claude-code', {
      env,
      platform: 'win32',
      configuredPath: shim,
    })
    expect(fromShim).toMatchObject({ command: exe, source: 'configured' })
  })

  it('that no longer exists falls back to the automatic lookup', async () => {
    const env = windowsEnv()
    const found = await touch(join(env.LOCALAPPDATA!, 'Microsoft', 'WinGet', 'Links', 'codex.exe'))
    const program = await locateSubscriptionProgram('codex', {
      env,
      platform: 'win32',
      configuredPath: join(root, 'gone', 'codex.exe'),
    })
    expect(program?.command).toBe(found)
  })

  it('inside the Codex desktop tree is treated as automatic, so an update is picked up', async () => {
    const env = windowsEnv()
    const managed = join(env.LOCALAPPDATA!, 'OpenAI', 'Codex', 'bin')
    const old = await touch(join(managed, 'old', 'codex.exe'))
    const fresh = await touch(join(managed, 'new', 'codex.exe'))
    await touch(join(managed, 'new', 'codex-code-mode-host.exe'))
    const program = await locateSubscriptionProgram('codex', {
      env,
      platform: 'win32',
      configuredPath: old,
    })
    expect(program).toMatchObject({ command: fresh, source: 'managed' })
  })

  it('given as a bare command name is looked up in the search locations', async () => {
    const exe = await touch(join(root, 'tools', 'codex-nightly.exe'))
    const env = windowsEnv({ PATH: join(root, 'tools') })
    const program = await locateSubscriptionProgram('codex', {
      env,
      platform: 'win32',
      configuredPath: 'codex-nightly',
    })
    expect(program).toMatchObject({ command: exe, source: 'configured' })
  })
})

describe('locateSubscriptionProgram elsewhere', () => {
  // POSIX lookups check the execute bit, which Windows file systems do not have
  it.skipIf(process.platform === 'win32')(
    'searches PATH and the common bin directories',
    async () => {
      const { chmod } = await import('node:fs/promises')
      const bin = await touch(join(root, '.local', 'bin', 'claude'), '#!/bin/sh\n')
      await chmod(bin, 0o755)
      const onPath = await locateSubscriptionProgram('claude-code', {
        env: { HOME: root, PATH: join(root, '.local', 'bin') },
        platform: process.platform,
        commonDirs: [],
      })
      expect(onPath).toMatchObject({ command: bin, prefixArgs: [], source: 'path' })
      // a GUI-launched app inherits a PATH without the user's bin directories
      const offPath = await locateSubscriptionProgram('claude-code', {
        env: { HOME: root, PATH: '' },
        platform: process.platform,
        commonDirs: [join(root, '.local', 'bin')],
      })
      expect(offPath).toMatchObject({ command: bin, prefixArgs: [] })
    },
  )

  it('finds nothing when the home directory has no install', async () => {
    const program = await locateSubscriptionProgram('claude-code', {
      env: { HOME: root, PATH: join(root, 'empty') },
      platform: 'linux',
      commonDirs: [],
    })
    expect(program).toBeNull()
  })
})

describe('locateSubscriptionProgram on macOS', () => {
  /** the CLI inside a desktop app bundle, at the path OpenAI documents */
  async function bundleCli(apps: string, app: string, at?: Date): Promise<string> {
    const path = await touch(
      join(apps, app, 'Contents', 'Resources', 'codex'),
      '#!/bin/sh\nexit 0\n',
    )
    await chmod(path, 0o755)
    if (at) await utimes(path, at, at)
    return path
  }

  it('uses the CLI bundled with the desktop app when it is the newer copy', async () => {
    const apps = join(root, 'Applications')
    const bundled = await bundleCli(apps, 'Codex.app', new Date('2026-10-20T00:00:00Z'))
    const onPath = await touch(join(root, 'bin', 'codex'), '#!/bin/sh\n')
    await chmod(onPath, 0o755)
    await utimes(onPath, new Date('2026-10-01T00:00:00Z'), new Date('2026-10-01T00:00:00Z'))
    const program = await locateSubscriptionProgram('codex', {
      env: { HOME: root, PATH: join(root, 'bin') },
      platform: 'darwin',
      applicationDirs: [apps],
      commonDirs: [],
    })
    expect(program).toMatchObject({ command: bundled, prefixArgs: [], source: 'managed' })
  })

  it('keeps the PATH CLI when the user updated it after the desktop app', async () => {
    const apps = join(root, 'Applications')
    await bundleCli(apps, 'Codex.app', new Date('2026-10-01T00:00:00Z'))
    const onPath = await touch(join(root, 'bin', 'codex'), '#!/bin/sh\n')
    await chmod(onPath, 0o755)
    await utimes(onPath, new Date('2026-10-20T00:00:00Z'), new Date('2026-10-20T00:00:00Z'))
    const program = await locateSubscriptionProgram('codex', {
      env: { HOME: root, PATH: join(root, 'bin') },
      platform: 'darwin',
      applicationDirs: [apps],
      commonDirs: [],
    })
    expect(program).toMatchObject({ command: onPath, source: 'path' })
  })

  it('takes the newest desktop app when both bundles are present', async () => {
    const apps = join(root, 'Applications')
    await bundleCli(apps, 'Codex.app', new Date('2026-10-01T00:00:00Z'))
    const fresh = await bundleCli(apps, 'ChatGPT.app', new Date('2026-10-20T00:00:00Z'))
    const program = await locateSubscriptionProgram('codex', {
      env: { HOME: root, PATH: '' },
      platform: 'darwin',
      applicationDirs: [apps],
      commonDirs: [],
    })
    expect(program).toMatchObject({ command: fresh, source: 'managed' })
  })

  it('falls back to PATH when no desktop app carries a CLI', async () => {
    const onPath = await touch(join(root, 'bin', 'codex'), '#!/bin/sh\n')
    await chmod(onPath, 0o755)
    const program = await locateSubscriptionProgram('codex', {
      env: { HOME: root, PATH: join(root, 'bin') },
      platform: 'darwin',
      applicationDirs: [join(root, 'Applications')],
      commonDirs: [],
    })
    expect(program).toMatchObject({ command: onPath, source: 'path' })
  })

  it('does not give Claude Code the Codex desktop bundle', async () => {
    const apps = join(root, 'Applications')
    await bundleCli(apps, 'Codex.app')
    const onPath = await touch(join(root, 'bin', 'claude'), '#!/bin/sh\n')
    await chmod(onPath, 0o755)
    const program = await locateSubscriptionProgram('claude-code', {
      env: { HOME: root, PATH: join(root, 'bin') },
      platform: 'darwin',
      applicationDirs: [apps],
      commonDirs: [],
    })
    expect(program).toMatchObject({ command: onPath, source: 'path' })
  })
})

describe('resolveSubscriptionProgram', () => {
  it('reports a missing program as a not-installed run error for that provider', async () => {
    const attempt = resolveSubscriptionProgram('codex', { env: windowsEnv(), platform: 'win32' })
    await expect(attempt).rejects.toBeInstanceOf(AiRunError)
    await expect(attempt).rejects.toMatchObject({ kind: 'not-installed', provider: 'codex' })
  })
})
