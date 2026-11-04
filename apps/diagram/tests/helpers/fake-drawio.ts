/**
 * A stand-in for draw.io behind the frame client: pages of cells, the page on
 * screen, the selection, and an undo history of whole snapshots. Its bridge
 * answers the requests the AI tools make (`readPages`, `convertMermaid`,
 * `applyBatch`, `undoBatches`) with the bridge's own rules
 * (`applyStepsLive`), and records every request it got.
 */
import { parseGraphModel, type DiagramCell } from '@genoffice/drawio-model'
import { applyStepsLive, type LiveDiagram } from '../../src/bridge/apply-primitives'
import type { BridgeOp, BridgeOps } from '../../src/shared/bridge-protocol'
import type { DrawioFrame } from '../../src/renderer/drawio/frame-client'

interface Page {
  name: string
  cells: DiagramCell[]
}

const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function modelXml(cells: readonly DiagramCell[]): string {
  const rows = cells.map((cell) => {
    const attrs = [`id="${escapeXml(cell.id)}"`]
    if (cell.parent !== null) attrs.push(`parent="${escapeXml(cell.parent)}"`)
    if (cell.value) attrs.push(`value="${escapeXml(cell.value)}"`)
    if (cell.style) attrs.push(`style="${escapeXml(cell.style)}"`)
    if (cell.kind === 'vertex') attrs.push('vertex="1"')
    if (cell.kind === 'edge') attrs.push('edge="1"')
    if (cell.source !== undefined) attrs.push(`source="${escapeXml(cell.source)}"`)
    if (cell.target !== undefined) attrs.push(`target="${escapeXml(cell.target)}"`)
    const g = cell.geometry
    const geometry = g
      ? `<mxGeometry x="${g.x}" y="${g.y}" width="${g.width}" height="${g.height}" as="geometry"/>`
      : cell.kind === 'edge'
        ? '<mxGeometry relative="1" as="geometry"/>'
        : ''
    return `<mxCell ${attrs.join(' ')}>${geometry}</mxCell>`
  })
  return `<mxGraphModel><root>${rows.join('')}</root></mxGraphModel>`
}

const vertex = (
  id: string,
  value: string,
  x: number,
  y: number,
  width = 120,
  height = 60,
): DiagramCell => ({
  id,
  parent: '1',
  value,
  style: 'rounded=1;whiteSpace=wrap;html=1;',
  kind: 'vertex',
  geometry: { x, y, width, height },
})

/** Two pages: One (p1) with shapes a and b and an edge between them, Two (p2) with shape c. */
export function sampleCells(): Map<string, Page> {
  const root = (): DiagramCell[] => [
    { id: '0', parent: null, value: '', style: '', kind: 'other' },
    { id: '1', parent: '0', value: '', style: '', kind: 'other' },
  ]
  return new Map([
    [
      'p1',
      {
        name: 'One',
        cells: [
          ...root(),
          vertex('a', 'Start', 0, 0),
          vertex('b', 'End', 200, 0),
          {
            id: 'e',
            parent: '1',
            value: '',
            style: 'edgeStyle=orthogonalEdgeStyle;html=1;',
            kind: 'edge',
            source: 'a',
            target: 'b',
          },
        ],
      },
    ],
    ['p2', { name: 'Two', cells: [...root(), vertex('c', 'Alone', 40, 40)] }],
  ])
}

export class FakeDrawio implements LiveDiagram {
  pages: Map<string, Page>
  current: string
  selected: string[] = []
  history: string[] = []
  #depth = 0
  #before = ''
  #nextId = 1
  /** what `insertXml` was given */
  inserted: Array<{ xml: string; x: number; y: number }> = []

  constructor(pages = sampleCells(), current = 'p1') {
    this.pages = pages
    this.current = current
  }

  snapshot(): string {
    return JSON.stringify({ current: this.current, pages: [...this.pages] })
  }

  restore(json: string): void {
    const data = JSON.parse(json) as { current: string; pages: [string, Page][] }
    this.current = data.current
    this.pages = new Map(data.pages)
  }

