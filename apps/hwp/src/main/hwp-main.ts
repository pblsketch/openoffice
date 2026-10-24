import { existsSync } from 'node:fs'
import { copyFile, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { BrowserWindow, WebContentsView, app, dialog, ipcMain, shell } from 'electron'
import type { WebContents } from 'electron'
import {
  configuredDefaultSaveDir,
  confirmOverwriteIfConflicted,
  contextMenuLabels,
  installContextMenu,
  installNavigationGuard,
  installRendererProtocol,
  recordDiskState,
  registerRendererScheme,
  rendererUrl,
  safeExternalUrl,
  shouldDeferAutoSave,
  showSaveDialogWithMemory,
} from '@genoffice/electron-utils'
import type { SaveDiskState } from '@genoffice/electron-utils'
import { hwpToText } from '@genoffice/file-parse'
import { getUiLang } from '@genoffice/i18n'
import { registerHwpAttachmentIpc } from './attachments-ipc'
import { atomicWriteFile } from './atomic-write'
import { badJob, printJobToPdf, printJobToPrinter } from './print-document'
import { tm } from './dialog-strings'
import { fieldKindsOf } from './field-kinds'
import type { FieldKinds } from './field-kinds'
import {
  hwpRecoveryBeforeSave,
  hwpRecoveryDontSave,
  hwpRecoveryFileRenamed,
  hwpRecoveryOnRead,
  hwpRecoverySaveAsDefault,
  hwpRecoverySaved,
  installHwpRecovery,
  noteHwpPathConsumed,
  registerHwpRecoveryIpc,
  trackHwpRecovery,
} from './recovery'
import type { HwpRecoveryHost } from './recovery'
import { applySaveFixes } from './save-fixes'
import { backupPathFor, bytesMatchFormat, needsBackup, withFormatExtension } from './save-plan'
import { sectionTailsOf } from './section-tails'
import type { SectionTails } from './section-tails'
import { newTabsOf } from './tab-widths'
import { hasTrackedChanges, withoutTrackedChanges } from './tracked-changes'
import { HWP_CHANNELS, MAX_HWP_SAVE_BYTES, hwpFormatOfPath } from '../shared/ipc'
import type {
  BeginSaveResult,
  CommitSaveResult,
  HwpFormat,
  MeasuredTab,
  PrintJob,
  PrintMode,
  PrintResult,
  SaveMode,
  TabSpot,
} from '../shared/ipc'

interface RuntimePaths {
  preloadPath: string
  rendererUrl?: string
  rendererFile?: string
  /** open a file this editor made (an exported PDF) in the app; false when it cannot */
  openGeneratedPath?: (path: string) => boolean
  /** ask the shell for a file to open; the editor swallows Ctrl+O before the menu sees it */
  openFileDialog?: () => void
  /** go back to the home tab; the editor takes Ctrl+Shift+H for its document history */
  goHome?: () => void
  /** a new Hangul document in a tab (Hangul's Alt+N) */
  newDocument?: () => void
}

let runtime: RuntimePaths = { preloadPath: '' }

export function configureHwpRuntime(paths: RuntimePaths): void {
  runtime = paths
  installHwpRecovery(recoveryHost)
}

/** Open path per view, queued at tab creation; the renderer consumes it after mount.
 * Kept until the view is destroyed so a reload consumes it again. */
const openPathByWc = new Map<number, string>()
/** File paths granted to each view; readFile only allows these */
const allowedByWc = new Map<number, Set<string>>()
/** Current save target per view */
const savePathByWc = new Map<number, string>()
/**
 * Views opened on an untitled copy (a skill template's, spec 5.7): the copy is
 * read from its temp file like any open, but the view has no save target, so
 * the first save asks where; the copy's name and format are what it offers.
 */
const untitledCopyByWc = new Map<number, { name: string; format: HwpFormat }>()
/** Unsaved-changes flags mirrored from the renderer; drives the save prompt before closing a tab/window */
const dirtyByWc = new Set<number>()
const closeSaveWaiters = new Map<number, (ok: boolean) => void>()
/** Resolvers for menu- and shortcut-triggered saves, settled when the renderer's save ends */
const saveWaiters = new Map<number, (ok: boolean) => void>()
const readBytesWaiters = new Map<number, (result: unknown) => void>()
const readTextInFlight = new Map<number, Promise<string>>()
/** Target a view resolved with beginSave and has not committed yet */
const pendingSaveByWc = new Map<number, { path: string; format: HwpFormat }>()
/** Paths each view has already written this session; their first overwrite kept a backup */
const writtenByWc = new Map<number, Set<string>>()
/**
 * What the engine does not hold of the HWP file a view opened (master pages beyond the
 * first, memos), kept to put back when the view saves; see section-tails.ts
 */
const tailsByWc = new Map<number, SectionTails>()
/** The kinds of the HWP file's fields that the engine writes as "unknown"; see field-kinds.ts */
const fieldKindsByWc = new Map<number, FieldKinds>()
/** Views whose file has tracked changes that could not be left out: not saved, see tracked-changes.ts */
const trackedByWc = new Set<number>()
/** Views whose file had tracked changes, opened without them; see tracked-changes.ts */
const trackingDroppedByWc = new Set<number>()
/**
 * Disk snapshots per view: what each copy last read or wrote of a path. A save
 * from a split-pane copy compares its record with the file on disk to tell
 * whether a sibling copy changed it (decision 0036, see save-conflict in
 * packages/electron-utils).
 */
const diskStatesByWc = new Map<number, Map<string, SaveDiskState>>()

/** What crash recovery (recovery.ts) reads and sets of the views' state. */
const recoveryHost: HwpRecoveryHost = {
  savePathOf: (wcId) => savePathByWc.get(wcId),
  untitledCopyOf: (wcId) => untitledCopyByWc.get(wcId),
  openPathOf: (wcId) => openPathByWc.get(wcId),
  saveBaseOf: (wcId) => ({ tails: tailsByWc.get(wcId), kinds: fieldKindsByWc.get(wcId) }),
  isDirty: (wcId) => dirtyByWc.has(wcId),
  markDirty: (wcId) => {
    dirtyByWc.add(wcId)
  },
  queueFile: (wcId, path) => {
    openPathByWc.set(wcId, path)
    allowedByWc.set(wcId, new Set([...(allowedByWc.get(wcId) ?? []), path]))
    savePathByWc.set(wcId, path)
    untitledCopyByWc.delete(wcId)
  },
  queueUntitledCopy: (wcId, path, copy) => {
    openPathByWc.set(wcId, path)
    allowedByWc.set(wcId, new Set([...(allowedByWc.get(wcId) ?? []), path]))
    savePathByWc.delete(wcId)
    untitledCopyByWc.set(wcId, copy)
  },
}

/** Why a save stood down: the file moved on disk after this copy read or wrote it. */
const EXTERNAL_MODIFIED = 'hwp: external-modified'

function recordedDiskState(wcId: number, path: string): SaveDiskState | undefined {
  return diskStatesByWc.get(wcId)?.get(path)
}

/** Record what the file holds now; an unreadable file leaves no record and no conflict. */
async function rememberDiskState(wcId: number, path: string): Promise<void> {
  const state = await recordDiskState(path)
  if (!state) return
  const states = diskStatesByWc.get(wcId) ?? new Map<string, SaveDiskState>()
  states.set(path, state)
  diskStatesByWc.set(wcId, states)
}

/** Fired after a save lands on a NEW path (Save As); the shell syncs tab title, recents, projects */
let fileSavedHook: ((wc: WebContents, path: string) => void) | null = null

export function setHwpFileSavedHook(hook: (wc: WebContents, path: string) => void): void {
  fileSavedHook = hook
}

export function hwpIsDirty(webContentsId: number): boolean {
  return dirtyByWc.has(webContentsId)
}

/** The file was renamed on disk: follow it, so the next save lands on the new name */
export function hwpFileRenamed(contents: WebContents, oldPath: string, newPath: string): void {
  const wcId = contents.id
  if (savePathByWc.get(wcId) === oldPath) savePathByWc.set(wcId, newPath)
  if (openPathByWc.get(wcId) === oldPath) openPathByWc.set(wcId, newPath)
  const allowed = allowedByWc.get(wcId)
  if (allowed?.has(oldPath)) allowed.add(newPath)
  // the renamed file is the same bytes: the recorded state follows the path
  const states = diskStatesByWc.get(wcId)
  const recorded = states?.get(oldPath)
  if (states && recorded) {
    states.delete(oldPath)
    states.set(newPath, recorded)
  }
  // the recovery copy follows the file
  void hwpRecoveryFileRenamed(contents, oldPath, newPath)
}

/**
 * Close guard: true means proceed with closing. Clean → true; dirty →
 * Save / Don't Save / Cancel. On Save, ask the renderer to export + write
 * and await the result; a canceled or failed save keeps the tab open.
 */
export async function requestHwpClose(
  contents: WebContents,
  parent?: BrowserWindow | null,
): Promise<boolean> {
  if (!dirtyByWc.has(contents.id) || contents.isDestroyed()) return true
  const options = {
    type: 'warning' as const,
    message: tm('closeUnsavedMsg'),
    detail: tm('closeUnsavedDetail'),
    buttons: [tm('btnSave'), tm('btnDontSave'), tm('btnCancel')],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  }
  const { response } =
    parent && !parent.isDestroyed()
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options)
  if (response === 2) return false
  if (response === 1) {
    // the unsaved changes are given up: so is their recovery copy
    hwpRecoveryDontSave(contents)
    return true
  }
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      closeSaveWaiters.delete(contents.id)
      resolve(false)
    }, 120_000)
    closeSaveWaiters.set(contents.id, (ok) => {
      clearTimeout(timer)
      resolve(ok)
    })
    contents.send(HWP_CHANNELS.closeSaveRequest)
  })
}

