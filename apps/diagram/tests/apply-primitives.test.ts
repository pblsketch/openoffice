// Primitive changes on the live diagram: checked first, applied as one undo
// step, pages switched inside the step, and taken back whole on failure.
import { describe, expect, it } from 'vitest'
import type { DiagramCell, DiagramPrimitive } from '@genoffice/drawio-model'
import {
  PrimitiveError,
  applyPrimitivesLive,
  type LiveDiagram,
} from '../src/bridge/apply-primitives'

interface FakeCell {
  id: string
  parent: string | null
  value: string
  style: string
  geometry?: { x: number; y: number; width: number; height: number }
  source?: string
  target?: string
}

/** A small stand-in for draw.io: pages of cells, one shown, an undo history of whole snapshots. */
class FakeDiagram implements LiveDiagram {
  pages = new Map<string, { name: string; cells: Map<string, FakeCell> }>()
  order: string[] = []
  current: string
  history: string[] = []
  log: string[] = []
  depth = 0
  failOn: string | null = null
  #before = ''

  constructor() {
    for (const id of ['p1', 'p2']) {
      this.pages.set(id, { name: id.toUpperCase(), cells: new Map() })
      this.order.push(id)
      for (const cell of [
        { id: '0', parent: null, value: '', style: '' },
        { id: '1', parent: '0', value: '', style: '' },
        { id: `${id}-a`, parent: '1', value: 'A', style: 'rounded=1;' },
      ]) {
        this.pages.get(id)!.cells.set(cell.id, cell)
      }
    }
    this.current = 'p1'
  }

  snapshot(): string {
    return JSON.stringify({
      current: this.current,
      order: this.order,
      pages: [...this.pages].map(([id, page]) => [id, page.name, [...page.cells.values()]]),
    })
  }

  restore(json: string): void {
    const data = JSON.parse(json) as {
      current: string
      order: string[]
      pages: [string, string, FakeCell[]][]
    }
    this.current = data.current
    this.order = data.order
    this.pages = new Map(
      data.pages.map(([id, name, cells]) => [
        id,
        { name, cells: new Map(cells.map((c) => [c.id, c])) },
      ]),
    )
  }

  #page() {
    return this.pages.get(this.current)!
  }
  #maybeFail(what: string): void {
    this.log.push(what)
    if (this.failOn === what) throw new Error(`draw.io failed at ${what}`)
  }

  currentPageId = () => this.current
  pageIds = () => [...this.order]
  cellIds = (pageId: string) => new Set(this.pages.get(pageId)!.cells.keys())
  beginUpdate = () => {
    if (this.depth++ === 0) this.#before = this.snapshot()
    this.log.push('begin')
  }
  endUpdate = () => {
    this.log.push('end')
    if (--this.depth === 0 && this.snapshot() !== this.#before) this.history.push(this.#before)
  }
  historyLength = () => this.history.length
  dropLastStep = () => {
    this.restore(this.history.pop()!)
  }
  selectPage = (pageId: string) => {
    this.#maybeFail(`select:${pageId}`)
    this.current = pageId
  }
  addPage = (id: string, name: string) => {
    this.#maybeFail(`addPage:${id}`)
    this.pages.set(id, {
      name,
      cells: new Map([
        ['0', { id: '0', parent: null, value: '', style: '' }],
        ['1', { id: '1', parent: '0', value: '', style: '' }],
      ]),
    })
    this.order.push(id)
    this.current = id
  }
  renamePage = (pageId: string, name: string) => {
    this.pages.get(pageId)!.name = name
  }
  removePage = (pageId: string) => {
    this.pages.delete(pageId)
    this.order = this.order.filter((id) => id !== pageId)
    if (this.current === pageId) this.current = this.order[0]!
  }
  addCell = (cell: DiagramCell) => {
    this.#maybeFail(`add:${cell.id}`)
    this.#page().cells.set(cell.id, {
      id: cell.id,
      parent: cell.parent,
      value: cell.value,
      style: cell.style,
      ...(cell.geometry ? { geometry: cell.geometry } : {}),
      ...(cell.source ? { source: cell.source } : {}),
      ...(cell.target ? { target: cell.target } : {}),
    })
    return cell.id
  }
  updateCell = (
    id: string,
    change: { value?: string; style?: string; geometry?: Partial<FakeCell['geometry']> },
  ) => {
    this.#maybeFail(`update:${id}`)
    const cell = this.#page().cells.get(id)!
    if (change.value !== undefined) cell.value = change.value
    if (change.style !== undefined) cell.style = change.style
    if (change.geometry)
      cell.geometry = {
        ...(cell.geometry ?? { x: 0, y: 0, width: 0, height: 0 }),
        ...change.geometry,
      }
  }
  removeCell = (id: string) => {
    this.#page().cells.delete(id)
  }
}

