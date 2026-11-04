import { describe, expect, it } from 'vitest'
import {
  DIAGRAM_OPS,
  DIAGRAM_OP_NAMES,
  SHAPE_STYLES,
  applyPrimitives,
  freeSpotRight,
  opsNeedApp,
  planDiagramOps,
  readDiagramTable,
  type DiagramBatchResult,
  type DiagramState,
} from '../src/index'
import { edge, model, mxfile, open, page, vertex } from './helpers'

const CELLS = [
  vertex('a', 'A', 'rounded=1;html=1;', '0,0,100,50'),
  vertex('b', 'B', 'ellipse;', '200,0,100,50'),
  vertex('g', '', 'group;', '400,0,200,100'),
  vertex('g1', 'G1', 'html=1;', '10,10,50,50', 'g'),
  vertex('s1', 'taken', '', '0,300,10,10'),
  edge('e', 'a', 'b'),
  edge('eg', 'b', 'g1'),
].join('')

function state(): DiagramState {
  return open(
    mxfile(
      page('p1', 'First', model(CELLS)),
      page('p2', 'Second', model(vertex('x', 'X', 'html=1;', '0,0,10,10'))),
    ),
  ).state
}

function plan(ops: unknown[], options = {}): DiagramBatchResult {
  return planDiagramOps(state(), ops, options)
}

function cells(result: DiagramBatchResult, pageId = 'p1') {
  return result.state.pages.find((p) => p.id === pageId)!.cells
}

function cell(result: DiagramBatchResult, id: string, pageId = 'p1') {
  return cells(result, pageId).find((c) => c.id === id)
}

function rejected(ops: unknown[], code: string, options = {}) {
  const result = plan(ops, options)
  expect(result.status).toBe('rejected')
  expect(result.primitives).toEqual([])
  expect(result.changed).toBe(false)
  const failure = result.results.find((r) => r.status === 'failed')
  expect(failure?.error?.code).toBe(code)
  expect(failure?.error?.message).toBeTruthy()
  return failure!
}

describe('op definitions', () => {
  it('describes every op as data with an input schema', () => {
    expect(DIAGRAM_OPS.map((op) => op.name)).toEqual([
      'read',
      'add_shape',
      'add_edge',
      'update',
      'delete',
      'add_page',
      'rename_page',
      'delete_page',
      'insert_mermaid',
    ])
    expect(DIAGRAM_OP_NAMES).toEqual(DIAGRAM_OPS.map((op) => op.name))
    for (const op of DIAGRAM_OPS) {
      expect(op.description).not.toBe('')
      expect(op.input.type).toBe('object')
      expect(op.input.additionalProperties).toBe(false)
    }
    const addShape = DIAGRAM_OPS.find((op) => op.name === 'add_shape')!
    expect(addShape.input.required).toEqual(['label', 'x', 'y'])
    expect(addShape.input.properties['shape']!.enum).toContain('cylinder')
    expect(addShape.input.properties['width']!.default).toBe(120)
    expect(DIAGRAM_OPS.find((op) => op.name === 'insert_mermaid')!.needsApp).toBe(true)
    expect(DIAGRAM_OPS.find((op) => op.name === 'read')!.changes).toBe(false)
  })

  it('tells when a batch needs the app', () => {
    expect(opsNeedApp([{ op: 'read' }, { op: 'insert_mermaid', text: 'graph TD;A-->B' }])).toBe(
      true,
    )
    expect(opsNeedApp([{ op: 'add_page', name: 'x' }])).toBe(false)
  })
})

describe('read', () => {
  it('returns the table and changes nothing', () => {
    const result = plan([{ op: 'read', page: 'Second' }])
    expect(result.status).toBe('ok')
    expect(result.changed).toBe(false)
    expect(result.primitives).toEqual([])
    expect(result.results[0]!.read!.page.shapes.map((s) => s.id)).toEqual(['x'])
    expect(result.results[0]!.read!.pages).toHaveLength(2)
  })

  it('sees the earlier ops of the same batch', () => {
    const result = plan([{ op: 'add_shape', id: 'n', label: 'new', x: 1, y: 2 }, { op: 'read' }])
    expect(result.results[1]!.read!.page.shapes.map((s) => s.id)).toContain('n')
  })

  it('marks the current page and the selection in the app', () => {
    const result = plan([{ op: 'read' }], { currentPage: 'p2', selected: ['x'] })
    expect(result.results[0]!.read!.page).toMatchObject({ id: 'p2', selected: ['x'] })
    expect(result.results[0]!.read!.pages[1]).toEqual({ id: 'p2', name: 'Second', current: true })
  })
})

