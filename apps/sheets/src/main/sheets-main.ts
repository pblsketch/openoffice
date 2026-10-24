import { createHash, randomUUID } from 'node:crypto'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { copyFile, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { refreshCsvDigest } from './csv-digest'
import { createServer } from 'node:http'
import { basename, dirname, isAbsolute, join } from 'node:path'

import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  Menu,
  net,
  screen,
  session as electronSession,
  shell,
  systemPreferences,
  webContents,
  WebContentsView,
} from 'electron'
import type {
  IpcMainInvokeEvent,
  MenuItemConstructorOptions,
  OpenDialogOptions,
  SaveDialogOptions,
  WebContents,
} from 'electron'
import { z } from 'zod'
import {
  abortOnDestroyed,
  appMenuLabels,
  buildPrintableHtml,
  configuredAuthorName,
  configuredDefaultSaveDir,
  confirmOverwriteIfConflicted,
  contextMenuLabels,
  fetchRemoteImage,
  installContextMenu,
  installNavigationGuard,
  isHeadlessMode,
  isModifiedSince,
  isPathOpenElsewhere,
  printHtmlToPdf,
  recordDiskState,
  safeExternalUrl,
  shouldDeferAutoSave,
  showOpenDialogWithMemory,
  showSaveDialogWithMemory,
  helpMenuTemplate,
  viewMenuTemplate,
  windowMenuTemplate,
  installRendererProtocol,
  registerRendererScheme,
  rendererUrl,
  writeJsonAtomic,
  assertFileSaved,
  createRecoveryStore,
  isAppShuttingDown,
  isUntitledIdentity,
  markAppShuttingDown,
  newUntitledRecoveryId,
  recoveryFolderName,
  registerRecoveryEditor,
  resetAppShuttingDown,
  resolveRecoveryOnOpen,
  resumeDiscardedCopies,
  unprotectableNoticeText,
  type RecoveryCopyInfo,
  type RecoveryCopyState,
  type RecoveryIdentity,
  type RecoveryOpenFileRequest,
  type RecoveryOpenUntitledRequest,
  type SaveDiskState,
} from '@genoffice/electron-utils'
import {
  encryptOoxml,
  isCfbHeader,
  isEncryptedOfficeFile,
  OfficeDecryptError,
  unlockOfficeFile,
  type OfficePasswordAsk,
} from '@genoffice/electron-utils/office-encryption'
import {
  brandText,
  createI18n,
  getUiLang,
  type Lang,
  normalizeLang,
  PRODUCT_NAME,
  setUiLang,
} from '@genoffice/i18n'
import { ProjectStore } from '@genoffice/project-store'
import { aiSubscriptionLoginWindowText } from '@genoffice/ui/ai-subscription-login-window'

import {
  isAiOverloadedError,
  chatForProvider,
  maxOutputTokensOf,
  setAiUserAgent,
  setRescueFetch,
  streamForProvider,
  type AiSettings,
  type AiStreamChunk,
  sealAiSecrets,
} from '@genoffice/ai-provider'
import { shutdownCodexAppServers } from '@genoffice/ai-provider/codex-app-server'
import {
  ensureSubscriptionIpc,
  sharedSubscriptionStatuses,
  shutdownSubscriptionChildren,
} from '@genoffice/ai-provider/subscription'
import {
  csvToXlsxBufferForOpen,
  decodeCsvBuffer,
  sheetCsvToXlsxBuffer,
} from '@genoffice/xlsx-gateway/gateway/csv-import'
import {
  abortMediaCalls,
  aiToolCapabilities,
  readAiSettingsFile,
  webSearchTool,
  imageSearchTool,
  readUrlTool,
  generateImageTool,
  localMediaRoots,
  withMediaCallSignal,
  type AiToolCapabilities,
} from '@genoffice/ai-search'
import {
  parseFileToText,
  ATTACHABLE_EXTS,
  ATTACHABLE_IMAGE_EXTS,
  ATTACHABLE_MAX_BYTES,
  ATTACHABLE_IMAGE_MAX_BYTES,
} from '@genoffice/file-parse'
import { familyInfoFor } from '@genoffice/font-metrics'
import type { CellEdit, SheetStructuralOps } from '@genoffice/xlsx-gateway/gateway/xlsx-gateway'
import {
  promoteFileAtomically,
  readArchiveEntryText,
  saveWorkbookViaSidecar,
} from '@genoffice/xlsx-gateway/gateway/xlsx-package-io'
import { parsePivotDefinition } from '@genoffice/xlsx-gateway/gateway/xlsx-pivot'
import type { SheetEditPlan } from '@genoffice/xlsx-gateway/gateway/xlsx-sheets'
import type {
  AttachmentAddResult,
  AttachmentImageResult,
  AttachmentMeta,
  AttachmentReadResult,
  WorkbookFile,
} from '../shared/desktop-api'
import {
  aiChatRequestSchema,
  aiSettingsInputSchema,
  aiStreamRequestSchema,
  workbookFileSchema,
  workbookFormulaCellsRequestSchema,
  workbookRowOutlineResultSchema,
  workbookFormulaCellsResultSchema,
  workbookFindCellsRequestSchema,
  workbookFindCellsResultSchema,
  workbookRecalcRequestSchema,
  workbookRecalcResultSchema,
  workbookMediaRequestSchema,
  workbookMediaResultSchema,
  workbookPivotRequestSchema,
  localImageRequestSchema,
  localImageResultSchema,
  screenCaptureRequestSchema,
  screenCaptureResultSchema,
  screenSourcesResultSchema,
  workbookPivotDefinitionSchema,
  workbookCreateDocumentRequestSchema,
  workbookExportCsvRequestSchema,
  workbookExportPdfRequestSchema,
  printerInfoSchema,
  workbookRangeRequestSchema,
  workbookRangeResultSchema,
  workbookSaveEditsAbortSchema,
  workbookSaveEditsBeginSchema,
  saveEditsChunkArraySchema,
  workbookSaveEditsChunkSchema,
  workbookSaveRequestSchema,
  type WorkbookCreateDocumentResult,
  type WorkbookSaveRequest,
} from '../shared/desktop-api'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import {
  aiRunBlockChunk,
  aiSettingsFromStored,
  aiStreamErrorChunk,
  resolveAiRunTarget,
  subscriptionStreamCallbacks,
  withMeteredAccepted,
} from './ai-run'
import { atomicWriteFile } from './atomic-write'
import { closeGuardDecision, ShutdownLatch } from './close-guard'
import { SaveEditsTransferStore } from './save-edits-transfer'
import { exportPdf, printWorkbook } from './pdf-export'
import { installStandaloneTemplateFontProtocol } from './template-fonts'
import {
  allowsAutomaticWorkbookRecovery,
  convertedSessionRecovery,
  migrateLegacyUnsavedNew,
  saveAsDefaultFor,
  sessionRecoveryIdentity,
  untitledWorkbookExt,
} from './recovery-policy'
import {
  setSystemShortDate,
  shortDatePatternForSystemLocale,
} from '@genoffice/xlsx-gateway/shared/short-date'
import {
  cleanupExpiredPastedFiles,
  cleanupImportTempDirectory,
  cleanupSessionResources,
} from './temp-files'
import { XlsxSidecarClient } from './xlsx-sidecar-client'
import { sessionAfterRename } from './session-rename'

/**
 * Sheets main-process logic as an embeddable module: no top-level lifecycle.
 * Standalone mode (apps/sheets entry) calls startSheetsStandalone(); the
 * unified shell calls configureSheetsRuntime() + createSheetsWindow() and
 * owns the app lifecycle. AI IPC is registered separately so the shell can
 * substitute its single unified handler set (same channel names as docs).
 */

