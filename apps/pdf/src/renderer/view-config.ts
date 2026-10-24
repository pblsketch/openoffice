// cmaps/standard fonts/wasm are statically copied by the build into pdfjs/ of the renderer output (same path on the dev server)
export const ASSET_BASE = new URL('pdfjs/', document.baseURI).href

export const ZOOM_STEPS = [
  0.1, 0.25, 0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6, 8,
]
export const MIN_SCALE = ZOOM_STEPS[0]
export const MAX_SCALE = ZOOM_STEPS[ZOOM_STEPS.length - 1]
export const PAGE_GAP = 16
export const SCROLL_PAD = 24
// ── Sidebar (thumbnails / outline) width: drag the divider to resize; persisted ──
export const SIDEBAR_W_KEY = 'genoffice-pdf-sidebar-width'
export const SIDEBAR_W_DEFAULT = 150
export const SIDEBAR_W_MIN = 120
/** pane padding (10px × 2) + thumb box borders (2px × 2) */
export const SIDEBAR_CHROME = 24

export const clampSidebarW = (w: number): number =>
  Math.min(Math.max(w, SIDEBAR_W_MIN), Math.min(320, Math.round(window.innerWidth * 0.4)))

export const loadSidebarW = (): number => {
  const saved = Number(localStorage.getItem(SIDEBAR_W_KEY))
  return Number.isFinite(saved) && saved > 0 ? clampSidebarW(saved) : SIDEBAR_W_DEFAULT
}

export interface PageSize {
  width: number
  height: number
}

export type FitMode = 'width' | 'page' | null

export const DOC_OPTS = {
  cMapUrl: `${ASSET_BASE}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
  wasmUrl: `${ASSET_BASE}wasm/`,
}

/** Target paper sizes for "page size" (points, portrait) */
export const PAPER_SIZES = [
  { label: 'A3', w: 842, h: 1191 },
  { label: 'A4', w: 595, h: 842 },
  { label: 'A5', w: 420, h: 595 },
  { label: 'Letter', w: 612, h: 792 },
  { label: 'Legal', w: 612, h: 1008 },
] as const

/** Drawing stroke width (PDF pt); thin lines stay crisp under zoom */
export const STROKE_WIDTH = 2

/** Width of the WPS-style comments margin beside the pages */
export const NOTE_MARGIN_W = 300

/** Page ranges like "1-3,5" → list of 1-based page numbers; null if invalid */
export function parsePageRanges(input: string, max: number): number[] | null {
  const out = new Set<number>()
  for (const part of input.split(/[,，]/)) {
    const s = part.trim()
    if (!s) continue
    const m = /^(\d+)\s*[-–]\s*(\d+)$|^(\d+)$/.exec(s)
    if (!m) return null
    const a = Number(m[1] ?? m[3])
    const b = Number(m[2] ?? m[3])
    if (a < 1 || b > max || a > b) return null
    for (let i = a; i <= b; i++) out.add(i)
  }
  return out.size > 0 ? [...out].sort((x, y) => x - y) : null
}
/** Page bitmap budget: at 800% a hi-dpi Letter page would otherwise be ~125M px */
export const MAX_PAGE_RENDER_PIXELS = 48_000_000

// ── Side-by-side translation column: width and text size; persisted ──
export const BILINGUAL_W_KEY = 'genoffice-pdf-bilingual-width'
export const BILINGUAL_W_DEFAULT = 360
export const BILINGUAL_W_MIN = 220
export const BILINGUAL_FONT_KEY = 'genoffice-pdf-bilingual-font'
export const BILINGUAL_FONT_DEFAULT = 14
export const BILINGUAL_FONT_MIN = 10
export const BILINGUAL_FONT_MAX = 24

export const clampBilingualW = (w: number): number =>
  Math.round(
    Math.min(
      Math.max(w, BILINGUAL_W_MIN),
      Math.max(BILINGUAL_W_MIN, Math.round(window.innerWidth * 0.6)),
    ),
  )

export const clampBilingualFont = (px: number): number =>
  Math.min(Math.max(Math.round(px), BILINGUAL_FONT_MIN), BILINGUAL_FONT_MAX)

const readStoredNumber = (key: string): number | null => {
  try {
    const saved = Number(localStorage.getItem(key))
    return Number.isFinite(saved) && saved > 0 ? saved : null
  } catch {
    return null
  }
}

const writeStoredNumber = (key: string, value: number): void => {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // storage full or blocked: the value lasts for this tab only
  }
}

export const loadBilingualW = (): number => {
  const saved = readStoredNumber(BILINGUAL_W_KEY)
  return saved !== null ? clampBilingualW(saved) : BILINGUAL_W_DEFAULT
}

export const saveBilingualW = (w: number): void => writeStoredNumber(BILINGUAL_W_KEY, w)

export const loadBilingualFont = (): number => {
  const saved = readStoredNumber(BILINGUAL_FONT_KEY)
  return saved !== null ? clampBilingualFont(saved) : BILINGUAL_FONT_DEFAULT
}

export const saveBilingualFont = (px: number): void => writeStoredNumber(BILINGUAL_FONT_KEY, px)

// ── Reading assistant: the dotted marks under passages that have a card (View tab, default on) ──
export const PASSAGE_MARKS_KEY = 'genoffice-pdf-passage-marks'

type FlagStorage = Pick<Storage, 'getItem' | 'setItem'>

export const loadPassageMarks = (storage: FlagStorage = localStorage): boolean => {
  try {
    return storage.getItem(PASSAGE_MARKS_KEY) !== '0'
  } catch {
    return true
  }
}

export const savePassageMarks = (on: boolean, storage: FlagStorage = localStorage): void => {
  try {
    storage.setItem(PASSAGE_MARKS_KEY, on ? '1' : '0')
  } catch {
    // storage unavailable: the toggle still works for this session
  }
}

// ── View for a PDF that has no saved reading position: fit width (the old behaviour) or fit page ──
export const DEFAULT_FIT_KEY = 'genoffice-pdf-default-fit'

export type DefaultFitMode = Exclude<FitMode, null>

export const loadDefaultFit = (storage: FlagStorage = localStorage): DefaultFitMode => {
  try {
    return storage.getItem(DEFAULT_FIT_KEY) === 'page' ? 'page' : 'width'
  } catch {
    return 'width'
  }
}

export const saveDefaultFit = (mode: DefaultFitMode, storage: FlagStorage = localStorage): void => {
  try {
    storage.setItem(DEFAULT_FIT_KEY, mode)
  } catch {
    // storage unavailable: the choice still holds for this session
  }
}

/** A file's own saved view wins; a file with no saved position uses the default. */
export const openingFitMode = (
  saved: { fitMode: FitMode } | null,
  fallback: DefaultFitMode,
): FitMode => (saved ? saved.fitMode : fallback)

// ── Sidebar open or closed: a closed sidebar stays closed in the next PDF; open starts on the thumbnails ──
export const SIDEBAR_OPEN_KEY = 'genoffice-pdf-sidebar-open'

export const loadSidebarOpen = (storage: FlagStorage = localStorage): boolean => {
  try {
    return storage.getItem(SIDEBAR_OPEN_KEY) !== '0'
  } catch {
    return true
  }
}

export const saveSidebarOpen = (open: boolean, storage: FlagStorage = localStorage): void => {
  try {
    storage.setItem(SIDEBAR_OPEN_KEY, open ? '1' : '0')
  } catch {
    // storage unavailable: closing still works for this session
  }
}
