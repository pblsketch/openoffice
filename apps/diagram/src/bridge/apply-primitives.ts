/**
 * Applying the model's primitive changes to the live draw.io diagram as one
 * undo step (spec 7, 8.2: "one tool call is one undo"). The rules live here,
 * apart from draw.io, so they are tested against a fake diagram:
 *
 * - Everything is checked before anything changes: every page and cell a
 *   primitive names must exist at its turn (earlier primitives of the batch
 *   count), a new cell's id must be free and its parent, source and target
 *   must exist. A batch that fails the check changes nothing.
 * - All changes run inside one `beginUpdate()`/`endUpdate()` of the model, so
 *   draw.io records them as one undoable edit.
 * - A cell change on a page that is not on screen switches to that page
 *   inside the same edit (draw.io keeps one live model, the page on screen);
 *   the page that was on screen comes back at the end.
 * - Should draw.io throw half-way, the edit is undone and dropped from the
 *   history: the diagram is as before and no redo is left behind.
 */
import type { DiagramCell, DiagramGeometry, DiagramPrimitive } from '@genoffice/drawio-model'

/** The live diagram, as far as applying primitives needs it. */
export interface LiveDiagram {
  /** the page on screen */
  currentPageId(): string | null
  pageIds(): string[]
  /** the ids of a page's cells (reads a page that is not on screen without showing it) */
  cellIds(pageId: string): Set<string>
  beginUpdate(): void
  endUpdate(): void
  /** how many steps the undo history holds */
  historyLength(): number
  /** undo the last step and drop it from the history */
  dropLastStep(): void
  /** show a page, as a change inside the running edit */
  selectPage(pageId: string): void
  addPage(id: string, name: string): void
  renamePage(pageId: string, name: string): void
  removePage(pageId: string): void
  /** add a cell to the page on screen; answers the id it got */
  addCell(cell: DiagramCell): string
  updateCell(
    id: string,
    change: { value?: string; style?: string; geometry?: Partial<DiagramGeometry> },
  ): void
  /** remove a cell (and what it contains) from the page on screen, when it is still there */
  removeCell(id: string): void
}

export class PrimitiveError extends Error {}

const pageOf = (primitive: DiagramPrimitive): string | null =>
  primitive.kind === 'add_page' ? null : primitive.page

/** Checks the batch against the diagram as it is. Throws `PrimitiveError` on the first problem. */
export function checkPrimitives(live: LiveDiagram, primitives: readonly DiagramPrimitive[]): void {
  const pages = new Set(live.pageIds())
  const cells = new Map<string, Set<string>>()
  const cellsOf = (pageId: string): Set<string> => {
    let set = cells.get(pageId)
    if (!set) {
      set = new Set(live.cellIds(pageId))
      cells.set(pageId, set)
    }
    return set
  }
  for (const [index, primitive] of primitives.entries()) {
    const at = `primitive ${index} (${primitive.kind})`
    const page = pageOf(primitive)
    if (page !== null && !pages.has(page)) throw new PrimitiveError(`${at}: no page ${page}`)
    switch (primitive.kind) {
      case 'add_page':
        if (pages.has(primitive.id)) throw new PrimitiveError(`${at}: page ${primitive.id} exists`)
        pages.add(primitive.id)
        cells.set(primitive.id, new Set(['0', '1']))
        break
      case 'rename_page':
        break
      case 'remove_page':
        if (pages.size <= 1) throw new PrimitiveError(`${at}: the last page stays`)
        pages.delete(primitive.page)
        cells.delete(primitive.page)
        break
      case 'add_cell': {
        const own = cellsOf(primitive.page)
        const { cell } = primitive
        if (own.has(cell.id)) throw new PrimitiveError(`${at}: cell ${cell.id} exists`)
        if (cell.parent === null || !own.has(cell.parent)) {
          throw new PrimitiveError(`${at}: no parent ${String(cell.parent)}`)
        }
        for (const end of [cell.source, cell.target]) {
          if (end !== undefined && !own.has(end)) throw new PrimitiveError(`${at}: no cell ${end}`)
        }
        own.add(cell.id)
        break
      }
      case 'update_cell':
        if (!cellsOf(primitive.page).has(primitive.id)) {
          throw new PrimitiveError(`${at}: no cell ${primitive.id}`)
        }
        break
      case 'remove_cells': {
        const own = cellsOf(primitive.page)
        for (const id of primitive.ids) {
          if (!own.has(id)) throw new PrimitiveError(`${at}: no cell ${id}`)
        }
        for (const id of primitive.ids) own.delete(id)
        break
      }
    }
  }
}

function applyOne(live: LiveDiagram, primitive: DiagramPrimitive, created: string[]): void {
  const page = pageOf(primitive)
  if (page !== null && primitive.kind !== 'rename_page' && primitive.kind !== 'remove_page') {
    if (live.currentPageId() !== page) live.selectPage(page)
  }
  switch (primitive.kind) {
    case 'add_page':
      live.addPage(primitive.id, primitive.name)
      created.push(primitive.id)
      return
    case 'rename_page':
      live.renamePage(primitive.page, primitive.name)
      return
    case 'remove_page':
      live.removePage(primitive.page)
      return
    case 'add_cell':
      created.push(live.addCell(primitive.cell))
      return
    case 'update_cell': {
      const change: { value?: string; style?: string; geometry?: Partial<DiagramGeometry> } = {}
      if (primitive.value !== undefined) change.value = primitive.value
      if (primitive.style !== undefined) change.style = primitive.style
      if (primitive.geometry !== undefined) change.geometry = primitive.geometry
      live.updateCell(primitive.id, change)
      return
    }
    case 'remove_cells':
      for (const id of primitive.ids) live.removeCell(id)
      return
  }
}

/**
 * Applies the batch as one undo step and answers the ids made (cells and
 * pages, in order). Throws `PrimitiveError` when the batch does not fit the
 * diagram, or the error draw.io threw (after taking the step back).
 */
export function applyPrimitivesLive(
  live: LiveDiagram,
  primitives: readonly DiagramPrimitive[],
): { created: string[] } {
  checkPrimitives(live, primitives)
  if (primitives.length === 0) return { created: [] }
  const before = live.historyLength()
  const shown = live.currentPageId()
  const created: string[] = []
  let failure: unknown = null
  live.beginUpdate()
  try {
    for (const primitive of primitives) applyOne(live, primitive, created)
    if (shown !== null && live.currentPageId() !== shown && live.pageIds().includes(shown)) {
      live.selectPage(shown)
    }
  } catch (err) {
    failure = err
  } finally {
    live.endUpdate()
  }
  if (failure !== null) {
    if (live.historyLength() > before) live.dropLastStep()
    throw failure
  }
  return { created }
}
