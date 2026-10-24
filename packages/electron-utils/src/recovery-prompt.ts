/**
 * The per-file recovery prompt: asked when a document with an undecided or
 * "later" recovery copy is opened, before its content is loaded.
 *
 * The box names the document (several restored tabs may ask in turn), offers
 * "Restore" and "Discard", and treats Esc or closing the box as Restore so no
 * unsaved work is lost by dismissing it — a restored document the user does
 * not want is dropped by closing it with "Don't Save". When the file on disk
 * is newer than the copy, a line says so; the copy is never deleted silently.
 *
 * The dialog API is passed in (Electron's `dialog`, or a fake in tests).
 */
import { basename } from 'node:path'
import type { BrowserWindow, Dialog } from 'electron'
import { recoveryPromptLabels } from './recovery-labels'
import {
  isUntitledIdentity,
  type RecoveryCopyInfo,
  type RecoveryIdentity,
  type RecoveryStore,
} from './recovery-store'

export type RecoveryMessageBox = Pick<Dialog, 'showMessageBox'>

export interface RecoveryPromptOptions {
  dialog: RecoveryMessageBox
  /** the window the box sits over; null/undefined or destroyed shows it unparented */
  parent?: BrowserWindow | null | undefined
  /** shown in the message (normally the file name) */
  documentName: string
  /** the file on disk is newer than the copy */
  fileChangedAfterCopy: boolean
  /** UI language (raw locale tags accepted) */
  lang: string
}

const RESTORE = 0
const DISCARD = 1

export async function promptRecoveryForFile(
  options: RecoveryPromptOptions,
): Promise<'restore' | 'discard'> {
  const labels = recoveryPromptLabels(options.lang, options.documentName)
  const box = {
    type: 'question' as const,
    message: labels.message,
    detail: options.fileChangedAfterCopy
      ? `${labels.detail}\n\n${labels.fileChanged}`
      : labels.detail,
    buttons: [labels.restore, labels.discard],
    defaultId: RESTORE,
    // Esc and the window's close button answer cancelId: restore, so nothing is lost
    cancelId: RESTORE,
    noLink: true,
  }
  const parent = options.parent
  const { response } =
    parent && !parent.isDestroyed()
      ? await options.dialog.showMessageBox(parent, box)
      : await options.dialog.showMessageBox(box)
  return response === DISCARD ? 'discard' : 'restore'
}

export interface ResolveRecoveryOnOpenOptions {
  store: RecoveryStore
  identity: RecoveryIdentity
  dialog: RecoveryMessageBox
  parent?: BrowserWindow | null | undefined
  lang: string
  /** defaults to the file name (or the copy's title for an untitled copy) */
  documentName?: string
}

/**
 * - `original`: open the file as saved (no copy, or the copy was discarded).
 * - `restore`: open `bytes` (the copy's content); the original path stays the
 *   tab's path and save base, and the tab starts with unsaved changes.
 */
export type RecoveryOpenResult =
  { action: 'original' } | { action: 'restore'; bytes: Buffer; copy: RecoveryCopyInfo }

/**
 * Everything an editor does about recovery when it opens a document: no copy
 * → original; "restore" already chosen in the launch list → the copy without
 * asking; otherwise the per-file prompt. Restoring marks the copy loaded
 * (undecided again: its content now lives in an open tab); discarding deletes
 * it. A copy that cannot be read falls back to the original and is kept.
 */
export async function resolveRecoveryOnOpen(
  options: ResolveRecoveryOnOpenOptions,
): Promise<RecoveryOpenResult> {
  const { store, identity } = options
  const plan = store.openPlan(identity)
  if (plan.action === 'none') return { action: 'original' }
  if (plan.action === 'ask') {
    const documentName =
      options.documentName ??
      (isUntitledIdentity(identity) ? plan.copy.title : basename(identity.filePath))
    const answer = await promptRecoveryForFile({
      dialog: options.dialog,
      parent: options.parent,
      documentName,
      fileChangedAfterCopy: plan.copy.fileChangedAfterCopy,
      lang: options.lang,
    })
    if (answer === 'discard') {
      store.deleteCopy(identity, 'discarded')
      return { action: 'original' }
    }
  }
  const bytes = await store.readCopy(identity)
  if (!bytes) return { action: 'original' }
  store.markCopyLoaded(identity)
  return { action: 'restore', bytes, copy: plan.copy }
}
