/**
 * Translated-PDF writeback (spec §8): the result is re-read with
 * PDFium — translated blocks lose their source text and gain the
 * translation, while links, images and vector shapes stay as they were.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { withPdfDocument, type PdfiumModule } from '../../pdf2docx/src/extract'
import type { OcrEngine } from '../../pdf2docx/src/ocr'
import {
  deriveTranslatedTree,
  extractDocumentTree,
  runsText,
  type DocumentTree,
  type InlineRun,
  type TreeBlock,
} from '../src/tree'
import {
  MIN_FONT_SCALE,
  WritebackEncryptedError,
  defaultWritebackFontLocator,
  writeTranslatedPdf,
  type WritebackFontLocator,
  type WritebackOptions,
} from '../src/writeback'
import {
  buildPdf,
  buildScannedPdf,
  buildTablePdf,
  loadPdfium,
  para,
  tinyPng,
  wordLines,
} from './helpers/fixtures'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')

// ── inputs ──

const hbWasm = (() => {
  const require = createRequire(import.meta.url)
  return readFileSync(join(dirname(require.resolve('harfbuzzjs')), 'harfbuzz-subset.wasm'))
})()

/** Liberation Sans from the repository (Latin target, machine-independent) */
const latinFont = readFileSync(
  join(repo, 'apps', 'docs', 'src', 'renderer', 'fonts', 'LiberationSans-Regular.ttf'),
)
const latinLocator: WritebackFontLocator = () => latinFont

const u16 = (b: Buffer, o: number) => b.readUInt16BE(o)
const u32 = (b: Buffer, o: number) => b.readUInt32BE(o)

/**
 * A test face that maps `chars` (plus printable ASCII) onto Liberation Sans
 * glyphs through a new format-12 cmap. The shapes are wrong but every char
 * embeds, draws and extracts like a real face's — a stand-in for a Korean
 * font on machines without one.
 */
function syntheticFont(chars: string): Buffer {
  const base = latinFont
  const numTables = u16(base, 4)
  const tables = new Map<string, Buffer>()
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    const tag = base.toString('latin1', rec, rec + 4)
    tables.set(tag, base.subarray(u32(base, rec + 8), u32(base, rec + 8) + u32(base, rec + 12)))
  }
  const numGlyphs = u16(tables.get('maxp')!, 4)
  const cps = [
    ...new Set([
      ...Array.from({ length: 95 }, (_, i) => 0x20 + i),
      ...[...chars].map((c) => c.codePointAt(0)!),
    ]),
  ].sort((a, b) => a - b)
  const sub = Buffer.alloc(16 + cps.length * 12)
  sub.writeUInt16BE(12, 0)
  sub.writeUInt32BE(sub.length, 4)
  sub.writeUInt32BE(cps.length, 12)
  cps.forEach((cp, i) => {
    sub.writeUInt32BE(cp, 16 + i * 12)
    sub.writeUInt32BE(cp, 20 + i * 12)
    sub.writeUInt32BE(1 + ((cp * 7) % (numGlyphs - 1)), 24 + i * 12)
  })
  const cmap = Buffer.concat([Buffer.from([0, 0, 0, 1, 0, 3, 0, 10, 0, 0, 0, 12]), sub])
  tables.set('cmap', cmap)
  const tags = [...tables.keys()].sort()
  const header = Buffer.alloc(12 + tags.length * 16)
  base.copy(header, 0, 0, 4)
  header.writeUInt16BE(tags.length, 4)
  const bodies: Buffer[] = []
  let offset = header.length
  tags.forEach((tag, i) => {
    const data = tables.get(tag)!
    const rec = 12 + i * 16
    header.write(tag, rec, 'latin1')
    header.writeUInt32BE(offset, rec + 8)
    header.writeUInt32BE(data.length, rec + 12)
    const padded = Buffer.alloc((data.length + 3) & ~3)
    data.copy(padded)
    bodies.push(padded)
    offset += padded.length
  })
  return Buffer.concat([header, ...bodies])
}

const KO = {
  heading: '연례 보고서',
  body: '빠른 갈색 여우가 강둑 근처에서 게으른 개를 뛰어넘습니다.',
  // overflows even at the floor size in the synthetic face, whose Latin
  // stand-in glyphs run about half as wide as a real Korean face's
  long: '이 문단은 원문보다 훨씬 길게 번역되어 상자 안에 다 들어가지 않습니다. '.repeat(40),
  scanHead: '스캔한 제목',
  scanBody: '스캔한 문단의 번역입니다',
  // drawn by the Korean-source and table tests; listed here so the test face covers them
  sourceLine1: '이 문단은 영어로 번역될',
  sourceLine2: '한국어 원문을 담고 있습니다.',
  cellName: '이름',
  cellPrice: '가격',
  cellWide: '넓게 합친 칸',
}

/** the installed Korean face when there is one, else the injected test face */
const koreanLocator: WritebackFontLocator = (() => {
  const all = Object.values(KO).join('')
  if (defaultWritebackFontLocator(all, 'ko')) return defaultWritebackFontLocator
  const font = syntheticFont(all)
  return () => font
})()

// ── synthetic sources ──

const HEADING = 'Annual Report Summary'
const PARA = [
  'The quick brown fox jumps over the lazy',
  'dog near the river bank while the farmer',
  'watches from the old wooden fence.',
]
const KEEP = ['This closing paragraph keeps its source', 'text because it has no translation.']

