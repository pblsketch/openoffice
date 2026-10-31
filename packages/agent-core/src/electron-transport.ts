import type {
  AgentStreamRequest,
  AgentTokenUsage,
  AgentToolCall,
  AgentToolDef,
  AgentTransport,
  AgentMessage,
} from './types'
import { contextWarningFor, type ContextWarning } from './context-budget'

/**
 * Machine-readable cause of a failed turn. The one definition of the union:
 * ai-provider's AiRunErrorKind is an alias of it.
 */
export type IpcStreamErrorKind =
  | 'timeout'
  | 'credits'
  | 'network'
  | 'overloaded'
  /** no usable provider */
  | 'not-connected'
  /** the subscription CLI was not found */
  | 'not-installed'
  /** the subscription CLI is no longer signed in */
  | 'signed-out'
  /** the subscription limit is used up */
  | 'rate-limit'
  /** Claude Code started with tools available */
  | 'unsafe-tools'
  /** the selected connection is metered and the user has not accepted that */
  | 'metered-not-accepted'
  /** the subscription CLI is too old for a required feature */
  | 'needs-update'
  /** the hourly limit of headless (terminal command, MCP) calls is used up */
  | 'headless-limit'
  /** today's free allowance of a free key connection (OpenRouter `:free`, Gemini free tier) is used up */
  | 'free-limit'
  /** the model is not offered on the free tier the key is on (Gemini answers with a quota of 0) */
  | 'free-tier-model'
  /** the user declined to send a request larger than the context budget */
  | 'context-limit'

/** Subscription providers (ai-provider's AiSubscriptionProviderId): the two vendor CLIs, and ChatGPT reached directly */
export type IpcSubscriptionProviderId = 'claude-code' | 'codex' | 'chatgpt'

/** What an error chunk says about its cause, without the message */
export interface IpcStreamErrorCause {
  kind: IpcStreamErrorKind
  /** subscription provider the error is about */
  provider?: IpcSubscriptionProviderId
  /** epoch milliseconds: when the limit resets ('rate-limit', 'free-limit') or calls are allowed again ('headless-limit') */
  resetsAt?: number
}

/** One failed turn as the app sees it; `kind` is absent when the failure has no machine-readable cause */
export interface IpcStreamError extends Partial<IpcStreamErrorCause> {
  /** the text handed to onError */
  message: string
}

/** How much of one rate-limit window a subscription has used (ai-provider's AiSubscriptionUsage) */
export interface IpcSubscriptionUsage {
  provider: IpcSubscriptionProviderId
  window: 'five_hour' | 'seven_day'
  /** 0 (unused) to 1 (exhausted) */
  utilization: number
  /** epoch milliseconds; a window the CLI reports without a reset time is not a usage value */
  resetsAt: number
}

/**
 * One streamed chunk pushed back over an Electron IPC bridge. Structurally
 * identical to ai-provider's AiStreamChunk; declared here so this package
 * stays dependency-free.
 */
export interface IpcStreamChunk {
  requestId: string
  /** 'ping' = wire-level keepalive; re-arms the silence watchdog and carries no payload;
   * 'reasoning' = model thinking delta (text carries it);
   * 'subscription-usage' = rate-limit windows a subscription CLI reported;
   * 'input-truncated' = the input was cut to fit a limit and the user must be told */
  type:
    | 'delta'
    | 'reasoning'
    | 'tool-call'
    | 'usage'
    | 'subscription-usage'
    | 'input-truncated'
    | 'done'
    | 'error'
    | 'ping'
  text?: string
  toolCall?: AgentToolCall
  error?: string
  /** machine-readable error cause; maps to a localized message (see errorText) */
  errorCode?: IpcStreamErrorKind
  /** subscription provider the error is about */
  errorProvider?: IpcSubscriptionProviderId
  /** epoch milliseconds: when the limit resets ('rate-limit') or calls are allowed again ('headless-limit') */
  errorResetsAt?: number
  /** normalized stop reason on 'done' ('max_tokens' = cut off by the token limit) */
  stopReason?: string
  /** tokens the provider billed for this turn, carried on 'usage' (always sent before 'done') */
  usage?: AgentTokenUsage
  /** rate-limit windows carried on 'subscription-usage' */
  subscriptionUsage?: IpcSubscriptionUsage[]
}

