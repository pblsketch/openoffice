import { describe, expect, it, vi } from 'vitest'
import {
  LABELS,
  MAIN_PROCESS_KEYS,
  MENU_ITEMS,
  fillCellBlock,
  hancomBlockCellProps,
  hancomCellBlockKey,
  hancomCommands,
  hancomContextKey,
  keepsCellBlock,
} from '../studio-plugin/hancom-keys.mjs'

/**
 * The table keys of Hancom Hangul 2024's 단축키 일람 that the editor lacked: a cell block's
 * P/L/C/B/F/A, Enter and F3, the format keys and block calculations that keep the block,
 * Ctrl+Shift+Tab in a cell, and L/C on a selected table.
 */

const key = (init: Partial<KeyboardEvent>) => ({
  key: '',
  code: '',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  isComposing: false,
  keyCode: 0,
  timeStamp: 0,
  preventDefault: vi.fn(),
  ...init,
})

/** A caret in a cell block of a 3×1 table (one column), cells holding `texts`. */
function inBlock(options: { enabled?: string[]; texts?: string[]; merged?: boolean } = {}) {
  const texts = [...(options.texts ?? ['', '', ''])]
  const rows = texts.length
  let phase = 1
  const cursor = {
    isInCell: () => true,
    isInTextBox: () => false,
    isInCellSelectionMode: () => true,
    isProtectedCellSelectionMode: () => false,
    isInTableObjectSelection: () => false,
    getCellTableContext: () => ({ sec: 0, ppi: 1, ci: 0 }) as Record<string, unknown>,
    getSelectedCellRange: () => ({ startRow: 0, startCol: 0, endRow: rows - 1, endCol: 0 }),
    getExcludedCells: () => new Set<string>(),
    captureCellSelection: () => ({ anchor: 0 }),
    getPosition: () => ({ sectionIndex: 0, cellIndex: 0, cellParaIndex: 0, charOffset: 0 }),
    getCellSelectionPhase: () => phase,
    advanceCellSelectionPhase: vi.fn(() => {
      phase += 1
    }),
    enterCellSelectionMode: vi.fn(() => true),
    exitCellSelectionMode: vi.fn(),
  }
  const enabled = options.enabled ?? []
  return {
    _hancomChord: null as string | null,
    _hancomChordIme: null,
    _cellBlockLetterImeGuard: { arm: vi.fn() },
    cursor,
    caret: { hide: vi.fn() },
    cellSelectionRenderer: { clear: vi.fn() },
    isFormMode: () => false,
    getCursorPosition: () => ({
      sectionIndex: 0,
      paragraphIndex: 0,
      charOffset: 0,
      parentParaIndex: 1,
      controlIndex: 0,
      cellIndex: 0,
      cellParaIndex: 0,
    }),
    wasm: {
      getTableDimensions: () => ({ rowCount: rows, colCount: 1, cellCount: rows }),
      getCellInfo: (_s: number, _p: number, _c: number, i: number) => ({
        row: i,
        col: 0,
        rowSpan: options.merged && i === 0 ? 2 : 1,
        colSpan: 1,
      }),
      getCellParagraphCount: () => 1,
      getCellParagraphLength: (_s: number, _p: number, _c: number, i: number) => texts[i].length,
      getTextInCell: (_s: number, _p: number, _c: number, i: number) => texts[i],
    },
    executeOperation: vi.fn(),
    updateCellSelection: vi.fn(),
    updateCaret: vi.fn(),
    dispatcher: {
      dispatch: vi.fn(() => true),
      isEnabled: vi.fn((id: string) => enabled.includes(id)),
    },
  }
}

