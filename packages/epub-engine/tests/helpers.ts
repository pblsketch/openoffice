import JSZip from 'jszip'

/** One zip entry: its name, its content and how it is stored. */
export interface FixtureEntry {
  name: string
  data: string | Uint8Array
  store?: boolean
}

export const CONTAINER_XML = (opfPath = 'OEBPS/content.opf'): string =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
  `<rootfiles><rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/></rootfiles>\n` +
  '</container>\n'

/** Builds a zip from entries in the given order; `mimetype` is not added unless listed. */
export async function zipEntries(entries: FixtureEntry[]): Promise<Uint8Array> {
  const zip = new JSZip()
  const date = new Date('2026-01-01T00:00:00Z')
  for (const entry of entries) {
    zip.file(entry.name, entry.data, {
      date,
      createFolders: false,
      compression: entry.store ? 'STORE' : 'DEFLATE',
    })
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

/** A conforming book layout: mimetype first and stored, then container.xml, then the rest. */
export async function buildEpub(
  files: Record<string, string | Uint8Array>,
  opfPath = 'OEBPS/content.opf',
): Promise<Uint8Array> {
  const entries: FixtureEntry[] = [
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    { name: 'META-INF/container.xml', data: CONTAINER_XML(opfPath) },
  ]
  for (const [name, data] of Object.entries(files)) entries.push({ name, data })
  return zipEntries(entries)
}

export const xhtml = (title: string, body: string, head = ''): string =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE html>\n' +
  '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">\n' +
  `<head><title>${title}</title>${head}</head>\n<body>\n${body}\n</body>\n</html>\n`

export interface OpfOptions {
  version?: string
  uniqueIdentifier?: string
  metadata: string
  manifest: string
  spine: string
  spineAttrs?: string
  packageAttrs?: string
}

export const opf = (o: OpfOptions): string =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  `<package xmlns="http://www.idpf.org/2007/opf" version="${o.version ?? '3.0'}" ` +
  `unique-identifier="${o.uniqueIdentifier ?? 'uid'}"${o.packageAttrs ? ` ${o.packageAttrs}` : ''}>\n` +
  '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">\n' +
  `${o.metadata}\n</metadata>\n` +
  `<manifest>\n${o.manifest}\n</manifest>\n` +
  `<spine${o.spineAttrs ? ` ${o.spineAttrs}` : ''}>\n${o.spine}\n</spine>\n` +
  '</package>\n'

/** A small EPUB 3 book with a nav document, two chapters and a stylesheet. */
export function epub3Files(): Record<string, string> {
  return {
    'OEBPS/content.opf': opf({
      metadata: [
        '<dc:identifier id="uid">urn:uuid:12345678-90ab-cdef-1234-567890abcdef</dc:identifier>',
        '<dc:identifier id="isbn">978-0-00-000000-0</dc:identifier>',
        '<dc:title>  A Book &amp; Its Title </dc:title>',
        '<dc:creator>First Author</dc:creator>',
        '<dc:creator>Second Author</dc:creator>',
        '<dc:language>en</dc:language>',
        '<dc:language>fr</dc:language>',
        '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>',
      ].join('\n'),
      manifest: [
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="css" href="styles/book.css" media-type="text/css"/>',
        '<item id="c1" href="text/chapter%201.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml" properties="mathml scripted"/>',
        '<item id="notes" href="text/notes.xhtml" media-type="application/xhtml+xml"/>',
      ].join('\n'),
      spine: [
        '<itemref idref="c1"/>',
        '<itemref idref="c2" properties="page-spread-left"/>',
        '<itemref idref="notes" linear="no"/>',
      ].join('\n'),
      spineAttrs: 'page-progression-direction="ltr"',
    }),
    'OEBPS/nav.xhtml': xhtml(
      'Contents',
      '<nav epub:type="landmarks"><ol><li><a href="text/c2.xhtml">Wrong</a></li></ol></nav>\n' +
        '<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>\n' +
        '<li><a href="text/chapter%201.xhtml">Chapter <em>One</em></a>\n' +
        '<ol><li><a href="text/chapter%201.xhtml#s1">Section 1.1</a></li></ol></li>\n' +
        '<li><a href="text/c2.xhtml#top">Chapter&#160;Two</a></li>\n' +
        '<li><span>Back matter</span><ol><li><a href="text/notes.xhtml">Notes</a></li></ol></li>\n' +
        '<li><a href="https://example.com/">Website</a></li>\n' +
        '</ol></nav>',
    ),
    'OEBPS/styles/book.css': 'body { margin: 0 }\n',
    'OEBPS/text/chapter 1.xhtml': xhtml(
      'One',
      '<h1>One</h1><p id="s1">First chapter.</p>',
      '<link rel="stylesheet" href="../styles/book.css"/>',
    ),
    'OEBPS/text/c2.xhtml': xhtml('Two', '<h1 id="top">Two</h1><p>Second chapter.</p>'),
    'OEBPS/text/notes.xhtml': xhtml('Notes', '<p>Notes.</p>'),
  }
}

/** A small EPUB 2 book with only an NCX table of contents. */
export function epub2Files(): Record<string, string> {
  return {
    'content.opf': opf({
      version: '2.0',
      uniqueIdentifier: 'BookId',
      metadata: [
        '<dc:title>Old Book</dc:title>',
        '<dc:creator opf:role="aut">Old Author</dc:creator>',
        '<dc:language>ja</dc:language>',
        '<dc:identifier id="BookId" opf:scheme="UUID">0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0</dc:identifier>',
        '<meta name="primary-writing-mode" content="vertical-rl"/>',
      ].join('\n'),
      manifest: [
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
        '<item id="ch1" href="ch1.html" media-type="application/xhtml+xml"/>',
        '<item id="ch2" href="ch2.html" media-type="application/xhtml+xml"/>',
      ].join('\n'),
      spine: '<itemref idref="ch1"/>\n<itemref idref="ch2"/>',
      spineAttrs: 'toc="ncx" page-progression-direction="rtl"',
    }),
    'toc.ncx':
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n' +
      '<head/><docTitle><text>Old Book</text></docTitle>\n<navMap>\n' +
      '<navPoint id="n1" playOrder="1"><navLabel><text>Part One</text></navLabel><content src="ch1.html"/>\n' +
      '  <navPoint id="n2" playOrder="2"><navLabel><text>Inner</text></navLabel><content src="ch1.html#inner"/></navPoint>\n' +
      '</navPoint>\n' +
      '<navPoint id="n3" playOrder="3"><navLabel><text> Part Two </text></navLabel><content src="ch2.html"/></navPoint>\n' +
      '</navMap>\n</ncx>\n',
    'ch1.html': xhtml('ch1', '<p>One</p><p id="inner">Inner</p>'),
    'ch2.html': xhtml('ch2', '<p>Two</p>'),
  }
}
