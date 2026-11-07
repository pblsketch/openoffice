import { extname } from 'node:path'
import type { DocumentTabKind } from '../shared/tabs-api'

// shared by the open route, the open-dialog filter and the rename gate so they cannot drift
const DOCX_RE = /\.docx$/i
// OpenDocument text opens in the Word tab too (apps/docs docFormatOfPath picks the format)
const ODT_RE = /\.odt$/i
const XLSX_RE = /\.(xlsx|xlsm|xls|csv|tsv)$/i
const PPTX_RE = /\.pptx$/i
const PDF_RE = /\.pdf$/i
const HTML_RE = /\.html?$/i
// XMind maps, and a FreeMind / Freeplane map imported as a new map
const MINDMAP_RE = /\.(xmind|mm)$/i
const HWP_RE = /\.hwpx?$/i
const EPUB_RE = /\.epub$/i
// draw.io diagrams, and a Visio drawing imported as a new diagram. A draw.io
// picture is known by its double extension: a plain .svg / .png is no document.
const DIAGRAM_RE = /\.(drawio|dio|vsdx|drawio\.svg|drawio\.png)$/i
const DIAGRAM_PICTURE_RE = /\.drawio\.(svg|png)$/i

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
  EPUB_RE,
  DIAGRAM_RE,
  TEXT_RE,
}

/**
 * A file's extension as the app names its format, lower-case without the dot:
 * `drawio.svg` / `drawio.png` for a draw.io picture, else the last extension
 * (`docx`, as `extname` reads it), or '' for a name without one.
 */
export function documentExtension(name: string): string {
  const picture = DIAGRAM_PICTURE_RE.exec(name)
  if (picture) return `drawio.${picture[1].toLowerCase()}`
  return extname(name).slice(1).toLowerCase()
}

export function appForPath(path: string): DocumentTabKind | undefined {
  if (DOCX_RE.test(path) || ODT_RE.test(path)) return 'docs'
  if (XLSX_RE.test(path)) return 'sheets'
  if (PPTX_RE.test(path)) return 'slides'
  if (PDF_RE.test(path)) return 'pdf'
  if (TEXT_RE.test(path)) return 'markdown'
  if (HTML_RE.test(path)) return 'html'
  if (MINDMAP_RE.test(path)) return 'mindmap'
  if (HWP_RE.test(path)) return 'hwp'
  if (EPUB_RE.test(path)) return 'epub'
  if (DIAGRAM_RE.test(path)) return 'diagram'
  return undefined
}

/** A legal name in an extension no app routes to would turn an openable file into an unopenable one. */
export function renameStaysInApp(from: string, newName: string): boolean {
  const current = appForPath(from)
  if (!current) return true
  // .docx and .odt share the Word tab but not the bytes: renaming one into the
  // other leaves a file the Word editor reads as corrupt
  if (current === 'docs' && ODT_RE.test(from) !== ODT_RE.test(newName)) return false
  // each diagram form keeps its own bytes (XML, a picture holding it, a Visio
  // drawing), and so does each map form (.xmind, an imported .mm): renaming one
  // into another leaves a file that no longer opens
  if (
    (current === 'diagram' || current === 'mindmap') &&
    documentExtension(from) !== documentExtension(newName)
  ) {
    return false
  }
  return appForPath(newName) === current
}
