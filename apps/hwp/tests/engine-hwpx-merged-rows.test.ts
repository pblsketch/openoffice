/**
 * Rows that only a merged cell covers, saved as .hwpx (rhwp patch 0026). Merging cells down
 * a column leaves rows in which no cell starts. The engine wrote each as an empty `<hp:tr>`,
 * and Hangul refused the whole file ("파일을 읽거나 저장하는데 오류가 있습니다"); Hangul's own
 * HWPX never has such a row. The engine now leaves those rows out and renumbers the rest.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

interface Dimensions {
  rowCount: number
  colCount: number
  cellCount: number
}

/** A one-column answer box: a heading row over a writing area of three merged rows. */
function answerBox(): { doc: HwpDocument; paraIdx: number; controlIdx: number } {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  const made = JSON.parse(doc.createTable(0, 0, 0, 4, 1))
  expect(made).toMatchObject({ ok: true })
  const { paraIdx, controlIdx } = made
  expect(JSON.parse(doc.mergeTableCells(0, paraIdx, controlIdx, 1, 0, 3, 0))).toMatchObject({
    ok: true,
  })
  return { doc, paraIdx, controlIdx }
}

async function sectionXml(hwpx: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(hwpx)
  const section = zip.file('Contents/section0.xml')
  if (!section) throw new Error('no section0.xml')
  return section.async('string')
}

/** Every table's declared row count against its rows, and whether each row holds a cell. */
function tables(xml: string): { rowCnt: number; rows: string[] }[] {
  return [...xml.matchAll(/<hp:tbl [^>]*rowCnt="(\d+)"[^>]*>([\s\S]*?)<\/hp:tbl>/g)].map(
    ([, rowCnt, body]) => ({
      rowCnt: Number(rowCnt),
      rows: [...body.matchAll(/<hp:tr>([\s\S]*?)<\/hp:tr>|<hp:tr\/>/g)].map((m) => m[1] ?? ''),
    }),
  )
}

describe('rows covered only by a merged cell, saved as .hwpx', () => {
  it('are left out, so every row holds a cell', async () => {
    const { doc } = answerBox()
    const [table] = tables(await sectionXml(doc.exportHwpx()))
    expect(table.rowCnt).toBe(2)
    expect(table.rows).toHaveLength(2)
    for (const row of table.rows) expect(row).toContain('<hp:tc ')
    expect(table.rows[1]).toContain('<hp:cellAddr colAddr="0" rowAddr="1"/>')
    expect(table.rows[1]).toContain('<hp:cellSpan colSpan="1" rowSpan="1"/>')
  })

  it('keep the merged height and reopen as the same two cells', async () => {
    const { doc, paraIdx, controlIdx } = answerBox()
    const saved = doc.exportHwpx()
    const xml = await sectionXml(saved)
    const heights = [...xml.matchAll(/<hp:cellSz width="\d+" height="(\d+)"\/>/g)].map((m) =>
      Number(m[1]),
    )
    expect(heights).toHaveLength(2)
    expect(heights[1]).toBe(heights[0] * 3)

    const reopened = new HwpDocument(saved)
    const dims: Dimensions = JSON.parse(reopened.getTableDimensions(0, paraIdx, controlIdx))
    expect(dims).toMatchObject({ rowCount: 2, colCount: 1, cellCount: 2 })
    expect(JSON.parse(reopened.getCellInfo(0, paraIdx, controlIdx, 1))).toEqual({
      row: 1,
      col: 0,
      rowSpan: 1,
      colSpan: 1,
    })
    expect(await sectionXml(reopened.exportHwpx())).toBe(xml)
  })

  it('leave the .hwp rows as they are', () => {
    const { doc, paraIdx, controlIdx } = answerBox()
    const reopened = new HwpDocument(doc.exportHwp())
    const dims: Dimensions = JSON.parse(reopened.getTableDimensions(0, paraIdx, controlIdx))
    expect(dims).toMatchObject({ rowCount: 4, colCount: 1, cellCount: 2 })
  })
})
