import type { AiPanelPrefs } from '@genoffice/ui'
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { driveAiBridge } from '@genoffice/electron-utils/drive-ai-bridge'
import { outboundBridge } from '@genoffice/electron-utils/outbound-bridge'
import { userSkillsBridge } from '@genoffice/electron-utils/user-skills-bridge'
import { USER_SKILLS_BRIDGE_KEY } from '@genoffice/electron-utils/user-skills-channels'
import { docAttachBridge } from '@genoffice/electron-utils/doc-attach-bridge'
import { DOC_ATTACH_BRIDGE_KEY } from '@genoffice/electron-utils/doc-attach-channels'
import { SPLIT_PANE_BRIDGE_KEY, splitPaneBridge } from '@genoffice/electron-utils/split-pane-bridge'
import type { Lang } from '@genoffice/i18n'
import type { AiStreamChunk } from '@genoffice/ai-provider'
import { SUBSCRIPTION_IPC_CHANNELS } from '@genoffice/ai-provider/browser'
import type { ProjectApi } from '@genoffice/project-store'
import { installDropOpenBridge } from '@genoffice/electron-utils/drop-open'
import { AI_CHANNELS, APP_CHANNELS, MINDMAP_CHANNELS } from '../shared/ipc'
import type {
  AutoSaveDefault,
  ExportFormat,
  MindmapAiApi,
  MindmapApi,
  MindmapCoreApi,
  MindmapExportApi,
  MindmapHandoffApi,
  MindmapMakeFromApi,
  MindmapMenuCommand,
  MindmapQueryApi,
  MindmapRecoveryApi,
  MindmapSeedApi,
  SaveMode,
  UiTheme,
} from '../shared/ipc'
import {
  SUBSCRIPTION_CONNECT_HELP_CHANNEL,
  SUBSCRIPTION_INSTALL_HELP_CHANNEL,
  subscriptionLaunchResultOf,
  subscriptionMeteredResultOf,
  subscriptionStatusMapOf,
} from '../shared/subscription-api'
import type { MindmapSubscriptionApi } from '../shared/subscription-api'

/** Subscribes to a channel the main process sends on; returns the way to stop. */
function listen<Args extends unknown[]>(
  channel: string,
  handler: (...args: Args) => void,
): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => handler(...(args as Args))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// ---- the editor itself: open, save, links, menu commands, the shell's settings ----

const core: MindmapCoreApi = {
  consumePending: () => ipcRenderer.invoke(MINDMAP_CHANNELS.consumePending),
  openFile: (path) => ipcRenderer.invoke(MINDMAP_CHANNELS.openFile, path),
  save: (request) => ipcRenderer.invoke(MINDMAP_CHANNELS.save, request),
  setDirty: (dirty) => ipcRenderer.send(MINDMAP_CHANNELS.dirtyChanged, dirty),
  onSaveRequest: (handler) => listen<[SaveMode]>(MINDMAP_CHANNELS.saveRequest, handler),
  sendSaveRequestAck: (ok) => ipcRenderer.send(MINDMAP_CHANNELS.saveRequestAck, ok),
  onCloseSaveRequest: (handler) => listen<[]>(MINDMAP_CHANNELS.closeSaveRequest, handler),
  sendCloseSaveResult: (ok) => ipcRenderer.send(MINDMAP_CHANNELS.closeSaveResult, ok),
  onFileRenamed: (handler) => listen<[string]>(MINDMAP_CHANNELS.fileRenamed, handler),
  openLink: (url) => ipcRenderer.invoke(MINDMAP_CHANNELS.openLink, url),
  onMenuCommand: (handler) => listen<[MindmapMenuCommand]>(MINDMAP_CHANNELS.menuCommand, handler),
  getLanguage: () => ipcRenderer.invoke(APP_CHANNELS.getLanguage),
  onLanguageChanged: (handler) => listen<[Lang]>(APP_CHANNELS.languageChanged, handler),
  getTheme: () => ipcRenderer.invoke(APP_CHANNELS.getTheme),
  onThemeChanged: (handler) => listen<[UiTheme]>(APP_CHANNELS.themeChanged, handler),
  getAutoSaveDefault: () => ipcRenderer.invoke(APP_CHANNELS.getAutoSaveDefault),
  onAutoSaveDefaultChanged: (handler) =>
    listen<[AutoSaveDefault]>(APP_CHANNELS.autoSaveDefaultChanged, handler),
  onChromePressed: (handler) => listen<[]>(APP_CHANNELS.chromePressed, handler),
}

// ---- export and print: the main handlers and the renderer side are T10's ----

const exporting: MindmapExportApi = {
  onExportRequest: (handler) => listen<[ExportFormat]>(MINDMAP_CHANNELS.exportRequest, handler),
  onPrintRequest: (handler) => listen<[]>(MINDMAP_CHANNELS.printRequest, handler),
  exportPng: (request) => ipcRenderer.invoke(MINDMAP_CHANNELS.exportPng, request),
  exportPdf: (request) => ipcRenderer.invoke(MINDMAP_CHANNELS.exportPdf, request),
  exportMarkdown: (request) => ipcRenderer.invoke(MINDMAP_CHANNELS.exportMarkdown, request),
  print: (request) => ipcRenderer.invoke(MINDMAP_CHANNELS.print, request),
}

// ---- the AI panel's bridge: the panel and the attachment handlers are T12's ----

