/**
 * What the home screen and the first-run onboarding read off the subscription
 * connection, as plain functions over the statuses and the AI settings: the
 * one-line summary of the settings entry, whether the first-connection notice
 * is due, and the hint an AI surface shows while nothing is connected. The
 * components only lay these results out, so the rules are testable without a DOM.
 */
import {
  AI_SUBSCRIPTION_PROVIDERS,
  providerSelectionOf,
  selectAiProvider,
  subscriptionConnection,
  subscriptionStateOf,
} from '@genoffice/ai-provider/browser'
import type {
  AiProviderId,
  AiSettings,
  AiSubscriptionProviderId,
  AiSubscriptionStatus,
  AiSubscriptionStatuses,
} from '@genoffice/ai-provider/browser'
import { aiConnectPromptView, aiSubscriptionNoticeDue } from '@genoffice/ui'
import type { AiConnectPromptView } from '@genoffice/ui'

/**
 * A provider AI can run on right now, going by its status alone: a
 * subscription login, or a metered login the user accepted (the status carries
 * that acceptance, built by the main process from the stored setting).
 */
function isUsable(status: AiSubscriptionStatus | undefined): boolean {
  if (!status) return false
  return (
    subscriptionConnection(
      { meteredAccepted: { [status.provider]: status.meteredAccepted } },
      status,
    ) !== null
  )
}

/** The subscription providers AI can run on right now, in catalog order */
export function usableSubscriptionProviders(
  statuses: AiSubscriptionStatuses,
): AiSubscriptionProviderId[] {
  return AI_SUBSCRIPTION_PROVIDERS.filter((provider) => isUsable(statuses[provider]))
}

export interface SubscriptionSummary {
  /** `checking` only while nothing is connected and an answer is still out */
  readonly state: 'connected' | 'checking' | 'disconnected'
  /** the providers AI can run on, in catalog order; empty unless `connected` */
  readonly connected: readonly AiSubscriptionProviderId[]
}

/** Where the subscription connection stands, for the one-line entry on the home screen */
export function subscriptionSummary(statuses: AiSubscriptionStatuses): SubscriptionSummary {
  const connected = usableSubscriptionProviders(statuses)
  if (connected.length > 0) return { state: 'connected', connected }
  const checking = AI_SUBSCRIPTION_PROVIDERS.some(
    (provider) => subscriptionStateOf(statuses, provider) === 'checking',
  )
  return { state: checking ? 'checking' : 'disconnected', connected: [] }
}

export interface HomeAiEntry {
  /**
   * `checking` only while nothing is named and an answer is still out;
   * `needs-connection` when the provider the user selected cannot run
   */
  readonly state: 'connected' | 'checking' | 'needs-connection' | 'disconnected'
  /** the providers the entry names, in order; empty unless `connected` or `needs-connection` */
  readonly providers: readonly AiProviderId[]
}

/**
 * What the settings entry on the home screen names. A provider the user
 * selected is the one AI runs on, so it is named alone: when it can run (a
 * key provider, or a subscription, an accepted metered login among them) as
 * connected, and when it cannot as needing a connection, since an explicit
 * selection has no fallback and a signed-in subscription would not stand in.
 * Under `auto` the entry lists the subscriptions signed in on their plan. A
 * metered login runs only once it is selected, so under `auto` it is not
 * named. Without the settings (not read yet) the entry reads the statuses
 * alone, as `subscriptionSummary` does.
 */
export function homeAiEntry(
  settings: AiSettings | null,
  statuses: AiSubscriptionStatuses,
): HomeAiEntry {
  const summary = subscriptionSummary(statuses)
  if (!settings) return { state: summary.state, providers: summary.connected }
  if (providerSelectionOf(settings) !== 'auto') {
    const choice = selectAiProvider(settings, statuses)
    if (choice.connected) return { state: 'connected', providers: [choice.provider] }
    // the selected subscription's check is still out: no other provider stands in meanwhile
    if (choice.reason === 'checking') return { state: 'checking', providers: [] }
    if (choice.provider) return { state: 'needs-connection', providers: [choice.provider] }
  }
  const ready = AI_SUBSCRIPTION_PROVIDERS.filter(
    (provider) => statuses[provider]?.state === 'ready',
  )
  if (ready.length > 0) return { state: 'connected', providers: ready }
  const checking = AI_SUBSCRIPTION_PROVIDERS.some(
    (provider) => subscriptionStateOf(statuses, provider) === 'checking',
  )
  return { state: checking ? 'checking' : 'disconnected', providers: [] }
}

/**
 * Whether the first-connection notice is due: a subscription provider can be
 * used and the notice has not been acknowledged yet. Unreadable settings are
 * never "due": the acknowledgement could not be stored, so it would not stay away.
 */
export function firstConnectionNoticeDue(
  settings: Pick<AiSettings, 'subscriptionNoticeSeen' | 'subscriptionNoticeVersion'> | null,
  statuses: AiSubscriptionStatuses,
): boolean {
  if (!settings || !aiSubscriptionNoticeDue(settings)) return false
  return usableSubscriptionProviders(statuses).length > 0
}

/**
 * What an AI surface of the home screen shows in place of running: null when
 * the selected AI can run, and null while a status check that could still
 * connect it is out (no "connect" hint flashes over a login that is fine).
 */
export function aiConnectHint(
  settings: AiSettings | null,
  statuses: AiSubscriptionStatuses,
): AiConnectPromptView | null {
  if (!settings) return null
  const view = aiConnectPromptView(selectAiProvider(settings, statuses))
  if (!view) return null
  const waiting = view.providers.some(
    (provider) => subscriptionStateOf(statuses, provider) === 'checking',
  )
  return waiting ? null : view
}