/**
 * Menu / shortcut Save and Save As: ask the renderer to export and save.
 * Resolves true only when bytes were written. The request always goes to the
 * renderer, even when the mirrored dirty flag says clean: that flag can lag a
 * keystroke behind, and Ctrl+S right after typing must still save. The
 * renderer asks the editor itself and declines a save with nothing to write.
 */
/** The File menu or Ctrl+P: the renderer gathers the pages and comes back with printPages. */
export function requestHwpPrint(contents: WebContents, mode: PrintMode): void {
  if (!contents.isDestroyed()) contents.send(HWP_CHANNELS.printRequest, mode)
}

/** A hidden window for printing: no preload, no scripts, sandboxed. */
const printWindow = (): BrowserWindow =>
  new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })

/** The name an exported PDF is offered under: the document's, or the untitled one. */
function pdfName(wcId: number): string {
  const current = savePathByWc.get(wcId)
  const base = current ? basename(current).replace(/.hwpx?$/i, '') : ''
  return `${base || tm('untitledFile')}.pdf`
}

export function requestHwpSave(contents: WebContents, mode: SaveMode): Promise<boolean> {
  if (contents.isDestroyed()) return Promise.resolve(false)
  // one save at a time per view: a request arriving while one is in flight is declined
  if (saveWaiters.has(contents.id)) return Promise.resolve(false)
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      saveWaiters.delete(contents.id)
      resolve(false)
    }, 120_000)
    saveWaiters.set(contents.id, (ok) => {
      clearTimeout(timer)
      resolve(ok)
    })
    contents.send(HWP_CHANNELS.saveRequest, mode)
  })
}

