/**
 * Writing primitives into a `.drawio`/`.dio` file.
 *
 * Only what changed is rebuilt: an untouched `<diagram>` element is copied
 * byte for byte, a renamed page gets a new start tag, a page whose model
 * changed gets its model rewritten in the form it had (compressed pages stay
 * compressed). Inside a changed uncompressed page, untouched cells are copied
 * as written too. The `mxfile` start tag is never rebuilt.
 */
import { decodeCompressedPage, encodeCompressedPage, type PageCodec } from './codec'
import { blankModelXml, pageIds, textContent, type DiagramFile } from './file'
import { cellElementList, geometryElement, modelRootElement, type CellElements } from './model'
import { planDiagramOps, type DiagramBatchResult, type PlanOptions } from './plan'
import type { DiagramCell, DiagramPrimitive } from './types'
import {
  appendElement,
  childElements,
  getAttr,
  leadingWhitespace,
  markContentDirty,
  newElement,
  parseXmlTree,
  removeElement,
  serializeTree,
  setAttr,
  type XmlAttr,
  type XmlElement,
  type XmlNode,
  type XmlTree,
} from './xml-tree'

export type DiagramWriteResult =
  { ok: true; xml: string; bytes: Uint8Array } | { ok: false; reason: 'needs_app'; message: string }

interface ModelHandle {
  tree: XmlTree
  model: XmlElement
  /** Set for a model kept apart from the file tree (compressed, empty or new page). */
  content?: (modelXml: string) => XmlNode[]
}

interface PageHandle {
  id: string
  /** The `<diagram>` element; null for a bare `mxGraphModel` file. */
  element: XmlElement | null
  model?: ModelHandle
  cells?: Map<string, CellElements>
  dirty: boolean
}

const raw = (text: string, isText = true): XmlNode => ({ type: 'raw', raw: text, text: isText })

function utf8WithBom(xml: string, bom: boolean): Uint8Array {
  const body = new TextEncoder().encode(xml)
  if (!bom) return body
  const out = new Uint8Array(body.length + 3)
  out.set([0xef, 0xbb, 0xbf])
  out.set(body, 3)
  return out
}

function cellAttrs(cell: DiagramCell): XmlAttr[] {
  const attrs: XmlAttr[] = [{ name: 'id', value: cell.id }]
  if (cell.kind !== 'other') {
    attrs.push({ name: 'value', value: cell.value })
    if (cell.style !== '') attrs.push({ name: 'style', value: cell.style })
    attrs.push({ name: cell.kind, value: '1' })
  }
  if (cell.parent !== null) attrs.push({ name: 'parent', value: cell.parent })
  if (cell.source !== undefined) attrs.push({ name: 'source', value: cell.source })
  if (cell.target !== undefined) attrs.push({ name: 'target', value: cell.target })
  return attrs
}

function cellElement(cell: DiagramCell, indent: string): XmlElement {
  let geometry: XmlElement | null = null
  if (cell.kind === 'vertex') {
    const box = cell.geometry ?? { x: 0, y: 0, width: 0, height: 0 }
    geometry = newElement('mxGeometry', [
      { name: 'x', value: String(box.x) },
      { name: 'y', value: String(box.y) },
      { name: 'width', value: String(box.width) },
      { name: 'height', value: String(box.height) },
      { name: 'as', value: 'geometry' },
    ])
  } else if (cell.kind === 'edge') {
    geometry = newElement('mxGeometry', [
      { name: 'relative', value: '1' },
      { name: 'as', value: 'geometry' },
    ])
  }
  const children: XmlNode[] = geometry
    ? indent
      ? [raw(`${indent}  `), geometry, raw(indent)]
      : [geometry]
    : []
  return newElement('mxCell', cellAttrs(cell), children)
}

class FileWriter {
  private tree: XmlTree
  private readonly pages: PageHandle[]
  private readonly compressNewPages: boolean

