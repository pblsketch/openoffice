import type { AiPanelPrefs } from '@genoffice/ui'
import { contextBridge, ipcRenderer } from 'electron'
import { driveAiBridge } from '@genoffice/electron-utils/drive-ai-bridge'
import { userSkillsBridge } from '@genoffice/electron-utils/user-skills-bridge'
import { USER_SKILLS_BRIDGE_KEY } from '@genoffice/electron-utils/user-skills-channels'
import type { Lang } from '@genoffice/i18n'
import type { AiStreamChunk } from '@genoffice/ai-provider'
import { SUBSCRIPTION_IPC_CHANNELS } from '@genoffice/ai-provider/browser'
import type { ProjectApi } from '@genoffice/project-store'
import { installDropOpenBridge } from '@genoffice/electron-utils/drop-open'
import { splitPaneBridge } from '@genoffice/electron-utils/split-pane-bridge'
import { AI_CHANNELS, AI_TOOL_CAPABILITIES_CHANNEL, MARKDOWN_CHANNELS } from '../shared/ipc'
import type {
  AutoSaveDefault,
  DocTheme,
  ExportFormat,
  MarkdownApi,
  SaveMode,
  UiTheme,
} from '../shared/ipc'
import type { NoteSuggestion } from '../shared/internal-links'
import type { SubscriptionApi } from '../shared/subscription-api'
import {
  SUBSCRIPTION_INSTALL_HELP_CHANNEL,
  subscriptionLaunchResultOf,
  subscriptionStatusMapOf,
} from '../shared/subscription-api'

// Subscription channels are registered once for the whole app by the docs main.
// Until they are, an invoke rejects; the renderer treats that as "still checking".
const aiSubscription: SubscriptionApi = {
  async statuses() {
    return subscriptionStatusMapOf(await ipcRenderer.invoke(SUBSCRIPTION_IPC_CHANNELS.statuses))
  },
  async recheck(providers) {
    return subscriptionStatusMapOf(
      await ipcRenderer.invoke(
        SUBSCRIPTION_IPC_CHANNELS.recheck,
        providers ? { providers } : undefined,
      ),
    )
  },
  async login(provider) {
    return subscriptionLaunchResultOf(
      await ipcRenderer.invoke(SUBSCRIPTION_IPC_CHANNELS.login, { provider }),
    )
  },
  async install(provider) {
    return subscriptionLaunchResultOf(
      await ipcRenderer.invoke(SUBSCRIPTION_IPC_CHANNELS.install, { provider }),
    )
  },
  async update(provider) {
    return subscriptionLaunchResultOf(
      await ipcRenderer.invoke(SUBSCRIPTION_IPC_CHANNELS.update, { provider }),
    )
  },
  async cancelLogin(provider) {
    return subscriptionLaunchResultOf(
      await ipcRenderer.invoke(SUBSCRIPTION_IPC_CHANNELS.cancelLogin, { provider }),
    )
  },
  async setMeteredAccepted(provider, accepted) {
    const result: unknown = await ipcRenderer.invoke(SUBSCRIPTION_IPC_CHANNELS.metered, {
      provider,
      accepted,
    })
    const raw = (result ?? {}) as { ok?: unknown; statuses?: unknown }
    return { ok: raw.ok === true, statuses: subscriptionStatusMapOf(raw.statuses) }
  },
  onChanged(handler) {
    const listener = (_e: Electron.IpcRendererEvent, statuses: unknown) =>
      handler(subscriptionStatusMapOf(statuses))
    ipcRenderer.on(SUBSCRIPTION_IPC_CHANNELS.changed, listener)
    return () => ipcRenderer.removeListener(SUBSCRIPTION_IPC_CHANNELS.changed, listener)
  },
  async openInstallHelp(provider) {
    await ipcRenderer.invoke(SUBSCRIPTION_INSTALL_HELP_CHANNEL, provider)
  },
}

