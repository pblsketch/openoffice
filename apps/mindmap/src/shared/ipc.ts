/**
 * The contract between the mind map renderer, its preload and the main
 * process, for the whole feature. Later work adds handlers and callers, not
 * names: every channel the editor will ever own is listed here once.
 *
 * Every channel of this editor starts with `mindmap:`. The main processes of
 * all editors run in one process, so a name may be registered only once.
 * Channels owned by the shell (`app:*`) and the shared AI channels (`ai:*`)
 * are listed separately below; this editor never registers those, it only
 * calls them.
 */
import type { AiPanelPrefs } from '@genoffice/ui'
import type { Lang } from '@genoffice/i18n'
import type { AiSettings, AiStreamChunk, AiStreamRequest } from '@genoffice/ai-provider'
import type { MindmapSubscriptionApi } from './subscription-api'

export const MINDMAP_CHANNELS = {
  // ---- open and save (implemented) ----
  /** invoke → `string | null`: the path queued for this view, null for a new map */
  consumePending: 'mindmap:consume-pending',
  /** invoke(path) → `OpenFileResult`: the bytes of a granted path, with how the file opens */
  openFile: 'mindmap:open-file',
  /** invoke(`SaveMindmapRequest`) → `SaveMindmapResult` */
  save: 'mindmap:save',
  /** main → renderer(`SaveMode`): the menu's Save / Save As */
  saveRequest: 'mindmap:save-request',
  /** renderer → main(boolean): a save request that ended without a save call */
  saveRequestAck: 'mindmap:save-request-ack',
  /** renderer → main(boolean): unsaved changes, for the close prompt */
  dirtyChanged: 'mindmap:dirty-changed',
  /** main → renderer: "Save" was picked in the close prompt */
  closeSaveRequest: 'mindmap:close-save-request',
  /** renderer → main(boolean): how that save ended */
  closeSaveResult: 'mindmap:close-save-result',
  /** main → renderer(newPath): the file was renamed on disk */
  fileRenamed: 'mindmap:file-renamed',
  /** invoke(url) → boolean: open a topic's web link in the system browser */
  openLink: 'mindmap:open-link',

  // ---- commands from the menu (implemented; the shell menu of T11 sends them) ----
  /** main → renderer(`MindmapMenuCommand`) */
  menuCommand: 'mindmap:menu-command',

  // ---- export and print (T10) ----
  /** main → renderer(`ExportFormat`): the menu's export items. T10 handles it in the renderer */
  exportRequest: 'mindmap:export-request',
  /** invoke(`ExportPngRequest`) → `ExportResult`. T10 */
  exportPng: 'mindmap:export-png',
  /** invoke(`ExportPdfRequest`) → `ExportResult`. T10 */
  exportPdf: 'mindmap:export-pdf',
  /** invoke(`ExportMarkdownRequest`) → `ExportResult`. T10 */
  exportMarkdown: 'mindmap:export-markdown',
  /** main → renderer: the menu's Print. T10 handles it in the renderer */
  printRequest: 'mindmap:print-request',
  /** invoke(`PrintMindmapRequest`) → `PrintResult`. T10 */
  print: 'mindmap:print',

  // ---- chat attachments (T12) ----
  /** invoke → `AttachmentAddResult | null`. T12 */
  filesPick: 'mindmap:files-pick',
  /** invoke(paths) → `AttachmentAddResult`. T12 */
  filesAdd: 'mindmap:files-add',
  /** invoke(bytes, ext) → `AttachmentAddResult`. T12 */
  filesAddPastedImage: 'mindmap:files-add-pasted-image',
  /** invoke(path, offset, maxChars) → `AttachmentReadResult`. T12 */
  filesRead: 'mindmap:files-read',
  /** invoke(path) → `AttachmentImageResult`. T12 */
  filesReadImage: 'mindmap:files-read-image',
  /** renderer → main(title): name an untitled map's tab from the first AI request. T12 */
  provisionalTitle: 'mindmap:provisional-title',

  // ---- questions from the in-app MCP server (T13 sends them; the renderer already answers) ----
  /** main → renderer: "give me the current outline" */
  outlineRequest: 'mindmap:outline-request',
  /** renderer → main(`OutlineReply`). T13 receives it */
  outlineResult: 'mindmap:outline-result',
  /** main → renderer: "give me the current bytes" */
  bytesRequest: 'mindmap:bytes-request',
  /** renderer → main(`BytesReply`). T13 receives it */
  bytesResult: 'mindmap:bytes-result',

  // ---- a generation request handed over by the shell (T16) ----
  /** invoke → `MindmapHandoff | null`: take the request left for this view, once. T16 */
  handoffTake: 'mindmap:handoff-take',
  /** renderer → main(`HandoffRunStarted`): a run with handed-over material started. T16 */
  handoffRunStarted: 'mindmap:handoff-run-started',

  // ---- a new tab that starts with given content (T17) ----
  /** invoke → `MindmapSeed | null`: take the content left for this view, once. T17 */
  seedTake: 'mindmap:seed-take',

  // ---- "make another document from this one" (T18) ----
  /** renderer → main: the toolbar button; the shell opens its make window with this map */
  makeFromDocument: 'mindmap:make-from-document',

  // ---- crash-recovery copies (spec "work is not lost", stage 1) ----
  /** invoke(`RecoveryCopyRequest`) → `RecoveryCopyResult`: keep a copy of the unsaved map in the app data folder */
  recoveryCopy: 'mindmap:recovery-copy',
  /** main → renderer: the OS is ending the session, write a copy now */
  recoveryCopyNow: 'mindmap:recovery-copy-now',
  /** renderer → main: the copy asked for by `recoveryCopyNow` is written, or there was none to write */
  recoveryCopyNowDone: 'mindmap:recovery-copy-now-done',
  /** main → renderer: the last copy was dropped ("Don't Save") and the tab stayed open; copy again */
  recoveryReset: 'mindmap:recovery-reset',
} as const

