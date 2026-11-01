/**
 * What the renderers and the main side agree on for the subscription providers:
 * IPC channel names, the payloads that travel on them, and the few fixed values
 * the UI shows (install command, install page). Browser-safe: this file imports
 * types and the plain effort list only, so preload and renderer bundles can use
 * it as is.
 */
import { aiEffortOf, aiEffortsOf } from '../effort'
import type {
  AiSubscriptionCliId,
  AiSubscriptionModel,
  AiSubscriptionProviderId,
  AiSubscriptionState,
  AiSubscriptionStatus,
} from '../types'

/** Request channels are invoked by the renderer; `changed` is sent from main to every window */
export const SUBSCRIPTION_IPC_CHANNELS = {
  /** () → SubscriptionStatusMap: the last known statuses, `checking` until a first check answered */
  statuses: 'ai:subscription-statuses',
  /** (SubscriptionRecheckRequest?) → SubscriptionStatusMap: look again, answer when done */
  recheck: 'ai:subscription-recheck',
  /** (SubscriptionProviderRequest) → SubscriptionLaunchResult: open the CLI's own login */
  login: 'ai:subscription-login',
  /** (SubscriptionProviderRequest) → SubscriptionLaunchResult: run the CLI's own logout, then look again */
  logout: 'ai:subscription-logout',
  /** (SubscriptionProviderRequest) → SubscriptionLaunchResult: run the vendor install command */
  install: 'ai:subscription-install',
  /** (SubscriptionProviderRequest) → SubscriptionLaunchResult: run the official update in a terminal window */
  update: 'ai:subscription-update',
  /** (SubscriptionProviderRequest) → SubscriptionLaunchResult: end a login the app started, then look again */
  cancelLogin: 'ai:subscription-cancel-login',
  /** (SubscriptionMeteredRequest) → SubscriptionMeteredResult: "use anyway" for a metered login */
  metered: 'ai:subscription-metered',
  /** () → boolean: whether this build can generate images through the Codex subscription */
  codexImage: 'ai:subscription-codex-image',
  /** event, payload SubscriptionStatusMap: the statuses changed */
  changed: 'ai:subscription-changed',
} as const

export type SubscriptionIpcChannel =
  (typeof SUBSCRIPTION_IPC_CHANNELS)[keyof typeof SUBSCRIPTION_IPC_CHANNELS]

/** Both providers, always present */
export type SubscriptionStatusMap = Record<AiSubscriptionProviderId, AiSubscriptionStatus>

export interface SubscriptionRecheckRequest {
  /** absent: both */
  providers?: AiSubscriptionProviderId[]
}

export interface SubscriptionProviderRequest {
  provider: AiSubscriptionProviderId
}

/**
 * Where the CLI's own login runs. `browser` (absent): the user signs in on the
 * vendor's page and the browser hands the sign-in back by itself; the CLI's
 * window stays hidden. `window`: the CLI's own window is shown, for the case
 * where the browser shows a code that has to be pasted there. Windows alone
 * has that window; elsewhere both are the same login.
 */
export type SubscriptionLoginMode = 'browser' | 'window'

export interface SubscriptionLoginRequest extends SubscriptionProviderRequest {
  /** absent: the browser, with the CLI's window hidden */
  mode?: SubscriptionLoginMode | undefined
}

export interface SubscriptionMeteredRequest {
  provider: AiSubscriptionProviderId
  accepted: boolean
}

/**
 * Why a login, logout, install or update could not be started (a logout: or
 * did not succeed). `not-installed`: no program to sign in to. `unsupported`:
 * no vendor command for this system, or no way the app knows to update the copy
 * it found. `invalid`: the request did not name a subscription provider.
 */
export type SubscriptionLaunchFailure = 'not-installed' | 'unsupported' | 'failed' | 'invalid'

export interface SubscriptionLaunchResult {
  /**
   * the window was opened (what the user does in it shows up in the next status
   * check), or the logout command ran to its end
   */
  ok: boolean
  reason?: SubscriptionLaunchFailure
  error?: string
  /** the vendor's install page, when installing by hand is the way forward */
  installUrl?: string
}

export interface SubscriptionMeteredResult {
  /** false when there is no metered login to accept */
  ok: boolean
  statuses: SubscriptionStatusMap
}

