import { PRODUCT_NAME } from '@genoffice/i18n'
import {
  DIAGRAM_OPS,
  type DiagramOpDefinition,
  type DiagramReadResult,
  type OpPropertySchema,
} from '@genoffice/drawio-model'
import { z } from 'zod'
import type { OpenDocumentTab } from '../../../shared/tabs-api'
import type { McpToolDefinition } from '../mcp-server'
import { resolveOpenDocumentOfFamily } from './open-documents-tools'

/**
 * The diagram tools of the in-app MCP server: `read_diagram` (the `read` op)
 * and `apply_diagram_ops` (a list of the ops that change a diagram). They are
 * built from the one definition of the ops (`DIAGRAM_OPS` of
 * `@genoffice/drawio-model`), the same one the editor's AI panel uses, and run
 * through the same executor in the editor: one call is one undo step, and when
 * any op is refused nothing changes.
 *
 * A call addresses an open diagram tab by the id or path `open_documents`
 * returns; without one it takes the diagram in front. Diagrams have no session
 * of their own (`create_session` / `save_session` do not drive them).
 *
 * The control is injected so this module never imports Electron.
 */

export interface DiagramControl {
  /** every open document (the tab list plus detached windows) */
  list: () => Promise<OpenDocumentTab[]>
  /**
   * True for a document in a detached window. An active one there is its
   * focused window, which is in front of the shell's active tab.
   */
  isDetached?: (tabId: string) => boolean
  /** one page's read table with the page list; the page on screen when `page` is left out */
  read: (tab: OpenDocumentTab, page?: string) => Promise<DiagramPageReadAnswer>
  /**
   * Plan and apply `ops` as one undo step, all or nothing; resolves with the
   * editor's result (the outcome of every op, the ids created), a refused
   * plan included.
   */
  apply: (tab: OpenDocumentTab, ops: unknown[]) => Promise<unknown>
}

/**
 * One page read: the table as text, and the same rows as values (spec 8.1:
 * `pages` with the page on screen marked `current`, and `page` with its
 * shapes, edges and the ids selected there). The values may be missing from
 * an older editor build; the text is always there.
 */
export interface DiagramPageReadAnswer {
  text: string
  pages?: DiagramReadResult['pages']
  page?: DiagramReadResult['page']
}

export interface DiagramToolsDeps {
  control?: DiagramControl
}

export const DIAGRAM_MCP_TOOL_NAMES = {
  read: 'read_diagram',
  apply: 'apply_diagram_ops',
} as const

const READ_OP = DIAGRAM_OPS.find((op) => op.name === 'read')!
/** The ops `apply_diagram_ops` takes: every op that changes the diagram. */
const APPLY_OPS: readonly DiagramOpDefinition[] = DIAGRAM_OPS.filter((op) => op.changes)

/** One op property as a zod schema; the planner checks ranges and per-op rules. */
function propertySchema(
  prop: OpPropertySchema,
  description: string,
  enumValues?: readonly string[],
): z.ZodType {
  let schema: z.ZodType
  if (prop.type === 'number') schema = z.number()
  else if (prop.type === 'array') schema = z.array(z.string())
  else if (enumValues && enumValues.length > 0) {
    schema = z.enum(enumValues as [string, ...string[]])
  } else schema = z.string()
  return schema.optional().describe(description)
}

/** `name {required, optional?}: description`, as the tool description lists each op. */
function opSignature(op: DiagramOpDefinition): string {
  const keys = Object.keys(op.input.properties).map((key) =>
    op.input.required.includes(key) ? key : `${key}?`,
  )
  return `${op.name} {${keys.join(', ')}}: ${op.description}`
}

/**
 * The item schema of `ops`: one object whose `op` names the op, with every key
 * any op takes (each optional; a key several ops take says what it means for
 * each). Unknown keys pass through so the planner refuses them per op, inside
 * the all-or-nothing result, instead of being dropped silently.
 */