describe("a cell block's Hangul letters (셀 블록 상태에서)", () => {
  it('run the command of P, L, C, B, F and A, and keep the letter out', () => {
    const keys = [
      ['p', 'table:cell-props'],
      ['l', 'ieum:cell-border-each'],
      ['c', 'ieum:cell-background-each'],
      ['b', 'ieum:cell-border-one'],
      ['f', 'ieum:cell-background-one'],
      ['a', 'ieum:table-auto-fill'],
    ] as const
    for (const [letter, id] of keys) {
      const ih = inBlock({ enabled: [id] })
      const e = key({ key: letter, code: `Key${letter.toUpperCase()}` })
      expect(hancomCellBlockKey(ih, e), letter).toBe(true)
      expect(e.preventDefault).toHaveBeenCalled()
      expect(ih._cellBlockLetterImeGuard.arm).toHaveBeenCalledWith(e)
      expect(ih.dispatcher.dispatch).toHaveBeenCalledWith(id)
    }
  })

  it('read the letter from the key while the Korean IME is on', () => {
    const ih = inBlock({ enabled: ['table:cell-props'] })
    expect(hancomCellBlockKey(ih, key({ key: 'ㅔ', code: 'KeyP' }))).toBe(true)
    expect(ih.dispatcher.dispatch).toHaveBeenCalledWith('table:cell-props')
  })

  it('go back to editing the cell with Enter, as with Escape', () => {
    const ih = inBlock()
    const e = key({ key: 'Enter', code: 'Enter' })
    expect(hancomCellBlockKey(ih, e)).toBe(true)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(ih.cursor.exitCellSelectionMode).toHaveBeenCalled()
    expect(ih.updateCaret).toHaveBeenCalled()
  })

  it('grow the block with the arrows after F3, as after F5 again', () => {
    const ih = inBlock()
    const e = key({ key: 'F3', code: 'F3' })
    expect(hancomCellBlockKey(ih, e)).toBe(true)
    expect(ih.cursor.advanceCellSelectionPhase).toHaveBeenCalledTimes(1)
    // already growing: F3 again keeps it so
    hancomCellBlockKey(ih, key({ key: 'F3', code: 'F3' }))
    expect(ih.cursor.advanceCellSelectionPhase).toHaveBeenCalledTimes(1)
  })

  it('leave a protected form block to the studio', () => {
    const ih = inBlock({ enabled: ['table:cell-props'] })
    ih.cursor.isProtectedCellSelectionMode = () => true
    expect(hancomCellBlockKey(ih, key({ key: 'p', code: 'KeyP' }))).toBe(false)
    expect(ih.dispatcher.dispatch).not.toHaveBeenCalled()
  })
})

describe('the keys that act on the whole block', () => {
  it('run with the block kept: formats, styles, block calculations', () => {
    for (const id of [
      'format:char-shape',
      'format:para-shape',
      'format:style-dialog',
      'format:bold',
      'format:align-center',
      'ieum:style-2',
      'ieum:normal-shape',
      'table:block-avg',
      'table:block-product',
    ]) {
      const ih = inBlock({ enabled: [id] })
      const e = key({ key: 'x', altKey: true })
      expect(
        hancomCellBlockKey(ih, e, () => id),
        id,
      ).toBe(true)
      expect(e.preventDefault).toHaveBeenCalled()
      expect(ih.dispatcher.dispatch).toHaveBeenCalledWith(id)
      expect(ih.cursor.exitCellSelectionMode).not.toHaveBeenCalled()
    }
  })

  it('leave the other keys to the studio, which closes the block first', () => {
    for (const id of ['edit:find-replace', 'format:object-properties', 'file:save', null]) {
      const ih = inBlock({ enabled: id ? [id] : [] })
      const e = key({ key: 'h', code: 'KeyH', ctrlKey: true })
      expect(
        hancomCellBlockKey(ih, e, () => id),
        String(id),
      ).toBe(false)
      expect(e.preventDefault).not.toHaveBeenCalled()
    }
    expect(keepsCellBlock('table:insert-row-col')).toBe(false)
  })

  it('start a sequence in the block, so Ctrl+N,K opens 표/셀 속성 for it', () => {
    const ih = inBlock()
    const e = key({ key: 'n', code: 'KeyN', ctrlKey: true })
    expect(hancomCellBlockKey(ih, e)).toBe(true)
    expect(ih._hancomChord).toBe('n')
  })
})

