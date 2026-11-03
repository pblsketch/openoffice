/**
 * The side-by-side translation view as the editor mounts it (reading-assist
 * spec 4.5): the data (./useBilingualData), the column width and text size,
 * the fold prompt, and the link between a translated paragraph and its
 * source boxes. The editor gets back render pieces to place: the bar above
 * the pages, a column per page row, an outline layer per page, and the width
 * the column takes from the page area.
 *
 * Hover linking: a translated paragraph under the pointer outlines its
 * source boxes (`regions`) on the page, under any unsaved rotation; the
 * pointer over the source text of a block highlights that block's paragraph.
 * Blocks without boxes (AI-read pages) only keep their order.
 *
 * Sentence linking (translation-reading spec 4.4): a unit that keeps valid
 * sentence boundaries reacts per sentence. When a drawn page is first
 * needed, its PDF.js text content is read once and the source sentences on
 * it are located (./sentence-geometry) in tree space, so zoom and unsaved
 * rotation need no new pass; the pointer only hit-tests that result. Pages
 * outside the drawn window are not read and their results are dropped. A
 * sentence found on no drawn page falls back to the block outline and the
 * paragraph highlight.
 *
 * The bar switches between the plain translation and the easy explanation
 * (translation-reading spec 5.3); the choice is remembered like the width
 * and the text size (./view-mode), and only changes what is read.
 *
 * The actions (./BilingualActions) plug into `slots` and call `refresh`
 * after they wrote to the store. Nothing here sends anything or writes to
 * the store.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'
import type { Lang } from '@genoffice/i18n'
import type { TFunc } from '../i18n/locale'
import { geomDispSize, type PageGeom } from '../annotations'
import {
  PAGE_GAP,
  SCROLL_PAD,
  clampBilingualFont,
  clampBilingualW,
  loadBilingualFont,
  loadBilingualW,
  saveBilingualFont,
  saveBilingualW,
} from '../view-config'
import {
  BILINGUAL_COLLAPSED_W,
  bilingualRenderWindow,
  columnPageOf,
  hitTestRegions,
  pagePointToTree,
  regionCssBox,
  shouldAskToCollapse,
  type BilingualCounts,
  type BilingualModel,
} from './model'
import {
  BilingualColumn,
  BilingualFoldedColumn,
  BilingualPageOverlay,
  type BilingualSlots,
} from './BilingualColumn'
import { BilingualBar } from './BilingualBar'
import { loadBilingualMode, saveBilingualMode } from './view-mode'
import { useBilingualData, type BilingualData, type BilingualDataApi } from './useBilingualData'
import {
  hitTestSentenceBoxes,
  locatePageSentences,
  pageChars,
  sentenceBoxesOn,
  sentenceLocated,
  sentenceTargets,
  targetsByPage,
  textItemsOf,
  type PageSentences,
} from './sentence-geometry'

/** where the view reads a page's text items (the open PDF.js document) */
export interface BilingualTextSource {
  getPage(pageNo: number): Promise<{ getTextContent(): Promise<{ items: readonly unknown[] }> }>
}

export interface UseBilingualOptions {
  enabled: boolean
  /** the bar's close button */
  onClose: () => void
  /** the open file as saved */
  filePath: string
  password: string | undefined
  uiLang: Lang
  t: TFunc
  /** bumped after a save that changed the file */
  revision: number
  api: BilingualDataApi | null
  /** the open document's pages, for their text items (sentence linking); null: paragraphs only */
  textSource?: BilingualTextSource | null
  scrollRef: RefObject<HTMLElement | null>
  scale: number
  /** the page's on-screen geometry (saved rotation plus any unsaved one) */
  pageGeom: (origIdx: number) => PageGeom
  /** the page's rotation in the saved file */
  savedRot: (origIdx: number) => number
  /** pages of the saved file (indices past it are inserted, unsaved pages) */
  savedPageCount: number
  rowCount: number
  visibleRows: ReadonlySet<number>
  /** pages inserted, deleted or reordered and not saved */
  unsavedPageEdits: boolean
  /** other columns beside the pages (the comments margin), px */
  reservedWidth: number
  slots?: BilingualSlots
}