/** How long a live read may take; a large document exports in well under this. */
const READ_TEXT_TIMEOUT_MS = 30_000
/** How often the request is sent again while the renderer has not answered. */
const READ_TEXT_RETRY_MS = 250

/**
 * The text of the document as it is in the editor now, unsaved edits included
 * (for the MCP tool that reads open documents). The renderer exports the
 * document's bytes and the shared reader turns them into text, so an open
 * document reads the same as one read from disk.
 *
 * One read per view at a time: a second caller shares the first one's answer.
 * The request is re-sent until the renderer answers, because its listener is
 * registered while it mounts and a request sent before that is dropped.
 */
export function hwpReadText(contents: WebContents): Promise<string> {
  if (contents.isDestroyed()) return Promise.reject(new Error('the document is no longer open'))
  const wcId = contents.id
  const inFlight = readTextInFlight.get(wcId)
  if (inFlight) return inFlight
  const request = new Promise<string>((resolve, reject) => {
    let settled = false
    const settle = (finish: () => void): void => {
      if (settled) return
      settled = true
      clearInterval(retry)
      clearTimeout(timer)
      readBytesWaiters.delete(wcId)
      readTextInFlight.delete(wcId)
      finish()
    }
    const retry = setInterval(() => {
      if (contents.isDestroyed()) {
        settle(() => reject(new Error('the document is no longer open')))
        return
      }
      if (!answered) contents.send(HWP_CHANNELS.readBytesRequest)
    }, READ_TEXT_RETRY_MS)
    const timer = setTimeout(
      () => settle(() => reject(new Error('timed out reading the document'))),
      READ_TEXT_TIMEOUT_MS,
    )
    // the first answer is the one that counts: re-sent requests may produce more
    let answered = false
    readBytesWaiters.set(wcId, (result) => {
      if (answered) return
      answered = true
      const raw = (result ?? {}) as { ok?: unknown; bytes?: unknown; error?: unknown }
      if (raw.ok !== true || !(raw.bytes instanceof Uint8Array)) {
        const error = typeof raw.error === 'string' ? raw.error : 'the editor returned no document'
        settle(() => reject(new Error(error)))
        return
      }
      hwpToText(raw.bytes).then(
        (text) => settle(() => resolve(text)),
        (error: unknown) =>
          settle(() => reject(error instanceof Error ? error : new Error(String(error)))),
      )
    })
    contents.send(HWP_CHANNELS.readBytesRequest)
  })
  readTextInFlight.set(wcId, request)
  return request
}

