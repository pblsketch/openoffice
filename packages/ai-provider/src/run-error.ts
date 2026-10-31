/**
 * A failed run with a machine-readable cause. The subscription bridges throw
 * it; the main process turns whatever was thrown into the error fields of the
 * stream chunk, so the renderer can show the right guidance (connect, sign in,
 * wait until the limit resets) instead of a raw message.
 */
import { freeLimitOf, isFreeTierModelRefusal } from './free-ai'
import { isAiNetworkError } from './network-error'
import { isAiOverloadedError } from './overload-error'
import { AiCreditsError } from './protocols/shared'
import type { AiRunErrorKind, AiStreamChunk, AiSubscriptionProviderId } from './types'
import { AiTimeoutError } from './watchdog'

export class AiRunError extends Error {
  readonly kind: AiRunErrorKind
  /** subscription provider the error is about */
  readonly provider?: AiSubscriptionProviderId
  /** epoch milliseconds: when the limit resets ('rate-limit') or calls are allowed again ('headless-limit') */
  readonly resetsAt?: number

  constructor(
    kind: AiRunErrorKind,
    message: string,
    detail: { provider?: AiSubscriptionProviderId; resetsAt?: number } = {},
  ) {
    super(message)
    this.name = 'AiRunError'
    this.kind = kind
    if (detail.provider !== undefined) this.provider = detail.provider
    if (detail.resetsAt !== undefined) this.resetsAt = detail.resetsAt
  }
}

/**
 * The error fields of an 'error' stream chunk for a thrown value: the kind
 * and values of an AiRunError, or the code the existing error classes map to.
 * Empty when the error has no machine-readable cause.
 */
export function aiStreamErrorFields(
  err: unknown,
): Pick<AiStreamChunk, 'errorCode' | 'errorProvider' | 'errorResetsAt'> {
  if (err instanceof AiRunError) {
    return {
      errorCode: err.kind,
      ...(err.provider !== undefined ? { errorProvider: err.provider } : {}),
      ...(err.resetsAt !== undefined ? { errorResetsAt: err.resetsAt } : {}),
    }
  }
  if (err instanceof AiTimeoutError) return { errorCode: 'timeout' }
  if (err instanceof AiCreditsError) return { errorCode: 'credits' }
  if (isAiNetworkError(err)) return { errorCode: 'network' }
  // also a 429, and no retry or wait helps: the model is not on the key's free tier
  if (isFreeTierModelRefusal(err)) return { errorCode: 'free-tier-model' }
  // a used-up daily free allowance is also a 429: tell it apart before "busy, try again shortly"
  const freeLimit = freeLimitOf(err)
  if (freeLimit) {
    return {
      errorCode: 'free-limit',
      ...(freeLimit.resetsAt !== undefined ? { errorResetsAt: freeLimit.resetsAt } : {}),
    }
  }
  if (isAiOverloadedError(err)) return { errorCode: 'overloaded' }
  return {}
}
