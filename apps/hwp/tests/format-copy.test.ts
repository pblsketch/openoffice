import { describe, expect, it, vi } from 'vitest'
import {
  __formatCopyTest as t,
  clearCopiedFormat,
  ieumFormatCopy,
  ieumFormatPaste,
  ieumHasCopiedFormat,
} from '../studio-plugin/format-copy.mjs'

const FAMILIES = ['맑은 고딕', 'Arial', 'SimSun', 'Arial', 'Arial', 'Arial', 'Arial']

const border = (color: string) => ({ type: 1, width: 1, color })

function cellProps(overrides: Record<string, unknown> = {}) {
  return {
    width: 999,
    height: 888,
    paddingLeft: 100,
    paddingRight: 101,
    paddingTop: 102,
    paddingBottom: 103,
    applyInnerMargin: true,
    verticalAlign: 1,
    textDirection: 0,
    isHeader: false,
    cellProtect: false,
    fieldName: '이름',
    editableInForm: true,
    borderFillId: 9,
    borderLeft: border('#111111'),
    borderRight: border('#222222'),
    borderTop: border('#333333'),
    borderBottom: border('#444444'),
    diagonalLine: 0,
    diagonalSlash: 0,
    diagonalBackSlash: 0,
    diagonalWidth: 0,
    diagonalColor: '#000000',
    centerLine: 'NONE',
    fillType: 'solid',
    fillColor: '#abcdef',
    patternColor: '#000000',
    patternType: 1,
    ...overrides,
  }
}

function fakeWasm(overrides: Record<string, unknown> = {}) {
  const calls: unknown[][] = []
  const wasm: Record<string, any> = {
    calls,
    getCharPropertiesAt: () => ({
      fontSize: 1200,
      bold: true,
      fontFamilies: FAMILIES,
      charShapeId: 7,
      textColor: '#123456',
      borderLeft: border('#000000'),
      fillType: 'solid',
      fillColor: '#abcdef',
      patternType: -1,
      patternColor: '#000000',
    }),
    getParaPropertiesAt: () => ({
      alignment: 'center',
      marginLeft: 10,
      marginRight: 5,
      indent: 2,
      spacingBefore: 3,
      spacingAfter: 4,
      lineSpacing: 150,
      lineSpacingType: 'Percent',
      tabStops: [{ position: 4000, type: 0, fill: 0 }],
      tabAutoLeft: true,
      borderLeft: border('#ff0000'),
      fillType: 'solid',
      fillColor: '#ffeeaa',
      patternType: 0,
      numberingId: 0,
    }),
    getStyleList: () => [
      { id: 1, name: '본문', englishName: 'Body', type: 0, paraShapeId: 1, charShapeId: 1 },
      { id: 2, name: '강조', englishName: 'Emphasis', type: 1, paraShapeId: 1, charShapeId: 7 },
    ],
    getStyleAt: () => ({ id: 1, name: '본문', englishName: 'Body' }),
    getCellStyleAt: () => ({ id: 1, name: '본문', englishName: 'Body' }),
    getCellCharPropertiesAt: () => ({
      fontSize: 1200,
      bold: true,
      fontFamilies: FAMILIES,
      charShapeId: 7,
    }),
    getCellCharPropertiesAtByPath: () => ({
      fontSize: 1400,
      italic: true,
      fontFamilies: FAMILIES,
      charShapeId: 7,
    }),
    getCellParaPropertiesAt: () => ({ alignment: 'left', marginLeft: 1 }),
    getCellOwnProperties: () => cellProps(),
    getCellPropertiesByPath: () => cellProps({ fieldName: '', editableInForm: false }),
    findOrCreateFontIdForLang: (lang: number, name: string) => {
      calls.push(['font', lang, name])
      return 20 + lang
    },
    getParagraphLength: () => 5,
    getCellParagraphCount: () => 2,
    getCellParagraphLength: () => 3,
    getCellParagraphCountByPath: () => 2,
    getCellParagraphLengthByPath: () => 3,
    getTableDimensions: () => ({ rowCount: 1, colCount: 2, cellCount: 2 }),
    getCellInfo: (_sec: number, _ppi: number, _ci: number, cellIdx: number) => ({
      row: 0,
      col: cellIdx,
      rowSpan: 1,
      colSpan: 1,
    }),
    getTableDimensionsByPath: () => ({ rowCount: 1, colCount: 2, cellCount: 2 }),
    getCellInfoByPath: () => ({ row: 0, col: 0, rowSpan: 1, colSpan: 1 }),
    applyCharFormat: (...args: unknown[]) => calls.push(['applyCharFormat', ...args]),
    applyParaFormat: (...args: unknown[]) => calls.push(['applyParaFormat', ...args]),
    applyStyle: (...args: unknown[]) => calls.push(['applyStyle', ...args]),
    applyCellStyle: (...args: unknown[]) => calls.push(['applyCellStyle', ...args]),
    setCellProperties: (...args: unknown[]) => calls.push(['setCellProperties', ...args]),
    getCellOwnPropertiesForUndo: () => cellProps(),
    getCharShapeRuns: () => [{ startOffset: 0, endOffset: 3, charShapeId: 7 }],
    setCharShapeRuns: (...args: unknown[]) => calls.push(['setCharShapeRuns', ...args]),
    getCharShapeRunsInCellByPath: () => [{ startOffset: 0, endOffset: 3, charShapeId: 7 }],
    setCharShapeRunsInCellByPath: (...args: unknown[]) =>
      calls.push(['setCharShapeRunsInCellByPath', ...args]),
    setCharShapeId: (...args: unknown[]) => calls.push(['setCharShapeId', ...args]),
    setCharShapeIdInCellByPath: (...args: unknown[]) =>
      calls.push(['setCharShapeIdInCellByPath', ...args]),
    runInBatch: (fn: () => void) => fn(),
    ...overrides,
  }
  return wasm
}

