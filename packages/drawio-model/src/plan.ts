/**
 * The planner: checks a batch of ops against the diagram and turns each into
 * primitive changes. Every op sees the result of the ops before it. The app
 * applies the primitives to the live draw.io model in one undo step; the CLI
 * writes them into the file (`write.ts`). Both get them from here only.
 */
import { textToLabel } from './label'
import { checkOpInput, type CheckedOp } from './ops'
import {
  ARROW_PATCHES,
  EDGE_STYLE,
  SHAPE_STYLES,
  hasHtmlLabel,
  mergeStyle,
  parseStylePatch,
  type ArrowName,
  type ShapeName,
} from './style'
import { layerIds, readDiagramTable, resolvePage, type DiagramReadResult } from './table'
import type {
  DiagramCell,
  DiagramGeometry,
  DiagramOpError,
  DiagramPageState,
  DiagramPrimitive,
  DiagramState,
} from './types'

/**
 * - `all-or-nothing` (default; always in the app): any failure rejects the batch.
 * - `best-effort`: failed ops are left out, the rest is kept.
 * - `stop-on-error`: the ops before the first failure are kept, the rest skipped.
 */
export type DiagramApplyMode = 'all-or-nothing' | 'best-effort' | 'stop-on-error'

export interface DiagramOpResult {
  index: number
  /** The op name as given (empty when there was none). */
  op: string
  status: 'ok' | 'failed' | 'skipped'
  /** Ids this op made (shapes, edges, pages). */
  created?: string[]
  error?: DiagramOpError
  /** The result of a `read` op. */
  read?: DiagramReadResult
}

export interface DiagramBatchResult {
  /** `partial` when a partial mode kept some changes but not all ops worked. */
  status: 'ok' | 'partial' | 'rejected'
  /** True when `primitives` is not empty; false means nothing to write. */
  changed: boolean
  primitives: DiagramPrimitive[]
  results: DiagramOpResult[]
  created: string[]
  /** The diagram after the kept primitives (the input state is not changed). */
  state: DiagramState
}

export interface MermaidRequest {
  page: string
  text: string
  /** Where the drawing's top-left corner goes: the given spot or `freeSpotRight`. */
  x: number
  y: number
}

/** Supplied by the app: converts Mermaid with draw.io and returns the cells to add. */
export type MermaidConverter = (
  request: MermaidRequest,
  state: DiagramState,
) => DiagramPrimitive[] | DiagramOpError

export interface PlanOptions {
  mode?: DiagramApplyMode
  /** The page ops without `page` work on (the CLI's `--page`). Default: `currentPage`, then the first page. */
  defaultPage?: string
  /** In the app: the page on screen, flagged `current` in reads and used as the default page. */
  currentPage?: string
  /** In the app: the selected ids, given back by reads of the current page. */
  selected?: string[]
  mermaid?: MermaidConverter
}

function cloneState(state: DiagramState): DiagramState {
  return {
    pages: state.pages.map((page) => ({
      id: page.id,
      name: page.name,
      cells: page.cells.map(cloneCell),
    })),
  }
}

function cloneCell(cell: DiagramCell): DiagramCell {
  return cell.geometry ? { ...cell, geometry: { ...cell.geometry } } : { ...cell }
}

const ROOT_CELLS = (): DiagramCell[] => [
  { id: '0', parent: null, value: '', style: '', kind: 'other' },
  { id: '1', parent: '0', value: '', style: '', kind: 'other' },
]

function findPage(state: DiagramState, id: string): DiagramPageState {
  const page = state.pages.find((p) => p.id === id)
  if (!page) throw new Error(`primitive for unknown page ${id}`)
  return page
}

/** Applies primitives to `state` in place. */
function applyInPlace(state: DiagramState, primitive: DiagramPrimitive): void {
  switch (primitive.kind) {
    case 'add_cell':
      findPage(state, primitive.page).cells.push(cloneCell(primitive.cell))
      return
    case 'update_cell': {
      const cell = findPage(state, primitive.page).cells.find((c) => c.id === primitive.id)
      if (!cell) throw new Error(`primitive for unknown cell ${primitive.id}`)
      if (primitive.value !== undefined) cell.value = primitive.value
      if (primitive.style !== undefined) cell.style = primitive.style
      if (primitive.geometry) {
        cell.geometry = {
          ...(cell.geometry ?? { x: 0, y: 0, width: 0, height: 0 }),
          ...primitive.geometry,
        }
      }
      return
    }
    case 'remove_cells': {
      const page = findPage(state, primitive.page)
      const ids = new Set(primitive.ids)
      page.cells = page.cells.filter((cell) => !ids.has(cell.id))
      return
    }
    case 'add_page':
      state.pages.push({ id: primitive.id, name: primitive.name, cells: ROOT_CELLS() })
      return
    case 'rename_page':
      findPage(state, primitive.page).name = primitive.name
      return
    case 'remove_page':
      state.pages = state.pages.filter((page) => page.id !== primitive.page)
      return
  }
}

