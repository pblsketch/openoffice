/**
 * Translated outputs of the structure jobs (spec §8): the translated PDF is
 * written by the plugged-in writer (the real writer, real PDFium, the real
 * font subsetter) from the translation kept in a real result store; Markdown
 * reads the same store. A fake translation stands in for the AI: nothing
 * here calls a provider.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildPdf, loadPdfium } from '../../../packages/pdf-structure/tests/helpers/fixtures'
import { withPdfDocument, type PdfiumModule } from '../../../packages/pdf2docx/src/extract/pdfium'
import { ResultStore } from '../../../packages/pdf-structure/src/store'
import { translationBlockKeys } from '../../../packages/pdf-structure/src/store/keys'
import { translationUnits } from '../../../packages/pdf-structure/src/translate'
import { runsText } from '../../../packages/pdf-structure/src/tree/inline'
import { hbSubsetWasmPath } from '../../pdf/src/main/wasm-path'
import {
  aiReadingsFromStore,
  runStructureJob,
  translationsFromStore,
  type JobDeps,
} from '../src/main/pdf-structure/jobs'
import { translatedPdfPayloadOf } from '../src/main/pdf-structure/plugins'
import {
  errorMessageOf,
  parseRunMessage,
  type MarkdownJobValue,
  type TreeJobValue,
  type WriteBackJobValue,
} from '../src/main/pdf-structure/protocol'
import type { PdfTranslatedPdfReport } from '../../pdf/src/shared/ipc'

const repo = join(__dirname, '..', '..', '..')
/** Liberation Sans from the repository: a Latin target independent of this PC's fonts */
const latinFont = readFileSync(
  join(repo, 'apps', 'docs', 'src', 'renderer', 'fonts', 'LiberationSans-Regular.ttf'),
)

const HEADING = 'Annual Report Summary'
const BODY = 'The quick brown fox jumps over the lazy dog near the river bank.'
const DE: Record<string, string> = {
  [HEADING]: 'Jahresbericht Zusammenfassung',
  [BODY]: 'Der schnelle braune Fuchs springt am Flussufer.',
}

let dir: string
let pdfPath: string
let userData: string
let bytes: Uint8Array
let store: ResultStore
const noProgress = () => {}

const deps = (): JobDeps => ({
  pdfium: loadPdfium,
  ocr: () => null,
  now: () => new Date('2026-01-02T03:04:05Z'),
  aiReadings: aiReadingsFromStore(userData),
  translations: translationsFromStore(userData),
  hbSubsetWasm: () => readFile(hbSubsetWasmPath()).then((b) => new Uint8Array(b)),
  writebackFontLocator: () => latinFont,
})

function pageText(m: PdfiumModule, pdf: Uint8Array): string {
  const x = m as PdfiumModule & {
    _FPDF_LoadPage(doc: number, i: number): number
    _FPDF_ClosePage(page: number): void
    _FPDFText_LoadPage(page: number): number
    _FPDFText_CountChars(tp: number): number
    _FPDFText_GetText(tp: number, start: number, n: number, buf: number): number
    _FPDFText_ClosePage(tp: number): void
    _malloc(n: number): number
    _free(p: number): void
    HEAPU8: Uint8Array
  }
  return withPdfDocument(m, pdf, (doc) => {
    const page = x._FPDF_LoadPage(doc, 0)
    const tp = x._FPDFText_LoadPage(page)
    const n = x._FPDFText_CountChars(tp)
    const buf = x._malloc((n + 1) * 2)
    x._FPDFText_GetText(tp, 0, n, buf)
    const text = Buffer.from(x.HEAPU8.subarray(buf, buf + n * 2)).toString('utf16le')
    x._free(buf)
    x._FPDFText_ClosePage(tp)
    x._FPDF_ClosePage(page)
    return text.replace(/\s+/g, ' ')
  })
}

/** store the fake translation of the blocks whose text is in `which` */
async function storeTranslation(which: string[]): Promise<{ docHash: string; total: number }> {
  const value = (await runStructureJob(
    { op: 'tree', source: { pdfPath } },
    deps(),
    noProgress,
  )) as TreeJobValue
  const units = translationUnits(value.tree)
  const keys = translationBlockKeys(units)
  await store.writeTranslationMeta(value.docHash, 'de', { provider: 'fake', model: 'm' })
  const blocks = units.flatMap((u, i) => {
    const source = runsText(u.runs).replace(/\s+/g, ' ').trim()
    const hit = which.find((w) => source.includes(w))
    return hit ? [{ key: keys[i]!, status: 'translated' as const, text: DE[hit]! }] : []
  })
  expect(blocks).toHaveLength(which.length)
  await store.writeTranslationBlocks(value.docHash, 'de', blocks)
  return { docHash: value.docHash, total: units.length }
}