function settleSave(wcId: number, ok: boolean): void {
  const waiter = saveWaiters.get(wcId)
  saveWaiters.delete(wcId)
  waiter?.(ok)
}

let ipcRegistered = false

function registerHwpIpc(): void {
  // every view calls this; the channels are registered once, by the first
  if (ipcRegistered) return
  ipcRegistered = true
  registerHwpAttachmentIpc()
  installHwpRecovery(recoveryHost)
  registerHwpRecoveryIpc()

  ipcMain.handle(HWP_CHANNELS.consumePending, (e) => {
    noteHwpPathConsumed(e.sender.id)
    return openPathByWc.get(e.sender.id) ?? null
  })
  ipcMain.handle(HWP_CHANNELS.untitledCopy, (e) => untitledCopyByWc.get(e.sender.id) ?? null)

  ipcMain.handle(HWP_CHANNELS.readFile, async (e, path: unknown) => {
    if (typeof path !== 'string' || !allowedByWc.get(e.sender.id)?.has(path)) {
      throw new Error('hwp: path not granted to this view')
    }
    // a recovery copy left for this file is settled before any content reaches the editor
    const restored = await hwpRecoveryOnRead(e.sender, path)
    const info = await stat(path)
    if (info.size > MAX_HWP_SAVE_BYTES) throw new Error('hwp: file is too large to open')
    let bytes: Uint8Array = await readFile(path)
    // the document the view holds from now on is this file: what is kept follows it (a
    // restored copy included: its saves correct against the file at its path)
    const wcId = e.sender.id
    await rememberDiskState(wcId, path)
    trackedByWc.delete(wcId)
    trackingDroppedByWc.delete(wcId)
    if (bytesMatchFormat(bytes, 'hwp') && hasTrackedChanges(bytes)) {
      // the editor gets the document as it reads now; one that cannot be had is not saved
      const current = withoutTrackedChanges(bytes)
      if (current) {
        bytes = current
        trackingDroppedByWc.add(wcId)
      } else {
        trackedByWc.add(wcId)
      }
    }
    const tails = bytesMatchFormat(bytes, 'hwp') ? sectionTailsOf(bytes) : null
    if (tails) tailsByWc.set(e.sender.id, tails)
    else tailsByWc.delete(e.sender.id)
    const kinds = bytesMatchFormat(bytes, 'hwp') ? fieldKindsOf(bytes) : null
    if (kinds) fieldKindsByWc.set(e.sender.id, kinds)
    else fieldKindsByWc.delete(e.sender.id)
    return restored ?? bytes
  })

  ipcMain.handle(HWP_CHANNELS.trackingDropped, (e) => trackingDroppedByWc.has(e.sender.id))

  /** one print or PDF at a time per view */
  const printing = new Set<number>()
  ipcMain.handle(HWP_CHANNELS.printPages, async (e, job: unknown): Promise<PrintResult> => {
    const wcId = e.sender.id
    const bad = badJob(job)
    if (bad) return { ok: false, error: `hwp: ${bad}` }
    if (printing.has(wcId)) return { ok: false, error: 'hwp: already printing' }
    printing.add(wcId)
    try {
      const printJob = job as PrintJob
      if (printJob.mode === 'print') {
        await printJobToPrinter(printJob, printWindow)
        return { ok: true }
      }
      const win =
        BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined
      const current = savePathByWc.get(wcId)
      const picked = await showSaveDialogWithMemory(dialog, win, {
        title: tm('dlgExportPdfTitle'),
        defaultPath: join(
          current ? dirname(current) : configuredDefaultSaveDir(app),
          pdfName(wcId),
        ),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (picked.canceled || !picked.filePath) return { ok: true, canceled: true }
      const target = /.pdf$/i.test(picked.filePath) ? picked.filePath : `${picked.filePath}.pdf`
      const pdf = await printJobToPdf(printJob, printWindow)
      await atomicWriteFile(target, pdf)
      try {
        if (!runtime.openGeneratedPath?.(target)) shell.showItemInFolder(target)
      } catch (err) {
        console.warn('[hwp] could not open the exported PDF:', err)
      }
      return { ok: true, path: target }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      printing.delete(wcId)
    }
  })

  ipcMain.handle(HWP_CHANNELS.beginSave, async (e, mode: unknown): Promise<BeginSaveResult> => {
    const wcId = e.sender.id
    pendingSaveByWc.delete(wcId)
    // before any dialog: under no name and in no format
    if (trackedByWc.has(wcId)) {
      settleSave(wcId, false)
      return { ok: false, error: 'hwp: the document has tracked changes', reason: 'tracked' }
    }
    try {
      const current = savePathByWc.get(wcId)
      const currentFormat = current ? hwpFormatOfPath(current) : null
      let target: string
      if (mode !== 'saveAs' && current && currentFormat) {
        target = current
      } else {
        const win =
          BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined
        const copy = untitledCopyByWc.get(wcId)
        const fallback: HwpFormat = currentFormat ?? copy?.format ?? 'hwp'
        const hwp = { name: tm('filterHwp'), extensions: ['hwp'] }
        const hwpx = { name: tm('filterHwpx'), extensions: ['hwpx'] }
        const picked = await showSaveDialogWithMemory(dialog, win, {
          title: tm('dlgSaveTitle'),
          // a new document has no file yet: it is offered under the untitled name in the
          // default save folder, where the shell moves it into the folder it was made from
          defaultPath: current
            ? join(dirname(current), basename(current))
            : // a copy restored without its file is offered where that file was
              (hwpRecoverySaveAsDefault(wcId) ??
              join(configuredDefaultSaveDir(app), copy?.name ?? `${tm('untitledFile')}.hwp`)),
          // one type per format, so the user can pick the other one; the document's
          // own format comes first, so it is the dialog's default type
          filters: fallback === 'hwpx' ? [hwpx, hwp] : [hwp, hwpx],
        })
        if (picked.canceled || !picked.filePath) {
          settleSave(wcId, false)
          return { ok: true, canceled: true }
        }
        target = withFormatExtension(picked.filePath, fallback)
      }
      const format = hwpFormatOfPath(target)
      if (!format) throw new Error('hwp: no save format for this file name')
      pendingSaveByWc.set(wcId, { path: target, format })
      return { ok: true, path: target, format }
    } catch (err) {
      settleSave(wcId, false)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(HWP_CHANNELS.newTabs, (e, data: unknown, format: unknown): TabSpot[] => {
    if (!pendingSaveByWc.has(e.sender.id)) return []
    if (!(data instanceof Uint8Array) || data.length === 0 || data.length > MAX_HWP_SAVE_BYTES) {
      return []
    }
    if ((format !== 'hwp' && format !== 'hwpx') || !bytesMatchFormat(data, format)) return []
    return newTabsOf(data, format)
  })

  ipcMain.handle(
    HWP_CHANNELS.commitSave,
    async (e, data: unknown, tabs: unknown, auto?: unknown): Promise<CommitSaveResult> => {
      const wcId = e.sender.id
      const pending = pendingSaveByWc.get(wcId)
      pendingSaveByWc.delete(wcId)
      const done = (result: CommitSaveResult): CommitSaveResult => {
        settleSave(wcId, result.ok)
        return result
      }
      if (!pending) return done({ ok: false, error: 'hwp: no save in progress' })
      if (!(data instanceof Uint8Array) || data.length === 0 || data.length > MAX_HWP_SAVE_BYTES) {
        return done({ ok: false, error: 'hwp: bad save request' })
      }
      if (!bytesMatchFormat(data, pending.format)) {
        return done({ ok: false, error: `hwp: exported bytes are not a ${pending.format} file` })
      }
      try {
        const target = pending.path
        // split-pane copy pair: when a sibling copy changed the file after this copy
        // read or wrote it, a manual save asks before overwriting and an automatic one
        // stands down quietly; a file open nowhere else saves exactly as before
        // (decision 0036). This runs before the backup and the write, so neither
        // happens when the save is declined.
        const recorded = recordedDiskState(wcId, target)
        // today only tests pass auto: HWP has no autosave yet, so every real
        // save is manual; a future autosave must send the flag through commit-save
        if (auto === true) {
          if (await shouldDeferAutoSave(target, recorded)) {
            return done({ ok: false, error: EXTERNAL_MODIFIED })
          }
        } else {
          const parent =
            BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getFocusedWindow() ?? null
          const verdict = await confirmOverwriteIfConflicted({
            parent,
            path: target,
            recorded,
            lang: getUiLang(),
          })
          if (verdict === 'cancel') return done({ ok: false, error: EXTERNAL_MODIFIED })
        }
        // tabs, field kinds, section tails: the same corrections a recovery copy gets
        const fixed = applySaveFixes(
          data,
          pending.format,
          Array.isArray(tabs) ? (tabs as MeasuredTab[]) : undefined,
          recoveryHost.saveBaseOf(wcId),
        )
        const bytes = fixed.bytes
        const tailsLost = fixed.tailsSkipped !== undefined
        if (tailsLost) {
          console.warn(
            `hwp: master pages or memos were not put back on save (${fixed.tailsSkipped})`,
          )
        }
        const recoveryBefore = hwpRecoveryBeforeSave(wcId)
        const written = writtenByWc.get(wcId) ?? new Set<string>()
        let backupPath: string | undefined
        if (needsBackup(target, existsSync(target), written)) {
          backupPath = backupPathFor(target)
          await copyFile(target, backupPath)
        }
        await atomicWriteFile(target, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
        await rememberDiskState(wcId, target)
        written.add(target)
        writtenByWc.set(wcId, written)
        const isNewPath = savePathByWc.get(wcId) !== target
        savePathByWc.set(wcId, target)
        // an untitled copy is a document with a file from now on
        untitledCopyByWc.delete(wcId)
        // keep the reload path in sync: a stale openPathByWc would make a
        // reloaded renderer load the OLD file and then save it over the new one
        openPathByWc.set(wcId, target)
        const allowed = allowedByWc.get(wcId) ?? new Set<string>()
        allowed.add(target)
        allowedByWc.set(wcId, allowed)
        dirtyByWc.delete(wcId)
        hwpRecoverySaved(wcId, recoveryBefore)
        if (isNewPath) fileSavedHook?.(e.sender, target)
        return done({
          ok: true,
          path: target,
          ...(backupPath ? { backupPath } : {}),
          ...(tailsLost ? { tailsLost: true as const } : {}),
        })
      } catch (err) {
        return done({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    },
  )

  // the editor's File menu: the same requests as Ctrl+S and Ctrl+P, so one path saves
  ipcMain.on(HWP_CHANNELS.fileCommand, (e, command: unknown) => {
    if (command === 'save' || command === 'saveAs') void requestHwpSave(e.sender, command)
    else if (command === 'pdf' || command === 'print') requestHwpPrint(e.sender, command)
  })

  ipcMain.on(HWP_CHANNELS.abortSave, (e) => {
    pendingSaveByWc.delete(e.sender.id)
    settleSave(e.sender.id, false)
  })

  ipcMain.on(HWP_CHANNELS.dirtyChanged, (e, dirty: unknown) => {
    if (dirty === true) dirtyByWc.add(e.sender.id)
    else dirtyByWc.delete(e.sender.id)
  })

  ipcMain.on(HWP_CHANNELS.closeSaveResult, (e, ok: unknown) => {
    const waiter = closeSaveWaiters.get(e.sender.id)
    closeSaveWaiters.delete(e.sender.id)
    waiter?.(ok === true)
  })

  ipcMain.on(HWP_CHANNELS.readBytesResult, (e, result: unknown) => {
    readBytesWaiters.get(e.sender.id)?.(result)
  })

  // Language channel shared with other modules; removeHandler tolerates duplicate registration
  ipcMain.removeHandler(HWP_CHANNELS.getLanguage)
  ipcMain.handle(HWP_CHANNELS.getLanguage, () => getUiLang())
}

/**
 * The editor runs in an iframe that swallows Ctrl+O, Ctrl+Shift+H, Ctrl+S and Ctrl+P
 * before the page or the application menu can see them, so the shortcuts are taken
 * here, ahead of both. Those the shell owns are skipped when the shell passed no
 * action for them, which leaves the menu accelerator to do its work.
 */
function installFileShortcuts(wc: WebContents): void {
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return
    if (input.alt) {
      if (hancomFileKey(wc, input)) event.preventDefault()
      return
    }
    const mod = process.platform === 'darwin' ? input.meta : input.control
    if (!mod) return
    if (input.code === 'KeyO' && !input.shift) {
      if (!runtime.openFileDialog) return
      event.preventDefault()
      runtime.openFileDialog()
      return
    }
    if (input.code === 'KeyH' && input.shift) {
      if (!runtime.goHome) return
      event.preventDefault()
      // in a table cell it is Hangul's horizontal sum; the editor says whether it took it
      void editorTakes(wc, 'ctrl-shift-h').then((taken) => {
        if (!taken) runtime.goHome?.()
      })
      return
    }
    if (input.code === 'KeyP' && !input.shift) {
      event.preventDefault()
      requestHwpPrint(wc, 'print')
      return
    }
    if (input.code !== 'KeyS') return
    event.preventDefault()
    if (!input.shift) {
      void requestHwpSave(wc, 'save')
      return
    }
    // in a block of cells it is Hangul's block sum, elsewhere "save as" as in the other editors
    void editorTakes(wc, 'ctrl-shift-s').then((taken) => {
      if (!taken) void requestHwpSave(wc, 'saveAs')
    })
  })
}

/**
 * Hangul's file keys, Alt+N/O/S/V/P: new, open, save, save as, print (decision 0060). Not on a
 * Mac, where Option with a letter types a character. True when the key was one of them.
 */
export function hancomFileKey(
  wc: WebContents,
  input: Pick<Electron.Input, 'code' | 'shift' | 'control' | 'meta'>,
): boolean {
  if (process.platform === 'darwin' || input.shift || input.control || input.meta) return false
  switch (input.code) {
    case 'KeyN':
      if (!runtime.newDocument) return false
      runtime.newDocument()
      return true
    case 'KeyO':
      if (!runtime.openFileDialog) return false
      runtime.openFileDialog()
      return true
    case 'KeyS':
      void requestHwpSave(wc, 'save')
      return true
    case 'KeyV':
      void requestHwpSave(wc, 'saveAs')
      return true
    case 'KeyP':
      requestHwpPrint(wc, 'print')
      return true
    default:
      return false
  }
}

/**
 * Asks the editor frame whether a key the main process took is one of Hangul's table keys there
 * (studio-plugin/hancom-keys.mjs, MAIN_PROCESS_KEYS), and lets it run the table command if so.
 * False when the frame cannot say: the key then does what it does in the app.
 */
async function editorTakes(
  wc: WebContents,
  key: 'ctrl-shift-s' | 'ctrl-shift-h',
): Promise<boolean> {
  if (wc.isDestroyed()) return false
  const frame = wc.mainFrame?.framesInSubtree.find((f) => /\/studio\//.test(f.url))
  if (!frame) return false
  try {
    const taken = await frame.executeJavaScript(
      `typeof window.__ieumHancomKey === 'function' && window.__ieumHancomKey(${JSON.stringify(key)}) === true`,
    )
    return taken === true
  } catch {
    return false
  }
}

function grantAndTrack(
  wc: WebContents,
  openPath?: string | null,
  options: HwpViewOptions = {},
): void {
  const wcId = wc.id
  // first: its close settles the recovery copy while the view's state is still here
  trackHwpRecovery(wc)
  if (openPath && existsSync(openPath)) {
    openPathByWc.set(wcId, openPath)
    allowedByWc.set(wcId, new Set([openPath]))
    if (options.untitledCopy) {
      untitledCopyByWc.set(wcId, {
        name: basename(openPath),
        format: hwpFormatOfPath(openPath) ?? 'hwp',
      })
    } else {
      savePathByWc.set(wcId, openPath)
    }
  }
  installFileShortcuts(wc)
  // the embedded editor vetoes unload while it holds unsaved edits; closing is decided by
  // requestHwpClose, which has already asked the user by the time the page unloads
  wc.on('will-prevent-unload', (event) => event.preventDefault())
  wc.setWindowOpenHandler(({ url }) => {
    const target = safeExternalUrl(url, { allowedProtocols: ['http:', 'https:', 'mailto:'] })
    if (target) void shell.openExternal(target)
    return { action: 'deny' }
  })
  wc.once('destroyed', () => {
    openPathByWc.delete(wcId)
    allowedByWc.delete(wcId)
    savePathByWc.delete(wcId)
    untitledCopyByWc.delete(wcId)
    dirtyByWc.delete(wcId)
    pendingSaveByWc.delete(wcId)
    writtenByWc.delete(wcId)
    tailsByWc.delete(wcId)
    fieldKindsByWc.delete(wcId)
    trackedByWc.delete(wcId)
    trackingDroppedByWc.delete(wcId)
    diskStatesByWc.delete(wcId)
    closeSaveWaiters.get(wcId)?.(false)
    closeSaveWaiters.delete(wcId)
    settleSave(wcId, false)
  })
}

export interface HwpViewOptions {
  /**
   * `openPath` is a copy to open as a new, untitled document (a skill
   * template's, spec 5.7): it is read like a file, saved like a new document.
   */
  untitledCopy?: boolean | undefined
}

export function createHwpView(
  openPath?: string | null,
  options: HwpViewOptions = {},
): WebContentsView {
  registerHwpIpc()
  const view = new WebContentsView({
    webPreferences: {
      preload: runtime.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  grantAndTrack(view.webContents, openPath, options)
  void view.webContents.loadURL(rendererUrl(runtime.rendererUrl, 'hwp'))
  return view
}

/** Standalone window mode: `npm run dev -w @genoffice/hwp`, document path passed via argv */
export function startHwpStandalone(): void {
  registerRendererScheme()
  installNavigationGuard(app)
  installContextMenu(app, () => contextMenuLabels(getUiLang()))
  configureHwpRuntime({
    preloadPath: join(__dirname, '../preload/index.js'),
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    rendererFile: join(__dirname, '../renderer/index.html'),
  })
  void app.whenReady().then(() => {
    installRendererProtocol({ hwp: join(__dirname, '../renderer') })
    registerHwpIpc()
    const win = new BrowserWindow({
      width: 1280,
      height: 900,
      webPreferences: {
        preload: runtime.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    const argPath = process.argv.slice(1).find((a) => /\.hwpx?$/i.test(a) && existsSync(a))
    grantAndTrack(win.webContents, argPath)
    void win.loadURL(rendererUrl(runtime.rendererUrl, 'hwp'))
  })
  app.on('window-all-closed', () => app.quit())
}

/**
 * Crash recovery, for the shell: a tool closed the document without saving (its copy
 * goes, as with "Don't Save"); a tab's copy slot; the title a new document's copy is
 * listed under.
 */
export {
  hwpRecoveryDontSave as hwpDiscardRecoveryCopy,
  hwpRecoveryIdentity,
  setHwpRecoveryTitle,
} from './recovery'
