/**
 * EPUB writer (spec §5, §4 cover / book info): zip layout, OPF consistency,
 * chapter splits, nav + page-list, footnotes, tables, figures, MathML,
 * cover, bilingual output and strict XML well-formedness of every file.
 *
 * epubcheck is a dev-PC check, not a test dependency. To write a sample for
 * it: set PDF_STRUCTURE_EPUB_SAMPLE=<path.epub>, run this file, then run
 * `java -jar epubcheck.jar <path.epub>`.
 */
import { writeFileSync } from 'node:fs'
import JSZip from 'jszip'
import { SaxesParser } from 'saxes'
import { describe, expect, it } from 'vitest'
import { encodeRgbaPng } from '../../pdf2docx/src/extract'
import { writeEpub } from '../src/epub'
import type { EpubWriteOptions } from '../src/epub'
import { deriveBilingualTree, deriveTranslatedTree } from '../src/tree'
import type {
  DocumentTree,
  FootnoteDef,
  HeadingBlock,
  InlineRun,
  PageInfo,
  TreeBlock,
} from '../src/tree'

// ── tree builders ──

let seq = 0
const at = (page: number) => ({
  id: `p${page}.${++seq}`,
  page,
  pageFingerprint: `fp${page}`,
  source: 'pdf' as const,
})
const t = (text: string): InlineRun[] => [{ kind: 'text', text }]
const pageBreak = (page: number): TreeBlock => ({ ...at(page), kind: 'pageBreak' })
const heading = (level: HeadingBlock['level'], text: string, page = 1): TreeBlock => ({
  ...at(page),
  kind: 'heading',
  level,
  levelSource: 'font',
  runs: t(text),
})
const para = (runs: InlineRun[] | string, page = 1): TreeBlock => ({
  ...at(page),
  kind: 'paragraph',
  runs: typeof runs === 'string' ? t(runs) : runs,
})

function solidPng(r: number, g: number, b: number): Uint8Array {
  const px = new Uint8Array(4 * 4 * 4)
  for (let i = 0; i < 16; i++) px.set([r, g, b, 255], i * 4)
  return encodeRgbaPng(px, 4, 4)
}
const RED = solidPng(220, 30, 30)
const BLUE = solidPng(30, 30, 220)

function makeTree(blocks: TreeBlock[], extra: Partial<DocumentTree> = {}): DocumentTree {
  const pageNumbers = [...new Set(blocks.map((b) => b.page))].sort((a, b) => a - b)
  const pages: PageInfo[] = pageNumbers.map((page) => ({
    page,
    fingerprint: `fp${page}`,
    status: 'text',
    widthPt: 612,
    heightPt: 792,
  }))
  return {
    version: 1,
    variant: 'original',
    info: {},
    sourcePageCount: Math.max(1, ...pageNumbers),
    pages,
    blocks,
    footnotes: [],
    outline: [],
    toc: [],
    footnoteLinkFailedPages: [],
    warnings: [],
    ...extra,
  }
}

const OPTS: EpubWriteOptions = {
  title: 'Sample Book',
  author: 'A. Writer',
  uiLanguage: 'en',
  cover: false,
  modified: new Date('2026-01-02T03:04:05.678Z'),
}

// ── strict XML reader (saxes, namespace-aware) ──

interface El {
  name: string
  attrs: Record<string, string>
  children: (El | string)[]
  parent?: El
}

function parseXml(xml: string): El {
  const parser = new SaxesParser({ xmlns: true })
  const root: El = { name: '#document', attrs: {}, children: [] }
  let cur = root
  parser.on('error', (e) => {
    throw e
  })
  parser.on('opentag', (tag) => {
    const attrs: Record<string, string> = {}
    for (const [k, a] of Object.entries(tag.attributes)) {
      attrs[k] = typeof a === 'string' ? a : a.value
    }
    const el: El = { name: tag.name, attrs, children: [], parent: cur }
    cur.children.push(el)
    cur = el
  })
  parser.on('text', (text) => {
    cur.children.push(text)
  })
  parser.on('closetag', () => {
    cur = cur.parent!
  })
  parser.write(xml).close()
  const top = root.children.find((c): c is El => typeof c !== 'string')
  if (!top) throw new Error('no root element')
  return top
}

const elements = (el: El): El[] => el.children.filter((c): c is El => typeof c !== 'string')

function all(el: El, name: string): El[] {
  const out: El[] = []
  const walk = (e: El): void => {
    for (const c of elements(e)) {
      if (c.name === name) out.push(c)
      walk(c)
    }
  }
  walk(el)
  return out
}

function textOf(el: El): string {
  return el.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('')
}

function byId(el: El, id: string): El | undefined {
  if (el.attrs.id === id) return el
  for (const c of elements(el)) {
    const hit = byId(c, id)
    if (hit) return hit
  }
  return undefined
}

const epubType = (el: El): string[] => (el.attrs['epub:type'] ?? '').split(/\s+/)

// ── EPUB reader ──

interface ManifestItem {
  id: string
  href: string
  mediaType: string
  properties: string[]
}

const resolveHref = (base: string, ref: string): { path: string; fragment: string } => {
  const url = new URL(ref, `http://book/${base}`)
  return { path: decodeURIComponent(url.pathname.slice(1)), fragment: url.hash.slice(1) }
}

