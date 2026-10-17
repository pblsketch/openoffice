/**
 * The list behind the "Attach a document" window: the documents the shell
 * already knows about — currently open tabs, then recently opened files — in
 * the order the shell gives them. Only files an editor may attach are kept
 * (a known extension, under the size cap) and one item is kept per path, the
 * open one winning over the recent one. A path decides "saved"; the dirty flag
 * does not. No file contents are read — only the path, its size and the name
 * the shell already has.
 */
import { dirname, extname } from 'node:path'
import type { DocListItem, DocListResult } from '../../shared/doc-picker-api'

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
  stat(path: string): Promise<{ sizeBytes: number } | null>
  attachable: AttachableFormats
}

export function createDocList(deps: DocListDeps): () => Promise<DocListResult> {
  const extOf = (path: string): string => extname(path).replace(/^\./, '').toLowerCase()

  const capFor = (ext: string): number =>
    deps.attachable.ATTACHABLE_IMAGE_EXTS.has(ext)
      ? deps.attachable.ATTACHABLE_IMAGE_MAX_BYTES
      : deps.attachable.ATTACHABLE_MAX_BYTES

  return async () => {
    const items: DocListItem[] = []
    const seen = new Set<string>()

    const include = async (
      path: string,
      title: string,
      group: DocListItem['group'],
      knownMissing: boolean,
    ): Promise<void> => {
      if (seen.has(path)) return
      const ext = extOf(path)
      if (!deps.attachable.ATTACHABLE_EXTS.has(ext)) return
      const info = knownMissing ? null : await deps.stat(path)
      if (info && info.sizeBytes > capFor(ext)) return
      seen.add(path)
      const dir = dirname(path)
      items.push({
        id: path,
        title,
        dir: dir === '.' ? '' : dir,
        state: info ? 'ok' : 'missing',
        group,
      })
    }

    for (const doc of await deps.openDocuments()) {
      if (!doc.path) {
        items.push({
          id: `unsaved:${doc.id}`,
          title: doc.title,
          dir: '',
          state: 'unsaved',
          group: 'open',
        })
        continue
      }
      await include(doc.path, doc.title, 'open', false)
    }

    for (const doc of await deps.recent()) {
      await include(doc.path, doc.title, 'recent', doc.missing)
    }

    return { ok: true, items }
  }
}
