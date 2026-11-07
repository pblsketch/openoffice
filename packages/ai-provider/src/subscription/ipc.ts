/**
 * Main-process side of the subscription IPC contract: one handler per request
 * channel, wired to whatever the caller injects. Nothing here imports Electron,
 * so an app passes its `ipcMain` and the tests pass a stand-in.
 */
import { PRODUCT_NAME } from '@genoffice/i18n'
import {
  createChatGptConnection,
  setChatGptConnection,
  type ChatGptConnection,
  type ChatGptSignInResult,
} from '../chatgpt/connection'
import { createChatGptConnectionFileStore } from '../chatgpt/credentials'
import type { FreeConnectPage } from '../free-connect'
import { codexImageGenerationAvailable } from '../image-backend'
import { isSubscriptionProvider } from '../provider-selection'
import { isSubscriptionCli } from '../providers'
import type {
  AiSettings,
  AiSubscriptionCliId,
  AiSubscriptionProviderId,
  AiSubscriptionSigningIn,
} from '../types'
import {
  SUBSCRIPTION_INSTALL_URLS,
  SUBSCRIPTION_IPC_CHANNELS,
  type SubscriptionLaunchResult,
  type SubscriptionLoginMode,
  type SubscriptionMeteredResult,
  type SubscriptionOffResult,
  type SubscriptionStatusMap,
} from './contract'
import {
  launchSubscriptionInstall,
  launchSubscriptionUpdate,
  launchSubscriptionLogin,
  launchSubscriptionLogout,
  onSubscriptionLoginChange,
  type SubscriptionLoginWindowText,
} from './launch'
import type { SubscriptionLocator } from './locate'
import { createMeteredAcceptanceFileStore } from './metered'
import { listSubscriptionModels, type SubscriptionModelLister } from './models'
import { createSubscriptionStatusService, type SubscriptionStatusService } from './service'
import type { SubscriptionChildLike, SubscriptionSpawn } from './process'
import type { SubscriptionDetector } from './status'

/** The part of Electron's `ipcMain` this helper uses */
export interface SubscriptionIpcMain {
  handle(channel: string, listener: (event: any, ...args: any[]) => unknown): void
  removeHandler?(channel: string): void
}

export interface SubscriptionIpcDeps {
  service: SubscriptionStatusService
  /**
   * start the CLI's own login; `mode` `window` asks for its window directly,
   * for a code the browser shows (absent: the browser, window hidden)
   */
  launchLogin(
    provider: AiSubscriptionProviderId,
    mode?: SubscriptionLoginMode | undefined,
  ): Promise<SubscriptionLaunchResult>
  /** run the CLI's own logout to its end */
  launchLogout(provider: AiSubscriptionProviderId): Promise<SubscriptionLaunchResult>
  launchInstall(provider: AiSubscriptionProviderId): Promise<SubscriptionLaunchResult>
  /** run the official update of the CLI the app found, in a terminal window */
  launchUpdate(provider: AiSubscriptionProviderId): Promise<SubscriptionLaunchResult>
  /** end a login the app started; nothing to end is not a failure */
  cancelLogin(provider: AiSubscriptionProviderId): Promise<SubscriptionLaunchResult>
  /** send an event to every window; called with the `changed` channel when a status changes */
  broadcast?: ((channel: string, payload: SubscriptionStatusMap) => void) | undefined
}

function providerOf(payload: unknown): AiSubscriptionProviderId | null {
  const provider =
    payload && typeof payload === 'object' ? (payload as { provider?: unknown }).provider : null
  return isSubscriptionProvider(provider) ? provider : null
}

/**
 * The login mode a renderer asked for. Only `window` means anything: everything
 * else (absent, `browser`, an unknown value) is the browser sign-in as always.
 */
function loginModeOf(payload: unknown): SubscriptionLoginMode | undefined {
  const mode =
    payload && typeof payload === 'object' ? (payload as { mode?: unknown }).mode : undefined
  return mode === 'window' ? 'window' : undefined
}

function failure(error: unknown, provider: AiSubscriptionProviderId): SubscriptionLaunchResult {
  return {
    ok: false,
    reason: 'failed',
    error: error instanceof Error ? error.message : String(error),
    ...(isSubscriptionCli(provider) ? { installUrl: SUBSCRIPTION_INSTALL_URLS[provider] } : {}),
  }
}

