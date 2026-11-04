/**
 * Mermaid in the editor (spec 7, 8.2): draw.io converts the source inside its
 * page (`convertMermaid` in the bridge), and the result goes into the diagram
 * as one of the steps of the call's single undo step.
 *
 * The planner of `@genoffice/drawio-model` asks for the cells a drawing adds
 * while it plans the call, so the ops after it see them. Those cells are made
 * here from draw.io's XML, placed the way draw.io will place them (the
 * drawing's top-left corner at the spot), under ids the plan alone uses. What
 * reaches the diagram is draw.io's own XML, imported by draw.io: its edge
 * points, groups and styles stay exactly as the converter made them, and the
 * cells get the ids draw.io gives them.
 */
import {
  parseGraphModel,
  type DiagramCell,
  type DiagramOpError,
  type DiagramPrimitive,
  type DiagramState,
  type MermaidRequest,
} from '@genoffice/drawio-model'
import type { DrawioFrame } from '../drawio/frame-client'

export type MermaidConversion = { ok: true; xml: string } | { ok: false; error: string }

/**
 * Converts Mermaid source with draw.io's converter in the open editor.
 * Changes nothing. A text the converter refuses answers its reason.
 * (A new diagram made from Mermaid starts from this, then imports the XML.)
 */
export async function convertMermaidInEditor(
  frame: DrawioFrame,
  text: string,
): Promise<MermaidConversion> {
  try {
    const { xml } = await frame.request('convertMermaid', { text })
    return { ok: true, xml }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

const invalid = (message: string): DiagramOpError => ({ code: 'invalid_argument', message })

/** The first layer of a page: a cell whose parent is the page's root cell. */
function firstLayer(cells: readonly DiagramCell[]): string | null {
  const root = cells.find((cell) => cell.parent === null)
  if (!root) return null
  return cells.find((cell) => cell.parent === root.id)?.id ?? null
}

/**
 * The cells a converted drawing adds to `request.page`, as add_cell
 * primitives for the plan: the drawing's layers become the page's first
 * layer, its top-level shapes move so the drawing's top-left corner is at
 * `request.x`, `request.y`, and every cell gets an id the diagram does not
 * use (`m1`, `m2`, … after the ids taken).
 */
export function plannedMermaidCells(
  xml: string,
  request: MermaidRequest,
  state: DiagramState,
): DiagramPrimitive[] | DiagramOpError {
  const parsed = parseGraphModel(xml)
  if (!parsed.ok) return invalid(`the converted drawing cannot be read: ${parsed.message}`)
  const page = state.pages.find((p) => p.id === request.page)
  if (!page) return invalid(`no page ${request.page}`)
  const layer = firstLayer(page.cells)
  if (!layer) return invalid(`page ${page.name} has no layer to draw on`)

  const root = parsed.cells.find((cell) => cell.parent === null)
  const layers = new Set(
    parsed.cells.filter((cell) => root && cell.parent === root.id).map((cell) => cell.id),
  )
  const drawn = parsed.cells.filter((cell) => cell !== root && !layers.has(cell.id))
  if (!drawn.some((cell) => cell.kind === 'vertex' || cell.kind === 'edge')) {
    return invalid('the converted drawing has nothing to draw')
  }

  const taken = new Set<string>()
  for (const p of state.pages) {
    taken.add(p.id)
    for (const cell of p.cells) taken.add(cell.id)
  }
  const ids = new Map<string, string>()
  let n = 1
  for (const cell of drawn) {
    while (taken.has(`m${n}`)) n++
    ids.set(cell.id, `m${n}`)
    taken.add(`m${n++}`)
  }

  const top = drawn.filter((cell) => cell.parent !== null && layers.has(cell.parent))
  const boxes = top.filter((cell) => cell.geometry).map((cell) => cell.geometry!)
  const left = boxes.length > 0 ? Math.min(...boxes.map((box) => box.x)) : 0
  const upper = boxes.length > 0 ? Math.min(...boxes.map((box) => box.y)) : 0

  // parents first, as the planner and the diagram need them
  const placed = new Set<string>()
  const ordered: DiagramCell[] = []
  let pending = drawn
  while (pending.length > 0) {
    const ready = pending.filter(
      (cell) => cell.parent !== null && (layers.has(cell.parent) || placed.has(cell.parent)),
    )
    if (ready.length === 0) return invalid('the converted drawing has cells without a parent')
    for (const cell of ready) {
      ordered.push(cell)
      placed.add(cell.id)
    }
    pending = pending.filter((cell) => !placed.has(cell.id))
  }

  return ordered.map((cell): DiagramPrimitive => {
    const isTop = cell.parent !== null && layers.has(cell.parent)
    const out: DiagramCell = {
      id: ids.get(cell.id)!,
      parent: isTop ? layer : ids.get(cell.parent!)!,
      value: cell.value,
      style: cell.style,
      kind: cell.kind,
    }
    if (cell.source !== undefined && ids.has(cell.source)) out.source = ids.get(cell.source)!
    if (cell.target !== undefined && ids.has(cell.target)) out.target = ids.get(cell.target)!
    if (cell.geometry) {
      out.geometry = isTop
        ? {
            ...cell.geometry,
            x: cell.geometry.x - left + request.x,
            y: cell.geometry.y - upper + request.y,
          }
        : { ...cell.geometry }
    }
    return { kind: 'add_cell', page: page.id, cell: out }
  })
}
