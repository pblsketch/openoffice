import type { zh } from './zh'

export const ko = {
  title: '저장하지 않은 내용이 남아 있는 문서',
  intro:
    '아래 문서에 저장하지 않은 내용이 남아 있습니다. 문서마다 되살릴지 버릴지 고르세요. 버린 내용은 되찾을 수 없습니다.',
  restore: '되살리기',
  discard: '버리기',
  restoreAll: '모두 되살리기',
  discardAll: '모두 버리기',
  confirm: '확인',
  later: '나중에 정하기',
  laterHint: '이 목록을 닫으면 아무것도 지우지 않고 나중에 다시 묻습니다.',
  untitledFolder: '저장한 적 없는 새 문서',
  lastCopy: '{time}에 남긴 내용',
  changedAfter: '파일이 그 뒤에 바뀌었습니다',
  changedAfterNote:
    '다른 프로그램이나 클라우드 동기화가 고쳤을 수 있습니다. 지금 파일을 그대로 두도록 처음에는 “버리기”로 골라 두었습니다.',
  missing: '원본 파일을 찾을 수 없습니다',
  missingNote: '되살리면 제목 없는 새 문서로 열립니다. 저장할 때 원래 위치가 처음 값으로 나옵니다.',
  choiceLabel: '{name} 처리',
} satisfies Record<keyof typeof zh, string>
