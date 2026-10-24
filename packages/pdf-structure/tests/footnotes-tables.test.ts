/** Footnote linking and table merge info (spec §1). */
import { describe, expect, it } from 'vitest'
import { extractDocumentTree, tableFromSpans } from '../src/tree'
import type { TableCell } from '../src/tree'
import { buildPdf, buildTablePdf, loadPdfium, type PageItem } from './helpers/fixtures'
import { textOf } from './helpers/tree'

const notePage = (): PageItem[] => [
  { kind: 'text', text: 'The purpose of this system', x: 72, y: 700, size: 12 },
  { kind: 'text', text: '1', x: 222, y: 705, size: 7 },
  { kind: 'rule', x1: 64, y1: 400, x2: 208, y2: 400, thickness: 0.5 },
  { kind: 'text', text: '1', x: 64, y: 390, size: 7 },
  { kind: 'text', text: 'State the final goal here.', x: 72, y: 382, size: 9 },
]

/** a raised small digit after body text, with no note area on the page */
const strayMarkerPage = (): PageItem[] => [
  { kind: 'text', text: 'A claim that needs a source', x: 72, y: 700, size: 12 },
  { kind: 'text', text: '2', x: 232, y: 705, size: 7 },
  {
    kind: 'text',
    text: 'More ordinary body text follows on the next line.',
    x: 72,
    y: 680,
    size: 12,
  },
]

describe('footnotes', () => {
  it('links a note to its body marker', async () => {
    const pdf = await buildPdf([notePage()])
    const { tree } = await extractDocumentTree(pdf, { pdfium: await loadPdfium() })
    expect(tree.footnotes).toHaveLength(1)
    const note = tree.footnotes[0]!
    expect(note.page).toBe(1)
    expect(textOf(note.blocks[0]!.runs)).toBe('State the final goal here.')
    const host = tree.blocks.find(
      (b) => b.kind === 'paragraph' && b.runs.some((r) => r.kind === 'footnoteRef'),
    )
    expect(host?.kind).toBe('paragraph')
    if (host?.kind !== 'paragraph') return
    const ref = host.runs.find((r) => r.kind === 'footnoteRef')
    expect(ref).toMatchObject({ kind: 'footnoteRef', id: note.id })
    expect(tree.footnoteLinkFailedPages).toEqual([])
    // the note text is not body text
    expect(
      tree.blocks.some((b) => b.kind === 'paragraph' && textOf(b.runs).includes('final goal')),
    ).toBe(false)
  })

  it('records a page whose marker has no linked note', async () => {
    const pdf = await buildPdf([notePage(), strayMarkerPage()])
    const { tree } = await extractDocumentTree(pdf, { pdfium: await loadPdfium() })
    expect(tree.footnoteLinkFailedPages).toEqual([2])
  })
})

describe('tables', () => {
  it('keeps merged-cell spans from the IR', async () => {
    const { tree } = await extractDocumentTree(await buildTablePdf(), {
      pdfium: await loadPdfium(),
    })
    const table = tree.blocks.find((b) => b.kind === 'table')
    expect(table?.kind).toBe('table')
    if (table?.kind !== 'table') return
    expect(table.table.rowCount).toBe(2)
    expect(table.table.colCount).toBe(3)
    const at = (row: number, col: number): TableCell | undefined =>
      table.table.cells.find((c) => c.row === row && c.col === col)
    expect(at(1, 1)).toMatchObject({ colSpan: 2, rowSpan: 1 })
    expect(textOf(at(1, 1)!.paragraphs.flat())).toBe('wide merged cell')
    // the covered position has no cell; unmerged neighbours span one column
    expect(at(1, 2)).toBeUndefined()
    expect(at(0, 1)).toMatchObject({ colSpan: 1, rowSpan: 1 })
    expect(textOf(at(0, 2)!.paragraphs.flat())).toBe('Price')
  })

  it('keeps where each IR cell and its paragraphs sit', async () => {
    const { tree } = await extractDocumentTree(await buildTablePdf(), {
      pdfium: await loadPdfium(),
    })
    const table = tree.blocks.find((b) => b.kind === 'table')
    if (table?.kind !== 'table') throw new Error('no table')
    const at = (row: number, col: number) =>
      table.table.cells.find((c) => c.row === row && c.col === col)!
    const near = (r: { x0: number; y0: number; x1: number; y1: number }, want: number[]) =>
      [r.x0, r.y0, r.x1, r.y1].forEach((v, i) => expect(v).toBeCloseTo(want[i]!, 0))
    // the grid rules: columns 72 | 200 | 328 | 456, rows 700 | 660 | 620
    expect(at(0, 0).region?.page).toBe(1)
    near(at(0, 0).region!.box, [72, 660, 200, 700])
    // a merged cell spans its whole extent
    near(at(1, 1).region!.box, [200, 620, 456, 660])
    for (const c of table.table.cells) {
      expect(c.paragraphBoxes).toHaveLength(c.paragraphs.length)
      const box = c.paragraphBoxes![0]!
      expect(box.x0).toBeGreaterThanOrEqual(c.region!.box.x0)
      expect(box.y1).toBeLessThanOrEqual(c.region!.box.y1)
    }
  })

  it('builds the same shape from HTML-style row/col spans', () => {
    const t = (s: string) => [[{ kind: 'text' as const, text: s }]]
    const table = tableFromSpans([
      [
        { rowSpan: 2, paragraphs: t('A'), header: true },
        { colSpan: 2, paragraphs: t('B') },
      ],
      [{ paragraphs: t('C') }, { paragraphs: t('D') }],
      [{ paragraphs: t('E') }, { colSpan: 2, paragraphs: t('F') }],
    ])
    expect(table.rowCount).toBe(3)
    expect(table.colCount).toBe(3)
    expect(table.cells.map((c) => [c.row, c.col, c.rowSpan, c.colSpan])).toEqual([
      [0, 0, 2, 1],
      [0, 1, 1, 2],
      [1, 1, 1, 1],
      [1, 2, 1, 1],
      [2, 0, 1, 1],
      [2, 1, 1, 2],
    ])
    expect(table.cells[0]!.header).toBe(true)
    // AI tables have no measured place
    expect(table.cells[0]!.region).toBeUndefined()
  })
})