/** Returns a new state with the primitives applied (the editor's view of the same change). */
export function applyPrimitives(
  state: DiagramState,
  primitives: readonly DiagramPrimitive[],
): DiagramState {
  const next = cloneState(state)
  for (const primitive of primitives) applyInPlace(next, primitive)
  return next
}

/**
 * The spot right of a page's drawing, where an inserted drawing goes when no
 * position is given: `gap` right of the top-level shapes, level with their top;
 * the origin on an empty page.
 */
export function freeSpotRight(
  state: DiagramState,
  page: string,
  gap = 40,
): { x: number; y: number } {
  const found = resolvePage(state, page)
  if ('code' in found) throw new Error(found.message)
  const layers = layerIds(found)
  const boxes = found.cells
    .filter((cell) => cell.kind === 'vertex' && cell.parent !== null && layers.has(cell.parent))
    .map((cell) => cell.geometry!)
  if (boxes.length === 0) return { x: 0, y: 0 }
  return {
    x: Math.max(...boxes.map((box) => box.x + box.width)) + gap,
    y: Math.min(...boxes.map((box) => box.y)),
  }
}

interface Step {
  primitives: DiagramPrimitive[]
  created?: string[]
  read?: DiagramReadResult
}

const notFound = (message: string): DiagramOpError => ({ code: 'target_not_found', message })
const invalid = (message: string): DiagramOpError => ({ code: 'invalid_argument', message })
const isError = (value: unknown): value is DiagramOpError =>
  value !== null && typeof value === 'object' && 'code' in value && 'message' in value

class Planner {
  readonly state: DiagramState
  private readonly used = new Set<string>()
  private readonly counters = new Map<string, number>()

  constructor(
    state: DiagramState,
    private readonly options: PlanOptions,
  ) {
    this.state = cloneState(state)
    for (const page of this.state.pages) {
      this.used.add(page.id)
      for (const cell of page.cells) this.used.add(cell.id)
    }
  }

  private newId(prefix: string): string {
    let n = this.counters.get(prefix) ?? 1
    while (this.used.has(`${prefix}${n}`)) n++
    this.counters.set(prefix, n + 1)
    return `${prefix}${n}`
  }

  private takeId(given: unknown, prefix: string): string | DiagramOpError {
    if (typeof given === 'string') {
      if (this.used.has(given)) return invalid(`id "${given}" already exists in the diagram`)
      return given
    }
    return this.newId(prefix)
  }

  private page(op: CheckedOp): DiagramPageState | DiagramOpError {
    const ref =
      (op['page'] as string | undefined) ?? this.options.defaultPage ?? this.options.currentPage
    if (ref === undefined) {
      return this.state.pages[0] ?? notFound('the diagram has no pages')
    }
    return resolvePage(this.state, ref)
  }

  private shapeOn(page: DiagramPageState, id: string, role: string): DiagramCell | DiagramOpError {
    const cell = page.cells.find((c) => c.id === id)
    if (!cell) return notFound(`${role} "${id}" is not on page ${page.name} (${page.id})`)
    if (cell.kind !== 'vertex') return invalid(`${role} "${id}" is not a shape`)
    return cell
  }

  /** The page's first layer, with primitives making the root and layer when the page has none. */
  private layer(page: DiagramPageState): { id: string; primitives: DiagramPrimitive[] } {
    const layers = layerIds(page)
    const first = page.cells.find((cell) => layers.has(cell.id))
    if (first) return { id: first.id, primitives: [] }
    const primitives: DiagramPrimitive[] = []
    let root = page.cells.find((cell) => cell.parent === null)
    if (!root) {
      root = {
        id: page.cells.some((c) => c.id === '0') ? this.newId('root') : '0',
        parent: null,
        value: '',
        style: '',
        kind: 'other',
      }
      primitives.push({ kind: 'add_cell', page: page.id, cell: root })
    }
    const id = page.cells.some((c) => c.id === '1') ? this.newId('layer') : '1'
    primitives.push({
      kind: 'add_cell',
      page: page.id,
      cell: { id, parent: root.id, value: '', style: '', kind: 'other' },
    })
    return { id, primitives }
  }

