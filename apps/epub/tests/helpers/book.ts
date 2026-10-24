/**
 * Small EPUB files for the editor's main-process tests, built in memory.
 */
import JSZip from 'jszip'
import { IDPF_FONT_OBFUSCATION, obfuscateFont } from '@genoffice/epub-engine'

export const BOOK_ID = 'urn:uuid:12345678-90ab-cdef-1234-567890abcdef'

const CONTAINER_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
  '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n' +
  '</container>\n'

export const xhtml = (title: string, body: string, head = ''): string =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE html>\n' +
  '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">\n' +
  `<head><title>${title}</title>${head}</head>\n<body>\n${body}\n</body>\n</html>\n`

/** The font bytes before obfuscation (any bytes do: only the first 1040 are XORed). */
export const FONT_BYTES = new Uint8Array(2048).map((_, i) => (i * 7) % 256)

export interface BookOptions {
  /** the whole book pre-paginated */
  fixedLayout?: boolean
  /** the second chapter's itemref pre-paginated */
  fixedChapter?: boolean
  /** the second chapter not well-formed */
  brokenChapter?: boolean
  /** EPUB 2 package */
  epub2?: boolean
  /** an obfuscated font and a script entry */
  extras?: boolean
}

/** A two-chapter book: `OEBPS/text/one.xhtml` and `OEBPS/text/two.xhtml`. */
export async function buildBook(options: BookOptions = {}): Promise<Uint8Array> {
  const version = options.epub2 ? '2.0' : '3.0'
  const layout = options.fixedLayout ? '<meta property="rendition:layout">pre-paginated</meta>' : ''
  const modified = options.epub2
    ? ''
    : '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>'
  const extrasManifest = options.extras
    ? '<item id="font" href="fonts/a.otf" media-type="font/otf"/>\n' +
      '<item id="js" href="code/app.js" media-type="text/javascript"/>\n' +
      '<item id="pic" href="images/pic.png" media-type="image/png"/>\n'
    : ''
  const opf =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<package xmlns="http://www.idpf.org/2007/opf" version="${version}" unique-identifier="uid" prefix="rendition: http://www.idpf.org/vocab/rendition/#">\n` +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
    `<dc:identifier id="uid">${BOOK_ID}</dc:identifier>\n` +
    '<dc:title>A Small Book</dc:title>\n' +
    '<dc:language>en</dc:language>\n' +
    `${modified}${layout}\n` +
    '</metadata>\n' +
    '<manifest>\n' +
    '<item id="one" href="text/one.xhtml" media-type="application/xhtml+xml"/>\n' +
    '<item id="two" href="text/two.xhtml" media-type="application/xhtml+xml"/>\n' +
    '<item id="css" href="styles/book.css" media-type="text/css"/>\n' +
    extrasManifest +
    '</manifest>\n' +
    '<spine>\n' +
    '<itemref idref="one"/>\n' +
    `<itemref idref="two"${options.fixedChapter ? ' properties="rendition:layout-pre-paginated"' : ''}/>\n` +
    '</spine>\n' +
    '</package>\n'
  const files: Record<string, string | Uint8Array> = {
    'OEBPS/content.opf': opf,
    'OEBPS/styles/book.css': 'body { margin: 0 }\n',
    'OEBPS/text/one.xhtml': xhtml(
      'One',
      '<h1>Chapter One</h1>\n<p>First paragraph.</p>\n<p>Second paragraph.</p>',
      '<link rel="stylesheet" href="../styles/book.css"/>',
    ),
    'OEBPS/text/two.xhtml': options.brokenChapter
      ? xhtml('Two', '<h1>Chapter Two</h1>\n<p>Broken <b>markup</p>')
      : xhtml('Two', '<h1>Chapter Two</h1>\n<p>Third paragraph.</p>'),
  }
  if (options.extras) {
    files['META-INF/encryption.xml'] =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">\n' +
      `<enc:EncryptedData><enc:EncryptionMethod Algorithm="${IDPF_FONT_OBFUSCATION}"/>` +
      '<enc:CipherData><enc:CipherReference URI="OEBPS/fonts/a.otf"/></enc:CipherData></enc:EncryptedData>\n' +
      '</encryption>\n'
    files['OEBPS/fonts/a.otf'] = obfuscateFont(FONT_BYTES, IDPF_FONT_OBFUSCATION, BOOK_ID)!
    files['OEBPS/code/app.js'] = 'alert(1)\n'
    files['OEBPS/images/pic.png'] = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
  }
  const zip = new JSZip()
  const date = new Date('2026-01-01T00:00:00Z')
  zip.file('mimetype', 'application/epub+zip', { date, compression: 'STORE' })
  zip.file('META-INF/container.xml', CONTAINER_XML, { date, createFolders: false })
  for (const [name, data] of Object.entries(files)) {
    zip.file(name, data, { date, createFolders: false })
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

/** The text of one entry of a zip. */
export async function entryText(bytes: Uint8Array, name: string): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  return zip.file(name)!.async('string')
}

/** The decompressed bytes of every entry, by name. */
export async function entryBytes(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(bytes)
  const out = new Map<string, Uint8Array>()
  for (const file of Object.values(zip.files)) {
    if (!file.dir) out.set(file.name, await file.async('uint8array'))
  }
  return out
}
