import { describe, expect, it } from 'vitest'
import { openEpub } from '../src/open'
import type { EpubBook, EpubOpenResult } from '../src/types'
import { ADOBE_FONT_OBFUSCATION, IDPF_FONT_OBFUSCATION, obfuscateFont } from '../src/fonts'
import { buildEpub, CONTAINER_XML, epub2Files, epub3Files, opf, xhtml, zipEntries } from './helpers'

async function open(bytes: Uint8Array): Promise<EpubBook> {
  const result = await openEpub(bytes)
  if (!result.ok) throw new Error(`expected a book, got ${result.reason}: ${result.detail}`)
  return result.book
}

function refusal(result: EpubOpenResult): string {
  if (result.ok) throw new Error('expected a refusal')
  expect(result.detail).toEqual(expect.any(String))
  return result.reason
}

const text = async (book: EpubBook, path: string): Promise<string | undefined> =>
  (await book.readText(path))?.text

describe('openEpub: EPUB 3', () => {
  it('reads the metadata', async () => {
    const book = await open(await buildEpub(epub3Files()))
    expect(book.opfPath).toBe('OEBPS/content.opf')
    expect(book.version).toBe('3')
    expect(book.packageVersion).toBe('3.0')
    expect(book.metadata.title).toBe('A Book & Its Title')
    expect(book.metadata.titles).toEqual(['A Book & Its Title'])
    expect(book.metadata.creators).toEqual(['First Author', 'Second Author'])
    expect(book.metadata.languages).toEqual(['en', 'fr'])
    expect(book.metadata.identifiers).toEqual([
      { id: 'uid', value: 'urn:uuid:12345678-90ab-cdef-1234-567890abcdef', scheme: null },
      { id: 'isbn', value: '978-0-00-000000-0', scheme: null },
    ])
    expect(book.metadata.uniqueIdentifier).toBe('urn:uuid:12345678-90ab-cdef-1234-567890abcdef')
    expect(book.metadata.layout).toBe('reflowable')
    expect(book.metadata.primaryWritingMode).toBeNull()
    expect(book.fixedLayout).toBe(false)
    expect(book.verticalWriting).toBe(false)
  })

  it('reads the manifest with resolved, decoded paths', async () => {
    const book = await open(await buildEpub(epub3Files()))
    expect(book.manifest.map((m) => [m.id, m.path, m.mediaType, m.properties])).toEqual([
      ['nav', 'OEBPS/nav.xhtml', 'application/xhtml+xml', ['nav']],
      ['css', 'OEBPS/styles/book.css', 'text/css', []],
      ['c1', 'OEBPS/text/chapter 1.xhtml', 'application/xhtml+xml', []],
      ['c2', 'OEBPS/text/c2.xhtml', 'application/xhtml+xml', ['mathml', 'scripted']],
      ['notes', 'OEBPS/text/notes.xhtml', 'application/xhtml+xml', []],
    ])
    expect(book.manifest[2]!.href).toBe('text/chapter%201.xhtml')
  })

  it('reads the spine in order with linear and properties', async () => {
    const book = await open(await buildEpub(epub3Files()))
    expect(book.spine.pageProgressionDirection).toBe('ltr')
    expect(
      book.spine.items.map((s) => [s.index, s.idref, s.path, s.linear, s.properties, s.layout]),
    ).toEqual([
      [0, 'c1', 'OEBPS/text/chapter 1.xhtml', true, [], null],
      [1, 'c2', 'OEBPS/text/c2.xhtml', true, ['page-spread-left'], null],
      [2, 'notes', 'OEBPS/text/notes.xhtml', false, [], null],
    ])
    expect(book.spine.items.every((s) => !s.fixedLayout)).toBe(true)
  })

  it('takes the table of contents from the nav toc', async () => {
    const book = await open(await buildEpub(epub3Files()))
    expect(book.toc.source).toBe('nav')
    expect(book.toc.entries).toEqual([
      {
        title: 'Chapter One',
        path: 'OEBPS/text/chapter 1.xhtml',
        fragment: null,
        spineIndex: 0,
        depth: 1,
      },
      {
        title: 'Section 1.1',
        path: 'OEBPS/text/chapter 1.xhtml',
        fragment: 's1',
        spineIndex: 0,
        depth: 2,
      },
      {
        title: 'Chapter\u00a0Two',
        path: 'OEBPS/text/c2.xhtml',
        fragment: 'top',
        spineIndex: 1,
        depth: 1,
      },
      { title: 'Back matter', path: null, fragment: null, spineIndex: null, depth: 1 },
      { title: 'Notes', path: 'OEBPS/text/notes.xhtml', fragment: null, spineIndex: 2, depth: 2 },
      { title: 'Website', path: null, fragment: null, spineIndex: null, depth: 1 },
    ])
  })

  it('reads entries lazily, as bytes or decoded text', async () => {
    const book = await open(await buildEpub(epub3Files()))
    expect(book.has('OEBPS/text/c2.xhtml')).toBe(true)
    expect(book.has('OEBPS/text/missing.xhtml')).toBe(false)
    expect(await text(book, 'OEBPS/text/c2.xhtml')).toContain('Second chapter.')
    const bytes = await book.read('OEBPS/styles/book.css')
    expect(new TextDecoder().decode(bytes!)).toBe('body { margin: 0 }\n')
    // each read is a fresh copy
    bytes![0] = 0
    expect(new TextDecoder().decode((await book.read('OEBPS/styles/book.css'))!)).toBe(
      'body { margin: 0 }\n',
    )
    expect(await book.read('OEBPS/missing')).toBeNull()
    expect(book.entryNames).toEqual([
      'mimetype',
      'META-INF/container.xml',
      'OEBPS/content.opf',
      'OEBPS/nav.xhtml',
      'OEBPS/styles/book.css',
      'OEBPS/text/chapter 1.xhtml',
      'OEBPS/text/c2.xhtml',
      'OEBPS/text/notes.xhtml',
    ])
  })

  it('does not change or hold on to the caller bytes', async () => {
    const bytes = await buildEpub(epub3Files())
    const copy = new Uint8Array(bytes)
    const book = await open(bytes)
    bytes.fill(0)
    expect(await text(book, 'OEBPS/text/c2.xhtml')).toContain('Second chapter.')
    expect(copy).not.toEqual(bytes)
  })

  it('reads from the caller bytes without a copy when it is handed them', async () => {
    const bytes = await buildEpub(epub3Files())
    const opened = await openEpub(bytes, { takeOwnership: true })
    if (!opened.ok) throw new Error(opened.reason)
    expect(new TextDecoder().decode((await opened.book.read('mimetype'))!)).toBe(
      'application/epub+zip',
    )
    // the stored mimetype entry is read straight from the handed-over buffer
    bytes.fill(0)
    expect(await opened.book.read('mimetype')).toEqual(new Uint8Array(20))
  })

  it('takes over a view of a larger buffer without reading past it', async () => {
    const book = await buildEpub(epub3Files())
    const big = new Uint8Array(book.length + 16)
    big.set(book, 8)
    const opened = await openEpub(big.subarray(8, 8 + book.length), { takeOwnership: true })
    expect(opened.ok && (await text(opened.book, 'OEBPS/text/c2.xhtml'))).toContain(
      'Second chapter.',
    )
  })

  it('keeps a BOM and reports the encoding of a text entry', async () => {
    const files = epub3Files()
    const utf16 = (s: string): Uint8Array => {
      const out = new Uint8Array(2 + s.length * 2)
      out[0] = 0xff
      out[1] = 0xfe
      for (let i = 0; i < s.length; i++) {
        out[2 + 2 * i] = s.charCodeAt(i) & 0xff
        out[3 + 2 * i] = s.charCodeAt(i) >> 8
      }
      return out
    }
    const bytes = await buildEpub({
      ...files,
      'OEBPS/text/c2.xhtml': utf16('<p>wide</p>'),
      'OEBPS/text/notes.xhtml': '\ufeff<p>bom</p>',
    })
    const book = await open(bytes)
    expect(await book.readText('OEBPS/text/c2.xhtml')).toEqual({
      text: '\ufeff<p>wide</p>',
      encoding: 'utf-16le',
      valid: true,
    })
    expect(await book.readText('OEBPS/text/notes.xhtml')).toEqual({
      text: '\ufeff<p>bom</p>',
      encoding: 'utf-8',
      valid: true,
    })
  })

  it('flags text that is not valid UTF-8', async () => {
    const bytes = await buildEpub({
      ...epub3Files(),
      'OEBPS/text/notes.xhtml': new Uint8Array([0x3c, 0x70, 0x3e, 0xff, 0xfe, 0x41]),
    })
    const decoded = await (await open(bytes)).readText('OEBPS/text/notes.xhtml')
    expect(decoded?.valid).toBe(false)
    expect(decoded?.encoding).toBe('utf-8')
  })
})

