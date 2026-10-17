import type { zh } from './zh'

export const ja = {
  docPickTitle: 'GenOffice の文書から添付',
  docPickOpen: '開いている文書',
  docPickRecent: '最近の文書',
  docPickEmpty: '添付できる文書がありません。',
  docPickMissing: 'ファイルが見つかりません。',
  docPickUnsaved: '先に保存してください。',
  docPickUnavailable: '文書の一覧を読み込めませんでした。',
  docPickLimit: '文書は 20 件まで選択できます。',
  docPickSelected: '{n} 件選択',
  docPickAttach: '添付',
  docPickCancel: 'キャンセル',
  docPickWorking: '添付しています…',
} satisfies Record<keyof typeof zh, string>
