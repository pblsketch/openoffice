/**
 * The contract between the EPUB renderer, its preload and the main process.
 *
 * Every channel of this editor starts with `epub:`. The main processes of all
 * editors run in one process, so a name may be registered only once. Channels
 * owned by the shell (`app:*`) and the shared AI channels (`ai:*`) are listed
 * separately below; this editor never registers those, it only calls them.
 *
 * The book lives in the main process: one copy of its bytes per view, the
 * authoritative text of every chapter read so far and the range replacements
 * made to it. The renderer reads chapters and pictures from here, sends its
 * edits here and asks for saves; it never holds the zip.
 *
 * Later tasks add channels and fields here; they do not rename or change what
 * is listed.
 */
import type { AiPanelPrefs } from '@genoffice/ui'
import type { Lang } from '@genoffice/i18n'
import type { AiSettings, AiStreamChunk, AiStreamRequest } from '@genoffice/ai-provider'
import type {
  BlockEdit,
  BlockKind,
  EditRefusal,
  EpubLayout,
  EpubMetadata,
  EpubRefusalReason,
  EpubSkippedChapter,
  EpubTocEntry,
  EpubTranslationOutputKind,
  EpubTranslationReport,
  EpubTranslationUnit,
  RangeReplacement,
} from '@genoffice/epub-engine'
import type {
  JobKind,
  JobRecordInput,
  JobStatus,
  TranslationBlockEntry,
  TranslationBlockInput,
} from '@genoffice/pdf-structure/store'
import type { EpubSubscriptionApi } from './subscription-api'

