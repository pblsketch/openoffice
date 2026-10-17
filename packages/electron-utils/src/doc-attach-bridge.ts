/// The editors' preloads expose the same document picker. Answers cross
/// contextBridge as plain data; a lone editor with no shell behind it gets
/// `false` / `unavailable` instead of a thrown error.
import { ipcRenderer } from 'electron'
import { DOC_ATTACH_CHANNELS } from './doc-attach-channels'

export type DocAttachFail = 'cancelled' | 'busy' | 'unavailable'
export type DocAttachResult = { ok: true; paths: string[] } | { ok: false; reason: DocAttachFail }

export interface DocAttachBridge {
  /** is the shell answering this editor's requests? */
  available(): Promise<boolean>
  /** opens the "documents I already know" picker; resolves with the paths, or why not */
  pick(): Promise<DocAttachResult>
}

export function docAttachBridge(): DocAttachBridge {
  return {
    available: async () =>
      (await ipcRenderer.invoke(DOC_ATTACH_CHANNELS.available).catch(() => false)) === true,
    pick: () =>
      ipcRenderer
        .invoke(DOC_ATTACH_CHANNELS.pick)
        .catch((): DocAttachResult => ({ ok: false, reason: 'unavailable' })),
  }
}
