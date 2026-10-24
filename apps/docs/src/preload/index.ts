import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { driveAiBridge } from '@genoffice/electron-utils/drive-ai-bridge'
import { outboundBridge } from '@genoffice/electron-utils/outbound-bridge'
import { userSkillsBridge } from '@genoffice/electron-utils/user-skills-bridge'
import { USER_SKILLS_BRIDGE_KEY } from '@genoffice/electron-utils/user-skills-channels'
import { docAttachBridge } from '@genoffice/electron-utils/doc-attach-bridge'
import { DOC_ATTACH_BRIDGE_KEY } from '@genoffice/electron-utils/doc-attach-channels'
import { splitPaneBridge } from '@genoffice/electron-utils/split-pane-bridge'
import type { IpcRendererEvent } from 'electron'
import { SUBSCRIPTION_IPC_CHANNELS } from '@genoffice/ai-provider/browser'
import { VIEW_IMAGE_CHANNEL } from '../shared/ipc'
import { subscriptionLaunchResultOf, subscriptionStatusMapOf } from '../shared/subscription-api'
import type { SubscriptionApi } from '../shared/subscription-api'
import type { AiPanelPrefs } from '@genoffice/ui'
import type {
  AiChatRequest,
  AiSettings,
  AiStreamChunk,
  AiStreamRequest,
  DesktopApi,
  PdfInternalLink,
  MarkdownImage,
  PrintJobOptions,
  MenuCommand,
  AutoSaveDefault,
  ContextMenuRequest,
  DocTheme,
  UiTheme,
  ZoteroRendererRequest,
} from '../shared/ipc'
import type { DocFormat } from '../shared/open-file'
import type { ProjectApi } from '@genoffice/project-store'
import { installDropOpenBridge } from '@genoffice/electron-utils/drop-open'

