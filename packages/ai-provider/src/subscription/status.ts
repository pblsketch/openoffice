/**
 * Reading the connection status of a subscription CLI from what the CLI itself
 * reports. Everything here is asynchronous, so a slow CLI never freezes the UI,
 * and both providers are asked at the same time.
 *
 * The CLIs also report who is signed in (email, organisation), and their output
 * is not always in the expected shape. So no text of a CLI is ever copied into
 * a result. The output is only matched against values this file lists: a kind
 * of login is one of `SUBSCRIPTION_LOGIN_KINDS`, an error text is a sentence
 * written here plus facts the code derived itself (exit code, version number),
 * and anything unrecognised becomes the fixed token `unknown`. Two values are
 * passed on, each only in its own narrow shape: the plan name when it looks
 * like a plan identifier, and the account when it is an e-mail address. The
 * account is for the Settings card alone: it stays in the status in memory and
 * is never written anywhere. The organisation is dropped as before.
 */
import { AI_SUBSCRIPTION_PROVIDERS } from '../providers'
import type {
  AiSubscriptionLoginMethod,
  AiSubscriptionProviderId,
  AiSubscriptionState,
} from '../types'
import {
  SUBSCRIPTION_MIN_VERSIONS,
  subscriptionAccountOf,
  subscriptionStatusErrorText,
  subscriptionVersionAtLeast,
  type SubscriptionStatusErrorKind,
} from './contract'
import {
  locateSubscriptionProgram,
  subscriptionProviderLabel,
  type SubscriptionLocator,
  type SubscriptionProgram,
} from './locate'
import {
  runSubscriptionProgram,
  type SubscriptionCommandResult,
  type SubscriptionRunner,
} from './process'

/** A status check that has not answered by then is an `error` */
export const SUBSCRIPTION_STATUS_TIMEOUT_MS = 20_000

/** What a CLI says about its login; of the account identity only the e-mail address is kept */
export type SubscriptionLogin =
  | { signedIn: false }
  | {
      signedIn: true
      loginMethod: AiSubscriptionLoginMethod
      /** plan the CLI names, for display */
      planName?: string
      /**
       * The kind of login, one of `SUBSCRIPTION_LOGIN_KINDS` (`api_key/firstParty`,
       * `chatgpt`, `unknown`, …). Tells one kind of login from another without
       * naming an account; a metered acceptance is remembered against it.
       */
      loginKind: string
      /** the e-mail address the CLI names, for display only */
      account?: string
    }

/**
 * Outcome of one status check, before the stored metered acceptance is applied.
 * `state` is never `checking`: that is the status of a provider not checked yet.
 */
export interface SubscriptionDetection {
  provider: AiSubscriptionProviderId
  state: Exclude<AiSubscriptionState, 'checking'>
  version?: string
  loginMethod?: AiSubscriptionLoginMethod
  planName?: string
  error?: string
  /** the file the check ran, on a `needs-update` error */
  programPath?: string
  loginKind?: string
  /** the e-mail address of the signed-in account, for display only; never stored */
  account?: string
}

/**
 * Raw result of the Codex app-server's `account/read`, supplied by the Codex
 * bridge. `codexAccountInfo` keeps its email for display and nothing else of it.
 */
export type CodexAccountSource = (context: {
  /** the configured Codex path, as stored in the settings */
  configuredPath: string | undefined
  signal: AbortSignal
}) => Promise<unknown>

export interface SubscriptionDetectOptions {
  /** the user's own path to the CLI (the Codex `cliPath` setting) */
  configuredPath?: string | undefined
  timeoutMs?: number | undefined
  locate?: SubscriptionLocator | undefined
  run?: SubscriptionRunner | undefined
  /** overrides the source set with `setCodexAccountSource`; null turns it off */
  codexAccount?: CodexAccountSource | null | undefined
}

export type SubscriptionDetector = (
  provider: AiSubscriptionProviderId,
  options?: SubscriptionDetectOptions,
) => Promise<SubscriptionDetection>

/** The token for a kind of login this file does not list */
const UNKNOWN_KIND = 'unknown'