describe('openEpub: EPUB 2', () => {
  it('reads an NCX-only book at the zip root', async () => {
    const book = await open(await buildEpub(epub2Files(), 'content.opf'))
    expect(book.version).toBe('2')
    expect(book.metadata.title).toBe('Old Book')
    expect(book.metadata.creators).toEqual(['Old Author'])
    expect(book.metadata.identifiers).toEqual([
      { id: 'BookId', value: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0', scheme: 'UUID' },
    ])
    expect(book.metadata.uniqueIdentifier).toBe('0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0')
    expect(book.metadata.primaryWritingMode).toBe('vertical-rl')
    expect(book.verticalWriting).toBe(true)
    expect(book.spine.pageProgressionDirection).toBe('rtl')
    expect(book.spine.tocId).toBe('ncx')
    expect(book.toc.source).toBe('ncx')
    expect(book.toc.entries).toEqual([
      { title: 'Part One', path: 'ch1.html', fragment: null, spineIndex: 0, depth: 1 },
      { title: 'Inner', path: 'ch1.html', fragment: 'inner', spineIndex: 0, depth: 2 },
      { title: 'Part Two', path: 'ch2.html', fragment: null, spineIndex: 1, depth: 1 },
    ])
  })

  it('finds the NCX by media type when the spine does not name it', async () => {
    const files = epub2Files()
    files['content.opf'] = files['content.opf']!.replace(' toc="ncx"', '')
    const book = await open(await buildEpub(files, 'content.opf'))
    expect(book.toc.source).toBe('ncx')
    expect(book.toc.entries).toHaveLength(3)
  })

  it('reads a metadata block without the dc namespace declared', async () => {
    const files = epub2Files()
    files['content.opf'] = files['content.opf']!.replace(
      ' xmlns:dc="http://purl.org/dc/elements/1.1/"',
      '',
    )
    const book = await open(await buildEpub(files, 'content.opf'))
    expect(book.metadata.title).toBe('Old Book')
    expect(book.metadata.languages).toEqual(['ja'])
  })
})

describe('openEpub: no table of contents', () => {
  it('builds one from the spine, with the first heading or the file name', async () => {
    const bytes = await buildEpub({
      'OEBPS/content.opf': opf({
        metadata:
          '<dc:identifier id="uid">x</dc:identifier><dc:title>T</dc:title><dc:language>en</dc:language>',
        manifest: [
          '<item id="a" href="a.xhtml" media-type="application/xhtml+xml"/>',
          '<item id="b" href="sub/b%20c.xhtml" media-type="application/xhtml+xml"/>',
          '<item id="c" href="broken.xhtml" media-type="application/xhtml+xml"/>',
        ].join('\n'),
        spine: '<itemref idref="a"/><itemref idref="b"/><itemref idref="c" linear="no"/>',
      }),
      'OEBPS/a.xhtml': xhtml(
        'a',
        '<div><p>intro</p><h2>  The <b>first</b>\n heading </h2><h1>Later</h1></div>',
      ),
      'OEBPS/sub/b c.xhtml': xhtml('b', '<p>no heading here</p>'),
      'OEBPS/broken.xhtml': '<html><body><p>open<h3>Broken &nbsp;heading</h3></body>',
    })
    const book = await open(bytes)
    expect(book.toc.source).toBe('spine')
    expect(book.toc.entries).toEqual([
      {
        title: 'The first heading',
        path: 'OEBPS/a.xhtml',
        fragment: null,
        spineIndex: 0,
        depth: 1,
      },
      { title: 'b c.xhtml', path: 'OEBPS/sub/b c.xhtml', fragment: null, spineIndex: 1, depth: 1 },
      {
        title: 'Broken \u00a0heading',
        path: 'OEBPS/broken.xhtml',
        fragment: null,
        spineIndex: 2,
        depth: 1,
      },
    ])
  })

  it('falls back to the NCX when the nav has no toc entries', async () => {
    const files = epub3Files()
    files['OEBPS/nav.xhtml'] = xhtml('nav', '<nav epub:type="toc"><ol></ol></nav>')
    files['OEBPS/content.opf'] = files['OEBPS/content.opf']!.replace(
      '<item id="css"',
      '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n<item id="css"',
    )
    files['OEBPS/toc.ncx'] =
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>' +
      '<navPoint><navLabel><text>From NCX</text></navLabel><content src="text/c2.xhtml"/></navPoint>' +
      '</navMap></ncx>'
    const book = await open(await buildEpub(files))
    expect(book.toc.source).toBe('ncx')
    expect(book.toc.entries.map((e) => e.title)).toEqual(['From NCX'])
  })

  it('reads a nav document that only an HTML parser accepts', async () => {
    const files = epub3Files()
    files['OEBPS/nav.xhtml'] =
      '<html><body><nav epub:type="toc"><ol><li><a href="text/c2.xhtml">Two&nbsp;&hellip;</a></ol></nav></body></html>'
    const book = await open(await buildEpub(files))
    expect(book.toc.source).toBe('nav')
    expect(book.toc.entries).toEqual([
      {
        title: 'Two\u00a0\u2026',
        path: 'OEBPS/text/c2.xhtml',
        fragment: null,
        spineIndex: 1,
        depth: 1,
      },
    ])
  })
})

describe('openEpub: refusals', () => {
  it('damaged: not a zip at all', async () => {
    expect(refusal(await openEpub(new TextEncoder().encode('just some text')))).toBe('damaged')
    expect(refusal(await openEpub(new Uint8Array(0)))).toBe('damaged')
  })

  it('damaged: a truncated archive', async () => {
    const bytes = await buildEpub(epub3Files())
    expect(refusal(await openEpub(bytes.subarray(0, bytes.length - 40)))).toBe('damaged')
  })

  it('too-large: over the zip limits', async () => {
    const bytes = await buildEpub(epub3Files())
    const tight = { maxParts: 3, maxPartBytes: 1 << 20, maxTotalBytes: 1 << 20 }
    expect(refusal(await openEpub(bytes, { limits: tight }))).toBe('too-large')
    const small = { maxParts: 100, maxPartBytes: 64, maxTotalBytes: 1 << 20 }
    expect(refusal(await openEpub(bytes, { limits: small }))).toBe('too-large')
  })

  it('too-large: a part that inflates past its declared size', async () => {
    const big = 'A'.repeat(200_000)
    const bytes = await buildEpub({ ...epub3Files(), 'OEBPS/big.txt': big })
    // forge the central directory's declared size of the big entry down to 10
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const name = new TextEncoder().encode('OEBPS/big.txt')
    for (let i = 0; i + 46 < bytes.length; i++) {
      if (view.getUint32(i, true) !== 0x02014b50) continue
      const nameLen = view.getUint16(i + 28, true)
      const entryName = bytes.subarray(i + 46, i + 46 + nameLen)
      if (nameLen === name.length && entryName.every((b, k) => b === name[k])) {
        view.setUint32(i + 24, 10, true)
      }
    }
    expect(refusal(await openEpub(bytes))).toBe('too-large')
  })

  it('not-epub: no container.xml', async () => {
    const bytes = await zipEntries([
      { name: 'mimetype', data: 'application/epub+zip', store: true },
      { name: 'OEBPS/content.opf', data: epub3Files()['OEBPS/content.opf']! },
    ])
    expect(refusal(await openEpub(bytes))).toBe('not-epub')
  })

  it('not-epub: container.xml that is not XML or names no package', async () => {
    const files = epub3Files()
    const broken = await zipEntries([
      { name: 'META-INF/container.xml', data: '<container><rootfiles>' },
      ...Object.entries(files).map(([name, data]) => ({ name, data })),
    ])
    expect(refusal(await openEpub(broken))).toBe('not-epub')
    const empty = await zipEntries([
      {
        name: 'META-INF/container.xml',
        data: '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles/></container>',
      },
      ...Object.entries(files).map(([name, data]) => ({ name, data })),
    ])
    expect(refusal(await openEpub(empty))).toBe('not-epub')
  })

  it('not-epub: container.xml points at a missing package', async () => {
    const bytes = await buildEpub(epub3Files(), 'OEBPS/missing.opf')
    expect(refusal(await openEpub(bytes))).toBe('not-epub')
  })

  it('not-epub: a package document that is not XML', async () => {
    const files = epub3Files()
    files['OEBPS/content.opf'] = files['OEBPS/content.opf']!.replace('</manifest>', '')
    expect(refusal(await openEpub(await buildEpub(files)))).toBe('not-epub')
  })

  it('not-epub: a package document without a manifest or spine', async () => {
    const noSpine = epub3Files()
    noSpine['OEBPS/content.opf'] = noSpine['OEBPS/content.opf']!.replace(
      /<spine[\s\S]*<\/spine>/,
      '',
    )
    expect(refusal(await openEpub(await buildEpub(noSpine)))).toBe('not-epub')
    const noManifest = epub3Files()
    noManifest['OEBPS/content.opf'] = noManifest['OEBPS/content.opf']!.replace(
      /<manifest>[\s\S]*<\/manifest>/,
      '',
    )
    expect(refusal(await openEpub(await buildEpub(noManifest)))).toBe('not-epub')
  })

  it('not-epub: a spine with no chapter in the archive', async () => {
    const files = epub3Files()
    files['OEBPS/content.opf'] = files['OEBPS/content.opf']!.replace(
      /<spine([^>]*)>[\s\S]*<\/spine>/,
      '<spine$1><itemref idref="nowhere"/></spine>',
    )
    expect(refusal(await openEpub(await buildEpub(files)))).toBe('not-epub')
  })

  it('drm: rights.xml is present', async () => {
    const bytes = await buildEpub({ ...epub3Files(), 'META-INF/rights.xml': '<rights/>' })
    expect(refusal(await openEpub(bytes))).toBe('drm')
  })

  it('drm: encryption.xml names a real cipher', async () => {
    const bytes = await buildEpub({
      ...epub3Files(),
      'META-INF/encryption.xml': encryptionXml([
        ['http://www.idpf.org/2008/embedding', 'OEBPS/fonts/a.otf'],
        ['http://www.w3.org/2001/04/xmlenc#aes128-cbc', 'OEBPS/text/c2.xhtml'],
      ]),
    })
    expect(refusal(await openEpub(bytes))).toBe('drm')
  })

  it('drm: an encrypted item with no method', async () => {
    const bytes = await buildEpub({
      ...epub3Files(),
      'META-INF/encryption.xml':
        '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">' +
        '<enc:EncryptedData><enc:CipherData><enc:CipherReference URI="OEBPS/text/c2.xhtml"/></enc:CipherData></enc:EncryptedData>' +
        '</encryption>',
    })
    expect(refusal(await openEpub(bytes))).toBe('drm')
  })

  it('checks the container before DRM', async () => {
    const bytes = await zipEntries([
      { name: 'META-INF/rights.xml', data: '<rights/>' },
      { name: 'OEBPS/content.opf', data: epub3Files()['OEBPS/content.opf']! },
    ])
    expect(refusal(await openEpub(bytes))).toBe('not-epub')
  })

  it('opens a book whose mimetype entry is missing, late or compressed', async () => {
    const files = epub3Files()
    const rest = Object.entries(files).map(([name, data]) => ({ name, data }))
    const missing = await zipEntries([
      { name: 'META-INF/container.xml', data: CONTAINER_XML() },
      ...rest,
    ])
    expect((await openEpub(missing)).ok).toBe(true)
    const late = await zipEntries([
      { name: 'META-INF/container.xml', data: CONTAINER_XML() },
      ...rest,
      { name: 'mimetype', data: 'application/epub+zip' },
    ])
    expect((await openEpub(late)).ok).toBe(true)
  })
})

function encryptionXml(items: [algorithm: string, uri: string][]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">\n' +
    items
      .map(
        ([algorithm, uri]) =>
          `<enc:EncryptedData><enc:EncryptionMethod Algorithm="${algorithm}"/>` +
          `<enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData></enc:EncryptedData>\n`,
      )
      .join('') +
    '</encryption>\n'
  )
}

