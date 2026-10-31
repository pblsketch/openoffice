/**
 * Which editor is asking for the document list, read from the webContents that
 * sent the request. An in-window tab is looked up first, then a detached
 * window. For a tab that is one of the two split panes, the other pane is its
 * neighbour; a detached window has none. A sender that is neither (not an
 * editor the shell knows) is not an error: it gets an empty asker, so nothing
 * is left out and there is no pane group.
 */

export interface DocAsker {
  /** the asking webContents (the shell adds it; the panel's project is read from it) */
  webContentsId?: number
  /** the asking tab's id (`detached:<wcId>` for a detached window) */
  tabId?: string
  /** the asking document's saved path */
  path?: string
  /** the tab shown in the other split pane */
  paneTabId?: string
}

export interface DocAskerSources {
  /** the in-window tab hosting this webContents */
  tabFor(webContentsId: number): { id: string; filePath?: string } | undefined
  /** the live split, or null when the view is not split */
  split(): { aTabId: string; bTabId: string } | null
  /** the detached window hosting this webContents */
  detachedFor(webContentsId: number): { id: string; filePath?: string } | undefined
}

export function resolveDocAsker(webContentsId: number, sources: DocAskerSources): DocAsker {
  const tab = sources.tabFor(webContentsId)
  if (tab) {
    const split = sources.split()
    const paneTabId =
      split?.aTabId === tab.id ? split.bTabId : split?.bTabId === tab.id ? split.aTabId : undefined
    return {
      tabId: tab.id,
      ...(tab.filePath ? { path: tab.filePath } : {}),
      ...(paneTabId ? { paneTabId } : {}),
    }
  }
  const detached = sources.detachedFor(webContentsId)
  if (detached) {
    return { tabId: detached.id, ...(detached.filePath ? { path: detached.filePath } : {}) }
  }
  return {}
}
