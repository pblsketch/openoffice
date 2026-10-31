/**
 * The book preview's pages: the book laid out the way an e-book reader shows
 * it, as pages of a chosen screen that turn one by one, across chapters.
 *
 * A chapter is drawn in a frame the size of the screen, and its body is cut
 * into CSS columns exactly one page wide, so the chapter runs on to the side
 * (or downwards, for vertical writing) one page after another. Turning a page
 * shifts the body by one view; nothing in the chapter's text changes. A
 * pre-paginated (fixed-layout) chapter is one page at its own viewport size,
 * scaled into the screen.
 *
 * Everything here is screen only, like the view settings: the preview never
 * reaches the book.
 */
import { themeCss, type FrameColors, type ReadingTheme } from './view-prefs'

export type PreviewDevice = 'fit' | 'phone' | 'tablet' | 'ereader'

export const PREVIEW_DEVICES: readonly PreviewDevice[] = ['ereader', 'phone', 'tablet', 'fit']

export const PREVIEW_THEMES: readonly ReadingTheme[] = ['light', 'sepia', 'dark']

export interface PreviewSettings {
  device: PreviewDevice
  /** the device turned on its side (not for `fit`) */
  landscape: boolean
  theme: ReadingTheme
  /** the reader's text size, as a factor of the book's own */
  fontScale: number
}

export const PREVIEW_DEFAULTS: PreviewSettings = {
  device: 'ereader',
  landscape: false,
  theme: 'light',
  fontScale: 1,
}

/** Text size steps of the preview. */
export const PREVIEW_FONT_SCALES = [0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2] as const

export interface Size {
  width: number
  height: number
}

/** Upright screen sizes in CSS pixels: a 6-inch e-reader, a phone, a 10-inch tablet. */
export const DEVICE_SIZES: Record<Exclude<PreviewDevice, 'fit'>, Size> = {
  ereader: { width: 600, height: 800 },
  phone: { width: 390, height: 780 },
  tablet: { width: 768, height: 1024 },
}

/** Space kept around the screen inside the preview area. */
export const STAGE_GAP = 24

/** The smallest screen the preview lays out (a tiny window still gets a page). */
const MIN_SCREEN: Size = { width: 240, height: 320 }

/** Two pages side by side from this screen width on, when the screen is wider than tall. */
const SPREAD_MIN_WIDTH = 900

/** Reads saved settings, keeping only values the preview knows. */
export function readPreviewSettings(raw: string | null): PreviewSettings {
  if (!raw) return { ...PREVIEW_DEFAULTS }
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof PreviewSettings, unknown>>
    const device = PREVIEW_DEVICES.find((d) => d === value.device) ?? PREVIEW_DEFAULTS.device
    const theme = PREVIEW_THEMES.find((d) => d === value.theme) ?? PREVIEW_DEFAULTS.theme
    const fontScale = PREVIEW_FONT_SCALES.find((s) => s === value.fontScale) ?? 1
    return { device, landscape: value.landscape === true, theme, fontScale }
  } catch {
    return { ...PREVIEW_DEFAULTS }
  }
}

/** The next text size step up (1) or down (-1). */
export function stepPreviewFont(current: number, dir: 1 | -1): number {
  if (dir > 0)
    return PREVIEW_FONT_SCALES.find((s) => s > current + 1e-6) ?? PREVIEW_FONT_SCALES.at(-1)!
  return (
    [...PREVIEW_FONT_SCALES].reverse().find((s) => s < current - 1e-6) ?? PREVIEW_FONT_SCALES[0]
  )
}

/**
 * The screen the book is laid out on: the device's size (turned when
 * landscape), or for `fit` the whole preview area. Widths are even, so two
 * pages side by side are whole pixels each.
 */
export function screenSize(settings: PreviewSettings, stage: Size): Size {
  let size: Size
  if (settings.device === 'fit') {
    size = {
      width: Math.max(MIN_SCREEN.width, stage.width - 2 * STAGE_GAP),
      height: Math.max(MIN_SCREEN.height, stage.height - 2 * STAGE_GAP),
    }
  } else {
    const upright = DEVICE_SIZES[settings.device]
    size = settings.landscape ? { width: upright.height, height: upright.width } : { ...upright }
  }
  const width = Math.floor(size.width / 2) * 2
  return { width, height: Math.floor(size.height) }
}

/** How much the screen is shrunk to fit the preview area (never enlarged). */
export function fitScale(screen: Size, stage: Size): number {
  const width = stage.width - 2 * STAGE_GAP
  const height = stage.height - 2 * STAGE_GAP
  if (width <= 0 || height <= 0) return 1
  return Math.min(1, width / screen.width, height / screen.height)
}

/** The writing direction pages advance in. */
export interface PageFlow {
  /** `vertical` for vertical writing: pages run downwards */
  axis: 'horizontal' | 'vertical'
  /** pages turn leftwards (right-to-left text, vertical-rl writing); horizontal pages run from the right */
  rtl: boolean
}

