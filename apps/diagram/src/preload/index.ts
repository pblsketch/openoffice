/**
 * Preload of the diagram editor: `window.diagramApi` for the editor page, and
 * the shell's shared bridges the other editors also expose. It runs in the
 * editor page only; the draw.io frame inside it gets nothing from here.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { SPLIT_PANE_BRIDGE_KEY, splitPaneBridge } from '@genoffice/electron-utils/split-pane-bridge'
import {
  PROJECT_FOLDER_BRIDGE_KEY,
  projectFolderBridge,
} from '@genoffice/electron-utils/project-folder-bridge'
import { installDropOpenBridge } from '@genoffice/electron-utils/drop-open'
import type { Lang } from '@genoffice/i18n'
import { APP_CHANNELS, DIAGRAM_CHANNELS } from '../shared/ipc'
import type {
  AutoSaveDefault,
  DiagramApi,
  DiagramApplyQuery,
  DiagramCoreApi,
  DiagramExportApi,
  DiagramMenuCommand,
  DiagramQueryApi,
  DiagramReadQuery,
  DiagramRecoveryApi,
  ExportFormat,
  SaveRequestMode,
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

const core: DiagramCoreApi = {
  consumePending: () => ipcRenderer.invoke(DIAGRAM_CHANNELS.consumePending),
  openFile: (path) => ipcRenderer.invoke(DIAGRAM_CHANNELS.openFile, path),
  saveTarget: (request) => ipcRenderer.invoke(DIAGRAM_CHANNELS.saveTarget, request),
  save: (request) => ipcRenderer.invoke(DIAGRAM_CHANNELS.save, request),
  saveIntoProject: (request) => ipcRenderer.invoke(DIAGRAM_CHANNELS.saveIntoProject, request),
  setDirty: (dirty) => ipcRenderer.send(DIAGRAM_CHANNELS.dirtyChanged, dirty),
  onSaveRequest: (handler) => listen<[SaveRequestMode]>(DIAGRAM_CHANNELS.saveRequest, handler),
  sendSaveRequestAck: (ok) => ipcRenderer.send(DIAGRAM_CHANNELS.saveRequestAck, ok),
  onCloseSaveRequest: (handler) => listen<[]>(DIAGRAM_CHANNELS.closeSaveRequest, handler),
  sendCloseSaveResult: (ok) => ipcRenderer.send(DIAGRAM_CHANNELS.closeSaveResult, ok),
  onFileRenamed: (handler) => listen<[string]>(DIAGRAM_CHANNELS.fileRenamed, handler),
  openLink: (url) => ipcRenderer.invoke(DIAGRAM_CHANNELS.openLink, url),
  openHelp: () => ipcRenderer.send(DIAGRAM_CHANNELS.openHelp),
  onMenuCommand: (handler) => listen<[DiagramMenuCommand]>(DIAGRAM_CHANNELS.menuCommand, handler),
  getLanguage: () => ipcRenderer.invoke(APP_CHANNELS.getLanguage),
  onLanguageChanged: (handler) => listen<[Lang]>(APP_CHANNELS.languageChanged, handler),
  getTheme: () => ipcRenderer.invoke(APP_CHANNELS.getTheme),
  onThemeChanged: (handler) => listen<[UiTheme]>(APP_CHANNELS.themeChanged, handler),
  getAutoSaveDefault: () => ipcRenderer.invoke(APP_CHANNELS.getAutoSaveDefault),
  onAutoSaveDefaultChanged: (handler) =>
    listen<[AutoSaveDefault]>(APP_CHANNELS.autoSaveDefaultChanged, handler),
  onChromePressed: (handler) => listen<[]>(APP_CHANNELS.chromePressed, handler),
  takeSeed: () => ipcRenderer.invoke(DIAGRAM_CHANNELS.seedTake),
}

const exporting: DiagramExportApi = {
  onExportRequest: (handler) => listen<[ExportFormat]>(DIAGRAM_CHANNELS.exportRequest, handler),
  onPrintRequest: (handler) => listen<[]>(DIAGRAM_CHANNELS.printRequest, handler),
  exportImages: (request) => ipcRenderer.invoke(DIAGRAM_CHANNELS.exportImages, request),
  exportPdf: (request) => ipcRenderer.invoke(DIAGRAM_CHANNELS.exportPdf, request),
  print: (request) => ipcRenderer.invoke(DIAGRAM_CHANNELS.print, request),
}

const recovery: DiagramRecoveryApi = {
  writeRecoveryCopy: (request) => ipcRenderer.invoke(DIAGRAM_CHANNELS.recoveryCopy, request),
  onRecoveryCopyNow: (handler) => listen<[]>(DIAGRAM_CHANNELS.recoveryCopyNow, handler),
  sendRecoveryCopyNowDone: () => ipcRenderer.send(DIAGRAM_CHANNELS.recoveryCopyNowDone),
  onRecoveryReset: (handler) => listen<[]>(DIAGRAM_CHANNELS.recoveryReset, handler),
}

const queries: DiagramQueryApi = {
  onReadRequest: (handler) => listen<[DiagramReadQuery]>(DIAGRAM_CHANNELS.readRequest, handler),
  sendReadResult: (reply) => ipcRenderer.send(DIAGRAM_CHANNELS.readResult, reply),
  onApplyRequest: (handler) => listen<[DiagramApplyQuery]>(DIAGRAM_CHANNELS.applyRequest, handler),
  sendApplyResult: (reply) => ipcRenderer.send(DIAGRAM_CHANNELS.applyResult, reply),
  onBytesRequest: (handler) => listen<[]>(DIAGRAM_CHANNELS.bytesRequest, handler),
  sendBytesResult: (reply) => ipcRenderer.send(DIAGRAM_CHANNELS.bytesResult, reply),
}

const api: DiagramApi = { ...core, ...exporting, ...recovery, ...queries }

contextBridge.exposeInMainWorld('diagramApi', api)
// The shell's split panes: this view's pane role, and its way to ask for focus
contextBridge.exposeInMainWorld(SPLIT_PANE_BRIDGE_KEY, splitPaneBridge(ipcRenderer))
// project folders (decision 0088): main identifies this window, the bridge forwards ids only
contextBridge.exposeInMainWorld(PROJECT_FOLDER_BRIDGE_KEY, projectFolderBridge(ipcRenderer))
// documents dragged from the OS onto this tab open as a new shell tab
installDropOpenBridge()