/**
 * Register the request channels of `SUBSCRIPTION_IPC_CHANNELS` on `ipcMain`
 * and forward status changes to the `changed` channel. Payloads come from a
 * renderer and are checked here: an unknown provider is answered with
 * `invalid`, never passed on, and so is a login, logout, install, update or
 * "use anyway" for a CLI turned off in this app (none of them starts it). A
 * login or logout the app ran withdraws that provider's metered acceptance.
 * Returns a function that undoes the registration.
 */
export function registerSubscriptionIpc(
  ipcMain: SubscriptionIpcMain,
  deps: SubscriptionIpcDeps,
): () => void {
  const { service } = deps
  const launch =
    (start: (provider: AiSubscriptionProviderId) => Promise<SubscriptionLaunchResult>) =>
    async (_event: unknown, payload: unknown): Promise<SubscriptionLaunchResult> => {
      const provider = providerOf(payload)
      if (!provider) return { ok: false, reason: 'invalid' }
      try {
        return await start(provider)
      } catch (error) {
        return failure(error, provider)
      }
    }
  /** a launch that starts the program: none for a CLI turned off in this app */
  const launchOn =
    (start: (provider: AiSubscriptionProviderId) => Promise<SubscriptionLaunchResult>) =>
    (event: unknown, payload: unknown): Promise<SubscriptionLaunchResult> =>
      launch(async (provider) =>
        service.getStatuses()[provider].state === 'off'
          ? { ok: false, reason: 'invalid' }
          : start(provider),
      )(event, payload)

  const handlers: Record<string, (event: unknown, payload?: unknown) => unknown> = {
    [SUBSCRIPTION_IPC_CHANNELS.statuses]: () => {
      const statuses = service.getStatuses()
      // a window that asks before anything was checked starts the first check; the answer
      // arrives on the `changed` channel (overlapping checks share one run)
      if (Object.values(statuses).some((status) => status.state === 'checking')) {
        void service.check().catch(() => undefined)
      }
      return statuses
    },
    [SUBSCRIPTION_IPC_CHANNELS.recheck]: (_event, payload) => {
      const requested =
        payload && typeof payload === 'object'
          ? (payload as { providers?: unknown }).providers
          : undefined
      const providers = Array.isArray(requested) ? requested.filter(isSubscriptionProvider) : []
      return service.check(providers.length > 0 ? providers : undefined)
    },
    // a function per call, so a launcher replaced on `deps` later is the one that runs
    [SUBSCRIPTION_IPC_CHANNELS.login]: (event, payload) => {
      const mode = loginModeOf(payload)
      return launchOn((provider) => deps.launchLogin(provider, mode))(event, payload)
    },
    // the provider is looked at again before the answer goes back, so the window that asked
    // already shows the outcome; a logout that failed may have signed the CLI out all the same.
    // A check of its own time: one already under way may have asked before the logout ended.
    [SUBSCRIPTION_IPC_CHANNELS.logout]: (event, payload) =>
      launchOn(async (provider) => {
        try {
          return await deps.launchLogout(provider)
        } finally {
          await service.check([provider], { fresh: true }).catch(() => undefined)
        }
      })(event, payload),
    [SUBSCRIPTION_IPC_CHANNELS.install]: (event, payload) =>
      launchOn((provider) => deps.launchInstall(provider))(event, payload),
    [SUBSCRIPTION_IPC_CHANNELS.update]: (event, payload) =>
      launchOn((provider) => deps.launchUpdate(provider))(event, payload),
    [SUBSCRIPTION_IPC_CHANNELS.cancelLogin]: (event, payload) =>
      launch((provider) => deps.cancelLogin(provider))(event, payload),
    [SUBSCRIPTION_IPC_CHANNELS.metered]: async (
      _event,
      payload,
    ): Promise<SubscriptionMeteredResult> => {
      const provider = providerOf(payload)
      const accepted = (payload as { accepted?: unknown } | null | undefined)?.accepted
      // consent is a real boolean from the UI, not anything truthy
      if (!provider || typeof accepted !== 'boolean') {
        return { ok: false, statuses: service.getStatuses() }
      }
      if (service.getStatuses()[provider].state === 'off') {
        return { ok: false, statuses: service.getStatuses() }
      }
      return service.setMeteredAccepted(provider, accepted)
    },
    // decision 0114: the screen offers it on the Settings cards alone (the shell preload)
    [SUBSCRIPTION_IPC_CHANNELS.off]: async (_event, payload): Promise<SubscriptionOffResult> => {
      const provider = providerOf(payload)
      const off = (payload as { off?: unknown } | null | undefined)?.off
      if (!isSubscriptionCli(provider) || typeof off !== 'boolean') {
        return { ok: false, statuses: service.getStatuses() }
      }
      const result = await service.setOff(provider, off)
      if (!result.ok || !off) return result
      // a sign-in the app started for it ends with it: nothing is left running for a program off
      await deps.cancelLogin(provider).catch(() => undefined)
      return { ok: true, statuses: service.getStatuses() }
    },
    // true only in a process that loaded the Codex image backend (it registers itself on import)
    [SUBSCRIPTION_IPC_CHANNELS.codexImage]: () => codexImageGenerationAvailable(),
  }
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler)
  const stopListening = deps.broadcast
    ? service.onChange((statuses) => deps.broadcast?.(SUBSCRIPTION_IPC_CHANNELS.changed, statuses))
    : () => undefined
  // The app ran this provider's login or logout to its end. "Use anyway" was given for the
  // login before it, and the kind of login cannot tell that one from another account of the
  // same kind: the acceptance goes, the stored setting and the remembered kind with it.
  const stopClearing = onSubscriptionLoginChange((provider) => {
    void service.clearMeteredAcceptance(provider).catch(() => undefined)
  })
  return () => {
    stopListening()
    stopClearing()
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler?.(channel)
  }
}

