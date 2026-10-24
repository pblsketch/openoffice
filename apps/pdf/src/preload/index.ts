import type { AiPanelPrefs } from '@genoffice/ui'
import { contextBridge, ipcRenderer } from 'electron'
import { driveAiBridge } from '@genoffice/electron-utils/drive-ai-bridge'
import { outboundBridge } from '@genoffice/electron-utils/outbound-bridge'
import { userSkillsBridge } from '@genoffice/electron-utils/user-skills-bridge'
import { USER_SKILLS_BRIDGE_KEY } from '@genoffice/electron-utils/user-skills-channels'
import type { Lang } from '@genoffice/i18n'
import type { AiStreamChunk } from '@genoffice/ai-provider'
import { SUBSCRIPTION_IPC_CHANNELS } from '@genoffice/ai-provider/browser'
import { installDropOpenBridge } from '@genoffice/electron-utils/drop-open'
import { splitPaneBridge } from '@genoffice/electron-utils/split-pane-bridge'
import { AI_CHANNELS, PDF_CHANNELS } from '../shared/ipc'
import type {
  PdfApi,
  PdfNoteResult,
  PdfRecoveryCopyResult,
  PdfStoreApi,
  PdfStructureApi,
  PdfStructureFailure,
  PdfStructureProgress,
  UiTheme,
} from '../shared/ipc'
import type { SubscriptionApi } from '../shared/subscription-api'
import {
  AI_TOOL_CAPABILITIES_CHANNEL,
  SUBSCRIPTION_CONNECT_HELP_CHANNEL,
  SUBSCRIPTION_INSTALL_HELP_CHANNEL,
  imageGenerationAvailableOf,
  subscriptionLaunchResultOf,
  subscriptionMeteredResultOf,
  subscriptionStatusMapOf,
} from '../shared/subscription-api'

// Subscription channels are registered once for the whole app by the docs main.
// A call may therefore reject (no handler yet, standalone pdf); the renderer
// treats that as "still checking" (see renderer/ai/useSubscriptionConnection.ts).
const subscription: SubscriptionApi = {
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

/** The one place that asks the app-wide AI host what the media tools can do (no handler = unavailable) */
async function imageGenerationAvailable(): Promise<boolean> {
  try {
    return imageGenerationAvailableOf(await ipcRenderer.invoke(AI_TOOL_CAPABILITIES_CHANNEL))
  } catch {
    return false
  }
}

// Structure jobs and the result store are shell-only handlers (the
// standalone pdf app has none): a rejected call answers like a failed one.
function outcome<T>(channel: string, ...args: unknown[]): Promise<T | PdfStructureFailure> {
  return (ipcRenderer.invoke(channel, ...args) as Promise<T>).catch(
    (err: unknown): PdfStructureFailure => ({
      ok: false,
      error: 'not-available',
      message: err instanceof Error ? err.message : String(err),
    }),
  )
}

const structure: PdfStructureApi = {
  pickTarget: (request) =>
    (ipcRenderer.invoke(PDF_CHANNELS.structurePickTarget, request) as Promise<string | null>).catch(
      () => null,
    ),
  tree: (request) => outcome(PDF_CHANNELS.structureTree, request),
  text: (request) => outcome(PDF_CHANNELS.structureText, request),
  convert: (request) => outcome(PDF_CHANNELS.structureConvert, request),
  extractImages: (request) => outcome(PDF_CHANNELS.structureExtractImages, request),
  writeBack: (request) => outcome(PDF_CHANNELS.structureWriteBack, request),
  cancel: (jobId) =>
    (ipcRenderer.invoke(PDF_CHANNELS.structureCancel, jobId) as Promise<boolean>).catch(
      () => false,
    ),
  onProgress: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, progress: PdfStructureProgress) =>
      handler(progress)
    ipcRenderer.on(PDF_CHANNELS.structureProgress, listener)
    return () => ipcRenderer.removeListener(PDF_CHANNELS.structureProgress, listener)
  },
}

