/**
 * Which route a generate_image / analyze_media request starts on. Pure: the
 * tools (media-tools.ts) and the capability report (tool-capabilities.ts) ask
 * the same functions, so what is reported as available is what would run.
 *
 * A request arrives on one of two paths. The screen path is a person asking
 * in an editor. The automatic-call path (`headless`) is the command line or
 * an integration (MCP): there a subscription login is used only when the
 * user turned that on, and then one request at a time, with no hourly cap
 * (headless-ledger.ts). A metered login the user accepted is not a
 * subscription: it costs money per request like a key, so it is neither
 * switched off nor counted, and it never generates images.
 */

import {
  activeMediaConfig,
  codexImageGenerationAvailable,
  getMediaProviderMeta,
  getProviderAdapter,
  headlessSubscriptionOn,
  isSubscriptionProvider,
  modelLacksVision,
  offSubscriptionStatus,
  resolveImageBackend,
  selectAiProvider,
  subscriptionOffIn,
  type AiImageBackend,
  type AiMediaKeyProviderId,
  type AiMediaProviderConfig,
  type AiProviderId,
  type AiSettings,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider'
import { codexImageGenerator } from './codex-image-generator'

export type AiToolCallPath = 'screen' | 'headless'

/** Who is asking. Callers that pass none are the screen path with no subscription status. */
export interface AiToolCallContext {
  path: AiToolCallPath
  /** connection status of the subscription CLIs as the caller last checked it; left out = none connected */
  statuses?: AiSubscriptionStatuses | undefined
  /** directory of the headless lock and ledger; a headless caller without one never uses a subscription */
  dataDir?: string | undefined
}

export const SCREEN_TOOL_CONTEXT: AiToolCallContext = { path: 'screen' }

const HEADLESS_SETTING_HINT =
  ' Command-line and integration requests use a subscription login only after that is turned on under Settings > AI > Advanced.'

/** True when this request is on the automatic-call path and may not use a subscription login. */
export function headlessSubscriptionBlocked(
  settings: Pick<AiSettings, 'headlessSubscriptionEnabled' | 'headlessSubscriptionConsentVersion'>,
  context: AiToolCallContext,
): boolean {
  if (context.path !== 'headless') return false
  // without a directory for the lock, one request at a time could not be kept, so the answer is no
  return !(headlessSubscriptionOn(settings) && context.dataDir)
}

/**
 * The statuses routing may look at. A blocked headless request behaves as if
 * no subscription existed, so `ready` logins are left out; a metered login
 * stays, because whether it runs is the user's explicit selection, not the
 * headless setting. A CLI turned off in this app reads as off whatever its
 * status says, so no tool (Codex image generation among them) starts it.
 */
function routingStatuses(settings: AiSettings, context: AiToolCallContext): AiSubscriptionStatuses {
  const statuses: AiSubscriptionStatuses = { ...context.statuses }
  for (const id of ['claude-code', 'codex'] as const) {
    if (subscriptionOffIn(settings, id)) statuses[id] = offSubscriptionStatus(id)
  }
  if (!headlessSubscriptionBlocked(settings, context)) return statuses
  const visible: AiSubscriptionStatuses = {}
  for (const id of ['claude-code', 'chatgpt', 'codex'] as const) {
    const status = statuses[id]
    if (status && status.state !== 'ready') visible[id] = status
  }
  return visible
}

/** Codex image generation exists in this process: the build announces it and a generator is registered. */
export function codexImageRouteOffered(): boolean {
  return codexImageGenerationAvailable() && codexImageGenerator() !== null
}

/** The backend a generate_image request starts on (spec: chosen once, never changed midway). */
export function resolveImageRoute(
  settings: AiSettings,
  context: AiToolCallContext = SCREEN_TOOL_CONTEXT,
): AiImageBackend {
  return resolveImageBackend(settings, {
    codex: routingStatuses(settings, context).codex,
    codexImageAvailable: codexImageRouteOffered(),
  })
}

export function imageGenerationUnavailableMessage(
  settings: AiSettings,
  context: AiToolCallContext = SCREEN_TOOL_CONTEXT,
): string {
  const offered = codexImageRouteOffered()
  const blocked = headlessSubscriptionBlocked(settings, context)
  const connect =
    offered && !blocked ? 'connect Codex with a subscription login under Settings > AI, or ' : ''
  return (
    `Image generation is unavailable: ${connect}add an image provider key under Settings > AI > Advanced.` +
    (offered && blocked ? HEADLESS_SETTING_HINT : '') +
    ' Use image search for imagery instead.'
  )
}

export type AiKeyMediaRoute = {
  kind: 'key'
  provider: AiMediaKeyProviderId
  config: AiMediaProviderConfig
}

export type AiImageAnalysisRoute =
  | AiKeyMediaRoute
  | {
      /** the AI provider the chat runs on is shown the image */
      kind: 'chat'
      provider: AiProviderId
      /** `metered` and `key` cost the user money per request and are never queued or counted on the headless path */
      billing: 'subscription' | 'metered' | 'key'
    }
  | { kind: 'none'; message: string }

export type AiVideoAnalysisRoute = AiKeyMediaRoute | { kind: 'none'; message: string }

/** The selected key provider for one analysis capability, when it has a key and a model to ask. */
function keyMediaRoute(
  settings: AiSettings,
  capability: 'analysis' | 'video',
): AiKeyMediaRoute | null {
  const active = activeMediaConfig(settings, capability)
  if (!active) return null
  // a custom endpoint ships no default model: without one there is nothing to ask
  const model =
    active.config.analysisModel?.trim() ||
    getMediaProviderMeta(active.provider)?.defaultAnalysisModel
  return model ? { kind: 'key', ...active } : null
}

/**
 * Image analysis: the selected key analysis provider when it is filled in,
 * otherwise the AI provider the chat runs on. That provider is resolved the
 * way the chat resolves it, so nothing that costs money is picked on the
 * user's behalf.
 */
export function resolveImageAnalysisRoute(
  settings: AiSettings,
  context: AiToolCallContext = SCREEN_TOOL_CONTEXT,
): AiImageAnalysisRoute {
  const key = keyMediaRoute(settings, 'analysis')
  if (key) return key
  const blocked = headlessSubscriptionBlocked(settings, context)
  const choice = selectAiProvider(settings, routingStatuses(settings, context))
  if (!choice.connected) {
    return {
      kind: 'none',
      message: blocked
        ? `Image analysis is unavailable: select an image analysis provider key under Settings > AI > Advanced.${HEADLESS_SETTING_HINT}`
        : 'Image analysis is unavailable: no AI provider is connected. Connect Claude Code or Codex under Settings > AI, or select an image analysis provider key under Settings > AI > Advanced.',
    }
  }
  const model = settings.providers[choice.provider]?.model ?? ''
  if (!getProviderAdapter(choice.provider).capabilities.vision || modelLacksVision(model)) {
    return {
      kind: 'none',
      message:
        'Image analysis is unavailable: the selected AI model cannot read images. Select a model that can, or an image analysis provider key under Settings > AI > Advanced.',
    }
  }
  return {
    kind: 'chat',
    provider: choice.provider,
    billing: !isSubscriptionProvider(choice.provider)
      ? 'key'
      : choice.metered
        ? 'metered'
        : 'subscription',
  }
}

/** Video and audio analysis: a key provider that reads video, or nothing. */
export function resolveVideoAnalysisRoute(settings: AiSettings): AiVideoAnalysisRoute {
  return (
    keyMediaRoute(settings, 'video') ?? {
      kind: 'none',
      message:
        'Video and audio analysis is unavailable: it needs a key provider that reads video (for example Gemini), selected as the video analysis provider under Settings > AI > Advanced.',
    }
  )
}