const api: MarkdownApi = {
  consumePending: () => ipcRenderer.invoke(MARKDOWN_CHANNELS.consumePending),
  takeSeed: () => ipcRenderer.invoke(MARKDOWN_CHANNELS.seedTake),
  takeNoteAppend: () =>
    (ipcRenderer.invoke(MARKDOWN_CHANNELS.noteAppendTake) as Promise<string[]>).catch(() => []),
  onNoteAppendReady: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(MARKDOWN_CHANNELS.noteAppendReady, listener)
    return () => ipcRenderer.removeListener(MARKDOWN_CHANNELS.noteAppendReady, listener)
  },
  openSourcePath: (path: string) => ipcRenderer.invoke('home:open-path', path),
  openLink: (target) => ipcRenderer.invoke(MARKDOWN_CHANNELS.openLink, target),
  suggestNotes: (query) =>
    (ipcRenderer.invoke(MARKDOWN_CHANNELS.suggestNotes, query) as Promise<NoteSuggestion[]>).catch(
      () => [],
    ),
  resolveEmbed: (target) =>
    (ipcRenderer.invoke(MARKDOWN_CHANNELS.resolveEmbed, target) as Promise<string | null>).catch(
      () => null,
    ),
  takeLinkHeading: () =>
    (ipcRenderer.invoke(MARKDOWN_CHANNELS.linkHeadingTake) as Promise<string | null>).catch(
      () => null,
    ),
  onLinkHeadingReady: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(MARKDOWN_CHANNELS.linkHeadingReady, listener)
    return () => ipcRenderer.removeListener(MARKDOWN_CHANNELS.linkHeadingReady, listener)
  },
  consumeHeadlessExport: () => ipcRenderer.invoke(MARKDOWN_CHANNELS.consumeHeadlessExport),
  headlessExportDone: (result: { ok: boolean; error?: string }) =>
    ipcRenderer.send(MARKDOWN_CHANNELS.headlessExportDone, result),
  readFile: (path) => ipcRenderer.invoke(MARKDOWN_CHANNELS.readFile, path),
  save: (request) => ipcRenderer.invoke(MARKDOWN_CHANNELS.save, request),
  setDirty: (dirty) => ipcRenderer.send(MARKDOWN_CHANNELS.dirtyChanged, dirty),
  onSaveRequest: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, mode: SaveMode) => handler(mode)
    ipcRenderer.on(MARKDOWN_CHANNELS.saveRequest, listener)
    return () => ipcRenderer.removeListener(MARKDOWN_CHANNELS.saveRequest, listener)
  },
  onCloseSaveRequest: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(MARKDOWN_CHANNELS.closeSaveRequest, listener)
    return () => ipcRenderer.removeListener(MARKDOWN_CHANNELS.closeSaveRequest, listener)
  },
  sendCloseSaveResult: (ok) => ipcRenderer.send(MARKDOWN_CHANNELS.closeSaveResult, ok),
  sendSaveRequestAck: (ok) => ipcRenderer.send(MARKDOWN_CHANNELS.saveRequestAck, ok),
  onReadTextRequest: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(MARKDOWN_CHANNELS.readTextRequest, listener)
    return () => ipcRenderer.removeListener(MARKDOWN_CHANNELS.readTextRequest, listener)
  },
  sendReadTextResult: (result) => ipcRenderer.send(MARKDOWN_CHANNELS.readTextResult, result),
  onFileRenamed: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, newPath: string) => handler(newPath)
    ipcRenderer.on(MARKDOWN_CHANNELS.fileRenamed, listener)
    return () => ipcRenderer.removeListener(MARKDOWN_CHANNELS.fileRenamed, listener)
  },
  pickImage: () => ipcRenderer.invoke(MARKDOWN_CHANNELS.pickImage),
  saveImage: (data) => ipcRenderer.invoke(MARKDOWN_CHANNELS.saveImage, data),
  readImage: (src) => ipcRenderer.invoke(MARKDOWN_CHANNELS.readImage, src),
  saveImageAs: (src) => ipcRenderer.invoke(MARKDOWN_CHANNELS.saveImageAs, src),
  getImageHost: () => ipcRenderer.invoke(MARKDOWN_CHANNELS.getImageHost),
  setImageHost: (config) => ipcRenderer.invoke(MARKDOWN_CHANNELS.setImageHost, config),
  uploadImage: (data) => ipcRenderer.invoke(MARKDOWN_CHANNELS.uploadImage, data),
  onViewImage: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, src: string) => handler(src)
    ipcRenderer.on(MARKDOWN_CHANNELS.viewImage, listener)
    return () => ipcRenderer.removeListener(MARKDOWN_CHANNELS.viewImage, listener)
  },
  onExportRequest: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, format: ExportFormat) => handler(format)
    ipcRenderer.on(MARKDOWN_CHANNELS.exportRequest, listener)
    return () => ipcRenderer.removeListener(MARKDOWN_CHANNELS.exportRequest, listener)
  },
  onPrintRequest: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(MARKDOWN_CHANNELS.printRequest, listener)
    return () => ipcRenderer.removeListener(MARKDOWN_CHANNELS.printRequest, listener)
  },
  exportDocx: (request) => ipcRenderer.invoke(MARKDOWN_CHANNELS.exportDocx, request),
  exportOdt: (request) => ipcRenderer.invoke(MARKDOWN_CHANNELS.exportOdt, request),
  exportPdf: (request) => ipcRenderer.invoke(MARKDOWN_CHANNELS.exportPdf, request),
  prepareImageExport: (request) =>
    ipcRenderer.invoke(MARKDOWN_CHANNELS.prepareImageExport, request),
  writeExportImage: (id, page, base64) =>
    ipcRenderer.invoke(MARKDOWN_CHANNELS.writeExportImage, id, page, base64),
  finishImageExport: (id, success) =>
    ipcRenderer.invoke(MARKDOWN_CHANNELS.finishImageExport, id, success),
  getLanguage: () => ipcRenderer.invoke(MARKDOWN_CHANNELS.getLanguage),
  onLanguageChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, lang: Lang) => handler(lang)
    ipcRenderer.on(MARKDOWN_CHANNELS.languageChanged, listener)
    return () => ipcRenderer.removeListener(MARKDOWN_CHANNELS.languageChanged, listener)
  },
  getTheme: () => ipcRenderer.invoke(MARKDOWN_CHANNELS.getTheme),
  onThemeChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, theme: UiTheme) => handler(theme)
    ipcRenderer.on(MARKDOWN_CHANNELS.themeChanged, listener)
    return () => ipcRenderer.removeListener(MARKDOWN_CHANNELS.themeChanged, listener)
  },
  getDocumentTheme: async () => {
    const result: unknown = await ipcRenderer.invoke(MARKDOWN_CHANNELS.getDocumentTheme)
    return result === 'dark' || result === 'light' ? result : 'follow'
  },
  onDocumentThemeChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, theme: DocTheme) => handler(theme)
    ipcRenderer.on(MARKDOWN_CHANNELS.documentThemeChanged, listener)
    return () => ipcRenderer.removeListener(MARKDOWN_CHANNELS.documentThemeChanged, listener)
  },
  getAutoSaveDefault: () => ipcRenderer.invoke(MARKDOWN_CHANNELS.getAutoSaveDefault),
  onAutoSaveDefaultChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, value: AutoSaveDefault) => handler(value)
    ipcRenderer.on(MARKDOWN_CHANNELS.autoSaveDefaultChanged, listener)
    return () => ipcRenderer.removeListener(MARKDOWN_CHANNELS.autoSaveDefaultChanged, listener)
  },
  getAiPanelPrefs: () => ipcRenderer.invoke(MARKDOWN_CHANNELS.getAiPanelPrefs),
  setAiPanelPrefs: (patch) => ipcRenderer.invoke('app:set-ai-panel-prefs', patch),
  onAiPanelPrefsChanged: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, prefs: AiPanelPrefs) => handler(prefs)
    ipcRenderer.on(MARKDOWN_CHANNELS.aiPanelPrefsChanged, listener)
    return () => ipcRenderer.removeListener(MARKDOWN_CHANNELS.aiPanelPrefsChanged, listener)
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
  aiSubscription,
  aiToolCapabilities: () => ipcRenderer.invoke(AI_TOOL_CAPABILITIES_CHANNEL),
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
  fetchImage: (url) => ipcRenderer.invoke(AI_CHANNELS.fetchImage, url),
  aiGenerateImage: (op) => ipcRenderer.invoke(MARKDOWN_CHANNELS.aiGenerateImage, op),
}

