/**
 * Preload of the EPUB editor: exposes `window.epubApi` (see ../shared/ipc).
 */
import type { AiPanelPrefs } from '@genoffice/ui'
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { driveAiBridge } from '@genoffice/electron-utils/drive-ai-bridge'
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
import { AI_CHANNELS, APP_CHANNELS, EPUB_CHANNELS } from '../shared/ipc'
import type {
  AutoSaveDefault,
  EpubAiApi,
  EpubApi,
  EpubCoreApi,
  EpubMenuCommand,
  EpubStoreApi,
  EpubTranslateApi,
  EpubViewPrefs,
  SaveMode,
  UiTheme,
} from '../shared/ipc'
import {
  SUBSCRIPTION_INSTALL_HELP_CHANNEL,
  subscriptionLaunchResultOf,
  subscriptionMeteredResultOf,
  subscriptionStatusMapOf,
} from '../shared/subscription-api'
import type { EpubSubscriptionApi } from '../shared/subscription-api'

/** Subscribes to a channel the main process sends on; returns the way to stop. */
function listen<Args extends unknown[]>(
  channel: string,
  handler: (...args: Args) => void,
): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => handler(...(args as Args))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// ---- the editor itself: open, read, edit, save, menu commands, the shell's settings ----

const core: EpubCoreApi = {
  consumePending: () => ipcRenderer.invoke(EPUB_CHANNELS.consumePending),
  openFile: (path) => ipcRenderer.invoke(EPUB_CHANNELS.openFile, path),
  readChapter: (spineIndex) => ipcRenderer.invoke(EPUB_CHANNELS.readChapter, spineIndex),
  applyEdits: (request) => ipcRenderer.invoke(EPUB_CHANNELS.applyEdits, request),
  replaceRanges: (request) => ipcRenderer.invoke(EPUB_CHANNELS.replaceRanges, request),
  setTranslationLock: (locked) => ipcRenderer.invoke(EPUB_CHANNELS.setTranslationLock, locked),
  save: (request) => ipcRenderer.invoke(EPUB_CHANNELS.save, request),
  setDirty: (dirty) => ipcRenderer.send(EPUB_CHANNELS.dirtyChanged, dirty),
  onSaveRequest: (handler) => listen<[SaveMode]>(EPUB_CHANNELS.saveRequest, handler),
  sendSaveRequestAck: (ok) => ipcRenderer.send(EPUB_CHANNELS.saveRequestAck, ok),
  onCloseSaveRequest: (handler) => listen<[]>(EPUB_CHANNELS.closeSaveRequest, handler),
  sendCloseSaveResult: (ok) => ipcRenderer.send(EPUB_CHANNELS.closeSaveResult, ok),
  onFileRenamed: (handler) => listen<[string]>(EPUB_CHANNELS.fileRenamed, handler),
  openLink: (url) => ipcRenderer.invoke(EPUB_CHANNELS.openLink, url),
  onMenuCommand: (handler) => listen<[EpubMenuCommand]>(EPUB_CHANNELS.menuCommand, handler),
  getReadingState: () => ipcRenderer.invoke(EPUB_CHANNELS.getReadingState),
  setReadPosition: (position) => ipcRenderer.send(EPUB_CHANNELS.setReadPosition, position),
  setViewPrefs: (patch) => ipcRenderer.invoke(EPUB_CHANNELS.setViewPrefs, patch),
  onViewPrefsChanged: (handler) => listen<[EpubViewPrefs]>(EPUB_CHANNELS.viewPrefsChanged, handler),
  getLanguage: () => ipcRenderer.invoke(APP_CHANNELS.getLanguage),
  onLanguageChanged: (handler) => listen<[Lang]>(APP_CHANNELS.languageChanged, handler),
  getTheme: () => ipcRenderer.invoke(APP_CHANNELS.getTheme),
  onThemeChanged: (handler) => listen<[UiTheme]>(APP_CHANNELS.themeChanged, handler),
  getAutoSaveDefault: () => ipcRenderer.invoke(APP_CHANNELS.getAutoSaveDefault),
  onAutoSaveDefaultChanged: (handler) =>
    listen<[AutoSaveDefault]>(APP_CHANNELS.autoSaveDefaultChanged, handler),
  onChromePressed: (handler) => listen<[]>(APP_CHANNELS.chromePressed, handler),
}

// ---- book translation: units, result books, and the result store of this view's book ----

