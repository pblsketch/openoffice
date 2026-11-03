// The diagram's AI tools: made from the op definitions, reading the page on
// screen as text with the selection, and applying a whole call as one undo
// step, all or nothing, Mermaid included (converted by draw.io first).
import { describe, expect, it } from 'vitest'
import { DIAGRAM_OPS, type DiagramState } from '@genoffice/drawio-model'
import { PRODUCT_NAME, UPSTREAM_PRODUCT_NAME } from '@genoffice/i18n'
import {
  APPLY_OPS,
  DIAGRAM_TOOLS,
  DIAGRAM_TOOL_NAMES,
  runDiagramTool,
} from '../src/renderer/ai/diagram-tools'
import { createDiagramSkill, diagramContext } from '../src/renderer/ai/diagram-skill'
import { diagramAiHost } from '../src/renderer/ai/AiDock'
import { plannedMermaidCells } from '../src/renderer/document/mermaid'
import { applyLiveOps, liveDiagramRead, stepsOfPlan } from '../src/renderer/document/live-ops'
import { FakeDrawio, MERMAID_XML, fakeFrame } from './helpers/fake-drawio'

const hostOf = (fake: ReturnType<typeof fakeFrame>) =>
  diagramAiHost({ client: () => fake.frame, ready: () => true })

describe('tool definitions', () => {
  it('come from the op definitions: one read tool and one list of every changing op', () => {
    expect(DIAGRAM_TOOLS.map((tool) => tool.name)).toEqual(['read_diagram', 'apply_diagram_ops'])
    const changing = DIAGRAM_OPS.filter((op) => op.changes).map((op) => op.name)
    expect(APPLY_OPS.map((op) => op.name)).toEqual(changing)
    expect(changing).toEqual(
      expect.arrayContaining([
        'add_shape',
        'add_edge',
        'update',
        'delete',
        'add_page',
        'rename_page',
        'delete_page',
        'insert_mermaid',
      ]),
    )

    const apply = DIAGRAM_TOOLS[1]!
    const item = (
      apply.inputSchema as {
        properties: { ops: { items: { properties: Record<string, Record<string, unknown>> } } }
      }
    ).properties.ops.items
    expect(item.properties.op!.enum).toEqual(changing)
    for (const op of APPLY_OPS) {
      // every op is described with its own words and every key it takes is in the item schema
      expect(apply.description).toContain(op.description)
      for (const [key, prop] of Object.entries(op.input.properties)) {
        expect(item.properties[key], `${op.name}.${key}`).toBeDefined()
        expect(item.properties[key]!.type).toBe(prop.type)
        expect(String(item.properties[key]!.description)).toContain(prop.description)
      }
    }
    expect(item.properties.shape!.enum).toEqual(
      DIAGRAM_OPS.find((op) => op.name === 'add_shape')!.input.properties.shape!.enum,
    )

    const read = DIAGRAM_TOOLS[0]!
    const readOp = DIAGRAM_OPS.find((op) => op.name === 'read')!
    expect(read.description).toContain(readOp.description)
    expect(Object.keys((read.inputSchema as { properties: object }).properties)).toEqual(
      Object.keys(readOp.input.properties),
    )
  })
})

