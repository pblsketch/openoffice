/**
 * F4 "repeat last action" (PowerPoint). Actions that make sense to repeat register a
 * closure here when they run; F4 replays it against whatever is selected at that moment.
 * Only the latest registration is kept. Replays register themselves again, which is
 * harmless: the closure is the same action.
 */
import type { ActionCtx } from './action-context'

type RepeatFn = (ctx: ActionCtx) => void | Promise<void>

let last: RepeatFn | null = null

export function rememberRepeat(fn: RepeatFn): void {
  last = fn
}

/** F4: replay the last repeatable action; false when there is nothing to repeat */
export function repeatLast(ctx: ActionCtx): boolean {
  const fn = last
  if (!fn) return false
  void fn(ctx)
  return true
}