export interface SubscriptionIpcSetup {
  /** the AI settings as stored right now */
  getSettings(): Pick<AiSettings, 'providers' | 'meteredAccepted' | 'subscriptionOff'>
  /** persist `AiSettings.meteredAccepted[provider]` */
  setMeteredAccepted(provider: AiSubscriptionProviderId, accepted: boolean): void | Promise<void>
  /**
   * persist `AiSettings.subscriptionOff[provider]` (decision 0114); without it
   * a CLI cannot be turned off or on from this process
   */
  setSubscriptionOff?:
    ((provider: AiSubscriptionCliId, off: boolean) => void | Promise<void>) | undefined
  /** the app's userData directory: the metered acceptance record is kept here */
  dataDir: string
  broadcast?: ((channel: string, payload: SubscriptionStatusMap) => void) | undefined
  /** stand-in for tests; `detectSubscriptionLogin` when absent */
  detect?: SubscriptionDetector | undefined
  /** stand-in for tests; the lists the bridges registered (`listSubscriptionModels`) when absent */
  listModels?: SubscriptionModelLister | undefined
  /** stand-ins for tests: how the login is started, and on which system */
  spawn?: SubscriptionSpawn | undefined
  locate?: SubscriptionLocator | undefined
  platform?: NodeJS.Platform | undefined
  /** stand-in for tests: how a login is ended */
  killTree?: ((child: SubscriptionChildLike) => void) | undefined
  /** stand-in for tests; `HIDDEN_LOGIN_TIMEOUT_MS` when absent */
  hiddenLoginTimeoutMs?: number | undefined
  /**
   * What the visible login window says besides what the CLI prints, in the
   * app's language. The app's own fixed strings: nothing a window sent.
   */
  loginWindowText?:
    ((provider: AiSubscriptionProviderId) => SubscriptionLoginWindowText) | undefined
  /**
   * The ChatGPT sign-in (decision 0081): how the system browser is opened, and
   * what it shows once it is back on this PC, in the app's language. Without
   * it the ChatGPT login answers `unsupported`.
   */
  chatGptSignIn?:
    | {
        openBrowser: (url: string) => Promise<boolean>
        pages: () => { done: FreeConnectPage; failed: FreeConnectPage }
      }
    | undefined
  /** stand-in for tests: the ChatGPT connection; one over `dataDir` when absent */
  chatGptConnection?: ChatGptConnection | undefined
}

/** The window's words, or none when they cannot be had: a guide is no reason for a login not to start */
function windowTextOf(
  setup: SubscriptionIpcSetup,
  provider: AiSubscriptionProviderId,
): SubscriptionLoginWindowText | undefined {
  try {
    return setup.loginWindowText?.(provider)
  } catch {
    return undefined
  }
}

/**
 * A browser sign-in the app started, with the CLI's window hidden, is ended
 * after this long; the provider then shows its login button again.
 */
export const HIDDEN_LOGIN_TIMEOUT_MS = 10 * 60_000

