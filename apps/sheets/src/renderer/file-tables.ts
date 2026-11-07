import type { WorkbookFile } from '../shared/desktop-api'

type FileSheet = WorkbookFile['sheets'][number]
type FileTable = FileSheet['tables'][number]

export interface FileTableRegistration {
  readonly sheetId: string
  readonly tableIndex: number
  readonly tableId: string
  /// The structured-reference token the formula engine resolves.
  readonly tableName: string
  /// Table range without the totals band, so `Table[Column]` sums data only.
  readonly range: FileTable['range']
  readonly columns: readonly string[] | undefined
}

const INVALID_NAME_CHAR = /[^\p{L}\p{N}_.]/gu
const CELL_LIKE = /^(\$?[A-Za-z]{1,3}\$?[0-9]+|[rR]\d+[cC]\d+|\d+)$/

/// Cap at Excel's 255 UTF-16 units without splitting a trailing surrogate pair
/// (astral \p{L} letters such as CJK Ext-B would otherwise leave a lone high
/// surrogate that becomes U+FFFD when encoded).
function cutNameUnits(text: string, end: number): number {
  if (end <= 0 || end >= text.length) return end
  const high = text.charCodeAt(end - 1)
  const low = text.charCodeAt(end)
  if (high < 0xd800 || high > 0xdbff || low < 0xdc00 || low > 0xdfff) return end
  return end - 1
}

/// Excel table-name rules (letter/underscore start, no spaces, not a cell
/// address, 255 chars) applied to a file displayName so Univer accepts it.
export function sanitizeTableName(raw: string): string {
  let name = raw.trim().replace(INVALID_NAME_CHAR, '_')
  name = name.slice(0, cutNameUnits(name, 255))
  if (name.length === 0) return ''
  if (!/^[\p{L}_]/u.test(name) || CELL_LIKE.test(name)) name = `_${name}`
  return name.slice(0, cutNameUnits(name, 255))
}

export function fileTableId(sheetId: string, tableIndex: number): string {
  return `file-table-${sheetId}-${tableIndex}`
}

/// Names every header-bearing file table for the formula engine. Names are
/// unique case-insensitively across the workbook (Excel's rule; Univer only
/// checks exact matches) and never collide with a sheet name or a name in
/// `reserved` (session tables).
export function planFileTableRegistrations(
  sheets: readonly FileSheet[],
  reserved: Iterable<string> = [],
): FileTableRegistration[] {
  const taken = new Set<string>()
  for (const sheet of sheets) taken.add(sheet.name.toLowerCase())
  for (const name of reserved) taken.add(name.toLowerCase())
  const plan: FileTableRegistration[] = []
  let fallback = 0
  for (const sheet of sheets) {
    sheet.tables.forEach((table, tableIndex) => {
      // Univer's table header is not optional yet: registering a headerless
      // table injects synthesized "Column N" labels over the first data row.
      if (table.headerRowCount === 0) return
      let base = sanitizeTableName(table.name ?? '')
      if (base.length === 0) base = `Table${++fallback}`
      let candidate = base
      for (let suffix = 2; taken.has(candidate.toLowerCase()); suffix += 1) {
        const tail = `_${suffix}`
        candidate = `${base.slice(0, cutNameUnits(base, 255 - tail.length))}${tail}`
      }
      taken.add(candidate.toLowerCase())
      const totals = table.totalsRowCount ?? 0
      const endRow = Math.max(table.range.startRow, table.range.endRow - totals)
      plan.push({
        sheetId: sheet.id,
        tableIndex,
        tableId: fileTableId(sheet.id, tableIndex),
        tableName: candidate,
        range: { ...table.range, endRow },
        columns: table.columns?.length ? table.columns : undefined,
      })
    })
  }
  return plan
}