function bodyPosition(charOffset = 3) {
  return { sectionIndex: 0, paragraphIndex: 1, charOffset }
}

function bodySelection(start = bodyPosition(0), end = bodyPosition(5)) {
  return { start, end }
}

function cellPosition(cellIdx = 0, charOffset = 2) {
  return {
    sectionIndex: 0,
    paragraphIndex: 2,
    parentParaIndex: 2,
    controlIndex: 0,
    cellIndex: cellIdx,
    cellParaIndex: 0,
    charOffset,
  }
}

function fakeIh(
  options: {
    position?: Record<string, unknown>
    selection?: Record<string, unknown> | null
    cellSelection?: boolean
    ctx?: Record<string, unknown> | null
    range?: Record<string, unknown> | null
  } = {},
) {
  const wasmRef: { wasm?: Record<string, any> } = {}
  const ops: unknown[] = []
  const ih: Record<string, any> = {
    ops,
    wasmRef,
    hasSelection: () => !!options.selection,
    getSelection: () => options.selection ?? null,
    getCursorPosition: () => options.position ?? bodyPosition(),
    isInCellSelectionMode: () => options.cellSelection === true,
    setSelection: (selection: Record<string, unknown> | null) => {
      options.selection = selection
    },
    getCellTableContext: () => options.ctx ?? null,
    getSelectedCellRange: () => options.range ?? null,
    isFormMode: () => false,
    cursor: {
      isInHeaderFooter: () => false,
      isInFootnote: () => false,
      isInPictureObjectSelection: () => false,
      isInTableObjectSelection: () => false,
      getExcludedCells: () => new Set<string>(),
    },
    focus: vi.fn(),
    executeOperation: (desc: Record<string, any>) => {
      ops.push(desc)
      if (desc.kind === 'command') desc.command.execute(wasmRef.wasm)
      else if (desc.kind === 'snapshot') desc.operation(wasmRef.wasm)
    },
  }
  return ih
}

