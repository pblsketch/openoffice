import { flagBool } from '../args'
import { BATCH_OPTIONS } from '../batch'
import {
  applyToDiagram,
  diagramOpsOf,
  openDiagramInput,
  readDiagram,
  DIAGRAM_EXTENSIONS,
} from '../formats/diagram'
import { resolveOutput, writeOutput } from '../fs'
import type { CommandDef } from '../registry'
import { CliError, EXIT } from '../result'

/**
 * `diagram read` and `diagram apply`: draw.io diagrams with the ops the
 * in-app AI uses (`@genoffice/drawio-model`). `.drawio`/`.dio` edits run in
 * this process and keep untouched pages byte for byte; writing a
 * `.drawio.svg`/`.drawio.png` or running `insert_mermaid` needs the app
 * (windowless, `--headless-export`).
 */
export const diagramCommand: CommandDef = {
  name: 'diagram',
  summary: `Read or edit a draw.io diagram (${DIAGRAM_EXTENSIONS}) with the ops the in-app AI uses.`,
  usage:
    'diagram read <file> [--page <id|name>] | diagram apply <file> --ops <JSON|@file|-> [--page <id|name>] [--out <path>] [--best-effort|--stop-on-error] [--force]',
  options: [
    {
      name: 'page',
      value: 'id|name',
      description:
        'read: only this page (default: every page). apply: the page ops without "page" work on (default: the first page)',
    },
    {
      name: 'ops',
      value: 'JSON|@file|-',
      description:
        'apply: JSON array of ops, each { "op": "<name>", ...fields } (read, add_shape, add_edge, update, delete, add_page, rename_page, delete_page, insert_mermaid), inline, @<file>, a file path, or "-" for stdin. See `ieumoffice guide diagram`.',
    },
    ...BATCH_OPTIONS,
    {
      name: 'out',
      value: 'path',
      description: 'apply: write here instead of in place (the name picks the format)',
    },
    {
      name: 'force',
      description: 'apply: overwrite an existing --out, or write a file open in GenOffice',
    },
  ],
  async run(args, ctx) {
    const [verb, file] = args.positionals
    if (verb === 'read') {
      for (const flag of ['ops', 'out', 'force', 'best-effort', 'stop-on-error']) {
        if (args.flags[flag] !== undefined) {
          throw new CliError(EXIT.usage, `--${flag} goes with diagram apply`, undefined, {
            reason: 'unknown_option',
          })
        }
      }
      return readDiagram(openDiagramInput(file, ctx), args, flagBool(args, 'json'))
    }
    if (verb === 'apply') {
      const opened = openDiagramInput(file, ctx)
      const out = args.flags.out
      if (out === true) {
        throw new CliError(EXIT.usage, 'missing --out <path>', undefined, {
          reason: 'missing_argument',
        })
      }
      const ops = diagramOpsOf(args, ctx)
      const output = resolveOutput(out, ctx, {
        fallback: opened.path,
        force: flagBool(args, 'force'),
        // in-place edits overwrite by design; --out onto another existing file needs --force
        fresh: out !== undefined,
      })
      return applyToDiagram(opened, ops, output, args, ctx, writeOutput)
    }
    throw new CliError(
      EXIT.usage,
      'expected "diagram read <file>" or "diagram apply <file> --ops <JSON|@file|->"',
      undefined,
      {
        reason: verb === undefined ? 'missing_argument' : 'invalid_argument',
        suggestion: 'run `ieumoffice help diagram`',
      },
    )
  },
}