async function readEpub(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir)
  const text = async (name: string): Promise<string> => {
    const f = zip.file(name)
    if (!f) throw new Error(`missing zip entry ${name}`)
    return f.async('string')
  }
  const container = parseXml(await text('META-INF/container.xml'))
  const opfPath = all(container, 'rootfile')[0]!.attrs['full-path']!
  const opf = parseXml(await text(opfPath))
  const manifest: ManifestItem[] = all(opf, 'item').map((i) => ({
    id: i.attrs.id!,
    href: i.attrs.href!,
    mediaType: i.attrs['media-type']!,
    properties: (i.attrs.properties ?? '').split(/\s+/).filter(Boolean),
  }))
  const pathOf = (item: ManifestItem): string => resolveHref(opfPath, item.href).path
  const spine = all(opf, 'itemref').map((r) => manifest.find((m) => m.id === r.attrs.idref)!)
  const docs = new Map<string, El>()
  for (const item of manifest) {
    if (item.mediaType === 'application/xhtml+xml') {
      docs.set(pathOf(item), parseXml(await text(pathOf(item))))
    }
  }
  const navItem = manifest.find((m) => m.properties.includes('nav'))!
  const coverItem = manifest.find((m) => m.properties.includes('cover-image'))
  const chapterItems = spine.filter((m) => !all(docs.get(pathOf(m))!, 'img').some(isCoverImg))
  function isCoverImg(img: El): boolean {
    return coverItem !== undefined && img.attrs.role === 'doc-cover'
  }
  return {
    zip,
    bytes,
    names,
    text,
    opfPath,
    opf,
    manifest,
    spine,
    pathOf,
    docs,
    nav: docs.get(pathOf(navItem))!,
    navPath: pathOf(navItem),
    coverItem,
    chapters: chapterItems.map((m) => ({ path: pathOf(m), item: m, doc: docs.get(pathOf(m))! })),
    languages: all(opf, 'dc:language').map(textOf),
  }
}
type Book = Awaited<ReturnType<typeof readEpub>>

/** follow an href from a document to the target element */
function follow(book: Book, fromPath: string, href: string): { path: string; el: El | undefined } {
  const { path, fragment } = resolveHref(fromPath, href)
  const doc = book.docs.get(path)
  return { path, el: doc && (fragment ? byId(doc, fragment) : doc) }
}

async function build(tree: DocumentTree, opts: Partial<EpubWriteOptions> = {}): Promise<Book> {
  return readEpub(await writeEpub(tree, { ...OPTS, ...opts }))
}

const bodyOf = (doc: El): El => all(doc, 'body')[0]!
/** headings in document order */
function headingsInOrder(doc: El): El[] {
  const out: El[] = []
  const walk = (e: El): void => {
    for (const c of elements(e)) {
      if (/^h[1-6]$/.test(c.name)) out.push(c)
      walk(c)
    }
  }
  walk(doc)
  return out
}

// ── tests ──

describe('zip structure', () => {
  it('stores mimetype first and uncompressed, with no extra field', async () => {
    const bytes = await writeEpub(makeTree([pageBreak(1), para('Hello')]), OPTS)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(view.getUint16(8, true)).toBe(0) // compression method: stored
    const nameLen = view.getUint16(26, true)
    const extraLen = view.getUint16(28, true)
    expect(extraLen).toBe(0)
    const dec = new TextDecoder()
    expect(dec.decode(bytes.subarray(30, 30 + nameLen))).toBe('mimetype')
    const data = bytes.subarray(30 + nameLen, 30 + nameLen + 20)
    expect(dec.decode(data)).toBe('application/epub+zip')
  })

  it('points container.xml at the package document', async () => {
    const book = await build(makeTree([pageBreak(1), para('Hello')]))
    expect(book.names).toContain('META-INF/container.xml')
    const rootfile = all(parseXml(await book.text('META-INF/container.xml')), 'rootfile')[0]!
    expect(rootfile.attrs['media-type']).toBe('application/oebps-package+xml')
    expect(book.names).toContain(book.opfPath)
    expect(book.opf.attrs.version).toBe('3.0')
  })

  it('is byte-identical for the same input and timestamp', async () => {
    const tree = makeTree([pageBreak(1), heading(1, 'One'), para('Body')])
    const a = await writeEpub(tree, OPTS)
    const b = await writeEpub(tree, OPTS)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })
})

