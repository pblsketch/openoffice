/**
 * The `@` document list the shell hands an editor's AI panel, as the renderer
 * sees it through `window.aiOfficeDocs.list()`. The renderer does not import
 * `@genoffice/electron-utils`, so these mirror the shapes declared in
 * `packages/electron-utils/src/doc-attach-bridge.ts`; keep the two in step.
 */

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
