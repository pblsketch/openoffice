import type { zh } from './zh'

export const ja = {
  setHomeKinds: 'ホームの新規作成',
  setHomeKindsDesc:
    'オフにした種類は、ホームの新規作成カードと「新規作成」メニューに表示されません。その種類のファイルはこれまでどおり開けます。',
  homeKindUp: '{name} を上へ',
  homeKindDown: '{name} を下へ',
  homeKindsReset: '最初の並びに戻す',
} satisfies Record<keyof typeof zh, string>
