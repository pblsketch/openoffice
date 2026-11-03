/**
 * The contract between the diagram renderer, its preload and the main process,
 * for the whole feature. Later work (the AI panel, the in-app MCP server, the
 * Visio import) adds handlers and callers, not names: every channel this
 * editor will ever own is listed here once.
 *
 * Every channel of this editor starts with `diagram:`. The main processes of
 * all editors run in one process, so a name may be registered only once.
 * Channels owned by the shell (`app:*`) and the shared AI channels (`ai:*`)
 * are listed separately below; this editor never registers those, it only
 * calls them (the language getter excepted, see the main module).
 */
import type { Lang } from '@genoffice/i18n'
import type { AiSettings, AiStreamChunk, AiStreamRequest } from '@genoffice/ai-provider'
import type { DiagramFormat, DiagramOpResult, DiagramReadResult } from '@genoffice/drawio-model'
import type { AiPanelPrefs } from '@genoffice/ui'
import type { DiagramNotices } from './notices'
import type { DiagramSubscriptionApi } from './subscription-api'

export const DIAGRAM_CHANNELS = {
  // ---- open and save ----
  /** invoke → `string | null`: the path queued for this view, null for a new diagram */
  consumePending: 'diagram:consume-pending',
  /** invoke(path) → `OpenFileResult`: the diagram of a granted path, with how the file opens */
  openFile: 'diagram:open-file',
  /** invoke(`SaveTargetRequest`) → `SaveTargetResult`: where a save goes (asks for an untitled diagram and Save As) */
  saveTarget: 'diagram:save-target',
  /** invoke(`SaveDiagramRequest`) → `SaveDiagramResult`: write the bytes for a target `saveTarget` gave */
  save: 'diagram:save',
  /** invoke(`SaveIntoProjectRequest`) → `SaveIntoProjectResult`: a new diagram into its panel's project */
  saveIntoProject: 'diagram:save-into-project',
  /** main → renderer(`SaveRequestMode`): the menu's Save / Save As, a tool's save to a path */
  saveRequest: 'diagram:save-request',
  /** renderer → main(boolean): a save request that ended without a save call */
  saveRequestAck: 'diagram:save-request-ack',
  /** renderer → main(boolean): unsaved changes, for the close prompt */
  dirtyChanged: 'diagram:dirty-changed',
  /** main → renderer: "Save" was picked in the close prompt */
  closeSaveRequest: 'diagram:close-save-request',
  /** renderer → main(boolean): how that save ended */
  closeSaveResult: 'diagram:close-save-result',
  /** main → renderer(newPath): the file was renamed on disk */
  fileRenamed: 'diagram:file-renamed',
  /** invoke(url) → boolean: open a link a person clicked on a shape, in the system browser */
  openLink: 'diagram:open-link',
  /** renderer → main: draw.io's Help was picked; the shell opens the app's own help topic */
  openHelp: 'diagram:open-help',
  /**
   * invoke(message) → boolean: the tab's file did not open after all (a Visio
   * import draw.io refused); true when the shell closed the tab and shows
   * `message`, false when the editor shows it in the tab
   */
  openFailed: 'diagram:open-failed',

  // ---- commands from the menu ----
  /** main → renderer(`DiagramMenuCommand`) */
  menuCommand: 'diagram:menu-command',

  // ---- export and print ----
  /** main → renderer(`ExportFormat`): the menu's export items; the renderer asks which pages */
  exportRequest: 'diagram:export-request',
  /** invoke(`ExportImagesRequest`) → `ExportResult`: write PNG or SVG files, one per page */
  exportImages: 'diagram:export-images',
  /** invoke(`ExportPdfRequest`) → `ExportResult`: one sheet per page, made by the app */
  exportPdf: 'diagram:export-pdf',
  /** main → renderer: the menu's Print */
  printRequest: 'diagram:print-request',
  /** invoke(`PrintDiagramRequest`) → `PrintResult` */
  print: 'diagram:print',

  // ---- crash-recovery copies (decision 0061) ----
  /** invoke(`RecoveryCopyRequest`) → `RecoveryCopyResult` */
  recoveryCopy: 'diagram:recovery-copy',
  /** main → renderer: the OS is ending the session, write a copy now */
  recoveryCopyNow: 'diagram:recovery-copy-now',
  /** renderer → main: the copy asked for by `recoveryCopyNow` is written, or there was none */
  recoveryCopyNowDone: 'diagram:recovery-copy-now-done',
  /** main → renderer: the last copy was dropped ("Don't Save") and the tab stayed open; copy again */
  recoveryReset: 'diagram:recovery-reset',

  // ---- a new tab that starts with given content (a converter's result, a template) ----
  /** invoke → `DiagramSeed | null`: take the content left for this view, once */
  seedTake: 'diagram:seed-take',

  // ---- chat attachments (same shapes as the other editors; `src/main/ai-attachments.ts`) ----
  /** invoke → `AttachmentAddResult | null`: the open dialog; null when cancelled */
  filesPick: 'diagram:files-pick',
  /** invoke(paths) → `AttachmentAddResult`: dropped or pasted files */
  filesAdd: 'diagram:files-add',
  /** invoke(data, ext) → `AttachmentAddResult`: a picture pasted without a file */
  filesAddPastedImage: 'diagram:files-add-pasted-image',
  /** invoke(path, offset, maxChars) → `AttachmentReadResult` */
  filesRead: 'diagram:files-read',
  /** invoke(path) → `AttachmentImageResult` */
  filesReadImage: 'diagram:files-read-image',
  /** renderer → main(title): name an untitled diagram's tab from the first AI request */
  provisionalTitle: 'diagram:provisional-title',

  // ---- questions from the in-app MCP server (the MCP task asks; the renderer answers) ----
  /** main → renderer(`DiagramReadQuery`): "give me the read table" */
  readRequest: 'diagram:read-request',
  /** renderer → main(`DiagramReadReply`) */
  readResult: 'diagram:read-result',
  /** main → renderer(`DiagramApplyQuery`): "apply these ops as one undo step" */
  applyRequest: 'diagram:apply-request',
  /** renderer → main(`DiagramApplyReply`) */
  applyResult: 'diagram:apply-result',
  /** main → renderer: "give me the bytes a save would write now" */
  bytesRequest: 'diagram:bytes-request',
  /** renderer → main(`BytesReply`) */
  bytesResult: 'diagram:bytes-result',

  // ---- a windowless job (`--headless-export`, `src/main/headless-main.ts`) ----
  /** invoke → `DiagramHeadlessJob | null`: the job of this hidden window; null for every other view */
  headlessJob: 'diagram:headless-job',
  /** renderer → main(`DiagramHeadlessReport`): the job ended */
  headlessDone: 'diagram:headless-done',
} as const

