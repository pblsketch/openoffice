/**
 * Presenter view: the width of the side column (next-slide preview + notes),
 * which the presenter drags or steps with the keyboard on the splitter
 * between the current slide and the column. Pure functions; PresenterView
 * owns the state and remembers the chosen width per install (localStorage).
 */

/** localStorage key of the chosen side column width, in CSS px */
export const PRESENTER_SIDE_W_KEY = 'ai-slides-presenter-side-width'
/** The column's width before anyone dragged it (the old fixed width) */
export const PRESENTER_SIDE_W_DEFAULT = 340
/** Narrowest column that still fits the notes' size buttons and a readable line */
export const PRESENTER_SIDE_W_MIN = 240
/**
 * Room the main area keeps for itself: the bottom row's tools, page
 * navigation and their mirrored spacer sit side by side and need this much
 * before they start to overlap.
 */
export const PRESENTER_MAIN_MIN_W = 600
/** Arrow-key step on the splitter; Shift takes bigger steps */
export const PRESENTER_SIDE_STEP = 20
export const PRESENTER_SIDE_STEP_LARGE = 80
/** Horizontal padding of the column (styles.css `.pv-side`), taken off the next-slide preview */
const SIDE_PADDING_X = 28
/** Share of the column's height the next-slide preview may take, so a wide column keeps room for notes */
const NEXT_MAX_HEIGHT_SHARE = 0.4

/** Widest the column can get in a window `windowW` wide (never below the minimum). */
export function presenterSideMaxW(windowW: number): number {
  return Math.max(PRESENTER_SIDE_W_MIN, Math.round(windowW - PRESENTER_MAIN_MIN_W))
}

/** The width the column is drawn at: the chosen one, kept inside what this window allows. */
export function clampPresenterSideW(w: number, windowW: number): number {
  if (!Number.isFinite(w)) return Math.min(PRESENTER_SIDE_W_DEFAULT, presenterSideMaxW(windowW))
  return Math.round(Math.min(Math.max(w, PRESENTER_SIDE_W_MIN), presenterSideMaxW(windowW)))
}

/** Reads a remembered width; anything unusable reads as the default. */
export function parsePresenterSideW(raw: string | null): number {
  const n = Number(raw)
  return raw !== null && Number.isFinite(n) && n > 0 ? Math.round(n) : PRESENTER_SIDE_W_DEFAULT
}

/**
 * The column width with the pointer at `clientX`. The column sits at the
 * body's end edge: the right one, or the left one when the page runs right
 * to left. Not clamped.
 */
export function presenterSideWAtPointer(
  clientX: number,
  body: { left: number; right: number },
  rtl: boolean,
): number {
  return rtl ? clientX - body.left : body.right - clientX
}

/**
 * The column width after a key on the focused splitter, or null when the key
 * is not one of the splitter's. Arrow keys move the splitter the way they
 * point (so toward the slide widens the column), Home and End go to the
 * narrowest and widest the window allows.
 */
export function presenterSideWForKey(
  w: number,
  key: string,
  opts: { shift: boolean; rtl: boolean; windowW: number },
): number | null {
  const step = opts.shift ? PRESENTER_SIDE_STEP_LARGE : PRESENTER_SIDE_STEP
  const current = clampPresenterSideW(w, opts.windowW)
  let next: number
  switch (key) {
    case 'ArrowLeft':
      next = current + (opts.rtl ? -step : step)
      break
    case 'ArrowRight':
      next = current + (opts.rtl ? step : -step)
      break
    case 'Home':
      next = PRESENTER_SIDE_W_MIN
      break
    case 'End':
      next = presenterSideMaxW(opts.windowW)
      break
    default:
      return null
  }
  return clampPresenterSideW(next, opts.windowW)
}

/**
 * Width of the next-slide preview in a column `sideW` wide and `sideH` tall:
 * it fills the column but never takes more than a share of its height, so
 * widening the column for notes does not hand the room to the preview.
 */
export function presenterNextThumbW(sideW: number, sideH: number, aspect: number): number {
  const byWidth = sideW - SIDE_PADDING_X
  const byHeight = aspect > 0 ? Math.round(sideH * NEXT_MAX_HEIGHT_SHARE * aspect) : byWidth
  return Math.max(40, Math.min(byWidth, byHeight))
}