/** heading, two paragraphs, an image, a filled rectangle, a line and a link */
async function buildSource(): Promise<Uint8Array> {
  const { PDFDocument, PDFName, PDFString, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  page.drawText(HEADING, { x: 72, y: 720, size: 20, font: bold })
  PARA.forEach((t, i) => page.drawText(t, { x: 72, y: 680 - i * 15, size: 12, font: regular }))
  KEEP.forEach((t, i) => page.drawText(t, { x: 72, y: 600 - i * 15, size: 12, font: regular }))
  const image = await doc.embedPng(tinyPng())
  page.drawImage(image, { x: 72, y: 380, width: 120, height: 90 })
  page.drawRectangle({ x: 320, y: 380, width: 140, height: 90, color: rgb(0.2, 0.5, 0.8) })
  page.drawLine({ start: { x: 72, y: 360 }, end: { x: 460, y: 360 }, thickness: 1 })
  const link = doc.context.register(
    doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [72, 640, 320, 695],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.com/') },
    }),
  )
  page.node.set(PDFName.of('Annots'), doc.context.obj([link]))
  return doc.save()
}

/**
 * PARA at an effective 12pt, written as `tf Tf` under a `scale` text matrix
 * inside a `ctm` graphics matrix (1 Tf × 12, browser print 16 × 0.75, …)
 */
async function buildScaledSource(tf: number, scale: number, ctm: number): Promise<Uint8Array> {
  const { PDFDocument, PDFNumber, PDFOperator, PDFString, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const key = page.node.newFontDictionary('F1', font.ref)
  const num = (n: number) => PDFNumber.of(n)
  const op = (name: string, ...args: unknown[]) => PDFOperator.of(name as never, args as never)
  page.pushOperators(op('q'), op('cm', num(ctm), num(0), num(0), num(ctm), num(0), num(0)))
  PARA.forEach((t, i) => {
    page.pushOperators(
      op('BT'),
      op('Tf', key, num(tf)),
      op('Tm', num(scale), num(0), num(0), num(scale), num(72 / ctm), num((680 - i * 15) / ctm)),
      op('Tj', PDFString.of(t)),
      op('ET'),
    )
  })
  page.pushOperators(op('Q'))
  return doc.save()
}

/** a Korean source page drawn with the Korean face (for the Latin target) */
function buildKoreanSource(pdfium: PdfiumModule, font: Buffer): Uint8Array {
  return buildCjkLines(pdfium, font, [
    { text: KO.heading, x: 72, y: 720, size: 20 },
    { text: KO.sourceLine1, x: 72, y: 680, size: 12 },
    { text: KO.sourceLine2, x: 72, y: 665, size: 12 },
  ])
}

interface FixturePdfium extends PdfiumModule {
  _FPDF_CreateNewDocument(): number
  _FPDFPage_New(doc: number, index: number, width: number, height: number): number
  _FPDFText_LoadFont(doc: number, data: number, size: number, type: number, cid: number): number
  _FPDFPageObj_CreateTextObj(doc: number, font: number, size: number): number
  _FPDFText_SetText(obj: number, text: number): number
  _FPDFPageObj_Transform(
    o: number,
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void
  _FPDFPage_InsertObject(page: number, obj: number): void
  _FPDFPage_GenerateContent(page: number): number
  _PDFiumExt_OpenFileWriter(): number
  _PDFiumExt_SaveAsCopy(doc: number, writer: number): number
  _PDFiumExt_GetFileWriterSize(writer: number): number
  _PDFiumExt_GetFileWriterData(writer: number, buf: number, size: number): number
  _PDFiumExt_CloseFileWriter(writer: number): void
  _FPDF_GetSecurityHandlerRevision(doc: number): number
}

function buildCjkLines(
  pdfium: PdfiumModule,
  font: Buffer,
  lines: { text: string; x: number; y: number; size: number }[],
): Uint8Array {
  const m = pdfium as FixturePdfium
  const doc = m._FPDF_CreateNewDocument()
  try {
    const page = m._FPDFPage_New(doc, 0, 612, 792)
    const fp = m._malloc(font.length)
    m.HEAPU8.set(font, fp)
    const f = m._FPDFText_LoadFont(doc, fp, font.length, 2, 1)
    m._free(fp)
    for (const l of lines) {
      const obj = m._FPDFPageObj_CreateTextObj(doc, f, l.size)
      const bytes = Buffer.from(`${l.text}\0`, 'utf16le')
      const tp = m._malloc(bytes.length)
      m.HEAPU8.set(bytes, tp)
      m._FPDFText_SetText(obj, tp)
      m._free(tp)
      m._FPDFPageObj_Transform(obj, 1, 0, 0, 1, l.x, l.y)
      m._FPDFPage_InsertObject(page, obj)
    }
    m._FPDFPage_GenerateContent(page)
    m._FPDF_ClosePage(page)
    const writer = m._PDFiumExt_OpenFileWriter()
    m._PDFiumExt_SaveAsCopy(doc, writer)
    const size = m._PDFiumExt_GetFileWriterSize(writer)
    const buf = m._malloc(size)
    m._PDFiumExt_GetFileWriterData(writer, buf, size)
    const out = Uint8Array.from(m.HEAPU8.subarray(buf, buf + size))
    m._free(buf)
    m._PDFiumExt_CloseFileWriter(writer)
    return out
  } finally {
    m._FPDF_CloseDocument(doc)
  }
}

// ── an encrypted source (standard security handler, RC4 40-bit, empty user password) ──

function rc4(key: Buffer, data: Buffer): Buffer {
  const s = Array.from({ length: 256 }, (_, i) => i)
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + s[i]! + key[i % key.length]!) & 255
    ;[s[i], s[j]] = [s[j]!, s[i]!]
  }
  const out = Buffer.alloc(data.length)
  let a = 0
  j = 0
  for (let k = 0; k < data.length; k++) {
    a = (a + 1) & 255
    j = (j + s[a]!) & 255
    ;[s[a], s[j]] = [s[j]!, s[a]!]
    out[k] = data[k]! ^ s[(s[a]! + s[j]!) & 255]!
  }
  return out
}

