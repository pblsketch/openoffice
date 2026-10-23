import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import {
  AI_MEDIA_PROVIDERS,
  AI_PROVIDERS,
  AI_SEARCH_PROVIDERS,
  FREE_AI_IPC_CHANNELS,
  SUBSCRIPTION_IPC_CHANNELS,
  freeAiConnectResultOf,
  freeAiQuotaOf,
  getProviderAdapter,
} from '@genoffice/ai-provider/browser'
import type { AiSettings, CodexModelCatalog } from '@genoffice/ai-provider/browser'
import { installDropOpenBridge } from '@genoffice/electron-utils/drop-open'
import { userSkillsBridge } from '@genoffice/electron-utils/user-skills-bridge'
import { USER_SKILLS_BRIDGE_KEY } from '@genoffice/electron-utils/user-skills-channels'
import type { UpdateUiState } from '../shared/update-api'
import { normalizeAiPanelPrefs } from '@genoffice/ui/ai-panel-prefs'
import type {
  DefaultAppStatus,
  FolderListing,
  FolderRoot,
  MoveResult,
  HomeApi,
  RecentEntry,
  RecentPage,
  RenameResult,
  UiLanguage,
  FileSearchPage,
  FileSearchRerank,
  FileSearchSettings,
} from '../shared/home-api'
import { HOME_CHANNELS } from '../shared/home-api'
import { INTEGRATIONS_CHANNELS } from '../shared/integrations-api'
import type {
  IntegrationsApi,
  IntegrationsStatus,
  SkillInstallState,
} from '../shared/integrations-api'
import { RESULT_STORE_CHANNELS } from '../shared/result-store-api'
import { DRIVE_CHANNELS } from '../shared/drive-api'
import type { DriveApi, DriveUiState } from '../shared/drive-api'
import type { ResultStoreApi } from '../shared/result-store-api'
import type { TabsApi, TabSummary } from '../shared/tabs-api'
import { TABS_CHANNELS } from '../shared/tabs-api'
import { SPLIT_TABS_CHANNELS } from '../shared/split-view-api'
import type { SplitHint, SplitViewState } from '../shared/split-view-api'
import type { GenerateHomeApi } from '../shared/generate-api'
import { GENERATE_HOME_CHANNELS } from '../shared/generate-home-channels'
import type { PdfToolsHomeApi } from '../shared/pdf-tools-api'
import { PDF_TOOLS_HOME_CHANNELS } from '../shared/pdf-tools-home-channels'
import { AGENT_HOME_OPEN_CHANNEL } from '../shared/agent-home-channel'
import {
  QUICK_LOOK_HOME_CHANNELS,
  normalizeQuickLookSettings,
  type QuickLookHomeApi,
  type QuickLookSettings,
} from '../shared/quick-look-home'
import type { QuickLookPayload } from '../shared/quick-look-api'
import type { SubscriptionApi } from '../shared/subscription-api'
import {
  SHELL_SUBSCRIPTION_CHANNELS,
  subscriptionLaunchResultOf,
  subscriptionStatusMapOf,
} from '../shared/subscription-api'

const UI_LANGUAGES: readonly UiLanguage[] = [
  'zh',
  'en',
  'ja',
  'ko',
  'fr',
  'de',
  'es',
  'th',
  'id',
  'ru',
  'ar',
  'pt',
  'it',
  'pl',
  'cs',
  'nl',
  'ms',
  'he',
  'hi',
  'zh-TW',
  'vi',
]

function isUiLanguage(value: unknown): value is UiLanguage {
  return UI_LANGUAGES.includes(value as UiLanguage)
}

const EMPTY_PAGE: RecentPage = { entries: [], total: 0, totalAll: 0 }

function asRecentPage(result: unknown): RecentPage {
  if (result && typeof result === 'object' && Array.isArray((result as RecentPage).entries)) {
    return result as RecentPage
  }
  return EMPTY_PAGE
}

const EMPTY_SEARCH: FileSearchPage = {
  hits: [],
  total: 0,
  index: { indexed: 0, pending: 0, scanning: false },
}

function asSearchPage(result: unknown): FileSearchPage {
  if (result && typeof result === 'object' && Array.isArray((result as FileSearchPage).hits)) {
    return result as FileSearchPage
  }
  return EMPTY_SEARCH
}