export function diagramOpItemSchema(ops: readonly DiagramOpDefinition[] = APPLY_OPS): z.ZodType {
  const merged = new Map<
    string,
    {
      prop: OpPropertySchema
      enums: Array<readonly string[] | undefined>
      uses: Map<string, string[]>
    }
  >()
  for (const op of ops) {
    for (const [key, prop] of Object.entries(op.input.properties)) {
      let entry = merged.get(key)
      if (!entry) {
        entry = { prop, enums: [], uses: new Map() }
        merged.set(key, entry)
      } else if (entry.prop.type !== prop.type) {
        throw new Error(`op property ${key} has two types (${entry.prop.type}, ${prop.type})`)
      }
      entry.enums.push(prop.enum)
      const users = entry.uses.get(prop.description) ?? []
      users.push(op.name)
      entry.uses.set(prop.description, users)
    }
  }
  const shape: Record<string, z.ZodType> = {
    op: z.enum(ops.map((op) => op.name) as [string, ...string[]]).describe('The op to run.'),
  }
  for (const [key, { prop, enums, uses }] of merged) {
    const description =
      uses.size === 1
        ? [...uses.keys()][0]!
        : [...uses].map(([text, names]) => `${names.join(', ')}: ${text}`).join(' ')
    // an enum is enforced here only when every op taking the key has the same one
    const first = enums[0]
    const shared =
      first !== undefined &&
      enums.every(
        (values) => values !== undefined && values.join('\u0000') === first.join('\u0000'),
      )
    shape[key] = propertySchema(prop, description, shared ? first : undefined)
  }
  return z.looseObject(shape)
}

const DOCUMENT_ARG = z
  .string()
  .optional()
  .describe(
    'Id or path of an open diagram, as open_documents lists it. Default: the diagram in front.',
  )

/** a guided "which diagram?" error listing the diagrams that are open */
function noDiagramInFront(documents: readonly OpenDocumentTab[]): Error {
  const diagrams = documents.filter((doc) => doc.kind === 'diagram')
  if (diagrams.length === 0) {
    return new Error(`no diagram is open in ${PRODUCT_NAME}`)
  }
  const listing = diagrams
    .map((doc) => `  ${doc.id}  ${doc.filePath ?? '(never saved)'}  — ${doc.title}`)
    .join('\n')
  return new Error(
    'no diagram is in front; pass `document` with one of the open diagrams:\n' + listing,
  )
}

/**
 * The diagram in front: an active diagram tab, the one in a focused detached
 * window first (the shell's active tab sits behind it).
 */
export function frontDiagram(
  documents: readonly OpenDocumentTab[],
  isDetached?: (tabId: string) => boolean,
): OpenDocumentTab | undefined {
  const active = documents.filter((doc) => doc.kind === 'diagram' && doc.active)
  if (active.length <= 1) return active[0]
  return active.find((doc) => isDetached?.(doc.id)) ?? active[0]
}

async function targetDiagram(control: DiagramControl, document: unknown): Promise<OpenDocumentTab> {
  const documents = await control.list()
  const wanted = typeof document === 'string' ? document.trim() : ''
  if (wanted) return resolveOpenDocumentOfFamily(documents, wanted, 'drawio')
  const front = frontDiagram(documents, control.isDetached)
  if (!front) throw noDiagramInFront(documents)
  return front
}

interface ApplyOpResult {
  index: number
  op: string
  status: string
  created?: string[]
  error?: { code: string; message: string }
  read?: unknown
}

/** What a call reports: the outcome of every op and the ids made; the plan's internals stay home. */
function applyReport(raw: unknown): {
  status: string
  changed: boolean
  results: ApplyOpResult[]
  created: string[]
} {
  const result = (raw ?? {}) as {
    status?: unknown
    changed?: unknown
    results?: unknown
    created?: unknown
  }
  const results = Array.isArray(result.results)
    ? (result.results as ApplyOpResult[]).map((r) => ({
        index: r.index,
        op: r.op,
        status: r.status,
        ...(r.created?.length ? { created: r.created } : {}),
        ...(r.error ? { error: { code: r.error.code, message: r.error.message } } : {}),
        ...(r.read ? { read: r.read } : {}),
      }))
    : []
  return {
    status: typeof result.status === 'string' ? result.status : 'rejected',
    changed: result.changed === true,
    results,
    created: Array.isArray(result.created) ? (result.created as string[]) : [],
  }
}

