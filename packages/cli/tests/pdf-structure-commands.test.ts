import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { encodeRgbaPng } from '../../pdf2docx/src/extract/png'
import { ResultStore, documentHash } from '../../pdf-structure/src/store'
import { run, tempDir, writeMinimalPdf } from './helpers'

// The PDF commands that need no AI: structured reading, Markdown / EPUB conversion and the
// picture export, on real PDFium. A data folder per test keeps the result store away from
// the user's own.

function env(dir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GENOFFICE_USER_DATA: dir,
    GENOFFICE_AI_SETTINGS: '',
    GENOFFICE_AUDIT_LOG: 'off',
    GENOFFICE_ALLOWED_ROOTS: '',
  }
}

function gradient(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = (i * 7) & 0xff
    rgba[i * 4 + 1] = (i * 3) & 0xff
    rgba[i * 4 + 2] = (i * 11) & 0xff
    rgba[i * 4 + 3] = 255
  }
  return rgba
}

/** two pages of text with a heading-sized line, a picture on page 2 */
async function illustratedPdf(path: string): Promise<string> {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Field Notes')
  pdf.setAuthor('Ada Writer')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const p1 = pdf.addPage([600, 800])
  p1.drawText('Chapter One', { x: 72, y: 720, size: 28, font: bold })
  p1.drawText('The river was quiet in the morning light.', { x: 72, y: 660, size: 12, font })
  const p2 = pdf.addPage([600, 800])
  p2.drawText('A second page with a picture below.', { x: 72, y: 720, size: 12, font })
  const image = await pdf.embedPng(encodeRgbaPng(gradient(120, 80), 120, 80))
  p2.drawImage(image, { x: 72, y: 400, width: 240, height: 160 })
  writeFileSync(path, await pdf.save())
  return path
}

describe('pdf read --structured', () => {
  it('answers the same shape as pdf read with the structured text and structured: true', async () => {
    const dir = tempDir()
    const pdf = await illustratedPdf(join(dir, 'notes.pdf'))
    const plain = await run(['pdf', 'read', pdf, '--json'], { env: env(dir) })
    const r = await run(['pdf', 'read', pdf, '--structured', '--json'], { env: env(dir) })
    expect(r.code).toBe(0)
    const detail = r.json().detail
    expect(detail.structured).toBe(true)
    expect(Object.keys(detail).sort()).toEqual(
      [...Object.keys(plain.json().detail), 'structured'].sort(),
    )
    expect(detail.pages_read.map((p: { page: number }) => p.page)).toEqual([1, 2])
    expect(detail.pages_read[0]).toMatchObject({ page: 1, width_pt: 600, height_pt: 800 })
    expect(detail.pages_read[0].text).toContain('# Chapter One')
    expect(detail.pages_read[0].text).toContain('The river was quiet')
    expect(plain.json().detail.pages_read[0].text).not.toContain('#')
  })

  it('keeps --page and --range and refuses a page outside the document', async () => {
    const dir = tempDir()
    const pdf = writeMinimalPdf(join(dir, 'three.pdf'), ['One', 'Two', 'Three'])
    const one = await run(['pdf', 'read', pdf, '--structured', '--page', '2', '--json'], {
      env: env(dir),
    })
    expect(one.code).toBe(0)
    expect(one.json().detail.range).toBe('2-2')
    expect(one.json().detail.pages_read).toHaveLength(1)
    expect(one.json().detail.pages_read[0].text).toContain('Two')
    const beyond = await run(['pdf', 'read', pdf, '--structured', '--range', '2-9', '--json'], {
      env: env(dir),
    })
    expect(beyond.code).toBe(1)
    expect(beyond.json().error).toBe('out_of_range')
    expect(beyond.json().detail.valid_range).toEqual([1, 3])
  })

  it('reads a page the AI read from what the AI returned', async () => {
    const dir = tempDir()
    const pdf = writeMinimalPdf(join(dir, 'scan.pdf'), ['Printed words'])
    const bytes = new Uint8Array(readFileSync(pdf))
    const fp = (await run(['pdf', 'read', pdf, '--structured', '--json'], { env: env(dir) })).json()
      .detail.pages_read[0]
    expect(fp.text).toContain('Printed words')
    const store = new ResultStore(dir)
    const { pageFingerprints } = await import('../src/formats/pdf-structure')
    const [print] = await pageFingerprints(bytes, undefined, [1])
    await store.writeAiReadPage(documentHash(bytes), print!, {
      version: 1,
      blocks: [{ kind: 'paragraph', runs: [{ kind: 'text', text: 'Words the AI read' }] }],
      footnotes: [],
      droppedRepetitions: 0,
      reasked: false,
    })
    const r = await run(['pdf', 'read', pdf, '--structured', '--json'], { env: env(dir) })
    expect(r.json().detail.pages_read[0].text).toContain('Words the AI read')
  })
})

