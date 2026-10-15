import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import {
  checkOptions,
  inspectPdf,
  isPdfToolId,
  outputNames,
  runPdfTool,
  toolTakesMany,
} from '../src/main/pdf-tools/tools'

/**
 * The PDF tools window's work: each tool's file is read back (page count,
 * order, size, rotation) and the source bytes are never touched.
 */

/** pages whose widths 100, 101, … tell them apart after any reorder */
async function pdf(pageCount: number, base = 100): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([base + i, 300])
  return doc.save({ useObjectStreams: false })
}

async function widths(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((p) => Math.round(p.getWidth()))
}

/** a PDF whose trailer names an encryption dictionary */
async function encryptedPdf(): Promise<Uint8Array> {
  const text = Buffer.from(await pdf(1)).toString('latin1')
  const marked = text.replace(/trailer\s*<</, (m) => `${m}\n/Encrypt << /Filter /Standard >>`)
  expect(marked).not.toBe(text)
  return new Uint8Array(Buffer.from(marked, 'latin1'))
}

async function runUntouched(
  tool: Parameters<typeof runPdfTool>[0],
  inputs: Uint8Array[],
  options: Parameters<typeof runPdfTool>[2],
): Promise<Uint8Array[]> {
  const before = inputs.map((b) => Buffer.from(b))
  const out = await runPdfTool(tool, inputs, options)
  inputs.forEach((b, i) => expect(Buffer.from(b).equals(before[i]!)).toBe(true))
  return out
}

describe('reading a picked PDF', () => {
  it('counts the pages of a PDF', async () => {
    expect(await inspectPdf(await pdf(3))).toEqual({ ok: true, pages: 3 })
  })

  it('names a password-protected PDF and bytes that are no PDF', async () => {
    expect(await inspectPdf(await encryptedPdf())).toEqual({ ok: false, problem: 'encrypted' })
    expect(await inspectPdf(new TextEncoder().encode('not a pdf'))).toEqual({
      ok: false,
      problem: 'unreadable',
    })
  })
})

describe('checking options', () => {
  it('takes a page range only when every page exists', () => {
    expect(checkOptions('extract', { pages: '3-1, 5' }, 5)).toEqual({
      ok: true,
      options: { pages: '1,2,3,5' },
    })
    expect(checkOptions('extract', { pages: '2-9' }, 5)).toEqual({ ok: false, error: 'range' })
    expect(checkOptions('extract', { pages: 'abc' }, 5)).toEqual({ ok: false, error: 'range' })
    expect(checkOptions('extract', {}, 5)).toEqual({ ok: false, error: 'range' })
  })

  it('falls back to the dialog defaults for anything out of range', () => {
    expect(checkOptions('split', { chunkSize: 0 }, 4).options).toEqual({ chunkSize: 1 })
    expect(checkOptions('split', { chunkSize: 9 }, 4).options).toEqual({ chunkSize: 1 })
    expect(checkOptions('nup', { perSheet: 40, direction: 'diagonal' }, 4).options).toEqual({
      perSheet: 2,
      direction: 'horizontal',
      separator: false,
    })
    expect(checkOptions('rotate', { rotation: 45 }, 4).options).toEqual({ rotation: 90 })
    expect(checkOptions('pageSize', { paper: 'B5' }, 4).options).toEqual({ paper: 'A4' })
    expect(checkOptions('splitPages', { perPage: 3 }, 4).options).toEqual({ perPage: 2 })
  })

  it('keeps only the options the tool reads', () => {
    expect(checkOptions('reverse', { pages: '1', chunkSize: 2 }, 3).options).toEqual({})
  })

  it('knows its tools and which one takes several files', () => {
    expect(isPdfToolId('merge')).toBe(true)
    expect(isPdfToolId('stamps')).toBe(false)
    expect(isPdfToolId(undefined)).toBe(false)
    expect(toolTakesMany('merge')).toBe(true)
    expect(toolTakesMany('split')).toBe(false)
  })
})

describe('running each tool', () => {
  it('merges the inputs in the given order', async () => {
    const [out] = await runUntouched('merge', [await pdf(2, 100), await pdf(1, 200)], {})
    expect(await widths(out!)).toEqual([100, 101, 200])
  })

  it('splits into files of the chosen page count', async () => {
    const parts = await runUntouched('split', [await pdf(5)], { chunkSize: 2 })
    expect(await Promise.all(parts.map(widths))).toEqual([[100, 101], [102, 103], [104]])
  })

  it('extracts the chosen pages', async () => {
    const [out] = await runUntouched('extract', [await pdf(5)], { pages: '2,4,5' })
    expect(await widths(out!)).toEqual([101, 103, 104])
  })

  it('reverses the page order', async () => {
    const [out] = await runUntouched('reverse', [await pdf(3)], {})
    expect(await widths(out!)).toEqual([102, 101, 100])
  })

  it('rotates every page by the chosen angle', async () => {
    const [out] = await runUntouched('rotate', [await pdf(2)], { rotation: 270 })
    const doc = await PDFDocument.load(out!)
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([270, 270])
  })

  it('places several pages on each sheet', async () => {
    const [out] = await runUntouched('nup', [await pdf(5)], {
      perSheet: 4,
      direction: 'horizontal',
      separator: false,
    })
    expect((await PDFDocument.load(out!)).getPageCount()).toBe(2)
  })

  it('fits every page to the chosen paper', async () => {
    const [out] = await runUntouched('pageSize', [await pdf(2)], { paper: 'A5' })
    const doc = await PDFDocument.load(out!)
    for (const page of doc.getPages()) {
      expect([Math.round(page.getWidth()), Math.round(page.getHeight())]).toEqual([420, 595])
    }
  })

  it('cuts each page into pieces', async () => {
    const [out] = await runUntouched('splitPages', [await pdf(3)], { perPage: 2 })
    expect((await PDFDocument.load(out!)).getPageCount()).toBe(6)
  })
})

describe('suggested file names', () => {
  it('names the result after the first source', () => {
    expect(outputNames('merge', 'Report.PDF', 1, {})).toEqual(['Report-merged.pdf'])
    expect(outputNames('nup', 'a.pdf', 1, { perSheet: 4 })).toEqual(['a-4up.pdf'])
    expect(outputNames('pageSize', 'a.pdf', 1, { paper: 'Letter' })).toEqual(['a-Letter.pdf'])
    expect(outputNames('split', 'a.pdf', 3, {})).toEqual(['a-1.pdf', 'a-2.pdf', 'a-3.pdf'])
  })
})
