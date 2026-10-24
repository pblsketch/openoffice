import type { zh } from './zh'

export const zhTW = {
  editUndo: '復原',
  editRedo: '重做',
  editBold: '粗體',
  editItalic: '斜體',
  editReplace: '取代',
  editReplaceWith: '取代為',
  editReplaceOne: '取代',
  editReplaceAll: '全部取代',
  editReplaceDone: '已取代 {count} 處',
  editReplaceSkipped: '已略過唯讀章節中的 {count} 處',
  editReplaceFailed: '有 {count} 處無法取代',
  editReplaceNone: '沒有可取代的內容',
  editReplaceNotHere: '此處無法取代',
  editAutoSave: '自動儲存',
  editAutoSaveTip: '每 30 秒以及視窗失去焦點時自動儲存',
  editUnsaved: '有未儲存的修改',
  editLocked: '翻譯期間無法編輯',
  editRefused: '無法套用此修改',
  editHistoryFailed: '復原記錄與書籍不一致，已清除',
} satisfies Record<keyof typeof zh, string>