export interface BilingualView {
  data: BilingualData
  /** width the column takes beside each page, gap included (0 while off) */
  extraWidth: number
  /** the strip above the pages (null while off) */
  bar: ReactNode
  /** the column after a row's pages (null while off) */
  column: (row: readonly number[], rowIdx: number) => ReactNode
  /** the outline layer inside a page (null when nothing is linked there) */
  overlay: (origIdx: number) => ReactNode
  /** read the stored translation again after a write */
  refresh: () => void
  /** a saved page's counts (null while off or loading) */
  pageCounts: (page: number) => BilingualCounts | null
}

type Hover = {
  id: string
  /** a sentence of a sentence-linked unit (column or page); absent: the whole item */
  unitKey?: string
  sentence?: number
  from: 'column' | 'page'
} | null

/** a sentence the column reports under the pointer */
export interface BilingualSentenceRef {
  unitKey: string
  index: number
}

/** the located sentences of the drawn pages, for one model and one text source */
interface SentenceCache {
  model: BilingualModel | null
  source: BilingualTextSource | null
  /** by on-screen page index; null while its text content is being read */
  pages: Map<number, PageSentences | null>
}

export function useBilingual(o: UseBilingualOptions): BilingualView {
  const [mode, setModeState] = useState(loadBilingualMode)
  const data = useBilingualData({
    enabled: o.enabled,
    filePath: o.filePath,
    password: o.password,
    uiLang: o.uiLang,
    revision: o.revision,
    api: o.api,
    mode,
  })
  const onMode = useCallback((next: typeof mode) => {
    setModeState(next)
    saveBilingualMode(next)
  }, [])
  const [width, setWidth] = useState(loadBilingualW)
  const [fontSize, setFontSize] = useState(loadBilingualFont)
  const [collapsed, setCollapsed] = useState(false)
  const [askCollapse, setAskCollapse] = useState(false)
  /** the fold prompt shows once in the tab's life */
  const askedRef = useRef(false)
  const [hover, setHover] = useState<Hover>(null)
  const hoverRef = useRef<Hover>(null)
  hoverRef.current = hover
  /** bumped when a page's sentences land while something is hovered */
  const [, setSentenceRev] = useState(0)
  const cacheRef = useRef<SentenceCache>({ model: null, source: null, pages: new Map() })
  /** the drawn pages this render asked for (filled while the columns render) */
  const wantedRef = useRef<Set<number>>(new Set())
  wantedRef.current = new Set()

  const { enabled, scrollRef } = o
  const extraWidth = enabled ? (collapsed ? BILINGUAL_COLLAPSED_W : width) + PAGE_GAP : 0

  // off: forget the transient view state (the tree is dropped by the data hook)
  useEffect(() => {
    if (enabled) return
    setHover(null)
    setCollapsed(false)
    setAskCollapse(false)
  }, [enabled])

  // the page area got too narrow: ask once whether to fold the column
  const reservedWidth = o.reservedWidth
  useEffect(() => {
    const el = scrollRef.current
    if (!enabled || !el) return
    const check = () => {
      const pageAreaWidth = el.clientWidth - SCROLL_PAD * 2 - extraWidth - reservedWidth
      if (shouldAskToCollapse({ pageAreaWidth, asked: askedRef.current, collapsed })) {
        askedRef.current = true
        setAskCollapse(true)
      }
    }
    check()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [enabled, scrollRef, extraWidth, reservedWidth, collapsed])

  // the pointer over a page's source text highlights that block's paragraph
  const latest = useRef(o)
  latest.current = o
  const modelRef = useRef(data.model)
  modelRef.current = data.model
  useEffect(() => {
    const el = scrollRef.current
    if (!enabled || !el || !data.model) return
    const clearPage = () => setHover((h) => (h?.from === 'page' ? null : h))
    const onMove = (e: MouseEvent) => {
      const model = modelRef.current
      const target = e.target as Element | null
      if (!model || target?.closest?.('.bl-col')) return
      const pageEl = target?.closest?.<HTMLElement>('.pdf-page[data-page]')
      const cur = latest.current
      const origIdx = pageEl ? Number(pageEl.dataset.page) : NaN
      const page = Number.isFinite(origIdx) ? columnPageOf(origIdx, cur.savedPageCount) : null
      if (!pageEl || page === null) {
        clearPage()
        return
      }
      const box = pageEl.getBoundingClientRect()
      const [x, y] = pagePointToTree(
        e.clientX - box.left,
        e.clientY - box.top,
        cur.pageGeom(origIdx),
        cur.savedRot(origIdx),
        cur.scale,
      )
      const located = cacheRef.current.pages.get(origIdx)
      const sentence = located ? hitTestSentenceBoxes(located.boxes, x, y) : null
      if (sentence) {
        setHover((h) => {
          if (h?.from === 'column') return h
          return h?.unitKey === sentence.unitKey && h.sentence === sentence.sentence
            ? h
            : {
                id: sentence.itemId,
                unitKey: sentence.unitKey,
                sentence: sentence.sentence,
                from: 'page',
              }
        })
        return
      }
      const id = hitTestRegions(model.regionsByPage.get(page), x, y)
      setHover((h) => {
        if (h?.from === 'column') return h
        if (!id) return h ? null : h
        return h?.id === id && h.sentence === undefined ? h : { id, from: 'page' }
      })
    }
    el.addEventListener('mousemove', onMove, { passive: true })
    el.addEventListener('mouseleave', clearPage)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', clearPage)
    }
  }, [enabled, scrollRef, data.model])

  const onColumnHover = useCallback(
    (id: string | null, sentence?: BilingualSentenceRef) =>
      setHover(
        id
          ? sentence
            ? { id, unitKey: sentence.unitKey, sentence: sentence.index, from: 'column' }
            : { id, from: 'column' }
          : null,
      ),
    [],
  )

  // the drawn pages' sentences: read each page's text once, drop pages that left the window
  const model = data.model
  const textSource = o.textSource ?? null
  const targets = useMemo(() => (model ? targetsByPage(sentenceTargets(model)) : null), [model])
  useEffect(() => {
    if (cacheRef.current.model !== model || cacheRef.current.source !== textSource) {
      cacheRef.current = { model, source: textSource, pages: new Map() }
    }
    const current = cacheRef.current
    const wanted = enabled && model && textSource && targets ? wantedRef.current : new Set<number>()
    for (const origIdx of [...current.pages.keys()]) {
      if (!wanted.has(origIdx)) current.pages.delete(origIdx)
    }
    if (!model || !textSource || !targets) return
    for (const origIdx of wanted) {
      if (current.pages.has(origIdx)) continue
      const cur = latest.current
      const page = columnPageOf(origIdx, cur.savedPageCount)
      const onPage = page === null ? undefined : targets.get(page)
      if (page === null || !onPage || onPage.length === 0) continue
      // the boxes are in the saved page's space: no unsaved rotation, no scale
      const geom = { ...cur.pageGeom(origIdx), rot: cur.savedRot(origIdx) }
      current.pages.set(origIdx, null)
      void (async () => {
        let result: PageSentences | null
        try {
          const pdfPage = await textSource.getPage(origIdx + 1)
          const content = await pdfPage.getTextContent()
          result = locatePageSentences(page, pageChars(textItemsOf(content.items), geom), onPage)
        } catch {
          result = null
        }
        // the model, the source or the window moved on while reading: drop the result
        if (cacheRef.current !== current || current.pages.get(origIdx) !== null) return
        if (!result) {
          current.pages.delete(origIdx)
          return
        }
        current.pages.set(origIdx, result)
        if (hoverRef.current) setSentenceRev((v) => v + 1)
      })()
    }
  })

  /** the located sentences of the drawn pages read so far */
  const locatedPages = (): PageSentences[] =>
    [...cacheRef.current.pages.values()].filter((p): p is PageSentences => p !== null)

  // what the hover lights: one located sentence, or the whole item (as before)
  const sentenceHover =
    hover?.unitKey !== undefined &&
    hover.sentence !== undefined &&
    sentenceLocated(locatedPages(), hover.unitKey, hover.sentence)
      ? { unitKey: hover.unitKey, index: hover.sentence }
      : null
  const hoverId = hover && !sentenceHover ? hover.id : null

  // drag the column's left edge: wider to the left
  const onResizeStart = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = width
      let next = startW
      const move = (ev: PointerEvent) => {
        next = clampBilingualW(startW - (ev.clientX - startX))
        setWidth(next)
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        saveBilingualW(next)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [width],
  )

  const onFontSize = useCallback((px: number) => {
    const next = clampBilingualFont(px)
    setFontSize(next)
    saveBilingualFont(next)
  }, [])

  const drawnRows = useMemo(
    () => bilingualRenderWindow(o.visibleRows, o.rowCount),
    [o.visibleRows, o.rowCount],
  )

  const t = o.t
  const bar = enabled ? (
    <>
      <BilingualBar
        load={data.load}
        lang={data.lang}
        mode={data.mode}
        storedLangs={data.storedLangs}
        uiLang={o.uiLang}
        fontSize={fontSize}
        unsavedPageEdits={o.unsavedPageEdits}
        askCollapse={askCollapse}
        t={t}
        onLang={data.setLang}
        onMode={onMode}
        onFontSize={onFontSize}
        onCollapse={() => {
          setCollapsed(true)
          setAskCollapse(false)
        }}
        onDismissCollapse={() => setAskCollapse(false)}
        onClose={o.onClose}
        actions={o.slots?.barActions?.(data)}
      />
      {o.slots?.barPanel?.(data)}
    </>
  ) : null

  const column = (row: readonly number[], rowIdx: number): ReactNode => {
    if (!enabled) return null
    const origIdx = row[0]
    if (origIdx === undefined) return null
    const height = Math.floor(geomDispSize(o.pageGeom(origIdx)).height * o.scale)
    const pageNo = columnPageOf(origIdx, o.savedPageCount)
    if (!collapsed && pageNo !== null && drawnRows.has(rowIdx)) wantedRef.current.add(origIdx)
    if (collapsed) {
      return (
        <BilingualFoldedColumn
          width={BILINGUAL_COLLAPSED_W}
          height={height}
          t={t}
          onExpand={() => setCollapsed(false)}
        />
      )
    }
    const page =
      pageNo === null
        ? null
        : (data.model?.pages.get(pageNo) ?? {
            page: pageNo,
            items: [],
            continued: [],
            counts: { units: 0, translated: 0, failed: 0, pending: 0 },
          })
    return (
      <BilingualColumn
        page={page}
        docHash={data.model ? data.docHash : null}
        lang={data.model ? data.lang : null}
        mode={data.mode}
        width={width}
        height={height}
        fontSize={fontSize}
        drawn={drawnRows.has(rowIdx)}
        hoverId={hoverId}
        hoverUnitKey={sentenceHover?.unitKey ?? null}
        hoverSentence={sentenceHover?.index ?? null}
        t={t}
        slots={o.slots}
        onHover={onColumnHover}
        onResizeStart={onResizeStart}
      />
    )
  }

  const overlay = (origIdx: number): ReactNode => {
    if (!enabled || hover?.from !== 'column' || !data.model) return null
    const item = data.model.itemsById.get(hover.id)
    const page = columnPageOf(origIdx, o.savedPageCount)
    if (!item || page === null) return null
    const geom = o.pageGeom(origIdx)
    const savedRot = o.savedRot(origIdx)
    if (sentenceHover) {
      const lit = sentenceBoxesOn(
        cacheRef.current.pages.get(origIdx),
        sentenceHover.unitKey,
        sentenceHover.index,
      ).map((b) => regionCssBox(b, geom, savedRot, o.scale))
      return lit.length > 0 ? <BilingualPageOverlay boxes={lit} kind="sentence" /> : null
    }
    const boxes = item.regions
      .filter((r) => r.page === page)
      .map((r) => regionCssBox(r.box, geom, savedRot, o.scale))
    return boxes.length > 0 ? <BilingualPageOverlay boxes={boxes} /> : null
  }

  const pageCounts = (page: number): BilingualCounts | null =>
    data.model?.pages.get(page)?.counts ?? null

  return { data, extraWidth, bar, column, overlay, refresh: data.refresh, pageCounts }
}
