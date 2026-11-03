/**
 * Preload of the diagram editor: `window.diagramApi` for the editor page, and
 * the shell's shared bridges the other editors also expose (the AI panel's
 * included). It runs in the editor page only; the draw.io frame inside it
 * gets nothing from here.
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AiStreamChunk } from '@genoffice/ai-provider'
import { SUBSCRIPTION_IPC_CHANNELS } from '@genoffice/ai-provider/browser'
import type { ProjectApi } from '@genoffice/project-store'
import type { AiPanelPrefs } from '@genoffice/ui'
import { SPLIT_PANE_BRIDGE_KEY, splitPaneBridge } from '@genoffice/electron-utils/split-pane-bridge'
import {
  PROJECT_FOLDER_BRIDGE_KEY,
  projectFolderBridge,
} from '@genoffice/electron-utils/project-folder-bridge'
import { installDropOpenBridge } from '@genoffice/electron-utils/drop-open'
import { driveAiBridge } from '@genoffice/electron-utils/drive-ai-bridge'
import { mcpToolsBridge } from '@genoffice/electron-utils/mcp-tools-bridge'
import { outboundBridge } from '@genoffice/electron-utils/outbound-bridge'
import { userSkillsBridge } from '@genoffice/electron-utils/user-skills-bridge'
import { USER_SKILLS_BRIDGE_KEY } from '@genoffice/electron-utils/user-skills-channels'
import { docAttachBridge } from '@genoffice/electron-utils/doc-attach-bridge'
import { DOC_ATTACH_BRIDGE_KEY } from '@genoffice/electron-utils/doc-attach-channels'
import type { Lang } from '@genoffice/i18n'
import { AI_CHANNELS, APP_CHANNELS, DIAGRAM_CHANNELS } from '../shared/ipc'
import type {
  AutoSaveDefault,
  DiagramAiApi,
  DiagramApi,
  DiagramApplyQuery,
  DiagramCoreApi,
  DiagramExportApi,
  DiagramHeadlessApi,
  DiagramMenuCommand,
  DiagramQueryApi,
  DiagramReadQuery,
  DiagramRecoveryApi,
  ExportFormat,
  SaveRequestMode,
  UiTheme,
} from '../shared/ipc'
import {
  SUBSCRIPTION_CONNECT_HELP_CHANNEL,
  SUBSCRIPTION_INSTALL_HELP_CHANNEL,
  subscriptionLaunchResultOf,
  subscriptionMeteredResultOf,
  subscriptionStatusMapOf,
} from '../shared/subscription-api'
import type { DiagramSubscriptionApi } from '../shared/subscription-api'

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
  openFailed: (message) => ipcRenderer.invoke(DIAGRAM_CHANNELS.openFailed, message),
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

const headless: DiagramHeadlessApi = {
  headlessJob: () => ipcRenderer.invoke(DIAGRAM_CHANNELS.headlessJob),
  headlessDone: (report) => ipcRenderer.send(DIAGRAM_CHANNELS.headlessDone, report),
}

// ---- the AI panel's bridge ----

// The subscription channels are registered once for the whole app by the docs
// main. Without that handler (standalone run) an invoke rejects; the panel
// reads that as "still checking".
const subscription: DiagramSubscriptionApi = {
  statuses: async () =>
    subscriptionStatusMapOf(await ipcRenderer.invoke(SUBSCRIPTION_IPC_CHANNELS.statuses)),
  recheck: async (providers) =>
    subscriptionStatusMapOf(
      await ipcRenderer.invoke(
        SUBSCRIPTION_IPC_CHANNELS.recheck,
        providers ? { providers } : undefined,
      ),
    ),
  login: async (provider, mode) =>
    subscriptionLaunchResultOf(
      await ipcRenderer.invoke(
        SUBSCRIPTION_IPC_CHANNELS.login,
        mode ? { provider, mode } : { provider },
      ),
    ),
  install: async (provider) =>
    subscriptionLaunchResultOf(
      await ipcRenderer.invoke(SUBSCRIPTION_IPC_CHANNELS.install, { provider }),
    ),
  update: async (provider) =>
    subscriptionLaunchResultOf(
      await ipcRenderer.invoke(SUBSCRIPTION_IPC_CHANNELS.update, { provider }),
    ),
  cancelLogin: async (provider) =>
    subscriptionLaunchResultOf(
      await ipcRenderer.invoke(SUBSCRIPTION_IPC_CHANNELS.cancelLogin, { provider }),
    ),
  setMeteredAccepted: async (provider, accepted) =>
    subscriptionMeteredResultOf(
      await ipcRenderer.invoke(SUBSCRIPTION_IPC_CHANNELS.metered, { provider, accepted }),
    ),
  onChanged: (handler) =>
    listen<[unknown]>(SUBSCRIPTION_IPC_CHANNELS.changed, (statuses) =>
      handler(subscriptionStatusMapOf(statuses)),
    ),
  openInstallHelp: async (provider) => {
    await ipcRenderer.invoke(SUBSCRIPTION_INSTALL_HELP_CHANNEL, provider)
  },
  openConnectHelp: async (path) => {
    await ipcRenderer.invoke(SUBSCRIPTION_CONNECT_HELP_CHANNEL, path)
  },
}

const ai: DiagramAiApi = {
  pickAttachments: () => ipcRenderer.invoke(DIAGRAM_CHANNELS.filesPick),
  addAttachmentPaths: (paths) => ipcRenderer.invoke(DIAGRAM_CHANNELS.filesAdd, paths),
  addPastedImage: (data, ext) =>
    ipcRenderer.invoke(DIAGRAM_CHANNELS.filesAddPastedImage, data, ext),
  readAttachment: (path, offset, maxChars) =>
    ipcRenderer.invoke(DIAGRAM_CHANNELS.filesRead, path, offset, maxChars),
  readAttachmentImage: (path) => ipcRenderer.invoke(DIAGRAM_CHANNELS.filesReadImage, path),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  setProvisionalTitle: (title) => ipcRenderer.send(DIAGRAM_CHANNELS.provisionalTitle, title),
  openSourcePath: (path) => ipcRenderer.invoke(APP_CHANNELS.openSourcePath, path),
  getAiPanelPrefs: () => ipcRenderer.invoke(APP_CHANNELS.getAiPanelPrefs),
  setAiPanelPrefs: (patch) => ipcRenderer.invoke(APP_CHANNELS.setAiPanelPrefs, patch),
  onAiPanelPrefsChanged: (handler) =>
    listen<[AiPanelPrefs]>(APP_CHANNELS.aiPanelPrefsChanged, handler),
  getAiSettings: () => ipcRenderer.invoke(AI_CHANNELS.getSettings),
  setAiSettings: (settings) => ipcRenderer.invoke(AI_CHANNELS.setSettings, settings),
  onAiSettingsChanged: (handler) => listen<[]>(AI_CHANNELS.settingsChanged, handler),
  openAiModelSettings: () => ipcRenderer.invoke(AI_CHANNELS.openModelSettings),
  subscription,
  aiStream: (request) => ipcRenderer.invoke(AI_CHANNELS.stream, request),
  aiStreamCancel: (requestId) => ipcRenderer.invoke(AI_CHANNELS.streamCancel, requestId),
  onAiStream: (handler) => listen<[AiStreamChunk]>(AI_CHANNELS.streamChunk, handler),
  webSearch: (query, maxResults) => ipcRenderer.invoke(AI_CHANNELS.webSearch, query, maxResults),
  readUrl: (url, offset) => ipcRenderer.invoke(AI_CHANNELS.readUrl, url, offset),
}

const api: DiagramApi = { ...core, ...exporting, ...recovery, ...queries, ...headless, ...ai }

/** Chat persistence: the shared project:* handlers are registered once by the shell */
const projectApi: Pick<ProjectApi, 'resolveChat' | 'appendChat' | 'loadChat' | 'rebindChat'> = {
  resolveChat: (args) => ipcRenderer.invoke('project:resolveChat', args),
  appendChat: (args) => ipcRenderer.invoke('project:appendChat', args),
  loadChat: (args) => ipcRenderer.invoke('project:loadChat', args),
  rebindChat: (args) => ipcRenderer.invoke('project:rebindChat', args),
}

