import { describe, expect, it } from 'vitest'
import {
  applyDiagramOpsToFile,
  createDiagramFile,
  decodeCompressedPage,
  encodeCompressedPage,
  openDiagram,
  parseDiagramXml,
  planDiagramOps,
  writeDiagramPrimitives,
  type DiagramFile,
} from '../src/index'
import {
  codec,
  diagramElements,
  edge,
  expectOk,
  fixture,
  fixtureText,
  model,
  mxfile,
  open,
  page,
  utf8,
  vertex,
} from './helpers'

const P1 = model(
  vertex('a', 'A', 'html=1;', '0,0,100,50') +
    vertex('b', 'B', '', '200,0,100,50') +
    edge('e', 'a', 'b'),
)
const P2 = model(vertex('x', 'X', 'html=1;', '0,0,10,10'))
const P3 = model(vertex('y', 'Y', '', '0,0,10,10'))

/** Page 1 uncompressed, page 2 compressed, page 3 uncompressed. */
function mixedXml(): string {
  return mxfile(
    page('p1', 'One', `\n    ${P1}\n  `),
    page('p2', 'Two', encodeCompressedPage(P2, codec)),
    page('p3', 'Three', P3),
  )
}

function apply(file: DiagramFile, ops: unknown[], options = {}) {
  return applyDiagramOpsToFile(file, ops, { codec, ...options })
}

function written(file: DiagramFile, ops: unknown[], options = {}): string {
  const result = apply(file, ops, options)
  if (result.write.status !== 'written') expect.fail(JSON.stringify(result))
  return result.write.xml
}

describe('round trip of a compressed page', () => {
  it('encodes and decodes to the same model', () => {
    const text = encodeCompressedPage(P1 + '한글 ✓', codec)
    expect(text).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(decodeCompressedPage(text, codec)).toBe(P1 + '한글 ✓')
  })

  it('keeps a changed compressed page compressed', () => {
    const file = open(mixedXml())
    const xml = written(file, [{ op: 'update', id: 'x', label: 'changed', page: 'p2' }])
    const reopened = open(xml)
    expect(reopened.pages.map((p) => p.compressed)).toEqual([false, true, false])
    expect(reopened.state.pages[1]!.cells.find((c) => c.id === 'x')!.value).toBe('changed')
  })

  it('rewrites the real draw.io compressed page from the svg fixture', () => {
    const svgFile = expectOk(openDiagram('x.drawio.svg', fixture('out.drawio.svg'), codec)).file
    const asDrawio = open(svgFile.xml)
    const xml = written(asDrawio, [{ op: 'update', id: 'a', label: '끝' }])
    const page1 = open(xml)
    expect(page1.pages[0]!.compressed).toBe(true)
    expect(page1.state.pages[0]!.cells.find((c) => c.id === 'a')!.value).toBe('끝')
  })
})