describe('package document', () => {
  it('keeps manifest, spine and zip entries consistent', async () => {
    const tree = makeTree([
      pageBreak(1),
      heading(1, 'One'),
      para('Body'),
      { ...at(1), kind: 'math', latex: 'x^2' },
      {
        ...at(1),
        kind: 'image',
        data: RED,
        mime: 'image/png',
        pixelWidth: 4,
        pixelHeight: 4,
        widthPt: 40,
        heightPt: 40,
      },
      pageBreak(2),
      heading(1, 'Two'),
      para('More'),
    ])
    const book = await build(tree, { cover: true, coverPng: BLUE })
    const ids = book.manifest.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    const manifestPaths = book.manifest.map(book.pathOf)
    for (const p of manifestPaths) expect(book.names).toContain(p)
    for (const n of book.names) {
      if (n === 'mimetype' || n.startsWith('META-INF/') || n === book.opfPath) continue
      expect(manifestPaths).toContain(n)
    }
    expect(book.spine.length).toBeGreaterThan(0)
    for (const item of book.spine) {
      expect(item).toBeDefined()
      expect(item.mediaType).toBe('application/xhtml+xml')
    }
    expect(book.manifest.filter((m) => m.properties.includes('nav'))).toHaveLength(1)
    // mathml property exactly on the documents that carry MathML
    for (const item of book.manifest.filter((m) => m.mediaType === 'application/xhtml+xml')) {
      const hasMath = all(book.docs.get(book.pathOf(item))!, 'math').length > 0
      expect(item.properties.includes('mathml')).toBe(hasMath)
    }
    // dc metadata
    expect(textOf(all(book.opf, 'dc:title')[0]!)).toBe('Sample Book')
    expect(textOf(all(book.opf, 'dc:creator')[0]!)).toBe('A. Writer')
    const uid = book.opf.attrs['unique-identifier']!
    expect(textOf(byId(book.opf, uid)!)).toMatch(/^urn:uuid:[0-9a-f-]{36}$/)
    const modified = all(book.opf, 'meta').find((m) => m.attrs.property === 'dcterms:modified')!
    expect(textOf(modified)).toBe('2026-01-02T03:04:05Z')
  })

  it('omits dc:creator without an author and falls back on a blank title', async () => {
    const book = await build(makeTree([para('Body')], { info: { title: 'From PDF' } }), {
      title: '  ',
      author: '',
    })
    expect(all(book.opf, 'dc:creator')).toHaveLength(0)
    expect(textOf(all(book.opf, 'dc:title')[0]!)).toBe('From PDF')
  })
})

describe('chapter split', () => {
  it('makes one chapter per level-1 heading, with level 2 inside', async () => {
    const book = await build(
      makeTree([
        pageBreak(1),
        heading(1, 'Alpha'),
        para('a'),
        heading(2, 'Alpha one'),
        para('a1'),
        pageBreak(2),
        heading(1, 'Beta'),
        para('b'),
      ]),
    )
    expect(book.chapters).toHaveLength(2)
    expect(headingsInOrder(book.chapters[0]!.doc).map(textOf)).toEqual(['Alpha', 'Alpha one'])
    expect(headingsInOrder(book.chapters[1]!.doc).map(textOf)).toEqual(['Beta'])
    // the page marker right before a chapter heading travels with that chapter
    expect(byId(book.chapters[1]!.doc, 'page-2')).toBeDefined()
    expect(byId(book.chapters[0]!.doc, 'page-2')).toBeUndefined()
  })

  it('keeps content before the first level-1 heading as its own part', async () => {
    const book = await build(
      makeTree([pageBreak(1), para('Preface'), heading(1, 'Alpha'), para('a')]),
    )
    expect(book.chapters).toHaveLength(2)
    expect(textOf(bodyOf(book.chapters[0]!.doc))).toContain('Preface')
  })

  it('splits at level 2 when there is no level-1 heading', async () => {
    const book = await build(
      makeTree([
        pageBreak(1),
        heading(2, 'One'),
        para('x'),
        heading(3, 'One sub'),
        heading(2, 'Two'),
        para('y'),
      ]),
    )
    expect(book.chapters).toHaveLength(2)
    expect(headingsInOrder(book.chapters[0]!.doc).map(textOf)).toEqual(['One', 'One sub'])
  })

  it('writes one file when there are no level-1 or level-2 headings', async () => {
    const book = await build(
      makeTree([pageBreak(1), heading(3, 'Minor'), para('x'), pageBreak(2), para('y')]),
    )
    expect(book.chapters).toHaveLength(1)
    expect(textOf(bodyOf(book.chapters[0]!.doc))).toContain('y')
  })

  it('writes one file for an empty tree', async () => {
    const book = await build(makeTree([]))
    expect(book.chapters).toHaveLength(1)
    expect(all(book.nav, 'a').length).toBeGreaterThan(0)
  })
})

describe('navigation', () => {
  const tree = () =>
    makeTree([
      pageBreak(5),
      heading(1, 'Alpha', 5),
      heading(2, 'Alpha one', 5),
      heading(4, 'Deep', 5),
      pageBreak(6),
      heading(2, 'Alpha two', 6),
      heading(1, 'Beta', 6),
      para([{ kind: 'text', text: 'see page 5', href: '#page=5' }], 6),
      pageBreak(7),
      para('end', 7),
    ])

  it('lists the whole heading tree with working links', async () => {
    const book = await build(tree())
    const toc = all(book.nav, 'nav').find((n) => epubType(n).includes('toc'))!
    const top = elements(elements(toc).find((e) => e.name === 'ol')!)
    expect(top.map((li) => textOf(elements(li)[0]!))).toEqual(['Alpha', 'Beta'])
    const alphaKids = elements(elements(top[0]!).find((e) => e.name === 'ol')!)
    expect(alphaKids.map((li) => textOf(elements(li)[0]!))).toEqual(['Alpha one', 'Alpha two'])
    // a skipped level nests directly under the previous entry
    const deep = elements(elements(alphaKids[0]!).find((e) => e.name === 'ol')!)
    expect(deep.map((li) => textOf(elements(li)[0]!))).toEqual(['Deep'])
    for (const a of all(toc, 'a')) {
      const target = follow(book, book.navPath, a.attrs.href!)
      expect(target.el && /^h[1-6]$/.test(target.el.name)).toBe(true)
      expect(textOf(target.el!)).toBe(textOf(a))
    }
  })

  it('writes a page-list of original page numbers that resolve to page markers', async () => {
    const book = await build(tree())
    const pageList = all(book.nav, 'nav').find((n) => epubType(n).includes('page-list'))!
    const links = all(pageList, 'a')
    expect(links.map(textOf)).toEqual(['5', '6', '7'])
    for (const a of links) {
      const { el } = follow(book, book.navPath, a.attrs.href!)
      expect(el).toBeDefined()
      expect(epubType(el!)).toContain('pagebreak')
      expect(el!.attrs['aria-label']).toBe(textOf(a))
    }
  })

  it('turns #page=N links into links to the page marker', async () => {
    const book = await build(tree())
    const ch = book.chapters[1]!
    const link = all(ch.doc, 'a').find((a) => textOf(a) === 'see page 5')!
    const { el, path } = follow(book, ch.path, link.attrs.href!)
    expect(path).toBe(book.chapters[0]!.path)
    expect(el?.attrs.id).toBe('page-5')
  })

  it('omits the page-list when the tree has no page markers', async () => {
    const book = await build(makeTree([para('x')]))
    expect(all(book.nav, 'nav').some((n) => epubType(n).includes('page-list'))).toBe(false)
  })
})

