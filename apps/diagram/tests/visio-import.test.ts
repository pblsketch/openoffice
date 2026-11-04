// Visio import: the importer the editor registers for `.vsdx`, the bridge op
// over draw.io's own importer (a fake draw.io here), the count of pictures
// that are not drawn, and the reasons a file is refused.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseBridgeMessage } from '../src/shared/bridge-protocol'
import { countUnconvertedPictures, isDrawableImageData } from '../src/shared/visio-pictures'
import { VISIO_IMPORT_NAME, importVisio, uncompressedPages } from '../src/bridge/visio'
import { diagramImporter, registerDiagramImporter } from '../src/renderer/document/importers'
import { importVisioFile, registerVisioImporter } from '../src/renderer/document/visio-import'
import { settleOpenFailure } from '../src/renderer/document/open-failure'
import { t } from '../src/renderer/i18n/locale'
import type { DrawioFrame } from '../src/renderer/drawio/frame-client'

const b64 = (bytes: number[] | string): string =>
  Buffer.from(typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : Buffer.from(bytes)).toString(
    'base64',
  )

const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46])
const SVG = b64('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')
const WMF = b64([0xd7, 0xcd, 0xc6, 0x9a, 0, 0, 0, 0, 0, 0, 100, 0])
const TIFF = b64([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0])
const ERROR_IMAGE = b64('<svg><!-- the importer’s error picture --></svg>')

const cellWith = (image: string): string =>
  `<mxCell id="x" style="shape=image;aspect=fixed;image=${image};" vertex="1" parent="1"/>`

describe('pictures that are not drawn', () => {
  it('passes the pictures draw.io converted or kept as they were', () => {
    expect(isDrawableImageData(`data:image/png,${PNG}`)).toBe(true)
    expect(isDrawableImageData(`data:image/jpg,${JPEG}`)).toBe(true)
    // a converted EMF: SVG under an SVG type
    expect(isDrawableImageData(`data:image/svg+xml,${SVG}`)).toBe(true)
    expect(isDrawableImageData('data:image/svg+xml,%3Csvg%20xmlns%3D%22x%22%2F%3E')).toBe(true)
    // not an embedded picture: not the import's to count
    expect(isDrawableImageData('img/lib/clip_art/computers/Server.svg')).toBe(true)
  })

  it('counts a WMF, the error picture, a type that does not match and a TIFF', () => {
    expect(isDrawableImageData(`data:image/svg+xml,${WMF}`)).toBe(false)
    expect(isDrawableImageData(`data:image/svg+xml,${ERROR_IMAGE}`, ERROR_IMAGE)).toBe(false)
    // an OLE object's preview: converted to SVG but labelled PNG
    expect(isDrawableImageData(`data:image/png,${SVG}`)).toBe(false)
    expect(isDrawableImageData(`data:image/tiff,${TIFF}`)).toBe(false)
    expect(isDrawableImageData('data:image/png,')).toBe(false)
  })

  it('counts every shape over all pages, reading escaped style attributes', () => {
    const pages = [
      `<mxGraphModel><root>${cellWith(`data:image/png,${PNG}`)}${cellWith(`data:image/svg+xml,${WMF}`)}</root></mxGraphModel>`,
      `<mxGraphModel><root>${cellWith(`data:image/svg+xml,${ERROR_IMAGE}`)}<mxCell id="b" style="rounded=1;fillColor=#dae8fc;" vertex="1"/></root></mxGraphModel>`,
      `<mxGraphModel><root><mxCell id="q" style='image=data:image/svg+xml,${WMF}&#59;' vertex="1"/></root></mxGraphModel>`,
    ]
    expect(countUnconvertedPictures(pages, ERROR_IMAGE)).toBe(3)
    expect(countUnconvertedPictures([])).toBe(0)
  })
})

// ---- the bridge op, over a fake draw.io ----

const PAGE_A =
  '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'
const PAGE_B = `<mxGraphModel><root><mxCell id="0"/>${cellWith(`data:image/svg+xml,${WMF}`)}</root></mxGraphModel>`
const compressed = (xml: string): string => `Z:${b64(xml)}`
const decompress = (text: string): string =>
  Buffer.from(text.replace(/^Z:/, ''), 'base64').toString('utf8')

