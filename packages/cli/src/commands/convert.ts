import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { PdfLoadError } from '@genoffice/pdf2docx'
import { flagBool, flagString, type ParsedArgs } from '../args'
import { csvToXlsx, sheetNameFromStem } from '../formats/csv'
import { convertPdf, type PdfTarget } from '../formats/pdf'
import { convertLegacyWorkbook, sheetToCsv } from '../formats/xlsx'
import { exportViaApp, type AppExportTarget } from '../formats/app-export'
import { htmlToMarkdown, markdownToDocx, markdownToHtml } from '../formats/markdown'
import { closeDocument, documentHtml, openDocument } from '../formats/docx'
import { docxBytesToOdt, openOdtBytes, reportOdtConversion } from '../formats/odt'
import { writeEpubFile, writeMarkdownFile } from '../formats/pdf-outputs'
import {
  documentHash,
  documentTree,
  onlyPageImages,
  parsePageList,
  pdfFacts,
  resultStore,
  withStoredReadings,
} from '../formats/pdf-structure'
import { extension, readInput, resolveInput, resolveOutput, writeOutput } from '../fs'
import type { CommandContext, CommandDef } from '../registry'
import { CliError, EXIT } from '../result'

/** Conversions that run in this process. */
const NODE_ROUTES: Record<string, readonly string[]> = {
  pdf: ['docx', 'pptx', 'xlsx', 'md', 'epub'],
  csv: ['xlsx'],
  xls: ['xlsx'],
  xlsb: ['xlsx'],
  ods: ['xlsx'],
  md: ['docx', 'html'],
  markdown: ['docx', 'html'],
  docx: ['md'],
  xlsx: ['csv'],
  xlsm: ['csv'],
}

/**
 * Conversions the GenOffice binary runs for us in its hidden headless-export
 * mode: anything that needs an app renderer (page layout for pdf, the Word
 * editor's HTML export, html2docx). Mirrors HEADLESS_TARGETS in the shell.
 */
const APP_ROUTES: Record<string, readonly AppExportTarget[]> = {
  pdf: ['html'],
  csv: ['pdf'],
  xls: ['pdf'],
  md: ['pdf'],
  markdown: ['pdf'],
  docx: ['pdf', 'html'],
  xlsx: ['pdf'],
  xlsm: ['pdf'],
  pptx: ['pdf'],
  html: ['pdf', 'docx'],
  htm: ['pdf', 'docx'],
}

/**
 * OpenDocument text routes. They pass through a docx: an .odt is opened as
 * its bridge docx (odtToDocx) and goes on along the docx routes (the app's
 * headless export does not take .odt, so pdf/html read a temporary docx);
 * docx, md and html reach .odt through docx and docxToOdt.
 */
const ODT_ROUTES: Record<string, readonly string[]> = {
  odt: ['docx', 'pdf', 'md', 'html'],
  docx: ['odt'],
  md: ['odt'],
  markdown: ['odt'],
  html: ['odt'],
  htm: ['odt'],
}

const ROUTES: Record<string, readonly string[]> = Object.fromEntries(
  [
    ...new Set([
      ...Object.keys(NODE_ROUTES),
      ...Object.keys(APP_ROUTES),
      ...Object.keys(ODT_ROUTES),
    ]),
  ].map((from) => [
    from,
    [...(NODE_ROUTES[from] ?? []), ...(APP_ROUTES[from] ?? []), ...(ODT_ROUTES[from] ?? [])],
  ]),
)

function appTarget(from: string, to: string): AppExportTarget | null {
  const target = APP_ROUTES[from]?.find((t) => t === to)
  return target ?? null
}