function buildEncryptedPdf(): Uint8Array {
  const pad = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex')
  const md5 = (...parts: Buffer[]) => createHash('md5').update(Buffer.concat(parts)).digest()
  const padded = (pw: string) => Buffer.concat([Buffer.from(pw, 'latin1'), pad]).subarray(0, 32)
  const id = Buffer.from('0123456789abcdef0123456789abcdef', 'hex')
  const o = rc4(md5(padded('owner')).subarray(0, 5), padded(''))
  const p = Buffer.alloc(4)
  p.writeInt32LE(-4)
  const key = md5(padded(''), o, p, id).subarray(0, 5)
  const u = rc4(key, pad)
  const objKey = (n: number) =>
    md5(key, Buffer.from([n & 255, (n >> 8) & 255, n >> 16, 0, 0])).subarray(0, 10)
  const content = rc4(objKey(4), Buffer.from('BT /F1 12 Tf 72 700 Td (Locked source text) Tj ET'))
  const objs: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
      content,
      Buffer.from('\nendstream'),
    ]),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    Buffer.from(
      `<< /Filter /Standard /V 1 /R 2 /O <${o.toString('hex')}> /U <${u.toString('hex')}> /P -4 >>`,
    ),
  ]
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')]
  const offsets: number[] = []
  let at = chunks[0]!.length
  objs.forEach((body, i) => {
    const part = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')])
    offsets.push(at)
    chunks.push(part)
    at += part.length
  })
  const xref =
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((off) => `${String(off).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Encrypt 6 0 R /ID [<${id.toString('hex')}> <${id.toString('hex')}>] >>\n` +
    `startxref\n${at}\n%%EOF\n`
  chunks.push(Buffer.from(xref))
  return Uint8Array.from(Buffer.concat(chunks))
}

// ── reading results back ──

interface PageCensus {
  text: string
  images: number
  paths: number
  annots: number
  /** font size of every non-space char */
  sizes: number[]
  /** fill color of every text object */
  textColors: number[][]
}

function census(m: PdfiumModule, pdf: Uint8Array, pageIndex = 0): PageCensus {
  return withPdfDocument(m, pdf, (doc) => {
    const page = m._FPDF_LoadPage(doc, pageIndex)
    try {
      const counts = new Map<number, number>()
      const textColors: number[][] = []
      const walk = (obj: number) => {
        const type = m._FPDFPageObj_GetType(obj)
        counts.set(type, (counts.get(type) ?? 0) + 1)
        if (type === 1) {
          const p = m._malloc(16)
          m._FPDFPageObj_GetFillColor(obj, p, p + 4, p + 8, p + 12)
          textColors.push(Array.from(m.HEAPU32.subarray(p >> 2, (p >> 2) + 3)))
          m._free(p)
        }
        if (type === 5 && m._FPDFFormObj_CountObjects && m._FPDFFormObj_GetObject) {
          for (let i = 0; i < m._FPDFFormObj_CountObjects(obj); i++)
            walk(m._FPDFFormObj_GetObject(obj, i))
        }
      }
      for (let i = 0; i < m._FPDFPage_CountObjects(page); i++) walk(m._FPDFPage_GetObject(page, i))
      const tp = m._FPDFText_LoadPage(page)
      const n = m._FPDFText_CountChars(tp)
      const buf = m._malloc((n + 1) * 2)
      m._FPDFText_GetText(tp, 0, n, buf)
      const text = Buffer.from(m.HEAPU8.subarray(buf, buf + n * 2)).toString('utf16le')
      m._free(buf)
      const sizes: number[] = []
      for (let i = 0; i < n; i++) {
        if (m._FPDFText_GetUnicode(tp, i) > 0x20) sizes.push(m._FPDFText_GetFontSize(tp, i))
      }
      m._FPDFText_ClosePage(tp)
      return {
        text,
        images: counts.get(3) ?? 0,
        paths: counts.get(2) ?? 0,
        annots: m._FPDFPage_GetAnnotCount?.(page) ?? 0,
        sizes,
        textColors,
      }
    } finally {
      m._FPDF_ClosePage(page)
    }
  })
}

const flat = (s: string) => s.replace(/\s+/g, ' ')
const squash = (s: string) => s.replace(/\s+/g, '')

// ── tree helpers ──

const textBlocks = (tree: DocumentTree): (TreeBlock & { runs: InlineRun[] })[] =>
  tree.blocks.filter(
    (b): b is TreeBlock & { runs: InlineRun[] } =>
      b.kind === 'heading' || b.kind === 'paragraph' || b.kind === 'listItem',
  )

/** translate the blocks whose source text includes a key of `map` */
function translate(tree: DocumentTree, lang: string, map: Record<string, string>): DocumentTree {
  const tr = new Map<string, InlineRun[]>()
  for (const b of textBlocks(tree)) {
    const source = flat(runsText(b.runs))
    const hit = Object.keys(map).find((k) => source.includes(k))
    if (hit) tr.set(b.id, [{ kind: 'text', text: map[hit]! }])
  }
  expect(tr.size).toBe(Object.keys(map).length)
  return deriveTranslatedTree(tree, lang, tr)
}

async function run(
  pdf: Uint8Array,
  tree: DocumentTree,
  translated: DocumentTree,
  extra: Partial<WritebackOptions> = {},
) {
  const before = Uint8Array.from(pdf)
  const result = await writeTranslatedPdf(pdf, {
    pdfium: await loadPdfium(),
    hbSubsetWasm: hbWasm,
    tree,
    translated,
    ...extra,
  })
  // the source bytes are never touched
  expect(Buffer.from(pdf).equals(Buffer.from(before))).toBe(true)
  return result
}