/** One op of a refused call: `index op: FAILED code: reason`, or how it would have gone. */
function refusalLine(r: ApplyOpResult): string {
  const head = `${r.index} ${r.op || '(no op)'}:`
  if (r.status === 'failed') {
    return `${head} FAILED ${r.error?.code ?? 'error'}: ${r.error?.message ?? ''}`
  }
  return r.status === 'skipped' ? `${head} skipped` : `${head} ok (not applied)`
}

function describeTarget(doc: OpenDocumentTab): Record<string, unknown> {
  return { id: doc.id, title: doc.title, path: doc.filePath ?? null }
}

export function createDiagramTools(deps: DiagramToolsDeps): McpToolDefinition[] {
  const need = (): DiagramControl => {
    if (!deps.control) {
      throw new Error(`${PRODUCT_NAME} is not running, so its open diagrams are unreachable`)
    }
    return deps.control
  }

  return [
    {
      name: DIAGRAM_MCP_TOOL_NAMES.read,
      description:
        `Read an open diagram. ${READ_OP.description} ` +
        'Without page: the page on screen, with the ids the user has selected there. ' +
        'Unsaved edits are included. Without document: the diagram in front. ' +
        'The result has the table as text (content) and as values: pages [{id, name, current?}] and ' +
        'page {id, name, shapes [{id, label, shape, x, y, width, height, parent?, fill?, stroke?}], ' +
        'edges [{id, label, source, target, parent?}], selected?}.',
      inputSchema: {
        document: DOCUMENT_ARG,
        page: propertySchema(
          READ_OP.input.properties['page']!,
          READ_OP.input.properties['page']!.description,
        ),
      },
      handler: async (args) => {
        const control = need()
        const doc = await targetDiagram(control, args.document)
        const page =
          typeof args.page === 'string' && args.page.trim() ? args.page.trim() : undefined
        const answer = await control.read(doc, page)
        return {
          ...describeTarget(doc),
          dirty: doc.dirty,
          content: answer.text,
          ...(answer.pages && answer.page ? { pages: answer.pages, page: answer.page } : {}),
        }
      },
    },
    {
      name: DIAGRAM_MCP_TOOL_NAMES.apply,
      description: [
        'Change an open diagram with a list of ops, applied in order as ONE undo step. Later ops see the results of earlier ones (give a new shape an id and connect it in the same call). All or nothing: if any op is refused, nothing changes and the error lists every op with its outcome; fix the refused ones and send the whole list again. The diagram is not saved: save it with open_documents. Without document: the diagram in front.',
        'Ops:',
        ...APPLY_OPS.map((op) => `- ${opSignature(op)}`),
      ].join('\n'),
      inputSchema: {
        document: DOCUMENT_ARG,
        ops: z.array(diagramOpItemSchema()).min(1).describe('The ops, applied in order.'),
      },
      handler: async (args) => {
        const control = need()
        const ops = args.ops
        if (!Array.isArray(ops) || ops.length === 0) {
          throw new Error('ops must be a non-empty list of ops')
        }
        const doc = await targetDiagram(control, args.document)
        const report = applyReport(await control.apply(doc, ops))
        if (report.status !== 'ok') {
          const refused = report.results.filter((r) => r.status === 'failed').length
          throw new Error(
            [
              `Nothing was changed: ${refused} op(s) were refused, so the whole call was rejected. ` +
                'Fix them and send the whole list again.',
              ...report.results.map(refusalLine),
            ].join('\n'),
          )
        }
        return { ...describeTarget(doc), ...report }
      },
    },
  ]
}