class FakeCharCommand {
  type = 'applyCharFormat'
  constructor(
    readonly start: unknown,
    readonly end: unknown,
    readonly props: Record<string, unknown>,
  ) {}
  // as the studio's command does: an object in, JSON to the engine
  execute(wasm: Record<string, any>) {
    wasm.applyCharFormat(this.start, this.end, JSON.stringify(this.props))
    return this.start
  }
  undo(wasm: Record<string, any>) {
    wasm.undoChar?.(this.start, this.end)
  }
  isNoOp() {
    return false
  }
  mergeWith() {
    return null
  }
}

class FakeParaCommand {
  type = 'applyParaFormat'
  constructor(
    readonly targets: unknown,
    readonly props: Record<string, unknown>,
  ) {}
  execute(wasm: Record<string, any>) {
    wasm.applyParaFormat(this.targets, JSON.stringify(this.props))
    return null
  }
  undo(wasm: Record<string, any>) {
    wasm.undoPara?.(this.targets)
  }
  mergeWith() {
    return null
  }
}

const withCellPathTarget = (
  path: Array<{ controlIndex: number; cellIndex: number; cellParaIndex: number }>,
  cellIndex: number,
  cellParaIndex = 0,
) => [...path.slice(0, -1), { ...path[path.length - 1], cellIndex, cellParaIndex }]

const selectCellIndicesInRange = (
  cellCount: number,
  info: (idx: number) => { row: number; col: number },
  range: { startRow: number; startCol: number; endRow: number; endCol: number },
  excluded: Set<string>,
) => {
  const out: number[] = []
  for (let idx = 0; idx < cellCount; idx += 1) {
    const cell = info(idx)
    if (
      cell.row >= range.startRow &&
      cell.row <= range.endRow &&
      cell.col >= range.startCol &&
      cell.col <= range.endCol &&
      !excluded.has(`${cell.row},${cell.col}`)
    ) {
      out.push(idx)
    }
  }
  return out
}

const paraFormatTargetsForCellBlock = (
  block: { sec: number; ppi: number; ci: number; cellIndices: number[] },
  countAt: (cellIdx: number) => number,
) => {
  const targets: unknown[] = []
  for (const cellIdx of block.cellIndices) {
    for (let k = 0; k < countAt(cellIdx); k += 1) {
      targets.push({
        kind: 'cell',
        sec: block.sec,
        parentPara: block.ppi,
        controlIdx: block.ci,
        cellIdx,
        cellParaIdx: k,
      })
    }
  }
  return targets
}

const studio = {
  ApplyCharFormatCommand: FakeCharCommand,
  ApplyParaFormatCommand: FakeParaCommand,
  selectCellIndicesInRange,
  paraFormatTargetsForCellBlock,
  withCellPathTarget,
  locale: 'ko',
}

function services(wasm: Record<string, any>, ih: Record<string, any>) {
  ih.wasmRef.wasm = wasm
  return { wasm, getInputHandler: () => ih }
}