export type DiagramChannel = (typeof DIAGRAM_CHANNELS)[keyof typeof DIAGRAM_CHANNELS]

/** Channels the shell registers for every editor. Called here, never registered (except the language getter). */
export const APP_CHANNELS = {
  getLanguage: 'app:get-language',
  languageChanged: 'app:language-changed',
  getTheme: 'app:get-theme',
  themeChanged: 'app:theme-changed',
  getAutoSaveDefault: 'app:get-auto-save-default',
  autoSaveDefaultChanged: 'app:auto-save-default-changed',
  chromePressed: 'app:chrome-pressed',
  getAiPanelPrefs: 'app:get-ai-panel-prefs',
  setAiPanelPrefs: 'app:set-ai-panel-prefs',
  aiPanelPrefsChanged: 'app:ai-panel-prefs-changed',
  openSourcePath: 'home:open-path',
} as const

/** The shared AI channels, registered once for the whole app by the docs main. Called, never registered. */
export const AI_CHANNELS = {
  getSettings: 'ai:get-settings',
  setSettings: 'ai:set-settings',
  settingsChanged: 'ai:settings-changed',
  openModelSettings: 'ai:open-model-settings',
  stream: 'ai:stream',
  streamChunk: 'ai:stream-chunk',
  streamCancel: 'ai:stream-cancel',
  webSearch: 'ai:web-search',
  readUrl: 'ai:read-url',
} as const

export type UiTheme = 'light' | 'dark' | 'system'

/** shell-wide AutoSave default; updatedAt is 0 until the user has ever set it */
export interface AutoSaveDefault {
  on: boolean
  updatedAt: number
}

// ---- open ----

/**
 * Why a file did not open. The first six are the model's reasons
 * (`DiagramOpenReason`); `unreadable` is a file that could not be read.
 */
export type DiagramOpenStatus =
  | 'ok'
  | 'unsupported'
  | 'no_original'
  | 'corrupt_image'
  | 'not_xml'
  | 'decompress_failed'
  | 'no_diagram'
  | 'unreadable'

