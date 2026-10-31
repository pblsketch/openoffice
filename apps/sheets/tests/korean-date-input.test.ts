import {
  CellValueType,
  ICommandService,
  IUniverInstanceService,
  LocaleType,
  LogLevel,
  RedoCommand,
  UndoCommand,
  Univer,
  UniverInstanceType,
  type ICellData,
  type Nullable,
  type Workbook,
} from '@univerjs/core'
import { FUniver } from '@univerjs/core/facade'
import {
  INumfmtService,
  SetNumfmtMutation,
  SetRangeValuesCommand,
  UniverSheetsPlugin,
  transformCellsToRange,
} from '@univerjs/sheets'
import '@univerjs/sheets/facade'
import { UniverSheetsNumfmtPlugin } from '@univerjs/sheets-numfmt'
import { getSystemShortDate, setSystemShortDate } from '@genoffice/xlsx-gateway/shared/short-date'
import type { Lang } from '@genoffice/i18n'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  createEditJournal,
  recordRemoveNumfmt,
  recordSetNumfmt,
  recordSetRangeValues,
} from '../src/renderer/edit-journal'
import { getLang, setModuleLang } from '../src/renderer/i18n/locale'
import { installKoreanDateInput, parseKoreanDateText } from '../src/renderer/korean-date-input'
import type { UniverRuntime } from '../src/renderer/univer-state'

const VALID = [
  ['2026년 10월 29일', 46324],
  ['2026 년 10 월 29 일', 46324],
  ['2026년 10월 29일 (목)', 46324],
  ['2026년 10월 29일(목요일)', 46324],
  ['2026년 10월 29일 목요일', 46324],
] as const

describe('parseKoreanDateText', () => {
  it.each(VALID)('%s → %s', (text, serial) => {
    expect(parseKoreanDateText(text)).toBe(serial)
  })

  it('uses the current year for a month/day entry', () => {
    expect(parseKoreanDateText('10월 29일', new Date(2026, 0, 1))).toBe(46324)
  })

  it('rejects invalid and non-Korean values', () => {
    expect(parseKoreanDateText('2026년 2월 30일')).toBeNull()
    expect(parseKoreanDateText('2026년 13월 1일')).toBeNull()
    expect(parseKoreanDateText('2026-10-29')).toBeNull()
    expect(parseKoreanDateText('메모 2026년 10월 29일')).toBeNull()
    expect(parseKoreanDateText('1899년 10월 29일')).toBeNull()
  })
})

describe('converted cell journal', () => {
  it('records the serial and the short-date number format for saving', () => {
    const journal = createEditJournal()
    recordSetRangeValues(journal, 's1', {
      0: { 0: { v: 46324, t: CellValueType.NUMBER } },
    })
    recordSetNumfmt(
      journal,
      's1',
      transformCellsToRange('wb', 's1', [{ row: 0, col: 0, pattern: 'yyyy. m. d.' }]),
    )
    expect(journal.cells.get('s1')?.get('0:0')).toMatchObject({
      value: 46324,
      style: { numberFormat: 'yyyy. m. d.' },
    })
    // Undoing the inserted format removes it (General on save); the cell
    // keeps its prior value.
    recordSetRangeValues(journal, 's1', { 0: { 0: { v: 42 } } })
    recordRemoveNumfmt(journal, 's1', {
      ranges: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 }],
    })
    expect(journal.cells.get('s1')?.get('0:0')).toMatchObject({
      value: 42,
      style: { numberFormat: 'General' },
    })
  })
})

function cellRaw(instances: IUniverInstanceService, row: number, col: number): Nullable<ICellData> {
  const workbook = instances.getUnit<Workbook>('wb', UniverInstanceType.UNIVER_SHEET)!
  return workbook.getSheetBySheetId('s1')!.getCellRaw(row, col)
}

function cellPattern(
  instances: IUniverInstanceService,
  numfmtService: INumfmtService,
  row: number,
  col: number,
): string | undefined {
  const workbook = instances.getUnit<Workbook>('wb', UniverInstanceType.UNIVER_SHEET)!
  const worksheet = workbook.getSheetBySheetId('s1')!
  return (
    worksheet.getCellStyle(row, col)?.n?.pattern ??
    numfmtService.getValue('wb', 's1', row, col)?.pattern
  )
}

