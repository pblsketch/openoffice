import type { zh } from './zh'

export const zhTW = {
  docPickTitle: '從 GenOffice 文件附加',
  docPickOpen: '已開啟的文件',
  docPickRecent: '最近的文件',
  docPickEmpty: '沒有可附加的文件。',
  docPickMissing: '找不到檔案。',
  docPickUnsaved: '請先儲存。',
  docPickUnavailable: '無法讀取文件清單。',
  docPickLimit: '最多只能選擇 20 份文件。',
  docPickSelected: '已選取 {n} 份',
  docPickAttach: '附加',
  docPickCancel: '取消',
  docPickWorking: '正在附加…',
} satisfies Record<keyof typeof zh, string>