/**
 * The diagram travels only with `ok`: a file that does not open hands the
 * renderer nothing to save.
 *
 * - `xml`: the draw.io XML to load (taken out of an SVG or PNG for those formats).
 * - `format`: the file's format; saves write it again in this format.
 * - `compressed`: the file stores its pages compressed; saves keep that.
 * - `restored`: the XML is the diagram's crash-recovery copy. `file`: the
 *   file's path stays the save target. `untitled`: the file is gone or no
 *   longer opens, so the diagram has no path and its first save asks where.
 * - `import`: the path is a file another program made (a `.vsdx`); the
 *   renderer hands `bytes` to the importer registered for it. The diagram is
 *   untitled; `title` is the tab's name.
 */
export type OpenFileResult =
  | {
      status: 'ok'
      xml: string
      format: DiagramFormat
      compressed: boolean
      restored?: 'file' | 'untitled'
    }
  | { status: 'import'; importer: DiagramImportKind; bytes: Uint8Array; title: string }
  | { status: Exclude<DiagramOpenStatus, 'ok'> }

/** Files another program made that the editor turns into a new diagram. */
export type DiagramImportKind = 'vsdx'

// ---- save ----

export type SaveMode = 'save' | 'saveAs'

/**
 * What the main process asks the renderer to save: `save`, `saveAs`, or
 * `retarget` (a tool pointed the diagram at a new path: write it there now,
 * changed or not).
 */
export type SaveRequestMode = SaveMode | 'retarget'

export interface SaveTargetRequest {
  mode: SaveRequestMode
  /** file name (no extension) offered by the save dialog of an untitled diagram */
  defaultName?: string
}

/**
 * Where a save goes. `token` names the target for the `save` call that
 * follows: the renderer makes the bytes for `format` and hands them back with
 * it. A token is used once.
 */
export type SaveTargetResult =
  | { ok: true; token: string; path: string; format: DiagramFormat }
  | { ok: true; canceled: true }
  | { ok: false; error: string }

export interface SaveDiagramRequest {
  token: string
  /** the whole file, as draw.io serialized it in the target's format */
  bytes: Uint8Array
  /**
   * an automatic save (the 30-second timer or a window blur): while the same
   * diagram is open in another pane it defers silently instead of asking to
   * overwrite that pane's bytes (decision 0036)
   */
  auto?: boolean
}

export type SaveDiagramResult =
  { ok: true; path: string } | { ok: true; canceled: true } | { ok: false; error: string }

/** A new diagram a create flow handed over, into its panel's project (spec 6). Always `.drawio`. */
export interface SaveIntoProjectRequest {
  bytes: Uint8Array
  defaultName?: string
}

/** `skipped`: no project (or the diagram has a file already), nothing written */
export type SaveIntoProjectResult =
  { ok: true; path: string } | { ok: false; skipped: true } | { ok: false; error: string }

// ---- menu ----

/**
 * Commands the shell menu sends to the editor. New and Open are the shell's
 * own; Save and Save As go through `saveRequest`, exports through
 * `exportRequest` and Print through `printRequest`.
 */
export type DiagramMenuCommand =
  'undo' | 'redo' | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'zoom-fit' | 'find'

// ---- export and print ----

export type ExportFormat = 'png' | 'svg' | 'pdf'

/** Which pages an export or print takes. */
export type ExportScope = 'all' | 'current'

/** One page, ready to write as a picture file. */
export interface ExportPageImage {
  /** 1-based position of the page in the diagram */
  number: number
  bytes: Uint8Array
}

export interface ExportImagesRequest {
  format: 'png' | 'svg'
  pages: ExportPageImage[]
  /** every page (a file per page, `<name>-p<n>`, even for one page) or the page on screen (one file) */
  scope: ExportScope
  /** file name (no extension) suggested in the dialog */
  suggestedName: string
}

/** One page for a PDF or print: a light-colored SVG and the sheet size in draw.io units (1/100 inch). */
export interface PrintPage {
  svg: string
  /** the drawing's own size in draw.io units */
  width: number
  height: number
  /** the page format the diagram sets, in draw.io units */
  pageWidth: number
  pageHeight: number
}

export interface ExportPdfRequest {
  pages: PrintPage[]
  suggestedName: string
}

export interface PrintDiagramRequest {
  pages: PrintPage[]
  /** the diagram's name, for the print job */
  title?: string
}

export type ExportResult =
  { ok: true; paths: string[] } | { ok: true; canceled: true } | { ok: false; error: string }

// ---- a windowless job (the command line's convert, apply and create) ----

/** How a windowless batch treats a rejected op (the planner's modes). */
export type HeadlessBatchMode = 'all-or-nothing' | 'best-effort' | 'stop-on-error'

