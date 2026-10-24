import type { AiSettings, AiStreamChunk, AiStreamRequest } from '@genoffice/ai-provider'
import type { Lang } from '@genoffice/i18n'
import type { AiPanelPrefs } from '@genoffice/ui'
import type { SubscriptionApi } from './subscription-api'

export const HWP_CHANNELS = {
  consumePending: 'hwp:consume-pending',
  /** invoke → `{ name, format } | null`: the pending path is an untitled copy (spec 5.7) */
  untitledCopy: 'hwp:untitled-copy',
  readFile: 'hwp:read-file',
  beginSave: 'hwp:begin-save',
  commitSave: 'hwp:commit-save',
  newTabs: 'hwp:new-tabs',
  trackingDropped: 'hwp:tracking-dropped',
  abortSave: 'hwp:abort-save',
  saveRequest: 'hwp:save-request',
  printRequest: 'hwp:print-request',
  fileCommand: 'hwp:file-command',
  printPages: 'hwp:print-pages',
  dirtyChanged: 'hwp:dirty-changed',
  closeSaveRequest: 'hwp:close-save-request',
  closeSaveResult: 'hwp:close-save-result',
  readBytesRequest: 'hwp:read-bytes-request',
  readBytesResult: 'hwp:read-bytes-result',
  /** invoke → RecoveryBeginResult: a recovery copy is about to be exported */
  recoveryBegin: 'hwp:recovery-begin',
  /** invoke(bytes, format) → TabSpot[]: the copy's tabs without a width */
  recoveryNewTabs: 'hwp:recovery-new-tabs',
  /** invoke(bytes, format, tabs) → RecoveryWriteOutcome */
  recoveryWrite: 'hwp:recovery-write',
  /** invoke(passwordProtected) → RecoveryOpenedResult, once the document is in the editor */
  recoveryOpened: 'hwp:recovery-opened',
  /** main → renderer (token): write a copy now if there are unsaved changes (OS shutdown) */
  recoveryFlush: 'hwp:recovery-flush',
  /** renderer → main (token): the flush is done */
  recoveryFlushed: 'hwp:recovery-flushed',
  /** main → renderer: the copy was removed while the tab stays open; write a fresh one */
  recoveryReset: 'hwp:recovery-reset',
  filesPick: 'hwp:files-pick',
  filesAdd: 'hwp:files-add',
  filesAddPastedImage: 'hwp:files-add-pasted-image',
  filesRead: 'hwp:files-read',
  filesReadImage: 'hwp:files-read-image',
  // channels below are served once by the shell for every editor
  getLanguage: 'app:get-language',
  languageChanged: 'app:language-changed',
  getTheme: 'app:get-theme',
  themeChanged: 'app:theme-changed',
  getAiPanelPrefs: 'app:get-ai-panel-prefs',
  setAiPanelPrefs: 'app:set-ai-panel-prefs',
  aiPanelPrefsChanged: 'app:ai-panel-prefs-changed',
} as const

/**
 * The shared AI host. Its handlers are registered once for the whole app by
 * the docs main (registerAiIpc); this editor registers none of them.
 */
export const AI_CHANNELS = {
  getSettings: 'ai:get-settings',
  setSettings: 'ai:set-settings',
  settingsChanged: 'ai:settings-changed',
  openModelSettings: 'ai:open-model-settings',
  stream: 'ai:stream',
  streamChunk: 'ai:stream-chunk',
  streamCancel: 'ai:stream-cancel',
  readUrl: 'ai:read-url',
} as const

export type UiTheme = 'light' | 'dark' | 'system'
export type SaveMode = 'save' | 'saveAs'

/** What the editor's File menu asks for (see the plugin's FILE_COMMAND_EVENT). */
export type FileCommand = SaveMode | PrintMode

/** Where the pages go: a PDF file, or the printer through the system print dialog. */
export type PrintMode = 'pdf' | 'print'

/** One page as the editor draws it for printing: SVG, and its size in CSS pixels. */
export interface PrintPage {
  svg: string
  width: number
  height: number
}

/**
 * The pages of the document for printing. A picture the pages use is in `images` once
 * (a data URL), and the pages point at it as `href="ieum-image:N"`.
 */
export interface PrintJob {
  mode: PrintMode
  pages: PrintPage[]
  images: string[]
}

export type PrintResult =
  | { ok: true; canceled: true }
  | { ok: true; canceled?: false; path?: string }
  | { ok: false; error: string }

/** Most pages one job takes; past it the job is refused rather than run out of memory. */
export const MAX_PRINT_PAGES = 5000
/** Most characters of SVG and pictures one job takes. */
export const MAX_PRINT_CHARS = 600_000_000