const store: EpubStoreApi = {
  translations: (docHash) => ipcRenderer.invoke(EPUB_CHANNELS.storeTranslations, docHash),
  translation: (docHash, lang) => ipcRenderer.invoke(EPUB_CHANNELS.storeTranslation, docHash, lang),
  unfinishedJobs: (docHash) => ipcRenderer.invoke(EPUB_CHANNELS.storeUnfinishedJobs, docHash),
  write: (request) => ipcRenderer.invoke(EPUB_CHANNELS.storeWrite, request),
}

const translate: EpubTranslateApi = {
  documentHash: () => ipcRenderer.invoke(EPUB_CHANNELS.documentHash),
  translationUnits: (request) => ipcRenderer.invoke(EPUB_CHANNELS.translationUnits, request),
  pickResultPath: (request) => ipcRenderer.invoke(EPUB_CHANNELS.pickResultPath, request),
  pickResultTarget: (request) => ipcRenderer.invoke(EPUB_CHANNELS.pickResultTarget, request),
  checkResultPath: (path) => ipcRenderer.invoke(EPUB_CHANNELS.checkResultPath, path),
  writeTranslated: (request) => ipcRenderer.invoke(EPUB_CHANNELS.writeTranslated, request),
  store,
}

// ---- the AI panel's bridge ----

// The subscription channels are registered once for the whole app by the docs
// main. Without that handler (standalone run) an invoke rejects; the panel
// reads that as "still checking".
const subscription: EpubSubscriptionApi = {
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
}

const ai: EpubAiApi = {
  pickAttachments: () => ipcRenderer.invoke(EPUB_CHANNELS.filesPick),
  addAttachmentPaths: (paths) => ipcRenderer.invoke(EPUB_CHANNELS.filesAdd, paths),
  addPastedImage: (data, ext) => ipcRenderer.invoke(EPUB_CHANNELS.filesAddPastedImage, data, ext),
  readAttachment: (path, offset, maxChars) =>
    ipcRenderer.invoke(EPUB_CHANNELS.filesRead, path, offset, maxChars),
  readAttachmentImage: (path) => ipcRenderer.invoke(EPUB_CHANNELS.filesReadImage, path),
  getPathForFile: (file) => webUtils.getPathForFile(file),
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
  // the shared handler's 'request' scope ends this stream only (a document job's call)
  aiStreamCancelRequest: (requestId) =>
    ipcRenderer.invoke(AI_CHANNELS.streamCancel, requestId, 'request'),
  onAiStream: (handler) => listen<[AiStreamChunk]>(AI_CHANNELS.streamChunk, handler),
  webSearch: (query, maxResults) => ipcRenderer.invoke(AI_CHANNELS.webSearch, query, maxResults),
  readUrl: (url, offset) => ipcRenderer.invoke(AI_CHANNELS.readUrl, url, offset),
  imageSearch: (query, maxResults) =>
    ipcRenderer.invoke(AI_CHANNELS.imageSearch, query, maxResults),
}

const api: EpubApi = { ...core, ...translate, ...ai }

/** Chat persistence: the shared project:* handlers are registered once by the shell (docs-main registerProjectIpc) */
const projectApi: Pick<ProjectApi, 'resolveChat' | 'appendChat' | 'loadChat' | 'rebindChat'> = {
  resolveChat: (args) => ipcRenderer.invoke('project:resolveChat', args),
  appendChat: (args) => ipcRenderer.invoke('project:appendChat', args),
  loadChat: (args) => ipcRenderer.invoke('project:loadChat', args),
  rebindChat: (args) => ipcRenderer.invoke('project:rebindChat', args),
}

contextBridge.exposeInMainWorld('epubApi', api)
// Google Drive for this editor's AI: search and read only (decision 0033)
contextBridge.exposeInMainWorld('aiOfficeDriveAi', driveAiBridge())
// the person's skills: the AI panel's `/` list and skill reads, skill cards (shell main checks each)
contextBridge.exposeInMainWorld(USER_SKILLS_BRIDGE_KEY, userSkillsBridge())
// The shell's document picker, for this editor's AI attach button
contextBridge.exposeInMainWorld(DOC_ATTACH_BRIDGE_KEY, docAttachBridge())
// The shell's split panes: this view's pane role, and its way to ask for focus
contextBridge.exposeInMainWorld(SPLIT_PANE_BRIDGE_KEY, splitPaneBridge(ipcRenderer))
contextBridge.exposeInMainWorld('projectApi', projectApi)

// open documents dragged from the OS onto this tab as a new shell tab
installDropOpenBridge()