/** Request and response of every channel, for typed preload bridges */
export interface SubscriptionIpcContract {
  [SUBSCRIPTION_IPC_CHANNELS.statuses]: { request: void; response: SubscriptionStatusMap }
  [SUBSCRIPTION_IPC_CHANNELS.recheck]: {
    request: SubscriptionRecheckRequest | undefined
    response: SubscriptionStatusMap
  }
  [SUBSCRIPTION_IPC_CHANNELS.login]: {
    request: SubscriptionLoginRequest
    response: SubscriptionLaunchResult
  }
  [SUBSCRIPTION_IPC_CHANNELS.logout]: {
    request: SubscriptionProviderRequest
    response: SubscriptionLaunchResult
  }
  [SUBSCRIPTION_IPC_CHANNELS.install]: {
    request: SubscriptionProviderRequest
    response: SubscriptionLaunchResult
  }
  [SUBSCRIPTION_IPC_CHANNELS.update]: {
    request: SubscriptionProviderRequest
    response: SubscriptionLaunchResult
  }
  [SUBSCRIPTION_IPC_CHANNELS.cancelLogin]: {
    request: SubscriptionProviderRequest
    response: SubscriptionLaunchResult
  }
  [SUBSCRIPTION_IPC_CHANNELS.metered]: {
    request: SubscriptionMeteredRequest
    response: SubscriptionMeteredResult
  }
  [SUBSCRIPTION_IPC_CHANNELS.codexImage]: { request: void; response: boolean }
  [SUBSCRIPTION_IPC_CHANNELS.changed]: { request: never; response: SubscriptionStatusMap }
}

/**
 * The vendor's own install command, run as is in a terminal window. Shown next
 * to the install button so the user sees what will run.
 */
export const SUBSCRIPTION_INSTALL_COMMANDS = {
  'claude-code': 'irm https://claude.ai/install.ps1 | iex',
  codex: 'winget install OpenAI.Codex',
} as const satisfies Record<AiSubscriptionCliId, string>

/**
 * Oldest CLI version the app works with; an older one is reported as "needs
 * update". Claude Code: 2.1.248 introduced `--restricted`, which the bridge
 * runs with (`claude auth status` itself exists since 2.1.41). The version is
 * read before anything else is asked, because a Claude too old to know `auth`
 * would take "auth status" as a prompt. Codex has no floor: an old Codex
 * rejects `login status` as an unknown subcommand, which reads as "needs
 * update" too.
 */
export const SUBSCRIPTION_MIN_VERSIONS: Record<AiSubscriptionProviderId, string | null> = {
  'claude-code': '2.1.248',
  codex: null,
  // no program
  chatgpt: null,
}

/**
 * The vendor's own update command, named on the card when the CLI is older than
 * `SUBSCRIPTION_MIN_VERSIONS` asks. Only a provider with a floor needs one.
 */
export const SUBSCRIPTION_UPDATE_COMMANDS: Record<AiSubscriptionProviderId, string | null> = {
  'claude-code': 'claude update',
  codex: null,
  chatgpt: null,
}

/** Whether a dotted version number is at least `minimum` */
export function subscriptionVersionAtLeast(version: string, minimum: string): boolean {
  const have = version.split('.').map(Number)
  const need = minimum.split('.').map(Number)
  for (let index = 0; index < need.length; index++) {
    const difference = (have[index] ?? 0) - (need[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return true
}

/** The vendor's install instructions, linked when the command cannot run or fails */
export const SUBSCRIPTION_INSTALL_URLS = {
  'claude-code': 'https://code.claude.com/docs/en/setup',
  codex: 'https://developers.openai.com/codex/cli',
} as const satisfies Record<AiSubscriptionCliId, string>

/**
 * Where ChatGPT shows, and lets the user limit, what an app uses of the plan.
 * ChatGPT has nothing to install: this is the page its card links to.
 */
export const SUBSCRIPTION_CHATGPT_USAGE_URL = 'https://chatgpt.com/#settings/Usage'

/** The status of a provider nothing is known about yet */
export function checkingSubscriptionStatus(
  provider: AiSubscriptionProviderId,
): AiSubscriptionStatus {
  return { provider, state: 'checking', meteredAccepted: false }
}

/**
 * An `error` status starts its text with one of these, so the UI can show its
 * own translated sentence: the CLI must be updated, the check got no answer, or
 * it failed some other way. The rest of the text is an English detail.
 */
export type SubscriptionStatusErrorKind = 'needs-update' | 'timeout' | 'failed'

export function subscriptionStatusErrorText(
  kind: SubscriptionStatusErrorKind,
  detail: string,
): string {
  return `${kind}: ${detail}`
}

/** Which kind of error an `error` status reports; null for every other state */
export function subscriptionStatusErrorKind(status: {
  state: AiSubscriptionState
  error?: string | undefined
}): SubscriptionStatusErrorKind | null {
  if (status.state !== 'error') return null
  const text = status.error ?? ''
  if (text.startsWith('needs-update:')) return 'needs-update'
  if (text.startsWith('timeout:')) return 'timeout'
  return 'failed'
}

/**
 * What a "needs update" card can tell the user: the version found, the oldest
 * one the app works with, and the command that updates it. Null unless the
 * status is that error and the CLI reported a version below the floor (an old
 * Codex has no floor; it is caught by an unknown subcommand instead).
 */
export function subscriptionNeedsUpdate(status: {
  provider: AiSubscriptionProviderId
  state: AiSubscriptionState
  error?: string | undefined
  version?: string | undefined
}): { version: string; minimum: string; command: string } | null {
  if (subscriptionStatusErrorKind(status) !== 'needs-update') return null
  const minimum = SUBSCRIPTION_MIN_VERSIONS[status.provider]
  const command = SUBSCRIPTION_UPDATE_COMMANDS[status.provider]
  const version = status.version
  if (!minimum || !command || !version) return null
  if (subscriptionVersionAtLeast(version, minimum)) return null
  return { version, minimum, command }
}

/** A Windows long path is at most this long; a longer value is not a path we found */
const SUBSCRIPTION_PROGRAM_PATH_MAX_LENGTH = 32_767

/**
 * The program path a status carries, when it is one: an absolute path on one
 * line. It is shown on a "needs update" card and nowhere else, so the user
 * updates the copy the app runs rather than another one on the same PC.
 */
export function subscriptionProgramPathOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!value || value.length > SUBSCRIPTION_PROGRAM_PATH_MAX_LENGTH) return undefined
  if (/\p{Cc}/u.test(value)) return undefined
  // a drive (`C:\`), a UNC share (`\\server`), or a POSIX root
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value) ? value : undefined
}