describe('add_shape', () => {
  it('adds a shape with the default size and the style of its shape name', () => {
    const result = plan([
      { op: 'add_shape', label: 'Hello <you>\nthere', shape: 'cylinder', x: 5, y: 6 },
    ])
    expect(result.status).toBe('ok')
    expect(result.created).toEqual(['s2'])
    expect(result.results[0]!.created).toEqual(['s2'])
    expect(result.primitives).toEqual([
      {
        kind: 'add_cell',
        page: 'p1',
        cell: {
          id: 's2',
          parent: '1',
          value: 'Hello &lt;you&gt;<br>there',
          style: SHAPE_STYLES.cylinder,
          kind: 'vertex',
          geometry: { x: 5, y: 6, width: 120, height: 60 },
        },
      },
    ])
  })

  it('uses rectangle by default and lets style win over shape', () => {
    const result = plan([
      { op: 'add_shape', id: 'r', label: 'R', x: 0, y: 0 },
      {
        op: 'add_shape',
        id: 't',
        label: 'a<b',
        shape: 'ellipse',
        style: 'triangle;',
        x: 0,
        y: 0,
        width: 10,
        height: 20,
      },
    ])
    expect(cell(result, 'r')!.style).toBe(SHAPE_STYLES.rectangle)
    expect(cell(result, 't')).toMatchObject({
      style: 'triangle;',
      value: 'a<b',
      geometry: { x: 0, y: 0, width: 10, height: 20 },
    })
  })

  it('places a shape inside a group and on another page', () => {
    const result = plan([
      { op: 'add_shape', id: 'in', label: 'in', x: 1, y: 1, parent: 'g' },
      { op: 'add_shape', id: 'p2s', label: 'two', x: 1, y: 1, page: 'Second' },
    ])
    expect(cell(result, 'in')!.parent).toBe('g')
    expect(cell(result, 'p2s', 'p2')!.parent).toBe('1')
  })

  it('uses the given default page', () => {
    const result = plan([{ op: 'add_shape', id: 'n', label: 'n', x: 0, y: 0 }], {
      currentPage: 'p2',
    })
    expect(result.primitives[0]).toMatchObject({ page: 'p2' })
  })

  it.each([
    [{ op: 'add_shape', label: 'x', x: 0 }, 'invalid_argument'],
    [{ op: 'add_shape', label: 'x', x: 0, y: 'a' }, 'invalid_argument'],
    [{ op: 'add_shape', label: 'x', x: 0, y: Infinity }, 'invalid_argument'],
    [{ op: 'add_shape', label: 'x', x: 0, y: 0, width: 0 }, 'invalid_argument'],
    [{ op: 'add_shape', label: 'x', x: 0, y: 0, shape: 'star' }, 'invalid_argument'],
    [{ op: 'add_shape', label: 'x', x: 0, y: 0, colour: 'red' }, 'invalid_argument'],
    [{ op: 'add_shape', label: 'x', x: 0, y: 0, id: 'x' }, 'invalid_argument'],
    [{ op: 'add_shape', label: 'x', x: 0, y: 0, id: 'p1' }, 'invalid_argument'],
    [{ op: 'add_shape', label: 'x', x: 0, y: 0, id: '' }, 'invalid_argument'],
    [{ op: 'add_shape', label: 'x', x: 0, y: 0, parent: 'e' }, 'invalid_argument'],
    [{ op: 'add_shape', label: 'x', x: 0, y: 0, parent: 'zz' }, 'target_not_found'],
    [{ op: 'add_shape', label: 'x', x: 0, y: 0, page: 'zz' }, 'target_not_found'],
  ])('refuses %j with %s', (op, code) => {
    rejected([op], code)
  })
})

