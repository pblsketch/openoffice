import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  allowedLoginShell,
  installMacGuiPath,
  macCliBinDirs,
  parseLoginShellPath,
  resolveMacGuiPath,
} from '../src/main/gui-path'

const MARKED = (path: string) => `_IEUM_LOGIN_PATH_${path}_IEUM_LOGIN_PATH_`

describe('macOS Finder PATH', () => {
  it('keeps only absolute entries between the login-shell markers', () => {
    expect(
      parseLoginShellPath(
        `last login\n${MARKED('./evil:/opt/homebrew/bin:/tmp/bad\n/bin:/usr/local/bin')}\nbye`,
      ),
    ).toEqual(['/opt/homebrew/bin', '/usr/local/bin'])
    expect(parseLoginShellPath('no markers')).toEqual([])
    expect(parseLoginShellPath('_IEUM_LOGIN_PATH_/usr/bin')).toEqual([])
  })

  it('lists the install directories a Finder launch would otherwise miss', () => {
    expect(macCliBinDirs('/Users/example')).toEqual([
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/Users/example/.local/bin',
      '/Users/example/.npm-global/bin',
    ])
    expect(macCliBinDirs('')).toEqual(['/opt/homebrew/bin', '/usr/local/bin'])
  })

  it('accepts only a system or Homebrew login shell', () => {
    expect(allowedLoginShell('/bin/zsh')).toBe('/bin/zsh')
    expect(allowedLoginShell('/opt/homebrew/bin/bash')).toBe('/opt/homebrew/bin/bash')
    expect(allowedLoginShell('/tmp/evil.sh')).toBeNull()
    expect(allowedLoginShell('/bin/zsh/../../tmp/sh')).toBeNull()
    expect(allowedLoginShell('zsh')).toBeNull()
    expect(allowedLoginShell(undefined)).toBeNull()
  })

  it('puts the login-shell PATH ahead of the Finder PATH and the usual bins', () => {
    expect(
      resolveMacGuiPath({
        platform: 'darwin',
        home: '/Users/example',
        currentPath: '/usr/bin:/bin',
        loginShellOutput: MARKED('/Users/example/.fnm/bin:/opt/homebrew/bin'),
      }),
    ).toBe(
      [
        '/Users/example/.fnm/bin',
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/Users/example/.local/bin',
        '/Users/example/.npm-global/bin',
        '/usr/bin',
        '/bin',
      ].join(':'),
    )
    expect(
      resolveMacGuiPath({
        platform: 'linux',
        home: '/Users/example',
        currentPath: '/usr/bin',
        loginShellOutput: MARKED('/opt/homebrew/bin'),
      }),
    ).toBeNull()
  })

  it('still adds the usual bins when the login shell prints nothing usable', () => {
    expect(
      resolveMacGuiPath({
        platform: 'darwin',
        home: '/Users/example',
        currentPath: '/usr/bin:/bin',
        loginShellOutput: 'motd only',
      }),
    ).toBe(
      [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/Users/example/.local/bin',
        '/Users/example/.npm-global/bin',
        '/usr/bin',
        '/bin',
      ].join(':'),
    )
  })

  it('does not run a login shell on other platforms', () => {
    if (process.platform === 'darwin') return
    const before = process.env.PATH
    installMacGuiPath(() => {
      throw new Error('login shell must not run')
    })
    expect(process.env.PATH).toBe(before)
  })

  it('merges a provided login-shell PATH on macOS and restores nothing else', () => {
    if (process.platform !== 'darwin') return
    const previousPath = process.env.PATH
    const previousHome = process.env.HOME
    process.env.HOME = '/Users/example'
    process.env.PATH = '/usr/bin:/bin'
    try {
      installMacGuiPath(() => MARKED('/Users/example/.fnm/bin'))
      expect(process.env.PATH?.startsWith('/Users/example/.fnm/bin:')).toBe(true)
      expect(process.env.PATH).toContain('/opt/homebrew/bin')
      expect(process.env.PATH).toContain('/Users/example/.npm-global/bin')
    } finally {
      process.env.PATH = previousPath
      if (previousHome === undefined) delete process.env.HOME
      else process.env.HOME = previousHome
    }
  })

  it('is installed in the shell before the app is ready', () => {
    const source = readFileSync(join(import.meta.dirname, '../src/main/index.ts'), 'utf8')
    const call = source.indexOf('installMacGuiPath()')
    expect(call).toBeGreaterThan(0)
    expect(call).toBeLessThan(source.indexOf('app.whenReady()'))
  })
})
