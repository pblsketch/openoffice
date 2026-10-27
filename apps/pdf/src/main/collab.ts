/**
 * Co-editing (decision 0073) as the PDF main process sees it. A guest tab
 * shows a temp copy the shell opened as an untitled copy; it never saves,
 * and the copy is rewritten with each file the host saves so the guest's
 * page and object addresses stay those of the host's file.
 */
import { ipcMain } from 'electron'
import { COLLAB_MAX_BASE_BYTES } from '@genoffice/electron-utils/collab-channels'
import { PDF_CHANNELS } from '../shared/ipc'

/** views that are guests in a live session, by webContents id */
const guests = new Set<number>()

/** a guest in a live session: its save requests are refused and a menu Save asks it why */
export function isPdfCollabGuest(webContentsId: number): boolean {
  return guests.has(webContentsId)
}

export function forgetPdfCollabGuest(webContentsId: number): void {
  guests.delete(webContentsId)
}

/** where a PDF header may start (the spec allows leading bytes before it) */
const HEADER_WINDOW = 1024

/** the host's saved file, or null for anything that is not a PDF of a size a session carries */
export function collabCopyBytesOf(raw: unknown): Uint8Array | null {
  if (!(raw instanceof Uint8Array) || raw.byteLength > COLLAB_MAX_BASE_BYTES) return null
  const head = Buffer.from(raw.buffer, raw.byteOffset, Math.min(raw.byteLength, HEADER_WINDOW))
  return head.includes('%PDF-') ? raw : null
}

export interface PdfCollabIpcDeps {
  /** `path` is the untitled copy this view shows */
  ownCopy(webContentsId: number, path: unknown): path is string
  replace(webContentsId: number, path: string, bytes: Uint8Array): Promise<void>
}

export function registerPdfCollabIpc(deps: PdfCollabIpcDeps): void {
  ipcMain.on(PDF_CHANNELS.collabGuest, (e, guest: unknown) => {
    if (guest === true) guests.add(e.sender.id)
    else guests.delete(e.sender.id)
  })

  ipcMain.handle(
    PDF_CHANNELS.collabReplaceCopy,
    async (e, path: unknown, raw: unknown): Promise<boolean> => {
      const bytes = collabCopyBytesOf(raw)
      if (!guests.has(e.sender.id) || !bytes || !deps.ownCopy(e.sender.id, path)) return false
      try {
        await deps.replace(e.sender.id, path, bytes)
        return true
      } catch (err) {
        console.error('[pdf] the shared file could not replace the guest copy:', err)
        return false
      }
    },
  )
}