/**
 * What a hidden window does with the file it opened: `export` makes pictures
 * or the PDF's pages (`page`: one 1-based page, else every page); `write`
 * runs `ops` on the diagram (`page`: the 1-based page ops without `page` work
 * on) and serializes it in `format`.
 */
export type DiagramHeadlessJob =
  | { kind: 'export'; format: ExportFormat; page?: number }
  | {
      kind: 'write'
      format: DiagramFormat
      ops: unknown[]
      page?: number
      mode: HeadlessBatchMode
    }

/** A batch as a windowless job reports it: the planner's outcome without the diagram state. */
export interface HeadlessBatchOutcome {
  status: 'ok' | 'partial' | 'rejected'
  changed: boolean
  results: DiagramOpResult[]
  created: string[]
}

/**
 * The end of a windowless job. `bytes` of a `write` is null when nothing is
 * to be written (a rejected batch, or one that changed nothing in a file of
 * the same format).
 */
export type DiagramHeadlessReport =
  | { ok: false; error: string }
  | { ok: true; kind: 'images'; format: 'png' | 'svg'; pages: ExportPageImage[] }
  | { ok: true; kind: 'pdf'; pages: PrintPage[] }
  | { ok: true; kind: 'write'; bytes: Uint8Array | null; batch: HeadlessBatchOutcome | null }

/** A cancelled job is the user closing the system dialog: an outcome, not a failure. */
export type PrintResult = { ok: true } | { ok: true; canceled: true } | { ok: false; error: string }

// ---- crash-recovery copies ----

export interface RecoveryCopyRequest {
  /** what a save would write now, in the diagram's format */
  bytes: Uint8Array
  /** an untitled diagram's name for the copy list */
  name?: string
}

/** `superseded`: a later copy or a save won; `skipped`: nothing unsaved, or a view without a diagram */
export type RecoveryCopyResult = 'written' | 'superseded' | 'skipped'

// ---- a new tab that starts with given content ----

/** draw.io XML for a new, unsaved diagram (`.drawio` when saved). */
export interface DiagramSeed {
  xml: string
}

// ---- chat attachments (same shapes as the other editors) ----

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

