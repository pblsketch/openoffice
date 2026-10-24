/**
 * The renderer's side of the subscription connection: the live statuses of the
 * two providers and the actions of their connect cards.
 *
 * Every call is allowed to fail. The main-process handlers are registered by
 * another module of the app, and a preload from an older build exposes nothing
 * at all; in both cases the statuses simply stay `checking` and an action
 * reports that it could not start. Nothing here throws or leaves a rejected
 * promise behind.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AiSubscriptionProviderId,
  SubscriptionConnectHelpPath,
  AiSubscriptionState,
  SubscriptionStatusMap,
} from '@genoffice/ai-provider/browser'
import type { SubscriptionApi } from '../../shared/subscription-api'
import { checkingSubscriptionStatuses } from '../../shared/subscription-api'

declare global {
  interface Window {
    aiOfficeSubscription?: SubscriptionApi
  }
}

/** a login or install that could not be started, or a sign-out that did not go through */
export type SubscriptionLaunchKind = 'install' | 'login' | 'logout'

export interface SubscriptionConnection {
  readonly statuses: SubscriptionStatusMap
  /** an action is in flight: the cards keep their buttons but ignore them */
  readonly busy: boolean
  /** per provider: the launch that could not be started, until the next attempt */
  readonly failed: Partial<Record<AiSubscriptionProviderId, SubscriptionLaunchKind>>
  /** this build can generate images through the Codex subscription */
  readonly codexImageAvailable: boolean
  readonly install: (provider: AiSubscriptionProviderId) => void
  /** the official update of a program below the app's floor, in a terminal window */
  readonly update: (provider: AiSubscriptionProviderId) => void
  /** end a sign-in the app started */
  readonly cancelLogin: (provider: AiSubscriptionProviderId) => void
  readonly login: (provider: AiSubscriptionProviderId) => void
  /**
   * Sign in with another account: the program's own sign-in, started again
   * while it is signed in. It changes the account for the whole PC, so the
   * screen asks the user before it calls this.
   */
  readonly switchAccount: (provider: AiSubscriptionProviderId) => void
  /**
   * Sign out: the program's own sign-out, for the whole PC. The screen asks
   * the user before it calls this.
   */
  readonly logout: (provider: AiSubscriptionProviderId) => void
  readonly recheck: (provider: AiSubscriptionProviderId) => void
  /** read the last known statuses again without starting a check (another view may have changed them) */
  readonly refresh: () => void
  /** "use anyway" on a metered login; resolves once the answer is in */
  readonly acceptMetered: (provider: AiSubscriptionProviderId) => Promise<void>
  readonly openInstallHelp: (provider: AiSubscriptionProviderId) => void
  /** open the website's step-by-step connect help at the guide's path */
  readonly openConnectHelp: (path: SubscriptionConnectHelpPath | null) => void
}

/** the answer of an API call, or null when there is no API, no handler, or the call failed */
async function attempt<T>(call: (api: SubscriptionApi) => Promise<T>): Promise<T | null> {
  const api = window.aiOfficeSubscription
  if (!api) return null
  try {
    return await call(api)
  } catch {
    return null
  }
}

/**
 * Live connection state for as long as the calling component is mounted (the
 * settings dialog, the app frame): the statuses are read and re-checked when it opens, follow
 * the main process's change events, and are checked again each time the window
 * regains focus after a login or an install was started, since both happen in
 * another window. A sign-in with another account leaves the state as it is, so
 * it is checked once on the next return and after that by the main process,
 * which looks again when the sign-in window closes.
 */
