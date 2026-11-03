import { flagBool } from '../args'
import type { CommandDef } from '../registry'
import { docsCatalog } from '../formats/docx'
import { sheetCatalog, sheetGuideText } from '../formats/xlsx-catalog'
import {
  opLines,
  renderGroups,
  withFingerprint,
  type GuideDomain,
  type OpCatalog,
  type OpEntry,
} from '../op-catalog'
import { branded } from '../names'
import { CliError, EXIT, type CommandResult } from '../result'
import { didYouMean } from '../suggest'

const DOMAINS: readonly GuideDomain[] = ['slides', 'docs', 'sheets', 'hwp', 'diagram']

/**
 * Every op reference is generated from the definition the executor validates against (the pptx-ops
 * markdown, the sheets zod schema, the docs op registry and tool schemas), so the guide cannot
 * drift from what `apply` accepts; `--json` returns the same catalog with each op's schema.
 */
export const guideCommand: CommandDef = {
  name: 'guide',
  summary:
    'Print the op reference, design guides and deck templates an agent needs before writing ops or specs.',
  usage:
    'guide <slides|docs|sheets|hwp|diagram> [group|op|design|spec] [--index] [--fingerprint] | guide slides templates [<id>]',
  options: [
    { name: 'index', description: 'one-line signature of every op instead of a group guide' },
    {
      name: 'fingerprint',
      description:
        'only the catalog fingerprint (changes with any op or field); no domain = all three',
    },
  ],
  async run(args) {
    const [domain, topic] = args.positionals
    const json = flagBool(args, 'json')
    if (flagBool(args, 'fingerprint') && (domain === undefined || isDomain(domain))) {
      return fingerprints(domain, json)
    }
    if (!isDomain(domain)) {
      throw new CliError(
        EXIT.usage,
        'guides available for: slides, docs, sheets, hwp, diagram',
        {
          usage:
            'ieumoffice guide slides | ieumoffice guide docs | ieumoffice guide sheets | ieumoffice guide hwp | ieumoffice guide diagram',
        },
        {
          reason: domain === undefined ? 'missing_argument' : 'invalid_argument',
          suggestion: 'run `ieumoffice guide slides|docs|sheets|hwp|diagram`',
        },
      )
    }
    if (domain === 'slides' && (topic === 'design' || topic === 'spec')) {
      const { SLIDES_GUIDES } = await import('@genoffice/pipelines/slides')
      return { summary: SLIDES_GUIDES[topic].content }
    }
    if (domain === 'slides' && topic === 'templates') {
      return templatesGuide(args.positionals[2], json)
    }
    const { catalog, text } = await load(domain, topic, flagBool(args, 'index'))
    if (!topic) return { summary: text(), ...(json ? { detail: { ...catalog } } : {}) }
    const group = catalog.groups.find((g) => g.name === topic)
    if (group) {
      const entries = catalog.ops.filter((e) => e.group === topic)
      return {
        summary: text(topic),
        ...(json
          ? { detail: { domain, fingerprint: catalog.fingerprint, group, ops: entries } }
          : {}),
      }
    }
    const entry = catalog.ops.find((e) => e.op === topic)
    if (!entry) {
      const names = [...catalog.groups.map((g) => g.name), ...catalog.ops.map((e) => e.op)]
      const guess = didYouMean(topic, names)
      throw new CliError(
        EXIT.usage,
        `unknown group or op: ${topic}`,
        { groups: catalog.groups.map((g) => g.name) },
        {
          reason: 'invalid_argument',
          suggestion: guess
            ? `did you mean ${guess}?`
            : `run \`ieumoffice guide ${domain}\` for the groups and ops`,
        },
      )
    }
    return { summary: opText(entry), ...(json ? { detail: { ...entry } } : {}) }
  },
}

function isDomain(value: string | undefined): value is GuideDomain {
  return (DOMAINS as readonly string[]).includes(value ?? '')
}

interface Loaded {
  catalog: OpCatalog
  text: (group?: string) => string
}

/** The catalog `guide <domain> --json` prints; the MCP op schemas are built from the same object. */
export async function loadCatalog(domain: GuideDomain): Promise<OpCatalog> {
  return (await load(domain, undefined, false)).catalog
}

