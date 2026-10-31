/**
 * The AI panel's side of the subscription connection. The state machine and
 * the cards' actions are shared by every editor (`@genoffice/ui`); this file
 * only names the bridge this window exposes and lays its actions out for the
 * connect card.
 */
import { useMemo } from 'react'
import {
  useSubscriptionConnection as useSharedSubscriptionConnection,
  type AiSubscriptionCardActions,
} from '@genoffice/ui'
import type {
  AiSubscriptionProviderId,
  SubscriptionConnectHelpPath,
  SubscriptionStatusMap,
} from '@genoffice/ai-provider/browser'

export interface SubscriptionConnection {
  readonly statuses: SubscriptionStatusMap
  /** an action is in flight: the cards keep their buttons but ignore them */
  readonly busy: boolean
  /** the connect cards' buttons */
  readonly actions: AiSubscriptionCardActions
  /** open the website's step-by-step connect help at the guide's path */
  readonly openConnectHelp: (path: SubscriptionConnectHelpPath | null) => void
  /** look again without a card asking for it (both providers when none is named) */
  readonly refresh: (providers?: AiSubscriptionProviderId[]) => void
}

export function useSubscriptionConnection(): SubscriptionConnection {
  const shared = useSharedSubscriptionConnection({
    api: () => window.desktopApi?.aiSubscription,
    help: 'window',
    openUrl: (url) => {
      void Promise.resolve(window.desktopApi?.openExternal(url)).catch(() => undefined)
    },
  })
  const actions = useMemo<AiSubscriptionCardActions>(
    () => ({
      onInstall: shared.install,
      onLogin: shared.login,
      onRecheck: shared.recheck,
      onAcceptMetered: shared.acceptMetered,
      onOpenInstallHelp: shared.openInstallHelp,
      onUpdate: shared.update,
      onCancelLogin: shared.cancelLogin,
    }),
    [
      shared.install,
      shared.login,
      shared.recheck,
      shared.acceptMetered,
      shared.openInstallHelp,
      shared.update,
      shared.cancelLogin,
    ],
  )
  return {
    statuses: shared.statuses,
    busy: shared.busy,
    actions,
    openConnectHelp: shared.openConnectHelp,
    refresh: shared.refresh,
  }
}