/** The request forwarded to the main process to start one streaming turn. */
export interface IpcStreamStart<S> {
  requestId: string
  /** Stable for the lifetime of one renderer-side transport. Providers with
   * native conversations can reuse it across the tool loop and follow-ups. */
  sessionId: string
  settings: S
  system: string
  messages: AgentMessage[]
  tools: AgentToolDef[]
}

/**
 * Renderer-side silence watchdog: the main process re-arms it with keepalive
 * pings on wire activity, so firing means the turn is dead (main-process stall,
 * lost chunks) and the run must fail instead of leaving the UI busy forever.
 * Longer than the main-process idle timeout (180s) so that one (localized) wins.
 */
export const IPC_STREAM_SILENCE_TIMEOUT_MS = 240_000

/**
 * Remembers which runs the person already confirmed for a large prompt. The app
 * may share one across transports (a panel per window) so one tool loop asks
 * once; without it a transport keeps its own memory.
 */
export interface IpcContextGate {
  isConfirmed(runId: string): boolean
  markConfirmed(runId: string): void
}

export interface IpcTransportOptions<S> {
  /** subscribe to stream chunks; returns the unsubscribe function */
  onStream(listener: (chunk: IpcStreamChunk) => void): () => void
  /** forward the start request to the main process; a returned promise reports handler failure */
  start(request: IpcStreamStart<S>): void | Promise<unknown>
  /** abort the in-flight turn in the main process */
  cancel(requestId: string): void
  getSettings(): S
  /** localized fallback when an error chunk carries no message */
  unknownErrorText(): string
  /** localized message for timeouts (errorCode 'timeout' and the silence watchdog) */
  timeoutErrorText?(): string
  /** localized message for exhausted credits (errorCode 'credits') */
  creditsErrorText?(): string
  /** localized message for network connectivity failures (errorCode 'network') */
  networkErrorText?(): string
  /** localized message for capacity/rate-limit failures (errorCode 'overloaded') */
  overloadedErrorText?(): string
  /**
   * Localized message for any error kind, built from its accompanying values.
   * Wins over the per-code texts above; returning undefined falls back to them.
   */
  errorText?(cause: IpcStreamErrorCause): string | undefined
  /** structured copy of every failure, delivered right before onError gets its message */
  onStreamError?(error: IpcStreamError): void
  /** rate-limit windows a subscription CLI reported during the turn */
  onSubscriptionUsage?(usage: IpcSubscriptionUsage[]): void
  /** the input was cut to fit a limit; the app must tell the user */
  onInputTruncated?(): void
  /**
   * The selected model's context window, when the app knows how to read it.
   * Returning undefined (a subscription provider or another connection without
   * a local window) skips the context gate for that request; an unreported size
   * is `{ limit: 4096, known: false }`, not undefined.
   */
  contextLimit?(settings: S): { limit: number; known: boolean } | undefined
  /**
   * Ask the person before sending a prompt close to that window. False means
   * the request must not be sent. Absent is treated as a decline: a limit is
   * reported only to protect the person, never to send silently.
   */
  confirmContext?(warning: ContextWarning): boolean
  /** confirmation memory shared across transports (see IpcContextGate) */
  contextGate?: IpcContextGate
}

/**
 * AgentTransport over an Electron IPC bridge: the main process talks to the
 * LLM providers (avoids renderer CORS) and streams chunks back per requestId.
 * Each app wires in its own preload bridge and i18n via the options.
 */
