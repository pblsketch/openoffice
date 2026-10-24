import type { AiPanelPrefs } from '@genoffice/ui'
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { driveAiBridge } from '@genoffice/electron-utils/drive-ai-bridge'
import { outboundBridge } from '@genoffice/electron-utils/outbound-bridge'
import { userSkillsBridge } from '@genoffice/electron-utils/user-skills-bridge'
import { USER_SKILLS_BRIDGE_KEY } from '@genoffice/electron-utils/user-skills-channels'
import { docAttachBridge } from '@genoffice/electron-utils/doc-attach-bridge'
import { DOC_ATTACH_BRIDGE_KEY } from '@genoffice/electron-utils/doc-attach-channels'
import type { Lang } from '@genoffice/i18n'
import type { AiStreamChunk } from '@genoffice/ai-provider'
import { SUBSCRIPTION_IPC_CHANNELS } from '@genoffice/ai-provider/browser'
import type { ProjectApi } from '@genoffice/project-store'
import { installDropOpenBridge } from '@genoffice/electron-utils/drop-open'
import { splitPaneBridge } from '@genoffice/electron-utils/split-pane-bridge'
import { AI_CHANNELS, HTML_CHANNELS } from '../shared/ipc'
import { HTML_HANDOFF_CHANNELS } from '../shared/ipc'
import type { AutoSaveDefault, ExportFormat, HtmlApi, SaveMode, UiTheme } from '../shared/ipc'
import {
  SUBSCRIPTION_CONNECT_HELP_CHANNEL,
  SUBSCRIPTION_INSTALL_HELP_CHANNEL,
  subscriptionLaunchResultOf,
  subscriptionMeteredResultOf,
  subscriptionStatusMapOf,
} from '../shared/subscription-api'
import type { HtmlSubscriptionApi } from '../shared/subscription-api'

// The subscription channels are registered once for the whole app by the docs
// main. Without that handler (standalone run, older shell) an invoke rejects;
// the renderer reads that as "still checking" (renderer/ai/subscription-client.ts).
const subscription: HtmlSubscriptionApi = {
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
  onChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, statuses: unknown) =>
      handler(subscriptionStatusMapOf(statuses))
    ipcRenderer.on(SUBSCRIPTION_IPC_CHANNELS.changed, listener)
    return () => ipcRenderer.removeListener(SUBSCRIPTION_IPC_CHANNELS.changed, listener)
  },
  openInstallHelp: async (provider) => {
    await ipcRenderer.invoke(SUBSCRIPTION_INSTALL_HELP_CHANNEL, provider)
  },
  openConnectHelp: async (path) => {
    await ipcRenderer.invoke(SUBSCRIPTION_CONNECT_HELP_CHANNEL, path)
  },
}

