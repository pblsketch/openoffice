/**
 * The two things a user can start from a provider that is not connected: the
 * CLI's own login, and the vendor's install command. Both open a terminal
 * window of their own and belong to the vendor from there on; the app only
 * learns the outcome from the next status check.
 *
 * And the one a user can start from a provider that is: the CLI's own logout,
 * a short command that needs no window. Signing in with another account is the
 * same login as above, run again.
 *
 * Node cannot give a child process a console window of its own on Windows (a
 * detached child gets no console at all), so both go through a system program
 * that can: `Start-Process` for the login, `start` for the install command.
 */
import { spawn as nodeSpawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { isSubscriptionProvider } from '../provider-selection'
import type { AiSubscriptionProviderId } from '../types'
import {
  SUBSCRIPTION_INSTALL_COMMANDS,
  SUBSCRIPTION_INSTALL_URLS,
  type SubscriptionLaunchResult,
} from './contract'
import { subscriptionChildEnv } from './env'
import {
  locateSubscriptionProgram,
  type SubscriptionLocator,
  type SubscriptionProgram,
} from './locate'
import {
  killProcessTree,
  runSubscriptionProgram,
  sharedSubscriptionChildRegistry,
  spawnSubscriptionProgram,
  windowsSystemDir,
  windowsSystemTool,
  type SubscriptionChildLike,
  type SubscriptionChildRegistry,
  type SubscriptionRunner,
  type SubscriptionSpawn,
} from './process'

/** The CLI's own sign-in command */
const LOGIN_ARGS: Record<AiSubscriptionProviderId, string[]> = {
  'claude-code': ['auth', 'login'],
  codex: ['login'],
}

/** The CLI's own sign-out command */
const LOGOUT_ARGS: Record<AiSubscriptionProviderId, string[]> = {
  'claude-code': ['auth', 'logout'],
  codex: ['logout'],
}

/** A logout that has not finished by then is given up and its program ended */
export const SUBSCRIPTION_LOGOUT_TIMEOUT_MS = 20_000

const loginChangeListeners = new Set<(provider: AiSubscriptionProviderId) => void>()

/**
 * Be told when the app ran a CLI's login or logout to its end. A process
 * started before that may still hold the login it started with, so a bridge
 * that keeps one running listens here. Returns a function that stops the listening.
 */
export function onSubscriptionLoginChange(
  listener: (provider: AiSubscriptionProviderId) => void,
): () => void {
  loginChangeListeners.add(listener)
  return () => loginChangeListeners.delete(listener)
}

/** Tell the listeners of `onSubscriptionLoginChange`; one that throws does not stop the others */
export function notifySubscriptionLoginChange(provider: AiSubscriptionProviderId): void {
  for (const listener of [...loginChangeListeners]) {
    try {
      listener(provider)
    } catch {
      /* keep telling the others */
    }
  }
}

/** Carry the program and its arguments to the login window script as data */
export const SUBSCRIPTION_LOGIN_EXE_ENV = 'GENOFFICE_SUBSCRIPTION_LOGIN_EXE'
export const SUBSCRIPTION_LOGIN_ARGS_ENV = 'GENOFFICE_SUBSCRIPTION_LOGIN_ARGS'

/**
 * Opens the login program in a console window of its own and waits for it.
 * A constant: the program path and its arguments arrive in two environment
 * variables and are handed to `Start-Process` as values, so nothing the user
 * configured is ever read as PowerShell code. The two variables are removed
 * before the program starts.
 */
function loginWindowScript(windowStyle: 'Normal' | 'Hidden'): string {
  return [
    `$exe = $env:${SUBSCRIPTION_LOGIN_EXE_ENV}`,
    `$arguments = $env:${SUBSCRIPTION_LOGIN_ARGS_ENV} -split "\`n"`,
    `Remove-Item Env:${SUBSCRIPTION_LOGIN_EXE_ENV}, Env:${SUBSCRIPTION_LOGIN_ARGS_ENV}`,
    `Start-Process -FilePath $exe -ArgumentList $arguments -WindowStyle ${windowStyle} -Wait`,
  ].join('; ')
}

/** Carry the visible window's own words to its script as data (`SubscriptionLoginWindowText`) */
export const SUBSCRIPTION_LOGIN_TITLE_ENV = 'GENOFFICE_SUBSCRIPTION_LOGIN_TITLE'
export const SUBSCRIPTION_LOGIN_GUIDE_ENV = 'GENOFFICE_SUBSCRIPTION_LOGIN_GUIDE'
export const SUBSCRIPTION_LOGIN_CLOSING_ENV = 'GENOFFICE_SUBSCRIPTION_LOGIN_CLOSING'

const LOGIN_WINDOW_ENVS = [
  SUBSCRIPTION_LOGIN_EXE_ENV,
  SUBSCRIPTION_LOGIN_ARGS_ENV,
  SUBSCRIPTION_LOGIN_TITLE_ENV,
  SUBSCRIPTION_LOGIN_GUIDE_ENV,
  SUBSCRIPTION_LOGIN_CLOSING_ENV,
]

/**
 * What runs in the console window the user sees. A second PowerShell owns that
 * console: it names the window, prints the guide in the app's language, runs
 * the CLI in the same console (so the CLI still reads what the user pastes)
 * and, when the CLI ends without signing in, keeps the window open until Enter
 * so what the CLI printed can still be read. A constant like the hidden one:
 * every value arrives in an environment variable, and all of them are removed
 * before the CLI starts.
 *
 * `Start-Process` passes its argument list on joined with spaces and the new
 * PowerShell joins its arguments back into one command, so this text must not
 * hold a double quote.
 */
const LOGIN_GUIDED_SCRIPT = [
  `$exe = $env:${SUBSCRIPTION_LOGIN_EXE_ENV}`,
  `$arguments = $env:${SUBSCRIPTION_LOGIN_ARGS_ENV} -split [char]10`,
  `$title = $env:${SUBSCRIPTION_LOGIN_TITLE_ENV}`,
  `$guide = $env:${SUBSCRIPTION_LOGIN_GUIDE_ENV}`,
  `$closing = $env:${SUBSCRIPTION_LOGIN_CLOSING_ENV}`,
  `Remove-Item ${LOGIN_WINDOW_ENVS.map((name) => `Env:${name}`).join(', ')} -ErrorAction SilentlyContinue`,
  `if ($title) { $Host.UI.RawUI.WindowTitle = $title }`,
  `if ($guide) { Write-Host -Object $guide; Write-Host }`,
  `$login = Start-Process -FilePath $exe -ArgumentList $arguments -NoNewWindow -Wait -PassThru`,
  `if ($login.ExitCode -ne 0 -and $closing) { Write-Host; Write-Host -Object $closing; [void][Console]::ReadLine() }`,
].join('; ')

/** The login in a console window the user sees, with the app's guide above what the CLI prints */
const LOGIN_WINDOW_SCRIPT = [
  `$guided = '${LOGIN_GUIDED_SCRIPT.replace(/'/g, "''")}'`,
  `Start-Process -FilePath "$PSHOME\\powershell.exe" -ArgumentList '-NoProfile', '-NoLogo', '-Command', $guided -WindowStyle Normal -Wait`,
].join('; ')

/**
 * The login in a console of its own that is never shown: the CLI still has a
 * real console, opens the browser itself and takes the sign-in back from it.
 * Only a code to paste needs the window; the visible login is for that.
 */
const LOGIN_HIDDEN_SCRIPT = loginWindowScript('Hidden')

/** `Start-Process` joins its argument list with spaces, so an argument with a space is quoted here */
function quoteWindowsArgument(argument: string): string {
  if (!/[\s"]/.test(argument)) return argument
  return `"${argument.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`
}

/** How long a child without a pid is given to say why it did not start */
const START_FAILURE_WAIT_MS = 300

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Null when the child started; the reason when it did not */
function startFailure(child: SubscriptionChildLike): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (failure: string | null): void => {
      if (settled) return
      settled = true
      resolve(failure)
    }
    // a later error (the window was closed, the program crashed) is not a failed start
    child.once('error', (error: unknown) => settle(message(error)))
    if (child.pid !== undefined) {
      settle(null)
      return
    }
    const timer = setTimeout(
      () => settle('The program could not be started'),
      START_FAILURE_WAIT_MS,
    )
    timer.unref?.()
  })
}