describe('openEpub: fixed layout', () => {
  it('marks the whole book from the global rendition:layout', async () => {
    const files = epub3Files()
    files['OEBPS/content.opf'] = files['OEBPS/content.opf']!.replace(
      '<dc:language>en</dc:language>',
      '<dc:language>en</dc:language><meta property="rendition:layout">pre-paginated</meta>',
    )
    const book = await open(await buildEpub(files))
    expect(book.metadata.layout).toBe('pre-paginated')
    expect(book.fixedLayout).toBe(true)
    expect(book.spine.items.every((s) => s.fixedLayout)).toBe(true)
  })

  it('marks only the itemrefs that say so', async () => {
    const files = epub3Files()
    files['OEBPS/content.opf'] = files['OEBPS/content.opf']!.replace(
      '<itemref idref="c2" properties="page-spread-left"/>',
      '<itemref idref="c2" properties="page-spread-left rendition:layout-pre-paginated"/>',
    )
    const book = await open(await buildEpub(files))
    expect(book.fixedLayout).toBe(false)
    expect(book.spine.items.map((s) => [s.layout, s.fixedLayout])).toEqual([
      [null, false],
      ['pre-paginated', true],
      [null, false],
    ])
  })

  it('keeps a whole fixed-layout book read-only even where an itemref says reflowable', async () => {
    const files = epub3Files()
    files['OEBPS/content.opf'] = files['OEBPS/content.opf']!.replace(
      '<dc:language>en</dc:language>',
      '<dc:language>en</dc:language><meta property="rendition:layout"> pre-paginated </meta>',
    ).replace(
      '<itemref idref="c1"/>',
      '<itemref idref="c1" properties="rendition:layout-reflowable"/>',
    )
    const book = await open(await buildEpub(files))
    expect(book.spine.items[0]!.layout).toBe('reflowable')
    expect(book.spine.items[0]!.fixedLayout).toBe(true)
  })
})