describe('format copy state', () => {
  it('reads body, cell and nested positions', () => {
    expect(t.endOf(bodyPosition())).toMatchObject({ sec: 0, para: 1, k: 1, offset: 3 })
    const cell = t.endOf(cellPosition(1))
    expect(cell).toMatchObject({ sec: 0, para: 2, k: 0, offset: 2 })
    expect(cell.path).toEqual([{ controlIndex: 0, cellIndex: 1, cellParaIndex: 0 }])
    const nested = t.endOf({
      ...cellPosition(1),
      cellPath: [
        { controlIndex: 0, cellIndex: 0, cellParaIndex: 0 },
        { controlIndex: 1, cellIndex: 1, cellParaIndex: 2 },
      ],
    })
    expect(nested.path).toHaveLength(2)
    expect(nested.k).toBe(2)
  })

  it('treats a selection across paragraphs of one cell as the same cell', () => {
    const a = t.endOf(cellPosition(0, 1))
    const b = t.endOf({ ...cellPosition(0, 8), cellParaIndex: 2 })
    expect(t.sameCell(a, b)).toBe(true)
    expect(t.sameCell(a, t.endOf(cellPosition(1)))).toBe(false)
  })

  it('keeps the form field out of the copied cell properties', () => {
    const props = t.pickCell(cellProps(), {
      properties: true,
      border: true,
      background: true,
    })
    expect(props).not.toHaveProperty('fieldName')
    expect(props).not.toHaveProperty('editableInForm')
    expect(props).not.toHaveProperty('width')
    expect(props).not.toHaveProperty('height')
    expect(props).not.toHaveProperty('borderFillId')
    expect(props).toMatchObject({
      paddingLeft: 100,
      borderLeft: border('#111111'),
      fillColor: '#abcdef',
      patternType: 1,
    })
  })

  it('splits cell properties, borders and background', () => {
    const onlyBackground = t.pickCell(cellProps(), {
      properties: false,
      border: false,
      background: true,
    })
    expect(onlyBackground).toEqual({
      fillType: 'solid',
      fillColor: '#abcdef',
      patternColor: '#000000',
      patternType: 1,
    })
    const onlyBorder = t.pickCell(cellProps(), {
      properties: false,
      border: true,
      background: false,
    })
    expect(onlyBorder).toMatchObject({ borderLeft: border('#111111'), diagonalLine: 0 })
    expect(onlyBorder).not.toHaveProperty('fillColor')
  })

  it('resolves every font language by name and leaves the state alone', () => {
    const wasm = fakeWasm()
    const chars = t.pickChar({
      fontSize: 1200,
      fontFamilies: FAMILIES,
      charShapeId: 7,
      fontIds: [1, 2, 3, 4, 5, 6, 7],
      textColor: '#123456',
    })
    const json = t.resolveChars(wasm, chars)
    expect(json.fontIds).toEqual([20, 21, 22, 23, 24, 25, 26])
    expect(json).not.toHaveProperty('fontFamilies')
    expect(json).not.toHaveProperty('charShapeId')
    expect(wasm.calls).toHaveLength(7)
    expect(chars.fontFamilies).toEqual(FAMILIES)
  })

  it('converts page pixels for paragraphs', () => {
    const json = t.resolvePara({
      marginLeft: 10,
      marginRight: 5,
      indent: 2,
      spacingBefore: 3,
      spacingAfter: 4,
      tabStops: [{ position: 4000, type: 0, fill: 0 }],
    })
    expect(json).toMatchObject({
      marginLeft: 1500,
      marginRight: 750,
      indent: 300,
      spacingBefore: 225,
      spacingAfter: 300,
    })
    expect(json.tabStops).toEqual([{ position: 4000, type: 0, fill: 0 }])
  })
})

