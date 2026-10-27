/**
 * The op stream of a shared workbook (LAN co-editing, decision 0073). An op is
 * the batch of Univer mutations one action produced on a peer, rewritten so
 * any other peer can replay it: every peer opens its own `file-<sha>` unit, so
 * the unit id travels as a placeholder; every unit pools its styles itself,
 * so style ids travel as the style objects; and sheet ids are the host's
 * (a guest that reloaded from the host's bytes may know a sheet by another id).
 *
 * Nothing here touches Univer: the binding feeds plain params in and out.
 */
import type { EditJournal } from '../edit-journal'
import {
  AXIS_ATTR_MUTATIONS,
  CF_MUTATIONS,
  DEFINED_NAME_MUTATIONS,
  DV_MUTATIONS,
  FILTER_MUTATIONS,
  MERGE_MUTATIONS,
  MOVE_RANGE_MUTATION,
  MOVE_ROWS_MUTATION,
  NOTE_MUTATIONS,
  REMOVE_NUMFMT_MUTATION,
  REORDER_RANGE_MUTATION,
  ROW_COLUMN_MUTATIONS,
  SET_FROZEN_MUTATION,
  SET_NUMFMT_MUTATION,
  SET_RANGE_VALUES_MUTATION,
  SET_RIGHT_TO_LEFT_MUTATION,
  SHEET_LIFECYCLE_MUTATIONS,
  TOGGLE_GRIDLINES_MUTATION,
} from '../app-constants'

export const UNIT_PLACEHOLDER = '@collab-unit'

export interface WireMutation {
  readonly id: string
  readonly params: unknown
}

export interface SheetOp {
  /** the batch, in the order the peer ran it */
  readonly m: readonly WireMutation[]
  /** the layout generation the batch was made against (see changesLayout) */
  readonly l: number
  /** the host's running number for its own ops; guests' ops have none */
  readonly n?: number
  /** a guest's reload count: after the host refuses one of its ops, the rest of that copy's go too */
  readonly g?: number
}

const INSERT_SHEET = 'sheet.mutation.insert-sheet'
const REMOVE_SHEET = 'sheet.mutation.remove-sheet'
const CELL_MUTATIONS = new Set([
  SET_RANGE_VALUES_MUTATION,
  SET_NUMFMT_MUTATION,
  REMOVE_NUMFMT_MUTATION,
])
const VIEW_MUTATIONS = new Set([
  SET_FROZEN_MUTATION,
  TOGGLE_GRIDLINES_MUTATION,
  SET_RIGHT_TO_LEFT_MUTATION,
])
/** sheet-level settings that move no cell and no formula text */
const SHEET_META_MUTATIONS = new Set([
  'sheet.mutation.set-tab-color',
  'sheet.mutation.set-worksheet-hidden',
])
/** mutations after which a position means another cell */
const LAYOUT_MUTATIONS = new Set([
  ...Object.keys(ROW_COLUMN_MUTATIONS),
  MOVE_RANGE_MUTATION,
  MOVE_ROWS_MUTATION,
  REORDER_RANGE_MUTATION,
  REMOVE_SHEET,
])
/** these journal a snapshot of the cells they touched, so those cells must be resident */
const RESIDENT_MUTATIONS = new Set([
  MOVE_RANGE_MUTATION,
  MOVE_ROWS_MUTATION,
  REORDER_RANGE_MUTATION,
  ...FILTER_MUTATIONS,
])

/**
 * What travels: the mutations the edit journal records, so a replay reaches
 * the host's save the same way the host's own edit would. Zoom is a view of
 * one person; grid growth and auto heights are derived on every peer.
 */
const SHARED_MUTATIONS = new Set<string>([
  ...CELL_MUTATIONS,
  ...Object.keys(ROW_COLUMN_MUTATIONS),
  ...Object.keys(MERGE_MUTATIONS),
  ...Object.keys(AXIS_ATTR_MUTATIONS),
  ...SHEET_LIFECYCLE_MUTATIONS,
  REORDER_RANGE_MUTATION,
  MOVE_RANGE_MUTATION,
  MOVE_ROWS_MUTATION,
  ...FILTER_MUTATIONS,
  ...CF_MUTATIONS,
  ...DV_MUTATIONS,
  ...DEFINED_NAME_MUTATIONS,
  ...NOTE_MUTATIONS,
  ...VIEW_MUTATIONS,
])

export function isSharedMutation(id: string): boolean {
  return SHARED_MUTATIONS.has(id)
}

export function changesLayout(op: SheetOp): boolean {
  return op.m.some((mutation) => LAYOUT_MUTATIONS.has(mutation.id))
}

