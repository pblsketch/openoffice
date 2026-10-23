import type { zh } from './zh'

export const zhTW = {
  loading: '正在開啟繪圖…',
  openFailedTitle: '無法開啟此繪圖',
  openFailedNotDrawing: '此檔案不是 Excalidraw 繪圖。',
  openFailedUnreadable: '無法讀取此檔案，它可能已損毀。',
  openFailedTooLarge: '此檔案太大，無法開啟。',
  openFailedError: '開啟檔案時發生問題。',
  saveFailed: '無法儲存繪圖。',
  picturesMissing: '此繪圖使用的 {count} 張圖片在筆記所在的保險庫中找不到。',
  picturesNotInNote: '目前還無法在這裡為 Obsidian 繪圖加入圖片。',
  linkNotOpened: '無法開啟此連結。',
  autoSave: '自動儲存',
} satisfies Record<keyof typeof zh, string>
