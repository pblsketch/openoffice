/**
 * What the subscription-connection parts show, as plain data: which lines and
 * buttons a connection state gets, which other connection a blocked run may
 * continue on, which usage windows are worth a line, and the wording of a run
 * error. The components in this package only lay these results out, so the
 * rules are testable without a DOM and every editor reaches the same answer.
 */
import {
  AI_PROVIDERS,
  AI_SUBSCRIPTION_PROVIDERS,
  isSubscriptionProvider,
  subscriptionConnection,
  subscriptionNeedsUpdate,
  subscriptionStatusErrorKind,
  type AiProviderChoice,
  type AiProviderId,
  type AiRunErrorKind,
  type AiSettings,
  type AiSubscriptionProviderId,
  type AiSubscriptionState,
  type AiSubscriptionStatus,
  type AiSubscriptionStatuses,
  type AiSubscriptionUsage,
  type AiUsageWindow,
  type SubscriptionStatusErrorKind,
} from '@genoffice/ai-provider/browser'
import { htmlLang, type Lang } from '@genoffice/i18n'
import { aiSubscriptionText, type AiSubscriptionStringKey } from './strings-ai-subscription'

/** Subscription providers are named in plain text only: no vendor mark, no CLI product name */
const SUBSCRIPTION_NAMES: Record<AiSubscriptionProviderId, string> = {
  'claude-code': 'Claude',
  codex: 'Codex',
}

const SUBSCRIPTION_VENDORS: Record<AiSubscriptionProviderId, string> = {
  'claude-code': 'Anthropic',
  codex: 'OpenAI',
}

/** The vendor's own install instructions, opened when the install command cannot run */
export const AI_SUBSCRIPTION_INSTALL_HELP_URLS: Record<AiSubscriptionProviderId, string> = {
  'claude-code': 'https://code.claude.com/docs/en/setup',
  codex: 'https://developers.openai.com/codex/cli',
}

/** Usage at or above this share of a window is shown; below it the panel stays quiet */
export const AI_SUBSCRIPTION_USAGE_THRESHOLD = 0.8

/** "Claude" / "Codex" */
export function aiSubscriptionProviderName(provider: AiSubscriptionProviderId): string {
  return SUBSCRIPTION_NAMES[provider]
}

/** The company whose install command and sign-in page a subscription provider uses */
export function aiSubscriptionVendorName(provider: AiSubscriptionProviderId): string {
  return SUBSCRIPTION_VENDORS[provider]
}

/** A provider's name as shown in these parts; an absent or unknown id reads as plain "AI" */
export function aiProviderDisplayName(provider: AiProviderId | undefined): string {
  if (isSubscriptionProvider(provider)) return SUBSCRIPTION_NAMES[provider]
  return AI_PROVIDERS.find((m) => m.id === provider)?.label ?? 'AI'
}

// ---- connect card ----

export type AiSubscriptionCardAction =
  | 'install'
  | 'install-help'
  | 'login'
  | 'login-window'
  | 'cancel-login'
  | 'update'
  | 'accept-metered'
  | 'recheck'
  | 'switch-account'
  | 'logout'

/**
 * The two actions on the account of a signed-in CLI: sign in with another
 * account, and sign out. Both change the vendor program for the whole PC, so
 * neither is ever the highlighted default.
 */
export const AI_SUBSCRIPTION_ACCOUNT_ACTIONS = [
  'switch-account',
  'logout',
] as const satisfies readonly AiSubscriptionCardAction[]

export function isAiSubscriptionAccountAction(action: AiSubscriptionCardAction): boolean {
  return (AI_SUBSCRIPTION_ACCOUNT_ACTIONS as readonly AiSubscriptionCardAction[]).includes(action)
}

/** What only the card in Settings shows; every other card leaves both off */
export interface AiSubscriptionCardOptions {
  /** show the signed-in account the CLI named */
  readonly account?: boolean | undefined
  /** offer "sign in with another account" and "sign out" while a login is known */
  readonly accountActions?: boolean | undefined
  /**
   * the app can open a terminal window of its own (Windows): the install
   * command and the CLI's login window for a pasted code run there. False
   * elsewhere: a not-installed card offers only the vendor's install page, and
   * a browser sign-in has no window to open. Default true.
   */
  readonly terminalWindows?: boolean | undefined
  /**
   * the host can run the official update of a CLI below the app's floor (in a
   * terminal window, so Windows alone): the outdated card offers "update"
   */
  readonly update?: boolean | undefined
  /** the host can end a login the app started: the signing-in card offers "cancel" */
  readonly cancelLogin?: boolean | undefined
  /**
   * a browser sign-in has gone on for `AI_SIGNING_IN_STALLED_MS` without an
   * answer: the way to the CLI's window becomes a button, with why to press it
   */
  readonly signingInStalled?: boolean | undefined
}

