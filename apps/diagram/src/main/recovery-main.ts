/**
 * Crash-recovery copies of diagrams, on the main-process side (spec "work is
 * not lost", 1, 2, 5.4, 7).
 *
 * The renderer makes a copy's bytes (what a save would write now) and hands
 * them over; they go through the shared recovery store into
 * `<userData>/diagram-autosave`. The user's file and folders are never
 * written here: a diagram with a file keeps one copy under the hash of its path,
 * an untitled diagram one copy under an id of its own (`untitled/<id>.drawio`).
 *
 * Each view remembers which copies are its own: the ones it wrote and the one
 * it was restored from. Those, and only those, go when its diagram is saved
 * ('saved'), dropped with "Don't Save" ('dontSave') or closed without unsaved
 * changes ('closedClean'). A view whose renderer crashed, or one closed while
 * the app is ending, deletes nothing (the store refuses during shutdown).
 *
 * After "Don't Save" the view takes no copy while its tab closes, and the
 * closing tab takes any copy that landed meanwhile. After a short hold the
 * renderer is asked for a copy again; the shared store turns it away until
 * the window's close is cancelled (a later tab's Cancel), so a tab left
 * waiting for another tab's prompt writes nothing back, and one that stays
 * open copies again.
 */
import { readFileSync } from 'node:fs'
import { app, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import {
  createRecoveryStore,
  isHeadlessMode,
  isRecoveryEditorKind,
  isUntitledIdentity,
  newUntitledRecoveryId,
  resolveRecoveryOnOpen,
} from '@genoffice/electron-utils'
import type {
  RecoveryDeleteReason,
  RecoveryEditorKind,
  RecoveryIdentity,
  RecoveryOpenUntitledRequest,
  RecoveryStore,
  RecoveryWriteResult,
} from '@genoffice/electron-utils'
import { getUiLang } from '@genoffice/i18n'

// The shared store keeps copies only for the kinds it lists (RECOVERY_EDITOR_KINDS);
// the shell wiring adds 'diagram' there, until then a copy is refused, not misfiled.
const KIND = 'diagram' as unknown as RecoveryEditorKind
const UNTITLED_EXTENSION = '.drawio'

/** Whether the shared store keeps copies for this editor yet (see KIND). */
export function recoveryAvailable(): boolean {
  return isRecoveryEditorKind(KIND)
}
/**
 * After "Don't Save" the tab normally closes at once. After this long the
 * renderer is asked for a copy again, which the store takes once the window's
 * close is cancelled (see resumeDiscardedCopies).
 */
export const DONT_SAVE_HOLD_MS = 5_000

let store: RecoveryStore | null = null

/** The shared store over this app's data folder. */
export function diagramRecoveryStore(): RecoveryStore {
  store ??= createRecoveryStore({ userDataDir: () => app.getPath('userData') })
  return store
}

interface ViewRecovery {
  /**
   * The copy an untitled view writes: its own untitled id's, made at its first
   * copy, or the copy it was restored from (an untitled copy, or the copy of a
   * file that is gone), so a restored diagram keeps one copy.
   */
  untitledCopy?: RecoveryIdentity
  /** this view's copies, by copy path */
  owned: Map<string, RecoveryIdentity>
  /** the first Save As suggestion of a restored diagram whose file is gone */
  saveAsDefault?: string
  /** the tab title a restored untitled copy came with */
  title?: string
  /** what the shell already decided for the file this view opens next */
  decision?: 'restore' | 'original'
  /** the renderer crashed: its copies outlive the view */
  crashed?: boolean
  /** "Don't Save" dropped the copies: none is taken until this hold ends */
  dropped?: ReturnType<typeof setTimeout>
  /** the copy left for the file could not be settled: no copy may replace it */
  blocked?: boolean
}

const views = new Map<number, ViewRecovery>()

function stateOf(wcId: number): ViewRecovery {
  let state = views.get(wcId)
  if (!state) {
    state = { owned: new Map() }
    views.set(wcId, state)
  }
  return state
}

export function fileRecoveryIdentity(filePath: string): RecoveryIdentity {
  return { kind: KIND, filePath }
}

/** The copy a view writes now: its file's, or (untitled) its own id's, made on first use. */
export function viewRecoveryIdentity(wcId: number, savePath: string | undefined): RecoveryIdentity {
  if (savePath) return fileRecoveryIdentity(savePath)
  const state = stateOf(wcId)
  state.untitledCopy ??= {
    kind: KIND,
    untitledId: newUntitledRecoveryId(),
    ext: UNTITLED_EXTENSION,
  }
  return state.untitledCopy
}

/** An untitled view keeps writing to the copy it was restored from. */
function adoptUntitledCopy(wcId: number, identity: RecoveryIdentity): void {
  stateOf(wcId).untitledCopy = identity
  own(wcId, identity)
}

function own(wcId: number, identity: RecoveryIdentity): void {
  stateOf(wcId).owned.set(diagramRecoveryStore().copyPath(identity), identity)
}

/** Whether another live view holds this copy (the same diagram open in two panes). */
function ownedElsewhere(wcId: number, identity: RecoveryIdentity): boolean {
  const key = diagramRecoveryStore().copyPath(identity)
  for (const [other, state] of views) {
    if (other !== wcId && !state.crashed && state.owned.has(key)) return true
  }
  return false
}

/**
 * Keep `bytes` as the view's copy. The copy counts as the view's own before
 * it is written, so a save arriving meanwhile cancels the write instead of
 * being outlived by it. 'superseded' while "Don't Save" holds, or when the
 * copy left for the file could not be settled. Rejects on a disk error (the
 * renderer backs off).
 */
export function writeViewCopy(
  wcId: number,
  savePath: string | undefined,
  bytes: Uint8Array,
  untitledTitle: () => string,
): Promise<RecoveryWriteResult> {
  const barred = views.get(wcId)
  // a headless export's hidden view converts the file and goes; it keeps no copy
  if (isHeadlessMode() || !recoveryAvailable()) return Promise.resolve('superseded')
  if (barred?.dropped !== undefined || barred?.blocked) return Promise.resolve('superseded')
  const identity = viewRecoveryIdentity(wcId, savePath)
  own(wcId, identity)
  const title = isUntitledIdentity(identity) ? (stateOf(wcId).title ?? untitledTitle()) : undefined
  return diagramRecoveryStore().writeCopy(
    identity,
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    title === undefined ? {} : { title },
  )
}

/**
 * Delete the view's copies. `forget` false keeps them listed as the view's
 * own, so a copy landing at the same place later is still taken along.
 */
function deleteOwned(wcId: number, reason: RecoveryDeleteReason, forget = true): void {
  const state = views.get(wcId)
  if (!state) return
  const recovery = diagramRecoveryStore()
  for (const [key, identity] of state.owned) {
    if (recovery.deleteCopy(identity, reason) === 'deleted' && forget) state.owned.delete(key)
  }
}

/** The view's diagram reached the disk: its copies go, and it is no longer untitled. */
export function viewSaved(wcId: number): void {
  deleteOwned(wcId, 'saved')
  const state = views.get(wcId)
  if (!state) return
  state.untitledCopy = undefined
  state.saveAsDefault = undefined
  state.title = undefined
}

/**
 * "Don't Save" (close prompt, or a tool closing the diagram without saving): the
 * copies go, and no new one is taken while the tab closes. When the tab is
 * still there after the hold, `resume` asks its renderer for a fresh copy.
 */
export function viewDropped(wcId: number, resume: () => void): void {
  deleteOwned(wcId, 'dontSave', false)
  const state = stateOf(wcId)
  clearTimeout(state.dropped)
  state.dropped = setTimeout(() => {
    state.dropped = undefined
    // the tab stayed open: its unsaved changes need a copy again
    if (views.get(wcId) === state) resume()
  }, DONT_SAVE_HOLD_MS)
}

export function viewCrashed(wcId: number): void {
  stateOf(wcId).crashed = true
}

/**
 * The view is gone. Closed after "Don't Save", it takes along any copy that
 * landed meanwhile; closed without unsaved changes, it takes its copies with
 * it; with unsaved changes, after a crash or while the app is ending, they stay.
 */
export function viewGone(wcId: number, dirty: boolean): void {
  const state = views.get(wcId)
  if (state?.dropped !== undefined) {
    clearTimeout(state.dropped)
    deleteOwned(wcId, 'dontSave')
  } else if (state && !state.crashed && !dirty) {
    deleteOwned(wcId, 'closedClean')
  }
  views.delete(wcId)
}

/** The identity of the copy the view writes, for the shell's session record and crash reopen; null for no view. */
export function viewRecoveryIdentityIfAny(
  wcId: number,
  savePath: string | undefined,
): RecoveryIdentity | null {
  if (!views.has(wcId) && !savePath) return null
  return viewRecoveryIdentity(wcId, savePath)
}

/** First Save As suggestion of a restored diagram whose file is gone. */
export function viewSaveAsDefault(wcId: number): string | undefined {
  return views.get(wcId)?.saveAsDefault
}

/** The shell decided the recovery question for the file this view opens next. */
export function setViewOpenDecision(wcId: number, decision: 'restore' | 'original'): void {
  stateOf(wcId).decision = decision
}

/**
 * Before a file's content is loaded: the copy's bytes when the diagram is to be
 * restored, null to open the file as saved. The shell's decision is taken as
 * it is; otherwise "restore" chosen in the launch list restores without
 * asking, and an undecided or "later" copy asks first, naming the file (Esc
 * and closing the box restore). A copy another pane is working on is not
 * asked about: that pane holds the work. When the copy cannot be settled (the
 * question or the store failed), the file opens as saved and the view writes
 * no copy over the old one.
 */
export async function resolveViewOpen(
  wcId: number,
  filePath: string,
  parent: BrowserWindow | null,
): Promise<Uint8Array | null> {
  const state = stateOf(wcId)
  const decision = state.decision
  state.decision = undefined
  state.blocked = false
  // a headless export converts the file on disk: no one is there to answer the
  // prompt (whose Esc restores), and a copy it neither uses nor settles stays as it was
  if (isHeadlessMode()) return null
  if (decision === 'original' || !recoveryAvailable()) return null
  const identity = fileRecoveryIdentity(filePath)
  if (ownedElsewhere(wcId, identity)) return null
  try {
    const recovery = diagramRecoveryStore()
    if (decision === 'restore' && recovery.copyInfo(identity)) {
      recovery.setCopyState(identity, 'restoreChosen')
    }
    const result = await resolveRecoveryOnOpen({
      store: recovery,
      identity,
      dialog,
      parent,
      lang: getUiLang(),
    })
    if (result.action !== 'restore') return null
    own(wcId, identity)
    return new Uint8Array(result.bytes)
  } catch (err) {
    // the old copy stays as it is; this view writes none over it
    state.blocked = true
    console.warn('[diagram] could not settle the recovery copy; the file opens as saved:', err)
    return null
  }
}

/**
 * A copy of `filePath` was restored, but the file is gone or no longer opens:
 * the diagram is untitled now, its first Save As offers the old place, and its
 * later copies replace the restored one instead of starting a second.
 */
export function viewRestoredUntitled(wcId: number, filePath: string): void {
  adoptUntitledCopy(wcId, fileRecoveryIdentity(filePath))
  stateOf(wcId).saveAsDefault = filePath
}

/**
 * A copy to open in this (untitled) view: its bytes, read now so they can be
 * queued before the renderer asks. Later copies of the view replace this one
 * (an untitled copy, or the copy of a file that is gone) until the diagram is
 * saved, dropped or closed clean; a gone file's path is offered by the first
 * Save As.
 */
export function takeUntitledCopy(
  wcId: number,
  request: RecoveryOpenUntitledRequest,
): Uint8Array | null {
  const recovery = diagramRecoveryStore()
  let bytes: Buffer
  try {
    bytes = readFileSync(recovery.copyPath(request.copy))
  } catch {
    return null
  }
  recovery.markCopyLoaded(request.copy)
  const state = stateOf(wcId)
  adoptUntitledCopy(wcId, request.copy)
  state.title = request.title
  if (request.saveAsDefaultPath) state.saveAsDefault = request.saveAsDefaultPath
  return new Uint8Array(bytes)
}

/** The view's file was renamed on disk: its copy follows the new path. */
export async function viewFileRenamed(
  wcId: number,
  oldPath: string,
  newPath: string,
): Promise<void> {
  const state = views.get(wcId)
  if (!recoveryAvailable()) return
  const recovery = diagramRecoveryStore()
  const from = fileRecoveryIdentity(oldPath)
  const key = recovery.copyPath(from)
  if (!state?.owned.has(key)) return
  try {
    const bytes = await recovery.readCopy(from)
    if (bytes) {
      const to = fileRecoveryIdentity(newPath)
      own(wcId, to)
      await recovery.writeCopy(to, bytes)
    }
  } catch (err) {
    console.warn('[diagram] the recovery copy could not follow the renamed file:', err)
    return
  }
  // the content now lives under the new path; the old entry would only offer it twice
  if (recovery.deleteCopy(from, 'discarded') === 'deleted') state.owned.delete(key)
}
