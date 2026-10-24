import { execSync, spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { release } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import {
  BrowserWindow,
  Menu,
  app,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  session,
  shell,
  webContents,
} from 'electron'
import type { MenuItemConstructorOptions, NativeImage, WebContents } from 'electron'
import { atomicCopyFile, atomicWriteFile } from './atomic-write'
import { tabStripOverlay } from './title-bar-overlay'
import menuDocxIcon1x from './assets/menu-docx.png?asset'
import menuDocxIcon2x from './assets/menu-docx@2x.png?asset'
import menuXlsxIcon1x from './assets/menu-xlsx.png?asset'
import menuXlsxIcon2x from './assets/menu-xlsx@2x.png?asset'
import menuPptxIcon1x from './assets/menu-pptx.png?asset'
import menuPptxIcon2x from './assets/menu-pptx@2x.png?asset'
import menuPdfIcon1x from './assets/menu-pdf.png?asset'
import menuPdfIcon2x from './assets/menu-pdf@2x.png?asset'
import menuMdIcon1x from './assets/menu-md.png?asset'
import menuMdIcon2x from './assets/menu-md@2x.png?asset'
import menuHtmlIcon1x from './assets/menu-html.png?asset'
import menuHtmlIcon2x from './assets/menu-html@2x.png?asset'
import menuMindmapIcon1x from './assets/menu-mindmap.png?asset'
import menuMindmapIcon2x from './assets/menu-mindmap@2x.png?asset'
import menuHwpIcon1x from './assets/menu-hwp.png?asset'
import menuHwpIcon2x from './assets/menu-hwp@2x.png?asset'
import menuHomeIcon1x from './assets/menu-home.png?asset'
import menuHomeIcon2x from './assets/menu-home@2x.png?asset'
import { createI18n, isLang, normalizeLang, setUiLang, type Lang } from '@genoffice/i18n'
import { DEV_USER_DATA_DIR_NAME, PRODUCT_CONTACT_EMAIL, productName } from '@genoffice/i18n'
import {
  DEFAULT_SAVE_DIR_KEY,
  DROP_OPEN_CHANNEL,
  GITHUB_REPO_URL,
  appMenuLabels,
  contextMenuLabels,
  editMenuTemplate,
  installContextMenu,
  installNavigationGuard,
  isUsableSaveDir,
  HEADLESS_EXIT,
  formatHeadlessEnvelope,
  headlessExitCode,
  parseHeadlessExportArgv,
  setHeadlessMode,
  setOpenFilesSource,
  setOpenPathProbe,
  type HeadlessArgvParse,
  showOpenDialogWithMemory,
  showSaveDialogWithMemory,
  windowMenuTemplate,
  aboutMenuItem,
  checkUpdatesMenuItem,
  setUpdateCheckInvoker,
  installRendererProtocol,
  safeExternalUrl,
} from '@genoffice/electron-utils'
import { SPLIT_PANE_CHANNELS } from '@genoffice/electron-utils/split-pane-bridge'
import {
  agentSkillNoticeDue,
  markAgentSkillNoticeSeen,
  readAppSettings,
  writeAgentPrefs,
  writeAppSetting,
  writeAppSettings,
  writeAppSettingThen,
} from './app-settings'
import {
  builtinSkillsDirFor,
  createTemplateTabs,
  createUserSkillsService,
  registerTemplateTabsIpc,
  registerUserSkillsIpc,
  type OpenedCopyTab,
  type TemplateCopy,
} from './user-skills'
import { OPEN_DOCUMENTS_FILE, clearOpenDocuments, publishOpenDocuments } from './open-documents'
import { startControlServer, type ControlServer } from './control-server'
import { controlHandler } from './control-handlers'
import { installCliLinkBestEffort } from './cli-link'
import { createDefaultAppService, execFileRunner } from './default-app'
import { registerIntegrationsIpc } from './integrations-ipc'
import { registerResultStoreIpc } from './result-store-ipc'
import { FEEDBACK_SURVEY_URL, feedbackDetails, feedbackText, platformLabel } from './feedback'
import { registerDriveIpc, type DriveService } from './drive/drive-ipc'
import {
  ATTACHABLE_EXTS,
  ATTACHABLE_IMAGE_EXTS,
  ATTACHABLE_IMAGE_MAX_BYTES,
  ATTACHABLE_MAX_BYTES,
  parseFileToText,
} from '@genoffice/file-parse'
import { createDocList } from './doc-picker/doc-list'
import { resolveDocAsker } from './doc-picker/doc-asker'
import { createDocPicker } from './doc-picker/doc-picker-window'
import { handleDroppedFiles } from './dropped-files'
import { collectLaunchPaths } from './launch-paths'

import {
  buildDocsMenu,
  configureDocsRuntime,
  docsFileRenamed,
  readRecentFiles,
  readStarredFiles,
  readStarredGroupMap,
  readStarredGroups,
  recordRecentFile,
  removeRecentFiles,
  removeStarredFiles,
  replaceRecentFile,
  registerAiIpc,
  registerProjectIpc,
  setStarredGroup,
  toggleStarredFile,
  registerDocsIpc,
  exportDocsHeadless,
  setDocsExtraFileMenuItems,
  setDocsDocumentLinkMenuItems,
  setDocsMenuGate,
  setDocsShellHooks,
  createAiDocument,
  projectFilePaths,
  projectFileRenamed,
  setDocsHostWindowHook,
  setDocsShellWindow,
  setDocsFileSavedHook,
  setDocsFileOpenedHook,
  setSessionPathResolver,
  defaultSaveDir,
  uniquePathIn,
  authorizeMcpDocWrite,
  activeAiStreamCount,
} from '../../../docs/src/main/docs-main'
import { blankXlsxBuffer } from '@genoffice/xlsx-gateway/gateway/csv-import'
import { blankPdfBuffer } from '../../../pdf/src/main/blank-pdf'
import {
  applyMcpSettings,
  clearMcpLogs,
  configureMcpRuntime,
  currentMcpRuntimeDeps,
  getMcpRecentLogs,
  mcpLogFilePath,
  mcpStatus,
  revealMcpLogFile,
  startMcpFromSettings,
  stopMcpSync,
  type McpSettings,
} from './mcp/app-mcp'
import { createCliRunner } from './mcp/cli-runner'
import { DEFAULT_MCP_PORT } from './mcp/mcp-server'
import { createDocsControl, installDocsBridge } from './mcp/docs-bridge'
import { createSlidesControl } from './mcp/slides-bridge'
import { createSheetsControl, installSheetsBridge } from './mcp/sheets-bridge'
import { createOpenDocumentsControl, createOpenTargetResolver } from './mcp/open-documents-bridge'
import {
  configureSheetsRuntime,
  exportSheetsPdfHeadless,
  hasActiveQueuedWorkbook,
  installSheetsMenu,
  markSheetsShuttingDown,
  resolveSheetsSessionPath,
  markSheetsUnsavedNew,
  markSheetsUntitledPath,
  pendingUnsavedNewRecoveries,
  unmarkSheetsUnsavedNew,
  sheetsSuggestedPathTaken,
  authorizeMcpSheetWrite,
  sendSheetsMenuAction,
  sheetsFileRenamed,
  setSheetsCloseTabHook,
  setSheetsExtraFileMenuItems,
  setSheetsDocumentLinkMenuItems,
  setSheetsHostWindowHook,
  setSheetsPasswordPrompt,
  setSheetsShellWindow,
  setSheetsWorkbookOpenedHook,
  startSheetsCaptureServer,
  stopSheetsSidecar,
} from '../../../sheets/src/main/sheets-main'
import {
  configureSlidesRuntime,
  discardSlidesRecovery,
  exportSlidesPdfHeadless,
  installSlidesMenu,
  readSlidesRecentFiles,
  replaceSlidesRecentFile,
  setSlidesCloseTabHook,
  setSlidesExtraFileMenuItems,
  setSlidesDocumentLinkMenuItems,
  setSlidesOpenedHook,
  setSlidesHostWindowHook,
  setSlidesPasswordPrompt,
  setSlidesShellWindow,
  setSlidesShowBleed,
  slidesFileRenamed,
} from '../../../slides/src/main/slides-main'
import { moveSlidesTemplateSelection } from '../../../slides/src/main/template-selection-ipc'
import {
  configurePdfRuntime,
  flushPdfSave,
  markPdfUntitledPath,
  pdfFileRenamed,
  pdfIsDirty,
  requestPdfSaveAs,
  sendPdfPrintRequest,
  setPdfRenamedHook,
  setPdfRedactionSavedHook,
  setPdfSaveAsInFlight,
} from '../../../pdf/src/main/pdf-main'
import { PDF_CHANNELS } from '../../../pdf/src/shared/ipc'
import { convertPdfFileToDocxLocalWithPrompt, PdfLoadError } from './pdf2docx-local'
import { insertIntoNoteTab, openNoteTab, type NoteTabHost } from './pdf-note-tabs'
import { convertPdfFileToPptxLocalWithPrompt } from './pdf2pptx-local'
import { convertPdfFileToXlsxLocalWithPrompt } from './pdf2xlsx-local'
import { closePdfPasswordDialog, promptPdfPassword } from './pdf-password-dialog'
import { createDocumentPasswordPrompt } from './document-password-prompt'
import { cancelWindowJob, registerPdfStructureIpc, runWindowJob } from './pdf-structure-ipc'
import { registerPdfConvertUiIpc, requestPdfConvertDialog } from './pdf-convert-ui'
import {
  configureMarkdownRuntime,
  exportMarkdownPdfHeadless,
  markdownDiscardPendingAssets,
  markdownFileRenamed,
  markdownReadText,
  markdownSaveToPath,
  requestMarkdownSave,
  sendMarkdownExportRequest,
  sendMarkdownPrintRequest,
  setMarkdownDocxExportedHook,
  setMarkdownFileSavedHook,
} from '../../../markdown/src/main/markdown-main'
import {
  configureHwpRuntime,
  hwpFileRenamed,
  hwpReadText,
  requestHwpPrint,
  requestHwpSave,
  setHwpFileSavedHook,
} from '../../../hwp/src/main/hwp-main'
import {
  configureHtmlRuntime,
  exportHtmlHeadless,
  htmlDiscardPendingAssets,
  htmlFileRenamed,
  htmlReadText,
  htmlSaveToPath,
  registerPrivilegedSchemes,
  requestHtmlSave,
  sendHtmlExportRequest,
  sendHtmlPrintRequest,
  setHtmlDocxExportPrepareHook,
  setHtmlDocxExportedHook,
  setHtmlFileSavedHook,
  setHtmlPresentHooks,
  setHtmlProvisionalTitleHook,
} from '../../../html/src/main/html-main'
import {
  configureMindmapRuntime,
  mindmapFileRenamed,
  mindmapSaveToPath,
  requestMindmapSave,
  sendMindmapExportRequest,
  sendMindmapMenuCommand,
  sendMindmapPrintRequest,
  setMindmapFileSavedHook,
  setMindmapMakeFromDocumentHook,
  setMindmapProvisionalTitleHook,
} from '../../../mindmap/src/main/mindmap-main'
import { mindmapReadOutline } from '../../../mindmap/src/main/mcp-queries'
import type {
  AutoSaveDefault,
  FolderListing,
  FolderRoot,
  MoveConflictPolicy,
  MoveResult,
  NewFileOpts,
  RecentEntry,
  RecentPage,
  RenameResult,
  DocTheme,
  UiTheme,
  FileSearchPage,
  FileSearchQuery,
  FileSearchRerank,
  FileSearchSettings,
} from '../shared/home-api'
import { HOME_CHANNELS } from '../shared/home-api'
import {
  normalizeAiPanelPrefs,
  sameAiPanelPrefs,
  type AiPanelPrefs,
} from '@genoffice/ui/ai-panel-prefs'
import type { TabKind } from '../shared/tabs-api'
import { TABS_CHANNELS } from '../shared/tabs-api'
import { SPLIT_TABS_CHANNELS } from '../shared/split-view-api'
import type {
  SplitDropIntent,
  SplitHint,
  SplitOrientation,
  SplitViewState,
} from '../shared/split-view-api'
import { TAB_STRIP_HEIGHT } from '../shared/tab-drag-geometry'
import { SHELL_SUBSCRIPTION_CHANNELS, isSubscriptionProviderId } from '../shared/subscription-api'
import {
  SUBSCRIPTION_INSTALL_URLS,
  initSubscriptionChildTracking,
  sharedSubscriptionStatuses,
  shutdownSubscriptionChildren,
  trackedSubscriptionChildCount,
} from '@genoffice/ai-provider/subscription'
import { showErrorDialog } from './error-dialog'
import { startRendererWatchdog } from './renderer-watchdog'
import { memoryFigures, startCrashWatch, startLowMemoryWatch } from './crash-watch'
import {
  capStatPaths,
  matchesExtFamily,
  normalizeRecentQuery,
  pageRecentPaths,
  statPathEntries,
} from './recent-files'
import { isMoveSource, isUserVisibleFile, type FileTargetSources } from './file-targets'
import {
  DOCX_RE,
  HTML_RE,
  ODT_RE,
  MINDMAP_RE,
  HWP_RE,
  PDF_RE,
  PPTX_RE,
  TEXT_RE,
  XLSX_RE,
  renameStaysInApp,
} from './app-routing'
import { isSameFile, pdfSaveAsTarget, isValidRawRenameName } from './rename-validation'
import {
  FolderWatcher,
  createFolder,
  describeRoot,
  isInsideRoot,
  pathsUnder,
  listFolder,
  movePathsInto,
  rebasePath,
  renameFolder,
  uniqueNameIn,
  type FolderErrors,
} from './folder-tree'
import {
  FOLDER_ROOTS_KEY,
  describeExtraRoot,
  readExtraRoots,
  withExtraRoot,
  withoutExtraRoot,
} from './folder-roots'
import extractWorkerPath from './file-index/extract-worker?modulePath'
import { FileIndexer } from './file-index/indexer'
import { FileIndexStore } from './file-index/store'
import { normalizeFileSearchSettings, probeDecision, SearchReranker } from './file-index/rerank'
import {
  KB_NOT_IN_BASE,
  KbRunScopes,
  listKnowledgeFiles,
  readKnowledgeFilePage,
  searchSavedKnowledgeBase,
} from './knowledge-base'
import { runHeadlessExport, type HeadlessExporters } from './headless-export'
import { TabManager, canonicalPath, type DetachedTab } from './tab-manager'
import { readSplitMemory, writeSplitMemory, type SplitMemory } from './split-memory'
import { SPLIT_EVEN_RATIO, decideSplitDrop, paneRects, splitDropZone } from './split-layout'
import { configureGenerateWindow } from './generate/generate-window'
import { configurePdfToolsWindow, openPdfToolsWithFile } from './pdf-tools/pdf-tools-window'
import {
  configureQuickLookWindow,
  notifyQuickLookLangOrThemeChanged,
  shouldKeepQuickLookInTray,
  stopQuickLookRuntime,
} from './quick-look/quick-look-window'
import { normalizeQuickLookSettings } from '../shared/quick-look-home'
import {
  configureAgentWindow,
  isAgentWindowContents,
  stopAgentSessions,
} from './agent/agent-window'
import { startAgentMcpServer } from './agent/agent-mcp'
import { userSkillsManageGate } from './agent/agent-skills'
import {
  buildAgentSkillBundle,
  startClaudeAgentSession,
  startCodexAgentSession,
} from '@genoffice/ai-provider/agent-session'
import { normalizeAgentPrefs } from '../shared/agent-api'
import { normalizeAiSettings, type AiSettings } from '@genoffice/ai-provider'
import { homedir, tmpdir } from 'node:os'
import {
  configureDocumentLinks,
  documentLinkFileMenuItems,
  documentLinkFileMoved,
  documentLinkPaths,
  makeFromDocument,
  noteDocumentSaved,
  refreshDocumentLinkMenu,
  type LinkedDocument,
} from './document-links-shell'
import { installShellCloseGuard } from './window-close-guard'
import {
  activateDetached,
  closeDetachedWithoutPrompt,
  createDetachedEditorWindow,
  detachedFilePaths,
  detachedOpenDocuments,
  detachedRenameFile,
  detachedSetFileFor,
  detachedWebContentsFor,
  detachedSetTitleFor,
  detachedDocumentFor,
  detachedWindowForWebContents,
  dockBandFor,
  dragTornWindow,
  endTornDrag,
  findDetachedTabByPath,
  focusDetachedByPath,
  focusedDetachedKind,
  focusedDetachedTab,
  isDetachedEditorWindow,
  isDetachedTabId,
  isTearingOff,
  setDetachedChangedListener,
  setDockHost,
  takeTornTab,
} from './detached-windows'
import { applyUpdateChannel, checkForUpdatesNow, initAutoUpdater } from './updater'
import { isUpdateChannel, type UpdateChannel } from '../shared/update-api'

/**
 * GenOffice unified shell: ONE Electron app, ONE BrowserWindow, hosting the
 * docs and sheets modules as WebContentsView tabs behind a WPS-style tab
 * strip. The shell owns the lifecycle — single-instance lock, file-
 * association routing by extension, and per-active-tab menu switching.
 * Renderers load from each module's build output (apps/docs/out,
 * apps/sheets/out), so build those before running the shell.
 */

// ANY unpacked run (`npm run shell`, `npm run dev`, `npx electron .`) must not
// share the installed app's userData or single-instance lock — otherwise a dev
// run silently quits and forwards its argv to the running installed GenOffice.
// GENOFFICE_USER_DATA: test drivers point this at a scratch dir so an
// automated instance can run alongside the dev instance (separate lock).
if (!app.isPackaged) {
  if (process.env.GENOFFICE_USER_DATA) {
    app.setPath('userData', process.env.GENOFFICE_USER_DATA)
  } else {
    // One token, no space: a space breaks unquoted shell expansions, rsync
    // targets and .desktop Exec= lines (genoffice#1817). The name follows the
    // packaged profile's (Electron's default <appData>/<productName>), and both
    // are this product's own: a profile of the upstream app is never adopted.
    app.setPath('userData', join(app.getPath('appData'), DEV_USER_DATA_DIR_NAME))
  }
}

/**
 * `--headless-export <file> --to <format> --out <path> [--json]`: one document, no
 * window, one stdout line, then exit. Parsed at module scope so the dock icon
 * is gone before the app can bounce it and so every editor module sees the
 * headless flag before it registers anything.
 */
const headlessArgv = parseHeadlessExportArgv(process.argv)
if (headlessArgv.kind !== 'none') {
  setHeadlessMode(true)
  app.dock?.hide()
}

// module build outputs: packaged builds carry them as extraResources
// (resources/modules/*, resources/native/*); dev/unpacked resolves them
// relative to apps/shell in the monorepo layout.
const SIDECAR_EXE = process.platform === 'win32' ? 'xlsx-sidecar.exe' : 'xlsx-sidecar'
const APPS_ROOT = join(app.getAppPath(), '..')
const DOCS_OUT = app.isPackaged
  ? join(process.resourcesPath, 'modules', 'docs')
  : join(APPS_ROOT, 'docs', 'out')
const SHEETS_OUT = app.isPackaged
  ? join(process.resourcesPath, 'modules', 'sheets')
  : join(APPS_ROOT, 'sheets', 'out')
const SLIDES_OUT = app.isPackaged
  ? join(process.resourcesPath, 'modules', 'slides')
  : join(APPS_ROOT, 'slides', 'out')
const PDF_OUT = app.isPackaged
  ? join(process.resourcesPath, 'modules', 'pdf')
  : join(APPS_ROOT, 'pdf', 'out')
const MARKDOWN_OUT = app.isPackaged
  ? join(process.resourcesPath, 'modules', 'markdown')
  : join(APPS_ROOT, 'markdown', 'out')
const HTML_OUT = app.isPackaged
  ? join(process.resourcesPath, 'modules', 'html')
  : join(APPS_ROOT, 'html', 'out')
const MINDMAP_OUT = app.isPackaged
  ? join(process.resourcesPath, 'modules', 'mindmap')
  : join(APPS_ROOT, 'mindmap', 'out')
const HWP_OUT = app.isPackaged
  ? join(process.resourcesPath, 'modules', 'hwp')
  : join(APPS_ROOT, 'hwp', 'out')
const SIDECAR_BIN = app.isPackaged
  ? join(process.resourcesPath, 'native', SIDECAR_EXE)
  : join(APPS_ROOT, 'sheets', 'native', 'xlsx-engine', 'target', 'release', SIDECAR_EXE)

configureDocsRuntime({
  preloadPath: join(DOCS_OUT, 'preload', 'index.js'),
  rendererUrl: process.env.DOCS_RENDERER_URL,
  rendererFile: join(DOCS_OUT, 'renderer', 'index.html'),
})
configureSheetsRuntime({
  preloadPath: join(SHEETS_OUT, 'preload', 'index.js'),
  rendererUrl: process.env.SHEETS_RENDERER_URL,
  rendererFile: join(SHEETS_OUT, 'renderer', 'index.html'),
  sidecarPath: SIDECAR_BIN,
  openGeneratedPath: (path) => openGeneratedDocument(path),
  // The sheets AI's create_document (docx/pdf/md) funnels into the docs-owned
  // creation flow, like the pdf app below.
  createDocument: createAiDocument,
})
configureSlidesRuntime({
  preloadPath: join(SLIDES_OUT, 'preload', 'index.js'),
  rendererDevUrl: process.env.SLIDES_RENDERER_URL,
  rendererFilePath: join(SLIDES_OUT, 'renderer', 'index.html'),
  openGeneratedPath: (path) => openGeneratedDocument(path),
})
/** a PDF's note (reading-assist 4.9): its Markdown tab or detached window, else a new tab */
const noteTabHost: NoteTabHost = {
  focusExisting: (path) => {
    const detached = findDetachedTabByPath(path)
    if (detached?.kind === 'markdown' && focusDetachedByPath(path)) return detached.webContents
    const id = tabManager?.findMarkdownTabByPath(path)
    if (!tabManager || !id) return undefined
    revealShellWindow()
    tabManager.activateTab(id)
    return tabManager.webContentsForTab(id)
  },
  openNew: (path) => {
    revealShellWindow()
    if (!tabManager) return undefined
    recordRecentFile(path)
    return tabManager.webContentsForTab(tabManager.openMarkdownTab(path))
  },
}
configurePdfRuntime({
  preloadPath: join(PDF_OUT, 'preload', 'index.js'),
  rendererUrl: process.env.PDF_RENDERER_URL,
  rendererFile: join(PDF_OUT, 'renderer', 'index.html'),
  openGeneratedPath: (path) => openGeneratedDocument(path),
  createDocument: createAiDocument,
  openPdfTools: (path, tool) => openPdfToolsWithFile(path, tool),
  openNote: (path) => openNoteTab(noteTabHost, path) !== null,
  insertIntoNote: (path, text) => insertIntoNoteTab(noteTabHost, path, text),
})
configureMarkdownRuntime({
  preloadPath: join(MARKDOWN_OUT, 'preload', 'index.js'),
  rendererUrl: process.env.MARKDOWN_RENDERER_URL,
  rendererFile: join(MARKDOWN_OUT, 'renderer', 'index.html'),
  openGeneratedPath: (path) => openGeneratedDocument(path),
  openLinkedPath: (path) => openDocumentPath(path),
})
configureHtmlRuntime({
  preloadPath: join(HTML_OUT, 'preload', 'index.js'),
  rendererUrl: process.env.HTML_RENDERER_URL,
  rendererFile: join(HTML_OUT, 'renderer', 'index.html'),
  openGeneratedPath: (path) => openGeneratedDocument(path),
})
configureMindmapRuntime({
  preloadPath: join(MINDMAP_OUT, 'preload', 'index.js'),
  rendererUrl: process.env.MINDMAP_RENDERER_URL,
  rendererFile: join(MINDMAP_OUT, 'renderer', 'index.html'),
})
configureHwpRuntime({
  preloadPath: join(HWP_OUT, 'preload', 'index.js'),
  rendererUrl: process.env.HWP_RENDERER_URL,
  rendererFile: join(HWP_OUT, 'renderer', 'index.html'),
  openGeneratedPath: (path) => openGeneratedDocument(path),
})
// privileged-scheme registration is only legal before app ready
registerPrivilegedSchemes()

// ---- UI language ----
// Persisted in userData/app-settings.json so the editor modules can read the
// same file when they pick up i18n later. GENOFFICE_LANG overrides for tests.

const APP_SETTINGS_PATH = () => join(app.getPath('userData'), 'app-settings.json')
/** Google Drive (decision 0033); registered once this instance holds the single-instance lock */
let driveService: DriveService | null = null
const OPEN_DOCUMENTS_PATH = () => join(app.getPath('userData'), OPEN_DOCUMENTS_FILE)
/** only the instance holding the single-instance lock may write or remove the registry */
let ownsOpenDocumentsRegistry = false
const publishOpenDocumentsIfOwner = (paths: readonly string[]) => {
  if (ownsOpenDocumentsRegistry) publishOpenDocuments(OPEN_DOCUMENTS_PATH(), paths)
}

/** every open file: the shell's tabs plus the detached editor windows */
function publishAllOpenDocuments(): void {
  publishOpenDocumentsIfOwner([...(tabManager?.openFilePaths() ?? []), ...detachedFilePaths()])
}
setDetachedChangedListener(publishAllOpenDocuments)

/** ai-settings.json as every reader gets it (the docs main owns the file; agent sessions only read it) */
function readStoredAiSettings(): AiSettings {
  try {
    return normalizeAiSettings(
      JSON.parse(readFileSync(join(app.getPath('userData'), 'ai-settings.json'), 'utf8')),
    )
  } catch {
    return normalizeAiSettings({})
  }
}

let uiLang: Lang | null = null

function currentLang(): Lang {
  if (uiLang) return uiLang
  if (process.env.GENOFFICE_LANG) {
    uiLang = normalizeLang(process.env.GENOFFICE_LANG)
    setUiLang(uiLang)
    return uiLang
  }
  const saved = readAppSettings(APP_SETTINGS_PATH()).language
  if (isLang(saved)) uiLang = saved
  uiLang ??= normalizeLang(app.getLocale())
  setUiLang(uiLang)
  return uiLang
}

function persistLang(lang: Lang): void {
  // write first: app-settings.json can be unwritable, and a language committed to
  // memory before the write survives only until the next launch
  writeAppSettingThen(APP_SETTINGS_PATH(), 'language', lang, (persisted) => {
    uiLang = persisted
    setUiLang(persisted)
  })
}

let cachedUpdateChannel: UpdateChannel | null = null

function currentUpdateChannel(): UpdateChannel {
  if (cachedUpdateChannel) return cachedUpdateChannel
  const saved = readAppSettings(APP_SETTINGS_PATH()).updateChannel
  cachedUpdateChannel = isUpdateChannel(saved) ? saved : 'stable'
  return cachedUpdateChannel
}

let cachedTheme: UiTheme | null = null

function currentTheme(): UiTheme {
  if (cachedTheme) return cachedTheme
  const saved = readAppSettings(APP_SETTINGS_PATH()).theme
  cachedTheme = saved === 'light' || saved === 'dark' ? saved : 'system'
  return cachedTheme
}

let cachedDocTheme: DocTheme | null = null

function currentDocTheme(): DocTheme {
  if (cachedDocTheme) return cachedDocTheme
  const saved = readAppSettings(APP_SETTINGS_PATH()).documentTheme
  cachedDocTheme = saved === 'light' || saved === 'dark' ? saved : 'follow'
  return cachedDocTheme
}

let cachedAutoSaveDefault: AutoSaveDefault | null = null

function currentAutoSaveDefault(): AutoSaveDefault {
  if (cachedAutoSaveDefault) return cachedAutoSaveDefault
  const saved = readAppSettings(APP_SETTINGS_PATH())
  const updatedAt = saved.autoSaveDefaultUpdatedAt
  cachedAutoSaveDefault = {
    on: saved.autoSaveDefault === true,
    updatedAt: typeof updatedAt === 'number' && updatedAt > 0 ? updatedAt : 0,
  }
  return cachedAutoSaveDefault
}

/** MCP server settings (persisted in userData/app-settings.json; default off). */
function currentMcpSettings(): McpSettings {
  const saved = readAppSettings(APP_SETTINGS_PATH())
  const port = saved.mcpPort
  return {
    enabled: saved.mcpEnabled === true,
    port:
      typeof port === 'number' && Number.isInteger(port) && port > 0 && port < 65536
        ? port
        : DEFAULT_MCP_PORT,
    background: saved.mcpBackground === true,
    logging: saved.mcpLogging === true,
  }
}

let cachedAiPanelPrefs: AiPanelPrefs | null = null
function currentAiPanelPrefs(): AiPanelPrefs {
  if (cachedAiPanelPrefs) return cachedAiPanelPrefs
  const saved = readAppSettings(APP_SETTINGS_PATH())
  cachedAiPanelPrefs = normalizeAiPanelPrefs({
    side: saved.aiPanelSide,
    fontSize: saved.aiPanelFontSize,
    customFontSize: saved.aiPanelCustomFontSize,
    spellcheck: saved.aiPanelSpellcheck,
    openInNewDocs: saved.aiPanelOpenInNewDocs,
  })
  return cachedAiPanelPrefs
}

const tMain = createI18n({
  zh: {
    dlgAddFolderRoot: '添加文件夹到首页',
    watchdogTitle: '文档占用资源过高',
    watchdogBody:
      '“{title}” 已持续数分钟占用大量内存或 CPU（内存 {memory} MB，CPU {cpu}%）。可以继续等待，或关闭这个文档（有未保存的改动会先询问是否保存）。诊断信息已记录。', // public-hygiene: allow
    watchdogWait: '继续等待',
    watchdogClose: '关闭文档',
    crashTitle: '文档意外停止',
    crashBody: '“{title}” 意外停止。上次保存后的改动可能已丢失。',
    crashReopen: '重新打开',
    crashReload: '重新加载',
    crashClose: '关闭',
    crashLater: '暂不处理',
    errFolderRootUnusable: '无法读取所选文件夹',
    menuFile: '文件',
    menuSectionNew: '新建',
    menuOpenInNewWindow: '在新窗口中打开',
    menuSplitRight: '向右拆分',
    menuSplitDown: '向下拆分',
    menuUnsplit: '取消拆分',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: '未命名表格',
    untitledDoc: '未命名文档',
    untitledDeck: '未命名演示文稿',
    untitledMarkdown: '未命名 Markdown',
    untitledHtml: '未命名 HTML',
    untitledMindmap: '未命名思维导图',
    untitledHwp: '未命名 HWP',
    untitledPdf: '未命名 PDF',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: '思维导图',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: '导出为 PDF…',
    menuExportImages: '导出为图片…',
    menuExportHtml: '导出为单文件 HTML…',
    menuExportMapImage: '导出为图片 (PNG)…',
    menuExportMapOutline: '导出为 Markdown 大纲…',
    menuMakeFromDocument: '用此文档新建其他文档',
    menuDocumentSources: '查看资料',
    menuDerivedDocuments: '用此文档新建的文档',
    menuOpenInDocs: '转换为 Docs 文档并打开',
    menuPrint: '打印…',
    menuOpen: '打开…',
    menuSave: '保存',
    menuSaveAs: '另存为…',
    menuClose: '关闭',
    menuEdit: '编辑',
    menuWindow: '窗口',
    menuHome: '首页',
    backToHome: '返回首页',
    dlgOpenTitle: '打开文件',
    filterSupported: '支持的文件',
    filterWord: 'Word 文档',
    filterOdt: 'OpenDocument 文本',
    filterExcel: 'Excel 工作簿',
    filterPpt: 'PowerPoint 演示文稿',
    filterMarkdown: '文本文件 (Markdown, TXT, JSON)',
    filterHtml: 'HTML 文档',
    filterMindmap: '思维导图 (XMind 文件)',
    filterHwp: 'HWP 文档 (HWP, HWPX)',
    filterPdf: 'PDF 文档',
    errBadArgs: '参数无效',
    errBadName: '文件名不合法',
    errBadExtension: '这个扩展名不受支持，改了文件就打不开了',
    errMissing: '文件不存在',
    errExists: '同名文件已存在',
    errRenameFailed: '重命名失败',
    errPdfSaveAsFailed: '另存为 PDF 失败',
    errNewTabFailed: '新建文档失败',
    errDuplicateFailed: '复制文件失败',
    errUnsupportedExt: '暂不支持 .{ext} 类型',
    copySuffix: '副本',
    menuHelp: '帮助',
    menuUserGuide: '使用手册',
    thirdPartyNotices: '第三方软件声明',
    menuExportDocx: '导出为 Word…',
    menuExportOdt: '导出为 ODT…',
    btnCancel: '取消',
    pdfDocxFailedMsg: '导出为 Word 失败',
    pdfDocxBusyMsg: '正在转换中，请等待当前导出完成。',
    menuExportPptx: '导出为 PPT…',
    pdfPptxFailedMsg: '导出为 PPT 失败',
    pdfPptxBusyMsg: '正在转换中，请等待当前导出完成。',
    pdfPptxLocalScannedDetail: '本地转换已按图片保真导出各页，幻灯片中的文字不可编辑。',
    menuExportXlsx: '导出为 Excel…',
    menuExportMd: '导出为 Markdown…',
    menuExportEpub: '导出为 EPUB…',
    pdfXlsxFailedMsg: '导出为 Excel 失败',
    pdfXlsxBusyMsg: '正在转换中，请等待当前导出完成。',
    pdfXlsxLocalScannedDetail: '扫描页无法转换为单元格，对应工作表中已写入提示行。',
    pdfXlsxLocalSkippedMsg: '部分页面未转换为单元格',
    pdfXlsxLocalSkippedDetail: '第 {pages} 页无法转换为单元格，对应工作表中已写入提示行。',
    pdfDocxLocalScannedMsg: '检测到扫描件',
    pdfDocxLocalScannedDetail: '本地转换已按图片保真导出各页，未能识别出可编辑的文本。',
    pdfDocxLocalDegradedMsg: '部分页面已按图片导出',
    pdfDocxLocalDegradedDetail: '第 {pages} 页版面无法可靠重建，已按整页图片保真导出。',
    pdfDocxLocalOcrMsg: '扫描页已转换为可编辑文本',
    pdfDocxLocalOcrDetail:
      '第 {pages} 页为扫描件，已通过本地 OCR 识别为可编辑文字，建议校对识别结果。',
    pdfDocxLocalEncryptedDetail: '此 PDF 已加密，未提供正确的密码，无法转换。',
    pdfDocxLocalUnsupportedEncDetail: '该文件使用证书加密或不支持的加密方式，无法转换。',
    pdfPwdTitle: '输入密码',
    pdfPwdPrompt: '此 PDF 已加密，请输入打开密码：',
    docPwdPrompt: '此文件受密码保护。请输入打开密码：',
    pdfPwdRetryPrompt: '密码不正确，请重试。',
    pdfPwdOk: '确定',
    pdfPwdVerifying: '正在验证密码…',
    pdfPwdLabel: '密码',
    pdfPwdPlaceholder: '输入打开密码',
    pdfPwdShow: '显示密码',
    pdfPwdHide: '隐藏密码',
    pdfDocxLocalCorruptDetail: '文件已损坏或不是有效的 PDF，无法转换。',
    dlgPickSaveDir: '选择默认保存位置',
    errSaveDirUnusable: '所选文件夹不可写，无法用作默认保存位置',
  },
  en: {
    dlgAddFolderRoot: 'Add Folder to Home',
    watchdogTitle: 'Document is using too many resources',
    watchdogBody:
      '"{title}" has been using a lot of memory or CPU for several minutes ({memory} MB, {cpu}% CPU). You can keep waiting, or close the document (you will be asked to save unsaved changes first). Diagnostics have been recorded.',
    watchdogWait: 'Keep Waiting',
    watchdogClose: 'Close Document',
    crashTitle: 'A document stopped unexpectedly',
    crashBody: '"{title}" stopped unexpectedly. Changes made since it was last saved may be lost.',
    crashReopen: 'Reopen',
    crashReload: 'Reload',
    crashClose: 'Close',
    crashLater: 'Not Now',
    errFolderRootUnusable: 'The selected folder cannot be read',
    menuFile: 'File',
    menuSectionNew: 'New',
    menuOpenInNewWindow: 'Open in New Window',
    menuSplitRight: 'Split Right',
    menuSplitDown: 'Split Down',
    menuUnsplit: 'Unsplit',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'Untitled Spreadsheet',
    untitledDoc: 'Untitled Document',
    untitledDeck: 'Untitled Presentation',
    untitledMarkdown: 'Untitled Markdown',
    untitledHtml: 'Untitled HTML',
    untitledMindmap: 'Untitled Mind Map',
    untitledHwp: 'Untitled HWP',
    untitledPdf: 'Untitled PDF',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'Mind Map',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'Export as PDF…',
    menuExportImages: 'Export as Images…',
    menuExportHtml: 'Export as Single-File HTML…',
    menuExportMapImage: 'Export as Image (PNG)…',
    menuExportMapOutline: 'Export as Markdown Outline…',
    menuMakeFromDocument: 'Make Another Document from This',
    menuDocumentSources: 'View Sources',
    menuDerivedDocuments: 'Documents Made from This',
    menuOpenInDocs: 'Convert and Open in Docs',
    menuPrint: 'Print…',
    menuOpen: 'Open…',
    menuSave: 'Save',
    menuSaveAs: 'Save As…',
    menuClose: 'Close',
    menuEdit: 'Edit',
    menuWindow: 'Window',
    menuHome: 'Home',
    backToHome: 'Back to Home',
    dlgOpenTitle: 'Open File',
    filterSupported: 'Supported Files',
    filterWord: 'Word Documents',
    filterOdt: 'OpenDocument Text',
    filterExcel: 'Excel Workbooks',
    filterPpt: 'PowerPoint Presentations',
    filterMarkdown: 'Text Files (Markdown, TXT, JSON)',
    filterHtml: 'HTML Documents',
    filterMindmap: 'Mind Maps (XMind files)',
    filterHwp: 'HWP Documents (HWP, HWPX)',
    filterPdf: 'PDF Documents',
    errBadArgs: 'Invalid arguments',
    errBadName: 'Invalid file name',
    errBadExtension: 'That extension is not supported, and the file would no longer open',
    errMissing: 'File not found',
    errExists: 'A file with that name already exists',
    errRenameFailed: 'Rename failed',
    errPdfSaveAsFailed: 'Could not save the PDF copy',
    errNewTabFailed: 'Could not create the new document',
    errDuplicateFailed: 'Could not duplicate the file',
    errUnsupportedExt: '.{ext} files are not supported',
    copySuffix: 'copy',
    menuHelp: 'Help',
    menuUserGuide: 'User Guide',
    thirdPartyNotices: 'Third-Party Notices',
    menuExportDocx: 'Export as Word…',
    menuExportOdt: 'Export as ODT…',
    btnCancel: 'Cancel',
    pdfDocxFailedMsg: 'Export as Word failed',
    pdfDocxBusyMsg: 'A Word export is already in progress. Please wait for it to finish.',
    menuExportPptx: 'Export as PowerPoint…',
    pdfPptxFailedMsg: 'Export as PowerPoint failed',
    pdfPptxBusyMsg: 'An export is already in progress. Please wait for it to finish.',
    pdfPptxLocalScannedDetail:
      'Each page was exported as a full-page image; the text on the slides is not editable.',
    menuExportXlsx: 'Export as Excel…',
    menuExportMd: 'Export as Markdown…',
    menuExportEpub: 'Export as EPUB…',
    pdfXlsxFailedMsg: 'Export as Excel failed',
    pdfXlsxBusyMsg: 'An export is already in progress. Please wait for it to finish.',
    pdfXlsxLocalScannedDetail:
      "Scanned pages cannot be converted to cells; each page's worksheet carries a notice row instead.",
    pdfXlsxLocalSkippedMsg: 'Some pages were not converted to cells',
    pdfXlsxLocalSkippedDetail:
      'Pages {pages} could not be converted to cells; their worksheets carry a notice row instead.',
    pdfDocxLocalScannedMsg: 'Scanned document detected',
    pdfDocxLocalScannedDetail:
      'The pages were exported as images to preserve their appearance; no editable text could be recognized.',
    pdfDocxLocalDegradedMsg: 'Some pages were exported as images',
    pdfDocxLocalDegradedDetail:
      'Page(s) {pages} could not be reliably reconstructed and were exported as full-page images.',
    pdfDocxLocalOcrMsg: 'Scanned pages converted to editable text',
    pdfDocxLocalOcrDetail:
      'Page(s) {pages} were scans; their text was recovered with on-device OCR. Please proofread the result.',
    pdfDocxLocalEncryptedDetail:
      'This PDF is encrypted and could not be opened without the correct password.',
    pdfDocxLocalUnsupportedEncDetail:
      'This PDF uses certificate-based or otherwise unsupported encryption and cannot be converted.',
    pdfPwdTitle: 'Enter Password',
    pdfPwdPrompt: 'This PDF is encrypted. Enter the password to open it:',
    docPwdPrompt: 'This file is password-protected. Enter the password to open it:',
    pdfPwdRetryPrompt: 'Incorrect password. Please try again.',
    pdfPwdOk: 'OK',
    pdfPwdVerifying: 'Verifying password…',
    pdfPwdLabel: 'Password',
    pdfPwdPlaceholder: 'Enter the open password',
    pdfPwdShow: 'Show password',
    pdfPwdHide: 'Hide password',
    pdfDocxLocalCorruptDetail: 'The file is damaged or not a valid PDF and cannot be converted.',
    dlgPickSaveDir: 'Choose Default Save Location',
    errSaveDirUnusable:
      'The selected folder is not writable and cannot be used as the default save location',
  },
  vi: {
    dlgAddFolderRoot: 'Thêm thư mục vào Trang chủ',
    watchdogTitle: 'Tài liệu đang dùng quá nhiều tài nguyên',
    watchdogBody:
      '"{title}" đã dùng nhiều bộ nhớ hoặc CPU trong vài phút ({memory} MB, {cpu}% CPU). Bạn có thể tiếp tục chờ hoặc đóng tài liệu này (sẽ hỏi lưu các thay đổi chưa lưu trước). Thông tin chẩn đoán đã được ghi lại.',
    watchdogWait: 'Tiếp tục chờ',
    watchdogClose: 'Đóng tài liệu',
    crashTitle: 'Tài liệu dừng đột ngột',
    crashBody: '"{title}" đã dừng đột ngột. Những thay đổi sau lần lưu gần nhất có thể đã bị mất.',
    crashReopen: 'Mở lại',
    crashReload: 'Tải lại',
    crashClose: 'Đóng',
    crashLater: 'Để sau',
    errFolderRootUnusable: 'Không thể đọc thư mục đã chọn',
    menuFile: 'Tệp',
    menuSectionNew: 'Mới',
    menuOpenInNewWindow: 'Mở trong cửa sổ mới',
    menuSplitRight: 'Chia sang phải',
    menuSplitDown: 'Chia xuống dưới',
    menuUnsplit: 'Hủy chia',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'Bảng tính chưa có tiêu đề',
    untitledDoc: 'Tài liệu chưa có tiêu đề',
    untitledDeck: 'Bản trình bày chưa có tiêu đề',
    untitledMarkdown: 'Markdown chưa có tiêu đề',
    untitledHtml: 'HTML chưa có tiêu đề',
    untitledMindmap: 'Sơ đồ tư duy chưa có tiêu đề',
    untitledHwp: 'HWP chưa có tiêu đề',
    untitledPdf: 'PDF chưa có tiêu đề',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'Sơ đồ tư duy',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'Xuất dưới dạng PDF…',
    menuExportImages: 'Xuất dưới dạng hình ảnh…',
    menuExportHtml: 'Xuất dưới dạng HTML một tệp…',
    menuExportMapImage: 'Xuất dưới dạng hình ảnh (PNG)…',
    menuExportMapOutline: 'Xuất dưới dạng dàn ý Markdown…',
    menuMakeFromDocument: 'Tạo tài liệu khác từ tài liệu này',
    menuDocumentSources: 'Xem tài liệu nguồn',
    menuDerivedDocuments: 'Tài liệu tạo từ tài liệu này',
    menuOpenInDocs: 'Chuyển đổi và mở trong Docs',
    menuPrint: 'In…',
    menuOpen: 'Mở…',
    menuSave: 'Lưu',
    menuSaveAs: 'Lưu dưới dạng…',
    menuClose: 'Đóng',
    menuEdit: 'Chỉnh sửa',
    menuWindow: 'Cửa sổ',
    menuHome: 'Trang chủ',
    backToHome: 'Quay lại Trang chủ',
    dlgOpenTitle: 'Mở tệp',
    filterSupported: 'Các tệp được hỗ trợ',
    filterWord: 'Tài liệu Word',
    filterOdt: 'Văn bản OpenDocument',
    filterExcel: 'Sổ làm việc Excel',
    filterPpt: 'Bản trình bày PowerPoint',
    filterMarkdown: 'Tệp văn bản (Markdown, TXT, JSON)',
    filterHtml: 'Tài liệu HTML',
    filterMindmap: 'Sơ đồ tư duy (tệp XMind)',
    filterHwp: 'Tài liệu HWP (HWP, HWPX)',
    filterPdf: 'Tài liệu PDF',
    errBadArgs: 'Đối số không hợp lệ',
    errBadName: 'Tên tệp không hợp lệ',
    errBadExtension: 'Phần mở rộng đó không được hỗ trợ và tệp sẽ không còn mở được',
    errMissing: 'Không tìm thấy tệp',
    errExists: 'Một tệp có tên đó đã tồn tại',
    errRenameFailed: 'Đổi tên thất bại',
    errPdfSaveAsFailed: 'Không thể lưu bản sao PDF',
    errNewTabFailed: 'Không thể tạo tài liệu mới',
    errDuplicateFailed: 'Không thể nhân bản tệp',
    errUnsupportedExt: 'Tệp .{ext} không được hỗ trợ',
    copySuffix: 'bản sao',
    menuHelp: 'Trợ giúp',
    menuUserGuide: 'Hướng dẫn sử dụng',
    thirdPartyNotices: 'Thông báo của bên thứ ba',
    menuExportDocx: 'Xuất dưới dạng Word…',
    menuExportOdt: 'Xuất dưới dạng ODT…',
    btnCancel: 'Hủy',
    pdfDocxFailedMsg: 'Xuất dưới dạng Word thất bại',
    pdfDocxBusyMsg: 'Một tác vụ xuất Word đang được tiến hành. Vui lòng đợi tác vụ hoàn tất.',
    menuExportPptx: 'Xuất dưới dạng PowerPoint…',
    pdfPptxFailedMsg: 'Xuất dưới dạng PowerPoint thất bại',
    pdfPptxBusyMsg: 'Một tác vụ xuất đang được tiến hành. Vui lòng đợi tác vụ hoàn tất.',
    pdfPptxLocalScannedDetail:
      'Mỗi trang đã được xuất dưới dạng hình ảnh toàn trang; văn bản trên các trang trình bày không thể chỉnh sửa.',
    menuExportXlsx: 'Xuất dưới dạng Excel…',
    menuExportMd: 'Xuất dưới dạng Markdown…',
    menuExportEpub: 'Xuất dưới dạng EPUB…',
    pdfXlsxFailedMsg: 'Xuất dưới dạng Excel thất bại',
    pdfXlsxBusyMsg: 'Một tác vụ xuất đang được tiến hành. Vui lòng đợi tác vụ hoàn tất.',
    pdfXlsxLocalScannedDetail:
      'Các trang quét không thể chuyển đổi thành các ô; thay vào đó, trang tính của mỗi trang có một hàng thông báo.',
    pdfXlsxLocalSkippedMsg: 'Một số trang không được chuyển đổi thành ô',
    pdfXlsxLocalSkippedDetail:
      'Các trang {pages} không thể chuyển đổi thành ô; thay vào đó bảng tính của chúng có một hàng thông báo.',
    pdfDocxLocalScannedMsg: 'Phát hiện tài liệu quét',
    pdfDocxLocalScannedDetail:
      'Các trang được xuất dưới dạng hình ảnh để bảo toàn giao diện; không nhận dạng được văn bản có thể chỉnh sửa.',
    pdfDocxLocalDegradedMsg: 'Một số trang được xuất dưới dạng hình ảnh',
    pdfDocxLocalDegradedDetail:
      '(Các) trang {pages} không thể tái cấu trúc đáng tin cậy và đã được xuất dưới dạng hình ảnh toàn trang.',
    pdfDocxLocalOcrMsg: 'Các trang quét đã được chuyển đổi thành văn bản có thể chỉnh sửa',
    pdfDocxLocalOcrDetail:
      '(Các) trang {pages} là bản quét; văn bản của chúng đã được phục hồi bằng OCR trên thiết bị. Vui lòng kiểm tra lại kết quả.',
    pdfDocxLocalEncryptedDetail:
      'Tệp PDF này đã được mã hóa và không thể mở nếu không có mật khẩu chính xác.',
    pdfDocxLocalUnsupportedEncDetail:
      'Tệp PDF này sử dụng mã hóa dựa trên chứng thư số hoặc mã hóa không được hỗ trợ khác và không thể chuyển đổi.',
    pdfPwdTitle: 'Nhập mật khẩu',
    pdfPwdPrompt: 'Tệp PDF này đã được mã hóa. Nhập mật khẩu để mở:',
    docPwdPrompt: 'Tệp này được bảo vệ bằng mật khẩu. Nhập mật khẩu để mở:',
    pdfPwdRetryPrompt: 'Mật khẩu không chính xác. Vui lòng thử lại.',
    pdfPwdOk: 'OK',
    pdfPwdVerifying: 'Đang xác minh mật khẩu…',
    pdfPwdLabel: 'Mật khẩu',
    pdfPwdPlaceholder: 'Nhập mật khẩu để mở',
    pdfPwdShow: 'Hiện mật khẩu',
    pdfPwdHide: 'Ẩn mật khẩu',
    pdfDocxLocalCorruptDetail:
      'Tệp bị hỏng hoặc không phải là tệp PDF hợp lệ và không thể chuyển đổi.',
    dlgPickSaveDir: 'Chọn vị trí lưu mặc định',
    errSaveDirUnusable: 'Thư mục đã chọn không thể ghi và không thể dùng làm vị trí lưu mặc định',
  },
  ja: {
    dlgAddFolderRoot: 'フォルダーをホームに追加',
    watchdogTitle: 'ドキュメントのリソース使用量が過大です',
    watchdogBody:
      '「{title}」が数分間にわたり大量のメモリまたは CPU を使用しています（メモリ {memory} MB、CPU {cpu}%）。そのまま待つか、このドキュメントを閉じることができます（未保存の変更がある場合は保存を確認します）。診断情報を記録しました。',
    watchdogWait: '待つ',
    watchdogClose: 'ドキュメントを閉じる',
    crashTitle: 'ドキュメントが予期せず停止しました',
    crashBody:
      '「{title}」が予期せず停止しました。最後に保存した後の変更は失われた可能性があります。',
    crashReopen: '開き直す',
    crashReload: '再読み込み',
    crashClose: '閉じる',
    crashLater: '後で',
    errFolderRootUnusable: '選択したフォルダーを読み取れません',
    menuFile: 'ファイル',
    menuSectionNew: '新規作成',
    menuOpenInNewWindow: '新しいウィンドウで開く',
    menuSplitRight: '右に分割',
    menuSplitDown: '下に分割',
    menuUnsplit: '分割を解除',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: '無題のスプレッドシート',
    untitledDoc: '無題のドキュメント',
    untitledDeck: '無題のプレゼンテーション',
    untitledMarkdown: '無題の Markdown',
    untitledHtml: '無題の HTML',
    untitledMindmap: '無題のマインドマップ',
    untitledHwp: '無題の HWP',
    untitledPdf: '無題の PDF',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'マインドマップ',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'PDF として書き出す…',
    menuExportImages: '画像としてエクスポート…',
    menuExportHtml: '単一ファイル HTML として書き出す…',
    menuExportMapImage: '画像 (PNG) としてエクスポート…',
    menuExportMapOutline: 'Markdown アウトラインとしてエクスポート…',
    menuMakeFromDocument: 'この文書から別の文書を作成',
    menuDocumentSources: '資料を表示',
    menuDerivedDocuments: 'この文書から作成した文書',
    menuOpenInDocs: 'Docs 文書に変換して開く',
    menuPrint: '印刷…',
    menuOpen: '開く…',
    menuSave: '保存',
    menuSaveAs: '名前を付けて保存…',
    menuClose: '閉じる',
    menuEdit: '編集',
    menuWindow: 'ウィンドウ',
    menuHome: 'ホーム',
    backToHome: 'ホームに戻る',
    dlgOpenTitle: 'ファイルを開く',
    filterSupported: '対応ファイル',
    filterWord: 'Word 文書',
    filterOdt: 'OpenDocument テキスト',
    filterExcel: 'Excel ブック',
    filterPpt: 'PowerPoint プレゼンテーション',
    filterMarkdown: 'テキストファイル (Markdown, TXT, JSON)',
    filterHtml: 'HTML ドキュメント',
    filterMindmap: 'マインドマップ (XMind ファイル)',
    filterHwp: 'HWP ドキュメント (HWP, HWPX)',
    filterPdf: 'PDF ドキュメント',
    errBadArgs: '引数が無効です',
    errBadName: 'ファイル名が無効です',
    errBadExtension: 'その拡張子はサポートされていないため、ファイルを開けなくなります',
    errMissing: 'ファイルが見つかりません',
    errExists: '同名のファイルが既に存在します',
    errRenameFailed: '名前の変更に失敗しました',
    errPdfSaveAsFailed: 'PDF のコピーを保存できませんでした',
    errNewTabFailed: '新規ドキュメントを作成できませんでした',
    errDuplicateFailed: 'ファイルを複製できませんでした',
    errUnsupportedExt: '.{ext} 形式には対応していません',
    copySuffix: 'コピー',
    menuHelp: 'ヘルプ',
    menuUserGuide: 'ユーザーガイド',
    thirdPartyNotices: 'サードパーティソフトウェアに関する通知',
    menuExportDocx: 'Word として書き出す…',
    menuExportOdt: 'ODT として書き出す…',
    btnCancel: 'キャンセル',
    pdfDocxFailedMsg: 'Word への書き出しに失敗しました',
    pdfDocxBusyMsg: 'Word への書き出しが進行中です。完了までお待ちください。',
    menuExportPptx: 'PowerPoint として書き出す…',
    pdfPptxFailedMsg: 'PowerPoint への書き出しに失敗しました',
    pdfPptxBusyMsg: '変換が進行中です。現在の書き出しが完了するまでお待ちください。',
    pdfPptxLocalScannedDetail:
      '各ページは画像として書き出されたため、スライド内のテキストは編集できません。',
    menuExportXlsx: 'Excel として書き出す…',
    menuExportMd: 'Markdown として書き出す…',
    menuExportEpub: 'EPUB として書き出す…',
    pdfXlsxFailedMsg: 'Excel への書き出しに失敗しました',
    pdfXlsxBusyMsg: '変換が進行中です。現在の書き出しが完了するまでお待ちください。',
    pdfXlsxLocalScannedDetail:
      'スキャンされたページはセルに変換できないため、各ページのワークシートに通知行を書き込みました。',
    pdfXlsxLocalSkippedMsg: '一部のページはセルに変換されませんでした',
    pdfXlsxLocalSkippedDetail:
      'ページ {pages} はセルに変換できなかったため、対応するワークシートに通知行を書き込みました。',
    pdfDocxLocalScannedMsg: 'スキャン文書を検出しました',
    pdfDocxLocalScannedDetail:
      '見た目を保つため各ページを画像として書き出しました。編集可能なテキストは認識できませんでした。',
    pdfDocxLocalDegradedMsg: '一部のページを画像として書き出しました',
    pdfDocxLocalDegradedDetail:
      'ページ {pages} はレイアウトを正確に再構築できなかったため、ページ全体を画像として書き出しました。',
    pdfDocxLocalOcrMsg: 'スキャンページを編集可能なテキストに変換しました',
    pdfDocxLocalOcrDetail:
      'ページ {pages} はスキャン画像のため、ローカル OCR でテキストを復元しました。内容の確認をおすすめします。',
    pdfDocxLocalEncryptedDetail:
      'このPDFは暗号化されており、正しいパスワードがないため変換できませんでした。',
    pdfDocxLocalUnsupportedEncDetail:
      'このPDFは証明書ベースまたは未対応の暗号化方式を使用しているため、変換できません。',
    pdfPwdTitle: 'パスワードを入力',
    pdfPwdPrompt: 'このPDFは暗号化されています。開くためのパスワードを入力してください：',
    docPwdPrompt:
      'このファイルはパスワードで保護されています。開くためのパスワードを入力してください：',
    pdfPwdRetryPrompt: 'パスワードが正しくありません。もう一度お試しください。',
    pdfPwdOk: 'OK',
    pdfPwdVerifying: 'パスワードを確認しています…',
    pdfPwdLabel: 'パスワード',
    pdfPwdPlaceholder: '開くパスワードを入力',
    pdfPwdShow: 'パスワードを表示',
    pdfPwdHide: 'パスワードを非表示',
    pdfDocxLocalCorruptDetail: 'ファイルが破損しているか有効なPDFではないため、変換できません。',
    dlgPickSaveDir: '既定の保存先を選択',
    errSaveDirUnusable:
      '選択したフォルダーは書き込みできないため、既定の保存先として使用できません',
  },
  ko: {
    dlgAddFolderRoot: '홈에 폴더 추가',
    watchdogTitle: '문서가 리소스를 과도하게 사용하고 있습니다',
    watchdogBody:
      '"{title}"이(가) 몇 분 동안 많은 메모리 또는 CPU를 사용하고 있습니다(메모리 {memory} MB, CPU {cpu}%). 계속 기다리거나 이 문서를 닫을 수 있습니다(저장되지 않은 변경 사항이 있으면 먼저 저장 여부를 묻습니다). 진단 정보가 기록되었습니다.',
    watchdogWait: '계속 기다리기',
    watchdogClose: '문서 닫기',
    crashTitle: '문서가 예기치 않게 멈췄습니다',
    crashBody:
      '"{title}" 화면이 예기치 않게 꺼졌습니다. 마지막으로 저장한 뒤의 변경은 사라졌을 수 있습니다.',
    crashReopen: '다시 열기',
    crashReload: '다시 불러오기',
    crashClose: '닫기',
    crashLater: '나중에',
    errFolderRootUnusable: '선택한 폴더를 읽을 수 없습니다',
    menuFile: '파일',
    menuSectionNew: '새로 만들기',
    menuOpenInNewWindow: '새 창에서 열기',
    menuSplitRight: '오른쪽에 나누기',
    menuSplitDown: '아래에 나누기',
    menuUnsplit: '나누기 풀기',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: '제목 없는 스프레드시트',
    untitledDoc: '제목 없는 문서',
    untitledDeck: '제목 없는 프레젠테이션',
    untitledMarkdown: '제목 없는 Markdown',
    untitledHtml: '제목 없는 HTML',
    untitledMindmap: '제목 없는 마인드맵',
    untitledHwp: '제목 없는 한글 문서',
    untitledPdf: '제목 없는 PDF',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: '마인드맵',
    menuNewHwp: 'AI 한글',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'PDF로 내보내기…',
    menuExportImages: '이미지로 내보내기…',
    menuExportHtml: '단일 파일 HTML로 내보내기…',
    menuExportMapImage: '이미지(PNG)로 내보내기…',
    menuExportMapOutline: '마크다운 개요로 내보내기…',
    menuMakeFromDocument: '이 문서로 다른 문서 만들기',
    menuDocumentSources: '자료 보기',
    menuDerivedDocuments: '이 문서로 만든 문서',
    menuOpenInDocs: 'Docs 문서로 변환하여 열기',
    menuPrint: '인쇄…',
    menuOpen: '열기…',
    menuSave: '저장',
    menuSaveAs: '다른 이름으로 저장…',
    menuClose: '닫기',
    menuEdit: '편집',
    menuWindow: '창',
    menuHome: '홈',
    backToHome: '홈으로 돌아가기',
    dlgOpenTitle: '파일 열기',
    filterSupported: '지원되는 파일',
    filterWord: 'Word 문서',
    filterOdt: 'OpenDocument 텍스트',
    filterExcel: 'Excel 통합 문서',
    filterPpt: 'PowerPoint 프레젠테이션',
    filterMarkdown: '텍스트 파일 (Markdown, TXT, JSON)',
    filterHtml: 'HTML 문서',
    filterMindmap: '마인드맵 (XMind 파일)',
    filterHwp: '한글 문서 (HWP, HWPX)',
    filterPdf: 'PDF 문서',
    errBadArgs: '잘못된 인수입니다',
    errBadName: '파일 이름이 잘못되었습니다',
    errBadExtension: '지원하지 않는 확장자이며 파일을 열 수 없게 됩니다',
    errMissing: '파일을 찾을 수 없습니다',
    errExists: '같은 이름의 파일이 이미 있습니다',
    errRenameFailed: '이름 바꾸기에 실패했습니다',
    errPdfSaveAsFailed: 'PDF 복사본을 저장할 수 없습니다',
    errNewTabFailed: '새 문서를 만들지 못했습니다',
    errDuplicateFailed: '파일을 복제할 수 없습니다',
    errUnsupportedExt: '.{ext} 형식은 지원되지 않습니다',
    copySuffix: '복사본',
    menuHelp: '도움말',
    menuUserGuide: '사용자 가이드',
    thirdPartyNotices: '타사 소프트웨어 고지',
    menuExportDocx: 'Word로 내보내기…',
    menuExportOdt: 'ODT로 내보내기…',
    btnCancel: '취소',
    pdfDocxFailedMsg: 'Word로 내보내기 실패',
    pdfDocxBusyMsg: 'Word 내보내기가 이미 진행 중입니다. 완료될 때까지 기다려 주세요.',
    menuExportPptx: 'PowerPoint로 내보내기…',
    pdfPptxFailedMsg: 'PowerPoint 내보내기 실패',
    pdfPptxBusyMsg: '변환이 진행 중입니다. 현재 내보내기가 완료될 때까지 기다려 주세요.',
    pdfPptxLocalScannedDetail:
      '각 페이지가 이미지로 내보내져 슬라이드의 텍스트를 편집할 수 없습니다.',
    menuExportXlsx: 'Excel로 내보내기…',
    menuExportMd: 'Markdown으로 내보내기…',
    menuExportEpub: 'EPUB으로 내보내기…',
    pdfXlsxFailedMsg: 'Excel 내보내기 실패',
    pdfXlsxBusyMsg: '변환이 진행 중입니다. 현재 내보내기가 완료될 때까지 기다려 주세요.',
    pdfXlsxLocalScannedDetail:
      '스캔된 페이지는 셀로 변환할 수 없어 각 페이지의 워크시트에 알림 행을 기록했습니다.',
    pdfXlsxLocalSkippedMsg: '일부 페이지가 셀로 변환되지 않았습니다',
    pdfXlsxLocalSkippedDetail:
      '{pages} 페이지는 셀로 변환할 수 없어 해당 워크시트에 알림 행을 기록했습니다.',
    pdfDocxLocalScannedMsg: '스캔 문서가 감지되었습니다',
    pdfDocxLocalScannedDetail:
      '모양을 유지하기 위해 각 페이지를 이미지로 내보냈습니다. 편집 가능한 텍스트를 인식할 수 없었습니다.',
    pdfDocxLocalDegradedMsg: '일부 페이지가 이미지로 내보내졌습니다',
    pdfDocxLocalDegradedDetail:
      '{pages}쪽은 레이아웃을 안정적으로 재구성할 수 없어 전체 페이지 이미지로 내보냈습니다.',
    pdfDocxLocalOcrMsg: '스캔 페이지를 편집 가능한 텍스트로 변환했습니다',
    pdfDocxLocalOcrDetail:
      '{pages}페이지는 스캔 이미지로, 로컬 OCR로 텍스트를 복원했습니다. 결과를 검토해 주세요.',
    pdfDocxLocalEncryptedDetail:
      '이 PDF는 암호화되어 있으며 올바른 비밀번호가 없어 변환할 수 없습니다.',
    pdfDocxLocalUnsupportedEncDetail:
      '이 PDF는 인증서 기반이거나 지원되지 않는 암호화 방식을 사용하므로 변환할 수 없습니다.',
    pdfPwdTitle: '비밀번호 입력',
    pdfPwdPrompt: '이 PDF는 암호화되어 있습니다. 열기 위한 비밀번호를 입력하세요:',
    docPwdPrompt: '이 파일은 암호로 보호되어 있습니다. 열기 위한 비밀번호를 입력하세요:',
    pdfPwdRetryPrompt: '비밀번호가 올바르지 않습니다. 다시 시도하세요.',
    pdfPwdOk: '확인',
    pdfPwdVerifying: '비밀번호 확인 중…',
    pdfPwdLabel: '암호',
    pdfPwdPlaceholder: '열기 암호 입력',
    pdfPwdShow: '암호 표시',
    pdfPwdHide: '암호 숨기기',
    pdfDocxLocalCorruptDetail: '파일이 손상되었거나 유효한 PDF가 아니어서 변환할 수 없습니다.',
    dlgPickSaveDir: '기본 저장 위치 선택',
    errSaveDirUnusable: '선택한 폴더에 쓸 수 없어 기본 저장 위치로 사용할 수 없습니다',
  },
  fr: {
    dlgAddFolderRoot: "Ajouter un dossier à l'accueil",
    watchdogTitle: 'Le document consomme trop de ressources',
    watchdogBody:
      '« {title} » utilise beaucoup de mémoire ou de processeur depuis plusieurs minutes ({memory} Mo, {cpu} % CPU). Vous pouvez continuer à attendre ou fermer ce document (il vous sera d’abord demandé d’enregistrer les modifications non sauvegardées). Les diagnostics ont été enregistrés.',
    watchdogWait: 'Continuer d’attendre',
    watchdogClose: 'Fermer le document',
    crashTitle: 'Un document s’est arrêté de façon inattendue',
    crashBody:
      '« {title} » s’est arrêté de façon inattendue. Les modifications faites depuis le dernier enregistrement ont peut-être été perdues.',
    crashReopen: 'Rouvrir',
    crashReload: 'Recharger',
    crashClose: 'Fermer',
    crashLater: 'Plus tard',
    errFolderRootUnusable: 'Le dossier sélectionné ne peut pas être lu',
    menuFile: 'Fichier',
    menuSectionNew: 'Nouveau',
    menuOpenInNewWindow: 'Ouvrir dans une nouvelle fenêtre',
    menuSplitRight: 'Diviser à droite',
    menuSplitDown: 'Diviser en bas',
    menuUnsplit: 'Annuler la division',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'Feuille de calcul sans titre',
    untitledDoc: 'Document sans titre',
    untitledDeck: 'Présentation sans titre',
    untitledMarkdown: 'Markdown sans titre',
    untitledHtml: 'HTML sans titre',
    untitledMindmap: 'Carte mentale sans titre',
    untitledHwp: 'HWP sans titre',
    untitledPdf: 'PDF sans titre',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'Carte mentale',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'Exporter en PDF…',
    menuExportImages: 'Exporter en images…',
    menuExportHtml: 'Exporter en HTML (fichier unique)…',
    menuExportMapImage: 'Exporter en image (PNG)…',
    menuExportMapOutline: 'Exporter en plan Markdown…',
    menuMakeFromDocument: 'Créer un autre document à partir de celui-ci',
    menuDocumentSources: 'Voir les sources',
    menuDerivedDocuments: 'Documents créés à partir de celui-ci',
    menuOpenInDocs: 'Convertir et ouvrir dans Docs',
    menuPrint: 'Imprimer…',
    menuOpen: 'Ouvrir…',
    menuSave: 'Enregistrer',
    menuSaveAs: 'Enregistrer sous…',
    menuClose: 'Fermer',
    menuEdit: 'Édition',
    menuWindow: 'Fenêtre',
    menuHome: 'Accueil',
    backToHome: "Retour à l'accueil",
    dlgOpenTitle: 'Ouvrir un fichier',
    filterSupported: 'Fichiers pris en charge',
    filterWord: 'Documents Word',
    filterOdt: 'Texte OpenDocument',
    filterExcel: 'Classeurs Excel',
    filterPpt: 'Présentations PowerPoint',
    filterMarkdown: 'Fichiers texte (Markdown, TXT, JSON)',
    filterHtml: 'Documents HTML',
    filterMindmap: 'Cartes mentales (fichiers XMind)',
    filterHwp: 'Documents HWP (HWP, HWPX)',
    filterPdf: 'Documents PDF',
    errBadArgs: 'Arguments non valides',
    errBadName: 'Nom de fichier non valide',
    errBadExtension: 'Cette extension n’est pas prise en charge et le fichier ne s’ouvrirait plus',
    errMissing: 'Fichier introuvable',
    errExists: 'Un fichier du même nom existe déjà',
    errRenameFailed: 'Échec du renommage',
    errPdfSaveAsFailed: 'Impossible d’enregistrer la copie du PDF',
    errNewTabFailed: 'Impossible de créer le nouveau document',
    errDuplicateFailed: 'Impossible de dupliquer le fichier',
    errUnsupportedExt: 'les fichiers .{ext} ne sont pas pris en charge',
    copySuffix: 'copie',
    menuHelp: 'Aide',
    menuUserGuide: "Guide de l'utilisateur",
    thirdPartyNotices: 'Mentions relatives aux logiciels tiers',
    menuExportDocx: 'Exporter en Word…',
    menuExportOdt: 'Exporter en ODT…',
    btnCancel: 'Annuler',
    pdfDocxFailedMsg: "Échec de l'export en Word",
    pdfDocxBusyMsg: "Un export en Word est déjà en cours. Veuillez attendre qu'il se termine.",
    menuExportPptx: 'Exporter en PowerPoint…',
    pdfPptxFailedMsg: "Échec de l'exportation en PowerPoint",
    pdfPptxBusyMsg: "Une exportation est déjà en cours. Veuillez attendre qu'elle se termine.",
    pdfPptxLocalScannedDetail:
      "Chaque page a été exportée sous forme d'image ; le texte des diapositives n'est pas modifiable.",
    menuExportXlsx: 'Exporter en Excel…',
    menuExportMd: 'Exporter en Markdown…',
    menuExportEpub: 'Exporter en EPUB…',
    pdfXlsxFailedMsg: "Échec de l'exportation en Excel",
    pdfXlsxBusyMsg: "Une exportation est déjà en cours. Veuillez attendre qu'elle se termine.",
    pdfXlsxLocalScannedDetail:
      "Les pages numérisées ne peuvent pas être converties en cellules ; la feuille de chaque page contient une ligne d'avertissement.",
    pdfXlsxLocalSkippedMsg: "Certaines pages n'ont pas été converties en cellules",
    pdfXlsxLocalSkippedDetail:
      "Les pages {pages} n'ont pas pu être converties en cellules ; leurs feuilles contiennent une ligne d'avertissement.",
    pdfDocxLocalScannedMsg: 'Document numérisé détecté',
    pdfDocxLocalScannedDetail:
      "Les pages ont été exportées sous forme d'images pour préserver leur apparence ; aucun texte modifiable n'a pu être reconnu.",
    pdfDocxLocalDegradedMsg: 'Certaines pages ont été exportées en images',
    pdfDocxLocalDegradedDetail:
      "Les pages {pages} n'ont pas pu être reconstruites de manière fiable et ont été exportées en images pleine page.",
    pdfDocxLocalOcrMsg: 'Pages numérisées converties en texte modifiable',
    pdfDocxLocalOcrDetail:
      'Les pages {pages} étaient des numérisations ; leur texte a été restitué par OCR local. Veuillez relire le résultat.',
    pdfDocxLocalEncryptedDetail:
      "Ce PDF est chiffré et n'a pas pu être ouvert sans le mot de passe correct.",
    pdfDocxLocalUnsupportedEncDetail:
      'Ce PDF utilise un chiffrement par certificat ou un chiffrement non pris en charge et ne peut pas être converti.',
    pdfPwdTitle: 'Saisir le mot de passe',
    pdfPwdPrompt: "Ce PDF est chiffré. Saisissez le mot de passe pour l'ouvrir :",
    docPwdPrompt:
      "Ce fichier est protégé par un mot de passe. Saisissez le mot de passe pour l'ouvrir :",
    pdfPwdRetryPrompt: 'Mot de passe incorrect. Veuillez réessayer.',
    pdfPwdOk: 'OK',
    pdfPwdVerifying: 'Vérification du mot de passe…',
    pdfPwdLabel: 'Mot de passe',
    pdfPwdPlaceholder: 'Saisissez le mot de passe d’ouverture',
    pdfPwdShow: 'Afficher le mot de passe',
    pdfPwdHide: 'Masquer le mot de passe',
    pdfDocxLocalCorruptDetail:
      "Le fichier est endommagé ou n'est pas un PDF valide et ne peut pas être converti.",
    dlgPickSaveDir: "Choisir l'emplacement d'enregistrement par défaut",
    errSaveDirUnusable:
      "Le dossier sélectionné n'est pas accessible en écriture et ne peut pas servir d'emplacement d'enregistrement par défaut",
  },
  de: {
    dlgAddFolderRoot: 'Ordner zur Startseite hinzufügen',
    watchdogTitle: 'Dokument beansprucht zu viele Ressourcen',
    watchdogBody:
      '„{title}“ belegt seit mehreren Minuten viel Arbeitsspeicher oder CPU ({memory} MB, {cpu} % CPU). Sie können weiter warten oder das Dokument schließen (bei ungespeicherten Änderungen werden Sie zuerst zum Speichern gefragt). Diagnosedaten wurden aufgezeichnet.',
    watchdogWait: 'Weiter warten',
    watchdogClose: 'Dokument schließen',
    crashTitle: 'Ein Dokument wurde unerwartet beendet',
    crashBody:
      '„{title}“ wurde unerwartet beendet. Änderungen seit dem letzten Speichern sind möglicherweise verloren.',
    crashReopen: 'Erneut öffnen',
    crashReload: 'Neu laden',
    crashClose: 'Schließen',
    crashLater: 'Später',
    errFolderRootUnusable: 'Der ausgewählte Ordner kann nicht gelesen werden',
    menuFile: 'Datei',
    menuSectionNew: 'Neu',
    menuOpenInNewWindow: 'In neuem Fenster öffnen',
    menuSplitRight: 'Rechts teilen',
    menuSplitDown: 'Unten teilen',
    menuUnsplit: 'Teilung aufheben',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'Unbenannte Tabelle',
    untitledDoc: 'Unbenanntes Dokument',
    untitledDeck: 'Unbenannte Präsentation',
    untitledMarkdown: 'Unbenanntes Markdown',
    untitledHtml: 'Unbenanntes HTML',
    untitledMindmap: 'Unbenannte Mindmap',
    untitledHwp: 'Unbenanntes HWP',
    untitledPdf: 'Unbenanntes PDF',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'Mindmap',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'Als PDF exportieren…',
    menuExportImages: 'Als Bilder exportieren…',
    menuExportHtml: 'Als Einzeldatei-HTML exportieren…',
    menuExportMapImage: 'Als Bild (PNG) exportieren…',
    menuExportMapOutline: 'Als Markdown-Gliederung exportieren…',
    menuMakeFromDocument: 'Anderes Dokument aus diesem erstellen',
    menuDocumentSources: 'Quellen anzeigen',
    menuDerivedDocuments: 'Aus diesem erstellte Dokumente',
    menuOpenInDocs: 'In Docs umwandeln und öffnen',
    menuPrint: 'Drucken…',
    menuOpen: 'Öffnen…',
    menuSave: 'Speichern',
    menuSaveAs: 'Speichern unter…',
    menuClose: 'Schließen',
    menuEdit: 'Bearbeiten',
    menuWindow: 'Fenster',
    menuHome: 'Startseite',
    backToHome: 'Zurück zur Startseite',
    dlgOpenTitle: 'Datei öffnen',
    filterSupported: 'Unterstützte Dateien',
    filterWord: 'Word-Dokumente',
    filterOdt: 'OpenDocument-Text',
    filterExcel: 'Excel-Arbeitsmappen',
    filterPpt: 'PowerPoint-Präsentationen',
    filterMarkdown: 'Textdateien (Markdown, TXT, JSON)',
    filterHtml: 'HTML-Dokumente',
    filterMindmap: 'Mindmaps (XMind-Dateien)',
    filterHwp: 'HWP-Dokumente (HWP, HWPX)',
    filterPdf: 'PDF-Dokumente',
    errBadArgs: 'Ungültige Argumente',
    errBadName: 'Ungültiger Dateiname',
    errBadExtension:
      'Diese Erweiterung wird nicht unterstützt, die Datei ließe sich nicht mehr öffnen',
    errMissing: 'Datei nicht gefunden',
    errExists: 'Eine Datei mit diesem Namen existiert bereits',
    errRenameFailed: 'Umbenennen fehlgeschlagen',
    errPdfSaveAsFailed: 'Die PDF-Kopie konnte nicht gespeichert werden',
    errNewTabFailed: 'Neues Dokument konnte nicht erstellt werden',
    errDuplicateFailed: 'Datei konnte nicht dupliziert werden',
    errUnsupportedExt: '.{ext}-Dateien werden nicht unterstützt',
    copySuffix: 'Kopie',
    menuHelp: 'Hilfe',
    menuUserGuide: 'Benutzerhandbuch',
    thirdPartyNotices: 'Hinweise zu Drittanbietersoftware',
    menuExportDocx: 'Als Word exportieren…',
    menuExportOdt: 'Als ODT exportieren…',
    btnCancel: 'Abbrechen',
    pdfDocxFailedMsg: 'Word-Export fehlgeschlagen',
    pdfDocxBusyMsg: 'Ein Word-Export läuft bereits. Bitte warten Sie, bis er abgeschlossen ist.',
    menuExportPptx: 'Als PowerPoint exportieren…',
    pdfPptxFailedMsg: 'Export als PowerPoint fehlgeschlagen',
    pdfPptxBusyMsg: 'Ein Export läuft bereits. Bitte warten Sie, bis er abgeschlossen ist.',
    pdfPptxLocalScannedDetail:
      'Jede Seite wurde als Bild exportiert; der Text auf den Folien ist nicht bearbeitbar.',
    menuExportXlsx: 'Als Excel exportieren…',
    menuExportMd: 'Als Markdown exportieren…',
    menuExportEpub: 'Als EPUB exportieren…',
    pdfXlsxFailedMsg: 'Export als Excel fehlgeschlagen',
    pdfXlsxBusyMsg: 'Ein Export läuft bereits. Bitte warten Sie, bis er abgeschlossen ist.',
    pdfXlsxLocalScannedDetail:
      'Gescannte Seiten können nicht in Zellen umgewandelt werden; das Arbeitsblatt jeder Seite enthält stattdessen eine Hinweiszeile.',
    pdfXlsxLocalSkippedMsg: 'Einige Seiten wurden nicht in Zellen umgewandelt',
    pdfXlsxLocalSkippedDetail:
      'Die Seiten {pages} konnten nicht in Zellen umgewandelt werden; ihre Arbeitsblätter enthalten stattdessen eine Hinweiszeile.',
    pdfDocxLocalScannedMsg: 'Gescanntes Dokument erkannt',
    pdfDocxLocalScannedDetail:
      'Die Seiten wurden als Bilder exportiert, um ihr Aussehen zu erhalten. Es konnte kein bearbeitbarer Text erkannt werden.',
    pdfDocxLocalDegradedMsg: 'Einige Seiten wurden als Bilder exportiert',
    pdfDocxLocalDegradedDetail:
      'Seite(n) {pages} konnten nicht zuverlässig rekonstruiert werden und wurden als ganzseitige Bilder exportiert.',
    pdfDocxLocalOcrMsg: 'Gescannte Seiten in bearbeitbaren Text umgewandelt',
    pdfDocxLocalOcrDetail:
      'Seite(n) {pages} waren Scans; der Text wurde per lokaler OCR wiederhergestellt. Bitte prüfen Sie das Ergebnis.',
    pdfDocxLocalEncryptedDetail:
      'Diese PDF ist verschlüsselt und konnte ohne das richtige Passwort nicht geöffnet werden.',
    pdfDocxLocalUnsupportedEncDetail:
      'Diese PDF verwendet eine zertifikatsbasierte oder nicht unterstützte Verschlüsselung und kann nicht konvertiert werden.',
    pdfPwdTitle: 'Passwort eingeben',
    pdfPwdPrompt: 'Diese PDF ist verschlüsselt. Geben Sie das Passwort zum Öffnen ein:',
    docPwdPrompt: 'Diese Datei ist kennwortgeschützt. Geben Sie das Kennwort zum Öffnen ein:',
    pdfPwdRetryPrompt: 'Falsches Passwort. Bitte versuchen Sie es erneut.',
    pdfPwdOk: 'OK',
    pdfPwdVerifying: 'Passwort wird überprüft…',
    pdfPwdLabel: 'Passwort',
    pdfPwdPlaceholder: 'Passwort zum Öffnen eingeben',
    pdfPwdShow: 'Passwort anzeigen',
    pdfPwdHide: 'Passwort ausblenden',
    pdfDocxLocalCorruptDetail:
      'Die Datei ist beschädigt oder keine gültige PDF und kann nicht konvertiert werden.',
    dlgPickSaveDir: 'Standard-Speicherort auswählen',
    errSaveDirUnusable:
      'Der ausgewählte Ordner ist nicht beschreibbar und kann nicht als Standard-Speicherort verwendet werden',
  },
  es: {
    dlgAddFolderRoot: 'Añadir carpeta al inicio',
    watchdogTitle: 'El documento consume demasiados recursos',
    watchdogBody:
      '«{title}» lleva varios minutos usando mucha memoria o CPU ({memory} MB, {cpu} % de CPU). Puedes seguir esperando o cerrar el documento (antes se te pedirá guardar los cambios sin guardar). Se ha registrado el diagnóstico.',
    watchdogWait: 'Seguir esperando',
    watchdogClose: 'Cerrar documento',
    crashTitle: 'Un documento se detuvo inesperadamente',
    crashBody:
      '«{title}» se detuvo inesperadamente. Es posible que se hayan perdido los cambios hechos desde la última vez que se guardó.',
    crashReopen: 'Volver a abrir',
    crashReload: 'Volver a cargar',
    crashClose: 'Cerrar',
    crashLater: 'Ahora no',
    errFolderRootUnusable: 'No se puede leer la carpeta seleccionada',
    menuFile: 'Archivo',
    menuSectionNew: 'Nuevo',
    menuOpenInNewWindow: 'Abrir en una ventana nueva',
    menuSplitRight: 'Dividir a la derecha',
    menuSplitDown: 'Dividir abajo',
    menuUnsplit: 'Quitar división',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'Hoja de cálculo sin título',
    untitledDoc: 'Documento sin título',
    untitledDeck: 'Presentación sin título',
    untitledMarkdown: 'Markdown sin título',
    untitledHtml: 'HTML sin título',
    untitledMindmap: 'Mapa mental sin título',
    untitledHwp: 'HWP sin título',
    untitledPdf: 'PDF sin título',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'Mapa mental',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'Exportar como PDF…',
    menuExportImages: 'Exportar como imágenes…',
    menuExportHtml: 'Exportar como HTML de archivo único…',
    menuExportMapImage: 'Exportar como imagen (PNG)…',
    menuExportMapOutline: 'Exportar como esquema Markdown…',
    menuMakeFromDocument: 'Crear otro documento a partir de este',
    menuDocumentSources: 'Ver fuentes',
    menuDerivedDocuments: 'Documentos creados a partir de este',
    menuOpenInDocs: 'Convertir y abrir en Docs',
    menuPrint: 'Imprimir…',
    menuOpen: 'Abrir…',
    menuSave: 'Guardar',
    menuSaveAs: 'Guardar como…',
    menuClose: 'Cerrar',
    menuEdit: 'Edición',
    menuWindow: 'Ventana',
    menuHome: 'Inicio',
    backToHome: 'Volver al inicio',
    dlgOpenTitle: 'Abrir archivo',
    filterSupported: 'Archivos compatibles',
    filterWord: 'Documentos de Word',
    filterOdt: 'Texto OpenDocument',
    filterExcel: 'Libros de Excel',
    filterPpt: 'Presentaciones de PowerPoint',
    filterMarkdown: 'Archivos de texto (Markdown, TXT, JSON)',
    filterHtml: 'Documentos HTML',
    filterMindmap: 'Mapas mentales (archivos XMind)',
    filterHwp: 'Documentos HWP (HWP, HWPX)',
    filterPdf: 'Documentos PDF',
    errBadArgs: 'Argumentos no válidos',
    errBadName: 'Nombre de archivo no válido',
    errBadExtension: 'Esa extensión no es compatible y el archivo dejaría de abrirse',
    errMissing: 'Archivo no encontrado',
    errExists: 'Ya existe un archivo con ese nombre',
    errRenameFailed: 'No se pudo cambiar el nombre',
    errPdfSaveAsFailed: 'No se pudo guardar la copia del PDF',
    errNewTabFailed: 'No se pudo crear el nuevo documento',
    errDuplicateFailed: 'No se pudo duplicar el archivo',
    errUnsupportedExt: 'los archivos .{ext} no son compatibles',
    copySuffix: 'copia',
    menuHelp: 'Ayuda',
    menuUserGuide: 'Guía del usuario',
    thirdPartyNotices: 'Avisos de software de terceros',
    menuExportDocx: 'Exportar como Word…',
    menuExportOdt: 'Exportar como ODT…',
    btnCancel: 'Cancelar',
    pdfDocxFailedMsg: 'Error al exportar como Word',
    pdfDocxBusyMsg: 'Ya hay una exportación a Word en curso. Espera a que termine.',
    menuExportPptx: 'Exportar como PowerPoint…',
    pdfPptxFailedMsg: 'Error al exportar como PowerPoint',
    pdfPptxBusyMsg: 'Ya hay una exportación en curso. Espere a que termine.',
    pdfPptxLocalScannedDetail:
      'Cada página se exportó como imagen; el texto de las diapositivas no es editable.',
    menuExportXlsx: 'Exportar como Excel…',
    menuExportMd: 'Exportar como Markdown…',
    menuExportEpub: 'Exportar como EPUB…',
    pdfXlsxFailedMsg: 'Error al exportar como Excel',
    pdfXlsxBusyMsg: 'Ya hay una exportación en curso. Espere a que termine.',
    pdfXlsxLocalScannedDetail:
      'Las páginas escaneadas no se pueden convertir en celdas; la hoja de cada página incluye una fila de aviso.',
    pdfXlsxLocalSkippedMsg: 'Algunas páginas no se convirtieron en celdas',
    pdfXlsxLocalSkippedDetail:
      'Las páginas {pages} no se pudieron convertir en celdas; sus hojas incluyen una fila de aviso.',
    pdfDocxLocalScannedMsg: 'Documento escaneado detectado',
    pdfDocxLocalScannedDetail:
      'Las páginas se exportaron como imágenes para conservar su aspecto. No se pudo reconocer texto editable.',
    pdfDocxLocalDegradedMsg: 'Algunas páginas se exportaron como imágenes',
    pdfDocxLocalDegradedDetail:
      'Las páginas {pages} no se pudieron reconstruir de forma fiable y se exportaron como imágenes de página completa.',
    pdfDocxLocalOcrMsg: 'Páginas escaneadas convertidas en texto editable',
    pdfDocxLocalOcrDetail:
      'Las páginas {pages} eran escaneos; su texto se recuperó con OCR local. Revise el resultado.',
    pdfDocxLocalEncryptedDetail:
      'Este PDF está cifrado y no se pudo abrir sin la contraseña correcta.',
    pdfDocxLocalUnsupportedEncDetail:
      'Este PDF usa cifrado basado en certificados u otro cifrado no compatible y no se puede convertir.',
    pdfPwdTitle: 'Introducir contraseña',
    pdfPwdPrompt: 'Este PDF está cifrado. Introduzca la contraseña para abrirlo:',
    docPwdPrompt:
      'Este archivo está protegido con contraseña. Introduce la contraseña para abrirlo:',
    pdfPwdRetryPrompt: 'Contraseña incorrecta. Inténtelo de nuevo.',
    pdfPwdOk: 'Aceptar',
    pdfPwdVerifying: 'Verificando la contraseña…',
    pdfPwdLabel: 'Contraseña',
    pdfPwdPlaceholder: 'Escriba la contraseña de apertura',
    pdfPwdShow: 'Mostrar contraseña',
    pdfPwdHide: 'Ocultar contraseña',
    pdfDocxLocalCorruptDetail:
      'El archivo está dañado o no es un PDF válido y no se puede convertir.',
    dlgPickSaveDir: 'Elegir ubicación de guardado predeterminada',
    errSaveDirUnusable:
      'La carpeta seleccionada no admite escritura y no puede usarse como ubicación de guardado predeterminada',
  },
  th: {
    dlgAddFolderRoot: 'เพิ่มโฟลเดอร์ไปยังหน้าแรก',
    watchdogTitle: 'เอกสารใช้ทรัพยากรมากเกินไป',
    watchdogBody:
      '"{title}" ใช้หน่วยความจำหรือ CPU จำนวนมากติดต่อกันหลายนาที (หน่วยความจำ {memory} MB, CPU {cpu}%) คุณสามารถรอต่อไปหรือปิดเอกสารนี้ได้ (หากมีการเปลี่ยนแปลงที่ยังไม่บันทึกจะถามให้บันทึกก่อน) บันทึกข้อมูลวินิจฉัยแล้ว',
    watchdogWait: 'รอต่อไป',
    watchdogClose: 'ปิดเอกสาร',
    crashTitle: 'เอกสารหยุดทำงานโดยไม่คาดคิด',
    crashBody: '"{title}" หยุดทำงานโดยไม่คาดคิด การเปลี่ยนแปลงหลังการบันทึกครั้งล่าสุดอาจสูญหาย',
    crashReopen: 'เปิดอีกครั้ง',
    crashReload: 'โหลดใหม่',
    crashClose: 'ปิด',
    crashLater: 'ไว้ทีหลัง',
    errFolderRootUnusable: 'ไม่สามารถอ่านโฟลเดอร์ที่เลือกได้',
    menuFile: 'ไฟล์',
    menuSectionNew: 'สร้างใหม่',
    menuOpenInNewWindow: 'เปิดในหน้าต่างใหม่',
    menuSplitRight: 'แบ่งด้านขวา',
    menuSplitDown: 'แบ่งด้านล่าง',
    menuUnsplit: 'ยกเลิกการแบ่ง',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'สเปรดชีตไม่มีชื่อ',
    untitledDoc: 'เอกสารไม่มีชื่อ',
    untitledDeck: 'งานนำเสนอไม่มีชื่อ',
    untitledMarkdown: 'Markdown ไม่มีชื่อ',
    untitledHtml: 'HTML ไม่มีชื่อ',
    untitledMindmap: 'แผนที่ความคิดไม่มีชื่อ',
    untitledHwp: 'HWP ไม่มีชื่อ',
    untitledPdf: 'PDF ไม่มีชื่อ',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'แผนที่ความคิด',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'ส่งออกเป็น PDF…',
    menuExportImages: 'ส่งออกเป็นรูปภาพ…',
    menuExportHtml: 'ส่งออกเป็น HTML ไฟล์เดียว…',
    menuExportMapImage: 'ส่งออกเป็นรูปภาพ (PNG)…',
    menuExportMapOutline: 'ส่งออกเป็นโครงร่าง Markdown…',
    menuMakeFromDocument: 'สร้างเอกสารอื่นจากเอกสารนี้',
    menuDocumentSources: 'ดูแหล่งข้อมูล',
    menuDerivedDocuments: 'เอกสารที่สร้างจากเอกสารนี้',
    menuOpenInDocs: 'แปลงและเปิดใน Docs',
    menuPrint: 'พิมพ์…',
    menuOpen: 'เปิด…',
    menuSave: 'บันทึก',
    menuSaveAs: 'บันทึกเป็น…',
    menuClose: 'ปิด',
    menuEdit: 'แก้ไข',
    menuWindow: 'หน้าต่าง',
    menuHome: 'หน้าแรก',
    backToHome: 'กลับไปหน้าแรก',
    dlgOpenTitle: 'เปิดไฟล์',
    filterSupported: 'ไฟล์ที่รองรับ',
    filterWord: 'เอกสาร Word',
    filterOdt: 'ข้อความ OpenDocument',
    filterExcel: 'เวิร์กบุ๊ก Excel',
    filterPpt: 'งานนำเสนอ PowerPoint',
    filterMarkdown: 'ไฟล์ข้อความ (Markdown, TXT, JSON)',
    filterHtml: 'เอกสาร HTML',
    filterMindmap: 'แผนที่ความคิด (ไฟล์ XMind)',
    filterHwp: 'เอกสาร HWP (HWP, HWPX)',
    filterPdf: 'เอกสาร PDF',
    errBadArgs: 'อาร์กิวเมนต์ไม่ถูกต้อง',
    errBadName: 'ชื่อไฟล์ไม่ถูกต้อง',
    errBadExtension: 'ไม่รองรับส่วนขยายนี้ ไฟล์จะเปิดไม่ได้',
    errMissing: 'ไม่พบไฟล์',
    errExists: 'มีไฟล์ชื่อเดียวกันอยู่แล้ว',
    errRenameFailed: 'เปลี่ยนชื่อไม่สำเร็จ',
    errPdfSaveAsFailed: 'บันทึกสำเนา PDF ไม่สำเร็จ',
    errNewTabFailed: 'สร้างเอกสารใหม่ไม่สำเร็จ',
    errDuplicateFailed: 'ไม่สามารถทำสำเนาไฟล์ได้',
    errUnsupportedExt: 'ไม่รองรับไฟล์ .{ext}',
    copySuffix: 'สำเนา',
    menuHelp: 'วิธีใช้',
    menuUserGuide: 'คู่มือผู้ใช้',
    thirdPartyNotices: 'ประกาศเกี่ยวกับซอฟต์แวร์ของบุคคลที่สาม',
    menuExportDocx: 'ส่งออกเป็น Word…',
    menuExportOdt: 'ส่งออกเป็น ODT…',
    btnCancel: 'ยกเลิก',
    pdfDocxFailedMsg: 'ส่งออกเป็น Word ไม่สำเร็จ',
    pdfDocxBusyMsg: 'กำลังส่งออกเป็น Word อยู่ โปรดรอให้เสร็จสิ้นก่อน',
    menuExportPptx: 'ส่งออกเป็น PowerPoint…',
    pdfPptxFailedMsg: 'การส่งออกเป็น PowerPoint ล้มเหลว',
    pdfPptxBusyMsg: 'กำลังแปลงอยู่ โปรดรอให้การส่งออกปัจจุบันเสร็จสิ้น',
    pdfPptxLocalScannedDetail: 'แต่ละหน้าถูกส่งออกเป็นรูปภาพ ข้อความในสไลด์จึงแก้ไขไม่ได้',
    menuExportXlsx: 'ส่งออกเป็น Excel…',
    menuExportMd: 'ส่งออกเป็น Markdown…',
    menuExportEpub: 'ส่งออกเป็น EPUB…',
    pdfXlsxFailedMsg: 'การส่งออกเป็น Excel ล้มเหลว',
    pdfXlsxBusyMsg: 'กำลังแปลงอยู่ โปรดรอให้การส่งออกปัจจุบันเสร็จสิ้น',
    pdfXlsxLocalScannedDetail:
      'หน้าที่สแกนไม่สามารถแปลงเป็นเซลล์ได้ เวิร์กชีตของแต่ละหน้าจึงมีแถวแจ้งเตือนแทน',
    pdfXlsxLocalSkippedMsg: 'บางหน้าไม่ได้ถูกแปลงเป็นเซลล์',
    pdfXlsxLocalSkippedDetail:
      'หน้า {pages} ไม่สามารถแปลงเป็นเซลล์ได้ เวิร์กชีตของหน้าดังกล่าวมีแถวแจ้งเตือนแทน',
    pdfDocxLocalScannedMsg: 'ตรวจพบเอกสารสแกน',
    pdfDocxLocalScannedDetail:
      'ส่งออกแต่ละหน้าเป็นรูปภาพเพื่อคงรูปลักษณ์เดิม ไม่สามารถจดจำข้อความที่แก้ไขได้',
    pdfDocxLocalDegradedMsg: 'บางหน้าถูกส่งออกเป็นรูปภาพ',
    pdfDocxLocalDegradedDetail:
      'หน้า {pages} ไม่สามารถสร้างเลย์เอาต์ใหม่ได้อย่างน่าเชื่อถือ จึงส่งออกเป็นรูปภาพทั้งหน้า',
    pdfDocxLocalOcrMsg: 'แปลงหน้าสแกนเป็นข้อความที่แก้ไขได้แล้ว',
    pdfDocxLocalOcrDetail:
      'หน้า {pages} เป็นภาพสแกน ระบบกู้คืนข้อความด้วย OCR ในเครื่องแล้ว โปรดตรวจทานผลลัพธ์',
    pdfDocxLocalEncryptedDetail: 'PDF นี้ถูกเข้ารหัสและไม่สามารถเปิดได้โดยไม่มีรหัสผ่านที่ถูกต้อง',
    pdfDocxLocalUnsupportedEncDetail:
      'PDF นี้ใช้การเข้ารหัสแบบใบรับรองหรือการเข้ารหัสที่ไม่รองรับ จึงไม่สามารถแปลงได้',
    pdfPwdTitle: 'ป้อนรหัสผ่าน',
    pdfPwdPrompt: 'PDF นี้ถูกเข้ารหัส โปรดป้อนรหัสผ่านเพื่อเปิด:',
    docPwdPrompt: 'ไฟล์นี้ป้องกันด้วยรหัสผ่าน ป้อนรหัสผ่านเพื่อเปิด:',
    pdfPwdRetryPrompt: 'รหัสผ่านไม่ถูกต้อง โปรดลองอีกครั้ง',
    pdfPwdOk: 'ตกลง',
    pdfPwdVerifying: 'กำลังตรวจสอบรหัสผ่าน…',
    pdfPwdLabel: 'รหัสผ่าน',
    pdfPwdPlaceholder: 'ป้อนรหัสผ่านเพื่อเปิด',
    pdfPwdShow: 'แสดงรหัสผ่าน',
    pdfPwdHide: 'ซ่อนรหัสผ่าน',
    pdfDocxLocalCorruptDetail: 'ไฟล์เสียหายหรือไม่ใช่ PDF ที่ถูกต้อง จึงไม่สามารถแปลงได้',
    dlgPickSaveDir: 'เลือกตำแหน่งบันทึกเริ่มต้น',
    errSaveDirUnusable: 'โฟลเดอร์ที่เลือกไม่สามารถเขียนได้ จึงใช้เป็นตำแหน่งบันทึกเริ่มต้นไม่ได้',
  },
  id: {
    dlgAddFolderRoot: 'Tambahkan Folder ke Beranda',
    watchdogTitle: 'Dokumen menggunakan terlalu banyak sumber daya',
    watchdogBody:
      '"{title}" telah menggunakan banyak memori atau CPU selama beberapa menit ({memory} MB, CPU {cpu}%). Anda dapat terus menunggu atau menutup dokumen ini (perubahan yang belum disimpan akan ditanyakan lebih dulu). Diagnostik telah dicatat.',
    watchdogWait: 'Terus Menunggu',
    watchdogClose: 'Tutup Dokumen',
    crashTitle: 'Dokumen berhenti secara tak terduga',
    crashBody:
      '"{title}" berhenti secara tak terduga. Perubahan sejak terakhir disimpan mungkin hilang.',
    crashReopen: 'Buka Lagi',
    crashReload: 'Muat Ulang',
    crashClose: 'Tutup',
    crashLater: 'Nanti',
    errFolderRootUnusable: 'Folder yang dipilih tidak dapat dibaca',
    menuFile: 'File',
    menuSectionNew: 'Baru',
    menuOpenInNewWindow: 'Buka di Jendela Baru',
    menuSplitRight: 'Pisahkan ke Kanan',
    menuSplitDown: 'Pisahkan ke Bawah',
    menuUnsplit: 'Batalkan Pemisahan',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'Spreadsheet tanpa judul',
    untitledDoc: 'Dokumen tanpa judul',
    untitledDeck: 'Presentasi tanpa judul',
    untitledMarkdown: 'Markdown tanpa judul',
    untitledHtml: 'HTML tanpa judul',
    untitledMindmap: 'Peta pikiran tanpa judul',
    untitledHwp: 'HWP tanpa judul',
    untitledPdf: 'PDF tanpa judul',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'Peta pikiran',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'Ekspor sebagai PDF…',
    menuExportImages: 'Ekspor sebagai gambar…',
    menuExportHtml: 'Ekspor sebagai HTML satu file…',
    menuExportMapImage: 'Ekspor sebagai gambar (PNG)…',
    menuExportMapOutline: 'Ekspor sebagai kerangka Markdown…',
    menuMakeFromDocument: 'Buat dokumen lain dari dokumen ini',
    menuDocumentSources: 'Lihat sumber',
    menuDerivedDocuments: 'Dokumen yang dibuat dari dokumen ini',
    menuOpenInDocs: 'Konversi dan buka di Docs',
    menuPrint: 'Cetak…',
    menuOpen: 'Buka…',
    menuSave: 'Simpan',
    menuSaveAs: 'Simpan Sebagai…',
    menuClose: 'Tutup',
    menuEdit: 'Edit',
    menuWindow: 'Jendela',
    menuHome: 'Beranda',
    backToHome: 'Kembali ke Beranda',
    dlgOpenTitle: 'Buka File',
    filterSupported: 'File yang Didukung',
    filterWord: 'Dokumen Word',
    filterOdt: 'Teks OpenDocument',
    filterExcel: 'Buku Kerja Excel',
    filterPpt: 'Presentasi PowerPoint',
    filterMarkdown: 'File teks (Markdown, TXT, JSON)',
    filterHtml: 'Dokumen HTML',
    filterMindmap: 'Peta pikiran (file XMind)',
    filterHwp: 'Dokumen HWP (HWP, HWPX)',
    filterPdf: 'Dokumen PDF',
    errBadArgs: 'Argumen tidak valid',
    errBadName: 'Nama file tidak valid',
    errBadExtension: 'Ekstensi itu tidak didukung dan berkas tidak akan bisa dibuka',
    errMissing: 'File tidak ditemukan',
    errExists: 'File dengan nama tersebut sudah ada',
    errRenameFailed: 'Gagal mengganti nama',
    errPdfSaveAsFailed: 'Gagal menyimpan salinan PDF',
    errNewTabFailed: 'Gagal membuat dokumen baru',
    errDuplicateFailed: 'Tidak dapat menduplikasi berkas',
    errUnsupportedExt: 'file .{ext} tidak didukung',
    copySuffix: 'salinan',
    menuHelp: 'Bantuan',
    menuUserGuide: 'Panduan Pengguna',
    thirdPartyNotices: 'Pemberitahuan Perangkat Lunak Pihak Ketiga',
    menuExportDocx: 'Ekspor sebagai Word…',
    menuExportOdt: 'Ekspor sebagai ODT…',
    btnCancel: 'Batal',
    pdfDocxFailedMsg: 'Gagal mengekspor sebagai Word',
    pdfDocxBusyMsg: 'Ekspor ke Word sedang berlangsung. Harap tunggu hingga selesai.',
    menuExportPptx: 'Ekspor sebagai PowerPoint…',
    pdfPptxFailedMsg: 'Gagal mengekspor sebagai PowerPoint',
    pdfPptxBusyMsg: 'Ekspor sedang berlangsung. Harap tunggu hingga selesai.',
    pdfPptxLocalScannedDetail:
      'Setiap halaman diekspor sebagai gambar; teks pada slide tidak dapat diedit.',
    menuExportXlsx: 'Ekspor sebagai Excel…',
    menuExportMd: 'Ekspor sebagai Markdown…',
    menuExportEpub: 'Ekspor sebagai EPUB…',
    pdfXlsxFailedMsg: 'Gagal mengekspor sebagai Excel',
    pdfXlsxBusyMsg: 'Ekspor sedang berlangsung. Harap tunggu hingga selesai.',
    pdfXlsxLocalScannedDetail:
      'Halaman hasil pindaian tidak dapat diubah menjadi sel; lembar kerja setiap halaman berisi baris pemberitahuan.',
    pdfXlsxLocalSkippedMsg: 'Beberapa halaman tidak diubah menjadi sel',
    pdfXlsxLocalSkippedDetail:
      'Halaman {pages} tidak dapat diubah menjadi sel; lembar kerjanya berisi baris pemberitahuan.',
    pdfDocxLocalScannedMsg: 'Dokumen hasil pindaian terdeteksi',
    pdfDocxLocalScannedDetail:
      'Halaman diekspor sebagai gambar untuk mempertahankan tampilannya. Tidak ada teks yang dapat diedit yang berhasil dikenali.',
    pdfDocxLocalDegradedMsg: 'Beberapa halaman diekspor sebagai gambar',
    pdfDocxLocalDegradedDetail:
      'Halaman {pages} tidak dapat direkonstruksi dengan andal dan diekspor sebagai gambar satu halaman penuh.',
    pdfDocxLocalOcrMsg: 'Halaman pindaian diubah menjadi teks yang dapat diedit',
    pdfDocxLocalOcrDetail:
      'Halaman {pages} adalah hasil pindaian; teksnya dipulihkan dengan OCR lokal. Harap periksa hasilnya.',
    pdfDocxLocalEncryptedDetail:
      'PDF ini terenkripsi dan tidak dapat dibuka tanpa kata sandi yang benar.',
    pdfDocxLocalUnsupportedEncDetail:
      'PDF ini menggunakan enkripsi berbasis sertifikat atau enkripsi yang tidak didukung dan tidak dapat dikonversi.',
    pdfPwdTitle: 'Masukkan Kata Sandi',
    pdfPwdPrompt: 'PDF ini terenkripsi. Masukkan kata sandi untuk membukanya:',
    docPwdPrompt: 'File ini dilindungi kata sandi. Masukkan kata sandi untuk membukanya:',
    pdfPwdRetryPrompt: 'Kata sandi salah. Silakan coba lagi.',
    pdfPwdOk: 'OK',
    pdfPwdVerifying: 'Memverifikasi kata sandi…',
    pdfPwdLabel: 'Kata sandi',
    pdfPwdPlaceholder: 'Masukkan kata sandi buka',
    pdfPwdShow: 'Tampilkan kata sandi',
    pdfPwdHide: 'Sembunyikan kata sandi',
    pdfDocxLocalCorruptDetail:
      'File rusak atau bukan PDF yang valid sehingga tidak dapat dikonversi.',
    dlgPickSaveDir: 'Pilih Lokasi Penyimpanan Default',
    errSaveDirUnusable:
      'Folder yang dipilih tidak dapat ditulis dan tidak bisa digunakan sebagai lokasi penyimpanan default',
  },
  ru: {
    dlgAddFolderRoot: 'Добавить папку на главную',
    watchdogTitle: 'Документ потребляет слишком много ресурсов',
    watchdogBody:
      '«{title}» уже несколько минут использует много памяти или процессора ({memory} МБ, {cpu}% CPU). Можно подождать ещё или закрыть документ (при несохранённых изменениях сначала будет предложено сохранить). Диагностика записана.',
    watchdogWait: 'Подождать',
    watchdogClose: 'Закрыть документ',
    crashTitle: 'Документ неожиданно остановился',
    crashBody:
      '«{title}» неожиданно остановился. Изменения после последнего сохранения могли быть потеряны.',
    crashReopen: 'Открыть снова',
    crashReload: 'Перезагрузить',
    crashClose: 'Закрыть',
    crashLater: 'Не сейчас',
    errFolderRootUnusable: 'Не удалось прочитать выбранную папку',
    menuFile: 'Файл',
    menuSectionNew: 'Создать',
    menuOpenInNewWindow: 'Открыть в новом окне',
    menuSplitRight: 'Разделить вправо',
    menuSplitDown: 'Разделить вниз',
    menuUnsplit: 'Отменить разделение',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'Таблица без названия',
    untitledDoc: 'Документ без названия',
    untitledDeck: 'Презентация без названия',
    untitledMarkdown: 'Markdown без названия',
    untitledHtml: 'HTML без названия',
    untitledMindmap: 'Интеллект-карта без названия',
    untitledHwp: 'HWP без названия',
    untitledPdf: 'PDF без названия',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'Интеллект-карта',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'Экспортировать в PDF…',
    menuExportImages: 'Экспорт в изображения…',
    menuExportHtml: 'Экспортировать в один файл HTML…',
    menuExportMapImage: 'Экспорт в изображение (PNG)…',
    menuExportMapOutline: 'Экспорт в структуру Markdown…',
    menuMakeFromDocument: 'Создать другой документ из этого',
    menuDocumentSources: 'Показать источники',
    menuDerivedDocuments: 'Документы, созданные из этого',
    menuOpenInDocs: 'Преобразовать и открыть в Docs',
    menuPrint: 'Печать…',
    menuOpen: 'Открыть…',
    menuSave: 'Сохранить',
    menuSaveAs: 'Сохранить как…',
    menuClose: 'Закрыть',
    menuEdit: 'Правка',
    menuWindow: 'Окно',
    menuHome: 'Главная',
    backToHome: 'Вернуться на главную',
    dlgOpenTitle: 'Открытие файла',
    filterSupported: 'Поддерживаемые файлы',
    filterWord: 'Документы Word',
    filterOdt: 'Текст OpenDocument',
    filterExcel: 'Книги Excel',
    filterPpt: 'Презентации PowerPoint',
    filterMarkdown: 'Текстовые файлы (Markdown, TXT, JSON)',
    filterHtml: 'Документы HTML',
    filterMindmap: 'Интеллект-карты (файлы XMind)',
    filterHwp: 'Документы HWP (HWP, HWPX)',
    filterPdf: 'Документы PDF',
    errBadArgs: 'Недопустимые аргументы',
    errBadName: 'Недопустимое имя файла',
    errBadExtension: 'Это расширение не поддерживается, и файл больше не откроется',
    errMissing: 'Файл не найден',
    errExists: 'Файл с таким именем уже существует',
    errRenameFailed: 'Не удалось переименовать',
    errPdfSaveAsFailed: 'Не удалось сохранить копию PDF',
    errNewTabFailed: 'Не удалось создать новый документ',
    errDuplicateFailed: 'Не удалось создать копию файла',
    errUnsupportedExt: 'файлы .{ext} не поддерживаются',
    copySuffix: 'копия',
    menuHelp: 'Справка',
    menuUserGuide: 'Руководство пользователя',
    thirdPartyNotices: 'Уведомления о стороннем ПО',
    menuExportDocx: 'Экспортировать в Word…',
    menuExportOdt: 'Экспортировать в ODT…',
    btnCancel: 'Отмена',
    pdfDocxFailedMsg: 'Не удалось экспортировать в Word',
    pdfDocxBusyMsg: 'Экспорт в Word уже выполняется. Дождитесь его завершения.',
    menuExportPptx: 'Экспортировать в PowerPoint…',
    pdfPptxFailedMsg: 'Не удалось экспортировать в PowerPoint',
    pdfPptxBusyMsg: 'Экспорт уже выполняется. Дождитесь его завершения.',
    pdfPptxLocalScannedDetail:
      'Каждая страница экспортирована как изображение; текст на слайдах нельзя редактировать.',
    menuExportXlsx: 'Экспортировать в Excel…',
    menuExportMd: 'Экспортировать в Markdown…',
    menuExportEpub: 'Экспортировать в EPUB…',
    pdfXlsxFailedMsg: 'Не удалось экспортировать в Excel',
    pdfXlsxBusyMsg: 'Экспорт уже выполняется. Дождитесь его завершения.',
    pdfXlsxLocalScannedDetail:
      'Отсканированные страницы нельзя преобразовать в ячейки; на листе каждой страницы добавлена строка с уведомлением.',
    pdfXlsxLocalSkippedMsg: 'Некоторые страницы не были преобразованы в ячейки',
    pdfXlsxLocalSkippedDetail:
      'Страницы {pages} не удалось преобразовать в ячейки; на их листах добавлена строка с уведомлением.',
    pdfDocxLocalScannedMsg: 'Обнаружен отсканированный документ',
    pdfDocxLocalScannedDetail:
      'Страницы экспортированы как изображения, чтобы сохранить их вид. Редактируемый текст распознать не удалось.',
    pdfDocxLocalDegradedMsg: 'Некоторые страницы экспортированы как изображения',
    pdfDocxLocalDegradedDetail:
      'Страницы {pages} не удалось надёжно реконструировать; они экспортированы как полностраничные изображения.',
    pdfDocxLocalOcrMsg: 'Отсканированные страницы преобразованы в редактируемый текст',
    pdfDocxLocalOcrDetail:
      'Страницы {pages} были сканами; текст восстановлен локальным OCR. Проверьте результат.',
    pdfDocxLocalEncryptedDetail:
      'Этот PDF зашифрован, и его не удалось открыть без правильного пароля.',
    pdfDocxLocalUnsupportedEncDetail:
      'Этот PDF использует шифрование на основе сертификата или другое неподдерживаемое шифрование и не может быть преобразован.',
    pdfPwdTitle: 'Введите пароль',
    pdfPwdPrompt: 'Этот PDF зашифрован. Введите пароль, чтобы открыть его:',
    docPwdPrompt: 'Файл защищён паролем. Введите пароль, чтобы открыть его:',
    pdfPwdRetryPrompt: 'Неверный пароль. Попробуйте ещё раз.',
    pdfPwdOk: 'ОК',
    pdfPwdVerifying: 'Проверка пароля…',
    pdfPwdLabel: 'Пароль',
    pdfPwdPlaceholder: 'Введите пароль для открытия',
    pdfPwdShow: 'Показать пароль',
    pdfPwdHide: 'Скрыть пароль',
    pdfDocxLocalCorruptDetail:
      'Файл повреждён или не является корректным PDF, преобразование невозможно.',
    dlgPickSaveDir: 'Выбрать папку сохранения по умолчанию',
    errSaveDirUnusable:
      'Выбранная папка недоступна для записи и не может использоваться как папка сохранения по умолчанию',
  },
  ar: {
    dlgAddFolderRoot: 'إضافة مجلد إلى الصفحة الرئيسية',
    watchdogTitle: 'المستند يستهلك موارد كثيرة جدًا',
    watchdogBody:
      'يستهلك "{title}" قدرًا كبيرًا من الذاكرة أو المعالج منذ عدة دقائق (الذاكرة {memory} م.ب، المعالج {cpu}%). يمكنك مواصلة الانتظار أو إغلاق هذا المستند (سيُطلب حفظ التغييرات غير المحفوظة أولًا). تم تسجيل بيانات التشخيص.',
    watchdogWait: 'مواصلة الانتظار',
    watchdogClose: 'إغلاق المستند',
    crashTitle: 'توقف مستند بشكل غير متوقع',
    crashBody: 'توقف "{title}" بشكل غير متوقع. ربما فُقدت التغييرات التي أُجريت منذ آخر حفظ.',
    crashReopen: 'إعادة الفتح',
    crashReload: 'إعادة التحميل',
    crashClose: 'إغلاق',
    crashLater: 'ليس الآن',
    errFolderRootUnusable: 'لا يمكن قراءة المجلد المحدد',
    menuFile: 'ملف',
    menuSectionNew: 'جديد',
    menuOpenInNewWindow: 'فتح في نافذة جديدة',
    menuSplitRight: 'تقسيم إلى اليمين',
    menuSplitDown: 'تقسيم إلى الأسفل',
    menuUnsplit: 'إلغاء التقسيم',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'جدول بيانات بلا عنوان',
    untitledDoc: 'مستند بدون عنوان',
    untitledDeck: 'عرض تقديمي بدون عنوان',
    untitledMarkdown: 'Markdown بدون عنوان',
    untitledHtml: 'HTML بدون عنوان',
    untitledMindmap: 'خريطة ذهنية بدون عنوان',
    untitledHwp: 'HWP بدون عنوان',
    untitledPdf: 'PDF بدون عنوان',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'خريطة ذهنية',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'تصدير بتنسيق PDF…',
    menuExportImages: 'تصدير كصور…',
    menuExportHtml: 'تصدير كملف HTML واحد…',
    menuExportMapImage: 'تصدير كصورة (PNG)…',
    menuExportMapOutline: 'تصدير كمخطط Markdown…',
    menuMakeFromDocument: 'إنشاء مستند آخر من هذا المستند',
    menuDocumentSources: 'عرض المصادر',
    menuDerivedDocuments: 'المستندات المُنشأة من هذا المستند',
    menuOpenInDocs: 'التحويل والفتح في Docs',
    menuPrint: 'طباعة…',
    menuOpen: 'فتح…',
    menuSave: 'حفظ',
    menuSaveAs: 'حفظ باسم…',
    menuClose: 'إغلاق',
    menuEdit: 'تحرير',
    menuWindow: 'نافذة',
    menuHome: 'الصفحة الرئيسية',
    backToHome: 'العودة إلى الصفحة الرئيسية',
    dlgOpenTitle: 'فتح ملف',
    filterSupported: 'الملفات المدعومة',
    filterWord: 'مستندات Word',
    filterOdt: 'نص OpenDocument',
    filterExcel: 'مصنفات Excel',
    filterPpt: 'عروض PowerPoint التقديمية',
    filterMarkdown: 'ملفات نصية (Markdown, TXT, JSON)',
    filterHtml: 'مستندات HTML',
    filterMindmap: 'خرائط ذهنية (ملفات XMind)',
    filterHwp: 'مستندات HWP (HWP, HWPX)',
    filterPdf: 'مستندات PDF',
    errBadArgs: 'وسيطات غير صالحة',
    errBadName: 'اسم ملف غير صالح',
    errBadExtension: 'هذه الامتداد غير مدعوم وسيصبح الملف غير قابل للفتح',
    errMissing: 'الملف غير موجود',
    errExists: 'يوجد ملف بالاسم نفسه بالفعل',
    errRenameFailed: 'فشلت إعادة التسمية',
    errPdfSaveAsFailed: 'تعذّر حفظ نسخة PDF',
    errNewTabFailed: 'تعذّر إنشاء المستند الجديد',
    errDuplicateFailed: 'تعذر تكرار الملف',
    errUnsupportedExt: 'ملفات .{ext} غير مدعومة',
    copySuffix: 'نسخة',
    menuHelp: 'تعليمات',
    menuUserGuide: 'دليل المستخدم',
    thirdPartyNotices: 'إشعارات برامج الجهات الخارجية',
    menuExportDocx: 'تصدير كملف Word…',
    menuExportOdt: 'تصدير كملف ODT…',
    btnCancel: 'إلغاء',
    pdfDocxFailedMsg: 'فشل التصدير كملف Word',
    pdfDocxBusyMsg: 'يجري حاليًا تصدير إلى Word. يُرجى الانتظار حتى يكتمل.',
    menuExportPptx: 'تصدير كملف PowerPoint…',
    pdfPptxFailedMsg: 'فشل التصدير كملف PowerPoint',
    pdfPptxBusyMsg: 'هناك عملية تصدير قيد التنفيذ. يرجى الانتظار حتى تكتمل.',
    pdfPptxLocalScannedDetail: 'تم تصدير كل صفحة كصورة؛ النص في الشرائح غير قابل للتحرير.',
    menuExportXlsx: 'تصدير كملف Excel…',
    menuExportMd: 'تصدير كملف Markdown…',
    menuExportEpub: 'تصدير كملف EPUB…',
    pdfXlsxFailedMsg: 'فشل التصدير كملف Excel',
    pdfXlsxBusyMsg: 'هناك عملية تصدير قيد التنفيذ. يرجى الانتظار حتى تكتمل.',
    pdfXlsxLocalScannedDetail:
      'لا يمكن تحويل الصفحات الممسوحة ضوئيًا إلى خلايا؛ تحتوي ورقة كل صفحة على صف تنبيه بدلاً من ذلك.',
    pdfXlsxLocalSkippedMsg: 'لم يتم تحويل بعض الصفحات إلى خلايا',
    pdfXlsxLocalSkippedDetail:
      'تعذر تحويل الصفحات {pages} إلى خلايا؛ تحتوي أوراقها على صف تنبيه بدلاً من ذلك.',
    pdfDocxLocalScannedMsg: 'تم اكتشاف مستند ممسوح ضوئيًا',
    pdfDocxLocalScannedDetail:
      'تم تصدير الصفحات كصور للحفاظ على مظهرها. لم يتم التعرف على أي نص قابل للتحرير.',
    pdfDocxLocalDegradedMsg: 'تم تصدير بعض الصفحات كصور',
    pdfDocxLocalDegradedDetail:
      'تعذّرت إعادة بناء الصفحات {pages} بشكل موثوق، وتم تصديرها كصور لكامل الصفحة.',
    pdfDocxLocalOcrMsg: 'تم تحويل الصفحات الممسوحة ضوئيًا إلى نص قابل للتحرير',
    pdfDocxLocalOcrDetail:
      'الصفحات {pages} كانت صورًا ممسوحة؛ تم استرداد النص عبر OCR المحلي. يُرجى مراجعة النتيجة.',
    pdfDocxLocalEncryptedDetail: 'هذا الملف PDF مشفّر وتعذّر فتحه دون كلمة المرور الصحيحة.',
    pdfDocxLocalUnsupportedEncDetail:
      'يستخدم ملف PDF هذا تشفيرًا قائمًا على الشهادات أو تشفيرًا غير مدعوم ولا يمكن تحويله.',
    pdfPwdTitle: 'إدخال كلمة المرور',
    pdfPwdPrompt: 'هذا الملف PDF مشفّر. أدخل كلمة المرور لفتحه:',
    docPwdPrompt: 'هذا الملف محمي بكلمة مرور. أدخل كلمة المرور لفتحه:',
    pdfPwdRetryPrompt: 'كلمة المرور غير صحيحة. حاول مرة أخرى.',
    pdfPwdOk: 'موافق',
    pdfPwdVerifying: 'جارٍ التحقق من كلمة المرور…',
    pdfPwdLabel: 'كلمة المرور',
    pdfPwdPlaceholder: 'أدخل كلمة مرور الفتح',
    pdfPwdShow: 'إظهار كلمة المرور',
    pdfPwdHide: 'إخفاء كلمة المرور',
    pdfDocxLocalCorruptDetail: 'الملف تالف أو ليس ملف PDF صالحًا ولا يمكن تحويله.',
    dlgPickSaveDir: 'اختيار موقع الحفظ الافتراضي',
    errSaveDirUnusable: 'المجلد المحدد غير قابل للكتابة ولا يمكن استخدامه كموقع حفظ افتراضي',
  },
  pt: {
    dlgAddFolderRoot: 'Adicionar pasta à página inicial',
    watchdogTitle: 'O documento está a consumir demasiados recursos',
    watchdogBody:
      '"{title}" está a usar muita memória ou CPU há vários minutos ({memory} MB, {cpu}% de CPU). Pode continuar a aguardar ou fechar o documento (será pedido para guardar alterações não guardadas primeiro). O diagnóstico foi registado.',
    watchdogWait: 'Continuar a aguardar',
    watchdogClose: 'Fechar documento',
    crashTitle: 'Um documento parou inesperadamente',
    crashBody:
      '"{title}" parou inesperadamente. As alterações feitas desde a última gravação podem ter-se perdido.',
    crashReopen: 'Reabrir',
    crashReload: 'Recarregar',
    crashClose: 'Fechar',
    crashLater: 'Agora não',
    errFolderRootUnusable: 'Não é possível ler a pasta selecionada',
    menuFile: 'Arquivo',
    menuSectionNew: 'Novo',
    menuOpenInNewWindow: 'Abrir em nova janela',
    menuSplitRight: 'Dividir à direita',
    menuSplitDown: 'Dividir abaixo',
    menuUnsplit: 'Remover divisão',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'Planilha sem título',
    untitledDoc: 'Documento sem título',
    untitledDeck: 'Apresentação sem título',
    untitledMarkdown: 'Markdown sem título',
    untitledHtml: 'HTML sem título',
    untitledMindmap: 'Mapa mental sem título',
    untitledHwp: 'HWP sem título',
    untitledPdf: 'PDF sem título',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'Mapa mental',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'Exportar como PDF…',
    menuExportImages: 'Exportar como imagens…',
    menuExportHtml: 'Exportar como HTML de arquivo único…',
    menuExportMapImage: 'Exportar como imagem (PNG)…',
    menuExportMapOutline: 'Exportar como estrutura de tópicos Markdown…',
    menuMakeFromDocument: 'Criar outro documento a partir deste',
    menuDocumentSources: 'Ver fontes',
    menuDerivedDocuments: 'Documentos criados a partir deste',
    menuOpenInDocs: 'Converter e abrir no Docs',
    menuPrint: 'Imprimir…',
    menuOpen: 'Abrir…',
    menuSave: 'Salvar',
    menuSaveAs: 'Salvar Como…',
    menuClose: 'Fechar',
    menuEdit: 'Editar',
    menuWindow: 'Janela',
    menuHome: 'Início',
    backToHome: 'Voltar ao início',
    dlgOpenTitle: 'Abrir arquivo',
    filterSupported: 'Arquivos compatíveis',
    filterWord: 'Documentos do Word',
    filterOdt: 'Texto OpenDocument',
    filterExcel: 'Pastas de trabalho do Excel',
    filterPpt: 'Apresentações do PowerPoint',
    filterMarkdown: 'Arquivos de texto (Markdown, TXT, JSON)',
    filterHtml: 'Documentos HTML',
    filterMindmap: 'Mapas mentais (arquivos XMind)',
    filterHwp: 'Documentos HWP (HWP, HWPX)',
    filterPdf: 'Documentos PDF',
    errBadArgs: 'Argumentos inválidos',
    errBadName: 'Nome de arquivo inválido',
    errBadExtension: 'Essa extensão não é suportada e o arquivo deixaria de abrir',
    errMissing: 'Arquivo não encontrado',
    errExists: 'Já existe um arquivo com esse nome',
    errRenameFailed: 'Falha ao renomear',
    errPdfSaveAsFailed: 'Falha ao salvar a cópia do PDF',
    errNewTabFailed: 'Falha ao criar o novo documento',
    errDuplicateFailed: 'Não foi possível duplicar o arquivo',
    errUnsupportedExt: 'arquivos .{ext} não são suportados',
    copySuffix: 'cópia',
    menuHelp: 'Ajuda',
    menuUserGuide: 'Guia do Usuário',
    thirdPartyNotices: 'Avisos de software de terceiros',
    menuExportDocx: 'Exportar como Word…',
    menuExportOdt: 'Exportar como ODT…',
    btnCancel: 'Cancelar',
    pdfDocxFailedMsg: 'Falha ao exportar como Word',
    pdfDocxBusyMsg: 'Já há uma exportação para Word em andamento. Aguarde a conclusão.',
    menuExportPptx: 'Exportar como PowerPoint…',
    pdfPptxFailedMsg: 'Falha ao exportar como PowerPoint',
    pdfPptxBusyMsg: 'Já há uma exportação em andamento. Aguarde a conclusão.',
    pdfPptxLocalScannedDetail:
      'Cada página foi exportada como imagem; o texto dos slides não é editável.',
    menuExportXlsx: 'Exportar como Excel…',
    menuExportMd: 'Exportar como Markdown…',
    menuExportEpub: 'Exportar como EPUB…',
    pdfXlsxFailedMsg: 'Falha ao exportar como Excel',
    pdfXlsxBusyMsg: 'Já há uma exportação em andamento. Aguarde a conclusão.',
    pdfXlsxLocalScannedDetail:
      'Páginas digitalizadas não podem ser convertidas em células; a planilha de cada página contém uma linha de aviso.',
    pdfXlsxLocalSkippedMsg: 'Algumas páginas não foram convertidas em células',
    pdfXlsxLocalSkippedDetail:
      'As páginas {pages} não puderam ser convertidas em células; suas planilhas contêm uma linha de aviso.',
    pdfDocxLocalScannedMsg: 'Documento digitalizado detectado',
    pdfDocxLocalScannedDetail:
      'As páginas foram exportadas como imagens para preservar a aparência. Não foi possível reconhecer texto editável.',
    pdfDocxLocalDegradedMsg: 'Algumas páginas foram exportadas como imagens',
    pdfDocxLocalDegradedDetail:
      'As páginas {pages} não puderam ser reconstruídas de forma confiável e foram exportadas como imagens de página inteira.',
    pdfDocxLocalOcrMsg: 'Páginas digitalizadas convertidas em texto editável',
    pdfDocxLocalOcrDetail:
      'As páginas {pages} eram digitalizações; o texto foi recuperado com OCR local. Revise o resultado.',
    pdfDocxLocalEncryptedDetail:
      'Este PDF está criptografado e não pôde ser aberto sem a senha correta.',
    pdfDocxLocalUnsupportedEncDetail:
      'Este PDF usa criptografia baseada em certificado ou outra criptografia sem suporte e não pode ser convertido.',
    pdfPwdTitle: 'Digitar senha',
    pdfPwdPrompt: 'Este PDF está criptografado. Digite a senha para abri-lo:',
    docPwdPrompt: 'Este arquivo está protegido por senha. Digite a senha para abri-lo:',
    pdfPwdRetryPrompt: 'Senha incorreta. Tente novamente.',
    pdfPwdOk: 'OK',
    pdfPwdVerifying: 'Verificando a senha…',
    pdfPwdLabel: 'Senha',
    pdfPwdPlaceholder: 'Digite a senha de abertura',
    pdfPwdShow: 'Mostrar senha',
    pdfPwdHide: 'Ocultar senha',
    pdfDocxLocalCorruptDetail:
      'O arquivo está danificado ou não é um PDF válido e não pode ser convertido.',
    dlgPickSaveDir: 'Escolher local de salvamento padrão',
    errSaveDirUnusable:
      'A pasta selecionada não permite gravação e não pode ser usada como local de salvamento padrão',
  },
  it: {
    dlgAddFolderRoot: 'Aggiungi cartella alla Home',
    watchdogTitle: 'Il documento sta usando troppe risorse',
    watchdogBody:
      '"{title}" sta usando molta memoria o CPU da diversi minuti ({memory} MB, {cpu}% CPU). Puoi continuare ad attendere o chiudere il documento (ti verrà chiesto prima di salvare le modifiche non salvate). La diagnostica è stata registrata.',
    watchdogWait: 'Continua ad attendere',
    watchdogClose: 'Chiudi documento',
    crashTitle: 'Un documento si è interrotto inaspettatamente',
    crashBody:
      '"{title}" si è interrotto inaspettatamente. Le modifiche successive all’ultimo salvataggio potrebbero essere andate perse.',
    crashReopen: 'Riapri',
    crashReload: 'Ricarica',
    crashClose: 'Chiudi',
    crashLater: 'Non ora',
    errFolderRootUnusable: 'Impossibile leggere la cartella selezionata',
    menuFile: 'File',
    menuSectionNew: 'Nuovo',
    menuOpenInNewWindow: 'Apri in una nuova finestra',
    menuSplitRight: 'Dividi a destra',
    menuSplitDown: 'Dividi in basso',
    menuUnsplit: 'Rimuovi divisione',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'Foglio di calcolo senza titolo',
    untitledDoc: 'Documento senza titolo',
    untitledDeck: 'Presentazione senza titolo',
    untitledMarkdown: 'Markdown senza titolo',
    untitledHtml: 'HTML senza titolo',
    untitledMindmap: 'Mappa mentale senza titolo',
    untitledHwp: 'HWP senza titolo',
    untitledPdf: 'PDF senza titolo',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'Mappa mentale',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'Esporta come PDF…',
    menuExportImages: 'Esporta come immagini…',
    menuExportHtml: 'Esporta come HTML a file singolo…',
    menuExportMapImage: 'Esporta come immagine (PNG)…',
    menuExportMapOutline: 'Esporta come struttura Markdown…',
    menuMakeFromDocument: 'Crea un altro documento da questo',
    menuDocumentSources: 'Mostra le fonti',
    menuDerivedDocuments: 'Documenti creati da questo',
    menuOpenInDocs: 'Converti e apri in Docs',
    menuPrint: 'Stampa…',
    menuOpen: 'Apri…',
    menuSave: 'Salva',
    menuSaveAs: 'Salva con nome…',
    menuClose: 'Chiudi',
    menuEdit: 'Modifica',
    menuWindow: 'Finestra',
    menuHome: 'Home',
    backToHome: 'Torna alla Home',
    dlgOpenTitle: 'Apri file',
    filterSupported: 'File supportati',
    filterWord: 'Documenti Word',
    filterOdt: 'Testo OpenDocument',
    filterExcel: 'Cartelle di lavoro Excel',
    filterPpt: 'Presentazioni PowerPoint',
    filterMarkdown: 'File di testo (Markdown, TXT, JSON)',
    filterHtml: 'Documenti HTML',
    filterMindmap: 'Mappe mentali (file XMind)',
    filterHwp: 'Documenti HWP (HWP, HWPX)',
    filterPdf: 'Documenti PDF',
    errBadArgs: 'Argomenti non validi',
    errBadName: 'Nome file non valido',
    errBadExtension: 'Questa estensione non è supportata e il file non si aprirebbe più',
    errMissing: 'File non trovato',
    errExists: 'Esiste già un file con questo nome',
    errRenameFailed: 'Impossibile rinominare',
    errPdfSaveAsFailed: 'Impossibile salvare la copia del PDF',
    errNewTabFailed: 'Impossibile creare il nuovo documento',
    errDuplicateFailed: 'Impossibile duplicare il file',
    errUnsupportedExt: 'i file .{ext} non sono supportati',
    copySuffix: 'copia',
    menuHelp: 'Aiuto',
    menuUserGuide: "Guida dell'utente",
    thirdPartyNotices: 'Note sul software di terze parti',
    menuExportDocx: 'Esporta come Word…',
    menuExportOdt: 'Esporta come ODT…',
    btnCancel: 'Annulla',
    pdfDocxFailedMsg: 'Esportazione in Word non riuscita',
    pdfDocxBusyMsg: "Un'esportazione in Word è già in corso. Attendi il completamento.",
    menuExportPptx: 'Esporta come PowerPoint…',
    pdfPptxFailedMsg: 'Esportazione come PowerPoint non riuscita',
    pdfPptxBusyMsg: "Un'esportazione è già in corso. Attendere che finisca.",
    pdfPptxLocalScannedDetail:
      'Ogni pagina è stata esportata come immagine; il testo delle diapositive non è modificabile.',
    menuExportXlsx: 'Esporta come Excel…',
    menuExportMd: 'Esporta come Markdown…',
    menuExportEpub: 'Esporta come EPUB…',
    pdfXlsxFailedMsg: 'Esportazione come Excel non riuscita',
    pdfXlsxBusyMsg: "Un'esportazione è già in corso. Attendere che finisca.",
    pdfXlsxLocalScannedDetail:
      'Le pagine scansionate non possono essere convertite in celle; il foglio di ogni pagina contiene una riga di avviso.',
    pdfXlsxLocalSkippedMsg: 'Alcune pagine non sono state convertite in celle',
    pdfXlsxLocalSkippedDetail:
      'Le pagine {pages} non hanno potuto essere convertite in celle; i loro fogli contengono una riga di avviso.',
    pdfDocxLocalScannedMsg: 'Rilevato documento scansionato',
    pdfDocxLocalScannedDetail:
      "Le pagine sono state esportate come immagini per preservarne l'aspetto. Non è stato possibile riconoscere testo modificabile.",
    pdfDocxLocalDegradedMsg: 'Alcune pagine sono state esportate come immagini',
    pdfDocxLocalDegradedDetail:
      'Non è stato possibile ricostruire in modo affidabile le pagine {pages}; sono state esportate come immagini a pagina intera.',
    pdfDocxLocalOcrMsg: 'Pagine scansionate convertite in testo modificabile',
    pdfDocxLocalOcrDetail:
      'Le pagine {pages} erano scansioni; il testo è stato recuperato con OCR locale. Si consiglia di rileggere il risultato.',
    pdfDocxLocalEncryptedDetail:
      'Questo PDF è crittografato e non è stato possibile aprirlo senza la password corretta.',
    pdfDocxLocalUnsupportedEncDetail:
      'Questo PDF usa una crittografia basata su certificati o comunque non supportata e non può essere convertito.',
    pdfPwdTitle: 'Inserisci password',
    pdfPwdPrompt: 'Questo PDF è crittografato. Inserisci la password per aprirlo:',
    docPwdPrompt: 'Questo file è protetto da password. Inserisci la password per aprirlo:',
    pdfPwdRetryPrompt: 'Password errata. Riprova.',
    pdfPwdOk: 'OK',
    pdfPwdVerifying: 'Verifica della password…',
    pdfPwdLabel: 'Password',
    pdfPwdPlaceholder: 'Inserisci la password di apertura',
    pdfPwdShow: 'Mostra password',
    pdfPwdHide: 'Nascondi password',
    pdfDocxLocalCorruptDetail:
      'Il file è danneggiato o non è un PDF valido e non può essere convertito.',
    dlgPickSaveDir: 'Scegli la posizione di salvataggio predefinita',
    errSaveDirUnusable:
      'La cartella selezionata non è scrivibile e non può essere usata come posizione di salvataggio predefinita',
  },
  pl: {
    dlgAddFolderRoot: 'Dodaj folder do strony głównej',
    watchdogTitle: 'Dokument zużywa zbyt dużo zasobów',
    watchdogBody:
      '„{title}” od kilku minut zużywa dużo pamięci lub procesora ({memory} MB, {cpu}% CPU). Możesz dalej czekać albo zamknąć dokument (najpierw pojawi się pytanie o zapisanie niezapisanych zmian). Dane diagnostyczne zostały zapisane.',
    watchdogWait: 'Czekaj dalej',
    watchdogClose: 'Zamknij dokument',
    crashTitle: 'Dokument nieoczekiwanie przestał działać',
    crashBody:
      '„{title}” nieoczekiwanie przestał działać. Zmiany wprowadzone od ostatniego zapisu mogły zostać utracone.',
    crashReopen: 'Otwórz ponownie',
    crashReload: 'Wczytaj ponownie',
    crashClose: 'Zamknij',
    crashLater: 'Nie teraz',
    errFolderRootUnusable: 'Nie można odczytać wybranego folderu',
    menuFile: 'Plik',
    menuSectionNew: 'Nowy',
    menuOpenInNewWindow: 'Otwórz w nowym oknie',
    menuSplitRight: 'Podziel w prawo',
    menuSplitDown: 'Podziel w dół',
    menuUnsplit: 'Usuń podział',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'Arkusz bez tytułu',
    untitledDoc: 'Dokument bez tytułu',
    untitledDeck: 'Prezentacja bez tytułu',
    untitledMarkdown: 'Markdown bez tytułu',
    untitledHtml: 'HTML bez tytułu',
    untitledMindmap: 'Mapa myśli bez tytułu',
    untitledHwp: 'HWP bez tytułu',
    untitledPdf: 'PDF bez tytułu',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'Mapa myśli',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'Eksportuj jako PDF…',
    menuExportImages: 'Eksportuj jako obrazy…',
    menuExportHtml: 'Eksportuj jako pojedynczy plik HTML…',
    menuExportMapImage: 'Eksportuj jako obraz (PNG)…',
    menuExportMapOutline: 'Eksportuj jako konspekt Markdown…',
    menuMakeFromDocument: 'Utwórz inny dokument z tego',
    menuDocumentSources: 'Pokaż źródła',
    menuDerivedDocuments: 'Dokumenty utworzone z tego',
    menuOpenInDocs: 'Konwertuj i otwórz w Docs',
    menuPrint: 'Drukuj…',
    menuOpen: 'Otwórz…',
    menuSave: 'Zapisz',
    menuSaveAs: 'Zapisz jako…',
    menuClose: 'Zamknij',
    menuEdit: 'Edycja',
    menuWindow: 'Okno',
    menuHome: 'Strona główna',
    backToHome: 'Wróć do strony głównej',
    dlgOpenTitle: 'Otwieranie pliku',
    filterSupported: 'Obsługiwane pliki',
    filterWord: 'Dokumenty programu Word',
    filterOdt: 'Tekst OpenDocument',
    filterExcel: 'Skoroszyty programu Excel',
    filterPpt: 'Prezentacje programu PowerPoint',
    filterMarkdown: 'Pliki tekstowe (Markdown, TXT, JSON)',
    filterHtml: 'Dokumenty HTML',
    filterMindmap: 'Mapy myśli (pliki XMind)',
    filterHwp: 'Dokumenty HWP (HWP, HWPX)',
    filterPdf: 'Dokumenty PDF',
    errBadArgs: 'Nieprawidłowe argumenty',
    errBadName: 'Nieprawidłowa nazwa pliku',
    errBadExtension: 'To rozszerzenie nie jest obsługiwane i plik przestałby się otwierać',
    errMissing: 'Nie znaleziono pliku',
    errExists: 'Plik o tej nazwie już istnieje',
    errRenameFailed: 'Nie udało się zmienić nazwy',
    errPdfSaveAsFailed: 'Nie udało się zapisać kopii PDF',
    errNewTabFailed: 'Nie udało się utworzyć nowego dokumentu',
    errDuplicateFailed: 'Nie udało się zduplikować pliku',
    errUnsupportedExt: 'pliki .{ext} nie są obsługiwane',
    copySuffix: 'kopia',
    menuHelp: 'Pomoc',
    menuUserGuide: 'Podręcznik użytkownika',
    thirdPartyNotices: 'Informacje o oprogramowaniu innych firm',
    menuExportDocx: 'Eksportuj jako Word…',
    menuExportOdt: 'Eksportuj jako ODT…',
    btnCancel: 'Anuluj',
    pdfDocxFailedMsg: 'Eksport do formatu Word nie powiódł się',
    pdfDocxBusyMsg: 'Eksport do formatu Word już trwa. Poczekaj na jego zakończenie.',
    menuExportPptx: 'Eksportuj jako PowerPoint…',
    pdfPptxFailedMsg: 'Eksport jako PowerPoint nie powiódł się',
    pdfPptxBusyMsg: 'Eksport już trwa. Poczekaj na jego zakończenie.',
    pdfPptxLocalScannedDetail:
      'Każda strona została wyeksportowana jako obraz; tekst na slajdach nie jest edytowalny.',
    menuExportXlsx: 'Eksportuj jako Excel…',
    menuExportMd: 'Eksportuj jako Markdown…',
    menuExportEpub: 'Eksportuj jako EPUB…',
    pdfXlsxFailedMsg: 'Eksport jako Excel nie powiódł się',
    pdfXlsxBusyMsg: 'Eksport już trwa. Poczekaj na jego zakończenie.',
    pdfXlsxLocalScannedDetail:
      'Zeskanowanych stron nie można przekształcić w komórki; arkusz każdej strony zawiera wiersz z informacją.',
    pdfXlsxLocalSkippedMsg: 'Niektóre strony nie zostały przekształcone w komórki',
    pdfXlsxLocalSkippedDetail:
      'Stron {pages} nie udało się przekształcić w komórki; ich arkusze zawierają wiersz z informacją.',
    pdfDocxLocalScannedMsg: 'Wykryto zeskanowany dokument',
    pdfDocxLocalScannedDetail:
      'Strony zostały wyeksportowane jako obrazy, aby zachować ich wygląd. Nie udało się rozpoznać edytowalnego tekstu.',
    pdfDocxLocalDegradedMsg: 'Niektóre strony wyeksportowano jako obrazy',
    pdfDocxLocalDegradedDetail:
      'Stron {pages} nie udało się wiarygodnie odtworzyć; wyeksportowano je jako obrazy całych stron.',
    pdfDocxLocalOcrMsg: 'Zeskanowane strony przekonwertowano na edytowalny tekst',
    pdfDocxLocalOcrDetail:
      'Strony {pages} były skanami; tekst odzyskano lokalnym OCR. Sprawdź wynik.',
    pdfDocxLocalEncryptedDetail:
      'Ten PDF jest zaszyfrowany i nie można go otworzyć bez prawidłowego hasła.',
    pdfDocxLocalUnsupportedEncDetail:
      'Ten PDF używa szyfrowania opartego na certyfikatach lub innego nieobsługiwanego szyfrowania i nie można go przekonwertować.',
    pdfPwdTitle: 'Wprowadź hasło',
    pdfPwdPrompt: 'Ten PDF jest zaszyfrowany. Wprowadź hasło, aby go otworzyć:',
    docPwdPrompt: 'Ten plik jest chroniony hasłem. Wprowadź hasło, aby go otworzyć:',
    pdfPwdRetryPrompt: 'Nieprawidłowe hasło. Spróbuj ponownie.',
    pdfPwdOk: 'OK',
    pdfPwdVerifying: 'Weryfikowanie hasła…',
    pdfPwdLabel: 'Hasło',
    pdfPwdPlaceholder: 'Wprowadź hasło otwarcia',
    pdfPwdShow: 'Pokaż hasło',
    pdfPwdHide: 'Ukryj hasło',
    pdfDocxLocalCorruptDetail:
      'Plik jest uszkodzony lub nie jest prawidłowym plikiem PDF i nie można go przekonwertować.',
    dlgPickSaveDir: 'Wybierz domyślną lokalizację zapisu',
    errSaveDirUnusable:
      'Wybrany folder nie pozwala na zapis i nie może być domyślną lokalizacją zapisu',
  },
  cs: {
    dlgAddFolderRoot: 'Přidat složku na domovskou stránku',
    watchdogTitle: 'Dokument spotřebovává příliš mnoho prostředků',
    watchdogBody:
      '„{title}“ už několik minut využívá hodně paměti nebo procesoru ({memory} MB, {cpu} % CPU). Můžete dál čekat, nebo dokument zavřít (u neuložených změn se nejdřív zeptáme na uložení). Diagnostika byla zaznamenána.',
    watchdogWait: 'Dál čekat',
    watchdogClose: 'Zavřít dokument',
    crashTitle: 'Dokument se neočekávaně zastavil',
    crashBody: '„{title}“ se neočekávaně zastavil. Změny od posledního uložení mohly být ztraceny.',
    crashReopen: 'Znovu otevřít',
    crashReload: 'Znovu načíst',
    crashClose: 'Zavřít',
    crashLater: 'Teď ne',
    errFolderRootUnusable: 'Vybranou složku nelze načíst',
    menuFile: 'Soubor',
    menuSectionNew: 'Nový',
    menuOpenInNewWindow: 'Otevřít v novém okně',
    menuSplitRight: 'Rozdělit vpravo',
    menuSplitDown: 'Rozdělit dole',
    menuUnsplit: 'Zrušit rozdělení',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'Sešit bez názvu',
    untitledDoc: 'Dokument bez názvu',
    untitledDeck: 'Prezentace bez názvu',
    untitledMarkdown: 'Markdown bez názvu',
    untitledHtml: 'HTML bez názvu',
    untitledMindmap: 'Myšlenková mapa bez názvu',
    untitledHwp: 'HWP bez názvu',
    untitledPdf: 'PDF bez názvu',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'Myšlenková mapa',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'Exportovat jako PDF…',
    menuExportImages: 'Exportovat jako obrázky…',
    menuExportHtml: 'Exportovat jako samostatné HTML…',
    menuExportMapImage: 'Exportovat jako obrázek (PNG)…',
    menuExportMapOutline: 'Exportovat jako osnovu Markdown…',
    menuMakeFromDocument: 'Vytvořit jiný dokument z tohoto',
    menuDocumentSources: 'Zobrazit zdroje',
    menuDerivedDocuments: 'Dokumenty vytvořené z tohoto',
    menuOpenInDocs: 'Převést a otevřít v Docs',
    menuPrint: 'Tisk…',
    menuOpen: 'Otevřít…',
    menuSave: 'Uložit',
    menuSaveAs: 'Uložit jako…',
    menuClose: 'Zavřít',
    menuEdit: 'Úpravy',
    menuWindow: 'Okno',
    menuHome: 'Domů',
    backToHome: 'Zpět na domovskou stránku',
    dlgOpenTitle: 'Otevřít soubor',
    filterSupported: 'Podporované soubory',
    filterWord: 'Dokumenty Word',
    filterOdt: 'Text OpenDocument',
    filterExcel: 'Sešity Excel',
    filterPpt: 'Prezentace PowerPoint',
    filterMarkdown: 'Textové soubory (Markdown, TXT, JSON)',
    filterHtml: 'Dokumenty HTML',
    filterMindmap: 'Myšlenkové mapy (soubory XMind)',
    filterHwp: 'Dokumenty HWP (HWP, HWPX)',
    filterPdf: 'Dokumenty PDF',
    errBadArgs: 'Neplatné argumenty',
    errBadName: 'Neplatný název souboru',
    errBadExtension: 'Toto rozšíření není podporováno a soubor by se neotevíral',
    errMissing: 'Soubor nebyl nalezen',
    errExists: 'Soubor s tímto názvem už existuje',
    errRenameFailed: 'Přejmenování se nezdařilo',
    errPdfSaveAsFailed: 'Kopii PDF se nepodařilo uložit',
    errNewTabFailed: 'Nový dokument se nepodařilo vytvořit',
    errDuplicateFailed: 'Soubor se nepodařilo duplikovat',
    errUnsupportedExt: 'Soubory .{ext} nejsou podporovány',
    copySuffix: 'kopie',
    menuHelp: 'Nápověda',
    menuUserGuide: 'Uživatelská příručka',
    thirdPartyNotices: 'Informace o softwaru třetích stran',
    menuExportDocx: 'Exportovat jako Word…',
    menuExportOdt: 'Exportovat jako ODT…',
    btnCancel: 'Zrušit',
    pdfDocxFailedMsg: 'Export do Wordu se nezdařil',
    pdfDocxBusyMsg: 'Export do Wordu už probíhá. Počkejte, až se dokončí.',
    menuExportPptx: 'Exportovat jako PowerPoint…',
    pdfPptxFailedMsg: 'Export do PowerPointu se nezdařil',
    pdfPptxBusyMsg: 'Export už probíhá. Počkejte, až se dokončí.',
    pdfPptxLocalScannedDetail:
      'Každá stránka byla exportována jako celostránkový obrázek; text na snímcích nelze upravovat.',
    menuExportXlsx: 'Exportovat jako Excel…',
    menuExportMd: 'Exportovat jako Markdown…',
    menuExportEpub: 'Exportovat jako EPUB…',
    pdfXlsxFailedMsg: 'Export do Excelu se nezdařil',
    pdfXlsxBusyMsg: 'Export už probíhá. Počkejte, až se dokončí.',
    pdfXlsxLocalScannedDetail:
      'Naskenované stránky nelze převést na buňky; list každé stránky místo toho obsahuje řádek s upozorněním.',
    pdfXlsxLocalSkippedMsg: 'Některé stránky nebyly převedeny na buňky',
    pdfXlsxLocalSkippedDetail:
      'Stránky {pages} nebylo možné převést na buňky; jejich listy místo toho obsahují řádek s upozorněním.',
    pdfDocxLocalScannedMsg: 'Zjištěn naskenovaný dokument',
    pdfDocxLocalScannedDetail:
      'Stránky byly exportovány jako obrázky, aby se zachoval jejich vzhled; nepodařilo se rozpoznat žádný upravitelný text.',
    pdfDocxLocalDegradedMsg: 'Některé stránky byly exportovány jako obrázky',
    pdfDocxLocalDegradedDetail:
      'Stránky {pages} nebylo možné spolehlivě rekonstruovat a byly exportovány jako celostránkové obrázky.',
    pdfDocxLocalOcrMsg: 'Naskenované stránky převedeny na upravitelný text',
    pdfDocxLocalOcrDetail:
      'Stránky {pages} byly skeny; jejich text byl obnoven pomocí OCR v zařízení. Výsledek si prosím zkontrolujte.',
    pdfDocxLocalEncryptedDetail: 'Toto PDF je šifrované a bez správného hesla ho nelze otevřít.',
    pdfDocxLocalUnsupportedEncDetail:
      'Toto PDF používá šifrování založené na certifikátu nebo jiné nepodporované šifrování a nelze ho převést.',
    pdfPwdTitle: 'Zadejte heslo',
    pdfPwdPrompt: 'Toto PDF je šifrované. Pro otevření zadejte heslo:',
    docPwdPrompt: 'Tento soubor je chráněný heslem. Zadejte heslo pro otevření:',
    pdfPwdRetryPrompt: 'Nesprávné heslo. Zkuste to znovu.',
    pdfPwdOk: 'OK',
    pdfPwdVerifying: 'Ověřování hesla…',
    pdfPwdLabel: 'Heslo',
    pdfPwdPlaceholder: 'Zadejte heslo pro otevření',
    pdfPwdShow: 'Zobrazit heslo',
    pdfPwdHide: 'Skrýt heslo',
    pdfDocxLocalCorruptDetail: 'Soubor je poškozený nebo není platným PDF a nelze ho převést.',
    dlgPickSaveDir: 'Zvolte výchozí umístění pro ukládání',
    errSaveDirUnusable:
      'Do vybrané složky nelze zapisovat a nelze ji použít jako výchozí umístění pro ukládání',
  },
  nl: {
    dlgAddFolderRoot: 'Map toevoegen aan startpagina',
    watchdogTitle: 'Document gebruikt te veel systeembronnen',
    watchdogBody:
      '"{title}" gebruikt al enkele minuten veel geheugen of CPU ({memory} MB, {cpu}% CPU). U kunt blijven wachten of het document sluiten (bij niet-opgeslagen wijzigingen wordt eerst gevraagd of u wilt opslaan). Diagnostische gegevens zijn vastgelegd.',
    watchdogWait: 'Blijven wachten',
    watchdogClose: 'Document sluiten',
    crashTitle: 'Een document is onverwacht gestopt',
    crashBody:
      '"{title}" is onverwacht gestopt. Wijzigingen sinds de laatste keer opslaan zijn mogelijk verloren gegaan.',
    crashReopen: 'Opnieuw openen',
    crashReload: 'Opnieuw laden',
    crashClose: 'Sluiten',
    crashLater: 'Niet nu',
    errFolderRootUnusable: 'De geselecteerde map kan niet worden gelezen',
    menuFile: 'Bestand',
    menuSectionNew: 'Nieuw',
    menuOpenInNewWindow: 'Openen in nieuw venster',
    menuSplitRight: 'Splitsen naar rechts',
    menuSplitDown: 'Splitsen naar beneden',
    menuUnsplit: 'Splitsing opheffen',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'Naamloze spreadsheet',
    untitledDoc: 'Naamloos document',
    untitledDeck: 'Naamloze presentatie',
    untitledMarkdown: 'Naamloos Markdown',
    untitledHtml: 'Naamloos HTML',
    untitledMindmap: 'Naamloze mindmap',
    untitledHwp: 'Naamloos HWP',
    untitledPdf: 'Naamloze PDF',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'Mindmap',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'Exporteren als PDF…',
    menuExportImages: 'Exporteren als afbeeldingen…',
    menuExportHtml: 'Exporteren als één HTML-bestand…',
    menuExportMapImage: 'Exporteren als afbeelding (PNG)…',
    menuExportMapOutline: 'Exporteren als Markdown-overzicht…',
    menuMakeFromDocument: 'Ander document maken van dit document',
    menuDocumentSources: 'Bronnen weergeven',
    menuDerivedDocuments: 'Documenten gemaakt van dit document',
    menuOpenInDocs: 'Converteren en openen in Docs',
    menuPrint: 'Afdrukken…',
    menuOpen: 'Openen…',
    menuSave: 'Opslaan',
    menuSaveAs: 'Opslaan als…',
    menuClose: 'Sluiten',
    menuEdit: 'Bewerken',
    menuWindow: 'Venster',
    menuHome: 'Start',
    backToHome: 'Terug naar start',
    dlgOpenTitle: 'Bestand openen',
    filterSupported: 'Ondersteunde bestanden',
    filterWord: 'Word-documenten',
    filterOdt: 'OpenDocument-tekst',
    filterExcel: 'Excel-werkmappen',
    filterPpt: 'PowerPoint-presentaties',
    filterMarkdown: 'Tekstbestanden (Markdown, TXT, JSON)',
    filterHtml: 'HTML-documenten',
    filterMindmap: 'Mindmaps (XMind-bestanden)',
    filterHwp: 'HWP-documenten (HWP, HWPX)',
    filterPdf: 'PDF-documenten',
    errBadArgs: 'Ongeldige argumenten',
    errBadName: 'Ongeldige bestandsnaam',
    errBadExtension: 'Die extensie wordt niet ondersteund en het bestand zou niet meer openen',
    errMissing: 'Bestand niet gevonden',
    errExists: 'Er bestaat al een bestand met die naam',
    errRenameFailed: 'Naam wijzigen mislukt',
    errPdfSaveAsFailed: 'PDF-kopie kon niet worden opgeslagen',
    errNewTabFailed: 'Kan het nieuwe document niet maken',
    errDuplicateFailed: 'Kan het bestand niet dupliceren',
    errUnsupportedExt: '.{ext}-bestanden worden niet ondersteund',
    copySuffix: 'kopie',
    menuHelp: 'Help',
    menuUserGuide: 'Gebruikershandleiding',
    thirdPartyNotices: 'Kennisgevingen over software van derden',
    menuExportDocx: 'Exporteren als Word…',
    menuExportOdt: 'Exporteren als ODT…',
    btnCancel: 'Annuleren',
    pdfDocxFailedMsg: 'Exporteren als Word mislukt',
    pdfDocxBusyMsg: 'Er is al een Word-export bezig. Wacht tot deze is voltooid.',
    menuExportPptx: 'Exporteren als PowerPoint…',
    pdfPptxFailedMsg: 'Exporteren als PowerPoint mislukt',
    pdfPptxBusyMsg: 'Er is al een export bezig. Wacht tot deze is voltooid.',
    pdfPptxLocalScannedDetail:
      'Elke pagina is als afbeelding geëxporteerd; de tekst op de dia’s is niet bewerkbaar.',
    menuExportXlsx: 'Exporteren als Excel…',
    menuExportMd: 'Exporteren als Markdown…',
    menuExportEpub: 'Exporteren als EPUB…',
    pdfXlsxFailedMsg: 'Exporteren als Excel mislukt',
    pdfXlsxBusyMsg: 'Er is al een export bezig. Wacht tot deze is voltooid.',
    pdfXlsxLocalScannedDetail:
      "Gescande pagina's kunnen niet naar cellen worden omgezet; het werkblad van elke pagina bevat een meldingsrij.",
    pdfXlsxLocalSkippedMsg: "Sommige pagina's zijn niet naar cellen omgezet",
    pdfXlsxLocalSkippedDetail:
      "Pagina's {pages} konden niet naar cellen worden omgezet; hun werkbladen bevatten een meldingsrij.",
    pdfDocxLocalScannedMsg: 'Gescand document gedetecteerd',
    pdfDocxLocalScannedDetail:
      "De pagina's zijn als afbeeldingen geëxporteerd om hun uiterlijk te behouden. Er kon geen bewerkbare tekst worden herkend.",
    pdfDocxLocalDegradedMsg: "Sommige pagina's zijn als afbeeldingen geëxporteerd",
    pdfDocxLocalDegradedDetail:
      "Pagina's {pages} konden niet betrouwbaar worden gereconstrueerd en zijn als paginagrote afbeeldingen geëxporteerd.",
    pdfDocxLocalOcrMsg: 'Gescande pagina’s omgezet naar bewerkbare tekst',
    pdfDocxLocalOcrDetail:
      'Pagina(’s) {pages} waren scans; de tekst is hersteld met lokale OCR. Controleer het resultaat.',
    pdfDocxLocalEncryptedDetail:
      'Deze PDF is versleuteld en kon niet worden geopend zonder het juiste wachtwoord.',
    pdfDocxLocalUnsupportedEncDetail:
      'Deze PDF gebruikt certificaatgebaseerde of anderszins niet-ondersteunde versleuteling en kan niet worden geconverteerd.',
    pdfPwdTitle: 'Wachtwoord invoeren',
    pdfPwdPrompt: 'Deze PDF is versleuteld. Voer het wachtwoord in om te openen:',
    docPwdPrompt:
      'Dit bestand is beveiligd met een wachtwoord. Voer het wachtwoord in om het te openen:',
    pdfPwdRetryPrompt: 'Onjuist wachtwoord. Probeer het opnieuw.',
    pdfPwdOk: 'OK',
    pdfPwdVerifying: 'Wachtwoord controleren…',
    pdfPwdLabel: 'Wachtwoord',
    pdfPwdPlaceholder: 'Voer het openingswachtwoord in',
    pdfPwdShow: 'Wachtwoord tonen',
    pdfPwdHide: 'Wachtwoord verbergen',
    pdfDocxLocalCorruptDetail:
      'Het bestand is beschadigd of geen geldige PDF en kan niet worden geconverteerd.',
    dlgPickSaveDir: 'Standaard opslaglocatie kiezen',
    errSaveDirUnusable:
      'De geselecteerde map is niet beschrijfbaar en kan niet als standaard opslaglocatie worden gebruikt',
  },
  ms: {
    dlgAddFolderRoot: 'Tambah Folder ke Laman Utama',
    watchdogTitle: 'Dokumen menggunakan terlalu banyak sumber',
    watchdogBody:
      '"{title}" telah menggunakan banyak memori atau CPU selama beberapa minit ({memory} MB, CPU {cpu}%). Anda boleh terus menunggu atau menutup dokumen ini (perubahan yang belum disimpan akan ditanya dahulu). Diagnostik telah direkodkan.',
    watchdogWait: 'Terus Menunggu',
    watchdogClose: 'Tutup Dokumen',
    crashTitle: 'Dokumen berhenti secara tidak dijangka',
    crashBody:
      '"{title}" berhenti secara tidak dijangka. Perubahan sejak simpanan terakhir mungkin telah hilang.',
    crashReopen: 'Buka Semula',
    crashReload: 'Muat Semula',
    crashClose: 'Tutup',
    crashLater: 'Bukan Sekarang',
    errFolderRootUnusable: 'Folder yang dipilih tidak dapat dibaca',
    menuFile: 'Fail',
    menuSectionNew: 'Baharu',
    menuOpenInNewWindow: 'Buka dalam Tetingkap Baharu',
    menuSplitRight: 'Bahagi ke Kanan',
    menuSplitDown: 'Bahagi ke Bawah',
    menuUnsplit: 'Buang Pembahagian',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'Hamparan tanpa tajuk',
    untitledDoc: 'Dokumen tanpa tajuk',
    untitledDeck: 'Persembahan tanpa tajuk',
    untitledMarkdown: 'Markdown tanpa tajuk',
    untitledHtml: 'HTML tanpa tajuk',
    untitledMindmap: 'Peta minda tanpa tajuk',
    untitledHwp: 'HWP tanpa tajuk',
    untitledPdf: 'PDF tanpa tajuk',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'Peta minda',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'Eksport sebagai PDF…',
    menuExportImages: 'Eksport sebagai imej…',
    menuExportHtml: 'Eksport sebagai HTML fail tunggal…',
    menuExportMapImage: 'Eksport sebagai imej (PNG)…',
    menuExportMapOutline: 'Eksport sebagai rangka Markdown…',
    menuMakeFromDocument: 'Buat dokumen lain daripada dokumen ini',
    menuDocumentSources: 'Lihat sumber',
    menuDerivedDocuments: 'Dokumen yang dibuat daripada dokumen ini',
    menuOpenInDocs: 'Tukar dan buka dalam Docs',
    menuPrint: 'Cetak…',
    menuOpen: 'Buka…',
    menuSave: 'Simpan',
    menuSaveAs: 'Simpan Sebagai…',
    menuClose: 'Tutup',
    menuEdit: 'Edit',
    menuWindow: 'Tetingkap',
    menuHome: 'Laman Utama',
    backToHome: 'Kembali ke Laman Utama',
    dlgOpenTitle: 'Buka Fail',
    filterSupported: 'Fail yang Disokong',
    filterWord: 'Dokumen Word',
    filterOdt: 'Teks OpenDocument',
    filterExcel: 'Buku Kerja Excel',
    filterPpt: 'Persembahan PowerPoint',
    filterMarkdown: 'Fail teks (Markdown, TXT, JSON)',
    filterHtml: 'Dokumen HTML',
    filterMindmap: 'Peta minda (fail XMind)',
    filterHwp: 'Dokumen HWP (HWP, HWPX)',
    filterPdf: 'Dokumen PDF',
    errBadArgs: 'Argumen tidak sah',
    errBadName: 'Nama fail tidak sah',
    errBadExtension: 'Sambungan itu tidak disokong dan fail tidak akan dibuka',
    errMissing: 'Fail tidak ditemui',
    errExists: 'Fail dengan nama yang sama sudah wujud',
    errRenameFailed: 'Gagal menamakan semula',
    errPdfSaveAsFailed: 'Gagal menyimpan salinan PDF',
    errNewTabFailed: 'Gagal mencipta dokumen baharu',
    errDuplicateFailed: 'Tidak dapat menduplikasi fail',
    errUnsupportedExt: 'fail .{ext} tidak disokong',
    copySuffix: 'salinan',
    menuHelp: 'Bantuan',
    menuUserGuide: 'Panduan Pengguna',
    thirdPartyNotices: 'Notis Perisian Pihak Ketiga',
    menuExportDocx: 'Eksport sebagai Word…',
    menuExportOdt: 'Eksport sebagai ODT…',
    btnCancel: 'Batal',
    pdfDocxFailedMsg: 'Gagal mengeksport sebagai Word',
    pdfDocxBusyMsg: 'Eksport ke Word sedang dijalankan. Sila tunggu sehingga selesai.',
    menuExportPptx: 'Eksport sebagai PowerPoint…',
    pdfPptxFailedMsg: 'Eksport sebagai PowerPoint gagal',
    pdfPptxBusyMsg: 'Eksport sedang berjalan. Sila tunggu sehingga selesai.',
    pdfPptxLocalScannedDetail:
      'Setiap halaman dieksport sebagai imej; teks pada slaid tidak boleh diedit.',
    menuExportXlsx: 'Eksport sebagai Excel…',
    menuExportMd: 'Eksport sebagai Markdown…',
    menuExportEpub: 'Eksport sebagai EPUB…',
    pdfXlsxFailedMsg: 'Eksport sebagai Excel gagal',
    pdfXlsxBusyMsg: 'Eksport sedang berjalan. Sila tunggu sehingga selesai.',
    pdfXlsxLocalScannedDetail:
      'Halaman imbasan tidak boleh ditukar kepada sel; helaian setiap halaman mengandungi baris makluman.',
    pdfXlsxLocalSkippedMsg: 'Sesetengah halaman tidak ditukar kepada sel',
    pdfXlsxLocalSkippedDetail:
      'Halaman {pages} tidak dapat ditukar kepada sel; helaiannya mengandungi baris makluman.',
    pdfDocxLocalScannedMsg: 'Dokumen imbasan dikesan',
    pdfDocxLocalScannedDetail:
      'Halaman dieksport sebagai imej untuk mengekalkan rupanya. Tiada teks boleh edit yang dapat dikenali.',
    pdfDocxLocalDegradedMsg: 'Sesetengah halaman dieksport sebagai imej',
    pdfDocxLocalDegradedDetail:
      'Halaman {pages} tidak dapat dibina semula dengan pasti dan telah dieksport sebagai imej halaman penuh.',
    pdfDocxLocalOcrMsg: 'Halaman imbasan ditukar kepada teks boleh edit',
    pdfDocxLocalOcrDetail:
      'Halaman {pages} ialah imbasan; teksnya dipulihkan dengan OCR setempat. Sila semak hasilnya.',
    pdfDocxLocalEncryptedDetail:
      'PDF ini disulitkan dan tidak dapat dibuka tanpa kata laluan yang betul.',
    pdfDocxLocalUnsupportedEncDetail:
      'PDF ini menggunakan penyulitan berasaskan sijil atau penyulitan yang tidak disokong dan tidak boleh ditukar.',
    pdfPwdTitle: 'Masukkan Kata Laluan',
    pdfPwdPrompt: 'PDF ini disulitkan. Masukkan kata laluan untuk membukanya:',
    docPwdPrompt: 'Fail ini dilindungi kata laluan. Masukkan kata laluan untuk membukanya:',
    pdfPwdRetryPrompt: 'Kata laluan salah. Sila cuba lagi.',
    pdfPwdOk: 'OK',
    pdfPwdVerifying: 'Mengesahkan kata laluan…',
    pdfPwdLabel: 'Kata laluan',
    pdfPwdPlaceholder: 'Masukkan kata laluan buka',
    pdfPwdShow: 'Tunjukkan kata laluan',
    pdfPwdHide: 'Sembunyikan kata laluan',
    pdfDocxLocalCorruptDetail: 'Fail rosak atau bukan PDF yang sah dan tidak dapat ditukar.',
    dlgPickSaveDir: 'Pilih Lokasi Simpanan Lalai',
    errSaveDirUnusable:
      'Folder yang dipilih tidak boleh ditulis dan tidak dapat digunakan sebagai lokasi simpanan lalai',
  },
  he: {
    dlgAddFolderRoot: 'הוספת תיקייה לדף הבית',
    watchdogTitle: 'המסמך צורך יותר מדי משאבים',
    watchdogBody:
      '"{title}" משתמש בהרבה זיכרון או מעבד כבר כמה דקות (זיכרון {memory} MB, מעבד {cpu}%). אפשר להמשיך לחכות או לסגור את המסמך (אם יש שינויים שלא נשמרו, תתבקשו לשמור קודם). נתוני האבחון נרשמו.',
    watchdogWait: 'להמשיך לחכות',
    watchdogClose: 'סגירת המסמך',
    crashTitle: 'מסמך נעצר באופן בלתי צפוי',
    crashBody: '"{title}" נעצר באופן בלתי צפוי. ייתכן ששינויים שנעשו מאז השמירה האחרונה אבדו.',
    crashReopen: 'פתיחה מחדש',
    crashReload: 'טעינה מחדש',
    crashClose: 'סגירה',
    crashLater: 'לא עכשיו',
    errFolderRootUnusable: 'לא ניתן לקרוא את התיקייה שנבחרה',
    menuFile: 'קובץ',
    menuSectionNew: 'חדש',
    menuOpenInNewWindow: 'פתח בחלון חדש',
    menuSplitRight: 'פצל לימין',
    menuSplitDown: 'פצל למטה',
    menuUnsplit: 'בטל פיצול',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'גיליון אלקטרוני ללא שם',
    untitledDoc: 'מסמך ללא שם',
    untitledDeck: 'מצגת ללא שם',
    untitledMarkdown: 'Markdown ללא שם',
    untitledHtml: 'HTML ללא שם',
    untitledMindmap: 'מפת חשיבה ללא שם',
    untitledHwp: 'HWP ללא שם',
    untitledPdf: 'PDF ללא שם',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'מפת חשיבה',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'ייצוא כ-PDF…',
    menuExportImages: 'ייצוא כתמונות…',
    menuExportHtml: 'ייצוא כ-HTML בקובץ יחיד…',
    menuExportMapImage: 'ייצוא כתמונה (PNG)…',
    menuExportMapOutline: 'ייצוא כמתאר Markdown…',
    menuMakeFromDocument: 'יצירת מסמך אחר מהמסמך הזה',
    menuDocumentSources: 'הצגת מקורות',
    menuDerivedDocuments: 'מסמכים שנוצרו מהמסמך הזה',
    menuOpenInDocs: 'המרה ופתיחה ב-Docs',
    menuPrint: 'הדפסה…',
    menuOpen: 'פתיחה…',
    menuSave: 'שמירה',
    menuSaveAs: 'שמירה בשם…',
    menuClose: 'סגירה',
    menuEdit: 'עריכה',
    menuWindow: 'חלון',
    menuHome: 'דף הבית',
    backToHome: 'חזרה לדף הבית',
    dlgOpenTitle: 'פתיחת קובץ',
    filterSupported: 'קבצים נתמכים',
    filterWord: 'מסמכי Word',
    filterOdt: 'טקסט OpenDocument',
    filterExcel: 'חוברות עבודה של Excel',
    filterPpt: 'מצגות PowerPoint',
    filterMarkdown: 'קובצי טקסט (Markdown, TXT, JSON)',
    filterHtml: 'מסמכי HTML',
    filterMindmap: 'מפות חשיבה (קובצי XMind)',
    filterHwp: 'מסמכי HWP (HWP, HWPX)',
    filterPdf: 'מסמכי PDF',
    errBadArgs: 'ארגומנטים לא חוקיים',
    errBadName: 'שם קובץ לא חוקי',
    errBadExtension: 'הסיומת אינה נתמכת והקובץ לא ייפתח יותר',
    errMissing: 'הקובץ לא נמצא',
    errExists: 'כבר קיים קובץ באותו שם',
    errRenameFailed: 'שינוי השם נכשל',
    errPdfSaveAsFailed: 'לא ניתן לשמור את עותק ה-PDF',
    errNewTabFailed: 'יצירת המסמך החדש נכשלה',
    errDuplicateFailed: 'לא ניתן לשכפל את הקובץ',
    errUnsupportedExt: 'קובצי .{ext} אינם נתמכים',
    copySuffix: 'עותק',
    menuHelp: 'עזרה',
    menuUserGuide: 'מדריך למשתמש',
    thirdPartyNotices: 'הודעות על תוכנות צד שלישי',
    menuExportDocx: 'ייצוא כ-Word…',
    menuExportOdt: 'ייצוא כ-ODT…',
    btnCancel: 'ביטול',
    pdfDocxFailedMsg: 'הייצוא כ-Word נכשל',
    pdfDocxBusyMsg: 'ייצוא ל-Word כבר מתבצע. נא להמתין לסיומו.',
    menuExportPptx: 'ייצוא כ-PowerPoint…',
    pdfPptxFailedMsg: 'הייצוא כ-PowerPoint נכשל',
    pdfPptxBusyMsg: 'ייצוא כבר מתבצע. יש להמתין לסיומו.',
    pdfPptxLocalScannedDetail: 'כל עמוד יוצא כתמונה; הטקסט בשקופיות אינו ניתן לעריכה.',
    menuExportXlsx: 'ייצוא כ-Excel…',
    menuExportMd: 'ייצוא כ-Markdown…',
    menuExportEpub: 'ייצוא כ-EPUB…',
    pdfXlsxFailedMsg: 'הייצוא כ-Excel נכשל',
    pdfXlsxBusyMsg: 'ייצוא כבר מתבצע. יש להמתין לסיומו.',
    pdfXlsxLocalScannedDetail:
      'עמודים סרוקים אינם ניתנים להמרה לתאים; בגיליון של כל עמוד נוספה שורת הודעה.',
    pdfXlsxLocalSkippedMsg: 'חלק מהעמודים לא הומרו לתאים',
    pdfXlsxLocalSkippedDetail:
      'לא ניתן היה להמיר את העמודים {pages} לתאים; בגיליונות שלהם נוספה שורת הודעה.',
    pdfDocxLocalScannedMsg: 'זוהה מסמך סרוק',
    pdfDocxLocalScannedDetail:
      'העמודים יוצאו כתמונות כדי לשמר את המראה. לא ניתן היה לזהות טקסט הניתן לעריכה.',
    pdfDocxLocalDegradedMsg: 'חלק מהעמודים יוצאו כתמונות',
    pdfDocxLocalDegradedDetail:
      'לא ניתן היה לשחזר באופן אמין את עמודים {pages}, והם יוצאו כתמונות של עמוד מלא.',
    pdfDocxLocalOcrMsg: 'עמודים סרוקים הומרו לטקסט הניתן לעריכה',
    pdfDocxLocalOcrDetail:
      'עמודים {pages} היו סריקות; הטקסט שוחזר באמצעות OCR מקומי. מומלץ להגיה את התוצאה.',
    pdfDocxLocalEncryptedDetail: 'קובץ PDF זה מוצפן ולא ניתן היה לפתוח אותו ללא הסיסמה הנכונה.',
    pdfDocxLocalUnsupportedEncDetail:
      'קובץ PDF זה משתמש בהצפנה מבוססת אישורים או בהצפנה שאינה נתמכת ולא ניתן להמירו.',
    pdfPwdTitle: 'הזנת סיסמה',
    pdfPwdPrompt: 'קובץ PDF זה מוצפן. הזינו את הסיסמה כדי לפתוח אותו:',
    docPwdPrompt: 'הקובץ מוגן בסיסמה. הזינו את הסיסמה כדי לפתוח אותו:',
    pdfPwdRetryPrompt: 'סיסמה שגויה. נסו שוב.',
    pdfPwdOk: 'אישור',
    pdfPwdVerifying: 'מאמת את הסיסמה…',
    pdfPwdLabel: 'סיסמה',
    pdfPwdPlaceholder: 'הזינו את סיסמת הפתיחה',
    pdfPwdShow: 'הצג סיסמה',
    pdfPwdHide: 'הסתר סיסמה',
    pdfDocxLocalCorruptDetail: 'הקובץ פגום או שאינו PDF תקין ולא ניתן להמירו.',
    dlgPickSaveDir: 'בחירת מיקום שמירה כברירת מחדל',
    errSaveDirUnusable:
      'התיקייה שנבחרה אינה ניתנת לכתיבה ולא ניתן להשתמש בה כמיקום שמירה כברירת מחדל',
  },
  hi: {
    dlgAddFolderRoot: 'होम में फ़ोल्डर जोड़ें',
    watchdogTitle: 'दस्तावेज़ बहुत अधिक संसाधन ले रहा है',
    watchdogBody:
      '"{title}" कई मिनटों से बहुत अधिक मेमोरी या CPU इस्तेमाल कर रहा है (मेमोरी {memory} MB, CPU {cpu}%)। आप इंतज़ार जारी रख सकते हैं या यह दस्तावेज़ बंद कर सकते हैं (बिना सहेजे बदलाव होने पर पहले सहेजने के लिए पूछा जाएगा)। निदान जानकारी दर्ज कर ली गई है।',
    watchdogWait: 'इंतज़ार जारी रखें',
    watchdogClose: 'दस्तावेज़ बंद करें',
    crashTitle: 'दस्तावेज़ अचानक बंद हो गया',
    crashBody:
      '"{title}" अचानक बंद हो गया। पिछली बार सहेजने के बाद किए गए बदलाव खो गए हो सकते हैं।',
    crashReopen: 'फिर से खोलें',
    crashReload: 'फिर से लोड करें',
    crashClose: 'बंद करें',
    crashLater: 'अभी नहीं',
    errFolderRootUnusable: 'चयनित फ़ोल्डर पढ़ा नहीं जा सका',
    menuFile: 'फ़ाइल',
    menuSectionNew: 'नया',
    menuOpenInNewWindow: 'नई विंडो में खोलें',
    menuSplitRight: 'दाईं ओर विभाजित करें',
    menuSplitDown: 'नीचे विभाजित करें',
    menuUnsplit: 'विभाजन हटाएँ',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: 'शीर्षकहीन स्प्रेडशीट',
    untitledDoc: 'बिना शीर्षक दस्तावेज़',
    untitledDeck: 'बिना शीर्षक प्रस्तुति',
    untitledMarkdown: 'अनाम Markdown',
    untitledHtml: 'अनाम HTML',
    untitledMindmap: 'अनाम माइंड मैप',
    untitledHwp: 'अनाम HWP',
    untitledPdf: 'अनाम PDF',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: 'माइंड मैप',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: 'PDF के रूप में निर्यात…',
    menuExportImages: 'छवियों के रूप में निर्यात…',
    menuExportHtml: 'एकल-फ़ाइल HTML के रूप में निर्यात…',
    menuExportMapImage: 'छवि (PNG) के रूप में निर्यात…',
    menuExportMapOutline: 'Markdown रूपरेखा के रूप में निर्यात…',
    menuMakeFromDocument: 'इस दस्तावेज़ से दूसरा दस्तावेज़ बनाएँ',
    menuDocumentSources: 'स्रोत देखें',
    menuDerivedDocuments: 'इस दस्तावेज़ से बने दस्तावेज़',
    menuOpenInDocs: 'Docs में बदलें और खोलें',
    menuPrint: 'प्रिंट करें…',
    menuOpen: 'खोलें…',
    menuSave: 'सहेजें',
    menuSaveAs: 'इस रूप में सहेजें…',
    menuClose: 'बंद करें',
    menuEdit: 'संपादन',
    menuWindow: 'विंडो',
    menuHome: 'होम',
    backToHome: 'होम पर वापस जाएँ',
    dlgOpenTitle: 'फ़ाइल खोलें',
    filterSupported: 'समर्थित फ़ाइलें',
    filterWord: 'Word दस्तावेज़',
    filterOdt: 'OpenDocument टेक्स्ट',
    filterExcel: 'Excel वर्कबुक',
    filterPpt: 'PowerPoint प्रस्तुतियाँ',
    filterMarkdown: 'पाठ फ़ाइलें (Markdown, TXT, JSON)',
    filterHtml: 'HTML दस्तावेज़',
    filterMindmap: 'माइंड मैप (XMind फ़ाइलें)',
    filterHwp: 'HWP दस्तावेज़ (HWP, HWPX)',
    filterPdf: 'PDF दस्तावेज़',
    errBadArgs: 'अमान्य आर्ग्युमेंट',
    errBadName: 'अमान्य फ़ाइल नाम',
    errBadExtension: 'वह एक्सटेंशन समर्थित नहीं है और फ़ाइल फिर नहीं खुलेगी',
    errMissing: 'फ़ाइल नहीं मिली',
    errExists: 'इस नाम की फ़ाइल पहले से मौजूद है',
    errRenameFailed: 'नाम बदलने में विफल',
    errPdfSaveAsFailed: 'PDF की प्रति सहेजी नहीं जा सकी',
    errNewTabFailed: 'नया दस्तावेज़ बनाने में विफल',
    errDuplicateFailed: 'फ़ाइल की प्रतिलिपि नहीं बनाई जा सकी',
    errUnsupportedExt: '.{ext} फ़ाइलें समर्थित नहीं हैं',
    copySuffix: 'प्रतिलिपि',
    menuHelp: 'सहायता',
    menuUserGuide: 'उपयोगकर्ता गाइड',
    thirdPartyNotices: 'तृतीय-पक्ष सॉफ़्टवेयर सूचनाएँ',
    menuExportDocx: 'Word के रूप में निर्यात करें…',
    menuExportOdt: 'ODT के रूप में निर्यात करें…',
    btnCancel: 'रद्द करें',
    pdfDocxFailedMsg: 'Word के रूप में निर्यात विफल रहा',
    pdfDocxBusyMsg: 'Word के रूप में निर्यात पहले से चल रहा है। कृपया पूरा होने तक प्रतीक्षा करें।',
    menuExportPptx: 'PowerPoint के रूप में निर्यात करें…',
    pdfPptxFailedMsg: 'PowerPoint के रूप में निर्यात विफल रहा',
    pdfPptxBusyMsg: 'एक निर्यात पहले से चल रहा है। कृपया उसके पूरा होने की प्रतीक्षा करें।',
    pdfPptxLocalScannedDetail:
      'प्रत्येक पृष्ठ छवि के रूप में निर्यात किया गया; स्लाइड का टेक्स्ट संपादन योग्य नहीं है।',
    menuExportXlsx: 'Excel के रूप में निर्यात करें…',
    menuExportMd: 'Markdown के रूप में निर्यात करें…',
    menuExportEpub: 'EPUB के रूप में निर्यात करें…',
    pdfXlsxFailedMsg: 'Excel के रूप में निर्यात विफल रहा',
    pdfXlsxBusyMsg: 'एक निर्यात पहले से चल रहा है। कृपया उसके पूरा होने की प्रतीक्षा करें।',
    pdfXlsxLocalScannedDetail:
      'स्कैन किए गए पेज सेल में परिवर्तित नहीं किए जा सकते; प्रत्येक पेज की वर्कशीट में एक सूचना पंक्ति जोड़ी गई है।',
    pdfXlsxLocalSkippedMsg: 'कुछ पेज सेल में परिवर्तित नहीं हुए',
    pdfXlsxLocalSkippedDetail:
      'पेज {pages} सेल में परिवर्तित नहीं किए जा सके; उनकी वर्कशीट में एक सूचना पंक्ति जोड़ी गई है।',
    pdfDocxLocalScannedMsg: 'स्कैन किया गया दस्तावेज़ मिला',
    pdfDocxLocalScannedDetail:
      'पृष्ठों का स्वरूप बनाए रखने के लिए उन्हें छवियों के रूप में निर्यात किया गया। संपादन योग्य टेक्स्ट को पहचाना नहीं जा सका।',
    pdfDocxLocalDegradedMsg: 'कुछ पृष्ठ छवियों के रूप में निर्यात किए गए',
    pdfDocxLocalDegradedDetail:
      'पृष्ठ {pages} का लेआउट विश्वसनीय रूप से पुनर्निर्मित नहीं हो सका, इसलिए उन्हें पूर्ण-पृष्ठ छवियों के रूप में निर्यात किया गया।',
    pdfDocxLocalOcrMsg: 'स्कैन किए गए पृष्ठ संपादन योग्य टेक्स्ट में बदले गए',
    pdfDocxLocalOcrDetail:
      'पृष्ठ {pages} स्कैन थे; स्थानीय OCR से टेक्स्ट पुनर्प्राप्त किया गया। कृपया परिणाम जाँचें।',
    pdfDocxLocalEncryptedDetail:
      'यह PDF एन्क्रिप्टेड है और सही पासवर्ड के बिना इसे खोला नहीं जा सका।',
    pdfDocxLocalUnsupportedEncDetail:
      'यह PDF प्रमाणपत्र-आधारित या असमर्थित एन्क्रिप्शन का उपयोग करता है और इसे परिवर्तित नहीं किया जा सकता।',
    pdfPwdTitle: 'पासवर्ड दर्ज करें',
    pdfPwdPrompt: 'यह PDF एन्क्रिप्टेड है। खोलने के लिए पासवर्ड दर्ज करें:',
    docPwdPrompt: 'यह फ़ाइल पासवर्ड से सुरक्षित है। इसे खोलने के लिए पासवर्ड दर्ज करें:',
    pdfPwdRetryPrompt: 'पासवर्ड गलत है। कृपया फिर से प्रयास करें।',
    pdfPwdOk: 'ठीक है',
    pdfPwdVerifying: 'पासवर्ड सत्यापित किया जा रहा है…',
    pdfPwdLabel: 'पासवर्ड',
    pdfPwdPlaceholder: 'खोलने का पासवर्ड दर्ज करें',
    pdfPwdShow: 'पासवर्ड दिखाएँ',
    pdfPwdHide: 'पासवर्ड छिपाएँ',
    pdfDocxLocalCorruptDetail:
      'फ़ाइल क्षतिग्रस्त है या मान्य PDF नहीं है, इसलिए रूपांतरण नहीं हो सकता।',
    dlgPickSaveDir: 'डिफ़ॉल्ट सहेजने का स्थान चुनें',
    errSaveDirUnusable:
      'चयनित फ़ोल्डर में लिखा नहीं जा सकता, इसलिए इसे डिफ़ॉल्ट सहेजने के स्थान के रूप में उपयोग नहीं किया जा सकता',
  },
  'zh-TW': {
    dlgAddFolderRoot: '將資料夾加入首頁',
    watchdogTitle: '文件佔用資源過高',
    watchdogBody:
      '「{title}」已持續數分鐘佔用大量記憶體或 CPU（記憶體 {memory} MB，CPU {cpu}%）。可以繼續等待，或關閉這個文件（有未儲存的變更會先詢問是否儲存）。診斷資訊已記錄。', // public-hygiene: allow
    watchdogWait: '繼續等待',
    watchdogClose: '關閉文件',
    crashTitle: '文件意外停止',
    crashBody: '「{title}」意外停止。上次儲存後的變更可能已遺失。',
    crashReopen: '重新開啟',
    crashReload: '重新載入',
    crashClose: '關閉',
    crashLater: '暫不處理',
    errFolderRootUnusable: '無法讀取所選資料夾',
    menuFile: '檔案',
    menuSectionNew: '新增',
    menuOpenInNewWindow: '在新視窗中開啟',
    menuSplitRight: '向右分割',
    menuSplitDown: '向下分割',
    menuUnsplit: '取消分割',
    menuNewDoc: 'AI Docs',
    menuNewSheet: 'AI Sheets',
    untitledSheet: '未命名試算表',
    untitledDoc: '未命名文件',
    untitledDeck: '未命名簡報',
    untitledMarkdown: '未命名 Markdown',
    untitledHtml: '未命名 HTML',
    untitledMindmap: '未命名心智圖',
    untitledHwp: '未命名 HWP',
    untitledPdf: '未命名 PDF',
    menuNewSlide: 'AI Slides',
    menuNewMarkdown: 'AI Markdown',
    menuNewHtml: 'AI HTML',
    menuNewMindmap: '心智圖',
    menuNewHwp: 'AI HWP',
    menuNewPdf: 'AI PDF',
    menuExportPdf: '匯出為 PDF…',
    menuExportImages: '匯出為圖片…',
    menuExportHtml: '匯出為單檔 HTML…',
    menuExportMapImage: '匯出為圖片 (PNG)…',
    menuExportMapOutline: '匯出為 Markdown 大綱…',
    menuMakeFromDocument: '用此文件新增其他文件',
    menuDocumentSources: '檢視資料',
    menuDerivedDocuments: '用此文件新增的文件',
    menuOpenInDocs: '轉換為 Docs 文件並開啟',
    menuPrint: '列印…',
    menuOpen: '開啟…',
    menuSave: '儲存',
    menuSaveAs: '另存新檔…',
    menuClose: '關閉',
    menuEdit: '編輯',
    menuWindow: '視窗',
    menuHome: '首頁',
    backToHome: '返回首頁',
    dlgOpenTitle: '開啟檔案',
    filterSupported: '支援的檔案',
    filterWord: 'Word 文件',
    filterOdt: 'OpenDocument 文字',
    filterExcel: 'Excel 活頁簿',
    filterPpt: 'PowerPoint 簡報',
    filterMarkdown: '文字檔 (Markdown, TXT, JSON)',
    filterHtml: 'HTML 文件',
    filterMindmap: '心智圖 (XMind 檔案)',
    filterHwp: 'HWP 文件 (HWP, HWPX)',
    filterPdf: 'PDF 文件',
    errBadArgs: '參數無效',
    errBadName: '檔案名稱不合法',
    errBadExtension: '這個副檔名不受支援，改了檔案就打不開了',
    errMissing: '檔案不存在',
    errExists: '同名檔案已存在',
    errRenameFailed: '重新命名失敗',
    errPdfSaveAsFailed: '另存為 PDF 失敗',
    errNewTabFailed: '新建文件失敗',
    errDuplicateFailed: '複製檔案失敗',
    errUnsupportedExt: '暫不支援 .{ext} 類型',
    copySuffix: '副本',
    menuHelp: '說明',
    menuUserGuide: '使用手冊',
    thirdPartyNotices: '第三方軟體聲明',
    menuExportDocx: '匯出為 Word…',
    menuExportOdt: '匯出為 ODT…',
    btnCancel: '取消',
    pdfDocxFailedMsg: '匯出為 Word 失敗',
    pdfDocxBusyMsg: '正在轉換中，請等待目前的匯出完成。',
    menuExportPptx: '匯出為 PPT…',
    pdfPptxFailedMsg: '匯出為 PPT 失敗',
    pdfPptxBusyMsg: '正在轉換中，請等待目前匯出完成。',
    pdfPptxLocalScannedDetail: '本機轉換已將各頁以圖片保真匯出，簡報中的文字無法編輯。',
    menuExportXlsx: '匯出為 Excel…',
    menuExportMd: '匯出為 Markdown…',
    menuExportEpub: '匯出為 EPUB…',
    pdfXlsxFailedMsg: '匯出為 Excel 失敗',
    pdfXlsxBusyMsg: '正在轉換中，請等待目前匯出完成。',
    pdfXlsxLocalScannedDetail: '掃描頁無法轉換為儲存格，對應工作表中已寫入提示列。',
    pdfXlsxLocalSkippedMsg: '部分頁面未轉換為儲存格',
    pdfXlsxLocalSkippedDetail: '第 {pages} 頁無法轉換為儲存格，對應工作表中已寫入提示列。',
    pdfDocxLocalScannedMsg: '偵測到掃描文件',
    pdfDocxLocalScannedDetail: '本機轉換已將各頁以圖片方式保真匯出，未能辨識出可編輯的文字。',
    pdfDocxLocalDegradedMsg: '部分頁面已以圖片匯出',
    pdfDocxLocalDegradedDetail: '第 {pages} 頁的版面無法可靠重建，已以整頁圖片保真匯出。',
    pdfDocxLocalOcrMsg: '掃描頁已轉換為可編輯文字',
    pdfDocxLocalOcrDetail:
      '第 {pages} 頁為掃描件，已透過本機 OCR 辨識為可編輯文字，建議校對辨識結果。',
    pdfDocxLocalEncryptedDetail: '此 PDF 已加密，未提供正確的密碼，無法轉換。',
    pdfDocxLocalUnsupportedEncDetail: '該檔案使用憑證加密或不支援的加密方式，無法轉換。',
    pdfPwdTitle: '輸入密碼',
    pdfPwdPrompt: '此 PDF 已加密，請輸入開啟密碼：',
    docPwdPrompt: '此檔案受密碼保護。請輸入開啟密碼：',
    pdfPwdRetryPrompt: '密碼不正確，請重試。',
    pdfPwdOk: '確定',
    pdfPwdVerifying: '正在驗證密碼…',
    pdfPwdLabel: '密碼',
    pdfPwdPlaceholder: '輸入開啟密碼',
    pdfPwdShow: '顯示密碼',
    pdfPwdHide: '隱藏密碼',
    pdfDocxLocalCorruptDetail: '檔案已損壞或不是有效的 PDF，無法轉換。',
    dlgPickSaveDir: '選擇預設儲存位置',
    errSaveDirUnusable: '所選資料夾無法寫入，無法作為預設儲存位置',
  },
})

const tm = (key: Parameters<typeof tMain>[1], params?: Parameters<typeof tMain>[2]) =>
  tMain(currentLang(), key, params)

// ---- the shell window + its tab manager (recreated if the user closes it on macOS) ----

let shellWindow: BrowserWindow | null = null
let tabManager: TabManager | null = null

/**
 * New file from a folder view: the click remembers the folder per kind, the
 * new-tab code consumes it right away. Sheets / PDF write their blank file
 * straight into that folder; the editors that save untitled files themselves
 * (docs, slides, markdown, html) get the folder bound to the tab that was just
 * created, and the tab's first save moves the fresh file there.
 * key: 'doc' | 'sheet' | 'slide' | 'markdown' | 'html' | 'pdf'
 */
/** folders the user added to the home tree beside the default save folder */
function extraFolderRoots(): string[] {
  return readExtraRoots(readAppSettings(APP_SETTINGS_PATH()), defaultSaveDir())
}

function folderRootPaths(): string[] {
  return [defaultSaveDir(), ...extraFolderRoots()]
}

function insideAnyRoot(path: string): boolean {
  return folderRootPaths().some((root) => isInsideRoot(root, path))
}

function isAnyRoot(path: string): boolean {
  const key = resolve(path)
  return folderRootPaths().some((root) => resolve(root) === key)
}

const pendingNewFileDir = new Map<string, { dir: string; setAt: number }>()
/** folder bound to a freshly created editor tab, keyed by its webContents id; consumed by the first save */
const pendingDirByWc = new Map<number, { dir: string; setAt: number }>()
/** a pending folder only applies to a file created within this window after the click */
const PENDING_DIR_TTL_MS = 30 * 60 * 1000

function rememberPendingDir(kind: string, opts?: NewFileOpts): void {
  const dir = opts?.dir
  if (!dir || resolve(dir) === resolve(defaultSaveDir()) || !insideAnyRoot(dir)) {
    pendingNewFileDir.delete(kind)
    return
  }
  pendingNewFileDir.set(kind, { dir, setAt: Date.now() })
}

/** the folder remembered for this kind, consumed; null when none, expired or gone */
function takePendingDir(kind: string): { dir: string; setAt: number } | null {
  const pending = pendingNewFileDir.get(kind)
  pendingNewFileDir.delete(kind)
  if (!pending) return null
  if (Date.now() - pending.setAt > PENDING_DIR_TTL_MS) return null
  return existsSync(pending.dir) ? pending : null
}

/** where a shell-created blank file (sheet, pdf) lands: the remembered folder, else the root */
function newFileDir(kind: string): string {
  return takePendingDir(kind)?.dir ?? defaultSaveDir()
}

/** hand the remembered folder to the tab that was just opened for it */
function bindPendingDir(kind: string, tabId: string | undefined): void {
  const pending = takePendingDir(kind)
  const wc = tabId ? tabManager?.webContentsForTab(tabId) : undefined
  if (pending && wc) pendingDirByWc.set(wc.id, pending)
}

/**
 * A tab's file first hit disk (silent first save, Save As, or an open): if a
 * folder is bound to that tab and the file is a fresh one in the root, move
 * it there. A pre-existing file opened in the tab never qualifies: its birth
 * time (or, where the filesystem reports none, its mtime) predates the click.
 */
function applyPendingDir(wcId: number, filePath: string): string {
  const pending = pendingDirByWc.get(wcId)
  if (!pending) return filePath
  if (Date.now() - pending.setAt > PENDING_DIR_TTL_MS) {
    pendingDirByWc.delete(wcId)
    return filePath
  }
  if (resolve(dirname(filePath)) !== resolve(defaultSaveDir())) return filePath
  try {
    const stat = statSync(filePath)
    const born = stat.birthtimeMs || stat.mtimeMs
    if (born < pending.setAt - 2000) return filePath
  } catch {
    return filePath
  }
  pendingDirByWc.delete(wcId)
  if (!existsSync(pending.dir)) return filePath
  // a clash with an existing name takes the "(2)" suffix rather than staying in the root
  const target = join(pending.dir, uniqueNameIn(pending.dir, basename(filePath)))
  try {
    renameSync(filePath, target)
  } catch (err) {
    console.warn('[shell] move new file into folder failed:', err)
    return filePath
  }
  afterFileMoved(filePath, target)
  return target
}

/**
 * Everything that keys on a file path follows a rename/move: recents, stars,
 * the AI chat history (project-store), the slides start-screen list and any
 * open tab (which re-grants the new path and refreshes its title).
 */
function afterFileMoved(oldPath: string, newPath: string): void {
  replaceRecentFile(oldPath, newPath)
  projectFileRenamed(oldPath, newPath)
  documentLinkFileMoved(oldPath, newPath)
  if (/\.pptx$/i.test(newPath)) void replaceSlidesRecentFile(oldPath, newPath)
  if (/\.pptx$/i.test(newPath)) moveSlidesTemplateSelection(oldPath, newPath)
  const affected = tabManager?.renameTabFile(oldPath, newPath) ?? []
  const detachedAffected = detachedRenameFile(oldPath, newPath)
  if (detachedAffected) affected.push(detachedAffected)
  for (const t of affected) {
    if (t.kind === 'slides') slidesFileRenamed(t.webContents, oldPath, newPath)
    else if (t.kind === 'docs') docsFileRenamed(t.webContents, oldPath, newPath)
    else if (t.kind === 'sheets') sheetsFileRenamed(t.webContents, oldPath, newPath)
    else if (t.kind === 'markdown') markdownFileRenamed(t.webContents, oldPath, newPath)
    else if (t.kind === 'html') htmlFileRenamed(t.webContents, oldPath, newPath)
    else if (t.kind === 'mindmap') mindmapFileRenamed(t.webContents, oldPath, newPath)
    else if (t.kind === 'hwp') hwpFileRenamed(t.webContents, oldPath, newPath)
    else if (t.kind === 'pdf') pdfFileRenamed(t.webContents, oldPath, newPath)
  }
}

function trackedFilesUnder(dir: string): string[] {
  return pathsUnder(dir, [
    ...readRecentFiles(),
    ...readStarredFiles(),
    ...projectFilePaths(),
    ...readSlidesRecentFiles(),
    ...(tabManager?.openFilePaths() ?? []),
    ...detachedFilePaths(),
    ...documentLinkPaths(),
  ])
}

function statMaybeFile(path: string): { isFile: () => boolean } | null {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

function fileTargetSources(): FileTargetSources {
  return {
    insideAnyRoot: (p) => insideAnyRoot(p),
    trackedPaths: [
      ...readRecentFiles(),
      ...readStarredFiles(),
      ...projectFilePaths(),
      ...readSlidesRecentFiles(),
      ...(tabManager?.openFilePaths() ?? []),
      ...detachedFilePaths(),
    ],
  }
}

/** a folder moved/renamed: re-key every tracked file that lived under it */
function afterFolderMoved(oldDir: string, newDir: string, filesBefore: readonly string[]): void {
  for (const file of filesBefore) afterFileMoved(file, rebasePath(file, oldDir, newDir))
}

const folderWatchers = new Map<string, FolderWatcher>()

let fileIndexStore: FileIndexStore | null = null
let fileIndexer: FileIndexer | null = null
let searchReranker: SearchReranker | null = null

function readFileSearchSettings(): FileSearchSettings {
  return normalizeFileSearchSettings(readAppSettings(APP_SETTINGS_PATH()).fileSearch)
}

/** the search index lives in userData and follows the save folder plus recents/starred */
function ensureFileIndexer(): FileIndexer | null {
  if (fileIndexer) return fileIndexer
  try {
    fileIndexStore = new FileIndexStore(join(app.getPath('userData'), 'file-index.db'))
  } catch (e) {
    console.warn('[file-index] unavailable:', e instanceof Error ? e.message : e)
    return null
  }
  fileIndexer = new FileIndexer(fileIndexStore, extractWorkerPath, {
    roots: () => folderRootPaths().filter((root) => existsSync(root)),
    extraPaths: () => [...readRecentFiles(), ...readStarredFiles()],
  })
  return fileIndexer
}

const SEARCH_EXT_FAMILY: Record<string, readonly string[]> = {
  docx: ['docx', 'doc', 'odt'],
  xlsx: ['xlsx', 'xlsm', 'xls', 'csv', 'tsv'],
  pptx: ['pptx', 'ppt'],
  md: ['md', 'markdown', 'txt', 'json'],
  html: ['html', 'htm'],
  hwp: ['hwp', 'hwpx'],
}

/** one recursive watcher per tree root; follows the save-folder setting and the added folders */
function ensureFolderWatchers(): void {
  const wanted = new Set(folderRootPaths().filter((root) => existsSync(root)))
  for (const [root, watcher] of folderWatchers) {
    if (wanted.has(root) && watcher.active) continue
    watcher.close()
    folderWatchers.delete(root)
  }
  for (const root of wanted) {
    if (folderWatchers.has(root)) continue
    const watcher = new FolderWatcher(root, (dirs) => {
      fileIndexer?.refresh()
      for (const wc of webContents.getAllWebContents()) {
        if (!wc.isDestroyed()) wc.send(HOME_CHANNELS.folderChanged, dirs)
      }
    })
    folderWatchers.set(root, watcher)
  }
}

/**
 * Show the details that go into the survey, copy them, and open the survey in
 * the browser. Everything the app contributes is on screen before anything is
 * copied or opened; the app sends nothing itself.
 */
async function openFeedbackSurvey(): Promise<void> {
  const lang = currentLang()
  const detail = feedbackDetails(lang, {
    version: app.getVersion(),
    os: `${platformLabel(process.platform)} ${release()}`,
    language: lang,
  })
  const options = {
    type: 'info' as const,
    title: feedbackText(lang, 'dialogTitle'),
    message: feedbackText(lang, 'dialogTitle'),
    detail: `${feedbackText(lang, 'dialogBody')}\n\n${detail}`,
    buttons: [feedbackText(lang, 'btnOpen'), feedbackText(lang, 'btnCancel')],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  }
  const win = shellWindow ?? BrowserWindow.getFocusedWindow()
  const { response } = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options)
  if (response !== 0) return
  clipboard.writeText(detail)
  shell.openExternal(FEEDBACK_SURVEY_URL).catch(() => {
    // no browser handler available; nothing actionable for the user here
  })
}

const FEEDBACK_MENU_ID = 'menu-send-feedback'

/**
 * Put the manual and the feedback entry in whatever menu is currently installed.
 *
 * Every tab kind builds its own application menu, which is how File and Edit
 * stay tab-shaped — and which is also why an item added to one builder is
 * missing from the other six. F1 worked from Home and nowhere else, and the
 * manual's own shortcut table was wrong for six of the seven tab kinds.
 *
 * Injecting after the builder has run is the one place that cannot be
 * forgotten: a new tab kind gets both for free, and a builder that already has
 * them is left alone rather than getting a second copy.
 */
function withHelpItems(): void {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  const userGuide: MenuItemConstructorOptions = {
    label: tm('menuUserGuide'),
    accelerator: 'F1',
    click: () => tabManager?.openHelpTab(),
  }
  const feedback: MenuItemConstructorOptions = {
    id: FEEDBACK_MENU_ID,
    label: feedbackText(currentLang(), 'menuLabel'),
    click: () => void openFeedbackSurvey(),
  }
  const help = menu.items.find((item) => item.role === 'help')
  // Slides and Sheets build a File/Edit/View template with no Help menu at
  // all, so there is nothing to insert into — one is created instead. Without
  // this the manual would be reachable from four of the seven tab kinds.
  if (!help) {
    menu.append(
      Menu.buildFromTemplate([
        {
          role: 'help',
          label: tm('menuHelp'),
          submenu: [userGuide, { type: 'separator' }, feedback],
        },
      ]).items[0]!,
    )
    return
  }
  const submenu = help.submenu
  if (!submenu) return
  if (submenu.items.some((i) => i.id === FEEDBACK_MENU_ID)) return
  // A separator survives a template only *between* two real items — Electron
  // drops one at either end, so `[userGuide, separator]` builds a single item
  // and the destructure below used to hand `undefined` to `insert`, which threw
  // "Invalid item" and took the main process down on the next tab switch. The
  // trailing entry is filler, discarded; the type check is what stops this from
  // silently regressing if Electron's rule ever changes again.
  const hasUserGuide = submenu.items.some((i) => i.accelerator === 'F1')
  const template: MenuItemConstructorOptions[] = hasUserGuide
    ? [feedback, { type: 'separator' }, { role: 'undo' }]
    : [userGuide, { type: 'separator' }, feedback, { type: 'separator' }, { role: 'undo' }]
  const items = Menu.buildFromTemplate(template).items.filter((i) => i.role !== 'undo')
  items.forEach((item, index) => submenu.insert(index, item))
}

function applyMenuFor(kind: TabKind): void {
  switch (kind) {
    case 'docs':
      buildDocsMenu()
      break
    case 'sheets':
      installSheetsMenu()
      break
    case 'slides':
      installSlidesMenu()
      break
    case 'pdf':
      buildPdfMenu()
      break
    case 'markdown':
      buildMarkdownMenu()
      break
    case 'html':
      buildHtmlMenu()
      break
    case 'mindmap':
      buildMindmapMenu()
      break
    case 'hwp':
      buildHwpMenu()
      break
    default:
      buildHomeMenu()
  }
  withHelpItems()
}

function refreshTitleBarOverlay(): void {
  if (process.platform === 'darwin' || !shellWindow || shellWindow.isDestroyed()) return
  shellWindow.setTitleBarOverlay(tabStripOverlay(nativeTheme.shouldUseDarkColors))
}

function createShellWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 720,
    minHeight: 550,
    title: productName(currentLang()),
    // vibrancy: editor modules punch translucent regions (e.g. the slides
    // thumbnail pane) through to the desktop
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, vibrancy: 'sidebar' as const }
      : {
          // the tab strip is the title bar, as on macOS; the application menu
          // stays registered for its accelerators and opens from the strip's
          // menu button (Alt still reveals the native bar where one exists)
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: tabStripOverlay(nativeTheme.shouldUseDarkColors),
          autoHideMenuBar: true,
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  shellWindow = win
  nativeTheme.on('updated', refreshTitleBarOverlay)
  win.once('closed', () => nativeTheme.off('updated', refreshTitleBarOverlay))
  // dragging the window by the tab strip's blank (draggable) area produces no
  // DOM event anywhere — will-move is the only signal to dismiss popovers
  win.on('will-move', () => broadcastChromePressed())
  // A detached editor window claims the process-global menu/active-editor targets
  // while focused; take them back when the shell window regains focus. Keyboard
  // focus must land back on the active tab's view too — regaining window focus
  // gives it to the chrome webContents, leaving typing dead in the document.
  win.on('focus', () => {
    tabManager?.refreshActiveTargets()
    tabManager?.focusActiveView()
  })

  const manager = new TabManager(
    win,
    () => {
      win.webContents.send(TABS_CHANNELS.changed, manager.list())
      publishOpenDocumentsIfOwner([...manager.openFilePaths(), ...detachedFilePaths()])
      refreshDocumentLinkMenu()
    },
    applyMenuFor,
    // no extension: these tabs have no file on disk yet; the title becomes the
    // real filename (the localized untitled default + .docx etc.) once the first save lands
    (kind) =>
      kind === 'help'
        ? tm('menuUserGuide')
        : kind === 'docs'
          ? tm('untitledDoc')
          : kind === 'slides'
            ? tm('untitledDeck')
            : kind === 'markdown'
              ? tm('untitledMarkdown')
              : kind === 'html'
                ? tm('untitledHtml')
                : kind === 'mindmap'
                  ? tm('untitledMindmap')
                  : kind === 'hwp'
                    ? tm('untitledHwp')
                    : tm('untitledSheet'),
    // every split change: remember it, re-role the pane views, tell the strip
    (state) => handleSplitChanged(win, manager, state),
  )
  tabManager = manager

  // Docking: a detached window dragged over this window's tab strip hands its
  // document back. The strip reports the insertion slot for each preview
  // (lastDockIndex); the slot is consumed by the dock that follows.
  setDockHost({
    band: () => dockBandFor(win),
    preview: (x) => {
      if (!win.isDestroyed())
        win.webContents.send(TABS_CHANNELS.dockPreview, x === null ? null : { x })
    },
    dock: (tab) => {
      const index = lastDockIndex
      lastDockIndex = undefined
      if (!win.isDestroyed()) win.webContents.send(TABS_CHANNELS.dockPreview, null)
      manager.attachTab(tab, index)
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    },
  })

  // pushRecent-triggered docs menu rebuilds must not clobber the active tab's
  // menu; a focused detached docs window owns the menu just like an active tab
  setDocsMenuGate(
    () =>
      focusedDetachedKind() === 'docs' || manager.list().some((t) => t.active && t.kind === 'docs'),
  )

  setDocsShellWindow(win)
  setSheetsShellWindow(win)
  setDocsHostWindowHook((wc) => detachedWindowForWebContents(wc.id))
  setSheetsHostWindowHook((wc) => detachedWindowForWebContents(wc.id))
  setSlidesShellWindow(win)
  setSlidesHostWindowHook((wc) => detachedWindowForWebContents(wc.id))
  setSlidesShowBleed((wc, on) => manager.setContentBleed(wc, on))
  setHtmlPresentHooks({
    setBleed: (wc, on) => manager.setContentBleed(wc, on),
    hostWindow: (wc) => detachedWindowForWebContents(wc.id) ?? win,
    openTab: (owner, title) => {
      manager.openHtmlPresentTab(owner, title)
      return true
    },
    closeTab: (wc) => {
      const id = manager.tabIdForWebContents(wc.id)
      if (id) void manager.closeTab(id)
      return !!id
    },
  })
  // A detached docs/sheets window can outlive the shell window; its hooks must
  // then reach the live tab manager (recreating the shell), never this closure's.
  setDocsShellHooks({
    openTab: (openPath, options) => ensureTabManager().openDocsTab(openPath, options),
    openAiDocTab: (content) =>
      ensureTabManager().openDocsTab(undefined, { newBlank: true, aiContent: content }),
    listTabs: () =>
      (tabManager?.list() ?? [])
        .filter((t) => t.kind === 'docs')
        .map((t) => ({ id: t.id, title: t.title, focused: t.active })),
    focusTab: (id) => tabManager?.activateTab(id),
    // ⌘W in a detached docs window closes that window (its own close guard runs)
    closeActiveTab: () => {
      const focused = BrowserWindow.getFocusedWindow()
      if (focused && focused !== win) focused.close()
      else tabManager?.closeActiveTab()
    },
    openGeneratedPath: (path) => openGeneratedDocument(path),
  })
  setSheetsCloseTabHook(() => {
    const focused = BrowserWindow.getFocusedWindow()
    if (focused && focused !== win) focused.close()
    else tabManager?.closeActiveTab()
  })
  // ⌘W targets the focused window: in a detached slides editor window it closes
  // that window (running its own close guard), not the shell's active tab
  setSlidesCloseTabHook(() => {
    const focused = BrowserWindow.getFocusedWindow()
    if (focused && focused !== win) focused.close()
    else manager.closeActiveTab()
  })
  // When ⌘O opens a file inside a tab, sync the tab title/path (used for de-dup by path) and record it as recent.
  // The first save / save-as fires this too, so applyPendingDir also runs here.
  setSheetsWorkbookOpenedHook((wc, path) => {
    manager.setTabFileFor(wc.id, path)
    detachedSetFileFor(wc.id, path)
    recordRecentFile(path)
  })
  setSlidesOpenedHook((wc, path) => {
    manager.setTabFileFor(wc.id, path)
    detachedSetFileFor(wc.id, path)
    recordRecentFile(path)
    noteDocumentSaved(wc, path, { mayBeOpen: true })
    applyPendingDir(wc.id, path)
  })
  // Encrypted workbooks and decks ask for their open password in the same
  // window the PDF conversions use, with document copy instead of PDF copy.
  const documentPasswordPrompt = (parent: BrowserWindow | undefined, fileName: string) =>
    createDocumentPasswordPrompt(
      {
        prompt: (name, retry) =>
          promptPdfPassword(parent && !parent.isDestroyed() ? parent : win, {
            fileName: name,
            retry,
            busy: false,
            lang: currentLang(),
            strings: {
              title: tm('pdfPwdTitle'),
              prompt: tm('docPwdPrompt'),
              retryPrompt: tm('pdfPwdRetryPrompt'),
              ok: tm('pdfPwdOk'),
              cancel: tm('btnCancel'),
              verifying: tm('pdfPwdVerifying'),
              label: tm('pdfPwdLabel'),
              placeholder: tm('pdfPwdPlaceholder'),
              show: tm('pdfPwdShow'),
              hide: tm('pdfPwdHide'),
            },
          }),
        close: closePdfPasswordDialog,
      },
      fileName,
    )
  setSheetsPasswordPrompt(documentPasswordPrompt)
  setSlidesPasswordPrompt(documentPasswordPrompt)
  // docs' save-as / silent first save lands on a new path → sync the tab title too
  setDocsFileSavedHook((wc, path) => {
    manager.setTabFileFor(wc.id, path)
    detachedSetFileFor(wc.id, path)
    recordRecentFile(path)
    return applyPendingDir(wc.id, path)
  })
  // ⌘O / open-path inside a docs tab: sync the tab title immediately, same
  // contract as the sheets/slides opened hooks (a plain save to the original
  // path never renames the tab, so the open must — r115)
  setDocsFileOpenedHook((wcId, path) => {
    manager.setTabFileFor(wcId, path)
    detachedSetFileFor(wcId, path)
    recordRecentFile(path)
    applyPendingDir(wcId, path)
  })
  // markdown untitled first save / Save As lands on a new path
  setMarkdownFileSavedHook((wc, path) => {
    manager.setTabFileFor(wc.id, path)
    detachedSetFileFor(wc.id, path)
    recordRecentFile(path)
    noteDocumentSaved(wc, path)
    applyPendingDir(wc.id, path)
  })
  setHtmlFileSavedHook((wc, path) => {
    manager.setTabFileFor(wc.id, path)
    detachedSetFileFor(wc.id, path)
    recordRecentFile(path)
    noteDocumentSaved(wc, path)
    applyPendingDir(wc.id, path)
  })
  // mind map untitled first save / Save As lands on a new path
  setMindmapFileSavedHook((wc, path) => {
    manager.setTabFileFor(wc.id, path)
    detachedSetFileFor(wc.id, path)
    recordRecentFile(path)
    noteDocumentSaved(wc, path)
    applyPendingDir(wc.id, path)
  })
  // the mind map's toolbar button "make another document from this one"
  setMindmapMakeFromDocumentHook((wc) => makeFromDocument(wc))
  // hwp Save As lands on a new path
  setHwpFileSavedHook((wc, path) => {
    manager.setTabFileFor(wc.id, path)
    detachedSetFileFor(wc.id, path)
    recordRecentFile(path)
    applyPendingDir(wc.id, path)
  })
  setHtmlProvisionalTitleHook((wc, title) => {
    manager.setTabTitleFor(wc.id, title)
    detachedSetTitleFor(wc.id, title)
  })
  setMindmapProvisionalTitleHook((wc, title) => {
    manager.setTabTitleFor(wc.id, title)
    detachedSetTitleFor(wc.id, title)
  })
  // A redacted copy becomes this tab's document; the source still exists.
  setPdfRedactionSavedHook((wc, path) => {
    manager.setTabFileFor(wc.id, path)
    detachedSetFileFor(wc.id, path)
    recordRecentFile(path)
    applyPendingDir(wc.id, path)
  })
  // pdf content-derived auto-rename: the file moved on disk, follow it everywhere
  setPdfRenamedHook((wc, oldPath, newPath) => {
    manager.setTabFileFor(wc.id, newPath)
    detachedSetFileFor(wc.id, newPath)
    replaceRecentFile(oldPath, newPath)
    projectFileRenamed(oldPath, newPath)
    documentLinkFileMoved(oldPath, newPath)
  })
  // markdown "convert & open in Docs" → route the fresh .docx to a docs tab
  setMarkdownDocxExportedHook((path) => {
    openDocumentPath(path)
  })
  // Word export to a path already open in a docs tab: close that tab before the file is
  // written (its unsaved-changes prompt applies, and a later save of the stale document
  // could otherwise overwrite the export); a cancelled close aborts the export.
  setHtmlDocxExportPrepareHook(async (path) => {
    const stale = manager.findDocsTabByPath(path)
    if (!stale) return true
    const active = manager.list().find((t) => t.active)?.id
    await manager.closeTab(stale)
    if (active && active !== stale) manager.activateTab(active)
    return !manager.findDocsTabByPath(path)
  })
  setHtmlDocxExportedHook((path) => {
    openDocumentPath(path)
  })

  // Closing the whole window walks every dirty sheets/pdf/slides/docs tab through
  // the same save/don't-save/cancel prompt; any cancel aborts the close. An
  // all-clean close is left untouched, so ⌘Q keeps quitting the app.
  installShellCloseGuard(win, manager)

  win.on('closed', () => {
    if (shellWindow === win) shellWindow = null
    if (tabManager === manager) {
      tabManager = null
      setDockHost(null)
      publishAllOpenDocuments()
    }
    // the split bookkeeping follows this manager; a rebuilt window restarts
    // tab ids, so a stale shape must not leak into the next one
    lastSplitState = null
    if (splitMemoryTimer) {
      clearTimeout(splitMemoryTimer)
      splitMemoryTimer = null
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ---- routing: one dispatch function for every open path ----

/**
 * Single source of truth for the open-dialog filter. Includes the
 * legacy .doc/.ppt binaries so they are selectable and surface the explicit
 * "not supported" dialog via openDocumentPath instead of being grayed out.
 */
const OPEN_DIALOG_EXTENSIONS = [
  'docx',
  'doc',
  'odt',
  'xlsx',
  'xlsm',
  'xls',
  'csv',
  'tsv',
  'pptx',
  'ppt',
  'pdf',
  'md',
  'markdown',
  'txt',
  'json',
  'html',
  'htm',
  'xmind',
  'hwp',
  'hwpx',
]

function notifyUnsupportedFile(filePath: string): void {
  const ext = extname(filePath).slice(1).toLowerCase() || basename(filePath)
  showAppWarning(tm('errUnsupportedExt', { ext }))
}

/** shell-hosted warning box; focused when a shell window exists, standalone otherwise */
function showAppWarning(message: string): void {
  const options = { type: 'warning' as const, message }
  if (shellWindow) {
    shellWindow.show()
    shellWindow.focus()
    void dialog.showMessageBox(shellWindow, options)
  } else {
    void dialog.showMessageBox(options)
  }
}

/**
 * Files dropped from the OS into any renderer arrive via installDropOpenBridge
 * and route through the normal File > Open pipeline; detached editor windows
 * can host the drop target, so the shell must reveal itself after opening.
 */
const droppedFilesDeps = () => ({
  openDocumentPath,
  revealShellWindow,
  showWarning: showAppWarning,
  unsupportedMessage: (exts: string[]) => tm('errUnsupportedExt', { ext: exts.join(', ') }),
})

function registerDroppedFilesIpc(): void {
  ipcMain.on(DROP_OPEN_CHANNEL, (_event, raw: unknown) =>
    handleDroppedFiles(raw, droppedFilesDeps()),
  )
}

/** the single router: extension decides which module owns the file; false = nothing opened */
function openDocumentPath(filePath: string): boolean {
  // a copy of a Drive file (from Recent, say) reopens through Drive, so a copy
  // older than the file in Drive is refreshed first unless it holds unsent edits
  const viaDrive = driveService?.reopen(filePath)
  if (viaDrive) {
    void viaDrive.catch(() => routeDocumentPath(filePath))
    return true
  }
  const opened = routeDocumentPath(filePath)
  return opened
}

/**
 * Open a just-written export. Unlike File > Open, an already-open PDF tab is
 * reloaded from disk so a re-export to the same path shows the new bytes
 * instead of the previous in-memory document (which may also hold unsaved
 * annotations). In-memory edits on that tab are discarded — Save would
 * overwrite the file we just exported.
 */
function openGeneratedDocument(filePath: string): boolean {
  if (tabManager && PDF_RE.test(filePath)) {
    const existing = tabManager.findPdfTabByPath(filePath)
    if (existing) {
      tabManager.reloadTab(existing)
      tabManager.activateTab(existing)
      return true
    }
  }
  return openDocumentPath(filePath)
}

function routeDocumentPath(filePath: string): boolean {
  if (!existsSync(filePath)) return false
  // a detached editor window already shows this file — focus it, never a second copy
  if (focusDetachedByPath(filePath)) return true
  if (!tabManager) return false
  if (DOCX_RE.test(filePath) || ODT_RE.test(filePath)) {
    recordRecentFile(filePath)
    const existing = tabManager.findDocsTabByPath(filePath)
    if (existing) tabManager.activateTab(existing)
    else tabManager.openDocsTab(filePath)
    return true
  }
  if (XLSX_RE.test(filePath)) {
    recordRecentFile(filePath)
    const existing = tabManager.findSheetsTabByPath(filePath)
    if (existing) {
      tabManager.activateTab(existing)
    } else {
      tabManager.openSheetsTab(filePath)
      startQueuedWorkbookNudge()
    }
    return true
  }
  if (PPTX_RE.test(filePath)) {
    recordRecentFile(filePath)
    const existing = tabManager.findSlidesTabByPath(filePath)
    if (existing) {
      tabManager.activateTab(existing)
    } else {
      // For a new tab the path goes through the pending queue; the renderer consumes it after mounting
      tabManager.openSlidesTab(filePath)
    }
    return true
  }
  if (PDF_RE.test(filePath)) {
    recordRecentFile(filePath)
    const existing = tabManager.findPdfTabByPath(filePath)
    if (existing) tabManager.activateTab(existing)
    else tabManager.openPdfTab(filePath)
    return true
  }
  if (TEXT_RE.test(filePath)) {
    recordRecentFile(filePath)
    const existing = tabManager.findMarkdownTabByPath(filePath)
    if (existing) tabManager.activateTab(existing)
    else tabManager.openMarkdownTab(filePath)
    return true
  }
  if (HTML_RE.test(filePath)) {
    recordRecentFile(filePath)
    const existing = tabManager.findHtmlTabByPath(filePath)
    if (existing) tabManager.activateTab(existing)
    else tabManager.openHtmlTab(filePath)
    return true
  }
  if (MINDMAP_RE.test(filePath)) {
    recordRecentFile(filePath)
    const existing = tabManager.findMindmapTabByPath(filePath)
    if (existing) tabManager.activateTab(existing)
    else tabManager.openMindmapTab(filePath)
    return true
  }
  if (HWP_RE.test(filePath)) {
    recordRecentFile(filePath)
    const existing = tabManager.findHwpTabByPath(filePath)
    if (existing) tabManager.activateTab(existing)
    else tabManager.openHwpTab(filePath)
    return true
  }
  notifyUnsupportedFile(filePath)
  return false
}

/**
 * "New spreadsheet" no longer drops a file in the default folder up front: the
 * blank workbook is created in a temp directory and its first Save goes through
 * Save As (the same path an .xls/.tsv import takes), so a new tab that is
 * closed without saving leaves nothing behind to delete by hand — the temp
 * directory is discarded with the session. The save pipeline still needs a real
 * file to edit, hence the backing workbook rather than the in-memory blank grid.
 * Falls back to a file in the default folder, then to the in-memory blank tab.
 */
async function newSheetTab(recoverAs?: string): Promise<void> {
  // recoverAs: the would-be path of a new workbook whose recovery copy
  // survived a crash; the sheets module offers it under that name
  const dir = newFileDir('sheet')
  let suggestedPath = recoverAs ?? uniquePathIn(dir, `${tm('untitledSheet')}.xlsx`)
  // nothing is on disk yet, so two new tabs would otherwise be promised the same name
  for (let i = 2; !recoverAs && sheetsSuggestedPathTaken(suggestedPath); i++)
    suggestedPath = uniquePathIn(dir, `${tm('untitledSheet')} ${i}.xlsx`)
  try {
    // under the import root so the session-close cleanup removes it like an import copy
    const tempDir = join(app.getPath('temp'), 'genoffice-imports', randomUUID())
    mkdirSync(tempDir, { recursive: true })
    const backingPath = join(tempDir, basename(suggestedPath))
    // reserve the name before the first await so a second new tab picks another;
    // the first Save As starts from the name the file would have had
    markSheetsUnsavedNew(backingPath, suggestedPath, tempDir)
    try {
      await atomicWriteFile(backingPath, await blankXlsxBuffer())
    } catch (err) {
      unmarkSheetsUnsavedNew(backingPath)
      throw err
    }
    // eligible for content-derived auto-rename after the first AI generation
    markSheetsUntitledPath(backingPath)
    tabManager?.openSheetsTab(backingPath)
    startQueuedWorkbookNudge()
    // no recent-file entry yet: there is no user-visible file until it is saved
  } catch (err) {
    console.warn('[shell] temp workbook create failed, writing to the default folder:', err)
    try {
      await atomicWriteFile(suggestedPath, await blankXlsxBuffer())
      markSheetsUntitledPath(suggestedPath)
      routeDocumentPath(suggestedPath)
    } catch (fallbackErr) {
      console.warn(
        '[shell] blank workbook create failed, opening in-memory blank tab:',
        fallbackErr,
      )
      try {
        tabManager?.openSheetsTab(undefined, { newBlank: true })
      } catch (finalErr) {
        surfaceNewTabError(finalErr)
      }
    }
  }
}

/**
 * A throw anywhere in the create-tab path (view creation, sidecar resolution,
 * renderer load) used to be swallowed by `void`-ed promises and ipc-invoke
 * rejections, so the click looked like a pure no-op — the exact "AI Sheets /
 * AI Slides do nothing" alpha report. Surface the failure instead.
 */
function surfaceNewTabError(err: unknown): void {
  console.error('[shell] new tab failed:', err)
  showErrorDialog(shellWindow, tm('errNewTabFailed'), err)
}

function newDocTab(): void {
  try {
    bindPendingDir('doc', tabManager?.openDocsTab(undefined, { newBlank: true }))
  } catch (err) {
    surfaceNewTabError(err)
  }
}

/** MCP: open a blank docs tab and return its webContents id, for the visible-editor bridge */
function openBlankDocsTabForMcp(): number {
  if (!tabManager) throw new Error('GenOffice is not ready')
  const tabId = tabManager.openDocsTab(undefined, { newBlank: true })
  const view = tabManager.docsTabs().find((t) => t.id === tabId)
  if (!view) throw new Error('the new document tab could not be opened')
  return view.webContents.id
}

/**
 * MCP: open a blank sheets tab and return its webContents id, for the
 * visible-grid bridge. Like the app's own "new spreadsheet", a real blank
 * .xlsx is created up front (the save pipeline needs an on-disk workbook;
 * the fallback in-memory demo grid cannot save) — but the AI auto-rename
 * marking is skipped, the file name is the agent's business.
 */
async function openBlankSheetsTabForMcp(): Promise<number> {
  if (!tabManager) throw new Error('GenOffice is not ready')
  const filePath = uniquePathIn(defaultSaveDir(), `${tm('untitledSheet')}.xlsx`)
  await atomicWriteFile(filePath, await blankXlsxBuffer())
  const tabId = tabManager.openSheetsTab(filePath)
  const view = tabManager.sheetsTabs().find((t) => t.id === tabId)
  if (!view) {
    // the tab never appeared, so nothing will ever consume this file
    try {
      rmSync(filePath)
    } catch (error) {
      console.warn('[mcp] could not remove the unused blank workbook:', error)
    }
    throw new Error('the new spreadsheet tab could not be opened')
  }
  const wcId = view.webContents.id
  mcpBlankSheetPaths.set(wcId, filePath)
  view.webContents.once('destroyed', () => mcpBlankSheetPaths.delete(wcId))
  // Same nudge the interactive path uses: the renderer subscribes to the open
  // action only after Univer mounts, so a single push can land in the void on a
  // cold start and leave the tab sitting on a blank in-memory workbook.
  startQueuedWorkbookNudge()
  return view.webContents.id
}

/** backing files of blank sheets tabs created by the MCP session tools */
const mcpBlankSheetPaths = new Map<number, string>()

/**
 * MCP: drop a blank sheets tab whose session never became ready, and delete the
 * empty workbook created for it. Without this a failed `create_session` leaves
 * an orphan tab plus an .xlsx in the default save folder that the user never
 * asked for — and nothing in the MCP surface can clean either one up.
 */
function abandonBlankSheetsTabForMcp(wcId: number): void {
  const manager = tabManager
  const filePath = mcpBlankSheetPaths.get(wcId)
  mcpBlankSheetPaths.delete(wcId)
  if (!manager) return
  // the grid may already be usable while the MCP bridge is not: keep anything the user typed
  if (manager.dirtySheetsTabs().some((t) => t.webContents.id === wcId)) return
  if (!abandonBlankTabForMcp(manager.sheetsTabs(), wcId)) return
  if (!filePath) return
  try {
    if (existsSync(filePath)) rmSync(filePath)
  } catch (error) {
    console.warn('[mcp] could not remove the unused blank workbook:', error)
  }
}

/**
 * MCP: close a tab whose session never became ready. Returns false when the
 * tab could not be closed (it is already gone, or the close failed).
 */
function abandonBlankTabForMcp(
  tabs: Array<{ id: string; webContents: WebContents }>,
  wcId: number,
): boolean {
  const tab = tabs.find((t) => t.webContents.id === wcId)
  if (!tab || !tabManager) return false
  try {
    return tabManager.closeTabWithoutPrompt(tab.id)
  } catch (error) {
    console.warn('[mcp] could not close the unused tab:', error)
    return false
  }
}

/** MCP: open a blank slides tab and return its webContents id, for the visible-deck bridge */
function openBlankSlidesTabForMcp(): number {
  if (!tabManager) throw new Error('GenOffice is not ready')
  const tabId = tabManager.openSlidesTab()
  const view = tabManager.slidesTabs().find((t) => t.id === tabId)
  if (!view) throw new Error('the new presentation tab could not be opened')
  return view.webContents.id
}

function newSlideTab(): void {
  try {
    bindPendingDir('slide', tabManager?.openSlidesTab())
  } catch (err) {
    surfaceNewTabError(err)
  }
}

function newMarkdownTab(): void {
  try {
    bindPendingDir('markdown', tabManager?.openMarkdownTab())
  } catch (err) {
    surfaceNewTabError(err)
  }
}

function newHtmlTab(): void {
  try {
    bindPendingDir('html', tabManager?.openHtmlTab())
  } catch (err) {
    surfaceNewTabError(err)
  }
}

function newMindmapTab(): void {
  try {
    bindPendingDir('mindmap', tabManager?.openMindmapTab())
  } catch (err) {
    surfaceNewTabError(err)
  }
}

function newHwpTab(): void {
  try {
    bindPendingDir('hwp', tabManager?.openHwpTab())
  } catch (err) {
    surfaceNewTabError(err)
  }
}

/**
 * "New PDF" creates a blank single-page .pdf in the default folder up front and
 * opens it as a regular file tab — the PDF module has no in-memory blank mode
 * (openPdfTab requires a path), same pattern as the blank workbook above.
 */
async function newPdfTab(): Promise<void> {
  try {
    const filePath = uniquePathIn(newFileDir('pdf'), `${tm('untitledPdf')}.pdf`)
    await atomicWriteFile(filePath, await blankPdfBuffer())
    // Opt the file into content-derived auto-naming on its first save
    markPdfUntitledPath(filePath)
    routeDocumentPath(filePath)
  } catch (err) {
    surfaceNewTabError(err)
  }
}

/**
 * The sheets renderer subscribes to menu actions only after Univer finishes
 * mounting (seconds on cold start), so a single 'open' can fire into the
 * void. Re-send until the queued workbook is consumed; consumption clears the
 * queue entry main-side (sheets-main), which stops the loop. The nudge only
 * reaches the active tab, so it gates on that tab's own queue entry —
 * background tabs from a multi-select Open pull their path themselves via the
 * renderer's has-queued-workbook poll.
 */
let workbookNudgeTimer: ReturnType<typeof setInterval> | null = null

function startQueuedWorkbookNudge(): void {
  if (workbookNudgeTimer) clearInterval(workbookNudgeTimer)
  const startedAt = Date.now()
  sendSheetsMenuAction('open')
  workbookNudgeTimer = setInterval(() => {
    if (
      !hasActiveQueuedWorkbook() ||
      Date.now() - startedAt > 30_000 ||
      !tabManager?.findSheetsTab()
    ) {
      if (workbookNudgeTimer) clearInterval(workbookNudgeTimer)
      workbookNudgeTimer = null
      return
    }
    sendSheetsMenuAction('open')
  }, 700)
}

// ---- home IPC ----

function statEntries(paths: string[]): RecentEntry[] {
  return statPathEntries(paths, new Set(readStarredFiles()))
}

function registerHomeIpc(): void {
  ipcMain.handle(HOME_CHANNELS.getAppVersion, (): string => app.getVersion())

  ipcMain.handle(HOME_CHANNELS.recents, (_event, query: unknown): RecentPage =>
    pageRecentPaths(readRecentFiles(), query, new Set(readStarredFiles())),
  )

  ipcMain.handle(HOME_CHANNELS.searchFiles, (_event, raw: unknown): FileSearchPage => {
    const query = (raw && typeof raw === 'object' ? raw : {}) as Partial<FileSearchQuery>
    const indexer = ensureFileIndexer()
    if (!indexer || !fileIndexStore) {
      return { hits: [], total: 0, index: { indexed: 0, pending: 0, scanning: false } }
    }
    // an open search box is the moment a stale index shows; rescan at most once a minute
    indexer.refreshIfStale(60_000)
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 200) : ''
    const filter = typeof query.ext === 'string' ? query.ext : ''
    const exts = filter && filter !== 'all' ? (SEARCH_EXT_FAMILY[filter] ?? [filter]) : undefined
    const offset = Number.isFinite(query.offset) ? Math.max(0, Math.floor(query.offset!)) : 0
    const limit = Number.isFinite(query.limit) ? Math.max(0, Math.floor(query.limit!)) : 50
    const starred = new Set(readStarredFiles())
    const result = q ? fileIndexStore.search(q, { exts, offset, limit }) : { hits: [], total: 0 }
    return {
      hits: result.hits.map((h) => ({ ...h, starred: starred.has(h.path) })),
      total: result.total,
      index: indexer.progress(),
    }
  })

  // Knowledge-base channel: the AI-side read access to the reader's starred
  // files (docs wires these into its panel; see knowledge-base.ts). Path
  // arguments are validated against the starred set — a corpus file is the
  // only thing a knowledge tool may read.
  // A home ask narrowed to one starred group (spec 8.8) carries a scope main
  // minted for that run; main resolves the group's members itself on every
  // call (see KbRunScopes). A call without a scope is an unscoped ask.
  const kbRunScopes = new KbRunScopes()
  ipcMain.handle('kb:open-scope', (event, group: unknown): string =>
    kbRunScopes.open(event.sender.id, group, readStarredGroupMap()),
  )
  ipcMain.handle('kb:close-scope', (event, scope: unknown): void =>
    kbRunScopes.close(event.sender.id, scope),
  )

  ipcMain.handle('kb:list', (event, raw: unknown): unknown => {
    const starred = kbRunScopes.narrow(
      event.sender.id,
      raw,
      readStarredFiles(),
      readStarredGroupMap,
    )
    return listKnowledgeFiles(starred)
  })

  ipcMain.handle('kb:search', async (event, raw: unknown): Promise<unknown> => {
    const query = (raw && typeof raw === 'object' ? raw : {}) as { q?: unknown; limit?: unknown }
    const q = typeof query.q === 'string' ? query.q : ''
    const limitRaw = Number(query.limit)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.floor(limitRaw)) : 8
    const store = fileIndexStore
    if (!q.trim() || !store) return []
    ensureFileIndexer()?.refreshIfStale(60_000)
    // a file saved since its last scan is still indexed as it was before the
    // save, so only the files the index holds as they are on disk are quoted
    const starred = store.pathsIndexedAsOnDisk(readStarredFiles())
    // a group-scoped ask searches its group only: a further filter on the set above, never a wider one
    const inScope = kbRunScopes.narrow(event.sender.id, raw, starred, readStarredGroupMap)
    // a starred file open with unsaved changes is left out: its excerpt would
    // be the text as last saved, before any withholding mark still in the editor
    const hits = await searchSavedKnowledgeBase(
      (qq, pool) =>
        store.search(qq, { limit: pool }).hits.map((h) => ({
          path: h.path,
          name: h.name,
          ext: h.ext,
          snippetText: (h.snippet ?? []).map((part) => part.text).join(''),
        })),
      q,
      inScope,
      Math.min(limit, 20),
    )
    return hits
  })

  ipcMain.handle('kb:read', async (event, raw: unknown): Promise<unknown> => {
    const req = (raw && typeof raw === 'object' ? raw : {}) as {
      path?: unknown
      offset?: unknown
    }
    const path = typeof req.path === 'string' ? req.path : ''
    const offsetRaw = Number(req.offset)
    const offset = Number.isFinite(offsetRaw) ? Math.floor(offsetRaw) : 0
    if (!path || !readStarredFiles().includes(path)) {
      throw new Error('path is not in the knowledge base')
    }
    // a group-scoped ask reads its group only: the same refusal, on top of the check above
    if (!kbRunScopes.narrow(event.sender.id, raw, [path], readStarredGroupMap).includes(path)) {
      throw new Error(KB_NOT_IN_BASE)
    }
    return readKnowledgeFilePage(path, offset)
  })

  ipcMain.handle(
    HOME_CHANNELS.rerankSearch,
    async (_event, raw: unknown): Promise<FileSearchRerank | null> => {
      const settings = readFileSearchSettings()
      if (!settings.rerank) return null
      const query = (raw && typeof raw === 'object' ? raw : {}) as { q?: unknown; paths?: unknown }
      const q = typeof query.q === 'string' ? query.q.trim().slice(0, 200) : ''
      const paths = Array.isArray(query.paths)
        ? query.paths.filter((p): p is string => typeof p === 'string').slice(0, 20)
        : []
      if (!q || paths.length < 2 || !ensureFileIndexer() || !fileIndexStore) return null
      searchReranker ??= new SearchReranker(fileIndexStore)
      // excerpts leave the machine here: only from files indexed as they are on disk
      return searchReranker.rerank(q, fileIndexStore.pathsIndexedAsOnDisk(paths), settings)
    },
  )

  ipcMain.handle(HOME_CHANNELS.getFileSearchSettings, (): FileSearchSettings =>
    readFileSearchSettings(),
  )

  ipcMain.handle(
    HOME_CHANNELS.setFileSearchSettings,
    (_event, patch: unknown): FileSearchSettings => {
      const current = readFileSearchSettings()
      const p = (patch && typeof patch === 'object' ? patch : {}) as Partial<FileSearchSettings>
      const next = normalizeFileSearchSettings({
        ...current,
        ...p,
        keys: { ...current.keys, ...(p.keys ?? {}) },
      })
      writeAppSetting(APP_SETTINGS_PATH(), 'fileSearch', next)
      return next
    },
  )

  ipcMain.handle(HOME_CHANNELS.testFileSearchRerank, (_event, input: unknown) =>
    probeDecision(normalizeFileSearchSettings(input)),
  )

  // Starred files sort by mtime, which requires stat-ing them all first; they are hand-picked and few, so this is fine
  ipcMain.handle(HOME_CHANNELS.starred, (_event, query: unknown): RecentPage => {
    const { offset, limit, ext } = normalizeRecentQuery(query)
    // the Starred view's group pills scope the whole query (totals included)
    const raw = (query && typeof query === 'object' ? query : {}) as { group?: unknown }
    const group = typeof raw.group === 'string' && raw.group ? raw.group : undefined
    const groupOf = readStarredGroupMap()
    const paths = readStarredFiles()
    const scoped = group ? paths.filter((p) => groupOf.get(p) === group) : paths
    const all = statEntries(scoped)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .map((entry) => {
        const g = groupOf.get(entry.path)
        return g ? { ...entry, group: g } : entry
      })
    const filtered = ext ? all.filter((entry) => matchesExtFamily(entry.ext, ext)) : all
    return {
      entries: limit === 0 ? [] : filtered.slice(offset, offset + limit),
      total: filtered.length,
      totalAll: all.length,
    }
  })

  ipcMain.handle(HOME_CHANNELS.starredGroups, (): string[] => readStarredGroups())

  ipcMain.handle(HOME_CHANNELS.setStarredGroup, (_event, paths: unknown, group: unknown) => {
    setStarredGroup(stringPaths(paths), typeof group === 'string' && group ? group : null)
  })

  ipcMain.handle(HOME_CHANNELS.statPaths, (_event, paths: unknown): RecentEntry[] =>
    statEntries(capStatPaths(stringPaths(paths))),
  )

  ipcMain.handle(HOME_CHANNELS.toggleStar, (_event, path: unknown) => {
    if (typeof path === 'string') toggleStarredFile(path)
  })

  ipcMain.handle(HOME_CHANNELS.openPath, (_event, path: unknown) => {
    if (typeof path !== 'string' || !path || path.length > 4096) return
    openDocumentPath(path)
    fileIndexer?.refresh()
  })

  ipcMain.handle(HOME_CHANNELS.browse, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? shellWindow
    if (!win) return
    const result = await showOpenDialogWithMemory(dialog, win, {
      title: tm('dlgOpenTitle'),
      filters: [
        { name: tm('filterSupported'), extensions: OPEN_DIALOG_EXTENSIONS },
        { name: tm('filterWord'), extensions: ['docx', 'doc'] },
        { name: tm('filterOdt'), extensions: ['odt'] },
        { name: tm('filterExcel'), extensions: ['xlsx', 'xlsm', 'xls', 'csv', 'tsv'] },
        { name: tm('filterPpt'), extensions: ['pptx', 'ppt'] },
        { name: tm('filterPdf'), extensions: ['pdf'] },
        { name: tm('filterMarkdown'), extensions: ['md', 'markdown', 'txt', 'json'] },
        { name: tm('filterHtml'), extensions: ['html', 'htm'] },
        { name: tm('filterMindmap'), extensions: ['xmind'] },
        { name: tm('filterHwp'), extensions: ['hwp', 'hwpx'] },
      ],
      properties: ['openFile', 'multiSelections'],
    })
    if (!result.canceled) for (const path of result.filePaths) openDocumentPath(path)
  })

  ipcMain.handle(HOME_CHANNELS.newDoc, (_event, opts?: NewFileOpts) => {
    rememberPendingDir('doc', opts)
    newDocTab()
  })

  ipcMain.handle(HOME_CHANNELS.newSheet, (_event, opts?: NewFileOpts) => {
    rememberPendingDir('sheet', opts)
    void newSheetTab()
  })

  ipcMain.handle(HOME_CHANNELS.newSlide, (_event, opts?: NewFileOpts) => {
    rememberPendingDir('slide', opts)
    newSlideTab()
  })

  ipcMain.handle(HOME_CHANNELS.newMarkdown, (_event, opts?: NewFileOpts) => {
    rememberPendingDir('markdown', opts)
    newMarkdownTab()
  })

  ipcMain.handle(HOME_CHANNELS.newHtml, (_event, opts?: NewFileOpts) => {
    rememberPendingDir('html', opts)
    newHtmlTab()
  })

  ipcMain.handle(HOME_CHANNELS.newMindmap, (_event, opts?: NewFileOpts) => {
    rememberPendingDir('mindmap', opts)
    newMindmapTab()
  })

  ipcMain.handle(HOME_CHANNELS.newHwp, (_event, opts?: NewFileOpts) => {
    rememberPendingDir('hwp', opts)
    newHwpTab()
  })

  ipcMain.handle(HOME_CHANNELS.newPdf, (_event, opts?: NewFileOpts) => {
    rememberPendingDir('pdf', opts)
    void newPdfTab()
  })

  ipcMain.handle(HOME_CHANNELS.removeRecent, (_event, paths: unknown) => {
    const list = stringPaths(paths)
    removeRecentFiles(list)
    // an unavailable entry's star must go with it, or the Starred view keeps
    // a dead dimmed row the recents list no longer shows
    removeStarredFiles(list.filter((p) => !existsSync(p)))
  })

  // Bulk unstar from the Starred view: every row there is a favorite, so the
  // selection action is "unstar", not "remove from recents" — removeRecent
  // keeps existing files' stars on purpose, which made the Starred view's
  // bulk removal a no-op for anything still on disk
  ipcMain.handle(HOME_CHANNELS.unstarPaths, (_event, paths: unknown) => {
    removeStarredFiles(stringPaths(paths))
  })

  ipcMain.handle(HOME_CHANNELS.revealPath, (_event, path: unknown) => {
    if (typeof path === 'string' && existsSync(path)) shell.showItemInFolder(path)
  })

  ipcMain.handle(
    HOME_CHANNELS.renameFile,
    (_event, path: unknown, newName: unknown): RenameResult => {
      if (typeof path !== 'string' || typeof newName !== 'string')
        return { ok: false, error: tm('errBadArgs') }
      // Validate the raw name before trimming: trimming first would
      // silently turn "report " into "report" and make the
      // trailing-space gate in isValidRenameName unreachable. Reject
      // with the localized gate instead of renaming to a different
      // name than requested.
      if (!isValidRawRenameName(newName)) return { ok: false, error: tm('errBadName') }
      if (!renameStaysInApp(path, newName.trim()))
        return { ok: false, error: tm('errBadExtension') }
      if (!isUserVisibleFile(path, fileTargetSources()))
        return { ok: false, error: tm('errBadArgs') }
      const name = newName.trim()
      if (!existsSync(path)) return { ok: false, error: tm('errMissing') }
      const target = join(dirname(path), name)
      if (target === path) return { ok: true, path }
      // A case-only rename (Report.pdf -> report.pdf) hits the source itself on
      // case-insensitive filesystems; only a genuinely different file blocks.
      if (existsSync(target) && !isSameFile(path, target)) {
        return { ok: false, error: tm('errExists') }
      }
      try {
        renameSync(path, target)
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : tm('errRenameFailed') }
      }
      afterFileMoved(path, target)
      return { ok: true, path: target }
    },
  )

  ipcMain.handle(HOME_CHANNELS.duplicateFile, async (_event, path: unknown) => {
    if (typeof path !== 'string' || !existsSync(path)) return
    if (!isUserVisibleFile(path, fileTargetSources())) return
    const ext = extname(path)
    const base = basename(path, ext)
    const dir = dirname(path)
    for (let i = 1; ; i++) {
      const target = join(dir, `${base} ${tm('copySuffix')}${i === 1 ? '' : ` ${i}`}${ext}`)
      if (existsSync(target)) continue
      try {
        await atomicCopyFile(path, target)
      } catch (err) {
        showErrorDialog(shellWindow, tm('errDuplicateFailed'), err)
        return
      }
      recordRecentFile(target)
      return
    }
  })

  ipcMain.handle(HOME_CHANNELS.deleteFiles, async (_event, paths: unknown) => {
    const targets = fileTargetSources()
    // a missing path still passes so the ghost recent/star entry gets cleaned up
    const list = stringPaths(paths).filter(
      (p) => isUserVisibleFile(p, targets) && statMaybeFile(p)?.isFile() !== false,
    )
    for (const p of list) {
      try {
        await shell.trashItem(p)
      } catch {
        // file already gone or trash unavailable; still drop it from the list
      }
    }
    removeRecentFiles(list)
    // the files were deliberately destroyed — stars must not survive as ghosts
    removeStarredFiles(list)
  })

  ipcMain.handle(HOME_CHANNELS.openTrash, () => {
    if (process.platform === 'darwin') {
      void shell.openPath(join(app.getPath('home'), '.Trash'))
    } else if (process.platform === 'win32') {
      spawn('explorer.exe', ['shell:RecycleBin'], { detached: true }).unref()
    } else {
      void shell.openPath(join(app.getPath('home'), '.local', 'share', 'Trash', 'files'))
    }
  })

  ipcMain.handle(HOME_CHANNELS.openHelp, (_event, topic: unknown) => {
    // the tab manager keeps only an id-shaped topic; anything else opens as F1
    tabManager?.openHelpTab(typeof topic === 'string' ? topic : undefined)
  })
  ipcMain.handle(HOME_CHANNELS.getLanguage, (): Lang => currentLang())

  ipcMain.handle(HOME_CHANNELS.setLanguage, (_event, lang: unknown) => {
    if (!isLang(lang) || lang === currentLang()) return
    persistLang(lang)
    // the switcher lives on the home page, so the home menu is the active one
    buildHomeMenu()
    installDockMenu()
    installBackToHomeItems()
    notifyQuickLookLangOrThemeChanged()
    for (const wc of webContents.getAllWebContents()) wc.send('app:language-changed', lang)
  })

  ipcMain.handle(HOME_CHANNELS.getUpdateChannel, (): UpdateChannel => currentUpdateChannel())

  ipcMain.handle(HOME_CHANNELS.setUpdateChannel, (_event, channel: unknown) => {
    if (!isUpdateChannel(channel) || channel === currentUpdateChannel()) return
    cachedUpdateChannel = channel
    writeAppSetting(APP_SETTINGS_PATH(), 'updateChannel', channel)
    applyUpdateChannel(channel)
  })

  ipcMain.handle(
    HOME_CHANNELS.onboardingSeen,
    (): boolean => readAppSettings(APP_SETTINGS_PATH()).onboardingSeen === true,
  )

  ipcMain.handle(HOME_CHANNELS.setOnboardingSeen, (): boolean => {
    try {
      writeAppSetting(APP_SETTINGS_PATH(), 'onboardingSeen', true)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle(HOME_CHANNELS.getTheme, (): UiTheme => currentTheme())
  // editor tabs ask via the app-wide channel (symmetric with app:get-language)
  ipcMain.handle('app:get-theme', (): UiTheme => currentTheme())

  ipcMain.handle(HOME_CHANNELS.setTheme, (_event, theme: unknown) => {
    if (theme !== 'light' && theme !== 'dark' && theme !== 'system') return
    if (theme === currentTheme()) return
    cachedTheme = theme
    writeAppSetting(APP_SETTINGS_PATH(), 'theme', theme)
    nativeTheme.themeSource = theme
    refreshTitleBarOverlay()
    notifyQuickLookLangOrThemeChanged()
    for (const wc of webContents.getAllWebContents()) wc.send('app:theme-changed', theme)
  })

  ipcMain.handle(HOME_CHANNELS.getDocumentTheme, (): DocTheme => currentDocTheme())
  // editor tabs ask via the app-wide channel (symmetric with app:get-theme)
  ipcMain.handle('app:get-document-theme', (): DocTheme => currentDocTheme())

  ipcMain.handle(HOME_CHANNELS.setDocumentTheme, (_event, theme: unknown) => {
    if (theme !== 'light' && theme !== 'dark' && theme !== 'follow') return
    if (theme === currentDocTheme()) return
    cachedDocTheme = theme
    writeAppSetting(APP_SETTINGS_PATH(), 'documentTheme', theme)
    // the native theme is untouched — only the editors' canvas/paper follows this
    for (const wc of webContents.getAllWebContents()) wc.send('app:document-theme-changed', theme)
  })

  ipcMain.handle(HOME_CHANNELS.getAutoSaveDefault, (): AutoSaveDefault => currentAutoSaveDefault())
  ipcMain.handle('app:get-auto-save-default', (): AutoSaveDefault => currentAutoSaveDefault())

  ipcMain.handle(HOME_CHANNELS.setAutoSaveDefault, (_event, on: unknown) => {
    if (typeof on !== 'boolean') return
    if (on === currentAutoSaveDefault().on) return
    const next: AutoSaveDefault = { on, updatedAt: Date.now() }
    cachedAutoSaveDefault = next
    writeAppSettings(APP_SETTINGS_PATH(), {
      autoSaveDefault: next.on,
      autoSaveDefaultUpdatedAt: next.updatedAt,
    })
    for (const wc of webContents.getAllWebContents()) wc.send('app:auto-save-default-changed', next)
  })

  ipcMain.handle(HOME_CHANNELS.getMcpStatus, () => mcpStatus())

  ipcMain.handle(HOME_CHANNELS.setMcpSettings, async (_event, patch: unknown) => {
    if (!patch || typeof patch !== 'object') return mcpStatus()
    const request = patch as {
      enabled?: unknown
      port?: unknown
      background?: unknown
      logging?: unknown
    }
    const current = currentMcpSettings()
    const enabled = typeof request.enabled === 'boolean' ? request.enabled : current.enabled
    const port =
      typeof request.port === 'number' &&
      Number.isInteger(request.port) &&
      request.port > 0 &&
      request.port < 65536
        ? request.port
        : current.port
    const background =
      typeof request.background === 'boolean' ? request.background : current.background
    const logging = typeof request.logging === 'boolean' ? request.logging : current.logging
    writeAppSettings(APP_SETTINGS_PATH(), {
      mcpEnabled: enabled,
      mcpPort: port,
      mcpBackground: background,
      mcpLogging: logging,
    })
    try {
      return await applyMcpSettings({ enabled, port, background, logging })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ...mcpStatus(), error: message }
    }
  })

  ipcMain.handle(HOME_CHANNELS.getMcpLogs, () => getMcpRecentLogs())

  ipcMain.handle(HOME_CHANNELS.clearMcpLogs, () => {
    clearMcpLogs()
  })

  ipcMain.handle(HOME_CHANNELS.openMcpLogFile, () => {
    revealMcpLogFile()
    const logPath = mcpLogFilePath()
    if (logPath) shell.showItemInFolder(logPath)
  })

  ipcMain.handle(HOME_CHANNELS.getAiPanelPrefs, (): AiPanelPrefs => currentAiPanelPrefs())
  ipcMain.handle('app:get-ai-panel-prefs', (): AiPanelPrefs => currentAiPanelPrefs())

  const setAiPanelPrefs = (patch: unknown): AiPanelPrefs => {
    const prev = currentAiPanelPrefs()
    const raw =
      patch !== null && typeof patch === 'object' ? (patch as Record<string, unknown>) : {}
    // unknown/malformed fields fall back to the previous value, not the default
    const next = normalizeAiPanelPrefs({
      side: raw.side === 'left' || raw.side === 'right' ? raw.side : prev.side,
      fontSize: 'fontSize' in raw ? raw.fontSize : prev.fontSize,
      customFontSize: 'customFontSize' in raw ? raw.customFontSize : prev.customFontSize,
      spellcheck: 'spellcheck' in raw ? raw.spellcheck : prev.spellcheck,
      openInNewDocs: 'openInNewDocs' in raw ? raw.openInNewDocs : prev.openInNewDocs,
    })
    if (sameAiPanelPrefs(next, prev)) return prev
    cachedAiPanelPrefs = next
    writeAppSettings(APP_SETTINGS_PATH(), {
      aiPanelSide: next.side,
      aiPanelFontSize: next.fontSize,
      aiPanelCustomFontSize: next.customFontSize,
      aiPanelSpellcheck: next.spellcheck,
      aiPanelOpenInNewDocs: next.openInNewDocs,
    })
    for (const wc of webContents.getAllWebContents()) wc.send('app:ai-panel-prefs-changed', next)
    return next
  }
  ipcMain.handle(HOME_CHANNELS.setAiPanelPrefs, (_event, patch) => setAiPanelPrefs(patch))
  ipcMain.handle('app:set-ai-panel-prefs', (_event, patch) => setAiPanelPrefs(patch))

  // effective folder where new/untitled files land; the editor mains resolve
  // the same setting themselves (configuredDefaultSaveDir via docs' defaultSaveDir)
  // ── folder tree over the default save folder ──
  const folderErrors = (): FolderErrors => ({
    badArgs: tm('errBadArgs'),
    badName: tm('errBadName'),
    missing: tm('errMissing'),
    exists: tm('errExists'),
    failed: tm('errRenameFailed'),
  })
  const insideRoot = (path: unknown): path is string =>
    typeof path === 'string' && insideAnyRoot(path)
  const isRoot = (path: string) => isAnyRoot(path)

  ipcMain.handle(HOME_CHANNELS.folderRoots, (): FolderRoot[] => {
    // describeRoot creates a missing save folder, so its watcher has something to attach to
    const roots = [describeRoot(defaultSaveDir()), ...extraFolderRoots().map(describeExtraRoot)]
    ensureFolderWatchers()
    return roots
  })

  // an added folder joins the tree where it is: nothing on disk is created, copied or moved
  const addFolderRoot = (path: string): FolderRoot | null => {
    const extras = withExtraRoot(extraFolderRoots(), defaultSaveDir(), path)
    if (!extras) return null
    writeAppSetting(APP_SETTINGS_PATH(), FOLDER_ROOTS_KEY, extras)
    ensureFolderWatchers()
    fileIndexer?.refresh()
    return describeExtraRoot(path)
  }

  ipcMain.handle(HOME_CHANNELS.addFolderRoot, async (): Promise<FolderRoot | null> => {
    const result = await showOpenDialogWithMemory(dialog, shellWindow, {
      title: tm('dlgAddFolderRoot'),
      properties: ['openDirectory'],
    })
    const picked = result.filePaths[0]
    if (result.canceled || !picked) return null
    if (!describeExtraRoot(picked).readable) {
      showErrorDialog(shellWindow, tm('errFolderRootUnusable'), picked)
      return null
    }
    return addFolderRoot(picked)
  })

  ipcMain.handle(HOME_CHANNELS.dropFolderRoots, (_event, paths: unknown): FolderRoot[] => {
    const added: FolderRoot[] = []
    const files: string[] = []
    for (const path of stringPaths(paths)) {
      if (!describeExtraRoot(path).readable) {
        files.push(path)
        continue
      }
      const root = addFolderRoot(path)
      if (root) added.push(root)
    }
    if (files.length > 0) handleDroppedFiles(files, droppedFilesDeps())
    return added
  })

  ipcMain.handle(HOME_CHANNELS.removeFolderRoot, (_event, path: unknown) => {
    if (typeof path !== 'string') return
    const extras = withoutExtraRoot(extraFolderRoots(), path)
    writeAppSetting(APP_SETTINGS_PATH(), FOLDER_ROOTS_KEY, extras)
    ensureFolderWatchers()
    fileIndexer?.refresh()
  })

  ipcMain.handle(HOME_CHANNELS.listFolder, (_event, dir: unknown): FolderListing => {
    if (!insideRoot(dir)) return { dir: String(dir), folders: [], files: [] }
    return listFolder(dir, new Set(readStarredFiles()))
  })

  ipcMain.handle(
    HOME_CHANNELS.createFolder,
    (_event, parent: unknown, name: unknown): RenameResult => {
      if (!insideRoot(parent) || typeof name !== 'string')
        return { ok: false, error: tm('errBadArgs') }
      return createFolder(parent, name, folderErrors())
    },
  )

  ipcMain.handle(
    HOME_CHANNELS.renameFolder,
    (_event, dir: unknown, newName: unknown): RenameResult => {
      if (!insideRoot(dir) || isRoot(dir) || typeof newName !== 'string')
        return { ok: false, error: tm('errBadArgs') }
      const filesBefore = trackedFilesUnder(dir)
      const result = renameFolder(dir, newName, folderErrors())
      if (result.ok && result.path && result.path !== dir) {
        afterFolderMoved(dir, result.path, filesBefore)
      }
      return result
    },
  )

  ipcMain.handle(
    HOME_CHANNELS.movePaths,
    async (_event, paths: unknown, targetDir: unknown, policy: unknown): Promise<MoveResult> => {
      const list = stringPaths(paths)
      if (!insideRoot(targetDir)) {
        const error = tm('errBadArgs')
        return { moved: [], conflicts: [], failed: list.map((path) => ({ path, error })) }
      }
      const conflictPolicy: MoveConflictPolicy =
        policy === 'replace' || policy === 'keepBoth' || policy === 'skip' ? policy : 'ask'
      const isDir = (p: string) => {
        try {
          return statSync(p).isDirectory()
        } catch {
          return false
        }
      }
      // files may come from anywhere the UI can show (the Recent list); folders only from inside the tree, never a root itself
      const moveSources = { ...fileTargetSources(), isDirectory: isDir, isAnyRoot }
      const sources = list.filter((p) => isMoveSource(p, moveSources))
      const dirFiles = new Map(sources.filter(isDir).map((p) => [p, trackedFilesUnder(p)]))
      // 'replace' must not destroy data: the displaced target goes to the trash,
      // and everything keyed on its path (recents, stars, chat history) leaves
      // with it so the incoming file does not inherit another document's record
      const displaced: string[] = []
      const result = movePathsInto(sources, targetDir, conflictPolicy, folderErrors(), {
        replaceExisting: (path) => {
          const parked = join(dirname(path), `.genoffice-replaced-${Date.now()}-${basename(path)}`)
          const files = isDir(path) ? trackedFilesUnder(path) : [path]
          renameSync(path, parked)
          return {
            commit: () => {
              displaced.push(parked)
              removeRecentFiles(files)
              removeStarredFiles(files)
              for (const file of files) projectFileRenamed(file, rebasePath(file, path, parked))
            },
            rollback: () => renameSync(parked, path),
          }
        },
      })
      for (const parked of displaced) {
        try {
          await shell.trashItem(parked)
        } catch {
          rmSync(parked, { recursive: true, force: true })
        }
      }
      for (const { from, to } of result.moved) {
        const files = dirFiles.get(from)
        if (files) afterFolderMoved(from, to, files)
        else afterFileMoved(from, to)
      }
      return result
    },
  )

  ipcMain.handle(HOME_CHANNELS.deleteFolder, async (_event, dir: unknown) => {
    if (!insideRoot(dir) || isRoot(dir)) return
    const files = trackedFilesUnder(dir)
    try {
      await shell.trashItem(dir)
    } catch {
      return
    }
    removeRecentFiles(files)
    removeStarredFiles(files)
  })

  ipcMain.handle(HOME_CHANNELS.getDefaultSaveDir, (): string => defaultSaveDir())

  const defaultApp = createDefaultAppService({
    platform: process.platform,
    packaged: app.isPackaged,
    exePath: app.getPath('exe'),
    run: execFileRunner,
    openExternal: (url) => shell.openExternal(url),
  })
  ipcMain.handle(HOME_CHANNELS.getDefaultAppStatus, () => defaultApp.status())
  ipcMain.handle(HOME_CHANNELS.setDefaultApp, () => defaultApp.set())

  ipcMain.handle(HOME_CHANNELS.pickDefaultSaveDir, async (): Promise<string | null> => {
    const result = await showOpenDialogWithMemory(dialog, shellWindow, {
      title: tm('dlgPickSaveDir'),
      defaultPath: defaultSaveDir(),
      properties: ['openDirectory', 'createDirectory'],
    })
    const picked = result.filePaths[0]
    if (result.canceled || !picked) return null
    if (!isUsableSaveDir(picked)) {
      showErrorDialog(shellWindow, tm('errSaveDirUnusable'), picked)
      return null
    }
    writeAppSetting(APP_SETTINGS_PATH(), DEFAULT_SAVE_DIR_KEY, picked)
    ensureFolderWatchers()
    return picked
  })

  ipcMain.handle(HOME_CHANNELS.openGitHubRepo, () => {
    shell.openExternal(GITHUB_REPO_URL).catch(() => {
      // no browser handler available; nothing actionable for the user here
    })
  })

  ipcMain.handle(HOME_CHANNELS.openFeedbackSurvey, () => {
    void openFeedbackSurvey()
  })

  ipcMain.handle(HOME_CHANNELS.openLicenseNotices, () => {
    void openThirdPartyNotices()
  })

  ipcMain.handle(HOME_CHANNELS.openRightsContact, () => {
    const url = safeExternalUrl(`mailto:${PRODUCT_CONTACT_EMAIL}`, {
      allowedProtocols: ['mailto:'],
    })
    if (!url) return
    shell.openExternal(url).catch(() => {
      // no mail handler registered; the address is shown in Settings to copy by hand
    })
  })

  // the page is the vendor's fixed install guide; the renderer only names the provider
  ipcMain.handle(SHELL_SUBSCRIPTION_CHANNELS.openInstallHelp, (_event, provider: unknown) => {
    if (!isSubscriptionProviderId(provider)) return
    const url = safeExternalUrl(SUBSCRIPTION_INSTALL_URLS[provider])
    if (!url) return
    shell.openExternal(url).catch(() => {
      // no browser handler available; nothing actionable for the user here
    })
  })
}

function stringPaths(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((p): p is string => typeof p === 'string') : []
}

// electron-vite emits ?asset files under hashed names, which breaks nativeImage's
// automatic `@2x` sibling lookup — attach the retina representation by hand
function loadMenuIcon(path1x: string, path2x: string): NativeImage {
  const icon = nativeImage.createFromPath(path1x)
  icon.addRepresentation({ scaleFactor: 2, buffer: readFileSync(path2x) })
  return icon
}

// loaded once, not on every menu open
interface MenuIconSet {
  docx: NativeImage
  xlsx: NativeImage
  pptx: NativeImage
  pdf: NativeImage
  md: NativeImage
  html: NativeImage
  mindmap: NativeImage
  hwp: NativeImage
  home: NativeImage
}
let menuIconCache: MenuIconSet | null = null
function menuIcons(): MenuIconSet {
  menuIconCache ??= {
    docx: loadMenuIcon(menuDocxIcon1x, menuDocxIcon2x),
    xlsx: loadMenuIcon(menuXlsxIcon1x, menuXlsxIcon2x),
    pptx: loadMenuIcon(menuPptxIcon1x, menuPptxIcon2x),
    pdf: loadMenuIcon(menuPdfIcon1x, menuPdfIcon2x),
    md: loadMenuIcon(menuMdIcon1x, menuMdIcon2x),
    html: loadMenuIcon(menuHtmlIcon1x, menuHtmlIcon2x),
    mindmap: loadMenuIcon(menuMindmapIcon1x, menuMindmapIcon2x),
    hwp: loadMenuIcon(menuHwpIcon1x, menuHwpIcon2x),
    home: loadMenuIcon(menuHomeIcon1x, menuHomeIcon2x),
  }
  return menuIconCache
}

const TAB_MENU_ICON: Record<TabKind, keyof MenuIconSet> = {
  home: 'home',
  docs: 'docx',
  sheets: 'xlsx',
  slides: 'pptx',
  pdf: 'pdf',
  markdown: 'md',
  html: 'html',
  mindmap: 'mindmap',
  hwp: 'hwp',
  help: 'home',
}

// tab views see neither DOM events nor a focus change when the user clicks the
// shell chrome — relay the press so open popovers in documents can dismiss.
// The pressed document must be excluded: it already dismissed (or is opening)
// its own popovers via its local pointerdown listeners, and the async IPC
// round-trip would otherwise close a popover that very press just opened
// (home row menus died this way: pointerdown → broadcast → menu unmounts
// before the click event ever reached the menu item).
function broadcastChromePressed(exclude?: WebContents): void {
  for (const wc of webContents.getAllWebContents()) {
    if (wc !== exclude) wc.send('app:chrome-pressed')
  }
}

/** the shell's tab manager, recreating the shell window when a detached editor outlived it */
function ensureTabManager(): TabManager {
  if (!tabManager) createShellWindow()
  if (!tabManager) throw new Error('the shell window could not be created')
  return tabManager
}

/** "Open in New Window": reparent the tab's live view into a detached editor
 *  window — the document moves as-is, unsaved edits included. */
function detachTabToWindow(id: string): void {
  if (!tabManager) return
  const record = tabManager.detachTab(id)
  if (!record) return
  clearPaneRole(record)
  const win = createDetachedEditorWindow({ ...record, applyMenuFor })
  win.focus()
}

/** Tear-off: the tab leaves the strip for a window created under the held
 *  pointer at (x, y); the strip keeps steering it until release. */
function tearOffTabToWindow(id: string, x: number, y: number): boolean {
  if (!tabManager || isTearingOff() || !tabManager.canDetachTab(id)) return false
  const record = tabManager.detachTab(id)
  if (!record) return false
  clearPaneRole(record)
  createDetachedEditorWindow({ ...record, applyMenuFor, tearOffAt: { x, y } })
  return true
}

/**
 * A view leaving the strip (detached window or tear-off) is out of any split:
 * the split-change broadcast no longer reaches it, so its last pane role must
 * be withdrawn here or its AI panel would stay rail-collapsed in a window
 * that has no panes.
 */
function clearPaneRole(record: DetachedTab): void {
  if (!record.view.webContents.isDestroyed()) {
    record.view.webContents.send(SPLIT_PANE_CHANNELS.roleChanged, null)
  }
}

/** insertion slot the shell strip reported for the current dock preview */
let lastDockIndex: number | undefined

// ---- two-pane split wiring (decision 0037) ----

/** What a tab tear-off drag remembers about the split drop zones. Captured
 *  before tearOffTabToWindow: detaching a pane tab drops the split, so this is
 *  the only memory of the arrangement the drag started from. */
interface TornSplitDrag {
  tabId: string
  filePath?: string
  splitAtStart: SplitViewState | null
}

let tornSplitDrag: TornSplitDrag | null = null
/** the intent a release at the current drop zone would apply (null: none) */
let tornSplitDrop: SplitDropIntent | null = null
/** the last hint sent to the strip, so identical frames are not re-sent */
let lastSplitHint: SplitHint | null = null

function sameSplitHint(a: SplitHint | null, b: SplitHint | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height &&
    a.orientation === b.orientation
  )
}

/** push the drop-hint rectangle (or its removal) to the strip webContents */
function sendSplitHint(hint: SplitHint | null): void {
  if (sameSplitHint(hint, lastSplitHint)) return
  lastSplitHint = hint
  if (!shellWindow || shellWindow.isDestroyed()) return
  shellWindow.webContents.send(SPLIT_TABS_CHANNELS.hint, hint)
}

/** The pane whose document is the one a menu or a drag is about: the same tab
 *  id, or a copy of the same canonical file. */
function splitPaneOfDocument(
  manager: TabManager,
  split: Pick<SplitViewState, 'aTabId' | 'bTabId'> | null,
  dragged: { tabId: string; filePath?: string },
): 'a' | 'b' | null {
  if (!split) return null
  const tabs = manager.list()
  const wanted = canonicalPath(dragged.filePath)
  for (const side of ['a', 'b'] as const) {
    const paneId = side === 'a' ? split.aTabId : split.bTabId
    if (paneId === dragged.tabId) return side
    const pane = tabs.find((t) => t.id === paneId)
    if (
      wanted !== undefined &&
      pane?.filePath !== undefined &&
      canonicalPath(pane.filePath) === wanted
    ) {
      return side
    }
  }
  return null
}

/** the split-drop context of a tab tear-off (null: not a document tab) */
function tearOffSplitContext(id: string): TornSplitDrag | null {
  const manager = tabManager
  if (!manager || !manager.canDetachTab(id)) return null
  const tab = manager.list().find((t) => t.id === id)
  if (!tab || tab.kind === 'home' || tab.kind === 'help') return null
  return { tabId: id, filePath: tab.filePath, splitAtStart: manager.splitState() }
}

/**
 * While the pointer is held: decide the zone under it from the drag start's
 * arrangement and push the hint. The pointer arrives in screen coordinates
 * (the strip sends pointer positions); the panes live in the window's content
 * area below the strip.
 */
function updateSplitHint(screenX: number, screenY: number): void {
  const drag = tornSplitDrag
  const manager = tabManager
  if (!drag || !manager || !shellWindow || shellWindow.isDestroyed()) return
  const bounds = shellWindow.getContentBounds()
  const zone = splitDropZone(screenX - bounds.x, screenY - bounds.y, bounds.width, bounds.height)
  if (!zone) {
    tornSplitDrop = null
    sendSplitHint(null)
    return
  }
  // a pane tab's tear-off already dropped the split, so the decision reads the
  // arrangement captured at drag start; a strip tab reads the live one
  const paneAtStart =
    drag.splitAtStart !== null &&
    (drag.splitAtStart.aTabId === drag.tabId || drag.splitAtStart.bTabId === drag.tabId)
  const split = paneAtStart ? drag.splitAtStart : manager.splitState()
  tornSplitDrop = decideSplitDrop({
    split,
    dragged: {
      isDocument: true,
      isPaneTab: paneAtStart,
      docPane: splitPaneOfDocument(manager, split, drag),
    },
    dropped: zone,
  })
  // the hint marks the b-side pane the drop would land in — the same window
  // content coordinates the pane views are laid out in (bounding the space
  // below the strip, like TabManager.contentBounds)
  const rects = paneRects(
    {
      x: 0,
      y: TAB_STRIP_HEIGHT,
      width: bounds.width,
      height: Math.max(0, bounds.height - TAB_STRIP_HEIGHT),
    },
    zone,
    split?.ratio ?? SPLIT_EVEN_RATIO,
  )
  sendSplitHint({
    left: rects.b.x,
    top: rects.b.y,
    width: rects.b.width,
    height: rects.b.height,
    orientation: zone,
  })
}

/**
 * A released tear-off whose last pointer position was over a split edge: take
 * the torn tab back (its window is destroyed), re-attach it without activating
 * and realize the decided intent. False leaves everything to the normal
 * dock / detached-window flow.
 */
function applyTornSplitDrop(): boolean {
  const drag = tornSplitDrag
  const intent = tornSplitDrop
  if (!drag || !intent) {
    tornSplitDrag = null
    tornSplitDrop = null
    sendSplitHint(null)
    return false
  }
  const record = takeTornTab()
  tornSplitDrag = null
  tornSplitDrop = null
  sendSplitHint(null)
  if (!record) return false
  const manager = ensureTabManager()
  const newTabId = manager.attachTab(record, undefined, false)
  applyTornIntent(manager, newTabId, intent, drag)
  return true
}

/** Realize the drop: splitWith covers create/replace/reorient/focus; a pane
 *  tab flips the orientation or restores the split it was torn out of. */
function applyTornIntent(
  manager: TabManager,
  newTabId: string,
  intent: SplitDropIntent,
  drag: TornSplitDrag,
): void {
  if (intent.kind === 'flip' || intent.kind === 'noop') {
    const start = drag.splitAtStart
    if (!start) {
      manager.activateTab(newTabId)
      return
    }
    manager.beginSplit(
      start.aTabId === drag.tabId ? newTabId : start.aTabId,
      start.bTabId === drag.tabId ? newTabId : start.bTabId,
      intent.kind === 'flip' ? intent.orientation : start.orientation,
      start.ratio,
      start.focus,
    )
    return
  }
  manager.splitWith(newTabId, intent)
}

/** last split state pushed through handleSplitChanged (for ratio-only detection) */
let lastSplitState: SplitViewState | null = null
let splitMemoryTimer: ReturnType<typeof setTimeout> | null = null

/** the parts of a split a pane role depends on; the divider only moves ratio */
function splitShape(state: SplitViewState | null): string {
  return state === null
    ? 'none'
    : `${state.aTabId}|${state.bTabId}|${state.orientation}|${state.focus}`
}

/** one split change: tell every pane view its role, push the state to the strip,
 *  and remember the arrangement. A divider drag changes only the ratio, so its
 *  memory write is debounced (roles and tabs never change mid-drag, and a
 *  per-frame settings rewrite would fsync on every pointer move). */
function handleSplitChanged(
  win: BrowserWindow,
  manager: TabManager,
  state: SplitViewState | null,
): void {
  const ratioOnly =
    state !== null && lastSplitState !== null && splitShape(state) === splitShape(lastSplitState)
  lastSplitState = state
  if (!ratioOnly) notifySplitRoles(manager)
  if (!win.isDestroyed()) win.webContents.send(SPLIT_TABS_CHANNELS.changed, state)
  if (splitMemoryTimer) {
    clearTimeout(splitMemoryTimer)
    splitMemoryTimer = null
  }
  if (ratioOnly) {
    splitMemoryTimer = setTimeout(() => {
      splitMemoryTimer = null
      // the window may have closed mid-drag; its manager must not write
      if (tabManager !== manager) return
      persistSplitMemory(manager, lastSplitState)
    }, 400)
  } else {
    persistSplitMemory(manager, state)
  }
}

/** save the split, or clear the memory when it is gone; best-effort */
function persistSplitMemory(manager: TabManager, state: SplitViewState | null): void {
  try {
    if (state === null) {
      writeSplitMemory(null, { settingsPath: APP_SETTINGS_PATH })
      return
    }
    const tabs = new Map(manager.list().map((tab) => [tab.id, tab]))
    writeSplitMemory(
      {
        aTabIdPath: tabs.get(state.aTabId)?.filePath,
        bTabIdPath: tabs.get(state.bTabId)?.filePath,
        orientation: state.orientation,
        ratio: state.ratio,
        focus: state.focus,
      },
      { settingsPath: APP_SETTINGS_PATH },
    )
  } catch {
    // the memory is best-effort: a failed write never disturbs the split
  }
}

/** push the current pane role to every tab view (null = not in a split) */
function notifySplitRoles(manager: TabManager): void {
  for (const tab of manager.list()) {
    const wc = manager.webContentsForTab(tab.id)
    if (!wc || wc.isDestroyed()) continue
    wc.send(SPLIT_PANE_CHANNELS.roleChanged, manager.splitRoleOf(wc.id))
  }
}

/**
 * A launch with no file argument: reopen the remembered arrangement when its
 * documents are still on disk, else the home screen as always. A remembered
 * path that is gone is skipped — one remaining document opens alone, both gone
 * falls back to home. The memory is left untouched: the next split change
 * rewrites it.
 */
function restoreSplitMemoryOrHome(): void {
  const manager = ensureTabManager()
  const memory = readRememberedSplit()
  const aPath = fileOnDisk(memory?.a)
  const bPath = fileOnDisk(memory?.b)
  if (aPath === undefined && bPath === undefined) {
    manager.openHomeTab()
    return
  }
  const orientation = memory?.orientation ?? 'side'
  const ratio = memory?.ratio ?? SPLIT_EVEN_RATIO
  const focus = memory?.focus ?? 'b'
  // both panes held the same file: one tab, duplicated for the second pane
  if (aPath !== undefined && bPath !== undefined && canonicalPath(aPath) === canonicalPath(bPath)) {
    const aTabId = openRememberedTab(aPath)
    if (aTabId === undefined) {
      manager.openHomeTab()
      return
    }
    const bTabId = manager.openDuplicatePaneTab(aTabId)
    if (bTabId === null) return
    manager.beginSplit(aTabId, bTabId, orientation, ratio, focus)
    return
  }
  const aTabId = openRememberedTab(aPath)
  const bTabId = openRememberedTab(bPath)
  if (aTabId === undefined && bTabId === undefined) {
    manager.openHomeTab()
    return
  }
  if (aTabId !== undefined && bTabId !== undefined) {
    manager.beginSplit(aTabId, bTabId, orientation, ratio, focus)
  }
}

/** the remembered arrangement, or null when there is none to trust */
function readRememberedSplit(): SplitMemory | null {
  try {
    return readSplitMemory({ settingsPath: APP_SETTINGS_PATH })
  } catch {
    return null
  }
}

/** route one remembered path into its editor tab; the landed tab's id */
function openRememberedTab(path: string | undefined): string | undefined {
  if (path === undefined) return undefined
  routeDocumentPath(path)
  return tabManager?.findTabByPath(path)?.id
}

/** the path when it names a file on disk right now */
function fileOnDisk(path: string | undefined): string | undefined {
  if (path === undefined) return undefined
  try {
    return existsSync(path) ? path : undefined
  } catch {
    return undefined
  }
}

/** Menu-command target for the editors whose menus resolve through the shell
 *  (pdf / markdown / html): the focused detached window of that kind first,
 *  else the shell's active tab of that kind. */
function activeEditorTarget(
  kind: TabKind,
  fromTabs: () => { id: string; webContents: WebContents; filePath?: string } | undefined,
): { id: string; webContents: WebContents; filePath?: string } | undefined {
  const detachedTab = focusedDetachedTab()
  if (detachedTab?.kind === kind) return detachedTab
  return fromTabs()
}
function activePdfTarget() {
  return activeEditorTarget('pdf', () => tabManager?.activePdfTab())
}

/** ⌘W / File > Close targets the focused window: a detached editor closes
 *  itself (its own unsaved-changes guard runs), otherwise the shell's active tab
 *  — the same rule the docs / sheets / slides close hooks follow */
function closeFocusedEditor(): void {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && focused !== shellWindow && isDetachedEditorWindow(focused)) focused.close()
  else tabManager?.closeActiveTab()
}

/** the window a pdf command's dialogs and progress belong to: the detached
 *  editor hosting the tab when there is one, else the shell */
function pdfHostWindow(tab: { webContents: WebContents } | undefined): BrowserWindow | null {
  if (!tab) return null
  return detachedWindowForWebContents(tab.webContents.id) ?? shellWindow
}
function activeMarkdownTarget() {
  return activeEditorTarget('markdown', () => tabManager?.activeMarkdownTab())
}
function activeHtmlTarget() {
  return activeEditorTarget('html', () => tabManager?.activeHtmlTab())
}
function activeMindmapTarget() {
  return activeEditorTarget('mindmap', () => tabManager?.activeMindmapTab())
}

/** the document a kind's File menu acts on, for the provenance entries (spec 8.2, 9) */
function linkedDocumentFor(kind: TabKind): LinkedDocument | undefined {
  const target =
    kind === 'html'
      ? activeHtmlTarget()
      : activeEditorTarget(kind, () => {
          const tab = tabManager?.list().find((t) => t.active && t.kind === kind)
          const wc = tab ? tabManager?.webContentsForTab(tab.id) : undefined
          return tab && wc ? { id: tab.id, webContents: wc } : undefined
        })
  return target ? linkedDocumentForWebContents(target.webContents) : undefined
}

/** the document behind a webContents: a shell tab, or the focused detached window */
function linkedDocumentForWebContents(wc: WebContents): LinkedDocument | undefined {
  if (wc.isDestroyed()) return undefined
  const inTab = tabManager?.describeWebContents(wc.id)
  if (inTab) {
    return {
      webContents: wc,
      title: inTab.title,
      ...(inTab.filePath ? { filePath: inTab.filePath } : {}),
    }
  }
  const detached = focusedDetachedTab()
  if (detached?.webContents.id !== wc.id) return undefined
  return {
    webContents: wc,
    title: detached.window.getTitle(),
    ...(detached.filePath ? { filePath: detached.filePath } : {}),
  }
}

/** whose menu is the application menu: the focused detached window's, else the active tab's */
function linkMenuKind(): TabKind | undefined {
  const detached = focusedDetachedTab()
  if (detached) return detached.kind
  const active = tabManager?.list().find((t) => t.active)
  // a Present tab shows the Home menu
  if (active?.kind === 'html' && !tabManager?.activeHtmlTab()) return 'home'
  return active?.kind
}
function activeHwpTarget() {
  return activeEditorTarget('hwp', () => tabManager?.activeHwpTab())
}

/**
 * Split-view IPC: the strip's split state and divider channels, the editors'
 * pane-role bridge (packages/electron-utils/src/split-pane-bridge.ts), and the
 * same-document save probe the editors consult before writing.
 */
function registerSplitIpc(): void {
  ipcMain.handle(SPLIT_TABS_CHANNELS.get, () => tabManager?.splitState() ?? null)
  ipcMain.on(SPLIT_TABS_CHANNELS.setRatio, (_event, ratio: unknown) => {
    if (typeof ratio === 'number' && Number.isFinite(ratio)) tabManager?.setSplitRatio(ratio)
  })
  ipcMain.handle(
    SPLIT_PANE_CHANNELS.getRole,
    (event) => tabManager?.splitRoleOf(event.sender.id) ?? null,
  )
  ipcMain.on(SPLIT_PANE_CHANNELS.requestFocus, (event) =>
    tabManager?.focusPaneByWebContents(event.sender.id),
  )
  ipcMain.on(SPLIT_PANE_CHANNELS.reportFocus, (event) =>
    tabManager?.focusPaneByWebContents(event.sender.id),
  )
  // Same-document save guard: the editors ask whether the path is open in
  // another copy (another pane or detached window). One copy alone never
  // counts — a normal save behaves exactly as before.
  setOpenPathProbe((path) => {
    try {
      const wanted = canonicalPath(path)
      if (wanted === undefined) return false
      let copies = 0
      for (const tab of tabManager?.list() ?? []) {
        if (tab.filePath !== undefined && canonicalPath(tab.filePath) === wanted) copies++
      }
      for (const openPath of detachedFilePaths()) {
        if (canonicalPath(openPath) === wanted) copies++
      }
      return copies > 1
    } catch {
      return false
    }
  })
}

function registerTabsIpc(): void {
  ipcMain.on(TABS_CHANNELS.chromePressed, (event) => broadcastChromePressed(event.sender))
  ipcMain.handle(TABS_CHANNELS.list, () => tabManager?.list() ?? [])
  ipcMain.handle(TABS_CHANNELS.activate, (_event, id: unknown) => {
    if (typeof id !== 'string' || !id) return
    tabManager?.activateTab(id)
  })
  ipcMain.handle(TABS_CHANNELS.close, (_event, id: unknown) => {
    if (typeof id !== 'string' || !id) return
    return tabManager?.closeTab(id)
  })
  ipcMain.handle(TABS_CHANNELS.reorder, (_event, id: string, toIndex: number) => {
    if (typeof id === 'string' && Number.isInteger(toIndex)) tabManager?.reorderTab(id, toIndex)
  })
  // "all tabs" overflow menu — native popup because the editors' WebContentsView
  // would cover any DOM dropdown the shell renderer draws below the tab strip
  ipcMain.handle(TABS_CHANNELS.showAppMenu, (_event, x: unknown, y: unknown) => {
    if (!shellWindow) return
    Menu.getApplicationMenu()?.popup({
      window: shellWindow,
      ...(typeof x === 'number' && typeof y === 'number'
        ? { x: Math.round(x), y: Math.round(y) }
        : {}),
    })
  })
  ipcMain.handle(TABS_CHANNELS.showMenu, (_event, x: unknown, y: unknown) => {
    if (!tabManager || !shellWindow) return
    const menu = Menu.buildFromTemplate(
      tabManager.list().map((tab) => ({
        label: tab.title,
        type: 'checkbox' as const,
        checked: tab.active,
        icon: menuIcons()[TAB_MENU_ICON[tab.kind]],
        click: () => tabManager?.activateTab(tab.id),
      })),
    )
    menu.popup({
      window: shellWindow,
      ...(typeof x === 'number' && typeof y === 'number'
        ? { x: Math.round(x), y: Math.round(y) }
        : {}),
    })
  })
  ipcMain.handle(TABS_CHANNELS.detach, (_event, id: unknown) => {
    if (typeof id !== 'string' || !tabManager?.canDetachTab(id)) return
    detachTabToWindow(id)
  })
  // drag-to-tear-off: the strip drives the window until the pointer lifts
  ipcMain.handle(TABS_CHANNELS.tearOff, (_event, id: unknown, x: unknown, y: unknown) => {
    if (typeof id !== 'string' || typeof x !== 'number' || typeof y !== 'number') return false
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    // remember what the drag started from before the tab leaves the strip:
    // tearing a pane tab out drops the split, so this is the only record
    tornSplitDrag = tearOffSplitContext(id)
    tornSplitDrop = null
    lastSplitHint = null
    const torn = tearOffTabToWindow(id, x, y)
    if (!torn) tornSplitDrag = null
    return torn
  })
  ipcMain.on(TABS_CHANNELS.dragTornWindow, (_event, x: unknown, y: unknown) => {
    if (
      typeof x === 'number' &&
      typeof y === 'number' &&
      Number.isFinite(x) &&
      Number.isFinite(y)
    ) {
      dragTornWindow(x, y)
      updateSplitHint(x, y)
    }
  })
  ipcMain.handle(TABS_CHANNELS.dockTornWindow, (_event, index: unknown) => {
    if (applyTornSplitDrop()) return
    const tab = takeTornTab()
    if (!tab) return
    ensureTabManager().attachTab(tab, typeof index === 'number' ? index : undefined)
  })
  ipcMain.handle(TABS_CHANNELS.endTornDrag, () => {
    if (applyTornSplitDrop()) return
    endTornDrag()
  })
  ipcMain.on(TABS_CHANNELS.dockIndex, (_event, index: unknown) => {
    lastDockIndex = typeof index === 'number' && Number.isInteger(index) ? index : undefined
  })
  // per-tab context menu — native for the same reason as the tab list above
  ipcMain.handle(TABS_CHANNELS.showTabMenu, (_event, id: unknown, x: unknown, y: unknown) => {
    if (!tabManager || !shellWindow || typeof id !== 'string') return
    const tab = tabManager.list().find((t) => t.id === id)
    if (!tab || tab.kind === 'home') return
    const template: MenuItemConstructorOptions[] = []
    // every document tab except a chrome-free Present tab (a live preview of
    // another tab's document — it has nothing of its own to move)
    if (tabManager.canDetachTab(id)) {
      template.push({
        label: tm('menuOpenInNewWindow'),
        click: () => detachTabToWindow(id),
      })
      template.push({ type: 'separator' })
    }
    // split-view entries: document tabs only (Home returned above; the manual
    // and a chrome-free Present tab cannot be pane documents)
    if (tabManager.canDetachTab(id) && tab.kind !== 'help') {
      const applySplitMenu = (dropped: SplitOrientation): void => {
        if (!tabManager) return
        const intent = decideSplitDrop({
          split: tabManager.splitState(),
          dragged: {
            isDocument: true,
            isPaneTab: tabManager.isPaneTab(id),
            docPane: splitPaneOfDocument(tabManager, tabManager.splitState(), {
              tabId: id,
              filePath: tab.filePath,
            }),
          },
          dropped,
        })
        if (intent) tabManager.splitWith(id, intent)
      }
      template.push({ label: tm('menuSplitRight'), click: () => applySplitMenu('side') })
      template.push({ label: tm('menuSplitDown'), click: () => applySplitMenu('stack') })
      if (tabManager.isPaneTab(id)) {
        template.push({ label: tm('menuUnsplit'), click: () => tabManager?.unsplit() })
      }
      template.push({ type: 'separator' })
    }
    template.push({
      label: tm('menuClose'),
      enabled: tab.closable,
      click: () => void tabManager?.closeTab(id),
    })
    Menu.buildFromTemplate(template).popup({
      window: shellWindow,
      ...(typeof x === 'number' && typeof y === 'number'
        ? { x: Math.round(x), y: Math.round(y) }
        : {}),
    })
  })
  // "+" new-file menu — native for the same reason as the tab list above
  ipcMain.handle(TABS_CHANNELS.showNewMenu, (_event, x: unknown, y: unknown) => {
    if (!tabManager || !shellWindow) return
    const menu = Menu.buildFromTemplate([
      // enabled:false so pre-Sonoma macOS / Windows (no 'header' support) degrade
      // to an inert label instead of a clickable no-op item
      { label: tm('menuSectionNew'), type: 'header', enabled: false },
      {
        label: tm('menuNewDoc'),
        icon: menuIcons().docx,
        click: () => newDocTab(),
      },
      {
        label: tm('menuNewSheet'),
        icon: menuIcons().xlsx,
        click: () => void newSheetTab(),
      },
      {
        label: tm('menuNewSlide'),
        icon: menuIcons().pptx,
        click: () => newSlideTab(),
      },
      {
        label: tm('menuNewMarkdown'),
        icon: menuIcons().md,
        click: () => newMarkdownTab(),
      },
      {
        label: tm('menuNewHtml'),
        icon: menuIcons().html,
        click: () => newHtmlTab(),
      },
      {
        label: tm('menuNewMindmap'),
        icon: menuIcons().mindmap,
        click: () => newMindmapTab(),
      },
      {
        label: tm('menuNewHwp'),
        icon: menuIcons().hwp,
        click: () => newHwpTab(),
      },
      {
        label: tm('menuNewPdf'),
        icon: menuIcons().pdf,
        click: () => void newPdfTab(),
      },
      { type: 'separator' },
      { label: tm('menuOpen'), click: () => void openFileViaDialog() },
    ])
    menu.popup({
      window: shellWindow,
      ...(typeof x === 'number' && typeof y === 'number'
        ? { x: Math.round(x), y: Math.round(y) }
        : {}),
    })
  })
}

// ---- home menu ----

async function openFileViaDialog(): Promise<void> {
  const win = shellWindow ?? BrowserWindow.getFocusedWindow()
  if (!win) return
  const result = await showOpenDialogWithMemory(dialog, win, {
    filters: [{ name: tm('filterSupported'), extensions: OPEN_DIALOG_EXTENSIONS }],
    properties: ['openFile', 'multiSelections'],
  })
  if (!result.canceled) for (const path of result.filePaths) openDocumentPath(path)
}

function buildHomeMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: tm('menuFile'),
      submenu: [
        { label: tm('menuSectionNew'), type: 'header', enabled: false },
        {
          label: tm('menuNewDoc'),
          accelerator: 'CmdOrCtrl+N',
          click: () => newDocTab(),
        },
        {
          label: tm('menuNewSheet'),
          click: () => void newSheetTab(),
        },
        { label: tm('menuNewSlide'), click: () => newSlideTab() },
        { label: tm('menuNewMarkdown'), click: () => newMarkdownTab() },
        { label: tm('menuNewHtml'), click: () => newHtmlTab() },
        { label: tm('menuNewMindmap'), click: () => newMindmapTab() },
        { label: tm('menuNewHwp'), click: () => newHwpTab() },
        { label: tm('menuNewPdf'), click: () => void newPdfTab() },
        { type: 'separator' },
        {
          label: tm('menuOpen'),
          accelerator: 'CmdOrCtrl+O',
          click: () => void openFileViaDialog(),
        },
        { type: 'separator' },
        { role: 'close', label: tm('menuClose') },
      ],
    },
    editMenuTemplate(process.platform, appMenuLabels(currentLang())),
    windowMenuTemplate(process.platform, appMenuLabels(currentLang())),
    {
      role: 'help',
      label: tm('menuHelp'),
      submenu: [
        { label: tm('menuUserGuide'), accelerator: 'F1', click: () => tabManager?.openHelpTab() },
        { type: 'separator' },
        { label: tm('thirdPartyNotices'), click: () => void openThirdPartyNotices() },
        { type: 'separator' },
        checkUpdatesMenuItem(appMenuLabels(currentLang())),
        aboutMenuItem(appMenuLabels(currentLang())),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---- pdf menu (pdf-main has no menu of its own; the shell owns pdf tabs, so it builds one) ----

function buildPdfMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: tm('menuFile'),
      submenu: [
        {
          label: tm('menuOpen'),
          accelerator: 'CmdOrCtrl+O',
          click: () => void openFileViaDialog(),
        },
        { type: 'separator' },
        {
          label: tm('backToHome'),
          accelerator: 'Shift+CmdOrCtrl+H',
          click: () => tabManager?.openHomeTab(),
        },
        { type: 'separator' },
        {
          label: tm('menuSave'),
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            const tab = activePdfTarget()
            if (tab) void flushPdfSave(tab.webContents)
          },
        },
        {
          label: tm('menuSaveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => void savePdfAs(),
        },
        ...documentLinkFileMenuItems('pdf'),
        { type: 'separator' },
        // local pdf2docx (P4): in-process PDFium wasm, no cloud counterpart
        {
          label: tm('menuExportDocx'),
          click: () => void exportPdfAsDocxLocal(),
        },
        // local pdf2pptx (P25): one slide per page, no cloud counterpart
        {
          label: tm('menuExportPptx'),
          click: () => void exportPdfAsPptxLocal(),
        },
        // local pdf2xlsx (P26): one worksheet per page, no cloud counterpart
        {
          label: tm('menuExportXlsx'),
          click: () => void exportPdfAsXlsxLocal(),
        },
        // Markdown / EPUB: the pdf tab's conversion dialog (page range, save location, progress)
        {
          label: tm('menuExportMd'),
          click: () => requestPdfConvertDialog(activePdfTarget()?.webContents, 'md'),
        },
        {
          label: tm('menuExportEpub'),
          click: () => requestPdfConvertDialog(activePdfTarget()?.webContents, 'epub'),
        },
        { type: 'separator' },
        {
          label: tm('menuPrint'),
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            const tab = activePdfTarget()
            if (tab) sendPdfPrintRequest(tab.webContents)
          },
        },
        { type: 'separator' },
        {
          label: tm('menuClose'),
          accelerator: 'CmdOrCtrl+W',
          click: () => closeFocusedEditor(),
        },
      ],
    },
    editMenuTemplate(process.platform, appMenuLabels(currentLang())),
    windowMenuTemplate(process.platform, appMenuLabels(currentLang())),
    {
      role: 'help',
      label: tm('menuHelp'),
      submenu: [
        { label: tm('thirdPartyNotices'), click: () => void openThirdPartyNotices() },
        { type: 'separator' },
        checkUpdatesMenuItem(appMenuLabels(currentLang())),
        aboutMenuItem(appMenuLabels(currentLang())),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---- markdown menu (markdown-main has no menu of its own; the shell owns markdown tabs) ----

function buildMarkdownMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: tm('menuFile'),
      submenu: [
        {
          label: tm('menuOpen'),
          accelerator: 'CmdOrCtrl+O',
          click: () => void openFileViaDialog(),
        },
        { type: 'separator' },
        {
          label: tm('backToHome'),
          accelerator: 'Shift+CmdOrCtrl+H',
          click: () => tabManager?.openHomeTab(),
        },
        { type: 'separator' },
        {
          label: tm('menuSave'),
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            const tab = activeMarkdownTarget()
            if (tab) void requestMarkdownSave(tab.webContents, 'save')
          },
        },
        {
          label: tm('menuSaveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            const tab = activeMarkdownTarget()
            if (tab) void requestMarkdownSave(tab.webContents, 'saveAs')
          },
        },
        ...documentLinkFileMenuItems('markdown'),
        { type: 'separator' },
        {
          label: tm('menuExportDocx'),
          click: () => {
            const tab = activeMarkdownTarget()
            if (tab) sendMarkdownExportRequest(tab.webContents, 'docx')
          },
        },
        {
          label: tm('menuExportOdt'),
          click: () => {
            const tab = activeMarkdownTarget()
            if (tab) sendMarkdownExportRequest(tab.webContents, 'odt')
          },
        },
        {
          label: tm('menuExportPdf'),
          click: () => {
            const tab = activeMarkdownTarget()
            if (tab) sendMarkdownExportRequest(tab.webContents, 'pdf')
          },
        },
        {
          label: tm('menuExportImages'),
          click: () => {
            const tab = activeMarkdownTarget()
            if (tab) sendMarkdownExportRequest(tab.webContents, 'png')
          },
        },
        {
          label: tm('menuOpenInDocs'),
          click: () => {
            const tab = activeMarkdownTarget()
            if (tab) sendMarkdownExportRequest(tab.webContents, 'docs')
          },
        },
        { type: 'separator' },
        {
          label: tm('menuPrint'),
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            const tab = activeMarkdownTarget()
            if (tab) sendMarkdownPrintRequest(tab.webContents)
          },
        },
        { type: 'separator' },
        {
          label: tm('menuClose'),
          accelerator: 'CmdOrCtrl+W',
          click: () => closeFocusedEditor(),
        },
      ],
    },
    editMenuTemplate(process.platform, appMenuLabels(currentLang())),
    windowMenuTemplate(process.platform, appMenuLabels(currentLang())),
    {
      role: 'help',
      label: tm('menuHelp'),
      submenu: [
        { label: tm('thirdPartyNotices'), click: () => void openThirdPartyNotices() },
        { type: 'separator' },
        checkUpdatesMenuItem(appMenuLabels(currentLang())),
        aboutMenuItem(appMenuLabels(currentLang())),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---- hwp menu (hwp-main has no menu of its own; the shell owns hwp tabs) ----

function buildHwpMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: tm('menuFile'),
      submenu: [
        {
          label: tm('menuOpen'),
          accelerator: 'CmdOrCtrl+O',
          click: () => void openFileViaDialog(),
        },
        { type: 'separator' },
        {
          label: tm('backToHome'),
          accelerator: 'Shift+CmdOrCtrl+H',
          click: () => tabManager?.openHomeTab(),
        },
        { type: 'separator' },
        // no accelerators here: the embedded editor swallows Ctrl+S and Ctrl+P
        // before the menu sees them, so hwp-main takes those shortcuts off the key
        // event itself; registering them twice would run them twice whenever focus
        // sits outside the editor
        {
          label: tm('menuSave'),
          click: () => {
            const tab = activeHwpTarget()
            if (tab) void requestHwpSave(tab.webContents, 'save')
          },
        },
        {
          label: tm('menuSaveAs'),
          click: () => {
            const tab = activeHwpTarget()
            if (tab) void requestHwpSave(tab.webContents, 'saveAs')
          },
        },
        { type: 'separator' },
        {
          label: tm('menuExportPdf'),
          click: () => {
            const tab = activeHwpTarget()
            if (tab) requestHwpPrint(tab.webContents, 'pdf')
          },
        },
        {
          label: tm('menuPrint'),
          click: () => {
            const tab = activeHwpTarget()
            if (tab) requestHwpPrint(tab.webContents, 'print')
          },
        },
        { type: 'separator' },
        {
          label: tm('menuClose'),
          accelerator: 'CmdOrCtrl+W',
          click: () => closeFocusedEditor(),
        },
      ],
    },
    editMenuTemplate(process.platform, appMenuLabels(currentLang())),
    windowMenuTemplate(process.platform, appMenuLabels(currentLang())),
    {
      role: 'help',
      label: tm('menuHelp'),
      submenu: [
        { label: tm('thirdPartyNotices'), click: () => void openThirdPartyNotices() },
        { type: 'separator' },
        checkUpdatesMenuItem(appMenuLabels(currentLang())),
        aboutMenuItem(appMenuLabels(currentLang())),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---- html menu (html-main has no menu of its own; the shell owns html tabs) ----

function buildHtmlMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: tm('menuFile'),
      submenu: [
        {
          label: tm('menuOpen'),
          accelerator: 'CmdOrCtrl+O',
          click: () => void openFileViaDialog(),
        },
        { type: 'separator' },
        {
          label: tm('backToHome'),
          accelerator: 'Shift+CmdOrCtrl+H',
          click: () => tabManager?.openHomeTab(),
        },
        { type: 'separator' },
        {
          label: tm('menuSave'),
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            const tab = activeHtmlTarget()
            if (tab) void requestHtmlSave(tab.webContents, 'save')
          },
        },
        {
          label: tm('menuSaveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            const tab = activeHtmlTarget()
            if (tab) void requestHtmlSave(tab.webContents, 'saveAs')
          },
        },
        ...documentLinkFileMenuItems('html'),
        { type: 'separator' },
        {
          label: tm('menuExportDocx'),
          click: () => {
            const tab = activeHtmlTarget()
            if (tab) sendHtmlExportRequest(tab.webContents, 'docx')
          },
        },
        {
          label: tm('menuExportOdt'),
          click: () => {
            const tab = activeHtmlTarget()
            if (tab) sendHtmlExportRequest(tab.webContents, 'odt')
          },
        },
        {
          label: tm('menuExportPdf'),
          click: () => {
            const tab = activeHtmlTarget()
            if (tab) sendHtmlExportRequest(tab.webContents, 'pdf')
          },
        },
        {
          label: tm('menuExportHtml'),
          click: () => {
            const tab = activeHtmlTarget()
            if (tab) sendHtmlExportRequest(tab.webContents, 'html')
          },
        },
        { type: 'separator' },
        {
          label: tm('menuPrint'),
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            const tab = activeHtmlTarget()
            if (tab) sendHtmlPrintRequest(tab.webContents)
          },
        },
        { type: 'separator' },
        {
          label: tm('menuClose'),
          accelerator: 'CmdOrCtrl+W',
          click: () => closeFocusedEditor(),
        },
      ],
    },
    editMenuTemplate(process.platform, appMenuLabels(currentLang())),
    windowMenuTemplate(process.platform, appMenuLabels(currentLang())),
    {
      role: 'help',
      label: tm('menuHelp'),
      submenu: [
        { label: tm('thirdPartyNotices'), click: () => void openThirdPartyNotices() },
        { type: 'separator' },
        checkUpdatesMenuItem(appMenuLabels(currentLang())),
        aboutMenuItem(appMenuLabels(currentLang())),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---- mind map menu (mindmap-main has no menu of its own; the shell owns mind map tabs) ----

function buildMindmapMenu(): void {
  const isMac = process.platform === 'darwin'
  const labels = appMenuLabels(currentLang())
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: tm('menuFile'),
      submenu: [
        {
          label: tm('menuSectionNew'),
          accelerator: 'CmdOrCtrl+N',
          click: () => newMindmapTab(),
        },
        {
          label: tm('menuOpen'),
          accelerator: 'CmdOrCtrl+O',
          click: () => void openFileViaDialog(),
        },
        { type: 'separator' },
        {
          label: tm('backToHome'),
          accelerator: 'Shift+CmdOrCtrl+H',
          click: () => tabManager?.openHomeTab(),
        },
        { type: 'separator' },
        {
          label: tm('menuSave'),
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            const tab = activeMindmapTarget()
            if (tab) void requestMindmapSave(tab.webContents, 'save')
          },
        },
        {
          label: tm('menuSaveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            const tab = activeMindmapTarget()
            if (tab) void requestMindmapSave(tab.webContents, 'saveAs')
          },
        },
        ...documentLinkFileMenuItems('mindmap'),
        { type: 'separator' },
        {
          label: tm('menuExportMapImage'),
          click: () => {
            const tab = activeMindmapTarget()
            if (tab) sendMindmapExportRequest(tab.webContents, 'png')
          },
        },
        {
          label: tm('menuExportPdf'),
          click: () => {
            const tab = activeMindmapTarget()
            if (tab) sendMindmapExportRequest(tab.webContents, 'pdf')
          },
        },
        {
          label: tm('menuExportMapOutline'),
          click: () => {
            const tab = activeMindmapTarget()
            if (tab) sendMindmapExportRequest(tab.webContents, 'markdown')
          },
        },
        { type: 'separator' },
        {
          label: tm('menuPrint'),
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            const tab = activeMindmapTarget()
            if (tab) sendMindmapPrintRequest(tab.webContents)
          },
        },
        { type: 'separator' },
        {
          label: tm('menuClose'),
          accelerator: 'CmdOrCtrl+W',
          click: () => closeFocusedEditor(),
        },
      ],
    },
    {
      label: labels.edit,
      submenu: [
        // Undo and redo go to the map: its history is not the page's own, so the
        // undo / redo roles would not reach it. The map already takes the keys
        // itself; on Windows and Linux the shortcut is shown but not registered,
        // or one press would undo twice.
        {
          label: labels.undo,
          accelerator: 'CmdOrCtrl+Z',
          registerAccelerator: false,
          click: () => {
            const tab = activeMindmapTarget()
            if (tab) sendMindmapMenuCommand(tab.webContents, 'undo')
          },
        },
        {
          label: labels.redo,
          accelerator: isMac ? 'Shift+Cmd+Z' : 'Ctrl+Y',
          registerAccelerator: false,
          click: () => {
            const tab = activeMindmapTarget()
            if (tab) sendMindmapMenuCommand(tab.webContents, 'redo')
          },
        },
        { type: 'separator' },
        { role: 'cut', label: labels.cut },
        { role: 'copy', label: labels.copy },
        { role: 'paste', label: labels.paste },
        { role: 'delete', label: labels.delete },
        { type: 'separator' },
        { role: 'selectAll', label: labels.selectAll },
      ],
    },
    windowMenuTemplate(process.platform, appMenuLabels(currentLang())),
    {
      role: 'help',
      label: tm('menuHelp'),
      submenu: [
        { label: tm('thirdPartyNotices'), click: () => void openThirdPartyNotices() },
        { type: 'separator' },
        checkUpdatesMenuItem(appMenuLabels(currentLang())),
        aboutMenuItem(appMenuLabels(currentLang())),
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/**
 * Save As for pdf tabs: write pending edits to the picked path only, then open the copy.
 * Non-destructive: the original file is never written, and a cancelled dialog changes
 * nothing on disk (dialog first, no flush into the source).
 */
/** In-flight guard (same pattern as exportPdfAsDocxLocal): a re-trigger while the dialog
    or write is active must not start a second flow that overwrites the first one's
    waiter/target grant or clears its autosave pause early */
let savingPdfAs = false

async function savePdfAs(): Promise<void> {
  const tab = activePdfTarget()
  const host = pdfHostWindow(tab)
  if (!tab?.filePath || !host || savingPdfAs) return
  savingPdfAs = true
  // Pause renderer autosave for the whole flow: the dialog blurs the window, and a
  // blur-triggered autosave would write the pending edits into the original file
  setPdfSaveAsInFlight(tab.webContents, true)
  try {
    const picked = await showSaveDialogWithMemory(dialog, host, {
      defaultPath: tab.filePath,
      filters: [{ name: tm('filterPdf'), extensions: ['pdf'] }],
    })
    const target = pdfSaveAsTarget(picked, tab.filePath)
    if (!target) return
    if (pdfIsDirty(tab.webContents.id)) {
      // Renderer applies its pending edits onto the source bytes; the pdf main
      // process writes the result to the picked path only
      if (!(await requestPdfSaveAs(tab.webContents, target))) return
    } else {
      // No pending edits → a byte-identical copy
      await atomicCopyFile(tab.filePath, target)
    }
    openDocumentPath(target)
  } catch (err) {
    console.error('[shell] pdf save as failed:', err)
    showErrorDialog(host, tm('errPdfSaveAsFailed'), err)
  } finally {
    savingPdfAs = false
    setPdfSaveAsInFlight(tab.webContents, false)
  }
}

/**
 * In-flight guard: covers the whole flow (dialogs included) so re-triggering
 * from the menu can never start a second conversion
 */
let exportingPdfDocx = false

/**
 * Export as Word for pdf tabs, fully local (pdf2docx P4): flush pending
 * edits, pick the destination, convert in-process via PDFium wasm, write the
 * file and open it in a Docs tab. No login, no credits.
 */
async function exportPdfAsDocxLocal(): Promise<void> {
  const tab = activePdfTarget()
  const host = pdfHostWindow(tab)
  if (!tab?.filePath || !host) return
  if (exportingPdfDocx) {
    void dialog.showMessageBox(host, {
      type: 'info',
      message: tm('pdfDocxBusyMsg'),
    })
    return
  }
  exportingPdfDocx = true
  try {
    if (!(await flushPdfSave(tab.webContents, true))) return
    const picked = await showSaveDialogWithMemory(dialog, host, {
      defaultPath: tab.filePath.replace(/\.pdf$/i, '.docx'),
      filters: [{ name: tm('filterWord'), extensions: ['docx'] }],
    })
    if (picked.canceled || !picked.filePath) return
    // If the destination is already open in a docs tab, close it first (its
    // normal unsaved-changes guard applies) so the converted file opens fresh
    // instead of leaving a stale tab whose next save would clobber the result.
    const staleTabId = tabManager?.findDocsTabByPath(picked.filePath)
    if (staleTabId) {
      await tabManager?.closeTab(staleTabId)
      tabManager?.activateTab(tab.id)
      if (tabManager?.findDocsTabByPath(picked.filePath)) return
    }
    host.setProgressBar(2)
    // encrypted PDFs prompt for the password (P23), looping on wrong entries;
    // null result = user cancelled the prompt → abort silently
    const pdfPath = tab.filePath
    const result = await convertPdfFileToDocxLocalWithPrompt(
      pdfPath,
      (retry) =>
        promptPdfPassword(host, {
          fileName: basename(pdfPath),
          retry,
          busy: false,
          lang: currentLang(),
          strings: {
            title: tm('pdfPwdTitle'),
            prompt: tm('pdfPwdPrompt'),
            retryPrompt: tm('pdfPwdRetryPrompt'),
            ok: tm('pdfPwdOk'),
            cancel: tm('btnCancel'),
            verifying: tm('pdfPwdVerifying'),
            label: tm('pdfPwdLabel'),
            placeholder: tm('pdfPwdPlaceholder'),
            show: tm('pdfPwdShow'),
            hide: tm('pdfPwdHide'),
          },
        }),
      (page, total) => {
        if (host && !host.isDestroyed() && total > 0) {
          host.setProgressBar(page / total)
        }
      },
    )
    if (result === null) return
    await atomicWriteFile(picked.filePath, result.docx)

    // degrade transparency (plan §7.6 dual-track split): whole scan → say so
    // once; individual image-fallback pages → name them;
    // OCR-recovered scans ('ocr') are SUCCESSES — announce the recovery (the
    // user should proofread machine-read text), never the image-export notice
    const ocrPages = result.pageResults.filter((r) => r.status === 'ocr').map((r) => r.page)
    const imagePages = result.pageResults
      .filter((r) => r.status !== 'ok' && r.status !== 'ocr')
      .map((r) => r.page)
    if (result.scannedDocument) {
      await dialog.showMessageBox(host, {
        type: 'info',
        message: tm('pdfDocxLocalScannedMsg'),
        detail: tm('pdfDocxLocalScannedDetail'),
      })
    } else if (imagePages.length > 0 && ocrPages.length > 0) {
      // mixed documents surface BOTH facts in one dialog: which pages shipped
      // as images and which carry machine-read text the user should proofread
      await dialog.showMessageBox(host, {
        type: 'info',
        message: tm('pdfDocxLocalDegradedMsg'),
        detail:
          tm('pdfDocxLocalDegradedDetail', { pages: imagePages.join(', ') }) +
          '\n\n' +
          tm('pdfDocxLocalOcrDetail', { pages: ocrPages.join(', ') }),
      })
    } else if (imagePages.length > 0) {
      await dialog.showMessageBox(host, {
        type: 'info',
        message: tm('pdfDocxLocalDegradedMsg'),
        detail: tm('pdfDocxLocalDegradedDetail', { pages: imagePages.join(', ') }),
      })
    } else if (ocrPages.length > 0) {
      await dialog.showMessageBox(host, {
        type: 'info',
        message: tm('pdfDocxLocalOcrMsg'),
        detail: tm('pdfDocxLocalOcrDetail', { pages: ocrPages.join(', ') }),
      })
    }
    openDocumentPath(picked.filePath)
  } catch (err) {
    if (host && !host.isDestroyed()) {
      // structured load failures (P22): password-protected / damaged PDFs get
      // a human-readable explanation instead of the raw PDFium error string
      const detail =
        err instanceof PdfLoadError
          ? err.code === 'password-required'
            ? tm('pdfDocxLocalEncryptedDetail')
            : err.code === 'unsupported'
              ? // certificate-based or otherwise unsupported security (FPDF
                // error 5): a hard PDFium boundary — no password can open it
                // locally, so the message must NOT suggest one (P24 C)
                tm('pdfDocxLocalUnsupportedEncDetail')
              : tm('pdfDocxLocalCorruptDetail')
          : err instanceof Error
            ? err.message
            : String(err)
      void dialog.showMessageBox(host, {
        type: 'error',
        message: tm('pdfDocxFailedMsg'),
        detail,
      })
    }
  } finally {
    // the prompt window may still be open when the loop exits through cancel
    // or a non-password error thrown mid-retry
    closePdfPasswordDialog()
    exportingPdfDocx = false
    if (host && !host.isDestroyed()) host.setProgressBar(-1)
  }
}

/**
 * Export as PowerPoint for pdf tabs, fully local (pdf2pptx P25): flush
 * pending edits, pick the destination, convert in-process via PDFium wasm,
 * write the file and open it in a Slides tab. No login, no credits. Shares
 * the in-flight guard with the Word exports so pdfium never runs two
 * conversions at once.
 */
async function exportPdfAsPptxLocal(): Promise<void> {
  const tab = activePdfTarget()
  const host = pdfHostWindow(tab)
  if (!tab?.filePath || !host) return
  if (exportingPdfDocx) {
    void dialog.showMessageBox(host, {
      type: 'info',
      message: tm('pdfPptxBusyMsg'),
    })
    return
  }
  exportingPdfDocx = true
  try {
    if (!(await flushPdfSave(tab.webContents, true))) return
    const picked = await showSaveDialogWithMemory(dialog, host, {
      defaultPath: tab.filePath.replace(/\.pdf$/i, '.pptx'),
      filters: [{ name: tm('filterPpt'), extensions: ['pptx'] }],
    })
    if (picked.canceled || !picked.filePath) return
    // same stale-tab handling as the Word export (see exportPdfAsDocxLocal),
    // against the slides tab that may already show the destination file
    const staleTabId = tabManager?.findSlidesTabByPath(picked.filePath)
    if (staleTabId) {
      await tabManager?.closeTab(staleTabId)
      tabManager?.activateTab(tab.id)
      if (tabManager?.findSlidesTabByPath(picked.filePath)) return
    }
    host.setProgressBar(2)
    // encrypted PDFs prompt for the password (P23), looping on wrong entries;
    // null result = user cancelled the prompt → abort silently
    const pdfPath = tab.filePath
    const result = await convertPdfFileToPptxLocalWithPrompt(
      pdfPath,
      (retry) =>
        promptPdfPassword(host, {
          fileName: basename(pdfPath),
          retry,
          busy: false,
          lang: currentLang(),
          strings: {
            title: tm('pdfPwdTitle'),
            prompt: tm('pdfPwdPrompt'),
            retryPrompt: tm('pdfPwdRetryPrompt'),
            ok: tm('pdfPwdOk'),
            cancel: tm('btnCancel'),
            verifying: tm('pdfPwdVerifying'),
            label: tm('pdfPwdLabel'),
            placeholder: tm('pdfPwdPlaceholder'),
            show: tm('pdfPwdShow'),
            hide: tm('pdfPwdHide'),
          },
        }),
      (page, total) => {
        if (host && !host.isDestroyed() && total > 0) {
          host.setProgressBar(page / total)
        }
      },
    )
    if (result === null) return
    await atomicWriteFile(picked.filePath, result.pptx)

    // degrade transparency (same split as the Word export): whole scan vs
    // individual image-fallback pages
    const imagePages = result.pageResults.filter((r) => r.status !== 'ok').map((r) => r.page)
    if (result.scannedDocument) {
      await dialog.showMessageBox(host, {
        type: 'info',
        message: tm('pdfDocxLocalScannedMsg'),
        detail: tm('pdfPptxLocalScannedDetail'),
      })
    } else if (imagePages.length > 0) {
      await dialog.showMessageBox(host, {
        type: 'info',
        message: tm('pdfDocxLocalDegradedMsg'),
        detail: tm('pdfDocxLocalDegradedDetail', { pages: imagePages.join(', ') }),
      })
    }
    openDocumentPath(picked.filePath)
  } catch (err) {
    if (host && !host.isDestroyed()) {
      // structured load failures (P22): same explanations as the Word export
      const detail =
        err instanceof PdfLoadError
          ? err.code === 'password-required'
            ? tm('pdfDocxLocalEncryptedDetail')
            : err.code === 'unsupported'
              ? tm('pdfDocxLocalUnsupportedEncDetail')
              : tm('pdfDocxLocalCorruptDetail')
          : err instanceof Error
            ? err.message
            : String(err)
      void dialog.showMessageBox(host, {
        type: 'error',
        message: tm('pdfPptxFailedMsg'),
        detail,
      })
    }
  } finally {
    closePdfPasswordDialog()
    exportingPdfDocx = false
    if (host && !host.isDestroyed()) host.setProgressBar(-1)
  }
}

/**
 * Export as Excel for pdf tabs, fully local (pdf2xlsx P26): flush pending
 * edits, pick the destination, convert in-process via PDFium wasm, write the
 * file and open it in a Sheets tab. No login, no credits. Shares the
 * in-flight guard with the Word/PowerPoint exports so pdfium never runs two
 * conversions at once.
 */
async function exportPdfAsXlsxLocal(): Promise<void> {
  const tab = activePdfTarget()
  const host = pdfHostWindow(tab)
  if (!tab?.filePath || !host) return
  if (exportingPdfDocx) {
    void dialog.showMessageBox(host, {
      type: 'info',
      message: tm('pdfXlsxBusyMsg'),
    })
    return
  }
  exportingPdfDocx = true
  try {
    if (!(await flushPdfSave(tab.webContents, true))) return
    const picked = await showSaveDialogWithMemory(dialog, host, {
      defaultPath: tab.filePath.replace(/\.pdf$/i, '.xlsx'),
      filters: [{ name: tm('filterExcel'), extensions: ['xlsx'] }],
    })
    if (picked.canceled || !picked.filePath) return
    // same stale-tab handling as the Word export (see exportPdfAsDocxLocal),
    // against the sheets tab that may already show the destination file
    const staleTabId = tabManager?.findSheetsTabByPath(picked.filePath)
    if (staleTabId) {
      await tabManager?.closeTab(staleTabId)
      tabManager?.activateTab(tab.id)
      if (tabManager?.findSheetsTabByPath(picked.filePath)) return
    }
    host.setProgressBar(2)
    // encrypted PDFs prompt for the password (P23), looping on wrong entries;
    // null result = user cancelled the prompt → abort silently
    const pdfPath = tab.filePath
    const result = await convertPdfFileToXlsxLocalWithPrompt(
      pdfPath,
      (retry) =>
        promptPdfPassword(host, {
          fileName: basename(pdfPath),
          retry,
          busy: false,
          lang: currentLang(),
          strings: {
            title: tm('pdfPwdTitle'),
            prompt: tm('pdfPwdPrompt'),
            retryPrompt: tm('pdfPwdRetryPrompt'),
            ok: tm('pdfPwdOk'),
            cancel: tm('btnCancel'),
            verifying: tm('pdfPwdVerifying'),
            label: tm('pdfPwdLabel'),
            placeholder: tm('pdfPwdPlaceholder'),
            show: tm('pdfPwdShow'),
            hide: tm('pdfPwdHide'),
          },
        }),
      (page, total) => {
        if (host && !host.isDestroyed() && total > 0) {
          host.setProgressBar(page / total)
        }
      },
    )
    if (result === null) return
    await atomicWriteFile(picked.filePath, result.xlsx)

    // degrade transparency: pages that could not become cells got a notice
    // row on their worksheet instead of an image (a spreadsheet has none)
    const noticePages = result.pageResults.filter((r) => r.status !== 'ok').map((r) => r.page)
    if (result.scannedDocument) {
      await dialog.showMessageBox(host, {
        type: 'info',
        message: tm('pdfDocxLocalScannedMsg'),
        detail: tm('pdfXlsxLocalScannedDetail'),
      })
    } else if (noticePages.length > 0) {
      await dialog.showMessageBox(host, {
        type: 'info',
        message: tm('pdfXlsxLocalSkippedMsg'),
        detail: tm('pdfXlsxLocalSkippedDetail', { pages: noticePages.join(', ') }),
      })
    }
    openDocumentPath(picked.filePath)
  } catch (err) {
    if (host && !host.isDestroyed()) {
      // structured load failures (P22): same explanations as the Word export
      const detail =
        err instanceof PdfLoadError
          ? err.code === 'password-required'
            ? tm('pdfDocxLocalEncryptedDetail')
            : err.code === 'unsupported'
              ? tm('pdfDocxLocalUnsupportedEncDetail')
              : tm('pdfDocxLocalCorruptDetail')
          : err instanceof Error
            ? err.message
            : String(err)
      void dialog.showMessageBox(host, {
        type: 'error',
        message: tm('pdfXlsxFailedMsg'),
        detail,
      })
    }
  } finally {
    closePdfPasswordDialog()
    exportingPdfDocx = false
    if (host && !host.isDestroyed()) host.setProgressBar(-1)
  }
}

// The pdf renderer's converter dropdown funnels into the same local conversion
// flows as the File menu items (dialogs, password prompt, in-flight guard included)
ipcMain.handle(PDF_CHANNELS.convertOffice, async (e, format: unknown) => {
  // only the active pdf tab may trigger a conversion (its file is the source)
  if (activePdfTarget()?.webContents.id !== e.sender.id) return
  if (format === 'docx') await exportPdfAsDocxLocal()
  else if (format === 'xlsx') await exportPdfAsXlsxLocal()
  else if (format === 'pptx') await exportPdfAsPptxLocal()
})

function openThirdPartyNotices(): Promise<string> {
  const path = app.isPackaged
    ? join(process.resourcesPath, 'THIRD-PARTY-NOTICES.txt')
    : join(app.getAppPath(), 'build', 'THIRD-PARTY-NOTICES.txt')
  return shell.openPath(path)
}

/** every module's File menu gets a way back to the launcher */
function installBackToHomeItems(): void {
  const backToHomeItem: MenuItemConstructorOptions = {
    label: tm('backToHome'),
    accelerator: 'Shift+CmdOrCtrl+H',
    click: () => tabManager?.openHomeTab(),
  }
  setDocsExtraFileMenuItems([backToHomeItem])
  setSheetsExtraFileMenuItems([backToHomeItem])
  setSlidesExtraFileMenuItems([backToHomeItem])
}

/** the editors that build their own menus show the same provenance entries (spec 8.2, 9) */
function installDocumentLinkMenuItems(): void {
  setDocsDocumentLinkMenuItems(() => documentLinkFileMenuItems('docs'))
  setSheetsDocumentLinkMenuItems(() => documentLinkFileMenuItems('sheets'))
  setSlidesDocumentLinkMenuItems(() => documentLinkFileMenuItems('slides'))
}

function installDockMenu(): void {
  if (process.platform !== 'darwin') return
  app.dock?.setMenu(
    Menu.buildFromTemplate([
      { label: tm('menuHome'), click: () => tabManager?.openHomeTab() },
      {
        label: tm('menuNewDoc'),
        click: () => newDocTab(),
      },
      {
        label: tm('menuNewSheet'),
        click: () => void newSheetTab(),
      },
      { label: tm('menuNewSlide'), click: () => newSlideTab() },
      { label: tm('menuNewMarkdown'), click: () => newMarkdownTab() },
      { label: tm('menuNewPdf'), click: () => void newPdfTab() },
    ]),
  )
}

// On mainland-China networks the main process's Node fetch (undici) bypasses the system proxy,
// so direct calls to overseas LLM/image-search APIs time out or get region-blocked (403).
// Prefer proxy env vars (terminal launch); a packaged app launched from Finder inherits no shell
// env vars, so fall back to the system HTTP proxy. The renderer uses Chromium's system proxy and
// is unaffected. Same bootstrap as slides-main startSlidesStandalone.
async function installMainProcessProxy(): Promise<void> {
  let proxyUrl = [
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy,
    process.env.ALL_PROXY,
    process.env.all_proxy,
  ].find((v) => v && /^https?:\/\//.test(v))
  if (!proxyUrl) {
    try {
      // PAC/rule proxies answer per-host; one dispatcher serves every main-process
      // request (AI key providers, web search, image fetches), so probe with the
      // project's own host as a neutral public destination
      const resolved = await session.defaultSession.resolveProxy(GITHUB_REPO_URL)
      const m = /PROXY\s+([^;\s]+)/.exec(resolved)
      if (m) proxyUrl = `http://${m[1]}`
    } catch {
      /* no system proxy */
    }
  }
  if (!proxyUrl) return
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici')
    setGlobalDispatcher(new ProxyAgent(proxyUrl))
    // strip user:pass credentials before logging
    console.log('[proxy] main-process fetch via', proxyUrl.replace(/\/\/[^@/]*@/, '//***@'))
  } catch (e) {
    console.warn('[proxy] failed to set ProxyAgent:', e)
  }
}

// ---- lifecycle (the shell is the only owner) ----

let pendingLaunchPaths = collectLaunchPaths(process.argv)
let controlServer: ControlServer | null = null

// show() does not un-minimize, and on macOS ⌘W destroys the shell window while the
// app keeps running — either way a file opened from Finder would land out of sight.
function revealShellWindow(): void {
  if (!shellWindow) createShellWindow()
  if (shellWindow?.isMinimized()) shellWindow.restore()
  shellWindow?.show()
  shellWindow?.focus()
}

function openLaunchPaths(paths: readonly string[]): void {
  let opened = false
  for (const filePath of paths) opened = openDocumentPath(filePath) || opened
  if (!opened) tabManager?.openHomeTab()
}

// On macOS a file opened from Finder is not in argv; it arrives via the open-file event (before ready).
// If another instance already holds the lock, this process exits, and the path must ride along in
// the lock request's additionalData to the surviving instance — so the lock request is deferred
// until ready, after the path is known.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (!app.isReady()) {
    if (!pendingLaunchPaths.includes(filePath)) pendingLaunchPaths.push(filePath)
    return
  }
  revealShellWindow()
  openLaunchPaths([filePath])
})

app.on('second-instance', (_event, argv, _cwd, additionalData) => {
  const paths = collectLaunchPaths(argv, additionalData)
  revealShellWindow()
  openLaunchPaths(paths)
})

installNavigationGuard(app)
installContextMenu(app, () => contextMenuLabels(currentLang()))
registerAiIpc()
ipcMain.handle('ai:open-model-settings', () => {
  const win = shellWindow
  if (!win || win.isDestroyed()) return
  // the request may come from a detached window or while the shell is minimized
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  tabManager?.openHomeTab()
  win.webContents.send(HOME_CHANNELS.openSettings, { section: 'aiModel' })
})
registerProjectIpc()
registerDocsIpc()
registerHomeIpc()
registerIntegrationsIpc({
  settingsPath: APP_SETTINGS_PATH,
  window: () => shellWindow,
  cliDir: app.isPackaged
    ? join(process.resourcesPath, 'cli')
    : join(APPS_ROOT, '..', 'packages', 'cli', 'bin'),
  skillPath: app.isPackaged
    ? join(process.resourcesPath, 'cli', 'skills', 'ieumoffice', 'SKILL.md')
    : join(APPS_ROOT, '..', 'skills', 'ieumoffice', 'SKILL.md'),
  cliPackageJson: app.isPackaged
    ? join(process.resourcesPath, 'cli', 'package.json')
    : join(APPS_ROOT, '..', 'packages', 'cli', 'package.json'),
})
registerResultStoreIpc(ipcMain, () => app.getPath('userData'))
registerTabsIpc()
registerSplitIpc()
registerDroppedFilesIpc()
registerPdfStructureIpc()
registerPdfConvertUiIpc({
  findMarkdownTab: (path) => tabManager?.findMarkdownTabByPath(path),
  closeTab: async (tabId) => {
    await tabManager?.closeTab(tabId)
  },
  activateView: (viewId) => {
    const tabId = tabManager?.tabIdForWebContents(viewId)
    if (tabId) tabManager?.activateTab(tabId)
  },
  openDocument: (path) => openDocumentPath(path),
})

// The person's skills (settings → skills, the AI windows' `/` list and skill
// reads, skill cards, the agent session's skills). Writes go only to
// ~/.ieumoffice/skills; removing is the OS trash; GitHub only on request.
const builtinSkillsDir = (): string =>
  builtinSkillsDirFor({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  })
const userSkills = createUserSkillsService({
  homeDir: () => homedir(),
  builtinDir: builtinSkillsDir,
  settingsPath: APP_SETTINGS_PATH,
  tempDir: () => join(tmpdir(), 'ieumoffice-skills'),
  trash: (path) => shell.trashItem(path),
  // Node's fetch: no browser cookies; the core sets no-redirect and no-credentials per request
  fetch: (url, init) => fetch(url, init),
})
registerUserSkillsIpc({
  service: userSkills,
  // the settings screen; the agent window only for the install preview a session proposed
  canManage: userSkillsManageGate({
    isMainWindow: (sender) =>
      !!shellWindow && !shellWindow.isDestroyed() && sender === shellWindow.webContents,
    isAgentWindow: (sender) => isAgentWindowContents(sender),
  }),
  openSettings: () => {
    const win = shellWindow
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    tabManager?.openHomeTab()
    win.webContents.send(HOME_CHANNELS.openSettings, { section: 'skills' })
  },
  agentNoticeDue: () => agentSkillNoticeDue(APP_SETTINGS_PATH()),
  markAgentNoticeSeen: () => markAgentSkillNoticeSeen(APP_SETTINGS_PATH()),
})

// Template copies in new tabs (spec 5.6, 5.7): a skill template's copy, or the
// current document's for a template preview, opens as a new untitled document
// of its editor; the request is handed to that tab's AI panel, which runs it
// through its own send gate. The skill folder is only read here.
const templateTabs = createTemplateTabs({
  makeCopyDir: async () => {
    const dir = join(app.getPath('temp'), 'ieumoffice-template-copies', randomUUID())
    mkdirSync(dir, { recursive: true })
    return dir
  },
  writeFile: (path, bytes) => atomicWriteFile(path, Buffer.from(bytes)),
  readFile: async (path) => new Uint8Array(readFileSync(path)),
  removeDir: async (dir) => rmSync(dir, { recursive: true, force: true }),
  templateFileOf: (id) => userSkills.templateFile(id),
  openCopy: (copy) => openTemplateCopyTab(copy),
  focusTab: (tabId) => {
    const manager = tabManager
    if (!manager || !manager.list().some((tab) => tab.id === tabId)) return false
    const win = shellWindow
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
    manager.activateTab(tabId)
    return true
  },
  newId: () => randomUUID(),
  now: () => Date.now(),
})
registerTemplateTabsIpc(templateTabs)

/** A template copy's new untitled tab: sheets here (its backing workbook), the others in the tab manager */
async function openTemplateCopyTab(copy: TemplateCopy): Promise<OpenedCopyTab | null> {
  const manager = tabManager
  if (!manager) return null
  if (copy.editor !== 'sheets') return manager.openTemplateCopy(copy)
  // like "New spreadsheet": a backing workbook in its own temp folder, never a
  // file of the person's until the first save asks where; a .csv/.tsv/.xls
  // copy is converted there when the tab opens it
  const extension = extname(copy.fileName).toLowerCase()
  const saveExtension = extension === '.xlsm' ? '.xlsm' : '.xlsx'
  const stem = copy.fileName.slice(0, copy.fileName.length - extension.length) || copy.title
  const dir = newFileDir('sheet')
  let suggestedPath = uniquePathIn(dir, `${stem}${saveExtension}`)
  for (let i = 2; sheetsSuggestedPathTaken(suggestedPath); i++) {
    suggestedPath = uniquePathIn(dir, `${stem} ${i}${saveExtension}`)
  }
  const tempDir = join(app.getPath('temp'), 'genoffice-imports', randomUUID())
  mkdirSync(tempDir, { recursive: true })
  const backingPath = join(tempDir, `${stem}${extension}`)
  markSheetsUnsavedNew(backingPath, suggestedPath, tempDir)
  try {
    await atomicWriteFile(backingPath, Buffer.from(copy.bytes))
  } catch (err) {
    unmarkSheetsUnsavedNew(backingPath)
    rmSync(tempDir, { recursive: true, force: true })
    throw err
  }
  const tabId = manager.openSheetsTab(backingPath)
  startQueuedWorkbookNudge()
  const contents = manager.webContentsForTab(tabId)
  return contents ? { tabId, contents } : null
}

// sheets' project:resolveChat goes through the handler registered by docs-main; the sessionId reverse lookup hooks in here
setSessionPathResolver(resolveSheetsSessionPath)

/** Dev-only pid marker for the takeover below; scoped to userData like the lock itself. */
const devPidFile = () => join(app.getPath('userData'), 'dev-instance.pid')

/** Hidden-window exporters, one per editor module (HEADLESS_TARGETS says which formats each takes). */
const headlessExporters: HeadlessExporters = {
  docs: exportDocsHeadless,
  sheets: (input, outPath) => exportSheetsPdfHeadless(input, outPath),
  slides: (input, outPath) => exportSlidesPdfHeadless(input, outPath),
  markdown: (input, outPath) => exportMarkdownPdfHeadless(input, outPath),
  html: exportHtmlHeadless,
}

/**
 * The whole `--headless-export` run: no shell window, no menus, no updater,
 * no single-instance lock (a GUI instance may well be running). Prints
 * exactly one line and exits with the genoffice convention (0/1/2/3).
 */
async function runHeadlessExportEntry(
  parsed: Exclude<HeadlessArgvParse, { kind: 'none' }>,
): Promise<void> {
  const outcome =
    parsed.kind === 'error'
      ? ({ ok: false, code: HEADLESS_EXIT.badArgs, message: parsed.message } as const)
      : await runHeadlessExport(parsed.request, headlessExporters)
  const json = parsed.kind === 'error' ? parsed.json : parsed.request.json
  stopSheetsSidecar()
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.destroy()
  // Writing to a pipe can finish asynchronously, and app.exit() would cut the
  // envelope off mid-line; wait for the flush (but never longer than 2s).
  const line = formatHeadlessEnvelope(outcome, json) + '\n'
  await new Promise<void>((resolve) => {
    const bail = setTimeout(resolve, 2000)
    process.stdout.write(line, () => {
      clearTimeout(bail)
      resolve()
    })
  })
  // app.quit() always exits 0; the genoffice envelope needs the real code, and
  // every teardown this run owns has already happened.
  app.exit(headlessExitCode(outcome))
}

app.whenReady().then(async () => {
  // first scan waits for the windows to come up; later ones follow folder changes
  setTimeout(() => ensureFileIndexer()?.refresh(), 4000)
  installRendererProtocol({
    docs: join(DOCS_OUT, 'renderer'),
    sheets: join(SHEETS_OUT, 'renderer'),
    slides: join(SLIDES_OUT, 'renderer'),
    pdf: join(PDF_OUT, 'renderer'),
    markdown: join(MARKDOWN_OUT, 'renderer'),
    html: join(HTML_OUT, 'renderer'),
    mindmap: join(MINDMAP_OUT, 'renderer'),
    hwp: join(HWP_OUT, 'renderer'),
    // the manual shares the shell's own renderer bundle (help mode)
    help: join(__dirname, '../renderer'),
  })
  if (headlessArgv.kind !== 'none') {
    await runHeadlessExportEntry(headlessArgv)
    return
  }
  const lockData = () =>
    pendingLaunchPaths.length > 0
      ? { launchPath: pendingLaunchPaths[0], launchPaths: pendingLaunchPaths }
      : {}
  let hasLock = app.requestSingleInstanceLock(lockData())
  if (!hasLock && !app.isPackaged) {
    // Dev watch restart: electron-vite SIGTERMs the previous instance and spawns this
    // one immediately. Chromium turns that SIGTERM into a graceful quit (Node's
    // process.on('SIGTERM') never fires in the main process), and the quit can wedge
    // in the close-confirmation flow — the zombie then keeps the single-instance lock,
    // this instance quits, and electron-vite's on-close handler exits with it, killing
    // the renderer dev server (blank shell window until a manual dev restart).
    // The previous instance is doomed either way: kill it and take over the lock.
    try {
      const oldPid = Number(readFileSync(devPidFile(), 'utf-8').trim())
      if (Number.isFinite(oldPid) && oldPid > 0 && oldPid !== process.pid) {
        // pid-recycling guard: only kill if that pid is still an Electron process
        const cmd = execSync(`ps -o command= -p ${oldPid}`).toString()
        if (cmd.includes('Electron')) process.kill(oldPid, 'SIGKILL')
      }
    } catch {
      // no previous instance recorded / already gone (ps exits non-zero)
    }
    for (let i = 0; i < 20 && !hasLock; i++) {
      await new Promise((r) => setTimeout(r, 150))
      hasLock = app.requestSingleInstanceLock(lockData())
    }
  }
  if (!hasLock) {
    app.quit()
    return
  }
  // a subscription CLI a force-killed previous run left behind is ended, then
  // this run records the ones it starts (userData is final by now)
  void initSubscriptionChildTracking(app.getPath('userData')).catch(() => undefined)
  // a registry left by a crashed instance must not block genoffice writes
  ownsOpenDocumentsRegistry = true
  publishOpenDocuments(OPEN_DOCUMENTS_PATH(), [])
  if (!app.isPackaged) {
    try {
      writeFileSync(devPidFile(), String(process.pid))
    } catch {
      // best-effort: without the marker the next restart just retries the lock
    }
  }

  void installMainProcessProxy()
  app.setAccessibilitySupportEnabled(true)
  // Settle the shared uiLang from saved settings BEFORE any tab renderer can
  // ask 'app:get-language': the editor handlers return the i18n module's
  // mutable lang, whose 'zh' default otherwise wins the race for whichever
  // tab loads first (e.g. sheets booting in Chinese while docs shows English).
  currentLang()
  // native menus/dialogs/scrollbars follow the persisted theme from first paint
  nativeTheme.themeSource = currentTheme()
  // off the startup path: a symlink / registry write nobody is waiting for
  setTimeout(() => installCliLinkBestEffort(APP_SETTINGS_PATH()), 3000)
  startSheetsCaptureServer()
  driveService = registerDriveIpc({
    userData: () => app.getPath('userData'),
    settingsPath: APP_SETTINGS_PATH,
    lang: () => currentLang(),
    window: () => shellWindow,
    // a Drive copy opens like any local file; the Drive service already chose the copy
    openPath: (path) => routeDocumentPath(path),
    isOpen: (path) =>
      (tabManager?.openFilePaths() ?? []).some(
        (open) => resolve(open).toLowerCase() === resolve(path).toLowerCase(),
      ),
    parse: (path) => parseFileToText(path),
    theme: () => currentTheme(),
  })
  // The "Attach documents" window: an editor's AI panel asks the shell for the
  // documents it already knows, and the shell hands back the paths it ticked.
  // One window at a time, over the window that asked. The same list, built for
  // the asking editor, answers the AI panel's `@` list.
  createDocPicker({
    askerFor: (wcId) =>
      resolveDocAsker(wcId, {
        tabFor: (id) => {
          const tabId = tabManager?.tabIdForWebContents(id)
          if (!tabId) return undefined
          const filePath = tabManager?.describeWebContents(id)?.filePath
          return { id: tabId, ...(filePath ? { filePath } : {}) }
        },
        split: () => tabManager?.splitState() ?? null,
        detachedFor: (id) => detachedDocumentFor(id),
      }),
    list: createDocList({
      openDocuments: async () => {
        const tabs = tabManager ? await tabManager.openDocuments() : []
        const detached = await detachedOpenDocuments()
        return [...tabs, ...detached].map((doc) => ({
          id: doc.id,
          ...(doc.filePath ? { path: doc.filePath } : {}),
          title: doc.title,
          dirty: doc.dirty,
        }))
      },
      recent: async () =>
        readRecentFiles().map((path) => ({ path, title: basename(path), missing: false })),
      stat: async (path) => {
        const entry = statPathEntries([path], new Set<string>())[0]
        return entry && !entry.missing ? { sizeBytes: entry.sizeBytes } : null
      },
      attachable: {
        ATTACHABLE_EXTS,
        ATTACHABLE_IMAGE_EXTS,
        ATTACHABLE_MAX_BYTES,
        ATTACHABLE_IMAGE_MAX_BYTES,
      },
    }),
    lang: () => currentLang(),
    theme: () => currentTheme(),
  })
  // Which open documents have unsaved changes, for the attachment readers of the
  // editor mains and the knowledge base: a file being edited is not read as
  // another document's material until it is saved (a withholding mark only
  // reaches the file on save).
  setOpenFilesSource(async () => {
    const tabs = tabManager ? await tabManager.openDocuments() : []
    return [...tabs, ...(await detachedOpenDocuments())]
  })
  // Register the docs renderer bridge listeners before the MCP server can take
  // a visible-editing request.
  installDocsBridge()
  installSheetsBridge()
  // MCP server: localhost-only, docx generation for external agents. Deps are
  // injected so the mcp module never imports this file back.
  // family controls are referenced twice (their own tools + the open-documents
  // tool), so create them once here
  const mcpDocsControl = createDocsControl({
    openBlankTab: () => openBlankDocsTabForMcp(),
    authorizeSave: authorizeMcpDocWrite,
    abandonBlankTab: (wcId) => {
      if (tabManager) abandonBlankTabForMcp(tabManager.docsTabs(), wcId)
    },
  })
  const mcpSlidesControl = createSlidesControl({
    openBlankTab: () => openBlankSlidesTabForMcp(),
    abandonBlankTab: (wcId) => {
      if (tabManager) abandonBlankTabForMcp(tabManager.slidesTabs(), wcId)
    },
  })
  const mcpSheetsControl = createSheetsControl({
    openBlankTab: () => openBlankSheetsTabForMcp(),
    authorizeSave: authorizeMcpSheetWrite,
    abandonBlankTab: (wcId) => abandonBlankSheetsTabForMcp(wcId),
  })
  // The PDF tools window (decision 0030): Home's "PDF tools" card opens it; what it
  // writes, or a PDF picked for an editor-only tool, opens in a tab here.
  configurePdfToolsWindow({
    parentWindow: () => shellWindow,
    lang: () => currentLang(),
    theme: () => currentTheme(),
    openResult: (path) => {
      revealShellWindow()
      // a text tab already on this path shows the old file: read it again, as a
      // PDF tab is (the tools never write over a file with unsaved changes)
      const textTab = TEXT_RE.test(path) ? tabManager?.findMarkdownTabByPath(path) : undefined
      if (tabManager && textTab) {
        tabManager.reloadTab(textTab)
        tabManager.activateTab(textTab)
        return true
      }
      return openGeneratedDocument(path)
    },
    openForEditing: (path) => {
      revealShellWindow()
      return openDocumentPath(path)
    },
    runJob: runWindowJob,
    cancelJob: cancelWindowJob,
  })
  configureQuickLookWindow({
    parentWindow: () => shellWindow,
    lang: () => currentLang(),
    theme: () => currentTheme(),
    trayIcon: () => {
      try {
        return menuIcons().home
      } catch {
        return null
      }
    },
    readSettings: () => normalizeQuickLookSettings(readAppSettings(APP_SETTINGS_PATH()).quickLook),
    writeSettings: (next) => writeAppSetting(APP_SETTINGS_PATH(), 'quickLook', next),
    openInEditor: (filePath) => {
      revealShellWindow()
      openDocumentPath(filePath)
    },
    showShellWindow: () => {
      revealShellWindow()
    },
    quitApp: () => {
      stopQuickLookRuntime()
      app.quit()
    },
  })
  // The generate window ("make a new document from these files"): Home's entry
  // points open it; "make" opens a new untitled tab with the request queued
  // for it. A material open with unsaved changes is saved in place through the
  // same dialog-free saves the MCP save-and-close uses, or its tab is shown.
  configureGenerateWindow({
    parentWindow: () => shellWindow,
    lang: () => currentLang(),
    theme: () => currentTheme(),
    openTargetTab: (handoff) => {
      revealShellWindow()
      ensureTabManager().openGenerateTargetTab(handoff)
    },
    openConvertedTab: (doc) => {
      revealShellWindow()
      ensureTabManager().openConversionResult(doc)
    },
    starredGroupPaths: (group) => {
      const groupOf = readStarredGroupMap()
      return readStarredFiles().filter((p) => groupOf.get(p) === group)
    },
    tabIdFor: (wcId) => tabManager?.tabIdForWebContents(wcId),
    openMaterials: {
      list: async () => {
        const tabs = tabManager ? await tabManager.openDocuments() : []
        return [...tabs, ...(await detachedOpenDocuments())]
      },
      webContentsFor: (tabId) =>
        tabManager?.webContentsForTab(tabId) ?? detachedWebContentsFor(tabId),
      reveal: (tabId) => {
        if (activateDetached(tabId)) return
        tabManager?.activateTab(tabId)
        revealShellWindow()
      },
      save: {
        docs: (wcId, path) =>
          mcpDocsControl.runCommand(wcId, 'save_document', { path, overwrite: true }),
        sheets: (wcId, path) =>
          mcpSheetsControl.runCommand(wcId, 'save_sheet', { path, overwrite: true }),
        slides: (wcId, path) => mcpSlidesControl.saveDeck(wcId, path, true),
        markdown: (wc) => requestMarkdownSave(wc, 'save'),
        html: (wc) => requestHtmlSave(wc, 'save'),
        mindmap: (wc) => requestMindmapSave(wc, 'save'),
      },
    },
  })
  // Provenance records (spec 9) and the editors' File-menu entry "make another
  // document from this one" (8.2). After the make window: the records follow
  // the hand-off store's events, and the entry opens that window.
  configureDocumentLinks({
    userDataPath: () => app.getPath('userData'),
    activeDocument: (kind) => linkedDocumentFor(kind),
    documentFor: (wc) => linkedDocumentForWebContents(wc),
    parentFor: (wc) => detachedWindowForWebContents(wc.id) ?? shellWindow,
    openPath: (path) => void openDocumentPath(path),
    labels: () => ({
      make: tm('menuMakeFromDocument'),
      sources: tm('menuDocumentSources'),
      derived: tm('menuDerivedDocuments'),
    }),
    tabIdFor: (wcId) => tabManager?.tabIdForWebContents(wcId),
    menuKind: () => linkMenuKind(),
    applyMenu: (kind) => applyMenuFor(kind),
  })
  configureMcpRuntime({
    version: app.getVersion(),
    defaultSaveDir: () => defaultSaveDir(),
    openPath: (filePath) => routeDocumentPath(filePath),
    docsControl: mcpDocsControl,
    slidesControl: mcpSlidesControl,
    sheetsControl: mcpSheetsControl,
    // documents the user has open: the tab list plus each family's own bridge,
    // so an agent reaches a tab nobody but the user opened
    openDocumentsControl: createOpenDocumentsControl({
      list: async () => {
        const tabs = tabManager ? await tabManager.openDocuments() : []
        return [...tabs, ...(await detachedOpenDocuments())]
      },
      webContentsFor: (tabId) =>
        tabManager?.webContentsForTab(tabId) ?? detachedWebContentsFor(tabId),
      closeTab: (tabId) =>
        closeDetachedWithoutPrompt(tabId) || (tabManager?.closeTabWithoutPrompt(tabId) ?? false),
      defaultSaveDir: () => defaultSaveDir(),
      docs: mcpDocsControl,
      sheets: mcpSheetsControl,
      slides: mcpSlidesControl,
      slidesDiscard: discardSlidesRecovery,
      markdown: {
        read: markdownReadText,
        save: markdownSaveToPath,
        discard: markdownDiscardPendingAssets,
      },
      html: {
        read: htmlReadText,
        save: htmlSaveToPath,
        discard: htmlDiscardPendingAssets,
      },
      mindmap: {
        read: mindmapReadOutline,
        save: mindmapSaveToPath,
      },
      hwp: { read: hwpReadText },
    }),
    // the headless create_*/read_* tools delegate to the bundled genoffice CLI
    // (the same engines, no second implementation); it runs on the app's own
    // Node runtime via ELECTRON_RUN_AS_NODE
    cliRunner: createCliRunner({
      executable: process.execPath,
      entry: app.isPackaged
        ? join(process.resourcesPath, 'cli', 'genoffice.cjs')
        : join(APPS_ROOT, '..', 'packages', 'cli', 'dist', 'genoffice.cjs'),
    }),
    // lets the content tools take a `document` argument (tab id or path) and edit
    // a tab the *user* has open, with no create_session involved
    resolveTarget: createOpenTargetResolver({
      list: async () => {
        const tabs = tabManager ? await tabManager.openDocuments() : []
        return [...tabs, ...(await detachedOpenDocuments())]
      },
      webContentsFor: (tabId) =>
        tabManager?.webContentsForTab(tabId) ?? detachedWebContentsFor(tabId),
      // an agent editing a background tab would otherwise work where nobody can
      // see it: switch to that tab and bring its window forward first
      activate: (tabId) => {
        if (!activateDetached(tabId)) tabManager?.activateTab(tabId)
      },
      revealWindow: (tabId) => {
        if (!isDetachedTabId(tabId)) revealShellWindow()
      },
    }),
    logFilePath: join(app.getPath('userData'), 'mcp-log.txt'),
  })
  // Agent mode (decision 0032): the person's Claude Code or Codex with its own tools in a
  // project folder, in a window of its own. Its MCP server is per session and token-guarded,
  // built from the same controls as the one above; the skills are a copy kept under userData.
  configureAgentWindow({
    parentWindow: () => shellWindow,
    lang: () => currentLang(),
    theme: () => currentTheme(),
    statuses: () => sharedSubscriptionStatuses(),
    aiSettings: () => readStoredAiSettings(),
    readPrefs: () => normalizeAgentPrefs(readAppSettings(APP_SETTINGS_PATH()).agent),
    writePrefs: (prefs) => writeAgentPrefs(APP_SETTINGS_PATH(), prefs),
    openPath: (path) => routeDocumentPath(path),
    openDocuments: () => [...(tabManager?.openFilePaths() ?? []), ...detachedFilePaths()],
    userData: app.getPath('userData'),
    runners: {
      claude: (options, onEvent) => startClaudeAgentSession(options, onEvent),
      codex: (options, onEvent) => startCodexAgentSession(options, onEvent),
    },
    // the session's skill tools only show a card or an install proposal in the agent window
    startAppMcp: (projectRoot, { skillTools }) => {
      const mcp = currentMcpRuntimeDeps()
      if (!mcp) throw new Error('the MCP runtime is not configured')
      return startAgentMcpServer({ ...mcp, skillTools }, projectRoot)
    },
    listSkills: () => userSkills.list(),
    openTemplatePreview: (owner, input) => templateTabs.openPreview(owner, input),
    // the enabled skills (settings → skills) and the project's, as they are at the start
    buildSkills: async (projectRoot) =>
      buildAgentSkillBundle(
        await userSkills.enabledForAgent(projectRoot),
        // not under userData: that folder is protected from sessions, and the
        // copied skills' scripts must be readable to run
        join(process.env.LOCALAPPDATA ?? tmpdir(), 'IeumOffice', 'agent-skills'),
      ),
  })
  void startMcpFromSettings(currentMcpSettings()).catch((error) => {
    console.error('[mcp] failed to start on boot:', error)
  })
  createShellWindow()
  // deferred to ready: labels need currentLang(), which reads app.getLocale()
  installBackToHomeItems()
  installDocumentLinkMenuItems()
  installDockMenu()
  setUpdateCheckInvoker(() => void checkForUpdatesNow())
  initAutoUpdater(() => shellWindow, currentUpdateChannel())
  // crash record on this PC (crash-log.jsonl in userData) and, outside
  // headless runs, a prompt when the renderer of an open document dies
  const crashMemory = () =>
    memoryFigures({
      aiStreams: activeAiStreamCount,
      cliChildren: trackedSubscriptionChildCount,
    })
  startCrashWatch({
    prompt: headlessArgv.kind === 'none',
    memory: crashMemory,
    editorOf: (wc) => {
      if (shellWindow && !shellWindow.isDestroyed() && shellWindow.webContents.id === wc.id) {
        return 'home'
      }
      return (
        tabManager?.describeWebContents(wc.id)?.kind ?? detachedDocumentFor(wc.id)?.kind ?? 'other'
      )
    },
    documentOf: (wc) => {
      const doc = tabManager?.describeWebContents(wc.id) ?? detachedDocumentFor(wc.id)
      return doc && doc.kind !== 'home' && doc.kind !== 'help' ? doc : null
    },
    parentWindow: (wc) => detachedWindowForWebContents(wc.id) ?? shellWindow,
    closeDocument: (wc) => {
      const id = tabManager?.tabIdForWebContents(wc.id)
      if (id && tabManager) return tabManager.closeTabWithoutPrompt(id)
      const detachedId = detachedDocumentFor(wc.id)?.id
      return detachedId ? closeDetachedWithoutPrompt(detachedId) : false
    },
    reopen: (filePath) => void openDocumentPath(filePath),
    t: (key, params) => tm(key, params),
  })
  // a PC that runs short of memory during an AI request leaves a line too
  startLowMemoryWatch({ aiStreams: activeAiStreamCount, memory: crashMemory })
  // resource watchdog: a renderer that stays hot for minutes gets diagnostics
  // recorded and the user an offer to close the document (headless exports
  // are short-lived and unattended)
  if (headlessArgv.kind === 'none') {
    startRendererWatchdog({
      describe: (wc) => tabManager?.describeWebContents(wc.id) ?? null,
      parentWindow: (wc) => BrowserWindow.fromWebContents(wc) ?? shellWindow,
      closeDocument: async (wc) => {
        const id = tabManager?.tabIdForWebContents(wc.id)
        if (id && tabManager) await tabManager.closeTab(id)
        else BrowserWindow.fromWebContents(wc)?.close()
      },
      t: (key, params) => tm(key, params),
    })
  }

  // No file argument: reopen the remembered split when its documents are
  // still on disk, else the home screen. A launch with a file opens just it
  // (the memory is left for the next plain launch).
  if (pendingLaunchPaths.length > 0) openLaunchPaths(pendingLaunchPaths)
  else restoreSplitMemoryOrHome()
  pendingLaunchPaths = []
  for (const recoverAs of pendingUnsavedNewRecoveries()) void newSheetTab(recoverAs)

  startControlServer(
    app.getPath('userData'),
    controlHandler({
      reveal: revealShellWindow,
      openDocument: openDocumentPath,
      activateTab: (id) => {
        if (!activateDetached(id)) tabManager?.activateTab(id)
      },
      findTab: (path) => tabManager?.findTabByPath(path) ?? findDetachedTabByPath(path),
    }),
  ).then(
    (server) => {
      controlServer = server
    },
    (err: unknown) => console.warn('[control] not listening:', err),
  )

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createShellWindow()
  })
})

app.on('window-all-closed', () => {
  // A headless export destroys its hidden window between documents; only
  // runHeadlessExportEntry decides when that run is over.
  if (headlessArgv.kind !== 'none') return
  if (shouldKeepQuickLookInTray()) return
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // No close prompt may fall through to "Save" during shutdown
  markSheetsShuttingDown()
  stopSheetsSidecar()
  // release the MCP port synchronously (macOS keeps the process alive after
  // the last window closes, so window-all-closed is not enough)
  stopMcpSync()
})

// after every window has closed, so the shell window's own 'closed' republish cannot revive the file
app.on('will-quit', () => {
  fileIndexer?.stop()
  fileIndexStore?.close()
  for (const watcher of folderWatchers.values()) watcher.close()
  controlServer?.close()
  // a second instance that lost the lock quits too; it must not delete the running editor's list
  if (ownsOpenDocumentsRegistry) clearOpenDocuments(OPEN_DOCUMENTS_PATH())
  stopAgentSessions()
  driveService?.stop()
  stopQuickLookRuntime()
  shutdownSubscriptionChildren()
})

// app.exit() and process.exit() skip before-quit / will-quit (the headless
// export ends that way, and so does an exit on a fatal error); 'exit' is the
// one event every such way out still emits, so no subscription CLI outlives
// the app. A process killed outright runs nothing: the next start cleans up.
process.on('exit', () => shutdownSubscriptionChildren())