const tMain = createI18n({
  zh: {
    filterSpreadsheets: '电子表格',
    filterXlsx: 'Excel 工作簿',
    filterXlsm: 'Excel 启用宏的工作簿',
    dlgAddAttachment: '添加附件',
    filterSupported: '支持的文件',
    filterAll: '所有文件',
    errUnsupportedExt: '暂不支持 .{ext} 类型',
    errNotFile: '不是文件',
    errTooLarge: '超过 {mb}MB 上限',
    errImageTooLarge: '图片超过 5MB 上限',
    errUnreadable: '无法读取',
    errFileTooLarge: '文件超过大小上限',
    errParseFailed: '文件解析失败',
    errImageNoText: '图片附件不提供文本,已作为图像随用户消息发送,直接看图即可',
    errNotImage: '不是支持的图片类型',
    errNoApiKey: '未配置 {provider} 的 API Key',
    errAiBusy: 'AI 服务当前繁忙，请稍后重试',
    errNoModel: '未配置模型名称',
    errImgAbsPath: '图片路径必须是绝对路径。',
    errImgNotFound: '找不到图片文件: {path}',
    errImgTooLarge20: '图片超过 20MB,不支持插入。',
    errImgBadType: '该文件不是 PNG/JPEG/GIF 图片。',
    errEncryptedOpenTitle: '无法打开受密码保护的工作簿',
    errEncryptedUnsupported:
      '此文件使用的加密方式本应用无法解开。请在 Excel 中取消密码后重新打开。',
    errDiskChanged: '工作簿在打开后被磁盘上的改动覆盖——请改用另存为。',
    errSaveUnreadable:
      '保存结果无法重新打开，因此没有覆盖原文件。原文件保持不变，编辑内容仍在屏幕上。',
    menuFile: '文件',
    menuOpenWorkbook: '打开工作簿…',
    menuSave: '保存',
    menuSaveAs: '另存为…',
    menuExportPdf: '导出 PDF…',
    menuPrint: '打印…',
    menuClose: '关闭',
    menuQuit: '退出',
    menuEdit: '编辑',
    menuUndo: '撤销',
    menuRedo: '重做',
    closeUnsavedMsg: '有 {count} 处未保存的修改',
    closeUnsavedDetail: '不保存直接关闭,这些修改将丢失。',
    btnDontSave: '不保存',
    btnCancel: '取消',
    csvSaveAsNotice: 'CSV 格式不保留样式等格式修改——另存为 .xlsx 可保留全部内容。',
    menuExportCsv: '导出 CSV…',
    filterCsv: 'CSV (逗号分隔)',
    csvFormulaLossMsg: '当前工作表包含公式,CSV 格式无法保留。',
    csvFormulaLossDetail: 'CSV 只保留纯文本值——公式会被替换为当前计算结果,格式也会丢失。',
    csvKeepXlsxBtn: '另存为 .xlsx',
    csvContinueBtn: '继续保存为 CSV',
    csvActiveSheetOnlyNotice: 'CSV 文件只包含一张工作表——只会导出当前工作表“{name}”。',
    csvKeepFormatMsg: '继续以 CSV 格式保存吗?',
    csvKeepFormatDetail:
      'CSV 只保留单张工作表的纯文本值——公式、格式和其他工作表不会存入 .csv 文件。',
  },
  en: {
    filterSpreadsheets: 'Spreadsheets',
    filterXlsx: 'Excel Workbooks',
    filterXlsm: 'Excel Macro-Enabled Workbooks',
    dlgAddAttachment: 'Add Attachments',
    filterSupported: 'Supported Files',
    filterAll: 'All Files',
    errUnsupportedExt: '.{ext} files are not supported',
    errNotFile: 'not a file',
    errTooLarge: 'exceeds the {mb}MB limit',
    errImageTooLarge: 'image exceeds the 5MB limit',
    errUnreadable: 'cannot be read',
    errFileTooLarge: 'File exceeds the size limit',
    errParseFailed: 'Failed to parse file',
    errImageNoText: 'Image attachments have no text; the image is sent along with the user message',
    errNotImage: 'not a supported image type',
    errNoApiKey: 'No API key configured for {provider}',
    errAiBusy: 'The AI service is busy right now — please try again in a moment',
    errNoModel: 'No model name configured',
    errImgAbsPath: 'Image path must be absolute.',
    errImgNotFound: 'Image file not found: {path}',
    errImgTooLarge20: 'Image exceeds 20MB and cannot be inserted.',
    errImgBadType: 'The file is not a PNG/JPEG/GIF image.',
    errEncryptedOpenTitle: 'Cannot open the password-protected workbook',
    errEncryptedUnsupported:
      'This file uses an encryption method this app cannot unlock. Remove the password in Excel, then open it again.',
    errDiskChanged: 'The workbook changed on disk after it was opened — use Save As instead.',
    errSaveUnreadable:
      'The saved result could not be opened again, so the original file was not overwritten. The original is unchanged and your edits are still on screen.',
    menuFile: 'File',
    menuOpenWorkbook: 'Open Workbook…',
    menuSave: 'Save',
    menuSaveAs: 'Save As…',
    menuExportPdf: 'Export PDF…',
    menuPrint: 'Print…',
    menuClose: 'Close',
    menuQuit: 'Quit',
    menuEdit: 'Edit',
    menuUndo: 'Undo',
    menuRedo: 'Redo',
    closeUnsavedMsg: '{count} unsaved change(s)',
    closeUnsavedDetail: 'Your changes will be lost if you close without saving.',
    btnDontSave: "Don't Save",
    btnCancel: 'Cancel',
    csvSaveAsNotice: "CSV files can't keep formatting — saving as .xlsx keeps all your changes.",
    menuExportCsv: 'Export CSV…',
    filterCsv: 'CSV (Comma delimited)',
    csvFormulaLossMsg: 'This sheet contains formulas that CSV cannot keep.',
    csvFormulaLossDetail:
      'CSV keeps plain values only — formulas are flattened to their current results, and formatting is lost.',
    csvKeepXlsxBtn: 'Save as .xlsx',
    csvContinueBtn: 'Continue as CSV',
    csvActiveSheetOnlyNotice:
      'CSV files hold a single sheet — only the active sheet "{name}" will be exported.',
    csvKeepFormatMsg: 'Keep saving in CSV format?',
    csvKeepFormatDetail:
      'CSV keeps plain values of a single sheet only — formulas, formatting, and any additional sheets are not saved to the .csv file.',
  },
  vi: {
    filterSpreadsheets: 'Bảng tính',
    filterXlsx: 'Sổ làm việc Excel',
    filterXlsm: 'Sổ làm việc Excel hỗ trợ Macro',
    dlgAddAttachment: 'Thêm tệp đính kèm',
    filterSupported: 'Các tệp được hỗ trợ',
    filterAll: 'Tất cả các tệp',
    errUnsupportedExt: 'Tệp .{ext} không được hỗ trợ',
    errNotFile: 'không phải là tệp',
    errTooLarge: 'vượt quá giới hạn {mb}MB',
    errImageTooLarge: 'hình ảnh vượt quá giới hạn 5MB',
    errUnreadable: 'không thể đọc được',
    errFileTooLarge: 'Tệp vượt quá giới hạn kích thước',
    errParseFailed: 'Không thể phân tích tệp',
    errImageNoText:
      'Tệp đính kèm hình ảnh không có văn bản; hình ảnh được gửi cùng với tin nhắn của người dùng',
    errNotImage: 'loại hình ảnh không được hỗ trợ',
    errNoApiKey: 'Chưa cấu hình khóa API cho {provider}',
    errAiBusy: 'Dịch vụ AI hiện đang bận — vui lòng thử lại sau giây lát',
    errNoModel: 'Chưa cấu hình tên mô hình',
    errImgAbsPath: 'Đường dẫn hình ảnh phải là đường dẫn tuyệt đối.',
    errImgNotFound: 'Không tìm thấy tệp hình ảnh: {path}',
    errImgTooLarge20: 'Hình ảnh vượt quá 20MB và không thể chèn.',
    errImgBadType: 'Tệp không phải là hình ảnh PNG/JPEG/GIF.',
    errEncryptedOpenTitle: 'Không thể mở sổ làm việc được bảo vệ bằng mật khẩu',
    errEncryptedUnsupported:
      'Tệp này dùng phương thức mã hóa mà ứng dụng không thể mở khóa. Hãy gỡ mật khẩu trong Excel rồi mở lại.',
    errDiskChanged: 'Sổ làm việc đã thay đổi trên đĩa sau khi mở — hãy sử dụng Lưu dưới dạng.',
    errSaveUnreadable:
      'Không thể mở lại kết quả đã lưu nên tệp gốc không bị ghi đè. Tệp gốc vẫn nguyên vẹn và các chỉnh sửa vẫn còn trên màn hình.',
    menuFile: 'Tệp',
    menuOpenWorkbook: 'Mở sổ làm việc…',
    menuSave: 'Lưu',
    menuSaveAs: 'Lưu dưới dạng…',
    menuExportPdf: 'Xuất PDF…',
    menuPrint: 'In…',
    menuClose: 'Đóng',
    menuQuit: 'Thoát',
    menuEdit: 'Chỉnh sửa',
    menuUndo: 'Hoàn tác',
    menuRedo: 'Làm lại',
    closeUnsavedMsg: '{count} thay đổi chưa lưu',
    closeUnsavedDetail: 'Các thay đổi của bạn sẽ bị mất nếu bạn đóng mà không lưu.',
    btnDontSave: 'Không lưu',
    btnCancel: 'Hủy',
    csvSaveAsNotice:
      'Tệp CSV không thể giữ lại định dạng — lưu dưới dạng .xlsx sẽ giữ lại tất cả các thay đổi của bạn.',
    menuExportCsv: 'Xuất CSV…',
    filterCsv: 'CSV (Phân tách bằng dấu phẩy)',
    csvFormulaLossMsg: 'Trang tính này chứa các công thức mà định dạng CSV không thể lưu giữ.',
    csvFormulaLossDetail:
      'CSV chỉ giữ các giá trị thuần — các công thức được làm phẳng thành kết quả hiện tại của chúng và định dạng sẽ bị mất.',
    csvKeepXlsxBtn: 'Lưu dưới dạng .xlsx',
    csvContinueBtn: 'Tiếp tục dưới dạng CSV',
    csvActiveSheetOnlyNotice:
      'Tệp CSV chỉ chứa một trang tính duy nhất — chỉ trang tính đang hoạt động "{name}" sẽ được xuất.',
    csvKeepFormatMsg: 'Tiếp tục lưu ở định dạng CSV?',
    csvKeepFormatDetail:
      'CSV chỉ giữ các giá trị thuần của một trang tính duy nhất — các công thức, định dạng và mọi trang tính bổ sung sẽ không được lưu vào tệp .csv.',
  },
  ja: {
    filterSpreadsheets: 'スプレッドシート',
    filterXlsx: 'Excel ブック',
    filterXlsm: 'Excel マクロ有効ブック',
    dlgAddAttachment: '添付ファイルを追加',
    filterSupported: 'サポートされているファイル',
    filterAll: 'すべてのファイル',
    errUnsupportedExt: '.{ext} 形式には対応していません',
    errNotFile: 'ファイルではありません',
    errTooLarge: '{mb}MB の上限を超えています',
    errImageTooLarge: '画像が 5MB の上限を超えています',
    errUnreadable: '読み取れません',
    errFileTooLarge: 'ファイルがサイズ上限を超えています',
    errParseFailed: 'ファイルの解析に失敗しました',
    errImageNoText:
      '画像添付にはテキストがありません。画像はユーザー メッセージと一緒に送信されるため、そのまま画像をご確認ください',
    errNotImage: 'サポートされていない画像形式です',
    errNoApiKey: '{provider} の API キーが設定されていません',
    errAiBusy: 'AI サービスが混み合っています。しばらくしてからもう一度お試しください',
    errNoModel: 'モデル名が設定されていません',
    errImgAbsPath: '画像パスは絶対パスで指定してください。',
    errImgNotFound: '画像ファイルが見つかりません: {path}',
    errImgTooLarge20: '画像が 20MB を超えているため挿入できません。',
    errImgBadType: 'このファイルは PNG/JPEG/GIF 画像ではありません。',
    errEncryptedOpenTitle: 'パスワードで保護されたブックを開けません',
    errEncryptedUnsupported:
      'このファイルの暗号化方式はこのアプリでは解除できません。Excel でパスワードを解除してから、もう一度開いてください。',
    errDiskChanged:
      'ブックを開いた後にディスク上で変更されています — 名前を付けて保存を使用してください。',
    errSaveUnreadable:
      '保存結果を開き直せなかったため、元のファイルは上書きしていません。元のファイルはそのままで、編集内容は画面に残っています。',
    menuFile: 'ファイル',
    menuOpenWorkbook: 'ブックを開く…',
    menuSave: '保存',
    menuSaveAs: '名前を付けて保存…',
    menuExportPdf: 'PDF をエクスポート…',
    menuPrint: '印刷…',
    menuClose: '閉じる',
    menuQuit: '終了',
    menuEdit: '編集',
    menuUndo: '元に戻す',
    menuRedo: 'やり直し',
    closeUnsavedMsg: '未保存の変更が {count} 件あります',
    closeUnsavedDetail: '保存せずに閉じると、これらの変更は失われます。',
    btnDontSave: '保存しない',
    btnCancel: 'キャンセル',
    csvSaveAsNotice:
      'CSV 形式は書式を保持できません。.xlsx として保存すると変更をすべて保持できます。',
    menuExportCsv: 'CSV をエクスポート…',
    filterCsv: 'CSV (コンマ区切り)',
    csvFormulaLossMsg: 'このシートには CSV 形式では保持できない数式が含まれています。',
    csvFormulaLossDetail:
      'CSV は値のみを保持します。数式は現在の計算結果に置き換えられ、書式も失われます。',
    csvKeepXlsxBtn: '.xlsx として保存',
    csvContinueBtn: 'CSV のまま保存',
    csvActiveSheetOnlyNotice:
      'CSV ファイルには 1 枚のシートしか含められません — アクティブなシート「{name}」のみがエクスポートされます。',
    csvKeepFormatMsg: 'CSV 形式のまま保存しますか?',
    csvKeepFormatDetail:
      'CSV は 1 枚のシートの値のみを保持します。数式、書式、追加のシートは .csv ファイルには保存されません。',
  },
  ko: {
    filterSpreadsheets: '스프레드시트',
    filterXlsx: 'Excel 통합 문서',
    filterXlsm: 'Excel 매크로 사용 통합 문서',
    dlgAddAttachment: '첨부 파일 추가',
    filterSupported: '지원되는 파일',
    filterAll: '모든 파일',
    errUnsupportedExt: '.{ext} 형식은 지원되지 않습니다',
    errNotFile: '파일이 아닙니다',
    errTooLarge: '{mb}MB 제한을 초과했습니다',
    errImageTooLarge: '이미지가 5MB 제한을 초과했습니다',
    errUnreadable: '읽을 수 없습니다',
    errFileTooLarge: '파일이 크기 제한을 초과했습니다',
    errParseFailed: '파일을 구문 분석하지 못했습니다',
    errImageNoText:
      '이미지 첨부에는 텍스트가 없습니다. 이미지는 사용자 메시지와 함께 전송되므로 이미지를 직접 확인하세요',
    errNotImage: '지원되는 이미지 형식이 아닙니다',
    errNoApiKey: '{provider}의 API 키가 설정되지 않았습니다',
    errAiBusy: 'AI 서비스가 혼잡합니다. 잠시 후 다시 시도해 주세요',
    errNoModel: '모델 이름이 설정되지 않았습니다',
    errImgAbsPath: '이미지 경로는 절대 경로여야 합니다.',
    errImgNotFound: '이미지 파일을 찾을 수 없습니다: {path}',
    errImgTooLarge20: '이미지가 20MB를 초과하여 삽입할 수 없습니다.',
    errImgBadType: '이 파일은 PNG/JPEG/GIF 이미지가 아닙니다.',
    errEncryptedOpenTitle: '암호가 걸린 통합 문서를 열 수 없습니다',
    errEncryptedUnsupported:
      '이 파일에 쓰인 암호 방식은 이 앱에서 풀 수 없습니다. Excel에서 암호를 해제한 뒤 다시 열어 주세요.',
    errDiskChanged:
      '통합 문서가 열린 후 디스크에서 변경되었습니다. 다른 이름으로 저장을 사용하세요.',
    errSaveUnreadable:
      '저장한 결과를 다시 열 수 없어 원래 파일을 덮어쓰지 않았습니다. 원래 파일은 그대로이고, 편집한 내용은 화면에 남아 있습니다.',
    menuFile: '파일',
    menuOpenWorkbook: '통합 문서 열기…',
    menuSave: '저장',
    menuSaveAs: '다른 이름으로 저장…',
    menuExportPdf: 'PDF 내보내기…',
    menuPrint: '인쇄…',
    menuClose: '닫기',
    menuQuit: '끝내기',
    menuEdit: '편집',
    menuUndo: '실행 취소',
    menuRedo: '다시 실행',
    closeUnsavedMsg: '저장하지 않은 변경이 {count}건 있습니다',
    closeUnsavedDetail: '저장하지 않고 닫으면 변경 내용이 손실됩니다.',
    btnDontSave: '저장 안 함',
    btnCancel: '취소',
    csvSaveAsNotice:
      'CSV 형식은 서식을 저장할 수 없습니다. .xlsx로 저장하면 모든 변경 내용이 유지됩니다.',
    menuExportCsv: 'CSV 내보내기…',
    filterCsv: 'CSV (쉼표로 분리)',
    csvFormulaLossMsg: '현재 시트에 CSV 형식이 유지할 수 없는 수식이 포함되어 있습니다.',
    csvFormulaLossDetail:
      'CSV는 값만 유지합니다 — 수식은 현재 계산 결과로 바뀌고 서식은 손실됩니다.',
    csvKeepXlsxBtn: '.xlsx로 저장',
    csvContinueBtn: 'CSV로 계속 저장',
    csvActiveSheetOnlyNotice:
      'CSV 파일에는 시트 하나만 포함됩니다 — 활성 시트 "{name}"만 내보냅니다.',
    csvKeepFormatMsg: 'CSV 형식으로 계속 저장하시겠습니까?',
    csvKeepFormatDetail:
      'CSV는 시트 하나의 값만 유지합니다 — 수식, 서식, 추가 시트는 .csv 파일에 저장되지 않습니다.',
  },
  fr: {
    filterSpreadsheets: 'Feuilles de calcul',
    filterXlsx: 'Classeurs Excel',
    filterXlsm: 'Classeurs Excel prenant en charge les macros',
    dlgAddAttachment: 'Ajouter des pièces jointes',
    filterSupported: 'Fichiers pris en charge',
    filterAll: 'Tous les fichiers',
    errUnsupportedExt: 'Les fichiers .{ext} ne sont pas pris en charge',
    errNotFile: "n'est pas un fichier",
    errTooLarge: 'dépasse la limite de {mb} Mo',
    errImageTooLarge: "l'image dépasse la limite de 5 Mo",
    errUnreadable: 'illisible',
    errFileTooLarge: 'Le fichier dépasse la taille limite',
    errParseFailed: "Échec de l'analyse du fichier",
    errImageNoText:
      "Les images jointes n'ont pas de texte ; l'image est envoyée avec le message de l'utilisateur",
    errNotImage: "type d'image non pris en charge",
    errNoApiKey: 'Aucune clé API configurée pour {provider}',
    errAiBusy: "Le service d'IA est actuellement surchargé — réessayez dans un instant",
    errNoModel: 'Aucun nom de modèle configuré',
    errImgAbsPath: "Le chemin de l'image doit être absolu.",
    errImgNotFound: 'Fichier image introuvable : {path}',
    errImgTooLarge20: "L'image dépasse 20 Mo et ne peut pas être insérée.",
    errImgBadType: "Ce fichier n'est pas une image PNG/JPEG/GIF.",
    errEncryptedOpenTitle: "Impossible d'ouvrir le classeur protégé par mot de passe",
    errEncryptedUnsupported:
      'Ce fichier utilise une méthode de chiffrement que cette application ne peut pas déverrouiller. Supprimez le mot de passe dans Excel, puis rouvrez-le.',
    errDiskChanged:
      'Le classeur a été modifié sur le disque après son ouverture — utilisez Enregistrer sous.',
    errSaveUnreadable:
      "Le résultat enregistré n'a pas pu être rouvert ; le fichier d'origine n'a donc pas été écrasé. Il est intact et vos modifications sont toujours à l'écran.",
    menuFile: 'Fichier',
    menuOpenWorkbook: 'Ouvrir un classeur…',
    menuSave: 'Enregistrer',
    menuSaveAs: 'Enregistrer sous…',
    menuExportPdf: 'Exporter en PDF…',
    menuPrint: 'Imprimer…',
    menuClose: 'Fermer',
    menuQuit: 'Quitter',
    menuEdit: 'Édition',
    menuUndo: 'Annuler',
    menuRedo: 'Rétablir',
    closeUnsavedMsg: '{count} modification(s) non enregistrée(s)',
    closeUnsavedDetail: 'Vos modifications seront perdues si vous fermez sans enregistrer.',
    btnDontSave: 'Ne pas enregistrer',
    btnCancel: 'Annuler',
    csvSaveAsNotice:
      'Le format CSV ne conserve pas la mise en forme — enregistrez en .xlsx pour conserver toutes vos modifications.',
    menuExportCsv: 'Exporter en CSV…',
    filterCsv: 'CSV (délimité par des virgules)',
    csvFormulaLossMsg:
      'Cette feuille contient des formules que le format CSV ne peut pas conserver.',
    csvFormulaLossDetail:
      'Le CSV ne conserve que les valeurs — les formules sont remplacées par leur résultat actuel et la mise en forme est perdue.',
    csvKeepXlsxBtn: 'Enregistrer en .xlsx',
    csvContinueBtn: 'Continuer en CSV',
    csvActiveSheetOnlyNotice:
      "Les fichiers CSV ne contiennent qu'une seule feuille — seule la feuille active « {name} » sera exportée.",
    csvKeepFormatMsg: 'Continuer à enregistrer au format CSV ?',
    csvKeepFormatDetail:
      "Le CSV ne conserve que les valeurs d'une seule feuille — les formules, la mise en forme et les feuilles supplémentaires ne sont pas enregistrées dans le fichier .csv.",
  },
  de: {
    filterSpreadsheets: 'Tabellenkalkulationen',
    filterXlsx: 'Excel-Arbeitsmappen',
    filterXlsm: 'Excel-Arbeitsmappen mit Makros',
    dlgAddAttachment: 'Anlagen hinzufügen',
    filterSupported: 'Unterstützte Dateien',
    filterAll: 'Alle Dateien',
    errUnsupportedExt: '.{ext}-Dateien werden nicht unterstützt',
    errNotFile: 'keine Datei',
    errTooLarge: 'überschreitet das Limit von {mb} MB',
    errImageTooLarge: 'Bild überschreitet das Limit von 5 MB',
    errUnreadable: 'kann nicht gelesen werden',
    errFileTooLarge: 'Datei überschreitet die Größenbeschränkung',
    errParseFailed: 'Datei konnte nicht analysiert werden',
    errImageNoText:
      'Bildanlagen enthalten keinen Text; das Bild wird zusammen mit der Benutzernachricht gesendet',
    errNotImage: 'kein unterstützter Bildtyp',
    errNoApiKey: 'Kein API-Schlüssel für {provider} konfiguriert',
    errAiBusy: 'Der KI-Dienst ist derzeit überlastet — bitte gleich erneut versuchen',
    errNoModel: 'Kein Modellname konfiguriert',
    errImgAbsPath: 'Der Bildpfad muss absolut sein.',
    errImgNotFound: 'Bilddatei nicht gefunden: {path}',
    errImgTooLarge20: 'Das Bild überschreitet 20 MB und kann nicht eingefügt werden.',
    errImgBadType: 'Die Datei ist kein PNG/JPEG/GIF-Bild.',
    errEncryptedOpenTitle: 'Die kennwortgeschützte Arbeitsmappe kann nicht geöffnet werden',
    errEncryptedUnsupported:
      'Diese Datei verwendet ein Verschlüsselungsverfahren, das diese App nicht entsperren kann. Entfernen Sie das Kennwort in Excel und öffnen Sie die Datei erneut.',
    errDiskChanged:
      'Die Arbeitsmappe wurde nach dem Öffnen auf dem Datenträger geändert — verwenden Sie stattdessen „Speichern unter“.',
    errSaveUnreadable:
      'Das gespeicherte Ergebnis ließ sich nicht wieder öffnen, daher wurde die Originaldatei nicht überschrieben. Sie ist unverändert, und Ihre Änderungen sind noch auf dem Bildschirm.',
    menuFile: 'Datei',
    menuOpenWorkbook: 'Arbeitsmappe öffnen…',
    menuSave: 'Speichern',
    menuSaveAs: 'Speichern unter…',
    menuExportPdf: 'PDF exportieren…',
    menuPrint: 'Drucken…',
    menuClose: 'Schließen',
    menuQuit: 'Beenden',
    menuEdit: 'Bearbeiten',
    menuUndo: 'Rückgängig',
    menuRedo: 'Wiederholen',
    closeUnsavedMsg: '{count} nicht gespeicherte Änderung(en)',
    closeUnsavedDetail: 'Ihre Änderungen gehen verloren, wenn Sie ohne Speichern schließen.',
    btnDontSave: 'Nicht speichern',
    btnCancel: 'Abbrechen',
    csvSaveAsNotice:
      'CSV-Dateien können keine Formatierung speichern – als .xlsx speichern, um alle Änderungen zu behalten.',
    menuExportCsv: 'CSV exportieren…',
    filterCsv: 'CSV (Trennzeichen-getrennt)',
    csvFormulaLossMsg: 'Dieses Blatt enthält Formeln, die das CSV-Format nicht speichern kann.',
    csvFormulaLossDetail:
      'CSV speichert nur reine Werte – Formeln werden durch ihre aktuellen Ergebnisse ersetzt, und die Formatierung geht verloren.',
    csvKeepXlsxBtn: 'Als .xlsx speichern',
    csvContinueBtn: 'Als CSV fortfahren',
    csvActiveSheetOnlyNotice:
      'CSV-Dateien enthalten nur ein Blatt – nur das aktive Blatt „{name}“ wird exportiert.',
    csvKeepFormatMsg: 'Weiter im CSV-Format speichern?',
    csvKeepFormatDetail:
      'CSV speichert nur die Werte eines einzelnen Blatts – Formeln, Formatierungen und weitere Blätter werden nicht in der .csv-Datei gespeichert.',
  },
  es: {
    filterSpreadsheets: 'Hojas de cálculo',
    filterXlsx: 'Libros de Excel',
    filterXlsm: 'Libros de Excel habilitados para macros',
    dlgAddAttachment: 'Agregar datos adjuntos',
    filterSupported: 'Archivos compatibles',
    filterAll: 'Todos los archivos',
    errUnsupportedExt: 'Los archivos .{ext} no son compatibles',
    errNotFile: 'no es un archivo',
    errTooLarge: 'supera el límite de {mb} MB',
    errImageTooLarge: 'la imagen supera el límite de 5 MB',
    errUnreadable: 'no se puede leer',
    errFileTooLarge: 'El archivo supera el límite de tamaño',
    errParseFailed: 'No se pudo analizar el archivo',
    errImageNoText:
      'Las imágenes adjuntas no tienen texto; la imagen se envía junto con el mensaje del usuario',
    errNotImage: 'no es un tipo de imagen compatible',
    errNoApiKey: 'No hay clave de API configurada para {provider}',
    errAiBusy:
      'El servicio de IA está saturado en este momento; inténtalo de nuevo en unos instantes',
    errNoModel: 'No hay nombre de modelo configurado',
    errImgAbsPath: 'La ruta de la imagen debe ser absoluta.',
    errImgNotFound: 'No se encontró el archivo de imagen: {path}',
    errImgTooLarge20: 'La imagen supera los 20 MB y no se puede insertar.',
    errImgBadType: 'El archivo no es una imagen PNG/JPEG/GIF.',
    errEncryptedOpenTitle: 'No se puede abrir el libro protegido con contraseña',
    errEncryptedUnsupported:
      'Este archivo usa un método de cifrado que esta aplicación no puede desbloquear. Quita la contraseña en Excel y vuelve a abrirlo.',
    errDiskChanged: 'El libro cambió en el disco después de abrirse; usa Guardar como en su lugar.',
    errSaveUnreadable:
      'No se pudo volver a abrir el resultado guardado, así que no se sobrescribió el archivo original. El original no cambió y tus ediciones siguen en pantalla.',
    menuFile: 'Archivo',
    menuOpenWorkbook: 'Abrir libro…',
    menuSave: 'Guardar',
    menuSaveAs: 'Guardar como…',
    menuExportPdf: 'Exportar a PDF…',
    menuPrint: 'Imprimir…',
    menuClose: 'Cerrar',
    menuQuit: 'Salir',
    menuEdit: 'Edición',
    menuUndo: 'Deshacer',
    menuRedo: 'Rehacer',
    closeUnsavedMsg: '{count} cambio(s) sin guardar',
    closeUnsavedDetail: 'Los cambios se perderán si cierras sin guardar.',
    btnDontSave: 'No guardar',
    btnCancel: 'Cancelar',
    csvSaveAsNotice:
      'El formato CSV no conserva el formato: guarda como .xlsx para conservar todos tus cambios.',
    menuExportCsv: 'Exportar a CSV…',
    filterCsv: 'CSV (delimitado por comas)',
    csvFormulaLossMsg: 'Esta hoja contiene fórmulas que el formato CSV no puede conservar.',
    csvFormulaLossDetail:
      'El CSV solo conserva valores: las fórmulas se sustituyen por sus resultados actuales y el formato se pierde.',
    csvKeepXlsxBtn: 'Guardar como .xlsx',
    csvContinueBtn: 'Continuar como CSV',
    csvActiveSheetOnlyNotice:
      'Los archivos CSV solo contienen una hoja: solo se exportará la hoja activa «{name}».',
    csvKeepFormatMsg: '¿Seguir guardando en formato CSV?',
    csvKeepFormatDetail:
      'CSV solo conserva los valores de una única hoja: las fórmulas, el formato y las hojas adicionales no se guardan en el archivo .csv.',
  },
  th: {
    filterSpreadsheets: 'สเปรดชีต',
    filterXlsx: 'เวิร์กบุ๊ก Excel',
    filterXlsm: 'เวิร์กบุ๊ก Excel ที่เปิดใช้งานแมโคร',
    dlgAddAttachment: 'เพิ่มสิ่งที่แนบ',
    filterSupported: 'ไฟล์ที่รองรับ',
    filterAll: 'ไฟล์ทั้งหมด',
    errUnsupportedExt: 'ไม่รองรับไฟล์ชนิด .{ext}',
    errNotFile: 'ไม่ใช่ไฟล์',
    errTooLarge: 'เกินขีดจำกัด {mb}MB',
    errImageTooLarge: 'รูปภาพเกินขีดจำกัด 5MB',
    errUnreadable: 'อ่านไม่ได้',
    errFileTooLarge: 'ไฟล์มีขนาดเกินขีดจำกัด',
    errParseFailed: 'แยกวิเคราะห์ไฟล์ไม่สำเร็จ',
    errImageNoText:
      'รูปภาพแนบไม่มีข้อความ รูปภาพจะถูกส่งไปพร้อมข้อความของผู้ใช้ ให้ดูที่รูปภาพโดยตรง',
    errNotImage: 'ไม่ใช่ชนิดรูปภาพที่รองรับ',
    errNoApiKey: 'ยังไม่ได้ตั้งค่า API Key ของ {provider}',
    errAiBusy: 'บริการ AI มีผู้ใช้งานจำนวนมากในขณะนี้ โปรดลองอีกครั้งในอีกสักครู่',
    errNoModel: 'ยังไม่ได้กำหนดชื่อโมเดล',
    errImgAbsPath: 'เส้นทางรูปภาพต้องเป็นเส้นทางแบบสัมบูรณ์',
    errImgNotFound: 'ไม่พบไฟล์รูปภาพ: {path}',
    errImgTooLarge20: 'รูปภาพเกิน 20MB ไม่สามารถแทรกได้',
    errImgBadType: 'ไฟล์นี้ไม่ใช่รูปภาพ PNG/JPEG/GIF',
    errEncryptedOpenTitle: 'ไม่สามารถเปิดเวิร์กบุ๊กที่ป้องกันด้วยรหัสผ่านได้',
    errEncryptedUnsupported:
      'ไฟล์นี้ใช้วิธีเข้ารหัสที่แอปนี้ปลดล็อกไม่ได้ โปรดเอารหัสผ่านออกใน Excel แล้วเปิดอีกครั้ง',
    errDiskChanged: 'เวิร์กบุ๊กถูกเปลี่ยนแปลงบนดิสก์หลังจากเปิด — โปรดใช้บันทึกเป็นแทน',
    errSaveUnreadable:
      'ไม่สามารถเปิดผลที่บันทึกได้อีกครั้ง จึงไม่ได้เขียนทับไฟล์ต้นฉบับ ไฟล์ต้นฉบับยังคงเดิมและการแก้ไขของคุณยังอยู่บนหน้าจอ',
    menuFile: 'ไฟล์',
    menuOpenWorkbook: 'เปิดเวิร์กบุ๊ก…',
    menuSave: 'บันทึก',
    menuSaveAs: 'บันทึกเป็น…',
    menuExportPdf: 'ส่งออก PDF…',
    menuPrint: 'พิมพ์…',
    menuClose: 'ปิด',
    menuQuit: 'ออก',
    menuEdit: 'แก้ไข',
    menuUndo: 'เลิกทำ',
    menuRedo: 'ทำซ้ำ',
    closeUnsavedMsg: 'มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก {count} รายการ',
    closeUnsavedDetail: 'หากปิดโดยไม่บันทึก การเปลี่ยนแปลงเหล่านี้จะหายไป',
    btnDontSave: 'ไม่บันทึก',
    btnCancel: 'ยกเลิก',
    csvSaveAsNotice:
      'ไฟล์ CSV ไม่สามารถเก็บการจัดรูปแบบได้ — บันทึกเป็น .xlsx เพื่อเก็บการเปลี่ยนแปลงทั้งหมดของคุณ',
    menuExportCsv: 'ส่งออก CSV…',
    filterCsv: 'CSV (คั่นด้วยเครื่องหมายจุลภาค)',
    csvFormulaLossMsg: 'ชีตนี้มีสูตรที่รูปแบบ CSV เก็บไว้ไม่ได้',
    csvFormulaLossDetail:
      'CSV เก็บเฉพาะค่าเท่านั้น — สูตรจะถูกแทนที่ด้วยผลลัพธ์ปัจจุบัน และการจัดรูปแบบจะหายไป',
    csvKeepXlsxBtn: 'บันทึกเป็น .xlsx',
    csvContinueBtn: 'บันทึกเป็น CSV ต่อไป',
    csvActiveSheetOnlyNotice:
      'ไฟล์ CSV มีได้เพียงชีตเดียว — จะส่งออกเฉพาะชีตที่ใช้งานอยู่ “{name}” เท่านั้น',
    csvKeepFormatMsg: 'บันทึกเป็นรูปแบบ CSV ต่อไปหรือไม่',
    csvKeepFormatDetail:
      'CSV เก็บเฉพาะค่าของชีตเดียวเท่านั้น — สูตร การจัดรูปแบบ และชีตอื่น ๆ จะไม่ถูกบันทึกลงในไฟล์ .csv',
  },
  id: {
    filterSpreadsheets: 'Lembar bentang',
    filterXlsx: 'Buku kerja Excel',
    filterXlsm: 'Buku kerja Excel dengan makro aktif',
    dlgAddAttachment: 'Tambahkan lampiran',
    filterSupported: 'File yang didukung',
    filterAll: 'Semua file',
    errUnsupportedExt: 'File .{ext} tidak didukung',
    errNotFile: 'bukan file',
    errTooLarge: 'melebihi batas {mb}MB',
    errImageTooLarge: 'gambar melebihi batas 5MB',
    errUnreadable: 'tidak dapat dibaca',
    errFileTooLarge: 'File melebihi batas ukuran',
    errParseFailed: 'Gagal mengurai file',
    errImageNoText: 'Lampiran gambar tidak memiliki teks; gambar dikirim bersama pesan pengguna',
    errNotImage: 'bukan jenis gambar yang didukung',
    errNoApiKey: 'API Key untuk {provider} belum dikonfigurasi',
    errAiBusy: 'Layanan AI sedang sibuk — silakan coba lagi sebentar lagi',
    errNoModel: 'Nama model belum dikonfigurasi',
    errImgAbsPath: 'Jalur gambar harus berupa jalur absolut.',
    errImgNotFound: 'File gambar tidak ditemukan: {path}',
    errImgTooLarge20: 'Gambar melebihi 20MB dan tidak dapat disisipkan.',
    errImgBadType: 'File ini bukan gambar PNG/JPEG/GIF.',
    errEncryptedOpenTitle: 'Tidak dapat membuka buku kerja yang dilindungi kata sandi',
    errEncryptedUnsupported:
      'File ini memakai metode enkripsi yang tidak dapat dibuka aplikasi ini. Hapus kata sandinya di Excel, lalu buka lagi.',
    errDiskChanged: 'Buku kerja berubah di disk setelah dibuka — gunakan Simpan Sebagai.',
    errSaveUnreadable:
      'Hasil simpanan tidak dapat dibuka kembali, jadi file asli tidak ditimpa. File asli tidak berubah dan suntingan Anda masih ada di layar.',
    menuFile: 'File',
    menuOpenWorkbook: 'Buka Buku Kerja…',
    menuSave: 'Simpan',
    menuSaveAs: 'Simpan Sebagai…',
    menuExportPdf: 'Ekspor PDF…',
    menuPrint: 'Cetak…',
    menuClose: 'Tutup',
    menuQuit: 'Keluar',
    menuEdit: 'Edit',
    menuUndo: 'Urungkan',
    menuRedo: 'Ulangi',
    closeUnsavedMsg: '{count} perubahan belum disimpan',
    closeUnsavedDetail: 'Perubahan Anda akan hilang jika menutup tanpa menyimpan.',
    btnDontSave: 'Jangan Simpan',
    btnCancel: 'Batal',
    csvSaveAsNotice:
      'File CSV tidak dapat menyimpan pemformatan — simpan sebagai .xlsx untuk mempertahankan semua perubahan Anda.',
    menuExportCsv: 'Ekspor CSV…',
    filterCsv: 'CSV (dipisahkan koma)',
    csvFormulaLossMsg: 'Lembar ini berisi rumus yang tidak dapat disimpan dalam format CSV.',
    csvFormulaLossDetail:
      'CSV hanya menyimpan nilai — rumus diganti dengan hasil saat ini, dan pemformatan akan hilang.',
    csvKeepXlsxBtn: 'Simpan sebagai .xlsx',
    csvContinueBtn: 'Lanjutkan sebagai CSV',
    csvActiveSheetOnlyNotice:
      'File CSV hanya memuat satu lembar — hanya lembar aktif “{name}” yang akan diekspor.',
    csvKeepFormatMsg: 'Terus menyimpan dalam format CSV?',
    csvKeepFormatDetail:
      'CSV hanya menyimpan nilai dari satu lembar — rumus, pemformatan, dan lembar tambahan tidak disimpan ke file .csv.',
  },
  ru: {
    filterSpreadsheets: 'Электронные таблицы',
    filterXlsx: 'Книги Excel',
    filterXlsm: 'Книги Excel с поддержкой макросов',
    dlgAddAttachment: 'Добавить вложения',
    filterSupported: 'Поддерживаемые файлы',
    filterAll: 'Все файлы',
    errUnsupportedExt: 'Файлы .{ext} не поддерживаются',
    errNotFile: 'не является файлом',
    errTooLarge: 'превышает лимит {mb} МБ',
    errImageTooLarge: 'изображение превышает лимит 5 МБ',
    errUnreadable: 'не удаётся прочитать',
    errFileTooLarge: 'Файл превышает предельный размер',
    errParseFailed: 'Не удалось разобрать файл',
    errImageNoText:
      'Вложенные изображения не содержат текста; изображение отправляется вместе с сообщением пользователя',
    errNotImage: 'неподдерживаемый тип изображения',
    errNoApiKey: 'API-ключ для {provider} не настроен',
    errAiBusy: 'Сервис ИИ сейчас перегружен — повторите попытку чуть позже',
    errNoModel: 'Имя модели не настроено',
    errImgAbsPath: 'Путь к изображению должен быть абсолютным.',
    errImgNotFound: 'Файл изображения не найден: {path}',
    errImgTooLarge20: 'Изображение превышает 20 МБ и не может быть вставлено.',
    errImgBadType: 'Этот файл не является изображением PNG/JPEG/GIF.',
    errEncryptedOpenTitle: 'Не удаётся открыть книгу, защищённую паролем',
    errEncryptedUnsupported:
      'Файл зашифрован способом, который это приложение не может снять. Удалите пароль в Excel и откройте файл снова.',
    errDiskChanged: 'Книга была изменена на диске после открытия — используйте «Сохранить как».',
    errSaveUnreadable:
      'Сохранённый результат не удалось открыть снова, поэтому исходный файл не перезаписан. Он не изменился, а ваши правки остаются на экране.',
    menuFile: 'Файл',
    menuOpenWorkbook: 'Открыть книгу…',
    menuSave: 'Сохранить',
    menuSaveAs: 'Сохранить как…',
    menuExportPdf: 'Экспорт в PDF…',
    menuPrint: 'Печать…',
    menuClose: 'Закрыть',
    menuQuit: 'Выход',
    menuEdit: 'Правка',
    menuUndo: 'Отменить',
    menuRedo: 'Повторить',
    closeUnsavedMsg: 'Несохранённых изменений: {count}',
    closeUnsavedDetail: 'Если закрыть без сохранения, эти изменения будут потеряны.',
    btnDontSave: 'Не сохранять',
    btnCancel: 'Отмена',
    csvSaveAsNotice:
      'Формат CSV не сохраняет форматирование — сохраните в .xlsx, чтобы не потерять изменения.',
    menuExportCsv: 'Экспорт в CSV…',
    filterCsv: 'CSV (разделители — запятые)',
    csvFormulaLossMsg: 'Этот лист содержит формулы, которые формат CSV не сохраняет.',
    csvFormulaLossDetail:
      'CSV сохраняет только значения — формулы заменяются текущими результатами, а форматирование теряется.',
    csvKeepXlsxBtn: 'Сохранить как .xlsx',
    csvContinueBtn: 'Продолжить в CSV',
    csvActiveSheetOnlyNotice:
      'Файлы CSV содержат только один лист — будет экспортирован только активный лист «{name}».',
    csvKeepFormatMsg: 'Продолжить сохранение в формате CSV?',
    csvKeepFormatDetail:
      'CSV сохраняет только значения одного листа — формулы, форматирование и дополнительные листы не сохраняются в файле .csv.',
  },
  ar: {
    filterSpreadsheets: 'جداول البيانات',
    filterXlsx: 'مصنفات Excel',
    filterXlsm: 'مصنفات Excel ممكّنة بوحدات الماكرو',
    dlgAddAttachment: 'إضافة مرفقات',
    filterSupported: 'الملفات المدعومة',
    filterAll: 'كل الملفات',
    errUnsupportedExt: 'ملفات .{ext} غير مدعومة',
    errNotFile: 'ليس ملفًا',
    errTooLarge: 'يتجاوز الحد البالغ {mb} ميغابايت',
    errImageTooLarge: 'الصورة تتجاوز الحد البالغ 5 ميغابايت',
    errUnreadable: 'تعذّرت قراءته',
    errFileTooLarge: 'الملف يتجاوز حد الحجم',
    errParseFailed: 'فشل تحليل الملف',
    errImageNoText: 'مرفقات الصور لا تحتوي على نص؛ تُرسل الصورة مع رسالة المستخدم',
    errNotImage: 'نوع صورة غير مدعوم',
    errNoApiKey: 'لم يتم تكوين مفتاح API لـ {provider}',
    errAiBusy: 'خدمة الذكاء الاصطناعي مشغولة حاليًا — يرجى المحاولة مرة أخرى بعد قليل',
    errNoModel: 'لم يتم تكوين اسم النموذج',
    errImgAbsPath: 'يجب أن يكون مسار الصورة مسارًا مطلقًا.',
    errImgNotFound: 'لم يتم العثور على ملف الصورة: {path}',
    errImgTooLarge20: 'الصورة تتجاوز 20 ميغابايت ولا يمكن إدراجها.',
    errImgBadType: 'هذا الملف ليس صورة PNG/JPEG/GIF.',
    errEncryptedOpenTitle: 'تعذّر فتح المصنف المحمي بكلمة مرور',
    errEncryptedUnsupported:
      'يستخدم هذا الملف طريقة تشفير لا يستطيع هذا التطبيق فكّها. أزل كلمة المرور في Excel ثم افتحه مرة أخرى.',
    errDiskChanged: 'تم تغيير المصنف على القرص بعد فتحه — استخدم «حفظ باسم» بدلاً من ذلك.',
    errSaveUnreadable:
      'تعذّر فتح النتيجة المحفوظة مرة أخرى، لذا لم تتم الكتابة فوق الملف الأصلي. الملف الأصلي لم يتغير وتعديلاتك ما زالت على الشاشة.',
    menuFile: 'ملف',
    menuOpenWorkbook: 'فتح مصنف…',
    menuSave: 'حفظ',
    menuSaveAs: 'حفظ باسم…',
    menuExportPdf: 'تصدير PDF…',
    menuPrint: 'طباعة…',
    menuClose: 'إغلاق',
    menuQuit: 'إنهاء',
    menuEdit: 'تحرير',
    menuUndo: 'تراجع',
    menuRedo: 'إعادة',
    closeUnsavedMsg: 'يوجد {count} من التغييرات غير المحفوظة',
    closeUnsavedDetail: 'ستفقد هذه التغييرات إذا أغلقت دون حفظ.',
    btnDontSave: 'عدم الحفظ',
    btnCancel: 'إلغاء',
    csvSaveAsNotice: 'ملفات CSV لا تحتفظ بالتنسيق — احفظ بصيغة ‎.xlsx للاحتفاظ بجميع تغييراتك.',
    menuExportCsv: 'تصدير CSV…',
    filterCsv: 'CSV (محدد بفواصل)',
    csvFormulaLossMsg: 'تحتوي هذه الورقة على صيغ لا يمكن لتنسيق CSV الاحتفاظ بها.',
    csvFormulaLossDetail: 'يحتفظ CSV بالقيم فقط — تُستبدل الصيغ بنتائجها الحالية ويُفقد التنسيق.',
    csvKeepXlsxBtn: 'حفظ بصيغة .xlsx',
    csvContinueBtn: 'المتابعة بتنسيق CSV',
    csvActiveSheetOnlyNotice:
      'ملفات CSV تحتوي على ورقة واحدة فقط — سيتم تصدير الورقة النشطة «{name}» فقط.',
    csvKeepFormatMsg: 'هل تريد متابعة الحفظ بتنسيق CSV؟',
    csvKeepFormatDetail:
      'يحتفظ CSV بقيم ورقة واحدة فقط — لا تُحفظ الصيغ والتنسيق والأوراق الإضافية في ملف .csv.',
  },
  pt: {
    filterSpreadsheets: 'Planilhas',
    filterXlsx: 'Pastas de Trabalho do Excel',
    filterXlsm: 'Pastas de Trabalho Habilitadas para Macro do Excel',
    dlgAddAttachment: 'Adicionar Anexos',
    filterSupported: 'Arquivos Compatíveis',
    filterAll: 'Todos os Arquivos',
    errUnsupportedExt: 'arquivos .{ext} não são suportados',
    errNotFile: 'não é um arquivo',
    errTooLarge: 'excede o limite de {mb}MB',
    errImageTooLarge: 'a imagem excede o limite de 5MB',
    errUnreadable: 'não é possível ler',
    errFileTooLarge: 'O arquivo excede o limite de tamanho',
    errParseFailed: 'Falha ao analisar o arquivo',
    errImageNoText:
      'Anexos de imagem não têm texto; a imagem é enviada junto com a mensagem do usuário',
    errNotImage: 'não é um tipo de imagem suportado',
    errNoApiKey: 'Nenhuma chave de API configurada para {provider}',
    errAiBusy: 'O serviço de IA está sobrecarregado no momento — tente novamente em instantes',
    errNoModel: 'Nenhum nome de modelo configurado',
    errImgAbsPath: 'O caminho da imagem deve ser absoluto.',
    errImgNotFound: 'Arquivo de imagem não encontrado: {path}',
    errImgTooLarge20: 'A imagem excede 20MB e não pode ser inserida.',
    errImgBadType: 'O arquivo não é uma imagem PNG/JPEG/GIF.',
    errEncryptedOpenTitle: 'Não é possível abrir a pasta de trabalho protegida por senha',
    errEncryptedUnsupported:
      'Este arquivo usa um método de criptografia que este aplicativo não consegue desbloquear. Remova a senha no Excel e abra-o novamente.',
    errDiskChanged: 'A pasta de trabalho foi alterada no disco após ser aberta — use Salvar Como.',
    errSaveUnreadable:
      'Não foi possível reabrir o resultado salvo, então o arquivo original não foi substituído. O original está intacto e suas edições continuam na tela.',
    menuFile: 'Arquivo',
    menuOpenWorkbook: 'Abrir Pasta de Trabalho…',
    menuSave: 'Salvar',
    menuSaveAs: 'Salvar Como…',
    menuExportPdf: 'Exportar PDF…',
    menuPrint: 'Imprimir…',
    menuClose: 'Fechar',
    menuQuit: 'Sair',
    menuEdit: 'Editar',
    menuUndo: 'Desfazer',
    menuRedo: 'Refazer',
    closeUnsavedMsg: '{count} alteração(ões) não salva(s)',
    closeUnsavedDetail: 'Suas alterações serão perdidas se você fechar sem salvar.',
    btnDontSave: 'Não Salvar',
    btnCancel: 'Cancelar',
    csvSaveAsNotice:
      'Arquivos CSV não mantêm a formatação — salve como .xlsx para manter todas as suas alterações.',
    menuExportCsv: 'Exportar CSV…',
    filterCsv: 'CSV (separado por vírgulas)',
    csvFormulaLossMsg: 'Esta planilha contém fórmulas que o formato CSV não pode manter.',
    csvFormulaLossDetail:
      'O CSV mantém apenas valores — as fórmulas são substituídas pelos resultados atuais e a formatação é perdida.',
    csvKeepXlsxBtn: 'Salvar como .xlsx',
    csvContinueBtn: 'Continuar como CSV',
    csvActiveSheetOnlyNotice:
      'Arquivos CSV contêm apenas uma planilha — apenas a planilha ativa “{name}” será exportada.',
    csvKeepFormatMsg: 'Continuar salvando no formato CSV?',
    csvKeepFormatDetail:
      'O CSV mantém apenas os valores de uma única planilha — fórmulas, formatação e planilhas adicionais não são salvas no arquivo .csv.',
  },
  it: {
    filterSpreadsheets: 'Fogli di calcolo',
    filterXlsx: 'Cartelle di lavoro di Excel',
    filterXlsm: 'Cartelle di lavoro di Excel con attivazione macro',
    dlgAddAttachment: 'Aggiungi allegati',
    filterSupported: 'File supportati',
    filterAll: 'Tutti i file',
    errUnsupportedExt: 'i file .{ext} non sono supportati',
    errNotFile: 'non è un file',
    errTooLarge: 'supera il limite di {mb} MB',
    errImageTooLarge: "l'immagine supera il limite di 5 MB",
    errUnreadable: 'impossibile leggere',
    errFileTooLarge: 'Il file supera il limite di dimensione',
    errParseFailed: 'Impossibile analizzare il file',
    errImageNoText:
      "Gli allegati immagine non hanno testo; l'immagine viene inviata insieme al messaggio dell'utente",
    errNotImage: 'tipo di immagine non supportato',
    errNoApiKey: 'Nessuna chiave API configurata per {provider}',
    errAiBusy: 'Il servizio IA è momentaneamente sovraccarico — riprova tra poco',
    errNoModel: 'Nessun nome di modello configurato',
    errImgAbsPath: "Il percorso dell'immagine deve essere assoluto.",
    errImgNotFound: 'File immagine non trovato: {path}',
    errImgTooLarge20: "L'immagine supera i 20 MB e non può essere inserita.",
    errImgBadType: "Il file non è un'immagine PNG/JPEG/GIF.",
    errEncryptedOpenTitle: 'Impossibile aprire la cartella di lavoro protetta da password',
    errEncryptedUnsupported:
      'Questo file usa un metodo di crittografia che questa app non può sbloccare. Rimuovi la password in Excel, poi riaprilo.',
    errDiskChanged:
      "La cartella di lavoro è stata modificata sul disco dopo l'apertura — usa Salva con nome.",
    errSaveUnreadable:
      "Non è stato possibile riaprire il risultato salvato, quindi il file originale non è stato sovrascritto. L'originale è invariato e le modifiche sono ancora sullo schermo.",
    menuFile: 'File',
    menuOpenWorkbook: 'Apri cartella di lavoro…',
    menuSave: 'Salva',
    menuSaveAs: 'Salva con nome…',
    menuExportPdf: 'Esporta PDF…',
    menuPrint: 'Stampa…',
    menuClose: 'Chiudi',
    menuQuit: 'Esci',
    menuEdit: 'Modifica',
    menuUndo: 'Annulla',
    menuRedo: 'Ripeti',
    closeUnsavedMsg: '{count} modifica/e non salvata/e',
    closeUnsavedDetail: 'Le modifiche andranno perse se chiudi senza salvare.',
    btnDontSave: 'Non salvare',
    btnCancel: 'Annulla',
    csvSaveAsNotice:
      'I file CSV non conservano la formattazione: salva come .xlsx per mantenere tutte le modifiche.',
    menuExportCsv: 'Esporta CSV…',
    filterCsv: 'CSV (delimitato da virgole)',
    csvFormulaLossMsg: 'Questo foglio contiene formule che il formato CSV non può conservare.',
    csvFormulaLossDetail:
      'Il CSV conserva solo i valori: le formule vengono sostituite dai risultati attuali e la formattazione viene persa.',
    csvKeepXlsxBtn: 'Salva come .xlsx',
    csvContinueBtn: 'Continua come CSV',
    csvActiveSheetOnlyNotice:
      'I file CSV contengono un solo foglio: verrà esportato solo il foglio attivo “{name}”.',
    csvKeepFormatMsg: 'Continuare a salvare in formato CSV?',
    csvKeepFormatDetail:
      'Il CSV conserva solo i valori di un singolo foglio: formule, formattazione e fogli aggiuntivi non vengono salvati nel file .csv.',
  },
  pl: {
    filterSpreadsheets: 'Arkusze kalkulacyjne',
    filterXlsx: 'Skoroszyty programu Excel',
    filterXlsm: 'Skoroszyty programu Excel z obsługą makr',
    dlgAddAttachment: 'Dodaj załączniki',
    filterSupported: 'Obsługiwane pliki',
    filterAll: 'Wszystkie pliki',
    errUnsupportedExt: 'pliki .{ext} nie są obsługiwane',
    errNotFile: 'to nie jest plik',
    errTooLarge: 'przekracza limit {mb} MB',
    errImageTooLarge: 'obraz przekracza limit 5 MB',
    errUnreadable: 'nie można odczytać',
    errFileTooLarge: 'Plik przekracza limit rozmiaru',
    errParseFailed: 'Nie udało się przeanalizować pliku',
    errImageNoText:
      'Załączniki graficzne nie zawierają tekstu; obraz jest wysyłany razem z wiadomością użytkownika',
    errNotImage: 'nieobsługiwany typ obrazu',
    errNoApiKey: 'Nie skonfigurowano klucza API dla {provider}',
    errAiBusy: 'Usługa AI jest obecnie przeciążona — spróbuj ponownie za chwilę',
    errNoModel: 'Nie skonfigurowano nazwy modelu',
    errImgAbsPath: 'Ścieżka obrazu musi być bezwzględna.',
    errImgNotFound: 'Nie znaleziono pliku obrazu: {path}',
    errImgTooLarge20: 'Obraz przekracza 20 MB i nie może zostać wstawiony.',
    errImgBadType: 'Plik nie jest obrazem PNG/JPEG/GIF.',
    errEncryptedOpenTitle: 'Nie można otworzyć skoroszytu chronionego hasłem',
    errEncryptedUnsupported:
      'Ten plik używa metody szyfrowania, której ta aplikacja nie potrafi odblokować. Usuń hasło w programie Excel i otwórz plik ponownie.',
    errDiskChanged: 'Skoroszyt został zmieniony na dysku po otwarciu — użyj polecenia Zapisz jako.',
    errSaveUnreadable:
      'Nie udało się ponownie otworzyć zapisanego wyniku, więc oryginalny plik nie został nadpisany. Oryginał jest bez zmian, a Twoje edycje nadal są na ekranie.',
    menuFile: 'Plik',
    menuOpenWorkbook: 'Otwórz skoroszyt…',
    menuSave: 'Zapisz',
    menuSaveAs: 'Zapisz jako…',
    menuExportPdf: 'Eksportuj PDF…',
    menuPrint: 'Drukuj…',
    menuClose: 'Zamknij',
    menuQuit: 'Zakończ',
    menuEdit: 'Edycja',
    menuUndo: 'Cofnij',
    menuRedo: 'Ponów',
    closeUnsavedMsg: 'Niezapisane zmiany: {count}',
    closeUnsavedDetail: 'Zmiany zostaną utracone, jeśli zamkniesz bez zapisywania.',
    btnDontSave: 'Nie zapisuj',
    btnCancel: 'Anuluj',
    csvSaveAsNotice:
      'Pliki CSV nie zachowują formatowania — zapisz jako .xlsx, aby zachować wszystkie zmiany.',
    menuExportCsv: 'Eksportuj CSV…',
    filterCsv: 'CSV (rozdzielany przecinkami)',
    csvFormulaLossMsg: 'Ten arkusz zawiera formuły, których format CSV nie zachowuje.',
    csvFormulaLossDetail:
      'CSV zachowuje tylko wartości — formuły są zastępowane bieżącymi wynikami, a formatowanie jest tracone.',
    csvKeepXlsxBtn: 'Zapisz jako .xlsx',
    csvContinueBtn: 'Kontynuuj jako CSV',
    csvActiveSheetOnlyNotice:
      'Pliki CSV zawierają tylko jeden arkusz — wyeksportowany zostanie tylko aktywny arkusz „{name}”.',
    csvKeepFormatMsg: 'Kontynuować zapisywanie w formacie CSV?',
    csvKeepFormatDetail:
      'CSV zachowuje tylko wartości jednego arkusza — formuły, formatowanie i dodatkowe arkusze nie są zapisywane w pliku .csv.',
  },
  cs: {
    filterSpreadsheets: 'Tabulky',
    filterXlsx: 'Sešity Excelu',
    filterXlsm: 'Sešity Excelu s podporou maker',
    dlgAddAttachment: 'Přidat přílohy',
    filterSupported: 'Podporované soubory',
    filterAll: 'Všechny soubory',
    errUnsupportedExt: 'soubory .{ext} nejsou podporovány',
    errNotFile: 'není soubor',
    errTooLarge: 'překračuje limit {mb} MB',
    errImageTooLarge: 'obrázek překračuje limit 5 MB',
    errUnreadable: 'nelze přečíst',
    errFileTooLarge: 'Soubor překračuje limit velikosti',
    errParseFailed: 'Soubor se nepodařilo zpracovat',
    errImageNoText:
      'Obrázkové přílohy neobsahují text; obrázek se odesílá spolu se zprávou uživatele',
    errNotImage: 'nepodporovaný typ obrázku',
    errNoApiKey: 'Pro {provider} není nakonfigurován žádný klíč API',
    errAiBusy: 'Služba AI je momentálně zaneprázdněna — zkuste to prosím za chvíli znovu',
    errNoModel: 'Není nakonfigurován název modelu',
    errImgAbsPath: 'Cesta k obrázku musí být absolutní.',
    errImgNotFound: 'Soubor obrázku nebyl nalezen: {path}',
    errImgTooLarge20: 'Obrázek překračuje 20 MB a nelze ho vložit.',
    errImgBadType: 'Soubor není obrázek PNG/JPEG/GIF.',
    errEncryptedOpenTitle: 'Sešit chráněný heslem nelze otevřít',
    errEncryptedUnsupported:
      'Tento soubor používá způsob šifrování, který tato aplikace neumí odemknout. Odeberte heslo v Excelu a soubor otevřete znovu.',
    errDiskChanged: 'Sešit byl po otevření změněn na disku — použijte místo toho Uložit jako.',
    errSaveUnreadable:
      'Uložený výsledek nešlo znovu otevřít, proto původní soubor nebyl přepsán. Původní soubor je beze změny a vaše úpravy jsou stále na obrazovce.',
    menuFile: 'Soubor',
    menuOpenWorkbook: 'Otevřít sešit…',
    menuSave: 'Uložit',
    menuSaveAs: 'Uložit jako…',
    menuExportPdf: 'Exportovat PDF…',
    menuPrint: 'Tisk…',
    menuClose: 'Zavřít',
    menuQuit: 'Ukončit',
    menuEdit: 'Úpravy',
    menuUndo: 'Zpět',
    menuRedo: 'Znovu',
    closeUnsavedMsg: 'Neuložené změny: {count}',
    closeUnsavedDetail: 'Pokud zavřete bez uložení, změny budou ztraceny.',
    btnDontSave: 'Neukládat',
    btnCancel: 'Zrušit',
    csvSaveAsNotice:
      'Soubory CSV nezachovávají formátování — uložením jako .xlsx zachováte všechny změny.',
    menuExportCsv: 'Exportovat CSV…',
    filterCsv: 'CSV (oddělený čárkami)',
    csvFormulaLossMsg: 'Tento list obsahuje vzorce, které formát CSV nezachová.',
    csvFormulaLossDetail:
      'CSV zachovává pouze hodnoty — vzorce se nahradí aktuálními výsledky a formátování se ztratí.',
    csvKeepXlsxBtn: 'Uložit jako .xlsx',
    csvContinueBtn: 'Pokračovat jako CSV',
    csvActiveSheetOnlyNotice:
      'Soubory CSV obsahují jen jeden list — exportován bude pouze aktivní list „{name}“.',
    csvKeepFormatMsg: 'Pokračovat v ukládání ve formátu CSV?',
    csvKeepFormatDetail:
      'CSV zachovává pouze hodnoty jednoho listu — vzorce, formátování a další listy se do souboru .csv neuloží.',
  },
  nl: {
    filterSpreadsheets: 'Spreadsheets',
    filterXlsx: 'Excel-werkmappen',
    filterXlsm: "Excel-werkmappen met macro's",
    dlgAddAttachment: 'Bijlagen toevoegen',
    filterSupported: 'Ondersteunde bestanden',
    filterAll: 'Alle bestanden',
    errUnsupportedExt: '.{ext}-bestanden worden niet ondersteund',
    errNotFile: 'geen bestand',
    errTooLarge: 'overschrijdt de limiet van {mb} MB',
    errImageTooLarge: 'afbeelding overschrijdt de limiet van 5 MB',
    errUnreadable: 'kan niet worden gelezen',
    errFileTooLarge: 'Bestand overschrijdt de maximale grootte',
    errParseFailed: 'Kan bestand niet parseren',
    errImageNoText:
      'Afbeeldingsbijlagen bevatten geen tekst; de afbeelding wordt samen met het gebruikersbericht verzonden',
    errNotImage: 'geen ondersteund afbeeldingstype',
    errNoApiKey: 'Geen API-sleutel geconfigureerd voor {provider}',
    errAiBusy: 'De AI-service is momenteel overbelast — probeer het zo opnieuw',
    errNoModel: 'Geen modelnaam geconfigureerd',
    errImgAbsPath: 'Het afbeeldingspad moet absoluut zijn.',
    errImgNotFound: 'Afbeeldingsbestand niet gevonden: {path}',
    errImgTooLarge20: 'De afbeelding is groter dan 20 MB en kan niet worden ingevoegd.',
    errImgBadType: 'Het bestand is geen PNG/JPEG/GIF-afbeelding.',
    errEncryptedOpenTitle: 'De met een wachtwoord beveiligde werkmap kan niet worden geopend',
    errEncryptedUnsupported:
      'Dit bestand gebruikt een versleutelingsmethode die deze app niet kan ontgrendelen. Verwijder het wachtwoord in Excel en open het bestand opnieuw.',
    errDiskChanged:
      'De werkmap is op de schijf gewijzigd nadat deze was geopend — gebruik Opslaan als.',
    errSaveUnreadable:
      'Het opgeslagen resultaat kon niet opnieuw worden geopend, dus het oorspronkelijke bestand is niet overschreven. Het origineel is ongewijzigd en je bewerkingen staan nog op het scherm.',
    menuFile: 'Bestand',
    menuOpenWorkbook: 'Werkmap openen…',
    menuSave: 'Opslaan',
    menuSaveAs: 'Opslaan als…',
    menuExportPdf: 'PDF exporteren…',
    menuPrint: 'Afdrukken…',
    menuClose: 'Sluiten',
    menuQuit: 'Stoppen',
    menuEdit: 'Bewerken',
    menuUndo: 'Ongedaan maken',
    menuRedo: 'Opnieuw',
    closeUnsavedMsg: '{count} niet-opgeslagen wijziging(en)',
    closeUnsavedDetail: 'Uw wijzigingen gaan verloren als u sluit zonder op te slaan.',
    btnDontSave: 'Niet opslaan',
    btnCancel: 'Annuleren',
    csvSaveAsNotice:
      'CSV-bestanden bewaren geen opmaak — sla op als .xlsx om al uw wijzigingen te behouden.',
    menuExportCsv: 'CSV exporteren…',
    filterCsv: 'CSV (kommagescheiden)',
    csvFormulaLossMsg: 'Dit blad bevat formules die het CSV-formaat niet kan bewaren.',
    csvFormulaLossDetail:
      'CSV bewaart alleen waarden — formules worden vervangen door hun huidige resultaten en opmaak gaat verloren.',
    csvKeepXlsxBtn: 'Opslaan als .xlsx',
    csvContinueBtn: 'Doorgaan als CSV',
    csvActiveSheetOnlyNotice:
      'CSV-bestanden bevatten slechts één blad — alleen het actieve blad “{name}” wordt geëxporteerd.',
    csvKeepFormatMsg: 'Doorgaan met opslaan in CSV-indeling?',
    csvKeepFormatDetail:
      'CSV bewaart alleen de waarden van één blad — formules, opmaak en extra bladen worden niet in het .csv-bestand opgeslagen.',
  },
  ms: {
    filterSpreadsheets: 'Hamparan',
    filterXlsx: 'Buku Kerja Excel',
    filterXlsm: 'Buku Kerja Excel Didayakan Makro',
    dlgAddAttachment: 'Tambah Lampiran',
    filterSupported: 'Fail yang Disokong',
    filterAll: 'Semua Fail',
    errUnsupportedExt: 'fail .{ext} tidak disokong',
    errNotFile: 'bukan fail',
    errTooLarge: 'melebihi had {mb}MB',
    errImageTooLarge: 'imej melebihi had 5MB',
    errUnreadable: 'tidak dapat dibaca',
    errFileTooLarge: 'Fail melebihi had saiz',
    errParseFailed: 'Gagal menghurai fail',
    errImageNoText: 'Lampiran imej tiada teks; imej dihantar bersama mesej pengguna',
    errNotImage: 'bukan jenis imej yang disokong',
    errNoApiKey: 'Kunci API untuk {provider} belum dikonfigurasikan',
    errAiBusy: 'Perkhidmatan AI sedang sibuk — sila cuba lagi sebentar lagi',
    errNoModel: 'Nama model belum dikonfigurasikan',
    errImgAbsPath: 'Laluan imej mestilah laluan mutlak.',
    errImgNotFound: 'Fail imej tidak ditemui: {path}',
    errImgTooLarge20: 'Imej melebihi 20MB dan tidak boleh disisipkan.',
    errImgBadType: 'Fail ini bukan imej PNG/JPEG/GIF.',
    errEncryptedOpenTitle: 'Tidak dapat membuka buku kerja yang dilindungi kata laluan',
    errEncryptedUnsupported:
      'Fail ini menggunakan kaedah penyulitan yang tidak dapat dibuka oleh aplikasi ini. Buang kata laluan dalam Excel, kemudian buka semula.',
    errDiskChanged: 'Buku kerja telah diubah pada cakera selepas dibuka — gunakan Simpan Sebagai.',
    errSaveUnreadable:
      'Hasil yang disimpan tidak dapat dibuka semula, jadi fail asal tidak ditulis ganti. Fail asal tidak berubah dan suntingan anda masih pada skrin.',
    menuFile: 'Fail',
    menuOpenWorkbook: 'Buka Buku Kerja…',
    menuSave: 'Simpan',
    menuSaveAs: 'Simpan Sebagai…',
    menuExportPdf: 'Eksport PDF…',
    menuPrint: 'Cetak…',
    menuClose: 'Tutup',
    menuQuit: 'Keluar',
    menuEdit: 'Edit',
    menuUndo: 'Buat Asal',
    menuRedo: 'Buat Semula',
    closeUnsavedMsg: '{count} perubahan belum disimpan',
    closeUnsavedDetail: 'Perubahan anda akan hilang jika anda menutup tanpa menyimpan.',
    btnDontSave: 'Jangan Simpan',
    btnCancel: 'Batal',
    csvSaveAsNotice:
      'Fail CSV tidak dapat menyimpan pemformatan — simpan sebagai .xlsx untuk mengekalkan semua perubahan anda.',
    menuExportCsv: 'Eksport CSV…',
    filterCsv: 'CSV (dipisahkan koma)',
    csvFormulaLossMsg:
      'Helaian ini mengandungi formula yang tidak dapat disimpan dalam format CSV.',
    csvFormulaLossDetail:
      'CSV hanya menyimpan nilai — formula digantikan dengan hasil semasa, dan pemformatan akan hilang.',
    csvKeepXlsxBtn: 'Simpan sebagai .xlsx',
    csvContinueBtn: 'Teruskan sebagai CSV',
    csvActiveSheetOnlyNotice:
      'Fail CSV hanya mengandungi satu helaian — hanya helaian aktif “{name}” akan dieksport.',
    csvKeepFormatMsg: 'Terus simpan dalam format CSV?',
    csvKeepFormatDetail:
      'CSV hanya menyimpan nilai satu helaian — formula, pemformatan dan helaian tambahan tidak disimpan ke fail .csv.',
  },
  he: {
    filterSpreadsheets: 'גיליונות אלקטרוניים',
    filterXlsx: 'חוברות עבודה של Excel',
    filterXlsm: 'חוברות עבודה של Excel מותאמות מאקרו',
    dlgAddAttachment: 'הוספת קבצים מצורפים',
    filterSupported: 'קבצים נתמכים',
    filterAll: 'כל הקבצים',
    errUnsupportedExt: 'קובצי .{ext} אינם נתמכים',
    errNotFile: 'אינו קובץ',
    errTooLarge: 'חורג מהמגבלה של {mb}MB',
    errImageTooLarge: 'התמונה חורגת מהמגבלה של 5MB',
    errUnreadable: 'לא ניתן לקרוא',
    errFileTooLarge: 'הקובץ חורג ממגבלת הגודל',
    errParseFailed: 'ניתוח הקובץ נכשל',
    errImageNoText: 'קבצים מצורפים מסוג תמונה אינם מכילים טקסט; התמונה נשלחת יחד עם הודעת המשתמש',
    errNotImage: 'סוג תמונה שאינו נתמך',
    errNoApiKey: 'לא הוגדר מפתח API עבור {provider}',
    errAiBusy: 'שירות ה-AI עמוס כרגע — נסו שוב בעוד רגע',
    errNoModel: 'לא הוגדר שם מודל',
    errImgAbsPath: 'נתיב התמונה חייב להיות מוחלט.',
    errImgNotFound: 'קובץ התמונה לא נמצא: {path}',
    errImgTooLarge20: 'התמונה חורגת מ-20MB ולא ניתן להוסיף אותה.',
    errImgBadType: 'הקובץ אינו תמונת PNG/JPEG/GIF.',
    errEncryptedOpenTitle: 'לא ניתן לפתוח את חוברת העבודה המוגנת בסיסמה',
    errEncryptedUnsupported:
      'הקובץ משתמש בשיטת הצפנה שהיישום אינו יכול לפתוח. הסירו את הסיסמה ב-Excel ופתחו אותו שוב.',
    errDiskChanged: 'חוברת העבודה השתנתה בדיסק לאחר פתיחתה — השתמש בשמירה בשם.',
    errSaveUnreadable:
      'לא ניתן היה לפתוח שוב את התוצאה שנשמרה, ולכן הקובץ המקורי לא נדרס. הקובץ המקורי לא השתנה והעריכות שלך עדיין על המסך.',
    menuFile: 'קובץ',
    menuOpenWorkbook: 'פתיחת חוברת עבודה…',
    menuSave: 'שמירה',
    menuSaveAs: 'שמירה בשם…',
    menuExportPdf: 'ייצוא PDF…',
    menuPrint: 'הדפסה…',
    menuClose: 'סגירה',
    menuQuit: 'יציאה',
    menuEdit: 'עריכה',
    menuUndo: 'בטל',
    menuRedo: 'בצע שוב',
    closeUnsavedMsg: '{count} שינויים שלא נשמרו',
    closeUnsavedDetail: 'השינויים שלך יאבדו אם תסגור בלי לשמור.',
    btnDontSave: 'אל תשמור',
    btnCancel: 'ביטול',
    csvSaveAsNotice: 'קובצי CSV אינם שומרים עיצוב — שמרו כ‑.xlsx כדי לשמור על כל השינויים.',
    menuExportCsv: 'ייצוא CSV…',
    filterCsv: 'CSV (מופרד באמצעות פסיקים)',
    csvFormulaLossMsg: 'גיליון זה מכיל נוסחאות שתבנית CSV אינה יכולה לשמור.',
    csvFormulaLossDetail:
      'CSV שומר ערכים בלבד — נוסחאות מוחלפות בתוצאות הנוכחיות שלהן, והעיצוב אובד.',
    csvKeepXlsxBtn: 'שמירה כ-.xlsx',
    csvContinueBtn: 'המשך שמירה כ-CSV',
    csvActiveSheetOnlyNotice: 'קובצי CSV מכילים גיליון אחד בלבד — רק הגיליון הפעיל "{name}" ייוצא.',
    csvKeepFormatMsg: 'להמשיך לשמור בתבנית CSV?',
    csvKeepFormatDetail:
      'CSV שומר רק את הערכים של גיליון אחד — נוסחאות, עיצוב וגיליונות נוספים אינם נשמרים בקובץ ה-.csv.',
  },
  hi: {
    filterSpreadsheets: 'स्प्रेडशीट',
    filterXlsx: 'Excel कार्यपुस्तिकाएँ',
    filterXlsm: 'Excel मैक्रो-सक्षम कार्यपुस्तिकाएँ',
    dlgAddAttachment: 'अनुलग्नक जोड़ें',
    filterSupported: 'समर्थित फ़ाइलें',
    filterAll: 'सभी फ़ाइलें',
    errUnsupportedExt: '.{ext} फ़ाइलें समर्थित नहीं हैं',
    errNotFile: 'फ़ाइल नहीं है',
    errTooLarge: '{mb}MB की सीमा से अधिक है',
    errImageTooLarge: 'छवि 5MB की सीमा से अधिक है',
    errUnreadable: 'पढ़ा नहीं जा सकता',
    errFileTooLarge: 'फ़ाइल आकार सीमा से अधिक है',
    errParseFailed: 'फ़ाइल पार्स करने में विफल',
    errImageNoText: 'छवि अनुलग्नक में टेक्स्ट नहीं होता; छवि उपयोगकर्ता संदेश के साथ भेजी जाती है',
    errNotImage: 'समर्थित छवि प्रकार नहीं है',
    errNoApiKey: '{provider} के लिए कोई API कुंजी कॉन्फ़िगर नहीं है',
    errAiBusy: 'AI सेवा अभी व्यस्त है — कृपया थोड़ी देर बाद फिर से प्रयास करें',
    errNoModel: 'कोई मॉडल नाम कॉन्फ़िगर नहीं है',
    errImgAbsPath: 'छवि पथ निरपेक्ष होना चाहिए।',
    errImgNotFound: 'छवि फ़ाइल नहीं मिली: {path}',
    errImgTooLarge20: 'छवि 20MB से अधिक है और सम्मिलित नहीं की जा सकती।',
    errImgBadType: 'यह फ़ाइल PNG/JPEG/GIF छवि नहीं है।',
    errEncryptedOpenTitle: 'पासवर्ड से सुरक्षित वर्कबुक नहीं खोली जा सकती',
    errEncryptedUnsupported:
      'यह फ़ाइल ऐसी एन्क्रिप्शन विधि का उपयोग करती है जिसे यह ऐप अनलॉक नहीं कर सकता। Excel में पासवर्ड हटाएँ, फिर इसे दोबारा खोलें।',
    errDiskChanged:
      'खोले जाने के बाद कार्यपुस्तिका डिस्क पर बदल गई — इसके बजाय इस रूप में सहेजें का उपयोग करें।',
    errSaveUnreadable:
      'सहेजा गया परिणाम फिर से नहीं खुल सका, इसलिए मूल फ़ाइल को अधिलेखित नहीं किया गया। मूल फ़ाइल अपरिवर्तित है और आपके संपादन अभी भी स्क्रीन पर हैं।',
    menuFile: 'फ़ाइल',
    menuOpenWorkbook: 'कार्यपुस्तिका खोलें…',
    menuSave: 'सहेजें',
    menuSaveAs: 'इस रूप में सहेजें…',
    menuExportPdf: 'PDF निर्यात करें…',
    menuPrint: 'प्रिंट करें…',
    menuClose: 'बंद करें',
    menuQuit: 'बाहर निकलें',
    menuEdit: 'संपादन',
    menuUndo: 'पूर्ववत करें',
    menuRedo: 'फिर से करें',
    closeUnsavedMsg: '{count} सहेजे नहीं गए परिवर्तन',
    closeUnsavedDetail: 'यदि आप बिना सहेजे बंद करते हैं तो आपके परिवर्तन खो जाएँगे।',
    btnDontSave: 'न सहेजें',
    btnCancel: 'रद्द करें',
    csvSaveAsNotice:
      'CSV फ़ाइलें फ़ॉर्मेटिंग सहेज नहीं सकतीं — सभी बदलाव बनाए रखने के लिए .xlsx के रूप में सहेजें।',
    menuExportCsv: 'CSV निर्यात करें…',
    filterCsv: 'CSV (अल्पविराम द्वारा सीमांकित)',
    csvFormulaLossMsg: 'इस शीट में ऐसे सूत्र हैं जिन्हें CSV प्रारूप सहेज नहीं सकता।',
    csvFormulaLossDetail:
      'CSV केवल मान रखता है — सूत्र उनके वर्तमान परिणामों से बदल दिए जाते हैं और फ़ॉर्मेटिंग खो जाती है।',
    csvKeepXlsxBtn: '.xlsx के रूप में सहेजें',
    csvContinueBtn: 'CSV के रूप में जारी रखें',
    csvActiveSheetOnlyNotice:
      'CSV फ़ाइलों में केवल एक शीट होती है — केवल सक्रिय शीट “{name}” निर्यात की जाएगी।',
    csvKeepFormatMsg: 'CSV प्रारूप में सहेजना जारी रखें?',
    csvKeepFormatDetail:
      'CSV केवल एक शीट के मान रखता है — सूत्र, स्वरूपण और अतिरिक्त शीट .csv फ़ाइल में सहेजे नहीं जाते।',
  },
  'zh-TW': {
    filterSpreadsheets: '電子試算表',
    filterXlsx: 'Excel 活頁簿',
    filterXlsm: 'Excel 啟用巨集的活頁簿',
    dlgAddAttachment: '新增附件',
    filterSupported: '支援的檔案',
    filterAll: '所有檔案',
    errUnsupportedExt: '暫不支援 .{ext} 類型',
    errNotFile: '不是檔案',
    errTooLarge: '超過 {mb}MB 上限',
    errImageTooLarge: '圖片超過 5MB 上限',
    errUnreadable: '無法讀取',
    errFileTooLarge: '檔案超過大小上限',
    errParseFailed: '檔案解析失敗',
    errImageNoText: '圖片附件不提供文字,已作為影像隨使用者訊息傳送,直接看圖即可',
    errNotImage: '不是支援的圖片類型',
    errNoApiKey: '未設定 {provider} 的 API Key',
    errAiBusy: 'AI 服務目前繁忙，請稍後重試',
    errNoModel: '未設定模型名稱',
    errImgAbsPath: '圖片路徑必須是絕對路徑。',
    errImgNotFound: '找不到圖片檔案: {path}',
    errImgTooLarge20: '圖片超過 20MB,不支援插入。',
    errImgBadType: '該檔案不是 PNG/JPEG/GIF 圖片。',
    errEncryptedOpenTitle: '無法開啟受密碼保護的活頁簿',
    errEncryptedUnsupported:
      '此檔案使用的加密方式本應用程式無法解開。請在 Excel 中移除密碼後重新開啟。',
    errDiskChanged: '活頁簿在開啟後被磁碟上的變更覆蓋——請改用另存新檔。',
    errSaveUnreadable:
      '無法重新開啟儲存結果，因此沒有覆寫原始檔案。原始檔案保持不變，編輯內容仍在畫面上。',
    menuFile: '檔案',
    menuOpenWorkbook: '開啟活頁簿…',
    menuSave: '儲存',
    menuSaveAs: '另存新檔…',
    menuExportPdf: '匯出 PDF…',
    menuPrint: '列印…',
    menuClose: '關閉',
    menuQuit: '結束',
    menuEdit: '編輯',
    menuUndo: '復原',
    menuRedo: '重做',
    closeUnsavedMsg: '有 {count} 處未儲存的修改',
    closeUnsavedDetail: '不儲存直接關閉,這些修改將遺失。',
    btnDontSave: '不儲存',
    btnCancel: '取消',
    csvSaveAsNotice: 'CSV 格式不保留樣式等格式修改——另存為 .xlsx 可保留全部內容。',
    menuExportCsv: '匯出 CSV…',
    filterCsv: 'CSV (逗號分隔)',
    csvFormulaLossMsg: '目前工作表包含公式,CSV 格式無法保留。',
    csvFormulaLossDetail: 'CSV 只保留純文字值——公式會被取代為目前計算結果,格式也會遺失。',
    csvKeepXlsxBtn: '另存為 .xlsx',
    csvContinueBtn: '繼續儲存為 CSV',
    csvActiveSheetOnlyNotice: 'CSV 檔案只包含一張工作表——只會匯出目前工作表「{name}」。',
    csvKeepFormatMsg: '要繼續以 CSV 格式儲存嗎?',
    csvKeepFormatDetail: 'CSV 只保留單張工作表的純值——公式、格式和其他工作表不會存入 .csv 檔案。',
  },
})
const tm = (key: Parameters<typeof tMain>[1], params?: Parameters<typeof tMain>[2]) =>
  tMain(getUiLang(), key, params)