function fakeUi(answer: (done: (xml: string) => void, fail: (err: unknown) => void) => void) {
  const calls: { blob: unknown; name: unknown }[] = []
  return {
    calls,
    ui: {
      importVisio: (
        blob: unknown,
        done: (xml: string) => void,
        fail: (e: unknown) => void,
        name: unknown,
      ) => {
        calls.push({ blob, name })
        answer(done, fail)
      },
    },
  }
}

describe('the bridge op', () => {
  afterEach(() => {
    delete (globalThis as { Graph?: unknown }).Graph
  })

  it('is a request the bridge reads', () => {
    expect(
      parseBridgeMessage({
        ieum: 1,
        kind: 'request',
        id: 'v',
        op: 'importVisio',
        args: { bytes: new Uint8Array([1]) },
      }),
    ).not.toBeNull()
  })

  it('opens the pages uncompressed and keeps names, ids and plain pages', () => {
    const file =
      `<mxfile><diagram name="Plan" id="p1">${compressed(PAGE_A)}</diagram>` +
      `<diagram name="Mixed" id="p2">${PAGE_B}</diagram></mxfile>`
    const read = uncompressedPages(file, decompress)
    expect(read.pages).toHaveLength(2)
    expect(read.pages[0]).toContain('<mxCell id="1" parent="0"/>')
    expect(read.xml).toMatch(/<diagram name="Plan" id="p1"><mxGraphModel>/)
    expect(read.xml).toMatch(/<diagram name="Mixed" id="p2"><mxGraphModel>/)
    expect(() => uncompressedPages('<html/>', decompress)).toThrow(/no diagram/)
    expect(() =>
      uncompressedPages('<mxfile><diagram id="x">Z:bm90IHhtbA==</diagram></mxfile>', decompress),
    ).toThrow(/could not be read/)
  })

  it('hands draw.io the bytes under a .vsdx name and counts the pictures not drawn', async () => {
    ;(globalThis as { Graph?: unknown }).Graph = { decompress }
    const { ui, calls } = fakeUi((done) =>
      done(
        `<mxfile><diagram name="A" id="a">${compressed(PAGE_A)}</diagram>` +
          `<diagram name="B" id="b">${compressed(PAGE_B)}</diagram></mxfile>`,
      ),
    )
    const reply = await importVisio(ui, new Uint8Array([0x50, 0x4b, 3, 4]))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.name).toBe(VISIO_IMPORT_NAME)
    // never one of the old binary names draw.io would convert another way
    expect(VISIO_IMPORT_NAME).toMatch(/\.vsdx$/)
    expect(calls[0]!.blob).toBeInstanceOf(Blob)
    expect(reply.pages).toBe(2)
    expect(reply.unconvertedPictures).toBe(1)
    expect(reply.xml).not.toContain('Z:')
  })

  it('rejects with the importer’s reason, and refuses empty bytes without asking draw.io', async () => {
    const failing = fakeUi((_done, fail) => fail({ message: 'Invalid or unsupported zip format' }))
    await expect(importVisio(failing.ui, new Uint8Array([1, 2]))).rejects.toThrow(
      'Invalid or unsupported zip format',
    )
    const empty = fakeUi((done) => done(''))
    await expect(importVisio(empty.ui, new Uint8Array(0))).rejects.toThrow(/empty/)
    expect(empty.calls).toHaveLength(0)
    await expect(importVisio(empty.ui, new Uint8Array([1]))).rejects.toThrow(/no diagram/)
    await expect(importVisio({}, new Uint8Array([1]))).rejects.toThrow(/no Visio importer/)
    const throwing = fakeUi(() => {
      throw new Error('boom')
    })
    await expect(importVisio(throwing.ui, new Uint8Array([1]))).rejects.toThrow('boom')
  })
})

// ---- the editor's importer ----

function fakeFrame(reply: (args: unknown) => Promise<unknown>) {
  const request = vi.fn((op: string, args: unknown) => {
    expect(op).toBe('importVisio')
    return reply(args)
  })
  return { frame: { request } as unknown as DrawioFrame, request }
}