beforeAll(async () => {
  bytes = await buildPdf([
    [
      { kind: 'text', text: HEADING, x: 72, y: 700, size: 22, bold: true },
      { kind: 'text', text: BODY, x: 72, y: 650 },
    ],
  ])
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pdf-structure-translation-'))
  pdfPath = join(dir, 'report.pdf')
  writeFileSync(pdfPath, bytes)
  userData = join(dir, 'user-data')
  store = new ResultStore(userData)
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('translated PDF from the stored translation', () => {
  it('writes the stored blocks into a copy with the real writer; the source stays', async () => {
    const { total } = await storeTranslation([HEADING, BODY])
    const outPath = join(dir, 'report.de.pdf')
    const value = (await runStructureJob(
      { op: 'writeBack', source: { pdfPath }, outPath, payload: { lang: 'de' } },
      deps(),
      noProgress,
    )) as WriteBackJobValue
    const m = await loadPdfium()
    const text = pageText(m, readFileSync(outPath))
    expect(text).toContain('Jahresbericht')
    expect(text).toContain('Flussufer')
    expect(text).not.toContain('quick brown fox')
    expect(readFileSync(pdfPath).equals(Buffer.from(bytes))).toBe(true)
    const report = value.report as PdfTranslatedPdfReport
    expect(report.writer.lang).toBe('de')
    expect(report.writer.translated).toBe(total)
    expect(report.translation).toMatchObject({ translated: total, pending: 0, complete: true })
    expect(report.translation.provider).toBe('fake')
  })

  it('a stopped translation writes the finished blocks and keeps the rest in the source', async () => {
    const { total } = await storeTranslation([HEADING])
    const outPath = join(dir, 'report.de.pdf')
    const value = (await runStructureJob(
      { op: 'writeBack', source: { pdfPath }, outPath, payload: { lang: 'de' } },
      deps(),
      noProgress,
    )) as WriteBackJobValue
    const text = pageText(await loadPdfium(), readFileSync(outPath))
    expect(text).toContain('Jahresbericht')
    expect(text).toContain('quick brown fox')
    const report = value.report as PdfTranslatedPdfReport
    expect(report.translation.pending).toBe(total - 1)
    expect(report.writer.untranslated.map((u) => u.reason)).toContain('not-translated')
  })

  it('refuses a payload without a known target language', async () => {
    expect(translatedPdfPayloadOf({ lang: 'xx' })).toBeNull()
    expect(translatedPdfPayloadOf(null)).toBeNull()
    expect(translatedPdfPayloadOf({ lang: 'zh-TW' })).toEqual({ lang: 'zh-TW' })
    // a bilingual PDF is asked for with bilingual: true; nothing else passes
    expect(translatedPdfPayloadOf({ lang: 'de', bilingual: true, x: 1 })).toEqual({
      lang: 'de',
      bilingual: true,
    })
    expect(translatedPdfPayloadOf({ lang: 'de', bilingual: false })).toEqual({ lang: 'de' })
    const err = await runStructureJob(
      {
        op: 'writeBack',
        source: { pdfPath },
        outPath: join(dir, 'x.pdf'),
        payload: { lang: 'xx' },
      },
      deps(),
      noProgress,
    ).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TypeError)
  })

  it('is not available where the store or the subsetter is missing', async () => {
    await storeTranslation([HEADING])
    const err = await runStructureJob(
      {
        op: 'writeBack',
        source: { pdfPath },
        outPath: join(dir, 'x.pdf'),
        payload: { lang: 'de' },
      },
      { ...deps(), hbSubsetWasm: null },
      noProgress,
    ).catch((e: unknown) => e)
    expect(errorMessageOf(err).error).toBe('not-available')
  })

  it('an encrypted source answers unsupported', () => {
    const err = Object.assign(new Error('encrypted'), { name: 'WritebackEncryptedError' })
    expect(errorMessageOf(err).error).toBe('unsupported')
  })
})

describe('translated Markdown from the stored translation', () => {
  it('writes the translated tree and reports what the store holds', async () => {
    const { total } = await storeTranslation([BODY])
    const outPath = join(dir, 'report.de.md')
    const value = (await runStructureJob(
      {
        op: 'markdown',
        source: { pdfPath },
        outPath,
        translation: { lang: 'de', bilingual: false },
      },
      deps(),
      noProgress,
    )) as MarkdownJobValue
    const md = readFileSync(outPath, 'utf8')
    expect(md).toContain('Der schnelle braune Fuchs')
    expect(md).not.toContain('quick brown fox')
    expect(md).toContain(HEADING)
    expect(value.translation).toMatchObject({ lang: 'de', total, translated: 1 })
  })

  it('bilingual keeps the source block before its translation', async () => {
    await storeTranslation([BODY])
    const outPath = join(dir, 'report.de.md')
    await runStructureJob(
      {
        op: 'markdown',
        source: { pdfPath },
        outPath,
        translation: { lang: 'de', bilingual: true },
      },
      deps(),
      noProgress,
    )
    const md = readFileSync(outPath, 'utf8')
    expect(md.indexOf('quick brown fox')).toBeGreaterThan(-1)
    expect(md.indexOf('Der schnelle braune Fuchs')).toBeGreaterThan(md.indexOf('quick brown fox'))
  })
})

describe('process setup', () => {
  it('carries the subsetter path to the process', () => {
    const run = parseRunMessage({
      type: 'run',
      setup: { wasmPath: 'p.wasm', ocrHelperPaths: [], hbSubsetWasmPath: 'hb.wasm' },
      job: { op: 'writeBack', source: { pdfPath: 'a.pdf' }, outPath: 'b.pdf', payload: {} },
    })
    expect(run?.setup.hbSubsetWasmPath).toBe('hb.wasm')
    expect(
      parseRunMessage({
        type: 'run',
        setup: { wasmPath: 'p.wasm', ocrHelperPaths: [], hbSubsetWasmPath: 3 },
        job: { op: 'tree', source: { pdfPath: 'a.pdf' } },
      }),
    ).toBeNull()
  })
})