const vertex = (page: string, id: string, extra: Partial<DiagramCell> = {}): DiagramPrimitive => ({
  kind: 'add_cell',
  page,
  cell: {
    id,
    parent: '1',
    value: id,
    style: 'html=1;',
    kind: 'vertex',
    geometry: { x: 0, y: 0, width: 120, height: 60 },
    ...extra,
  },
})

describe('applyPrimitivesLive', () => {
  it('applies a batch as one undo step and answers the ids made', () => {
    const live = new FakeDiagram()
    const result = applyPrimitivesLive(live, [
      vertex('p1', 's1'),
      vertex('p1', 's2'),
      {
        kind: 'add_cell',
        page: 'p1',
        cell: {
          id: 'e1',
          parent: '1',
          value: '',
          style: 'html=1;',
          kind: 'edge',
          source: 's1',
          target: 's2',
        },
      },
      { kind: 'update_cell', page: 'p1', id: 'p1-a', value: 'B', geometry: { x: 10 } },
    ])
    expect(result.created).toEqual(['s1', 's2', 'e1'])
    expect(live.history).toHaveLength(1)
    expect(live.log.filter((step) => step === 'begin')).toHaveLength(1)
    expect(live.pages.get('p1')!.cells.get('p1-a')).toMatchObject({
      value: 'B',
      geometry: { x: 10 },
    })
    // one undo takes the whole batch back
    live.dropLastStep()
    expect([...live.pages.get('p1')!.cells.keys()]).toEqual(['0', '1', 'p1-a'])
  })

  it('switches to another page inside the step and comes back to the page on screen', () => {
    const live = new FakeDiagram()
    applyPrimitivesLive(live, [vertex('p2', 's1'), vertex('p1', 's2')])
    expect(live.pages.get('p2')!.cells.has('s1')).toBe(true)
    expect(live.pages.get('p1')!.cells.has('s2')).toBe(true)
    expect(live.current).toBe('p1')
    expect(live.log).toEqual(['begin', 'select:p2', 'add:s1', 'select:p1', 'add:s2', 'end'])
    expect(live.history).toHaveLength(1)
  })

  it('adds, renames and removes pages in the same step', () => {
    const live = new FakeDiagram()
    const result = applyPrimitivesLive(live, [
      { kind: 'add_page', id: 'p3', name: 'Third' },
      vertex('p3', 's1'),
      { kind: 'rename_page', page: 'p2', name: 'Second' },
      { kind: 'remove_page', page: 'p1' },
    ])
    expect(result.created).toEqual(['p3', 's1'])
    expect(live.order).toEqual(['p2', 'p3'])
    expect(live.pages.get('p2')!.name).toBe('Second')
    expect(live.history).toHaveLength(1)
  })

  it('changes nothing when a primitive does not fit the diagram', () => {
    const live = new FakeDiagram()
    const before = live.snapshot()
    for (const batch of [
      [vertex('p1', 's1'), { kind: 'update_cell', page: 'p1', id: 'missing', value: 'x' }],
      [vertex('p1', 'p1-a')],
      [vertex('p1', 's1', { parent: 'nowhere' })],
      [vertex('p9', 's1')],
      [
        vertex('p1', 's1'),
        {
          kind: 'add_cell',
          page: 'p1',
          cell: {
            id: 'e',
            parent: '1',
            value: '',
            style: '',
            kind: 'edge',
            source: 's1',
            target: 'zz',
          },
        },
      ],
      [{ kind: 'remove_cells', page: 'p1', ids: ['p1-a', 'gone'] }],
      [
        { kind: 'remove_page', page: 'p1' },
        { kind: 'remove_page', page: 'p2' },
      ],
    ] as DiagramPrimitive[][]) {
      expect(() => applyPrimitivesLive(live, batch)).toThrow(PrimitiveError)
      expect(live.snapshot()).toBe(before)
      expect(live.history).toHaveLength(0)
    }
  })

  it('takes the whole step back when draw.io fails half-way, leaving no redo', () => {
    const live = new FakeDiagram()
    const before = live.snapshot()
    live.failOn = 'add:s2'
    expect(() => applyPrimitivesLive(live, [vertex('p1', 's1'), vertex('p1', 's2')])).toThrow(/s2/)
    expect(live.snapshot()).toBe(before)
    expect(live.history).toHaveLength(0)
  })

  it('sees earlier primitives of the batch', () => {
    const live = new FakeDiagram()
    applyPrimitivesLive(live, [
      vertex('p1', 's1'),
      { kind: 'update_cell', page: 'p1', id: 's1', style: 'ellipse;' },
      { kind: 'remove_cells', page: 'p1', ids: ['s1'] },
    ])
    expect(live.pages.get('p1')!.cells.has('s1')).toBe(false)
  })

  it('does nothing for an empty batch', () => {
    const live = new FakeDiagram()
    expect(applyPrimitivesLive(live, [])).toEqual({ created: [] })
    expect(live.log).toEqual([])
  })
})