interface SessionInfo {
  readonly path: string
  /// Byte-for-byte copy of the file as it was opened (in the OS temp dir).
  /// Saves patch this snapshot rather than the live path, so an external
  /// overwrite of the file can never corrupt the save base — and Save As
  /// stays usable after one. Removed when the session closes.
  readonly snapshotPath: string
  /// Digest of the snapshot (== the file at open time).
  readonly sha256: string
  readonly sheetNames: ReadonlyMap<string, string>
  readonly automaticRecoveryDisabled: boolean
  /// Set when the session opened a converted copy (.xls import): the
  /// first save routes through Save As, defaulting to this .xlsx path.
  readonly suggestSaveAs?: string
  /// The shell's "New spreadsheet" backing file in a temp directory: like an
  /// import the first Save is a Save As, but AutoSave and the recovery copy
  /// keep running (keyed on suggestSaveAs), and a quiet save writes in place.
  readonly unsavedNew?: boolean
  /// The converted copy came from a CSV: the Save As dialog explains that
  /// formatting requires .xlsx (CSV keeps values only).
  readonly csvImport?: boolean
  /// CSV session: the original .csv on disk. Save keeps the CSV identity —
  /// the xlsx save lands on the temp copy and the serialized csvContent is
  /// written back here.
  readonly csvSourcePath?: string
  /// Digest of the original .csv at open/save time — guards the write-back
  /// against external modification, like restoreTargetSha.
  readonly csvSourceSha?: string
  /// App-owned directory containing the converted CSV/XLS copy. Removed only
  /// after the sidecar session and its independent snapshot are closed.
  readonly importTempDir?: string
  /// Set when the session opened a restored crash-recovery copy: the restore
  /// prompt was the user's confirmation, so a plain Save silently writes back
  /// to this original path (no Save As detour).
  readonly restoreTarget?: string
  /// Digest of the original file at restore time — guards the silent
  /// write-back against external modification, mirroring the sha256 check on
  /// the session's own path.
  readonly restoreTargetSha?: string
  /// The opened file was 0 bytes: the session runs on a blank archive in the
  /// temp dir and restoreTarget is the empty original. Unlike a restored
  /// recovery copy, this session still needs its own crash-recovery copy,
  /// keyed by the original.
  readonly emptySource?: boolean
  /// The user's file is password-protected: the session runs on a decrypted
  /// copy in importTempDir, restoreTarget (or, for a converted .xls,
  /// suggestSaveAs) is the encrypted file, and every save re-encrypts with this
  /// password before it reaches the target. Held in memory only; the crash
  /// recovery copy is off so no plaintext lands under userData.
  readonly password?: string
  /// The copy an untitled workbook writes (its own slot in the recovery store),
  /// the untitled copy of a CSV or converted session, or the copy a tab
  /// restored as untitled because its original was missing.
  readonly recoveryIdentity?: RecoveryIdentity
  /// The file a CSV or converted session (or the untitled workbook restored
  /// from its copy) came from: its copy is titled with this file's name and
  /// records the path, which the first Save As offers again after a restore.
  readonly recoveryOriginalPath?: string
  /// Opened from a recovery copy and not saved since: the work exists only in
  /// the copy (the journal is empty), so the tab counts as unsaved.
  readonly unsavedRestore?: boolean
  /// Split-view save guard (@genoffice/electron-utils/save-conflict): the disk
  /// snapshot this copy last read or wrote, with the document path it belongs
  /// to (a CSV session's snapshot is its .csv, not the converted temp copy).
  /// Recorded at open and after every successful save.
  readonly diskState?: { readonly path: string; readonly state: SaveDiskState }
}