interface PendingLogin {
  mode: AiSubscriptionSigningIn
  stop: () => void
  timer?: ReturnType<typeof setTimeout> | undefined
}

/**
 * The real dependencies for `registerSubscriptionIpc`: a status service over
 * the app's settings that also reads each CLI's model list, and the launchers.
 * After a login window closes the provider is checked again, by a check that
 * starts then, so the UI follows without being asked.
 */
export function createSubscriptionIpcDeps(setup: SubscriptionIpcSetup): SubscriptionIpcDeps {
  // the process's ChatGPT connection, over the same data folder as the metered record
  const chatGpt =
    setup.chatGptConnection ??
    createChatGptConnection({
      store: createChatGptConnectionFileStore(setup.dataDir),
      agentName: PRODUCT_NAME,
    })
  setChatGptConnection(chatGpt)
  const service = createSubscriptionStatusService({
    getSettings: setup.getSettings,
    setMeteredAccepted: setup.setMeteredAccepted,
    setSubscriptionOff: setup.setSubscriptionOff,
    acceptanceStore: createMeteredAcceptanceFileStore(setup.dataDir),
    detect: setup.detect,
    listModels: setup.listModels ?? listSubscriptionModels,
  })
  // a session that came or went (a sign-in, a sign-out, one OpenAI ended) shows at once
  chatGpt.onChange(() => {
    void service.check(['chatgpt'], { fresh: true }).catch(() => undefined)
  })
  const logins = new Map<AiSubscriptionProviderId, PendingLogin>()
  const platform = setup.platform ?? process.platform

  /** The app's own browser sign-in; a press while one runs leaves it running */
  const launchChatGptLogin = async (): Promise<SubscriptionLaunchResult> => {
    if (logins.has('chatgpt')) return { ok: true }
    const signIn = setup.chatGptSignIn
    if (!signIn) return { ok: false, reason: 'unsupported' }
    const attempt = new AbortController()
    const login: PendingLogin = { mode: 'browser', stop: () => attempt.abort() }
    logins.set('chatgpt', login)
    service.setLoginUnfinished('chatgpt', false)
    service.setSigningIn('chatgpt', 'browser')
    void chatGpt
      .signIn({ openBrowser: signIn.openBrowser, pages: signIn.pages(), signal: attempt.signal })
      .catch((): ChatGptSignInResult => ({ ok: false, reason: 'network' }))
      .then((result) => {
        if (logins.get('chatgpt') !== login) return
        logins.delete('chatgpt')
        service.setSigningIn('chatgpt', undefined)
        // a sign-in nobody finished, or one that failed: the card says why and offers it again
        if (!result.ok && result.reason !== 'cancelled') {
          service.setLoginUnfinished('chatgpt', true, {
            reason: result.reason,
            ...(result.step ? { step: result.step } : {}),
            ...(result.httpStatus !== undefined ? { httpStatus: result.httpStatus } : {}),
            ...(result.oauthError ? { oauthError: result.oauthError } : {}),
          })
        }
        void service.check(['chatgpt'], { fresh: true }).catch(() => undefined)
      })
    return { ok: true }
  }

  const launchLogin = async (
    provider: AiSubscriptionProviderId,
    requested?: SubscriptionLoginMode,
  ) => {
    if (provider === 'chatgpt') return launchChatGptLogin()
    const current = logins.get(provider)
    // the window is already open: it is where the user is now
    if (current?.mode === 'window') return { ok: true }
    // On Windows the first press signs in in the browser alone, with the CLI's window
    // hidden; a press while that runs, or a press that asks for the window, opens it
    // instead, for a code the browser shows. Elsewhere the CLI has no window to show,
    // so a press while it runs changes nothing and both are the same login.
    if (current && platform !== 'win32') return { ok: true }
    const mode: AiSubscriptionSigningIn =
      current || (requested === 'window' && platform === 'win32') ? 'window' : 'browser'
    current?.stop()
    const login: PendingLogin = { mode, stop: () => undefined }
    logins.set(provider, login)
    // a login is starting: whatever the last one left behind no longer applies
    service.setLoginUnfinished(provider, false)
    service.setSigningIn(provider, mode)
    const end = (unfinished: boolean): void => {
      clearTimeout(login.timer)
      // a login replaced by its window has ended, but the window has not
      if (logins.get(provider) !== login) return
      logins.delete(provider)
      service.setSigningIn(provider, undefined)
      // a check of its own time: one already under way may have asked before the login ended
      void service
        .check([provider], { fresh: true })
        .then((statuses) => {
          // it ended on its own and still no login: the browser may have handed back a
          // code nobody pasted, so the card offers the window instead of repeating it
          if (!unfinished || logins.has(provider)) return
          if (statuses[provider]?.state === 'signed-out') service.setLoginUnfinished(provider, true)
        })
        .catch(() => undefined)
    }
    const result = await launchSubscriptionLogin(provider, {
      configuredPath: setup.getSettings().providers?.[provider]?.cliPath,
      window: mode === 'browser' ? 'hidden' : 'visible',
      windowText: mode === 'window' ? windowTextOf(setup, provider) : undefined,
      onStarted: (stop) => {
        login.stop = stop
        // a sign-in nobody finishes does not wait unseen for ever
        if (mode === 'browser') {
          login.timer = setTimeout(stop, setup.hiddenLoginTimeoutMs ?? HIDDEN_LOGIN_TIMEOUT_MS)
          login.timer.unref?.()
        }
      },
      onExit: () => end(true),
      spawn: setup.spawn,
      locate: setup.locate,
      platform,
      killTree: setup.killTree,
    })
    if (!result.ok) end(false)
    return result
  }
  return {
    service,
    launchLogin,
    launchLogout: async (provider) => {
      if (provider !== 'chatgpt') {
        return launchSubscriptionLogout(provider, {
          configuredPath: setup.getSettings().providers?.[provider]?.cliPath,
        })
      }
      await chatGpt.signOut()
      return { ok: true }
    },
    // there is no program to install or update for ChatGPT: those answer `invalid`
    launchInstall: (provider) => launchSubscriptionInstall(provider),
    launchUpdate: (provider) =>
      launchSubscriptionUpdate(provider, {
        configuredPath: setup.getSettings().providers?.[provider]?.cliPath,
        spawn: setup.spawn,
        locate: setup.locate,
        platform,
      }),
    cancelLogin: async (provider) => {
      const login = logins.get(provider)
      if (!login) return { ok: true }
      clearTimeout(login.timer)
      // gone from the list first: the exit that follows finds nothing left to end
      logins.delete(provider)
      service.setSigningIn(provider, undefined)
      login.stop()
      void service.check([provider], { fresh: true }).catch(() => undefined)
      return { ok: true }
    },
    broadcast: setup.broadcast,
  }
}

