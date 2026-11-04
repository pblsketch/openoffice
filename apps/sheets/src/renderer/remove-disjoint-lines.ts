/**
 * Excel-style removal of Ctrl-selected rows or columns. Univer's remove
 * commands (the context menu's "Delete selected rows/columns", Ctrl+-) act on
 * the last selection only, so picking columns B and D removed D and left B,
 * with the selection still drawn over the shifted columns (2026-11-02 report).
 * When the selection has more than one area, the command is cancelled and
 * re-dispatched once per merged span, bottom/right first so the indices of
 * the spans still to go stay put. Each span passes the usual gates (sheet
 * protection, pivot sheets, formula spans); the first one refused stops the
 * rest. The spans then undo as one step, as in Excel.
 */
import { IUndoRedoService, IUniverInstanceService, RANGE_TYPE } from '@univerjs/core'
import type { IRange } from '@univerjs/core'
import { SheetsSelectionsService, getSheetCommandTarget } from '@univerjs/sheets'

import type { UniverRuntime } from './univer-state'

export type LineAxis = 'row' | 'column'

const REMOVE_COMMANDS: Record<string, { axis: LineAxis; confirm: boolean }> = {
  'sheet.command.remove-row-confirm': { axis: 'row', confirm: true },
  'sheet.command.remove-col-confirm': { axis: 'column', confirm: true },
  'sheet.command.remove-row': { axis: 'row', confirm: false },
  'sheet.command.remove-col': { axis: 'column', confirm: false },
}

const PLAIN_COMMAND: Record<LineAxis, string> = {
  row: 'sheet.command.remove-row',
  column: 'sheet.command.remove-col',
}

const CONFIRM_COMMAND: Record<LineAxis, string> = {
  row: 'sheet.command.remove-row-confirm',
  column: 'sheet.command.remove-col-confirm',
}

export interface LineSpan {
  readonly start: number
  readonly end: number
}

/// The selection's rows (or columns), overlapping and touching areas merged,
/// last span first — the order that keeps the remaining indices valid.
export function removalSpans(selections: readonly IRange[], axis: LineAxis): LineSpan[] {
  const spans = selections
    .map((range) =>
      axis === 'row'
        ? { start: range.startRow, end: range.endRow }
        : { start: range.startColumn, end: range.endColumn },
    )
    .filter((span) => Number.isFinite(span.start) && Number.isFinite(span.end))
    .map((span) => ({ start: Math.max(0, span.start), end: Math.max(0, span.end) }))
    .sort((a, b) => a.start - b.start)
  const merged: { start: number; end: number }[] = []
  for (const span of spans) {
    const last = merged[merged.length - 1]
    if (last && span.start <= last.end + 1) last.end = Math.max(last.end, span.end)
    else merged.push({ ...span })
  }
  return merged.reverse()
}

/// True when no visible line survives the removal — Univer refuses that with
/// an alert, and so must the multi-area path.
export function removesEveryVisibleLine(
  spans: readonly LineSpan[],
  lineCount: number,
  isVisible: (index: number) => boolean,
): boolean {
  const ascending = [...spans].reverse()
  let next = 0
  for (const span of ascending) {
    for (let index = next; index < Math.min(span.start, lineCount); index++) {
      if (isVisible(index)) return false
    }
    next = Math.max(next, span.end + 1)
  }
  for (let index = next; index < lineCount; index++) {
    if (isVisible(index)) return false
  }
  return true
}

interface UndoItem {
  undoMutations: unknown[]
  redoMutations: unknown[]
}

interface UndoStackAccess {
  _getUndoStack?: (unitId: string) => UndoItem[] | undefined
  _updateStatus?: () => void
}

/**
 * Folds the undo items the spans pushed into one. Univer's own undo batching
 * appends each item's undo mutations in order, which would re-insert the first
 * removed span before the later ones are back and land it at the wrong index;
 * undo has to run the spans in reverse. Leaves the stack alone unless the
 * items are still its top entries, in order.
 */
export function mergeSpanUndoItems(stack: UndoItem[], items: readonly UndoItem[]): boolean {
  if (items.length < 2 || stack.length < items.length) return false
  const top = stack.slice(stack.length - items.length)
  if (top.some((item, index) => item !== items[index])) return false
  stack.splice(stack.length - items.length, items.length, {
    ...items[0],
    undoMutations: [...items].reverse().flatMap((item) => item.undoMutations),
    redoMutations: items.flatMap((item) => item.redoMutations),
  })
  return true
}

async function removeSpans(runtime: UniverRuntime, axis: LineAxis, spans: readonly LineSpan[]) {
  const injector = runtime.univer.__getInjector()
  const target = getSheetCommandTarget(injector.get(IUniverInstanceService))
  if (!target) return
  const undo = injector.get(IUndoRedoService) as unknown as UndoStackAccess
  const stack = () => undo._getUndoStack?.(target.unitId)
  const pushed: UndoItem[] = []
  for (const span of spans) {
    const range: IRange =
      axis === 'row'
        ? {
            startRow: span.start,
            endRow: span.end,
            startColumn: 0,
            endColumn: 0,
            rangeType: RANGE_TYPE.ROW,
          }
        : {
            startRow: 0,
            endRow: 0,
            startColumn: span.start,
            endColumn: span.end,
            rangeType: RANGE_TYPE.COLUMN,
          }
    const before = stack()?.at(-1)
    let done = false
    try {
      done = (await runtime.univerAPI.executeCommand(PLAIN_COMMAND[axis], { range })) !== false
    } catch {
      // A refused span already surfaced its own message.
    }
    if (!done) break
    const after = stack()?.at(-1)
    if (after && after !== before) pushed.push(after)
  }
  const current = stack()
  if (current && mergeSpanUndoItems(current, pushed)) undo._updateStatus?.()
}

export function installDisjointLineRemoval(runtime: UniverRuntime): { dispose(): void } {
  return runtime.univerAPI.addEvent(runtime.univerAPI.Event.BeforeCommandExecute, (event) => {
    const command = REMOVE_COMMANDS[event.id]
    if (!command || event.cancel) return
    if ((event.params as { range?: IRange } | undefined)?.range) return
    const injector = runtime.univer.__getInjector()
    const target = getSheetCommandTarget(injector.get(IUniverInstanceService))
    const selections = injector
      .get(SheetsSelectionsService)
      .getCurrentSelections()
      .map((selection) => selection.range)
    if (!target || selections.length < 2) return
    const spans = removalSpans(selections, command.axis)
    if (spans.length === 0) return
    event.cancel = true
    const { worksheet } = target
    const everyLine =
      command.axis === 'row'
        ? removesEveryVisibleLine(spans, worksheet.getMaxRows(), (row) =>
            worksheet.getRowVisible(row),
          )
        : removesEveryVisibleLine(spans, worksheet.getMaxColumns(), (column) =>
            worksheet.getColVisible(column),
          )
    if (everyLine) {
      // the confirm command shows Univer's "cannot delete every row/column" alert
      const whole: IRange = {
        startRow: 0,
        endRow: Math.max(worksheet.getMaxRows() - 1, 0),
        startColumn: 0,
        endColumn: Math.max(worksheet.getMaxColumns() - 1, 0),
      }
      void runtime.univerAPI
        .executeCommand(CONFIRM_COMMAND[command.axis], { range: whole })
        .catch(() => {})
      return
    }
    void removeSpans(runtime, command.axis, spans)
  })
}
