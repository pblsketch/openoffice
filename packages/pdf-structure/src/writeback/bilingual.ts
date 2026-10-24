/**
 * Bilingual PDF (decision 0057): every source page with its translated page
 * beside it on one sheet, source on the left. Both pages go in whole as
 * form objects, so their text stays selectable; links, annotations and
 * bookmarks are not carried over.
 */
import { withPdfDocument } from '../../../pdf2docx/src/extract'
import { PageFrame, saveDocument, type WritebackPdfium } from './pdfium'

/** the PDFium exports composing a sheet from two pages */
interface SheetPdfium extends WritebackPdfium {
  _FPDF_CreateNewDocument(): number
  _FPDFPage_New(doc: number, index: number, width: number, height: number): number
  _FPDF_NewXObjectFromPage(dest: number, src: number, srcPageIndex: number): number
  _FPDF_NewFormObjectFromXObject(xobject: number): number
  _FPDF_CloseXObject(xobject: number): void
  _FPDFPageObj_Transform(
    obj: number,
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void
}

const SHEET_EXPORTS: (keyof SheetPdfium)[] = [
  '_FPDF_CreateNewDocument',
  '_FPDFPage_New',
  '_FPDF_NewXObjectFromPage',
  '_FPDF_NewFormObjectFromXObject',
  '_FPDF_CloseXObject',
  '_FPDFPageObj_Transform',
]

function asSheetPdfium(m: WritebackPdfium): SheetPdfium {
  const missing = SHEET_EXPORTS.filter((k) => typeof (m as Partial<SheetPdfium>)[k] !== 'function')
  if (missing.length > 0) {
    throw new Error(`the PDFium module lacks page-composing exports: ${missing.join(', ')}`)
  }
  return m as SheetPdfium
}

interface Placed {
  width: number
  height: number
}

/**
 * The page's size as shown (crop box, turned by /Rotate). The form object
 * PDFium makes of a page is already shown that way, clipped to the crop
 * box, with its lower-left corner at the origin.
 */
function shownSize(m: WritebackPdfium, doc: number, index: number): Placed {
  const page = m._FPDF_LoadPage(doc, index)
  if (!page) throw new Error(`could not load page ${index + 1}`)
  try {
    const frame = new PageFrame(m, page)
    return { width: frame.widthPt, height: frame.heightPt }
  } finally {
    m._FPDF_ClosePage(page)
  }
}

/**
 * The bilingual document: sheet i holds page i of `source` and page i of
 * `translated` (the same document with the translation written in).
 */
export function writeBilingualPdf(
  pdfium: WritebackPdfium,
  source: Uint8Array,
  translated: Uint8Array,
): Uint8Array {
  const m = asSheetPdfium(pdfium)
  return withPdfDocument(m, source, (src) =>
    withPdfDocument(m, translated, (tr) => {
      const count = Math.min(m._FPDF_GetPageCount(src), m._FPDF_GetPageCount(tr))
      const out = m._FPDF_CreateNewDocument()
      if (!out) throw new Error('PDFium could not create a document')
      try {
        for (let i = 0; i < count; i++) {
          const left = shownSize(m, src, i)
          const right = shownSize(m, tr, i)
          const height = Math.max(left.height, right.height)
          const sheet = m._FPDFPage_New(out, i, left.width + right.width, height)
          if (!sheet) throw new Error(`could not add sheet ${i + 1}`)
          try {
            // pages of unequal height sit at the top of the sheet
            place(m, out, sheet, src, i, 0, height - left.height)
            place(m, out, sheet, tr, i, left.width, height - right.height)
            if (!m._FPDFPage_GenerateContent(sheet))
              throw new Error(`could not write sheet ${i + 1}`)
          } finally {
            m._FPDF_ClosePage(sheet)
          }
        }
        return saveDocument(m, out)
      } finally {
        m._FPDF_CloseDocument(out)
      }
    }),
  )
}

function place(
  m: SheetPdfium,
  out: number,
  sheet: number,
  doc: number,
  index: number,
  dx: number,
  dy: number,
): void {
  const xobject = m._FPDF_NewXObjectFromPage(out, doc, index)
  if (!xobject) throw new Error(`could not take page ${index + 1}`)
  try {
    const form = m._FPDF_NewFormObjectFromXObject(xobject)
    if (!form) throw new Error(`could not place page ${index + 1}`)
    m._FPDFPageObj_Transform(form, 1, 0, 0, 1, dx, dy)
    m._FPDFPage_InsertObject(sheet, form)
  } finally {
    m._FPDF_CloseXObject(xobject)
  }
}
