/**
 * The diagram tools' definitions: their input schemas come from the one
 * definition of the ops (`DIAGRAM_OPS`), the diagram in front is picked the
 * way the user sees it, and the tools answer plainly when the app is not
 * running. The tools against a live editor are in open-documents-diagram.test.ts.
 */
import { DIAGRAM_OPS } from '@genoffice/drawio-model'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { OpenDocumentTab } from '../../src/shared/tabs-api'
import {
  createDiagramTools,
  diagramOpItemSchema,
  frontDiagram,
  type DiagramControl,
} from '../../src/main/mcp/tools/diagram-tools'

const [readTool, applyTool] = createDiagramTools({})

describe('the schemas come from DIAGRAM_OPS', () => {
  const changing = DIAGRAM_OPS.filter((op) => op.changes)

  it('names the two tools as the AI panel does', () => {
    expect([readTool!.name, applyTool!.name]).toEqual(['read_diagram', 'apply_diagram_ops'])
  })

  it('read_diagram takes the read op’s page plus the document', () => {
    const read = DIAGRAM_OPS.find((op) => op.name === 'read')!
    expect(Object.keys(readTool!.inputSchema!).sort()).toEqual(
      ['document', ...Object.keys(read.input.properties)].sort(),
    )
    expect(readTool!.description).toContain(read.description)
    expect(readTool!.inputSchema!.page!.description).toBe(read.input.properties.page!.description)
  })

  it('apply_diagram_ops lists every op that changes a diagram, with each key any of them takes', () => {
    const item = diagramOpItemSchema()
    const json = z.toJSONSchema(item) as {
      properties: Record<string, { enum?: string[]; type?: string }>
      required: string[]
    }
    expect(json.properties.op!.enum).toEqual(changing.map((op) => op.name))
    expect(json.properties.op!.enum).not.toContain('read')
    const keys = new Set(changing.flatMap((op) => Object.keys(op.input.properties)))
    expect(Object.keys(json.properties).sort()).toEqual(['op', ...keys].sort())
    expect(json.required).toEqual(['op'])
    // an enum only one op takes is kept on its key
    const addShape = changing.find((op) => op.name === 'add_shape')!
    expect(json.properties.shape!.enum).toEqual([...addShape.input.properties.shape!.enum!])
    for (const op of changing) expect(applyTool!.description).toContain(op.description)
  })

  it('lets unknown keys through to the planner, which refuses them per op', () => {
    const item = diagramOpItemSchema()
    expect(item.parse({ op: 'add_page', name: 'Two', colour: 'red' })).toEqual({
      op: 'add_page',
      name: 'Two',
      colour: 'red',
    })
  })

  it('takes a list of at least one op and an optional document', () => {
    const shape = z.object(applyTool!.inputSchema!)
    expect(shape.safeParse({ ops: [] }).success).toBe(false)
    expect(shape.safeParse({ ops: [{ op: 'delete_page', page: 'p2' }] }).success).toBe(true)
    expect(shape.safeParse({ document: 't1', ops: [{ op: 'read' }] }).success).toBe(false)
  })
})

describe('the diagram in front', () => {
  const tab = (overrides: Partial<OpenDocumentTab>): OpenDocumentTab => ({
    id: 't1',
    kind: 'diagram',
    title: 'flow',
    active: false,
    dirty: false,
    ...overrides,
  })

  it('is the active diagram tab; another active document does not count', () => {
    expect(
      frontDiagram([
        tab({ id: 't1', kind: 'docs', active: true }),
        tab({ id: 't2' }),
        tab({ id: 't3', active: true }),
      ])?.id,
    ).toBe('t3')
    expect(frontDiagram([tab({ id: 't2' })])).toBeUndefined()
  })

  it('prefers a focused detached window over the shell’s active tab', () => {
    const docs = [tab({ id: 't1', active: true }), tab({ id: 'detached:4', active: true })]
    expect(frontDiagram(docs, (id) => id.startsWith('detached:'))?.id).toBe('detached:4')
  })
})

describe('without the app', () => {
  it('both tools say the app is not running', async () => {
    await expect(readTool!.handler({})).rejects.toThrow(/not running/)
    await expect(applyTool!.handler({ ops: [{ op: 'add_page', name: 'x' }] })).rejects.toThrow(
      /not running/,
    )
  })

  it('apply refuses an empty list before asking anything', async () => {
    let asked = false
    const control: DiagramControl = {
      list: async () => {
        asked = true
        return []
      },
      read: async () => ({ text: '' }),
      apply: async () => ({}),
    }
    const [, apply] = createDiagramTools({ control })
    await expect(apply!.handler({ ops: [] })).rejects.toThrow(/non-empty list/)
    expect(asked).toBe(false)
  })
})
