// @vitest-environment jsdom
/**
 * The 2026-11-02 report: with columns B and D Ctrl-selected, "Delete selected
 * columns" removed only D. These run against a real Univer workbook: the real
 * remove commands, selection service and undo stack.
 */
import {
  ICommandService,
  IUndoRedoService,
  IUniverInstanceService,
  LocaleType,
  LogLevel,
  RANGE_TYPE,
  Univer,
} from '@univerjs/core'
import type { IRange } from '@univerjs/core'
import { SheetsSelectionsService, UniverSheetsPlugin } from '@univerjs/sheets'
import '@univerjs/sheets/facade'
import { FUniver } from '@univerjs/core/lib/facade'
import { describe, expect, it } from 'vitest'

import {
  installDisjointLineRemoval,
  mergeSpanUndoItems,
  removalSpans,
  removesEveryVisibleLine,
} from '../src/renderer/remove-disjoint-lines'
import type { UniverRuntime } from '../src/renderer/univer-state'

const cols = (startColumn: number, endColumn = startColumn): IRange => ({
  startRow: 0,
  endRow: 19,
  startColumn,
  endColumn,
  rangeType: RANGE_TYPE.COLUMN,
})
const rows = (startRow: number, endRow = startRow): IRange => ({
  startRow,
  endRow,
  startColumn: 0,
  endColumn: 9,
  rangeType: RANGE_TYPE.ROW,
})

describe('removalSpans', () => {
  it('lists the spans last first so earlier indices stay put', () => {
    expect(removalSpans([cols(1), cols(3), cols(6, 7)], 'column')).toEqual([
      { start: 6, end: 7 },
      { start: 3, end: 3 },
      { start: 1, end: 1 },
    ])
  })

  it('merges overlapping and touching areas, whatever order they were picked in', () => {
    expect(removalSpans([rows(5, 6), rows(1, 2), rows(3), rows(2, 4)], 'row')).toEqual([
      { start: 1, end: 6 },
    ])
  })

  it('takes the columns of plain cell areas too', () => {
    const cell = { startRow: 2, endRow: 3, startColumn: 4, endColumn: 4 }
    expect(removalSpans([cell, cols(0)], 'column')).toEqual([
      { start: 4, end: 4 },
      { start: 0, end: 0 },
    ])
  })
})

describe('removesEveryVisibleLine', () => {
  const visible = () => true
  it('is false while one visible line is left', () => {
    const spans = [
      { start: 3, end: 9 },
      { start: 0, end: 1 },
    ]
    expect(removesEveryVisibleLine(spans, 10, visible)).toBe(false)
  })

  it('is true when the spans cover them all', () => {
    const spans = [
      { start: 3, end: 9 },
      { start: 0, end: 2 },
    ]
    expect(removesEveryVisibleLine(spans, 10, visible)).toBe(true)
  })

  it('ignores hidden lines left between the spans', () => {
    const spans = [
      { start: 3, end: 9 },
      { start: 0, end: 1 },
    ]
    expect(removesEveryVisibleLine(spans, 10, (index) => index !== 2)).toBe(true)
  })
})

describe('mergeSpanUndoItems', () => {
  it('undoes the spans in reverse and redoes them in order', () => {
    const a = { undoMutations: ['undo-a'], redoMutations: ['redo-a'] }
    const b = { undoMutations: ['undo-b'], redoMutations: ['redo-b'] }
    const older = { undoMutations: ['old'], redoMutations: ['old'] }
    const stack = [older, a, b]
    expect(mergeSpanUndoItems(stack, [a, b])).toBe(true)
    expect(stack).toEqual([
      older,
      { undoMutations: ['undo-b', 'undo-a'], redoMutations: ['redo-a', 'redo-b'] },
    ])
  })

  it('leaves the stack alone when the items are no longer on top', () => {
    const a = { undoMutations: [], redoMutations: [] }
    const b = { undoMutations: [], redoMutations: [] }
    const later = { undoMutations: [], redoMutations: [] }
    const stack = [a, b, later]
    expect(mergeSpanUndoItems(stack, [a, b])).toBe(false)
    expect(stack).toEqual([a, b, later])
  })
})

