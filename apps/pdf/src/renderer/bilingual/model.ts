/**
 * Side-by-side translation view (reading-assist spec 4.5), the parts that are
 * plain functions: which stored translation block each tree block shows, what
 * each page's translation column holds, which pages are drawn, how a block's
 * source boxes land on the screen, and the small view rules (language choice,
 * two-page exclusivity, the narrow-page prompt, unsaved page edits).
 *
 * Blocks are matched to the store with the translation job's own keys: the
 * tree is cut into units by `translationUnits` and keyed by
 * `translationBlockKeys` over the WHOLE tree, exactly like the job and the
 * outputs, so a block translated by the document translation window shows
 * here and a block translated here is never sent again by that window.
 *
 * Nothing in this file sends anything or writes to the store.
 */
import type { Lang } from '@genoffice/i18n'
import {
  blockKeyString,
  translationBlockKeys,
  type TranslationBlockKey,
} from '../../../../../packages/pdf-structure/src/store/keys'
import {
  sentenceEndsPair,
  validSentenceEnds,
} from '../../../../../packages/pdf-structure/src/store/sentence-ends'
import { isTranslationLanguage } from '../../../../../packages/pdf-structure/src/translate/language'
import { translationUnits } from '../../../../../packages/pdf-structure/src/translate/result'
import type { TextUnit } from '../../../../../packages/pdf-structure/src/tree/derive'
import { runsText } from '../../../../../packages/pdf-structure/src/tree/inline'
import type {
  BlockRegion,
  CaptionBlock,
  DocumentTree,
  InlineRun,
  Rect,
  TableBlock,
} from '../../../../../packages/pdf-structure/src/tree/types'
import type { TranslationBlockEntry } from '../../../../../packages/pdf-structure/src/store/store'
import type { PdfStoredTranslation, PdfTranslationRecency } from '../../shared/ipc'
import { geomDispSize, pdfRectToCss, viewToPdf, type PageGeom } from '../annotations'

// ── tunable view constants ──

/** pages drawn before and after the visible ones (the rest of the columns stay empty) */
export const BILINGUAL_RENDER_PAD = 2
/** the page area narrower than this (px) asks once whether to fold the column */
export const BILINGUAL_NARROW_PAGE_PX = 480
/** width of a folded column (px) */
export const BILINGUAL_COLLAPSED_W = 28

// ── the column model ──

/**
 * translated: the stored translation shows (plain text when a person edited it).
 * failed: the job gave up on the block; the source shows.
 * pending: nothing stored yet; the source shows, dimmed.
 */
export type BilingualUnitState = 'translated' | 'failed' | 'pending'

/** one translation unit (a block's text, or one paragraph of a table cell) */
export interface BilingualUnit {
  /** the tree's unit key (block id, or `${tableId}#row.col.k` for a table cell) */
  unitKey: string
  /** the store key of the unit (same as the translation job's) */
  key: TranslationBlockKey
  keyString: string
  /** page the unit starts on */
  page: number
  source: InlineRun[]
  state: BilingualUnitState
  /** what the column shows: the translation, or the source when there is none */
  runs: InlineRun[]
  /** a person's edit (plain text) */
  edited: boolean
  /** failed blocks: why the job gave up */
  reason?: string
  /** the source has marks an edit would drop (bold, italic, links, footnote markers, formulas) */
  sourceHasMarks: boolean
  /**
   * where each sentence ends, source and translation side by side; present
   * only on a translated, unedited unit whose stored pair is valid and whose
   * source list ends at the current tree's text length (spec 6.1). Absent:
   * the unit links as one paragraph.
   */
  sentenceEnds?: BilingualSentenceEnds
}

/** sentence boundaries of a unit: offsets into runsText of the source / shown runs (UTF-16) */
export interface BilingualSentenceEnds {
  source: number[]
  translated: number[]
}

export type BilingualTextRole = 'heading' | 'paragraph' | 'listItem' | 'caption' | 'footnote'