export function createIpcTransport<S>(options: IpcTransportOptions<S>): AgentTransport {
  const timeoutText = () =>
    options.errorText?.({ kind: 'timeout' }) ??
    options.timeoutErrorText?.() ??
    options.unknownErrorText()
  const causeText = (cause: IpcStreamErrorCause, carried: string | undefined): string => {
    if (cause.kind === 'timeout') return timeoutText()
    const legacy =
      cause.kind === 'credits'
        ? options.creditsErrorText
        : cause.kind === 'network'
          ? options.networkErrorText
          : cause.kind === 'overloaded'
            ? options.overloadedErrorText
            : undefined
    return options.errorText?.(cause) ?? legacy?.() ?? carried ?? options.unknownErrorText()
  }
  const sessionId = crypto.randomUUID()
  /** runs this transport confirmed, when the app did not supply a shared gate */
  const confirmedRuns = new Set<string>()
  const ownGate: IpcContextGate = {
    isConfirmed: (runId) => confirmedRuns.has(runId),
    markConfirmed: (runId) => {
      confirmedRuns.add(runId)
    },
  }
  const gate = (): IpcContextGate => options.contextGate ?? ownGate
  /** The warning this request must confirm first, or undefined when it may start */
  const pendingWarning = (request: AgentStreamRequest): ContextWarning | undefined => {
    // internal follow-up turns (a compaction summary) are not the person's request
    if (request.skipContextGate) return undefined
    const limit = options.contextLimit?.(options.getSettings())
    if (!limit) return undefined
    const warning = contextWarningFor(
      request.system,
      request.messages,
      request.tools,
      limit.limit,
      limit.known,
    )
    if (!warning) return undefined
    // an absent run id has no memory: each request is its own run, so each asks
    if (request.runId && gate().isConfirmed(request.runId)) return undefined
    return warning
  }
  return {
    stream(request: AgentStreamRequest, cb) {
      const requestId = crypto.randomUUID()
      const warning = pendingWarning(request)
      if (warning) {
        let confirmed: boolean
        try {
          confirmed = options.confirmContext?.(warning) === true
        } catch {
          // a broken dialog declines: nothing is sent without a yes
          confirmed = false
        }
        if (!confirmed) {
          const message = causeText({ kind: 'context-limit' }, undefined)
          try {
            options.onStreamError?.({ kind: 'context-limit', message })
          } catch {
            // a broken listener must not swallow the refusal
          }
          cb.onError(message)
          // nothing was started, so nothing needs cancelling
          return { cancel: () => {} }
        }
        if (request.runId) gate().markConfirmed(request.runId)
      }
      let settled = false
      let silenceTimer: ReturnType<typeof setTimeout> | undefined
      const settle = () => {
        settled = true
        clearTimeout(silenceTimer)
        unsubscribe()
      }
      const fail = (error: string, cause?: IpcStreamErrorCause) => {
        if (settled) return
        settle()
        try {
          options.onStreamError?.({ ...cause, message: error })
        } catch {
          // a broken listener must not leave the run without its error
        }
        cb.onError(error)
      }
      const armSilence = () => {
        clearTimeout(silenceTimer)
        silenceTimer = setTimeout(() => {
          options.cancel(requestId)
          fail(timeoutText(), { kind: 'timeout' })
        }, IPC_STREAM_SILENCE_TIMEOUT_MS)
      }
      const unsubscribe = options.onStream((chunk) => {
        if (chunk.requestId !== requestId || settled) return
        if (chunk.type === 'ping') {
          armSilence()
        } else if (chunk.type === 'delta') {
          armSilence()
          cb.onDelta(chunk.text ?? '')
        } else if (chunk.type === 'reasoning') {
          armSilence()
          if (chunk.text) cb.onReasoning?.(chunk.text)
        } else if (chunk.type === 'tool-call') {
          armSilence()
          if (chunk.toolCall) cb.onToolCall(chunk.toolCall)
        } else if (chunk.type === 'usage') {
          armSilence()
          if (chunk.usage) cb.onUsage?.(chunk.usage)
        } else if (chunk.type === 'subscription-usage') {
          armSilence()
          if (chunk.subscriptionUsage) options.onSubscriptionUsage?.(chunk.subscriptionUsage)
        } else if (chunk.type === 'input-truncated') {
          armSilence()
          options.onInputTruncated?.()
        } else if (chunk.type === 'done') {
          settle()
          if (chunk.stopReason) cb.onStopReason?.(chunk.stopReason)
          cb.onDone()
        } else if (chunk.type === 'error') {
          if (!chunk.errorCode) {
            fail(chunk.error ?? options.unknownErrorText())
            return
          }
          const cause: IpcStreamErrorCause = {
            kind: chunk.errorCode,
            ...(chunk.errorProvider ? { provider: chunk.errorProvider } : {}),
            ...(chunk.errorResetsAt !== undefined ? { resetsAt: chunk.errorResetsAt } : {}),
          }
          fail(causeText(cause, chunk.error), cause)
        } else {
          // A chunk kind this build predates must not kill the run; traffic proves it is alive.
          armSilence()
        }
      })
      armSilence()
      try {
        // a rejected/thrown start would otherwise leave the run pending until the watchdog
        Promise.resolve(
          options.start({
            requestId,
            sessionId,
            settings: options.getSettings(),
            system: request.system,
            messages: request.messages,
            tools: request.tools,
          }),
        ).catch((err: unknown) => {
          fail(err instanceof Error ? err.message : options.unknownErrorText())
        })
      } catch (err) {
        fail(err instanceof Error ? err.message : options.unknownErrorText())
      }
      return { cancel: () => options.cancel(requestId) }
    },
  }
}