describe('openEpub: paths that try to leave the zip', () => {
  it('stops `..` at the root and keeps scheme targets out of the zip', async () => {
    const files = epub3Files()
    files['OEBPS/content.opf'] = files['OEBPS/content.opf']!.replace(
      '<item id="css"',
      [
        '<item id="esc" href="../../../../secret.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="gone" href="../../etc/passwd" media-type="text/plain"/>',
        '<item id="remote" href="https://example.com/font.otf" media-type="font/otf"/>',
        '<item id="file" href="file:///C:/Windows/win.ini" media-type="text/plain"/>',
        '<item id="css"',
      ].join('\n'),
    )
    files['secret.xhtml'] = xhtml('s', '<p>root level</p>')
    const book = await open(await buildEpub(files))
    const byId = new Map(book.manifest.map((m) => [m.id, m]))
    expect(byId.get('esc')!.path).toBe('secret.xhtml')
    expect(byId.get('gone')!.path).toBe('etc/passwd')
    expect(byId.get('remote')!.path).toBeNull()
    expect(byId.get('file')!.path).toBeNull()
    expect(await book.read('../../secret.xhtml')).toEqual(await book.read('secret.xhtml'))
    expect(await book.read('etc/passwd')).toBeNull()
  })

  it('drops spine items whose target is remote or missing', async () => {
    const files = epub3Files()
    files['OEBPS/content.opf'] = files['OEBPS/content.opf']!.replace(
      '<item id="css"',
      '<item id="remote" href="https://example.com/c.xhtml" media-type="application/xhtml+xml"/>\n' +
        '<item id="lost" href="lost.xhtml" media-type="application/xhtml+xml"/>\n<item id="css"',
    ).replace(
      '<itemref idref="c1"/>',
      '<itemref idref="remote"/><itemref idref="c1"/><itemref idref="lost"/><itemref idref="ghost"/>',
    )
    const book = await open(await buildEpub(files))
    expect(book.spine.items.map((s) => [s.index, s.idref])).toEqual([
      [0, 'c1'],
      [1, 'c2'],
      [2, 'notes'],
    ])
  })

  it('finds an entry whose manifest href differs only in letter case', async () => {
    const files = epub3Files()
    files['OEBPS/content.opf'] = files['OEBPS/content.opf']!.replace(
      'href="text/c2.xhtml"',
      'href="Text/C2.xhtml"',
    )
    const book = await open(await buildEpub(files))
    expect(book.spine.items[1]!.path).toBe('OEBPS/text/c2.xhtml')
  })
})

