// The page of a windowless job (src/renderer/headless.ts): which pages it
// draws, what a batch keeps in each mode, and when it hands back bytes to
// write. draw.io is the fake of the AI tool tests; pictures and the file
// bytes are stand-ins.
import { describe, expect, it } from 'vitest'
import type { DrawioFrame } from '../src/renderer/drawio/frame-client'
import { runHeadlessJob } from '../src/renderer/headless'
import { SVG_FILE_HEAD } from '../src/renderer/document/page-pictures'
import { fakeFrame } from './helpers/fake-drawio'

function headlessFrame() {
  const fake = fakeFrame()
  const serialized: [string, boolean][] = []
  const pictures: string[] = []
  const request = async (op: string, args: unknown): Promise<unknown> => {
    switch (op) {
      case 'pageInfo':
        return {
          pages: [...fake.drawio.pages].map(([id, page]) => ({
            id,
            name: page.name,
            pageWidth: 827,
            pageHeight: 1169,
          })),
          currentPage: fake.drawio.current,
        }
      case 'pagePng':
        pictures.push(`png:${(args as { pageId: string }).pageId}`)
        return { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }
      case 'pageSvg':
        pictures.push(`svg:${(args as { pageId: string; theme: string }).theme}`)
        return { svg: '<svg/>', width: 100, height: 50 }
      default:
        return fake.frame.request(op as never, args as never)
    }
  }
  const frame = {
    request,
    serialize: async (kind: string, compressed: boolean) => {
      serialized.push([kind, compressed])
      return new Uint8Array([1, 2, 3])
    },
  } as unknown as DrawioFrame
  return { frame, fake, serialized, pictures }
}

const drawio = { format: 'drawio' as const, compressed: true }

describe('export jobs', () => {
  it('draws every page, numbered, or the one --page picks', async () => {
    const all = headlessFrame()
    const report = await runHeadlessJob(all.frame, { kind: 'export', format: 'png' }, drawio)
    expect(report).toMatchObject({ ok: true, kind: 'images', format: 'png' })
    if (!report.ok || report.kind !== 'images') throw new Error('no images')
    expect(report.pages.map((p) => p.number)).toEqual([1, 2])
    expect(all.pictures).toEqual(['png:p1', 'png:p2'])
    expect([...report.pages[0]!.bytes]).toEqual([0x89, 0x50, 0x4e, 0x47])

    const one = headlessFrame()
    const svg = await runHeadlessJob(one.frame, { kind: 'export', format: 'svg', page: 2 }, drawio)
    if (!svg.ok || svg.kind !== 'images') throw new Error('no images')
    expect(svg.pages.map((p) => p.number)).toEqual([2])
    expect(new TextDecoder().decode(svg.pages[0]!.bytes)).toBe(`${SVG_FILE_HEAD}<svg/>`)
    // a plain SVG is light only, like PNG and PDF: no adaptive colors that turn dark in a dark viewer
    expect(one.pictures).toEqual(['svg:light'])
  })

  it('makes light sheets at each page size for PDF; a page out of range fails', async () => {
    const pdf = headlessFrame()
    const report = await runHeadlessJob(pdf.frame, { kind: 'export', format: 'pdf' }, drawio)
    expect(report).toMatchObject({
      ok: true,
      kind: 'pdf',
      pages: [
        { svg: '<svg/>', width: 100, height: 50, pageWidth: 827, pageHeight: 1169 },
        { pageWidth: 827 },
      ],
    })
    expect(pdf.pictures).toEqual(['svg:light', 'svg:light'])
    const out = await runHeadlessJob(
      headlessFrame().frame,
      { kind: 'export', format: 'png', page: 3 },
      drawio,
    )
    expect(out).toMatchObject({ ok: false, error: expect.stringContaining('2 page') })
  })
})

describe('write jobs', () => {
  it('applies the batch and serializes in the asked format with the file compression', async () => {
    const h = headlessFrame()
    const report = await runHeadlessJob(
      h.frame,
      {
        kind: 'write',
        format: 'drawio.png',
        ops: [{ op: 'add_shape', label: 'new', x: 0, y: 200 }],
        mode: 'all-or-nothing',
      },
      drawio,
    )
    expect(report).toMatchObject({
      ok: true,
      kind: 'write',
      batch: { status: 'ok', changed: true, created: ['s1'] },
    })
    expect(h.serialized).toEqual([['xmlpng', true]])
  })

  it('a rejected batch, or reads into the same format, gives no bytes; reads into a new format do', async () => {
    const rejected = headlessFrame()
    const r1 = await runHeadlessJob(
      rejected.frame,
      {
        kind: 'write',
        format: 'drawio',
        ops: [{ op: 'update', id: 'nope', label: 'x' }],
        mode: 'all-or-nothing',
      },
      drawio,
    )
    expect(r1).toMatchObject({ ok: true, bytes: null, batch: { status: 'rejected' } })
    const reads = { kind: 'write' as const, ops: [{ op: 'read' }], mode: 'all-or-nothing' as const }
    const same = await runHeadlessJob(headlessFrame().frame, { ...reads, format: 'drawio' }, drawio)
    expect(same).toMatchObject({ ok: true, bytes: null, batch: { changed: false } })
    const other = await runHeadlessJob(
      headlessFrame().frame,
      { ...reads, format: 'drawio.svg' },
      drawio,
    )
    expect(other).toMatchObject({ ok: true, bytes: new Uint8Array([1, 2, 3]) })
  })

  it('best-effort keeps the ops that apply, and --page is the default page', async () => {
    const h = headlessFrame()
    const report = await runHeadlessJob(
      h.frame,
      {
        kind: 'write',
        format: 'drawio',
        ops: [
          { op: 'add_shape', label: 'kept', x: 0, y: 0 },
          { op: 'delete', ids: ['a'] },
        ],
        mode: 'best-effort',
        page: 2,
      },
      drawio,
    )
    expect(report).toMatchObject({
      ok: true,
      batch: {
        status: 'partial',
        results: [{ status: 'ok' }, { status: 'failed', error: { code: 'target_not_found' } }],
      },
    })
    expect(h.fake.drawio.pages.get('p2')!.cells.map((c) => c.value)).toContain('kept')
    expect(h.fake.drawio.pages.get('p1')!.cells.map((c) => c.id)).toContain('a')
  })
})