export interface BilingualTextItem {
  kind: 'text'
  /** the tree block id (unique in the tree) */
  id: string
  page: number
  role: BilingualTextRole
  /** heading level */
  level?: number
  /** list marker, or a footnote's marker */
  marker?: string
  unit: BilingualUnit
  /** source boxes; empty for blocks without a measured position (AI-read pages) */
  regions: BlockRegion[]
}

export interface BilingualTableCell {
  row: number
  col: number
  rowSpan: number
  colSpan: number
  header: boolean
  /**
   * a unit per paragraph with letters; other paragraphs (numbers, empty) show
   * as they are. `region`: the paragraph's own box on the page, when the PDF
   * analysis measured it (else the cell's box).
   */
  paragraphs: Array<{ unit: BilingualUnit | null; runs: InlineRun[]; region?: BlockRegion }>
}

export interface BilingualTableItem {
  kind: 'table'
  id: string
  page: number
  rowCount: number
  colCount: number
  cells: BilingualTableCell[]
  regions: BlockRegion[]
}

export type BilingualItem = BilingualTextItem | BilingualTableItem

export interface BilingualCounts {
  /** translation units starting on the page */
  units: number
  translated: number
  failed: number
  /** units with nothing stored: what "translate this page" / "translate the rest (N)" sends */
  pending: number
}

/** a block that started on an earlier page and flows onto this one */
export interface BilingualContinuation {
  id: string
  fromPage: number
}

export interface BilingualPage {
  page: number
  /** blocks starting on this page in reading order (body, then footnotes) */
  items: BilingualItem[]
  /** blocks from earlier pages that continue here (shown once, on their start page) */
  continued: BilingualContinuation[]
  counts: BilingualCounts
}

export interface BilingualModel {
  /** the language of the stored translation the model shows, or null when none */
  lang: string | null
  /** every original page of the tree (1-based), with or without text */
  pages: Map<number, BilingualPage>
  itemsById: Map<string, BilingualItem>
  /** per original page: the source boxes on it, for hover hit tests */
  regionsByPage: Map<number, Array<{ id: string; box: Rect }>>
}

const MARK_KINDS = new Set(['footnoteRef', 'math'])

/** runs carrying formatting a plain-text edit loses */
export function runsHaveMarks(runs: readonly InlineRun[]): boolean {
  return runs.some(
    (r) => MARK_KINDS.has(r.kind) || (r.kind === 'text' && (r.bold || r.italic || r.href)),
  )
}

const plain = (text: string): InlineRun[] => [{ kind: 'text', text }]

function unitOf(
  u: TextUnit,
  key: TranslationBlockKey,
  stored: ReadonlyMap<string, TranslationBlockEntry>,
): BilingualUnit {
  const keyString = blockKeyString(key)
  const entry = stored.get(keyString)
  const base = {
    unitKey: u.key,
    key,
    keyString,
    page: u.page,
    source: u.runs,
    sourceHasMarks: runsHaveMarks(u.runs),
  }
  if (!entry) return { ...base, state: 'pending', runs: u.runs, edited: false }
  // same rule as the outputs (translate/result.ts): an edit is plain text and wins over marks
  if (entry.status === 'translated' && entry.text !== undefined) {
    const edited = entry.edited === true
    const runs = edited ? plain(entry.text) : (entry.runs ?? plain(entry.text))
    const sentenceEnds = edited ? null : sentenceEndsOf(entry, u.runs, runs)
    return {
      ...base,
      state: 'translated',
      runs,
      edited,
      ...(sentenceEnds ? { sentenceEnds } : {}),
    }
  }
  return {
    ...base,
    state: 'failed',
    runs: u.runs,
    edited: false,
    reason: entry.reason ?? 'unknown',
  }
}

/**
 * The stored sentence boundaries when they still fit: the pair is valid
 * against the shown translation and the source list ends at the length of
 * the source text the tree has now. Anything else: null (a paragraph link).
 */