describe('add_edge', () => {
  it('connects two shapes with an end arrow by default', () => {
    const result = plan([{ op: 'add_edge', source: 'a', target: 'g1', label: 'go' }])
    expect(result.created).toEqual(['e1'])
    const added = cell(result, 'e1')!
    expect(added).toMatchObject({
      kind: 'edge',
      source: 'a',
      target: 'g1',
      parent: '1',
      value: 'go',
    })
    expect(added.style).toContain('endArrow=classic;')
    expect(added.geometry).toBeUndefined()
  })

  it('applies arrow choices and style', () => {
    const result = plan([
      { op: 'add_edge', id: 'n1', source: 'a', target: 'b', arrow: 'none' },
      { op: 'add_edge', id: 'n2', source: 'a', target: 'b', arrow: 'both', style: 'dashed=1;' },
      { op: 'add_edge', id: 'n3', source: 'a', target: 'b', style: 'curved=1;' },
    ])
    expect(cell(result, 'n1')!.style).toContain('endArrow=none;')
    expect(cell(result, 'n2')!.style).toBe('dashed=1;startArrow=classic;endArrow=classic;')
    expect(cell(result, 'n3')!.style).toBe('curved=1;')
  })

  it.each([
    [{ op: 'add_edge', source: 'a', target: 'nope' }, 'target_not_found'],
    [{ op: 'add_edge', source: 'x', target: 'a' }, 'target_not_found'],
    [{ op: 'add_edge', source: 'a', target: 'e' }, 'invalid_argument'],
    [{ op: 'add_edge', source: 'a', target: 'b', arrow: 'left' }, 'invalid_argument'],
    [{ op: 'add_edge', source: 'a' }, 'invalid_argument'],
  ])('refuses %j with %s', (op, code) => {
    rejected([op], code)
  })
})

describe('update', () => {
  it('changes label, geometry and merges style', () => {
    const result = plan([
      {
        op: 'update',
        id: 'a',
        label: 'x & y',
        style: 'fillColor=#ff0000;rounded=;strokeWidth=2;',
        x: 7,
        width: 300,
      },
    ])
    expect(result.primitives).toEqual([
      {
        kind: 'update_cell',
        page: 'p1',
        id: 'a',
        value: 'x &amp; y',
        style: 'html=1;fillColor=#ff0000;strokeWidth=2;',
        geometry: { x: 7, width: 300 },
      },
    ])
    expect(cell(result, 'a')).toMatchObject({
      value: 'x &amp; y',
      geometry: { x: 7, y: 0, width: 300, height: 50 },
    })
  })

  it('writes plain text into a non-HTML label and updates an edge label', () => {
    const result = plan([
      { op: 'update', id: 'b', label: 'a<b>\nc' },
      { op: 'update', id: 'e', label: 'line\nnext' },
    ])
    expect(cell(result, 'b')!.value).toBe('a<b>\nc')
    expect(cell(result, 'e')!.value).toBe('line<br>next')
  })

  it.each([
    [{ op: 'update', id: 'nope', label: 'x' }, 'target_not_found'],
    [{ op: 'update', id: 'x', label: 'x' }, 'target_not_found'],
    [{ op: 'update', id: 'e', x: 3 }, 'invalid_argument'],
    [{ op: 'update', id: '1', label: 'layer' }, 'invalid_argument'],
    [{ op: 'update', id: 'a', style: 'ellipse;' }, 'invalid_argument'],
    [{ op: 'update', id: 'a', height: -1 }, 'invalid_argument'],
    [{ op: 'update', id: 'a' }, 'invalid_argument'],
  ])('refuses %j with %s', (op, code) => {
    rejected([op], code)
  })
})