// ── tests ──

describe('writing a translation into the PDF', () => {
  it('replaces translated blocks (Korean target) and keeps links, images and shapes', async () => {
    const m = await loadPdfium()
    const pdf = await buildSource()
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const translated = translate(tree, 'ko', {
      'Annual Report': KO.heading,
      'quick brown fox': KO.body,
    })
    const { pdf: out, report } = await run(pdf, tree, translated, { fontLocator: koreanLocator })

    const src = census(m, pdf)
    const res = census(m, out)
    expect(flat(src.text)).toContain('quick brown fox')
    // source strings of translated blocks are gone, the translations are there
    expect(res.text).not.toContain('Annual Report')
    expect(flat(res.text)).not.toContain('quick brown')
    expect(res.text).not.toContain('wooden fence')
    expect(squash(res.text)).toContain(squash(KO.heading))
    expect(squash(res.text)).toContain(squash(KO.body))
    // the untranslated block keeps its text
    expect(flat(res.text)).toContain('closing paragraph keeps its source')
    // nothing but text changed
    expect(res.annots).toBe(src.annots)
    expect(res.annots).toBe(1)
    expect(res.images).toBe(src.images)
    expect(res.images).toBe(1)
    expect(res.paths).toBe(src.paths)
    expect(res.paths).toBeGreaterThanOrEqual(2)

    expect(report.lang).toBe('ko')
    expect(report.total).toBe(3)
    expect(report.translated).toBe(2)
    expect(report.overflowed).toEqual([])
    expect(report.originalPages).toEqual([])
    expect(report.untranslated).toEqual([
      expect.objectContaining({ page: 1, reason: 'not-translated' }),
    ])
  })

  it('writes with an injected Korean test face when one is handed in', async () => {
    const m = await loadPdfium()
    const pdf = await buildSource()
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const translated = translate(tree, 'ko', { 'quick brown fox': KO.body })
    const face = syntheticFont(KO.body)
    const { pdf: out, report } = await run(pdf, tree, translated, { fontLocator: () => face })
    expect(report.translated).toBe(1)
    expect(squash(census(m, out).text)).toContain(squash(KO.body))
  })

  it('writes a Latin translation of a Korean source', async () => {
    const m = await loadPdfium()
    const koFont = Buffer.from(koreanLocator(Object.values(KO).join(''), 'ko')!)
    const pdf = buildKoreanSource(m, koFont)
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const translated = translate(tree, 'en', {
      [KO.heading]: 'Annual Report',
      '이 문단은': 'This paragraph holds',
      '한국어 원문': 'the Korean source text.',
    })
    const { pdf: out, report } = await run(pdf, tree, translated, { fontLocator: latinLocator })
    const res = census(m, out)
    expect(squash(res.text)).not.toContain(squash(KO.heading))
    expect(res.text).not.toContain('한국어')
    expect(flat(res.text)).toContain('Annual Report')
    expect(flat(res.text)).toContain('This paragraph holds')
    expect(flat(res.text)).toContain('the Korean source text.')
    expect(report.translated).toBe(3)
    expect(report.untranslated).toEqual([])
  })

  it('shrinks a long translation, and keeps the source text when even the floor size has no room', async () => {
    const m = await loadPdfium()
    const pdf = await buildSource()
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })

    // a little longer: fits after shrinking, no overflow
    const roomy = translate(tree, 'en', {
      'quick brown fox': `${PARA.join(' ')} It also crosses the meadow.`,
    })
    const fit = await run(pdf, tree, roomy, { fontLocator: latinLocator })
    expect(fit.report.overflowed).toEqual([])
    const fitSizes = census(m, fit.pdf).sizes
    expect(Math.min(...fitSizes)).toBeLessThan(12 - 0.01)
    expect(Math.min(...fitSizes)).toBeGreaterThanOrEqual(12 * MIN_FONT_SCALE - 0.01)

    // far longer: no room even at the floor size, so the source text stays (decision 0057)
    const long = translate(tree, 'ko', { 'quick brown fox': KO.long })
    const over = await run(pdf, tree, long, { fontLocator: koreanLocator })
    expect(over.report.translated).toBe(0)
    expect(over.report.overflowed).toEqual([expect.objectContaining({ page: 1 })])
    const res = census(m, over.pdf)
    expect(squash(res.text)).not.toContain(squash(KO.long).slice(0, 20))
    expect(flat(res.text)).toContain('quick brown fox')
    expect(flat(res.text)).toContain('wooden fence')
  })

  it('sizes paragraphs of one kind alike', async () => {
    const m = await loadPdfium()
    const pdf = await buildPdf([
      [
        ...para(PARA, 72, 700, { size: 12, leading: 15 }),
        ...para(KEEP, 72, 600, { size: 12, leading: 15 }),
      ],
    ])
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const translated = translate(tree, 'en', {
      // longer than its source: shrinks
      'quick brown fox': `${PARA.join(' ')} Then it runs across the meadow and the hill.`,
      // as long as its source: would fit at the source size
      'closing paragraph': KEEP.join(' '),
    })
    const { pdf: out, report } = await run(pdf, tree, translated, { fontLocator: latinLocator })
    expect(report.translated).toBe(2)
    expect(report.overflowed).toEqual([])
    const sizes = [...new Set(census(m, out).sizes.map((s) => s.toFixed(2)))]
    expect(sizes).toHaveLength(1)
    expect(Number(sizes[0])).toBeLessThan(12 - 0.01)
  })

  it('grows a block into the free space below it', async () => {
    const m = await loadPdfium()
    const line = 'A single line caption sits alone here.'
    const pdf = await buildPdf([
      [...para([line], 72, 700, { size: 12 }), ...para(KEEP, 72, 300, { size: 12, leading: 15 })],
    ])
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const translated = translate(tree, 'en', {
      'single line caption': `${line} It now needs a second and a third line to say it all, at least.`,
    })
    const { pdf: out, report } = await run(pdf, tree, translated, { fontLocator: latinLocator })
    expect(report.translated).toBe(1)
    expect(report.overflowed).toEqual([])
    const res = census(m, out)
    expect(flat(res.text)).toContain('second and a third line')
    // grown rather than shrunk to the floor
    expect(Math.min(...res.sizes)).toBeGreaterThan(12 * 0.85)
    // the paragraph below is untouched
    expect(flat(res.text)).toContain('closing paragraph keeps its source')
  })

  it.each([
    ['a plain 12 Tf', 12, 1, 1],
    ['1 Tf under a 12× text matrix', 1, 12, 1],
    ['16 Tf under a 0.75 text matrix (browser print)', 16, 0.75, 1],
    ['6 Tf inside a 2× graphics matrix', 6, 1, 2],
  ])('reads the source size through the matrices: %s', async (_, tf, scale, ctm) => {
    const m = await loadPdfium()
    const pdf = await buildScaledSource(tf, scale, ctm)
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const translated = translate(tree, 'en', { 'quick brown fox': 'A short translation.' })
    const { pdf: out, report } = await run(pdf, tree, translated, { fontLocator: latinLocator })
    expect(report.translated).toBe(1)
    const res = census(m, out)
    expect(flat(res.text)).toContain('A short translation.')
    expect(res.text).not.toContain('quick brown')
    // written at the size the reader sees, not the nominal Tf
    for (const s of res.sizes) expect(s).toBeCloseTo(12, 1)
  })

  it('takes a line-end hyphen drawn as its own object away with its paragraph', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const page = doc.addPage([612, 792])
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const lines = [
      'The share of the aggre',
      'gate income held by the top',
      'fifth fell in the year.',
    ]
    lines.forEach((t, i) => page.drawText(t, { x: 72, y: 700 - i * 14, size: 12, font }))
    page.drawText('-', { x: 72 + font.widthOfTextAtSize(lines[0]!, 12), y: 700, size: 12, font })
    const pdf = await doc.save()
    const m = await loadPdfium()
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const translated = translate(tree, 'en', { 'share of the': 'A short translation.' })
    const { pdf: out, report } = await run(pdf, tree, translated, { fontLocator: latinLocator })
    expect(report.translated).toBe(1)
    const res = census(m, out)
    expect(flat(res.text)).toContain('A short translation.')
    // PDFium reports a recognized line-end hyphen as code 2
    expect(res.text).not.toContain('-')
    expect(res.text).not.toContain(String.fromCharCode(2))
  })

  it('keeps a block in its source text when no installed font draws the translation', async () => {
    const m = await loadPdfium()
    const pdf = await buildSource()
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const translated = translate(tree, 'ko', {
      'Annual Report': KO.heading,
      'quick brown fox': KO.body,
    })
    const { pdf: out, report } = await run(pdf, tree, translated, { fontLocator: () => null })
    const res = census(m, out)
    expect(res.text).toContain('Annual Report')
    expect(flat(res.text)).toContain('quick brown fox')
    expect(squash(res.text)).not.toContain(squash(KO.heading))
    expect(report.translated).toBe(0)
    expect(report.untranslated.filter((u) => u.reason === 'font-missing')).toHaveLength(2)
  })

  it('refuses an encrypted PDF', async () => {
    const m = await loadPdfium()
    const pdf = buildEncryptedPdf()
    // it opens without a password, so it really is the encryption that refuses
    expect(
      withPdfDocument(m, pdf, (doc) => (m as FixturePdfium)._FPDF_GetSecurityHandlerRevision(doc)),
    ).toBe(2)
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const translated = deriveTranslatedTree(tree, 'ko', new Map())
    const before = Uint8Array.from(pdf)
    await expect(
      writeTranslatedPdf(pdf, { pdfium: m, hbSubsetWasm: hbWasm, tree, translated }),
    ).rejects.toBeInstanceOf(WritebackEncryptedError)
    expect(Buffer.from(pdf).equals(Buffer.from(before))).toBe(true)
  })

  it('stops when aborted and reports progress per page', async () => {
    const m = await loadPdfium()
    const pdf = await buildSource()
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const translated = translate(tree, 'en', { 'quick brown fox': 'A short line.' })
    const calls: number[][] = []
    await run(pdf, tree, translated, {
      fontLocator: latinLocator,
      onProgress: (done, total, page) => calls.push([done, total, page]),
    })
    expect(calls).toEqual([[1, 1, 1]])
    const ac = new AbortController()
    ac.abort()
    await expect(
      run(pdf, tree, translated, { fontLocator: latinLocator, signal: ac.signal }),
    ).rejects.toThrow()
  })
})

