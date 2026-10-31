/**
 * The renderer's side of the subscription connection. The state machine and
 * the cards' actions are shared by every editor and the shell
 * (`@genoffice/ui`); this file only names the bridge this window exposes.
 */
import {
  useSubscriptionConnection as useSharedSubscriptionConnection,
  type SubscriptionLaunchKind,
} from '@genoffice/ui'
import type {
  AiSubscriptionProviderId,
  SubscriptionConnectHelpPath,
  SubscriptionLoginMode,
  SubscriptionStatusMap,
} from '@genoffice/ai-provider/browser'
import type { SubscriptionApi } from '../../shared/subscription-api'

declare global {
  interface Window {
    aiOfficeSubscription?: SubscriptionApi
  }
}

/** a login or install that could not be started, or a sign-out that did not go through */
export type { SubscriptionLaunchKind }

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
  /** window: the CLI own window, where a code the browser shows is pasted */
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
  /** read the last known statuses again without starting a check */
  readonly refresh: () => void
  /** "use anyway" on a metered login; resolves once the answer is in */
  readonly acceptMetered: (provider: AiSubscriptionProviderId) => Promise<void>
  readonly openInstallHelp: (provider: AiSubscriptionProviderId) => void
  /** open the website's step-by-step connect help at the guide's path */
  readonly openConnectHelp: (path: SubscriptionConnectHelpPath | null) => void
}

export function useSubscriptionConnection(): SubscriptionConnection {
  const shared = useSharedSubscriptionConnection({
    api: () => window.aiOfficeSubscription,
    help: 'api',
    checkOnMount: true,
    refreshMode: 'statuses',
    readCodexImageAvailable: true,
  })
  return {
    statuses: shared.statuses,
    busy: shared.busy,
    failed: shared.failed,
    codexImageAvailable: shared.codexImageAvailable,
    install: shared.install,
    update: shared.update,
    cancelLogin: shared.cancelLogin,
    login: shared.login,
    switchAccount: shared.switchAccount,
    logout: shared.logout,
    recheck: shared.recheck,
    refresh: () => shared.refresh(),
    acceptMetered: shared.acceptMetered,
    openInstallHelp: shared.openInstallHelp,
    openConnectHelp: shared.openConnectHelp,
  }
}
