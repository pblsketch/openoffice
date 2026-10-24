/**
 * Crash recovery for HWP and HWPX documents (spec "작업을 잃지 않게 하기").
 *
 * While a tab has unsaved changes, the renderer exports the document now and then
 * (renderer/recovery-flow.ts) and this module stores it as the tab's recovery copy
 * in the app data folder, after the corrections a save makes against the opened
 * file (save-fixes.ts): the copy holds the bytes a save at that moment would have
 * written, so it is a whole document even without its original. The user's file
 * is never written here.
 *
 * Opening a file with a copy left over asks first (or follows the launch list's
 * choice) before any content reaches the editor. Restoring loads the copy's bytes,
 * while everything a later save corrects against (section tails, field kinds, the
 * disk state, the first-overwrite backup) still comes from the original file at the
 * original path. A document whose password a copy cannot keep gets no copy.
 *
 * hwp-main.ts owns the views' state; it hands this module a host to read it, and
 * calls the hooks below at the points of its open, save and close paths.
 */
import { basename, extname } from 'node:path'
import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import type { WebContents } from 'electron'
import {
  createRecoveryStore,
  isUntitledIdentity,
  newUntitledRecoveryId,
  registerRecoveryEditor,
  resolveRecoveryOnOpen,
  unprotectableNoticeText,
} from '@genoffice/electron-utils'
import type {
  RecoveryEditorContract,
  RecoveryIdentity,
  RecoveryStore,
  RecoveryWriteTicket,
} from '@genoffice/electron-utils'
import { getUiLang } from '@genoffice/i18n'
import { tm } from './dialog-strings'
import { applySaveFixes } from './save-fixes'
import type { SaveBase } from './save-fixes'
import { bytesMatchFormat } from './save-plan'
import { newTabsOf } from './tab-widths'
import { HWP_CHANNELS, MAX_HWP_SAVE_BYTES, hwpFormatOfPath } from '../shared/ipc'
import type {
  HwpFormat,
  MeasuredTab,
  RecoveryBeginResult,
  RecoveryOpenedResult,
  RecoveryWriteOutcome,
  TabSpot,
} from '../shared/ipc'

/** What this module reads of hwp-main's per-view state. */
export interface HwpRecoveryHost {
  /** the file the view saves to; undefined while it has none (a new document) */
  savePathOf(wcId: number): string | undefined
  /** the untitled copy the view was opened on (a skill template's, or a recovery copy) */
  untitledCopyOf(wcId: number): { name: string; format: HwpFormat } | undefined
  /** the path queued for the view to read */
  openPathOf(wcId: number): string | undefined
  /** what a save of the view corrects against (kept when the view read its file) */
  saveBaseOf(wcId: number): SaveBase
  /** the view's mirrored unsaved-changes flag */
  isDirty(wcId: number): boolean
  /** the view holds unsaved changes (a restored copy) */
  markDirty(wcId: number): void
  /** queue `path` as the file the view opens and saves to */
  queueFile(wcId: number, path: string): void
  /** queue `path` as an untitled copy: read like a file, saved like a new document */
  queueUntitledCopy(wcId: number, path: string, copy: { name: string; format: HwpFormat }): void
}

/** How long the OS-shutdown flush waits for one tab's copy. */
const FLUSH_TIMEOUT_MS = 10_000
/**
 * After "Don't Save" the tab normally closes at once. After this long its renderer is
 * asked for a copy again; the shared store takes it only once the window's close is
 * cancelled (resumeDiscardedCopies), so a tab waiting for a later tab's prompt writes
 * nothing back.
 */
const DONT_SAVE_HOLD_MS = 5_000

let host: HwpRecoveryHost | null = null
let store: RecoveryStore | null = null
let unregister: (() => void) | null = null

function recoveryStore(): RecoveryStore {
  store ??= createRecoveryStore({ userDataDir: () => app.getPath('userData') })
  return store
}

