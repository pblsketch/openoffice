import { existsSync, mkdirSync, statSync } from 'node:fs'
import { basename, isAbsolute, resolve } from 'node:path'
import { treeToStructuredText } from '../../../pdf-structure/src'
import { flagBool, flagString } from '../args'
import { PDF_DEFAULT_PAGES, PDF_PAGE_PREVIEW_CHARS, pdfText } from '../formats/pdf'
import { writePageImages } from '../formats/pdf-outputs'
import {
  documentHash,
  documentTree,
  parsePageList,
  pdfFacts,
  pdfLoadError,
  resultStore,
  withStoredReadings,
} from '../formats/pdf-structure'
import { assertAllowed, extension, readInput, resolveInput } from '../fs'
import { clipText, previewChars } from '../preview'
import type { CommandContext, CommandDef } from '../registry'
import { CliError, EXIT, type CommandResult } from '../result'
import { pdfAiRead } from './pdf-ai-read'
import { pdfStatus } from './pdf-status'
import { pdfTranslate } from './pdf-translate'

const VERBS = ['read', 'images', 'ai-read', 'translate', 'status'] as const
type Verb = (typeof VERBS)[number]

/** The options each verb takes; the others are refused rather than ignored. */
const VERB_OPTIONS: Record<Verb, readonly string[]> = {
  read: ['page', 'range', 'password', 'full', 'max-chars', 'structured'],
  images: ['out', 'pages', 'password'],
  'ai-read': ['pages', 'yes', 'allow-paid', 'password'],
  translate: [
    'to',
    'pages',
    'format',
    'bilingual',
    'out',
    'partial',
    'restart',
    'yes',
    'allow-paid',
    'password',
    'force',
  ],
  status: [],
}

export const pdfCommand: CommandDef = {
  name: 'pdf',
  summary:
    'Read a PDF page by page (its text layer, or the structured text of its document tree), export its pictures, read pages with AI, translate it, and report what the result store holds for it.',
  usage:
    'pdf read <file.pdf> [--page n | --range a-b] [--structured] [--password <pw>] [--full | --max-chars n] | pdf images <file.pdf> --out <dir> [--pages <list>] | pdf ai-read <file.pdf> --pages <list> [--yes] [--allow-paid] | pdf translate <file.pdf> --to <lang> [--pages <list>] [--format pdf,md,epub] [--bilingual] [--out <path>] [--partial] [--restart] [--yes] [--allow-paid] [--force] | pdf status <file.pdf>',
  options: [
    { name: 'page', value: 'n', description: 'read: only this 1-based page' },
    {
      name: 'range',
      value: 'a-b',
      description: `read: 1-based page range (default: the first ${PDF_DEFAULT_PAGES} pages)`,
    },
    { name: 'password', value: 'pw', description: 'password for an encrypted PDF' },
    {
      name: 'full',
      description: 'read: every page with its whole text instead of a clipped preview',
    },
    {
      name: 'max-chars',
      value: 'n',
      description: `read: preview length per page (default ${PDF_PAGE_PREVIEW_CHARS}); clipped text ends in …(+n chars)`,
    },
    {
      name: 'structured',
      description: 'read: structured text from the document tree instead of the text layer',
    },
    {
      name: 'pages',
      value: 'list',
      description: 'pages like 1-5,8 (default: every page)',
    },
    {
      name: 'out',
      value: 'path',
      description:
        'images: folder (required); translate: result file (default <name>.<lang>.<ext>)',
    },
    {
      name: 'to',
      value: 'lang',
      description: 'translate: target language code (en, ko, ja, zh, zh-TW, fr, ...)',
    },
    {
      name: 'format',
      value: 'list',
      description: 'translate: pdf,md,epub (default pdf)',
    },
    {
      name: 'bilingual',
      description:
        'translate: md/epub with each translation after its paragraph, pdf with each translated page beside its source page',
    },
    {
      name: 'partial',
      description: 'translate: write what is done when the job stops early',
    },
    {
      name: 'restart',
      description:
        'translate: start over instead of continuing (paragraphs edited in the app are kept)',
    },
    {
      name: 'yes',
      description: 'send; without it only the estimate is answered',
    },
    {
      name: 'allow-paid',
      description: 'allow a route billed per request',
    },
    { name: 'force', description: 'translate: overwrite existing result files' },
  ],
  async run(args, ctx) {
    const [verb, file] = args.positionals
    if (!VERBS.includes(verb as Verb)) {
      throw new CliError(
        EXIT.usage,
        `expected "pdf <${VERBS.join('|')}> <file.pdf>"`,
        { verbs: [...VERBS] },
        {
          reason: verb === undefined ? 'missing_argument' : 'invalid_argument',
          suggestion: 'run `ieumoffice help pdf`',
        },
      )
    }
    const v = verb as Verb
    const extra = Object.keys(args.flags).filter(
      (f) => f !== 'json' && f !== 'help' && !VERB_OPTIONS[v].includes(f),
    )
    if (extra.length) {
      throw new CliError(
        EXIT.usage,
        `pdf ${v} does not take ${extra.map((f) => `--${f}`).join(', ')}`,
        { options: VERB_OPTIONS[v].map((o) => `--${o}`) },
        { reason: 'unknown_option', suggestion: 'run `ieumoffice help pdf`' },
      )
    }
    const path = pdfInput(file, ctx)
    switch (v) {
      case 'read':
        return read(path, args, ctx)
      case 'images':
        return images(path, args, ctx)
      case 'ai-read':
        return pdfAiRead(path, args, ctx)
      case 'translate':
        return pdfTranslate(path, args, ctx)
      case 'status':
        return pdfStatus(path, args, ctx)
    }
  },
}