describe('page breaks', () => {
  const pages = () =>
    makeTree([
      pageBreak(1),
      para('one', 1),
      pageBreak(2),
      para('two', 2),
      pageBreak(3),
      para('three', 3),
    ])

  it('keeps the default: one file, pages flow together', async () => {
    const book = await build(pages())
    expect(book.chapters).toHaveLength(1)
  })

  it('writes one XHTML file per original page and points the page-list into it', async () => {
    const book = await build(pages(), { pageBreaks: true })
    expect(book.chapters).toHaveLength(3)
    expect(book.chapters.map((c) => textOf(bodyOf(c.doc)).trim())).toEqual(['one', 'two', 'three'])
    const pageList = all(book.nav, 'nav').find((n) => epubType(n).includes('page-list'))!
    const links = all(pageList, 'a')
    expect(links.map(textOf)).toEqual(['1', '2', '3'])
    links.forEach((a, i) => {
      const { path, el } = follow(book, book.navPath, a.attrs.href!)
      expect(path).toBe(book.chapters[i]!.path)
      expect(epubType(el!)).toContain('pagebreak')
    })
  })

  it('splits a chapter at page boundaries and keeps its heading on the first page', async () => {
    const book = await build(
      makeTree([
        pageBreak(1),
        heading(1, 'Chapter', 1),
        para('first', 1),
        pageBreak(2),
        para('second', 2),
      ]),
      { pageBreaks: true },
    )
    expect(book.chapters).toHaveLength(2)
    expect(textOf(book.chapters[0]!.doc)).toContain('Chapter')
    expect(textOf(book.chapters[0]!.doc)).toContain('first')
    expect(textOf(book.chapters[1]!.doc)).toContain('second')
    expect(textOf(book.chapters[1]!.doc)).not.toContain('Chapter')
    const toc = all(book.nav, 'nav').find((n) => epubType(n).includes('toc'))!
    const link = all(toc, 'a').find((a) => textOf(a) === 'Chapter')!
    expect(follow(book, book.navPath, link.attrs.href!).path).toBe(book.chapters[0]!.path)
  })

  it('merges consecutive markers (an empty page) into the next page', async () => {
    const book = await build(
      makeTree([pageBreak(1), para('first', 1), pageBreak(2), pageBreak(3), para('third', 3)]),
      { pageBreaks: true },
    )
    expect(book.chapters).toHaveLength(2)
    expect(byId(book.chapters[1]!.doc, 'page-2')).toBeDefined()
    expect(byId(book.chapters[1]!.doc, 'page-3')).toBeDefined()
  })
})

describe('footnotes', () => {
  const notes: FootnoteDef[] = [
    {
      id: 'n1',
      marker: '1',
      page: 1,
      pageFingerprint: 'fp1',
      blocks: [{ ...at(1), kind: 'paragraph', runs: t('First note.') }],
    },
    {
      id: 'n2',
      marker: '2',
      page: 2,
      pageFingerprint: 'fp2',
      blocks: [{ ...at(2), kind: 'paragraph', runs: t('Second note.') }],
    },
  ]
  const tree = () =>
    makeTree(
      [
        pageBreak(1),
        heading(1, 'One'),
        para([
          { kind: 'text', text: 'Claim' },
          { kind: 'footnoteRef', id: 'n1', marker: '1' },
          { kind: 'text', text: ' and orphan' },
          { kind: 'footnoteRef', id: 'missing', marker: '9' },
        ]),
        pageBreak(2),
        heading(1, 'Two'),
        para([
          { kind: 'text', text: 'Other' },
          { kind: 'footnoteRef', id: 'n2', marker: '2' },
        ]),
      ],
      { footnotes: notes },
    )

  it('links body markers and chapter-end footnotes both ways', async () => {
    const book = await build(tree())
    for (const [i, ch] of book.chapters.entries()) {
      const refs = all(ch.doc, 'a').filter((a) => epubType(a).includes('noteref'))
      expect(refs).toHaveLength(1)
      const ref = refs[0]!
      const { el: aside, path } = follow(book, ch.path, ref.attrs.href!)
      expect(path).toBe(ch.path)
      expect(aside?.name).toBe('aside')
      expect(epubType(aside!)).toContain('footnote')
      expect(textOf(aside!)).toContain(i === 0 ? 'First note.' : 'Second note.')
      // at chapter end: a direct child of body, after the body content
      const body = bodyOf(ch.doc)
      const kids = elements(body)
      expect(aside!.parent).toBe(body)
      expect(kids.indexOf(aside!)).toBe(kids.length - 1)
      // back link to the marker
      const back = all(aside!, 'a').find((a) => a.attrs.href === `#${ref.attrs.id}`)
      expect(back).toBeDefined()
      expect(ref.attrs.id).toBeTruthy()
    }
  })

  it('keeps an unlinked marker as plain superscript text', async () => {
    const book = await build(tree())
    const sups = all(book.chapters[0]!.doc, 'sup')
    expect(sups.map(textOf)).toContain('9')
    const orphan = sups.find((s) => textOf(s) === '9')!
    expect(all(orphan, 'a')).toHaveLength(0)
  })
})

