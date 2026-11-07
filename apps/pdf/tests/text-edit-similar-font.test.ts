import { PDFDocument, PDFName } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { fontCoversText } from '../src/main/font-cmap'
import { findSystemFont } from '../src/main/font-locate'
import { applyTextEdits } from '../src/main/text-edit'
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
