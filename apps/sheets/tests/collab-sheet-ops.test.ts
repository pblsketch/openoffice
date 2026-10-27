import { describe, expect, it } from 'vitest'

import { createEditJournal } from '../src/renderer/edit-journal'
import {
  UNIT_PLACEHOLDER,
  changesLayout,
  fromWire,
  isSharedMutation,
  isSheetOp,
  missingTarget,
  needsResidentCells,
  opsCommute,
  packSnapshot,
  sheetAliases,
  toWire,
  unpackSnapshot,
  unsharedJournalKey,
  type SheetOp,
  type TargetLookup,
  type WireMutation,
} from '../src/renderer/collab/sheet-ops'

const VALUES = 'sheet.mutation.set-range-values'

function values(sheet: string, cells: Record<number, Record<number, unknown>>): WireMutation {
  return { id: VALUES, params: { unitId: UNIT_PLACEHOLDER, subUnitId: sheet, cellValue: cells } }
}

function op(...m: WireMutation[]): SheetOp {
  return { m, l: 0 }
}

describe('toWire / fromWire', () => {
  it('replaces the unit, inlines pooled styles and drops the trigger', () => {
    const wire = toWire(
      VALUES,
      {
        unitId: 'file-aaa',
        subUnitId: 'sheet-1',
        trigger: 'sheet.command.set-range-values',
        cellValue: { 2: { 3: { v: 'x', s: 'pool-7' }, 4: { v: 1, s: { bl: 1 } } } },
      },
      {
        unitId: 'file-aaa',
        styleOf: (id) => (id === 'pool-7' ? { it: 1, bg: { rgb: '#FF0000' } } : null),
        hostSheet: (id) => id,
      },
    )
    expect(wire).toEqual({
      id: VALUES,
      params: {
        unitId: UNIT_PLACEHOLDER,
        subUnitId: 'sheet-1',
        cellValue: {
          2: { 3: { v: 'x', s: { it: 1, bg: { rgb: '#FF0000' } } }, 4: { v: 1, s: { bl: 1 } } },
        },
      },
    })
  })

  it('keeps an unknown style id as it is', () => {
    const wire = toWire(
      VALUES,
      { unitId: 'u', subUnitId: 's', cellValue: { 0: { 0: { s: 'not-pooled' } } } },
      { unitId: 'u', styleOf: () => null, hostSheet: (id) => id },
    )
    expect((wire.params as { cellValue: unknown }).cellValue).toEqual({
      0: { 0: { s: 'not-pooled' } },
    })
  })

  it('copies, so later changes to the params do not leak into the op', () => {
    const params = { unitId: 'u', subUnitId: 's', cellValue: { 0: { 0: { v: 1 } } } }
    const wire = toWire(VALUES, params, { unitId: 'u', styleOf: () => null, hostSheet: (id) => id })
    params.cellValue[0][0].v = 2
    expect((wire.params as typeof params).cellValue[0][0].v).toBe(1)
  })

  it('maps sheet ids through both directions, including move-range sides and notes', () => {
    const toHost = new Map([['local-new', 'host-random']])
    const move = toWire(
      'sheet.mutation.move-range',
      {
        unitId: 'u',
        from: { subUnitId: 'local-new', value: {} },
        to: { subUnitId: 'sheet-1', value: {} },
      },
      { unitId: 'u', styleOf: () => null, hostSheet: (id) => toHost.get(id) ?? id },
    )
    expect(move.params).toMatchObject({
      unitId: UNIT_PLACEHOLDER,
      from: { subUnitId: 'host-random' },
      to: { subUnitId: 'sheet-1' },
    })
    const note = fromWire(
      {
        id: 'sheet.mutation.update-note',
        params: { unitId: UNIT_PLACEHOLDER, sheetId: 'host-random', row: 1, col: 1 },
      },
      'file-bbb',
      (id) => (id === 'host-random' ? 'local-new' : id),
    )
    expect(note.params).toEqual({ unitId: 'file-bbb', sheetId: 'local-new', row: 1, col: 1 })
  })

  it('rebinds the placeholder to the receiving unit', () => {
    const local = fromWire(values('sheet-1', { 0: { 0: { v: 1 } } }), 'file-ccc', (id) => id)
    expect(local.params).toMatchObject({ unitId: 'file-ccc', subUnitId: 'sheet-1' })
  })
})