export function needsResidentCells(op: SheetOp): boolean {
  return op.m.some((mutation) => RESIDENT_MUTATIONS.has(mutation.id))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Plain deep copy: strings equal to `from` become `to`, and a style id under
 * an `s` key becomes the style itself when `styleOf` knows it.
 */
function rewrite(
  value: unknown,
  from: string,
  to: string,
  styleOf?: (id: string) => unknown,
): unknown {
  if (typeof value === 'string') return value === from ? to : value
  if (typeof value === 'function') return undefined
  if (Array.isArray(value)) return value.map((entry) => rewrite(entry, from, to, styleOf) ?? null)
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      const style = key === 's' && typeof entry === 'string' ? styleOf?.(entry) : undefined
      const copied = style != null ? rewrite(style, from, to) : rewrite(entry, from, to, styleOf)
      if (copied !== undefined) out[key] = copied
    }
    return out
  }
  return value
}

const SHEET_KEYS = ['subUnitId', 'sheetId', 'localSheetId'] as const

function mapSheets(params: unknown, map: (id: string) => string): unknown {
  if (!isRecord(params)) return params
  const out: Record<string, unknown> = { ...params }
  for (const key of SHEET_KEYS) {
    const id = out[key]
    if (typeof id === 'string') out[key] = map(id)
  }
  for (const key of ['from', 'to']) {
    const side = out[key]
    if (isRecord(side) && typeof side.subUnitId === 'string') {
      out[key] = { ...side, subUnitId: map(side.subUnitId) }
    }
  }
  return out
}

export interface CaptureContext {
  /** this peer's unit */
  readonly unitId: string
  /** a style of this unit's pool, or null */
  styleOf(id: string): unknown
  /** this peer's sheet id → the host's */
  hostSheet(id: string): string
}

/** a mutation as it ran here → as it travels */
export function toWire(id: string, params: unknown, context: CaptureContext): WireMutation {
  const plain = rewrite(params, context.unitId, UNIT_PLACEHOLDER, (style) => context.styleOf(style))
  // Univer stamps the command that ran it; the replay runs no command
  if (isRecord(plain)) delete plain.trigger
  return { id, params: mapSheets(plain, (sheet) => context.hostSheet(sheet)) }
}

/** a mutation as it travels → as it runs here */
export function fromWire(
  mutation: WireMutation,
  unitId: string,
  localSheet: (id: string) => string,
): WireMutation {
  return {
    id: mutation.id,
    params: mapSheets(rewrite(mutation.params, UNIT_PLACEHOLDER, unitId), localSheet),
  }
}

/** a received op's shape, before anything of it runs */
export function isSheetOp(value: unknown): value is SheetOp {
  if (!isRecord(value) || !Array.isArray(value.m) || value.m.length === 0) return false
  if (typeof value.l !== 'number') return false
  if (value.n !== undefined && typeof value.n !== 'number') return false
  if (value.g !== undefined && typeof value.g !== 'number') return false
  return value.m.every(
    (mutation) =>
      isRecord(mutation) && typeof mutation.id === 'string' && isSharedMutation(mutation.id),
  )
}

// ---- concurrency ----------------------------------------------------------

interface Box {
  readonly startRow: number
  readonly endRow: number
  readonly startColumn: number
  readonly endColumn: number
}

type Footprint =
  | { readonly kind: 'cells'; readonly sheet: string; readonly boxes: readonly Box[] }
  | {
      readonly kind: 'lines'
      readonly sheet: string
      readonly axis: 'row' | 'column'
      readonly spans: readonly (readonly [number, number])[]
    }
  | { readonly kind: 'note'; readonly sheet: string; readonly row: number; readonly col: number }
  | { readonly kind: 'setting'; readonly sheet: string; readonly what: string }
  | { readonly kind: 'other' }

function isBox(value: unknown): value is Box {
  return (
    isRecord(value) &&
    typeof value.startRow === 'number' &&
    typeof value.endRow === 'number' &&
    typeof value.startColumn === 'number' &&
    typeof value.endColumn === 'number'
  )
}

/** the rectangle a cell matrix ({row: {col: cell}}) covers */
function matrixBox(matrix: unknown): Box | null {
  if (!isRecord(matrix)) return null
  let startRow = Infinity
  let endRow = -Infinity
  let startColumn = Infinity
  let endColumn = -Infinity
  for (const [rowKey, row] of Object.entries(matrix)) {
    if (!isRecord(row)) continue
    const rowIndex = Number(rowKey)
    for (const columnKey of Object.keys(row)) {
      const columnIndex = Number(columnKey)
      if (!Number.isFinite(rowIndex) || !Number.isFinite(columnIndex)) return null
      startRow = Math.min(startRow, rowIndex)
      endRow = Math.max(endRow, rowIndex)
      startColumn = Math.min(startColumn, columnIndex)
      endColumn = Math.max(endColumn, columnIndex)
    }
  }
  return startRow === Infinity ? null : { startRow, endRow, startColumn, endColumn }
}