/** Values of `authMethod` in `claude auth status` */
const CLAUDE_AUTH_KINDS = [
  'claude.ai',
  'api_key',
  'api_key_helper',
  'third_party',
  'oauth_token',
] as const

/** Values of `apiProvider` in `claude auth status` */
const CLAUDE_API_PROVIDER_KINDS = [
  'firstParty',
  'bedrock',
  'vertex',
  'foundry',
  'anthropicAws',
  'anthropicGoogleCloud',
  'mantle',
  'gateway',
] as const

const CODEX_LOGIN_KINDS = [
  'chatgpt',
  'api-key',
  'bedrock',
  'workload-identity',
  'access-token',
  'personal-access-token',
  'no-account',
] as const

type CodexLoginKind = (typeof CODEX_LOGIN_KINDS)[number]

/**
 * Every value a `loginKind` can take. Claude: `<authMethod>/<apiProvider>`, each
 * half from its list above or `unknown`. Codex: one of its list. All of them
 * are constants of this file; none is built from what a CLI printed.
 */
export const SUBSCRIPTION_LOGIN_KINDS: readonly string[] = [
  UNKNOWN_KIND,
  ...[...CLAUDE_AUTH_KINDS, UNKNOWN_KIND].flatMap((auth) =>
    [...CLAUDE_API_PROVIDER_KINDS, UNKNOWN_KIND].map((api) => `${auth}/${api}`),
  ),
  ...CODEX_LOGIN_KINDS,
]

/** `value` when it is one of the listed kinds, the fixed token `unknown` otherwise */
export function subscriptionLoginKind(value: unknown): string {
  return typeof value === 'string' && SUBSCRIPTION_LOGIN_KINDS.includes(value)
    ? value
    : UNKNOWN_KIND
}

/** The entry of `list` equal to `value`; the result is the list's own constant, never the input */
function listed<T extends string>(value: unknown, list: readonly T[]): T | typeof UNKNOWN_KIND {
  return list.find((entry) => entry === value) ?? UNKNOWN_KIND
}

/**
 * A plan name as the CLIs give it: one short identifier (`max`, `plus`,
 * `team`). A value of any other shape, such as free text, is not shown.
 */
function planLabel(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,31}$/i.test(value) ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

// ── Claude Code: `claude auth status --json` ──

const CLAUDE_METERED_METHODS: ReadonlySet<string> = new Set([
  'api_key',
  'api_key_helper',
  'third_party',
])

/**
 * Read `loggedIn`, `authMethod`, `apiProvider`, `subscriptionType` and `email`
 * from the CLI's JSON; every other field (organisation, directories) is ignored.
 * A subscription is reported only for a claude.ai login on Anthropic's own API
 * that names a plan. The fields are compared with known values, not copied: an
 * unexpected value reads as `unknown`, and an `email` that is not an address is
 * left out. Null when the output is not the expected JSON.
 */
export function parseClaudeAuthStatus(stdout: string): SubscriptionLogin | null {
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let parsed: Record<string, unknown> | undefined
  try {
    parsed = asRecord(JSON.parse(stdout.slice(start, end + 1)))
  } catch {
    return null
  }
  if (!parsed || typeof parsed.loggedIn !== 'boolean') return null
  if (!parsed.loggedIn) return { signedIn: false }
  const authMethod = listed(parsed.authMethod, CLAUDE_AUTH_KINDS)
  const apiProvider = listed(parsed.apiProvider, CLAUDE_API_PROVIDER_KINDS)
  const planName = planLabel(parsed.subscriptionType)
  const email = subscriptionAccountOf(parsed.email)
  const account = email ? { account: email } : {}
  const loginKind = `${authMethod}/${apiProvider}`
  // any named backend other than Anthropic's own API is a paid route, known to this file or not
  const otherBackend =
    typeof parsed.apiProvider === 'string' &&
    parsed.apiProvider !== '' &&
    parsed.apiProvider !== 'firstParty'
  if (CLAUDE_METERED_METHODS.has(authMethod) || otherBackend) {
    return { signedIn: true, loginMethod: 'metered', loginKind, ...account }
  }
  if (authMethod === 'claude.ai' && apiProvider === 'firstParty' && planName) {
    return { signedIn: true, loginMethod: 'subscription', planName, loginKind, ...account }
  }
  return { signedIn: true, loginMethod: 'unknown', loginKind, ...account }
}

