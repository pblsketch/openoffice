import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { AgentBridge } from '../ai/agent-bridge'
import { useI18n } from '../i18n/locale'
import type { PrintMode, PrintResult } from '../../shared/ipc'
import { LruPages } from './preview-cache'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEPS,
  clampZoom,
  gridOf,
  nextZoom,
  pageLabel,
  paperSizeLabel,
  stepPage,
  viewFromValue,
  viewValue,
  visibleSlots,
  type PageView,
  type ZoomMode,
} from './preview-model'

/** What one rendered page is: a blob URL, its size and its text margins in CSS pixels. */
interface PageBitmap {
  url: string
  width: number
  height: number
  margins: { left: number; top: number; right: number; bottom: number }
}

/** A4 at 96 dpi, for a page whose size is not known yet. */
const FALLBACK_SIZE = { width: 794, height: 1123 }
/** The space between pages in a grid. */
const PAGE_GAP = 24
/** The cache keeps an 8x8 screen plus a few prefetched neighbours. */
const CACHE_PAGES = 72

/** The view, zoom and margin guide remembered while the app runs, as Hangul remembers them. */
let rememberedView: PageView = 'single'
let rememberedZoom: ZoomMode = 'fit-page'
let rememberedMargins = false

interface Props {
  bridge: Pick<AgentBridge, 'previewPage'>
  /** 0-based page the cursor was on; clamped once the document's count is known. */
  initialPage: number
  /** A File > Print / Ctrl+P that arrived while the preview was open. */
  printSignal: number
  onClose: () => void
  onPrint: (
    mode: PrintMode,
    onProgress: (done: number, total: number) => void,
  ) => Promise<PrintResult>
  /** Ctrl+Enter: close the preview and put the caret on the page's first paragraph */
  onEditPage: (page: number) => Promise<boolean>
}

