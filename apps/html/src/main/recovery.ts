/**
 * Crash-recovery copies for a text editor (Markdown and HTML keep the same
 * file: `apps/markdown/src/main/recovery.ts` and `apps/html/src/main/recovery.ts`;
 * change one, change the other).
 *
 * The document text lives in the renderer. While it has unsaved changes the
 * renderer sends, about every 30 s, the exact text a save would write (the
 * same serialization as its save path); this module keeps it as the
 * document's recovery copy in `<userData>/<kind>-autosave` through the shared
 * store. The user's file is never written here and no file is created
 * outside the app data folder, untitled documents included.
 *
 * - A copy is written only when the text changed since this tab's last copy.
 * - Any successful save (manual, AutoSave, Save As, MCP save) deletes the copy
 *   ('saved'); "Don't Save" and an MCP close without saving delete it
 *   ('dontSave'); a loaded tab that closes with no unsaved changes deletes the
 *   copy it wrote ('closedClean'). A crashed renderer keeps its copy, and the
 *   store refuses the clean-close deletion while the app is shutting down.
 * - Panes showing the same file share its copy: when one deletes it, every
 *   pane on that file forgets its last copy, so one still unsaved writes again.
 * - After "Don't Save" the shared store takes no copy of the document until
 *   the window close is cancelled or the file is opened again, so a tab left
 *   waiting for another tab's prompt writes nothing back.
 * - A save to a given path (MCP) that fails deletes a copy this tab wrote under
 *   that path in the meantime ('dontSave'); the document keeps its own copy.
 * - Opening a file with a copy asks the shared per-file prompt before the
 *   content is loaded (or follows the launch list's decision); a restored copy
 *   opens with the original path as the save target, unsaved. A copy restored
 *   as untitled (its original is missing) names that original so the editor
 *   can keep the file's format, but the document stays untitled.
 * - Password documents do not exist in these editors: every copy is plain
 *   text the user could have saved, so `isUnprotectable` is always false.
 */
import { basename } from 'node:path'
import type { BrowserWindow, WebContents } from 'electron'
import {
  createRecoveryStore,
  isHeadlessMode,
  isUntitledIdentity,
  newUntitledRecoveryId,
  resolveRecoveryOnOpen,
  type RecoveryEditorContract,
  type RecoveryIdentity,
  type RecoveryMessageBox,
  type RecoveryOpenFileRequest,
  type RecoveryOpenUntitledRequest,
  type RecoveryStore,
} from '@genoffice/electron-utils'

/** how long `writeCopiesNow` waits for one renderer to send its copy */
export const RECOVERY_FLUSH_TIMEOUT_MS = 3_000

export interface TextRecoveryHost {
  kind: 'markdown' | 'html'
  /** the format an untitled document's copy is written in ('.md', '.html') */
  untitledExt: string
  userDataDir: () => string
  dialog: RecoveryMessageBox
  parentOf: (contents: WebContents) => BrowserWindow | null
  lang: () => string
  /** the document's save target; undefined while untitled */
  savePath: (wcId: number) => string | undefined
  /** the file the view opens (its pending open); undefined for an untitled view */
  openPath: (wcId: number) => string | undefined
  /** the main process's unsaved-changes flag for the view */
  isDirty: (wcId: number) => boolean
  /** point an existing view at `filePath`: grant it, make it the open path and the save target */
  adoptFile: (contents: WebContents, filePath: string) => void
  /** the restored text replaces the file's: record the disk state the save guard compares with */
  restoredFile?: (wcId: number, filePath: string) => void
  /** last-resort title of an untitled document's copy */
  untitledFallbackTitle: () => string
  /** main → renderer channel: "send your copy now" */
  flushChannel: string
}

/** what a copy write answered */
export type TextRecoveryWriteResult = 'written' | 'superseded' | 'unchanged' | 'skipped'

interface ViewState {
  contents: WebContents
  /** the copy identity while the document has no save path (untitled, or a restored missing original) */
  untitled?: RecoveryIdentity
  /** the text of this tab's last copy; null when there is none to compare with */
  lastText: string | null
  /** this tab wrote (or loaded) the copy of its current identity */
  owns: boolean
  /** the renderer process died: the copy outlives the view */
  crashed: boolean
  /** the renderer already asked how to open (a later decision reloads it) */
  asked: boolean
  /** the per-file prompt is open: no copy is written until it is answered */
  resolving: boolean
  /** the shell's answer for the next open (launch list / restored tab) */
  decision?: RecoveryOpenFileRequest['decision']
  /** an untitled copy to load on the next open */
  untitledSeed?: RecoveryIdentity
  /** the title the shell gave an untitled copy, or the editor's provisional title */
  title?: string
  /** first Save As suggestion of a restored document whose original is missing */
  saveAsDefaultPath?: string
  /** a copy left under the path the file had before a rename; dropped after the next write */
  renamedFrom?: RecoveryIdentity
  /** the identity this tab's last copy was written under */
  writtenAs?: RecoveryIdentity
  flushWaiters: (() => void)[]
}

