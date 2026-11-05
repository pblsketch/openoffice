import { readFileSync } from 'node:fs'
import type { AgentSkill, AgentToolDef } from '@genoffice/agent-core'
import type {
  AgentPluginHost,
  AgentPluginSurface,
} from '../../../../apps/hwp/studio-plugin/agent-plugin.mjs'
import type { AgentBridge } from '../../../../apps/hwp/src/renderer/ai/agent-bridge'
import type { SaveBase } from '../../../../apps/hwp/src/main/save-fixes'
import type { HwpFormat, MeasuredTab } from '../../../../apps/hwp/src/shared/ipc'
import {
  signatureFromSchema,
  withFingerprint,
  type JsonSchema,
  type OpCatalog,
  type OpEntry,
} from '../op-catalog'
import { classifyOpError, type OpFailure } from '../op-errors'
import { CliError, EXIT } from '../result'
import type { BatchMode } from '../batch'
import { rhwpWasmPath } from '../resources'

/**
 * Editing a Hangul (HWP / HWPX) document without the editor: the app's own AI tools
 * (apps/hwp/src/renderer/ai/hwp-skill.ts) drive the app's own editor plugin
 * (apps/hwp/studio-plugin/agent-plugin.mjs) over the same rhwp engine, so an op here does
 * what the in-app AI does with the same call, with the same refusals (ambiguous text,
 * objects that would be lost, memos). A save goes through the corrections the app's save
 * makes (apps/hwp/src/main/save-fixes.ts) and its checks.
 */

type Engine = typeof import('@rhwp/core')
type HwpDocument = InstanceType<Engine['HwpDocument']>

/** Tools of the in-app AI that need the app's window, the network or a model: not ops here. */
const NOT_HEADLESS: Record<string, string> = {
  read_url: 'reads a web page; use `ieumoffice read-url`',
  image_search: 'searches the web for pictures',
  generate_image: 'asks an image model',
  insert_image: 'pictures come from the chat or the web in the app',
  read_selection: 'there is no selection without the editor',
  replace_selection: 'there is no selection without the editor',
  format_selection: 'there is no selection without the editor',
}

let engine: Promise<Engine> | null = null

function loadEngine(): Promise<Engine> {
  if (!engine) {
    const loading = (async () => {
      const mod = await import('@rhwp/core')
      // the engine fetches its wasm by URL when left to itself; a packaged CLI has no
      // node_modules, so the bytes are read from where resources.ts finds them
      await mod.default({ module_or_path: readFileSync(rhwpWasmPath()) })
      return mod
    })()
    engine = loading
    loading.catch(() => {
      if (engine === loading) engine = null
    })
  }
  return engine
}

async function appModules() {
  const [plugin, skill, saveFixes, savePlan, tails, kinds, tabs, tracked, memos] =
    await Promise.all([
      import('../../../../apps/hwp/studio-plugin/agent-plugin.mjs'),
      import('../../../../apps/hwp/src/renderer/ai/hwp-skill'),
      import('../../../../apps/hwp/src/main/save-fixes'),
      import('../../../../apps/hwp/src/main/save-plan'),
      import('../../../../apps/hwp/src/main/section-tails'),
      import('../../../../apps/hwp/src/main/field-kinds'),
      import('../../../../apps/hwp/src/main/tab-widths'),
      import('../../../../apps/hwp/src/main/tracked-changes'),
      import('../../../../apps/hwp/src/main/memos'),
    ])
  return { plugin, skill, saveFixes, savePlan, tails, kinds, tabs, tracked, memos }
}

type AppModules = Awaited<ReturnType<typeof appModules>>

export interface HwpEditSession {
  doc: HwpDocument
  surface: AgentPluginSurface
  skill: AgentSkill
  /** what the save corrects against: the opened `.hwp`'s section tails and field kinds */
  base: SaveBase
  /** the opened bytes when they were HWPX (the memo check compares against them) */
  originalHwpx: Uint8Array | null
  /** tracked changes were dropped on open: the document holds its current text only */
  trackingDropped: boolean
  mods: AppModules
}

/** The engine throws plain strings, often Korean; a password is the one cause told apart. */
function openFailure(thrown: unknown): CliError {
  const message = thrown instanceof Error ? thrown.message : String(thrown)
  if (message.includes('암호') || /password|encrypt/i.test(message)) {
    return new CliError(EXIT.usage, 'the document is password-protected', undefined, {
      reason: 'unsupported',
      suggestion: 'remove the password in Hangul first, then edit the copy',
    })
  }
  return new CliError(
    EXIT.file,
    `the HWP engine could not open the document: ${message}`,
    undefined,
    {
      reason: 'unsupported',
    },
  )
}

