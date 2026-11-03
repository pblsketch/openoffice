/**
 * The `mxGraphModel` of one page: its cells as `DiagramCell`s, and the XML
 * elements that hold each cell so a writer can change them in place.
 *
 * A cell is an `<mxCell>` under `<root>`, or a `<UserObject>`/`<object>` that
 * wraps one; the wrapper then holds the id and the label (`label`).
 */
import type { DiagramCell, DiagramGeometry, DiagramPageState, DiagramState } from './types'
import { childElements, getAttr, parseXmlTree, XmlParseError, type XmlElement } from './xml-tree'

export interface CellElements {
  /** The element directly under `<root>`: the wrapper, or the `mxCell` itself. */
  outer: XmlElement
  /** The `mxCell`. */
  cell: XmlElement
}

const WRAPPERS = new Set(['UserObject', 'object'])

export function modelRootElement(model: XmlElement): XmlElement | undefined {
  return childElements(model, 'root')[0]
}

/** The cell elements under `<root>`, in document order. */
export function cellElementList(root: XmlElement): CellElements[] {
  const result: CellElements[] = []
  for (const outer of childElements(root)) {
    if (outer.name === 'mxCell') result.push({ outer, cell: outer })
    else if (WRAPPERS.has(outer.name)) {
      const cell = childElements(outer, 'mxCell')[0]
      if (cell) result.push({ outer, cell })
    }
  }
  return result
}

export function geometryElement(cell: XmlElement): XmlElement | undefined {
  return childElements(cell, 'mxGeometry').find(
    (el) => (getAttr(el, 'as') ?? 'geometry') === 'geometry',
  )
}

function num(value: string | undefined): number {
  const parsed = value === undefined ? NaN : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function cellFromElements({ outer, cell }: CellElements): DiagramCell | null {
  const wrapped = outer !== cell
  const id = getAttr(outer, 'id')
  if (id === undefined) return null
  const kind =
    getAttr(cell, 'vertex') === '1' ? 'vertex' : getAttr(cell, 'edge') === '1' ? 'edge' : 'other'
  const result: DiagramCell = {
    id,
    parent: getAttr(cell, 'parent') ?? null,
    value: (wrapped ? getAttr(outer, 'label') : getAttr(cell, 'value')) ?? '',
    style: getAttr(cell, 'style') ?? '',
    kind,
  }
  const source = getAttr(cell, 'source')
  const target = getAttr(cell, 'target')
  if (source !== undefined) result.source = source
  if (target !== undefined) result.target = target
  if (kind === 'vertex') {
    const geometry = geometryElement(cell)
    const box: DiagramGeometry = {
      x: num(geometry && getAttr(geometry, 'x')),
      y: num(geometry && getAttr(geometry, 'y')),
      width: num(geometry && getAttr(geometry, 'width')),
      height: num(geometry && getAttr(geometry, 'height')),
    }
    result.geometry = box
  }
  return result
}

export function cellsOfModel(model: XmlElement): DiagramCell[] {
  const root = modelRootElement(model)
  if (!root) return []
  return cellElementList(root)
    .map(cellFromElements)
    .filter((cell): cell is DiagramCell => cell !== null)
}

export type GraphModelResult =
  | { ok: true; cells: DiagramCell[] }
  | { ok: false; reason: 'not_xml' | 'no_diagram'; message: string }

/** Reads the cells of one page's `mxGraphModel` XML. */
export function parseGraphModel(xml: string): GraphModelResult {
  let root: XmlElement
  try {
    root = parseXmlTree(xml).root
  } catch (error) {
    if (error instanceof XmlParseError) {
      return { ok: false, reason: 'not_xml', message: `the page is not XML: ${error.message}` }
    }
    throw error
  }
  if (root.name !== 'mxGraphModel') {
    return {
      ok: false,
      reason: 'no_diagram',
      message: `the page holds <${root.name}>, not <mxGraphModel>`,
    }
  }
  return { ok: true, cells: cellsOfModel(root) }
}

/**
 * Builds the planner's state from page models, as the editor reads them from
 * draw.io (`mxGraphModel` XML per page). Throws when a model cannot be read.
 */
export function diagramStateFromPages(
  pages: readonly { id: string; name: string; xml: string }[],
): DiagramState {
  return {
    pages: pages.map((page): DiagramPageState => {
      const parsed = parseGraphModel(page.xml)
      if (!parsed.ok) throw new Error(`page ${page.id}: ${parsed.message}`)
      return { id: page.id, name: page.name, cells: parsed.cells }
    }),
  }
}
