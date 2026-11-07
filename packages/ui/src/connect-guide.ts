/**
 * The connect guide as plain data: the question asked while nothing is
 * connected ("which AI do you have?"), the path that is open, the three steps
 * of a subscription path, and the text a user copies to ask someone for help.
 * The `AiConnectGuide` component only lays these out.
 */
import {
  AI_SUBSCRIPTION_PROVIDERS,
  subscriptionLoginFailureOf,
  subscriptionStatusErrorKind,
  type AiSubscriptionProviderId,
  type AiSubscriptionStatus,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider/browser'
import { aiSubscriptionStatusOf } from './ai-subscription'
import type { AiSubscriptionStringKey } from './strings-ai-subscription'

/** A way to connect: one of the subscriptions, or the free connections */
export type AiConnectPath = AiSubscriptionProviderId | 'free'

/**
 * The answers to the question. ChatGPT is one answer: its path connects
 * directly, and the Codex program is a way within it (a link on that path),
 * so nobody has to choose between two ChatGPT answers (decision 0081).
 */
export const AI_CONNECT_PATHS: readonly AiConnectPath[] = ['claude-code', 'chatgpt', 'free']

export interface AiConnectPathOption {
  readonly path: AiConnectPath
  readonly titleKey: AiSubscriptionStringKey
  readonly bodyKey: AiSubscriptionStringKey
  /** a short word on what is already there: installed, connected … */
  readonly badgeKey?: AiSubscriptionStringKey | undefined
}

export interface AiConnectGuideView {
  /** the path laid open; null while the question is asked */
  readonly open: AiConnectPath | null
  /** the three answers to the question, in order */
  readonly options: readonly AiConnectPathOption[]
}

const PATH_TEXT: Record<
  AiConnectPath,
  { titleKey: AiSubscriptionStringKey; bodyKey: AiSubscriptionStringKey }
> = {
  'claude-code': { titleKey: 'guidePathClaudeTitle', bodyKey: 'guidePathClaudeBody' },
  chatgpt: { titleKey: 'guidePathCodexTitle', bodyKey: 'guidePathChatGptBody' },
  codex: { titleKey: 'guidePathCodexTitle', bodyKey: 'guidePathCodexBody' },
  free: { titleKey: 'guidePathFreeTitle', bodyKey: 'guidePathFreeBody' },
}

/** The title and the line on what it needs, for any path (the Codex one is not among the answers) */
export function aiConnectPathText(path: AiConnectPath): {
  titleKey: AiSubscriptionStringKey
  bodyKey: AiSubscriptionStringKey
} {
  return PATH_TEXT[path]
}

/** The other way along the ChatGPT answer: Codex from the direct path, and back */
export function aiConnectAlternatePath(path: AiConnectPath): AiConnectPath | null {
  if (path === 'chatgpt') return 'codex'
  if (path === 'codex') return 'chatgpt'
  return null
}

function badgeOf(status: AiSubscriptionStatus): AiSubscriptionStringKey | undefined {
  if (status.signingIn) return 'cardSigningIn'
  // nothing to install: signed out says nothing of its own
  if (status.provider === 'chatgpt') return status.state === 'ready' ? 'guideBadgeReady' : undefined
  switch (status.state) {
    case 'ready':
      return 'guideBadgeReady'
    case 'signed-out':
    case 'metered':
      return 'guideBadgeInstalled'
    case 'error':
      return 'guideBadgeCheck'
    case 'off':
      return 'guideBadgeOff'
    default:
      return undefined
  }
}

/**
 * What the user picked: a path, `ask` for the question itself ("choose another
 * way", even while a login runs), or null for nothing picked yet.
 */
export type AiConnectChoice = AiConnectPath | 'ask' | null

/**
 * Which path is open. The user's own choice wins; without one, a login under
 * way opens its path (the user is in the middle of it), then a connection
 * that works: a subscription, then a free connection (`freeConnected`, known
 * only to a host that reads the free settings). Otherwise the question is asked.
 */
export function aiConnectGuideView(
  statuses: AiSubscriptionStatuses,
  chosen: AiConnectChoice,
  freeConnected = false,
): AiConnectGuideView {
  const all = AI_SUBSCRIPTION_PROVIDERS.map((provider) =>
    aiSubscriptionStatusOf(statuses, provider),
  )
  const open =
    chosen === 'ask'
      ? null
      : (chosen ??
        all.find((status) => status.signingIn)?.provider ??
        all.find((status) => status.state === 'ready')?.provider ??
        (freeConnected ? 'free' : null))
  const options = AI_CONNECT_PATHS.map((path): AiConnectPathOption => {
    const badgeKey =
      path === 'free'
        ? freeConnected
          ? 'guideBadgeReady'
          : undefined
        : path === 'chatgpt'
          ? chatGptAnswerBadge(statuses)
          : badgeOf(aiSubscriptionStatusOf(statuses, path))
    return { path, ...PATH_TEXT[path], ...(badgeKey ? { badgeKey } : {}) }
  })
  return { open, options }
}

/** The ChatGPT answer covers both ways in: connected or signing in on either shows on it */
function chatGptAnswerBadge(statuses: AiSubscriptionStatuses): AiSubscriptionStringKey | undefined {
  const both = [
    aiSubscriptionStatusOf(statuses, 'chatgpt'),
    aiSubscriptionStatusOf(statuses, 'codex'),
  ]
  if (both.some((status) => status.state === 'ready' && !status.signingIn)) return 'guideBadgeReady'
  if (both.some((status) => status.signingIn)) return 'cardSigningIn'
  return undefined
}

export type AiConnectStepId = 'install' | 'login' | 'ready'

export const AI_CONNECT_STEPS: readonly AiConnectStepId[] = ['install', 'login', 'ready']

export const AI_CONNECT_STEP_KEYS: Record<AiConnectStepId, AiSubscriptionStringKey> = {
  install: 'stepInstall',
  login: 'stepLogin',
  ready: 'stepReady',
}

export interface AiConnectStepsView {
  /** the step the user is on; null while the state is not known yet */
  readonly current: AiConnectStepId | null
  /** each step in order, and whether it is behind the user */
  readonly steps: readonly { readonly id: AiConnectStepId; readonly done: boolean }[]
}

/**
 * Where one subscription stands on install → sign in → connected. A program
 * that must be updated first is back on the install step; a check that failed
 * for another reason found the program, so the user is on the sign-in step.
 */
export function aiConnectStepsView(status: AiSubscriptionStatus): AiConnectStepsView {
  const current = currentStep(status)
  // ChatGPT reached directly installs nothing: sign in, then connected
  const ids =
    status.provider === 'chatgpt'
      ? AI_CONNECT_STEPS.filter((id) => id !== 'install')
      : AI_CONNECT_STEPS
  const at = current ? ids.indexOf(current) : -1
  return {
    current,
    steps: ids.map((id, index) => ({
      id,
      done: current === 'ready' || index < at,
    })),
  }
}

function currentStep(status: AiSubscriptionStatus): AiConnectStepId | null {
  if (status.signingIn) return 'login'
  switch (status.state) {
    // a program turned off in this app is on no step until it is turned back on
    case 'checking':
    case 'off':
      return null
    case 'not-installed':
      return 'install'
    case 'error':
      return subscriptionStatusErrorKind(status) === 'needs-update' ? 'install' : 'login'
    case 'ready':
      return 'ready'
    default:
      return 'login'
  }
}

/** What the copied text says about the app and the system it runs on */
export interface AiConnectInfoContext {
  /** `navigator.userAgent`: names the app, its version, Electron and Windows */
  readonly userAgent?: string | undefined
  /** `navigator.platform` */
  readonly platform?: string | undefined
}

const VERSION_SHAPE = /^[\w.+-]{1,40}$/

/**
 * Text a user can paste to whoever helps them: per provider its state, the
 * kind of error, the program version and why the app's own ChatGPT sign-in
 * failed (fixed names), then the app and the system. Nothing
 * else of a status goes in: not the account, not a path, not anything the
 * program printed (an error's own text can name both).
 */
export function aiConnectInfoText(
  statuses: AiSubscriptionStatuses,
  context: AiConnectInfoContext = {},
): string {
  const lines = AI_SUBSCRIPTION_PROVIDERS.map((provider) => {
    const status = aiSubscriptionStatusOf(statuses, provider)
    const parts = [`state=${status.state}`]
    const kind = subscriptionStatusErrorKind(status)
    if (kind) parts.push(`error=${kind}`)
    if (status.version && VERSION_SHAPE.test(status.version))
      parts.push(`version=${status.version}`)
    if (status.signingIn) parts.push(`signing-in=${status.signingIn}`)
    if (status.state === 'metered') parts.push(`accepted=${status.meteredAccepted}`)
    // why the app's own sign-in ended without a connection, read again like the version:
    // fixed names, a status number and an identifier-shaped code only
    const failure =
      status.loginUnfinished === true ? subscriptionLoginFailureOf(status.loginFailure) : undefined
    if (failure) {
      parts.push(`login-failed=${failure.reason}`)
      if (failure.step) parts.push(`step=${failure.step}`)
      if (failure.httpStatus !== undefined) parts.push(`http=${failure.httpStatus}`)
      if (failure.oauthError) parts.push(`oauth-error=${failure.oauthError}`)
    }
    return `${provider}: ${parts.join(' ')}`
  })
  if (context.platform) lines.push(`platform: ${oneLine(context.platform)}`)
  if (context.userAgent) lines.push(`app: ${oneLine(context.userAgent)}`)
  return lines.join('\n')
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 300)
}