describe('tables', () => {
  it('keeps merged cells as rowspan / colspan', async () => {
    const book = await build(
      makeTree([
        {
          ...at(1),
          kind: 'table',
          table: {
            rowCount: 3,
            colCount: 3,
            cells: [
              { row: 0, col: 0, rowSpan: 1, colSpan: 3, header: true, paragraphs: [t('Head')] },
              { row: 1, col: 0, rowSpan: 2, colSpan: 1, paragraphs: [t('Tall')] },
              { row: 1, col: 1, rowSpan: 1, colSpan: 1, paragraphs: [t('b'), t('b2')] },
              { row: 1, col: 2, rowSpan: 1, colSpan: 1, paragraphs: [] },
              { row: 2, col: 1, rowSpan: 1, colSpan: 2, paragraphs: [t('Wide')] },
            ],
          },
          caption: {
            ...at(1),
            kind: 'caption',
            position: 'above',
            runs: t('Table 1 Sizes'),
          },
        },
      ]),
    )
    const doc = book.chapters[0]!.doc
    const table = all(doc, 'table')[0]!
    const rows = all(table, 'tr')
    expect(rows).toHaveLength(3)
    const cells = rows.map((r) => elements(r))
    expect(cells.map((r) => r.length)).toEqual([1, 3, 1])
    expect(cells[0]![0]!.name).toBe('th')
    expect(cells[0]![0]!.attrs.colspan).toBe('3')
    expect(cells[1]![0]!.attrs.rowspan).toBe('2')
    expect(cells[1]![1]!.attrs.rowspan).toBeUndefined()
    expect(cells[2]![0]!.attrs.colspan).toBe('2')
    expect(textOf(cells[2]![0]!)).toBe('Wide')
    expect(all(cells[1]![1]!, 'p').map(textOf)).toEqual(['b', 'b2'])
    expect(textOf(all(table, 'caption')[0]!)).toBe('Table 1 Sizes')
  })
})

describe('figures', () => {
  const image = (data: Uint8Array, caption?: { text: string; position: 'above' | 'below' }) =>
    ({
      ...at(1),
      kind: 'image',
      data,
      mime: 'image/png',
      pixelWidth: 4,
      pixelHeight: 4,
      widthPt: 40,
      heightPt: 40,
      ...(caption
        ? {
            caption: {
              ...at(1),
              kind: 'caption',
              position: caption.position,
              runs: t(caption.text),
            },
          }
        : {}),
    }) as TreeBlock

  it('writes figure + img + figcaption on the caption side, deduplicating bytes', async () => {
    const book = await build(
      makeTree([
        image(RED, { text: 'Figure 1 Red', position: 'below' }),
        image(BLUE, { text: 'Figure 2 Blue', position: 'above' }),
        image(RED),
      ]),
    )
    const doc = book.chapters[0]!.doc
    const figures = all(doc, 'figure')
    expect(figures).toHaveLength(3)
    expect(elements(figures[0]!).map((e) => e.name)).toEqual(['img', 'figcaption'])
    expect(elements(figures[1]!).map((e) => e.name)).toEqual(['figcaption', 'img'])
    expect(elements(figures[2]!).map((e) => e.name)).toEqual(['img'])
    expect(textOf(all(figures[0]!, 'figcaption')[0]!)).toBe('Figure 1 Red')
    expect(all(figures[0]!, 'img')[0]!.attrs.alt).toBe('Figure 1 Red')
    const srcs = figures.map((f) => all(f, 'img')[0]!.attrs.src!)
    expect(srcs[0]).toBe(srcs[2])
    expect(srcs[0]).not.toBe(srcs[1])
    const images = book.manifest.filter((m) => m.mediaType === 'image/png')
    expect(images).toHaveLength(2)
    const stored = await book.zip
      .file(resolveHref(book.chapters[0]!.path, srcs[0]!).path)!
      .async('uint8array')
    expect(Buffer.from(stored).equals(Buffer.from(RED))).toBe(true)
  })

  it('puts degraded and scanned page images in as figures', async () => {
    const book = await build(
      makeTree([
        pageBreak(3),
        {
          ...at(3),
          kind: 'pageImage',
          reason: 'degraded',
          detail: 'bad-tounicode',
          data: BLUE,
          mime: 'image/png',
          pixelWidth: 4,
          pixelHeight: 4,
          widthPt: 612,
          heightPt: 792,
        },
      ]),
    )
    const fig = all(book.chapters[0]!.doc, 'figure')[0]!
    const img = all(fig, 'img')[0]!
    expect(img.attrs.alt).toBe('Page 3')
    const target = resolveHref(book.chapters[0]!.path, img.attrs.src!).path
    expect(book.names).toContain(target)
  })

  it('writes a placeholder image as its caption only', async () => {
    const book = await build(
      makeTree([
        {
          ...(image(new Uint8Array(), { text: 'Figure 9', position: 'below' }) as object),
          placeholder: true,
        } as TreeBlock,
      ]),
    )
    const fig = all(book.chapters[0]!.doc, 'figure')[0]!
    expect(all(fig, 'img')).toHaveLength(0)
    expect(textOf(fig)).toBe('Figure 9')
  })
})

