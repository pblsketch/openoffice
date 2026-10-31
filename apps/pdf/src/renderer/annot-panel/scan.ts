/**
 * Reading the saved annotations of a whole document for the annotation panel
 * (reading-assist spec 4.3): markups with the text under them, /Text notes,
 * and every other user-visible annotation by its kind. Straight from PDF.js;
 * the page's text content is read only when the page has markups.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { MarkupType } from '../../shared/ipc'
import { parsePdfDate, toSavedNote, type PdfJsAnnotData } from '../note-threads'
import { textUnderQuads, type TextRun } from './text-under'
import type {
  OtherAnnotRecord,
  PageAnnotScan,
  Rgb,
  SavedAnnotScan,
  SavedMarkupRecord,
} from './items'

const MARKUP_SUBTYPES: Record<string, MarkupType> = {
  Highlight: 'highlight',
  Underline: 'underline',
  Squiggly: 'squiggly',
  StrikeOut: 'strikeout',
}

/** not annotations a reader made: links, form fields, the pop-ups of other annotations */
const NOT_LISTED = new Set([
  'Link',
  'Widget',
  'Popup',
  'Text',
  'Highlight',
  'Underline',
  'Squiggly',
  'StrikeOut',
])

type PanelAnnotData = PdfJsAnnotData & {
  subtype?: string
  quadPoints?: ArrayLike<number> | null
}

const rgbOf = (c: PdfJsAnnotData['color']): Rgb | null =>
  c && c.length >= 3 ? [c[0]! / 255, c[1]! / 255, c[2]! / 255] : null

const objNumOf = (id: string): number | null => {
  const m = /^(\d+)R$/.exec(id)
  return m ? Number(m[1]) : null
}

const rectOf = (r: number[]): [number, number, number, number] => [
  Math.min(r[0]!, r[2]!),
  Math.min(r[1]!, r[3]!),
  Math.max(r[0]!, r[2]!),
  Math.max(r[1]!, r[3]!),
]

/** a page's text content, reduced to what the text-under lookup reads */
export async function loadPageTextRuns(doc: PDFDocumentProxy, origIdx: number): Promise<TextRun[]> {
  try {
    const page = await doc.getPage(origIdx + 1)
    const content = await page.getTextContent()
    const runs: TextRun[] = []
    for (const item of content.items) {
      if (!('str' in item)) continue
      runs.push({
        str: item.str,
        transform: [...item.transform],
        width: item.width,
        height: item.height,
        hasEOL: item.hasEOL,
      })
    }
    return runs
  } catch {
    return [] // page text unreadable: markups show without their text
  }
}

/** the saved annotations of one page as the panel lists them */
export async function scanPageAnnots(
  doc: PDFDocumentProxy,
  origIdx: number,
): Promise<PageAnnotScan> {
  let annots: PanelAnnotData[]
  try {
    const page = await doc.getPage(origIdx + 1)
    annots = (await page.getAnnotations()) as PanelAnnotData[]
  } catch {
    return { markups: [], notes: [], others: [] }
  }
  const markupAnnots: { a: PanelAnnotData; type: MarkupType; objNum: number }[] = []
  const notes: PageAnnotScan['notes'] = []
  const others: OtherAnnotRecord[] = []
  for (const a of annots) {
    if (a.hidden || !Array.isArray(a.rect) || a.rect.length !== 4) continue
    const objNum = objNumOf(a.id)
    if (objNum === null) continue
    const subtype = a.subtype ?? ''
    const type = MARKUP_SUBTYPES[subtype]
    if (type) {
      markupAnnots.push({ a, type, objNum })
      continue
    }
    const note = toSavedNote(a, origIdx)
    if (note) {
      notes.push(note)
      continue
    }
    if (NOT_LISTED.has(subtype)) continue
    others.push({
      pageIndex: origIdx,
      objNum,
      subtype,
      rect: rectOf(a.rect),
      color: rgbOf(a.color),
      createdMs: parsePdfDate(a.creationDate) ?? parsePdfDate(a.modificationDate),
    })
  }
  const runs = markupAnnots.length > 0 ? await loadPageTextRuns(doc, origIdx) : []
  const markups = markupAnnots.map(({ a, type, objNum }): SavedMarkupRecord => {
    const rect = rectOf(a.rect)
    const quads: number[][] = []
    const qp = a.quadPoints
    if (qp && qp.length >= 8) {
      for (let q = 0; q + 8 <= qp.length; q += 8)
        quads.push(Array.from({ length: 8 }, (_, k) => qp[q + k]!))
    } else {
      // no QuadPoints (malformed or very old files): the rectangle stands in
      quads.push([rect[0], rect[3], rect[2], rect[3], rect[0], rect[1], rect[2], rect[1]])
    }
    return {
      pageIndex: origIdx,
      objNum,
      type,
      quads,
      rect,
      color: rgbOf(a.color),
      createdMs: parsePdfDate(a.creationDate) ?? parsePdfDate(a.modificationDate),
      text: textUnderQuads(runs, quads),
    }
  })
  return { markups, notes, others }
}

/** every page in turn; stops between pages when the signal aborts */
export async function scanDocumentAnnots(
  doc: PDFDocumentProxy,
  signal?: AbortSignal,
  scanPage: typeof scanPageAnnots = scanPageAnnots,
): Promise<SavedAnnotScan> {
  const out: SavedAnnotScan = { markups: [], notes: [], others: [] }
  for (let i = 0; i < doc.numPages && !signal?.aborted; i++) {
    const page = await scanPage(doc, i)
    out.markups.push(...page.markups)
    out.notes.push(...page.notes)
    out.others.push(...page.others)
  }
  return out
}