describe('unchanged pages stay byte-identical', () => {
  it('rewrites only the changed page', () => {
    const original = mixedXml()
    const file = open(original)
    const before = diagramElements(original)
    for (const [target, index] of [
      ['p1', 0],
      ['p2', 1],
      ['p3', 2],
    ] as const) {
      const firstId = file.state.pages[index]!.cells[2]!.id
      const xml = written(file, [{ op: 'update', id: firstId, page: target, x: 77 }])
      const after = diagramElements(xml)
      after.forEach((element, i) => {
        if (i === index) expect(element).not.toBe(before[i])
        else expect(element).toBe(before[i])
      })
      // the mxfile start tag and everything outside the pages stay as they were
      expect(xml.slice(0, xml.indexOf('<diagram'))).toBe(
        original.slice(0, original.indexOf('<diagram')),
      )
      expect(xml.slice(xml.lastIndexOf('</diagram>'))).toBe(
        original.slice(original.lastIndexOf('</diagram>')),
      )
    }
  })

  it('keeps untouched cells of a changed uncompressed page as written', () => {
    const original = fixtureText('out.drawio')
    const xml = written(open(original), [{ op: 'update', id: 'b', label: 'new' }])
    const keep = original.match(/<mxCell id="a"[\s\S]*?<\/mxCell>/)![0]
    expect(xml).toContain(keep)
    expect(xml).toContain('value="new"')
    expect(xml.split('\n')).toHaveLength(original.split('\n').length)
  })

  it('renames by rewriting only the start tag', () => {
    const original = mixedXml()
    const xml = written(open(original), [{ op: 'rename_page', page: 'p2', name: 'Zwei & "2"' }])
    const [, two] = diagramElements(xml)
    const [, origTwo] = diagramElements(original)
    expect(two).toBe(origTwo!.replace('name="Two"', 'name="Zwei &amp; &quot;2&quot;"'))
  })

  it('appends and removes pages without touching the others', () => {
    const original = mixedXml()
    const before = diagramElements(original)
    const xml = written(open(original), [
      { op: 'add_page', name: 'Four', id: 'p4' },
      { op: 'add_shape', page: 'p4', id: 'n', label: 'new', x: 1, y: 2 },
      { op: 'delete_page', page: 'p2' },
    ])
    const after = diagramElements(xml)
    expect(after).toHaveLength(3)
    expect(after[0]).toBe(before[0])
    expect(after[1]).toBe(before[2])
    const reopened = open(xml)
    expect(reopened.pages.map((p) => [p.id, p.name])).toEqual([
      ['p1', 'One'],
      ['p3', 'Three'],
      ['p4', 'Four'],
    ])
    expect(reopened.state.pages[2]!.cells.map((c) => c.id)).toEqual(['0', '1', 'n'])
    expect(xml).toMatch(/\n {2}<diagram id="p4" name="Four">/)
  })

  it('compresses a new page when the file is compressed', () => {
    const xml = mxfile(page('c', 'C', encodeCompressedPage(P2, codec)))
    const out = written(open(xml), [{ op: 'add_page', name: 'D' }])
    expect(open(out).pages.map((p) => p.compressed)).toEqual([true, true])
  })
})

describe('writing what the ops planned', () => {
  it('writes a file whose state equals the planned state', () => {
    const file = open(mixedXml())
    const ops = [
      { op: 'add_shape', label: 'Line\n<two>', shape: 'note', x: 10, y: 20 },
      { op: 'add_edge', source: 'a', target: 's1', label: 'to note' },
      { op: 'update', id: 'a', style: 'fillColor=#fff;html=;', width: 30 },
      { op: 'delete', ids: ['b'] },
      { op: 'add_shape', page: 'p2', label: 'in two', x: 0, y: 0 },
    ]
    const result = apply(file, ops)
    expect(result.batch.status).toBe('ok')
    if (result.write.status !== 'written') expect.fail('not written')
    const reopened = open(result.write.xml)
    expect(reopened.state).toEqual(result.batch.state)
    expect(new TextDecoder().decode(result.write.bytes)).toBe(result.write.xml)
  })

  it('updates a label held by a UserObject wrapper', () => {
    const xml = mxfile(
      page(
        'p',
        'P',
        model(
          '<UserObject label="old" link="x" id="u"><mxCell style="" vertex="1" parent="1"><mxGeometry width="1" height="1" as="geometry"/></mxCell></UserObject>',
        ),
      ),
    )
    const out = written(open(xml), [{ op: 'update', id: 'u', label: 'new', x: 4 }])
    expect(out).toContain('<UserObject label="new" link="x" id="u">')
    expect(open(out).state.pages[0]!.cells.find((c) => c.id === 'u')).toMatchObject({
      value: 'new',
      geometry: { x: 4, y: 0, width: 1, height: 1 },
    })
  })

  it('removes a deleted shape with its wrapper and indentation', () => {
    const out = written(open(fixtureText('out.drawio')), [{ op: 'delete', ids: ['b'] }])
    expect(out).not.toContain('id="b"')
    expect(out).not.toContain('id="e"')
    expect(out).not.toMatch(/\n\s*\n/)
  })

  it('wraps a bare mxGraphModel file into an mxfile when pages change', () => {
    const bare = model(vertex('v', 'V', ''))
    const file = open(bare)
    const changed = written(file, [{ op: 'update', id: 'v', label: 'W' }])
    expect(changed.startsWith('<mxGraphModel')).toBe(true)
    const paged = written(file, [{ op: 'add_page', name: 'Two' }])
    const reopened = open(paged)
    expect(reopened.pages.map((p) => p.name)).toEqual(['Page-1', 'Two'])
    expect(reopened.state.pages[0]!.cells.map((c) => c.id)).toEqual(['0', '1', 'v'])
  })

  it('keeps a byte order mark', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(mixedXml())])
    const file = expectOk(openDiagram('b.drawio', withBom, codec)).file
    const result = apply(file, [{ op: 'rename_page', page: 'p1', name: 'x' }])
    if (result.write.status !== 'written') expect.fail('not written')
    expect([...result.write.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  })
})