/**
 * The plugin's host as the editor gives it, without the editor: a change is one engine
 * snapshot that is restored when the change throws (the editor records a plugin change the
 * same way), and the plugin is told after every change so its cached text is dropped.
 */
function headlessHost(doc: HwpDocument): AgentPluginHost {
  const listeners = new Map<string, ((detail?: unknown) => void)[]>()
  const emit = (name: string) => listeners.get(name)?.forEach((listener) => listener())
  const host = {
    read: (fn: (d: HwpDocument) => unknown) => fn(doc),
    transaction: (_label: string, fn: (tx: unknown) => unknown) => {
      const before = doc.saveSnapshot()
      let result: unknown
      try {
        result = fn({ doc: () => doc, deferPagination: () => {} })
      } catch (thrown) {
        doc.restoreSnapshot(before)
        doc.discardSnapshot(before)
        throw thrown
      }
      doc.discardSnapshot(before)
      emit('document-changed')
      return result
    },
    events: {
      on: (name: string, handler: (detail?: unknown) => void) => {
        listeners.set(name, [...(listeners.get(name) ?? []), handler])
        return () => {}
      },
    },
    // the editor's commands (marks, reveal, caret state) have no screen to act on here
    automation: { execute: () => null },
  }
  return host as unknown as AgentPluginHost
}

function bridgeOf(surface: AgentPluginSurface): AgentBridge {
  const bridge: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
  for (const [name, method] of Object.entries(surface)) {
    if (typeof method === 'function') {
      bridge[name] = async (...args: unknown[]) => (method as (...a: unknown[]) => unknown)(...args)
    }
  }
  return bridge as unknown as AgentBridge
}

async function sessionOf(
  doc: HwpDocument,
  mods: AppModules,
  extra: Pick<HwpEditSession, 'base' | 'originalHwpx' | 'trackingDropped'>,
): Promise<HwpEditSession> {
  const surface = mods.plugin.agentPlugin.activate(headlessHost(doc)) as AgentPluginSurface
  const { skill } = mods.skill.createHwpSkill({
    bridge: bridgeOf(surface),
    // activity labels are for the app's panel; the op results carry the model-facing text
    label: (key) => key,
    onChange: () => {},
    // a scripted batch has no one to ask: a change that would take memos is refused
    confirmMemoRemoval: async () => false,
    imageGenAvailable: () => false,
  })
  return { doc, surface, skill, mods, ...extra }
}

/** Open an `.hwp` / `.hwpx` for editing, as the app's editor tab opens it. */
export async function openHwpForEdit(bytes: Uint8Array): Promise<HwpEditSession> {
  const [{ HwpDocument }, mods] = await Promise.all([loadEngine(), appModules()])
  let data = bytes
  let trackingDropped = false
  const isHwp = mods.savePlan.bytesMatchFormat(data, 'hwp')
  if (isHwp && mods.tracked.hasTrackedChanges(data)) {
    // the engine reads and writes the second body of a tracked document in a way Hangul
    // cannot open again (decision 0027): edit the document as it reads now, or not at all
    const current = mods.tracked.withoutTrackedChanges(data)
    if (!current) {
      throw new CliError(
        EXIT.usage,
        'the document holds tracked changes that cannot be set aside',
        undefined,
        {
          reason: 'unsupported',
          suggestion: 'accept or reject the changes in Hangul first',
        },
      )
    }
    data = current
    trackingDropped = true
  }
  const base: SaveBase = {}
  if (isHwp) {
    base.tails = mods.tails.sectionTailsOf(data) ?? undefined
    base.kinds = mods.kinds.fieldKindsOf(data) ?? undefined
  }
  let doc: HwpDocument
  try {
    doc = new HwpDocument(data)
  } catch (thrown) {
    throw openFailure(thrown)
  }
  const originalHwpx = mods.savePlan.bytesMatchFormat(data, 'hwpx') ? data : null
  return sessionOf(doc, mods, { base, originalHwpx, trackingDropped })
}

/** A new document: the engine's blank one (one empty paragraph on an A4 page), as a new HWP tab starts. */
export async function blankHwpForEdit(): Promise<HwpEditSession> {
  const [{ HwpDocument }, mods] = await Promise.all([loadEngine(), appModules()])
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  return sessionOf(doc, mods, { base: {}, originalHwpx: null, trackingDropped: false })
}

export function closeHwpSession(session: HwpEditSession): void {
  try {
    session.surface.clearMarks?.()
  } catch {
    // nothing to clear
  }
  // the plugin keeps listeners from its last activation; stop them before the engine
  // document they read is freed
  ;(session.mods.plugin.agentPlugin as { deactivate?: () => void }).deactivate?.()
  session.doc.free()
}