export const convertCommand: CommandDef = {
  name: 'convert',
  summary: 'Convert a document to another format using the GenOffice engines.',
  usage:
    'convert <file> --to <format> [--out <path>] [--force] [--password <pw>] [--sheet <name>] [--pages <list>] [--title <text>] [--author <text>] [--no-cover]',
  options: [
    { name: 'to', value: 'format', description: 'target format: ' + describeRoutes() },
    { name: 'out', value: 'path', description: 'output file (default: same name, new extension)' },
    { name: 'force', description: 'overwrite an existing output file' },
    { name: 'password', value: 'pw', description: 'password for an encrypted PDF' },
    {
      name: 'sheet',
      value: 'name',
      description: 'xlsx→csv: worksheet to export (default: the active one)',
    },
    {
      name: 'pages',
      value: 'list',
      description: 'pdf→md/epub: pages like 1-5,8 (default: every page)',
    },
    {
      name: 'title',
      value: 'text',
      description: 'pdf→epub: title (default: from the PDF)',
    },
    {
      name: 'author',
      value: 'text',
      description: 'pdf→epub: author (default: from the PDF)',
    },
    { name: 'no-cover', description: 'pdf→epub: no cover page' },
  ],
  async run(args, ctx) {
    const input = resolveInput(args.positionals[0], ctx)
    const from = extension(input)
    const to = flagString(args, 'to')?.toLowerCase()
    if (!to)
      throw new CliError(EXIT.usage, 'missing --to <format>', undefined, {
        reason: 'missing_argument',
      })
    const targets = ROUTES[from]
    if (!targets?.includes(to)) {
      throw new CliError(
        EXIT.usage,
        `cannot convert .${from} to .${to}`,
        { supported: describeRoutes() },
        { reason: 'unsupported', suggestion: 'pick a route from detail.supported' },
      )
    }
    assertRouteOptions(args, from, to)
    // before run(): the sidecar and app routes write the output themselves
    const output = resolveOutput(flagString(args, 'out'), ctx, {
      fallback: join(dirname(input), `${basename(input, extname(input))}.${to}`),
      force: flagBool(args, 'force'),
      fresh: true,
    })
    if (samePath(input, output))
      throw new CliError(
        EXIT.usage,
        `output path must differ from the input: ${output}`,
        undefined,
        {
          reason: 'invalid_argument',
          suggestion: 'pass a different --out',
        },
      )
    const result = await run(input, from, to, output, args, ctx)
    if (result.bytes) writeOutput(output, result.bytes)
    return {
      summary: `converted ${basename(input)} → ${basename(output)}`,
      outputPath: output,
      detail: result.detail,
    }
  },
}

