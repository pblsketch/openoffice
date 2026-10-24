/**
 * Crash-recovery bookkeeping of the Word editor on top of the shared recovery
 * store (`@genoffice/electron-utils`).
 *
 * Copies stay where earlier versions put them: `<userData>/docs-autosave`,
 * named sha1(path)[0..16] plus `.docx` (`.odt` for an ODT document), so a copy
 * an earlier version left behind is still offered when its file is opened.
 * An untitled document's copy lives in that folder's `untitled/` slot: no file
 * is ever created in a user folder for a document that was never saved.
 *
 * This module only decides which copy a tab writes and when a copy goes away;
 * it never touches the user's files. Deletions follow the shared rules: a
 * successful save ('saved'), "Don't Save" or a discarding close ('dontSave'),
 * a clean close of a loaded tab ('closedClean', only the copies that tab
 * wrote). While the app is ending the store refuses everything but 'saved'
 * and 'dontSave', so a teardown during shutdown keeps the copies just written.
 * A tab whose renderer crashed keeps its copies (the shell reopens them).
 */
import { basename } from 'node:path'
import {
  resolveRecoveryOnOpen,
  type RecoveryCopyInfo,
  type RecoveryDeleteReason,
  type RecoveryFileIdentity,
  type RecoveryIdentity,
  type RecoveryMessageBox,
  type RecoveryStore,
  type RecoveryUntitledIdentity,
  isUntitledIdentity,
  newUntitledRecoveryId,
} from '@genoffice/electron-utils'
import type { BrowserWindow } from 'electron'

/** how the last close check of a tab ended */
export type DocsCloseOutcome = 'clean' | 'saved' | 'dontSave'

/** the copy a tab writes: its file's, or its untitled document's */
export type DocsCopyTarget = { filePath: string } | { untitledExt: '.docx' | '.odt' }

/** what the opening of a file decided */
export type DocsOpenRecovery =
  { action: 'original' } | { action: 'restore'; bytes: Buffer; copy: RecoveryCopyInfo | null }

export interface DocsRecovery {
  readonly store: RecoveryStore
  fileIdentity(filePath: string): RecoveryFileIdentity
  /**
   * Write the tab's copy. The write ticket is taken before `prepare` runs, so a
   * save (or "Don't Save") that lands meanwhile wins and nothing is left on
   * disk. `prepare` may be async (a docx gets its lazily served pictures back
   * first, like a save); answering null skips this tick. Resolves 'written',
   * 'skipped' (prepare said no, or a delete superseded the write) or rejects
   * on a disk error (the caller backs off).
   */
  writeCopy(
    tabId: number,
    target: DocsCopyTarget,
    prepare: () => Buffer | null | Promise<Buffer | null>,
    title: string,
  ): Promise<'written' | 'skipped'>
  /**
   * A save of this tab landed. `paths`: the file copies it makes stale (the
   * saved path, and the path the tab's document had before, when the save
   * moved it). The tab's untitled copy always goes too: after any save the
   * document has a file, and an untitled write that crossed the first save
   * would otherwise stay behind as an orphan.
   */
  noteSaved(tabId: number, paths: readonly string[]): void
  /** the close check answered: a clean tab may drop its own copies when it closes */
  noteCloseCheck(tabId: number, dirty: boolean): void
  /**
   * The user (or an MCP/AI close) dropped the tab's unsaved changes: delete the
   * copy of `filePath` and the tab's untitled copy now, and again at teardown
   * (a write may still be in flight).
   */
  discard(tabId: number, filePath: string | null): void
  /** the close prompt's Save went through */
  noteClosedSaved(tabId: number): void
  /**
   * The tab closes without its renderer's answer ("Close Anyway" on a hung
   * tab): its copies are the only record of its edits, so they stay, set
   * aside as "later" (asked about when the file opens; an untitled one is in
   * the next launch list) instead of being dropped like "Don't Save".
   * `filePath`: the tab's file, whose copy it may have loaded without
   * rewriting it.
   */
  abandon(tabId: number, filePath: string | null): void
  /**
   * The tab is still open (the OS is ending the session and asked it for a
   * copy): a "Don't Save" answered before a cancelled quit no longer holds,
   * so its teardown keeps the copies.
   */
  noteStillOpen(tabId: number): void
  /**
   * The restored copy of `filePath` could not be loaded and the file opened
   * instead: no tab holds the copy, so it waits as "later" for the next open
   * of the file rather than staying undecided.
   */
  restoreFailed(filePath: string): void
  /**
   * The tab's document is closed (the tab torn down, or another document
   * replaced it after the close prompt): settle the copies the tab wrote by
   * how that close was decided, then forget them.
   */
  settleClosedDocument(tabId: number, crashed: boolean): void
  /**
   * Opening `filePath`: decide between the copy and the file. A launch-list
   * decision passed by the shell wins; a "restore" already chosen restores
   * without asking; otherwise the named per-file prompt asks (Esc/close =
   * restore, "the file changed after" line when the file is newer).
   */
  resolveOpen(options: {
    filePath: string
    decision?: 'restore' | 'original'
    dialog: RecoveryMessageBox
    parent?: BrowserWindow | null
    lang: string
  }): Promise<DocsOpenRecovery>
  /**
   * Load a copy into an untitled tab: an untitled copy keeps its slot (the tab
   * goes on writing to it), a file copy whose original is missing moves into a
   * new untitled slot. Null when the copy is gone, unreadable, or `accept`
   * refuses its bytes (an encrypted copy without its file cannot be opened).
   */
  takeUntitledCopy(
    tabId: number,
    copy: RecoveryIdentity,
    options: { title: string; ext: '.docx' | '.odt'; accept: (bytes: Buffer) => boolean },
  ): Promise<{ bytes: Buffer; identity: RecoveryUntitledIdentity } | null>
  /** the untitled copy this tab writes to, if any */
  untitledOf(tabId: number): RecoveryUntitledIdentity | null
}