  run(op: CheckedOp): Step | DiagramOpError {
    switch (op.op) {
      case 'read': {
        const read = readDiagramTable(this.state, {
          page: (op['page'] as string | undefined) ?? this.options.defaultPage,
          currentPage: this.options.currentPage,
          selected: this.options.selected,
        })
        return isError(read) ? read : { primitives: [], read }
      }
      case 'add_shape':
        return this.addShape(op)
      case 'add_edge':
        return this.addEdge(op)
      case 'update':
        return this.update(op)
      case 'delete':
        return this.delete(op)
      case 'add_page': {
        const id = this.takeId(op['id'], 'page-')
        if (isError(id)) return id
        return { primitives: [{ kind: 'add_page', id, name: op['name'] as string }], created: [id] }
      }
      case 'rename_page': {
        const page = resolvePage(this.state, op['page'] as string)
        if (isError(page)) return page
        return { primitives: [{ kind: 'rename_page', page: page.id, name: op['name'] as string }] }
      }
      case 'delete_page': {
        const page = resolvePage(this.state, op['page'] as string)
        if (isError(page)) return page
        if (this.state.pages.length === 1) {
          return invalid('the last remaining page cannot be deleted')
        }
        return { primitives: [{ kind: 'remove_page', page: page.id }] }
      }
      case 'insert_mermaid':
        return this.insertMermaid(op)
    }
  }

  private addShape(op: CheckedOp): Step | DiagramOpError {
    const page = this.page(op)
    if (isError(page)) return page
    const id = this.takeId(op['id'], 's')
    if (isError(id)) return id
    let parent: string
    const primitives: DiagramPrimitive[] = []
    if (typeof op['parent'] === 'string') {
      const container = this.shapeOn(page, op['parent'], 'parent')
      if (isError(container)) return container
      parent = container.id
    } else {
      const layer = this.layer(page)
      parent = layer.id
      primitives.push(...layer.primitives)
    }
    const style =
      (op['style'] as string | undefined) ??
      SHAPE_STYLES[(op['shape'] as ShapeName | undefined) ?? 'rectangle']
    const geometry: DiagramGeometry = {
      x: op['x'] as number,
      y: op['y'] as number,
      width: (op['width'] as number | undefined) ?? 120,
      height: (op['height'] as number | undefined) ?? 60,
    }
    primitives.push({
      kind: 'add_cell',
      page: page.id,
      cell: {
        id,
        parent,
        value: textToLabel(op['label'] as string, hasHtmlLabel(style)),
        style,
        kind: 'vertex',
        geometry,
      },
    })
    return { primitives, created: [id] }
  }

  private addEdge(op: CheckedOp): Step | DiagramOpError {
    const page = this.page(op)
    if (isError(page)) return page
    const source = this.shapeOn(page, op['source'] as string, 'source')
    if (isError(source)) return source
    const target = this.shapeOn(page, op['target'] as string, 'target')
    if (isError(target)) return target
    const id = this.takeId(op['id'], 'e')
    if (isError(id)) return id
    const given = op['style'] as string | undefined
    const arrow = op['arrow'] as ArrowName | undefined
    let style = given ?? EDGE_STYLE
    if (arrow !== undefined || given === undefined)
      style = mergeStyle(style, ARROW_PATCHES[arrow ?? 'end'])
    const layer = this.layer(page)
    return {
      primitives: [
        ...layer.primitives,
        {
          kind: 'add_cell',
          page: page.id,
          cell: {
            id,
            parent: layer.id,
            value: textToLabel((op['label'] as string | undefined) ?? '', hasHtmlLabel(style)),
            style,
            kind: 'edge',
            source: source.id,
            target: target.id,
          },
        },
      ],
      created: [id],
    }
  }

  private update(op: CheckedOp): Step | DiagramOpError {
    const page = this.page(op)
    if (isError(page)) return page
    const id = op['id'] as string
    const cell = page.cells.find((c) => c.id === id)
    if (!cell) return notFound(`"${id}" is not on page ${page.name} (${page.id})`)
    if (cell.kind === 'other')
      return invalid(`"${id}" is the page's root or a layer, not a shape or an edge`)
    const box = (['x', 'y', 'width', 'height'] as const).filter((key) => op[key] !== undefined)
    if (cell.kind === 'edge' && box.length > 0) {
      return invalid(`"${id}" is an edge; it takes only label and style`)
    }
    if (box.length === 0 && op['label'] === undefined && op['style'] === undefined) {
      return invalid(`update of "${id}" changes nothing`)
    }
    let style: string | undefined
    if (typeof op['style'] === 'string') {
      const patch = parseStylePatch(op['style'])
      if (!patch) return invalid('update.style must be key=value; pairs')
      style = mergeStyle(cell.style, patch)
    }
    const primitive: Extract<DiagramPrimitive, { kind: 'update_cell' }> = {
      kind: 'update_cell',
      page: page.id,
      id,
    }
    if (typeof op['label'] === 'string') {
      primitive.value = textToLabel(op['label'], hasHtmlLabel(style ?? cell.style))
    }
    if (style !== undefined) primitive.style = style
    if (box.length > 0) {
      primitive.geometry = Object.fromEntries(box.map((key) => [key, op[key] as number]))
    }
    return { primitives: [primitive] }
  }

