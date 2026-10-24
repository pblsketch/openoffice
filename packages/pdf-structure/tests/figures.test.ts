/**
 * Drawings (decision 0057): a chart or diagram made of vector shapes becomes
 * one picture block with its labels; tables, boxed prose and underlines do
 * not. Labels are translated in place in a translated PDF and left out of
 * Markdown.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PDFPage } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { withPdfDocument } from '../../pdf2docx/src/extract'
import { treeToMarkdown } from '../src/markdown'
import {
  deriveTranslatedTree,
  extractDocumentTree,
  runsText,
  textUnits,
  type DocumentTree,
  type InlineRun,
} from '../src/tree'
import { writeTranslatedPdf } from '../src/writeback'
import { loadPdfium } from './helpers/fixtures'

const here = dirname(fileURLToPath(import.meta.url))
const latinFont = readFileSync(
  join(
    here,
    '..',
    '..',
    '..',
    'apps',
    'docs',
    'src',
    'renderer',
    'fonts',
    'LiberationSans-Regular.ttf',
  ),
)
const hbWasm = (() => {
  const require = createRequire(import.meta.url)
  return readFileSync(join(dirname(require.resolve('harfbuzzjs')), 'harfbuzz-subset.wasm'))
})()

const BODY = [
  'This paragraph of running text sits below the chart and explains',
  'what the reader sees in it, at the length of ordinary body prose.',
]

type Draw = (page: PDFPage, font: Awaited<ReturnType<typeof embed>>) => void
const embed = async (doc: import('pdf-lib').PDFDocument) => {
  const { StandardFonts } = await import('pdf-lib')
  return doc.embedFont(StandardFonts.Helvetica)
}

/** a line chart: axes, a polyline, four bars, labels and tick numbers, at (x, y) */
const chart =
  (x: number, y: number): Draw =>
  (page, font) => {
    const line = (x1: number, y1: number, x2: number, y2: number) =>
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1 })
    line(x, y, x + 300, y)
    line(x, y, x, y + 160)
    page.drawSvgPath('M 0 0 L 60 -40 L 120 -20 L 180 -90 L 240 -60 L 300 -120', {
      x,
      y: y + 10,
      borderWidth: 1.5,
    })
    for (let i = 0; i < 4; i++) {
      page.drawRectangle({ x: x + 20 + i * 70, y, width: 20, height: 30 + i * 15 })
    }
    page.drawText('Revenue in dollars', { x: x + 6, y: y + 150, size: 9, font })
    page.drawText('Monthly sales', { x: x + 180, y: y + 120, size: 9, font })
    for (const [t, ty] of [
      ['100', 40],
      ['200', 80],
      ['300', 120],
    ] as const) {
      page.drawText(t, { x: x - 20, y: y + ty, size: 8, font })
    }
  }

async function buildPage(draws: Draw[]): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await embed(doc)
  for (const d of draws) d(page, font)
  return doc.save()
}

const body =
  (y: number): Draw =>
  (page, font) =>
    BODY.forEach((t, i) => page.drawText(t, { x: 72, y: y - i * 14, size: 11, font }))

const caption =
  (y: number, text = 'Figure 1. Sales over the year'): Draw =>
  (page, font) =>
    page.drawText(text, { x: 120, y, size: 10, font })

const labelsOf = (tree: DocumentTree) =>
  tree.blocks.filter((b) => b.kind === 'paragraph' && b.figure !== undefined)

const textOfTree = (tree: DocumentTree) =>
  tree.blocks.map((b) => ('runs' in b ? runsText(b.runs) : '')).join('\n')