describe('math', () => {
  it('renders formulas as MathML and keeps failed ones as LaTeX code', async () => {
    const book = await build(
      makeTree([
        heading(1, 'Math'),
        para([
          { kind: 'text', text: 'Inline ' },
          { kind: 'math', latex: 'a < b' },
          { kind: 'text', text: ' and broken ' },
          { kind: 'math', latex: '\\frac{' },
        ]),
        { ...at(1), kind: 'math', latex: '\\sum_{i=1}^n i' },
        { ...at(1), kind: 'math', latex: '\\notacommand x' },
      ]),
    )
    const ch = book.chapters[0]!
    const maths = all(ch.doc, 'math')
    expect(maths).toHaveLength(2)
    expect(maths.every((m) => m.attrs.xmlns === 'http://www.w3.org/1998/Math/MathML')).toBe(true)
    expect(maths[0]!.attrs.display).toBeUndefined()
    expect(maths[1]!.attrs.display).toBe('block')
    expect(maths.map((m) => m.attrs.alttext)).toEqual(['a < b', '\\sum_{i=1}^n i'])
    expect(all(ch.doc, 'code').map(textOf)).toEqual(['\\frac{', '\\notacommand x'])
    expect(ch.item.properties).toContain('mathml')
  })
})

describe('language', () => {
  it('guesses dc:language from the body script and sets it on every document', async () => {
    const book = await build(makeTree([para('한국어 본문 문장입니다. 문서의 언어를 추정합니다.')]))
    expect(book.languages).toEqual(['ko'])
    expect(book.chapters[0]!.doc.attrs.lang).toBe('ko')
    expect(book.chapters[0]!.doc.attrs['xml:lang']).toBe('ko')
    expect(book.nav.attrs.lang).toBe('ko')
  })

  it('takes an explicit language over the guess', async () => {
    const book = await build(
      makeTree([para('한국어 본문 문장입니다. 문서의 언어를 추정합니다.')]),
      {
        language: 'ja',
      },
    )
    expect(book.languages).toEqual(['ja'])
  })

  it('falls back to the UI language when the body has too little text', async () => {
    const book = await build(makeTree([para('12 34')]), { uiLanguage: 'de' })
    expect(book.languages).toEqual(['de'])
  })
})

describe('cover', () => {
  const tree = () => makeTree([pageBreak(1), heading(1, 'One'), para('x')])

  it('puts the first-page image first in the spine when on', async () => {
    const book = await build(tree(), { cover: true, coverPng: BLUE })
    expect(book.coverItem).toBeDefined()
    expect(book.coverItem!.mediaType).toBe('image/png')
    const coverBytes = await book.zip.file(book.pathOf(book.coverItem!))!.async('uint8array')
    expect(Buffer.from(coverBytes).equals(Buffer.from(BLUE))).toBe(true)
    const first = book.docs.get(book.pathOf(book.spine[0]!))!
    const img = all(first, 'img')[0]!
    expect(resolveHref(book.pathOf(book.spine[0]!), img.attrs.src!).path).toBe(
      book.pathOf(book.coverItem!),
    )
    const meta = all(book.opf, 'meta').find((m) => m.attrs.name === 'cover')
    expect(meta?.attrs.content).toBe(book.coverItem!.id)
    expect(book.spine).toHaveLength(2)
  })

  it('defaults to on', async () => {
    const book = await readEpub(
      await writeEpub(tree(), { title: 'T', uiLanguage: 'en', coverPng: BLUE }),
    )
    expect(book.coverItem).toBeDefined()
  })

  it('writes no cover when off or without an image', async () => {
    for (const opts of [{ cover: false, coverPng: BLUE }, { cover: true }]) {
      const book = await build(tree(), opts)
      expect(book.coverItem).toBeUndefined()
      expect(all(book.opf, 'meta').some((m) => m.attrs.name === 'cover')).toBe(false)
      expect(book.spine).toHaveLength(1)
    }
  })
})