export function createDocsRecovery(store: RecoveryStore): DocsRecovery {
  /** file copies each tab wrote, by path */
  const pathsByTab = new Map<number, Set<string>>()
  /** each tab's untitled document copy */
  const untitledByTab = new Map<number, RecoveryUntitledIdentity>()
  const outcomes = new Map<number, DocsCloseOutcome>()

  const fileIdentity = (filePath: string): RecoveryFileIdentity => ({ kind: 'docs', filePath })

  function untitledFor(tabId: number, ext: '.docx' | '.odt'): RecoveryUntitledIdentity {
    const current = untitledByTab.get(tabId)
    if (current && current.ext === ext) return current
    // another untitled document took this tab (its close was settled by the
    // replace prompt): the earlier slot holds nothing this tab still shows
    if (current) store.deleteCopy(current, 'closedClean')
    const next: RecoveryUntitledIdentity = {
      kind: 'docs',
      untitledId: newUntitledRecoveryId(),
      ext,
    }
    untitledByTab.set(tabId, next)
    return next
  }

  function dropUntitled(tabId: number, reason: RecoveryDeleteReason): void {
    const untitled = untitledByTab.get(tabId)
    if (!untitled) return
    // "Don't Save" keeps the slot: the store blocks it until the close is
    // cancelled, and a fresh slot would let the dropped edits back in
    if (store.deleteCopy(untitled, reason) === 'deleted' && reason !== 'dontSave') {
      untitledByTab.delete(tabId)
    }
  }

  function dropTabCopies(tabId: number, reason: RecoveryDeleteReason): void {
    const paths = pathsByTab.get(tabId)
    for (const filePath of paths ?? []) {
      if (store.deleteCopy(fileIdentity(filePath), reason) === 'deleted') paths?.delete(filePath)
    }
    dropUntitled(tabId, reason)
  }

  return {
    store,
    fileIdentity,

    async writeCopy(tabId, target, prepare, title) {
      const identity: RecoveryIdentity =
        'filePath' in target
          ? fileIdentity(target.filePath)
          : untitledFor(tabId, target.untitledExt)
      const ticket = store.beginWrite(identity)
      const bytes = await prepare()
      if (!bytes) return 'skipped'
      const result = await store.writeCopy(identity, bytes, { title, ticket })
      if (result !== 'written') return 'skipped'
      if (!isUntitledIdentity(identity)) {
        const paths = pathsByTab.get(tabId) ?? new Set<string>()
        paths.add(identity.filePath)
        pathsByTab.set(tabId, paths)
      }
      // a copy means unsaved changes: an earlier "clean" answer no longer holds
      if (outcomes.get(tabId) === 'clean') outcomes.delete(tabId)
      return 'written'
    },

    noteSaved(tabId, paths) {
      for (const filePath of paths) store.deleteCopy(fileIdentity(filePath), 'saved')
      dropUntitled(tabId, 'saved')
    },

    noteCloseCheck(tabId, dirty) {
      if (dirty) outcomes.delete(tabId)
      else outcomes.set(tabId, 'clean')
    },

    discard(tabId, filePath) {
      outcomes.set(tabId, 'dontSave')
      if (filePath) store.deleteCopy(fileIdentity(filePath), 'dontSave')
      dropUntitled(tabId, 'dontSave')
    },

    noteClosedSaved(tabId) {
      outcomes.set(tabId, 'saved')
    },

    abandon(tabId, filePath) {
      // no outcome: the teardown keeps every copy, like a crashed tab's
      outcomes.delete(tabId)
      const paths = new Set(pathsByTab.get(tabId))
      if (filePath) paths.add(filePath)
      for (const path of paths) store.setCopyState(fileIdentity(path), 'later')
      const untitled = untitledByTab.get(tabId)
      if (untitled) store.setCopyState(untitled, 'later')
    },

    noteStillOpen(tabId) {
      if (outcomes.get(tabId) === 'dontSave') outcomes.delete(tabId)
    },

    restoreFailed(filePath) {
      store.setCopyState(fileIdentity(filePath), 'later')
    },

    settleClosedDocument(tabId, crashed) {
      const outcome = outcomes.get(tabId)
      // crashed: its last copies are what the shell reopens. Undecided (the tab
      // closed without a close check, e.g. a quit): keep them, nothing is lost.
      if (!crashed && outcome) {
        dropTabCopies(tabId, outcome === 'clean' ? 'closedClean' : outcome)
      }
      pathsByTab.delete(tabId)
      untitledByTab.delete(tabId)
      outcomes.delete(tabId)
    },

    async resolveOpen({ filePath, decision, dialog, parent, lang }) {
      const identity = fileIdentity(filePath)
      // the file is being opened: what it shows from now on was not thrown
      // away by an earlier "Don't Save", so its copies are written again
      store.clearDiscarded(identity)
      if (decision === 'original') return { action: 'original' }
      if (decision === 'restore') {
        const bytes = await store.readCopy(identity)
        if (!bytes) return { action: 'original' }
        const copy = store.copyInfo(identity)
        store.markCopyLoaded(identity)
        return { action: 'restore', bytes, copy }
      }
      const result = await resolveRecoveryOnOpen({
        store,
        identity,
        dialog,
        parent,
        lang,
        documentName: basename(filePath),
      })
      return result.action === 'restore'
        ? { action: 'restore', bytes: result.bytes, copy: result.copy }
        : { action: 'original' }
    },

    async takeUntitledCopy(tabId, copy, { title, ext, accept }) {
      const bytes = await store.readCopy(copy)
      if (!bytes || !accept(bytes)) return null
      let identity: RecoveryUntitledIdentity | null
      if (isUntitledIdentity(copy)) {
        identity = copy
      } else {
        // the original is gone: the copy becomes this untitled tab's own
        identity = store.adoptUntitledCopy('docs', store.copyPath(copy), {
          title,
          ext,
          state: 'undecided',
        })
        if (!identity) return null
      }
      const previous = untitledByTab.get(tabId)
      if (previous && previous.untitledId !== identity.untitledId) {
        store.deleteCopy(previous, 'closedClean')
      }
      untitledByTab.set(tabId, identity)
      store.markCopyLoaded(identity)
      return { bytes, identity }
    },

    untitledOf(tabId) {
      return untitledByTab.get(tabId) ?? null
    },
  }
}