  #page(): Page {
    return this.pages.get(this.current)!
  }

  currentPageId = () => this.current
  pageIds = () => [...this.pages.keys()]
  cellIds = (pageId: string) => new Set(this.pages.get(pageId)!.cells.map((cell) => cell.id))
  beginUpdate = () => {
    if (this.#depth++ === 0) this.#before = this.snapshot()
  }
  endUpdate = () => {
    if (--this.#depth === 0 && this.snapshot() !== this.#before) this.history.push(this.#before)
  }
  historyLength = () => this.history.length
  dropLastStep = () => this.restore(this.history.pop()!)
  selectPage = (pageId: string) => {
    this.current = pageId
  }
  addPage = (id: string, name: string) => {
    this.pages.set(id, {
      name,
      cells: [
        { id: '0', parent: null, value: '', style: '', kind: 'other' },
        { id: '1', parent: '0', value: '', style: '', kind: 'other' },
      ],
    })
    this.current = id
  }
  renamePage = (pageId: string, name: string) => {
    this.pages.get(pageId)!.name = name
  }
  removePage = (pageId: string) => {
    this.pages.delete(pageId)
    if (this.current === pageId) this.current = this.pageIds()[0]!
  }
  addCell = (cell: DiagramCell) => {
    this.#page().cells.push(structuredClone(cell))
    return cell.id
  }
  updateCell = (
    id: string,
    change: { value?: string; style?: string; geometry?: Partial<DiagramCell['geometry']> },
  ) => {
    const cell = this.#page().cells.find((c) => c.id === id)!
    if (change.value !== undefined) cell.value = change.value
    if (change.style !== undefined) cell.style = change.style
    if (change.geometry) cell.geometry = { ...cell.geometry!, ...change.geometry }
  }
  removeCell = (id: string) => {
    const page = this.#page()
    page.cells = page.cells.filter((cell) => cell.id !== id && cell.parent !== id)
  }
  /** draw.io's import, simplified: new ids, the drawing cropped to x, y */
  insertXml = (xml: string, x: number, y: number) => {
    this.inserted.push({ xml, x, y })
    const parsed = parseGraphModel(xml)
    if (!parsed.ok) throw new Error(parsed.message)
    const root = parsed.cells.find((cell) => cell.parent === null)
    const layers = new Set(parsed.cells.filter((cell) => cell.parent === root?.id).map((c) => c.id))
    const drawn = parsed.cells.filter((cell) => cell !== root && !layers.has(cell.id))
    const ids = new Map(drawn.map((cell) => [cell.id, `drawio-${this.#nextId++}`]))
    const top = drawn.filter((cell) => cell.parent !== null && layers.has(cell.parent))
    const left = Math.min(...top.filter((c) => c.geometry).map((c) => c.geometry!.x))
    const upper = Math.min(...top.filter((c) => c.geometry).map((c) => c.geometry!.y))
    for (const cell of drawn) {
      const isTop = cell.parent !== null && layers.has(cell.parent)
      this.#page().cells.push({
        ...cell,
        id: ids.get(cell.id)!,
        parent: isTop ? '1' : ids.get(cell.parent!)!,
        ...(cell.source ? { source: ids.get(cell.source) } : {}),
        ...(cell.target ? { target: ids.get(cell.target) } : {}),
        ...(cell.geometry && isTop
          ? {
              geometry: {
                ...cell.geometry,
                x: cell.geometry.x - left + x,
                y: cell.geometry.y - upper + y,
              },
            }
          : {}),
      })
    }
    return [...ids.values()]
  }
}

/** A converted Mermaid flowchart as draw.io's converter wraps it: a group with two boxes and an edge. */
export const MERMAID_XML =
  '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
  '<UserObject id="g" label="" mermaidData="{}"><mxCell style="group;" vertex="1" parent="1"><mxGeometry x="500" y="300" width="300" height="60" as="geometry"/></mxCell></UserObject>' +
  '<mxCell id="n1" value="Go" style="rounded=1;" vertex="1" parent="g"><mxGeometry x="0" y="0" width="100" height="60" as="geometry"/></mxCell>' +
  '<mxCell id="n2" value="Stop" style="rounded=1;" vertex="1" parent="g"><mxGeometry x="200" y="0" width="100" height="60" as="geometry"/></mxCell>' +
  '<mxCell id="l1" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="g" source="n1" target="n2"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="150" y="30"/></Array></mxGeometry></mxCell>' +
  '</root></mxGraphModel>'

export interface FakeFrame {
  frame: DrawioFrame
  drawio: FakeDrawio
  /** every request the bridge got, by op name, in order */
  calls: BridgeOp[]
  /** the args of each `applyBatch` */
  batches: BridgeOps['applyBatch']['request'][]
}

/** The frame client over a fake draw.io. `convert` stands for draw.io's Mermaid converter. */
export function fakeFrame(
  drawio = new FakeDrawio(),
  convert: (text: string) => string = () => MERMAID_XML,
): FakeFrame {
  const calls: BridgeOp[] = []
  const batches: BridgeOps['applyBatch']['request'][] = []
  const edits = new Map<string, number>()
  let seq = 0
  const request = async (op: BridgeOp, args: unknown): Promise<unknown> => {
    calls.push(op)
    switch (op) {
      case 'readPages':
        return {
          pages: [...drawio.pages].map(([id, page]) => ({
            id,
            name: page.name,
            xml: modelXml(page.cells),
          })),
          currentPage: drawio.current,
          selected: [...drawio.selected],
        }
      case 'convertMermaid':
        return { xml: convert((args as { text: string }).text) }
      case 'applyBatch': {
        const request = structuredClone(args) as BridgeOps['applyBatch']['request']
        batches.push(request)
        const before = drawio.historyLength()
        const result = applyStepsLive(drawio, request.steps)
        let token: string | null = null
        if (drawio.historyLength() > before) {
          token = `b${++seq}`
          edits.set(token, drawio.historyLength())
        }
        return { ...result, token }
      }
      case 'undoBatches': {
        let undone = 0
        for (const token of [...(args as { tokens: string[] }).tokens].reverse()) {
          if (edits.get(token) !== drawio.historyLength()) break
          drawio.dropLastStep()
          edits.delete(token)
          undone++
        }
        return { undone }
      }
      default:
        throw new Error(`the fake bridge does not answer ${op}`)
    }
  }
  return { frame: { request } as unknown as DrawioFrame, drawio, calls, batches }
}
