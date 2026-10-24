import type { zh } from './zh'

export const ja = {
  aiAssistant: 'AI アシスタント',
  cardChecking: '確認中…',
  cardNotInstalled: '未インストール',
  cardSignedOut: '未ログイン',
  cardSigningIn: 'ログイン中…',
  cardReady: '接続済み',
  cardReadyPlan: '接続済み · {plan}',
  cardMetered: 'ログイン済みですが、サブスクリプションではありません',
  cardMeteredAccepted: '使用中 · 従量課金',
  cardError: '接続を確認できませんでした',
  cardErrNeedsUpdate:
    'この PC の {provider} のプログラムが古すぎます。更新してから、もう一度確認してください。',
  cardErrNeedsUpdateVersion:
    'この PC の {provider} のプログラム（{version}）が古すぎます。{minimum} 以降が必要です。ターミナルで {command} を実行してから、もう一度確認してください。',
  cardErrNeedsUpdatePath: 'このアプリが実行するファイル:',
  cardErrNeedsUpdateWindows:
    'WSL（Ubuntu）や別のフォルダーにある {provider} を更新しても、このファイルは変わりません。Windows PowerShell で {command} を実行してください。',
  cardErrTimeout:
    '{provider} のプログラムから時間内に応答がありませんでした。しばらくしてから、もう一度確認してください。',
  cardErrFailed: '{provider} の確認中に問題が発生しました。もう一度確認してください。',
  actionInstall: 'インストール',
  actionLogin: 'ログイン',
  actionLoginWindow: 'ブラウザーが開きませんか？',
  actionRecheck: '再確認',
  actionAcceptMetered: 'それでも使用',
  actionInstallHelp: '公式のインストール手順',
  actionOpenSettings: '設定を開く',
  actionDismiss: '閉じる',
  actionSwitchAccount: '別のアカウントでログイン',
  actionLogout: 'ログアウト',
  installNote: '{vendor} の公式インストールコマンドが新しいターミナルウィンドウで実行されます。',
  loginNote: '開くログイン画面は {vendor} のものです。',
  signingInBrowserNote:
    '開いたブラウザーで {vendor} のアカウントにログインし、アクセスを許可してください。終わると自動で接続されます。',
  signingInWindowNote:
    'いま開いたログインウィンドウの上部にある案内に従ってください。ブラウザーで新しく開いた {vendor} のログイン画面でログインすると、ウィンドウが自動で閉じて接続されます。前から開いていたログイン画面はもう使えないので、閉じてください。',
  meteredWarning: 'サブスクリプションではなく、使った分だけ料金が発生します。',
  meteredMeaning:
    'API キーまたは従量課金のアカウントでログインしているか、ログイン方法を確認できませんでした。「それでも使用」を選ぶと AI がこの接続で動作し、リクエストのたびにそのアカウントへ課金されます。',
  connectTitle: 'AI を接続して始めましょう',
  connectBody:
    'お持ちの Claude または Codex のサブスクリプションで AI を利用します。API キーは不要です。',
  connectProviderTitle: '{provider} の接続は現在使用できません',
  connectKeyBody:
    '{provider} の設定がまだ完了していません。設定で完了するか、別の AI を選んでください。',
  errNotConnected:
    '接続されている AI がありません。先に Claude または Codex のサブスクリプションか、無料の AI を接続してください。',
  errNotInstalled: 'この PC で {provider} のプログラムが見つかりませんでした。',
  errSignedOut: '{provider} のログインが切れました。もう一度ログインしてから続けてください。',
  errRateLimit: '{provider} のサブスクリプションの上限に達しました。',
  errRateLimitReset:
    '{provider} のサブスクリプションの上限に達しました。{time} にリセットされます。',
  errUnsafeTools:
    '{provider} のプログラムが独自のツールを有効にしたまま起動したため、安全のため実行を停止しました。',
  errMeteredNotAccepted:
    '{provider} の接続は従量課金のログインで、まだ許可されていません。接続設定で「それでも使用」を選ぶと使えます。',
  errNeedsUpdate:
    '{provider} のプログラムが古く、この機能を利用できません。更新してからもう一度お試しください。',
  errHeadlessLimit: '自動呼び出しの 1 時間あたりの上限に達しました。',
  errHeadlessLimitReset:
    '自動呼び出しの 1 時間あたりの上限に達しました。{time} から再び利用できます。',
  connectFreeHint: 'サブスクリプションがなくても、設定から 1 分ほどで無料の AI を接続できます。',
  actionConnectFree: '無料の AI を接続',
  errFreeLimit:
    '今日の無料利用分を使い切りました。明日もう一度お試しいただくか、設定で別の AI を選んでください。',
  errFreeLimitReset: '今日の無料利用分を使い切りました。{time} から再び利用できます。',
  continueWith: '{provider} で続行',
  continueMeteredNote:
    '{provider} の接続はサブスクリプションではありません。続行すると使った分だけ料金が発生します。',
  usageLine: '{percent}% 使用 · {time} にリセット',
  usageWindowFiveHour: '5 時間の上限',
  usageWindowSevenDay: '7 日間の上限',
  noticeTitle: 'サブスクリプションで AI を使う前に',
  noticeSend:
    '文書の内容と会話は、ご自身のアカウントで Anthropic または OpenAI に送信されます。リクエストごとに「AI に任せる」にしたスキルの名前・タイトル・説明も送られ、使うスキルの内容と、AI が読んだスキルのファイルも一緒に送信されます。',
  noticeTraining:
    'その内容が AI の学習に使われるかどうかは、その会社でのご自身のアカウント設定によって決まります。',
  noticeCodexHistory:
    'このアプリは Codex の会話履歴の保存をオフにしますが、Codex が独自の診断ログをこの PC に残す場合があります。',
  noticePdfWholeDocument:
    'PDF エディターでは、AI によるページの読み取りと文書の翻訳で、ページの画像と文書全体のテキストが送信されることがあります。',
  noticeAck: 'わかりました',
  codexNotice:
    'アプリ内で Codex のサブスクリプションを使うことは、OpenAI が公式に推奨している方法ではありません。',
  truncatedNotice: '入力が長すぎたため、一部を切り詰めて送信しました。',
  pickerAuto: '自動',
  pickerAutoUsing: '自動 · {provider}',
  pickerAutoUsingModel: '自動 · {provider} · {model}',
  pickerDefaultModel: '既定のモデル',
  pickerDefaultModelNamed: '既定のモデル · {model}',
  pickerSubscription: 'サブスクリプション',
  pickerPaid: '有料',
  pickerPaidTitle: 'サブスクリプション対象外で、使った分だけ課金されます',
  pickerNotConnected: 'AI を接続',
  guideQuestion: 'いま使っている AI はありますか？',
  guidePathClaudeTitle: 'Claude の有料サブスクリプションがあります',
  guidePathClaudeBody:
    'Pro または Max プランが必要です。無料の Claude アカウントでは接続できません。',
  guidePathCodexTitle: 'ChatGPT を使っています',
  guidePathCodexBody:
    'ChatGPT のアカウントで OpenAI の Codex プログラムにログインして使います。無料プランで使える量はわずかです。',
  guidePathFreeTitle: 'まだありません',
  guidePathFreeBody:
    '無料の AI を 1 分ほどで接続できます。無料で使っている間に送った内容は、その会社の AI の改善に使われることがあります。',
  guideBack: '別の方法を選ぶ',
  guideBadgeReady: '接続済み',
  guideBadgeInstalled: 'インストール済み',
  guideBadgeCheck: '要確認',
  guideStepsLabel: '接続の手順',
  stepInstall: 'プログラムのインストール',
  stepLogin: 'ログイン',
  stepReady: '接続完了',
  installReturnNote:
    'そのウィンドウでインストールが終わったら、この画面に戻ってください。アプリが自動でもう一度確認します。',
  loginHowNote:
    '押すとブラウザーが開きます。{vendor} のアカウントでログインして「許可」を押すと、自動で接続されます。',
  signingInStalledNote:
    'ブラウザーにログイン画面が開かなかった場合は、下のボタンでログインウィンドウを開いてください。ブラウザーでログインしている途中なら、ボタンは押さずにそのまま最後まで進めてください。ボタンを押すと、進めていたログインは止まり、最初からやり直しになります。',
  actionLoginWindowOpen: 'ログインウィンドウを開く',
  loginWindowTitle: '{provider} ログイン',
  loginWindowIntro:
    'このウィンドウは {provider} のプログラムのログインウィンドウです。この下に続く英語の文章は、{provider} のプログラムが表示する案内です。',
  loginWindowStepBrowser:
    'ブラウザーで {vendor} のログイン画面が開いたら、ログインしてアクセスを許可してください。終わるとこのウィンドウは自動で閉じます。',
  loginWindowStepAddress:
    'ブラウザーが開かない場合は、下にある https:// で始まるアドレスをマウスでドラッグして選択し、右クリックしてコピーしてください。そのアドレスをブラウザーのアドレスバーに貼り付けると、ログイン画面が開きます。',
  loginWindowStepCode:
    'ログイン後にブラウザーにコードが表示されたら、コード全体をコピーしてください（コピーボタンがあればそれを押してください）。このウィンドウ内で一度右クリックして貼り付け、Enter キーを押してください。貼り付けたコードが画面に表示されないのは正常です。',
  loginWindowStepInvalid:
    '"Invalid code" と表示された場合は、コードが最後までコピーされていません。ウィンドウを閉じずに、コードをもう一度コピーして貼り付けてください。',
  loginWindowClosing:
    'ログインが完了しませんでした。上に表示された内容を確認したら、Enter キーを押してこのウィンドウを閉じてください。もう一度試すには、ログインボタンをもう一度押してください。',
  actionCancelLogin: 'ログインをキャンセル',
  actionUpdate: '更新',
  updateNote:
    '押すと {vendor} の公式の更新が新しいウィンドウで実行されます。そのウィンドウで更新が終わったら、この画面に戻ってください。',
  guideInfoHint:
    'それでもうまくいきませんか？接続情報をコピーして、手伝ってくれる人に送ってください。アカウントとファイルのパスは含まれません。',
  actionCopyInfo: 'サポート用の情報をコピー',
  copyInfoDone: 'コピーしました',
  actionConnectHelp: '手順を画面で見る（韓国語のページ）',
} satisfies Record<keyof typeof zh, string>