// ---------------------------------------------------------------------------
// Reading IPC answers. A renderer cannot trust what comes back over IPC (no
// handler registered yet, an older main, a half-filled object), so every answer
// goes through these before it reaches the UI.
// ---------------------------------------------------------------------------

/** Listed here (not imported) so this file keeps importing types only */
const SUBSCRIPTION_PROVIDER_IDS: readonly AiSubscriptionProviderId[] = [
  'claude-code',
  'chatgpt',
  'codex',
]

const SUBSCRIPTION_STATES: readonly AiSubscriptionState[] = [
  'checking',
  'not-installed',
  'signed-out',
  'ready',
  'metered',
  'error',
]

const SUBSCRIPTION_LAUNCH_FAILURES: readonly SubscriptionLaunchFailure[] = [
  'not-installed',
  'unsupported',
  'failed',
  'invalid',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Every provider `checking`: what is shown while nothing has answered */
export function checkingSubscriptionStatuses(): SubscriptionStatusMap {
  return {
    'claude-code': checkingSubscriptionStatus('claude-code'),
    chatgpt: checkingSubscriptionStatus('chatgpt'),
    codex: checkingSubscriptionStatus('codex'),
  }
}

export function isSubscriptionProviderId(value: unknown): value is AiSubscriptionProviderId {
  return (SUBSCRIPTION_PROVIDER_IDS as readonly unknown[]).includes(value)
}

// ---------------------------------------------------------------------------
// The two display values a status carries from a CLI's own answer: who is
// signed in, and which models there are. Both are checked here, where the
// status is built and again where a renderer reads it: a value of any other
// shape is absent, never passed on as it came.
// ---------------------------------------------------------------------------

/** An e-mail address is at most this long; a longer value is not one */
export const SUBSCRIPTION_ACCOUNT_MAX_LENGTH = 254

/** One address and nothing around it: no display name, no brackets, no second line */
const ACCOUNT_PATTERN = /^[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63})+$/u

/**
 * The account a CLI names, when it is an e-mail address. Anything else (free
 * text, an organisation name, a value of another type) is absent.
 */
export function subscriptionAccountOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const account = value.trim()
  return account.length <= SUBSCRIPTION_ACCOUNT_MAX_LENGTH && ACCOUNT_PATTERN.test(account)
    ? account
    : undefined
}

/** Most models a status lists; what a CLI lists beyond that is left out */
export const SUBSCRIPTION_MODELS_MAX = 50

const SUBSCRIPTION_MODEL_LABEL_MAX = 80

/**
 * A model alias or id as the CLIs take it. The stored selection is handed to
 * the CLI, so a listed id is held to the shape the bridges accept: nothing
 * that could read as an option.
 */
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:[\]-]{0,127}$/

function modelIdOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const id = value.trim()
  return MODEL_ID_PATTERN.test(id) ? id : undefined
}

/** A display name on one line, without control characters, of bounded length */
function modelLabelOf(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\p{Cc}+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SUBSCRIPTION_MODEL_LABEL_MAX)
}