describe('format copy capture', () => {
  it('captures a body look without changing the document', () => {
    const wasm = fakeWasm()
    const ih = fakeIh()
    const result = t.capture(ih, { wasm }, { body: 'both', cell: null })
    expect(result.state).toMatchObject({
      version: 1,
      body: 'both',
      source: { kind: 'body', inTable: false, nested: false },
    })
    expect(result.state.chars.fontFamilies).toEqual(FAMILIES)
    expect(result.state.para.tabStops).toHaveLength(1)
    expect(result.state.cell).toBeNull()
    expect(wasm.calls).toEqual([])
  })

  it('captures cell properties and defaults to all three parts', () => {
    const wasm = fakeWasm()
    const ih = fakeIh({ position: cellPosition(), cellSelection: true })
    const result = t.capture(ih, { wasm }, { body: 'chars' })
    expect(result.state.cell).toMatchObject({
      properties: true,
      border: true,
      background: true,
      target: 'bodyAndCell',
    })
    expect(result.state.cell.props).not.toHaveProperty('fieldName')
    expect(result.state.source).toMatchObject({ kind: 'cell', inTable: true, nested: false })
  })

  it('captures only character choices in a table inside a cell', () => {
    const wasm = fakeWasm()
    const ih = fakeIh({
      position: {
        ...cellPosition(),
        cellPath: [
          { controlIndex: 0, cellIndex: 0, cellParaIndex: 0 },
          { controlIndex: 1, cellIndex: 0, cellParaIndex: 0 },
        ],
      },
      cellSelection: true,
    })
    const result = t.capture(ih, { wasm }, { body: 'both', cell: { properties: true } })
    expect(result.state.body).toBe('chars')
    expect(result.state.cell).toBeNull()
    expect(result.state.chars).toBeTruthy()
    expect(result.state.para).toBeNull()
    expect(result.state.source).toMatchObject({ kind: 'cell', nested: true })
  })

  it('chooses all three cell parts, including borders, by default', () => {
    const described = {
      source: { inTable: true, nested: false },
      charStyle: null,
      paraStyle: { name: '본문', englishName: 'Body' },
    }
    const initial = t.initialOptions(described)
    expect(initial).toMatchObject({
      body: 'both',
      cell: {
        properties: true,
        border: true,
        background: true,
        target: 'bodyAndCell',
      },
    })
    const nested = t.initialOptions({
      source: { inTable: true, nested: true },
      charStyle: null,
      paraStyle: null,
    })
    expect(nested.body).toBe('chars')
    expect(nested.cell).toBeNull()
  })

  it('falls back when the character style is not available', () => {
    const wasm = fakeWasm({ getStyleList: () => [] })
    const ih = fakeIh()
    const result = t.capture(ih, { wasm }, { body: 'charStyle' })
    expect(result.refusal).toBeUndefined()
    expect(result.state.body).toBe('both')
    expect(result.state.charStyle).toBeNull()
  })
})

describe('format copy target', () => {
  it('finds a body selection and a cell text selection', () => {
    const wasm = fakeWasm()
    const body = t.targetOf(fakeIh({ selection: bodySelection() }), wasm, studio)
    expect(body).toMatchObject({ kind: 'body', sec: 0, startPara: 1, endPara: 1 })
    const cell = t.targetOf(
      fakeIh({ selection: { start: cellPosition(1, 1), end: cellPosition(1, 4) } }),
      wasm,
      studio,
    )
    expect(cell).toMatchObject({ kind: 'cellText', sec: 0, para: 2 })
    expect(cell.path).toEqual([{ controlIndex: 0, cellIndex: 1, cellParaIndex: 0 }])
  })

  it('refuses a selection that crosses the body and a table', () => {
    const wasm = fakeWasm()
    const target = t.targetOf(
      fakeIh({ selection: { start: bodyPosition(), end: cellPosition(1) } }),
      wasm,
      studio,
    )
    expect(target.refusal).toBe('mixed')
  })

  it('finds a flat cell block', () => {
    const wasm = fakeWasm()
    const target = t.targetOf(
      fakeIh({
        cellSelection: true,
        ctx: { sec: 0, ppi: 2, ci: 0 },
        range: { startRow: 0, startCol: 0, endRow: 0, endCol: 1 },
      }),
      wasm,
      studio,
    )
    expect(target).toMatchObject({ kind: 'cellBlock', cellIndices: [0, 1], nested: false })
  })
})