describe('Korean date input in the grid', () => {
  let univer: Univer
  let runtime: UniverRuntime
  let commands: ICommandService
  let instances: IUniverInstanceService
  let numfmtService: INumfmtService
  let disposeInput: () => void
  let previousShortDate: string
  let previousLang: Lang

  beforeAll(() => {
    previousShortDate = getSystemShortDate()
    previousLang = getLang()
    setSystemShortDate('yyyy. m. d.')
    setModuleLang('ko')
    univer = new Univer({
      locale: LocaleType.EN_US,
      locales: { [LocaleType.EN_US]: {} },
      logLevel: LogLevel.SILENT,
    })
    univer.registerPlugin(UniverSheetsPlugin)
    univer.registerPlugin(UniverSheetsNumfmtPlugin)
    univer.createUnit(UniverInstanceType.UNIVER_SHEET, {
      id: 'wb',
      sheetOrder: ['s1'],
      sheets: {
        s1: { id: 's1', name: 'Sheet1', rowCount: 10, columnCount: 5, cellData: {} },
      },
    })
    runtime = { univer } as never
    const injector = univer.__getInjector()
    commands = injector.get(ICommandService)
    instances = injector.get(IUniverInstanceService)
    numfmtService = injector.get(INumfmtService)
    disposeInput = installKoreanDateInput(runtime).dispose
  })

  afterAll(() => {
    disposeInput()
    setSystemShortDate(previousShortDate)
    setModuleLang(previousLang)
    univer.dispose()
  })

  function typeInto(row: number, value: string): void {
    commands.syncExecuteCommand(SetRangeValuesCommand.id, {
      unitId: 'wb',
      subUnitId: 's1',
      range: { startRow: row, startColumn: 0, endRow: row, endColumn: 0 },
      value: { v: value },
    })
  }

  it('stores a Korean date as a serial with the system short date', () => {
    typeInto(0, '2026년 10월 29일 (목)')
    expect(cellRaw(instances, 0, 0)).toMatchObject({ v: 46324, t: CellValueType.NUMBER })
    const sheet = FUniver.newAPI(univer).getActiveWorkbook()!.getActiveSheet()!
    expect(sheet.getRange('A1').getDisplayValue()).toBe('2026. 10. 29.')
    expect(cellPattern(instances, numfmtService, 0, 0)).toBe('yyyy. m. d.')

    // The conversion is part of the same undo record: one undo clears the
    // value, one redo brings the value and its date format back.
    instances.focusUnit('wb')
    commands.syncExecuteCommand(UndoCommand.id)
    expect(cellRaw(instances, 0, 0)).toBeUndefined()
    expect(cellPattern(instances, numfmtService, 0, 0)).toBeUndefined()
    commands.syncExecuteCommand(RedoCommand.id)
    expect(cellRaw(instances, 0, 0)).toMatchObject({ v: 46324 })
    expect(cellPattern(instances, numfmtService, 0, 0)).toBe('yyyy. m. d.')
  })

  it('keeps an explicit number format', () => {
    commands.syncExecuteCommand(
      SetNumfmtMutation.id,
      transformCellsToRange('wb', 's1', [{ row: 1, col: 0, pattern: '0.00' }]),
    )
    typeInto(1, '2026년 10월 29일')
    expect(cellRaw(instances, 1, 0)).toMatchObject({ v: 46324 })
    expect(cellPattern(instances, numfmtService, 1, 0)).toBe('0.00')
  })

  it('leaves Text-formatted cells and invalid dates as text', () => {
    commands.syncExecuteCommand(
      SetNumfmtMutation.id,
      transformCellsToRange('wb', 's1', [{ row: 2, col: 0, pattern: '@' }]),
    )
    typeInto(2, '2026년 10월 29일')
    expect(cellRaw(instances, 2, 0)).toMatchObject({ v: '2026년 10월 29일' })
    typeInto(3, '2026년 2월 30일')
    expect(cellRaw(instances, 3, 0)).toMatchObject({ v: '2026년 2월 30일' })
  })

  it('undoes a conversion over a non-empty cell back to its prior value', () => {
    typeInto(5, '42')
    typeInto(5, '2026년 10월 29일')
    expect(cellRaw(instances, 5, 0)).toMatchObject({ v: 46324 })
    expect(cellPattern(instances, numfmtService, 5, 0)).toBe('yyyy. m. d.')
    instances.focusUnit('wb')
    commands.syncExecuteCommand(UndoCommand.id)
    expect(cellRaw(instances, 5, 0)).toMatchObject({ v: 42 })
    expect(cellPattern(instances, numfmtService, 5, 0)).toBeUndefined()
  })

  it('lets a later number-format change win over the inserted date format', () => {
    commands.syncExecuteCommand(
      SetNumfmtMutation.id,
      transformCellsToRange('wb', 's1', [{ row: 0, col: 0, pattern: '0.00' }]),
    )
    const sheet = FUniver.newAPI(univer).getActiveWorkbook()!.getActiveSheet()!
    expect(cellPattern(instances, numfmtService, 0, 0)).toBe('0.00')
    expect(sheet.getRange('A1').getDisplayValue()).toBe('46324.00')
  })

  it('does nothing outside the Korean UI', () => {
    setModuleLang('en')
    try {
      typeInto(4, '2026년 10월 29일')
      expect(cellRaw(instances, 4, 0)).toMatchObject({ v: '2026년 10월 29일' })
    } finally {
      setModuleLang('ko')
    }
  })
})