function normalizeDefaultAppStatus(result: unknown): DefaultAppStatus {
  const r = (result ?? {}) as Partial<DefaultAppStatus>
  const state = r.state
  return {
    state: state === 'default' || state === 'other' || state === 'unknown' ? state : 'unsupported',
    others: Array.isArray(r.others) ? r.others.filter((x) => typeof x === 'string') : [],
    manualOnly: r.manualOnly === true,
  }
}

const homeApi: HomeApi = {
  async recents(query) {
    return asRecentPage(await ipcRenderer.invoke(HOME_CHANNELS.recents, query))
  },
  async searchFiles(query) {
    return asSearchPage(await ipcRenderer.invoke(HOME_CHANNELS.searchFiles, query))
  },
  async rerankSearch(query) {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.rerankSearch, query)
    return result && typeof result === 'object' && Array.isArray((result as FileSearchRerank).order)
      ? (result as FileSearchRerank)
      : null
  },
  async getFileSearchSettings() {
    return (await ipcRenderer.invoke(HOME_CHANNELS.getFileSearchSettings)) as FileSearchSettings
  },
  async setFileSearchSettings(patch) {
    return (await ipcRenderer.invoke(
      HOME_CHANNELS.setFileSearchSettings,
      patch,
    )) as FileSearchSettings
  },
  async testFileSearchRerank(input) {
    const raw = ((await ipcRenderer.invoke(HOME_CHANNELS.testFileSearchRerank, input)) ?? {}) as {
      ok?: unknown
      error?: unknown
    }
    return raw.ok === true
      ? { ok: true }
      : { ok: false, error: typeof raw.error === 'string' ? raw.error : 'Connection failed' }
  },
  async starred(query) {
    return asRecentPage(await ipcRenderer.invoke(HOME_CHANNELS.starred, query))
  },
  async starredGroups() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.starredGroups)
    return Array.isArray(result) ? result.filter((g): g is string => typeof g === 'string') : []
  },
  async setStarredGroup(paths, group) {
    await ipcRenderer.invoke(HOME_CHANNELS.setStarredGroup, paths, group)
  },
  async statPaths(paths) {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.statPaths, paths)
    return Array.isArray(result) ? (result as RecentEntry[]) : []
  },
  async toggleStar(path) {
    if (typeof path !== 'string' || !path) throw new Error('Invalid path.')
    await ipcRenderer.invoke(HOME_CHANNELS.toggleStar, path)
  },
  async openHelp(topic) {
    await ipcRenderer.invoke(HOME_CHANNELS.openHelp, typeof topic === 'string' ? topic : undefined)
  },
  // knowledge-base ask panel (handlers live in the shell main, same process
  // that owns the index and the shared ai:stream registration)
  async kbList(scope) {
    return scope === undefined
      ? ipcRenderer.invoke('kb:list')
      : ipcRenderer.invoke('kb:list', { scope })
  },
  async kbSearch(query, scope) {
    return ipcRenderer.invoke('kb:search', scope === undefined ? query : { ...query, scope })
  },
  async kbRead(path, offset, scope) {
    return ipcRenderer.invoke(
      'kb:read',
      scope === undefined ? { path, offset } : { path, offset, scope },
    )
  },
  async kbOpenScope(group) {
    const scope: unknown = await ipcRenderer.invoke('kb:open-scope', group)
    if (typeof scope !== 'string' || !scope) throw new Error('knowledge-base scope is not open')
    return scope
  },
  async kbCloseScope(scope) {
    await ipcRenderer.invoke('kb:close-scope', scope)
  },
  async aiGetSettings() {
    return ipcRenderer.invoke('ai:get-settings')
  },
  async aiStream(request) {
    await ipcRenderer.invoke('ai:stream', request)
  },
  async aiStreamCancel(requestId) {
    await ipcRenderer.invoke('ai:stream-cancel', requestId)
  },
  onAiStream(handler) {
    const listener = (_event: Electron.IpcRendererEvent, chunk: unknown) => handler(chunk as never)
    ipcRenderer.on('ai:stream-chunk', listener)
    return () => ipcRenderer.removeListener('ai:stream-chunk', listener)
  },
  async openPath(path) {
    if (typeof path !== 'string' || !path) throw new Error('Invalid path.')
    await ipcRenderer.invoke(HOME_CHANNELS.openPath, path)
  },
  async browse() {
    await ipcRenderer.invoke(HOME_CHANNELS.browse)
  },
  async newDoc(opts) {
    await ipcRenderer.invoke(HOME_CHANNELS.newDoc, opts)
  },
  async newSheet(opts) {
    await ipcRenderer.invoke(HOME_CHANNELS.newSheet, opts)
  },
  async newSlide(opts) {
    await ipcRenderer.invoke(HOME_CHANNELS.newSlide, opts)
  },
  async newMarkdown(opts) {
    await ipcRenderer.invoke(HOME_CHANNELS.newMarkdown, opts)
  },
  async newHtml(opts) {
    await ipcRenderer.invoke(HOME_CHANNELS.newHtml, opts)
  },
  async newMindmap(opts) {
    await ipcRenderer.invoke(HOME_CHANNELS.newMindmap, opts)
  },
  async newDrawing(opts) {
    await ipcRenderer.invoke(HOME_CHANNELS.newDrawing, opts)
  },
  async newHwp(opts) {
    await ipcRenderer.invoke(HOME_CHANNELS.newHwp, opts)
  },
  async newPdf(opts) {
    await ipcRenderer.invoke(HOME_CHANNELS.newPdf, opts)
  },
  async removeRecent(paths) {
    await ipcRenderer.invoke(HOME_CHANNELS.removeRecent, paths)
  },
  async unstarPaths(paths) {
    await ipcRenderer.invoke(HOME_CHANNELS.unstarPaths, paths)
  },
  async revealPath(path) {
    if (typeof path !== 'string' || !path) throw new Error('Invalid path.')
    await ipcRenderer.invoke(HOME_CHANNELS.revealPath, path)
  },
  async renameFile(path, newName) {
    if (typeof path !== 'string' || !path) throw new Error('Invalid path.')
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.renameFile, path, newName)
    return (result ?? { ok: false, error: 'Rename failed' }) as RenameResult
  },
  async duplicateFile(path) {
    if (typeof path !== 'string' || !path) throw new Error('Invalid path.')
    await ipcRenderer.invoke(HOME_CHANNELS.duplicateFile, path)
  },
  async deleteFiles(paths) {
    await ipcRenderer.invoke(HOME_CHANNELS.deleteFiles, paths)
  },
  async folderRoots() {
    return (await ipcRenderer.invoke(HOME_CHANNELS.folderRoots)) as FolderRoot[]
  },
  async addFolderRoot() {
    return (await ipcRenderer.invoke(HOME_CHANNELS.addFolderRoot)) as FolderRoot | null
  },
  async dropFolderRoots(paths) {
    return (await ipcRenderer.invoke(HOME_CHANNELS.dropFolderRoots, paths)) as FolderRoot[]
  },
  async removeFolderRoot(path) {
    await ipcRenderer.invoke(HOME_CHANNELS.removeFolderRoot, path)
  },
  pathForFile(file) {
    return webUtils.getPathForFile(file)
  },
  async listFolder(dir) {
    return (await ipcRenderer.invoke(HOME_CHANNELS.listFolder, dir)) as FolderListing
  },
  async createFolder(parent, name) {
    return (await ipcRenderer.invoke(HOME_CHANNELS.createFolder, parent, name)) as RenameResult
  },
  async renameFolder(dir, newName) {
    return (await ipcRenderer.invoke(HOME_CHANNELS.renameFolder, dir, newName)) as RenameResult
  },
  async movePaths(paths, targetDir, onConflict) {
    return (await ipcRenderer.invoke(
      HOME_CHANNELS.movePaths,
      paths,
      targetDir,
      onConflict,
    )) as MoveResult
  },
  async deleteFolder(dir) {
    await ipcRenderer.invoke(HOME_CHANNELS.deleteFolder, dir)
  },
  onFolderChanged(handler) {
    const listener = (_event: IpcRendererEvent, dirs: unknown) => {
      if (Array.isArray(dirs)) handler(dirs.filter((d): d is string => typeof d === 'string'))
    }
    ipcRenderer.on(HOME_CHANNELS.folderChanged, listener)
    return () => ipcRenderer.removeListener(HOME_CHANNELS.folderChanged, listener)
  },
  async openTrash() {
    await ipcRenderer.invoke(HOME_CHANNELS.openTrash)
  },
  async getLanguage() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.getLanguage)
    return isUiLanguage(result) ? result : 'zh'
  },
  async setLanguage(lang) {
    if (!isUiLanguage(lang)) throw new Error('Invalid language.')
    await ipcRenderer.invoke(HOME_CHANNELS.setLanguage, lang)
  },
  async getUpdateChannel() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.getUpdateChannel)
    return result === 'beta' ? 'beta' : 'stable'
  },
  async setUpdateChannel(channel) {
    // validated inline: a runtime import from ../shared/update-api would be
    // shared with the update.ts preload entry and get split into a chunk,
    // which sandboxed preload scripts cannot load (window.aiOffice would
    // silently disappear). Preload entries must stay single-file bundles.
    if (channel !== 'stable' && channel !== 'beta') throw new Error('Invalid update channel.')
    await ipcRenderer.invoke(HOME_CHANNELS.setUpdateChannel, channel)
  },
  onOpenSettings(handler) {
    const listener = (_event: IpcRendererEvent, target: { section: string }) => handler(target)
    ipcRenderer.on(HOME_CHANNELS.openSettings, listener)
    return () => ipcRenderer.removeListener(HOME_CHANNELS.openSettings, listener)
  },
  async getAppVersion() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.getAppVersion)
    return typeof result === 'string' ? result : ''
  },
  async getUpdateState() {
    const result: unknown = await ipcRenderer.invoke('update:get-state')
    return (result as UpdateUiState | null) ?? null
  },
  async openUpdateDialog() {
    const result: unknown = await ipcRenderer.invoke('update:open-for-update')
    return result === true
  },
  onUpdateStateChanged(handler: (state: UpdateUiState) => void) {
    const listener = (_e: IpcRendererEvent, state: UpdateUiState) => handler(state)
    ipcRenderer.on('update:state-changed', listener)
    return () => ipcRenderer.removeListener('update:state-changed', listener)
  },
  async onboardingSeen() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.onboardingSeen)
    return result === true
  },
  async setOnboardingSeen() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.setOnboardingSeen)
    return result === true
  },
  async getTheme() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.getTheme)
    return result === 'dark' || result === 'light' ? result : 'system'
  },
  async setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark' && theme !== 'system')
      throw new Error('Invalid theme.')
    await ipcRenderer.invoke(HOME_CHANNELS.setTheme, theme)
  },
  async getDocumentTheme() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.getDocumentTheme)
    return result === 'dark' || result === 'light' ? result : 'follow'
  },
  async setDocumentTheme(theme) {
    if (theme !== 'light' && theme !== 'dark' && theme !== 'follow')
      throw new Error('Invalid document theme.')
    await ipcRenderer.invoke(HOME_CHANNELS.setDocumentTheme, theme)
  },
  async getAutoSaveDefault() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.getAutoSaveDefault)
    const r = result as { on?: unknown; updatedAt?: unknown } | null
    return {
      on: r?.on === true,
      updatedAt: typeof r?.updatedAt === 'number' ? r.updatedAt : 0,
    }
  },
  async setAutoSaveDefault(on) {
    if (typeof on !== 'boolean') throw new Error('Invalid AutoSave default.')
    await ipcRenderer.invoke(HOME_CHANNELS.setAutoSaveDefault, on)
  },
  async getMcpStatus() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.getMcpStatus)
    const r = result as {
      running?: unknown
      enabled?: unknown
      port?: unknown
      background?: unknown
      logging?: unknown
      url?: unknown
      capabilities?: unknown
      error?: unknown
    } | null
    return {
      running: r?.running === true,
      enabled: r?.enabled === true,
      port: typeof r?.port === 'number' ? r.port : 3093,
      background: r?.background === true,
      logging: r?.logging === true,
      url: typeof r?.url === 'string' ? r.url : null,
      capabilities: Array.isArray(r?.capabilities)
        ? r.capabilities.filter((c): c is string => typeof c === 'string')
        : ['docs'],
      ...(typeof r?.error === 'string' ? { error: r.error } : {}),
    }
  },
  async setMcpSettings(patch: {
    enabled?: boolean
    port?: number
    background?: boolean
    logging?: boolean
  }) {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.setMcpSettings, patch)
    const r = result as {
      running?: unknown
      enabled?: unknown
      port?: unknown
      background?: unknown
      logging?: unknown
      url?: unknown
      capabilities?: unknown
      error?: unknown
    } | null
    return {
      running: r?.running === true,
      enabled: r?.enabled === true,
      port: typeof r?.port === 'number' ? r.port : 3093,
      background: r?.background === true,
      logging: r?.logging === true,
      url: typeof r?.url === 'string' ? r.url : null,
      capabilities: Array.isArray(r?.capabilities)
        ? r.capabilities.filter((c): c is string => typeof c === 'string')
        : ['docs'],
      ...(typeof r?.error === 'string' ? { error: r.error } : {}),
    }
  },
  async getMcpLogs() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.getMcpLogs)
    return Array.isArray(result) ? result.filter((l): l is string => typeof l === 'string') : []
  },
  async clearMcpLogs() {
    await ipcRenderer.invoke(HOME_CHANNELS.clearMcpLogs)
  },
  async openMcpLogFile() {
    await ipcRenderer.invoke(HOME_CHANNELS.openMcpLogFile)
  },
  async getAiPanelPrefs() {
    return normalizeAiPanelPrefs(await ipcRenderer.invoke(HOME_CHANNELS.getAiPanelPrefs))
  },
  async setAiPanelPrefs(patch) {
    return normalizeAiPanelPrefs(await ipcRenderer.invoke(HOME_CHANNELS.setAiPanelPrefs, patch))
  },
  async getDefaultSaveDir() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.getDefaultSaveDir)
    return typeof result === 'string' ? result : ''
  },
  async getDefaultAppStatus() {
    return normalizeDefaultAppStatus(await ipcRenderer.invoke(HOME_CHANNELS.getDefaultAppStatus))
  },
  async setDefaultApp() {
    return normalizeDefaultAppStatus(await ipcRenderer.invoke(HOME_CHANNELS.setDefaultApp))
  },
  async pickDefaultSaveDir() {
    const result: unknown = await ipcRenderer.invoke(HOME_CHANNELS.pickDefaultSaveDir)
    return typeof result === 'string' && result ? result : null
  },
  onThemeChanged(handler) {
    const listener = (_event: Electron.IpcRendererEvent, theme: unknown) => {
      if (theme === 'light' || theme === 'dark' || theme === 'system') handler(theme)
    }
    ipcRenderer.on('app:theme-changed', listener)
    return () => ipcRenderer.removeListener('app:theme-changed', listener)
  },
  onDocumentThemeChanged(handler) {
    const listener = (_event: Electron.IpcRendererEvent, theme: unknown) => {
      if (theme === 'light' || theme === 'dark' || theme === 'follow') handler(theme)
    }
    ipcRenderer.on('app:document-theme-changed', listener)
    return () => ipcRenderer.removeListener('app:document-theme-changed', listener)
  },
  async openGitHubRepo() {
    await ipcRenderer.invoke(HOME_CHANNELS.openGitHubRepo)
  },
  async openFeedbackSurvey() {
    await ipcRenderer.invoke(HOME_CHANNELS.openFeedbackSurvey)
  },
  async openLicenseNotices() {
    await ipcRenderer.invoke(HOME_CHANNELS.openLicenseNotices)
  },
  async openRightsContact() {
    await ipcRenderer.invoke(HOME_CHANNELS.openRightsContact)
  },
  // AI settings channels are registered once by the shell's aggregated docs handlers
  onAiSettingsChanged(handler) {
    const listener = () => handler()
    ipcRenderer.on('ai:settings-changed', listener)
    return () => ipcRenderer.removeListener('ai:settings-changed', listener)
  },
  async getAiSettings() {
    return (await ipcRenderer.invoke('ai:get-settings')) as AiSettings
  },
  async setAiSettings(settings) {
    await ipcRenderer.invoke('ai:set-settings', settings)
  },
  getAiProviders() {
    return AI_PROVIDERS.map((meta) => {
      let defaultBaseUrl = ''
      // custom has no default — it stays ''
      if (!meta.needsBaseUrl && !meta.needsCliPath) {
        defaultBaseUrl = getProviderAdapter(meta.id).resolveEndpoint({
          apiKey: '',
          model: meta.defaultModel,
        }).baseUrl
      }
      return { ...meta, defaultBaseUrl }
    })
  },
  async getCodexModels(cliPath) {
    return (await ipcRenderer.invoke('ai:codex-models', cliPath)) as CodexModelCatalog
  },
  async getCustomModels(baseUrl, apiKey) {
    return (await ipcRenderer.invoke('ai:custom-models', { baseUrl, apiKey })) as CodexModelCatalog
  },
  async testAiSettings(settings) {
    const result: unknown = await ipcRenderer.invoke('ai:chat', {
      settings,
      system: 'You are a connectivity test. Reply with the single word OK.',
      user: 'ping',
    })
    const raw = (result ?? {}) as { ok?: unknown; error?: unknown }
    return raw.ok === true
      ? { ok: true }
      : { ok: false, error: typeof raw.error === 'string' ? raw.error : 'Connection failed' }
  },
  getAiMediaProviders() {
    return AI_MEDIA_PROVIDERS
  },
  getAiSearchProviders() {
    return AI_SEARCH_PROVIDERS
  },
  async testAiSearchSettings(input) {
    const raw = ((await ipcRenderer.invoke('ai:search-test', input)) ?? {}) as {
      ok?: unknown
      error?: unknown
    }
    return raw.ok === true
      ? { ok: true }
      : { ok: false, error: typeof raw.error === 'string' ? raw.error : 'Connection failed' }
  },
  async testAiMediaSettings(input) {
    const raw = ((await ipcRenderer.invoke('ai:media-test', input)) ?? {}) as {
      ok?: unknown
      error?: unknown
    }
    return raw.ok === true
      ? { ok: true }
      : { ok: false, error: typeof raw.error === 'string' ? raw.error : 'Connection failed' }
  },
  async connectFreeAi(input) {
    return freeAiConnectResultOf(await ipcRenderer.invoke(FREE_AI_IPC_CHANNELS.connect, input))
  },
  async cancelFreeAiConnect() {
    await ipcRenderer.invoke(FREE_AI_IPC_CHANNELS.cancel)
  },
  async disconnectFreeAi(provider) {
    await ipcRenderer.invoke(FREE_AI_IPC_CHANNELS.disconnect, { provider })
  },
  async getFreeAiQuota(provider) {
    return freeAiQuotaOf(await ipcRenderer.invoke(FREE_AI_IPC_CHANNELS.quota, { provider }))
  },
  async openFreeAiKeyPage(provider) {
    await ipcRenderer.invoke(FREE_AI_IPC_CHANNELS.openKeyPage, { provider })
  },
}

