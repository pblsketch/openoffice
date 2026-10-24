/**
 * Bake annotations into page content for a Save As copy the reader asked to
 * flatten. The copy then shows highlights, notes and drawings in any viewer,
 * including the ones that do not draw PDF annotations at all. The original file
 * is never touched: the renderer sends this only with a Save As target.
 *
 * PDFium's page flatten is deliberately used instead of re-drawing the visible
 * markups: it also handles notes, drawings, stamps and form fields, and it keeps
 * vector content (text stays selectable). The cost is that the copy loses the
 * interactive annotation objects, which is the point of choosing this mode.
 */
import { chainPdfium, loadPdfium, saveDoc, withDocument } from './text-edit'

/** `FPDFPage_Flatten` result codes: 0 failed, 1 flattened, 2 nothing to do */
const FLATTEN_FAILED = 0

export function flattenAnnotsBytes(bytes: Uint8Array): Promise<Uint8Array> {
  return chainPdfium(async () => {
    const m = await loadPdfium()
    return withDocument(m, bytes, async (doc) => {
      const pageCount = m._FPDF_GetPageCount(doc)
      let changed = false
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        const page = m._FPDF_LoadPage(doc, pageIndex)
        if (!page) throw new Error(`could not load page ${pageIndex + 1}`)
        try {
          // A page without annotations has nothing to flatten and must not be
          // rewritten: the untouched pages keep their original content streams.
          if (m._FPDFPage_GetAnnotCount(page) === 0) continue
          if (m._FPDFPage_Flatten(page, 0) === FLATTEN_FAILED) {
            throw new Error(`could not flatten annotations on page ${pageIndex + 1}`)
          }
          changed = true
        } finally {
          m._FPDF_ClosePage(page)
        }
      }
      return changed ? saveDoc(m, doc) : bytes
    })
  })
}