describe('reading', () => {
  it('reads the page on screen by default, with the selected ids', async () => {
    const drawio = new FakeDrawio(undefined, 'p2')
    drawio.selected = ['c']
    const fake = fakeFrame(drawio)
    const result = await runDiagramTool(hostOf(fake), DIAGRAM_TOOL_NAMES.read, {})
    expect(result.isError).toBeFalsy()
    expect(result.output).toContain('Page: Two (p2)')
    expect(result.output).toContain('Two (p2) [current]')
    expect(result.output).toContain('c | Alone')
    expect(result.output).toContain('Selected: c')
    expect(result.detail?.page).toBe('Two')
  })

  it('reads another page by name, without the selection of the page on screen', async () => {
    const drawio = new FakeDrawio(undefined, 'p2')
    drawio.selected = ['c']
    const result = await runDiagramTool(hostOf(fakeFrame(drawio)), DIAGRAM_TOOL_NAMES.read, {
      page: 'One',
    })
    expect(result.output).toContain('Page: One (p1)')
    expect(result.output).toContain('a | Start')
    expect(result.output).toContain('e |  | a | b')
    expect(result.output).not.toContain('Selected:')
  })

  it('gives the same page as values too, for the in-app MCP server’s object', async () => {
    const drawio = new FakeDrawio(undefined, 'p2')
    drawio.selected = ['c']
    const read = await liveDiagramRead(fakeFrame(drawio).frame)
    if (!read.ok) throw new Error(read.error)
    expect(read.read.pages.map((page) => [page.id, page.current ?? false])).toEqual([
      ['p1', false],
      ['p2', true],
    ])
    expect(read.read.page).toMatchObject({ id: 'p2', name: 'Two', selected: ['c'] })
    expect(read.read.page.shapes.map((shape) => [shape.id, shape.label])).toEqual([['c', 'Alone']])
  })

  it('answers a page that is not there as an error', async () => {
    const result = await runDiagramTool(hostOf(fakeFrame()), DIAGRAM_TOOL_NAMES.read, {
      page: 'Nowhere',
    })
    expect(result.isError).toBe(true)
  })

  it('sends the model the read table as text, never a picture', async () => {
    const drawio = new FakeDrawio()
    drawio.selected = ['a', 'b']
    const read = await liveDiagramRead(fakeFrame(drawio).frame)
    const context = diagramContext(read)
    expect(context).toMatch(/^The page on screen, as text:\n<diagram_page>\n/)
    expect(context).toContain('Selected: a, b')
    expect(context).toContain('</diagram_page>')
    expect(context).not.toMatch(/data:image|base64|<svg|\.png/i)

    const skill = createDiagramSkill({ host: () => hostOf(fakeFrame()), context: () => context })
    expect(skill.buildContext?.()).toBe(context)
    expect(skill.tools.map((tool) => tool.name)).toEqual(['read_diagram', 'apply_diagram_ops'])
    expect(skill.systemPrompt).toContain(`${PRODUCT_NAME} Diagram`)
    expect(skill.systemPrompt).not.toContain(UPSTREAM_PRODUCT_NAME)
    expect(skill.systemPrompt).toMatch(/never see a picture/)
    expect(skill.systemPrompt).toMatch(/prefer insert_mermaid/)
    expect(diagramContext(null)).toMatch(/still starting/)
  })
})