describe('translated and bilingual trees', () => {
  function source(): DocumentTree {
    const blocks: TreeBlock[] = [
      { ...pageBreak(1), id: 'p1.0' },
      { ...heading(1, 'Chapter One'), id: 'p1.1' },
      {
        ...para([
          { kind: 'text', text: 'Original text' },
          { kind: 'footnoteRef', id: 'n1', marker: '1' },
        ]),
        id: 'p1.2',
      },
      {
        ...at(1),
        id: 'p1.3',
        kind: 'image',
        data: RED,
        mime: 'image/png',
        pixelWidth: 4,
        pixelHeight: 4,
        widthPt: 40,
        heightPt: 40,
        caption: { ...at(1), id: 'p1.4', kind: 'caption', position: 'below', runs: t('Figure 1') },
      },
      {
        ...at(1),
        id: 'p1.5',
        kind: 'listItem',
        ordered: true,
        level: 0,
        marker: '3.',
        runs: t('Item'),
      },
      { ...pageBreak(2), id: 'p2.0' },
      { ...heading(1, 'Chapter Two', 2), id: 'p2.1' },
    ]
    return makeTree(blocks, {
      footnotes: [
        {
          id: 'n1',
          marker: '1',
          page: 1,
          pageFingerprint: 'fp1',
          blocks: [{ ...at(1), id: 'fn1', kind: 'paragraph', runs: t('Note') }],
        },
      ],
    })
  }
  const tr = new Map<string, InlineRun[]>([
    ['p1.1', t('Erstes Kapitel')],
    [
      'p1.2',
      [
        { kind: 'text', text: 'Übersetzter Text' },
        { kind: 'footnoteRef', id: 'n1', marker: '1' },
      ],
    ],
    ['p1.4', t('Abbildung 1')],
    ['p1.5', t('Punkt')],
    ['p2.1', t('Zweites Kapitel')],
    ['fn1', t('Notiz')],
  ])

  it('writes the translated tree with the target language', async () => {
    const book = await build(deriveTranslatedTree(source(), 'de', tr))
    expect(book.languages).toEqual(['de'])
    expect(book.chapters).toHaveLength(2)
    const body = textOf(bodyOf(book.chapters[0]!.doc))
    expect(body).toContain('Übersetzter Text')
    expect(body).not.toContain('Original text')
  })

  it('follows each original block with its translation', async () => {
    const book = await build(deriveBilingualTree(source(), 'de', tr), { uiLanguage: 'en' })
    expect(book.languages).toEqual(['en', 'de'])
    // a heading and its translation stay in one chapter and one nav entry
    expect(book.chapters).toHaveLength(2)
    const doc = book.chapters[0]!.doc
    expect(headingsInOrder(doc).map(textOf)).toEqual(['Chapter One', 'Erstes Kapitel'])
    const ps = all(doc, 'p').filter((p) => p.parent?.name !== 'aside')
    const texts = ps.map(textOf)
    const orig = texts.findIndex((s) => s.startsWith('Original text'))
    expect(texts[orig + 1]).toMatch(/^Übersetzter Text/)
    const translated = ps[orig + 1]!
    expect(translated.attrs.lang).toBe('de')
    expect(translated.attrs['xml:lang']).toBe('de')
    // the figure is not repeated; both captions sit in one figcaption
    const figures = all(doc, 'figure')
    expect(figures).toHaveLength(1)
    const caption = all(figures[0]!, 'figcaption')[0]!
    expect(textOf(caption)).toContain('Figure 1')
    expect(textOf(caption)).toContain('Abbildung 1')
    // the list item and its translation share one numbered entry
    const lis = all(doc, 'li')
    expect(lis).toHaveLength(1)
    expect(lis[0]!.attrs.value).toBe('3')
    expect(textOf(lis[0]!)).toContain('Punkt')
    // both note paragraphs are in the aside; both body markers link to it
    const aside = all(doc, 'aside')[0]!
    expect(textOf(aside)).toContain('Note')
    expect(textOf(aside)).toContain('Notiz')
    const refs = all(doc, 'a').filter((a) => epubType(a).includes('noteref'))
    expect(refs).toHaveLength(2)
    expect(new Set(refs.map((r) => r.attrs.href)).size).toBe(1)
    expect(new Set(refs.map((r) => r.attrs.id)).size).toBe(2)
    // nav lists each heading once
    const toc = all(book.nav, 'nav').find((n) => epubType(n).includes('toc'))!
    expect(all(toc, 'a').map(textOf)).toEqual(['Chapter One', 'Chapter Two'])
  })
})

describe('lists', () => {
  it('nests list items by level and keeps printed numbers', async () => {
    const li = (level: number, ordered: boolean, text: string, marker?: string): TreeBlock => ({
      ...at(1),
      kind: 'listItem',
      level,
      ordered,
      ...(marker ? { marker } : {}),
      runs: t(text),
    })
    const book = await build(
      makeTree([
        li(0, false, 'a'),
        li(1, true, 'a.1', '1.'),
        li(1, true, 'a.2', '2.'),
        pageBreak(2),
        li(0, false, 'b'),
        para('after'),
      ]),
    )
    const body = bodyOf(book.chapters[0]!.doc)
    const uls = all(body, 'ul')
    expect(uls).toHaveLength(1)
    const ol = all(uls[0]!, 'ol')[0]!
    expect(all(ol, 'li').map((l) => l.attrs.value)).toEqual(['1', '2'])
    expect(elements(uls[0]!).map((l) => l.name)).toEqual(['li', 'li'])
    // the page marker between items rides inside the next item
    expect(byId(body, 'page-2')?.parent?.name).toBe('li')
  })
})

