/**
 * Excel turns on Wrap Text when Alt+Enter starts a new line inside a cell.
 * Univer's BreakLineCommand inserts the paragraph break but leaves the cell's
 * wrap strategy on Overflow, so the second line is clipped in the grid.
 *
 * The wrap style is merged into the edit's own commit (the AFTER_CELL_EDIT
 * write interceptor) rather than set with a command while the editor is open:
 * a set-range-values mutation that touches the editing cell makes Univer
 * refresh the editor from the still-uncommitted cell and wipe the typed text.
 * Merging also keeps one undo step, exactly `tb` like the ribbon's Wrap Text
 * button, so the change journals and saves like any other format edit.
 *
 * The formula bar also executes BreakLineCommand (a line break inside a
 * formula); there is no cell editor state then, so it is left untouched.
 */
import { WrapStrategy, type ICellDataForSheetInterceptor } from '@univerjs/core'
import { BreakLineCommand } from '@univerjs/docs-ui'
import { AFTER_CELL_EDIT, SheetInterceptorService } from '@univerjs/sheets'
import { IEditorBridgeService } from '@univerjs/sheets-ui'

import { effectiveSheetProtection } from './sheet-protection'
import type { LazyWorkbookState, UniverRuntime } from './univer-state'

export interface AltEnterWrapDeps {
  /// Open file state; null for the in-memory demo workbook.
  getState: () => LazyWorkbookState | null
}

interface PendingCell {
  unitId: string
  sheetId: string
  row: number
  column: number
}

export function installAltEnterWrap(
  runtime: UniverRuntime,
  deps: AltEnterWrapDeps,
): { dispose(): void } {
  const injector = runtime.univer.__getInjector()
  const bridge = injector.get(IEditorBridgeService)
  const writeCellInterceptor = injector.get(SheetInterceptorService).writeCellInterceptor

  /// The cell whose open editor started a new line with Alt+Enter.
  let pending: PendingCell | null = null

  const recordLineBreak = runtime.univerAPI.addEvent(
    runtime.univerAPI.Event.CommandExecuted,
    (event) => {
      if (event.id !== BreakLineCommand.id) return
      const edit = bridge.getEditCellState()
      if (!edit) return
      pending = { unitId: edit.unitId, sheetId: edit.sheetId, row: edit.row, column: edit.column }
    },
  )

  const watchEditor = bridge.visible$.subscribe((state) => {
    if (state.visible) {
      // A new edit session never inherits the previous cell's pending wrap.
      pending = null
      return
    }
    // The commit that closes the editor consumes `pending` in its own
    // visible$ handler; an Esc leaves it behind, so drop it afterwards.
    setTimeout(() => {
      pending = null
    }, 0)
  })

  const writeCell = writeCellInterceptor.intercept(AFTER_CELL_EDIT, {
    priority: 100,
    handler: (cell, context, next) => {
      const target = pending
      if (
        !cell ||
        !target ||
        context.unitId !== target.unitId ||
        context.subUnitId !== target.sheetId ||
        context.row !== target.row ||
        context.col !== target.column
      ) {
        return next(cell)
      }
      pending = null
      // A protected sheet without "Format cells" refuses the style change (and
      // toasts); Excel likewise leaves the cell as is. Unknown protection (still
      // indexing) fails closed, matching the protection guard.
      const state = deps.getState()
      if (state) {
        const protection = effectiveSheetProtection(state, context.subUnitId)
        if (!protection || (protection.protected && !protection.allow.formatCells))
          return next(cell)
      }
      return next(withWrapStyle(cell))
    },
  })

  return {
    dispose() {
      recordLineBreak.dispose()
      watchEditor.unsubscribe()
      writeCell()
    },
  }
}

/// Adds the wrap strategy as a style delta, keeping any rich-text style the
/// editor produced for this write.
function withWrapStyle(cell: ICellDataForSheetInterceptor): ICellDataForSheetInterceptor {
  const style = typeof cell.s === 'object' && cell.s !== null ? cell.s : null
  return { ...cell, s: { ...style, tb: WrapStrategy.WRAP } }
}
