/**
 * The connection statuses of the subscription providers as the app holds them:
 * the last answer of each CLI, combined with the user's stored acceptance of a
 * metered login. One instance lives in the main process; the IPC helper puts it
 * in front of the renderers.
 *
 * A status also carries two things for display that a CLI tells about a login
 * it is signed in with: the account, and the list of its models. The list is
 * read after the status and added when it arrives, so it never delays or fails
 * a check. It is read only for a login the app may use: a metered login gets
 * its list when the user accepts it, not before.
 */
import { subscriptionOffIn } from '../provider-selection'
import { AI_SUBSCRIPTION_PROVIDERS } from '../providers'
import type {
  AiSubscriptionCliId,
  AiSubscriptionLoginFailure,
  AiSettings,
  AiSubscriptionModel,
  AiSubscriptionProviderId,
  AiSubscriptionSigningIn,
  AiSubscriptionStatus,
} from '../types'
import {
  checkingSubscriptionStatus,
  offSubscriptionStatus,
  subscriptionAccountOf,
  subscriptionModelsOf,
  subscriptionProgramPathOf,
  subscriptionStatusErrorKind,
  subscriptionStatusErrorText,
  type SubscriptionMeteredResult,
  type SubscriptionOffResult,
  type SubscriptionStatusMap,
} from './contract'
import {
  meteredLoginFingerprint,
  reconcileMeteredAcceptance,
  type MeteredAcceptanceStore,
} from './metered'
import type { SubscriptionModelLister } from './models'
import {
  detectSubscriptionLogin,
  type SubscriptionDetection,
  type SubscriptionDetector,
} from './status'

type MaybePromise<T> = T | Promise<T>

export interface SubscriptionStatusServiceDeps {
  /** the AI settings as stored right now (Codex `cliPath`, `meteredAccepted`, `subscriptionOff`) */
  getSettings(): MaybePromise<Pick<AiSettings, 'providers' | 'meteredAccepted' | 'subscriptionOff'>>
  /** persist `AiSettings.meteredAccepted[provider]` */
  setMeteredAccepted(provider: AiSubscriptionProviderId, accepted: boolean): MaybePromise<void>
  /**
   * persist `AiSettings.subscriptionOff[provider]`; absent where nothing may
   * change it (the headless callers read the settings only)
   */
  setSubscriptionOff?:
    ((provider: AiSubscriptionCliId, off: boolean) => MaybePromise<void>) | undefined
  /** where the kind of login an acceptance was given for is remembered */
  acceptanceStore: MeteredAcceptanceStore
  /** `detectSubscriptionLogin` when absent */
  detect?: SubscriptionDetector | undefined
  /**
   * Reads the model list of a provider that can run. Absent: no list is read,
   * and nothing beyond the status check is started (the headless callers).
   */
  listModels?: SubscriptionModelLister | undefined
  /** called with a fresh copy whenever a status changes */
  onChange?: ((statuses: SubscriptionStatusMap) => void) | undefined
  timeoutMs?: number | undefined
}

export interface SubscriptionCheckOptions {
  /**
   * The answer must come from a check that started after this call, as after a
   * login or logout the app ran. A check already under way may have asked the
   * CLI before the change: it is waited for, then the CLI is asked once more.
   */
  fresh?: boolean | undefined
}

export interface SubscriptionStatusService {
  /** The last known statuses; `checking` for a provider no check has answered for yet */
  getStatuses(): SubscriptionStatusMap
  /**
   * Ask the CLIs again (both, at the same time, unless `providers` narrows it)
   * and resolve with the new statuses. Calls that overlap share one check,
   * unless `fresh` asks for one of its own time.
   */
  check(
    providers?: AiSubscriptionProviderId[],
    options?: SubscriptionCheckOptions,
  ): Promise<SubscriptionStatusMap>
  /**
   * Record or withdraw "use anyway". Accepting is refused (`ok: false`) unless
   * the provider's last detected state is `metered`.
   */
  setMeteredAccepted(
    provider: AiSubscriptionProviderId,
    accepted: boolean,
  ): Promise<SubscriptionMeteredResult>
  /**
   * Remove whatever acceptance is stored for the provider, the setting and the
   * remembered kind of login, whatever login is detected. For a login or logout
   * the app itself ran: "use anyway" was given for the login before it, and the
   * kind of login cannot tell that one from another account of the same kind.
   * Nothing is written, and nothing announced, when nothing was accepted.
   */
  clearMeteredAcceptance(provider: AiSubscriptionProviderId): Promise<void>
  /**
   * Turn a CLI off in this app, or back on (decision 0114). Off is stored,
   * then shown at once as `off`; the program is not asked anything. Back on,
   * the provider reads `checking` and the program is asked again. `ok: false`
   * when the setting could not be written (or no writer was given).
   */
  setOff(provider: AiSubscriptionCliId, off: boolean): Promise<SubscriptionOffResult>
  onChange(listener: (statuses: SubscriptionStatusMap) => void): () => void
  /**
   * Mark a login the app started as under way (`browser`, `window`), or as over
   * (undefined). The mark rides on the statuses handed out and is announced; it
   * changes nothing that was detected.
   */
  setSigningIn(
    provider: AiSubscriptionProviderId,
    signingIn: AiSubscriptionSigningIn | undefined,
  ): void
  /**
   * Mark the last login the app started as one that ended without signing the
   * CLI in (it exited, or ran past the limit for a browser sign-in nobody
   * finished), or take the mark back. Like `signingIn` it rides on the statuses
   * and changes nothing that was detected; a check that finds a sign-in clears
   * it, and so does a new login. `failure` says why, when the app knows
   * (its own ChatGPT sign-in); it rides along with the mark and goes with it.
   */
  setLoginUnfinished(
    provider: AiSubscriptionProviderId,
    unfinished: boolean,
    failure?: AiSubscriptionLoginFailure,
  ): void
}

