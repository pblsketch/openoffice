/**
 * The format-copy state and value conversion against the real rhwp engine: the
 * copied character shape keeps every language's font and its border/fill, the
 * paragraph keeps its margins, tab stops and border/fill, and a cell's form
 * field survives a cell-format copy. The values are checked after the engine
 * writes and reads the HWP as well.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { __formatCopyTest as t } from '../studio-plugin/format-copy.mjs'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

const FAMILIES = ['맑은 고딕', 'Arial', 'SimSun', 'Arial', 'Arial', 'Arial', 'Arial']

function open() {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  const lines = ['source text', 'target text']
  lines.forEach((line, index) => {
    if (index > 0) doc.splitParagraph(0, index - 1, doc.getParagraphLength(0, index - 1))
    doc.insertText(0, index, 0, line)
  })
  return doc
}

/** The subset of the editor's wasm bridge the module reads and writes. */
function bridge(doc: HwpDocument) {
  const calls: unknown[][] = []
  const wasm: Record<string, any> = {
    calls,
    getCharPropertiesAt: (...args: unknown[]) =>
      JSON.parse(doc.getCharPropertiesAt(...(args as [number, number, number]))),
    getParaPropertiesAt: (...args: unknown[]) =>
      JSON.parse(doc.getParaPropertiesAt(...(args as [number, number]))),
    getStyleList: () => JSON.parse(doc.getStyleList()),
    getStyleAt: (...args: unknown[]) => JSON.parse(doc.getStyleAt(...(args as [number, number]))),
    getCellStyleAt: (...args: unknown[]) =>
      JSON.parse(doc.getCellStyleAt(...(args as [number, number, number, number, number]))),
    getCellCharPropertiesAt: (...args: unknown[]) =>
      JSON.parse(
        doc.getCellCharPropertiesAt(...(args as [number, number, number, number, number, number])),
      ),
    getCellCharPropertiesAtByPath: (...args: unknown[]) =>
      JSON.parse(
        (
          doc as unknown as { getCellCharPropertiesAtByPath: (...a: unknown[]) => string }
        ).getCellCharPropertiesAtByPath(...args),
      ),
    getCellParaPropertiesAt: (...args: unknown[]) =>
      JSON.parse(
        doc.getCellParaPropertiesAt(...(args as [number, number, number, number, number])),
      ),
    getCellOwnProperties: (...args: unknown[]) =>
      JSON.parse(doc.getCellOwnProperties(...(args as [number, number, number, number]))),
    getCellPropertiesByPath: () => {
      throw new Error('not used in this test')
    },
    findOrCreateFontIdForLang: (lang: number, name: string) =>
      doc.findOrCreateFontIdForLang(lang, name),
    getParagraphLength: (sec: number, para: number) => doc.getParagraphLength(sec, para),
    getCellParagraphCount: (...args: unknown[]) =>
      doc.getCellParagraphCount(...(args as [number, number, number, number])),
    getCellParagraphLength: (...args: unknown[]) =>
      doc.getCellParagraphLength(...(args as [number, number, number, number, number])),
    getCellParagraphCountByPath: (...args: unknown[]) =>
      doc.getCellParagraphCountByPath(...(args as [number, number, number])),
    getCellParagraphLengthByPath: (...args: unknown[]) =>
      doc.getCellParagraphLengthByPath(...(args as [number, number, number])),
    applyCharFormat: (...args: unknown[]) =>
      calls.push([
        'applyCharFormat',
        doc.applyCharFormat(...(args as [number, number, number, number, string])),
      ]),
    applyParaFormat: (...args: unknown[]) =>
      calls.push(['applyParaFormat', doc.applyParaFormat(...(args as [number, number, string]))]),
    applyStyle: (...args: unknown[]) =>
      calls.push(['applyStyle', doc.applyStyle(...(args as [number, number, number]))]),
    applyCellStyle: (...args: unknown[]) =>
      calls.push([
        'applyCellStyle',
        doc.applyCellStyle(...(args as [number, number, number, number, number, number])),
      ]),
    setCellProperties: (_sec: number, _ppi: number, _ci: number, _cellIdx: number, json: string) =>
      doc.setCellProperties(_sec, _ppi, _ci, _cellIdx, json),
    getCharShapeRuns: () => [],
    getCharShapeRunsInCellByPath: () => [],
    setCharShapeId: () => '',
    setCharShapeIdInCellByPath: () => '',
    setCharShapeRuns: () => '',
    setCharShapeRunsInCellByPath: () => '',
    runInBatch: (fn: () => void) => fn(),
    getTableDimensions: () => JSON.parse(doc.getTableDimensions(0, 1, 0)),
    getCellInfo: (...args: unknown[]) =>
      JSON.parse(doc.getCellInfo(...(args as [number, number, number, number]))),
    getTableDimensionsByPath: () => {
      throw new Error('not used in this test')
    },
    getCellInfoByPath: () => {
      throw new Error('not used in this test')
    },
  }
  return wasm
}

