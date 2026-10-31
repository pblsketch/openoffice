import type { AgentActionView, AgentEventView } from '../../../shared/agent-api'

/** One line of the agent window's log */
export type AgentLogEntry =
  /** `skills`: the titles of the skills the message called (its chips) */
  | { kind: 'you'; text: string; skills?: string[] | undefined }
  | { kind: 'agent'; text: string }
  | { kind: 'tool'; action: AgentActionView; status: 'running' | 'done' | 'failed' | 'denied' }
  | { kind: 'started'; skills: number }
  | { kind: 'turn-failed' }
  | { kind: 'error'; errorKind?: string | undefined }
  | { kind: 'ended' }
  /** skills were changed while the session runs: they apply to the next one (spec 9.4) */
  | { kind: 'skills-changed' }
  /** documents opened after the session started are outside its program-level protection */
  | { kind: 'documents-unprotected'; count: number }
  /** a skill card or an install proposal a session asked for, by its key */
  | { kind: 'skill-card'; key: string }
  | { kind: 'skill-install'; key: string }

export interface AgentLogState {
  entries: AgentLogEntry[]
  /** permission requests waiting for an answer, oldest first */
  pending: Array<{ id: string; action: AgentActionView }>
  /** the agent is working on a message */
  busy: boolean
  ended: boolean
}

export const EMPTY_AGENT_LOG: AgentLogState = {
  entries: [],
  pending: [],
  busy: false,
  ended: false,
}

function sameAction(a: AgentActionView, b: AgentActionView): boolean {
  return (
    a.tool === b.tool &&
    a.kind === b.kind &&
    (a.command ?? '') === (b.command ?? '') &&
    a.paths.join('\n') === b.paths.join('\n')
  )
}

/** The log after one event: a finished tool replaces its running line, an answered request leaves */
export function agentLogWith(state: AgentLogState, event: AgentEventView): AgentLogState {
  switch (event.type) {
    case 'started':
      return { ...state, entries: [...state.entries, { kind: 'started', skills: event.skills }] }
    case 'text':
      return { ...state, entries: [...state.entries, { kind: 'agent', text: event.text }] }
    case 'tool': {
      if (event.status !== 'running') {
        for (let i = state.entries.length - 1; i >= 0; i--) {
          const entry = state.entries[i]!
          if (
            entry.kind === 'tool' &&
            entry.status === 'running' &&
            sameAction(entry.action, event.action)
          ) {
            const entries = [...state.entries]
            // Codex names a search's words only when the search is done
            const action =
              event.action.target && !entry.action.target
                ? { ...entry.action, target: event.action.target }
                : entry.action
            entries[i] = { ...entry, action, status: event.status }
            return { ...state, entries }
          }
        }
      }
      return {
        ...state,
        entries: [...state.entries, { kind: 'tool', action: event.action, status: event.status }],
      }
    }
    case 'permission':
      return { ...state, pending: [...state.pending, { id: event.id, action: event.action }] }
    case 'turn-done':
      return {
        ...state,
        busy: false,
        pending: [],
        entries: event.ok ? state.entries : [...state.entries, { kind: 'turn-failed' }],
      }
    case 'error':
      return { ...state, entries: [...state.entries, { kind: 'error', errorKind: event.kind }] }
    case 'documents-unprotected':
      return {
        ...state,
        entries: [...state.entries, { kind: 'documents-unprotected', count: event.count }],
      }
    case 'ended':
      return {
        ...state,
        busy: false,
        ended: true,
        pending: [],
        entries: [...state.entries, { kind: 'ended' }],
      }
  }
}

export function agentLogAfterSend(
  state: AgentLogState,
  text: string,
  skills: readonly string[] = [],
): AgentLogState {
  const entry: AgentLogEntry =
    skills.length > 0 ? { kind: 'you', text, skills: [...skills] } : { kind: 'you', text }
  return { ...state, busy: true, entries: [...state.entries, entry] }
}

/** The "next session" line, once per session; none after the session ended */
export function agentLogAfterSkillsChanged(state: AgentLogState): AgentLogState {
  if (state.ended || state.entries.some((entry) => entry.kind === 'skills-changed')) return state
  return { ...state, entries: [...state.entries, { kind: 'skills-changed' }] }
}

export function agentLogAfterAnswer(state: AgentLogState, id: string): AgentLogState {
  return { ...state, pending: state.pending.filter((request) => request.id !== id) }
}

/**
 * The other waiting requests that allowing `id` for the session also covers:
 * every web search, or page reads of the same site
 */
export function coveredBySessionAllow(state: AgentLogState, id: string): string[] {
  const asked = state.pending.find((request) => request.id === id)?.action
  if (!asked) return []
  return state.pending
    .filter(({ id: other, action }) => {
      if (other === id) return false
      if (asked.kind === 'web-search') return action.kind === 'web-search'
      return (
        asked.kind === 'web-fetch' &&
        !!asked.host &&
        action.kind === 'web-fetch' &&
        action.host === asked.host
      )
    })
    .map((request) => request.id)
}

/** The file a tool line can open: the first path it names */
export function openablePath(action: AgentActionView): string | undefined {
  return action.kind === 'write' || action.kind === 'read' ? action.paths[0] : undefined
}

/** A skill card or an install proposal joins the log where the session asked for it */
export function agentLogWithSkillItem(
  state: AgentLogState,
  item: { kind: 'skill-card' | 'skill-install'; key: string },
): AgentLogState {
  if (state.entries.some((entry) => 'key' in entry && entry.key === item.key)) return state
  return { ...state, entries: [...state.entries, { kind: item.kind, key: item.key }] }
}
