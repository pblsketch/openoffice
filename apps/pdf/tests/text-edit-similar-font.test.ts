import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { PDFDocument, PDFName } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { fontCoversText } from '../src/main/font-cmap'
import { findSystemFont } from '../src/main/font-locate'
import { subsetTtf } from '../src/main/font-subset'
import { applyTextEdits, loadPdfium, saveDoc } from '../src/main/text-edit'
import { LOOKALIKE_FAMILIES, type FontStyleClass } from '../src/shared/font-classes'

/**
 * One run of "Hello" set in a NON-embedded simple TrueType face whose BaseFont is
 * written in CP949, the way Korean producers name faces. The names are
 * fictitious, so no PC has them: the edit must reach the look-alike step.
 */
async function koreanNamedFixture(cp949Name: number[], flags: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  const ctx = doc.context
  const name = PDFName.of(String.fromCharCode(...cp949Name))
  const desc = ctx.obj({
    Type: 'FontDescriptor',
    FontName: name,
    Flags: flags,
    FontBBox: [0, -200, 1000, 900],
    ItalicAngle: 0,
    Ascent: 880,
    Descent: -120,
    CapHeight: 700,
    StemV: 80,
  })
  const font = ctx.obj({
    Type: 'Font',
    Subtype: 'TrueType',
    BaseFont: name,
    FirstChar: 32,
    LastChar: 126,
    Widths: Array.from({ length: 95 }, (_, i) => 450 + (i % 7) * 20),
    Encoding: 'WinAnsiEncoding',
    FontDescriptor: ctx.register(desc),
  })
  page.node.setFontDictionary(PDFName.of('F1'), ctx.register(font))
  page.node.set(
    PDFName.of('Contents'),
    ctx.register(ctx.stream('BT /F1 14 Tf 50 700 Td (Hello) Tj ET')),
  )
  return doc.save({ useObjectStreams: false })
}

/** CP949 bytes of 가상명조 / 가상고딕 (fictitious faces) */
const MYEONGJO = [0xb0, 0xa1, 0xbb, 0xf3, 0xb8, 0xed, 0xc1, 0xb6]
const GOTHIC = [0xb0, 0xa1, 0xbb, 0xf3, 0xb0, 0xed, 0xb5, 0xf1]
const NONSYMBOLIC = 1 << 5

/** PostScript name of the first installed Korean look-alike of a style that can draw `text` */
function expectedFace(style: FontStyleClass, text: string): string | null {
  for (const family of LOOKALIKE_FAMILIES.ko[style]) {
    const bytes = findSystemFont('', family)
    if (bytes && fontCoversText(bytes, text)) return psNameOf(bytes)
  }
  return null
}

/** nameID 6 of a standalone sfnt (Windows platform, UTF-16BE) */
function psNameOf(font: Buffer): string | null {
  const numTables = font.readUInt16BE(4)
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    if (font.toString('latin1', rec, rec + 4) !== 'name') continue
    const off = font.readUInt32BE(rec + 8)
    const count = font.readUInt16BE(off + 2)
    const strings = off + font.readUInt16BE(off + 4)
    for (let r = 0; r < count; r++) {
      const p = off + 6 + r * 12
      if (font.readUInt16BE(p) !== 3 || font.readUInt16BE(p + 6) !== 6) continue
      const len = font.readUInt16BE(p + 8)
      const start = strings + font.readUInt16BE(p + 10)
      return Buffer.from(font.subarray(start, start + len))
        .swap16()
        .toString('utf16le')
    }
  }
  return null
}

/** The embedded face's BaseFont (PDFium writes it without a subset tag) */
const baseFont = (ps: string) => new RegExp(`/BaseFont/(?:[A-Z]{6}\\+)?${ps}[/\\s>]`)

const edit = (newText: string) => ({
  pageIndex: 0,
  rect: [45, 694, 100, 718] as [number, number, number, number],
  oldText: 'Hello',
  newText,
  fontSize: 14,
})

describe('text edit on a missing document face', () => {
  it.each([
    ['serif', MYEONGJO],
    ['sans', GOTHIC],
  ] as const)('embeds an installed Korean %s look-alike', async (style, name) => {
    const text = '안녕하세요'
    const want = expectedFace(style, text)
    if (!want) return // no Korean face of this style on this machine
    const result = await applyTextEdits(await koreanNamedFixture(name, NONSYMBOLIC), [edit(text)])
    expect(result.skipped).toEqual([])
    const raw = Buffer.from(result.bytes).toString('latin1')
    expect(raw).toMatch(baseFont(want))
    // the other style's first pick must not be what got embedded
    const other = expectedFace(style === 'serif' ? 'sans' : 'serif', text)
    if (other && other !== want) expect(raw).not.toMatch(baseFont(other))
  })

  it('reads the style from the descriptor flags when the name says nothing', async () => {
    const text = '안녕'
    const want = expectedFace('serif', text)
    if (!want) return
    // "가상" alone: Korean, but no style word — the Serif flag decides
    const fixture = await koreanNamedFixture([0xb0, 0xa1, 0xbb, 0xf3], NONSYMBOLIC | (1 << 1))
    const result = await applyTextEdits(fixture, [edit(text)])
    expect(result.skipped).toEqual([])
    expect(Buffer.from(result.bytes).toString('latin1')).toMatch(baseFont(want))
  })
})