/** The in-app AI tools that run here, in the order the AI gets them. */
export async function hwpOpTools(): Promise<AgentToolDef[]> {
  // the tool list does not touch the document: no engine is loaded for it
  const { createHwpSkill } = await import('../../../../apps/hwp/src/renderer/ai/hwp-skill')
  const { skill } = createHwpSkill({
    bridge: {} as AgentBridge,
    label: (key) => key,
    onChange: () => {},
    confirmMemoRemoval: async () => false,
    imageGenAvailable: () => false,
  })
  return skill.tools.filter((tool) => !Object.hasOwn(NOT_HEADLESS, tool.name))
}

/** Groups of the op reference; an op the app adds later lands in "other" until it is placed. */
const HWP_GROUPS: { name: string; summary: string; ops: string[] }[] = [
  {
    name: 'read',
    summary: 'answers in detail.results, change nothing',
    ops: [
      'read_document',
      'read_memos',
      'find_text',
      'list_tables',
      'read_table',
      'list_fields',
      'list_notes',
      'read_style',
      'read_note_settings',
      'read_page_setup',
      'read_formatting',
      'list_paragraph_looks',
    ],
  },
  {
    name: 'text',
    summary: 'text is found by what it says; a text that occurs more than once needs occurrence',
    ops: ['replace_text', 'replace_all', 'insert_paragraphs', 'delete_paragraph'],
  },
  {
    name: 'format',
    summary: 'only the properties given change',
    ops: [
      'format_text',
      'format_paragraph',
      'format_look',
      'create_style',
      'edit_style',
      'set_page_setup',
      'set_note_settings',
    ],
  },
  {
    name: 'tables',
    summary: 'tables by their number from list_tables, cells by 1-based row and col',
    ops: [
      'insert_table',
      'fill_cells',
      'check_boxes',
      'add_to_table',
      'remove_from_table',
      'delete_table',
      'merge_cells',
      'split_cell',
      'format_cells',
    ],
  },
  {
    name: 'forms',
    summary: 'form fields (click-here fields) by their number from list_fields',
    ops: ['fill_field'],
  },
  {
    name: 'notes',
    summary: 'footnotes and endnotes, and a table of contents',
    ops: ['insert_note', 'edit_note', 'delete_note', 'insert_toc', 'refresh_toc'],
  },
]

/** The op reference of `hwp apply`, built from the in-app AI's tool definitions. */
export async function hwpCatalog(): Promise<OpCatalog> {
  const tools = await hwpOpTools()
  const ops: OpEntry[] = tools.map((tool) => {
    const schema = tool.inputSchema as JsonSchema
    return {
      op: tool.name,
      group: HWP_GROUPS.find((g) => g.ops.includes(tool.name))?.name ?? 'other',
      signature: signatureFromSchema(schema),
      note: tool.description,
      schema,
    }
  })
  const groups = [...HWP_GROUPS, { name: 'other', summary: '', ops: [] as string[] }]
    .map((g) => ({
      name: g.name,
      ...(g.summary ? { summary: g.summary } : {}),
      ops: ops.filter((e) => e.group === g.name).map((e) => e.op),
    }))
    .filter((g) => g.ops.length > 0)
  return withFingerprint({ domain: 'hwp', groups, ops })
}

export interface HwpOpResult {
  index: number
  op: string
  /** what the op answered (the text the in-app AI reads back) */
  output: string
  /** the op changed the document */
  changed: boolean
}

export interface HwpOpsOutcome {
  results: HwpOpResult[]
  failures: OpFailure[]
  /** ops after a stop_on_error rejection that were not run */
  skipped: number
}

/**
 * Run a batch of ops: `{ "op": "<tool name>", ...the tool's input }`. Each op is one
 * change of the plugin (rolled back whole when refused). Atomic mode throws on the first
 * refusal, before anything is written.
 */
