/**
 * The Word editor's main-process side of co-editing (decision 0073). A guest
 * tab says so here, and the save and recovery handlers refuse it behind the
 * renderer's own refusal: during a session the host's file is the document.
 * A guest whose copy keeps its pictures out of the bytes (a lazily opened
 * document) gets them served from the host's whole document.
 */
import { ipcMain } from 'electron'
import { serveLazyMediaFrom } from './lazy-media'

const guests = new Set<number>()

/** this tab is a guest in a live session: nothing it sends is written */
export function isDocsCollabGuest(wcId: number): boolean {
  return guests.has(wcId)
}

export function registerDocsCollabIpc(): void {
  ipcMain.handle('docs:collab-guest', (event, on: unknown) => {
    const id = event.sender.id
    if (on !== true) {
      guests.delete(id)
      return
    }
    if (!guests.has(id)) event.sender.once('destroyed', () => guests.delete(id))
    guests.add(id)
  })

  ipcMain.handle('docs:collab-media', (event, hashes: unknown, data: unknown) => {
    if (!guests.has(event.sender.id) || !Array.isArray(hashes) || !(data instanceof ArrayBuffer)) {
      return false
    }
    const named = hashes.filter(
      (h): h is string => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h),
    )
    if (named.length === 0) return false
    serveLazyMediaFrom(named, Buffer.from(data), event.sender.id)
    return true
  })
}