describe('applying', () => {
  it('applies a call as one undo step and reports the ids made', async () => {
    const fake = fakeFrame()
    const result = await runDiagramTool(hostOf(fake), DIAGRAM_TOOL_NAMES.apply, {
      ops: [
        { op: 'add_shape', id: 'n', label: 'Next', x: 400, y: 0 },
        { op: 'add_edge', source: 'b', target: 'n' },
      ],
    })
    expect(result.isError).toBe(false)
    expect(result.mutated).toBe(true)
    expect(result.output).toContain('Applied 2 op(s) as one undo step.')
    expect(result.output).toContain('0 add_shape: ok, created n')
    expect(fake.calls.filter((op) => op === 'applyBatch')).toHaveLength(1)
    expect(fake.drawio.history).toHaveLength(1)
    expect(result.token).toBeTruthy()
  })

  it('changes nothing when one op is refused: the whole call is rejected', async () => {
    const fake = fakeFrame()
    const before = fake.drawio.snapshot()
    const result = await runDiagramTool(hostOf(fake), DIAGRAM_TOOL_NAMES.apply, {
      ops: [
        { op: 'add_shape', label: 'Fine', x: 400, y: 0 },
        { op: 'update', id: 'a', label: 'Renamed' },
        { op: 'add_edge', source: 'a', target: 'missing' },
      ],
    })
    expect(result.isError).toBe(true)
    expect(result.mutated).toBe(false)
    expect(result.output).toMatch(/^Nothing was changed: 1 op\(s\) were refused/)
    expect(result.output).toContain('0 add_shape: ok (not applied)')
    expect(result.output).toContain('2 add_edge: FAILED target_not_found')
    // nothing reached the diagram: no apply request, no undo step, the same content
    expect(fake.calls).not.toContain('applyBatch')
    expect(fake.drawio.history).toHaveLength(0)
    expect(fake.drawio.snapshot()).toBe(before)
  })

  it('takes a step back whole when draw.io fails half-way', async () => {
    const fake = fakeFrame()
    const before = fake.drawio.snapshot()
    fake.drawio.updateCell = () => {
      throw new Error('draw.io broke')
    }
    const result = await runDiagramTool(hostOf(fake), DIAGRAM_TOOL_NAMES.apply, {
      ops: [
        { op: 'add_shape', label: 'New', x: 400, y: 0 },
        { op: 'update', id: 'a', label: 'Changed' },
      ],
    })
    expect(result.isError).toBe(true)
    expect(result.output).toBe('Nothing was changed: draw.io broke')
    expect(fake.drawio.history).toHaveLength(0)
    expect(fake.drawio.snapshot()).toBe(before)
  })

  it('sends a call mixing Mermaid and other ops as ONE bridge request, one undo step', async () => {
    const fake = fakeFrame()
    const before = fake.drawio.snapshot()
    const host = hostOf(fake)
    const result = await runDiagramTool(host, DIAGRAM_TOOL_NAMES.apply, {
      ops: [
        { op: 'add_shape', id: 'n', label: 'Before', x: 0, y: 200 },
        { op: 'insert_mermaid', text: 'graph LR\n  Go --> Stop' },
        { op: 'update', id: 'a', label: 'Renamed' },
      ],
    })
    expect(result.isError).toBe(false)
    expect(result.detail?.mermaid).toBe(true)
    // converting is a read; the change is one request
    expect(fake.calls).toEqual(['readPages', 'convertMermaid', 'applyBatch'])
    expect(fake.batches).toHaveLength(1)
    const steps = fake.batches[0]!.steps
    expect(steps.map((step) => step.kind)).toEqual(['primitives', 'mermaid', 'primitives'])
    // draw.io's own XML goes in (edge points and all), right of the drawing: shapes end at x 320
    expect(steps[1]).toMatchObject({ kind: 'mermaid', page: 'p1', xml: MERMAID_XML, x: 360, y: 0 })
    expect(fake.drawio.history).toHaveLength(1)
    // the ids the drawing really got are the ones reported
    expect(result.output).toMatch(/1 insert_mermaid: ok, created drawio-1, drawio-2/)

    // one undo takes the whole call back
    expect(await host.undo([result.token!])).toBe(true)
    expect(fake.drawio.snapshot()).toBe(before)
  })

  it('rejects the whole call with the converter’s reason when Mermaid does not convert', async () => {
    const fake = fakeFrame(new FakeDrawio(), () => {
      throw new Error('Parse error on line 2: expecting an arrow')
    })
    const before = fake.drawio.snapshot()
    const result = await runDiagramTool(hostOf(fake), DIAGRAM_TOOL_NAMES.apply, {
      ops: [
        { op: 'add_shape', label: 'Kept out', x: 0, y: 200 },
        { op: 'insert_mermaid', text: 'graph LR\n  Go -- Stop' },
      ],
    })
    expect(result.isError).toBe(true)
    expect(result.output).toContain('1 insert_mermaid: FAILED invalid_argument')
    expect(result.output).toContain('Parse error on line 2: expecting an arrow')
    expect(fake.calls).not.toContain('applyBatch')
    expect(fake.drawio.snapshot()).toBe(before)
  })

  it('puts Mermaid at the spot given, and on an empty page at the origin', async () => {
    const fake = fakeFrame()
    await applyLiveOps(fake.frame, [
      { op: 'add_page', id: 'p3', name: 'Empty' },
      { op: 'insert_mermaid', page: 'p3', text: 'graph TD\n  A --> B' },
      { op: 'insert_mermaid', page: 'p1', text: 'graph TD\n  A --> B', x: 40, y: 500 },
    ])
    const steps = fake.batches[0]!.steps
    expect(steps[1]).toMatchObject({ kind: 'mermaid', page: 'p3', x: 0, y: 0 })
    expect(steps[2]).toMatchObject({ kind: 'mermaid', page: 'p1', x: 40, y: 500 })
    // one conversion per distinct text
    expect(fake.calls.filter((op) => op === 'convertMermaid')).toHaveLength(1)
  })

  it('takes an AI turn back only while nothing else came after it', async () => {
    const fake = fakeFrame()
    const host = hostOf(fake)
    const first = await runDiagramTool(host, DIAGRAM_TOOL_NAMES.apply, {
      ops: [{ op: 'add_shape', label: 'AI', x: 400, y: 0 }],
    })
    // the person edits after the AI
    fake.drawio.beginUpdate()
    fake.drawio.renamePage('p1', 'Mine')
    fake.drawio.endUpdate()
    expect(await host.undo([first.token!])).toBe(false)
    expect(fake.drawio.pages.get('p1')!.cells.some((cell) => cell.value === 'AI')).toBe(true)
  })

  it('refuses a call while draw.io is not up, without reaching the frame', async () => {
    const fake = fakeFrame()
    const host = diagramAiHost({ client: () => fake.frame, ready: () => false })
    const result = await runDiagramTool(host, DIAGRAM_TOOL_NAMES.apply, {
      ops: [{ op: 'add_page', name: 'X' }],
    })
    expect(result.isError).toBe(true)
    expect(fake.calls).toEqual([])
  })
})