describe('format copy plan', () => {
  it('applies only cell formats when cell-only is chosen', () => {
    const wasm = fakeWasm()
    const ih = fakeIh()
    const target = {
      kind: 'cellBlock',
      sec: 0,
      ppi: 2,
      ci: 0,
      path: null,
      nested: false,
      cellIndices: [0, 1],
    }
    const plan = t.planApply(
      { wasm },
      studio,
      ih,
      {
        body: 'chars',
        chars: { fontSize: 1200 },
        cell: {
          properties: true,
          border: true,
          background: true,
          target: 'cellOnly',
          props: { paddingLeft: 100 },
        },
      },
      target,
    )
    expect(plan.type).toBe('applyParaFormat')
    expect(plan.children).toHaveLength(1)
    expect(plan.children[0].entries).toHaveLength(2)
    expect(plan.children[0].entries[0].props).toEqual({ paddingLeft: 100 })
  })

  it('refuses paragraph formats in a table inside a cell but allows character formats', () => {
    const wasm = fakeWasm()
    const ih = fakeIh({ selection: { start: cellPosition(), end: cellPosition(0, 4) } })
    const nested = {
      kind: 'cellText',
      sec: 0,
      para: 2,
      path: [
        { controlIndex: 0, cellIndex: 0, cellParaIndex: 0 },
        { controlIndex: 1, cellIndex: 0, cellParaIndex: 0 },
      ],
      nested: true,
      isTextBox: false,
      sel: { start: cellPosition(), end: cellPosition(0, 4) },
    }
    const para = t.planApply(
      { wasm },
      studio,
      ih,
      { body: 'paragraph', para: { alignment: 'center' } },
      nested,
    )
    expect(para.refusal).toBe('nestedParagraph')
    const chars = t.planApply(
      { wasm },
      studio,
      ih,
      { body: 'chars', chars: { fontSize: 1200 } },
      nested,
    )
    expect(chars.refusal).toBeUndefined()
    expect(chars.children).toHaveLength(1)
  })

  it('plans a paragraph style as one snapshot with the style and cells', () => {
    const wasm = fakeWasm()
    const ih = fakeIh({ selection: bodySelection() })
    const target = {
      kind: 'body',
      sec: 0,
      startPara: 1,
      endPara: 1,
      sel: bodySelection(),
    }
    const plan = t.planApply(
      { wasm },
      studio,
      ih,
      { body: 'paragraphStyle', paraStyle: { name: '본문', englishName: 'Body' } },
      target,
    )
    expect(plan.snapshot).toMatchObject({
      styleId: 1,
      targets: [{ kind: 'body', sec: 0, para: 1 }],
      cells: [],
    })
  })

  it('applies a body format to a cell block instead of overwriting the copy', () => {
    const wasm = fakeWasm()
    const ih = fakeIh()
    const target = {
      kind: 'cellBlock',
      sec: 0,
      ppi: 2,
      ci: 0,
      path: null,
      nested: false,
      cellIndices: [0, 1],
    }
    const plan = t.planApply(
      { wasm },
      studio,
      ih,
      { body: 'both', chars: { fontSize: 1200 }, para: { alignment: 'center' } },
      target,
    )
    expect(plan.refusal).toBeUndefined()
    expect(plan.children).toHaveLength(2)
    expect(plan.children[0].type).toBe('applyCharFormat')
    expect(plan.children[1].type).toBe('applyParaFormat')
  })
})