/** The visible login window's own words, in the app's language. Each one is optional. */
export interface SubscriptionLoginWindowText {
  /** the window's title */
  title?: string | undefined
  /** printed above what the CLI prints */
  guide?: string | undefined
  /** printed when the CLI ended without signing in; the window then waits for Enter */
  closing?: string | undefined
}

export interface SubscriptionLoginOptions {
  /** the user's own path to the CLI (the Codex `cliPath` setting) */
  configuredPath?: string | undefined
  /** called once when the login has ended, however it ended */
  onExit?: (() => void) | undefined
  /**
   * Windows: `hidden` runs the CLI's login without showing its window (the user
   * signs in in the browser it opens); `visible`, the default, shows the window,
   * where a code the browser hands back can be pasted.
   */
  window?: 'hidden' | 'visible' | undefined
  /** Windows, `visible` only: what the window says besides what the CLI prints */
  windowText?: SubscriptionLoginWindowText | undefined
  /** called once the login has started, with a way to end it (its window and the CLI in it) */
  onStarted?: ((stop: () => void) => void) | undefined
  /** stand-in for tests: how `stop` ends the login's process tree (`killProcessTree` when absent) */
  killTree?: ((child: SubscriptionChildLike) => void) | undefined
  locate?: SubscriptionLocator | undefined
  spawn?: SubscriptionSpawn | undefined
  platform?: NodeJS.Platform | undefined
  baseEnv?: NodeJS.ProcessEnv | undefined
  /** where the login is registered for shutdown; the shared registry when absent, null for none */
  registry?: SubscriptionChildRegistry | null | undefined
}

