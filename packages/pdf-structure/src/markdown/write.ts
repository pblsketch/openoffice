/**
 * Document tree → Markdown (spec §3). Pure: returns the text, the pictures
 * to write under `assets/`, the manifest entries that make them app-owned,
 * and warnings. Takes source, translated and bilingual trees alike: a
 * bilingual tree already lists each translated block after its original.
 */
import { sha256Hex } from '../tree/hash'
import type {
  CaptionBlock,
  DocumentTree,
  FootnoteDef,
  HeadingBlock,
  InlineRun,
  ListItemBlock,
  TableBlock,
} from '../tree/types'
import { renderInline, type InlineHost, type InlineMode } from './inline'
import type { OwnedAssetRecord } from './manifest'
import { escapeLineStart, fenceCodeBlock } from './syntax'

/** folder next to the .md file that holds its pictures (the editor's convention) */
export const ASSETS_DIR = 'assets'

export interface MarkdownAsset {
  /** file name inside `assets/`: `<sha256>.<png|jpg>` */
  name: string
  /** path the Markdown references, relative to the .md file */
  path: string
  sha256: string
  mime: 'image/png' | 'image/jpeg'
  data: Uint8Array
}

/**
 * Conversion notes for the result report. `message` is English for logs and
 * the terminal; screens localize from `kind` and the fields.
 */
export type MarkdownWarning =
  | { kind: 'pageAsImage'; page: number; reason: 'scanned' | 'degraded'; message: string }
  | { kind: 'allPagesAsImages'; message: string }
  | { kind: 'figureWithoutImage'; page: number; message: string }
  | { kind: 'formulaAsCode'; page: number; message: string }
  | { kind: 'footnoteMissing'; page: number; footnoteId: string; message: string }
  | { kind: 'footnoteUnreferenced'; page: number; footnoteId: string; message: string }
  | { kind: 'footnoteLinkFailed'; page: number; message: string }

export type MarkdownWarningKind = MarkdownWarning['kind']

export interface MarkdownConversion {
  markdown: string
  /** distinct pictures, in first-use order */
  assets: MarkdownAsset[]
  /** entries to register in `assets/.genoffice-assets.json` (see mergeAssetManifest) */
  manifestEntries: OwnedAssetRecord[]
  warnings: MarkdownWarning[]
}

interface ListState {
  /** content column, counter and kind of the latest item per nesting level */
  cols: number[]
  counters: number[]
  ordered: boolean[]
}

const LIST_START_RE = /^\(?(\d{1,9})[.)]?\)?$/

const indentLines = (text: string, indent: number): string =>
  text.replace(/\n/g, `\n${' '.repeat(indent)}`)

const escapeLines = (text: string): string => text.split('\n').map(escapeLineStart).join('\n')

class MarkdownWriter {
  private readonly parts: string[] = []
  private readonly assets = new Map<string, MarkdownAsset>()
  private readonly warnings: MarkdownWarning[] = []
  private readonly notes = new Map<string, FootnoteDef>()
  private readonly numbers = new Map<string, number>()
  private readonly order: string[] = []
  private list: ListState | null = null
  /** page of the block being written, for warnings */
  private page = 1

  private readonly host: InlineHost = {
    footnoteNumber: (id) => (this.notes.has(id) ? this.footnoteNumber(id) : undefined),
    onMissingFootnote: (id) =>
      this.warnings.push({
        kind: 'footnoteMissing',
        page: this.page,
        footnoteId: id,
        message: `a footnote marker on page ${this.page} has no note`,
      }),
    onFormulaAsCode: () =>
      this.warnings.push({
        kind: 'formulaAsCode',
        page: this.page,
        message: `a formula on page ${this.page} was written as code`,
      }),
  }

  constructor(private readonly tree: DocumentTree) {
    for (const f of tree.footnotes) if (!this.notes.has(f.id)) this.notes.set(f.id, f)
  }

