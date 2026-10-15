import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, delimiter, dirname, isAbsolute, join } from 'node:path'

/**
 * Finder and the Dock start a macOS app with a short PATH (`/usr/bin:/bin:…`).
 * Claude Code and Codex are then invisible when they live in Homebrew, a
 * user-local prefix, or an npm global bin. The login shell is asked only for
 * its PATH (a fixed printf, no document text) and the result is merged with
 * the directories those installers use. The CLIs themselves are still spawned
 * by absolute path, never through a shell.
 */
const LOGIN_PATH_MARK = '_IEUM_LOGIN_PATH_'
const SHELL_NAMES = new Set(['zsh', 'bash', 'sh'])
const SHELL_DIRS = new Set(['/bin', '/usr/bin', '/usr/local/bin', '/opt/homebrew/bin'])

/** A login shell we are willing to execute. Anything else is ignored. */
export function allowedLoginShell(shell: string | undefined): string | null {
  if (!shell || !isAbsolute(shell) || shell.split(/[/\\]/).includes('..')) return null
  if (!SHELL_NAMES.has(basename(shell)) || !SHELL_DIRS.has(dirname(shell))) return null
  return shell
}

/** Directories included even when the login shell does not list them. */
export function macCliBinDirs(home: string): string[] {
  const dirs = ['/opt/homebrew/bin', '/usr/local/bin']
  if (home) dirs.push(join(home, '.local', 'bin'), join(home, '.npm-global', 'bin'))
  return dirs
}

/** Absolute PATH entries between the markers. Relative entries and newlines are dropped. */
export function parseLoginShellPath(output: string): string[] {
  const start = output.indexOf(LOGIN_PATH_MARK)
  if (start < 0) return []
  const rest = output.slice(start + LOGIN_PATH_MARK.length)
  const end = rest.indexOf(LOGIN_PATH_MARK)
  if (end < 0) return []
  return rest
    .slice(0, end)
    .split(':')
    .map((dir) => dir.trim())
    .filter((dir) => isAbsolute(dir) && !/[\0\r\n]/.test(dir))
}

/** `extras` first, then `current`, without duplicates or relative entries. */
export function mergeGuiPath(current: string | undefined, extras: readonly string[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of [...extras, ...(current ?? '').split(delimiter)]) {
    const dir = part.trim()
    if (!dir || !isAbsolute(dir) || /[\0\r\n]/.test(dir) || seen.has(dir)) continue
    seen.add(dir)
    out.push(dir)
  }
  return out.join(delimiter)
}

export function resolveMacGuiPath(input: {
  platform: NodeJS.Platform
  home: string
  currentPath: string | undefined
  loginShellOutput: string | null
}): string | null {
  if (input.platform !== 'darwin') return null
  const login = input.loginShellOutput ? parseLoginShellPath(input.loginShellOutput) : []
  return mergeGuiPath(input.currentPath, [...login, ...macCliBinDirs(input.home)])
}

/** Run the user's login shell and return its stdout, or null when it fails. */
export function readLoginShellPath(shell: string): string | null {
  const result = spawnSync(
    shell,
    ['-ilc', `printf '%s' '${LOGIN_PATH_MARK}'"$PATH"'${LOGIN_PATH_MARK}'`],
    {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  )
  if (result.error && !result.stdout) return null
  return typeof result.stdout === 'string' ? result.stdout : null
}

/**
 * On macOS, replace `process.env.PATH` with the login-shell PATH plus the
 * usual CLI directories. No-op on other platforms. Never throws.
 */
export function installMacGuiPath(
  read: (shell: string) => string | null = readLoginShellPath,
): void {
  if (process.platform !== 'darwin') return
  const shell = allowedLoginShell(process.env.SHELL) ?? '/bin/zsh'
  let output: string | null
  try {
    output = read(shell)
  } catch {
    output = null
  }
  const next = resolveMacGuiPath({
    platform: 'darwin',
    home: process.env.HOME || homedir(),
    currentPath: process.env.PATH,
    loginShellOutput: output,
  })
  if (next) process.env.PATH = next
}