const api: HtmlApi = {
  consumePending: () => ipcRenderer.invoke(HTML_CHANNELS.consumePending),
  takeSeed: () => ipcRenderer.invoke(HTML_CHANNELS.seedTake),
  openSourcePath: (path: string) => ipcRenderer.invoke('home:open-path', path),
  consumeHeadlessExport: () => ipcRenderer.invoke(HTML_CHANNELS.consumeHeadlessExport),
  headlessExportDone: (result: { ok: boolean; error?: string }) =>
    ipcRenderer.send(HTML_CHANNELS.headlessExportDone, result),
  readFile: (path) => ipcRenderer.invoke(HTML_CHANNELS.readFile, path),
  recoveryOpen: () => ipcRenderer.invoke(HTML_CHANNELS.recoveryOpen),
  writeRecoveryCopy: (text) => ipcRenderer.invoke(HTML_CHANNELS.recoveryWrite, text),
  onRecoveryFlushRequest: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(HTML_CHANNELS.recoveryFlushRequest, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.recoveryFlushRequest, listener)
  },
  updatePreview: (text) => ipcRenderer.send(HTML_CHANNELS.previewUpdate, text),
  getPreviewInfo: () => ipcRenderer.invoke(HTML_CHANNELS.previewInfo),
  setPresentFullScreen: (on) => ipcRenderer.invoke(HTML_CHANNELS.presentFullScreen, on),
  presentInNewTab: (title) => ipcRenderer.invoke(HTML_CHANNELS.presentNewTab, title),
  save: (request) => ipcRenderer.invoke(HTML_CHANNELS.save, request),
  setDirty: (dirty) => ipcRenderer.send(HTML_CHANNELS.dirtyChanged, dirty),
  onSaveRequest: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, mode: SaveMode) => handler(mode)
    ipcRenderer.on(HTML_CHANNELS.saveRequest, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.saveRequest, listener)
  },
  onCloseSaveRequest: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(HTML_CHANNELS.closeSaveRequest, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.closeSaveRequest, listener)
  },
  sendCloseSaveResult: (ok) => ipcRenderer.send(HTML_CHANNELS.closeSaveResult, ok),
  sendSaveRequestAck: (ok) => ipcRenderer.send(HTML_CHANNELS.saveRequestAck, ok),
  onReadTextRequest: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(HTML_CHANNELS.readTextRequest, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.readTextRequest, listener)
  },
  sendReadTextResult: (result) => ipcRenderer.send(HTML_CHANNELS.readTextResult, result),
  onFileRenamed: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, newPath: string) => handler(newPath)
    ipcRenderer.on(HTML_CHANNELS.fileRenamed, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.fileRenamed, listener)
  },
  setProvisionalTitle: (title) => ipcRenderer.send(HTML_CHANNELS.provisionalTitle, title),
  pickImage: () => ipcRenderer.invoke(HTML_CHANNELS.pickImage),
  saveImage: (data) => ipcRenderer.invoke(HTML_CHANNELS.saveImage, data),
  readImage: (src) => ipcRenderer.invoke(HTML_CHANNELS.readImage, src),
  pickAttachments: () => ipcRenderer.invoke(HTML_CHANNELS.filesPick),
  addAttachmentPaths: (paths) => ipcRenderer.invoke(HTML_CHANNELS.filesAdd, paths),
  addPastedImage: (data, ext) => ipcRenderer.invoke(HTML_CHANNELS.filesAddPastedImage, data, ext),
  readAttachment: (path, offset, maxChars) =>
    ipcRenderer.invoke(HTML_CHANNELS.filesRead, path, offset, maxChars),
  readAttachmentImage: (path) => ipcRenderer.invoke(HTML_CHANNELS.filesReadImage, path),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onExportRequest: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, format: ExportFormat) => handler(format)
    ipcRenderer.on(HTML_CHANNELS.exportRequest, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.exportRequest, listener)
  },
  onPrintRequest: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(HTML_CHANNELS.printRequest, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.printRequest, listener)
  },
  exportDocx: (request) => ipcRenderer.invoke(HTML_CHANNELS.exportDocx, request),
  exportOdt: (request) => ipcRenderer.invoke(HTML_CHANNELS.exportOdt, request),
  exportPdf: (request) => ipcRenderer.invoke(HTML_CHANNELS.exportPdf, request),
  exportHtml: (request) => ipcRenderer.invoke(HTML_CHANNELS.exportHtml, request),
  printHtml: (request) => ipcRenderer.invoke(HTML_CHANNELS.printHtml, request),
  renderPrintPreview: (request) => ipcRenderer.invoke(HTML_CHANNELS.printPreview, request),
  getLanguage: () => ipcRenderer.invoke(HTML_CHANNELS.getLanguage),
  onLanguageChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, lang: Lang) => handler(lang)
    ipcRenderer.on(HTML_CHANNELS.languageChanged, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.languageChanged, listener)
  },
  getTheme: () => ipcRenderer.invoke(HTML_CHANNELS.getTheme),
  onThemeChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, theme: UiTheme) => handler(theme)
    ipcRenderer.on(HTML_CHANNELS.themeChanged, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.themeChanged, listener)
  },
  getAutoSaveDefault: () => ipcRenderer.invoke(HTML_CHANNELS.getAutoSaveDefault),
  onAutoSaveDefaultChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, value: AutoSaveDefault) => handler(value)
    ipcRenderer.on(HTML_CHANNELS.autoSaveDefaultChanged, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.autoSaveDefaultChanged, listener)
  },
  getAiPanelPrefs: () => ipcRenderer.invoke(HTML_CHANNELS.getAiPanelPrefs),
  setAiPanelPrefs: (patch) => ipcRenderer.invoke('app:set-ai-panel-prefs', patch),
  onAiPanelPrefsChanged: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, prefs: AiPanelPrefs) => handler(prefs)
    ipcRenderer.on(HTML_CHANNELS.aiPanelPrefsChanged, listener)
    return () => ipcRenderer.removeListener(HTML_CHANNELS.aiPanelPrefsChanged, listener)
  },
  onChromePressed: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('app:chrome-pressed', listener)
    return () => ipcRenderer.removeListener('app:chrome-pressed', listener)
  },
  getAiSettings: () => ipcRenderer.invoke(AI_CHANNELS.getSettings),
  setAiSettings: (settings) => ipcRenderer.invoke(AI_CHANNELS.setSettings, settings),
  onAiSettingsChanged: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(AI_CHANNELS.settingsChanged, listener)
    return () => ipcRenderer.removeListener(AI_CHANNELS.settingsChanged, listener)
  },
  openAiModelSettings: () => ipcRenderer.invoke(AI_CHANNELS.openModelSettings),
  subscription,
  aiStream: (request) => ipcRenderer.invoke(AI_CHANNELS.stream, request),
  aiStreamCancel: (requestId) => ipcRenderer.invoke(AI_CHANNELS.streamCancel, requestId),
  onAiStream: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, chunk: AiStreamChunk) => handler(chunk)
    ipcRenderer.on(AI_CHANNELS.streamChunk, listener)
    return () => ipcRenderer.removeListener(AI_CHANNELS.streamChunk, listener)
  },
  webSearch: (query, maxResults) => ipcRenderer.invoke(AI_CHANNELS.webSearch, query, maxResults),
  readUrl: (url, offset) => ipcRenderer.invoke(AI_CHANNELS.readUrl, url, offset),
  imageSearch: (query, maxResults) =>
    ipcRenderer.invoke(AI_CHANNELS.imageSearch, query, maxResults),
  fetchImage: (url) => ipcRenderer.invoke(HTML_CHANNELS.fetchImage, url),
  aiGenerateImage: (op) => ipcRenderer.invoke(HTML_CHANNELS.aiGenerateImage, op),
  // the generate hand-off (8.5): no handler (standalone, older shell) rejects; the panel reads that as "nothing"
  takeGenerateHandoff: () => ipcRenderer.invoke(HTML_HANDOFF_CHANNELS.take),
  reportGenerateRunStarted: (attachedPaths) =>
    ipcRenderer.invoke(HTML_HANDOFF_CHANNELS.runStarted, attachedPaths),
}

