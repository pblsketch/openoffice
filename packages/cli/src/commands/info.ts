import { statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDocx } from '@genoffice/docx-engine'
import { protectedCellsOf } from '@genoffice/odt-engine'
import { openPptx } from '@genoffice/pptx-engine'
import { flagString } from '../args'
import { csvInfo } from '../formats/csv'
import { hwpInfo } from '../formats/hwp'
import { openOdtBytes } from '../formats/odt'
import { pdfInfo } from '../formats/pdf'
import { convertLegacyWorkbook, workbookSummary } from '../formats/xlsx'
import { extension, readInput, resolveInput, stripBom } from '../fs'
import type { CommandDef } from '../registry'
import { CliError, EXIT } from '../result'

const EMU_PER_INCH = 914400

export const infoCommand: CommandDef = {
  name: 'info',
  summary: 'Print metadata and a structure summary of a document.',
  // docx, pptx, xlsx (and xls/xlsb/ods), pdf, hwp/hwpx, csv, md, html, txt
  usage: 'info <file> [--password <pw>]',
  options: [{ name: 'password', value: 'pw', description: 'password for an encrypted PDF' }],
  async run(args, ctx) {
    const path = resolveInput(args.positionals[0], ctx)
    const ext = extension(path)
    const stat = statSync(path)
    const base = { path, format: ext, size_bytes: stat.size, modified: stat.mtime.toISOString() }
    const detail = await describe(path, ext, flagString(args, 'password'))
    return { summary: `${ext} · ${detail.headline}`, detail: { ...base, ...detail.fields } }
  },
}

async function describeHwp(path: string): Promise<Description> {
  let info
  try {
    info = await hwpInfo(readInput(path))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new CliError(EXIT.file, message, undefined, { reason: 'unsupported' })
  }
  return {
    headline: `${info.chars} characters, ${info.lines} lines`,
    fields: { chars: info.chars, lines: info.lines, read_with: 'hwp read' },
  }
}

interface Description {
  headline: string
  fields: Record<string, unknown>
}

async function describe(path: string, ext: string, password?: string): Promise<Description> {
  switch (ext) {
    case 'docx':
      return describeDocx(readInput(path))
    case 'odt':
      return describeOdt(path)
    case 'pptx':
      return describePptx(path)
    case 'xlsx':
    case 'xlsm':
    case 'xls':
    case 'xlsb':
    case 'ods':
      return describeWorkbook(path)
    case 'pdf':
      return describePdf(path, password)
    case 'hwp':
    case 'hwpx':
      return describeHwp(path)
    case 'csv':
      return describeCsv(path)
    case 'md':
    case 'markdown':
    case 'html':
    case 'htm':
    case 'txt':
      return describeText(path, ext)
    default:
      throw new CliError(EXIT.usage, `unsupported file type: .${ext}`, undefined, {
        reason: 'unsupported',
      })
  }
}

async function describeDocx(bytes: Uint8Array, locked = false): Promise<Description> {
  const parsed = await parseDocx(bytes)
  const blocks = parsed.blocks.filter((b) => !b.hidden)
  const counts: Record<string, number> = {}
  for (const b of blocks) counts[b.type] = (counts[b.type] ?? 0) + 1
  const headings = blocks
    .filter((b) => b.type === 'heading')
    .slice(0, 20)
    .map((b) => ({
      level: b.level ?? 1,
      text: (b.runs ?? []).map((r) => r.text).join(''),
    }))
  return {
    headline: `${blocks.length} blocks, ${counts.heading ?? 0} headings, ${counts.table ?? 0} tables`,
    fields: {
      blocks: blocks.length,
      block_types: counts,
      headings,
      comments: parsed.comments.length,
      footnotes: parsed.footnotes.length,
      endnotes: parsed.endnotes.length,
      protected: locked || parsed.protection !== null,
    },
  }
}

/** An .odt is described through its bridge docx; locked cells count as protection. */
async function describeOdt(path: string): Promise<Description> {
  const { docxBytes, origin } = await openOdtBytes(readInput(path))
  return describeDocx(docxBytes, protectedCellsOf(origin.bridge).length > 0)
}

async function describePptx(path: string): Promise<Description> {
  const { deck } = await openPptx(readInput(path))
  const elements: Record<string, number> = {}
  for (const slide of deck.slides) {
    for (const el of slide.elements) elements[el.type] = (elements[el.type] ?? 0) + 1
  }
  return {
    headline: `${deck.slides.length} slides`,
    fields: {
      slides: deck.slides.length,
      slide_size_in: {
        width: round(deck.size.cx / EMU_PER_INCH),
        height: round(deck.size.cy / EMU_PER_INCH),
      },
      element_types: elements,
    },
  }
}

async function describeWorkbook(path: string): Promise<Description> {
  if (['xls', 'xlsb', 'ods'].includes(extension(path))) {
    const directory = await mkdtemp(join(tmpdir(), 'ieumoffice-workbook-info-'))
    try {
      const converted = join(directory, 'workbook.xlsx')
      await convertLegacyWorkbook(path, converted)
      const wb = await workbookSummary(converted)
      return {
        headline: `${wb.sheets.length} sheets (converted values and formulas)`,
        fields: {
          sheets: wb.sheets,
          note: 'Inspected through a temporary XLSX conversion: row and column extents reflect converted values and formulas. Original active sheet and defined names are not inferred.',
        },
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
  const wb = await workbookSummary(path)
  return {
    headline: `${wb.sheets.length} sheets`,
    fields: { sheets: wb.sheets, active_sheet: wb.activeSheet, defined_names: wb.definedNames },
  }
}

async function describePdf(path: string, password?: string): Promise<Description> {
  const info = await pdfInfo(readInput(path), password)
  return {
    headline: info.pages === null ? 'encrypted (password required)' : `${info.pages} pages`,
    fields: { ...info },
  }
}

function describeCsv(path: string): Description {
  const info = csvInfo(readInput(path))
  return {
    headline: `${info.rows} rows × ${info.columns} columns`,
    fields: { rows: info.rows, columns: info.columns, delimiter: info.delimiter },
  }
}

function describeText(path: string, ext: string): Description {
  // a UTF-8 BOM is a file marker, not text: it is not a character and does not hide a first heading
  const text = stripBom(Buffer.from(readInput(path)).toString('utf-8'))
  const lines = text.split(/\r\n|\r|\n/)
  const fields: Record<string, unknown> = { lines: lines.length, characters: text.length }
  if (ext === 'md' || ext === 'markdown') fields.headings = countHeadings(lines)
  return { headline: `${lines.length} lines`, fields }
}

/** ATX headings outside fenced code (a `# comment` line in a shell or Python block is not a heading). */
function countHeadings(lines: readonly string[]): number {
  let count = 0
  let fence: { char: string; length: number } | undefined
  for (const line of lines) {
    const mark = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      // a closing fence repeats the character at least as many times and carries nothing else
      if (mark && mark[1]![0] === fence.char && mark[1]!.length >= fence.length && !mark[2]!.trim())
        fence = undefined
      continue
    }
    // a backtick fence's info string cannot hold a backtick (that is inline code)
    if (mark && !(mark[1]![0] === '`' && mark[2]!.includes('`'))) {
      fence = { char: mark[1]![0]!, length: mark[1]!.length }
      continue
    }
    if (/^#{1,6}\s/.test(line)) count++
  }
  return count
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