/** a restored copy's text (see `TextRecovery.resolveOpen`) */
export interface RecoveredText {
  text: string
  originalPath?: string
}

export interface TextRecovery {
  /** start tracking a view (call once, when it is created) */
  track(contents: WebContents): void
  /**
   * The view is being destroyed: delete the copy it wrote when it closes
   * clean, keep it otherwise. Call before the module drops the view's dirty flag.
   */
  forget(wcId: number): void
  /** the renderer's copy (null: nothing to write, only answers a flush request) */
  writeCopy(contents: WebContents, text: string | null): Promise<TextRecoveryWriteResult>
  /** the identity the view's copy has before a save; pass it to `saved` afterwards */
  identityOf(wcId: number): RecoveryIdentity | null
  /** a save succeeded: delete the copy of the identity the document had when the save began */
  saved(wcId: number, before: RecoveryIdentity | null): void
  /** "Don't Save" / MCP close without saving */
  dontSave(wcId: number): void
  /** the file was renamed on disk while open */
  renamed(wcId: number, oldPath: string): void
  /** a save to `filePath` given from outside (MCP) failed and the old target is back */
  saveToPathFailed(wcId: number, filePath: string): void
  /**
   * The renderer's open question: the text to load instead of the file, or
   * null. `originalPath` names the file an untitled restored copy came from
   * (its original is missing): it tells the editor the format, not the save target.
   */
  resolveOpen(contents: WebContents): Promise<RecoveredText | null>
  /** the default Save As path for an untitled view, when recovery has one */
  saveAsDefaultPath(wcId: number): string | undefined
  /** remember an untitled document's own title (the editor's provisional name) */
  setTitle(wcId: number, title: string): void
  /** where the title of an untitled copy comes from first (the shell's tab title) */
  setTitleSource(source: ((contents: WebContents) => string | undefined) | null): void
  readonly contract: RecoveryEditorContract
}