describe('tables, page joins and rotated pages', () => {
  it('writes translated table cells into their cells and leaves the others', async () => {
    const m = await loadPdfium()
    const pdf = await buildTablePdf()
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const table = tree.blocks.find((b) => b.kind === 'table')
    expect(table?.kind).toBe('table')
    if (table?.kind !== 'table') return
    const want: Record<string, string> = {
      Name: KO.cellName,
      Price: KO.cellPrice,
      'wide merged cell': KO.cellWide,
    }
    const tr = new Map<string, InlineRun[]>()
    for (const c of table.table.cells) {
      const source = flat(runsText(c.paragraphs[0] ?? [])).trim()
      if (want[source])
        tr.set(`${table.id}#${c.row}.${c.col}.0`, [{ kind: 'text', text: want[source] }])
    }
    expect(tr.size).toBe(3)
    const { pdf: out, report } = await run(pdf, tree, deriveTranslatedTree(tree, 'ko', tr), {
      fontLocator: koreanLocator,
    })
    const src = census(m, pdf)
    const res = census(m, out)
    for (const gone of ['Name', 'Price', 'wide merged']) expect(res.text).not.toContain(gone)
    for (const kept of ['Qty', 'Total', 'Before the table.']) expect(res.text).toContain(kept)
    for (const added of Object.values(want)) expect(squash(res.text)).toContain(squash(added))
    expect(res.paths).toBe(src.paths)
    expect(report.translated).toBe(3)
    expect(report.overflowed).toEqual([])
  })

  it('gives a cell translation the height of its cell before shrinking it', async () => {
    const m = await loadPdfium()
    const pdf = await buildTablePdf()
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const table = tree.blocks.find((b) => b.kind === 'table')
    if (table?.kind !== 'table') throw new Error('no table')
    const name = table.table.cells.find((c) => flat(runsText(c.paragraphs[0]!)) === 'Name')!
    // two lines in the 128pt cell: room only from the cell top, not the source line
    const long = 'A considerably longer label for the name'
    const tr = new Map<string, InlineRun[]>([
      [`${table.id}#${name.row}.${name.col}.0`, [{ kind: 'text', text: long }]],
    ])
    const { pdf: out, report } = await run(pdf, tree, deriveTranslatedTree(tree, 'en', tr), {
      fontLocator: latinLocator,
    })
    expect(report.translated).toBe(1)
    expect(report.overflowed).toEqual([])
    const res = census(m, out)
    expect(flat(res.text)).toContain('considerably longer')
    expect(res.text).not.toContain('Name')
    // the cell's own size: the whole cell had room
    const written = res.sizes.slice(-[...long.replace(/\s/g, '')].length)
    for (const s of written) expect(s).toBeCloseTo(11, 1)
  })

  it('keeps cells whose source text is one string across both of them', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const page = doc.addPage([612, 792])
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const line = (x1: number, y1: number, x2: number, y2: number) =>
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1 })
    for (const y of [700, 660, 620]) line(72, y, 456, y)
    for (const x of [72, 200, 328, 456]) line(x, 620, x, 700)
    page.drawText('Name', { x: 80, y: 674, size: 11, font })
    // one text object running over the rule at x = 328
    page.drawText('Quantity and the unit price per item', { x: 208, y: 674, size: 11, font })
    page.drawText('Total', { x: 80, y: 634, size: 11, font })
    page.drawText('Sum', { x: 208, y: 634, size: 11, font })
    page.drawText('Rest', { x: 336, y: 634, size: 11, font })
    const pdf = await doc.save()
    const m = await loadPdfium()
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const table = tree.blocks.find((b) => b.kind === 'table')
    if (table?.kind !== 'table') throw new Error('no table')
    const tr = new Map<string, InlineRun[]>()
    for (const c of table.table.cells) {
      const source = flat(runsText(c.paragraphs[0] ?? [])).trim()
      if (source) tr.set(`${table.id}#${c.row}.${c.col}.0`, [{ kind: 'text', text: `[${source}]` }])
    }
    const { pdf: out, report } = await run(pdf, tree, deriveTranslatedTree(tree, 'en', tr), {
      fontLocator: latinLocator,
    })
    const res = census(m, out)
    // the straddling string stays whole; its cells are reported, not half-written
    expect(flat(res.text)).toContain('Quantity and the unit price per item')
    expect(flat(res.text)).not.toContain('[Quantity')
    expect(report.untranslated.some((u) => u.reason === 'shared-text-object')).toBe(true)
    // the other cells are written
    for (const done of ['[Name]', '[Total]', '[Sum]', '[Rest]'])
      expect(flat(res.text)).toContain(done)
  })

  it('flows a paragraph joined across a page break over both of its boxes', async () => {
    const m = await loadPdfium()
    const pdf = await buildPdf([
      [
        ...para(wordLines(0, 20), 72, 740),
        ...para(
          [...wordLines(3, 24), 'alpha bravo delta gamma omega sigma tango lemon infor-'],
          72,
          460,
        ),
      ],
      [
        ...para(['mation river stone cloud grass light night alpha bravo', 'ends here.'], 72, 740),
        ...para(wordLines(5, 3), 72, 600),
      ],
    ])
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const joined = textBlocks(tree).find((b) => runsText(b.runs).includes('lemon information'))!
    expect(joined.regions?.map((r) => r.page)).toEqual([1, 2])
    const text = runsText(joined.runs).toUpperCase()
    const translated = deriveTranslatedTree(
      tree,
      'en',
      new Map([[joined.id, [{ kind: 'text', text }]]]),
    )
    const { pdf: out, report } = await run(pdf, tree, translated, { fontLocator: latinLocator })
    const one = census(m, out, 0)
    const two = census(m, out, 1)
    expect(one.text).not.toContain('lemon infor')
    expect(two.text).not.toContain('mation river')
    expect(two.text).not.toContain('ends here')
    expect(one.text).toMatch(/[A-Z]{5} [A-Z]{5}/)
    expect(two.text).toMatch(/[A-Z]{5}/)
    // the first page's other paragraph and the second page's tail are untouched
    expect(one.text).toContain(wordLines(0, 1)[0]!)
    expect(two.text).toContain(wordLines(5, 1)[0]!)
    expect(report.translated).toBe(1)
  })

  it('draws upright text on a /Rotate page', async () => {
    const { PDFDocument, StandardFonts, degrees } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const page = doc.addPage([612, 792])
    page.setRotation(degrees(90))
    const font = await doc.embedFont(StandardFonts.Helvetica)
    // user-space text turned +90° reads upright once the page turns 90°
    page.drawText('Rotated page heading text', {
      x: 112,
      y: 72,
      size: 16,
      font,
      rotate: degrees(90),
    })
    page.drawText('A second line stays put.', {
      x: 200,
      y: 72,
      size: 12,
      font,
      rotate: degrees(90),
    })
    const pdf = await doc.save()
    const m = await loadPdfium()
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const translated = translate(tree, 'en', { 'Rotated page heading': 'Turned heading' })
    const { pdf: out, report } = await run(pdf, tree, translated, { fontLocator: latinLocator })
    expect(report.originalPages).toEqual([])
    const res = census(m, out)
    expect(res.text).not.toContain('Rotated page')
    expect(res.text).toContain('Turned heading')
    expect(res.text).toContain('A second line stays put.')
    // the new text runs along user-space +y like the source did
    withPdfDocument(m, out, (d) => {
      const pg = m._FPDF_LoadPage(d, 0)
      const tp = m._FPDFText_LoadPage(pg)
      const xy = m._malloc(16)
      const origins: number[][] = []
      for (let i = 0; i < m._FPDFText_CountChars(tp); i++) {
        if (m._FPDFText_GetUnicode(tp, i) === 0x54 /* T */) {
          m._FPDFText_GetCharOrigin(tp, i, xy, xy + 8)
          origins.push([m.HEAPF64[xy >> 3]!, m.HEAPF64[(xy >> 3) + 1]!])
        }
      }
      m._free(xy)
      m._FPDFText_ClosePage(tp)
      m._FPDF_ClosePage(pg)
      const [x, y] = origins[0]!
      expect(x).toBeGreaterThan(95)
      expect(x).toBeLessThan(125)
      expect(y).toBeGreaterThan(60)
      expect(y).toBeLessThan(90)
    })
  })
})

