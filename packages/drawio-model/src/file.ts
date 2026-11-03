/**
 * An opened diagram: the draw.io XML as text, its pages (compressed or not)
 * and the planner's state. The object is plain data; writing re-reads `xml`.
 */
import { decodeCompressedPage, type PageCodec } from './codec'
import {
  extractDiagramXml,
  openFailure,
  type DiagramFormat,
  type DiagramOpenFailure,
} from './format'
import { cellsOfModel, parseGraphModel } from './model'
import type { DiagramCell, DiagramState } from './types'
import {
  childElements,
  decodeXmlText,
  escapeXmlAttr,
  getAttr,
  parseXmlTree,
  XmlParseError,
  type XmlElement,
  type XmlTree,
} from './xml-tree'

export interface DiagramPageInfo {
  /** The `<diagram id>`, or a made-up `page-N` when the file has none. */
  id: string
  name: string
  /** True when the page is stored in draw.io's compressed form. */
  compressed: boolean
}

export interface DiagramFile {
  format: DiagramFormat
  /** The draw.io XML (an `mxfile`, or a bare one-page `mxGraphModel`), without a BOM. */
  xml: string
  /** The file started with a UTF-8 byte order mark. */
  bom: boolean
  root: 'mxfile' | 'mxGraphModel'
  pages: DiagramPageInfo[]
  state: DiagramState
}

export type DiagramOpenResult = { ok: true; file: DiagramFile } | DiagramOpenFailure

export const DEFAULT_PAGE_NAME = 'Page-1'

/** What a page holds, as the writer needs it. */
export interface PageSource {
  element: XmlElement | null
  /** The page's `mxGraphModel` XML (empty for an empty page). */
  modelXml: string
  compressed: boolean
}

export function textContent(element: XmlElement): string {
  return element.children
    .map((child) => (child.type === 'raw' && child.text ? decodeXmlText(child.raw) : ''))
    .join('')
    .trim()
}

/** Made-up ids for pages without one, avoiding the ids that are there. */
export function pageIds(elements: XmlElement[]): string[] {
  const taken = new Set(elements.map((el) => getAttr(el, 'id')).filter((id) => id !== undefined))
  return elements.map((el, index) => {
    const id = getAttr(el, 'id')
    if (id !== undefined) return id
    let n = index + 1
    while (taken.has(`page-${n}`)) n++
    taken.add(`page-${n}`)
    return `page-${n}`
  })
}

type PageRead = { ok: true; source: PageSource; cells: DiagramCell[] } | DiagramOpenFailure

/** Reads one `<diagram>` element. */
export function readPage(tree: XmlTree, element: XmlElement, codec: PageCodec): PageRead {
  const elements = childElements(element)
  if (elements.length > 0) {
    const model = elements[0]!
    if (elements.length > 1 || model.name !== 'mxGraphModel') {
      return openFailure('no_diagram', `a page holds <${model.name}>, not <mxGraphModel>`)
    }
    return {
      ok: true,
      source: { element, modelXml: tree.source.slice(model.start, model.end), compressed: false },
      cells: cellsOfModel(model),
    }
  }
  const text = textContent(element)
  if (text === '')
    return { ok: true, source: { element, modelXml: '', compressed: false }, cells: [] }
  let modelXml: string
  try {
    modelXml = decodeCompressedPage(text, codec)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return openFailure('decompress_failed', `a compressed page cannot be decoded: ${detail}`)
  }
  const parsed = parseGraphModel(modelXml)
  if (!parsed.ok) return parsed
  return { ok: true, source: { element, modelXml, compressed: true }, cells: parsed.cells }
}

/** Parses draw.io XML into a diagram. */
export function parseDiagramXml(
  xml: string,
  codec: PageCodec,
  options: { format?: DiagramFormat; bom?: boolean } = {},
): DiagramOpenResult {
  let tree: XmlTree
  try {
    tree = parseXmlTree(xml)
  } catch (error) {
    if (error instanceof XmlParseError) {
      return openFailure('not_xml', `the file is not XML: ${error.message}`)
    }
    throw error
  }
  const format = options.format ?? 'drawio'
  const bom = options.bom ?? false
  const root = tree.root
  if (root.name === 'mxGraphModel') {
    return {
      ok: true,
      file: {
        format,
        xml,
        bom,
        root: 'mxGraphModel',
        pages: [{ id: 'page-1', name: DEFAULT_PAGE_NAME, compressed: false }],
        state: { pages: [{ id: 'page-1', name: DEFAULT_PAGE_NAME, cells: cellsOfModel(root) }] },
      },
    }
  }
  if (root.name !== 'mxfile') {
    return openFailure('no_diagram', `the XML is <${root.name}>, not a draw.io diagram`)
  }
  const elements = childElements(root, 'diagram')
  if (elements.length === 0) return openFailure('no_diagram', 'the diagram has no pages')
  const ids = pageIds(elements)
  const file: DiagramFile = { format, xml, bom, root: 'mxfile', pages: [], state: { pages: [] } }
  for (const [index, element] of elements.entries()) {
    const page = readPage(tree, element, codec)
    if (!page.ok) return page
    const id = ids[index]!
    const name = getAttr(element, 'name') ?? `Page-${index + 1}`
    file.pages.push({ id, name, compressed: page.source.compressed })
    file.state.pages.push({ id, name, cells: page.cells })
  }
  return { ok: true, file }
}

/** Opens a diagram file from its name and bytes. */
export function openDiagram(
  fileName: string,
  bytes: Uint8Array,
  codec: PageCodec,
): DiagramOpenResult {
  const extracted = extractDiagramXml(fileName, bytes, codec)
  if (!extracted.ok) return extracted
  return parseDiagramXml(extracted.xml, codec, { format: extracted.format, bom: extracted.bom })
}

/** The model draw.io gives a new page, indented under `indent`. */
export function blankModelXml(indent = ''): string {
  const i = (n: number): string => (indent === '' ? '' : indent + '  '.repeat(n))
  return [
    '<mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">',
    `${i(1)}<root>`,
    `${i(2)}<mxCell id="0" />`,
    `${i(2)}<mxCell id="1" parent="0" />`,
    `${i(1)}</root>`,
    `${i(0)}</mxGraphModel>`,
  ].join('')
}

/** A new, uncompressed one-page diagram. */
export function createDiagramFile(options: { pageName?: string } = {}): DiagramFile {
  const name = options.pageName ?? DEFAULT_PAGE_NAME
  const xml = [
    '<mxfile>',
    `  <diagram id="page-1" name="${escapeXmlAttr(name)}">`,
    `    ${blankModelXml('\n    ')}`,
    '  </diagram>',
    '</mxfile>',
    '',
  ].join('\n')
  const result = parseDiagramXml(xml, {
    inflateRaw: () => new Uint8Array(),
    deflateRaw: () => new Uint8Array(),
  })
  if (!result.ok) throw new Error(result.message)
  return result.file
}