describe('what travels', () => {
  it('carries what the journal records and nothing derived or local', () => {
    expect(isSharedMutation(VALUES)).toBe(true)
    expect(isSharedMutation('sheet.mutation.insert-row')).toBe(true)
    expect(isSharedMutation('sheet.mutation.set-worksheet-row-height')).toBe(true)
    expect(isSharedMutation('sheet.mutation.update-note')).toBe(true)
    expect(isSharedMutation('formula.mutation.set-defined-name')).toBe(true)
    // derived on every peer, or one person's view
    expect(isSharedMutation('sheet.mutation.set-worksheet-row-auto-height')).toBe(false)
    expect(isSharedMutation('sheet.mutation.set-worksheet-row-count')).toBe(false)
    expect(isSharedMutation('sheet.operation.set-zoom-ratio')).toBe(false)
    // app-side undo steps whose params point at closures
    expect(isSharedMutation('sheets.mutation.visual-edit-step')).toBe(false)
    expect(isSharedMutation('sheets.mutation.bulk-constant-fill')).toBe(false)
  })

  it('accepts only well-formed ops of shared mutations', () => {
    expect(isSheetOp(op(values('s', { 0: { 0: { v: 1 } } })))).toBe(true)
    expect(isSheetOp({ m: [], l: 0 })).toBe(false)
    expect(isSheetOp({ m: [{ id: 'sheets.mutation.visual-edit-step', params: {} }], l: 0 })).toBe(
      false,
    )
    expect(isSheetOp({ m: [values('s', {})], l: '0' })).toBe(false)
    expect(isSheetOp({ m: [values('s', {})], l: 0, g: 'x' })).toBe(false)
  })

  it('knows which ops move cells and which need every cell loaded', () => {
    const insert = op({ id: 'sheet.mutation.insert-row', params: { subUnitId: 's' } })
    const sort = op({ id: 'sheet.mutation.reorder-range', params: { subUnitId: 's' } })
    const filter = op({ id: 'sheet.mutation.set-filter-criteria', params: { subUnitId: 's' } })
    expect(changesLayout(insert)).toBe(true)
    expect(changesLayout(sort)).toBe(true)
    expect(changesLayout(filter)).toBe(false)
    expect(changesLayout(op(values('s', { 0: { 0: { v: 1 } } })))).toBe(false)
    expect(needsResidentCells(sort)).toBe(true)
    expect(needsResidentCells(filter)).toBe(true)
    expect(needsResidentCells(insert)).toBe(false)
  })
})

describe('opsCommute', () => {
  const a1 = op(values('s1', { 0: { 0: { v: 1 } } }))
  const b2 = op(values('s1', { 1: { 1: { v: 2 } } }))
  const a1Again = op(values('s1', { 0: { 0: { v: 3 } } }))

  it('lets typing in different cells pass in either order', () => {
    expect(opsCommute(a1, b2)).toBe(true)
    expect(opsCommute(a1, op(values('s2', { 0: { 0: { v: 1 } } })))).toBe(true)
  })

  it('orders edits of the same cell', () => {
    expect(opsCommute(a1, a1Again)).toBe(false)
    const block = op(values('s1', { 0: { 0: { v: 1 } }, 5: { 5: { v: 1 } } }))
    // the bounding box of a paste covers what lies between its cells
    expect(opsCommute(block, op(values('s1', { 3: { 3: { v: 1 } } })))).toBe(false)
  })

  it('treats number formats like cell edits', () => {
    const format = op({
      id: 'sheet.mutation.set.numfmt',
      params: {
        subUnitId: 's1',
        values: { f1: { ranges: [{ startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 }] } },
      },
    })
    expect(opsCommute(format, a1)).toBe(false)
    expect(opsCommute(format, b2)).toBe(true)
  })

  it('never lets structure pass anything', () => {
    const insert = op({
      id: 'sheet.mutation.insert-row',
      params: { subUnitId: 's1', range: { startRow: 9, endRow: 9 } },
    })
    expect(opsCommute(insert, a1)).toBe(false)
    expect(opsCommute(a1, insert)).toBe(false)
  })

  it('separates row sizes, notes and sheet settings by what they touch', () => {
    const height = (start: number, end: number): SheetOp =>
      op({
        id: 'sheet.mutation.set-worksheet-row-height',
        params: {
          subUnitId: 's1',
          ranges: [{ startRow: start, endRow: end, startColumn: 0, endColumn: 0 }],
        },
      })
    expect(opsCommute(height(0, 2), a1)).toBe(true)
    expect(opsCommute(height(0, 2), height(3, 4))).toBe(true)
    expect(opsCommute(height(0, 2), height(2, 4))).toBe(false)
    const note = (row: number): SheetOp =>
      op({ id: 'sheet.mutation.update-note', params: { sheetId: 's1', row, col: 0 } })
    expect(opsCommute(note(0), note(1))).toBe(true)
    expect(opsCommute(note(0), note(0))).toBe(false)
    const tab = (sheet: string): SheetOp =>
      op({ id: 'sheet.mutation.set-tab-color', params: { subUnitId: sheet, color: '#000' } })
    expect(opsCommute(tab('s1'), tab('s2'))).toBe(true)
    expect(opsCommute(tab('s1'), tab('s1'))).toBe(false)
    expect(opsCommute(tab('s1'), a1)).toBe(true)
  })
})