/** Channels the shell registers for every editor. Called here, never registered (except the language getter, see the main module). */
export const APP_CHANNELS = {
  getLanguage: 'app:get-language',
  languageChanged: 'app:language-changed',
  getTheme: 'app:get-theme',
  themeChanged: 'app:theme-changed',
  getAutoSaveDefault: 'app:get-auto-save-default',
  autoSaveDefaultChanged: 'app:auto-save-default-changed',
  getAiPanelPrefs: 'app:get-ai-panel-prefs',
  setAiPanelPrefs: 'app:set-ai-panel-prefs',
  aiPanelPrefsChanged: 'app:ai-panel-prefs-changed',
  chromePressed: 'app:chrome-pressed',
  openSourcePath: 'home:open-path',
} as const

/** The shared AI channels, registered once for the whole app by the docs main. Pass-through only. T12 */
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
  imageSearch: 'ai:image-search',
} as const

export type UiTheme = 'light' | 'dark' | 'system'

/** shell-wide AutoSave default; updatedAt is 0 until the user has ever set it */
export interface AutoSaveDefault {
  on: boolean
  updatedAt: number
}

// ---- open ----

/**
 * How a file opened, as the engine reports it. Only `ok` leads to a map; every
 * other value is shown as a message and nothing is ever written to that file.
 */
export type MindmapOpenStatus = 'ok' | 'legacy-format' | 'encrypted' | 'unreadable' | 'rejected'

/**
 * The bytes travel only with `ok`: a file that does not open hands the renderer nothing to save.
 *
 * `restored`: the bytes are the map's crash-recovery copy, not the file. The
 * map opens with unsaved changes. `file`: the file's path stays the save
 * target. `untitled`: the file is gone or no longer opens, so the map has no
 * path and its first save asks where (offering the file's old path).
 */
export type OpenFileResult =
  | { status: 'ok'; bytes: Uint8Array; restored?: 'file' | 'untitled' }
  | { status: Exclude<MindmapOpenStatus, 'ok'> }

// ---- save ----

export type SaveMode = 'save' | 'saveAs'

export interface SaveMindmapRequest {
  /** the whole `.xmind` file, as the engine produced it */
  bytes: Uint8Array
  mode: SaveMode
  /** file name (no extension) offered by the save dialog of an untitled map */
  defaultName?: string
  /**
   * an automatic save (the 30-second timer or a window blur): while the same
   * map is open in another pane it defers silently instead of asking to
   * overwrite that pane's bytes (decision 0036)
   */
  auto?: boolean
}

export type SaveMindmapResult =
  { ok: true; path: string } | { ok: true; canceled: true } | { ok: false; error: string }

// ---- menu ----

/**
 * Commands the menu sends to the map. New and Open are the shell's own (it
 * opens tabs); Save and Save As go through `saveRequest`, the exports through
 * `exportRequest` and Print through `printRequest`, so the main process can
 * wait for their outcome.
 */
