/**
 * Clipboard HTML for pictures, tables and text boxes (studio-plugin/clipboard-html.mjs), on the
 * patched engine in vendor/rhwp-core: a copied body block carries them, pasted into another
 * document they arrive with the text, and HTML pasted into a table cell keeps its pictures.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import {
  ieumPasteHtmlInCell,
  ieumSelectionHtml,
  ieumPictureHtml,
  pictureSize,
} from '../studio-plugin/clipboard-html.mjs'

const require = createRequire(import.meta.url)
const CORE = dirname(require.resolve('@rhwp/core'))

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(CORE, 'rhwp_bg.wasm')) })
})

/** A 1×1 PNG. */
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
)

/** The editor's engine bridge, as far as the module uses it. */
function bridge(doc: HwpDocument) {
  return {
    exportSelectionHtml: (sec: number, sp: number, so: number, ep: number, eo: number) =>
      doc.exportSelectionHtml(sec, sp, so, ep, eo),
    exportControlHtml: (sec: number, para: number, ci: number, cellPathJson = '') =>
      doc.exportControlHtml(sec, para, cellPathJson, ci),
    getControlTextPositions: (sec: number, para: number) =>
      JSON.parse(doc.getControlTextPositions(sec, para)) as number[],
    getParagraphLength: (sec: number, para: number) => doc.getParagraphLength(sec, para),
    getCellParagraphCountByPath: (sec: number, para: number, path: string) =>
      doc.getCellParagraphCountByPath(sec, para, path),
    getCellParagraphLengthByPath: (sec: number, para: number, path: string) =>
      doc.getCellParagraphLengthByPath(sec, para, path),
    exportSelectionInCellHtmlByPath: (
      sec: number,
      para: number,
      path: string,
      sp: number,
      so: number,
      ep: number,
      eo: number,
    ) => doc.exportSelectionInCellHtmlByPath(sec, para, path, sp, so, ep, eo),
    insertPicture: (...args: Parameters<HwpDocument['insertPicture']>) =>
      JSON.parse(doc.insertPicture(...args)) as {
        ok: boolean
        paraIdx: number
        controlIdx: number
      },
    // the bridge takes the control before the path, the engine after it
    copyControl: (sec: number, para: number, ci: number, cellPathJson = '') =>
      doc.copyControl(sec, para, cellPathJson, ci),
    copySelection: (sec: number, sp: number, so: number, ep: number, eo: number) =>
      doc.copySelection(sec, sp, so, ep, eo),
    setPictureProperties: (sec: number, para: number, ci: number, props: Record<string, unknown>) =>
      JSON.parse(doc.setPictureProperties(sec, para, ci, JSON.stringify(props))),
    deletePictureControl: (sec: number, para: number, ci: number) =>
      JSON.parse(doc.deletePictureControl(sec, para, ci)),
    splitParagraph: (sec: number, para: number, offset: number) =>
      doc.splitParagraph(sec, para, offset),
    mergeParagraph: (sec: number, para: number) => doc.mergeParagraph(sec, para),
    textToLogicalOffset: (sec: number, para: number, offset: number) =>
      doc.textToLogicalOffset(sec, para, offset),
    getParagraphCount: (sec: number) => doc.getParagraphCount(sec),
    pasteHtmlInCellByPath: (
      sec: number,
      para: number,
      path: string,
      offset: number,
      html: string,
    ) => doc.pasteHtmlInCellByPath(sec, para, path, offset, html),
    pasteInternalInCellByPath: (sec: number, para: number, path: string, offset: number) =>
      doc.pasteInternalInCellByPath(sec, para, path, offset),
  }
}

function blank(): HwpDocument {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  return doc
}

function insertPicture(doc: HwpDocument, para: number, offset: number): void {
  const result = JSON.parse(
    doc.insertPicture(0, para, offset, '', PNG, 7200, 5400, 96, 72, 'png', ''),
  )
  expect(result.ok).toBe(true)
}