const bytes = new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'visio-shapes.vsdx')))

describe('the .vsdx importer', () => {
  afterEach(() => registerDiagramImporter('vsdx', null))

  it('is what the editor registers for .vsdx; without it the file is unsupported', () => {
    expect(diagramImporter('vsdx')).toBeNull()
    registerVisioImporter()
    expect(diagramImporter('vsdx')).toBe(importVisioFile)
  })

  it('opens the converted diagram and tells how many pictures were not converted', async () => {
    const { frame, request } = fakeFrame(async () => ({
      xml: '<mxfile/>',
      pages: 2,
      unconvertedPictures: 3,
    }))
    const result = await importVisioFile({ bytes, title: 'Plan', frame })
    expect(request).toHaveBeenCalledWith('importVisio', { bytes })
    expect(result).toEqual({ ok: true, xml: '<mxfile/>', notices: { visioPictures: 3 } })
  })

  it('adds no notice when every picture came through', async () => {
    const { frame } = fakeFrame(async () => ({
      xml: '<mxfile/>',
      pages: 1,
      unconvertedPictures: 0,
    }))
    expect(await importVisioFile({ bytes, title: 'Plan', frame })).toEqual({
      ok: true,
      xml: '<mxfile/>',
    })
  })

  it('refuses a file draw.io cannot read, one without pages, and an empty one, with a reason', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = fakeFrame(async () => {
      throw new Error('End of data reached')
    })
    expect(await importVisioFile({ bytes, title: 'x', frame: broken.frame })).toEqual({
      ok: false,
      reason: t('importVisioUnreadable'),
    })
    const noPages = fakeFrame(async () => ({ xml: '<mxfile/>', pages: 0, unconvertedPictures: 0 }))
    expect(await importVisioFile({ bytes, title: 'x', frame: noPages.frame })).toEqual({
      ok: false,
      reason: t('importVisioNoPages'),
    })
    const untouched = fakeFrame(async () => ({ xml: '', pages: 1, unconvertedPictures: 0 }))
    expect(
      await importVisioFile({ bytes: new Uint8Array(0), title: 'x', frame: untouched.frame }),
    ).toEqual({ ok: false, reason: t('importVisioUnreadable') })
    expect(untouched.request).not.toHaveBeenCalled()
    expect(t('importVisioUnreadable')).not.toBe('importVisioUnreadable')
    warn.mockRestore()
  })
})

describe('fixtures', () => {
  it('are Visio packages (zip) with a document and pictures', () => {
    for (const name of ['visio-shapes.vsdx', 'visio-metafiles.vsdx']) {
      const file = readFileSync(join(__dirname, 'fixtures', name))
      expect([...file.subarray(0, 4)]).toEqual([0x50, 0x4b, 3, 4])
      expect(file.includes(Buffer.from('visio/document.xml'))).toBe(true)
      expect(file.includes(Buffer.from('visio/media/image1.png'))).toBe(true)
    }
    const metafiles = readFileSync(join(__dirname, 'fixtures', 'visio-metafiles.vsdx'))
    expect(metafiles.includes(Buffer.from('visio/media/image2.wmf'))).toBe(true)
    expect(metafiles.includes(Buffer.from('visio/media/image3.emf'))).toBe(true)
  })
})

describe('an import that fails once the tab is open', () => {
  const reason = 'This file cannot be imported: The file is damaged or is not a Visio drawing.'

  it('asks the shell to close the tab and say why; nothing is shown in the tab', async () => {
    const askShell = vi.fn(async () => true)
    const showInTab = vi.fn()
    await settleOpenFailure(reason, askShell, showInTab)
    expect(askShell).toHaveBeenCalledWith(reason)
    expect(showInTab).not.toHaveBeenCalled()
  })

  it('shows the reason in the tab when the shell does not close it', async () => {
    for (const askShell of [
      vi.fn(async () => false),
      vi.fn(async () => {
        throw new Error('no handler')
      }),
      undefined,
    ]) {
      const showInTab = vi.fn()
      await settleOpenFailure(reason, askShell, showInTab)
      expect(showInTab).toHaveBeenCalledWith(reason)
    }
  })
})