function footprintOf(mutation: WireMutation): Footprint | null {
  const params = isRecord(mutation.params) ? mutation.params : {}
  const sheet = typeof params.subUnitId === 'string' ? params.subUnitId : null
  if (mutation.id === SET_RANGE_VALUES_MUTATION) {
    if (sheet === null) return { kind: 'other' }
    const box = matrixBox(params.cellValue)
    // nothing to write (or keys that are not cells): conservatively a conflict
    return box ? { kind: 'cells', sheet, boxes: [box] } : { kind: 'other' }
  }
  if (mutation.id === SET_NUMFMT_MUTATION || mutation.id === REMOVE_NUMFMT_MUTATION) {
    if (sheet === null) return { kind: 'other' }
    const ranges: unknown[] = Array.isArray(params.ranges) ? params.ranges : []
    if (isRecord(params.values)) {
      for (const entry of Object.values(params.values)) {
        if (isRecord(entry) && Array.isArray(entry.ranges)) ranges.push(...entry.ranges)
      }
    }
    return ranges.length > 0 && ranges.every(isBox)
      ? { kind: 'cells', sheet, boxes: ranges }
      : { kind: 'other' }
  }
  const axis = AXIS_ATTR_MUTATIONS[mutation.id]
  if (axis) {
    const ranges: unknown[] = Array.isArray(params.ranges) ? params.ranges : []
    if (sheet === null || ranges.length === 0 || !ranges.every(isBox)) return { kind: 'other' }
    return {
      kind: 'lines',
      sheet,
      axis: axis.axis,
      spans: ranges.map((range) =>
        axis.axis === 'row'
          ? ([range.startRow, range.endRow] as const)
          : ([range.startColumn, range.endColumn] as const),
      ),
    }
  }
  if (NOTE_MUTATIONS.has(mutation.id)) {
    const noteSheet = typeof params.sheetId === 'string' ? params.sheetId : sheet
    if (noteSheet === null || typeof params.row !== 'number' || typeof params.col !== 'number') {
      return { kind: 'other' }
    }
    return { kind: 'note', sheet: noteSheet, row: params.row, col: params.col }
  }
  if (VIEW_MUTATIONS.has(mutation.id) || SHEET_META_MUTATIONS.has(mutation.id)) {
    return sheet === null ? { kind: 'other' } : { kind: 'setting', sheet, what: mutation.id }
  }
  return { kind: 'other' }
}

function boxesMeet(a: readonly Box[], b: readonly Box[]): boolean {
  return a.some((one) =>
    b.some(
      (two) =>
        one.startRow <= two.endRow &&
        two.startRow <= one.endRow &&
        one.startColumn <= two.endColumn &&
        two.startColumn <= one.endColumn,
    ),
  )
}

function footprintsCommute(a: Footprint, b: Footprint): boolean {
  if (a.kind === 'other' || b.kind === 'other') return false
  if (a.kind !== b.kind || a.sheet !== b.sheet) return true
  switch (a.kind) {
    case 'cells':
      return !boxesMeet(a.boxes, (b as typeof a).boxes)
    case 'lines': {
      const other = b as typeof a
      if (a.axis !== other.axis) return true
      return !a.spans.some(([start, end]) =>
        other.spans.some(([otherStart, otherEnd]) => start <= otherEnd && otherStart <= end),
      )
    }
    case 'note':
      return a.row !== (b as typeof a).row || a.col !== (b as typeof a).col
    case 'setting':
      return a.what !== (b as typeof a).what
  }
}

/**
 * Whether two ops end the same in either order. Value and format edits of
 * different cells, sizes of different lines, notes on different cells and
 * different sheet settings commute; anything that moves cells or touches a
 * rule set does not.
 */
export function opsCommute(a: SheetOp, b: SheetOp): boolean {
  const left = a.m.map(footprintOf)
  const right = b.m.map(footprintOf)
  return left.every(
    (one) => one === null || right.every((two) => two === null || footprintsCommute(one, two)),
  )
}

// ---- targets --------------------------------------------------------------

