/**
 * Translated-PDF writeback (spec §8): option, report and error
 * types shared by the writeback modules.
 */
import type { PdfiumModule } from '../../../pdf2docx/src/extract/pdfium'
import type { OcrEngine } from '../../../pdf2docx/src/ocr'
import type { DocumentTree } from '../tree/types'

/** smallest font size a block may shrink to, as a share of its original size */
export const MIN_FONT_SCALE = 0.6

/** baseline-to-baseline distance, as a multiple of the font size, when the source gives none */
export const DEFAULT_LINE_HEIGHT = 1.2

/**
 * Font bytes able to draw every char of `text` (a standalone TrueType sfnt:
 * glyf outlines, no collection), or null when this PC has none. `lang` is the
 * target language code; the locator may use it to prefer a regional face.
 */
export type WritebackFontLocator = (text: string, lang: string) => Uint8Array | null

/**
 * A compiled `WebAssembly.Module`. Opaque here: this package compiles
 * without the DOM typings that declare it.
 */
export interface CompiledWasmModule {
  readonly compiledWasmModule?: never
}

/**
 * the harfbuzz subsetter wasm (harfbuzzjs `harfbuzz-subset.wasm` /
 * `hb-subset.wasm`): its bytes, or the module compiled from them
 */
export type HbSubsetWasm = Uint8Array | ArrayBuffer | CompiledWasmModule

export interface WritebackOptions {
  /**
   * initialized @embedpdf/pdfium module (the caller owns wasm setup). The
   * page-editing exports the writeback needs are all in @embedpdf/pdfium 2.15.
   */
  pdfium: PdfiumModule
  /** font subsetter wasm bytes or compiled module; the caller resolves its path */
  hbSubsetWasm: HbSubsetWasm
  /** the original document tree of `pdf` */
  tree: DocumentTree
  /**
   * the translated tree of `tree` (buildTranslatedTree / deriveTranslatedTree):
   * a block with `translationOf` replaces its source; the rest stays as it is
   */
  translated: DocumentTree
  /** 1-based original pages to write; default every page of the tree */
  pages?: number[]
  /**
   * local OCR (Windows OCR) for scanned and AI-read pages: their line boxes
   * are painted over before the translation is drawn. Without it those pages
   * stay as they are.
   */
  ocr?: OcrEngine
  /** default: installed fonts on this PC (defaultWritebackFontLocator) */
  fontLocator?: WritebackFontLocator
  /** default MIN_FONT_SCALE */
  minFontScale?: number
  /**
   * a bilingual PDF (decision 0057): each source page with its translated
   * page beside it on one sheet. Links, annotations and bookmarks are not
   * carried over.
   */
  bilingual?: boolean
  signal?: AbortSignal
  /** called after each written page: pages done, pages total, the page (1-based) */
  onProgress?: (done: number, total: number, page: number) => void
}

/** why a page was kept exactly as it was */
export type OriginalPageReason =
  /** a scanned or AI-read page and no OCR line boxes to paint over */
  | 'ocr-unavailable'
  /** a scanned page with no text at all (nothing was read from it) */
  | 'scanned-no-text'
  /** text the extraction could not read (bad font encoding, …) */
  | 'not-editable'
  /** vertical or rotated text */
  | 'vertical-text'
  /** a printed table of contents (not part of the translated text) */
  | 'toc-page'

export interface OriginalPage {
  /** 1-based original page */
  page: number
  reason: OriginalPageReason
  /** extraction detail (degrade reason), when known */
  detail?: string
}

/** why a block kept its source text in the PDF */
export type WritebackSkipReason =
  /** the stored translation has no result for it */
  | 'not-translated'
  /** no installed font draws the translation */
  | 'font-missing'
  /** the translation needs shaping or right-to-left layout the writer does not do */
  | 'script-unsupported'
  /** the block's page was kept as it was (see originalPages) */
  | 'page-kept'
  /** the source text objects were not found where the block sits */
  | 'text-not-found'
  /** a source text object also carries text outside the block */
  | 'shared-text-object'
  /** the source text sits inside a reusable form object */
  | 'text-in-form'
  /** an AI-read block whose place on the scan could not be found */
  | 'no-position'
  /** its source text is vertical or turned: the writer draws upright lines only */
  | 'vertical-text'

export interface WritebackSkippedBlock {
  /** translation unit key (block id, or `${tableId}#row.col.k` for a table cell) */
  unitKey: string
  /** the tree block it belongs to (the table for a cell) */
  blockId: string
  page: number
  reason: WritebackSkipReason
}

/** a block that kept its source text: no room for the translation even at the floor size */
export interface WritebackOverflow {
  unitKey: string
  blockId: string
  /** page where the block starts */
  page: number
}

export interface WritebackReport {
  /** target language */
  lang: string
  /** translation units on the written pages */
  total: number
  /** units whose translation was written into the PDF */
  translated: number
  /**
   * units that kept their source text because the translation found no room
   * even at the smallest size, grown into free space (decision 0057)
   */
  overflowed: WritebackOverflow[]
  /** pages kept exactly as they were */
  originalPages: OriginalPage[]
  /** units that kept their source text */
  untranslated: WritebackSkippedBlock[]
}

export interface WritebackResult {
  /** the new document; the input bytes are never modified */
  pdf: Uint8Array
  report: WritebackReport
}

/** the source PDF is encrypted: a translated copy cannot be written */
export class WritebackEncryptedError extends Error {
  readonly code = 'encrypted' as const

  constructor() {
    super('the PDF is encrypted; a translated PDF cannot be written into it')
    this.name = 'WritebackEncryptedError'
  }
}