describe('format copy commands', () => {
  it('restores the cell’s full previous properties, including its field name', () => {
    const wasm = fakeWasm()
    const before = cellProps()
    const after = cellProps({ fillColor: '#000000' })
    let current = before
    wasm.getCellOwnProperties = () => current
    wasm.setCellProperties = (
      _sec: number,
      _ppi: number,
      _ci: number,
      _idx: number,
      json: string,
    ) => {
      current = { ...current, ...JSON.parse(json) }
    }
    const command = t.cellFormatCommand(
      [{ sec: 0, parentPara: 2, controlIdx: 0, cellIdx: 0, props: { fillColor: '#000000' } }],
      bodyPosition(),
    )
    command.execute(wasm as never)
    expect(current.fillColor).toBe('#000000')
    expect(current.fieldName).toBe('이름')
    command.undo(wasm as never)
    expect(current.fillColor).toBe('#abcdef')
    expect(current.fieldName).toBe('이름')
    expect(before.fillColor).toBe('#abcdef')
    expect(after.fillColor).toBe('#000000')
  })

  it('applies a character style and restores the previous runs on undo', () => {
    const calls: unknown[][] = []
    const beforeRun = { startOffset: 0, endOffset: 3, charShapeId: 1 }
    const afterRun = { startOffset: 0, endOffset: 3, charShapeId: 9 }
    let runs = [beforeRun]
    const wasm = {
      getCharShapeRuns: () => runs.map((run) => ({ ...run })),
      setCharShapeId: (...args: unknown[]) => {
        calls.push(['shape', ...args])
        runs = [afterRun]
      },
      setCharShapeRuns: (...args: unknown[]) => {
        calls.push(['runs', ...args])
        runs = (args[4] as typeof runs).map((run) => ({ ...run }))
      },
      runInBatch: (fn: () => void) => fn(),
    }
    const command = t.charStyleCommand(
      [{ kind: 'body', sec: 0, para: 0, start: 0, end: 3, shapeId: 9 }],
      bodyPosition(),
    )
    command.execute(wasm as never)
    expect(calls[0]).toMatchObject(['shape', 0, 0, 0, 3, 9])
    expect(runs[0].charShapeId).toBe(9)
    command.undo(wasm as never)
    expect(runs[0].charShapeId).toBe(1)
  })

  it('rolls back the earlier child when a later child fails', () => {
    const undone: string[] = []
    const first = {
      type: 'applyCharFormat',
      execute: () => undefined,
      undo: () => undone.push('first'),
      isNoOp: () => false,
      mergeWith: () => null,
    }
    const second = {
      type: 'applyParaFormat',
      execute: () => {
        throw new Error('boom')
      },
      undo: () => undone.push('second'),
      isNoOp: () => false,
      mergeWith: () => null,
    }
    const command = t.composite([first, second] as never, 'applyCharFormat', bodyPosition())
    expect(() => command.execute({} as never)).toThrow('boom')
    expect(undone).toEqual(['first'])
  })
})

describe('format copy commands and state', () => {
  it('copies and pastes through the same editor state', () => {
    const wasm = fakeWasm()
    const ih = fakeIh()
    const api = services(wasm, ih)
    const toast = vi.fn()
    const studioWithToast = { ...studio, showToast: toast }
    expect(ieumFormatCopy(api, studioWithToast).ok).toBe(true)
    expect(ieumHasCopiedFormat(ih)).toBe(true)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: '모양을 복사했습니다.' }))
    ih.setSelection(bodySelection())
    const result = ieumFormatPaste(api, studioWithToast)
    expect(result.ok).toBe(true)
    expect(wasm.calls.some((call) => call[0] === 'applyCharFormat')).toBe(true)
    expect(wasm.calls.some((call) => call[0] === 'applyParaFormat')).toBe(true)
    // the engine gets the properties once serialized; a JSON string inside JSON changed nothing
    for (const name of ['applyCharFormat', 'applyParaFormat']) {
      const call = wasm.calls.find((c) => c[0] === name)!
      expect(JSON.parse(call[call.length - 1] as string)).toBeTypeOf('object')
    }
    expect(ih.ops).toHaveLength(1)
    // the copied look lasts until it is overwritten, as in Hangul
    expect(ieumHasCopiedFormat(ih)).toBe(true)
    clearCopiedFormat(ih)
    expect(ieumHasCopiedFormat(ih)).toBe(false)
  })

  it('says when there is nothing to paste', () => {
    const wasm = fakeWasm()
    const ih = fakeIh()
    const toast = vi.fn()
    const result = ieumFormatPaste(services(wasm, ih), { ...studio, showToast: toast })
    expect(result.reason).toBe('noFormat')
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: '복사한 모양이 없습니다.' }),
    )
  })
})
