/**
 * The AI panel's side of the subscription connection. The state machine and
 * the cards' actions are shared by every editor (`@genoffice/ui`); this file
 * only names the bridge this window exposes.
 */
import {
  useSubscriptionConnection as useSharedSubscriptionConnection,
  type SubscriptionConnection,
} from '@genoffice/ui'
import type { EpubSubscriptionApi } from '../../shared/subscription-api'

export type { SubscriptionConnection }

/** the answer of an API call, or null when there is no API, no handler, or the call failed */
export async function attemptSubscription<T>(
  call: (api: EpubSubscriptionApi) => Promise<T>,
): Promise<T | null> {
  const api = window.epubApi?.subscription
  if (!api) return null
  try {
    return await call(api)
  } catch {
    return null
  }
}

export function useSubscriptionConnection(): SubscriptionConnection {
  return useSharedSubscriptionConnection({
    api: () => window.epubApi?.subscription,
    help: 'api',
  })
}
