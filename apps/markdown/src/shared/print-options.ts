/**
 * The one set of print settings the preview, the PDF export and the printer
 * share. A4 with 0.6 in margins is what the PDF export already wrote.
 */
export type MarkdownPaperSize = 'A4' | 'Letter'

export interface MarkdownPrintOptions {
  readonly pageSize: MarkdownPaperSize
  readonly marginIn: number
  readonly landscape: boolean
  readonly printBackground: true
}

export const MARKDOWN_PRINT_OPTIONS: MarkdownPrintOptions = {
  pageSize: 'A4',
  marginIn: 0.6,
  landscape: false,
  printBackground: true,
}

/**
 * What the renderer asked for, kept to the two papers and the margins the
 * preview draws. The renderer cannot choose arbitrary geometry or margins.
 */
export function normalizeMarkdownPrintOptions(value: unknown): MarkdownPrintOptions {
  const asked = value && typeof value === 'object' ? (value as Partial<MarkdownPrintOptions>) : {}
  return {
    pageSize: asked.pageSize === 'Letter' ? 'Letter' : 'A4',
    marginIn: MARKDOWN_PRINT_OPTIONS.marginIn,
    landscape: asked.landscape === true,
    printBackground: true,
  }
}

/** Largest print HTML the preview/print channels accept; far above real documents. */
export const MAX_PRINT_HTML_CHARS = 50_000_000

/** A 1-based, inclusive page range the printer takes. */
export interface MarkdownPageRange {
  readonly from: number
  readonly to: number
}

/**
 * What the dialog's range field means: `3` or `2-5`, within the document.
 * Null means the text is not a range this document has; '' means all pages.
 */
export function parseMarkdownPageRange(text: string, pageCount: number): MarkdownPageRange | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(trimmed)
  if (!match) return null
  const from = Number(match[1])
  const to = match[2] ? Number(match[2]) : from
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > pageCount) {
    return null
  }
  return { from, to }
}

export function printRangeLabel(range: MarkdownPageRange): string {
  return range.from === range.to ? String(range.from) : `${range.from}-${range.to}`
}