/** sheet size, and the x of the first char of `needle` on the first sheet */
function sheetOf(m: PdfiumModule, pdf: Uint8Array, needles: string[]) {
  return withPdfDocument(m, pdf, (d) => {
    const pg = m._FPDF_LoadPage(d, 0)
    const tp = m._FPDFText_LoadPage(pg)
    const n = m._FPDFText_CountChars(tp)
    let text = ''
    for (let i = 0; i < n; i++) text += String.fromCodePoint(m._FPDFText_GetUnicode(tp, i))
    const box = m._malloc(32)
    const xOf = (needle: string): number => {
      const at = text.indexOf(needle)
      if (at < 0) return NaN
      m._FPDFText_GetCharBox(tp, at, box, box + 8, box + 16, box + 24)
      return m.HEAPF64[box >> 3]!
    }
    const xs = needles.map(xOf)
    m._free(box)
    m._FPDFText_ClosePage(tp)
    const size = { width: m._FPDF_GetPageWidthF(pg), height: m._FPDF_GetPageHeightF(pg) }
    m._FPDF_ClosePage(pg)
    return { pages: m._FPDF_GetPageCount(d), size, xs }
  })
}

describe('bilingual PDF', () => {
  it('puts each source page beside its translated page', async () => {
    const m = await loadPdfium()
    const pdf = await buildSource()
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const translated = translate(tree, 'en', { 'quick brown fox': 'A short translation.' })
    const { pdf: out, report } = await run(pdf, tree, translated, {
      fontLocator: latinLocator,
      bilingual: true,
    })
    expect(report.translated).toBe(1)
    const sheet = sheetOf(m, out, ['quick brown fox', 'A short translation.'])
    expect(sheet.pages).toBe(1)
    expect(sheet.size).toEqual({ width: 1224, height: 792 })
    // the source on the left half, the translation on the right
    expect(sheet.xs[0]).toBeLessThan(612)
    expect(sheet.xs[1]).toBeGreaterThan(612)
  })

  it('shows a turned page as a reader sees it', async () => {
    const { PDFDocument, StandardFonts, degrees } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const page = doc.addPage([612, 792])
    page.setRotation(degrees(90))
    const font = await doc.embedFont(StandardFonts.Helvetica)
    page.drawText('Rotated page heading text', {
      x: 112,
      y: 72,
      size: 16,
      font,
      rotate: degrees(90),
    })
    const pdf = await doc.save()
    const m = await loadPdfium()
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const translated = translate(tree, 'en', { 'Rotated page heading': 'Turned heading' })
    const { pdf: out } = await run(pdf, tree, translated, {
      fontLocator: latinLocator,
      bilingual: true,
    })
    const sheet = sheetOf(m, out, ['Rotated page', 'Turned heading'])
    // two landscape pages side by side
    expect(sheet.size).toEqual({ width: 1584, height: 612 })
    expect(sheet.xs[0]).toBeLessThan(792)
    expect(sheet.xs[1]).toBeGreaterThan(792)
  })
})