/** what this peer's workbook holds, for checking an op before any of it runs */
export interface TargetLookup {
  sheet(id: string): boolean
  cfRule(sheetId: string, cfId: string): boolean
  dvRule(sheetId: string, ruleId: string): boolean
  /** the id of the defined name `name` in `scope`, or null */
  nameId(name: string, scope: string): string | null
  name(id: string): boolean
}

const WORKBOOK_SCOPE = 'AllDefaultWorkbook'

/**
 * The first thing an op (already rebound to this peer) addresses that this
 * workbook does not have, or null. Ids created earlier in the same batch
 * count as present. A mutation aimed at a missing rule or sheet would be a
 * silent no-op on one peer and an edit on another.
 */
export function missingTarget(op: SheetOp, lookup: TargetLookup): string | null {
  const sheets = new Set<string>()
  const cfRules = new Set<string>()
  const dvRules = new Set<string>()
  const names = new Map<string, string>()
  const removedNames = new Set<string>()
  const hasSheet = (id: string): boolean => sheets.has(id) || lookup.sheet(id)
  for (const mutation of op.m) {
    const params = isRecord(mutation.params) ? mutation.params : {}
    if (mutation.id === INSERT_SHEET) {
      const id = isRecord(params.sheet) ? params.sheet.id : undefined
      if (typeof id !== 'string' || hasSheet(id)) return `sheet ${String(id)}`
      sheets.add(id)
      continue
    }
    for (const key of ['subUnitId', 'sheetId'] as const) {
      const id = params[key]
      if (typeof id === 'string' && !hasSheet(id)) return `sheet ${id}`
    }
    for (const key of ['from', 'to']) {
      const side = params[key]
      if (isRecord(side) && typeof side.subUnitId === 'string' && !hasSheet(side.subUnitId)) {
        return `sheet ${side.subUnitId}`
      }
    }
    const sheet = typeof params.subUnitId === 'string' ? params.subUnitId : ''
    const ruleKey = (id: string): string => `${sheet}\u0000${id}`
    const hasCf = (id: unknown): boolean =>
      typeof id === 'string' && (cfRules.has(ruleKey(id)) || lookup.cfRule(sheet, id))
    const hasDv = (id: unknown): boolean =>
      typeof id === 'string' && (dvRules.has(ruleKey(id)) || lookup.dvRule(sheet, id))
    const rule = isRecord(params.rule) ? params.rule : null
    switch (mutation.id) {
      case 'sheet.mutation.add-conditional-rule':
        if (typeof rule?.cfId === 'string') cfRules.add(ruleKey(rule.cfId))
        break
      case 'sheet.mutation.set-conditional-rule':
        if (!hasCf(params.cfId ?? rule?.cfId)) return 'conditional format'
        if (typeof rule?.cfId === 'string') cfRules.add(ruleKey(rule.cfId))
        break
      case 'sheet.mutation.delete-conditional-rule':
        if (!hasCf(params.cfId)) return 'conditional format'
        break
      case 'sheet.mutation.move-conditional-rule': {
        const start = isRecord(params.start) ? params.start.id : undefined
        const end = isRecord(params.end) ? params.end.id : undefined
        if (!hasCf(start) || !hasCf(end)) return 'conditional format'
        break
      }
      case 'data-validation.mutation.addRule':
        for (const added of Array.isArray(params.rule) ? params.rule : [params.rule]) {
          if (isRecord(added) && typeof added.uid === 'string') dvRules.add(ruleKey(added.uid))
        }
        break
      case 'data-validation.mutation.updateRule':
        if (!hasDv(params.ruleId)) return 'data validation'
        break
      case 'data-validation.mutation.removeRule': {
        const ids: unknown[] = Array.isArray(params.ruleId) ? params.ruleId : [params.ruleId]
        if (!ids.every(hasDv)) return 'data validation'
        break
      }
      case 'formula.mutation.remove-defined-name':
        if (typeof params.id !== 'string' || !(names.has(params.id) || lookup.name(params.id))) {
          return 'defined name'
        }
        removedNames.add(params.id)
        break
      case 'formula.mutation.set-defined-name': {
        if (typeof params.id !== 'string' || typeof params.name !== 'string') return 'defined name'
        const scope = typeof params.localSheetId === 'string' ? params.localSheetId : WORKBOOK_SCOPE
        const holder = lookup.nameId(params.name, scope)
        // another id holding the same name would leave two names after the replay
        if (holder !== null && holder !== params.id && !removedNames.has(holder)) {
          return 'defined name'
        }
        names.set(params.id, params.name)
        break
      }
    }
  }
  return null
}

// ---- snapshots --------------------------------------------------------------