/** live views by id, for the OS-shutdown flush */
const contentsByWc = new Map<number, WebContents>()
/** the copy identity of a view without a file (and of a copy restored without its original) */
const untitledIdentityByWc = new Map<number, RecoveryIdentity>()
/** the title an untitled document's copy is listed under */
const titleByWc = new Map<number, string>()
/** the first Save As suggestion of a copy restored without its original */
const saveAsDefaultByWc = new Map<number, string>()
/** the launch list's answer for the file a view opens (openFileWithDecision) */
const decisionByWc = new Map<number, { path: string; decision: 'restore' | 'original' }>()
/** views whose renderer has taken its queued path: a later change of it needs a reload */
const consumedByWc = new Set<number>()
/** views that will read an untitled recovery copy (openUntitledCopy) */
const untitledRestoreByWc = new Set<number>()
/** views whose editor holds a recovery copy's content */
const restoredByWc = new Set<number>()
/** views that wrote or loaded the document's copy: a clean close removes it */
const ownsCopyByWc = new Set<number>()
/** the copy a view is exporting: its write ticket and format */
const turnByWc = new Map<number, { ticket: RecoveryWriteTicket; format: HwpFormat }>()
/** views whose document has a password a copy cannot keep */
const unprotectableByWc = new Set<number>()
const noticeShownByWc = new Set<number>()
/** views whose copy was dropped with "Don't Save", while their tab closes */
const dontSaveByWc = new Map<number, ReturnType<typeof setTimeout>>()
/** views whose renderer is gone: their copies stay for the reopened tab */
const crashedByWc = new Set<number>()
/** views whose old copy could not be resolved: no copy may replace it */
const blockedByWc = new Set<number>()
/** the file each view has read */
const loadedPathByWc = new Map<number, string>()
const flushWaiters = new Map<number, () => void>()
let nextFlushToken = 1

const formatOfExt = (ext: string): HwpFormat => (ext.toLowerCase() === '.hwpx' ? 'hwpx' : 'hwp')

/** the document's copy identity: its file, or the untitled slot of this view */
export function hwpRecoveryIdentityOf(wcId: number): RecoveryIdentity | null {
  if (!host) return null
  const path = host.savePathOf(wcId)
  if (path) return { kind: 'hwp', filePath: path }
  let identity = untitledIdentityByWc.get(wcId)
  if (!identity) {
    const format = host.untitledCopyOf(wcId)?.format ?? 'hwp'
    identity = { kind: 'hwp', untitledId: newUntitledRecoveryId(), ext: `.${format}` }
    untitledIdentityByWc.set(wcId, identity)
  }
  return identity
}

/**
 * The recovery copy slot of the document in this tab: its file, or the untitled slot a
 * new document's copies go to (what the session record keeps for an untitled tab, and
 * what `openUntitledCopy` takes to reopen it). Null for a view this editor does not track.
 */
export function hwpRecoveryIdentity(contents: WebContents): RecoveryIdentity | null {
  return contentsByWc.has(contents.id) ? hwpRecoveryIdentityOf(contents.id) : null
}

/** the format a save of this view writes */
function formatOf(wcId: number, identity: RecoveryIdentity): HwpFormat {
  if (isUntitledIdentity(identity)) return formatOfExt(identity.ext)
  return hwpFormatOfPath(identity.filePath) ?? host?.untitledCopyOf(wcId)?.format ?? 'hwp'
}

function titleOf(wcId: number, identity: RecoveryIdentity): string {
  if (!isUntitledIdentity(identity)) return basename(identity.filePath)
  const named = titleByWc.get(wcId)
  if (named) return named
  const copy = host?.untitledCopyOf(wcId)
  return copy ? copy.name.replace(/\.hwpx?$/i, '') || copy.name : tm('untitledFile')
}

/** the title a new document's copy is listed under: the tab's (the shell knows it) */
export function setHwpRecoveryTitle(contents: WebContents, title: string): void {
  if (title.trim()) titleByWc.set(contents.id, title)
}