describe('when nothing is written', () => {
  it('a read-only batch reports unchanged', () => {
    const result = apply(open(mixedXml()), [{ op: 'read' }, { op: 'read', page: 'Two' }])
    expect(result.batch.status).toBe('ok')
    expect(result.write).toEqual({ status: 'unchanged' })
  })

  it('a rejected batch writes nothing', () => {
    const result = apply(open(mixedXml()), [
      { op: 'add_page', name: 'x' },
      { op: 'delete', ids: ['nope'] },
    ])
    expect(result.batch.status).toBe('rejected')
    expect(result.write).toEqual({ status: 'unchanged' })
  })

  it('best-effort writes the ops that worked', () => {
    const result = apply(
      open(mixedXml()),
      [
        { op: 'add_page', name: 'x' },
        { op: 'delete', ids: ['nope'] },
      ],
      { mode: 'best-effort' },
    )
    expect(result.batch.status).toBe('partial')
    expect(result.write.status).toBe('written')
  })

  it('svg and png need the app to be written', () => {
    const svg = expectOk(openDiagram('x.drawio.svg', fixture('out.drawio.svg'), codec)).file
    const result = apply(svg, [{ op: 'update', id: 'a', label: 'z' }])
    expect(result.batch.status).toBe('ok')
    expect(result.write.status).toBe('needs_app')
    expect(writeDiagramPrimitives(svg, result.batch.primitives, codec)).toMatchObject({
      ok: false,
      reason: 'needs_app',
    })
  })

  it('uses the first page by default, or the page option', () => {
    const file = open(mixedXml())
    const result = apply(file, [{ op: 'add_shape', id: 'n', label: 'n', x: 0, y: 0 }], {
      page: 'Three',
    })
    expect(result.batch.primitives[0]).toMatchObject({ page: 'p3' })
  })
})

describe('a new diagram', () => {
  it('starts as one uncompressed page and takes ops', () => {
    const file = createDiagramFile()
    expect(file.format).toBe('drawio')
    expect(file.pages).toEqual([{ id: 'page-1', name: 'Page-1', compressed: false }])
    const xml = written(file, [{ op: 'add_shape', label: 'Hi', x: 0, y: 0 }])
    expect(xml).toContain('<mxGraphModel')
    const reopened = expectOk(parseDiagramXml(xml, codec)).file
    expect(reopened.pages[0]!.compressed).toBe(false)
    expect(reopened.state.pages[0]!.cells.map((c) => c.id)).toEqual(['0', '1', 's1'])
  })

  it('writes the same file twice for the same ops', () => {
    const ops = [{ op: 'add_shape', label: 'Hi', x: 0, y: 0 }]
    expect(written(createDiagramFile(), ops)).toBe(written(createDiagramFile(), ops))
  })

  it('a planned result and a written result agree on created ids', () => {
    const file = createDiagramFile({ pageName: '첫 쪽' })
    expect(file.pages[0]!.name).toBe('첫 쪽')
    const ops = [
      { op: 'add_shape', label: 'a', x: 0, y: 0 },
      { op: 'add_edge', source: 's1', target: 's1' },
    ]
    expect(apply(file, ops).batch.created).toEqual(planDiagramOps(file.state, ops).created)
  })
})