contextBridge.exposeInMainWorld('aiOffice', homeApi)

const integrationsApi: IntegrationsApi = {
  async status() {
    return (await ipcRenderer.invoke(INTEGRATIONS_CHANNELS.status)) as IntegrationsStatus
  },
  async installSkill(target) {
    return (await ipcRenderer.invoke(
      INTEGRATIONS_CHANNELS.installSkill,
      target,
    )) as SkillInstallState
  },
  async uninstallSkill(agentId) {
    return (await ipcRenderer.invoke(
      INTEGRATIONS_CHANNELS.uninstallSkill,
      agentId,
    )) as SkillInstallState
  },
  async pickSkillDir(title) {
    const r: unknown = await ipcRenderer.invoke(INTEGRATIONS_CHANNELS.pickSkillDir, title)
    return typeof r === 'string' ? r : null
  },
  async saveSkillZip(title) {
    const r: unknown = await ipcRenderer.invoke(INTEGRATIONS_CHANNELS.saveSkillZip, title)
    return typeof r === 'string' ? r : null
  },
  async copyText(text) {
    await ipcRenderer.invoke(INTEGRATIONS_CHANNELS.copyText, text)
  },
}
contextBridge.exposeInMainWorld('aiOfficeIntegrations', integrationsApi)

const resultStoreApi: ResultStoreApi = {
  async size() {
    const r: unknown = await ipcRenderer.invoke(RESULT_STORE_CHANNELS.size)
    return typeof r === 'number' && Number.isFinite(r) && r >= 0 ? r : 0
  },
  async deleteAll() {
    await ipcRenderer.invoke(RESULT_STORE_CHANNELS.deleteAll)
  },
}
contextBridge.exposeInMainWorld('aiOfficeResultStore', resultStoreApi)