describe('drawings in the tree', () => {
  it('turns a chart into one picture with its labels, its caption bound', async () => {
    const pdf = await buildPage([chart(100, 450), caption(425), body(380)])
    const { tree } = await extractDocumentTree(pdf, { pdfium: await loadPdfium() })
    const pictures = tree.blocks.filter((b) => b.kind === 'image')
    expect(pictures).toHaveLength(1)
    const picture = pictures[0]!
    if (picture.kind !== 'image') throw new Error('not an image')
    expect(picture.mime).toBe('image/png')
    expect(picture.data.length).toBeGreaterThan(0)
    expect(picture.caption && runsText(picture.caption.runs)).toContain('Figure 1.')
    // the drawing's words are labels of that picture; its tick numbers are not text blocks
    const labels = labelsOf(tree).map((b) => ('runs' in b ? runsText(b.runs) : ''))
    expect(labels).toEqual(expect.arrayContaining(['Revenue in dollars', 'Monthly sales']))
    for (const b of labelsOf(tree)) expect(b.kind === 'paragraph' && b.figure).toBe(picture.id)
    expect(textOfTree(tree)).not.toMatch(/^(100|200|300)$/m)
    // running text below stays a paragraph
    const prose = tree.blocks.find(
      (b) => b.kind === 'paragraph' && !b.figure && runsText(b.runs).includes('running text'),
    )
    expect(prose).toBeDefined()
  })

  it('finds a drawing embedded as a form XObject', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const art = await PDFDocument.load(await buildPage([chart(100, 450)]))
    const doc = await PDFDocument.create()
    const page = doc.addPage([612, 792])
    const [graphic] = await doc.embedPdf(art, [0])
    page.drawPage(graphic!, { x: -40, y: -100, xScale: 1, yScale: 1 })
    const font = await embed(doc)
    body(250)(page, font)
    const { tree } = await extractDocumentTree(await doc.save(), { pdfium: await loadPdfium() })
    expect(tree.blocks.filter((b) => b.kind === 'image')).toHaveLength(1)
    expect(labelsOf(tree).length).toBeGreaterThanOrEqual(2)
  })

  it('leaves a ruled table, a boxed paragraph and an underlined heading alone', async () => {
    const pdf = await buildPage([
      (page, font) => {
        const line = (x1: number, y1: number, x2: number, y2: number) =>
          page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1 })
        for (const y of [700, 670, 640, 610]) line(72, y, 456, y)
        for (const x of [72, 200, 328, 456]) line(x, 610, x, 700)
        const cells = ['Name', 'Qty', 'Price', 'Pen', '2', '1.50', 'Ink', '5', '3.20']
        cells.forEach((t, i) =>
          page.drawText(t, {
            x: 80 + (i % 3) * 128,
            y: 680 - Math.floor(i / 3) * 30,
            size: 11,
            font,
          }),
        )
      },
      (page, font) => {
        page.drawRectangle({
          x: 66,
          y: 470,
          width: 420,
          height: 60,
          borderWidth: 1,
          borderColor: undefined,
        })
        BODY.forEach((t, i) => page.drawText(t, { x: 72, y: 510 - i * 14, size: 11, font }))
      },
      (page, font) => {
        page.drawText('An Underlined Heading', { x: 72, y: 400, size: 16, font })
        page.drawLine({ start: { x: 72, y: 396 }, end: { x: 260, y: 396 }, thickness: 1 })
      },
    ])
    const { tree } = await extractDocumentTree(pdf, { pdfium: await loadPdfium() })
    expect(tree.blocks.filter((b) => b.kind === 'image')).toHaveLength(0)
    expect(labelsOf(tree)).toHaveLength(0)
    expect(tree.blocks.some((b) => b.kind === 'table')).toBe(true)
  })

  it('leaves the labels out of Markdown, where the picture shows them', async () => {
    const pdf = await buildPage([chart(100, 450), caption(425), body(380)])
    const { tree } = await extractDocumentTree(pdf, { pdfium: await loadPdfium() })
    const md = treeToMarkdown(tree)
    expect(md.markdown).toContain('![')
    expect(md.markdown).not.toContain('Monthly sales')
    expect(md.markdown).toContain('running text')
  })
})

describe('drawings in a translated PDF', () => {
  async function translated(pdf: Uint8Array) {
    const pdfium = await loadPdfium()
    const { tree } = await extractDocumentTree(pdf, { pdfium })
    const tr = new Map<string, InlineRun[]>()
    for (const u of textUnits(tree))
      tr.set(u.key, [{ kind: 'text', text: `[${runsText(u.runs)}]` }])
    const out = await writeTranslatedPdf(pdf, {
      pdfium,
      hbSubsetWasm: hbWasm,
      tree,
      translated: deriveTranslatedTree(tree, 'en', tr),
      fontLocator: () => latinFont,
    })
    const text = withPdfDocument(pdfium, out.pdf, (doc) => {
      const page = pdfium._FPDF_LoadPage(doc, 0)
      const tp = pdfium._FPDFText_LoadPage(page)
      const n = pdfium._FPDFText_CountChars(tp)
      let s = ''
      for (let i = 0; i < n; i++) s += String.fromCodePoint(pdfium._FPDFText_GetUnicode(tp, i))
      pdfium._FPDFText_ClosePage(tp)
      pdfium._FPDF_ClosePage(page)
      return s
    })
    return { report: out.report, text }
  }

  it('writes each label in its own place and keeps the tick numbers', async () => {
    const { report, text } = await translated(
      await buildPage([chart(100, 450), caption(425), body(380)]),
    )
    expect(report.overflowed).toEqual([])
    expect(text).toContain('[Monthly sales]')
    expect(text).toContain('[Revenue in dollars]')
    expect(text).not.toMatch(/Monthly sales(?!\])/)
    for (const tick of ['100', '200', '300']) expect(text).toContain(tick)
  })

  it('paints over a label inside an embedded graphic and writes the translation on it', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const art = await PDFDocument.load(await buildPage([chart(100, 450)]))
    const doc = await PDFDocument.create()
    const page = doc.addPage([612, 792])
    const [graphic] = await doc.embedPdf(art, [0])
    page.drawPage(graphic!, { x: -40, y: -100, xScale: 1, yScale: 1 })
    const { report, text } = await translated(await doc.save())
    expect(report.untranslated.filter((u) => u.reason === 'text-in-form')).toEqual([])
    expect(text).toContain('[Monthly sales]')
  })
})
