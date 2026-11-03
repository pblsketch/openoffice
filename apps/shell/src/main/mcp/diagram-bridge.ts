import type { WebContents } from 'electron'
import type { OpenDocumentTab } from '../../shared/tabs-api'
import type { DiagramControl, DiagramPageReadAnswer } from './tools/diagram-tools'

/**
 * The shell's implementation of the diagram tools' control: the open-document
 * list plus the diagram editor's own questions (`apps/diagram`'s
 * `mcp-queries.ts`), addressed by the tab's webContents. A restored tab that
 * is not loaded yet is loaded first (`webContentsFor`), as for open_documents.
 */

type MaybePromise<T> = T | Promise<T>

export interface DiagramBridgeDeps {
  /** the tab-manager's open-document list plus detached windows */
  list: () => Promise<OpenDocumentTab[]>
  /** the tab's webContents; loads a restored tab first (see OpenDocumentsBridgeDeps) */
  webContentsFor: (tabId: string) => MaybePromise<WebContents | undefined>
  /** true for a document in a detached window */
  isDetached?: (tabId: string) => boolean
  /** switch to the tab, so the user sees the diagram the agent is about to change */
  activate?: (tabId: string) => void
  /** bring the window hosting the tab forward */
  revealWindow?: (tabId: string) => void
  /** the editor's read table: one page, or the page on screen when `page` is left out */
  readPage: (contents: WebContents, page?: string) => Promise<DiagramPageReadAnswer>
  /** the editor's executor: plan and apply as one undo step, all or nothing */
  applyOps: (contents: WebContents, ops: unknown[]) => Promise<unknown>
}

export function createDiagramControl(deps: DiagramBridgeDeps): DiagramControl {
  const contentsOf = async (tab: OpenDocumentTab): Promise<WebContents> => {
    const contents = await deps.webContentsFor(tab.id)
    if (!contents || contents.isDestroyed()) throw new Error(`"${tab.title}" is no longer open`)
    return contents
  }

  return {
    list: deps.list,
    ...(deps.isDetached ? { isDetached: deps.isDetached } : {}),
    read: async (tab, page) => deps.readPage(await contentsOf(tab), page),
    apply: async (tab, ops) => {
      const contents = await contentsOf(tab)
      if (!tab.active) {
        // Showing the tab is a courtesy, not part of the edit: a UI failure here
        // must not fail the change the caller asked for.
        try {
          deps.activate?.(tab.id)
          deps.revealWindow?.(tab.id)
        } catch (error) {
          console.warn('[mcp] could not bring the diagram into view:', error)
        }
      }
      return deps.applyOps(contents, ops)
    },
  }
}
