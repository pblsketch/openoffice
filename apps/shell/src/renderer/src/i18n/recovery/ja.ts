import type { zh } from './zh'

export const ja = {
  title: '保存されていない内容が残っているドキュメント',
  intro:
    'これらのドキュメントには保存されていない内容が残っています。ドキュメントごとに復元するか破棄するかを選んでください。破棄した内容は元に戻せません。',
  restore: '復元',
  discard: '破棄',
  restoreAll: 'すべて復元',
  discardAll: 'すべて破棄',
  confirm: '確定',
  later: '後で決める',
  laterHint: 'この一覧を閉じても何も削除されません。後でもう一度確認します。',
  untitledFolder: '一度も保存していない新しいドキュメント',
  lastCopy: '{time} に保持',
  changedAfter: 'その後ファイルが変更されています',
  changedAfterNote:
    '別のプログラムやクラウド同期で変更された可能性があります。現在のファイルを残すため、最初は「破棄」を選んでいます。',
  missing: '元のファイルが見つかりません',
  missingNote:
    '復元すると無題の新しいドキュメントとして開きます。保存するときは元の場所が初期値になります。',
  choiceLabel: '{name} の扱い',
} satisfies Record<keyof typeof zh, string>