/** The two container formats the editor writes. A document is saved back in the format of its file name. */
export type HwpFormat = 'hwp' | 'hwpx'

/** Format a path is written in, or null when its extension is neither. */
export function hwpFormatOfPath(path: string): HwpFormat | null {
  const match = /\.(hwpx?)$/i.exec(path)
  return match ? (match[1].toLowerCase() as HwpFormat) : null
}

/** Largest document the save channel accepts; far above real documents, below what would stall the process. */
export const MAX_HWP_SAVE_BYTES = 512 * 1024 * 1024

export type BeginSaveResult =
  | { ok: true; path: string; format: HwpFormat }
  | { ok: true; canceled: true }
  /** `reason` 'tracked': the document has tracked changes, which a save here would lose */
  | { ok: false; error: string; reason?: 'tracked' }

export type CommitSaveResult =
  /**
   * `backupPath` is set when this save was the first to overwrite the file and the previous
   * bytes were kept. `tailsLost` is set when master pages or memos of the opened file could
   * not be carried into the written one.
   */
  { ok: true; path: string; backupPath?: string; tailsLost?: true } | { ok: false; error: string }

/**
 * A tab the engine saved without a width, as the editor can find it again: the body
 * paragraph (or the one holding the table), the cells on the way (each table by its place
 * among the tables of its paragraph), which tab of its paragraph, and how many it has.
 */
export interface TabSpot {
  sec: number
  para: number
  cells: { table: number; cell: number; para: number }[]
  tab: number
  tabs: number
}

/** How the editor lays a tab out: width in HWPUNIT; kind and leader of its tab stop. */
export interface TabMeasure {
  width: number
  /** 0 left, 1 right, 2 centre, 3 decimal, as tab stops number them */
  type: number
  /** the leader, numbered as tab stops number it (0: none) */
  fill: number
}

export type MeasuredTab = TabSpot & TabMeasure

/** The live document as bytes in its own format, or why there are none. */
export type ReadBytesResult = { ok: true; bytes: Uint8Array } | { ok: false; error: string }

/**
 * A recovery copy may be written now, exported in `format` (the format a save would
 * write); `ok: false` when this document gets no copy at the moment.
 */
export type RecoveryBeginResult = { ok: true; format: HwpFormat } | { ok: false }

/** `superseded`: a save or a discard came in between; `refused`: no copy for this document */
export type RecoveryWriteOutcome = 'written' | 'superseded' | 'refused'

export interface RecoveryOpenedResult {
  /** the editor holds a recovery copy's content: the document has unsaved changes */
  restored: boolean
  /** the one-time notice for a document that gets no copy (password), already localized */
  notice: string | null
}

// ---- chat attachments (local files fed to the agent via tools) ----

/** image attachments skip text extraction: read as base64 on send and passed to the model with the user message */
export const ATTACHMENT_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

export interface AttachmentMeta {
  path: string
  name: string
  ext: string
  sizeBytes: number
}

export interface AttachmentAddResult {
  accepted: AttachmentMeta[]
  /** per-file reasons, already localized */
  rejected: string[]
}

export interface AttachmentReadResult {
  ok: boolean
  name?: string
  totalChars?: number
  offset?: number
  text?: string
  error?: string
}

export interface AttachmentImageResult {
  ok: boolean
  base64?: string
  mime?: string
  error?: string
}

/** One page of a web page read for the AI (the shared ai:read-url handler) */
export type ReadUrlResult =
  | {
      ok: true
      /** the final address after redirects */
      url: string
      title?: string
      text: string
      /** where this slice of the text starts */
      offset: number
      totalChars: number
      truncated: boolean
      /** where the next slice starts; only when truncated */
      nextOffset?: number
    }
  | { ok: false; error: string; errorCode: string }