/** "앞", a picture, a 3×2 table with "칸" in its first cell, "뒤". */
function objectsDocument(): HwpDocument {
  const doc = blank()
  doc.insertText(0, 0, 0, '앞')
  doc.splitParagraph(0, 0, 1)
  insertPicture(doc, 1, 0)
  // after the picture, which takes one place where the paragraph splits
  doc.splitParagraph(0, 1, 1)
  expect(JSON.parse(doc.createTable(0, 2, 0, 3, 2)).ok).toBe(true)
  doc.insertTextInCell(0, 2, 0, 0, 0, 0, '칸')
  doc.insertText(0, 3, 0, '뒤')
  return doc
}

/** The pictures and tables the engine lays out, in page order. */
function objectsOf(doc: HwpDocument): string[] {
  const out: string[] = []
  for (let page = 0; page < doc.pageCount(); page += 1) {
    const layout = JSON.parse(doc.getPageControlLayout(page)) as { controls: { type: string }[] }
    out.push(...layout.controls.map((c) => c.type).filter((t) => t === 'image' || t === 'table'))
  }
  return out
}

function bodyText(doc: HwpDocument): string {
  const lines: string[] = []
  for (let para = 0; para < doc.getParagraphCount(0); para += 1) {
    lines.push(doc.getTextRange(0, para, 0, doc.getParagraphLength(0, para)))
  }
  return lines.join('\n')
}

describe('clipboard HTML of a body block', () => {
  it('leaves the pictures and tables out without the module (the defect it fills)', () => {
    const doc = objectsDocument()
    const last = doc.getParagraphCount(0) - 1
    const html = doc.exportSelectionHtml(0, 0, 0, last, 1)
    expect(html).not.toMatch(/<img|<table/)
  })

  it('carries the picture and the table, in place, into another document', () => {
    const doc = objectsDocument()
    const last = doc.getParagraphCount(0) - 1
    const html = ieumSelectionHtml(bridge(doc), 0, 0, 0, last, 1)
    const order = ['앞', '<img', '<table', '칸', '뒤'].map((needle) => html.indexOf(needle))
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).toContain('<!--StartFragment-->')

    const other = blank()
    expect(JSON.parse(other.pasteHtml(0, 0, 0, html)).ok).toBe(true)
    expect(objectsOf(other)).toEqual(['image', 'table'])
    expect(bodyText(other)).toContain('앞')
    expect(bodyText(other)).toContain('뒤')
  })

  it('keeps the engine HTML for a block of text alone', () => {
    const doc = blank()
    doc.insertText(0, 0, 0, '첫 줄')
    doc.splitParagraph(0, 0, 3)
    doc.insertText(0, 1, 0, '둘째 줄')
    const engine = doc.exportSelectionHtml(0, 0, 1, 1, 2)
    expect(ieumSelectionHtml(bridge(doc), 0, 0, 1, 1, 2)).toBe(engine)
  })

  it('puts a picture inside a line where it stands, between the text around it', () => {
    const doc = blank()
    doc.insertText(0, 0, 0, '가나다라')
    insertPicture(doc, 0, 2)
    const positions = JSON.parse(doc.getControlTextPositions(0, 0)) as number[]
    expect(positions).toContain(2)
    const html = ieumSelectionHtml(bridge(doc), 0, 0, 1, 0, 3)
    expect(html).toMatch(/<p[^>]*>[\s\S]*나[\s\S]*<img[\s\S]*다[\s\S]*<\/p>/)
    expect(html).not.toContain('가')
    expect(html).not.toContain('라')
  })

  it('bounds the block as the engine does for its own copy', () => {
    const doc = blank()
    doc.insertText(0, 0, 0, '가나다라')
    insertPicture(doc, 0, 2)
    // ending right where the picture stands, inside the line: left out
    expect(ieumSelectionHtml(bridge(doc), 0, 0, 0, 0, 2)).not.toContain('<img')
    // starting there: in
    expect(ieumSelectionHtml(bridge(doc), 0, 0, 2, 0, 4)).toContain('<img')
    // the engine's own copy agrees
    doc.copySelection(0, 0, 0, 0, 2)
    expect(doc.clipboardHasControl()).toBe(false)
    doc.copySelection(0, 0, 2, 0, 4)
    expect(doc.clipboardHasControl()).toBe(true)
  })

  it('takes a picture standing alone at the end of the block when the block ends there', () => {
    const doc = blank()
    doc.insertText(0, 0, 0, '앞')
    doc.splitParagraph(0, 0, 1)
    insertPicture(doc, 1, 0)
    const end = doc.getParagraphLength(0, 1)
    expect(ieumSelectionHtml(bridge(doc), 0, 0, 0, 1, end)).toContain('<img')
  })
})

