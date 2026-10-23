/**
 * The contract between the drawing renderer, its preload and the main
 * process. Every channel this editor owns is listed here once.
 *
 * Every channel of this editor starts with `excalidraw:`. The main processes
 * of all editors run in one process, so a name may be registered only once.
 * Channels owned by the shell (`app:*`) are listed separately below; this
 * editor never registers those, it only calls them (except the language
 * getter, see the main module).
 */
import type { Lang } from '@genoffice/i18n'
import type { DrawingFormat, DrawingOpenStatus } from '@genoffice/excalidraw-engine'

export const EXCALIDRAW_CHANNELS = {
  /** invoke → `PendingOpen | null`: the file queued for this view, null for a new drawing */
  consumePending: 'excalidraw:consume-pending',
  /** invoke(path) → `OpenFileResult`: the bytes of a granted path, with how the file opens */
  openFile: 'excalidraw:open-file',
  /** invoke(`EmbeddedPictureRequest`) → `EmbeddedPicture[]`: pictures a note points at */
  readEmbedded: 'excalidraw:read-embedded',
  /** invoke(`SaveDrawingRequest`) → `SaveDrawingResult` */
  save: 'excalidraw:save',
  /** main → renderer(`SaveMode`): the menu's Save / Save As */
  saveRequest: 'excalidraw:save-request',
  /** renderer → main(boolean): a save request that ended without a save call */
  saveRequestAck: 'excalidraw:save-request-ack',
  /** renderer → main(boolean): unsaved changes, for the close prompt */
  dirtyChanged: 'excalidraw:dirty-changed',
  /** main → renderer: "Save" was picked in the close prompt */
  closeSaveRequest: 'excalidraw:close-save-request',
  /** renderer → main(boolean): how that save ended */
  closeSaveResult: 'excalidraw:close-save-result',
  /** main → renderer(newPath): the file was renamed on disk */
  fileRenamed: 'excalidraw:file-renamed',
  /** invoke(url) → boolean: open a link of an element in the system browser */
  openLink: 'excalidraw:open-link',
  /** main → renderer(`DrawingMenuCommand`) */
  menuCommand: 'excalidraw:menu-command',
} as const

/** Channels the shell registers for every editor. Called here, never registered (except the language getter). */
export const APP_CHANNELS = {
  getLanguage: 'app:get-language',
  languageChanged: 'app:language-changed',
  getTheme: 'app:get-theme',
  themeChanged: 'app:theme-changed',
  getAutoSaveDefault: 'app:get-auto-save-default',
  autoSaveDefaultChanged: 'app:auto-save-default-changed',
} as const

export type UiTheme = 'light' | 'dark' | 'system'

/** shell-wide AutoSave default; updatedAt is 0 until the user has ever set it */
export interface AutoSaveDefault {
  on: boolean
  updatedAt: number
}

// ---- open ----

/** The file a view was made for, and the format its name says it is in. */
export interface PendingOpen {
  path: string
  format: DrawingFormat
}

/** The bytes travel only with `ok`: a file that does not open hands the renderer nothing to save. */
export type OpenFileResult =
  | { status: 'ok'; bytes: Uint8Array; format: DrawingFormat }
  | { status: Exclude<DrawingOpenStatus, 'ok'> }

/** The pictures of a note to look up, by file id and the target written in the note. */
export interface EmbeddedPictureRequest {
  refs: Array<{ fileId: string; target: string }>
}

/** A picture found next to the note. Missing pictures are left out. */
export interface EmbeddedPicture {
  fileId: string
  mimeType: string
  dataURL: string
}

// ---- save ----

export type SaveMode = 'save' | 'saveAs'

export interface SaveDrawingRequest {
  /** the whole file, as the engine produced it */
  bytes: Uint8Array
  /** the format the bytes are in; a save never changes a file's format */
  format: DrawingFormat
  mode: SaveMode
  /** file name (no extension) offered by the save dialog of an untitled drawing */
  defaultName?: string
  /** an automatic save: while the same file is open in another pane it defers silently (decision 0036) */
  auto?: boolean
}

export type SaveDrawingResult =
  { ok: true; path: string } | { ok: true; canceled: true } | { ok: false; error: string }

// ---- menu ----

/** Commands the shell menu sends to the drawing. Save goes through `saveRequest`. */
export type DrawingMenuCommand =
  'undo' | 'redo' | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'zoom-fit'

export interface ExcalidrawApi {
  consumePending(): Promise<PendingOpen | null>
  openFile(path: string): Promise<OpenFileResult>
  readEmbedded(request: EmbeddedPictureRequest): Promise<EmbeddedPicture[]>
  save(request: SaveDrawingRequest): Promise<SaveDrawingResult>
  setDirty(dirty: boolean): void
  onSaveRequest(handler: (mode: SaveMode) => void): () => void
  sendSaveRequestAck(ok: boolean): void
  onCloseSaveRequest(handler: () => void): () => void
  sendCloseSaveResult(ok: boolean): void
  onFileRenamed(handler: (path: string) => void): () => void
  openLink(url: string): Promise<boolean>
  onMenuCommand(handler: (command: DrawingMenuCommand) => void): () => void
  getLanguage(): Promise<Lang>
  onLanguageChanged(handler: (lang: Lang) => void): () => void
  getTheme(): Promise<UiTheme>
  onThemeChanged(handler: (theme: UiTheme) => void): () => void
  getAutoSaveDefault(): Promise<AutoSaveDefault>
  onAutoSaveDefaultChanged(handler: (value: AutoSaveDefault) => void): () => void
}