/** the first Save As suggestion for this view, when it differs from the usual one */
export function hwpRecoverySaveAsDefault(wcId: number): string | undefined {
  return saveAsDefaultByWc.get(wcId)
}

/** the renderer took its queued path */
export function noteHwpPathConsumed(wcId: number): void {
  consumedByWc.add(wcId)
}

function reloadIfStarted(contents: WebContents): void {
  if (consumedByWc.has(contents.id) && !contents.isDestroyed()) contents.reload()
}

/**
 * Before a view reads `path`: settle a recovery copy left for that file. Answers the
 * copy's bytes when the view is to show them instead of the file, null for the file.
 * The caller still reads the original to keep what saves correct against.
 */
export async function hwpRecoveryOnRead(
  sender: WebContents,
  path: string,
): Promise<Uint8Array | null> {
  const wcId = sender.id
  const current = host
  if (!current) return null
  // an untitled copy (a template's, or a recovery copy opened as a new document)
  if (!current.savePathOf(wcId)) {
    if (untitledRestoreByWc.has(wcId)) {
      const identity = untitledIdentityByWc.get(wcId)
      if (identity) {
        restoredByWc.add(wcId)
        ownsCopyByWc.add(wcId)
        recoveryStore().markCopyLoaded(identity)
        current.markDirty(wcId)
      }
    }
    return null
  }
  loadedPathByWc.set(wcId, path)
  blockedByWc.delete(wcId)
  const identity: RecoveryIdentity = { kind: 'hwp', filePath: path }
  try {
    const wanted = decisionByWc.get(wcId)
    const decision = wanted?.path === path ? wanted.decision : undefined
    if (decision === 'original') return null
    // the other pane of a split shows the file as it is on disk, as it always did
    if (!decision && [...loadedPathByWc].some(([id, other]) => id !== wcId && other === path)) {
      return null
    }
    let bytes: Buffer | null = null
    if (decision === 'restore') {
      bytes = await recoveryStore().readCopy(identity)
      if (bytes) recoveryStore().markCopyLoaded(identity)
    } else {
      const parent =
        BrowserWindow.fromWebContents(sender) ?? BrowserWindow.getFocusedWindow() ?? null
      const result = await resolveRecoveryOnOpen({
        store: recoveryStore(),
        identity,
        dialog,
        parent,
        lang: getUiLang(),
      })
      if (result.action === 'restore') bytes = result.bytes
      // asked once: a reload of this view does not ask again
      decisionByWc.set(wcId, { path, decision: result.action })
    }
    if (!bytes) return null
    restoredByWc.add(wcId)
    ownsCopyByWc.add(wcId)
    current.markDirty(wcId)
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  } catch (err) {
    // the old copy stays as it is; this view writes none over it
    blockedByWc.add(wcId)
    console.warn('[hwp] could not settle the recovery copy:', err)
    return null
  }
}

/**
 * The copy of `identity` was removed: other views on the same file (the other pane of
 * a split) may hold unsaved changes it was keeping, so their next turn writes it again.
 * True when there was such a view.
 */
function resetOthersOn(identity: RecoveryIdentity, wcId: number): boolean {
  if (isUntitledIdentity(identity)) return false
  const slot = recoveryStore().copyPath(identity)
  let shared = false
  for (const [otherId, contents] of contentsByWc) {
    if (otherId === wcId || contents.isDestroyed()) continue
    const other = savedIdentity(otherId)
    if (other && recoveryStore().copyPath(other) === slot) {
      contents.send(HWP_CHANNELS.recoveryReset)
      shared = true
    }
  }
  return shared
}