  run(): MarkdownConversion {
    for (const block of this.tree.blocks) {
      this.page = block.page
      switch (block.kind) {
        case 'pageBreak':
          break
        case 'heading':
          this.heading(block)
          break
        case 'paragraph':
          // a drawing's label: the picture shows it
          if (block.figure) break
          this.push(escapeLines(this.inline(block.runs, 'block')))
          break
        case 'listItem':
          this.listItem(block)
          break
        case 'table':
          this.table(block)
          break
        case 'image':
          if (block.placeholder || block.data.length === 0) {
            this.warnings.push({
              kind: 'figureWithoutImage',
              page: block.page,
              message: `a figure on page ${block.page} has no image data`,
            })
          } else {
            this.push(this.picture(block.data, block.mime))
          }
          this.caption(block.caption)
          this.caption(block.captionTranslation)
          break
        case 'math':
          this.displayFormula(block.latex)
          break
        case 'pageImage':
          this.push(this.picture(block.data, block.mime))
          this.warnings.push({
            kind: 'pageAsImage',
            page: block.page,
            reason: block.reason,
            message: `page ${block.page} was inserted as an image`,
          })
          break
      }
    }
    this.footnotes()
    for (const page of this.tree.footnoteLinkFailedPages) {
      this.warnings.push({
        kind: 'footnoteLinkFailed',
        page,
        message: `footnotes on page ${page} could not be linked to their markers`,
      })
    }
    const pages = this.tree.pages.filter((p) => p.status !== 'toc')
    if (pages.length > 0 && pages.every((p) => p.status === 'scanned' || p.status === 'degraded')) {
      this.warnings.push({
        kind: 'allPagesAsImages',
        message:
          'every page was inserted as an image; reading the pages with AI can recover the text',
      })
    }
    const assets = [...this.assets.values()]
    return {
      markdown: this.parts.length > 0 ? `${this.parts.join('\n\n')}\n` : '',
      assets,
      manifestEntries: assets.map(({ name, sha256 }) => ({ name, sha256 })),
      warnings: this.warnings,
    }
  }

  private inline(runs: InlineRun[], mode: InlineMode, italic = false): string {
    return renderInline(runs, mode, this.host, { italic })
  }

  /** a block that is not a list item ends the current list */
  private push(text: string): void {
    if (text === '') return
    this.list = null
    this.parts.push(text)
  }

  private footnoteNumber(id: string): number {
    let n = this.numbers.get(id)
    if (n === undefined) {
      n = this.order.push(id)
      this.numbers.set(id, n)
    }
    return n
  }

  private heading(block: HeadingBlock): void {
    // a heading set in a bold face is bold by being a heading; `# **Title**`
    // would only add noise, so bold is kept just where it sets part apart
    const texts = block.runs.filter((r) => r.kind === 'text' && r.text.trim() !== '')
    const allBold = texts.length > 0 && texts.every((r) => r.kind === 'text' && r.bold)
    const runs = allBold
      ? block.runs.map((r) => (r.kind === 'text' ? { ...r, bold: undefined } : r))
      : block.runs
    const text = this.inline(runs, 'heading')
    if (text === '') return
    // a trailing ` #` run would be read as the closing sequence
    this.push(`${'#'.repeat(block.level)} ${text.replace(/(^|\s)(#+)$/, '$1\\$2')}`)
  }

  private listItem(block: ListItemBlock): void {
    const text = this.inline(block.runs, 'block')
    if (text === '') return
    let list = this.list
    if (list && list.ordered[0] !== block.ordered && Math.max(0, block.level) === 0) list = null
    if (!list) list = { cols: [], counters: [], ordered: [] }
    // at most one level deeper than the previous item
    const level = Math.min(Math.max(0, Math.floor(block.level)), list.cols.length)
    const continues = level < list.cols.length && list.ordered[level] === block.ordered
    const start = Number(LIST_START_RE.exec(block.marker?.trim() ?? '')?.[1] ?? 1)
    const number = continues ? list.counters[level]! + 1 : start
    const indent = level === 0 ? 0 : list.cols[level - 1]!
    const marker = block.ordered ? `${number}.` : '-'
    for (const key of ['cols', 'counters', 'ordered'] as const) list[key].length = level
    list.cols.push(indent + marker.length + 1)
    list.counters.push(number)
    list.ordered.push(block.ordered)
    const line = `${' '.repeat(indent)}${marker} ${indentLines(escapeLines(text), indent + marker.length + 1)}`
    if (this.list === list) {
      this.parts[this.parts.length - 1] += `\n${line}`
    } else {
      this.push(line)
      this.list = list
    }
  }

