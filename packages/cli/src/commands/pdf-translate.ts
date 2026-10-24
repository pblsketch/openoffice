/**
 * `pdf translate <file.pdf> --to <lang> [--pages] [--format pdf,md,epub]
 * [--bilingual] [--out] [--partial] [--restart] [--yes] [--allow-paid]
 * [--password] [--force]` (spec §8, §10).
 *
 * The text blocks of the chosen pages go to the AI provider in batches; the
 * translated blocks land in the result store the app shares, so a second run
 * continues where the first stopped (--restart starts over, keeping the
 * blocks a person edited in the app: they count as done). The result
 * files are built from the store at the end: a stopped run writes them only
 * with --partial, with the untranslated rest in the source language.
 */
import { basename, dirname, extname, join, resolve } from 'node:path'
import {
  buildBilingualTree,
  buildTranslatedTree,
  estimateTranslationJob,
  isTranslationLanguage,
  startTranslationJob,
  TRANSLATION_LANGUAGES,
  translationJobParts,
  translationLanguageName,
  translationReport,
  type DocumentTree,
  type JobSummary,
  type TextUnit,
  type TranslationJobItem,
  type WritebackReport,
} from '../../../pdf-structure/src'
import type { JobRecordInput, ResultStore } from '../../../pdf-structure/src/store'
import { flagBool, flagString, type ParsedArgs } from '../args'
import { writeEpubFile, writeMarkdownFile, writeTranslatedPdfFile } from '../formats/pdf-outputs'
import {
  documentHash,
  documentTree,
  parsePageList,
  pdfFacts,
  resultStore,
  withStoredReadings,
} from '../formats/pdf-structure'
import { readInput, realizedPath, resolveOutput } from '../fs'
import { askPdfModel } from '../pdf-ai'
import { trackBackgroundJob } from '../pdf-jobs'
import type { CommandContext } from '../registry'
import { CliError, EXIT, type CommandResult } from '../result'
import {
  assertNoRunningJob,
  assertPaidAllowed,
  estimateOf,
  pdfJobRoute,
  stopOnSignals,
  stoppedError,
  type AvailableRoute,
} from './pdf-job'

export const TRANSLATION_FORMATS = ['pdf', 'md', 'epub'] as const
export type TranslationFormat = (typeof TRANSLATION_FORMATS)[number]

/**
 * Target languages a translated PDF cannot be written in: the writer does no
 * right-to-left layout or complex-script shaping (Arabic, Hebrew, Devanagari),
 * so every block would stay in the source language. Markdown and EPUB work.
 */
export const PDF_UNWRITABLE_LANGUAGES: ReadonlySet<string> = new Set(['ar', 'he', 'hi'])

type Batch = TranslationJobItem<TextUnit>[]

function parseFormats(spec: string | undefined): TranslationFormat[] {
  const names = (spec ?? 'pdf')
    .split(',')
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean)
  const bad = names.filter((f) => !(TRANSLATION_FORMATS as readonly string[]).includes(f))
  if (!names.length || bad.length) {
    throw new CliError(
      EXIT.usage,
      `--format takes pdf, md and epub, comma-separated${bad.length ? ` (not ${bad.join(', ')})` : ''}`,
      { supported: [...TRANSLATION_FORMATS] },
      { reason: 'invalid_argument' },
    )
  }
  return TRANSLATION_FORMATS.filter((f) => names.includes(f))
}

/**
 * Where each format is written. Default: `<name>.<lang>.<ext>` beside the
 * source. `--out` names the file for one format; for several it is the base
 * path every format takes its own extension on.
 */