/** The window's words as the variables its script reads; an empty one is left out */
function windowTextEnv(text: SubscriptionLoginWindowText | undefined): Record<string, string> {
  const env: Record<string, string> = {}
  if (text?.title) env[SUBSCRIPTION_LOGIN_TITLE_ENV] = text.title
  if (text?.guide) env[SUBSCRIPTION_LOGIN_GUIDE_ENV] = text.guide
  if (text?.closing) env[SUBSCRIPTION_LOGIN_CLOSING_ENV] = text.closing
  return env
}

function startLogin(
  program: SubscriptionProgram,
  options: SubscriptionLoginOptions,
): SubscriptionChildLike {
  const platform = options.platform ?? process.platform
  const args = LOGIN_ARGS[program.provider]
  if (platform !== 'win32') {
    // the CLI opens the browser itself; there is no terminal to show
    return spawnSubscriptionProgram(program, args, {
      // not the folder the app was started in: no project-level configuration of it applies
      cwd: tmpdir(),
      stdio: 'ignore',
      platform,
      baseEnv: options.baseEnv,
      spawn: options.spawn,
      registry: options.registry,
    })
  }
  const env = subscriptionChildEnv({
    base: options.baseEnv,
    platform,
    command: program.command,
    extra: {
      ...program.env,
      [SUBSCRIPTION_LOGIN_EXE_ENV]: program.command,
      [SUBSCRIPTION_LOGIN_ARGS_ENV]: [...program.prefixArgs, ...args]
        .map(quoteWindowsArgument)
        .join('\n'),
      ...(options.window === 'hidden' ? {} : windowTextEnv(options.windowText)),
    },
  })
  const spawn = options.spawn ?? nodeSpawn
  const launcher = windowsSystemTool(env, 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const child = spawn(
    launcher,
    [
      '-NoProfile',
      '-NonInteractive',
      '-NoLogo',
      '-WindowStyle',
      'Hidden',
      '-Command',
      options.window === 'hidden' ? LOGIN_HIDDEN_SCRIPT : LOGIN_WINDOW_SCRIPT,
    ],
    // the login program inherits this directory, not the folder the app was started in
    { cwd: windowsSystemDir(env), env, stdio: 'ignore', windowsHide: true },
  )
  // The login program is a child of this launcher, so ending the launcher's tree ends it.
  // The launcher is what gets recorded: it is the process whose pid the app holds.
  const registry =
    options.registry === undefined ? sharedSubscriptionChildRegistry() : options.registry
  registry?.track(child, { provider: program.provider, command: launcher })
  return child
}

/**
 * Start the CLI's own login (`claude auth login`, `codex login`) with the
 * sanitised environment. On Windows it runs in a console of its own: hidden
 * (`window: 'hidden'`), where the user signs in in the browser the CLI opens,
 * or shown, where the vendor's flow prints its link and takes a pasted code
 * below the app's guide (`windowText`); elsewhere the flow runs in the browser
 * the CLI opens. The app shows no login form and never sees the code or the
 * credentials: what the user pastes goes to the CLI, not through the app. A
 * window the user closes without signing in simply leaves the provider
 * `signed-out`.
 */
export async function launchSubscriptionLogin(
  provider: AiSubscriptionProviderId,
  options: SubscriptionLoginOptions = {},
): Promise<SubscriptionLaunchResult> {
  if (!isSubscriptionProvider(provider)) return { ok: false, reason: 'invalid' }
  let program
  try {
    program = await (options.locate ?? locateSubscriptionProgram)(provider, {
      configuredPath: options.configuredPath,
    })
  } catch (error) {
    return { ok: false, reason: 'failed', error: message(error) }
  }
  if (!program) {
    return { ok: false, reason: 'not-installed', installUrl: SUBSCRIPTION_INSTALL_URLS[provider] }
  }
  try {
    const child = startLogin(program, options)
    const failure = await startFailure(child)
    if (failure) return { ok: false, reason: 'failed', error: failure }
    // whoever is signed in now, it may not be who was before
    child.once('exit', () => notifySubscriptionLoginChange(provider))
    if (options.onExit) child.once('exit', options.onExit)
    child.unref?.()
    // the launcher's tree holds the CLI, so ending the tree ends the login
    const killTree = options.killTree ?? ((tree) => killProcessTree(tree, { force: true }))
    options.onStarted?.(() => killTree(child))
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: 'failed', error: message(error) }
  }
}

