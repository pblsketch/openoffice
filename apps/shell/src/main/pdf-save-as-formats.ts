/**
 * PDF Save As: the file types the dialog lists and where a picked name goes.
 * Pure (no Electron, no fs) so the list and the routing are unit-tested; the
 * shell's savePdfAs runs the flow each format names.
 */

/** what a Save As pick writes: a PDF copy, or one of the existing conversions */
export type PdfSaveAsFormat = 'pdf' | 'md' | 'docx' | 'pptx' | 'xlsx' | 'epub' | 'png'

/** shell main-process string keys used as dialog filter names */
export type PdfSaveAsLabelKey =
  'filterPdf' | 'filterWord' | 'filterPpt' | 'filterExcel' | 'filterEpub' | 'filterPdfPageImages'

interface PdfSaveAsEntry {
  format: PdfSaveAsFormat
  extension: string
  /** a string key, or a format name shown as is */
  label: PdfSaveAsLabelKey | { literal: string }
}

/** The dialog's list in order: the PDF itself first, then every conversion */
const PDF_SAVE_AS_ENTRIES: readonly PdfSaveAsEntry[] = [
  { format: 'pdf', extension: 'pdf', label: 'filterPdf' },
  { format: 'md', extension: 'md', label: { literal: 'Markdown' } },
  { format: 'docx', extension: 'docx', label: 'filterWord' },
  { format: 'pptx', extension: 'pptx', label: 'filterPpt' },
  { format: 'xlsx', extension: 'xlsx', label: 'filterExcel' },
  { format: 'epub', extension: 'epub', label: 'filterEpub' },
  // one name typed, one file per page beside it (numberedExportPaths)
  { format: 'png', extension: 'png', label: 'filterPdfPageImages' },
]

export interface PdfSaveAsFilter {
  name: string
  extensions: string[]
}

/** Dialog filters, each name translated by `label` */
export function pdfSaveAsFilters(label: (key: PdfSaveAsLabelKey) => string): PdfSaveAsFilter[] {
  return PDF_SAVE_AS_ENTRIES.map((entry) => ({
    name: typeof entry.label === 'string' ? label(entry.label) : entry.label.literal,
    extensions: [entry.extension],
  }))
}

/** The suggestion carries no extension: the file type chosen in the dialog supplies it */
export function pdfSaveAsDefaultPath(filePath: string): string {
  return filePath.replace(/\.pdf$/i, '')
}

/** extension of the last path segment, lower case, without the dot ('' when none) */
function extensionOf(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const dot = path.lastIndexOf('.')
  return dot > slash + 1 ? path.slice(dot + 1).toLowerCase() : ''
}

/**
 * A dialog that does not add the chosen type's extension (some Linux
 * desktops) leaves a bare name: the default type is PDF.
 */
export function pdfSaveAsPickedPath(filePath: string): string {
  return extensionOf(filePath) ? filePath : `${filePath}.pdf`
}

/**
 * What a picked path writes. A known conversion extension selects that
 * conversion; any other name stays a plain PDF copy (as before the list grew).
 */
export function pdfSaveAsFormatOf(target: string): PdfSaveAsFormat {
  const ext = extensionOf(target)
  return PDF_SAVE_AS_ENTRIES.find((entry) => entry.extension === ext)?.format ?? 'pdf'
}
