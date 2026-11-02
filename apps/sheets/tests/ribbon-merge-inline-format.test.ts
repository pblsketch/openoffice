// @vitest-environment jsdom
import {
  CommandType,
  EDITOR_ACTIVATED,
  ICommandService,
  IContextService,
  LocaleType,
  LogLevel,
  Univer,
  type IRange,
} from '@univerjs/core'
import { UniverDocsPlugin } from '@univerjs/docs'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import {
  SetInlineFormatBoldCommand,
  SetInlineFormatFontSizeCommand,
  SetInlineFormatItalicCommand,
  SetInlineFormatTextColorCommand,
} from '@univerjs/docs-ui'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import '@univerjs/sheets/facade'
import { FUniver } from '@univerjs/core/lib/facade'
import type { WorkbookOperation } from '@genoffice/xlsx-gateway/domain/workbook-dsl'
import { describe, expect, it } from 'vitest'

import { expandOverMerges, planRibbonMerge } from '../src/renderer/merge-selection'
import { handleRibbonCommand, type RibbonCommandContext } from '../src/renderer/ribbon-actions'

/// The sheet's merges without the unit/sheet ids Univer stamps on them.
function mergesOf(sheet: { getSheet(): { getMergeData(): IRange[] } }): IRange[] {
  return sheet
    .getSheet()
    .getMergeData()
    .map(({ startRow, startColumn, endRow, endColumn }) => ({
      startRow,
      startColumn,
      endRow,
      endColumn,
    }))
}

function area(startRow: number, startColumn: number, endRow: number, endColumn: number): IRange {
  return { startRow, startColumn, endRow, endColumn }
}

describe('planRibbonMerge', () => {
  it('merges a plain selection without touching other merges', () => {
    expect(planRibbonMerge(area(0, 0, 1, 2), [area(5, 0, 5, 3)], 'center')).toEqual({
      kind: 'merge',
      range: area(0, 0, 1, 2),
      replacesMerges: false,
    })
  })

  it('replaces merged cells inside a larger selection with one merge', () => {
    // A1:B1 is already merged; the user selects A1:D1 and presses Merge & Center
    expect(planRibbonMerge(area(0, 0, 0, 3), [area(0, 0, 0, 1)], 'center')).toEqual({
      kind: 'merge',
      range: area(0, 0, 0, 3),
      replacesMerges: true,
    })
  })

  it('grows the selection over a merge reaching past its edge', () => {
    // B1:C2 is merged; selecting A1:B1 must not cut it
    expect(expandOverMerges(area(0, 0, 0, 1), [area(0, 1, 1, 2)])).toEqual(area(0, 0, 1, 2))
    expect(planRibbonMerge(area(0, 0, 0, 1), [area(0, 1, 1, 2)], 'cells')).toEqual({
      kind: 'merge',
      range: area(0, 0, 1, 2),
      replacesMerges: true,
    })
  })

  it('keeps growing until no merge straddles the box', () => {
    // A1:B1 pulls in B1:B3, whose bottom row reaches into B3:D3
    const merges = [area(0, 1, 2, 1), area(2, 2, 2, 3)]
    expect(expandOverMerges(area(0, 0, 0, 1), [area(0, 1, 2, 1), area(2, 1, 2, 3)])).toEqual(
      area(0, 0, 2, 3),
    )
    // B3:D3 only touches the grown box, never the selection itself
    expect(expandOverMerges(area(0, 0, 0, 1), [merges[0]!, area(2, 1, 2, 3)])).toEqual(
      area(0, 0, 2, 3),
    )
  })

  it('makes Merge & Center a toggle on one merged cell', () => {
    expect(planRibbonMerge(area(0, 0, 0, 3), [area(0, 0, 0, 3)], 'center')).toEqual({
      kind: 'unmerge',
      range: area(0, 0, 0, 3),
    })
    expect(planRibbonMerge(area(0, 0, 0, 3), [area(0, 0, 0, 3)], 'cells')).toEqual({
      kind: 'none',
    })
  })

  it('does nothing for a single cell', () => {
    expect(planRibbonMerge(area(2, 2, 2, 2), [], 'center')).toEqual({ kind: 'none' })
  })
})

const UNIT_ID = 'ribbon-merge-wb'
const SHEET_ID = 'ribbon-merge-sheet'

function boot() {
  const univer = new Univer({
    logLevel: LogLevel.SILENT,
    locale: LocaleType.EN_US,
    locales: { [LocaleType.EN_US]: {} },
  })
  // ribbon-actions loads the sheets-ui facade, which reads the render manager
  univer.registerPlugin(UniverRenderEnginePlugin)
  univer.registerPlugin(UniverDocsPlugin)
  univer.registerPlugin(UniverSheetsPlugin)
  const univerAPI = FUniver.newAPI(univer)
  univerAPI.createWorkbook({
    id: UNIT_ID,
    name: 'merge',
    sheetOrder: [SHEET_ID],
    sheets: {
      [SHEET_ID]: {
        id: SHEET_ID,
        name: 'Sheet1',
        rowCount: 20,
        columnCount: 10,
        cellData: { 0: { 0: { v: 'Title' }, 2: { v: 'Note' } }, 1: { 0: { v: 'Heading: body' } } },
      },
    },
  })
  const workbook = univerAPI.getActiveWorkbook()!
  const sheet = workbook.getActiveSheet()
  const injector = univer.__getInjector()
  const messages: string[] = []
  const ranOps: WorkbookOperation[][] = []
  const lazyWorkbookRef: { current: unknown } = { current: null }
  const ctx = {
    univerRef: { current: { univer, univerAPI } },
    lazyWorkbookRef,
    setMessage: (message: string) => {
      messages.push(message)
    },
    runOps: (ops: readonly WorkbookOperation[]) => {
      ranOps.push([...ops])
      return Promise.resolve({ ok: true })
    },
  } as unknown as RibbonCommandContext
  const select = (a1: string) => workbook.setActiveRange(sheet.getRange(a1))
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  return {
    univer,
    univerAPI,
    injector,
    sheet,
    ctx,
    messages,
    ranOps,
    lazyWorkbookRef,
    select,
    settle,
  }
}

