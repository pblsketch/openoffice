// @vitest-environment jsdom
/**
 * Paste onto a cell block (hancom-keys.mjs hancomPasteCells): copied cells overwrite the
 * selected cells from the block's top-left, as Hangul does when the cells are selected first.
 * The writes run on the real engine; the editor's cursor and history are stand-ins.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import {
  cellGridFromHtml,
  cellGridFromText,
  hancomCellBlockKey,
  hancomPasteCells,
} from '../studio-plugin/hancom-keys.mjs'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

function table(html?: string): HwpDocument {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  doc.splitParagraph(0, 0, 0)
  doc.pasteHtml(
    0,
    1,
    0,
    html ??
      '<table>' +
        '<tr><td>A1</td><td>B1</td><td>C1</td></tr>' +
        '<tr><td>A2</td><td>B2</td><td>C2</td></tr>' +
        '<tr><td>A3</td><td>B3</td><td>C3</td></tr>' +
        '</table>',
  )
  return doc
}

/** The studio's WasmBridge parses these engine answers; the rest pass through. */
function bridgeOf(doc: HwpDocument) {
  return {
    getTableDimensions: (s: number, p: number, c: number) =>
      JSON.parse(doc.getTableDimensions(s, p, c)),
    getCellInfo: (s: number, p: number, c: number, i: number) =>
      JSON.parse(doc.getCellInfo(s, p, c, i)),
    getCellParagraphCount: (...a: [number, number, number, number]) =>
      doc.getCellParagraphCount(...a),
    getCellParagraphLength: (...a: [number, number, number, number, number]) =>
      doc.getCellParagraphLength(...a),
    deleteRangeInCell: (...a: [number, number, number, number, number, number, number, number]) =>
      JSON.parse(doc.deleteRangeInCell(...a)),
    splitParagraphInCell: (s: number, p: number, c: number, i: number, cp: number, o: number) =>
      doc.splitParagraphInCell(s, p, c, i, cp, o),
    insertTextInCell: (...a: [number, number, number, number, number, number, string]) =>
      doc.insertTextInCell(...a),
  }
}

function cellText(doc: HwpDocument, cellIdx: number): string {
  const count = doc.getCellParagraphCount(0, 1, 0, cellIdx)
  const lines = []
  for (let p = 0; p < count; p += 1) {
    const length = doc.getCellParagraphLength(0, 1, 0, cellIdx, p)
    lines.push(doc.getTextInCell(0, 1, 0, cellIdx, p, 0, length))
  }
  return lines.join('\n')
}

function texts(doc: HwpDocument): string[] {
  const { cellCount } = JSON.parse(doc.getTableDimensions(0, 1, 0))
  return Array.from({ length: cellCount }, (_, i) => cellText(doc, i))
}

type Range = { startRow: number; startCol: number; endRow: number; endCol: number }

function handlerOn(doc: HwpDocument, range: Range, extra: Record<string, unknown> = {}) {
  const bridge = bridgeOf(doc)
  const cursor = {
    isInCellSelectionMode: () => true,
    isProtectedCellSelectionMode: () => false,
    getCellTableContext: () => ({ sec: 0, ppi: 1, ci: 0 }),
    getSelectedCellRange: () => range,
    getExcludedCells: () => new Set<string>(),
    captureCellSelection: () => ({ range }),
    getPosition: () => ({ sectionIndex: 0, paragraphIndex: 1, charOffset: 2, cellIndex: 0 }),
    setCellSelectionAnchor: vi.fn(),
    setCellSelectionFocus: vi.fn(),
    exitCellSelectionMode: vi.fn(),
    ...extra,
  }
  const executeOperation = vi.fn((desc: { operation: (b: unknown) => unknown }) =>
    desc.operation(bridge),
  )
  return {
    cursor,
    wasm: bridge,
    executeOperation,
    updateCellSelection: vi.fn(),
    updateCaret: vi.fn(),
  }
}

function paste(data: Record<string, string>) {
  return { clipboardData: { getData: (type: string) => data[type] ?? '' } }
}

describe('reading copied cells', () => {
  it('reads a spreadsheet range from its HTML, with line breaks and merges', () => {
    const html =
      '<html><head><style>td{mso-number-format:General}</style></head><body>' +
      '<table><tr><td>1</td><td colspan=2>two<br style="mso-data-placement:same-cell">lines</td></tr>' +
      '<tr><td>a&nbsp;b</td><td>x</td><td></td></tr></table></body></html>'
    expect(cellGridFromHtml(html)).toEqual([
      ['1', 'two\nlines', null],
      ['a b', 'x', ''],
    ])
  })

  it('does not read a table with text around it as cells', () => {
    expect(cellGridFromHtml('<p>before</p><table><tr><td>1</td></tr></table>')).toBeNull()
    expect(cellGridFromHtml('<p>no table</p>')).toBeNull()
  })

  it('reads tab-separated rows, quoted fields included', () => {
    expect(cellGridFromText('a\tb\r\nc\t"d\te\nf"\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd\te\nf'],
    ])
    expect(cellGridFromText('one')).toEqual([['one']])
    expect(cellGridFromText('')).toBeNull()
  })
})

