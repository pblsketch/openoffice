import type { zh } from './zh'

export const zhTW = {
  title: '有未儲存內容的文件',
  intro: '這些文件還留有未儲存的內容。請為每份文件選擇還原或捨棄。捨棄的內容無法找回。',
  restore: '還原',
  discard: '捨棄',
  restoreAll: '全部還原',
  discardAll: '全部捨棄',
  confirm: '確定',
  later: '稍後決定',
  laterHint: '關閉此清單不會刪除任何內容，之後會再次詢問。',
  untitledFolder: '從未儲存過的新文件',
  lastCopy: '保留於 {time}',
  changedAfter: '檔案在此之後被修改過',
  changedAfterNote: '可能是其他程式或雲端同步修改了它。為保留檔案目前的內容，預設選擇了「捨棄」。',
  missing: '找不到原始檔案',
  missingNote: '還原後會以未命名的新文件開啟，儲存時預設使用原來的位置。',
  choiceLabel: '{name} 的處理方式',
} satisfies Record<keyof typeof zh, string>
