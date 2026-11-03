import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import {
  DIAGRAM_OPS,
  applyDiagramOpsToFile,
  createDiagramFile,
  detectDiagramFormat,
  openDiagram,
  opsNeedApp,
  readDiagramTable,
  resolvePage,
  type DiagramApplyMode,
  type DiagramFile,
  type DiagramFormat,
  type DiagramOpResult,
  type DiagramPageTable,
} from '@genoffice/drawio-model'
import { nodePageCodec } from '@genoffice/drawio-model/node'
import { pageFilePaths } from '../../../../apps/diagram/src/main/export-paths'
import { diagramBaseName } from '../../../../apps/diagram/src/shared/formats'
import { flagString, type ParsedArgs } from '../args'
import { batchCounts, batchMode, batchResult } from '../batch'
import { readInput, readTextFile, resolveInput, stripBom, type PathContext } from '../fs'
import type { OpFailure } from '../op-errors'
import { readOpsInput, readOpsStream } from '../ops-input'
import {
  signatureFromSchema,
  withFingerprint,
  type JsonSchema,
  type OpCatalog,
  type OpEntry,
} from '../op-catalog'
import { CliError, EXIT, type CommandResult, type ErrorReason } from '../result'
import { runDiagramApp, type DiagramAppTarget } from './diagram-app'

/** Diagram file formats, by their file-name ending. */
export const DIAGRAM_EXTENSIONS = '.drawio, .dio, .drawio.svg, .drawio.png'

const GUIDE_HINT =
  'run `ieumoffice diagram read <file>` for the ids and pages, and `ieumoffice guide diagram` for the ops'

/** Whether a path names a diagram (or a Visio file, which only the app imports). */
export function isDiagramPath(path: string): boolean {
  return detectDiagramFormat(basename(path)) !== null
}

/** A diagram file's format; a Visio file and anything else are refused before any work. */
export function diagramFormatOf(path: string): DiagramFormat {
  const format = detectDiagramFormat(basename(path))
  if (format === 'vsdx') {
    throw new CliError(
      EXIT.file,
      `Visio files are imported by the app, not read or written here: ${path}`,
      undefined,
      {
        reason: 'unsupported',
        suggestion:
          'open the .vsdx in the app (it becomes a new diagram), save it as .drawio, then use that file',
      },
    )
  }
  if (format === null) {
    throw new CliError(EXIT.usage, `not a diagram (${DIAGRAM_EXTENSIONS}): ${path}`, undefined, {
      reason: 'unsupported',
      suggestion: 'name a .drawio, .dio, .drawio.svg or .drawio.png file',
    })
  }
  return format
}

export interface OpenedDiagram {
  path: string
  format: DiagramFormat
  file: DiagramFile
}

/** Resolves, policy-checks and opens a diagram file with the model (no app). */
export function openDiagramInput(file: string | undefined, ctx: PathContext): OpenedDiagram {
  const path = resolveInput(file, ctx)
  const format = diagramFormatOf(path)
  const opened = openDiagram(basename(path), readInput(path), nodePageCodec)
  if (!opened.ok) {
    throw new CliError(
      EXIT.file,
      `${basename(path)} does not open as a diagram: ${opened.message}`,
      { reason: opened.reason },
      { reason: 'unsupported' },
    )
  }
  return { path, format, file: opened.file }
}

const pageList = (file: DiagramFile): { id: string; name: string }[] =>
  file.state.pages.map((page) => ({ id: page.id, name: page.name }))

/** `--page <id|name>` as a 0-based index; an unknown or ambiguous page is refused with the page list. */
export function pageIndexOf(file: DiagramFile, ref: string | true | undefined): number | undefined {
  if (ref === undefined) return undefined
  if (ref === true || ref === '') {
    throw new CliError(EXIT.usage, 'missing --page <id|name>', undefined, {
      reason: 'missing_argument',
    })
  }
  const page = resolvePage(file.state, ref)
  if ('code' in page) {
    throw new CliError(
      EXIT.usage,
      page.message,
      { pages: pageList(file) },
      {
        reason: page.code === 'target_not_found' ? 'target_not_found' : 'invalid_argument',
        suggestion: 'pass a page id or name from detail.pages',
      },
    )
  }
  return file.state.pages.indexOf(page)
}

