/**
 * Korean date input. Excel (and therefore Korean users) accept a cell entry
 * like `2026년 10월 29일` or `2026년 10월 29일 (목)` and store it as a date.
 * Univer's input parser only knows numeric/slash/dot date forms, so the raw
 * string would stay text. This interceptor converts the value after the raw
 * set, inside the same undo record, using the system short date for display.
 *
 * The value conversion needs no undo mutation: the command's own undo
 * restores the whole previous cell. The number format is set through the
 * numfmt service (like every other Format Cells edit) so later format changes
 * still win, and its undo only removes the inserted pattern.
 */
import {
  CellValueType,
  IUniverInstanceService,
  UniverInstanceType,
  isTextFormat,
  numfmt,
  type ICellData,
  type IMutationInfo,
  type IObjectMatrixPrimitiveType,
  type Workbook,
} from '@univerjs/core'
import {
  INumfmtService,
  SetNumfmtMutation,
  SetRangeValuesCommand,
  SetRangeValuesMutation,
  SheetInterceptorService,
  factorySetNumfmtUndoMutation,
  transformCellsToRange,
  type ISetRangeValuesMutationParams,
} from '@univerjs/sheets'

import { getSystemShortDate } from '@genoffice/xlsx-gateway/shared/short-date'
import { getLang } from './i18n/locale'
import type { UniverRuntime } from './univer-state'

const HANGUL_WEEKDAY = '(?:일|월|화|수|목|금|토)'
const WEEKDAY_SUFFIX = `(?:\\s*\\(?\\s*${HANGUL_WEEKDAY}(?:요일)?\\s*\\)?)?`
const FULL_DATE = new RegExp(
  `^(\\d{4})\\s*년\\s*(\\d{1,2})\\s*월\\s*(\\d{1,2})\\s*일${WEEKDAY_SUFFIX}$`,
)
const MONTH_DAY = new RegExp(`^(\\d{1,2})\\s*월\\s*(\\d{1,2})\\s*일${WEEKDAY_SUFFIX}$`)

interface KoreanDateParts {
  readonly year: number
  readonly month: number
  readonly day: number
}

/// 1900-system serial for a Korean date string, or null when it is not a date.
/// `10월 29일` (no year) uses the current year, like Excel Korea.
export function parseKoreanDateText(text: string, today = new Date()): number | null {
  const trimmed = text.trim()
  if (!trimmed.includes('년') && !trimmed.includes('월')) return null
  const parts = parseParts(trimmed, today)
  if (!parts) return null
  const { year, month, day } = parts
  if (year < 1900 || year > 9999) return null
  if (month < 1 || month > 12) return null
  if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null
  return numfmt.dateToSerial([year, month, day]) ?? null
}

function parseParts(text: string, today: Date): KoreanDateParts | null {
  const full = FULL_DATE.exec(text)
  if (full) {
    return { year: Number(full[1]), month: Number(full[2]), day: Number(full[3]) }
  }
  const short = MONTH_DAY.exec(text)
  if (short) {
    return { year: today.getFullYear(), month: Number(short[1]), day: Number(short[2]) }
  }
  return null
}

/// Applies to the app's Korean UI only; other languages keep Univer's input
/// behavior. The returned handle belongs in the tab's cleanup list.
export function installKoreanDateInput(runtime: UniverRuntime): { dispose(): void } {
  const injector = runtime.univer.__getInjector()
  const instances = injector.get(IUniverInstanceService)
  const numfmtService = injector.get(INumfmtService)
  const interceptors = injector.get(SheetInterceptorService)
  const disposable = interceptors.interceptCommand({
    getMutations(commandInfo) {
      const none = { redos: [], undos: [] }
      if (getLang() !== 'ko' || commandInfo.id !== SetRangeValuesCommand.id) return none
      const params = commandInfo.params as ISetRangeValuesMutationParams | undefined
      if (!params?.unitId || !params.subUnitId || !params.cellValue) return none
      const workbook = instances.getUnit<Workbook>(params.unitId, UniverInstanceType.UNIVER_SHEET)
      const worksheet = workbook?.getSheetBySheetId(params.subUnitId)
      if (!worksheet) return none

      const converted: IObjectMatrixPrimitiveType<ICellData> = {}
      const formatCells: { row: number; col: number; pattern: string }[] = []
      let convertedAny = false
      const pattern = getSystemShortDate()
      for (const [rowKey, row] of Object.entries(params.cellValue)) {
        const rowIndex = Number(rowKey)
        if (!Number.isInteger(rowIndex) || rowIndex < 0) continue
        if (!row || typeof row !== 'object') continue
        for (const [colKey, cell] of Object.entries(row as Record<string, ICellData | null>)) {
          const colIndex = Number(colKey)
          if (!Number.isInteger(colIndex) || colIndex < 0) continue
          if (!cell || typeof cell.v !== 'string' || cell.f || cell.p) continue
          // An explicit string type or a Text-formatted cell is intentional text.
          if (cell.t === CellValueType.STRING || cell.t === CellValueType.FORCE_STRING) continue
          const existing =
            worksheet.getCellStyle(rowIndex, colIndex)?.n?.pattern ??
            numfmtService.getValue(params.unitId, params.subUnitId, rowIndex, colIndex)?.pattern
          if (isTextFormat(existing)) continue
          const serial = parseKoreanDateText(cell.v)
          if (serial === null) continue
          converted[rowIndex] ??= {}
          converted[rowIndex][colIndex] = { v: serial, t: CellValueType.NUMBER }
          convertedAny = true
          // Keep an explicit number format the user already chose; General
          // (or no format) gets the same short date Excel applies on input.
          if (!existing || existing === 'General') {
            formatCells.push({ row: rowIndex, col: colIndex, pattern })
          }
        }
      }
      if (!convertedAny) return none

      const redos: IMutationInfo[] = [
        {
          id: SetRangeValuesMutation.id,
          params: {
            unitId: params.unitId,
            subUnitId: params.subUnitId,
            cellValue: converted,
          },
        },
      ]
      const undos: IMutationInfo[] = []
      if (formatCells.length > 0) {
        const numfmtParams = transformCellsToRange(params.unitId, params.subUnitId, formatCells)
        redos.push({ id: SetNumfmtMutation.id, params: numfmtParams })
        undos.push(...factorySetNumfmtUndoMutation(injector, numfmtParams))
      }
      // The value conversion needs no undo: the command's own undo restores
      // the whole previous cell. The numfmt undo only removes the pattern.
      return { redos, undos }
    },
  })
  return { dispose: () => disposable.dispose() }
}