contextBridge.exposeInMainWorld('diagramApi', api)
contextBridge.exposeInMainWorld('projectApi', projectApi)
// Google Drive for this editor's AI: search and read only (decision 0033)
contextBridge.exposeInMainWorld('aiOfficeDriveAi', driveAiBridge())
contextBridge.exposeInMainWorld('aiOfficeOutbound', outboundBridge())
// the person's MCP servers for this editor's AI: list and call approved tools (the shell checks each)
contextBridge.exposeInMainWorld('aiOfficeMcpTools', mcpToolsBridge())
// the person's skills: the AI panel's `/` list and skill reads, skill cards (shell main checks each)
contextBridge.exposeInMainWorld(USER_SKILLS_BRIDGE_KEY, userSkillsBridge())
// The shell's document picker, for this editor's AI attach button
contextBridge.exposeInMainWorld(DOC_ATTACH_BRIDGE_KEY, docAttachBridge())
// The shell's split panes: this view's pane role, and its way to ask for focus
contextBridge.exposeInMainWorld(SPLIT_PANE_BRIDGE_KEY, splitPaneBridge(ipcRenderer))
// project folders (decision 0088): main identifies this window, the bridge forwards ids only
contextBridge.exposeInMainWorld(PROJECT_FOLDER_BRIDGE_KEY, projectFolderBridge(ipcRenderer))
// documents dragged from the OS onto this tab open as a new shell tab
installDropOpenBridge()