// ---- read ----

/** `diagram read`: every page's table, or the one `--page` names. */
export function readDiagram(opened: OpenedDiagram, args: ParsedArgs, json: boolean): CommandResult {
  const { file } = opened
  const index = pageIndexOf(file, args.flags.page)
  const chosen = index === undefined ? file.state.pages : [file.state.pages[index]!]
  const tables: DiagramPageTable[] = []
  for (const page of chosen) {
    const read = readDiagramTable(file.state, { page: page.id })
    if (!('code' in read)) tables.push(read.page)
  }
  const shapes = tables.reduce((n, t) => n + t.shapes.length, 0)
  const edges = tables.reduce((n, t) => n + t.edges.length, 0)
  const counted = `${basename(opened.path)}: ${file.state.pages.length} page(s); ${shapes} shape(s), ${edges} edge(s)${index === undefined ? '' : ` on ${chosen[0]!.name}`}`
  if (json) return { summary: counted, detail: { pages: tables } }
  return { summary: [counted, '', ...tables.map(tableText)].join('\n') }
}

function tableText(table: DiagramPageTable): string {
  const cell = (value: unknown): string =>
    value === undefined || value === null ? '' : String(value).replace(/\n/g, '\\n')
  return [
    `Page: ${table.name} (${table.id})`,
    `Shapes (${table.shapes.length}): id | label | shape | x | y | width | height | parent | fill | stroke`,
    ...table.shapes.map((s) =>
      [s.id, s.label, s.shape, s.x, s.y, s.width, s.height, s.parent, s.fill, s.stroke]
        .map(cell)
        .join(' | '),
    ),
    `Edges (${table.edges.length}): id | label | source | target | parent`,
    ...table.edges.map((e) => [e.id, e.label, e.source, e.target, e.parent].map(cell).join(' | ')),
    '',
  ].join('\n')
}

// ---- ops ----

/**
 * `--ops`: inline JSON (`[...]` or `{"ops": [...]}`), `@<file>`, a file path, or `-` for stdin.
 * Returns the ops; an empty or malformed list is refused.
 */
export function diagramOpsOf(args: ParsedArgs, ctx: PathContext): unknown[] {
  const spec = flagString(args, 'ops')
  if (spec === undefined || spec === '') {
    throw new CliError(EXIT.usage, 'missing --ops <JSON|@file|->', undefined, {
      reason: 'missing_argument',
      suggestion: 'run `ieumoffice guide diagram` for the ops',
    })
  }
  let text: string
  let source: string
  const trimmed = spec.trimStart()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    text = spec
    source = '--ops'
  } else if (spec.startsWith('@')) {
    ;({ text, source } = readOpsInput(
      { ...args, flags: { ...args.flags, ops: spec.slice(1) } },
      ctx,
    ))
  } else {
    ;({ text, source } = readOpsInput(args, ctx))
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new CliError(
      EXIT.usage,
      `${source}: not valid JSON (${(err as Error).message})`,
      undefined,
      { reason: 'invalid_json' },
    )
  }
  const ops = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { ops?: unknown }).ops)
      ? (parsed as { ops: unknown[] }).ops
      : null
  if (!ops?.length) {
    throw new CliError(EXIT.usage, `${source}: expected a non-empty array of ops`, undefined, {
      reason: 'invalid_argument',
      suggestion: 'run `ieumoffice guide diagram` for the ops',
    })
  }
  return ops
}

