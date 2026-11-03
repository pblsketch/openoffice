// What a failed run says about its connection, and which usage reports are kept. What the
// panel does with a request before it is sent is the send gate every editor shares
// (`useAiSendGate` in @genoffice/ui).
import type { IpcStreamError, IpcStreamErrorCause } from '@genoffice/agent-core'
import type { AiSubscriptionUsage } from '@genoffice/ai-provider/browser'
import { isAiBlockedRunKind } from '@genoffice/ui'

/** A failed turn whose connection cannot go on: shown as a blocked notice instead of an error line */
export interface BlockedRun extends IpcStreamErrorCause {
  /** the localized text of the failure, kept as the fallback wording */
  message: string
}

export function blockedRunOf(error: IpcStreamError | null | undefined): BlockedRun | null {
  if (!error || !isAiBlockedRunKind(error.kind)) return null
  return {
    kind: error.kind,
    ...(error.provider ? { provider: error.provider } : {}),
    ...(error.resetsAt !== undefined ? { resetsAt: error.resetsAt } : {}),
    message: error.message,
  }
}

/**
 * The blocked cause of the turn that just failed with `message`. The transport
 * reports the structured cause right before the loop gets the same text, so a
 * cause whose text differs belongs to an earlier stream and is ignored.
 */
export function blockedRunFor(
  message: string,
  error: IpcStreamError | null | undefined,
): BlockedRun | null {
  return error?.message === message ? blockedRunOf(error) : null
}

/**
 * The page and brief writers retry a reply that came back empty. A blocked
 * connection would only fail the same way again (and spend a request doing so).
 */
export function writerMayRetry(error: IpcStreamError | null | undefined): boolean {
  return blockedRunOf(error) === null
}

/**
 * The latest usage report per provider and window. A turn may report one
 * window at a time, so a new report replaces only its own window; a window
 * whose reset time has passed is dropped (its figure no longer holds).
 */
export function mergeSubscriptionUsage(
  current: readonly AiSubscriptionUsage[],
  reported: readonly AiSubscriptionUsage[],
  now: number = Date.now(),
): AiSubscriptionUsage[] {
  const latest = new Map<string, AiSubscriptionUsage>()
  for (const entry of [...current, ...reported]) {
    latest.set(`${entry.provider}:${entry.window}`, entry)
  }
  return [...latest.values()].filter((entry) => entry.resetsAt > now)
}