  constructor(
    private readonly file: DiagramFile,
    private readonly codec: PageCodec,
    wrap: boolean,
  ) {
    let xml = file.xml
    if (file.root === 'mxGraphModel' && wrap) {
      // A bare model becomes the first page of an mxfile once pages change.
      const bare = parseXmlTree(xml).root
      const first = file.pages[0]!
      const escape = (value: string): string =>
        value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
      xml = `<mxfile>\n  <diagram id="${escape(first.id)}" name="${escape(first.name)}">${xml.slice(bare.start, bare.end)}</diagram>\n</mxfile>\n`
    }
    this.tree = parseXmlTree(xml)
    const root = this.tree.root
    if (root.name === 'mxGraphModel') {
      this.pages = [
        {
          id: file.pages[0]!.id,
          element: null,
          model: { tree: this.tree, model: root },
          dirty: false,
        },
      ]
      this.compressNewPages = false
    } else {
      const elements = childElements(root, 'diagram')
      const ids = pageIds(elements)
      this.pages = elements.map((element, i) => ({ id: ids[i]!, element, dirty: false }))
      this.compressNewPages =
        getAttr(root, 'compressed') === 'true' ||
        (file.pages.length > 0 && file.pages.every((page) => page.compressed))
    }
  }

  private page(id: string): PageHandle {
    const page = this.pages.find((p) => p.id === id)
    if (!page) throw new Error(`no page ${id} in the file`)
    return page
  }

  private model(page: PageHandle): ModelHandle {
    if (page.model) return page.model
    const element = page.element!
    const inner = childElements(element)[0]
    if (inner) {
      page.model = { tree: this.tree, model: inner }
      return page.model
    }
    const text = textContent(element)
    if (text !== '') {
      const tree = parseXmlTree(decodeCompressedPage(text, this.codec))
      page.model = {
        tree,
        model: tree.root,
        content: (xml) => [raw(encodeCompressedPage(xml, this.codec))],
      }
    } else {
      const tree = parseXmlTree('<mxGraphModel><root></root></mxGraphModel>')
      page.model = { tree, model: tree.root, content: (xml) => [raw(xml, false)] }
    }
    return page.model
  }

  private cells(page: PageHandle): Map<string, CellElements> {
    if (page.cells) return page.cells
    const root = this.rootElement(page)
    page.cells = new Map()
    for (const entry of cellElementList(root)) {
      const id = getAttr(entry.outer, 'id')
      if (id !== undefined) page.cells.set(id, entry)
    }
    return page.cells
  }

  private rootElement(page: PageHandle): XmlElement {
    const handle = this.model(page)
    let root = modelRootElement(handle.model)
    if (!root) {
      root = newElement('root', [])
      appendElement(handle.model, root)
    }
    return root
  }

  private cell(page: PageHandle, id: string): CellElements {
    const found = this.cells(page).get(id)
    if (!found) throw new Error(`no cell ${id} on page ${page.id}`)
    return found
  }

  apply(primitive: DiagramPrimitive): void {
    switch (primitive.kind) {
      case 'add_cell': {
        const page = this.page(primitive.page)
        const root = this.rootElement(page)
        const last = childElements(root).at(-1)
        const element = cellElement(primitive.cell, last ? leadingWhitespace(last) : '')
        appendElement(root, element)
        this.cells(page).set(primitive.cell.id, { outer: element, cell: element })
        page.dirty = true
        return
      }
      case 'update_cell': {
        const page = this.page(primitive.page)
        const { outer, cell } = this.cell(page, primitive.id)
        if (primitive.value !== undefined) {
          if (outer !== cell) setAttr(outer, 'label', primitive.value)
          else setAttr(cell, 'value', primitive.value)
        }
        if (primitive.style !== undefined) {
          setAttr(cell, 'style', primitive.style === '' ? undefined : primitive.style)
        }
        if (primitive.geometry) {
          let geometry = geometryElement(cell)
          if (!geometry) {
            geometry = newElement('mxGeometry', [{ name: 'as', value: 'geometry' }])
            appendElement(cell, geometry)
          }
          for (const key of ['x', 'y', 'width', 'height'] as const) {
            const value = primitive.geometry[key]
            if (value !== undefined) setAttr(geometry, key, String(value))
          }
        }
        page.dirty = true
        return
      }
      case 'remove_cells': {
        const page = this.page(primitive.page)
        const cells = this.cells(page)
        for (const id of primitive.ids) {
          const entry = cells.get(id)
          if (!entry) continue
          removeElement(entry.outer)
          cells.delete(id)
        }
        page.dirty = true
        return
      }
      case 'add_page':
        this.addPage(primitive.id, primitive.name)
        return
      case 'rename_page': {
        const page = this.page(primitive.page)
        setAttr(page.element!, 'name', primitive.name)
        return
      }
      case 'remove_page': {
        const page = this.page(primitive.page)
        removeElement(page.element!)
        this.pages.splice(this.pages.indexOf(page), 1)
        return
      }
    }
  }

