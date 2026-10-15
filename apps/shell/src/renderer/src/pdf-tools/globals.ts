import type { PdfToolsHomeApi, PdfToolsWindowApi } from '../../../shared/pdf-tools-api'

declare global {
  interface Window {
    /** the PDF tools window's own preload (src/preload/pdf-tools.ts) */
    aiOfficePdfTools: PdfToolsWindowApi
    /** Home's entry into the PDF tools window (src/preload/index.ts) */
    aiOfficePdfToolsHome: PdfToolsHomeApi
  }
}

export {}
