/**
 * `epub translate <file.epub> --to <lang> [--chapters] [--kind
 * translated,bilingual] [--out] [--partial] [--restart] [--yes]
 * [--allow-paid] [--force]` (spec §8, §9).
 *
 * The editable blocks of the chosen chapters, the book's title and its
 * contents labels go to the AI provider in batches, on the same job engine
 * and in the same result store as the PDF translation, so a second run
 * continues where the first stopped. The result books are built at the end
 * from the saved book and the store; the source file is never changed. A
 * stopped run writes them only with --partial, with the rest in the source
 * language.
 */
import { basename, dirname, extname, join, resolve } from 'node:path'
import {
  buildTranslatedEpub,
  epubDocumentHash,
  epubTranslationUnits,
  estimateEpubTranslationJob,
  openChapter,
  openEpub,
  startEpubTranslationJob,
  EPUB_METADATA_PAGE,
  type EpubBook,
  type EpubTranslationOutputKind,
  type EpubTranslationReport,
  type EpubTranslationUnit,
} from '@genoffice/epub-engine'
import {
  isTranslationLanguage,
  TRANSLATION_LANGUAGES,
  type JobSummary,
  type TranslationJobItem,
} from '../../../pdf-structure/src'
import type { JobRecordInput, ResultStore } from '../../../pdf-structure/src/store'
import { flagBool, flagString, type ParsedArgs } from '../args'
import { resultStore } from '../formats/pdf-structure'
import { readInput, realizedPath, resolveOutput, writeOutput } from '../fs'
import { askPdfModel } from '../pdf-ai'
import { trackBackgroundJob } from '../pdf-jobs'
import type { CommandContext } from '../registry'
import { CliError, EXIT, type CommandResult } from '../result'
import {
  assertNoRunningJob,
  assertPaidAllowed,
  pdfJobRoute,
  stopOnSignals,
  stoppedError,
  type AvailableRoute,
} from './pdf-job'

export const EPUB_OUTPUT_KINDS = [
  'translated',
  'bilingual',
] as const satisfies readonly EpubTranslationOutputKind[]

/** detail.reason of an `unsupported` refusal (spec §9) */
export type EpubUnsupportedReason =
  'drm' | 'fixed-layout' | 'not-epub' | 'damaged' | 'too-large' | 'no-text'

type Batch = TranslationJobItem<EpubTranslationUnit>[]

const UNSUPPORTED_STEP: Record<EpubUnsupportedReason, string> = {
  drm: 'the book is protected by DRM: it cannot be translated',
  'fixed-layout': 'a fixed-layout book keeps its page images and is not translated',
  'not-epub': 'pass a .epub book',
  damaged: 'the file is damaged: save it again from the program that made it',
  'too-large': 'the book unpacks beyond the size limits: it cannot be opened',
  'no-text': 'choose chapters that have text with --chapters (detail.chapters lists them)',
}

function unsupported(
  reason: EpubUnsupportedReason,
  message: string,
  extra: Record<string, unknown> = {},
): CliError {
  return new CliError(
    EXIT.usage,
    message,
    { reason, ...extra },
    {
      reason: 'unsupported',
      suggestion: UNSUPPORTED_STEP[reason],
    },
  )
}

function parseKinds(spec: string | undefined): EpubTranslationOutputKind[] {
  const names = (spec ?? 'translated')
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
  const bad = names.filter((k) => !(EPUB_OUTPUT_KINDS as readonly string[]).includes(k))
  if (!names.length || bad.length) {
    throw new CliError(
      EXIT.usage,
      `--kind takes translated and bilingual, comma-separated${bad.length ? ` (not ${bad.join(', ')})` : ''}`,
      { supported: [...EPUB_OUTPUT_KINDS] },
      { reason: 'invalid_argument' },
    )
  }
  return EPUB_OUTPUT_KINDS.filter((k) => names.includes(k))
}

/**
 * `1-5,8` (1-based, spine order) as spine indices from 0, in book order,
 * without duplicates, checked against the book's `count` chapters.
 */
function parseChapterList(spec: string, count: number): number[] {
  const chosen = new Set<number>()
  for (const part of spec.split(',').map((p) => p.trim())) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part)
    if (!m) {
      throw new CliError(
        EXIT.usage,
        `--chapters must look like 1-5,8 (got ${JSON.stringify(spec)})`,
        undefined,
        { reason: 'invalid_argument' },
      )
    }
    const start = Number(m[1])
    const end = m[2] === undefined ? start : Number(m[2])
    if (start < 1 || end < start || end > count) {
      throw new CliError(
        EXIT.usage,
        `chapters ${spec} out of bounds (1-${count})`,
        { valid_range: [1, count] },
        { reason: 'out_of_range', suggestion: `use chapters between 1 and ${count}` },
      )
    }
    for (let c = start; c <= end; c++) chosen.add(c - 1)
  }
  return [...chosen].sort((a, b) => a - b)
}