  private delete(op: CheckedOp): Step | DiagramOpError {
    const page = this.page(op)
    if (isError(page)) return page
    const removed = new Set<string>()
    const order: string[] = []
    const add = (id: string): boolean => {
      if (removed.has(id)) return false
      removed.add(id)
      order.push(id)
      return true
    }
    for (const id of op['ids'] as string[]) {
      const cell = page.cells.find((c) => c.id === id)
      if (!cell) return notFound(`"${id}" is not on page ${page.name} (${page.id})`)
      if (cell.kind === 'other')
        return invalid(`"${id}" is the page's root or a layer, not a shape or an edge`)
      add(id)
    }
    for (let grew = true; grew;) {
      grew = false
      for (const cell of page.cells) {
        if (cell.parent !== null && removed.has(cell.parent)) grew = add(cell.id) || grew
      }
      for (const cell of page.cells) {
        if (
          cell.kind === 'edge' &&
          ((cell.source !== undefined && removed.has(cell.source)) ||
            (cell.target !== undefined && removed.has(cell.target)))
        ) {
          grew = add(cell.id) || grew
        }
      }
    }
    return { primitives: [{ kind: 'remove_cells', page: page.id, ids: order }] }
  }

  private insertMermaid(op: CheckedOp): Step | DiagramOpError {
    const page = this.page(op)
    if (isError(page)) return page
    if (!this.options.mermaid) {
      return {
        code: 'needs_app',
        message: 'insert_mermaid needs the app: the Mermaid converter runs in the diagram editor',
      }
    }
    const spot = freeSpotRight(this.state, page.id)
    const request: MermaidRequest = {
      page: page.id,
      text: op['text'] as string,
      x: (op['x'] as number | undefined) ?? spot.x,
      y: (op['y'] as number | undefined) ?? spot.y,
    }
    const primitives = this.options.mermaid(request, cloneState(this.state))
    if (isError(primitives)) return primitives
    try {
      applyPrimitives(this.state, primitives)
    } catch (error) {
      return invalid(
        `the Mermaid drawing cannot be added: ${error instanceof Error ? error.message : error}`,
      )
    }
    const created: string[] = []
    for (const primitive of primitives) {
      if (primitive.kind === 'add_cell') created.push(primitive.cell.id)
      if (primitive.kind === 'add_page') created.push(primitive.id)
    }
    return { primitives, created }
  }

  commit(step: Step): void {
    for (const primitive of step.primitives) {
      applyInPlace(this.state, primitive)
      if (primitive.kind === 'add_cell') this.used.add(primitive.cell.id)
      if (primitive.kind === 'add_page') this.used.add(primitive.id)
    }
  }
}

/** Checks and plans a batch of ops. Never changes `state`. */
export function planDiagramOps(
  state: DiagramState,
  ops: readonly unknown[],
  options: PlanOptions = {},
): DiagramBatchResult {
  const mode = options.mode ?? 'all-or-nothing'
  const planner = new Planner(state, options)
  const results: DiagramOpResult[] = []
  const primitives: DiagramPrimitive[] = []
  const created: string[] = []
  let failed = false
  for (const [index, input] of ops.entries()) {
    const name =
      input !== null &&
      typeof input === 'object' &&
      typeof (input as { op?: unknown }).op === 'string'
        ? (input as { op: string }).op
        : ''
    if (failed && mode === 'stop-on-error') {
      results.push({ index, op: name, status: 'skipped' })
      continue
    }
    const checked = checkOpInput(input)
    let step: Step | DiagramOpError
    try {
      step = isError(checked) ? checked : planner.run(checked)
    } catch (error) {
      step = invalid(error instanceof Error ? error.message : String(error))
    }
    if (isError(step)) {
      failed = true
      results.push({ index, op: name, status: 'failed', error: step })
      continue
    }
    planner.commit(step)
    primitives.push(...step.primitives)
    if (step.created) created.push(...step.created)
    const result: DiagramOpResult = { index, op: name, status: 'ok' }
    if (step.created) result.created = step.created
    if (step.read) result.read = step.read
    results.push(result)
  }
  if (failed && (mode === 'all-or-nothing' || primitives.length === 0)) {
    return {
      status: 'rejected',
      changed: false,
      primitives: [],
      results,
      created: [],
      state: cloneState(state),
    }
  }
  return {
    status: failed ? 'partial' : 'ok',
    changed: primitives.length > 0,
    primitives,
    results,
    created,
    state: planner.state,
  }
}