/** delete the copy of `identity` for this view, and tell the views that shared it */
function dropCopy(
  wcId: number,
  identity: RecoveryIdentity,
  reason: 'saved' | 'dontSave' | 'closedClean',
): void {
  const target = recoveryStore()
  if (target.deleteCopy(identity, reason) !== 'deleted') return
  // "Don't Save" blocks the copy until the window's close is cancelled; the other
  // pane's edits were not thrown away, so its copies go on
  if (resetOthersOn(identity, wcId) && reason === 'dontSave') target.clearDiscarded(identity)
}

/**
 * The view's file was renamed on disk (hwp-main has moved its save path already): the
 * copy it wrote or loaded moves to the new name's slot, so a save or a clean close
 * removes it and the old name's copy does not come back at the next launch.
 */
export async function hwpRecoveryFileRenamed(
  contents: WebContents,
  oldPath: string,
  newPath: string,
): Promise<void> {
  const wcId = contents.id
  if (loadedPathByWc.get(wcId) === oldPath) loadedPathByWc.set(wcId, newPath)
  const decision = decisionByWc.get(wcId)
  if (decision?.path === oldPath) decisionByWc.set(wcId, { ...decision, path: newPath })
  if (!ownsCopyByWc.has(wcId) || host?.savePathOf(wcId) !== newPath) return
  const from: RecoveryIdentity = { kind: 'hwp', filePath: oldPath }
  const to: RecoveryIdentity = { kind: 'hwp', filePath: newPath }
  const target = recoveryStore()
  try {
    const bytes = await target.readCopy(from)
    if (bytes) await target.writeCopy(to, bytes, { title: basename(newPath) })
  } catch (err) {
    console.warn('[hwp] the recovery copy could not follow the renamed file:', err)
    return
  }
  // the content lives under the new name now; the old entry would only offer it twice
  target.deleteCopy(from, 'discarded')
  // a turn that landed under the new name while the copy moved is older than what the
  // editor holds: the next turn writes the copy again
  if (!contents.isDestroyed()) contents.send(HWP_CHANNELS.recoveryReset)
}

/** the identity a save starts from: its copy is removed once the save has landed */
export function hwpRecoveryBeforeSave(wcId: number): RecoveryIdentity | null {
  return hwpRecoveryIdentityOf(wcId)
}

/** a save landed: the document's copy goes, and the document is the saved file from now on */
export function hwpRecoverySaved(wcId: number, before: RecoveryIdentity | null): void {
  turnByWc.delete(wcId)
  restoredByWc.delete(wcId)
  untitledRestoreByWc.delete(wcId)
  saveAsDefaultByWc.delete(wcId)
  // the copy is gone with the save: a clean close of this view has nothing of its own to remove
  ownsCopyByWc.delete(wcId)
  if (before) {
    try {
      dropCopy(wcId, before, 'saved')
    } catch (err) {
      console.warn('[hwp] could not remove the recovery copy:', err)
    }
  }
  untitledIdentityByWc.delete(wcId)
  titleByWc.delete(wcId)
}

/**
 * The user chose "Don't Save" (or a tool closed the document without saving): the
 * copy goes. No new copy is taken while the tab closes.
 */
export function hwpRecoveryDontSave(contents: WebContents): void {
  const wcId = contents.id
  const identity = hwpRecoveryIdentityOf(wcId)
  turnByWc.delete(wcId)
  if (identity) {
    try {
      dropCopy(wcId, identity, 'dontSave')
    } catch (err) {
      console.warn('[hwp] could not remove the recovery copy:', err)
    }
  }
  clearTimeout(dontSaveByWc.get(wcId))
  dontSaveByWc.set(
    wcId,
    setTimeout(() => {
      dontSaveByWc.delete(wcId)
      // the tab may stay open: its unsaved changes need a copy again once the store
      // takes it (the window's close was cancelled)
      if (!contents.isDestroyed()) contents.send(HWP_CHANNELS.recoveryReset)
    }, DONT_SAVE_HOLD_MS),
  )
}

