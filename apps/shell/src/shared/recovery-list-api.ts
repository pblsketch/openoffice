// Contract between the Home screen's launch recovery list (RecoveryList.tsx)
// and the shell main process. The list only shows what the main process hands
// it and returns the user's choices; it never reads, opens or deletes a copy
// itself. The main process applies the result to the recovery store.

/** The editors that keep recovery copies (mirrors RECOVERY_EDITOR_KINDS in electron-utils). */
export const RECOVERY_LIST_EDITOR_KINDS = [
  'docs',
  'sheets',
  'slides',
  'pdf',
  'markdown',
  'html',
  'mindmap',
  'hwp',
] as const

export type RecoveryListEditorKind = (typeof RECOVERY_LIST_EDITOR_KINDS)[number]

/** One document with unsaved content left, as the list shows it. */
export interface RecoveryListItem {
  /** opaque key chosen by the main process; the result's decisions are keyed by it */
  id: string
  editorKind: RecoveryListEditorKind
  /** file name, or the tab title of an untitled document */
  name: string
  /** folder the file was in; null for an untitled document */
  folder: string | null
  /** when the copy was last written (ms since the epoch) */
  lastCopyTime: number
  /** the document was never saved, so there is no file */
  untitled: boolean
  /** the file was modified after the copy was written (the choice starts at discard) */
  fileChangedAfterCopy: boolean
  /** the file is gone; restoring opens the copy as a new untitled document */
  originalMissing: boolean
}

export type RecoveryChoice = 'restore' | 'discard'

/**
 * What the list hands back: a choice for every row it showed, or `dismissed`
 * when it was closed without choosing (every row counts as "later": nothing is
 * deleted and the copies are asked about again).
 */
export type RecoveryListResult = { decisions: Record<string, RecoveryChoice> } | { dismissed: true }

/** The choice a row starts with: restore, except when the file changed after the copy. */
export function defaultRecoveryChoice(item: RecoveryListItem): RecoveryChoice {
  return item.fileChangedAfterCopy ? 'discard' : 'restore'
}

/** Shell-internal channels for the launch recovery list. */
export const RECOVERY_LIST_CHANNELS = {
  /** invoke: returns RecoveryListItem[] | null */
  get: 'recovery:get-launch-list',
  /** invoke: (result: RecoveryListResult) → void */
  submit: 'recovery:submit-launch-list',
} as const

/** The Home screen's window.aiOfficeRecovery (absent until the preload exposes it). */
export interface RecoveryListApi {
  /**
   * The rows to ask about at launch; null or an empty array when there is
   * nothing to ask. It keeps answering with the same rows until a result is
   * submitted, so a reloaded Home shows the list again.
   */
  getLaunchRecoveryList(): Promise<RecoveryListItem[] | null>
  /** Apply the user's choices (or the dismissal); the tabs load after this. */
  submitLaunchRecovery(result: RecoveryListResult): Promise<void>
}