// Google Drive (decision 0033): state, browsing and opening. Main keeps the
// tokens; this bridge only carries states, file lists and file ids.
const driveApi: DriveApi = {
  state: () => ipcRenderer.invoke(DRIVE_CHANNELS.state) as Promise<DriveUiState>,
  onStateChanged(listener) {
    const handler = (_event: IpcRendererEvent, state: DriveUiState) => listener(state)
    ipcRenderer.on(DRIVE_CHANNELS.stateChanged, handler)
    return () => {
      ipcRenderer.removeListener(DRIVE_CHANNELS.stateChanged, handler)
    }
  },
  connect: () => ipcRenderer.invoke(DRIVE_CHANNELS.connect),
  async cancelConnect() {
    await ipcRenderer.invoke(DRIVE_CHANNELS.cancelConnect)
  },
  async disconnect() {
    await ipcRenderer.invoke(DRIVE_CHANNELS.disconnect)
  },
  setAiAccess: (on) => ipcRenderer.invoke(DRIVE_CHANNELS.setAiAccess, on === true),
  list: (listing, pageToken) => ipcRenderer.invoke(DRIVE_CHANNELS.list, listing, pageToken),
  open: (fileId) => ipcRenderer.invoke(DRIVE_CHANNELS.open, fileId),
}
contextBridge.exposeInMainWorld('aiOfficeDrive', driveApi)