  private table(block: TableBlock): void {
    const { rowCount, colCount, cells } = block.table
    if (rowCount > 0 && colCount > 0) {
      const grid = Array.from({ length: rowCount }, () => new Array<string>(colCount).fill(''))
      // merged ranges are un-merged: the content stays in the first cell
      for (const cell of cells) {
        if (cell.row < 0 || cell.row >= rowCount || cell.col < 0 || cell.col >= colCount) continue
        const runs: InlineRun[] = []
        cell.paragraphs.forEach((p, k) => {
          if (k > 0) runs.push({ kind: 'lineBreak' })
          runs.push(...p)
        })
        grid[cell.row]![cell.col] = this.inline(runs, 'table')
      }
      const row = (values: string[]): string => `| ${values.join(' | ')} |`
      this.push(
        [row(grid[0]!), row(grid[0]!.map(() => '---')), ...grid.slice(1).map(row)].join('\n'),
      )
    }
    this.caption(block.caption)
  }

  /** a caption is an italic paragraph right after its picture or table */
  private caption(caption: CaptionBlock | undefined): void {
    if (caption) this.push(escapeLines(this.inline(caption.runs, 'block', true)))
  }

  private picture(data: Uint8Array, mime: 'image/png' | 'image/jpeg'): string {
    const sha256 = sha256Hex(data)
    let asset = this.assets.get(sha256)
    if (!asset) {
      const name = `${sha256}.${mime === 'image/jpeg' ? 'jpg' : 'png'}`
      asset = { name, path: `${ASSETS_DIR}/${name}`, sha256, mime, data }
      this.assets.set(sha256, asset)
    }
    return `![](${asset.path})`
  }

  private displayFormula(source: string): void {
    // a blank line would end the formula in other Markdown programs
    const latex = source
      .split(/\r\n?|\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() !== '')
      .join('\n')
      .trim()
    if (latex === '') return
    if (latex.includes('$')) {
      this.host.onFormulaAsCode(latex)
      this.push(fenceCodeBlock(latex, 'latex'))
      return
    }
    this.push(`$$\n${latex}\n$$`)
  }

  /** definitions at the end, numbered by first reference; unreferenced notes after */
  private footnotes(): void {
    let next = 0
    const drain = (): void => {
      while (next < this.order.length) this.footnoteDefinition(this.order[next++]!)
    }
    drain()
    for (const note of this.notes.values()) {
      if (this.numbers.has(note.id)) continue
      this.warnings.push({
        kind: 'footnoteUnreferenced',
        page: note.page,
        footnoteId: note.id,
        message: `a footnote on page ${note.page} has no marker in the text`,
      })
      this.footnoteNumber(note.id)
      drain()
    }
  }

  private footnoteDefinition(id: string): void {
    const note = this.notes.get(id)!
    this.page = note.page
    const paragraphs = note.blocks
      .map((p) => escapeLines(this.inline(p.runs, 'block')))
      .filter((text) => text !== '')
    // later paragraphs and broken lines continue the note at four spaces
    const body = paragraphs
      .map((p, k) => `${k === 0 ? '' : '    '}${indentLines(p, 4)}`)
      .join('\n\n')
    this.push(`[^${this.numbers.get(id)}]:${body ? ' ' : ''}${body}`)
  }
}

export function treeToMarkdown(tree: DocumentTree): MarkdownConversion {
  return new MarkdownWriter(tree).run()
}
