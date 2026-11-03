/**
 * Ops on the diagram on screen (spec 7, 8): the model package plans them
 * against the live diagram, the bridge applies the plan as one undo step.
 * The AI panel and the in-app MCP server both come through here.
 *
 * All or nothing: a batch with any refused op changes nothing. A batch that
 * only reads changes nothing either.
 */
import {
  diagramStateFromPages,
  formatDiagramText,
  planDiagramOps,
  type DiagramBatchResult,
  type DiagramState,
  type MermaidConverter,
} from '@genoffice/drawio-model'
import type { DrawioFrame } from '../drawio/frame-client'

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

/** Every page as the read table text (the in-app MCP server's `read`). */
export async function liveDiagramText(frame: DrawioFrame): Promise<string> {
  const snapshot = await liveSnapshot(frame)
  return formatDiagramText(snapshot.state, {
    ...(snapshot.currentPage ? { currentPage: snapshot.currentPage } : {}),
    selected: snapshot.selected,
  })
}

export interface LiveApplyResult extends DiagramBatchResult {
  /** the ids the cells and pages really got on screen (the plan's, unless draw.io had to rename) */
  applied: string[]
}

/**
 * Plans `ops` against the diagram on screen and applies them as one undo
 * step. A rejected plan is answered as it is, with nothing applied.
 */
export async function applyLiveOps(
  frame: DrawioFrame,
  ops: unknown[],
  options: { mermaid?: MermaidConverter } = {},
): Promise<LiveApplyResult> {
  const snapshot = await liveSnapshot(frame)
  const plan = planDiagramOps(snapshot.state, ops, {
    mode: 'all-or-nothing',
    ...(snapshot.currentPage ? { currentPage: snapshot.currentPage } : {}),
    selected: snapshot.selected,
    ...(options.mermaid ? { mermaid: options.mermaid } : {}),
  })
  if (plan.status !== 'ok' || !plan.changed) return { ...plan, applied: [] }
  const { created } = await frame.request('applyPrimitives', { primitives: plan.primitives })
  return { ...plan, applied: created }
}