export function createTextRecovery(host: TextRecoveryHost): TextRecovery {
  const views = new Map<number, ViewState>()
  let store: RecoveryStore | null = null
  let titleSource: ((contents: WebContents) => string | undefined) | null = null

  const getStore = (): RecoveryStore => {
    store ??= createRecoveryStore({ userDataDir: host.userDataDir })
    return store
  }

  /** recovery never breaks the editor: a store failure is logged and ignored */
  const quietly = (what: string, task: () => void): void => {
    try {
      task()
    } catch (error) {
      console.warn(`[${host.kind}] recovery ${what} failed:`, error)
    }
  }

  const stateOf = (contents: WebContents): ViewState => {
    let state = views.get(contents.id)
    if (!state) {
      state = {
        contents,
        lastText: null,
        owns: false,
        crashed: false,
        asked: false,
        resolving: false,
        flushWaiters: [],
      }
      views.set(contents.id, state)
    }
    return state
  }

  const identityFor = (wcId: number, state: ViewState): RecoveryIdentity => {
    const filePath = host.savePath(wcId)
    if (filePath) return { kind: host.kind, filePath }
    state.untitled ??= {
      kind: host.kind,
      untitledId: newUntitledRecoveryId(),
      ext: host.untitledExt,
    }
    return state.untitled
  }

  const copyTitle = (state: ViewState, identity: RecoveryIdentity): string => {
    if (!isUntitledIdentity(identity)) return basename(identity.filePath)
    let fromShell: string | undefined
    try {
      fromShell = titleSource?.(state.contents)
    } catch {
      fromShell = undefined
    }
    return fromShell || state.title || host.untitledFallbackTitle()
  }

  const settleFlush = (state: ViewState): void => {
    for (const resolve of state.flushWaiters.splice(0)) resolve()
  }

  /** the renderer process is gone or reloads: it will ask again (or never) */
  const reloadIfAsked = (state: ViewState): void => {
    if (!state.asked || state.contents.isDestroyed()) return
    state.asked = false
    state.contents.reload()
  }

  const sameIdentity = (a: RecoveryIdentity, b: RecoveryIdentity): boolean =>
    isUntitledIdentity(a)
      ? isUntitledIdentity(b) && a.kind === b.kind && a.untitledId === b.untitledId
      : !isUntitledIdentity(b) && a.kind === b.kind && a.filePath === b.filePath

  /** the copy `identity` is (or was) this view's: its save or open path, or what it last wrote */
  const showsCopy = (wcId: number, state: ViewState, identity: RecoveryIdentity): boolean => {
    if (state.writtenAs && sameIdentity(state.writtenAs, identity)) return true
    if (state.untitled && sameIdentity(state.untitled, identity)) return true
    if (isUntitledIdentity(identity)) return false
    return host.savePath(wcId) === identity.filePath || host.openPath(wcId) === identity.filePath
  }

  const deleteFor = (
    state: ViewState,
    identity: RecoveryIdentity,
    reason: 'saved' | 'dontSave' | 'closedClean',
  ): void => {
    quietly('delete', () => {
      getStore().deleteCopy(identity, reason)
    })
    state.lastText = null
    state.owns = false
    state.writtenAs = undefined
    // panes on the same file share the copy: one still unsaved must write it again
    let shared = false
    for (const [id, other] of views) {
      if (other === state || !showsCopy(id, other, identity)) continue
      other.lastText = null
      other.owns = false
      other.writtenAs = undefined
      shared = true
    }
    // "Don't Save" blocks the copy until the close is cancelled; another pane's
    // edits were not thrown away, so its copies go on
    if (reason === 'dontSave' && shared) {
      quietly('resume', () => getStore().clearDiscarded(identity))
    }
  }

  async function readText(identity: RecoveryIdentity): Promise<string | null> {
    try {
      const bytes = await getStore().readCopy(identity)
      return bytes ? bytes.toString('utf8') : null
    } catch {
      return null
    }
  }

  /** another live view shows the same file and already settled its copy question */
  const siblingOwnsPath = (wcId: number, filePath: string): boolean => {
    for (const [id, other] of views) {
      if (id === wcId || other.contents.isDestroyed() || other.resolving) continue
      if (host.savePath(id) === filePath || host.openPath(id) === filePath) return true
    }
    return false
  }

  const recovery: TextRecovery = {
    track(contents) {
      const state = stateOf(contents)
      contents.once('render-process-gone', () => {
        state.crashed = true
        settleFlush(state)
      })
    },

    forget(wcId) {
      const state = views.get(wcId)
      if (!state) return
      views.delete(wcId)
      settleFlush(state)
      if (state.crashed || host.isDirty(wcId) || !state.owns) return
      deleteFor(state, identityFor(wcId, state), 'closedClean')
    },

    async writeCopy(contents, text) {
      const state = views.get(contents.id)
      if (!state) return 'skipped'
      try {
        if (text === null || state.resolving || state.crashed) return 'skipped'
        if (!host.isDirty(contents.id)) return 'skipped'
        if (text === state.lastText) return 'unchanged'
        const identity = identityFor(contents.id, state)
        // the write ticket is taken here, on arrival: a save or "Don't Save"
        // handled after this message supersedes the write
        const result = await getStore().writeCopy(identity, Buffer.from(text, 'utf8'), {
          title: copyTitle(state, identity),
        })
        if (result === 'written') {
          state.lastText = text
          state.owns = true
          state.writtenAs = identity
          const old = state.renamedFrom
          state.renamedFrom = undefined
          // the copy under the pre-rename path is replaced by this one
          if (old) quietly('delete', () => getStore().deleteCopy(old, 'closedClean'))
        }
        return result
      } finally {
        settleFlush(state)
      }
    },

    identityOf(wcId) {
      const state = views.get(wcId)
      return state ? identityFor(wcId, state) : null
    },

    saved(wcId, before) {
      const state = views.get(wcId)
      if (!state) return
      if (before) deleteFor(state, before, 'saved')
      else {
        state.lastText = null
        state.owns = false
      }
      // the document has a path now; a restored missing original is saved
      if (host.savePath(wcId)) {
        state.untitled = undefined
        state.saveAsDefaultPath = undefined
      }
    },

    dontSave(wcId) {
      const state = views.get(wcId)
      if (!state) return
      deleteFor(state, identityFor(wcId, state), 'dontSave')
    },

    saveToPathFailed(wcId, filePath) {
      const state = views.get(wcId)
      if (!state) return
      const target: RecoveryIdentity = { kind: host.kind, filePath }
      // the failed save pointed at the document's own path: that copy is its own
      if (sameIdentity(identityFor(wcId, state), target)) return
      if (!state.writtenAs || !sameIdentity(state.writtenAs, target)) return
      deleteFor(state, target, 'dontSave')
      // a cleanup, not the user's "Don't Save": that path takes copies as usual
      quietly('resume', () => getStore().clearDiscarded(target))
    },

    renamed(wcId, oldPath) {
      const state = views.get(wcId)
      if (!state || !state.owns) return
      // the next copy lands under the new path; the old one goes once it has
      state.renamedFrom = { kind: host.kind, filePath: oldPath }
      state.lastText = null
      state.owns = false
      if (!state.contents.isDestroyed()) state.contents.send(host.flushChannel)
    },

    async resolveOpen(contents) {
      const state = stateOf(contents)
      state.asked = true
      // a hidden export window never asks and never restores
      if (isHeadlessMode()) return null
      const seed = state.untitledSeed
      if (seed) {
        state.untitledSeed = undefined
        const text = await readText(seed)
        if (text === null) return null
        quietly('mark loaded', () => getStore().markCopyLoaded(seed))
        state.owns = true
        // the file this copy was of: the old path of a missing original, or
        // the original an untitled copy names; the document stays untitled
        const originalPath =
          state.saveAsDefaultPath ?? (isUntitledIdentity(seed) ? undefined : seed.filePath)
        return originalPath ? { text, originalPath } : { text }
      }
      const filePath = host.openPath(contents.id)
      if (!filePath) return null
      const identity: RecoveryIdentity = { kind: host.kind, filePath }
      const decision = state.decision
      state.decision = undefined
      if (decision === 'original') return null
      if (decision === 'restore') {
        const text = await readText(identity)
        if (text === null) return null
        quietly('mark loaded', () => getStore().markCopyLoaded(identity))
        state.owns = true
        host.restoredFile?.(contents.id, filePath)
        return { text }
      }
      if (siblingOwnsPath(contents.id, filePath)) return null
      state.resolving = true
      try {
        const result = await resolveRecoveryOnOpen({
          store: getStore(),
          identity,
          dialog: host.dialog,
          parent: host.parentOf(contents),
          lang: host.lang(),
        })
        if (result.action !== 'restore') return null
        state.owns = true
        host.restoredFile?.(contents.id, filePath)
        return { text: result.bytes.toString('utf8') }
      } catch (error) {
        console.warn(`[${host.kind}] recovery open failed:`, error)
        return null
      } finally {
        state.resolving = false
      }
    },

    saveAsDefaultPath(wcId) {
      const state = views.get(wcId)
      if (!state) return undefined
      if (state.saveAsDefaultPath) return state.saveAsDefaultPath
      // a copy of a missing original reopened without a suggestion: its old path
      return state.untitled && !isUntitledIdentity(state.untitled)
        ? state.untitled.filePath
        : undefined
    },

    setTitle(wcId, title) {
      const state = views.get(wcId)
      if (state) state.title = title
    },

    setTitleSource(source) {
      titleSource = source
    },

    contract: {
      kind: host.kind,
      async writeCopiesNow() {
        const waits: Promise<void>[] = []
        for (const [wcId, state] of views) {
          if (state.crashed || state.contents.isDestroyed() || !host.isDirty(wcId)) continue
          waits.push(
            new Promise<void>((resolve) => {
              const timer = setTimeout(resolve, RECOVERY_FLUSH_TIMEOUT_MS)
              state.flushWaiters.push(() => {
                clearTimeout(timer)
                resolve()
              })
              try {
                state.contents.send(host.flushChannel)
              } catch {
                settleFlush(state)
              }
            }),
          )
        }
        await Promise.all(waits)
      },
      openFileWithDecision(contents, request) {
        const state = stateOf(contents)
        host.adoptFile(contents, request.filePath)
        state.decision = request.decision
        reloadIfAsked(state)
      },
      openUntitledCopy(contents, request: RecoveryOpenUntitledRequest) {
        const state = stateOf(contents)
        state.untitled = request.copy
        state.untitledSeed = request.copy
        state.title = request.title
        state.saveAsDefaultPath = request.saveAsDefaultPath
        reloadIfAsked(state)
      },
      isUnprotectable() {
        return false
      },
    },
  }
  return recovery
}