export interface HwpApi {
  /** path queued for this view when its tab was created; null for a view opened without a file */
  consumePending(): Promise<string | null>
  /** the pending path is an untitled copy (a skill template's): its name and format; null otherwise */
  untitledCopy?(): Promise<{ name: string; format: 'hwp' | 'hwpx' } | null>
  readFile(path: string): Promise<Uint8Array>
  /**
   * the file `readFile` gave this view had tracked changes and was given without them: the
   * text as it reads now, which is what a save writes (decision 0025)
   */
  trackingDropped(): Promise<boolean>
  /** resolve where and in which format this save goes (shows the dialog for Save As) */
  beginSave(mode: SaveMode): Promise<BeginSaveResult>
  /** the tabs of exported bytes that have no width yet (see tab-widths in main) */
  newTabs(bytes: Uint8Array, format: HwpFormat): Promise<TabSpot[]>
  /**
   * write the exported bytes to the target `beginSave` resolved, with the widths the editor
   * measured for the tabs `newTabs` found
   */
  commitSave(bytes: Uint8Array, tabs?: MeasuredTab[]): Promise<CommitSaveResult>
  /** the renderer could not produce bytes for a save it began */
  abortSave(): void
  setDirty(dirty: boolean): void
  onSaveRequest(handler: (mode: SaveMode) => void): () => void
  /**
   * the editor's own File menu asks to save or print: the main process answers it the way
   * it answers Ctrl+S and Ctrl+P, with a save or print request back to this view
   */
  requestFileCommand(command: FileCommand): void
  /** the File menu or Ctrl+P asks for a PDF or a print */
  onPrintRequest(handler: (mode: PrintMode) => void): () => void
  /** make the PDF (asking where) or open the print dialog for these pages */
  printPages(job: PrintJob): Promise<PrintResult>
  onCloseSaveRequest(handler: () => void): () => void
  sendCloseSaveResult(ok: boolean): void
  /** the main process wants the document as it is now, unsaved edits included */
  onReadBytesRequest(handler: () => void): () => void
  sendReadBytesResult(result: ReadBytesResult): void
  /** crash recovery (see renderer/recovery-flow.ts): take the copy's turn before exporting */
  recoveryBegin(): Promise<RecoveryBeginResult>
  /** the tabs of a copy's exported bytes that have no width yet */
  recoveryNewTabs(bytes: Uint8Array, format: HwpFormat): Promise<TabSpot[]>
  /** store the exported bytes as the recovery copy, with the save-time corrections */
  recoveryWrite(
    bytes: Uint8Array,
    format: HwpFormat,
    tabs: MeasuredTab[],
  ): Promise<RecoveryWriteOutcome>
  /** the document is in the editor: whether it is a restored copy, and a notice to show */
  recoveryOpened(passwordProtected: boolean): Promise<RecoveryOpenedResult>
  /** the main process wants a copy now (the OS is ending the session) */
  onRecoveryFlush(handler: (token: number) => void): () => void
  sendRecoveryFlushed(token: number): void
  /** the copy was removed while the tab stays open: the next turn writes a fresh one */
  onRecoveryReset(handler: () => void): () => void
  /** file picker for chat attachments (multi-select) */
  pickAttachments(): Promise<AttachmentAddResult | null>
  /** validate dropped paths and return attachment metadata */
  addAttachmentPaths(paths: string[]): Promise<AttachmentAddResult>
  /** persist a pasted clipboard image (no local path) to a temp file and add it as an attachment */
  addPastedImage(data: ArrayBuffer, ext: string): Promise<AttachmentAddResult>
  /** read a slice of the extracted text of an attachment */
  readAttachment(path: string, offset: number, maxChars: number): Promise<AttachmentReadResult>
  /** read an image attachment as base64 for multimodal input */
  readAttachmentImage(path: string): Promise<AttachmentImageResult>
  /** the local path of a dropped or pasted file; empty for one that has none (a screenshot) */
  getPathForFile(file: File): string
  /**
   * open the documents among files dropped on the editor, as a drop anywhere else in the
   * app does (the page's drop bridge does not hear the editor's frame); false when none
   * of them is a document, and the drop is the editor's (a picture to insert)
   */
  openDroppedDocuments(files: File[]): boolean
  getLanguage(): Promise<Lang>
  onLanguageChanged(handler: (lang: Lang) => void): () => void
  getTheme(): Promise<UiTheme>
  onThemeChanged(handler: (theme: UiTheme) => void): () => void
  /** AI panel side and text size (Settings › General in the shell) */
  getAiPanelPrefs(): Promise<AiPanelPrefs>
  setAiPanelPrefs(patch: Partial<AiPanelPrefs>): Promise<AiPanelPrefs>
  onAiPanelPrefsChanged(handler: (prefs: AiPanelPrefs) => void): () => void
  getAiSettings(): Promise<AiSettings>
  setAiSettings(settings: AiSettings): Promise<void>
  /** ai-settings.json was rewritten by any renderer; re-read it */
  onAiSettingsChanged(handler: () => void): () => void
  /** shell only: switch to Home and open Settings › AI Model (rejects in standalone) */
  openAiModelSettings(): Promise<void>
  /** subscription connections (Claude, Codex): statuses and the connect-card actions */
  aiSubscription: SubscriptionApi
  aiStream(request: AiStreamRequest): Promise<void>
  aiStreamCancel(requestId: string): Promise<void>
  /** Read one web page as text (the shared ai:read-url handler), paged by character offset */
  readUrl(url: string, offset?: number): Promise<ReadUrlResult>
  onAiStream(handler: (chunk: AiStreamChunk) => void): () => void
}