/** A login is known for these states: the account belongs to them alone */
function signedIn(detection: SubscriptionDetection): boolean {
  return detection.state === 'ready' || detection.state === 'metered'
}

/**
 * A login the app may use: a subscription, or a metered login the user said
 * "use anyway" to. The model list is read and shown for these alone. Reading
 * it is no model call, but it starts the CLI on that login, and a pay-per-use
 * login nobody agreed to use is not started for it.
 */
function usable(status: Pick<AiSubscriptionStatus, 'state' | 'meteredAccepted'>): boolean {
  return status.state === 'ready' || (status.state === 'metered' && status.meteredAccepted)
}

/** A detection as the status the contract defines: no field beyond those it lists */
function toStatus(
  detection: SubscriptionDetection,
  meteredAccepted: boolean,
  models?: AiSubscriptionModel[] | undefined,
): AiSubscriptionStatus {
  // a detection can come from an injected detector: its account is checked again
  const account = signedIn(detection) ? subscriptionAccountOf(detection.account) : undefined
  const programPath =
    subscriptionStatusErrorKind(detection) === 'needs-update'
      ? subscriptionProgramPathOf(detection.programPath)
      : undefined
  const accepted = detection.state === 'metered' && meteredAccepted
  return {
    provider: detection.provider,
    state: detection.state,
    ...(detection.version ? { version: detection.version } : {}),
    ...(detection.loginMethod ? { loginMethod: detection.loginMethod } : {}),
    ...(detection.planName ? { planName: detection.planName } : {}),
    ...(account ? { account } : {}),
    ...(usable({ state: detection.state, meteredAccepted: accepted }) && models?.length
      ? { models }
      : {}),
    meteredAccepted: accepted,
    ...(detection.state === 'error' && detection.error ? { error: detection.error } : {}),
    ...(programPath ? { programPath } : {}),
  }
}

