import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  detectDiagramFormat,
  encodeCompressedPage,
  extractDiagramXml,
  openDiagram,
} from '../src/index'
import { codec, expectOk, fixture, fixtureText, model, mxfile, page, utf8, vertex } from './helpers'

const EXPECTED_SHAPES = [
  { id: 'a', label: '시작', shape: 'rounded', x: 40, y: 40, width: 120, height: 60 },
  { id: 'b', label: '한글 처리 단계', shape: 'rhombus', x: 240, y: 30, width: 140, height: 80 },
]

function crc32(bytes: Uint8Array): number {
  let crc = ~0
  for (const byte of bytes) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  return ~crc >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(utf8(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** The real fixture's PNG with its text chunks replaced by `extra`. */
function pngWith(...extra: Uint8Array[]): Uint8Array {
  const original = fixture('out.drawio.png')
  const parts: Uint8Array[] = [original.subarray(0, 8)]
  let p = 8
  const view = new DataView(original.buffer, original.byteOffset)
  while (p < original.length) {
    const length = view.getUint32(p)
    const type = new TextDecoder().decode(original.subarray(p + 4, p + 8))
    const whole = original.subarray(p, p + 12 + length)
    if (type === 'IEND') parts.push(...extra)
    if (!/^(tEXt|zTXt|iTXt)$/.test(type)) parts.push(whole)
    p += 12 + length
  }
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let o = 0
  for (const part of parts) {
    out.set(part, o)
    o += part.length
  }
  return out
}

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let o = 0
  for (const part of parts) {
    out.set(part, o)
    o += part.length
  }
  return out
}

describe('detectDiagramFormat', () => {
  it.each([
    ['a.drawio', 'drawio'],
    ['A.DIO', 'dio'],
    ['x/y.Drawio.Svg', 'drawio.svg'],
    ['b.drawio.png', 'drawio.png'],
    ['c.vsdx', 'vsdx'],
    ['c.svg', null],
    ['c.png', null],
    ['c.xml', null],
    ['drawio', null],
  ])('%s → %s', (name, format) => {
    expect(detectDiagramFormat(name)).toBe(format)
  })
})

describe('extracting the original from the three file kinds', () => {
  it.each(['out.drawio', 'out.drawio.svg', 'out.drawio.png'])('%s', (name) => {
    const file = expectOk(openDiagram(name, fixture(name), codec)).file
    expect(file.pages.map((p) => [p.id, p.name])).toEqual([['p1', '1쪽']])
    const shapes = file.state.pages[0]!.cells.filter((cell) => cell.kind === 'vertex')
    expect(shapes.map((cell) => [cell.id, cell.geometry])).toEqual(
      EXPECTED_SHAPES.map((s) => [s.id, { x: s.x, y: s.y, width: s.width, height: s.height }]),
    )
  })

  it('reads the svg page compressed and the drawio page uncompressed', () => {
    expect(
      expectOk(openDiagram('a.drawio.svg', fixture('out.drawio.svg'), codec)).file.pages[0],
    ).toMatchObject({ compressed: true })
    expect(
      expectOk(openDiagram('a.drawio', fixture('out.drawio'), codec)).file.pages[0],
    ).toMatchObject({ compressed: false })
  })

  it('gives the decoded mxfile text for the png', () => {
    const extracted = expectOk(extractDiagramXml('x.drawio.png', fixture('out.drawio.png'), codec))
    expect(extracted.format).toBe('drawio.png')
    expect(extracted.xml).toBe(fixtureText('out.drawio'))
  })

  it('reads a .dio file and a bare mxGraphModel file', () => {
    const bare = model(vertex('v', 'x', 'ellipse;'))
    const file = expectOk(openDiagram('m.dio', utf8(bare), codec)).file
    expect(file.format).toBe('dio')
    expect(file.pages).toHaveLength(1)
    expect(file.state.pages[0]!.cells.map((cell) => cell.id)).toEqual(['0', '1', 'v'])
  })

  it('reads an svg whose content is URI-encoded or base64', () => {
    const xml = mxfile(page('p', 'P', model(vertex('v', 'Hi', 'ellipse;'))))
    const attr = (value: string): string =>
      value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
    const svg = (content: string): Uint8Array =>
      utf8(`<svg xmlns="http://www.w3.org/2000/svg" content="${attr(content)}"><g/></svg>`)
    for (const content of [
      xml,
      encodeURIComponent(xml),
      Buffer.from(encodeURIComponent(xml)).toString('base64'),
    ]) {
      const file = expectOk(openDiagram('s.drawio.svg', svg(content), codec)).file
      expect(file.state.pages[0]!.cells.map((cell) => cell.value)).toContain('Hi')
    }
  })

  it('reads zTXt and iTXt png chunks', () => {
    const xml = mxfile(page('p', 'Z', model()))
    const ztxt = chunk(
      'zTXt',
      concat(utf8('mxfile'), new Uint8Array([0, 0]), deflateSync(encodeURIComponent(xml))),
    )
    expect(expectOk(openDiagram('z.drawio.png', pngWith(ztxt), codec)).file.pages[0]!.name).toBe(
      'Z',
    )
    const itxt = chunk(
      'iTXt',
      concat(utf8('mxfile'), new Uint8Array([0, 0, 0, 0, 0]), utf8(xml.replace('"Z"', '"이"'))),
    )
    expect(expectOk(openDiagram('i.drawio.png', pngWith(itxt), codec)).file.pages[0]!.name).toBe(
      '이',
    )
  })
})

describe('refusals', () => {
  const xml = (text: string): Uint8Array => utf8(text)

  it.each([
    ['plain.svg', xml('<svg/>'), 'unsupported'],
    ['plain.png', fixture('out.drawio.png'), 'unsupported'],
    ['visio.vsdx', xml('PK'), 'unsupported'],
    [
      'nothing.drawio.svg',
      xml('<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>'),
      'no_original',
    ],
    ['nothing.drawio.png', pngWith(), 'no_original'],
    ['bad.drawio.png', xml('not a png'), 'corrupt_image'],
    ['bad.drawio.svg', xml('<svg'), 'not_xml'],
    ['bad.drawio', xml('hello'), 'not_xml'],
    ['bad.drawio', new Uint8Array([0x3c, 0xff, 0xfe]), 'not_xml'],
    [
      'bad.drawio',
      xml('<mxfile><diagram id="p">%%%notbase64%%%</diagram></mxfile>'),
      'decompress_failed',
    ],
    [
      'bad.drawio',
      xml('<mxfile><diagram id="p">aGVsbG8gd29ybGQ=</diagram></mxfile>'),
      'decompress_failed',
    ],
    ['other.drawio', xml('<html><body/></html>'), 'no_diagram'],
    ['empty.drawio', xml('<mxfile host="x"></mxfile>'), 'no_diagram'],
    ['inner.drawio', xml('<mxfile><diagram id="p"><foo/></diagram></mxfile>'), 'no_diagram'],
  ])('%s → %s', (name, bytes, reason) => {
    const result = openDiagram(name, bytes, codec)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe(reason)
      expect(result.message).not.toBe('')
    }
  })

  it('refuses a compressed page whose content is not XML', () => {
    const body = encodeCompressedPage('this is not xml', codec)
    const result = openDiagram('x.drawio', utf8(mxfile(page('p', 'P', body))), codec)
    expect(result).toMatchObject({ ok: false, reason: 'not_xml' })
  })
})
