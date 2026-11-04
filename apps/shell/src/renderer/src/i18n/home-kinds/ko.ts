import type { zh } from './zh'

export const ko = {
  setHomeKinds: '홈 화면의 새 문서',
  setHomeKindsDesc:
    '끈 종류는 홈의 새 문서 카드와 새로 만들기 메뉴에 나오지 않습니다. 그 종류의 파일은 지금처럼 열립니다.',
  homeKindUp: '{name} 위로',
  homeKindDown: '{name} 아래로',
  homeKindsReset: '처음 순서로',
} satisfies Record<keyof typeof zh, string>
