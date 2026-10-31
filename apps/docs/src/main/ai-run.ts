/**
 * The rules behind the shared `ai:*` handlers that docs-main.ts registers for
 * the Docs, PDF, Markdown and HTML editors: which provider a request runs on,
 * and how a refusal or a failure is reported to the renderer. Nothing here
 * imports Electron, so the rules are covered by unit tests.
 *
 * A request never falls back to another provider. `auto` resolves to a ready
 * subscription only; anything that costs money runs only when it is the
 * stored selection (see selectAiProvider).
 */
import {
  AI_PROVIDERS,
  aiStreamErrorFields,
  isAiOverloadedError,
  isSubscriptionProvider,
  normalizeAiSettings,
  sanitizeAiSettings,
  selectAiProvider,
  type AiProviderChoice,
  type AiProviderConfig,
  type AiProviderId,
  type AiSettings,
  type AiStreamChunk,
  type AiSubscriptionProviderId,
  type AiSubscriptionStatuses,
  type StreamCallbacks,
} from '@genoffice/ai-provider'

/** What an error chunk says about a failure: the text and its machine-readable cause */
export type AiRunErrorFields = { error: string } & Pick<
  AiStreamChunk,
  'errorCode' | 'errorProvider' | 'errorResetsAt'
>

export type AiRunTarget =
  | {
      ok: true
      /** the request's settings as normalised */
      settings: AiSettings
      provider: AiProviderId
      config: AiProviderConfig
      /** an accepted metered CLI login */
      metered: boolean
    }
  | {
      ok: false
      /** the error fields to answer with instead of calling any provider */
      refusal: AiRunErrorFields
    }

/** Localized texts the main process already has for a key provider that is not filled in */
export interface AiRunTexts {
  noApiKey(provider: AiProviderId): string
  noModel(): string
}

export const AI_INVALID_SETTINGS_ERROR = 'invalid AI settings payload'

function providerLabel(provider: AiProviderId): string {
  return AI_PROVIDERS.find((meta) => meta.id === provider)?.label ?? provider
}

/**
 * The text carried by a refusal. Renderers word a refusal themselves from its
 * `errorCode` (aiRunErrorText in @genoffice/ui); this English sentence is only
 * what a caller without that wording shows.
 */
function notConnectedText(
  choice: Extract<AiProviderChoice, { connected: false }>,
  settings: AiSettings,
  texts: AiRunTexts,
): string {
  const provider = choice.provider
  if (!provider) return 'No AI is connected. Connect a Claude or ChatGPT subscription first.'
  if (choice.reason === 'not-configured') {
    return settings.providers[provider]?.model?.trim() ? texts.noApiKey(provider) : texts.noModel()
  }
  const name = providerLabel(provider)
  switch (choice.reason) {
    case 'not-installed':
      return `The ${name} program was not found on this PC.`
    case 'signed-out':
      return `${name} is not signed in.`
    case 'metered-not-accepted':
      return `The ${name} login is charged by usage and has not been allowed.`
    case 'checking':
      return `The ${name} connection is still being checked.`
    default:
      return choice.detail ?? `The ${name} connection cannot be used right now.`
  }
}

/**
 * The provider a request runs on, from the settings the renderer sent and the
 * connection statuses of the subscription CLIs — or the refusal to answer
 * with. The settings pass the same schema check as the stored ones, and a
 * removed or unknown selection reads as `auto`.
 */
export function resolveAiRun(
  requestSettings: unknown,
  statuses: AiSubscriptionStatuses,
  texts: AiRunTexts,
): AiRunTarget {
  const sanitized = sanitizeAiSettings(requestSettings)
  if (!sanitized) return { ok: false, refusal: { error: AI_INVALID_SETTINGS_ERROR } }
  const settings = normalizeAiSettings(sanitized)
  const choice = selectAiProvider(settings, statuses)
  if (!choice.connected) {
    return {
      ok: false,
      refusal: {
        error: notConnectedText(choice, settings, texts),
        errorCode: choice.errorKind,
        ...(isSubscriptionProvider(choice.provider) ? { errorProvider: choice.provider } : {}),
      },
    }
  }
  return {
    ok: true,
    settings,
    provider: choice.provider,
    // a subscription provider needs no stored entry: an empty model is the CLI's default
    config: settings.providers[choice.provider] ?? { apiKey: '', model: '' },
    metered: choice.metered,
  }
}

/** The stream callbacks that pass what a subscription CLI reports on to the renderer */
export function subscriptionStreamCallbacks(
  requestId: string,
  send: (chunk: AiStreamChunk) => void,
): Required<Pick<StreamCallbacks, 'onSubscriptionUsage' | 'onInputTruncated'>> {
  return {
    onSubscriptionUsage: (usage) =>
      send({ requestId, type: 'subscription-usage', subscriptionUsage: usage }),
    onInputTruncated: () => send({ requestId, type: 'input-truncated' }),
  }
}

/** The error chunk for a failed stream: the message plus the cause the renderer acts on */
export function aiStreamErrorChunk(requestId: string, err: unknown): AiStreamChunk {
  return {
    requestId,
    type: 'error',
    error: err instanceof Error ? err.message : String(err),
    ...aiStreamErrorFields(err),
  }
}

/**
 * The answer of a failed one-shot chat. A capacity failure keeps its localized
 * "busy" text; the cause fields ride along so a renderer can word the
 * subscription kinds itself.
 */
export function aiChatFailure(
  err: unknown,
  busyText: () => string,
): { ok: false } & AiRunErrorFields {
  return {
    ok: false,
    error: isAiOverloadedError(err) ? busyText() : String(err),
    ...aiStreamErrorFields(err),
  }
}

/** The stored settings with one provider's "use anyway" answer recorded */
export function withMeteredAccepted(
  stored: unknown,
  provider: AiSubscriptionProviderId,
  accepted: boolean,
): AiSettings {
  const settings = normalizeAiSettings(stored)
  return { ...settings, meteredAccepted: { ...settings.meteredAccepted, [provider]: accepted } }
}
