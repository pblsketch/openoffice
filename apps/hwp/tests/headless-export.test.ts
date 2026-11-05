// @vitest-environment node
/**
 * The HWP exporter of `--headless-export` (the command line's `convert x.hwp --to pdf`):
 * the pages drawn for print by the real engine go through the same print path as the
 * File menu's Export as PDF. The hidden window is faked; what it is given is checked.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'

const loaded: string[] = []
const printToPDF = vi.fn(async (_options: unknown) => Buffer.from('%PDF-1.7 fake'))

vi.mock('electron', () => ({
  BrowserWindow: class {
    webContents = { printToPDF, print: vi.fn() }
    async loadFile(path: string) {
      loaded.push(readFileSync(path, 'utf8'))
    }
    destroy() {}
  },
}))

const { exportHwpPdfHeadless, pdfJobOf } = await import('../src/main/headless-export')

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

/** A document of `pages` pages, each starting with its number, as .hwp bytes. */
function hwpOf(pages: number): Uint8Array {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  for (let page = 0; page < pages; page++) {
    if (page > 0) doc.insertPageBreak(0, page - 1, doc.getParagraphLength(0, page - 1))
    doc.insertText(0, page, 0, `쪽 ${page + 1}`)
  }
  const bytes = doc.exportHwp()
  doc.free()
  return bytes
}

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hwp-headless-'))
  loaded.length = 0
  printToPDF.mockClear()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('the print job of the pages', () => {
  it('keeps each picture once across the pages', () => {
    const logo = 'data:image/png;base64,AAAA'
    const job = pdfJobOf([
      { svg: `<svg><image href="${logo}"/></svg>`, width: 793.7, height: 1122.5 },
      { svg: `<svg><image href="${logo}"/></svg>`, width: 793.7, height: 1122.5 },
    ])
    expect(job.mode).toBe('pdf')
    expect(job.images).toEqual([logo])
    for (const page of job.pages) expect(page.svg).toContain('href="ieum-image:0"')
  })
})

describe('exportHwpPdfHeadless', () => {
  it('writes the PDF of every page, each on its own A4 paper', async () => {
    const input = join(dir, 'report.hwp')
    const out = join(dir, 'report.pdf')
    writeFileSync(input, hwpOf(3))
    await exportHwpPdfHeadless(input, out)
    expect(readFileSync(out, 'utf8')).toBe('%PDF-1.7 fake')
    expect(printToPDF).toHaveBeenCalledOnce()
    expect(printToPDF.mock.calls[0][0]).toMatchObject({ preferCSSPageSize: true })
    expect(loaded).toHaveLength(1)
    const html = loaded[0]
    for (const page of [0, 1, 2]) {
      expect(html).toContain(`@page p${page} { size: 210mm 297mm; margin: 0; }`)
    }
    expect(html).not.toContain('@page p3 ')
    expect(html).toContain('<svg')
  })

  it('refuses a file that is not a Hangul document, writing nothing', async () => {
    const input = join(dir, 'fake.hwp')
    const out = join(dir, 'fake.pdf')
    writeFileSync(input, 'not a document')
    await expect(exportHwpPdfHeadless(input, out)).rejects.toThrow(/not a Hangul document/)
    expect(printToPDF).not.toHaveBeenCalled()
    expect(() => readFileSync(out)).toThrow()
  })
})