/** Chat persistence: the shared project:* handlers are registered once by the shell (docs-main registerProjectIpc) */
const projectApi: Pick<ProjectApi, 'resolveChat' | 'appendChat' | 'loadChat' | 'rebindChat'> = {
  resolveChat: (args) => ipcRenderer.invoke('project:resolveChat', args),
  appendChat: (args) => ipcRenderer.invoke('project:appendChat', args),
  loadChat: (args) => ipcRenderer.invoke('project:loadChat', args),
  rebindChat: (args) => ipcRenderer.invoke('project:rebindChat', args),
}

contextBridge.exposeInMainWorld('markdownApi', api)
// The split-pane role and focus calls the shell drives this pane with
contextBridge.exposeInMainWorld('aiOfficeSplit', splitPaneBridge(ipcRenderer))
// Google Drive for this editor's AI: search and read only (decision 0033)
contextBridge.exposeInMainWorld('aiOfficeDriveAi', driveAiBridge())
// the person's skills: the AI panel's `/` list and skill reads, skill cards (shell main checks each)
contextBridge.exposeInMainWorld(USER_SKILLS_BRIDGE_KEY, userSkillsBridge())
contextBridge.exposeInMainWorld('projectApi', projectApi)

// open documents dragged from the OS onto this tab as a new shell tab
installDropOpenBridge()
