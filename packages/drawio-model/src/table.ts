/**
 * The read table: per page, its shapes and edges as plain values, and the
 * same as compact text (one row per element) for the AI, the CLI and file-parse.
 */
import { labelText } from './label'
import { hasHtmlLabel, shapeName, styleValue } from './style'
import type { DiagramCell, DiagramOpError, DiagramPageState, DiagramState } from './types'

export interface DiagramPageListItem {
  id: string
  name: string
  current?: true
}

export interface DiagramShapeRow {
  id: string
  label: string
  shape: string
  /** As stored: relative to `parent` when there is one. */
  x: number
  y: number
  width: number
  height: number
  parent?: string
  fill?: string
  stroke?: string
}

export interface DiagramEdgeRow {
  id: string
  label: string
  /** `null` for a loose end. */
  source: string | null
  target: string | null
  parent?: string
}

export interface DiagramPageTable {
  id: string
  name: string
  shapes: DiagramShapeRow[]
  edges: DiagramEdgeRow[]
  /** In the app only: the ids the person has selected on this page. */
  selected?: string[]
}

export interface DiagramReadResult {
  pages: DiagramPageListItem[]
  page: DiagramPageTable
}

export interface DiagramReadOptions {
  /** Page id or name; defaults to `currentPage`, then the first page. */
  page?: string
  /** The page shown in the app; flagged `current`. */
  currentPage?: string
  /** The selection in the app, reported when the read page is the current page. */
  selected?: string[]
}

/**
 * Finds a page by id, then by name. A name shared by several pages (and no id
 * match) is ambiguous.
 */
export function resolvePage(state: DiagramState, ref: string): DiagramPageState | DiagramOpError {
  const byId = state.pages.find((page) => page.id === ref)
  if (byId) return byId
  const byName = state.pages.filter((page) => page.name === ref)
  if (byName.length === 1) return byName[0]!
  if (byName.length > 1) {
    return {
      code: 'invalid_argument',
      message: `${byName.length} pages are named "${ref}"; use the page id (${byName.map((p) => p.id).join(', ')})`,
    }
  }
  return {
    code: 'target_not_found',
    message: `no page "${ref}"; pages: ${state.pages.map((p) => `${p.name} (${p.id})`).join(', ')}`,
  }
}

/** The layers of a page: children of a root cell. */
export function layerIds(page: DiagramPageState): Set<string> {
  const roots = new Set(page.cells.filter((cell) => cell.parent === null).map((cell) => cell.id))
  return new Set(
    page.cells.filter((cell) => cell.parent !== null && roots.has(cell.parent)).map((c) => c.id),
  )
}

function isEdgeLabelCell(cell: DiagramCell, byId: Map<string, DiagramCell>): boolean {
  return cell.kind === 'vertex' && cell.parent !== null && byId.get(cell.parent)?.kind === 'edge'
}

function cellLabel(cell: DiagramCell): string {
  return labelText(cell.value, hasHtmlLabel(cell.style))
}

function isContainer(style: string, shape: string): boolean {
  return styleValue(style, 'container') === '1' || shape === 'swimlane' || shape === 'table'
}

export function pageTable(page: DiagramPageState): DiagramPageTable {
  const byId = new Map(page.cells.map((cell) => [cell.id, cell]))
  const layers = layerIds(page)
  const parentOf = (cell: DiagramCell): { parent?: string } =>
    cell.parent !== null && !layers.has(cell.parent) && byId.has(cell.parent)
      ? { parent: cell.parent }
      : {}
  const shapes: DiagramShapeRow[] = []
  const edges: DiagramEdgeRow[] = []
  for (const cell of page.cells) {
    if (cell.kind === 'vertex' && !isEdgeLabelCell(cell, byId)) {
      let shape = shapeName(cell.style)
      if (shape !== 'group' && isContainer(cell.style, shape)) shape = 'container'
      const geometry = cell.geometry ?? { x: 0, y: 0, width: 0, height: 0 }
      const row: DiagramShapeRow = {
        id: cell.id,
        label: cellLabel(cell),
        shape,
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        ...parentOf(cell),
      }
      const fill = styleValue(cell.style, 'fillColor')
      const stroke = styleValue(cell.style, 'strokeColor')
      if (fill !== undefined) row.fill = fill
      if (stroke !== undefined) row.stroke = stroke
      shapes.push(row)
    } else if (cell.kind === 'edge') {
      const labels = [cellLabel(cell)]
      for (const child of page.cells) {
        if (child.parent === cell.id && child.kind === 'vertex') labels.push(cellLabel(child))
      }
      edges.push({
        id: cell.id,
        label: labels.filter((label) => label !== '').join('\n'),
        source: cell.source ?? null,
        target: cell.target ?? null,
        ...parentOf(cell),
      })
    }
  }
  return { id: page.id, name: page.name, shapes, edges }
}

