/**
 * Document tree → EPUB 3 bytes (spec §5, §4 cover and book info). Takes the
 * original, translated and bilingual trees alike.
 *
 * Layout:
 *   mimetype                 first entry, stored (not compressed), no extra field
 *   META-INF/container.xml
 *   OEBPS/content.opf        package document
 *   OEBPS/nav.xhtml          heading tree (toc) + original page numbers (page-list)
 *   OEBPS/style.css
 *   OEBPS/cover.xhtml        when the cover is on and an image was given
 *   OEBPS/chapter-NNN.xhtml  one per level-1 heading (see ./chapters.ts), or
 *                            one per original page with `pageBreaks`
 *   OEBPS/images/…           content-hash names; identical images stored once
 */
import JSZip from 'jszip'
import { Sha256, sha256Hex } from '../tree/hash'
import type { DocumentTree, FootnoteDef, PageBreakBlock } from '../tree/types'
import { splitChapters, splitPages } from './chapters'
import { epubLanguages, type EpubLanguageOptions } from './language'
import { renderChapter, type NavHeading } from './render'
import { escapeAttr, escapeText, plainText, xhtmlDocument } from './xml'

export interface EpubWriteOptions extends EpubLanguageOptions {
  /** dc:title. Callers prefill it from the tree's document info, else the file name. */
  title: string
  /** dc:creator; left out when empty */
  author?: string
  /** cover page from `coverPng` (default on) */
  cover?: boolean
  /** the first page rendered as PNG; the cover image */
  coverPng?: Uint8Array
  /** dc:identifier; defaults to a urn:uuid derived from the title and page fingerprints */
  identifier?: string
  /** dcterms:modified and zip entry times; defaults to now */
  modified?: Date
  /** alt text of a page kept as a picture; defaults to `Page N` */
  pageImageAlt?: (page: number) => string
  /**
   * one XHTML file per original page, so every reading system starts each
   * page on a new screen (default: chapters only, text flows across pages)
   */
  pageBreaks?: boolean
}

const OPF_PATH = 'OEBPS/content.opf'

const CONTAINER_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
  '<rootfiles>\n' +
  `<rootfile full-path="${OPF_PATH}" media-type="application/oebps-package+xml"/>\n` +
  '</rootfiles>\n' +
  '</container>\n'

const STYLE_CSS = `body { margin: 0 4%; line-height: 1.5; }
figure { margin: 1em 0; text-align: center; }
figure img { max-width: 100%; height: auto; }
figure.page-image img { width: 100%; }
figcaption { font-size: 0.9em; }
table { border-collapse: collapse; margin: 1em 0; }
th, td { border: 1px solid; padding: 0.2em 0.4em; vertical-align: top; }
table.caption-below caption { caption-side: bottom; }
.math { margin: 1em 0; text-align: center; }
.translation { margin-top: 0.25em; }
aside.footnote { font-size: 0.9em; }
section.cover { text-align: center; }
section.cover img { max-width: 100%; max-height: 100vh; }
`

interface ImageItem {
  id: string
  href: string
  mime: string
  data: Uint8Array
}

interface ManifestEntry {
  id: string
  href: string
  mime: string
  properties?: string
}

const chapterFile = (i: number): string => `chapter-${String(i + 1).padStart(3, '0')}.xhtml`