function fakeIh(
  position: Record<string, unknown>,
  selection: Record<string, unknown> | null = null,
) {
  return {
    hasSelection: () => !!selection,
    getSelection: () => selection,
    getCursorPosition: () => position,
    isInCellSelectionMode: () => false,
    isFormMode: () => false,
    cursor: {
      isInHeaderFooter: () => false,
      isInFootnote: () => false,
      isInPictureObjectSelection: () => false,
      isInTableObjectSelection: () => false,
      getExcludedCells: () => new Set<string>(),
    },
    focus: () => {},
    executeOperation: () => undefined,
  }
}

const bodyPlace = (para: number, offset: number) => ({
  sectionIndex: 0,
  paragraphIndex: para,
  charOffset: offset,
})

const cellPlace = (para: number, cellIdx: number, offset: number) => ({
  sectionIndex: 0,
  paragraphIndex: para,
  parentParaIndex: para,
  controlIndex: 0,
  cellIndex: cellIdx,
  cellParaIndex: 0,
  charOffset: offset,
})

const saved = (doc: HwpDocument) => new HwpDocument(doc.exportHwp())

describe('a copied character look', () => {
  it('keeps every language font, the text border and the fill', () => {
    const doc = open()
    const ids = FAMILIES.map((name, lang) => doc.findOrCreateFontIdForLang(lang, name))
    doc.applyCharFormat(
      0,
      0,
      0,
      11,
      JSON.stringify({
        fontIds: ids,
        fontSize: 1400,
        bold: true,
        textColor: '#123456',
        borderLeft: { type: 1, width: 1, color: '#ff0000' },
        fillType: 'solid',
        fillColor: '#abcdef',
        patternType: -1,
      }),
    )
    const wasm = bridge(doc)
    const state = t.capture(fakeIh(bodyPlace(0, 11)), { wasm }, { body: 'chars' }).state
    expect(state.chars.fontFamilies).toEqual(FAMILIES)

    const target = new HwpDocument(doc.exportHwp())
    const props = t.resolveChars(bridge(target), state.chars)
    target.applyCharFormat(0, 1, 0, 11, JSON.stringify(props))
    for (const current of [target, saved(target)]) {
      const chars = JSON.parse(current.getCharPropertiesAt(0, 1, 0))
      expect(chars.fontFamilies).toEqual(FAMILIES)
      expect(chars).toMatchObject({
        bold: true,
        fontSize: 1400,
        textColor: '#123456',
        fillType: 'solid',
        fillColor: '#abcdef',
      })
      expect(chars.borderLeft).toMatchObject({ type: 1, width: 1, color: '#ff0000' })
    }
  })
})

describe('a copied paragraph look', () => {
  it('keeps margins, tab stops and the paragraph border/fill', () => {
    const doc = open()
    doc.applyParaFormat(
      0,
      0,
      JSON.stringify({
        alignment: 'center',
        lineSpacing: 150,
        lineSpacingType: 'Percent',
        marginLeft: 1000,
        marginRight: 1000,
        indent: 2000,
        spacingBefore: 500,
        spacingAfter: 500,
        tabAutoLeft: true,
        tabStops: [
          { position: 4000, type: 0, fill: 0 },
          { position: 8000, type: 1, fill: 2 },
        ],
        borderLeft: { type: 1, width: 1, color: '#ff0000' },
        fillType: 'solid',
        fillColor: '#ffeeaa',
        patternType: -1,
      }),
    )
    const wasm = bridge(doc)
    const state = t.capture(fakeIh(bodyPlace(0, 0)), { wasm }, { body: 'paragraph' }).state
    expect(state.para.tabStops).toHaveLength(2)

    const target = new HwpDocument(doc.exportHwp())
    target.applyParaFormat(0, 1, JSON.stringify(t.resolvePara(state.para)))
    for (const current of [target, saved(target)]) {
      const para = JSON.parse(current.getParaPropertiesAt(0, 1))
      expect(para).toMatchObject({
        alignment: 'center',
        lineSpacing: 150,
        lineSpacingType: 'Percent',
        tabAutoLeft: true,
        fillType: 'solid',
        fillColor: '#ffeeaa',
      })
      expect(para.marginLeft).toBeCloseTo(6.7, 1)
      expect(para.indent).toBeCloseTo(13.3, 1)
      expect(para.tabStops).toEqual([
        { position: 4000, type: 0, fill: 0 },
        { position: 8000, type: 1, fill: 2 },
      ])
      expect(para.borderLeft).toMatchObject({ type: 1, width: 1, color: '#ff0000' })
    }
  })
})