/** The read table of one page and the page list. */
export function readDiagramTable(
  state: DiagramState,
  options: DiagramReadOptions = {},
): DiagramReadResult | DiagramOpError {
  if (state.pages.length === 0)
    return { code: 'target_not_found', message: 'the diagram has no pages' }
  const current =
    options.currentPage === undefined ? undefined : resolvePage(state, options.currentPage)
  if (current && 'code' in current) return current
  const ref = options.page ?? options.currentPage
  const page = ref === undefined ? state.pages[0]! : resolvePage(state, ref)
  if ('code' in page) return page
  const table = pageTable(page)
  if (current && page.id === current.id && options.selected !== undefined) {
    const ids = new Set(page.cells.map((cell) => cell.id))
    table.selected = options.selected.filter((id) => ids.has(id))
  }
  return {
    pages: state.pages.map((p) =>
      current && p.id === current.id
        ? { id: p.id, name: p.name, current: true }
        : { id: p.id, name: p.name },
    ),
    page: table,
  }
}

const LABEL_LIMIT = 80

function cellText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\|/g, '\\|')
  return text.length > LABEL_LIMIT ? `${text.slice(0, LABEL_LIMIT - 1)}…` : text
}

const SHAPE_COLUMNS = 'id | label | shape | x | y | width | height | parent | fill | stroke'
const EDGE_COLUMNS = 'id | label | source | target | parent'

function pageLines(page: DiagramPageTable): string[] {
  const lines = [`Page: ${page.name} (${page.id})`]
  lines.push(`Shapes (${page.shapes.length}): ${SHAPE_COLUMNS}`)
  for (const s of page.shapes) {
    lines.push(
      [s.id, s.label, s.shape, s.x, s.y, s.width, s.height, s.parent, s.fill, s.stroke]
        .map(cellText)
        .join(' | '),
    )
  }
  lines.push(`Edges (${page.edges.length}): ${EDGE_COLUMNS}`)
  for (const e of page.edges) {
    lines.push([e.id, e.label, e.source, e.target, e.parent].map(cellText).join(' | '))
  }
  if (page.selected !== undefined) lines.push(`Selected: ${page.selected.join(', ')}`)
  return lines
}

function pageListLine(pages: DiagramPageListItem[]): string {
  return `Pages: ${pages.map((p) => `${p.name} (${p.id})${p.current ? ' [current]' : ''}`).join(', ')}`
}

/** One read result as text: the page list, then the page's rows. */
export function formatDiagramRead(read: DiagramReadResult): string {
  return [pageListLine(read.pages), ...pageLines(read.page)].join('\n')
}

/** Every page as text, for attachments, the file index and `read` of a whole document. */
export function formatDiagramText(
  state: DiagramState,
  options: Pick<DiagramReadOptions, 'currentPage' | 'selected'> = {},
): string {
  const lines: string[] = []
  for (const page of state.pages) {
    const read = readDiagramTable(state, { ...options, page: page.id })
    if ('code' in read) continue
    if (lines.length === 0) lines.push(pageListLine(read.pages))
    lines.push('', ...pageLines(read.page))
  }
  return lines.join('\n')
}