/** Follow a view's lifetime; called before hwp-main's own teardown is registered. */
export function trackHwpRecovery(wc: WebContents): void {
  const wcId = wc.id
  contentsByWc.set(wcId, wc)
  wc.on('render-process-gone', () => crashedByWc.add(wcId))
  wc.once('destroyed', () => {
    try {
      const identity = savedIdentity(wcId) ?? untitledIdentityByWc.get(wcId)
      if (identity && dontSaveByWc.has(wcId)) {
        // a copy that landed while the tab was closing goes too
        dropCopy(wcId, identity, 'dontSave')
      } else if (
        identity &&
        ownsCopyByWc.has(wcId) &&
        !crashedByWc.has(wcId) &&
        !host?.isDirty(wcId)
      ) {
        // closed with nothing unsaved; the store keeps it while the app is ending
        dropCopy(wcId, identity, 'closedClean')
      }
    } catch (err) {
      console.warn('[hwp] could not settle the recovery copy on close:', err)
    }
    clearTimeout(dontSaveByWc.get(wcId))
    for (const table of [
      contentsByWc,
      untitledIdentityByWc,
      titleByWc,
      saveAsDefaultByWc,
      decisionByWc,
      turnByWc,
      dontSaveByWc,
      loadedPathByWc,
    ]) {
      table.delete(wcId)
    }
    for (const set of [
      consumedByWc,
      untitledRestoreByWc,
      restoredByWc,
      ownsCopyByWc,
      unprotectableByWc,
      noticeShownByWc,
      crashedByWc,
      blockedByWc,
    ]) {
      set.delete(wcId)
    }
  })
}

function savedIdentity(wcId: number): RecoveryIdentity | null {
  const path = host?.savePathOf(wcId)
  return path ? { kind: 'hwp', filePath: path } : null
}

function validBytes(data: unknown, format: unknown): data is Uint8Array {
  return (
    data instanceof Uint8Array &&
    data.length > 0 &&
    data.length <= MAX_HWP_SAVE_BYTES &&
    (format === 'hwp' || format === 'hwpx') &&
    bytesMatchFormat(data, format)
  )
}

/** why this view may not take a copy now, or null */
function copyBarred(wcId: number): boolean {
  return unprotectableByWc.has(wcId) || dontSaveByWc.has(wcId) || blockedByWc.has(wcId)
}

let ipcRegistered = false

/** The renderer's recovery channels; hwp-main calls this once, with its own channels. */
export function registerHwpRecoveryIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.handle(HWP_CHANNELS.recoveryBegin, (e): RecoveryBeginResult => {
    const wcId = e.sender.id
    turnByWc.delete(wcId)
    if (copyBarred(wcId)) return { ok: false }
    const identity = hwpRecoveryIdentityOf(wcId)
    if (!identity) return { ok: false }
    // the ticket is taken before the export: a save that lands meanwhile wins
    const ticket = recoveryStore().beginWrite(identity)
    const format = formatOf(wcId, identity)
    turnByWc.set(wcId, { ticket, format })
    return { ok: true, format }
  })

  ipcMain.handle(HWP_CHANNELS.recoveryNewTabs, (e, data: unknown, format: unknown): TabSpot[] => {
    if (!turnByWc.has(e.sender.id) || !validBytes(data, format)) return []
    return newTabsOf(data, format as HwpFormat)
  })

  ipcMain.handle(
    HWP_CHANNELS.recoveryWrite,
    async (e, data: unknown, format: unknown, tabs: unknown): Promise<RecoveryWriteOutcome> => {
      const wcId = e.sender.id
      const turn = turnByWc.get(wcId)
      turnByWc.delete(wcId)
      if (!turn || !host) return 'superseded'
      if (copyBarred(wcId) || e.sender.isDestroyed()) return 'refused'
      if (format !== turn.format || !validBytes(data, format)) return 'refused'
      const identity = hwpRecoveryIdentityOf(wcId)
      if (!identity) return 'refused'
      const target = recoveryStore()
      // the document moved to another identity (Save As) since the turn began
      if (target.beginWrite(identity).key !== turn.ticket.key) return 'superseded'
      const fixed = applySaveFixes(
        data,
        turn.format,
        Array.isArray(tabs) ? (tabs as MeasuredTab[]) : undefined,
        host.saveBaseOf(wcId),
      ).bytes
      const result = await target.writeCopy(
        identity,
        Buffer.from(fixed.buffer, fixed.byteOffset, fixed.byteLength),
        { title: titleOf(wcId, identity), ticket: turn.ticket },
      )
      if (result === 'written') ownsCopyByWc.add(wcId)
      return result
    },
  )

  ipcMain.handle(
    HWP_CHANNELS.recoveryOpened,
    (e, passwordProtected: unknown): RecoveryOpenedResult => {
      const wcId = e.sender.id
      let notice: string | null = null
      if (passwordProtected === true) {
        unprotectableByWc.add(wcId)
        if (!noticeShownByWc.has(wcId)) {
          noticeShownByWc.add(wcId)
          notice = unprotectableNoticeText(getUiLang())
        }
      }
      return { restored: restoredByWc.has(wcId), notice }
    },
  )

  ipcMain.on(HWP_CHANNELS.recoveryFlushed, (_e, token: unknown) => {
    if (typeof token !== 'number') return
    const done = flushWaiters.get(token)
    flushWaiters.delete(token)
    done?.()
  })
}

