/**
 * PDFium voices a line-end hyphen as control code 0x02 flagged IsHyphen.
 * The extract layer's control-code filter must let that marker through so
 * the line layer can flag the soft wrap (P21 B): without it a wrapped
 * "clas-|sification" joins with a space. Other control codes still leave.
 */
import { describe, expect, it } from 'vitest'
import { convertPdfToDocx } from '../src'
import type { PageBlock, TextBlock } from '../src/ir'
import { extractIrDocument } from '../src/pipeline'
import { loadPdfium } from './helpers/wasm'

const textBlocks = (blocks: readonly PageBlock[]): TextBlock[] =>
  blocks.filter((b): b is TextBlock => b.kind === 'text')

const hasControlCode = (text: string): boolean => [...text].some((ch) => ch.charCodeAt(0) < 0x20)

const lineTexts = (blocks: readonly PageBlock[]): string[] =>
  textBlocks(blocks).flatMap((b) => b.lines.map((l) => l.spans.map((s) => s.text).join('')))

async function bodyPdf(lines: readonly string[]): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.TimesRoman)
  lines.forEach((t, i) => page.drawText(t, { x: 72, y: 700 - i * 12, size: 10, font }))
  return doc.save()
}

async function docxParagraphs(pdf: Uint8Array): Promise<string[]> {
  const result = await convertPdfToDocx(pdf, { pdfium: await loadPdfium() })
  const JSZip = (await import('jszip')).default
  const xml = await (await JSZip.loadAsync(result.docx)).file('word/document.xml')!.async('string')
  return xml
    .split('</w:p>')
    .map((p) => [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''))
    .filter((t) => t.length > 0)
}

describe('PDFium hyphen marker (P21 B)', () => {
  // an evenly set paragraph: a greedy wrap leaves no room for the next word
  const WRAPPED = [
    'The first token of every sequence is always a special clas-',
    'sification token whose final hidden state is used as the aggre-',
    'gate sequence representation for the classification tasks, and',
    'sentence pairs are packed together into one single sequence.',
  ]

  it('flags the soft wrap and joins the word halves without a space', async () => {
    const pdf = await bodyPdf(WRAPPED)
    const ir = extractIrDocument(pdf, { pdfium: await loadPdfium() })
    const lines = textBlocks(ir.irPages[0]!.blocks).flatMap((b) => b.lines)
    expect(lines.map((l) => l.endsWithHyphen)).toEqual([true, true, false, false])
    // the marker never reaches the text
    expect(hasControlCode(lineTexts(ir.irPages[0]!.blocks).join(''))).toBe(false)

    const text = (await docxParagraphs(pdf)).join('\n')
    expect(text).toContain('special classification token')
    expect(text).toContain('the aggregate sequence')
    expect(text).not.toMatch(/clas sification|aggre gate/)
  })

  it('never ends a paragraph or a list item at a hyphen wrap', async () => {
    // ragged right: the short-line and run-on-item rules read each short
    // line as an ending, but a split word always continues on the next line
    const pdf = await bodyPdf([
      'Each input sequence starts with a special token and the',
      'final hidden state of the special clas-',
      'sification token is used as the aggre-',
      'gate sequence representation for tasks.',
    ])
    const ir = extractIrDocument(pdf, { pdfium: await loadPdfium() })
    expect(textBlocks(ir.irPages[0]!.blocks)).toHaveLength(1)
    const text = (await docxParagraphs(pdf)).join('\n')
    expect(text).toContain('special classification token is used as the aggregate sequence')
  })

  it('keeps an authored hyphen before a capitalized continuation', async () => {
    const pdf = await bodyPdf([
      'Most of the pretrained language models were trained on non-',
      'English text that was collected from the open web and then',
      'filtered by hand before it was used for training the models.',
    ])
    const ir = extractIrDocument(pdf, { pdfium: await loadPdfium() })
    const lines = textBlocks(ir.irPages[0]!.blocks).flatMap((b) => b.lines)
    expect(lines[0]!.endsWithHyphen).toBe(false)
    expect(lineTexts(ir.irPages[0]!.blocks)[0]).toMatch(/non-$/)

    const text = (await docxParagraphs(pdf)).join('\n')
    expect(text).toMatch(/non-\s?English/)
    expect(text).not.toContain('nonEnglish')
  })

  it('still drops other control codes (a ToUnicode voicing U+0001)', async () => {
    const { PDFDocument, PDFHexString, StandardFonts, ...ops } = await import('pdf-lib')
    const doc = await PDFDocument.load(
      await bodyPdf([
        'The opening line of plain body text runs on here',
        'and a second line follows it in the same paragraph',
      ]),
    )
    const page = doc.getPage(0)
    // a Helvetica whose ToUnicode voices 'A' (0x41) as U+0001
    const cmap =
      '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CMapName /X def ' +
      '1 begincodespacerange <00> <FF> endcodespacerange ' +
      '1 beginbfchar <41> <0001> endbfchar endcmap ' +
      'CMapName currentdict /CMap defineresource pop end end'
    const font = doc.context.register(
      doc.context.obj({
        Type: 'Font',
        Subtype: 'Type1',
        BaseFont: StandardFonts.Helvetica,
        Encoding: 'WinAnsiEncoding',
        ToUnicode: doc.context.register(doc.context.flateStream(cmap)),
      }),
    )
    const key = page.node.newFontDictionary('Fx', font)
    page.pushOperators(
      ops.pushGraphicsState(),
      ops.beginText(),
      ops.setFontAndSize(key, 10),
      ops.moveText(72, 600),
      ops.showText(PDFHexString.of('4142434441')), // "ABCDA"
      ops.endText(),
      ops.popGraphicsState(),
    )
    const ir = extractIrDocument(await doc.save(), { pdfium: await loadPdfium() })
    const texts = lineTexts(ir.irPages[0]!.blocks)
    expect(texts).toContain('BCD')
    expect(hasControlCode(texts.join(''))).toBe(false)
  })
})