export function useSubscriptionConnection(): SubscriptionConnection {
  const [statuses, setStatuses] = useState<SubscriptionStatusMap>(checkingSubscriptionStatuses)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<SubscriptionConnection['failed']>({})
  const [codexImageAvailable, setCodexImageAvailable] = useState(false)
  const alive = useRef(true)
  const statusesRef = useRef(statuses)
  statusesRef.current = statuses
  /**
   * providers with a login or install under way, and the state each was in when it started;
   * null for a sign-in with another account, which is checked once on the next return
   */
  const launched = useRef(new Map<AiSubscriptionProviderId, AiSubscriptionState | null>())

  const apply = useCallback((next: SubscriptionStatusMap | null) => {
    if (!next || !alive.current) return
    for (const [provider, state] of launched.current) {
      if (state !== null && next[provider].state !== state) launched.current.delete(provider)
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
    void check()
    void attempt((api) => api.codexImageAvailable()).then((available) => {
      if (alive.current) setCodexImageAvailable(available === true)
    })
    let off: (() => void) | undefined
    try {
      off = window.aiOfficeSubscription?.onChanged(apply)
    } catch {
      // no event source: the statuses still follow the checks above
    }
    const onFocus = () => {
      if (launched.current.size === 0) return
      void check([...launched.current.keys()])
      for (const [provider, state] of launched.current) {
        if (state === null) launched.current.delete(provider)
      }
    }
    window.addEventListener('focus', onFocus)
    return () => {
      alive.current = false
      window.removeEventListener('focus', onFocus)
      off?.()
    }
  }, [apply, check])

  const launch = useCallback(
    (
      kind: 'install' | 'login' | 'update',
      provider: AiSubscriptionProviderId,
      sameState = false,
    ) => {
      setBusy(true)
      setFailed((current) => ({ ...current, [provider]: undefined }))
      void attempt((api) => api[kind](provider))
        .then((result) => {
          if (!alive.current) return
          if (result?.ok) {
            launched.current.set(provider, sameState ? null : statusesRef.current[provider].state)
            return
          }
          // the update could not be started here: the vendor's own guide is the way on
          if (kind === 'update') {
            void attempt((api) => api.openInstallHelp(provider))
            return
          }
          setFailed((current) => ({ ...current, [provider]: kind }))
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
    void attempt((api) => api.cancelLogin(provider))
  }, [])
  const switchAccount = useCallback(
    (provider: AiSubscriptionProviderId) => launch('login', provider, true),
    [launch],
  )
  const logout = useCallback(
    (provider: AiSubscriptionProviderId) => {
      setBusy(true)
      setFailed((current) => ({ ...current, [provider]: undefined }))
      void attempt((api) => api.logout(provider))
        .then((result) => {
          if (!alive.current) return
          if (!result?.ok) setFailed((current) => ({ ...current, [provider]: 'logout' }))
          // the main process looked again before it answered: show what it found
          return attempt((api) => api.statuses()).then(apply)
        })
        .finally(() => {
          if (alive.current) setBusy(false)
        })
    },
    [apply],
  )
  const recheck = useCallback(
    (provider: AiSubscriptionProviderId) => {
      setBusy(true)
      void check([provider]).finally(() => {
        if (alive.current) setBusy(false)
      })
    },
    [check],
  )
  const refresh = useCallback(() => {
    void attempt((api) => api.statuses()).then(apply)
  }, [apply])
  const acceptMetered = useCallback(
    async (provider: AiSubscriptionProviderId) => {
      setBusy(true)
      const result = await attempt((api) => api.setMeteredAccepted(provider, true))
      apply(result?.statuses ?? null)
      if (alive.current) setBusy(false)
    },
    [apply],
  )
  const openInstallHelp = useCallback((provider: AiSubscriptionProviderId) => {
    void attempt((api) => api.openInstallHelp(provider))
  }, [])
  const openConnectHelp = useCallback((path: SubscriptionConnectHelpPath | null) => {
    void attempt((api) => api.openConnectHelp(path))
  }, [])

  return {
    statuses,
    busy,
    failed,
    codexImageAvailable,
    install,
    update,
    cancelLogin,
    login,
    switchAccount,
    logout,
    recheck,
    refresh,
    acceptMetered,
    openInstallHelp,
    openConnectHelp,
  }
}