function flushOne(contents: WebContents): Promise<void> {
  return new Promise<void>((resolve) => {
    const token = nextFlushToken++
    const timer = setTimeout(() => {
      flushWaiters.delete(token)
      resolve()
    }, FLUSH_TIMEOUT_MS)
    flushWaiters.set(token, () => {
      clearTimeout(timer)
      resolve()
    })
    try {
      contents.send(HWP_CHANNELS.recoveryFlush, token)
    } catch {
      flushWaiters.delete(token)
      clearTimeout(timer)
      resolve()
    }
  })
}

const contract: RecoveryEditorContract = {
  kind: 'hwp',

  async writeCopiesNow() {
    try {
      const due = [...contentsByWc.values()].filter(
        (contents) =>
          !contents.isDestroyed() && host?.isDirty(contents.id) && !copyBarred(contents.id),
      )
      await Promise.all(due.map(flushOne))
    } catch (err) {
      console.warn('[hwp] could not write the recovery copies:', err)
    }
  },

  openFileWithDecision(contents, request) {
    if (!host || contents.isDestroyed()) return
    const wcId = contents.id
    decisionByWc.set(wcId, { path: request.filePath, decision: request.decision })
    if (host.openPathOf(wcId) !== request.filePath) host.queueFile(wcId, request.filePath)
    reloadIfStarted(contents)
  },

  openUntitledCopy(contents, request) {
    if (!host || contents.isDestroyed()) return
    const wcId = contents.id
    const path = recoveryStore().copyPath(request.copy)
    const ext = extname(path).toLowerCase()
    untitledIdentityByWc.set(wcId, request.copy)
    titleByWc.set(wcId, request.title)
    if (request.saveAsDefaultPath) saveAsDefaultByWc.set(wcId, request.saveAsDefaultPath)
    else saveAsDefaultByWc.delete(wcId)
    untitledRestoreByWc.add(wcId)
    host.queueUntitledCopy(wcId, path, { name: `${request.title}${ext}`, format: formatOfExt(ext) })
    reloadIfStarted(contents)
  },

  isUnprotectable(contents) {
    return unprotectableByWc.has(contents.id)
  },
}

/** Hand this module hwp-main's state and register the editor's recovery contract (once). */
export function installHwpRecovery(next: HwpRecoveryHost): void {
  host = next
  unregister ??= registerRecoveryEditor(contract)
}

/** the editor's contract, as registered (for tests) */
export const hwpRecoveryContract: RecoveryEditorContract = contract