describe('pasting onto a cell block', () => {
  it('overwrites cells from the block top-left in one undo step and selects what it pasted', () => {
    const doc = table()
    const ih = handlerOn(doc, { startRow: 1, startCol: 1, endRow: 2, endCol: 2 })
    expect(hancomPasteCells(ih, paste({ 'text/plain': 'x\ty\nz\tw' }))).toBe(true)
    expect(ih.executeOperation).toHaveBeenCalledTimes(1)
    expect(texts(doc)).toEqual(['A1', 'B1', 'C1', 'A2', 'x', 'y', 'A3', 'z', 'w'])
    expect(ih.cursor.setCellSelectionAnchor).toHaveBeenCalledWith(1, 1)
    expect(ih.cursor.setCellSelectionFocus).toHaveBeenCalledWith(2, 2)
  })

  it('pastes every copied cell even when the block is one cell, inside the table only', () => {
    const doc = table()
    const ih = handlerOn(doc, { startRow: 1, startCol: 1, endRow: 1, endCol: 1 })
    expect(hancomPasteCells(ih, paste({ 'text/plain': '1\t2\t3\n4\t5\t6\n7\t8\t9' }))).toBe(true)
    expect(texts(doc)).toEqual(['A1', 'B1', 'C1', 'A2', '1', '2', 'A3', '4', '5'])
  })

  it('fills every selected cell with a single value', () => {
    const doc = table()
    const ih = handlerOn(doc, { startRow: 0, startCol: 0, endRow: 1, endCol: 1 })
    expect(hancomPasteCells(ih, paste({ 'text/plain': 'same' }))).toBe(true)
    expect(texts(doc)).toEqual(['same', 'same', 'C1', 'same', 'same', 'C2', 'A3', 'B3', 'C3'])
  })

  it('prefers the HTML table and writes its line breaks as paragraphs', () => {
    const doc = table()
    const ih = handlerOn(doc, { startRow: 0, startCol: 0, endRow: 0, endCol: 0 })
    const html = '<table><tr><td>first<br>second</td><td>B</td></tr></table>'
    expect(hancomPasteCells(ih, paste({ 'text/html': html, 'text/plain': 'ignored' }))).toBe(true)
    expect(texts(doc).slice(0, 3)).toEqual(['first\nsecond', 'B', 'C1'])
  })

  it('leaves the cells a merged source cell spans alone', () => {
    const doc = table()
    const ih = handlerOn(doc, { startRow: 0, startCol: 0, endRow: 0, endCol: 0 })
    const html = '<table><tr><td colspan="2">wide</td><td>c</td></tr></table>'
    expect(hancomPasteCells(ih, paste({ 'text/html': html }))).toBe(true)
    expect(texts(doc).slice(0, 3)).toEqual(['wide', 'B1', 'c'])
  })

  it('skips cells taken out of the block', () => {
    const doc = table()
    const ih = handlerOn(
      doc,
      { startRow: 0, startCol: 0, endRow: 0, endCol: 2 },
      { getExcludedCells: () => new Set(['0,1']) },
    )
    expect(hancomPasteCells(ih, paste({ 'text/plain': 'v' }))).toBe(true)
    expect(texts(doc).slice(0, 3)).toEqual(['v', 'B1', 'v'])
  })

  it('leaves a paste without a block, or of something that is not text, to the studio', () => {
    const doc = table()
    const noBlock = handlerOn(
      doc,
      { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
      { isInCellSelectionMode: () => false },
    )
    expect(hancomPasteCells(noBlock, paste({ 'text/plain': 'a\tb' }))).toBe(false)
    const picture = handlerOn(doc, { startRow: 0, startCol: 0, endRow: 0, endCol: 0 })
    expect(hancomPasteCells(picture, paste({}))).toBe(false)
    // the studio pastes at the caret, so the block closes as for any key it leaves alone
    expect(picture.cursor.exitCellSelectionMode).toHaveBeenCalled()
    expect(texts(doc)[0]).toBe('A1')
  })

  it('does not paste into a protected form block', () => {
    const doc = table()
    const ih = handlerOn(
      doc,
      { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
      { isProtectedCellSelectionMode: () => true },
    )
    expect(hancomPasteCells(ih, paste({ 'text/plain': 'x' }))).toBe(false)
    expect(texts(doc)[0]).toBe('A1')
  })
})

describe('the paste key in a cell block', () => {
  const key = (init: Record<string, unknown>) => ({
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...init,
  })
  const blockHandler = (isProtected = false) => ({
    cursor: {
      isInCellSelectionMode: () => true,
      isProtectedCellSelectionMode: () => isProtected,
    },
  })

  it('keeps the block for Ctrl+V and Shift+Insert and lets the paste event happen', () => {
    for (const init of [
      { key: 'v', code: 'KeyV', ctrlKey: true },
      { key: 'ㅍ', code: 'KeyV', ctrlKey: true },
      { key: 'Insert', code: 'Insert', shiftKey: true },
    ]) {
      const e = key(init)
      expect(hancomCellBlockKey(blockHandler(), e), String(init.key)).toBe(true)
      expect(e.preventDefault).not.toHaveBeenCalled()
    }
  })

  it('leaves Ctrl+V in a protected form block to the studio', () => {
    const e = key({ key: 'v', code: 'KeyV', ctrlKey: true })
    expect(hancomCellBlockKey(blockHandler(true), e)).toBe(false)
  })
})
