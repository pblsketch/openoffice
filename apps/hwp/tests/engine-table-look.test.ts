/**
 * vendor/rhwp-core patch 0021 on a public reproduction of a worksheet a document
 * tool wrote (its text replaced by filler, its preview and author emptied). Hangul
 * 2024 prints it with the second table 71.4px high and all three lines inside it;
 * the first table is filled black, the table and its three cells alike, 67.2px high.
 * generated-form-aligned-cells.hwpx is the same document with text in the black
 * table's cells, no fill, and the cells aligned top, center and bottom.
 * generated-form-tables-hancom.hwpx is the first document saved again by Hangul 2024,
 * which prints its tables at 431.2–498.4px and 530.7–602.1px.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'

const require = createRequire(import.meta.url)
const CORE = dirname(require.resolve('@rhwp/core'))

beforeAll(async () => {
  await init({ module_or_path: readFileSync(join(CORE, 'rhwp_bg.wasm')) })
})

interface Node {
  type: string
  pi?: number
  bbox?: { x: number; y: number; w: number; h: number }
  children?: Node[]
}

interface Line {
  type: number
  width: number
  color: string
}

interface Look {
  borderFillId: number
  borderLeft: Line
  borderRight: Line
  borderTop: Line
  borderBottom: Line
  fillType: string
  fillColor: string
}

const open = () =>
  new HwpDocument(
    new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'generated-form-tables.hwpx'))),
  )

/** The page's table nodes in order: the header table, the black one, the question box. */
function tables(doc: HwpDocument): Node[] {
  const out: Node[] = []
  const walk = (node: Node) => {
    if (node.type === 'Table') out.push(node)
    else for (const child of node.children ?? []) walk(child)
  }
  walk(JSON.parse(doc.getPageRenderTree(0)) as Node)
  return out
}

function nodes(node: Node, type: string, out: Node[] = []): Node[] {
  if (node.type === type) out.push(node)
  for (const child of node.children ?? []) nodes(child, type, out)
  return out
}

// section, paragraph and control of the three tables
const HEADER = [0, 0, 4] as const
const BLACK = [0, 10, 0] as const

function cellLooks(doc: HwpDocument, [sec, para, ctrl]: readonly number[]): Look[] {
  const { cellCount } = JSON.parse(doc.getTableDimensions(sec, para, ctrl))
  return Array.from(
    { length: cellCount },
    (_, cell) => JSON.parse(doc.getCellProperties(sec, para, ctrl, cell)) as Look,
  )
}

const lines = (look: Look) => [look.borderLeft, look.borderRight, look.borderTop, look.borderBottom]

describe('a cell whose saved height cannot hold its saved lines', () => {
  it('grows by its first paragraph space, as Hangul draws it', () => {
    // the 1×1 table holds three paragraphs with 700 HWPUNIT of space before each; the
    // tool saved the cell 200 HWPUNIT high and the first line 700 below the cell top
    const box = tables(open())[2]
    expect(box.bbox!.h).toBeCloseTo(71.4, 0)
    const bottom = box.bbox!.y + box.bbox!.h
    const runs = nodes(box, 'TextRun')
    expect(runs.length).toBeGreaterThan(0)
    for (const run of runs) expect(run.bbox!.y + run.bbox!.h).toBeLessThanOrEqual(bottom)
  })

  it('takes the space even when the saved first line sits at the cell top', () => {
    // the black table's cells hold one empty paragraph with 400 HWPUNIT of space before
    // it, saved 400/417/206 high with the line at 0; Hangul prints each row 22.4px
    const black = tables(open())[1]
    expect(black.bbox!.h).toBeCloseTo(67.2, 0)
  })

  it('puts the first line below that space, top and centered alike', () => {
    // the same table with text in its cells and no fill, aligned top, center and bottom;
    // Hangul draws every line 7.04px below its row (glyph top), the rows filled to the brim
    const doc = new HwpDocument(
      new Uint8Array(
        readFileSync(join(__dirname, 'fixtures', 'generated-form-aligned-cells.hwpx')),
      ),
    )
    const cells = nodes(tables(doc)[1], 'Cell')
    expect(cells).toHaveLength(3)
    const gaps = cells.map((cell) => nodes(cell, 'TextRun')[0].bbox!.y - cell.bbox!.y)
    for (const cell of cells) expect(cell.bbox!.h).toBeCloseTo(22.4, 0)
    // top and center as Hangul; bottom keeps the engine's own 1.2px (as before the patch)
    expect(gaps[0]).toBeCloseTo(7.2, 0)
    expect(gaps[1]).toBeCloseTo(7.2, 0)
    expect(gaps[2]).toBeGreaterThanOrEqual(7.2 - 0.5)
    expect(gaps[2]).toBeLessThanOrEqual(8.5)
  })
})