export const EPUB_CHANNELS = {
  // ---- open and read ----
  /** invoke → `string | null`: the path queued for this view */
  consumePending: 'epub:consume-pending',
  /** invoke(path) → `EpubOpenFileResult`: open a granted path; the book stays in the main process */
  openFile: 'epub:open-file',
  /** invoke(spineIndex) → `EpubChapterResult`: one chapter's text as it is now (unsaved edits included) */
  readChapter: 'epub:read-chapter',
  /** invoke(url) → boolean: open an outside link in the system browser (safe addresses only) */
  openLink: 'epub:open-link',

  // ---- edit ----
  /** invoke(`EpubApplyEditsRequest`) → `EpubEditResult`: engine block edits on one chapter, all or nothing */
  applyEdits: 'epub:apply-edits',
  /** invoke(`EpubReplaceRangesRequest`) → `EpubEditResult`: range replacements on one chapter (undo, redo, typing) */
  replaceRanges: 'epub:replace-ranges',
  /** invoke(boolean) → boolean: this tab's book translation runs (true) or ended (false); edits are refused while on */
  setTranslationLock: 'epub:set-translation-lock',

  // ---- save and close ----
  /** invoke(`EpubSaveRequest`) → `EpubSaveResult` */
  save: 'epub:save',
  /** main → renderer(`SaveMode`): the menu's Save / Save As; the renderer sends what it holds, then calls save */
  saveRequest: 'epub:save-request',
  /** renderer → main(boolean): a save request that ended without a save call */
  saveRequestAck: 'epub:save-request-ack',
  /** renderer → main(boolean): the renderer holds edits it has not sent yet */
  dirtyChanged: 'epub:dirty-changed',
  /** main → renderer: "Save" was picked in the close prompt */
  closeSaveRequest: 'epub:close-save-request',
  /** renderer → main(boolean): how that save ended */
  closeSaveResult: 'epub:close-save-result',
  /** main → renderer(newPath): the file was renamed on disk */
  fileRenamed: 'epub:file-renamed',

  // ---- commands from the menu ----
  /** main → renderer(`EpubMenuCommand`) */
  menuCommand: 'epub:menu-command',

  // ---- reading position and view settings (app data folder, never the book) ----
  /** invoke → `EpubReadingState`: where this book was left, and the view settings */
  getReadingState: 'epub:get-reading-state',
  /** renderer → main(`EpubReadPosition`): remember where this book is being read */
  setReadPosition: 'epub:set-read-position',
  /** invoke(`Partial<EpubViewPrefs>`) → `EpubViewPrefs`: change the view settings of every book */
  setViewPrefs: 'epub:set-view-prefs',
  /** main → renderer(`EpubViewPrefs`): the view settings changed (in any EPUB tab) */
  viewPrefsChanged: 'epub:view-prefs-changed',

  // ---- book translation ----
  /** invoke → `EpubOutcome<{ docHash }>`: the store key of the saved bytes */
  documentHash: 'epub:document-hash',
  /** invoke(`EpubTranslationUnitsRequest`) → `EpubOutcome<EpubTranslationUnitsResult>` (saved bytes) */
  translationUnits: 'epub:translation-units',
  /** invoke(`EpubPickResultPathRequest`) → `string | null`: the save dialog for a result book */
  pickResultPath: 'epub:pick-result-path',
  /** invoke(`EpubPickResultPathRequest`) → `EpubPickResultTarget`: the same dialog, saying why a pick was refused */
  pickResultTarget: 'epub:pick-result-target',
  /** invoke(path) → `EpubResultPathCheck`: whether a result may be written there */
  checkResultPath: 'epub:check-result-path',
  /** invoke(`EpubWriteTranslatedRequest`) → `EpubOutcome<EpubWriteTranslatedResult>` */
  writeTranslated: 'epub:write-translated',

  // ---- the result store (`<userData>/pdf-store`), for this view's book only ----
  /** invoke(docHash) → `EpubOutcome<{ langs }>` */
  storeTranslations: 'epub:store-translations',
  /** invoke(docHash, lang) → `EpubOutcome<{ translation }>` */
  storeTranslation: 'epub:store-translation',
  /** invoke(docHash) → `EpubOutcome<{ jobs }>`: jobs not complete (the resume offer) */
  storeUnfinishedJobs: 'epub:store-unfinished-jobs',
  /** invoke(`EpubStoreWriteRequest`) → `EpubOutcome<EpubStoreWriteResult>` */
  storeWrite: 'epub:store-write',

  // ---- chat attachments ----
  /** invoke → `AttachmentAddResult | null` */
  filesPick: 'epub:files-pick',
  /** invoke(paths) → `AttachmentAddResult` */
  filesAdd: 'epub:files-add',
  /** invoke(bytes, ext) → `AttachmentAddResult` */
  filesAddPastedImage: 'epub:files-add-pasted-image',
  /** invoke(path, offset, maxChars) → `AttachmentReadResult` */
  filesRead: 'epub:files-read',
  /** invoke(path) → `AttachmentImageResult` */
  filesReadImage: 'epub:files-read-image',
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

/** The shared AI channels, registered once for the whole app by the docs main. Pass-through only. */
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

/** The address scheme the book's pictures, styles and fonts are served from. */
export const EPUB_ASSET_SCHEME = 'epub-asset'

export type UiTheme = 'light' | 'dark' | 'system'

/** shell-wide AutoSave default; updatedAt is 0 until the user has ever set it */
export interface AutoSaveDefault {
  on: boolean
  updatedAt: number
}

// ---- outcomes ----

export type EpubErrorCode =
  /** the view has no such grant: not its file, not its document hash, not a picked target */
  | 'not-granted'
  /** the request is malformed */
  | 'invalid-request'
  /** the view has no open book */
  | 'not-open'
  /** this tab's book translation runs: edits wait until it ends */
  | 'locked'
  /** the book or the chapter cannot be edited (`EpubReadOnlyReason`) */
  | 'read-only'
  /** the chapter changed since the version the request was made against */
  | 'stale'
  /** the engine refused (an edit, a save, a result book); `refusal` / `message` say why */
  | 'refused'
  /** the path may not take a result book (`EpubResultPathRefusal`) */
  | 'invalid-target'
  | 'store-write-failed'
  | 'failed'

export interface EpubFailure {
  ok: false
  error: EpubErrorCode
  /** English, for the log; not for the screen */
  message?: string
}

export type EpubOutcome<T extends object = object> = ({ ok: true } & T) | EpubFailure

// ---- open ----

/**
 * Why a book, or one chapter of it, is read only (spec §3):
 * - `fixed-layout-book`: the whole book is pre-paginated
 * - `fixed-layout-chapter`: this spine item is pre-paginated
 * - `broken-chapter`: the chapter is not well-formed XML (or not valid in its encoding)
 */
export type EpubReadOnlyReason = 'fixed-layout-book' | 'fixed-layout-chapter' | 'broken-chapter'

export interface EpubSpineItemInfo {
  index: number
  idref: string
  /** zip entry path of the chapter */
  path: string
  mediaType: string
  /** false for `linear="no"`: skipped in the reading flow */
  linear: boolean
  properties: string[]
  layout: EpubLayout | null
  /** read only because of fixed layout (the book's or this item's) */
  fixedLayout: boolean
}

export interface EpubManifestItemInfo {
  id: string
  href: string
  /** zip entry path; null when the href has a scheme */
  path: string | null
  mediaType: string
  properties: string[]
}

/** What the renderer learns about an opened book. Plain data only. */
export interface EpubBookSummary {
  opfPath: string
  version: '2' | '3'
  metadata: EpubMetadata
  manifest: EpubManifestItemInfo[]
  spine: EpubSpineItemInfo[]
  pageProgressionDirection: 'ltr' | 'rtl' | 'default' | null
  toc: { source: 'nav' | 'ncx' | 'spine'; entries: EpubTocEntry[] }
  /** the whole book is pre-paginated: editing, AI editing, replacing and translating are off */
  fixedLayout: boolean
  verticalWriting: boolean
}

export type EpubOpenFileResult =
  | {
      status: 'ok'
      book: EpubBookSummary
      /**
       * Base address of this view's book entries, with a trailing slash:
       * `epubAssetUrl(assetBase, path)` names an entry. Valid while the book
       * is open in this view and only there.
       */
      assetBase: string
      /** the store key of the opened bytes (already usable on the `epub:store-*` channels) */
      docHash: string
      /** `fixed-layout-book` when the whole book is read only, else null (chapters say their own) */
      readOnly: EpubReadOnlyReason | null
    }
  /**
   * Not opened; nothing is ever written for this view. The screen text per
   * reason is in spec §3; `unreadable` is a file that could not be read at all.
   */
  | { status: 'refused'; reason: EpubRefusalReason | 'unreadable' }

// ---- chapters ----

/** An editable block of a chapter, with its source ranges in the chapter's current text. */
export interface EpubBlockInfo {
  /** engine id, stable while the chapter stays open (edits keep the ids of untouched blocks) */
  id: string
  kind: BlockKind
  /** qualified tag name as written */
  tag: string
  /** p, h1–h6, li, blockquote, div: takes every edit; td, th, figcaption, dt, dd: text edits only */
  flowing: boolean
  outer: { start: number; end: number }
  inner: { start: number; end: number }
}

interface EpubChapterBase {
  spineIndex: number
  path: string
  /** the chapter's current text: the stored text with every unsaved edit applied */
  source: string
  /** goes up with every change of `source`; range replacements are made against one version */
  version: number
}

export type EpubChapterResult =
  | ({ ok: true } & EpubChapterBase & {
        broken: false
        blocks: EpubBlockInfo[]
        /** why the chapter cannot be edited; null when it can */
        readOnly: EpubReadOnlyReason | null
      })
  | ({ ok: true } & EpubChapterBase & {
        /** not well-formed: drawn with an HTML parser, never edited, saved and translated as it is */
        broken: true
        /** English, for the log */
        error: string
        readOnly: 'broken-chapter'
      })
  | EpubFailure

// ---- edits ----

export interface EpubApplyEditsRequest {
  spineIndex: number
  /** applied in order, all or nothing; later edits see the blocks as the earlier ones left them */
  edits: BlockEdit[]
}

export interface EpubReplaceRangesRequest {
  spineIndex: number
  /** the `version` the replacements were made against */
  version: number
  /** against the chapter's current text; the result must stay well-formed */
  replacements: RangeReplacement[]
}

export type EpubEditResult =
  | {
      ok: true
      spineIndex: number
      path: string
      /** the chapter's text after the edit */
      source: string
      version: number
      blocks: EpubBlockInfo[]
      /** ids of the blocks the edit created */
      created: string[]
      /** the replacements this edit made, against the text before it */
      replacements: RangeReplacement[]
      /** the replacements that undo this edit, against the text after it */
      inverse: RangeReplacement[]
      /** the book now differs from the saved file */
      dirty: boolean
    }
  | (EpubFailure & {
      /** with `read-only` */
      readOnly?: EpubReadOnlyReason
      /** with `refused`: the engine's reason, and which edit of the list it was */
      refusal?: EditRefusal
      index?: number
    })

// ---- save ----

export type SaveMode = 'save' | 'saveAs'

export interface EpubSaveRequest {
  mode: SaveMode
  /**
   * an automatic save (the timer or a window blur): while the same book is
   * open in another pane it defers silently instead of asking to overwrite
   * that pane's bytes (decision 0036)
   */
  auto?: boolean
}

export type EpubSaveResult =
  | {
      ok: true
      path: string
      /** false when nothing changed and the file was left as it was */
      written: boolean
      /** the store key of the bytes now on disk (it changes when a save changed the file) */
      docHash: string
    }
  | { ok: true; canceled: true }
  | { ok: false; error: string }

// ---- menu ----

/**
 * Commands the menu sends to the book. Open is the shell's own; Save and
 * Save As go through `saveRequest` so the main process can wait for them.
 */
export type EpubMenuCommand =
  'undo' | 'redo' | 'find' | 'replace' | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'translate-book'

// ---- reading position and view settings ----

/** Where a book is being read: a spine index and, when known, a block id of that chapter. */
export interface EpubReadPosition {
  spineIndex: number
  blockId: string | null
}

/** Screen-only settings, shared by every book; never written into a book. */
export interface EpubViewPrefs {
  /** text size factor, 0.5–3 */
  fontScale: number
  /** line height, 1–3; null keeps the book's own */
  lineHeight: number | null
  /** the dark view */
  dark: boolean
}

export const EPUB_VIEW_PREFS_DEFAULT: EpubViewPrefs = {
  fontScale: 1,
  lineHeight: null,
  dark: false,
}

export interface EpubReadingState {
  /** where this file was left; null when it was never read here */
  position: EpubReadPosition | null
  viewPrefs: EpubViewPrefs
}

// ---- book translation ----

export interface EpubTranslationUnitsRequest {
  /** spine indices to translate; every chapter when left out */
  chapters?: number[]
}

export interface EpubTranslationUnitsResult {
  /** the store key of the saved bytes the units were read from */
  docHash: string
  units: EpubTranslationUnit[]
  skipped: EpubSkippedChapter[]
}

export interface EpubPickResultPathRequest {
  kind: EpubTranslationOutputKind
  /** target language code */
  lang: string
  /** a file name to suggest instead of `defaultResultName` */
  defaultName?: string
}

/**
 * Why a path may not take a result book:
 * - `source`: it is the book itself
 * - `open-in-tab`: a tab of the app has that file open
 * - `not-epub`: it does not end in `.epub`
 * - `invalid`: not an absolute path
 */
export type EpubResultPathRefusal = 'source' | 'open-in-tab' | 'not-epub' | 'invalid'

export type EpubResultPathCheck = { ok: true } | { ok: false; reason: EpubResultPathRefusal }

/**
 * What the result book's save dialog ended with: a path granted to this view
 * (as `pickResultPath` gives), a picked path that may not take a result (with
 * why; nothing is granted), or null when the dialog was cancelled.
 */
export type EpubPickResultTarget =
  { ok: true; path: string } | { ok: false; path: string; reason: EpubResultPathRefusal } | null

export interface EpubWriteTranslatedRequest {
  kind: EpubTranslationOutputKind
  lang: string
  /** spine indices chosen for translation; every chapter when left out */
  chapters?: number[]
  /** a path `pickResultPath` gave this view */
  path: string
  /** the store key the translation was stored under; must be the saved bytes' */
  docHash: string
}

export interface EpubWriteTranslatedResult {
  path: string
  report: EpubTranslationReport
  /** the result book's unique identifier (`urn:uuid:…`) */
  identifier: string
}

// ---- the result store ----

export interface EpubStoredTranslation {
  lang: string
  provider: string | null
  model: string | null
  blocks: TranslationBlockEntry[]
}

/** The store writes a book translation job makes. Every one names a document hash of this view's book. */
export type EpubStoreWriteRequest =
  | { kind: 'translationMeta'; docHash: string; lang: string; provider: string; model: string }
  | { kind: 'translationBlocks'; docHash: string; lang: string; blocks: TranslationBlockInput[] }
  | { kind: 'deleteTranslation'; docHash: string; lang: string }
  /** "translate again from the start" keeping a person's edits; answers `removed` */
  | { kind: 'deleteTranslationExceptEdited'; docHash: string; lang: string }
  /** a `translate` job record (found by its language) */
  | { kind: 'job'; docHash: string; lang: string; job: JobRecordInput }
  | { kind: 'heartbeat'; docHash: string; job: JobKind; lang: string }

export interface EpubStoreWriteResult {
  /** deleteTranslationExceptEdited: the block entries removed */
  removed?: number
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

// ---- preload API (window.epubApi) ----

/** Open, read, edit, save and the shell's settings: what the editor itself needs. */
export interface EpubCoreApi {
  /** Take the path pending for this view (queued at tab creation) */
  consumePending(): Promise<string | null>
  openFile(path: string): Promise<EpubOpenFileResult>
  readChapter(spineIndex: number): Promise<EpubChapterResult>
  applyEdits(request: EpubApplyEditsRequest): Promise<EpubEditResult>
  replaceRanges(request: EpubReplaceRangesRequest): Promise<EpubEditResult>
  /** this tab's book translation started (true) or ended (false) */
  setTranslationLock(locked: boolean): Promise<boolean>
  save(request: EpubSaveRequest): Promise<EpubSaveResult>
  /** the renderer holds edits it has not sent yet (for the close prompt) */
  setDirty(dirty: boolean): void
  /** Shell menu Save / Save As → the renderer sends what it holds and calls save() */
  onSaveRequest(handler: (mode: SaveMode) => void): () => void
  /** Resolves a menu-save waiter when the save ended without ever invoking save() */
  sendSaveRequestAck(ok: boolean): void
  /** "Save" in the close prompt → the renderer saves and replies via sendCloseSaveResult */
  onCloseSaveRequest(handler: () => void): () => void
  sendCloseSaveResult(ok: boolean): void
  onFileRenamed(handler: (newPath: string) => void): () => void
  /** Ask the main process to open an outside link; false when the address is not one it opens */
  openLink(url: string): Promise<boolean>
  onMenuCommand(handler: (command: EpubMenuCommand) => void): () => void
  getReadingState(): Promise<EpubReadingState>
  setReadPosition(position: EpubReadPosition): void
  setViewPrefs(patch: Partial<EpubViewPrefs>): Promise<EpubViewPrefs>
  onViewPrefsChanged(handler: (prefs: EpubViewPrefs) => void): () => void
  getLanguage(): Promise<Lang>
  onLanguageChanged(handler: (lang: Lang) => void): () => void
  getTheme(): Promise<UiTheme>
  onThemeChanged(handler: (theme: UiTheme) => void): () => void
  getAutoSaveDefault(): Promise<AutoSaveDefault>
  onAutoSaveDefaultChanged(handler: (value: AutoSaveDefault) => void): () => void
  /** press on the shell chrome (the tab strip is another view): dismiss open popovers */
  onChromePressed(handler: () => void): () => void
}

/** Book translation: units, result books and the result store, for this view's book only. */
export interface EpubTranslateApi {
  documentHash(): Promise<EpubOutcome<{ docHash: string }>>
  translationUnits(
    request: EpubTranslationUnitsRequest,
  ): Promise<EpubOutcome<EpubTranslationUnitsResult>>
  pickResultPath(request: EpubPickResultPathRequest): Promise<string | null>
  /** the result book's save dialog, saying why a picked path is refused */
  pickResultTarget(request: EpubPickResultPathRequest): Promise<EpubPickResultTarget>
  checkResultPath(path: string): Promise<EpubResultPathCheck>
  writeTranslated(
    request: EpubWriteTranslatedRequest,
  ): Promise<EpubOutcome<EpubWriteTranslatedResult>>
  store: EpubStoreApi
}

export interface EpubStoreApi {
  translations(docHash: string): Promise<EpubOutcome<{ langs: string[] }>>
  translation(
    docHash: string,
    lang: string,
  ): Promise<EpubOutcome<{ translation: EpubStoredTranslation | null }>>
  unfinishedJobs(docHash: string): Promise<EpubOutcome<{ jobs: JobStatus[] }>>
  write(request: EpubStoreWriteRequest): Promise<EpubOutcome<EpubStoreWriteResult>>
}

/** The AI panel's bridge. */
export interface EpubAiApi {
  pickAttachments(): Promise<AttachmentAddResult | null>
  addAttachmentPaths(paths: string[]): Promise<AttachmentAddResult>
  addPastedImage(data: ArrayBuffer, ext: string): Promise<AttachmentAddResult>
  readAttachment(path: string, offset: number, maxChars: number): Promise<AttachmentReadResult>
  readAttachmentImage(path: string): Promise<AttachmentImageResult>
  /** local path of a dropped / pasted File, '' when it has none */
  getPathForFile(file: File): string
  /** open any shell-routed document path (a citation in an AI answer, a result book) */
  openSourcePath(path: string): Promise<void>
  getAiPanelPrefs(): Promise<AiPanelPrefs>
  setAiPanelPrefs(patch: Partial<AiPanelPrefs>): Promise<AiPanelPrefs>
  onAiPanelPrefsChanged(handler: (prefs: AiPanelPrefs) => void): () => void
  getAiSettings(): Promise<AiSettings>
  setAiSettings(settings: AiSettings): Promise<void>
  onAiSettingsChanged(handler: () => void): () => void
  /** shell only: switch to Home and open Settings › AI Model (rejects in standalone) */
  openAiModelSettings(): Promise<void>
  subscription: EpubSubscriptionApi
  aiStream(request: AiStreamRequest): Promise<void>
  aiStreamCancel(requestId: string): Promise<void>
  /** cancel one stream only, leaving the tab's other AI calls alone (a book translation's request) */
  aiStreamCancelRequest(requestId: string): Promise<void>
  onAiStream(handler: (chunk: AiStreamChunk) => void): () => void
  webSearch(query: string, maxResults?: number): Promise<WebSearchResult>
  /** Read one web page as text (the shared ai:read-url handler), paged by character offset */
  readUrl(url: string, offset?: number): Promise<ReadUrlResult>
  imageSearch(query: string, maxResults?: number): Promise<ImageSearchResult>
}

/** API exposed by preload to the renderer (window.epubApi) */
export type EpubApi = EpubCoreApi & EpubTranslateApi & EpubAiApi