async function load(
  domain: GuideDomain,
  topic: string | undefined,
  index: boolean,
): Promise<Loaded> {
  if (domain === 'sheets') return { catalog: sheetCatalog(), text: sheetGuideText }
  if (domain === 'diagram') {
    const { diagramCatalog } = await import('../formats/diagram')
    const catalog = diagramCatalog()
    return { catalog, text: (group) => diagramGuideText(catalog, group) }
  }
  if (domain === 'hwp') {
    const { hwpCatalog } = await import('../formats/hwp-edit')
    const catalog = await hwpCatalog()
    return { catalog, text: (group) => hwpGuideText(catalog, group) }
  }
  if (domain === 'docs') {
    const { catalog, htmlRules } = await docsCatalog()
    return { catalog, text: (group) => docsGuideText(catalog, htmlRules, group) }
  }
  const docs = await import('@genoffice/pptx-ops/op-docs')
  const catalog = slidesCatalog(docs)
  return {
    catalog,
    text: (group) => {
      if (index) return docs.opSignatureIndex()
      if (group) return docs.opGuide(group)!
      return [
        'Op groups (ieumoffice guide slides <group> prints one; ieumoffice guide slides <op> prints one op):',
        docs.opGuideCatalog(),
        '',
        'Building a new deck: `ieumoffice guide slides design` (the staged workflow: style sheet, outline, one page file at a time, build, QC) and `ieumoffice guide slides spec` (the outline and page spec JSON for `ieumoffice slides check` and `ieumoffice create --type pptx --spec`).',
        '',
        'Every op: { "op": "<name>", "target": { "slide": <index|"s_n">, "el"?: "e_*" }, ...fields }.',
        'Units are EMU (914400 per inch; suffixes in/cm/mm/pt/px accepted); font sizes are pt. `ieumoffice slides read <file>` lists ids and geometry.',
        'Vocabulary:',
        docs.opVocabulary(),
      ].join('\n')
    },
  }
}

type SlidesOpDocs = typeof import('@genoffice/pptx-ops/op-docs')

function slidesCatalog(docs: SlidesOpDocs): OpCatalog {
  const ops: OpEntry[] = Object.entries(docs.OP_DOCS)
    .filter(([, d]) => d.aiCallable !== false && !d.pending)
    .map(([op, d]) => ({ op, group: d.group, signature: d.sig, doc: d.body, examples: d.examples }))
  const groups = docs.OP_GROUPS.map((g) => ({
    name: g,
    summary: docs.OP_GUIDES[g].summary,
    ops: ops.filter((e) => e.group === g).map((e) => e.op),
  }))
  return withFingerprint({ domain: 'slides', groups, ops })
}

function docsGuideText(catalog: OpCatalog, htmlRules: string, group?: string): string {
  const lines = [
    'Word ops (ieumoffice docs apply --ops): a JSON array; every entry has "op".',
    'Targets: { "blockIndexes": [..] } or { "nodeType": "docHeading"|"docParagraph"|"docListItem"|"image", "headingLevel"? }; get indexes from `ieumoffice docs read`.',
    'Field notation: bare = string, n = number, bool = boolean, ? = optional, a|b = one of.',
    '',
    ...renderGroups(catalog, group),
  ]
  if (!group || group === 'content') lines.push('', htmlRules)
  return lines.join('\n')
}

function hwpGuideText(catalog: OpCatalog, group?: string): string {
  return [
    'Hangul ops (ieumoffice hwp apply --ops, ieumoffice create --type hwp|hwpx --ops): a JSON array; every entry is { "op": "<name>", ...fields }. They are the tools the in-app AI uses on the same document, and answer with the same text.',
    'Places are found by their text: anchor / find is exact text inside one paragraph or one table cell. When it occurs more than once the op is refused with the places listed; pass occurrence (1-based, as find_text lists them). Read the document first: `ieumoffice hwp read`, or the read ops below.',
    'Nothing that would drop a table, picture, form field or memo is done: such an op is refused and the document stays as it was. The file is written in the format it was opened in (or the --out extension); an overwritten file is kept as <name>.bak.',
    'Field notation: bare = string, n = number, bool = boolean, ? = optional, a|b = one of.',
    '',
    ...renderGroups(catalog, group),
  ].join('\n')
}