type Args = Parameters<CommandDef['run']>[0]

function pdfInput(file: string | undefined, ctx: CommandContext): string {
  const path = resolveInput(file, ctx)
  if (extension(path) !== 'pdf') {
    throw new CliError(EXIT.usage, `not a PDF: ${path}`, undefined, {
      reason: 'unsupported',
      suggestion: 'use docs read, sheet read or slides read for Office files',
    })
  }
  return path
}

async function read(path: string, args: Args, ctx: CommandContext): Promise<CommandResult> {
  const page = flagString(args, 'page')
  const range = flagString(args, 'range')
  if (page !== undefined && range !== undefined) {
    throw new CliError(EXIT.usage, '--page and --range are exclusive', undefined, {
      reason: 'invalid_argument',
    })
  }
  const full = flagBool(args, 'full')
  const password = flagString(args, 'password')
  const maxChars = previewChars(args, PDF_PAGE_PREVIEW_CHARS)
  let windowed = false
  const select = (count: number): [number, number] => {
    if (page !== undefined) return parseSpan(page, count, '--page must be a 1-based page number')
    if (range !== undefined) return parseSpan(range, count, '--range must look like 3 or 3-10')
    if (full) return [1, count]
    windowed = count > PDF_DEFAULT_PAGES
    return [1, Math.min(PDF_DEFAULT_PAGES, count)]
  }
  const bytes = readInput(path)
  let doc
  try {
    doc = await pdfText(bytes, { password, maxChars, select })
  } catch (err) {
    throw pdfLoadError(err, password)
  }
  const first = doc.pages_read[0]?.page
  const last = doc.pages_read.at(-1)?.page
  const detail: Record<string, unknown> = { ...doc }
  if (flagBool(args, 'structured') && first !== undefined && last !== undefined) {
    const pages = Array.from({ length: last - first + 1 }, (_, i) => first + i)
    const docHash = documentHash(bytes)
    const extracted = await documentTree(bytes, {
      ...(password !== undefined ? { password } : {}),
      pages,
      onProgress: (done, total) => ctx.log(`analyze page ${done}/${total}`),
    })
    const { tree } = await withStoredReadings(extracted, resultStore(ctx.env), docHash)
    const texts = new Map(treeToStructuredText(tree).map((p) => [p.page, p.text]))
    detail.pages_read = doc.pages_read.map((p) => ({
      ...p,
      ...clipText(texts.get(p.page) ?? '', maxChars),
    }))
    detail.structured = true
  }
  if (first !== undefined && last !== undefined) detail.range = `${first}-${last}`
  if (windowed && last !== undefined) {
    const next = `${last + 1}-${Math.min(last + PDF_DEFAULT_PAGES, doc.pages)}`
    detail.truncated = `pages ${last + 1}-${doc.pages} not read; pass --range ${next} for the next ${PDF_DEFAULT_PAGES}, --page n for one, or --full for every page`
  }
  const readSpan = detail.range ? `, read ${detail.range}` : ''
  return { summary: `${basename(path)}: ${doc.pages} pages${readSpan}`, detail }
}

/** `pdf images`: the pictures drawn on the pages, at their own resolution (spec §4, "pictures only"). */
async function images(path: string, args: Args, ctx: CommandContext): Promise<CommandResult> {
  const out = flagString(args, 'out')
  if (!out) {
    throw new CliError(EXIT.usage, 'missing --out <dir>', undefined, {
      reason: 'missing_argument',
      suggestion: 'name a folder for the pictures',
    })
  }
  const dir = assertAllowed(isAbsolute(out) ? out : resolve(ctx.cwd, out), ctx.env, 'write')
  if (existsSync(dir) && !statSync(dir).isDirectory()) {
    throw new CliError(EXIT.file, `--out is a file, not a folder: ${dir}`, undefined, {
      reason: 'invalid_argument',
    })
  }
  const password = flagString(args, 'password')
  const bytes = readInput(path)
  const facts = await pdfFacts(bytes, password)
  const spec = flagString(args, 'pages')
  const pages = spec === undefined ? undefined : parsePageList(spec, facts.pages)
  mkdirSync(dir, { recursive: true })
  let written
  try {
    written = await writePageImages(
      {
        pdfPath: path,
        ...(password !== undefined ? { password } : {}),
        ...(pages !== undefined ? { pages } : {}),
      },
      dir,
      (done, total) => ctx.log(`picture ${done}/${total}`),
    )
  } catch (err) {
    throw pdfLoadError(err, password)
  }
  return {
    summary: `${basename(path)}: ${written.length} picture(s) written to ${dir}`,
    detail: {
      images: written.map((i) => ({
        page: i.page,
        file: i.file,
        width: i.width,
        height: i.height,
      })),
    },
  }
}

function parseSpan(spec: string, count: number, usage: string): [number, number] {
  const m = /^(\d+)(?:-(\d+))?$/.exec(spec)
  if (!m) throw new CliError(EXIT.usage, usage, undefined, { reason: 'invalid_argument' })
  const start = Number(m[1])
  const end = m[2] === undefined ? start : Number(m[2])
  if (start < 1 || start > end || end > count) {
    throw new CliError(
      EXIT.usage,
      `page span ${spec} out of bounds (1-${count})`,
      { valid_range: [1, count] },
      { reason: 'out_of_range', suggestion: `use pages between 1 and ${count}` },
    )
  }
  return [start, end]
}
