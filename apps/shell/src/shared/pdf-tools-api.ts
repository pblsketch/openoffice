import type { Lang } from '@genoffice/i18n'

/**
 * The PDF tools window: pick a task first, then the files it needs, then get
 * a new file. Every tool runs on the user's PC without AI and never writes
 * over its source. Plan: docs/plans/pdf-tools.md, decision 0030.
 *
 * Kept apart from pdf-tools-home-channels.ts: the shell preload and this
 * window's preload are separate bundle entries, and a module both import by
 * value would become a shared chunk a sandboxed preload cannot load.
 */
export const PDF_TOOLS_CHANNELS = {
  getInit: 'pdf-tools:get-init',
  pickInputs: 'pdf-tools:pick-inputs',
  run: 'pdf-tools:run',
  openResult: 'pdf-tools:open-result',
  revealResult: 'pdf-tools:reveal-result',
  openInEditor: 'pdf-tools:open-in-editor',
  close: 'pdf-tools:close',
} as const

/** Tools the window runs itself, each making a new file from the picked PDFs */
export const PDF_TOOL_IDS = [
  'merge',
  'split',
  'extract',
  'reverse',
  'nup',
  'rotate',
  'pageSize',
  'splitPages',
] as const
export type PdfToolId = (typeof PDF_TOOL_IDS)[number]

/** Tools that need the PDF editor's view; their cards open the file in a PDF tab */
export const PDF_EDITOR_TOOL_IDS = ['stamps', 'crop', 'exportImages', 'convert', 'edit'] as const
export type PdfEditorToolId = (typeof PDF_EDITOR_TOOL_IDS)[number]

/** Paper sizes "page size" offers (points, portrait), the PDF editor's list */
export const PDF_TOOL_PAPERS = ['A3', 'A4', 'A5', 'Letter', 'Legal'] as const
export type PdfToolPaper = (typeof PDF_TOOL_PAPERS)[number]

export interface PdfToolOptions {
  /** split: pages per output file */
  chunkSize?: number
  /** extract: "1-3,5" style, 1-based */
  pages?: string
  /** nup: pages per sheet (2-16), fill order and hairlines between cells */
  perSheet?: number
  direction?: 'horizontal' | 'vertical'
  separator?: boolean
  /** rotate: clockwise degrees added to every page */
  rotation?: 90 | 180 | 270
  /** pageSize: target paper */
  paper?: PdfToolPaper
  /** splitPages: pieces each page is cut into */
  perPage?: 2 | 4 | 9
}

/** One picked PDF, as the window may see it: an opaque id, never the path */
export interface PdfToolInput {
  id: string
  name: string
  pages: number
  size: number
}

export type PdfInputProblem = 'encrypted' | 'unreadable' | 'too-large'

export interface PdfPickResult {
  inputs: PdfToolInput[]
  rejected: { name: string; problem: PdfInputProblem }[]
}

export type PdfToolError =
  | 'no-input'
  | 'need-two'
  | 'missing'
  | 'too-large'
  | 'range'
  | 'same-as-source'
  | 'unsaved-target'
  | 'busy'
  | 'failed'

export interface PdfToolRunRequest {
  tool: PdfToolId
  /** ids from pickInputs, in the order the user arranged them */
  inputIds: string[]
  options: PdfToolOptions
}

export type PdfToolRunResult =
  | { ok: true; outputs: { id: string; name: string }[] }
  | { ok: false; canceled: true }
  | { ok: false; error: PdfToolError }

export type PdfToolsTheme = 'light' | 'dark' | 'system'

export interface PdfToolsInit {
  lang: Lang
  theme: PdfToolsTheme
}

export interface PdfToolsWindowApi {
  getInit(): Promise<PdfToolsInit>
  onThemeChanged(handler: (theme: PdfToolsTheme) => void): () => void
  /** a main-process open dialog; the window gets ids, never paths */
  pickInputs(multi: boolean): Promise<PdfPickResult>
  run(request: PdfToolRunRequest): Promise<PdfToolRunResult>
  openResult(id: string): Promise<void>
  revealResult(id: string): Promise<void>
  /** pick a PDF and open it in a PDF editor tab */
  openInEditor(): Promise<void>
  close(): Promise<void>
}

export interface PdfToolsHomeApi {
  open(): Promise<void>
}