describe('ribbon merge against existing merges', () => {
  it('merges over an already merged block instead of refusing', async () => {
    const { sheet, ctx, messages, select, settle } = boot()
    sheet.getRange('A1:B1').merge()
    await settle()
    select('A1:D1')
    handleRibbonCommand(ctx, 'merge:center')
    await settle()
    expect(mergesOf(sheet)).toEqual([area(0, 0, 0, 3)])
    expect(messages.at(-1)).not.toMatch(/overlap/)
  })

  it('unmerges when Merge & Center is pressed on a merged cell', async () => {
    const { sheet, ctx, select, settle } = boot()
    sheet.getRange('A1:D1').merge()
    await settle()
    select('A1:D1')
    handleRibbonCommand(ctx, 'merge:center')
    await settle()
    expect(mergesOf(sheet)).toEqual([])
  })

  it('merges across rows that already hold merges', async () => {
    const { sheet, ctx, select, settle } = boot()
    sheet.getRange('A1:B1').merge()
    await settle()
    select('A1:C2')
    handleRibbonCommand(ctx, 'merge:across')
    await settle()
    expect(mergesOf(sheet)).toEqual([area(0, 0, 0, 2), area(1, 0, 1, 2)])
  })

  it('sends unmerge then merge as one plan for an opened file', async () => {
    const { sheet, ctx, ranOps, lazyWorkbookRef, select, settle } = boot()
    sheet.getRange('A1:B1').merge()
    await settle()
    lazyWorkbookRef.current = {}
    select('A1:D1')
    handleRibbonCommand(ctx, 'merge:center')
    expect(ranOps).toEqual([
      [
        { op: 'unmerge_cells', sheetId: SHEET_ID, range: 'A1:D1' },
        { op: 'merge_cells', sheetId: SHEET_ID, range: 'A1:D1' },
        {
          op: 'format_range',
          sheetId: SHEET_ID,
          range: 'A1',
          format: { horizontalAlign: 'center' },
        },
      ],
    ])
  })

  it('keeps a plain merge to the single merge op', () => {
    const { ctx, ranOps, lazyWorkbookRef, select } = boot()
    lazyWorkbookRef.current = {}
    select('A1:C1')
    handleRibbonCommand(ctx, 'merge:cells')
    expect(ranOps).toEqual([[{ op: 'merge_cells', sheetId: SHEET_ID, range: 'A1:C1' }]])
  })
})

describe('font buttons inside the cell editor', () => {
  function bootEditing() {
    const harness = boot()
    const calls: { id: string; params: unknown }[] = []
    const commandService = harness.injector.get(ICommandService)
    for (const id of [
      SetInlineFormatBoldCommand.id,
      SetInlineFormatItalicCommand.id,
      SetInlineFormatFontSizeCommand.id,
      SetInlineFormatTextColorCommand.id,
    ]) {
      commandService.registerCommand({
        id,
        type: CommandType.COMMAND,
        handler: (_accessor, params) => {
          calls.push({ id, params })
          return true
        },
      })
    }
    harness.select('A2')
    return { ...harness, calls }
  }

  it('bolds the selected characters, not the whole cell', async () => {
    const { injector, sheet, ctx, calls, settle } = bootEditing()
    injector.get(IContextService).setContextValue(EDITOR_ACTIVATED, true)
    handleRibbonCommand(ctx, 'bold')
    await settle()
    expect(calls.map((call) => call.id)).toEqual([SetInlineFormatBoldCommand.id])
    expect(sheet.getRange('A2').getCellStyleData()?.bl).toBeFalsy()
  })

  it('formats the whole cell when no editor is open', async () => {
    const { sheet, ctx, calls, settle } = bootEditing()
    handleRibbonCommand(ctx, 'bold')
    await settle()
    expect(calls).toEqual([])
    expect(sheet.getRange('A2').getCellStyleData()?.bl).toBe(1)
  })

  it('leaves the explicit Format Cells form on the cell', async () => {
    const { injector, sheet, ctx, calls, settle } = bootEditing()
    injector.get(IContextService).setContextValue(EDITOR_ACTIVATED, true)
    handleRibbonCommand(ctx, 'italic:on')
    await settle()
    expect(calls).toEqual([])
    expect(sheet.getRange('A2').getCellStyleData()?.it).toBe(1)
  })

  it('steps the size of the text under the caret and sets colors inline', async () => {
    const { injector, ctx, calls, settle } = bootEditing()
    injector.get(IContextService).setContextValue(EDITOR_ACTIVATED, true)
    handleRibbonCommand(ctx, 'font-size-step:1')
    handleRibbonCommand(ctx, 'font-color:#ff0000')
    handleRibbonCommand(ctx, 'font-color:auto')
    await settle()
    expect(calls).toEqual([
      // no run size at the caret: the cell's 11 pt steps to Excel's 12
      { id: SetInlineFormatFontSizeCommand.id, params: { value: 12 } },
      { id: SetInlineFormatTextColorCommand.id, params: { value: '#ff0000' } },
      { id: SetInlineFormatTextColorCommand.id, params: { value: null } },
    ])
  })
})