describe('convert pdf to md and epub', () => {
  it('writes Markdown beside the PDF with its pictures under assets/', async () => {
    const dir = tempDir()
    const pdf = await illustratedPdf(join(dir, 'notes.pdf'))
    const r = await run(['convert', pdf, '--to', 'md', '--json'], { env: env(dir) })
    expect(r.code).toBe(0)
    const out = join(dir, 'notes.md')
    expect(r.json().output_path).toBe(out)
    expect(r.json().detail).toMatchObject({ pages: 2, assets_written: 1, assets_reused: 0 })
    const md = readFileSync(out, 'utf8')
    expect(md).toMatch(/^# .*Chapter One/m)
    expect(md).toMatch(/!\[[^\]]*\]\(assets\/[^)]+\.png\)/)
    expect(readdirSync(join(dir, 'assets')).some((f) => f.endsWith('.png'))).toBe(true)

    const again = await run(['convert', pdf, '--to', 'md', '--json'], { env: env(dir) })
    expect(again.code).toBe(2)
    expect(again.json().error).toBe('output_exists')
    const forced = await run(['convert', pdf, '--to', 'md', '--force', '--json'], {
      env: env(dir),
    })
    expect(forced.code).toBe(0)
    expect(forced.json().detail).toMatchObject({ assets_written: 0, assets_reused: 1 })
  })

  it('converts only --pages', async () => {
    const dir = tempDir()
    const pdf = writeMinimalPdf(join(dir, 'three.pdf'), ['First', 'Second', 'Third'])
    const r = await run(
      ['convert', pdf, '--to', 'md', '--pages', '2-3', '--out', join(dir, 'part.md'), '--json'],
      { env: env(dir) },
    )
    expect(r.code).toBe(0)
    const md = readFileSync(join(dir, 'part.md'), 'utf8')
    expect(md).toContain('Second')
    expect(md).toContain('Third')
    expect(md).not.toContain('First')
    const bad = await run(['convert', pdf, '--to', 'md', '--pages', '4', '--json'], {
      env: env(dir),
    })
    expect(bad.code).toBe(1)
    expect(bad.json().error).toBe('out_of_range')
    expect(existsSync(join(dir, 'three.md'))).toBe(false)
  })

  it('writes an EPUB with the PDF title and author, overridable, and a cover unless --no-cover', async () => {
    const dir = tempDir()
    const pdf = await illustratedPdf(join(dir, 'notes.pdf'))
    const r = await run(['convert', pdf, '--to', 'epub', '--json'], { env: env(dir) })
    expect(r.code).toBe(0)
    expect(r.json().detail).toMatchObject({
      title: 'Field Notes',
      author: 'Ada Writer',
      cover: true,
    })
    const zip = await JSZip.loadAsync(readFileSync(join(dir, 'notes.epub')))
    expect(await zip.file('mimetype')!.async('string')).toBe('application/epub+zip')
    const opf = await zip.file('OEBPS/content.opf')!.async('string')
    expect(opf).toContain('Field Notes')
    expect(opf).toContain('cover')

    const other = join(dir, 'plain.epub')
    const r2 = await run(
      [
        'convert',
        pdf,
        '--to',
        'epub',
        '--out',
        other,
        '--title',
        'Renamed',
        '--author',
        'Someone',
        '--no-cover',
        '--json',
      ],
      { env: env(dir) },
    )
    expect(r2.code).toBe(0)
    expect(r2.json().detail).toMatchObject({ title: 'Renamed', author: 'Someone', cover: false })
    const opf2 = await (
      await JSZip.loadAsync(readFileSync(other))
    )
      .file('OEBPS/content.opf')!
      .async('string')
    expect(opf2).toContain('Renamed')
    expect(opf2).not.toContain('cover-image')
  })

  it('starts each original page on a new screen with --page-breaks', async () => {
    const dir = tempDir()
    const pdf = await illustratedPdf(join(dir, 'notes.pdf'))
    const out = join(dir, 'pages.epub')
    const r = await run(['convert', pdf, '--to', 'epub', '--out', out, '--page-breaks', '--json'], {
      env: env(dir),
    })
    expect(r.code).toBe(0)
    expect(r.json().detail.page_breaks).toBe(true)
    const zip = await JSZip.loadAsync(readFileSync(out))
    const chapters = Object.keys(zip.files).filter((n) => /chapter-\d+\.xhtml$/.test(n))
    expect(chapters).toHaveLength(2)
  })

  it('refuses the reflow options on other routes', async () => {
    const dir = tempDir()
    const pdf = writeMinimalPdf(join(dir, 'a.pdf'))
    const r = await run(['convert', pdf, '--to', 'docx', '--pages', '1', '--json'], {
      env: env(dir),
    })
    expect(r.code).toBe(1)
    expect(r.json().error).toBe('invalid_argument')
    const t = await run(['convert', pdf, '--to', 'md', '--title', 'x', '--json'], {
      env: env(dir),
    })
    expect(t.code).toBe(1)
    expect(t.json().message).toContain('pdf→epub')
    const b = await run(['convert', pdf, '--to', 'md', '--page-breaks', '--json'], {
      env: env(dir),
    })
    expect(b.code).toBe(1)
    expect(b.json().error).toBe('invalid_argument')
  })
})

