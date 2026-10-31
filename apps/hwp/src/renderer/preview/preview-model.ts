/**
 * The print preview's page grid, navigation and zoom, without any DOM. The
 * component and its tests use the same functions, so what PageUp shows and what
 * the status line says cannot drift apart.
 */

/** A page view is one page, two facing pages, or a grid of pages. */
export type PageView = 'single' | 'facing' | { readonly cols: number; readonly rows: number }

/** A zoom is either fitted to the pane or a percentage. */
export type ZoomMode = 'fit-page' | 'fit-width' | number

export const MIN_ZOOM = 10
export const MAX_ZOOM = 500
/** The percentages the zoom list offers; +/- walks these steps. */
export const ZOOM_STEPS = [10, 25, 50, 75, 100, 125, 150, 200, 300, 400, 500] as const

/** A grid view is written `2x2` … `8x8` in the select. */
const GRID_VALUE = /^([1-8])x([1-8])$/

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 100
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value)))
}

/** The next or previous percentage in the list; a value between steps moves to the neighbour. */
export function nextZoom(current: number, direction: 1 | -1): number {
  const value = clampZoom(current)
  if (direction > 0) {
    return ZOOM_STEPS.find((step) => step > value) ?? MAX_ZOOM
  }
  return [...ZOOM_STEPS].reverse().find((step) => step < value) ?? MIN_ZOOM
}

export function gridOf(view: PageView): { cols: number; rows: number } {
  if (view === 'single') return { cols: 1, rows: 1 }
  if (view === 'facing') return { cols: 2, rows: 1 }
  return view
}

/** The select value of a view, and the view a select value means. */
export function viewValue(view: PageView): string {
  if (view === 'single' || view === 'facing') return view
  return `${view.cols}x${view.rows}`
}

export function viewFromValue(value: string): PageView {
  if (value === 'single' || value === 'facing') return value
  const grid = GRID_VALUE.exec(value)
  if (grid) return { cols: Number(grid[1]), rows: Number(grid[2]) }
  return 'single'
}

/** The first page of the screen that holds `page`. Facing pages put page 1 alone on the right. */
export function screenStart(page: number, view: PageView, pageCount: number): number {
  if (pageCount <= 0) return 0
  const safe = Math.min(Math.max(page, 0), pageCount - 1)
  if (view === 'single') return safe
  if (view === 'facing') {
    if (safe === 0) return 0
    return safe % 2 === 1 ? safe : safe - 1
  }
  const step = view.cols * view.rows
  return Math.floor(safe / step) * step
}

/**
 * The pages on the screen that holds `page`, in reading order. `null` keeps an
 * empty place: the left side of the first facing page, or the end of the last
 * grid row.
 */
export function visibleSlots(
  page: number,
  view: PageView,
  pageCount: number,
): Array<number | null> {
  if (pageCount <= 0) return [null]
  const start = screenStart(page, view, pageCount)
  if (view === 'single') return [start]
  if (view === 'facing') {
    if (start === 0) return [null, 0]
    return [start, start + 1 < pageCount ? start + 1 : null]
  }
  // The last screen may hold fewer pages than the grid: do not fill it with
  // placeholders, or an 8x8 view of a one-page document would draw 63 blanks.
  const count = Math.min(view.cols * view.rows, Math.max(pageCount - start, 0))
  return Array.from({ length: count }, (_unused, index) => start + index)
}

/** PageUp/PageDown: one page in single view, one screen in facing and grid views. */
export function stepPage(
  page: number,
  view: PageView,
  pageCount: number,
  direction: 1 | -1,
): number {
  if (pageCount <= 0) return 0
  const last = pageCount - 1
  const start = screenStart(page, view, pageCount)
  if (view === 'single') return Math.min(Math.max(start + direction, 0), last)
  if (view === 'facing') {
    if (direction > 0) return start === 0 ? Math.min(1, last) : Math.min(start + 2, last)
    return start <= 1 ? 0 : start - 2
  }
  const step = view.cols * view.rows
  return Math.min(Math.max(start + direction * step, 0), last)
}

/** The status line's page label: one page, a facing pair, or the grid's range. */
export function pageLabel(page: number, view: PageView, pageCount: number): string {
  if (pageCount <= 0) return `0 / 0`
  if (view === 'single') return `${Math.min(page, pageCount - 1) + 1} / ${pageCount}`
  const start = screenStart(page, view, pageCount)
  // the first facing screen is page 1 alone on the right: the left side is blank
  if (view === 'facing' && start === 0) return `1 / ${pageCount}`
  const { cols, rows } = gridOf(view)
  const end = Math.min(start + cols * rows - 1, pageCount - 1)
  return start === end ? `${start + 1} / ${pageCount}` : `${start + 1}–${end + 1} / ${pageCount}`
}

/** 96 CSS pixels to the inch, as the print pages are sized. */
export function paperSizeLabel(width: number, height: number): string {
  const mm = (px: number) => Math.round((px * 25.4) / 96)
  return `${mm(width)} × ${mm(height)} mm`
}

/** The zoom list's label for the current mode; a fitted view keeps its name. */
export function zoomLabel(mode: ZoomMode, scale: number): string {
  if (mode === 'fit-page') return 'fit-page'
  if (mode === 'fit-width') return 'fit-width'
  return `${Math.round(scale * 100)}%`
}