/**
 * A model list as a status carries it: the listed fields only, ids the CLI
 * could be given, names trimmed and bounded, effort levels from the known
 * list only, one entry per id, at most
 * `SUBSCRIPTION_MODELS_MAX` entries. The entry with an empty id stands for the
 * CLI's own default and is kept only when it tells what that resolves to.
 * Absent when nothing usable is left.
 */
export function subscriptionModelsOf(value: unknown): AiSubscriptionModel[] | undefined {
  if (!Array.isArray(value)) return undefined
  const models: AiSubscriptionModel[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (models.length >= SUBSCRIPTION_MODELS_MAX) break
    if (!isRecord(entry)) continue
    const isDefaultEntry = entry.id === ''
    const id = isDefaultEntry ? '' : modelIdOf(entry.id)
    if (id === undefined || seen.has(id)) continue
    const resolved = modelIdOf(entry.resolved)
    if (isDefaultEntry && !resolved) continue
    seen.add(id)
    // levels outside the known list are dropped; the default counts only as one the model takes
    const efforts = aiEffortsOf(entry.efforts)
    const defaultEffort = aiEffortOf(entry.defaultEffort)
    models.push({
      id,
      label: modelLabelOf(entry.label) || id || (resolved as string),
      ...(resolved ? { resolved } : {}),
      ...(isDefaultEntry || entry.isDefault === true ? { isDefault: true } : {}),
      ...(efforts ? { efforts } : {}),
      ...(efforts && defaultEffort && efforts.includes(defaultEffort) ? { defaultEffort } : {}),
    })
  }
  return models.length > 0 ? models : undefined
}

/**
 * An IPC answer as a status map with every provider present. A provider whose
 * entry is missing or malformed reads as `checking`, so a renderer never has
 * to guard against a half-filled answer. The account and the model list pass
 * only when they have their shape, and only on a state that names a login.
 */
export function subscriptionStatusMapOf(result: unknown): SubscriptionStatusMap {
  const raw = isRecord(result) ? result : {}
  const statusOf = (provider: AiSubscriptionProviderId): AiSubscriptionStatus => {
    const status = raw[provider]
    // a main process that answered without a ChatGPT status has no such connection (an older app)
    if (isRecord(result) && status === undefined && provider === 'chatgpt') {
      return { provider, state: 'signed-out', meteredAccepted: false }
    }
    if (!isRecord(status) || !SUBSCRIPTION_STATES.includes(status.state as AiSubscriptionState)) {
      return checkingSubscriptionStatus(provider)
    }
    const read: AiSubscriptionStatus = {
      ...(status as unknown as AiSubscriptionStatus),
      provider,
      meteredAccepted: status.meteredAccepted === true,
    }
    const signedIn = read.state === 'ready' || read.state === 'metered'
    const account = signedIn ? subscriptionAccountOf(status.account) : undefined
    const models = signedIn ? subscriptionModelsOf(status.models) : undefined
    const programPath =
      subscriptionStatusErrorKind(read) === 'needs-update'
        ? subscriptionProgramPathOf(status.programPath)
        : undefined
    delete read.account
    delete read.models
    delete read.signingIn
    delete read.loginUnfinished
    delete read.programPath
    if (account) read.account = account
    if (models) read.models = models
    if (programPath) read.programPath = programPath
    if (status.signingIn === 'browser' || status.signingIn === 'window') {
      read.signingIn = status.signingIn
    }
    // a login that ended without one belongs to signed-out and nowhere else
    if (read.state === 'signed-out' && status.loginUnfinished === true) {
      read.loginUnfinished = true
    }
    return read
  }
  return {
    'claude-code': statusOf('claude-code'),
    chatgpt: statusOf('chatgpt'),
    codex: statusOf('codex'),
  }
}

/**
 * An IPC answer as a launch result; anything unreadable is a plain failure.
 * The spawn error text is left behind: it can carry an executable path, and the
 * UI shows its own translated sentence instead.
 */
export function subscriptionLaunchResultOf(result: unknown): SubscriptionLaunchResult {
  const raw = isRecord(result) ? result : {}
  if (raw.ok === true) return { ok: true }
  const reason = SUBSCRIPTION_LAUNCH_FAILURES.includes(raw.reason as SubscriptionLaunchFailure)
    ? (raw.reason as SubscriptionLaunchFailure)
    : 'failed'
  return {
    ok: false,
    reason,
    ...(typeof raw.installUrl === 'string' ? { installUrl: raw.installUrl } : {}),
  }
}

/** An IPC answer to "use anyway": accepted only on a literal `true`, the statuses always a full map */
export function subscriptionMeteredResultOf(result: unknown): SubscriptionMeteredResult {
  const raw = isRecord(result) ? result : {}
  return { ok: raw.ok === true, statuses: subscriptionStatusMapOf(raw.statuses) }
}
