// Writes the Visio test files next to this script:
//   node apps/diagram/tests/fixtures/make-visio-fixtures.mjs
//
// The draw.io release the app ships (v32.6.9) has no Visio export (its
// `VsdxExport` is not in the bundle), and no Visio program was at hand, so the
// files are written here by hand, part by part, as the VSDX format (an Open
// Packaging zip of Visio 2013 XML) lays them out. Only Node is needed.
//
// - visio-shapes.vsdx: page "Plan" with two boxes ("Start", "Finish"), a
//   connector between them and a PNG picture; page "Notes" with one box.
// - visio-metafiles.vsdx: page "Pictures" with four pictures: a PNG, a WMF
//   (draw.io cannot read WMF), a small valid EMF (draw.io converts EMF to SVG
//   on this PC) and a broken EMF (draw.io's converter refuses it). Two of the
//   four are not drawn after the import.
//
// The zip entries carry a fixed date, so running the script again gives the
// same bytes.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync, deflateSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))

// ---- a zip writer (deflate, fixed date) ----

function zip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  // 2026-01-01 00:00 in DOS time
  const dosTime = 0
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1
  for (const [name, content] of entries) {
    const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content)
    const packed = deflateRawSync(data, { level: 9 })
    const nameBytes = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBytes, packed)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(dosTime, 12)
    central.writeUInt16LE(dosDate, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + packed.length
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

// ---- pictures ----

function png(width, height, [r, g, b]) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write(type, 4, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0)
    return Buffer.concat([head, data, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolor
  const rows = []
  for (let y = 0; y < height; y++) {
    rows.push(0)
    for (let x = 0; x < width; x++) rows.push(r, g, b)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A placeable WMF that draws a rectangle. */
function wmf() {
  const records = []
  const record = (fn, params) => {
    const r = Buffer.alloc(6 + params.length * 2)
    r.writeUInt32LE(3 + params.length, 0)
    r.writeUInt16LE(fn, 4)
    params.forEach((p, i) => r.writeInt16LE(p, 6 + i * 2))
    records.push(r)
  }
  record(0x020b, [0, 0]) // SetWindowOrg
  record(0x020c, [100, 100]) // SetWindowExt
  record(0x041b, [90, 90, 10, 10]) // Rectangle (bottom, right, top, left)
  record(0x0000, []) // EOF
  const body = Buffer.concat(records)
  const header = Buffer.alloc(18)
  header.writeUInt16LE(1, 0) // in memory
  header.writeUInt16LE(9, 2)
  header.writeUInt16LE(0x0300, 4)
  header.writeUInt32LE((18 + body.length) / 2, 6)
  header.writeUInt16LE(0, 10)
  header.writeUInt32LE(7, 12) // largest record in words
  header.writeUInt16LE(0, 16)
  const placeable = Buffer.alloc(22)
  placeable.writeUInt32LE(0x9ac6cdd7, 0)
  placeable.writeInt16LE(0, 6)
  placeable.writeInt16LE(0, 8)
  placeable.writeInt16LE(100, 10)
  placeable.writeInt16LE(100, 12)
  placeable.writeUInt16LE(1440, 14)
  let sum = 0
  for (let i = 0; i < 20; i += 2) sum ^= placeable.readUInt16LE(i)
  placeable.writeUInt16LE(sum, 20)
  return Buffer.concat([placeable, header, body])
}

/** An EMF that draws a rectangle. */
function emf() {
  const rect = Buffer.alloc(24)
  rect.writeUInt32LE(43, 0) // EMR_RECTANGLE
  rect.writeUInt32LE(24, 4)
  rect.writeInt32LE(10, 8)
  rect.writeInt32LE(10, 12)
  rect.writeInt32LE(90, 16)
  rect.writeInt32LE(90, 20)
  const eof = Buffer.alloc(20)
  eof.writeUInt32LE(14, 0) // EMR_EOF
  eof.writeUInt32LE(20, 4)
  eof.writeUInt32LE(0, 8)
  eof.writeUInt32LE(16, 12)
  eof.writeUInt32LE(20, 16)
  const header = Buffer.alloc(88)
  header.writeUInt32LE(1, 0) // EMR_HEADER
  header.writeUInt32LE(88, 4)
  header.writeInt32LE(0, 8)
  header.writeInt32LE(0, 12)
  header.writeInt32LE(100, 16)
  header.writeInt32LE(100, 20)
  header.writeInt32LE(0, 24)
  header.writeInt32LE(0, 28)
  header.writeInt32LE(2646, 32) // .01 mm
  header.writeInt32LE(2646, 36)
  header.writeUInt32LE(0x464d4520, 40) // " EMF"
  header.writeUInt32LE(0x10000, 44)
  header.writeUInt32LE(88 + rect.length + eof.length, 48)
  header.writeUInt32LE(3, 52)
  header.writeUInt16LE(1, 56)
  header.writeInt32LE(1024, 72)
  header.writeInt32LE(768, 76)
  header.writeInt32LE(270, 80)
  header.writeInt32LE(203, 84)
  return Buffer.concat([header, rect, eof])
}

// ---- Visio parts ----

const NS =
  'xmlns="http://schemas.microsoft.com/office/visio/2012/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xml:space="preserve"'
const REL = 'http://schemas.microsoft.com/visio/2010/relationships'
const IMAGE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
const XML_HEAD = '<?xml version="1.0" encoding="utf-8"?>\n'

function rels(list) {
  return (
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    list
      .map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`)
      .join('') +
    '</Relationships>'
  )
}

function contentTypes(pageCount, mediaTypes) {
  const pages = Array.from(
    { length: pageCount },
    (_, i) =>
      `<Override PartName="/visio/pages/page${i + 1}.xml" ContentType="application/vnd.ms-visio.page+xml"/>`,
  ).join('')
  const media = mediaTypes.map(
    ([ext, type]) => `<Default Extension="${ext}" ContentType="${type}"/>`,
  )
  return (
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    media.join('') +
    '<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>' +
    '<Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>' +
    pages +
    '</Types>'
  )
}

const DOCUMENT =
  XML_HEAD +
  `<VisioDocument ${NS}>` +
  '<DocumentSettings TopPage="0" DefaultTextStyle="0" DefaultLineStyle="0" DefaultFillStyle="0" DefaultGuideStyle="0"/>' +
  '<Colors><ColorEntry IX="0" RGB="#000000"/><ColorEntry IX="1" RGB="#FFFFFF"/></Colors>' +
  '<FaceNames><FaceName NameU="Calibri" UnicodeRanges="-536859905 -1073732485 9 0" CharSets="536871423 0" Panose="2 15 5 2 2 2 4 3 2 4" Flags="325"/></FaceNames>' +
  '<StyleSheets><StyleSheet ID="0" NameU="No Style" Name="No Style">' +
  '<Cell N="LineWeight" V="0.01041666666666667"/><Cell N="LineColor" V="0"/><Cell N="LinePattern" V="1"/>' +
  '<Cell N="FillForegnd" V="1"/><Cell N="FillBkgnd" V="0"/><Cell N="FillPattern" V="1"/>' +
  '<Cell N="VerticalAlign" V="1"/><Cell N="LeftMargin" V="0.05555555555555555"/><Cell N="RightMargin" V="0.05555555555555555"/>' +
  '<Cell N="TopMargin" V="0.05555555555555555"/><Cell N="BottomMargin" V="0.05555555555555555"/>' +
  '<Section N="Character"><Row IX="0"><Cell N="Font" V="Calibri"/><Cell N="Color" V="0"/><Cell N="Size" V="0.1666666666666667"/></Row></Section>' +
  '<Section N="Paragraph"><Row IX="0"><Cell N="HorzAlign" V="1"/></Row></Section>' +
  '</StyleSheet></StyleSheets>' +
  '</VisioDocument>'

function pagesPart(names) {
  return (
    XML_HEAD +
    `<Pages ${NS}>` +
    names
      .map(
        (name, i) =>
          `<Page ID="${i}" NameU="${name}" Name="${name}"><PageSheet>` +
          '<Cell N="PageWidth" V="8.5"/><Cell N="PageHeight" V="11"/>' +
          '<Cell N="PageScale" V="1" U="IN"/><Cell N="DrawingScale" V="1" U="IN"/>' +
          `</PageSheet><Rel r:id="rId${i + 1}"/></Page>`,
      )
      .join('') +
    '</Pages>'
  )
}

const cell = (n, v) => `<Cell N="${n}" V="${v}"/>`

function placement(pinX, pinY, width, height) {
  return (
    cell('PinX', pinX) +
    cell('PinY', pinY) +
    cell('Width', width) +
    cell('Height', height) +
    cell('LocPinX', width / 2) +
    cell('LocPinY', height / 2) +
    cell('Angle', 0)
  )
}

function box(id, text, pinX, pinY, fill) {
  const w = 1.5
  const h = 0.75
  return (
    `<Shape ID="${id}" NameU="Box ${id}" Name="Box ${id}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">` +
    placement(pinX, pinY, w, h) +
    cell('FillForegnd', fill) +
    cell('LineColor', '#336699') +
    '<Section N="Geometry" IX="0">' +
    cell('NoFill', 0) +
    cell('NoLine', 0) +
    `<Row T="MoveTo" IX="1">${cell('X', 0)}${cell('Y', 0)}</Row>` +
    `<Row T="LineTo" IX="2">${cell('X', w)}${cell('Y', 0)}</Row>` +
    `<Row T="LineTo" IX="3">${cell('X', w)}${cell('Y', h)}</Row>` +
    `<Row T="LineTo" IX="4">${cell('X', 0)}${cell('Y', h)}</Row>` +
    `<Row T="LineTo" IX="5">${cell('X', 0)}${cell('Y', 0)}</Row>` +
    '</Section>' +
    `<Text>${text}</Text>` +
    '</Shape>'
  )
}

function connector(id, beginX, beginY, endX, endY) {
  const width = Math.hypot(endX - beginX, endY - beginY)
  return (
    `<Shape ID="${id}" NameU="Dynamic connector" Name="Dynamic connector" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">` +
    cell('PinX', (beginX + endX) / 2) +
    cell('PinY', (beginY + endY) / 2) +
    cell('Width', width) +
    cell('Height', 0) +
    cell('LocPinX', width / 2) +
    cell('LocPinY', 0) +
    cell('BeginX', beginX) +
    cell('BeginY', beginY) +
    cell('EndX', endX) +
    cell('EndY', endY) +
    cell('ObjType', 2) +
    cell('LineColor', '#336699') +
    cell('EndArrow', 4) +
    '<Section N="Geometry" IX="0">' +
    cell('NoFill', 1) +
    `<Row T="MoveTo" IX="1">${cell('X', 0)}${cell('Y', 0)}</Row>` +
    `<Row T="LineTo" IX="2">${cell('X', width)}${cell('Y', 0)}</Row>` +
    '</Section>' +
    '</Shape>'
  )
}

function picture(id, rel, foreignType, compression, pinX, pinY) {
  const size = 1
  const compressionAttr = compression ? ` CompressionType="${compression}"` : ''
  return (
    `<Shape ID="${id}" NameU="Picture ${id}" Name="Picture ${id}" Type="Foreign" LineStyle="0" FillStyle="0" TextStyle="0">` +
    placement(pinX, pinY, size, size) +
    cell('ImgOffsetX', 0) +
    cell('ImgOffsetY', 0) +
    cell('ImgWidth', size) +
    cell('ImgHeight', size) +
    `<ForeignData ForeignType="${foreignType}"${compressionAttr}><Rel r:id="${rel}"/></ForeignData>` +
    '</Shape>'
  )
}

function page(shapes, connects = '') {
  return (
    XML_HEAD + `<PageContents ${NS}><Shapes>${shapes.join('')}</Shapes>${connects}</PageContents>`
  )
}

function vsdx({ pages, media }) {
  const mediaTypes = [
    ['png', 'image/png'],
    ['emf', 'image/x-emf'],
    ['wmf', 'image/x-wmf'],
  ].filter(([ext]) => media.some(([name]) => name.endsWith(`.${ext}`)))
  const entries = [
    ['[Content_Types].xml', contentTypes(pages.length, mediaTypes)],
    ['_rels/.rels', rels([['rId1', `${REL}/document`, 'visio/document.xml']])],
    ['visio/document.xml', DOCUMENT],
    ['visio/_rels/document.xml.rels', rels([['rId1', `${REL}/pages`, 'pages/pages.xml']])],
    ['visio/pages/pages.xml', pagesPart(pages.map((p) => p.name))],
    [
      'visio/pages/_rels/pages.xml.rels',
      rels(pages.map((_, i) => [`rId${i + 1}`, `${REL}/page`, `page${i + 1}.xml`])),
    ],
  ]
  pages.forEach((p, i) => {
    entries.push([`visio/pages/page${i + 1}.xml`, p.xml])
    if (p.rels.length > 0) {
      entries.push([
        `visio/pages/_rels/page${i + 1}.xml.rels`,
        rels(p.rels.map(([id, target]) => [id, IMAGE_REL, `../media/${target}`])),
      ])
    }
  })
  for (const [name, bytes] of media) entries.push([`visio/media/${name}`, bytes])
  return zip(entries)
}

const connects =
  '<Connects>' +
  '<Connect FromSheet="3" FromCell="BeginX" FromPart="9" ToSheet="1" ToCell="PinX" ToPart="3"/>' +
  '<Connect FromSheet="3" FromCell="EndX" FromPart="12" ToSheet="2" ToCell="PinX" ToPart="3"/>' +
  '</Connects>'

const shapes = vsdx({
  pages: [
    {
      name: 'Plan',
      xml: page(
        [
          box(1, 'Start', 2, 9, '#dae8fc'),
          box(2, 'Finish', 5, 9, '#d5e8d4'),
          connector(3, 2.75, 9, 4.25, 9),
          picture(4, 'rId1', 'Bitmap', 'PNG', 3.5, 7),
        ],
        connects,
      ),
      rels: [['rId1', 'image1.png']],
    },
    { name: 'Notes', xml: page([box(1, 'Second page', 2, 9, '#fff2cc')]), rels: [] },
  ],
  media: [['image1.png', png(8, 8, [220, 40, 40])]],
})

const metafiles = vsdx({
  pages: [
    {
      name: 'Pictures',
      xml: page([
        box(1, 'Pictures', 2, 10, '#dae8fc'),
        picture(2, 'rId1', 'Bitmap', 'PNG', 1.5, 8),
        picture(3, 'rId2', 'MetaFile', null, 3, 8),
        picture(4, 'rId3', 'EnhMetaFile', null, 4.5, 8),
        picture(5, 'rId4', 'EnhMetaFile', null, 6, 8),
      ]),
      rels: [
        ['rId1', 'image1.png'],
        ['rId2', 'image2.wmf'],
        ['rId3', 'image3.emf'],
        ['rId4', 'image4.emf'],
      ],
    },
  ],
  media: [
    ['image1.png', png(8, 8, [40, 120, 220])],
    ['image2.wmf', wmf()],
    ['image3.emf', emf()],
    ['image4.emf', Buffer.from('this is not an EMF picture', 'ascii')],
  ],
})

writeFileSync(join(here, 'visio-shapes.vsdx'), shapes)
writeFileSync(join(here, 'visio-metafiles.vsdx'), metafiles)
console.log('wrote visio-shapes.vsdx and visio-metafiles.vsdx')