function sentenceEndsOf(
  entry: TranslationBlockEntry,
  source: readonly InlineRun[],
  shown: readonly InlineRun[],
): BilingualSentenceEnds | null {
  if (entry.sourceSentenceEnds === undefined && entry.sentenceEnds === undefined) return null
  const pair = sentenceEndsPair(
    entry.sourceSentenceEnds,
    entry.sentenceEnds,
    runsText(shown).length,
  )
  if (!pair || !validSentenceEnds(pair.sourceSentenceEnds, runsText(source).length)) return null
  return { source: pair.sourceSentenceEnds, translated: pair.sentenceEnds }
}

/**
 * Cut runs into one list per sentence at `ends` (offsets into
 * `runsText(runs)`, the last one its length). A text run crossing a boundary
 * is cut and keeps its marks on both halves; a formula or a line break goes
 * whole with the sentence it starts in; a footnote marker (no text) stays
 * with the sentence before a boundary it touches.
 */
export function splitRunsAtEnds(
  runs: readonly InlineRun[],
  ends: readonly number[],
): InlineRun[][] {
  const out: InlineRun[][] = ends.map(() => [])
  if (out.length === 0) return out
  const last = ends.length - 1
  let s = 0
  let pos = 0
  const advance = () => {
    while (s < last && pos >= ends[s]!) s++
  }
  for (const r of runs) {
    if (r.kind === 'text') {
      let rest = r.text
      while (rest.length > 0) {
        advance()
        const room = s < last ? ends[s]! - pos : rest.length
        const piece = rest.slice(0, room)
        out[s]!.push({ ...r, text: piece })
        pos += piece.length
        rest = rest.slice(piece.length)
      }
    } else if (r.kind === 'lineBreak' || r.kind === 'math') {
      advance()
      out[s]!.push(r)
      pos += r.kind === 'math' ? r.latex.length : 1
    } else {
      out[s]!.push(r)
    }
  }
  return out
}

const emptyCounts = (): BilingualCounts => ({ units: 0, translated: 0, failed: 0, pending: 0 })

/** the stored blocks of a translation, by key string */
export function storedBlockMap(
  stored: PdfStoredTranslation | null,
): Map<string, TranslationBlockEntry> {
  return new Map((stored?.blocks ?? []).map((b) => [blockKeyString(b.key), b]))
}

/**
 * What every page's translation column shows for `tree` with the `stored`
 * translation (null: nothing stored, every block shows its source).
 */
