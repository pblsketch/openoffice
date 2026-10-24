/**
 * The renderer's side of the subscription connection: the live statuses of the
 * two providers and the actions of their connect cards.
 *
 * Every call is allowed to fail. In the shell the main-process handlers are
 * registered by another module, and a preload from an older build exposes
 * nothing at all; in both cases the statuses simply stay `checking`. Nothing
 * here throws or leaves a rejected promise behind.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AiSubscriptionProviderId,
  AiSubscriptionState,
  SubscriptionConnectHelpPath,
  SubscriptionStatusMap,
} from '@genoffice/ai-provider/browser'
import { subscriptionConnectHelpUrl } from '@genoffice/ai-provider/browser'
import { AI_SUBSCRIPTION_INSTALL_HELP_URLS, type AiSubscriptionCardActions } from '@genoffice/ui'
import { checkingSubscriptionStatuses, type SubscriptionApi } from '../../shared/subscription-api'

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

/** the answer of an API call, or null when there is no API, no handler, or the call failed */
async function attempt<T>(call: (api: SubscriptionApi) => Promise<T>): Promise<T | null> {
  try {
    const api = window.desktopApi?.aiSubscription
    if (!api) return null
    return await call(api)
  } catch {
    return null
  }
}

function openInstallHelp(provider: AiSubscriptionProviderId): void {
  void Promise.resolve()
    .then(() => window.desktopApi.openExternal(AI_SUBSCRIPTION_INSTALL_HELP_URLS[provider]))
    .catch(() => {})
}

function openConnectHelp(path: SubscriptionConnectHelpPath | null): void {
  void Promise.resolve()
    .then(() => window.desktopApi.openExternal(subscriptionConnectHelpUrl(path)))
    .catch(() => {})
}

/**
 * Live connection state for as long as the AI panel's owner is mounted: the
 * statuses are read on mount, follow the main process's change events, and are
 * checked again each time the window regains focus after a login or an install
 * was started, since both happen in another window.
 */
export function useSubscriptionConnection(): SubscriptionConnection {
  const [statuses, setStatuses] = useState<SubscriptionStatusMap>(checkingSubscriptionStatuses)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const statusesRef = useRef(statuses)
  statusesRef.current = statuses
  /** providers with a login or install under way, and the state each was in when it started */
  const launched = useRef(new Map<AiSubscriptionProviderId, AiSubscriptionState>())

  const apply = useCallback((next: SubscriptionStatusMap | null) => {
    if (!next || !alive.current) return
    for (const [provider, state] of launched.current) {
      if (next[provider].state !== state) launched.current.delete(provider)
    }
    setStatuses(next)
  }, [])

  const check = useCallback(
    (providers?: AiSubscriptionProviderId[]) =>
      attempt((api) => api.recheck(providers)).then(apply),
    [apply],
  )

  useEffect(() => {
    alive.current = true
    void attempt((api) => api.statuses()).then(apply)
    let off: (() => void) | undefined
    try {
      off = window.desktopApi?.aiSubscription?.onChanged(apply)
    } catch {
      // no event source: the statuses still follow the checks
    }
    const onFocus = () => {
      if (launched.current.size > 0) void check([...launched.current.keys()])
    }
    window.addEventListener('focus', onFocus)
    return () => {
      alive.current = false
      window.removeEventListener('focus', onFocus)
      off?.()
    }
  }, [apply, check])

  const launch = useCallback(
    (kind: 'install' | 'login' | 'update', provider: AiSubscriptionProviderId) => {
      setBusy(true)
      void attempt((api) => api[kind](provider))
        .then((result) => {
          if (!alive.current) return
          if (result?.ok) {
            launched.current.set(provider, statusesRef.current[provider].state)
            return
          }
          // the install or update could not be started here: the vendor's own guide is the way on
          if (kind === 'install' || kind === 'update') openInstallHelp(provider)
          // a sign-in that found no program means the shown status is out of date
          else if (result?.reason === 'not-installed') void check([provider])
        })
        .finally(() => {
          if (alive.current) setBusy(false)
        })
    },
    [check],
  )

  const onInstall = useCallback(
    (provider: AiSubscriptionProviderId) => launch('install', provider),
    [launch],
  )
  const onLogin = useCallback(
    (provider: AiSubscriptionProviderId) => launch('login', provider),
    [launch],
  )
  const onUpdate = useCallback(
    (provider: AiSubscriptionProviderId) => launch('update', provider),
    [launch],
  )
  const onCancelLogin = useCallback((provider: AiSubscriptionProviderId) => {
    // the main process ends the sign-in and looks again; the change event follows
    void attempt((api) => api.cancelLogin(provider))
  }, [])
  const onRecheck = useCallback(
    (provider: AiSubscriptionProviderId) => {
      setBusy(true)
      void check([provider]).finally(() => {
        if (alive.current) setBusy(false)
      })
    },
    [check],
  )
  const onAcceptMetered = useCallback(
    (provider: AiSubscriptionProviderId) => {
      setBusy(true)
      void attempt((api) => api.setMeteredAccepted(provider, true))
        .then((result) => apply(result?.statuses ?? null))
        .finally(() => {
          if (alive.current) setBusy(false)
        })
    },
    [apply],
  )
  const refresh = useCallback(
    (providers?: AiSubscriptionProviderId[]) => {
      void check(providers)
    },
    [check],
  )

  return {
    statuses,
    busy,
    actions: {
      onInstall,
      onLogin,
      onRecheck,
      onAcceptMetered,
      onOpenInstallHelp: openInstallHelp,
      onUpdate,
      onCancelLogin,
    },
    openConnectHelp,
    refresh,
  }
}
