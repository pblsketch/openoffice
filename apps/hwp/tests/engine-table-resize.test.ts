/**
 * The engine's one-cell resize (rhwp patch 0016, Hangul's Shift+arrow). The engine
 * already had the native call; this guards the WASM surface and the saved grid.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

function table(): HwpDocument {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  doc.splitParagraph(0, 0, 0)
  doc.pasteHtml(
    0,
    1,
    0,
    '<table>' +
      '<tr><td>A1</td><td>B1</td><td>C1</td></tr>' +
      '<tr><td>A2</td><td>B2</td><td>C2</td></tr>' +
      '<tr><td>A3</td><td>B3</td><td>C3</td></tr>' +
      '</table>',
  )
  return doc
}

function firstRowWidths(doc: HwpDocument): number[] {
  return JSON.parse(doc.getTableCellBboxes(0, 1, 0))
    .filter((box: { row: number }) => box.row === 0)
    .map((box: { w: number }) => Math.round(box.w * 10) / 10)
}

describe('one cell resize (Shift+arrow)', () => {
  it('moves the same boundary again and keeps the grid after save', () => {
    const doc = table()
    expect(firstRowWidths(doc)).toEqual([189, 189, 189])

    expect(JSON.parse(doc.resizeTableCell(0, 1, 0, 0, 0, false, true))).toMatchObject({
      ok: true,
      moved: true,
    })
    expect(firstRowWidths(doc)).toEqual([192.7, 185.2, 189])

    expect(JSON.parse(doc.resizeTableCell(0, 1, 0, 0, 0, false, true))).toMatchObject({
      ok: true,
      moved: true,
    })
    expect(firstRowWidths(doc)).toEqual([196.5, 181.4, 189])

    const dims = JSON.parse(doc.getTableDimensions(0, 1, 0))
    expect(dims).toMatchObject({ rowCount: 3, colCount: 4, cellCount: 9 })
    const first = JSON.parse(doc.getCellInfo(0, 1, 0, 0))
    expect(first).toMatchObject({ row: 0, col: 0, rowSpan: 1, colSpan: 2 })

    const saved = new HwpDocument(doc.exportHwp())
    expect(firstRowWidths(saved)).toEqual([196.5, 181.4, 189])
    expect(JSON.parse(saved.getCellInfo(0, 1, 0, 0))).toMatchObject({ colSpan: 2 })
    expect(JSON.parse(saved.resizeTableCell(0, 1, 0, 0, 0, false, true))).toMatchObject({
      ok: true,
      moved: true,
    })

    const savedHwpx = new HwpDocument(doc.exportHwpx())
    expect(firstRowWidths(savedHwpx)).toEqual([196.5, 181.4, 189])
    expect(JSON.parse(savedHwpx.getCellInfo(0, 1, 0, 0))).toMatchObject({ colSpan: 2 })
  })

  it('does nothing at the last column', () => {
    const doc = table()
    expect(JSON.parse(doc.resizeTableCell(0, 1, 0, 0, 2, false, true))).toMatchObject({
      ok: true,
      moved: false,
    })
    expect(firstRowWidths(doc)).toEqual([189, 189, 189])
  })
})
