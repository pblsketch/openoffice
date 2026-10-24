/**
 * One model call of the book translation job over the shared `ai:stream`
 * channel (the preload's `aiStream`, as the AI panel's transport): a system
 * prompt and one user turn of book text, never a tool. The answer is plain
 * text for the job to check; it is book data and nothing in it is executed. A
 * tool call the model makes anyway is ignored.
 *
 * A failed call rejects with a `ModelCallError` carrying the run error kind
 * and `resetsAt`, which the job engine reads to retry ('timeout', 'network',
 * …) or to stop at once ('rate-limit', 'signed-out', …). Aborting the signal
 * cancels the stream; the shell then ends the subscription program it
 * started. The cancel names this request only, so the AI panel's calls in
 * the same tab go on.
 */
import {
  createIpcTransport,
  type AgentStreamHandle,
  type AgentStreamRequest,
  type IpcStreamError,
  type IpcStreamErrorKind,
} from '@genoffice/agent-core'
import type { AiSettings } from '@genoffice/ai-provider/browser'
import type { Lang } from '@genoffice/i18n'
import { aiRunErrorText } from '@genoffice/ui'
import type { EpubAiApi } from '../../shared/ipc'
import { t } from '../i18n/locale'

/** longest answer one call may return (a batch is about 2,500 tokens of text) */
export const MODEL_CALL_MAX_CHARS = 200_000

export class ModelCallError extends Error {
  /** run error kind (IpcStreamErrorKind), when the failure has one */
  readonly kind?: string
  /** epoch ms when a rate limit lifts */
  readonly resetsAt?: number
  readonly provider?: string

  constructor(
    message: string,
    cause?: Partial<Pick<IpcStreamError, 'kind' | 'resetsAt' | 'provider'>>,
  ) {
    super(message)
    this.name = 'ModelCallError'
    if (cause?.kind !== undefined) this.kind = cause.kind
    if (cause?.resetsAt !== undefined) this.resetsAt = cause.resetsAt
    if (cause?.provider !== undefined) this.provider = cause.provider
  }
}

export type ModelStreamApi = Pick<
  EpubAiApi,
  'aiStream' | 'aiStreamCancel' | 'aiStreamCancelRequest' | 'onAiStream'
>

export interface ModelCallOptions {
  /** the preload's stream calls */
  api: ModelStreamApi
  /** the settings the job was confirmed with (selection pinned to one provider) */
  settings: () => AiSettings
  /** the language run-error texts are worded in */
  lang: () => Lang
  /**
   * Asked before each call: the run error kind to fail with when the route
   * the user confirmed no longer holds, else null.
   */
  guard?: () => Promise<IpcStreamErrorKind | null>
  /** default MODEL_CALL_MAX_CHARS */
  maxChars?: number
}

export type ModelCall = (request: AgentStreamRequest, signal: AbortSignal) => Promise<string>

const abortError = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException('The call was stopped', 'AbortError')

/** a fresh transport per call: calls run side by side and share no CLI session */
export function createModelCall(o: ModelCallOptions): ModelCall {
  const maxChars = o.maxChars ?? MODEL_CALL_MAX_CHARS
  return async (request, signal) => {
    if (signal.aborted) throw abortError(signal)
    const refused = (await o.guard?.()) ?? null
    if (refused) {
      throw new ModelCallError(`the confirmed AI connection changed (${refused})`, {
        kind: refused,
      })
    }
    if (signal.aborted) throw abortError(signal)
    return new Promise<string>((resolve, reject) => {
      let cause: IpcStreamError | null = null
      let raw = ''
      let settled = false
      let handle: AgentStreamHandle | null = null
      const finish = (end: () => void) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        end()
      }
      const onAbort = () => {
        handle?.cancel()
        finish(() => reject(abortError(signal)))
      }
      const transport = createIpcTransport<AiSettings>({
        onStream: (listener) => o.api.onAiStream(listener),
        start: (req) => o.api.aiStream(req),
        // Stop on the job ends its own calls, not what the AI panel runs in this tab
        cancel: (requestId) =>
          void (o.api.aiStreamCancelRequest ?? o.api.aiStreamCancel)(requestId),
        getSettings: o.settings,
        unknownErrorText: () => t('aiUnknownError'),
        timeoutErrorText: () => t('aiTimeoutError'),
        creditsErrorText: () => t('aiCreditsExhausted'),
        networkErrorText: () => t('aiNetworkError'),
        overloadedErrorText: () => t('aiOverloadedError'),
        errorText: (c) => aiRunErrorText(o.lang(), c),
        onStreamError: (error) => {
          cause = error
        },
      })
      handle = transport.stream(
        { system: request.system, messages: request.messages, tools: [] },
        {
          onDelta: (text) => {
            if (settled) return
            raw += text
            if (raw.length > maxChars) {
              handle?.cancel()
              finish(() => reject(new ModelCallError(`the answer exceeded ${maxChars} characters`)))
            }
          },
          // the request offers no tool; whatever the model asks for is not run
          onToolCall: () => undefined,
          onDone: () => finish(() => (signal.aborted ? reject(abortError(signal)) : resolve(raw))),
          onError: (message) =>
            finish(() => reject(new ModelCallError(message, cause ?? undefined))),
        },
      )
      if (settled) return
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    })
  }
}
