/**
 * Shared document-state types and header/footer helpers used by App.tsx and
 * the extracted action modules (file-actions, review-actions, …).
 */
import type { HeaderFooter, HfPartInfo, ParsedDocFull } from '@genoffice/docx-engine'
import type { BridgeMap, ConversionReport } from '@genoffice/odt-engine'
import type { DocFormat } from '../shared/open-file'

export type { DocFormat }

/**
 * What an ODT document saves against: the ODT as opened and its bridge map.
 * Every save writes the editor's current docx back into `original` through
 * `bridge`, so untouched parts stay byte-identical however many times it is
 * saved, and the same edits always give the same bytes. Saves never replace
 * this baseline (the editor's reference, `DocState.parsed`, follows the saved
 * docx as for a docx document); opening the file again does.
 */
export interface OdtBaseline {
  /** the ODT bytes as opened (a recovered copy counts as opened) */
  original: Uint8Array
  /** the bridge map `odtToDocx` returned for `original` (plain JSON) */
  bridge: BridgeMap
  /** what saving this document as docx changes (Save As confirmation) */
  report: ConversionReport
}

/** first-page / even-page header & footer variants */
export type HfVariantKey = 'headerFirst' | 'footerFirst' | 'headerEven' | 'footerEven'
export type HfVariantsState = Record<HfVariantKey, HeaderFooter | null>
export type HfView = 'default' | 'first' | 'even'

export const EMPTY_HF_VARIANTS: HfVariantsState = {
  headerFirst: null,
  footerFirst: null,
  headerEven: null,
  footerEven: null,
}

export interface DocState {
  parsed: ParsedDocFull
  /** null until a new document is saved for the first time */
  filePath: string | null
  fileName: string
  hash: string
  /** created from the built-in blank template (its numbering ids are known) */
  isBlank?: boolean
  /** desired open password is set for the next save; toggled via Review > Protect */
  encrypted?: boolean
  /** the file format saves write; follows the path's extension (new documents are docx) */
  format: DocFormat
  /** present exactly when `format` is 'odt' */
  odt?: OdtBaseline
  /**
   * An untitled copy (a skill template's, spec 5.7): its first save asks
   * where, and no automatic save writes it before that.
   */
  askPathOnFirstSave?: boolean
  /**
   * A restored recovery copy whose file went missing: its first Save As
   * suggests the original's folder and name.
   */
  saveAsDefaultPath?: string
}

/** an ODT document: saves go through `saveOdt` against `doc.odt` */
export function isOdtDoc(
  doc: DocState | null | undefined,
): doc is DocState & { format: 'odt'; odt: OdtBaseline } {
  return doc?.format === 'odt' && doc.odt !== undefined
}

/** A restored recovery snapshot has not reached the original path yet. */
export function openedFileStartsDirty(result: { recovered?: boolean }): boolean {
  return result.recovered === true
}

/** Pending numbering definitions to append (saved via SaveOptions.numbering) */
export interface PendingNumbering {
  newDefs: Array<{
    numId: string
    kind: 'bullet' | 'ordered'
    levels?: import('@genoffice/docx-engine').CustomNumberingLevel[]
  }>
  restartNums: Array<{
    numId: string
    abstractNumId: string
    startOverrides: Record<number, number>
  }>
  /** one w:lvl of an existing abstractNum rewritten (Adjust List Indents on a parsed list) */
  levelEdits: Array<{
    abstractNumId: string
    ilvl: number
    level: import('@genoffice/docx-engine').CustomNumberingLevel
  }>
  /** picture bullets (w:numPicBullet) referenced by pending levels */
  picBullets: Array<{ id: number; base64: string; mime: 'image/png' | 'image/jpeg' | 'image/gif' }>
}

export const EMPTY_PENDING_NUMBERING: PendingNumbering = {
  newDefs: [],
  restartNums: [],
  levelEdits: [],
  picBullets: [],
}

export function pendingNumberingDirty(p: PendingNumbering): boolean {
  return (
    p.newDefs.length > 0 ||
    p.restartNums.length > 0 ||
    p.levelEdits.length > 0 ||
    p.picBullets.length > 0
  )
}

export function hfFromPart(part: HfPartInfo | null | undefined): HeaderFooter | null {
  // image-only parts (logo headers/footers) are not empty — the canvas path
  // (hfHasVisibleContent) already counts images; keep both checks aligned
  if (
    !part ||
    (!part.text && !part.hasPageNumber && part.paras.length === 0 && !part.images?.length)
  )
    return null
  return {
    text: part.text,
    pageNumber: part.hasPageNumber,
    paras: part.paras.length > 0 ? part.paras : undefined,
  }
}

/**
 * Variant a canvas edge header/footer area shows (it follows its page, as in Word):
 * the header area sits on page 1 (titlePg -> first-page variant, blank when
 * that part is absent — Word semantics), the footer area on the last page.
 */
export function restingHfAreaVariant(
  kind: 'header' | 'footer',
  opts: { titlePg: boolean; evenOddHf: boolean; pageCount: number; lastPageNo?: number },
): HfView {
  if (kind === 'header') return opts.titlePg ? 'first' : 'default'
  if (opts.titlePg && opts.pageCount <= 1) return 'first'
  if (opts.evenOddHf && (opts.lastPageNo ?? opts.pageCount) % 2 === 0) return 'even'
  return 'default'
}

export function hfVariantsFromParsed(parsed: ParsedDocFull): HfVariantsState {
  return {
    headerFirst: hfFromPart(parsed.headerFirst),
    footerFirst: hfFromPart(parsed.footerFirst),
    headerEven: hfFromPart(parsed.headerEven),
    footerEven: hfFromPart(parsed.footerEven),
  }
}