export function buildBilingualModel(
  tree: DocumentTree,
  stored: PdfStoredTranslation | null,
): BilingualModel {
  const units = translationUnits(tree)
  const keys = translationBlockKeys(units)
  const blocks = storedBlockMap(stored)
  const byKey = new Map<string, BilingualUnit>()
  units.forEach((u, i) => byKey.set(u.key, unitOf(u, keys[i]!, blocks)))

  const pages = new Map<number, BilingualPage>()
  const pageOf = (page: number): BilingualPage => {
    let p = pages.get(page)
    if (!p) {
      p = { page, items: [], continued: [], counts: emptyCounts() }
      pages.set(page, p)
    }
    return p
  }
  for (const info of tree.pages) pageOf(info.page)

  const itemsById = new Map<string, BilingualItem>()
  const add = (item: BilingualItem) => {
    pageOf(item.page).items.push(item)
    itemsById.set(item.id, item)
  }
  const textItem = (
    b: { id: string; page: number; regions?: BlockRegion[] },
    role: BilingualTextRole,
    extra: { level?: number; marker?: string } = {},
  ) => {
    const unit = byKey.get(b.id)
    if (!unit) return
    add({ kind: 'text', id: b.id, page: b.page, role, unit, regions: b.regions ?? [], ...extra })
  }
  const caption = (c: CaptionBlock | undefined) => c && textItem(c, 'caption')
  const table = (b: TableBlock) => {
    let any = false
    const cells: BilingualTableCell[] = b.table.cells.map((c) => ({
      row: c.row,
      col: c.col,
      rowSpan: c.rowSpan,
      colSpan: c.colSpan,
      header: c.header === true,
      paragraphs: c.paragraphs.map((runs, k) => {
        const unit = byKey.get(`${b.id}#${c.row}.${c.col}.${k}`) ?? null
        if (unit) any = true
        const own = c.paragraphBoxes?.[k]
        const region = c.region ? (own ? { page: c.region.page, box: own } : c.region) : undefined
        return { unit, runs: unit ? unit.runs : runs, ...(region ? { region } : {}) }
      }),
    }))
    if (!any) return
    add({
      kind: 'table',
      id: b.id,
      page: b.page,
      rowCount: b.table.rowCount,
      colCount: b.table.colCount,
      cells,
      regions: b.regions ?? [],
    })
  }

  for (const b of tree.blocks) {
    switch (b.kind) {
      case 'heading':
        textItem(b, 'heading', { level: b.level })
        break
      case 'paragraph':
        textItem(b, 'paragraph')
        break
      case 'listItem':
        textItem(b, 'listItem', b.marker !== undefined ? { marker: b.marker } : {})
        break
      case 'table':
        if (b.caption?.position === 'above') caption(b.caption)
        table(b)
        if (b.caption && b.caption.position !== 'above') caption(b.caption)
        break
      case 'image':
        caption(b.caption)
        break
      default:
        break
    }
  }
  for (const f of tree.footnotes) {
    for (const p of f.blocks)
      textItem(p, 'footnote', f.marker !== undefined ? { marker: f.marker } : {})
  }

  const regionsByPage = new Map<number, Array<{ id: string; box: Rect }>>()
  for (const item of itemsById.values()) {
    const later = new Set<number>()
    for (const r of item.regions) {
      const list = regionsByPage.get(r.page) ?? []
      list.push({ id: item.id, box: r.box })
      regionsByPage.set(r.page, list)
      if (r.page > item.page) later.add(r.page)
    }
    for (const page of [...later].sort((a, b) => a - b)) {
      pageOf(page).continued.push({ id: item.id, fromPage: item.page })
    }
  }

  for (const unit of byKey.values()) {
    const c = pageOf(unit.page).counts
    c.units++
    c[unit.state]++
  }

  return { lang: stored?.lang ?? null, pages, itemsById, regionsByPage }
}

/** every unit of an item (one for text, one per lettered cell paragraph for a table) */
export function itemUnits(item: BilingualItem): BilingualUnit[] {
  if (item.kind === 'text') return [item.unit]
  return item.cells.flatMap((c) => c.paragraphs.flatMap((p) => (p.unit ? [p.unit] : [])))
}

/** the units of a page with nothing stored, in reading order */
export function pendingUnits(page: BilingualPage | undefined): BilingualUnit[] {
  return (page?.items ?? []).flatMap((item) =>
    itemUnits(item).filter((u) => u.page === page!.page && u.state === 'pending'),
  )
}

// ── language ──

/**
 * The language the view opens in: the stored translation written most
 * recently (by the newest `savedAt` of its blocks), else `fallback` (the
 * default target language). A language with no readable block is skipped.
 */
export function chooseBilingualLanguage(
  recency: readonly PdfTranslationRecency[] | null,
  fallback: Lang,
): string {
  let best: PdfTranslationRecency | null = null
  for (const r of recency ?? []) {
    if (r.savedAt === null || !isTranslationLanguage(r.lang)) continue
    if (!best || r.savedAt > best.savedAt!) best = r
  }
  return best?.lang ?? fallback
}

// ── drawing window ──

