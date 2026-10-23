import { contextBridge, ipcRenderer } from 'electron'
import {
  installDocumentDropFirst,
  installDropOpenBridge,
} from '@genoffice/electron-utils/drop-open'
import { SPLIT_PANE_BRIDGE_KEY, splitPaneBridge } from '@genoffice/electron-utils/split-pane-bridge'
import type { Lang } from '@genoffice/i18n'
import { APP_CHANNELS, EXCALIDRAW_CHANNELS } from '../shared/ipc'
import type {
  AutoSaveDefault,
  DrawingMenuCommand,
  ExcalidrawApi,
  SaveMode,
  UiTheme,
} from '../shared/ipc'

/** Subscribes to a channel the main process sends on; returns the way to stop. */
function listen<Args extends unknown[]>(
  channel: string,
  handler: (...args: Args) => void,
): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => handler(...(args as Args))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: ExcalidrawApi = {
  consumePending: () => ipcRenderer.invoke(EXCALIDRAW_CHANNELS.consumePending),
  openFile: (path) => ipcRenderer.invoke(EXCALIDRAW_CHANNELS.openFile, path),
  readEmbedded: (request) => ipcRenderer.invoke(EXCALIDRAW_CHANNELS.readEmbedded, request),
  save: (request) => ipcRenderer.invoke(EXCALIDRAW_CHANNELS.save, request),
  setDirty: (dirty) => ipcRenderer.send(EXCALIDRAW_CHANNELS.dirtyChanged, dirty),
  onSaveRequest: (handler) => listen<[SaveMode]>(EXCALIDRAW_CHANNELS.saveRequest, handler),
  sendSaveRequestAck: (ok) => ipcRenderer.send(EXCALIDRAW_CHANNELS.saveRequestAck, ok),
  onCloseSaveRequest: (handler) => listen<[]>(EXCALIDRAW_CHANNELS.closeSaveRequest, handler),
  sendCloseSaveResult: (ok) => ipcRenderer.send(EXCALIDRAW_CHANNELS.closeSaveResult, ok),
  onFileRenamed: (handler) => listen<[string]>(EXCALIDRAW_CHANNELS.fileRenamed, handler),
  openLink: (url) => ipcRenderer.invoke(EXCALIDRAW_CHANNELS.openLink, url),
  onMenuCommand: (handler) =>
    listen<[DrawingMenuCommand]>(EXCALIDRAW_CHANNELS.menuCommand, handler),
  getLanguage: () => ipcRenderer.invoke(APP_CHANNELS.getLanguage),
  onLanguageChanged: (handler) => listen<[Lang]>(APP_CHANNELS.languageChanged, handler),
  getTheme: () => ipcRenderer.invoke(APP_CHANNELS.getTheme),
  onThemeChanged: (handler) => listen<[UiTheme]>(APP_CHANNELS.themeChanged, handler),
  getAutoSaveDefault: () => ipcRenderer.invoke(APP_CHANNELS.getAutoSaveDefault),
  onAutoSaveDefaultChanged: (handler) =>
    listen<[AutoSaveDefault]>(APP_CHANNELS.autoSaveDefaultChanged, handler),
}

contextBridge.exposeInMainWorld('excalidrawApi', api)
// The shell's split panes: this view's pane role, and its way to ask for focus
contextBridge.exposeInMainWorld(SPLIT_PANE_BRIDGE_KEY, splitPaneBridge(ipcRenderer))

// The canvas loads any file dropped on it, a dropped drawing over the open
// one: documents are caught first and open as their own tabs.
installDocumentDropFirst()
installDropOpenBridge()