const store: PdfStoreApi = {
  docHash: (path) => outcome(PDF_CHANNELS.storeDocHash, path),
  aiReadPages: (docHash) => outcome(PDF_CHANNELS.storeAiReadPages, docHash),
  translations: (docHash) => outcome(PDF_CHANNELS.storeTranslations, docHash),
  translation: (docHash, lang) => outcome(PDF_CHANNELS.storeTranslation, docHash, lang),
  unfinishedJobs: (docHash) => outcome(PDF_CHANNELS.storeUnfinishedJobs, docHash),
  write: (request) => outcome(PDF_CHANNELS.storeWrite, request),
  migrate: (request) => outcome(PDF_CHANNELS.storeMigrate, request),
  deleteDocument: (docHash) => outcome(PDF_CHANNELS.storeDeleteDocument, docHash),
  passages: (docHash) => outcome(PDF_CHANNELS.storePassages, docHash),
  highlightRuns: (docHash) => outcome(PDF_CHANNELS.storeHighlightRuns, docHash),
  highlightBlocks: (docHash, runId) => outcome(PDF_CHANNELS.storeHighlightBlocks, docHash, runId),
  latestHighlight: (docHash) => outcome(PDF_CHANNELS.storeLatestHighlight, docHash),
  insights: (docHash, lang) => outcome(PDF_CHANNELS.storeInsights, docHash, lang),
  deleteCounts: (docHash) => outcome(PDF_CHANNELS.storeDeleteCounts, docHash),
  pageFingerprints: (request) => outcome(PDF_CHANNELS.storePageFingerprints, request),
  translationRecency: (docHash) => outcome(PDF_CHANNELS.storeTranslationRecency, docHash),
}

