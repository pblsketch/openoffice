/**
 * The view settings (spec §4): text size, line spacing and the dark view.
 * They are screen-only styles inside the chapter frame and never reach the
 * book. The frame's colours are not theme tokens of the editor page (the
 * frame is another document); they are read from the page's custom
 * properties (styles.css) and passed in here.
 */
import type { EpubViewPrefs } from '../../shared/ipc'

/** Text size steps of the ribbon and of zoom in / zoom out, inside the allowed 0.5–3. */
export const FONT_SCALES = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const

/** Line spacing choices; null keeps the book's own. */
export const LINE_HEIGHTS = [null, 1.2, 1.5, 1.8, 2, 2.5] as const

/** The next text size step up (1) or down (-1) from `current`. */
export function stepFontScale(current: number, dir: 1 | -1): number {
  if (dir > 0) return FONT_SCALES.find((s) => s > current + 1e-6) ?? FONT_SCALES.at(-1)!
  return [...FONT_SCALES].reverse().find((s) => s < current - 1e-6) ?? FONT_SCALES[0]
}

/** Colours the frame is drawn with; each is a CSS colour value. */
export interface FrameColors {
  paper: string
  ink: string
  nightPaper: string
  nightInk: string
  nightLink: string
  hitBg: string
  hitInk: string
}

/** The name of the search highlight inside the frame (CSS custom highlights). */
export const FIND_HIGHLIGHT = 'epub-find'

/** The view settings as the CSS of the frame's view style element. */
export function viewPrefsCss(prefs: EpubViewPrefs, colors: FrameColors): string {
  const rules: string[] = []
  if (prefs.dark) {
    rules.push(
      ':root { color-scheme: dark; }',
      `html, body { background-color: ${colors.nightPaper} !important; color: ${colors.nightInk} !important; }`,
      'body * { color: inherit !important; background-color: transparent !important; }',
      `body a, body a * { color: ${colors.nightLink} !important; }`,
    )
  } else {
    rules.push(
      ':root { color-scheme: light; }',
      `html { background-color: ${colors.paper}; color: ${colors.ink}; }`,
    )
  }
  rules.push('html { padding: 1.5em 2em; box-sizing: border-box; }')
  if (Math.abs(prefs.fontScale - 1) > 1e-6) rules.push(`:root { zoom: ${prefs.fontScale}; }`)
  if (prefs.lineHeight !== null) {
    rules.push(`body, body * { line-height: ${prefs.lineHeight} !important; }`)
  }
  rules.push(
    `::highlight(${FIND_HIGHLIGHT}) { background-color: ${colors.hitBg}; color: ${colors.hitInk}; }`,
  )
  return rules.join('\n')
}