/** Gowun Batang ships with the repo (design templates) and is not a system face */
const GOWUN = readFileSync(
  join(__dirname, '..', '..', '..', 'packages', 'ui', 'template-fonts', 'GowunBatang-Regular.ttf'),
)

/** One run set in a Gowun Batang subset holding only the run's own chars, the way
    an exporter embeds it; authored with PDFium (pdf-lib cannot embed without fontkit) */
async function subsetFixture(text: string): Promise<Uint8Array> {
  const sub = await subsetTtf(GOWUN, text)
  const m = (await loadPdfium()) as Awaited<ReturnType<typeof loadPdfium>> & {
    _FPDF_CreateNewDocument(): number
    _FPDFPage_New(doc: number, index: number, w: number, h: number): number
  }
  const doc = m._FPDF_CreateNewDocument()
  const page = m._FPDFPage_New(doc, 0, 595, 842)
  const fp = m._malloc(sub.length)
  m.HEAPU8.set(sub, fp)
  const font = m._FPDFText_LoadFont(doc, fp, sub.length, 2, 1)
  m._free(fp)
  const obj = m._FPDFPageObj_CreateTextObj(doc, font, 20)
  const t16 = Buffer.from(`${text}\0`, 'utf16le')
  const tp = m._malloc(t16.length)
  m.HEAPU8.set(t16, tp)
  expect(m._FPDFText_SetText(obj, tp)).toBeTruthy()
  m._free(tp)
  m._FPDFPageObj_Transform(obj, 1, 0, 0, 1, 60, 700)
  m._FPDFPage_InsertObject(page, obj)
  expect(m._FPDFPage_GenerateContent(page)).toBeTruthy()
  const bytes = saveDoc(m, doc)
  m._FPDF_ClosePage(page)
  m._FPDF_CloseDocument(doc)
  return bytes
}

/** Page text via pdf.js (a second engine reads what PDFium wrote) */
async function extractText(bytes: Uint8Array): Promise<string> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise
  try {
    const content = await (await doc.getPage(1)).getTextContent()
    return content.items.map((i) => ('str' in i ? i.str : '')).join('')
  } finally {
    await doc.loadingTask.destroy()
  }
}

/** Decoded content streams that draw text */
function textStreams(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes)
  const latin = raw.toString('latin1')
  let out = ''
  for (const m of latin.matchAll(/(?<!end)stream\r?\n/g)) {
    const start = m.index! + m[0].length
    const chunk = raw.subarray(start, latin.indexOf('endstream', start))
    try {
      const body = inflateSync(chunk).toString('latin1')
      if (/T[jJ]/.test(body)) out += body
    } catch {
      /* not deflated: no text here */
    }
  }
  return out
}

/** BaseFont names in the file */
const baseFonts = (bytes: Uint8Array): string[] => [
  ...new Set(
    [
      ...Buffer.from(bytes)
        .toString('latin1')
        .matchAll(/\/BaseFont\/([^\s/<>[\]]+)/g),
    ].map((m) => m[1]!),
  ),
]

const ORIGINAL = '가을 하늘은 맑고 높다'
const subsetEdit = (newText: string) => ({
  pageIndex: 0,
  rect: [55, 692, 290, 724] as [number, number, number, number],
  oldText: ORIGINAL,
  newText,
  fontSize: 20,
})

describe('keep-original edit on a partial subset', () => {
  it('keeps the subset glyphs for covered chars and substitutes only the new ones', async () => {
    const text = '가을 하늘은 맑고 푸르다'
    // 푸 and 르 are not in the subset; with no Korean look-alike installed the
    // fallback takes them, which still mixes — only the second face's name varies
    const result = await applyTextEdits(await subsetFixture(ORIGINAL), [subsetEdit(text)])
    expect(result.skipped).toEqual([])
    expect((await extractText(result.bytes)).replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
    const faces = baseFonts(result.bytes)
    expect(faces.some((f) => f.includes('GowunBatang'))).toBe(true)
    expect(faces.some((f) => !f.includes('GowunBatang'))).toBe(true)
    // the subset's pieces and the substitute's piece are separate text objects
    expect((textStreams(result.bytes).match(/Tj/g) ?? []).length).toBeGreaterThan(1)
  })

  it('stays in the subset alone when it covers every redrawn char', async () => {
    const result = await applyTextEdits(await subsetFixture(ORIGINAL), [
      subsetEdit('높다 가을 하늘은 맑고'),
    ])
    expect(result.skipped).toEqual([])
    expect(baseFonts(result.bytes).every((f) => f.includes('GowunBatang'))).toBe(true)
  })

  it('never mixes the subset into a whole-edit face choice', async () => {
    const result = await applyTextEdits(await subsetFixture(ORIGINAL), [
      { ...subsetEdit('가을 하늘은 맑고 푸르다'), newFont: 'times' },
    ])
    // Times has no Hangul, so the edit degrades to the fallback — but the user
    // picked a face for the whole run, so none of it stays in the subset
    expect(result.skipped).toEqual([])
    expect(baseFonts(result.bytes).some((f) => f.includes('GowunBatang'))).toBe(false)
  })
})
