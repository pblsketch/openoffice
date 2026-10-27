/**
 * What a co-editing session (decision 0073) switches off in the Word editor.
 *
 * Only the body is shared live. What a docx keeps beside it (comments, notes,
 * headers and footers, sections, styles, list definitions, the theme, ...)
 * belongs to the host, who is the one who saves: a guest cannot change it,
 * and what the host changes there reaches guests with its next save. Anything
 * that replaces the whole document (another file, a format change, an AI
 * rollback) would wipe what the others just typed.
 *
 * Module state like the ODT gate, so file actions, the AI executor and React
 * components all read the same answer; components subscribe with
 * `useCollabGate`.
 */
import { useSyncExternalStore } from 'react'
import { collabText, type CollabRole, type CollabStringKey } from '@genoffice/collab'
import { showToast } from './components/toast-bus'
import { getLang } from './i18n/locale'

export type CollabOffFeature =
  | 'comment'
  | 'note'
  | 'headerFooter'
  | 'pageSetup'
  | 'style'
  | 'listDefinition'
  | 'watermark'
  | 'ink'
  | 'theme'
  | 'protection'
  | 'toc'
  | 'citation'
  | 'compare'
  /** AI runs and MCP edits */
  | 'ai'
  | 'aiRollback'
  /** open, new, Save As to the other format */
  | 'replaceDocument'

export interface CollabGateState {
  role: CollabRole
  /** host: somebody else is in the session */
  othersIn: boolean
}

let state: CollabGateState | null = null
let version = 0
const listeners = new Set<() => void>()

export function setCollabGate(next: CollabGateState | null): void {
  if (
    state === next ||
    (state && next && state.role === next.role && state.othersIn === next.othersIn)
  )
    return
  state = next
  version++
  for (const fn of listeners) fn()
}

export function collabRole(): CollabRole | null {
  return state?.role ?? null
}

/** this tab is a guest in a live session: it never saves */
export function isCollabGuest(): boolean {
  return state?.role === 'guest'
}

/** why `feature` is off right now, or null when it may run */
export function collabOff(feature: CollabOffFeature): CollabStringKey | null {
  if (!state) return null
  if (state.role === 'guest') return 'guestBlocked'
  // the host's own document stays the shared one for the whole session
  if (feature === 'replaceDocument') return state.othersIn ? 'hostBlocked' : 'guestBlocked'
  if (feature === 'aiRollback' && state.othersIn) return 'hostBlocked'
  return null
}

let lastNotice = { text: '', at: 0 }

/** toast `key`, but not the same text twice within a moment (key repeat, drags, update loops) */
export function notifyCollab(key: CollabStringKey): void {
  const text = collabText(getLang(), key)
  const now = Date.now()
  if (lastNotice.text === text && now - lastNotice.at < 1500) return
  lastNotice = { text, at: now }
  showToast(text, 'error')
}

/** the guard for an action entry point: true (and the user told why) when the session refuses it */
export function refuseInCollab(feature: CollabOffFeature): boolean {
  const key = collabOff(feature)
  if (!key) return false
  notifyCollab(key)
  return true
}

/** React: re-render when a session starts, ends or someone joins the host */
export function useCollabGate(): CollabGateState | null {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => version,
  )
  return state
}

type Gate = CollabOffFeature | ((...args: never[]) => CollabOffFeature | null)

/** the ribbon callbacks (and the ruler, which shares `onSection`) that touch what only the host may change */
const RIBBON_GATES: Record<string, Gate> = {
  onOpen: 'replaceDocument',
  onSection: 'pageSetup',
  onPaperSizeAll: 'pageSetup',
  onMirrorMargins: 'pageSetup',
  onInsertSectionBreak: 'pageSetup',
  onPageColor: 'pageSetup',
  onWatermark: 'watermark',
  onThemeFonts: 'theme',
  onThemeColors: 'theme',
  onInkTool: (tool: string) => (tool === 'select' ? null : 'ink'),
  onInkClearAll: 'ink',
  onInsertNote: 'note',
  onAddSource: 'citation',
  onHeader: 'headerFooter',
  onFooter: 'headerFooter',
  onPageNumFormat: 'headerFooter',
  onHfAction: 'headerFooter',
  onHfEdit: 'headerFooter',
  onProtectDoc: 'protection',
}

/** the same callbacks with the session's refusals in front (a refused call returns null) */
export function collabGuardActions<T extends Record<string, (...args: never[]) => unknown>>(
  actions: T,
): T {
  const out: Record<string, (...args: never[]) => unknown> = { ...actions }
  for (const [name, gate] of Object.entries(RIBBON_GATES)) {
    const action = actions[name]
    if (!action) continue
    out[name] = (...args: never[]) => {
      const feature = typeof gate === 'function' ? gate(...args) : gate
      if (feature && refuseInCollab(feature)) return null
      return action(...args)
    }
  }
  return out as T
}