export type MindmapMenuCommand =
  | 'undo'
  | 'redo'
  | 'add-child'
  | 'add-sibling'
  | 'fold-all'
  | 'unfold-all'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'zoom-fit'

// ---- export and print (T10) ----

export type ExportFormat = 'png' | 'pdf' | 'markdown'

export interface ExportPngRequest {
  /** the picture of the current sheet */
  bytes: Uint8Array
  /** file name (no extension) suggested in the dialog */
  suggestedName: string
}

export interface ExportPdfRequest {
  /** self-contained print HTML; the main process prints it in a hidden window */
  html: string
  suggestedName: string
}

export interface ExportMarkdownRequest {
  /** the outline text */
  text: string
  suggestedName: string
}

export type ExportResult =
  { ok: true; path: string } | { ok: true; canceled: true } | { ok: false; error: string }

export interface PrintMindmapRequest {
  /** self-contained print HTML */
  html: string
}

/** A cancelled job is the user closing the system dialog: an outcome, not a failure. */
export type PrintResult = { ok: true } | { ok: true; canceled: true } | { ok: false; error: string }

// ---- chat attachments (T12; same shapes as the other editors) ----

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

export interface ImageSearchResult {
  images: Array<{ title?: string; imageUrl: string; width?: number; height?: number }>
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

// ---- questions from the in-app MCP server (T13) ----

/** The map as outline text, unsaved edits included. */
export type OutlineReply = { text: string } | { error: string }

/** The map as the file a save would write, unsaved edits included. Nothing is written. */
export type BytesReply = { bytes: Uint8Array } | { error: string }

// ---- generation handed over by the shell (T16) ----

/** One request left by the shell for a new map tab: what to make it from, and what the user asked for. */
export interface MindmapHandoff {
  /** identifies the request in `handoffRunStarted` */
  id: string
  /** files to attach to the AI panel, in the order the user arranged them */
  sourcePaths: string[]
  /** what the user wrote, or the default request when they wrote nothing */
  prompt: string
}

export interface HandoffRunStarted {
  id: string
  /** how many of the handed-over files were still attached when the run started */
  attachedSources: number
  /** those files' paths: the main process records which of the handed-over files the run used */
  attachedPaths: string[]
}

// ---- a new tab that starts with given content (T17) ----

/** Content for a new, unsaved map: outline text in the form the engine reads. */
export interface MindmapOutlineSeed {
  /** the sheet titles come from its `# ` headings */
  outline: string
}

/** A byte copy of a map file (a skill's template, spec 5.7), opened as a new, unsaved map */
export interface MindmapCopySeed {
  bytes: Uint8Array
}

export type MindmapSeed = MindmapOutlineSeed | MindmapCopySeed

// ---- preload API (window.mindmapApi) ----

/** Open, save, links, menu commands and the shell's settings: what the editor itself needs. */
export interface MindmapCoreApi {
  /** Take the path pending for this view (queued at tab creation); null = a new untitled map */
  consumePending(): Promise<string | null>
  /** Read a granted file and learn how it opens. Only an `ok` file comes with bytes */
  openFile(path: string): Promise<OpenFileResult>
  /**
   * Write the map. With a granted path the write is atomic (tmp + rename);
   * untitled maps and mode 'saveAs' go through a main-process save dialog first.
   */
  save(request: SaveMindmapRequest): Promise<SaveMindmapResult>
  /** Mirror unsaved-changes state to the main process; drives the save prompt before closing */
  setDirty(dirty: boolean): void
  /** Shell menu Save / Save As → the renderer produces the bytes and calls save() */
  onSaveRequest(handler: (mode: SaveMode) => void): () => void
  /** Resolves a menu-save waiter when the save ended without ever invoking save() */
  sendSaveRequestAck(ok: boolean): void
  /** "Save" in the close prompt → the renderer saves and replies via sendCloseSaveResult */
  onCloseSaveRequest(handler: () => void): () => void
  sendCloseSaveResult(ok: boolean): void
  /** The file was renamed on disk; the renderer syncs its display path */
  onFileRenamed(handler: (newPath: string) => void): () => void
  /** Ask the main process to open a web link; false when the address is not one it opens */
  openLink(url: string): Promise<boolean>
  /** Commands from the menu (undo, redo, zoom, …) */
  onMenuCommand(handler: (command: MindmapMenuCommand) => void): () => void
  getLanguage(): Promise<Lang>
  onLanguageChanged(handler: (lang: Lang) => void): () => void
  getTheme(): Promise<UiTheme>
  onThemeChanged(handler: (theme: UiTheme) => void): () => void
  getAutoSaveDefault(): Promise<AutoSaveDefault>
  onAutoSaveDefaultChanged(handler: (value: AutoSaveDefault) => void): () => void
  /** press on the shell chrome (the tab strip is another view): dismiss open popovers */
  onChromePressed(handler: () => void): () => void
}

/** Export and print. The renderer side and the main handlers are T10's. */
export interface MindmapExportApi {
  onExportRequest(handler: (format: ExportFormat) => void): () => void
  onPrintRequest(handler: () => void): () => void
  exportPng(request: ExportPngRequest): Promise<ExportResult>
  exportPdf(request: ExportPdfRequest): Promise<ExportResult>
  exportMarkdown(request: ExportMarkdownRequest): Promise<ExportResult>
  print(request: PrintMindmapRequest): Promise<PrintResult>
}

/** The AI panel's bridge. The panel and the attachment handlers are T12's. */
export interface MindmapAiApi {
  pickAttachments(): Promise<AttachmentAddResult | null>
  addAttachmentPaths(paths: string[]): Promise<AttachmentAddResult>
  addPastedImage(data: ArrayBuffer, ext: string): Promise<AttachmentAddResult>
  readAttachment(path: string, offset: number, maxChars: number): Promise<AttachmentReadResult>
  readAttachmentImage(path: string): Promise<AttachmentImageResult>
  /** local path of a dropped / pasted File, '' when it has none */
  getPathForFile(file: File): string
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
  subscription: MindmapSubscriptionApi
  aiStream(request: AiStreamRequest): Promise<void>
  aiStreamCancel(requestId: string): Promise<void>
  onAiStream(handler: (chunk: AiStreamChunk) => void): () => void
  webSearch(query: string, maxResults?: number): Promise<WebSearchResult>
  /** Read one web page as text (the shared ai:read-url handler), paged by character offset */
  readUrl(url: string, offset?: number): Promise<ReadUrlResult>
  imageSearch(query: string, maxResults?: number): Promise<ImageSearchResult>
}

/** Answers to the in-app MCP server. The renderer answers already; T13 asks from the main process. */
export interface MindmapQueryApi {
  onOutlineRequest(handler: () => void): () => void
  sendOutlineResult(reply: OutlineReply): void
  onBytesRequest(handler: () => void): () => void
  sendBytesResult(reply: BytesReply): void
}

/** A generation request handed over by the shell. T16 */
export interface MindmapHandoffApi {
  takeHandoff(): Promise<MindmapHandoff | null>
  notifyHandoffRunStarted(report: HandoffRunStarted): void
}

/** Content for a new tab. T17 */
export interface MindmapSeedApi {
  takeSeed(): Promise<MindmapSeed | null>
}

/** "Make another document from this one". T18 */
export interface MindmapMakeFromApi {
  /** ask the shell to open its make window with this map as the material */
  makeFromDocument(): void
}

// ---- crash-recovery copies ----

export interface RecoveryCopyRequest {
  /** the whole `.xmind` file, as a save would write it now */
  bytes: Uint8Array
  /** a name for an untitled map's copy when the shell gives none (its central topic) */
  name?: string
}

/** `skipped`: nothing to keep (no unsaved changes, or a map that did not open); `superseded`: a save or a "Don't Save" came first */
export type RecoveryCopyResult = 'written' | 'superseded' | 'skipped'

/** Crash-recovery copies of the open map: written by the renderer, kept by the main process. */
export interface MindmapRecoveryApi {
  writeRecoveryCopy(request: RecoveryCopyRequest): Promise<RecoveryCopyResult>
  /** the OS is ending the session: write a copy now, then call `sendRecoveryCopyNowDone` */
  onRecoveryCopyNow(handler: () => void): () => void
  sendRecoveryCopyNowDone(): void
  /** the last copy was dropped and the tab stayed open: the next tick copies the map again */
  onRecoveryReset(handler: () => void): () => void
}

/** API exposed by preload to the renderer (window.mindmapApi) */
export type MindmapApi = MindmapCoreApi &
  MindmapExportApi &
  MindmapAiApi &
  MindmapQueryApi &
  MindmapHandoffApi &
  MindmapSeedApi &
  MindmapMakeFromApi &
  MindmapRecoveryApi
