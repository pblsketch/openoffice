/**
 * The diagram ops as data. AI tools, MCP tools and `guide diagram` are built
 * from these definitions, and the planner checks input against the same schema.
 */
import { ARROWS, SHAPE_NAMES } from './style'
import type { DiagramOpError } from './types'

export interface OpPropertySchema {
  type: 'string' | 'number' | 'array'
  description: string
  enum?: readonly string[]
  default?: number | string
  /** For arrays: the item type. */
  items?: { type: 'string' }
  /** For numbers: values must be greater than zero. */
  exclusiveMinimum?: number
  minLength?: number
  minItems?: number
}

export interface OpInputSchema {
  type: 'object'
  properties: Record<string, OpPropertySchema>
  required: string[]
  additionalProperties: false
}

export interface DiagramOpDefinition {
  name: DiagramOpName
  description: string
  /** False for `read`, which never changes the diagram. */
  changes: boolean
  /** Only the app can carry the op out (the Mermaid converter runs in draw.io). */
  needsApp?: true
  input: OpInputSchema
}

export const DIAGRAM_OP_NAMES = [
  'read',
  'add_shape',
  'add_edge',
  'update',
  'delete',
  'add_page',
  'rename_page',
  'delete_page',
  'insert_mermaid',
] as const

export type DiagramOpName = (typeof DIAGRAM_OP_NAMES)[number]

const PAGE: OpPropertySchema = {
  type: 'string',
  description: 'Page id or name. Default: the current page in the app, the first page elsewhere.',
}
const NEW_ID: OpPropertySchema = {
  type: 'string',
  minLength: 1,
  description: 'Id for the new element. Must not exist in the file. Default: a new unique id.',
}
const STYLE_FULL = (what: string): OpPropertySchema => ({
  type: 'string',
  description: `draw.io style string (key=value; pairs) for the ${what}.`,
})

function schema(
  properties: Record<string, OpPropertySchema>,
  required: string[] = [],
): OpInputSchema {
  return { type: 'object', properties, required, additionalProperties: false }
}

export const DIAGRAM_OPS: readonly DiagramOpDefinition[] = [
  {
    name: 'read',
    description:
      'Read one page as a table of shapes (id, label, shape, x, y, width, height, parent, fill, stroke) and edges (id, label, source, target, parent), with the page list. Changes nothing.',
    changes: false,
    input: schema({ page: PAGE }),
  },
  {
    name: 'add_shape',
    description:
      'Add a shape. `style` replaces the style of `shape` when both are given. x and y are relative to `parent` when it is set.',
    changes: true,
    input: schema(
      {
        page: PAGE,
        id: NEW_ID,
        label: { type: 'string', description: 'Plain text; line breaks stay line breaks.' },
        shape: {
          type: 'string',
          enum: SHAPE_NAMES,
          default: 'rectangle',
          description: 'Shape kind.',
        },
        style: STYLE_FULL('shape'),
        x: { type: 'number', description: 'Left edge.' },
        y: { type: 'number', description: 'Top edge.' },
        width: { type: 'number', exclusiveMinimum: 0, default: 120, description: 'Width.' },
        height: { type: 'number', exclusiveMinimum: 0, default: 60, description: 'Height.' },
        parent: {
          type: 'string',
          description: 'Id of a group or container shape on the same page to put the shape in.',
        },
      },
      ['label', 'x', 'y'],
    ),
  },
  {
    name: 'add_edge',
    description: 'Connect two shapes of the same page with an edge.',
    changes: true,
    input: schema(
      {
        page: PAGE,
        id: NEW_ID,
        source: { type: 'string', description: 'Id of the shape the edge starts at.' },
        target: { type: 'string', description: 'Id of the shape the edge ends at.' },
        label: { type: 'string', description: 'Plain text.' },
        arrow: {
          type: 'string',
          enum: ARROWS,
          default: 'end',
          description: 'Arrowheads: at the end, none, or both ends.',
        },
        style: STYLE_FULL('edge'),
      },
      ['source', 'target'],
    ),
  },
  {
    name: 'update',
    description:
      'Change a shape or an edge. `style` is merged over the existing style: each key=value; pair replaces that key, an empty value (key=;) removes it. Edges take only label and style.',
    changes: true,
    input: schema(
      {
        id: { type: 'string', description: 'Id of the shape or edge.' },
        page: PAGE,
        label: { type: 'string', description: 'Plain text; line breaks stay line breaks.' },
        style: { type: 'string', description: 'key=value; pairs to merge into the style.' },
        x: { type: 'number', description: 'Left edge.' },
        y: { type: 'number', description: 'Top edge.' },
        width: { type: 'number', exclusiveMinimum: 0, description: 'Width.' },
        height: { type: 'number', exclusiveMinimum: 0, description: 'Height.' },
      },
      ['id'],
    ),
  },
  {
    name: 'delete',
    description:
      'Delete shapes and edges. Deleting a shape also deletes the shapes inside it and every edge connected to them.',
    changes: true,
    input: schema(
      {
        ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Ids to delete.',
        },
        page: PAGE,
      },
      ['ids'],
    ),
  },
  {
    name: 'add_page',
    description: 'Add an empty page after the last page.',
    changes: true,
    input: schema(
      {
        name: { type: 'string', minLength: 1, description: 'Page name.' },
        id: NEW_ID,
      },
      ['name'],
    ),
  },
  {
    name: 'rename_page',
    description: 'Rename a page.',
    changes: true,
    input: schema(
      {
        page: { type: 'string', description: 'Page id or name.' },
        name: { type: 'string', minLength: 1, description: 'New name.' },
      },
      ['page', 'name'],
    ),
  },
  {
    name: 'delete_page',
    description: 'Delete a page. The last remaining page cannot be deleted.',
    changes: true,
    input: schema({ page: { type: 'string', description: 'Page id or name.' } }, ['page']),
  },
  {
    name: 'insert_mermaid',
    description:
      'Draw a Mermaid diagram as shapes on the page. Without x and y it goes to the free space right of the existing drawing (the origin on an empty page). Needs the app.',
    changes: true,
    needsApp: true,
    input: schema(
      {
        page: PAGE,
        text: { type: 'string', minLength: 1, description: 'Mermaid source.' },
        x: { type: 'number', description: 'Left edge of the inserted drawing.' },
        y: { type: 'number', description: 'Top edge of the inserted drawing.' },
      },
      ['text'],
    ),
  },
]

