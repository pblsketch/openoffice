import type { zh } from './zh'

export const zhTW = {
  setHomeKinds: '首頁上的新文件',
  setHomeKindsDesc: '關閉的類型不會出現在首頁的新文件卡片和「新增」選單中。這類檔案仍可照常開啟。',
  homeKindUp: '上移 {name}',
  homeKindDown: '下移 {name}',
  homeKindsReset: '恢復原始順序',
} satisfies Record<keyof typeof zh, string>
