/**
 * The "Attach from documents" window: an editor's AI panel asks the shell for
 * documents it already knows, the shell opens this window above the window that
 * asked, the person ticks open or recent documents, and the shell validates the
 * ids, resolves them to paths, and hands those paths back. One window at a
 * time; closing it cancels. Mirrors the Google Drive picker window (0033).
 */
import { join } from 'node:path'
import { BrowserWindow, ipcMain, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { productName, type Lang } from '@genoffice/i18n'
import { safeExternalUrl } from '@genoffice/electron-utils'
import { DOC_ATTACH_CHANNELS } from '@genoffice/electron-utils/doc-attach-channels'
import type { DocAttachResult } from '@genoffice/electron-utils/doc-attach-bridge'
import {
  DOC_PICKER_CHANNELS,
  type DocListItem,
  type DocListResult,
  type DocPickerChooseResult,
  type DocPickerInit,
  type DocPickerTheme,
} from '../../shared/doc-picker-api'
import { docPickerText } from '../../renderer/src/i18n/strings-doc-picker'

export interface DocPickerDeps {
  /** the listing built from the shell's open tabs and recent files */
  list: () => Promise<DocListResult>
  lang: () => Lang
  theme: () => DocPickerTheme
}

/** the plan caps one attach at 20 documents; ids past it are ignored */
const MAX_PICKS = 20
/** a path (the only id an attachable item carries) is longer than a Drive file id */
const MAX_ID_LENGTH = 4096

/**
 * Keep only the ids that were in the list just handed out with `state === 'ok'`
 * and map each to its path. A path-id maps to itself. Anything else — not a
 * string, too long, unknown, missing or unsaved — is silently dropped.
 */
function pathsOf(raw: unknown, items: readonly DocListItem[] | null): string[] {
  if (!Array.isArray(raw) || !items) return []
  const attachable = new Set<string>()
  for (const item of items) if (item.state === 'ok') attachable.add(item.id)
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of raw.slice(0, MAX_PICKS)) {
    if (typeof id !== 'string' || id.length > MAX_ID_LENGTH) continue
    if (!attachable.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function createDocPicker(deps: DocPickerDeps) {
  let win: BrowserWindow | null = null
  let settle: ((result: DocAttachResult) => void) | null = null
  /** the items of the list the window last read; ids are validated against it */
  let lastItems: DocListItem[] | null = null

  const fromWindow = (event: IpcMainInvokeEvent) =>
    !!win && !win.isDestroyed() && event.sender === win.webContents

  const finish = (result: DocAttachResult) => {
    const done = settle
    settle = null
    done?.(result)
    if (win && !win.isDestroyed()) win.close()
  }

  ipcMain.handle(DOC_PICKER_CHANNELS.getInit, (event): DocPickerInit | null =>
    fromWindow(event) ? { lang: deps.lang(), theme: deps.theme() } : null,
  )
  ipcMain.handle(DOC_PICKER_CHANNELS.list, async (event): Promise<DocListResult> => {
    if (!fromWindow(event)) return { ok: false, kind: 'unavailable' }
    const result = await deps.list()
    if (result.ok) lastItems = result.items
    return result
  })
  ipcMain.handle(
    DOC_PICKER_CHANNELS.choose,
    (event, raw: unknown): DocPickerChooseResult => {
      if (!fromWindow(event)) return { ok: false, kind: 'unavailable' }
      const paths = pathsOf(raw, lastItems)
      // nothing survived validation: treat it as the person cancelling
      if (paths.length === 0) {
        finish({ ok: false, reason: 'cancelled' })
        return { ok: true }
      }
      finish({ ok: true, paths })
      return { ok: true }
    },
  )
  ipcMain.handle(DOC_PICKER_CHANNELS.cancel, (event) => {
    if (fromWindow(event)) finish({ ok: false, reason: 'cancelled' })
  })

  // ---- an editor's AI panel asks the shell for documents to attach ----
  ipcMain.handle(DOC_ATTACH_CHANNELS.available, (): boolean => true)
  ipcMain.handle(DOC_ATTACH_CHANNELS.pick, (event): Promise<DocAttachResult> => {
    const parent = BrowserWindow.fromWebContents(event.sender)
    // a request whose sender is not a window cannot parent a modal picker
    if (!parent || parent.isDestroyed()) return Promise.resolve({ ok: false, reason: 'unavailable' })
    return open(parent)
  })

  /** Ask the person for documents; resolves when they attach or close the window */
  function open(parent: BrowserWindow | null): Promise<DocAttachResult> {
    if (win && !win.isDestroyed()) {
      // a second asker: the open window stays and comes forward
      win.show()
      win.focus()
      return Promise.resolve({ ok: false, reason: 'busy' })
    }
    const lang = deps.lang()
    const next = new BrowserWindow({
      width: 720,
      height: 640,
      minWidth: 480,
      minHeight: 420,
      ...(parent && !parent.isDestroyed() ? { parent, modal: true } : {}),
      show: false,
      center: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      title: `${docPickerText(lang, 'docPickTitle')} - ${productName(lang)}`,
      webPreferences: {
        preload: join(__dirname, '../preload/doc-picker.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    win = next
    lastItems = null
    next.removeMenu()
    next.webContents.setWindowOpenHandler(({ url }) => {
      const target = safeExternalUrl(url)
      if (target) void shell.openExternal(target)
      return { action: 'deny' }
    })
    const result = new Promise<DocAttachResult>((resolve) => (settle = resolve))
    next.once('ready-to-show', () => next.show())
    next.on('closed', () => {
      if (win === next) win = null
      lastItems = null
      // closing the window is cancelling, unless a result already went out
      const done = settle
      settle = null
      done?.({ ok: false, reason: 'cancelled' })
    })
    if (process.env.ELECTRON_RENDERER_URL) {
      void next.loadURL(`${process.env.ELECTRON_RENDERER_URL}/doc-picker.html`)
    } else {
      void next.loadFile(join(__dirname, '../renderer/doc-picker.html'))
    }
    return result
  }

  return { open, close: () => win?.close() }
}
