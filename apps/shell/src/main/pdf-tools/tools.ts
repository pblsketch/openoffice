/**
 * The PDF tools window's work, without Electron: read what a picked PDF is,
 * check a tool's options against it, and run the tool. Every tool goes
 * through the PDF editor's own page functions (apps/pdf/src/main/save-pdf.ts),
 * so a file made here matches the same command in the editor's ribbon. No AI,
 * no network, and the source bytes are only read.
 */
import { PDFDocument } from 'pdf-lib'
import {
  applySaveRequest,
  extractPagesBytes,
  mergePagesBytes,
  mergePdfBytes,
  setPageSizeBytes,
  splitPagesBytes,
  splitPdfBytes,
} from '../../../../pdf/src/main/save-pdf'
import { parsePageRange } from '../../../../pdf/src/renderer/convert/page-range'
import {
  PDF_TOOL_IDS,
  PDF_TOOL_PAPERS,
  type PdfInputProblem,
  type PdfToolId,
  type PdfToolOptions,
  type PdfToolPaper,
} from '../../shared/pdf-tools-api'

/** Bytes one run may read in total, the editor's merge cap */
export const MAX_TOOL_INPUT_BYTES = 1024 * 1024 * 1024

/** The editor's "page size" list (apps/pdf/src/renderer/view-config.ts PAPER_SIZES) */
const PAPER_POINTS: Record<PdfToolPaper, { w: number; h: number }> = {
  A3: { w: 842, h: 1191 },
  A4: { w: 595, h: 842 },
  A5: { w: 420, h: 595 },
  Letter: { w: 612, h: 792 },
  Legal: { w: 612, h: 1008 },
}

export function isPdfToolId(value: unknown): value is PdfToolId {
  return typeof value === 'string' && (PDF_TOOL_IDS as readonly string[]).includes(value)
}

/** Merge takes two or more files; every other tool takes one */
export function toolTakesMany(tool: PdfToolId): boolean {
  return tool === 'merge'
}

export type InspectResult = { ok: true; pages: number } | { ok: false; problem: PdfInputProblem }

/** Page count of a PDF, or why the tools cannot use it */
export async function inspectPdf(bytes: Uint8Array): Promise<InspectResult> {
  try {
    // read past the encryption check only to learn that the file is encrypted:
    // the page functions refuse such a file, so the tools never run on it
    const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true })
    if (doc.isEncrypted) return { ok: false, problem: 'encrypted' }
    const pages = doc.getPageCount()
    return pages > 0 ? { ok: true, pages } : { ok: false, problem: 'unreadable' }
  } catch {
    return { ok: false, problem: 'unreadable' }
  }
}

export type CheckedOptions = { ok: true; options: PdfToolOptions } | { ok: false; error: 'range' }

const intIn = (value: unknown, lo: number, hi: number): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= lo && value <= hi
    ? value
    : undefined

/**
 * Only the options `tool` reads, each checked against the first input's
 * `pageCount`; anything missing or out of range takes the dialog's default,
 * except a page range, which must name pages that exist.
 */
export function checkOptions(tool: PdfToolId, raw: unknown, pageCount: number): CheckedOptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  switch (tool) {
    case 'split':
      return { ok: true, options: { chunkSize: intIn(o.chunkSize, 1, pageCount) ?? 1 } }
    case 'extract': {
      const range = parsePageRange(typeof o.pages === 'string' ? o.pages : '', pageCount)
      return range.ok
        ? { ok: true, options: { pages: range.pages.join(',') } }
        : { ok: false, error: 'range' }
    }
    case 'nup':
      return {
        ok: true,
        options: {
          perSheet: intIn(o.perSheet, 2, 16) ?? 2,
          direction: o.direction === 'vertical' ? 'vertical' : 'horizontal',
          separator: o.separator === true,
        },
      }
    case 'rotate':
      return {
        ok: true,
        options: { rotation: o.rotation === 180 || o.rotation === 270 ? o.rotation : 90 },
      }
    case 'pageSize':
      return {
        ok: true,
        options: {
          paper: (PDF_TOOL_PAPERS as readonly unknown[]).includes(o.paper)
            ? (o.paper as PdfToolPaper)
            : 'A4',
        },
      }
    case 'splitPages':
      return { ok: true, options: { perPage: o.perPage === 4 || o.perPage === 9 ? o.perPage : 2 } }
    default:
      return { ok: true, options: {} }
  }
}

/** Run `tool` on `inputs` (already checked); one file, or one per part for split */
export async function runPdfTool(
  tool: PdfToolId,
  inputs: Uint8Array[],
  options: PdfToolOptions,
): Promise<Uint8Array[]> {
  const [first, ...rest] = inputs
  if (!first) throw new Error('no input')
  switch (tool) {
    case 'merge':
      return [(await mergePdfBytes(first, rest)).merged]
    case 'split':
      return splitPdfBytes(first, options.chunkSize ?? 1)
    case 'extract': {
      const pages = (options.pages ?? '').split(',').map((p) => Number(p) - 1)
      return [await extractPagesBytes(first, pages)]
    }
    case 'reverse': {
      const count = (await PDFDocument.load(first, { updateMetadata: false })).getPageCount()
      return [
        await extractPagesBytes(
          first,
          Array.from({ length: count }, (_, i) => count - 1 - i),
        ),
      ]
    }
    case 'nup':
      return [
        await mergePagesBytes(first, {
          perSheet: options.perSheet ?? 2,
          direction: options.direction ?? 'horizontal',
          separator: options.separator ?? false,
        }),
      ]
    case 'rotate': {
      const count = (await PDFDocument.load(first, { updateMetadata: false })).getPageCount()
      const delta = options.rotation ?? 90
      const applied = await applySaveRequest(first, {
        path: '',
        markups: [],
        drawings: [],
        formValues: [],
        stamps: [],
        rotations: Array.from({ length: count }, (_, pageIndex) => ({ pageIndex, delta })),
      })
      return [applied.bytes]
    }
    case 'pageSize': {
      const paper = PAPER_POINTS[options.paper ?? 'A4']
      return [await setPageSizeBytes(first, paper.w, paper.h)]
    }
    case 'splitPages':
      return [await splitPagesBytes(first, options.perPage ?? 2)]
  }
}

/** File names the save dialog suggests, from the first input's name */
export function outputNames(
  tool: PdfToolId,
  sourceName: string,
  count: number,
  options: PdfToolOptions,
): string[] {
  const base = sourceName.replace(/\.pdf$/i, '') || 'document'
  if (tool === 'split') return Array.from({ length: count }, (_, i) => `${base}-${i + 1}.pdf`)
  const suffix: Record<Exclude<PdfToolId, 'split'>, string> = {
    merge: 'merged',
    extract: 'pages',
    reverse: 'reversed',
    nup: `${options.perSheet ?? 2}up`,
    rotate: 'rotated',
    pageSize: options.paper ?? 'A4',
    splitPages: 'split',
  }
  return [`${base}-${suffix[tool]}.pdf`]
}