describe('pages the writer cannot edit', () => {
  async function turnedPdf(turned: string, x: number, y: number, size: number) {
    const { PDFDocument, StandardFonts, degrees } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const page = doc.addPage([612, 792])
    const font = await doc.embedFont(StandardFonts.Helvetica)
    page.drawText('Upright heading of the page', { x: 72, y: 720, size: 16, font })
    page.drawText(turned, { x, y, size, font, rotate: degrees(90) })
    return doc.save()
  }

  /** every text block with letters translated */
  const translateEvery = (tree: DocumentTree) =>
    deriveTranslatedTree(
      tree,
      'en',
      new Map<string, InlineRun[]>(
        textBlocks(tree)
          .filter((b) => /\p{L}/u.test(runsText(b.runs)))
          .map((b) => [b.id, [{ kind: 'text', text: 'Translated' }]]),
      ),
    )

  it('keeps a vertical-text page as it is', async () => {
    const m = await loadPdfium()
    const pdf = await turnedPdf('Sideways note', 540, 200, 12)
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const { pdf: out, report } = await run(pdf, tree, translateEvery(tree))
    expect(report.originalPages).toEqual([{ page: 1, reason: 'vertical-text' }])
    expect(census(m, out).text).toContain('Upright heading of the page')
  })

  it('keeps a block of turned text as it is and writes the rest of the page', async () => {
    const m = await loadPdfium()
    // a turned fragment the extraction keeps as blocks of its own (an arXiv margin stamp)
    const pdf = await turnedPdf('xy', 180, 600, 6)
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    expect(tree.pages[0]!.status).toBe('text')
    const { pdf: out, report } = await run(pdf, tree, translateEvery(tree), {
      fontLocator: latinLocator,
    })
    expect(report.originalPages).toEqual([])
    expect(report.translated).toBeGreaterThanOrEqual(1)
    expect(report.untranslated.length).toBeGreaterThanOrEqual(1)
    expect(report.untranslated.every((u) => u.reason === 'vertical-text')).toBe(true)
    const res = census(m, out)
    expect(res.text).not.toContain('Upright heading of the page')
    expect(res.text).toContain('Translated')
    expect(res.text).toContain('xy')
  })
})