describe('a copied style', () => {
  it('resolves the character style by name and applies its shape', () => {
    const doc = open()
    const para = JSON.parse(doc.getParaPropertiesAt(0, 0))
    const chars = JSON.parse(doc.getCharPropertiesAt(0, 0, 0))
    const id = doc.createStyle(
      JSON.stringify({
        name: '강조',
        englishName: 'Emphasis',
        type: 1,
        nextStyleId: 0,
        baseParaShapeId: para.paraShapeId,
        baseCharShapeId: chars.charShapeId,
      }),
    )
    doc.updateStyleShapes(id, JSON.stringify({ bold: true, textColor: '#ff0000' }), '{}')
    const style = JSON.parse(doc.getStyleList()).find((entry: { id: number }) => entry.id === id)
    doc.setCharShapeId(0, 0, 0, 6, style.charShapeId)
    const wasm = bridge(doc)
    const state = t.capture(fakeIh(bodyPlace(0, 6)), { wasm }, { body: 'charStyle' }).state
    expect(state.charStyle).toMatchObject({ name: '강조', englishName: 'Emphasis' })

    const found = t.findStyle(wasm, state.charStyle, 1)
    const target = new HwpDocument(doc.exportHwp())
    target.setCharShapeId(0, 1, 0, 6, found.charShapeId)
    for (const current of [target, saved(target)]) {
      expect(JSON.parse(current.getCharPropertiesAt(0, 1, 0))).toMatchObject({
        bold: true,
        textColor: '#ff0000',
      })
    }
  })

  it('resolves the paragraph style by name and applies it', () => {
    const doc = open()
    const para = JSON.parse(doc.getParaPropertiesAt(0, 0))
    const chars = JSON.parse(doc.getCharPropertiesAt(0, 0, 0))
    const id = doc.createStyle(
      JSON.stringify({
        name: '가운데 제목',
        englishName: 'Centered Heading',
        type: 0,
        nextStyleId: 0,
        baseParaShapeId: para.paraShapeId,
        baseCharShapeId: chars.charShapeId,
      }),
    )
    doc.updateStyleShapes(id, '{}', JSON.stringify({ alignment: 'center' }))
    doc.applyStyle(0, 0, id)
    const wasm = bridge(doc)
    const state = t.capture(fakeIh(bodyPlace(0, 0)), { wasm }, { body: 'paragraphStyle' }).state
    expect(state.paraStyle).toMatchObject({ name: '가운데 제목' })

    const found = t.findStyle(wasm, state.paraStyle, 0)
    const target = new HwpDocument(doc.exportHwp())
    target.applyStyle(0, 1, found.id)
    for (const current of [target, saved(target)]) {
      expect(JSON.parse(current.getStyleAt(0, 1)).name).toBe('가운데 제목')
    }
  })
})

describe('a copied cell look', () => {
  it('does not clear the cell form field, and keeps the cell fill', () => {
    const doc = open()
    doc.pasteHtml(0, 1, 0, '<table><tr><td>A</td><td>B</td></tr></table>')
    doc.setCellProperties(0, 1, 0, 0, JSON.stringify({ fieldName: '이름' }))
    doc.setCellProperties(
      0,
      1,
      0,
      1,
      JSON.stringify({
        fillType: 'solid',
        fillColor: '#abcdef',
        patternType: -1,
        borderLeft: { type: 2, width: 2, color: '#ff0000' },
        borderRight: { type: 2, width: 2, color: '#ff0000' },
        borderTop: { type: 2, width: 2, color: '#ff0000' },
        borderBottom: { type: 2, width: 2, color: '#ff0000' },
      }),
    )
    const wasm = bridge(doc)
    const source = JSON.parse(doc.getCellOwnProperties(0, 1, 0, 1))
    const props = t.pickCell(source, { properties: true, border: true, background: true })
    expect(props).not.toHaveProperty('fieldName')

    const command = t.cellFormatCommand(
      [{ sec: 0, parentPara: 1, controlIdx: 0, cellIdx: 0, props }],
      cellPlace(1, 0, 0),
    )
    command.execute(wasm)
    expect(JSON.parse(doc.getFieldList())).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: '이름', cellField: true })]),
    )
    const cell = JSON.parse(doc.getCellOwnProperties(0, 1, 0, 0))
    expect(cell).toMatchObject({
      fillType: 'solid',
      fillColor: '#abcdef',
      borderLeft: { type: 2, width: 2, color: '#ff0000' },
    })
    expect(cell.fieldName).toBe('이름')
  })
})
