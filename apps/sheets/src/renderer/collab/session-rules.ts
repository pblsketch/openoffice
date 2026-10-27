/**
 * What a shared workbook allows (LAN co-editing, decision 0073). The op
 * stream carries cell values and formats, row and column structure, sheets,
 * filters, rules, names and notes; everything else lives beside it (visuals,
 * tables, pivots, sparklines, links, comments, protection, page setup, the
 * theme, outlines, AI runs) and would leave the others with a different
 * workbook than the host saves.
 */
import { COPY_SHEET_COMMAND } from '../app-constants'

export type SessionRole = 'host' | 'guest'

/** ribbon, menu and context-menu commands whose result the op stream does not carry */
const UNSHARED_COMMANDS = new Set([
  'link-open',
  'link-remove',
  'clear-hyperlinks',
  'pivot-open',
  'pivot-edit',
  'refresh-all',
  'slicer-open',
  'timeline-open',
  'subtotal-open',
  'header-footer-open',
  'allow-edit-ranges-open',
  'sheet-protect',
  'sheet-unprotect',
  'workbook-protect',
  'insert-picture',
  'insert-textbox',
  'insert-screenshot',
  'insert-icons',
  'insert-equation',
  'recommended-charts-open',
  'sparkline',
  'comment-new',
  'comment-reply',
  'comment-delete',
  'comment-resolve',
  'clear-comments',
  'notes-convert',
  'toggle-headings',
  'toggle-show-formulas',
  'merge-workbooks',
  'import-csv',
])
const UNSHARED_PREFIXES = [
  'link-set:',
  'table-',
  'format-as-table',
  'insert-chart:',
  'insert-pivot-chart:',
  'insert-shape:',
  'chart-',
  'shape-',
  'visual:',
  'page-layout:',
  'page-row:',
  'page-col:',
  'outline-',
]

/** AI runs write through every path at once, carried or not */
export const AI_RUN = 'ai:run'
/** opening another workbook in this tab replaces the shared one */
export const OPEN_WORKBOOK = 'open'

export function isUnsharedCommand(command: string): boolean {
  return (
    command === AI_RUN ||
    UNSHARED_COMMANDS.has(command) ||
    UNSHARED_PREFIXES.some((prefix) => command.startsWith(prefix))
  )
}

/** Univer commands refused during a session (a copied sheet journals as a blank one on the others) */
export function isUnsharedUniverCommand(id: string): boolean {
  return id === COPY_SHEET_COMMAND
}

export type SessionVerdict =
  | { readonly refuse: 'guestBlocked' | 'hostBlocked' }
  /** the host is alone: go ahead, then start the others from the host's bytes */
  | { readonly rebase: true }
  | null

/**
 * A guest never runs what the others cannot see. The host does not while
 * someone is in; alone, it may, and a later guest starts from its bytes.
 */
export function commandVerdict(
  command: string,
  role: SessionRole | null,
  othersIn: boolean,
): SessionVerdict {
  if (role === null) return null
  if (command === OPEN_WORKBOOK) {
    return { refuse: role === 'guest' ? 'guestBlocked' : 'hostBlocked' }
  }
  if (!isUnsharedCommand(command)) return null
  if (role === 'guest') return { refuse: 'guestBlocked' }
  return othersIn ? { refuse: 'hostBlocked' } : { rebase: true }
}

export type SaveMode = 'save' | 'save-as' | 'recovery' | 'template'

/**
 * A guest's copy is the host's document: it never saves or writes a recovery
 * copy (a template copy writes nothing for the person). The host keeps saving
 * by hand, but not automatically while others are in: every save reopens the
 * workbook, and everyone else would reload with it.
 */
export function saveVerdict(
  mode: SaveMode,
  quiet: boolean,
  role: SessionRole | null,
  othersIn: boolean,
): 'run' | 'skip' | 'refuse' {
  if (role === 'guest') {
    if (mode === 'template') return 'run'
    return mode === 'recovery' || quiet ? 'skip' : 'refuse'
  }
  if (role === 'host' && othersIn && quiet && mode === 'save') return 'skip'
  return 'run'
}

/**
 * The count the close guard sees. A live guest has nothing of its own to
 * save; once its session ended the copy is the person's unsaved document,
 * whether or not anything changed in it.
 */
export function pendingForClose(count: number, guest: 'live' | 'ended' | null): number {
  if (guest === 'live') return 0
  if (guest === 'ended') return Math.max(count, 1)
  return count
}