// ── Codex: `codex login status` ──

/**
 * Read the one line `codex login status` prints (on stderr). The line is only
 * matched against the lines Codex is known to print; nothing of it is kept, so
 * neither the masked API key on the API-key line nor anything on a line this
 * file does not know can travel on. Null when there is no login line at all.
 */
export function parseCodexLoginStatus(output: string): SubscriptionLogin | null {
  if (/\bNot logged in\b/i.test(output)) return { signedIn: false }
  const match = /\bLogged in using ([^\r\n]*)/i.exec(output)
  if (!match) return null
  const how = match[1]!.trim().toLowerCase()
  const login = (
    loginMethod: AiSubscriptionLoginMethod,
    loginKind: CodexLoginKind | typeof UNKNOWN_KIND,
  ): SubscriptionLogin => ({ signedIn: true, loginMethod, loginKind })
  if (/^chatgpt\b/.test(how)) return login('subscription', 'chatgpt')
  if (/^(an )?api key\b/.test(how)) return login('metered', 'api-key')
  if (/^amazon bedrock\b/.test(how)) return login('metered', 'bedrock')
  if (/^workload identity\b/.test(how)) return login('metered', 'workload-identity')
  if (how === 'access token') return login('unknown', 'access-token')
  if (how === 'personal access token') return login('unknown', 'personal-access-token')
  return login('unknown', UNKNOWN_KIND)
}

// ── Codex: the app-server's account/read ──

/**
 * The login `account/read` describes: `{ account: { type: 'chatgpt', planType }
 * | { type: 'apiKey' } | null, requiresOpenaiAuth }`. Of a ChatGPT account the
 * email is kept when it is an address; an account type this file does not know
 * reads as `unknown`.
 * Null when the value is not an `account/read` result.
 */
export function codexAccountInfo(accountRead: unknown): SubscriptionLogin | null {
  const result = asRecord(accountRead)
  if (!result) return null
  const account = asRecord(result.account)
  if (!account) {
    if (result.requiresOpenaiAuth === true) return { signedIn: false }
    // no account and none required: Codex is pointed at some other model provider
    return { signedIn: true, loginMethod: 'unknown', loginKind: 'no-account' }
  }
  if (account.type === 'chatgpt') {
    const planName = planLabel(account.planType)
    const email = subscriptionAccountOf(account.email)
    return {
      signedIn: true,
      loginMethod: 'subscription',
      ...(planName && planName !== 'unknown' ? { planName } : {}),
      loginKind: 'chatgpt',
      ...(email ? { account: email } : {}),
    }
  }
  if (account.type === 'apiKey') {
    return { signedIn: true, loginMethod: 'metered', loginKind: 'api-key' }
  }
  return { signedIn: true, loginMethod: 'unknown', loginKind: UNKNOWN_KIND }
}

let codexAccountSource: CodexAccountSource | null = null

/**
 * Let the Codex bridge supply `account/read` to the status check (plan name,
 * the account shown on the card, and a second opinion on the kind of login).
 * Pass null to remove it.
 */
export function setCodexAccountSource(source: CodexAccountSource | null): void {
  codexAccountSource = source
}

/**
 * Two readings of the same login. The more expensive reading wins: metered if
 * either says so, a subscription only if both do. The account is taken from
 * the reading that names it only when both agree on a subscription.
 */
function mergeLogins(cli: SubscriptionLogin, account: SubscriptionLogin | null): SubscriptionLogin {
  if (!account || !cli.signedIn) return cli
  if (!account.signedIn) return account
  if (cli.loginMethod === 'metered') return cli
  if (account.loginMethod === 'metered') return account
  if (cli.loginMethod === 'subscription' && account.loginMethod === 'subscription') {
    return {
      ...cli,
      ...(account.planName ? { planName: account.planName } : {}),
      ...(account.account ? { account: account.account } : {}),
    }
  }
  return cli.loginMethod === 'unknown' ? cli : account
}

