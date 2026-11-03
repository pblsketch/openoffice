/**
 * Ops on the diagram on screen (spec 7, 8): the model package plans them
 * against the live diagram, the bridge applies the plan as one undo step.
 * The AI panel and the in-app MCP server both come through here.
 *
 * All or nothing: a batch with any refused op changes nothing. A batch that
 * only reads changes nothing either. A batch with `insert_mermaid` converts
 * the Mermaid text with draw.io first (that changes nothing); a text the
 * converter refuses rejects the whole batch with the converter's reason. The
 * changes then go to the bridge in ONE request (`applyBatch`), primitives and
 * drawings in order, so a mixed call is still one undo step.
 */
import {
  diagramStateFromPages,
  formatDiagramRead,
  formatDiagramText,
  planDiagramOps,
  readDiagramTable,
  type DiagramApplyMode,
  type DiagramBatchResult,
  type DiagramOpResult,
  type DiagramPrimitive,
  type DiagramReadResult,
  type DiagramState,
  type MermaidConverter,
} from '@genoffice/drawio-model'
import type { DiagramApplyStep } from '../../shared/bridge-protocol'
import type { DrawioFrame } from '../drawio/frame-client'
import { convertMermaidInEditor, plannedMermaidCells, type MermaidConversion } from './mermaid'

export interface LiveSnapshot {
  state: DiagramState
  currentPage: string | null
  selected: string[]
}

/** The diagram on screen as the model sees it, unsaved edits included. */
export async function liveSnapshot(frame: DrawioFrame): Promise<LiveSnapshot> {
  const read = await frame.request('readPages', {})
  return {
    state: diagramStateFromPages(read.pages),
    currentPage: read.currentPage,
    selected: read.selected,
  }
}

/** Every page as the read table text (the in-app MCP server's `read` without a page). */
export async function liveDiagramText(frame: DrawioFrame): Promise<string> {
  const snapshot = await liveSnapshot(frame)
  return formatDiagramText(snapshot.state, {
    ...(snapshot.currentPage ? { currentPage: snapshot.currentPage } : {}),
    selected: snapshot.selected,
  })
}

export type LivePageRead =
  | { ok: true; text: string; pageId: string; pageName: string; read: DiagramReadResult }
  | { ok: false; error: string }

/**
 * One page as the read table text: the page on screen when `page` is left
 * out, with the ids the person has selected there; another page by id or name.
 */
export async function liveDiagramRead(frame: DrawioFrame, page?: string): Promise<LivePageRead> {
  const snapshot = await liveSnapshot(frame)
  const read = readDiagramTable(snapshot.state, {
    ...(page !== undefined && page !== '' ? { page } : {}),
    ...(snapshot.currentPage ? { currentPage: snapshot.currentPage } : {}),
    selected: snapshot.selected,
  })
  if ('code' in read) return { ok: false, error: read.message }
  return {
    ok: true,
    text: formatDiagramRead(read),
    pageId: read.page.id,
    pageName: read.page.name,
    read,
  }
}

export interface LiveApplyResult extends DiagramBatchResult {
  /** the ids the cells and pages really got on screen, in order */
  applied: string[]
  /** names the one undo step the call became, for taking it back; null when nothing changed */
  token: string | null
}

const isMermaidOp = (op: unknown): op is { op: 'insert_mermaid'; text: string } =>
  op !== null &&
  typeof op === 'object' &&
  (op as { op?: unknown }).op === 'insert_mermaid' &&
  typeof (op as { text?: unknown }).text === 'string'

interface DrawingGroup {
  primitives: readonly DiagramPrimitive[]
  step: Extract<DiagramApplyStep, { kind: 'mermaid' }>
}

/** The plan's primitives as bridge steps: each drawing's planned cells become its one import. */
export function stepsOfPlan(
  primitives: readonly DiagramPrimitive[],
  drawings: readonly DrawingGroup[],
): { steps: DiagramApplyStep[]; drawingSteps: number[] } {
  const owner = new Map<DiagramPrimitive, DrawingGroup>()
  for (const drawing of drawings) for (const p of drawing.primitives) owner.set(p, drawing)
  const steps: DiagramApplyStep[] = []
  const drawingSteps: number[] = []
  const placed = new Set<DrawingGroup>()
  for (const primitive of primitives) {
    const drawing = owner.get(primitive)
    if (drawing) {
      if (!placed.has(drawing)) {
        placed.add(drawing)
        drawingSteps.push(steps.length)
        steps.push(drawing.step)
      }
      continue
    }
    const last = steps.at(-1)
    if (last?.kind === 'primitives') last.primitives.push(primitive)
    else steps.push({ kind: 'primitives', primitives: [primitive] })
  }
  return { steps, drawingSteps }
}