// ---- runtime configuration (paths differ when bundled into the shell) ----

/** AI create_document content the sheets app cannot build itself — the shell
 * routes it into the docs-owned creation flow (docx opens a fresh docs tab). */
export interface SheetsAiHostDocumentRequest {
  type: 'docx' | 'pdf' | 'md' | 'html'
  title: string
  content: string
}

interface SheetsRuntimeConfig {
  /** absolute path to the sheets preload bundle */
  preloadPath: string
  /** dev-server URL for the sheets renderer (wins over rendererFile) */
  rendererUrl?: string | undefined
  /** absolute path to the built sheets renderer index.html */
  rendererFile: string
  /** absolute path to the Rust xlsx-sidecar binary */
  sidecarPath?: string | undefined
  /** Shell router used to open exported/AI-generated files in a new GenOffice tab. */
  openGeneratedPath?: (path: string) => boolean
  /** Host-owned cross-app document creator (the shell routes docx/pdf/md into Docs). */
  createDocument?: (request: SheetsAiHostDocumentRequest) => Promise<WorkbookCreateDocumentResult>
}

let runtime: SheetsRuntimeConfig = {
  preloadPath: join(__dirname, '../preload/index.js'),
  rendererUrl: process.env.ELECTRON_RENDERER_URL,
  rendererFile: join(__dirname, '../renderer/index.html'),
  createDocument: createStandaloneSheetsDocument,
}

export function configureSheetsRuntime(config: SheetsRuntimeConfig): void {
  runtime = config
}

/** After writing an exported/AI-generated file: open it in the right tab
 * (shell) or reveal it in the folder (standalone). Tab-opening failure must
 * not report the write itself as failed — the file is already persisted. */
function openGeneratedFile(path: string): void {
  // Headless export must stay silent: no tab, no file-manager window
  // (same guard as markdown-main's openExportedPdf, genoffice#1815).
  if (isHeadlessMode()) return
  try {
    if (runtime.openGeneratedPath?.(path)) return
  } catch (err) {
    console.warn('[sheets] Failed to open generated file:', err)
  }
  shell.showItemInFolder(path)
}

/** Pick a safe file-name stem for an AI-created file (mirrors docs' sanitizeAiDocFileBase). */
export function sanitizeGeneratedFileBase(title: string): string {
  const cleaned = String(title ?? '')
    // eslint-disable-next-line no-control-regex -- generated file names must reject controls
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 80)
    .trim()
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : 'Untitled'
}

/** first free path for fileName inside dir: name.ext, name-2.ext, name-3.ext… */
export function uniquePathIn(dir: string, fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  let candidate = join(dir, fileName)
  for (let i = 2; existsSync(candidate); i++) candidate = join(dir, `${base}-${i}${ext}`)
  return candidate
}

/** Standalone-window fallback for AI docx/pdf/md/html creation (mirrors pdf-main's
 * createStandaloneDocument): pdf renders in a hidden sandboxed window, md/html
 * write the source as-is; docx needs the Docs app and is refused. */
async function createStandaloneSheetsDocument(
  request: SheetsAiHostDocumentRequest,
): Promise<WorkbookCreateDocumentResult> {
  if (request.type === 'docx') {
    // read by the model as the tool's answer: English, with the product's own name
    return {
      ok: false,
      error: brandText('Creating DOCX files requires the GenOffice shell or Docs app.', 'en'),
    }
  }
  const title = sanitizeGeneratedFileBase(request.title)
  try {
    if (request.type === 'pdf') {
      const bytes = await printHtmlToPdf(
        buildPrintableHtml(title, request.content),
        () =>
          new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } }),
      )
      const path = uniquePathIn(configuredDefaultSaveDir(app), `${title}.pdf`)
      await writeFile(path, bytes)
      openGeneratedFile(path)
      return { ok: true, path }
    }
    const path = uniquePathIn(configuredDefaultSaveDir(app), `${title}.${request.type}`)
    await writeFile(path, request.content, 'utf8')
    openGeneratedFile(path)
    return { ok: true, path }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

let mainWindow: BrowserWindow | null = null
let sidecar: XlsxSidecarClient | null = null

/** the single real BrowserWindow hosting the tab strip, used as dialog parent in tab mode */
let sheetsShellWindow: BrowserWindow | null = null
export function setSheetsShellWindow(win: BrowserWindow | null): void {
  sheetsShellWindow = win
}

/** the window hosting a tab's WebContentsView when BrowserWindow.fromWebContents
 *  cannot tell (detached "Open in New Window" editors) */
let hostWindowHook: ((wc: WebContents) => BrowserWindow | undefined) | null = null
export function setSheetsHostWindowHook(
  fn: ((wc: WebContents) => BrowserWindow | undefined) | null,
): void {
  hostWindowHook = fn
}

function hostWindowFor(wc: WebContents): BrowserWindow | undefined {
  const own = hostWindowHook?.(wc) ?? BrowserWindow.fromWebContents(wc)
  if (own && !own.isDestroyed()) return own
  return sheetsShellWindow && !sheetsShellWindow.isDestroyed() ? sheetsShellWindow : undefined
}

interface SheetsTabSession {
  readonly webContents: WebContents
  readonly client: XlsxSidecarClient
  readonly sessions: Map<string, SessionInfo>
  readonly aiStreams: Map<string, AbortController>
  /// Chunked uploads of large saves' cell edits, pending their save request.
  readonly saveTransfers: SaveEditsTransferStore
}

/** per-tab session state, keyed by webContents.id — replaces the old single-window closures
 * that `registerIpcHandlers`/`validateSender` used to capture, which broke as soon as a second
 * tab (or a closed-then-reopened tab) registered and overwrote the previous closure. */
/// Same ceiling as local add_image (readLocalImage's 20MB check)
const MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024
/** Max .csv/.tsv bytes converted on open: stops a 500MB text file OOMing main before sidecar limits. */
const MAX_DELIMITED_IMPORT_BYTES = 32 * 1024 * 1024

const sheetsTabs = new Map<number, SheetsTabSession>()
let activeSheetsWebContents: WebContents | null = null
let pastedTempCleanupStarted = false

function startPastedTempCleanup(): void {
  if (pastedTempCleanupStarted) return
  pastedTempCleanupStarted = true
  void cleanupExpiredPastedFiles(app.getPath('temp'))
}

function sessionFor(event: IpcMainInvokeEvent): SheetsTabSession {
  const entry = sheetsTabs.get(event.sender.id)
  if (!entry) throw new Error('Untrusted IPC sender.')
  return entry
}

/**
 * Local media roots for a sheets renderer: the directories of the workbooks its
 * tab has open, plus the directory sheets stages pasted images in. A tab can
 * hold several workbook sessions, so every open one contributes its directory —
 * a tool call naming a file the user put next to the workbook they are editing
 * is the legitimate case, and nothing else is readable.
 */
function sheetsMediaRoots(wcId: number): string[] {
  const tab = sheetsTabs.get(wcId)
  const workbookDirs = tab ? [...tab.sessions.values()].map((s) => dirname(s.path)) : []
  return localMediaRoots(...workbookDirs, join(app.getPath('temp'), 'genoffice-pasted'))
}

/// A save request referencing a chunked edit transfer gets the accumulated
/// edits spliced back in; the transfer is consumed either way.
function resolveTransferredEdits(
  entry: SheetsTabSession,
  request: WorkbookSaveRequest,
): WorkbookSaveRequest {
  if (request.editsTransferId === undefined) return request
  if (request.edits.length > 0) throw new Error('Save request mixes inline and transferred edits.')
  const edits = entry.saveTransfers.take(request.editsTransferId, request.sessionId)
  return { ...request, edits }
}

function dialogParent(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return hostWindowFor(event.sender)
}

async function openFileDialog(event: IpcMainInvokeEvent, options: OpenDialogOptions) {
  return showOpenDialogWithMemory(dialog, dialogParent(event), options)
}

async function saveFileDialog(event: IpcMainInvokeEvent, options: SaveDialogOptions) {
  // before any pick is remembered, bare-name suggestions anchor in the
  // configurable default save folder instead of Electron's Downloads pin
  return showSaveDialogWithMemory(
    dialog,
    dialogParent(event),
    options,
    configuredDefaultSaveDir(app),
  )
}

/** Split-view save-guard outcome: 'overwrite' = the user confirmed replacing
 *  a sibling copy's change on disk, so this write skips the legacy
 *  external-change check for the document path. */
type SplitSaveVerdict = 'proceed' | 'cancel' | 'overwrite'

/** The disk snapshot recorded for `path`, or undefined when this session last
 *  read or wrote another path (a CSV session's state belongs to its .csv). */
function recordedStateFor(session: SessionInfo, path: string): SaveDiskState | undefined {
  return session.diskState?.path === path ? session.diskState.state : undefined
}

/**
 * The same-document (split view) save guard: when the path is open in another
 * pane and the disk moved past this copy's recorded state, a background save
 * (quiet/AutoSave) defers silently — 'cancel' — while a manual save asks
 * whether to overwrite the sibling's change. Cancelling keeps the disk copy
 * and leaves this session dirty; 'overwrite' lets the caller skip the legacy
 * external-change check for this one write. A path open nowhere else skips
 * the guard entirely, so an ordinary save behaves exactly as before.
 */
async function guardSplitSave(options: {
  path: string
  recorded: SaveDiskState | undefined
  quiet: boolean
  event: IpcMainInvokeEvent
}): Promise<SplitSaveVerdict> {
  if (options.quiet) {
    return (await shouldDeferAutoSave(options.path, options.recorded)) ? 'cancel' : 'proceed'
  }
  if (!isPathOpenElsewhere(options.path)) return 'proceed'
  if (!(await isModifiedSince(options.recorded, options.path))) return 'proceed'
  const verdict = await confirmOverwriteIfConflicted({
    parent: dialogParent(options.event) ?? null,
    path: options.path,
    recorded: options.recorded,
    lang: getUiLang(),
  })
  return verdict === 'proceed' ? 'overwrite' : 'cancel'
}

/** Workbook file extensions the open pipeline accepts. Single source for the
 *  picker filters, the merge-source check, and the crash re-open check. */
const WORKBOOK_EXTS = new Set(['xlsx', 'xlsm', 'xls', 'csv', 'tsv'])

/** register a tab's webContents/client pair and wire up cleanup on teardown */
/** Clients whose process-death notification is already wired. A sidecar client
 *  is shared by every tab (the `sidecar ?? new XlsxSidecarClient(...)` reuse),
 *  so the wiring is per client and the crash is broadcast to the tabs using
 *  it — not attached once per tab, which would notify N times over. */
const crashNotifiedClients = new WeakSet<XlsxSidecarClient>()

/** Tell every live tab that the sidecar died, so it can re-open its workbook
 *  and adopt a live session. Positive signal: a workbook the app closed on
 *  purpose (closeWorkbook) or swapped during Save never reaches the client,
 *  because those only send a `close` command down the live pipe. */
function broadcastSidecarCrash(client: XlsxSidecarClient): void {
  for (const entry of sheetsTabs.values()) {
    if (entry.client !== client) continue
    if (entry.webContents.isDestroyed()) continue
    entry.webContents.send(IPC_CHANNELS.sidecarCrashed)
  }
}

function registerSheetsSession(webContents: WebContents, client: XlsxSidecarClient): void {
  startPastedTempCleanup()
  if (!crashNotifiedClients.has(client)) {
    crashNotifiedClients.add(client)
    client.onProcessExit(() => broadcastSidecarCrash(client))
  }
  sheetsTabs.set(webContents.id, {
    webContents,
    client,
    sessions: new Map(),
    aiStreams: new Map(),
    saveTransfers: new SaveEditsTransferStore(),
  })
  activeSheetsWebContents = webContents
  // a dead renderer's copies are what the shell reopens the tab from
  webContents.on('render-process-gone', () => {
    tabRecoveryFor(webContents.id).crashed = true
  })
  webContents.once('destroyed', () => {
    const entry = sheetsTabs.get(webContents.id)
    sheetsTabs.delete(webContents.id)
    // before the sessions are cleared below: a clean close drops the copies it wrote
    if (entry) settleTabRecoveryOnClose(webContents.id, entry)
    else tabRecovery.delete(webContents.id)
    if (entry) {
      // Free pending chunked-save uploads with the tab (the sweep timer's
      // closure would otherwise keep them reachable until the idle expiry).
      entry.saveTransfers.dispose()
      void closeAllSessions(entry)
    }
    if (activeSheetsWebContents === webContents) activeSheetsWebContents = null
  })
}

export function getSheetsWindow(): BrowserWindow | null {
  return mainWindow
}

/** the webContents of whichever sheets tab most recently registered or activated */
export function getActiveSheetsWebContents(): WebContents | null {
  return activeSheetsWebContents
}

/** shell tab switching keeps menu actions routed at the visible sheets tab */
export function setActiveSheetsWebContents(wc: WebContents | null): void {
  activeSheetsWebContents = wc
}

/** Shell notification: an open view's file was renamed on disk (renamed in the
 *  Home list) — sync the matching session's path in that tab (later saves write
 *  the new file) and push the renderer to update the title-bar file name. */
export function sheetsFileRenamed(wc: WebContents, oldPath: string, newPath: string): void {
  // A user-chosen name always wins: the file no longer qualifies for auto-rename.
  // A move that keeps the untitled name (folder tree), including the "(2)"
  // suffix a keep-both move adds, does not count as choosing one.
  const stem = (p: string) => basename(p).replace(/ \(\d+\)(?=\.[^.]+$)/, '')
  if (untitledWorkbookPaths.delete(oldPath) && stem(newPath) === stem(oldPath)) {
    untitledWorkbookPaths.add(newPath)
  }
  const entry = sheetsTabs.get(wc.id)
  if (!entry) return
  let matched = false
  for (const [id, session] of entry.sessions) {
    // Converted copies (.csv / .xls / .tsv) and restored recovery copies keep
    // the user's file in a side field, not in `path`; move those too, or the
    // next Save recreates the file under the old name.
    let renamed = sessionAfterRename(session, oldPath, newPath)
    if (renamed === null) continue
    // An unsaved new workbook's tab renames its hidden backing file; the name
    // the user typed is what the first Save As should offer (and the title its
    // next recovery copy carries — the copy itself keeps its untitled slot).
    if (session.unsavedNew && session.path === oldPath && session.suggestSaveAs !== undefined) {
      const suggested = join(dirname(session.suggestSaveAs), basename(newPath))
      if (
        suggested !== session.suggestSaveAs &&
        !existsSync(suggested) &&
        !sheetsSuggestedPathTaken(suggested)
      )
        renamed = { ...renamed, suggestSaveAs: suggested }
    }
    // A rename moves the same bytes: the split-view disk snapshot follows the
    // path so the save guard still judges the right file.
    if (renamed.diskState?.path === oldPath) {
      renamed = { ...renamed, diskState: { path: newPath, state: renamed.diskState.state } }
    }
    entry.sessions.set(id, renamed)
    matched = true
  }
  if (matched) wc.send(IPC_CHANNELS.workbookRenamed, basename(newPath))
}

/**
 * Workbooks the shell pre-created on disk with the localized untitled name
 * ("New Spreadsheet"). Only these ever qualify for the content-derived
 * auto-rename after an AI run; any manual rename removes the mark.
 */
const untitledWorkbookPaths = new Set<string>()
export function markSheetsUntitledPath(path: string): void {
  untitledWorkbookPaths.add(path)
}

/**
 * Backing workbooks the shell created in a temp directory for "New
 * spreadsheet". The user has no file yet — it only comes into existence at the
 * first Save, which this routes through Save As — and a tab closed without
 * saving discards the temp directory with it. Same shape as an .xls/.tsv
 * import: the file the session edits is not the user's file.
 */
interface UnsavedNewWorkbook {
  suggestSaveAs: string
  tempDir: string
  /** the untitled document's recovery copy (its identity outlives session swaps) */
  recovery: RecoveryIdentity
  /** the backing file holds a recovery copy's content: the tab opens unsaved */
  restored?: boolean
  /** a CSV or converted workbook's copy: the file it came from (see SessionInfo) */
  originalPath?: string
}
const unsavedNewWorkbooks = new Map<string, UnsavedNewWorkbook>()

/**
 * shell: a would-be path already promised to another unsaved new workbook (open
 * tab or tab about to open). The file itself does not exist yet, so uniqueness
 * on disk is not enough.
 */
export function sheetsSuggestedPathTaken(path: string): boolean {
  for (const pending of unsavedNewWorkbooks.values())
    if (pending.suggestSaveAs === path) return true
  for (const tab of sheetsTabs.values())
    for (const session of tab.sessions.values()) if (session.suggestSaveAs === path) return true
  return false
}

/** shell: mark a backing workbook it just created as not-yet-saved (see above) */
export function markSheetsUnsavedNew(
  openPath: string,
  suggestSaveAs: string,
  tempDir: string,
): void {
  unsavedNewWorkbooks.set(openPath, {
    suggestSaveAs,
    tempDir,
    recovery: {
      kind: 'sheets',
      untitledId: newUntitledRecoveryId(),
      ext: untitledWorkbookExt(suggestSaveAs),
    },
  })
}

/** shell: the backing workbook could not be written, release its name */
export function unmarkSheetsUnsavedNew(openPath: string): void {
  unsavedNewWorkbooks.delete(openPath)
}

const mcpWritablePaths = new Map<number, Set<string>>()

/** MCP save_session: the shell resolved this path for the tab, so a dialog-free save may write it */
export function authorizeMcpSheetWrite(wcId: number, filePath: string): void {
  const set = mcpWritablePaths.get(wcId) ?? new Set<string>()
  set.add(filePath)
  mcpWritablePaths.set(wcId, set)
}

function canMcpSheetWrite(wcId: number, filePath: string): boolean {
  return mcpWritablePaths.get(wcId)?.has(filePath) === true
}

/** Sanitize an AI-provided sheet name into a safe filename base: strip illegal path chars, collapse whitespace, cap length; null if invalid. (Mirrors slides' draft naming.) */
function sanitizeAutoRenameBase(raw: string): string | null {
  const cleaned = raw
    // eslint-disable-next-line no-control-regex -- stripping control chars is the point here
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .trim()
  if (!cleaned) return null
  return cleaned.length > 40 ? cleaned.slice(0, 40).trim() : cleaned
}

/** shell hook: a tab opened a workbook (dialog or queued path) — used for tab titles/dedupe */
let workbookOpenedHook: ((wc: WebContents, path: string) => void) | null = null
export function setSheetsWorkbookOpenedHook(
  fn: ((wc: WebContents, path: string) => void) | null,
): void {
  workbookOpenedHook = fn
}

/** One password prompt for a file: `ask` is one attempt, `close` ends the prompt. */
export interface SheetsPasswordPrompt {
  ask: OfficePasswordAsk
  close: () => void
}

/** shell hook: the open-password prompt for encrypted workbooks (none in standalone) */
let passwordPromptFactory:
  ((parent: BrowserWindow | undefined, fileName: string) => SheetsPasswordPrompt) | null = null
export function setSheetsPasswordPrompt(
  fn: ((parent: BrowserWindow | undefined, fileName: string) => SheetsPasswordPrompt) | null,
): void {
  passwordPromptFactory = fn
}

/** forward an application-menu File command into the sheets renderer */
export function sendSheetsMenuAction(
  action: 'open' | 'save' | 'save-as' | 'print' | 'export-pdf' | 'export-csv' | 'undo' | 'redo',
): void {
  activeSheetsWebContents?.send(IPC_CHANNELS.menuAction, action)
}

/** An already-mounted renderer polled for its queued workbook before one existed. */
export function nudgeQueuedWorkbook(contents: WebContents): void {
  contents.send(IPC_CHANNELS.menuAction, 'open')
}

// ---- AI settings persistence (main process avoids renderer CORS for the chat/stream proxy) ----

function userDataPath(...parts: string[]): string {
  return join(app.getPath('userData'), ...parts)
}

// ── Crash recovery ──────────────────────────────────────────
// A dirty renderer asks for a recovery copy every 30s; it is written through the
// normal save pipeline (writeWorkbookTo) and handed to the shared recovery store,
// so it is a real workbook under <userData>/sheets-autosave (the folder and the
// sha1(path) naming earlier versions used). A successful save or "Don't Save"
// removes it; opening a file that has one asks with the shared named prompt
// first, unless the launch list already chose. A new workbook (a temp backing
// file the user never saved) is untitled: its copy lives in the store's
// untitled slot under the tab's title, never in a user folder. A password
// workbook gets no copy at all — it would be plaintext (decision 0041).
const recoveryStore = createRecoveryStore({ userDataDir: () => app.getPath('userData') })
const recoveryDir = () => userDataPath(recoveryFolderName('sheets'))
const fileRecoveryIdentity = (filePath: string): RecoveryIdentity => ({
  kind: 'sheets',
  filePath,
})

/**
 * Move the unsaved new workbooks an earlier version listed in
 * `unsaved-new.json` into untitled "later" copies (see migrateLegacyUnsavedNew).
 * Safe to call any number of times; a no-op once the old index is gone. The
 * shell calls it before it lists copies for the launch list.
 */
export function migrateSheetsLegacyRecovery(): void {
  try {
    migrateLegacyUnsavedNew(recoveryStore, recoveryDir())
  } catch (error) {
    console.warn('[sheets] legacy recovery migration failed:', error)
  }
}

/**
 * Formerly the would-be paths of new workbooks to reopen at every launch.
 * Untitled copies are now offered by the launch list instead, so this only
 * migrates the old index and answers nothing to reopen.
 * @deprecated list untitled copies with listSheetsUntitledCopies (or the shared store)
 */
export function pendingUnsavedNewRecoveries(): string[] {
  migrateSheetsLegacyRecovery()
  return []
}

/** shell: the untitled workbook copies the store holds (the legacy index migrated first) */
export function listSheetsUntitledCopies(
  states?: readonly RecoveryCopyState[],
): RecoveryCopyInfo[] {
  migrateSheetsLegacyRecovery()
  return recoveryStore.listCopies({
    kinds: ['sheets'],
    untitled: true,
    ...(states ? { states } : {}),
  })
}

/**
 * The untitled workbook copy this tab writes, if its workbook is a new one
 * (the shell's session record keeps the tab by it rather than by its temp
 * backing file, and reopens it after a renderer crash). Null otherwise.
 */
export function sheetsRecoveryIdentity(webContentsId: number): RecoveryIdentity | null {
  let identity: RecoveryIdentity | null = null
  for (const session of sheetsTabs.get(webContentsId)?.sessions.values() ?? []) {
    const candidate = sessionRecoveryIdentity(session)
    if (candidate && isUntitledIdentity(candidate)) identity = candidate
  }
  return identity
}

/** Per-tab recovery bookkeeping, keyed by webContents id. */
interface TabRecoveryState {
  /** copies this tab wrote, by copy path: a clean close removes only these */
  readonly written: Map<string, RecoveryIdentity>
  /** copies whose session closed while still unsaved: a clean close keeps them */
  readonly keep: Set<string>
  /**
   * copies this tab must neither write nor delete, by copy path: another
   * tab's (a second view of the same file), or one whose question could not
   * be answered when the file opened (left for later)
   */
  readonly held: Set<string>
  /**
   * "Don't Save" was answered: late copy writes from this tab are dropped
   * until the close is vetoed (resetSheetsShuttingDown)
   */
  discarded: boolean
  /** the renderer died: its copies are what the shell reopens from */
  crashed: boolean
  /** the password notice was shown in this tab */
  noticeShown: boolean
}

const tabRecovery = new Map<number, TabRecoveryState>()

function tabRecoveryFor(contentsId: number): TabRecoveryState {
  let state = tabRecovery.get(contentsId)
  if (!state) {
    state = {
      written: new Map(),
      keep: new Set(),
      held: new Set(),
      discarded: false,
      crashed: false,
      noticeShown: false,
    }
    tabRecovery.set(contentsId, state)
  }
  return state
}

/**
 * the copy title: a CSV or converted workbook shows the file it came from, an
 * untitled workbook its tab title, a file its name
 */
function recoveryTitleFor(session: SessionInfo): string | undefined {
  if (session.recoveryOriginalPath !== undefined) return basename(session.recoveryOriginalPath)
  return session.unsavedNew && session.suggestSaveAs !== undefined
    ? basename(session.suggestSaveAs)
    : undefined
}

/**
 * Work that exists only as a recovery copy, not in the renderer's journal: a
 * restored copy before its first save, and a new workbook whose quiet
 * AutoSave moved the edits into its backing file. Counted as unsaved, so the
 * tab shows it and the close guard asks.
 */
function sessionHasUnsavedCopy(session: SessionInfo): boolean {
  if (session.unsavedRestore) return true
  if (!session.unsavedNew) return false
  const identity = sessionRecoveryIdentity(session)
  return identity !== null && recoveryStore.copyInfo(identity) !== null
}

function unsavedCopySessions(contentsId: number): number {
  let count = 0
  for (const session of sheetsTabs.get(contentsId)?.sessions.values() ?? [])
    if (sessionHasUnsavedCopy(session)) count += 1
  return count
}

/** Move a finished file into place, copying when it lives on another volume. */
async function moveFileInto(source: string, target: string): Promise<void> {
  try {
    await rename(source, target)
  } catch {
    await copyFile(source, target)
  }
}

/**
 * Write one session's copy through the store; false when it has none, this
 * tab holds it, or it was superseded. The workbook is written to disk and
 * handed over by path (writeCopyStreamed), never read into memory. It is
 * produced in a temp folder of its own first: the archive writer leaves its
 * scratch file beside its target, and that must not end up in the recovery
 * folder if the app dies mid-write.
 */
async function writeSessionCopy(
  contentsId: number,
  session: SessionInfo,
  produce: (target: string) => Promise<unknown>,
  options: { ignoreSizeLimit?: boolean } = {},
): Promise<boolean> {
  const identity = sessionRecoveryIdentity(session)
  if (identity === null) return false
  if (session.automaticRecoveryDisabled && !options.ignoreSizeLimit) return false
  const state = tabRecovery.get(contentsId)
  if (state?.discarded || state?.held.has(recoveryStore.copyPath(identity))) return false
  // taken before serializing: a save or "Don't Save" that lands meanwhile wins
  const ticket = recoveryStore.beginWrite(identity)
  const title = recoveryTitleFor(session)
  const result = await recoveryStore.writeCopyStreamed(
    identity,
    async (storeTemp) => {
      const directory = join(app.getPath('temp'), 'genoffice-imports', randomUUID())
      try {
        await mkdir(directory, { recursive: true })
        const target = join(directory, `recovery${untitledWorkbookExt(session.path)}`)
        await produce(target)
        await moveFileInto(target, storeTemp)
      } finally {
        await cleanupImportTempDirectory(app.getPath('temp'), directory).catch(() => undefined)
      }
    },
    {
      ticket,
      ...(title === undefined ? {} : { title }),
      ...(session.recoveryOriginalPath === undefined
        ? {}
        : { originalPath: session.recoveryOriginalPath }),
    },
  )
  if (result !== 'written') return false
  tabRecoveryFor(contentsId).written.set(recoveryStore.copyPath(identity), identity)
  return true
}

/** a successful save: the document's copies are no longer needed */
function deleteCopiesAfterSave(contentsId: number, identities: (RecoveryIdentity | null)[]): void {
  const state = tabRecovery.get(contentsId)
  for (const identity of identities) {
    if (identity === null) continue
    // another tab's copy, or one still waiting for its question: not this save's
    if (state?.held.has(recoveryStore.copyPath(identity))) continue
    recoveryStore.deleteCopy(identity, 'saved')
    state?.written.delete(recoveryStore.copyPath(identity))
    state?.keep.delete(recoveryStore.copyPath(identity))
  }
}

/** "Don't Save" in the close prompt: drop every copy of the tab, and any late write */
function discardTabCopies(contentsId: number): void {
  const state = tabRecoveryFor(contentsId)
  state.discarded = true
  const identities = new Map(state.written)
  for (const session of sheetsTabs.get(contentsId)?.sessions.values() ?? []) {
    const identity = sessionRecoveryIdentity(session)
    if (identity !== null) identities.set(recoveryStore.copyPath(identity), identity)
  }
  for (const [key, identity] of identities) {
    if (!state.held.has(key)) recoveryStore.deleteCopy(identity, 'dontSave')
  }
  state.written.clear()
  state.keep.clear()
}

/**
 * MCP / AI closes this tab without saving (the shell then closes it with no
 * prompt): the same as answering "Don't Save" — the tab's copies go, and a
 * late copy write from the closing renderer is dropped.
 */
export function discardSheetsRecovery(contents: WebContents): void {
  if (contents.isDestroyed()) return
  discardTabCopies(contents.id)
}

/**
 * A close that was answered "Don't Save" was vetoed afterwards (another
 * tab's prompt cancelled the window close or the quit): the tab stays open
 * with its unsaved work, so its copies are written again.
 */
function resumeDiscardedTabCopies(): void {
  for (const state of tabRecovery.values()) state.discarded = false
}

