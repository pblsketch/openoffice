/**
 * The AI panel's side of the subscription contract: what a failed run says
 * about its connection, which tools have a route, and the live connection
 * statuses. What stands between the user and a run (connect first, read the
 * first-connection notice) is the send gate every editor shares
 * (`useAiSendGate` in @genoffice/ui). The connection state machine itself is
 * shared too; this file only names the slides bridge and lays its actions out
 * for the connect card.
 */
import { useMemo } from 'react'
import type {
  AiProviderId,
  AiRunErrorKind,
  AiSubscriptionProviderId,
  SubscriptionConnectHelpPath,
  SubscriptionStatusMap,
} from '@genoffice/ai-provider/browser'
import type { IpcStreamError } from '@genoffice/agent-core'
import {
  isAiBlockedRunKind,
  useSubscriptionConnection as useSharedSubscriptionConnection,
  type AiSubscriptionCardActions,
} from '@genoffice/ui'
import type { AiToolCapabilities } from '../../shared/ipc'

// ---- a run that stopped because its connection cannot go on ----

export interface BlockedRun {
  kind: AiRunErrorKind
  provider?: AiProviderId
  /** epoch milliseconds: when a used-up limit resets */
  resetsAt?: number
}

/** The blocked-run notice for a failed turn; null for every failure that keeps the plain error line */
export function blockedRunOf(error: IpcStreamError | null | undefined): BlockedRun | null {
  if (!error || !isAiBlockedRunKind(error.kind)) return null
  return {
    kind: error.kind,
    ...(error.provider !== undefined ? { provider: error.provider } : {}),
    ...(error.resetsAt !== undefined ? { resetsAt: error.resetsAt } : {}),
  }
}

// ---- which tools have a route ----

/** The skill's tool gates from the main process's capability report; nothing is offered before it answered */
export function toolGatesOf(capabilities: AiToolCapabilities | null | undefined): {
  imageGeneration: boolean
  mediaAnalysis: boolean
} {
  return {
    imageGeneration: capabilities?.imageGeneration.available === true,
    mediaAnalysis:
      capabilities?.imageAnalysis.available === true ||
      capabilities?.videoAnalysis.available === true,
  }
}

// ---- live connection statuses ----

export interface SubscriptionConnection {
  readonly statuses: SubscriptionStatusMap
  /** an action is in flight: the cards keep their buttons but ignore them */
  readonly busy: boolean
  /** read the last known statuses again (cheap: no program is started) */
  readonly refresh: (providers?: AiSubscriptionProviderId[]) => void
  readonly actions: AiSubscriptionCardActions
  /** open the website's step-by-step connect help at the guide's path */
  readonly openConnectHelp: (path: SubscriptionConnectHelpPath | null) => void
}

export function useSubscriptionConnection(): SubscriptionConnection {
  const shared = useSharedSubscriptionConnection({
    api: () => window.slidesApi?.aiSubscription,
    help: 'window',
    refreshMode: 'statuses',
    refreshOnFocus: true,
    openUrl: (url) => {
      window.open(url, '_blank', 'noreferrer')
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
    refresh: shared.refresh,
    actions,
    openConnectHelp: shared.openConnectHelp,
  }
}
