/**
 * Turned text on an upright page (a margin stamp, a rotated label): runs of
 * turned chars leave the upright stream and come back as paragraphs of
 * their own instead of being spliced into the body lines they share a
 * baseline with.
 */
import { describe, expect, it } from 'vitest'
import type { PageBlock, TableBlock, TextBlock } from '../src/ir'
import { extractIrDocument } from '../src/pipeline'
import { loadPdfium } from './helpers/wasm'

const BODY = [
  'The first column carries running text of the paper',
  'and every line of it sits on its own baseline here',
  'while a stamp runs up the left margin of the page',
  'beside it, the way preprint servers print their ids',
  'on the first page of every paper they distribute.',
]
const STAMP = 'arXiv:1810.04805v2 [cs.CL] 24 May 2019'

const textOf = (b: TextBlock): string =>
  b.lines.map((l) => l.spans.map((s) => s.text).join('')).join('\n')

const textBlocks = (blocks: readonly PageBlock[]): TextBlock[] =>
  blocks.filter((b): b is TextBlock => b.kind === 'text')

async function pageWith(
  draw: (page: import('pdf-lib').PDFPage, font: import('pdf-lib').PDFFont) => void,
) {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  draw(page, font)
  const ir = extractIrDocument(await doc.save(), { pdfium: await loadPdfium() })
  return ir.irPages[0]!
}

describe('turned text runs', () => {
  it('keeps a margin stamp out of the body lines and returns it as a paragraph', async () => {
    const { degrees } = await import('pdf-lib')
    const page = await pageWith((p, font) => {
      BODY.forEach((t, i) => p.drawText(t, { x: 90, y: 600 - i * 14, size: 10, font }))
      p.drawText(STAMP, { x: 40, y: 250, size: 14, font, rotate: degrees(90) })
    })
    expect(page.degraded).toBe(false)
    const blocks = textBlocks(page.blocks)
    const body = blocks.filter((b) => textOf(b).includes('first column'))
    expect(body).toHaveLength(1)
    // every body line is the source line, nothing spliced in
    const lines = textOf(body[0]!).split('\n')
    BODY.forEach((t, i) => expect(lines[i]?.trim()).toBe(t))
    // the stamp reads whole, in its own paragraph, at the end of the page
    const stamp = blocks[blocks.length - 1]!
    expect(textOf(stamp).trim()).toBe(STAMP)
    expect(stamp.box.x1).toBeLessThan(90)
  })

  it('leaves a rotated header inside a ruled table to the table', async () => {
    const { degrees } = await import('pdf-lib')
    const page = await pageWith((p, font) => {
      const line = (x1: number, y1: number, x2: number, y2: number) =>
        p.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1 })
      for (const y of [700, 620, 590, 560]) line(72, y, 400, y)
      for (const x of [72, 200, 300, 400]) line(x, 560, x, 700)
      p.drawText('Region', { x: 80, y: 650, size: 11, font })
      p.drawText('Quarter', { x: 255, y: 630, size: 11, font, rotate: degrees(90) })
      p.drawText('Total', { x: 330, y: 650, size: 11, font })
      for (const [r, cells] of [
        ['North', '12', '30'],
        ['South', '9', '21'],
      ].entries()) {
        cells.forEach((t, c) => p.drawText(t, { x: 80 + c * 120, y: 600 - r * 30, size: 11, font }))
      }
    })
    const table = page.blocks.find((b): b is TableBlock => b.kind === 'table')
    expect(table).toBeDefined()
    const cellText = table!.rows
      .flat()
      .flatMap((c) => c.blocks)
      .map(textOf)
      .join(' ')
    // the table reads a turned header as stacked letters, as before; it stays in its cell
    expect(cellText.replace(/\s+/g, '')).toContain('Quarter')
    expect(textBlocks(page.blocks).some((b) => textOf(b).includes('Quarter'))).toBe(false)
  })

  it('leaves a short turned fragment where it was', async () => {
    const { degrees } = await import('pdf-lib')
    const page = await pageWith((p, font) => {
      BODY.forEach((t, i) => p.drawText(t, { x: 90, y: 600 - i * 14, size: 10, font }))
      p.drawText('xy', { x: 300, y: 300, size: 10, font, rotate: degrees(90) })
    })
    const blocks = textBlocks(page.blocks)
    // no paragraph of its own: two chars are below the run threshold
    expect(blocks.some((b) => textOf(b).trim() === 'xy')).toBe(false)
  })
})
