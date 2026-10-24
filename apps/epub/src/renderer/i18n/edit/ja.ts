import type { zh } from './zh'

export const ja = {
  editUndo: '元に戻す',
  editRedo: 'やり直し',
  editBold: '太字',
  editItalic: '斜体',
  editReplace: '置換',
  editReplaceWith: '置換後の文字',
  editReplaceOne: '置換',
  editReplaceAll: 'すべて置換',
  editReplaceDone: '{count} か所を置換しました',
  editReplaceSkipped: '読み取り専用の章の {count} か所はスキップしました',
  editReplaceFailed: '{count} か所は置換できませんでした',
  editReplaceNone: '置換する箇所がありません',
  editReplaceNotHere: 'この箇所は置換できません',
  editAutoSave: '自動保存',
  editAutoSaveTip: '30 秒ごとと、ウィンドウからフォーカスが外れたときに自動保存します',
  editUnsaved: '未保存の変更があります',
  editLocked: '翻訳中は編集できません',
  editRefused: 'この変更を適用できませんでした',
  editHistoryFailed: '元に戻す履歴が本と一致しなくなったため消去しました',
} satisfies Record<keyof typeof zh, string>