// ── From CLI answers to a state ──

/**
 * An `error` detection. `text` is always a sentence written in this file, with
 * at most facts the code derived itself added to it: a version number, an exit
 * code, an error code. It never contains what a CLI or an error message said.
 */
function errorDetection(
  provider: AiSubscriptionProviderId,
  kind: SubscriptionStatusErrorKind,
  text: string,
  version?: string,
  programPath?: string,
): SubscriptionDetection {
  return {
    provider,
    state: 'error',
    ...(version ? { version } : {}),
    error: subscriptionStatusErrorText(kind, text),
    ...(programPath ? { programPath } : {}),
  }
}

/**
 * The one place a login becomes a state. `ready` only for a subscription
 * login; a metered login and one of unknown kind are both `metered`.
 */
function loginDetection(
  provider: AiSubscriptionProviderId,
  version: string | undefined,
  login: SubscriptionLogin,
): SubscriptionDetection {
  const base = { provider, ...(version ? { version } : {}) }
  if (!login.signedIn) return { ...base, state: 'signed-out' }
  const subscription = login.loginMethod === 'subscription'
  return {
    ...base,
    state: subscription ? 'ready' : 'metered',
    loginMethod: login.loginMethod,
    ...(subscription && login.planName ? { planName: login.planName } : {}),
    loginKind: subscriptionLoginKind(login.loginKind),
    ...(login.account ? { account: login.account } : {}),
  }
}

function parseVersion(output: string): string | undefined {
  return /\d+\.\d+\.\d+/.exec(output)?.[0]
}

const UNKNOWN_COMMAND =
  /unknown (command|option)|unrecognized (subcommand|option)|unexpected argument/i

/**
 * The system error code of a failure (`ENOENT`, `EACCES`) as a suffix, or
 * nothing. The message of an error is never used: it can contain a path, or
 * whatever a program printed.
 */
function errorCodeSuffix(error: unknown): string {
  const code = (error as { code?: unknown } | null | undefined)?.code
  return typeof code === 'string' && /^E[A-Z0-9_]{1,30}$/.test(code) ? ` (${code})` : ''
}

const STATUS_ARGS: Record<AiSubscriptionProviderId, string[]> = {
  'claude-code': ['auth', 'status', '--json'],
  codex: ['login', 'status'],
}

function parseStatus(
  provider: AiSubscriptionProviderId,
  result: SubscriptionCommandResult,
): SubscriptionLogin | null {
  return provider === 'claude-code'
    ? parseClaudeAuthStatus(result.stdout)
    : parseCodexLoginStatus(`${result.stderr}\n${result.stdout}`)
}