describe('delete', () => {
  it('removes children and connected edges with the shape', () => {
    const result = plan([{ op: 'delete', ids: ['g'] }])
    expect(result.primitives).toEqual([
      { kind: 'remove_cells', page: 'p1', ids: ['g', 'g1', 'eg'] },
    ])
    expect(cells(result).map((c) => c.id)).toEqual(['0', '1', 'a', 'b', 's1', 'e'])
  })

  it('removes an edge alone', () => {
    const result = plan([{ op: 'delete', ids: ['e'] }])
    expect(cells(result).map((c) => c.id)).toEqual(['0', '1', 'a', 'b', 'g', 'g1', 's1', 'eg'])
  })

  it.each([
    [{ op: 'delete', ids: ['a', 'nope'] }, 'target_not_found'],
    [{ op: 'delete', ids: [] }, 'invalid_argument'],
    [{ op: 'delete', ids: 'a' }, 'invalid_argument'],
    [{ op: 'delete', ids: ['0'] }, 'invalid_argument'],
  ])('refuses %j with %s', (op, code) => {
    rejected([op], code)
  })
})

describe('pages', () => {
  it('adds a page at the end, renames and deletes pages', () => {
    const result = plan([
      { op: 'add_page', name: 'Third' },
      { op: 'rename_page', page: 'First', name: 'Renamed' },
      { op: 'delete_page', page: 'p2' },
    ])
    expect(result.status).toBe('ok')
    expect(result.created).toEqual(['page-1'])
    expect(result.state.pages.map((p) => [p.id, p.name])).toEqual([
      ['p1', 'Renamed'],
      ['page-1', 'Third'],
    ])
    expect(result.state.pages[1]!.cells.map((c) => [c.id, c.parent])).toEqual([
      ['0', null],
      ['1', '0'],
    ])
    expect(result.primitives).toEqual([
      { kind: 'add_page', id: 'page-1', name: 'Third' },
      { kind: 'rename_page', page: 'p1', name: 'Renamed' },
      { kind: 'remove_page', page: 'p2' },
    ])
  })

  it('can add shapes to a page made in the same batch', () => {
    const result = plan([
      { op: 'add_page', name: 'New', id: 'np' },
      { op: 'add_shape', page: 'np', label: 'x', x: 0, y: 0 },
    ])
    expect(result.status).toBe('ok')
    expect(cells(result, 'np').map((c) => c.id)).toEqual(['0', '1', 's2'])
  })

  it.each([
    [[{ op: 'add_page', name: '' }], 'invalid_argument'],
    [[{ op: 'add_page', name: 'x', id: 'p2' }], 'invalid_argument'],
    [[{ op: 'add_page', name: 'x', id: 'a' }], 'invalid_argument'],
    [[{ op: 'rename_page', page: 'nope', name: 'x' }], 'target_not_found'],
    [[{ op: 'rename_page', page: 'p1', name: '' }], 'invalid_argument'],
    [[{ op: 'delete_page', page: 'nope' }], 'target_not_found'],
    [
      [
        { op: 'delete_page', page: 'p1' },
        { op: 'delete_page', page: 'p2' },
      ],
      'invalid_argument',
    ],
  ])('refuses %j with %s', (ops, code) => {
    rejected(ops, code)
  })

  it('refuses an ambiguous page name', () => {
    rejected(
      [
        { op: 'add_page', name: 'First' },
        { op: 'read', page: 'First' },
      ],
      'invalid_argument',
    )
  })
})

describe('unknown ops and malformed input', () => {
  it.each([[{ op: 'explode' }], [{}], ['add_shape'], [null]])('refuses %j', (op) => {
    rejected([op], op && typeof op === 'object' && 'op' in op ? 'unknown_op' : 'invalid_argument')
  })
})

