import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseDocx } from '@genoffice/docx-engine'
import { ODT_MIMETYPE, odtToText, type ConversionReport } from '@genoffice/odt-engine'
import { generateDocx } from '../../../packages/html2docx/src/generate'
import { HTML_CHANNELS } from '../src/shared/ipc'
import {
  confirmOdtReport,
  exportOdt,
  odtReportMessageBox,
  type OdtExportSteps,
} from '../src/main/odt-export'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function tempPath(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'html-odt-'))
  dirs.push(dir)
  return join(dir, name)
}

/**
 * The Word export's generation step (html2docx's IR → docx). The extraction
 * step needs a rendered page, so the IR is written here the way html2docx
 * extracts a paragraph: the text of every run as the page shows it. A span
 * marked `data-gx-redact` renders its real text, so its run carries it.
 */
async function wordExportOf(runs: string[]): Promise<Uint8Array> {
  const buffer = await generateDocx([{ type: 'para', runs: runs.map((text) => ({ text })) }], {})
  return new Uint8Array(buffer)
}

function firstZipEntry(bytes: Uint8Array): { name: string; data: string } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  expect(view.getUint32(0, true)).toBe(0x04034b50)
  const size = view.getUint32(18, true)
  const nameLen = view.getUint16(26, true)
  const extraLen = view.getUint16(28, true)
  const dec = new TextDecoder()
  const start = 30 + nameLen + extraLen
  return {
    name: dec.decode(bytes.subarray(30, 30 + nameLen)),
    data: dec.decode(bytes.subarray(start, start + size)),
  }
}

function steps(docx: Uint8Array, path: string | null, confirmAnswer = true) {
  return {
    pickPath: vi.fn(async () => path),
    docx: vi.fn(async () => docx),
    confirm: vi.fn(async (_report: ConversionReport) => confirmAnswer),
    prepare: vi.fn(async (_path: string) => true),
    write: vi.fn(async (target: string, bytes: Uint8Array) => writeFile(target, bytes)),
  } satisfies OdtExportSteps
}

async function docxText(bytes: Uint8Array): Promise<string> {
  const parsed = await parseDocx(bytes)
  return parsed.blocks.map((b) => (b.runs ?? []).map((r) => r.text).join('')).join('\n')
}

const words = (text: string) => new Set(text.split(/\s+/).filter(Boolean))

describe('HTML ODT export', () => {
  it('writes the Word export as an ODT (stored mimetype first) at the chosen path', async () => {
    const docx = await wordExportOf(['Quarterly ', 'report'])
    const path = tempPath('out.odt')
    const s = steps(docx, path)
    expect(await exportOdt(s)).toEqual({ ok: true, path })
    const bytes = new Uint8Array(readFileSync(path))
    expect(firstZipEntry(bytes)).toEqual({ name: 'mimetype', data: ODT_MIMETYPE })
    expect(await odtToText(bytes)).toContain('Quarterly report')
    expect(s.prepare).toHaveBeenCalledWith(path)
  })

  it('a non-empty report is confirmed first; cancel writes nothing', async () => {
    const path = tempPath('cancel.odt')
    const s = steps(await wordExportOf(['x']), path, false)
    const report: ConversionReport = [{ kind: 'dropped', feature: 'page_color', count: 1 }]
    const outcome = await exportOdt(s, async () => ({ odtBytes: new Uint8Array([1]), report }))
    expect(outcome).toEqual({ ok: true, canceled: true })
    expect(s.confirm).toHaveBeenCalledWith(report)
    // a canceled confirmation does not close a docs tab or touch the disk
    expect(s.prepare).not.toHaveBeenCalled()
    expect(s.write).not.toHaveBeenCalled()
    expect(existsSync(path)).toBe(false)
  })

  it('a kept docs tab (prepare = false) drops the export', async () => {
    const path = tempPath('kept.odt')
    const s = steps(await wordExportOf(['x']), path)
    s.prepare.mockResolvedValueOnce(false)
    expect(await exportOdt(s)).toEqual({ ok: true, canceled: true })
    expect(s.write).not.toHaveBeenCalled()
  })

  it('carries exactly the text of the Word export, no more (AI redaction)', async () => {
    const docx = await wordExportOf(['Account number ', 'SECRET-4711', ' is on file.'])
    const path = tempPath('redacted.odt')
    const s = steps(docx, path)
    expect(await exportOdt(s)).toEqual({ ok: true, path })
    const fromDocx = await docxText(docx)
    const fromOdt = await odtToText(new Uint8Array(readFileSync(path)))
    expect(fromOdt.includes('SECRET-4711')).toBe(fromDocx.includes('SECRET-4711'))
    const docxWords = words(fromDocx)
    for (const w of words(fromOdt)) expect(docxWords.has(w)).toBe(true)
  })

  it('the confirmation names the features in the UI language', async () => {
    const report: ConversionReport = [
      { kind: 'converted', feature: 'shape', count: 1 },
      { kind: 'dropped', feature: 'page_color', count: 1 },
    ]
    expect(odtReportMessageBox(report, 'ko').detail).toBe(
      '바뀌는 것\n• 도형\n\n빠지는 것\n• 쪽 배경색',
    )
    expect(odtReportMessageBox(report, 'en').detail).toBe(
      'What changes\n• Shapes\n\nWhat is left out\n• Page color',
    )
    expect(await confirmOdtReport(report, async () => ({ response: 1 }), 'en')).toBe(false)
  })
})

// main/preload/App import electron or the whole editor, so the request path is
// pinned by reading the sources (as print-request.test.ts does).
const source = (relative: string) =>
  readFile(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

describe('HTML ODT export wiring', () => {
  it("routes the shell's 'odt' request through preload to the main handler", async () => {
    const [app, preload, main] = await Promise.all([
      source('../src/renderer/App.tsx'),
      source('../src/preload/index.ts'),
      source('../src/main/html-main.ts'),
    ])
    expect(HTML_CHANNELS.exportOdt).toBe('html:export-odt')
    expect(app).toMatch(/format === 'odt'\s*\?\s*await window\.htmlApi\.exportOdt\(request\)/)
    expect(preload).toMatch(/exportOdt:.*HTML_CHANNELS\.exportOdt/)
    expect(main).toMatch(/ipcMain\.handle\(\s*HTML_CHANNELS\.exportOdt,/)
  })

  it('builds the ODT from the same Word export the docx handler writes', async () => {
    const main = await source('../src/main/html-main.ts')
    const docxHandler = main.slice(
      main.indexOf('HTML_CHANNELS.exportDocx,'),
      main.indexOf('HTML_CHANNELS.exportOdt,'),
    )
    const odtHandler = main.slice(main.indexOf('HTML_CHANNELS.exportOdt,'))
    const call = 'renderHtmlDocx(request.html, savePathByWc.get(e.sender.id), workDir)'
    expect(docxHandler).toContain(call)
    expect(odtHandler).toContain(call)
    expect(odtHandler).toContain('.odt`')
  })

  it('takes its attachment formats from the one shared list', async () => {
    const main = await source('../src/main/html-main.ts')
    const { ATTACHABLE_EXTS } = await import('@genoffice/file-parse')
    expect(main).toContain('ATTACHABLE_EXTS')
    expect(main).toMatch(/from '@genoffice\/file-parse'/)
    expect(ATTACHABLE_EXTS.has('odt')).toBe(true)
  })
})
