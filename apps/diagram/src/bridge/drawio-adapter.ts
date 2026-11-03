/**
 * The live diagram over draw.io's own objects: its editor (`EditorUi`), the
 * one model of the page on screen, its pages and its undo history. Runs only
 * inside the draw.io frame; draw.io's classes are page globals there.
 *
 * Page switches inside an edit are recorded the way draw.io records them
 * (`SelectPage` executed through the model), so undo walks back across pages
 * as it does for draw.io's own page actions.
 */
import type { DiagramCell, DiagramGeometry } from '@genoffice/drawio-model'
import type { LiveDiagram } from './apply-primitives'

declare const mxCell: any
declare const mxGeometry: any
declare const mxUtils: any
declare const SelectPage: any
declare const RenamePage: any

/** draw.io's editor object (`App`, an `EditorUi`). Untyped: it is draw.io's minified code. */
export type DrawioUi = any

function pageById(ui: DrawioUi, id: string): any {
  const page = ui.getPageById(id)
  if (!page) throw new Error(`no page ${id}`)
  return page
}

/** The root cell of a page, read without showing the page. */
export function pageRoot(ui: DrawioUi, page: any): any {
  if (page === ui.currentPage) return ui.editor.graph.model.getRoot()
  ui.updatePageRoot(page)
  return page.root
}

function collectIds(cell: any, into: Set<string>): void {
  if (!cell) return
  if (cell.id != null) into.add(String(cell.id))
  const children: any[] = cell.children ?? []
  for (const child of children) collectIds(child, into)
}

export function liveDiagram(ui: DrawioUi): LiveDiagram {
  const graph = () => ui.editor.graph
  const model = () => graph().model
  const undo = () => ui.editor.undoManager
  return {
    currentPageId: () => (ui.currentPage ? String(ui.currentPage.getId()) : null),
    pageIds: () => (ui.pages ?? []).map((page: any) => String(page.getId())),
    cellIds: (pageId) => {
      const ids = new Set<string>()
      collectIds(pageRoot(ui, pageById(ui, pageId)), ids)
      return ids
    },
    beginUpdate: () => model().beginUpdate(),
    endUpdate: () => model().endUpdate(),
    historyLength: () => undo().history.length,
    dropLastStep: () => {
      const manager = undo()
      manager.undo()
      manager.trim()
    },
    selectPage: (pageId) => {
      if (graph().isEditing()) graph().stopEditing(false)
      // draw.io refreshes the saved XML of the page on screen only, once the
      // edit ends; the page this edit leaves may have changed in it, so its
      // XML is taken again as the page is left (else its changes are lost)
      ui.currentPage?.setDiagramModified?.(true)
      model().execute(new SelectPage(ui, pageById(ui, pageId)))
    },
    addPage: (id, name) => {
      ui.insertPage(ui.createPage(name, id), ui.pages.length)
    },
    renamePage: (pageId, name) => {
      model().execute(new RenamePage(ui, pageById(ui, pageId), name))
    },
    removePage: (pageId) => {
      ui.removePage(pageById(ui, pageId))
    },
    addCell: (cell: DiagramCell) => {
      const m = model()
      const parent = m.getCell(cell.parent)
      if (!parent) throw new Error(`no parent ${String(cell.parent)}`)
      let created: any
      if (cell.kind === 'edge') {
        const geometry = new mxGeometry()
        geometry.relative = true
        created = new mxCell(cell.value, geometry, cell.style)
        created.edge = true
      } else {
        const g = cell.geometry ?? { x: 0, y: 0, width: 0, height: 0 }
        created = new mxCell(cell.value, new mxGeometry(g.x, g.y, g.width, g.height), cell.style)
        created.vertex = cell.kind === 'vertex'
      }
      created.setId(cell.id)
      m.add(parent, created)
      if (cell.kind === 'edge') {
        if (cell.source !== undefined) m.setTerminal(created, m.getCell(cell.source), true)
        if (cell.target !== undefined) m.setTerminal(created, m.getCell(cell.target), false)
      }
      return String(created.getId())
    },
    updateCell: (
      id,
      change: { value?: string; style?: string; geometry?: Partial<DiagramGeometry> },
    ) => {
      const m = model()
      const cell = m.getCell(id)
      if (!cell) throw new Error(`no cell ${id}`)
      if (change.value !== undefined) {
        if (mxUtils.isNode(cell.value)) {
          // a cell with properties keeps them; the label is one of its attributes
          const value = cell.value.cloneNode(true)
          value.setAttribute('label', change.value)
          m.setValue(cell, value)
        } else {
          m.setValue(cell, change.value)
        }
      }
      if (change.style !== undefined) m.setStyle(cell, change.style)
      if (change.geometry !== undefined) {
        const geometry = cell.geometry ? cell.geometry.clone() : new mxGeometry()
        for (const key of ['x', 'y', 'width', 'height'] as const) {
          const value = change.geometry[key]
          if (value !== undefined) geometry[key] = value
        }
        m.setGeometry(cell, geometry)
      }
    },
    removeCell: (id) => {
      const m = model()
      const cell = m.getCell(id)
      // already gone with a container removed before it
      if (cell) m.remove(cell)
    },
    insertXml: (xml, x, y) => {
      // draw.io's own Insert › Mermaid: cropped to x, y, the converted-diagram
      // edge style, and errors thrown instead of shown (`noErrorHandling`)
      const styles =
        typeof ui.getConvertedDiagramStyles === 'function' ? ui.getConvertedDiagramStyles() : null
      // A page switched to inside this edit is not in the graph's view yet: its
      // default parent still names the layer of the page shown before, which
      // the import would draw into. The page's own first layer takes it then.
      const g = graph()
      const parent = g.defaultParent
      if (parent != null && !model().contains(parent)) g.setDefaultParent(null)
      const cells: any[] = ui.importXml(xml, x, y, true, true, null, styles) ?? []
      const ids = new Set<string>()
      for (const cell of cells) collectIds(cell, ids)
      return [...ids]
    },
  }
}

const EMPTY_MODEL =
  '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'

/** Every page's `mxGraphModel` XML (uncompressed), as draw.io would save it now. */
export function readPageXmls(ui: DrawioUi): { id: string; name: string; xml: string }[] {
  const file = ui.getXmlFileData(true, false, true)
  const out: { id: string; name: string; xml: string }[] = []
  const diagrams = file.getElementsByTagName('diagram')
  for (let i = 0; i < diagrams.length; i++) {
    const diagram = diagrams[i]
    let model: any = null
    for (let child = diagram.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 1 && child.nodeName === 'mxGraphModel') {
        model = child
        break
      }
    }
    out.push({
      id: String(diagram.getAttribute('id') ?? `page-${i + 1}`),
      name: String(diagram.getAttribute('name') ?? `Page-${i + 1}`),
      xml: model ? mxUtils.getXml(model) : EMPTY_MODEL,
    })
  }
  return out
}