/** a workbook session closes: remember a copy that still holds unsaved work */
function noteSessionClosed(contentsId: number, session: SessionInfo): void {
  const identity = sessionRecoveryIdentity(session)
  if (identity === null) return
  const unsaved = sessionHasUnsavedCopy(session) || (pendingEditCounts.get(contentsId) ?? 0) > 0
  if (unsaved) tabRecoveryFor(contentsId).keep.add(recoveryStore.copyPath(identity))
}

/**
 * The tab is going away. A clean tab removes the copies it wrote, except those
 * still holding unsaved work; a crashed renderer, a dirty tab and the app
 * ending (the store refuses then) keep everything.
 */
function settleTabRecoveryOnClose(contentsId: number, entry: SheetsTabSession): void {
  const state = tabRecovery.get(contentsId)
  decidedOpens.delete(contentsId)
  if (!state) return
  if (!state.crashed && !state.discarded) {
    for (const session of entry.sessions.values()) noteSessionClosed(contentsId, session)
    if ((pendingEditCounts.get(contentsId) ?? 0) === 0) {
      for (const [key, identity] of state.written) {
        if (!state.keep.has(key)) recoveryStore.deleteCopy(identity, 'closedClean')
      }
    }
  }
  tabRecovery.delete(contentsId)
}

/** shown once per tab when a workbook without a possible copy opens in it */
function showUnprotectableNotice(contents: WebContents): void {
  if (contents.isDestroyed()) return
  const state = tabRecoveryFor(contents.id)
  if (state.noticeShown) return
  state.noticeShown = true
  contents.send(IPC_CHANNELS.recoveryNotice, unprotectableNoticeText(getUiLang()))
}

/**
 * Opens the shell answered for a tab (launch list, restored tab): the file's
 * recovery question is settled, so its next open of that path does not ask.
 */
const decidedOpens = new Map<number, RecoveryOpenFileRequest>()

/** Load copy bytes into a temp file the session runs on (the original stays untouched). */
async function stageRecoveredCopy(
  bytes: Buffer,
  name: string,
): Promise<{ openPath: string; importTempDir: string }> {
  const directory = join(app.getPath('temp'), 'genoffice-imports', randomUUID())
  await mkdir(directory, { recursive: true })
  const openPath = join(directory, name)
  try {
    await writeFile(openPath, bytes)
  } catch (error) {
    await cleanupImportTempDirectory(app.getPath('temp'), directory)
    throw error
  }
  return { openPath, importTempDir: directory }
}

/**
 * A file's recovery copy, settled before its content loads: the launch
 * list's decision when there is one, else the named per-file prompt (Esc and
 * closing restore). Restoring opens the copy's bytes from a temp file with the
 * user's file as the save target (`restoreTarget`) and the tab unsaved;
 * discarding deletes the copy. Null opens the file as saved.
 */
async function recoveredOpenFor(
  path: string,
  contents: WebContents | undefined,
  parent: BrowserWindow | undefined,
): Promise<PreparedWorkbookOpen | null> {
  const identity = fileRecoveryIdentity(path)
  const key = recoveryStore.copyPath(identity)
  const decided = contents ? decidedOpens.get(contents.id) : undefined
  const isDecided = decided !== undefined && contents !== undefined && decided.filePath === path
  if (isDecided) decidedOpens.delete(contents.id)
  const held = contents ? tabRecoveryFor(contents.id).held : undefined
  held?.delete(key)
  // a second view (split) of a file another tab keeps a copy for: that copy
  // is the other tab's unsaved work, so nothing is asked and nothing in this
  // tab writes or deletes it
  if (contents !== undefined && copyOwnedByAnotherView(contents.id, identity)) {
    held?.add(key)
    return null
  }
  if (isDecided && decided.decision === 'original') return null
  try {
    let bytes: Buffer | null = null
    if (isDecided) {
      bytes = await recoveryStore.readCopy(identity)
      if (bytes) recoveryStore.markCopyLoaded(identity)
    } else {
      const resolved = await resolveRecoveryOnOpen({
        store: recoveryStore,
        identity,
        dialog,
        parent: parent ?? null,
        lang: getUiLang(),
      })
      if (resolved.action === 'restore') bytes = resolved.bytes
    }
    if (!bytes) return null
    const staged = await stageRecoveredCopy(bytes, basename(path))
    return { ...staged, restoreTarget: path, unsavedRestore: true }
  } catch (error) {
    // The copy could not be prepared: the file opens as saved and the copy
    // waits for the next open or launch, untouched by this tab meanwhile.
    console.warn('[sheets] recovery copy could not be opened:', error)
    try {
      recoveryStore.setCopyState(identity, 'later')
    } catch (stateError) {
      console.warn('[sheets] recovery copy state could not be kept:', stateError)
    }
    held?.add(key)
    return null
  }
}

/**
 * Another live sheets tab keeps the document's copy: the copy exists, and
 * that tab has the document open restored from it or has written it (not
 * merely opened the file beside it).
 */
function copyOwnedByAnotherView(contentsId: number, identity: RecoveryIdentity): boolean {
  if (recoveryStore.openPlan(identity).action === 'none') return false
  const key = recoveryStore.copyPath(identity)
  for (const [id, entry] of sheetsTabs) {
    if (id === contentsId || entry.webContents.isDestroyed()) continue
    const state = tabRecovery.get(id)
    if (state?.held.has(key)) continue
    for (const session of entry.sessions.values()) {
      const own = sessionRecoveryIdentity(session)
      if (own === null || recoveryStore.copyPath(own) !== key) continue
      if (session.unsavedRestore || state?.written.has(key)) return true
    }
  }
  return false
}

/**
 * Editor contract: open `filePath` in a tab the shell created, its recovery
 * question already answered (the open itself runs when the renderer pulls the
 * queued path).
 */
export function openSheetsFileWithDecision(
  contents: WebContents,
  request: RecoveryOpenFileRequest,
): void {
  decidedOpens.set(contents.id, { filePath: request.filePath, decision: request.decision })
  queueWorkbookForView(contents, request.filePath)
  nudgeQueuedWorkbook(contents)
}

/**
 * Editor contract: load a copy into a tab the shell created as an untitled
 * workbook (an untitled copy, or a file copy whose original is missing). Like
 * "New spreadsheet" it runs on a backing file in its own temp folder, the
 * first save asks where, and it keeps writing the same copy until saved.
 * The first save offers what the document offered before: for the copy of a
 * CSV or converted workbook (the original path in `saveAsDefaultPath` or in
 * the copy's metadata) the original's folder and name as .xlsx; for a missing
 * original that path itself; else the default folder.
 */
export async function openSheetsUntitledCopy(
  contents: WebContents,
  request: RecoveryOpenUntitledRequest,
): Promise<void> {
  const bytes = await recoveryStore.readCopy(request.copy)
  if (!bytes) throw new Error('Recovery copy not found.')
  const copy = request.copy
  const ext = isUntitledIdentity(copy) ? copy.ext : untitledWorkbookExt(copy.filePath)
  // an untitled copy that names its original file came from a CSV or converted workbook
  const originalPath = isUntitledIdentity(copy)
    ? (request.saveAsDefaultPath ?? recoveryStore.copyInfo(copy)?.originalPath ?? undefined)
    : undefined
  const offered =
    originalPath !== undefined ? saveAsDefaultFor(originalPath) : request.saveAsDefaultPath
  const stem =
    (offered === undefined
      ? undefined
      : sanitizeAutoRenameBase(basename(offered).replace(/\.[^.]+$/, ''))) ??
    sanitizeAutoRenameBase(basename(request.title).replace(/\.xls[xm]$/i, '')) ??
    'Workbook'
  const name = `${stem}${ext}`
  const suggestSaveAs = offered ?? join(configuredDefaultSaveDir(app), name)
  const staged = await stageRecoveredCopy(bytes, name)
  unsavedNewWorkbooks.set(staged.openPath, {
    suggestSaveAs,
    tempDir: staged.importTempDir,
    recovery: request.copy,
    restored: true,
    ...(originalPath === undefined ? {} : { originalPath }),
  })
  queueWorkbookForView(contents, staged.openPath)
  nudgeQueuedWorkbook(contents)
}

/** how long an OS shutdown waits for one tab's renderer to write its copy */
const RECOVERY_WRITE_NOW_TIMEOUT_MS = 8_000
const recoveryWriteNowWaiters = new Map<string, () => void>()

/**
 * Editor contract (the OS is ending the session): every live tab's renderer
 * writes its copy now. Resolves once all answered or timed out; never throws.
 */
export async function writeSheetsCopiesNow(): Promise<void> {
  const waits: Promise<void>[] = []
  for (const entry of sheetsTabs.values()) {
    const contents = entry.webContents
    if (contents.isDestroyed() || tabRecovery.get(contents.id)?.crashed) continue
    const nonce = randomUUID()
    waits.push(
      new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          recoveryWriteNowWaiters.delete(nonce)
          resolve()
        }, RECOVERY_WRITE_NOW_TIMEOUT_MS)
        recoveryWriteNowWaiters.set(nonce, () => {
          clearTimeout(timer)
          recoveryWriteNowWaiters.delete(nonce)
          resolve()
        })
        try {
          contents.send(IPC_CHANNELS.recoveryWriteNow, nonce)
        } catch {
          recoveryWriteNowWaiters.get(nonce)?.()
        }
      }),
    )
  }
  await Promise.all(waits)
}

/** a password workbook is open in this tab: it has no copy */
function sheetsTabIsUnprotectable(contentsId: number): boolean {
  for (const session of sheetsTabs.get(contentsId)?.sessions.values() ?? [])
    if (session.password !== undefined) return true
  return false
}

registerRecoveryEditor({
  kind: 'sheets',
  writeCopiesNow: () => writeSheetsCopiesNow().catch(() => undefined),
  openFileWithDecision: openSheetsFileWithDecision,
  openUntitledCopy: openSheetsUntitledCopy,
  isUnprotectable: (contents) => sheetsTabIsUnprotectable(contents.id),
})

function readJson<T>(path: string, fallback: T): T {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    /* corrupted state file: fall back to defaults */
  }
  return fallback
}

const SETTINGS_PATH = () => userDataPath('ai-settings.json')

// Dev-only automation hooks: a fixed CDP port for driving the app from test
// scripts, and a workbook path that bypasses the native file dialog.
const debugPort = app.isPackaged ? undefined : process.env.XLSX_DEBUG_PORT
if (debugPort) app.commandLine.appendSwitch('remote-debugging-port', debugPort)
let forcedWorkbookPath = app.isPackaged ? undefined : process.env.XLSX_OPEN_PATH
/** shell-queued workbook paths keyed by tab webContents id: a multi-select Open
 * creates several sheets tabs at once, so the path must be bound to its own tab
 * (a single global would be overwritten by the next iteration). One-shot, unlike
 * the sticky dev env/capture-server path above. */
const queuedWorkbookPaths = new Map<number, string>()

/** queue a workbook this tab's first selectWorkbook call opens without a dialog (shell routing) */
export function queueWorkbookForView(contents: WebContents, path: string): void {
  queuedWorkbookPaths.set(contents.id, path)
  contents.once('destroyed', () => {
    queuedWorkbookPaths.delete(contents.id)
  })
}

/** is the active tab still waiting for the renderer to consume a shell-queued workbook? */
export function hasActiveQueuedWorkbook(): boolean {
  return activeSheetsWebContents !== null && queuedWorkbookPaths.has(activeSheetsWebContents.id)
}

/** set by shell for home:new-sheet: renderer opens blank workbook instead of demo */
let pendingNewBlank = false

/** signal the next sheets renderer to open a new blank workbook (shell mode only) */
export function setSheetsNewBlank(): void {
  pendingNewBlank = true
}

// capturePage forces a renderer frame even when the window is occluded or on
// another Space, unlike CDP Page.captureScreenshot / macOS screencapture.
function startCaptureServer(): void {
  if (!debugPort) return
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/open') {
      forcedWorkbookPath = url.searchParams.get('path') ?? undefined
      response.writeHead(200)
      response.end('ok')
      return
    }
    // Drives the File menu from test scripts: CDP input can't reach native
    // menu accelerators, and osascript focus-stealing is flaky.
    if (url.pathname === '/menu') {
      const action = url.searchParams.get('action')
      if (
        action === 'open' ||
        action === 'save' ||
        action === 'save-as' ||
        action === 'print' ||
        action === 'export-pdf' ||
        action === 'export-csv' ||
        action === 'undo' ||
        action === 'redo'
      ) {
        sendSheetsMenuAction(action)
        response.writeHead(200)
        response.end('ok')
      } else {
        response.writeHead(400)
        response.end('unknown action')
      }
      return
    }
    const webContents = getActiveSheetsWebContents()
    if (url.pathname !== '/capture' || !webContents) {
      response.writeHead(404)
      response.end()
      return
    }
    webContents
      .capturePage()
      .then((image) => {
        response.writeHead(200, { 'Content-Type': 'image/png' })
        response.end(image.toPNG())
      })
      .catch((error: unknown) => {
        response.writeHead(500)
        response.end(String(error))
      })
  })
  server.listen(Number(debugPort) + 1, '127.0.0.1')
}

const sidecarOpenResultSchema = workbookFileSchema.omit({
  sha256: true,
  readOnly: true,
})
type SidecarOpenResult = z.infer<typeof sidecarOpenResultSchema>

export async function createSheetsWindow(
  options: { includeAiHandlers?: boolean } = {},
): Promise<BrowserWindow> {
  const client = sidecar ?? new XlsxSidecarClient(resolveSidecarPath())
  sidecar = client
  client.start()
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 720,
    minHeight: 550,
    show: false,
    title: `${PRODUCT_NAME} Sheets`,
    // Traffic lights sit inside the toolbar row.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: {
      preload: runtime.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  mainWindow = window
  registerSheetsIpc()
  if (options.includeAiHandlers ?? true) registerSheetsAiIpc()
  if (options.includeAiHandlers ?? true) registerProjectIpc()
  registerSheetsSession(window.webContents, client)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  if (!app.isPackaged) {
    window.webContents.on('console-message', (details) => {
      process.stderr.write(`[renderer:${details.level}] ${details.message}\n`)
    })
  }
  window.once('ready-to-show', () => window.show())
  window.on('close', (event) => {
    if (sheetsPendingEditCount(window.webContents.id) === 0) return
    event.preventDefault()
    void requestSheetsClose(window.webContents, window).then((proceed) => {
      // destroy() skips this handler on the way out (close() would re-enter
      // with the count possibly still non-zero after a discard).
      if (proceed && !window.isDestroyed()) window.destroy()
      // not proceeding vetoes any quit that was in flight: go back to
      // prompting on later closes (see resetSheetsShuttingDown)
      else resetSheetsShuttingDown()
    })
  })
  window.on('closed', () => {
    mainWindow = null
  })

  await window.loadURL(rendererUrl(runtime.rendererUrl, 'sheets'))
  return window
}

/** hidden export windows: webContents id -> the PDF path the renderer must write */
const headlessExportTargets = new Map<number, string>()
/** settled by 'sheets:headless-export-done' (or by the renderer dying) */
const headlessExportWaiters = new Map<number, (result: HeadlessSheetsReport) => void>()

interface HeadlessSheetsReport {
  ok: boolean
  error?: string
}

/** End a headless run early (a failure the renderer can never observe). */
function failHeadlessExport(wcId: number, message: string): void {
  const settle = headlessExportWaiters.get(wcId)
  if (!settle) return
  headlessExportWaiters.delete(wcId)
  settle({ ok: false, error: message })
}

/**
 * Render `input` to `outPath` with no visible window: a hidden sheets
 * renderer opens the workbook through the normal queued-open path, lays the
 * active sheet out with its Page Layout settings and prints via the existing
 * hidden print window (main/pdf-export.ts).
 */
export async function exportSheetsPdfHeadless(
  input: string,
  outPath: string,
  timeoutMs = 600_000,
): Promise<void> {
  const client = sidecar ?? new XlsxSidecarClient(resolveSidecarPath())
  sidecar = client
  client.start()
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: {
      preload: runtime.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  registerSheetsIpc()
  registerSheetsSession(win.webContents, client)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  const wcId = win.webContents.id
  queueWorkbookForView(win.webContents, input)
  headlessExportTargets.set(wcId, outPath)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const report = await new Promise<HeadlessSheetsReport>((resolve) => {
      headlessExportWaiters.set(wcId, resolve)
      win.webContents.on('render-process-gone', (_event, details) =>
        resolve({ ok: false, error: `sheets renderer stopped (${details.reason})` }),
      )
      timer = setTimeout(
        () => resolve({ ok: false, error: `sheets export timed out after ${timeoutMs}ms` }),
        timeoutMs,
      )
      void win.webContents.loadURL(rendererUrl(runtime.rendererUrl, 'sheets'))
    })
    if (!report.ok) throw new Error(report.error ?? 'sheets export failed')
  } finally {
    if (timer) clearTimeout(timer)
    headlessExportWaiters.delete(wcId)
    headlessExportTargets.delete(wcId)
    if (!win.isDestroyed()) win.destroy()
  }
}

/** tab-mode equivalent of createSheetsWindow: same runtime/IPC wiring, no BrowserWindow of its own. */
export function createSheetsView(
  options: { includeAiHandlers?: boolean; openingWorkbook?: boolean } = {},
): WebContentsView {
  const client = sidecar ?? new XlsxSidecarClient(resolveSidecarPath())
  sidecar = client
  client.start()
  const view = new WebContentsView({
    webPreferences: {
      preload: runtime.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  registerSheetsIpc()
  if (options.includeAiHandlers ?? true) registerSheetsAiIpc()
  registerSheetsSession(view.webContents, client)
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  view.webContents.on('will-navigate', (event) => event.preventDefault())
  if (!app.isPackaged) {
    view.webContents.on('console-message', (details) => {
      process.stderr.write(`[renderer:${details.level}] ${details.message}\n`)
    })
  }
  // mode=tab: the shell's tab strip owns the traffic lights / caption buttons,
  // so the ribbon must not reserve space for them
  void view.webContents.loadURL(
    rendererUrl(runtime.rendererUrl, 'sheets', {
      mode: 'tab',
      ...(options.openingWorkbook ? { openingWorkbook: '1' } : {}),
    }),
  )
  return view
}

// ---- Chat attachments: local files parsed and fed to the agent (copied from
// the apps/docs docs-main attachment pipeline) ----

const ATTACHMENT_IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

/** Extracted-text cache keyed by path; invalidated when mtime+size change */
const attachmentTextCache = new Map<string, { stamp: string; text: string }>()

function statAttachment(filePath: string): { meta?: AttachmentMeta; error?: string } {
  const name = basename(filePath)
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (!ATTACHABLE_EXTS.has(ext)) return { error: `${name}: ${tm('errUnsupportedExt', { ext })}` }
  try {
    const stat = statSync(filePath)
    if (!stat.isFile()) return { error: `${name}: ${tm('errNotFile')}` }
    if (stat.size > ATTACHABLE_MAX_BYTES) {
      return {
        error: `${name}: ${tm('errTooLarge', { mb: Math.round(ATTACHABLE_MAX_BYTES / 1024 / 1024) })}`,
      }
    }
    if (ATTACHABLE_IMAGE_EXTS.has(ext) && stat.size > ATTACHABLE_IMAGE_MAX_BYTES) {
      return { error: `${name}: ${tm('errImageTooLarge')}` }
    }
    return { meta: { path: filePath, name, ext, sizeBytes: stat.size } }
  } catch {
    return { error: `${name}: ${tm('errUnreadable')}` }
  }
}

function collectAttachments(paths: string[]): AttachmentAddResult {
  const accepted: AttachmentMeta[] = []
  const rejected: string[] = []
  for (const p of paths) {
    const { meta, error } = statAttachment(p)
    if (meta) accepted.push(meta)
    else if (error) rejected.push(error)
  }
  return { accepted, rejected }
}

/** Persists clipboard-pasted image bytes to a temp file (screenshots/bitmaps
 * without a local path); returns null for non-images or empty data */
let pastedImageSeq = 0
function savePastedImage(data: unknown, ext: unknown): string | null {
  const cleanExt = typeof ext === 'string' ? ext.toLowerCase() : ''
  if (!ATTACHABLE_IMAGE_EXTS.has(cleanExt)) return null
  const bytes =
    data instanceof ArrayBuffer
      ? Buffer.from(data)
      : ArrayBuffer.isView(data)
        ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        : null
  if (!bytes || bytes.byteLength === 0) return null
  const dir = join(app.getPath('temp'), 'genoffice-pasted')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
  const filePath = join(dir, `pasted-${stamp}-${++pastedImageSeq}.${cleanExt}`)
  writeFileSync(filePath, bytes)
  return filePath
}

/** Attachment text extraction via @genoffice/file-parse (docx/pdf/pptx/xlsx/plain text) */
async function extractAttachmentText(filePath: string): Promise<string> {
  // a file open with unsaved changes is not read (before the cache): a
  // withholding mark only reaches the file on save
  await assertFileSaved(filePath)
  const stat = statSync(filePath)
  const stamp = `${stat.mtimeMs}:${stat.size}`
  const cached = attachmentTextCache.get(filePath)
  if (cached && cached.stamp === stamp) return cached.text
  if (stat.size > ATTACHABLE_MAX_BYTES) throw new Error(tm('errFileTooLarge'))
  const parsed = await parseFileToText(filePath)
  if (!parsed.ok || parsed.kind !== 'text' || parsed.text == null) {
    throw new Error(parsed.error ?? tm('errParseFailed'))
  }
  attachmentTextCache.set(filePath, { stamp, text: parsed.text })
  // The cache is bounded (keeping a few recent files is enough)
  if (attachmentTextCache.size > 8) {
    const oldest = attachmentTextCache.keys().next().value
    if (oldest) attachmentTextCache.delete(oldest)
  }
  return parsed.text
}

// Close guard: the renderer mirrors its pending-save count here, used to show a
// save confirmation before closing the window/tab.
const pendingEditCounts = new Map<number, number>()
const closeSaveWaiters = new Map<number, (ok: boolean) => void>()
const trackedEditSenders = new Set<number>()

/**
 * Unsaved changes of a tab: the renderer's journal, plus work that lives only
 * in a recovery copy (a restored copy before its first save, a new workbook
 * whose quiet AutoSave emptied the journal).
 */
export function sheetsPendingEditCount(webContentsId: number): number {
  return (pendingEditCounts.get(webContentsId) ?? 0) + unsavedCopySessions(webContentsId)
}

/**
 * The app is shutting down (quit menu, SIGTERM from a restart/installer/killall,
 * SIGINT from a terminal, the OS ending the session). The close guard must not
 * save then: nobody answered the prompt, and a dialog raised during shutdown
 * resolves to its default button, which silently overwrote the user's original
 * file. Unsaved work is covered by the 30s recovery copy instead — the next
 * launch offers to restore it. The shared recovery latch goes up with this one,
 * so no editor's close cleanup deletes a copy meanwhile.
 */
const shutdownLatch = new ShutdownLatch()

const shuttingDown = (): boolean => shutdownLatch.active || isAppShuttingDown()

export function markSheetsShuttingDown(): void {
  shutdownLatch.mark()
  markAppShuttingDown()
}

/**
 * The quit was vetoed (a prevented window close that ended up not proceeding).
 * The latches must go back down: from now on closes are interactive again and
 * the save prompt must run — leaving them set would silently discard unsaved
 * edits on every later close, and keep copies from being deleted on save.
 */
export function resetSheetsShuttingDown(): void {
  shutdownLatch.reset()
  resetAppShuttingDown()
  resumeDiscardedTabCopies()
  // every editor's "Don't Save" block in the shared store, not just this one's
  resumeDiscardedCopies()
}

app.on('before-quit', markSheetsShuttingDown)
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    markSheetsShuttingDown()
    app.quit()
  })
}

/**
 * Close guard for a sheets renderer: true means proceed with the close.
 * Clean → true; dirty → Save/Don't Save/Cancel dialog. Save asks the renderer to run
 * its journal save and waits for the outcome — a failed or canceled save
 * keeps the window open (the renderer already surfaced the error). "Don't
 * Save" deletes the tab's recovery copies; a close while the app is ending
 * asks nothing and leaves them.
 */
export async function requestSheetsClose(
  contents: WebContents,
  parent?: BrowserWindow | null,
): Promise<boolean> {
  const count = sheetsPendingEditCount(contents.id)
  const decision = closeGuardDecision({
    pendingEdits: count,
    destroyed: contents.isDestroyed(),
    shuttingDown: shuttingDown(),
  })
  if (decision === 'proceed') return true
  const options = {
    // On macOS 'warning' shows the system warning triangle + app-icon badge
    type: 'warning' as const,
    message: tm('closeUnsavedMsg', { count }),
    detail: tm('closeUnsavedDetail'),
    buttons: [tm('menuSave'), tm('btnDontSave'), tm('btnCancel')],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  }
  const { response } =
    parent && !parent.isDestroyed()
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options)
  if (response === 2) return false
  if (response === 1) {
    discardTabCopies(contents.id)
    return true
  }
  // The window went away (or a quit started) while the prompt was up: don't save
  if (shuttingDown() || contents.isDestroyed()) return true
  return await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      closeSaveWaiters.delete(contents.id)
      resolve(false)
    }, 120_000)
    closeSaveWaiters.set(contents.id, (ok) => {
      clearTimeout(timer)
      resolve(ok)
    })
    contents.send(IPC_CHANNELS.closeSaveRequest)
  })
}

let coreIpcRegistered = false

