/**
 * Remove annotations in bulk by kind (the PDF tools window, decision 0030).
 * Form fields (widgets) are never touched; links go only when asked for.
 *
 * A removed annotation leaves the file, not just the page: pdf-lib writes
 * every object it loaded, so the annotation's dictionary, its popup and the
 * appearance streams that drew it are deleted too. Otherwise a "removed"
 * comment would still be readable in the saved bytes.
 */
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFStream } from 'pdf-lib'
import type { PDFContext, PDFObject } from 'pdf-lib'

export const ANNOT_KINDS = [
  'comments',
  'highlights',
  'drawings',
  'stamps',
  'links',
  'other',
] as const
export type AnnotKind = (typeof ANNOT_KINDS)[number]

const SUBTYPE_KIND: Record<string, AnnotKind> = {
  Text: 'comments',
  FreeText: 'comments',
  Highlight: 'highlights',
  Underline: 'highlights',
  StrikeOut: 'highlights',
  Squiggly: 'highlights',
  Caret: 'highlights',
  Ink: 'drawings',
  Line: 'drawings',
  Square: 'drawings',
  Circle: 'drawings',
  Polygon: 'drawings',
  PolyLine: 'drawings',
  Stamp: 'stamps',
  Watermark: 'stamps',
  Link: 'links',
}

/** What an annotation subtype counts as; null for the ones this never removes */
export function annotKindOf(subtype: string | undefined): AnnotKind | null {
  if (subtype === 'Widget' || subtype === 'Popup') return null
  return (subtype && SUBTYPE_KIND[subtype]) || 'other'
}

export interface StripAnnotsOptions {
  kinds: readonly AnnotKind[]
  /** 0-based pages to clean; null: every page */
  pages: number[] | null
}

/** The kinds a reader means by “annotations” when saving a copy without them.
    Links (navigation) and form widgets (fillable fields) are not comments and stay. */
export const COMMENT_ANNOT_KINDS = ['comments', 'highlights', 'drawings', 'stamps'] as const

const nameOf = (dict: PDFDict, key: string): string | undefined =>
  dict.lookupMaybe(PDFName.of(key), PDFName)?.decodeText()

/** the refs of an appearance dictionary's streams (/N, /R, /D, each a stream or states) */
function appearanceRefs(context: PDFContext, annot: PDFDict): PDFRef[] {
  const ap = annot.lookupMaybe(PDFName.of('AP'), PDFDict)
  if (!ap) return []
  const refs: PDFRef[] = []
  const collect = (value: PDFObject | undefined) => {
    if (value instanceof PDFRef) {
      const target = context.lookup(value)
      if (target instanceof PDFStream) refs.push(value)
      else if (target instanceof PDFDict) collectDict(target)
    } else if (value instanceof PDFDict) collectDict(value)
  }
  const collectDict = (dict: PDFDict) => {
    for (const [, value] of dict.entries()) if (value instanceof PDFRef) collect(value)
  }
  for (const key of ['N', 'R', 'D']) collect(ap.get(PDFName.of(key)))
  return refs
}

/** `bytes` without the annotations of the given kinds; `removed` counts them (popups aside) */
export async function stripAnnotsBytes(
  bytes: Uint8Array,
  options: StripAnnotsOptions,
): Promise<{ bytes: Uint8Array; removed: number }> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const { context } = doc
  const kinds = new Set(options.kinds)
  const pages = doc.getPages()
  const wanted = new Set(options.pages ?? pages.map((_, i) => i))

  interface Entry {
    page: number
    value: PDFObject
    dict: PDFDict
    ref: PDFRef | null
    subtype: string | undefined
  }
  const entries: Entry[] = []
  pages.forEach((page, index) => {
    const annots = page.node.Annots()
    if (!annots) return
    for (const value of annots.asArray()) {
      const dict = value instanceof PDFRef ? context.lookup(value) : value
      if (!(dict instanceof PDFDict)) continue
      entries.push({
        page: index,
        value,
        dict,
        ref: value instanceof PDFRef ? value : null,
        subtype: nameOf(dict, 'Subtype'),
      })
    }
  })

  const gone = new Set<Entry>()
  for (const entry of entries) {
    const kind = annotKindOf(entry.subtype)
    if (kind && kinds.has(kind) && wanted.has(entry.page)) gone.add(entry)
  }
  const removed = gone.size

  // a reply (/IRT) to a removed annotation, and a popup (/Parent) of one, go with it
  const goneRefs = () => new Set([...gone].map((e) => e.ref?.toString()).filter(Boolean))
  for (let grew = true; grew;) {
    grew = false
    const refs = goneRefs()
    for (const entry of entries) {
      if (gone.has(entry)) continue
      const link = entry.dict.get(PDFName.of(entry.subtype === 'Popup' ? 'Parent' : 'IRT'))
      if (link instanceof PDFRef && refs.has(link.toString())) {
        gone.add(entry)
        grew = true
      }
    }
  }

  // appearance streams still drawn by a kept annotation stay
  const kept = new Set<string>()
  for (const entry of entries) {
    if (!gone.has(entry))
      for (const ref of appearanceRefs(context, entry.dict)) kept.add(ref.toString())
  }
  const doomed: PDFRef[] = []
  for (const entry of gone) {
    if (entry.ref) doomed.push(entry.ref)
    for (const ref of appearanceRefs(context, entry.dict))
      if (!kept.has(ref.toString())) doomed.push(ref)
    // a popup the page does not list still hangs off its parent
    const popup = entry.dict.get(PDFName.of('Popup'))
    if (popup instanceof PDFRef) doomed.push(popup)
  }

  pages.forEach((page, index) => {
    const annots = page.node.Annots()
    if (!annots) return
    const leaving = new Set([...gone].filter((e) => e.page === index).map((e) => e.value))
    if (leaving.size === 0) return
    const stay = annots.asArray().filter((value) => !leaving.has(value))
    if (stay.length === 0) page.node.delete(PDFName.of('Annots'))
    else page.node.set(PDFName.of('Annots'), context.obj(stay) as PDFArray)
  })
  for (const ref of doomed) context.delete(ref)

  return { bytes: await doc.save({ useObjectStreams: false }), removed }
}

/** Remove every comment annotation on every page, leaving links and form fields. */
export async function stripCommentAnnotsBytes(
  bytes: Uint8Array,
): Promise<{ bytes: Uint8Array; removed: number }> {
  return stripAnnotsBytes(bytes, { kinds: COMMENT_ANNOT_KINDS, pages: null })
}