function outputPaths(
  input: string,
  lang: string,
  formats: TranslationFormat[],
  out: string | undefined,
): Map<TranslationFormat, string | undefined> {
  const paths = new Map<TranslationFormat, string | undefined>()
  if (out === undefined) {
    const stem = join(dirname(input), basename(input, extname(input)))
    for (const f of formats) paths.set(f, `${stem}.${lang}.${f}`)
    return paths
  }
  if (formats.length === 1) {
    paths.set(formats[0]!, out)
    return paths
  }
  const ext = extname(out).slice(1).toLowerCase()
  const base = (TRANSLATION_FORMATS as readonly string[]).includes(ext)
    ? out.slice(0, -(ext.length + 1))
    : out
  for (const f of formats) paths.set(f, `${base}.${f}`)
  return paths
}

function sameFile(a: string, b: string): boolean {
  const [x, y] = [realizedPath(a), realizedPath(b)]
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

export async function pdfTranslate(
  path: string,
  args: ParsedArgs,
  ctx: CommandContext,
): Promise<CommandResult> {
  const lang = flagString(args, 'to')
  if (lang === undefined) {
    throw new CliError(EXIT.usage, 'missing --to <language code>', undefined, {
      reason: 'missing_argument',
      suggestion: `pass one of ${TRANSLATION_LANGUAGES.join(', ')}`,
    })
  }
  if (!isTranslationLanguage(lang)) {
    throw new CliError(
      EXIT.usage,
      `cannot translate into ${JSON.stringify(lang)}`,
      { supported: [...TRANSLATION_LANGUAGES] },
      { reason: 'unsupported', suggestion: 'pick a language code from detail.supported' },
    )
  }
  const formats = parseFormats(flagString(args, 'format'))
  const bilingual = flagBool(args, 'bilingual')
  if (formats.includes('pdf') && PDF_UNWRITABLE_LANGUAGES.has(lang)) {
    throw new CliError(
      EXIT.usage,
      `a translation into ${translationLanguageName(lang)} cannot be written into a PDF (its script needs right-to-left or shaped layout); nothing was sent`,
      { lang, supported_formats: ['md', 'epub'] },
      { reason: 'unsupported', suggestion: 'pass --format md,epub' },
    )
  }
  const password = flagString(args, 'password')
  const bytes = readInput(path)
  const facts = await pdfFacts(bytes, password)
  if (formats.includes('pdf') && facts.encrypted) {
    throw new CliError(
      EXIT.usage,
      'the PDF is encrypted: a translated PDF cannot be written into it; nothing was sent',
      { supported_formats: ['md', 'epub'] },
      { reason: 'unsupported', suggestion: 'pass --format md,epub' },
    )
  }
  const spec = flagString(args, 'pages')
  const pages = spec === undefined ? undefined : parsePageList(spec, facts.pages)
  const force = flagBool(args, 'force')
  const partial = flagBool(args, 'partial')
  const restart = flagBool(args, 'restart')
  // every output is checked before anything is sent: a run must not end in a refusal to write.
  // An estimate sends nothing, so there a file in the way is only a warning.
  const yes = flagBool(args, 'yes')
  const targets = new Map<TranslationFormat, string>()
  for (const [format, target] of outputPaths(path, lang, formats, flagString(args, 'out'))) {
    let resolved: string
    try {
      resolved = resolveOutput(target, ctx, { force, fresh: true })
    } catch (err) {
      if (yes || !(err instanceof CliError) || err.reason === 'outside_allowed_roots') throw err
      ctx.warn({
        code: err.reason,
        message: err.message,
        ...(err.suggestion ? { suggestion: err.suggestion } : {}),
      })
      resolved = resolve(ctx.cwd, target!)
    }
    if (sameFile(resolved, path)) {
      throw new CliError(
        EXIT.usage,
        `output path must differ from the input: ${resolved}`,
        undefined,
        {
          reason: 'invalid_argument',
          suggestion: 'pass a different --out',
        },
      )
    }
    targets.set(format, resolved)
  }

  const docHash = documentHash(bytes)
  const store = resultStore(ctx.env)
  const route = await pdfJobRoute(ctx.env, 'translate')
  const extracted = await documentTree(bytes, {
    ...(password !== undefined ? { password } : {}),
    ...(pages !== undefined ? { pages } : {}),
    onProgress: (done, total) => ctx.log(`analyze page ${done}/${total}`),
  })
  const { tree } = await withStoredReadings(extracted, store, docHash)
  const parts = translationJobParts(tree, {
    lang,
    send: (request, signal) =>
      askPdfModel(
        route,
        { system: request.system, messages: [{ role: 'user', text: request.prompt }] },
        signal,
      ),
  })
  if (parts.blocks.length === 0) {
    throw new CliError(EXIT.usage, 'there is no text to translate on these pages', undefined, {
      reason: 'unsupported',
      suggestion:
        'a scanned PDF has no text layer: read its pages with `ieumoffice pdf ai-read` first',
    })
  }
  const model = { provider: route.provider, model: route.model }
  // a command cannot ask, so a restart keeps what a person edited by hand
  const job = { ...parts, docHash, lang, model, store, restart, keepEdited: restart }
  const estimate = await estimateTranslationJob(job)
  const providerChange = estimate.providerChange
    ? {
        stored: estimate.providerChange.stored,
        next: estimate.providerChange.next,
      }
    : null
  const name = basename(path)
  const overview = {
    estimate: estimateOf(route, estimate.calls, tree.pages.length),
    done_blocks: estimate.done,
    total_blocks: estimate.total,
    ...(providerChange ? { provider_change: providerChange } : {}),
  }

  if (!yes) {
    return {
      summary: `${name}: ${estimate.pending} of ${estimate.total} block(s) to translate into ${lang} in ${estimate.calls} request(s) to ${route.provider} (${route.route}${route.paid ? ', billed per request' : ''}); nothing sent without --yes`,
      detail: { started: false, ...overview },
    }
  }
  assertPaidAllowed(route, flagBool(args, 'allow-paid'))
  await assertNoRunningJob(store, docHash)
  if (providerChange) {
    ctx.warn({
      code: 'provider_changed',
      message: `the stored translation was made with ${providerChange.stored.provider ?? 'another provider'}; the rest is translated with ${route.provider}`,
      suggestion: 'pass --restart to translate everything with one provider',
    })
  }

  let reported = -1
  const handle = startTranslationJob({
    ...job,
    onProgress: (e) => {
      if (ctx.background || e.done === reported) return
      reported = e.done
      ctx.log(`translate ${e.done}/${e.total} blocks`)
    },
  })
  const finished = handle.result.then((summary) =>
    finish({
      summary,
      store,
      docHash,
      lang,
      route,
      tree,
      bytes,
      source: {
        pdfPath: path,
        ...(password !== undefined ? { password } : {}),
        ...(pages !== undefined ? { pages } : {}),
      },
      targets,
      bilingual,
      partial,
      force,
      ctx,
      name,
    }),
  )

  if (ctx.background) {
    trackBackgroundJob({ handle, finished })
    // the result is read from pdf_status; an error here is already in the job record
    finished.catch(() => undefined)
    return {
      summary: `${name}: translation into ${lang} started (${estimate.calls} request(s)); pdf_status reports its progress and output files`,
      detail: { started: true, ...overview },
    }
  }
  const release = stopOnSignals(() => handle.cancel('interrupted'))
  try {
    return await finished
  } finally {
    release()
  }
}

interface FinishInput {
  summary: JobSummary<Batch>
  store: ResultStore
  docHash: string
  lang: string
  route: AvailableRoute
  tree: DocumentTree
  bytes: Uint8Array
  source: { pdfPath: string; password?: string; pages?: number[] }
  targets: Map<TranslationFormat, string>
  bilingual: boolean
  partial: boolean
  force: boolean
  ctx: CommandContext
  name: string
}

/** Write the result files (complete, or stopped with --partial) and the job record that names them. */
async function finish(o: FinishInput): Promise<CommandResult> {
  const { summary, store, docHash, lang, ctx } = o
  const stopped = summary.state === 'stopped'
  const record: JobRecordInput = {
    kind: 'translate',
    lang,
    state: summary.state,
    progress: summary.progress,
    ...(summary.stopReason !== undefined ? { last_error: summary.stopReason } : {}),
    ...(summary.resetsAt !== undefined ? { resetsAt: summary.resetsAt } : {}),
  }
  if (stopped && !o.partial) {
    await store.writeJob(docHash, { ...record, outputs: [] }).catch(() => undefined)
    throw stoppedError('translation', summary, {
      done_blocks: summary.progress.done,
      total_blocks: summary.progress.total,
    })
  }

  const stored = await store.readTranslation(docHash, lang)
  const report = translationReport(o.tree, lang, stored)
  const translated = buildTranslatedTree(o.tree, lang, stored)
  const reflow = o.bilingual ? buildBilingualTree(o.tree, lang, stored) : translated
  const outputs: string[] = []
  let writeback: WritebackReport | null = null
  try {
    for (const [format, target] of o.targets) {
      // checked again: the file may have appeared while the job ran
      const out = resolveOutput(target, ctx, { force: o.force, fresh: true })
      if (format === 'pdf') {
        writeback = await writeTranslatedPdfFile(
          o.bytes,
          o.tree,
          translated,
          out,
          o.bilingual,
          (done, total) => {
            if (!ctx.background) ctx.log(`write page ${done}/${total}`)
          },
        )
      } else if (format === 'md') {
        await writeMarkdownFile(o.source, reflow, out)
      } else {
        await writeEpubFile(o.source, reflow, out, {
          title: o.tree.info.title || basename(o.source.pdfPath, extname(o.source.pdfPath)),
          ...(o.tree.info.author ? { author: o.tree.info.author } : {}),
          cover: true,
        })
      }
      outputs.push(out)
    }
  } catch (err) {
    await store
      .writeJob(docHash, {
        ...record,
        state: 'stopped',
        last_error: 'output-write-failed',
        outputs,
      })
      .catch(() => undefined)
    throw err
  }
  await store.writeJob(docHash, { ...record, outputs }).catch(() => undefined)

  // blocks the job gave up on, from the store and from batches it could not use
  const untranslated = new Map<string, { page: number; reason: string }>()
  for (const u of report.untranslated)
    untranslated.set(u.unitKey, { page: u.page, reason: u.reason })
  for (const f of summary.failedUnits) {
    for (const item of f.unit) {
      if (!untranslated.has(item.block.key)) {
        untranslated.set(item.block.key, { page: item.block.page, reason: f.reason })
      }
    }
  }
  for (const u of writeback?.untranslated ?? []) {
    // 'not-translated' is a block the translation itself left out, listed above or still pending
    if (u.reason !== 'not-translated' && !untranslated.has(u.unitKey)) {
      untranslated.set(u.unitKey, { page: u.page, reason: u.reason })
    }
  }
  const detail: Record<string, unknown> = {
    lang,
    provider: o.route.provider,
    model: o.route.model,
    translated_blocks: report.translated,
    untranslated_blocks: [...untranslated.values()].sort((a, b) => a.page - b.page),
    overflowed_blocks: (writeback?.overflowed ?? []).map((b) => ({ page: b.page })),
    original_pages: (writeback?.originalPages ?? []).map((p) => ({
      page: p.page,
      reason: p.reason,
    })),
    outputs,
  }
  if (stopped) {
    detail.stopped = {
      errorCode: summary.stopReason ?? 'cancelled',
      ...(summary.resetsAt !== undefined ? { resetsAt: summary.resetsAt } : {}),
    }
    detail.done_blocks = summary.progress.done
    detail.total_blocks = summary.progress.total
  }
  return {
    status: stopped ? 'partial' : 'ok',
    summary: stopped
      ? `${o.name}: translation stopped (${summary.stopReason}); ${report.translated} of ${report.total} block(s) translated, the rest left in the source language`
      : `${o.name}: translated ${report.translated} of ${report.total} block(s) into ${lang}`,
    ...(outputs.length === 1 ? { outputPath: outputs[0] } : {}),
    detail,
  }
}
