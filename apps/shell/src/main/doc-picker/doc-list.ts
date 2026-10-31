/**
 * The document list the shell hands out, built for the editor that asked: the
 * document in the other split pane, then the other open tabs and detached
 * windows, then (for the `@` list, when the asker's panel has a project) the
 * newest files of that project (spec 5.13), then recently opened files. The asking tab and every copy of its
 * file are left out. Only files an editor may attach are kept (a known
 * extension, under the size cap) and one row is kept per path, the earlier
 * group winning; paths are compared the way the shell compares open paths
 * (resolved, case-insensitive). A document never saved is `unsaved`; a saved
 * one that has unsaved changes in any open copy is `modified`; neither can be
 * picked. No file contents are read — only the path, its size and the name the
 * shell already has.
 *
 * The same list feeds the "Attach a document" window (missing files stay,
 * greyed) and the AI panel's `@` list (`toMentionItems`, missing files hidden).
 */
import { basename, dirname, extname, resolve } from 'node:path'
import type { DocMentionItem } from '@genoffice/electron-utils/doc-attach-bridge'
import type { DocListItem, DocListResult } from '../../shared/doc-picker-api'
import type { DocAsker } from './doc-asker'

export interface OpenDocumentEntry {
  id: string
  path?: string
  title: string
  dirty: boolean
}

export interface RecentDocumentEntry {
  path: string
  title: string
  missing: boolean
}

/** the shared values from `@genoffice/file-parse`, injected by the caller */
export interface AttachableFormats {
  ATTACHABLE_EXTS: ReadonlySet<string>
  ATTACHABLE_IMAGE_EXTS: ReadonlySet<string>
  ATTACHABLE_MAX_BYTES: number
  ATTACHABLE_IMAGE_MAX_BYTES: number
}

export interface DocListDeps {
  openDocuments(): Promise<OpenDocumentEntry[]>
  recent(): Promise<RecentDocumentEntry[]>
  /**
   * The AI-visible files of the asker's project, newest first; [] without one.
   * Only the `@` list asks (`DocListOptions.projectFiles`).
   */
  projectFiles?(asker: DocAsker): Promise<Array<{ path: string; title: string }>>
  stat(path: string): Promise<{ sizeBytes: number } | null>
  attachable: AttachableFormats
}

export interface DocListOptions {
  /** add the "files of this project" group (the `@` list only) */
  projectFiles?: boolean
}

/** how the shell compares open paths (see `isOpen` in index.ts) */
const pathKey = (path: string): string => resolve(path).toLowerCase()

export function createDocList(
  deps: DocListDeps,
): (asker?: DocAsker, options?: DocListOptions) => Promise<DocListResult> {
  const extOf = (path: string): string => extname(path).replace(/^\./, '').toLowerCase()

  const capFor = (ext: string): number =>
    deps.attachable.ATTACHABLE_IMAGE_EXTS.has(ext)
      ? deps.attachable.ATTACHABLE_IMAGE_MAX_BYTES
      : deps.attachable.ATTACHABLE_MAX_BYTES

  return async (asker: DocAsker = {}, options: DocListOptions = {}) => {
    const items: DocListItem[] = []
    const seen = new Set<string>()
    const askerKey = asker.path ? pathKey(asker.path) : null

    const open = await deps.openDocuments()
    // a path with unsaved changes in any open copy is not the saved file
    const dirtyKeys = new Set<string>()
    for (const doc of open) if (doc.path && doc.dirty) dirtyKeys.add(pathKey(doc.path))

    const include = async (
      path: string,
      title: string,
      group: DocListItem['group'],
      knownMissing: boolean,
    ): Promise<void> => {
      const key = pathKey(path)
      if (key === askerKey || seen.has(key)) return
      const ext = extOf(path)
      if (!deps.attachable.ATTACHABLE_EXTS.has(ext)) return
      const info = knownMissing ? null : await deps.stat(path)
      if (info && info.sizeBytes > capFor(ext)) return
      seen.add(key)
      const dir = dirname(path)
      items.push({
        id: path,
        title,
        dir: dir === '.' ? '' : dir,
        state: !info ? 'missing' : dirtyKeys.has(key) ? 'modified' : 'ok',
        group,
      })
    }

    const includeOpen = async (doc: OpenDocumentEntry, group: DocListItem['group']) => {
      if (!doc.path) {
        items.push({
          id: `unsaved:${doc.id}`,
          title: doc.title,
          dir: '',
          state: 'unsaved',
          group,
        })
        return
      }
      await include(doc.path, doc.title, group, false)
    }

    const others = open.filter((doc) => doc.id !== asker.tabId)
    const pane = asker.paneTabId ? others.find((doc) => doc.id === asker.paneTabId) : undefined
    if (pane) await includeOpen(pane, 'pane')
    for (const doc of others) if (doc !== pane) await includeOpen(doc, 'open')

    if (options.projectFiles && deps.projectFiles) {
      let files: Array<{ path: string; title: string }>
      try {
        files = await deps.projectFiles(asker)
      } catch {
        files = []
      }
      for (const file of files) await include(file.path, file.title, 'project', false)
    }

    for (const doc of await deps.recent()) {
      await include(doc.path, doc.title, 'recent', doc.missing)
    }

    return { ok: true, items }
  }
}

/**
 * The `@` list rows: a saved document is named by its file name, a never-saved
 * one by its tab title (no path). Missing files are left out of this list.
 */
export function toMentionItems(items: readonly DocListItem[]): DocMentionItem[] {
  const out: DocMentionItem[] = []
  for (const item of items) {
    if (item.state === 'missing') continue
    out.push(
      item.state === 'unsaved'
        ? { path: null, name: item.title, dir: item.dir, group: item.group, state: 'unsaved' }
        : {
            path: item.id,
            name: basename(item.id),
            dir: item.dir,
            group: item.group,
            state: item.state,
          },
    )
  }
  return out
}
