/**
 * The AI panel's side of the subscription connection: the live statuses of the
 * two providers and the actions of their connect cards.
 *
 * Every call is allowed to fail. The main-process handlers are registered by
 * another module of the app (the docs main), a standalone run has none, and a
 * preload from an older build exposes nothing at all; in each case the statuses
 * simply stay `checking` and an action does nothing. Nothing here throws or
 * leaves a rejected promise behind.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AiSubscriptionProviderId,
  AiSubscriptionState,
  SubscriptionConnectHelpPath,
  SubscriptionStatusMap,
} from '@genoffice/ai-provider/browser'
import type { HtmlApi } from '../../shared/ipc'
import type { HtmlSubscriptionApi } from '../../shared/subscription-api'
import { checkingSubscriptionStatuses } from '../../shared/subscription-api'

export interface SubscriptionConnection {
  readonly statuses: SubscriptionStatusMap
  /** an action is in flight: the cards keep their buttons but ignore them */
  readonly busy: boolean
  readonly install: (provider: AiSubscriptionProviderId) => void
  /** the official update of a program below the app's floor, in a terminal window */
  readonly update: (provider: AiSubscriptionProviderId) => void
  /** end a sign-in the app started */
  readonly cancelLogin: (provider: AiSubscriptionProviderId) => void
  readonly login: (provider: AiSubscriptionProviderId) => void
  readonly recheck: (provider: AiSubscriptionProviderId) => void
  readonly acceptMetered: (provider: AiSubscriptionProviderId) => void
  readonly openInstallHelp: (provider: AiSubscriptionProviderId) => void
  /** open the website's step-by-step connect help at the guide's path */
  readonly openConnectHelp: (path: SubscriptionConnectHelpPath | null) => void
  /** look again without a card asking for it (both providers when none is named) */
  readonly refresh: (providers?: AiSubscriptionProviderId[]) => void
}

/** a preload from an older build exposes no subscription API */
function subscriptionApi(): HtmlSubscriptionApi | undefined {
  return (window.htmlApi as Partial<HtmlApi> | undefined)?.subscription
}

/** the answer of an API call, or null when there is no API, no handler, or the call failed */
export async function attemptSubscription<T>(
  call: (api: HtmlSubscriptionApi) => Promise<T>,
): Promise<T | null> {
  const api = subscriptionApi()
  if (!api) return null
  try {
    return await call(api)
  } catch {
    return null
  }
}

/**
 * Live connection state for as long as the panel is mounted: the statuses are
 * read once, follow the main process's change events, and are checked again
 * each time the window regains focus after a login or an install was started,
 * since both happen in another window.
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
      attemptSubscription((api) => api.recheck(providers)).then(apply),
    [apply],
  )

  useEffect(() => {
    alive.current = true
    void attemptSubscription((api) => api.statuses()).then(apply)
    let off: (() => void) | undefined
    try {
      off = subscriptionApi()?.onChanged(apply)
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
      void attemptSubscription((api) => api[kind](provider))
        .then((result) => {
          if (!alive.current) return
          if (result?.ok) {
            launched.current.set(provider, statusesRef.current[provider].state)
            return
          }
          // the update could not be started here: the vendor's own guide is the way on
          if (kind === 'update') {
            void attemptSubscription((api) => api.openInstallHelp(provider))
            return
          }
          // a sign-in that found no program means the shown status is out of date
          if (result?.reason === 'not-installed') void check([provider])
        })
        .finally(() => {
          if (alive.current) setBusy(false)
        })
    },
    [check],
  )

  const install = useCallback(
    (provider: AiSubscriptionProviderId) => launch('install', provider),
    [launch],
  )
  const login = useCallback(
    (provider: AiSubscriptionProviderId) => launch('login', provider),
    [launch],
  )
  const update = useCallback(
    (provider: AiSubscriptionProviderId) => launch('update', provider),
    [launch],
  )
  const cancelLogin = useCallback((provider: AiSubscriptionProviderId) => {
    // the main process ends the sign-in and looks again; the change event follows
    void attemptSubscription((api) => api.cancelLogin(provider))
  }, [])
  const recheck = useCallback(
    (provider: AiSubscriptionProviderId) => {
      setBusy(true)
      void check([provider]).finally(() => {
        if (alive.current) setBusy(false)
      })
    },
    [check],
  )
  const acceptMetered = useCallback(
    (provider: AiSubscriptionProviderId) => {
      setBusy(true)
      void attemptSubscription((api) => api.setMeteredAccepted(provider, true))
        .then((result) => apply(result?.statuses ?? null))
        .finally(() => {
          if (alive.current) setBusy(false)
        })
    },
    [apply],
  )
  const openInstallHelp = useCallback((provider: AiSubscriptionProviderId) => {
    void attemptSubscription((api) => api.openInstallHelp(provider))
  }, [])
  const openConnectHelp = useCallback((path: SubscriptionConnectHelpPath | null) => {
    void attemptSubscription((api) => api.openConnectHelp(path))
  }, [])
  const refresh = useCallback(
    (providers?: AiSubscriptionProviderId[]) => {
      void check(providers)
    },
    [check],
  )

  return {
    statuses,
    busy,
    install,
    update,
    cancelLogin,
    login,
    recheck,
    acceptMetered,
    openInstallHelp,
    openConnectHelp,
    refresh,
  }
}