export function registerSheetsIpc(): void {
  if (coreIpcRegistered) return
  coreIpcRegistered = true

  ipcMain.handle(IPC_CHANNELS.userDisplayName, (event): string => {
    sessionFor(event)
    return configuredAuthorName(app)
  })

  // Registered here (not in registerSheetsAiIpc, skipped in shell mode):
  // slides' ai:generate-image only exists once a slides view opens, so sheets
  // owns its channel the way pdf does.
  ipcMain.handle(
    IPC_CHANNELS.aiGenerateImage,
    (event, op: { prompt?: unknown; aspectRatio?: unknown }) =>
      // ends with its tab, or when the tab's AI run is stopped
      withMediaCallSignal(event.sender, (signal) =>
        generateImageTool(
          SETTINGS_PATH(),
          {
            prompt: String(op?.prompt ?? ''),
            ...(op?.aspectRatio ? { aspectRatio: String(op.aspectRatio) } : {}),
          },
          {
            mediaRoots: sheetsMediaRoots(event.sender.id),
            context: { path: 'screen', statuses: sharedSubscriptionStatuses() },
            signal,
          },
        ),
      ),
  )

  // What the image and search tools can do right now. Registered here for the
  // same reason: the renderer offers generate_image from this answer.
  ipcMain.handle(IPC_CHANNELS.aiToolCapabilities, (): AiToolCapabilities =>
    aiToolCapabilities(readAiSettingsFile(SETTINGS_PATH()), {
      path: 'screen',
      statuses: sharedSubscriptionStatuses(),
    }),
  )

  // the renderer finished the copy an OS shutdown asked for (writeSheetsCopiesNow)
  ipcMain.on(IPC_CHANNELS.recoveryWriteNowDone, (event, nonce: unknown) => {
    if (!sheetsTabs.has(event.sender.id)) return
    if (typeof nonce === 'string') recoveryWriteNowWaiters.get(nonce)?.()
  })

  ipcMain.on(IPC_CHANNELS.pendingEditsChanged, (event, count: unknown) => {
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return
    const senderId = event.sender.id
    pendingEditCounts.set(senderId, Math.floor(count))
    if (!trackedEditSenders.has(senderId)) {
      trackedEditSenders.add(senderId)
      event.sender.once('destroyed', () => {
        trackedEditSenders.delete(senderId)
        pendingEditCounts.delete(senderId)
        closeSaveWaiters.get(senderId)?.(false)
        closeSaveWaiters.delete(senderId)
      })
    }
  })

  ipcMain.on(IPC_CHANNELS.closeSaveResult, (event, ok: unknown) => {
    const waiter = closeSaveWaiters.get(event.sender.id)
    if (!waiter) return
    closeSaveWaiters.delete(event.sender.id)
    waiter(ok === true)
  })

  // shared with the other editor modules — last (identical) registration wins
  ipcMain.removeHandler('app:get-language')
  ipcMain.handle('app:get-language', () => getUiLang())

  // shared with the other editor modules — last (identical) registration wins
  ipcMain.removeHandler('app:font-family-info')
  ipcMain.handle('app:font-family-info', (_event, families: unknown) => familyInfoFor(families))

  /** returns true once when shell opened this tab for a new blank workbook */
  ipcMain.handle('sheets:consume-new-blank', () => {
    if (pendingNewBlank) {
      pendingNewBlank = false
      return true
    }
    return false
  })

  /**
   * Is a shell-queued workbook still waiting to be opened? The shell's 'open'
   * nudge loop gives up after 30s; on slow dev cold starts (vite compiles the
   * renderer on demand) Univer mounts later than that and the queued path
   * would strand the tab as a blank in-memory workbook. The renderer polls
   * this once it is ready and triggers the open itself.
   */
  ipcMain.handle('sheets:has-queued-workbook', (event) => queuedWorkbookPaths.has(event.sender.id))

  // ---- headless export mode (--headless-export) ----

  ipcMain.handle('sheets:consume-headless-export', (event): string | null => {
    const target = headlessExportTargets.get(event.sender.id) ?? null
    headlessExportTargets.delete(event.sender.id)
    return target
  })

  ipcMain.on('sheets:headless-export-done', (event, result: unknown) => {
    const settle = headlessExportWaiters.get(event.sender.id)
    if (!settle) return
    headlessExportWaiters.delete(event.sender.id)
    const state = result as { ok?: unknown; error?: unknown } | null
    settle({
      ok: state?.ok === true,
      ...(typeof state?.error === 'string' ? { error: state.error } : {}),
    })
  })

  /// `explicitPath` re-opens a known file without the picker or the shell
  /// queue — the crash-recovery entry point. It runs the SAME pipeline
  /// (prepareWorkbookForOpen + openWorkbookSession + the opened hook) as a
  /// user-picked or shell-queued open, so a recovered workbook is a normal
  /// session rather than a merge source.
  const openSelectedWorkbook = async (event: IpcMainInvokeEvent, explicitPath?: string) => {
    const entry = sessionFor(event)
    let path = explicitPath ?? queuedWorkbookPaths.get(event.sender.id) ?? forcedWorkbookPath
    // consume immediately (before the slow session open) so the shell's
    // retry loop stops re-sending 'open' for the same file
    queuedWorkbookPaths.delete(event.sender.id)
    if (!path) {
      const selection = await openFileDialog(event, {
        properties: ['openFile'],
        filters: [
          { name: tm('filterSpreadsheets'), extensions: ['xlsx', 'xlsm', 'xls', 'csv', 'tsv'] },
        ],
      })
      if (selection.canceled || !selection.filePaths[0]) return null
      path = selection.filePaths[0]
    }
    const prepared = await prepareWorkbookForOpen(
      entry.client,
      path,
      event.sender,
      dialogParent(event),
    )
    // a decision the shell passed for this tab served this open (or never applied)
    decidedOpens.delete(event.sender.id)
    if (prepared === null) return null
    // The recovery prompt (or the file dialog / import conversion) can outlive
    // the tab: once the renderer is destroyed, its 'destroyed' handler has
    // already run closeAllSessions and dropped the tab entry, so a session
    // opened now would never be closed and its snapshot would leak.
    if (event.sender.isDestroyed()) {
      await discardPreparedOpen(prepared)
      return null
    }
    // a CSV or converted workbook keeps its unsaved work in an untitled copy
    const converted = convertedSessionRecovery(prepared, path)
    const result = await openWorkbookSession(entry.client, prepared.openPath, entry.sessions, {
      suggestSaveAs: prepared.suggestSaveAs,
      csvImport: prepared.csvImport,
      csvSourcePath: prepared.csvSourcePath,
      emptyCsv: prepared.emptyCsv,
      importTempDir: prepared.importTempDir,
      restoreTarget: prepared.restoreTarget,
      emptySource: prepared.emptySource,
      unsavedNew: prepared.unsavedNew,
      password: prepared.password,
      recoveryIdentity: converted?.recoveryIdentity ?? prepared.recoveryIdentity,
      recoveryOriginalPath: converted?.recoveryOriginalPath ?? prepared.recoveryOriginalPath,
      unsavedRestore: prepared.unsavedRestore,
    })
    // The sidecar open itself can also outlive the tab after the pre-open
    // check. Close the newly registered session instead of stranding it in
    // the detached entry map.
    if (event.sender.isDestroyed()) {
      const session = entry.sessions.get(result.sessionId)
      entry.sessions.delete(result.sessionId)
      if (session !== undefined) {
        await cleanupSessionResources({
          tempRoot: app.getPath('temp'),
          snapshotPath: session.snapshotPath,
          importTempDir: session.importTempDir,
          closeSidecar: () => entry.client.close(result.sessionId),
        })
      }
      return null
    }
    // an unsaved new workbook's tab already shows the untitled name; its temp
    // backing path must not become a recent file
    if (!prepared.unsavedNew) workbookOpenedHook?.(event.sender, path)
    // a password workbook keeps no recovery copy: say so once in this tab
    if (prepared.password !== undefined) showUnprotectableNotice(event.sender)
    return result
  }

  ipcMain.handle(IPC_CHANNELS.selectWorkbook, async (event) => {
    try {
      return await openSelectedWorkbook(event)
    } catch (err) {
      // A headless export has no dialog to report a failed open through, and
      // its renderer would poll to the deadline waiting for a workbook that
      // will never arrive — settle the run with the real reason instead.
      failHeadlessExport(event.sender.id, `the input workbook did not open (${String(err)})`)
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.reopenWorkbook, async (event, path: unknown) => {
    const validated = z.string().min(1).parse(path)
    // A crash re-open targets the file the user already has open, so a
    // missing/deleted file is a real failure rather than a reason to pop the
    // picker at someone who did not ask to open anything.
    if (!existsSync(validated)) throw new Error('Workbook file not found.')
    const ext = validated.slice(validated.lastIndexOf('.') + 1).toLowerCase()
    if (!WORKBOOK_EXTS.has(ext)) throw new Error(`Unsupported workbook: ${ext}`)
    return openSelectedWorkbook(event, validated)
  })

  // Merge sources: same open pipeline as selectWorkbook, but multi-select,
  // never consuming the shell's queued open path and never retitling the tab
  // (workbookOpenedHook) — these sessions exist only to be read from and
  // closed by the renderer's merge routine.
  /** Open the given spreadsheet paths as merge-source sessions; cleans up
   *  everything already opened when a later file fails or the tab dies. */
  const openMergeSources = async (
    event: Electron.IpcMainInvokeEvent,
    paths: readonly string[],
  ): Promise<unknown[] | null> => {
    const entry = sessionFor(event)
    const opened: { sessionId: string }[] = []
    const closeOpened = async () => {
      for (const { sessionId } of opened) {
        const session = entry.sessions.get(sessionId)
        entry.sessions.delete(sessionId)
        if (session !== undefined) {
          await cleanupSessionResources({
            tempRoot: app.getPath('temp'),
            snapshotPath: session.snapshotPath,
            importTempDir: session.importTempDir,
            closeSidecar: () => entry.client.close(sessionId),
          })
        }
      }
    }
    try {
      for (const path of paths) {
        const prepared = await prepareWorkbookForOpen(
          entry.client,
          path,
          event.sender,
          dialogParent(event),
          { skipRecoveryPrompt: true },
        )
        // a cancelled password prompt cancels the whole merge pick
        if (prepared === null) {
          await closeOpened()
          return null
        }
        if (event.sender.isDestroyed()) {
          await discardPreparedOpen(prepared)
          break
        }
        const result = await openWorkbookSession(entry.client, prepared.openPath, entry.sessions, {
          suggestSaveAs: prepared.suggestSaveAs,
          csvImport: prepared.csvImport,
          csvSourcePath: prepared.csvSourcePath,
          importTempDir: prepared.importTempDir,
          restoreTarget: prepared.restoreTarget,
          emptySource: prepared.emptySource,
          unsavedNew: prepared.unsavedNew,
          password: prepared.password,
        })
        opened.push(result as { sessionId: string })
        if (event.sender.isDestroyed()) break
      }
    } catch (error) {
      // a later file failing must not strand the sessions already opened
      await closeOpened()
      throw error
    }
    if (event.sender.isDestroyed()) {
      await closeOpened()
      return null
    }
    return opened.length > 0 ? opened : null
  }

  ipcMain.handle(IPC_CHANNELS.selectWorkbooksForMerge, async (event) => {
    const selection = await openFileDialog(event, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: tm('filterSpreadsheets'), extensions: ['xlsx', 'xlsm', 'xls', 'csv', 'tsv'] },
      ],
    })
    if (selection.canceled || selection.filePaths.length === 0) return null
    return openMergeSources(event, selection.filePaths)
  })

  const MERGE_SOURCE_EXTS = WORKBOOK_EXTS
  ipcMain.handle(IPC_CHANNELS.openWorkbooksForMerge, async (event, input: unknown) => {
    const paths = z.array(z.string().min(1)).min(1).max(20).parse(input)
    for (const path of paths) {
      const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
      if (!MERGE_SOURCE_EXTS.has(ext)) throw new Error(`Unsupported merge source: ${ext}`)
      if (!existsSync(path)) throw new Error('Merge source not found.')
      // an attached workbook open with unsaved changes is not read, like any attachment
      await assertFileSaved(path)
    }
    return openMergeSources(event, paths)
  })

  ipcMain.handle(IPC_CHANNELS.readWorkbookRange, async (event, input: unknown) => {
    const entry = sessionFor(event)
    const request = workbookRangeRequestSchema.parse(input)
    if (!entry.sessions.has(request.sessionId)) throw new Error('Unknown workbook session.')
    const result = await entry.client.readRange(request)
    return workbookRangeResultSchema.parse(result)
  })

  ipcMain.handle(IPC_CHANNELS.readWorkbookFormulas, async (event, input: unknown) => {
    const entry = sessionFor(event)
    const request = workbookFormulaCellsRequestSchema.parse(input)
    if (!entry.sessions.has(request.sessionId)) throw new Error('Unknown workbook session.')
    const result = await entry.client.readFormulaCells(request)
    return workbookFormulaCellsResultSchema.parse(result)
  })

  ipcMain.handle(IPC_CHANNELS.findWorkbookCells, async (event, input: unknown) => {
    const entry = sessionFor(event)
    const request = workbookFindCellsRequestSchema.parse(input)
    if (!entry.sessions.has(request.sessionId)) throw new Error('Unknown workbook session.')
    const result = await entry.client.findCells(request)
    return workbookFindCellsResultSchema.parse(result)
  })

  ipcMain.handle(IPC_CHANNELS.readWorkbookRowOutline, async (event, input: unknown) => {
    const entry = sessionFor(event)
    const request = workbookFormulaCellsRequestSchema.parse(input)
    if (!entry.sessions.has(request.sessionId)) throw new Error('Unknown workbook session.')
    const result = await entry.client.readRowOutline(request)
    return workbookRowOutlineResultSchema.parse(result)
  })

  // IronCalc recalculation: sheet ids resolve through the session's file
  // sheet names, so the renderer never sees paths and sheets added this
  // session (no file part) fail closed before reaching the engine.
  const sidecarRecalcResultSchema = z
    .object({
      cells: z.array(
        z
          .object({
            sheet: z.string(),
            row: z.number().int().nonnegative(),
            column: z.number().int().nonnegative(),
            formatted: z.string(),
            number: z.number().optional(),
            isError: z.boolean().optional(),
            isFormula: z.boolean(),
          })
          .strict(),
      ),
      cached: z.boolean().optional(),
    })
    .strict()
  ipcMain.handle(IPC_CHANNELS.recalcWorkbook, async (event, input: unknown) => {
    const entry = sessionFor(event)
    const request = workbookRecalcRequestSchema.parse(input)
    const session = entry.sessions.get(request.sessionId)
    if (!session) throw new Error('Unknown workbook session.')
    const fileSheetName = (sheetId: string): string => {
      const name = session.sheetNames.get(sheetId)
      if (name === undefined) throw new Error(`Unknown sheet for recalculation: ${sheetId}`)
      return name
    }
    const result = sidecarRecalcResultSchema.parse(
      await entry.client.recalcCells({
        // The snapshot, not the live path: recalculated values are painted on
        // the session's grid (and saved into its formula cells), so they must
        // come from the session's own bytes even if the file changed on disk.
        path: session.snapshotPath,
        edits: request.edits.map((edit) => ({
          sheet: fileSheetName(edit.sheetId),
          row: edit.row,
          column: edit.column,
          input: edit.input,
        })),
        reads: request.reads.map((read) => ({
          sheet: fileSheetName(read.sheetId),
          range: read.range,
        })),
      }),
    )
    const idsByName = new Map([...session.sheetNames].map(([id, name]) => [name, id]))
    return workbookRecalcResultSchema.parse({
      cells: result.cells.flatMap((cell) => {
        const sheetId = idsByName.get(cell.sheet)
        if (sheetId === undefined) return []
        return [
          {
            sheetId,
            row: cell.row,
            column: cell.column,
            formatted: cell.formatted,
            ...(cell.number === undefined ? {} : { number: cell.number }),
            ...(cell.isError ? { isError: true } : {}),
            isFormula: cell.isFormula,
          },
        ]
      }),
    })
  })

  ipcMain.handle(IPC_CHANNELS.readWorkbookMedia, async (event, input: unknown) => {
    const entry = sessionFor(event)
    const request = workbookMediaRequestSchema.parse(input)
    if (!entry.sessions.has(request.sessionId)) throw new Error('Unknown workbook session.')
    const result = await entry.client.readMedia(request)
    return workbookMediaResultSchema.parse(result)
  })

  function sniffImageType(bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/gif' | null {
    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    )
      return 'image/png'
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg'
    }
    if (bytes.length >= 6 && bytes.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif'
    return null
  }

  ipcMain.handle(IPC_CHANNELS.readLocalImage, async (event, input: unknown) => {
    sessionFor(event)
    const request = localImageRequestSchema.parse(input)
    const resolved = request.path.startsWith('~/')
      ? join(app.getPath('home'), request.path.slice(2))
      : request.path
    if (!isAbsolute(resolved)) throw new Error(tm('errImgAbsPath'))
    const info = await stat(resolved).catch(() => null)
    if (!info?.isFile()) throw new Error(tm('errImgNotFound', { path: request.path }))
    if (info.size > 20 * 1024 * 1024) throw new Error(tm('errImgTooLarge20'))
    const bytes = await readFile(resolved)
    const mediaType = sniffImageType(bytes)
    if (mediaType === null) {
      throw new Error(tm('errImgBadType'))
    }
    return localImageResultSchema.parse({ mediaType, base64: bytes.toString('base64') })
  })

  ipcMain.handle(IPC_CHANNELS.captureScreenSources, async (event) => {
    sessionFor(event)
    // macOS gates desktopCapturer behind the Screen Recording permission and
    // returns black frames instead of failing; surface a real denied state.
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('screen')
      if (status !== 'granted' && status !== 'not-determined') {
        return screenSourcesResultSchema.parse({ status: 'denied', sources: [] })
      }
    }
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 200 },
      fetchWindowIcons: false,
    })
    if (
      process.platform === 'darwin' &&
      systemPreferences.getMediaAccessStatus('screen') !== 'granted'
    ) {
      return screenSourcesResultSchema.parse({ status: 'denied', sources: [] })
    }
    const selfWindow = hostWindowFor(event.sender)
    const selfId = selfWindow?.getMediaSourceId()
    return screenSourcesResultSchema.parse({
      status: 'ok',
      sources: sources
        .filter((source) => source.id !== selfId)
        .map((source) => ({
          id: source.id,
          name: source.name,
          kind: source.id.startsWith('screen') ? 'screen' : 'window',
          thumbnail: source.thumbnail.isEmpty() ? '' : source.thumbnail.toDataURL(),
        })),
    })
  })

  ipcMain.handle(IPC_CHANNELS.captureScreenSource, async (event, input: unknown) => {
    sessionFor(event)
    const request = screenCaptureRequestSchema.parse(input)
    // desktopCapturer only ever returns thumbnails, so a full-res capture is
    // a re-listing with the thumbnail sized to the largest physical display.
    const displays = screen.getAllDisplays()
    const captureSize = {
      width: Math.min(
        4096,
        Math.max(1920, ...displays.map((d) => Math.ceil(d.size.width * d.scaleFactor))),
      ),
      height: Math.min(
        4096,
        Math.max(1080, ...displays.map((d) => Math.ceil(d.size.height * d.scaleFactor))),
      ),
    }
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: captureSize,
      fetchWindowIcons: false,
    })
    const source = sources.find((candidate) => candidate.id === request.id)
    if (!source || source.thumbnail.isEmpty()) return null
    let image = source.thumbnail
    let png = image.toPNG()
    if (png.length > 20 * 1024 * 1024) {
      image = image.resize({ width: Math.round(image.getSize().width / 2) })
      png = image.toPNG()
    }
    const { width, height } = image.getSize()
    return screenCaptureResultSchema.parse({
      mediaType: 'image/png',
      base64: png.toString('base64'),
      width,
      height,
    })
  })

  ipcMain.handle(IPC_CHANNELS.readPivotDefinition, async (event, input: unknown) => {
    const entry = sessionFor(event)
    const request = workbookPivotRequestSchema.parse(input)
    const session = entry.sessions.get(request.sessionId)
    if (!session) throw new Error('Unknown workbook session.')
    // Read from the session snapshot so the definition matches what the
    // renderer shows even if the file on disk changed since open.
    const [pivotXml, cacheXml] = await Promise.all([
      readArchiveEntryText(entry.client, session.snapshotPath, request.path),
      readArchiveEntryText(entry.client, session.snapshotPath, request.cachePath),
    ])
    return workbookPivotDefinitionSchema.parse(parsePivotDefinition(pivotXml, cacheXml))
  })

  ipcMain.handle(IPC_CHANNELS.exportPdf, async (event, input: unknown) => {
    sessionFor(event)
    const request = workbookExportPdfRequestSchema.parse(input)
    const result = await exportPdf(event, request)
    if (!result.canceled && result.path) openGeneratedFile(result.path)
    return result
  })

  ipcMain.handle(IPC_CHANNELS.printWorkbook, async (event, input: unknown) => {
    sessionFor(event)
    return printWorkbook(event, workbookExportPdfRequestSchema.parse(input))
  })

  ipcMain.handle(IPC_CHANNELS.listPrinters, async (event) => {
    sessionFor(event)
    const printers = await event.sender.getPrintersAsync()
    return printers.map((printer) =>
      printerInfoSchema.parse({
        name: printer.name,
        displayName: printer.displayName || printer.name,
      }),
    )
  })

  ipcMain.handle(IPC_CHANNELS.exportCsv, async (event, input: unknown) => {
    const entry = sessionFor(event)
    const request = workbookExportCsvRequestSchema.parse(input)
    const parent = dialogParent(event)
    if (request.hasFormulas) {
      // Excel's CSV warning flow: offer keeping the formulas via .xlsx first.
      const options = {
        type: 'warning' as const,
        message: tm('csvFormulaLossMsg'),
        detail: tm('csvFormulaLossDetail'),
        buttons: [tm('csvKeepXlsxBtn'), tm('csvContinueBtn'), tm('btnCancel')],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      }
      const { response } = parent
        ? await dialog.showMessageBox(parent, options)
        : await dialog.showMessageBox(options)
      if (response === 0) return { canceled: true, saveAsXlsxInstead: true }
      if (response === 2) return { canceled: true }
    }
    let pickedPath = request.targetPath
    if (pickedPath === undefined) {
      const selection = await saveFileDialog(event, {
        defaultPath: request.fileName,
        filters: [{ name: tm('filterCsv'), extensions: ['csv'] }],
        ...(request.activeSheetName
          ? {
              title: tm('csvActiveSheetOnlyNotice', { name: request.activeSheetName }),
              message: tm('csvActiveSheetOnlyNotice', { name: request.activeSheetName }),
            }
          : {}),
      })
      if (selection.canceled || !selection.filePath) return { canceled: true }
      pickedPath = selection.filePath
    }
    const targetPath = pickedPath.toLowerCase().endsWith('.csv') ? pickedPath : `${pickedPath}.csv`
    // UTF-8 BOM so Excel decodes the reopened file correctly. Written beside
    // the destination and renamed into place: a plain writeFile creates the
    // (empty) file before the data lands, and anything watching for the
    // export — the e2e retry loop included — can read zero bytes in that
    // window.
    const csvBytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(request.content, 'utf8'),
    ])
    await atomicWriteFile(targetPath, csvBytes)
    // An export can land on a CSV session's own source file; refresh the
    // digest so the next Save does not read this write as an external change.
    const writtenSha = await sha256File(targetPath).catch(() => undefined)
    if (writtenSha !== undefined) refreshCsvDigest(entry.sessions, targetPath, writtenSha)
    return { canceled: false, path: targetPath }
  })

  // AI create_document: dialog-free — the file lands in the default save
  // folder under a unique sanitized name and opens in a new tab. xlsx/csv
  // write the renderer-serialized worksheet data here (xlsx through the same
  // CSV→xlsx conversion as CSV imports, values only); docx/pdf/md go through
  // the host-owned creator (the shell routes them into the docs flow, #960).
  ipcMain.handle(
    IPC_CHANNELS.createDocument,
    async (event, input: unknown): Promise<WorkbookCreateDocumentResult> => {
      sessionFor(event)
      const request = workbookCreateDocumentRequestSchema.parse(input)
      try {
        if (request.type === 'csv') {
          const filePath = uniquePathIn(
            configuredDefaultSaveDir(app),
            `${sanitizeGeneratedFileBase(request.title)}.csv`,
          )
          // UTF-8 BOM so Excel decodes the reopened file correctly (same as exportCsv)
          await atomicWriteFile(
            filePath,
            Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(request.content, 'utf8')]),
          )
          openGeneratedFile(filePath)
          return { ok: true, path: filePath }
        }
        if (request.type === 'xlsx') {
          const buffer = await sheetCsvToXlsxBuffer(request.content, request.sheetName ?? 'Sheet1')
          const filePath = uniquePathIn(
            configuredDefaultSaveDir(app),
            `${sanitizeGeneratedFileBase(request.title)}.xlsx`,
          )
          await atomicWriteFile(filePath, buffer)
          openGeneratedFile(filePath)
          return { ok: true, path: filePath }
        }
        const create = runtime.createDocument
        if (!create) return { ok: false, error: 'Document creation is unavailable in this host.' }
        return await create({ type: request.type, title: request.title, content: request.content })
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  // First Save of a CSV session: Excel's "keep this format?" question. The
  // renderer remembers the answer for the file, so it is asked once.
  ipcMain.handle(IPC_CHANNELS.csvSaveConfirm, async (event) => {
    sessionFor(event)
    const options = {
      type: 'warning' as const,
      message: tm('csvKeepFormatMsg'),
      detail: tm('csvKeepFormatDetail'),
      buttons: [tm('csvContinueBtn'), tm('csvKeepXlsxBtn'), tm('btnCancel')],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    }
    const parent = dialogParent(event)
    const { response } = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options)
    return response === 0 ? 'csv' : response === 1 ? 'xlsx' : 'cancel'
  })

  ipcMain.handle(IPC_CHANNELS.saveWorkbook, async (event, input: unknown) => {
    const entry = sessionFor(event)
    const client = entry.client
    const request = resolveTransferredEdits(entry, workbookSaveRequestSchema.parse(input))
    const session = entry.sessions.get(request.sessionId)
    if (!session) throw new Error('Unknown workbook session.')

    // A CSV session's plain Save keeps the CSV identity: the xlsx save lands
    // on the temp copy and the serialized csvContent is written back to the
    // original .csv afterwards.
    const csvInPlace = request.mode === 'save' && session.csvSourcePath !== undefined
    let targetPath = session.path
    // MCP explicit-path save (planning/mcp-server.md): dialog-free Save As to
    // an exact path with a clobber guard — docs:save-to parity. Only the xlsx
    // pipeline is reachable this way (.xlsm/.csv need their interactive flows).
    if (request.targetPath !== undefined) {
      if (request.mode !== 'save-as') throw new Error('An explicit save path needs Save As.')
      if (!isAbsolute(request.targetPath)) throw new Error('Save path must be absolute.')
      targetPath = /\.xlsx$/i.test(request.targetPath)
        ? request.targetPath
        : `${request.targetPath}.xlsx`
      // only a target the MCP layer resolved for this tab may be written without a dialog
      if (!canMcpSheetWrite(event.sender.id, targetPath)) {
        throw new Error('save target was not authorized')
      }
      if (existsSync(targetPath) && request.overwrite !== true) {
        throw new Error(`file already exists: ${targetPath}`)
      }
    } else if (request.mode === 'save' && request.quiet && session.unsavedNew) {
      // AutoSave / AI-run autosave of a workbook the user has not named yet:
      // no dialog mid-flow, the edits land in the backing temp file and the
      // session stays an unsaved new one (Ctrl+S still asks where to save)
      targetPath = session.path
    } else if (request.mode === 'save-as' || session.suggestSaveAs !== undefined) {
      // .xlsm keeps its extension: untouched archive entries (vbaProject.bin,
      // the macro-enabled content type) round-trip verbatim through the save.
      const macroEnabled = /\.xlsm$/i.test(
        session.suggestSaveAs ?? session.restoreTarget ?? session.path,
      )
      const ext = macroEnabled ? 'xlsm' : 'xlsx'
      const selection = await saveFileDialog(event, {
        defaultPath:
          session.suggestSaveAs ??
          session.csvSourcePath?.replace(/\.[^.]+$/, '.xlsx') ??
          session.restoreTarget ??
          session.path,
        filters: macroEnabled
          ? [{ name: tm('filterXlsm'), extensions: ['xlsm'] }]
          : [
              { name: tm('filterXlsx'), extensions: ['xlsx'] },
              { name: tm('filterCsv'), extensions: ['csv'] },
            ],
        // CSV import: explain why the save goes through .xlsx (CSV keeps values only)
        ...(session.csvImport
          ? { title: tm('csvSaveAsNotice'), message: tm('csvSaveAsNotice') }
          : {}),
      })
      if (selection.canceled || !selection.filePath) return { canceled: true }
      // A CSV pick can't ride the xlsx pipeline: hand the path back so the
      // renderer serializes the active sheet through the CSV export channel.
      if (!macroEnabled && selection.filePath.toLowerCase().endsWith('.csv')) {
        return { canceled: true, csvSaveAsPath: selection.filePath }
      }
      targetPath = selection.filePath.toLowerCase().endsWith(`.${ext}`)
        ? selection.filePath
        : `${selection.filePath}.${ext}`
    } else if (session.restoreTarget !== undefined) {
      // Restored crash-recovery copy: the restore prompt was the confirmation,
      // so Save writes straight back to the original — unless someone else
      // changed it since the restore.
      const verdict = await guardSplitSave({
        path: session.restoreTarget,
        recorded: recordedStateFor(session, session.restoreTarget),
        quiet: request.quiet === true,
        event,
      })
      if (verdict === 'cancel') return { canceled: true }
      if (verdict !== 'overwrite') {
        const currentSha = await sha256File(session.restoreTarget).catch(() => undefined)
        if (currentSha !== undefined && currentSha !== session.restoreTargetSha) {
          throw new Error(tm('errDiskChanged'))
        }
      }
      targetPath = session.restoreTarget
    } else {
      // Plain in-place save: refuse to silently overwrite a file some other
      // program changed after this session opened it. Save As (above) skips
      // this guard on purpose — it patches the session snapshot, not the live
      // file, and writes to a path the user just confirmed, so it stays
      // usable as the escape hatch this error message points to. A file that
      // was deleted on disk is fine: saving recreates it. Split-view copy
      // pairs are judged first: their confirmed overwrite already covered the
      // disk change, so the refusal below steps aside for that one write.
      const verdict = await guardSplitSave({
        path: session.path,
        recorded: recordedStateFor(session, session.path),
        quiet: request.quiet === true,
        event,
      })
      if (verdict === 'cancel') return { canceled: true }
      if (verdict !== 'overwrite') {
        const currentSha = await sha256File(session.path).catch(() => undefined)
        if (currentSha !== undefined && currentSha !== session.sha256) {
          throw new Error(tm('errDiskChanged'))
        }
      }
    }
    // The CSV write-back gets the same external-change guard as restoreTarget;
    // a deleted .csv is fine — the write recreates it.
    if (csvInPlace && session.csvSourcePath !== undefined) {
      const verdict = await guardSplitSave({
        path: session.csvSourcePath,
        recorded: recordedStateFor(session, session.csvSourcePath),
        quiet: request.quiet === true,
        event,
      })
      if (verdict === 'cancel') return { canceled: true }
      if (verdict !== 'overwrite') {
        const csvSha = await sha256File(session.csvSourcePath).catch(() => undefined)
        if (csvSha !== undefined && csvSha !== session.csvSourceSha) {
          throw new Error(tm('errDiskChanged'))
        }
      }
    }

    // An encrypted workbook's save lands as plaintext only inside its own temp
    // dir; the target receives the re-encrypted bytes, so no plaintext ever
    // reaches the user's folder.
    const plainSaveDir =
      session.password !== undefined && session.importTempDir !== undefined
        ? join(session.importTempDir, randomUUID())
        : undefined
    const plainSavePath =
      plainSaveDir === undefined ? undefined : join(plainSaveDir, basename(targetPath))
    if (plainSaveDir !== undefined) await mkdir(plainSaveDir, { recursive: true })
    // The save lands on the next session's snapshot first, and the sidecar
    // opens it there before any user-visible file is touched. Writing the
    // target first and reopening it afterwards meant an output the engine
    // could not read back had already replaced the original, while the old
    // session was gone — every later Save then failed with "Unknown workbook
    // session." and the edits could not be saved anywhere.
    const stagedPath = await reserveSnapshotPath()
    let mutation: Awaited<ReturnType<typeof writeWorkbookTo>>
    try {
      mutation = await writeWorkbookTo(client, session, request, stagedPath)
    } catch (error) {
      await rm(stagedPath, { force: true }).catch(() => undefined)
      throw error
    }
    let stagedOpen: SidecarOpenResult
    try {
      stagedOpen = sidecarOpenResultSchema.parse(
        await client.open(stagedPath, getUiLang(), systemShortDate()),
      )
    } catch (error) {
      await rm(stagedPath, { force: true }).catch(() => undefined)
      console.warn('[sheets] the saved workbook did not reopen; the target was left as is:', error)
      throw new Error(tm('errSaveUnreadable'), { cause: error })
    }
    try {
      if (plainSavePath !== undefined && session.password !== undefined) {
        await copyFile(stagedPath, plainSavePath)
        await atomicWriteFile(
          targetPath,
          encryptOoxml(await readFile(stagedPath), session.password),
        )
      } else {
        await placeStagedSave(stagedPath, targetPath)
      }

      if (csvInPlace && session.csvSourcePath !== undefined && request.csvContent !== undefined) {
        // The temp copy already holds the saved bytes: refresh the session's
        // guard digest first, so a failed CSV write-back below leaves a
        // retryable session instead of stranding the next Save on
        // errDiskChanged against its own write.
        const savedSha = await sha256File(session.path).catch(() => undefined)
        if (savedSha !== undefined && entry.sessions.has(request.sessionId)) {
          entry.sessions.set(request.sessionId, { ...session, sha256: savedSha })
        }
        // UTF-8 BOM so Excel decodes the reopened file correctly.
        await writeFile(
          session.csvSourcePath,
          Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(request.csvContent, 'utf8')]),
        )
      }
    } catch (error) {
      await client.close(stagedOpen.sessionId).catch(() => undefined)
      await rm(stagedPath, { force: true }).catch(() => undefined)
      throw error
    }

    // The sidecar session still streams the pre-save bytes; swap it for a
    // fresh session over the saved file so future reads match the disk state.
    const quietUnsavedNew = targetPath === session.path && session.unsavedNew === true
    entry.sessions.delete(request.sessionId)
    await cleanupSessionResources({
      tempRoot: app.getPath('temp'),
      snapshotPath: session.snapshotPath,
      // A CSV in-place save keeps saving into the temp copy, and a quiet save of
      // an unsaved new workbook just wrote its backing file — the directory
      // must survive the session swap. So must an encrypted workbook's: the
      // next session runs on the plaintext copy just written there.
      importTempDir:
        csvInPlace || quietUnsavedNew || plainSavePath !== undefined
          ? undefined
          : session.importTempDir,
      closeSidecar: () => client.close(request.sessionId),
    })
    if (plainSavePath !== undefined) await rm(session.path, { force: true }).catch(() => undefined)
    const staged = { snapshotPath: stagedPath, opened: stagedOpen }
    const file = await openWorkbookSession(
      client,
      plainSavePath ?? targetPath,
      entry.sessions,
      plainSavePath !== undefined
        ? {
            importTempDir: session.importTempDir,
            restoreTarget: targetPath,
            password: session.password,
            staged,
          }
        : csvInPlace
          ? {
              csvImport: true,
              csvSourcePath: session.csvSourcePath,
              importTempDir: session.importTempDir,
              // the CSV stays open: later edits keep writing the same copy slot
              recoveryIdentity: session.recoveryIdentity,
              recoveryOriginalPath: session.recoveryOriginalPath,
              staged,
            }
          : quietUnsavedNew
            ? {
                suggestSaveAs: session.suggestSaveAs,
                importTempDir: session.importTempDir,
                unsavedNew: true,
                recoveryIdentity: session.recoveryIdentity,
                recoveryOriginalPath: session.recoveryOriginalPath,
                unsavedRestore: session.unsavedRestore,
                staged,
              }
            : { staged },
    )
    if (quietUnsavedNew && session.suggestSaveAs !== undefined) {
      // the temp path must not reach the title or recents; the recovery copy
      // is what a crash restores from (and what keeps the tab unsaved), so it
      // tracks the saved bytes even when the periodic copy is off for size
      try {
        await writeSessionCopy(event.sender.id, session, (target) => copyFile(targetPath, target), {
          ignoreSizeLimit: true,
        })
      } catch (error) {
        console.warn('[sheets] recovery copy of an unsaved new workbook failed:', error)
      }
      return { canceled: false, file, touchedEntries: mutation.touchedEntries }
    }
    // Notify shell (if running) so it can update the tab title and record the
    // saved path in recent files (mirrors the open hook; covers Save As + first
    // save after converting an .xls/.csv import). A CSV session's user-visible
    // file is the original .csv, not the temp copy the xlsx save landed on.
    workbookOpenedHook?.(
      event.sender,
      (csvInPlace ? session.csvSourcePath : undefined) ?? targetPath,
    )
    // The file on disk now carries these edits: the saved document's copy goes,
    // and so does the copy the session wrote under its own identity (an
    // untitled workbook's, or a restored file's when Save As went elsewhere).
    deleteCopiesAfterSave(event.sender.id, [
      fileRecoveryIdentity(targetPath),
      sessionRecoveryIdentity(session),
      session.restoreTarget === undefined ? null : fileRecoveryIdentity(session.restoreTarget),
    ])
    return { canceled: false, file, touchedEntries: mutation.touchedEntries }
  })

  // Chunked upload for edit sets too large to inline in one save request:
  // the renderer opens a transfer, streams ordered slices, then references
  // the transfer id from the save (or recovery) request that follows.
  ipcMain.handle(IPC_CHANNELS.saveEditsBegin, (event, input: unknown) => {
    const entry = sessionFor(event)
    const request = workbookSaveEditsBeginSchema.parse(input)
    if (!entry.sessions.has(request.sessionId)) throw new Error('Unknown workbook session.')
    entry.saveTransfers.begin(request)
  })

  ipcMain.handle(IPC_CHANNELS.saveEditsChunk, (event, input: unknown) => {
    const entry = sessionFor(event)
    const request = workbookSaveEditsChunkSchema.parse(input)
    // The chunk crosses the bridge and the IPC hop as a flat JSON string;
    // the edits stay untrusted input until they pass the cell-edit schema.
    entry.saveTransfers.addChunk({
      sessionId: request.sessionId,
      transferId: request.transferId,
      seq: request.seq,
      edits: saveEditsChunkArraySchema.parse(JSON.parse(request.editsJson)),
    })
  })

  // Best-effort cleanup from renderer failure paths; a no-op if the transfer
  // was already consumed or expired.
  ipcMain.handle(IPC_CHANNELS.saveEditsAbort, (event, input: unknown) => {
    const entry = sessionFor(event)
    const request = workbookSaveEditsAbortSchema.parse(input)
    entry.saveTransfers.discard(request.transferId, request.sessionId)
  })

  // Crash-recovery copy of a dirty workbook: the same save pipeline with a
  // userData target, no session swap and no dialogs — best-effort, silent on failure.
  ipcMain.handle(IPC_CHANNELS.writeWorkbookRecovery, async (event, input: unknown) => {
    const entry = sessionFor(event)
    const request = resolveTransferredEdits(entry, workbookSaveRequestSchema.parse(input))
    const session = entry.sessions.get(request.sessionId)
    // Which copy (if any) is decided by sessionRecoveryIdentity: none for a
    // password workbook; an untitled slot for a new workbook and for a CSV or
    // converted session; the user's file for a restored copy or an empty
    // original (both run on a temp file the session was snapshotted from).
    if (!session) return { ok: false }
    try {
      const written = await writeSessionCopy(event.sender.id, session, (target) =>
        writeWorkbookTo(entry.client, session, request, target),
      )
      return { ok: written }
    } catch (error) {
      console.warn('[sheets] recovery copy failed:', error)
      return { ok: false }
    }
  })

  // The workbook as edited, for a skill's template (spec 5.6): written to a
  // temp file of its own through the save writer and read back. No dialog, no
  // session swap, the opened file and the recovery copy untouched.
  ipcMain.handle(IPC_CHANNELS.workbookTemplateBytes, async (event, input: unknown) => {
    const entry = sessionFor(event)
    const request = resolveTransferredEdits(entry, workbookSaveRequestSchema.parse(input))
    const session = entry.sessions.get(request.sessionId)
    if (!session) return { ok: false }
    const directory = join(app.getPath('temp'), 'genoffice-imports', randomUUID())
    try {
      await mkdir(directory, { recursive: true })
      const target = join(directory, 'template.xlsx')
      await writeWorkbookTo(entry.client, session, request, target)
      const bytes = new Uint8Array(await readFile(target))
      return { ok: true, bytes }
    } catch (error) {
      console.warn('[sheets] template copy failed:', error)
      return { ok: false }
    } finally {
      await cleanupImportTempDirectory(app.getPath('temp'), directory).catch(() => undefined)
    }
  })

  ipcMain.handle(IPC_CHANNELS.closeWorkbook, async (event, sessionId: unknown) => {
    const entry = sessionFor(event)
    const validatedSessionId = z.string().uuid().parse(sessionId)
    entry.saveTransfers.discardSession(validatedSessionId)
    const session = entry.sessions.get(validatedSessionId)
    if (!entry.sessions.delete(validatedSessionId)) return
    if (session === undefined) return
    // The copy is left alone here: this also runs while the app quits (the
    // renderer unmounts) and when a tab swaps workbooks. A copy still holding
    // unsaved work is remembered so the tab's clean close keeps it.
    noteSessionClosed(event.sender.id, session)
    await cleanupSessionResources({
      tempRoot: app.getPath('temp'),
      snapshotPath: session.snapshotPath,
      importTempDir: session.importTempDir,
      closeSidecar: () => entry.client.close(validatedSessionId),
    })
  })

  // Content-derived naming for AI-generated workbooks (sheets' analog of slides'
  // deckName): the renderer proposes a base name after an AI run lands; the file
  // is renamed only while it still carries the shell's auto-created untitled name.
  ipcMain.handle(
    IPC_CHANNELS.autoRenameWorkbook,
    (event, sessionId: unknown, baseName: unknown) => {
      const entry = sessionFor(event)
      const validatedSessionId = z.string().uuid().parse(sessionId)
      const session = entry.sessions.get(validatedSessionId)
      if (!session || !untitledWorkbookPaths.has(session.path)) return { renamed: false }
      const base = sanitizeAutoRenameBase(z.string().min(1).max(100).parse(baseName))
      if (!base) return { renamed: false }
      // An unsaved new workbook has no user-visible file to rename — it sits in
      // a temp directory that closing the tab discards. Retarget the suggested
      // Save As name instead, so the AI-derived name is what the first save
      // offers, and leave the mark in place for a later run. No rename on disk
      // and no open hook: the temp path must not reach the title or recents.
      if (session.suggestSaveAs !== undefined) {
        const suggestDir = dirname(session.suggestSaveAs)
        let suggested = join(suggestDir, `${base}.xlsx`)
        const taken = (p: string) =>
          p !== session.suggestSaveAs && (existsSync(p) || sheetsSuggestedPathTaken(p))
        for (let i = 2; taken(suggested) && i < 100; i++) {
          suggested = join(suggestDir, `${base}-${i}.xlsx`)
        }
        if (suggested === session.suggestSaveAs || taken(suggested)) return { renamed: false }
        entry.sessions.set(validatedSessionId, { ...session, suggestSaveAs: suggested })
        event.sender.send(IPC_CHANNELS.workbookRenamed, basename(suggested))
        return { renamed: true, name: basename(suggested) }
      }
      const dir = dirname(session.path)
      let target = join(dir, `${base}.xlsx`)
      for (let i = 2; existsSync(target) && i < 100; i++) target = join(dir, `${base}-${i}.xlsx`)
      if (existsSync(target) || target === session.path) return { renamed: false }
      try {
        renameSync(session.path, target)
      } catch (err) {
        console.warn('[sheets] auto-rename failed:', err)
        return { renamed: false }
      }
      untitledWorkbookPaths.delete(session.path)
      entry.sessions.set(validatedSessionId, { ...session, path: target })
      event.sender.send(IPC_CHANNELS.workbookRenamed, basename(target))
      // Same contract as open/save: shell updates the tab title and recents
      workbookOpenedHook?.(event.sender, target)
      return { renamed: true, name: basename(target) }
    },
  )

  ipcMain.handle(IPC_CHANNELS.openExternal, async (event, url: unknown) => {
    sessionFor(event)
    const validatedUrl = safeExternalUrl(url)
    if (!validatedUrl) {
      throw new Error('Only http(s) links can be opened.')
    }
    await shell.openExternal(validatedUrl)
  })

  // ── Chat attachments (same structure as the docs/slides files:* pipeline) ──

  ipcMain.handle(IPC_CHANNELS.filesPick, async (event): Promise<AttachmentAddResult | null> => {
    sessionFor(event)
    const selection = await openFileDialog(event, {
      title: tm('dlgAddAttachment'),
      filters: [
        { name: tm('filterSupported'), extensions: [...ATTACHABLE_EXTS] },
        { name: tm('filterAll'), extensions: ['*'] },
      ],
      properties: ['openFile', 'multiSelections'],
    })
    if (selection.canceled || selection.filePaths.length === 0) return null
    return collectAttachments(selection.filePaths)
  })

  ipcMain.handle(IPC_CHANNELS.filesAdd, (event, paths: unknown): AttachmentAddResult => {
    sessionFor(event)
    return collectAttachments(z.array(z.string().min(1).max(1024)).max(50).parse(paths))
  })

  ipcMain.handle(
    IPC_CHANNELS.filesRead,
    async (
      event,
      filePath: unknown,
      offset: unknown,
      maxChars: unknown,
    ): Promise<AttachmentReadResult> => {
      sessionFor(event)
      const validatedPath = z.string().min(1).max(1024).parse(filePath)
      const name = basename(validatedPath)
      const ext = name.split('.').pop()?.toLowerCase() ?? ''
      if (!ATTACHABLE_EXTS.has(ext)) return { ok: false, error: tm('errUnsupportedExt', { ext }) }
      if (ATTACHABLE_IMAGE_EXTS.has(ext)) {
        return { ok: false, error: tm('errImageNoText') }
      }
      try {
        const text = await extractAttachmentText(validatedPath)
        const start = Math.max(0, Math.floor(Number(offset)) || 0)
        const size = Math.min(Math.max(1, Math.floor(Number(maxChars)) || 1), 48_000)
        return {
          ok: true,
          name,
          totalChars: text.length,
          offset: start,
          text: text.slice(start, start + size),
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  // Image attachments read raw bytes → base64; the renderer puts them into the
  // user message's images for multimodal input
  ipcMain.handle(IPC_CHANNELS.filesReadImage, (event, filePath: unknown): AttachmentImageResult => {
    sessionFor(event)
    const validatedPath = z.string().min(1).max(1024).parse(filePath)
    const name = basename(validatedPath)
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    const mime = ATTACHMENT_IMAGE_MIME[ext]
    if (!mime) return { ok: false, error: `${name}: ${tm('errNotImage')}` }
    try {
      const stat = statSync(validatedPath)
      if (stat.size > ATTACHABLE_IMAGE_MAX_BYTES) {
        return { ok: false, error: `${name}: ${tm('errImageTooLarge')}` }
      }
      return { ok: true, base64: readFileSync(validatedPath).toString('base64'), mime }
    } catch {
      return { ok: false, error: `${name}: ${tm('errUnreadable')}` }
    }
  })

  // Clipboard-pasted images (screenshots and other bitmaps without a local
  // path): persisted to a temp file, then go through the regular attachment flow
  ipcMain.handle(
    IPC_CHANNELS.filesAddPastedImage,
    (event, data: unknown, ext: unknown): AttachmentAddResult => {
      sessionFor(event)
      const filePath = savePastedImage(data, ext)
      return filePath
        ? collectAttachments([filePath])
        : { accepted: [], rejected: [tm('errNotImage')] }
    },
  )
}

let aiIpcRegistered = false

export function registerSheetsAiIpc(): void {
  if (aiIpcRegistered) return
  aiIpcRegistered = true
  app.once('before-quit', shutdownCodexAppServers)

  // Node fetch (undici) direct connections get reset under VPN/tun setups; retry over Chromium's stack
  setRescueFetch((url, init) => net.fetch(url, init))
  setAiUserAgent(`${PRODUCT_NAME}/${app.getVersion()}`)

  const broadcastAiSettingsChanged = (): void => {
    for (const wc of webContents.getAllWebContents())
      if (!wc.isDestroyed()) wc.send(IPC_CHANNELS.aiSettingsChanged)
  }

  // Subscription connection (Claude, Codex): one registration per process,
  // whichever editor's main asks first
  ensureSubscriptionIpc(ipcMain, {
    getSettings: () => aiSettingsFromStored(readJson<unknown>(SETTINGS_PATH(), {})),
    setMeteredAccepted: (provider, accepted) => {
      writeJsonAtomic(
        SETTINGS_PATH(),
        withMeteredAccepted(readJson<unknown>(SETTINGS_PATH(), {}), provider, accepted),
      )
      broadcastAiSettingsChanged()
    },
    dataDir: app.getPath('userData'),
    broadcast: (channel, payload) => {
      for (const wc of webContents.getAllWebContents())
        if (!wc.isDestroyed()) wc.send(channel, payload)
    },
    loginWindowText: (provider) => aiSubscriptionLoginWindowText(getUiLang(), provider),
  })

  ipcMain.handle(IPC_CHANNELS.aiGetSettings, (event): AiSettings => {
    sessionFor(event)
    return aiSettingsFromStored(readJson<unknown>(SETTINGS_PATH(), {}))
  })

  ipcMain.handle(IPC_CHANNELS.aiSetSettings, async (event, input: unknown) => {
    sessionFor(event)
    const settings = aiSettingsInputSchema.parse(input)
    writeJsonAtomic(SETTINGS_PATH(), sealAiSecrets(settings))
    broadcastAiSettingsChanged()
  })

  ipcMain.handle(IPC_CHANNELS.aiChat, async (event, input: unknown) => {
    sessionFor(event)
    const request = aiChatRequestSchema.parse(input)
    // never another provider than the one selected: a request none can run is refused
    const target = resolveAiRunTarget(request.settings, sharedSubscriptionStatuses())
    if (!target.ok) return { ok: false, error: target.block.error }
    const { provider, config } = target
    try {
      const result = await chatForProvider(provider, config, request.system, request.user)
      // the one-shot path reports HTTP failures as ok:false with the raw body —
      // replace capacity/rate-limit dumps with the localized "busy" message
      if (!result.ok && isAiOverloadedError(result.error)) {
        return { ok: false, error: tm('errAiBusy') }
      }
      return result
    } catch (err) {
      return { ok: false, error: isAiOverloadedError(err) ? tm('errAiBusy') : String(err) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.aiStream, async (event, input: unknown) => {
    const entry = sessionFor(event)
    const request = aiStreamRequestSchema.parse(input)
    const { requestId, system, messages } = request
    const tools = request.tools ?? []
    // never another provider than the one selected: a request none can run is
    // answered with its cause, so the panel shows how to connect
    const target = resolveAiRunTarget(request.settings, sharedSubscriptionStatuses())
    const maxTokens = request.maxTokens ?? maxOutputTokensOf(target.settings)
    const send = (chunk: AiStreamChunk) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.aiStreamChunk, chunk)
    }
    if (!target.ok) {
      send(aiRunBlockChunk(requestId, target.block))
      return
    }
    const { provider, config } = target
    const controller = new AbortController()
    entry.aiStreams.set(requestId, controller)
    const unwatchSender = abortOnDestroyed(event.sender, controller)
    // wire-activity keepalive: lets the renderer's silence watchdog tell a slow turn from a dead one
    let lastPing = 0
    const ping = () => {
      const now = Date.now()
      if (now - lastPing < 5_000) return
      lastPing = now
      send({ requestId, type: 'ping' })
    }
    try {
      let stopReason: string | undefined
      await streamForProvider(provider, config, system, messages, tools, maxTokens, {
        ...(request.sessionId ? { sessionId: request.sessionId } : {}),
        signal: controller.signal,
        onDelta: (text) => send({ requestId, type: 'delta', text }),
        onReasoningDelta: (text) => send({ requestId, type: 'reasoning', text }),
        onToolCall: (toolCall) => send({ requestId, type: 'tool-call', toolCall }),
        onActivity: ping,
        onStopReason: (reason) => {
          stopReason = reason
        },
        onUsage: (usage) => send({ requestId, type: 'usage', usage }),
        ...subscriptionStreamCallbacks(requestId, send),
      })
      // sheets tsconfig sets exactOptionalPropertyTypes: an explicit
      // `stopReason: undefined` is not assignable to AiStreamChunk, so only
      // include the property when a reason was actually reported.
      send(
        stopReason === undefined
          ? { requestId, type: 'done' }
          : { requestId, type: 'done', stopReason },
      )
    } catch (err) {
      if (controller.signal.aborted) {
        send({ requestId, type: 'done' })
      } else {
        send(aiStreamErrorChunk(requestId, err))
      }
    } finally {
      unwatchSender()
      entry.aiStreams.delete(requestId)
    }
  })

  ipcMain.handle(IPC_CHANNELS.aiStreamCancel, (event, requestId: unknown) => {
    const entry = sessionFor(event)
    entry.aiStreams.get(z.string().min(1).parse(requestId))?.abort()
    // Stop while a tool runs names a turn that already ended: end the tab's media calls too
    abortMediaCalls(event.sender.id)
  })

  // Shared search tools (content + images): Serper with DuckDuckGo fallback
  // (same source as slides/docs)
  ipcMain.handle('ai:web-search', async (_event, query: unknown, maxResults?: unknown) => {
    try {
      return await webSearchTool(
        SETTINGS_PATH(),
        z.string().parse(query),
        typeof maxResults === 'number' ? maxResults : 6,
      )
    } catch (err) {
      return { results: [], method: 'error', error: String(err) }
    }
  })
  ipcMain.handle('ai:image-search', async (_event, query: unknown, maxResults?: unknown) => {
    try {
      return await imageSearchTool(
        SETTINGS_PATH(),
        z.string().parse(query),
        typeof maxResults === 'number' ? maxResults : 8,
      )
    } catch (err) {
      return { images: [], method: 'error', error: String(err) }
    }
  })
  // Read one web page as text (the read_url tool), paged by character offset.
  // A long download ends with the tab or when the tab's AI run is stopped.
  ipcMain.handle('ai:read-url', async (event, url: unknown, offset?: unknown) => {
    try {
      return await withMediaCallSignal(event.sender, (signal) =>
        readUrlTool(
          SETTINGS_PATH(),
          z.string().parse(url),
          typeof offset === 'number' ? offset : 0,
          { signal },
        ),
      )
    } catch {
      return { ok: false, error: 'The read failed.', errorCode: 'network' }
    }
  })

  // Standalone parity with docs-main's shell-wide handler: AI-supplied URLs are
  // prompt-injectable, so fetchRemoteImage refuses non-http schemes and
  // private/link-local targets and validates every redirect hop. Size-capped to
  // match the local add_image limit.
  ipcMain.handle(
    'ai:fetch-image',
    async (_event, url: unknown): Promise<{ base64: string; mime: string } | null> => {
      try {
        const resp = await fetchRemoteImage(z.string().parse(url))
        if (!resp || !resp.ok || !resp.body) return null
        const declared = Number(resp.headers.get('content-length') ?? 0)
        if (declared > MAX_REMOTE_IMAGE_BYTES) return null
        // Stream with a running cap: a missing/understated Content-Length must
        // not let a prompt-injected URL buffer unbounded bytes before a
        // post-hoc size check
        const reader = resp.body.getReader()
        const chunks: Buffer[] = []
        let received = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          received += value.byteLength
          if (received > MAX_REMOTE_IMAGE_BYTES) {
            await reader.cancel()
            return null
          }
          chunks.push(Buffer.from(value))
        }
        const buf = Buffer.concat(chunks)
        const ct = resp.headers.get('content-type') ?? ''
        const mime = ct.includes('png')
          ? 'image/png'
          : ct.includes('gif')
            ? 'image/gif'
            : 'image/jpeg'
        return { base64: buf.toString('base64'), mime }
      } catch {
        return null
      }
    },
  )
}

// ── project-store IPC (standalone mode) ────────────────────────────────────
// In shell mode docs-main.registerProjectIpc has already registered it
// (idempotency guard).

let sheetsProjectStore: ProjectStore | null = null
let sheetsProjectIpcRegistered = false

function getSheetsProjectStore(): ProjectStore {
  if (!sheetsProjectStore) sheetsProjectStore = new ProjectStore(app.getPath('userData'))
  return sheetsProjectStore
}

export function registerProjectIpc(): void {
  if (sheetsProjectIpcRegistered) return
  sheetsProjectIpcRegistered = true

  ipcMain.handle(
    'project:resolveChat',
    (event, args: { filePath: string | null; tempChatId?: string; sessionId?: string }) => {
      const store = getSheetsProjectStore()
      store.ensureDefaultProject()

      // sheets mode: reverse-look up the file path via sessionId
      let resolvedPath = args.filePath
      if (!resolvedPath && args.sessionId) {
        const tabEntry = sheetsTabs.get(event.sender.id)
        if (tabEntry) {
          resolvedPath = tabEntry.sessions.get(args.sessionId)?.path ?? null
        }
      }

      if (!resolvedPath) {
        return { projectId: 'default', chatId: args.tempChatId ?? `unsaved-${Date.now()}` }
      }
      return store.resolveChatForFile(resolvedPath)
    },
  )

  ipcMain.handle(
    'project:appendChat',
    (
      _event,
      args: {
        projectId: string
        chatId: string
        role: 'user' | 'assistant'
        text: string
        tools?: Array<{
          name: string
          summary: string
          isError?: boolean
          input?: string
          output?: string
        }>
        attachments?: Array<{ name: string; path?: string; ext?: string; sizeBytes?: number }>
        scope?: { label: string; text?: string }
        /** skill chips of a user message; the store bounds and filters them */
        skills?: unknown
      },
    ) => {
      if (args.role !== 'user' && args.role !== 'assistant') {
        throw new Error(`Invalid chat role: ${String(args.role)}`)
      }
      if (typeof args.text !== 'string' || args.text.length > 200_000) {
        throw new Error('Invalid chat text: must be a string up to 200000 chars')
      }
      if (args.tools && !Array.isArray(args.tools)) throw new Error('Invalid chat tools')
      if (args.attachments && !Array.isArray(args.attachments)) {
        throw new Error('Invalid chat attachments')
      }
      const msg: Parameters<ProjectStore['appendChatMessage']>[2] = {
        role: args.role,
        text: args.text,
      }
      if (args.tools) msg.tools = args.tools
      if (args.attachments) msg.attachments = args.attachments
      if (args.scope) msg.scope = args.scope
      if (Array.isArray(args.skills)) msg.skills = args.skills as NonNullable<typeof msg.skills>

      getSheetsProjectStore().appendChatMessage(args.projectId, args.chatId, msg)
    },
  )

  ipcMain.handle(
    'project:loadChat',
    (_event, args: { projectId: string; chatId: string; limit?: number }) => {
      return getSheetsProjectStore().loadChat(args.projectId, args.chatId, args.limit ?? 200)
    },
  )

  ipcMain.handle(
    'project:rebindChat',
    (
      event,
      args: {
        projectId: string
        tempChatId: string
        newChatId?: string
        newFilePath?: string
        sessionId?: string
      },
    ) => {
      const store = getSheetsProjectStore()
      let path = args.newFilePath ?? null
      if (!path && args.sessionId) {
        path = resolveSheetsSessionPath(event.sender.id, args.sessionId)
      }
      if (path) {
        return store.rebindChatToFile(args.projectId, args.tempChatId, path)
      }
      if (args.newChatId) store.rebindChat(args.projectId, args.tempChatId, args.newChatId)
      return { projectId: args.projectId, chatId: args.newChatId ?? args.tempChatId }
    },
  )
}

/**
 * sessionId → workbook file path reverse lookup (injected into docs-main's
 * project:resolveChat in shell mode). In standalone mode the handler registered
 * above queries sheetsTabs directly.
 */
export function resolveSheetsSessionPath(senderId: number, sessionId: string): string | null {
  return sheetsTabs.get(senderId)?.sessions.get(sessionId)?.path ?? null
}

/**
 * Resolve a save request's sheet ops / name mappings and write the workbook through
 * the sidecar. Split out of the save handler so a crash-recovery copy can reuse the
 * exact same pipeline with a different targetPath.
 */
async function writeWorkbookTo(
  client: XlsxSidecarClient,
  session: SessionInfo,
  request: WorkbookSaveRequest,
  targetPath: string,
): Promise<Awaited<ReturnType<typeof saveWorkbookViaSidecar>>> {
  // Sheet ops resolve first: added sheets have Univer ids the session map
  // doesn't know, so cell edits into them resolve through the op's name.
  const addedSheetNames = new Map<string, string>()
  // Added sheet id → file name of the sheet whose part seeds the new part.
  const duplicateSources = new Map<string, string>()
  const renames: { sheetName: string; newName: string }[] = []
  const removals: string[] = []
  const hiddenChanges: { sheetName: string; hidden: boolean }[] = []
  const tabColorStates: { sheetName: string; color: string | null }[] = []
  let orderChanged = false
  for (const op of request.sheetOps) {
    if (op.kind === 'add-sheet') {
      addedSheetNames.set(op.sheetId, op.name)
      continue
    }
    if (op.kind === 'duplicate-sheet') {
      // The renderer resolves duplicate chains to a sheet the file knows,
      // so the source must be in the session map.
      const sourceName = session.sheetNames.get(op.sourceSheetId)
      if (!sourceName) throw new Error(`Unknown duplicate source ${op.sourceSheetId}.`)
      addedSheetNames.set(op.sheetId, op.name)
      duplicateSources.set(op.sheetId, sourceName)
      continue
    }
    if (op.kind === 'reorder-sheets') {
      orderChanged = true
      continue
    }
    const sheetName = addedSheetNames.get(op.sheetId) ?? session.sheetNames.get(op.sheetId)
    if (!sheetName) throw new Error(`Unknown worksheet ${op.sheetId}.`)
    if (op.kind === 'rename-sheet') renames.push({ sheetName, newName: op.newName })
    else if (op.kind === 'set-sheet-hidden') {
      hiddenChanges.push({ sheetName, hidden: op.hidden })
    } else if (op.kind === 'set-sheet-tab-color') {
      tabColorStates.push({ sheetName, color: op.color })
    } else removals.push(sheetName)
  }
  const renameByOriginal = new Map(renames.map((rename) => [rename.sheetName, rename.newName]))
  const resolveSheetName = (sheetId: string): string => {
    const sheetName = addedSheetNames.get(sheetId) ?? session.sheetNames.get(sheetId)
    if (!sheetName) throw new Error(`Unknown worksheet ${sheetId}.`)
    return sheetName
  }
  let sheetPlan: SheetEditPlan | undefined
  if (request.sheetOps.some((op) => op.kind !== 'set-sheet-tab-color')) {
    sheetPlan = {
      renames,
      additions: [...addedSheetNames].map(([sheetId, name]) => ({
        name,
        sourceSheetName: duplicateSources.get(sheetId),
      })),
      removals,
      hiddenChanges,
      orderChanged,
      order: request.sheetOrder.map((sheetId) => {
        const original = resolveSheetName(sheetId)
        return addedSheetNames.has(sheetId)
          ? original
          : (renameByOriginal.get(original) ?? original)
      }),
    }
  }

  const edits: CellEdit[] = request.edits.map((edit) => ({
    sheetName: resolveSheetName(edit.sheetId),
    row: edit.row,
    column: edit.column,
    writeValue: edit.writeValue,
    cell: { value: edit.value, formula: edit.formula },
    style: edit.style,
    rich: edit.rich,
    styleReset: edit.styleReset,
  }))
  const bulkConstantFills = (request.bulkConstantFills ?? []).map(({ sheetId, ...fill }) => ({
    sheetName: resolveSheetName(sheetId),
    ...fill,
  }))
  const opsBySheet = new Map<string, SheetStructuralOps['ops'][number][]>()
  for (const op of request.structuralOps) {
    const sheetName = resolveSheetName(op.sheetId)
    const sheetOps = opsBySheet.get(sheetName) ?? []
    if ('range' in op) {
      sheetOps.push({ kind: op.kind, range: op.range })
    } else if ('size' in op) {
      sheetOps.push({ kind: op.kind, start: op.start, end: op.end, size: op.size })
    } else if ('level' in op) {
      sheetOps.push({
        kind: op.kind,
        start: op.start,
        end: op.end,
        level: op.level,
        ...(op.collapsed === undefined ? {} : { collapsed: op.collapsed }),
      })
    } else if ('summaryBelow' in op) {
      sheetOps.push({
        kind: op.kind,
        summaryBelow: op.summaryBelow,
        summaryRight: op.summaryRight,
      })
    } else if ('hidden' in op) {
      sheetOps.push({ kind: op.kind, start: op.start, end: op.end, hidden: op.hidden })
    } else if ('style' in op) {
      sheetOps.push({ kind: op.kind, start: op.start, end: op.end, style: op.style })
    } else if ('before' in op) {
      sheetOps.push({ kind: op.kind, index: op.index, count: op.count, before: op.before })
    } else {
      sheetOps.push({ kind: op.kind, index: op.index, count: op.count })
    }
    opsBySheet.set(sheetName, sheetOps)
  }
  const structuralOps: SheetStructuralOps[] = [...opsBySheet].map(([sheetName, ops]) => ({
    sheetName,
    ops,
  }))
  const filterStates = request.filterStates.map((state) => ({
    sheetName: resolveSheetName(state.sheetId),
    filter: state.filter,
    hiddenRows: state.hiddenRows,
    visibilityRange: state.visibilityRange,
  }))
  const linksBySheet = new Map<string, { row: number; column: number; target: string | null }[]>()
  for (const link of request.hyperlinkEdits) {
    const sheetName = resolveSheetName(link.sheetId)
    const sheetLinks = linksBySheet.get(sheetName) ?? []
    sheetLinks.push({ row: link.row, column: link.column, target: link.target })
    linksBySheet.set(sheetName, sheetLinks)
  }
  const hyperlinkEdits = [...linksBySheet].map(([sheetName, links]) => ({
    sheetName,
    edits: links,
  }))
  const cfStates = request.cfStates.map((state) => ({
    sheetName: resolveSheetName(state.sheetId),
    rules: state.rules,
  }))
  const dvStates = request.dvStates.map((state) => ({
    sheetName: resolveSheetName(state.sheetId),
    rules: state.rules,
  }))
  const sheetProtections = request.sheetProtections.map(({ sheetId, ...state }) => ({
    sheetName: resolveSheetName(sheetId),
    ...state,
  }))
  const protectedRangeStates = request.protectedRangeStates.map((state) => ({
    sheetName: resolveSheetName(state.sheetId),
    ranges: state.ranges,
  }))
  const pageSetupStates = request.pageSetupStates.map(({ sheetId, ...state }) => ({
    sheetName: resolveSheetName(sheetId),
    ...state,
  }))
  const noteStates = request.noteStates.map(({ sheetId, notes }) => ({
    sheetName: resolveSheetName(sheetId),
    notes,
  }))
  const visualAdditions = request.visualAdditions.map((addition) => ({
    sheetName: resolveSheetName(addition.sheetId),
    anchor: addition.anchor,
    chart: addition.chart,
    shape: addition.shape,
    image: addition.image,
  }))
  const tableAdditions = request.tableAdditions.map((table) => ({
    sheetName: resolveSheetName(table.sheetId),
    area: table.area,
    name: table.name,
    columnNames: table.columnNames,
    style: table.style,
    bandedRows: table.bandedRows,
    options: {
      headerRow: table.headerRow,
      totalsRow: table.totalsRow,
      firstColumn: table.firstColumn,
      lastColumn: table.lastColumn,
      bandedColumns: table.bandedColumns,
      filterButton: table.filterButton,
    },
  }))
  const tableEdits = (request.tableEdits ?? []).map(({ sheetId, ...edit }) => ({
    ...edit,
    sheetName: resolveSheetName(sheetId),
  }))
  const pivotAdditions = request.pivotAdditions.map((pivot) => ({
    sheetName: resolveSheetName(pivot.sheetId),
    sourceSheetName: resolveSheetName(pivot.sourceSheetId),
    sourceArea: pivot.sourceArea,
    location: pivot.location,
    name: pivot.name,
    fieldNames: pivot.fieldNames,
    rowFieldIndices: pivot.rowFieldIndices,
    columnFieldIndex: pivot.columnFieldIndex,
    pageFieldIndices: pivot.pageFieldIndices,
    pageLevelItems: pivot.pageLevelItems,
    pageItems: pivot.pageItems,
    rowItems: pivot.rowItems,
    rowLevelItems: pivot.rowLevelItems,
    rowLines: pivot.rowLines,
    columnItems: pivot.columnItems,
    columnFieldIndices: pivot.columnFieldIndices,
    colLevelItems: pivot.colLevelItems,
    colLines: pivot.colLines,
    groupings: pivot.groupings,
    filters: pivot.filters,
    rowHiddenItems: pivot.rowHiddenItems,
    colHiddenItems: pivot.colHiddenItems,
    values: pivot.values,
  }))
  const sparklineAdditions = request.sparklineAdditions.map(({ sheetId, ...group }) => ({
    sheetName: resolveSheetName(sheetId),
    ...group,
  }))
  // Recalculated formula values: sheetId → file sheet name, the same
  // resolution the cell edits use.
  const formulaValuesBySheet = new Map<
    string,
    { row: number; column: number; value: string | number | boolean | null | { error: string } }[]
  >()
  for (const cell of request.formulaValues) {
    const sheetName = resolveSheetName(cell.sheetId)
    const list = formulaValuesBySheet.get(sheetName) ?? []
    list.push({ row: cell.row, column: cell.column, value: cell.value })
    formulaValuesBySheet.set(sheetName, list)
  }
  const formulaValues = [...formulaValuesBySheet].map(([sheetName, cells]) => ({
    sheetName,
    cells,
  }))
  const mutation = await saveWorkbookViaSidecar({
    client,
    // The snapshot, not the live path: the save base must be the bytes this
    // session's pending edits were made against, regardless of what other
    // programs did to the file since.
    sourcePath: session.snapshotPath,
    targetPath,
    edits,
    bulkConstantFills,
    structuralOps,
    chartEdits: request.chartEdits,
    // Located by package-absolute drawingPath, so no sheet-name mapping.
    visualEdits: request.visualEdits,
    sheetPlan,
    filterStates,
    hyperlinkEdits,
    cfStates,
    dvStates,
    sheetProtections,
    tabColorStates,
    definedNamesState: request.definedNamesState,
    themeState: request.themeState,
    workbookProtectionState: request.workbookProtectionState,
    protectedRangeStates,
    visualAdditions,
    pageSetupStates,
    noteStates,
    tableAdditions,
    tableEdits,
    pivotAdditions,
    sparklineAdditions,
    formulaValues,
    pivotCacheRefreshPaths: request.pivotCacheRefreshPaths,
    // Output-area expansion from layout growth: sheetId → sheet name; the part
    // path is resolved by the gateway.
    pivotRefreshUpdates: request.pivotRefreshUpdates.map((update) => ({
      cachePath: update.cachePath,
      sheetName: resolveSheetName(update.sheetId),
      newOutputRef: update.newOutputRef,
      ...(update.relayout === undefined
        ? {}
        : {
            relayout: (({ sheetId: _sheetId, sourceSheetId, ...rest }) => ({
              ...rest,
              sourceSheetName: resolveSheetName(sourceSheetId),
            }))(update.relayout),
          }),
    })),
  })
  return mutation
}

/** Copies the workbook into the temp snapshot dir; the copy is the session's
 * save base (see SessionInfo.snapshotPath). */
async function snapshotWorkbook(path: string): Promise<string> {
  const snapshotPath = await reserveSnapshotPath()
  await copyFile(path, snapshotPath)
  return snapshotPath
}

/** a fresh snapshot path in the session temp dir; nothing is written there yet */
async function reserveSnapshotPath(): Promise<string> {
  const dir = join(app.getPath('temp'), 'genoffice-sheets-sessions')
  await mkdir(dir, { recursive: true })
  return join(dir, `${randomUUID()}.xlsx`)
}

/** Copies a verified staged save to its target: beside the target first, then
 * promoted over it, so a failed copy never leaves the target half-written. */
async function placeStagedSave(stagedPath: string, targetPath: string): Promise<void> {
  const besideTarget = join(dirname(targetPath), `.${randomUUID()}.tmp.xlsx`)
  try {
    await copyFile(stagedPath, besideTarget)
    await promoteFileAtomically(besideTarget, targetPath)
  } catch (error) {
    await rm(besideTarget, { force: true }).catch(() => undefined)
    throw error
  }
}

let cachedShortDate: string | undefined

/// Derived from the OS region (not the UI language) and shared with the
/// gateway's save-side numFmtId mapping via setSystemShortDate.
function systemShortDate(): string {
  if (cachedShortDate === undefined) {
    cachedShortDate = shortDatePatternForSystemLocale(app.getSystemLocale())
    setSystemShortDate(cachedShortDate)
  }
  return cachedShortDate
}

/** the tab died between prepare and open: release the temp copy and any name reserved for it */
async function discardPreparedOpen(prepared: {
  openPath: string
  importTempDir?: string | undefined
}): Promise<void> {
  unsavedNewWorkbooks.delete(prepared.openPath)
  if (prepared.importTempDir !== undefined)
    await cleanupImportTempDirectory(app.getPath('temp'), prepared.importTempDir)
}

async function openWorkbookSession(
  client: XlsxSidecarClient,
  path: string,
  sessions: Map<string, SessionInfo>,
  options?: {
    suggestSaveAs?: string | undefined
    csvImport?: boolean | undefined
    csvSourcePath?: string | undefined
    emptyCsv?: boolean | undefined
    importTempDir?: string | undefined
    restoreTarget?: string | undefined
    emptySource?: boolean | undefined
    unsavedNew?: boolean | undefined
    password?: string | undefined
    recoveryIdentity?: RecoveryIdentity | undefined
    recoveryOriginalPath?: string | undefined
    unsavedRestore?: boolean | undefined
    /// A save's output already opened by the sidecar: it is this session's
    /// snapshot as it stands, so neither the copy nor the open is repeated.
    staged?: { snapshotPath: string; opened: SidecarOpenResult } | undefined
  },
): Promise<WorkbookFile> {
  const {
    suggestSaveAs,
    csvImport,
    csvSourcePath,
    emptyCsv,
    importTempDir,
    restoreTarget,
    emptySource,
    unsavedNew,
    password,
    recoveryIdentity,
    recoveryOriginalPath,
    unsavedRestore,
    staged,
  } = options ?? {}
  // Snapshot first, then the sidecar opens the snapshot (not the live path):
  // everything the session serves — cell reads, media, recalc, saves — comes
  // from the same bytes, even if the file on disk changes right after the
  // copy. The digest also describes exactly those bytes.
  const snapshotPath = staged?.snapshotPath ?? (await snapshotWorkbook(path))
  // The document path this copy is judged by (split-view save guard): the file
  // the user sees, not the converted temp copy (CSV) or recovery copy (restore).
  const diskStatePath = restoreTarget ?? csvSourcePath ?? path
  try {
    const [opened, digest, snapshotStat, restoreTargetSha, csvSourceSha, diskState] =
      await Promise.all([
        staged?.opened ??
          client
            .open(snapshotPath, getUiLang(), systemShortDate())
            .then((result) => sidecarOpenResultSchema.parse(result)),
        sha256File(snapshotPath),
        stat(snapshotPath),
        // Missing original (deleted since the crash) is fine: the write-back recreates it.
        restoreTarget === undefined
          ? Promise.resolve(undefined)
          : sha256File(restoreTarget).catch(() => undefined),
        csvSourcePath === undefined
          ? Promise.resolve(undefined)
          : sha256File(csvSourcePath).catch(() => undefined),
        recordDiskState(diskStatePath),
      ])
    // an encrypted workbook writes no recovery copy: it would be plaintext
    const automaticRecoveryDisabled =
      password !== undefined || !allowsAutomaticWorkbookRecovery(opened.sheets)
    sessions.set(opened.sessionId, {
      path,
      snapshotPath,
      sha256: digest,
      sheetNames: new Map(opened.sheets.map((sheet) => [sheet.id, sheet.name])),
      automaticRecoveryDisabled,
      ...(suggestSaveAs === undefined ? {} : { suggestSaveAs }),
      ...(csvImport ? { csvImport } : {}),
      ...(csvSourcePath === undefined ? {} : { csvSourcePath }),
      ...(csvSourceSha === undefined ? {} : { csvSourceSha }),
      ...(importTempDir === undefined ? {} : { importTempDir }),
      ...(restoreTarget === undefined ? {} : { restoreTarget }),
      ...(restoreTargetSha === undefined ? {} : { restoreTargetSha }),
      ...(emptySource ? { emptySource } : {}),
      ...(unsavedNew ? { unsavedNew } : {}),
      ...(password === undefined ? {} : { password }),
      ...(recoveryIdentity === undefined ? {} : { recoveryIdentity }),
      ...(recoveryOriginalPath === undefined ? {} : { recoveryOriginalPath }),
      ...(unsavedRestore ? { unsavedRestore } : {}),
      ...(diskState === null ? {} : { diskState: { path: diskStatePath, state: diskState } }),
    })
    unsavedNewWorkbooks.delete(path)
    return workbookFileSchema.parse({
      ...opened,
      // The renderer-facing path is what the user opened: for a restored
      // recovery copy that is the original file, not the copy under userData.
      path: restoreTarget ?? path,
      sha256: digest,
      fileBytes: snapshotStat.size,
      readOnly: false,
      needsSaveAs: suggestSaveAs !== undefined,
      ...(unsavedNew ? { unsavedNew: true } : {}),
      ...(csvSourcePath === undefined ? {} : { csvPath: csvSourcePath }),
      ...(emptyCsv ? { emptyCsv: true } : {}),
      // an encrypted workbook's restoreTarget is the file itself, not a restore
      restoredFromRecovery: restoreTarget !== undefined && password === undefined,
      automaticRecoveryDisabled,
    })
  } catch (error) {
    if (staged !== undefined) await client.close(staged.opened.sessionId).catch(() => undefined)
    await rm(snapshotPath, { force: true }).catch(() => undefined)
    unsavedNewWorkbooks.delete(path)
    if (importTempDir !== undefined) {
      await cleanupImportTempDirectory(app.getPath('temp'), importTempDir)
    }
    throw error
  }
}

/// A 0-byte .xlsx is an empty workbook, not a corrupt one. The sidecar needs a
/// real archive, so a blank one opens from the temp dir with the original as
/// the write-back target (the restore path: Save writes it even with no edits).
async function openEmptyXlsx(path: string): Promise<{
  openPath: string
  importTempDir: string
  restoreTarget: string
  emptySource: true
}> {
  const directory = join(app.getPath('temp'), 'genoffice-imports', randomUUID())
  await mkdir(directory, { recursive: true })
  const openPath = join(directory, basename(path))
  try {
    await writeFile(openPath, (await csvToXlsxBufferForOpen('', 'Sheet1')).buffer)
  } catch (error) {
    await cleanupImportTempDirectory(app.getPath('temp'), directory)
    throw error
  }
  return { openPath, importTempDir: directory, restoreTarget: path, emptySource: true }
}

/** which legacy charset an Excel CSV most likely uses, judged by the UI language */
function legacyCsvCharset(): string | undefined {
  const byLang: Partial<Record<Lang, string>> = {
    zh: 'gb18030',
    'zh-TW': 'big5',
    ja: 'shift_jis',
    ko: 'euc-kr',
  }
  return byLang[getUiLang()]
}

/** a CFB container: an encrypted .xlsx/.xlsm, or any .xls */
async function hasCfbHeader(path: string): Promise<boolean> {
  const handle = await open(path, 'r')
  try {
    const head = Buffer.alloc(8)
    const { bytesRead } = await handle.read(head, 0, 8, 0)
    return isCfbHeader(head.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

async function showEncryptedOpenFailure(parent: BrowserWindow | undefined): Promise<void> {
  const options = {
    type: 'warning' as const,
    message: tm('errEncryptedOpenTitle'),
    detail: tm('errEncryptedUnsupported'),
  }
  if (parent && !parent.isDestroyed()) await dialog.showMessageBox(parent, options)
  else await dialog.showMessageBox(options)
}

/// A password-protected workbook asks for its password and opens as a
/// decrypted copy in the temp dir. An .xlsx/.xlsm keeps the user's file as
/// restoreTarget, so Save writes back to it (re-encrypted); an encrypted .xls
/// converts like any .xls and its first save is a Save As. Resolves undefined
/// for a file that is not encrypted, and null when the user cancelled the
/// prompt or the file cannot be decrypted (the user has been told why).
async function prepareEncryptedWorkbook(
  client: XlsxSidecarClient,
  path: string,
  extension: string,
  parent: BrowserWindow | undefined,
): Promise<PreparedWorkbookOpen | null | undefined> {
  if (extension !== 'xlsx' && extension !== 'xlsm' && extension !== 'xls') return undefined
  if (!(await hasCfbHeader(path))) return undefined
  const bytes = await readFile(path)
  if (!isEncryptedOfficeFile(bytes)) return undefined
  // a headless export has no one to ask: only a file Excel opens unasked gets through
  const headless = isHeadlessMode()
  const prompt = headless ? undefined : passwordPromptFactory?.(parent, basename(path))
  let unlocked: Awaited<ReturnType<typeof unlockOfficeFile>> | 'failed'
  try {
    unlocked = await unlockOfficeFile(
      bytes,
      prompt?.ask ??
        (headless
          ? () => Promise.resolve(null)
          : () =>
              Promise.reject(
                new OfficeDecryptError('unsupported', 'no password prompt available'),
              )),
    )
  } catch (error) {
    if (!(error instanceof OfficeDecryptError)) throw error
    unlocked = 'failed'
  } finally {
    prompt?.close()
  }
  if (unlocked === 'failed') {
    if (!headless) await showEncryptedOpenFailure(parent)
    return null
  }
  if (unlocked === null) return null
  const directory = join(app.getPath('temp'), 'genoffice-imports', randomUUID())
  await mkdir(directory, { recursive: true })
  try {
    if (extension !== 'xls') {
      const openPath = join(directory, basename(path))
      await writeFile(openPath, unlocked.bytes)
      return {
        openPath,
        importTempDir: directory,
        restoreTarget: path,
        password: unlocked.password,
      }
    }
    const stem = basename(path).replace(/\.[^.]+$/, '')
    const plainXls = join(directory, `${stem}.xls`)
    const openPath = join(directory, `${stem}.xlsx`)
    await writeFile(plainXls, unlocked.bytes)
    await client.convertWorkbook({ path: plainXls, targetPath: openPath })
    await rm(plainXls, { force: true })
    return {
      openPath,
      importTempDir: directory,
      suggestSaveAs: path.replace(/\.[^.]+$/, '.xlsx'),
      // Excel's built-in password guarded only editing: the new .xlsx gets no open password
      ...(unlocked.asked ? { password: unlocked.password } : {}),
    }
  } catch (error) {
    await cleanupImportTempDirectory(app.getPath('temp'), directory)
    throw error
  }
}

interface PreparedWorkbookOpen {
  openPath: string
  suggestSaveAs?: string
  csvImport?: boolean
  csvSourcePath?: string
  emptyCsv?: boolean
  importTempDir?: string
  restoreTarget?: string
  emptySource?: boolean
  unsavedNew?: boolean
  password?: string
  recoveryIdentity?: RecoveryIdentity
  recoveryOriginalPath?: string
  unsavedRestore?: boolean
}

/// .xls and .tsv open as a converted copy in the temp dir; the session
/// remembers the original's .xlsx sibling as the Save As default. .csv converts
/// the same way but keeps its file identity, so Save writes values back to it.
/// Resolves null when an encrypted file's open was cancelled or refused.
async function prepareWorkbookForOpen(
  client: XlsxSidecarClient,
  path: string,
  contents?: WebContents | undefined,
  parent?: BrowserWindow | undefined,
  options?: { skipRecoveryPrompt?: boolean },
): Promise<PreparedWorkbookOpen | null> {
  // A shell-created "New spreadsheet" opens from a temp directory and has no
  // user-visible file yet: Save As produces it, and closing unsaved discards
  // the directory. The mark is consumed once the session exists (see
  // openWorkbookSession) so the name stays reserved through the open and a
  // reopened path is a normal file.
  const unsavedNew = unsavedNewWorkbooks.get(path)
  if (unsavedNew !== undefined) {
    const base = {
      suggestSaveAs: unsavedNew.suggestSaveAs,
      importTempDir: unsavedNew.tempDir,
      unsavedNew: true,
      recoveryIdentity: unsavedNew.recovery,
      ...(unsavedNew.restored ? { unsavedRestore: true } : {}),
      ...(unsavedNew.originalPath === undefined
        ? {}
        : { recoveryOriginalPath: unsavedNew.originalPath }),
    }
    // An untitled copy of a .csv/.tsv/.xls (a skill template's, spec 5.7) is
    // converted beside itself in its own temp folder: the session edits the
    // .xlsx, the first save asks where, closing discards the folder.
    const copyExtension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
    if (copyExtension === 'csv' || copyExtension === 'tsv' || copyExtension === 'xls') {
      const openPath = join(
        unsavedNew.tempDir,
        `${basename(path).replace(/\.[^.]+$/, '')}-${randomUUID().slice(0, 8)}.xlsx`,
      )
      if (copyExtension === 'xls') {
        await client.convertWorkbook({ path, targetPath: openPath })
      } else {
        if ((await stat(path)).size > MAX_DELIMITED_IMPORT_BYTES) {
          throw new Error(tm('errFileTooLarge'))
        }
        const converted = await csvToXlsxBufferForOpen(
          decodeCsvBuffer(await readFile(path), legacyCsvCharset()),
          'Sheet1',
          copyExtension === 'tsv' ? '\t' : undefined,
        )
        await writeFile(openPath, converted.buffer)
      }
      // the mark follows the file the session edits
      unsavedNewWorkbooks.delete(path)
      unsavedNewWorkbooks.set(openPath, unsavedNew)
      return { openPath, ...base }
    }
    // a copy reopened as untitled (openSheetsUntitledCopy): its content is the
    // backing file already, and it is loaded now
    if (unsavedNew.restored) recoveryStore.markCopyLoaded(unsavedNew.recovery)
    return { openPath: path, ...base }
  }
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  // An encrypted file never has a recovery copy: it is not written for one.
  const encrypted = await prepareEncryptedWorkbook(client, path, extension, parent)
  if (encrypted !== undefined) return encrypted
  if (extension !== 'csv' && extension !== 'tsv' && extension !== 'xls') {
    // Unsaved work from a lost session is settled before the file's content
    // loads (recoveredOpenFor). Restoring opens the copy with restoreTarget
    // pointing back at the original, so a plain Save writes straight back
    // over the file the user opened — choosing to restore was the
    // confirmation. Merge sources are read-only picks: never surface (or
    // worse, discard) another workbook's crash recovery from here.
    if (!options?.skipRecoveryPrompt) {
      const recovered = await recoveredOpenFor(path, contents, parent)
      if (recovered !== null) return recovered
    }
    if (extension === 'xlsx' && (await stat(path)).size === 0) return openEmptyXlsx(path)
    return { openPath: path }
  }
  const stem = basename(path).replace(/\.[^.]+$/, '')
  const directory = join(app.getPath('temp'), 'genoffice-imports', randomUUID())
  await mkdir(directory, { recursive: true })
  const openPath = join(directory, `${stem}.xlsx`)
  let emptyCsv = false
  try {
    if (extension === 'csv' || extension === 'tsv') {
      const csvStat = await stat(path)
      if (csvStat.size > MAX_DELIMITED_IMPORT_BYTES) throw new Error(tm('errFileTooLarge'))
      const converted = await csvToXlsxBufferForOpen(
        decodeCsvBuffer(await readFile(path), legacyCsvCharset()),
        'Sheet1',
        // A .tsv's delimiter is declared by its extension, and sniffing by
        // frequency can get it wrong: annotation-heavy exports (gene
        // descriptions, database cross-references) hold comma-separated
        // lists, so a narrow table ends up with more commas than tabs and
        // every row shatters on the comma. A .csv keeps the sniff — the prose
        // guard in resolveImportDelimiter is what that path needs.
        extension === 'tsv' ? '\t' : undefined,
      )
      emptyCsv = converted.empty
      await writeFile(openPath, converted.buffer)
    } else {
      await client.convertWorkbook({ path, targetPath: openPath })
    }
  } catch (error) {
    await cleanupImportTempDirectory(app.getPath('temp'), directory)
    throw error
  }
  // CSV keeps its file identity: Save writes the values back to the original
  // .csv (Excel's behavior), so no Save As detour is suggested. Legacy .xls and
  // view-only .tsv route the first save through Save As to a fresh .xlsx —
  // writing values back to a .tsv would need a tab serializer this path lacks.
  return extension === 'csv'
    ? {
        openPath,
        importTempDir: directory,
        csvImport: true,
        csvSourcePath: path,
        ...(emptyCsv ? { emptyCsv: true } : {}),
      }
    : { openPath, importTempDir: directory, suggestSaveAs: path.replace(/\.[^.]+$/, '.xlsx') }
}

/** shell-injected items appended to the File menu (e.g. Back to Home) */
let extraFileMenuItems: MenuItemConstructorOptions[] = []

export function setSheetsExtraFileMenuItems(items: MenuItemConstructorOptions[]): void {
  extraFileMenuItems = items
}

/** shell-built File-menu entries for the open document (make another document
 * from it, its sources, the documents made from it); asked at every build */
let documentLinkMenuItems: (() => MenuItemConstructorOptions[]) | null = null

export function setSheetsDocumentLinkMenuItems(
  items: (() => MenuItemConstructorOptions[]) | null,
): void {
  documentLinkMenuItems = items
}

/** tab mode: closes the sheets tab instead of the whole shell window (Cmd+W / role:'close') */
let closeActiveTabHook: (() => void) | null = null
export function setSheetsCloseTabHook(fn: (() => void) | null): void {
  closeActiveTabHook = fn
}

/// The ribbon has no File tab; file commands live in
/// the application menu and are forwarded to the renderer.
function installApplicationMenu(): void {
  const sendMenuAction = sendSheetsMenuAction
  const labels = appMenuLabels(getUiLang())
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
      {
        label: tm('menuFile'),
        submenu: [
          {
            label: tm('menuOpenWorkbook'),
            accelerator: 'CmdOrCtrl+O',
            click: () => sendMenuAction('open'),
          },
          ...(extraFileMenuItems.length > 0
            ? [{ type: 'separator' as const }, ...extraFileMenuItems]
            : []),
          ...(documentLinkMenuItems?.() ?? []),
          { type: 'separator' },
          {
            label: tm('menuSave'),
            accelerator: 'CmdOrCtrl+S',
            click: () => sendMenuAction('save'),
          },
          {
            label: tm('menuSaveAs'),
            accelerator: 'Shift+CmdOrCtrl+S',
            click: () => sendMenuAction('save-as'),
          },
          { type: 'separator' },
          {
            label: tm('menuPrint'),
            accelerator: 'CmdOrCtrl+P',
            click: () => sendMenuAction('print'),
          },
          { type: 'separator' },
          {
            label: tm('menuExportPdf'),
            click: () => sendMenuAction('export-pdf'),
          },
          {
            label: tm('menuExportCsv'),
            click: () => sendMenuAction('export-csv'),
          },
          { type: 'separator' },
          // tab mode: the item closes the focused tab or window, never the app,
          // so it is named and bound like every other editor's Close
          closeActiveTabHook
            ? {
                label: tm('menuClose'),
                accelerator: 'CmdOrCtrl+W',
                click: () => closeActiveTabHook?.(),
              }
            : process.platform === 'darwin'
              ? { role: 'close' as const, label: tm('menuClose') }
              : { role: 'quit' as const, label: tm('menuQuit') },
        ],
      },
      {
        label: tm('menuEdit'),
        submenu: [
          // role: 'editMenu' would bind ⌘Z to webContents.undo(), a text-editing
          // no-op that starves Univer of the shortcut — forward it instead.
          {
            label: tm('menuUndo'),
            accelerator: 'CmdOrCtrl+Z',
            click: () => sendMenuAction('undo'),
          },
          {
            label: tm('menuRedo'),
            accelerator: 'Shift+CmdOrCtrl+Z',
            click: () => sendMenuAction('redo'),
          },
          { type: 'separator' },
          { role: 'cut', label: labels.cut },
          { role: 'copy', label: labels.copy },
          { role: 'paste', label: labels.paste },
          { type: 'separator' },
          { role: 'selectAll', label: labels.selectAll },
        ],
      },
      // ⌘R is Fill Right and ⌘0/⌘+/⌘- hide columns / zoom the sheet; menu
      // accelerators would swallow them on macOS.
      viewMenuTemplate(labels, { devItems: !app.isPackaged, pageZoom: false }),
      windowMenuTemplate(process.platform, labels),
      helpMenuTemplate(labels),
    ]),
  )
}

/** stop the Rust sidecar (shell calls this from its own before-quit hook) */
export function stopSheetsSidecar(): void {
  sidecar?.stop()
  sidecar = null
}

export {
  installApplicationMenu as installSheetsMenu,
  startCaptureServer as startSheetsCaptureServer,
}

/**
 * Attaches a proxy to the main process's global fetch (same source as
 * slides-main.applyMainProcessProxy): main-process Node fetch (undici) ignores
 * the system proxy by default, so direct connections from mainland networks to
 * overseas LLM endpoints like api.anthropic.com time out or get rejected by
 * egress region (403 Request not allowed). Environment variables take priority;
 * otherwise the system proxy is read via session.resolveProxy() after app ready.
 */
async function applyMainProcessProxy(): Promise<void> {
  const setDispatcher = async (proxyUrl: string) => {
    try {
      const { ProxyAgent, setGlobalDispatcher } = await import('undici')
      setGlobalDispatcher(new ProxyAgent(proxyUrl))
      // strip user:pass credentials before logging
      console.log('[proxy] main-process fetch via', proxyUrl.replace(/\/\/[^@/]*@/, '//***@'))
    } catch (e) {
      console.warn('[proxy] failed to set ProxyAgent:', e)
    }
  }
  const envProxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy
  if (envProxy) {
    await setDispatcher(envProxy)
    return
  }
  try {
    await app.whenReady()
    // PAC/rule proxies answer per-host: probe an LLM endpoint the main-process fetch targets
    const resolved = await electronSession.defaultSession.resolveProxy('https://api.anthropic.com/')
    const m = /PROXY\s+([^;]+)/i.exec(resolved || '')
    if (m?.[1]) {
      await setDispatcher(`http://${m[1].trim()}`)
    } else {
      console.log('[proxy] system proxy = DIRECT, no dispatcher set')
    }
  } catch (e) {
    console.warn('[proxy] resolveProxy failed:', e)
  }
}

export function startSheetsStandalone(): void {
  registerRendererScheme()
  installNavigationGuard(app)
  installContextMenu(app, () => contextMenuLabels(getUiLang()))
  // GENOFFICE_USER_DATA: test drivers point this at a scratch dir so automated
  // instances get their own userData AND single-instance lock (the lock is scoped
  // to userData), allowing parallel instances alongside a normal dev run.
  // Same dev-only hook as apps/slides/src/main/slides-main.ts.
  if (!app.isPackaged && process.env.GENOFFICE_USER_DATA) {
    app.setPath('userData', process.env.GENOFFICE_USER_DATA)
  }
  void applyMainProcessProxy()
  app.whenReady().then(() => {
    installRendererProtocol({ sheets: join(__dirname, '../renderer') })
    // the shell's Word editor serves these URLs there; alone, sheets does
    installStandaloneTemplateFontProtocol()
    setUiLang(normalizeLang(process.env.GENOFFICE_LANG ?? app.getLocale()))
    app.setAccessibilitySupportEnabled(true)
    installApplicationMenu()
    startCaptureServer()
    return createSheetsWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', () => {
    stopSheetsSidecar()
  })
  // a subscription program started for an AI run must not outlive the app
  app.on('will-quit', shutdownSubscriptionChildren)
  process.on('exit', shutdownSubscriptionChildren)
  app.on('activate', () => {
    if (!mainWindow) void createSheetsWindow()
  })
}

function resolveSidecarPath(): string {
  const executable = process.platform === 'win32' ? 'xlsx-sidecar.exe' : 'xlsx-sidecar'
  if (runtime.sidecarPath) return runtime.sidecarPath
  if (process.env.XLSX_SIDECAR_PATH) return process.env.XLSX_SIDECAR_PATH
  if (app.isPackaged) return join(process.resourcesPath, 'native', executable)
  return join(app.getAppPath(), 'native', 'xlsx-engine', 'target', 'release', executable)
}

async function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', () => resolve(hash.digest('hex')))
  })
}

async function closeAllSessions(entry: {
  client: XlsxSidecarClient
  sessions: Map<string, SessionInfo>
}): Promise<void> {
  const sessions = [...entry.sessions.entries()]
  entry.sessions.clear()
  await Promise.allSettled(
    sessions.map(async ([sessionId, session]) => {
      await cleanupSessionResources({
        tempRoot: app.getPath('temp'),
        snapshotPath: session.snapshotPath,
        importTempDir: session.importTempDir,
        closeSidecar: () => entry.client.close(sessionId),
      })
    }),
  )
}