describe('openEpub: obfuscated fonts', () => {
  const font = new Uint8Array(3000).map((_, i) => (i * 13 + 5) & 0xff)
  const uid = 'urn:uuid:12345678-90ab-cdef-1234-567890abcdef'

  for (const algorithm of [IDPF_FONT_OBFUSCATION, ADOBE_FONT_OBFUSCATION] as const) {
    it(`decodes ${algorithm} for rendering and keeps the stored bytes`, async () => {
      const files: Record<string, string | Uint8Array> = { ...epub3Files() }
      files['OEBPS/content.opf'] = (files['OEBPS/content.opf'] as string).replace(
        '<item id="css"',
        '<item id="font" href="fonts/a.otf" media-type="font/otf"/>\n<item id="css"',
      )
      const hidden = obfuscateFont(font, algorithm, uid)!
      files['OEBPS/fonts/a.otf'] = hidden
      files['META-INF/encryption.xml'] = encryptionXml([[algorithm, 'OEBPS/fonts/a.otf']])
      const book = await open(await buildEpub(files))
      expect(book.obfuscatedFonts).toEqual([{ path: 'OEBPS/fonts/a.otf', algorithm }])
      expect(await book.read('OEBPS/fonts/a.otf')).toEqual(hidden)
      expect(await book.readForRendering('OEBPS/fonts/a.otf')).toEqual(font)
      expect(await book.readForRendering('OEBPS/styles/book.css')).toEqual(
        await book.read('OEBPS/styles/book.css'),
      )
    })
  }

  it('uses a UUID identifier for the Adobe key when the unique one is not a UUID', async () => {
    const files: Record<string, string | Uint8Array> = { ...epub3Files() }
    files['OEBPS/content.opf'] = (files['OEBPS/content.opf'] as string)
      .replace('unique-identifier="uid"', 'unique-identifier="isbn"')
      .replace(
        '<item id="css"',
        '<item id="font" href="fonts/a.otf" media-type="font/otf"/>\n<item id="css"',
      )
    files['OEBPS/fonts/a.otf'] = obfuscateFont(font, ADOBE_FONT_OBFUSCATION, uid)!
    files['META-INF/encryption.xml'] = encryptionXml([
      [ADOBE_FONT_OBFUSCATION, 'OEBPS/fonts/a.otf'],
    ])
    const book = await open(await buildEpub(files))
    expect(book.metadata.uniqueIdentifier).toBe('978-0-00-000000-0')
    expect(await book.readForRendering('OEBPS/fonts/a.otf')).toEqual(font)
  })

  it('resolves a cipher reference written relative to META-INF', async () => {
    const files: Record<string, string | Uint8Array> = { ...epub3Files() }
    files['OEBPS/fonts/a.otf'] = obfuscateFont(font, IDPF_FONT_OBFUSCATION, uid)!
    files['META-INF/encryption.xml'] = encryptionXml([
      [IDPF_FONT_OBFUSCATION, '../OEBPS/fonts/a.otf'],
    ])
    const book = await open(await buildEpub(files))
    expect(book.obfuscatedFonts.map((f) => f.path)).toEqual(['OEBPS/fonts/a.otf'])
    expect(await book.readForRendering('OEBPS/fonts/a.otf')).toEqual(font)
  })
})