/** the rows drawn: the visible ones and `pad` rows on each side */
export function bilingualRenderWindow(
  visible: ReadonlySet<number>,
  rowCount: number,
  pad = BILINGUAL_RENDER_PAD,
): Set<number> {
  const out = new Set<number>()
  for (const v of visible) {
    for (let r = Math.max(0, v - pad); r <= Math.min(rowCount - 1, v + pad); r++) out.add(r)
  }
  return out
}

// ── geometry ──

/**
 * Tree boxes are in the saved page's display space (its /Rotate already
 * applied, origin at the crop box's lower-left, y up). The page on screen
 * may carry an unsaved rotation on top: the geometry of the boxes is the
 * saved display size turned by that extra rotation.
 */
export function regionGeom(geom: PageGeom, savedRot: number): PageGeom {
  const saved = geomDispSize({ pw: geom.pw, ph: geom.ph, rot: savedRot })
  return {
    pw: saved.width,
    ph: saved.height,
    rot: geom.rot - savedRot,
    ...(geom.userUnit !== undefined ? { userUnit: geom.userUnit } : {}),
  }
}

/** a tree box as a scaled CSS box inside the page element */
export function regionCssBox(
  box: Rect,
  geom: PageGeom,
  savedRot: number,
  scale: number,
): { left: number; top: number; width: number; height: number } {
  return pdfRectToCss(regionGeom(geom, savedRot), [box.x0, box.y0, box.x1, box.y1], scale)
}

/** a point in the page element (CSS px from its top-left) in tree box space */
export function pagePointToTree(
  vx: number,
  vy: number,
  geom: PageGeom,
  savedRot: number,
  scale: number,
): [number, number] {
  return viewToPdf(regionGeom(geom, savedRot), vx / scale, vy / scale)
}

/** the block whose box holds the point (the smallest one when boxes nest), or null */
export function hitTestRegions(
  regions: ReadonlyArray<{ id: string; box: Rect }> | undefined,
  x: number,
  y: number,
  tolerance = 1,
): string | null {
  let best: { id: string; area: number } | null = null
  for (const { id, box } of regions ?? []) {
    if (
      x < box.x0 - tolerance ||
      x > box.x1 + tolerance ||
      y < box.y0 - tolerance ||
      y > box.y1 + tolerance
    )
      continue
    const area = (box.x1 - box.x0) * (box.y1 - box.y0)
    if (!best || area < best.area) best = { id, area }
  }
  return best?.id ?? null
}

// ── view rules ──

/**
 * The page a column shows for an on-screen page (0-based index in the open
 * file): its page in the saved file, or null for a page inserted since the
 * last save (its column stays empty).
 */
export function columnPageOf(origIdx: number, savedPageCount: number): number | null {
  return origIdx >= 0 && origIdx < savedPageCount ? origIdx + 1 : null
}

/** pages inserted, deleted or reordered and not saved: the tree is behind the screen */
export function hasUnsavedPageEdits(edits: {
  insertedPages: number
  deletedPages: number
  reordered: boolean
}): boolean {
  return edits.insertedPages > 0 || edits.deletedPages > 0 || edits.reordered
}

export type SpreadMode = 1 | 2

/** turning the view on switches to single pages; the two never show together */
export function toggleBilingual(
  on: boolean,
  spread: SpreadMode,
): { bilingual: boolean; spread: SpreadMode } {
  return { bilingual: on, spread: on ? 1 : spread }
}

/** turning two pages on turns the side-by-side view off */
export function toggleSpread(
  next: SpreadMode,
  bilingual: boolean,
): { bilingual: boolean; spread: SpreadMode } {
  return { bilingual: next === 2 ? false : bilingual, spread: next }
}

/** ask once whether to fold the column when the page area gets too narrow */
export function shouldAskToCollapse(state: {
  pageAreaWidth: number
  asked: boolean
  collapsed: boolean
  threshold?: number
}): boolean {
  if (state.asked || state.collapsed) return false
  return state.pageAreaWidth < (state.threshold ?? BILINGUAL_NARROW_PAGE_PX)
}