/** `--mermaid <file|->`: the Mermaid source, not empty. */
export function mermaidTextOf(args: ParsedArgs, ctx: PathContext): string | undefined {
  const spec = args.flags.mermaid
  if (spec === undefined) return undefined
  if (spec === true || spec === '') {
    throw new CliError(EXIT.usage, 'missing --mermaid <file|->', undefined, {
      reason: 'missing_argument',
    })
  }
  const text =
    spec === '-'
      ? stripBom(readOpsStream(0, 'stdin'))
      : stripBom(readTextFile(resolveInput(spec, ctx)))
  if (text.trim() === '') {
    throw new CliError(EXIT.usage, `--mermaid ${spec}: the Mermaid source is empty`, undefined, {
      reason: 'invalid_argument',
    })
  }
  return text
}

/** The command line's batch flags as the planner's mode. */
export function diagramApplyMode(args: ParsedArgs): DiagramApplyMode {
  const mode = batchMode(args)
  return mode === 'best_effort'
    ? 'best-effort'
    : mode === 'stop_on_error'
      ? 'stop-on-error'
      : 'all-or-nothing'
}

const REASONS: Record<string, ErrorReason> = {
  target_not_found: 'target_not_found',
  invalid_argument: 'invalid_argument',
  unknown_op: 'unknown_op',
  needs_app: 'app_unavailable',
}

/** A batch the planner (in this process or in the app) answered. */
export interface DiagramBatch {
  status: 'ok' | 'partial' | 'rejected'
  changed: boolean
  results: DiagramOpResult[]
  created: string[]
}

function failuresOf(results: readonly DiagramOpResult[]): OpFailure[] {
  return results
    .filter((r) => r.status === 'failed')
    .map((r) => ({
      index: r.index,
      op: r.op,
      error: r.error?.message ?? 'rejected',
      reason: REASONS[r.error?.code ?? ''] ?? 'op_rejected',
    }))
}

/** A rejected batch: nothing was written; every op's outcome comes back in detail. */
function rejected(batch: DiagramBatch, total: number): CliError {
  const failures = failuresOf(batch.results)
  const first = failures[0]
  return new CliError(
    EXIT.usage,
    first
      ? `no ops were applied: op ${first.index} (${first.op || 'no op'}) rejected: ${first.error}`
      : 'no ops were applied',
    { failures, batch: batchCounts(total, 0, failures.length), results: batch.results },
    { reason: first?.reason ?? 'op_rejected', suggestion: GUIDE_HINT },
  )
}

function batchOf(value: unknown): DiagramBatch | null {
  if (!value || typeof value !== 'object') return null
  const b = value as Partial<DiagramBatch>
  if (!Array.isArray(b.results) || typeof b.changed !== 'boolean' || typeof b.status !== 'string')
    return null
  return {
    status: b.status,
    changed: b.changed,
    results: b.results,
    created: Array.isArray(b.created) ? b.created : [],
  }
}

/** The target the app writes for a diagram format. */
const appTargetOf = (format: DiagramFormat): DiagramAppTarget => format

/** Whether writing `format` (or running these ops) needs draw.io, so the app. */
export function diagramNeedsApp(format: DiagramFormat, ops: readonly unknown[]): boolean {
  return format === 'drawio.svg' || format === 'drawio.png' || opsNeedApp(ops)
}

interface BatchRun {
  batch: DiagramBatch
  /**
   * The diagram after the batch, in the asked format; null when nothing was
   * made (a rejected batch, or one that changed nothing in a file of that format).
   */
  bytes: Uint8Array | null
  via: 'model' | 'app'
}

/**
 * Runs `ops` on a diagram and gets the bytes of the result in `outFormat`.
 * In this process when the model can write it (`.drawio`/`.dio`, no Mermaid):
 * unchanged pages stay byte for byte. Otherwise the app runs the same ops in
 * draw.io and serializes the diagram as Save does.
 */