const api: DesktopApi = {
  getLanguage: () => ipcRenderer.invoke('app:get-language'),
  getSystemLocale: () => ipcRenderer.invoke('docs:system-locale'),
  onLanguageChanged: (handler) => {
    const listener = (
      _event: IpcRendererEvent,
      lang: 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'th' | 'id' | 'ru' | 'ar',
    ) => handler(lang)
    ipcRenderer.on('app:language-changed', listener)
    return () => ipcRenderer.removeListener('app:language-changed', listener)
  },
  getTheme: () => ipcRenderer.invoke('app:get-theme'),
  onThemeChanged: (handler) => {
    const listener = (_event: IpcRendererEvent, theme: UiTheme) => handler(theme)
    ipcRenderer.on('app:theme-changed', listener)
    return () => ipcRenderer.removeListener('app:theme-changed', listener)
  },
  getDocumentTheme: async () => {
    const result: unknown = await ipcRenderer.invoke('app:get-document-theme')
    return result === 'dark' || result === 'light' ? result : 'follow'
  },
  onDocumentThemeChanged: (handler) => {
    const listener = (_event: IpcRendererEvent, theme: DocTheme) => handler(theme)
    ipcRenderer.on('app:document-theme-changed', listener)
    return () => ipcRenderer.removeListener('app:document-theme-changed', listener)
  },
  getAutoSaveDefault: () => ipcRenderer.invoke('app:get-auto-save-default'),
  onAutoSaveDefaultChanged: (handler) => {
    const listener = (_event: IpcRendererEvent, value: AutoSaveDefault) => handler(value)
    ipcRenderer.on('app:auto-save-default-changed', listener)
    return () => ipcRenderer.removeListener('app:auto-save-default-changed', listener)
  },
  getAuthorName: () => ipcRenderer.invoke('app:get-author-name'),
  onAuthorNameChanged: (handler) => {
    const listener = (_event: IpcRendererEvent, name: unknown) => {
      if (typeof name === 'string') handler(name)
    }
    ipcRenderer.on('app:author-name-changed', listener)
    return () => ipcRenderer.removeListener('app:author-name-changed', listener)
  },
  getAiPanelPrefs: () => ipcRenderer.invoke('app:get-ai-panel-prefs'),
  setAiPanelPrefs: (patch) => ipcRenderer.invoke('app:set-ai-panel-prefs', patch),
  onAiPanelPrefsChanged: (handler) => {
    const listener = (_event: IpcRendererEvent, prefs: AiPanelPrefs) => handler(prefs)
    ipcRenderer.on('app:ai-panel-prefs-changed', listener)
    return () => ipcRenderer.removeListener('app:ai-panel-prefs-changed', listener)
  },
  onChromePressed: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('app:chrome-pressed', listener)
    return () => ipcRenderer.removeListener('app:chrome-pressed', listener)
  },
  zoteroCommand: (command) => ipcRenderer.invoke('zotero:command', command),
  onZoteroRequest: (handler) => {
    const listener = (_event: IpcRendererEvent, request: ZoteroRendererRequest) => handler(request)
    ipcRenderer.on('zotero:request', listener)
    return () => ipcRenderer.removeListener('zotero:request', listener)
  },
  respondToZotero: (response) => ipcRenderer.send('zotero:response', response),
  openDocx: () => ipcRenderer.invoke('docs:open'),
  openDocxPath: (path: string) => ipcRenderer.invoke('docs:open-path', path),
  confirmDocumentReplace: () => ipcRenderer.invoke('docs:confirm-document-replace'),
  convertAltChunkHtml: (html: string) => ipcRenderer.invoke('docs:altchunk-html-to-docx', html),
  openDocxDecrypt: (path: string, password: string) =>
    ipcRenderer.invoke('docs:open-decrypt', path, password),
  setDocPassword: (filePath: string | null, password: string | null) =>
    ipcRenderer.invoke('docs:set-password', filePath, password),
  docPasswordIntentRevision: async () => {
    const revision: unknown = await ipcRenderer.invoke('docs:password-intent-revision')
    return typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0
      ? revision
      : 0
  },
  discardDocPasswordIntents: (throughRevision: number) =>
    ipcRenderer.invoke('docs:discard-password-intents', throughRevision),
  consumePendingOpenDocx: () => ipcRenderer.invoke('docs:consume-pending-open'),
  consumeNewBlankDoc: () => ipcRenderer.invoke('docs:consume-new-blank'),
  consumeAiDocContent: () => ipcRenderer.invoke('docs:consume-ai-doc-content'),
  consumeDocCopy: () => ipcRenderer.invoke('docs:consume-copy'),
  consumeHeadlessExport: () => ipcRenderer.invoke('docs:consume-headless-export'),
  headlessExportDone: (result: { ok: boolean; error?: string }) =>
    ipcRenderer.send('docs:headless-export-done', result),
  createDocument: (request) => ipcRenderer.invoke('docs:create-document', request),
  onOpenDocx: (handler) => {
    const listener = (_event: IpcRendererEvent, result: Parameters<typeof handler>[0]) =>
      handler(result)
    ipcRenderer.on('docs:opened', listener)
    return () => ipcRenderer.removeListener('docs:opened', listener)
  },
  onRenamedDocx: (handler) => {
    const listener = (_event: IpcRendererEvent, paths: Parameters<typeof handler>[0]) =>
      handler(paths)
    ipcRenderer.on('docs:renamed', listener)
    return () => ipcRenderer.removeListener('docs:renamed', listener)
  },
  saveDocx: (path: string, data: ArrayBuffer, auto?: boolean) =>
    ipcRenderer.invoke('docs:save', path, data, auto === true),
  writeRecoveryCopy: (
    path: string | null,
    data: ArrayBuffer,
    meta?: { title: string; format: 'docx' | 'odt' },
  ) => ipcRenderer.invoke('docs:write-recovery', path, data, meta),
  onWriteRecoveryNow: (handler) => {
    const listener = (_event: IpcRendererEvent, token: unknown) =>
      handler(() => ipcRenderer.send('docs:write-recovery-now-done', token))
    ipcRenderer.on('docs:write-recovery-now', listener)
    return () => {
      ipcRenderer.removeListener('docs:write-recovery-now', listener)
    }
  },
  onRecoveryCopyDropped: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('docs:recovery-copy-dropped', listener)
    return () => {
      ipcRenderer.removeListener('docs:recovery-copy-dropped', listener)
    }
  },
  onTeardown: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('docs:teardown', listener)
    return () => ipcRenderer.removeListener('docs:teardown', listener)
  },
  respellKick: () => ipcRenderer.invoke('docs:respell-kick'),
  spellDiag: (line: string) => ipcRenderer.send('docs:spell-diag', line),
  armContextMenu: () => ipcRenderer.send('docs:context-menu-arm'),
  claimContextMenu: (seq: number) => {
    ipcRenderer.sendSync('docs:context-menu-claim', seq)
  },
  onContextMenuRequest: (handler) => {
    const listener = (_event: IpcRendererEvent, request: ContextMenuRequest) => handler(request)
    ipcRenderer.on('docs:context-menu', listener)
    return () => ipcRenderer.removeListener('docs:context-menu', listener)
  },
  spellAddWord: (word: string) => ipcRenderer.invoke('docs:spell-add-word', word),
  spellIgnoreWord: (word: string) => ipcRenderer.invoke('docs:spell-ignore-word', word),
  spellReplace: (word: string) => ipcRenderer.invoke('docs:spell-replace', word),
  spellLanguages: () => ipcRenderer.invoke('docs:spell-languages'),
  spellSetLanguages: (langs: string[]) => ipcRenderer.invoke('docs:spell-set-languages', langs),
  pickSaveAsPath: (defaultName: string, sourcePath: string | null, format: DocFormat) =>
    ipcRenderer.invoke('docs:save-as-pick', defaultName, sourcePath, format),
  saveDocxAs: (path: string, data: ArrayBuffer, sourcePath?: string | null) =>
    ipcRenderer.invoke('docs:save-as', path, data, sourcePath ?? null),
  materializeDocx: (data: ArrayBuffer) => ipcRenderer.invoke('docs:materialize-docx', data),
  captureRect: (rect: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('docs:capture-rect', rect),
  saveDocxNew: (defaultName: string, data: ArrayBuffer) =>
    ipcRenderer.invoke('docs:save-new', defaultName, data),
  saveDocxTo: (path: string, data: ArrayBuffer, overwrite: boolean) =>
    ipcRenderer.invoke('docs:save-to', path, data, overwrite === true),
  onMcpCommand: (handler) => {
    const listener = (_event: IpcRendererEvent, message: Parameters<typeof handler>[0]) =>
      handler(message)
    ipcRenderer.on('docs:mcp-command', listener)
    return () => ipcRenderer.removeListener('docs:mcp-command', listener)
  },
  reportMcpResult: (result) => ipcRenderer.send('docs:mcp-result', result),
  signalMcpReady: () => ipcRenderer.send('docs:mcp-ready'),
  getRecentFiles: () => ipcRenderer.invoke('docs:recent'),
  pickImage: () => ipcRenderer.invoke('docs:pick-image'),
  fontMetrics: (family: string) => ipcRenderer.invoke('docs:font-metrics', family),
  fontFamilyInfo: (families) => ipcRenderer.invoke('app:font-family-info', families),
  print: (scale?: number, job?: PrintJobOptions) => ipcRenderer.invoke('docs:print', scale, job),
  listPrinters: () => ipcRenderer.invoke('docs:printers'),
  exportPdf: (
    defaultName: string,
    pageWidthTwips: number,
    pageHeightTwips: number,
    outPath?: string,
    scale?: number,
    links?: PdfInternalLink[],
  ) =>
    ipcRenderer.invoke(
      'docs:export-pdf',
      defaultName,
      pageWidthTwips,
      pageHeightTwips,
      outPath,
      scale,
      links,
    ),
  exportHtml: (defaultName: string, html: string, outPath?: string) =>
    ipcRenderer.invoke('docs:export-html', defaultName, html, outPath),
  exportMarkdown: (
    defaultName: string,
    markdown: string,
    images: MarkdownImage[],
    outPath?: string,
  ) => ipcRenderer.invoke('docs:export-markdown', defaultName, markdown, images, outPath),
  printPdfBuffer: (pageWidthTwips: number, pageHeightTwips: number, scale?: number) =>
    ipcRenderer.invoke('docs:print-pdf-buffer', pageWidthTwips, pageHeightTwips, scale),
  saveMergedPdf: (
    defaultName: string,
    base64Parts: string[],
    outPath?: string,
    links?: PdfInternalLink[],
  ) => ipcRenderer.invoke('docs:save-merged-pdf', defaultName, base64Parts, outPath, links),
  pickExportImagesTarget: () => ipcRenderer.invoke('docs:pick-export-images-target'),
  takeExportPdf: (pdfPath: string) => ipcRenderer.invoke('docs:take-export-pdf', pdfPath),
  writeExportImage: (dir: string, fileName: string, pngBase64: string) =>
    ipcRenderer.invoke('docs:write-export-image', dir, fileName, pngBase64),
  saveImageAs: (src: string) => ipcRenderer.invoke('docs:save-image-as', src),
  onViewImage: (handler) => {
    const listener = (_event: IpcRendererEvent, src: string) => handler(src)
    ipcRenderer.on(VIEW_IMAGE_CHANNEL, listener)
    return () => ipcRenderer.removeListener(VIEW_IMAGE_CHANNEL, listener)
  },
  getAiSettings: () => ipcRenderer.invoke('ai:get-settings'),
  setAiSettings: (settings: AiSettings) => ipcRenderer.invoke('ai:set-settings', settings),
  onAiSettingsChanged: (handler) => {
    const listener = () => handler()
    ipcRenderer.on('ai:settings-changed', listener)
    return () => ipcRenderer.removeListener('ai:settings-changed', listener)
  },
  openAiModelSettings: () => ipcRenderer.invoke('ai:open-model-settings'),
  aiChat: (request: AiChatRequest) => ipcRenderer.invoke('ai:chat', request),
  aiStream: (request: AiStreamRequest) => ipcRenderer.invoke('ai:stream', request),
  aiStreamCancel: (requestId: string) => ipcRenderer.invoke('ai:stream-cancel', requestId),
  aiToolCapabilities: () => ipcRenderer.invoke('ai:tool-capabilities'),
  webSearch: (query: string, maxResults?: number) =>
    ipcRenderer.invoke('ai:web-search', query, maxResults),
  readUrl: (url: string, offset?: number) => ipcRenderer.invoke('ai:read-url', url, offset),
  imageSearch: (query: string, maxResults?: number) =>
    ipcRenderer.invoke('ai:image-search', query, maxResults),
  analyzeMedia: (op: { mediaUrls: string[]; requirements: string }) =>
    ipcRenderer.invoke('docs:analyze-media', op),
  fetchImage: (url: string) => ipcRenderer.invoke('ai:fetch-image', url),
  aiGenerateImage: (op: { prompt: string; aspectRatio?: string }) =>
    ipcRenderer.invoke('docs:ai-generate-image', op),
  pickAttachments: () => ipcRenderer.invoke('files:pick'),
  addAttachmentPaths: (paths: string[]) => ipcRenderer.invoke('files:add', paths),
  addPastedImage: (data: ArrayBuffer, ext: string) =>
    ipcRenderer.invoke('files:add-pasted-image', data, ext),
  copyImageToClipboard: (dataUrl: string, metaJson?: string) =>
    ipcRenderer.invoke('docs:copy-image-to-clipboard', dataUrl, metaJson),
  readAttachment: (path: string, offset: number, maxChars: number) =>
    ipcRenderer.invoke('files:read', path, offset, maxChars),
  readAttachmentImage: (path: string) => ipcRenderer.invoke('files:read-image', path),
  kbList: () => ipcRenderer.invoke('kb:list'),
  kbSearch: (query: { q: string; limit?: number }) => ipcRenderer.invoke('kb:search', query),
  kbRead: (path: string, offset: number) => ipcRenderer.invoke('kb:read', { path, offset }),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  openNewTab: (openPath?: string | null) => ipcRenderer.invoke('win:new', openPath ?? null),
  openSourcePath: (path: string) => ipcRenderer.invoke('home:open-path', path),
  listDocsTabs: () => ipcRenderer.invoke('win:list'),
  focusDocsTab: (id: string) => ipcRenderer.invoke('win:focus', id),
  onAiStream: (handler: (chunk: AiStreamChunk) => void) => {
    const listener = (_event: IpcRendererEvent, chunk: AiStreamChunk) => handler(chunk)
    ipcRenderer.on('ai:stream-chunk', listener)
    return () => ipcRenderer.removeListener('ai:stream-chunk', listener)
  },
  onMenuCommand: (handler: (command: MenuCommand, payload?: string) => void) => {
    const listener = (_event: IpcRendererEvent, command: MenuCommand, payload?: string) =>
      handler(command, payload)
    ipcRenderer.on('menu:command', listener)
    return () => ipcRenderer.removeListener('menu:command', listener)
  },
  onCloseCheck: (handler: () => void) => {
    const listener = () => handler()
    ipcRenderer.on('docs:close-check', listener)
    return () => ipcRenderer.removeListener('docs:close-check', listener)
  },
  reportViewMenuState: (state: { aiSidebar: boolean; darkCanvas: boolean; odt?: boolean }) =>
    ipcRenderer.send('docs:view-menu-state', {
      aiSidebar: state?.aiSidebar === true,
      darkCanvas: state?.darkCanvas === true,
      odt: state?.odt === true,
    }),
  reportCloseCheck: (state: { dirty: boolean; autoSave: boolean; filePath?: string | null }) =>
    ipcRenderer.send('docs:close-check-result', {
      dirty: state?.dirty === true,
      autoSave: state?.autoSave === true,
      filePath: typeof state?.filePath === 'string' ? state.filePath : null,
    }),
  onCloseSaveRequest: (handler: () => void) => {
    const listener = () => handler()
    ipcRenderer.on('docs:close-save-request', listener)
    return () => ipcRenderer.removeListener('docs:close-save-request', listener)
  },
  reportCloseSaveResult: (ok: boolean) => ipcRenderer.send('docs:close-save-result', ok === true),
}