const api: PdfApi = {
  consumePending: () => ipcRenderer.invoke(PDF_CHANNELS.consumePending),
  openSourcePath: (path: string) => ipcRenderer.invoke('home:open-path', path),
  readFile: (path) => ipcRenderer.invoke(PDF_CHANNELS.readFile, path),
  save: (request) => ipcRenderer.invoke(PDF_CHANNELS.save, request),
  requestRedactionCopy: (path) => ipcRenderer.invoke(PDF_CHANNELS.requestRedactionCopy, path),
  autoRename: (path, baseName) => ipcRenderer.invoke(PDF_CHANNELS.autoRename, path, baseName),
  isUntitled: (path) => ipcRenderer.invoke(PDF_CHANNELS.isUntitled, path),
  isUntitledCopy: (path) => ipcRenderer.invoke(PDF_CHANNELS.isUntitledCopy, path),
  templateBytes: (request) => ipcRenderer.invoke(PDF_CHANNELS.templateBytes, request),
  adoptUntitledCopy: (path, defaultName) =>
    ipcRenderer.invoke(PDF_CHANNELS.adoptUntitledCopy, path, defaultName),
  validateTextEdits: (request) => ipcRenderer.invoke(PDF_CHANNELS.validateTextEdits, request),
  listEditFonts: () => ipcRenderer.invoke(PDF_CHANNELS.listEditFonts),
  canDrawText: (text, font, bold, italic) =>
    ipcRenderer.invoke(PDF_CHANNELS.canDrawText, text, font, bold, italic),
  listPageImages: (path) => ipcRenderer.invoke(PDF_CHANNELS.listPageImages, path),
  listStaticFormFills: (path) => ipcRenderer.invoke(PDF_CHANNELS.listStaticFormFills, path),
  ocrPage: (png) => ipcRenderer.invoke(PDF_CHANNELS.ocrPage, png),
  pageImagePng: (request) => ipcRenderer.invoke(PDF_CHANNELS.pageImagePng, request),
  pagePreviewPng: (request) => ipcRenderer.invoke(PDF_CHANNELS.pagePreviewPng, request),
  extractPages: (request) => ipcRenderer.invoke(PDF_CHANNELS.extractPages, request),
  insertPdf: (request) => ipcRenderer.invoke(PDF_CHANNELS.insertPdf, request),
  insertBlankPage: (request) => ipcRenderer.invoke(PDF_CHANNELS.insertBlankPage, request),
  splitPdf: (request) => ipcRenderer.invoke(PDF_CHANNELS.splitPdf, request),
  mergePdf: (request) => ipcRenderer.invoke(PDF_CHANNELS.mergePdf, request),
  mergePages: (request) => ipcRenderer.invoke(PDF_CHANNELS.mergePages, request),
  replacePages: (request) => ipcRenderer.invoke(PDF_CHANNELS.replacePages, request),
  setPageSize: (request) => ipcRenderer.invoke(PDF_CHANNELS.setPageSize, request),
  splitPages: (request) => ipcRenderer.invoke(PDF_CHANNELS.splitPages, request),
  cropPages: (request) => ipcRenderer.invoke(PDF_CHANNELS.cropPages, request),
  exportImages: (request) => ipcRenderer.invoke(PDF_CHANNELS.exportImages, request),
  convertOffice: (format) => ipcRenderer.invoke(PDF_CHANNELS.convertOffice, format),
  onConvertDialogRequest: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, format: unknown) => {
      if (format === 'md' || format === 'epub') handler(format)
    }
    ipcRenderer.on(PDF_CHANNELS.convertDialogRequest, listener)
    return () => ipcRenderer.removeListener(PDF_CHANNELS.convertDialogRequest, listener)
  },
  // shell-only handlers; the standalone pdf app has no tabs: a target is free, nothing opens or shows
  releaseConvertTarget: (request) =>
    (ipcRenderer.invoke(PDF_CHANNELS.convertReleaseTarget, request) as Promise<boolean>).catch(
      () => true,
    ),
  openConvertResult: (request) =>
    (ipcRenderer.invoke(PDF_CHANNELS.convertOpenResult, request) as Promise<boolean>).catch(
      () => false,
    ),
  revealConvertResult: (request) =>
    (ipcRenderer.invoke(PDF_CHANNELS.convertRevealResult, request) as Promise<boolean>).catch(
      () => false,
    ),
  createDocument: (request) => ipcRenderer.invoke(PDF_CHANNELS.createDocument, request),
  openInPdfTools: (path, tool) =>
    (ipcRenderer.invoke(PDF_CHANNELS.openInPdfTools, path, tool) as Promise<boolean>).catch(
      () => false,
    ),
  imageSearch: (query, maxResults) =>
    ipcRenderer.invoke(AI_CHANNELS.imageSearch, query, maxResults),
  readUrl: (url, offset) => ipcRenderer.invoke(AI_CHANNELS.readUrl, url, offset),
  fetchImage: (url) => ipcRenderer.invoke(AI_CHANNELS.fetchImage, url),
  generateImage: (op) => ipcRenderer.invoke(PDF_CHANNELS.generateImage, op),
  listDigitalSignatures: (path) => ipcRenderer.invoke(PDF_CHANNELS.listDigitalSignatures, path),
  pickCertificate: () => ipcRenderer.invoke(PDF_CHANNELS.pickCertificate),
  listSystemCertificates: (storePassword) =>
    ipcRenderer.invoke(PDF_CHANNELS.listSystemCertificates, storePassword),
  releaseCertificate: (certId) => ipcRenderer.send(PDF_CHANNELS.releaseCertificate, certId),
  inspectCertificate: (certId, password, storePassword) =>
    ipcRenderer.invoke(PDF_CHANNELS.inspectCertificate, certId, password, storePassword),
  signWithCertificate: (request) => ipcRenderer.invoke(PDF_CHANNELS.signWithCertificate, request),
  listSavedSignatures: () => ipcRenderer.invoke(PDF_CHANNELS.listSignatures),
  addSavedSignature: (data) => ipcRenderer.invoke(PDF_CHANNELS.addSignature, data),
  removeSavedSignature: (id) => ipcRenderer.invoke(PDF_CHANNELS.removeSignature, id),
  getUsername: () => ipcRenderer.invoke(PDF_CHANNELS.getUsername),
  annotSubjects: (path) => ipcRenderer.invoke(PDF_CHANNELS.annotSubjects, path),
  // no path crosses: the main process uses the view's own PDF and its linked note
  noteOpen: (request) =>
    (
      ipcRenderer.invoke(PDF_CHANNELS.noteOpen, { title: request?.title }) as Promise<PdfNoteResult>
    ).catch((): PdfNoteResult => ({ ok: false, reason: 'unavailable' })),
  noteInsert: (request) =>
    (ipcRenderer.invoke(PDF_CHANNELS.noteInsert, request) as Promise<PdfNoteResult>).catch(
      (): PdfNoteResult => ({ ok: false, reason: 'unavailable' }),
    ),
  // no path either: the main process answers for the view's own PDF
  noteUnsaved: () =>
    (ipcRenderer.invoke(PDF_CHANNELS.noteUnsaved) as Promise<unknown>).then(
      (value) => value === true,
      () => false,
    ),
  setDirty: (dirty) => ipcRenderer.send(PDF_CHANNELS.dirtyChanged, dirty),
  onCloseSaveRequest: (handler) => {
    const listener = (_e: unknown, opts?: { flushAll?: boolean }) =>
      handler({ flushAll: opts?.flushAll === true })
    ipcRenderer.on(PDF_CHANNELS.closeSaveRequest, listener)
    return () => ipcRenderer.removeListener(PDF_CHANNELS.closeSaveRequest, listener)
  },
  sendCloseSaveResult: (ok) => ipcRenderer.send(PDF_CHANNELS.closeSaveResult, ok),
  onSaveAsRequest: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, targetPath: string) => handler(targetPath)
    ipcRenderer.on(PDF_CHANNELS.saveAsRequest, listener)
    return () => ipcRenderer.removeListener(PDF_CHANNELS.saveAsRequest, listener)
  },
  sendSaveAsResult: (ok) => ipcRenderer.send(PDF_CHANNELS.saveAsResult, ok),
  onSaveAsFlow: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, inFlight: boolean) => handler(inFlight)
    ipcRenderer.on(PDF_CHANNELS.saveAsFlow, listener)
    return () => ipcRenderer.removeListener(PDF_CHANNELS.saveAsFlow, listener)
  },
  onPrintRequest: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(PDF_CHANNELS.printRequest, listener)
    return () => ipcRenderer.removeListener(PDF_CHANNELS.printRequest, listener)
  },
  onFileRenamed: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, newPath: string) => handler(newPath)
    ipcRenderer.on(PDF_CHANNELS.fileRenamed, listener)
    return () => ipcRenderer.removeListener(PDF_CHANNELS.fileRenamed, listener)
  },
  // crash recovery; the standalone app may lack the store: a failed call is "nothing"
  recoveryState: (path) =>
    (ipcRenderer.invoke(PDF_CHANNELS.recoveryState, path) as Promise<{ unsaved: boolean }>).catch(
      () => ({ unsaved: false }),
    ),
  writeRecoveryCopy: (request) =>
    (
      ipcRenderer.invoke(PDF_CHANNELS.recoveryWriteCopy, request) as Promise<PdfRecoveryCopyResult>
    ).catch((): PdfRecoveryCopyResult => 'failed'),
  reportUnprotectable: (unprotectable) =>
    (
      ipcRenderer.invoke(PDF_CHANNELS.recoveryUnprotectable, unprotectable) as Promise<
        string | null
      >
    ).catch(() => null),
  onRecoveryFlushRequest: (handler) => {
    const listener = () => handler()
    ipcRenderer.on(PDF_CHANNELS.recoveryFlushRequest, listener)
    return () => ipcRenderer.removeListener(PDF_CHANNELS.recoveryFlushRequest, listener)
  },
  sendRecoveryFlushDone: () => ipcRenderer.send(PDF_CHANNELS.recoveryFlushDone),
  onRecoveryDropped: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, dropped: boolean) => handler(dropped === true)
    ipcRenderer.on(PDF_CHANNELS.recoveryDropped, listener)
    return () => ipcRenderer.removeListener(PDF_CHANNELS.recoveryDropped, listener)
  },
  resumeRecoveryCopies: () =>
    (ipcRenderer.invoke(PDF_CHANNELS.recoveryResume) as Promise<void>).catch(() => undefined),
  getLanguage: () => ipcRenderer.invoke(PDF_CHANNELS.getLanguage),
  onLanguageChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, lang: Lang) => handler(lang)
    ipcRenderer.on(PDF_CHANNELS.languageChanged, listener)
    return () => ipcRenderer.removeListener(PDF_CHANNELS.languageChanged, listener)
  },
  getTheme: () => ipcRenderer.invoke(PDF_CHANNELS.getTheme),
  onThemeChanged: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, theme: UiTheme) => handler(theme)
    ipcRenderer.on(PDF_CHANNELS.themeChanged, listener)
    return () => ipcRenderer.removeListener(PDF_CHANNELS.themeChanged, listener)
  },
  getAiPanelPrefs: () => ipcRenderer.invoke(PDF_CHANNELS.getAiPanelPrefs),
  setAiPanelPrefs: (patch) => ipcRenderer.invoke('app:set-ai-panel-prefs', patch),
  onAiPanelPrefsChanged: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, prefs: AiPanelPrefs) => handler(prefs)
    ipcRenderer.on(PDF_CHANNELS.aiPanelPrefsChanged, listener)
    return () => ipcRenderer.removeListener(PDF_CHANNELS.aiPanelPrefsChanged, listener)
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
  structure,
  store,
  imageGenerationAvailable,
  aiStream: (request) => ipcRenderer.invoke(AI_CHANNELS.stream, request),
  aiStreamCancel: (requestId, scope) =>
    ipcRenderer.invoke(AI_CHANNELS.streamCancel, requestId, ...(scope ? [scope] : [])),
  onAiStream: (handler) => {
    const listener = (_e: Electron.IpcRendererEvent, chunk: AiStreamChunk) => handler(chunk)
    ipcRenderer.on(AI_CHANNELS.streamChunk, listener)
    return () => ipcRenderer.removeListener(AI_CHANNELS.streamChunk, listener)
  },
}