describe('missingTarget', () => {
  const lookup = (overrides: Partial<TargetLookup> = {}): TargetLookup => ({
    sheet: (id) => id === 's1',
    cfRule: (_sheet, id) => id === 'file-cf-s1-0',
    dvRule: (_sheet, id) => id === 'file-dv-s1-0',
    nameId: (name) => (name === 'Total' ? 'file-name-0' : null),
    name: (id) => id === 'file-name-0',
    ...overrides,
  })

  it('passes an op whose sheet exists', () => {
    expect(missingTarget(op(values('s1', { 0: { 0: { v: 1 } } })), lookup())).toBeNull()
  })

  it('refuses a sheet this copy does not have, unless the batch creates it first', () => {
    expect(missingTarget(op(values('s9', { 0: { 0: { v: 1 } } })), lookup())).toBe('sheet s9')
    const created = op(
      { id: 'sheet.mutation.insert-sheet', params: { sheet: { id: 's9', name: 'New' } } },
      values('s9', { 0: { 0: { v: 1 } } }),
    )
    expect(missingTarget(created, lookup())).toBeNull()
    // the same id twice would be two sheets on one peer and one on another
    const duplicate = op({ id: 'sheet.mutation.insert-sheet', params: { sheet: { id: 's1' } } })
    expect(missingTarget(duplicate, lookup())).toBe('sheet s1')
  })

  it('checks both sides of a move', () => {
    const move = op({
      id: 'sheet.mutation.move-range',
      params: { from: { subUnitId: 's1' }, to: { subUnitId: 's7' } },
    })
    expect(missingTarget(move, lookup())).toBe('sheet s7')
  })

  it('refuses rule edits aimed at rules this copy does not have', () => {
    const setRule = (cfId: string): SheetOp =>
      op({
        id: 'sheet.mutation.set-conditional-rule',
        params: { subUnitId: 's1', cfId, rule: { cfId } },
      })
    expect(missingTarget(setRule('file-cf-s1-0'), lookup())).toBeNull()
    expect(missingTarget(setRule('random'), lookup())).toBe('conditional format')
    const addThenSet = op(
      {
        id: 'sheet.mutation.add-conditional-rule',
        params: { subUnitId: 's1', rule: { cfId: 'fresh' } },
      },
      { id: 'sheet.mutation.delete-conditional-rule', params: { subUnitId: 's1', cfId: 'fresh' } },
    )
    expect(missingTarget(addThenSet, lookup())).toBeNull()
    const removeRules = op({
      id: 'data-validation.mutation.removeRule',
      params: { subUnitId: 's1', ruleId: ['file-dv-s1-0', 'gone'] },
    })
    expect(missingTarget(removeRules, lookup())).toBe('data validation')
  })

  it('refuses a defined name that would end up twice', () => {
    const setName = (id: string): SheetOp =>
      op({
        id: 'formula.mutation.set-defined-name',
        params: { id, name: 'Total', formulaOrRefString: '=Data!$C$1' },
      })
    expect(missingTarget(setName('file-name-0'), lookup())).toBeNull()
    expect(missingTarget(setName('other'), lookup())).toBe('defined name')
    // an update removes the old entry first
    const update = op(
      { id: 'formula.mutation.remove-defined-name', params: { id: 'file-name-0' } },
      { id: 'formula.mutation.set-defined-name', params: { id: 'renamed', name: 'Total' } },
    )
    expect(missingTarget(update, lookup())).toBeNull()
    expect(
      missingTarget(
        op({ id: 'formula.mutation.remove-defined-name', params: { id: 'nope' } }),
        lookup(),
      ),
    ).toBe('defined name')
  })
})