const BY_NAME = new Map(DIAGRAM_OPS.map((op) => [op.name, op]))

export function diagramOpDefinition(name: string): DiagramOpDefinition | undefined {
  return BY_NAME.get(name as DiagramOpName)
}

/** True when a batch holds an op only the app can carry out. */
export function opsNeedApp(ops: readonly unknown[]): boolean {
  return ops.some((op) => {
    const name = op !== null && typeof op === 'object' ? (op as { op?: unknown }).op : undefined
    return typeof name === 'string' && diagramOpDefinition(name)?.needsApp === true
  })
}

export type CheckedOp = { op: DiagramOpName } & Record<string, unknown>

function invalid(message: string): DiagramOpError {
  return { code: 'invalid_argument', message }
}

/** Checks an op's shape against its definition (types, required keys, enums, ranges). */
export function checkOpInput(input: unknown): CheckedOp | DiagramOpError {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return invalid('an op must be an object with an "op" name')
  }
  const record = input as Record<string, unknown>
  if (typeof record['op'] !== 'string') return invalid('an op must be an object with an "op" name')
  const definition = diagramOpDefinition(record['op'])
  if (!definition) {
    return {
      code: 'unknown_op',
      message: `unknown op "${record['op']}"; ops: ${DIAGRAM_OP_NAMES.join(', ')}`,
    }
  }
  const { properties, required } = definition.input
  for (const key of Object.keys(record)) {
    if (key !== 'op' && !(key in properties)) {
      return invalid(
        `${definition.name} does not take "${key}"; it takes ${Object.keys(properties).join(', ')}`,
      )
    }
  }
  for (const key of required) {
    if (record[key] === undefined) return invalid(`${definition.name} needs "${key}"`)
  }
  for (const [key, prop] of Object.entries(properties)) {
    const value = record[key]
    if (value === undefined) continue
    const where = `${definition.name}.${key}`
    if (prop.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value))
        return invalid(`${where} must be a finite number`)
      if (prop.exclusiveMinimum !== undefined && value <= prop.exclusiveMinimum) {
        return invalid(`${where} must be greater than ${prop.exclusiveMinimum}`)
      }
    } else if (prop.type === 'string') {
      if (typeof value !== 'string') return invalid(`${where} must be a string`)
      if (prop.minLength !== undefined && value.trim().length < prop.minLength) {
        return invalid(`${where} must not be empty`)
      }
      if (prop.enum && !prop.enum.includes(value)) {
        return invalid(`${where} must be one of ${prop.enum.join(', ')}`)
      }
    } else {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        return invalid(`${where} must be a list of strings`)
      }
      if (prop.minItems !== undefined && value.length < prop.minItems) {
        return invalid(`${where} must not be empty`)
      }
    }
  }
  return record as CheckedOp
}
