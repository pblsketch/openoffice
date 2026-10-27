/**
 * Where the others are in a shared workbook: each peer publishes its active
 * sheet, cell and selection, and the grid paints everyone else's in their
 * color with their name on the active cell. Painted by a canvas extension
 * like the cross highlight, so it never reaches print, PDF or the file.
 */
import type { IRange, IScale } from '@univerjs/core'
import {
  IRenderManagerService,
  SheetExtension,
  SpreadsheetExtensionRegistry,
  type SpreadsheetSkeleton,
  type UniverRenderingContext,
} from '@univerjs/engine-render'
import type { UniverRuntime } from '../univer-state'

/** the awareness field this editor publishes */
export const PRESENCE_FIELD = 'sheetCell'

/** a peer's place, with sheet ids as the host knows them */
export interface CellPresence {
  readonly sheet: string
  readonly row: number
  readonly col: number
  /** startRow, startColumn, endRow, endColumn of the selection */
  readonly range: readonly [number, number, number, number]
}

export function isCellPresence(value: unknown): value is CellPresence {
  if (typeof value !== 'object' || value === null) return false
  const presence = value as Record<string, unknown>
  return (
    typeof presence.sheet === 'string' &&
    Number.isInteger(presence.row) &&
    Number.isInteger(presence.col) &&
    Array.isArray(presence.range) &&
    presence.range.length === 4 &&
    presence.range.every((index) => Number.isInteger(index) && (index as number) >= 0)
  )
}

/** a selection's numbers as one presence value, or null when there is nothing to show */
export function cellPresence(
  sheet: string,
  cell: { row: number; column: number } | null,
  range: IRange | null,
): CellPresence | null {
  if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.column)) return null
  if (cell.row < 0 || cell.column < 0) return null
  const area = range ?? {
    startRow: cell.row,
    endRow: cell.row,
    startColumn: cell.column,
    endColumn: cell.column,
  }
  return {
    sheet,
    row: cell.row,
    col: cell.column,
    range: [
      Math.max(0, area.startRow),
      Math.max(0, area.startColumn),
      Math.max(0, area.endRow),
      Math.max(0, area.endColumn),
    ],
  }
}

interface CellRect {
  readonly startX: number
  readonly startY: number
  readonly endX: number
  readonly endY: number
}

export interface PresenceBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** the selection and the active cell in canvas coordinates */
export function presenceBoxes(
  presence: CellPresence,
  cellAt: (row: number, column: number) => CellRect | null,
): { selection: PresenceBox; cell: PresenceBox } | null {
  const [startRow, startColumn, endRow, endColumn] = presence.range
  const first = cellAt(Math.min(startRow, endRow), Math.min(startColumn, endColumn))
  const last = cellAt(Math.max(startRow, endRow), Math.max(startColumn, endColumn))
  const active = cellAt(presence.row, presence.col)
  if (!first || !last || !active) return null
  const box = (from: CellRect, to: CellRect): PresenceBox => ({
    x: from.startX,
    y: from.startY,
    width: to.endX - from.startX,
    height: to.endY - from.startY,
  })
  return { selection: box(first, last), cell: box(active, active) }
}

/** someone else's place as this peer paints it */
export interface RemotePresence {
  readonly name: string
  /** --collab-<n> palette index */
  readonly palette: number
  /** this peer's sheet id */
  readonly sheetId: string
  readonly presence: CellPresence
}

interface PresenceRenderState {
  workbookId: string
  peers: readonly RemotePresence[]
}

let renderState: PresenceRenderState = { workbookId: '', peers: [] }

/** resolved palette colors, read once per frame (the theme may have switched) */
function paletteColors(): { color(index: number): string; ink: string } {
  const style = getComputedStyle(document.documentElement)
  const cache = new Map<number, string>()
  return {
    color(index) {
      let value = cache.get(index)
      if (value === undefined) {
        value = style.getPropertyValue(`--collab-${index}`).trim()
        cache.set(index, value)
      }
      return value
    },
    ink: style.getPropertyValue('--collab-ink').trim(),
  }
}

const LABEL_FONT = '600 11px system-ui, sans-serif'
const LABEL_HEIGHT = 16
const LABEL_PADDING = 4

/** Above cell content and markers; screen only (skipped when printing). */
export class CollabPresenceExtension extends SheetExtension {
  readonly uKey = 'GenOfficeCollabPresenceExtension'
  protected Z_INDEX = 70

  override draw(
    ctx: UniverRenderingContext,
    _parentScale: IScale,
    skeleton: SpreadsheetSkeleton,
  ): void {
    if (renderState.peers.length === 0 || ctx.__mode === 'printing') return
    const worksheet = skeleton.worksheet
    if (!worksheet || worksheet.unitId !== renderState.workbookId) return
    const sheetId = worksheet.getSheetId()
    const peers = renderState.peers.filter((peer) => peer.sheetId === sheetId)
    if (peers.length === 0) return
    const colors = paletteColors()
    const { scaleX, scaleY } = ctx.getScale()
    const hairline = 1 / Math.max(scaleX, scaleY, 1)
    ctx.save()
    for (const peer of peers) {
      const boxes = presenceBoxes(peer.presence, (row, column) =>
        skeleton.getCellWithCoordByIndex(row, column, false),
      )
      const color = colors.color(peer.palette)
      if (!boxes || !color) continue
      const { selection, cell } = boxes
      ctx.globalAlpha = 0.12
      ctx.fillStyle = color
      ctx.fillRect(selection.x, selection.y, selection.width, selection.height)
      ctx.globalAlpha = 1
      ctx.strokeStyle = color
      ctx.lineWidth = hairline
      ctx.strokeRect(selection.x, selection.y, selection.width, selection.height)
      ctx.lineWidth = 2 * hairline
      ctx.strokeRect(cell.x, cell.y, cell.width, cell.height)
      ctx.font = LABEL_FONT
      const labelWidth = ctx.measureText(peer.name).width + LABEL_PADDING * 2
      // above the cell, or inside it on the first row
      const labelY = cell.y >= LABEL_HEIGHT ? cell.y - LABEL_HEIGHT : cell.y
      ctx.fillStyle = color
      ctx.fillRect(cell.x, labelY, labelWidth, LABEL_HEIGHT)
      ctx.fillStyle = colors.ink || color
      ctx.textBaseline = 'middle'
      ctx.fillText(peer.name, cell.x + LABEL_PADDING, labelY + LABEL_HEIGHT / 2)
    }
    ctx.restore()
  }
}

SpreadsheetExtensionRegistry.add(CollabPresenceExtension)

function repaint(runtime: UniverRuntime, workbookId: string): void {
  if (!workbookId) return
  try {
    const render = runtime.univer
      .__getInjector()
      .get(IRenderManagerService)
      .getRenderById(workbookId)
    render?.mainComponent?.makeDirty(true)
    render?.scene?.makeDirty(true)
  } catch {
    // the render unit goes away while a workbook is replaced
  }
}

/** show these peers on this workbook (an empty list clears the overlay) */
export function showPresences(
  runtime: UniverRuntime,
  workbookId: string,
  peers: readonly RemotePresence[],
): void {
  const previous = renderState.workbookId
  renderState = { workbookId, peers }
  // canvas text is not in the DOM: e2e drivers (debug hooks on) read the names here
  const debug =
    typeof window === 'undefined' ? null : (window as unknown as Record<string, unknown>)
  if (debug?.__genofficeDebugHooks === true) {
    debug.__genofficeCollabPresence = peers.map((peer) => peer.name)
  }
  repaint(runtime, workbookId)
  if (previous !== workbookId) repaint(runtime, previous)
}
