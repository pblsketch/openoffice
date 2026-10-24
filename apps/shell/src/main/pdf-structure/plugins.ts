/**
 * Functions later work plugs into the structure-job process. While one is
 * null its operation answers 'not-available'; plugging it in is the only
 * change needed (the channels, the process protocol and the handlers are in
 * place).
 */
import type { OcrEngine, PdfiumModule } from '../../../../../packages/pdf2docx/src'
import type { DocumentTree } from '../../../../../packages/pdf-structure/src/tree/types'
import type { PdfStructuredTextPage, PdfTranslatedPdfReport } from '../../../../pdf/src/shared/ipc'
import { treeToStructuredText } from '../../../../../packages/pdf-structure/src/structured-text'
import {
  buildTranslatedTree,
  isTranslationLanguage,
  translationReport,
} from '../../../../../packages/pdf-structure/src/translate'
import {
  writeTranslatedPdf,
  type HbSubsetWasm,
  type WritebackFontLocator,
} from '../../../../../packages/pdf-structure/src/writeback'
import type { StoredTranslation } from '../../../../../packages/pdf-structure/src/store/store'

/**
 * Structured text for the AI read path (spec §2): one entry per analyzed
 * page, in page order. The formatter lives in
 * packages/pdf-structure/src/structured-text.
 */
export type StructuredTextFormatter = (tree: DocumentTree) => PdfStructuredTextPage[]

export const structuredTextFormatter: StructuredTextFormatter | null = treeToStructuredText

export interface TranslatedPdfWriteInput {
  /** initialized PDFium */
  pdfium: PdfiumModule
  /** the source PDF bytes (never written back to the source) */
  pdf: Uint8Array
  password?: string
  /** result-store key of `pdf` */
  docHash: string
  /** the source's tree (the job's pages) with the stored AI readings merged */
  tree: DocumentTree
  /** the request's payload, as the renderer sent it */
  payload: unknown
  /** the stored translation of a document hash into a language; null = no store here */
  translations: ((docHash: string, lang: string) => Promise<StoredTranslation | null>) | null
  /** the font subsetter wasm; null = not shipped here */
  hbSubsetWasm: (() => Promise<HbSubsetWasm>) | null
  /** local OCR for scanned and AI-read pages; absent = those pages stay as they are */
  ocr?: OcrEngine
  /** default: the fonts installed on this PC */
  fontLocator?: WritebackFontLocator
  onProgress: (done: number, total: number) => void
}

export interface TranslatedPdfWriteOutput {
  /** the translated PDF; the job writes it to the picked target */
  pdf: Uint8Array
  /** passed back to the caller untouched */
  report: unknown
}

/** Translated PDF write-back (spec §8). */
export type TranslatedPdfWriter = (
  input: TranslatedPdfWriteInput,
) => Promise<TranslatedPdfWriteOutput>

/** the operation's function is not plugged in yet, or lacks what it needs here */
export class NotAvailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotAvailableError'
  }
}

/** the payload a translated-PDF request carries: the target language */
export function translatedPdfPayloadOf(
  payload: unknown,
): { lang: string; bilingual?: true } | null {
  if (typeof payload !== 'object' || payload === null) return null
  const { lang, bilingual } = payload as { lang?: unknown; bilingual?: unknown }
  if (!isTranslationLanguage(lang)) return null
  return bilingual === true ? { lang, bilingual } : { lang }
}

/**
 * The stored translation of the document written into a copy of it
 * (packages/pdf-structure writeback): finished blocks translated, the rest
 * in the source language. The report carries the writer's report and the
 * stored translation's report of the same tree, so the caller can tell why a
 * block stayed untranslated.
 */
export const translatedPdfWriter: TranslatedPdfWriter | null = async (input) => {
  const payload = translatedPdfPayloadOf(input.payload)
  if (!payload) throw new TypeError('translated PDF: the payload must name a target language')
  if (!input.translations || !input.hbSubsetWasm) {
    throw new NotAvailableError('the translated PDF cannot be written here')
  }
  const { lang, bilingual } = payload
  const stored = await input.translations(input.docHash, lang)
  const translated = buildTranslatedTree(input.tree, lang, stored)
  const result = await writeTranslatedPdf(input.pdf, {
    pdfium: input.pdfium,
    hbSubsetWasm: await input.hbSubsetWasm(),
    tree: input.tree,
    translated,
    ...(input.ocr ? { ocr: input.ocr } : {}),
    ...(input.fontLocator ? { fontLocator: input.fontLocator } : {}),
    // each source page beside its translated page (decision 0057)
    ...(bilingual ? { bilingual } : {}),
    onProgress: (done, total) => input.onProgress(done, total),
  })
  const report: PdfTranslatedPdfReport = {
    writer: result.report,
    translation: translationReport(input.tree, lang, stored),
  }
  return { pdf: result.pdf, report }
}
