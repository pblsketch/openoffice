import type { zh } from './zh'

export const zhTW = {
  driveNav: 'Google 雲端硬碟',
  driveDesc:
    '在 Google 雲端硬碟中選擇檔案，然後在 GenOffice 中開啟並編輯，儲存後會重新上傳到雲端硬碟。GenOffice 只能開啟你選擇的檔案。',
  driveConnect: '連結 Google 雲端硬碟',
  driveConnecting: '請在瀏覽器中登入 Google 帳戶並允許存取…',
  driveCancel: '取消',
  driveConnectedAs: '已連結：{email}',
  driveDisconnect: '中斷連結',
  driveDisconnectConfirm:
    '這會從這台電腦刪除雲端硬碟的登入資訊，並要求 Google 撤銷 GenOffice 的存取權。已下載到這台電腦的副本會保留。',
  driveDisconnectYes: '中斷連結',
  driveNotPersisted: '這台電腦無法加密保存登入資訊，因此關閉應用程式後連結會中斷。',
  driveExpired: 'Google 已結束連結：存取權已被撤銷或登入已過期。請重新連結。',
  driveAiAccess: '讓 AI 在雲端硬碟中尋找並閱讀檔案',
  driveAiAccessDesc:
    '開啟後，編輯器中的 AI 可以搜尋並讀取你在這裡選擇的雲端硬碟檔案。讀取的內容會傳送給你正在使用的 AI 提供者。AI 無法修改、刪除或共用雲端硬碟中的檔案。',
  drivePrivacy: '檔案清單和內容只在這台電腦和 Google 之間傳輸，不經過 GenOffice 開發者的伺服器。',
  driveFailDenied: 'Google 未允許，因此無法連結。',
  driveFailScope: '未勾選雲端硬碟存取權，因此無法連結。請重新連結並勾選雲端硬碟項目。',
  driveFailTimeout: '登入未在 10 分鐘內完成。請再試一次。',
  driveFailNetwork: '無法連線到 Google。請檢查網路連線後再試一次。',
  driveRecent: '已選擇的檔案',
  driveSearchPlaceholder: '在已選擇的檔案中搜尋',
  driveSearchResults: '「{q}」的搜尋結果',
  driveRefresh: '重新整理',
  driveNotConnectedTitle: '尚未連結 Google 雲端硬碟',
  driveNotConnectedBody:
    '連結後，可以選擇雲端硬碟中的檔案，在這裡開啟並編輯，儲存後會重新上傳到雲端硬碟。',
  driveOpenSettings: '在設定中連結',
  driveEmpty: '還沒有檔案。按一下「從 Google 雲端硬碟選擇」來選擇檔案。',
  driveLoading: '載入中…',
  driveLoadMore: '顯示更多',
  driveOpening: '開啟中…',
  driveGoogleBadge: 'Google 格式',
  driveGoogleNote:
    'Google 文件會以 Office 檔案開啟。儲存時原檔案保持不變，並在它旁邊或「我的雲端硬碟」中儲存為 Office 檔案。',
  driveReadOnly: '僅檢視',
  driveReadOnlyNote: '你沒有編輯此檔案的權限。儲存時會詢問是否將副本儲存到雲端硬碟。',
  driveUnsupported: '此應用程式無法開啟這種檔案。',
  driveErrNotConnected: 'Google 雲端硬碟已中斷連結。請在設定中重新連結。',
  driveErrNotFound: '找不到檔案。它已被刪除，或此帳戶無法查看。',
  driveErrForbidden: '此帳戶沒有下載此檔案的權限。',
  driveErrTooLarge: '檔案太大，無法開啟。',
  driveErrRateLimit: 'Google 暫時限制了要求。請稍後再試。',
  driveErrNetwork: '無法連線到 Google 雲端硬碟。請檢查網路連線。',
  driveErrDisk: '無法將檔案儲存到這台電腦。',
  drivePick: '從 Google 雲端硬碟選擇',
  drivePicking: '請在瀏覽器中開啟的 Google 視窗裡選擇檔案…',
  drivePickNote:
    'GenOffice 只能開啟你在 Google 視窗中選擇的雲端硬碟檔案。選擇過的檔案會保留在這個清單中。',
  driveTrainingTitle: '在 AI 中使用雲端硬碟檔案之前',
  driveTrainingBody:
    'Google 不允許將雲端硬碟檔案傳送給會用這些檔案訓練模型的 AI 服務。Claude、ChatGPT 和 Codex 的個人方案若未關閉相關設定，可能會將你的對話用於訓練：在 Claude 中前往 設定 → 隱私權，在 ChatGPT 中前往 設定 → 資料控管 → 「為所有人改善模型」。API 金鑰提供者預設不會用 API 資料進行訓練。免費 AI 連結一律不會收到雲端硬碟檔案。',
  driveTrainingAck: '我已在與雲端硬碟檔案搭配使用的 AI 帳戶中關閉模型訓練',
  driveFailTraining: '請先勾選上方關於模型訓練的項目。',
} satisfies Record<keyof typeof zh, string>
