import {
  createIpcTransport,
  type AgentTransport,
  type IpcStreamError,
  type IpcSubscriptionUsage,
} from '@genoffice/agent-core'
import type { AiSettings } from '@genoffice/ai-provider'
import type { Lang } from '@genoffice/i18n'
import { aiRunErrorText } from '@genoffice/ui'
import { t } from '../i18n/locale'

/** What the panel learns from a turn besides its text; every writer shares the one transport, so all of them report here */
export interface ElectronTransportHooks {
  /** current UI language, for the shared run-error wording */
  getLang(): Lang
  /** structured copy of every failed turn (kind, provider, reset time), right before the loop gets its message */
  onStreamError(error: IpcStreamError): void
  /** rate-limit windows a subscription program reported during the turn */
  onSubscriptionUsage(usage: IpcSubscriptionUsage[]): void
  /** the input was cut to fit a limit: the user must be told */
  onInputTruncated(): void
}

/** The shared IPC transport wired to the EPUB preload bridge (window.epubApi). */
export function createElectronTransport(
  getSettings: () => AiSettings,
  hooks: ElectronTransportHooks,
): AgentTransport {
  return createIpcTransport<AiSettings>({
    onStream: (listener) => window.epubApi.onAiStream(listener),
    start: (request) => window.epubApi.aiStream(request),
    cancel: (requestId) => void window.epubApi.aiStreamCancel(requestId),
    getSettings,
    unknownErrorText: () => t('aiUnknownError'),
    timeoutErrorText: () => t('aiTimeoutError'),
    creditsErrorText: () => t('aiCreditsExhausted'),
    networkErrorText: () => t('aiNetworkError'),
    overloadedErrorText: () => t('aiOverloadedError'),
    // the subscription causes are worded once for every editor; the four above stay this app's
    errorText: (cause) => aiRunErrorText(hooks.getLang(), cause),
    onStreamError: (error) => hooks.onStreamError(error),
    onSubscriptionUsage: (usage) => hooks.onSubscriptionUsage(usage),
    onInputTruncated: () => hooks.onInputTruncated(),
  })
}