/**
 * A browser sign-in usually comes back within seconds of "allow". After this
 * long the browser most likely did not open, or shows a code to paste.
 */
export const AI_SIGNING_IN_STALLED_MS = 25_000

export type AiSubscriptionCardTone = 'neutral' | 'ok' | 'warning' | 'error'

export interface AiSubscriptionCardView {
  readonly provider: AiSubscriptionProviderId
  readonly state: AiSubscriptionState
  readonly tone: AiSubscriptionCardTone
  /** the one-line state: checking, not installed, connected … */
  readonly statusKey: AiSubscriptionStringKey
  /** plan name the CLI reported, on `ready` */
  readonly planName?: string | undefined
  /**
   * the signed-in account the CLI named, when the card was asked to show it
   * (`ready` and `metered`). It is shown with the plan name, which then leaves
   * the state line.
   */
  readonly account?: string | undefined
  /** explanatory lines under the state, in order */
  readonly noteKeys: readonly AiSubscriptionStringKey[]
  /**
   * what went wrong, on `error`: a sentence of ours chosen by the kind of
   * failure. The status's own text (English, possibly naming a path) is never shown.
   */
  readonly detailKey?: AiSubscriptionStringKey | undefined
  /**
   * values for the detail sentence besides the provider name: on a CLI below
   * the app's floor, the version found, the oldest one that works and the
   * update command. Facts the app derived, never CLI text.
   */
  readonly detailParams?: Readonly<Record<'version' | 'minimum' | 'command', string>> | undefined
  /**
   * on a `needs-update` error, the file the check ran, shown under the detail:
   * a PC can hold another copy (under WSL, an old npm install, another
   * package's alias) that the user may have updated instead
   */
  readonly programPath?: string | undefined
  /** lines under `programPath`, in order */
  readonly pathNoteKeys?: readonly AiSubscriptionStringKey[] | undefined
  /** buttons and links, in order; the first one is the primary action */
  readonly actions: readonly AiSubscriptionCardAction[]
  /**
   * the actions among `actions` drawn as a link: a way out of a step, not the
   * step itself, so never the highlighted button
   */
  readonly links: readonly AiSubscriptionCardAction[]
}

/** The actions that are a way out of a step; a stalled sign-in lifts its window out of this */
const LINK_ACTIONS: readonly AiSubscriptionCardAction[] = [
  'install-help',
  'login-window',
  'cancel-login',
]

function linksOf(actions: readonly AiSubscriptionCardAction[]): AiSubscriptionCardAction[] {
  return actions.filter((action) => LINK_ACTIONS.includes(action))
}

const STATUS_ERROR_KEYS: Record<SubscriptionStatusErrorKind, AiSubscriptionStringKey> = {
  'needs-update': 'cardErrNeedsUpdate',
  timeout: 'cardErrTimeout',
  failed: 'cardErrFailed',
}

/**
 * The spec table of connection states: what one provider's card shows in each
 * of the six. `options` adds what belongs to the Settings card alone: the
 * signed-in account, and the two actions on it.
 */
export function aiSubscriptionCardView(
  status: AiSubscriptionStatus,
  options: AiSubscriptionCardOptions = {},
): AiSubscriptionCardView {
  const terminalWindows = options.terminalWindows !== false
  if (status.signingIn) return signingInCardView(status, terminalWindows, options)
  const view = connectionCardView(status)
  if (status.state === 'not-installed' && !terminalWindows) {
    return { ...view, noteKeys: [], actions: ['install-help'], links: ['install-help'] }
  }
  if (view.detailKey && subscriptionStatusErrorKind(status) === 'needs-update') {
    // the copy a Linux terminal under WSL updates is not the one Windows runs;
    // the note names the update command, so only a CLI with a floor (Claude)
    // gets it
    const pathed: AiSubscriptionCardView =
      view.programPath && terminalWindows && view.detailParams?.command
        ? { ...view, pathNoteKeys: ['cardErrNeedsUpdateWindows'] }
        : view
    // the update runs in a terminal window of its own, like the install
    if (!options.update || !terminalWindows) return pathed
    return {
      ...pathed,
      noteKeys: [...pathed.noteKeys, 'updateNote'],
      actions: ['update', ...pathed.actions],
    }
  }
  if (status.state !== 'ready' && status.state !== 'metered') return view
  const account = options.account ? status.account?.trim() || undefined : undefined
  return {
    ...view,
    ...(account
      ? { account, statusKey: view.statusKey === 'cardReadyPlan' ? 'cardReady' : view.statusKey }
      : {}),
    actions: options.accountActions
      ? [...view.actions, ...AI_SUBSCRIPTION_ACCOUNT_ACTIONS]
      : view.actions,
  }
}