describe('표 자동 채우기 on a cell block (A)', () => {
  const bridge = () => ({
    getCellParagraphCount: vi.fn(() => 1),
    getCellParagraphLength: vi.fn(() => 0),
    deleteRangeInCell: vi.fn(),
    splitParagraphInCell: vi.fn(),
    insertTextInCell: vi.fn(),
  })

  it('writes the series into the empty cells, one undo step', () => {
    const ih = inBlock({ texts: ['1', '3', '', ''] })
    expect(fillCellBlock(ih)).toBe(true)
    expect(ih.executeOperation).toHaveBeenCalledTimes(1)
    const desc = ih.executeOperation.mock.calls[0][0] as {
      kind: string
      operation: (b: ReturnType<typeof bridge>) => unknown
      selectionBefore: unknown
    }
    expect(desc.kind).toBe('snapshot')
    expect(desc.selectionBefore).toEqual({ mode: 'cellBlock', state: { anchor: 0 } })
    const b = bridge()
    desc.operation(b)
    expect(b.insertTextInCell.mock.calls.map((c) => [c[3], c[6]])).toEqual([
      [2, '5'],
      [3, '7'],
    ])
    expect(ih.updateCellSelection).toHaveBeenCalled()
  })

  it('writes nothing when nothing changes', () => {
    const ih = inBlock({ texts: ['1', '1', '1'] })
    expect(fillCellBlock(ih)).toBe(true)
    expect(ih.executeOperation).not.toHaveBeenCalled()
  })

  it('leaves a block with merged cells alone, and says why', () => {
    const showToast = vi.fn()
    hancomCommands('ko', { showToast })
    const ih = inBlock({ texts: ['1', '', ''], merged: true })
    expect(fillCellBlock(ih)).toBe(false)
    expect(ih.executeOperation).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalled()
  })

  it('leaves a table inside a cell alone', () => {
    hancomCommands('ko', { showToast: vi.fn() })
    const ih = inBlock({ texts: ['1', '', ''] })
    ih.cursor.getCellTableContext = () => ({ sec: 0, ppi: 1, ci: 0, cellPath: [{}, {}] })
    expect(fillCellBlock(ih)).toBe(false)
    expect(ih.executeOperation).not.toHaveBeenCalled()
  })

  it('is on the menu after the equal-size items, with its key', () => {
    expect(MENU_ITEMS.find(([id]) => id === 'ieum:table-auto-fill')?.[1]).toBe(
      'table:cell-width-equal',
    )
    const command = hancomCommands('ko').find((c) => c.id === 'ieum:table-auto-fill')!
    expect(command.label).toBe('표 자동 채우기')
    expect(command.shortcutLabel).toBe('A')
  })
})

describe("표/셀 속성 on a cell block writes every selected cell's cell tab", () => {
  const dialog = (cellIndices: number[], at = { sec: 0, ppi: 1, ci: 0 }) => {
    const setCellProperties = vi.fn()
    return {
      mode: 'cell',
      cellIdx: 0,
      tableCtx: { sec: 0, ppi: 1, ci: 0 },
      cellProps: {
        verticalAlign: 0,
        paddingLeft: 141,
        applyInnerMargin: true,
        fieldName: 'name',
        isHeader: false,
      },
      wasm: { setCellProperties },
      services: {
        getInputHandler: () => ({ getSelectedCellBlock: () => ({ ...at, cellIndices }) }),
      },
    }
  }

  it('gives the other cells what the user changed, and the size when its box is ticked', () => {
    const d = dialog([0, 1, 2])
    hancomBlockCellProps(d, {
      verticalAlign: 1,
      // 141 shown as 0.5 mm reads back as 142: left as it was
      paddingLeft: 142,
      applyInnerMargin: true,
      fieldName: 'name',
      isHeader: false,
      width: 5000,
    })
    expect(d.wasm.setCellProperties.mock.calls).toEqual([
      [0, 1, 0, 1, { verticalAlign: 1, width: 5000 }],
      [0, 1, 0, 2, { verticalAlign: 1, width: 5000 }],
    ])
  })

  it('passes a margin the user changed on', () => {
    const d = dialog([0, 1])
    hancomBlockCellProps(d, { paddingLeft: 567, verticalAlign: 0 })
    expect(d.wasm.setCellProperties).toHaveBeenCalledWith(0, 1, 0, 1, { paddingLeft: 567 })
  })

  it('writes nothing more without a block, unchanged, from a table, or for another table', () => {
    const none = dialog([0, 1])
    none.services.getInputHandler = () => ({ getSelectedCellBlock: () => null }) as never
    hancomBlockCellProps(none, { verticalAlign: 1 })
    const same = dialog([0, 1])
    hancomBlockCellProps(same, { verticalAlign: 0, fieldName: 'name' })
    const table = { ...dialog([0, 1]), mode: 'table' }
    hancomBlockCellProps(table, { verticalAlign: 1 })
    const other = dialog([0, 1], { sec: 0, ppi: 4, ci: 0 })
    hancomBlockCellProps(other, { verticalAlign: 1 })
    for (const d of [none, same, table, other])
      expect(d.wasm.setCellProperties).not.toHaveBeenCalled()
  })
})

