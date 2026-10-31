/**
 * The AI panel's side of the subscription connection. The state machine and
 * the cards' actions are shared by every editor (`@genoffice/ui`); this file
 * only names the bridge this window exposes. The `attemptSubscription` helper
 * stays here for the PDF screens that call the bridge directly.
 *
 * Every call is allowed to fail: the main-process handlers are registered by
 * another module of the app (the docs main) and do not exist in a standalone
 * pdf window.
 */
import {
  useSubscriptionConnection as useSharedSubscriptionConnection,
  type SubscriptionConnection,
} from '@genoffice/ui'
import type { SubscriptionApi } from '../../shared/subscription-api'

export type { SubscriptionConnection }

/** the answer of an API call, or null when there is no API, no handler, or the call failed */
export async function attemptSubscription<T>(
  call: (api: SubscriptionApi) => Promise<T>,
): Promise<T | null> {
  const api = window.pdfApi?.subscription
  if (!api) return null
  try {
    return await call(api)
  } catch {
    return null
  }
}

export function useSubscriptionConnection(): SubscriptionConnection {
  return useSharedSubscriptionConnection({
    api: () => window.pdfApi?.subscription,
    help: 'api',
    checkOnMount: true,
  })
}
