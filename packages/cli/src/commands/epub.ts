/**
 * `epub translate` and `epub status` (spec §9): the book translation job of
 * the EPUB editor from the command line, modelled on `pdf translate` and
 * `pdf status`. Both read the book as it is saved on disk.
 */
import { extension, resolveInput } from '../fs'
import type { CommandContext, CommandDef } from '../registry'
import { CliError, EXIT } from '../result'
import { epubStatus } from './epub-status'
import { epubTranslate } from './epub-translate'

const VERBS = ['translate', 'status'] as const
type Verb = (typeof VERBS)[number]

/** The options each verb takes; the others are refused rather than ignored. */
const VERB_OPTIONS: Record<Verb, readonly string[]> = {
  translate: ['to', 'chapters', 'kind', 'out', 'partial', 'restart', 'yes', 'allow-paid', 'force'],
  status: [],
}

export const epubCommand: CommandDef = {
  name: 'epub',
  summary:
    'Translate an EPUB book with the AI provider configured in GenOffice into a translated or bilingual book, and report what the result store holds for it.',
  usage:
    'epub translate <file.epub> --to <lang> [--chapters <list>] [--kind translated,bilingual] [--out <path>] [--partial] [--restart] [--yes] [--allow-paid] [--force] | epub status <file.epub>',
  options: [
    {
      name: 'to',
      value: 'lang',
      description: 'translate: target language code (en, ko, ja, zh, zh-TW, fr, ...)',
    },
    {
      name: 'chapters',
      value: 'list',
      description: 'translate: chapters like 1-5,8 (default: all)',
    },
    {
      name: 'kind',
      value: 'list',
      description: 'translate: translated,bilingual (default translated)',
    },
    {
      name: 'out',
      value: 'path',
      description:
        'translate: result file, or base path for both kinds (default <name>.<lang>.epub)',
    },
    {
      name: 'partial',
      description: 'translate: write what is done when the job stops early',
    },
    {
      name: 'restart',
      description: 'translate: start over instead of continuing',
    },
    {
      name: 'yes',
      description: 'translate: send; without it only the estimate',
    },
    {
      name: 'allow-paid',
      description: 'translate: allow a route billed per request',
    },
    { name: 'force', description: 'translate: overwrite existing result files' },
  ],
  async run(args, ctx) {
    const [verb, file] = args.positionals
    if (!VERBS.includes(verb as Verb)) {
      throw new CliError(
        EXIT.usage,
        `expected "epub <${VERBS.join('|')}> <file.epub>"`,
        { verbs: [...VERBS] },
        {
          reason: verb === undefined ? 'missing_argument' : 'invalid_argument',
          suggestion: 'run `ieumoffice help epub`',
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
        `epub ${v} does not take ${extra.map((f) => `--${f}`).join(', ')}`,
        { options: VERB_OPTIONS[v].map((o) => `--${o}`) },
        { reason: 'unknown_option', suggestion: 'run `ieumoffice help epub`' },
      )
    }
    const path = epubInput(file, ctx)
    switch (v) {
      case 'translate':
        return epubTranslate(path, args, ctx)
      case 'status':
        return epubStatus(path, args, ctx)
    }
  },
}

function epubInput(file: string | undefined, ctx: CommandContext): string {
  const path = resolveInput(file, ctx)
  if (extension(path) !== 'epub') {
    throw new CliError(
      EXIT.usage,
      `not an EPUB: ${path}`,
      { reason: 'not-epub' },
      {
        reason: 'unsupported',
        suggestion: 'pass a .epub book; `ieumoffice pdf translate` translates PDFs',
      },
    )
  }
  return path
}
