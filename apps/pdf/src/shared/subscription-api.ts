// Contract between the pdf renderer (AI panel) and the main process for the
// subscription providers (Claude, Codex). The request channels and payloads are
// the shared ones from @genoffice/ai-provider; their main-process handlers are
// registered once for the whole app by the docs main (pdf registers none), so
// every answer is read defensively: a missing handler is "still checking".

import type {
  AiSubscriptionProviderId,
  SubscriptionConnectHelpPath,
  SubscriptionLaunchResult,
  SubscriptionMeteredResult,
  SubscriptionStatusMap,
} from '@genoffice/ai-provider/browser'

// Reading an IPC answer is the same in every app: one implementation, in the shared contract
export {
  checkingSubscriptionStatuses,
  subscriptionLaunchResultOf,
  subscriptionMeteredResultOf,
  subscriptionStatusMapOf,
} from '@genoffice/ai-provider/browser'

/** exposed as `window.pdfApi.subscription` by the pdf preload (same shape as the shell's) */
export interface SubscriptionApi {
  /** the last known connection statuses (`checking` until a first check answered) */
  statuses(): Promise<SubscriptionStatusMap>
  /** look again (both providers when none is named) and answer when done */
  recheck(providers?: AiSubscriptionProviderId[]): Promise<SubscriptionStatusMap>
  /** open the program's own sign-in */
  login(provider: AiSubscriptionProviderId): Promise<SubscriptionLaunchResult>
  /** run the vendor's official install command in a visible terminal window */
  install(provider: AiSubscriptionProviderId): Promise<SubscriptionLaunchResult>
  /** run the official update of a program below the app's floor, in a terminal window */
  update(provider: AiSubscriptionProviderId): Promise<SubscriptionLaunchResult>
  /** end a sign-in the app started (nothing under way is not a failure) */
  cancelLogin(provider: AiSubscriptionProviderId): Promise<SubscriptionLaunchResult>
  /** "use anyway" for a metered login (or take that back) */
  setMeteredAccepted(
    provider: AiSubscriptionProviderId,
    accepted: boolean,
  ): Promise<SubscriptionMeteredResult>
  /** the statuses changed (any window, any cause); returns an unsubscribe */
  onChanged(handler: (statuses: SubscriptionStatusMap) => void): () => void
  /** open the vendor's install instructions in the default browser */
  openInstallHelp(provider: AiSubscriptionProviderId): Promise<void>
  /** open the website's step-by-step connect help at the guide's path (shell only) */
  openConnectHelp(path: SubscriptionConnectHelpPath | null): Promise<void>
}

/** shell-registered: (AiSubscriptionProviderId) → void, opens the vendor's install page */
export const SUBSCRIPTION_INSTALL_HELP_CHANNEL = 'home:open-subscription-install-help'

/** shell-registered: (SubscriptionConnectHelpPath | null) → void, opens the website's connect help */
export const SUBSCRIPTION_CONNECT_HELP_CHANNEL = 'home:open-connect-help'

/**
 * PROVISIONAL channel name. The docs main (the app-wide AI host) answers it
 * with `aiToolCapabilities(settings, { path: 'screen', statuses })`; the name
 * was not final when this was written, so it lives in this one constant and
 * is read through `imageGenerationAvailableOf` only.
 */
export const AI_TOOL_CAPABILITIES_CHANNEL = 'ai:tool-capabilities'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Whether the tool-capabilities answer says an image can be generated right
 * now. Anything else — no handler, an older build, a malformed answer — reads
 * as unavailable, so generate_image is never offered on a guess.
 */
export function imageGenerationAvailableOf(capabilities: unknown): boolean {
  if (!isRecord(capabilities)) return false
  const image = capabilities.imageGeneration
  return isRecord(image) && image.available === true
}