/**
 * A login the app started is under way, whatever was detected before it: the
 * card says where to sign in. In the browser first, with a way to open the
 * CLI's window for when the browser hands back a code; then, in that window.
 * A browser sign-in that has gone on too long says why the window may be
 * needed and offers it as a button. Either can be called off.
 */
function signingInCardView(
  status: AiSubscriptionStatus,
  terminalWindows: boolean,
  options: AiSubscriptionCardOptions,
): AiSubscriptionCardView {
  const browser = status.signingIn === 'browser'
  const window = browser && terminalWindows
  const stalled = window && options.signingInStalled === true
  const actions: AiSubscriptionCardAction[] = [
    ...(window ? (['login-window'] as const) : []),
    ...(options.cancelLogin ? (['cancel-login'] as const) : []),
  ]
  return {
    provider: status.provider,
    state: status.state,
    tone: 'neutral',
    statusKey: 'cardSigningIn',
    noteKeys: browser
      ? ['signingInBrowserNote', ...(stalled ? (['signingInStalledNote'] as const) : [])]
      : ['signingInWindowNote'],
    actions,
    links: linksOf(actions).filter((action) => !(stalled && action === 'login-window')),
  }
}

function connectionCardView(status: AiSubscriptionStatus): AiSubscriptionCardView {
  const view = connectionCardParts(status)
  return { ...view, links: linksOf(view.actions) }
}

function connectionCardParts(status: AiSubscriptionStatus): Omit<AiSubscriptionCardView, 'links'> {
  const base = { provider: status.provider, state: status.state }
  switch (status.state) {
    case 'checking':
      return { ...base, tone: 'neutral', statusKey: 'cardChecking', noteKeys: [], actions: [] }
    case 'not-installed':
      return {
        ...base,
        tone: 'neutral',
        statusKey: 'cardNotInstalled',
        noteKeys: ['installNote', 'installReturnNote'],
        actions: ['install', 'install-help'],
      }
    case 'signed-out':
      return {
        ...base,
        tone: 'neutral',
        statusKey: 'cardSignedOut',
        noteKeys: ['loginHowNote', 'loginNote'],
        actions: ['login'],
      }
    case 'ready': {
      const planName = status.planName?.trim() || undefined
      return {
        ...base,
        tone: 'ok',
        statusKey: planName ? 'cardReadyPlan' : 'cardReady',
        planName,
        noteKeys: [],
        actions: [],
      }
    }
    case 'metered':
      // an accepted login keeps the cost warning in sight, without the choice
      return status.meteredAccepted
        ? {
            ...base,
            tone: 'warning',
            statusKey: 'cardMeteredAccepted',
            noteKeys: ['meteredWarning'],
            actions: [],
          }
        : {
            ...base,
            tone: 'warning',
            statusKey: 'cardMetered',
            noteKeys: ['meteredWarning', 'meteredMeaning'],
            actions: ['accept-metered'],
          }
    case 'error': {
      const kind = subscriptionStatusErrorKind(status)
      const outdated = subscriptionNeedsUpdate(status)
      // the file is a fact about every needs-update error; only Claude can also
      // name the version floor and the command
      const programPath =
        kind === 'needs-update' ? status.programPath?.trim() || undefined : undefined
      return {
        ...base,
        tone: 'error',
        statusKey: 'cardError',
        noteKeys: [],
        ...(outdated
          ? { detailKey: 'cardErrNeedsUpdateVersion', detailParams: outdated }
          : { detailKey: STATUS_ERROR_KEYS[kind ?? 'failed'] }),
        ...(programPath ? { programPath } : {}),
        actions: ['recheck'],
      }
    }
  }
}