describe('Mermaid cells for the plan', () => {
  const state: DiagramState = {
    pages: [
      {
        id: 'p1',
        name: 'One',
        cells: [
          { id: '0', parent: null, value: '', style: '', kind: 'other' },
          { id: 'L', parent: '0', value: '', style: '', kind: 'other' },
          { id: 'm1', parent: 'L', value: 'taken', style: '', kind: 'vertex' },
        ],
      },
    ],
  }

  it('moves the drawing to the spot, under the page layer, with unused ids', () => {
    const planned = plannedMermaidCells(MERMAID_XML, { page: 'p1', text: '', x: 10, y: 20 }, state)
    expect(Array.isArray(planned)).toBe(true)
    const cells = (planned as Extract<typeof planned, unknown[]>).map((p) =>
      p.kind === 'add_cell' ? p.cell : null,
    )
    const group = cells.find((cell) => cell?.style === 'group;')!
    expect(group.parent).toBe('L')
    expect(group.geometry).toMatchObject({ x: 10, y: 20, width: 300, height: 60 })
    expect(cells.map((cell) => cell!.id)).not.toContain('m1')
    const go = cells.find((cell) => cell?.value === 'Go')!
    // children keep their place inside the group
    expect(go.parent).toBe(group.id)
    expect(go.geometry).toMatchObject({ x: 0, y: 0 })
    const edge = cells.find((cell) => cell?.kind === 'edge')!
    expect([edge.source, edge.target]).toEqual([
      go.id,
      cells.find((cell) => cell?.value === 'Stop')!.id,
    ])
  })

  it('refuses a drawing with nothing in it', () => {
    const empty =
      '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'
    expect(plannedMermaidCells(empty, { page: 'p1', text: '', x: 0, y: 0 }, state)).toMatchObject({
      code: 'invalid_argument',
    })
  })

  it('turns a plan into steps: each drawing one import, the rest grouped in order', () => {
    const a = { kind: 'rename_page', page: 'p1', name: 'A' } as const
    const m1 = { kind: 'remove_page', page: 'x' } as const
    const m2 = { kind: 'remove_page', page: 'y' } as const
    const b = { kind: 'rename_page', page: 'p1', name: 'B' } as const
    const step = { kind: 'mermaid', page: 'p1', xml: 'X', x: 0, y: 0 } as const
    const { steps, drawingSteps } = stepsOfPlan([a, m1, m2, b], [{ primitives: [m1, m2], step }])
    expect(steps).toEqual([
      { kind: 'primitives', primitives: [a] },
      step,
      { kind: 'primitives', primitives: [b] },
    ])
    expect(drawingSteps).toEqual([1])
  })
})