/** Chat persistence: the shared project:* handlers are registered once by the shell (docs-main registerProjectIpc) */
const projectApi: Pick<ProjectApi, 'resolveChat' | 'appendChat' | 'loadChat' | 'rebindChat'> = {
  resolveChat: (args) => ipcRenderer.invoke('project:resolveChat', args),
  appendChat: (args) => ipcRenderer.invoke('project:appendChat', args),
  loadChat: (args) => ipcRenderer.invoke('project:loadChat', args),
  rebindChat: (args) => ipcRenderer.invoke('project:rebindChat', args),
}

contextBridge.exposeInMainWorld('htmlApi', api)
// The split-pane role and focus calls the shell drives this pane with
contextBridge.exposeInMainWorld('aiOfficeSplit', splitPaneBridge(ipcRenderer))
// Google Drive for this editor's AI: search and read only (decision 0033)
contextBridge.exposeInMainWorld('aiOfficeDriveAi', driveAiBridge())
contextBridge.exposeInMainWorld('aiOfficeOutbound', outboundBridge())
// the person's skills: the AI panel's `/` list and skill reads, skill cards (shell main checks each)
contextBridge.exposeInMainWorld(USER_SKILLS_BRIDGE_KEY, userSkillsBridge())
// The shell's document picker, for this editor's AI attach button
contextBridge.exposeInMainWorld(DOC_ATTACH_BRIDGE_KEY, docAttachBridge())
contextBridge.exposeInMainWorld('projectApi', projectApi)

// open documents dragged from the OS onto this tab as a new shell tab
installDropOpenBridge()