/** what a guest needs beside the bytes to pick up the host's op stream */
export interface SnapshotMeta {
  /** the host's sheets, id and name, at the moment the bytes were taken */
  readonly sheets: readonly (readonly [string, string])[]
  /** the host's op number the bytes include */
  readonly ops: number
  readonly layout: number
}

const MAGIC = [0x47, 0x4f, 0x53, 0x43] // "GOSC"

export function packSnapshot(bytes: Uint8Array, meta: SnapshotMeta): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(meta))
  const out = new Uint8Array(8 + json.length + bytes.length)
  out.set(MAGIC, 0)
  new DataView(out.buffer).setUint32(4, json.length, true)
  out.set(json, 8)
  out.set(bytes, 8 + json.length)
  return out
}

export function unpackSnapshot(data: Uint8Array): { bytes: Uint8Array; meta: SnapshotMeta | null } {
  if (data.length < 8 || MAGIC.some((byte, index) => data[index] !== byte)) {
    return { bytes: data, meta: null }
  }
  const length = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(4, true)
  if (8 + length > data.length) return { bytes: data, meta: null }
  try {
    const meta = JSON.parse(new TextDecoder().decode(data.subarray(8, 8 + length))) as unknown
    if (
      !isRecord(meta) ||
      !Array.isArray(meta.sheets) ||
      typeof meta.ops !== 'number' ||
      typeof meta.layout !== 'number'
    ) {
      return { bytes: data.slice(8 + length), meta: null }
    }
    const sheets = meta.sheets.filter(
      (entry): entry is [string, string] =>
        Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string',
    )
    return { bytes: data.slice(8 + length), meta: { sheets, ops: meta.ops, layout: meta.layout } }
  } catch {
    return { bytes: data.slice(8 + length), meta: null }
  }
}

/**
 * Host sheet id → this peer's, for every sheet the two know by different ids.
 * A sheet added during the session has a random id on the host until it
 * saves, while the bytes a guest reloads from give it the saved id; names
 * are unique in a workbook, so they pair the two up.
 */
export function sheetAliases(
  host: readonly (readonly [string, string])[],
  local: readonly (readonly [string, string])[],
): Map<string, string> {
  const localIds = new Set(local.map(([id]) => id))
  const byName = new Map(local.map(([id, name]) => [name, id] as const))
  const aliases = new Map<string, string>()
  for (const [id, name] of host) {
    const match = byName.get(name)
    if (match !== undefined && match !== id && !localIds.has(id)) aliases.set(id, match)
  }
  return aliases
}

// ---- edits the op stream does not carry -----------------------------------

const VIEW_SETUP_KEYS = new Set([
  'zoomScale',
  'frozenRows',
  'frozenColumns',
  'showGridlines',
  'rightToLeft',
])

/**
 * A digest of the journal parts only features outside the op stream write:
 * visuals, tables, pivots, sparklines, links, protection, theme and page
 * setup. When it changes, this peer edited something the others cannot see.
 * Parts a shared edit also moves (chart series refreshed from changed cells,
 * page breaks shifted by a row insert) are reduced to what those cannot touch.
 */
export function unsharedJournalKey(journal: EditJournal): string {
  let fills = 0
  for (const sheetFills of journal.bulkConstantFills.values()) fills += sheetFills.length
  let links = 0
  for (const sheetLinks of journal.hyperlinks.values()) links += sheetLinks.size
  const chartEdits = [...journal.chartEdits]
    .map(([path, edit]) => [
      path,
      Object.fromEntries(Object.entries(edit).filter(([key]) => key !== 'series')),
    ])
    .filter(([, edit]) => Object.keys(edit as object).length > 0)
  const pageSetup: Array<[string, unknown[]]> = []
  for (const [sheet, setup] of journal.pageSetup) {
    const entries = Object.entries(setup)
      .filter(([key]) => !VIEW_SETUP_KEYS.has(key))
      .map(([key, value]) => [key, key === 'rowBreaks' || key === 'colBreaks' ? true : value])
    if (entries.length > 0) pageSetup.push([sheet, entries])
  }
  return JSON.stringify([
    journal.visualAdds.length,
    journal.visualEdits.size,
    journal.tableAdds.length,
    journal.tableEdits.size,
    journal.pivotAdds.length,
    journal.sparklineAdds.length,
    chartEdits,
    fills,
    links,
    [...journal.sheetProtection],
    journal.workbookProtection.desired,
    [...journal.protectedRangesDirty].sort(),
    journal.theme,
    pageSetup,
    journal.pivotCacheRefresh.size,
    journal.pivotRefreshUpdates.size,
  ])
}