// the person's skills: settings → skills, the home AI question's `/` list,
// skill reads and cards (the main process checks every request again)
contextBridge.exposeInMainWorld(USER_SKILLS_BRIDGE_KEY, userSkillsBridge())

// Subscription channels are registered once for the whole app by the docs main.
// Until that handler exists an invoke rejects; the renderer reads that as
// "still checking" (see renderer/src/subscription-client.ts).
const subscriptionApi: SubscriptionApi = {
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
  async logout(provider) {
    return subscriptionLaunchResultOf(
      await ipcRenderer.invoke(SUBSCRIPTION_IPC_CHANNELS.logout, { provider }),
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
  async codexImageAvailable() {
    return (await ipcRenderer.invoke(SUBSCRIPTION_IPC_CHANNELS.codexImage)) === true
  },
  onChanged(handler) {
    const listener = (_event: IpcRendererEvent, statuses: unknown) =>
      handler(subscriptionStatusMapOf(statuses))
    ipcRenderer.on(SUBSCRIPTION_IPC_CHANNELS.changed, listener)
    return () => ipcRenderer.removeListener(SUBSCRIPTION_IPC_CHANNELS.changed, listener)
  },
  async openInstallHelp(provider) {
    await ipcRenderer.invoke(SHELL_SUBSCRIPTION_CHANNELS.openInstallHelp, provider)
  },
}
contextBridge.exposeInMainWorld('aiOfficeSubscription', subscriptionApi)

const tabsApi: TabsApi = {
  async list() {
    const result: unknown = await ipcRenderer.invoke(TABS_CHANNELS.list)
    return Array.isArray(result) ? (result as TabSummary[]) : []
  },
  async activate(id) {
    await ipcRenderer.invoke(TABS_CHANNELS.activate, id)
  },
  async close(id) {
    await ipcRenderer.invoke(TABS_CHANNELS.close, id)
  },
  async showMenu(x, y) {
    await ipcRenderer.invoke(TABS_CHANNELS.showMenu, x, y)
  },
  async showNewMenu(x, y) {
    await ipcRenderer.invoke(TABS_CHANNELS.showNewMenu, x, y)
  },
  async showTabMenu(id, x, y) {
    await ipcRenderer.invoke(TABS_CHANNELS.showTabMenu, id, x, y)
  },
  async detach(id) {
    await ipcRenderer.invoke(TABS_CHANNELS.detach, id)
  },
  async tearOff(id, screenX, screenY) {
    const result: unknown = await ipcRenderer.invoke(TABS_CHANNELS.tearOff, id, screenX, screenY)
    return result === true
  },
  dragTornWindow(screenX, screenY) {
    ipcRenderer.send(TABS_CHANNELS.dragTornWindow, screenX, screenY)
  },
  async dockTornWindow(index) {
    await ipcRenderer.invoke(TABS_CHANNELS.dockTornWindow, index)
  },
  async endTornDrag() {
    await ipcRenderer.invoke(TABS_CHANNELS.endTornDrag)
  },
  onDockPreview(handler) {
    const listener = (_event: IpcRendererEvent, preview: { x: number } | null) =>
      handler(preview && typeof preview.x === 'number' ? { x: preview.x } : null)
    ipcRenderer.on(TABS_CHANNELS.dockPreview, listener)
    return () => ipcRenderer.removeListener(TABS_CHANNELS.dockPreview, listener)
  },
  reportDockIndex(index) {
    ipcRenderer.send(TABS_CHANNELS.dockIndex, index)
  },
  async showAppMenu(x, y) {
    await ipcRenderer.invoke(TABS_CHANNELS.showAppMenu, x, y)
  },
  async reorder(id, toIndex) {
    await ipcRenderer.invoke(TABS_CHANNELS.reorder, id, toIndex)
  },
  onChanged(handler) {
    const listener = (_event: IpcRendererEvent, tabs: TabSummary[]) => handler(tabs)
    ipcRenderer.on(TABS_CHANNELS.changed, listener)
    return () => ipcRenderer.removeListener(TABS_CHANNELS.changed, listener)
  },
  async getSplit() {
    return (await ipcRenderer.invoke(SPLIT_TABS_CHANNELS.get)) as SplitViewState | null
  },
  setSplitRatio(ratio) {
    ipcRenderer.send(SPLIT_TABS_CHANNELS.setRatio, ratio)
  },
  onSplitChanged(handler) {
    const listener = (_event: IpcRendererEvent, state: SplitViewState | null) => handler(state)
    ipcRenderer.on(SPLIT_TABS_CHANNELS.changed, listener)
    return () => ipcRenderer.removeListener(SPLIT_TABS_CHANNELS.changed, listener)
  },
  onSplitHint(handler) {
    const listener = (_event: IpcRendererEvent, hint: SplitHint | null) => handler(hint)
    ipcRenderer.on(SPLIT_TABS_CHANNELS.hint, listener)
    return () => ipcRenderer.removeListener(SPLIT_TABS_CHANNELS.hint, listener)
  },
  notifyChromePressed() {
    ipcRenderer.send(TABS_CHANNELS.chromePressed)
  },
  onChromePressed(handler) {
    const listener = () => handler()
    ipcRenderer.on('app:chrome-pressed', listener)
    return () => ipcRenderer.removeListener('app:chrome-pressed', listener)
  },
}

contextBridge.exposeInMainWorld('aiOfficeTabs', tabsApi)

// Home's entry points into the generate window ("make a new document from these files")
const generateHomeApi: GenerateHomeApi = {
  async openWithPaths(paths) {
    await ipcRenderer.invoke(GENERATE_HOME_CHANNELS.openWithPaths, paths)
  },
  async openWithGroup(group) {
    await ipcRenderer.invoke(GENERATE_HOME_CHANNELS.openWithGroup, group)
  },
}
contextBridge.exposeInMainWorld('aiOfficeGenerate', generateHomeApi)

// Home's entry into the PDF tools window
const pdfToolsHomeApi: PdfToolsHomeApi = {
  async open() {
    await ipcRenderer.invoke(PDF_TOOLS_HOME_CHANNELS.open)
  },
}
contextBridge.exposeInMainWorld('aiOfficePdfToolsHome', pdfToolsHomeApi)
// Home's entry point into the agent window (decision 0032); the window has its own preload
contextBridge.exposeInMainWorld('aiOfficeAgent', {
  async open() {
    await ipcRenderer.invoke(AGENT_HOME_OPEN_CHANNEL)
  },
})

const quickLookHomeApi: QuickLookHomeApi = {
  async preview(path: string) {
    if (typeof path !== 'string' || !path.trim()) {
      return {
        ok: false,
        path: '',
        name: '',
        ext: '',
        family: 'unsupported',
        sizeBytes: 0,
        mtimeMs: 0,
        truncated: false,
        error: 'unreadable',
      }
    }
    const result = (await ipcRenderer.invoke(
      QUICK_LOOK_HOME_CHANNELS.preview,
      path,
    )) as QuickLookPayload | null
    return (
      result ?? {
        ok: false,
        path,
        name: path,
        ext: '',
        family: 'unsupported',
        sizeBytes: 0,
        mtimeMs: 0,
        truncated: false,
        error: 'unreadable',
      }
    )
  },
  async getSettings() {
    const raw = await ipcRenderer.invoke(QUICK_LOOK_HOME_CHANNELS.getSettings)
    return normalizeQuickLookSettings(raw)
  },
  async setSettings(settings: Partial<QuickLookSettings>) {
    const raw = await ipcRenderer.invoke(QUICK_LOOK_HOME_CHANNELS.setSettings, settings)
    return normalizeQuickLookSettings(raw)
  },
}
contextBridge.exposeInMainWorld('aiOfficeQuickLookHome', quickLookHomeApi)

// open documents dragged from the OS anywhere over Home or the tab strip
installDropOpenBridge()
