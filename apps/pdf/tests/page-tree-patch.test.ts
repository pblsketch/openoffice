import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { patchMissingPageKids } from '../src/renderer/page-tree-patch'

/** Six A4 pages with "Page N" on each, saved with plain (uncompressed) object headers */
async function sixPages(): Promise<{ bytes: Uint8Array; pageObjNums: number[] }> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= 6; i++) {
    doc.addPage([595.276, 841.89]).drawText(`Page ${i}`, { x: 50, y: 700, size: 24, font })
  }
  const pageObjNums = doc.getPages().map((p) => p.ref.objectNumber)
  return { bytes: await doc.save({ useObjectStreams: false }), pageObjNums }
}

/** Zero one object's bytes in place, like the damaged block in the reported file */
function zeroObject(bytes: Uint8Array, objNum: number): Uint8Array {
  const out = bytes.slice()
  const text = Buffer.from(out).toString('latin1')
  const start = text.search(new RegExp(`(^|[\\r\\n])${objNum} 0 obj`))
  const end = text.indexOf('endobj', start) + 'endobj'.length
  expect(start).toBeGreaterThan(0)
  out.fill(0, start + 1, end)
  return out
}

async function pageTexts(bytes: Uint8Array): Promise<(string | Error)[]> {
  const doc = await getDocument({ data: bytes.slice() }).promise
  const out: (string | Error)[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const vp = page.getViewport({ scale: 1 })
      out.push(
        `${content.items.map((it) => ('str' in it ? it.str : '')).join('')}@${Math.round(vp.width)}`,
      )
    } catch (err) {
      out.push(err as Error)
    }
  }
  await doc.loadingTask.destroy()
  return out
}

describe('patchMissingPageKids', () => {
  it('leaves an intact file alone', async () => {
    const { bytes } = await sixPages()
    expect(await patchMissingPageKids(bytes)).toBeNull()
  })

  it('stands a blank page in for a lost page object so the pages after it open', async () => {
    const { bytes, pageObjNums } = await sixPages()
    const damaged = zeroObject(bytes, pageObjNums[2]!)

    // PDF.js loses the lost page and every page it must walk past it to reach
    const before = await pageTexts(damaged)
    expect(before.slice(0, 2)).toEqual(['Page 1@595', 'Page 2@595'])
    expect(before.slice(2).every((p) => p instanceof Error)).toBe(true)

    const patched = await patchMissingPageKids(damaged)
    expect(patched?.blankPages).toBe(1)
    // the original bytes come first, unchanged
    expect(patched!.bytes.subarray(0, damaged.length)).toEqual(damaged)
    expect(await pageTexts(patched!.bytes)).toEqual([
      'Page 1@595',
      'Page 2@595',
      '@595',
      'Page 4@595',
      'Page 5@595',
      'Page 6@595',
    ])
  })

  it('returns null for bytes that are not a PDF', async () => {
    expect(await patchMissingPageKids(new TextEncoder().encode('not a pdf'))).toBeNull()
  })
})
