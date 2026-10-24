/**
 * extractDocumentTree: PDF bytes → document tree + page fingerprints.
 *
 * A page range is analyzed as its own in-memory PDF (pdf-lib copy; PDFium
 * import for encrypted sources pdf-lib cannot read), so repeated-header
 * detection only sees the chosen pages. Bookmarks and document info always
 * come from the full source document. The source bytes are never modified.
 */
import { PDFDocument } from 'pdf-lib'
import { PdfLoadError, withPdfDocument } from '../../../pdf2docx/src/extract'
import type { PdfiumModule } from '../../../pdf2docx/src/extract/pdfium'
import type { OcrEngine } from '../../../pdf2docx/src/ocr'
import { extractIrDocument } from '../../../pdf2docx/src/pipeline'
import { buildDocumentTree } from './build'
import { planFigures, type FigurePlan } from './figures'
import {
  pageFingerprint,
  readBookmarks,
  readDocumentInfo,
  subsetWithPdfium,
  type RawBookmark,
  type TreePdfium,
} from './pdfium-doc'
import type { DocumentInfo, DocumentTree } from './types'

/** pixels per point of a drawing's picture, as for page-image fallbacks (pdf2docx) */
const DEFAULT_RENDER_SCALE = 2

export interface ExtractTreeOptions {
  /** initialized @embedpdf/pdfium module (the caller owns wasm setup) */
  pdfium: PdfiumModule
  password?: string
  /** 1-based page numbers to analyze; absent = every page */
  pages?: number[]
  /** local OCR engine for scanned pages (pdf2docx OcrEngine) */
  ocr?: OcrEngine
  /** raster scale for page-image fallbacks (pixels per point), default 2 */
  renderScale?: number
  /** called after each analyzed page */
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

export interface PageFingerprint {
  /** 1-based original page number */
  page: number
  fingerprint: string
}

export interface ExtractTreeResult {
  tree: DocumentTree
  fingerprints: PageFingerprint[]
}

/** the requested page range does not fit the document */
export class PageRangeError extends Error {
  readonly validRange: { first: number; last: number }

  constructor(pageCount: number, detail: string) {
    super(`page range outside the document (valid: 1-${pageCount}): ${detail}`)
    this.name = 'PageRangeError'
    this.validRange = { first: 1, last: pageCount }
  }
}

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason
  if (reason instanceof Error) return reason
  const err = new Error('document tree extraction aborted')
  err.name = 'AbortError'
  return err
}

const checkAbort = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) throw abortError(signal)
}

function normalizeRange(pages: number[], pageCount: number): number[] {
  if (pages.length === 0) throw new PageRangeError(pageCount, 'empty range')
  const bad = pages.filter((p) => !Number.isInteger(p) || p < 1 || p > pageCount)
  if (bad.length > 0) throw new PageRangeError(pageCount, `page ${bad.join(', ')}`)
  return [...new Set(pages)].sort((a, b) => a - b)
}

async function subsetWithPdfLib(pdf: Uint8Array, indices: number[]): Promise<Uint8Array | null> {
  const src = await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false })
  // pdf-lib copies encrypted objects without decrypting them
  if (src.isEncrypted) return null
  const out = await PDFDocument.create({ updateMetadata: false })
  for (const page of await out.copyPages(src, indices)) out.addPage(page)
  return out.save()
}

interface SourceFacts {
  pageCount: number
  bookmarks: RawBookmark[]
  info: DocumentInfo
}

export async function extractDocumentTree(
  pdf: Uint8Array,
  opts: ExtractTreeOptions,
): Promise<ExtractTreeResult> {
  const { signal } = opts
  checkAbort(signal)
  const m = opts.pdfium as TreePdfium

  const facts = withPdfDocument(
    m,
    pdf,
    (doc): SourceFacts => ({
      pageCount: m._FPDF_GetPageCount(doc),
      bookmarks: readBookmarks(m, doc),
      info: readDocumentInfo(m, doc),
    }),
    opts.password,
  )

  // a document exposing no pages is unreadable (pdf2docx P27 rule)
  if (facts.pageCount <= 0) throw new PdfLoadError('corrupt', 0)

  // the analyzed bytes: the source itself, or an in-memory copy of the range
  let analyzed = pdf
  let password = opts.password
  let pageNumbers: number[] | null = null
  if (opts.pages !== undefined) {
    pageNumbers = normalizeRange(opts.pages, facts.pageCount)
    const indices = pageNumbers.map((p) => p - 1)
    // pdf-lib first (spec); PDFium import for what pdf-lib cannot read
    let subset = await subsetWithPdfLib(pdf, indices).catch(() => null)
    subset ??= withPdfDocument(m, pdf, (doc) => subsetWithPdfium(m, doc, indices), opts.password)
    if (!subset) throw new Error('could not copy the selected pages')
    analyzed = subset
    password = undefined
    checkAbort(signal)
  }

  const ir = extractIrDocument(analyzed, {
    pdfium: m,
    ...(password !== undefined ? { password } : {}),
    ...(opts.ocr ? { ocr: opts.ocr } : {}),
    ...(opts.renderScale !== undefined ? { renderScale: opts.renderScale } : {}),
    onProgress: (done, total) => {
      checkAbort(signal)
      opts.onProgress?.(done, total)
      checkAbort(signal)
    },
  })

  // fingerprints, and the drawings the IR has no block for (decision 0057)
  const figures: FigurePlan[][] = []
  const fingerprints = withPdfDocument(
    m,
    analyzed,
    (doc) => {
      const out: string[] = []
      const count = m._FPDF_GetPageCount(doc)
      for (let i = 0; i < count; i++) {
        checkAbort(signal)
        out.push(pageFingerprint(m, doc, i))
        const irPage = ir.irPages[i]
        const page = irPage ? m._FPDF_LoadPage(doc, i) : 0
        if (!page) continue
        try {
          figures[i] = planFigures(m, page, irPage!, opts.renderScale ?? DEFAULT_RENDER_SCALE)
        } finally {
          m._FPDF_ClosePage(page)
        }
      }
      return out
    },
    password,
  )

  const numbers = pageNumbers ?? ir.irPages.map((_, i) => i + 1)
  const tree = buildDocumentTree({
    ir,
    pageNumbers: numbers,
    fingerprints,
    bookmarks: facts.bookmarks,
    info: facts.info,
    sourcePageCount: facts.pageCount,
    figures,
  })
  return {
    tree,
    fingerprints: numbers.map((page, i) => ({ page, fingerprint: fingerprints[i] ?? '' })),
  }
}