describe('insert_mermaid', () => {
  it('is validated and left to the app', () => {
    const result = plan([{ op: 'insert_mermaid', text: 'graph TD;A-->B' }])
    expect(result.status).toBe('rejected')
    expect(result.results[0]!.error!.code).toBe('needs_app')
    rejected([{ op: 'insert_mermaid', text: '' }], 'invalid_argument')
    rejected([{ op: 'insert_mermaid', text: 'x', page: 'nope' }], 'target_not_found')
  })

  it('runs through a converter the app supplies', () => {
    const result = plan([{ op: 'insert_mermaid', text: 'graph TD;A-->B', x: 3 }], {
      mermaid: (input: { page: string; text: string; x?: number }) => [
        {
          kind: 'add_cell',
          page: input.page,
          cell: {
            id: 'm1',
            parent: '1',
            value: input.text,
            style: '',
            kind: 'vertex',
            geometry: { x: input.x ?? 0, y: 0, width: 1, height: 1 },
          },
        },
      ],
    })
    expect(result.status).toBe('ok')
    expect(result.created).toEqual(['m1'])
    expect(cell(result, 'm1')!.geometry!.x).toBe(3)
  })

  it('passes a converter failure on as invalid_argument', () => {
    const result = plan([{ op: 'insert_mermaid', text: 'nonsense' }], {
      mermaid: () => ({ code: 'invalid_argument', message: 'Parse error on line 1' }),
    })
    expect(result.results[0]!.error).toEqual({
      code: 'invalid_argument',
      message: 'Parse error on line 1',
    })
  })

  it('finds free space right of the drawing, or the origin on an empty page', () => {
    const s = plan([{ op: 'add_page', name: 'empty', id: 'ep' }]).state
    expect(freeSpotRight(s, 'p1')).toEqual({ x: 640, y: 0 })
    expect(freeSpotRight(s, 'ep')).toEqual({ x: 0, y: 0 })
  })
})

describe('ids', () => {
  it('generates ids unused anywhere in the file or the batch', () => {
    const result = plan([
      { op: 'add_shape', label: 'one', x: 0, y: 0 },
      { op: 'add_shape', label: 'two', x: 0, y: 0, page: 'p2' },
      { op: 'add_edge', source: 'a', target: 'b' },
      { op: 'add_edge', source: 'a', target: 'b', id: 'e2' },
      { op: 'add_edge', source: 'a', target: 'b' },
    ])
    // s1 exists on p1; e2 was taken by the batch itself
    expect(result.created).toEqual(['s2', 's3', 'e1', 'e2', 'e3'])
  })

  it('refuses an id the batch already used', () => {
    rejected(
      [
        { op: 'add_shape', id: 'dup', label: 'x', x: 0, y: 0 },
        { op: 'add_shape', id: 'dup', label: 'x', x: 0, y: 0, page: 'p2' },
      ],
      'invalid_argument',
    )
  })
})

describe('batch modes', () => {
  const ops = [
    { op: 'add_shape', id: 'one', label: '1', x: 0, y: 0 },
    { op: 'update', id: 'missing', label: 'x' },
    { op: 'add_shape', id: 'three', label: '3', x: 0, y: 0 },
  ]

  it('all-or-nothing rejects the whole batch but reports every op', () => {
    const before = state()
    const result = planDiagramOps(before, ops)
    expect(result.status).toBe('rejected')
    expect(result.results.map((r) => r.status)).toEqual(['ok', 'failed', 'ok'])
    expect(result.created).toEqual([])
    expect(result.state).toEqual(before)
  })

  it('best-effort keeps the ops that worked', () => {
    const result = plan(ops, { mode: 'best-effort' })
    expect(result.status).toBe('partial')
    expect(result.created).toEqual(['one', 'three'])
    expect(result.results.map((r) => r.status)).toEqual(['ok', 'failed', 'ok'])
  })

  it('stop-on-error keeps the ops before the failure and skips the rest', () => {
    const result = plan(ops, { mode: 'stop-on-error' })
    expect(result.status).toBe('partial')
    expect(result.created).toEqual(['one'])
    expect(result.results.map((r) => r.status)).toEqual(['ok', 'failed', 'skipped'])
  })

  it('a partial mode with nothing applied is rejected', () => {
    expect(plan([ops[1]], { mode: 'best-effort' }).status).toBe('rejected')
  })

  it('does not mutate the input state', () => {
    const before = state()
    const copy = structuredClone(before)
    planDiagramOps(before, [
      { op: 'update', id: 'a', x: 99 },
      { op: 'delete', ids: ['b'] },
    ])
    expect(before).toEqual(copy)
  })

  it('applyPrimitives replays a plan to the same state', () => {
    const before = state()
    const result = planDiagramOps(before, [
      { op: 'add_page', name: 'N' },
      { op: 'update', id: 'a', label: 'z', style: 'dashed=1;' },
      { op: 'delete', ids: ['b'] },
    ])
    expect(applyPrimitives(before, result.primitives)).toEqual(result.state)
    expect(readDiagramTable(result.state)).not.toHaveProperty('code')
  })
})