// Shared project chat store (registered app-wide by the shell's main init):
// AI PDF conversations persist per file, like Docs/Sheets
const projectApi = {
  resolveChat: (args: { filePath: string | null; tempChatId?: string }) =>
    ipcRenderer.invoke('project:resolveChat', args),
  appendChat: (args: unknown) => ipcRenderer.invoke('project:appendChat', args),
  loadChat: (args: { projectId: string; chatId: string; limit?: number }) =>
    ipcRenderer.invoke('project:loadChat', args),
  rebindChat: (args: { projectId: string; tempChatId: string; newFilePath: string }) =>
    ipcRenderer.invoke('project:rebindChat', args),
}

contextBridge.exposeInMainWorld('pdfApi', api)
// The split-pane role and focus calls the shell drives this pane with
contextBridge.exposeInMainWorld('aiOfficeSplit', splitPaneBridge(ipcRenderer))
// Google Drive for this editor's AI: search and read only (decision 0033)
contextBridge.exposeInMainWorld('aiOfficeDriveAi', driveAiBridge())
contextBridge.exposeInMainWorld('aiOfficeOutbound', outboundBridge())
// the person's skills: the AI panel's `/` list and skill reads, skill cards (shell main checks each)
contextBridge.exposeInMainWorld(USER_SKILLS_BRIDGE_KEY, userSkillsBridge())
contextBridge.exposeInMainWorld('projectApi', projectApi)

// open documents dragged from the OS onto this tab as a new shell tab
installDropOpenBridge()
