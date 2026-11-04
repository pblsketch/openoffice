/**
 * Pages the app prints or turns into a PDF (spec 5): one sheet per diagram
 * page, at the page format the diagram sets, always in light colors. Pure
 * functions; the main module shows the document in a hidden window of the
 * diagram's session and prints it there.
 *
 * Sizes: draw.io measures in units of 1/100 inch (its A4 page is 827 × 1169),
 * so a page of `pageWidth` units is a sheet `pageWidth / 100` inches wide and
 * a drawing keeps its size on paper. A drawing larger than its sheet is
 * scaled down to fit; it is never enlarged.
 */
import { randomBytes } from 'node:crypto'
import type { PrintPage } from '../shared/ipc'

const MAX_UNITS = 100_000

function units(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 && value <= MAX_UNITS ? value : fallback
}

const inches = (value: number): string => `${Math.round(value * 100) / 10000}in`

/** Whether a page sent by a renderer can be printed. */
export function isPrintPage(value: unknown): value is PrintPage {
  if (typeof value !== 'object' || value === null) return false
  const page = value as Record<string, unknown>
  return (
    typeof page.svg === 'string' &&
    /^\s*<svg[\s>]/i.test(page.svg) &&
    ['width', 'height', 'pageWidth', 'pageHeight'].every((key) => typeof page[key] === 'number')
  )
}

/** Drops what never belongs in a printed picture: scripts and event attributes. */
export function inertSvg(svg: string): string {
  return svg
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The document: one sheet per page, each with its own size, white, light
 * colors. `title` names the PDF (and keeps the one-time address out of it).
 */
export function buildPrintHtml(pages: readonly PrintPage[], title = ''): string {
  const rules: string[] = [
    'html, body { margin: 0; padding: 0; background: #ffffff; color-scheme: light; }',
    '.sheet { display: flex; align-items: center; justify-content: center; overflow: hidden;',
    '  box-sizing: border-box; background: #ffffff; break-after: page; }',
    '.sheet:last-child { break-after: auto; }',
    '.sheet > svg { display: block; max-width: 100%; max-height: 100%; }',
  ]
  const sheets: string[] = []
  pages.forEach((page, index) => {
    const name = `p${index + 1}`
    const sheetWidth = units(page.pageWidth, 827)
    const sheetHeight = units(page.pageHeight, 1169)
    const width = units(page.width, sheetWidth)
    const height = units(page.height, sheetHeight)
    rules.push(`@page ${name} { size: ${inches(sheetWidth)} ${inches(sheetHeight)}; margin: 0; }`)
    rules.push(
      `.${name} { page: ${name}; width: ${inches(sheetWidth)}; height: ${inches(sheetHeight)}; }`,
    )
    rules.push(`.${name} > svg { width: ${inches(width)}; height: ${inches(height)}; }`)
    sheets.push(`<div class="sheet ${name}">${inertSvg(page.svg)}</div>`)
  })
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8">',
    `<title>${escapeHtml(title.slice(0, 200))}</title>`,
    `<style>\n${rules.join('\n')}\n</style>`,
    '</head><body>',
    sheets.join('\n'),
    '</body></html>',
  ].join('\n')
}

/**
 * Whether a print that did not happen was the person closing the print
 * dialog. Electron reports that as `cancelled` (older releases: `Print job
 * canceled`); a cancel is not a failure and shows nothing.
 */
export function isPrintCancel(failureReason: unknown): boolean {
  return typeof failureReason === 'string' && /cancel/i.test(failureReason)
}

/** Documents waiting to be shown once, by token. */
const documents = new Map<string, string>()

/** Keeps a document for one load; answers the token its address carries. */
export function holdPrintDocument(html: string): string {
  const token = randomBytes(16).toString('hex')
  documents.set(token, html)
  return token
}

/** The document for a token, once. */
export function takePrintDocument(token: string): string | null {
  const html = documents.get(token) ?? null
  documents.delete(token)
  return html
}

export function dropPrintDocument(token: string): void {
  documents.delete(token)
}
