import type { zh } from './zh'

export const ja = {
  button: '共同作業',
  dialogTitle: '共同作業',
  tabShare: 'このドキュメントを共有',
  tabJoin: '参加',
  nameLabel: '自分の名前',
  nameHint: '他の参加者の画面で、あなたのカーソルの横に表示されます。',
  colorLabel: '自分の色',
  colorChoice: '色 {n}',
  shareIntro:
    '同じネットワーク（LAN）にいる人が PIN を入力すると、このドキュメントを一緒に表示・編集できます。ファイルはこの PC にのみ保存されます。',
  shareStart: '共有を開始',
  shareStarting: '開始しています…',
  shareStop: '共有を停止',
  pinLabel: 'PIN',
  pinNew: '新しい PIN',
  pinChanged:
    '間違った PIN の入力が多すぎたため、新しい PIN に変更しました。すでに参加している人はそのまま参加できます。',
  addressLabel: 'この PC のアドレス',
  peopleLabel: '参加者',
  nobodyYet: 'まだ誰も参加していません。',
  you: '自分',
  hostBadge: '共有者',
  joinIntro:
    '共有者から伝えられた PIN を入力してください。同じネットワークで見つかったドキュメントを選ぶか、アドレスを直接入力します。',
  searching: '同じネットワークで共有中のドキュメントを探しています…',
  foundLabel: '見つかったドキュメント',
  foundBy: '{name} さんが共有',
  addressInput: 'アドレス',
  addressPlaceholder: '例: 192.168.0.12',
  pinInput: 'PIN（6 桁の数字）',
  join: '参加',
  joining: '接続しています…',
  close: '閉じる',
  leave: '退出',
  errPin: 'PIN が正しくありません。',
  errLocked: '間違った PIN の入力が多すぎます。この PC からは 10 分間再試行できません。',
  errFull: '参加できる人数の上限に達しています。',
  errVersion:
    '共有者の PC とアプリのバージョンが異なるため、接続できません。両方の PC を同じバージョンに更新してください。',
  errUnreachable:
    'そのアドレスに接続できませんでした。アドレス、ネットワーク、共有側 PC のファイアウォール設定を確認してください。',
  errTimeout: '共有側の PC が応答しません。',
  errInvalid: 'アドレスと PIN をもう一度確認してください。',
  errUnavailable: 'このドキュメントをこの PC で開けませんでした。',
  errShareNetwork:
    'この PC で共有を開始できませんでした。他のプログラムがネットワークをブロックしていないか確認してください。',
  errShareTooLarge: 'ドキュメントが大きすぎるため、共有できません。',
  errShareBusy: 'このタブはすでに共同作業中です。',
  errShareSaveFirst: '保存されていない変更があります。先に保存してから共有してください。',
  errShareEncrypted: 'パスワードで保護されたドキュメントは共有できません。',
  errShareUnsupported: 'このドキュメントは現在共有できません。',
  endedByHost:
    '共有者が共同作業を終了しました。このドキュメントは、この PC 上の未保存のコピーになりました。',
  endedLost:
    '共有側の PC との接続が切れました。このドキュメントは、この PC 上の未保存のコピーになりました。',
  endedLeft:
    '共同作業から退出しました。このドキュメントは、この PC 上の未保存のコピーになりました。',
  endedHostStopped: '共有を停止しました。',
  guestSaveBlocked: '共同作業中は、共有者がファイルを保存します。',
  guestBlocked: '共同作業中はこの機能を使用できません。',
  hostBlocked: '他の人が参加している間は、この機能を使用できません。',
  viewOnly: 'この形式では共有者だけが編集でき、参加者はリアルタイムで閲覧します。',
  lanNotice:
    'やり取りする内容は暗号化され、PIN を入力した人だけが読めます。共有中は、あなたの名前と文書のタイトルが同じネットワークに表示されます。',
  firewallHint:
    '初めて共有するときに Windows ファイアウォールの確認が表示されたら、プライベート ネットワークでの通信を許可してください。',
  statusHosting: '共有中 · {count} 人',
  statusGuest: '{name} さんのドキュメントに参加中',
  dismiss: 'わかりました',
} satisfies Record<keyof typeof zh, string>
