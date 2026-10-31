import { ICommandService, LocaleType, LogLevel, Univer, UniverInstanceType } from '@univerjs/core'
import { FUniver } from '@univerjs/core/facade'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import '@univerjs/sheets/facade'
import {
  SetNumfmtCommand,
  SheetsNumfmtCellContentController,
  UniverSheetsNumfmtPlugin,
} from '@univerjs/sheets-numfmt'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/// The reported bug: format a Korean date with aaa/dddd and the weekday came
/// out English because Univer's numfmt controller starts on "en". Drives the
/// real interceptor so the assertion is the text the grid/CSV/print receives.
describe('numfmt cell display locale', () => {
  let univer: Univer
  let controller: { setNumfmtLocal(locale: string): void }
  let setPattern: (pattern: string) => void
  let display: () => string

  beforeAll(() => {
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
        s1: {
          id: 's1',
          name: 'Sheet1',
          rowCount: 10,
          columnCount: 5,
          // 46324 is 2026-10-29, a Thursday.
          cellData: { 0: { 0: { v: 46324 } } },
        },
      },
    })
    const injector = univer.__getInjector()
    const commands = injector.get(ICommandService)
    setPattern = (pattern) => {
      commands.syncExecuteCommand(SetNumfmtCommand.id, {
        unitId: 'wb',
        subUnitId: 's1',
        values: [{ row: 0, col: 0, pattern }],
      })
    }
    controller = injector.get(SheetsNumfmtCellContentController)
    display = () => {
      const sheet = FUniver.newAPI(univer).getActiveWorkbook()!.getActiveSheet()!
      return sheet.getRange(0, 0, 1, 1).getDisplayValues()[0]![0]!
    }
  })

  afterAll(() => {
    univer.dispose()
  })

  it('prints Korean weekday tokens after setNumfmtLocal', () => {
    setPattern('yyyy"년 "m"월 "d"일("aaa)')
    controller.setNumfmtLocal('en-US')
    expect(display()).toBe('2026년 10월 29일(Thu)')
    controller.setNumfmtLocal('ko-KR')
    expect(display()).toBe('2026년 10월 29일(목)')
  })

  it('covers long weekdays and month names too', () => {
    setPattern('aaaa mmmm d')
    controller.setNumfmtLocal('ko-KR')
    expect(display()).toBe('목요일 10월 29')
    controller.setNumfmtLocal('en-US')
    expect(display()).toBe('Thursday October 29')
  })

  it('switches back to English without recreating the workbook', () => {
    setPattern('aaa')
    controller.setNumfmtLocal('en-US')
    expect(display()).toBe('Thu')
    controller.setNumfmtLocal('ko-KR')
    expect(display()).toBe('목')
  })
})