export function createSubscriptionStatusService(
  deps: SubscriptionStatusServiceDeps,
): SubscriptionStatusService {
  const detect = deps.detect ?? detectSubscriptionLogin
  const statuses = Object.fromEntries(
    AI_SUBSCRIPTION_PROVIDERS.map((provider) => [provider, checkingSubscriptionStatus(provider)]),
  ) as SubscriptionStatusMap
  const detections = new Map<AiSubscriptionProviderId, SubscriptionDetection>()
  /** the configured CLI path each of `detections` was made with */
  const detectedPaths = new Map<AiSubscriptionProviderId, string | undefined>()
  const inFlight = new Map<AiSubscriptionProviderId, Promise<void>>()
  /** the list each CLI gave last; kept for the process, replaced when a later reading differs */
  const models = new Map<AiSubscriptionProviderId, AiSubscriptionModel[]>()
  /** counts the logins seen per provider: a list read for an earlier login is not used */
  const loginEpoch = new Map<AiSubscriptionProviderId, number>()
  /** the login a model reading under way belongs to */
  const modelReading = new Map<AiSubscriptionProviderId, number>()
  const listeners = new Set<(statuses: SubscriptionStatusMap) => void>()
  if (deps.onChange) listeners.add(deps.onChange)
  // both providers share the settings and the acceptance file: one change at a time
  let acceptanceQueue: Promise<unknown> = Promise.resolve()

  /** logins the app started that are under way, laid over the detected statuses */
  const signingIn = new Map<AiSubscriptionProviderId, AiSubscriptionSigningIn>()
  /** logins the app started that ended without one, laid over the detected statuses */
  const loginUnfinished = new Set<AiSubscriptionProviderId>()
  /** why those logins ended, where the app knows */
  const loginFailures = new Map<AiSubscriptionProviderId, AiSubscriptionLoginFailure>()
  const snapshot = (): SubscriptionStatusMap => {
    const current = { ...statuses }
    for (const [provider, mode] of signingIn) {
      // a program turned off has no login to show, even one still being ended
      if (current[provider].state === 'off') continue
      current[provider] = { ...current[provider], signingIn: mode }
    }
    for (const provider of loginUnfinished) {
      // a login that is under way is not an unfinished one
      if (signingIn.has(provider)) continue
      const failure = loginFailures.get(provider)
      current[provider] = {
        ...current[provider],
        loginUnfinished: true,
        ...(failure ? { loginFailure: { ...failure } } : {}),
      }
    }
    return current
  }
  const announce = (): void => {
    const current = snapshot()
    for (const listener of listeners) {
      try {
        listener(current)
      } catch {
        /* one listener must not stop the others */
      }
    }
  }
  const queued = <T>(task: () => Promise<T>): Promise<T> => {
    const run = acceptanceQueue.then(task, task)
    acceptanceQueue = run.catch(() => undefined)
    return run
  }

  /** In the queue: the CLI is off in this app, and what was known of its login is let go */
  const markOff = (provider: AiSubscriptionProviderId): void => {
    if (statuses[provider].state === 'off') return
    statuses[provider] = offSubscriptionStatus(provider)
    detections.delete(provider)
    loginUnfinished.delete(provider)
    loginFailures.delete(provider)
    // a list read under way, or kept, belongs to a login this app no longer looks at
    models.delete(provider)
    loginEpoch.set(provider, (loginEpoch.get(provider) ?? 0) + 1)
    announce()
  }

  const applyDetection = (detection: SubscriptionDetection): Promise<void> =>
    queued(async () => {
      const provider = detection.provider
      const settings = await Promise.resolve()
        .then(() => deps.getSettings())
        .catch(() => null)
      // turned off while the program was being asked: its answer is not used
      if (settings ? subscriptionOffIn(settings, provider) : statuses[provider].state === 'off') {
        markOff(provider)
        return
      }
      let accepted: boolean
      try {
        if (!settings) throw new Error('The settings could not be read')
        const record = await deps.acceptanceStore.read()
        const stored = settings.meteredAccepted?.[provider] === true
        const outcome = reconcileMeteredAcceptance(detection, {
          accepted: stored,
          fingerprint: record[provider],
        })
        accepted = outcome.meteredAccepted
        if (outcome.clear) {
          if (stored) await deps.setMeteredAccepted(provider, false)
          if (record[provider]) {
            delete record[provider]
            await deps.acceptanceStore.write(record)
          }
        }
      } catch {
        // an acceptance that cannot be read back is not an acceptance
        accepted = false
      }
      detections.set(provider, detection)
      // a login was found: whatever the last one the app started did, it is over
      if (signedIn(detection)) {
        loginUnfinished.delete(provider)
        loginFailures.delete(provider)
      }
      if (detection.state === 'signed-out' || detection.state === 'not-installed') {
        // whoever signs in next gets a list of their own
        models.delete(provider)
        loginEpoch.set(provider, (loginEpoch.get(provider) ?? 0) + 1)
      }
      statuses[provider] = toStatus(detection, accepted, models.get(provider))
      announce()
    })

  /**
   * Read the provider's model list, off to the side of the check or the
   * acceptance that asked. The status is already out; the list is added to it,
   * with a change event, only when it differs from the one at hand. One
   * reading at a time, and none for a login the app may not use.
   */
  const refreshModels = (provider: AiSubscriptionProviderId): void => {
    const listModels = deps.listModels
    if (!listModels || !usable(statuses[provider])) return
    const configuredPath = detectedPaths.get(provider)
    const epoch = loginEpoch.get(provider) ?? 0
    if (modelReading.get(provider) === epoch) return
    modelReading.set(provider, epoch)
    void Promise.resolve()
      .then(() => listModels(provider, { configuredPath }))
      .then(subscriptionModelsOf, () => undefined)
      .then((list) => {
        if (modelReading.get(provider) === epoch) modelReading.delete(provider)
        // read for a login that is gone, or nothing read: what is shown stays
        if (!list || (loginEpoch.get(provider) ?? 0) !== epoch) return
        if (JSON.stringify(models.get(provider)) === JSON.stringify(list)) return
        models.set(provider, list)
        const detection = detections.get(provider)
        // the acceptance may have been taken back while the list was read
        if (!detection || !usable(statuses[provider])) return
        statuses[provider] = toStatus(detection, statuses[provider].meteredAccepted, list)
        announce()
      })
  }

  const checkOne = (provider: AiSubscriptionProviderId): Promise<void> => {
    const running = inFlight.get(provider)
    if (running) return running
    const task = (async () => {
      let detection: SubscriptionDetection
      let configuredPath: string | undefined
      try {
        const settings = await deps.getSettings()
        if (subscriptionOffIn(settings, provider)) {
          await queued(async () => markOff(provider))
          return
        }
        configuredPath = settings.providers?.[provider]?.cliPath
        detection = await detect(provider, {
          configuredPath,
          timeoutMs: deps.timeoutMs,
        })
      } catch {
        // a fixed text: the message of the failure may carry what a CLI printed
        detection = {
          provider,
          state: 'error',
          error: subscriptionStatusErrorText('failed', 'The status check failed'),
        }
      }
      detectedPaths.set(provider, configuredPath)
      await applyDetection(detection)
      refreshModels(provider)
    })().finally(() => inFlight.delete(provider))
    inFlight.set(provider, task)
    return task
  }

  return {
    getStatuses: snapshot,
    async check(providers, options) {
      const wanted = providers?.length ? providers : AI_SUBSCRIPTION_PROVIDERS
      await Promise.all(
        wanted.map(async (provider) => {
          // A check under way may have asked the CLI before this call: let it end. Whatever
          // runs after that started after this call, so one wait and one check is all it takes.
          if (options?.fresh) await inFlight.get(provider)
          await checkOne(provider)
        }),
      )
      return snapshot()
    },
    setMeteredAccepted(provider, accepted) {
      return queued(async () => {
        const detection = detections.get(provider)
        const fingerprint = detection ? meteredLoginFingerprint(detection) : null
        if (accepted && (!detection || !fingerprint)) return { ok: false, statuses: snapshot() }
        try {
          const record = await deps.acceptanceStore.read()
          if (accepted && fingerprint) record[provider] = fingerprint
          else delete record[provider]
          await deps.acceptanceStore.write(record)
          await deps.setMeteredAccepted(provider, accepted)
        } catch {
          return { ok: false, statuses: snapshot() }
        }
        if (detection) statuses[provider] = toStatus(detection, accepted, models.get(provider))
        announce()
        // a login the app may use from now on: its list was not read while it was not
        if (accepted) refreshModels(provider)
        return { ok: true, statuses: snapshot() }
      })
    },
    clearMeteredAcceptance(provider) {
      return queued(async () => {
        try {
          // the remembered kind first: a flag left behind without it is no acceptance, and
          // the next check removes it
          const record = await deps.acceptanceStore.read()
          if (record[provider]) {
            delete record[provider]
            await deps.acceptanceStore.write(record)
          }
          const settings = await deps.getSettings()
          if (settings.meteredAccepted?.[provider] === true) {
            await deps.setMeteredAccepted(provider, false)
          }
        } catch {
          // the status below still stops showing it as accepted
        }
        const detection = detections.get(provider)
        if (!detection || !statuses[provider].meteredAccepted) return
        statuses[provider] = toStatus(detection, false, models.get(provider))
        announce()
      })
    },
    async setOff(provider, off) {
      const save = deps.setSubscriptionOff
      if (!save) return { ok: false, statuses: snapshot() }
      const result = await queued(async (): Promise<SubscriptionOffResult> => {
        try {
          await save(provider, off)
        } catch {
          return { ok: false, statuses: snapshot() }
        }
        if (off) markOff(provider)
        else if (statuses[provider].state === 'off') {
          statuses[provider] = checkingSubscriptionStatus(provider)
          announce()
        }
        return { ok: true, statuses: snapshot() }
      })
      // back on: the program is asked again, and its answer arrives as a change
      if (result.ok && !off) void checkOne(provider)
      return result
    },
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setSigningIn(provider, mode) {
      if (signingIn.get(provider) === mode) return
      if (mode) signingIn.set(provider, mode)
      else signingIn.delete(provider)
      announce()
    },
    setLoginUnfinished(provider, unfinished, failure) {
      const known = loginFailures.get(provider)
      const next = unfinished ? failure : undefined
      if (
        loginUnfinished.has(provider) === unfinished &&
        JSON.stringify(known) === JSON.stringify(next)
      ) {
        return
      }
      if (unfinished) loginUnfinished.add(provider)
      else loginUnfinished.delete(provider)
      if (next) loginFailures.set(provider, { ...next })
      else loginFailures.delete(provider)
      announce()
    },
  }
}
