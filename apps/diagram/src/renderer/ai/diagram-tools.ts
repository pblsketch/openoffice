/**
 * The diagram's AI tools, made from the one definition of the ops
 * (`DIAGRAM_OPS` of `@genoffice/drawio-model`): `read_diagram` is the `read`
 * op, `apply_diagram_ops` carries a list of the ops that change the diagram.
 * The MCP tools and `guide diagram` are made from the same definitions, so a
 * new op or a changed description reaches every caller at once.
 *
 * One `apply_diagram_ops` call is one undo step, and all or nothing: when any
 * op is refused, nothing changes and every op's outcome comes back so the
 * model can fix the list and send it again (`applyLiveOps`).
 */
import type { AgentToolDef } from '@genoffice/agent-core'
import {
  DIAGRAM_OPS,
  type DiagramOpDefinition,
  type OpPropertySchema,
} from '@genoffice/drawio-model'
import { formatApplyResult, type LiveApplyResult, type LivePageRead } from '../document/live-ops'

export const DIAGRAM_TOOL_NAMES = {
  read: 'read_diagram',
  apply: 'apply_diagram_ops',
} as const

/** What the tools reach in the editor: the diagram on screen, through draw.io. */
export interface DiagramAiHost {
  /** draw.io is up with a diagram; false while it starts or when the file did not open */
  ready(): boolean
  /** one page as the read table (the page on screen when `page` is left out) */
  read(page?: string): Promise<LivePageRead>
  /** plans and applies a list of ops as one undo step (all or nothing) */
  apply(ops: unknown[]): Promise<LiveApplyResult>
  /** takes AI calls back, newest first; false when something else came after one of them */
  undo(tokens: string[]): Promise<boolean>
}

const READ_OP = DIAGRAM_OPS.find((op) => op.name === 'read')!
/** The ops `apply_diagram_ops` takes: every op that changes the diagram. */
export const APPLY_OPS: readonly DiagramOpDefinition[] = DIAGRAM_OPS.filter((op) => op.changes)

/** One op property as JSON Schema. */
function propertySchema(prop: OpPropertySchema, description: string): Record<string, unknown> {
  const out: Record<string, unknown> = { type: prop.type, description }
  if (prop.enum) out.enum = [...prop.enum]
  if (prop.items) out.items = { ...prop.items }
  if (prop.exclusiveMinimum !== undefined) out.exclusiveMinimum = prop.exclusiveMinimum
  if (prop.minLength !== undefined) out.minLength = prop.minLength
  if (prop.minItems !== undefined) out.minItems = prop.minItems
  return out
}

/** `name {required, optional?}: description`, as the tool description lists each op. */
export function opSignature(op: DiagramOpDefinition): string {
  const keys = Object.keys(op.input.properties).map((key) =>
    op.input.required.includes(key) ? key : `${key}?`,
  )
  return `${op.name} {${keys.join(', ')}}: ${op.description}`
}

/**
 * The item schema of `ops`: one flat object whose `op` names the op, with
 * every key any op takes. A key several ops take says what it means for each
 * (the ops' own wording). The planner checks each op against its own schema.
 */
export function opItemSchema(ops: readonly DiagramOpDefinition[]): Record<string, unknown> {
  const merged = new Map<string, { prop: OpPropertySchema; uses: Map<string, string[]> }>()
  for (const op of ops) {
    for (const [key, prop] of Object.entries(op.input.properties)) {
      let entry = merged.get(key)
      if (!entry) {
        entry = { prop, uses: new Map() }
        merged.set(key, entry)
      } else if (entry.prop.type !== prop.type) {
        throw new Error(`op property ${key} has two types (${entry.prop.type}, ${prop.type})`)
      }
      const users = entry.uses.get(prop.description) ?? []
      users.push(op.name)
      entry.uses.set(prop.description, users)
    }
  }
  const properties: Record<string, unknown> = {
    op: { type: 'string', enum: ops.map((op) => op.name), description: 'The op to run.' },
  }
  for (const [key, { prop, uses }] of merged) {
    const description =
      uses.size === 1
        ? [...uses.keys()][0]!
        : [...uses].map(([text, names]) => `${names.join(', ')}: ${text}`).join(' ')
    // an enum only one op has stays on the key; the planner checks the rest per op
    properties[key] = propertySchema(prop, description)
  }
  return { type: 'object', properties, required: ['op'] }
}

export const DIAGRAM_TOOLS: readonly AgentToolDef[] = [
  {
    name: DIAGRAM_TOOL_NAMES.read,
    description: `${READ_OP.description} Without page: the page on screen, with the ids the user has selected there.`,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(READ_OP.input.properties).map(([key, prop]) => [
          key,
          propertySchema(prop, prop.description),
        ]),
      ),
    },
  },
  {
    name: DIAGRAM_TOOL_NAMES.apply,
    description: [
      'Change the diagram with a list of ops, applied in order as ONE undo step. Later ops see the results of earlier ones (give a new shape an id and connect it in the same call). All or nothing: if any op is refused, nothing changes and the result lists every op with its outcome; fix the refused ones and send the whole list again.',
      'Ops:',
      ...APPLY_OPS.map((op) => `- ${opSignature(op)}`),
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        ops: {
          type: 'array',
          minItems: 1,
          items: opItemSchema(APPLY_OPS),
          description: 'The ops, applied in order.',
        },
      },
      required: ['ops'],
    },
  },
]

export interface DiagramToolResult {
  output: string
  isError?: boolean
  mutated?: boolean
  /** the undo token of an applied call */
  token?: string | null
  detail?: { page?: string; count?: number; mermaid?: boolean }
}

const NOT_READY =
  'the diagram editor is not ready (still starting, or the file did not open); nothing was read or changed'

/** Runs one diagram tool against the editor. */
export async function runDiagramTool(
  host: DiagramAiHost,
  name: string,
  input: Record<string, unknown>,
): Promise<DiagramToolResult> {
  if (!host.ready()) return { output: NOT_READY, isError: true }
  if (name === DIAGRAM_TOOL_NAMES.read) {
    const page = typeof input.page === 'string' && input.page.trim() ? input.page.trim() : undefined
    const read = await host.read(page)
    if (!read.ok) return { output: read.error, isError: true }
    return { output: read.text, detail: { page: read.pageName } }
  }
  if (name === DIAGRAM_TOOL_NAMES.apply) {
    const ops = input.ops
    if (!Array.isArray(ops) || ops.length === 0) {
      return { output: 'ops must be a non-empty list of ops', isError: true }
    }
    let result: LiveApplyResult
    try {
      result = await host.apply(ops)
    } catch (err) {
      // the bridge takes a failed step back whole: the diagram is as it was
      const reason = err instanceof Error ? err.message : String(err)
      return { output: `Nothing was changed: ${reason}`, isError: true }
    }
    const mermaid = result.results.some((r) => r.op === 'insert_mermaid' && r.status === 'ok')
    return {
      output: formatApplyResult(result),
      isError: result.status !== 'ok',
      mutated: result.status === 'ok' && result.changed,
      token: result.token,
      detail: { count: result.results.length, mermaid },
    }
  }
  return { output: `unknown tool: ${name}`, isError: true }
}
