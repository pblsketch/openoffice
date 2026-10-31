/**
 * Run errors that end a deck generation at once instead of being retried.
 *
 * The same rule as the PDF document jobs' `JOB_STOP_KINDS`
 * (packages/pdf-structure/src/jobs/errors.ts): the connection cannot go on
 * (signed out, limit used up, program gone, tools unsafe, metered login not
 * accepted) or nothing a retry can change (out of credit). `free-limit` is the
 * free connection's exhausted daily allowance — also a today-only limit, not a
 * transient failure.
 *
 * A rate limit used to let `generate_deck` keep sending its remaining pages and
 * its retry round, spending the user's quota on requests that could only fail.
 */

export const GENERATION_STOP_KINDS: readonly string[] = [
  'rate-limit',
  'signed-out',
  'not-installed',
  'needs-update',
  'metered-not-accepted',
  'unsafe-tools',
  'not-connected',
  'credits',
  'headless-limit',
  'free-limit',
]

export function isGenerationStopKind(kind: unknown): kind is string {
  return typeof kind === 'string' && GENERATION_STOP_KINDS.includes(kind)
}