export interface LiveApplyOptions {
  /** The AI panel and the in-app MCP server always use the default, all-or-nothing. */
  mode?: DiagramApplyMode
  /** The page ops without `page` work on, instead of the page on screen (a windowless job's `--page`). */
  defaultPage?: string
}

/**
 * Plans `ops` against the diagram on screen and applies them as one undo
 * step. A rejected plan is answered as it is, with nothing applied. This is
 * the one executor of `apply_diagram_ops` for an open tab (AI panel and
 * in-app MCP) and of the command line's windowless jobs, which alone pass a
 * partial mode: the ops it keeps go in, still as one step.
 */
export async function applyLiveOps(
  frame: DrawioFrame,
  ops: unknown[],
  options: LiveApplyOptions = {},
): Promise<LiveApplyResult> {
  const snapshot = await liveSnapshot(frame)

  // Mermaid first, with draw.io's converter: read-only, one request per distinct text
  const conversions = new Map<string, MermaidConversion>()
  for (const op of ops) {
    if (!isMermaidOp(op) || op.text.trim() === '' || conversions.has(op.text)) continue
    conversions.set(op.text, await convertMermaidInEditor(frame, op.text))
  }
  const drawings: DrawingGroup[] = []
  const mermaid: MermaidConverter = (request, state) => {
    const conversion = conversions.get(request.text)
    if (!conversion) {
      return { code: 'invalid_argument', message: 'the Mermaid text was not converted' }
    }
    if (!conversion.ok) {
      return {
        code: 'invalid_argument',
        message: `draw.io cannot convert this Mermaid text: ${conversion.error}`,
      }
    }
    const primitives = plannedMermaidCells(conversion.xml, request, state)
    if (!Array.isArray(primitives)) return primitives
    drawings.push({
      primitives,
      step: {
        kind: 'mermaid',
        page: request.page,
        xml: conversion.xml,
        x: request.x,
        y: request.y,
      },
    })
    return primitives
  }

  const plan = planDiagramOps(snapshot.state, ops, {
    mode: options.mode ?? 'all-or-nothing',
    ...(options.defaultPage !== undefined ? { defaultPage: options.defaultPage } : {}),
    ...(snapshot.currentPage ? { currentPage: snapshot.currentPage } : {}),
    selected: snapshot.selected,
    mermaid,
  })
  if (plan.status === 'rejected' || !plan.changed) return { ...plan, applied: [], token: null }

  const { steps, drawingSteps } = stepsOfPlan(plan.primitives, drawings)
  const reply = await frame.request('applyBatch', { steps })

  // the ids a drawing really got are draw.io's: they replace the plan's in what the call answers
  const realIds = drawingSteps.map((index) => reply.steps[index] ?? [])
  let next = 0
  const results: DiagramOpResult[] = plan.results.map((result) => {
    if (result.op !== 'insert_mermaid' || result.status !== 'ok') return result
    return { ...result, created: realIds[next++] ?? [] }
  })
  return {
    ...plan,
    results,
    created: results.flatMap((result) => result.created ?? []),
    applied: reply.created,
    token: reply.token,
  }
}

/** Takes the named AI calls back, newest first, while nothing else came after them. */
export async function undoLiveBatches(frame: DrawioFrame, tokens: string[]): Promise<boolean> {
  if (tokens.length === 0) return true
  const { undone } = await frame.request('undoBatches', { tokens })
  return undone === tokens.length
}

/**
 * What a call did, as the text a model reads: the outcome first, then one
 * line per op (`index op: ok …` or `FAILED code: reason`), and the table of
 * each `read` op.
 */
export function formatApplyResult(result: LiveApplyResult): string {
  const lines: string[] = []
  if (result.status === 'ok') {
    lines.push(
      result.changed
        ? `Applied ${result.results.length} op(s) as one undo step.`
        : 'Nothing to change: the ops only read.',
    )
  } else {
    const failed = result.results.filter((r) => r.status === 'failed').length
    lines.push(
      `Nothing was changed: ${failed} op(s) were refused, so the whole call was rejected. Fix them and send the whole list again.`,
    )
  }
  for (const r of result.results) {
    const head = `${r.index} ${r.op || '(no op)'}:`
    if (r.status === 'failed') {
      lines.push(`${head} FAILED ${r.error?.code ?? 'error'}: ${r.error?.message ?? ''}`)
    } else if (r.status === 'skipped') {
      lines.push(`${head} skipped`)
    } else if (result.status !== 'ok') {
      lines.push(`${head} ok (not applied)`)
    } else {
      lines.push(r.created?.length ? `${head} ok, created ${r.created.join(', ')}` : `${head} ok`)
    }
    if (r.read) lines.push(formatDiagramRead(r.read))
  }
  return lines.join('\n')
}
