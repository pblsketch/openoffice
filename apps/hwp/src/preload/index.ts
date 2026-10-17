import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { driveAiBridge } from '@genoffice/electron-utils/drive-ai-bridge'
import { docAttachBridge } from '@genoffice/electron-utils/doc-attach-bridge'
import { DOC_ATTACH_BRIDGE_KEY } from '@genoffice/electron-utils/doc-attach-channels'
import type { AiStreamChunk } from '@genoffice/ai-provider'
import { SUBSCRIPTION_IPC_CHANNELS } from '@genoffice/ai-provider/browser'
import type { Lang } from '@genoffice/i18n'
import type { ProjectApi } from '@genoffice/project-store'
import type { AiPanelPrefs } from '@genoffice/ui'
import {
  DROP_OPEN_CHANNEL,
  KNOWN_UNSUPPORTED_DOC_RE,
  MAX_DROP_PATH_CHARS,
  MAX_RESOLVED_DROP_PATHS,
  OPENABLE_DOC_RE,
  installDropOpenBridge,
} from '@genoffice/electron-utils/drop-open'
import { AI_CHANNELS, HWP_CHANNELS } from '../shared/ipc'
import type { HwpApi, PrintMode, SaveMode, UiTheme } from '../shared/ipc'
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

const api: HwpApi = {
  consumePending: () => ipcRenderer.invoke(HWP_CHANNELS.consumePending),
  readFile: (path) => ipcRenderer.invoke(HWP_CHANNELS.readFile, path),
  trackingDropped: () => ipcRenderer.invoke(HWP_CHANNELS.trackingDropped),
  beginSave: (mode) => ipcRenderer.invoke(HWP_CHANNELS.beginSave, mode),
  newTabs: (bytes, format) => ipcRenderer.invoke(HWP_CHANNELS.newTabs, bytes, format),
  commitSave: (bytes, tabs) => ipcRenderer.invoke(HWP_CHANNELS.commitSave, bytes, tabs),
  abortSave: () => ipcRenderer.send(HWP_CHANNELS.abortSave),
  requestFileCommand: (command) => ipcRenderer.send(HWP_CHANNELS.fileCommand, command),
  setDirty: (dirty) => ipcRenderer.send(HWP_CHANNELS.dirtyChanged, dirty),
  onSaveRequest: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, mode: SaveMode) => handler(mode)
    ipcRenderer.on(HWP_CHANNELS.saveRequest, listener)
    return () => ipcRenderer.removeListener(HWP_CHANNELS.saveRequest, listener)
  },
  onPrintRequest: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, mode: PrintMode) => handler(mode)
    ipcRenderer.on(HWP_CHANNELS.printRequest, listener)
    return () => ipcRenderer.removeListener(HWP_CHANNELS.printRequest, listener)
  },
  printPages: (job) => ipcRenderer.invoke(HWP_CHANNELS.printPages, job),
  onCloseSaveRequest: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(HWP_CHANNELS.closeSaveRequest, listener)
    return () => ipcRenderer.removeListener(HWP_CHANNELS.closeSaveRequest, listener)
  },
  sendCloseSaveResult: (ok) => ipcRenderer.send(HWP_CHANNELS.closeSaveResult, ok),
  onReadBytesRequest: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(HWP_CHANNELS.readBytesRequest, listener)
    return () => ipcRenderer.removeListener(HWP_CHANNELS.readBytesRequest, listener)
  },
  sendReadBytesResult: (result) => ipcRenderer.send(HWP_CHANNELS.readBytesResult, result),
  pickAttachments: () => ipcRenderer.invoke(HWP_CHANNELS.filesPick),
  addAttachmentPaths: (paths) => ipcRenderer.invoke(HWP_CHANNELS.filesAdd, paths),
  addPastedImage: (data, ext) => ipcRenderer.invoke(HWP_CHANNELS.filesAddPastedImage, data, ext),
  readAttachment: (path, offset, maxChars) =>
    ipcRenderer.invoke(HWP_CHANNELS.filesRead, path, offset, maxChars),
  readAttachmentImage: (path) => ipcRenderer.invoke(HWP_CHANNELS.filesReadImage, path),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  // the drop bridge's rules, for drops it cannot hear: paths come from the dropped files
  // here, so the page can only pass on files the user dropped
  openDroppedDocuments: (files) => {
    const paths: string[] = []
    for (const file of files.slice(0, MAX_RESOLVED_DROP_PATHS)) {
      let path = ''
      try {
        path = webUtils.getPathForFile(file).trim()
      } catch {
        // not a file on disk
      }
      if (!path || path.length > MAX_DROP_PATH_CHARS) continue
      if (OPENABLE_DOC_RE.test(path) || KNOWN_UNSUPPORTED_DOC_RE.test(path)) paths.push(path)
    }
    if (paths.length === 0) return false
    ipcRenderer.send(DROP_OPEN_CHANNEL, paths)
    return true
  },
  getLanguage: () => ipcRenderer.invoke(HWP_CHANNELS.getLanguage),
  onLanguageChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, lang: Lang) => handler(lang)
    ipcRenderer.on(HWP_CHANNELS.languageChanged, listener)
    return () => ipcRenderer.removeListener(HWP_CHANNELS.languageChanged, listener)
  },
  getTheme: () => ipcRenderer.invoke(HWP_CHANNELS.getTheme),
  onThemeChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, theme: UiTheme) => handler(theme)
    ipcRenderer.on(HWP_CHANNELS.themeChanged, listener)
    return () => ipcRenderer.removeListener(HWP_CHANNELS.themeChanged, listener)
  },
  getAiPanelPrefs: () => ipcRenderer.invoke(HWP_CHANNELS.getAiPanelPrefs),
  setAiPanelPrefs: (patch) => ipcRenderer.invoke(HWP_CHANNELS.setAiPanelPrefs, patch),
  onAiPanelPrefsChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, prefs: AiPanelPrefs) => handler(prefs)
    ipcRenderer.on(HWP_CHANNELS.aiPanelPrefsChanged, listener)
    return () => ipcRenderer.removeListener(HWP_CHANNELS.aiPanelPrefsChanged, listener)
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
  aiStream: (request) => ipcRenderer.invoke(AI_CHANNELS.stream, request),
  aiStreamCancel: (requestId) => ipcRenderer.invoke(AI_CHANNELS.streamCancel, requestId),
  onAiStream: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, chunk: AiStreamChunk) => handler(chunk)
    ipcRenderer.on(AI_CHANNELS.streamChunk, listener)
    return () => ipcRenderer.removeListener(AI_CHANNELS.streamChunk, listener)
  },
}

contextBridge.exposeInMainWorld('hwpApi', api)
// Google Drive for this editor's AI: search and read only (decision 0033)
contextBridge.exposeInMainWorld('aiOfficeDriveAi', driveAiBridge())
// The shell's document picker, for this editor's AI attach button
contextBridge.exposeInMainWorld(DOC_ATTACH_BRIDGE_KEY, docAttachBridge())

/** Chat persistence: the shared project:* handlers are registered once by the shell (docs-main registerProjectIpc) */
const projectApi: Pick<ProjectApi, 'resolveChat' | 'appendChat' | 'loadChat' | 'rebindChat'> = {
  resolveChat: (args) => ipcRenderer.invoke('project:resolveChat', args),
  appendChat: (args) => ipcRenderer.invoke('project:appendChat', args),
  loadChat: (args) => ipcRenderer.invoke('project:loadChat', args),
  rebindChat: (args) => ipcRenderer.invoke('project:rebindChat', args),
}

contextBridge.exposeInMainWorld('projectApi', projectApi)

// open documents dragged from the OS onto this tab as a new shell tab
installDropOpenBridge()