/**
 * Where each kind is written. Default: `<name>.<lang>.epub` and
 * `<name>.<lang>.bilingual.epub` beside the source. `--out` names the file
 * for one kind; for both it is the base path (a trailing `.epub` is dropped)
 * that takes `.epub` and `.bilingual.epub`.
 */
function outputPaths(
  input: string,
  lang: string,
  kinds: EpubTranslationOutputKind[],
  out: string | undefined,
): Map<EpubTranslationOutputKind, string> {
  const paths = new Map<EpubTranslationOutputKind, string>()
  const suffix = (k: EpubTranslationOutputKind) => (k === 'bilingual' ? '.bilingual.epub' : '.epub')
  if (out === undefined) {
    const stem = join(dirname(input), basename(input, extname(input)))
    for (const k of kinds) paths.set(k, `${stem}.${lang}${suffix(k)}`)
    return paths
  }
  if (kinds.length === 1) {
    paths.set(kinds[0]!, out)
    return paths
  }
  const base = extname(out).toLowerCase() === '.epub' ? out.slice(0, -'.epub'.length) : out
  for (const k of kinds) paths.set(k, `${base}${suffix(k)}`)
  return paths
}

function sameFile(a: string, b: string): boolean {
  const [x, y] = [realizedPath(a), realizedPath(b)]
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

/** The saved book, or the refusal of a file that cannot be translated. */
async function openBook(bytes: Uint8Array): Promise<EpubBook> {
  const opened = await openEpub(bytes)
  if (!opened.ok) {
    const what: Record<typeof opened.reason, string> = {
      drm: 'the book is protected by DRM',
      'not-epub': 'not an EPUB book',
      damaged: 'the EPUB file is damaged',
      'too-large': 'the EPUB file unpacks beyond the size limits',
    }
    throw unsupported(opened.reason, `${what[opened.reason]}; nothing was sent`)
  }
  if (opened.book.fixedLayout) {
    throw unsupported('fixed-layout', 'a fixed-layout book cannot be translated; nothing was sent')
  }
  return opened.book
}

/** detail.chapters: every spine item, 1-based, with its contents title and whether it is read-only */
async function chapterList(
  book: EpubBook,
): Promise<{ index: number; title: string | null; read_only: boolean }[]> {
  const list = []
  for (const item of book.spine.items) {
    const entry = book.toc.entries.find((e) => e.spineIndex === item.index)
    const title = entry ? entry.title.replace(/\s+/g, ' ').trim() || null : null
    let readOnly = item.fixedLayout
    if (!readOnly) {
      const decoded = await book.readText(item.path)
      readOnly = !decoded?.valid || openChapter(decoded.text).broken
    }
    list.push({ index: item.index + 1, title, read_only: readOnly })
  }
  return list
}

export async function epubTranslate(
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
  const kinds = parseKinds(flagString(args, 'kind'))
  const bytes = readInput(path)
  const book = await openBook(bytes)
  const spec = flagString(args, 'chapters')
  const count = book.spine.items.length
  const chapters =
    spec === undefined ? book.spine.items.map((i) => i.index) : parseChapterList(spec, count)
  const force = flagBool(args, 'force')
  const partial = flagBool(args, 'partial')
  const restart = flagBool(args, 'restart')
  // every output is checked before anything is sent: a run must not end in a refusal to write.
  // An estimate sends nothing, so there a file in the way is only a warning.
  const yes = flagBool(args, 'yes')
  const targets = new Map<EpubTranslationOutputKind, string>()
  for (const [kind, target] of outputPaths(path, lang, kinds, flagString(args, 'out'))) {
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
      resolved = resolve(ctx.cwd, target)
    }
    if (sameFile(resolved, path)) {
      throw new CliError(
        EXIT.usage,
        `output path must differ from the input: ${resolved}`,
        undefined,
        { reason: 'invalid_argument', suggestion: 'pass a different --out' },
      )
    }
    targets.set(kind, resolved)
  }

  const { units } = await epubTranslationUnits(book, { chapters })
  const list = await chapterList(book)
  if (!units.some((u) => u.page !== EPUB_METADATA_PAGE)) {
    throw unsupported(
      'no-text',
      'there is no text to translate in these chapters; nothing was sent',
      { chapters: list },
    )
  }
  const docHash = await epubDocumentHash(bytes)
  const store = resultStore(ctx.env)
  const route = await pdfJobRoute(ctx.env, 'epub-translate')
  const model = { provider: route.provider, model: route.model }
  // a command cannot ask, so a restart keeps what a person edited by hand
  const plan = { docHash, lang, units, model, store, restart, keepEdited: restart }
  const estimate = await estimateEpubTranslationJob(plan)
  const providerChange = estimate.providerChange
    ? { stored: estimate.providerChange.stored, next: estimate.providerChange.next }
    : null
  const name = basename(path)
  const overview = {
    estimate: {
      calls: estimate.calls,
      chapters: chapters.length,
      provider: route.provider,
      route: route.route,
      metered: route.paid,
    },
    done_blocks: estimate.done,
    total_blocks: estimate.total,
    chapters: list,
    ...(providerChange ? { provider_change: providerChange } : {}),
  }

  if (!yes) {
    return {
      summary: `${name}: ${estimate.pending} of ${estimate.total} block(s) to translate into ${lang} in ${estimate.calls} request(s) to ${route.provider} (${route.route}${route.paid ? ', billed per request' : ''}); nothing sent without --yes`,
      detail: { started: false, ...overview },
    }
  }
  assertPaidAllowed(route, flagBool(args, 'allow-paid'))
  await assertNoRunningJob(store, docHash, 'epub status')
  if (providerChange) {
    ctx.warn({
      code: 'provider_changed',
      message: `the stored translation was made with ${providerChange.stored.provider ?? 'another provider'}; the rest is translated with ${route.provider}`,
      suggestion: 'pass --restart to translate everything with one provider',
    })
  }

  let reported = -1
  const handle = startEpubTranslationJob({
    ...plan,
    send: (request, signal) =>
      askPdfModel(
        route,
        { system: request.system, messages: [{ role: 'user', text: request.prompt }] },
        signal,
      ),
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
      bytes,
      chapters,
      targets,
      partial,
      force,
      ctx,
      name,
    }),
  )

  if (ctx.background) {
    trackBackgroundJob({ handle, finished })
    // the result is read from epub_status; an error here is already in the job record
    finished.catch(() => undefined)
    return {
      summary: `${name}: translation into ${lang} started (${estimate.calls} request(s)); epub_status reports its progress and output files`,
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
  bytes: Uint8Array
  /** spine indices from 0 */
  chapters: number[]
  targets: Map<EpubTranslationOutputKind, string>
  partial: boolean
  force: boolean
  ctx: CommandContext
  name: string
}

/** Write the result books (complete, or stopped with --partial) and the job record that names them. */
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
  const results = stored?.blocks ?? new Map()
  const outputs: string[] = []
  let report: EpubTranslationReport | null = null
  try {
    for (const [kind, target] of o.targets) {
      const built = await buildTranslatedEpub(o.bytes, {
        kind,
        lang,
        chapters: o.chapters,
        results,
      })
      if (!built.ok) {
        throw new CliError(
          EXIT.conversion,
          `the ${kind} book could not be built (${built.reason})`,
          { kind, errorCode: built.reason },
          { reason: 'conversion_failed' },
        )
      }
      report ??= built.report
      // checked again: the file may have appeared while the job ran
      const out = resolveOutput(target, ctx, { force: o.force, fresh: true })
      writeOutput(out, built.bytes)
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

  // blocks the job gave up on are not in the store; name their reason instead of "not translated"
  const failed = new Map<string, string>()
  for (const f of summary.failedUnits) {
    for (const item of f.unit) {
      for (const s of item.block.sources) {
        if (s.kind === 'block') failed.set(`${s.path}\u0000${s.blockId}`, f.reason)
      }
    }
  }
  const untranslated = (report?.untranslatedBlocks ?? []).map((b) => ({
    chapter: b.chapter + 1,
    reason:
      b.reason === 'not-translated'
        ? (failed.get(`${b.path}\u0000${b.blockId}`) ?? b.reason)
        : b.reason,
  }))
  const translated = report?.translatedBlocks ?? 0
  const detail: Record<string, unknown> = {
    lang,
    provider: o.route.provider,
    model: o.route.model,
    translated_blocks: translated,
    untranslated_blocks: untranslated,
    original_chapters: (report?.originalChapters ?? []).map((c) => ({
      chapter: c.chapter + 1,
      reason: c.reason,
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
  const total = translated + untranslated.length
  return {
    status: stopped ? 'partial' : 'ok',
    summary: stopped
      ? `${o.name}: translation stopped (${summary.stopReason}); ${translated} of ${total} block(s) translated, the rest left in the source language`
      : `${o.name}: translated ${translated} of ${total} block(s) into ${lang}`,
    ...(outputs.length === 1 ? { outputPath: outputs[0] } : {}),
    detail,
  }
}
