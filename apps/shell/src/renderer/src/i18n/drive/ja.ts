import type { zh } from './zh'

export const ja = {
  driveNav: 'Google ドライブ',
  driveDesc:
    'Google ドライブでファイルを選び、GenOffice で開いて編集します。保存するとドライブに戻します。GenOffice が開けるのは、選んだファイルだけです。',
  driveConnect: 'Google ドライブに接続',
  driveConnecting: 'ブラウザで Google アカウントにログインし、アクセスを許可してください…',
  driveCancel: 'キャンセル',
  driveConnectedAs: '{email} で接続中',
  driveDisconnect: '接続を解除',
  driveDisconnectConfirm:
    'この PC からドライブのログイン情報を削除し、Google に GenOffice のアクセスを取り消すよう求めます。この PC にあるコピーは残ります。',
  driveDisconnectYes: '接続を解除',
  driveNotPersisted:
    'この PC ではログイン情報を暗号化して保存できないため、アプリを閉じると接続が切れます。',
  driveExpired:
    'Google が接続を終了しました。アクセス権が取り消されたか、ログインの有効期限が切れました。もう一度接続してください。',
  driveAiAccess: 'AI がドライブのファイルを探して読む',
  driveAiAccessDesc:
    'オンにすると、エディターの AI がここで選んだドライブのファイルを検索して読めます。読んだ内容は使用中の AI プロバイダーに送られます。AI はドライブのファイルを変更、削除、共有できません。',
  drivePrivacy:
    'ファイルの一覧と内容は、この PC と Google の間だけでやり取りされます。GenOffice の開発者のサーバーは経由しません。',
  driveFailDenied: 'Google に許可されなかったため、接続できませんでした。',
  driveFailScope:
    'ドライブへのアクセスにチェックが入っていなかったため、接続できませんでした。もう一度接続し、ドライブの項目にチェックを入れてください。',
  driveFailTimeout: '10 分以内にログインが完了しませんでした。もう一度お試しください。',
  driveFailNetwork:
    'Google に接続できませんでした。インターネット接続を確認して、もう一度お試しください。',
  driveRecent: '選んだファイル',
  driveSearchPlaceholder: '選んだファイルを検索',
  driveSearchResults: '「{q}」の検索結果',
  driveRefresh: '更新',
  driveNotConnectedTitle: 'Google ドライブに接続していません',
  driveNotConnectedBody:
    '接続すると、ドライブのファイルを選んでここで開いて編集でき、保存するとドライブに戻ります。',
  driveOpenSettings: '設定で接続',
  driveEmpty:
    'まだファイルがありません。「Google ドライブから選ぶ」を押してファイルを選んでください。',
  driveLoading: '読み込み中…',
  driveLoadMore: 'さらに表示',
  driveOpening: '開いています…',
  driveGoogleBadge: 'Google 形式',
  driveGoogleNote:
    'Google 形式のドキュメントは Office ファイルとして開きます。保存しても元のファイルはそのままで、その隣かマイドライブに Office ファイルとして保存します。',
  driveReadOnly: '閲覧のみ',
  driveReadOnlyNote:
    'このファイルを編集する権限がありません。保存するときに、コピーをドライブに保存するか確認します。',
  driveUnsupported: 'このアプリでは開けない形式です。',
  driveErrNotConnected: 'Google ドライブとの接続が切れました。設定でもう一度接続してください。',
  driveErrNotFound: 'ファイルが見つかりません。削除されたか、このアカウントでは表示できません。',
  driveErrForbidden: 'このアカウントにはこのファイルをダウンロードする権限がありません。',
  driveErrTooLarge: 'ファイルが大きすぎて開けません。',
  driveErrRateLimit: 'Google がリクエストを一時的に制限しています。少し待ってからお試しください。',
  driveErrNetwork: 'Google ドライブに接続できませんでした。インターネット接続を確認してください。',
  driveErrDisk: 'ファイルをこの PC に保存できませんでした。',
  drivePick: 'Google ドライブから選ぶ',
  drivePicking: 'ブラウザで開いた Google のウィンドウでファイルを選んでください…',
  drivePickNote:
    'GenOffice が開けるのは、Google のウィンドウで選んだドライブのファイルだけです。一度選んだファイルはこの一覧に残ります。',
  driveTrainingTitle: 'ドライブのファイルを AI で使う前に',
  driveTrainingBody:
    'Google は、ドライブのファイルをモデルの学習に使う AI サービスへ送ることを認めていません。Claude、ChatGPT、Codex の個人向けプランは、オフにしない限り会話を学習に使うことがあります。Claude では 設定 → プライバシー、ChatGPT では 設定 → データコントロール → 「すべての人のためにモデルを改善する」でオフにしてください。API キーのプロバイダーは、既定では API のデータを学習に使いません。無料の AI 接続にはドライブのファイルを送りません。',
  driveTrainingAck: 'ドライブのファイルと一緒に使う AI アカウントで、モデルの学習をオフにしました',
  driveFailTraining: '先に上のモデルの学習の項目にチェックを入れてください。',
} satisfies Record<keyof typeof zh, string>
