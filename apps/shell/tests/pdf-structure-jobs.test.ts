/**
 * What a structure-job process does, run in-process with a real PDFium on
 * synthetic PDFs (the process entry only wires this to the parent port).
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { encodeRgbaPng } from '../../../packages/pdf2docx/src/extract/png'
import { buildPdf, loadPdfium } from '../../../packages/pdf-structure/tests/helpers/fixtures'
import { documentHash } from '../../../packages/pdf-structure/src/store'
import { runStructureJob, type JobDeps } from '../src/main/pdf-structure/jobs'
import { errorMessageOf, type JobSource } from '../src/main/pdf-structure/protocol'
import type {
  FingerprintsJobValue,
  ImagesJobValue,
  MarkdownJobValue,
  StructuredTextJobValue,
  TreeJobValue,
  WriteBackJobValue,
} from '../src/main/pdf-structure/protocol'

function solidPng(w: number, h: number, rgb: [number, number, number]): Uint8Array {
  const px = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) px.set([...rgb, 255], i * 4)
  return encodeRgbaPng(px, w, h)
}

let dir: string
let pdfPath: string
let bytes: Uint8Array
const deps: JobDeps = {
  pdfium: loadPdfium,
  ocr: () => null,
  now: () => new Date('2026-01-02T03:04:05Z'),
  structuredTextFormatter: null,
  translatedPdfWriter: null,
}
const source = (): JobSource => ({ pdfPath })
const noProgress = () => {}

beforeAll(async () => {
  bytes = await buildPdf(
    [
      [
        { kind: 'text', text: 'Chapter One', x: 72, y: 700, size: 24, bold: true },
        { kind: 'text', text: 'Plain body text on the first page.', x: 72, y: 650 },
        {
          kind: 'image',
          x: 72,
          y: 300,
          width: 200,
          height: 150,
          png: solidPng(60, 45, [20, 120, 200]),
        },
      ],
      [{ kind: 'text', text: 'Second page body text.', x: 72, y: 700 }],
    ],
    { info: { title: 'Synthetic Book', author: 'Tester' } },
  )
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pdf-structure-jobs-'))
  pdfPath = join(dir, 'book.pdf')
  writeFileSync(pdfPath, bytes)
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('tree and fingerprints', () => {
  it('extracts the tree with the file hash and page fingerprints, and reports progress', async () => {
    const progress: Array<[number, number]> = []
    const value = (await runStructureJob({ op: 'tree', source: source() }, deps, (d, t) =>
      progress.push([d, t]),
    )) as TreeJobValue
    expect(value.docHash).toBe(documentHash(bytes))
    expect(value.fingerprints.map((f) => f.page)).toEqual([1, 2])
    expect(value.tree.blocks.some((b) => b.kind === 'image')).toBe(true)
    expect(progress.at(-1)).toEqual([2, 2])

    const fps = (await runStructureJob(
      { op: 'fingerprints', source: source() },
      deps,
      noProgress,
    )) as FingerprintsJobValue
    expect(fps.fingerprints).toEqual(value.fingerprints.map((f) => f.fingerprint))
  })

  it('reports a page range outside the document with the valid range', async () => {
    const err = await runStructureJob(
      { op: 'tree', source: { pdfPath, pages: [5] } },
      deps,
      noProgress,
    ).catch((e: unknown) => e)
    expect(errorMessageOf(err)).toMatchObject({
      error: 'page-range',
      validRange: { first: 1, last: 2 },
    })
  })

  it('reports an unreadable PDF with the PdfLoadError code', async () => {
    writeFileSync(pdfPath, 'not a pdf at all')
    const err = await runStructureJob({ op: 'tree', source: source() }, deps, noProgress).catch(
      (e: unknown) => e,
    )
    expect(errorMessageOf(err).error).toBe('corrupt')
  })
})

describe('markdown output', () => {
  const md = async (outPath: string) =>
    (await runStructureJob(
      { op: 'markdown', source: source(), outPath },
      deps,
      noProgress,
    )) as MarkdownJobValue

  it('writes the text, its pictures and the app-owned asset list', async () => {
    const outPath = join(dir, 'book.md')
    const value = await md(outPath)
    expect(value).toMatchObject({ outPath, assetsWritten: 1, assetsReused: 0 })
    const text = readFileSync(outPath, 'utf8')
    const ref = /assets\/([a-f0-9]{64}\.(?:png|jpg))/.exec(text)
    expect(ref).not.toBeNull()
    const name = ref![1]!
    expect(existsSync(join(dir, 'assets', name))).toBe(true)
    const manifest = JSON.parse(readFileSync(join(dir, 'assets', '.genoffice-assets.json'), 'utf8'))
    expect(manifest.documents['book.md']).toEqual([name])
    expect(manifest.files.map((f: { name: string }) => f.name)).toEqual([name])

    // converting again reuses the owned picture
    expect(await md(outPath)).toMatchObject({ assetsWritten: 0, assetsReused: 1 })
  })

  it('keeps other documents in an existing asset list', async () => {
    mkdirSync(join(dir, 'assets'))
    const existing = {
      version: 1,
      files: [{ name: 'mine.png', sha256: 'e'.repeat(64) }],
      documents: { 'notes.md': ['mine.png'] },
      pending: {},
    }
    writeFileSync(join(dir, 'assets', '.genoffice-assets.json'), JSON.stringify(existing))
    await md(join(dir, 'book.md'))
    const manifest = JSON.parse(readFileSync(join(dir, 'assets', '.genoffice-assets.json'), 'utf8'))
    expect(manifest.documents['notes.md']).toEqual(['mine.png'])
    expect(Object.keys(manifest.documents).sort()).toEqual(['book.md', 'notes.md'])
  })

  it('never overwrites an assets file the list does not own', async () => {
    // learn the picture's name from a conversion elsewhere
    const probe = join(dir, 'probe')
    mkdirSync(probe)
    await md(join(probe, 'book.md'))
    const name = readdirSync(join(probe, 'assets')).find((f) => !f.startsWith('.'))!

    const target = join(dir, 'out')
    mkdirSync(join(target, 'assets'), { recursive: true })
    writeFileSync(join(target, 'assets', name), "the user's own file")
    const err = await runStructureJob(
      { op: 'markdown', source: source(), outPath: join(target, 'book.md') },
      deps,
      noProgress,
    ).catch((e: unknown) => e)
    expect(errorMessageOf(err).error).toBe('asset-conflict')
    expect(readFileSync(join(target, 'assets', name), 'utf8')).toBe("the user's own file")
    expect(existsSync(join(target, 'book.md'))).toBe(false)
    expect(existsSync(join(target, 'assets', '.genoffice-assets.json'))).toBe(false)
  })

  it('uses an identical file the user put there without taking it over', async () => {
    const probe = join(dir, 'probe')
    mkdirSync(probe)
    await md(join(probe, 'book.md'))
    const name = readdirSync(join(probe, 'assets')).find((f) => !f.startsWith('.'))!

    const target = join(dir, 'out')
    mkdirSync(join(target, 'assets'), { recursive: true })
    writeFileSync(join(target, 'assets', name), readFileSync(join(probe, 'assets', name)))
    const value = (await runStructureJob(
      { op: 'markdown', source: source(), outPath: join(target, 'book.md') },
      deps,
      noProgress,
    )) as MarkdownJobValue
    expect(value).toMatchObject({ assetsWritten: 0, assetsReused: 1 })
    expect(readFileSync(join(target, 'book.md'), 'utf8')).toContain(`assets/${name}`)
    // not listed: the editor must never delete the user's file
    expect(existsSync(join(target, 'assets', '.genoffice-assets.json'))).toBe(false)
  })

  it('refuses an unreadable asset list rather than replacing it', async () => {
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'assets', '.genoffice-assets.json'), '{broken')
    const err = await runStructureJob(
      { op: 'markdown', source: source(), outPath: join(dir, 'book.md') },
      deps,
      noProgress,
    ).catch((e: unknown) => e)
    expect(errorMessageOf(err).error).toBe('asset-conflict')
    expect(readFileSync(join(dir, 'assets', '.genoffice-assets.json'), 'utf8')).toBe('{broken')
  })

  it('writes a translated tree', async () => {
    const tree = (
      (await runStructureJob({ op: 'tree', source: source() }, deps, noProgress)) as TreeJobValue
    ).tree
    const heading = tree.blocks.find((b) => b.kind === 'heading' || b.kind === 'paragraph')!
    const outPath = join(dir, 'book.ko.md')
    await runStructureJob(
      {
        op: 'markdown',
        source: source(),
        tree,
        outPath,
        translation: {
          lang: 'ko',
          bilingual: false,
          units: [{ key: heading.id, runs: [{ kind: 'text', text: '번역된 글' }] }],
        },
      },
      deps,
      noProgress,
    )
    expect(readFileSync(outPath, 'utf8')).toContain('번역된 글')
  })
})

describe('EPUB, images and placeholders', () => {
  it('writes an EPUB with the mimetype entry first', async () => {
    const outPath = join(dir, 'book.epub')
    await runStructureJob(
      {
        op: 'epub',
        source: source(),
        outPath,
        epub: { title: 'Synthetic Book', author: 'Tester', pageImageAlt: 'Page {page}' },
      },
      deps,
      noProgress,
    )
    const out = readFileSync(outPath)
    expect(out.subarray(0, 2).toString('latin1')).toBe('PK')
    expect(out.subarray(30, 38).toString('latin1')).toBe('mimetype')
    // the cover is on by default
    expect(out.includes(Buffer.from('cover'))).toBe(true)
    // pages flow together: the two-page PDF is one chapter file
    expect(out.includes(Buffer.from('chapter-002.xhtml'))).toBe(false)
  })

  it('writes one XHTML file per page when pageBreaks is on', async () => {
    const outPath = join(dir, 'pages.epub')
    await runStructureJob(
      {
        op: 'epub',
        source: source(),
        outPath,
        epub: { title: 'Synthetic Book', cover: false, pageBreaks: true },
      },
      deps,
      noProgress,
    )
    const out = readFileSync(outPath)
    expect(out.includes(Buffer.from('chapter-001.xhtml'))).toBe(true)
    expect(out.includes(Buffer.from('chapter-002.xhtml'))).toBe(true)
  })

  it('extracts embedded images without overwriting earlier files', async () => {
    const outDir = join(dir, 'images')
    mkdirSync(outDir)
    const first = (await runStructureJob(
      { op: 'images', source: source(), outDir, baseName: 'book' },
      deps,
      noProgress,
    )) as ImagesJobValue
    expect(first.images).toHaveLength(1)
    expect(first.images[0]).toMatchObject({ page: 1, width: 60, height: 45 })
    expect(first.images[0]!.file).toBe(join(outDir, 'book-p1-1.png'))
    const second = (await runStructureJob(
      { op: 'images', source: source(), outDir, baseName: 'book' },
      deps,
      noProgress,
    )) as ImagesJobValue
    expect(second.images[0]!.file).toBe(join(outDir, 'book-p1-1 (2).png'))
    expect(readdirSync(outDir).sort()).toEqual(['book-p1-1 (2).png', 'book-p1-1.png'])
  })

  it('structured text and write-back are not available until plugged in', async () => {
    for (const job of [
      { op: 'structuredText' as const, source: source() },
      { op: 'writeBack' as const, source: source(), outPath: join(dir, 'x.pdf'), payload: {} },
    ]) {
      const err = await runStructureJob(job, deps, noProgress).catch((e: unknown) => e)
      expect(errorMessageOf(err).error).toBe('not-available')
    }
    expect(existsSync(join(dir, 'x.pdf'))).toBe(false)
  })

  it('runs a plugged-in formatter and writer', async () => {
    const plugged: JobDeps = {
      ...deps,
      structuredTextFormatter: (tree) =>
        tree.pages.map((p) => ({ page: p.page, text: `#${p.page}` })),
      translatedPdfWriter: async ({ pdf, payload }) => ({ pdf, report: { payload } }),
    }
    const text = (await runStructureJob(
      { op: 'structuredText', source: source() },
      plugged,
      noProgress,
    )) as StructuredTextJobValue
    expect(text.pages).toEqual([
      { page: 1, text: '#1' },
      { page: 2, text: '#2' },
    ])
    expect(text.extracted?.fingerprints).toHaveLength(2)

    const outPath = join(dir, 'book.en.pdf')
    const written = (await runStructureJob(
      { op: 'writeBack', source: source(), outPath, payload: { lang: 'en' } },
      plugged,
      noProgress,
    )) as WriteBackJobValue
    expect(written.report).toEqual({ payload: { lang: 'en' } })
    expect(readFileSync(outPath).equals(Buffer.from(bytes))).toBe(true)
    // the source stays as it was
    expect(readFileSync(pdfPath).equals(Buffer.from(bytes))).toBe(true)
  })
})
