/// The editors' preloads expose the same document picker. Answers cross
/// contextBridge as plain data; a lone editor with no shell behind it gets
/// `false` / `unavailable` instead of a thrown error.
import { ipcRenderer } from 'electron'
import { DOC_ATTACH_CHANNELS } from './doc-attach-channels'

export type DocAttachFail = 'cancelled' | 'busy' | 'unavailable'
export type DocAttachResult = { ok: true; paths: string[] } | { ok: false; reason: DocAttachFail }

/**
 * where a listed document comes from: the other split pane, an open tab, the
 * files of the panel's project (spec 5.13), or the recent list
 */
export type DocMentionGroup = 'pane' | 'open' | 'project' | 'recent'
/** ok: can be picked / modified: saved but has unsaved changes / unsaved: never saved */
export type DocMentionState = 'ok' | 'modified' | 'unsaved'

export interface DocMentionItem {
  /** the saved document's path; null for a new document that was never saved */
  path: string | null
  /** file name with its extension; a never-saved document's tab name */
  name: string
  /** the containing folder, for display; '' when there is none */
  dir: string
  group: DocMentionGroup
  state: DocMentionState
}

export type DocMentionListResult =
  { ok: true; items: DocMentionItem[] } | { ok: false; reason: 'unavailable' }

export interface DocAttachBridge {
  /** is the shell answering this editor's requests? */
  available(): Promise<boolean>
  /** opens the "documents I already know" picker; resolves with the paths, or why not */
  pick(): Promise<DocAttachResult>
  /** the `@` list for the asking editor: its own document left out, missing files hidden */
  list(): Promise<DocMentionListResult>
}

const listUnavailable = (): DocMentionListResult => ({ ok: false, reason: 'unavailable' })

/** Accept only `{ ok: true, items: [...] }`; anything else reads as unavailable. */
function listResultOf(raw: unknown): DocMentionListResult {
  if (!raw || typeof raw !== 'object') return listUnavailable()
  const r = raw as { ok?: unknown; items?: unknown }
  if (r.ok !== true || !Array.isArray(r.items)) return listUnavailable()
  return raw as DocMentionListResult
}

export function docAttachBridge(): DocAttachBridge {
  return {
    available: async () =>
      (await ipcRenderer.invoke(DOC_ATTACH_CHANNELS.available).catch(() => false)) === true,
    pick: () =>
      ipcRenderer
        .invoke(DOC_ATTACH_CHANNELS.pick)
        .catch((): DocAttachResult => ({ ok: false, reason: 'unavailable' })),
    list: () => ipcRenderer.invoke(DOC_ATTACH_CHANNELS.list).then(listResultOf, listUnavailable),
  }
}