/** A provider whose check has not reported yet reads as `checking` */
export function aiSubscriptionStatusOf(
  statuses: AiSubscriptionStatuses,
  provider: AiSubscriptionProviderId,
): AiSubscriptionStatus {
  return statuses[provider] ?? { provider, state: 'checking', meteredAccepted: false }
}

// ---- not-connected prompt ----

export interface AiConnectPromptView {
  readonly titleKey: AiSubscriptionStringKey
  readonly bodyKey?: AiSubscriptionStringKey | undefined
  /** `{provider}` for the title and body: the selected provider that cannot run */
  readonly providerName?: string | undefined
  /** connect cards to offer, in order */
  readonly providers: readonly AiSubscriptionProviderId[]
  /** a key provider is selected but not filled in: the way out is the settings page */
  readonly settings: boolean
  /** nothing is connected: the free connections in the settings page are the other way in */
  readonly free: boolean
}

/**
 * What an AI panel shows in place of an error while no provider can run; null
 * once one can. `auto` offers both subscriptions, a selected subscription only
 * its own card (a selection is never replaced by another provider), a selected
 * key provider the way to its settings.
 */
export function aiConnectPromptView(choice: AiProviderChoice): AiConnectPromptView | null {
  if (choice.connected) return null
  if (!choice.provider) {
    return {
      titleKey: 'connectTitle',
      bodyKey: 'connectBody',
      providers: AI_SUBSCRIPTION_PROVIDERS,
      settings: false,
      free: true,
    }
  }
  const providerName = aiProviderDisplayName(choice.provider)
  if (isSubscriptionProvider(choice.provider)) {
    return {
      titleKey: 'connectProviderTitle',
      providerName,
      providers: [choice.provider],
      settings: false,
      free: false,
    }
  }
  return {
    titleKey: 'connectProviderTitle',
    bodyKey: 'connectKeyBody',
    providerName,
    providers: [],
    settings: true,
    free: false,
  }
}

// ---- blocked run ----

/** Run errors that mean "this connection cannot go on", as opposed to a transient failure */
export const AI_BLOCKED_RUN_KINDS = [
  'rate-limit',
  'signed-out',
  'not-installed',
  'needs-update',
  'metered-not-accepted',
  'unsafe-tools',
  'not-connected',
  'free-limit',
] as const satisfies readonly AiRunErrorKind[]

export type AiBlockedRunKind = (typeof AI_BLOCKED_RUN_KINDS)[number]

export function isAiBlockedRunKind(kind: unknown): kind is AiBlockedRunKind {
  return (AI_BLOCKED_RUN_KINDS as readonly unknown[]).includes(kind)
}

export interface AiContinueOption {
  readonly provider: AiSubscriptionProviderId
  /** an accepted metered login: the button carries a cost note */
  readonly metered: boolean
}

/**
 * The other connection a blocked run may be continued on, if any: a subscription
 * provider that is `ready`, else one on a metered login the user already
 * accepted. Never the blocked provider itself and never a key provider — the
 * user switches by pressing the button, nothing switches on its own.
 */
export function aiContinueOption(
  settings: Pick<AiSettings, 'meteredAccepted'>,
  statuses: AiSubscriptionStatuses,
  blocked?: AiProviderId | undefined,
): AiContinueOption | null {
  const others = AI_SUBSCRIPTION_PROVIDERS.filter((id) => id !== blocked)
  const connectionOf = (id: AiSubscriptionProviderId) =>
    subscriptionConnection(settings, statuses[id])
  const ready = others.find((id) => connectionOf(id) === 'subscription')
  if (ready) return { provider: ready, metered: false }
  const metered = others.find((id) => connectionOf(id) === 'metered')
  return metered ? { provider: metered, metered: true } : null
}

// ---- run error wording ----

/** What a failed run says about its cause (agent-core's IpcStreamErrorCause satisfies it) */
export interface AiRunErrorCause {
  readonly kind: AiRunErrorKind
  /** the provider the error is about */
  readonly provider?: AiProviderId | undefined
  /** epoch milliseconds: when the limit resets or calls are allowed again */
  readonly resetsAt?: number | undefined
}

/**
 * A reset time as the user reads it: the clock time while it falls on today,
 * with the date in front once it does not (a 7-day window resets days ahead).
 */
export function formatAiResetTime(lang: Lang, resetsAt: number, now: number = Date.now()): string {
  const at = new Date(resetsAt)
  const today = new Date(now)
  const sameDay =
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate()
  return new Intl.DateTimeFormat(
    htmlLang(lang),
    sameDay
      ? { hour: 'numeric', minute: '2-digit' }
      : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  ).format(at)
}

