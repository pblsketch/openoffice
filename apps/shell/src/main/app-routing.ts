import type { DocumentTabKind } from '../shared/tabs-api'

// shared by the open route, the open-dialog filter and the rename gate so they cannot drift
const DOCX_RE = /\.docx$/i
// OpenDocument text opens in the Word tab too (apps/docs docFormatOfPath picks the format)
const ODT_RE = /\.odt$/i
const XLSX_RE = /\.(xlsx|xlsm|xls|csv|tsv)$/i
const PPTX_RE = /\.pptx$/i
const PDF_RE = /\.pdf$/i
const HTML_RE = /\.html?$/i
const MINDMAP_RE = /\.xmind$/i
const HWP_RE = /\.hwpx?$/i
// Obsidian names a drawing note `<name>.excalidraw.md`; checked before the plain .md route
const EXCALIDRAW_RE = /\.excalidraw(?:\.md)?$/i

const TEXT_RE = /\.(md|markdown|txt|json)$/i

export {
  DOCX_RE,
  ODT_RE,
  XLSX_RE,
  PPTX_RE,
  PDF_RE,
  HTML_RE,
  MINDMAP_RE,
  HWP_RE,
  EXCALIDRAW_RE,
  TEXT_RE,
}

export function appForPath(path: string): DocumentTabKind | undefined {
  if (DOCX_RE.test(path) || ODT_RE.test(path)) return 'docs'
  if (XLSX_RE.test(path)) return 'sheets'
  if (PPTX_RE.test(path)) return 'slides'
  if (PDF_RE.test(path)) return 'pdf'
  if (EXCALIDRAW_RE.test(path)) return 'excalidraw'
  if (TEXT_RE.test(path)) return 'markdown'
  if (HTML_RE.test(path)) return 'html'
  if (MINDMAP_RE.test(path)) return 'mindmap'
  if (HWP_RE.test(path)) return 'hwp'
  return undefined
}

/** A legal name in an extension no app routes to would turn an openable file into an unopenable one. */
export function renameStaysInApp(from: string, newName: string): boolean {
  const current = appForPath(from)
  if (!current) return true
  // .docx and .odt share the Word tab but not the bytes: renaming one into the
  // other leaves a file the Word editor reads as corrupt
  if (current === 'docs' && ODT_RE.test(from) !== ODT_RE.test(newName)) return false
  return appForPath(newName) === current
}
