import { ipcMain } from 'electron'
import { applySaveFixes } from './save-fixes'
import type { SaveBase } from './save-fixes'
import { bytesMatchFormat } from './save-plan'
import { HWP_CHANNELS, MAX_HWP_SAVE_BYTES } from '../shared/ipc'

/**
 * LAN co-editing (decision 0073): a shared document goes to guests as what a save
 * would write now, so the engine's export gets the corrections against the opened
 * file that a save and a recovery copy get. Nothing is written here. The new tabs'
 * widths are left out: they need the editor to measure them, and the guest's own
 * save measures them again.
 */
export function registerHwpCollabIpc(saveBaseOf: (wcId: number) => SaveBase): void {
  ipcMain.handle(HWP_CHANNELS.collabBase, (e, data: unknown, format: unknown): Uint8Array => {
    if (!(data instanceof Uint8Array) || data.length === 0 || data.length > MAX_HWP_SAVE_BYTES) {
      throw new Error('hwp: bad document to share')
    }
    if ((format !== 'hwp' && format !== 'hwpx') || !bytesMatchFormat(data, format)) {
      throw new Error(`hwp: the document to share is not a ${String(format)} file`)
    }
    return applySaveFixes(data, format, undefined, saveBaseOf(e.sender.id)).bytes
  })
}