describe('snapshots', () => {
  const xlsx = new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9])

  it('round-trips the bytes and what a guest needs beside them', () => {
    const meta = { sheets: [['sheet-1', 'Data'] as const], ops: 12, layout: 3 }
    const unpacked = unpackSnapshot(packSnapshot(xlsx, meta))
    expect([...unpacked.bytes]).toEqual([...xlsx])
    expect(unpacked.meta).toEqual({ sheets: [['sheet-1', 'Data']], ops: 12, layout: 3 })
  })

  it('reads plain workbook bytes as having no meta', () => {
    expect(unpackSnapshot(xlsx)).toEqual({ bytes: xlsx, meta: null })
  })

  it('does not trust a broken header', () => {
    const packed = packSnapshot(xlsx, { sheets: [], ops: 0, layout: 0 })
    packed[10] = 0x7b // corrupts the JSON
    expect(unpackSnapshot(packed).meta).toBeNull()
  })

  it('pairs sheets the host and this copy know by different ids, by name', () => {
    const aliases = sheetAliases(
      [
        ['sheet-1', 'Data'],
        ['xYz12', 'Added'],
      ],
      [
        ['sheet-1', 'Data'],
        ['sheet-2', 'Added'],
      ],
    )
    expect([...aliases]).toEqual([['xYz12', 'sheet-2']])
  })
})

describe('unsharedJournalKey', () => {
  it('moves with edits outside the op stream only', () => {
    const journal = createEditJournal()
    const start = unsharedJournalKey(journal)
    journal.pageSetup.set('s1', { zoomScale: 150, frozenRows: 2, showGridlines: false })
    expect(unsharedJournalKey(journal)).toBe(start)
    // a chart's series refreshed from edited cells is no edit of the chart
    journal.chartEdits.set('xl/charts/chart1.xml', { series: [{ index: 0, values: [1] }] } as never)
    expect(unsharedJournalKey(journal)).toBe(start)
    journal.pageSetup.set('s1', { zoomScale: 150, orientation: 'landscape' })
    const landscape = unsharedJournalKey(journal)
    expect(landscape).not.toBe(start)
    journal.chartEdits.set('xl/charts/chart1.xml', { title: 'Sales' } as never)
    expect(unsharedJournalKey(journal)).not.toBe(landscape)
  })

  it('ignores page breaks shifting under a row insert, not a new break set', () => {
    const journal = createEditJournal()
    journal.pageSetup.set('s1', { rowBreaks: [5] })
    const withBreaks = unsharedJournalKey(journal)
    journal.pageSetup.set('s1', { rowBreaks: [6] })
    expect(unsharedJournalKey(journal)).toBe(withBreaks)
    journal.pageSetup.delete('s1')
    expect(unsharedJournalKey(journal)).not.toBe(withBreaks)
  })

  it('notices visuals, links and protection', () => {
    const journal = createEditJournal()
    const start = unsharedJournalKey(journal)
    journal.hyperlinks.set('s1', new Map([['0:0', 'https://example.com']]))
    const linked = unsharedJournalKey(journal)
    expect(linked).not.toBe(start)
    journal.workbookProtection.desired = true
    expect(unsharedJournalKey(journal)).not.toBe(linked)
  })
})
