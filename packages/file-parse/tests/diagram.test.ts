import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { encodeCompressedPage, formatDiagramText, openDiagram } from '@genoffice/drawio-model'
import { nodePageCodec } from '@genoffice/drawio-model/node'
import {
  ATTACHABLE_IMAGE_EXTS,
  ATTACHABLE_MAX_BYTES,
  attachableMaxBytes,
  diagramPictureExtOf,
  diagramPictureExtOfName,
  diagramToText,
  isAttachableExt,
  parseFileToText,
} from '../src'

const dir = mkdtempSync(join(tmpdir(), 'file-parse-diagram-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const fixture = (name: string): Buffer =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url))

function write(name: string, bytes: Uint8Array | string): string {
  const path = join(dir, name)
  writeFileSync(path, bytes)
  return path
}

/** the read table the diagram editor's own AI gets, for the same bytes */
function readTable(name: string, bytes: Uint8Array): string {
  const opened = openDiagram(name, bytes, nodePageCodec)
  if (!opened.ok) throw new Error(opened.message)
  return formatDiagramText(opened.file.state)
}

const model = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`
const vertex = (id: string, value: string): string =>
  `<mxCell id="${id}" value="${value}" style="ellipse;html=1;" vertex="1" parent="1"><mxGeometry x="10" y="20" width="80" height="40" as="geometry"/></mxCell>`

/** a smallest PNG: signature, IHDR and IEND, no text chunks */
const PLAIN_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000049454e44ae426082',
  'hex',
)

describe('draw.io diagrams in parseFileToText', () => {
  it.each([
    ['flow.drawio', 'out.drawio'],
    ['flow.dio', 'out.drawio'],
    ['flow.drawio.svg', 'out.drawio.svg'],
    ['flow.drawio.png', 'out.drawio.png'],
  ])('reads %s as the read table of all pages', async (name, source) => {
    const bytes = fixture(source)
    const parsed = await parseFileToText(write(name, bytes))
    expect(parsed.ok).toBe(true)
    expect(parsed.kind).toBe('text')
    expect(parsed.text).toBe(readTable(name, bytes))
    expect(parsed.text).toContain('시작')
    expect(parsed.text).toContain('한글 처리 단계')
  })

  it('takes the double extension in any case', async () => {
    const parsed = await parseFileToText(write('Flow.DrawIO.PNG', fixture('out.drawio.png')))
    expect(parsed).toMatchObject({ ok: true, kind: 'text' })
    expect(parsed.text).toContain('시작')
  })

  it('reads compressed pages, every page', async () => {
    const pages = [
      `<diagram id="p1" name="First">${encodeCompressedPage(model(vertex('a', 'Alpha')), nodePageCodec)}</diagram>`,
      `<diagram id="p2" name="Second">${encodeCompressedPage(model(vertex('b', 'Beta')), nodePageCodec)}</diagram>`,
    ]
    const xml = `<mxfile compressed="true">${pages.join('')}</mxfile>`
    const parsed = await parseFileToText(write('two-pages.drawio', xml))
    expect(parsed.ok).toBe(true)
    expect(parsed.text).toContain('First')
    expect(parsed.text).toContain('Second')
    expect(parsed.text).toContain('Alpha')
    expect(parsed.text).toContain('Beta')
    expect(parsed.text).toBe(diagramToText('two-pages.drawio', Buffer.from(xml)))
  })

  it.each([
    ['not XML', 'broken.drawio', 'this is not a diagram', 'not_xml'],
    ['XML without a diagram', 'empty.dio', '<html><body/></html>', 'no_diagram'],
    [
      'a page that does not inflate',
      'bad-page.drawio',
      '<mxfile><diagram id="p">!!!not-base64!!!</diagram></mxfile>',
      'decompress_failed',
    ],
  ])('fails a broken diagram (%s) like any unreadable file', async (_what, name, body, reason) => {
    const parsed = await parseFileToText(write(name, body))
    expect(parsed.ok).toBe(false)
    expect(parsed.kind).toBe('text')
    expect(parsed.error).toContain(`Cannot read diagram (${reason})`)
  })

  it('fails a .drawio.png that is not a PNG', async () => {
    const parsed = await parseFileToText(write('fake.drawio.png', 'not a png at all'))
    expect(parsed).toMatchObject({ ok: false, kind: 'text' })
    expect(parsed.error).toContain('Cannot read diagram (corrupt_image)')
  })

  it('keeps a picture that only carries the name a picture', async () => {
    expect(await parseFileToText(write('shot.drawio.png', PLAIN_PNG))).toEqual(
      await parseFileToText(write('shot.png', PLAIN_PNG)),
    )
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'
    expect(await parseFileToText(write('art.drawio.svg', svg))).toEqual({
      ok: false,
      kind: 'unsupported',
      error: 'Unsupported file type: .svg',
    })
  })

  it('leaves plain pictures and .svg as they were', async () => {
    expect(await parseFileToText(write('photo.png', PLAIN_PNG))).toEqual({
      ok: true,
      kind: 'image',
      mime: 'image/png',
    })
    // a real draw.io picture under a plain name is a picture, not a diagram
    expect(await parseFileToText(write('exported.png', fixture('out.drawio.png')))).toEqual({
      ok: true,
      kind: 'image',
      mime: 'image/png',
    })
    expect(await parseFileToText(write('exported.svg', fixture('out.drawio.svg')))).toMatchObject({
      ok: false,
      kind: 'unsupported',
    })
  })

  it('does not read .vsdx', async () => {
    expect(await parseFileToText(write('plan.vsdx', 'PK\u0003\u0004'))).toEqual({
      ok: false,
      kind: 'unsupported',
      error: 'Unsupported file type: .vsdx',
    })
  })
})

describe('the attachable list for diagrams', () => {
  it('takes the four diagram names and not .vsdx', () => {
    for (const ext of ['drawio', 'dio', 'drawio.svg', 'drawio.png', '.DRAWIO.PNG']) {
      expect(isAttachableExt(ext)).toBe(true)
    }
    expect(isAttachableExt('vsdx')).toBe(false)
    expect(isAttachableExt('svg')).toBe(false)
  })

  it('caps a diagram picture as a document, not as a picture', () => {
    expect(ATTACHABLE_IMAGE_EXTS.has('drawio.png')).toBe(false)
    expect(attachableMaxBytes('drawio.png')).toBe(ATTACHABLE_MAX_BYTES)
    expect(attachableMaxBytes('drawio.svg')).toBe(ATTACHABLE_MAX_BYTES)
    expect(attachableMaxBytes('drawio')).toBe(ATTACHABLE_MAX_BYTES)
  })

  it('names the double extension from the file name alone', () => {
    expect(diagramPictureExtOfName('a.drawio.svg')).toBe('drawio.svg')
    expect(diagramPictureExtOfName('C:/x/A.DRAWIO.PNG')).toBe('drawio.png')
    expect(diagramPictureExtOfName('a.png')).toBeNull()
    expect(diagramPictureExtOfName('a.drawio')).toBeNull()
    expect(diagramPictureExtOfName('a.vsdx')).toBeNull()
  })

  it('gives a draw.io picture its double extension only when it holds the diagram', () => {
    expect(diagramPictureExtOf(write('real.drawio.png', fixture('out.drawio.png')))).toBe(
      'drawio.png',
    )
    expect(diagramPictureExtOf(write('real.drawio.svg', fixture('out.drawio.svg')))).toBe(
      'drawio.svg',
    )
    expect(diagramPictureExtOf(write('only-name.drawio.png', PLAIN_PNG))).toBeNull()
    expect(diagramPictureExtOf(write('real-as.png', fixture('out.drawio.png')))).toBeNull()
    expect(diagramPictureExtOf(write('flow.drawio', fixture('out.drawio')))).toBeNull()
    // unreadable: keeps the diagram name, so the text reader reports why
    expect(diagramPictureExtOf(join(dir, 'missing.drawio.png'))).toBe('drawio.png')
  })
})