describe('openEpub: vertical writing', () => {
  it('detects vertical writing from the book CSS', async () => {
    const files = epub3Files()
    files['OEBPS/styles/book.css'] = 'html { -epub-writing-mode: vertical-rl; }'
    expect((await open(await buildEpub(files))).verticalWriting).toBe(true)
  })

  it('detects vertical writing from the primary-writing-mode meta', async () => {
    const files = epub3Files()
    files['OEBPS/content.opf'] = files['OEBPS/content.opf']!.replace(
      '<dc:language>en</dc:language>',
      '<dc:language>en</dc:language><meta name="primary-writing-mode" content="vertical-rl"/>',
    )
    const book = await open(await buildEpub(files))
    expect(book.metadata.primaryWritingMode).toBe('vertical-rl')
    expect(book.verticalWriting).toBe(true)
  })

  it('a horizontal primary-writing-mode with horizontal CSS is not vertical', async () => {
    const files = epub3Files()
    files['OEBPS/content.opf'] = files['OEBPS/content.opf']!.replace(
      '<dc:language>en</dc:language>',
      '<dc:language>en</dc:language><meta name="primary-writing-mode" content="horizontal-rl"/>',
    )
    expect((await open(await buildEpub(files))).verticalWriting).toBe(false)
  })
})

