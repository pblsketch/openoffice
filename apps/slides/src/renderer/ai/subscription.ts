/**
 * The AI panel's side of the subscription contract: what a failed run says
 * about its connection, which tools have a route, and the live connection
 * statuses. What stands between the user and a run (connect first, read the
 * first-connection notice) is the send gate every editor shares
 * (`useAiSendGate` in @genoffice/ui).
 *
 * Every bridge call is allowed to fail. The main-process handlers are
 * registered once per process by whichever module gets there first, and an
 * older preload exposes nothing at all; in both cases the statuses simply stay
 * `checking`. Nothing here throws or leaves a rejected promise behind.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  AiProviderId,
  AiRunErrorKind,
  AiSubscriptionProviderId,
  SubscriptionConnectHelpPath,
  SubscriptionStatusMap,
} from '@genoffice/ai-provider/browser'
import { subscriptionConnectHelpUrl } from '@genoffice/ai-provider/browser'
import type { IpcStreamError } from '@genoffice/agent-core'
import {
  AI_SUBSCRIPTION_INSTALL_HELP_URLS,
  isAiBlockedRunKind,
  type AiSubscriptionCardActions,
} from '@genoffice/ui'
import type { AiToolCapabilities } from '../../shared/ipc'
import { checkingSubscriptionStatuses, type SubscriptionApi } from '../../shared/subscription-api'

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

/** the answer of a bridge call, or null when there is no bridge, no handler, or the call failed */
async function attempt<T>(call: (api: SubscriptionApi) => Promise<T>): Promise<T | null> {
  const api = window.slidesApi?.aiSubscription
  if (!api) return null
  try {
    return await call(api)
  } catch {
    return null
  }
}

export interface SubscriptionConnection {
  readonly statuses: SubscriptionStatusMap
  /** an action is in flight: the cards keep their buttons but ignore them */
  readonly busy: boolean
  /** read the last known statuses again (cheap: no program is started) */
  readonly refresh: () => void
  readonly actions: AiSubscriptionCardActions
  /** open the website's step-by-step connect help at the guide's path */
  readonly openConnectHelp: (path: SubscriptionConnectHelpPath | null) => void
}

/**
 * Live connection state for as long as the panel is mounted: the last known
 * statuses are read when it mounts, follow the main process's change events,
 * and are checked again each time the window regains focus after a sign-in or
 * an install was started, since both happen in another window.
 */
export function useSubscriptionConnection(): SubscriptionConnection {
  const [statuses, setStatuses] = useState<SubscriptionStatusMap>(checkingSubscriptionStatuses)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const statusesRef = useRef(statuses)
  statusesRef.current = statuses
  /** providers with a sign-in or install under way, and the state each was in when it started */
  const launched = useRef(new Map<AiSubscriptionProviderId, string>())

  const apply = useCallback((next: SubscriptionStatusMap | null | undefined) => {
    if (!next || !alive.current) return
    for (const [provider, state] of launched.current) {
      if (next[provider].state !== state) launched.current.delete(provider)
    }
    setStatuses(next)
  }, [])

  const refresh = useCallback(() => {
    void attempt((api) => api.statuses()).then(apply)
  }, [apply])

  const check = useCallback(
    (providers?: AiSubscriptionProviderId[]) =>
      attempt((api) => api.recheck(providers)).then(apply),
    [apply],
  )

  useEffect(() => {
    alive.current = true
    refresh()
    let off: (() => void) | undefined
    try {
      off = window.slidesApi?.aiSubscription?.onChanged(apply)
    } catch {
      // no event source: the statuses still follow the reads above
    }
    const onFocus = () => {
      if (launched.current.size > 0) void check([...launched.current.keys()])
      else refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      alive.current = false
      window.removeEventListener('focus', onFocus)
      off?.()
    }
  }, [apply, check, refresh])

  const during = useCallback((work: Promise<unknown>) => {
    setBusy(true)
    void work.finally(() => {
      if (alive.current) setBusy(false)
    })
  }, [])

  const openHelp = useCallback((provider: AiSubscriptionProviderId) => {
    // routed to the system browser by the main process's window-open handler
    window.open(AI_SUBSCRIPTION_INSTALL_HELP_URLS[provider], '_blank', 'noreferrer')
  }, [])
  const openConnectHelp = useCallback((path: SubscriptionConnectHelpPath | null) => {
    window.open(subscriptionConnectHelpUrl(path), '_blank', 'noreferrer')
  }, [])

  const launch = useCallback(
    (kind: 'install' | 'login' | 'update', provider: AiSubscriptionProviderId) => {
      during(
        attempt((api) => api[kind](provider)).then((result) => {
          if (result?.ok) launched.current.set(provider, statusesRef.current[provider].state)
          // the update could not be started here: the vendor's own guide is the way on
          else if (kind === 'update') openHelp(provider)
          // nothing was started: show what the connection really is
          else return check([provider])
        }),
      )
    },
    [check, during, openHelp],
  )

  const actions = useMemo<AiSubscriptionCardActions>(
    () => ({
      onInstall: (provider) => launch('install', provider),
      onLogin: (provider) => launch('login', provider),
      onRecheck: (provider) => during(check([provider])),
      onAcceptMetered: (provider) =>
        during(
          attempt((api) => api.setMeteredAccepted(provider, true)).then((r) => apply(r?.statuses)),
        ),
      onOpenInstallHelp: openHelp,
      onUpdate: (provider) => launch('update', provider),
      onCancelLogin: (provider) => {
        // the main process ends the sign-in and looks again; the change event follows
        void attempt((api) => api.cancelLogin(provider))
      },
    }),
    [apply, check, during, launch, openHelp],
  )

  return { statuses, busy, refresh, actions, openConnectHelp }
}
