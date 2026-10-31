/**
 * The one send gate behind every AI panel: what pressing send does, from the
 * stored settings and the connection statuses, and what becomes of a request
 * that had to wait. Pure and free of React, so the six editors decide the same
 * way and each can test its own wiring against it.
 *
 * The rules:
 * - a status check has not answered yet → the request is held and starts by
 *   itself as soon as a provider can run;
 * - no provider can run → nothing is sent, the composer keeps its text, the
 *   connect prompt is shown. Nothing starts later on its own: a sign-in can
 *   take minutes, and a run must be asked for again after it;
 * - a subscription is about to be used for the first time → the first-connection
 *   notice comes first and the request is held until it is acknowledged.
 */
import {
  AI_SUBSCRIPTION_NOTICE_VERSION,
  AI_SUBSCRIPTION_PROVIDERS,
  isSubscriptionProvider,
  selectAiProvider,
  subscriptionStateOf,
  type AiProviderChoice,
  type AiSettings,
  type AiSubscriptionProviderId,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider/browser'
import { withAiProviderSelection } from './ai-model-picker-options'

type ConnectedChoice = Extract<AiProviderChoice, { connected: true }>
type NotConnectedChoice = Extract<AiProviderChoice, { connected: false }>

/** The part of the settings the gate reads */
export type AiSendGateSettings = Pick<
  AiSettings,
  | 'provider'
  | 'providers'
  | 'meteredAccepted'
  | 'subscriptionNoticeSeen'
  | 'subscriptionNoticeVersion'
>

export type AiSendGate =
  /** a provider can run: the request goes out */
  | { readonly kind: 'run'; readonly choice: ConnectedChoice }
  /**
   * the settings or a status check have not answered yet: the request waits.
   * `choice` is what the connect prompt would show meanwhile (absent until the
   * settings are read).
   */
  | { readonly kind: 'checking'; readonly choice?: NotConnectedChoice | undefined }
  /** a subscription is about to be used for the first time: its notice comes first */
  | {
      readonly kind: 'notice'
      readonly provider: AiSubscriptionProviderId
      readonly choice: ConnectedChoice
    }
  /** nothing can run: the connect prompt is shown and nothing is sent */
  | { readonly kind: 'connect'; readonly choice: NotConnectedChoice }

/**
 * A status check that has not reported yet may still turn "not connected" into
 * "connected": the selected subscription is being checked, or under `auto` one
 * of them is (a missing CLI status reads as `checking`). An unfinished key
 * provider waits for no check.
 */
function connectionStillChecking(
  choice: NotConnectedChoice,
  statuses: AiSubscriptionStatuses,
): boolean {
  if (choice.reason === 'checking') return true
  if (choice.reason !== 'no-subscription') return false
  return AI_SUBSCRIPTION_PROVIDERS.some((id) => subscriptionStateOf(statuses, id) === 'checking')
}

/** The current wording of the first-connection notice: version 2 added the PDF sentence */
export { AI_SUBSCRIPTION_NOTICE_VERSION }

/**
 * The notice version these settings acknowledge. A file written before the
 * version existed carries only `subscriptionNoticeSeen`; that acknowledged
 * version 1, so those users see the added PDF sentence once.
 */
export function aiSubscriptionNoticeVersion(
  settings: Pick<AiSettings, 'subscriptionNoticeSeen' | 'subscriptionNoticeVersion'>,
): number {
  const version = settings.subscriptionNoticeVersion
  const seen = settings.subscriptionNoticeSeen === true
  // an unnormalised object from an older caller: the boolean means "seen",
  // and a zero next to it is the default object, not a stored version
  if (seen && (typeof version !== 'number' || !Number.isInteger(version) || version <= 0)) {
    return AI_SUBSCRIPTION_NOTICE_VERSION
  }
  if (typeof version === 'number' && Number.isInteger(version) && version >= 0) {
    return Math.min(version, AI_SUBSCRIPTION_NOTICE_VERSION)
  }
  return seen ? AI_SUBSCRIPTION_NOTICE_VERSION : 0
}

/** Whether the first-connection notice should be shown (again) for these settings */
export function aiSubscriptionNoticeDue(
  settings:
    Pick<AiSettings, 'subscriptionNoticeSeen' | 'subscriptionNoticeVersion'> | null | undefined,
): boolean {
  if (!settings) return false
  return aiSubscriptionNoticeVersion(settings) < AI_SUBSCRIPTION_NOTICE_VERSION
}

/** The gate for the current settings and statuses; either one still unread is `checking` */
export function aiSendGate(
  settings: AiSendGateSettings | null | undefined,
  statuses: AiSubscriptionStatuses | null | undefined,
): AiSendGate {
  if (!settings) return { kind: 'checking' }
  const known = statuses ?? {}
  const choice = selectAiProvider(settings, known)
  if (!choice.connected) {
    return connectionStillChecking(choice, known)
      ? { kind: 'checking', choice }
      : { kind: 'connect', choice }
  }
  if (isSubscriptionProvider(choice.provider) && aiSubscriptionNoticeDue(settings)) {
    return { kind: 'notice', provider: choice.provider, choice }
  }
  return { kind: 'run', choice }
}

/** Why a request is being held: until the status check answers, or until the notice is acknowledged */
export type AiHeldReason = 'checking' | 'notice'

/** Why a request made in front of this gate is held; null when it is not (it runs, or the connect prompt answers it) */
export function aiHoldReason(gate: AiSendGate): AiHeldReason | null {
  return gate.kind === 'checking' || gate.kind === 'notice' ? gate.kind : null
}

export type AiHeldRequestStep =
  /** a provider can run now: send the held request */
  | { readonly action: 'start' }
  | { readonly action: 'keep'; readonly reason: AiHeldReason }
  /** nothing is sent; the composer still has the text */
  | { readonly action: 'drop' }

/**
 * What becomes of a held request each time the gate is looked at again.
 *
 * Held for the status check: it starts once a provider can run, moves behind
 * the notice when the answer is a subscription not used before, and is dropped
 * when the answer is "not connected".
 *
 * Held for the notice: only acknowledging it starts the request, and the panel
 * does that itself (it takes the request before it saves the acknowledgement).
 * So a gate that left `notice` while the request is still here was left some
 * other way — another provider picked, the connection lost — and the request
 * is dropped.
 */
export function aiHeldRequestStep(held: AiHeldReason, gate: AiSendGate): AiHeldRequestStep {
  if (gate.kind === 'notice') return { action: 'keep', reason: 'notice' }
  if (held === 'notice') return { action: 'drop' }
  if (gate.kind === 'checking') return { action: 'keep', reason: 'checking' }
  return gate.kind === 'run' ? { action: 'start' } : { action: 'drop' }
}

/**
 * The choice to hand the connect prompt, or null when it is not on screen.
 * Shown whenever nothing can run; during a status check only while a request
 * is waiting for the answer, so it does not flash up at every start.
 */
export function aiConnectPromptChoice(
  gate: AiSendGate,
  requestHeld: boolean,
): NotConnectedChoice | null {
  if (gate.kind === 'connect') return gate.choice
  if (gate.kind === 'checking' && requestHeld) return gate.choice ?? null
  return null
}

/** The settings after the first-connection notice was acknowledged */
export function withAiSubscriptionNoticeSeen<S extends AiSettings>(settings: S): S {
  return {
    ...settings,
    subscriptionNoticeSeen: true,
    subscriptionNoticeVersion: AI_SUBSCRIPTION_NOTICE_VERSION,
  }
}

/**
 * The settings after "continue with <provider>": that provider becomes the
 * stored selection (so the model picker shows it), on the model it last used
 * (an empty model is the CLI's own default).
 */
export function withAiContinueProvider<S extends AiSettings>(
  settings: S,
  provider: AiSubscriptionProviderId,
): S {
  return withAiProviderSelection(settings, {
    provider,
    model: settings.providers?.[provider]?.model ?? '',
  }) as S
}

/** Where the AI settings are stored, as every app's preload exposes it */
export interface AiSettingsStore<S extends AiSettings = AiSettings> {
  readonly getSettings: () => Promise<S | null | undefined>
  readonly setSettings: (settings: S) => Promise<unknown>
}

/**
 * A settings write from an AI panel (notice acknowledged, "continue with …").
 * The change is applied to what is stored right now, not to the copy the panel
 * holds: another window or the settings page may have written since, and
 * saving a stale copy would undo that. `known` is used only when the stored
 * settings cannot be read. Resolves to what was written, or null when there
 * was nothing to apply the change to; a failed write still resolves, so the
 * panel can go on with the change it asked for.
 */
export async function changeStoredAiSettings<S extends AiSettings>(
  store: AiSettingsStore<S>,
  change: (latest: S) => S,
  known?: S | null | undefined,
): Promise<S | null> {
  let latest: S | null | undefined
  try {
    latest = await store.getSettings()
  } catch {
    latest = undefined
  }
  const base = latest ?? known
  if (!base) return null
  const next = change(base)
  try {
    await store.setSettings(next)
  } catch {
    // the panel still shows the change; the next settings read tells what was kept
  }
  return next
}