async function inspect(
  provider: AiSubscriptionProviderId,
  options: SubscriptionDetectOptions,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<SubscriptionDetection> {
  const name = subscriptionProviderLabel(provider)
  let program: SubscriptionProgram | null
  try {
    program = await (options.locate ?? locateSubscriptionProgram)(provider, {
      configuredPath: options.configuredPath,
    })
  } catch (error) {
    return errorDetection(provider, 'failed', `Could not look for ${name}${errorCodeSuffix(error)}`)
  }
  if (!program) return { provider, state: 'not-installed' }

  const run = options.run ?? runSubscriptionProgram
  const ask = (args: string[]): Promise<SubscriptionCommandResult> =>
    run(program, args, { signal, timeoutMs })
  const minimum = SUBSCRIPTION_MIN_VERSIONS[provider]

  let version: string | undefined
  let status: SubscriptionCommandResult
  let account: SubscriptionLogin | null = null
  try {
    if (minimum) {
      // version first: nothing else is asked of a CLI that may not know the question
      version = parseVersion((await ask(['--version'])).stdout)
      if (!version) {
        return errorDetection(provider, 'failed', `${name} did not report its version`)
      }
      if (!subscriptionVersionAtLeast(version, minimum)) {
        return errorDetection(
          provider,
          'needs-update',
          `${name} ${version} is too old; version ${minimum} or newer is required`,
          version,
          program.entry,
        )
      }
      status = await ask(STATUS_ARGS[provider])
    } else {
      const source = options.codexAccount === undefined ? codexAccountSource : options.codexAccount
      const [versionResult, statusResult, accountResult] = await Promise.all([
        ask(['--version']).catch(() => null),
        ask(STATUS_ARGS[provider]),
        provider === 'codex' && source
          ? source({ configuredPath: options.configuredPath, signal }).catch(() => null)
          : null,
      ])
      version = versionResult ? parseVersion(versionResult.stdout) : undefined
      status = statusResult
      account = codexAccountInfo(accountResult)
    }
  } catch (error) {
    return errorDetection(
      provider,
      'failed',
      `${name} could not be run${errorCodeSuffix(error)}`,
      version,
    )
  }

  const login = parseStatus(provider, status)
  if (!login) {
    const output = `${status.stderr}\n${status.stdout}`
    if (UNKNOWN_COMMAND.test(output)) {
      // A helper program can answer an unknown subcommand without ever naming a
      // version. That is not an old Codex, and updating it would change nothing.
      if (provider === 'codex' && !version) {
        return errorDetection(provider, 'failed', `${name} did not report its version`)
      }
      return errorDetection(
        provider,
        'needs-update',
        `${name}${version ? ` ${version}` : ''} is too old to report its login status`,
        version,
        program.entry,
      )
    }
    // what the CLI printed instead stays here: it may name the account
    const exit = typeof status.code === 'number' ? `exit code ${status.code}` : 'no exit code'
    return errorDetection(
      provider,
      'failed',
      `${name} did not report its login status (${exit})`,
      version,
    )
  }
  return loginDetection(provider, version, mergeLogins(login, account))
}

/**
 * The connection status of one provider, from the CLI itself: is it installed,
 * signed in, and on what kind of login. Never rejects: every failure, a check
 * that outlasts `timeoutMs` included, is an `error` detection.
 */
export const detectSubscriptionLogin: SubscriptionDetector = async (provider, options = {}) => {
  const timeoutMs = options.timeoutMs ?? SUBSCRIPTION_STATUS_TIMEOUT_MS
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<SubscriptionDetection>((resolve) => {
    timer = setTimeout(() => {
      resolve(
        errorDetection(
          provider,
          'timeout',
          `${subscriptionProviderLabel(provider)} did not answer within ${Math.round(timeoutMs / 1000)} s`,
        ),
      )
    }, timeoutMs)
  })
  try {
    return await Promise.race([
      inspect(provider, options, controller.signal, timeoutMs).catch(
        (error): SubscriptionDetection =>
          errorDetection(
            provider,
            'failed',
            `The ${subscriptionProviderLabel(provider)} check failed${errorCodeSuffix(error)}`,
          ),
      ),
      deadline,
    ])
  } finally {
    clearTimeout(timer)
    // ends whatever the check still has running, on a timeout and otherwise
    controller.abort()
  }
}

/** Both providers, checked at the same time */
export async function detectSubscriptionLogins(
  options: SubscriptionDetectOptions & {
    /** per provider; overrides `configuredPath` */
    configuredPaths?: Partial<Record<AiSubscriptionProviderId, string | undefined>> | undefined
    detect?: SubscriptionDetector | undefined
  } = {},
): Promise<Record<AiSubscriptionProviderId, SubscriptionDetection>> {
  const { configuredPaths, detect = detectSubscriptionLogin, ...rest } = options
  const detections = await Promise.all(
    AI_SUBSCRIPTION_PROVIDERS.map((provider) =>
      detect(provider, {
        ...rest,
        ...(configuredPaths ? { configuredPath: configuredPaths[provider] } : {}),
      }),
    ),
  )
  return Object.fromEntries(
    detections.map((detection) => [detection.provider, detection]),
  ) as Record<AiSubscriptionProviderId, SubscriptionDetection>
}