function boot() {
  const univer = new Univer({
    logLevel: LogLevel.SILENT,
    locale: LocaleType.EN_US,
    locales: { [LocaleType.EN_US]: {} },
  })
  univer.registerPlugin(UniverSheetsPlugin)
  const univerAPI = FUniver.newAPI(univer)
  const cellData: Record<number, Record<number, { v: string }>> = {}
  for (let row = 0; row < 6; row++) {
    cellData[row] = {}
    for (let column = 0; column < 6; column++) {
      cellData[row]![column] = { v: `${'ABCDEF'[column]}${row + 1}` }
    }
  }
  univerAPI.createWorkbook({
    id: 'wb',
    name: 'disjoint',
    sheetOrder: ['s'],
    sheets: { s: { id: 's', name: 'Sheet1', rowCount: 20, columnCount: 10, cellData } },
  })
  const injector = univer.__getInjector()
  injector.get(IUniverInstanceService).focusUnit('wb')
  const runtime = { univer, univerAPI } as unknown as UniverRuntime
  const install = installDisjointLineRemoval(runtime)
  const select = (...ranges: IRange[]) =>
    injector
      .get(SheetsSelectionsService)
      .setSelections(ranges.map((range) => ({ range, primary: null, style: null })))
  const worksheet = univerAPI.getActiveWorkbook()!.getActiveSheet()!
  const headers = () => worksheet.getRange(0, 0, 1, 6).getValues()[0]
  const firstColumn = () =>
    worksheet
      .getRange(0, 0, 6, 1)
      .getValues()
      .map((row) => row[0])
  const commands = injector.get(ICommandService)
  const undoStack = () =>
    (
      injector.get(IUndoRedoService) as unknown as { _undoStacks: Map<string, unknown[]> }
    )._undoStacks.get('wb') ?? []
  return { univerAPI, install, select, headers, firstColumn, commands, undoStack }
}

/// The re-dispatch runs after the cancelled command has returned.
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

/// A gate refusing one column, the way a formula-span or protection check does.
function refuseColumn(univerAPI: FUniver, column: number) {
  return univerAPI.addEvent(univerAPI.Event.BeforeCommandExecute, (event) => {
    const range = (event.params as { range?: IRange } | undefined)?.range
    if (event.id === 'sheet.command.remove-col' && range?.startColumn === column) {
      event.cancel = true
    }
  })
}

describe('removing Ctrl-selected rows and columns', () => {
  it('removes every selected column, not just the last area', async () => {
    const { select, headers, commands, install } = boot()
    select(cols(1), cols(3))
    await commands.executeCommand('sheet.command.remove-col').catch(() => {})
    await settle()
    expect(headers()).toEqual(['A1', 'C1', 'E1', 'F1', null, null])
    install.dispose()
  })

  it('removes every selected row, whichever area was picked last', async () => {
    const { select, firstColumn, commands, install } = boot()
    select(rows(4), rows(1, 2))
    await commands.executeCommand('sheet.command.remove-row').catch(() => {})
    await settle()
    expect(firstColumn()).toEqual(['A1', 'A4', 'A6', null, null, null])
    install.dispose()
  })

  it('undoes and redoes the whole removal in one step', async () => {
    const { select, headers, commands, install, undoStack } = boot()
    select(cols(1), cols(3), cols(5))
    await commands.executeCommand('sheet.command.remove-col').catch(() => {})
    await settle()
    expect(headers()).toEqual(['A1', 'C1', 'E1', null, null, null])
    expect(undoStack()).toHaveLength(1)
    await commands.executeCommand('univer.command.undo')
    expect(headers()).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1'])
    await commands.executeCommand('univer.command.redo')
    expect(headers()).toEqual(['A1', 'C1', 'E1', null, null, null])
    install.dispose()
  })

  it('leaves a single selection to Univer', async () => {
    const { select, headers, commands, install } = boot()
    select(cols(2, 3))
    await commands.executeCommand('sheet.command.remove-col')
    expect(headers()).toEqual(['A1', 'B1', 'E1', 'F1', null, null])
    install.dispose()
  })

  it('stops at the first span a gate refuses', async () => {
    const { select, headers, commands, install, univerAPI } = boot()
    const gate = refuseColumn(univerAPI, 3)
    select(cols(1), cols(3), cols(5))
    await commands.executeCommand('sheet.command.remove-col').catch(() => {})
    await settle()
    // F went first, D was refused, so B stays too
    expect(headers()).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', null])
    gate.dispose()
    install.dispose()
  })

  it('undoes the spans that went before a refusal in one step', async () => {
    const { select, headers, commands, install, univerAPI, undoStack } = boot()
    const gate = refuseColumn(univerAPI, 1)
    select(cols(1), cols(3), cols(5))
    await commands.executeCommand('sheet.command.remove-col').catch(() => {})
    await settle()
    expect(headers()).toEqual(['A1', 'B1', 'C1', 'E1', null, null])
    expect(undoStack()).toHaveLength(1)
    await commands.executeCommand('univer.command.undo')
    expect(headers()).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1'])
    gate.dispose()
    install.dispose()
  })
})
