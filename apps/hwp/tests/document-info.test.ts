/**
 * 문서 정보 (Hangul: 파일 → 문서 정보) against the real rhwp engine: the counts Hangul's
 * [문서 통계] panel shows, and the dialog that shows them.
 *
 * The engine is the same WASM the editor runs; the bridge in front of it is the editor's own
 * WasmBridge in miniature (same names, same return shapes), so these fail when an engine call
 * the counts rely on changes what it returns.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { JSDOM } from 'jsdom'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { documentStats, formatCount, openDocumentInfo } from '../studio-plugin/document-info.mjs'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

type Doc = InstanceType<typeof HwpDocument>

const json = (value: string) => JSON.parse(value)

/**
 * What the editor's WasmBridge hands the counts: the same method names and the same shapes
 * (arrays and objects already read, not JSON).
 */
function bridgeOf(doc: Doc) {
  return {
    getDocumentInfo: () => json(doc.getDocumentInfo()),
    getSectionCount: () => doc.getSectionCount(),
    getParagraphCount: (sec: number) => doc.getParagraphCount(sec),
    getParagraphLength: (sec: number, para: number) => doc.getParagraphLength(sec, para),
    getTextRange: (sec: number, para: number, offset: number, count: number) =>
      doc.getTextRange(sec, para, offset, count),
    getLineInfo: (sec: number, para: number, offset: number) =>
      json(doc.getLineInfo(sec, para, offset)),
    getLineInfoInCell: (
      sec: number,
      parentPara: number,
      ctrl: number,
      cell: number,
      cellPara: number,
      offset: number,
    ) => json(doc.getLineInfoInCell(sec, parentPara, ctrl, cell, cellPara, offset)),
    getTextBoxControlIndex: (sec: number, para: number) => doc.getTextBoxControlIndex(sec, para),
    getControlTextPositions: (sec: number, para: number) =>
      json(doc.getControlTextPositions(sec, para)),
    getTableDimensionsByPath: (sec: number, para: number, path: string) =>
      json(doc.getTableDimensionsByPath(sec, para, path)),
    getCellParagraphCountByPath: (sec: number, para: number, path: string) =>
      doc.getCellParagraphCountByPath(sec, para, path),
    getCellParagraphLengthByPath: (sec: number, para: number, path: string) =>
      doc.getCellParagraphLengthByPath(sec, para, path),
    getTextInCellByPath: (sec: number, para: number, path: string, offset: number, count: number) =>
      doc.getTextInCellByPath(sec, para, path, offset, count),
    getCellParagraphCount: (sec: number, para: number, ctrl: number, cell: number) =>
      doc.getCellParagraphCount(sec, para, ctrl, cell),
    getCellParagraphLength: (
      sec: number,
      para: number,
      ctrl: number,
      cell: number,
      cellPara: number,
    ) => doc.getCellParagraphLength(sec, para, ctrl, cell, cellPara),
    getTextInCell: (
      sec: number,
      para: number,
      ctrl: number,
      cell: number,
      cellPara: number,
      offset: number,
      count: number,
    ) => doc.getTextInCell(sec, para, ctrl, cell, cellPara, offset, count),
    getControlImageMime: (sec: number, para: number, ctrl: number, cellPath = '') =>
      doc.getControlImageMime(sec, para, cellPath, ctrl),
  }
}

/** 제목 / 첫째 문단입니다.  공백 포함 / 둘째 문단입니다. / [2×2 table], as the engine builds it. */
function documentWithTable(): Doc {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  const lines = ['제목', '첫째 문단입니다.  공백 포함', '둘째 문단입니다.']
  lines.forEach((line, index) => {
    if (index > 0) doc.splitParagraph(0, index - 1, doc.getParagraphLength(0, index - 1))
    if (line) doc.insertText(0, index, 0, line)
  })
  // the empty fourth paragraph is where the table goes
  doc.splitParagraph(0, 2, doc.getParagraphLength(0, 2))
  doc.pasteHtml(
    0,
    3,
    0,
    '<table><tr><td>구분</td><td>내용</td></tr><tr><td>대상 한자 漢字</td><td>업체</td></tr></table>',
  )
  return doc
}

/** 201 characters: one sheet of 200 is not enough. */
const HAIRLINE_CHARS = 201

