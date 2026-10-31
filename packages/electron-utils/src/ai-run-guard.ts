/**
 * One check the shell puts in front of every editor's AI run (decision 0085).
 * The editors' main code asks it once a request's provider is known; the
 * shell answers with a refusal to show, or null to let the run go. Today it
 * refuses a free connection for a tab whose document is a copy of a Google
 * Drive file, since a free tier may train on what it receives. With no check
 * set (an editor running on its own) every run goes.
 */

export interface AiRunGuardInput {
  /** the webContents that sent the request */
  senderId: number
  /** the provider the run would use */
  provider: string
  /** its model, '' when the provider's default */
  model: string
}

export type AiRunGuard = (input: AiRunGuardInput) => string | null

let guard: AiRunGuard | null = null

export function setAiRunGuard(next: AiRunGuard | null): void {
  guard = next
}

/** The refusal for this run, or null when it may go */
export function aiRunRefusal(input: AiRunGuardInput): string | null {
  return guard ? guard(input) : null
}