describe('openEpub: more shapes', () => {
  it('opens a book with deep chapter folders and relative links between them', async () => {
    const bytes = await buildEpub(
      {
        'a/b/c/package.opf': opf({
          metadata:
            '<dc:identifier id="uid">deep</dc:identifier><dc:title>Deep</dc:title><dc:language>ko</dc:language>',
          manifest: [
            '<item id="nav" href="../../nav/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
            '<item id="c1" href="d/e/f/one.xhtml" media-type="application/xhtml+xml"/>',
          ].join('\n'),
          spine: '<itemref idref="c1"/>',
        }),
        'a/nav/nav.xhtml': xhtml(
          'nav',
          '<nav epub:type="toc"><ol><li><a href="../b/c/d/e/f/one.xhtml#p">One</a></li></ol></nav>',
        ),
        'a/b/c/d/e/f/one.xhtml': xhtml('one', '<p id="p">deep</p>'),
      },
      'a/b/c/package.opf',
    )
    const book = await open(bytes)
    expect(book.opfPath).toBe('a/b/c/package.opf')
    expect(book.spine.items[0]!.path).toBe('a/b/c/d/e/f/one.xhtml')
    expect(book.toc.entries).toEqual([
      { title: 'One', path: 'a/b/c/d/e/f/one.xhtml', fragment: 'p', spineIndex: 0, depth: 1 },
    ])
  })

  it('takes the title refined as main', async () => {
    const files = epub3Files()
    files['OEBPS/content.opf'] = files['OEBPS/content.opf']!.replace(
      '<dc:title>  A Book &amp; Its Title </dc:title>',
      '<dc:title id="sub">Subtitle</dc:title><dc:title id="t">Main</dc:title>' +
        '<meta refines="#t" property="title-type">main</meta>',
    )
    const book = await open(await buildEpub(files))
    expect(book.metadata.title).toBe('Main')
    expect(book.metadata.titles).toEqual(['Subtitle', 'Main'])
  })

  it('not-epub: encryption.xml that is not XML', async () => {
    const bytes = await buildEpub({ ...epub3Files(), 'META-INF/encryption.xml': '<encryption>' })
    expect(refusal(await openEpub(bytes))).toBe('not-epub')
  })

  it('damaged: deflate data that does not inflate', async () => {
    const bytes = await buildEpub({ ...epub3Files(), 'OEBPS/big.txt': 'B'.repeat(5000) })
    const name = new TextEncoder().encode('OEBPS/big.txt')
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let i = 0; i + 30 < bytes.length; i++) {
      if (view.getUint32(i, true) !== 0x04034b50) continue
      const nameLen = view.getUint16(i + 26, true)
      const extraLen = view.getUint16(i + 28, true)
      const entryName = bytes.subarray(i + 30, i + 30 + nameLen)
      if (nameLen !== name.length || !entryName.every((b, k) => b === name[k])) continue
      // a reserved deflate block type (BTYPE=11) makes the stream invalid
      bytes[i + 30 + nameLen + extraLen] = 0xff
    }
    expect(refusal(await openEpub(bytes))).toBe('damaged')
  })
})