// The subscription channels are registered once for the whole app by the docs
// main. Without that handler (standalone run) an invoke rejects; the panel
// reads that as "still checking".
const subscription: MindmapSubscriptionApi = {
  statuses: async () =>
    subscriptionStatusMapOf(await ipcRenderer.invoke(SUBSCRIPTION_IPC_CHANNELS.statuses)),
  recheck: async (providers) =>
    subscriptionStatusMapOf(
      await ipcRenderer.invoke(
        SUBSCRIPTION_IPC_CHANNELS.recheck,
        providers ? { providers } : undefined,
      ),
    ),
  login: async (provider) =>
    subscriptionLaunchResultOf(
      await ipcRenderer.invoke(SUBSCRIPTION_IPC_CHANNELS.login, { provider }),
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

const ai: MindmapAiApi = {
  pickAttachments: () => ipcRenderer.invoke(MINDMAP_CHANNELS.filesPick),
  addAttachmentPaths: (paths) => ipcRenderer.invoke(MINDMAP_CHANNELS.filesAdd, paths),
  addPastedImage: (data, ext) =>
    ipcRenderer.invoke(MINDMAP_CHANNELS.filesAddPastedImage, data, ext),
  readAttachment: (path, offset, maxChars) =>
    ipcRenderer.invoke(MINDMAP_CHANNELS.filesRead, path, offset, maxChars),
  readAttachmentImage: (path) => ipcRenderer.invoke(MINDMAP_CHANNELS.filesReadImage, path),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  setProvisionalTitle: (title) => ipcRenderer.send(MINDMAP_CHANNELS.provisionalTitle, title),
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
  imageSearch: (query, maxResults) =>
    ipcRenderer.invoke(AI_CHANNELS.imageSearch, query, maxResults),
}

// ---- questions from the in-app MCP server: the renderer answers; T13 asks from the main process ----

const queries: MindmapQueryApi = {
  onOutlineRequest: (handler) => listen<[]>(MINDMAP_CHANNELS.outlineRequest, handler),
  sendOutlineResult: (reply) => ipcRenderer.send(MINDMAP_CHANNELS.outlineResult, reply),
  onBytesRequest: (handler) => listen<[]>(MINDMAP_CHANNELS.bytesRequest, handler),
  sendBytesResult: (reply) => ipcRenderer.send(MINDMAP_CHANNELS.bytesResult, reply),
}

// ---- a generation request handed over by the shell: T16 ----

const handoff: MindmapHandoffApi = {
  takeHandoff: () => ipcRenderer.invoke(MINDMAP_CHANNELS.handoffTake),
  notifyHandoffRunStarted: (report) => ipcRenderer.send(MINDMAP_CHANNELS.handoffRunStarted, report),
}

// ---- a new tab that starts with given content: T17 ----

const seed: MindmapSeedApi = {
  takeSeed: () => ipcRenderer.invoke(MINDMAP_CHANNELS.seedTake),
}

// ---- "make another document from this one": T18 ----

const makeFrom: MindmapMakeFromApi = {
  makeFromDocument: () => ipcRenderer.send(MINDMAP_CHANNELS.makeFromDocument),
}

// ---- crash-recovery copies ----

const recovery: MindmapRecoveryApi = {
  writeRecoveryCopy: (request) => ipcRenderer.invoke(MINDMAP_CHANNELS.recoveryCopy, request),
  onRecoveryCopyNow: (handler) => listen<[]>(MINDMAP_CHANNELS.recoveryCopyNow, handler),
  sendRecoveryCopyNowDone: () => ipcRenderer.send(MINDMAP_CHANNELS.recoveryCopyNowDone),
  onRecoveryReset: (handler) => listen<[]>(MINDMAP_CHANNELS.recoveryReset, handler),
}

const api: MindmapApi = {
  ...core,
  ...exporting,
  ...ai,
  ...queries,
  ...handoff,
  ...seed,
  ...makeFrom,
  ...recovery,
}

/** Chat persistence: the shared project:* handlers are registered once by the shell (docs-main registerProjectIpc) */
const projectApi: Pick<ProjectApi, 'resolveChat' | 'appendChat' | 'loadChat' | 'rebindChat'> = {
  resolveChat: (args) => ipcRenderer.invoke('project:resolveChat', args),
  appendChat: (args) => ipcRenderer.invoke('project:appendChat', args),
  loadChat: (args) => ipcRenderer.invoke('project:loadChat', args),
  rebindChat: (args) => ipcRenderer.invoke('project:rebindChat', args),
}

contextBridge.exposeInMainWorld('mindmapApi', api)
// Google Drive for this editor's AI: search and read only (decision 0033)
contextBridge.exposeInMainWorld('aiOfficeDriveAi', driveAiBridge())
contextBridge.exposeInMainWorld('aiOfficeOutbound', outboundBridge())
// the person's skills: the AI panel's `/` list and skill reads, skill cards (shell main checks each)
contextBridge.exposeInMainWorld(USER_SKILLS_BRIDGE_KEY, userSkillsBridge())
// The shell's document picker, for this editor's AI attach button
contextBridge.exposeInMainWorld(DOC_ATTACH_BRIDGE_KEY, docAttachBridge())
// The shell's split panes: this view's pane role, and its way to ask for focus
contextBridge.exposeInMainWorld(SPLIT_PANE_BRIDGE_KEY, splitPaneBridge(ipcRenderer))
contextBridge.exposeInMainWorld('projectApi', projectApi)

// open documents dragged from the OS onto this tab as a new shell tab
installDropOpenBridge()
