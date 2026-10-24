/**
 * Loading a settings file written before the subscription providers existed.
 * Such a file names a provider that no longer exists in its selection slots
 * and carries a switch that was removed. Every slot holding an unknown id
 * (a removed one is simply unknown now) falls to its default, fields this
 * build does not know are left out so the next save no longer writes them,
 * and nothing here throws: an old file must never greet the user with an
 * error.
 *
 * Unknown ids are treated the way the IPC guard (ai-settings-guard.ts) treats
 * them on save: a provider config under an unknown id is dropped. The guard
 * rejects an unknown selection outright because a renderer sent it; a file on
 * disk gets the default instead.
 */
import { AI_MEDIA_PROVIDERS, providerHasCapability, type MediaCapability } from './media'
import {
  AI_PROVIDERS,
  defaultAiSettings,
  headlessConsentVersionOf,
  headlessSubscriptionOn,
  readUrlSettingsOf,
  resolveAiSettings,
  sanitizeMeteredAccepted,
} from './providers'
import { AI_SEARCH_PROVIDERS } from './search-settings'
import type {
  AiAnalysisProviderSelection,
  AiImageProviderSelection,
  AiMediaSettings,
  AiProviderId,
  AiProviderSelection,
  AiSearchProviderId,
  AiSearchSettings,
  AiSettings,
  AiVideoAnalysisProviderSelection,
} from './types'

export const DEFAULT_AI_PROVIDER_SELECTION: AiProviderSelection = 'auto'
/**
 * Stored even in a build without Codex image generation: there it behaves
 * exactly like `none` (see resolveImageBackend), so the stored value does not
 * depend on which build wrote the file.
 */
export const DEFAULT_AI_IMAGE_PROVIDER: AiImageProviderSelection = 'codex'
export const DEFAULT_AI_ANALYSIS_PROVIDER: AiAnalysisProviderSelection = 'chat'
export const DEFAULT_AI_VIDEO_ANALYSIS_PROVIDER: AiVideoAnalysisProviderSelection = 'none'
/** Parallel with an empty key is the keyless free route (free Parallel search, then DuckDuckGo) */
export const DEFAULT_AI_SEARCH_PROVIDER: AiSearchProviderId = 'parallel'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** a key media provider that has the capability, by id */
function mediaKeyProvider(id: unknown, capability: MediaCapability): boolean {
  const meta = AI_MEDIA_PROVIDERS.find((m) => m.id === id)
  return !!meta && providerHasCapability(meta, capability)
}

/** entries of `stored` whose id is in `known`; everything else is dropped */
function knownEntries<T>(stored: unknown, known: readonly string[]): T {
  const out: Record<string, unknown> = {}
  if (isRecord(stored)) {
    for (const id of known) {
      if (stored[id] !== undefined) out[id] = stored[id]
    }
  }
  return out as T
}

function normalizeMedia(media: AiMediaSettings): AiMediaSettings {
  const image: unknown = media.imageProvider
  const analysis: unknown = media.analysisProvider
  const video: unknown = media.videoAnalysisProvider
  return {
    imageProvider:
      image === 'codex' || image === 'none' || mediaKeyProvider(image, 'image')
        ? (image as AiImageProviderSelection)
        : DEFAULT_AI_IMAGE_PROVIDER,
    analysisProvider:
      analysis === 'chat' || mediaKeyProvider(analysis, 'analysis')
        ? (analysis as AiAnalysisProviderSelection)
        : DEFAULT_AI_ANALYSIS_PROVIDER,
    videoAnalysisProvider:
      video === 'none' || mediaKeyProvider(video, 'video')
        ? (video as AiVideoAnalysisProviderSelection)
        : DEFAULT_AI_VIDEO_ANALYSIS_PROVIDER,
    providers: knownEntries(
      media.providers,
      AI_MEDIA_PROVIDERS.map((m) => m.id),
    ),
  }
}

function normalizeSearch(search: AiSearchSettings): AiSearchSettings {
  const stored: unknown = search.provider
  const known = AI_SEARCH_PROVIDERS.some((m) => m.id === stored)
  return {
    provider: known ? (stored as AiSearchProviderId) : DEFAULT_AI_SEARCH_PROVIDER,
    providers: search.providers,
  }
}

/**
 * The settings to work with, from whatever the settings file held (already
 * JSON-parsed; this function does no file I/O). Runs resolveAiSettings, then
 * replaces unknown selections with their defaults and leaves out every field
 * this build does not know. Never throws.
 */
export function normalizeAiSettings(
  stored: unknown,
  defaults: AiSettings = defaultAiSettings(),
): AiSettings {
  let resolved: AiSettings
  try {
    resolved = resolveAiSettings(stored, defaults)
  } catch {
    // a file too broken to merge reads as no file at all
    resolved = resolveAiSettings(undefined, defaultAiSettings())
  }
  const provider: unknown = resolved.provider
  const selection =
    provider === 'auto' || AI_PROVIDERS.some((m) => m.id === provider)
      ? (provider as AiProviderSelection)
      : DEFAULT_AI_PROVIDER_SELECTION
  const fallback = defaultAiSettings()
  const readUrl = readUrlSettingsOf(resolved.readUrl)
  return {
    ...resolved,
    ...(readUrl ? { readUrl } : {}),
    provider: selection,
    providers: {
      ...fallback.providers,
      ...knownEntries<Partial<AiSettings['providers']>>(
        resolved.providers,
        AI_PROVIDERS.map((m): AiProviderId => m.id),
      ),
    },
    media: normalizeMedia(resolved.media ?? fallback.media!),
    search: normalizeSearch(resolved.search ?? fallback.search!),
    meteredAccepted: sanitizeMeteredAccepted(resolved.meteredAccepted),
    headlessSubscriptionEnabled: headlessSubscriptionOn(resolved),
    headlessSubscriptionConsentVersion: headlessConsentVersionOf(
      resolved.headlessSubscriptionConsentVersion,
    ),
    subscriptionNoticeSeen: resolved.subscriptionNoticeSeen === true,
    ...(resolved.internetTools === false ? { internetTools: false } : {}),
  }
}