describe('pdf images', () => {
  it('saves the pictures of the pages with page, file, width and height', async () => {
    const dir = tempDir()
    const pdf = await illustratedPdf(join(dir, 'notes.pdf'))
    const out = join(dir, 'pictures')
    const r = await run(['pdf', 'images', pdf, '--out', out, '--json'], { env: env(dir) })
    expect(r.code).toBe(0)
    const images = r.json().detail.images
    expect(images).toEqual([{ page: 2, file: join(out, 'notes-p2-1.png'), width: 120, height: 80 }])
    expect(existsSync(images[0].file)).toBe(true)

    const again = await run(['pdf', 'images', pdf, '--out', out, '--json'], { env: env(dir) })
    // nothing is replaced: the second copy takes a new name
    expect(again.json().detail.images[0].file).toBe(join(out, 'notes-p2-1 (2).png'))

    const page1 = await run(['pdf', 'images', pdf, '--out', out, '--pages', '1', '--json'], {
      env: env(dir),
    })
    expect(page1.json().detail.images).toEqual([])
  })

  it('needs --out and refuses options of other verbs', async () => {
    const dir = tempDir()
    const pdf = writeMinimalPdf(join(dir, 'a.pdf'))
    const missing = await run(['pdf', 'images', pdf, '--json'], { env: env(dir) })
    expect(missing.code).toBe(1)
    expect(missing.json().error).toBe('missing_argument')
    const extra = await run(['pdf', 'images', pdf, '--out', dir, '--yes', '--json'], {
      env: env(dir),
    })
    expect(extra.code).toBe(1)
    expect(extra.json().error).toBe('unknown_option')
  })
})