export function PrintPreview({
  bridge,
  initialPage,
  printSignal,
  onClose,
  onPrint,
  onEditPage,
}: Props): JSX.Element {
  const { t } = useI18n()
  const [page, setPage] = useState(() => Math.max(0, initialPage))
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [view, setView] = useState<PageView>(rememberedView)
  const [zoomMode, setZoomMode] = useState<ZoomMode>(rememberedZoom)
  const [showMargins, setShowMargins] = useState(rememberedMargins)
  const [editError, setEditError] = useState(false)
  const [pane, setPane] = useState({ width: 0, height: 0 })
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState<ReadonlySet<number>>(new Set())
  const [errors, setErrors] = useState<ReadonlySet<number>>(new Set())
  const [stale, setStale] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [printError, setPrintError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const paneRef = useRef<HTMLDivElement | null>(null)
  const cacheRef = useRef(
    new LruPages<PageBitmap>(CACHE_PAGES, (_key, bitmap) => URL.revokeObjectURL(bitmap.url)),
  )
  const loadingRef = useRef(new Set<number>())
  const errorsRef = useRef(new Set<number>())
  const pageCountRef = useRef<number | null>(null)
  const staleRef = useRef(false)
  const mountedRef = useRef(true)
  const printingRef = useRef(false)
  const handledSignal = useRef(printSignal)

  const loadPage = useCallback(
    async (target: number): Promise<void> => {
      if (cacheRef.current.has(target) || loadingRef.current.has(target) || staleRef.current) return
      loadingRef.current.add(target)
      setLoading(new Set(loadingRef.current))
      try {
        const result = await bridge.previewPage(target)
        if (!mountedRef.current) return
        if (pageCountRef.current === null) {
          pageCountRef.current = result.pageCount
          setPageCount(result.pageCount)
        } else if (pageCountRef.current !== result.pageCount) {
          // An edit moved the pages under the preview. Do not mix old and new pages.
          staleRef.current = true
          setStale(true)
          return
        }
        const url = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml' }))
        cacheRef.current.set(target, {
          url,
          width: result.width,
          height: result.height,
          margins: result.margins,
        })
        errorsRef.current.delete(target)
        setErrors(new Set(errorsRef.current))
        setRevision((value) => value + 1)
      } catch {
        if (!mountedRef.current) return
        errorsRef.current.add(target)
        setErrors(new Set(errorsRef.current))
      } finally {
        loadingRef.current.delete(target)
        if (mountedRef.current) setLoading(new Set(loadingRef.current))
      }
    },
    [bridge],
  )

  // the first page (and its count) when the preview opens; the cache dies with the view
  useEffect(() => {
    mountedRef.current = true
    const cache = cacheRef.current
    void loadPage(Math.max(0, initialPage))
    return () => {
      mountedRef.current = false
      cache.clear()
    }
  }, [loadPage, initialPage])

  useEffect(() => {
    if (pageCount === null) return
    const last = pageCount - 1
    setPage((current) => Math.min(Math.max(current, 0), Math.max(last, 0)))
  }, [pageCount])

  const slots = useMemo(
    () => (pageCount === null ? [] : visibleSlots(page, view, pageCount)),
    [page, view, pageCount],
  )

  // Draw what is on screen first, then the screens just before and after it. A big
  // grid (5x5 and above) only prefetches the first pages of its neighbours: drawing
  // another 25-64 pages would queue work nobody asked to see.
  useEffect(() => {
    if (pageCount === null || staleRef.current) return
    const visible = slots.filter((slot): slot is number => slot !== null)
    cacheRef.current.pin(visible)
    for (const target of visible) void loadPage(target)
    const perScreen = gridOf(view).cols * gridOf(view).rows
    const prefetch = perScreen > 16 ? 2 : perScreen
    for (const direction of [1, -1] as const) {
      const nearby = stepPage(page, view, pageCount, direction)
      for (const target of visibleSlots(nearby, view, pageCount).slice(0, prefetch)) {
        if (target !== null) void loadPage(target)
      }
    }
  }, [page, view, pageCount, slots, loadPage])

  useEffect(() => {
    rememberedView = view
  }, [view])
  useEffect(() => {
    rememberedZoom = zoomMode
  }, [zoomMode])
  useEffect(() => {
    rememberedMargins = showMargins
  }, [showMargins])

  // the pane's size decides a fitted zoom
  useEffect(() => {
    const paneEl = paneRef.current
    if (!paneEl) return
    const measure = (): void => {
      setPane({ width: paneEl.clientWidth, height: paneEl.clientHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(paneEl)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  const sizes = slots
    .filter((slot): slot is number => slot !== null)
    .map((slot) => cacheRef.current.get(slot))
    .filter((bitmap): bitmap is PageBitmap => bitmap !== undefined)
  const firstSize = sizes[0] ?? FALLBACK_SIZE
  const maxWidth = Math.max(firstSize.width, ...sizes.map((bitmap) => bitmap.width))
  const maxHeight = Math.max(firstSize.height, ...sizes.map((bitmap) => bitmap.height))
  const { cols, rows } = gridOf(view)
  const contentWidth = cols * maxWidth + (cols - 1) * PAGE_GAP
  const contentHeight = rows * maxHeight + (rows - 1) * PAGE_GAP
  const availableWidth = Math.max(pane.width - 2 * PAGE_GAP, 80)
  const availableHeight = Math.max(pane.height - 2 * PAGE_GAP, 80)
  const fitted =
    pane.width > 0 && pane.height > 0
      ? zoomMode === 'fit-page'
        ? Math.min(availableWidth / contentWidth, availableHeight / contentHeight)
        : zoomMode === 'fit-width'
          ? availableWidth / contentWidth
          : zoomMode / 100
      : 1
  const scale = Math.min(MAX_ZOOM / 100, Math.max(MIN_ZOOM / 100, fitted))
  const percent = clampZoom(Math.round(scale * 100))
  const currentBitmap = cacheRef.current.get(page)
  const statusSize = currentBitmap ?? firstSize
  const zoomText =
    zoomMode === 'fit-page'
      ? t('previewZoomFitPage')
      : zoomMode === 'fit-width'
        ? t('previewZoomFitWidth')
        : `${percent}%`

  // revision is read so a cache fill redraws the page; the value itself is not used
  void revision

  const doPrint = useCallback(
    async (mode: PrintMode): Promise<void> => {
      if (printingRef.current || staleRef.current || pageCountRef.current === null) return
      printingRef.current = true
      setPrinting(true)
      setPrintError(null)
      try {
        const result = await onPrint(mode, (done, total) => setProgress({ done, total }))
        if (!result.ok) setPrintError(result.error)
      } catch (error) {
        setPrintError(error instanceof Error ? error.message : String(error))
      } finally {
        printingRef.current = false
        if (mountedRef.current) {
          setPrinting(false)
          setProgress(null)
        }
      }
    },
    [onPrint],
  )

  useEffect(() => {
    if (printSignal === handledSignal.current) return
    handledSignal.current = printSignal
    void doPrint('print')
  }, [printSignal, doPrint])

  const go = useCallback((next: number): void => {
    if (pageCountRef.current === null) return
    setPage(Math.min(Math.max(next, 0), Math.max(pageCountRef.current - 1, 0)))
  }, [])

  const editCurrent = useCallback(async (): Promise<void> => {
    setEditError(false)
    const edited = await onEditPage(page)
    if (!edited) setEditError(true)
  }, [onEditPage, page])

  useEffect(() => {
    setEditError(false)
  }, [page])

  // Keys belong to the preview while it covers the document, not to the editor iframe.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key === 'F5') {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      if (pageCountRef.current === null) return
      const count = pageCountRef.current
      if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault()
        void editCurrent()
        return
      }
      if (event.key === '.') {
        event.preventDefault()
        setShowMargins((value) => !value)
        return
      }
      if (event.ctrlKey && event.key === 'PageUp') {
        event.preventDefault()
        go(0)
        return
      }
      if (event.ctrlKey && event.key === 'PageDown') {
        event.preventDefault()
        go(count - 1)
        return
      }
      if (event.key === 'PageUp' || event.key === 'ArrowLeft') {
        event.preventDefault()
        go(stepPage(page, view, count, -1))
        return
      }
      if (event.key === 'PageDown' || event.key === 'ArrowRight') {
        event.preventDefault()
        go(stepPage(page, view, count, 1))
        return
      }
      if (event.key === 'Home') {
        event.preventDefault()
        go(0)
        return
      }
      if (event.key === 'End') {
        event.preventDefault()
        go(count - 1)
        return
      }
      if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') {
        event.preventDefault()
        setZoomMode(nextZoom(percent, 1))
        return
      }
      if (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract') {
        event.preventDefault()
        setZoomMode(nextZoom(percent, -1))
        return
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        void doPrint('print')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [doPrint, editCurrent, go, onClose, page, percent, view])

  // Ctrl+wheel zooms without moving the page under the pointer. A native listener is
  // needed: React's wheel listener is passive, where preventDefault does nothing.
  useEffect(() => {
    const paneEl = paneRef.current
    if (!paneEl) return
    const onWheel = (event: globalThis.WheelEvent): void => {
      if (!event.ctrlKey) return
      event.preventDefault()
      setZoomMode(nextZoom(percent, event.deltaY < 0 ? 1 : -1))
    }
    paneEl.addEventListener('wheel', onWheel, { passive: false })
    return () => paneEl.removeEventListener('wheel', onWheel)
  }, [percent])

  const canPrint = pageCount !== null && !printing && !stale
  const initialError = errors.has(Math.max(0, initialPage)) && pageCount === null

  return (
    <div
      ref={rootRef}
      className="hwp-preview"
      role="dialog"
      aria-modal="true"
      aria-label={t('filePreview')}
      tabIndex={-1}
    >
      <div className="hwp-preview-bar">
        <button
          type="button"
          className="hwp-preview-button primary"
          disabled={!canPrint}
          onClick={() => void doPrint('print')}
        >
          {t('filePrint')}
        </button>
        <button
          type="button"
          className="hwp-preview-button"
          disabled={!canPrint}
          onClick={() => void doPrint('pdf')}
        >
          {t('fileExportPdf')}
        </button>
        <span className="hwp-preview-separator" />
        <button
          type="button"
          className="hwp-preview-button icon"
          aria-label={t('previewPrevPage')}
          title={t('previewPrevPage')}
          disabled={page <= 0}
          onClick={() => go(stepPage(page, view, pageCount ?? 0, -1))}
        >
          ‹
        </button>
        <input
          className="hwp-preview-page-input"
          type="number"
          min={1}
          max={pageCount ?? 1}
          value={pageCount === null ? 1 : page + 1}
          disabled={pageCount === null}
          aria-label={
            pageCount === null
              ? t('previewRendering')
              : t('previewPageOf', { page: page + 1, total: pageCount })
          }
          onChange={(event) => go((Number(event.target.value) || 1) - 1)}
        />
        <span className="hwp-preview-page-count">
          {pageCount === null ? '…' : t('previewPageOf', { page: page + 1, total: pageCount })}
        </span>
        <button
          type="button"
          className="hwp-preview-button icon"
          aria-label={t('previewNextPage')}
          title={t('previewNextPage')}
          disabled={pageCount === null || page >= pageCount - 1}
          onClick={() => go(stepPage(page, view, pageCount ?? 0, 1))}
        >
          ›
        </button>
        <span className="hwp-preview-spacer" />
        <label className="hwp-preview-field">
          <span>{t('previewZoom')}</span>
          <select
            value={
              zoomMode === 'fit-page' || zoomMode === 'fit-width' ? zoomMode : String(zoomMode)
            }
            onChange={(event) => {
              const value = event.target.value
              setZoomMode(
                value === 'fit-page' || value === 'fit-width' ? value : Number(value) || 100,
              )
            }}
          >
            <option value="fit-page">{t('previewZoomFitPage')}</option>
            <option value="fit-width">{t('previewZoomFitWidth')}</option>
            {ZOOM_STEPS.map((step) => (
              <option key={step} value={step}>
                {step}%
              </option>
            ))}
          </select>
        </label>
        <label className="hwp-preview-field">
          <span>{t('previewView')}</span>
          <select
            value={viewValue(view)}
            onChange={(event) => setView(viewFromValue(event.target.value))}
          >
            <option value="single">{t('previewViewSingle')}</option>
            <option value="facing">{t('previewViewFacing')}</option>
            <option value="2x2">{t('previewViewMulti')} 2×2</option>
            <option value="3x3">{t('previewViewMulti')} 3×3</option>
            <option value="4x4">{t('previewViewMulti')} 4×4</option>
            <option value="5x5">{t('previewViewMulti')} 5×5</option>
            <option value="6x6">{t('previewViewMulti')} 6×6</option>
            <option value="8x8">{t('previewViewMulti')} 8×8</option>
          </select>
        </label>
        <button
          type="button"
          className={`hwp-preview-button${showMargins ? ' active' : ''}`}
          aria-pressed={showMargins}
          onClick={() => setShowMargins((value) => !value)}
        >
          {t('previewMargins')}
        </button>
        <button type="button" className="hwp-preview-button" onClick={() => void editCurrent()}>
          {t('previewEditPage')}
        </button>
        <button type="button" className="hwp-preview-button" onClick={onClose}>
          {t('dismiss')}
        </button>
      </div>

      <div className="hwp-preview-viewport" ref={paneRef}>
        {pageCount === null ? (
          initialError ? (
            <div className="hwp-preview-empty" role="alert">
              <span>{t('previewFailed')}</span>
              <button
                type="button"
                className="hwp-preview-button"
                onClick={() => {
                  errorsRef.current.delete(Math.max(0, initialPage))
                  setErrors(new Set(errorsRef.current))
                  void loadPage(Math.max(0, initialPage))
                }}
              >
                {t('aiRetry')}
              </button>
            </div>
          ) : (
            <div className="hwp-preview-empty">{t('previewRendering')}</div>
          )
        ) : (
          <div
            className="hwp-preview-grid"
            style={{ gridTemplateColumns: `repeat(${cols}, max-content)` }}
          >
            {slots.map((slot, index) => {
              if (slot === null) {
                return (
                  <div
                    key={`blank-${index}`}
                    className="hwp-preview-sheet blank"
                    style={{
                      width: firstSize.width * scale,
                      height: firstSize.height * scale,
                    }}
                  />
                )
              }
              const bitmap = cacheRef.current.get(slot)
              const size = bitmap ?? firstSize
              const failed = errors.has(slot)
              return (
                <div
                  key={slot}
                  className="hwp-preview-sheet"
                  style={{ width: size.width * scale, height: size.height * scale }}
                >
                  {bitmap ? (
                    <img
                      src={bitmap.url}
                      alt={t('previewPageOf', { page: slot + 1, total: pageCount })}
                      draggable={false}
                      style={{
                        width: bitmap.width,
                        height: bitmap.height,
                        transform: `scale(${scale})`,
                      }}
                    />
                  ) : (
                    <div
                      className={`hwp-preview-sheet-wait${loading.has(slot) ? ' loading' : ''}`}
                    />
                  )}
                  {failed && (
                    <div className="hwp-preview-sheet-error" role="alert">
                      <span>{t('previewFailed')}</span>
                      <button
                        type="button"
                        className="hwp-preview-button"
                        onClick={() => {
                          errorsRef.current.delete(slot)
                          setErrors(new Set(errorsRef.current))
                          void loadPage(slot)
                        }}
                      >
                        {t('aiRetry')}
                      </button>
                    </div>
                  )}
                  {showMargins && bitmap && (
                    <span
                      className="hwp-preview-margins"
                      style={{
                        top: bitmap.margins.top * scale,
                        left: bitmap.margins.left * scale,
                        right: bitmap.margins.right * scale,
                        bottom: bitmap.margins.bottom * scale,
                      }}
                    />
                  )}
                  <span className="hwp-preview-page-no">{slot + 1}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="hwp-preview-status">
        <span>{pageCount === null ? '…' : pageLabel(page, view, pageCount)}</span>
        <span aria-hidden="true">·</span>
        <span>{paperSizeLabel(statusSize.width, statusSize.height)}</span>
        <span aria-hidden="true">·</span>
        <span>{zoomText}</span>
        {printing && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {progress
                ? t('printPreparing', { done: progress.done, total: progress.total })
                : t('printSending')}
            </span>
          </>
        )}
        {stale && (
          <span className="hwp-preview-problem" role="alert">
            {t('previewStale')}
          </span>
        )}
        {editError && (
          <span className="hwp-preview-problem" role="alert">
            {t('previewEditFailed')}
          </span>
        )}
        {printError && (
          <span className="hwp-preview-problem" role="alert">
            {t('printFailed')} {printError}
          </span>
        )}
      </div>
    </div>
  )
}