describe('문서 통계의 수', () => {
  it('counts the body text and the cells of a table, as Hangul does', () => {
    const doc = documentWithTable()
    const stats = documentStats(bridgeOf(doc) as never)

    // 제목(2) + 첫째 문단입니다.  공백 포함(16) + 둘째 문단입니다.(9) + four cells(2+2+8+2)
    expect(stats.chars).toBe(41)
    // the same without the five blanks
    expect(stats.charsNoSpace).toBe(34)
    expect(stats.words).toBe(13)
    expect(stats.hanja).toBe(2)
    // a 2×2 table is four paragraphs, on top of the four body paragraphs
    expect(stats.paragraphs).toBe(8)
    expect(stats.tables).toBe(1)
    expect(stats.pages).toBe(1)
  })

  it('counts a table cell as a paragraph and one line as one line', () => {
    const doc = documentWithTable()
    const stats = documentStats(bridgeOf(doc) as never)
    // the engine's layout says one line for each short paragraph and each cell
    expect(stats.lines).toBe(8)
  })

  it('counts manuscript sheets from the body text, and one more for each table', () => {
    const doc = documentWithTable()
    const stats = documentStats(bridgeOf(doc) as never)
    // 27 body characters fill one sheet of 200; the table takes a sheet of its own
    expect(stats.sheets).toBe(2)
  })

  it('counts nothing in an empty document', () => {
    const doc = HwpDocument.createEmpty()
    doc.createBlankDocument()
    const stats = documentStats(bridgeOf(doc) as never)
    expect(stats).toMatchObject({
      chars: 0,
      charsNoSpace: 0,
      hanja: 0,
      words: 0,
      paragraphs: 1,
      lines: 1,
      tables: 0,
      pictures: 0,
      textBoxes: 0,
      sheets: 0,
    })
  })

  it('fills more than one manuscript sheet from a long body', () => {
    const doc = HwpDocument.createEmpty()
    doc.createBlankDocument()
    doc.insertText(0, 0, 0, '가'.repeat(HAIRLINE_CHARS))
    const stats = documentStats(bridgeOf(doc) as never)
    expect(stats.chars).toBe(HAIRLINE_CHARS)
    expect(stats.sheets).toBe(2)
  })

  it('shows the numbers the way the dialog does', () => {
    expect(formatCount(12345, true)).toBe('12,345')
    expect(formatCount(0, false)).toBe('0')
    expect(formatCount(Number.NaN, true)).toBe('0')
    expect(formatCount(-4, true)).toBe('0')
  })
})

describe('문서 정보 대화 상자', () => {
  const dom = new JSDOM('<!doctype html><body></body>')
  const realDocument = globalThis.document
  afterEach(() => {
    globalThis.document = realDocument
  })

  /** The studio's dialog base, as the commands are handed it. */
  function dialogBase() {
    return class ModalDialog {
      overlay!: HTMLElement
      dialog!: HTMLElement
      constructor(
        public title: string,
        public width: number,
      ) {}
      createBody(): HTMLElement {
        return globalThis.document.createElement('div')
      }
      onConfirm() {
        return true
      }
      show() {
        const doc = globalThis.document
        this.overlay = doc.createElement('div')
        this.dialog = doc.createElement('div')
        const title = doc.createElement('div')
        title.textContent = this.title
        const footer = doc.createElement('div')
        const primary = doc.createElement('button')
        primary.className = 'dialog-btn dialog-btn-primary'
        primary.textContent = '확인'
        const cancel = doc.createElement('button')
        cancel.className = 'dialog-btn'
        cancel.textContent = '취소'
        footer.append(primary, cancel)
        this.dialog.append(title, this.createBody(), footer)
        this.overlay.append(this.dialog)
        doc.body.append(this.overlay)
      }
    }
  }

  const wasm = {
    getDocumentInfo: () => ({ pageCount: 3 }),
    getSectionCount: () => 1,
    getParagraphCount: () => 1,
    getParagraphLength: () => 5,
    getTextRange: () => '가나 다',
    getLineInfo: () => ({ lineCount: 2 }),
    getControlTextPositions: () => [],
    getTextBoxControlIndex: () => -1,
  }

  it("shows Hangul's statistics and closes with one button", async () => {
    globalThis.document = dom.window.document
    const shown = openDocumentInfo({ ModalDialog: dialogBase() }, { wasm } as never, true)
    expect(shown).toBe(true)
    const dialog =
      dom.window.document.querySelector('.dialog-btn-primary')?.parentElement?.parentElement
    expect(dialog?.querySelector('.dialog-section-title')?.textContent).toBe('문서 통계')
    const labels = [...(dialog?.querySelectorAll('.dialog-label') ?? [])].map(
      (label) => label.textContent,
    )
    expect(labels).toEqual([
      '글자 (공백 포함)',
      '글자 (공백 제외)',
      '글자에 포함된 한자 수',
      '낱말',
      '줄',
      '문단',
      '쪽',
      '원고지 (200자 기준)',
      '표',
      '그림',
      '글상자',
    ])
    // one reading of a finished panel: Hangul's 닫기, and no cancel beside it
    expect(dom.window.document.querySelector('.dialog-btn-primary')?.textContent).toBe('닫기')
    expect(dom.window.document.querySelectorAll('.dialog-btn')).toHaveLength(1)
    // the numbers arrive once the dialog is on screen
    await new Promise((resolve) => setTimeout(resolve, 0))
    const value = (key: string) => dialog?.querySelector(`[data-key="${key}"]`)?.textContent
    expect(value('chars')).toBe('4')
    expect(value('charsNoSpace')).toBe('3')
    expect(value('words')).toBe('2')
    expect(value('lines')).toBe('2')
    expect(value('pages')).toBe('3')
  })

  it('does nothing without a dialog to build on', () => {
    globalThis.document = dom.window.document
    expect(openDocumentInfo({}, { wasm } as never, true)).toBe(false)
  })
})
