/**
 * The renderer's side of the subscription connection, shared by every editor
 * and the shell: the live statuses of the two providers and the actions of
 * their connect cards.
 *
 * The host passes the preload bridge it exposes (`window.aiOfficeSubscription`,
 * `window.pdfApi.subscription`, …). No IPC name lives here; a missing API, a
 * missing handler or a failed call simply leaves the statuses `checking` and an
 * action does nothing. Nothing here throws or leaves a rejected promise behind.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AiSubscriptionProviderId,
  AiSubscriptionState,
  SubscriptionConnectHelpPath,
  SubscriptionLaunchResult,
  SubscriptionLoginMode,
  SubscriptionMeteredResult,
  SubscriptionStatusMap,
} from '@genoffice/ai-provider/browser'
import {
  checkingSubscriptionStatuses,
  subscriptionConnectHelpUrl,
} from '@genoffice/ai-provider/browser'
import { AI_SUBSCRIPTION_INSTALL_HELP_URLS } from './ai-subscription'

/** The part of a preload's subscription bridge this hook calls */
export interface SubscriptionApiLike {
  statuses(): Promise<SubscriptionStatusMap>
  recheck(providers?: AiSubscriptionProviderId[]): Promise<SubscriptionStatusMap>
  login(
    provider: AiSubscriptionProviderId,
    mode?: SubscriptionLoginMode,
  ): Promise<SubscriptionLaunchResult>
  install(provider: AiSubscriptionProviderId): Promise<SubscriptionLaunchResult>
  update(provider: AiSubscriptionProviderId): Promise<SubscriptionLaunchResult>
  cancelLogin(provider: AiSubscriptionProviderId): Promise<SubscriptionLaunchResult>
  setMeteredAccepted(
    provider: AiSubscriptionProviderId,
    accepted: boolean,
  ): Promise<SubscriptionMeteredResult>
  onChanged(handler: (statuses: SubscriptionStatusMap) => void): () => void
  logout?(provider: AiSubscriptionProviderId): Promise<SubscriptionLaunchResult>
  codexImageAvailable?(): Promise<boolean>
  openInstallHelp?(provider: AiSubscriptionProviderId): Promise<void>
  openConnectHelp?(path: SubscriptionConnectHelpPath | null): Promise<void>
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
  /** `window`: the CLI's own window, where a code the browser shows is pasted */
  readonly login: (provider: AiSubscriptionProviderId, mode?: SubscriptionLoginMode) => void
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
  /** "use anyway" on a metered login; resolves once the answer is in */
  readonly acceptMetered: (provider: AiSubscriptionProviderId) => Promise<void>
  readonly openInstallHelp: (provider: AiSubscriptionProviderId) => void
  /** open the website's step-by-step connect help at the guide's path */
  readonly openConnectHelp: (path: SubscriptionConnectHelpPath | null) => void
  /** read the statuses again without a card asking (shell/slides) or check them (editors) */
  readonly refresh: (providers?: AiSubscriptionProviderId[]) => void
}

export interface UseSubscriptionConnectionOptions {
  /** the preload bridge this window exposes, read at every call */
  readonly api: () => SubscriptionApiLike | undefined
  /**
   * `checkOnMount` also runs a check when the panel opens (the PDF panel and
   * the settings screen did; the editors only read the last known statuses).
   */
  readonly checkOnMount?: boolean
  /**
   * What `refresh` does: `recheck` starts the programs (the editors' model
   * picker), `statuses` only reads the last known answer (shell, slides).
   */
  readonly refreshMode?: 'recheck' | 'statuses'
  /** read the statuses on focus even when no login or install was started (slides) */
  readonly refreshOnFocus?: boolean
  /** read `codexImageAvailable` once on mount (shell) */
  readonly readCodexImageAvailable?: boolean
  /**
   * How a browser page is opened when the bridge has no handler: `window`
   * opens it here (the editors), `api` asks the main process (shell, pdf).
   * `auto` uses the bridge's handler when it has one and falls back to `window`.
   */
  readonly help?: 'auto' | 'window' | 'api'
  /** a host opener for the fallback (sheets' `desktopApi.openExternal`); `window.open` when absent */
  readonly openUrl?: ((url: string) => void) | undefined
}

function safeApi(api: () => SubscriptionApiLike | undefined): SubscriptionApiLike | undefined {
  try {
    return api()
  } catch {
    return undefined
  }
}

/** the answer of an API call, or null when there is no API, no handler, or the call failed */
async function attempt<T>(
  api: () => SubscriptionApiLike | undefined,
  call: (bridge: SubscriptionApiLike) => Promise<T>,
): Promise<T | null> {
  const bridge = safeApi(api)
  if (!bridge) return null
  try {
    return await call(bridge)
  } catch {
    return null
  }
}

/**
 * Live connection state for as long as the calling component is mounted: the
 * statuses are read when it mounts, follow the main process's change events,
 * and are checked again each time the window regains focus after a login or an
 * install was started, since both happen in another window.
 */