describe('the border and background dialogs', () => {
  class FakeDialog {
    static made: FakeDialog[] = []
    args: unknown[]
    shown = false
    switchTab = vi.fn()
    tabs = ['basic', 'margin', 'border', 'background', 'table', 'cell'].map((tab) => ({
      dataset: { tab },
    }))
    constructor(...args: unknown[]) {
      this.args = args
      FakeDialog.made.push(this)
    }
    show() {
      this.shown = true
    }
  }

  const run = (id: string, ih: unknown) => {
    FakeDialog.made = []
    const command = hancomCommands('ko', {
      CellBorderBgDialog: FakeDialog,
      TableCellPropsDialog: FakeDialog,
      showToast: vi.fn(),
    }).find((c) => c.id === id)!
    const wasm = { getTableDimensions: () => ({ rowCount: 3, colCount: 1, cellCount: 3 }) }
    command.execute({ getInputHandler: () => ih, wasm, eventBus: {} })
    return FakeDialog.made[0]
  }

  it("open a block's cell border/background each cell on its own or as one (L/C/B/F)", () => {
    const cases = [
      ['ieum:cell-border-each', 'each', null],
      ['ieum:cell-background-each', 'each', 1],
      ['ieum:cell-border-one', 'asOne', null],
      ['ieum:cell-background-one', 'asOne', 1],
    ] as const
    for (const [id, mode, tab] of cases) {
      const ih = {
        ...inBlock(),
        hasMultiCellSelection: () => true,
        getSelectedCellRange: () => 'range',
      }
      const made = run(id, ih)
      expect(made.args[4], id).toBe(mode)
      expect(made.args[5], id).toBe('range')
      expect(made.shown).toBe(true)
      if (tab === null) expect(made.switchTab).not.toHaveBeenCalled()
      else expect(made.switchTab).toHaveBeenCalledWith(tab)
    }
  })

  it('open one cell for "as one" when the block holds one cell', () => {
    const ih = {
      ...inBlock(),
      hasMultiCellSelection: () => false,
      getSelectedCellRange: () => null,
    }
    expect(run('ieum:cell-border-one', ih).args[4]).toBe('each')
  })

  it("open a selected table's own border/background in 표/셀 속성 (L/C)", () => {
    const table = (cellPath?: unknown[]) => ({
      ...inBlock(),
      cursor: { isInTableObjectSelection: () => true },
      getSelectedTableRef: () => ({ sec: 0, ppi: 1, ci: 0, cellPath }),
    })
    const border = run('ieum:table-border-each', table())
    expect(border.args.slice(2, 5)).toEqual([{ sec: 0, ppi: 1, ci: 0 }, 0, 'table'])
    expect(border.switchTab).toHaveBeenCalledWith(2)
    expect(run('ieum:table-border-background', table()).switchTab).toHaveBeenCalledWith(3)
    // a table inside a cell is not opened as its outer table
    expect(run('ieum:table-border-each', table([{}, {}]))).toBeUndefined()
  })

  it('show the keys next to the menu items', () => {
    expect(LABELS['table:cell-props']).toBe('P')
    expect(LABELS['table:border-each']).toBe('L')
    expect(LABELS['table:border-one']).toBe('B')
  })
})

describe('Ctrl+Shift+Tab in a table cell (빠른 내어쓰기)', () => {
  const inCell = () => {
    const ih = { ...inBlock(), applyHangingIndentAtCursor: vi.fn(() => true) }
    ih.cursor.isInCellSelectionMode = () => false
    return ih
  }

  it('lines the paragraph up at the caret instead of going to the previous tab', () => {
    const ih = inCell()
    expect(MAIN_PROCESS_KEYS['ctrl-shift-tab'](ih, ih.dispatcher)).toBe(true)
    expect(ih.applyHangingIndentAtCursor).toHaveBeenCalled()
  })

  it('leaves the key to the tab strip outside a cell and in a cell block', () => {
    const outside = inCell()
    outside.cursor.isInCell = () => false
    expect(MAIN_PROCESS_KEYS['ctrl-shift-tab'](outside, outside.dispatcher)).toBe(false)
    const block = inCell()
    block.cursor.isInCellSelectionMode = () => true
    expect(MAIN_PROCESS_KEYS['ctrl-shift-tab'](block, block.dispatcher)).toBe(false)
    expect(block.applyHangingIndentAtCursor).not.toHaveBeenCalled()
  })

  it('works in the page where no tab strip takes the key first', () => {
    const ih = inCell()
    const e = key({ key: 'Tab', code: 'Tab', ctrlKey: true, shiftKey: true })
    expect(hancomContextKey(ih, e)).toBe(true)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(ih.applyHangingIndentAtCursor).toHaveBeenCalled()
  })
})