const projectApi: ProjectApi = {
  resolveChat: (args) => ipcRenderer.invoke('project:resolveChat', args),
  appendChat: (args) => ipcRenderer.invoke('project:appendChat', args),
  loadChat: (args) => ipcRenderer.invoke('project:loadChat', args),
  rebindChat: (args) => ipcRenderer.invoke('project:rebindChat', args),
}

// Same shape as the shell's own `window.aiOfficeSubscription`. The handlers are
// registered once per process (docs-main's registerAiIpc); should one be missing
// the invoke rejects and the renderer reads that as "still checking".
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
    const listener = (_event: IpcRendererEvent, statuses: unknown) =>
      handler(subscriptionStatusMapOf(statuses))
    ipcRenderer.on(SUBSCRIPTION_IPC_CHANNELS.changed, listener)
    return () => ipcRenderer.removeListener(SUBSCRIPTION_IPC_CHANNELS.changed, listener)
  },
}

contextBridge.exposeInMainWorld('desktop', api)
// Google Drive for this editor's AI: search and read only (decision 0033)
contextBridge.exposeInMainWorld('aiOfficeDriveAi', driveAiBridge())
contextBridge.exposeInMainWorld('aiOfficeOutbound', outboundBridge())
// the person's skills: the AI panel's `/` list and skill reads, skill cards (shell main checks each)
contextBridge.exposeInMainWorld(USER_SKILLS_BRIDGE_KEY, userSkillsBridge())
// The shell's document picker, for this editor's AI attach button
contextBridge.exposeInMainWorld(DOC_ATTACH_BRIDGE_KEY, docAttachBridge())
contextBridge.exposeInMainWorld('projectApi', projectApi)
contextBridge.exposeInMainWorld('aiOfficeSubscription', subscriptionApi)
// The shell's split panes: which pane this view is, and focus requests for it
contextBridge.exposeInMainWorld('aiOfficeSplit', splitPaneBridge(ipcRenderer))

// open documents dragged from the OS onto this tab as a new shell tab
installDropOpenBridge()