export function useSubscriptionConnection(
  options: UseSubscriptionConnectionOptions,
): SubscriptionConnection {
  const [statuses, setStatuses] = useState<SubscriptionStatusMap>(checkingSubscriptionStatuses())
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<SubscriptionConnection['failed']>({})
  const [codexImageAvailable, setCodexImageAvailable] = useState(false)
  const alive = useRef(true)
  const statusesRef = useRef(statuses)
  statusesRef.current = statuses
  const optionsRef = useRef(options)
  optionsRef.current = options
  /**
   * providers with a login or install under way, and the state each was in when it started;
   * null for a sign-in with another account, which is checked once on the next return
   */
  const launched = useRef(new Map<AiSubscriptionProviderId, AiSubscriptionState | null>())

  const apply = useCallback((next: SubscriptionStatusMap | null) => {
    if (!next || !alive.current) return
    for (const [provider, state] of launched.current) {
      if (state !== null && next[provider]?.state !== state) launched.current.delete(provider)
    }
    setStatuses(next)
  }, [])

  const check = useCallback(
    (providers?: AiSubscriptionProviderId[]) =>
      attempt(optionsRef.current.api, (api) => api.recheck(providers)).then(apply),
    [apply],
  )

  const openHelp = useCallback((provider: AiSubscriptionProviderId) => {
    const { api, help = 'auto', openUrl } = optionsRef.current
    const bridge = safeApi(api)
    if (help !== 'window' && bridge?.openInstallHelp) {
      void attempt(api, (value) => value.openInstallHelp!(provider))
      return
    }
    const url = AI_SUBSCRIPTION_INSTALL_HELP_URLS[provider]
    if (openUrl) openUrl(url)
    else window.open(url)
  }, [])

  const openConnectHelp = useCallback((path: SubscriptionConnectHelpPath | null) => {
    const { api, help = 'auto', openUrl } = optionsRef.current
    const bridge = safeApi(api)
    if (help !== 'window' && bridge?.openConnectHelp) {
      void attempt(api, (value) => value.openConnectHelp!(path))
      return
    }
    const url = subscriptionConnectHelpUrl(path)
    if (openUrl) openUrl(url)
    else window.open(url)
  }, [])

  useEffect(() => {
    alive.current = true
    void attempt(optionsRef.current.api, (api) => api.statuses()).then(apply)
    if (optionsRef.current.checkOnMount) void check()
    if (optionsRef.current.readCodexImageAvailable) {
      void attempt(optionsRef.current.api, (api) =>
        api.codexImageAvailable ? api.codexImageAvailable() : Promise.resolve(false),
      ).then((available) => {
        if (alive.current) setCodexImageAvailable(available === true)
      })
    }
    let off: (() => void) | undefined
    try {
      off = safeApi(optionsRef.current.api)?.onChanged(apply)
    } catch {
      // no event source: the statuses still follow the checks
    }
    const onFocus = () => {
      if (launched.current.size === 0) {
        if (optionsRef.current.refreshOnFocus) {
          void attempt(optionsRef.current.api, (api) => api.statuses()).then(apply)
        }
        return
      }
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
      mode?: SubscriptionLoginMode,
    ) => {
      setBusy(true)
      setFailed((current) => ({ ...current, [provider]: undefined }))
      void attempt(optionsRef.current.api, (api) =>
        kind === 'login' && mode ? api.login(provider, mode) : api[kind](provider),
      )
        .then((result) => {
          if (!alive.current) return
          if (result?.ok) {
            launched.current.set(
              provider,
              sameState ? null : (statusesRef.current[provider]?.state ?? 'checking'),
            )
            return
          }
          // the update could not be started here: the vendor's own guide is the way on
          if (kind === 'update') {
            openHelp(provider)
            return
          }
          setFailed((current) => ({ ...current, [provider]: kind }))
          // no install command for this system: the vendor's guide is the way forward
          if (kind === 'install' && result?.installUrl) openHelp(provider)
          // a launch that could not start means the shown status may be out of date
          if (result?.reason === 'not-installed') void check([provider])
        })
        .finally(() => {
          if (alive.current) setBusy(false)
        })
    },
    [check, openHelp],
  )

  const install = useCallback(
    (provider: AiSubscriptionProviderId) => launch('install', provider),
    [launch],
  )
  const login = useCallback(
    (provider: AiSubscriptionProviderId, mode?: SubscriptionLoginMode) =>
      launch('login', provider, false, mode),
    [launch],
  )
  const update = useCallback(
    (provider: AiSubscriptionProviderId) => launch('update', provider),
    [launch],
  )
  const cancelLogin = useCallback((provider: AiSubscriptionProviderId) => {
    // the main process ends the sign-in and looks again; the change event follows
    void attempt(optionsRef.current.api, (api) => api.cancelLogin(provider))
  }, [])
  const switchAccount = useCallback(
    (provider: AiSubscriptionProviderId) => launch('login', provider, true),
    [launch],
  )
  const logout = useCallback(
    (provider: AiSubscriptionProviderId) => {
      setBusy(true)
      setFailed((current) => ({ ...current, [provider]: undefined }))
      void attempt(optionsRef.current.api, (api) => {
        if (!api.logout) throw new Error('no logout handler')
        return api.logout(provider)
      })
        .then((result) => {
          if (!alive.current) return
          if (!result?.ok) setFailed((current) => ({ ...current, [provider]: 'logout' }))
          // the main process looked again before it answered: show what it found
          return attempt(optionsRef.current.api, (api) => api.statuses()).then(apply)
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
  const acceptMetered = useCallback(
    async (provider: AiSubscriptionProviderId) => {
      setBusy(true)
      const result = await attempt(optionsRef.current.api, (api) =>
        api.setMeteredAccepted(provider, true),
      )
      apply(result?.statuses ?? null)
      if (alive.current) setBusy(false)
    },
    [apply],
  )
  const refresh = useCallback(
    (providers?: AiSubscriptionProviderId[]) => {
      if (optionsRef.current.refreshMode === 'statuses') {
        void attempt(optionsRef.current.api, (api) => api.statuses()).then(apply)
        return
      }
      void check(providers)
    },
    [apply, check],
  )

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
    acceptMetered,
    openInstallHelp: openHelp,
    openConnectHelp,
    refresh,
  }
}