export interface SubscriptionLogoutOptions {
  /** the user's own path to the CLI (the Codex `cliPath` setting) */
  configuredPath?: string | undefined
  timeoutMs?: number | undefined
  locate?: SubscriptionLocator | undefined
  /** runs the command to its end; `runSubscriptionProgram` when absent */
  run?: SubscriptionRunner | undefined
  spawn?: SubscriptionSpawn | undefined
  baseEnv?: NodeJS.ProcessEnv | undefined
}

/**
 * Run the CLI's own logout (`claude auth logout`, `codex logout`) to its end:
 * the located file, an argument list, the sanitised environment, no shell, no
 * window, and a bounded time. The app removes nothing itself and never sees
 * the login; what the command did shows in the next status check.
 *
 * The logout is the CLI's, for the whole PC: a terminal using the same program
 * is signed out with it. Asking the user first is the caller's part.
 */
export async function launchSubscriptionLogout(
  provider: AiSubscriptionProviderId,
  options: SubscriptionLogoutOptions = {},
): Promise<SubscriptionLaunchResult> {
  if (!isSubscriptionProvider(provider)) return { ok: false, reason: 'invalid' }
  let program
  try {
    program = await (options.locate ?? locateSubscriptionProgram)(provider, {
      configuredPath: options.configuredPath,
    })
  } catch (error) {
    return { ok: false, reason: 'failed', error: message(error) }
  }
  if (!program) {
    return { ok: false, reason: 'not-installed', installUrl: SUBSCRIPTION_INSTALL_URLS[provider] }
  }
  try {
    const result = await (options.run ?? runSubscriptionProgram)(program, LOGOUT_ARGS[provider], {
      signal: new AbortController().signal,
      timeoutMs: options.timeoutMs ?? SUBSCRIPTION_LOGOUT_TIMEOUT_MS,
      baseEnv: options.baseEnv,
      spawn: options.spawn,
    })
    // what the CLI printed stays here: it may name the account
    return result.code === 0 ? { ok: true } : { ok: false, reason: 'failed' }
  } catch (error) {
    return { ok: false, reason: 'failed', error: message(error) }
  } finally {
    // run to its end or not, the login may no longer be the one a running process holds
    notifySubscriptionLoginChange(provider)
  }
}

/**
 * The command line of the install window: `start` opens a new console, and the
 * PowerShell in it runs the vendor command and stays open. Built only from the
 * constant in `SUBSCRIPTION_INSTALL_COMMANDS` and the full path of PowerShell
 * in the system directory: `start` looks for a bare program name in the working
 * directory before anywhere else.
 */