async function runBatch(
  source: { path: string; file: DiagramFile },
  ops: unknown[],
  outFormat: DiagramFormat,
  options: { mode: DiagramApplyMode; pageIndex?: number; what: string },
  ctx: PathContext & { log?: (m: string) => void },
): Promise<BatchRun> {
  if (!diagramNeedsApp(outFormat, ops)) {
    const pageId =
      options.pageIndex === undefined ? undefined : source.file.state.pages[options.pageIndex]!.id
    // the model writes the XML; a picture format's original is written as a plain diagram
    const result = applyDiagramOpsToFile({ ...source.file, format: outFormat }, ops, {
      codec: nodePageCodec,
      mode: options.mode,
      ...(pageId !== undefined ? { page: pageId } : {}),
    })
    const batch: DiagramBatch = {
      status: result.batch.status,
      changed: result.batch.changed,
      results: result.batch.results,
      created: result.batch.created,
    }
    return {
      batch,
      bytes: result.write.status === 'written' ? result.write.bytes : null,
      via: 'model',
    }
  }
  const dir = mkdtempSync(join(tmpdir(), 'ieumoffice-diagram-'))
  try {
    const opsFile = join(dir, 'ops.json')
    writeFileSync(opsFile, JSON.stringify(ops))
    const out = join(dir, `diagram.${outFormat}`)
    const app = await runDiagramApp(
      {
        input: source.path,
        to: appTargetOf(outFormat),
        out,
        ops: opsFile,
        batch: options.mode,
        ...(options.pageIndex !== undefined ? { page: options.pageIndex + 1 } : {}),
      },
      options.what,
      { env: ctx.env, ...(ctx.log ? { log: ctx.log } : {}) },
    )
    const batch = batchOf(app.detail.batch)
    if (!batch) {
      throw new CliError(EXIT.conversion, 'the app did not report the batch', { app: app.detail })
    }
    // a batch that changed nothing still has its file when the format changed (a new picture)
    if (batch.status === 'rejected' || app.paths.length === 0) {
      return { batch, bytes: null, via: 'app' }
    }
    const bytes = new Uint8Array(readFileSync(out))
    const check = openDiagram(`diagram.${outFormat}`, bytes, nodePageCodec)
    if (!check.ok) {
      throw new CliError(
        EXIT.conversion,
        `the app wrote a diagram that does not open (${check.reason})`,
      )
    }
    return { batch, bytes, via: 'app' }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function opDetail(batch: DiagramBatch): Record<string, unknown> {
  return { results: batch.results, created: batch.created }
}

/** `diagram apply`: the batch on the file, written to `output` in its format. */
export async function applyToDiagram(
  opened: OpenedDiagram,
  ops: unknown[],
  output: string,
  args: ParsedArgs,
  ctx: PathContext & { log?: (m: string) => void },
  write: (path: string, bytes: Uint8Array) => void,
): Promise<CommandResult> {
  const outFormat = diagramFormatOf(output)
  const pageIndex = pageIndexOf(opened.file, args.flags.page)
  // a batch of reads writes nothing, so the model answers it whatever the format
  const readsOnly = ops.every(
    (op) => op !== null && typeof op === 'object' && (op as { op?: unknown }).op === 'read',
  )
  const run = await runBatch(
    opened,
    ops,
    readsOnly ? 'drawio' : outFormat,
    {
      mode: diagramApplyMode(args),
      ...(pageIndex !== undefined ? { pageIndex } : {}),
      what: `editing a .${outFormat} diagram${opsNeedApp(ops) ? ' with insert_mermaid' : ''}`,
    },
    ctx,
  )
  const { batch } = run
  if (batch.status === 'rejected') throw rejected(batch, ops.length)
  const failures = failuresOf(batch.results)
  const applied = batch.results.filter((r) => r.status === 'ok').length
  const counts = batchCounts(ops.length, applied, failures.length)
  if (!batch.changed || run.bytes === null) {
    return batchResult(
      {
        summary: `${applied} of ${ops.length} ops read the diagram; nothing changed, nothing written`,
        detail: { format: outFormat, ...opDetail(batch) },
      },
      counts,
      failures,
    )
  }
  write(output, run.bytes)
  return batchResult(
    {
      summary: `applied ${applied} of ${ops.length} ops to ${basename(output)}`,
      outputPath: output,
      detail: { format: outFormat, via: run.via, ...opDetail(batch) },
    },
    counts,
    failures,
  )
}

/**
 * `create --type drawio`: Mermaid first (as `insert_mermaid` on the empty
 * first page), then the ops, on a new uncompressed diagram. One of them is
 * needed. Written in the `output` name's format.
 */
export async function createDrawio(
  output: string,
  ops: unknown[] | undefined,
  mermaid: string | undefined,
  ctx: PathContext & { log?: (m: string) => void },
  write: (path: string, bytes: Uint8Array) => void,
): Promise<CommandResult> {
  if (!ops && mermaid === undefined) {
    throw new CliError(EXIT.usage, 'create --type drawio needs --ops or --mermaid', undefined, {
      reason: 'missing_argument',
      suggestion:
        'pass --mermaid <file> for a drawing from Mermaid, --ops <JSON> for shapes, or both',
    })
  }
  const outFormat = diagramFormatOf(output)
  const userOps = ops ?? []
  const all =
    mermaid === undefined ? userOps : [{ op: 'insert_mermaid', text: mermaid }, ...userOps]
  const blank = createDiagramFile()
  const dir = mkdtempSync(join(tmpdir(), 'ieumoffice-diagram-new-'))
  let run: BatchRun
  try {
    // the app opens a file: the new diagram is handed over as one
    const source = join(dir, 'new.drawio')
    writeFileSync(source, blank.xml)
    run = await runBatch(
      { path: source, file: blank },
      all,
      outFormat,
      {
        mode: 'all-or-nothing',
        what: mermaid !== undefined ? 'a diagram from Mermaid' : `a .${outFormat} diagram`,
      },
      ctx,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const offset = mermaid === undefined ? 0 : 1
  const shift = (r: DiagramOpResult): DiagramOpResult => ({ ...r, index: r.index - offset })
  const drawing = mermaid === undefined ? undefined : run.batch.results[0]
  if (drawing?.status === 'failed') {
    throw new CliError(
      EXIT.usage,
      `--mermaid: ${drawing.error?.message ?? 'the Mermaid source was not converted'}`,
      { mermaid: drawing.error },
      {
        reason: 'invalid_argument',
        suggestion:
          'check the Mermaid source; draw.io converts flowcharts, sequence, class, state, ER and more',
      },
    )
  }
  const batch: DiagramBatch = {
    ...run.batch,
    results: run.batch.results.slice(offset).map(shift),
  }
  if (batch.status === 'rejected') throw rejected(batch, userOps.length)
  const bytes =
    run.bytes ?? (diagramNeedsApp(outFormat, []) ? null : new TextEncoder().encode(blank.xml))
  if (!bytes) throw new CliError(EXIT.conversion, 'the app wrote no diagram')
  write(output, bytes)
  return {
    summary: `created ${basename(output)}`,
    outputPath: output,
    detail: {
      format: outFormat,
      via: run.via,
      ...(drawing ? { mermaid: { created: drawing.created ?? [] } } : {}),
      results: batch.results,
      created: run.batch.created,
    },
  }
}

// ---- convert ----

export const DIAGRAM_CONVERT_TARGETS = ['pdf', 'png', 'svg'] as const

export type DiagramConvertTarget = (typeof DIAGRAM_CONVERT_TARGETS)[number]

export interface DiagramConvertPlan {
  to: DiagramConvertTarget
  /** 0-based page `--page` picked */
  pageIndex?: number
  /** the files to write, in page order */
  outputs: string[]
  /** a PNG/SVG file per page (no `--page`): `outputs` are `<name>-p<n>` files */
  perPage?: true
  /** the name the app is given (`-p<n>` goes beside it for a file per page) */
  appOut: string
}

/**
 * Where `convert` writes (spec 9.3): PDF is one file; PNG/SVG one file for the
 * page `--page` picks, else one file per page named `<name>-p<n>.<ext>` (a
 * one-page diagram too, as the editor's export of all pages) in the `--out`
 * folder (default: beside the input).
 */
export function planDiagramConvert(
  opened: OpenedDiagram,
  to: DiagramConvertTarget,
  pageRef: string | true | undefined,
  out: string | undefined,
  resolve: (path: string | undefined, fallback: string) => string,
): DiagramConvertPlan {
  const pageIndex = pageIndexOf(opened.file, pageRef)
  const name = diagramBaseName(opened.path) || 'diagram'
  const pages = opened.file.state.pages.length
  const perPage = to !== 'pdf' && pageIndex === undefined
  if (!perPage) {
    const output = resolve(out, join(dirname(opened.path), `${name}.${to}`))
    return {
      to,
      ...(pageIndex !== undefined ? { pageIndex } : {}),
      outputs: [output],
      appOut: output,
    }
  }
  let folder = dirname(opened.path)
  if (out !== undefined) {
    let isFile = false
    try {
      isFile = statSync(out).isFile()
    } catch {}
    if (isFile || /\.(png|svg)$/i.test(out)) {
      throw new CliError(
        EXIT.usage,
        `without --page every page is a ${to.toUpperCase()} file of its own (the diagram has ${pages}), so --out names a folder, not a file: ${out}`,
        { pages: pageList(opened.file) },
        {
          reason: 'invalid_argument',
          suggestion: 'pass a folder as --out, or --page <id|name> for one file',
        },
      )
    }
    folder = out
  }
  const appOut = join(folder, `${name}.${to}`)
  const numbers = opened.file.state.pages.map((_, index) => index + 1)
  const outputs = pageFilePaths(appOut, to, numbers, true).map((path) => resolve(path, path))
  return { to, outputs, perPage: true, appOut: join(dirname(outputs[0]!), basename(appOut)) }
}

/** Runs the plan in the app; answers the files it wrote. */
export async function convertDiagram(
  opened: OpenedDiagram,
  plan: DiagramConvertPlan,
  ctx: PathContext & { log?: (m: string) => void },
): Promise<CommandResult> {
  const app = await runDiagramApp(
    {
      input: opened.path,
      to: plan.to,
      out: plan.appOut,
      ...(plan.pageIndex !== undefined ? { page: plan.pageIndex + 1 } : {}),
    },
    `converting a diagram to ${plan.to.toUpperCase()}`,
    { env: ctx.env, ...(ctx.log ? { log: ctx.log } : {}) },
  )
  const written = app.paths.length ? app.paths : plan.outputs
  return {
    summary:
      written.length === 1
        ? `converted ${basename(opened.path)} → ${basename(written[0]!)}`
        : `converted ${basename(opened.path)} → ${written.length} ${plan.to.toUpperCase()} files`,
    outputPath: written[0]!,
    detail: {
      pages: plan.pageIndex === undefined ? opened.file.state.pages.length : 1,
      ...(plan.perPage || written.length > 1 ? { output_paths: written } : {}),
    },
  }
}

// ---- the op reference ----

const GROUPS: { name: string; summary: string; ops: string[] }[] = [
  { name: 'read', summary: 'the read table of one page; changes nothing', ops: ['read'] },
  {
    name: 'shapes',
    summary: 'shapes and edges',
    ops: ['add_shape', 'add_edge', 'update', 'delete'],
  },
  { name: 'pages', summary: 'pages', ops: ['add_page', 'rename_page', 'delete_page'] },
  {
    name: 'mermaid',
    summary: 'a drawing from Mermaid source; needs the app',
    ops: ['insert_mermaid'],
  },
]

/** `guide diagram`: built from `DIAGRAM_OPS`, the definitions the AI and MCP tools come from. */
export function diagramCatalog(): OpCatalog {
  const ops: OpEntry[] = DIAGRAM_OPS.map((definition) => {
    const schema = definition.input as unknown as JsonSchema
    return {
      op: definition.name,
      group: GROUPS.find((g) => g.ops.includes(definition.name))?.name ?? 'other',
      signature: signatureFromSchema(schema),
      note: definition.description,
      schema,
    }
  })
  const groups = GROUPS.map((g) => ({
    name: g.name,
    summary: g.summary,
    ops: ops.filter((e) => e.group === g.name).map((e) => e.op),
  })).filter((g) => g.ops.length > 0)
  return withFingerprint({ domain: 'diagram', groups, ops })
}