describe('a page opened by a paragraph that holds only a table', () => {
  // the header table's paragraph has 400 HWPUNIT of space before it and a stored line at
  // 400; Hangul seats the table at the paragraph top and starts the next line at the
  // table's outer box end (7595), so that 400 is not the page origin
  it('keeps the space out of the page origin, as Hangul draws it', () => {
    const doc = new HwpDocument(
      new Uint8Array(
        readFileSync(join(__dirname, 'fixtures', 'generated-form-tables-hancom.hwpx')),
      ),
    )
    const [header, black, box] = tables(doc)
    expect(header.bbox!.y).toBeCloseTo(86.7, 0)
    expect(black.bbox!.y).toBeCloseTo(431.2, 0)
    expect(black.bbox!.y + black.bbox!.h).toBeCloseTo(498.4, 0)
    expect(box.bbox!.y).toBeCloseTo(530.7, 0)
    expect(box.bbox!.y + box.bbox!.h).toBeCloseTo(602.1, 0)
  })

  it('puts the tool-written tables where Hangul does', () => {
    // the tool saved the black table 13.6px high and the next lines as if it were one
    // text line; it is drawn 67.3px high, and the next line starts at its outer box end
    const [, black, box] = tables(open())
    expect(black.bbox!.y).toBeCloseTo(431.2, 0)
    expect(box.bbox!.y).toBeCloseTo(530.7, 0)
    expect(box.bbox!.y + box.bbox!.h).toBeCloseTo(602.1, 0)
  })
})

describe('the table background and lines of 표/셀 속성', () => {
  it('clears a black table whose cells show the table fill', () => {
    const doc = open()
    const before = cellLooks(doc, BLACK)
    expect(before.every((look) => look.fillColor === '#000000')).toBe(true)
    doc.setTableProperties(...BLACK, JSON.stringify({ fillType: 'none' }))
    expect(JSON.parse(doc.getTableProperties(...BLACK)).fillType).toBe('none')
    const after = cellLooks(doc, BLACK)
    expect(after.map((look) => look.fillType)).toEqual(['none', 'none', 'none'])
    expect(after.map(lines)).toEqual(before.map(lines))
    expect(nodes(tables(doc)[1], 'Rect')).toHaveLength(0)
  })

  it("keeps a cell's own fill and every cell's lines when the table fill changes", () => {
    const doc = open()
    const before = cellLooks(doc, HEADER)
    // the first cell is filled black, the others show the table's empty fill
    expect(before[0].fillColor).toBe('#000000')
    doc.setTableProperties(
      ...HEADER,
      JSON.stringify({
        fillType: 'solid',
        fillColor: '#ffff00',
        patternColor: '#000000',
        patternType: -1,
      }),
    )
    const after = cellLooks(doc, HEADER)
    expect(after[0].fillColor).toBe('#000000')
    for (const look of after.slice(1)) expect(look.fillColor).toBe('#ffff00')
    expect(after.map(lines)).toEqual(before.map(lines))
  })

  it('gives changed lines to every cell and keeps their fills', () => {
    const doc = open()
    const before = cellLooks(doc, HEADER)
    const thick = { type: 1, width: 7, color: '#ff0000' }
    doc.setTableProperties(
      ...HEADER,
      JSON.stringify({
        borderLeft: thick,
        borderRight: thick,
        borderTop: thick,
        borderBottom: thick,
      }),
    )
    const after = cellLooks(doc, HEADER)
    for (const look of after) expect(lines(look)).toEqual([thick, thick, thick, thick])
    expect(after.map((look) => [look.fillType, look.fillColor])).toEqual(
      before.map((look) => [look.fillType, look.fillColor]),
    )
  })

  it('keeps the change through a save and a reopen', () => {
    const doc = open()
    doc.setTableProperties(...BLACK, JSON.stringify({ fillType: 'none' }))
    const again = new HwpDocument(doc.exportHwpx())
    expect(cellLooks(again, BLACK).map((look) => look.fillType)).toEqual(['none', 'none', 'none'])
    expect(JSON.parse(again.getTableProperties(...BLACK)).fillType).toBe('none')
  })
})
