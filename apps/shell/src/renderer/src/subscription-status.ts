/**
 * What the home screen and the first-run onboarding read off the subscription
 * connection, as plain functions over the statuses and the AI settings: the
 * one-line summary of the settings entry, whether the first-connection notice
 * is due, and the hint an AI surface shows while nothing is connected. The
 * components only lay these results out, so the rules are testable without a DOM.
 */
import {
  AI_SUBSCRIPTION_PROVIDERS,
  selectAiProvider,
  subscriptionConnection,
  subscriptionStateOf,
} from '@genoffice/ai-provider/browser'
import type {
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