export async function applyHwpOps(
  session: HwpEditSession,
  ops: unknown[],
  mode: BatchMode,
): Promise<HwpOpsOutcome> {
  const tools = new Set(session.skill.tools.map((tool) => tool.name))
  const supported = [...tools].filter((name) => !Object.hasOwn(NOT_HEADLESS, name))
  const results: HwpOpResult[] = []
  const failures: OpFailure[] = []
  for (const [index, op] of ops.entries()) {
    const entry =
      op && typeof op === 'object' && !Array.isArray(op) ? (op as Record<string, unknown>) : null
    const name = typeof entry?.op === 'string' ? entry.op : ''
    let failure: OpFailure | null = null
    if (!entry) {
      failure = {
        ...classifyOpError(index, name, 'expected an op object'),
        reason: 'invalid_argument',
      }
    } else if (Object.hasOwn(NOT_HEADLESS, name)) {
      failure = {
        ...classifyOpError(
          index,
          name,
          `${name} is not available from the command line: ${NOT_HEADLESS[name]}`,
        ),
        reason: 'unsupported',
      }
    } else if (!tools.has(name)) {
      failure = classifyOpError(
        index,
        name,
        `unknown op "${name}". Supported ops: [${supported.join(', ')}]`,
      )
    } else {
      const { op: _name, ...input } = entry
      const exec = await session.skill.executeTool({ id: `ieum-${index}`, name, input })
      if (exec.isError) failure = classifyOpError(index, name, exec.output)
      else results.push({ index, op: name, output: exec.output, changed: exec.mutated === true })
    }
    if (!failure) continue
    if (mode === 'atomic') {
      throw new CliError(
        EXIT.usage,
        `op ${index} (${name || '?'}) rejected: ${failure.error}`,
        { failures: [failure] },
        {
          reason: failure.reason,
          suggestion:
            failure.reason === 'unknown_op'
              ? failure.did_you_mean
                ? `did you mean ${failure.did_you_mean}? \`ieumoffice guide hwp\` lists the ops`
                : 'run `ieumoffice guide hwp` for the ops'
              : 'fix that op (read the document with `ieumoffice hwp read`) and resend the whole batch',
        },
      )
    }
    failures.push(failure)
    if (mode === 'stop_on_error') return { results, failures, skipped: ops.length - index - 1 }
  }
  return { results, failures, skipped: 0 }
}

export interface HwpSaved {
  bytes: Uint8Array
  /** master pages or memos of the opened `.hwp` that could not be put back (Hangul may differ) */
  tailsLost: boolean
  /** memos of an HWPX the written bytes no longer hold */
  memosLost: number
}

/**
 * The document as the app's save writes it: an `.hwp` only once the engine reads its own
 * output back with the same page count, then new tab widths, field kinds and section tails
 * put right (decisions 0024, 0026, 0028), and the result must be a container of the format.
 */
export async function saveHwpSession(
  session: HwpEditSession,
  format: HwpFormat,
): Promise<HwpSaved> {
  const { doc, mods } = session
  let bytes: Uint8Array
  let memosLost = 0
  if (format === 'hwp') {
    let verify: { recovered?: boolean; pageCountBefore?: number; pageCountAfter?: number }
    try {
      verify = JSON.parse(doc.exportHwpVerify()) as typeof verify
    } catch {
      verify = {}
    }
    if (!verify.recovered || verify.pageCountBefore !== verify.pageCountAfter) {
      throw new CliError(
        EXIT.conversion,
        'the HWP the engine wrote does not read back the same; nothing was written',
        { verify },
        {
          reason: 'conversion_failed',
          suggestion: 'write .hwpx with --out, or edit the file in the app',
        },
      )
    }
    bytes = doc.exportHwp()
  } else {
    bytes = doc.exportHwpx()
  }
  let tabs: MeasuredTab[] = []
  try {
    const spots = mods.tabs.newTabsOf(bytes, format)
    if (spots.length > 0) {
      const measures = session.surface.measureTabs(spots).tabs
      tabs = spots.flatMap((spot, index) => {
        const measure = measures[index]
        return measure ? [{ ...spot, ...measure }] : []
      })
    }
  } catch {
    // a tab that cannot be measured is written as the engine wrote it (as in the app)
  }
  const fixed = mods.saveFixes.applySaveFixes(bytes, format, tabs, session.base)
  bytes = fixed.bytes
  if (!mods.savePlan.bytesMatchFormat(bytes, format)) {
    throw new CliError(
      EXIT.conversion,
      `the engine did not produce a ${format} file; nothing was written`,
      undefined,
      {
        reason: 'conversion_failed',
      },
    )
  }
  if (format === 'hwpx') {
    const listed = session.surface.listMemos()
    memosLost = await mods.memos.lostMemoCountOf({
      saved: bytes,
      original: session.originalHwpx,
      memos: listed.memos.map((memo) => ({
        author: memo.author,
        date: memo.date,
        text: memo.text,
        place: memo.place,
        sectionIndex: memo.sectionIndex,
        paraIndex: memo.paraIndex,
        startCharIdx: memo.startCharIdx,
        endCharIdx: memo.endCharIdx,
        path: memo.path,
      })),
    })
  }
  return { bytes, tailsLost: fixed.tailsSkipped !== undefined, memosLost }
}

/** `hwp` or `hwpx` from a path, or null for anything else. */
export function hwpFormatOf(path: string): HwpFormat | null {
  const m = /\.(hwpx?)$/i.exec(path)
  return m ? (m[1]!.toLowerCase() as HwpFormat) : null
}

/** The file the app's save keeps beside a document before overwriting it. */
export function hwpBackupPath(path: string): string {
  return `${path}.bak`
}