export function subscriptionInstallCommandLine(
  provider: AiSubscriptionProviderId,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const powershell = windowsSystemTool(env, 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return `start "" "${powershell}" -NoLogo -NoExit -Command "${SUBSCRIPTION_INSTALL_COMMANDS[provider]}"`
}

export interface SubscriptionInstallOptions {
  spawn?: SubscriptionSpawn | undefined
  platform?: NodeJS.Platform | undefined
  env?: NodeJS.ProcessEnv | undefined
}

/**
 * Run the vendor's install command in a new, visible terminal window that
 * stays open, so the user sees it work or fail. This is the one place a shell
 * interprets a command line, and the line is a constant: it is looked up by
 * provider id and contains no setting, path or other outside text.
 *
 * The app downloads nothing itself and does not wait for the installer. If the
 * command fails (no winget, no network) the provider simply stays
 * `not-installed`; `installUrl` is where to install by hand. The commands are
 * Windows ones: other systems get `unsupported` and the same link.
 */
export async function launchSubscriptionInstall(
  provider: AiSubscriptionProviderId,
  options: SubscriptionInstallOptions = {},
): Promise<SubscriptionLaunchResult> {
  if (!isSubscriptionProvider(provider)) return { ok: false, reason: 'invalid' }
  const installUrl = SUBSCRIPTION_INSTALL_URLS[provider]
  if ((options.platform ?? process.platform) !== 'win32') {
    return { ok: false, reason: 'unsupported', installUrl }
  }
  const env = options.env ?? process.env
  try {
    const spawn = options.spawn ?? nodeSpawn
    const child = spawn(subscriptionInstallCommandLine(provider, env), [], {
      // the installer starts in the system directory, not the folder the app was started in
      cwd: windowsSystemDir(env),
      env,
      // cmd.exe by full path; it exits as soon as `start` has opened the window
      shell: windowsSystemTool(env, 'cmd.exe'),
      stdio: 'ignore',
      windowsHide: true,
    })
    const failure = await startFailure(child)
    if (failure) return { ok: false, reason: 'failed', error: failure, installUrl }
    // the installer window is the user's: it is not tracked and not ended with the app
    child.unref?.()
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: 'failed', error: message(error), installUrl }
  }
}

/** Carry the program and its arguments to the update window as data, like the login's */
export const SUBSCRIPTION_UPDATE_EXE_ENV = 'GENOFFICE_SUBSCRIPTION_UPDATE_EXE'
export const SUBSCRIPTION_UPDATE_ARGS_ENV = 'GENOFFICE_SUBSCRIPTION_UPDATE_ARGS'

/** The package manager commands that bring a Codex install up to date, by where it came from */
export const SUBSCRIPTION_CODEX_UPDATE_COMMANDS = {
  npm: 'npm install -g @openai/codex@latest',
  winget: 'winget upgrade --id OpenAI.Codex -e',
} as const

/**
 * How the CLI the app found is brought up to date: the program's own update
 * command (`program`, run as the located file, never by name, since a PC can
 * hold another copy the name finds first), or the fixed command of the package
 * manager that installed it (`command`). Null when the app cannot tell how it
 * was installed (the Codex desktop app's copy, a path the user set to some
 * other place, a winget link that cannot be resolved to its package): the
 * vendor's install page is the way then.
 */
export type SubscriptionUpdatePlan =
  { kind: 'program'; args: string[] } | { kind: 'command'; command: string }

const NPM_CODEX = /[\\/]node_modules[\\/]@openai[\\/]codex/i
/** the package folder winget makes for OpenAI.Codex, in the user or machine root */
const WINGET_CODEX_PACKAGE = /[\\/]microsoft[\\/]winget[\\/]packages[\\/]openai\.codex_/i

export function subscriptionUpdatePlan(
  program: SubscriptionProgram,
): SubscriptionUpdatePlan | null {
  // `claude update` updates a native install and an npm one alike
  if (program.provider === 'claude-code') return { kind: 'program', args: ['update'] }
  const paths = [program.entry, program.command]
  if (paths.some((path) => NPM_CODEX.test(path))) {
    return { kind: 'command', command: SUBSCRIPTION_CODEX_UPDATE_COMMANDS.npm }
  }
  // A Links entry alone does not say which package owns the alias; the locator
  // resolves it to the package file before this runs
  if (paths.some((path) => WINGET_CODEX_PACKAGE.test(path))) {
    return { kind: 'command', command: SUBSCRIPTION_CODEX_UPDATE_COMMANDS.winget }
  }
  return null
}