export interface PageGeometry {
  screen: Size
  /** pages shown side by side */
  columns: 1 | 2
  /** the width of one page (the height, for vertical writing) */
  pageLength: number
  marginX: number
  marginY: number
  axis: PageFlow['axis']
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/** One or two pages per view, the page size and its margins. */
export function pageGeometry(screen: Size, axis: PageFlow['axis']): PageGeometry {
  const columns: 1 | 2 =
    axis === 'horizontal' && screen.width >= SPREAD_MIN_WIDTH && screen.width > screen.height
      ? 2
      : 1
  const pageWidth = screen.width / columns
  return {
    screen,
    columns,
    pageLength: axis === 'horizontal' ? pageWidth : screen.height,
    marginX: clamp(Math.round(pageWidth * 0.07), 16, 56),
    marginY: clamp(Math.round(screen.height * 0.05), 20, 48),
    axis,
  }
}

/**
 * The CSS of the preview's view style element: the chapter cut into pages of
 * the geometry, with the reader's text size and colours. Columns are one page
 * wide (less the margins on both sides), so page `k` starts exactly at
 * `k × pageLength`. Pictures are kept inside a page.
 */
export function previewCss(
  geom: PageGeometry,
  settings: PreviewSettings,
  colors: FrameColors,
): string {
  const { screen, marginX: mx, marginY: my } = geom
  const rules = themeCss(settings.theme, colors)
  const fontSize =
    Math.abs(settings.fontScale - 1) > 1e-6
      ? ` font-size: ${Math.round(settings.fontScale * 100)}% !important;`
      : ''
  rules.push(
    `html { margin: 0 !important; padding: 0 !important; width: ${screen.width}px !important; height: ${screen.height}px !important; overflow: hidden !important;${fontSize} }`,
  )
  if (geom.axis === 'horizontal') {
    const column = geom.pageLength - 2 * mx
    rules.push(
      `body { box-sizing: border-box !important; margin: 0 !important; width: ${screen.width}px !important; max-width: none !important; height: ${screen.height}px !important; padding: ${my}px ${mx}px !important; column-width: ${column}px !important; column-gap: ${2 * mx}px !important; column-fill: auto !important; overflow: visible !important; }`,
      `img, svg, video, canvas { max-width: 100% !important; max-height: ${screen.height - 2 * my}px !important; object-fit: contain; }`,
    )
  } else {
    const column = geom.pageLength - 2 * my
    rules.push(
      `body { box-sizing: border-box !important; margin: 0 !important; width: ${screen.width}px !important; height: ${screen.height}px !important; max-height: none !important; padding: ${my}px ${mx}px !important; column-width: ${column}px !important; column-gap: ${2 * my}px !important; column-fill: auto !important; overflow: visible !important; }`,
      `img, svg, video, canvas { max-height: 100% !important; max-width: ${screen.width - 2 * mx}px !important; object-fit: contain; }`,
    )
  }
  rules.push('body * { break-inside: auto; }', 'img, svg { break-inside: avoid; }')
  return rules.join('\n')
}

/** How far the chapter runs, as the frame reports it after layout. */
export interface Extent {
  scrollWidth: number
  scrollHeight: number
}

/** The number of pages a laid-out chapter has (at least one). */
export function pageCount(geom: PageGeometry, extent: Extent): number {
  const run = geom.axis === 'horizontal' ? extent.scrollWidth : extent.scrollHeight
  // a pixel of rounding at the end does not make another page
  return Math.max(1, Math.ceil((run - 1) / geom.pageLength))
}

/** The number of views (one or two pages each). */
export function viewCount(geom: PageGeometry, pages: number): number {
  return Math.max(1, Math.ceil(pages / geom.columns))
}

/** How far the pages are shifted to show view `view` (negative left: right-to-left). */
export function viewOffset(
  geom: PageGeometry,
  flow: PageFlow,
  view: number,
): { left: number; top: number } {
  const length = geom.pageLength * geom.columns
  if (flow.axis === 'vertical') return { left: 0, top: view * length }
  return { left: (flow.rtl ? -1 : 1) * view * length, top: 0 }
}

/** A box on screen, as `getClientRects` gives it, inside the frame's viewport. */
export interface Box {
  left: number
  right: number
  top: number
}

/**
 * The page a box is on, from its place in the frame's viewport and how far
 * the pages are shifted (`viewOffset` of the view on screen).
 */
export function pageOfBox(
  geom: PageGeometry,
  flow: PageFlow,
  box: Box,
  offset: { left: number; top: number },
): number {
  let along: number
  if (flow.axis === 'vertical') along = box.top + offset.top
  else if (flow.rtl) along = geom.screen.width - box.right - offset.left
  else along = box.left + offset.left
  return Math.max(0, Math.floor((along + 1) / geom.pageLength))
}

/** The view that shows page `page`. */
export function viewOfPage(geom: PageGeometry, page: number): number {
  return Math.floor(page / geom.columns)
}

/**
 * A fixed-layout chapter's own page size, from its viewport meta
 * (`width=1200, height=1600`), or null when it gives none.
 */
export function fixedViewport(source: string): Size | null {
  const metas = source.match(/<meta\b[^>]*>/gi) ?? []
  for (const meta of metas) {
    if (!/\bname\s*=\s*["']viewport["']/i.test(meta)) continue
    const content = /\bcontent\s*=\s*(["'])(.*?)\1/i.exec(meta)?.[2] ?? ''
    const width = Number(/\bwidth\s*=\s*(\d+(?:\.\d+)?)/i.exec(content)?.[1])
    const height = Number(/\bheight\s*=\s*(\d+(?:\.\d+)?)/i.exec(content)?.[1])
    if (width > 0 && height > 0) return { width, height }
  }
  return null
}

/** The page size a fixed-layout chapter is drawn at when its viewport says nothing. */
export const FIXED_FALLBACK: Size = { width: 768, height: 1024 }

/** The CSS of a fixed-layout page: its own size and colours, nothing of the reader's. */
export function fixedPageCss(size: Size): string {
  return [
    ':root { color-scheme: light; }',
    `html { margin: 0 !important; width: ${size.width}px; height: ${size.height}px; overflow: hidden !important; }`,
    'body { margin: 0; }',
  ].join('\n')
}