/** RFC 4122 (version 5 layout) UUID URN from a hash of the book's content */
function contentIdentifier(tree: DocumentTree, title: string): string {
  const h = new Sha256().update(`${title}\n${tree.variant}\n${tree.targetLanguage ?? ''}`)
  for (const p of tree.pages) h.update(`\n${p.page}:${p.fingerprint}`)
  const hex = h.hex().slice(0, 32).split('')
  hex[12] = '5'
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)
  const s = hex.join('')
  return `urn:uuid:${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

const isJpeg = (b: Uint8Array): boolean => b[0] === 0xff && b[1] === 0xd8

interface NavNode {
  level: number
  href: string
  text: string
  children: NavNode[]
}

/** flat headings → tree; a skipped level nests directly under the previous entry */
function navTree(entries: { level: number; href: string; text: string }[]): NavNode[] {
  const root: NavNode = { level: 0, href: '', text: '', children: [] }
  const stack = [root]
  for (const e of entries) {
    while (stack.length > 1 && stack[stack.length - 1]!.level >= e.level) stack.pop()
    const node: NavNode = { ...e, children: [] }
    stack[stack.length - 1]!.children.push(node)
    stack.push(node)
  }
  return root.children
}

function navOl(nodes: NavNode[]): string {
  const items = nodes.map(
    (n) =>
      `<li><a href="${escapeAttr(n.href)}">${escapeText(n.text)}</a>` +
      `${n.children.length > 0 ? `\n${navOl(n.children)}` : ''}</li>\n`,
  )
  return `<ol>\n${items.join('')}</ol>\n`
}

function navDocument(
  title: string,
  lang: string,
  toc: NavNode[],
  pageList: { page: number; href: string }[],
): string {
  let body =
    '<nav epub:type="toc" id="toc" role="doc-toc">\n' +
    `<h1>${escapeText(title)}</h1>\n${navOl(toc)}</nav>\n`
  if (pageList.length > 0) {
    const items = pageList.map((p) => `<li><a href="${escapeAttr(p.href)}">${p.page}</a></li>\n`)
    body +=
      '<nav epub:type="page-list" id="page-list" role="doc-pagelist" hidden="hidden">\n' +
      `<ol>\n${items.join('')}</ol>\n</nav>\n`
  }
  return xhtmlDocument(title, lang, body)
}

export async function writeEpub(
  tree: DocumentTree,
  options: EpubWriteOptions,
): Promise<Uint8Array> {
  const title = plainText(options.title ?? '') || plainText(tree.info.title ?? '') || 'Untitled'
  const author = plainText(options.author ?? '')
  const languages = epubLanguages(tree, options)
  const lang = languages[0]!
  const modified = options.modified ?? new Date()
  const pageImageAlt = options.pageImageAlt ?? ((page: number) => `Page ${page}`)
  const coverPng =
    options.cover !== false && options.coverPng && options.coverPng.length > 0
      ? options.coverPng
      : undefined

  const headingChapters = splitChapters(tree.blocks)
  const chapters = options.pageBreaks ? splitPages(headingChapters) : headingChapters
  const files = chapters.map((_, i) => chapterFile(i))

  // page markers: one id each, and the first marker of every original page
  const markerIds = new Map<PageBreakBlock, string>()
  const pageTargets = new Map<number, string>()
  const usedIds = new Set<string>()
  chapters.forEach((ch, i) => {
    for (const b of ch.blocks) {
      if (b.kind !== 'pageBreak') continue
      let id = `page-${b.page}`
      for (let k = 2; usedIds.has(id); k++) id = `page-${b.page}-${k}`
      usedIds.add(id)
      markerIds.set(b, id)
      if (!pageTargets.has(b.page)) pageTargets.set(b.page, `${files[i]}#${id}`)
    }
  })

  const images = new Map<string, ImageItem>()
  const footnotes = new Map<string, FootnoteDef>(tree.footnotes.map((f) => [f.id, f]))
  let headingSeq = 0
  const env = {
    pageHref: (page: number) => pageTargets.get(page),
    pageMarkerId: (b: PageBreakBlock) => markerIds.get(b) ?? `page-${b.page}`,
    imageHref: (data: Uint8Array, mime: 'image/png' | 'image/jpeg') => {
      const ext = mime === 'image/jpeg' ? 'jpg' : 'png'
      const hash = sha256Hex(data).slice(0, 24)
      const name = `${hash}.${ext}`
      if (!images.has(name)) {
        images.set(name, { id: `img-${hash}-${ext}`, href: `images/${name}`, mime, data })
      }
      return images.get(name)!.href
    },
    nextHeadingId: () => `h-${++headingSeq}`,
    footnotes,
    pageImageAlt,
  }

  const rendered = chapters.map((ch) => renderChapter(ch, env))
  const navEntries = rendered.flatMap((r, i) =>
    r.headings.map((h: NavHeading) => ({
      level: h.level,
      href: `${files[i]}#${h.id}`,
      text: h.text,
    })),
  )
  const toc = navTree(
    navEntries.length > 0 ? navEntries : [{ level: 1, href: files[0]!, text: title }],
  )

  // ── package document ──
  const manifest: ManifestEntry[] = [
    { id: 'nav', href: 'nav.xhtml', mime: 'application/xhtml+xml', properties: 'nav' },
    { id: 'css', href: 'style.css', mime: 'text/css' },
  ]
  const spine: string[] = []
  const coverMime = coverPng && isJpeg(coverPng) ? 'image/jpeg' : 'image/png'
  const coverHref = `images/cover.${coverMime === 'image/jpeg' ? 'jpg' : 'png'}`
  if (coverPng) {
    manifest.push(
      { id: 'cover-image', href: coverHref, mime: coverMime, properties: 'cover-image' },
      { id: 'cover', href: 'cover.xhtml', mime: 'application/xhtml+xml' },
    )
    spine.push('cover')
  }
  rendered.forEach((r, i) => {
    const id = `chapter-${String(i + 1).padStart(3, '0')}`
    manifest.push({
      id,
      href: files[i]!,
      mime: 'application/xhtml+xml',
      ...(r.hasMath ? { properties: 'mathml' } : {}),
    })
    spine.push(id)
  })
  for (const img of images.values()) manifest.push({ id: img.id, href: img.href, mime: img.mime })

  const identifier = plainText(options.identifier ?? '') || contentIdentifier(tree, title)
  const metadata = [
    `<dc:identifier id="book-id">${escapeText(identifier)}</dc:identifier>`,
    `<dc:title>${escapeText(title)}</dc:title>`,
    ...(author ? [`<dc:creator>${escapeText(author)}</dc:creator>`] : []),
    ...languages.map((l) => `<dc:language>${escapeText(l)}</dc:language>`),
    ...(tree.info.subject && plainText(tree.info.subject)
      ? [`<dc:subject>${escapeText(plainText(tree.info.subject))}</dc:subject>`]
      : []),
    `<meta property="dcterms:modified">${modified.toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>`,
    ...(coverPng ? ['<meta name="cover" content="cover-image"/>'] : []),
  ]
  const opf =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeAttr(lang)}">\n` +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
    `${metadata.join('\n')}\n</metadata>\n` +
    '<manifest>\n' +
    manifest
      .map(
        (m) =>
          `<item id="${m.id}" href="${escapeAttr(m.href)}" media-type="${m.mime}"` +
          `${m.properties ? ` properties="${m.properties}"` : ''}/>\n`,
      )
      .join('') +
    '</manifest>\n' +
    `<spine>\n${spine.map((id) => `<itemref idref="${id}"/>\n`).join('')}</spine>\n` +
    '</package>\n'

  // ── zip ──
  const zip = new JSZip()
  const at = { date: modified, createFolders: false }
  const store = { ...at, compression: 'STORE' as const }
  zip.file('mimetype', 'application/epub+zip', store)
  zip.file('META-INF/container.xml', CONTAINER_XML, at)
  zip.file(OPF_PATH, opf, at)
  zip.file(
    'OEBPS/nav.xhtml',
    navDocument(
      title,
      lang,
      toc,
      [...pageTargets].map(([page, href]) => ({ page, href })),
    ),
    at,
  )
  zip.file('OEBPS/style.css', STYLE_CSS, at)
  if (coverPng) {
    zip.file(`OEBPS/${coverHref}`, coverPng, store)
    const coverBody =
      '<section epub:type="cover" class="cover">\n' +
      `<img src="${coverHref}" alt="${escapeAttr(title)}" role="doc-cover"/>\n` +
      '</section>\n'
    zip.file('OEBPS/cover.xhtml', xhtmlDocument(title, lang, coverBody), at)
  }
  rendered.forEach((r, i) => {
    zip.file(`OEBPS/${files[i]}`, xhtmlDocument(r.title ?? title, lang, r.body), at)
  })
  for (const img of images.values()) zip.file(`OEBPS/${img.href}`, img.data, store)
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}