describe('scanned and AI-read pages', () => {
  const LINES = [
    { text: 'Scanned Heading Text Here', box: { x0: 0.12, y0: 0.86, x1: 0.6, y1: 0.89 } },
    { text: 'This scanned paragraph has', box: { x0: 0.12, y0: 0.79, x1: 0.62, y1: 0.81 } },
    { text: 'several plain words in it', box: { x0: 0.12, y0: 0.765, x1: 0.6, y1: 0.785 } },
  ]
  const fakeOcr: OcrEngine = () => ({
    lines: LINES.map((l) => ({ ...l, confidence: 0.95 })),
  })

  async function ocrTree() {
    const m = await loadPdfium()
    const pdf = await buildScannedPdf()
    const { tree } = await extractDocumentTree(pdf, { pdfium: m, ocr: fakeOcr })
    expect(tree.pages[0]!.status).toBe('ocr')
    return { m, pdf, tree }
  }

  const translateAll = (tree: DocumentTree) => {
    const tr = new Map<string, InlineRun[]>()
    textBlocks(tree).forEach((b, i) =>
      tr.set(b.id, [{ kind: 'text', text: i === 0 ? KO.scanHead : KO.scanBody }]),
    )
    expect(tr.size).toBeGreaterThan(0)
    return deriveTranslatedTree(tree, 'ko', tr)
  }

  /** the same page as an AI read it: no measured places */
  const asAiRead = (tree: DocumentTree): DocumentTree => ({
    ...tree,
    pages: tree.pages.map((p) => ({ ...p, status: 'ai' })),
    blocks: tree.blocks.map((b) => {
      const { regions: _regions, ...rest } = b
      return { ...rest, source: 'ai' } as TreeBlock
    }),
  })

  it('paints over the OCR lines and draws the translation on a scanned page', async () => {
    const { m, pdf, tree } = await ocrTree()
    const translated = translateAll(tree)
    const { pdf: out, report } = await run(pdf, tree, translated, {
      ocr: fakeOcr,
      fontLocator: koreanLocator,
    })
    const src = census(m, pdf)
    const res = census(m, out)
    expect(squash(res.text)).toContain(squash(KO.scanBody))
    expect(res.images).toBe(src.images)
    // one painted box per OCR line, nothing else added
    expect(res.paths).toBe(src.paths + LINES.length)
    // the text stands out from the (solid red) scan it is drawn on
    expect(res.textColors.length).toBeGreaterThan(0)
    const lum = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!
    expect(res.textColors.every((c) => Math.abs(lum(c) - lum([220, 30, 30])) >= 80)).toBe(true)
    expect(report.originalPages).toEqual([])
    expect(report.translated).toBe(report.total)
  })

  it('places AI-read blocks on the OCR lines that match them', async () => {
    const { m, pdf, tree } = await ocrTree()
    const ai = asAiRead(tree)
    const { pdf: out, report } = await run(pdf, ai, translateAll(ai), {
      ocr: fakeOcr,
      fontLocator: koreanLocator,
    })
    const res = census(m, out)
    expect(squash(res.text)).toContain(squash(KO.scanBody))
    expect(res.paths).toBe(LINES.length)
    expect(report.untranslated).toEqual([])
  })

  it('keeps a scanned page as it is without OCR line boxes', async () => {
    const { m, pdf, tree } = await ocrTree()
    const translated = translateAll(tree)
    const { pdf: out, report } = await run(pdf, tree, translated, { fontLocator: koreanLocator })
    const res = census(m, out)
    expect(res.text).toBe('')
    expect(res.paths).toBe(0)
    expect(report.originalPages).toEqual([{ page: 1, reason: 'ocr-unavailable' }])
    expect(report.translated).toBe(0)
    expect(report.untranslated.every((u) => u.reason === 'page-kept')).toBe(true)
    // an engine that finds nothing counts as no OCR too
    const blind = await run(pdf, tree, translated, {
      ocr: () => null,
      fontLocator: koreanLocator,
    })
    expect(blind.report.originalPages).toEqual([{ page: 1, reason: 'ocr-unavailable' }])
  })

  it('lists a scanned page with nothing read from it', async () => {
    const m = await loadPdfium()
    const pdf = await buildScannedPdf()
    const { tree } = await extractDocumentTree(pdf, { pdfium: m })
    const { report } = await run(pdf, tree, deriveTranslatedTree(tree, 'ko', new Map()))
    expect(report.originalPages).toEqual([{ page: 1, reason: 'scanned-no-text' }])
    expect(report.total).toBe(0)
  })
})
