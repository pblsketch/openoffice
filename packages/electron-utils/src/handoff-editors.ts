/**
 * The editors that can take a hand-off. Kept apart from generate-handoff.ts,
 * which imports Node modules: sandboxed preloads (user-skills-channels) need
 * the check, and a preload that loads `node:path` fails to load at all.
 */

/** every editor that can take a hand-off; each opens it in a new untitled tab */
export type HandoffEditor =
  'docs' | 'sheets' | 'slides' | 'pdf' | 'markdown' | 'html' | 'mindmap' | 'hwp' | 'epub'

export const HANDOFF_EDITORS: readonly HandoffEditor[] = Object.freeze([
  'docs',
  'sheets',
  'slides',
  'pdf',
  'markdown',
  'html',
  'mindmap',
  'hwp',
  'epub',
])

export function isHandoffEditor(value: unknown): value is HandoffEditor {
  return typeof value === 'string' && (HANDOFF_EDITORS as readonly string[]).includes(value)
}