let sharedRegistration: { deps: SubscriptionIpcDeps; unregister: () => void } | null = null

/**
 * Register the subscription channels once per process, whoever asks first.
 * Several editors' main-process modules run in one process in the packaged
 * app, and registering a channel twice throws, so every caller goes through
 * this instead of `registerSubscriptionIpc`: the first call registers, later
 * calls get the same dependencies back. Nothing is checked here: the first
 * window that asks for the statuses starts the first check, so a process that
 * never shows AI (a headless export, a second instance about to quit) does not
 * start the vendor programs at all.
 */
export function ensureSubscriptionIpc(
  ipcMain: SubscriptionIpcMain,
  setup: SubscriptionIpcSetup,
  createDeps: (setup: SubscriptionIpcSetup) => SubscriptionIpcDeps = createSubscriptionIpcDeps,
): SubscriptionIpcDeps {
  if (sharedRegistration) return sharedRegistration.deps
  const deps = createDeps(setup)
  const unregister = registerSubscriptionIpc(ipcMain, deps)
  sharedRegistration = { deps, unregister }
  return deps
}

/**
 * The statuses of the process-wide registration, as the main process decides
 * on them (which provider runs, which route a tool takes); empty until
 * `ensureSubscriptionIpc` ran. The account a CLI names is left out: it is for
 * the windows to show and has no part in any decision, so it does not travel
 * with the run and tool contexts built from this.
 */
export function sharedSubscriptionStatuses(): Partial<SubscriptionStatusMap> {
  const statuses: Partial<SubscriptionStatusMap> = {}
  const known = sharedRegistration?.deps.service.getStatuses()
  for (const status of Object.values(known ?? {})) {
    const copy = { ...status }
    delete copy.account
    statuses[copy.provider] = copy
  }
  return statuses
}

/** Drop the process-wide registration (tests, and an app that tears its IPC down). */
export function resetSharedSubscriptionIpc(): void {
  sharedRegistration?.unregister()
  sharedRegistration = null
}
