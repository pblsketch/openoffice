/**
 * What every editor main promises the shell about crash recovery. Each editor
 * implements one `RecoveryEditorContract` and registers it at startup; the
 * shell looks editors up by kind when it restores tabs, answers the launch
 * list, or the OS is shutting down.
 *
 * The registry sits behind a `Symbol.for(...)` key so the shell and the
 * editors (each with its own bundled copy of this package) share one table.
 */
import type { WebContents } from 'electron'
import type { RecoveryEditorKind, RecoveryIdentity } from './recovery-store'

/** open a file tab whose recovery question is already answered */
export interface RecoveryOpenFileRequest {
  filePath: string
  /**
   * - `restore`: load the copy's bytes. The original path stays the tab's
   *   path: it is the save target and the base every save-time correction
   *   reads (Word's original archive, HWP section tails, mindmap byte
   *   preservation). The tab opens with unsaved changes.
   * - `original`: load the file as saved, without asking.
   */
  decision: 'restore' | 'original'
}

/** open a copy as an untitled tab */
export interface RecoveryOpenUntitledRequest {
  /**
   * The copy to load: an untitled copy, or a file copy whose original is
   * missing (restored as untitled, see `saveAsDefaultPath`).
   */
  copy: RecoveryIdentity
  /** tab title to show */
  title: string
  /**
   * First Save As suggestion (folder and name). Set to the original path when
   * the original file could not be found; the first save is a new-file save.
   */
  saveAsDefaultPath?: string
}

export interface RecoveryEditorContract {
  readonly kind: RecoveryEditorKind
  /**
   * The OS is ending the session: write a copy for every document with
   * unsaved changes right now, without any prompt. Resolves when done or
   * given up; never throws. Unprotectable documents are skipped.
   */
  writeCopiesNow(): Promise<void>
  /** load `request.filePath` into `contents` (a tab the shell created) */
  openFileWithDecision(
    contents: WebContents,
    request: RecoveryOpenFileRequest,
  ): void | Promise<void>
  /**
   * Load a copy into `contents` as an untitled tab. The first save asks where
   * to save (as for any new document); a successful save deletes the copy.
   */
  openUntitledCopy(
    contents: WebContents,
    request: RecoveryOpenUntitledRequest,
  ): void | Promise<void>
  /**
   * Whether the document in this tab cannot get a safe copy (password Excel,
   * HWP or PDF). Such a document has no copy; the editor shows the notice
   * (`unprotectableNoticeText`) once when the tab first opens.
   */
  isUnprotectable(contents: WebContents): boolean
}

const REGISTRY = Symbol.for('genoffice.recovery-editors')

function registry(): Map<RecoveryEditorKind, RecoveryEditorContract> {
  const holder = globalThis as unknown as Record<
    symbol,
    Map<RecoveryEditorKind, RecoveryEditorContract> | undefined
  >
  let table = holder[REGISTRY]
  if (!table) {
    table = new Map()
    holder[REGISTRY] = table
  }
  return table
}

/**
 * Register an editor's contract (a later registration of the same kind
 * replaces the earlier one). The returned function unregisters it, unless a
 * newer registration has replaced it meanwhile.
 */
export function registerRecoveryEditor(contract: RecoveryEditorContract): () => void {
  registry().set(contract.kind, contract)
  return () => {
    if (registry().get(contract.kind) === contract) registry().delete(contract.kind)
  }
}

export function recoveryEditor(kind: RecoveryEditorKind): RecoveryEditorContract | null {
  return registry().get(kind) ?? null
}

export function recoveryEditors(): RecoveryEditorContract[] {
  return [...registry().values()]
}
