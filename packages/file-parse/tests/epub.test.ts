import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { isAttachableExt, parseFileToText } from '../src'
import { writeFixture } from './helpers/fixtures'

const CONTAINER = (opfPath: string): string =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
  `<rootfiles><rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/></rootfiles>` +
  '</container>\n'

const xhtml = (title: string, body: string): string =>
  '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n' +
  '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">\n' +
  `<head><title>${title}</title><style>p { margin: 0 }</style></head>\n<body>\n${body}\n</body>\n</html>\n`

const opf = (version: string, manifest: string[], spine: string[], spineAttrs = ''): string =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  `<package xmlns="http://www.idpf.org/2007/opf" version="${version}" unique-identifier="uid">\n` +
  '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
  '<dc:identifier id="uid">urn:uuid:12345678-90ab-cdef-1234-567890abcdef</dc:identifier>' +
  '<dc:title>Test Book</dc:title><dc:language>en</dc:language></metadata>\n' +
  `<manifest>\n${manifest.join('\n')}\n</manifest>\n` +
  `<spine${spineAttrs ? ` ${spineAttrs}` : ''}>\n${spine.join('\n')}\n</spine>\n</package>\n`

/** A conforming layout: `mimetype` first and stored, then the container, then the rest. */
async function buildEpub(
  files: Record<string, string | Uint8Array>,
  opfPath = 'OEBPS/content.opf',
  { mimetype = true }: { mimetype?: boolean } = {},
): Promise<Uint8Array> {
  const zip = new JSZip()
  const date = new Date('2026-01-01T00:00:00Z')
  if (mimetype) zip.file('mimetype', 'application/epub+zip', { date, compression: 'STORE' })
  zip.file('META-INF/container.xml', CONTAINER(opfPath), { date })
  for (const [name, data] of Object.entries(files)) zip.file(name, data, { date })
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

/** EPUB 3: the manifest lists chapters in a different order than the spine reads them. */
function epub3Files(): Record<string, string> {
  return {
    'OEBPS/content.opf': opf(
      '3.0',
      [
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="c1" href="text/chapter%201.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="notes" href="text/notes.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="css" href="book.css" media-type="text/css"/>',
      ],
      ['<itemref idref="c1"/>', '<itemref idref="c2"/>', '<itemref idref="notes" linear="no"/>'],
    ),
    'OEBPS/nav.xhtml': xhtml(
      'Contents',
      '<nav epub:type="toc"><h1>Contents</h1><ol><li><a href="text/c2.xhtml">Two</a></li></ol></nav>',
    ),
    'OEBPS/book.css': 'body { margin: 0 }\n',
    'OEBPS/text/chapter 1.xhtml': xhtml(
      'One',
      '<section><h1>Chapter One</h1><p>First   paragraph,\n  zip 02139.</p>' +
        '<h2>Part <em>A</em></h2><p>Second <b>paragraph</b>.</p></section>',
    ),
    'OEBPS/text/c2.xhtml': xhtml(
      'Two',
      '<h1>Chapter Two</h1><p>Line one<br/>line two</p><script>ignored()</script>',
    ),
    'OEBPS/text/notes.xhtml': xhtml('Notes', '<h3>Notes</h3><p>A note.</p>'),
  }
}

const EPUB3_TEXT = [
  '# Chapter One',
  '',
  'First paragraph, zip 02139.',
  '',
  '## Part A',
  '',
  'Second paragraph.',
  '',
  '# Chapter Two',
  '',
  'Line one\nline two',
  '',
  '### Notes',
  '',
  'A note.',
].join('\n')

/** EPUB 2: package at the zip root, NCX table of contents, `.html` chapters. */
function epub2Files(): Record<string, string> {
  return {
    'content.opf': opf(
      '2.0',
      [
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
        '<item id="ch1" href="ch1.html" media-type="application/xhtml+xml"/>',
        '<item id="ch2" href="ch2.html" media-type="application/xhtml+xml"/>',
      ],
      ['<itemref idref="ch2"/>', '<itemref idref="ch1"/>'],
      'toc="ncx"',
    ),
    'toc.ncx':
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head/>' +
      '<docTitle><text>Old Book</text></docTitle><navMap>' +
      '<navPoint id="n1" playOrder="1"><navLabel><text>Opening</text></navLabel><content src="ch2.html"/></navPoint>' +
      '</navMap></ncx>\n',
    'ch1.html': xhtml('ch1', '<h2>Second Part</h2><p>Later text.</p>'),
    'ch2.html': xhtml('ch2', '<h1>Opening</h1><p>Earlier text.</p>'),
  }
}

describe('epub', () => {
  it('reads an EPUB 3 book: chapters in spine order, headings as #, a blank line between', async () => {
    const path = writeFixture('book3.epub', await buildEpub(epub3Files()))
    expect(await parseFileToText(path)).toEqual({ ok: true, kind: 'text', text: EPUB3_TEXT })
  })

  it('reads an EPUB 2 book in spine order, not manifest order', async () => {
    const path = writeFixture('book2.epub', await buildEpub(epub2Files(), 'content.opf'))
    expect(await parseFileToText(path)).toEqual({
      ok: true,
      kind: 'text',
      text: '# Opening\n\nEarlier text.\n\n## Second Part\n\nLater text.',
    })
  })

  it('takes the extension case-insensitively and does not need a mimetype entry', async () => {
    const bytes = await buildEpub(epub2Files(), 'content.opf', { mimetype: false })
    const parsed = await parseFileToText(writeFixture('UPPER.EPUB', bytes))
    expect(parsed.ok).toBe(true)
    expect(parsed.text).toContain('# Opening')
  })

  it('reads a chapter that is not well-formed XML with an HTML parser', async () => {
    const files = epub2Files()
    files['ch1.html'] =
      '<html><head><title>x</title></head><body><h2>Broken Part</h2><p>Unclosed <b>bold text</body></html>'
    const parsed = await parseFileToText(
      writeFixture('broken-chapter.epub', await buildEpub(files, 'content.opf')),
    )
    expect(parsed.ok).toBe(true)
    expect(parsed.text).toMatch(/^# Opening\n\nEarlier text\.\n\n## Broken Part/)
    expect(parsed.text).toContain('Unclosed bold text')
  })

  it('reads a book whose only encryption is font obfuscation', async () => {
    const files: Record<string, string | Uint8Array> = epub2Files()
    files['font.otf'] = new Uint8Array(64)
    files['META-INF/encryption.xml'] =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" ' +
      'xmlns:enc="http://www.w3.org/2001/04/xmlenc#">' +
      '<enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>' +
      '<enc:CipherData><enc:CipherReference URI="font.otf"/></enc:CipherData></enc:EncryptedData>' +
      '</encryption>\n'
    const parsed = await parseFileToText(
      writeFixture('fonts.epub', await buildEpub(files, 'content.opf')),
    )
    expect(parsed.ok).toBe(true)
    expect(parsed.text).toContain('Earlier text.')
  })

  it('refuses a copy-protected book that carries rights.xml', async () => {
    const files = epub2Files()
    files['META-INF/rights.xml'] = '<?xml version="1.0"?><rights/>'
    const parsed = await parseFileToText(
      writeFixture('rights.epub', await buildEpub(files, 'content.opf')),
    )
    expect(parsed.ok).toBe(false)
    expect(parsed.kind).toBe('text')
    expect(parsed.text).toBeUndefined()
    expect(parsed.error).toMatch(/^Copy-protected EPUB: /)
    expect(parsed.error).toContain('cannot be read')
  })

  it('refuses a book whose encryption.xml encrypts content', async () => {
    const files = epub2Files()
    files['META-INF/encryption.xml'] =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" ' +
      'xmlns:enc="http://www.w3.org/2001/04/xmlenc#">' +
      '<enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/>' +
      '<enc:CipherData><enc:CipherReference URI="ch1.html"/></enc:CipherData></enc:EncryptedData>' +
      '</encryption>\n'
    const parsed = await parseFileToText(
      writeFixture('drm.epub', await buildEpub(files, 'content.opf')),
    )
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toMatch(/^Copy-protected EPUB: /)
    expect(parsed.text).toBeUndefined()
  })

  it('leaves out, with a marker, a chapter whose bytes do not decode as text', async () => {
    const files: Record<string, string | Uint8Array> = epub2Files()
    // an undeclared encrypted chapter reads as bytes that are not UTF-8
    files['ch1.html'] = new Uint8Array([0x3c, 0x70, 0x3e, 0xc3, 0x28, 0xa0, 0xa1, 0xff, 0xfe, 0x80])
    const parsed = await parseFileToText(
      writeFixture('garbled.epub', await buildEpub(files, 'content.opf')),
    )
    expect(parsed).toEqual({
      ok: true,
      kind: 'text',
      text:
        '# Opening\n\nEarlier text.\n\n' +
        '[Chapter 2 (ch1.html) left out: its bytes are not valid utf-8 text]',
    })
    expect(parsed.text).not.toContain('�')
  })

  it('refuses a book none of whose chapters decode as text', async () => {
    const files: Record<string, string | Uint8Array> = epub2Files()
    files['ch1.html'] = new Uint8Array([0xc3, 0x28, 0xa0, 0xa1])
    files['ch2.html'] = new Uint8Array([0xe2, 0x28, 0xa1, 0xff])
    const parsed = await parseFileToText(
      writeFixture('all-garbled.epub', await buildEpub(files, 'content.opf')),
    )
    expect(parsed.ok).toBe(false)
    expect(parsed.text).toBeUndefined()
    expect(parsed.error).toMatch(/^Cannot read EPUB: no chapter decodes as text/)
  })

  it('refuses a zip that is not an EPUB (no container)', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', '<w:document/>')
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    const parsed = await parseFileToText(writeFixture('not-a-book.epub', bytes))
    expect(parsed.ok).toBe(false)
    expect(parsed.kind).toBe('text')
    expect(parsed.error).toMatch(/^Cannot read EPUB: not an EPUB file, or a damaged one/)
  })

  it('refuses a book whose package document has no chapters', async () => {
    const files = { 'content.opf': opf('2.0', [], []) }
    const parsed = await parseFileToText(
      writeFixture('empty.epub', await buildEpub(files, 'content.opf')),
    )
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toMatch(/^Cannot read EPUB: not an EPUB file, or a damaged one/)
  })

  it('refuses a damaged zip without throwing', async () => {
    const bytes = await buildEpub(epub2Files(), 'content.opf')
    const truncated = bytes.subarray(0, Math.floor(bytes.length / 2))
    const parsed = await parseFileToText(writeFixture('damaged.epub', truncated))
    expect(parsed.ok).toBe(false)
    expect(parsed.kind).toBe('text')
    expect(parsed.error).toMatch(/^Cannot read EPUB: the file is damaged/)
  })

  it('refuses, before inflating, a book whose chapter declares more than the per-part limit', async () => {
    const bytes = Buffer.from(await buildEpub(epub2Files(), 'content.opf'))
    const centralName = bytes.lastIndexOf(Buffer.from('ch1.html'))
    bytes.writeUInt32LE(600_000_000, centralName - 46 + 24)
    const parsed = await parseFileToText(writeFixture('huge.epub', bytes))
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toMatch(/^Cannot read EPUB: the file is too large to unpack safely/)
    expect(parsed.error).toContain('declares 600000000 uncompressed bytes')
  })

  it('refuses a book whose chapter inflates past its declared size', async () => {
    const files: Record<string, string | Uint8Array> = epub2Files()
    files['ch1.html'] = new Uint8Array(1536 * 1024)
    const bytes = Buffer.from(await buildEpub(files, 'content.opf'))
    const centralName = bytes.lastIndexOf(Buffer.from('ch1.html'))
    bytes.writeUInt32LE(300, centralName - 46 + 24)
    const parsed = await parseFileToText(writeFixture('lying.epub', bytes))
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toMatch(/^Cannot read EPUB: the file is too large to unpack safely/)
    expect(parsed.error).toContain('inflates past that')
  })

  it('rejects a .epub file that is not a zip', async () => {
    const parsed = await parseFileToText(
      writeFixture('fake.epub', '<html><body>not a book</body></html>'),
    )
    expect(parsed).toEqual({
      ok: false,
      kind: 'text',
      error: 'Content mismatch: .epub file has unknown magic bytes',
    })
  })

  it('rejects a PDF saved under a .epub name', async () => {
    const parsed = await parseFileToText(writeFixture('pdf.epub', '%PDF-1.7\n%%EOF\n'))
    expect(parsed).toEqual({
      ok: false,
      kind: 'text',
      error: 'Content mismatch: .epub file has pdf magic bytes',
    })
  })

  it('is on the attachable list', () => {
    expect(isAttachableExt('epub')).toBe(true)
    expect(isAttachableExt('.EPUB')).toBe(true)
  })
})