/**
 * Runs the located program with its update arguments and leaves the window
 * open. A constant, like the login's: the path and the arguments arrive in two
 * environment variables and are removed before the program starts. The
 * arguments are split on a line feed written as `[char]10`, since a quote
 * would end the command line `start` is given.
 */
const UPDATE_PROGRAM_SCRIPT = [
  `$exe = $env:${SUBSCRIPTION_UPDATE_EXE_ENV}`,
  `$arguments = $env:${SUBSCRIPTION_UPDATE_ARGS_ENV} -split [char]10`,
  `Remove-Item Env:${SUBSCRIPTION_UPDATE_EXE_ENV}, Env:${SUBSCRIPTION_UPDATE_ARGS_ENV}`,
  `& $exe @arguments`,
].join('; ')

/**
 * The command line of the update window, like the install window's: `start`
 * opens a new console whose PowerShell runs the update and stays open. Built
 * only from constants and the full path of PowerShell in the system directory.
 */
export function subscriptionUpdateCommandLine(
  plan: SubscriptionUpdatePlan,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const powershell = windowsSystemTool(env, 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const command = plan.kind === 'program' ? UPDATE_PROGRAM_SCRIPT : plan.command
  return `start "" "${powershell}" -NoLogo -NoExit -Command "${command}"`
}

export interface SubscriptionUpdateOptions extends SubscriptionInstallOptions {
  /** the user's own path to the CLI (the Codex `cliPath` setting) */
  configuredPath?: string | undefined
  locate?: SubscriptionLocator | undefined
}

/**
 * Bring the CLI the app runs up to date, in a new, visible terminal window
 * that stays open so the user sees it work or fail. Like the install, the
 * shell is given a constant line; the program's path travels as a value.
 *
 * The app does not wait: the next status check (the window regains focus, or
 * "check again") shows the new version. Windows only, like the install.
 */
export async function launchSubscriptionUpdate(
  provider: AiSubscriptionProviderId,
  options: SubscriptionUpdateOptions = {},
): Promise<SubscriptionLaunchResult> {
  if (!isSubscriptionProvider(provider)) return { ok: false, reason: 'invalid' }
  const installUrl = SUBSCRIPTION_INSTALL_URLS[provider]
  const platform = options.platform ?? process.platform
  if (platform !== 'win32') return { ok: false, reason: 'unsupported', installUrl }
  let program
  try {
    program = await (options.locate ?? locateSubscriptionProgram)(provider, {
      configuredPath: options.configuredPath,
    })
  } catch (error) {
    return { ok: false, reason: 'failed', error: message(error), installUrl }
  }
  if (!program) return { ok: false, reason: 'not-installed', installUrl }
  const plan = subscriptionUpdatePlan(program)
  if (!plan) return { ok: false, reason: 'unsupported', installUrl }
  const base = options.env ?? process.env
  const env =
    plan.kind === 'program'
      ? subscriptionChildEnv({
          base,
          platform,
          command: program.command,
          extra: {
            ...program.env,
            [SUBSCRIPTION_UPDATE_EXE_ENV]: program.command,
            [SUBSCRIPTION_UPDATE_ARGS_ENV]: [...program.prefixArgs, ...plan.args].join('\n'),
          },
        })
      : base
  try {
    const spawn = options.spawn ?? nodeSpawn
    const child = spawn(subscriptionUpdateCommandLine(plan, env), [], {
      // the update starts in the system directory, not the folder the app was started in
      cwd: windowsSystemDir(env),
      env,
      shell: windowsSystemTool(env, 'cmd.exe'),
      stdio: 'ignore',
      windowsHide: true,
    })
    const failure = await startFailure(child)
    if (failure) return { ok: false, reason: 'failed', error: failure, installUrl }
    // the update window is the user's, like the installer's
    child.unref?.()
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: 'failed', error: message(error), installUrl }
  }
}