/**
 * The localized message for a run error of the subscription contract, so every
 * editor words it the same way. Returns undefined for the kinds each editor
 * already words itself (`timeout`, `credits`, `network`, `overloaded`), which
 * makes it usable directly as the transport's `errorText` option.
 */
export function aiRunErrorText(
  lang: Lang,
  cause: AiRunErrorCause,
  now?: number,
): string | undefined {
  const hasTime = typeof cause.resetsAt === 'number' && Number.isFinite(cause.resetsAt)
  const time = hasTime ? formatAiResetTime(lang, cause.resetsAt as number, now) : ''
  // only Claude can start with tools of its own, and the error names no provider
  const provider = aiProviderDisplayName(
    cause.provider ?? (cause.kind === 'unsafe-tools' ? 'claude-code' : undefined),
  )
  switch (cause.kind) {
    case 'not-connected':
      return aiSubscriptionText(lang, 'errNotConnected')
    case 'not-installed':
      return aiSubscriptionText(lang, 'errNotInstalled', { provider })
    case 'signed-out':
      return aiSubscriptionText(lang, 'errSignedOut', { provider })
    case 'rate-limit':
      return hasTime
        ? aiSubscriptionText(lang, 'errRateLimitReset', { provider, time })
        : aiSubscriptionText(lang, 'errRateLimit', { provider })
    case 'unsafe-tools':
      return aiSubscriptionText(lang, 'errUnsafeTools', { provider })
    case 'metered-not-accepted':
      return aiSubscriptionText(lang, 'errMeteredNotAccepted', { provider })
    case 'needs-update':
      return aiSubscriptionText(lang, 'errNeedsUpdate', { provider })
    case 'headless-limit':
      return hasTime
        ? aiSubscriptionText(lang, 'errHeadlessLimitReset', { time })
        : aiSubscriptionText(lang, 'errHeadlessLimit')
    case 'free-limit':
      return hasTime
        ? aiSubscriptionText(lang, 'errFreeLimitReset', { time })
        : aiSubscriptionText(lang, 'errFreeLimit')
    default:
      return undefined
  }
}

// ---- usage ----

const USAGE_WINDOWS: readonly AiUsageWindow[] = ['five_hour', 'seven_day']

/**
 * The usage windows worth showing: those at or above the threshold, one per
 * provider and window (the latest report wins), subscription order first and
 * the shorter window before the longer one.
 */
export function aiSubscriptionUsageAlerts(
  usage: readonly AiSubscriptionUsage[],
  threshold: number = AI_SUBSCRIPTION_USAGE_THRESHOLD,
): AiSubscriptionUsage[] {
  const latest = new Map<string, AiSubscriptionUsage>()
  for (const entry of usage) latest.set(`${entry.provider}:${entry.window}`, entry)
  return [...latest.values()]
    .filter((entry) => Number.isFinite(entry.utilization) && entry.utilization >= threshold)
    .sort(
      (a, b) =>
        AI_SUBSCRIPTION_PROVIDERS.indexOf(a.provider) -
          AI_SUBSCRIPTION_PROVIDERS.indexOf(b.provider) ||
        USAGE_WINDOWS.indexOf(a.window) - USAGE_WINDOWS.indexOf(b.window),
    )
}

/** 0.83 → 83; clamped to 0..100 */
export function aiUsagePercent(utilization: number): number {
  return Math.max(0, Math.min(100, Math.round(utilization * 100)))
}

/** "83% used · resets at 5:10 PM" */
export function aiSubscriptionUsageText(
  lang: Lang,
  usage: Pick<AiSubscriptionUsage, 'utilization' | 'resetsAt'>,
  now?: number,
): string {
  return aiSubscriptionText(lang, 'usageLine', {
    percent: aiUsagePercent(usage.utilization),
    time: formatAiResetTime(lang, usage.resetsAt, now),
  })
}

/** "Claude · 5-hour limit": which window a usage line is about */
export function aiSubscriptionUsageLabel(
  lang: Lang,
  usage: Pick<AiSubscriptionUsage, 'provider' | 'window'>,
): string {
  const window = aiSubscriptionText(
    lang,
    usage.window === 'seven_day' ? 'usageWindowSevenDay' : 'usageWindowFiveHour',
  )
  return `${aiSubscriptionProviderName(usage.provider)} · ${window}`
}
