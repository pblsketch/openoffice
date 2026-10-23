import type { zh } from './zh'

export const ja = {
  loading: '描画を開いています…',
  openFailedTitle: 'この描画を開けません',
  openFailedNotDrawing: 'このファイルは Excalidraw の描画ではありません。',
  openFailedUnreadable: 'このファイルを読み込めません。破損している可能性があります。',
  openFailedTooLarge: 'ファイルが大きすぎて開けません。',
  openFailedError: 'ファイルを開く際に問題が発生しました。',
  saveFailed: '描画を保存できませんでした。',
  picturesMissing: 'この描画で使われている画像 {count} 件がノートの保管庫に見つかりません。',
  picturesNotInNote: 'Obsidian の描画には、ここではまだ画像を追加できません。',
  linkNotOpened: 'このリンクは開けません。',
  autoSave: '自動保存',
} satisfies Record<keyof typeof zh, string>