/** "앞", a text box holding "상자 글", a plain rectangle, "뒤", as the editor makes them. */
function shapesDocument(): HwpDocument {
  const doc = blank()
  doc.insertText(0, 0, 0, '앞')
  doc.splitParagraph(0, 0, 1)
  const shape = (para: number, shapeType: string) =>
    JSON.parse(
      doc.createShapeControl(
        JSON.stringify({
          sectionIdx: 0,
          paraIdx: para,
          charOffset: 0,
          width: 14000,
          height: 5000,
          horzOffset: 0,
          vertOffset: 0,
          shapeType,
          treatAsChar: true,
        }),
      ),
    )
  expect(shape(1, 'textbox').ok).toBe(true)
  const inBox = JSON.stringify([{ controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }])
  doc.insertTextInCellByPath(0, 1, inBox, 0, '상자 글')
  doc.splitParagraph(0, 1, 1)
  expect(shape(2, 'rectangle').ok).toBe(true)
  doc.splitParagraph(0, 2, 1)
  doc.insertText(0, 3, 0, '뒤')
  return doc
}

const DATA_PNG = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`

/** The caret in the first cell of objectsDocument's table, after "칸". */
const IN_CELL = {
  sectionIndex: 0,
  parentParaIndex: 2,
  controlIndex: 0,
  cellIndex: 0,
  cellParaIndex: 0,
  charOffset: 1,
  cellPath: [{ controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }],
}

/** The engine's HTML paste at that caret, as the editor calls it. */
function cellPaste(doc: HwpDocument) {
  return (html: string) => doc.pasteHtmlInCell(0, 2, 0, 0, 0, 1, html)
}

function cellText(doc: HwpDocument): string[] {
  const out: string[] = []
  for (let p = 0; p < doc.getCellParagraphCount(0, 2, 0, 0); p += 1) {
    out.push(doc.getTextInCell(0, 2, 0, 0, p, 0, doc.getCellParagraphLength(0, 2, 0, 0, p)))
  }
  return out
}

interface Laid {
  type: string
  x: number
  y: number
  w: number
  h: number
  cellIdx?: number
}

function layoutOf(doc: HwpDocument): Laid[] {
  return (JSON.parse(doc.getPageControlLayout(0)) as { controls: Laid[] }).controls
}

/** The pictures the engine lays out inside a table cell. */
function cellPictures(doc: HwpDocument): Laid[] {
  return layoutOf(doc).filter((c) => c.type === 'image' && c.cellIdx !== undefined)
}

function fragmentHtml(body: string): string {
  return `<html><body>\n<!--StartFragment-->\n${body}\n<!--EndFragment-->\n</body></html>`
}

describe('clipboard HTML of a text box', () => {
  it('carries a text box as its text in a framed cell, and leaves out a shape without text', () => {
    const doc = shapesDocument()
    const last = doc.getParagraphCount(0) - 1
    expect(doc.exportSelectionHtml(0, 0, 0, last, 1)).not.toContain('상자 글')
    const html = ieumSelectionHtml(bridge(doc), 0, 0, 0, last, 1)
    const order = ['앞', '<table', '상자 글', '</table>', '뒤'].map((needle) =>
      html.indexOf(needle),
    )
    expect(
      order.every((at) => at >= 0),
      html,
    ).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html.match(/<table\b/g)).toHaveLength(1)
    expect(html).toContain('border:1.0px solid #000000')

    const other = blank()
    expect(JSON.parse(other.pasteHtml(0, 0, 0, html)).ok).toBe(true)
    expect(objectsOf(other)).toEqual(['table'])
    expect(bodyText(other)).toContain('앞')
  })
})

describe('HTML pasted into a table cell', () => {
  it('drops the pictures without the module (the defect it fills)', () => {
    const doc = objectsDocument()
    const html = fragmentHtml(`<p>가</p><img src="${DATA_PNG}" width="96" height="72"><p>나</p>`)
    expect(JSON.parse(cellPaste(doc)(html)).ok).toBe(true)
    expect(objectsOf(doc)).toEqual(['table', 'image'])
  })

  it('puts the picture in the cell’s text where it stood, at the size the HTML gives', () => {
    const doc = objectsDocument()
    const bodyBefore = bodyText(doc)
    const html = fragmentHtml(
      `<p>가</p><p><img src="${DATA_PNG}" width="72pt" height="54pt"></p><p>나</p>`,
    )
    const result = JSON.parse(ieumPasteHtmlInCell(bridge(doc), IN_CELL, html, cellPaste(doc)))
    expect(result.ok).toBe(true)
    // the text around it, in order; the scratch paragraph left the body as it was
    expect(cellText(doc).join('|')).toMatch(/^칸가\|.*\|?나$/)
    expect(bodyText(doc)).toBe(bodyBefore)
    const inCell = cellPictures(doc)
    expect(inCell).toHaveLength(1)
    expect(Math.round(inCell[0].w)).toBe(96)
    expect(Math.round(inCell[0].h)).toBe(72)
    // the cell grew around it: the picture does not cover the cell's text
    const table = layoutOf(doc).find((c) => c.type === 'table')!
    expect(table.h).toBeGreaterThan(72)
    // one undo step for the editor: the engine's own copy of the cell's text still reads
    expect(cellText(doc)[0]).toBe('칸가')
  })

  it('lays two pictures in a cell one after the other, as part of its text', () => {
    const doc = objectsDocument()
    const img = `<p><img src="${DATA_PNG}" width="96" height="72"></p>`
    const html = fragmentHtml(`<p>가</p>${img}<p>나</p>${img}<p>다</p>`)
    expect(JSON.parse(ieumPasteHtmlInCell(bridge(doc), IN_CELL, html, cellPaste(doc))).ok).toBe(
      true,
    )
    const pictures = cellPictures(doc).sort((a, b) => a.y - b.y)
    expect(pictures).toHaveLength(2)
    expect(pictures[1].y).toBeGreaterThanOrEqual(pictures[0].y + pictures[0].h)
    expect(cellText(doc).join('')).toBe('칸가나다')
  })

  it('puts a picture alone, as another HWP tab copies one picture', () => {
    const doc = objectsDocument()
    const html = fragmentHtml(`<img src="${DATA_PNG}" width="96" height="72" />`)
    const result = JSON.parse(ieumPasteHtmlInCell(bridge(doc), IN_CELL, html, cellPaste(doc)))
    expect(result.ok).toBe(true)
    expect(cellPictures(doc)).toHaveLength(1)
    expect(cellText(doc).join('')).toBe('칸')
  })

  it('throws, so the editor takes the paste back, when a step fails', () => {
    const doc = objectsDocument()
    const wasm = {
      ...bridge(doc),
      pasteInternalInCellByPath: () => JSON.stringify({ ok: false, error: 'refused' }),
    }
    const html = fragmentHtml(`<img src="${DATA_PNG}" width="96" height="72" />`)
    expect(() => ieumPasteHtmlInCell(wasm, IN_CELL, html, cellPaste(doc))).toThrow(/stopped/)
  })

  it('leaves HTML without a picture of its own to the engine', () => {
    const doc = objectsDocument()
    const html = fragmentHtml('<p>가</p><img src="file:///x.png">')
    let seen = ''
    ieumPasteHtmlInCell(bridge(doc), IN_CELL, html, (part) => {
      seen = part
      return cellPaste(doc)(part)
    })
    expect(seen).toBe(html)
  })
})

describe('a picture file pasted from the clipboard', () => {
  it('goes in at the caret as part of the text, not at the paper corner', () => {
    // what the editor did with the engine's insertPicture (the defect)
    const before = blank()
    before.insertText(0, 0, 0, '가나다')
    JSON.parse(before.insertPicture(0, 0, 2, '', PNG, 7200, 5400, 1, 1, 'png', ''))
    const corner = layoutOf(before).find((c) => c.type === 'image')!
    expect([corner.x, corner.y]).toEqual([0, 0])

    const doc = blank()
    doc.insertText(0, 0, 0, '가나다')
    const html = ieumPictureHtml(PNG, 'png', 7200, 5400)!
    expect(JSON.parse(doc.pasteHtml(0, 0, 2, html)).ok).toBe(true)
    const picture = layoutOf(doc).find((c) => c.type === 'image')!
    expect(picture.x).toBeGreaterThan(100)
    expect(picture.y).toBeGreaterThan(100)
    expect([Math.round(picture.w), Math.round(picture.h)]).toEqual([96, 72])
    // its own line where the caret was, as the editor lifts any HTML picture out of a line
    const gso = (
      JSON.parse(doc.getControls()) as { ctrlId: string; para: number; controlIndex: number }[]
    ).find((c) => c.ctrlId === 'gso')!
    expect(JSON.parse(doc.getPictureProperties(0, gso.para, gso.controlIndex)).treatAsChar).toBe(
      true,
    )
    expect(bodyText(doc).replace(/\n/g, '')).toBe('가나다')
    expect(bodyText(doc).indexOf('가나')).toBeLessThan(bodyText(doc).indexOf('다'))
  })

  it('goes into a cell’s text the same way', () => {
    const doc = objectsDocument()
    const html = ieumPictureHtml(PNG, 'png', 7200, 5400)!
    expect(JSON.parse(ieumPasteHtmlInCell(bridge(doc), IN_CELL, html, cellPaste(doc))).ok).toBe(
      true,
    )
    expect(cellPictures(doc)).toHaveLength(1)
  })

  it('is left to the old path for a kind the HTML paste does not take', () => {
    expect(ieumPictureHtml(PNG, 'webp', 7200, 5400)).toBeNull()
    expect(ieumPictureHtml(PNG, 'png', 0, 5400)).toBeNull()
    expect(ieumPictureHtml(PNG, 'jpg', 750, 750)).toContain('data:image/jpeg;base64,')
  })
})

describe('picture sizes', () => {
  it('reads PNG, GIF, BMP and JPEG headers', () => {
    expect(pictureSize(PNG)).toEqual({ w: 1, h: 1 })
    expect(pictureSize(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 3, 0, 2, 0]))).toEqual({
      w: 3,
      h: 2,
    })
    const bmp = new Uint8Array(26)
    bmp.set([0x42, 0x4d])
    new DataView(bmp.buffer).setInt32(18, 5, true)
    new DataView(bmp.buffer).setInt32(22, -4, true)
    expect(pictureSize(bmp)).toEqual({ w: 5, h: 4 })
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 6, 0, 7, 3, 0, 0, 0,
    ])
    expect(pictureSize(jpeg)).toEqual({ w: 7, h: 6 })
    expect(pictureSize(Uint8Array.from([1, 2, 3]))).toBeNull()
  })
})
