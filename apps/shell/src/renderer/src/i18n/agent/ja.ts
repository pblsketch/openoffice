import type { zh } from './zh'

export const ja = {
  windowTitle: 'エージェント',
  homeCardSub: 'フォルダーで Claude Code や Codex を使って作業',
  intro:
    'エージェントは、選んだフォルダーで Claude Code または Codex を実行します。フォルダー内のファイルを読み、新しいファイルを作り、スキルを使い、スクリプトを実行し、GenOffice で開いている文書を編集できます。',
  folderLabel: 'プロジェクトフォルダー',
  folderPick: 'フォルダーを選ぶ…',
  folderNone: 'フォルダーが選ばれていません',
  recentLabel: '最近のフォルダー',
  providerLabel: 'プログラム',
  providerClaude: 'Claude Code',
  providerCodex: 'Codex',
  providerClaudeNote:
    'Windows では、許可したコマンドは隔離されずに実行され、PC 全体とインターネットにアクセスできます。',
  providerCodexNote:
    'コマンドは Codex の隔離された環境で実行されます。書き込めるのはプロジェクトフォルダーだけで、インターネットには接続できません。',
  providerBlocked:
    'まだ使えません。Codex が自分のログインファイルを読めないようにする方法がまだ見つかっていません。',
  connChecking: '接続を確認しています…',
  connUnavailable: '接続されていません。設定 → AI でサインインしてください。',
  connMetered: '許可した従量課金のログインで接続しています。',
  modeLabel: '確認するタイミング',
  modeAskCommands: 'コマンドの実行ごとに確認',
  modeAskCommandsDesc:
    'プロジェクトフォルダー内のファイルの読み書きはそのまま進めます。コマンドやスクリプトの実行は先に確認します。',
  modeAskWrites: '書き込みとコマンドの実行ごとに確認',
  modeAskWritesDesc:
    '読み取りだけはそのまま進めます。ファイルの書き込みとコマンドの実行は、どちらも先に確認します。',
  modeTrust: 'このプロジェクトを信頼する',
  modeTrustDesc:
    '確認しません。Codex はそれでも隔離された環境の中だけで動きます。Claude Code は、あなたの代わりに自身のチェック機能が操作ごとに確認します。',
  warningTitle: '始める前に',
  warningCommands:
    'エージェントが実行するコマンドは、ファイルを変更したりインターネットを使ったりできます。他の人から受け取った文書には、隠れた指示が含まれていることがあります。',
  warningRedaction:
    'AI から隠した部分が隠れたままなのは、GenOffice で開いている文書の中だけです。エージェントがフォルダーから直接読むファイルは、そのまま送られます。',
  warningUsage:
    'エージェントは何段階にも分けて作業するため、AI パネルよりも多くプランの上限を使います。',
  warningAccept: '理解しました',
  start: '開始',
  starting: '開始しています…',
  stop: '停止',
  newSession: '新しいセッション',
  send: '送信',
  inputPlaceholder: 'エージェントに何をさせますか？',
  you: 'あなた',
  agent: 'エージェント',
  startedLine: '{folder} で {program} を開始しました',
  skillsLine: '{n} 個のスキルを使えます',
  skillsLineOne: '{n} 個のスキルを使えます',
  toolRunning: '作業中',
  toolDone: '完了',
  toolFailed: '失敗',
  toolDenied: '拒否済み',
  actRead: '読み取り',
  actWrite: '書き込み',
  actCommand: '実行',
  actAppTool: '開いている文書を編集',
  actSkill: 'スキルを使用',
  actOther: 'ツールを使用',
  openFile: '開く',
  permTitle: 'エージェントが次の許可を求めています：',
  permCommand: 'このコマンドを実行',
  permWrite: 'このファイルに書き込み',
  permRead: 'プロジェクトフォルダー外のファイルを読み取り',
  permOther: 'ツール「{tool}」を使用',
  permReason: '理由：{reason}',
  permAllow: '許可',
  permDeny: '拒否',
  turnFailed: 'エージェントはこの依頼を完了できませんでした。',
  ended: 'セッションは終了しました。',
  errBadFolder:
    'このフォルダーは使えません。自分の作業用フォルダーを選んでください。ドライブ全体、ホームフォルダー、サインイン情報やアプリのデータのフォルダーは選べません。',
  errNotConnected:
    'このプログラムは接続されていません。設定 → AI でサインインしてから、もう一度お試しください。',
  errNotAccepted: '先に上の注意事項を読んで確認してください。',
  errUnsafeTools:
    'プログラムがアプリの渡していないツールを持った状態で起動したため、停止しました。',
  errRateLimit: 'プランの上限に達しました。しばらくしてからもう一度お試しください。',
  errSignedOut: 'プログラムがサインアウトしています。設定 → AI でサインインしてください。',
  errMetered: 'プログラムが、許可していない従量課金のログインでサインインしています。',
  errSandboxUnavailable:
    'このPCでは、Codex がコマンドを閉じ込めるサンドボックスを開けないため、起動しませんでした。Windows を最新に更新するか、Claude Code を選んでください。',
  errNeedsUpdate:
    'プログラムが古いため、エージェントモードを使えません。更新してから、もう一度お試しください。',
  errNotInstalled: 'プログラムがインストールされていません。',
  errGeneric: '問題が発生しました。もう一度お試しください。',
  documentsUnprotected:
    'セッション開始後に開いた {n} 件の文書は、プログラム自身の書き込み保護の対象外です。保護するにはセッションを停止して開始し直してください。',
} satisfies Record<keyof typeof zh, string>
