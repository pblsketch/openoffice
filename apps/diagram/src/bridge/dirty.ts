/**
 * Which step of draw.io's undo history stands for the diagram's content
 * (spec 3.2: an unchanged diagram is never written again).
 *
 * draw.io records some view-only steps in the undo history: showing another
 * page is one (`EditorUi.selectPage` adds a `SelectPage` step so that undo
 * walks back across pages). It marks such a step `ignoreEdit`, and its own
 * "modified" tracking skips it; the dirty mark here does the same. Zoom,
 * scrolling and the selection never enter the history.
 */

/** The parts of draw.io's `mxUndoManager` read here. */
export interface UndoHistoryLike {
  history: readonly unknown[]
  indexOfNextAdd: number
}

/** Whether an undo step only changes the view (the page shown), not the diagram. */
export function isViewOnlyEdit(edit: unknown): boolean {
  return (
    typeof edit === 'object' &&
    edit !== null &&
    (edit as { ignoreEdit?: unknown }).ignoreEdit === true
  )
}

/**
 * The newest step up to the current undo position that changes the diagram,
 * or null when every step before it only changed the view (or there is none).
 * Two positions with the same answer hold the same content.
 */
export function lastContentEdit(manager: UndoHistoryLike | null | undefined): unknown {
  if (!manager) return null
  for (let i = Math.min(manager.indexOfNextAdd, manager.history.length) - 1; i >= 0; i--) {
    const edit = manager.history[i]
    if (edit != null && !isViewOnlyEdit(edit)) return edit
  }
  return null
}