  private addPage(id: string, name: string): void {
    const mxfile = this.tree.root
    const last = childElements(mxfile, 'diagram').at(-1)
    const indent = last ? leadingWhitespace(last) : '\n  '
    const inner = indent ? `${indent}  ` : ''
    const tree = parseXmlTree(blankModelXml(this.compressNewPages ? '' : inner))
    const compressed = this.compressNewPages
    const element = newElement('diagram', [
      { name: 'id', value: id },
      { name: 'name', value: name },
    ])
    appendElement(mxfile, element, indent)
    this.pages.push({
      id,
      element,
      dirty: true,
      model: {
        tree,
        model: tree.root,
        content: (xml) =>
          compressed
            ? [raw(encodeCompressedPage(xml, this.codec))]
            : inner
              ? [raw(inner), raw(xml, false), raw(indent)]
              : [raw(xml, false)],
      },
    })
  }

  finish(): string {
    for (const page of this.pages) {
      const handle = page.model
      if (!page.dirty || !handle?.content || !page.element) continue
      const modelXml = serializeTree({ ...handle.tree, nodes: [handle.model] })
      page.element.children = handle.content(modelXml)
      markContentDirty(page.element)
    }
    return serializeTree(this.tree)
  }
}

const PAGE_PRIMITIVES = new Set<DiagramPrimitive['kind']>([
  'add_page',
  'rename_page',
  'remove_page',
])

/** Writes primitives into a `.drawio`/`.dio` diagram; `.drawio.svg`/`.drawio.png` need the app. */
export function writeDiagramPrimitives(
  file: DiagramFile,
  primitives: readonly DiagramPrimitive[],
  codec: PageCodec,
): DiagramWriteResult {
  if (file.format === 'drawio.svg' || file.format === 'drawio.png') {
    return {
      ok: false,
      reason: 'needs_app',
      message: `writing a .${file.format} file needs the app (draw.io makes the picture)`,
    }
  }
  const writer = new FileWriter(
    file,
    codec,
    primitives.some((primitive) => PAGE_PRIMITIVES.has(primitive.kind)),
  )
  for (const primitive of primitives) writer.apply(primitive)
  const xml = writer.finish()
  return { ok: true, xml, bytes: utf8WithBom(xml, file.bom) }
}

export interface DiagramFileApplyOptions extends Omit<
  PlanOptions,
  'currentPage' | 'selected' | 'defaultPage'
> {
  codec: PageCodec
  /** The page ops without `page` work on (page id or name). Default: the first page. */
  page?: string
}

export interface DiagramFileApplyResult {
  batch: DiagramBatchResult
  /**
   * `unchanged`: nothing to write (read-only or rejected batch);
   * `written`: the new file; `needs_app`: changes to a picture format.
   */
  write:
    | { status: 'unchanged' }
    | { status: 'written'; xml: string; bytes: Uint8Array }
    | { status: 'needs_app'; message: string }
}

/** Plans a batch on a file and writes the result (the CLI's `diagram apply`). */
export function applyDiagramOpsToFile(
  file: DiagramFile,
  ops: readonly unknown[],
  options: DiagramFileApplyOptions,
): DiagramFileApplyResult {
  const { codec, page, ...plan } = options
  const batch = planDiagramOps(file.state, ops, { ...plan, defaultPage: page })
  if (batch.status === 'rejected' || !batch.changed)
    return { batch, write: { status: 'unchanged' } }
  const written = writeDiagramPrimitives(file, batch.primitives, codec)
  if (!written.ok) return { batch, write: { status: 'needs_app', message: written.message } }
  return { batch, write: { status: 'written', xml: written.xml, bytes: written.bytes } }
}