export interface WebSearchResult {
  answer?: string
  results: Array<{ title: string; url: string; snippet: string }>
  method: string
  /** failure reason when method === 'error' */
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

// ---- questions from the in-app MCP server ----

/**
 * Which read table: `page` names one page (id or name); `current` asks for the
 * page on screen with the ids selected there; neither asks for every page.
 */
export interface DiagramReadQuery {
  id: string
  /** a page id or name */
  page?: string
  /** the page on screen, when `page` is left out */
  current?: boolean
}

/** `read` (one page's table as values) comes with a one-page read, for the in-app MCP server's object */
export type DiagramReadReply =
  { id: string; text: string; read?: DiagramReadResult } | { id: string; error: string }

export interface DiagramApplyQuery {
  id: string
  ops: unknown[]
}

export type DiagramApplyReply =
  { id: string; ok: true; result: unknown } | { id: string; ok: false; error: string }

export type BytesReply = { bytes: Uint8Array } | { error: string }

// ---- what the shell reads about a tab ----

/**
 * What the shell keeps about a diagram tab to find it again and to decide
 * that opening a path again goes to this tab (spec 3.4, 3.5).
 *
 * - `sourcePath`: the file the tab came from. For a diagram file it is the
 *   save target; for an imported file (a `.vsdx`) it is that file, which the
 *   tab never writes. Null for a new diagram.
 * - `untitled`: the diagram has no save target yet (a new or imported diagram).
 * - `title`: the tab's name (an imported file's name without its extension).
 * - `imported`: set for a diagram made from another program's file.
 */
export interface DiagramTabIdentity {
  sourcePath: string | null
  untitled: boolean
  title: string
  imported?: DiagramImportKind
}

// ---- preload API (window.diagramApi) ----

export interface DiagramCoreApi {
  consumePending(): Promise<string | null>
  openFile(path: string): Promise<OpenFileResult>
  saveTarget(request: SaveTargetRequest): Promise<SaveTargetResult>
  save(request: SaveDiagramRequest): Promise<SaveDiagramResult>
  saveIntoProject(request: SaveIntoProjectRequest): Promise<SaveIntoProjectResult>
  setDirty(dirty: boolean): void
  onSaveRequest(handler: (mode: SaveRequestMode) => void): () => void
  sendSaveRequestAck(ok: boolean): void
  onCloseSaveRequest(handler: () => void): () => void
  sendCloseSaveResult(ok: boolean): void
  onFileRenamed(handler: (newPath: string) => void): () => void
  /** a link a person clicked on a shape; false when the address is not one that opens */
  openLink(url: string): Promise<boolean>
  openHelp(): void
  /** the file did not open: ask the shell to close the tab and show why; false = show it here */
  openFailed(message: string): Promise<boolean>
  onMenuCommand(handler: (command: DiagramMenuCommand) => void): () => void
  getLanguage(): Promise<Lang>
  onLanguageChanged(handler: (lang: Lang) => void): () => void
  getTheme(): Promise<UiTheme>
  onThemeChanged(handler: (theme: UiTheme) => void): () => void
  getAutoSaveDefault(): Promise<AutoSaveDefault>
  onAutoSaveDefaultChanged(handler: (value: AutoSaveDefault) => void): () => void
  onChromePressed(handler: () => void): () => void
  takeSeed(): Promise<DiagramSeed | null>
}

export interface DiagramExportApi {
  onExportRequest(handler: (format: ExportFormat) => void): () => void
  onPrintRequest(handler: () => void): () => void
  exportImages(request: ExportImagesRequest): Promise<ExportResult>
  exportPdf(request: ExportPdfRequest): Promise<ExportResult>
  print(request: PrintDiagramRequest): Promise<PrintResult>
}

export interface DiagramRecoveryApi {
  writeRecoveryCopy(request: RecoveryCopyRequest): Promise<RecoveryCopyResult>
  onRecoveryCopyNow(handler: () => void): () => void
  sendRecoveryCopyNowDone(): void
  onRecoveryReset(handler: () => void): () => void
}

/** Only the hidden window of a windowless job calls these. */
export interface DiagramHeadlessApi {
  headlessJob(): Promise<DiagramHeadlessJob | null>
  headlessDone(report: DiagramHeadlessReport): void
}

export interface DiagramQueryApi {
  onReadRequest(handler: (query: DiagramReadQuery) => void): () => void
  sendReadResult(reply: DiagramReadReply): void
  onApplyRequest(handler: (query: DiagramApplyQuery) => void): () => void
  sendApplyResult(reply: DiagramApplyReply): void
  onBytesRequest(handler: () => void): () => void
  sendBytesResult(reply: BytesReply): void
}

/** The AI panel's bridge. A preload from an older build may lack any of it. */
export interface DiagramAiApi {
  pickAttachments(): Promise<AttachmentAddResult | null>
  addAttachmentPaths(paths: string[]): Promise<AttachmentAddResult>
  addPastedImage(data: ArrayBuffer, ext: string): Promise<AttachmentAddResult>
  readAttachment(path: string, offset: number, maxChars: number): Promise<AttachmentReadResult>
  readAttachmentImage(path: string): Promise<AttachmentImageResult>
  /** local path of a dropped / pasted File, '' when it has none */
  getPathForFile(file: File): string
  /** name an untitled diagram's tab from the first AI request */
  setProvisionalTitle(title: string): void
  /** open any shell-routed document path (a citation in an AI answer) */
  openSourcePath(path: string): Promise<void>
  getAiPanelPrefs(): Promise<AiPanelPrefs>
  setAiPanelPrefs(patch: Partial<AiPanelPrefs>): Promise<AiPanelPrefs>
  onAiPanelPrefsChanged(handler: (prefs: AiPanelPrefs) => void): () => void
  getAiSettings(): Promise<AiSettings>
  setAiSettings(settings: AiSettings): Promise<void>
  onAiSettingsChanged(handler: () => void): () => void
  /** shell only: switch to Home and open Settings › AI Model (rejects in standalone) */
  openAiModelSettings(): Promise<void>
  subscription: DiagramSubscriptionApi
  aiStream(request: AiStreamRequest): Promise<void>
  aiStreamCancel(requestId: string): Promise<void>
  onAiStream(handler: (chunk: AiStreamChunk) => void): () => void
  webSearch(query: string, maxResults?: number): Promise<WebSearchResult>
  /** Read one web page as text (the shared ai:read-url handler), paged by character offset */
  readUrl(url: string, offset?: number): Promise<ReadUrlResult>
}

export type DiagramApi = DiagramCoreApi &
  DiagramExportApi &
  DiagramRecoveryApi &
  DiagramQueryApi &
  DiagramHeadlessApi &
  DiagramAiApi

export type { DiagramNotices }