function samePath(a: string, b: string): boolean {
  const real = (p: string) => {
    try {
      return realpathSync.native(p)
    } catch {
      return join(realpathSync.native(dirname(p)), basename(p))
    }
  }
  const [x, y] = [real(a), real(b)]
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

interface Produced {
  bytes?: Uint8Array
  detail: Record<string, unknown>
}

async function run(
  input: string,
  from: string,
  to: string,
  output: string,
  args: ParsedArgs,
  ctx: CommandContext,
): Promise<Produced> {
  if (from === 'odt' || to === 'odt') return runOdt(input, from, to, output, ctx)
  const password = flagString(args, 'password')
  if (from === 'pdf' && to === 'html') {
    return convertPdfViaDocx(input, to, output, password, ctx)
  }
  const viaApp = appTarget(from, to)
  if (viaApp) {
    const r = await exportViaApp(input, viaApp, output, { env: ctx.env, log: ctx.log })
    return { detail: { via: 'ieumoffice --headless-export', summary: r.summary } }
  }
  if (from === 'pdf' && (to === 'md' || to === 'epub')) {
    return pdfReflow(input, to, output, args, ctx)
  }
  if (from === 'pdf') {
    const r = await convertPdfOrThrow(input, to as PdfTarget, password, ctx)
    return { bytes: r.bytes, detail: { pages: r.pages, warnings: r.warnings } }
  }
  if (from === 'md' || from === 'markdown') {
    const text = Buffer.from(readInput(input)).toString('utf-8')
    const title = basename(input, extname(input))
    if (to === 'html') {
      return { bytes: Buffer.from(await markdownToHtml(text, title), 'utf-8'), detail: { title } }
    }
    return { bytes: await markdownToDocx(text, { file: input, ctx }), detail: { title } }
  }
  if (from === 'csv') {
    const sheet = sheetNameFromStem(basename(input, extname(input)))
    return { bytes: await csvToXlsx(readInput(input), sheet), detail: { sheet } }
  }
  if (to === 'csv') {
    const { csv, ...detail } = await sheetToCsv(input, { sheet: flagString(args, 'sheet') })
    // UTF-8 BOM, as the app writes it, so Excel opens the file without a wizard
    return { bytes: Buffer.from('\ufeff' + csv, 'utf-8'), detail }
  }
  if (to === 'md') return docxToMarkdown(readInput(input), ctx)
  const r = await convertLegacyWorkbook(input, output)
  return { detail: { sheets: r.sheets, cells: r.cells } }
}

async function docxToMarkdown(docx: Uint8Array, ctx: CommandContext): Promise<Produced> {
  const doc = await openDocument(docx)
  try {
    const exported = documentHtml(doc)
    const markdown = await htmlToMarkdown(exported.html)
    if (exported.skipped.images > 0) {
      ctx.warn({
        code: 'images_dropped',
        message: `${exported.skipped.images} image(s) have no Markdown form and were dropped`,
        suggestion: 'use `ieumoffice docs read --html` when the images matter',
      })
    }
    return {
      bytes: Buffer.from(markdown.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', 'utf-8'),
      detail: {
        blocks: doc.editor.state.doc.childCount,
        skipped: exported.skipped,
        formulas_as_text: exported.formulasAsText,
      },
    }
  } finally {
    closeDocument(doc)
  }
}

/** Options that belong to one route only are refused on the others rather than ignored. */
const ROUTE_OPTIONS: [string, (from: string, to: string) => boolean, string][] = [
  ['pages', (from, to) => from === 'pdf' && (to === 'md' || to === 'epub'), 'pdf→md/epub'],
  ['title', (from, to) => from === 'pdf' && to === 'epub', 'pdf→epub'],
  ['author', (from, to) => from === 'pdf' && to === 'epub', 'pdf→epub'],
  ['no-cover', (from, to) => from === 'pdf' && to === 'epub', 'pdf→epub'],
]

function assertRouteOptions(args: ParsedArgs, from: string, to: string): void {
  for (const [option, applies, route] of ROUTE_OPTIONS) {
    if (args.flags[option] === undefined || applies(from, to)) continue
    throw new CliError(EXIT.usage, `--${option} applies to ${route} only`, undefined, {
      reason: 'invalid_argument',
    })
  }
}

/**
 * Runs `work` on a temporary docx written beside the output (inside the
 * allowed roots the output already passed), and always deletes it.
 */
async function withTempDocx<T>(
  output: string,
  stem: string,
  docx: Uint8Array | null,
  work: (path: string) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(join(dirname(output), '.ieumoffice-odt-'))
  try {
    const path = join(dir, `${stem}.docx`)
    if (docx) writeOutput(path, docx)
    return await work(path)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function runOdt(
  input: string,
  from: string,
  to: string,
  output: string,
  ctx: CommandContext,
): Promise<Produced> {
  const stem = basename(input, extname(input))
  if (from === 'odt') {
    const { docxBytes, origin } = await openOdtBytes(readInput(input))
    const odt_report = reportOdtConversion(origin.report, to, ctx)
    if (to === 'docx') return { bytes: docxBytes, detail: { odt_report } }
    if (to === 'md') {
      const r = await docxToMarkdown(docxBytes, ctx)
      return { ...r, detail: { ...r.detail, odt_report } }
    }
    const target = to as AppExportTarget
    const r = await withTempDocx(output, stem, docxBytes, (docx) =>
      exportViaApp(docx, target, output, { env: ctx.env, log: ctx.log }),
    )
    return { detail: { via: 'ieumoffice --headless-export', summary: r.summary, odt_report } }
  }
  let docx: Uint8Array
  const detail: Record<string, unknown> = {}
  if (from === 'docx') docx = readInput(input)
  else if (from === 'md' || from === 'markdown') {
    const text = Buffer.from(readInput(input)).toString('utf-8')
    docx = await markdownToDocx(text, { file: input, ctx })
  } else {
    docx = await withTempDocx(output, stem, null, async (path) => {
      await exportViaApp(input, 'docx', path, { env: ctx.env, log: ctx.log })
      return new Uint8Array(readFileSync(path))
    })
    detail.via = 'ieumoffice --headless-export'
  }
  const { odtBytes, report } = await docxBytesToOdt(docx)
  return {
    bytes: odtBytes,
    detail: { ...detail, odt_report: reportOdtConversion(report, to, ctx) },
  }
}

/**
 * pdf→md / pdf→epub (spec §3, §5): the reflowed document tree of the chosen
 * pages, with the pages read by AI as read, written the way the PDF editor
 * writes it (Markdown with `assets/` beside it).
 */
async function pdfReflow(
  input: string,
  to: 'md' | 'epub',
  output: string,
  args: ParsedArgs,
  ctx: CommandContext,
): Promise<Produced> {
  const password = flagString(args, 'password')
  const bytes = readInput(input)
  const spec = flagString(args, 'pages')
  const pages =
    spec === undefined ? undefined : parsePageList(spec, (await pdfFacts(bytes, password)).pages)
  const extracted = await documentTree(bytes, {
    ...(password !== undefined ? { password } : {}),
    ...(pages !== undefined ? { pages } : {}),
    onProgress: (done, total) => ctx.log(`page ${done}/${total}`),
  })
  const { tree, aiPages } = await withStoredReadings(
    extracted,
    resultStore(ctx.env),
    documentHash(bytes),
  )
  if (onlyPageImages(tree)) {
    ctx.warn({
      code: 'pages_as_images',
      message:
        'every page is a picture without readable text, so the result holds page images only',
      suggestion: `read the pages with \`ieumoffice pdf ai-read ${basename(input)} --pages <list>\` first, then convert again`,
    })
  }
  const source = {
    pdfPath: input,
    ...(password !== undefined ? { password } : {}),
    ...(pages !== undefined ? { pages } : {}),
  }
  const common = { pages: tree.pages.length, ...(aiPages.length ? { ai_read_pages: aiPages } : {}) }
  if (to === 'md') {
    const md = await writeMarkdownFile(source, tree, output)
    return { detail: { ...common, ...md } }
  }
  const title = flagString(args, 'title') || tree.info.title || basename(input, extname(input))
  const author = flagString(args, 'author') ?? tree.info.author
  const cover = !flagBool(args, 'no-cover')
  await writeEpubFile(source, tree, output, { title, ...(author ? { author } : {}), cover })
  return { detail: { ...common, title, ...(author ? { author } : {}), cover } }
}

function describeRoutes(): string {
  return Object.entries(ROUTES)
    .map(([from, tos]) => `${from}→${tos.join('/')}`)
    .join(', ')
}

/**
 * PDF → Markdown / HTML goes through the Word reconstruction: pdf2docx
 * rebuilds paragraphs, headings, lists and tables, then the docx routes
 * serialize them. Markdown stays in-process; HTML needs the Word editor's
 * exporter, so the intermediate .docx is handed to the app from a temp dir.
 */
async function convertPdfViaDocx(
  input: string,
  to: 'md' | 'html',
  output: string,
  password: string | undefined,
  ctx: CommandContext,
): Promise<Produced> {
  const pdf = await convertPdfOrThrow(input, 'docx', password, ctx)
  const via = { pages: pdf.pages, warnings: pdf.warnings, intermediate: 'docx' }
  if (to === 'md') {
    const md = await docxToMarkdown(pdf.bytes, ctx)
    return { bytes: md.bytes, detail: { ...via, ...md.detail } }
  }
  const dir = mkdtempSync(join(tmpdir(), 'genoffice-convert-'))
  const docxPath = join(dir, `${basename(input, extname(input))}.docx`)
  try {
    writeFileSync(docxPath, pdf.bytes)
    const r = await exportViaApp(docxPath, 'html', output, { env: ctx.env, log: ctx.log })
    return { detail: { ...via, via: 'genoffice --headless-export', summary: r.summary } }
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch (err) {
      ctx.log(`could not remove temp dir ${dir}: ${String(err)}`)
    }
  }
}

async function convertPdfOrThrow(
  input: string,
  target: PdfTarget,
  password: string | undefined,
  ctx: CommandContext,
) {
  try {
    return await convertPdf(readInput(input), target, {
      password,
      onProgress: (page, total) => ctx.log(`page ${page}/${total}`),
    })
  } catch (err) {
    if (err instanceof PdfLoadError) {
      const code = err.code === 'password-required' ? EXIT.file : EXIT.conversion
      throw new CliError(code, err.message, { reason: err.code })
    }
    throw err
  }
}