function diagramGuideText(catalog: OpCatalog, group?: string): string {
  return [
    'Diagram ops (ieumoffice diagram apply --ops, ieumoffice create --type drawio --ops): a JSON array; every entry is { "op": "<name>", ...fields }. They are the tools the in-app AI uses on a diagram, checked by the same rules.',
    'Shapes, edges and pages are named by the ids `ieumoffice diagram read` lists (a page also by its name). Ops without "page" work on --page, else the first page. Later ops see what earlier ones made; a new id comes back in detail.results[].created.',
    'A batch is all or nothing by default: one rejected op leaves the file as it was. A batch of reads writes nothing. .drawio/.dio files are edited without the app and keep untouched pages byte for byte; insert_mermaid and .drawio.svg/.drawio.png need the app.',
    'Field notation: bare = string, n = number, bool = boolean, ? = optional, a|b = one of.',
    '',
    ...renderGroups(catalog, group),
  ].join('\n')
}

function opText(entry: OpEntry): string {
  const lines = opLines(entry)
  if (entry.doc) lines.push('', entry.doc)
  else if (entry.schema) lines.push('', JSON.stringify(entry.schema, null, 2))
  return lines.join('\n')
}

/**
 * The built-in deck templates: the list, or one template's style sheet in the shape
 * `deck/style.md` takes, so it can be saved as is. Text carries every field because
 * the MCP guide tool returns text only.
 */
async function templatesGuide(id: string | undefined, json: boolean): Promise<CommandResult> {
  const { listSlideTemplates, findSlideTemplate } =
    await import('@genoffice/pipelines/slides/templates')
  const all = listSlideTemplates()
  const brief = ({ id, name, scheme, description, fonts }: (typeof all)[number]) => ({
    id,
    name,
    scheme,
    description,
    fonts,
  })
  const fontList = (t: (typeof all)[number]) =>
    [t.fonts.title, t.fonts.latinTitle, t.fonts.body].filter((f): f is string => !!f)
  if (id === undefined) {
    const lines = all.map((t) => {
      const fonts = [
        `title ${t.fonts.title}`,
        ...(t.fonts.latinTitle ? [`Latin title ${t.fonts.latinTitle}`] : []),
        `body ${t.fonts.body}`,
      ]
      return `${t.id} — ${t.name} (${t.scheme}): ${t.description} Fonts: ${fonts.join(', ')}.`
    })
    return {
      summary: [
        'Built-in deck templates (`ieumoffice guide slides templates <id>` prints one as a style sheet to save as deck/style.md):',
        ...lines,
      ].join('\n'),
      ...(json ? { detail: { templates: all.map(brief) } } : {}),
    }
  }
  const t = findSlideTemplate(id)
  if (!t) {
    const ids = all.map((x) => x.id)
    const guess = didYouMean(id, ids)
    throw new CliError(
      EXIT.usage,
      `unknown template: ${id}`,
      { templates: ids },
      {
        reason: 'invalid_argument',
        suggestion: guess
          ? `did you mean ${guess}?`
          : 'run `ieumoffice guide slides templates` for the list',
      },
    )
  }
  const shipped = branded(
    `These fonts ship with GenOffice: ${fontList(t).join(', ')}; a deck that names them shows in them in the app and in \`ieumoffice slides render\`.`,
  )
  return {
    summary: `${t.styleSheet}\n\n${shipped}`,
    ...(json ? { detail: { ...brief(t), styleSheet: t.styleSheet } } : {}),
  }
}

async function fingerprints(
  domain: GuideDomain | undefined,
  json: boolean,
): Promise<CommandResult> {
  const domains = domain ? [domain] : DOMAINS
  const out: Record<string, string> = {}
  for (const d of domains) out[d] = (await load(d, undefined, false)).catalog.fingerprint
  return {
    summary: Object.entries(out)
      .map(([d, fp]) => `${d} ${fp}`)
      .join('\n'),
    ...(json ? { detail: { fingerprints: out } } : {}),
  }
}