describe('well-formed XHTML', () => {
  it('escapes hostile text and drops unsafe links in every file', async () => {
    const nasty = 'a < b && c > d "q" \'s\' ]]> \u0001\u000b￾ end'
    const tree = makeTree(
      [
        pageBreak(1),
        heading(1, nasty),
        para([
          { kind: 'text', text: nasty, bold: true, italic: true },
          { kind: 'lineBreak' },
          { kind: 'text', text: 'js', href: 'javascript:alert(1)' },
          { kind: 'text', text: 'web', href: 'https://example.com/a b?x="1"&y=<2>' },
          { kind: 'text', text: 'gone', href: '#page=99' },
        ]),
        {
          ...at(1),
          kind: 'table',
          table: {
            rowCount: 1,
            colCount: 1,
            cells: [{ row: 0, col: 0, rowSpan: 1, colSpan: 1, paragraphs: [t(nasty)] }],
          },
        },
      ],
      { info: { title: nasty } },
    )
    const bytes = await writeEpub(tree, { ...OPTS, title: nasty, author: nasty })
    const zip = await JSZip.loadAsync(bytes)
    const xmlFiles = Object.keys(zip.files).filter((n) => /\.(xhtml|opf|xml|ncx)$/.test(n))
    expect(xmlFiles.length).toBeGreaterThanOrEqual(4)
    for (const name of xmlFiles) {
      const xml = await zip.file(name)!.async('string')
      expect(() => parseXml(xml), name).not.toThrow()
    }
    const book = await readEpub(bytes)
    const doc = book.chapters[0]!.doc
    const links = all(doc, 'a')
    expect(links.find((a) => textOf(a) === 'js')).toBeUndefined()
    expect(links.find((a) => textOf(a) === 'gone')).toBeUndefined()
    const web = links.find((a) => textOf(a) === 'web')!
    expect(() => new URL(web.attrs.href!)).not.toThrow()
    expect(web.attrs.href).not.toMatch(/[\s"<>]/)
    expect(textOf(headingsInOrder(doc)[0]!)).toContain('a < b && c > d "q"')
    expect(all(doc, 'br')).toHaveLength(1)
    expect(all(doc, 'b')).toHaveLength(1)
    expect(all(doc, 'i')).toHaveLength(1)
  })
})

describe('epubcheck sample', () => {
  const out = process.env.PDF_STRUCTURE_EPUB_SAMPLE
  it.skipIf(!out)('writes a full sample for epubcheck', async () => {
    const tree = makeTree(
      [
        pageBreak(1),
        para('Front matter before the first chapter.'),
        heading(1, 'Chapter One'),
        para([
          { kind: 'text', text: 'Bold', bold: true },
          { kind: 'text', text: ' and ' },
          { kind: 'text', text: 'italic', italic: true },
          { kind: 'text', text: ' and a ' },
          { kind: 'text', text: 'link', href: 'https://example.com/' },
          { kind: 'footnoteRef', id: 'n1', marker: '1' },
          { kind: 'text', text: ' with ' },
          { kind: 'math', latex: 'e^{i\\pi} + 1 = 0' },
          { kind: 'lineBreak' },
          { kind: 'math', latex: '\\broken{' },
        ]),
        heading(2, 'Section'),
        { ...at(1), kind: 'listItem', ordered: false, level: 0, runs: t('one') },
        { ...at(1), kind: 'listItem', ordered: true, level: 1, marker: '1.', runs: t('two') },
        { ...at(1), kind: 'math', latex: '\\int_0^1 x\\,dx = \\frac{1}{2}' },
        {
          ...at(1),
          kind: 'table',
          table: {
            rowCount: 2,
            colCount: 2,
            cells: [
              { row: 0, col: 0, rowSpan: 1, colSpan: 2, header: true, paragraphs: [t('Head')] },
              { row: 1, col: 0, rowSpan: 1, colSpan: 1, paragraphs: [t('a')] },
              { row: 1, col: 1, rowSpan: 1, colSpan: 1, paragraphs: [t('b')] },
            ],
          },
          caption: { ...at(1), kind: 'caption', position: 'below', runs: t('Table 1') },
        },
        {
          ...at(1),
          kind: 'image',
          data: RED,
          mime: 'image/png',
          pixelWidth: 4,
          pixelHeight: 4,
          widthPt: 40,
          heightPt: 40,
          caption: { ...at(1), kind: 'caption', position: 'below', runs: t('Figure 1') },
        },
        pageBreak(2),
        heading(1, 'Chapter Two', 2),
        para([{ kind: 'text', text: 'Back to page 1', href: '#page=1' }], 2),
        pageBreak(3),
        {
          ...at(3),
          kind: 'pageImage',
          reason: 'degraded',
          data: BLUE,
          mime: 'image/png',
          pixelWidth: 4,
          pixelHeight: 4,
          widthPt: 612,
          heightPt: 792,
        },
      ],
      {
        footnotes: [
          {
            id: 'n1',
            marker: '1',
            page: 1,
            pageFingerprint: 'fp1',
            blocks: [{ ...at(1), kind: 'paragraph', runs: t('The note.') }],
          },
        ],
      },
    )
    const tr = new Map<string, InlineRun[]>(
      tree.blocks.flatMap((b): [string, InlineRun[]][] =>
        b.kind === 'paragraph' || b.kind === 'heading' ? [[b.id, t('Übersetzung')]] : [],
      ),
    )
    const bilingual = deriveBilingualTree(tree, 'de', tr)
    writeFileSync(out!, await writeEpub(bilingual, { ...OPTS, cover: true, coverPng: BLUE }))
    const variant = (name: string) => out!.replace(/(\.epub)?$/, `-${name}.epub`)
    writeFileSync(variant('original'), await writeEpub(tree, OPTS))
    writeFileSync(variant('empty'), await writeEpub(makeTree([]), OPTS))
  })
})
